import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtDate } from "../api";
import Plant, { flowerColor, Species, SPECIES_NAME, STAGE_NAME } from "../bloom/Plant";
import { HistoryList } from "./History";

export type GardenPlant = {
  session_id: string;
  title: string;
  species: Species;
  bed: string;
  started_at: string;
  average_score: number | null;
  focused_minutes: number;
  level: number;
  stage: string;
  blooms: number;
};
type Bed = { name: string; plants: GardenPlant[]; focused_minutes: number; average_score: number | null };
type GardenData = { beds: Bed[]; total_plants: number; flowers: number };
type Season = { key: string; name: string; emoji: string };

export default function Garden() {
  const [data, setData] = useState<GardenData | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<GardenData>("/api/garden").then(setData).catch((e) => setError((e as Error).message));
    api<{ season: Season }>(`/api/badges?tz_offset=${new Date().getTimezoneOffset()}`)
      .then((b) => setSeason(b.season))
      .catch(() => {});
  }, []);

  return (
    <div className="stack">
      <section className={`card garden season-${season?.key ?? "none"}`}>
        <div className="row between">
          <div>
            <h1>הגינה שלי</h1>
            <p className="muted">כל סשן שהסתיים נשתל כאן. גובה = דקות ריכוז, צבע הפרח = ממוצע הריכוז.</p>
          </div>
          {season && <span className="season-chip">{season.emoji} עונת {season.name}</span>}
        </div>
        {error && <p className="alert error">{error}</p>}
        {data === null ? (
          <p className="muted">טוען…</p>
        ) : data.total_plants === 0 ? (
          <p className="empty">הגינה עוד ריקה. פתחו תוכן מהספרייה, לחצו "התחל סשן" — והצמח הראשון יישתל כאן 🌱</p>
        ) : (
          <>
            <p className="garden-stats">
              🌱 {data.total_plants} צמחים · 🌼 {data.flowers} פרחו
            </p>
            {data.beds.map((b) => (
              <div key={b.name} className="bed" aria-label={`ערוגה ${b.name}`}>
                <div className="bed-head">
                  <h2>{b.name}</h2>
                  <span className="muted small">
                    {b.focused_minutes} דק׳ מרוכזות · ממוצע {b.average_score?.toFixed(2) ?? "—"}
                  </span>
                </div>
                <div className="bed-soil">
                  {b.plants.map((p) => (
                    <Link key={p.session_id} to={`/history/${p.session_id}`} className="garden-plant"
                      title={`${p.title} · ${fmtDate(p.started_at)}`}>
                      <Plant level={p.level} species={p.species} color={flowerColor(p.average_score)} mood="still"
                        size={62 + Math.min(30, p.focused_minutes)} label={`${SPECIES_NAME[p.species]}: ${p.title}`} />
                      <span className="gp-title">{p.title}</span>
                      <span className="muted small">
                        {STAGE_NAME[p.stage]} · {Math.round(p.focused_minutes)} דק׳{p.blooms > 1 ? ` · 🌼×${p.blooms}` : ""}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </section>
      <HistoryList />
    </div>
  );
}
