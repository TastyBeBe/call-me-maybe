// Označení klienti — přehled těch, kteří nejsou 100 % vyřešení (migrace 005).
// Červený praporek + poznámka, co přesně je špatně. Klik na řádek otevře detail,
// kde jde příznak upravit nebo označit za vyřešený.
// Od migrace 023: admin vidí svoje klienty; super admin a Albert všechny (migrace 027 —
// super admin může vybrat kohokoli; upravovat smí dál jen svoje). Hlídá server.
// ⚠ Migrace 060 (Albert 1. 11. 2026: klient, který na naši zprávu víc než 5 pracovních dní neodpověděl, je označený pro
// SVÉHO volajícího, ať mu zavolá; „the caller always sees only the clients he called and are marked, not other callers'
// clients“) NAHRAZUJE „jen příznaky z list_flagged a klientské filtry segmentu a druhu“: řádky jdou z list_oznacene
// (otevřená označení k zavolání, která přihlášený vidí, a příznaky jako dřív) se sdíleným řádkem filtrů (SeznamFiltry:
// segment, stav, známka, hvězda, mlčení, řazení a hledání jdou na server). Druhy (Neodpověděl na návrh, na změny a druhy
// příznaků) jsou pilulky s počty: server vrací všechny řádky bez stránkování, výběr druhů se proto dělá tady nad nimi (stejné
// pravidlo jako p_druhy na serveru) a počty jsou přesné. Výchozí pořadí serveru: s hvězdou, označení, nejdéle mlčící.
// U označení „Zavolal/a jsem“ (okno se čtyřmi výsledky a hvězdou, zapis_hovor) a lhůta na zavolání (ve stage 1 bez slibu
// e-mailu); super admin a Albert i „Zrušit označení“ a výběr volajícího včetně „bez volajícího“. Server bez 060: jen příznaky
// přes list_flagged a hláška BEZ_060_OZNACENE.
// Migrace 061 (Albert 1. 11. 2026, druhá etapa: po lhůtě na zavolání pošle automatizace jednu připomínku e-mailem): pod lhůtou
// „Připomínka odeslána <den>“, když ji řádek nese (ozn_pripominka_at, jen u označení, které přihlášený vidí). Lhůta sama dál
// „Lhůta na zavolání do …“: platí, ať je přepínač připomínek zapnutý, nebo ne.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getApi, type Kontakt, type OznaceneFiltry } from '../api';
import { BEZ_060_OZNACENE } from '../api/supabase';
import { audio } from '../audio';
import { useSession } from '../auth';
import DovolaniOkno, { ZrusitOznaceniOkno } from '../components/DovolaniOkno';
import { HvezdaPrepinac } from '../components/Hvezda';
import KontaktDrawer from '../components/KontaktDrawer';
import PersonPicker, { usePeople } from '../components/PersonPicker';
import SeznamFiltry from '../components/SeznamFiltry';
import { PRAZDNE_FILTRY, filtrZapnuty, filtryOznacenych, type StavFiltru } from '../filtry';
import { isSuperAdmin } from '../roles';
import { segmentOf } from '../segment';
import {
  ALL_FLAGS,
  ALL_OZNACENI,
  ErrorBox,
  FLAG_COLORS,
  FLAG_LABELS,
  FlagBadge,
  OZNACENI_COLORS,
  OZNACENI_LABELS,
  OznaceniBadge,
  RazeniSelect,
  SegmentBadge,
  Spinner,
  StatusBadge,
  errMsg,
  formatDatumPraha,
  formatDateTime,
  formatMlci,
  kontaktJmeno,
  lhutaText,
  mlciOd,
  pripominkaOdeslanaText,
} from '../ui';
import { AlarmIcon, CheckIcon, FlagIcon } from '../icons';

/** Druhy řádku Označených: kategorie otevřeného označení a druh příznaku (jako p_druhy na serveru). */
function druhyRadku(r: Kontakt): string[] {
  const d: string[] = [];
  if (r.ozn_kategorie) d.push(r.ozn_kategorie);
  if (r.flag_kind) d.push(r.flag_kind);
  return d;
}

const datum = (iso: string | null | undefined) => (iso ? formatDatumPraha(iso) : '—');

