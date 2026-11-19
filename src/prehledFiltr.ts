// FILTR PŘEHLEDU V ADRESE (Přehled vedení úkol 13, Albert 17. 11. 2026; spec docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md
// §7.1 a §7.2, kontrakt docs/superpowers/specs/2026-11-17-prehled-kontrakt.md §2.7, R6 a R14). Přehled drží filtr v adrese
// (#/prehled/<záložka>?od=…&do=…&lide=1,2|tym=2211&seg=…&obor=…&kraj=…&mena=…&zaklad=…&atribuce=…&k=…), aby proklik i sdílený
// odkaz ukázaly totéž; ostatní stránky si filtry dál nepamatují (docs/ARCHITEKTI.md 9.6). Jen logika bez Reactu: čtení a zápis
// adresy (ručně pokažená hodnota = výchozí, nic nespadne), předvolby období podle dne v Praze, filtr pro server (tým se rozbalí
// na id z prehled_moznosti.tymy, server týmy nezná) a čipy zapnutých filtrů.

import type { AtribucePrehledu, MenaPrehledu, PrehledFiltr, PrehledFiltrVstup } from './api/types';
import { isoDen, posunDen, prahaDen, prahaCas, zacatekDnePraha } from './praha';

export type ZakladPrehledu = PrehledFiltr['zaklad'];
export type MenaFiltru = MenaPrehledu | 'obe';

/**
 * Filtr stránky Přehledu (stav v adrese). `lide` = vybraní lidé vzestupně (Já i „jen aktivní“ jako id), `tym` = předvolba týmu
 * (id super admina; rozbalí se až pro server), obojí null = všichni. Seznamy prázdné = bez filtru. `k` = k_datu (ISO) nebo null
 * = živá data.
 */
export interface FiltrPrehledu {
  od: string;
  do: string;
  lide: number[] | null;
  tym: number | null;
  segment: string[];
  obor: string[];
  kraj: string[];
  mena: MenaFiltru;
  zaklad: ZakladPrehledu;
  atribuce: AtribucePrehledu;
  k: string | null;
}

/** Záložky Přehledu jako podstránky #/prehled/<klíč> (spec §7.2). */
export const ZALOZKY = [
  { klic: 'vedeni', nazev: 'Vedení' },
  { klic: 'lide', nazev: 'Lidé a volání' },
  { klic: 'pipeline', nazev: 'Pipeline' },
  { klic: 'klienti', nazev: 'Klienti a sektory' },
  { klic: 'komunikace', nazev: 'Komunikace a ztráty' },
  { klic: 'finance', nazev: 'Finance' },
  { klic: 'dodani', nazev: 'Dodání' },
  { klic: 'prognoza', nazev: 'Prognóza a data' },
] as const;
export type ZalozkaKlic = (typeof ZALOZKY)[number]['klic'];
/** Nastavení (ozubené kolo): #/prehled/nastaveni/<sekce>; obsah doplní úkol 14. */
export const NASTAVENI_SEKCE = [
  { klic: 'cile', nazev: 'Cíle' },
  { klic: 'naklady', nazev: 'Náklady' },
  { klic: 'vyplaty', nazev: 'Výplaty provizí' },
] as const;
export type NastaveniKlic = (typeof NASTAVENI_SEKCE)[number]['klic'];

export type ObdobiKlic = 'dnes' | 'tyden' | 'mesic' | 'minuly_mesic' | 'dni30' | 'letos' | 'vlastni';
/** Předvolby období (spec §7.2) v pořadí výběru. */
export const OBDOBI: { klic: ObdobiKlic; nazev: string }[] = [
  { klic: 'dnes', nazev: 'Dnes' },
  { klic: 'tyden', nazev: 'Tento týden' },
  { klic: 'mesic', nazev: 'Tento měsíc' },
  { klic: 'minuly_mesic', nazev: 'Minulý měsíc' },
  { klic: 'dni30', nazev: 'Posledních 30 dní' },
  { klic: 'letos', nazev: 'Letos' },
  { klic: 'vlastni', nazev: 'Vlastní' },
];

const MENY: readonly MenaFiltru[] = ['CZK', 'EUR', 'obe'];
const ZAKLADY: readonly ZakladPrehledu[] = ['prirozeny', 'aktivita', 'prodej', 'faktura', 'platba'];
const ATRIBUCE: readonly AtribucePrehledu[] = ['posledni_zajem', 'prvni_zajem', 'spravuje'];
/** Nejstarší den, který server přijme (§2.7), a nejdelší období ve dnech. */
export const OBDOBI_OD_MIN = '2020-01-01';
export const OBDOBI_MAX_DNI = 730;

