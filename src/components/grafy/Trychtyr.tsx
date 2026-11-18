// TRYCHTÝŘ MILNÍKŮ (Přehled vedení úkol 14a, Albert 17. 11. 2026; spec §4.4 a §7.2, kontrakt §5.4; skill dataviz: kroky trychtýře
// jsou pořadí, proto rampa jednoho odstínu světlá → tmavá, --graf-krok-1 až 7 kolem oranžové appky). Kohorta „první hovor
// v období“: každý krok jeden pruh (délka = klienti, kteří mají ten milník i všechny dřívější), nad pruhem název kroku, za koncem
// počet a převod z předchozího kroku. Krok dovolan je v Přehledu „Spojen“ (rozhodnutí koordinátora 18. 11. 2026, src/prehled.ts),
// nikdy „Dovolán“. Kdo ještě běží (otevřených) a kdo má milník bez předchozího, je v bublině a v tabulce; nic se nedopočítává.
// Neznámý krok (zdroj chybí) pruh nemá a ukáže „—“ s důvodem. Klik na pruh = řádky kroku; klávesnicí totéž v tabulce.

import { useId, type PointerEvent as ReactPointerEvent } from 'react';
import type { PrehledProklik } from '../../api/types';
import { formatPodil, nazevMetriky } from '../../prehled';
import { CisloTlacitko } from '../prehled/Tabulka';
import GrafRam, { Bublina, cestaPruhu, navratFokusu, Popisek, rozlozRadky, useBublina, useSirka } from './Ram';

export interface KrokGrafu {
  klic: string;
  nazev: string;
  n: number | null;
  zPredchoziho: number | null;
  zKohorty: number | null;
  otevrenych: number | null;
  bezPredchoziho: number | null;
  duvod?: string | null;
  proklik?: PrehledProklik | null;
}

const RADEK = 46;
const PRUH = 16;
const PROSTOR_HODNOTY = 104;
const cislo = (n: number | null): string => (n === null ? '—' : new Intl.NumberFormat('cs-CZ').format(n));
const podil = (p: number | null): string => (p === null ? '—' : formatPodil(p));

export default function Trychtyr({
  graf = 'trychtyr',
  nadpis,
  uroven = 3,
  popis,
  kroky,
  onProklik,
  vychoziTabulka = false,
}: {
  graf?: string;
  nadpis: string;
  uroven?: 3 | 4;
  popis?: string | null;
  kroky: KrokGrafu[];
  onProklik?: (p: PrehledProklik, nazev: string, odkud: HTMLElement | null) => void;
  vychoziTabulka?: boolean;
}) {
  const id = useId();
  const [plocha, sirka] = useSirka<HTMLDivElement>();
  const { bublina, ukaz, skryj } = useBublina();
  const nazvy = kroky.map((k) => nazevMetriky(k.klic, k.nazev));
  const max = Math.max(0, ...kroky.map((k) => k.n ?? 0));
  const delka = Math.max(40, sirka - PROSTOR_HODNOTY);
  const rozlozeni = rozlozRadky(nazvy, sirka, RADEK);
  const vyska = Math.max(RADEK, rozlozeni.vyska) + 2;
  const desc = kroky.length === 0
    ? 'Žádné kroky.'
    : `Trychtýř o ${kroky.length} krocích: ${kroky.map((k, i) => `${nazvy[i]} ${cislo(k.n)}${k.zPredchoziho !== null ? ` (${podil(k.zPredchoziho)} z předchozího)` : ''}`).join(', ')}. Čísla jsou i v tabulce.`;
  const tabulka = (
    <table className="prehled-tabulka">
      <thead>
        <tr>
          <th scope="col">Krok</th>
          <th scope="col" className="cislo-sloupec">Klientů</th>
          <th scope="col" className="cislo-sloupec">Z předchozího</th>
          <th scope="col" className="cislo-sloupec">Z kohorty</th>
          <th scope="col" className="cislo-sloupec">Otevřených (ještě běží)</th>
          <th scope="col" className="cislo-sloupec">Bez předchozího kroku</th>
        </tr>
      </thead>
      <tbody>
        {kroky.map((k, i) => (
          <tr key={k.klic} data-radek={k.klic}>
            <th scope="row">
              {nazvy[i]}
              {k.duvod ? <span className="prehled-bunka-pozn">{k.duvod}</span> : null}
            </th>
            <td className="cislo-sloupec">
              <CisloTlacitko text={cislo(k.n)} nazev={`${nadpis} – ${nazvy[i]}`}
                onClick={k.proklik && onProklik && k.n !== null ? (el) => onProklik(k.proklik!, `${nadpis} – ${nazvy[i]}`, el) : null} />
            </td>
            <td className="cislo-sloupec">{podil(k.zPredchoziho)}</td>
            <td className="cislo-sloupec">{podil(k.zKohorty)}</td>
            <td className="cislo-sloupec">{cislo(k.otevrenych)}</td>
            <td className="cislo-sloupec">{cislo(k.bezPredchoziho)}</td>
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
          {kroky.map((k, i) => {
            const y = rozlozeni.y[i] + rozlozeni.navic[i];
            const w = k.n !== null && max > 0 ? (delka * k.n) / max : 0;
            const klikaci = !!k.proklik && !!onProklik && k.n !== null;
            const barva = `var(--graf-krok-${Math.min(7, i + 1)})`;
            const hover = (e: ReactPointerEvent<SVGElement>) => ukaz(e, {
              nadpis: nazvy[i],
              radky: [
                { nazev: 'klientů', hodnota: cislo(k.n), barva },
                ...(k.zPredchoziho !== null ? [{ nazev: 'z předchozího kroku', hodnota: podil(k.zPredchoziho) }] : []),
                ...(k.otevrenych ? [{ nazev: 'ještě běží', hodnota: cislo(k.otevrenych) }] : []),
                ...(k.bezPredchoziho ? [{ nazev: 'bez předchozího kroku', hodnota: cislo(k.bezPredchoziho) }] : []),
              ],
              pozn: k.duvod,
            });
            const otevri = (el: Element) => {
              if (klikaci) onProklik!(k.proklik!, `${nadpis} – ${nazvy[i]}`, navratFokusu(el));
            };
            return (
              <g key={k.klic} className="graf-polozka">
                <Popisek x={4} y={rozlozeni.y[i] + 14} radky={rozlozeni.radky[i]} />
                {w > 0 && (
                  <path data-krok={k.klic} fill={barva} d={cestaPruhu(1, y + 21, Math.max(2, w), PRUH)} className={`graf-pruh${klikaci ? ' klikaci' : ''}`} />
                )}
                <rect data-cil-kroku={k.klic} x="0" y={rozlozeni.y[i] + 2} width={sirka} height={RADEK - 4 + rozlozeni.navic[i]} fill="transparent" className={klikaci ? 'graf-cil-mysi klikaci' : 'graf-cil-mysi'}
                  onPointerMove={hover} onClick={klikaci ? (e) => otevri(e.currentTarget) : undefined} />
                <text x={w + 8} y={y + 34} className="graf-hodnota" data-krok={k.klic}>
                  {cislo(k.n)}
                  {k.zPredchoziho !== null ? ` · ${podil(k.zPredchoziho)}` : ''}
                </text>
              </g>
            );
          })}
        </svg>
        <Bublina stav={bublina} sirka={sirka} />
      </div>
    </GrafRam>
  );
}
