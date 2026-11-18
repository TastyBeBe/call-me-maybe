// KARTY METRIK ZÁLOŽKY (Přehled vedení úkol 14a): mřížka KpiKarta (úkol 13) pro metriky jedné odpovědi, s „i“ (definice z katalogu,
// zdroje a verze odpovědi) a řádky přes kontext stránky. Pod nadpisem části (h3) karty s nadpisem h4 (uroven).

import type { Metrika, PrehledObalka } from '../../api/types';
import KpiKarta from '../../components/prehled/KpiKarta';
import { nazevMetriky } from '../../prehled';
import { definiceMetriky, jednotkaMetriky, usePrehled } from './kontext';

export default function Karty({ metriky, obalka, uroven = 3 }: { metriky: Metrika[]; obalka: PrehledObalka<unknown>; uroven?: 3 | 4 }) {
  const { definice, filtr, otevriProklik } = usePrehled();
  return (
    <div className="kpi-mrizka">
      {metriky.map((m) => (
        <KpiKarta
          key={m.klic}
          metrika={m}
          jednotka={jednotkaMetriky(definice, m)}
          definice={definiceMetriky(definice, m.klic)}
          zdroje={obalka.meta.zdroje}
          definiceVerze={obalka.definice_verze}
          mena={filtr.mena}
          uroven={uroven}
          onProklik={(x, tlacitko) => otevriProklik({ proklik: x.proklik!, nazev: nazevMetriky(x.klic, x.nazev) }, tlacitko)}
        />
      ))}
    </div>
  );
}
