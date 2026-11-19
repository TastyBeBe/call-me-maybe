// PANEL FILTRŮ SEZNAMŮ (Přehled vedení úkol 11, Albert 17. 11. 2026: filtry jsou „super messy and clunky … not in terms of
// the content, but how they are positioned and structured“; spec docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md
// §7.4). Kontakty, Moji klienti a Označené mají tytéž filtry, tytéž parametry serveru a tutéž viditelnost jako dřív (Volající
// jen nad svými klienty, nic nového o jiných lidech); mění se jen pořadí, skupiny a popisky:
//  1. řada: osoba (slot `lide`; úkol 10 sem dá výběr lidí) · segment · hledání (jedno pole, jedno zpoždění 300 ms),
//  2. řada: stav · známka · neodpověděl · mlčí · čekání · hvězda · odpověděl · řazení vpravo (components/SeznamFiltry.tsx),
//     pod ní koše čekání (jen se zapnutým čekáním) a pilulky stránky (`extra`: Označené „Co je potřeba“),
//  3. řada: čipy zapnutých filtrů s křížkem a „Zrušit vše“: zruší všechno kromě segmentu a výběru člověka (jako dřív
//     „Zrušit filtry“), navíc čekání, koš a „Co je potřeba“. ⚠ NAHRAZUJE „Zrušit filtry“, které je nechávalo. Výběr člověka
//     je rozsah stránky („čí klienti“) jako segment, ne filtr (rozhodnutí koordinátora 18. 11. 2026: „a super admin viewing
//     Petra's clients must stay on Petra's clients“): má jen svůj čip, který ho vrátí na výchozí, a „Zrušit vše“ ho nechá;
//     ⚠ NAHRAZUJE „Zrušit vše vrátí i výběr člověka (onZrusVse stránky)“ z b34677f. „Zrušit vše“ je jen u čipů filtrů.
// Telefon (do 640 px): venku zůstane segment, hledání, tlačítko „Filtry (n)“ (n = počet čipů) a čipy; osoba, řada 2, koše,
// pilulky a řazení jsou v jednom okně odspodu (role dialog, Escape a tlačítka ho zavřou, fokus se vrátí na tlačítko).
// Segment zůstává venku, protože ho „Zrušit vše“ nechává a čip nemá: zúžený seznam by jinak nebyl na první pohled poznat.
// Filtry se nepamatují (docs/ARCHITEKTI.md 9.6): stav drží stránka, panel nic neukládá do adresy ani do prohlížeče.

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { lzeZrusit, mlciRozsah, zrusVse, type StavFiltru } from '../filtry';
import { FiltrIcon, XIcon } from '../icons';
import {
  ALL_KOSE,
  CEKANI_LABELS,
  FLAG_LABELS,
  KOS_LABELS,
  OZNACENI_LABELS,
  STATUS_LABELS,
  SegmentFilter,
  ZNAMKA_FILTR_LABELS,
} from '../ui';
import SeznamFiltry from './SeznamFiltry';

/** Zpoždění hledání na serveru po posledním písmenu (jako dřív na všech třech stránkách). */
export const HLEDANI_ZPOZDENI_MS = 300;

/** Kdy je panel „telefon“ (tlačítko Filtry a okno); stejná hranice jako ostatní pravidla telefonu v styles.css. */
export const TELEFON_MEDIA = '(max-width: 640px)';

/**
 * Hledání se zpožděním (jedno pro Kontakty, Moji klienti i Označené): text bez mezer na krajích, HLEDANI_ZPOZDENI_MS po
 * posledním písmenu. Na začátku hned (Kontakty otevřené s ?search=…).
 */
export function useZpozdeneHledani(text: string): string {
  const [hodnota, setHodnota] = useState(() => text.trim());
  useEffect(() => {
    const t = setTimeout(() => setHodnota(text.trim()), HLEDANI_ZPOZDENI_MS);
    return () => clearTimeout(t);
  }, [text]);
  return hodnota;
}

function telefonTed(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(TELEFON_MEDIA).matches;
}

/** Je obrazovka telefon (TELEFON_MEDIA)? Sleduje změnu šířky (otočení, okno). */
export function useTelefon(): boolean {
  const [telefon, setTelefon] = useState(telefonTed);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(TELEFON_MEDIA);
    const zmena = () => setTelefon(mq.matches);
    zmena();
    mq.addEventListener('change', zmena);
    return () => mq.removeEventListener('change', zmena);
  }, []);
  return telefon;
}

