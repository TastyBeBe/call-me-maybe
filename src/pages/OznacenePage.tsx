// Označení klienti — přehled všech, kteří nejsou 100 % vyřešení (migrace 005).
// Červený praporek + poznámka, co přesně je špatně. Klik na řádek otevře detail,
// kde jde příznak upravit nebo označit za vyřešený.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getApi, type FlagKind, type Kontakt } from '../api';
import { audio } from '../audio';
import { useSession } from '../auth';
import KontaktDrawer from '../components/KontaktDrawer';
import {
  ALL_FLAGS,
  ErrorBox,
  FLAG_COLORS,
  FLAG_LABELS,
  FlagBadge,
  Spinner,
  StatusBadge,
  errMsg,
  formatDateTime,
} from '../ui';
import { CheckIcon, FlagIcon } from '../icons';

export default function OznacenePage() {
  const session = useSession();
  const [rows, setRows] = useState<Kontakt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [kind, setKind] = useState<FlagKind | ''>('');
  const [selected, setSelected] = useState<Kontakt | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await getApi().listFlagged(session.token));
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

  const counts = useMemo(() => {
    const c: Partial<Record<FlagKind, number>> = {};
    for (const r of rows) if (r.flag_kind) c[r.flag_kind] = (c[r.flag_kind] ?? 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(
    () => (kind ? rows.filter((r) => r.flag_kind === kind) : rows),
    [rows, kind]
  );

  // Vyřešený klient ze seznamu rovnou zmizí.
  const onSaved = (updated: Kontakt) => {
    if (!updated.flag_kind) {
      setRows((rs) => rs.filter((r) => r.id !== updated.id));
      setSelected(null);
      return;
    }
    setSelected(updated);
    setRows((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
  };

  return (
    <div>
      <p className="eyebrow">nevyřešené</p>
      <h1 className="page-title">
        Označení klienti
        {rows.length > 0 && <span className="count-pill">{rows.length}</span>}
      </h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Klienti, u kterých něco nesedí — chybí e-mail, nevíme, o jaký objekt jde, nebo jsou
        údaje na webu stažené z internetu a klient je ještě nepotvrdil.
      </p>

      {rows.length > 0 && (
        <div className="flag-filter-bar">
          <button
            className={`pill-btn sm${kind === '' ? ' go' : ''}`}
            onClick={() => setKind('')}
          >
            Vše ({rows.length})
          </button>
          {ALL_FLAGS.filter((f) => counts[f]).map((f) => (
            <button
              key={f}
              className={`pill-btn sm${kind === f ? ' go' : ''}`}
              onClick={() => setKind(kind === f ? '' : f)}
              style={
                kind === f
                  ? undefined
                  : { borderColor: FLAG_COLORS[f].bg, color: FLAG_COLORS[f].bg }
              }
            >
              {FLAG_LABELS[f]} ({counts[f]})
            </button>
          ))}
        </div>
      )}

      <ErrorBox>{error}</ErrorBox>

      {loading ? (
        <Spinner label="Načítám označené klienty…" />
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <div className="big-emoji">
            {rows.length === 0 ? <CheckIcon size={56} /> : <FlagIcon size={56} />}
          </div>
          <h2>{rows.length === 0 ? 'Všechno je vyřešené' : 'V této skupině nic není'}</h2>
          <p className="muted">
            {rows.length === 0
              ? 'Žádný klient teď nemá červený příznak.'
              : 'Zkus jinou skupinu nebo zobraz vše.'}
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="kontakty">
            <thead>
              <tr>
                <th>Jméno</th>
                <th>Co je špatně</th>
                <th>Poznámka</th>
                <th>Telefon</th>
                <th>E-mail</th>
                <th>Status</th>
                <th>Označeno</th>
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
                  <td>
                    <FlagBadge kontakt={r} />
                  </td>
                  <td className="flag-note-cell">{r.flag_note || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.phone || '—'}</td>
                  <td>{r.email || <span className="muted">nemá</span>}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }} className="muted">
                    {r.flagged_at ? formatDateTime(r.flagged_at) : '—'}
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
        />
      )}
    </div>
  );
}
