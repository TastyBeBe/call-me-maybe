// ZÁLOŽKA FINANCE (Přehled vedení úkol 14a, Albert 17. 11. 2026, D3, D6 a D10: „All of these should be separate stats … visible for all
// of these things individually and together“; spec §4.9 a §7.2, kontrakt §5.9 a §2.12). Prodeje, faktury, platby a pohledávky
// odděleně (nikdy odvozené jedno z druhého), náklady po kategoriích (provize z prodejů a pět kategorií evidence, každá zvlášť
// s řádky, „ověřit“ u částek čekajících na ověření) a dohromady, výsledek = inkaso − náklady po měnách, pokrytí nákladů na klienty,
// provize nárok / vyplaceno / zbývá, hosting (roční, MRR, ARR) s obnovami a slevy. S výběrem lidí, segmentu, oboru nebo kraje jsou
// náklady z evidence „—“ s důvodem (nejsou po lidech ani klientech), provize se řídí filtrem. CZK a EUR nikdy dohromady.

import { Fragment } from 'react';
import { getApi, type DataFinance, type MenaPrehledu } from '../../api';
import Sloupce from '../../components/grafy/Sloupce';
import { NacitanyObsah, PrehledCastecne } from '../../components/prehled/Stavy';
import { Blok, CisloTlacitko, TabulkaObal } from '../../components/prehled/Tabulka';
import { castkaVMene } from '../../grafy';
import { formatCastka, formatPocet, pocetSlovy, presneCastky, textMetriky } from '../../prehled';
import Karty from './Karty';
import ObnovyHostingu from './ObnovyHostingu';
import { useOtevriRadky, usePrehled, usePrehledData } from './kontext';

