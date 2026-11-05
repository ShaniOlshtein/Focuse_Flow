import { Link } from "react-router-dom";
import { Logo } from "../App";
import Plant from "../bloom/Plant";

const STEPS = [
  { level: 0, mood: "still" as const, title: "מוסיפים תוכן", text: "סרטון YouTube, טקסט או דף אינטרנט — לפי נושאים (ערוגות)." },
  { level: 5, mood: "grow" as const, title: "לומדים מול המצלמה", text: "המודל רץ בדפדפן בלבד. הצמח גדל רק כשאתם מרוכזים." },
  { level: 12, mood: "grow" as const, title: "הגינה צומחת", text: "כל סשן נשתל בגינה. כל פריחה מזכה בהפסקה אמיתית." },
];

export default function Landing() {
  return (
    <main className="landing-page">
      <header className="landing-top"><Logo /></header>
      <section className="hero">
        <h1>פורחים</h1>
        <p className="tagline">תתרכזו — ותראו מה צומח</p>
        <p className="hero-text">
          ללמוד לבד בבית זה קשה — אף אחד לא שם לב כשהמחשבות נודדות. בפורחים כל סשן לימוד שותל זרע, והוא גדל רק בזמן
          שאתם באמת מרוכזים.
        </p>
        <div className="row center">
          <Link className="btn big" to="/register">הרשמה</Link>
          <Link className="btn big ghost" to="/login">התחברות</Link>
        </div>
      </section>
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className="card step">
            <span className="step-num">{i + 1}</span>
            <Plant level={s.level} mood={s.mood} species={i === 0 ? "fern" : "sunflower"} size={90} label={s.title} />
            <h2>{s.title}</h2>
            <p className="muted">{s.text}</p>
          </li>
        ))}
      </ol>
      <p className="muted small privacy-note">🔒 הווידאו ונקודות הפנים לא יוצאים מהדפדפן — לשרת נשלח רק ציון ריכוז.</p>
    </main>
  );
}
