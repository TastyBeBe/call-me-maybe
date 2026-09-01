import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApi, type AdminMessage } from '../api';
import { useSession } from '../auth';
import { ErrorBox, Spinner, errMsg, formatDateTime } from '../ui';
import { CheckIcon, InboxIcon } from '../icons';

function MessageCard({
  msg,
  onResolved,
}: {
  msg: AdminMessage;
  onResolved: (m: AdminMessage) => void;
}) {
  const session = useSession();
  const [reply, setReply] = useState('');
  const [applyAlways, setApplyAlways] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = msg.status === 'open';

  const resolve = async () => {
    if (!reply.trim()) {
      setError('Napiš odpověď — prázdnou to nejde uzavřít.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const updated = await getApi().replyAdminMessage(session.token, msg.id, reply, applyAlways);
      onResolved(updated);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`card msg-card${open ? '' : ' resolved'}`}>
      <div className="msg-head">
        <h3 className="msg-subject">{msg.subject || '(bez předmětu)'}</h3>
        <span className={`badge ${open ? 'yellow' : 'neutral'}`}>
          {open ? 'otevřeno' : 'vyřešeno'}
        </span>
        {msg.apply_always && <span className="badge rating">pravidlo</span>}
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>
          {msg.from_agent || 'agent'} · {formatDateTime(msg.created_at)}
        </span>
      </div>

      {msg.kontakt_id && (
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
          Kontakt:{' '}
          <Link to={`/admin?search=${encodeURIComponent(msg.kontakt_phone || msg.kontakt_name || '')}`}>
            {msg.kontakt_name || `#${msg.kontakt_id}`}
          </Link>
          {msg.kontakt_phone ? ` · ${msg.kontakt_phone}` : ''}
        </p>
      )}

      <div className="msg-body">{msg.body}</div>

      {open ? (
        <>
          <textarea
            placeholder="Napiš agentovi odpověď…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <ErrorBox>{error}</ErrorBox>
          <div className="msg-actions">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={applyAlways}
                onChange={(e) => setApplyAlways(e.target.checked)}
              />
              Takto řešit vždy (zapsat do pravidel)
            </label>
            <span className="spacer" />
            <button className="pill-btn go" onClick={() => void resolve()} disabled={busy}>
              {busy ? (
                'Ukládám…'
              ) : (
                <>
                  <CheckIcon size={18} /> Vyřešeno
                </>
              )}
            </button>
          </div>
        </>
      ) : (
        msg.reply && (
          <div className="msg-reply-box">
            <b>Odpověď{msg.resolved_at ? ` (${formatDateTime(msg.resolved_at)})` : ''}:</b>{' '}
            {msg.reply}
          </div>
        )
      )}
    </div>
  );
}

export default function ZpravyPage() {
  const session = useSession();
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await getApi().listAdminMessages(session.token);
      setMessages(list);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCount = messages.filter((m) => m.status === 'open').length;

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      <p className="eyebrow">admin · dotazy od AI agentů</p>
      <h1 className="page-title">
        Zprávy
        {openCount > 0 && <span className="count-pill">{openCount} otevřených</span>}
      </h1>

      <ErrorBox>{error}</ErrorBox>
      {loading && <Spinner label="Načítám zprávy…" />}

      {!loading && messages.length === 0 && !error && (
        <div className="card empty-state">
          <div className="big-emoji"><InboxIcon size={56} /></div>
          <h2>Žádné zprávy</h2>
          <p className="muted">Agenti zatím nic nepotřebují. Paráda.</p>
        </div>
      )}

      {messages.map((m) => (
        <MessageCard
          key={m.id}
          msg={m}
          onResolved={(updated) =>
            setMessages((ms) => ms.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)))
          }
        />
      ))}
    </div>
  );
}