/** Dnešní den v Praze (YYYY-MM-DD); předvolby se počítají z něj, nikdy z UTC ani z času telefonu. */
export function dnesVPraze(ted: Date | number | string = Date.now()): string {
  return prahaDen(ted);
}

const prvniDenMesice = (den: string): string => `${den.slice(0, 7)}-01`;
const posledniDenMesice = (den: string): string => posunDen(`${posunDen(`${den.slice(0, 7)}-28`, 4).slice(0, 7)}-01`, -1);
const dniMezi = (od: string, doDne: string): number => Math.round((Date.parse(`${doDne}T00:00:00Z`) - Date.parse(`${od}T00:00:00Z`)) / 86400000);

/**
 * Rozsah předvolby k pražskému dni `dnes`: Dnes; Tento týden pondělí až neděle; Tento měsíc a Minulý měsíc celé kalendářní měsíce
 * (dny po dnešku server vrátí prázdné); Posledních 30 dní včetně dneška; Letos 1. 1. až 31. 12.
 */
export function rozsahObdobi(klic: Exclude<ObdobiKlic, 'vlastni'>, dnes: string): { od: string; do: string } {
  switch (klic) {
    case 'dnes':
      return { od: dnes, do: dnes };
    case 'tyden': {
      const pondeli = posunDen(dnes, 1 - isoDen(dnes));
      return { od: pondeli, do: posunDen(pondeli, 6) };
    }
    case 'mesic':
      return { od: prvniDenMesice(dnes), do: posledniDenMesice(dnes) };
    case 'minuly_mesic': {
      const posledni = posunDen(prvniDenMesice(dnes), -1);
      return { od: prvniDenMesice(posledni), do: posledni };
    }
    case 'dni30':
      return { od: posunDen(dnes, -29), do: dnes };
    case 'letos':
      return { od: `${dnes.slice(0, 4)}-01-01`, do: `${dnes.slice(0, 4)}-12-31` };
  }
}

/** Která předvolba je období [od, do] k dnešku (jinak Vlastní). */
export function obdobiFiltru(od: string, doDne: string, dnes: string): ObdobiKlic {
  for (const o of OBDOBI) {
    if (o.klic === 'vlastni') continue;
    const r = rozsahObdobi(o.klic, dnes);
    if (r.od === od && r.do === doDne) return o.klic;
  }
  return 'vlastni';
}

/** Období jako okamžiky [od 0:00, do+1 0:00) v Praze, jak ho počítá server (§2.4): 29. 3. 2026 má 23 h, 25. 10. 2026 25 h. */
export function obdobiNaCasy(od: string, doDne: string): { odMs: number; doMs: number } {
  return { odMs: zacatekDnePraha(od), doMs: zacatekDnePraha(posunDen(doDne, 1)) };
}

/** Filtr v pevném pořadí klíčů (čtení, výchozí i „Zrušit vše“ dávají stejný tvar). */
function filtrZ(p: FiltrPrehledu): FiltrPrehledu {
  return { od: p.od, do: p.do, lide: p.lide, tym: p.tym, segment: p.segment, obor: p.obor, kraj: p.kraj, mena: p.mena, zaklad: p.zaklad, atribuce: p.atribuce, k: p.k };
}

/** Výchozí filtr: Tento měsíc, všichni, CZK, přirozený základ, poslední zájem, živá data. */
export function vychoziFiltr(dnes: string = dnesVPraze()): FiltrPrehledu {
  const { od, do: doDne } = rozsahObdobi('mesic', dnes);
  return filtrZ({ od, do: doDne, lide: null, tym: null, segment: [], obor: [], kraj: [], mena: 'CZK', zaklad: 'prirozeny', atribuce: 'posledni_zajem', k: null });
}

const platnyDen = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && posunDen(s, 0) === s;
const seznam = (v: string | null): string[] => [...new Set((v ?? '').split(',').map((x) => x.trim()).filter(Boolean))].sort();
const idcka = (v: string | null): number[] => [...new Set((v ?? '').split(',').map((x) => x.trim()).filter((x) => /^\d+$/.test(x)).map(Number).filter((n) => n > 0))].sort((a, b) => a - b);

/**
 * Filtr z adresy (`?od=…` i bez otazníku). Co nejde použít, je výchozí: období mimo pravidla serveru (do před od, přes 730 dní,
 * před rokem 2020, ⚠ od úkolu 14c i začátek po dnešku: server ho odmítne „Neplatný filtr: od je v budoucnosti.“) celé výchozí,
 * neznámá měna, základ a atribuce výchozí, neplatná id pryč, k_datu v budoucnosti pryč. k_datu před začátkem období zůstane
 * (dvě pole, žádné se potichu nepřepisuje): řada filtrů u něj ukáže větu serveru (chybaFiltru). lide a tym naráz: platí lide.
 */
