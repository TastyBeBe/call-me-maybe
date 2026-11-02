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
// U označení „Zavolal/a jsem“ (okno DovolaniOkno s výsledky, poznámkou a hvězdou, zapis_hovor) a lhůta na zavolání (ve stage 1
// bez slibu e-mailu); super admin a Albert i „Zrušit označení“ a výběr volajícího včetně „bez volajícího“. Server bez 060: jen
// příznaky přes list_flagged a hláška BEZ_060_OZNACENE.
// ⚠ Migrace 061 (Albert 2. 11. 2026: „the option for the callers to click the button that they called or to remove the flag is
// kind of hidden because you have to slide … to the side and it's super inconvenient … make it a little bit more compact … or
// just fits into the screen without sliding anywhere, and that includes the buttons“) NAHRAZUJE „tabulka se posouvá do strany“
// (široká tabulka v rámečku table-wrap, akce v posledním sloupci): každý klient je řádek o dvou řádcích bez vodorovného posunu
// na každé šířce od 360 px (table.kontakty.kompakt v styles.css). Nahoře hvězda, segment, jméno (otevře detail), telefon jako
// odkaz k vytočení a akce „Zavolal/a jsem“, „Vyřešeno“ (příznak, který přihlášený smí zrušit, stejně jako v detailu, bez
// otevření detailu) a super adminovi „Zrušit označení“; pod tím co je potřeba, stav, mlčení, naše zpráva, klient naposledy,
// lhůta s počtem nedovolání, super adminovi kdo volá, a poznámka příznaku na dva řádky (celá v title a v detailu).
// „Zavolal/a jsem“ (Albert 2. 11. 2026: „these four options. Plus … one more option which says none of it above. And plus there
// should be a note“) NAHRAZUJE „okno se čtyřmi výsledky, text jen u Mluvili jsme a důvod“: pět výsledků (i „Nic z toho výše“)
// a poznámka pro automatizaci u každého (DovolaniOkno). „Nedovolal/a jsem se“ označení neruší, řádek zůstane s „nedovoláno N×“
// (Albert 2. 11. 2026: „it shouldn't be removing the mark“). Příznak „Údaje z internetu“ (info_neoverene) vidí jen super admin
// a Albert (Albert 2. 11. 2026: „This should be exclusive to the super admins“): Volajícímu ho appka zahodí (priznakProRoli,
// pojistka k serveru 061), řádek jen s tímto příznakem nemá a pilulku taky ne.
// Audit soudržnosti 2. 11. 2026 (nález STUCK-9): označený klient s příznakem „Chybí e-mail“ (náš e-mail se mu vrátil, klient
// návrh nejspíš neviděl) má hned vedle skupiny „e-mail se vrátil“ (EmailSeVratil v ui.tsx), ať „Neodpověděl na návrh“
// volajícího nesplete. Řádek zůstává kompaktní, bez posunu do strany.

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
  EmailSeVratil,
  ErrorBox,
  FLAG_COLORS,
  FLAG_LABELS,
  FlagBadge,
  OZNACENI_COLORS,
  OZNACENI_LABELS,
  OznaceniBadge,
  PhoneLinks,
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
  priznakProRoli,
  priznakVidi,
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

/** Nápověda u „Vyřešeno“ v řádku: příznak zmizí hned, chybějící údaj se zapíše v detailu (řádek nic jiného neukládá). */
const VYRESENO_NAPOVEDA = 'Příznak zmizí. Chybějící údaj (třeba e-mail) zapiš nejdřív v detailu.';

