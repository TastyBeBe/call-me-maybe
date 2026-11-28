/**
 * Ke schválení (migrace 086, Albert 27. 11. 2026): „any email before it's sent needs to be shown in the app to the super admin
 * who's responsible … the super admin can see all the context, the profile of the client, the conversation“. Jen super admin;
 * návrhy e-mailů, o kterých smí rozhodnout (schvalovatel, Mikuláš, Albert), super klienti (Web na míru) napřed. Schválit
 * a vrátit jde tou samou kartou jako ve vlákně (NavrhKarta, migrace 083).
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApi, type KeSchvaleni, type KeSchvaleniPolozka, type Kontakt } from '../api';
import { useSession } from '../auth';
import KontaktDrawer from '../components/KontaktDrawer';
import { NavrhKarta } from '../components/KontrolaOdpovedi';
import PrehledPanel from '../components/PrehledPanel';
import { WebNaMiruOdznak } from '../components/WebNaMiru';
import { gmailOdkaz } from '../gmail';
import { casKontroly } from '../kontrola';
import { poradiKaret } from '../superKlient';
import { ErrorBox, errMsg } from '../ui';

export default function KeSchvaleniPage() {
  const session = useSession();
  const [data, setData] = useState<KeSchvaleni | null>(null);
  const [chyba, setChyba] = useState('');
  const [profil, setProfil] = useState<Kontakt | null>(null);
  const nacti = useCallback(async () => {
    try {
      setData(await getApi().keSchvaleni(session.token));
      setChyba('');
    } catch (e) {
      setChyba(errMsg(e));
    }
  }, [session.token]);
  useEffect(() => {
    void nacti();
  }, [nacti]);
  const karty = data ? poradiKaret(data.navrhy) : [];
  return (
    <div className="page ke-schvaleni">
      <h1>Ke schválení</h1>
      <p className="muted">
        E-maily, které automatizace připravila a čekají, až je schválíš nebo vrátíš s poznámkou. Klienti s označením Web na míru
        jsou nahoře.
      </p>
      <ErrorBox>{chyba}</ErrorBox>
      {!data && !chyba && <p className="muted">Načítám…</p>}
      {data && karty.length === 0 && <p className="muted">Nic nečeká na schválení.</p>}
      {karty.map((p) => (
        <Karta key={p.navrh.id} p={p} onZmena={() => void nacti()} onProfil={() => setProfil(p.kontakt)} />
      ))}
      {profil && (
        <KontaktDrawer
          kontakt={profil}
          onClose={() => {
            setProfil(null);
            void nacti();
          }}
        />
      )}
    </div>
  );
}

function Karta({ p, onZmena, onProfil }: { p: KeSchvaleniPolozka; onZmena: () => void; onProfil: () => void }) {
  const gmail = gmailOdkaz(p.kontakt);
  return (
    <section className="card ke-schvaleni-karta" data-ke-schvaleni={p.navrh.id}>
      <header className="ke-schvaleni-hlava">
        <strong>{p.kontakt.name ?? `#${p.kontakt.id}`}</strong>{' '}
        {p.kontakt.segment && <span className="muted">{p.kontakt.segment}</span>} <WebNaMiruOdznak kontaktId={p.kontakt.id} />
        <div className="muted ke-schvaleni-meta">
          {p.super_klient ? `${p.super_klient.faze_text}; ` : ''}schvaluje {p.schvalovatel ?? '?'}; čeká od {casKontroly(p.navrh.vytvoreno)}
        </div>
      </header>
      <PrehledPanel kontakt={p.kontakt} naKarte />
      <NavrhKarta navrh={p.navrh} onZmena={onZmena} />
      <div className="ke-schvaleni-odkazy">
        <button type="button" className="btn" onClick={onProfil}>
          Profil klienta
        </button>
        {p.navrh.chat_thread_id !== null && (
          <Link className="btn" to={`/zpravy?vlakno=${p.navrh.chat_thread_id}`}>
            Vlákno v appce
          </Link>
        )}
        {gmail && (
          <a className="btn" href={gmail} target="_blank" rel="noreferrer">
            Celá konverzace v Gmailu
          </a>
        )}
      </div>
    </section>
  );
}
