// TABULKA KLIENTŮ PODLE DIMENZE (Přehled vedení úkol 14a; kontrakt §5.7 RadekDimenze): segment, specializace oboru nebo kraj. Počet
// kontaktů je tlačítko na jejich řádky (proklik řádku = právě ta populace); ostatní sloupce jsou milníky téže populace bez vlastního
// prokliku (kontrakt R19), proto jen čísla. Hodnota prodejů po měnách (nikdy sečtené), neznámá „—“. Serverové dovolano je „Spojeno“.

import type { RadekDimenze } from '../../api/types';
import { CisloTlacitko, MiniPruh, TabulkaObal } from '../../components/prehled/Tabulka';
import type { CastkaMeny } from '../../api/types';
import { formatPocet, nazevMetriky, souctyPresne, souctyText, zeZ } from '../../prehled';
import { useOtevriRadky } from './kontext';

/**
 * Pokrytí neúplného součtu hodnoty (oprava po recenzi 18. 11. 2026, drobnost 1): „pokrytí 2 ze 4“ (u víc měn s měnou), jen když
 * některá položka nemá přesnou částku; úplný součet nic nepřidá.
 */
function pokrytiSouctu(castky: CastkaMeny[]): string | null {
  const neuplne = castky.filter((c) => c.pokryti && c.pokryti.nezname > 0);
  if (neuplne.length === 0) return null;
  return neuplne
    .map((c) => `${castky.length > 1 ? `${c.mena}: ` : ''}pokrytí ${formatPocet(c.pokryti.zname)} ${zeZ(c.pokryti.celkem)} ${formatPocet(c.pokryti.celkem)}`)
    .join(' · ');
}

export default function TabulkaDimenze({ tabulka, popisek, prvni, radky }: { tabulka: string; popisek: string; prvni: string; radky: RadekDimenze[] }) {
  const otevri = useOtevriRadky();
  const maxProdano = Math.max(0, ...radky.map((r) => r.prodano));
  return (
    <TabulkaObal popisek={popisek}>
      <table className="prehled-tabulka" data-tabulka={tabulka}>
        <thead>
          <tr>
            <th scope="col">{prvni}</th>
            <th scope="col" className="cislo-sloupec">Kontaktů</th>
            <th scope="col" className="cislo-sloupec">Osloveno</th>
            <th scope="col" className="cislo-sloupec">{nazevMetriky('dovolano', 'Spojeno')}</th>
            <th scope="col" className="cislo-sloupec">Zájem</th>
            <th scope="col" className="cislo-sloupec">Návrhy</th>
            <th scope="col" className="cislo-sloupec">Prodáno</th>
            <th scope="col" className="cislo-sloupec">Hodnota prodejů</th>
          </tr>
        </thead>
        <tbody>
          {radky.map((r) => (
            <tr key={r.klic} data-radek={r.klic}>
              <th scope="row">{r.nazev}</th>
              <td className="cislo-sloupec" data-sloupec="kontakty">
                <CisloTlacitko text={formatPocet(r.kontakty)} nazev={`Kontakty – ${r.nazev}`} onClick={r.proklik ? (el) => otevri(r.proklik!, `Kontakty – ${r.nazev}`, el) : null} />
              </td>
              <td className="cislo-sloupec">{formatPocet(r.osloveno)}</td>
              <td className="cislo-sloupec">{formatPocet(r.dovolano)}</td>
              <td className="cislo-sloupec">{formatPocet(r.zajem)}</td>
              <td className="cislo-sloupec">{formatPocet(r.navrhy)}</td>
              <td className="cislo-sloupec">
                <span className="prehled-cislo">
                  <span className="cislo-text">{formatPocet(r.prodano)}</span>
                  <MiniPruh podil={maxProdano > 0 ? r.prodano / maxProdano : null} />
                </span>
              </td>
              <td className="cislo-sloupec" title={souctyPresne(r.hodnota) ?? undefined}>
                {souctyText(r.hodnota) ?? '—'}
                {pokrytiSouctu(r.hodnota) ? <span className="prehled-bunka-pozn">{pokrytiSouctu(r.hodnota)}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TabulkaObal>
  );
}
