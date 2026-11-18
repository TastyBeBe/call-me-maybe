// ZÁLOŽKA KOMUNIKACE A ZTRÁTY (Přehled vedení úkol 14a, Albert 17. 11. 2026, D4 a D8; spec §4.8 a §7.2, kontrakt §5.8 a §5.4). Kdo na
// koho čeká (otevření klienti: klient napsal poslední = čeká na nás, my poslední = na klienta; jen pro dnešek), zprávy z Gmailu
// podle druhu a směru (nedoručené a automatické odpovědi nikdy jako odpověď klienta), metriky odpovědí po návrhu a nejasných vazeb,
// důvody odmítnutí náhledu a nabídky za polovinu (graf a tabulka po fázích, segmentech a lidech), odvozené výsledky (nereagoval ani
// na nabídku, mlčí po návrhu, důvod nezapsán) a co se stalo po návrhu (prehled_trychtyr.po_navrhu). Bez kauzálních tvrzení.

import { getApi, type DataKomunikace, type SkupinaCekani } from '../../api';
import Sloupce from '../../components/grafy/Sloupce';
import { NacitanyObsah, PrehledCastecne, PrehledPrazdne } from '../../components/prehled/Stavy';
import { Blok, CisloTlacitko, TabulkaObal } from '../../components/prehled/Tabulka';
import { formatDny, formatPocet, formatPodil, pocetSlovy } from '../../prehled';
import Karty from './Karty';
import { useOtevriRadky, usePrehled, usePrehledData } from './kontext';

const DRUHY: { klic: keyof DataKomunikace['zpravy']['prichozi']; nazev: string }[] = [
  { klic: 'clovek', nazev: 'Člověk' },
  { klic: 'automaticka_odpoved', nazev: 'Automatická odpověď' },
  { klic: 'nedoruceno', nazev: 'Nedoručeno' },
  { klic: 'systemova', nazev: 'Systémová zpráva' },
  { klic: 'nezname', nazev: 'Nejasné' },
];

