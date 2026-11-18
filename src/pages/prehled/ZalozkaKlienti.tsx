// ZÁLOŽKA KLIENTI A SEKTORY (Přehled vedení úkol 14a, Albert 17. 11. 2026; spec §4.7 a §7.2, kontrakt §5.7, Pavel §8.4). Graf prodejů
// podle segmentu, tabulky podle segmentu, specializace oboru a kraje (počet kontaktů = tlačítko na jejich řádky), původní web firem
// oborů A–F, koncentrace prodejů (karty) a šablony návrhů (pozorování, ne důkaz). Základ filtru mění populaci tabulek (R31): přirozený
// = všechny kontakty a milníky v období, jinak kohorta klientů s událostí v období a jejich milníky k datu.

import { getApi } from '../../api';
import Sloupce from '../../components/grafy/Sloupce';
import { NacitanyObsah, PrehledCastecne, PrehledPrazdne } from '../../components/prehled/Stavy';
import { Blok, CisloTlacitko, TabulkaObal } from '../../components/prehled/Tabulka';
import { formatPocet, formatPodil } from '../../prehled';
import { ZAKLAD_POPISKY } from '../../prehledFiltr';
import Karty from './Karty';
import { useOtevriRadky, usePrehled, usePrehledData } from './kontext';
import TabulkaDimenze from './TabulkaDimenze';

