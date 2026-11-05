import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";
import { EngineStatus, FocusEngine, listCameras, Prediction, preloadModels } from "./engine";
import { ConsentDialog, ScoreChart, ScoreMeter } from "./widgets";

type Phase = "idle" | "consent" | "declined" | "running" | "ended";
type Summary = { reading_count: number; average_score: number | null };

const STATUS_TEXT: Record<EngineStatus, string> = {
  loading: "מפעילים מצלמה וטוענים את המודל…",
  warming: "אוספים 10 שניות ראשונות של נתונים…",
  tracking: "מודדים ריכוז",
  noface: "לא זוהו פנים",
  error: "שגיאה",
  stopped: "המדידה הופסקה",
};

export type SessionHooks = {
  /** current position in the content (seconds / text offset) */
  getPosition: () => number;
  onPrediction?: (p: Prediction) => void;
  onStatus?: (s: EngineStatus) => void;
};

export default function SessionPanel({ contentId, hooks }: { contentId: string; hooks: SessionHooks }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<EngineStatus>("loading");
  const [error, setError] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const engine = useRef<FocusEngine | null>(null);
  const sessionId = useRef<string | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;

  const endOnServer = async () => {
    const id = sessionId.current;
    sessionId.current = null;
    if (!id) return null;
    return api<Summary>(`/api/sessions/${id}/end`, { method: "POST" });
  };

  // warm MediaPipe + ONNX while the user is still reading the page -> first score sooner
  useEffect(() => {
    const t = window.setTimeout(() => preloadModels().catch(() => {}), 300);
    return () => clearTimeout(t);
  }, []);

  // leaving the page mid-session: release the camera and close the session
  useEffect(
    () => () => {
      engine.current?.stop();
      endOnServer().catch(() => {});
    },
    [],
  );

  const startEngine = async (deviceId?: string) => {
    engine.current?.stop();
    const e = new FocusEngine({
      onStatus: (s, info) => {
        if (s === "stopped") return;
        setStatus(s);
        hooksRef.current.onStatus?.(s);
        if (s === "noface") setScore(null);
        if (s === "error" && info) setError(info);
      },
      onPrediction: (p) => {
        setScore(p.score);
        setHistory((h) => [...h.slice(-59), p.score]);
        hooksRef.current.onPrediction?.(p);
        const id = sessionId.current;
        if (!id) return;
        const position = Math.max(0, Math.round(hooksRef.current.getPosition() * 10) / 10);
        api(`/api/sessions/${id}/readings`, {
          method: "POST",
          body: { position, score: Number(p.score.toFixed(4)), attention: p.attention?.slice(0, 100) ?? null },
        }).catch((err: ApiError) => {
          if (err.status === 409) setError("הסשן כבר הסתיים");
        });
      },
    });
    engine.current = e;
    if (preview.current) {
      preview.current.replaceChildren(e.previewElement);
    }
    await e.start(deviceId);
    const cams = await listCameras().catch(() => []);
    setCameras(cams);
    if (!deviceId) {
      const track = (e.previewElement.srcObject as MediaStream | null)?.getVideoTracks()[0];
      setCameraId(track?.getSettings().deviceId ?? cams[0]?.deviceId ?? "");
    }
  };

  const agree = async () => {
    setError("");
    setScore(null);
    setHistory([]);
    setSummary(null);
    setStatus("loading");
    setPhase("running");
    try {
      const s = await api<{ id: string }>("/api/sessions", { method: "POST", body: { content_id: contentId } });
      sessionId.current = s.id;
      await startEngine();
    } catch (err) {
      if (!(err instanceof ApiError)) setStatus("error");
      else setError(err.message);
    }
  };

  const end = async () => {
    setBusy(true);
    engine.current?.stop();
    engine.current = null;
    try {
      setSummary(await endOnServer());
      setPhase("ended");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const changeCamera = async (id: string) => {
    setCameraId(id);
    setScore(null);
    try {
      await startEngine(id);
    } catch {
      /* status already shows the error */
    }
  };

  return (
    <section className="card session" aria-label="סשן מדידה">
      {phase === "consent" && <ConsentDialog onAgree={agree} onDecline={() => setPhase("declined")} />}

      {(phase === "idle" || phase === "declined" || phase === "ended") && (
        <div className="stack">
          {phase === "declined" && (
            <p className="alert warn" role="status">
              בחרת לצפות בלי מדידה — זה בסדר גמור. בלי מצלמה לא נוכל למדוד ריכוז או לשמור סשן בהיסטוריה. אפשר להתחיל
              מדידה בכל רגע.
            </p>
          )}
          {phase === "ended" && summary && (
            <div className="alert ok" role="status">
              <strong>הסשן הסתיים ונשמר בהיסטוריה.</strong>{" "}
              {summary.reading_count > 0
                ? `${summary.reading_count} מדידות · ממוצע ${summary.average_score?.toFixed(2)}`
                : "לא נאספו מדידות בסשן הזה."}{" "}
              <Link to="/history">להיסטוריה</Link>
            </div>
          )}
          <button
            className="btn big"
            onClick={() => {
              preloadModels().catch(() => {});
              setPhase("consent");
            }}
          >
            {phase === "ended" ? "התחל סשן חדש" : "התחל סשן"}
          </button>
        </div>
      )}

      {phase === "running" && (
        <div className="stack">
          <div className="row between">
            <span className={`status-chip ${status}`} role="status" data-testid="engine-status">
              {status === "noface" ? "⚠️ " : ""}
              {STATUS_TEXT[status]}
            </span>
            <button className="btn danger" onClick={end} disabled={busy}>
              {busy ? "מסיים…" : "סיים סשן"}
            </button>
          </div>
          {status === "noface" && (
            <p className="alert warn" role="alert">לא זוהו פנים — שבו מול המצלמה. המדידה תמשיך אוטומטית.</p>
          )}
          <ScoreMeter score={score} />
          {score !== null && score < 0.4 && (
            <p className="alert error" role="alert">הריכוז ירד — נסו לחזור לתוכן 🙂</p>
          )}
          {error && <p className="alert error" role="alert">{error}</p>}
          <div className="cam-row">
            <div className="preview" ref={preview} aria-label="תצוגה מקדימה של המצלמה" />
            <label className="cam-select">
              מצלמה
              <select value={cameraId} onChange={(e) => changeCamera(e.target.value)}>
                {cameras.length === 0 && <option value="">מצלמת ברירת מחדל</option>}
                {cameras.map((c, i) => (
                  <option key={c.deviceId || i} value={c.deviceId}>
                    {c.label || `מצלמה ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {history.length > 1 && <ScoreChart points={history} height={110} />}
        </div>
      )}
    </section>
  );
}
