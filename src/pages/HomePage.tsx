import { Link } from 'react-router-dom';
import { OWNER_USER_ID, useSession } from '../auth';
import { ChartIcon, FlagIcon, MessageIcon, PhoneIcon, RocketIcon, TableIcon, UsersIcon } from '../icons';

export default function HomePage() {
  const session = useSession();
  const isAdmin = session.role === 'admin';
  const isOwner = isAdmin && session.user_id === OWNER_USER_ID;

  return (
    <div>
      <p className="eyebrow">webdomov · interní</p>
      <h1 className="page-title">Ahoj, {session.display_name}!</h1>
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
          <span className="tile-sub">moje kontakty + vzkazy agentům</span>
        </Link>
        {isAdmin && (
          <>
            <Link to="/admin" className="big-tile">
              <span className="tile-emoji"><TableIcon size={42} /></span>
              <span className="tile-label">KONTAKTY</span>
              <span className="tile-sub">celá databáze + úpravy</span>
            </Link>
            <Link to="/oznacene" className="big-tile">
              <span className="tile-emoji"><FlagIcon size={42} /></span>
              <span className="tile-label">OZNAČENÉ</span>
              <span className="tile-sub">klienti, co nejsou dořešení</span>
            </Link>
            <Link to="/zpravy" className="big-tile">
              <span className="tile-emoji"><MessageIcon size={42} /></span>
              <span className="tile-label">ZPRÁVY</span>
              <span className="tile-sub">chat s AI agenty</span>
            </Link>
            <Link to="/uzivatele" className="big-tile">
              <span className="tile-emoji"><UsersIcon size={42} /></span>
              <span className="tile-label">UŽIVATELÉ</span>
              <span className="tile-sub">volající a admini</span>
            </Link>
            {isOwner && (
              <Link to="/automatizace" className="big-tile">
                <span className="tile-emoji"><RocketIcon size={42} /></span>
                <span className="tile-label">AUTOMATIZACE</span>
                <span className="tile-sub">který účet Claude veze agenty</span>
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
