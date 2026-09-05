// Vypínač celé automatizace (migrace 012) + přepínač účtů Claude (migrace 011).
// Jen Albert (users.id = 1). Stav leží v Supabase (automation_control), aby ho viděly
// oba účty; tady se jen čte (poll 10 s) a posílají požadavky: vypnout / zrušit vypnutí /
// zapnout, přepnout účet / zrušit přepnutí. Obojí je „šetrné": rozdělané joby doběhnou.

import { useCallback, useEffect, useState } from 'react';
import { getApi, type AutomationAccount, type AutomationStatus } from '../api';
import { audio } from '../audio';
import { useSession } from '../auth';
import { accountLabel, justStarted, powerSummary } from '../automation';
import { PowerIcon } from '../icons';
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

const labelOf = accountLabel;

function jobsWord(n: number): string {
  if (n === 1) return '1 job';
  if (n >= 2 && n <= 4) return `${n} joby`;
  return `${n} jobů`;
}

/** Stavová karta nahoře: štítek + jedna věta + tlačítko vypnout / zrušit / zapnout. */
function PowerCard({
  st,
  busy,
  onStop,
  onCancelStop,
  onStart,
}: {
  st: AutomationStatus;
  busy: boolean;
  onStop: () => void;
  onCancelStop: () => void;
  onStart: () => void;
}) {
  const { control, running, queued } = st;
  const sum = powerSummary(st);
  const activeLabel = labelOf(st, control.active_account);
  const drainingStop = control.phase === 'draining' && control.drain_reason === 'stop';

  return (
    <div className={`card power-card ${sum.tone}`}>
      <div className="power-head">
        <span className={`power-pill ${sum.tone}`}>
          <PowerIcon size={15} />
          {sum.pill}
        </span>
        <span className="power-text">{sum.text}</span>
      </div>

      {control.phase === 'running' && (
        <p className="auto-meta">
          Účet {activeLabel} · běží {running.length}, ve frontě {queued}.
          {control.started_at &&
            ` Zapnuto ${formatDateTime(control.started_at)}${
              justStarted(control.started_at) ? ' — agenti se rozjedou s dalším tikem (do 15 minut).' : '.'
            }`}
        </p>
      )}

      {control.phase === 'draining' && (
        <p className="auto-meta">
          {running.length > 0 ? `Ještě běží ${jobsWord(running.length)}. ` : 'Nic už neběží, dokončuji… '}
          {drainingStop
            ? `Vypínání od ${formatDateTime(control.stop_requested_at)}.`
            : `Přepínání od ${formatDateTime(control.drain_started_at)}.`}{' '}
          Až doběhnou, přijde ti zpráva (chat v appce + e-mail + notifikace).
        </p>
      )}

      {control.phase === 'stopped' && (
        <p className="auto-meta">
          Vypnuto od {formatDateTime(control.stopped_at)}. Nic se nestaví ani neposílá; ve frontě čeká{' '}
          {queued}. Účet {activeLabel}.
        </p>
      )}

      <div className="power-actions">
        {control.phase === 'running' && (
          <button type="button" className="pill-btn warn" disabled={busy} onClick={onStop}>
            Vypnout automatizaci
          </button>
        )}
        {drainingStop && (
          <button type="button" className="pill-btn" disabled={busy} onClick={onCancelStop}>
            Zrušit vypnutí
          </button>
        )}
        {control.phase === 'draining' && !drainingStop && (
          <span className="auto-meta">Vypnout půjde až po dokončení přepnutí účtu.</span>
        )}
        {control.phase === 'stopped' && (
          <button type="button" className="pill-btn go" disabled={busy} onClick={onStart}>
            Zapnout automatizaci
          </button>
        )}
      </div>
    </div>
  );
}