function Naklady({ d }: { d: DataFinance }) {
  const otevri = useOtevriRadky();
  const { filtr } = usePrehled();
  const meny: MenaPrehledu[] = filtr.mena === 'obe' ? ['CZK', 'EUR'] : [filtr.mena];
  return (
    <>
      {meny.map((mena) => {
        const polozky = d.naklady.kategorie.map((k) => {
          const v = k.castka.kvalita === 'nedostupne' ? null : castkaVMene(k.castka.castky, mena);
          return {
            klic: k.kategorie,
            nazev: k.nazev,
            hodnota: v,
            text: k.castka.kvalita === 'nedostupne' ? '—' : v === null ? `— ${mena === 'EUR' ? '€' : 'Kč'}` : formatCastka(v, mena, true),
            pozn: k.castka.kvalita === 'nedostupne' ? k.castka.duvod : k.overit > 0 ? `ověřit (${formatPocet(k.overit)})` : null,
            proklik: k.castka.kvalita === 'nedostupne' ? null : k.castka.proklik,
          };
        });
        if (polozky.every((p) => !p.hodnota) && mena === 'EUR' && meny.length > 1) return null;
        return (
          <Sloupce
            key={mena}
            graf="naklady"
            nadpis={`Náklady po kategoriích${meny.length > 1 ? ` (${mena})` : ''}`}
            popis="Měsíční náklad celý v každém měsíci období, roční po dvanáctinách, jednorázový v den platby; provize v den prodeje."
            nazevPolozky="Kategorie"
            nazevHodnoty="Náklady"
            polozky={polozky}
            onProklik={otevri}
          />
        );
      })}
      <Blok nadpis="Náklady po kategoriích a dohromady" blok="naklady">
        <TabulkaObal popisek="Náklady po kategoriích">
          <table className="prehled-tabulka" data-tabulka="naklady">
            <thead>
              <tr>
                <th scope="col">Kategorie</th>
                <th scope="col" className="cislo-sloupec">Částka</th>
                <th scope="col" className="naklady-sloupec-pozn">Poznámka</th>
              </tr>
            </thead>
            <tbody>
              {d.naklady.kategorie.map((k) => {
                const m = k.castka;
                const text = textMetriky(m, 'mena');
                const pozn = k.overit > 0 || m.duvod ? (
                  <>
                    {k.overit > 0 && <span className="prehled-znacka overit-znacka">ověřit ({formatPocet(k.overit)})</span>}
                    {m.duvod ? <span className="prehled-bunka-pozn">{m.duvod}</span> : null}
                  </>
                ) : null;
                return (
                  <Fragment key={k.kategorie}>
                    <tr data-radek={k.kategorie} className={pozn ? 'naklady-ma-pozn' : undefined}>
                      <th scope="row">{k.nazev}</th>
                      <td className="cislo-sloupec" data-sloupec="castka">
                        <CisloTlacitko text={text} nazev={`Náklady – ${k.nazev}`} title={presneCastky(m)} onClick={m.proklik && m.kvalita !== 'nedostupne' ? (el) => otevri(m.proklik!, `Náklady – ${k.nazev}`, el) : null} />
                      </td>
                      <td className="naklady-sloupec-pozn" data-pozn-pro={k.kategorie}>{pozn}</td>
                    </tr>
                    {/* na telefonu poznámka pod řádkem přes celou šířku místo úzkého sloupce (oprava po recenzi, drobnost 9) */}
                    {pozn && (
                      <tr className="naklady-pozn-radek">
                        <td colSpan={2} data-pozn-pro={k.kategorie}>{pozn}</td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="prehled-radek-soucet" data-radek="celkem">
                <th scope="row">Dohromady</th>
                <td className="cislo-sloupec" data-sloupec="castka">
                  <CisloTlacitko text={textMetriky(d.naklady.celkem, 'mena')} nazev="Náklady celkem" title={presneCastky(d.naklady.celkem)}
                    onClick={d.naklady.celkem.proklik && d.naklady.celkem.kvalita !== 'nedostupne' ? (el) => otevri(d.naklady.celkem.proklik!, 'Náklady celkem', el) : null} />
                </td>
                <td className="naklady-sloupec-pozn" data-pozn-pro="celkem">{d.naklady.celkem.duvod ? <span className="prehled-bunka-pozn">{d.naklady.celkem.duvod}</span> : null}</td>
              </tr>
              {d.naklady.celkem.duvod && (
                <tr className="naklady-pozn-radek">
                  <td colSpan={2} data-pozn-pro="celkem"><span className="prehled-bunka-pozn">{d.naklady.celkem.duvod}</span></td>
                </tr>
              )}
            </tfoot>
          </table>
        </TabulkaObal>
        {d.pokryti_nakladu.length > 0 && (
          <ul className="prehled-seznam-cisel">
            {d.pokryti_nakladu.map((p) => (
              <li key={p.kategorie}>Pokrytí nákladů na klienty: {p.text}.</li>
            ))}
          </ul>
        )}
      </Blok>
    </>
  );
}

export default function ZalozkaFinance() {
  const stav = usePrehledData((t, f) => getApi().prehledFinance(t, f));
  return (
    <section className="prehled-zalozka-obsah" aria-labelledby="prehled-finance-nadpis" aria-busy={stav.nacita}>
      <h2 className="prehled-sekce-nadpis" id="prehled-finance-nadpis">
        Finance
      </h2>
      <NacitanyObsah stav={stav} karet={6}>
        {(o) => {
          const d = o.data;
          const prodeje = [d.prodeje, d.prodeje_mimo_prodej, d.faktury.pocet, d.faktury.web, d.faktury.hosting, d.faktury.celkem];
          const platby = [d.platby.inkaso, d.pohledavky.pocet, d.pohledavky.castka];
          const vysledek = [d.naklady.celkem, d.vysledek];
          const provize = [d.provize.narok, d.provize.vyplaceno, d.provize.zbyva];
          const hosting = [d.hosting.rocne, d.hosting.mrr, d.hosting.arr];
          const slevy = [d.slevy.pocet, d.slevy.castka];
          return (
            <>
              <PrehledCastecne varovani={o.meta.varovani} metriky={[...prodeje, ...platby, ...vysledek, ...provize, ...hosting, ...slevy, ...d.naklady.kategorie.map((k) => k.castka)]} />
              <div className="prehled-skupina">
                <h3 className="prehled-skupina-nadpis">Náklady a výsledek</h3>
                <Karty metriky={vysledek} obalka={o} uroven={4} />
              </div>
              <Naklady d={d} />
              <div className="prehled-skupina">
                <h3 className="prehled-skupina-nadpis">Prodeje a faktury</h3>
                <Karty metriky={prodeje} obalka={o} uroven={4} />
              </div>
              <div className="prehled-skupina">
                <h3 className="prehled-skupina-nadpis">Platby a pohledávky</h3>
                <Karty metriky={platby} obalka={o} uroven={4} />
                <p className="prehled-cil muted">
                  {d.platby.odvozene > 0 ? `Odvozených plateb (stav Zaplaceno bez potvrzení): ${formatPocet(d.platby.odvozene)}. ` : ''}
                  {d.pohledavky.nejstarsi_dni !== null ? `Nejstarší nezaplacená faktura je ${pocetSlovy(d.pohledavky.nejstarsi_dni, ['# den', '# dny', '# dní'])} stará; přes 14 dní: ${formatPocet(d.pohledavky.po_14_dnech)}.` : 'Žádná nezaplacená faktura.'}
                </p>
              </div>
              <div className="prehled-skupina">
                <h3 className="prehled-skupina-nadpis">Provize volajících</h3>
                <Karty metriky={provize} obalka={o} uroven={4} />
              </div>
              <div className="prehled-skupina">
                <h3 className="prehled-skupina-nadpis">Hosting</h3>
                <Karty metriky={hosting} obalka={o} uroven={4} />
              </div>
              <Blok nadpis="Obnovy hostingu" blok="obnovy" popis="Poslední platba klienta + 1 rok, splatné do 60 dní nebo po splatnosti.">
                <ObnovyHostingu obnovy={d.hosting.obnovy} />
              </Blok>
              <div className="prehled-skupina">
                <h3 className="prehled-skupina-nadpis">Nabídky za polovinu</h3>
                <Karty metriky={slevy} obalka={o} uroven={4} />
              </div>
            </>
          );
        }}
      </NacitanyObsah>
    </section>
  );
}
