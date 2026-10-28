// Moji klienti — kontakty přihlášeného uživatele (RPC my_kontakty, všechny role).
// Super admin si může vybrat kohokoli a vidí jeho klienty (migrace 023, od 027 kohokoli;
// server to hlídá — ostatním cizí klienty nevydá).
// Fulltext filtr je čistě klientský; klik na řádek otevře sdílený detail kontaktu.
// Filtr „vše / chaty / architekti" (migrace 028) jde na server (my_kontakty p_segment),
// aby počet v pilulce zůstal ze serveru (docs/ARCHITEKTI.md 9.6).
// Albert 21. 10. 2026 (migrace 050, jen appka, server obojí posílá od začátku): u každého klienta i známka (A, B, C)
// a cena webu, pod ní menší cena hostingu. Čistá částka jako „7 000 Kč“, jiný text tak, jak ho kdo zapsal (dlouhý
// zkrácený, celý v nápovědě), zástupné „x“ nebo „-“ jako nezadáno. Na telefonu se tabulka posouvá do strany
// uvnitř rámečku (table-wrap), stránka sama ne.
// ⚠ Migrace 051 (Albert 22. 10. 2026: „there's n/a on the hosting and on the prices when we haven't arranged them yet“)
// NAHRAZUJE pomlčku u nezadané ceny: nedohodnutá cena (prázdná nebo zástupná, cenaNezadana) je „n/a“, viz CenaBunka.
// Migrace 056 (Albert 27. 10. 2026: „we should be able when we're in the my client section to have the same like filters
// as we have in the contacts. this only applies for the super admins … sort them … from the newest to the oldest updated
// client“): super admin má nad klienty vybraného člověka stejné filtry jako Kontakty (stav s počty, známka, čekání
// s koši, hledání na serveru i v IČO) a řazení podle poslední změny (sloupec Změněno); server je bere jako list_kontakty
// (my_kontakty s p_status, p_rating, p_search, p_cekani, p_kos, p_razeni). Ostatním se nic nemění: jen klientské hledání
// v načtených řádcích a výchozí pořadí, appka jim nové parametry neposílá. ⚠ NAHRAZUJE pro super admina „Fulltext filtr
// je čistě klientský“ (výš).
// Migrace 057 (Albert 28. 10. 2026): Změněno ukazuje posledni_zmena (i změny od automatizace; proti serveru bez 057
// updated_at), nový sloupec s datem a časem posledního hovoru (všem; Volajícímu „Můj poslední hovor“, jen jeho hovory)
// a super admin řadí i podle posledního hovoru (hovory všech lidí).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getApi,
  type CekaniKind,
  type CekaniKos,
  type Kontakt,
  type MojiFiltry,
  type Razeni,
  type Segment,
} from '../api';
import { audio } from '../audio';
import { useSession } from '../auth';
import KontaktDrawer from '../components/KontaktDrawer';
import PersonPicker, { usePeople } from '../components/PersonPicker';
import { isAdminRole, isSuperAdmin } from '../roles';
import {
  ALL_CEKANI,
  ALL_KOSE,
  ALL_STATUSES,
  CEKANI_HINTS,
  CEKANI_LABELS,
  ErrorBox,
  FlagBadge,
  KOS_LABELS,
  RazeniSelect,
  SegmentBadge,
  SegmentFilter,
  Skryto,
  Spinner,
  STATUS_LABELS,
  StatusBadge,
  CENA_NA,
  cenaText,
  errMsg,
  formatCekani,
  formatDateTime,
  hovorNadpis,
  hovorNapoveda,
  jenZaklad,
  kontaktJmeno,
  zmenenoKdy,
} from '../ui';
import { SearchIcon } from '../icons';

/**
 * Kolik řádků se načte najednou. ⚠ ZVEDNUTO z 500 (Albert 2026-09-24): Mikuláš má
 * 653 klientů a 153 nejstarších (odmítnutých) se na stránku vůbec nedostalo — a protože
 * hledání je jen v načtených řádcích, nešly ani najít. Když by jich někdo měl víc,
 * stránka to řekne (viz „zobrazeno X z Y") a zbytek najde v Kontaktech.
 */
