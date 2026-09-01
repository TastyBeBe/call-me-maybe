import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { clearConfig, getConfig, saveConfig } from '../config';
import { LS_SESSION } from '../auth';

/** Při přepnutí mezi DEMO a Supabase je starý token neplatný (demo token není uuid) — odhlásit. */
function dropSession(): void {
  try {
    localStorage.removeItem(LS_SESSION);
  } catch {
    // ignoruj
  }
}

export default function SetupPage() {
  const cfg = getConfig();
  const [url, setUrl] = useState(cfg.supabaseUrl);
  const [key, setKey] = useState(cfg.anonKey);
  const [saved, setSaved] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const before = getConfig();
    saveConfig(url, key);
    const after = getConfig();
    if (before.demo !== after.demo || before.supabaseUrl !== after.supabaseUrl) dropSession();
    setSaved(true);
    // config čtou API klienti přímo z localStorage — stačí reload
    setTimeout(() => window.location.reload(), 600);
  };

  const onClear = () => {
    const before = getConfig();
    clearConfig();
    if (!before.demo) dropSession();
    setUrl('');
    setKey('');
    setSaved(true);
    setTimeout(() => window.location.reload(), 600);
  };

  return (
    <div className="auth-wrap">
      <div className="card auth-card" style={{ width: 520 }}>
        <p className="eyebrow">nastavení</p>
        <h1>připojení k Supabase</h1>
        <p className="sub">
          Vlož URL projektu a anon klíč. Uloží se jen do tohoto prohlížeče (localStorage). Bez
          vyplnění běží aplikace v DEMO režimu s falešnými daty.
        </p>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="su">Supabase URL</label>
            <input
              id="su"
              placeholder="https://xxxx.supabase.co"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="sk">Anon klíč (public)</label>
            <input
              id="sk"
              placeholder="eyJhbGciOi…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </div>
          {saved && <div className="info-box">Uloženo — načítám znovu…</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="pill-btn go" type="submit">
              Uložit a použít
            </button>
            <button className="pill-btn" type="button" onClick={onClear}>
              Vymazat (zpět na demo)
            </button>
            <span className="spacer" />
            <Link className="pill-btn dark" style={{ textDecoration: 'none' }} to="/login">
              Zpět na přihlášení
            </Link>
          </div>
        </form>
        <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
          Aktuální režim: <b>{cfg.demo ? 'DEMO (bez backendu)' : 'připojeno k Supabase'}</b>
        </p>
      </div>
    </div>
  );
}
