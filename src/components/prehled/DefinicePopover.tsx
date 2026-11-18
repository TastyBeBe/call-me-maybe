// „i“ U METRIKY PŘEHLEDU (Přehled vedení úkol 13, Albert 17. 11. 2026; spec docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md
// §7.2: „‚i‘ popover (definition, basis, source, freshness, version)“). Tlačítko u názvu karty otevře okénko s definicí
// z katalogu (prehled_definice; u „Spojeno“ vlastní definice appky, src/prehled.ts), přirozeným základem čísla, zdroji s tím,
// k kdy jsou data (meta.zdroje odpovědi), pravidly kvality a verzí definice i katalogu. Klávesnice: Enter nebo mezerník otevře,
// fokus jde do okénka, Escape nebo „Zavřít“ zavře a vrátí fokus na tlačítko; klik mimo zavře bez přesunu fokusu.

import { useEffect, useId, useRef, useState } from 'react';
import type { Metrika, MetrikaDefinice, PrehledMeta } from '../../api/types';
import { InfoIcon } from '../../icons';
import { prahaDen } from '../../praha';
import { casText, definiceMetriky, denText, nazevMetriky, ZAKLAD_NAZVY, ZDROJ_NAZVY } from '../../prehled';

export default function DefinicePopover({
  metrika,
  definice,
  zdroje = [],
  definiceVerze,
  vychoziOtevreno = false,
}: {
  metrika: Pick<Metrika, 'klic' | 'nazev' | 'verze' | 'zaklad'>;
  /** řádek katalogu (prehled_definice); bez něj jen název, základ a verze */
  definice?: MetrikaDefinice | null;
  /** meta.zdroje odpovědi, ze které karta je (čerstvost zdrojů) */
  zdroje?: PrehledMeta['zdroje'];
  /** definice_verze obálky („2026-11-17.1“) */
  definiceVerze?: string | null;
  /** jen test (vykreslení na serveru): okénko otevřené hned */
  vychoziOtevreno?: boolean;
}) {
  const [otevreno, setOtevreno] = useState(vychoziOtevreno);
  const obal = useRef<HTMLDivElement>(null);
  const tlacitko = useRef<HTMLButtonElement>(null);
  const okno = useRef<HTMLDivElement>(null);
  const vratit = useRef(false);
  const id = useId();
  const idNadpisu = useId();
  const nazev = nazevMetriky(metrika.klic, metrika.nazev);

  const zavri = (vratitFokus: boolean) => {
    vratit.current = vratitFokus;
    setOtevreno(false);
  };

  useEffect(() => {
    if (!otevreno) {
      if (vratit.current) tlacitko.current?.focus();
      vratit.current = false;
      return;
    }
    okno.current?.focus();
    const klavesa = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      zavri(true);
    };
    const mimo = (e: MouseEvent | TouchEvent) => {
      if (obal.current && !obal.current.contains(e.target as Node)) zavri(false);
    };
    document.addEventListener('keydown', klavesa, true);
    document.addEventListener('mousedown', mimo);
    document.addEventListener('touchstart', mimo);
    return () => {
      document.removeEventListener('keydown', klavesa, true);
      document.removeEventListener('mousedown', mimo);
      document.removeEventListener('touchstart', mimo);
    };
  }, [otevreno]);

  const klice = (definice?.zdroje ?? '').split(/[,\s]+/).map((z) => z.trim()).filter(Boolean);
  const zdrojeText = klice.map((z) => {
    const meta = zdroje.find((x) => x.zdroj === z);
    const jmeno = ZDROJ_NAZVY[z] ?? z;
    return { z, jmeno, kdy: meta?.aktualni_k ? casText(meta.aktualni_k) : null, od: meta?.od ?? null };
  });

  return (
    <div className="definice" ref={obal}>
      <button
        ref={tlacitko}
        type="button"
        className="definice-btn"
        aria-label={`Co znamená ${nazev}`}
        aria-expanded={otevreno}
        aria-controls={otevreno ? id : undefined}
        data-sfx="none"
        onClick={() => (otevreno ? zavri(true) : setOtevreno(true))}
      >
        <InfoIcon size={17} />
      </button>
      {otevreno && (
        <div className="definice-okno" id={id} role="dialog" aria-modal="false" aria-labelledby={idNadpisu} ref={okno} tabIndex={-1}>
          <h4 className="definice-nadpis" id={idNadpisu}>
            {nazev}
          </h4>
          <p className="definice-text">{definiceMetriky(metrika.klic, definice?.definice ?? 'Definice z katalogu se ještě načítá.')}</p>
          <dl className="definice-udaje">
            <dt>Základ</dt>
            <dd>{ZAKLAD_NAZVY[metrika.zaklad] ?? metrika.zaklad}</dd>
            {zdrojeText.length > 0 && (
              <>
                <dt>Zdroje</dt>
                <dd>
                  <ul className="definice-zdroje">
                    {zdrojeText.map((z) => (
                      <li key={z.z}>
                        {z.jmeno}
                        {z.kdy ? <span className="muted"> · data k {z.kdy}</span> : null}
                        {z.od ? <span className="muted"> · od {denText(prahaDen(z.od))}</span> : null}
                      </li>
                    ))}
                  </ul>
                </dd>
              </>
            )}
            {definice?.kvalita_pravidla && (
              <>
                <dt>Kdy je číslo neúplné</dt>
                <dd>{definice.kvalita_pravidla}</dd>
              </>
            )}
            <dt>Verze</dt>
            <dd>
              Verze {metrika.verze}
              {definice?.platne_od ? `, platí od ${denText(definice.platne_od)}` : ''}
              {definiceVerze ? ` · katalog ${definiceVerze}` : ''}
            </dd>
          </dl>
          <button type="button" className="pill-btn sm definice-zavrit" onClick={() => zavri(true)}>
            Zavřít
          </button>
        </div>
      )}
    </div>
  );
}
