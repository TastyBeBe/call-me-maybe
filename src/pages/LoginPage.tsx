import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { audio } from '../audio';
import { useAuth } from '../auth';
import { getConfig } from '../config';
import { ErrorBox, errMsg } from '../ui';

export default function LoginPage() {
  const { session, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { demo } = getConfig();

  if (session) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(errMsg(err));
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <p className="eyebrow">webdomov</p>
        <h1>Call me maybe</h1>
        <p className="sub">interní nástroj pro obvolávání majitelů chat</p>
        {demo && (
          <div className="info-box">
            Běžím v DEMO režimu (bez backendu). Přihlaš se jako <b>admin&nbsp;/&nbsp;admin</b> nebo{' '}
            <b>petra&nbsp;/&nbsp;volam</b>. Backend nastavíš v <Link to="/setup">nastavení</Link>.
          </div>
        )}
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="username">přihlašovací jméno</label>
            <input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="password">heslo</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <ErrorBox>{error}</ErrorBox>
          <button className="pill-btn hot big" type="submit" disabled={busy || !username || !password}>
            {busy ? 'Přihlašuji…' : 'Přihlásit se'}
          </button>
        </form>
      </div>
    </div>
  );
}
