// ZÁLOŽKA VEDENÍ (Přehled vedení úkol 13 a 14a, Albert 17. 11. 2026; spec §7.2 „Vedení (8 KPI cards, trend vs target, funnel, teams
// and segments, action list)“, Pavel §8). Osm karet prehled_souhrn v pořadí kontraktu (úkol 13), pod nimi (úkol 14a): trend
// vybrané metriky kumulativně proti cíli (Trend), trychtýř milníků kohorty „první hovor v období“ s krokem „Spojen“, týmy (pro
// každý tým prehled_lide s jeho lidmi z výběru: součty ze serveru, žádné sčítání v appce; Nepřiřazeno zvlášť; Celkem = celý výběr),
// segmenty (prehled_klienti) a akční seznam (prehled_akce, nejbližších 8 případů a všechny v řádcích karty Případy k zásahu).

import { useMemo } from 'react';
import { getApi, type DataMoznosti, type DataSouhrn, type KartaKlic, type Metrika, type MetrikaCloveka, type PrehledObalka, type DataLide, type PripadAkce } from '../../api';
import Trychtyr from '../../components/grafy/Trychtyr';
import { NacitanyObsah, PrehledCastecne, PrehledChyba, PrehledNacita, PrehledPrazdne, varovaniBezOpakovani } from '../../components/prehled/Stavy';
import { Blok, CisloTlacitko, TabulkaObal } from '../../components/prehled/Tabulka';
import { casText, denText, formatCastka, formatPocet, pocetSlovy, souctyText, souhrnPrazdny } from '../../prehled';
import Karty from './Karty';
import { useOtevriRadky, usePrehled, usePrehledData, usePrehledNacteni } from './kontext';
import TabulkaDimenze from './TabulkaDimenze';
import TabulkaLidi, { type RadekTabulkyLidi } from './TabulkaLidi';
import Trend from './Trend';

const PORADI: KartaKlic[] = ['hodnota_prodeju', 'inkaso', 'pocet_prodeju', 'plneni_cile', 'uspesnost', 'otevrene', 'odhad_mesic', 'k_zasahu'];
const SLOUPCE_TYMU: MetrikaCloveka[] = ['hovory', 'dovolano', 'zajem', 'navrhy', 'pocet_prodeju', 'hodnota_prodeju', 'odpracovane_hodiny'];
const AKCI_NA_VEDENI = 8;

/**
 * Žádné číslo v období: dostupné karty (aspoň jedna) samé nuly nebo neznámé; karty „nedostupné“ se nepočítají, takže věta „nic
 * tu není“ nikdy nestojí nad kartami, které říkají „nedostupné“ (oprava po recenzi 18. 11. 2026, bod 2). Karty se ukážou i tak.
 */
function jePrazdne(d: DataSouhrn): boolean {
  return souhrnPrazdny(Object.fromEntries(PORADI.map((k) => [k, d.karty[k]])));
}

/**
 * Týmy výběru: každý člověk z výběru (i neaktivní, jako cíle týmu §2.10) patří do právě jednoho týmu podle `lide[].tym_id`
 * (oprava po recenzi, drobnost 4: seznamy členů se můžou překrývat, řádky týmů pak nikdy nedají víc než Celkem); lidé bez
 * týmu zvlášť; prázdné týmy vynechané.
 */
export function skupinyTymu(m: Pick<DataMoznosti, 'tymy' | 'lide'>, vybrani: readonly number[] | null | undefined): { klic: string; nazev: string; ids: number[] }[] {
  const ve = vybrani && vybrani.length > 0 ? new Set(vybrani) : null;
  const lide = m.lide.filter((l) => !ve || ve.has(l.id));
  const vzestupne = (a: number, b: number) => a - b;
  const out = m.tymy
    .map((t) => ({ klic: `tym-${t.id}`, nazev: t.nazev, ids: lide.filter((l) => l.tym_id === t.id).map((l) => l.id).sort(vzestupne) }))
    .filter((s) => s.ids.length > 0);
  const znameTymy = new Set(m.tymy.map((t) => t.id));
  const bez = lide.filter((l) => l.tym_id === null || !znameTymy.has(l.tym_id)).map((l) => l.id).sort(vzestupne);
  if (bez.length > 0) out.push({ klic: 'bez-tymu', nazev: 'Bez týmu', ids: bez });
  return out;
}

