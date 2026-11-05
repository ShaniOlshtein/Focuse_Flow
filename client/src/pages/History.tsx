import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, fmtDate } from "../api";
import { NotFound } from "../App";
import { scoreColor } from "../focus/engine";
import { ScoreChart } from "../focus/widgets";
import Plant, { flowerColor, Species, SPECIES_NAME, STAGE_NAME } from "../bloom/Plant";
import { AttentionStrip } from "../bloom/AttentionStrip";

export type SessionSummary = {
  id: string;
  content_id: string;
  content_title: string;
  content_type: string | null;
  bed: string | null;
  started_at: string;
  ended_at: string | null;
  reading_count: number;
  average_score: number | null;
  species: Species;
  level: number;
  stage: string;
  blooms: number;
  focused_seconds: number;
};
type Reading = { score: number; position: number; created_at: string; attention?: number[] };
type SessionDetail = SessionSummary & { readings: Reading[] };

export const Avg = ({ v }: { v: number | null }) =>
  v === null ? <span className="muted">אין מדידות</span> : <strong style={{ color: scoreColor(v) }}>{v.toFixed(2)}</strong>;

const duration = (s: SessionSummary) => {
  if (!s.ended_at) return "פעיל";
  const m = Math.round((+new Date(s.ended_at) - +new Date(s.started_at)) / 60000);
  return m < 1 ? "פחות מדקה" : `${m} דק׳`;
};

export function HistoryList() {
  const [items, setItems] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<SessionSummary[]>("/api/sessions").then(setItems).catch((e) => setError((e as Error).message));
  }, []);

  return (
    <section className="card">
      <h2>היסטוריה — כל הסשנים</h2>
      {error && <p className="alert error">{error}</p>}
      {items === null ? (
        <p className="muted">טוען…</p>
      ) : items.length === 0 ? (
        <p className="empty">עוד אין סשנים. פתחו תוכן מהספרייה ולחצו "התחל סשן".</p>
      ) : (
        <table className="table" aria-label="רשימת סשנים">
          <thead>
            <tr><th>תאריך</th><th>תוכן</th><th>משך</th><th>מדידות</th><th>ממוצע</th></tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id}>
                <td><Link to={`/history/${s.id}`}>{fmtDate(s.started_at)}</Link></td>
                <td><Link to={`/history/${s.id}`}>{s.content_title}</Link></td>
                <td>{duration(s)}</td>
                <td>{s.reading_count}</td>
                <td><Avg v={s.average_score} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const fmtPos = (r: Reading, type: string | null) =>
  type === "text" ? `תו ${Math.round(r.position)}` : `${Math.floor(r.position / 60)}:${String(Math.floor(r.position % 60)).padStart(2, "0")}`;

export function HistoryDetail() {
  const { id } = useParams();
  const [s, setS] = useState<SessionDetail | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound" | "error">("loading");
  const [error, setError] = useState("");
  useEffect(() => {
    api<SessionDetail>(`/api/sessions/${id}`)
      .then((d) => {
        setS(d);
        setState("ok");
      })
      .catch((e: ApiError) => {
        setState(e.status === 404 ? "notfound" : "error");
        setError(e.message);
      });
  }, [id]);

  if (state === "loading") return <p className="muted">טוען…</p>;
  if (state === "notfound") return <NotFound />;
  if (state === "error" || !s) return <p className="alert error">{error}</p>;

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <h1>{s.content_title}</h1>
          <p className="muted">
            {fmtDate(s.started_at)} · {duration(s)} · {s.reading_count} מדידות · ממוצע <Avg v={s.average_score} />
          </p>
        </div>
        <Link className="btn ghost" to="/history">חזרה לגינה</Link>
      </div>
      <section className="card plant-hero">
        <Plant level={s.level} species={s.species} color={flowerColor(s.average_score)} mood="still" size={110} />
        <div>
          <h2>{SPECIES_NAME[s.species]} · {STAGE_NAME[s.stage]}</h2>
          <p>{Math.round(s.focused_seconds / 60)} דקות מרוכזות{s.blooms > 0 ? ` · פרח ${s.blooms} פעמים 🌼` : ""}{s.bed ? ` · ערוגה: ${s.bed}` : ""}</p>
        </div>
      </section>
      <section className="card">
        <h2>ציון לאורך הזמן</h2>
        <ScoreChart points={s.readings.map((r) => r.score)} labels={s.readings.map((r) => fmtPos(r, s.content_type))} />
      </section>
      {s.readings.some((r) => r.attention) && (
        <section className="card">
          <h2>אילו שניות נחשבו הכי הרבה?</h2>
          <p className="muted small">כל שורה = מדידה אחת; כל משבצת = פריים מתוך 10 השניות שהמודל ראה (ימין = מוקדם). כהה = משקל קשב גבוה.</p>
          <div className="strips">
            {s.readings.filter((r) => r.attention).slice(-20).map((r, i) => <AttentionStrip key={i} weights={r.attention!} height={10} />)}
          </div>
        </section>
      )}
      <section className="card">
        <h2>מדידות</h2>
        {s.readings.length === 0 ? (
          <p className="muted">לא נאספו מדידות בסשן הזה.</p>
        ) : (
          <table className="table" aria-label="מדידות">
            <thead><tr><th>#</th><th>שעה</th><th>מיקום בתוכן</th><th>ציון</th></tr></thead>
            <tbody>
              {s.readings.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{new Date(r.created_at).toLocaleTimeString("he-IL")}</td>
                  <td>{fmtPos(r, s.content_type)}</td>
                  <td><Avg v={r.score} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
