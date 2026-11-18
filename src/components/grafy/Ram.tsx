// RÁM GRAFU PŘEHLEDU (Přehled vedení úkol 14a, Albert 17. 11. 2026; spec docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md §7:
// „hand-made SVG components …, accessible: title/desc + Zobrazit jako tabulku“). Společný kus všech čtyř grafů (Cara, Sloupce,
// Trychtyr, Pasma): figure s nadpisem a přepínačem „Zobrazit jako tabulku“ (tabulka se stejnými čísly místo grafu, aria-expanded),
// popis, legenda (jen u dvou a víc řad; jedna řada ji nemá, název ji nese), bublina nad značkou (myš i dotyk; nikdy jediná cesta
// k číslu: totéž je v popiscích a v tabulce) a šířka plochy z kontejneru (SVG se kreslí v pixelech, písmo zůstane čitelné i na
// 320 px). Barvy jen z tokenů appky (src/styles.css, --graf-*), text nikdy v barvě dat.

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { SIRKA_ZNAKU, zalomText } from '../../grafy';
import { ChartIcon, TableIcon } from '../../icons';

const useIzoEfekt = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Šířka kontejneru v pixelech (ResizeObserver); na serveru a před měřením `vychozi`. */
export function useSirka<T extends HTMLElement>(vychozi = 640): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [sirka, setSirka] = useState(vychozi);
  useIzoEfekt(() => {
    const el = ref.current;
    if (!el) return;
    const zmer = () => {
      const w = Math.round(el.clientWidth);
      if (w > 0) setSirka(Math.max(160, w));
    };
    zmer();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(zmer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, sirka];
}

export interface PolozkaLegendy {
  nazev: string;
  /** barva značky (var(--graf-…) z tokenů) */
  barva: string;
  /** blok = pruh nebo plocha, cara = čára řady, prerusovana = cíl */
  tvar?: 'blok' | 'cara' | 'prerusovana';
}

/** Legenda: značka v barvě řady vedle názvu (text v barvě textu, nikdy v barvě dat). */
export function Legenda({ polozky }: { polozky: PolozkaLegendy[] }) {
  return (
    <ul className="graf-legenda" aria-label="Legenda">
      {polozky.map((p) => (
        <li key={p.nazev} className="graf-legenda-polozka">
          <svg className="graf-legenda-znak" width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" focusable="false">
            {p.tvar === 'cara' || p.tvar === 'prerusovana' ? (
              <line x1="1" y1="6" x2="17" y2="6" stroke={p.barva} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={p.tvar === 'prerusovana' ? '4 3' : undefined} />
            ) : (
              <rect x="1" y="1" width="16" height="10" rx="3" fill={p.barva} />
            )}
          </svg>
          {p.nazev}
        </li>
      ))}
    </ul>
  );
}

export interface RadekBubliny {
  nazev: string;
  hodnota: string;
  /** barva krátké čárky u řádku (klíč řady) */
  barva?: string;
}
export interface StavBubliny {
  x: number;
  y: number;
  nadpis: string;
  radky: RadekBubliny[];
  pozn?: string | null;
}

/** Bublina nad značkou: hodnota silně, název řady slabě (obráceně než legenda), pod tím poznámka (neúplné číslo). */
export function Bublina({ stav, sirka }: { stav: StavBubliny | null; sirka: number }) {
  if (!stav) return null;
  // bublina nepřeteče plochu: u pravého okraje se překlopí doleva
  const vlevo = stav.x > sirka * 0.6;
  return (
    <div className="graf-bublina" aria-hidden="true" style={{ top: Math.max(0, stav.y), ...(vlevo ? { right: Math.max(0, sirka - stav.x + 10) } : { left: stav.x + 10 }) }}>
      <p className="graf-bublina-nadpis">{stav.nadpis}</p>
      {stav.radky.map((r) => (
        <p key={r.nazev} className="graf-bublina-radek">
          {r.barva && (
            <svg width="12" height="4" viewBox="0 0 12 4" aria-hidden="true" focusable="false">
              <line x1="1" y1="2" x2="11" y2="2" stroke={r.barva} strokeWidth="3" strokeLinecap="round" />
            </svg>
          )}
          <strong>{r.hodnota}</strong> <span>{r.nazev}</span>
        </p>
      ))}
      {stav.pozn && <p className="graf-bublina-pozn">{stav.pozn}</p>}
    </div>
  );
}

/** Stav bubliny a pozice ukazatele vůči ploše grafu. */
export function useBublina(): {
  bublina: StavBubliny | null;
  ukaz: (e: { clientX: number; clientY: number; currentTarget: Element }, obsah: Omit<StavBubliny, 'x' | 'y'>) => void;
  skryj: () => void;
} {
  const [bublina, setBublina] = useState<StavBubliny | null>(null);
  const ukaz = (e: { clientX: number; clientY: number; currentTarget: Element }, obsah: Omit<StavBubliny, 'x' | 'y'>) => {
    const plocha = e.currentTarget.closest('.graf-plocha');
    const r = plocha?.getBoundingClientRect();
    setBublina({ ...obsah, x: r ? e.clientX - r.left : 0, y: r ? e.clientY - r.top - 10 : 0 });
  };
  return { bublina, ukaz, skryj: () => setBublina(null) };
}

/** Prvek, na který se po zavření panelu řádků vrátí fokus (klik do grafu): přepínač na tabulku téhož grafu. */
export function navratFokusu(el: Element | null): HTMLElement | null {
  return el?.closest('figure')?.querySelector<HTMLElement>('.graf-prepinac') ?? null;
}

const RADEK_TEXTU = 15;

/**
 * Svislé rozložení řádků vodorovného grafu: popisek nad pruhem zalomený po slovech podle šířky plochy (SVG text se sám nezalomí,
 * na telefonu by přetekl), každý další řádek popisku řádek grafu prodlouží o 15 px. Vrátí řádky popisků, horní hranu řádku,
 * o kolik je řádek delší a výšku všech řádků.
 */
export function rozlozRadky(nazvy: readonly string[], sirka: number, vyskaRadku: number): { radky: string[][]; y: number[]; navic: number[]; vyska: number } {
  const maxZnaku = Math.max(8, Math.floor((sirka - 8) / SIRKA_ZNAKU));
  const radky = nazvy.map((n) => zalomText(n, maxZnaku));
  const navic = radky.map((r) => (r.length - 1) * RADEK_TEXTU);
  const y: number[] = [];
  let v = 0;
  for (const n of navic) {
    y.push(v);
    v += vyskaRadku + n;
  }
  return { radky, y, navic, vyska: v };
}

/** Popisek v SVG po řádcích (tspan), text v barvě textu. */
export function Popisek({ x, y, radky, className = 'graf-popisek' }: { x: number; y: number; radky: string[]; className?: string }) {
  return (
    <text x={x} y={y} className={className}>
      {radky.map((r, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : RADEK_TEXTU}>{r}</tspan>
      ))}
    </text>
  );
}