const stejnaId = (a: readonly number[], b: readonly number[] | null | undefined): boolean =>
  !!b && a.length === b.length && [...a].sort((x, y) => x - y).every((x, i) => x === [...b].sort((p, q) => p - q)[i]);

/**
 * Týmy na Vedení: jedno prehled_lide pro celý výběr a jedno pro každý tým (kontrakt §5.5, R19: součty a prokliky ze serveru).
 * Oprava po recenzi (drobnost 3): načítají se až po kartách (`aktivni`, ne ve stejné dávce volání) a tým, jehož lidé jsou přesně
 * celý výběr, druhé stejné volání nedělá (vezme řádek celku).
 */
function Tymy({ aktivni }: { aktivni: boolean }) {
  const { moznosti, serverFiltr, filtr, definice } = usePrehled();
  const otevri = useOtevriRadky();
  const skupiny = useMemo(() => skupinyTymu(moznosti.data, serverFiltr.lide), [moznosti.data, serverFiltr.lide]);
  const stav = usePrehledNacteni(
    async (t, f) => {
      // skupiny jdou s odpovědí: názvy týmů vždy patří k číslům, i když se mezitím seznam týmů načte znovu
      const sk = skupiny;
      const vyber = Array.isArray(f.lide) ? f.lide : null;
      const [cele, ...tymy] = await Promise.all([
        getApi().prehledLide(t, f),
        ...sk.map((s) => (stejnaId(s.ids, vyber) ? Promise.resolve(null) : getApi().prehledLide(t, { ...f, lide: s.ids }))),
      ]);
      return { cele, tymy: tymy.map((x) => x ?? cele), skupiny: sk };
    },
    (o: { cele: PrehledObalka<DataLide>; tymy: PrehledObalka<DataLide>[] }) => [o.cele.definice_verze, ...o.tymy.map((x) => x.definice_verze)],
    JSON.stringify(skupiny.map((s) => s.ids)),
    { aktivni }
  );
  return (
    <Blok nadpis="Týmy" blok="tymy" popis="Každý tým jeho lidmi z výběru; čísla jsou součty ze serveru (podíly ze součtů). Nepřiřazeno = klienti bez připsaného člověka.">
      <NacitanyObsah stav={stav} varovani={(o) => varovaniBezOpakovani(o.cele.meta.varovani, ...o.tymy.map((x) => x.meta.varovani))}>
        {(o) => {
          const radky: RadekTabulkyLidi[] = o.tymy.map((t, i) => ({
            klic: o.skupiny[i].klic, nazev: o.skupiny[i].nazev, popis: pocetSlovy(o.skupiny[i].ids.length, ['# člověk', '# lidé', '# lidí']), druh: 'tym',
            // tým = celý výběr: t je odpověď celku (žádné druhé stejné volání), jinak odpověď týmu
            radek: t.data.soucet,
          }));
          const nikdo = o.cele.data.radky.find((r) => r.druh === 'neprirazeno');
          if (nikdo) radky.push({ klic: 'neprirazeno', nazev: 'Nepřiřazeno', popis: 'klienti bez připsaného člověka', druh: 'neprirazeno', radek: nikdo });
          return (
            <TabulkaObal popisek="Týmy">
              <TabulkaLidi tabulka="tymy" popisek="Týmy" prvniSloupec="Tým" radky={radky} soucet={o.cele.data.soucet} sloupce={SLOUPCE_TYMU} mena={filtr.mena} definice={definice} onProklik={otevri} />
            </TabulkaObal>
          );
        }}
      </NacitanyObsah>
    </Blok>
  );
}

