import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getApi, type Session } from './api';

export const LS_SESSION = 'volacka_session';

/** Albertův účet (users.id = 1): jediný, kdo smí přepínat účet automatizace. */
export const OWNER_USER_ID = 1;

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(loadSession);

  const login = useCallback(async (username: string, password: string) => {
    const s = await getApi().login(username, password);
    setSession(s);
    try {
      localStorage.setItem(LS_SESSION, JSON.stringify(s));
    } catch {
      // ignoruj
    }
    return s;
  }, []);

  const logout = useCallback(async () => {
    const current = session;
    setSession(null);
    try {
      localStorage.removeItem(LS_SESSION);
    } catch {
      // ignoruj
    }
    if (current) {
      try {
        await getApi().logout(current.token);
      } catch {
        // odhlášení na serveru selhalo — token stejně zahazujeme
      }
    }
  }, [session]);

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
