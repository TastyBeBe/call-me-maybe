/**
 * Kontrola odpovědí (migrace 083, Albert 26. 11. 2026): přepínač v detailu klienta a karta návrhu e-mailu ve vlákně.
 * Albert: „there should be like a tick box which super admin can tick … it doesn't reply by itself. It creates the reply,
 * but it doesn't send it, and instead it waits for the super admin to review the email … there is like an easy approve
 * button, and then there's like a text box for a note.“ Jen super admin; Volající nevidí přepínač ani karty (zprávy
 * automatizace ve vlákně svého klienta vidí jako obyčejné bubliny). Co kdo smí, hlídá server (kontrola_odpovedi_*).
 */
import { useCallback, useEffect, useState } from 'react';
import { getApi, type KontrolaOdpovedi, type NavrhKeKontrole } from '../api';
import { audio } from '../audio';
import { useSession } from '../auth';
import { isSuperAdmin } from '../roles';
import { ConfirmModal, ErrorBox, errMsg } from '../ui';
import { NAVRH_ODZNAK, casKontroly, kontrolaPopis, navrhTlacitka, navrhVysledek } from '../kontrola';

/** Stav kontroly odpovědí kontaktu: jen super admin (ostatním null, server by stejně odmítl). */
export function useKontrola(kontaktId: number | null | undefined, obnova: number = 0) {
  const session = useSession();
  const jaSuper = isSuperAdmin(session.role);
  const [data, setData] = useState<KontrolaOdpovedi | null>(null);
  const [chyba, setChyba] = useState('');
  const nacti = useCallback(async () => {
    if (!jaSuper || !kontaktId) {
      setData(null);
      return;
    }
    try {
      setData(await getApi().kontrolaDetail(session.token, kontaktId));
      setChyba('');
    } catch (e) {
      setChyba(errMsg(e));
    }
  }, [jaSuper, kontaktId, session.token]);
  useEffect(() => {
    void nacti();
  }, [nacti, obnova]);
  return { data, setData, chyba, nacti, jaSuper };
}
export type KontrolaStav = ReturnType<typeof useKontrola>;

