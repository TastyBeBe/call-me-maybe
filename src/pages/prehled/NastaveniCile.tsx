// CÍLE V NASTAVENÍ PŘEHLEDU (Přehled vedení úkol 14b, Albert 17. 11. 2026, D9: „each super admin sets targets for themselves, each
// member of their own team and their team as a whole; Albert also for anyone and for the whole company; every super admin sees all
// targets“; kontrakt §4.4, §3.6, R6 a R21). Seznam všech aktivních cílů (cile_seznam), u řádků, které přihlášený smí měnit
// (smi_upravit), Upravit a Zrušit…, jinak „jen ke čtení“. Formulář: metrika, pro koho (jen rozsahy, které přihlášený smí:
// prehled_moznosti firma_smim_cil, tymy[].smim_cil, lide[].smim_cil), období od – do (poslední den VČETNĚ, výchozí celý tento
// měsíc), hodnota a u peněz měna. Server odmítne jen přesný duplikát (stejná metrika, rozsah, měna i období) a jeho věta se ukáže
// u formuláře. Uložený cíl se hned projeví v Plnění cíle na Vedení (prehled_souhrn) a v trendu proti cíli.

import { useMemo } from 'react';
import { getApi, type Cil, type CilVstup, type MenaPrehledu, type MetrikaCile } from '../../api';
import { PrehledPrazdne } from '../../components/prehled/Stavy';
import { TabulkaObal } from '../../components/prehled/Tabulka';
import { casText } from '../../prehled';
import {
  castkaDoPole, castkaProServer, datumNeboNull, MENY, mesicDne, METRIKY_CILU, metrikaCile, obdobiText, poleChyby, procJenKCteniCile, rozsahCile, rozsahZVolby,
  textHodnotyCile, volbaZRozsahu, volbyRozsahuCile,
} from '../../prehledNastaveni';
import { usePrehled } from './kontext';
import {
  AkceRadku, atributyPole, ChybaFormulare, ChybaNastaveni, HlaskaNastaveni, NacitaniNastaveni, PoleFormulare, PotvrzeniZruseni, useSpravaNastaveni,
} from './NastaveniSpolecne';

/** Cíl slovy (název tlačítek, okno zrušení). */
export const popisCile = (c: Cil): string => `${metrikaCile(c.metrika)?.nazev ?? c.metrika}, ${rozsahCile(c)}, ${obdobiText(c.obdobi_od, c.obdobi_do)}, ${textHodnotyCile(c)}`;

/**
 * Tabulka cílů: kdo, co, období včetně, hodnota v jednotce cíle, kdo zadal; akce jen u řádků se smi_upravit.
 * Výslovné role tabulky (table, rowgroup, row, columnheader, rowheader, cell): telefon ji skládá do bloků (display: block)
 * a VoiceOver by ji jinak nečetl jako tabulku (recenze 14b, drobnost 6).
 */