/** Stavový box podle fáze: přepínám / vypínám / čeká na přihlášení / jede. */
function StatusBox({ st }: { st: AutomationStatus }) {
  const { control, running, queued } = st;
  const active = st.accounts.find((a) => a.slug === control.active_account);
  const activeLabel = labelOf(st, control.active_account);

  // vypnuto: všechno podstatné říká karta nahoře
  if (control.phase === 'stopped') return null;

  if (control.phase === 'draining') {
    const forStop = control.drain_reason === 'stop';
    const targetLabel = labelOf(st, control.requested_account);
    return (
      <div className="card auto-status draining">
        <p>
          {forStop
            ? 'Vypínám automatizaci. Nové joby se neberou, rozdělané nechávám doběhnout.'
            : `Přepínám z účtu ${activeLabel} na účet ${targetLabel}. Nové joby se neberou, rozdělané nechávám doběhnout.`}
        </p>
        {running.length === 0 ? (
          <p>{forStop ? 'Nic už neběží, dokončuji vypnutí…' : 'Nic už neběží, dokončuji přepnutí…'}</p>
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
          {forStop
            ? `Až doběhnou, automatizace se vypne a dostaneš zprávu (chat v appce + e-mail). Vypínání od ${formatDateTime(control.stop_requested_at)}.`
            : `Až doběhnou, dostaneš zprávu (chat v appce + e-mail) a automatizace pokračuje na účtu ${targetLabel}. Přepínání od ${formatDateTime(control.drain_started_at)}.`}
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
  const phase = st.control.phase;
  const drainingSwitch = phase === 'draining' && st.control.drain_reason !== 'stop';
  const drainingStop = phase === 'draining' && st.control.drain_reason === 'stop';
  const isActive = a.slug === st.control.active_account;
  const isTarget = drainingSwitch && a.slug === st.control.requested_account;
  const disabled = busy || drainingStop || (isActive && !drainingSwitch) || isTarget;

  let cta = phase === 'stopped' ? 'Přepnout sem hned' : 'Přepnout sem';
  if (isActive) cta = drainingSwitch ? 'Zrušit přepnutí' : 'Aktivní';
  else if (isTarget) cta = 'Čeká na doběhnutí';
  else if (drainingStop) cta = 'Až po vypnutí';

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
  const [confirmStop, setConfirmStop] = useState(false);

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

  /** Společný obal pro všechny požadavky: stav z odpovědi, zvuk, chyba do boxu. */
  const run = async (call: () => Promise<AutomationStatus>) => {
    setBusy(true);
    setError('');
    try {
      const s = await call();
      setSt(s);
      audio.play('success');
    } catch (e) {
      setError(errMsg(e));
      audio.play('error');
    } finally {
      setBusy(false);
      setConfirmSlug(null);
      setConfirmStop(false);
    }
  };

  const api = getApi();
  const doSwitch = (slug: string) => run(() => api.requestAccountSwitch(session.token, slug));
  const doStop = () => run(() => api.requestAutomationStop(session.token));
  const doCancelStop = () => run(() => api.cancelAutomationStop(session.token));
  const doStart = () => run(() => api.requestAutomationStart(session.token));

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
        Vypínač celé automatizace a přepínač účtu Claude, který veze agenty. Obojí nechá
        rozdělanou práci doběhnout, nové joby se do té doby neberou, a až je hotovo, dostaneš
        zprávu.
      </p>

      <ErrorBox>{error}</ErrorBox>
      {loading && <Spinner label="Načítám stav…" />}

      {st && (
        <>
          <PowerCard
            st={st}
            busy={busy}
            onStop={() => setConfirmStop(true)}
            onCancelStop={() => void doCancelStop()}
            onStart={() => void doStart()}
          />
          <p className="eyebrow section-eyebrow">účet Claude, který veze agenty</p>
          <div className="acct-grid">
            {st.accounts.map((a) => (
              <AccountCard key={a.slug} a={a} st={st} busy={busy} onPick={onPick} />
            ))}
          </div>
          <StatusBox st={st} />
        </>
      )}

      {confirmStop && st && (
        <ConfirmModal
          title="Vypnout automatizaci?"
          confirmLabel="Vypnout"
          confirmClass="warn"
          busy={busy}
          onConfirm={() => void doStop()}
          onCancel={() => setConfirmStop(false)}
        >
          {st.running.length > 0
            ? `Rozdělané joby (${st.running.length}) doběhnou, nový už si žádný agent nevezme. Až všichni skončí, automatizace se vypne a přijde ti zpráva (chat v appce + e-mail + notifikace).`
            : 'Nic neběží, vypne se hned a přijde ti o tom zpráva (chat v appce + e-mail + notifikace).'}{' '}
          Zapnout ji můžeš kdykoli tady; agenti se pak rozjedou do 15 minut.
        </ConfirmModal>
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
          {st.control.phase === 'stopped'
            ? `Automatizace je vypnutá a nic neběží, účet se přepne hned. Agenti na účtu ${labelOf(st, confirmSlug)} začnou pracovat, až automatizaci zapneš.`
            : `Běžící joby (${st.running.length}) doběhnou, nový už si žádný agent nevezme. Až bude všechno hotové, přijde ti zpráva a automatizace pokračuje na účtu ${labelOf(st, confirmSlug)}.`}
          {!st.accounts.find((a) => a.slug === confirmSlug)?.token_present &&
            ' Tenhle účet zatím nemá přihlášení pro agenty — po přepnutí bude potřeba na něm vložit prompt z docs/PRECHOD-NA-DRUHY-UCET.md.'}
        </ConfirmModal>
      )}
    </div>
  );
}
