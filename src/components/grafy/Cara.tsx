// ČÁRA: TREND JEDNÉ ŘADY PROTI CÍLI (Přehled vedení úkol 14a, Albert 17. 11. 2026; spec §7.2 „trend vs target“, kontrakt §5.3;
// skill dataviz). Jedna řada v oranžové appky (čára 2 px, plocha pod ní 10 %, koncový bod s prstencem v barvě plochy a hodnotou
// u konce), cíl jako přerušovaná čára s popiskem (prahová hodnota, ne mřížka), mřížka a osy tenké a tiché, jedna osa Y od nuly.
// Neznámý sloupec (před zdrojem, po datu dat) čáru přeruší, nikdy z něj není nula. Nitkový kříž a bublina ukážou hodnotu sloupce
// pod ukazatelem; totéž je v tabulce („Zobrazit jako tabulku“). Legenda jen když je i cíl (dvě položky).

import { useId, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { cestaCary, dilkyOsy } from '../../grafy';
import GrafRam, { Bublina, useBublina, useSirka, type PolozkaLegendy } from './Ram';
import { pocetSlovy } from '../../prehled';

/** Šířka znaku popisku osy (11,5 px tučně, číslice a tečky; horní odhad) a mezera mezi popisky osy X. */
const SIRKA_ZNAKU_OSY = 6.6;
const MEZERA_POPISKU = 8;

export interface BodCary {
  klic: string;
  /** popisek osy X („8. 11.“) */
  popisek: string;
  /** hodnota bodu; null = bez čáry */
  hodnota: number | null;
  /** hodnota pro lidi („10 500 Kč“, „—“) */
  text: string;
  /** neúplné (sloupec bez přesné částky v součtu) */
  castecne?: boolean;
}

const VYSKA = 240;
const NAHORE = 18;
const DOLE = 30;
const VPRAVO = 16;

/** „30 tis.“, „1,5 mil.“: osa, která dosáhne 10 000, píše čísla krátce; pod tím celá. */
export function kratceCislo(n: number): string {
  const f = (x: number, mist: number) => new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: mist }).format(x);
  if (Math.abs(n) >= 1_000_000) return `${f(n / 1_000_000, 1)} mil.`;
  if (Math.abs(n) >= 10_000) return `${f(n / 1000, 1)} tis.`;
  return f(n, 2);
}

