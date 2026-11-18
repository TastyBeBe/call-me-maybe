// OSTATNÍ ZÁLOŽKY PŘEHLEDU, ZATÍM JEN METRIKY (Přehled vedení úkol 13). Každá záložka načte svou funkci 073 (Lidé a volání =
// prehled_lide, Pipeline, Klienti a sektory, Komunikace a ztráty, Finance, Dodání, Prognóza a data) se stavy načítání, chyby,
// prázdna a částečných dat a ukáže metriky odpovědi jako karty po skupinách (s „i“ a řádky). Úkol 14 sem dá tabulky, grafy
// a porovnání lidí; tahle obecná podoba je jen kostra, ať každá záložka jede nad skutečnou odpovědí.

import type { Api, Metrika, PrehledFiltrVstup, PrehledObalka } from '../../api';
import { getApi } from '../../api';
import KpiKarta from '../../components/prehled/KpiKarta';
import { PrehledCastecne, PrehledChyba, PrehledNacita, PrehledPrazdne } from '../../components/prehled/Stavy';
import { nazevMetriky } from '../../prehled';
import { ZALOZKY } from '../../prehledFiltr';
import { definiceMetriky, jednotkaMetriky, usePrehled, usePrehledData } from './kontext';

type Nacteni = (api: Api, token: string, filtr: PrehledFiltrVstup) => Promise<PrehledObalka<unknown>>;
/** Funkce serveru každé záložky (kromě Vedení). */
const FUNKCE: Record<string, Nacteni> = {
  lide: (a, t, f) => a.prehledLide(t, f) as Promise<PrehledObalka<unknown>>,
  pipeline: (a, t, f) => a.prehledPipeline(t, f) as Promise<PrehledObalka<unknown>>,
  klienti: (a, t, f) => a.prehledKlienti(t, f) as Promise<PrehledObalka<unknown>>,
  komunikace: (a, t, f) => a.prehledKomunikace(t, f) as Promise<PrehledObalka<unknown>>,
  finance: (a, t, f) => a.prehledFinance(t, f) as Promise<PrehledObalka<unknown>>,
  dodani: (a, t, f) => a.prehledDodani(t, f) as Promise<PrehledObalka<unknown>>,
  prognoza: (a, t, f) => a.prehledPrognoza(t, f) as Promise<PrehledObalka<unknown>>,
};

/** Názvy skupin podle klíče odpovědi (první úroveň `data`). */
const SKUPINY: Record<string, string> = {
  soucet: 'Součet vybraných lidí',
  rychlost_navrhu: 'Rychlost návrhu',
  slevy: 'Nabídky za polovinu',
  koncentrace: 'Koncentrace prodejů',
  zpravy: 'Zprávy z Gmailu',
  duvody: 'Ztráty po návrhu',
  prodeje: 'Prodeje',
  prodeje_mimo_prodej: 'Prodeje',
  faktury: 'Faktury',
  platby: 'Platby',
  pohledavky: 'Pohledávky',
  provize: 'Provize',
  hosting: 'Hosting',
  naklady: 'Náklady',
  vysledek: 'Výsledek',
  domeny: 'Domény',
  potvrzene: 'Odhad do konce měsíce',
  scenare: 'Odhad do konce měsíce',
  otevrene: 'Pravděpodobnost podle fáze',
};

const jeMetrika = (o: unknown): o is Metrika => !!o && typeof o === 'object' && 'klic' in o && 'kvalita' in o && 'castky' in o && 'proklik' in o;
/** Metriky odpovědi po skupinách (první úroveň data), bez řádků lidí (ty ukáže úkol 14 v tabulce). */
function skupinyMetrik(data: unknown): { klic: string; nazev: string; metriky: Metrika[] }[] {
  const out = new Map<string, Metrika[]>();
  const projdi = (o: unknown, skupina: string, hloubka: number) => {
    if (!o || typeof o !== 'object' || hloubka > 4) return;
    if (jeMetrika(o)) {
      const v = out.get(skupina) ?? [];
      if (!v.some((m) => m.klic === o.klic)) v.push(o);
      out.set(skupina, v);
      return;
    }
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (k === 'radky' || k === 'body') continue;
      projdi(v, skupina, hloubka + 1);
    }
  };
  if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) if (k !== 'radky' && k !== 'body') projdi(v, k, 0);
  }
  const nazvy = new Map<string, { klic: string; nazev: string; metriky: Metrika[] }>();
  for (const [k, metriky] of out) {
    const nazev = SKUPINY[k] ?? 'Další čísla';
    const s = nazvy.get(nazev) ?? { klic: k, nazev, metriky: [] };
    s.metriky.push(...metriky.filter((m) => !s.metriky.some((x) => x.klic === m.klic)));
    nazvy.set(nazev, s);
  }
  return [...nazvy.values()];
}

export default function ZalozkaObecna({ klic }: { klic: string }) {
  const { definice, filtr, otevriProklik } = usePrehled();
  const fn = FUNKCE[klic];
  const { data, chyba, nacita, znovu } = usePrehledData((t, f) => fn(getApi(), t, f));
  const nazev = ZALOZKY.find((z) => z.klic === klic)?.nazev ?? klic;
  if (chyba) return <PrehledChyba text={chyba} onZnovu={znovu} />;
  if (!data) return <PrehledNacita karet={6} />;
  const skupiny = skupinyMetrik(data.data);
  const vse = skupiny.flatMap((s) => s.metriky);
  return (
    <section className="prehled-zalozka-obsah" aria-labelledby={`prehled-${klic}-nadpis`} aria-busy={nacita}>
      <h2 className="prehled-sekce-nadpis" id={`prehled-${klic}-nadpis`}>
        {nazev}
      </h2>
      <PrehledCastecne varovani={data.meta.varovani} metriky={vse} />
      {skupiny.length === 0 ? (
        <PrehledPrazdne nadpis="Tahle část zatím nemá žádná čísla." text="V tomhle období a výběru není nic k ukázání." />
      ) : (
        skupiny.map((s) => (
          <div className="prehled-skupina" key={s.nazev}>
            <h3 className="prehled-skupina-nadpis">{s.nazev}</h3>
            <div className={`kpi-mrizka${nacita ? ' prepocitava' : ''}`}>
              {s.metriky.map((m) => (
                <KpiKarta
                  key={m.klic}
                  metrika={m}
                  jednotka={jednotkaMetriky(definice, m)}
                  definice={definiceMetriky(definice, m.klic)}
                  zdroje={data.meta.zdroje}
                  definiceVerze={data.definice_verze}
                  mena={filtr.mena}
                  uroven={4}
                  onProklik={(x, tlacitko) => otevriProklik({ proklik: x.proklik!, nazev: nazevMetriky(x.klic, x.nazev) }, tlacitko)}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
