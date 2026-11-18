// MATEMATIKA GRAFŮ PŘEHLEDU (Přehled vedení úkol 14a, Albert 17. 11. 2026; spec docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md
// §7: „hand-made SVG components, no new runtime dependency, accessible: title/desc + Zobrazit jako tabulku“). Jen čísla bez Reactu:
// pěkné dílky osy od nuly, zrnitost řady podle délky období, kumulativní součet řady (neznámé nikdy jako 0), lomená čára s mezerou
// za neznámým bodem, šířky segmentů pruhu s mezerou 2 px a popisky dnů, týdnů a měsíců v pražském kalendáři. Komponenty grafů
// (src/components/grafy) z toho jen kreslí.

import type { MenaPrehledu, ZrnitostRady } from './api/types';

const zaokrouhli = (n: number, mist = 10): number => Math.round(n * 10 ** mist) / 10 ** mist;

/**
 * Dílky osy od 0 do aspoň `max`: krok 1, 2, 2,5, 5 nebo 10 × 10^k, kolem `kolik` dílků. `cele` = počty (krok aspoň 1 a celý).
 * Prázdná osa (max 0 nebo neznámé) = 0 až 1, ať graf nespadne a nula sedí na základně.
 */
export function dilkyOsy(max: number, kolik = 4, cele = false): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const surovy = max / kolik;
  const rad = 10 ** Math.floor(Math.log10(surovy));
  const pomer = surovy / rad;
  let krok = (pomer <= 1 ? 1 : pomer <= 2 ? 2 : pomer <= 2.5 ? 2.5 : pomer <= 5 ? 5 : 10) * rad;
  if (cele) krok = Math.max(1, Math.round(krok));
  const out = [0];
  while (out[out.length - 1] < max - 1e-9) out.push(zaokrouhli(out[out.length - 1] + krok));
  return out;
}

const dniObdobi = (od: string, doDne: string): number => Math.round((Date.parse(`${doDne}T00:00:00Z`) - Date.parse(`${od}T00:00:00Z`)) / 86400000) + 1;

/** Zrnitost řady prehled_rada pro období filtru: do 62 dní po dnech, do 366 dní po týdnech (po–ne), delší po měsících. */
export function zrnitostObdobi(od: string, doDne: string): ZrnitostRady {
  const dni = dniObdobi(od, doDne);
  return dni <= 62 ? 'den' : dni <= 366 ? 'tyden' : 'mesic';
}

export interface BodKumulace {
  /** součet známých hodnot od začátku řady; null = bez čáry (před zdrojem, nebo po konci dat) */
  hodnota: number | null;
  /** v součtu je sloupec bez přesné částky (přidal 0, skutečnost je vyšší) */
  castecne: boolean;
}

/**
 * Kumulativní součet řady (trend proti cíli). Sloupec `dostupny: false` (před začátkem zdroje, nebo po k_datu či teď) čáru nemá:
 * před prvním známým čára začne později, po známých čára skončí (a dál už nic). Dostupný sloupec bez hodnoty (peníze bez přesné
 * částky, R7) přidá 0 a součet od něj dál je jen částečný; nikdy se z něj nestane ověřená nula.
 */
export function kumulativne(body: readonly { hodnota: number | null; dostupny: boolean }[]): BodKumulace[] {
  let soucet = 0;
  let zacalo = false;
  let skoncilo = false;
  let castecne = false;
  return body.map((b) => {
    if (skoncilo) return { hodnota: null, castecne: false };
    if (!b.dostupny) {
      if (zacalo) skoncilo = true;
      return { hodnota: null, castecne: false };
    }
    zacalo = true;
    if (b.hodnota === null) castecne = true;
    soucet = zaokrouhli(soucet + (b.hodnota ?? 0), 2);
    return { hodnota: soucet, castecne };
  });
}

/** Částka měny z `castky` (desetinný text na 2 místa) jako číslo; neznámá nebo chybějící měna = null (nikdy 0). */
export function castkaVMene(castky: readonly { mena: MenaPrehledu | string; hodnota: string | null }[], mena: MenaPrehledu | string): number | null {
  const c = castky.find((x) => x.mena === mena);
  return c && c.hodnota !== null ? Number(c.hodnota) : null;
}