export function TabulkaCilu({ radky, onUpravit, onZrusit }: { radky: Cil[]; onUpravit: (c: Cil, el: HTMLButtonElement) => void; onZrusit: (c: Cil, el: HTMLButtonElement) => void }) {
  return (
    <TabulkaObal popisek="Cíle">
      <table className="prehled-tabulka nastaveni-tabulka" data-tabulka="nastaveni-cile" aria-label="Cíle" role="table">
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">Co</th>
            <th scope="col" role="columnheader">Pro koho</th>
            <th scope="col" role="columnheader">Období</th>
            <th scope="col" role="columnheader" className="cislo-sloupec">Hodnota</th>
            <th scope="col" role="columnheader">Zadal</th>
            <th scope="col" role="columnheader">Akce</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {radky.map((c) => (
            <tr key={c.id} data-id={c.id} role="row">
              <th scope="row" role="rowheader" data-label="Co">{metrikaCile(c.metrika)?.nazev ?? c.metrika}</th>
              <td role="cell" data-label="Pro koho">{rozsahCile(c)}</td>
              <td role="cell" data-label="Období" className="nastaveni-datum">{obdobiText(c.obdobi_od, c.obdobi_do)}</td>
              <td role="cell" data-label="Hodnota" className="cislo-sloupec">{textHodnotyCile(c)}</td>
              <td role="cell" data-label="Zadal" className="nastaveni-zapsal">
                {c.zadal}
                <span className="prehled-bunka-pozn">{casText(c.zadano_at)}</span>
              </td>
              <td role="cell" data-label="Akce" className="nastaveni-akce">
                <AkceRadku co="cíl" popis={popisCile(c)} smi={c.smi_upravit} proc={procJenKCteniCile(c)}
                  onUpravit={(el) => onUpravit(c, el)} onZrusit={(el) => onZrusit(c, el)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TabulkaObal>
  );
}

interface FormularCile {
  id: number | null;
  metrika: MetrikaCile;
  rozsah: string;
  od: string;
  do: string;
  mena: MenaPrehledu;
  hodnota: string;
}

export default function NastaveniCile() {
  const { moznosti, dnes } = usePrehled();
  const volby = useMemo(() => volbyRozsahuCile(moznosti.data), [moznosti.data]);
  const s = useSpravaNastaveni<Cil, FormularCile>({
    nacti: (t) => getApi().cileSeznam(t),
    uloz: (t, f) => {
      const def = metrikaCile(f.metrika);
      const vstup: CilVstup = {
        ...(f.id !== null ? { id: f.id } : {}), metrika: f.metrika, obdobi_od: datumNeboNull(f.od), obdobi_do: datumNeboNull(f.do), ...rozsahZVolby(f.rozsah),
        mena: def?.vMene ? f.mena : null, hodnota: castkaProServer(f.hodnota),
      };
      return getApi().cileUloz(t, vstup);
    },
    zrus: (t, id) => getApi().cileZrus(t, id),
    ulozeno: 'Cíl uložen.',
    zruseno: 'Cíl zrušen.',
  });
  const f = s.formular;
  const def = f ? metrikaCile(f.metrika) : null;
  const chybnePole = poleChyby(s.chyba, 'cil');
  const ID_CHYBY = 'cil-chyba';
  const novy = (): FormularCile => ({ id: null, metrika: 'hodnota_prodeju', rozsah: volby[0]?.hodnota ?? 'firma', ...mesicDne(dnes), mena: 'CZK', hodnota: '' });
  const zRadku = (c: Cil): FormularCile => ({ id: c.id, metrika: c.metrika, rozsah: volbaZRozsahu(c), od: c.obdobi_od, do: c.obdobi_do, mena: c.mena ?? 'CZK', hodnota: castkaDoPole(c.hodnota) });
  const albert = moznosti.data.ja.je_albert;
  const jednotka = def?.vMene ? null : f?.metrika === 'odpracovane_hodiny' ? 'hodiny' : 'počet';
  return (
    <>
      <div className="prehled-blok-hlava">
        <h3 className="prehled-blok-nadpis" id="nastaveni-cile-nadpis">Cíle</h3>
        <button type="button" className="pill-btn go sm" data-akce="pridat" data-sfx="none" ref={s.pridat} disabled={volby.length === 0}
          onClick={(e) => s.otevrit(novy(), e.currentTarget)}>
          Přidat cíl
        </button>
      </div>
      <p className="prehled-blok-popis">
        {albert
          ? 'Cíl zadáte komukoli, kterémukoli týmu i celé firmě. Každý super admin vidí všechny cíle.'
          : 'Cíl zadáte sobě, každému ze svého týmu a týmu jako celku; cíl firmy zadává Albert. Každý super admin vidí všechny cíle.'}{' '}
        Plnění cíle počítá cíl, jehož období celé období filtru obsahuje, pro stejný výběr lidí; cíl člověka a cíl týmu se nesčítají.
      </p>
      <HlaskaNastaveni text={s.hlaska} />
      {f && (
        <form className="nastaveni-formular" data-formular="cil" onSubmit={(e) => void s.ulozit(e)} aria-labelledby="cil-formular-nadpis" noValidate>
          <h4 className="nastaveni-formular-nadpis" id="cil-formular-nadpis">{f.id === null ? 'Nový cíl' : 'Upravit cíl'}</h4>
          <div className="nastaveni-mrizka">
            <PoleFormulare id="cil-metrika" popisek="Co" povinne>
              <select id="cil-metrika" ref={s.prvniPole} value={f.metrika} onChange={(e) => s.zmenit({ metrika: e.target.value as MetrikaCile })} {...atributyPole('metrika', 'cil-metrika', chybnePole, ID_CHYBY)}>
                {METRIKY_CILU.map((m) => <option key={m.klic} value={m.klic}>{m.nazev}</option>)}
              </select>
            </PoleFormulare>
            <PoleFormulare id="cil-rozsah" popisek="Pro koho" povinne napoveda="Tým = jeho super admin a všichni, koho má pod sebou.">
              <select id="cil-rozsah" value={f.rozsah} onChange={(e) => s.zmenit({ rozsah: e.target.value })} {...atributyPole('rozsah', 'cil-rozsah', chybnePole, ID_CHYBY, true)}>
                {volby.some((v) => v.skupina === 'firma') && <option value="firma">Celá firma</option>}
                {volby.some((v) => v.skupina === 'tym') && (
                  <optgroup label="Týmy">
                    {volby.filter((v) => v.skupina === 'tym').map((v) => <option key={v.hodnota} value={v.hodnota}>{v.nazev}</option>)}
                  </optgroup>
                )}
                {volby.some((v) => v.skupina === 'osoba') && (
                  <optgroup label="Lidé">
                    {volby.filter((v) => v.skupina === 'osoba').map((v) => <option key={v.hodnota} value={v.hodnota}>{v.nazev}</option>)}
                  </optgroup>
                )}
              </select>
            </PoleFormulare>
            <PoleFormulare id="cil-od" popisek="Od" povinne>
              <input id="cil-od" type="date" value={f.od} onChange={(e) => s.zmenit({ od: e.target.value })} {...atributyPole('obdobi_od', 'cil-od', chybnePole, ID_CHYBY)} />
            </PoleFormulare>
            <PoleFormulare id="cil-do" popisek="Do (včetně)" povinne>
              <input id="cil-do" type="date" value={f.do} onChange={(e) => s.zmenit({ do: e.target.value })} {...atributyPole('obdobi_do', 'cil-do', chybnePole, ID_CHYBY)} />
            </PoleFormulare>
            <PoleFormulare id="cil-hodnota" popisek={def?.vMene ? 'Hodnota' : `Hodnota (${jednotka})`} povinne
              napoveda={def?.celeCislo ? 'Celé číslo.' : def?.vMene ? 'Částka, třeba 50 000 nebo 1 234,50.' : 'Třeba 40 nebo 30,5.'}>
              <input id="cil-hodnota" type="text" inputMode="decimal" autoComplete="off" value={f.hodnota} onChange={(e) => s.zmenit({ hodnota: e.target.value })}
                {...atributyPole('hodnota', 'cil-hodnota', chybnePole, ID_CHYBY, true)} />
            </PoleFormulare>
            {def?.vMene && (
              <PoleFormulare id="cil-mena" popisek="Měna" povinne>
                <select id="cil-mena" value={f.mena} onChange={(e) => s.zmenit({ mena: e.target.value as MenaPrehledu })} {...atributyPole('mena', 'cil-mena', chybnePole, ID_CHYBY)}>
                  {MENY.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </PoleFormulare>
            )}
          </div>
          <ChybaFormulare id={ID_CHYBY} text={s.chyba} />
          <div className="edit-actions nastaveni-formular-tlacitka">
            <button type="submit" className="pill-btn go sm" disabled={s.busy} data-sfx="none">{s.busy ? 'Ukládám…' : 'Uložit cíl'}</button>
            <button type="button" className="pill-btn sm" data-akce="zpet" disabled={s.busy} data-sfx="none" onClick={s.zavrit}>Zpět</button>
          </div>
        </form>
      )}
      {s.seznam.chyba ? (
        <ChybaNastaveni text={s.seznam.chyba} onZnovu={s.seznam.znovu} />
      ) : !s.seznam.radky ? (
        <NacitaniNastaveni text="Načítám cíle…" />
      ) : s.seznam.radky.length === 0 ? (
        <PrehledPrazdne nadpis="Zatím žádný cíl." text="Přidejte první tlačítkem „Přidat cíl“." />
      ) : (
        <div className={s.seznam.nacita ? 'prepocitava' : undefined} aria-busy={s.seznam.nacita}>
          <TabulkaCilu radky={s.seznam.radky} onUpravit={(c, el) => s.otevrit(zRadku(c), el)} onZrusit={(c) => s.zacitRusit(c)} />
        </div>
      )}
      {s.rusit && (
        <PotvrzeniZruseni nadpis="Zrušit cíl?" popis={popisCile(s.rusit)} dusledek="Zrušený cíl zmizí ze seznamu i z plnění cíle; v historii změn zůstane."
          potvrdit="Zrušit cíl" busy={s.busyRuseni} chyba={s.chybaRuseni} onPotvrdit={() => void s.potvrditRuseni()} onZpet={s.zpetRuseni} />
      )}
    </>
  );
}
