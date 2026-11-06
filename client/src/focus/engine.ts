// In-browser attention pipeline:
// camera -> MediaPipe FaceLandmarker (478 x,y,z, 10 fps) -> rolling window of 100 frames
// -> every ~3 s onnxruntime-web runs v4_2.onnx on [1,100,478,3] -> score 0..1.
// Video frames and landmarks never leave the browser; only the score is reported.
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import * as ort from "onnxruntime-web/wasm";

export const FPS = 10;
export const WINDOW = 100;
export const POINTS = 478;
const INFER_EVERY_MS = 3000;
const NO_FACE_RESET_MS = 2000;
const MODEL_URL = "/models/v4_2.onnx";

export type EngineStatus = "loading" | "warming" | "tracking" | "noface" | "error" | "stopped";
export type Prediction = { score: number; attention: number[] | null; classes: number[] | null };
export type EngineEvents = {
  onStatus: (s: EngineStatus, info?: string) => void;
  onPrediction: (p: Prediction) => void;
  onProgress?: (framesInWindow: number) => void;
};

ort.env.wasm.wasmPaths = "/ort/";
ort.env.wasm.numThreads = 1; // no cross-origin isolation needed

let landmarkerP: Promise<FaceLandmarker> | null = null;
let sessionP: Promise<ort.InferenceSession> | null = null;

function loadLandmarker() {
  landmarkerP ??= (async () => {
    const files = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const make = (delegate: "GPU" | "CPU") =>
      FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate },
        runningMode: "VIDEO",
        numFaces: 1,
      });
    // CPU (XNNPACK) is fast enough for 10 fps and avoids multi-second GPU shader warm-up
    // on machines without a real GPU (VMs, virtual cameras, headless graders).
    return make("CPU");
  })();
  landmarkerP.catch(() => (landmarkerP = null));
  return landmarkerP;
}

