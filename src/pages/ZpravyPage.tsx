import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getApi,
  type ChatThread,
  type Kontakt,
  type ThreadDetail,
  type ThreadStatus,
} from '../api';
import { useSession } from '../auth';
import { ErrorBox, Spinner, errMsg, formatDateTime } from '../ui';
import {
  ArrowLeftIcon,
  CheckIcon,
  InboxIcon,
  MessageIcon,
  PlusIcon,
  SendIcon,
  XIcon,
} from '../icons';

/** Relativní čas pro seznam vláken ("před 5 min", "včera", …). */
function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return 'teď';
  if (min < 60) return `před ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `před ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'včera';
  if (d < 7) return `před ${d} dny`;
  return new Date(iso).toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
}

type Filter = 'all' | 'open' | 'resolved';

const FILTER_LABELS: Record<Filter, string> = {
  all: 'Vše',
  open: 'Otevřené',
  resolved: 'Vyřešené',
};

function filterToStatus(f: Filter): ThreadStatus | null {
  return f === 'all' ? null : f;
}

/* ---------- modal: nový chat ---------- */

function ComposeModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (threadId: number) => void;
}) {
  const session = useSession();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [kontakt, setKontakt] = useState<Kontakt | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Kontakt[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      getApi()
        .listKontakty(session.token, { search: q, limit: 8 })
        .then((r) => {
          if (!cancelled) setResults(r.rows);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, session.token]);

  const create = async () => {
    if (!subject.trim()) {
      setError('Předmět nesmí být prázdný.');
      return;
    }
    if (!body.trim()) {
      setError('Zpráva nesmí být prázdná.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { thread_id } = await getApi().createThread(
        session.token,
        subject,
        body,
        kontakt?.id ?? null
      );
      onCreated(thread_id);
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Nový chat</h3>
        <div className="field">
          <label>
            Předmět <span className="req">*</span>
          </label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="O čem se bavíme…"
            autoFocus
          />
        </div>
        <div className="field">
          <label>
            Zpráva <span className="req">*</span>
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="První zpráva ve vlákně…"
          />
        </div>
        <div className="field">
          <label>Kontakt (nepovinné)</label>
          {kontakt ? (
            <div className="picked-kontakt">
              <span className="badge yellow">{kontakt.name || `#${kontakt.id}`}</span>
              <button
                type="button"
                className="tb-btn"
                onClick={() => setKontakt(null)}
                title="Odebrat kontakt"
              >
                <XIcon size={16} />
              </button>
            </div>
          ) : (
            <>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Hledat kontakt podle jména či telefonu…"
              />
              {searching && <div className="muted" style={{ fontSize: 13 }}>Hledám…</div>}
              {!searching && results.length > 0 && (
                <div className="kontakt-results">
                  {results.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      className="kontakt-result"
                      onClick={() => {
                        setKontakt(c);
                        setSearch('');
                        setResults([]);
                      }}
                    >
                      <b>{c.name || `#${c.id}`}</b>
                      {c.phone && <span className="muted"> · {c.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <ErrorBox>{error}</ErrorBox>
        <div className="modal-actions">
          <button className="pill-btn" onClick={onClose} disabled={busy}>
            Zpět
          </button>
          <button className="pill-btn go" onClick={() => void create()} disabled={busy}>
            {busy ? 'Zakládám…' : 'Založit chat'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- levý panel: seznam vláken ---------- */

function ThreadListItem({
  t,
  selected,
  onClick,
}: {
  t: ChatThread;
  selected: boolean;
  onClick: () => void;
}) {
  const open = t.status === 'open';
  return (
    <button type="button" className={`thread-item${selected ? ' selected' : ''}`} onClick={onClick}>
      <div className="thread-top">
        <span className="thread-subject">{t.subject}</span>
        <span className="thread-time">{relTime(t.last_message_at)}</span>
      </div>
      {t.last_message_preview && (
        <div className="thread-preview">
          <b>{t.last_sender_type === 'admin' ? 'Vy: ' : 'Agent: '}</b>
          {t.last_message_preview}
        </div>
      )}
      <div className="thread-chips">
        <span className={`badge ${open ? 'yellow' : 'neutral'}`}>
          {open ? 'otevřeno' : 'vyřešeno'}
        </span>
        {t.kontakt_id && (
          <span className="badge chip-kontakt">{t.kontakt_name || `#${t.kontakt_id}`}</span>
        )}
      </div>
    </button>
  );
}

/* ---------- pravý panel: chat ---------- */

function ThreadView({
  detail,
  loading,
  onBack,
  onSent,
  onResolved,
}: {
  detail: ThreadDetail | null;
  loading: boolean;
  onBack: () => void;
  onSent: (d: ThreadDetail) => void;
  onResolved: () => void;
}) {
  const session = useSession();
  const [draft, setDraft] = useState('');
  const [applyAlways, setApplyAlways] = useState(false);
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');
  const msgsRef = useRef<HTMLDivElement | null>(null);
  const threadId = detail?.thread.id ?? null;
  const msgCount = detail?.messages.length ?? 0;

  // reset rozepsané odpovědi při přepnutí vlákna
  useEffect(() => {
    setDraft('');
    setApplyAlways(false);
    setError('');
  }, [threadId]);

  // autoscroll dolů při otevření vlákna a při nové zprávě
  useEffect(() => {
    const el = msgsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [threadId, msgCount]);

  if (!detail) {
    return (
      <div className="card chat-thread-pane">
        <div className="chat-placeholder">
          {loading ? (
            <Spinner label="Načítám vlákno…" />
          ) : (
            <>
              <MessageIcon size={48} />
              <p className="muted">Vyber vlákno vlevo, nebo založ nový chat.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  const { thread, messages } = detail;
  const open = thread.status === 'open';

  const send = async () => {
    if (!draft.trim() || sending || threadId == null) return;
    setSending(true);
    setError('');
    try {
      const msg = await getApi().postThreadMessage(session.token, threadId, draft, applyAlways);
      setDraft('');
      setApplyAlways(false);
      onSent({
        thread: { ...thread, status: 'open', last_message_at: msg.created_at },
        messages: [...messages, msg],
      });
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSending(false);
    }
  };

  const resolve = async () => {
    if (resolving || threadId == null) return;
    setResolving(true);
    setError('');
    try {
      await getApi().resolveThread(session.token, threadId);
      onResolved();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="card chat-thread-pane">
      <div className="chat-head">
        <button type="button" className="tb-btn chat-back" onClick={onBack} title="Zpět na seznam">
          <ArrowLeftIcon size={18} />
        </button>
        <div className="chat-head-title">
          <h2 className="chat-subject">{thread.subject}</h2>
          <div className="chat-head-meta">
            <span className={`badge ${open ? 'yellow' : 'neutral'}`}>
              {open ? 'otevřeno' : 'vyřešeno'}
            </span>
            {thread.kontakt_id && (
              <span className="badge chip-kontakt">
                {thread.kontakt_name || `#${thread.kontakt_id}`}
              </span>
            )}
          </div>
        </div>
        <span className="spacer" />
        {open && (
          <button
            className="pill-btn go sm"
            onClick={() => void resolve()}
            disabled={resolving}
          >
            {resolving ? (
              'Ukládám…'
            ) : (
              <>
                <CheckIcon size={16} /> Vyřešeno
              </>
            )}
          </button>
        )}
      </div>

      <div className="chat-msgs" ref={msgsRef}>
        {messages.map((m) => (
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

      <div className="chat-composer">
        <ErrorBox>{error}</ErrorBox>
        {!open && (
          <div className="muted" style={{ fontSize: 13 }}>
            Vlákno je vyřešené — odpovědí ho znovu otevřeš.
          </div>
        )}
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
            placeholder="Napiš odpověď… (Enter odešle, Shift+Enter nový řádek)"
          />
          <button
            className="pill-btn hot send-btn"
            onClick={() => void send()}
            disabled={sending || !draft.trim()}
            title="Odeslat"
          >
            <SendIcon size={18} />
          </button>
        </div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={applyAlways}
            onChange={(e) => setApplyAlways(e.target.checked)}
          />
          Takto řešit vždy (zapsat do pravidel)
        </label>
      </div>
    </div>
  );
}

/* ---------- stránka ---------- */

export default function ZpravyPage() {
  const session = useSession();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  const loadThreads = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const list = await getApi().listThreads(session.token, filterToStatus(filter));
        setThreads(list);
        setError('');
      } catch (e) {
        if (!silent) setError(errMsg(e));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [session.token, filter]
  );

  const loadDetail = useCallback(
    async (threadId: number, silent = false) => {
      if (!silent) {
        setDetail(null);
        setDetailLoading(true);
      }
      try {
        const d = await getApi().getThread(session.token, threadId);
        setDetail((prev) => {
          // tichý refresh: nezahazovat stav, když se mezitím přepnulo vlákno
          if (silent && prev && prev.thread.id !== threadId) return prev;
          return d;
        });
        if (!silent) setError('');
      } catch (e) {
        if (!silent) setError(errMsg(e));
      } finally {
        if (!silent) setDetailLoading(false);
      }
    },
    [session.token]
  );

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  // poll každých 30 s: seznam + otevřené vlákno (tichý refresh, drží scroll i rozepsaný text)
  useEffect(() => {
    const timer = setInterval(() => {
      void loadThreads(true);
      if (selectedId != null) void loadDetail(selectedId, true);
    }, 30000);
    return () => clearInterval(timer);
  }, [loadThreads, loadDetail, selectedId]);

  const openThread = (id: number) => {
    setSelectedId(id);
    void loadDetail(id);
  };

  const openCount = threads.filter((t) => t.status === 'open').length;

  return (
    <div>
      <p className="eyebrow">admin · chat s AI agenty</p>
      <h1 className="page-title">
        Zprávy
        {filter !== 'resolved' && openCount > 0 && (
          <span className="count-pill">{openCount} otevřených</span>
        )}
      </h1>

      <ErrorBox>{error}</ErrorBox>

      <div className={`chat-layout${selectedId != null ? ' has-selection' : ''}`}>
        <div className="card chat-list-pane">
          <div className="chat-list-head">
            <div className="chat-list-toolbar">
              <div className="segmented chat-filter">
                {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={filter === f ? 'active' : ''}
                    onClick={() => setFilter(f)}
                  >
                    {FILTER_LABELS[f]}
                  </button>
                ))}
              </div>
              <button className="pill-btn sm" onClick={() => setComposeOpen(true)}>
                <PlusIcon size={15} /> Nový chat
              </button>
            </div>
          </div>
          <div className="chat-list-scroll">
            {loading && <Spinner label="Načítám vlákna…" />}
            {!loading && threads.length === 0 && (
              <div className="empty-state" style={{ padding: '36px 12px' }}>
                <div className="big-emoji"><InboxIcon size={44} /></div>
                <h2 style={{ fontSize: 19 }}>Žádná vlákna</h2>
                <p className="muted" style={{ fontSize: 14 }}>
                  {filter === 'resolved'
                    ? 'Zatím nic vyřešeného.'
                    : 'Agenti zatím nic nepotřebují. Paráda.'}
                </p>
              </div>
            )}
            {!loading &&
              threads.map((t) => (
                <ThreadListItem
                  key={t.id}
                  t={t}
                  selected={t.id === selectedId}
                  onClick={() => openThread(t.id)}
                />
              ))}
          </div>
        </div>

        <ThreadView
          detail={detail}
          loading={detailLoading}
          onBack={() => {
            setSelectedId(null);
            setDetail(null);
          }}
          onSent={(d) => {
            setDetail(d);
            void loadThreads(true);
          }}
          onResolved={() => {
            setDetail((prev) =>
              prev ? { ...prev, thread: { ...prev.thread, status: 'resolved' } } : prev
            );
            void loadThreads(true);
          }}
        />
      </div>

      {composeOpen && (
        <ComposeModal
          onClose={() => setComposeOpen(false)}
          onCreated={(threadId) => {
            setComposeOpen(false);
            setSelectedId(threadId);
            void loadDetail(threadId);
            void loadThreads(true);
          }}
        />
      )}
    </div>
  );
}
