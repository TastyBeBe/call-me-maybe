import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { getApi, type Role, type UpdateUserArgs, type UserStats } from '../api';
import { audio } from '../audio';
import { OWNER_USER_ID, useSession } from '../auth';
import { isSuperAdmin, roleLabel } from '../roles';
import { ErrorBox, Spinner, errMsg } from '../ui';
import { CheckIcon, PencilIcon } from '../icons';

/**
 * UŽIVATELÉ (migrace 023, Albert 2026-09-24). Server rozhoduje sám; tady se jen
 * nenabízí, co by odmítl:
 *   - Albert (id 1): všichni, role (volající / admin / super admin) i nadřízený.
 *   - super admin: sebe a lidi pod sebou; zakládá volající pod sebe.
 *   - admin: seznam uživatelů nevidí (oddělení dat); může založit volajícího, který
 *     spadne pod jeho super admina — dokud Albert nerozhodne jinak.
 */
export default function UzivatelePage() {
  const session = useSession();
  const isOwner = session.user_id === OWNER_USER_ID;
  const isSuper = isSuperAdmin(session.role);
  const [users, setUsers] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState(isSuper);
  const [error, setError] = useState('');

  // formulář (nový uživatel)
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('caller');
  const [managerId, setManagerId] = useState<number>(OWNER_USER_ID);
  const [formError, setFormError] = useState('');
  const [formOk, setFormOk] = useState('');
  const [busy, setBusy] = useState(false);

  // inline editace uživatele
  const [editId, setEditId] = useState<number | null>(null);
  const [eDisplayName, setEDisplayName] = useState('');
  const [ePassword, setEPassword] = useState('');
  const [eRole, setERole] = useState<Role>('caller');
  const [eActive, setEActive] = useState(true);
  const [eManagerId, setEManagerId] = useState<number | null>(null);
  const [editError, setEditError] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  const superAdmins = users.filter((u) => u.role === 'super_admin');

  const load = useCallback(async () => {
    if (!isSuper) return; // seznam uživatelů vidí jen super admin (server by odmítl)
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
  }, [session.token, isSuper]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Koho smím upravit: Albert kohokoli, super admin sebe a svoje lidi. */
  const canEdit = (u: UserStats) =>
    isOwner || u.user_id === session.user_id || u.manager_id === session.user_id;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormOk('');
    setBusy(true);
    try {
      const r: Role = isOwner ? role : 'caller';
      await getApi().createUser(
        session.token,
        username,
        password,
        displayName,
        r,
        isOwner && r !== 'super_admin' ? managerId : null
      );
      audio.play('success');
      setFormOk(`Uživatel „${username.trim()}" založen.`);
      setUsername('');
      setDisplayName('');
      setPassword('');
      setRole('caller');
      setManagerId(OWNER_USER_ID);
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
    setEManagerId(u.manager_id);
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
    const target = users.find((u) => u.user_id === editId);
    if (!target) return;
    setEditError('');
    setEditBusy(true);
    try {
      // posílá se jen to, co se opravdu změnilo — server některá pole smí měnit jen Albert
      const args: UpdateUserArgs = {};
      if (eDisplayName.trim() !== target.display_name) args.display_name = eDisplayName.trim();
      if (ePassword) args.password = ePassword;
      if (isOwner && eRole !== target.role) args.role = eRole;
      if (eActive !== target.active) args.active = eActive;
      if (isOwner && eRole !== 'super_admin' && eManagerId !== null && eManagerId !== target.manager_id) {
        args.manager_id = eManagerId;
      }
      if (Object.keys(args).length === 0) {
        cancelEdit();
        return;
      }
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

  const roleBadgeClass = (r: Role) => (r === 'caller' ? 'yellow' : 'rating');

  return (
    <div>
      <p className="eyebrow">{isSuper ? 'lidé' : 'admin'}</p>
      <h1 className="page-title">Uživatelé</h1>

      <div className="two-col">
        {isSuper ? (
          <div className="card panel">
            <p className="panel-title">{isOwner ? 'všichni uživatelé' : 'ty a lidé pod tebou'}</p>
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
                      <span className={`badge ${roleBadgeClass(u.role)}`}>{roleLabel(u.role)}</span>
                      {!u.active && <span className="badge neutral">neaktivní</span>}
                      {u.manager_name && u.manager_id !== session.user_id && (
                        <span className="muted" style={{ fontSize: 13 }}>pod: {u.manager_name}</span>
                      )}
                      <span className="spacer" />
                      <span className="muted" style={{ fontSize: 13 }}>
                        {u.calls} hovorů · {u.zajem} zájmů
                      </span>
                      {canEdit(u) && (
                        <button
                          type="button"
                          className={`tb-btn${editId === u.user_id ? ' active' : ''}`}
                          title="Upravit uživatele"
                          onClick={() => (editId === u.user_id ? cancelEdit() : startEdit(u))}
                        >
                          <PencilIcon size={16} />
                        </button>
                      )}
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
                          <p className="muted" style={{ fontSize: 13, margin: '2px 0 0' }}>
                            Musí být jedinečné — podle jména se lidem přiřazují klienti a zprávy.
                          </p>
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
                          {isOwner && u.user_id !== session.user_id ? (
                            <select
                              id="ue-role"
                              value={eRole}
                              onChange={(e) => setERole(e.target.value as Role)}
                            >
                              <option value="caller">volající</option>
                              <option value="admin">admin</option>
                              <option value="super_admin">super admin</option>
                            </select>
                          ) : (
                            <>
                              <input id="ue-role" value={roleLabel(eRole)} readOnly />
                              <p className="muted" style={{ fontSize: 13, margin: '2px 0 0' }}>
                                Role mění jen Albert (a nikdo sám sobě).
                              </p>
                            </>
                          )}
                        </div>
                        {isOwner && eRole !== 'super_admin' && (
                          <div className="field">
                            <label htmlFor="ue-manager">Nadřízený (super admin)</label>
                            <select
                              id="ue-manager"
                              value={eManagerId === null ? String(OWNER_USER_ID) : String(eManagerId)}
                              onChange={(e) => setEManagerId(Number(e.target.value))}
                            >
                              {superAdmins.map((s) => (
                                <option key={s.user_id} value={s.user_id}>
                                  {s.display_name}
                                </option>
                              ))}
                            </select>
                            <p className="muted" style={{ fontSize: 13, margin: '2px 0 0' }}>
                              Nadřízený vidí jeho statistiky, klienty, označené a zprávy.
                            </p>
                          </div>
                        )}
                        {u.user_id !== session.user_id && (
                          <label className="checkbox-row" style={{ marginBottom: 12 }}>
                            <input
                              type="checkbox"
                              checked={eActive}
                              onChange={(e) => setEActive(e.target.checked)}
                            />
                            Aktivní
                          </label>
                        )}
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
        ) : (
          <div className="card panel">
            <p className="panel-title">seznam uživatelů</p>
            <div className="panel-body">
              <p className="muted" style={{ margin: 0 }}>
                Seznam uživatelů a jejich výsledky vidí jen super admini. Každý vidí jen svoje
                statistiky, klienty a zprávy.
              </p>
            </div>
          </div>
        )}

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
                {isOwner ? (
                  <select id="nu-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                    <option value="caller">volající</option>
                    <option value="admin">admin</option>
                    <option value="super_admin">super admin</option>
                  </select>
                ) : (
                  <>
                    <input id="nu-role" value="volající" readOnly />
                    <p className="muted" style={{ fontSize: 13, margin: '2px 0 0' }}>
                      Nového admina zakládá jen Albert.{' '}
                      {isSuper
                        ? 'Nový volající bude pod tebou.'
                        : 'Nový volající bude pod tvým super adminem.'}
                    </p>
                  </>
                )}
              </div>
              {isOwner && role !== 'super_admin' && superAdmins.length > 0 && (
                <div className="field">
                  <label htmlFor="nu-manager">Nadřízený (super admin)</label>
                  <select
                    id="nu-manager"
                    value={String(managerId)}
                    onChange={(e) => setManagerId(Number(e.target.value))}
                  >
                    {superAdmins.map((s) => (
                      <option key={s.user_id} value={s.user_id}>
                        {s.display_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
