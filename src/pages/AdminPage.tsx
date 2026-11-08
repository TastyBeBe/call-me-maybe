import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getApi,
  type CekaniKind,
  type CekaniKos,
  type Kontakt,
} from '../api';
import { audio } from '../audio';
import { useSession } from '../auth';
import DovolaniTlacitko from '../components/DovolaniTlacitko';
import { HvezdaPrepinac } from '../components/Hvezda';
import { HodnoceniVSeznamu } from '../components/JejichWeb';
import KontaktDrawer from '../components/KontaktDrawer';
import { usePeople } from '../components/PersonPicker';
import SeznamFiltry from '../components/SeznamFiltry';
import { PRAZDNE_FILTRY, filtrJenSvoje, filtryNaServer, type StavFiltru } from '../filtry';
import { isAdminRole, isSuperAdmin } from '../roles';
import { icoVidi } from '../segment';
import { useNiky, viditelneNiky } from '../obory';
import {
  ALL_CEKANI,
  ALL_KOSE,
  ALL_STATUSES,
  CEKANI_HINTS,
  CEKANI_LABELS,
  ErrorBox,
  FlagBadge,
  KOS_LABELS,
  MlceniBunka,
  RazeniSelect,
  SegmentBadge,
  Skryto,
  SKRYTO_NAPOVEDA,
  Spinner,
  StatusBadge,
  errMsg,
  formatCekani,
  formatDateTime,
  hovorNadpis,
  hovorNapoveda,
  jenZaklad,
  kontaktJmeno,
  priznakProRoli,
  zmenenoKdy,
} from '../ui';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  SearchIcon,
} from '../icons';

const PAGE_SIZE = 50;

