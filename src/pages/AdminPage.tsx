import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getApi,
  type Kontakt,
  type KontaktStatus,
  type UserStats,
} from '../api';
import { useSession } from '../auth';
import {
  ALL_STATUSES,
  ErrorBox,
  Spinner,
  STATUS_LABELS,
  StatusBadge,
  errMsg,
  formatDateTime,
} from '../ui';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  GlobeIcon,
  PhoneIcon,
  RocketIcon,
  SearchIcon,
  XIcon,
} from '../icons';

const PAGE_SIZE = 50;

function KontaktDrawer({
  kontakt,
  onClose,
  onSaved,
}: {
  kontakt: Kontakt;
  onClose: () => void;
  onSaved: (updated: Kontakt) => void;
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
      onSaved(updated);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const clearLock = async () => {
    setBusy(true);
    setError('');
    try {
      const updated = await getApi().updateKontakt(session.token, kontakt.id, { clear_lock: true });
      onSaved(updated);
    } catch (e) {
      setError(errMsg(e));
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
        {kontakt.lock_by !== null && (
          <div className="info-box">
            Kontakt je zamčený (volající id {kontakt.lock_by}).{' '}
            <button className="pill-btn sm" onClick={() => void clearLock()} disabled={busy}>
              Uvolnit zámek
            </button>
          </div>
        )}

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

        <ErrorBox>{error}</ErrorBox>
        {savedFlash && (
          <div className="info-box">
            Uloženo <CheckIcon size={16} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="pill-btn go" onClick={() => void save()} disabled={busy || !dirty}>
            {busy ? 'Ukládám…' : 'Uložit změny'}
          </button>
          <button className="pill-btn" onClick={onClose} disabled={busy}>
            Zavřít
          </button>
        </div>
      </div>
    </>
  );
}

export default function AdminPage() {
  const session = useSession();
  const [searchParams] = useSearchParams();

  const [status, setStatus] = useState('');
  const [caller, setCaller] = useState('');
  const [rating, setRating] = useState('');
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [page, setPage] = useState(0);

  const [rows, setRows] = useState<Kontakt[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Kontakt | null>(null);
  const [callers, setCallers] = useState<UserStats[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const reloadTick = useRef(0);
  const [tick, setTick] = useState(0);

  // debounce fulltextu
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // seznam volajících (pro filtr) — z all_stats
  useEffect(() => {
    getApi()
      .allStats(session.token)
      .then(setCallers)
      .catch(() => setCallers([]));
  }, [session.token]);

  // počty pro status dropdown (1 dotaz s limit 1 na každý status)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const api = getApi();
        const counts = await Promise.all(
          ALL_STATUSES.map(async (s) => {
            const r = await api.listKontakty(session.token, { status: s, limit: 1 });
            return [s, r.total] as const;
          })
        );
        if (alive) setStatusCounts(Object.fromEntries(counts));
      } catch {
        // počty jsou jen kosmetika — chybu neukazujeme
      }
    })();
    return () => {
      alive = false;
    };
  }, [session.token, tick]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await getApi().listKontakty(session.token, {
        status: status || null,
        caller: caller || null,
        rating: rating || null,
        search: debouncedSearch.trim() || null,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setRows(r.rows);
      setTotal(r.total);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [session.token, status, caller, rating, debouncedSearch, page]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  const onSaved = (updated: Kontakt) => {
    setSelected(updated);
    setRows((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
    reloadTick.current += 1;
    setTick(reloadTick.current);
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const totalAll = useMemo(
    () => Object.values(statusCounts).reduce((a, b) => a + b, 0),
    [statusCounts]
  );

  return (
    <div>
      <p className="eyebrow">admin</p>
      <h1 className="page-title">
        Kontakty
        {total > 0 && <span className="count-pill">{total}</span>}
      </h1>

      <div className="filter-bar">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
          aria-label="Filtr statusu"
        >
          <option value="">
            Všechny statusy{totalAll ? ` (${totalAll})` : ''}
          </option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
              {statusCounts[s] !== undefined ? ` (${statusCounts[s]})` : ''}
            </option>
          ))}
        </select>
        <select
          value={caller}
          onChange={(e) => {
            setCaller(e.target.value);
            setPage(0);
          }}
          aria-label="Filtr volajícího"
        >
          <option value="">Všichni volající</option>
          {callers.map((c) => (
            <option key={c.user_id} value={c.display_name}>
              {c.display_name}
            </option>
          ))}
        </select>
        <select
          value={rating}
          onChange={(e) => {
            setRating(e.target.value);
            setPage(0);
          }}
          aria-label="Filtr známky"
        >
          <option value="">Známka: vše</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </select>
        <div className="search-wrap">
          <input
            className="search-input"
            placeholder="Hledat jméno, telefon, web, e-mail, poznámku…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <ErrorBox>{error}</ErrorBox>

      {loading ? (
        <Spinner label="Načítám kontakty…" />
      ) : rows.length === 0 ? (
        <div className="card empty-state">
          <div className="big-emoji"><SearchIcon size={56} /></div>
          <h2>Nic nenalezeno</h2>
          <p className="muted">Zkus změnit filtry nebo hledaný výraz.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="kontakty">
            <thead>
              <tr>
                <th>Jméno</th>
                <th>Telefon</th>
                <th>Status</th>
                <th>Známka</th>
                <th>Volal/a</th>
                <th>Web</th>
                <th>Změněno</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={selected?.id === r.id ? 'selected' : ''}
                  onClick={() => setSelected(r)}
                >
                  <td className="row-name">{r.name || '(beze jména)'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.phone || '—'}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td>{r.rating ? <span className="badge rating">{r.rating}</span> : '—'}</td>
                  <td>{r.last_caller || '—'}</td>
                  <td>
                    {r.web ? (
                      <a
                        href={r.web}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        odkaz
                      </a>
                    ) : (
                      <span className="muted">nemá</span>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }} className="muted">
                    {formatDateTime(r.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="pagination">
          <button
            className="pill-btn sm"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            <ArrowLeftIcon size={16} /> Předchozí
          </button>
          <span className="muted">
            strana {page + 1} / {pageCount}
          </span>
          <button
            className="pill-btn sm"
            disabled={page + 1 >= pageCount || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Další <ArrowRightIcon size={16} />
          </button>
        </div>
      )}

      {selected && (
        <KontaktDrawer
          kontakt={selected}
          onClose={() => setSelected(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
