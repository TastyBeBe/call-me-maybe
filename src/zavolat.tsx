// PŘIPOMÍNKY NAPLÁNOVANÝCH HOVORŮ (migrace 050, Albert 21. 10. 2026: „a calendar of people to call … in the day
// of the call, there should be a reminder“). Jeden poskytovatel pro celou appku:
//  - každou minutu (a hned po každé změně: výsledek hovoru, naplánování, přesun, zrušení, hotovo; událost
//    `cmm:zavolat-changed` z src/api/index.ts) si načte SVŮJ kalendář (zavolat_seznam bez p_user_id, i super admin
//    jen svůj: připomínka je pro toho, kdo má volat);
//  - z něj počítá odznak u záložky „kalendář“ a lištu na Domů (dnešní a po termínu);
//  - když se blíží čas vlastního čekajícího hovoru (5 minut před až 30 minut po), ukáže v rohu upozornění se zvukem
//    (audio.play, takže platí vypínač zvuků v appce) a tlačítky „Zavolat teď“ a „Později“. Každý hovor jen jednou:
//    ukázaná id si pamatuje localStorage pro toho člověka (s try/catch: soukromé okno, zakázané úložiště).
// Server bez migrace 050 RPC nezná: chyba se tu nikdy neukazuje, nic se nezobrazí (jako RozvrhPripominka na Domů).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { getApi, type ZavolatPolozka, type ZavolatSeznam } from './api';
import { audio } from './audio';
import { useAuth } from './auth';
import { prahaDen } from './praha';
import { formatKdyVeta, formatRelativne, kontaktJmeno } from './ui';

const OBNOVA_MS = 60 * 1000;
const KONTROLA_MS = 15 * 1000;
/** Okno upozornění: 5 minut před časem hovoru až 30 minut po něm. */
export const PRIPOMINKA_PRED_MS = 5 * 60 * 1000;
export const PRIPOMINKA_PO_MS = 30 * 60 * 1000;
/** Klíč localStorage s id hovorů, na které appka už upozornila (+ user_id). */
export const LS_PRIPOMENUTO = 'volacka_zavolat_pripomenuto_';

/** Vlastní čekající hovory na dnešek (i ty, jejichž čas už minul) a po termínu z dřívějška, nejstarší první. */
export function dnesAPoTerminu(seznam: ZavolatSeznam | null): ZavolatPolozka[] {
  if (!seznam) return [];
  return seznam.polozky
    .filter((z) => z.stav === 'ceka' && z.muj && prahaDen(z.kdy) <= seznam.dnes)
    .sort((a, b) => new Date(a.kdy).getTime() - new Date(b.kdy).getTime() || a.id - b.id);
}

/** První vlastní čekající hovor v okně upozornění, na který appka ještě neupozornila. */
export function kUpozorneni(seznam: ZavolatSeznam | null, ted: number, uz: Set<number>): ZavolatPolozka | null {
  if (!seznam) return null;
  return (
    seznam.polozky
      .filter((z) => {
        if (z.stav !== 'ceka' || !z.muj || uz.has(z.id)) return false;
        const t = new Date(z.kdy).getTime();
        return t - PRIPOMINKA_PRED_MS <= ted && ted <= t + PRIPOMINKA_PO_MS;
      })
      .sort((a, b) => new Date(a.kdy).getTime() - new Date(b.kdy).getTime() || a.id - b.id)[0] ?? null
  );
}

function nactiPripomenuto(uid: number): Set<number> {
  try {
    const raw = localStorage.getItem(LS_PRIPOMENUTO + uid);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is number => typeof x === 'number') : []);
  } catch {
    return new Set();
  }
}

function ulozPripomenuto(uid: number, ids: Set<number>): void {
  try {
    // posledních 200 stačí: starší hovory už v okně upozornění nikdy nebudou
    localStorage.setItem(LS_PRIPOMENUTO + uid, JSON.stringify([...ids].slice(-200)));
  } catch {
    // úložiště nedostupné: upozornění se po reloadu může ukázat znovu, nic horšího
  }
}

interface ZavolatCtx {
  /** vlastní kalendář (null = ještě nenačtený, nebo ho server nezná) */
  seznam: ZavolatSeznam | null;
  obnovit: () => void;
  /** dnešní a po termínu (odznak, lišta na Domů) */
  dnes: ZavolatPolozka[];
  /** vlastní čekající hovor kontaktu (detail kontaktu), jinak null */
  hovorKontaktu: (kontaktId: number) => ZavolatPolozka | null;
}

