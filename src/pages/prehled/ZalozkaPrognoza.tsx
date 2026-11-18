// ZÁLOŽKA PROGNÓZA A DATA (Přehled vedení úkol 14a, Albert 17. 11. 2026, D12: „from our own history (stage → sold rates with N),
// labelled nevalidovaný odhad“; spec §4.11, §4.12 a §7.2, kontrakt §5.11 a §5.12, Pavel „Prognóza a kvalita dat“). Odhad do konce
// pražského měsíce k datu: potvrzené prodeje, scénáře základní a jen jisté (vždy štítek „nevalidovaný odhad“), otevření klienti po
// skupinách fází s mírou z historie (N, „málo historie“), vážená hodnota po měnách, přesnost odhadu ze snímků (dokud nejsou,
// „nedostupné“ s důvodem). Pod tím kvalita dat: ceny po stavech, návrhy bez e-mailu, nejasné vazby zpráv, platby bez faktury,
// pokrytí historie změn a časovače práce.

import { getApi } from '../../api';
import { NacitanyObsah, PrehledCastecne, PrehledPrazdne } from '../../components/prehled/Stavy';
import { Blok, CisloTlacitko, TabulkaObal } from '../../components/prehled/Tabulka';
import { mesicNazev } from '../../grafy';
import { casText, denText, formatPocet, formatPodil, pocetSlovy, souctyPresne, souctyText, textMetriky } from '../../prehled';
import Karty from './Karty';
import { useOtevriRadky, usePrehled, usePrehledData } from './kontext';

