import { Link } from "react-router-dom";
import { Logo } from "../App";

export default function Landing() {
  return (
    <main className="landing">
      <Logo />
      <h1>פורחים</h1>
      <p className="tagline">תתרכזו — ותראו מה צומח</p>
      <div className="row center">
        <Link className="btn big" to="/register">הרשמה</Link>
        <Link className="btn big ghost" to="/login">התחברות</Link>
      </div>
    </main>
  );
}
