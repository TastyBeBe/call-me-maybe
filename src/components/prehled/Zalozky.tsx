// ZÁLOŽKY PŘEHLEDU (Přehled vedení úkol 13, Albert 17. 11. 2026; spec docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md
// §7.1 a §7.2): osm částí jako podstránky #/prehled/<záložka> a ozubené kolo Nastavení (#/prehled/nastaveni/<sekce>). Odkazy
// nesou celý filtr i s obdobím (zapisFiltr), takže přepnutí záložky filtr nechá a odkaz zkopírovaný z kterékoli záložky ukáže
// totéž období i za týden. Odkazy, ne role tab: každá záložka je vlastní adresa (aria-current = page), klávesnice Tabem.

import { Link } from 'react-router-dom';
import { GearIcon } from '../../icons';
import { ZALOZKY, zapisFiltr, type FiltrPrehledu } from '../../prehledFiltr';

export default function Zalozky({ aktivni, filtr }: { aktivni: string; filtr: FiltrPrehledu }) {
  const q = `?${zapisFiltr(filtr)}`;
  return (
    <nav className="prehled-zalozky" aria-label="Části přehledu">
      <ul className="prehled-zalozky-seznam">
        {ZALOZKY.map((z) => (
          <li key={z.klic}>
            <Link
              to={`/prehled/${z.klic}${q}`}
              className={`prehled-zalozka${aktivni === z.klic ? ' aktivni' : ''}`}
              aria-current={aktivni === z.klic ? 'page' : undefined}
              data-sfx="none"
            >
              {z.nazev}
            </Link>
          </li>
        ))}
        <li className="prehled-zalozka-nastaveni">
          <Link
            to={`/prehled/nastaveni/cile${q}`}
            className={`prehled-zalozka nastaveni${aktivni === 'nastaveni' ? ' aktivni' : ''}`}
            aria-current={aktivni === 'nastaveni' ? 'page' : undefined}
            data-sfx="none"
          >
            <GearIcon size={15} /> Nastavení
          </Link>
        </li>
      </ul>
    </nav>
  );
}