const MOJI_LIMIT = 2000;

/**
 * Cena webu a pod ní menší cena hostingu (Albert 21. 10. 2026). Nedohodnutá cena (migrace 051, Albert 22. 10. 2026) je
 * „n/a“: web bez ceny = šedé „n/a“, hosting bez ceny pod cenou webu = „hosting n/a“, bez obou jen JEDNO šedé „n/a“
 * (ne dvakrát), web bez ceny a hosting s cenou = „n/a“ a pod ním „hosting 1 000 Kč“.
 */
function CenaBunka({ web, hosting }: { web: string | null; hosting: string | null }) {
  const w = cenaText(web);
  const h = cenaText(hosting);
  if (!w && !h) {
    return (
      <span className="muted cena-na" title="Cena webu ani hostingu zatím není dohodnutá">
        {CENA_NA}
      </span>
    );
  }
  return (
    <>
      {w ? (
        <span className="cena-web" title={w.cele}>
          {w.text}
        </span>
      ) : (
        <span className="muted cena-na" title="Cena webu zatím není dohodnutá">
          {CENA_NA}
        </span>
      )}
      {h ? (
        <span className="cena-hosting muted" title={`hosting ${h.cele}`}>
          hosting {h.text}
        </span>
      ) : (
        <span className="cena-hosting muted cena-na" title="Cena hostingu zatím není dohodnutá">
          hosting {CENA_NA}
        </span>
      )}
    </>
  );
}

