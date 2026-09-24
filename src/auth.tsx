import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getApi, type Session } from './api';
import { OWNER_USER_ID } from './roles';

export const LS_SESSION = 'volacka_session';

/** Albertův účet (users.id = 1): majitel — Automatizace, role, všichni lidé. Viz roles.ts. */
export { OWNER_USER_ID };

interface AuthCtx {
  session: Session | null;
  login: (username: string, password: string) => Promise<Session>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  session: null,
  login: async () => {
    throw new Error('AuthProvider chybí.');
  },
  logout: async () => {},
});

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(LS_SESSION);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (!s.token || !s.role) return null;
    return s;
  } catch {
    return null;
  }
}

function storeSession(s: Session | null): void {
  try {
    if (s) localStorage.setItem(LS_SESSION, JSON.stringify(s));
    else localStorage.removeItem(LS_SESSION);
  } catch {
    // ignoruj
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(loadSession);

  const login = useCallback(async (username: string, password: string) => {
    const s = await getApi().login(username, password);
    setSession(s);
    storeSession(s);
    return s;
  }, []);

  const logout = useCallback(async () => {
    const current = session;
    setSession(null);
    storeSession(null);
    if (current) {
      try {
        await getApi().logout(current.token);
      } catch {
        // odhlášení na serveru selhalo — token stejně zahazujeme
      }
    }
  }, [session]);

  // ROLE SE OBNOVUJÍ ZE SERVERU (migrace 023, Albert 2026-09-24). Do té doby appka
  // věřila roli uložené při přihlášení navždy — kdo dostal novou roli (super admin,
  // admin, volající), viděl starou appku, dokud se neodhlásil. Server rozhoduje sám,
  // tohle jen srovná, co appka ukazuje. Při výpadku sítě se nic nemění.
  const token = session?.token ?? null;
  useEffect(() => {
    if (!token) return;
    let alive = true;
    getApi()
      .me(token)
      .then((me) => {
        if (!alive || !me) return;
        setSession((prev) => {
          if (!prev || prev.token !== token) return prev;
          if (prev.role === me.role && prev.display_name === me.display_name) return prev;
          const next: Session = { ...prev, role: me.role, display_name: me.display_name };
          storeSession(next);
          return next;
        });
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        // neplatná / vypršelá relace = odhlásit; síťová chyba = nechat být
        if (alive && /relace|token/i.test(msg)) {
          setSession(null);
          storeSession(null);
        }
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const value = useMemo(() => ({ session, login, logout }), [session, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  return useContext(Ctx);
}

/** Vrátí session; volat jen uvnitř chráněných routes. */
export function useSession(): Session {
  const { session } = useAuth();
  if (!session) throw new Error('Není přihlášený uživatel.');
  return session;
}
