// NÁKLADY V NASTAVENÍ PŘEHLEDU (Přehled vedení úkol 14b, Albert 17. 11. 2026, D6: „All of these should be separate stats … the domain
// hosting, the callers' commission … visible for all of these things individually and together“; kontrakt §4.3, §3.5, §2.12, R6
// a R7). Evidence nákladů (naklady_seznam): pět kategorií (Claude, Lovable, domény, hosting, jiné; provize se počítá z prodejů,
// sem nepatří), částka ve své měně (CZK a EUR nikdy sečtené), opakování a platnost od – do (poslední den VČETNĚ), klient
// u domény nebo hostingu, „ověřit“ u částky, která čeká na ověření. Každý super admin smí přidat, upravit i zrušit každý řádek;
// zrušení až po potvrzení. Uložený náklad je hned v Nákladech celkem a v kategorii na záložce Finance (prehled_finance).

import { getApi, type MenaPrehledu, type Naklad, type NakladVstup, type KategorieNakladu, type OpakovaniNakladu } from '../../api';
import { PrehledPrazdne } from '../../components/prehled/Stavy';
import { TabulkaObal } from '../../components/prehled/Tabulka';
import { casText, formatCastka } from '../../prehled';
import { castkaDoPole, castkaProServer, datumNeboNull, KATEGORIE_NAKLADU, MENY, nazevKategorie, nazevOpakovani, obdobiText, OPAKOVANI_NAKLADU, poleChyby } from '../../prehledNastaveni';
import { usePrehled } from './kontext';
import {
  AkceRadku, atributyPole, ChybaFormulare, ChybaNastaveni, HlaskaNastaveni, NacitaniNastaveni, PoleFormulare, PotvrzeniZruseni, useSpravaNastaveni,
} from './NastaveniSpolecne';

/** Platnost nákladu: jednorázový den platby, jinak od – do včetně („od …“ bez konce). */
export const platnostNakladu = (n: Pick<Naklad, 'opakovani' | 'plati_od' | 'plati_do'>): string =>
  n.opakovani === 'jednorazove' ? obdobiText(n.plati_od, n.plati_od) : obdobiText(n.plati_od, n.plati_do);
/** Náklad slovy (název tlačítek, okno zrušení). */
export const popisNakladu = (n: Naklad): string =>
  [nazevKategorie(n.kategorie), formatCastka(n.castka, n.mena), nazevOpakovani(n.opakovani), platnostNakladu(n), n.popis].filter(Boolean).join(', ');

/**
 * Tabulka nákladů: každá částka ve své měně (nikdy sečtené), „ověřit“ jen u řádků k ověření.
 * Výslovné role tabulky (table, rowgroup, row, columnheader, rowheader, cell): telefon ji skládá do bloků (display: block)
 * a VoiceOver by ji jinak nečetl jako tabulku (recenze 14b, drobnost 6).
 */
