// Sdílený detail kontaktu (drawer) — používá AdminPage i stránka Moji klienti.
// Admin: editace (update_kontakt) — od migrace 024 jen u SVÝCH klientů (server posílá
// smi_upravit); u cizího kontaktu jen příznak a uvolnění zámku. Caller (readOnly): jen čtení.
// Všichni: „Označit jako mého klienta" (oznacit_za_sveho, migrace 024) u kontaktu, kterému
// sami volali a který je pořád ve frontě volání.
// Obě role: sekce "Vzkazy agentovi" — vlákna tohoto kontaktu + composer.

import { useCallback, useEffect, useState } from 'react';
import {
  getApi,
  type ChatMessage,
  type FlagKind,
  type Kontakt,
  type KontaktStatus,
  type ThreadDetail,
} from '../api';
import { audio } from '../audio';
import { useSession } from '../auth';
import {
  ALL_FLAGS,
  ALL_STATUSES,
  ErrorBox,
  FLAG_COLORS,
  FLAG_HINTS,
  FLAG_LABELS,
  STATUS_LABELS,
  Spinner,
  StatusBadge,
  errMsg,
  formatDateTime,
  pravidloPopisek,
} from '../ui';
import {
  CheckIcon,
  FlagIcon,
  GlobeIcon,
  MessageIcon,
  PhoneIcon,
  RocketIcon,
  SendIcon,
  XIcon,
} from '../icons';

/* ---------- červený příznak (migrace 005) ---------- */

/**
 * Panel příznaku. Volající ho vidí jen jako červenou cedulku s vysvětlením,
 * admin může příznak nasadit, přepsat nebo označit za vyřešený.
 */
