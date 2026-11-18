// NASTAVENÍ PŘEHLEDU (Přehled vedení úkol 13; spec §7.2: gear „Nastavení“: Cíle, Náklady s „ověřit“, Výplaty provizí). Tady jen
// kostra: tři sekce jako podstránky #/prehled/nastaveni/<sekce> s tím, co v nich bude. Formuláře nad funkcemi 072 (cile_*,
// naklady_*, provize_vyplat*) doplní úkol 14; do té doby se odsud nic nevolá.

import { Link } from 'react-router-dom';
import { NASTAVENI_SEKCE, type NastaveniKlic } from '../../prehledFiltr';

const POPIS: Record<NastaveniKlic, string> = {
  cile: 'Cíle pro sebe, každého ze svého týmu a tým jako celek (Albert i pro kohokoli a celou firmu): hodnota prodejů, inkaso, prodané weby, hovory, zájem a odpracované hodiny. Každý super admin vidí všechny cíle.',
  naklady: 'Náklady po kategoriích (Claude, Lovable, domény, hosting, jiné), měsíčně, ročně nebo jednorázově. Částky, které čekají na ověření, jsou označené „ověřit“.',
  vyplaty: 'Výplaty provizí volajícím ze svého týmu (Albert komukoli), aby šlo vidět nárok, vyplaceno a co zbývá vyplatit.',
};

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
      <div className="card prehled-nastaveni-obsah">
        <h3 className="prehled-skupina-nadpis">{aktivni.nazev}</h3>
        <p>{POPIS[aktivni.klic]}</p>
        <p className="muted">Zadávání se připravuje.</p>
      </div>
    </section>
  );
}