const souradnice = (n: number): string => String(Math.round(n * 10) / 10);

/** Lomená čára SVG z bodů: neznámý bod (null) čáru přeruší, další známý začne nový úsek („M“), přes mezeru nic nevede. */
export function cestaCary(body: readonly (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  const casti: string[] = [];
  let kresli = false;
  body.forEach((v, i) => {
    if (v === null) {
      kresli = false;
      return;
    }
    casti.push(`${kresli ? 'L' : 'M'}${souradnice(x(i))} ${souradnice(y(v))}`);
    kresli = true;
  });
  return casti.join(' ');
}

/**
 * Segmenty jednoho pruhu (pásma stáří ve fázi): šířka úměrná počtu, mezi nenulovými segmenty mezera `mezera` px v barvě plochy,
 * nulový segment nekreslí nic (šířka 0 na místě, kde by byl).
 */
export function segmentyPruhu(hodnoty: readonly number[], sirka: number, mezera = 2): { x: number; w: number }[] {
  const celkem = hodnoty.reduce((a, v) => a + Math.max(0, v), 0);
  const nenulovych = hodnoty.filter((v) => v > 0).length;
  const plocha = Math.max(0, sirka - Math.max(0, nenulovych - 1) * mezera);
  let x = 0;
  let prvni = true;
  return hodnoty.map((v) => {
    if (v <= 0 || celkem === 0) return { x, w: 0 };
    if (!prvni) x += mezera;
    prvni = false;
    const w = (plocha * v) / celkem;
    const seg = { x, w };
    x += w;
    return seg;
  });
}

const MESICE = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
/** Měsíc „2026-11“ (i „2026-11-05“) česky: „listopad 2026“ (popisky řady, kohorty, přesnost odhadu). */
export function mesicNazev(den: string): string {
  const [y, m] = den.split('-').map(Number);
  return `${MESICE[m - 1]} ${y}`;
}
const dm = (den: string): [number, number, number] => {
  const [y, m, d] = den.split('-').map(Number);
  return [y, m, d];
};

/** Popisek sloupce řady: den „8. 11.“, týden „2.–8. 11.“ (přes měsíc „26. 10.–1. 11.“), měsíc „listopad 2026“. */
export function popisekBodu(od: string, doDne: string, zrnitost: ZrnitostRady): string {
  const [, m1, d1] = dm(od);
  const [, m2, d2] = dm(doDne);
  if (zrnitost === 'mesic') return mesicNazev(od);
  if (zrnitost === 'den' || od === doDne) return `${d1}. ${m1}.`;
  return m1 === m2 ? `${d1}.–${d2}. ${m2}.` : `${d1}. ${m1}.–${d2}. ${m2}.`;
}

/** Odhad šířky znaku popisku grafu (Baloo 2, 13 px, tučně) pro zalomení textu, který SVG samo nezalomí. */
export const SIRKA_ZNAKU = 7.2;

/**
 * Popisek po slovech do řádků nejvýš `maxZnaku` dlouhých (SVG text se sám nezalomí a na telefonu by přetekl plochu); nejvýš
 * `maxRadku` řádků (zbytek do posledního), slovo delší než řádek zůstane celé.
 */
export function zalomText(text: string, maxZnaku: number, maxRadku = 3): string[] {
  if (maxZnaku <= 0 || text.length <= maxZnaku) return [text];
  const radky: string[] = [];
  let r = '';
  for (const slovo of text.split(/\s+/).filter(Boolean)) {
    if (r && `${r} ${slovo}`.length > maxZnaku) {
      radky.push(r);
      r = slovo;
    } else {
      r = r ? `${r} ${slovo}` : slovo;
    }
  }
  if (r) radky.push(r);
  return radky.length > maxRadku ? [...radky.slice(0, maxRadku - 1), radky.slice(maxRadku - 1).join(' ')] : radky;
}
