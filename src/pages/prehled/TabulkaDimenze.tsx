// TABULKA KLIENTŮ PODLE DIMENZE (Přehled vedení úkol 14a; kontrakt §5.7 RadekDimenze): segment, specializace oboru nebo kraj. Počet
// kontaktů je tlačítko na jejich řádky (proklik řádku = právě ta populace); ostatní sloupce jsou milníky téže populace bez vlastního
// prokliku (kontrakt R19), proto jen čísla. Hodnota prodejů po měnách (nikdy sečtené), neznámá „—“. Serverové dovolano je „Spojeno“.

import type { RadekDimenze } from '../../api/types';
import { CisloTlacitko, MiniPruh, TabulkaObal } from '../../components/prehled/Tabulka';
import { formatPocet, nazevMetriky, souctyPresne, souctyText } from '../../prehled';
import { useOtevriRadky } from './kontext';

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
              <td className="cislo-sloupec" title={souctyPresne(r.hodnota) ?? undefined}>{souctyText(r.hodnota) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TabulkaObal>
  );
}