function TrychtyrVedeni() {
  const otevri = useOtevriRadky();
  const stav = usePrehledData((t, f) => getApi().prehledTrychtyr(t, f));
  return (
    <NacitanyObsah stav={stav} karet={1} varovani={(o) => o.meta.varovani}>
      {(o) => {
        const d = o.data;
        // rozbalení současných stavů kohorty patří do karty trychtýře (oprava po recenzi, drobnost 9)
        const stavy = d.stavy.polozky.length > 0 ? (
          <details className="prehled-rozbal">
            <summary>{d.stavy.popis}</summary>
            <ul className="prehled-stavy-kohorty">
              {d.stavy.polozky.map((s) => (
                <li key={s.status}>
                  <span>{s.nazev}</span>
                  <CisloTlacitko text={formatPocet(s.n)} nazev={`Kohorta ve stavu ${s.nazev}`} onClick={s.proklik ? (el) => otevri(s.proklik!, `Kohorta ve stavu ${s.nazev}`, el) : null} />
                </li>
              ))}
            </ul>
          </details>
        ) : null;
        return (
          <div className="prehled-graf-blok">
            <Trychtyr
              nadpis="Trychtýř prvního hovoru"
              popis={`${d.kohorta.popis} (${denText(d.kohorta.od)} – ${denText(d.kohorta.do)}): ${pocetSlovy(d.kohorta.n, ['# klient', '# klienti', '# klientů'])}. Krok počítá klienty s tím milníkem i se všemi dřívějšími; nic se nedopočítává.`}
              kroky={d.kroky.map((k) => ({ klic: k.klic, nazev: k.nazev, n: k.n, zPredchoziho: k.z_predchoziho, zKohorty: k.z_kohorty, otevrenych: k.otevrenych, bezPredchoziho: k.bez_predchoziho, duvod: k.duvod, proklik: k.proklik }))}
              onProklik={otevri}
              pata={stavy}
            />
          </div>
        );
      }}
    </NacitanyObsah>
  );
}

function Segmenty() {
  const stav = usePrehledData((t, f) => getApi().prehledKlienti(t, f));
  return (
    <Blok nadpis="Segmenty" blok="segmenty" popis="Kontakty segmentu a jejich milníky v období (podrobně v záložce Klienti a sektory).">
      <NacitanyObsah stav={stav} varovani={(o) => o.meta.varovani}>
        {(o) => (o.data.podle_segmentu.length === 0
          ? <PrehledPrazdne nadpis="V tomhle výběru nejsou žádné kontakty." text="Zkuste jiný segment nebo základ." />
          : <TabulkaDimenze tabulka="segmenty" popisek="Segmenty" prvni="Segment" radky={o.data.podle_segmentu} />)}
      </NacitanyObsah>
    </Blok>
  );
}

/**
 * Text tlačítka „Zobrazit … případů“ (karta Případy k zásahu). Neznámý počet „—“, nikdy 0 (úkol 14b, přeneseno z recenze 14a;
 * ⚠ NAHRAZUJE `karta.hodnota ?? 0`).
 */
export function textZobrazitPripady(n: number | null): string {
  return `Zobrazit ${n === 1 ? 'jeden případ' : pocetSlovy(n, ['# případ', 'všechny # případy', 'všech # případů'])}`;
}

/**
 * Tabulka akčního seznamu (nejbližší případy): termín jen dnem se ukáže bez „0:00“, s časem v Praze; samostatně kvůli testu
 * (úkol 14b, přeneseno z recenze 14a).
 */
