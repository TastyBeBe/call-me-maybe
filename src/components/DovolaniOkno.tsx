// „ZAVOLAL/A JSEM“ U OZNAČENÉHO KLIENTA (migrace 060, Albert 1. 11. 2026: „a proper menu: didn't reach him / client doesn't
// want the website / client doesn't want to be contacted / we spoke — write down what the client wants (the automation
// acts on it)“). Okno s výsledky, poznámkou a hvězdou volá zapis_hovor. Druhý hovor NENÍ nový hovor ve statistikách („as one
// call and as one client still“): server nepíše call_log, Rozvrh ani výdělek se nemění. Lhůta ve stage 1 bez slibu
// e-mailu („Lhůta na zavolání do …“; připomínka e-mailem přijde až ve stage 2). Super admin navíc „Zrušit označení“.
// ⚠ Migrace 061 (Albert 2. 11. 2026: „there are currently only four options … there should definitely be also a note below it
// where you can write a note for the automation … these four options. Plus … one more option which says none of it above.
// And plus there should be a note and you should be able to write down the note when you hit the I called them button“)
// NAHRAZUJE „okno se čtyřmi výsledky, text jen u Mluvili jsme a důvod“: pět výsledků (pátý „Nic z toho výše“, jine) a pole
// „Poznámka pro automatizaci“ pod nimi vždy, i před výběrem; povinná u „Mluvili jsme“ a „Nic z toho výše“, jinak nepovinná,
// nejvýš 450 znaků u Nechce web a Nechce, abychom ho kontaktovali (server ji dává i do důvodu změny stavu), jinak 2 000.
// Poznámka jde serveru u KAŽDÉHO výsledku: s právem kontakt upravit ji automatizace dostane jako u „Mluvili jsme“ (řádek
// v poznámce kontaktu a vzkaz do vlákna), bez něj zůstane jen v události dovolani, kterou appka nikde neukazuje
// (poznamka_predana false, okno to řekne; recenze 2. 11. 2026: ⚠ NAHRAZUJE větu o historii, kterou appka nemá).
// „Nedovolal/a jsem se“ označení neruší (Albert 2. 11. 2026: „it shouldn't be removing the mark“), jen přičte pokus.
// Obě okna jdou přes createPortal do body: z detailu (PrehledPanel v drawer, z-index 50) by jinak byla pod sloupcem
// prasátka (z-index 1001) a ten zakrýval levý kraj voleb; okno je sloupec, posouvá se jen jeho tělo, chyba a tlačítka zůstávají.

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getApi, type Kontakt, type OznaceniKategorie, type VysledekDovolani } from '../api';
import { audio } from '../audio';
import { useSession } from '../auth';
import { HvezdaIcon } from '../icons';
import { ErrorBox, OZNACENI_HINTS, OZNACENI_LABELS, errMsg, kontaktJmeno, lhutaText, useOkno } from '../ui';

/** Nejvýš znaků poznámky dovolání (jako poznámka z hovoru v resolve_call, 2 000). */
export const DOVOLANI_MAX = 2000;

/**
 * Nejvýš znaků důvodu u „Nechce web“ a „Nechce, abychom ho kontaktovali“: server ho s úvodem „Dovolání: …“ ukládá jako důvod
 * změny stavu (nejvýš 500), proto víc než 450 odmítne (zapis_hovor; recenze 2. 11. 2026).
 */
export const DOVOLANI_DUVOD_MAX = 450;

/** Kolik znaků poznámky výsledek pustí: nechce a nekontaktovat 450, ostatní (i bez výběru) 2 000 (jako server). */
export function dovolaniMax(v: VysledekDovolani | null): number {
  return v === 'nechce' || v === 'nekontaktovat' ? DOVOLANI_DUVOD_MAX : DOVOLANI_MAX;
}

