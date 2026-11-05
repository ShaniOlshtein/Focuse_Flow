import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtDate } from "../api";
import { scoreColor } from "../focus/engine";
import { AttentionStrip } from "../bloom/AttentionStrip";

type Journal = {
  minutes_by_day: { date: string; focused_minutes: number }[];
  best_hour: number | null;
  hour_averages: Record<string, number>;
  by_bed: { name: string; average_score: number | null; focused_minutes: number }[];
  streak: number;
  attention_strips: { session_id: string; title: string; started_at: string; weights: number[] }[];
  tips: string[];
  totals: { sessions: number; focused_minutes: number; flowers: number };
};
type Badge = { id: string; name: string; emoji: string; description: string; earned: boolean };

function DayBars({ days }: { days: Journal["minutes_by_day"] }) {
  const max = Math.max(10, ...days.map((d) => d.focused_minutes));
  const w = 560, h = 150, bw = w / days.length;
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h + 22}`} role="img" aria-label="דקות ריכוז ב-14 הימים האחרונים">
      {days.map((d, i) => {
        const bh = (d.focused_minutes / max) * h;
        const x = w - (i + 1) * bw; // RTL: today on the left edge reads naturally from right to left
        return (
          <g key={d.date}>
            <rect x={x + 4} y={h - bh} width={bw - 8} height={Math.max(bh, 1)} rx="4" className="day-bar">
              <title>{`${d.date}: ${d.focused_minutes} דק׳`}</title>
            </rect>
            <text x={x + bw / 2} y={h + 16} textAnchor="middle" className="chart-tick">{d.date.slice(8)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function JournalPage() {
  const [j, setJ] = useState<Journal | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const tz = new Date().getTimezoneOffset();
    api<Journal>(`/api/journal?tz_offset=${tz}`).then(setJ).catch((e) => setError((e as Error).message));
    api<{ badges: Badge[] }>(`/api/badges?tz_offset=${tz}`).then((b) => setBadges(b.badges)).catch(() => {});
  }, []);

  if (error) return <p className="alert error">{error}</p>;
  if (!j) return <p className="muted">טוען…</p>;

  return (
    <div className="stack">
      <h1>יומן הגינה</h1>
      <div className="stat-row">
        <div className="card stat"><span className="stat-num">{j.totals.focused_minutes}</span><span>דקות מרוכזות</span></div>
        <div className="card stat"><span className="stat-num">{j.totals.sessions}</span><span>סשנים</span></div>
        <div className="card stat"><span className="stat-num">{j.totals.flowers}</span><span>פריחות</span></div>
        <div className="card stat"><span className="stat-num">{j.streak}🔥</span><span>ימים ברצף</span></div>
        <div className="card stat">
          <span className="stat-num">{j.best_hour === null ? "—" : `${String(j.best_hour).padStart(2, "0")}:00`}</span>
          <span>השעה הכי טובה</span>
        </div>
      </div>

      <section className="card tips">
        <h2>טיפים מהגנן 🌿</h2>
        <ul>{j.tips.map((t) => <li key={t}>{t}</li>)}</ul>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>דקות ריכוז — 14 ימים אחרונים</h2>
          <DayBars days={j.minutes_by_day} />
        </section>
        <section className="card">
          <h2>ממוצע לפי ערוגה</h2>
          {j.by_bed.length === 0 ? <p className="muted">אין עדיין נתונים.</p> : (
            <ul className="list">
              {j.by_bed.map((b) => (
                <li key={b.name} className="bed-row">
                  <span>{b.name}</span>
                  <div className="bar small-bar"><div className="bar-fill" style={{ width: `${(b.average_score ?? 0) * 100}%`, background: scoreColor(b.average_score ?? 0) }} /></div>
                  <strong>{b.average_score?.toFixed(2) ?? "—"}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <h2>אילו שניות נחשבו הכי הרבה?</h2>
        <p className="muted small">
          מודל v4_2 מחזיר "משקלי קשב" ל-100 הפריימים (10 שניות) שהוא רואה. כהה יותר = רגע שהשפיע יותר על הציון (ממוצע לכל סשן).
        </p>
        {j.attention_strips.length === 0 ? <p className="muted">אין עדיין נתונים.</p> : j.attention_strips.map((s) => (
          <div key={s.session_id} className="strip-row">
            <Link to={`/history/${s.session_id}`} className="small">{s.title} · {fmtDate(s.started_at)}</Link>
            <AttentionStrip weights={s.weights} />
          </div>
        ))}
      </section>

      <section className="card">
        <h2>עונות ותגים</h2>
        <div className="badges">
          {badges.map((b) => (
            <div key={b.id} className={`badge ${b.earned ? "earned" : ""}`} title={b.description}>
              <span className="badge-emoji">{b.emoji}</span>
              <strong>{b.name}</strong>
              <span className="muted small">{b.description}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
