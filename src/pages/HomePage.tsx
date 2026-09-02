import { Link } from 'react-router-dom';
import { useSession } from '../auth';
import { ChartIcon, MessageIcon, PhoneIcon, TableIcon, UsersIcon } from '../icons';

export default function HomePage() {
  const session = useSession();
  const isAdmin = session.role === 'admin';

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
          </>
        )}
      </div>
    </div>
  );
}
