// ZÁLOŽKA DODÁNÍ (Přehled vedení úkol 14a, Albert 17. 11. 2026; spec §4.10 a §7.2, kontrakt §5.10, Pavel „Dodání a péče“). Fáze dodání
// k datu (web ve výrobě až hotovo: počet, stáří ve fázi), graf pásem stáří, blokace (eskalace, pozastaveno, příznaky, otevřené otázky
// automatizace), práce automatizace (hotové joby build a change, doba od založení po dokončení včetně fronty), připojené domény
// a obnovy hostingu. Neznámé nikdy jako 0.

import { getApi } from '../../api';
import Pasma from '../../components/grafy/Pasma';
import { NacitanyObsah, PrehledCastecne, PrehledPrazdne } from '../../components/prehled/Stavy';
import { Blok, CisloTlacitko, TabulkaObal } from '../../components/prehled/Tabulka';
import { formatDny, formatHodiny, formatPocet } from '../../prehled';
import Karty from './Karty';
import { useOtevriRadky, usePrehledData } from './kontext';
import ObnovyHostingu from './ObnovyHostingu';

const PRACE: Record<'build' | 'change', string> = { build: 'Nový web (build)', change: 'Úprava webu (change)' };

export default function ZalozkaDodani() {
  const otevri = useOtevriRadky();
  const stav = usePrehledData((t, f) => getApi().prehledDodani(t, f));
  return (
    <section className="prehled-zalozka-obsah" aria-labelledby="prehled-dodani-nadpis" aria-busy={stav.nacita}>
      <h2 className="prehled-sekce-nadpis" id="prehled-dodani-nadpis">
        Dodání
      </h2>
      <NacitanyObsah stav={stav} karet={1}>
        {(o) => {
          const d = o.data;
          const b = d.blokace;
          const sPasmy = d.faze.filter((f) => f.n > 0 || f.starnuti.nezname_n > 0);
          return (
            <>
              <PrehledCastecne varovani={o.meta.varovani} metriky={[d.domeny]} />
              <Karty metriky={[d.domeny]} obalka={o} />
              <Blok nadpis="Fáze dodání" blok="faze-dodani" popis="Klienti po zájmu až po hotový web, k datu, a jak dlouho jsou ve fázi.">
                {d.faze.length === 0 ? (
                  <PrehledPrazdne nadpis="Stav dodání k tomuto okamžiku není známý." text="Historie změn stavů začíná později; zrušte „Stav k datu“." />
                ) : (
                  <TabulkaObal popisek="Fáze dodání">
                    <table className="prehled-tabulka" data-tabulka="dodani">
                      <thead>
                        <tr>
                          <th scope="col">Fáze</th>
                          <th scope="col" className="cislo-sloupec">Klientů</th>
                          <th scope="col" className="cislo-sloupec">Medián ve fázi</th>
                          <th scope="col" className="cislo-sloupec">90. percentil</th>
                          <th scope="col" className="cislo-sloupec">Neznámý vstup</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.faze.map((f) => (
                          <tr key={f.status} data-radek={f.status}>
                            <th scope="row">{f.nazev}</th>
                            <td className="cislo-sloupec">
                              <CisloTlacitko text={formatPocet(f.n)} nazev={`Fáze ${f.nazev}`} onClick={f.proklik && f.n > 0 ? (el) => otevri(f.proklik!, `Fáze ${f.nazev}`, el) : null} />
                            </td>
                            <td className="cislo-sloupec">{f.starnuti.median_d === null ? '—' : formatDny(f.starnuti.median_d)}</td>
                            <td className="cislo-sloupec">{f.starnuti.p90_d === null ? '—' : formatDny(f.starnuti.p90_d)}</td>
                            <td className="cislo-sloupec">{formatPocet(f.starnuti.nezname_n)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TabulkaObal>
                )}
              </Blok>
              {sPasmy.length > 0 && (
                <Pasma
                  graf="dodani"
                  nadpis="Stáří ve fázi dodání"
                  popis="Dny od vstupu do současné fáze (pražské dny); klientům bez známého vstupu se čas nehádá."
                  radky={sPasmy.map((f) => ({ klic: f.status, nazev: f.nazev, pasma: f.starnuti.pasma, nezname: f.starnuti.nezname_n, median: f.starnuti.median_d, p90: f.starnuti.p90_d }))}
                  onProklik={otevri}
                />
              )}
              <Blok
                nadpis="Blokace"
                blok="blokace"
                popis={b.duvod ?? 'Klienti, u kterých dodání stojí.'}
                ovladani={b.proklik ? (
                  <button type="button" className="pill-btn sm" data-sfx="none" onClick={(e) => otevri(b.proklik!, 'Blokovaní klienti', e.currentTarget)}>
                    Řádky blokovaných klientů
                  </button>
                ) : null}
              >
                <dl className="prehled-udaje prehled-udaje-ctyri">
                  {([['Eskalace', b.eskalace], ['Pozastaveno', b.pozastaveno], ['S příznakem', b.priznaky], ['Otevřená otázka automatizace', b.otazky]] as const).map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd className="prehled-udaje-cislo">{formatPocet(v)}</dd>
                    </div>
                  ))}
                </dl>
              </Blok>
              <Blok nadpis="Práce automatizace" blok="prace" popis="Hotové joby v období a doba od založení po dokončení (i čekání ve frontě).">
                <TabulkaObal popisek="Práce automatizace">
                  <table className="prehled-tabulka" data-tabulka="prace">
                    <thead>
                      <tr>
                        <th scope="col">Druh práce</th>
                        <th scope="col" className="cislo-sloupec">Hotovo</th>
                        <th scope="col" className="cislo-sloupec">Medián</th>
                        <th scope="col" className="cislo-sloupec">90. percentil</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(['build', 'change'] as const).map((k) => (
                        <tr key={k} data-radek={k}>
                          <th scope="row">{PRACE[k]}</th>
                          <td className="cislo-sloupec">{formatPocet(d.prace[k].pocet)}</td>
                          <td className="cislo-sloupec">{d.prace[k].median_h === null ? '—' : formatHodiny(d.prace[k].median_h)}</td>
                          <td className="cislo-sloupec">{d.prace[k].p90_h === null ? '—' : formatHodiny(d.prace[k].p90_h)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TabulkaObal>
              </Blok>
              <Blok nadpis="Obnovy hostingu" blok="obnovy" popis="Poslední platba klienta + 1 rok, splatné do 60 dní nebo po splatnosti.">
                <ObnovyHostingu obnovy={d.obnovy_hostingu} />
              </Blok>
            </>
          );
        }}
      </NacitanyObsah>
    </section>
  );
}