function FlagPanel({
  kontakt,
  readOnly,
  onSaved,
}: {
  kontakt: Kontakt;
  readOnly: boolean;
  onSaved?: (updated: Kontakt) => void;
}) {
  const session = useSession();
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<FlagKind>(kontakt.flag_kind ?? 'jine');
  const [note, setNote] = useState(kontakt.flag_note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setEditing(false);
    setKind(kontakt.flag_kind ?? 'jine');
    setNote(kontakt.flag_note ?? '');
    setError('');
  }, [kontakt.id, kontakt.flag_kind, kontakt.flag_note]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const updated = await getApi().setFlag(session.token, kontakt.id, kind, note);
      audio.play('success');
      onSaved?.(updated);
      setEditing(false);
    } catch (e) {
      setError(errMsg(e));
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError('');
    try {
      const updated = await getApi().clearFlag(session.token, kontakt.id);
      audio.play('success');
      onSaved?.(updated);
    } catch (e) {
      setError(errMsg(e));
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };

  const flagged = kontakt.flag_kind !== null && kontakt.flag_kind !== undefined;

  if (!flagged && (readOnly || editing === false)) {
    if (readOnly) return null;
    return (
      <button
        className="pill-btn sm flag-add-btn"
        onClick={() => setEditing(true)}
        style={{ marginTop: 12 }}
      >
        <FlagIcon size={14} /> Označit klienta
      </button>
    );
  }

  const color = flagged
    ? FLAG_COLORS[kontakt.flag_kind as FlagKind]
    : { bg: '#c0392b', fg: '#fdf6e9' };

  return (
    <div className="flag-panel" style={{ borderColor: color.bg }}>
      <div className="flag-panel-head" style={{ background: color.bg, color: color.fg }}>
        <FlagIcon size={16} />
        <strong>
          {flagged ? FLAG_LABELS[kontakt.flag_kind as FlagKind] : 'Označit klienta'}
        </strong>
      </div>

      {flagged && !editing && (
        <div className="flag-panel-body">
          <p className="flag-hint">{FLAG_HINTS[kontakt.flag_kind as FlagKind]}</p>
          {kontakt.flag_note && <p className="flag-note">{kontakt.flag_note}</p>}
          <p className="muted flag-meta">
            označil/a {kontakt.flagged_by || '—'}
            {kontakt.flagged_at ? ` · ${formatDateTime(kontakt.flagged_at)}` : ''}
          </p>
          {!readOnly && (
            <div className="flag-actions">
              <button className="pill-btn go sm" onClick={() => void clear()} disabled={busy}>
                <CheckIcon size={14} /> Vyřešeno
              </button>
              <button className="pill-btn sm" onClick={() => setEditing(true)} disabled={busy}>
                Upravit
              </button>
            </div>
          )}
        </div>
      )}

      {!readOnly && editing && (
        <div className="flag-panel-body">
          <div className="field">
            <label>Co je špatně</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as FlagKind)}>
              {ALL_FLAGS.map((f) => (
                <option key={f} value={f}>
                  {FLAG_LABELS[f]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Poznámka pro ostatní</label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Napiš konkrétně, co u klienta chybí nebo není ověřené…"
            />
          </div>
          <ErrorBox>{error}</ErrorBox>
          <div className="flag-actions">
            <button className="pill-btn go sm" onClick={() => void save()} disabled={busy}>
              {busy ? 'Ukládám…' : 'Uložit příznak'}
            </button>
            <button
              className="pill-btn sm"
              onClick={() => {
                setEditing(false);
                setKind(kontakt.flag_kind ?? 'jine');
                setNote(kontakt.flag_note ?? '');
              }}
              disabled={busy}
            >
              Zpět
            </button>
          </div>
        </div>
      )}

      {flagged && !editing && <ErrorBox>{error}</ErrorBox>}
    </div>
  );
}

/* ---------- Vzkazy agentovi (vlákna kontaktu + composer) ---------- */

function KontaktThreads({ kontakt, canWrite }: { kontakt: Kontakt; canWrite: boolean }) {
  const session = useSession();
  const [details, setDetails] = useState<ThreadDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const api = getApi();
        const all = await api.listThreads(session.token);
        const mine = all.filter((t) => t.kontakt_id === kontakt.id);
        const loaded = await Promise.all(mine.map((t) => api.getThread(session.token, t.id)));
        loaded.sort(
          (a, b) =>
            new Date(a.thread.created_at).getTime() - new Date(b.thread.created_at).getTime() ||
            a.thread.id - b.thread.id
        );
        setDetails(loaded);
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
    [session.token, kontakt.id]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError('');
    try {
      const api = getApi();
      // poslední otevřené vlákno tohoto kontaktu — jinak založit nové
      // migrace 027: jen vlákno, do kterého smí psát (cizí je jen ke čtení)
      const open = details
        .filter((d) => d.thread.status === 'open' && d.thread.smi_psat !== false)
        .sort(
          (a, b) =>
            new Date(b.thread.last_message_at).getTime() -
              new Date(a.thread.last_message_at).getTime() || b.thread.id - a.thread.id
        )[0];
      if (open) {
        await api.postThreadMessage(session.token, open.thread.id, body, false);
      } else {
        const subject = `Vzkaz od ${session.display_name}: ${kontakt.name || `#${kontakt.id}`}`;
        await api.createThread(session.token, subject, body, kontakt.id);
      }
      audio.play('send');
      setDraft('');
      await load(true);
    } catch (e) {
      setError(errMsg(e));
      audio.play('error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="drawer-chat">
      <div className="drawer-section-title">
        <MessageIcon size={14} /> Vzkazy agentovi
      </div>
      {loading ? (
        <Spinner label="Načítám vzkazy…" />
      ) : details.length === 0 ? (
        <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
          Zatím žádné vzkazy k tomuto kontaktu. Napiš první — založí se nové vlákno.
        </p>
      ) : (
        details.map((d) => (
          <div key={d.thread.id} className="drawer-thread">
            <div className="drawer-thread-head">
              <span className="drawer-thread-subject">{d.thread.subject}</span>
              <span className={`badge ${d.thread.status === 'open' ? 'yellow' : 'neutral'}`}>
                {d.thread.status === 'open' ? 'otevřeno' : 'vyřešeno'}
              </span>
            </div>
            {d.messages.map((m: ChatMessage) => (
              <div key={m.id} className={`bubble-row ${m.sender_type}`}>
                <div className={`bubble ${m.sender_type}`}>
                  <div className="bubble-meta">
                    {m.sender_name} · {formatDateTime(m.created_at)}
                    {pravidloPopisek(m)}
                  </div>
                  {m.body}
                </div>
              </div>
            ))}
          </div>
        ))
      )}
      <ErrorBox>{error}</ErrorBox>
      {canWrite ? (
        <div className="composer-row">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Napiš vzkaz agentovi… (Enter odešle, Shift+Enter nový řádek)"
          />
          <button
            className="pill-btn hot send-btn"
            data-sfx="none"
            onClick={() => void send()}
            disabled={sending || !draft.trim()}
            title="Odeslat"
          >
            <SendIcon size={18} />
          </button>
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
          Vzkazy agentovi k tomuhle kontaktu píše ten, kdo mu volá, jeho super admin nebo Albert.
        </p>
      )}
    </div>
  );
}

/* ---------- drawer ---------- */

export default function KontaktDrawer({
  kontakt,
  onClose,
  onSaved,
  readOnly = false,
}: {
  kontakt: Kontakt;
  onClose: () => void;
  onSaved?: (updated: Kontakt) => void;
  readOnly?: boolean;
}) {
  const session = useSession();
  const [status, setStatus] = useState<KontaktStatus>(kontakt.status);
  const [email, setEmail] = useState(kontakt.email ?? '');
  const [note, setNote] = useState(kontakt.note ?? '');
  const [cenaWeb, setCenaWeb] = useState(kontakt.cena_web ?? '');
  const [cenaHosting, setCenaHosting] = useState(kontakt.cena_hosting ?? '');
  const [rating, setRating] = useState(kontakt.rating ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  // Obsah kontaktu (stav, e-mail, ceny, poznámku) smí měnit jen ten, komu kontakt patří,
  // jeho super admin a Albert — rozhoduje server (smi_upravit, migrace 024). Příznak
  // a zámek smí admin u každého kontaktu, proto se `readOnly` pro ně nemění.
  const cizi = !readOnly && kontakt.smi_upravit === false;
  const obsahJenCteni = readOnly || cizi;
  // „Označit jako mého klienta": volal mu (je_muj bez toho, aby byl last_caller) a kontakt
  // je ve frontě volání. Stav ani fronta se tím nemění (server to hlídá sám).
  const lzeOznacit =
    kontakt.je_muj === true &&
    kontakt.last_caller !== session.display_name &&
    (kontakt.status === 'nekontaktovano' || kontakt.status === 'nedovolano');

  const claim = async () => {
    setBusy(true);
    setError('');
    try {
      const updated = await getApi().claimKontakt(session.token, kontakt.id);
      audio.play('success');
      onSaved?.(updated);
    } catch (e) {
      setError(errMsg(e));
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };

  const dirty =
    status !== kontakt.status ||
    email !== (kontakt.email ?? '') ||
    note !== (kontakt.note ?? '') ||
    cenaWeb !== (kontakt.cena_web ?? '') ||
    cenaHosting !== (kontakt.cena_hosting ?? '') ||
    rating !== (kontakt.rating ?? '');

  const save = async () => {
    const patch: Record<string, unknown> = {};
    if (status !== kontakt.status) patch.status = status;
    if (email !== (kontakt.email ?? '')) patch.email = email.trim() || null;
    if (note !== (kontakt.note ?? '')) patch.note = note || null;
    if (cenaWeb !== (kontakt.cena_web ?? '')) patch.cena_web = cenaWeb.trim() || null;
    if (cenaHosting !== (kontakt.cena_hosting ?? '')) patch.cena_hosting = cenaHosting.trim() || null;
    if (rating !== (kontakt.rating ?? '')) patch.rating = rating;
    if (Object.keys(patch).length === 0) return;
    setBusy(true);
    setError('');
    try {
      const updated = await getApi().updateKontakt(session.token, kontakt.id, patch);
      audio.play('success');
      onSaved?.(updated);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e) {
      setError(errMsg(e));
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };

  const clearLock = async () => {
    setBusy(true);
    setError('');
    try {
      const updated = await getApi().updateKontakt(session.token, kontakt.id, { clear_lock: true });
      audio.play('success');
      onSaved?.(updated);
    } catch (e) {
      setError(errMsg(e));
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer">
        <button className="drawer-close" onClick={onClose} aria-label="Zavřít">
          <XIcon size={20} />
        </button>
        <p className="eyebrow">kontakt #{kontakt.id}</p>
        <h2>{kontakt.name || '(beze jména)'}</h2>
        <p className="meta-line">
          <PhoneIcon size={15} /> {kontakt.phone || '—'} · obor: {kontakt.obor}
        </p>
        <p className="meta-line">
          naposledy volal/a: {kontakt.last_caller || '—'} · změněno {formatDateTime(kontakt.updated_at)}
        </p>
        {kontakt.web && (
          <p className="meta-line">
            <GlobeIcon size={15} />{' '}
            <a href={kontakt.web} target="_blank" rel="noreferrer">
              {kontakt.web}
            </a>
          </p>
        )}
        {kontakt.live_url && (
          <p className="meta-line">
            <RocketIcon size={15} /> nový web:{' '}
            <a href={kontakt.live_url} target="_blank" rel="noreferrer">
              {kontakt.live_url}
            </a>
          </p>
        )}
        {!readOnly && kontakt.lock_by !== null && (
          <div className="info-box">
            Kontakt je zamčený (volající id {kontakt.lock_by}).{' '}
            <button className="pill-btn sm" onClick={() => void clearLock()} disabled={busy}>
              Uvolnit zámek
            </button>
          </div>
        )}

        {lzeOznacit && (
          <div className="info-box">
            Tomuhle kontaktu jsi volal/a. Když se ti ozval zpátky, můžeš si ho označit jako svého
            klienta — zůstane ve frontě volání, jen se u něj zapíše, že je tvůj.{' '}
            <button className="pill-btn sm" onClick={() => void claim()} disabled={busy}>
              Označit jako mého klienta
            </button>
          </div>
        )}

        <FlagPanel kontakt={kontakt} readOnly={readOnly} onSaved={onSaved} />

        {cizi && (
          <p className="muted" style={{ fontSize: 13.5, margin: '12px 0 0' }}>
            Tohle není tvůj klient — stav, e-mail, ceny a poznámky mu upravuje ten, kdo mu volá,
            jeho super admin nebo Albert. Příznak a zámek tu měnit můžeš.
          </p>
        )}

        {obsahJenCteni ? (
          <>
            <p className="meta-line" style={{ marginTop: 14 }}>
              status: <StatusBadge status={kontakt.status} />
              {kontakt.rating && (
                <>
                  {' '}
                  · známka: <span className="badge rating">{kontakt.rating}</span>
                </>
              )}
            </p>
            <p className="meta-line">e-mail: {kontakt.email || '—'}</p>
            <p className="meta-line">
              cena webu: {kontakt.cena_web || '—'} · cena hostingu: {kontakt.cena_hosting || '—'}
            </p>
            {kontakt.note && (
              <div className="field">
                <label>Poznámky</label>
                <div className="drawer-note-ro">{kontakt.note}</div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="field" style={{ marginTop: 14 }}>
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as KontaktStatus)}>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Známka zájmu</label>
              <select value={rating} onChange={(e) => setRating(e.target.value)}>
                <option value="">—</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C — chtějí, ale vlažně</option>
              </select>
            </div>
            <div className="field">
              <label>E-mail</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Cena webu</label>
                <input value={cenaWeb} onChange={(e) => setCenaWeb(e.target.value)} />
              </div>
              <div className="field">
                <label>Cena hostingu</label>
                <input value={cenaHosting} onChange={(e) => setCenaHosting(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Poznámky</label>
              <textarea rows={7} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </>
        )}

        <ErrorBox>{error}</ErrorBox>
        {savedFlash && (
          <div className="info-box">
            Uloženo <CheckIcon size={16} />
          </div>
        )}

        {!obsahJenCteni && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="pill-btn go" onClick={() => void save()} disabled={busy || !dirty}>
              {busy ? 'Ukládám…' : 'Uložit změny'}
            </button>
            <button className="pill-btn" onClick={onClose} disabled={busy}>
              Zavřít
            </button>
          </div>
        )}

        {/* Vzkaz agentovi je pro workera závazný pokyn, takže ke klientovi píše jen ten, kdo ho
            smí upravovat (migrace 025): volající svůj klient (je_muj), admin a super admin
            podle smi_upravit (migrace 024). Server to hlídá sám. */}
        <KontaktThreads
          kontakt={kontakt}
          canWrite={readOnly ? kontakt.je_muj !== false : kontakt.smi_upravit !== false}
        />
      </div>
    </>
  );
}
