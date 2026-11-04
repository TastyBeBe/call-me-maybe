// KALENDÁŘ HOVORŮ (migrace 050, Albert 21. 10. 2026: „a new tab where each caller has his own calendar of the people he
// should call … super admins: filter by caller and see the others' calendars“). Volající vidí jen svůj (server
// zavolat_seznam mu cizí odmítne), super admin si vybere sebe, kohokoli nebo všechny Volající. Oddíly: Po termínu,
// Dnes, Nadcházející (po dnech), Hotové a zrušené za 14 dní (sbalené). U hovoru: Zavolat teď (kontakt ve frontě,
// jen ten, kdo má volat: karta ve volání přes zavolat_vzit), číslo k vytočení, Hotovo (klient mimo frontu), Přesunout
// a Zrušit (s potvrzením). Kontakt jde ven stejnou maskou jako v seznamech: Volající u kontaktu, který mu naplánoval
// super admin a který není jeho, vidí jen jméno a kontakt (detail se otevře ve variantě „skryto“).
// Po recenzi 21. 10. 2026: celý seznam se načte při otevření a po každé změně (událost cmm:zavolat-changed); druhý
// minutový dotaz stránka nemá: čas („před 2 h“) bere z hodin poskytovatele připomínek (src/zavolat.tsx) a vlastní
// kalendář načte znovu, když se při jeho minutové obnově změní čekající hovory (podpis).
// Migrace 062 (Albert 2. 11. 2026: „that I called them again feature is both in the flagged/marked section and also in the my
// clients section“; rozhodnutí D11): Hotovo u klienta mimo frontu otevře stejné okno „Zavolal/a jsem“ (DovolaniOkno se šesti
// výsledky a poznámkou pro automatizaci), když ho přihlášený smí zapsat (dovolatSmi), takže každý další hovor je jeden záznam
// (událost dovolani), který čtou označení, archiv i kampaň. ⚠ NAHRAZUJE u takového klienta „Hotovo jen s volným textem“
// (zavolat_hotovo). Po zápisu: když hovor, na který člověk klikl, pořád čeká (hovor na pozdější den, rozhodnutí D20, nebo
// hovor kolegy u super admina), uzavře ho appka (zavolat_hotovo s výsledkem); po „Nedovolal/a jsem se“ zůstává (jako po
// dovolání v Označených) a stránka řekne, ať ho přesune nebo zruší. Klient ve frontě volání beze změny (Zavolat teď), klient,
// kterému dovolání zapsat nejde (Odmítnuto, nabídnutá sleva, Nekontaktovat, Nerelevantní, cizí), má Hotovo s textem jako dřív.
// Migrace 063 (audit F4; Albert 2. 11. 2026, A1: „make sure that every time there's something new in the messages for the agents
// or in the notes, the automation actually reads it“): ten text teď jde i do vlákna klienta jako zpráva člověka (server
// zavolat_hotovo, jen kdo klienta smí upravit), takže ho automatizace přečte; okno to říká. Text „dovolání: …“, kterým appka po
// zápisu dovolání uzavírá hovor (poDovolani), server do vlákna nedává: vzkaz už poslal zapis_hovor.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getApi, type Kontakt, type ZavolatPolozka, type ZavolatSeznam } from '../api';
import { audio } from '../audio';
import { useSession } from '../auth';
import DovolaniOkno, { type DovolaniZapsano } from '../components/DovolaniOkno';
import KontaktDrawer from '../components/KontaktDrawer';
import { usePeople } from '../components/PersonPicker';
import ZavolatModal from '../components/ZavolatModal';
import { CalendarIcon } from '../icons';
import { prahaDen } from '../praha';
import { isAdminRole, isSuperAdmin, roleLabel } from '../roles';
import { useZavolat } from '../zavolat';
import {
  ConfirmModal,
  ErrorBox,
  PhoneLinks,
  Spinner,
  dovolatSmi,
  errMsg,
  formatCas,
  formatDenNadpis,
  formatKdy,
  formatKdyVeta,
  formatRelativne,
  kontaktJmeno,
} from '../ui';

