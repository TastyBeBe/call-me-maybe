import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { getApi, type Role, type UpdateUserArgs, type UserStats } from '../api';
import { audio } from '../audio';
import { useSession } from '../auth';
import { ErrorBox, Spinner, errMsg } from '../ui';
import { CheckIcon, PencilIcon } from '../icons';

export default function UzivatelePage() {
  const session = useSession();
  const [users, setUsers] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // formulář (nový uživatel)
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('caller');
  const [formError, setFormError] = useState('');
  const [formOk, setFormOk] = useState('');
  const [busy, setBusy] = useState(false);

  // inline editace uživatele
  const [editId, setEditId] = useState<number | null>(null);
  const [eDisplayName, setEDisplayName] = useState('');
  const [ePassword, setEPassword] = useState('');
  const [eRole, setERole] = useState<Role>('caller');
  const [eActive, setEActive] = useState(true);
  const [editError, setEditError] = useState('');
  const [editBusy, setEditBusy] = useState(false);

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

  const startEdit = (u: UserStats) => {
    setEditId(u.user_id);
    setEDisplayName(u.display_name);
    setEPassword('');
    setERole(u.role);
    setEActive(u.active);
    setEditError('');
  };

  const cancelEdit = () => {
    setEditId(null);
    setEPassword('');
    setEditError('');
  };

  const onSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (editId === null) return;
    setEditError('');
    setEditBusy(true);
    try {
      const args: UpdateUserArgs = {
        display_name: eDisplayName.trim(),
        role: eRole,
        active: eActive,
      };
      if (ePassword) args.password = ePassword;
      await getApi().updateUser(session.token, editId, args);
      audio.play('success');
      cancelEdit();
      await load();
    } catch (err) {
      setEditError(errMsg(err));
      audio.play('error');
    } finally {
      setEditBusy(false);
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
                <div key={u.user_id}>
                  <div className="user-row">
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
                    <button
                      type="button"
                      className={`tb-btn${editId === u.user_id ? ' active' : ''}`}
                      title="Upravit uživatele"
                      onClick={() => (editId === u.user_id ? cancelEdit() : startEdit(u))}
                    >
                      <PencilIcon size={16} />
                    </button>
                  </div>

                  {editId === u.user_id && (
                    <form className="user-edit" onSubmit={onSaveEdit}>
                      <div className="field">
                        <label htmlFor="ue-display">Zobrazované jméno</label>
                        <input
                          id="ue-display"
                          value={eDisplayName}
                          onChange={(e) => setEDisplayName(e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="ue-password">Nové heslo</label>
                        <input
                          id="ue-password"
                          type="password"
                          value={ePassword}
                          onChange={(e) => setEPassword(e.target.value)}
                          autoComplete="new-password"
                          placeholder="nechat prázdné = beze změny"
                        />
                        <p className="muted" style={{ fontSize: 13, margin: '2px 0 0' }}>
                          Heslo uvidí jen ten, komu ho řeknete — uložené je jen otisk.
                        </p>
                      </div>
                      <div className="field">
                        <label htmlFor="ue-role">Role</label>
                        <select
                          id="ue-role"
                          value={eRole}
                          onChange={(e) => setERole(e.target.value as Role)}
                        >
                          <option value="caller">volající</option>
                          <option value="admin">admin</option>
                        </select>
                      </div>
                      <label className="checkbox-row" style={{ marginBottom: 12 }}>
                        <input
                          type="checkbox"
                          checked={eActive}
                          onChange={(e) => setEActive(e.target.checked)}
                        />
                        Aktivní
                      </label>
                      <ErrorBox>{editError}</ErrorBox>
                      <div className="edit-actions">
                        <button className="pill-btn go sm" type="submit" disabled={editBusy}>
                          {editBusy ? 'Ukládám…' : 'Uložit'}
                        </button>
                        <button
                          className="pill-btn sm"
                          type="button"
                          onClick={cancelEdit}
                          disabled={editBusy}
                        >
                          Zrušit
                        </button>
                      </div>
                    </form>
                  )}
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
