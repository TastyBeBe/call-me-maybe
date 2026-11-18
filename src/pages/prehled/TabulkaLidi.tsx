// TABULKA POROVNÁNÍ LIDÍ (Přehled vedení úkol 14a, Albert 17. 11. 2026, D7: „compare or combine any two callers … easy to select how
// many people they want to see“; spec §7.2 „compare table of the selected people with the combined row, sortable, mini bars, worked
// hours vs plan“; kontrakt §5.5). Řádky z prehled_lide: lidé (nebo týmy na Vedení), pod nimi zvlášť „Nepřiřazeno“ (klienti bez
// připsaného člověka; nikdy se nesčítá do člověka) a v patičce kombinovaný řádek „Celkem“ ze serveru (soucet: součty a podíly
// přepočtené ze součtů). Záhlaví jsou tlačítka řazení (aria-sort), neznámé číslo „—“ s důvodem a vždy na konci řazení. Každé
// číslo s řádky je tlačítko na panel řádků (součet řádků = číslo). Mini pruh = podíl z největší hodnoty sloupce. Sloupec
// odpracovaných hodin ukazuje i plán z rozvrhu za CELÉ období (server počítá každý den období, i budoucí, bez svátků) a měřák
// „Splněno z plánu období“; nedostupný pracovní čas (filtr segmentu, oboru nebo kraje) je „—“ s důvodem serveru.

import { useState } from 'react';
import type { DataDefinice, MenaPrehledu, Metrika, MetrikaCloveka, PrehledObalka, PrehledProklik, RadekLide } from '../../api/types';
import { CisloTlacitko, Metr, MiniPruh } from '../../components/prehled/Tabulka';
import { ArrowDownIcon } from '../../icons';
import { formatHodiny, formatPocet, formatPodil, hodnotaRazeni, nazevMetriky, presneCastky, seradRadkyLidi, textMetriky, type RazeniTabulky } from '../../prehled';
import { definiceMetriky, jednotkaMetriky } from './kontext';

export interface RadekTabulkyLidi {
  klic: string;
  nazev: string;
  /** druhý řádek u jména (tým, „klienti bez připsaného člověka“, počet lidí týmu) */
  popis?: string | null;
  druh: 'osoba' | 'tym' | 'neprirazeno';
  radek: RadekLide;
}

/** Šipka řazení u záhlaví (ikona appky, nahoru = vzestupně); neřazený sloupec má jen místo, ať záhlaví neskáče. */
function Sipka({ razeni, klic }: { razeni: RazeniTabulky | null; klic: string }) {
  return (
    <span className={`razeni-sipka${razeni?.klic === klic ? ` ${razeni.smer}` : ''}`} aria-hidden="true">
      {razeni?.klic === klic ? <ArrowDownIcon size={12} /> : null}
    </span>
  );
}