/** Plný obdélník s datovým koncem zaobleným 4 px (základna rovně), pro vodorovný pruh od x0 doprava. */
export function cestaPruhu(x0: number, y: number, w: number, h: number, r = 4): string {
  const rr = Math.min(r, w / 2, h / 2);
  const x1 = x0 + w;
  return `M${x0} ${y}H${x1 - rr}A${rr} ${rr} 0 0 1 ${x1} ${y + rr}V${y + h - rr}A${rr} ${rr} 0 0 1 ${x1 - rr} ${y + h}H${x0}Z`;
}

export default function GrafRam({
  graf,
  nadpis,
  uroven = 3,
  popis,
  legenda,
  tabulka,
  vychoziTabulka = false,
  ovladani,
  children,
}: {
  /** klíč grafu do data-graf (zkoušky, odkazy) */
  graf: string;
  nadpis: string;
  uroven?: 3 | 4;
  popis?: ReactNode;
  /** legenda se ukáže jen u dvou a víc položek (jedna řada ji nemá, nese ji název) */
  legenda?: PolozkaLegendy[];
  /** tabulka se stejnými čísly (místo grafu po „Zobrazit jako tabulku“) */
  tabulka: ReactNode;
  /** jen test (vykreslení na serveru): hned tabulka */
  vychoziTabulka?: boolean;
  /** ovládání grafu vedle nadpisu (třeba výběr metriky); mění obsah, nikdy jen ozdoba */
  ovladani?: ReactNode;
  children: ReactNode;
}) {
  const Nadpis = `h${uroven}` as 'h3' | 'h4';
  const [tabulkou, setTabulkou] = useState(vychoziTabulka);
  const id = useId();
  return (
    <figure className="graf" data-graf={graf}>
      <figcaption className="graf-hlava">
        <Nadpis className="graf-nadpis">{nadpis}</Nadpis>
        <span className="graf-ovladani">
          {ovladani}
          <button
            type="button"
            className="pill-btn sm graf-prepinac"
            aria-expanded={tabulkou}
            aria-controls={id}
            data-sfx="none"
            onClick={() => setTabulkou((v) => !v)}
          >
            {tabulkou ? <ChartIcon size={14} /> : <TableIcon size={14} />} {tabulkou ? 'Zobrazit jako graf' : 'Zobrazit jako tabulku'}
          </button>
        </span>
      </figcaption>
      {popis ? <p className="graf-popis">{popis}</p> : null}
      {!tabulkou && legenda && legenda.length >= 2 && <Legenda polozky={legenda} />}
      <div id={id} className="graf-obsah">
        {tabulkou ? <div className="graf-tabulka">{tabulka}</div> : children}
      </div>
    </figure>
  );
}
