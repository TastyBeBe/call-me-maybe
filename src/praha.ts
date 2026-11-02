// ČAS V PRAZE (migrace 050, Albert 21. 10. 2026): kalendář hovorů počítá dny a časy v Praze, stejně jako server
// (zavolat_seznam vrací `dnes` = dnešní den v Praze, týden výdělku je pondělí až neděle v Praze, události píšou čas
// „DD.MM.YYYY HH24:MI“ v Praze). Appka proto ukazuje a zadává čas naplánovaného hovoru vždy v pražském čase, i když
// je telefon nastavený jinak (dovolená v cizině): „zavolat v 15:00“ je 15:00 u klienta. Bez knihoven, jen Intl.
// Tenhle soubor nemá React, používá ho i DEMO mock (src/api/mock.ts) a testy.

const CASTI = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Prague',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function casti(t: number): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  const o: Record<string, number> = {};
  for (const p of CASTI.formatToParts(new Date(t))) {
    if (p.type !== 'literal') o[p.type] = Number(p.value);
  }
  return { y: o.year, m: o.month, d: o.day, h: o.hour === 24 ? 0 : o.hour, mi: o.minute, s: o.second };
}

const dva = (n: number) => String(n).padStart(2, '0');

function naCas(x: Date | string | number): number {
  return x instanceof Date ? x.getTime() : typeof x === 'number' ? x : new Date(x).getTime();
}

/** Den v Praze jako YYYY-MM-DD. */
export function prahaDen(x: Date | string | number): string {
  const c = casti(naCas(x));
  return `${c.y}-${dva(c.m)}-${dva(c.d)}`;
}

/** Čas v Praze jako HH:MM. */
export function prahaCas(x: Date | string | number): string {
  const c = casti(naCas(x));
  return `${dva(c.h)}:${dva(c.mi)}`;
}

/** YYYY-MM-DD posunuté o n dní (kalendářně, bez časové zóny). */
export function posunDen(datum: string, n: number): string {
  const [y, m, d] = datum.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** ISO den v týdnu: 1 = pondělí … 7 = neděle. */
export function isoDen(datum: string): number {
  const [y, m, d] = datum.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}

/** O kolik je pražský čas napřed před UTC v okamžiku t (ms). */
function posunPrahy(t: number): number {
  const c = casti(t);
  return Date.UTC(c.y, c.m - 1, c.d, c.h, c.mi, c.s) - Math.floor(t / 1000) * 1000;
}

/**
 * Pražský den a čas („2026-10-23“, „15:00“) jako okamžik ISO pro server; neplatné datum nebo čas = null.
 * Na přechodu letního času se čas, který v Praze neexistuje, posune o hodinu (jako v kalendáři telefonu).
 */
export function prahaNaIso(datum: string, cas: string): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum ?? '');
  const cm = /^(\d{1,2}):(\d{2})$/.exec(cas ?? '');
  if (!dm || !cm) return null;
  const [y, m, d, h, mi] = [Number(dm[1]), Number(dm[2]), Number(dm[3]), Number(cm[1]), Number(cm[2])];
  if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const stena = Date.UTC(y, m - 1, d, h, mi);
  let t = stena - posunPrahy(stena);
  t = stena - posunPrahy(t);
  // 30. 2. a podobné: Date.UTC by den tiše přetočil, pražský den pak nesedí
  if (prahaDen(t) !== datum && prahaDen(t + 3600000) !== datum) return null;
  return new Date(t).toISOString();
}

/** Začátek pražského dne `datum` (00:00 v Praze) jako ms. */
export function zacatekDnePraha(datum: string): number {
  const iso = prahaNaIso(datum, '00:00');
  return iso ? new Date(iso).getTime() : NaN;
}

/* ---------------------------------------------------------------------------
   PRACOVNÍ DNY (migrace 060, Albert 1. 11. 2026: „more than 5 business days“). Server má svátky v tabulce public.svatky
   a funkce je_pracovni_den, pracovni_dny_mezi a pracovni_den_po; appka počty dostává od serveru (mlci_pd, ozn_lhuta_do)
   a tyhle funkce používá jen DEMO mock a testy, aby počítaly stejně. Měnit jen spolu se serverem (test_060).
   --------------------------------------------------------------------------- */

/**
 * České státní svátky 2026 až 2028 (stejné řádky jako public.svatky): 1. 1., Velký pátek, Velikonoční pondělí, 1. 5.,
 * 8. 5., 5. 7., 6. 7., 28. 9., 28. 10., 17. 11., 24. až 26. 12. Velikonoce: 2026 pá 3. 4. a po 6. 4., 2027 pá 26. 3.
 * a po 29. 3., 2028 pá 14. 4. a po 17. 4.
 */
export const SVATKY: readonly string[] = [2026, 2027, 2028].flatMap((rok) => {
  const velikonoce: Record<number, [string, string]> = { 2026: ['04-03', '04-06'], 2027: ['03-26', '03-29'], 2028: ['04-14', '04-17'] };
  return ['01-01', ...velikonoce[rok], '05-01', '05-08', '07-05', '07-06', '09-28', '10-28', '11-17', '12-24', '12-25', '12-26'].map(
    (md) => `${rok}-${md}`
  );
});
const SVATKY_MNOZINA = new Set(SVATKY);

/** Pracovní den (je_pracovni_den): pondělí až pátek a ne státní svátek. `datum` = YYYY-MM-DD. */
export function jePracovniDen(datum: string): boolean {
  return isoDen(datum) <= 5 && !SVATKY_MNOZINA.has(datum);
}

/**
 * Kolik celých pracovních dní uplynulo mezi dny `od` a `doDne` (pracovni_dny_mezi): počítají se dny d s od < d < doDne,
 * tedy ani den odeslání, ani dnešek. Odesláno v pondělí 2. 11. 2026, dnes úterý 10. 11. = 5 (út 3. až po 9.).
 */
export function pracovniDnyMezi(od: string, doDne: string): number {
  let n = 0;
  for (let d = posunDen(od, 1); d < doDne; d = posunDen(d, 1)) if (jePracovniDen(d)) n += 1;
  return n;
}

/** n-tý pracovní den po dni `datum` (pracovni_den_po, n ≥ 1): lhůta na zavolání. */
export function pracovniDenPo(datum: string, n: number): string {
  let d = datum;
  for (let i = 0; i < Math.max(1, n); ) {
    d = posunDen(d, 1);
    if (jePracovniDen(d)) i += 1;
  }
  return d;
}
