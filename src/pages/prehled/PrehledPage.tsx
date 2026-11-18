// PŘEHLED VEDENÍ (Přehled vedení úkol 13, Albert 17. 11. 2026, rozhodnutí D1, D2 a D12; spec
// docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md §7.1 a §7.2, kontrakt docs/superpowers/specs/2026-11-17-prehled-kontrakt.md).
// Stránka #/prehled/<záložka> jen pro super admina (trasa v App.tsx pod RequireAuth superAdmin a pojistka tady: Volajícímu
// se nevykreslí nic a nezavolá se nic). Hlavička s čerstvostí dat (Data k …, zdroje), řada filtrů s filtrem v adrese, osm
// záložek a Nastavení, panel řádků za číslem (CSV). Server bez migrace 073 = chyba „Přehled potřebuje migraci 073“, nikdy
// ukázková data. V DEMO pruh „Ukázková data“. Obsah záložek (grafy, tabulky, porovnání) staví úkol 14 nad kontextem
// (pages/prehled/kontext.tsx).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { getApi, type DataDefinice, type DataMoznosti, type PrehledObalka, type Session } from '../../api';
import { useAuth } from '../../auth';
import { getConfig } from '../../config';
import RadaFiltru from '../../components/prehled/FiltrPrehledu';
import ProklikPanel from '../../components/prehled/ProklikPanel';
import { DemoPruh, PrehledChyba, PrehledNacita } from '../../components/prehled/Stavy';
import Zalozky from '../../components/prehled/Zalozky';
import { casText, chybaPrehledu, ZDROJ_NAZVY } from '../../prehled';
import { ctiFiltr, dnesVPraze, filtrProServer, NASTAVENI_SEKCE, zapisFiltr, ZALOZKY, type FiltrPrehledu, type NastaveniKlic } from '../../prehledFiltr';
import { isSuperAdmin } from '../../roles';
import { PrehledKontext, type OtevrenyProklik, type PrehledKontextHodnota } from './kontext';
import ZalozkaNastaveni from './ZalozkaNastaveni';
import ZalozkaObecna from './ZalozkaObecna';
import ZalozkaVedeni from './ZalozkaVedeni';

const STAV_ZDROJE: Record<string, string> = { ok: 'v pořádku', zastarale: 'zastaralé', chyba: 'chyba', chybi: 'zatím nic' };

