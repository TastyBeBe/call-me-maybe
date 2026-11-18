// NASTAVENÍ PŘEHLEDU (Přehled vedení úkol 13 a 14b, Albert 17. 11. 2026, D6, D9 a D10; spec §7.2: gear „Nastavení“: Cíle, Náklady
// s „ověřit“, Výplaty provizí; kontrakt §4.3 až §4.5). Tři sekce jako podstránky #/prehled/nastaveni/<sekce>, každá se seznamem
// ze serveru a s přidáním, úpravou a zrušením (zrušení až po potvrzení): cíle podle práv D9 (NastaveniCile), náklady po
// kategoriích (NastaveniNaklady), výplaty provizí podle práv D10 (NastaveniVyplaty). Po uložení se data záložek načtou znovu
// (zmenaDat v kontextu Přehledu). ⚠ Úkol 14b NAHRAZUJE kostru úkolu 13 (jen popis sekcí a věta, že zadávání teprve přijde, bez volání).

import { Link } from 'react-router-dom';
import { NASTAVENI_SEKCE, type NastaveniKlic } from '../../prehledFiltr';
import NastaveniCile from './NastaveniCile';
import NastaveniNaklady from './NastaveniNaklady';
import NastaveniVyplaty from './NastaveniVyplaty';

export default function ZalozkaNastaveni({ sekce, hledani }: { sekce: NastaveniKlic; hledani: string }) {
  const aktivni = NASTAVENI_SEKCE.find((s) => s.klic === sekce) ?? NASTAVENI_SEKCE[0];
  return (
    <section className="prehled-zalozka-obsah prehled-nastaveni" aria-labelledby="prehled-nastaveni-nadpis">
      <h2 className="prehled-sekce-nadpis" id="prehled-nastaveni-nadpis">
        Nastavení
      </h2>
      <nav className="prehled-nastaveni-sekce" aria-label="Sekce nastavení">
        {NASTAVENI_SEKCE.map((s) => (
          <Link
            key={s.klic}
            to={`/prehled/nastaveni/${s.klic}${hledani}`}
            className={`pill-btn sm${s.klic === aktivni.klic ? ' dark' : ''}`}
            aria-current={s.klic === aktivni.klic ? 'page' : undefined}
            data-sfx="none"
          >
            {s.nazev}
          </Link>
        ))}
      </nav>
      {/* klíč = sekce: přepnutí sekce zavře rozpracovaný formulář jiné sekce a načte její seznam */}
      <section key={aktivni.klic} className="card prehled-blok prehled-nastaveni-obsah" data-sekce={aktivni.klic} aria-labelledby={`nastaveni-${aktivni.klic}-nadpis`}>
        {aktivni.klic === 'cile' ? <NastaveniCile /> : aktivni.klic === 'naklady' ? <NastaveniNaklady /> : <NastaveniVyplaty />}
      </section>
    </section>
  );
}