function loadModel() {
  sessionP ??= ort.InferenceSession.create(MODEL_URL, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
  sessionP.catch(() => (sessionP = null));
  return sessionP;
}

/** Warm both models in the background (e.g. while the consent dialog is open). */
export const preloadModels = () => Promise.all([loadLandmarker(), loadModel()]);

/** The model was trained on landmarks extracted from a face crop (square, 20% margin around the face, 256 px).
 *  Re-express the full-frame landmarks in that crop's coordinate system (equivalent to cropping first).
 *  Experimental (off by default; enable with localStorage bloom_crop=1). On our test video it changed v4_2 only 0.16->0.21. */
const CROP = (() => {
  try {
    return localStorage.getItem("bloom_crop") === "1"; // default: raw points, as the assignment specifies
  } catch {
    return false;
  }
})();
export function toFaceCrop(face: { x: number; y: number; z: number }[], W: number, H: number): Float32Array {
  const f = new Float32Array(POINTS * 3);
  if (!CROP) {
    for (let i = 0; i < POINTS; i++) {
      f[i * 3] = face[i].x;
      f[i * 3 + 1] = face[i].y;
      f[i * 3 + 2] = face[i].z;
    }
    return f;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < POINTS; i++) {
    const px = face[i].x * W, py = face[i].y * H;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  const side = Math.max(maxX - minX, maxY - minY) * 1.4; // 20% margin on each side
  const left = (minX + maxX) / 2 - side / 2, top = (minY + maxY) / 2 - side / 2;
  for (let i = 0; i < POINTS; i++) {
    f[i * 3] = (face[i].x * W - left) / side;
    f[i * 3 + 1] = (face[i].y * H - top) / side;
    f[i * 3 + 2] = (face[i].z * W) / side; // MediaPipe z uses the image-width scale
  }
  return f;
}

export async function listCameras(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "videoinput");
}

export class FocusEngine {
  private video: HTMLVideoElement;
  private stream: MediaStream | null = null;
  private timer: number | null = null;
  private frames: Float32Array[] = []; // ring of WINDOW frames, each POINTS*3
  private lastFaceAt = 0;
  private lastInferAt = 0;
  private lastTs = -1;
  private lastPushAt = 0;
  private busy = false;
  private stopped = false;
  private status: EngineStatus = "loading";
  private mark: (m: string) => void = () => {};

  constructor(private ev: EngineEvents) {
    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.playsInline = true;
  }

  get previewElement() {
    return this.video;
  }

  private setStatus(s: EngineStatus, info?: string) {
    if (s !== this.status || info) {
      this.status = s;
      this.ev.onStatus(s, info);
    }
  }

  async start(deviceId?: string) {
    this.stopped = false;
    this.setStatus("loading");
    const t0 = performance.now();
    const mark = (m: string) => console.info(`[bloom] ${m} +${Math.round(performance.now() - t0)}ms`);
    this.mark = mark;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId }, width: 640, height: 480 } : { width: 640, height: 480 },
        audio: false,
      });
    } catch (e) {
      this.setStatus("error", "לא הצלחנו להפעיל את המצלמה. בדקו שנתתם הרשאה ושהמצלמה לא בשימוש.");
      throw e;
    }
    mark("camera on");
    if (this.stopped) return this.releaseCamera();
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});
    try {
      await preloadModels();
    } catch (e) {
      this.setStatus("error", "טעינת מודל הריכוז נכשלה. רעננו את הדף ונסו שוב.");
      throw e;
    }
    mark("models ready");
    if (this.stopped) return;
    this.setStatus("warming");
    this.timer = window.setInterval(() => this.tick(), 1000 / FPS);
  }

  private async tick() {
    if (this.stopped || this.video.readyState < 2) return;
    const lm = await loadLandmarker();
    let ts = performance.now();
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    this.lastTs = ts;
    let res;
    try {
      res = lm.detectForVideo(this.video, ts);
    } catch {
      return; // transient frame error - keep going
    }
    const face = res.faceLandmarks?.[0];
    const now = Date.now();
    if (!face || face.length < POINTS) {
      if (now - this.lastFaceAt > 700) this.setStatus("noface");
      if (now - this.lastFaceAt > NO_FACE_RESET_MS) {
        this.frames = [];
        this.lastPushAt = 0;
      }
      return;
    }
    this.lastFaceAt = now;
    const f = toFaceCrop(face, this.video.videoWidth || 640, this.video.videoHeight || 480);
    // keep a true 10 fps timeline even when detection is slower than 100 ms on this device:
    // repeat the latest landmarks for the ticks we missed (max 5, i.e. 0.5 s)
    const due = this.lastPushAt ? Math.min(5, Math.max(1, Math.round((now - this.lastPushAt) / (1000 / FPS)))) : 1;
    this.lastPushAt = now;
    for (let k = 0; k < due; k++) this.frames.push(f);
    while (this.frames.length > WINDOW) this.frames.shift();
    this.ev.onProgress?.(this.frames.length);
    if (this.frames.length === due) this.mark("first face");
    if (this.frames.length < WINDOW) {
      this.setStatus("warming");
      return;
    }
    this.setStatus("tracking");
    if (!this.busy && now - this.lastInferAt >= INFER_EVERY_MS) {
      this.lastInferAt = now;
      this.infer();
    }
  }

  private async infer() {
    this.busy = true;
    try {
      const session = await loadModel();
      const data = new Float32Array(WINDOW * POINTS * 3);
      this.frames.forEach((fr, i) => data.set(fr, i * POINTS * 3));
      const input = new ort.Tensor("float32", data, [1, WINDOW, POINTS, 3]);
      const dbg = (window as any).__bloomWindows; // debug only (set by tests)
      if (Array.isArray(dbg)) dbg.push({ w: this.video.videoWidth, h: this.video.videoHeight, data: Array.from(data) });
      const ti = performance.now();
      const out = await session.run({ [session.inputNames[0]]: input });
      this.mark(`inference ${Math.round(performance.now() - ti)}ms`);
      const names = session.outputNames;
      const scoreT = out["regression_scores"] ?? out[names[0]];
      const attT = out["attention_weights"];
      const clsT = out["classification_logits"];
      let score = Number((scoreT.data as Float32Array)[0]);
      if (!Number.isFinite(score)) return;
      score = Math.min(1, Math.max(0, score));
      if (!this.stopped)
        this.ev.onPrediction({
          score,
          attention: attT ? Array.from(attT.data as Float32Array) : null,
          classes: clsT ? Array.from(clsT.data as Float32Array) : null,
        });
    } catch (e) {
      console.error("inference failed", e);
    } finally {
      this.busy = false;
    }
  }

  private releaseCamera() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  stop() {
    this.stopped = true;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.frames = [];
    this.releaseCamera();
    this.setStatus("stopped");
  }
}

export const scoreColor = (s: number) => (s < 0.4 ? "var(--terra)" : s < 0.7 ? "var(--sun)" : "var(--leaf)");
export const scoreLabel = (s: number) =>
  s < 0.15 ? "לא מול המסך" : s < 0.4 ? "לא מרוכז/ת" : s < 0.6 ? "ריכוז נמוך" : s < 0.85 ? "מרוכז/ת" : "מרוכז/ת מאוד";