export const DOVOLANI_VOLBY: { v: VysledekDovolani; text: string; co: string }[] = [
  {
    v: 'nedovolano',
    text: 'Nedovolal/a jsem se',
    co: 'Zapíše se pokus. Označení zůstane, dokud se klientovi nedovoláš nebo se neozve sám.',
  },
  {
    v: 'nechce',
    text: 'Nechce web',
    co: 'Stav se změní na Odmítnuto. Když klient ještě nedostal nabídku poloviční ceny, automatizace mu ji jednou pošle.',
  },
  {
    v: 'nekontaktovat',
    text: 'Nechce, abychom ho kontaktovali',
    co: 'Stav se změní na Nekontaktovat: už mu nikdo nezavolá a automatizace mu nic nepošle.',
  },
  {
    v: 'mluvili',
    text: 'Mluvili jsme – co klient chce',
    co: 'Označení se uzavře a automatizace pokračuje podle toho, co klient chce.',
  },
  {
    // migrace 061 (Albert 2. 11. 2026: „one more option which says none of it above“): hovor proběhl, nesedí nic ze čtyř
    v: 'jine',
    text: 'Nic z toho výše',
    co: 'Hovor proběhl, ale nesedí nic z toho výše. Označení se uzavře a automatizace pokračuje podle tvé poznámky.',
  },
];

/** Povinná poznámka (migrace 061): u „Mluvili jsme“ a „Nic z toho výše“ je poznámka jediné, co automatizaci řekne, co dál. */
export function poznamkaPovinna(v: VysledekDovolani | null): boolean {
  return v === 'mluvili' || v === 'jine';
}

/** Příklad do pole poznámky podle výsledku (bez výběru obecný). */
const PRIKLAD: Record<VysledekDovolani, string> = {
  nedovolano: 'Třeba: nebral to, zkusím to zítra dopoledne.',
  nechce: 'Třeba: web nechce, chalupu pronajímá přes Booking.',
  nekontaktovat: 'Třeba: ať mu už nevoláme ani nepíšeme.',
  mluvili: 'Třeba: web se mu líbí, chce jinou úvodní fotku a cenu na rok.',
  jine: 'Třeba: chalupu prodává, ozve se nový majitel v lednu.',
};
const PRIKLAD_BEZ_VYBERU = 'Co má automatizace o hovoru vědět.';

/** Kam poznámka půjde (pod polem). Bez práva kontakt upravit jen do události dovolani, kterou appka neukazuje (server 061, poznamka_predana false). */
function kamPoznamka(v: VysledekDovolani | null, smiUpravit: boolean): string {
  if (!smiUpravit) {
    return 'Uloží se jen k záznamu pokusu: v appce ji nikdo neuvidí a agent ji nedostane. Do poznámek klienta a agentovi ji dá jen ten, kdo klienta smí upravit.';
  }
  if (v === 'nechce' || v === 'nekontaktovat') {
    return 'Uloží se do poznámek klienta i jako důvod změny stavu a agent ji dostane jako vzkaz.';
  }
  return 'Uloží se do poznámek klienta a agent ji dostane jako vzkaz.';
}

/**
 * Výsledky, které okno nabídne. Kdo kontakt nesmí upravit (smi_upravit false: třeba super admin, kterému klient ani jeho
 * volající nepatří), zapíše jen „Nedovolal/a jsem se“: ostatní výsledky kontakt mění a server je bez práva úprav odmítne
 * (zapis_hovor, app_smi_upravit; recenze 2. 11. 2026).
 */
export function volbyDovolani(smiUpravit: boolean): typeof DOVOLANI_VOLBY {
  return smiUpravit ? DOVOLANI_VOLBY : DOVOLANI_VOLBY.filter((x) => x.v === 'nedovolano');
}

