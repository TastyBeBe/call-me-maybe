/**
 * Web na míru, super klienti (migrace 086, Albert 27. 11. 2026): „anyone for their client, but of course the super admins
 * should also be able to do it for anyone … even when you're in the call feature, you should be able to toggle this“.
 * Přepínač v detailu klienta, v okně po hovoru a na kartě hovoru a odznak do seznamů. Co kdo smí, hlídá server
 * (super_klient_detail, super_klient_nastav); Volající přepínač u cizího klienta nevidí.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { getApi, type SuperKlientDetail } from '../api';
import { audio } from '../audio';
import { useSession } from '../auth';
import { ErrorBox, errMsg } from '../ui';
import {
  BEZ_NAHLEDU, BEZ_NAHLEDU_KRATCE, CHCE, NECHCE, VYBER_NAHLED, WEB_NA_MIRU, ZAMCENO, ZRUSIT_ANO, ZRUSIT_NE, ZRUSIT_OTAZKA, nastavOdznaky, odznakPro,
  odznakText, prepinacViditelny, sledujOdznaky, verzeOdznaku, wnmMeni, wnmOdlozeneText, type WnmVolba,
} from '../superKlient';

/** Odznaky načte jednou za sezení a znovu po každé změně přepínače (seznamy pak ukážou „Web na míru“). */
export function obnovOdznaky(token: string): void {
  getApi().superKlientiOdznaky(token).then(nastavOdznaky).catch(() => undefined);
}

/**
 * Podrženou volbu z okna po hovoru nebo z karty hovoru pošle až po zapsaném výsledku hovoru (spec 8.14; oprava 28. 11. 2026,
 * nález 1d). Vrátí větu pro stránku (s mezerou na začátku) nebo „“; chyba zapsaný hovor nevrací, jen se řekne.
 */
export async function ulozWebNaMiru(token: string, kontaktId: number, v: WnmVolba | null): Promise<string> {
  if (!v) return '';
  try {
    const x = await getApi().superKlientNastav(token, kontaktId, v.zapnout, v.chce);
    obnovOdznaky(token);
    if (!v.zapnout) return ' Web na míru je zrušený.';
    return ` Web na míru je zapnutý${x.chce_nahled === false ? ' (bez našeho náhledu)' : ''}; každý e-mail schvaluje ${x.schvalovatel ?? x.odpovedny ?? '?'}.`
      + (x.nahled_job_id ? ' Náhled ze šablony chyběl, nový se staví.' : '');
  } catch (e) {
    audio.play('error');
    return ` Web na míru se neuložil (${errMsg(e)}); zapni ho v detailu klienta.`;
  }
}

/**
 * Přepínač „Web na míru“ s volbou našeho náhledu. Neviditelný, když ho uživatel u kontaktu nevidí.
 * ⚠ Od 28. 11. 2026 (nezávislá recenze, nálezy 1d a 2): zaškrtnutí nic neuloží, napřed se zeptá „chce náš náhled / nechce“
 * (dřív se hned uložilo „chce“ a mohlo zařadit nový náhled klientovi, který ho nechce); zrušení označení se napřed potvrdí.
 * `odlozit` (okno „Zavolal/a jsem“ a karta hovoru): volba se jen podrží a pošle ji stránka až po zapsání výsledku hovoru
 * (`onVolba`; spec 8.14), aby server četl stav klienta po hovoru.
 */
