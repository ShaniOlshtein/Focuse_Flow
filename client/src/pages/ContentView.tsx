import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, Content, TYPE_LABEL } from "../api";
import { NotFound } from "../App";

export default function ContentView() {
  const { id } = useParams();
  const [item, setItem] = useState<Content | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "notfound" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    setStatus("loading");
    api<Content>(`/api/content/${id}`)
      .then((c) => {
        setItem(c);
        setStatus("ok");
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

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <h1>{item.title}</h1>
          <p className="muted">{TYPE_LABEL[item.type]}{item.bed ? ` · ערוגה: ${item.bed}` : ""}</p>
        </div>
        <Link to="/library" className="btn ghost">חזרה לספרייה</Link>
      </div>
      <section className="card viewer">
        {item.type === "youtube" && item.youtube_id && (
          <div className="video-wrap">
            <iframe title={item.title} src={`https://www.youtube.com/embed/${item.youtube_id}`}
              allow="autoplay; encrypted-media" allowFullScreen />
          </div>
        )}
        {item.type === "text" && <article className="reading">{item.source}</article>}
        {item.type === "web" && (
          <>
            <a className="btn" href={item.source} target="_blank" rel="noopener noreferrer">פתח בחלון חדש</a>
            <iframe className="web-frame" title={item.title} src={item.source} sandbox="allow-scripts allow-same-origin" />
          </>
        )}
      </section>
    </div>
  );
}
