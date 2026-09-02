// Moji klienti — kontakty přihlášeného uživatele (RPC my_kontakty, obě role).
// Fulltext filtr je čistě klientský; klik na řádek otevře sdílený detail kontaktu.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getApi, type Kontakt } from '../api';
import { audio } from '../audio';
import { useSession } from '../auth';
import KontaktDrawer from '../components/KontaktDrawer';
import { ErrorBox, Spinner, StatusBadge, errMsg, formatDateTime } from '../ui';
import { SearchIcon } from '../icons';

export default function MojiPage() {
  const session = useSession();
  const [rows, setRows] = useState<Kontakt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Kontakt | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await getApi().myKontakty(session.token, 500, 0);
      setRows(r.rows);
    } catch (e) {
      setError(errMsg(e));
      audio.play('error');
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) =>
      [c.name, c.phone, c.web, c.email, c.note].some(
        (v) => v && v.toLowerCase().includes(q)
      )
    );
  }, [rows, search]);

  const onSaved = (updated: Kontakt) => {
    setSelected(updated);
    setRows((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
  };

  return (
    <div>
      <p className="eyebrow">moji klienti</p>
      <h1 className="page-title">
        Moji klienti
        {rows.length > 0 && <span className="count-pill">{rows.length}</span>}
      </h1>

      <div className="filter-bar">
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
        <Spinner label="Načítám klienty…" />
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <div className="big-emoji"><SearchIcon size={56} /></div>
          <h2>{rows.length === 0 ? 'Zatím žádní klienti' : 'Nic nenalezeno'}</h2>
          <p className="muted">
            {rows.length === 0
              ? 'Jakmile někomu zavoláš, objeví se tady.'
              : 'Zkus změnit hledaný výraz.'}
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="kontakty">
            <thead>
              <tr>
                <th>Jméno</th>
                <th>Telefon</th>
                <th>Status</th>
                <th>Změněno</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
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
                  <td style={{ whiteSpace: 'nowrap' }} className="muted">
                    {formatDateTime(r.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <KontaktDrawer
          kontakt={selected}
          onClose={() => setSelected(null)}
          onSaved={onSaved}
          readOnly={session.role !== 'admin'}
        />
      )}
    </div>
  );
}