export default function Cara({
  graf = 'cara',
  nadpis,
  uroven = 3,
  popis,
  nazevRady,
  body,
  cil = null,
  cele = false,
  tabulka,
  ovladani,
  vychoziTabulka = false,
}: {
  graf?: string;
  nadpis: string;
  uroven?: 3 | 4;
  popis?: ReactNode;
  /** název řady (legenda, bublina) */
  nazevRady: string;
  body: BodCary[];
  /** cíl jako vodorovná prahová čára (celý cíl, bez rozpočítání) */
  cil?: { hodnota: number; text: string } | null;
  /** osa jen celá čísla (počty) */
  cele?: boolean;
  /** vlastní tabulka (jinak bod a hodnota) */
  tabulka?: ReactNode;
  ovladani?: ReactNode;
  vychoziTabulka?: boolean;
}) {
  const id = useId();
  const [plocha, sirka] = useSirka<HTMLDivElement>();
  const { bublina, ukaz, skryj } = useBublina();
  // sloupec pod nitkovým křížem (null = žádný)
  const [nitkaI, setNitka] = useState<number | null>(null);
  const zname = body.filter((b) => b.hodnota !== null) as (BodCary & { hodnota: number })[];
  const max = Math.max(0, ...zname.map((b) => b.hodnota), cil?.hodnota ?? 0);
  const dilky = dilkyOsy(max, 4, cele);
  const vrch = dilky[dilky.length - 1] || 1;
  const osaText = dilky.map(kratceCislo);
  const vlevo = Math.max(30, Math.max(...osaText.map((t) => t.length)) * 7 + 10);
  const sirkaPlochy = Math.max(60, sirka - vlevo - VPRAVO);
  const x = (i: number) => vlevo + (body.length <= 1 ? sirkaPlochy / 2 : (sirkaPlochy * i) / (body.length - 1));
  const y = (v: number) => NAHORE + (VYSKA - NAHORE - DOLE) * (1 - v / vrch);
  const hodnoty = body.map((b) => b.hodnota);
  const cesta = cestaCary(hodnoty, x, y);
  // plocha pod čárou po souvislých úsecích (10 % barvy řady)
  const plochy: string[] = [];
  let usek: number[] = [];
  const zavriUsek = () => {
    if (usek.length > 0) {
      const z = y(0);
      plochy.push(`M${x(usek[0])} ${z} ${usek.map((i) => `L${x(i)} ${y(hodnoty[i]!)}`).join(' ')} L${x(usek[usek.length - 1])} ${z}Z`);
    }
    usek = [];
  };
  hodnoty.forEach((v, i) => (v === null ? zavriUsek() : usek.push(i)));
  zavriUsek();
  const posledni = [...body.keys()].reverse().find((i) => hodnoty[i] !== null);
  // popisky osy X: tak hustě, jak se vejdou (odhad šířky z nejdelšího popisku); poslední vždy. Oprava po recenzi (drobnost 9):
  // skutečné okraje textu podle zarovnání (první od svého bodu doprava, poslední doleva, ostatní na střed) a mezera 8 px, takže
  // se popisky nepřekrývají ani na telefonu 390 px
  const sirkaPopisku = Math.max(40, Math.max(0, ...body.map((b) => b.popisek.length)) * 6.5 + 12);
  const kazdy = Math.max(1, Math.ceil(body.length / Math.max(2, Math.floor(sirkaPlochy / sirkaPopisku))));
  const posledniX = body.length - 1;
  const okrajePopisku = (i: number): [number, number] => {
    const w = body[i].popisek.length * SIRKA_ZNAKU_OSY;
    if (body.length > 1 && i === 0) return [x(0), x(0) + w];
    if (body.length > 1 && i === posledniX) return [x(i) - w, x(i)];
    return [x(i) - w / 2, x(i) + w / 2];
  };
  const vybranePopisky: number[] = [];
  const zacatekPosledniho = body.length > 1 ? okrajePopisku(posledniX)[0] : Infinity;
  for (let i = 0; i < posledniX; i += kazdy) {
    const [l, r] = okrajePopisku(i);
    const predchozi = vybranePopisky.length > 0 ? okrajePopisku(vybranePopisky[vybranePopisky.length - 1])[1] : -Infinity;
    if (l >= predchozi + MEZERA_POPISKU && r + MEZERA_POPISKU <= zacatekPosledniho) vybranePopisky.push(i);
  }
  if (body.length > 0) vybranePopisky.push(posledniX);
  const popiskyX = vybranePopisky.map((i) => ({ b: body[i], i }));
  const legenda: PolozkaLegendy[] = cil ? [{ nazev: nazevRady, barva: 'var(--graf-rada)', tvar: 'cara' }, { nazev: `Cíl ${cil.text}`, barva: 'var(--ink)', tvar: 'prerusovana' }] : [];
  const desc = `${nazevRady}, ${pocetSlovy(body.length, ['# bod', '# body', '# bodů'])} od ${body[0]?.popisek ?? '—'} do ${body[body.length - 1]?.popisek ?? '—'}`
    + `${posledni !== undefined ? `; poslední známá hodnota ${body[posledni].text} (${body[posledni].popisek})` : '; žádná známá hodnota'}`
    + `${cil ? `; cíl ${cil.text}` : '; cíl není zadaný'}. Čísla jsou i v tabulce.`;

  const nitka = (e: ReactPointerEvent<SVGRectElement>) => {
    if (body.length === 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left + vlevo;
    const i = Math.max(0, Math.min(body.length - 1, Math.round(((px - vlevo) / sirkaPlochy) * Math.max(1, body.length - 1))));
    const b = body[i];
    ukaz(e, {
      nadpis: b.popisek,
      radky: [{ nazev: nazevRady, hodnota: b.text, barva: 'var(--graf-rada)' }, ...(cil ? [{ nazev: 'Cíl', hodnota: cil.text, barva: 'var(--ink)' }] : [])],
      pozn: b.castecne ? 'Část položek nemá přesnou částku; skutečnost je vyšší.' : b.hodnota === null ? 'Hodnota není známá (před začátkem zdroje nebo po datu dat).' : null,
    });
    setNitka(i);
  };

  const vychoziTab = (
    <table className="prehled-tabulka">
      <thead>
        <tr>
          <th scope="col">Období</th>
          <th scope="col" className="cislo-sloupec">{nazevRady}</th>
        </tr>
      </thead>
      <tbody>
        {body.map((b) => (
          <tr key={b.klic} data-radek={b.klic}>
            <th scope="row">{b.popisek}</th>
            <td className="cislo-sloupec">{b.text}{b.castecne ? <span className="prehled-bunka-pozn">částečně</span> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <GrafRam graf={graf} nadpis={nadpis} uroven={uroven} popis={popis} legenda={legenda} tabulka={tabulka ?? vychoziTab} vychoziTabulka={vychoziTabulka} ovladani={ovladani}>
      <div className="graf-plocha" ref={plocha} onPointerLeave={() => { skryj(); setNitka(null); }}>
        <svg role="img" aria-labelledby={`${id}-t ${id}-d`} width={sirka} height={VYSKA} viewBox={`0 0 ${sirka} ${VYSKA}`} className="graf-svg">
          <title id={`${id}-t`}>{nadpis}</title>
          <desc id={`${id}-d`}>{desc}</desc>
          {dilky.map((d, i) => (
            <g key={d}>
              <line x1={vlevo} x2={vlevo + sirkaPlochy} y1={y(d)} y2={y(d)} className={i === 0 ? 'graf-zaklad' : 'graf-mrizka'} />
              <text x={vlevo - 6} y={y(d) + 4} className="graf-osa" textAnchor="end">{osaText[i]}</text>
            </g>
          ))}
          {popiskyX.map(({ b, i }) => (
            <text key={b.klic} x={x(i)} y={VYSKA - 10} className="graf-osa" textAnchor={i === 0 && body.length > 1 ? 'start' : i === body.length - 1 && body.length > 1 ? 'end' : 'middle'}>
              {b.popisek}
            </text>
          ))}
          {plochy.map((d) => (
            <path key={d} className="graf-plocha-rady" d={d} fill="var(--graf-rada)" fillOpacity="0.1" />
          ))}
          {cil && (
            <g>
              <line className="graf-cil" x1={vlevo} x2={vlevo + sirkaPlochy} y1={y(cil.hodnota)} y2={y(cil.hodnota)} stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="6 4" />
              <text className="graf-cil-popisek" x={vlevo + sirkaPlochy} y={y(cil.hodnota) - 6} textAnchor="end">Cíl {cil.text}</text>
            </g>
          )}
          {cesta && <path className="graf-cara" d={cesta} fill="none" stroke="var(--graf-rada)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
          {nitkaI !== null && <line className="graf-nitka" x1={x(nitkaI)} x2={x(nitkaI)} y1={NAHORE} y2={VYSKA - DOLE} />}
          {posledni !== undefined && (
            <g>
              <circle cx={x(posledni)} cy={y(hodnoty[posledni]!)} r="4.5" fill="var(--graf-rada)" stroke="var(--cream)" strokeWidth="2" />
              {/* hodnota u konce čáry: v levé polovině vpravo od bodu, jinak vlevo (nepřeteče osu ani okraj) */}
              <text className="graf-hodnota graf-konec" x={x(posledni) < vlevo + sirkaPlochy / 2 ? x(posledni) + 8 : x(posledni) - 8} y={y(hodnoty[posledni]!) - 10}
                textAnchor={x(posledni) < vlevo + sirkaPlochy / 2 ? 'start' : 'end'}>{body[posledni].text}</text>
            </g>
          )}
          {nitkaI !== null && hodnoty[nitkaI] !== null && (
            <circle cx={x(nitkaI)} cy={y(hodnoty[nitkaI]!)} r="4.5" fill="var(--graf-rada)" stroke="var(--cream)" strokeWidth="2" />
          )}
          <rect className="graf-cil-mysi" x={vlevo} y={NAHORE} width={sirkaPlochy} height={VYSKA - NAHORE - DOLE} fill="transparent" onPointerMove={nitka} />
        </svg>
        <Bublina stav={bublina} sirka={sirka} />
      </div>
    </GrafRam>
  );
}
