// VÝPLATY PROVIZÍ V NASTAVENÍ PŘEHLEDU (Přehled vedení úkol 14b, Albert 17. 11. 2026, D10: super admini zapisují výplatu provize
// volajícímu ze svého týmu, Albert komukoli, aby šlo vidět nárok, vyplaceno a co zbývá; kontrakt §4.5, R6 a R7). Seznam všech
// aktivních výplat (provize_vyplaty_seznam; každý super admin vidí všechny), u výplat lidí, kterým přihlášený smí výplatu zapsat
// (prehled_moznosti lide[].smim_vyplatu: jeho tým, Albert každého), Upravit a Zrušit…, jinak „jen ke čtení“. Formulář: komu (jen
// lidé, kterým smí), částka a měna, den výplaty (výchozí dnes), za období od – do (včetně, nepovinné) a poznámka. Uložená
// výplata se hned projeví v Provize vyplaceno a zbývá (Finance, Lidé a volání).

import { useMemo } from 'react';
import { getApi, type MenaPrehledu, type Vyplata, type VyplataVstup } from '../../api';
import { PrehledPrazdne } from '../../components/prehled/Stavy';
import { TabulkaObal } from '../../components/prehled/Tabulka';
import { casText, denText, formatCastka } from '../../prehled';
import { castkaDoPole, castkaProServer, datumNeboNull, jmenoOsoby, lideProVyplatu, MENY, obdobiText, poleChyby, smiVyplatu, vychoziPrijemceVyplaty } from '../../prehledNastaveni';
import { usePrehled } from './kontext';
import {
  AkceRadku, atributyPole, ChybaFormulare, ChybaNastaveni, HlaskaNastaveni, NacitaniNastaveni, PoleFormulare, PotvrzeniZruseni, useSpravaNastaveni,
} from './NastaveniSpolecne';

/** Výplata slovy (název tlačítek, okno zrušení). */
export const popisVyplaty = (v: Vyplata): string => [v.jmeno, formatCastka(v.castka, v.mena), `vyplaceno ${denText(v.vyplaceno_dne)}`, v.poznamka].filter(Boolean).join(', ');

/**
 * Tabulka výplat: částka ve své měně, den výplaty, za období včetně; akce jen u výplat lidí, kterým přihlášený smí výplatu zapsat.
 * Výslovné role tabulky (table, rowgroup, row, columnheader, rowheader, cell): telefon ji skládá do bloků (display: block)
 * a VoiceOver by ji jinak nečetl jako tabulku (recenze 14b, drobnost 6).
 */
