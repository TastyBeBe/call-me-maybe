// SLOUPCE: VODOROVNÉ PRUHY JEDNÉ ŘADY (Přehled vedení úkol 14a, Albert 17. 11. 2026; spec §7 a skill dataviz). Porovnání velikosti
// po položkách (segmenty, kategorie nákladů, důvody odmítnutí, kroky po návrhu): jeden odstín (oranžová appky), pruh nejvýš
// 14 px s datovým koncem zaobleným 4 px a rovnou základnou, název nad pruhem, hodnota za koncem pruhu (text v barvě textu).
// Nulová a neznámá položka pruh nemá: nula ukáže „0“, neznámá „—“ (nikdy „0“). Pruh s proklikem otevře řádky (myš); klávesnicí
// totéž číslo v tabulce („Zobrazit jako tabulku“). Jedna řada = bez legendy, název grafu ji nese.

import { useId, type MouseEvent as ReactMouseEvent } from 'react';
import type { PrehledProklik } from '../../api/types';
import { CisloTlacitko } from '../prehled/Tabulka';
import GrafRam, { Bublina, cestaPruhu, navratFokusu, Popisek, rozlozRadky, useBublina, useSirka } from './Ram';

export interface PolozkaSloupce {
  klic: string;
  nazev: string;
  /** číslo délky pruhu; null = neznámé (pruh není, text „—“) */
  hodnota: number | null;
  /** hodnota pro lidi („4“, „15 000 Kč“, „—“) */
  text: string;
  /** poznámka do bubliny a tabulky (důvod neúplnosti, podíl) */
  pozn?: string | null;
  proklik?: PrehledProklik | null;
}

const RADEK = 42;
const PRUH = 14;
const PROSTOR_HODNOTY = 92;

export default function Sloupce({
  graf = 'sloupce',
  nadpis,
  uroven = 3,
  popis,
  polozky,
  nazevPolozky = 'Položka',
  nazevHodnoty,
  onProklik,
  vychoziTabulka = false,
}: {
  graf?: string;
  nadpis: string;
  uroven?: 3 | 4;
  popis?: string | null;
  polozky: PolozkaSloupce[];
  /** záhlaví prvního sloupce tabulky („Segment“, „Kategorie“) */
  nazevPolozky?: string;
  /** co hodnota je (záhlaví tabulky, název tlačítka řádků) */
  nazevHodnoty: string;
  onProklik?: (p: PrehledProklik, nazev: string, odkud: HTMLElement | null) => void;
  vychoziTabulka?: boolean;
}) {
  const id = useId();
  const [plocha, sirka] = useSirka<HTMLDivElement>();
  const { bublina, ukaz, skryj } = useBublina();
  const max = Math.max(0, ...polozky.map((p) => p.hodnota ?? 0));
  const delka = Math.max(40, sirka - PROSTOR_HODNOTY);
  const rozlozeni = rozlozRadky(polozky.map((p) => p.nazev), sirka, RADEK);
  const vyska = Math.max(RADEK, rozlozeni.vyska) + 4;
  const znamych = polozky.filter((p) => p.hodnota !== null).length;
  const nejvic = polozky.filter((p) => p.hodnota !== null && p.hodnota === max && max > 0).map((p) => p.nazev);
  const desc = polozky.length === 0
    ? 'Žádné položky.'
    : `${polozky.length} ${polozky.length === 1 ? 'položka' : polozky.length <= 4 ? 'položky' : 'položek'}, ${nazevHodnoty.toLowerCase()}`
      + `${nejvic.length > 0 ? `; nejvíc ${nejvic.join(', ')} (${polozky.find((p) => p.nazev === nejvic[0])?.text})` : ''}`
      + `${znamych < polozky.length ? `; u ${polozky.length - znamych} hodnota neznámá` : ''}. Čísla jsou i v tabulce.`;
  const otevri = (p: PolozkaSloupce, el: Element | null) => {
    if (p.proklik && onProklik) onProklik(p.proklik, `${nazevHodnoty} – ${p.nazev}`, navratFokusu(el));
  };
  const tabulka = (
    <table className="prehled-tabulka">
      <thead>
        <tr>
          <th scope="col">{nazevPolozky}</th>
          <th scope="col" className="cislo-sloupec">{nazevHodnoty}</th>
        </tr>
      </thead>
      <tbody>
        {polozky.map((p) => (
          <tr key={p.klic} data-radek={p.klic}>
            <th scope="row">
              {p.nazev}
              {p.pozn ? <span className="prehled-bunka-pozn">{p.pozn}</span> : null}
            </th>
            <td className="cislo-sloupec">
              <CisloTlacitko text={p.text} nazev={`${nazevHodnoty} – ${p.nazev}`} onClick={p.proklik && onProklik ? (el) => onProklik(p.proklik!, `${nazevHodnoty} – ${p.nazev}`, el) : null} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <GrafRam graf={graf} nadpis={nadpis} uroven={uroven} popis={popis} tabulka={tabulka} vychoziTabulka={vychoziTabulka}>
      <div className="graf-plocha" ref={plocha} onPointerLeave={skryj}>
        <svg role="img" aria-labelledby={`${id}-t ${id}-d`} width={sirka} height={vyska} viewBox={`0 0 ${sirka} ${vyska}`} className="graf-svg">
          <title id={`${id}-t`}>{nadpis}</title>
          <desc id={`${id}-d`}>{desc}</desc>
          <line x1="0.5" y1="0" x2="0.5" y2={vyska} className="graf-zaklad" />
          {polozky.map((p, i) => {
            const y = rozlozeni.y[i] + rozlozeni.navic[i];
            const w = p.hodnota !== null && max > 0 ? (delka * Math.max(0, p.hodnota)) / max : 0;
            const klikaci = !!p.proklik && !!onProklik;
            const hover = (e: ReactMouseEvent<SVGElement>) => ukaz(e, { nadpis: p.nazev, radky: [{ nazev: nazevHodnoty, hodnota: p.text }], pozn: p.pozn });
            return (
              <g key={p.klic} className="graf-polozka">
                <Popisek x={4} y={rozlozeni.y[i] + 14} radky={rozlozeni.radky[i]} />
                {w > 0 && (
                  <path
                    data-sloupec={p.klic}
                    fill="var(--graf-rada)"
                    d={cestaPruhu(1, y + 20, Math.max(2, w), PRUH)}
                    className="graf-pruh"
                  />
                )}
                {/* průhledný cíl ukazatele přes celý řádek (nad pruhem, proto má klik i bublinu jen on): bublina i u krátkého pruhu */}
                <rect x="0" y={rozlozeni.y[i] + 2} width={sirka} height={RADEK - 4 + rozlozeni.navic[i]} fill="transparent" className={klikaci ? 'graf-cil-mysi klikaci' : 'graf-cil-mysi'}
                  onPointerMove={hover} onClick={klikaci ? (e) => otevri(p, e.currentTarget) : undefined} />
                <text x={w + 8} y={y + 32} className="graf-hodnota" data-hodnota={p.klic}>{p.text}</text>
              </g>
            );
          })}
        </svg>
        <Bublina stav={bublina} sirka={sirka} />
      </div>
    </GrafRam>
  );
}
