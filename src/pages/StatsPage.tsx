import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getApi,
  type DataLide,
  type KontaktStatus,
  type Metrika,
  type MetrikaCloveka,
  type MyStats,
  type PrehledObalka,
  type Segment,
  type StatistikyVolani,
  type UserStats,
  type Vydelek,
  type ZajemPocty,
  type ZajemPodleVolajicich,
} from '../api';
import { useSession } from '../auth';
import LidePicker from '../components/LidePicker';
import { ArrowLeftIcon, ArrowRightIcon } from '../icons';
import { VYBER_JA, clovekZ, rozbalVyber, shrnutiVyberu, type Vyber } from '../lide';
import { dayWord, topDaysFor } from '../pig/progress';
import { posunDen, prahaDen } from '../praha';
import { isSuperAdmin } from '../roles';
import { datumKratce } from '../rozvrh';
import { nikaInfo } from '../obory';
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
  // ⚠ Přehled vedení úkol 10 (Albert 17. 11. 2026, D7: „compare or combine any two callers … easy to select how many people
  // they want to see“) NAHRAZUJE výběr jednoho člověka (#user-select „Čí statistiky zobrazit“): výběr lidí LidePicker (jen
  // super admin). Jeden člověk = přesně dosavadní pohled (karty, den, výdělek, tabulka 069); víc lidí (tým, Všichni, kdokoli)
  // = kombinované karty ze serveru (prehled_lide, řádek soucet, migrace 073) a odkaz „Porovnat v Přehledu“. Volající beze
  // změny (jen svoje čísla, výběr nevidí).
  const [vyber, setVyber] = useState<Vyber>(VYBER_JA);
  const lide = useMemo(() => (allStats ?? []).map(clovekZ), [allStats]);
  const vybrani = isSuper ? rozbalVyber(vyber, lide, session.user_id) : [session.user_id];
  const vybraniKlic = JSON.stringify(vybrani);
  // jeden člověk (i tým o jednom člověku) = dosavadní pohled; víc lidí nebo všichni = součet ze serveru
  const jeden = vybrani !== null && vybrani.length === 1 ? vybrani[0] : null;
  const kombinace = isSuper && jeden === null;
  const shownUid = jeden ?? session.user_id;
  const ja = shownUid === session.user_id;
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  // Migrace 050 (Albert 21. 10. 2026): nerelevantní a přeplánované hovory a výdělek (30 % z ceny webu) toho, koho
  // stránka ukazuje. Volající jen svoje (server statistiky_volani cizí odmítne), super admin přes výběr kohokoli.
  // Server bez migrace 050 RPC nezná: karty a výdělek se pak neukážou, zbytek stránky jede dál.
  const [volani, setVolani] = useState<StatistikyVolani | null>(null);
  const volaniUid = ja ? null : shownUid;
  // Migrace 056 (Albert 27. 10. 2026: „when we can see anyone's statistics, we should also be able to see their
  // statistics for a specific day“): super admin si vybere jeden den (v Praze, jako server); null = celkem jako dřív.
  // Čísla dne jdou z all_stats s p_den (hovory a prodeje toho dne, i nerelevantní a přeplánované); výdělek, dny jako
  // #1 prodejce a klienti podle stavu den nemají, v pohledu dne se neukazují.
  const [den, setDen] = useState<string | null>(null);
  const [denStats, setDenStats] = useState<UserStats[] | null>(null);
  const [denChyba, setDenChyba] = useState('');
  const [denNacita, setDenNacita] = useState(false);
  const dnes = prahaDen(new Date());
  // úkol 10: součet víc lidí (prehled_lide) za období stránky
  const [kombi, setKombi] = useState<PrehledObalka<DataLide> | null>(null);
  const [kombiChyba, setKombiChyba] = useState('');
  const [kombiNacita, setKombiNacita] = useState(false);

  useEffect(() => {
    let alive = true;
    setDenStats(null);
    setDenChyba('');
    setDenNacita(false);
    // víc lidí bere den ze součtu (prehled_lide), řádky all_stats dne nepotřebuje
    if (kombinace) return;
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
  }, [session.token, isSuper, den, kombinace]);

  useEffect(() => {
    let alive = true;
    setVolani(null);
    // výdělek a karty Nerelevantní a Přeplánováno jsou za jednoho člověka; víc lidí je má v součtu
    if (kombinace) return;
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
  }, [session.token, volaniUid, kombinace]);

  // víc lidí: součet ze serveru (prehled_lide, jen super admin); Celkem = posledních 730 dní (víc server nevezme, data jsou
  // od 2. 9. 2026), jeden den = ten den; obě měny (jako výdělek jednoho člověka eura zvlášť, nikdy dohromady); server bez
  // migrace 073 = BEZ_073_LIDE
  useEffect(() => {
    let alive = true;
    setKombi(null);
    setKombiChyba('');
    if (!kombinace) {
      setKombiNacita(false);
      return;
    }
    setKombiNacita(true);
    const od = den ?? (posunDen(dnes, -730) < '2020-01-01' ? '2020-01-01' : posunDen(dnes, -730));
    getApi()
      .prehledLide(session.token, { od, do: den ?? dnes, lide: vybrani, mena: 'obe' })
      .then((x) => {
        if (alive) setKombi(x);
      })
      .catch((e) => {
        if (alive) setKombiChyba(errMsg(e));
      })
      .finally(() => {
        if (alive) setKombiNacita(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token, kombinace, vybraniKlic, den, dnes]);

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

  // 056: za jeden den řádek vybraného člověka (i sebe) z all_stats s p_den; celkem jako dřív
  const denRadek: UserStats | null = den !== null ? (denStats?.find((u) => u.user_id === shownUid) ?? null) : null;
  const shown: MyStats | null =
    den !== null
      ? denRadek
      : ja
        ? myStats
        : (allStats?.find((u) => u.user_id === shownUid) ?? null);
  // karty Nerelevantní a Přeplánováno: celkem ze statistiky_volani (050), za den z řádku dne (056)
  const dalsiKarty: { nerelevantni: number; preplanovano: number } | null =
    den !== null
      ? denRadek
        ? { nerelevantni: denRadek.nerelevantni ?? 0, preplanovano: denRadek.preplanovano ?? 0 }
        : null
      : volani;
  const nacitaDen = den !== null && denNacita;

  const topDays = topDaysFor(shownUid).days;

  const shownName = ja ? session.display_name : allStats?.find((u) => u.user_id === shownUid)?.display_name ?? '';
  const kdoKombinace = shrnutiVyberu(vyber, lide, session.user_id);
  // „Porovnat v Přehledu“: lidé vedle sebe (#/prehled/lide, úkol 13); bez lide = všichni
  const odkazPrehled = `/prehled/lide${vybrani ? `?lide=${vybrani.join(',')}` : ''}`;
  const nacita = loading || nacitaDen || (kombinace && kombiNacita);

  return (
    <div>
      <p className="eyebrow">výsledky volání</p>
      <h1 className="page-title">Statistiky</h1>

      {isSuper && allStats && allStats.some((u) => u.user_id !== session.user_id) && (
        <LidePicker
          value={vyber}
          onChange={setVyber}
          lide={lide}
          ja={session.user_id}
          popisek="Čí statistiky zobrazit"
          vychozi={VYBER_JA}
          className="lide-stranka"
        />
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

      <ErrorBox>{error || (kombinace ? kombiChyba : den !== null ? denChyba : '')}</ErrorBox>
      {nacita && (
        <Spinner
          label={kombinace ? 'Počítám statistiky vybraných lidí…' : nacitaDen ? 'Počítám statistiky za den…' : 'Počítám statistiky…'}
        />
      )}

      {!nacita && (kombinace ? kombi : shown) && (
        <>
          {kombinace && kombi ? (
            <KombinovaneStatistiky data={kombi} kdo={kdoKombinace} den={den} odkaz={odkazPrehled} />
          ) : shown ? (
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
            </>
          ) : null}
          {den === null ? (
            <>
              {volani && <Vydelano v={volani.vydelek} ja={ja} jmeno={shownName} jaSuper={isSuper} />}
              {/* migrace 069 (Albert 15. 11. 2026): klienti se zájmem po volajících, jen super admin (045) */}
              {isSuper && <ZajemVolajicich token={session.token} />}
              {isSuper && <KlientiFunnel token={session.token} />}
            </>
          ) : (
            <p className="muted stats-den-jen-celkem" style={{ margin: '14px 0 0' }}>
              Výdělek, dny jako #1 prodejce, zájem podle volajících a klienti podle stavu jsou jen v pohledu Celkem.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Karty součtu víc lidí v pořadí dosavadních karet jednoho člověka (hovory, pak výsledky, pak peníze). */
const KARTY_KOMBINACE: MetrikaCloveka[][] = [
  ['hovory', 'dovolano', 'zajem', 'konverze', 'pocet_prodeju'],
  ['odmitnuto', 'nerelevantni', 'preplanovano', 'unikatni_klienti', 'navrhy'],
  ['hodnota_prodeju', 'provize_narok', 'provize_vyplaceno', 'provize_zbyva'],
];
/** Podíly jako procenta (zbytek podílů jsou poměry jako „výsledků za hodinu“). */
const PROCENTA: readonly string[] = ['mira_dovolani', 'konverze', 'plneni_planu'];
const HODINY: readonly string[] = ['odpracovane_hodiny', 'planovane_hodiny', 'sla_prvni_kontakt_median', 'sla_prvni_kontakt_p90'];
const cislo = (n: number, mist = 0) => n.toLocaleString('cs-CZ', { maximumFractionDigits: mist });

/**
 * Hodnoty metriky ke kartě: peníze po měnách (nikdy dohromady; první měna vždy, eura jen když nějaká jsou, každá zvlášť),
 * procenta, hodiny, počet; neznámé = pomlčka. Mezera před jednotkou nezalomí (na telefonu se „92,3 %“ nerozdělí).
 */
function hodnotyMetriky(m: Metrika): string[] {
  if (m.castky.length > 0) {
    return m.castky
      .filter((c, i) => i === 0 || c.pokryti.celkem > 0 || c.hodnota !== '0.00')
      .map((c) => (c.hodnota === null ? '—' : c.mena === 'EUR' ? formatEur(Number(c.hodnota)) : formatKc(Number(c.hodnota))).replace(/ /g, '\u00a0'));
  }
  if (m.hodnota === null) return ['—'];
  if (PROCENTA.includes(m.klic)) return [`${cislo(m.hodnota * 100, 1)}\u00a0%`];
  if (HODINY.includes(m.klic)) return [`${cislo(m.hodnota, 1)}\u00a0h`];
  return [cislo(m.hodnota, m.klic === 'vysledku_za_hodinu' ? 1 : 0)];
}

function KartaMetriky({ m, hot = false }: { m: Metrika; hot?: boolean }) {
  const [hlavni, ...dalsi] = hodnotyMetriky(m);
  return (
    <div
      className={`card stat-card stat-${m.klic}${hot ? ' hot' : ''}${m.kvalita === 'dostupne' ? '' : ' castecne'}`}
      title={m.duvod ?? undefined}
    >
      <div className="stat-value">{hlavni}</div>
      {dalsi.map((x) => (
        <div key={x} className="stat-dalsi-mena">
          + {x}
        </div>
      ))}
      <div className="stat-label">{m.nazev}</div>
      {m.kvalita !== 'dostupne' && <div className="stat-kvalita">{m.kvalita === 'nedostupne' ? 'nedostupné' : 'částečně'}</div>}
    </div>
  );
}

/**
 * STATISTIKY VÍC LIDÍ DOHROMADY (Přehled vedení úkol 10, Albert 17. 11. 2026, D7: „compare or combine any two callers“):
 * řádek „Celkem“ z prehled_lide (kontrakt §5.5) pro vybrané lidi; čísla, názvy a důvody posílá server, appka nic nepočítá.
 * Počty a peníze jsou součty, podíly ze sečteného čitatele a jmenovatele, CZK a EUR nikdy dohromady. Odkaz „Porovnat
 * v Přehledu“ otevře lidi vedle sebe (#/prehled/lide?lide=…, stránka úkolu 13).
 */
function KombinovaneStatistiky({ data, kdo, den, odkaz }: { data: PrehledObalka<DataLide>; kdo: string; den: string | null; odkaz: string }) {
  const m = data.data.soucet.metriky;
  const lidi = data.data.radky.filter((r) => r.druh === 'osoba').length;
  const varovani = data.meta.varovani.filter((v) => v.kod !== 'MENY_ODDELENE' && v.kod !== 'CASOVAC_OD');
  return (
    <section className="stats-kombinace" aria-label={`Statistiky dohromady: ${kdo}`}>
      <p className="muted stats-kombinace-popis" style={{ margin: '10px 0 0' }}>
        <strong>{kdo}</strong> dohromady ({lidi === 1 ? '1 člověk' : lidi >= 2 && lidi <= 4 ? `${lidi} lidé` : `${lidi} lidí`}) ·{' '}
        {den === null ? 'celkem' : <><strong>{formatDenSRokem(den)}</strong> (den v Praze)</>} · čísla jsou součet vybraných lidí.{' '}
        <Link to={odkaz} className="stats-porovnat">
          Porovnat v Přehledu <ArrowRightIcon size={15} />
        </Link>
      </p>
      <p className="muted" style={{ margin: '4px 0 0' }}>
        dovoláno = hovory s jiným výsledkem než nedovoláno (i nerelevantní a přeplánované) · konverze = zájem / (zájem +
        odmítnuto) · prodeje = klient web schválil (a dál), u toho, kdo zapsal poslední zájem
      </p>
      {KARTY_KOMBINACE.map((rada, i) => (
        // peníze jako výdělek jednoho člověka (vydelek-grid): širší karty, ať se částka vejde i na telefonu
        <div key={i} className={`stat-grid${rada.includes('hodnota_prodeju') ? ' stat-grid-penize' : ''}`} style={i > 0 ? { marginTop: 16 } : undefined}>
          {rada.map((k) => (
            <KartaMetriky key={k} m={m[k]} hot={k === 'zajem'} />
          ))}
        </div>
      ))}
      {/* varování serveru k tomu, co karty ukazují; ne „měny zvlášť“ (obě měny si stránka žádá sama a ukazuje je odděleně)
          a ne časovač práce (odpracované hodiny tu nejsou, jsou v Přehledu) */}
      {varovani.length > 0 && (
        <ul className="stats-varovani">
          {varovani.map((v) => (
            <li key={v.kod}>{v.text}</li>
          ))}
        </ul>
      )}
    </section>
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
 * ZÁJEM PODLE VOLAJÍCÍCH (migrace 069, Albert 15. 11. 2026: „I need to be able to … view how many interested people we have
 * for each [caller] … people who have responded to the preview and said they want it or just responded and seemed
 * interested in it“). KONTAKTY, ne hovory, u toho, kdo klientovi volal naposledy (kontakty.last_caller, stejně jako filtr
 * Volající v Kontaktech, takže číslo = řádky Kontaktů s tím volajícím a filtrem): chce web (schválil a dál), odpověděl
 * a ještě nepotvrdil (filtr 068), zájem celkem (obojí) a návrhy, na které klient zatím nenapsal. Řádek „bez volajícího“ =
 * klienti, kterým nikdo nevolal (kampaně, přišli sami). Čísla i pořadí posílá server (zajem_podle_volajicich), appka nic
 * nepočítá. Jen super admin (server Volajícímu odmítne, 045); filtr segmentu jako „Klienti podle stavu“.
 */
function ZajemVolajicich({ token }: { token: string }) {
  const [data, setData] = useState<ZajemPodleVolajicich | null>(null);
  const [chyba, setChyba] = useState('');
  const [segment, setSegment] = useState<Segment | ''>('');

  useEffect(() => {
    let alive = true;
    setData(null);
    setChyba('');
    getApi()
      .zajemPodleVolajicich(token, segment || null)
      .then((x) => {
        if (alive) setData(x);
      })
      .catch((e) => {
        if (alive) setChyba(errMsg(e));
      });
    return () => {
      alive = false;
    };
  }, [token, segment]);

  // data-label: na telefonu (styles.css, ≤ 560 px) je řádek o dvou řádcích s popiskem u každého čísla, bez posunu do
  // strany (jako seznamy od migrace 061, Albert 2. 11. 2026); role drží sémantiku tabulky i při jiném zobrazení
  const bunky = (p: ZajemPocty) => (
    <>
      <td role="cell" className="cislo" data-label="Chce web">{p.chce_web}</td>
      <td role="cell" className="cislo" data-label="Odpověděl">{p.odpovedel}</td>
      <td role="cell" className="cislo zajem-celkem" data-label="Zájem celkem">{p.zajem}</td>
      <td role="cell" className="cislo" data-label="Čeká na odpověď">{p.ceka}</td>
    </>
  );
  const bez = data?.bez_volajiciho;
  const bezRadek = !!bez && bez.zajem + bez.ceka > 0;

  return (
    <section className="zajem-volajici">
      <h2 className="page-title" style={{ fontSize: 22, marginTop: 28 }}>
        Zájem podle volajících
        {data && data.celkem.zajem > 0 && <span className="count-pill">{data.celkem.zajem}</span>}
      </h2>
      <SegmentFilter value={segment} onChange={setSegment} />
      <p className="muted" style={{ margin: '0 0 10px' }}>
        Tohle jsou <strong>klienti</strong>, ne hovory. Každý je u toho, kdo mu volal naposledy (jako filtr Volající
        v Kontaktech). <strong>Chce web</strong> = schválil web (a dál). <strong>Odpověděl</strong> = napsal nám, neodmítl
        a web ještě nepotvrdil (jako filtr „odpověděl, zatím nepotvrdil“). <strong>Zájem celkem</strong> = obojí.{' '}
        <strong>Čeká na odpověď</strong> = návrh odešel a klient zatím nenapsal.
      </p>
      <ErrorBox>{chyba}</ErrorBox>
      {!data && !chyba && <Spinner label="Počítám zájem podle volajících…" />}
      {data &&
        (data.radky.length === 0 && !bezRadek ? (
          <p className="muted zajem-prazdne">Zatím žádný klient se zájmem ani návrh bez odpovědi.</p>
        ) : (
          <div className="table-wrap zajem-wrap">
            <table className="zajem-tabulka" role="table">
              <thead role="rowgroup">
                <tr role="row">
                  <th scope="col" role="columnheader">Volající</th>
                  <th scope="col" role="columnheader" className="cislo">Chce web</th>
                  <th scope="col" role="columnheader" className="cislo">Odpověděl</th>
                  <th scope="col" role="columnheader" className="cislo">Zájem celkem</th>
                  <th scope="col" role="columnheader" className="cislo">Čeká na odpověď</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {data.radky.map((r) => (
                  <tr key={r.volajici} role="row">
                    <th scope="row" role="rowheader" className="zajem-kdo">
                      {r.volajici}
                      {r.active === false && <span className="muted"> · neaktivní</span>}
                    </th>
                    {bunky(r)}
                  </tr>
                ))}
                {bez && bezRadek && (
                  <tr className="zajem-bez" role="row">
                    <th scope="row" role="rowheader" className="zajem-kdo">bez volajícího</th>
                    {bunky(bez)}
                  </tr>
                )}
              </tbody>
              <tfoot role="rowgroup">
                <tr className="zajem-soucet" role="row">
                  <th scope="row" role="rowheader" className="zajem-kdo">Celkem</th>
                  {bunky(data.celkem)}
                </tr>
              </tfoot>
            </table>
          </div>
        ))}
      {data && (
        <p className="muted zajem-pozn" style={{ margin: '10px 0 0' }}>
          {bezRadek && <>Bez volajícího = klienti, kterým nikdo z nás nevolal (kampaně, napsali sami). </>}
          Karta Prodáno nahoře počítá jen weby, u kterých má člověk v appce zapsaný hovor se zájmem, proto se může lišit
          od sloupce Chce web.
        </p>
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
const SOUCET_NA: Record<'' | 'chata' | 'architekt', string> = {
  '': 'celou databázi',
  chata: 'všechny chaty',
  architekt: 'všechny architekty',
};
/** Od migrace 064: u niky oboru „celý obor Autoservisy“ (štítek z registru). */
function soucetNa(s: Segment | ''): string {
  if (s === '' || s === 'chata' || s === 'architekt') return SOUCET_NA[s as '' | 'chata' | 'architekt'];
  return `celý obor ${nikaInfo(s)?.nazev ?? s}`;
}

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
        {soucetNa(segment)}.
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
