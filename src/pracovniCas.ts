// NEVIDITELNÝ ČASOVAČ PRÁCE (Přehled vedení, Albert 17. 11. 2026, rozhodnutí D5: „It starts when a caller opens a client card
// and then enters a call result, keeps running while they keep entering results, and stops when they close the app. If no
// result is entered for more than 30 minutes, the counted time ends at the last click … Callers do not see the timer.“).
//
// Appka posílá serveru jen tři signály (prace_tep, migrace 072, kontrakt §4.1), vždy za přihlášeného (server bere uživatele
// z tokenu):
//  - karta: jednou za každou kartu ve volání (CallPage ji hlásí přes nastavKartu; kontrola karty každou sekundu),
//  - tep: každých 60 s, dokud je stránka vidět a někdo je přihlášený (a hned po otevření appky, po přihlášení a po návratu
//    na stránku),
//  - konec: když se stránka zavře nebo schová (pagehide, visibilitychange hidden), jednou; supabase.ts ho posílá
//    fetch s keepalive, takže dojde i ze zavírané stránky.
// Odpracovaný čas z nich a z výsledků hovorů počítá jen server (kontrakt §5.14: sezení z výsledků s mezerami nejvýš 30 min,
// začátek z karty, konec z konce nebo posledního signálu, po víc než 30 min bez výsledku poslední výsledek). Appka nic
// nepočítá a nic neukazuje: žádné UI, žádný text, chyby se polykají (časovač nesmí rušit volání). Server bez migrace 072
// (praceTep vrátí false, PGRST202) časovač zastaví. Po odhlášení (getToken vrátí null) nejde žádný signál.

import type { DruhSignalu } from './api/types';

/** Tep každých 60 s, dokud je stránka vidět (kontrakt §4.1; server počítá appku za otevřenou do 150 s mezi signály). */
export const TEP_MS = 60_000;
/** Jak často se časovač podívá, jestli je ve volání jiná karta a jestli se někdo přihlásil (signál nejvýš 1 s potom). */
export const KARTA_MS = 1_000;

/** Co časovač od API potřebuje (getApi().praceTep): true = signál přijatý, false = server funkci nemá (bez migrace 072). */
export interface CasovacApi {
  praceTep(token: string, druh: DruhSignalu, kontaktId?: number | null): Promise<boolean>;
}

/* ---------- karta na obrazovce volání (CallPage) ---------- */

let kartaNaObrazovce: number | null = null;

/** CallPage: kontakt karty, která je teď na obrazovce volání, nebo null (načítání, prázdná fronta, odchod z volání). */
export function nastavKartu(id: number | null): void {
  kartaNaObrazovce = id;
}

/** Karta na obrazovce volání (getKarta pro spustCasovac v App.tsx). */
export function aktualniKarta(): number | null {
  return kartaNaObrazovce;
}

/* ---------- časovač ---------- */

const stranaVidet = (): boolean => typeof document === 'undefined' || document.visibilityState !== 'hidden';

/**
 * Spustí časovač: signály jdou přes `api` s tokenem z `getToken()` (čte se u každého signálu; null = nikdo přihlášený, nic se
 * neposílá) a karta z `getKarta()`. Vrátí funkci, která časovač zastaví (intervaly i posluchače pryč).
 */
export function spustCasovac(api: CasovacApi, getToken: () => string | null, getKarta: () => number | null): () => void {
  let bezi = true;
  /** karta, za kterou už signál odešel (null = žádná karta na obrazovce) */
  let karta: number | null = null;
  /** token při poslední kontrole: jiný (přihlášení, jiný člověk) = hned tep, jako po otevření appky */
  let prihlaseni: string | null = getToken();
  /** konec už odešel a stránka se od té doby neukázala (pagehide po visibilitychange hidden druhý konec neposílá) */
  let konecOdesel = false;

  const posli = (druh: DruhSignalu, kontaktId: number | null = null): void => {
    if (!bezi) return;
    const token = getToken();
    if (!token) return;
    let odpoved: Promise<boolean>;
    try {
      odpoved = api.praceTep(token, druh, kontaktId);
    } catch {
      return;
    }
    void Promise.resolve(odpoved).then(
      (umi) => {
        if (umi === false) zastav();
      },
      () => undefined
    );
  };

  const zkontrolujKartu = (): void => {
    const id = getKarta();
    if (id === karta) return;
    karta = id;
    if (id !== null) posli('karta', id);
  };

  const tep = (): void => {
    if (stranaVidet()) posli('tep');
  };

  const konec = (): void => {
    if (konecOdesel) return;
    konecOdesel = true;
    posli('konec');
  };

  const priViditelnosti = (): void => {
    if (!stranaVidet()) {
      konec();
      return;
    }
    konecOdesel = false;
    tep();
  };

  /** Každou sekundu: přihlášení (nový token) = hned tep, pak karta na obrazovce. */
  const kontrola = (): void => {
    const token = getToken();
    if (token !== prihlaseni) {
      prihlaseni = token;
      if (token) {
        konecOdesel = false;
        tep();
      }
    }
    zkontrolujKartu();
  };

  const intervalKarty = setInterval(kontrola, KARTA_MS);
  const intervalTepu = setInterval(tep, TEP_MS);
  window.addEventListener('pagehide', konec);
  document.addEventListener('visibilitychange', priViditelnosti);

  function zastav(): void {
    if (!bezi) return;
    bezi = false;
    clearInterval(intervalKarty);
    clearInterval(intervalTepu);
    window.removeEventListener('pagehide', konec);
    document.removeEventListener('visibilitychange', priViditelnosti);
  }

  tep();
  zkontrolujKartu();
  return zastav;
}
