import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { getApi, type Role, type UserStats } from '../api';
import { audio } from '../audio';
import { useSession } from '../auth';
import { ErrorBox, Spinner, errMsg } from '../ui';
import { CheckIcon } from '../icons';

export default function UzivatelePage() {
  const session = useSession();
  const [users, setUsers] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // formulář
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('caller');
  const [formError, setFormError] = useState('');
  const [formOk, setFormOk] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const all = await getApi().allStats(session.token);
      setUsers(all);
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

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormOk('');
    setBusy(true);
    try {
      await getApi().createUser(session.token, username, password, displayName, role);
      audio.play('success');
      setFormOk(`Uživatel „${username.trim()}" založen.`);
      setUsername('');
      setDisplayName('');
      setPassword('');
      setRole('caller');
      await load();
    } catch (err) {
      setFormError(errMsg(err));
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="eyebrow">admin</p>
      <h1 className="page-title">Uživatelé</h1>

      <div className="two-col">
        <div className="card panel">
          <p className="panel-title">seznam uživatelů</p>
          <div className="panel-body">
            <ErrorBox>{error}</ErrorBox>
            {loading ? (
              <Spinner label="Načítám uživatele…" />
            ) : (
              users.map((u) => (
                <div key={u.user_id} className="user-row">
                  <span className="u-name">{u.display_name}</span>
                  <span className="muted">@{u.username}</span>
                  <span className={`badge ${u.role === 'admin' ? 'rating' : 'yellow'}`}>
                    {u.role === 'admin' ? 'admin' : 'volající'}
                  </span>
                  {!u.active && <span className="badge neutral">neaktivní</span>}
                  <span className="spacer" />
                  <span className="muted" style={{ fontSize: 13 }}>
                    {u.calls} hovorů · {u.zajem} zájmů
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card panel">
          <p className="panel-title">nový uživatel</p>
          <div className="panel-body">
            <form onSubmit={onSubmit}>
              <div className="field">
                <label htmlFor="nu-username">
                  Přihlašovací jméno <span className="req">*</span>
                </label>
                <input
                  id="nu-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label htmlFor="nu-display">Zobrazované jméno</label>
                <input
                  id="nu-display"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="(nepovinné — jinak = jméno)"
                />
              </div>
              <div className="field">
                <label htmlFor="nu-password">
                  Heslo <span className="req">*</span>
                </label>
                <input
                  id="nu-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="min. 6 znaků"
                />
              </div>
              <div className="field">
                <label htmlFor="nu-role">Role</label>
                <select id="nu-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  <option value="caller">volající</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <ErrorBox>{formError}</ErrorBox>
              {formOk && (
                <div className="info-box">
                  <CheckIcon size={16} /> {formOk}
                </div>
              )}
              <button
                className="pill-btn go"
                type="submit"
                disabled={busy || !username.trim() || password.length < 6}
              >
                {busy ? 'Zakládám…' : 'Založit uživatele'}
              </button>
              {password.length > 0 && password.length < 6 && (
                <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                  Heslo musí mít alespoň 6 znaků.
                </p>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
