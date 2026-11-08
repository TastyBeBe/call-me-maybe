// Registr nik rodiny obor v appce (migrace 064, Albert 7. 11. 2026; návrh oborů oddíl 6).
//
// Appka žádnou niku nezná jménem: klíče, štítky, ikony, pořadí, zástupné ceny a „Jak volat“ čte z RPC app_obor_niky.
// Volající dostane jen niky, které smí teď volat (stav zapnuto, R9: všichni volající); super admin všechny i se stavem.
// Dokud žádná nika není zapnutá, je seznam pro volající prázdný a appka vypadá jako dřív (Chaty · Architekti).
// Server bez migrace 064 funkci nemá: supabase.ts vrátí prázdný seznam.

import { useSyncExternalStore } from 'react';
import { getApi, type OborNika, type StavNiky } from './api';

let niky: readonly OborNika[] = [];
let nactenoPro: string | null = null;
let probiha: { token: string; slib: Promise<readonly OborNika[]> } | null = null;
const posluchaci = new Set<() => void>();

function oznam(): void {
  for (const f of posluchaci) f();
}

/** Nastaví registr (po načtení z RPC; testy). Seřadí podle `poradi` jako server. */
export function nastavNiky(seznam: readonly OborNika[]): void {
  const nove = [...seznam].sort((a, b) => (a.poradi ?? 9999) - (b.poradi ?? 9999) || a.klic.localeCompare(b.klic));
  // Obnova každých pár minut a při návratu do záložky: beze změny se nic nepřekresluje (stejný snímek pro React)
  if (JSON.stringify(nove) === JSON.stringify(niky)) return;
  niky = nove;
  oznam();
}

/**
 * Jak často appka registr nik načte znovu, i když je záložka pořád otevřená (ms). Proč: nika se zapíná a pozastavuje
 * v DB (obor_niky.stav) bez nasazení appky; bez obnovy by volající s otevřenou záložkou po zapnutí autoservisu tlačítko
 * Obory neviděl, dokud stránku sám nenačte znovu (recenze kroku B9, 8. 11. 2026).
 */
export const OBNOVA_NIK_MS = 5 * 60 * 1000;

/** Chyba next_contact, po které je registr zastaralý (nika mezitím pozastavená nebo jen pro vybrané). */
export function jeChybaZastaraleNiky(zprava: string): boolean {
  return /není spuštěný|volají jen vybraní/i.test(zprava);
}

/** Všechny niky, které server poslal (volajícímu jen ty, které smí volat). */
export function vsechnyNiky(): readonly OborNika[] {
  return niky;
}

/** Řádek registru pro klíč, nebo undefined (nika, kterou server neposlal). */
export function nikaInfo(klic: string | null | undefined): OborNika | undefined {
  return klic ? niky.find((n) => n.klic === klic) : undefined;
}

/** Stavy, které super admin vidí na přepínači se štítkem stavu (fronta je i pro něj prázdná, dokud nika není zapnutá). */
const STAVY_SUPER: readonly StavNiky[] = ['zkouska', 'pozastaveno'];

/** Popisek stavu niky pro super admina. */
export const STAV_NIKY_POPISEK: Record<StavNiky, string> = {
  priprava: 'příprava',
  zkouska: 'zkouška',
  zapnuto: 'zapnuto',
  pozastaveno: 'pozastaveno',
  karantena: 'karanténa',
};

/**
 * Niky na přepínači a ve filtrech: ty, které přihlášený smí volat (stav zapnuto), a super adminovi navíc niky ve stavu
 * zkouška a pozastaveno (se štítkem stavu). Příprava a karanténa nikdy (návrh 6.2).
 */
export function viditelneNiky(seznam: readonly OborNika[] = niky): OborNika[] {
  return seznam.filter((n) => n.smi_volat || (!!n.stav && STAVY_SUPER.includes(n.stav)));
}

/** Klíče nik, které přihlášený smí teď volat (jen pro ně se volá next_contact). */
export function klicNikKVolani(seznam: readonly OborNika[] = niky): string[] {
  return seznam.filter((n) => n.smi_volat).map((n) => n.klic);
}

/** Smí přihlášený niku teď volat? (stav zapnuto a R9; podle registru, jinak ne) */
export function nikaVolatelna(klic: string): boolean {
  return !!nikaInfo(klic)?.smi_volat;
}

function prihlasit(f: () => void): () => void {
  posluchaci.add(f);
  return () => posluchaci.delete(f);
}

/** React: registr nik (překreslí se po načtení). */
export function useNiky(): readonly OborNika[] {
  return useSyncExternalStore(prihlasit, vsechnyNiky, vsechnyNiky);
}

/**
 * Načte registr pro přihlášeného (jednou za token, souběžná volání sdílí jeden požadavek). Chyba = prázdný registr
 * (appka jede dál s chatami a architekty); `znovu` načte i po úspěšném načtení.
 */
export function nactiNiky(token: string, znovu = false): Promise<readonly OborNika[]> {
  if (!znovu && nactenoPro === token) return Promise.resolve(niky);
  if (probiha && probiha.token === token) return probiha.slib;
  const slib = getApi()
    .oborNiky(token)
    .then((r) => {
      if (probiha?.token === token) {
        nactenoPro = token;
        nastavNiky(Array.isArray(r) ? r : []);
      }
      return niky;
    })
    .catch(() => {
      if (probiha?.token === token) nastavNiky([]);
      return niky;
    })
    .finally(() => {
      if (probiha?.token === token) probiha = null;
    });
  probiha = { token, slib };
  return slib;
}

/** Odhlášení: registr pryč (další přihlášený může vidět jiné niky). */
export function zapomenNiky(): void {
  nactenoPro = null;
  probiha = null;
  nastavNiky([]);
}
