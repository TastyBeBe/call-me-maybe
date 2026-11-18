// SPOLEČNÉ KUSY NASTAVENÍ PŘEHLEDU (Přehled vedení úkol 14b, Albert 17. 11. 2026, D6, D9 a D10; spec §7.2: gear „Nastavení“ s Cíli,
// Náklady a Výplatami provizí). Načtení seznamu ze serveru (starý seznam zůstane vidět, než přijde nový, ať tlačítka i fokus
// přežijí obnovu po uložení), hláška o uložení v živé oblasti (role status, čtečka ji přečte), věta serveru u formuláře (role
// alert) s odkazem z pole, které myslí (aria-invalid, aria-describedby), potvrzení zrušení jako okno (role dialog, Tab zůstává
// v okně, Escape a „Ponechat“ nechají řádek, fokus zpět na tlačítko) a tlačítka řádku, nebo „jen ke čtení“, když přihlášený
// řádek měnit nesmí. Volajícímu se nic z toho nevykreslí (stránka Přehledu ho přesměruje dřív).

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BEZ_072_NASTAVENI } from '../../api/supabase';
import { useSession } from '../../auth';
import { WarningIcon, ZnovuIcon } from '../../icons';
import { errMsg, useOkno } from '../../ui';
import { usePrehled } from './kontext';

export interface SeznamNastaveni<T> {
  radky: T[] | null;
  chyba: string | null;
  nacita: boolean;
  znovu: () => void;
}

/** Seznam nastavení (cile_seznam, naklady_seznam, provize_vyplaty_seznam): při obnově zůstanou staré řádky do nové odpovědi. */
export function useSeznamNastaveni<T>(nacti: (token: string) => Promise<T[]>): SeznamNastaveni<T> {
  const session = useSession();
  const [radky, setRadky] = useState<T[] | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [nacita, setNacita] = useState(true);
  const [kolo, setKolo] = useState(0);
  const cislo = useRef(0);
  const nactiRef = useRef(nacti);
  nactiRef.current = nacti;
  useEffect(() => {
    const moje = ++cislo.current;
    setNacita(true);
    nactiRef
      .current(session.token)
      .then((r) => {
        if (moje !== cislo.current) return;
        setRadky(r);
        setChyba(null);
        setNacita(false);
      })
      .catch((e: unknown) => {
        if (moje !== cislo.current) return;
        setRadky(null);
        setChyba(errMsg(e));
        setNacita(false);
      });
  }, [session.token, kolo]);
  const znovu = useCallback(() => setKolo((k) => k + 1), []);
  return { radky, chyba, nacita, znovu };
}

/** Načítání seznamu (role status, ať ho čtečka ohlásí). */
export function NacitaniNastaveni({ text }: { text: string }) {
  return (
    <p className="loading nastaveni-nacita" role="status">
      {text}
    </p>
  );
}

/**
 * Seznam se nenačetl: věta (server bez migrace 072 vlastním nadpisem) a „Zkusit znovu“; bez karty v kartě (sekce už kartou je).
 */
export function ChybaNastaveni({ text, onZnovu }: { text: string; onZnovu: () => void }) {
  const migrace = text === BEZ_072_NASTAVENI;
  return (
    <div className="prehled-chyba nastaveni-chyba-seznamu" role="alert">
      <p className="prehled-chyba-nadpis">
        <WarningIcon size={20} /> {migrace ? 'Nastavení potřebuje migraci 072' : 'Seznam se nepodařilo načíst'}
      </p>
      <p className="prehled-chyba-text">{text}</p>
      <button type="button" className="pill-btn sm" data-sfx="none" onClick={onZnovu}>
        <ZnovuIcon size={14} /> Zkusit znovu
      </button>
    </div>
  );
}

/** Hláška o uložení nebo zrušení: živá oblast je na stránce pořád (čtečka ohlásí novou větu), prázdná nic nezabírá. */
export function HlaskaNastaveni({ text }: { text: string }) {
  return (
    <p className={`nastaveni-hlaska${text ? ' info-box' : ''}`} role="status">
      {text}
    </p>
  );
}

/** Věta serveru u formuláře (role alert, přečte se hned); `id` = cíl aria-describedby pole, které věta myslí. */
export function ChybaFormulare({ id, text }: { id: string; text: string | null }) {
  if (!text) return null;
  return (
    <p id={id} className="error-box nastaveni-chyba" role="alert">
      {text}
    </p>
  );
}

