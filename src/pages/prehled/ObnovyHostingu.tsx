// OBNOVY HOSTINGU (Přehled vedení úkol 14a; sdílená tabulka záložek Finance a Dodání, kontrakt §5.10 hosting.obnovy). Oprava po
// recenzi 18. 11. 2026 (drobnost 10): vlastní komponenta místo importu z jiné záložky.

import type { DataFinance } from '../../api';
import { PrehledPrazdne } from '../../components/prehled/Stavy';
import { TabulkaObal } from '../../components/prehled/Tabulka';
import { casText, denText, formatCastka } from '../../prehled';

/** Obnovy hostingu (Finance i Dodání): klient, poslední platba, splatnost a roční částka. */
export default function ObnovyHostingu({ obnovy }: { obnovy: DataFinance['hosting']['obnovy'] }) {
  if (obnovy.length === 0) return <PrehledPrazdne nadpis="Žádná obnova v příštích 60 dnech." text="Ani žádná po splatnosti." />;
  return (
    <TabulkaObal popisek="Obnovy hostingu">
      <table className="prehled-tabulka" data-tabulka="obnovy">
        <thead>
          <tr>
            <th scope="col">Klient</th>
            <th scope="col">Zaplaceno</th>
            <th scope="col">Splatnost</th>
            <th scope="col" className="cislo-sloupec">Ročně</th>
          </tr>
        </thead>
        <tbody>
          {obnovy.map((r) => (
            <tr key={r.kontakt_id} data-radek={r.kontakt_id}>
              <th scope="row">{r.jmeno}</th>
              <td>{casText(r.zaplaceno_at)}</td>
              <td>{denText(r.splatnost)}</td>
              <td className="cislo-sloupec">{r.castka === null ? 'neznámá' : formatCastka(r.castka, r.mena)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TabulkaObal>
  );
}
