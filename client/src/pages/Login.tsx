import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { Logo } from "../App";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string; registered?: string } };
  const [email, setEmail] = useState(loc.state?.registered ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email.trim(), password);
      nav(loc.state?.from ?? "/library", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <form className="card auth-card" onSubmit={submit} noValidate>
        <Logo />
        <h1>התחברות</h1>
        {loc.state?.registered && <p className="alert ok" role="status">נרשמת בהצלחה! עכשיו אפשר להתחבר.</p>}
        <label>
          אימייל
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          סיסמה
          <input type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="alert error" role="alert">{error}</p>}
        <button className="btn big" disabled={busy || !email || !password}>{busy ? "מתחבר…" : "התחברות"}</button>
        <p className="muted">אין לך חשבון? <Link to="/register">להרשמה</Link></p>
      </form>
    </main>
  );
}
