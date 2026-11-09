// Stránka „Jak volat“ (Albert 9. 11. 2026): Albertovy návody pro volající, dva dokumenty s přepínačem: skript „Jak volat
// řemeslníkům“ a „Slovníček webových pojmů“. Text je v registru nik (obor_niky.jak_volat, src/navody.ts) a appka ho dostane
// jen po přihlášení. ⚠ NAHRAZUJE stránku Jak volat z kroku B9 (pokyny, které napsal agent; Albert je 9. 11. 2026 dopoledne
// nechal odstranit: „I didn't ask for this section“) Albertovými vlastními dokumenty na jeho pokyn téhož dne. Na kartě
// hovoru nic není (rámeček s tipy Albert odstranil 19. 10. 2026, kontrola 104 d, test T).

import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useSession } from '../auth';
import { BookIcon } from '../icons';
import { Markdown } from '../markdown';
import { rozdelNavody, textNavodu } from '../navody';
import { nactiNiky, useNiky, viditelneNiky } from '../obory';
import { ulozenaVolba } from '../segment';
import { Spinner } from '../ui';

export default function JakVolatPage() {
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const niky = viditelneNiky(useNiky());
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
  const dokumenty = rozdelNavody(textNavodu(niky, ulozenaVolba()));
  const i = Math.min(Math.max(Math.trunc(Number(params.get('dok'))) || 0, 0), Math.max(dokumenty.length - 1, 0));
  const dok = dokumenty[i];

  return (
    <div className="jak-volat">
      <p className="eyebrow">volání · jak volat</p>
      <h1 className="page-title">
        <BookIcon size={26} /> Jak volat
      </h1>
      {!dok && !nacteno ? (
        <Spinner label="Načítám návody…" />
      ) : !dok ? (
        <div className="card empty-state">
          <h2>Návody tu zatím nejsou.</h2>
        </div>
      ) : (
        <>
          {dokumenty.length > 1 && (
            <div className="segmented navody-prepinac" role="tablist" aria-label="Návody">
              {dokumenty.map((d, j) => (
                <button
                  key={`${j}-${d.nazev}`}
                  type="button"
                  role="tab"
                  aria-selected={j === i}
                  className={j === i ? 'active' : ''}
                  data-sfx="none"
                  onClick={() => setParams(j ? { dok: String(j) } : {}, { replace: true })}
                >
                  {d.nazev}
                </button>
              ))}
            </div>
          )}
          <div className="card" role="tabpanel">
            <h2>{dok.nazev}</h2>
            <Markdown text={dok.telo} />
          </div>
        </>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        <Link to="/call" className="pill-btn hot" data-sfx="none">
          Zpět na volání
        </Link>
      </div>
    </div>
  );
}