export function TabulkaNakladu({ radky, onUpravit, onZrusit }: { radky: Naklad[]; onUpravit: (n: Naklad, el: HTMLButtonElement) => void; onZrusit: (n: Naklad, el: HTMLButtonElement) => void }) {
  return (
    <TabulkaObal popisek="Náklady">
      <table className="prehled-tabulka nastaveni-tabulka" data-tabulka="nastaveni-naklady" aria-label="Náklady" role="table">
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">Kategorie</th>
            <th scope="col" role="columnheader">Popis a klient</th>
            <th scope="col" role="columnheader" className="cislo-sloupec">Částka</th>
            <th scope="col" role="columnheader">Opakování</th>
            <th scope="col" role="columnheader">Platí</th>
            <th scope="col" role="columnheader">Zapsal</th>
            <th scope="col" role="columnheader">Akce</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {radky.map((n) => (
            <tr key={n.id} data-id={n.id} role="row">
              <th scope="row" role="rowheader" data-label="Kategorie">
                {nazevKategorie(n.kategorie)}
                {n.overit && <span className="prehled-znacka overit-znacka" title="Částka čeká na ověření.">ověřit</span>}
              </th>
              <td role="cell" data-label="Popis a klient">
                {n.popis ?? <span className="muted">bez popisu</span>}
                {n.kontakt_id !== null && <span className="prehled-bunka-pozn">klient {n.kontakt_jmeno ?? `#${n.kontakt_id}`}</span>}
              </td>
              <td role="cell" data-label="Částka" className="cislo-sloupec">{formatCastka(n.castka, n.mena)}</td>
              <td role="cell" data-label="Opakování">{nazevOpakovani(n.opakovani)}</td>
              <td role="cell" data-label="Platí" className="nastaveni-datum">{platnostNakladu(n)}</td>
              <td role="cell" data-label="Zapsal" className="nastaveni-zapsal">
                {n.zapsal}
                <span className="prehled-bunka-pozn">{casText(n.zapsano_at)}</span>
              </td>
              <td role="cell" data-label="Akce" className="nastaveni-akce">
                <AkceRadku co="náklad" popis={popisNakladu(n)} smi proc="" onUpravit={(el) => onUpravit(n, el)} onZrusit={(el) => onZrusit(n, el)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TabulkaObal>
  );
}

interface FormularNakladu {
  id: number | null;
  kategorie: KategorieNakladu;
  popis: string;
  castka: string;
  mena: MenaPrehledu;
  opakovani: OpakovaniNakladu;
  od: string;
  do: string;
  kontakt: string;
  overit: boolean;
}

export default function NastaveniNaklady() {
  const { dnes } = usePrehled();
  const s = useSpravaNastaveni<Naklad, FormularNakladu>({
    nacti: (t) => getApi().nakladySeznam(t),
    uloz: (t, f) => {
      const kontakt = f.kontakt.trim().replace(/^#/, '');
      const vstup: NakladVstup = {
        ...(f.id !== null ? { id: f.id } : {}), kategorie: f.kategorie, popis: f.popis.trim() || null, castka: castkaProServer(f.castka), mena: f.mena, opakovani: f.opakovani,
        plati_od: datumNeboNull(f.od), plati_do: f.opakovani === 'jednorazove' ? null : datumNeboNull(f.do),
        // číslo klienta: jen číslice jdou jako číslo, cokoli jiného serveru, jak je (odmítne ho „Kontakt id=… neexistuje.“)
        kontakt_id: kontakt === '' ? null : /^\d+$/.test(kontakt) ? Number(kontakt) : kontakt,
        overit: f.overit,
      };
      return getApi().nakladyUloz(t, vstup);
    },
    zrus: (t, id) => getApi().nakladyZrus(t, id),
    ulozeno: 'Náklad uložen.',
    zruseno: 'Náklad zrušen.',
  });
  const f = s.formular;
  const chybnePole = poleChyby(s.chyba, 'naklad');
  const ID_CHYBY = 'naklad-chyba';
  const novy = (): FormularNakladu => ({ id: null, kategorie: 'claude', popis: '', castka: '', mena: 'CZK', opakovani: 'mesicne', od: dnes, do: '', kontakt: '', overit: false });
  const zRadku = (n: Naklad): FormularNakladu => ({
    id: n.id, kategorie: n.kategorie, popis: n.popis ?? '', castka: castkaDoPole(n.castka), mena: n.mena, opakovani: n.opakovani, od: n.plati_od, do: n.plati_do ?? '',
    kontakt: n.kontakt_id === null ? '' : String(n.kontakt_id), overit: n.overit,
  });
  const jednorazovy = f?.opakovani === 'jednorazove';
  return (
    <>
      <div className="prehled-blok-hlava">
        <h3 className="prehled-blok-nadpis" id="nastaveni-naklady-nadpis">Náklady</h3>
        <button type="button" className="pill-btn go sm" data-akce="pridat" data-sfx="none" ref={s.pridat} onClick={(e) => s.otevrit(novy(), e.currentTarget)}>
          Přidat náklad
        </button>
      </div>
      <p className="prehled-blok-popis">
        Náklady po kategoriích, měsíčně, ročně nebo jednorázově; každá částka ve své měně (koruny a eura se nikdy nesčítají). Měsíční
        náklad se počítá celý v každém měsíci platnosti, roční po dvanáctinách, jednorázový v den platby. Částky, které čekají na
        ověření, jsou označené „ověřit“. Provize se počítá z prodejů sama. Každý super admin smí přidat, upravit i zrušit každý náklad.
      </p>
      <HlaskaNastaveni text={s.hlaska} />
      {f && (
        <form className="nastaveni-formular" data-formular="naklad" onSubmit={(e) => void s.ulozit(e)} aria-labelledby="naklad-formular-nadpis" noValidate>
          <h4 className="nastaveni-formular-nadpis" id="naklad-formular-nadpis">{f.id === null ? 'Nový náklad' : 'Upravit náklad'}</h4>
          <div className="nastaveni-mrizka">
            <PoleFormulare id="naklad-kategorie" popisek="Kategorie" povinne>
              <select id="naklad-kategorie" ref={s.prvniPole} value={f.kategorie} onChange={(e) => s.zmenit({ kategorie: e.target.value as KategorieNakladu })}
                {...atributyPole('kategorie', 'naklad-kategorie', chybnePole, ID_CHYBY)}>
                {KATEGORIE_NAKLADU.map((k) => <option key={k.klic} value={k.klic}>{k.nazev}</option>)}
              </select>
            </PoleFormulare>
            <PoleFormulare id="naklad-castka" popisek="Částka" povinne napoveda="Třeba 5 000 nebo 290,50.">
              <input id="naklad-castka" type="text" inputMode="decimal" autoComplete="off" value={f.castka} onChange={(e) => s.zmenit({ castka: e.target.value })}
                {...atributyPole('castka', 'naklad-castka', chybnePole, ID_CHYBY, true)} />
            </PoleFormulare>
            <PoleFormulare id="naklad-mena" popisek="Měna" povinne>
              <select id="naklad-mena" value={f.mena} onChange={(e) => s.zmenit({ mena: e.target.value as MenaPrehledu })} {...atributyPole('mena', 'naklad-mena', chybnePole, ID_CHYBY)}>
                {MENY.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </PoleFormulare>
            <PoleFormulare id="naklad-opakovani" popisek="Opakování" povinne>
              <select id="naklad-opakovani" value={f.opakovani} onChange={(e) => s.zmenit({ opakovani: e.target.value as OpakovaniNakladu })}
                {...atributyPole('opakovani', 'naklad-opakovani', chybnePole, ID_CHYBY)}>
                {OPAKOVANI_NAKLADU.map((o) => <option key={o.klic} value={o.klic}>{o.nazev}</option>)}
              </select>
            </PoleFormulare>
            <PoleFormulare id="naklad-od" popisek={jednorazovy ? 'Den platby' : 'Platí od'} povinne>
              <input id="naklad-od" type="date" value={f.od} onChange={(e) => s.zmenit({ od: e.target.value })} {...atributyPole('plati_od', 'naklad-od', chybnePole, ID_CHYBY)} />
            </PoleFormulare>
            {!jednorazovy && (
              <PoleFormulare id="naklad-do" popisek="Platí do (včetně)" napoveda="Prázdné = platí dál.">
                <input id="naklad-do" type="date" value={f.do} onChange={(e) => s.zmenit({ do: e.target.value })} {...atributyPole('plati_do', 'naklad-do', chybnePole, ID_CHYBY, true)} />
              </PoleFormulare>
            )}
            <PoleFormulare id="naklad-popis" popisek="Popis" napoveda="Nepovinné, nejvýš 300 znaků.">
              <input id="naklad-popis" type="text" maxLength={300} autoComplete="off" value={f.popis} onChange={(e) => s.zmenit({ popis: e.target.value })}
                {...atributyPole('popis', 'naklad-popis', chybnePole, ID_CHYBY, true)} />
            </PoleFormulare>
            <PoleFormulare id="naklad-kontakt" popisek="Číslo klienta" napoveda="Nepovinné: u domény nebo hostingu číslo klienta (#) z jeho detailu.">
              <input id="naklad-kontakt" type="text" inputMode="numeric" autoComplete="off" value={f.kontakt} onChange={(e) => s.zmenit({ kontakt: e.target.value })}
                {...atributyPole('kontakt_id', 'naklad-kontakt', chybnePole, ID_CHYBY, true)} />
            </PoleFormulare>
          </div>
          <label className="checkbox-row nastaveni-overit" htmlFor="naklad-overit">
            <input id="naklad-overit" type="checkbox" checked={f.overit} onChange={(e) => s.zmenit({ overit: e.target.checked })} />
            Částka čeká na ověření („ověřit“)
          </label>
          <ChybaFormulare id={ID_CHYBY} text={s.chyba} />
          <div className="edit-actions nastaveni-formular-tlacitka">
            <button type="submit" className="pill-btn go sm" disabled={s.busy} data-sfx="none">{s.busy ? 'Ukládám…' : 'Uložit náklad'}</button>
            <button type="button" className="pill-btn sm" data-akce="zpet" disabled={s.busy} data-sfx="none" onClick={s.zavrit}>Zpět</button>
          </div>
        </form>
      )}
      {s.seznam.chyba ? (
        <ChybaNastaveni text={s.seznam.chyba} onZnovu={s.seznam.znovu} />
      ) : !s.seznam.radky ? (
        <NacitaniNastaveni text="Načítám náklady…" />
      ) : s.seznam.radky.length === 0 ? (
        <PrehledPrazdne nadpis="Zatím žádný náklad." text="Přidejte první tlačítkem „Přidat náklad“." />
      ) : (
        <div className={s.seznam.nacita ? 'prepocitava' : undefined} aria-busy={s.seznam.nacita}>
          <TabulkaNakladu radky={s.seznam.radky} onUpravit={(n, el) => s.otevrit(zRadku(n), el)} onZrusit={(n) => s.zacitRusit(n)} />
        </div>
      )}
      {s.rusit && (
        <PotvrzeniZruseni nadpis="Zrušit náklad?" popis={popisNakladu(s.rusit)}
          dusledek="Zrušený náklad se přestane počítat do Nákladů celkem i do své kategorie; v historii změn zůstane."
          potvrdit="Zrušit náklad" busy={s.busyRuseni} chyba={s.chybaRuseni} onPotvrdit={() => void s.potvrditRuseni()} onZpet={s.zpetRuseni} />
      )}
    </>
  );
}
