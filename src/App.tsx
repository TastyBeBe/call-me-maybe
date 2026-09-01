import { type ReactNode } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import { getConfig } from './config';
import AdminPage from './pages/AdminPage';
import CallPage from './pages/CallPage';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import SetupPage from './pages/SetupPage';
import StatsPage from './pages/StatsPage';
import UzivatelePage from './pages/UzivatelePage';
import ZpravyPage from './pages/ZpravyPage';

function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  if (admin && session.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function TopBar() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const { demo } = getConfig();
  if (!session) return null;
  const isAdmin = session.role === 'admin';

  const onLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="card topbar">
      <Link to="/" className="brand">
        Call me maybe<b>.</b>
      </Link>
      <nav>
        <NavLink to="/call" className={({ isActive }) => `nav-pill${isActive ? ' active' : ''}`}>
          volat
        </NavLink>
        <NavLink to="/stats" className={({ isActive }) => `nav-pill${isActive ? ' active' : ''}`}>
          statistiky
        </NavLink>
        {isAdmin && (
          <>
            <NavLink
              to="/admin"
              className={({ isActive }) => `nav-pill${isActive ? ' active' : ''}`}
            >
              kontakty
            </NavLink>
            <NavLink
              to="/zpravy"
              className={({ isActive }) => `nav-pill${isActive ? ' active' : ''}`}
            >
              zprávy
            </NavLink>
            <NavLink
              to="/uzivatele"
              className={({ isActive }) => `nav-pill${isActive ? ' active' : ''}`}
            >
              uživatelé
            </NavLink>
          </>
        )}
      </nav>
      <span className="spacer" />
      {demo && (
        <Link to="/setup" style={{ textDecoration: 'none' }}>
          <span className="demo-chip">DEMO</span>
        </Link>
      )}
      <span className="who">{session.display_name}</span>
      <button className="pill-btn sm" onClick={onLogout}>
        odhlásit
      </button>
    </header>
  );
}

export default function App() {
  return (
    <div className="page wide">
      <TopBar />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <HomePage />
            </RequireAuth>
          }
        />
        <Route
          path="/call"
          element={
            <RequireAuth>
              <CallPage />
            </RequireAuth>
          }
        />
        <Route
          path="/stats"
          element={
            <RequireAuth>
              <StatsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth admin>
              <AdminPage />
            </RequireAuth>
          }
        />
        <Route
          path="/zpravy"
          element={
            <RequireAuth admin>
              <ZpravyPage />
            </RequireAuth>
          }
        />
        <Route
          path="/uzivatele"
          element={
            <RequireAuth admin>
              <UzivatelePage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