export default function DovolaniOkno({
  kontakt,
  kategorie,
  lhutaDo,
  pokusy,
  maHvezdu,
  smiUpravit,
  smiHvezdu,
  onZavrit,
  onHotovo,
}: {
  kontakt: Pick<Kontakt, 'id' | 'name' | 'firma'>;
  kategorie: OznaceniKategorie;
  lhutaDo: string | null;
  pokusy: number;
  maHvezdu: boolean;
  /** smí kontakt upravit (smi_upravit)? Jinak okno nabídne jen „Nedovolal/a jsem se“ (volbyDovolani) */
  smiUpravit: boolean;
  /** hvězdu smí měnit jen ten, kdo kontakt smí upravit (jinak zaškrtávátko není) */
  smiHvezdu: boolean;
  onZavrit: () => void;
  /** po zápisu: věta pro stránku („Zapsáno: …“) */
  onHotovo: (veta: string) => void;
}) {
  const session = useSession();
  const [vysledek, setVysledek] = useState<VysledekDovolani | null>(null);
  const [text, setText] = useState('');
  const [hvezda, setHvezda] = useState(maHvezdu);
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  const okno = useRef<HTMLDivElement>(null);
  useOkno(okno, onZavrit, busy);
  const volby = volbyDovolani(smiUpravit);
  const volba = volby.find((x) => x.v === vysledek);
  const max = dovolaniMax(vysledek);
  // znaky jako server (bez mezer na krajích, emoji jako jeden znak)
  const delka = [...text.trim()].length;
  const chybiText = poznamkaPovinna(vysledek) && !text.trim();
  // v každém stavu: text psaný u delšího výsledku (2 000) a pak přepnutý na nechce či nekontaktovat (450) maxLength nezkrátí
  const prilisDlouhy = delka > max;
  const zapsat = async () => {
    if (!vysledek || chybiText || prilisDlouhy) return;
    setBusy(true);
    setChyba('');
    try {
      const v = await getApi().zapisHovor(
        session.token,
        kontakt.id,
        vysledek,
        // migrace 061: poznámka u každého výsledku (prázdná jako null)
        text.trim() || null,
        smiHvezdu && hvezda !== maHvezdu ? hvezda : null
      );
      audio.play('success');
      onHotovo(
        `Hovor s klientem ${kontaktJmeno(kontakt)} je zapsaný: ${volba?.text.toLowerCase() ?? vysledek}.` +
          (v?.poznamka_predana === false ? ' Poznámka se uložila jen k záznamu pokusu, v appce ji nikdo neuvidí.' : '')
      );
    } catch (e) {
      setChyba(errMsg(e));
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };
  return createPortal(
    <div className="scrim dovolani-scrim" onClick={() => !busy && onZavrit()}>
      <div
        ref={okno}
        className="modal card dovolani-okno"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dovolani-titulek"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title" id="dovolani-titulek">
          Zavolal/a jsem: {kontaktJmeno(kontakt)}
        </h3>
        <div className="modal-body">
          <p style={{ marginTop: 0 }}>
            <b>{OZNACENI_LABELS[kategorie]}.</b> {OZNACENI_HINTS[kategorie]}
          </p>
          {(lhutaDo || pokusy > 0) && (
            <p className="muted dovolani-lhuta" style={{ fontSize: 13.5 }}>
              {lhutaText(lhutaDo)}
              {pokusy > 0 ? `${lhutaDo ? ' · ' : ''}nedovoláno už ${pokusy}×` : ''}
            </p>
          )}
          <p className="nerelevantni-otazka" id="dovolani-otazka">
            Jak hovor dopadl?
          </p>
          <div className="zavolat-volby dovolani-volby" role="radiogroup" aria-labelledby="dovolani-otazka">
            {volby.map((x, i) => (
              <button
                key={x.v}
                type="button"
                role="radio"
                aria-checked={vysledek === x.v}
                data-autofocus={i === 0 ? true : undefined}
                className={`pill-btn sm zavolat-volba${vysledek === x.v ? ' active' : ''}`}
                disabled={busy}
                onClick={() => setVysledek(x.v)}
              >
                {x.text}
              </button>
            ))}
          </div>
          {!smiUpravit && (
            <p className="muted dovolani-jen-pokus" style={{ fontSize: 13.5 }}>
              Ostatní výsledky zapíše ten, kdo klienta smí upravit: jeho volající, jeho super admin nebo Albert.
            </p>
          )}
          {volba && <p className="muted dovolani-co" style={{ fontSize: 13.5 }}>{volba.co}</p>}
          {/* migrace 061: poznámka pro automatizaci vždy, i před výběrem výsledku */}
          <div className="field dovolani-poznamka">
            <label htmlFor="dovolani-text">
              Poznámka pro automatizaci
              {vysledek && (
                <>
                  {' '}
                  {poznamkaPovinna(vysledek) ? <span className="req">(povinná)</span> : <span className="muted">(nepovinná)</span>}
                </>
              )}
            </label>
            <textarea
              id="dovolani-text"
              rows={3}
              maxLength={dovolaniMax(vysledek)}
              value={text}
              disabled={busy}
              aria-required={poznamkaPovinna(vysledek)}
              aria-invalid={prilisDlouhy || undefined}
              aria-describedby="dovolani-text-kam dovolani-text-pocet dovolani-text-chyba"
              placeholder={vysledek ? PRIKLAD[vysledek] : PRIKLAD_BEZ_VYBERU}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="dovolani-pod-polem">
              <span id="dovolani-text-kam" className="muted">
                {kamPoznamka(vysledek, smiUpravit)}
              </span>
              <span id="dovolani-text-pocet" className={`zavolat-pocet ${prilisDlouhy ? 'moc' : 'muted'}`}>
                {delka} / {max}
              </span>
            </div>
            {prilisDlouhy ? (
              <p id="dovolani-text-chyba" className="dovolani-chyba">
                Poznámka je moc dlouhá: nejvýš {max} znaků.
              </p>
            ) : chybiText ? (
              <p id="dovolani-text-chyba" className="muted dovolani-chybi">
                {vysledek === 'mluvili' ? 'Napiš, co klient chce.' : 'Napiš, jak hovor dopadl.'}
              </p>
            ) : null}
          </div>
          {smiHvezdu && (
            <label className="dovolani-hvezda">
              <input type="checkbox" checked={hvezda} disabled={busy} onChange={(e) => setHvezda(e.target.checked)} />{' '}
              <HvezdaIcon size={16} plna={hvezda} /> Velký zájem (hvězda)
            </label>
          )}
        </div>
        {/* mimo posouvané tělo okna: chyba serveru i tlačítka jsou vidět vždy */}
        <ErrorBox>{chyba}</ErrorBox>
        <div className="modal-actions">
          <button type="button" className="pill-btn" onClick={onZavrit} disabled={busy}>
            Zpět
          </button>
          <button type="button" className="pill-btn go" onClick={() => void zapsat()} disabled={busy || !vysledek || chybiText || prilisDlouhy}>
            {busy ? 'Ukládám…' : 'Zapsat hovor'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Super admin a Albert: zrušit otevřené označení s důvodem (oznaceni_zavrit). */
export function ZrusitOznaceniOkno({
  kontakt,
  onZavrit,
  onHotovo,
}: {
  kontakt: Pick<Kontakt, 'id' | 'name' | 'firma'>;
  onZavrit: () => void;
  onHotovo: (veta: string) => void;
}) {
  const session = useSession();
  const [duvod, setDuvod] = useState('');
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  const okno = useRef<HTMLDivElement>(null);
  useOkno(okno, onZavrit, busy);
  const zrusit = async () => {
    if (!duvod.trim()) return;
    setBusy(true);
    setChyba('');
    try {
      await getApi().oznaceniZavrit(session.token, kontakt.id, duvod.trim());
      audio.play('success');
      onHotovo(`Označení klienta ${kontaktJmeno(kontakt)} je zrušené.`);
    } catch (e) {
      setChyba(errMsg(e));
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };
  // migrace 061: jako okno Zavolal/a jsem přes createPortal nad sloupcem prasátka (i z detailu)
  return createPortal(
    <div className="scrim dovolani-scrim" onClick={() => !busy && onZavrit()}>
      <div ref={okno} className="modal card" role="dialog" aria-modal="true" aria-labelledby="zrusit-ozn-titulek" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title" id="zrusit-ozn-titulek">
          Zrušit označení: {kontaktJmeno(kontakt)}
        </h3>
        <div className="modal-body">
          <p style={{ marginTop: 0 }}>
            Klient zmizí z označených k zavolání. Když bude dál mlčet po naší další zprávě, automatizace ho označí znovu.
          </p>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="zrusit-ozn-duvod">Proč (povinné)</label>
            <textarea
              id="zrusit-ozn-duvod"
              rows={2}
              maxLength={500}
              value={duvod}
              disabled={busy}
              data-autofocus
              placeholder="Třeba: domluveno osobně, ozve se v prosinci."
              onChange={(e) => setDuvod(e.target.value)}
            />
          </div>
          <ErrorBox>{chyba}</ErrorBox>
        </div>
        <div className="modal-actions">
          <button type="button" className="pill-btn" onClick={onZavrit} disabled={busy}>
            Zpět
          </button>
          <button type="button" className="pill-btn warn" onClick={() => void zrusit()} disabled={busy || !duvod.trim()}>
            {busy ? 'Ukládám…' : 'Zrušit označení'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