/** Přepínač „Kontrola odpovědí“ v detailu klienta (jen super admin; měnit smí, kdo klienta smí upravovat). */
export function KontrolaOdpovediPanel({ kontrola, kontaktId }: { kontrola: KontrolaStav; kontaktId: number }) {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [potvrdit, setPotvrdit] = useState(false);
  const [chyba, setChyba] = useState('');
  if (!kontrola.jaSuper) return null;
  const k = kontrola.data;
  const nastav = async (zapnout: boolean) => {
    setBusy(true);
    setChyba('');
    try {
      kontrola.setData(await getApi().kontrolaNastav(session.token, kontaktId, zapnout));
      setPotvrdit(false);
      audio.play('success');
    } catch (e) {
      setChyba(errMsg(e));
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="kontrola-panel" data-kontrola-odpovedi={k ? (k.zapnuto ? 'zapnuto' : 'vypnuto') : 'nacitam'}>
      <div className="drawer-section-title">Kontrola odpovědí</div>
      {!k ? (
        kontrola.chyba ? <ErrorBox>{kontrola.chyba}</ErrorBox> : <p className="muted kontrola-popis">Načítám…</p>
      ) : (
        <>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={k.zapnuto}
              disabled={busy || !k.smi_menit}
              onChange={(e) => {
                if (e.target.checked) void nastav(true);
                else if (k.cekajici > 0) setPotvrdit(true);
                else void nastav(false);
              }}
            />
            Neposílat klientovi nic bez schválení
          </label>
          <p className="muted kontrola-popis">{kontrolaPopis(k)}</p>
          {!k.smi_menit && (
            <p className="muted kontrola-popis">Měnit ji smí super admin, který tohoto klienta smí upravovat.</p>
          )}
        </>
      )}
      <ErrorBox>{chyba}</ErrorBox>
      {potvrdit && k && (
        <ConfirmModal
          title="Vypnout kontrolu odpovědí?"
          confirmLabel="Vypnout"
          busy={busy}
          onConfirm={() => void nastav(false)}
          onCancel={() => setPotvrdit(false)}
        >
          {k.cekajici === 1 ? 'Jeden čekající návrh e-mailu se zruší' : `Čekající návrhy e-mailů (${k.cekajici}) se zruší`} a
          automatizace bude klientovi zase odpovídat sama podle běžných pravidel.
        </ConfirmModal>
      )}
    </div>
  );
}

/** Karta návrhu e-mailu ve vlákně (místo bubliny „KE SCHVÁLENÍ…“): celý e-mail, Schválit a odeslat, Vrátit s poznámkou. */
export function NavrhKarta({ navrh, onZmena }: { navrh: NavrhKeKontrole; onZmena: (n: NavrhKeKontrole) => void }) {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [vraceni, setVraceni] = useState(false);
  const [poznamka, setPoznamka] = useState('');
  const [chyba, setChyba] = useState('');
  const t = navrhTlacitka(navrh);
  const vysledek = navrhVysledek(navrh);
  const akce = async (fn: () => Promise<NavrhKeKontrole>) => {
    setBusy(true);
    setChyba('');
    try {
      const n = await fn();
      setVraceni(false);
      setPoznamka('');
      audio.play('success');
      onZmena(n);
    } catch (e) {
      setChyba(errMsg(e));
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="navrh-karta" data-navrh={navrh.id} data-stav={navrh.stav}>
      <div className="navrh-hlava">
        <b>Návrh e-mailu #{navrh.id}</b>
        <span className={`badge ${NAVRH_ODZNAK[navrh.stav]}`}>{navrh.stav_text}</span>
      </div>
      <div className="navrh-meta">
        <div>
          <span className="muted">Komu:</span> {navrh.komu}
        </div>
        <div>
          <span className="muted">Předmět:</span> {navrh.predmet || '(bez předmětu)'}
        </div>
        {navrh.priloha_nazev && (
          <div>
            <span className="muted">Příloha:</span> {navrh.priloha_nazev}
          </div>
        )}
        <div className="muted">
          Připraveno {casKontroly(navrh.vytvoreno)}
          {navrh.pripominek > 0 ? ` · připomenuto ${navrh.pripominek}×` : ''}
        </div>
      </div>
      <div className="navrh-telo">{navrh.telo}</div>
      {vysledek && <p className="navrh-vysledek">{vysledek}</p>}
      <ErrorBox>{chyba}</ErrorBox>
      {(t.schvalit || t.vratit) && !vraceni && (
        <div className="navrh-akce">
          {t.schvalit && (
            <button
              type="button"
              className="pill-btn go"
              disabled={busy}
              onClick={() => void akce(() => getApi().navrhSchvalit(session.token, navrh.id))}
            >
              {busy ? 'Ukládám…' : 'Schválit a odeslat'}
            </button>
          )}
          {t.vratit && (
            <button type="button" className="pill-btn" disabled={busy} onClick={() => setVraceni(true)}>
              Vrátit s poznámkou
            </button>
          )}
        </div>
      )}
      {vraceni && (
        <div className="navrh-vraceni">
          <textarea
            value={poznamka}
            onChange={(e) => setPoznamka(e.target.value)}
            placeholder="Co má agent v e-mailu změnit…"
            aria-label={`Poznámka k návrhu e-mailu #${navrh.id}`}
          />
          <div className="navrh-akce">
            <button
              type="button"
              className="pill-btn hot"
              disabled={busy || !poznamka.trim()}
              onClick={() => void akce(() => getApi().navrhVratit(session.token, navrh.id, poznamka))}
            >
              {busy ? 'Ukládám…' : 'Vrátit agentovi'}
            </button>
            <button
              type="button"
              className="pill-btn"
              disabled={busy}
              onClick={() => {
                setVraceni(false);
                setPoznamka('');
              }}
            >
              Zpět
            </button>
          </div>
        </div>
      )}
      {!navrh.smi_rozhodnout && navrh.stav === 'ceka' && (
        <p className="muted navrh-vysledek">Rozhodnout smí super admin, který tohoto klienta smí upravovat.</p>
      )}
    </div>
  );
}
