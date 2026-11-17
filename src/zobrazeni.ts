// Zobrazený stav klienta jen pro přihlášeného (migrace 071, Albert 17. 11. 2026: volající VeraP má u dvou svých klientů
// vidět „Zaplaceno“ a ve Statistikách dva prodeje; „make sure that it's only visible there for her and for other people
// including us it stays tagged correctly“).
//
// Server (RPC zobrazene_stavy) vrací jen VLASTNÍ řádky přihlášeného [{kontakt_id, stav}]; appka je načte jednou za
// přihlášení (App.tsx, ZobrazeniNacitani) a nahradí jimi jen POPISEK stavu u těch kontaktů: odznak v Moji klienti,
// Označených, Kontaktech, na kartě ve volání a v detailu, popisek v menu stavu detailu, řádek stavu v přehledu klienta
// a věta okna „Zavolal/a jsem“. Logika, filtry, počty a zápisy jdou dál se skutečným stavem (Kontakt.status).
// Prodáno a Vyděláno ve Statistikách počítá server (my_stats, statistiky_volani), appka tu nic nepočítá. Server bez
// migrace 071 funkci nemá: supabase.ts vrátí prázdný seznam a appka ukazuje skutečné stavy jako dřív. Super admin ani
// nikdo jiný zobrazený stav jiného člověka nedostane (server).

import { useSyncExternalStore } from 'react';
import { getApi, type KontaktStatus, type ZobrazenyStav } from './api';

let mapa: ReadonlyMap<number, KontaktStatus> = new Map();
let nactenoPro: string | null = null;
let probiha: { token: string; slib: Promise<void> } | null = null;
const posluchaci = new Set<() => void>();

function oznam(): void {
  for (const f of posluchaci) f();
}

/** Nastaví zobrazené stavy (po načtení z RPC; testy). Řádek bez čísla kontaktu nebo stavu zahodí. */
export function nastavZobrazeneStavy(radky: readonly ZobrazenyStav[] | null | undefined): void {
  const nova = new Map<number, KontaktStatus>();
  for (const r of radky ?? []) {
    if (r && typeof r.kontakt_id === 'number' && typeof r.stav === 'string' && r.stav) nova.set(r.kontakt_id, r.stav);
  }
  // beze změny se nic nepřekresluje (stejný snímek pro React)
  if (nova.size === mapa.size && [...nova].every(([k, s]) => mapa.get(k) === s)) return;
  mapa = nova;
  oznam();
}

/**
 * Stav, který se u kontaktu UKÁŽE přihlášenému: jeho zobrazený stav, jinak skutečný. Jen pro popisky (odznak, text),
 * nikdy pro rozhodování, filtry ani zápis.
 */
export function zobrazenyStav(kontaktId: number | null | undefined, status: KontaktStatus): KontaktStatus {
  return (kontaktId !== null && kontaktId !== undefined ? mapa.get(kontaktId) : undefined) ?? status;
}

function prihlasit(f: () => void): () => void {
  posluchaci.add(f);
  return () => {
    posluchaci.delete(f);
  };
}
function snimek(): ReadonlyMap<number, KontaktStatus> {
  return mapa;
}

/** React: zobrazené stavy přihlášeného (komponenta se překreslí, až se načtou). */
export function useZobrazeneStavy(): ReadonlyMap<number, KontaktStatus> {
  return useSyncExternalStore(prihlasit, snimek, snimek);
}

/** React: stav, který se u kontaktu ukáže (zobrazený, jinak skutečný); překreslí se po načtení. */
export function useZobrazenyStav(kontaktId: number | null | undefined, status: KontaktStatus): KontaktStatus {
  const m = useZobrazeneStavy();
  return (kontaktId !== null && kontaktId !== undefined ? m.get(kontaktId) : undefined) ?? status;
}

/**
 * Načte zobrazené stavy přihlášeného (jednou za token, souběžná volání sdílí jeden požadavek). Chyba = žádný zobrazený
 * stav (appka ukazuje skutečné stavy); odpověď pro starší token se zahodí.
 */
export function nactiZobrazeneStavy(token: string): Promise<void> {
  if (nactenoPro === token) return Promise.resolve();
  if (probiha && probiha.token === token) return probiha.slib;
  const slib = getApi()
    .zobrazeneStavy(token)
    .then((r) => {
      if (probiha?.token === token) {
        nactenoPro = token;
        nastavZobrazeneStavy(Array.isArray(r) ? r : []);
      }
    })
    .catch(() => {
      if (probiha?.token === token) nastavZobrazeneStavy([]);
    })
    .finally(() => {
      if (probiha?.token === token) probiha = null;
    });
  probiha = { token, slib };
  return slib;
}

/** Odhlášení: zobrazené stavy pryč (další přihlášený je vidět nesmí). */
export function zapomenZobrazeneStavy(): void {
  nactenoPro = null;
  probiha = null;
  nastavZobrazeneStavy([]);
}