export default function ZalozkaKlienti() {
  const otevri = useOtevriRadky();
  const { filtr } = usePrehled();
  const stav = usePrehledData((t, f) => getApi().prehledKlienti(t, f));
  return (
    <section className="prehled-zalozka-obsah" aria-labelledby="prehled-klienti-nadpis" aria-busy={stav.nacita}>
      <h2 className="prehled-sekce-nadpis" id="prehled-klienti-nadpis">
        Klienti a sektory
      </h2>
      <NacitanyObsah stav={stav} karet={2}>
        {(o) => {
          const d = o.data;
          const metriky = [d.koncentrace.top1, d.koncentrace.top5];
          const kohortove = d.zaklad !== 'prirozeny';
          return (
            <>
              <PrehledCastecne varovani={o.meta.varovani} metriky={metriky} />
              <p className="prehled-cil muted">
                {kohortove
                  ? `Tabulky ukazují kohortu „${ZAKLAD_POPISKY[d.zaklad]}“: kontakty jsou ti s touto událostí v období, ostatní sloupce jejich milníky k datu.`
                  : 'Kontakty = všichni v řádku; ostatní sloupce počítají své události v období.'}
              </p>
              <Karty metriky={metriky} obalka={o} />
              {d.podle_segmentu.length > 0 && (
                <Sloupce
                  graf="segmenty"
                  nadpis="Prodáno podle segmentu"
                  popis={kohortove ? 'Prodaní klienti kohorty k datu.' : 'Prodeje s datem prodeje v období.'}
                  nazevPolozky="Segment"
                  nazevHodnoty="Prodáno"
                  polozky={d.podle_segmentu.map((r) => ({ klic: r.klic, nazev: r.nazev, hodnota: r.prodano, text: formatPocet(r.prodano), pozn: `${formatPocet(r.kontakty)} kontaktů` }))}
                  onProklik={otevri}
                />
              )}
              <Blok nadpis="Podle segmentu" blok="segmenty">
                {d.podle_segmentu.length === 0
                  ? <PrehledPrazdne nadpis="V tomhle výběru nejsou žádné kontakty." text="Zkuste jiný segment nebo základ." />
                  : <TabulkaDimenze tabulka="segmenty" popisek="Klienti podle segmentu" prvni="Segment" radky={d.podle_segmentu} />}
              </Blok>
              <Blok nadpis="Podle specializace oboru" blok="obory">
                {d.podle_oboru.length === 0
                  ? <PrehledPrazdne nadpis="Žádná specializace." text="Specializace mají jen firmy oborů; v tomhle výběru žádné nejsou." />
                  : <TabulkaDimenze tabulka="obory" popisek="Klienti podle specializace" prvni="Specializace" radky={d.podle_oboru} />}
              </Blok>
              <Blok nadpis="Podle kraje" blok="kraje" popis={filtr.kraj.length > 0 || d.podle_kraje.some((k) => k.klic === 'neznamy') ? 'Kraj známe jen u firem oborů; chaty a architekti jsou v „Neznámý kraj“.' : null}>
                {d.podle_kraje.length === 0
                  ? <PrehledPrazdne nadpis="Žádný kraj." text="V tomhle výběru nejsou žádné kontakty." />
                  : <TabulkaDimenze tabulka="kraje" popisek="Klienti podle kraje" prvni="Kraj" radky={d.podle_kraje} />}
              </Blok>
              <Blok nadpis="Původní web firem oborů (A–F)" blok="hodnoceni" popis="Hodnocení jejich dosavadního webu a co se s nimi dělo; jen firmy oborů.">
                <TabulkaObal popisek="Původní web A–F">
                  <table className="prehled-tabulka" data-tabulka="hodnoceni">
                    <thead>
                      <tr>
                        <th scope="col">Hodnocení webu</th>
                        <th scope="col" className="cislo-sloupec">Kontaktů</th>
                        <th scope="col" className="cislo-sloupec">Osloveno</th>
                        <th scope="col" className="cislo-sloupec">Zájem</th>
                        <th scope="col" className="cislo-sloupec">Návrhy</th>
                        <th scope="col" className="cislo-sloupec">Prodáno</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.hodnoceni_webu.map((h) => {
                        const nazev = h.znamka === 'bez' ? 'Bez hodnocení' : `Web ${h.znamka}`;
                        return (
                          <tr key={h.znamka} data-radek={h.znamka}>
                            <th scope="row">{nazev}</th>
                            <td className="cislo-sloupec">
                              <CisloTlacitko text={formatPocet(h.kontakty)} nazev={`Kontakty – ${nazev}`} onClick={h.proklik && h.kontakty > 0 ? (el) => otevri(h.proklik!, `Kontakty – ${nazev}`, el) : null} />
                            </td>
                            <td className="cislo-sloupec">{formatPocet(h.osloveno)}</td>
                            <td className="cislo-sloupec">{formatPocet(h.zajem)}</td>
                            <td className="cislo-sloupec">{formatPocet(h.navrhy)}</td>
                            <td className="cislo-sloupec">{formatPocet(h.prodano)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TabulkaObal>
              </Blok>
              <Blok nadpis="Šablony návrhů" blok="sablony" popis={d.sablony.popis}>
                {d.sablony.radky.length === 0 ? (
                  <PrehledPrazdne nadpis="V období žádný návrh se zapsanou šablonou." text="Šablona se zapisuje u webů architektů a firem oborů." />
                ) : (
                  <TabulkaObal popisek="Šablony návrhů">
                    <table className="prehled-tabulka" data-tabulka="sablony">
                      <thead>
                        <tr>
                          <th scope="col">Šablona</th>
                          <th scope="col" className="cislo-sloupec">Návrhy</th>
                          <th scope="col" className="cislo-sloupec">Odpovědělo</th>
                          <th scope="col" className="cislo-sloupec">Prodáno</th>
                          <th scope="col" className="cislo-sloupec">Podíl prodejů</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.sablony.radky.map((s) => {
                          const nazev = `${s.segment} ${s.sablona}${s.varianta ? ` (${s.varianta})` : ''}`;
                          return (
                            <tr key={`${s.segment}-${s.sablona}-${s.varianta ?? ''}`} data-radek={`${s.segment}-${s.sablona}`}>
                              <th scope="row">{nazev}</th>
                              <td className="cislo-sloupec">
                                <CisloTlacitko text={formatPocet(s.navrhy)} nazev={`Návrhy – ${nazev}`} onClick={s.proklik && s.navrhy > 0 ? (el) => otevri(s.proklik!, `Návrhy – ${nazev}`, el) : null} />
                              </td>
                              <td className="cislo-sloupec">{formatPocet(s.odpovedelo)}</td>
                              <td className="cislo-sloupec">{formatPocet(s.prodano)}</td>
                              <td className="cislo-sloupec">{s.podil_prodeje === null ? '—' : formatPodil(s.podil_prodeje)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </TabulkaObal>
                )}
              </Blok>
            </>
          );
        }}
      </NacitanyObsah>
    </section>
  );
}
