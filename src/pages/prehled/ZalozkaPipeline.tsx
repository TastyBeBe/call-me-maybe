// ZÁLOŽKA PIPELINE (Přehled vedení úkol 14a, Albert 17. 11. 2026; spec §4.6 a §7.2, kontrakt §5.6). Otevřené fáze k datu (počet,
// známá hodnota po měnách, kolik bez přesné ceny, stáří ve fázi: medián, 90. percentil a celkový čas jen z historie), graf pásem
// stáří 0–7 / 8–14 / 15–30 / 31+ dní (klik na pásmo = jeho řádky), rychlost návrhu a nabídky za polovinu (karty), kohorty měsíců
// prvního hovoru s oknem stejné zralosti, kalibrace známky A–C a hvězdy, ceny nabídek a pohyby pipeline (jen z historie změn,
// jinak „nedostupné“ s důvodem). Neznámé nikdy jako 0.

import { getApi, type DataPipeline } from '../../api';
import Pasma from '../../components/grafy/Pasma';
import { NacitanyObsah, PrehledCastecne, PrehledPrazdne } from '../../components/prehled/Stavy';
import { Blok, CisloTlacitko, TabulkaObal } from '../../components/prehled/Tabulka';
import { mesicNazev } from '../../grafy';
import { formatCastka, formatDny, formatPocet, formatPodil, nazevMetriky, pocetSlovy, souctyPresne, souctyText } from '../../prehled';
import Karty from './Karty';
import { useOtevriRadky, usePrehledData } from './kontext';

const ZNAMKY: Record<string, string> = { A: 'Známka A', B: 'Známka B', C: 'Známka C', bez: 'Bez známky' };

