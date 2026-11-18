// PÁSMA STÁŘÍ VE FÁZI (Přehled vedení úkol 14a, Albert 17. 11. 2026; spec §4.6 „aging bands 0–7 / 8–14 / 15–30 / 31+ days since
// entering the current stage“, kontrakt §5.6 a §5.10; skill dataviz: pásma jsou pořadí, proto rampa jednoho odstínu, mladé světle,
// staré tmavě, --graf-pasmo-1 až 4). Každá fáze jeden složený pruh na společné ose (délka = klienti se známým vstupem do fáze),
// segment za pásmo s mezerou 2 px, číslo v segmentu jen když se vejde, za pruhem součet a kolik klientů nemá známý vstup (nikdy
// jako 0 dní). Legenda pásem. Klik na segment = řádky toho pásma; klávesnicí totéž v tabulce (fáze × pásma, medián a 90. percentil).

import { useId, type PointerEvent as ReactPointerEvent } from 'react';
import type { PasmoStari, PrehledProklik } from '../../api/types';
import { segmentyPruhu } from '../../grafy';
import { formatDny } from '../../prehled';
import { CisloTlacitko } from '../prehled/Tabulka';
import GrafRam, { Bublina, navratFokusu, Popisek, rozlozRadky, useBublina, useSirka, type PolozkaLegendy } from './Ram';

export const PASMA_NAZVY: Record<PasmoStari, string> = { '0-7': '0–7 dní', '8-14': '8–14 dní', '15-30': '15–30 dní', '31+': '31 a víc dní' };
const PORADI: PasmoStari[] = ['0-7', '8-14', '15-30', '31+'];
/** Text v segmentu podle světlosti výplně: první (nejsvětlejší) pásmo inkoust, ostatní papír (kontrast i APCA). */
const TEXT_NA: Record<PasmoStari, string> = { '0-7': 'na-svetle', '8-14': 'na-tmave', '15-30': 'na-tmave', '31+': 'na-tmave' };

export interface RadekPasem {
  klic: string;
  nazev: string;
  pasma: { pasmo: PasmoStari; n: number; proklik: PrehledProklik | null }[];
  /** klientů bez známého vstupu do fáze (v pásmech nejsou) */
  nezname: number;
  median: number | null;
  p90: number | null;
}

const RADEK = 50;
const PRUH = 20;
const PROSTOR_HODNOTY = 120;
const cislo = (n: number): string => new Intl.NumberFormat('cs-CZ').format(n);

