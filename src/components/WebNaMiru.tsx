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
  BEZ_NAHLEDU, CHCE, NECHCE, WEB_NA_MIRU, ZAMCENO, nastavOdznaky, odznakPro, odznakText, prepinacViditelny, sledujOdznaky,
  verzeOdznaku,
} from '../superKlient';

/** Odznaky načte jednou za sezení a znovu po každé změně přepínače (seznamy pak ukážou „Web na míru“). */
export function obnovOdznaky(token: string): void {
  getApi().superKlientiOdznaky(token).then(nastavOdznaky).catch(() => undefined);
}

/** Přepínač „Web na míru“ s volbou našeho náhledu. Neviditelný, když ho uživatel u kontaktu nevidí. */
export function WebNaMiruPrepinac({ kontaktId, onZmena }: { kontaktId: number; onZmena?: (d: SuperKlientDetail) => void }) {
  const session = useSession();
  const [d, setD] = useState<SuperKlientDetail | null>(null);
  const [chyba, setChyba] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let zivy = true;
    setD(null);
    getApi().superKlientDetail(session.token, kontaktId)
      .then((x) => { if (zivy) setD(x); })
      .catch((e) => { if (zivy) setChyba(errMsg(e)); });
    return () => { zivy = false; };
  }, [session.token, kontaktId]);
  if (!d || !prepinacViditelny(d)) return chyba ? <ErrorBox>{chyba}</ErrorBox> : null;
  const zmen = async (zapnout: boolean, chce: boolean | null) => {
    setBusy(true);
    setChyba('');
    try {
      const x = await getApi().superKlientNastav(session.token, kontaktId, zapnout, chce);
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
  return (
    <div className="web-na-miru-prepinac" data-web-na-miru={d.oznacen ? (d.chce_nahled === false ? 'nechce' : 'chce') : 'ne'}>
      <div className="drawer-section-title">{WEB_NA_MIRU}</div>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={!!d.oznacen}
          disabled={zamceno}
          onChange={(e) => void zmen(e.target.checked, d.chce_nahled ?? true)}
        />
        {WEB_NA_MIRU}: klient dostane web postavený podle svého zadání
      </label>
      {d.oznacen && (
        <div className="web-na-miru-volba" role="radiogroup" aria-label="Náš náhled ze šablony">
          <label className="checkbox-row">
            <input type="radio" name={`wnm-${kontaktId}`} checked={d.chce_nahled !== false} disabled={zamceno}
                   onChange={() => void zmen(true, true)} />
            {CHCE}
          </label>
          <label className="checkbox-row">
            <input type="radio" name={`wnm-${kontaktId}`} checked={d.chce_nahled === false} disabled={zamceno}
                   onChange={() => void zmen(true, false)} />
            {NECHCE}
          </label>
        </div>
      )}
      {d.oznacen && (
        <p className="muted web-na-miru-popis">
          {d.faze_text ?? ''}; každý e-mail schvaluje {d.schvalovatel ?? d.odpovedny ?? '?'}{d.pozastaveno ? ' (klient je pozastavený)' : ''}.
          {d.nahled_job_id ? ' Náhled ze šablony chyběl, nový se staví.' : ''}
        </p>
      )}
      {!d.smi_menit && <p className="muted web-na-miru-popis">{ZAMCENO}</p>}
      <ErrorBox>{chyba}</ErrorBox>
    </div>
  );
}

/** Odznak „Web na míru“ (a „bez našeho náhledu“) ze sdíleného seznamu odznaků; v seznamech `compact` = jeden krátký odznak
 *  „na míru“ (celý text v title), aby se úzký řádek na telefonu nevyboulil. */
export function WebNaMiruOdznak({ kontaktId, compact = false }: { kontaktId: number; compact?: boolean }) {
  useSyncExternalStore(sledujOdznaky, verzeOdznaku);
  const texty = odznakText(odznakPro(kontaktId));
  if (texty.length === 0) return null;
  if (compact) {
    return (
      <span className="badge web-na-miru" title={texty.join(', ')} data-web-na-miru-odznak>
        na míru
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