export function TabulkaVyplat({ radky, smi, onUpravit, onZrusit }: {
  radky: Vyplata[];
  smi: (v: Vyplata) => boolean;
  onUpravit: (v: Vyplata, el: HTMLButtonElement) => void;
  onZrusit: (v: Vyplata, el: HTMLButtonElement) => void;
}) {
  return (
    <TabulkaObal popisek="Výplaty provizí">
      <table className="prehled-tabulka nastaveni-tabulka" data-tabulka="nastaveni-vyplaty" aria-label="Výplaty provizí" role="table">
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">Komu</th>
            <th scope="col" role="columnheader" className="cislo-sloupec">Částka</th>
            <th scope="col" role="columnheader">Vyplaceno</th>
            <th scope="col" role="columnheader">Za období</th>
            <th scope="col" role="columnheader">Poznámka</th>
            <th scope="col" role="columnheader">Zapsal</th>
            <th scope="col" role="columnheader">Akce</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {radky.map((v) => (
            <tr key={v.id} data-id={v.id} role="row">
              <th scope="row" role="rowheader" data-label="Komu">{v.jmeno}</th>
              <td role="cell" data-label="Částka" className="cislo-sloupec">{formatCastka(v.castka, v.mena)}</td>
              <td role="cell" data-label="Vyplaceno" className="nastaveni-datum">{denText(v.vyplaceno_dne)}</td>
              <td role="cell" data-label="Za období" className="nastaveni-datum">{obdobiText(v.za_obdobi_od, v.za_obdobi_do)}</td>
              <td role="cell" data-label="Poznámka">{v.poznamka ?? <span className="muted">—</span>}</td>
              <td role="cell" data-label="Zapsal" className="nastaveni-zapsal">
                {v.zapsal}
                <span className="prehled-bunka-pozn">{casText(v.zapsano_at)}</span>
              </td>
              <td role="cell" data-label="Akce" className="nastaveni-akce">
                <AkceRadku co="výplatu" popis={popisVyplaty(v)} smi={smi(v)} proc="Výplatu tohoto člověka zapisuje jen jeho super admin nebo Albert."
                  onUpravit={(el) => onUpravit(v, el)} onZrusit={(el) => onZrusit(v, el)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TabulkaObal>
  );
}

interface FormularVyplaty {
  id: number | null;
  komu: number;
  castka: string;
  mena: MenaPrehledu;
  dne: string;
  od: string;
  do: string;
  poznamka: string;
}

export default function NastaveniVyplaty() {
  const { moznosti, dnes } = usePrehled();
  const lide = useMemo(() => lideProVyplatu(moznosti.data), [moznosti.data]);
  const s = useSpravaNastaveni<Vyplata, FormularVyplaty>({
    nacti: (t) => getApi().provizeVyplatySeznam(t),
    uloz: (t, f) => {
      const vstup: VyplataVstup = {
        ...(f.id !== null ? { id: f.id } : {}), user_id: f.komu, castka: castkaProServer(f.castka), mena: f.mena, vyplaceno_dne: datumNeboNull(f.dne),
        za_obdobi_od: datumNeboNull(f.od), za_obdobi_do: datumNeboNull(f.do), poznamka: f.poznamka.trim() || null,
      };
      return getApi().provizeVyplataUloz(t, vstup);
    },
    zrus: (t, id) => getApi().provizeVyplataZrus(t, id),
    ulozeno: 'Výplata uložena.',
    zruseno: 'Výplata zrušena.',
  });
  const f = s.formular;
  const chybnePole = poleChyby(s.chyba, 'vyplata');
  const ID_CHYBY = 'vyplata-chyba';
  // výchozí příjemce: první Volající, kterému smí (výplata jde obvykle volajícímu), jinak první ze seznamu (úkol 14c: přes
  // isSuperAdmin ve vychoziPrijemceVyplaty, ⚠ NAHRAZUJE přímé porovnání role s klíčem admin, které hlásila kontrola pravidel 49 b)
  const novy = (): FormularVyplaty => ({ id: null, komu: vychoziPrijemceVyplaty(lide), castka: '', mena: 'CZK', dne: dnes, od: '', do: '', poznamka: '' });
  const zRadku = (v: Vyplata): FormularVyplaty => ({
    id: v.id, komu: v.user_id, castka: castkaDoPole(v.castka), mena: v.mena, dne: v.vyplaceno_dne, od: v.za_obdobi_od ?? '', do: v.za_obdobi_do ?? '', poznamka: v.poznamka ?? '',
  });
  const albert = moznosti.data.ja.je_albert;
  return (
    <>
      <div className="prehled-blok-hlava">
        <h3 className="prehled-blok-nadpis" id="nastaveni-vyplaty-nadpis">Výplaty provizí</h3>
        <button type="button" className="pill-btn go sm" data-akce="pridat" data-sfx="none" ref={s.pridat} disabled={lide.length === 0}
          onClick={(e) => s.otevrit(novy(), e.currentTarget)}>
          Přidat výplatu
        </button>
      </div>
      <p className="prehled-blok-popis">
        {albert ? 'Výplatu provize zapíšete komukoli.' : 'Výplatu provize zapíšete sobě a lidem svého týmu; ostatní zapisuje jejich super admin nebo Albert.'}{' '}
        Nárok, vyplaceno a co zbývá vyplatit jsou ve Financích a v Lidech a volání zvlášť; každá částka ve své měně.
      </p>
      <HlaskaNastaveni text={s.hlaska} />
      {f && (
        <form className="nastaveni-formular" data-formular="vyplata" onSubmit={(e) => void s.ulozit(e)} aria-labelledby="vyplata-formular-nadpis" noValidate>
          <h4 className="nastaveni-formular-nadpis" id="vyplata-formular-nadpis">{f.id === null ? 'Nová výplata provize' : 'Upravit výplatu provize'}</h4>
          <div className="nastaveni-mrizka">
            <PoleFormulare id="vyplata-komu" popisek="Komu" povinne>
              <select id="vyplata-komu" ref={s.prvniPole} value={String(f.komu)} onChange={(e) => s.zmenit({ komu: Number(e.target.value) })}
                {...atributyPole('user_id', 'vyplata-komu', chybnePole, ID_CHYBY)}>
                {lide.map((l) => <option key={l.id} value={l.id}>{jmenoOsoby(l)}</option>)}
              </select>
            </PoleFormulare>
            <PoleFormulare id="vyplata-castka" popisek="Částka" povinne napoveda="Třeba 1 470 nebo 20,50.">
              <input id="vyplata-castka" type="text" inputMode="decimal" autoComplete="off" value={f.castka} onChange={(e) => s.zmenit({ castka: e.target.value })}
                {...atributyPole('castka', 'vyplata-castka', chybnePole, ID_CHYBY, true)} />
            </PoleFormulare>
            <PoleFormulare id="vyplata-mena" popisek="Měna" povinne>
              <select id="vyplata-mena" value={f.mena} onChange={(e) => s.zmenit({ mena: e.target.value as MenaPrehledu })} {...atributyPole('mena', 'vyplata-mena', chybnePole, ID_CHYBY)}>
                {MENY.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </PoleFormulare>
            <PoleFormulare id="vyplata-dne" popisek="Vyplaceno dne" povinne>
              <input id="vyplata-dne" type="date" value={f.dne} onChange={(e) => s.zmenit({ dne: e.target.value })} {...atributyPole('vyplaceno_dne', 'vyplata-dne', chybnePole, ID_CHYBY)} />
            </PoleFormulare>
            <PoleFormulare id="vyplata-od" popisek="Za období od" napoveda="Nepovinné.">
              <input id="vyplata-od" type="date" value={f.od} onChange={(e) => s.zmenit({ od: e.target.value })} {...atributyPole('za_obdobi_od', 'vyplata-od', chybnePole, ID_CHYBY, true)} />
            </PoleFormulare>
            <PoleFormulare id="vyplata-do" popisek="Za období do (včetně)" napoveda="Nepovinné.">
              <input id="vyplata-do" type="date" value={f.do} onChange={(e) => s.zmenit({ do: e.target.value })} {...atributyPole('za_obdobi_do', 'vyplata-do', chybnePole, ID_CHYBY, true)} />
            </PoleFormulare>
            <PoleFormulare id="vyplata-poznamka" popisek="Poznámka" napoveda="Nepovinné, nejvýš 300 znaků.">
              <input id="vyplata-poznamka" type="text" maxLength={300} autoComplete="off" value={f.poznamka} onChange={(e) => s.zmenit({ poznamka: e.target.value })}
                {...atributyPole('poznamka', 'vyplata-poznamka', chybnePole, ID_CHYBY, true)} />
            </PoleFormulare>
          </div>
          <ChybaFormulare id={ID_CHYBY} text={s.chyba} />
          <div className="edit-actions nastaveni-formular-tlacitka">
            <button type="submit" className="pill-btn go sm" disabled={s.busy} data-sfx="none">{s.busy ? 'Ukládám…' : 'Uložit výplatu'}</button>
            <button type="button" className="pill-btn sm" data-akce="zpet" disabled={s.busy} data-sfx="none" onClick={s.zavrit}>Zpět</button>
          </div>
        </form>
      )}
      {s.seznam.chyba ? (
        <ChybaNastaveni text={s.seznam.chyba} onZnovu={s.seznam.znovu} />
      ) : !s.seznam.radky ? (
        <NacitaniNastaveni text="Načítám výplaty provizí…" />
      ) : s.seznam.radky.length === 0 ? (
        <PrehledPrazdne nadpis="Zatím žádná výplata provize." text="Přidejte první tlačítkem „Přidat výplatu“." />
      ) : (
        <div className={s.seznam.nacita ? 'prepocitava' : undefined} aria-busy={s.seznam.nacita}>
          <TabulkaVyplat radky={s.seznam.radky} smi={(v) => smiVyplatu(moznosti.data, v.user_id)} onUpravit={(v, el) => s.otevrit(zRadku(v), el)} onZrusit={(v) => s.zacitRusit(v)} />
        </div>
      )}
      {s.rusit && (
        <PotvrzeniZruseni nadpis="Zrušit výplatu?" popis={popisVyplaty(s.rusit)}
          dusledek="Zrušená výplata se přestane počítat do Provize vyplaceno a do toho, co zbývá vyplatit; v historii změn zůstane."
          potvrdit="Zrušit výplatu" busy={s.busyRuseni} chyba={s.chybaRuseni} onPotvrdit={() => void s.potvrditRuseni()} onZpet={s.zpetRuseni} />
      )}
    </>
  );
}
