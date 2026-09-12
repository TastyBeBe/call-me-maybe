import { useEffect, useState } from 'react';
import { getApi, type KontaktStatus, type MyStats, type UserStats } from '../api';
import { useSession } from '../auth';
import { dayWord, topDaysFor } from '../pig/progress';
import { ALL_STATUSES, ErrorBox, Spinner, STATUS_LABELS, errMsg } from '../ui';

function StatCards({ stats }: { stats: MyStats }) {
  // ⚠ POPISKY MUSÍ ŘÍKAT, CO TO JE (Albert 2026-09-12). Dřív tu stálo prosté
  // „Zájem" a „Odmítnuto" — jenže to jsou HOVORY z call_log, kdežto stejná slova
  // v Databázi znamenají KONTAKTY v daném stavu. Změřeno 12. 9.: zájem 69 hovorů
  // proti 0 kontaktům ve stavu `zajem`, odmítnuto 92 hovorů proti 633 kontaktům.
  // Obojí je pravda; lhaly popisky.
  const cards: { label: string; value: string | number; hot?: boolean }[] = [
    { label: 'Hovorů', value: stats.calls },
    { label: 'Dovoláno', value: stats.reached },
    { label: 'Zájem v hovoru', value: stats.zajem, hot: true },
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

  const shownUid = selectedUser === 'me' ? session.user_id : selectedUser;
  const topDays = topDaysFor(shownUid).days;

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
            {shownName} · Čísla nahoře jsou <strong>hovory</strong>, ne klienti: jeden
            klient může mít víc hovorů a po projeveném zájmu se přesune dál podle toho,
            jak daleko je jeho web. Kolik klientů je právě teď v jakém stavu, je níž.
          </p>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            dovoláno = odmítli + zájem · konverze = zájem / dovoláno · prodáno = klient
            web schválil (a dál)
          </p>
          <StatCards stats={shown} />
          <div className="stat-grid" style={{ marginTop: 16 }}>
            <div className="card stat-card">
              <div className="stat-value">{shown.odmitnuto}</div>
              <div className="stat-label">Odmítli v hovoru</div>
            </div>
            <div className="card stat-card">
              <div className="stat-value">{shown.nedovolano}</div>
              <div className="stat-label">Nedovolaných pokusů</div>
            </div>
            {/* kolik dní drží tenhle člověk korunu #1 prodejce (Prokchopovo počítadlo) */}
            <div className="card stat-card">
              <div className="stat-value">{topDays}</div>
              <div className="stat-label">{dayWord(topDays)} jako #1 prodejce</div>
            </div>
          </div>
          {isAdmin && <KlientiFunnel token={session.token} />}
        </>
      )}
    </div>
  );
}

/**
 * KLIENTI PODLE STAVU — druhá polovina pravdy (Albert 2026-09-12).
 * Statistiky výš počítají HOVORY, tahle tabulka KONTAKTY. Bez ní vypadala appka
 * rozbitě: „Zájem 69" na jedné stránce proti „Mají zájem 0" na druhé. Čísla si
 * neodporují, jen měří jinou věc — a od teď jsou vidět vedle sebe.
 * Počty jdou ze serveru (`list_kontakty` vrací `total`), ne z načtených řádků.
 */
function KlientiFunnel({ token }: { token: string }) {
  const [counts, setCounts] = useState<Partial<Record<KontaktStatus, number>> | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const api = getApi();
        const pairs = await Promise.all(
          ALL_STATUSES.map(async (s) => {
            const r = await api.listKontakty(token, { status: s, limit: 1 });
            return [s, r.total] as const;
          })
        );
        if (alive) setCounts(Object.fromEntries(pairs));
      } catch {
        if (alive) setCounts(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  if (!counts) return null;
  const celkem = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const videt = ALL_STATUSES.filter((s) => (counts[s] ?? 0) > 0);

  return (
    <>
      <h2 className="page-title" style={{ fontSize: 22, marginTop: 28 }}>
        Klienti podle stavu
        {celkem > 0 && <span className="count-pill">{celkem}</span>}
      </h2>
      <p className="muted" style={{ margin: '0 0 10px' }}>
        Tohle jsou <strong>kontakty</strong> v databázi, ne hovory. Součet sedí na celou
        databázi.
      </p>
      <div className="stat-grid">
        {videt.map((s) => (
          <div key={s} className="card stat-card">
            <div className="stat-value">{counts[s]}</div>
            <div className="stat-label">{STATUS_LABELS[s]}</div>
          </div>
        ))}
      </div>
    </>
  );
}
