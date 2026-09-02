// Sdílený detail kontaktu (drawer) — používá AdminPage i stránka Moji klienti.
// Admin: plná editace (update_kontakt, uvolnění zámku). Caller (readOnly): jen čtení.
// Obě role: sekce "Vzkazy agentovi" — vlákna tohoto kontaktu + composer.

import { useCallback, useEffect, useState } from 'react';
import {
  getApi,
  type ChatMessage,
  type Kontakt,
  type KontaktStatus,
  type ThreadDetail,
} from '../api';
import { audio } from '../audio';
import { useSession } from '../auth';
import {
  ALL_STATUSES,
  ErrorBox,
  STATUS_LABELS,
  Spinner,
  StatusBadge,
  errMsg,
  formatDateTime,
} from '../ui';
import {
  CheckIcon,
  GlobeIcon,
  MessageIcon,
  PhoneIcon,
  RocketIcon,
  SendIcon,
  XIcon,
} from '../icons';

/* ---------- Vzkazy agentovi (vlákna kontaktu + composer) ---------- */

function KontaktThreads({ kontakt }: { kontakt: Kontakt }) {
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
      const open = details
        .filter((d) => d.thread.status === 'open')
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
                    {m.apply_always ? ' · pravidlo' : ''}
                  </div>
                  {m.body}
                </div>
              </div>
            ))}
          </div>
        ))
      )}
      <ErrorBox>{error}</ErrorBox>
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

        {readOnly ? (
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

        {!readOnly && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="pill-btn go" onClick={() => void save()} disabled={busy || !dirty}>
              {busy ? 'Ukládám…' : 'Uložit změny'}
            </button>
            <button className="pill-btn" onClick={onClose} disabled={busy}>
              Zavřít
            </button>
          </div>
        )}

        <KontaktThreads kontakt={kontakt} />
      </div>
    </>
  );
}