export function WebNaMiruPrepinac({ kontaktId, onZmena, odlozit = false, onVolba }: {
  kontaktId: number;
  onZmena?: (d: SuperKlientDetail) => void;
  odlozit?: boolean;
  onVolba?: (v: WnmVolba | null) => void;
}) {
  const session = useSession();
  const [d, setD] = useState<SuperKlientDetail | null>(null);
  const [chyba, setChyba] = useState('');
  const [busy, setBusy] = useState(false);
  const [vybiram, setVybiram] = useState(false);
  const [potvrdit, setPotvrdit] = useState(false);
  const [volba, setVolba] = useState<WnmVolba | null>(null);
  useEffect(() => {
    let zivy = true;
    setD(null);
    setVybiram(false);
    setPotvrdit(false);
    setVolba(null);
    getApi().superKlientDetail(session.token, kontaktId)
      .then((x) => { if (zivy) setD(x); })
      .catch((e) => { if (zivy) setChyba(errMsg(e)); });
    return () => { zivy = false; };
  }, [session.token, kontaktId]);
  if (!d || !prepinacViditelny(d)) return chyba ? <ErrorBox>{chyba}</ErrorBox> : null;
  const zvol = async (v: WnmVolba) => {
    setVybiram(false);
    setPotvrdit(false);
    if (odlozit) {
      const plati = wnmMeni(d, v) ? v : null;
      setVolba(plati);
      onVolba?.(plati);
      return;
    }
    setBusy(true);
    setChyba('');
    try {
      const x = await getApi().superKlientNastav(session.token, kontaktId, v.zapnout, v.chce);
      setD(x);
      onZmena?.(x);
      obnovOdznaky(session.token);
      audio.play('success');
    } catch (e) {
      setChyba(errMsg(e));
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };
  const zamceno = busy || !d.smi_menit;
  // co přepínač ukazuje: uložený stav, v okně po hovoru podržená volba
  const zapnuto = volba ? volba.zapnout : !!d.oznacen;
  const chce = volba ? volba.chce : (d.chce_nahled ?? null);
  const stav = vybiram ? 'vyber' : zapnuto ? (chce === false ? 'nechce' : 'chce') : 'ne';
  return (
    <div className="web-na-miru-prepinac" data-web-na-miru={stav}>
      <div className="drawer-section-title">{WEB_NA_MIRU}</div>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={zapnuto || vybiram}
          disabled={zamceno}
          onChange={(e) => {
            if (e.target.checked) {
              if (!zapnuto) setVybiram(true);   // napřed volba náhledu, nic se neukládá
            } else if (vybiram) {
              setVybiram(false);
            } else if (zapnuto) {
              setPotvrdit(true);                 // zrušení napřed potvrdit
            }
          }}
        />
        {WEB_NA_MIRU}: klient dostane web postavený podle svého zadání
      </label>
      {(zapnuto || vybiram) && (
        <div className="web-na-miru-volba" role="radiogroup" aria-label="Náš náhled ze šablony">
          <label className="checkbox-row">
            <input type="radio" name={`wnm-${kontaktId}`} checked={!vybiram && chce !== false} disabled={zamceno}
                   onChange={() => void zvol({ zapnout: true, chce: true })} />
            {CHCE}
          </label>
          <label className="checkbox-row">
            <input type="radio" name={`wnm-${kontaktId}`} checked={!vybiram && chce === false} disabled={zamceno}
                   onChange={() => void zvol({ zapnout: true, chce: false })} />
            {NECHCE}
          </label>
        </div>
      )}
      {vybiram && <p className="muted web-na-miru-popis web-na-miru-vyber">{VYBER_NAHLED}</p>}
      {potvrdit && (
        <div className="web-na-miru-potvrzeni" role="group" aria-label="Potvrzení zrušení Web na míru">
          <p className="web-na-miru-popis">{ZRUSIT_OTAZKA}</p>
          <div className="web-na-miru-potvrzeni-tlacitka">
            <button type="button" className="pill-btn sm warn" disabled={busy}
                    onClick={() => void zvol({ zapnout: false, chce: null })}>
              {ZRUSIT_ANO}
            </button>
            <button type="button" className="pill-btn sm" disabled={busy} onClick={() => setPotvrdit(false)}>
              {ZRUSIT_NE}
            </button>
          </div>
        </div>
      )}
      {odlozit && volba && <p className="muted web-na-miru-popis web-na-miru-odlozeno">{wnmOdlozeneText(volba)}</p>}
      {d.oznacen && !volba && (
        <p className="muted web-na-miru-popis">
          {d.faze_text ?? ''}; každý e-mail schvaluje {d.schvalovatel ?? d.odpovedny ?? '?'}{d.pozastaveno ? ' (klient je pozastavený)' : ''}.
          {d.nahled_job_id ? ' Náhled ze šablony chyběl, nový se staví.' : ''}
          {!d.nahled_job_id && d.nahled_prekazka ? ` Nový náhled ze šablony se nezařadil: ${d.nahled_prekazka}.` : ''}
        </p>
      )}
      {!d.smi_menit && <p className="muted web-na-miru-popis">{ZAMCENO}</p>}
      <ErrorBox>{chyba}</ErrorBox>
    </div>
  );
}

/** Odznak „Web na míru“ (a „bez našeho náhledu“) ze sdíleného seznamu odznaků; v seznamech `compact` = krátké odznaky
 *  „na míru“ a u „nechce“ ještě „bez náhledu“ (celý text v title), aby se úzký řádek na telefonu nevyboulil.
 *  ⚠ Od 28. 11. 2026 (nález 12) NAHRAZUJE jediný odznak „na míru“ s „bez našeho náhledu“ jen v title (na telefonu není hover). */
export function WebNaMiruOdznak({ kontaktId, compact = false }: { kontaktId: number; compact?: boolean }) {
  useSyncExternalStore(sledujOdznaky, verzeOdznaku);
  const texty = odznakText(odznakPro(kontaktId));
  if (texty.length === 0) return null;
  if (compact) {
    return (
      <span className="web-na-miru-odznaky" title={texty.join(', ')}>
        <span className="badge web-na-miru" data-web-na-miru-odznak>
          na míru
        </span>
        {texty.includes(BEZ_NAHLEDU) && (
          <span className="badge neutral web-na-miru-bez" data-web-na-miru-odznak>
            {BEZ_NAHLEDU_KRATCE}
          </span>
        )}
      </span>
    );
  }
  return (
    <>
      {texty.map((t) => (
        <span key={t} className={`badge ${t === BEZ_NAHLEDU ? 'neutral' : 'web-na-miru'}`} data-web-na-miru-odznak>
          {t}
        </span>
      ))}
    </>
  );
}
