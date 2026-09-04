import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from 'react';
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { audio, isSfxName } from './audio';
import { OWNER_USER_ID, useAuth } from './auth';
import { getConfig } from './config';

/** Logo = Procopova pochroumaná hlava v party čepici (public/icons). */
const logoUrl = import.meta.env.BASE_URL + 'icons/procop_logo_256.png';
import AdminPage from './pages/AdminPage';
import AutomatizacePage from './pages/AutomatizacePage';
import CallPage from './pages/CallPage';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import MojiPage from './pages/MojiPage';
import OznacenePage from './pages/OznacenePage';
import SetupPage from './pages/SetupPage';
import StatsPage from './pages/StatsPage';
import UzivatelePage from './pages/UzivatelePage';
import ZpravyPage from './pages/ZpravyPage';
import PigLayer from './pig/PigLayer';
import SoundMenu from './SoundMenu';

/** Procop je dekorace: když spadne, zaloguj to a vrstvu zahoď — appka jede dál. */
class PigBoundary extends Component<{ children: ReactNode }, { broken: boolean }> {
  state = { broken: false };
  static getDerivedStateFromError() { return { broken: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[pig] layer crashed: ' + (error.stack || error.message) + info.componentStack); }
  render() { return this.state.broken ? null : this.props.children; }
}

/**
 * Globální zvuková vrstva:
 * - capture pointerdown odemkne audio (autoplay policy) a přehraje 'click'
 *   pro každý <button>/<a>, pokud prvek nemá data-sfx="none" (ticho) nebo
 *   data-sfx s konkrétním zvukem (ten se přehraje místo clicku),
 * - změna routy přehraje 'nav' (nav-pilulky mají data-sfx="none", ať to nehraje dvakrát).
 */
function AudioLayer() {
  const { pathname } = useLocation();
  const firstRoute = useRef(true);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      audio.unlock();
      const target = e.target as Element | null;
      const el = target?.closest?.('button, a');
      if (!el) return;
      if (el instanceof HTMLButtonElement && el.disabled) return;
      const override = el.getAttribute('data-sfx');
      if (override === 'none') return;
      audio.play(isSfxName(override) ? override : 'click');
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    audio.play('nav');
  }, [pathname]);

  return null;
}


function RequireAuth({
  children,
  admin = false,
  owner = false,
}: {
  children: ReactNode;
  admin?: boolean;
  owner?: boolean;
}) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  if (admin && session.role !== 'admin') return <Navigate to="/" replace />;
  if (owner && session.user_id !== OWNER_USER_ID) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function TopBar() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const { demo } = getConfig();
  if (!session) return null;
  const isAdmin = session.role === 'admin';
  const isOwner = isAdmin && session.user_id === OWNER_USER_ID;

  const onLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="card topbar">
      <Link to="/" className="brand" data-sfx="none">
        <img className="brand-logo" src={logoUrl} alt="" aria-hidden="true" />
        Call me maybe<b>.</b>
      </Link>
      <nav>
        <NavLink
          to="/call"
          data-sfx="none"
          className={({ isActive }) => `nav-pill${isActive ? ' active' : ''}`}
        >
          volat
        </NavLink>
        <NavLink
          to="/stats"
          data-sfx="none"
          className={({ isActive }) => `nav-pill${isActive ? ' active' : ''}`}
        >
          statistiky
        </NavLink>
        <NavLink
          to="/moji"
          data-sfx="none"
          className={({ isActive }) => `nav-pill${isActive ? ' active' : ''}`}
        >
          moji klienti
        </NavLink>
        {isAdmin && (
          <>
            <NavLink
              to="/admin"
              data-sfx="none"
              className={({ isActive }) => `nav-pill${isActive ? ' active' : ''}`}
            >
              kontakty
            </NavLink>
            <NavLink
              to="/oznacene"
              data-sfx="none"
              className={({ isActive }) => `nav-pill${isActive ? ' active' : ''}`}
            >
              označené
            </NavLink>
            <NavLink
              to="/zpravy"
              data-sfx="none"
              className={({ isActive }) => `nav-pill${isActive ? ' active' : ''}`}
            >
              zprávy
            </NavLink>
            <NavLink
              to="/uzivatele"
              data-sfx="none"
              className={({ isActive }) => `nav-pill${isActive ? ' active' : ''}`}
            >
              uživatelé
            </NavLink>
            {isOwner && (
              <NavLink
                to="/automatizace"
                data-sfx="none"
                className={({ isActive }) => `nav-pill${isActive ? ' active' : ''}`}
              >
                automatizace
              </NavLink>
            )}
          </>
        )}
      </nav>
      <span className="spacer" />
      <SoundMenu />
      {demo && (
        <Link to="/setup" style={{ textDecoration: 'none' }} data-sfx="none">
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
      <AudioLayer />
      <TopBar />
      <PigBoundary>
        <PigLayer />
      </PigBoundary>
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
          path="/moji"
          element={
            <RequireAuth>
              <MojiPage />
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
          path="/oznacene"
          element={
            <RequireAuth admin>
              <OznacenePage />
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
        <Route
          path="/automatizace"
          element={
            <RequireAuth admin owner>
              <AutomatizacePage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