/** Označení bez vlastníka: server (list_oznacene) pošle super adminovi místo jména přímo tenhle text. */
const BEZ_VOLAJICIHO = 'bez volajícího';
/** Má označení volajícího se jménem? (bez vlastníka: ozn_volajici null nebo „bez volajícího“ od serveru) */
const maVolajiciho = (r: Kontakt) => !!r.ozn_volajici && r.ozn_volajici !== BEZ_VOLAJICIHO;

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
  // „Vyřešeno“ v řádku: id kontaktu, jehož příznak se právě ruší (tlačítko „Ukládám…“)
  const [resi, setResi] = useState<number | null>(null);
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
      // migrace 061 (pojistka k serveru): příznak jen pro super adminy Volající nevidí; řádek bez označení a bez příznaku zmizí
      setRows(r.map((x) => priznakProRoli(x, jaSuper)).filter((x) => x.ozn_kategorie || x.flag_kind));
    } catch (e) {
      if (muj !== posledni.current) return;
      setError(errMsg(e));
      audio.play('error');
    } finally {
      if (muj === posledni.current) setLoading(false);
    }
  }, [session.token, filtry, kdo, jaSuper]);

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
      // migrace 061: pilulku „Údaje z internetu“ má jen super admin a Albert
      ...ALL_FLAGS.filter((f) => priznakVidi(f, jaSuper)).map((f) => ({ druh: f as string, text: FLAG_LABELS[f], barva: FLAG_COLORS[f].bg })),
    ].filter((v) => pocty[v.druh] || druhy.includes(v.druh)),
    [pocty, druhy, jaSuper]
  );
  const filtered = useMemo(
    () => (druhy.length > 0 ? rows.filter((r) => druhyRadku(r).some((d) => druhy.includes(d))) : rows),
    [rows, druhy]
  );

  // Řádek po změně (detail i „Vyřešeno“ v řádku): bez příznaku a bez označení zmizí (vrátí null), jinak se obnoví a vrátí
  // (klíče označení zůstanou ze seznamu). Výběr (detail) nemění: to dělá ten, kdo ho volá.
  const prepisRadek = (updated: Kontakt): Kontakt | null => {
    const stary0 = rows.find((r) => r.id === updated.id);
    const novy = priznakProRoli(stary0 ? { ...stary0, ...updated } : updated, jaSuper);
    if (!novy.flag_kind && !novy.ozn_kategorie) {
      setRows((rs) => rs.filter((r) => r.id !== updated.id));
      return null;
    }
    setRows((rs) => rs.map((r) => (r.id === updated.id ? novy : r)));
    return novy;
  };
  // úprava v detailu: řádek zmizel = detail se zavře, jinak detail ukáže obnovený řádek
  const onSaved = (updated: Kontakt) => setSelected(prepisRadek(updated));
  // „Vyřešeno“ přímo v řádku (Albert 2. 11. 2026, migrace 061): clear_flag se stejnými právy jako v detailu, bez potvrzení
  // (detail ho nemá taky) a bez otevření detailu
  const vyres = async (r: Kontakt) => {
    const kind = r.flag_kind;
    if (!kind) return;
    setResi(r.id);
    setError('');
    try {
      const updated = await getApi().clearFlag(session.token, r.id);
      audio.play('success');
      const novy = prepisRadek(updated);
      setSelected((s) => (s?.id === r.id ? novy : s));
      setInfo(`Příznak „${FLAG_LABELS[kind] ?? kind}“ u klienta ${kontaktJmeno(r)} je vyřešený.`);
    } catch (e) {
      setError(errMsg(e));
      audio.play('error');
    } finally {
      setResi(null);
    }
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
      {/* migrace 061: o údajích z internetu jen super adminovi (Volající ten příznak nevidí) */}
      <p className="muted" style={{ marginTop: -6 }}>
        {jaSuper ? 'Všichni klienti k zavolání' : 'Tvoji klienti k zavolání'} (víc než 5 pracovních dní neodpověděli na návrh
        nebo na změny) a klienti, u kterých něco nesedí:{' '}
        {jaSuper
          ? 'chybí e-mail, nevíme, o jaký objekt jde, nebo jsou údaje na webu stažené z internetu a klient je ještě nepotvrdil.'
          : 'chybí e-mail nebo nevíme, o jaký objekt jde.'}
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
      {/* živá oblast je na stránce dřív než věta, čtečka ji tak přečte (zápis hovoru, „Vyřešeno“ v řádku) */}
      <div role="status">{info && <div className="info-box dovolani-info">{info}</div>}</div>

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
        // migrace 061: kompaktní řádky (role v TSX, protože display se v CSS mění a Safari by sémantiku tabulky zahodil);
        // hlavička zůstává pro čtečky, vidět není. Prázdná buňka se nevykreslí (null, žádná pomlčka) a CSS ji schová.
        <div className="table-wrap kompakt-wrap">
          <table className="kontakty kompakt oznacene-tabulka" role="table">
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader">Jméno</th>
                <th role="columnheader">Telefon</th>
                <th role="columnheader">Akce</th>
                <th role="columnheader">Co je potřeba</th>
                <th role="columnheader">Status</th>
                <th role="columnheader" title="Kolik celých pracovních dní klient mlčí od naší poslední zprávy">
                  Mlčí
                </th>
                <th role="columnheader">Naše poslední zpráva</th>
                <th role="columnheader">Klient naposledy</th>
                <th role="columnheader">Lhůta</th>
                {jaSuper && <th role="columnheader">Volající</th>}
                <th role="columnheader">Poznámka</th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {filtered.map((r) => {
                const od = mlciOd(r);
                // „Vyřešeno“ se stejnými právy jako v detailu: super admin u každého příznaku, Volající u svého klienta
                const smiVyresit = !!r.flag_kind && (jaSuper || r.smi_upravit !== false);
                return (
                  <tr role="row" key={r.id} className={selected?.id === r.id ? 'selected' : ''} onClick={() => setSelected(r)}>
                    {/* 1. řádek: hvězda, segment, jméno (tlačítko otevře detail i z klávesnice), telefon, akce */}
                    <td role="cell" className="row-name kompakt-hlavni">
                      <HvezdaPrepinac kontakt={r} onZmena={onHvezda} /> <SegmentBadge kontakt={r} compact />{' '}
                      <button
                        type="button"
                        className="kompakt-jmeno"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(r);
                        }}
                      >
                        {kontaktJmeno(r)}
                      </button>
                    </td>
                    <td role="cell" className="ozn-tel kompakt-hlavni">
                      {/* vytočení čísla detail neotevře */}
                      <span onClick={(e) => e.stopPropagation()}>
                        <PhoneLinks phone={r.phone} />
                      </span>
                    </td>
                    <td role="cell" className="oznacene-akce kompakt-hlavni">
                      {r.ozn_kategorie && (
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
                      )}
                      {smiVyresit && (
                        <button
                          type="button"
                          className="pill-btn sm vyreseno-btn"
                          title={VYRESENO_NAPOVEDA}
                          disabled={resi === r.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void vyres(r);
                          }}
                        >
                          <CheckIcon size={14} /> {resi === r.id ? 'Ukládám…' : 'Vyřešeno'}
                        </button>
                      )}
                      {jaSuper && r.ozn_kategorie && (
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
                    </td>
                    {/* 2. řádek: údaje, zalomí se podle šířky; „e-mail se vrátil“ hned za skupinou (audit 2. 11. 2026) */}
                    <td role="cell" className="oznacene-co">
                      <OznaceniBadge kategorie={r.ozn_kategorie} /> <EmailSeVratil kontakt={r} /> <FlagBadge kontakt={r} />
                    </td>
                    <td role="cell" className="ozn-status">
                      <StatusBadge status={r.status} />
                    </td>
                    {/* počet pracovních dní je od naší poslední zprávy, „mlčí od“ u návrhu od prvního návrhu: dvě různá data,
                        každé se svým popiskem (recenze 2. 11. 2026, NAHRAZUJE „6 prac. dní od 1. 9.“) */}
                    <td role="cell" className="mlci-cell" title={od ? `mlčí od ${datum(od)}` : undefined}>
                      {r.mlci_pd != null && (
                        <>
                          <span className={`mlci-pd${r.mlci_pd >= 5 ? ' dlouho' : ''}`}>{formatMlci(r.mlci_pd)}</span>
                          <span className="muted mlci-po"> od naší zprávy</span>
                        </>
                      )}
                      {od && od !== r.last_our_reply_at && <span className="muted mlci-od"> · mlčí od {datum(od)}</span>}
                    </td>
                    <td role="cell" className="muted ozn-nase" data-label="naše zpráva">
                      {r.last_our_reply_at ? datum(r.last_our_reply_at) : null}
                    </td>
                    <td role="cell" className="muted ozn-klient" data-label="klient naposledy">
                      {r.last_client_reply_at ? datum(r.last_client_reply_at) : 'nikdy'}
                    </td>
                    <td role="cell" className="lhuta-cell">
                      {r.ozn_kategorie ? (
                        <>
                          {lhutaText(r.ozn_lhuta_do)}
                          {r.ozn_pokusy ? <span className="ozn-pokusy"> · nedovoláno {r.ozn_pokusy}×</span> : null}
                        </>
                      ) : r.flagged_at ? (
                        <span className="muted">příznak od {formatDateTime(r.flagged_at)}</span>
                      ) : null}
                    </td>
                    {jaSuper && (
                      <td role="cell" className="muted ozn-volajici">
                        {r.ozn_kategorie ? (maVolajiciho(r) ? `volá ${r.ozn_volajici}` : BEZ_VOLAJICIHO) : null}
                      </td>
                    )}
                    <td role="cell" className="flag-note-cell" data-label="poznámka:" title={r.flag_note || undefined}>
                      {r.flag_note || null}
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
