// TABULKY A ČÍSLA ZÁLOŽEK PŘEHLEDU (Přehled vedení úkol 14a, Albert 17. 11. 2026; spec docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md
// §7.2: „click → drilldown drawer“ u každého čísla, které má řádky; telefon 320–390 px bez posunu stránky do strany). Číslo
// s proklikem je tlačítko (Enter i klik) s názvem „Zobrazit řádky: …“, číslo bez řádků (kontrakt R19) jen text. Široká tabulka
// se posouvá ve svém rámečku (fokusovatelná oblast, šipkami) a nad ní je vidět nápověda, dokud se celá nevejde. Blok = karta
// s nadpisem části záložky (h3 pod nadpisem záložky h2).

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Číslo v tabulce nebo grafu: s `onClick` tlačítko na řádky (aria-label „Zobrazit řádky: <nazev>“), jinak text. `children` = mini
 * pruh nebo měřák pod číslem (jen ozdoba čísla, aria-hidden).
 */
export function CisloTlacitko({
  text,
  nazev,
  title,
  onClick,
  children,
  className = '',
}: {
  text: string;
  /** co číslo je, do názvu tlačítka („Hovory – Petra“) */
  nazev: string;
  /** přesná hodnota nebo důvod neúplnosti do bubliny */
  title?: string | null;
  onClick?: ((el: HTMLButtonElement) => void) | null;
  children?: ReactNode;
  className?: string;
}) {
  if (!onClick) {
    return (
      <span className={`prehled-cislo ${className}`.trim()} title={title ?? undefined}>
        <span className="cislo-text">{text}</span>
        {children}
      </span>
    );
  }
  return (
    <button type="button" className={`cislo-btn ${className}`.trim()} aria-label={`Zobrazit řádky: ${nazev}`} title={title ?? undefined} data-sfx="none"
      onClick={(e) => onClick(e.currentTarget)}>
      <span className="cislo-text">{text}</span>
      {children}
    </button>
  );
}

/** Rámeček široké tabulky: posun do strany uvnitř (ne celé stránky) a nápověda, jen když se tabulka nevejde. */
export function TabulkaObal({ popisek, children }: { popisek: string; children: ReactNode }) {
  const obal = useRef<HTMLDivElement>(null);
  const [siroka, setSiroka] = useState(false);
  useEffect(() => {
    const el = obal.current;
    if (!el) return;
    const zmer = () => setSiroka(el.scrollWidth > el.clientWidth + 1);
    zmer();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(zmer);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="prehled-tabulka-blok">
      <p className="prehled-tabulka-napoveda" hidden={!siroka}>
        Tabulka je širší než obrazovka, posuňte ji do strany →
      </p>
      <div className="prehled-tabulka-obal" ref={obal} role="region" aria-label={popisek} tabIndex={siroka ? 0 : undefined}>
        {children}
      </div>
    </div>
  );
}

/** Část záložky: karta s nadpisem h3, popisem a obsahem; `blok` do data-blok (zkoušky). */
export function Blok({
  nadpis,
  popis,
  blok,
  ovladani,
  children,
}: {
  nadpis: string;
  popis?: ReactNode;
  blok?: string;
  ovladani?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card prehled-blok" data-blok={blok}>
      <div className="prehled-blok-hlava">
        <h3 className="prehled-blok-nadpis">{nadpis}</h3>
        {ovladani}
      </div>
      {popis ? <p className="prehled-blok-popis">{popis}</p> : null}
      {children}
    </section>
  );
}

/** Mini pruh pod číslem (podíl z největší hodnoty sloupce); neznámé číslo pruh nemá. */
export function MiniPruh({ podil }: { podil: number | null }) {
  if (podil === null || !Number.isFinite(podil)) return null;
  const p = Math.max(0, Math.min(1, podil));
  return (
    <span className="mini-pruh" aria-hidden="true">
      <span className="mini-pruh-vypln" style={{ width: `${(p * 100).toFixed(1)}%` }} />
    </span>
  );
}

/** Měřák (odpracováno z plánu): výplň do 100 %, přes plán plná a s ryskou. */
export function Metr({ podil }: { podil: number | null }) {
  if (podil === null || !Number.isFinite(podil)) return null;
  const p = Math.max(0, Math.min(1, podil));
  return (
    <span className={`metr${podil > 1 ? ' pres' : ''}`} aria-hidden="true">
      <span className="metr-vypln" style={{ width: `${(p * 100).toFixed(1)}%` }} />
    </span>
  );
}
