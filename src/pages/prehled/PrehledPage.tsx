// PŘEHLED VEDENÍ (Přehled vedení úkol 13, Albert 17. 11. 2026, rozhodnutí D1, D2 a D12; spec
// docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md §7.1 a §7.2, kontrakt docs/superpowers/specs/2026-11-17-prehled-kontrakt.md).
// Stránka #/prehled/<záložka> jen pro super admina (trasa v App.tsx pod RequireAuth superAdmin a pojistka tady: Volajícímu
// se nevykreslí nic a nezavolá se nic). Hlavička s čerstvostí dat („Data: dnes 9:05“, zdroje), řada filtrů s filtrem v adrese,
// osm záložek a Nastavení, panel řádků za číslem (CSV). Server bez migrace 073 = chyba „Přehled potřebuje migraci 073“, nikdy
// ukázková data. V DEMO pruh „Ukázková data“. Obsah záložek (grafy, tabulky, porovnání) staví úkol 14a nad kontextem
// (pages/prehled/kontext.tsx): každá záložka má svou komponentu Zalozka<Název>.tsx (⚠ NAHRAZUJE obecnou záložku úkolu 13
// s kartami metrik po skupinách).
// Oprava po recenzi 18. 11. 2026: možnosti (hlavička čerstvosti) se načtou znovu při změně záložky a nejvýš po 5 minutách, když
// je stránka vidět; katalog znovu, když odpověď nese jinou definice_verze (kontrakt §5.17). Zpět/Vpřed s otevřeným panelem řádků
// panel zavře (fokus na kartu, a když karta zmizela, na nadpis). ⚠ NAHRAZUJE načtení možností a katalogu jen jednou za návštěvu.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { getApi, type DataDefinice, type DataMoznosti, type PrehledObalka, type Session } from '../../api';
import { useAuth } from '../../auth';
import { getConfig } from '../../config';
import RadaFiltru, { type VolbyZapisu } from '../../components/prehled/FiltrPrehledu';
import ProklikPanel from '../../components/prehled/ProklikPanel';
import { DemoPruh, PrehledChyba, PrehledNacita } from '../../components/prehled/Stavy';
import Zalozky from '../../components/prehled/Zalozky';
import { casText, chybaPrehledu, ZDROJ_NAZVY } from '../../prehled';
import { ctiFiltr, dnesVPraze, filtrProServer, NASTAVENI_SEKCE, zapisFiltr, ZALOZKY, type FiltrPrehledu, type NastaveniKlic } from '../../prehledFiltr';
import { isSuperAdmin } from '../../roles';
import { PrehledKontext, type OtevrenyProklik, type PrehledKontextHodnota } from './kontext';
import ZalozkaDodani from './ZalozkaDodani';
import ZalozkaFinance from './ZalozkaFinance';
import ZalozkaKlienti from './ZalozkaKlienti';
import ZalozkaKomunikace from './ZalozkaKomunikace';
import ZalozkaLide from './ZalozkaLide';
import ZalozkaNastaveni from './ZalozkaNastaveni';
import ZalozkaPipeline from './ZalozkaPipeline';
import ZalozkaPrognoza from './ZalozkaPrognoza';
import ZalozkaVedeni from './ZalozkaVedeni';

const STAV_ZDROJE: Record<string, string> = { ok: 'v pořádku', zastarale: 'zastaralé', chyba: 'chyba', chybi: 'zatím nic' };
/** Možnosti (hlavička čerstvosti) se samy načtou znovu nejvýš po téhle době, když je stránka vidět. */
const OBNOVA_MOZNOSTI_MS = 5 * 60 * 1000;