/** Pole formuláře s popiskem (label for), hvězdičkou povinného a nápovědou pod ním. */
export function PoleFormulare({ id, popisek, povinne = false, napoveda, children }: { id: string; popisek: ReactNode; povinne?: boolean; napoveda?: ReactNode; children: ReactNode }) {
  return (
    <div className="field nastaveni-pole">
      <label htmlFor={id}>
        {popisek}
        {povinne ? <span className="req"> *</span> : null}
      </label>
      {children}
      {napoveda ? <p id={`${id}-napoveda`} className="nastaveni-napoveda">{napoveda}</p> : null}
    </div>
  );
}

/**
 * Atributy pole podle věty serveru: když ji `poleChyby` přiřadí tomuto poli (`pole` = klíč serveru), aria-invalid a odkaz na větu;
 * s `napoveda` i odkaz na nápovědu pole (id `<idPole>-napoveda` z PoleFormulare).
 */
export function atributyPole(pole: string, idPole: string, chybnePole: string | null, idChyby: string, napoveda = false): { 'aria-invalid'?: true; 'aria-describedby'?: string } {
  const popsano = [chybnePole === pole ? idChyby : null, napoveda ? `${idPole}-napoveda` : null].filter(Boolean).join(' ');
  return { ...(chybnePole === pole ? { 'aria-invalid': true as const } : {}), ...(popsano ? { 'aria-describedby': popsano } : {}) };
}

/** Tlačítka řádku (Upravit, Zrušit…) s tím, co mění, pro čtečky; bez práva „jen ke čtení“ s důvodem. */
export function AkceRadku({ co, popis, smi, proc, onUpravit, onZrusit }: {
  /** „cíl“, „náklad“, „výplatu“ */
  co: string;
  /** řádek slovy do názvu tlačítek („Hodnota prodejů, Celá firma, …“) */
  popis: string;
  smi: boolean;
  /** proč jen ke čtení (bublina) */
  proc: string;
  onUpravit: (el: HTMLButtonElement) => void;
  onZrusit: (el: HTMLButtonElement) => void;
}) {
  if (!smi) {
    return (
      <span className="nastaveni-jen-cteni" title={proc}>
        jen ke čtení<span className="sr-only">: {proc}</span>
      </span>
    );
  }
  return (
    <span className="nastaveni-akce-tlacitka">
      <button type="button" className="pill-btn sm" data-akce="upravit" data-sfx="none" aria-label={`Upravit ${co}: ${popis}`} onClick={(e) => onUpravit(e.currentTarget)}>
        Upravit
      </button>
      <button type="button" className="pill-btn sm nastaveni-zrusit" data-akce="zrusit" data-sfx="none" aria-label={`Zrušit ${co}: ${popis}`} onClick={(e) => onZrusit(e.currentTarget)}>
        Zrušit…
      </button>
    </span>
  );
}

/**
 * Potvrzení zrušení řádku (okno): co se ruší a co se stane; fokus na „Ponechat“ (bezpečná volba), Tab zůstává v okně, Escape a
 * „Ponechat“ okno zavřou a fokus vrátí na tlačítko řádku (useOkno). Chyba serveru zůstane v okně.
 */
