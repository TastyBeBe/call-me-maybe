import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getApi,
  type Kontakt,
  type UserStats,
} from '../api';
import { audio } from '../audio';
import { useSession } from '../auth';
import KontaktDrawer from '../components/KontaktDrawer';
import {
  ALL_STATUSES,
  ErrorBox,
  FlagBadge,
  Spinner,
  STATUS_LABELS,
  StatusBadge,
  errMsg,
  formatDateTime,
} from '../ui';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  SearchIcon,
} from '../icons';

const PAGE_SIZE = 50;

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
      audio.play('error');
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
                  <td className="row-name">
                    <FlagBadge kontakt={r} compact /> {r.name || '(beze jména)'}
                  </td>
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