export function ctiFiltr(search: string, dnes: string = dnesVPraze()): FiltrPrehledu {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const vych = vychoziFiltr(dnes);
  const od = q.get('od');
  const doDne = q.get('do');
  const obdobiOk = platnyDen(od) && platnyDen(doDne) && od >= OBDOBI_OD_MIN && od <= dnes && doDne >= od && dniMezi(od, doDne) <= OBDOBI_MAX_DNI;
  const lide = idcka(q.get('lide'));
  const tymText = q.get('tym');
  const tym = lide.length === 0 && tymText && /^\d+$/.test(tymText) && Number(tymText) > 0 ? Number(tymText) : null;
  const k = q.get('k');
  const kOk = !!k && !Number.isNaN(Date.parse(k)) && Date.parse(k) <= Date.now() && /^\d{4}-\d{2}-\d{2}T/.test(k);
  const volba = <T extends string>(v: string | null, povolene: readonly T[], vychozi: T): T => (v && povolene.includes(v as T) ? (v as T) : vychozi);
  return filtrZ({
    od: obdobiOk ? od : vych.od,
    do: obdobiOk ? doDne : vych.do,
    lide: lide.length > 0 ? lide : null,
    tym,
    segment: seznam(q.get('seg')),
    obor: seznam(q.get('obor')),
    kraj: seznam(q.get('kraj')),
    mena: volba(q.get('mena'), MENY, 'CZK'),
    zaklad: volba(q.get('zaklad'), ZAKLADY, 'prirozeny'),
    atribuce: volba(q.get('atribuce'), ATRIBUCE, 'posledni_zajem'),
    k: kOk ? k : null,
  });
}

/** Adresa z filtru (bez otazníku): období vždy, ostatní jen když není výchozí; seznamy čárkou, hodnoty zakódované. */
export function zapisFiltr(f: FiltrPrehledu): string {
  const c: string[] = [`od=${f.od}`, `do=${f.do}`];
  const sez = (v: readonly (string | number)[]) => v.map((x) => encodeURIComponent(String(x))).join(',');
  if (f.lide && f.lide.length > 0) c.push(`lide=${sez(f.lide)}`);
  else if (f.tym !== null) c.push(`tym=${f.tym}`);
  if (f.segment.length > 0) c.push(`seg=${sez(f.segment)}`);
  if (f.obor.length > 0) c.push(`obor=${sez(f.obor)}`);
  if (f.kraj.length > 0) c.push(`kraj=${sez(f.kraj)}`);
  if (f.mena !== 'CZK') c.push(`mena=${f.mena}`);
  if (f.zaklad !== 'prirozeny') c.push(`zaklad=${f.zaklad}`);
  if (f.atribuce !== 'posledni_zajem') c.push(`atribuce=${f.atribuce}`);
  if (f.k) c.push(`k=${encodeURIComponent(f.k)}`);
  return c.join('&');
}

/**
 * Rozepsané datum (oprava po recenzi 18. 11. 2026, bod 1): pole data posílá při psaní roku mezihodnoty (0002-11-01, 0020-…,
 * 0202-…). Do adresy smí jen celé platné datum od 1. 1. 2020; jinak zůstane rozepsané v poli.
 */
export function celyDen(s: string): boolean {
  return platnyDen(s) && s >= OBDOBI_OD_MIN;
}

const TVAR_DNE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Dvě odmítnutí filtru serverem (migrace 073 app_prehled_filtr, kontrakt §2.7; úkol 14c): věty doslova jako server, appka je ukáže
 * u pole dřív, než by se filtr poslal. Začátek období po dnešku (Praha) server kontroluje před „do < od“; k_datu před začátkem
 * období (od 0:00 v Praze) odmítne, přesně od 0:00 projde.
 */
export const OD_V_BUDOUCNOSTI = 'Neplatný filtr: od je v budoucnosti.';
export const K_DATU_PRED_OBDOBIM = 'Neplatný filtr: k_datu je před začátkem období.';

/** k_datu (okamžik ISO) před začátkem období `od` (0:00 v Praze), jak ho odmítne server. */
function kDatuPredObdobim(k: string | null | undefined, od: string): boolean {
  if (!k || !platnyDen(od)) return false;
  const t = Date.parse(k);
  return !Number.isNaN(t) && t < zacatekDnePraha(od);
}

