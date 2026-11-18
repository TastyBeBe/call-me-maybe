// ZÁLOŽKA VEDENÍ (Přehled vedení úkol 13): osm karet prehled_souhrn (Pavel §8, kontrakt §5.2) v pořadí kontraktu, každá se svým
// přirozeným základem, „i“ a řádky. Úkol 14 sem přidá trend proti cíli, trychtýř, týmy a segmenty a akční seznam.

import { getApi, type DataSouhrn, type KartaKlic, type Metrika } from '../../api';
import KpiKarta from '../../components/prehled/KpiKarta';
import { PrehledCastecne, PrehledChyba, PrehledNacita, PrehledPrazdne } from '../../components/prehled/Stavy';
import { denText, formatCastka, nazevMetriky, souhrnPrazdny } from '../../prehled';
import { definiceMetriky, jednotkaMetriky, usePrehled, usePrehledData } from './kontext';

const PORADI: KartaKlic[] = ['hodnota_prodeju', 'inkaso', 'pocet_prodeju', 'plneni_cile', 'uspesnost', 'otevrene', 'odhad_mesic', 'k_zasahu'];

/**
 * Žádné číslo v období: dostupné karty (aspoň jedna) samé nuly nebo neznámé; karty „nedostupné“ se nepočítají, takže věta „nic
 * tu není“ nikdy nestojí nad kartami, které říkají „nedostupné“ (oprava po recenzi 18. 11. 2026, bod 2). Karty se ukážou i tak.
 */
function jePrazdne(d: DataSouhrn): boolean {
  return souhrnPrazdny(Object.fromEntries(PORADI.map((k) => [k, d.karty[k]])));
}

export default function ZalozkaVedeni() {
  const { definice, filtr, otevriProklik } = usePrehled();
  const { data, chyba, nacita, znovu } = usePrehledData((t, f) => getApi().prehledSouhrn(t, f));
  if (chyba) return <PrehledChyba text={chyba} onZnovu={znovu} />;
  if (!data) return <PrehledNacita />;
  const karty: Metrika[] = PORADI.map((k) => data.data.karty[k]);
  const cil = data.data.cil;
  return (
    <section className="prehled-zalozka-obsah" aria-labelledby="prehled-vedeni-nadpis" aria-busy={nacita}>
      <h2 className="prehled-sekce-nadpis" id="prehled-vedeni-nadpis">
        Vedení
      </h2>
      <PrehledCastecne varovani={data.meta.varovani} metriky={karty} />
      {jePrazdne(data.data) && (
        <PrehledPrazdne nadpis="V tomhle období zatím nic není." text="Žádný prodej, platba ani otevřený obchod. Zkuste delší období nebo jiný výběr lidí." />
      )}
      <div className={`kpi-mrizka${nacita ? ' prepocitava' : ''}`}>
        {karty.map((m) => (
          <KpiKarta
            key={m.klic}
            metrika={m}
            jednotka={jednotkaMetriky(definice, m)}
            definice={definiceMetriky(definice, m.klic)}
            zdroje={data.meta.zdroje}
            definiceVerze={data.definice_verze}
            mena={filtr.mena}
            onProklik={(x, tlacitko) => otevriProklik({ proklik: x.proklik!, nazev: nazevMetriky(x.klic, x.nazev) }, tlacitko)}
          />
        ))}
      </div>
      {cil && (
        <p className="prehled-cil muted">
          Plnění počítá cíl {cil.user_jmeno ? `člověka ${cil.user_jmeno}` : cil.tym_jmeno ? `${cil.tym_jmeno}` : 'celé firmy'} na {denText(cil.obdobi_od)} – {denText(cil.obdobi_do)}:{' '}
          {formatCastka(cil.hodnota, cil.mena)} (zadal {cil.zadal}).
        </p>
      )}
    </section>
  );
}
