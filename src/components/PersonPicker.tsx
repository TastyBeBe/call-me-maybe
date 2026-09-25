// Výběr člověka pro super admina (migrace 023, Albert 2026-09-24): „já", nebo kdokoli
// další (od migrace 027 vidí super admin všechny, Albert 2026-09-25). Seznam jde z all_stats,
// který server dává JEN super adminovi — ostatním se výběr vůbec neukáže.
import { useEffect, useState } from 'react';
import { getApi, type UserStats } from '../api';
import { useSession } from '../auth';
import { isSuperAdmin, roleLabel } from '../roles';

/** Lidé, které přihlášený smí vidět (jen super admin; ostatní dostanou prázdný seznam). */
export function usePeople(): UserStats[] {
  const session = useSession();
  const [people, setPeople] = useState<UserStats[]>([]);
  const superAdmin = isSuperAdmin(session.role);

  useEffect(() => {
    if (!superAdmin) {
      setPeople([]);
      return;
    }
    let alive = true;
    getApi()
      .allStats(session.token)
      .then((rows) => {
        if (alive) setPeople(rows);
      })
      .catch(() => {
        if (alive) setPeople([]);
      });
    return () => {
      alive = false;
    };
  }, [session.token, superAdmin]);

  return people;
}

export default function PersonPicker({
  people,
  value,
  onChange,
  label,
  allOption,
}: {
  people: UserStats[];
  value: number | null;
  onChange: (userId: number | null) => void;
  label: string;
  /** popisek volby „bez výběru" (value null); když chybí, výběr je vždy jeden člověk */
  allOption?: string;
}) {
  const session = useSession();
  if (!isSuperAdmin(session.role) || people.length === 0) return null;
  const others = people.filter((u) => u.user_id !== session.user_id);
  if (others.length === 0 && !allOption) return null;

  return (
    <div className="field" style={{ maxWidth: 360 }}>
      <label htmlFor="person-picker">{label}</label>
      <select
        id="person-picker"
        value={value === null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      >
        {allOption && <option value="">{allOption}</option>}
        <option value={String(session.user_id)}>Já ({session.display_name})</option>
        {others.map((u) => (
          <option key={u.user_id} value={u.user_id}>
            {u.display_name} · {roleLabel(u.role)}
            {u.active ? '' : ' · neaktivní'}
          </option>
        ))}
      </select>
    </div>
  );
}