const Ctx = createContext<ZavolatCtx>({
  seznam: null,
  obnovit: () => {},
  dnes: [],
  hovorKontaktu: () => null,
});

export function useZavolat(): ZavolatCtx {
  return useContext(Ctx);
}

export function ZavolatProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const token = session?.token ?? null;
  const uid = session?.user_id ?? null;
  const [seznam, setSeznam] = useState<ZavolatSeznam | null>(null);
  const [ted, setTed] = useState(() => Date.now());
  const [upozorneni, setUpozorneni] = useState<ZavolatPolozka | null>(null);
  const pripomenuto = useRef<Set<number>>(new Set());
  const posledni = useRef(0);

  const obnovit = useCallback(() => {
    if (!token) return;
    const muj = ++posledni.current;
    getApi()
      .zavolatSeznam(token)
      .then((s) => {
        if (muj !== posledni.current) return; // mezitím přišla novější odpověď (nebo odhlášení)
        setSeznam(s);
        setTed(Date.now());
      })
      .catch(() => {
        // server bez migrace 050, výpadek sítě: nic se neukazuje, poslední data zůstanou
      });
  }, [token]);

  useEffect(() => {
    posledni.current += 1;
    setSeznam(null);
    setUpozorneni(null);
    pripomenuto.current = uid === null ? new Set() : nactiPripomenuto(uid);
    if (!token) return;
    obnovit();
    const interval = window.setInterval(obnovit, OBNOVA_MS);
    const hodiny = window.setInterval(() => setTed(Date.now()), KONTROLA_MS);
    const zmena = () => obnovit();
    const navrat = () => {
      if (document.visibilityState === 'visible') obnovit();
    };
    window.addEventListener('cmm:zavolat-changed', zmena);
    document.addEventListener('visibilitychange', navrat);
    return () => {
      window.clearInterval(interval);
      window.clearInterval(hodiny);
      window.removeEventListener('cmm:zavolat-changed', zmena);
      document.removeEventListener('visibilitychange', navrat);
    };
  }, [token, uid, obnovit]);

  // upozornění: jen jedno naráz; každý hovor jen jednou (pamatuje se hned při ukázání)
  useEffect(() => {
    if (upozorneni || uid === null) return;
    const z = kUpozorneni(seznam, ted, pripomenuto.current);
    if (!z) return;
    pripomenuto.current.add(z.id);
    ulozPripomenuto(uid, pripomenuto.current);
    setUpozorneni(z);
    audio.play('send');
  }, [seznam, ted, upozorneni, uid]);

  // hovor, který mezitím zmizel z čekajících (vyřízený, zrušený), upozornění zavře
  useEffect(() => {
    if (upozorneni && seznam && !seznam.polozky.some((z) => z.id === upozorneni.id && z.stav === 'ceka')) {
      setUpozorneni(null);
    }
  }, [seznam, upozorneni]);

  const dnes = useMemo(() => dnesAPoTerminu(seznam), [seznam]);
  const hovorKontaktu = useCallback(
    (kontaktId: number) => seznam?.polozky.find((z) => z.stav === 'ceka' && z.muj && z.kontakt_id === kontaktId) ?? null,
    [seznam]
  );
  const value = useMemo(() => ({ seznam, obnovit, dnes, hovorKontaktu }), [seznam, obnovit, dnes, hovorKontaktu]);

  const zavolatTed = () => {
    const z = upozorneni;
    setUpozorneni(null);
    if (!z) return;
    // ve frontě volání: karta ve volání (zavolat_vzit); klient mimo frontu kartu nemá, číslo je v kalendáři
    navigate(z.ve_fronte ? `/call?zavolat=${z.id}` : '/kalendar');
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {session && upozorneni && (
        <div className="card zavolat-toast" role="status" aria-live="polite">
          <p className="zavolat-toast-titulek">
            {new Date(upozorneni.kdy).getTime() > ted ? 'Za chvíli máš zavolat' : 'Je čas zavolat'}
          </p>
          <p className="zavolat-toast-text">
            <strong>{kontaktJmeno(upozorneni.kontakt)}</strong> · {formatKdyVeta(upozorneni.kdy)} (
            {formatRelativne(upozorneni.kdy, ted)})
          </p>
          {upozorneni.poznamka && <p className="zavolat-toast-pozn">{upozorneni.poznamka}</p>}
          <div className="zavolat-toast-akce">
            <button type="button" className="pill-btn go sm" data-sfx="none" onClick={zavolatTed}>
              Zavolat teď
            </button>
            <button type="button" className="pill-btn sm" onClick={() => setUpozorneni(null)}>
              Později
            </button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
