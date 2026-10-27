import { useEffect, useState } from 'react';
import {
  getApi,
  type KontaktStatus,
  type MyStats,
  type Segment,
  type StatistikyVolani,
  type UserStats,
  type Vydelek,
} from '../api';
import { useSession } from '../auth';
import { ArrowLeftIcon, ArrowRightIcon } from '../icons';
import { dayWord, topDaysFor } from '../pig/progress';
import { posunDen, prahaDen } from '../praha';
import { isSuperAdmin, roleLabel } from '../roles';
import { datumKratce } from '../rozvrh';
import {
  ALL_STATUSES,
  ErrorBox,
  SegmentFilter,
  Spinner,
  STATUS_LABELS,
  CENA_NA,
  cenaNezadana,
  cenaText,
  errMsg,
  formatCastka,
  formatDatumPraha,
  formatDenSRokem,
  formatEur,
  formatKc,
} from '../ui';

function StatCards({ stats }: { stats: MyStats }) {
  // ⚠ POPISKY MUSÍ ŘÍKAT, CO TO JE (Albert 2026-09-12). Dřív tu stálo prosté
  // „Zájem" a „Odmítnuto" — jenže to jsou HOVORY z call_log, kdežto stejná slova
  // v Databázi znamenají KONTAKTY v daném stavu. Změřeno 12. 9.: zájem 69 hovorů
  // proti 0 kontaktům ve stavu `zajem`, odmítnuto 92 hovorů proti 633 kontaktům.
  // Obojí je pravda; lhaly popisky.
  const cards: { label: string; value: string | number; hot?: boolean }[] = [
    { label: 'Hovorů', value: stats.calls },
    { label: 'Dovoláno', value: stats.reached },
    { label: 'Zájem v hovoru', value: stats.zajem, hot: true },
    { label: 'Konverze', value: `${stats.conversion} %` },
    { label: 'Prodáno', value: stats.sold },
  ];
  return (
    <div className="stat-grid">
      {cards.map((c) => (
        <div key={c.label} className={`card stat-card${c.hot ? ' hot' : ''}`}>
          <div className="stat-value">{c.value}</div>
          <div className="stat-label">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

export default function StatsPage() {
  const session = useSession();
  // Cizí statistiky vidí jen super admin; od migrace 027 každý super admin všechny (allStats), ostatní jen sebe.
  // ⚠ Albert 19. 10. 2026 (migrace 045): Volající nesmí nijak vidět čísla jiných lidí, jen super admini.
  // Volající proto vidí jen svoje karty; trychtýř celé databáze (prodeje a zájmy všech) jen super admin.
  // ⚠ Albert 20. 10. 2026 („Hide all of it“): ani dlaždici „jako #1 prodejce“ (žebříček kolegů); server
  // top_prodejce Volajícímu odmítne a total z list_kontakty mu pošle null.
  const isSuper = isSuperAdmin(session.role);
  const [myStats, setMyStats] = useState<MyStats | null>(null);
  const [allStats, setAllStats] = useState<UserStats[] | null>(null);
  const [selectedUser, setSelectedUser] = useState<number | 'me'>('me');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  // Migrace 050 (Albert 21. 10. 2026): nerelevantní a přeplánované hovory a výdělek (30 % z ceny webu) toho, koho
  // stránka ukazuje. Volající jen svoje (server statistiky_volani cizí odmítne), super admin přes výběr kohokoli.
  // Server bez migrace 050 RPC nezná: karty a výdělek se pak neukážou, zbytek stránky jede dál.
  const [volani, setVolani] = useState<StatistikyVolani | null>(null);
  const volaniUid = selectedUser === 'me' ? null : selectedUser;
  // Migrace 056 (Albert 27. 10. 2026: „when we can see anyone's statistics, we should also be able to see their
  // statistics for a specific day“): super admin si vybere jeden den (v Praze, jako server); null = celkem jako dřív.
  // Čísla dne jdou z all_stats s p_den (hovory a prodeje toho dne, i nerelevantní a přeplánované); výdělek, dny jako
  // #1 prodejce a klienti podle stavu den nemají, v pohledu dne se neukazují.
  const [den, setDen] = useState<string | null>(null);
  const [denStats, setDenStats] = useState<UserStats[] | null>(null);
  const [denChyba, setDenChyba] = useState('');
  const [denNacita, setDenNacita] = useState(false);
  const dnes = prahaDen(new Date());

  useEffect(() => {
    let alive = true;
    setDenStats(null);
    setDenChyba('');
    setDenNacita(false);
    if (!isSuper) return;
    if (den === null) return;
    setDenNacita(true);
    getApi()
      .allStats(session.token, den)
      .then((x) => {
        if (alive) setDenStats(x);
      })
      .catch((e) => {
        if (alive) setDenChyba(errMsg(e));
      })
      .finally(() => {
        if (alive) setDenNacita(false);
      });
    return () => {
      alive = false;
    };
  }, [session.token, isSuper, den]);

  useEffect(() => {
    let alive = true;
    setVolani(null);
    getApi()
      .statistikyVolani(session.token, volaniUid)
      .then((x) => {
        if (alive) setVolani(x);
      })
      .catch(() => {
        if (alive) setVolani(null);
      });
    return () => {
      alive = false;
    };
  }, [session.token, volaniUid]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const api = getApi();
        const mine = await api.myStats(session.token);
        if (!alive) return;
        setMyStats(mine);
        if (isSuper) {
          const all = await api.allStats(session.token);
          if (!alive) return;
          setAllStats(all);
        }
      } catch (e) {
        if (alive) setError(errMsg(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [session.token, isSuper]);

  const shownUid = selectedUser === 'me' ? session.user_id : selectedUser;
  // 056: za jeden den řádek vybraného člověka (i sebe) z all_stats s p_den; celkem jako dřív
  const denRadek: UserStats | null = den !== null ? (denStats?.find((u) => u.user_id === shownUid) ?? null) : null;
  const shown: MyStats | null =
    den !== null
      ? denRadek
      : selectedUser === 'me'
        ? myStats
        : (allStats?.find((u) => u.user_id === selectedUser) ?? null);
  // karty Nerelevantní a Přeplánováno: celkem ze statistiky_volani (050), za den z řádku dne (056)
  const dalsiKarty: { nerelevantni: number; preplanovano: number } | null =
    den !== null
      ? denRadek
        ? { nerelevantni: denRadek.nerelevantni ?? 0, preplanovano: denRadek.preplanovano ?? 0 }
        : null
      : volani;
  const nacitaDen = den !== null && denNacita;

  const topDays = topDaysFor(shownUid).days;

  const shownName =
    selectedUser === 'me'
      ? session.display_name
      : allStats?.find((u) => u.user_id === selectedUser)?.display_name ?? '';

  return (
    <div>
      <p className="eyebrow">výsledky volání</p>
      <h1 className="page-title">Statistiky</h1>

      {isSuper && allStats && allStats.some((u) => u.user_id !== session.user_id) && (
        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="user-select">Čí statistiky zobrazit</label>
          <select
            id="user-select"
            value={selectedUser === 'me' ? 'me' : String(selectedUser)}
            onChange={(e) =>
              setSelectedUser(e.target.value === 'me' ? 'me' : Number(e.target.value))
            }
          >
            <option value="me">Moje ({session.display_name})</option>
            {allStats
              .filter((u) => u.user_id !== session.user_id)
              .map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.display_name} ({roleLabel(u.role)}
                  {u.active ? '' : ' · neaktivní'})
                </option>
              ))}
          </select>
        </div>
      )}

      {/* 056 (Albert 27. 10. 2026): období jen super admin (Volající vidí jen svoje čísla celkem, 045) */}
      {isSuper && (
        <div className="field stats-obdobi">
          <label htmlFor="obdobi-select">Za jaké období</label>
          <div className="den-picker">
            <select
              id="obdobi-select"
              value={den === null ? 'celkem' : 'den'}
              onChange={(e) => setDen(e.target.value === 'den' ? (den ?? dnes) : null)}
            >
              <option value="celkem">Celkem (od začátku)</option>
              <option value="den">Jeden den</option>
            </select>
            {den !== null && (
              <>
                <button
                  type="button"
                  className="pill-btn sm den-predchozi"
                  onClick={() => setDen(posunDen(den, -1))}
                  aria-label="Předchozí den"
                  title="Předchozí den"
                >
                  <ArrowLeftIcon size={16} />
                </button>
                <input
                  id="den-datum"
                  type="date"
                  value={den}
                  max={dnes}
                  aria-label="Den"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) setDen(v > dnes ? dnes : v);
                  }}
                />
                <button
                  type="button"
                  className="pill-btn sm den-dalsi"
                  disabled={den >= dnes}
                  onClick={() => setDen(posunDen(den, 1))}
                  aria-label="Další den"
                  title="Další den"
                >
                  <ArrowRightIcon size={16} />
                </button>
                <button type="button" className="pill-btn sm den-dnes" disabled={den === dnes} onClick={() => setDen(dnes)}>
                  Dnes
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <ErrorBox>{error || (den !== null ? denChyba : '')}</ErrorBox>
      {(loading || nacitaDen) && <Spinner label={nacitaDen ? 'Počítám statistiky za den…' : 'Počítám statistiky…'} />}

      {!loading && !nacitaDen && shown && (
        <>
          {den === null ? (
            <p className="muted" style={{ margin: '10px 0 0' }}>
              {shownName} · Čísla nahoře jsou <strong>hovory</strong>, ne klienti: jeden
              klient může mít víc hovorů a po projeveném zájmu se přesune dál podle toho,
              jak daleko je jeho web.{isSuper && ' Kolik klientů je právě teď v jakém stavu, je níž.'}
            </p>
          ) : (
            <p className="muted stats-den-popis" style={{ margin: '10px 0 0' }}>
              {shownName} · <strong>{formatDenSRokem(den)}</strong> (den v Praze) · Čísla jsou <strong>hovory</strong> zapsané
              ten den a prodáno = weby, které se ten den prodaly (klient je schválil).
            </p>
          )}
          {/* migrace 050 (Albert 21. 10. 2026): nerelevantní kontakty se do konverze nepočítají (ani jako odmítnutí)
              a přeplánovaný hovor taky ne; ⚠ NAHRAZUJE „dovoláno = odmítli + zájem“ bez vysvětlení */}
          <p className="muted" style={{ margin: '4px 0 0' }}>
            dovoláno = odmítli + zájem (nerelevantní ani přeplánované se nepočítají) · konverze = zájem / dovoláno ·
            prodáno = klient web schválil (a dál)
          </p>
          <StatCards stats={shown} />
          <div className="stat-grid" style={{ marginTop: 16 }}>
            <div className="card stat-card">
              <div className="stat-value">{shown.odmitnuto}</div>
              <div className="stat-label">Odmítli v hovoru</div>
            </div>
            <div className="card stat-card">
              <div className="stat-value">{shown.nedovolano}</div>
              <div className="stat-label">Nedovolaných pokusů</div>
            </div>
            {dalsiKarty && (
              <>
                <div className="card stat-card stat-nerelevantni">
                  <div className="stat-value">{dalsiKarty.nerelevantni}</div>
                  <div className="stat-label">Nerelevantní</div>
                </div>
                <div className="card stat-card stat-preplanovano">
                  <div className="stat-value">{dalsiKarty.preplanovano}</div>
                  <div className="stat-label">Přeplánováno</div>
                </div>
              </>
            )}
            {/* kolik dní drží tenhle člověk korunu #1 prodejce (Prokchopovo počítadlo); jen super admin (045), den ho nemá (056) */}
            {den === null && (
              <>
                {isSuper && (
                  <div className="card stat-card">
                    <div className="stat-value">{topDays}</div>
                    <div className="stat-label">{dayWord(topDays)} jako #1 prodejce</div>
                  </div>
                )}
              </>
            )}
          </div>
          {den === null ? (
            <>
              {volani && <Vydelano v={volani.vydelek} ja={selectedUser === 'me'} jmeno={shownName} jaSuper={isSuper} />}
              {isSuper && <KlientiFunnel token={session.token} />}
            </>
          ) : (
            <p className="muted stats-den-jen-celkem" style={{ margin: '14px 0 0' }}>
              Výdělek, dny jako #1 prodejce a klienti podle stavu jsou jen v pohledu Celkem.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** „1 prodaného webu“, „3 prodaných webů“ (po předložce U). */
function prodanychWebu(n: number): string {
  return n === 1 ? '1 prodaného webu' : `${n} prodaných webů`;
}

/**
 * VYDĚLÁNO (migrace 050, Albert 21. 10. 2026: „how much money each caller has made … 30 % from each website, not from
 * the hosting“). Celkem a tento týden (po až ne v Praze) v Kč, eura zvlášť (nepřepočítávají se), seznam prodaných webů
 * s cenou, ze které se počítalo (po nabídce poloviční ceny částka ze slevy). Cenu, která nejde přečíst přesně
 * (rozpětí, „do 8000“), server do součtu nepočítá; appka to řekne. Čísla i sazbu posílá server (statistiky_volani).
 * Migrace 051 (Albert 22. 10. 2026: „earnings count only once a price is known“): prodej, u kterého cena webu zatím
 * není dohodnutá (prázdná nebo výplň jako „Xx“, bez slevy), má cenu i provizi „n/a“, do součtu se nepočítá a má vlastní
 * upozornění (`neznama`); „cena nejde přečíst“ zůstává jen pro zapsanou nečitelnou cenu (`nejasne`). Server bez
 * migrace 051 `neznama` neposílá: appka počítá s nulou.
 */
function Vydelano({ v, ja, jmeno, jaSuper }: { v: Vydelek; ja: boolean; jmeno: string; jaSuper: boolean }) {
  const eura = v.celkem_eur > 0 || v.tyden_eur > 0;
  const neznama = v.neznama ?? 0;
  const neznamaTyden = v.neznama_tyden ?? 0;
  return (
    <section className="vydelek">
      <h2 className="page-title" style={{ fontSize: 22, marginTop: 28 }}>
        Vyděláno
      </h2>
      <p className="muted vydelek-sazba" style={{ margin: '0 0 4px' }}>
        {v.sazba_procent} % z ceny webu, hosting se nepočítá. Počítá se web, který klient schválil (a dál), když{' '}
        {ja ? 'jsi mu volal/a' : `mu volal/a ${jmeno}`} a měl zájem.
      </p>
      <div className="stat-grid vydelek-grid">
        <div className="card stat-card hot vydelek-celkem">
          <div className="stat-value">{formatKc(v.celkem_kc)}</div>
          <div className="stat-label">Celkem</div>
        </div>
        <div className="card stat-card vydelek-tyden">
          <div className="stat-value">{formatKc(v.tyden_kc)}</div>
          <div className="stat-label">
            Tento týden ({datumKratce(v.tyden_od)} až {datumKratce(v.tyden_do)})
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{v.prodano}</div>
          <div className="stat-label">Prodaných webů</div>
        </div>
      </div>
      {eura && (
        <p className="vydelek-eur">
          Za weby v eurech navíc: celkem <strong>{formatEur(v.celkem_eur)}</strong>, tento týden{' '}
          <strong>{formatEur(v.tyden_eur)}</strong> (eura se na koruny nepřepočítávají).
        </p>
      )}
      {v.nejasne > 0 && (
        <div className="info-box vydelek-nejasne">
          U {prodanychWebu(v.nejasne)} cena nejde přečíst (třeba rozpětí nebo „po domluvě“), do součtu se nepočítá
          {v.nejasne_tyden > 0 ? ` (z toho tento týden ${v.nejasne_tyden})` : ''}.{' '}
          {jaSuper
            ? 'Oprav ji v detailu klienta (Cena webu) na přesnou částku, třeba „7 000 Kč“.'
            : 'Cenu webu opraví super admin v detailu klienta na přesnou částku, třeba „7 000 Kč“.'}
        </div>
      )}
      {neznama > 0 && (
        <div className="info-box vydelek-neznama">
          U {prodanychWebu(neznama)} cena zatím není dohodnutá ({CENA_NA}), do součtu se nepočítá
          {neznamaTyden > 0 ? ` (z toho tento týden ${neznamaTyden})` : ''}. Započítá se sama, až bude cena webu
          v detailu klienta.
        </div>
      )}
      {v.prodeje.length === 0 ? (
        <p className="muted">Zatím žádný prodaný web.</p>
      ) : (
        <ul className="vydelek-prodeje">
          {v.prodeje.map((p) => (
            <li key={p.kontakt_id} className={p.tento_tyden ? 'tento-tyden' : ''}>
              <span className="vydelek-datum">{formatDatumPraha(p.prodano_at)}</span>
              <span className="vydelek-jmeno">{p.jmeno}</span>
              <span
                className="vydelek-cena"
                title={
                  p.zdroj === 'sleva'
                    ? 'Cena po nabídce poloviční ceny (sleva)'
                    : cenaNezadana(p.cena)
                      ? 'Cena webu zatím není dohodnutá'
                      : 'Cena webu'
                }
              >
                {/* nezadaná cena (prázdná, „Xx“) = „n/a“, ne výplň doslova (migrace 051) */}
                {cenaText(p.cena)?.text ?? CENA_NA}
                {p.zdroj === 'sleva' && <span className="badge yellow vydelek-sleva">sleva</span>}
              </span>
              {p.neznama ? (
                <span className="vydelek-provize neznama" title="Cena webu zatím není dohodnutá, do součtu se nepočítá">
                  {CENA_NA}
                </span>
              ) : (
                <span className={`vydelek-provize${p.provize === null ? ' nejasna' : ''}`}>
                  {p.provize === null ? 'cena nejde přečíst' : formatCastka(p.provize, p.mena)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * KLIENTI PODLE STAVU — druhá polovina pravdy (Albert 2026-09-12).
 * Statistiky výš počítají HOVORY, tahle tabulka KONTAKTY. Bez ní vypadala appka
 * rozbitě: „Zájem 69" na jedné stránce proti „Mají zájem 0" na druhé. Čísla si
 * neodporují, jen měří jinou věc — a od teď jsou vidět vedle sebe.
 * Počty jdou ze serveru (`list_kontakty` vrací `total`), ne z načtených řádků.
 * ⚠ Jen super admin (Albert 19. 10. 2026, migrace 045): součty celé databáze jsou i prodeje a zájmy
 * kolegů, Volající vidí jen svoje čísla výš. NAHRAZUJE „trychtýř vidí každý admin“ (isAdminRole).
 * Filtr „vše / chaty / architekti" (migrace 028) jde do všech 15 dotazů; karty hovorů
 * výš zůstávají společné (hovor je hovor, docs/ARCHITEKTI.md 9.6).
 */
const SOUCET_NA: Record<Segment | '', string> = {
  '': 'celou databázi',
  chata: 'všechny chaty',
  architekt: 'všechny architekty',
};

function KlientiFunnel({ token }: { token: string }) {
  const [counts, setCounts] = useState<Partial<Record<KontaktStatus, number>> | null>(null);
  const [segment, setSegment] = useState<Segment | ''>('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const api = getApi();
        const pairs = await Promise.all(
          ALL_STATUSES.map(async (s) => {
            const r = await api.listKontakty(token, { status: s, segment: segment || null, limit: 1 });
            return [s, r.total ?? 0] as const;
          })
        );
        if (alive) setCounts(Object.fromEntries(pairs));
      } catch {
        if (alive) setCounts(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, segment]);

  if (!counts) return null;
  const celkem = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const videt = ALL_STATUSES.filter((s) => (counts[s] ?? 0) > 0);

  return (
    <>
      <h2 className="page-title" style={{ fontSize: 22, marginTop: 28 }}>
        Klienti podle stavu
        {celkem > 0 && <span className="count-pill">{celkem}</span>}
      </h2>
      <SegmentFilter value={segment} onChange={setSegment} />
      <p className="muted" style={{ margin: '0 0 10px' }}>
        Tohle jsou <strong>kontakty</strong> v databázi, ne hovory. Součet sedí na{' '}
        {SOUCET_NA[segment]}.
      </p>
      <div className="stat-grid">
        {videt.map((s) => (
          <div key={s} className="card stat-card">
            <div className="stat-value">{counts[s]}</div>
            <div className="stat-label">{STATUS_LABELS[s]}</div>
          </div>
        ))}
      </div>
    </>
  );
}
