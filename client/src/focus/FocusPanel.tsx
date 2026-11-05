import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";
import Plant, { Mood, Species, STAGE_NAME } from "../bloom/Plant";
import { EngineStatus, FocusEngine, listCameras, Prediction, preloadModels } from "./engine";
import { ConsentDialog, ScoreChart, ScoreMeter } from "./widgets";

type Phase = "idle" | "consent" | "declined" | "running" | "break" | "ended";
type Growth = { level: number; stage: string; blooms: number; focused_seconds: number };
type EndSummary = Growth & { reading_count: number; average_score: number | null };

const STATUS_TEXT: Record<EngineStatus, string> = {
  loading: "מפעילים מצלמה וטוענים את המודל…",
  warming: "אוספים 10 שניות ראשונות של נתונים…",
  tracking: "מודדים ריכוז",
  noface: "לא זוהו פנים",
  error: "שגיאה",
  stopped: "המדידה הופסקה",
};
const LOW = 0.4;
const THIRSTY_AFTER_MS = 15_000;
const BREAK_SECONDS = 5 * 60;
const ZERO: Growth = { level: 0, stage: "seed", blooms: 0, focused_seconds: 0 };

export type FocusHooks = {
  getPosition: () => number;
  pause?: () => void; // YouTube only
  onUpdate?: (u: { score: number | null; status: EngineStatus; growth: Growth; onBreak: boolean }) => void;
};