export default function OznacenePage() {
  const session = useSession();
  const people = usePeople();
  const jaSuper = isSuperAdmin(session.role);
  // čí klienty: null = všichni (super admin) nebo svoji (Volající), číslo = jeden člověk, 'bez' = bez volajícího
  const [kdo, setKdo] = useState<number | 'bez' | null>(null);
  const [stav, setStav] = useState<StavFiltru>(PRAZDNE_FILTRY);
  const [druhy, setDruhy] = useState<string[]>([]);
  const [hledani, setHledani] = useState('');
  const [rows, setRows] = useState<Kontakt[]>([]);
  // server bez migrace 060: jen příznaky (list_flagged) a hláška
  const [stary, setStary] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [selected, setSelected] = useState<Kontakt | null>(null);
  const [okno, setOkno] = useState<{ typ: 'zapis' | 'zrusit'; k: Kontakt } | null>(null);
  const [tick, setTick] = useState(0);
  // odpověď staršího požadavku (jiný člověk ve výběru) se zahodí, jako v Kontaktech
  const posledni = useRef(0);

  // hledání na serveru, 300 ms po posledním písmenu (jako Kontakty)
  useEffect(() => {
    const t = setTimeout(() => setHledani(stav.hledat.trim()), 300);
    return () => clearTimeout(t);
  }, [stav.hledat]);

  const filtry: OznaceneFiltry = useMemo(
    () => ({
      ...filtryOznacenych(stav),
      segment: stav.segment || null,
      razeni: stav.razeni || null,
      hledat: hledani || null,
      ...(kdo === 'bez' ? { bez_volajiciho: true } : typeof kdo === 'number' ? { user_id: kdo } : {}),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stav.statusy, stav.znamky, stav.jenHvezda, stav.mlciMin, stav.mlciMax, stav.segment, stav.razeni, hledani, kdo]
  );

  const load = useCallback(async () => {
    const muj = ++posledni.current;
    setLoading(true);
    setError('');
    try {
      let r: Kontakt[];
      try {
        r = await getApi().listOznacene(session.token, filtry);
        if (muj !== posledni.current) return;
        setStary(false);
      } catch (e) {
        if (errMsg(e) !== BEZ_060_OZNACENE) throw e;
        // server bez 060: příznaky jako dřív (segment se vybere tady), nové filtry nejdou
        r = await getApi().listFlagged(session.token, null, typeof kdo === 'number' ? kdo : null);
        if (muj !== posledni.current) return;
        if (filtry.segment) r = r.filter((x) => segmentOf(x) === filtry.segment);
        setStary(true);
      }
      setRows(r);
    } catch (e) {
      if (muj !== posledni.current) return;
      setError(errMsg(e));
      audio.play('error');
    } finally {
      if (muj === posledni.current) setLoading(false);
    }
  }, [session.token, filtry, kdo]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  // počty druhů z načtených řádků (všechny řádky po ostatních filtrech, bez výběru druhu)
  const pocty = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) for (const d of druhyRadku(r)) c[d] = (c[d] ?? 0) + 1;
    return c;
  }, [rows]);
  const volbyDruhu = useMemo(
    () => [
      ...ALL_OZNACENI.map((k) => ({ druh: k as string, text: OZNACENI_LABELS[k], barva: OZNACENI_COLORS[k].bg })),
      ...ALL_FLAGS.map((f) => ({ druh: f as string, text: FLAG_LABELS[f], barva: FLAG_COLORS[f].bg })),
    ].filter((v) => pocty[v.druh] || druhy.includes(v.druh)),
    [pocty, druhy]
  );
  const filtered = useMemo(
    () => (druhy.length > 0 ? rows.filter((r) => druhyRadku(r).some((d) => druhy.includes(d))) : rows),
    [rows, druhy]
  );

  // Úprava v detailu: příznak zrušený a žádné označení = řádek zmizí; jinak se řádek obnoví (klíče označení zůstanou)
  const onSaved = (updated: Kontakt) => {
    const stary0 = rows.find((r) => r.id === updated.id);
    const novy = stary0 ? { ...stary0, ...updated } : updated;
    if (!novy.flag_kind && !novy.ozn_kategorie) {
      setRows((rs) => rs.filter((r) => r.id !== updated.id));
      setSelected(null);
      return;
    }
    setSelected(novy);
    setRows((rs) => rs.map((r) => (r.id === updated.id ? novy : r)));
  };
  // zápis hovoru nebo zrušení označení (okno v řádku i v detailu): zavřít, načíst znovu, říct co se stalo
  const onDovolano = (veta: string) => {
    setOkno(null);
    setSelected(null);
    setInfo(veta);
    setTick((t) => t + 1);
  };
  const onHvezda = (k: Kontakt) => {
    setRows((rs) => rs.map((r) => (r.id === k.id ? k : r)));
    setSelected((s) => (s && s.id === k.id ? k : s));
  };

  const nicNeniVubec = rows.length === 0 && !filtrZapnuty(stav) && !stav.segment && kdo === null;

  return (
    <div>
      <p className="eyebrow">k zavolání a nedořešené</p>
      <h1 className="page-title">
        Označení klienti
        {filtered.length > 0 && <span className="count-pill">{filtered.length}</span>}
      </h1>
      <p className="muted" style={{ marginTop: -6 }}>
        {jaSuper ? 'Všichni klienti k zavolání' : 'Tvoji klienti k zavolání'} (víc než 5 pracovních dní neodpověděli na návrh
        nebo na změny) a klienti, u kterých něco nesedí: chybí e-mail, nevíme, o jaký objekt jde, nebo jsou údaje na webu
        stažené z internetu a klient je ještě nepotvrdil.
      </p>

      <PersonPicker
        people={people}
        value={typeof kdo === 'number' ? kdo : null}
        onChange={(id) => {
          setKdo(id);
          setSelected(null);
        }}
        label="Čí klienty zobrazit"
        allOption="Všechny"
        bezVolajiciho="Bez volajícího"
        bezVybrano={kdo === 'bez'}
        onBezVolajiciho={() => {
          setKdo('bez');
          setSelected(null);
        }}
      />

      <SeznamFiltry
        filtry={stav}
        onChange={(f) => {
          if (f.segment !== stav.segment) setSelected(null);
          setStav(f);
        }}
        kategorie={false}
        className="oznacene-filtry"
        hledatAria="Hledat v označených"
        hledatPlaceholder="Hledat jméno, studio, telefon, web, e-mail, město, poznámku…"
        razeni={<RazeniSelect value={stav.razeni} onChange={(r) => setStav({ ...stav, razeni: r })} jenMojeHovory={!jaSuper} />}
      />

      {stary && <div className="info-box">{BEZ_060_OZNACENE}</div>}

      {volbyDruhu.length > 0 && (
        <div className="flag-filter-bar oznacene-druhy" role="group" aria-label="Co je potřeba">
          <button className={`pill-btn sm${druhy.length === 0 ? ' go' : ''}`} aria-pressed={druhy.length === 0} onClick={() => setDruhy([])}>
            Vše ({rows.length})
          </button>
          {volbyDruhu.map((v) => {
            const ano = druhy.includes(v.druh);
            return (
              <button
                key={v.druh}
                className={`pill-btn sm${ano ? ' go' : ''}`}
                aria-pressed={ano}
                onClick={() => setDruhy(ano ? druhy.filter((d) => d !== v.druh) : [...druhy, v.druh])}
                style={ano ? undefined : { borderColor: v.barva, color: v.barva }}
              >
                {v.text} ({pocty[v.druh] ?? 0})
              </button>
            );
          })}
        </div>
      )}

      <ErrorBox>{error}</ErrorBox>
      {info && <div className="info-box dovolani-info">{info}</div>}

      {loading ? (
        <Spinner label="Načítám označené klienty…" />
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <div className="big-emoji">{nicNeniVubec ? <CheckIcon size={56} /> : <FlagIcon size={56} />}</div>
          {nicNeniVubec ? (
            <>
              <h2>Všechno je vyřešené</h2>
              <p className="muted">Nikoho teď nemusíš volat a žádný klient nemá červený příznak.</p>
            </>
          ) : stav.segment && !filtrZapnuty(stav) && druhy.length === 0 ? (
            // Filtr segmentu schoval všechny označené: „všechno je vyřešené" by lhalo (revize 28. 9.).
            <>
              <h2>{stav.segment === 'architekt' ? 'Žádný označený architekt' : 'Žádná označená chata'}</h2>
              <p className="muted">
                {stav.segment === 'architekt'
                  ? 'Pod „architekti“ teď nikdo k zavolání ani s příznakem není. Ostatní uvidíš pod „vše" nebo „chaty".'
                  : 'Pod „chaty“ teď nikdo k zavolání ani s příznakem není. Ostatní uvidíš pod „vše" nebo „architekti".'}
              </p>
            </>
          ) : (
            <>
              <h2>V této skupině nic není</h2>
              <p className="muted">Zkus jiné filtry nebo zobraz vše.</p>
            </>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="kontakty oznacene-tabulka">
            <thead>
              <tr>
                <th>Jméno</th>
                <th>Co je potřeba</th>
                <th title="Kolik celých pracovních dní klient mlčí od naší poslední zprávy">Mlčí</th>
                <th>Naše poslední zpráva</th>
                <th>Klient naposledy</th>
                <th>Lhůta</th>
                <th>Poznámka</th>
                <th>Telefon</th>
                <th>Status</th>
                {jaSuper && <th>Volající</th>}
                {/* bez .sr-only: absolutní span v rámečku bez position by stránku roztáhl do šířky (vodorovný posun) */}
                <th aria-label="Akce" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const od = mlciOd(r);
                return (
                  <tr key={r.id} className={selected?.id === r.id ? 'selected' : ''} onClick={() => setSelected(r)}>
                    <td className="row-name">
                      <HvezdaPrepinac kontakt={r} onZmena={onHvezda} /> <SegmentBadge kontakt={r} compact /> {kontaktJmeno(r)}
                    </td>
                    <td className="oznacene-co">
                      <OznaceniBadge kategorie={r.ozn_kategorie} /> <FlagBadge kontakt={r} />
                    </td>
                    {/* počet pracovních dní je od naší poslední zprávy (sloupec vedle), „mlčí od“ u návrhu od prvního návrhu:
                        dvě různá data, každé se svým popiskem (recenze 2. 11. 2026, NAHRAZUJE „6 prac. dní od 1. 9.“) */}
                    <td style={{ whiteSpace: 'nowrap' }} className="mlci-cell" title={od ? `mlčí od ${datum(od)}` : undefined}>
                      {formatMlci(r.mlci_pd)}
                      {r.mlci_pd != null && <span className="muted mlci-po"> od naší zprávy</span>}
                      {od && od !== r.last_our_reply_at && <span className="muted mlci-od"> · mlčí od {datum(od)}</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }} className="muted">{datum(r.last_our_reply_at)}</td>
                    <td style={{ whiteSpace: 'nowrap' }} className="muted">
                      {r.last_client_reply_at ? datum(r.last_client_reply_at) : 'nikdy'}
                    </td>
                    <td className="lhuta-cell">
                      {r.ozn_kategorie ? (
                        <>
                          {lhutaText(r.ozn_lhuta_do)}
                          {r.ozn_pokusy ? <span className="muted"> · nedovoláno {r.ozn_pokusy}×</span> : null}
                          {/* migrace 061: po lhůtě odešla připomínka e-mailem (jen u označení, které přihlášený vidí) */}
                          {r.ozn_pripominka_at ? <span className="pripominka-odeslana">{pripominkaOdeslanaText(r.ozn_pripominka_at)}</span> : null}
                        </>
                      ) : r.flagged_at ? (
                        <span className="muted">příznak od {formatDateTime(r.flagged_at)}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="flag-note-cell">{r.flag_note || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.phone || '—'}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    {jaSuper && <td className="muted">{r.ozn_kategorie ? r.ozn_volajici ?? 'bez volajícího' : '—'}</td>}
                    <td className="oznacene-akce">
                      {r.ozn_kategorie && (
                        <>
                          <button
                            type="button"
                            className="pill-btn go sm zavolal-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOkno({ typ: 'zapis', k: r });
                            }}
                          >
                            <AlarmIcon size={14} /> Zavolal/a jsem
                          </button>
                          {jaSuper && (
                            <button
                              type="button"
                              className="pill-btn sm zrusit-ozn-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOkno({ typ: 'zrusit', k: r });
                              }}
                            >
                              Zrušit označení
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {okno?.typ === 'zapis' && okno.k.ozn_kategorie && (
        <DovolaniOkno
          kontakt={okno.k}
          kategorie={okno.k.ozn_kategorie}
          lhutaDo={okno.k.ozn_lhuta_do ?? null}
          pokusy={okno.k.ozn_pokusy ?? 0}
          maHvezdu={!!okno.k.hvezda_at}
          smiUpravit={okno.k.smi_upravit !== false}
          smiHvezdu={okno.k.smi_upravit !== false && Object.prototype.hasOwnProperty.call(okno.k, 'hvezda_at')}
          onZavrit={() => setOkno(null)}
          onHotovo={onDovolano}
        />
      )}
      {okno?.typ === 'zrusit' && <ZrusitOznaceniOkno kontakt={okno.k} onZavrit={() => setOkno(null)} onHotovo={onDovolano} />}

      {selected && (
        <KontaktDrawer kontakt={selected} onClose={() => setSelected(null)} onSaved={onSaved} onDovolano={onDovolano} />
      )}
    </div>
  );
}