export default function MojiPage() {
  const session = useSession();
  const people = usePeople();
  // Migrace 056: filtry a řazení jako v Kontaktech jen super admin (Albert: „this only applies for the super admins“)
  const isSuper = isSuperAdmin(session.role);
  const [userId, setUserId] = useState<number | null>(session.user_id);
  const [rows, setRows] = useState<Kontakt[]>([]);
  // ⚠ Počet se bere z `total` od serveru, ne z `rows.length` (Albert 2026-09-12:
  // „each of them are showing something different").
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<Segment | ''>('');
  const [selected, setSelected] = useState<Kontakt | null>(null);
  // Filtry super admina (migrace 056) — stejné jako Kontakty (AdminPage); hledání jde na server se zpožděním
  const [status, setStatus] = useState('');
  const [rating, setRating] = useState('');
  const [cekani, setCekani] = useState<CekaniKind | ''>('');
  const [kos, setKos] = useState<CekaniKos | ''>('');
  const [razeni, setRazeni] = useState<Razeni | ''>('');
  const [hledani, setHledani] = useState('');
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [kosCounts, setKosCounts] = useState<Record<string, number>>({});
  const [tick, setTick] = useState(0);
  // Číslo posledního požadavku: odpověď staršího (pomalého) požadavku se zahodí, jinak by po
  // rychlém přepnutí filtru nebo člověka zůstaly v seznamu cizí řádky (revize 28. 9.).
  const posledni = useRef(0);

  const cizi = userId !== null && userId !== session.user_id;
  const kohoJmeno = cizi ? people.find((p) => p.user_id === userId)?.display_name ?? '' : '';
  const kdo = cizi ? userId : null;

  // super admin: hledání na serveru, 300 ms po posledním písmenu (jako Kontakty)
  useEffect(() => {
    if (!isSuper) return;
    const t = setTimeout(() => setHledani(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search, isSuper]);

  // null = jako dřív (Volající a server bez 056 nic nového nedostanou)
  const filtry: MojiFiltry | null = useMemo(
    () =>
      isSuper
        ? {
            status: status || null,
            rating: rating || null,
            search: hledani || null,
            cekani: cekani || null,
            kos: cekani ? kos || null : null,
            razeni: razeni || null,
          }
        : null,
    [isSuper, status, rating, hledani, cekani, kos, razeni]
  );
  const filtrZapnuty = !!filtry && !!(filtry.status || filtry.rating || filtry.search || filtry.cekani);

  const load = useCallback(async () => {
    const muj = ++posledni.current;
    setLoading(true);
    setError('');
    try {
      const r = await getApi().myKontakty(session.token, MOJI_LIMIT, 0, kdo, segment || null, filtry);
      if (muj !== posledni.current) return; // mezitím se změnil filtr nebo člověk
      setRows(r.rows);
      setTotal(r.total ?? r.rows.length);
    } catch (e) {
      if (muj !== posledni.current) return;
      setError(errMsg(e));
      audio.play('error');
    } finally {
      if (muj === posledni.current) setLoading(false);
    }
  }, [session.token, kdo, segment, filtry]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  // počty u stavů pro vybraného člověka a segment (jako Kontakty; jen super admin, migrace 056)
  useEffect(() => {
    if (!isSuper) {
      setStatusCounts({});
      return;
    }
    let alive = true;
    setStatusCounts({});
    (async () => {
      try {
        const api = getApi();
        const pocty = await Promise.all(
          ALL_STATUSES.map(async (s) => {
            const r = await api.myKontakty(session.token, 1, 0, kdo, segment || null, { status: s });
            return [s, r.total ?? 0] as const;
          })
        );
        if (alive) setStatusCounts(Object.fromEntries(pocty));
      } catch {
        // počty jsou kosmetika (server bez 056 filtr nezná)
      }
    })();
    return () => {
      alive = false;
    };
  }, [session.token, isSuper, kdo, segment, tick]);

  // počty v koších, když je filtr čekání zapnutý (jen super admin)
  useEffect(() => {
    if (!isSuper || !cekani) {
      setKosCounts({});
      return;
    }
    let alive = true;
    (async () => {
      try {
        const api = getApi();
        const pocty = await Promise.all(
          ALL_KOSE.map(async (k) => {
            const r = await api.myKontakty(session.token, 1, 0, kdo, segment || null, { cekani, kos: k });
            return [k, r.total ?? 0] as const;
          })
        );
        if (alive) setKosCounts(Object.fromEntries(pocty));
      } catch {
        // kosmetika
      }
    })();
    return () => {
      alive = false;
    };
  }, [session.token, isSuper, kdo, segment, cekani, tick]);

  // Volající: hledání jen v načtených řádcích jako dřív; super admin: řádky už filtroval server
  const filtered = useMemo(() => {
    if (isSuper) return rows;
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) =>
      [c.name, c.firma, c.mesto, c.phone, c.web, c.email, c.note].some(
        (v) => v && v.toLowerCase().includes(q)
      )
    );
  }, [rows, search, isSuper]);

  const onSaved = (updated: Kontakt) => {
    setSelected(updated);
    setRows((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
    // super admin: úprava může kontakt posunout v řazení nebo ho vyřadit z filtru (056), načíst znovu
    if (isSuper) setTick((t) => t + 1);
  };

  const soucet = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const poradiText =
    razeni === 'zmena_nejnovejsi'
      ? 'naposledy změnění nahoře'
      : razeni === 'zmena_nejstarsi'
        ? 'nejdéle nezměnění nahoře'
        : razeni === 'hovor_nejnovejsi'
          ? 'naposledy volaní nahoře'
          : razeni === 'hovor_nejstarsi'
            ? 'nejdéle nevolaní nahoře'
            : 'nejdůležitější nahoře';

  return (
    <div>
      <p className="eyebrow">{cizi ? `klienti: ${kohoJmeno}` : 'moji klienti'}</p>
      <h1 className="page-title">
        {cizi ? `Klienti — ${kohoJmeno}` : 'Moji klienti'}
        {total > 0 && <span className="count-pill">{total}</span>}
      </h1>

      <PersonPicker
        people={people}
        value={userId}
        onChange={(id) => {
          setUserId(id ?? session.user_id);
          setSelected(null);
        }}
        label="Čí klienty zobrazit"
      />

      <SegmentFilter
        value={segment}
        onChange={(s) => {
          setSegment(s);
          setSelected(null);
        }}
      />

      {isSuper ? (
        <>
          <div className="filter-bar moji-filtry">
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtr statusu">
              <option value="">{`Všechny statusy${soucet ? ` (${soucet})` : ''}`}</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                  {statusCounts[s] !== undefined ? ` (${statusCounts[s]})` : ''}
                </option>
              ))}
            </select>
            <select value={rating} onChange={(e) => setRating(e.target.value)} aria-label="Filtr známky">
              <option value="">Známka: vše</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
            <select
              value={cekani}
              onChange={(e) => {
                const v = e.target.value as CekaniKind | '';
                setCekani(v);
                // zapnutí filtru = rovnou pracovní koš „k zavolání“, vypnutí = zrušit koš (jako Kontakty)
                setKos(v ? 'k_zavolani' : '');
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
            <RazeniSelect value={razeni} onChange={setRazeni} />
            <div className="search-wrap search-wide">
              <input
                className="search-input"
                aria-label="Hledat v klientech"
                placeholder="Hledat jméno, studio, telefon, web, e-mail, město, IČO, poznámku…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          {cekani && (
            <div className="flag-filter-bar moji-kose">
              {ALL_KOSE.map((k) => (
                <button key={k} className={`pill-btn sm${kos === k ? ' go' : ''}`} onClick={() => setKos(kos === k ? '' : k)}>
                  {KOS_LABELS[k]}
                  {kosCounts[k] !== undefined ? ` (${kosCounts[k]})` : ''}
                </button>
              ))}
              <button className={`pill-btn sm${kos === '' ? ' go' : ''}`} onClick={() => setKos('')}>
                Vše
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="filter-bar">
          <div className="search-wrap">
            <input
              className="search-input"
              placeholder="Hledat jméno, studio, město, telefon, web, e-mail, poznámku…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      )}

      <ErrorBox>{error}</ErrorBox>
      {!loading && total > rows.length && (
        <p className="muted" style={{ margin: '0 0 10px' }}>
          Zobrazeno {rows.length} z {total} ({poradiText}).{' '}
          {isSuper ? 'Zbytek ukáže přesnější filtr nebo hledání.' : 'Ostatní najdeš v Kontaktech hledáním.'}
        </p>
      )}

      {loading ? (
        <Spinner label="Načítám klienty…" />
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <div className="big-emoji"><SearchIcon size={56} /></div>
          <h2>{rows.length === 0 && !filtrZapnuty ? 'Zatím žádní klienti' : 'Nic nenalezeno'}</h2>
          <p className="muted">
            {rows.length === 0 && !filtrZapnuty
              ? cizi
                ? 'Tenhle člověk zatím nikomu nevolal.'
                : 'Jakmile někomu zavoláš, objeví se tady.'
              : isSuper
                ? 'Zkus změnit filtry nebo hledaný výraz.'
                : 'Zkus změnit hledaný výraz.'}
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="kontakty">
            <thead>
              <tr>
                <th>Jméno</th>
                <th>Telefon</th>
                <th>Status</th>
                <th>Známka</th>
                <th>Cena</th>
                {isSuper && cekani ? <th>Čeká</th> : null}
                <th>Změněno</th>
                <th title={hovorNapoveda(!isSuper)}>{hovorNadpis(!isSuper)}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className={selected?.id === r.id ? 'selected' : ''}
                  onClick={() => setSelected(r)}
                >
                  <td className="row-name">
                    <FlagBadge kontakt={r} compact /> <SegmentBadge kontakt={r} compact />{' '}
                    {kontaktJmeno(r)}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.phone || '—'}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="znamka-cell">
                    {jenZaklad(r) ? <Skryto /> : r.rating ? <span className="badge rating">{r.rating}</span> : <span className="muted">—</span>}
                  </td>
                  <td className="cena-cell">{jenZaklad(r) ? <Skryto /> : <CenaBunka web={r.cena_web} hosting={r.cena_hosting} />}</td>
                  {isSuper && cekani ? (
                    <td style={{ whiteSpace: 'nowrap' }} className="ceka-cell">
                      {formatCekani(r.cekani_since)}
                    </td>
                  ) : null}
                  <td style={{ whiteSpace: 'nowrap' }} className="muted zmeneno-cell">
                    {formatDateTime(zmenenoKdy(r))}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }} className="muted hovor-cell">
                    {formatDateTime(r.posledni_hovor ?? null)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <KontaktDrawer
          kontakt={selected}
          onClose={() => setSelected(null)}
          onSaved={onSaved}
          readOnly={!isAdminRole(session.role)}
        />
      )}
    </div>
  );
}
