import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApi, type AutomationStatus, type Rozvrh } from '../api';
import { OWNER_USER_ID, useSession } from '../auth';
import { accountLabel, powerSummary } from '../automation';
import { isAdminRole, isSuperAdmin } from '../roles';
import { CalendarIcon, ChartIcon, FlagIcon, MessageIcon, PhoneIcon, RocketIcon, TableIcon, UsersIcon } from '../icons';
import { dnesHlaska, stavHlaska } from '../rozvrh';
import { formatDateTime } from '../ui';

/** Podtitulek dlaždice Automatizace: stejný stav jako na stránce, ať ho Albert vidí hned. */
function AutomationTileSub({ st }: { st: AutomationStatus | null }) {
  if (!st) return <span className="tile-sub">který účet Claude veze agenty</span>;
  const sum = powerSummary(st);
  const { control } = st;
  let extra = '';
  if (control.phase === 'running') extra = ` · účet ${accountLabel(st, control.active_account)}`;
  else if (control.phase === 'stopped' && control.stopped_at) extra = ` od ${formatDateTime(control.stopped_at)}`;
  return (
    <span className="tile-sub power">
      <span className={`power-pill sm ${sum.tone}`}>{sum.pill}</span>
      <span>
        {sum.text}
        {extra}
      </span>
    </span>
  );
}

/**
 * Připomínka rozvrhu na Domů (migrace 042, Albert 18. 10. 2026: „the caller should be reminded when
 * and how long he is supposed to call today“). Server bez migrace 042 rozvrh_get nezná: pak se
 * nic neukáže (chyba se tu neříká, záložka Rozvrh ji řekne).
 */
function RozvrhPripominka({ token, jaSuper }: { token: string; jaSuper: boolean }) {
  const [r, setR] = useState<Rozvrh | null>(null);
  useEffect(() => {
    let alive = true;
    getApi()
      .rozvrh(token)
      .then((x) => {
        if (alive) setR(x);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token]);
  if (!r) return null;
  const h = stavHlaska(r, true, jaSuper);
  const dnes = dnesHlaska(r, true);
  return (
    <Link to="/rozvrh" className="home-rozvrh" data-sfx="none">
      <div className={`card rozvrh-alert ${h.ton}`} role="status">
        <p className="rozvrh-alert-titulek">{h.titulek}</p>
        <p className="rozvrh-alert-text">{dnes ?? h.text}</p>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const session = useSession();
  const isAdmin = isAdminRole(session.role);
  const isSuper = isSuperAdmin(session.role);
  const isOwner = isAdmin && session.user_id === OWNER_USER_ID;
  const [auto, setAuto] = useState<AutomationStatus | null>(null);

  // stav vypínače jen pro Alberta; tichý poll po 30 s, chyba se tu neukazuje (stránka ji řekne)
  useEffect(() => {
    if (!isOwner) return;
    let alive = true;
    const load = () =>
      getApi()
        .getAutomationStatus(session.token)
        .then((s) => {
          if (alive) setAuto(s);
        })
        .catch(() => {});
    void load();
    const timer = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [isOwner, session.token]);

  return (
    <div>
      <p className="eyebrow">webdomov · interní</p>
      <h1 className="page-title">Ahoj, {session.display_name}!</h1>
      <RozvrhPripominka token={session.token} jaSuper={isSuper} />
      <div className="home-grid">
        <Link to="/call" className="big-tile hot">
          <span className="tile-emoji"><PhoneIcon size={42} /></span>
          <span className="tile-label">VOLAT</span>
          <span className="tile-sub">další kontakt z fronty</span>
        </Link>
        <Link to="/stats" className="big-tile">
          <span className="tile-emoji"><ChartIcon size={42} /></span>
          <span className="tile-label">MOJE STATISTIKY</span>
          <span className="tile-sub">hovory, zájem, konverze</span>
        </Link>
        <Link to="/moji" className="big-tile">
          <span className="tile-emoji"><TableIcon size={42} /></span>
          <span className="tile-label">MOJI KLIENTI</span>
          <span className="tile-sub">
            {isSuper ? 'moje kontakty + klienti kohokoli' : 'moje kontakty + vzkazy agentům'}
          </span>
        </Link>
        <Link to="/rozvrh" className="big-tile">
          <span className="tile-emoji"><CalendarIcon size={42} /></span>
          <span className="tile-label">ROZVRH</span>
          <span className="tile-sub">{isSuper ? 'kdy kdo volá a kdo je pozadu' : 'kdy a jak dlouho volám'}</span>
        </Link>
        <Link to="/admin" className="big-tile">
          <span className="tile-emoji"><TableIcon size={42} /></span>
          <span className="tile-label">KONTAKTY</span>
          <span className="tile-sub">{isAdmin ? 'celá databáze + úpravy' : 'celá databáze kontaktů'}</span>
        </Link>
        {isAdmin && (
          <>
            <Link to="/oznacene" className="big-tile">
              <span className="tile-emoji"><FlagIcon size={42} /></span>
              <span className="tile-label">OZNAČENÉ</span>
              <span className="tile-sub">
                {isSuper ? 'nedořešení klienti — všech lidí' : 'moji klienti, co nejsou dořešení'}
              </span>
            </Link>
            <Link to="/zpravy" className="big-tile">
              <span className="tile-emoji"><MessageIcon size={42} /></span>
              <span className="tile-label">ZPRÁVY</span>
              <span className="tile-sub">chat s AI agenty</span>
            </Link>
            {/* lidi zakládá a spravuje jen super admin (migrace 024) */}
            {isSuper && (
              <Link to="/uzivatele" className="big-tile">
                <span className="tile-emoji"><UsersIcon size={42} /></span>
                <span className="tile-label">UŽIVATELÉ</span>
                <span className="tile-sub">{isOwner ? 'všichni lidé a role' : 'všichni lidé, upravuješ své'}</span>
              </Link>
            )}
            {isOwner && (
              <Link to="/automatizace" className="big-tile">
                <span className="tile-emoji"><RocketIcon size={42} /></span>
                <span className="tile-label">AUTOMATIZACE</span>
                <AutomationTileSub st={auto} />
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