export function PotvrzeniZruseni({ nadpis, popis, dusledek, potvrdit, busy, chyba, onPotvrdit, onZpet }: {
  nadpis: string;
  popis: string;
  dusledek: string;
  potvrdit: string;
  busy: boolean;
  chyba: string | null;
  onPotvrdit: () => void;
  onZpet: () => void;
}) {
  const okno = useRef<HTMLDivElement>(null);
  useOkno(okno, onZpet, busy);
  const id = useId();
  return createPortal(
    <div className="scrim dovolani-scrim" onClick={() => !busy && onZpet()}>
      <div ref={okno} className="modal card nastaveni-potvrzeni" role="dialog" aria-modal="true" aria-labelledby={`${id}-nadpis`} aria-describedby={`${id}-popis`}
        onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title" id={`${id}-nadpis`}>
          {nadpis}
        </h3>
        <div className="modal-body" id={`${id}-popis`}>
          <p className="nastaveni-potvrzeni-co">{popis}</p>
          <p className="nastaveni-potvrzeni-dusledek">{dusledek}</p>
        </div>
        {chyba ? (
          <p className="error-box nastaveni-chyba" role="alert">
            {chyba}
          </p>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="pill-btn" data-akce="ponechat" data-autofocus data-sfx="none" onClick={onZpet} disabled={busy}>
            Ponechat
          </button>
          <button type="button" className="pill-btn warn" data-akce="potvrdit" data-sfx="none" onClick={onPotvrdit} disabled={busy}>
            {busy ? 'Ruším…' : potvrdit}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Fokus po zavření formuláře nebo okna: na prvek, ze kterého se otevřelo, když pořád je; jinak na náhradní (tlačítko Přidat nebo
 * nadpis sekce).
 */
export function vratFokus(odkud: HTMLElement | null, nahradni: HTMLElement | null): void {
  setTimeout(() => {
    if (odkud && odkud.isConnected) odkud.focus();
    else nahradni?.focus();
  }, 0);
}

/**
 * Správa jedné sekce nastavení: seznam, formulář (nový nebo úprava řádku), uložení, potvrzené zrušení a hlášky. Po každém
 * úspěšném uložení nebo zrušení seznam znovu a `zmenaDat` z kontextu Přehledu (záložky se načtou znovu, hlavička čerstvosti
 * taky). Formulář se otevře s fokusem na prvním poli (`prvniPole`), zavře se s fokusem tam, odkud se otevřel.
 */
export function useSpravaNastaveni<R extends { id: number }, F>({ nacti, uloz, zrus, ulozeno, zruseno }: {
  nacti: (token: string) => Promise<R[]>;
  uloz: (token: string, f: F) => Promise<unknown>;
  zrus: (token: string, id: number) => Promise<unknown>;
  /** hláška po uložení („Cíl uložen.“) */
  ulozeno: string;
  /** hláška po zrušení („Cíl zrušen.“) */
  zruseno: string;
}) {
  const session = useSession();
  const { zmenaDat } = usePrehled();
  const seznam = useSeznamNastaveni(nacti);
  const [formular, setFormular] = useState<F | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hlaska, setHlaska] = useState('');
  const [rusit, setRusit] = useState<R | null>(null);
  const [chybaRuseni, setChybaRuseni] = useState<string | null>(null);
  const [busyRuseni, setBusyRuseni] = useState(false);
  const [otevreni, setOtevreni] = useState(0);
  const odkud = useRef<HTMLElement | null>(null);
  const pridat = useRef<HTMLButtonElement>(null);
  const prvniPole = useRef<HTMLSelectElement>(null);
  const ulozRef = useRef(uloz);
  ulozRef.current = uloz;
  const zrusRef = useRef(zrus);
  zrusRef.current = zrus;
  // každé otevření formuláře (i přepnutí na jiný řádek) dá fokus na první pole
  useEffect(() => {
    if (otevreni > 0) prvniPole.current?.focus();
  }, [otevreni]);
  const otevrit = useCallback((f: F, el: HTMLElement | null) => {
    odkud.current = el;
    setFormular(f);
    setChyba(null);
    setHlaska('');
    setOtevreni((n) => n + 1);
  }, []);
  const zmenit = useCallback((zmena: Partial<F>) => setFormular((f) => (f ? { ...f, ...zmena } : f)), []);
  const zavrit = useCallback(() => {
    setFormular(null);
    setChyba(null);
    vratFokus(odkud.current, pridat.current);
  }, []);
  const ulozit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formular || busy) return;
    setBusy(true);
    setChyba(null);
    setHlaska('');
    try {
      await ulozRef.current(session.token, formular);
      setFormular(null);
      setHlaska(ulozeno);
      seznam.znovu();
      zmenaDat();
      vratFokus(odkud.current, pridat.current);
    } catch (err) {
      setChyba(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  const zacitRusit = useCallback((r: R) => {
    setRusit(r);
    setChybaRuseni(null);
  }, []);
  const zpetRuseni = useCallback(() => {
    setRusit(null);
    setChybaRuseni(null);
  }, []);
  const potvrditRuseni = async () => {
    if (!rusit || busyRuseni) return;
    setBusyRuseni(true);
    setChybaRuseni(null);
    try {
      await zrusRef.current(session.token, rusit.id);
      setRusit(null);
      setHlaska(zruseno);
      // zrušený řádek zmizí, i když byl otevřený ve formuláři
      setFormular(null);
      seznam.znovu();
      zmenaDat();
      // řádek po obnově seznamu zmizí: fokus na „Přidat“ (okno ho napřed vrátí na tlačítko řádku, tohle přijde po něm)
      vratFokus(null, pridat.current);
    } catch (err) {
      setChybaRuseni(errMsg(err));
    } finally {
      setBusyRuseni(false);
    }
  };
  return { seznam, formular, otevrit, zmenit, zavrit, ulozit, busy, chyba, hlaska, rusit, zacitRusit, zpetRuseni, potvrditRuseni, chybaRuseni, busyRuseni, pridat, prvniPole };
}
