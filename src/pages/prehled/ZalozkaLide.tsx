// ZÁLOŽKA LIDÉ A VOLÁNÍ (Přehled vedení úkol 14a, Albert 17. 11. 2026, D7: „compare or combine any two callers“; spec §7.2 „compare
// table of the selected people with the combined row, sortable, mini bars, worked hours vs plan“; kontrakt §5.5). Výběr lidí je
// výběr v řadě filtrů (lide=… / tym=… v adrese, odkaz „Porovnat v Přehledu“ ze Statistik). Nahoře karty kombinovaného řádku
// (součet vybraných lidí ze serveru), pod nimi tabulka porovnání ve třech pohledech (Volání, Obchod, Čas; přepínač mění sloupce):
// řádek za člověka, „Nepřiřazeno“ zvlášť a popsané, „Celkem“ v patičce, řazení podle každého sloupce, mini pruhy, odpracováno
// z plánu s měřákem. Pod tím trend hovorů výběru (proti osobnímu nebo týmovému cíli, když je). Serverové dovolano je „Spojeno“.
// Plán z rozvrhu je za celé období (server počítá každý den období, i budoucí, bez svátků): popisky „Plán za celé období“
// a „Splněno z plánu období“ a v běžícím období věta, že nízké plnění není skluz (koordinátor 18. 11. 2026). S filtrem
// segmentu, oboru nebo kraje vrací server pracovní čas nedostupný: karty i tabulka ukážou „—“ s jeho důvodem, nikdy 0.

import { useState } from 'react';
import { getApi, type MetrikaCloveka } from '../../api';
import { NacitanyObsah, PrehledCastecne, PrehledPrazdne } from '../../components/prehled/Stavy';
import { Blok, TabulkaObal } from '../../components/prehled/Tabulka';
import { prahaDen } from '../../praha';
import { ATRIBUCE_POPISKY } from '../../prehledFiltr';
import Karty from './Karty';
import { useOtevriRadky, usePrehled, usePrehledData } from './kontext';
import TabulkaLidi, { type RadekTabulkyLidi } from './TabulkaLidi';
import Trend from './Trend';

/**
 * Karty součtu vybraných lidí (kombinovaný řádek). Plán vedle odpracovaných hodin: „Plán za celé období“ a „Splněno z plánu
 * období“ (NAZVY_APPKY; server počítá plán za každý den období, i budoucí, bez svátků; koordinátor 18. 11. 2026).
 */
const KARTY_SOUCTU: MetrikaCloveka[] = ['hovory', 'dovolano', 'mira_dovolani', 'zajem', 'konverze', 'navrhy', 'pocet_prodeju', 'hodnota_prodeju', 'odpracovane_hodiny', 'planovane_hodiny', 'plneni_planu'];
/** Pohledy tabulky porovnání: sloupce každého z nich. */
const POHLEDY: { klic: 'volani' | 'obchod' | 'cas'; nazev: string; sloupce: MetrikaCloveka[] }[] = [
  { klic: 'volani', nazev: 'Volání', sloupce: ['hovory', 'unikatni_klienti', 'dovolano', 'mira_dovolani', 'zajem', 'odmitnuto', 'nerelevantni', 'preplanovano', 'konverze'] },
  { klic: 'obchod', nazev: 'Obchod', sloupce: ['navrhy', 'pocet_prodeju', 'hodnota_prodeju', 'provize_narok', 'provize_vyplaceno', 'provize_zbyva'] },
  { klic: 'cas', nazev: 'Čas', sloupce: ['odpracovane_hodiny', 'vysledku_za_hodinu', 'sla_prvni_kontakt_median', 'sla_prvni_kontakt_p90', 'naplanovane_hotove', 'naplanovane_po_terminu'] },
];

export default function ZalozkaLide() {
  const { filtr, definice } = usePrehled();
  const otevri = useOtevriRadky();
  const [pohled, setPohled] = useState<(typeof POHLEDY)[number]['klic']>('volani');
  const stav = usePrehledData((t, f) => getApi().prehledLide(t, f));
  const sloupce = POHLEDY.find((p) => p.klic === pohled)!.sloupce;
  return (
    <section className="prehled-zalozka-obsah" aria-labelledby="prehled-lide-nadpis" aria-busy={stav.nacita}>
      <h2 className="prehled-sekce-nadpis" id="prehled-lide-nadpis">
        Lidé a volání
      </h2>
      <NacitanyObsah stav={stav} karet={6}>
        {(o) => {
          const d = o.data;
          const radky: RadekTabulkyLidi[] = d.radky.map((r) => ({
            klic: r.druh === 'osoba' ? `u${r.user_id}` : r.druh,
            nazev: r.druh === 'neprirazeno' ? 'Nepřiřazeno' : r.display_name,
            popis: r.druh === 'neprirazeno' ? 'klienti bez připsaného člověka' : r.tym_nazev,
            druh: r.druh === 'neprirazeno' ? 'neprirazeno' : 'osoba',
            radek: r,
          }));
          const metrikySouctu = KARTY_SOUCTU.map((k) => d.soucet.metriky[k]).filter(Boolean);
          const lidi = radky.filter((r) => r.druh === 'osoba').length;
          // období ještě běží a plán je známý: plán je za celé období, takže nízké plnění v půlce měsíce není skluz
          const planZnamy = !!d.soucet.metriky.planovane_hodiny && d.soucet.metriky.planovane_hodiny.kvalita !== 'nedostupne';
          const obdobiBezi = filtr.do > (filtr.k ?? prahaDen(Date.now()));
          return (
            <>
              <PrehledCastecne varovani={o.meta.varovani} metriky={metrikySouctu} />
              <div className="prehled-skupina">
                <h3 className="prehled-skupina-nadpis">Součet vybraných lidí ({lidi})</h3>
                <Karty metriky={metrikySouctu} obalka={o} uroven={4} />
                {planZnamy && obdobiBezi && (
                  <p className="prehled-blok-popis prehled-plan-pozn">
                    Plán za celé období počítá každý den období od nastavení rozvrhu, i dny, které teprve přijdou (svátky neodečítá).
                    Období ještě běží, takže „Splněno z plánu období“ ukazuje postup k plánu celého období, ne skluz.
                  </p>
                )}
              </div>
              <Blok
                nadpis="Porovnání lidí"
                blok="porovnani"
                popis={`Prodeje a návrhy připsané podle volby „${ATRIBUCE_POPISKY[d.atribuce]}“; provize vždy podle posledního, kdo zapsal zájem. Klikněte na záhlaví pro řazení, na číslo pro jeho řádky.`}
                ovladani={(
                  <div className="segmented lide-pohled" role="group" aria-label="Sloupce tabulky">
                    {POHLEDY.map((p) => (
                      <button key={p.klic} type="button" className={pohled === p.klic ? 'active' : ''} aria-pressed={pohled === p.klic} data-sfx="none" onClick={() => setPohled(p.klic)}>
                        {p.nazev}
                      </button>
                    ))}
                  </div>
                )}
              >
                {radky.length === 0 ? (
                  <PrehledPrazdne nadpis="Ve výběru nikdo není." text="Vyberte lidi v řadě filtrů nahoře." />
                ) : (
                  <TabulkaObal popisek="Porovnání lidí">
                    <TabulkaLidi tabulka="lide" popisek="Porovnání lidí" radky={radky} soucet={d.soucet} sloupce={sloupce} mena={filtr.mena} definice={definice} onProklik={otevri} />
                  </TabulkaObal>
                )}
              </Blok>
            </>
          );
        }}
      </NacitanyObsah>
      <Trend vychozi="hovory" />
    </section>
  );
}
