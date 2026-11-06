import { ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Library from "./pages/Library";
import ContentView from "./pages/ContentView";
import { HistoryDetail } from "./pages/History";
import Garden from "./pages/Garden";
import JournalPage from "./pages/Journal";
import Profile from "./pages/Profile";
import RoomJoin from "./pages/RoomJoin";

export function Logo() {
  return (
    <Link to="/" className="brand" aria-label="פורחים - דף הבית">
      <img src="/logo.svg" alt="" width={36} height={36} />
      <span>פורחים</span>
    </Link>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <>
      <header className="topbar">
        <Logo />
        <nav className="mainnav" aria-label="ניווט ראשי">
          <NavLink to="/library">הספרייה</NavLink>
          <NavLink to="/history">הגינה שלי · היסטוריה</NavLink>
          <NavLink to="/journal">יומן הגינה</NavLink>
          <NavLink to="/profile">פרופיל</NavLink>
        </nav>
        <div className="userbox">
          <span className="hello" data-testid="display-name">שלום, {user?.display_name}</span>
          <button
            className="btn ghost"
            onClick={async () => {
              await logout();
              nav("/login", { replace: true });
            }}
          >
            התנתק
          </button>
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="center muted">טוען…</div>;
  if (!user) {
    sessionStorage.setItem("bloom_from", loc.pathname + loc.search); // come back here after login/registration
    return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  }
  return <Shell>{children}</Shell>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center muted">טוען…</div>;
  return user ? <Navigate to="/library" replace /> : <>{children}</>;
}

export function NotFound() {
  return (
    <div className="card center-card">
      <h1>לא נמצא</h1>
      <p className="muted">הדף או הפריט שחיפשת לא קיים, או שאין לך הרשאה אליו.</p>
      <Link className="btn" to="/library">חזרה לספרייה</Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route path="/library" element={<Protected><Library /></Protected>} />
      <Route path="/content/:id" element={<Protected><ContentView /></Protected>} />
      <Route path="/history" element={<Protected><Garden /></Protected>} />
      <Route path="/journal" element={<Protected><JournalPage /></Protected>} />
      <Route path="/history/:id" element={<Protected><HistoryDetail /></Protected>} />
      <Route path="/profile" element={<Protected><Profile /></Protected>} />
      <Route path="/room/:code" element={<Protected><RoomJoin /></Protected>} />
      <Route path="*" element={<Protected><NotFound /></Protected>} />
    </Routes>
  );
}