/**
 * Proč nejde vlastní období zapsat (věta u pole), nebo null. Druhý konec se nikdy potichu nepřepisuje. S `dnes` (pražský den)
 * i začátek po dnešku a s `k` (zadané k datu, ISO) i začátek po něm, obojí větou serveru (úkol 14c; bez nich jako dřív).
 */
export function chybaObdobi(od: string, doDne: string, dnes?: string, k?: string | null): string | null {
  if (!TVAR_DNE.test(od) || !TVAR_DNE.test(doDne)) return 'Zadejte celé datum začátku i konce.';
  // rok před 2020 dřív než platnost dne (rok pod 100 by Date bral jako 19xx)
  if (od < OBDOBI_OD_MIN || doDne < OBDOBI_OD_MIN) return 'Období může začínat nejdřív 1. 1. 2020.';
  if (!platnyDen(od) || !platnyDen(doDne)) return 'Zadejte celé datum začátku i konce.';
  // server: od v budoucnosti dřív než do < od (app_prehled_filtr)
  if (dnes && od > dnes) return OD_V_BUDOUCNOSTI;
  if (doDne < od) return 'Začátek období je po jeho konci.';
  if (dniMezi(od, doDne) > OBDOBI_MAX_DNI) return `Období může mít nejvýš ${OBDOBI_MAX_DNI} dní.`;
  if (kDatuPredObdobim(k, od)) return K_DATU_PRED_OBDOBIM;
  return null;
}

/**
 * Proč nejde „k datu“ zapsat, nebo null (prázdné = teď, živá data). S `od` (začátek období) i den před ním větou serveru (úkol
 * 14c): k datu je konec zvoleného dne, takže den začátku období projde.
 */
export function chybaKDatu(den: string, dnes: string, od?: string): string | null {
  if (den === '') return null;
  if (!TVAR_DNE.test(den)) return 'Zadejte celé datum.';
  if (den < OBDOBI_OD_MIN) return 'K datu může být nejdřív 1. 1. 2020.';
  if (!platnyDen(den)) return 'Zadejte celé datum.';
  if (den > dnes) return 'K datu nemůže být v budoucnosti.';
  if (od && platnyDen(od) && den < od) return K_DATU_PRED_OBDOBIM;
  return null;
}

/**
 * Věta serveru, kterou by uložený filtr (adresa) dostal, nebo null (úkol 14c): začátek po dnešku a k datu před začátkem období.
 * Řada filtrů ji ukáže u období, i když je „Další“ zavřené (třeba předvolba Dnes po zadaném k datu včera).
 */
export function chybaFiltru(f: Pick<FiltrPrehledu, 'od' | 'k'>, dnes: string): string | null {
  if (platnyDen(f.od) && f.od > dnes) return OD_V_BUDOUCNOSTI;
  if (kDatuPredObdobim(f.k, f.od)) return K_DATU_PRED_OBDOBIM;
  return null;
}

/** Odkaz na záložku Přehledu se stejným filtrem (HashRouter z něj udělá #/prehled/…). */
export function odkazZalozky(klic: string, f: FiltrPrehledu): string {
  return `/prehled/${klic}?${zapisFiltr(f)}`;
}

/**
 * Filtr pro server (FiltrVstup §2.7): tým rozbalený na členy z prehled_moznosti.tymy (i neaktivní, §2.10 tak sedí i týmový cíl;
 * tým, který v možnostech není, jen jeho vedoucí, nikdy [] = všichni), prázdné seznamy null, k → k_datu. vyber nikdy (jen proklik).
 */
export function filtrProServer(f: FiltrPrehledu, tymy: readonly { id: number; clenove: readonly number[] }[]): PrehledFiltrVstup {
  const vzestupne = (ids: readonly number[]) => [...new Set(ids)].sort((a, b) => a - b);
  const lide = f.lide && f.lide.length > 0 ? vzestupne(f.lide) : f.tym !== null ? vzestupne(tymy.find((t) => t.id === f.tym)?.clenove ?? [f.tym]) : null;
  return {
    od: f.od,
    do: f.do,
    lide,
    atribuce: f.atribuce,
    segment: f.segment.length > 0 ? [...f.segment] : null,
    obor: f.obor.length > 0 ? [...f.obor] : null,
    kraj: f.kraj.length > 0 ? [...f.kraj] : null,
    mena: f.mena,
    zaklad: f.zaklad,
    k_datu: f.k,
  };
}

