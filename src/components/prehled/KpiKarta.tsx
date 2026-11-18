// KARTA METRIKY PŘEHLEDU (Přehled vedení úkol 13, Albert 17. 11. 2026; spec docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md
// §7.2: „Every KPI card: value, unit, coverage line, quality badge, ‚i‘ popover …, click → drilldown drawer“; kontrakt §2.6).
// Hodnota podle jednotky (peníze po měnách, CZK a EUR nikdy dohromady), řádek pokrytí, odznak kvality vždy se slovem i ikonou
// (nikdy jen barva), důvod viditelně u čísla, když není úplné. Neznámé číslo je pomlčka, nikdy „0“ (R35). Kartu s prokliku
// otevře tlačítko přes celou kartu (Enter i klik); „i“ je samostatné tlačítko nad ním. Úkol 14 karty skládá do záložek.
// Oprava po recenzi 18. 11. 2026: přesná částka (haléře) v bublině u zaokrouhleného čísla (panel řádků ukazuje součet stejně
// zaokrouhlený); nadpis karty h3, pod nadpisem skupiny h4 (uroven).

import { useId } from 'react';
import type { JednotkaMetriky, MenaPrehledu, Metrika, MetrikaDefinice, PrehledMeta } from '../../api/types';
import { ArrowRightIcon, CheckIcon, NedostupneIcon, PulkruhIcon } from '../../icons';
import { formatMetriky, KVALITA_NAZVY, nazevMetriky, pokrytiText, presneCastky } from '../../prehled';
import DefinicePopover from './DefinicePopover';

export default function KpiKarta({
  metrika,
  jednotka,
  definice,
  zdroje,
  definiceVerze,
  mena = 'CZK',
  onProklik,
  uroven = 3,
  className = '',
}: {
  metrika: Metrika;
  /** jednotka z katalogu (§3.11, prehled_definice): metrika ji v sobě nemá (R10) */
  jednotka: JednotkaMetriky;
  definice?: MetrikaDefinice | null;
  /** meta.zdroje odpovědi (čerstvost v „i“) */
  zdroje?: PrehledMeta['zdroje'];
  definiceVerze?: string | null;
  /** měna filtru pro podíly z peněz (plnění cíle) */
  mena?: MenaPrehledu | 'obe';
  /** otevře řádky prokliku (jen když metrika proklik má) */
  onProklik?: (m: Metrika, tlacitko: HTMLButtonElement) => void;
  /** úroveň nadpisu karty: 3 na záložce, 4 pod nadpisem skupiny (h3) */
  uroven?: 3 | 4 | 5;
  className?: string;
}) {
  const Nadpis = `h${uroven}` as 'h3' | 'h4' | 'h5';
  const idNazvu = useId();
  const nazev = nazevMetriky(metrika.klic, metrika.nazev);
  const f = formatMetriky(metrika, jednotka);
  const pokryti = pokrytiText(metrika, jednotka, mena === 'obe' ? null : mena);
  const k = metrika.kvalita;
  const proklik = !!metrika.proklik && !!onProklik;
  const Ikona = k === 'dostupne' ? CheckIcon : k === 'castecne' ? PulkruhIcon : NedostupneIcon;
  const presne = f.prazdna ? null : presneCastky(metrika);
  return (
    <article className={`kpi-karta kvalita-${k}${proklik ? ' s-proklikem' : ''} ${className}`.trim()} data-klic={metrika.klic} aria-labelledby={idNazvu}>
      <div className="kpi-hlava">
        <Nadpis className="kpi-nazev" id={idNazvu}>
          {nazev}
        </Nadpis>
        <DefinicePopover metrika={metrika} definice={definice} zdroje={zdroje} definiceVerze={definiceVerze} uroven={(uroven + 1) as 4 | 5 | 6} />
      </div>
      <p className={`kpi-hodnota${f.prazdna ? ' prazdna' : ''}`} title={presne ? `Přesně ${presne}` : undefined}>
        <span className="kpi-hlavni">{f.hlavni}</span>
        {f.dalsi.map((d) => (
          <span className="kpi-dalsi" key={d}>
            {d}
          </span>
        ))}
      </p>
      {pokryti && <p className="kpi-pokryti">{pokryti}</p>}
      <p className="kpi-pata">
        <span className={`kpi-kvalita ${k}`}>
          <Ikona size={14} /> {KVALITA_NAZVY[k]}
        </span>
      </p>
      {metrika.duvod && <p className="kpi-duvod">{metrika.duvod}</p>}
      {proklik && (
        <button
          type="button"
          className="kpi-proklik"
          aria-label={`Zobrazit řádky: ${nazev}`}
          onClick={(e) => onProklik!(metrika, e.currentTarget)}
        >
          <span className="kpi-proklik-text">
            Řádky <ArrowRightIcon size={14} />
          </span>
        </button>
      )}
    </article>
  );
}
