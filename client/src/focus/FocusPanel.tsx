import { useEffect, useRef, useState } from "react";
import { useTween } from "../bloom/useTween";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";
import Plant, { Mood, Species, STAGE_NAME } from "../bloom/Plant";
import { EngineStatus, FocusEngine, listCameras, Prediction, preloadModels } from "./engine";
import { ConsentDialog, ScoreChart, ScoreMeter } from "./widgets";
import { isMeasuring, Playback, PLAYBACK_TEXT, PlaybackEvent, TAB_HIDDEN_TEXT } from "./playback";

type Phase = "idle" | "consent" | "declined" | "running" | "break" | "ended";
type Growth = { level: number; level_exact: number; progress: number; next_level_in: number | null; stage: string; blooms: number; focused_seconds: number };
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
const ZERO: Growth = { level: 0, level_exact: 0, progress: 0, next_level_in: null, stage: "seed", blooms: 0, focused_seconds: 0 };

export type FocusHooks = {
  getPosition: () => number;
  pause?: () => void; // YouTube only
  isPlaying?: () => boolean; // YouTube only: is the video playing right now
  onUpdate?: (u: { score: number | null; status: EngineStatus; growth: Growth; onBreak: boolean }) => void;
};

export default function FocusPanel(props: {
  contentId: string;
  species: Species;
  hooks: FocusHooks;
  roomCode?: string | null;
  onSession?: (id: string | null) => void;
  /** video content only: the playback state machine (null = text/web, always measurable) */
  playback?: Playback | null;
  onPlayback?: (e: PlaybackEvent) => void;
  /** the player can't report play/pause (YouTube API blocked): the user reports it */
  manualPlayback?: boolean;
}) {
  const { contentId, species, hooks, roomCode, playback, onPlayback, manualPlayback } = props;
  const measuring = !playback || isMeasuring(playback);
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
  const [grew, setGrew] = useState(false);

  const engine = useRef<FocusEngine | null>(null);
  const sessionId = useRef<string | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const lowSince = useRef<number | null>(null);
  const bloomsSeen = useRef(0);
  const starting = useRef(false); // guards against double clicks
  const ending = useRef(false);
  const serverPlaying = useRef(true); // what the server was last told for this session
  const serverQueue = useRef<Promise<unknown>>(Promise.resolve());
  const live = useRef({ hooks, autoPause, thirsty, phase, measuring });
  live.current = { hooks, autoPause, thirsty, phase, measuring };

  const tellServer = (id: string, playing: boolean) => {
    if (serverPlaying.current === playing) return;
    serverPlaying.current = playing;
    const path = `/api/sessions/${id}/${playing ? "resume" : "pause"}`;
    serverQueue.current = serverQueue.current.then(() => api(path, { method: "POST" }).catch(() => {}));
  };

  // measurement + growth follow the playback state: pause the engine and tell the server
  useEffect(() => {
    engine.current?.setActive(measuring);
    if (!measuring) {
      lowSince.current = null; // paused time never counts towards "thirsty"
      setScore(null);
    }
    if (sessionId.current) tellServer(sessionId.current, measuring);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measuring]);

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
    if (!live.current.measuring) return; // video not playing: nothing is shown, sent or grown
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
        setGrowth((prev) => {
          if (g.level_exact > prev.level_exact + 1e-3) {
            setGrew(true);
            window.setTimeout(() => setGrew(false), 900);
          }
          return g;
        });
        if (g.blooms > bloomsSeen.current) {
          bloomsSeen.current = g.blooms;
          startBreak();
        }
      })
      .catch((err: ApiError) => {
        // a 409 for "paused" can only be a reading that raced a pause - dropped on purpose
        if (err.status === 409 && err.message === "הסשן כבר הסתיים") setError(err.message);
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
    e.setActive(live.current.measuring);
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
    if (starting.current) return;
    starting.current = true;
    ending.current = false;
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
    // video: the session starts "waiting for the video" unless it is already playing
    const playingNow = playback ? !manualPlayback && !!hooks.isPlaying?.() : true;
    onPlayback?.({ type: "SESSION_START", playing: playingNow });
    const playingForServer = playback ? playingNow && !document.hidden : true;
    try {
      const s = await api<{ id: string }>("/api/sessions", {
        method: "POST",
        body: { content_id: contentId, room_code: roomCode ?? null, playing: playingForServer },
      });
      sessionId.current = s.id;
      serverPlaying.current = playingForServer;
      tellServer(s.id, live.current.measuring); // the video may have started/stopped meanwhile
      props.onSession?.(s.id);
      await startEngine();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setStatus("error");
    } finally {
      starting.current = false;
    }
  };

  const end = async () => {
    if (ending.current) return;
    ending.current = true;
    setBusy(true);
    onPlayback?.({ type: "SESSION_END" });
    engine.current?.stop();
    engine.current = null;
    try {
      setSummary(await endOnServer());
      setPhase("ended");
    } catch (err) {
      setError((err as Error).message);
      ending.current = false;
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
    phase === "break" || !measuring ? "still"
    : status === "noface" ? "sleep"
    : score === null ? "still"
    : score >= 0.5 ? "grow"
    : score >= LOW ? "still"
    : "droop";
  const running = phase === "running" || phase === "break";
  const target = phase === "ended" && summary ? summary.level_exact : growth.level_exact;
  const plantLevel = useTween(target, 2500); // glide smoothly between readings (~3 s apart)
  const pct = Math.round(Math.min(1, growth.progress) * 100);

  return (
    <section className="card session" aria-label="סשן מדידה">
      {phase === "consent" && <ConsentDialog onAgree={agree} onDecline={() => setPhase("declined")} />}

      <div className="plant-stage">
        <Plant level={plantLevel} species={species} mood={running || phase === "ended" ? mood : "still"}
          reviving={reviving || grew} size={150} label={`הצמח שלך: ${STAGE_NAME[growth.stage] ?? "זרע"}`} />
        {running && (
          <p className="plant-caption" data-testid="plant-stage">
            {STAGE_NAME[growth.stage] ?? "זרע"} · {growth.focused_seconds < 60 ? `${Math.round(growth.focused_seconds)} שנ׳` : `${Math.floor(growth.focused_seconds / 60)} דק׳`} מרוכזות
          </p>
        )}
        {running && (
          <div className="bloom-progress" aria-label={`התקדמות לפריחה: ${pct}%`} data-testid="bloom-progress">
            <div className="bar small-bar"><div className="bar-fill" style={{ width: `${pct}%`, background: "var(--leaf-2)" }} /></div>
            <span className="muted small">לפריחה: {pct}%{grew ? " 🌱+" : ""}</span>
          </div>
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
              {!measuring && (status === "warming" || status === "tracking" || status === "noface")
                ? "⏸ המדידה מושהית"
                : <>{status === "noface" ? "😴 " : ""}{STATUS_TEXT[status]}</>}
            </span>
            <button className="btn danger" onClick={end} disabled={busy}>
              {busy ? "מסיים…" : "סיים סשן"}
            </button>
          </div>
          {playback && !measuring && (
            <p className="alert warn" role="status" data-testid="playback-status" data-state={playback.state}>
              {playback.tabHidden && playback.state === "playing" ? TAB_HIDDEN_TEXT : PLAYBACK_TEXT[playback.state]}
            </p>
          )}
          {playback && manualPlayback && (
            <div className="alert warn stack" data-testid="manual-playback">
              <p>
                לא הצלחנו לזהות אוטומטית אם הסרטון מתנגן 🙈 כדי שנמדוד רק בזמן הצפייה: כשתתחילו את הסרטון לחצו
                על "התחלתי לצפות", וכשתעצרו אותו לחצו על "עצרתי" — והמדידה תיעצר גם היא.
              </p>
              <div className="row">
                <button className="btn" disabled={playback.state === "playing"} onClick={() => onPlayback?.({ type: "PLAY" })}>▶ התחלתי לצפות</button>
                <button className="btn ghost" disabled={playback.state !== "playing"} onClick={() => onPlayback?.({ type: "PAUSE" })}>⏸ עצרתי</button>
              </div>
            </div>
          )}
          {measuring && status === "noface" && (
            <p className="alert warn" role="alert">לא זוהו פנים — הצמח ישן עד שתחזרו מול המצלמה. שום דבר לא נשלח.</p>
          )}
          {thirsty && (
            <p className="alert thirsty" role="alert" data-testid="thirsty">הצמח שלך צמא לריכוז 🌱</p>
          )}
          {reviving && <p className="alert ok" role="status">הצמח התעורר! 🌿</p>}
          <ScoreMeter score={score} waitingText={measuring ? undefined : "המדידה מושהית"} />
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
