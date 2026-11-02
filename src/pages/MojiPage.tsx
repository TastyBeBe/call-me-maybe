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
// ⚠ Migrace 060 (Albert 1. 11. 2026: „Callers get ALL filters in Moji klienti too … but only over their own clients“)
// NAHRAZUJE „filtry a řazení jen super admin“ (27. 10. 2026) i „Volající: jen klientské hledání v načtených řádcích“: sdílený
// řádek filtrů (SeznamFiltry, jako Kontakty a Označené) má každý; server je bere jen nad klienty vybraného člověka (Volající
// jen svými, jen jeho označení k zavolání). Počty u stavů dál jen super admin. Nový sloupec Mlčí a hvězda u jména.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getApi,
  type CekaniKind,
  type CekaniKos,
  type Kontakt,
  type MojiFiltry,
} from '../api';
import { audio } from '../audio';
import { useSession } from '../auth';
import { HvezdaPrepinac } from '../components/Hvezda';
import KontaktDrawer from '../components/KontaktDrawer';
import PersonPicker, { usePeople } from '../components/PersonPicker';
import SeznamFiltry from '../components/SeznamFiltry';
import { PRAZDNE_FILTRY, filtrZapnuty, filtryNaServer, type StavFiltru } from '../filtry';
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
  MlceniBunka,
  RazeniSelect,
  SegmentBadge,
  Skryto,
  Spinner,
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
  // Migrace 056: počty u stavů (součty) jen super admin; ⚠ od 060 filtry a řazení každý (NAHRAZUJE „jen super admin“)
  const isSuper = isSuperAdmin(session.role);
  const [userId, setUserId] = useState<number | null>(session.user_id);
  const [rows, setRows] = useState<Kontakt[]>([]);
  // ⚠ Počet se bere z `total` od serveru, ne z `rows.length` (Albert 2026-09-12:
  // „each of them are showing something different").
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Kontakt | null>(null);
  // Filtry (migrace 056 a 060) — sdílený řádek jako Kontakty (stav, známka, hvězda, označení, mlčení, řazení, hledání)
  // a navíc čekání s koši; hledání jde na server se zpožděním
  const [stav, setStav] = useState<StavFiltru>(PRAZDNE_FILTRY);
  const segment = stav.segment;
  const search = stav.hledat;
  const razeni = stav.razeni;
  const [cekani, setCekani] = useState<CekaniKind | ''>('');
  const [kos, setKos] = useState<CekaniKos | ''>('');
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

  // hledání na serveru, 300 ms po posledním písmenu (jako Kontakty; ⚠ od 060 i pro Volajícího)
  useEffect(() => {
    const t = setTimeout(() => setHledani(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // co jde serveru: jen zapnuté filtry (server bez 056 a 060 nic nového nedostane, dokud je nikdo nezapne)
  const filtry: MojiFiltry = useMemo(
    () => ({
      ...filtryNaServer(stav),
      search: hledani || null,
      cekani: cekani || null,
      kos: cekani ? kos || null : null,
      razeni: razeni || null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stav.statusy, stav.znamky, stav.jenHvezda, stav.kategorie, stav.mlciMin, stav.mlciMax, hledani, cekani, kos, razeni]
  );
  const filtrZapnutyNyni = filtrZapnuty({ ...stav, hledat: hledani }) || !!cekani;

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

  // ⚠ od 060 řádky filtruje server každému (NAHRAZUJE klientské hledání Volajícího v načtených řádcích)
  const filtered = rows;

  const onSaved = (updated: Kontakt) => {
    setSelected(updated);
    setRows((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
    // úprava může kontakt posunout v řazení nebo ho vyřadit z filtru (056, od 060 i u Volajícího), načíst znovu
    setTick((t) => t + 1);
  };
  // migrace 060: zápis hovoru s označeným klientem v přehledu: detail zavřít (stav i poznámku změnil server), načíst znovu
  const [info, setInfo] = useState('');
  const onDovolano = (veta: string) => {
    setSelected(null);
    setInfo(veta);
    setTick((t) => t + 1);
  };
  // hvězda v řádku: jen ten řádek
  const onHvezda = (k: Kontakt) => {
    setRows((rs) => rs.map((r) => (r.id === k.id ? k : r)));
    setSelected((s) => (s && s.id === k.id ? k : s));
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
            : razeni === 'mlceni'
              ? 'nejdéle bez odpovědi nahoře'
              : razeni === 'hvezda'
                ? 's hvězdou nahoře'
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

      <SeznamFiltry
        filtry={stav}
        onChange={(f) => {
          if (f.segment !== stav.segment) setSelected(null);
          setStav(f);
        }}
        statusPocty={isSuper ? statusCounts : undefined}
        statusSoucet={isSuper ? soucet : undefined}
        className="moji-filtry"
        hledatAria="Hledat v klientech"
        hledatPlaceholder="Hledat jméno, studio, telefon, web, e-mail, město, IČO, poznámku…"
        razeni={<RazeniSelect value={razeni} onChange={(r) => setStav({ ...stav, razeni: r })} jenMojeHovory={!isSuper} />}
      >
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
      </SeznamFiltry>
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

      <ErrorBox>{error}</ErrorBox>
      {info && <div className="info-box dovolani-info">{info}</div>}
      {!loading && total > rows.length && (
        <p className="muted" style={{ margin: '0 0 10px' }}>
          Zobrazeno {rows.length} z {total} ({poradiText}). Zbytek ukáže přesnější filtr nebo hledání.
        </p>
      )}

      {loading ? (
        <Spinner label="Načítám klienty…" />
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <div className="big-emoji"><SearchIcon size={56} /></div>
          <h2>{rows.length === 0 && !filtrZapnutyNyni ? 'Zatím žádní klienti' : 'Nic nenalezeno'}</h2>
          <p className="muted">
            {rows.length === 0 && !filtrZapnutyNyni
              ? cizi
                ? 'Tenhle člověk zatím nikomu nevolal.'
                : 'Jakmile někomu zavoláš, objeví se tady.'
              : 'Zkus změnit filtry nebo hledaný výraz.'}
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
                <th title="Kolik pracovních dní klient mlčí od naší poslední zprávy; naše poslední zpráva a kdy klient napsal naposledy">Mlčí</th>
                {cekani ? <th>Čeká</th> : null}
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
                    <HvezdaPrepinac kontakt={r} onZmena={onHvezda} /> <FlagBadge kontakt={r} compact />{' '}
                    <SegmentBadge kontakt={r} compact /> {kontaktJmeno(r)}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.phone || '—'}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="znamka-cell">
                    {jenZaklad(r) ? <Skryto /> : r.rating ? <span className="badge rating">{r.rating}</span> : <span className="muted">—</span>}
                  </td>
                  <td className="cena-cell">{jenZaklad(r) ? <Skryto /> : <CenaBunka web={r.cena_web} hosting={r.cena_hosting} />}</td>
                  <td className="mlci-cell">
                    <MlceniBunka kontakt={r} />
                  </td>
                  {cekani ? (
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
          onDovolano={onDovolano}
        />
      )}
    </div>
  );
}
