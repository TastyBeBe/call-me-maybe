import { useEffect, useRef, type ReactNode } from 'react';
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { audio, isSfxName, useAudioSettings } from './audio';
import { useAuth } from './auth';
import { getConfig } from './config';
import { MusicIcon, MusicOffIcon, SpeakerIcon, SpeakerOffIcon } from './icons';
import AdminPage from './pages/AdminPage';
import CallPage from './pages/CallPage';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import SetupPage from './pages/SetupPage';
import StatsPage from './pages/StatsPage';
import UzivatelePage from './pages/UzivatelePage';
import ZpravyPage from './pages/ZpravyPage';

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

/** Přepínače zvuků + hudby v topbaru. */
function AudioToggles() {
  const { sfxOn, musicOn, setSfx, setMusic } = useAudioSettings();
  return (
    <>
      <button
        type="button"
        className={`tb-btn audio-toggle${sfxOn ? '' : ' off'}`}
        data-sfx="none"
        aria-label={sfxOn ? 'Zvuky zapnuty' : 'Zvuky vypnuty'}
        aria-pressed={sfxOn}
        title={sfxOn ? 'Vypnout zvuky' : 'Zapnout zvuky'}
        onClick={() => {
          const next = !sfxOn;
          setSfx(next);
          // zapnutí potvrdíme clickem; vypnutí je schválně tiché (data-sfx="none")
          if (next) audio.play('click');
        }}
      >
        {sfxOn ? <SpeakerIcon size={18} /> : <SpeakerOffIcon size={18} />}
      </button>
      <button
        type="button"
        className={`tb-btn audio-toggle${musicOn ? '' : ' off'}`}
        aria-label={musicOn ? 'Hudba zapnuta' : 'Hudba vypnuta'}
        aria-pressed={musicOn}
        title={musicOn ? 'Vypnout hudbu' : 'Zapnout hudbu'}
        onClick={() => setMusic(!musicOn)}
      >
        {musicOn ? <MusicIcon size={18} /> : <MusicOffIcon size={18} />}
      </button>
    </>
  );
}

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
      <Link to="/" className="brand" data-sfx="none">
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
          </>
        )}
      </nav>
      <span className="spacer" />
      <AudioToggles />
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