export default function TabulkaLidi({
  tabulka = 'lide',
  popisek,
  prvniSloupec = 'Člověk',
  radky,
  soucet,
  sloupce,
  mena,
  definice,
  onProklik,
  vychoziRazeni = null,
}: {
  /** klíč do data-tabulka */
  tabulka?: string;
  /** název tabulky pro čtečky (oblast posunu) */
  popisek: string;
  prvniSloupec?: string;
  radky: RadekTabulkyLidi[];
  soucet: RadekLide | null;
  sloupce: MetrikaCloveka[];
  mena: MenaPrehledu | 'obe';
  definice: PrehledObalka<DataDefinice> | null;
  onProklik?: (p: PrehledProklik, nazev: string, odkud: HTMLElement | null) => void;
  vychoziRazeni?: RazeniTabulky | null;
}) {
  const [razeni, setRazeni] = useState<RazeniTabulky | null>(vychoziRazeni);
  const lide = radky.filter((r) => r.druh !== 'neprirazeno');
  const nikdo = radky.filter((r) => r.druh === 'neprirazeno');
  const serazene = razeni ? seradRadkyLidi(lide, razeni.klic, razeni.smer, mena) : lide;
  const vzor = soucet ?? radky[0]?.radek ?? null;
  const nazevSloupce = (k: MetrikaCloveka): string =>
    k === 'odpracovane_hodiny' ? 'Odpracováno z plánu za celé období' : nazevMetriky(k, definiceMetriky(definice, k)?.nazev ?? vzor?.metriky[k]?.nazev ?? k);
  const jednotka = (m: Metrika) => jednotkaMetriky(definice, m);
  const maxSloupce = Object.fromEntries(sloupce.map((k) => [k, Math.max(0, ...radky.map((r) => hodnotaRazeni(r.radek.metriky[k], mena) ?? 0))]));

  const klikZahlavi = (k: string) => {
    setRazeni((r) => (r && r.klic === k ? { klic: k, smer: r.smer === 'sestupne' ? 'vzestupne' : 'sestupne' } : { klic: k, smer: k === 'jmeno' ? 'vzestupne' : 'sestupne' }));
  };
  const ariaSort = (k: string) => (razeni?.klic === k ? (razeni.smer === 'vzestupne' ? 'ascending' : 'descending') : undefined);

  const bunka = (r: RadekLide, k: MetrikaCloveka, kdo: string, sPruhem: boolean) => {
    const m = r.metriky[k];
    const nazev = `${nazevSloupce(k)} – ${kdo}`;
    const otevri = m?.proklik && onProklik ? (el: HTMLElement) => onProklik(m.proklik!, nazev, el) : null;
    if (k === 'odpracovane_hodiny') {
      const plan = r.metriky.planovane_hodiny;
      const plneni = r.metriky.plneni_planu;
      const nazevHodin = `Odpracované hodiny – ${kdo}`;
      // pracovní čas nedostupný (třeba s filtrem segmentu, oboru nebo kraje, koordinátor 18. 11. 2026): „—“ a důvod serveru,
      // nikdy 0 ani „plán —“
      if (!m || m.kvalita === 'nedostupne' || m.hodnota === null) {
        return (
          <td key={k} data-sloupec={k} className="cislo-sloupec">
            <CisloTlacitko text="—" nazev={nazevHodin} title={m?.duvod ?? null} onClick={null} />
            {m?.duvod ? <span className="prehled-bunka-pozn">{m.duvod}</span> : null}
          </td>
        );
      }
      const odpracovano = formatHodiny(m.hodnota);
      const znamyPlan = !!plan && plan.kvalita !== 'nedostupne' && plan.hodnota !== null;
      // plán je za celé období (i dny, které teprve přijdou), proto „Splněno z plánu období“, ne skluz proti dnešku
      const bublina = [plneni && plneni.hodnota !== null ? `Splněno z plánu období: ${formatPodil(plneni.hodnota)}.` : null, m.duvod, plan?.duvod]
        .filter(Boolean).join(' ') || null;
      return (
        <td key={k} data-sloupec={k} className="cislo-sloupec">
          <CisloTlacitko text={znamyPlan ? `${odpracovano} z ${formatHodiny(plan!.hodnota!)}` : `${odpracovano} · plán —`} nazev={nazevHodin}
            title={bublina} onClick={m.proklik && onProklik ? (el) => onProklik(m.proklik!, nazevHodin, el) : null}>
            {znamyPlan && plneni && plneni.hodnota !== null ? <Metr podil={plneni.hodnota} /> : null}
          </CisloTlacitko>
          {!znamyPlan && plan?.duvod ? <span className="prehled-bunka-pozn">{plan.duvod}</span> : null}
        </td>
      );
    }
    const text = textMetriky(m, m ? jednotka(m) : 'pocet');
    const neznamy = !m || m.kvalita === 'nedostupne' || text === '—';
    // podíl s nulovým jmenovatelem: krátce „0 z 0“ (celá věta serveru v bublině), jinak důvod neznámého čísla viditelně
    const nulovy = !!m && m.kvalita !== 'nedostupne' && m.hodnota === null && m.jmenovatel === 0;
    const v = hodnotaRazeni(m, mena);
    return (
      <td key={k} data-sloupec={k} className="cislo-sloupec">
        <CisloTlacitko text={text} nazev={nazev} title={m ? presneCastky(m) ?? m.duvod : null} onClick={neznamy ? null : otevri}>
          {sPruhem && !neznamy ? <MiniPruh podil={maxSloupce[k] > 0 && v !== null ? v / maxSloupce[k] : null} /> : null}
        </CisloTlacitko>
        {neznamy && m ? <span className="prehled-bunka-pozn">{nulovy ? `${formatPocet(m.citatel)} z 0` : m.duvod}</span> : null}
      </td>
    );
  };

  const radekTabulky = (r: RadekTabulkyLidi) => (
    <tr key={r.klic} data-radek={r.klic} data-druh={r.druh} className={r.druh === 'neprirazeno' ? 'prehled-radek-neprirazeno' : undefined}>
      <th scope="row" className="tabulka-lidi-jmeno">
        <span className="tabulka-lidi-nazev">{r.nazev}</span>
        {r.radek.active === false && <span className="lide-znacka neaktivni">neaktivní</span>}
        {r.popis ? <span className="prehled-bunka-pozn">{r.popis}</span> : null}
      </th>
      {sloupce.map((k) => bunka(r.radek, k, r.nazev, true))}
    </tr>
  );

  return (
    <table className="prehled-tabulka tabulka-lidi" data-tabulka={tabulka} aria-label={popisek}>
      <thead>
        <tr>
          <th scope="col" aria-sort={ariaSort('jmeno')}>
            <button type="button" className="razeni" data-sfx="none" onClick={() => klikZahlavi('jmeno')}>
              {prvniSloupec}
              <Sipka razeni={razeni} klic="jmeno" />
            </button>
          </th>
          {sloupce.map((k) => (
            <th key={k} scope="col" className="cislo-sloupec" data-sloupec={k} aria-sort={ariaSort(k)}>
              <button type="button" className="razeni" data-sfx="none" onClick={() => klikZahlavi(k)}>
                {nazevSloupce(k)}
                <Sipka razeni={razeni} klic={k} />
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {serazene.map(radekTabulky)}
        {nikdo.map(radekTabulky)}
      </tbody>
      {soucet && (
        <tfoot>
          <tr className="prehled-radek-soucet" data-radek="soucet">
            <th scope="row" className="tabulka-lidi-jmeno">
              <span className="tabulka-lidi-nazev">{soucet.display_name}</span>
              <span className="prehled-bunka-pozn">součty, podíly ze součtů</span>
            </th>
            {sloupce.map((k) => bunka(soucet, k, soucet.display_name, false))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}