function Cekani({ nazev, popis, s }: { nazev: string; popis: string; s: SkupinaCekani }) {
  const otevri = useOtevriRadky();
  return (
    <div className="prehled-cekani">
      <h4 className="prehled-cekani-nadpis">{nazev}</h4>
      <p className="prehled-cekani-cislo">
        <CisloTlacitko text={formatPocet(s.n)} nazev={nazev} onClick={s.proklik && s.n ? (el) => otevri(s.proklik!, nazev, el) : null} />
      </p>
      {s.kvalita === 'nedostupne' ? (
        <p className="prehled-bunka-pozn">{s.duvod}</p>
      ) : (
        <dl className="prehled-udaje">
          <div>
            <dt>Medián čekání</dt>
            <dd>{s.median_d === null ? '—' : formatDny(s.median_d)}</dd>
          </div>
          <div>
            <dt>90. percentil</dt>
            <dd>{s.p90_d === null ? '—' : formatDny(s.p90_d)}</dd>
          </div>
          <div>
            <dt>{popis}</dt>
            <dd>{formatPocet(s.nad_limit)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function PoNavrhu() {
  const otevri = useOtevriRadky();
  const stav = usePrehledData((t, f) => getApi().prehledTrychtyr(t, f));
  return (
    <NacitanyObsah stav={stav} karet={1} varovani={(o) => o.meta.varovani}>
      {(o) => {
        const p = o.data.po_navrhu;
        return (
          <Sloupce
            graf="po-navrhu"
            nadpis="Co se stalo po návrhu"
            popis={`${p.kohorta.popis}: ${pocetSlovy(p.kohorta.n, ['# klient', '# klienti', '# klientů'])}. Kroky se překrývají (klient může odpovědět i dostat nabídku); podíl je z celé kohorty.`}
            nazevPolozky="Výsledek"
            nazevHodnoty="Klientů"
            polozky={p.kroky.map((k) => ({
              klic: k.klic, nazev: k.nazev, hodnota: k.n, text: k.n === null ? '—' : `${formatPocet(k.n)}${k.podil !== null ? ` · ${formatPodil(k.podil)}` : ''}`,
              pozn: k.duvod, proklik: k.n ? k.proklik : null,
            }))}
            onProklik={otevri}
          />
        );
      }}
    </NacitanyObsah>
  );
}

export default function ZalozkaKomunikace() {
  const otevri = useOtevriRadky();
  const { moznosti } = usePrehled();
  const stav = usePrehledData((t, f) => getApi().prehledKomunikace(t, f));
  const jmeno = (uid: number | null) => (uid === null ? 'Nepřiřazeno' : moznosti.data.lide.find((l) => l.id === uid)?.display_name ?? `#${uid}`);
  const segment = (k: string) => moznosti.data.segmenty.find((s) => s.klic === k)?.nazev ?? k;
  return (
    <section className="prehled-zalozka-obsah" aria-labelledby="prehled-komunikace-nadpis" aria-busy={stav.nacita}>
      <h2 className="prehled-sekce-nadpis" id="prehled-komunikace-nadpis">
        Komunikace a ztráty
      </h2>
      <NacitanyObsah stav={stav} karet={6}>
        {(o) => {
          const d = o.data;
          const zpravy = [d.zpravy.nedoruceno, d.zpravy.automaticke, d.zpravy.mira_odpovedi_po_navrhu, d.zpravy.nejasne_vazby];
          const ztraty = [d.duvody.nereagoval_na_nabidku, d.duvody.mlci_po_navrhu, d.duvody.bez_duvodu];
          return (
            <>
              <PrehledCastecne varovani={o.meta.varovani} metriky={[...zpravy, ...ztraty]} />
              <Blok nadpis="Kdo na koho čeká" blok="cekani" popis="Otevření klienti podle toho, kdo psal naposledy (jen pro dnešek). Dny od poslední zprávy.">
                <div className="prehled-cekani-mrizka">
                  <Cekani nazev="Čeká na nás" popis="Déle než 24 hodin" s={d.cekani.na_nas} />
                  <Cekani nazev="Čeká na klienta" popis="Mlčí 5 a víc pracovních dní" s={d.cekani.na_klienta} />
                </div>
              </Blok>
              <div className="prehled-skupina">
                <h3 className="prehled-skupina-nadpis">Zprávy z Gmailu</h3>
                <Karty metriky={zpravy} obalka={o} uroven={4} />
              </div>
              <Blok nadpis="Zprávy podle druhu" blok="zpravy" popis={d.zpravy.kvalita === 'nedostupne' ? d.zpravy.duvod : 'Zprávy v období u klientů ve filtru. Automatické odpovědi a nedoručené nikdy nejsou odpověď klienta.'}>
                <TabulkaObal popisek="Zprávy podle druhu">
                  <table className="prehled-tabulka" data-tabulka="zpravy">
                    <thead>
                      <tr>
                        <th scope="col">Druh</th>
                        <th scope="col" className="cislo-sloupec">Příchozí</th>
                        <th scope="col" className="cislo-sloupec">Odchozí</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DRUHY.map((x) => (
                        <tr key={x.klic} data-radek={x.klic}>
                          <th scope="row">{x.nazev}</th>
                          <td className="cislo-sloupec">{formatPocet(d.zpravy.prichozi[x.klic])}</td>
                          <td className="cislo-sloupec">{formatPocet(d.zpravy.odchozi[x.klic])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TabulkaObal>
              </Blok>
              <div className="prehled-skupina">
                <h3 className="prehled-skupina-nadpis">Ztráty po návrhu</h3>
                <Karty metriky={ztraty} obalka={o} uroven={4} />
              </div>
              <Sloupce
                graf="duvody"
                nadpis="Proč klienti odmítli"
                popis={`Nejnovější důvod na klienta a fázi zapsaný v období: náhled ${formatPocet(d.duvody.celkem_nahled)}, nabídka za polovinu ${formatPocet(d.duvody.celkem_sleva)}. „Důvod nezapsán“ = odmítl po návrhu bez zapsaného důvodu.`}
                nazevPolozky="Důvod"
                nazevHodnoty="Klientů"
                polozky={d.duvody.souhrn.map((s) => ({
                  klic: s.duvod, nazev: s.nazev, hodnota: s.celkem, text: formatPocet(s.celkem),
                  pozn: `náhled ${formatPocet(s.nahled)} · nabídka ${formatPocet(s.sleva)}${s.podil !== null ? ` · ${formatPodil(s.podil)}` : ''}`, proklik: s.celkem > 0 ? s.proklik : null,
                }))}
                onProklik={otevri}
              />
              <Blok nadpis="Důvody podle segmentu a člověka" blok="duvody-radky">
                {d.duvody.radky.length === 0 ? (
                  <PrehledPrazdne nadpis="V období žádný zapsaný důvod." text="Důvody zapisují volající a automatizace, když klient po návrhu odmítne." />
                ) : (
                  <TabulkaObal popisek="Důvody podle segmentu a člověka">
                    <table className="prehled-tabulka" data-tabulka="duvody">
                      <thead>
                        <tr>
                          <th scope="col">Důvod</th>
                          <th scope="col">Fáze</th>
                          <th scope="col">Segment</th>
                          <th scope="col">Připsáno</th>
                          <th scope="col" className="cislo-sloupec">Klientů</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.duvody.radky.map((r) => (
                          <tr key={`${r.duvod}-${r.faze}-${r.segment}-${r.user_id}`} data-radek={`${r.duvod}-${r.faze}`}>
                            <th scope="row">{d.duvody.souhrn.find((s) => s.duvod === r.duvod)?.nazev ?? r.duvod}</th>
                            <td>{r.faze === 'nahled' ? 'Náhled (návrh webu)' : 'Nabídka za polovinu'}</td>
                            <td>{segment(r.segment)}</td>
                            <td>{jmeno(r.user_id)}</td>
                            <td className="cislo-sloupec">{formatPocet(r.n)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TabulkaObal>
                )}
              </Blok>
              <PoNavrhu />
            </>
          );
        }}
      </NacitanyObsah>
    </section>
  );
}