// KONTAKTY — celou databázi vidí od migrace 023 všichni (Albert 2026-09-24).
// Server u kontaktu ukazuje jméno volajícího jen tomu, komu patří (a jeho super
// adminovi); ostatním „jiný volající". Filtr podle volajícího: super admin kohokoli
// (migrace 027, seznam lidí posílá server), ostatní jen sebe. Upravovat kontakty smí
// admin a super admin, volající jen čte.
// Filtr „vše / chaty / architekti" (migrace 028) jde na server do seznamu i do všech
// počtů; výchozí je vše a nepamatuje se (docs/ARCHITEKTI.md 9.6).
// ⚠ Od migrace 045 (Albert 20. 10. 2026, „Hide all of it“): součty celé databáze (počty u stavů a košů,
// celkový počet) jen super admin; Volajícímu server posílá total null, stránkuje se podle `dalsi`.
// NAHRAZUJE „počty stavů a košů vidí každý“.
// ⚠ Od migrace 045 (Albert 20. 10. 2026: Volající vidí stav jen u svých klientů) NAHRAZUJE „celou databázi se stavy
// vidí všichni“: Volající vidí všechny kontakty, ale u cizího (skryto) jen jméno a kontakt; stav, známka, kdo volal,
// čekání a datum změny jsou u něj pomlčka, filtr stavu, známky a čekání a hledání v poznámce berou jen jeho klienty
// a server řadí jeho klienty napřed (cizí podle id).
// Migrace 056 (Albert 27. 10. 2026: „sort them … from the newest to the oldest updated client“): výběr řazení podle
// poslední změny (sloupec Změněno, od nejnovější nebo nejstarší) pro každého; Volajícímu server podle změny řadí jen
// jeho klienty, cizí kontakty jsou dál za nimi jen podle id (045). Výchozí pořadí beze změny.
// Migrace 057 (Albert 28. 10. 2026: „both filters. One for the latest change regarding anything … and the second one should
// be just the last time they were called“): Změněno ukazuje posledni_zmena (i změna stavu, návrh a odpovědi od
// automatizace; ⚠ NAHRAZUJE updated_at z 056, proti serveru bez 057 dál updated_at) a nový sloupec poslední hovor s datem
// a časem (posledni_hovor); řazení i podle posledního hovoru. Volajícímu se do něj počítají jen jeho hovory (045), sloupec
// se mu jmenuje „Můj poslední hovor“ a u cizího kontaktu je pomlčka.
// Migrace 060 (Albert 1. 11. 2026: „the same combinable filters in Kontakty, Moji klienti and Označené“): sdílený řádek
// filtrů (SeznamFiltry): stav víc najednou, známka i „bez známky“, jen s hvězdou, skupina označení (Neodpověděl na návrh /
// na změny), mlčení v pracovních dnech, řazení i „Nejdéle bez odpovědi“ a „Hvězda nejdřív“; filtr volajícího a čekání
// s koši zůstávají. ⚠ NAHRAZUJE výběr jednoho stavu a jedné známky (jeden stav a jedna známka A až C jdou serveru dál jako
// p_status a p_rating, víc přes p_statusy a p_znamky). Volajícímu berou všechny filtry jen jeho klienty (045, hlídá server).
// Nový sloupec Mlčí (MlceniBunka: označení, pracovní dny, naše poslední zpráva, klient naposledy; u cizího pomlčka uvnitř
// buňky) a hvězda u jména (jen u vlastního řádku). Šest pomlček jenZaklad níž zůstává (kontrola 193).
// ⚠ Migrace 061 (Albert 2. 11. 2026: „make it a little bit more compact … or just fits into the screen without sliding
// anywhere“; řekl to k Označeným, tabulka tady měla 1 364 až 1 427 px v rámečku 1 180 px a poslední sloupec nebyl vidět na
// žádné šířce) NAHRAZUJE „tabulka se posouvá do strany“ v rámečku table-wrap: řádek kontaktu má dva řádky bez vodorovného
// posunu (table.kontakty.kompakt v styles.css, jako Označené a Moji klienti): nahoře hvězda, příznak, segment, jméno a telefon,
// pod tím ostatní buňky s malým popiskem (data-label v CSS). Obsah buněk se nemění; buňku jen s pomlčkou cizího kontaktu
// (Skryto) CSS schová, nápověda nad tabulkou to vysvětluje. Příznak „Údaje z internetu“ Volající nevidí (priznakProRoli,
// Albert 2. 11. 2026: „only the super admins will see this flag“).
// Migrace 062 (Albert 2. 11. 2026: „so that I called them again feature is both in the flagged/marked section and also in the
// my clients section, and you can even add [it] to the contacts section“): v 1. řádku za telefonem „Zavolal/a jsem“
// (DovolaniTlacitko), na telefonu jen ikona; jen u vlastních řádků, které přihlášený smí zapsat (dovolatSmi: nikdy u cizího
// kontaktu Volajícího, ve frontě volání, u Nekontaktovat, Nerelevantní, Odmítnuto ani u nabídnuté slevy bez označení).
// Šest buněk Skryto cizího kontaktu (kontrola 193) zůstává beze změny, řádek se do strany neposouvá (e2e O61a a O62).
export default function AdminPage() {
  const session = useSession();
  // migrace 064: zástupný text hledání zmíní firmu, jen když jsou v appce niky oboru
  const sNikami = viditelneNiky(useNiky()).length > 0;
  const isAdmin = isAdminRole(session.role);
  const isSuper = isSuperAdmin(session.role);
  const [searchParams] = useSearchParams();

  // migrace 060: segment, stav, známka, hvězda, označení, mlčení, řazení a hledání v jednom stavu (src/filtry.ts)
  const [filtry, setFiltry] = useState<StavFiltru>({ ...PRAZDNE_FILTRY, hledat: searchParams.get('search') ?? '' });
  const segment = filtry.segment;
  const [caller, setCaller] = useState('');
  // čekání na odpověď (migrace 014); při zapnutí se rovnou zapne koš „k zavolání",
  // aby začátek seznamu nezaplavili klienti, kteří mlčí rok (Albert 2026-09-07)
  const [cekani, setCekani] = useState<CekaniKind | ''>('');
  const [kos, setKos] = useState<CekaniKos | ''>('');
  const [kosCounts, setKosCounts] = useState<Record<string, number>>({});
  // Migrace 056 (Albert 27. 10. 2026: „sort them … from the newest to the oldest updated client“): řazení podle poslední
  // změny (sloupec Změněno); '' = výchozí pořadí. Volajícímu server řadí podle změny jen jeho klienty, cizí jsou za nimi.
  const razeni = filtry.razeni;
  const search = filtry.hledat;
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [page, setPage] = useState(0);
  // nové filtry pro server; mění se jen s nimi (ne s každým písmenem hledání, to jde se zpožděním)
  const naServer = useMemo(
    () => filtryNaServer(filtry),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtry.statusy, filtry.znamky, filtry.jenHvezda, filtry.kategorie, filtry.mlciMin, filtry.mlciMax]
  );

  const [rows, setRows] = useState<Kontakt[]>([]);
  const [total, setTotal] = useState<number | null>(0);
  const [dalsi, setDalsi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Kontakt | null>(null);
  const callers = usePeople();   // jen super admin; ostatní mají prázdný seznam
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const reloadTick = useRef(0);
  const [tick, setTick] = useState(0);
  // Číslo posledního požadavku na seznam: odpověď staršího (pomalého) požadavku se zahodí,
  // jinak by po rychlém přepnutí filtru pod „chaty" zůstali architekti (revize 28. 9.).
  const posledniSeznam = useRef(0);

  // debounce fulltextu
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // počty pro status dropdown (1 dotaz s limit 1 na každý status); jen super admin (migrace 045)
  useEffect(() => {
    if (!isSuper) {
      setStatusCounts({});
      return;
    }
    let alive = true;
    (async () => {
      try {
        const api = getApi();
        const counts = await Promise.all(
          ALL_STATUSES.map(async (s) => {
            const r = await api.listKontakty(session.token, {
              status: s,
              segment: segment || null,
              limit: 1,
            });
            return [s, r.total ?? 0] as const;
          })
        );
        if (alive) setStatusCounts(Object.fromEntries(counts));
      } catch {
        // počty jsou jen kosmetika — chybu neukazujeme
      }
    })();
    return () => {
      alive = false;
    };
  }, [session.token, segment, tick, isSuper]);

  // počty v koších (jen když je filtr čekání zapnutý) — ať je vidět, kolik jich
  // je v tom studeném balíku, aniž by zaplavily začátek seznamu; jen super admin (migrace 045)
  useEffect(() => {
    if (!cekani || !isSuper) {
      setKosCounts({});
      return;
    }
    let alive = true;
    (async () => {
      try {
        const api = getApi();
        const counts = await Promise.all(
          ALL_KOSE.map(async (k) => {
            const r = await api.listKontakty(session.token, {
              cekani,
              kos: k,
              segment: segment || null,
              limit: 1,
            });
            return [k, r.total ?? 0] as const;
          })
        );
        if (alive) setKosCounts(Object.fromEntries(counts));
      } catch {
        // počty jsou kosmetika
      }
    })();
    return () => {
      alive = false;
    };
  }, [session.token, cekani, segment, tick, isSuper]);

  const load = useCallback(async () => {
    const muj = ++posledniSeznam.current;
    setLoading(true);
    setError('');
    try {
      const r = await getApi().listKontakty(session.token, {
        ...naServer,
        caller: caller || null,
        search: debouncedSearch.trim() || null,
        cekani: cekani || null,
        kos: cekani ? kos || null : null,
        segment: segment || null,
        razeni: razeni || null,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      if (muj !== posledniSeznam.current) return; // mezitím se změnil filtr
      setRows(r.rows);
      setTotal(r.total);
      setDalsi(r.dalsi ?? (r.total !== null && (page + 1) * PAGE_SIZE < r.total));
    } catch (e) {
      if (muj !== posledniSeznam.current) return;
      setError(errMsg(e));
      audio.play('error');
    } finally {
      if (muj === posledniSeznam.current) setLoading(false);
    }
  }, [session.token, segment, naServer, caller, debouncedSearch, cekani, kos, razeni, page]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  const onSaved = (updated: Kontakt) => {
    setSelected(updated);
    setRows((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
    reloadTick.current += 1;
    setTick(reloadTick.current);
  };
  // migrace 060: zápis hovoru s označeným klientem v přehledu: detail zavřít (stav i poznámku změnil server), načíst znovu;
  // od migrace 062 i „Zavolal/a jsem“ v řádku a v detailu klienta bez označení
  const [info, setInfo] = useState('');
  const onDovolano = (veta: string) => {
    setSelected(null);
    setInfo(veta);
    reloadTick.current += 1;
    setTick(reloadTick.current);
  };
  // hvězda v řádku: jen ten řádek (ostatní klíče seznamu zůstávají)
  const onHvezda = (k: Kontakt) => {
    setRows((rs) => rs.map((r) => (r.id === k.id ? k : r)));
    setSelected((s) => (s && s.id === k.id ? k : s));
  };

  // Volající total nedostane (null): stránky bez celkového počtu, „Další“ podle `dalsi` (migrace 045)
  const pageCount = total === null ? null : Math.max(1, Math.ceil(total / PAGE_SIZE));
  const totalAll = useMemo(
    () => Object.values(statusCounts).reduce((a, b) => a + b, 0),
    [statusCounts]
  );

  return (
    <div>
      <p className="eyebrow">databáze kontaktů</p>
      <h1 className="page-title">
        Kontakty
        {total !== null && total > 0 && <span className="count-pill">{total}</span>}
      </h1>

      <SeznamFiltry
        filtry={filtry}
        onChange={(f) => {
          setFiltry(f);
          setPage(0);
        }}
        statusPocty={isSuper ? statusCounts : undefined}
        statusSoucet={isSuper ? totalAll : undefined}
        hledatAria="Hledat v kontaktech"
        hledatPlaceholder={(
          !isSuper
            ? 'Hledat jméno, studio, telefon, web, město, IČO, e-mail architekta; e-mail chaty a poznámku jen u mých…'
            : icoVidi(session.role)
              ? 'Hledat jméno, studio, telefon, web, e-mail, město, IČO, poznámku…'
              : 'Hledat jméno, studio, telefon, web, e-mail, město, poznámku…'
        ).replace('studio', sNikami ? 'studio, firmu' : 'studio')}
        razeni={
          <RazeniSelect
            value={razeni}
            onChange={(r) => {
              setFiltry({ ...filtry, razeni: r });
              setPage(0);
            }}
            jenMojeHovory={!isSuper}
          />
        }
      >
        <select
          value={caller}
          onChange={(e) => {
            setCaller(e.target.value);
            setPage(0);
          }}
          aria-label="Filtr volajícího"
        >
          <option value="">Všichni volající</option>
          {isSuper ? (
            callers.map((c) => (
              <option key={c.user_id} value={c.display_name}>
                {c.user_id === session.user_id ? `Já (${c.display_name})` : c.display_name}
              </option>
            ))
          ) : (
            <option value={session.display_name}>Naposledy volal/a já</option>
          )}
        </select>
        <select
          value={cekani}
          onChange={(e) => {
            const v = e.target.value as CekaniKind | '';
            setCekani(v);
            // zapnutí filtru = rovnou pracovní koš, vypnutí = zrušit koš
            setKos(v ? 'k_zavolani' : '');
            setPage(0);
          }}
          aria-label="Filtr čekání na odpověď"
          title={cekani ? CEKANI_HINTS[cekani] : 'Klienti, kteří nám neodpověděli'}
        >
          <option value="">Čekání: vše</option>
          {ALL_CEKANI.map((c) => (
            <option key={c} value={c}>
              {CEKANI_LABELS[c]}
            </option>
          ))}
        </select>
      </SeznamFiltry>

      {!isSuper && (
        <p className="muted skryto-napoveda" style={{ fontSize: 13.5, margin: '0 0 10px' }}>
          {SKRYTO_NAPOVEDA} Filtry stavu, známky, hvězdy, označení, mlčení a čekání a hledání v poznámce berou jen tvoje klienty
          (a jen tvoje označení k zavolání).
          {razeni
            ? razeni.startsWith('hovor_')
              ? ' Podle posledního hovoru se řadí jen tvoji klienti a počítají se jen tvoje hovory, ostatní kontakty jsou za nimi.'
              : razeni === 'mlceni' || razeni === 'hvezda'
                ? ' Podle mlčení a hvězdy se řadí jen tvoji klienti, ostatní kontakty jsou za nimi.'
                : ' Podle poslední změny se řadí jen tvoji klienti, ostatní kontakty jsou za nimi.'
            : ''}
        </p>
      )}

      {cekani && (
        <div className="flag-filter-bar">
          {ALL_KOSE.map((k) => (
            <button
              key={k}
              className={`pill-btn sm${kos === k ? ' go' : ''}`}
              onClick={() => {
                setKos(kos === k ? '' : k);
                setPage(0);
              }}
            >
              {KOS_LABELS[k]}
              {kosCounts[k] !== undefined ? ` (${kosCounts[k]})` : ''}
            </button>
          ))}
          <button
            className={`pill-btn sm${kos === '' ? ' go' : ''}`}
            onClick={() => {
              setKos('');
              setPage(0);
            }}
          >
            Vše
          </button>
        </div>
      )}

      <ErrorBox>{error}</ErrorBox>
      {/* migrace 062: věta po zápisu hovoru v živé oblasti (čtečka ji přečte, jako Označené) */}
      <div role="status">{info && <div className="info-box dovolani-info">{info}</div>}</div>

      {loading ? (
        <Spinner label="Načítám kontakty…" />
      ) : rows.length === 0 ? (
        <div className="card empty-state">
          <div className="big-emoji"><SearchIcon size={56} /></div>
          <h2>Nic nenalezeno</h2>
          {/* Migrace 045 (Albert 20. 10. 2026): Volajícímu bere filtr stavu, známky a čekání jen jeho klienty, u cizích
              kontaktů stav nevidí. ⚠ NAHRAZUJE obecné „Zkus změnit filtry“ pro tenhle případ (recenze appky 20. 10. 2026). */}
          <p className="muted">
            {!isSuper && (filtrJenSvoje(filtry) || cekani || kos)
              ? 'Filtry stavu, známky, hvězdy, označení, mlčení a čekání ukazují jen tvoje klienty (u ostatních kontaktů stav nevidíš) a mezi nimi takový není. Zruš filtr a uvidíš všechny kontakty.'
              : 'Zkus změnit filtry nebo hledaný výraz.'}
          </p>
        </div>
      ) : (
        // migrace 061: kompaktní řádky jako Označené (role v TSX, protože display se v CSS mění; hlavička jen pro čtečky).
        // Buňku jen s pomlčkou cizího kontaktu (Skryto) CSS schová, vysvětlí to nápověda nad tabulkou (skryto-napoveda).
        <div className="table-wrap kompakt-wrap">
          <table className="kontakty kompakt" role="table">
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader">Jméno</th>
                <th role="columnheader">Telefon</th>
                <th role="columnheader">Akce</th>
                <th role="columnheader">Status</th>
                <th role="columnheader">Známka</th>
                <th role="columnheader" title="Kolik pracovních dní klient mlčí od naší poslední zprávy; naše poslední zpráva a kdy klient napsal naposledy">Mlčí</th>
                <th role="columnheader">Volal/a</th>
                <th role="columnheader">Web</th>
                {cekani ? <th role="columnheader">Čeká</th> : null}
                <th role="columnheader">Změněno</th>
                <th role="columnheader" title={hovorNapoveda(!isSuper)}>{hovorNadpis(!isSuper)}</th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {rows.map((r) => (
                <tr
                  role="row"
                  key={r.id}
                  className={selected?.id === r.id ? 'selected' : ''}
                  onClick={() => setSelected(r)}
                >
                  {/* 1. řádek: jméno a telefon (obyčejný text, klepnutí na řádek tak vždy otevře detail) */}
                  <td role="cell" className="row-name kompakt-hlavni">
                    {/* migrace 061: příznak „Údaje z internetu“ jen super adminovi */}
                    <HvezdaPrepinac kontakt={r} onZmena={onHvezda} /> <FlagBadge kontakt={priznakProRoli(r, isSuper)} compact />{' '}
                    <SegmentBadge kontakt={r} compact /> {kontaktJmeno(r)}
                  </td>
                  <td role="cell" className="kompakt-hlavni tel-cell">{r.phone || '—'}</td>
                  {/* migrace 062: „Zavolal/a jsem“ v 1. řádku jen u vlastního řádku (u cizího kontaktu prázdná buňka, CSS ji
                      schová); klik detail neotevře */}
                  <td role="cell" className="kompakt-hlavni radek-akce">
                    <DovolaniTlacitko kontakt={r} onDovolano={onDovolano} jenIkonaNaTelefonu />
                  </td>
                  {/* 2. řádek: údaje s malým popiskem (data-label), zalomí se podle šířky */}
                  <td role="cell">{jenZaklad(r) ? <Skryto /> : <StatusBadge status={r.status} />}</td>
                  <td role="cell" data-label="známka">{jenZaklad(r) ? <Skryto /> : r.rating ? <span className="badge rating">{r.rating}</span> : '—'}</td>
                  {/* migrace 060: u cizího kontaktu pomlčka uvnitř MlceniBunka (server klíče mlčení ani označení nepošle) */}
                  <td role="cell" className="mlci-cell">
                    <MlceniBunka kontakt={r} />
                  </td>
                  <td role="cell" data-label="volal/a">{jenZaklad(r) ? <Skryto /> : r.last_caller || '—'}</td>
                  <td role="cell" data-label="web">
                    {r.web ? (
                      <a
                        href={r.web}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        odkaz
                      </a>
                    ) : (
                      <span className="muted">nemá</span>
                    )}
                    {/* migrace 064 (návrh 6.4): u firmy oboru písmeno hodnocení webu, věta jako title */}
                    <HodnoceniVSeznamu kontakt={r} />
                  </td>
                  {cekani ? (
                    <td role="cell" style={{ whiteSpace: 'nowrap' }} className="ceka-cell" data-label="čeká">
                      {jenZaklad(r) ? <Skryto /> : formatCekani(r.cekani_since)}
                    </td>
                  ) : null}
                  <td role="cell" style={{ whiteSpace: 'nowrap' }} className="muted zmeneno-cell" data-label="změněno">
                    {jenZaklad(r) ? <Skryto /> : formatDateTime(zmenenoKdy(r))}
                  </td>
                  <td role="cell" style={{ whiteSpace: 'nowrap' }} className="muted hovor-cell" data-label={hovorNadpis(!isSuper).toLowerCase()}>
                    {jenZaklad(r) ? <Skryto /> : formatDateTime(r.posledni_hovor ?? null)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(pageCount === null ? page > 0 || dalsi : pageCount > 1) && (
        <div className="pagination">
          <button
            className="pill-btn sm"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            <ArrowLeftIcon size={16} /> Předchozí
          </button>
          <span className="muted">
            strana {page + 1}{pageCount === null ? '' : ` / ${pageCount}`}
          </span>
          <button
            className="pill-btn sm"
            disabled={(pageCount === null ? !dalsi : page + 1 >= pageCount) || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Další <ArrowRightIcon size={16} />
          </button>
        </div>
      )}

      {selected && (
        <KontaktDrawer
          kontakt={selected}
          onClose={() => setSelected(null)}
          onSaved={onSaved}
          readOnly={!isAdmin}
          onDovolano={onDovolano}
        />
      )}
    </div>
  );
}
