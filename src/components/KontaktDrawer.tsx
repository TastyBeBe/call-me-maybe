// Sdílený detail kontaktu (drawer) — používá AdminPage i stránka Moji klienti.
// Admin: editace (update_kontakt) — od migrace 024 jen u SVÝCH klientů (server posílá
// smi_upravit); u cizího kontaktu jen příznak a uvolnění zámku. Caller (readOnly): jen čtení.
// Všichni: „Označit jako mého klienta" (oznacit_za_sveho, migrace 024) u kontaktu, kterému
// sami volali a který je pořád ve frontě volání.
// Obě role: sekce "Vzkazy agentovi" — vlákna tohoto kontaktu + composer.
// Migrace 028: odznak segmentu vedle oboru a pod metadaty údaje architekta jen ke čtení.
// Každý řádek, který vrátí úprava, jde ven přes bezCizihoIco: osobní IČO cizího architekta
// (a IČO ateliéru, které se mu rovná) zůstane skryté i po označení klienta ([ALBERT 28], 032).
// ⚠ Migrace 045 (Albert 20. 10. 2026: Volající vidí stav jen u svých klientů): cizí kontakt Volajícího (skryto)
// má jen jméno a kontakt; detail mu ukáže jen ty a nápovědu, žádný stav, poznámky, příznak, zámek ani vlákna.
// NAHRAZUJE „u cizího kontaktu jen příznak a uvolnění zámku“ pro Volající (příznak a zámek cizího mění jen super admin).
// Migrace 050 (Albert 21. 10. 2026: „they should be able to plan a call for any client, Moji klienti or Kontakty“):
// v obou variantách tlačítko „Naplánovat hovor“ (sdílené okno ZavolatModal). Jestli smí, rozhodne server: Volající
// svému klientovi nebo kontaktu ve frontě, kterému nikdo nevolal (ten se mu tím rezervuje), super admin komukoli
// a vybere, kdo zavolá. U cizího kontaktu appka nezná stav, proto tlačítko nabídne a případnou hlášku serveru ukáže.

import { useCallback, useEffect, useState } from 'react';
import {
  getApi,
  type ChatMessage,
  type FlagKind,
  type Kontakt,
  type KontaktStatus,
  type ThreadDetail,
  type ZavolatPolozka,
} from '../api';
import { audio } from '../audio';
import { useSession } from '../auth';
import { JINY_VOLAJICI, isSuperAdmin, roleLabel } from '../roles';
import { bezCizihoIco, icoVidi, segmentOf } from '../segment';
import {
  ALL_FLAGS,
  ALL_STATUSES,
  ErrorBox,
  FLAG_COLORS,
  FLAG_LABELS,
  STATUS_LABELS,
  SegmentBadge,
  SKRYTO_NAPOVEDA,
  Spinner,
  StatusBadge,
  errMsg,
  flagHintDetail,
  formatDateTime,
  icoDph,
  jenZaklad,
  kontaktJmeno,
  obratArchitekta,
  formatKdyVeta,
  formatRelativne,
  pravidloPopisek,
} from '../ui';
import { useZavolat } from '../zavolat';
import { usePeople } from './PersonPicker';
import ZavolatModal from './ZavolatModal';
import {
  AlarmIcon,
  CheckIcon,
  FlagIcon,
  GlobeIcon,
  MessageIcon,
  PhoneIcon,
  RocketIcon,
  SendIcon,
  XIcon,
} from '../icons';

/**
 * Migrace 045, recenze 20. 10. 2026: Volající dostává řádky kolegů v poznámce jako „jiný volající“ a jsou pro něj
 * jen ke čtení; server uložení se změněným, smazaným nebo přesunutým řádkem kolegy odmítne (chyba se ukáže
 * v ErrorBox). Nápověda pod polem, ať to ví dřív, než uloží. Super admin a Albert jména vidí, nápovědu nedostanou.
 * Dvě recenze 20. 10. 2026: jen ke čtení je celý záznam kolegy (i řádky bez jména pod jeho hlavičkou) a hlavička s datem
 * smí nést jen vlastní jméno. Recenze 046 (20. 10. 2026): obyčejný řádek pod zápisem kolegy dostane při uložení vlastní
 * hlavičku s dnešním datem sám a prázdné řádky jdou přidat i smazat (⚠ NAHRAZUJE „obyčejný řádek hned za záznamem kolegy
 * začněte svou hlavičkou, jinak by patřil kolegovi“); hlavička je jen na začátku řádku.
 * Druhá recenze 046 (20. 10. 2026): hlavičkou je i „[datum …]“ za odrážkou nebo neviditelným znakem a jméno kolegy v ní
 * neprojde ani za čárkou (⚠ NAHRAZUJE „Řádek, který začíná hlavičkou s datem, pište jen se svým jménem.“).
 */