function Kvalita() {
  // kvalita dat na filtru nezávisí: jednou za návštěvu záložky a znovu s pětiminutovou obnovou čerstvosti, ne při každé změně
  // filtru (oprava po recenzi, drobnost 12)
  const { obnova } = usePrehled();
  const stav = usePrehledData((t) => getApi().prehledKvalita(t), String(obnova), { bezFiltru: true });
  return (
    <NacitanyObsah stav={stav} karet={3} varovani={(o) => o.meta.varovani}>
      {(o) => {
        const d = o.data;
        const metriky = [d.navrhy_bez_emailu, d.nejasne_vazby, d.platby_bez_faktury];
        return (
          <>
            <div className="prehled-skupina">
              <h3 className="prehled-skupina-nadpis">Kvalita dat (teď)</h3>
              <Karty metriky={metriky} obalka={o} uroven={4} />
            </div>
            <Blok nadpis="Ceny podle stavu" blok="ceny" popis="Cena webu po stavech mimo frontu volání: přesná, rozsah, nečitelná nebo chybí. Bez přesné ceny se klient do součtů peněz nepočítá.">
              <TabulkaObal popisek="Ceny podle stavu">
                <table className="prehled-tabulka" data-tabulka="ceny">
                  <thead>
                    <tr>
                      <th scope="col">Stav</th>
                      <th scope="col" className="cislo-sloupec">Klientů</th>
                      <th scope="col" className="cislo-sloupec">Přesná cena</th>
                      <th scope="col" className="cislo-sloupec">Rozsah</th>
                      <th scope="col" className="cislo-sloupec">Nečitelná</th>
                      <th scope="col" className="cislo-sloupec">Chybí</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.ceny.map((c) => (
                      <tr key={c.status} data-radek={c.status}>
                        <th scope="row">{c.nazev}</th>
                        <td className="cislo-sloupec">{formatPocet(c.celkem)}</td>
                        <td className="cislo-sloupec">{formatPocet(c.presne)}</td>
                        <td className="cislo-sloupec">{formatPocet(c.rozsah)}</td>
                        <td className="cislo-sloupec">{formatPocet(c.nezname)}</td>
                        <td className="cislo-sloupec">{formatPocet(c.chybi)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TabulkaObal>
            </Blok>
            <Blok nadpis="Historie a časovač" blok="pokryti">
              <dl className="prehled-udaje">
                <div>
                  <dt>Historie změn kontaktů</dt>
                  <dd>
                    {d.historie.od ? `od ${casText(d.historie.od)}, ${pocetSlovy(d.historie.radku, ['# řádek', '# řádky', '# řádků'])} u ${pocetSlovy(d.historie.kontaktu, ['# kontaktu', '# kontaktů', '# kontaktů'])}` : 'zatím žádná'}
                    {d.historie.duvod ? <span className="prehled-bunka-pozn">{d.historie.duvod}</span> : null}
                  </dd>
                </div>
                <div>
                  <dt>Časovač práce</dt>
                  <dd>
                    {d.casovac.od ? `od ${casText(d.casovac.od)}, za 7 dní ${pocetSlovy(d.casovac.signalu_7d, ['# signál', '# signály', '# signálů'])} od ${pocetSlovy(d.casovac.lidi_7d, ['# člověka', '# lidí', '# lidí'])}` : 'zatím žádný signál'}
                    {d.casovac.duvod ? <span className="prehled-bunka-pozn">{d.casovac.duvod}</span> : null}
                  </dd>
                </div>
              </dl>
            </Blok>
          </>
        );
      }}
    </NacitanyObsah>
  );
}

export default function ZalozkaPrognoza() {
  const otevri = useOtevriRadky();
  const stav = usePrehledData((t, f) => getApi().prehledPrognoza(t, f));
  return (
    <section className="prehled-zalozka-obsah" aria-labelledby="prehled-prognoza-nadpis" aria-busy={stav.nacita}>
      <h2 className="prehled-sekce-nadpis" id="prehled-prognoza-nadpis">
        Prognóza a data
      </h2>
      <NacitanyObsah stav={stav} karet={3}>
        {(o) => {
          const d = o.data;
          const metriky = [d.potvrzene, d.scenare.zakladni, d.scenare.jen_jiste];
          const p = d.presnost;
          return (
            <>
              <PrehledCastecne varovani={o.meta.varovani} metriky={metriky} />
              <div className="prehled-skupina">
                <h3 className="prehled-skupina-nadpis">
                  Odhad do konce měsíce ({denText(d.od)} – {denText(d.do)}, {pocetSlovy(d.zbyva_dni, ['zbývá # den', 'zbývají # dny', 'zbývá # dní'])}) <span className="prehled-znacka odhad">{d.stitek}</span>
                </h3>
                <Karty metriky={metriky} obalka={o} uroven={4} />
              </div>
              <Blok nadpis="Otevření klienti podle fáze" blok="prognoza-faze" popis="Míra = kolik klientů, kteří za posledních 180 dní vstoupili do fáze, se prodalo do tolika dní, kolik zbývá do konce měsíce (N v závorce). Neznámé ceny se nevažují.">
                <TabulkaObal popisek="Otevření klienti podle fáze">
                  <table className="prehled-tabulka" data-tabulka="prognoza">
                    <thead>
                      <tr>
                        <th scope="col">Fáze</th>
                        <th scope="col" className="cislo-sloupec">Klientů</th>
                        <th scope="col" className="cislo-sloupec">Známá hodnota</th>
                        <th scope="col" className="cislo-sloupec">Bez přesné ceny</th>
                        <th scope="col" className="cislo-sloupec">Míra prodeje (N)</th>
                        <th scope="col" className="cislo-sloupec">Vážená hodnota</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.otevrene.map((g) => {
                        const m = g.pravdepodobnost;
                        const nazev = `Míra prodeje – ${g.nazev}`;
                        return (
                          <tr key={g.faze} data-radek={g.faze}>
                            <th scope="row">{g.nazev}</th>
                            <td className="cislo-sloupec">{formatPocet(g.n)}</td>
                            <td className="cislo-sloupec" title={souctyPresne(g.castky) ?? undefined}>{souctyText(g.castky) ?? '—'}</td>
                            <td className="cislo-sloupec">{formatPocet(g.nezname_n)}</td>
                            <td className="cislo-sloupec">
                              <CisloTlacitko text={`${textMetriky(m, 'podil')}${m.jmenovatel !== null ? ` (${formatPocet(m.jmenovatel)})` : ''}`} nazev={nazev} title={m.duvod}
                                onClick={m.proklik ? (el) => otevri(m.proklik!, nazev, el) : null} />
                              {m.duvod ? <span className="prehled-bunka-pozn">{m.duvod}</span> : null}
                            </td>
                            <td className="cislo-sloupec">{souctyText(g.vazene) ?? '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TabulkaObal>
              </Blok>
              <Blok nadpis="Přesnost odhadu" blok="presnost" popis="První denní snímek měsíce proti skutečné hodnotě prodejů toho měsíce.">
                {p.kvalita === 'nedostupne' ? (
                  <PrehledPrazdne nadpis="Přesnost zatím nejde spočítat." text={p.duvod ?? 'Denní snímky zatím nejsou.'} />
                ) : (
                  <>
                    <TabulkaObal popisek="Přesnost odhadu">
                      <table className="prehled-tabulka" data-tabulka="presnost">
                        <thead>
                          <tr>
                            <th scope="col">Měsíc</th>
                            <th scope="col">Snímek</th>
                            <th scope="col" className="cislo-sloupec">Odhad</th>
                            <th scope="col" className="cislo-sloupec">Skutečnost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.mesice.map((m) => (
                            <tr key={m.mesic} data-radek={m.mesic}>
                              <th scope="row">{mesicNazev(m.mesic)}</th>
                              <td>{denText(m.snimek_den)}</td>
                              <td className="cislo-sloupec">{souctyText(m.odhad) ?? '—'}</td>
                              <td className="cislo-sloupec">{souctyText(m.skutecnost) ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TabulkaObal>
                    <dl className="prehled-udaje">
                      <div>
                        <dt>Průměrná odchylka (bias)</dt>
                        <dd>{souctyText(p.bias) ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>Průměrná absolutní chyba (MAE)</dt>
                        <dd>{souctyText(p.mae) ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>WAPE</dt>
                        <dd>{p.wape.map((w) => `${w.mena}: ${w.hodnota === null ? '—' : formatPodil(w.hodnota)}`).join(' · ') || '—'}</dd>
                      </div>
                    </dl>
                    {p.duvod ? <p className="prehled-blok-popis">{p.duvod}</p> : null}
                  </>
                )}
              </Blok>
            </>
          );
        }}
      </NacitanyObsah>
      <Kvalita />
    </section>
  );
}
