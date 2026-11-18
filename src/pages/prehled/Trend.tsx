// TREND PROTI CÍLI (Přehled vedení úkol 14a, Albert 17. 11. 2026; spec §7.2 Vedení „trend vs target“, kontrakt §5.3 a §2.10). Řada
// prehled_rada vybrané metriky po dnech, týdnech nebo měsících podle délky období (src/grafy.ts), kreslená kumulativně od začátku
// období proti cíli, který celé období filtru obsahuje (nejkratší takový, jako karta Plnění cíle; celý cíl, bez rozpočítání).
// Peníze po měnách zvlášť (každá měna svůj graf, nikdy sečtené). Neznámý sloupec čáru přeruší, sloupec bez přesné částky přidá
// 0 a součet je dál „částečně“. V tabulce je každý sloupec tlačítko na své řádky (proklik řady s vyber.od a vyber.do, jediný
// výběr, který si appka skládá sama, kontrakt R19).

import { useState, type ReactNode } from 'react';
import { getApi, type DataRada, type MenaPrehledu, type MetrikaRadyKlic, type PrehledObalka, type PrehledProklik } from '../../api';
import Cara, { type BodCary } from '../../components/grafy/Cara';
import { NacitanyObsah } from '../../components/prehled/Stavy';
import { CisloTlacitko } from '../../components/prehled/Tabulka';
import { castkaVMene, kumulativne, popisekBodu, zrnitostObdobi } from '../../grafy';
import { denText, formatCastka, formatHodiny, formatPocet } from '../../prehled';
import type { FiltrPrehledu } from '../../prehledFiltr';
import { useOtevriRadky, usePrehled, usePrehledData } from './kontext';

/** Metriky, které jde v grafu ukázat: ty, na které jde zadat cíl (kontrakt §3.6), v pořadí karet. */
const METRIKY_TRENDU: { klic: MetrikaRadyKlic; nazev: string }[] = [
  { klic: 'hodnota_prodeju', nazev: 'Hodnota prodejů' },
  { klic: 'pocet_prodeju', nazev: 'Počet prodejů' },
  { klic: 'inkaso', nazev: 'Inkaso' },
  { klic: 'hovory', nazev: 'Hovory' },
  { klic: 'zajem', nazev: 'Hovory se zájmem' },
  { klic: 'odpracovane_hodiny', nazev: 'Odpracované hodiny' },
];
const ZRNITOST_TEXT = { den: 'po dnech', tyden: 'po týdnech (po–ne)', mesic: 'po měsících' } as const;

/** Proč cíl v grafu není (texty kontraktu §2.10). */
function bezCile(filtr: FiltrPrehledu, penize: boolean): string {
  if (filtr.segment.length > 0 || filtr.obor.length > 0 || filtr.kraj.length > 0) return 'Cíle nejsou rozdělené podle segmentu, oboru ani kraje; zrušte tyto filtry.';
  if (penize && filtr.mena === 'obe') return 'Plnění cíle se počítá jen pro jednu měnu; vyberte CZK nebo EUR.';
  return 'Pro toto období a výběr lidí není zadaný cíl.';
}