export const RADKY_KOLEGU_NAPOVEDA =
  'Řádky s „jiný volající“ psali kolegové: upravit, přesunout ani smazat je nejde, a to ani řádky bez jména, které stojí ' +
  'pod hlavičkou kolegy (patří k jeho záznamu). Připište nový řádek: obyčejný řádek pod zápisem kolegy dostane při ' +
  'uložení vaši hlavičku „[dnešní datum vaše jméno]“ sám. Prázdné řádky můžete přidat i smazat. Hlavičku s datem na ' +
  'začátku řádku (i za odrážkou) pište jen se svým jménem, bez jména kolegy, ani za čárkou.';
export function maRadkyKolegu(text: string | null | undefined, role: string | null | undefined): boolean {
  return !isSuperAdmin(role) && /jiný volající/i.test(text ?? '');
}

/**
 * Dvě recenze 045 z 20. 10. 2026 (migrace 046): poznámka příznaku, který dal kolega (Volající ho vidí jako „jiný volající“),
 * je celá jeho, i řádky bez jména; server její úpravu nebo smazání odmítne, připsat nový řádek jde. Stejný druh
 * příznaku autora nemění, jiný druh zapíše za autora toho, kdo ukládá.
 * Druhá recenze 046 (20. 10. 2026; ⚠ NAHRAZUJE „jen pod ni připsat nový řádek“ bez dalšího): do poznámky příznaku kolegy
 * nejde nic vložit (ani před ni), řádek připsaný na konec dostane při uložení vlastní hlavičku a dokud příznak patří
 * kolegovi, je jen ke čtení jako zbytek jeho poznámky.
 */
export const PRIZNAK_KOLEGY_NAPOVEDA =
  'Příznak dal kolega: jeho poznámku příznaku upravit, smazat ani do ní nic vložit nejde, jen na konec připsat nový ' +
  'řádek. Ten dostane při uložení vaši hlavičku „[dnešní datum vaše jméno]“ a dokud příznak patří kolegovi, zůstane ' +
  'taky jen ke čtení.';
export function priznakKolegy(kontakt: Pick<Kontakt, 'flagged_by'>, role: string | null | undefined): boolean {
  return !isSuperAdmin(role) && kontakt.flagged_by === JINY_VOLAJICI;
}

/* ---------- červený příznak (migrace 005) ---------- */

/**
 * Panel příznaku. Volající ho vidí jen jako červenou cedulku s vysvětlením,
 * admin může příznak nasadit, přepsat nebo označit za vyřešený.
 */
