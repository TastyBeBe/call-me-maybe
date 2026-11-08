// Stránka „Jak volat“ (migrace 064, Albert 7. 11. 2026; návrh oborů 6.7 a R11): pokyny pro volající ke zvolenému oboru
// (kdy volat, úvodní věta podle stavu webu, co náhled obsahuje, odpovědi na námitky, kdy skončit, věta do poznámky).
// Text je v registru (obor_niky.jak_volat), mění ho živá session bez nasazení appky. Na kartě hovoru nic není: rámeček
// s tipy Albert 19. 10. 2026 odstranil (kontrola 104 d, test T). Odkaz sem vede z prázdné fronty a z menu, jen když je
// ve volání zvolená nika.

import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useSession } from '../auth';
import { BookIcon } from '../icons';
import { Markdown } from '../markdown';
import { nactiNiky, nikaInfo, useNiky, viditelneNiky } from '../obory';
import { jeKlicNiky, ulozenaVolba } from '../segment';
import { Spinner } from '../ui';

export default function JakVolatPage() {
  const session = useSession();
  const [params] = useSearchParams();
  const niky = useNiky();
  const [nacteno, setNacteno] = useState(false);
  useEffect(() => {
    let platne = true;
    void nactiNiky(session.token, true).then(() => {
      if (platne) setNacteno(true);
    });
    return () => {
      platne = false;
    };
  }, [session.token]);
  const zParametru = params.get('nika');
  const klic = jeKlicNiky(zParametru) ? zParametru : ulozenaVolba();
  const nika = jeKlicNiky(klic) ? nikaInfo(klic) : undefined;
  const ostatni = viditelneNiky(niky).filter((n) => n.klic !== nika?.klic);

  return (
    <div className="jak-volat">
      <p className="eyebrow">volání · jak volat</p>
      <h1 className="page-title">
        <BookIcon size={26} /> Jak volat{nika ? `: ${nika.nazev}` : ''}
      </h1>
      {!nika && !nacteno ? (
        <Spinner label="Načítám obory…" />
      ) : !nika ? (
        <div className="card empty-state">
          <h2>Jak volat je jen u oborů.</h2>
          <p className="muted">Ve volání zvol „Obory“ a pak obor, který voláš.</p>
        </div>
      ) : nika.jak_volat && nika.jak_volat.trim() ? (
        <div className="card">
          <Markdown text={nika.jak_volat} />
        </div>
      ) : (
        <div className="card empty-state">
          <h2>Pokyny pro tenhle obor zatím nejsou.</h2>
          <p className="muted">Krátce se představ a zeptej se, jestli můžeš firmě poslat ukázku webu.</p>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        <Link to="/call" className="pill-btn hot" data-sfx="none">
          Zpět na volání
        </Link>
        {ostatni.map((n) => (
          <Link key={n.klic} to={`/jak-volat?nika=${encodeURIComponent(n.klic)}`} className="pill-btn" data-sfx="none">
            {n.nazev}
          </Link>
        ))}
      </div>
    </div>
  );
}
