// Moji klienti — kontakty přihlášeného uživatele (RPC my_kontakty, všechny role).
// Super admin si může vybrat kohokoli a vidí jeho klienty (migrace 023, od 027 kohokoli;
// server to hlídá — ostatním cizí klienty nevydá).
// Fulltext filtr je čistě klientský; klik na řádek otevře sdílený detail kontaktu.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getApi, type Kontakt } from '../api';
import { audio } from '../audio';
import { useSession } from '../auth';
import KontaktDrawer from '../components/KontaktDrawer';
import PersonPicker, { usePeople } from '../components/PersonPicker';
import { isAdminRole } from '../roles';
import { ErrorBox, FlagBadge, Spinner, StatusBadge, errMsg, formatDateTime } from '../ui';
import { SearchIcon } from '../icons';

/**
 * Kolik řádků se načte najednou. ⚠ ZVEDNUTO z 500 (Albert 2026-09-24): Mikuláš má
 * 653 klientů a 153 nejstarších (odmítnutých) se na stránku vůbec nedostalo — a protože
 * hledání je jen v načtených řádcích, nešly ani najít. Když by jich někdo měl víc,
 * stránka to řekne (viz „zobrazeno X z Y") a zbytek najde v Kontaktech.
 */
const MOJI_LIMIT = 2000;

export default function MojiPage() {
  const session = useSession();
  const people = usePeople();
  const [userId, setUserId] = useState<number | null>(session.user_id);
  const [rows, setRows] = useState<Kontakt[]>([]);
  // ⚠ Počet se bere z `total` od serveru, ne z `rows.length` (Albert 2026-09-12:
  // „each of them are showing something different").
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Kontakt | null>(null);

  const cizi = userId !== null && userId !== session.user_id;
  const kohoJmeno = cizi ? people.find((p) => p.user_id === userId)?.display_name ?? '' : '';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await getApi().myKontakty(session.token, MOJI_LIMIT, 0, cizi ? userId : null);
      setRows(r.rows);
      setTotal(r.total ?? r.rows.length);
    } catch (e) {
      setError(errMsg(e));
      audio.play('error');
    } finally {
      setLoading(false);
    }
  }, [session.token, userId, cizi]);

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
      <p className="eyebrow">{cizi ? `klienti: ${kohoJmeno}` : 'moji klienti'}</p>
      <h1 className="page-title">
        {cizi ? `Klienti — ${kohoJmeno}` : 'Moji klienti'}
        {total > 0 && <span className="count-pill">{total}</span>}
      </h1>

      <PersonPicker
        people={people}
        value={userId}
        onChange={(id) => {
          setUserId(id ?? session.user_id);
          setSelected(null);
        }}
        label="Čí klienty zobrazit"
      />

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
      {!loading && total > rows.length && (
        <p className="muted" style={{ margin: '0 0 10px' }}>
          Zobrazeno {rows.length} z {total} (nejdůležitější nahoře). Ostatní najdeš v Kontaktech
          hledáním.
        </p>
      )}

      {loading ? (
        <Spinner label="Načítám klienty…" />
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <div className="big-emoji"><SearchIcon size={56} /></div>
          <h2>{rows.length === 0 ? 'Zatím žádní klienti' : 'Nic nenalezeno'}</h2>
          <p className="muted">
            {rows.length === 0
              ? cizi
                ? 'Tenhle člověk zatím nikomu nevolal.'
                : 'Jakmile někomu zavoláš, objeví se tady.'
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
                  <td className="row-name">
                    <FlagBadge kontakt={r} compact /> {r.name || '(beze jména)'}
                  </td>
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
          readOnly={!isAdminRole(session.role)}
        />
      )}
    </div>
  );
}
