// Přepínač účtů Claude (migrace 011). Jen Albert (users.id = 1).
// Stav leží v Supabase (automation_control), aby ho viděly oba účty; tady se jen
// čte (poll 10 s) a posílá požadavek na přepnutí / jeho zrušení.

import { useCallback, useEffect, useState } from 'react';
import { getApi, type AutomationAccount, type AutomationStatus } from '../api';
import { audio } from '../audio';
import { useSession } from '../auth';
import { ConfirmModal, ErrorBox, Spinner, errMsg, formatDateTime } from '../ui';

const JOB_LABELS: Record<string, string> = {
  build: 'stavba webu',
  change: 'úpravy webu',
  invoice: 'faktura',
  domain: 'doména',
  photo: 'fotky',
  gsc: 'Search Console',
  other: 'jiné',
  chat: 'vzkaz',
};

function labelOf(st: AutomationStatus, slug: string): string {
  return st.accounts.find((a) => a.slug === slug)?.label ?? slug;
}

/** Stavový box podle fáze: přepínám / čeká na přihlášení / jede. */
function StatusBox({ st }: { st: AutomationStatus }) {
  const { control, running, queued } = st;
  const active = st.accounts.find((a) => a.slug === control.active_account);
  const activeLabel = labelOf(st, control.active_account);

  if (control.phase === 'draining') {
    const targetLabel = labelOf(st, control.requested_account);
    return (
      <div className="card auto-status draining">
        <p>
          Přepínám z účtu {activeLabel} na účet {targetLabel}. Nové joby se neberou,
          rozdělané nechávám doběhnout.
        </p>
        {running.length === 0 ? (
          <p>Nic už neběží, dokončuji přepnutí…</p>
        ) : (
          <>
            <p>Čekám, až doběhne {running.length === 1 ? 'tenhle job' : `těchto ${running.length} jobů`}:</p>
            <ul className="auto-jobs">
              {running.map((j) => (
                <li key={j.id}>
                  {JOB_LABELS[j.type] ?? j.type}
                  {j.kontakt_name ? ` — ${j.kontakt_name}` : ''}
                  <span className="auto-meta"> · běží od {formatDateTime(j.updated_at)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="auto-meta">
          Až doběhnou, dostaneš zprávu (chat v appce + e-mail) a automatizace pokračuje na účtu{' '}
          {targetLabel}. Přepínání od {formatDateTime(control.drain_started_at)}.
        </p>
      </div>
    );
  }

  if (active && !active.token_present) {
    return (
      <div className="card auto-status waiting">
        <p>
          Nic neběží. Automatizace je přepnutá na účet {activeLabel}, ale ten ještě nemá
          přihlášení pro agenty, takže se nic nestaví ani neposílá.
        </p>
        <p>
          Přepni se v Claude Code na účet {activeLabel} a vlož prompt ze souboru
          docs/PRECHOD-NA-DRUHY-UCET.md. Pak to samo pokračuje.
        </p>
        <p className="auto-meta">Ve frontě čeká: {queued}.</p>
      </div>
    );
  }

  return (
    <div className="card auto-status ok">
      <p>
        Automatizace jede na účtu {activeLabel}. Běží {running.length}, ve frontě {queued}.
      </p>
      {running.length > 0 && (
        <ul className="auto-jobs">
          {running.map((j) => (
            <li key={j.id}>
              {JOB_LABELS[j.type] ?? j.type}
              {j.kontakt_name ? ` — ${j.kontakt_name}` : ''}
              <span className="auto-meta">
                {' '}
                · účet {j.account ? labelOf(st, j.account) : '—'} · od {formatDateTime(j.updated_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {control.switched_at && (
        <p className="auto-meta">
          Naposledy přepnuto {formatDateTime(control.switched_at)}
          {control.requested_by ? ` (${control.requested_by})` : ''}. Můžeš se v Claude Code přepnout i ty.
        </p>
      )}
    </div>
  );
}

function AccountCard({
  a,
  st,
  busy,
  onPick,
}: {
  a: AutomationAccount;
  st: AutomationStatus;
  busy: boolean;
  onPick: (slug: string) => void;
}) {
  const draining = st.control.phase === 'draining';
  const isActive = a.slug === st.control.active_account;
  const isTarget = draining && a.slug === st.control.requested_account;
  const disabled = busy || (isActive && !draining) || isTarget;

  let cta = 'Přepnout sem';
  if (isActive) cta = draining ? 'Zrušit přepnutí' : 'Aktivní';
  else if (isTarget) cta = 'Čeká na doběhnutí';

  return (
    <button
      type="button"
      className={`card acct-card${isActive ? ' active' : ''}${isTarget ? ' target' : ''}`}
      disabled={disabled}
      onClick={() => onPick(a.slug)}
      title={a.email ?? undefined}
    >
      <span className="acct-label">{a.label}</span>
      <span className="acct-email">{a.email ?? 'e-mail zatím nezadán'}</span>
      <span className="acct-chips">
        {isActive && <span className="badge yellow">VEZE AUTOMATIZACI</span>}
        {isTarget && <span className="badge hot-badge">PŘEPÍNÁM SEM</span>}
        <span className={`badge ${a.token_present ? 'neutral' : 'warn'}`}>
          {a.token_present ? 'má přihlášení pro agenty' : 'bez přihlášení pro agenty'}
        </span>
      </span>
      <span className="acct-cta">{cta}</span>
    </button>
  );
}

export default function AutomatizacePage() {
  const session = useSession();
  const [st, setSt] = useState<AutomationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const s = await getApi().getAutomationStatus(session.token);
        setSt(s);
        setError('');
      } catch (e) {
        if (!silent) {
          setError(errMsg(e));
          audio.play('error');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [session.token]
  );

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(true), 10000);
    return () => clearInterval(timer);
  }, [load]);

  const doSwitch = async (slug: string) => {
    setBusy(true);
    setError('');
    try {
      const s = await getApi().requestAccountSwitch(session.token, slug);
      setSt(s);
      audio.play('success');
    } catch (e) {
      setError(errMsg(e));
      audio.play('error');
    } finally {
      setBusy(false);
      setConfirmSlug(null);
    }
  };

  const onPick = (slug: string) => {
    if (!st) return;
    // klik na aktivní účet během přepínání = zrušení (bez potvrzování, nic se neztratí)
    if (slug === st.control.active_account) {
      void doSwitch(slug);
      return;
    }
    setConfirmSlug(slug);
  };

  return (
    <div>
      <p className="eyebrow">admin · jen Albert</p>
      <h1 className="page-title">Automatizace</h1>
      <p className="muted" style={{ marginTop: -6, marginBottom: 6 }}>
        Který účet Claude teď veze agenty. Přepnutí nechá rozdělanou práci doběhnout, nové
        joby se do té doby neberou, a až je hotovo, dostaneš zprávu.
      </p>

      <ErrorBox>{error}</ErrorBox>
      {loading && <Spinner label="Načítám stav…" />}

      {st && (
        <>
          <div className="acct-grid">
            {st.accounts.map((a) => (
              <AccountCard key={a.slug} a={a} st={st} busy={busy} onPick={onPick} />
            ))}
          </div>
          <StatusBox st={st} />
        </>
      )}

      {confirmSlug && st && (
        <ConfirmModal
          title={`Přepnout automatizaci na účet ${labelOf(st, confirmSlug)}?`}
          confirmLabel="Přepnout"
          confirmClass="go"
          busy={busy}
          onConfirm={() => void doSwitch(confirmSlug)}
          onCancel={() => setConfirmSlug(null)}
        >
          Běžící joby ({st.running.length}) doběhnou, nový už si žádný agent nevezme. Až bude
          všechno hotové, přijde ti zpráva a automatizace pokračuje na účtu{' '}
          {labelOf(st, confirmSlug)}.
          {!st.accounts.find((a) => a.slug === confirmSlug)?.token_present &&
            ' Tenhle účet zatím nemá přihlášení pro agenty — po přepnutí bude potřeba na něm vložit prompt z docs/PRECHOD-NA-DRUHY-UCET.md.'}
        </ConfirmModal>
      )}
    </div>
  );
}