/** Čip zapnutého filtru: klíč, text a stav filtrů bez něj. */
export interface Cip {
  klic: string;
  text: string;
  zrus: () => StavFiltru;
}

/**
 * Čip výběru lidí (řada 1, dává ho stránka, jen když výběr není výchozí): text a návrat k výchozímu výběru. Počítá se do
 * „Filtry (n)“ (na telefonu je výběr v okně), „Zrušit vše“ ho nechá (rozsah stránky jako segment).
 */
export interface LideCip {
  text: string;
  zrus: () => void;
}

/**
 * Čipy zapnutých filtrů v pořadí řady filtrů: stav, známka, neodpověděl, mlčí, čekání a koš, hvězda, odpověděl, „Co je
 * potřeba“. Segment (ten „Zrušit vše“ nechává), řazení a hledání čip nemají (vidět jsou ve svém poli).
 */
export function aktivniChipy(f: StavFiltru): Cip[] {
  const c: Cip[] = [];
  for (const s of f.statusy) {
    c.push({ klic: `stav:${s}`, text: `Stav: ${STATUS_LABELS[s] ?? s}`, zrus: () => ({ ...f, statusy: f.statusy.filter((x) => x !== s) }) });
  }
  for (const z of f.znamky) {
    c.push({
      klic: `znamka:${z}`,
      text: z === 'bez' ? 'Bez známky' : `Známka ${ZNAMKA_FILTR_LABELS[z] ?? z}`,
      zrus: () => ({ ...f, znamky: f.znamky.filter((x) => x !== z) }),
    });
  }
  for (const k of f.kategorie) {
    c.push({ klic: `kategorie:${k}`, text: OZNACENI_LABELS[k] ?? k, zrus: () => ({ ...f, kategorie: f.kategorie.filter((x) => x !== k) }) });
  }
  const mlci = mlciRozsah(f.mlciMin, f.mlciMax);
  if (mlci) c.push({ klic: 'mlci', text: `Mlčí ${mlci}`, zrus: () => ({ ...f, mlciMin: null, mlciMax: null }) });
  if (f.cekani) {
    c.push({ klic: 'cekani', text: CEKANI_LABELS[f.cekani] ?? f.cekani, zrus: () => ({ ...f, cekani: '', kos: '' }) });
    // koš platí jen se zapnutým čekáním (stránka ho bez čekání neposílá)
    if (f.kos) c.push({ klic: 'kos', text: KOS_LABELS[f.kos] ?? f.kos, zrus: () => ({ ...f, kos: '' }) });
  }
  if (f.jenHvezda) c.push({ klic: 'hvezda', text: 'Jen s hvězdou', zrus: () => ({ ...f, jenHvezda: false }) });
  if (f.jenOdpovedel) c.push({ klic: 'odpovedel', text: 'Odpověděl, zatím nepotvrdil', zrus: () => ({ ...f, jenOdpovedel: false }) });
  const popisDruhu = (d: string) => (OZNACENI_LABELS as Record<string, string>)[d] ?? (FLAG_LABELS as Record<string, string>)[d] ?? d;
  for (const d of f.druhy) {
    c.push({ klic: `druh:${d}`, text: popisDruhu(d), zrus: () => ({ ...f, druhy: f.druhy.filter((x) => x !== d) }) });
  }
  return c;
}

