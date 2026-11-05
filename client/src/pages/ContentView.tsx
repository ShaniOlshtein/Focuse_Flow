import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, Content, TYPE_LABEL } from "../api";
import { NotFound } from "../App";
import SessionPanel from "../focus/SessionPanel";
import YouTubePlayer, { PlayerHandle } from "../focus/YouTubePlayer";

export default function ContentView() {
  const { id } = useParams();
  const [item, setItem] = useState<Content | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "notfound" | "error">("loading");
  const [error, setError] = useState("");
  const player = useRef<PlayerHandle>(null);
  const reader = useRef<HTMLElement>(null);
  const openedAt = useRef(Date.now());

  useEffect(() => {
    setStatus("loading");
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
            <YouTubePlayer ref={player} videoId={item.youtube_id} title={item.title} />
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
        <SessionPanel contentId={item.id} hooks={{ getPosition }} />
      </div>
    </div>
  );
}
