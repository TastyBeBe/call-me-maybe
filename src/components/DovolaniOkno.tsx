// „ZAVOLAL/A JSEM“ U OZNAČENÉHO KLIENTA (migrace 060, Albert 1. 11. 2026: „a proper menu: didn't reach him / client doesn't
// want the website / client doesn't want to be contacted / we spoke — write down what the client wants (the automation
// acts on it)“). Okno se čtyřmi výsledky a hvězdou volá zapis_hovor. Druhý hovor NENÍ nový hovor ve statistikách („as one
// call and as one client still“): server nepíše call_log, Rozvrh ani výdělek se nemění. Lhůta ve stage 1 bez slibu
// e-mailu („Lhůta na zavolání do …“; připomínka e-mailem přijde až ve stage 2). Super admin navíc „Zrušit označení“.

import { useRef, useState } from 'react';
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

/** Kolik znaků textu výsledek pustí: důvod nechce a nekontaktovat 450, „Mluvili jsme“ 2 000 (jako server). */
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
    co: 'Co napíšeš, uloží se do poznámek a pošle se agentovi jako vzkaz; automatizace podle toho pokračuje.',
  },
];

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
  const chybiText = vysledek === 'mluvili' && text.trim() === '';
  const max = dovolaniMax(vysledek);
  // text psaný u „Mluvili jsme“ (2 000) a pak přepnutý na nechce či nekontaktovat (450) maxLength nezkrátí
  const prilisDlouhy = vysledek !== null && vysledek !== 'nedovolano' && [...text.trim()].length > max;
  const zapsat = async () => {
    if (!vysledek || chybiText || prilisDlouhy) return;
    setBusy(true);
    setChyba('');
    try {
      await getApi().zapisHovor(
        session.token,
        kontakt.id,
        vysledek,
        vysledek === 'nedovolano' ? null : text.trim() || null,
        smiHvezdu && hvezda !== maHvezdu ? hvezda : null
      );
      audio.play('success');
      onHotovo(`Hovor s klientem ${kontaktJmeno(kontakt)} je zapsaný: ${volba?.text.toLowerCase() ?? vysledek}.`);
    } catch (e) {
      setChyba(errMsg(e));
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="scrim" onClick={() => !busy && onZavrit()}>
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
          <p className="nerelevantni-otazka">Jak hovor dopadl?</p>
          <div className="zavolat-volby dovolani-volby" role="radiogroup" aria-label="Výsledek hovoru">
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
          {vysledek && vysledek !== 'nedovolano' && (
            <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
              <label htmlFor="dovolani-text">
                {vysledek === 'mluvili' ? 'Co klient chce (povinné)' : 'Důvod (nepovinný)'}
              </label>
              <textarea
                id="dovolani-text"
                rows={3}
                maxLength={max}
                value={text}
                disabled={busy}
                placeholder={
                  vysledek === 'mluvili'
                    ? 'Třeba: web se mu líbí, chce jinou úvodní fotku a cenu na rok.'
                    : 'Třeba: web nechce, chalupu pronajímá přes Booking.'
                }
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          )}
          {smiHvezdu && (
            <label className="dovolani-hvezda">
              <input type="checkbox" checked={hvezda} disabled={busy} onChange={(e) => setHvezda(e.target.checked)} />{' '}
              <HvezdaIcon size={16} plna={hvezda} /> Velký zájem (hvězda)
            </label>
          )}
          {chybiText && <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>Napiš, co klient chce.</p>}
          {prilisDlouhy && (
            <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>Důvod je moc dlouhý: nejvýš {max} znaků.</p>
          )}
          <ErrorBox>{chyba}</ErrorBox>
        </div>
        <div className="modal-actions">
          <button type="button" className="pill-btn" onClick={onZavrit} disabled={busy}>
            Zpět
          </button>
          <button type="button" className="pill-btn go" onClick={() => void zapsat()} disabled={busy || !vysledek || chybiText || prilisDlouhy}>
            {busy ? 'Ukládám…' : 'Zapsat hovor'}
          </button>
        </div>
      </div>
    </div>
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
  return (
    <div className="scrim" onClick={() => !busy && onZavrit()}>
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
    </div>
  );
}