export function TabulkaAkci({ pripady }: { pripady: PripadAkce[] }) {
  return (
    <TabulkaObal popisek="Akční seznam">
      <table className="prehled-tabulka" data-tabulka="akce">
        <thead>
          <tr>
            <th scope="col">Termín</th>
            <th scope="col">Klient</th>
            <th scope="col">Problém</th>
            <th scope="col">Další krok</th>
            <th scope="col">Vede</th>
            <th scope="col" className="cislo-sloupec">Hodnota</th>
          </tr>
        </thead>
        <tbody>
          {pripady.map((a) => (
            <tr key={a.kontakt_id} data-radek={a.kontakt_id}>
              <td>
                {/* termín jen dnem (bez času) se ukáže bez „0:00“ (oprava po recenzi, drobnost 11) */}
                {/^\d{4}-\d{2}-\d{2}$/.test(a.termin) ? denText(a.termin) : casText(a.termin)}
                {a.po_terminu && <span className="prehled-znacka po-terminu">po termínu</span>}
              </td>
              <th scope="row">
                {a.jmeno}
                <span className="prehled-bunka-pozn">{a.nazev_stavu}</span>
              </th>
              <td>
                {a.problem}
                {a.signaly.length > 1 && <span className="prehled-bunka-pozn">a další: {a.signaly.slice(1).map((s) => s.text).join('; ')}</span>}
              </td>
              <td>{a.dalsi_krok}</td>
              <td>
                {a.vlastnik?.display_name ?? 'nikdo'}
                {a.vlastnik?.tym_nazev ? <span className="prehled-bunka-pozn">{a.vlastnik.tym_nazev}</span> : null}
              </td>
              <td className="cislo-sloupec">{souctyText(a.hodnota) ?? (a.cena_stav === 'nezname' ? 'neznámá' : '—')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TabulkaObal>
  );
}

function Akce({ karta }: { karta: Metrika | null }) {
  const otevri = useOtevriRadky();
  const { filtr } = usePrehled();
  // s „K datu“ se akční seznam nevolá (kdo psal naposledy a mlčení nemají historii; oprava po recenzi, drobnost 12)
  const stav = usePrehledData((t, f) => getApi().prehledAkce(t, f), '', { aktivni: !filtr.k });
  return (
    <Blok
      nadpis="Akční seznam"
      blok="akce"
      popis="Jeden případ na klienta, nejdřív ten s nejbližším termínem: kdo ho vede, co se děje a co udělat."
      ovladani={karta?.proklik ? (
        <button type="button" className="pill-btn sm akce-vse" data-sfx="none" onClick={(e) => otevri(karta.proklik!, 'Případy k zásahu', e.currentTarget)}>
          {textZobrazitPripady(karta.hodnota)}
        </button>
      ) : null}
    >
      {filtr.k ? (
        <PrehledPrazdne nadpis="Akční seznam je jen pro dnešek." text="Kdo psal naposledy a mlčení se do historie nezapisují; zrušte „Stav k datu“." />
      ) : (
      <NacitanyObsah stav={stav} varovani={(o) => o.meta.varovani}>
        {(o) => {
          const p = o.data.pripady.slice(0, AKCI_NA_VEDENI);
          if (p.length === 0) return <PrehledPrazdne nadpis="Teď nic nečeká na zásah." text="Žádný klient nečeká na odpověď, žádná faktura ani nabídka nevisí." />;
          const signaly = o.data.souhrn.podle_signalu.filter((s) => s.n > 0);
          // klient může mít víc signálů: když je součet počtů vyšší než počet případů, řekne to věta pod nimi (jinak by nesouhlasily s kartou)
          const vicSignalu = signaly.reduce((a, s) => a + s.n, 0) > o.data.souhrn.pripadu;
          return (
            <>
              {signaly.length > 0 && (
                <ul className="prehled-stavy-kohorty" aria-label="Případy podle signálu (klient může mít víc signálů)">
                  {signaly.map((s) => (
                    <li key={s.kod}>
                      <span>{s.nazev}</span> <strong>{formatPocet(s.n)}</strong>
                    </li>
                  ))}
                </ul>
              )}
              {vicSignalu && (
                <p className="prehled-blok-popis akce-pozn">
                  Jeden klient může mít víc signálů najednou, proto je součet těchto počtů vyšší než počet případů ({formatPocet(o.data.souhrn.pripadu)}).
                </p>
              )}
              <TabulkaAkci pripady={p} />
            </>
          );
        }}
      </NacitanyObsah>
      )}
    </Blok>
  );
}

export default function ZalozkaVedeni() {
  const { filtr, klicFiltru } = usePrehled();
  const { data, chyba, nacita, znovu, pro } = usePrehledData((t, f) => getApi().prehledSouhrn(t, f));
  // týmy až po kartách pro tentýž filtr (ne ve stejné dávce volání; oprava po recenzi, drobnost 3)
  const kartyHotove = pro === klicFiltru;
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
      <div className={nacita ? 'prepocitava' : undefined}>
        <Karty metriky={karty} obalka={data} />
      </div>
      {cil && (
        <p className="prehled-cil muted">
          Plnění počítá cíl {cil.user_jmeno ? `člověka ${cil.user_jmeno}` : cil.tym_jmeno ? `${cil.tym_jmeno}` : 'celé firmy'} na {denText(cil.obdobi_od)} – {denText(cil.obdobi_do)}:{' '}
          {formatCastka(cil.hodnota, cil.mena)} (zadal {cil.zadal}).
        </p>
      )}
      <div className="prehled-dvojice">
        <Trend />
        <TrychtyrVedeni />
      </div>
      <Tymy aktivni={kartyHotove} />
      <Segmenty />
      <Akce karta={filtr.k ? null : data.data.karty.k_zasahu} />
    </section>
  );
}