function FlagPanel({
  kontakt,
  readOnly,
  onSaved,
}: {
  kontakt: Kontakt;
  readOnly: boolean;
  onSaved?: (updated: Kontakt) => void;
}) {
  const session = useSession();
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<FlagKind>(kontakt.flag_kind ?? 'jine');
  const [note, setNote] = useState(kontakt.flag_note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setEditing(false);
    setKind(kontakt.flag_kind ?? 'jine');
    setNote(kontakt.flag_note ?? '');
    setError('');
  }, [kontakt.id, kontakt.flag_kind, kontakt.flag_note]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const updated = await getApi().setFlag(session.token, kontakt.id, kind, note);
      audio.play('success');
      onSaved?.(updated);
      setEditing(false);
    } catch (e) {
      setError(errMsg(e));
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError('');
    try {
      const updated = await getApi().clearFlag(session.token, kontakt.id);
      audio.play('success');
      onSaved?.(updated);
    } catch (e) {
      setError(errMsg(e));
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };

  const flagged = kontakt.flag_kind !== null && kontakt.flag_kind !== undefined;

  if (!flagged && (readOnly || editing === false)) {
    if (readOnly) return null;
    return (
      <button
        className="pill-btn sm flag-add-btn"
        onClick={() => setEditing(true)}
        style={{ marginTop: 12 }}
      >
        <FlagIcon size={14} /> Označit klienta
      </button>
    );
  }

  const color = flagged
    ? FLAG_COLORS[kontakt.flag_kind as FlagKind]
    : { bg: '#c0392b', fg: '#fdf6e9' };

  return (
    <div className="flag-panel" style={{ borderColor: color.bg }}>
      <div className="flag-panel-head" style={{ background: color.bg, color: color.fg }}>
        <FlagIcon size={16} />
        <strong>
          {flagged ? FLAG_LABELS[kontakt.flag_kind as FlagKind] : 'Označit klienta'}
        </strong>
      </div>

      {flagged && !editing && (
        <div className="flag-panel-body">
          <p className="flag-hint">{flagHintDetail(kontakt.flag_kind as FlagKind, readOnly, segmentOf(kontakt))}</p>
          {kontakt.flag_note && <p className="flag-note">{kontakt.flag_note}</p>}
          <p className="muted flag-meta">
            označil/a {kontakt.flagged_by || '—'}
            {kontakt.flagged_at ? ` · ${formatDateTime(kontakt.flagged_at)}` : ''}
          </p>
          {!readOnly && (
            <div className="flag-actions">
              <button className="pill-btn go sm" onClick={() => void clear()} disabled={busy}>
                <CheckIcon size={14} /> Vyřešeno
              </button>
              <button className="pill-btn sm" onClick={() => setEditing(true)} disabled={busy}>
                Upravit
              </button>
            </div>
          )}
        </div>
      )}

      {!readOnly && editing && (
        <div className="flag-panel-body">
          <div className="field">
            <label>Co je špatně</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as FlagKind)}>
              {ALL_FLAGS.map((f) => (
                <option key={f} value={f}>
                  {FLAG_LABELS[f]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Poznámka pro ostatní</label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Napiš konkrétně, co u klienta chybí nebo není ověřené…"
            />
            {maRadkyKolegu(kontakt.flag_note, session.role) && (
              <p className="muted radky-kolegu" style={{ fontSize: 13.5, margin: '6px 0 0' }}>{RADKY_KOLEGU_NAPOVEDA}</p>
            )}
            {priznakKolegy(kontakt, session.role) && (
              <p className="muted priznak-kolegy" style={{ fontSize: 13.5, margin: '6px 0 0' }}>{PRIZNAK_KOLEGY_NAPOVEDA}</p>
            )}
          </div>
          <ErrorBox>{error}</ErrorBox>
          <div className="flag-actions">
            <button className="pill-btn go sm" onClick={() => void save()} disabled={busy}>
              {busy ? 'Ukládám…' : 'Uložit příznak'}
            </button>
            <button
              className="pill-btn sm"
              onClick={() => {
                setEditing(false);
                setKind(kontakt.flag_kind ?? 'jine');
                setNote(kontakt.flag_note ?? '');
              }}
              disabled={busy}
            >
              Zpět
            </button>
          </div>
        </div>
      )}

      {flagged && !editing && <ErrorBox>{error}</ErrorBox>}
    </div>
  );
}

/* ---------- Vzkazy agentovi (vlákna kontaktu + composer) ---------- */

function KontaktThreads({ kontakt, canWrite }: { kontakt: Kontakt; canWrite: boolean }) {
  const session = useSession();
  const [details, setDetails] = useState<ThreadDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const api = getApi();
        const all = await api.listThreads(session.token);
        const mine = all.filter((t) => t.kontakt_id === kontakt.id);
        const loaded = await Promise.all(mine.map((t) => api.getThread(session.token, t.id)));
        loaded.sort(
          (a, b) =>
            new Date(a.thread.created_at).getTime() - new Date(b.thread.created_at).getTime() ||
            a.thread.id - b.thread.id
        );
        setDetails(loaded);
        setError('');
      } catch (e) {
        if (!silent) {
          setError(errMsg(e));
          audio.play('error');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [session.token, kontakt.id]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError('');
    try {
      const api = getApi();
      // poslední otevřené vlákno tohoto kontaktu — jinak založit nové
      // migrace 027: jen vlákno, do kterého smí psát (cizí je jen ke čtení)
      const open = details
        .filter((d) => d.thread.status === 'open' && d.thread.smi_psat !== false)
        .sort(
          (a, b) =>
            new Date(b.thread.last_message_at).getTime() -
              new Date(a.thread.last_message_at).getTime() || b.thread.id - a.thread.id
        )[0];
      if (open) {
        await api.postThreadMessage(session.token, open.thread.id, body, false);
      } else {
        // u architekta bez jména nese předmět studio (kontaktJmeno); #id jen, když není nic
        const komu = kontakt.name || kontakt.firma ? kontaktJmeno(kontakt) : `#${kontakt.id}`;
        const subject = `Vzkaz od ${session.display_name}: ${komu}`;
        await api.createThread(session.token, subject, body, kontakt.id);
      }
      audio.play('send');
      setDraft('');
      await load(true);
    } catch (e) {
      setError(errMsg(e));
      audio.play('error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="drawer-chat">
      <div className="drawer-section-title">
        <MessageIcon size={14} /> Vzkazy agentovi
      </div>
      {loading ? (
        <Spinner label="Načítám vzkazy…" />
      ) : details.length === 0 ? (
        <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
          Zatím žádné vzkazy k tomuto kontaktu. Napiš první — založí se nové vlákno.
        </p>
      ) : (
        details.map((d) => (
          <div key={d.thread.id} className="drawer-thread">
            <div className="drawer-thread-head">
              <span className="drawer-thread-subject">{d.thread.subject}</span>
              <span className={`badge ${d.thread.status === 'open' ? 'yellow' : 'neutral'}`}>
                {d.thread.status === 'open' ? 'otevřeno' : 'vyřešeno'}
              </span>
            </div>
            {d.messages.map((m: ChatMessage) => (
              <div key={m.id} className={`bubble-row ${m.sender_type}`}>
                <div className={`bubble ${m.sender_type}`}>
                  <div className="bubble-meta">
                    {m.sender_name} · {formatDateTime(m.created_at)}
                    {pravidloPopisek(m)}
                  </div>
                  {m.body}
                </div>
              </div>
            ))}
          </div>
        ))
      )}
      <ErrorBox>{error}</ErrorBox>
      {canWrite ? (
        <div className="composer-row">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Napiš vzkaz agentovi… (Enter odešle, Shift+Enter nový řádek)"
          />
          <button
            className="pill-btn hot send-btn"
            data-sfx="none"
            onClick={() => void send()}
            disabled={sending || !draft.trim()}
            title="Odeslat"
          >
            <SendIcon size={18} />
          </button>
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
          Vzkazy agentovi k tomuhle kontaktu píše ten, kdo mu volá, jeho super admin nebo Albert.
        </p>
      )}
    </div>
  );
}

/* ---------- údaje architekta (migrace 028), jen ke čtení ---------- */

/**
 * Studio, město, IČO a DPH osobně i studia zvlášť (zdroj čísla od migrace 043 ne; docs/ARCHITEKTI.md
 * 9.6). Osobní IČO, které server v seznamu neposlal (klíč chybí, [ALBERT 28]), je
 * „skryto", ne „nezjištěno". Volajícímu (icoVidi false) žádné IČO ani poznámku o DPH studia,
 * jen řádek „obrat“ podle DPH jako na kartě ve volání (Albert 3. 10. 2026, migrace 038;
 * ⚠ NAHRAZUJE „IČO osobně: skryto“ a „IČO studia“ pro volající).
 */
function ArchitektUdaje({ kontakt, icoVidi: vidi }: { kontakt: Kontakt; icoVidi: boolean }) {
  const skryto = !Object.prototype.hasOwnProperty.call(kontakt, 'ico_osobni');
  const nezjisteno = <span className="muted">nezjištěno</span>;
  if (!vidi) {
    return (
      <div className="arch-udaje">
        <p className="meta-line">studio: {kontakt.firma || nezjisteno}</p>
        <p className="meta-line">město: {kontakt.mesto || nezjisteno}</p>
        <p className="meta-line">obrat: {obratArchitekta(kontakt.dph_osobni, kontakt.dph_firma) ?? nezjisteno}</p>
      </div>
    );
  }
  return (
    <div className="arch-udaje">
      <p className="meta-line">studio: {kontakt.firma || nezjisteno}</p>
      <p className="meta-line">město: {kontakt.mesto || nezjisteno}</p>
      <p className="meta-line">
        IČO osobně:{' '}
        {skryto ? (
          <span className="muted" title="Osobní IČO vidí v seznamech jen ten, kdo kontakt smí upravit.">
            skryto
          </span>
        ) : (
          icoDph(kontakt.ico_osobni, kontakt.dph_osobni) ?? nezjisteno
        )}
      </p>
      <p className="meta-line">
        IČO studia: {icoDph(kontakt.ico_firma, kontakt.dph_firma) ?? nezjisteno}
        {kontakt.ico_firma && <> (DPH studia neříká nic o DPH architekta)</>}
      </p>
    </div>
  );
}

/* ---------- naplánovat hovor (migrace 050, Albert 21. 10. 2026) ---------- */

/** Okno „Naplánovat hovor“; lidi pro výběr „Kdo zavolá“ (all_stats) se načtou, jen když ho otevře super admin. */
function NaplanovatOkno({
  kontakt,
  hovor,
  onZavrit,
  onHotovo,
}: {
  kontakt: Kontakt;
  /** vlastní čekající hovor kontaktu: okno ho přesune (zavolat_naplanovat čekající hovor kontaktu přesune) */
  hovor: ZavolatPolozka | null;
  onZavrit: () => void;
  onHotovo: (veta: string) => void;
}) {
  const session = useSession();
  const people = usePeople(); // Volajícímu prázdné (usePeople volá all_stats jen za super admina)
  const lide = people
    .filter((p) => p.active)
    .map((p) => ({ user_id: p.user_id, display_name: p.display_name, popis: p.user_id === session.user_id ? '' : roleLabel(p.role) }));
  // výchozí „Kdo zavolá“: u přesunu ten, kdo hovor má; jinak ten, kdo kontaktu volá (super admin jméno vidí), jinak přihlášený
  const volajici = people.find((p) => p.display_name === kontakt.last_caller)?.user_id ?? null;
  return (
    <ZavolatModal
      titulek={hovor ? 'Přesunout hovor' : 'Naplánovat hovor'}
      komu={kontaktJmeno(kontakt)}
      uvod={<p style={{ margin: 0 }}>Hovor se objeví v kalendáři a v den hovoru ti appka připomene, komu a kdy zavolat.</p>}
      vychoziKdy={hovor?.kdy ?? null}
      vychoziPoznamka={hovor?.poznamka ?? null}
      lide={isSuperAdmin(session.role) ? lide : []}
      vychoziKdo={hovor ? hovor.user_id : volajici}
      jaId={session.user_id}
      potvrdit={hovor ? 'Přesunout' : 'Naplánovat'}
      onZavrit={onZavrit}
      onUlozit={async (v) => {
        const z = await getApi().zavolatNaplanovat(session.token, kontakt.id, v.kdy, v.poznamka, v.userId);
        audio.play('success');
        onHotovo(`Hovor je naplánovaný: ${z.muj ? 'zavoláš' : `zavolá ${z.volajici ?? ''}`} ${formatKdyVeta(z.kdy)}.`);
      }}
    />
  );
}

/** Blok v detailu: vlastní čekající hovor kontaktu (když ho kalendář zná) a tlačítko Naplánovat hovor. */
function ZavolatBlok({ kontakt }: { kontakt: Kontakt }) {
  const { hovorKontaktu } = useZavolat();
  const [otevreno, setOtevreno] = useState(false);
  const [hotovo, setHotovo] = useState('');
  const hovor = hovorKontaktu(kontakt.id);
  useEffect(() => {
    setOtevreno(false);
    setHotovo('');
  }, [kontakt.id]);
  return (
    <div className="zavolat-blok">
      {hovor && (
        <p className="zavolat-blok-hovor">
          <AlarmIcon size={15} /> Máš naplánovaný hovor {formatKdyVeta(hovor.kdy)} ({formatRelativne(hovor.kdy)})
          {hovor.poznamka ? ` · ${hovor.poznamka}` : ''}
        </p>
      )}
      {hotovo && <div className="info-box zavolat-blok-hotovo">{hotovo}</div>}
      <button type="button" className="pill-btn sm tag zavolat-naplanovat" onClick={() => setOtevreno(true)}>
        <AlarmIcon size={14} /> {hovor ? 'Přesunout hovor' : 'Naplánovat hovor'}
      </button>
      {otevreno && (
        <NaplanovatOkno
          kontakt={kontakt}
          hovor={hovor}
          onZavrit={() => setOtevreno(false)}
          onHotovo={(veta) => {
            setOtevreno(false);
            setHotovo(veta);
          }}
        />
      )}
    </div>
  );
}

/* ---------- drawer ---------- */

export default function KontaktDrawer({
  kontakt,
  onClose,
  onSaved: predatStrance,
  readOnly = false,
}: {
  kontakt: Kontakt;
  onClose: () => void;
  onSaved?: (updated: Kontakt) => void;
  readOnly?: boolean;
}) {
  const session = useSession();
  // Bez masky seznamu vrací řádek jen oznacit_za_sveho (volajícímu od 037 bez IČO architekta);
  // set_flag, clear_flag a update_kontakt osobní IČO tomu, kdo kontakt nesmí upravit, neposílají
  // (028, IČO ateliéru od 036). bezCizihoIco je
  // pojistka pro oznacit_za_sveho a pro server před migrací 036: stránka (a seznam, do kterého
  // řádek vloží) dostane osobní IČO jen, když kontakt smí upravit (audit APP-5).
  const onSaved = (updated: Kontakt) => predatStrance?.(bezCizihoIco(updated));
  const [status, setStatus] = useState<KontaktStatus>(kontakt.status);
  const [email, setEmail] = useState(kontakt.email ?? '');
  const [note, setNote] = useState(kontakt.note ?? '');
  const [cenaWeb, setCenaWeb] = useState(kontakt.cena_web ?? '');
  const [cenaHosting, setCenaHosting] = useState(kontakt.cena_hosting ?? '');
  const [rating, setRating] = useState(kontakt.rating ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  // Obsah kontaktu (stav, e-mail, ceny, poznámku) smí měnit jen ten, komu kontakt patří,
  // jeho super admin a Albert — rozhoduje server (smi_upravit, migrace 024). Příznak
  // a zámek smí super admin u každého kontaktu, Volající jen u svého klienta, proto se `readOnly` pro ně nemění.
  // ⚠ NAHRAZUJE „Příznak a zámek smí admin u každého kontaktu“ (migrace 045, Albert 20. 10. 2026): cizí kontakt
  // Volajícího sem nedojde (detail jde přes jenZaklad níž, bez příznaku a zámku), `cizi` je tu jen u super admina.
  const cizi = !readOnly && kontakt.smi_upravit === false;
  const obsahJenCteni = readOnly || cizi;
  // „Označit jako mého klienta": volal mu (je_muj bez toho, aby byl last_caller) a kontakt
  // je ve frontě volání. Stav ani fronta se tím nemění (server to hlídá sám).
  const lzeOznacit =
    kontakt.je_muj === true &&
    kontakt.last_caller !== session.display_name &&
    (kontakt.status === 'nekontaktovano' || kontakt.status === 'nedovolano');

  const claim = async () => {
    setBusy(true);
    setError('');
    try {
      const updated = await getApi().claimKontakt(session.token, kontakt.id);
      audio.play('success');
      onSaved?.(updated);
    } catch (e) {
      setError(errMsg(e));
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };

  const dirty =
    status !== kontakt.status ||
    email !== (kontakt.email ?? '') ||
    note !== (kontakt.note ?? '') ||
    cenaWeb !== (kontakt.cena_web ?? '') ||
    cenaHosting !== (kontakt.cena_hosting ?? '') ||
    rating !== (kontakt.rating ?? '');

  const save = async () => {
    const patch: Record<string, unknown> = {};
    if (status !== kontakt.status) patch.status = status;
    if (email !== (kontakt.email ?? '')) patch.email = email.trim() || null;
    if (note !== (kontakt.note ?? '')) patch.note = note || null;
    if (cenaWeb !== (kontakt.cena_web ?? '')) patch.cena_web = cenaWeb.trim() || null;
    if (cenaHosting !== (kontakt.cena_hosting ?? '')) patch.cena_hosting = cenaHosting.trim() || null;
    if (rating !== (kontakt.rating ?? '')) patch.rating = rating;
    if (Object.keys(patch).length === 0) return;
    setBusy(true);
    setError('');
    try {
      const updated = await getApi().updateKontakt(session.token, kontakt.id, patch);
      audio.play('success');
      onSaved?.(updated);
      // server vrátí uloženou poznámku: obyčejný řádek pod zápisem kolegy v ní už má vlastní hlavičku (recenze 046),
      // pole ji ukáže hned a uložení se nezdá rozpracované
      if ('note' in patch) setNote(updated.note ?? '');
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e) {
      setError(errMsg(e));
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };

  const clearLock = async () => {
    setBusy(true);
    setError('');
    try {
      const updated = await getApi().updateKontakt(session.token, kontakt.id, { clear_lock: true });
      audio.play('success');
      onSaved?.(updated);
    } catch (e) {
      setError(errMsg(e));
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };

  // Cizí kontakt Volajícího (migrace 045, Albert 20. 10. 2026): jen jméno a kontakt, nic o průběhu webu
  if (jenZaklad(kontakt)) {
    return (
      <>
        <div className="drawer-scrim" onClick={onClose} />
        <div className="drawer drawer-skryto">
          <button className="drawer-close" onClick={onClose} aria-label="Zavřít">
            <XIcon size={20} />
          </button>
          <p className="eyebrow">kontakt #{kontakt.id}</p>
          <h2>{kontaktJmeno(kontakt)}</h2>
          <p className="meta-line">
            <PhoneIcon size={15} /> {kontakt.phone || '—'}
            {kontakt.obor ? ` · obor: ${kontakt.obor}` : ''} <SegmentBadge kontakt={kontakt} />
          </p>
          {kontakt.web && (
            <p className="meta-line">
              <GlobeIcon size={15} />{' '}
              <a href={kontakt.web} target="_blank" rel="noreferrer">
                {kontakt.web}
              </a>
            </p>
          )}
          {/* e-mail jen, když ho server poslal (migrace 048, audit soukromí 20. 10. 2026): u cizí chaty ne, chata ho má skoro
              jen po zájmu v hovoru; u architekta (veřejný import) a na kartě, kterou Volající právě volá, ano */}
          {'email' in kontakt && <p className="meta-line">e-mail: {kontakt.email || '—'}</p>}
          {segmentOf(kontakt) === 'architekt' && <ArchitektUdaje kontakt={kontakt} icoVidi={icoVidi(session.role)} />}
          <div className="info-box skryto-box">{SKRYTO_NAPOVEDA}</div>
          <ZavolatBlok kontakt={kontakt} />
          <button className="pill-btn" onClick={onClose}>
            Zavřít
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer">
        <button className="drawer-close" onClick={onClose} aria-label="Zavřít">
          <XIcon size={20} />
        </button>
        <p className="eyebrow">kontakt #{kontakt.id}</p>
        <h2>{kontaktJmeno(kontakt)}</h2>
        <p className="meta-line">
          <PhoneIcon size={15} /> {kontakt.phone || '—'} · obor: {kontakt.obor}{' '}
          <SegmentBadge kontakt={kontakt} />
        </p>
        <p className="meta-line">
          naposledy volal/a: {kontakt.last_caller || '—'} · změněno {formatDateTime(kontakt.updated_at)}
        </p>
        {kontakt.web && (
          <p className="meta-line">
            <GlobeIcon size={15} />{' '}
            <a href={kontakt.web} target="_blank" rel="noreferrer">
              {kontakt.web}
            </a>
          </p>
        )}
        {kontakt.live_url && (
          <p className="meta-line">
            <RocketIcon size={15} /> nový web:{' '}
            <a href={kontakt.live_url} target="_blank" rel="noreferrer">
              {kontakt.live_url}
            </a>
          </p>
        )}
        {segmentOf(kontakt) === 'architekt' && <ArchitektUdaje kontakt={kontakt} icoVidi={icoVidi(session.role)} />}
        {/* migrace 045: cizí zámek Volající dostane jen jako zamceno, bez toho, kdo kartu volá */}
        {!readOnly && (kontakt.zamceno ?? kontakt.lock_by !== null) && (
          <div className="info-box">
            Kontakt je zamčený{kontakt.lock_by !== null ? ` (volající id ${kontakt.lock_by})` : ''}.{' '}
            <button className="pill-btn sm" onClick={() => void clearLock()} disabled={busy}>
              Uvolnit zámek
            </button>
          </div>
        )}

        {lzeOznacit && (
          <div className="info-box">
            Tomuhle kontaktu jsi volal/a. Když se ti ozval zpátky, můžeš si ho označit jako svého
            klienta — zůstane ve frontě volání, jen se u něj zapíše, že je tvůj.{' '}
            <button className="pill-btn sm" onClick={() => void claim()} disabled={busy}>
              Označit jako mého klienta
            </button>
          </div>
        )}

        <ZavolatBlok kontakt={kontakt} />

        <FlagPanel kontakt={kontakt} readOnly={readOnly} onSaved={onSaved} />

        {cizi && (
          <p className="muted" style={{ fontSize: 13.5, margin: '12px 0 0' }}>
            Tohle není tvůj klient — stav, e-mail, ceny a poznámky mu upravuje ten, kdo mu volá,
            jeho super admin nebo Albert. Příznak a zámek tu měnit můžeš.
          </p>
        )}
        {/* ⚠ Věta „Příznak a zámek tu měnit můžeš“ platí od migrace 045 jen super adminovi: cizí kontakt Volajícího
            jde výš přes jenZaklad (bez příznaku a zámku), sem se dostane jen super admin u kontaktu, který upravit nesmí. */}

        {obsahJenCteni ? (
          <>
            <p className="meta-line" style={{ marginTop: 14 }}>
              status: <StatusBadge status={kontakt.status} />
              {kontakt.rating && (
                <>
                  {' '}
                  · známka: <span className="badge rating">{kontakt.rating}</span>
                </>
              )}
            </p>
            <p className="meta-line">e-mail: {kontakt.email || '—'}</p>
            <p className="meta-line">
              cena webu: {kontakt.cena_web || '—'} · cena hostingu: {kontakt.cena_hosting || '—'}
            </p>
            {kontakt.note && (
              <div className="field">
                <label>Poznámky</label>
                <div className="drawer-note-ro">{kontakt.note}</div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="field" style={{ marginTop: 14 }}>
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as KontaktStatus)}>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Známka zájmu</label>
              <select value={rating} onChange={(e) => setRating(e.target.value)}>
                <option value="">—</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C — chtějí, ale vlažně</option>
              </select>
            </div>
            <div className="field">
              <label>E-mail</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Cena webu</label>
                <input value={cenaWeb} onChange={(e) => setCenaWeb(e.target.value)} />
              </div>
              <div className="field">
                <label>Cena hostingu</label>
                <input value={cenaHosting} onChange={(e) => setCenaHosting(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Poznámky</label>
              <textarea rows={7} value={note} onChange={(e) => setNote(e.target.value)} />
              {maRadkyKolegu(kontakt.note, session.role) && (
                <p className="muted radky-kolegu" style={{ fontSize: 13.5, margin: '6px 0 0' }}>{RADKY_KOLEGU_NAPOVEDA}</p>
              )}
            </div>
          </>
        )}

        <ErrorBox>{error}</ErrorBox>
        {savedFlash && (
          <div className="info-box">
            Uloženo <CheckIcon size={16} />
          </div>
        )}

        {!obsahJenCteni && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="pill-btn go" onClick={() => void save()} disabled={busy || !dirty}>
              {busy ? 'Ukládám…' : 'Uložit změny'}
            </button>
            <button className="pill-btn" onClick={onClose} disabled={busy}>
              Zavřít
            </button>
          </div>
        )}

        {/* Vzkaz agentovi je pro workera závazný pokyn, takže ke klientovi píše jen ten, kdo ho
            smí upravovat (migrace 025): volající svůj klient (je_muj), admin a super admin
            podle smi_upravit (migrace 024). Server to hlídá sám. */}
        <KontaktThreads
          kontakt={kontakt}
          canWrite={readOnly ? kontakt.je_muj !== false : kontakt.smi_upravit !== false}
        />
      </div>
    </>
  );
}