function Faze({ d }: { d: DataPipeline }) {
  const otevri = useOtevriRadky();
  if (d.faze.length === 0) return <PrehledPrazdne nadpis="Stav pipeline k tomuto okamžiku není známý." text="Historie změn stavů začíná později; zrušte „Stav k datu“ nebo zvolte pozdější den." />;
  return (
    <TabulkaObal popisek="Otevřené fáze">
      <table className="prehled-tabulka" data-tabulka="faze">
        <thead>
          <tr>
            <th scope="col">Fáze</th>
            <th scope="col" className="cislo-sloupec">Klientů</th>
            <th scope="col" className="cislo-sloupec">Známá hodnota</th>
            <th scope="col" className="cislo-sloupec">Bez přesné ceny</th>
            <th scope="col" className="cislo-sloupec">Medián ve fázi</th>
            <th scope="col" className="cislo-sloupec">90. percentil</th>
            <th scope="col" className="cislo-sloupec">Celkový čas ve fázi</th>
          </tr>
        </thead>
        <tbody>
          {d.faze.map((f) => (
            <tr key={f.status} data-radek={f.status}>
              <th scope="row">{f.nazev}</th>
              <td className="cislo-sloupec">
                <CisloTlacitko text={formatPocet(f.n)} nazev={`Fáze ${f.nazev}`} onClick={f.proklik && f.n > 0 ? (el) => otevri(f.proklik!, `Fáze ${f.nazev}`, el) : null} />
              </td>
              <td className="cislo-sloupec" title={souctyPresne(f.castky) ?? undefined}>{souctyText(f.castky) ?? '—'}</td>
              <td className="cislo-sloupec">{formatPocet(f.nezname_n)}</td>
              <td className="cislo-sloupec">{f.starnuti.median_d === null ? '—' : formatDny(f.starnuti.median_d)}</td>
              <td className="cislo-sloupec">{f.starnuti.p90_d === null ? '—' : formatDny(f.starnuti.p90_d)}</td>
              <td className="cislo-sloupec">
                {f.starnuti.celkova_doba.median_d === null ? '—' : formatDny(f.starnuti.celkova_doba.median_d)}
                {f.starnuti.celkova_doba.kvalita === 'nedostupne' && f.n > 0 ? <span className="prehled-bunka-pozn">jen z historie změn</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TabulkaObal>
  );
}

function Kohorty({ d }: { d: DataPipeline }) {
  const otevri = useOtevriRadky();
  if (d.kohorty.length === 0) return <PrehledPrazdne nadpis="Žádná kohorta." text="V období nebyl žádný první hovor." />;
  const okno = d.kohorty[0]?.v_okne.dni ?? 0;
  return (
    <TabulkaObal popisek="Kohorty prvního hovoru">
      <table className="prehled-tabulka" data-tabulka="kohorty">
        <thead>
          <tr>
            <th scope="col">Měsíc prvního hovoru</th>
            <th scope="col" className="cislo-sloupec">Kontaktů</th>
            <th scope="col" className="cislo-sloupec">{nazevMetriky('dovolano', 'Spojeno')}</th>
            <th scope="col" className="cislo-sloupec">Zájem</th>
            <th scope="col" className="cislo-sloupec">Návrh</th>
            <th scope="col" className="cislo-sloupec">Prodáno</th>
            <th scope="col" className="cislo-sloupec">Ztraceno</th>
            <th scope="col" className="cislo-sloupec">Otevřené</th>
            <th scope="col" className="cislo-sloupec">Zralost</th>
            <th scope="col" className="cislo-sloupec">Do {formatDny(okno)}: zájem / návrh / prodáno</th>
          </tr>
        </thead>
        <tbody>
          {d.kohorty.map((k) => (
            <tr key={k.mesic} data-radek={k.mesic}>
              <th scope="row">{mesicNazev(k.mesic)}</th>
              <td className="cislo-sloupec">
                <CisloTlacitko text={formatPocet(k.n)} nazev={`Kohorta ${mesicNazev(k.mesic)}`} onClick={k.proklik && k.n > 0 ? (el) => otevri(k.proklik!, `Kohorta ${mesicNazev(k.mesic)}`, el) : null} />
              </td>
              <td className="cislo-sloupec">{formatPocet(k.dovolano)}</td>
              <td className="cislo-sloupec">{formatPocet(k.zajem)}</td>
              <td className="cislo-sloupec">{formatPocet(k.navrh)}</td>
              <td className="cislo-sloupec">{formatPocet(k.prodano)}</td>
              <td className="cislo-sloupec">{formatPocet(k.ztraceno)}</td>
              <td className="cislo-sloupec">{formatPocet(k.otevrenych)}</td>
              <td className="cislo-sloupec">{formatDny(k.zralost_dni)}</td>
              <td className="cislo-sloupec">{`${formatPocet(k.v_okne.zajem)} / ${formatPocet(k.v_okne.navrh)} / ${formatPocet(k.v_okne.prodano)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TabulkaObal>
  );
}

function Kalibrace({ d }: { d: DataPipeline }) {
  const otevri = useOtevriRadky();
  const radky = [
    ...d.kalibrace_znamky.map((k) => ({ klic: `znamka-${k.znamka}`, nazev: ZNAMKY[k.znamka] ?? k.znamka, ...k })),
    { klic: 's-hvezdou', nazev: 'S hvězdou před výsledkem', znamka: '', ...d.kalibrace_hvezdy.s_hvezdou },
    { klic: 'bez-hvezdy', nazev: 'Bez hvězdy', znamka: '', ...d.kalibrace_hvezdy.bez_hvezdy },
  ];
  return (
    <TabulkaObal popisek="Kalibrace známky a hvězdy">
      <table className="prehled-tabulka" data-tabulka="kalibrace">
        <thead>
          <tr>
            <th scope="col">Skupina</th>
            <th scope="col" className="cislo-sloupec">Klientů (N)</th>
            <th scope="col" className="cislo-sloupec">Prodáno</th>
            <th scope="col" className="cislo-sloupec">Podíl</th>
          </tr>
        </thead>
        <tbody>
          {radky.map((r) => (
            <tr key={r.klic} data-radek={r.klic}>
              <th scope="row">{r.nazev}</th>
              <td className="cislo-sloupec">
                <CisloTlacitko text={formatPocet(r.n)} nazev={r.nazev} onClick={r.proklik && r.n > 0 ? (el) => otevri(r.proklik!, r.nazev, el) : null} />
              </td>
              <td className="cislo-sloupec">{formatPocet(r.prodano)}</td>
              <td className="cislo-sloupec">{r.podil === null ? '—' : formatPodil(r.podil)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TabulkaObal>
  );
}

/** Pohyby pipeline (export kvůli testu Z8: DEMO je má vždy nedostupné, takže řádky s daty e2e neuvidí). */
export function Pohyby({ d }: { d: Pick<DataPipeline, 'pohyby'> }) {
  const p = d.pohyby;
  if (p.kvalita === 'nedostupne') return <PrehledPrazdne nadpis="Pohyby pipeline zatím nejsou k dispozici." text={p.duvod ?? 'Potřebují historii změn stavů od začátku období.'} />;
  const r: [string, string][] = [
    ['Na začátku období', `${formatPocet(p.pocatek.n)}${souctyText(p.pocatek.castky) ? ` · ${souctyText(p.pocatek.castky)}` : ''}`],
    ['Nově otevřené', formatPocet(p.nove)],
    ['Znovu otevřené', formatPocet(p.znovu_otevrene)],
    ['Vyhrané', formatPocet(p.vyhrane)],
    ['Ztracené', formatPocet(p.ztracene)],
    ['Vyřazené', formatPocet(p.vyrazene)],
    ['Na konci období', `${formatPocet(p.konec.n)}${souctyText(p.konec.castky) ? ` · ${souctyText(p.konec.castky)}` : ''}`],
    ['Prošly obdobím (otevřené i uzavřené uvnitř)', formatPocet(p.pruchozi)],
    ['Přírůstek hodnoty (noví a znovu otevření)', souctyText(p.prirustek_hodnoty) ?? '—'],
    ['Změna hodnoty u otevřených', souctyText(p.zmena_hodnoty) ?? '—'],
    ['Úbytek hodnoty (vyhrané, ztracené, vyřazené)', souctyText(p.ubytek_hodnoty) ?? '—'],
  ];
  return (
    <>
      <dl className="prehled-udaje">
        {r.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {p.duvod ? <p className="prehled-blok-popis">{p.duvod}</p> : null}
    </>
  );
}

export default function ZalozkaPipeline() {
  const otevri = useOtevriRadky();
  const stav = usePrehledData((t, f) => getApi().prehledPipeline(t, f));
  return (
    <section className="prehled-zalozka-obsah" aria-labelledby="prehled-pipeline-nadpis" aria-busy={stav.nacita}>
      <h2 className="prehled-sekce-nadpis" id="prehled-pipeline-nadpis">
        Pipeline
      </h2>
      <NacitanyObsah stav={stav} karet={5}>
        {(o) => {
          const d = o.data;
          const metriky = [d.rychlost_navrhu.median, d.rychlost_navrhu.p90, d.slevy.nabidnuto, d.slevy.prijato, d.slevy.mira_prijeti];
          const sPasmy = d.faze.filter((f) => f.n > 0 || f.starnuti.nezname_n > 0);
          return (
            <>
              <PrehledCastecne varovani={o.meta.varovani} metriky={metriky} />
              <Karty metriky={metriky} obalka={o} />
              {d.rychlost_navrhu.cenzurovano ? (
                <p className="prehled-cil muted">Na návrh ještě {pocetSlovy(d.rychlost_navrhu.cenzurovano, ['čeká # klient', 'čekají # klienti', 'čeká # klientů'])} se zájmem z období (v mediánu nejsou, jejich čas běží).</p>
              ) : null}
              <Blok nadpis="Otevřené fáze" blok="faze" popis="Klienti v otevřených stavech k datu, známá hodnota (cena nabídky za polovinu, jinak cena webu) a jak dlouho jsou ve fázi.">
                <Faze d={d} />
              </Blok>
              {sPasmy.length > 0 && (
                <Pasma
                  graf="pasma"
                  nadpis="Stáří ve fázi"
                  popis="Dny od vstupu do současné fáze (pražské dny). Klientům bez známého vstupu se čas nehádá."
                  radky={sPasmy.map((f) => ({ klic: f.status, nazev: f.nazev, pasma: f.starnuti.pasma, nezname: f.starnuti.nezname_n, median: f.starnuti.median_d, p90: f.starnuti.p90_d }))}
                  onProklik={otevri}
                />
              )}
              <Blok nadpis="Kohorty prvního hovoru" blok="kohorty" popis="Kontakty podle měsíce prvního hovoru a jejich výsledek k datu; poslední sloupec srovnává kohorty ve stejně dlouhém okně.">
                <Kohorty d={d} />
              </Blok>
              <Blok nadpis="Kalibrace známky a hvězdy" blok="kalibrace" popis="Prodalo se víc u klientů, kterým volající dal lepší známku nebo hvězdu? Pozorování s počtem N, ne důkaz.">
                <Kalibrace d={d} />
              </Blok>
              {d.slevy.ceny.length > 0 && (
                <Blok nadpis="Ceny nabídek za polovinu" blok="ceny-slev" popis="Původní cena webu a nabídnutá cena tam, kde obě jdou přečíst ve stejné měně.">
                  <ul className="prehled-seznam-cisel">
                    {d.slevy.ceny.map((c) => (
                      <li key={c.mena}>
                        {pocetSlovy(c.n, ['# nabídka', '# nabídky', '# nabídek'])}: původně {formatCastka(c.puvodni, c.mena, true)}, nabídnuto {formatCastka(c.nabidnuta, c.mena, true)}
                      </li>
                    ))}
                  </ul>
                </Blok>
              )}
              <Blok nadpis="Pohyby pipeline" blok="pohyby" popis="Otevřené na začátku a na konci období a co se mezi tím stalo (jen z historie změn stavů).">
                <Pohyby d={d} />
              </Blok>
            </>
          );
        }}
      </NacitanyObsah>
    </section>
  );
}