/** Volba filtru super admina: „ja“, id člověka, nebo „vsichni“. */
type Kdo = 'ja' | 'vsichni' | number;

const STAV_UZAVRENY: Record<string, string> = { hotovo: 'hotovo', zruseno: 'zrušeno' };

/** „st 22. 10.“ (Praha) pro hovor z jiného dne než dnes. */
function denKratce(iso: string): string {
  return formatKdy(iso).replace(/ v \d{1,2}:\d{2}$/, '');
}

function Polozka({
  z,
  ukazKdo,
  jenCas = false,
  ted,
  dnes,
  busy,
  onDetail,
  onZavolat,
  onHotovo,
  onPresunout,
  onZrusit,
}: {
  z: ZavolatPolozka;
  ukazKdo: boolean;
  /** hovor v oddílu Nadcházející: den je v nadpisu dne */
  jenCas?: boolean;
  ted: number;
  dnes: string;
  busy: boolean;
  onDetail: (k: Kontakt) => void;
  onZavolat: (z: ZavolatPolozka) => void;
  onHotovo: (z: ZavolatPolozka) => void;
  onPresunout: (z: ZavolatPolozka) => void;
  onZrusit: (z: ZavolatPolozka) => void;
}) {
  const ceka = z.stav === 'ceka';
  const poTerminu = ceka && new Date(z.kdy).getTime() < ted;
  return (
    <div className={`card zavolat-polozka${poTerminu ? ' po-terminu' : ''}${ceka ? '' : ' uzavrena'}`} data-zavolat-id={z.id}>
      <div className="zavolat-polozka-cas">
        {/* v oddílu Nadcházející je den v nadpisu; jinde u jiného dne než dnes i den */}
        <span className="zavolat-polozka-hodina">{formatCas(z.kdy)}</span>
        {prahaDen(z.kdy) !== dnes && !jenCas && <span className="zavolat-polozka-den">{denKratce(z.kdy)}</span>}
        {ceka && <span className={`zavolat-polozka-rel${poTerminu ? ' zle' : ''}`}>{formatRelativne(z.kdy, ted)}</span>}
        {!ceka && <span className="badge neutral">{STAV_UZAVRENY[z.stav] ?? z.stav}</span>}
      </div>
      <div className="zavolat-polozka-telo">
        <button type="button" className="zavolat-polozka-jmeno" onClick={() => onDetail(z.kontakt)} title="Otevřít detail kontaktu">
          {kontaktJmeno(z.kontakt)}
        </button>
        <div className="zavolat-polozka-tel">
          <PhoneLinks phone={z.kontakt.phone} />
        </div>
        {z.poznamka && <p className="zavolat-polozka-pozn">{z.poznamka}</p>}
        {!ceka && z.vysledek && <p className="muted zavolat-polozka-meta">výsledek: {z.vysledek}</p>}
        <p className="muted zavolat-polozka-meta">
          {ukazKdo && z.volajici ? <>volá <strong>{z.volajici}</strong> · </> : null}
          naplánoval/a {z.vytvoril ?? '—'}
          {!ceka && z.uzavreno_at ? ` · uzavřeno ${formatKdyVeta(z.uzavreno_at, dnes)}` : ''}
          {ceka && !z.ve_fronte ? ' · klient není ve frontě volání' : ''}
        </p>
        {ceka && z.smi_upravit && (
          <div className="zavolat-polozka-akce">
            {z.ve_fronte && z.muj && (
              <button type="button" className="pill-btn go sm" disabled={busy} onClick={() => onZavolat(z)}>
                Zavolat teď
              </button>
            )}
            {!z.ve_fronte && (
              <button type="button" className="pill-btn go sm" disabled={busy} onClick={() => onHotovo(z)}>
                Hotovo
              </button>
            )}
            <button type="button" className="pill-btn sm" disabled={busy} onClick={() => onPresunout(z)}>
              Přesunout
            </button>
            <button type="button" className="pill-btn warn sm" disabled={busy} onClick={() => onZrusit(z)}>
              Zrušit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function KalendarPage() {
  const session = useSession();
  const navigate = useNavigate();
  const jaSuper = isSuperAdmin(session.role);
  const people = usePeople();
  const [kdo, setKdo] = useState<Kdo>('ja');
  const [data, setData] = useState<ZavolatSeznam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const zavolat = useZavolat();
  // hodiny poskytovatele připomínek (každých 15 s); do prvního tiku čas načtení
  const [nacteno, setNacteno] = useState(() => Date.now());
  const ted = Math.max(zavolat.ted, nacteno);
  const [busy, setBusy] = useState(false);
  const [akceChyba, setAkceChyba] = useState('');
  const [hotoveOtevrene, setHotoveOtevrene] = useState(false);
  const [detail, setDetail] = useState<Kontakt | null>(null);
  const [presun, setPresun] = useState<ZavolatPolozka | null>(null);
  const [zrusit, setZrusit] = useState<ZavolatPolozka | null>(null);
  const [hotovo, setHotovo] = useState<ZavolatPolozka | null>(null);
  const [hotovoText, setHotovoText] = useState('');
  // migrace 062: Hotovo u klienta mimo frontu, kterému jde zapsat dovolání = okno Zavolal/a jsem
  const [dovolani, setDovolani] = useState<ZavolatPolozka | null>(null);
  const [info, setInfo] = useState('');
  // odpověď staršího požadavku (přepnutý filtr) se zahodí
  const posledni = useRef(0);

  const nacti = useCallback(
    async (tiche = false) => {
      const muj = ++posledni.current;
      if (!tiche) setLoading(true);
      try {
        const s = await getApi().zavolatSeznam(
          session.token,
          typeof kdo === 'number' ? kdo : null,
          kdo === 'vsichni'
        );
        if (muj !== posledni.current) return;
        setData(s);
        setNacteno(Date.now());
        setError('');
      } catch (e) {
        if (muj !== posledni.current) return;
        if (!tiche) setError(errMsg(e));
      } finally {
        if (muj === posledni.current && !tiche) setLoading(false);
      }
    },
    [session.token, kdo]
  );

  useEffect(() => {
    void nacti();
    const zmena = () => void nacti(true);
    window.addEventListener('cmm:zavolat-changed', zmena);
    return () => {
      window.removeEventListener('cmm:zavolat-changed', zmena);
    };
  }, [nacti]);

  // vlastní kalendář: minutová obnova poskytovatele našla jiné čekající hovory (jiné zařízení, super admin) → načíst
  const podpisPred = useRef(zavolat.podpis);
  useEffect(() => {
    if (zavolat.podpis === podpisPred.current) return;
    podpisPred.current = zavolat.podpis;
    // změna, kterou udělala tahle stránka, už je načtená (událost cmm:zavolat-changed): neptat se podruhé
    if (kdo === 'ja' && Date.now() - nacteno > 3000) void nacti(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zavolat.podpis, kdo, nacti]);

  const akce = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setAkceChyba('');
    try {
      await fn();
      audio.play('success');
      return true;
    } catch (e) {
      setAkceChyba(errMsg(e));
      audio.play('error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  /**
   * Po zápisu dovolání z Hotovo (migrace 062): hovor, na který člověk klikl, uzavře zapis_hovor jen když je jeho a na dnešek
   * nebo po termínu (rozhodnutí D20); jinak (pozdější den, hovor kolegy u super admina) ho uzavře appka s výsledkem. Po
   * „Nedovolal/a jsem se“ zůstává (dovolání po nedovolání naplánovaný hovor neruší).
   */
  const poDovolani = async (z: ZavolatPolozka, veta: string, zapsano: DovolaniZapsano) => {
    setDovolani(null);
    if (zapsano.vysledek === 'nedovolano') {
      setInfo(`${veta} Naplánovaný hovor zůstává v kalendáři: přesuň ho, nebo ho zruš.`);
      void nacti(true);
      return;
    }
    setInfo(veta);
    try {
      const s = await getApi().zavolatSeznam(session.token, typeof kdo === 'number' ? kdo : null, kdo === 'vsichni');
      if (s.polozky.some((x) => x.id === z.id && x.stav === 'ceka')) {
        // nejvýš 500 znaků jako poznámka k naplánovanému hovoru (app_zavolat_poznamka)
        const vys = [...`dovolání: ${zapsano.text.toLowerCase()}${zapsano.poznamka ? ` · ${zapsano.poznamka}` : ''}`].slice(0, 500).join('');
        await getApi().zavolatHotovo(session.token, z.id, vys);
      } else {
        void nacti(true);
      }
    } catch (e) {
      setAkceChyba(errMsg(e));
      void nacti(true);
    }
  };

  const dnes = data?.dnes ?? prahaDen(ted);
  const polozky = data?.polozky ?? [];
  const cekajici = polozky.filter((z) => z.stav === 'ceka');
  const poTerminu = cekajici.filter((z) => new Date(z.kdy).getTime() < ted);
  const dnesni = cekajici.filter((z) => new Date(z.kdy).getTime() >= ted && prahaDen(z.kdy) <= dnes);
  const pozdejsi = cekajici.filter((z) => new Date(z.kdy).getTime() >= ted && prahaDen(z.kdy) > dnes);
  const dny: [string, ZavolatPolozka[]][] = [];
  for (const z of pozdejsi) {
    const den = prahaDen(z.kdy);
    const posl = dny[dny.length - 1];
    if (posl && posl[0] === den) posl[1].push(z);
    else dny.push([den, [z]]);
  }
  const uzavrene = polozky.filter((z) => z.stav !== 'ceka');
  const ukazKdo = kdo !== 'ja';
  const kohoJmeno =
    kdo === 'vsichni' ? 'všichni volající' : typeof kdo === 'number' ? people.find((p) => p.user_id === kdo)?.display_name ?? '' : '';

  // „Kdo zavolá“ při přesunu (jen super admin): aktivní lidé a vždy i ten, kdo hovor má (jinak by výběr tiše
  // spadl na přihlášeného a přesun by hovor přeřadil)
  const lide = (drzi: number) =>
    jaSuper
      ? people
          .filter((p) => p.active || p.user_id === drzi)
          .map((p) => ({ user_id: p.user_id, display_name: p.display_name, popis: p.user_id === session.user_id ? '' : roleLabel(p.role) }))
      : [];

  // ⚠ 3. 11. 2026 (ověření 062, appka FIX 1 a 2): kalendář (app_zavolat_ven) klíče ozn_* neposílá, takže o označení klienta
  // nevěděl: u označeného klienta okno bez kategorie a lhůty a bez vět o označení, u kampaňové chaty s označením (Nabídnuta
  // sleva) staré okno „Hovor je hotový?“ s volným textem bez události dovolani. Napřed přehled klienta (kontakt_prehled,
  // fakta.oznaceni, jako detail), pak dovolatSmi; když přehled nejde (síť, práva), rozhodne kontakt z kalendáře jako dřív.
  // NAHRAZUJE dovolatSmi(x.kontakt) bez označení.
  const hotovoKlik = async (x: ZavolatPolozka) => {
    setInfo('');
    let k = x.kontakt;
    if (!x.ve_fronte && !k.ozn_kategorie && !k.skryto) {
      try {
        const o = (await getApi().kontaktPrehled(session.token, x.kontakt_id))?.fakta?.oznaceni;
        if (o) k = { ...k, ozn_kategorie: o.kategorie, ozn_lhuta_do: o.lhuta_do, ozn_pokusy: o.pokusy };
      } catch {
        // přehled nejde: rozhodne kontakt, jak ho poslal kalendář
      }
    }
    if (dovolatSmi(k)) {
      setDovolani({ ...x, kontakt: k });
      return;
    }
    setHotovo(x);
    setHotovoText('');
  };

  const polozka = (z: ZavolatPolozka, jenCas = false) => (
    <Polozka
      key={z.id}
      z={z}
      ukazKdo={ukazKdo}
      jenCas={jenCas}
      ted={ted}
      dnes={dnes}
      busy={busy}
      onDetail={setDetail}
      onZavolat={(x) => navigate(`/call?zavolat=${x.id}`)}
      onHotovo={(x) => void hotovoKlik(x)}
      onPresunout={setPresun}
      onZrusit={setZrusit}
    />
  );

  return (
    <div>
      <p className="eyebrow">{ukazKdo ? `kalendář: ${kohoJmeno}` : 'komu kdy zavolat'}</p>
      <h1 className="page-title">
        Kalendář
        {cekajici.length > 0 && <span className="count-pill">{cekajici.length}</span>}
      </h1>

      {jaSuper && people.length > 0 && (
        <div className="field" style={{ maxWidth: 360 }}>
          <label htmlFor="kalendar-kdo">Čí kalendář</label>
          <select
            id="kalendar-kdo"
            value={String(kdo)}
            onChange={(e) => {
              const v = e.target.value;
              setKdo(v === 'ja' || v === 'vsichni' ? v : Number(v));
              setDetail(null);
            }}
          >
            <option value="ja">Já ({session.display_name})</option>
            {people
              .filter((p) => p.user_id !== session.user_id)
              .map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.display_name} · {roleLabel(p.role)}
                  {p.active ? '' : ' · neaktivní'}
                </option>
              ))}
            <option value="vsichni">Všichni volající</option>
          </select>
        </div>
      )}

      <ErrorBox>{error}</ErrorBox>
      <ErrorBox>{akceChyba}</ErrorBox>
      {/* migrace 062: věta po zápisu dovolání z Hotovo (živá oblast) */}
      <div role="status">{info && <div className="info-box dovolani-info">{info}</div>}</div>
      {loading && !data && <Spinner label="Načítám kalendář…" />}

      {data && cekajici.length === 0 && (
        <div className="card empty-state zavolat-prazdno">
          <div className="big-emoji">
            <CalendarIcon size={56} />
          </div>
          <h2>{ukazKdo ? 'Žádné naplánované hovory' : 'Zatím nemáš naplánované hovory'}</h2>
          <p className="muted">
            Hovor naplánuješ ve <Link to="/call">volání</Link> tlačítkem <strong>Přeplánovat</strong> (když tě člověk
            poprosí, ať zavoláš jindy), nebo v detailu kontaktu: <Link to="/moji">Moji klienti</Link> nebo{' '}
            <Link to="/admin">Kontakty</Link> → klikni na klienta → <strong>Naplánovat hovor</strong>.
          </p>
        </div>
      )}

      {poTerminu.length > 0 && (
        <section className="zavolat-oddil po-terminu">
          <h2 className="zavolat-oddil-titulek">Po termínu</h2>
          {poTerminu.map((z) => polozka(z))}
        </section>
      )}
      {dnesni.length > 0 && (
        <section className="zavolat-oddil dnes">
          <h2 className="zavolat-oddil-titulek">Dnes</h2>
          {dnesni.map((z) => polozka(z))}
        </section>
      )}
      {dny.length > 0 && (
        <section className="zavolat-oddil nadchazejici">
          <h2 className="zavolat-oddil-titulek">Nadcházející</h2>
          {dny.map(([den, xs]) => (
            <div key={den} className="zavolat-den">
              <h3 className="zavolat-den-titulek">{formatDenNadpis(den)}</h3>
              {xs.map((z) => polozka(z, true))}
            </div>
          ))}
        </section>
      )}

      {data && cekajici.length > 0 && (
        <p className="muted zavolat-napoveda">
          Další hovor naplánuješ ve volání tlačítkem Přeplánovat, nebo v detailu kontaktu (Moji klienti, Kontakty) tlačítkem
          Naplánovat hovor. Klient, který je ve frontě volání, ti po čase hovoru přijde ve volání sám jako první.
        </p>
      )}

      {uzavrene.length > 0 && (
        <section className="zavolat-oddil uzavrene">
          <button
            type="button"
            className="pill-btn sm zavolat-hotove-prepinac"
            aria-expanded={hotoveOtevrene}
            onClick={() => setHotoveOtevrene((x) => !x)}
          >
            {hotoveOtevrene ? 'Skrýt' : 'Ukázat'} hotové a zrušené za 14 dní ({uzavrene.length})
          </button>
          {hotoveOtevrene && uzavrene.map((z) => polozka(z))}
        </section>
      )}

      {detail && (
        <KontaktDrawer
          kontakt={detail}
          onClose={() => setDetail(null)}
          onSaved={(u) => setDetail(u)}
          readOnly={!isAdminRole(session.role)}
          // migrace 062: zápis hovoru z detailu (přehled) mohl uzavřít naplánovaný hovor, kalendář se načte znovu
          onDovolano={(veta) => {
            setDetail(null);
            setInfo(veta);
            void nacti(true);
          }}
        />
      )}

      {presun && (
        <ZavolatModal
          titulek="Přesunout hovor"
          komu={kontaktJmeno(presun.kontakt)}
          vychoziKdy={presun.kdy}
          vychoziPoznamka={presun.poznamka}
          lide={lide(presun.user_id)}
          vychoziKdo={presun.user_id}
          jaId={session.user_id}
          potvrdit="Přesunout"
          onZavrit={() => setPresun(null)}
          onUlozit={async (v) => {
            await getApi().zavolatPresunout(
              session.token,
              presun.id,
              v.kdy,
              v.poznamka,
              jaSuper ? v.userId ?? session.user_id : null
            );
            audio.play('success');
            setPresun(null);
          }}
        />
      )}

      {zrusit && (
        <ConfirmModal
          title="Zrušit naplánovaný hovor?"
          confirmLabel="Ano, zrušit"
          confirmClass="warn"
          busy={busy}
          onCancel={() => setZrusit(null)}
          onConfirm={async () => {
            const z = zrusit;
            await akce(() => getApi().zavolatZrusit(session.token, z.id));
            setZrusit(null);
          }}
        >
          Hovor s <b>{kontaktJmeno(zrusit.kontakt)}</b> ({formatKdyVeta(zrusit.kdy, dnes)}) zmizí z kalendáře.
          {zrusit.ve_fronte && ' Kontakt zůstane ve frontě volání a dostane ho kdokoli.'}
        </ConfirmModal>
      )}

      {dovolani && (
        <DovolaniOkno
          kontakt={dovolani.kontakt}
          kategorie={dovolani.kontakt.ozn_kategorie ?? null}
          lhutaDo={dovolani.kontakt.ozn_lhuta_do ?? null}
          pokusy={dovolani.kontakt.ozn_pokusy ?? 0}
          maHvezdu={!!dovolani.kontakt.hvezda_at}
          smiUpravit={dovolani.kontakt.smi_upravit !== false}
          smiHvezdu={dovolani.kontakt.smi_upravit !== false && Object.prototype.hasOwnProperty.call(dovolani.kontakt, 'hvezda_at')}
          onZavrit={() => setDovolani(null)}
          onHotovo={(veta, zapsano) => void poDovolani(dovolani, veta, zapsano)}
        />
      )}

      {hotovo && (
        <ConfirmModal
          title="Hovor je hotový?"
          confirmLabel="Hotovo"
          confirmClass="go"
          busy={busy}
          onCancel={() => setHotovo(null)}
          onConfirm={async () => {
            const z = hotovo;
            await akce(() => getApi().zavolatHotovo(session.token, z.id, hotovoText.trim() || null));
            setHotovo(null);
          }}
        >
          <p style={{ marginTop: 0 }}>
            <b>{kontaktJmeno(hotovo.kontakt)}</b> není ve frontě volání, hovor se tu jen označí jako hotový.
            {/* migrace 063: text jde do vlákna klienta jen tomu, kdo klienta smí upravit (server zavolat_hotovo) */}
            {hotovo.kontakt.smi_upravit === true && ' Co napíšeš, přečte si automatizace (jde to jako vzkaz u klienta).'}
          </p>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="zavolat-vysledek">Jak to dopadlo (nepovinné)</label>
            <textarea
              id="zavolat-vysledek"
              rows={2}
              maxLength={500}
              value={hotovoText}
              onChange={(e) => setHotovoText(e.target.value)}
            />
          </div>
        </ConfirmModal>
      )}
    </div>
  );
}
