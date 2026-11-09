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
import { isAdminRole, isSuperAdmin } from './roles';
import { klicNikKVolani, nactiNiky, OBNOVA_NIK_MS, useNiky, viditelneNiky, zapomenNiky } from './obory';
import { vychoziNikaRelace } from './segment';

/** Logo = Prokchopova pochroumaná hlava v party čepici (public/icons). */
const logoUrl = import.meta.env.BASE_URL + 'icons/procop_logo_256.png';
import AdminPage from './pages/AdminPage';
import AutomatizacePage from './pages/AutomatizacePage';
import CallPage from './pages/CallPage';
import HomePage from './pages/HomePage';
import JakVolatPage from './pages/JakVolatPage';
import KalendarPage from './pages/KalendarPage';
import LoginPage from './pages/LoginPage';
import MojiPage from './pages/MojiPage';
import OznacenePage from './pages/OznacenePage';
import RozvrhPage from './pages/RozvrhPage';
import SetupPage from './pages/SetupPage';
import StatsPage from './pages/StatsPage';
import UzivatelePage from './pages/UzivatelePage';
import ZpravyPage from './pages/ZpravyPage';
import PigLayer from './pig/PigLayer';
import SoundMenu from './SoundMenu';
import { useZavolat, ZavolatProvider } from './zavolat';

/** Prokchop je dekorace: když spadne, zaloguj to a vrstvu zahoď — appka jede dál. */
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
  superAdmin = false,
  owner = false,
}: {
  children: ReactNode;
  admin?: boolean;
  /** jen super admin (Uživatelé — lidi zakládá a spravuje jen super admin, migrace 024) */
  superAdmin?: boolean;
  owner?: boolean;
}) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  // admin = admin i super admin (migrace 023); server to hlídá sám, tady jen neukazujeme,
  // co by stejně odmítl.
  if (admin && !isAdminRole(session.role)) return <Navigate to="/" replace />;
  if (superAdmin && !isSuperAdmin(session.role)) return <Navigate to="/" replace />;
  if (owner && session.user_id !== OWNER_USER_ID) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/**
 * Registr nik oboru (migrace 064) se načte hned po přihlášení, ať štítky nik sedí i v seznamech a v detailu; po
 * odhlášení se zapomene. Dokud žádná nika není zapnutá, je pro volající prázdný a appka vypadá jako dřív.
 */
function OboryNacitani() {
  const { session } = useAuth();
  const token = session?.token ?? null;
  useEffect(() => {
    // Albert 9. 11. 2026: po otevření appky začíná volání u elektrikářů (src/segment.ts vychoziNikaRelace), jednou za relaci
    if (token) void nactiNiky(token).then(() => { vychoziNikaRelace(klicNikKVolani(), true); }, () => undefined);
    else zapomenNiky();
  }, [token]);
  // Obnova registru bez přihlášení znovu (recenze B9, 8. 11. 2026): nika se zapne nebo pozastaví v DB a otevřená záložka
  // to pozná při návratu do okna nebo záložky a nejpozději za OBNOVA_NIK_MS. ⚠ NAHRAZUJE „jednou za přihlášení“.
  useEffect(() => {
    if (!token) return;
    const obnov = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void nactiNiky(token, true);
    };
    window.addEventListener('focus', obnov);
    document.addEventListener('visibilitychange', obnov);
    const casovac = window.setInterval(obnov, OBNOVA_NIK_MS);
    return () => {
      window.removeEventListener('focus', obnov);
      document.removeEventListener('visibilitychange', obnov);
      window.clearInterval(casovac);
    };
  }, [token]);
  return null;
}

/** Má přihlášený v registru nik nějaké návody (Albertovy dokumenty „Jak volat“, src/navody.ts)? Jen tehdy je v menu odkaz. */
function useMaNavody(): boolean {
  return viditelneNiky(useNiky()).some((n) => !!n.jak_volat?.trim());
}

function TopBar() {
  const { session, logout } = useAuth();
  const zavolat = useZavolat();
  const navigate = useNavigate();
  const { demo } = getConfig();
  // Stránka „Jak volat“ (Albert 9. 11. 2026): Albertovy návody (skript a slovníček) z registru; odkaz v menu, jen když
  // nějaké návody v registru jsou. NAHRAZUJE odkaz jen při zvolené nice z kroku B9 (stránka s pokyny od agenta odstraněná).
  const maNavody = useMaNavody();
  if (!session) return null;
  const isAdmin = isAdminRole(session.role);
  const isSuper = isSuperAdmin(session.role);
  const isOwner = isAdmin && session.user_id === OWNER_USER_ID;
  // odznak u kalendáře: vlastní hovory na dnešek a po termínu (migrace 050, src/zavolat.tsx)
  const kZavolani = zavolat.dnes.length;

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
        {maNavody && (
          <NavLink
            to="/jak-volat"
            data-sfx="none"
            className={({ isActive }) => `nav-pill${isActive ? ' active' : ''}`}
          >
            jak volat
          </NavLink>
        )}
        {/* Kalendář hovorů (migrace 050, Albert 21. 10. 2026): každý svůj, super admin kohokoli. Odznak = kolik
            vlastních hovorů je na dnešek a po termínu. */}
        <NavLink
          to="/kalendar"
          data-sfx="none"
          className={({ isActive }) => `nav-pill${isActive ? ' active' : ''}`}
          aria-label={kZavolani > 0 ? `kalendář, dnes zavolat: ${kZavolani}` : undefined}
        >
          kalendář
          {kZavolani > 0 && <span className="nav-badge">{kZavolani}</span>}
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
        {/* Rozvrh volání vidí každý svůj, super admin kohokoli (migrace 042, Albert 18. 10. 2026). */}
        <NavLink
          to="/rozvrh"
          data-sfx="none"
          className={({ isActive }) => `nav-pill${isActive ? ' active' : ''}`}
        >
          rozvrh
        </NavLink>
        {/* Kontakty (celou databázi) vidí od migrace 023 všichni — Albert 2026-09-24. */}
        <NavLink
          to="/admin"
          data-sfx="none"
          className={({ isActive }) => `nav-pill${isActive ? ' active' : ''}`}
        >
          kontakty
        </NavLink>
        {isAdmin && (
          <>
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
            {/* lidi zakládá a spravuje jen super admin (Albert 2026-09-24, migrace 024) */}
            {isSuper && (
              <NavLink
                to="/uzivatele"
                data-sfx="none"
                className={({ isActive }) => `nav-pill${isActive ? ' active' : ''}`}
              >
                uživatelé
              </NavLink>
            )}
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
    <ZavolatProvider>
    <div className="page wide">
      <AudioLayer />
      <OboryNacitani />
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
          path="/jak-volat"
          element={
            <RequireAuth>
              <JakVolatPage />
            </RequireAuth>
          }
        />
        <Route
          path="/kalendar"
          element={
            <RequireAuth>
              <KalendarPage />
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
          path="/rozvrh"
          element={
            <RequireAuth>
              <RozvrhPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth>
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
            <RequireAuth superAdmin>
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
    </ZavolatProvider>
  );
}