export default function FocusPanel(props: {
  contentId: string;
  species: Species;
  hooks: FocusHooks;
  roomCode?: string | null;
  onSession?: (id: string | null) => void;
}) {
  const { contentId, species, hooks, roomCode } = props;
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<EngineStatus>("loading");
  const [error, setError] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [summary, setSummary] = useState<EndSummary | null>(null);
  const [growth, setGrowth] = useState<Growth>(ZERO);
  const [thirsty, setThirsty] = useState(false);
  const [reviving, setReviving] = useState(false);
  const [autoPause, setAutoPause] = useState(() => localStorage.getItem("bloom_autopause") === "1");
  const [breakLeft, setBreakLeft] = useState(0);
  const [busy, setBusy] = useState(false);

  const engine = useRef<FocusEngine | null>(null);
  const sessionId = useRef<string | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const lowSince = useRef<number | null>(null);
  const bloomsSeen = useRef(0);
  const live = useRef({ hooks, autoPause, thirsty, phase });
  live.current = { hooks, autoPause, thirsty, phase };

  // tell the parent (and the study room) what is happening
  useEffect(() => {
    hooks.onUpdate?.({ score, status, growth, onBreak: phase === "break" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, status, growth, phase]);

  useEffect(() => {
    const t = window.setTimeout(() => preloadModels().catch(() => {}), 300);
    return () => clearTimeout(t);
  }, []);

  const endOnServer = async () => {
    const id = sessionId.current;
    sessionId.current = null;
    props.onSession?.(null);
    if (!id) return null;
    return api<EndSummary>(`/api/sessions/${id}/end`, { method: "POST" });
  };

  useEffect(
    () => () => {
      engine.current?.stop();
      endOnServer().catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // break countdown
  useEffect(() => {
    if (phase !== "break") return;
    const t = window.setInterval(() => setBreakLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const handlePrediction = (p: Prediction) => {
    setScore(p.score);
    setHistory((h) => [...h.slice(-59), p.score]);
    const now = Date.now();
    if (p.score < LOW) {
      lowSince.current ??= now;
      if (!live.current.thirsty && now - lowSince.current >= THIRSTY_AFTER_MS) {
        setThirsty(true);
        if (live.current.autoPause) live.current.hooks.pause?.();
      }
    } else {
      lowSince.current = null;
      if (live.current.thirsty) {
        setThirsty(false);
        setReviving(true);
        window.setTimeout(() => setReviving(false), 1800);
      }
    }
    const id = sessionId.current;
    if (!id) return;
    const position = Math.max(0, Math.round(live.current.hooks.getPosition() * 10) / 10);
    api<Growth>(`/api/sessions/${id}/readings`, {
      method: "POST",
      body: { position, score: Number(p.score.toFixed(4)), attention: p.attention?.slice(0, 100) ?? null },
    })
      .then((g) => {
        setGrowth(g);
        if (g.blooms > bloomsSeen.current) {
          bloomsSeen.current = g.blooms;
          startBreak();
        }
      })
      .catch((err: ApiError) => {
        if (err.status === 409) setError("הסשן כבר הסתיים");
      });
  };

  const startEngine = async (deviceId?: string) => {
    engine.current?.stop();
    const e = new FocusEngine({
      onStatus: (s, info) => {
        if (s === "stopped") return;
        setStatus(s);
        if (s === "noface") {
          setScore(null);
          lowSince.current = null;
        }
        if (s === "error" && info) setError(info);
      },
      onPrediction: handlePrediction,
    });
    engine.current = e;
    preview.current?.replaceChildren(e.previewElement);
    await e.start(deviceId);
    const cams = await listCameras().catch(() => []);
    setCameras(cams);
    if (!deviceId) {
      const track = (e.previewElement.srcObject as MediaStream | null)?.getVideoTracks()[0];
      setCameraId(track?.getSettings().deviceId ?? cams[0]?.deviceId ?? "");
    }
  };

  const startBreak = () => {
    engine.current?.stop(); // camera off during the earned break
    engine.current = null;
    setScore(null);
    setThirsty(false);
    lowSince.current = null;
    setBreakLeft(BREAK_SECONDS);
    setPhase("break");
    live.current.hooks.pause?.();
  };

  const resume = async () => {
    setPhase("running");
    setStatus("loading");
    try {
      await startEngine(cameraId || undefined);
    } catch {
      /* status shows error */
    }
  };

  const agree = async () => {
    setError("");
    setScore(null);
    setHistory([]);
    setSummary(null);
    setGrowth(ZERO);
    setThirsty(false);
    bloomsSeen.current = 0;
    lowSince.current = null;
    setStatus("loading");
    setPhase("running");
    try {
      const s = await api<{ id: string }>("/api/sessions", {
        method: "POST",
        body: { content_id: contentId, room_code: roomCode ?? null },
      });
      sessionId.current = s.id;
      props.onSession?.(s.id);
      await startEngine();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setStatus("error");
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
      /* status shows the error */
    }
  };

  const mood: Mood =
    phase === "break" ? "still"
    : status === "noface" ? "sleep"
    : score === null ? "still"
    : score >= 0.5 ? "grow"
    : score >= LOW ? "still"
    : "droop";
  const running = phase === "running" || phase === "break";
  const plantLevel = phase === "ended" && summary ? summary.level : growth.level;
  const toNext = growth.level < 12 ? Math.max(0, 120 - (growth.focused_seconds % 120)) : 0;

  return (
    <section className="card session" aria-label="סשן מדידה">
      {phase === "consent" && <ConsentDialog onAgree={agree} onDecline={() => setPhase("declined")} />}

      <div className="plant-stage">
        <Plant level={plantLevel} species={species} mood={running || phase === "ended" ? mood : "still"}
          reviving={reviving} size={150} label={`הצמח שלך: ${STAGE_NAME[growth.stage] ?? "זרע"}`} />
        {running && (
          <p className="plant-caption" data-testid="plant-stage">
            {STAGE_NAME[growth.stage] ?? "זרע"} · {Math.floor(growth.focused_seconds / 60)} דק׳ מרוכזות
            {growth.level < 12 && toNext > 0 && <span className="muted small"> · עוד ~{Math.ceil(toNext / 60)} דק׳ לשלב הבא</span>}
          </p>
        )}
      </div>

      {(phase === "idle" || phase === "declined" || phase === "ended") && (
        <div className="stack">
          {phase === "idle" && <p className="muted small center-text">כל סשן שותל זרע — והוא גדל רק כשאת/ה מרוכז/ת.</p>}
          {phase === "declined" && (
            <p className="alert warn" role="status">
              בחרת לצפות בלי מדידה — זה בסדר גמור. בלי מצלמה לא נוכל למדוד ריכוז או לגדל צמח. אפשר להתחיל מדידה בכל רגע.
            </p>
          )}
          {phase === "ended" && summary && (
            <div className="alert ok" role="status">
              <strong>הסשן הסתיים ונשמר בהיסטוריה.</strong>{" "}
              {summary.reading_count > 0
                ? `${summary.reading_count} מדידות · ממוצע ${summary.average_score?.toFixed(2)}`
                : "לא נאספו מדידות בסשן הזה."}{" "}
              הצמח נשתל בגינה 🌱 <Link to="/history">לגינה שלי</Link>
            </div>
          )}
          <button className="btn big" onClick={() => setPhase("consent")}>
            {phase === "ended" ? "התחל סשן חדש" : "התחל סשן"}
          </button>
        </div>
      )}

      {phase === "break" && (
        <div className="break-box" role="status">
          <h3>☀️ הרווחת הפסקה!</h3>
          <p>הצמח פרח. המצלמה כבויה — קומו, תשתו מים, תזוזו קצת.</p>
          <div className="countdown" data-testid="break-countdown">
            {Math.floor(breakLeft / 60)}:{String(breakLeft % 60).padStart(2, "0")}
          </div>
          <div className="row center">
            <button className="btn" onClick={resume}>{breakLeft > 0 ? "חזרה ללמידה עכשיו" : "חזרה ללמידה"}</button>
            <button className="btn danger" onClick={end} disabled={busy}>סיים סשן</button>
          </div>
        </div>
      )}

      {phase === "running" && (
        <div className="stack">
          <div className="row between">
            <span className={`status-chip ${status}`} role="status" data-testid="engine-status">
              {status === "noface" ? "😴 " : ""}
              {STATUS_TEXT[status]}
            </span>
            <button className="btn danger" onClick={end} disabled={busy}>
              {busy ? "מסיים…" : "סיים סשן"}
            </button>
          </div>
          {status === "noface" && (
            <p className="alert warn" role="alert">לא זוהו פנים — הצמח ישן עד שתחזרו מול המצלמה. שום דבר לא נשלח.</p>
          )}
          {thirsty && (
            <p className="alert thirsty" role="alert" data-testid="thirsty">הצמח שלך צמא לריכוז 🌱</p>
          )}
          {reviving && <p className="alert ok" role="status">הצמח התעורר! 🌿</p>}
          <ScoreMeter score={score} />
          {score !== null && score < LOW && !thirsty && (
            <p className="alert error" role="alert">הריכוז ירד — נסו לחזור לתוכן 🙂</p>
          )}
          {error && <p className="alert error" role="alert">{error}</p>}
          <div className="cam-row">
            <div className="preview" ref={preview} aria-label="תצוגה מקדימה של המצלמה" />
            <div className="stack cam-select">
              <label>
                מצלמה
                <select value={cameraId} onChange={(e) => changeCamera(e.target.value)}>
                  {cameras.length === 0 && <option value="">מצלמת ברירת מחדל</option>}
                  {cameras.map((c, i) => (
                    <option key={c.deviceId || i} value={c.deviceId}>{c.label || `מצלמה ${i + 1}`}</option>
                  ))}
                </select>
              </label>
              {hooks.pause && (
                <label className="check">
                  <input type="checkbox" checked={autoPause} onChange={(e) => {
                    setAutoPause(e.target.checked);
                    localStorage.setItem("bloom_autopause", e.target.checked ? "1" : "0");
                  }} />
                  לעצור את הסרטון כשהריכוז נמוך
                </label>
              )}
            </div>
          </div>
          {history.length > 1 && <ScoreChart points={history} height={100} />}
        </div>
      )}
    </section>
  );
}