/** Hlavička „Data: …“: čas odpovědi, běh automatizace, pošta klienta, Gmail, snímek a všechny zdroje ve výsuvném seznamu. */
function Cerstvost({ moznosti, kDatu }: { moznosti: PrehledObalka<DataMoznosti>; kDatu: string | null }) {
  const c = moznosti.data.cerstvost;
  const gmail = c.gmail[0];
  const tickStav = moznosti.data.zdroje.find((z) => z.zdroj === 'tick')?.stav ?? 'ok';
  const gmailStav = moznosti.data.zdroje.find((z) => z.zdroj === 'gmail')?.stav ?? 'chybi';
  const vadnych = moznosti.data.zdroje.filter((z) => z.stav !== 'ok').length;
  return (
    <div className="prehled-cerstvost">
      <p className="prehled-data-k">
        {kDatu ? <>Stav k datu: <strong>{casText(kDatu)}</strong> (minulost)</> : <>Data: <strong>{casText(moznosti.meta.vygenerovano)}</strong></>}
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
  // otevřený panel řádků a adresa, na které se otevřel (Zpět/Vpřed ho zavře)
  const [proklik, setProklik] = useState<{ p: OtevrenyProklik; misto: string } | null>(null);
  const odkud = useRef<HTMLElement | null>(null);
  const nadpis = useRef<HTMLHeadingElement>(null);
  const misto = `${location.pathname}${location.search}`;
  const mistoRef = useRef(misto);
  mistoRef.current = misto;
  // čerstvost: kdy se možnosti naposledy načetly, pořadí odpovědí, verze načteného katalogu a verze, pro kterou se už načítá
  const nactenoMoznosti = useRef(0);
  const cisloMoznosti = useRef(0);
  const [obnovaMoznosti, setObnovaMoznosti] = useState(0);
  // pětiminutová obnova čerstvosti pro bloky nezávislé na filtru (kvalita dat; úkol 14a, oprava po recenzi)
  const [obnova, setObnova] = useState(0);
  const verzeKatalogu = useRef<string | null>(null);
  const zkusenaVerze = useRef<string | null>(null);
  const { demo } = getConfig();

  /** Odpověď s jinou definice_verze než načtený katalog: katalog se načte znovu (jednou pro každou novou verzi, §5.17). */
  const hlasVerzi = useCallback(
    (verze: string | null | undefined) => {
      if (!verze || verzeKatalogu.current === null || verze === verzeKatalogu.current || verze === zkusenaVerze.current) return;
      zkusenaVerze.current = verze;
      getApi()
        .prehledDefinice(session.token)
        .then((d) => {
          verzeKatalogu.current = d.definice_verze;
          setDefinice(d);
        })
        .catch(() => {
          // starý katalog zůstane; další odpověď s novou verzí to zkusí znovu
          zkusenaVerze.current = null;
        });
    },
    [session.token]
  );

  // možnosti filtru a katalog na začátku (a po „Zkusit znovu“); bez nich se záložky nenačítají
  useEffect(() => {
    let zivy = true;
    setChyba(null);
    const moje = ++cisloMoznosti.current;
    Promise.all([getApi().prehledMoznosti(session.token), getApi().prehledDefinice(session.token)])
      .then(([m, d]) => {
        if (!zivy) return;
        verzeKatalogu.current = d.definice_verze;
        if (moje === cisloMoznosti.current) {
          nactenoMoznosti.current = Date.now();
          setMoznosti(m);
        }
        setDefinice(d);
        hlasVerzi(m.definice_verze);
      })
      .catch((e: unknown) => {
        if (zivy) setChyba(chybaPrehledu(e));
      });
    return () => {
      zivy = false;
    };
  }, [session.token, kolo, hlasVerzi]);

  /** Možnosti znovu (hlavička čerstvosti, lidé, týmy): chyba nechá hlavičku z minula, další pokus za 5 minut. */
  const obnovMoznosti = useCallback(() => {
    if (nactenoMoznosti.current === 0) return; // první načtení ještě běží
    const moje = ++cisloMoznosti.current;
    getApi()
      .prehledMoznosti(session.token)
      .then((m) => {
        if (moje !== cisloMoznosti.current) return;
        nactenoMoznosti.current = Date.now();
        setMoznosti(m);
        hlasVerzi(m.definice_verze);
      })
      .catch(() => {
        if (moje === cisloMoznosti.current) setObnovaMoznosti((o) => o + 1);
      });
  }, [session.token, hlasVerzi]);

  // změna záložky: možnosti znovu (čerstvost v hlavičce odpovídá tomu, na co se člověk dívá)
  const zalozkaRef = useRef(zalozka);
  useEffect(() => {
    if (zalozkaRef.current === zalozka) return;
    zalozkaRef.current = zalozka;
    obnovMoznosti();
  }, [zalozka, obnovMoznosti]);
  // nejvýš po 5 minutách od posledního načtení, jen když je stránka vidět; skrytá stránka počká, až ji člověk zase uvidí
  useEffect(() => {
    if (!moznosti) return;
    const id = window.setTimeout(() => {
      if (document.visibilityState === 'visible') {
        obnovMoznosti();
        setObnova((o) => o + 1);
      }
    }, OBNOVA_MOZNOSTI_MS);
    return () => window.clearTimeout(id);
  }, [moznosti, obnovaMoznosti, obnovMoznosti]);
  useEffect(() => {
    const zaseVidet = () => {
      if (document.visibilityState === 'visible' && nactenoMoznosti.current > 0 && Date.now() - nactenoMoznosti.current >= OBNOVA_MOZNOSTI_MS) {
        obnovMoznosti();
        setObnova((o) => o + 1);
      }
    };
    document.addEventListener('visibilitychange', zaseVidet);
    return () => document.removeEventListener('visibilitychange', zaseVidet);
  }, [obnovMoznosti]);

  const nastavFiltr = useCallback(
    (f: FiltrPrehledu, volby?: VolbyZapisu) => {
      const hledani = zapisFiltr(f);
      if (hledani === zapisFiltr(filtr)) return; // nic se nemění: žádný záznam historie ani nové volání
      navigate({ pathname: location.pathname, search: `?${hledani}` }, { replace: !!volby?.nahradit });
    },
    [navigate, location.pathname, filtr]
  );
  const otevriProklik = useCallback((p: OtevrenyProklik, el?: HTMLElement | null) => {
    odkud.current = el ?? null;
    setProklik({ p, misto: mistoRef.current });
  }, []);
  const zavriProklik = useCallback(() => {
    setProklik(null);
    // fokus zpět na kartu, ze které se řádky otevřely; když karta zmizela (jiná záložka), na nadpis stránky
    setTimeout(() => {
      const el = odkud.current;
      if (el && el.isConnected) el.focus();
      else nadpis.current?.focus();
    }, 0);
  }, []);
  // Zpět, Vpřed nebo jiná adresa s otevřeným panelem: panel patří k adrese, na které se otevřel, takže se zavře
  useEffect(() => {
    if (proklik && proklik.misto !== misto) zavriProklik();
  }, [misto, proklik, zavriProklik]);

  const kontext: PrehledKontextHodnota | null = useMemo(() => {
    if (!moznosti) return null;
    const serverFiltr = filtrProServer(filtr, moznosti.data.tymy);
    return { filtr, serverFiltr, klicFiltru: JSON.stringify(serverFiltr), moznosti, definice, otevriProklik, hlasVerzi, dnes, obnova };
  }, [filtr, moznosti, definice, otevriProklik, hlasVerzi, dnes, obnova]);

  if (!znamaZalozka || (zalozka === 'nastaveni' && !NASTAVENI_SEKCE.some((s) => s.klic === sekce))) {
    return <Navigate to={{ pathname: zalozka === 'nastaveni' ? '/prehled/nastaveni/cile' : '/prehled/vedeni', search: location.search }} replace />;
  }

  return (
    <div className="prehled-stranka">
      <header className="prehled-hlava">
        <h1 className="page-title" ref={nadpis} tabIndex={-1}>
          Přehled vedení
        </h1>
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
          ) : zalozka === 'lide' ? (
            <ZalozkaLide />
          ) : zalozka === 'pipeline' ? (
            <ZalozkaPipeline />
          ) : zalozka === 'klienti' ? (
            <ZalozkaKlienti />
          ) : zalozka === 'komunikace' ? (
            <ZalozkaKomunikace />
          ) : zalozka === 'finance' ? (
            <ZalozkaFinance />
          ) : zalozka === 'dodani' ? (
            <ZalozkaDodani />
          ) : zalozka === 'prognoza' ? (
            <ZalozkaPrognoza />
          ) : (
            <ZalozkaNastaveni sekce={sekce} hledani={`?${zapisFiltr(filtr)}`} />
          )}
          {proklik && proklik.misto === misto && <ProklikPanel proklik={proklik.p.proklik} nazev={proklik.p.nazev} popis={proklik.p.popis} onZavri={zavriProklik} />}
        </PrehledKontext.Provider>
      )}
    </div>
  );
}