/** Hlavička „Data k …“: čas odpovědi, běh automatizace, pošta klienta, Gmail, snímek a všechny zdroje ve výsuvném seznamu. */
function Cerstvost({ moznosti, kDatu }: { moznosti: PrehledObalka<DataMoznosti>; kDatu: string | null }) {
  const c = moznosti.data.cerstvost;
  const gmail = c.gmail[0];
  const tickStav = moznosti.data.zdroje.find((z) => z.zdroj === 'tick')?.stav ?? 'ok';
  const gmailStav = moznosti.data.zdroje.find((z) => z.zdroj === 'gmail')?.stav ?? 'chybi';
  const vadnych = moznosti.data.zdroje.filter((z) => z.stav !== 'ok').length;
  return (
    <div className="prehled-cerstvost">
      <p className="prehled-data-k">
        {kDatu ? <>Čísla k <strong>{casText(kDatu)}</strong> (stav v minulosti)</> : <>Data k <strong>{casText(moznosti.meta.vygenerovano)}</strong></>}
      </p>
      <ul className="prehled-cerstvost-cipy" aria-label="Čerstvost zdrojů">
        <li className={`cerstvost-cip ${tickStav}`}>Automatizace {c.tick_at ? casText(c.tick_at) : 'zatím neběžela'}</li>
        <li className="cerstvost-cip ok" title="Nejnovější odpověď klienta v datech (běh synchronizace pošty se v databázi nezapisuje)">
          Pošta klientů {c.posta_klienta_at ? casText(c.posta_klienta_at) : 'zatím nic'}
        </li>
        <li className={`cerstvost-cip ${gmailStav}`}>Gmail {gmail?.posledni_uspech ? casText(gmail.posledni_uspech) : 'nesynchronizuje se'}</li>
        <li className={`cerstvost-cip ${c.snimek_at ? 'ok' : 'chybi'}`}>Denní snímek {c.snimek_at ? casText(c.snimek_at) : 'zatím žádný'}</li>
      </ul>
      <details className="prehled-zdroje">
        <summary>
          Zdroje dat ({moznosti.data.zdroje.length}){vadnych > 0 ? ` · ${vadnych} ${vadnych === 1 ? 'neúplný' : vadnych <= 4 ? 'neúplné' : 'neúplných'}` : ''}
        </summary>
        <div className="table-wrap">
          <table className="prehled-zdroje-tabulka">
            <thead>
              <tr>
                <th scope="col">Zdroj</th>
                <th scope="col">Stav</th>
                <th scope="col">Od</th>
                <th scope="col">Poslední záznam</th>
              </tr>
            </thead>
            <tbody>
              {moznosti.data.zdroje.map((z) => (
                <tr key={z.zdroj}>
                  <td data-label="Zdroj">{z.nazev || ZDROJ_NAZVY[z.zdroj]}</td>
                  <td data-label="Stav">
                    <span className={`cerstvost-cip ${z.stav}`}>{STAV_ZDROJE[z.stav] ?? z.stav}</span>
                    {z.poznamka ? <span className="muted"> {z.poznamka}</span> : null}
                  </td>
                  <td data-label="Od">{z.od ? casText(z.od) : '—'}</td>
                  <td data-label="Poslední záznam">{z.aktualni_k ? casText(z.aktualni_k) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export default function PrehledPage() {
  const { session } = useAuth();
  // pojistka k trase (D2): Volající ani nepřihlášený stránku nedostane a nic se nenačte
  if (!session || !isSuperAdmin(session.role)) return <Navigate to="/" replace />;
  return <PrehledObsah session={session} />;
}

function PrehledObsah({ session }: { session: Session }) {
  const location = useLocation();
  const navigate = useNavigate();
  const cesta = (useParams()['*'] ?? '').split('/').filter(Boolean);
  const dnes = dnesVPraze();
  const filtr = useMemo(() => ctiFiltr(location.search, dnes), [location.search, dnes]);
  const zalozka = cesta[0] ?? '';
  const sekce = (cesta[1] ?? 'cile') as NastaveniKlic;
  const znamaZalozka = zalozka === 'nastaveni' || ZALOZKY.some((z) => z.klic === zalozka);
  const [moznosti, setMoznosti] = useState<PrehledObalka<DataMoznosti> | null>(null);
  const [definice, setDefinice] = useState<PrehledObalka<DataDefinice> | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [kolo, setKolo] = useState(0);
  const [proklik, setProklik] = useState<OtevrenyProklik | null>(null);
  const odkud = useRef<HTMLElement | null>(null);
  const { demo } = getConfig();

  // možnosti filtru a katalog jednou (a po „Zkusit znovu“); bez nich se záložky nenačítají
  useEffect(() => {
    let zivy = true;
    setChyba(null);
    Promise.all([getApi().prehledMoznosti(session.token), getApi().prehledDefinice(session.token)])
      .then(([m, d]) => {
        if (!zivy) return;
        setMoznosti(m);
        setDefinice(d);
      })
      .catch((e: unknown) => {
        if (zivy) setChyba(chybaPrehledu(e));
      });
    return () => {
      zivy = false;
    };
  }, [session.token, kolo]);

  const nastavFiltr = useCallback(
    (f: FiltrPrehledu) => navigate({ pathname: location.pathname, search: `?${zapisFiltr(f)}` }),
    [navigate, location.pathname]
  );
  const otevriProklik = useCallback((p: OtevrenyProklik, el?: HTMLElement | null) => {
    odkud.current = el ?? null;
    setProklik(p);
  }, []);
  const zavriProklik = useCallback(() => {
    setProklik(null);
    // fokus zpět na kartu, ze které se řádky otevřely
    setTimeout(() => odkud.current?.focus(), 0);
  }, []);

  const kontext: PrehledKontextHodnota | null = useMemo(() => {
    if (!moznosti) return null;
    const serverFiltr = filtrProServer(filtr, moznosti.data.tymy);
    return { filtr, serverFiltr, klicFiltru: JSON.stringify(serverFiltr), moznosti, definice, otevriProklik, dnes };
  }, [filtr, moznosti, definice, otevriProklik, dnes]);

  if (!znamaZalozka || (zalozka === 'nastaveni' && !NASTAVENI_SEKCE.some((s) => s.klic === sekce))) {
    return <Navigate to={{ pathname: zalozka === 'nastaveni' ? '/prehled/nastaveni/cile' : '/prehled/vedeni', search: location.search }} replace />;
  }

  return (
    <div className="prehled-stranka">
      <header className="prehled-hlava">
        <h1 className="page-title">Přehled vedení</h1>
        {moznosti && <Cerstvost moznosti={moznosti} kDatu={filtr.k} />}
      </header>
      {demo && <DemoPruh />}
      {chyba ? (
        <PrehledChyba text={chyba} onZnovu={() => setKolo((k) => k + 1)} />
      ) : !moznosti || !kontext ? (
        <PrehledNacita popis="Načítám Přehled…" />
      ) : (
        <PrehledKontext.Provider value={kontext}>
          <RadaFiltru filtr={filtr} onFiltr={nastavFiltr} moznosti={moznosti.data} ja={moznosti.data.ja.user_id} dnes={dnes} />
          <Zalozky aktivni={zalozka} filtr={filtr} />
          {zalozka === 'vedeni' ? (
            <ZalozkaVedeni />
          ) : zalozka === 'nastaveni' ? (
            <ZalozkaNastaveni sekce={sekce} hledani={`?${zapisFiltr(filtr)}`} />
          ) : (
            <ZalozkaObecna key={zalozka} klic={zalozka} />
          )}
          {proklik && <ProklikPanel proklik={proklik.proklik} nazev={proklik.nazev} popis={proklik.popis} onZavri={zavriProklik} />}
        </PrehledKontext.Provider>
      )}
    </div>
  );
}