export default function Pasma({
  graf = 'pasma',
  nadpis,
  uroven = 3,
  popis,
  radky,
  nazevRadku = 'Fáze',
  onProklik,
  vychoziTabulka = false,
}: {
  graf?: string;
  nadpis: string;
  uroven?: 3 | 4;
  popis?: string | null;
  radky: RadekPasem[];
  nazevRadku?: string;
  onProklik?: (p: PrehledProklik, nazev: string, odkud: HTMLElement | null) => void;
  vychoziTabulka?: boolean;
}) {
  const id = useId();
  const [plocha, sirka] = useSirka<HTMLDivElement>();
  const { bublina, ukaz, skryj } = useBublina();
  const pocet = (r: RadekPasem, p: PasmoStari) => r.pasma.find((x) => x.pasmo === p)?.n ?? 0;
  const celkem = (r: RadekPasem) => PORADI.reduce((a, p) => a + pocet(r, p), 0);
  const max = Math.max(0, ...radky.map(celkem));
  const delka = Math.max(40, sirka - PROSTOR_HODNOTY);
  // popisek fáze nad pruhem, u fáze s klienty bez známého vstupu i jejich počet (za pruhem jen součet, ať nepřeteče okraj)
  const popisky = radky.map((r) => `${r.nazev}${r.nezname > 0 ? ` · ${cislo(r.nezname)} neznámý vstup` : ''}`);
  const rozlozeni = rozlozRadky(popisky, sirka, RADEK);
  const vyska = Math.max(RADEK, rozlozeni.vyska) + 2;
  const legenda: PolozkaLegendy[] = PORADI.map((p, i) => ({ nazev: PASMA_NAZVY[p], barva: `var(--graf-pasmo-${i + 1})`, tvar: 'blok' }));
  const vPasmech = PORADI.map((p) => radky.reduce((a, r) => a + pocet(r, p), 0));
  const neznamych = radky.reduce((a, r) => a + r.nezname, 0);
  const desc = radky.length === 0
    ? 'Žádné fáze.'
    : `${radky.length} ${radky.length === 1 ? 'fáze' : radky.length <= 4 ? 'fáze' : 'fází'}; podle stáří ${PORADI.map((p, i) => `${PASMA_NAZVY[p]} ${cislo(vPasmech[i])}`).join(', ')}`
      + `${neznamych > 0 ? `; bez známého vstupu do fáze ${cislo(neznamych)}` : ''}. Čísla jsou i v tabulce.`;
  const nazevPasma = (r: RadekPasem, p: PasmoStari) => `${r.nazev}, ${PASMA_NAZVY[p]}`;
  const tabulka = (
    <table className="prehled-tabulka">
      <thead>
        <tr>
          <th scope="col">{nazevRadku}</th>
          {PORADI.map((p) => (
            <th key={p} scope="col" className="cislo-sloupec">{PASMA_NAZVY[p]}</th>
          ))}
          <th scope="col" className="cislo-sloupec">Neznámý vstup</th>
          <th scope="col" className="cislo-sloupec">Medián</th>
          <th scope="col" className="cislo-sloupec">90. percentil</th>
        </tr>
      </thead>
      <tbody>
        {radky.map((r) => (
          <tr key={r.klic} data-radek={r.klic}>
            <th scope="row">{r.nazev}</th>
            {PORADI.map((p) => {
              const b = r.pasma.find((x) => x.pasmo === p);
              const n = b?.n ?? 0;
              return (
                <td key={p} className="cislo-sloupec" data-pasmo={p}>
                  <CisloTlacitko text={cislo(n)} nazev={nazevPasma(r, p)} onClick={b?.proklik && onProklik && n > 0 ? (el) => onProklik(b.proklik!, nazevPasma(r, p), el) : null} />
                </td>
              );
            })}
            <td className="cislo-sloupec">{cislo(r.nezname)}</td>
            <td className="cislo-sloupec">{r.median === null ? '—' : formatDny(r.median)}</td>
            <td className="cislo-sloupec">{r.p90 === null ? '—' : formatDny(r.p90)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <GrafRam graf={graf} nadpis={nadpis} uroven={uroven} popis={popis} legenda={legenda} tabulka={tabulka} vychoziTabulka={vychoziTabulka}>
      <div className="graf-plocha" ref={plocha} onPointerLeave={skryj}>
        <svg role="img" aria-labelledby={`${id}-t ${id}-d`} width={sirka} height={vyska} viewBox={`0 0 ${sirka} ${vyska}`} className="graf-svg">
          <title id={`${id}-t`}>{nadpis}</title>
          <desc id={`${id}-d`}>{desc}</desc>
          <line x1="0.5" y1="0" x2="0.5" y2={vyska} className="graf-zaklad" />
          {radky.map((r, i) => {
            const y = rozlozeni.y[i] + rozlozeni.navic[i];
            const c = celkem(r);
            const w = max > 0 ? (delka * c) / max : 0;
            const seg = segmentyPruhu(PORADI.map((p) => pocet(r, p)), w);
            const souhrn = cislo(c);
            return (
              <g key={r.klic} className="graf-polozka">
                <Popisek x={4} y={rozlozeni.y[i] + 14} radky={rozlozeni.radky[i]} />
                {PORADI.map((p, j) => {
                  const n = pocet(r, p);
                  const s = seg[j];
                  if (n <= 0 || s.w <= 0) return null;
                  const b = r.pasma.find((x) => x.pasmo === p);
                  const klikaci = !!b?.proklik && !!onProklik;
                  const hover = (e: ReactPointerEvent<SVGElement>) => ukaz(e, {
                    nadpis: r.nazev,
                    radky: [{ nazev: PASMA_NAZVY[p], hodnota: cislo(n), barva: `var(--graf-pasmo-${j + 1})` }],
                    pozn: r.nezname > 0 ? `${cislo(r.nezname)} bez známého vstupu do fáze` : null,
                  });
                  return (
                    <g key={p}>
                      <rect data-pasmo={p} data-faze={r.klic} data-n={n} fill={`var(--graf-pasmo-${j + 1})`} x={1 + s.x} y={y + 20} width={Math.max(1, s.w)} height={PRUH} rx="3"
                        className={`graf-pruh${klikaci ? ' klikaci' : ''}`} onPointerMove={hover}
                        onClick={klikaci ? (e) => onProklik!(b!.proklik!, nazevPasma(r, p), navratFokusu(e.currentTarget)) : undefined} />
                      {s.w >= 22 && (
                        <text x={1 + s.x + s.w / 2} y={y + 34} textAnchor="middle" className={`graf-v-pruhu ${TEXT_NA[p]}`} data-pasmo-text={p}>{cislo(n)}</text>
                      )}
                    </g>
                  );
                })}
                <text x={w + 8} y={y + 35} className="graf-hodnota" data-faze-hodnota={r.klic}>{souhrn}</text>
              </g>
            );
          })}
        </svg>
        <Bublina stav={bublina} sirka={sirka} />
      </div>
    </GrafRam>
  );
}