/** Krátké názvy voleb v čipech a v panelu „Další“ (kontrakt §3.7). */
export const ZAKLAD_POPISKY: Record<ZakladPrehledu, string> = {
  prirozeny: 'Přirozený základ každého čísla',
  aktivita: 'Klienti s hovorem v období',
  prodej: 'Klienti prodaní v období',
  faktura: 'Klienti s fakturou v období',
  platba: 'Klienti s platbou v období',
};
export const ATRIBUCE_POPISKY: Record<AtribucePrehledu, string> = {
  posledni_zajem: 'Poslední, kdo zapsal zájem (jako výdělek)',
  prvni_zajem: 'První, kdo zapsal zájem',
  spravuje: 'Kdo klienta teď vede',
};
const ATRIBUCE_KRATCE: Record<AtribucePrehledu, string> = { posledni_zajem: 'poslední zájem', prvni_zajem: 'první zájem', spravuje: 'kdo klienta vede' };
export const MENA_POPISKY: Record<MenaFiltru, string> = { CZK: 'CZK', EUR: 'EUR', obe: 'CZK i EUR' };

/** „10. 11. 2026 9:05“ v Praze. */
export function casPrahaText(iso: string): string {
  const [y, m, d] = prahaDen(iso).split('-').map(Number);
  return `${d}. ${m}. ${y} ${prahaCas(iso).replace(/^0/, '')}`;
}

export interface CipPrehledu {
  klic: string;
  text: string;
  /** filtr bez tohoto čipu */
  zrus: () => FiltrPrehledu;
}

/**
 * Čipy zapnutých filtrů (spec §7.2) v pořadí řady filtrů: lidé, segmenty, obory, kraje, měna, základ, atribuce, k datu. Období čip
 * nemá (je vidět ve svém poli a vypnout nejde).
 */
export function cipyFiltru(
  f: FiltrPrehledu,
  popisky: { lide?: string | null; segmenty?: Record<string, string>; obory?: Record<string, string>; kraje?: Record<string, string> } = {}
): CipPrehledu[] {
  const c: CipPrehledu[] = [];
  if ((f.lide && f.lide.length > 0) || f.tym !== null) {
    c.push({ klic: 'lide', text: `Lidé: ${popisky.lide ?? (f.lide ? `${f.lide.length}` : `tým #${f.tym}`)}`, zrus: () => filtrZ({ ...f, lide: null, tym: null }) });
  }
  for (const s of f.segment) c.push({ klic: `segment:${s}`, text: popisky.segmenty?.[s] ?? s, zrus: () => filtrZ({ ...f, segment: f.segment.filter((x) => x !== s) }) });
  for (const o of f.obor) c.push({ klic: `obor:${o}`, text: `Obor: ${popisky.obory?.[o] ?? o}`, zrus: () => filtrZ({ ...f, obor: f.obor.filter((x) => x !== o) }) });
  for (const k of f.kraj) c.push({ klic: `kraj:${k}`, text: popisky.kraje?.[k] ?? k, zrus: () => filtrZ({ ...f, kraj: f.kraj.filter((x) => x !== k) }) });
  if (f.mena !== 'CZK') c.push({ klic: 'mena', text: `Měna: ${MENA_POPISKY[f.mena]}`, zrus: () => filtrZ({ ...f, mena: 'CZK' }) });
  if (f.zaklad !== 'prirozeny') c.push({ klic: 'zaklad', text: `Základ: ${ZAKLAD_POPISKY[f.zaklad]}`, zrus: () => filtrZ({ ...f, zaklad: 'prirozeny' }) });
  if (f.atribuce !== 'posledni_zajem') c.push({ klic: 'atribuce', text: `Připsáno: ${ATRIBUCE_KRATCE[f.atribuce]}`, zrus: () => filtrZ({ ...f, atribuce: 'posledni_zajem' }) });
  if (f.k) c.push({ klic: 'k', text: `K datu ${casPrahaText(f.k)}`, zrus: () => filtrZ({ ...f, k: null }) });
  return c;
}

/** „Zrušit vše“: všechny filtry výchozí, období zůstane (bez období Přehled není). */
export function zrusVseFiltry(f: FiltrPrehledu): FiltrPrehledu {
  return filtrZ({ od: f.od, do: f.do, lide: null, tym: null, segment: [], obor: [], kraj: [], mena: 'CZK', zaklad: 'prirozeny', atribuce: 'posledni_zajem', k: null });
}

/** Lze něco zrušit (jiné než výchozí volby kromě období)? */
export function lzeZrusitFiltry(f: FiltrPrehledu): boolean {
  return cipyFiltru(f).length > 0;
}