export default function FiltrPanel({
  filtry,
  onFiltry,
  lide,
  lideCip,
  segment = true,
  hledat,
  razeni,
  pocty,
  kategorie = true,
  cekani = false,
  koseClassName = '',
  extra,
  vysledky,
  className = '',
}: {
  filtry: StavFiltru;
  onFiltry: (f: StavFiltru) => void;
  /** slot „Lidé“ v řadě 1 (výběr člověka stránky); na telefonu v okně */
  lide?: ReactNode;
  /** čip výběru lidí, když není výchozí (počítá se do „Filtry (n)“, „Zrušit vše“ ho nechá) */
  lideCip?: LideCip | null;
  /** filtr segmentu (vše / chaty / architekti / niky) */
  segment?: boolean;
  /** pole hledání: popisek pro čtečku a nápověda */
  hledat: { aria: string; placeholder: string };
  /** RazeniSelect stránky */
  razeni: ReactNode;
  /** jen super admin (045): počty u stavů, jejich součet a počty v koších */
  pocty?: { stavy?: Record<string, number>; soucet?: number; kose?: Record<string, number> };
  /** Neodpověděl (Označené false: mají pilulky „Co je potřeba“) */
  kategorie?: boolean;
  /** čekání na odpověď s koši (Kontakty, Moji klienti) */
  cekani?: boolean;
  /** třída řady košů navíc (Moji klienti „moji-kose“) */
  koseClassName?: string;
  /** pilulky stránky pod řadou filtrů (Označené „Co je potřeba“) */
  extra?: ReactNode;
  /** počet řádků po filtrech pro tlačítko okna na telefonu („Zobrazit (12)“); null = neznámý („Hotovo“) */
  vysledky?: number | null;
  className?: string;
}) {
  const telefon = useTelefon();
  const [otevreno, setOtevreno] = useState(false);
  const tlacitko = useRef<HTMLButtonElement>(null);
  const okno = useRef<HTMLDivElement>(null);
  const bylOtevreno = useRef(false);
  const idOkna = useId();
  const idNadpisu = useId();
  const zmen = (patch: Partial<StavFiltru>) => onFiltry({ ...filtry, ...patch });
  const cipy = aktivniChipy(filtry);
  const pocetCipu = cipy.length + (lideCip ? 1 : 0);
  // „Zrušit vše“ jen nad stavem filtrů: segment a výběr člověka (rozsah stránky) zůstanou
  const zrusVseKlik = () => {
    onFiltry(zrusVse(filtry));
  };

  // okno je jen na telefonu: širší obrazovka (otočení) ho zavře
  useEffect(() => {
    if (!telefon) setOtevreno(false);
  }, [telefon]);

  // otevřené okno: stránka pod ním se neposouvá, fokus do okna, Escape ho zavře (otevřený výběr v něm zavře Escape napřed sám
  // sebe, rozbalovač má vlastní posluchač); po zavření se fokus vrátí na tlačítko „Filtry“
  useEffect(() => {
    if (!otevreno) {
      if (bylOtevreno.current) tlacitko.current?.focus();
      bylOtevreno.current = false;
      return;
    }
    bylOtevreno.current = true;
    const puvodni = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    okno.current?.querySelector<HTMLElement>('.filtr-sheet-zavrit')?.focus();
    const klavesa = (e: KeyboardEvent) => {
      // otevřený výběr (stav, známka, mlčí; od úkolu 10 i výběr lidí) zavře Escape napřed sám sebe
      if (e.key !== 'Escape' || okno.current?.querySelector('.vyber-vice-panel, .lide-picker-panel')) return;
      setOtevreno(false);
    };
    document.addEventListener('keydown', klavesa);
    return () => {
      document.body.style.overflow = puvodni;
      document.removeEventListener('keydown', klavesa);
    };
  }, [otevreno]);

  // Tab zůstane v okně (aria-modal)
  const tabVOkne = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !okno.current) return;
    const prvky = [
      ...okno.current.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'),
    ].filter((x) => x.offsetParent !== null);
    if (prvky.length === 0) return;
    const prvni = prvky[0];
    const posledni = prvky[prvky.length - 1];
    if (e.shiftKey && document.activeElement === prvni) {
      e.preventDefault();
      posledni.focus();
    } else if (!e.shiftKey && document.activeElement === posledni) {
      e.preventDefault();
      prvni.focus();
    }
  };

  const segmentPole = segment ? <SegmentFilter value={filtry.segment} onChange={(s) => zmen({ segment: s })} /> : null;
  const hledatPole = (
    <div className="search-wrap filtr-hledat">
      <input
        className="search-input"
        aria-label={hledat.aria}
        placeholder={hledat.placeholder}
        enterKeyHint="search"
        value={filtry.hledat}
        onChange={(e) => zmen({ hledat: e.target.value })}
      />
    </div>
  );
  const kosePocty = pocty?.kose ?? {};
  const kose =
    cekani && filtry.cekani ? (
      <div className={`flag-filter-bar filtr-kose ${koseClassName}`.trim()} role="group" aria-label="Jak dlouho klient čeká">
        <span className="filtr-skupina-popisek" aria-hidden="true">
          Čeká
        </span>
        {ALL_KOSE.map((k) => (
          <button
            key={k}
            type="button"
            className={`pill-btn sm${filtry.kos === k ? ' go' : ''}`}
            aria-pressed={filtry.kos === k}
            onClick={() => zmen({ kos: filtry.kos === k ? '' : k })}
          >
            {KOS_LABELS[k]}
            {kosePocty[k] !== undefined ? ` (${kosePocty[k]})` : ''}
          </button>
        ))}
        <button type="button" className={`pill-btn sm${filtry.kos === '' ? ' go' : ''}`} aria-pressed={filtry.kos === ''} onClick={() => zmen({ kos: '' })}>
          Vše
        </button>
      </div>
    ) : null;
  const cipTlacitka = (
    <>
      {lideCip && (
        <button type="button" className="filtr-cip" aria-label={`Zrušit filtr: ${lideCip.text}`} title="Zrušit tento filtr" onClick={lideCip.zrus}>
          {lideCip.text} <XIcon size={13} />
        </button>
      )}
      {cipy.map((c) => (
        <button key={c.klic} type="button" className="filtr-cip" aria-label={`Zrušit filtr: ${c.text}`} title="Zrušit tento filtr" onClick={() => onFiltry(c.zrus())}>
          {c.text} <XIcon size={13} />
        </button>
      ))}
    </>
  );
  const zrusitVse = (
    <button type="button" className="pill-btn sm zrusit-filtry" onClick={zrusVseKlik}>
      <XIcon size={14} /> Zrušit vše
    </button>
  );

  if (!telefon) {
    return (
      <div className={`filtr-panel ${className}`.trim()}>
        <div className="filtr-rada filtr-rada-1">
          <div className="filtr-lide">{lide}</div>
          {segmentPole}
          {hledatPole}
        </div>
        <SeznamFiltry
          filtry={filtry}
          onChange={onFiltry}
          statusPocty={pocty?.stavy}
          statusSoucet={pocty?.soucet}
          kategorie={kategorie}
          cekani={cekani}
          razeni={razeni}
        />
        {kose}
        {extra}
        {(pocetCipu > 0 || lzeZrusit(filtry)) && (
          <div className="filtr-rada filtr-cipy" role="group" aria-label="Zapnuté filtry">
            {cipTlacitka}
            {lzeZrusit(filtry) && zrusitVse}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`filtr-panel je-telefon ${className}`.trim()}>
      {segmentPole}
      {hledatPole}
      <div className="filtr-rada filtr-cipy" role="group" aria-label="Filtry">
        <button
          ref={tlacitko}
          type="button"
          className={`pill-btn sm filtr-telefon-btn${pocetCipu > 0 ? ' zapnuto' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={otevreno}
          aria-controls={idOkna}
          onClick={() => setOtevreno(true)}
        >
          <FiltrIcon size={16} /> {pocetCipu > 0 ? `Filtry (${pocetCipu})` : 'Filtry'}
        </button>
        {cipTlacitka}
        {cipy.length > 0 && zrusitVse}
      </div>
      {otevreno && (
        <>
          <div className="filtr-sheet-scrim" aria-hidden="true" onClick={() => setOtevreno(false)} />
          <div className="filtr-sheet" id={idOkna} role="dialog" aria-modal="true" aria-labelledby={idNadpisu} ref={okno} onKeyDown={tabVOkne}>
            <div className="filtr-sheet-hlava">
              <h2 className="filtr-sheet-nadpis" id={idNadpisu}>
                Filtry
              </h2>
              <button type="button" className="drawer-close filtr-sheet-zavrit" aria-label="Zavřít filtry" onClick={() => setOtevreno(false)}>
                <XIcon size={18} />
              </button>
            </div>
            <div className="filtr-sheet-telo">
              <div className="filtr-lide">{lide}</div>
              <SeznamFiltry
                filtry={filtry}
                onChange={onFiltry}
                statusPocty={pocty?.stavy}
                statusSoucet={pocty?.soucet}
                kategorie={kategorie}
                cekani={cekani}
                kose={kose}
              />
              {extra}
              <div className="filter-bar filtr-razeni-rada">{razeni}</div>
            </div>
            <div className="filtr-sheet-pata">
              <button type="button" className="pill-btn zrusit-filtry" disabled={!lzeZrusit(filtry)} onClick={zrusVseKlik}>
                <XIcon size={15} /> Zrušit vše
              </button>
              <button type="button" className="pill-btn go filtr-sheet-hotovo" onClick={() => setOtevreno(false)}>
                {vysledky === null || vysledky === undefined ? 'Hotovo' : `Zobrazit (${vysledky})`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