function GrafTrendu({ o, mena, vsechMen, filtr, ovladani }: { o: PrehledObalka<DataRada>; mena: MenaPrehledu | null; vsechMen: number; filtr: FiltrPrehledu; ovladani?: ReactNode }) {
  const otevri = useOtevriRadky();
  const d = o.data;
  const jednotka = d.metrika.jednotka;
  const fmt = (n: number | null): string => (n === null ? '—' : jednotka === 'mena' ? formatCastka(n, mena, true) : jednotka === 'h' ? formatHodiny(n) : formatPocet(n));
  const surove = d.body.map((b) => ({ b, hodnota: jednotka === 'mena' && mena ? castkaVMene(b.castky, mena) : b.hodnota, dostupny: b.kvalita !== 'nedostupne' }));
  const kum = kumulativne(surove);
  const body: BodCary[] = kum.map((k, i) => ({
    klic: surove[i].b.od,
    popisek: popisekBodu(surove[i].b.od, surove[i].b.do, d.zrnitost),
    hodnota: k.hodnota,
    text: fmt(k.hodnota),
    castecne: k.castecne,
  }));
  // cíl, který celé období filtru obsahuje (nejkratší), ve stejné měně; jinak žádný (bez rozpočítání)
  const cil = d.cile
    .filter((c) => (jednotka === 'mena' ? c.mena === mena : true) && c.od <= filtr.od && c.do >= filtr.do)
    .sort((a, b) => (Date.parse(a.do) - Date.parse(a.od)) - (Date.parse(b.do) - Date.parse(b.od)))[0];
  const nadpis = `${d.metrika.nazev}${vsechMen > 1 && mena ? ` (${mena})` : ''}: kumulativně${cil ? ' proti cíli' : ''}`;
  // žádný sloupec není k dispozici (třeba pracovní čas s filtrem segmentu): důvod serveru místo prázdné čáry, nikdy 0
  const duvodyNedostupne = [...new Set(d.body.filter((b) => b.kvalita === 'nedostupne' && b.duvod).map((b) => b.duvod!))];
  const nicZname = surove.length > 0 && surove.every((s) => !s.dostupny);
  const popis = nicZname
    ? `Hodnoty nejsou k dispozici. ${duvodyNedostupne.join(' ')}`.trim()
    : cil
      ? `Součet od ${denText(filtr.od)} ${ZRNITOST_TEXT[d.zrnitost]}. Cíl ${fmt(Number(cil.hodnota))} na ${denText(cil.od)} – ${denText(cil.do)} platí celý, bez rozpočítání.`
      : `Součet od ${denText(filtr.od)} ${ZRNITOST_TEXT[d.zrnitost]}. ${bezCile(filtr, jednotka === 'mena')}`;
  const proklikSloupce = (od: string, doDne: string): PrehledProklik | null =>
    d.proklik ? { zdroj: d.proklik.zdroj, filtr: { ...d.proklik.filtr, vyber: { ...(d.proklik.filtr.vyber ?? {}), od, do: doDne } } } : null;
  const tabulka = (
    <table className="prehled-tabulka">
      <thead>
        <tr>
          <th scope="col">Období</th>
          <th scope="col" className="cislo-sloupec">V období</th>
          <th scope="col" className="cislo-sloupec">Kumulativně</th>
        </tr>
      </thead>
      <tbody>
        {surove.map(({ b, hodnota, dostupny }, i) => {
          const p = dostupny ? proklikSloupce(b.od, b.do) : null;
          const nazev = `${d.metrika.nazev} – ${body[i].popisek}`;
          return (
            <tr key={b.od} data-radek={b.od}>
              <th scope="row">
                {body[i].popisek}
                {b.duvod ? <span className="prehled-bunka-pozn">{b.duvod}</span> : null}
              </th>
              <td className="cislo-sloupec">
                <CisloTlacitko text={!dostupny ? '—' : hodnota === null ? 'neznámá částka' : fmt(hodnota)} nazev={nazev} onClick={p ? (el) => otevri(p, nazev, el) : null} />
              </td>
              <td className="cislo-sloupec">
                {body[i].text}
                {body[i].castecne ? <span className="prehled-bunka-pozn">částečně</span> : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  return (
    <Cara graf="trend" nadpis={nadpis} popis={popis} nazevRady={`${d.metrika.nazev} (kumulativně)`} body={body} cil={cil ? { hodnota: Number(cil.hodnota), text: fmt(Number(cil.hodnota)) } : null}
      cele={jednotka === 'pocet'} tabulka={tabulka} ovladani={ovladani} />
  );
}

export default function Trend({ vychozi = 'hodnota_prodeju' }: { vychozi?: MetrikaRadyKlic }) {
  const { filtr } = usePrehled();
  const [metrika, setMetrika] = useState<MetrikaRadyKlic>(vychozi);
  const zrnitost = zrnitostObdobi(filtr.od, filtr.do);
  const stav = usePrehledData((t, f) => getApi().prehledRada(t, metrika, zrnitost, f), `${metrika}|${zrnitost}`);
  const ovladani = (
    <select className="prehled-select graf-vyber" aria-label="Co ukázat v grafu" value={metrika} onChange={(e) => setMetrika(e.target.value as MetrikaRadyKlic)}>
      {METRIKY_TRENDU.map((m) => (
        <option key={m.klic} value={m.klic}>{m.nazev}</option>
      ))}
    </select>
  );
  return (
    <NacitanyObsah stav={stav} karet={1}>
      {(o) => {
        const meny: (MenaPrehledu | null)[] = o.data.metrika.jednotka === 'mena' ? (filtr.mena === 'obe' ? ['CZK', 'EUR'] : [filtr.mena]) : [null];
        return (
          <div className="prehled-grafy-trendu">
            {meny.map((m, i) => (
              <GrafTrendu key={m ?? 'x'} o={o} mena={m} vsechMen={meny.length} filtr={filtr} ovladani={i === 0 ? ovladani : undefined} />
            ))}
          </div>
        );
      }}
    </NacitanyObsah>
  );
}
