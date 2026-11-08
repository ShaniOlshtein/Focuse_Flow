import { useEffect, useReducer, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import RoomPanel from "../bloom/RoomPanel";
import { EngineStatus } from "../focus/engine";
import { api, ApiError, Content, TYPE_LABEL } from "../api";
import { NotFound } from "../App";
import FocusPanel from "../focus/FocusPanel";
import { Species } from "../bloom/Plant";
import YouTubePlayer, { PlayerHandle } from "../focus/YouTubePlayer";
import { INITIAL_PLAYBACK, reducePlayback } from "../focus/playback";

const SPECIES: Record<Content["type"], Species> = { youtube: "sunflower", text: "fern", web: "cactus" };

export default function ContentView() {
  const { id } = useParams();
  const [item, setItem] = useState<Content | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "notfound" | "error">("loading");
  const [error, setError] = useState("");
  const player = useRef<PlayerHandle>(null);
  const reader = useRef<HTMLElement>(null);
  const openedAt = useRef(Date.now());
  const [params, setParams] = useSearchParams();
  const [room, setRoom] = useState<string | null>(() => params.get("room") ?? sessionStorage.getItem("bloom_room"));
  const [sessionId, setSessionId] = useState<string | null>(null);
  // single source of truth for the video's real state (measurement + growth depend on it)
  const [playback, dispatchPlayback] = useReducer(reducePlayback, INITIAL_PLAYBACK);
  const [manualPlayback, setManualPlayback] = useState(false);
  const isVideo = item?.type === "youtube";
  useEffect(() => {
    if (!isVideo) return;
    const onVis = () => dispatchPlayback({ type: document.hidden ? "TAB_HIDDEN" : "TAB_VISIBLE" });
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [isVideo]);
  const [live, setLive] = useState<{ status: EngineStatus; onBreak: boolean }>({ status: "loading", onBreak: false });
  const enterRoom = (code: string) => {
    sessionStorage.setItem("bloom_room", code);
    setRoom(code);
    setParams({ room: code }, { replace: true });
  };
  const leaveRoom = () => {
    sessionStorage.removeItem("bloom_room");
    setRoom(null);
    setParams({}, { replace: true });
  };

  useEffect(() => {
    setStatus("loading");
    dispatchPlayback({ type: "SESSION_END" }); // another item: the old session's video state is gone
    setManualPlayback(false);
    api<Content>(`/api/content/${id}`)
      .then((c) => {
        setItem(c);
        setStatus("ok");
        openedAt.current = Date.now();
      })
      .catch((e: ApiError) => {
        if (e.status === 404) setStatus("notfound");
        else {
          setError(e.message);
          setStatus("error");
        }
      });
  }, [id]);

  if (status === "loading") return <p className="muted">טוען…</p>;
  if (status === "notfound") return <NotFound />;
  if (status === "error" || !item) return <p className="alert error">{error}</p>;

  // position: YouTube = currentTime (s); text = character offset by scroll; web = elapsed seconds
  const getPosition = () => {
    if (item.type === "youtube") return player.current?.getTime() ?? 0;
    if (item.type === "text" && reader.current) {
      const el = reader.current;
      const max = el.scrollHeight - el.clientHeight;
      return max > 0 ? Math.round((el.scrollTop / max) * item.source.length) : 0;
    }
    return (Date.now() - openedAt.current) / 1000;
  };

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <h1>{item.title}</h1>
          <p className="muted">{TYPE_LABEL[item.type]}{item.bed ? ` · ערוגה: ${item.bed}` : ""}</p>
        </div>
        <Link to="/library" className="btn ghost">חזרה לספרייה</Link>
      </div>
      <div className="watch-grid">
        <section className="card viewer">
          {item.type === "youtube" && item.youtube_id && (
            <YouTubePlayer ref={player} videoId={item.youtube_id} title={item.title}
              onEvent={dispatchPlayback} onFallback={() => setManualPlayback(true)} />
          )}
          {item.type === "text" && (
            <article className="reading" ref={reader} tabIndex={0} aria-label="טקסט לקריאה">{item.source}</article>
          )}
          {item.type === "web" && (
            <>
              <p className="muted small">
                אתרים רבים חוסמים הצגה בתוך דף אחר. אם הדף לא מופיע — פתחו אותו בחלון חדש, והמדידה תמשיך לפי זמן.
              </p>
              <a className="btn" href={item.source} target="_blank" rel="noopener noreferrer">פתח בחלון חדש</a>
              <iframe className="web-frame" title={item.title} src={item.source}
                sandbox="allow-scripts allow-same-origin allow-popups" referrerPolicy="no-referrer" />
            </>
          )}
        </section>
        <div className="stack side">
          <FocusPanel contentId={item.id} species={SPECIES[item.type]} roomCode={room} onSession={setSessionId}
            playback={isVideo ? playback : null} onPlayback={dispatchPlayback} manualPlayback={manualPlayback}
            hooks={{
              getPosition,
              pause: item.type === "youtube" ? () => player.current?.pause() : undefined,
              isPlaying: item.type === "youtube" ? () => !!player.current?.isPlaying() : undefined,
              onUpdate: (u) => setLive((p) => (p.status === u.status && p.onBreak === u.onBreak ? p : { status: u.status, onBreak: u.onBreak })),
            }} />
          <RoomPanel code={room} me={{ sessionId, status: live.status, onBreak: live.onBreak }} onCreated={enterRoom} onLeft={leaveRoom} />
        </div>
      </div>
    </div>
  );
}
