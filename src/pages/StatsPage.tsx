import { useEffect, useState } from 'react';
import { getApi, type MyStats, type UserStats } from '../api';
import { useSession } from '../auth';
import { ErrorBox, Spinner, errMsg } from '../ui';

function StatCards({ stats }: { stats: MyStats }) {
  const cards: { label: string; value: string | number; hot?: boolean }[] = [
    { label: 'Hovorů', value: stats.calls },
    { label: 'Dovoláno', value: stats.reached },
    { label: 'Zájem', value: stats.zajem, hot: true },
    { label: 'Konverze', value: `${stats.conversion} %` },
    { label: 'Prodáno', value: stats.sold },
  ];
  return (
    <div className="stat-grid">
      {cards.map((c) => (
        <div key={c.label} className={`card stat-card${c.hot ? ' hot' : ''}`}>
          <div className="stat-value">{c.value}</div>
          <div className="stat-label">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

export default function StatsPage() {
  const session = useSession();
  const isAdmin = session.role === 'admin';
  const [myStats, setMyStats] = useState<MyStats | null>(null);
  const [allStats, setAllStats] = useState<UserStats[] | null>(null);
  const [selectedUser, setSelectedUser] = useState<number | 'me'>('me');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const api = getApi();
        const mine = await api.myStats(session.token);
        if (!alive) return;
        setMyStats(mine);
        if (isAdmin) {
          const all = await api.allStats(session.token);
          if (!alive) return;
          setAllStats(all);
        }
      } catch (e) {
        if (alive) setError(errMsg(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [session.token, isAdmin]);

  const shown: MyStats | null =
    selectedUser === 'me'
      ? myStats
      : (allStats?.find((u) => u.user_id === selectedUser) ?? null);

  const shownName =
    selectedUser === 'me'
      ? session.display_name
      : allStats?.find((u) => u.user_id === selectedUser)?.display_name ?? '';

  return (
    <div>
      <p className="eyebrow">výsledky volání</p>
      <h1 className="page-title">Statistiky</h1>

      {isAdmin && allStats && (
        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="user-select">Čí statistiky zobrazit</label>
          <select
            id="user-select"
            value={selectedUser === 'me' ? 'me' : String(selectedUser)}
            onChange={(e) =>
              setSelectedUser(e.target.value === 'me' ? 'me' : Number(e.target.value))
            }
          >
            <option value="me">Moje ({session.display_name})</option>
            {allStats.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.display_name} ({u.username}
                {u.role === 'admin' ? ' · admin' : ''}
                {u.active ? '' : ' · neaktivní'})
              </option>
            ))}
          </select>
        </div>
      )}

      <ErrorBox>{error}</ErrorBox>
      {loading && <Spinner label="Počítám statistiky…" />}

      {!loading && shown && (
        <>
          <p className="muted" style={{ margin: '10px 0 0' }}>
            {shownName} · dovoláno = odmítnuto + zájem · konverze = zájem / dovoláno
          </p>
          <StatCards stats={shown} />
          <div className="stat-grid" style={{ marginTop: 16 }}>
            <div className="card stat-card">
              <div className="stat-value">{shown.odmitnuto}</div>
              <div className="stat-label">Odmítnuto</div>
            </div>
            <div className="card stat-card">
              <div className="stat-value">{shown.nedovolano}</div>
              <div className="stat-label">Nedovoláno</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
