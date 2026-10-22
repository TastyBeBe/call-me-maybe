import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import type {
  CekaniKind,
  CekaniKos,
  ChatMessage,
  DphStav,
  FlagKind,
  Kontakt,
  KontaktStatus,
  Segment,
} from './api';
import { CompassIcon, FlagIcon, HomeIcon } from './icons';
import { isoDen, posunDen, prahaCas, prahaDen } from './praha';
import { SEGMENTY, segmentOf } from './segment';

/** České popisky statusů kontaktu. */
export const STATUS_LABELS: Record<KontaktStatus, string> = {
  nekontaktovano: 'Nekontaktováno',
  nedovolano: 'Nedovoláno',
  odmitnuto: 'Odmítnuto',
  // migrace 050 (Albert 21. 10. 2026): kontakt není relevantní (starší člověk, není majitel); nevolá se, nepíše se
  nerelevantni: 'Nerelevantní',
  zajem: 'Mají zájem',
  web_ve_vyrobe: 'Web ve výrobě',
  navrh_odeslan: 'Návrh odeslán',
  ceka_na_klienta: 'Čeká na klienta',
  upravy_ve_vyrobe: 'Úpravy ve výrobě',
  schvaleno: 'Schváleno',
  faktura_odeslana: 'Faktura odeslána',
  zaplaceno: 'Zaplaceno',
  domena_pripojena: 'Doména připojena',
  hotovo: 'Hotovo',
  pozastaveno: 'Pozastaveno',
  eskalace: 'Eskalace',
};

export const ALL_STATUSES = Object.keys(STATUS_LABELS) as KontaktStatus[];

/** Barvy status badge — výrazné, rozlišitelné, v paletě appky. */
export const STATUS_COLORS: Record<KontaktStatus, { bg: string; fg: string }> = {
  nekontaktovano: { bg: '#fdf6e9', fg: '#7b7695' },
  nedovolano: { bg: '#f6cd5e', fg: '#221e33' },
  odmitnuto: { bg: '#b9b3a7', fg: '#221e33' },
  // klidná šedofialová: konečný stav jako odmítnuto, ale jiná barva (nepočítá se jako odmítnutí)
  nerelevantni: { bg: '#c9c0e0', fg: '#221e33' },
  zajem: { bg: '#3ea45c', fg: '#fdf6e9' },
  web_ve_vyrobe: { bg: '#d95b32', fg: '#fdf6e9' },
  navrh_odeslan: { bg: '#e4926f', fg: '#221e33' },
  ceka_na_klienta: { bg: '#e8b04b', fg: '#221e33' },
  upravy_ve_vyrobe: { bg: '#c4703f', fg: '#fdf6e9' },
  schvaleno: { bg: '#7bbf6a', fg: '#221e33' },
  faktura_odeslana: { bg: '#8e7cc3', fg: '#fdf6e9' },
  zaplaceno: { bg: '#2e7d4f', fg: '#fdf6e9' },
  domena_pripojena: { bg: '#4a90d9', fg: '#fdf6e9' },
  hotovo: { bg: '#221e33', fg: '#fdf6e9' },
  pozastaveno: { bg: '#a2988a', fg: '#221e33' },
  eskalace: { bg: '#e2596f', fg: '#fdf6e9' },
};

// třída status-badge (20. 10. 2026): podle ní e2e ověří, že detail cizího kontaktu Volajícího žádný stav neukazuje
export function StatusBadge({ status }: { status: KontaktStatus }) {
  const c = STATUS_COLORS[status] ?? { bg: '#fdf6e9', fg: '#221e33' };
  return (
    <span className="badge status-badge" style={{ background: c.bg, color: c.fg }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/* ---------- Volající vidí stav jen u svých klientů (migrace 045, Albert 20. 10. 2026) ---------- */

/**
 * Cizí kontakt Volajícího (server poslal skryto true): jen jméno, telefon, e-mail, web, město, studio a IČO jako
 * dřív. Stav, známka, ceny, poznámky, příznak, kdo volal, nový web ani čekání v řádku nejsou. Albert 20. 10. 2026:
 * „they should only be able to see the status or how the website is going for the people they actually called“.
 * ⚠ NAHRAZUJE „Kontakty celé databáze se stavy vidí každý“ (migrace 023).
 */
export function jenZaklad(k: Pick<Kontakt, 'skryto'> | null | undefined): boolean {
  return k?.skryto === true;
}

/** Nápověda u cizího kontaktu (Kontakty, detail, karta ve volání). */
export const SKRYTO_NAPOVEDA =
  'Stav, poznámky a průběh webu vidíš jen u svých klientů, kterým jsi volal/a. U ostatních kontaktů jen jméno a kontakt.';

/** Buňka tabulky u cizího kontaktu: pomlčka bez hodnoty, vysvětlení v title. */
export function Skryto() {
  return (
    <span className="muted skryto" title={SKRYTO_NAPOVEDA}>
      —
    </span>
  );
}

/* ---------- červené příznaky (migrace 005) ---------- */

/** Krátké popisky příznaků — to, co uvidí volající i admin. */
export const FLAG_LABELS: Record<FlagKind, string> = {
  chybi_info: 'Nevíme, o koho jde',
  chybi_email: 'Chybí e-mail',
  email_neoveren: 'Neověřený e-mail',
  info_neoverene: 'Údaje z internetu',
  jine: 'Něco není v pořádku',
  neodpovida: 'Neodpovídá — zavolat',
};

/** Delší vysvětlení příznaku. Takhle ho ukazuje KARTA HOVORU; detail kontaktu bere
 *  flagHintDetail (níž), protože e-mail zapsaný v detailu příznak sám neruší. */
export const FLAG_HINTS: Record<FlagKind, string> = {
  chybi_info:
    'Nedokázali jsme dohledat, o jaký objekt jde — chybí lokalita i inzerát. Web nejde postavit naslepo.',
  // Samo zmizí jen při hovoru: resolve_call ruší chybi_email, když je e-mail vyplněný u zájmu
  // (pravidlo z migrace 005, vrácené migrací 029; appka posílá e-mail jen u zájmu).
  chybi_email:
    'Na tohoto klienta nemáme funkční e-mail, takže mu nejde poslat návrh. Až ho zjistíš při hovoru, zapiš ho do pole E-mail a ulož zájem — příznak pak zmizí sám.',
  email_neoveren:
    'E-mail jsme dohledali na internetu, ale klient ho nepotvrdil. Při hovoru ho prosím ověř.',
  info_neoverene:
    'Texty a fotky na webu pocházejí z internetu, klient je zatím nepotvrdil. Může v nich být nepřesnost.',
  jine: 'U tohoto klienta je něco nedořešeného — podrobnosti jsou v poznámce níže.',
  neodpovida:
    'Klient si web vyžádal, my mu odpověděli a od té doby mlčí. Zavolej mu prosím — příznak zmizí sám, jakmile se ozve nebo mu někdo zavolá.',
};

/** Vysvětlení příznaku v DETAILU kontaktu. E-mail zapsaný v detailu ukládá update_kontakt,
 *  a ten příznak neruší (samo zmizí jen při hovoru, resolve_call). Nápověda proto tady
 *  nesmí slibovat, že příznak zmizí sám (kontakt 978, 18. 9.: e-mail zapsaný, příznak zůstal).
 *  Volající (readOnly) nemá tlačítko Vyřešeno ani pole e-mailu. */
/** U architekta (migrace 028) nejde u chybi_info o objekt a inzerát, ale o to, kdo je architekt
 *  (audit celé automatizace 1. 10. 2026, APP-2). Ostatní příznaky mají text společný. */
const FLAG_HINTS_ARCHITEKT: Partial<Record<FlagKind, string>> = {
  chybi_info:
    'Nedokázali jsme ověřit, o kterého architekta nebo ateliér jde (registr ČKA, ARES, web). Web nejde postavit naslepo.',
};

/** Nápověda příznaku podle segmentu kontaktu (karta hovoru). */
export function flagHint(kind: FlagKind, segment?: string): string {
  return (segment === 'architekt' && FLAG_HINTS_ARCHITEKT[kind]) || FLAG_HINTS[kind];
}

export function flagHintDetail(kind: FlagKind, readOnly: boolean, segment?: string): string {
  if (kind === 'chybi_email') {
    return readOnly
      ? 'Na tohoto klienta nemáme funkční e-mail, takže mu nejde poslat návrh. Když ho zjistíš, dej ho vědět svému super adminovi, příznak pak zruší on nebo ona.'
      : 'Na tohoto klienta nemáme funkční e-mail, takže mu nejde poslat návrh. E-mail zapsaný tady v detailu příznak sám nezruší — až je věc vyřešená, klikni na Vyřešeno.';
  }
  return flagHint(kind, segment);
}

export const ALL_FLAGS = Object.keys(FLAG_LABELS) as FlagKind[];

export const FLAG_COLORS: Record<FlagKind, { bg: string; fg: string }> = {
  chybi_info: { bg: '#c0392b', fg: '#fdf6e9' },
  chybi_email: { bg: '#e2596f', fg: '#fdf6e9' },
  email_neoveren: { bg: '#e4926f', fg: '#221e33' },
  info_neoverene: { bg: '#e8b04b', fg: '#221e33' },
  jine: { bg: '#a2988a', fg: '#221e33' },
  neodpovida: { bg: '#7a5cc4', fg: '#fdf6e9' },
};

/** Červený praporek v seznamech. Bez příznaku nevykreslí nic. */
export function FlagBadge({
  kontakt,
  compact = false,
}: {
  kontakt: Pick<Kontakt, 'flag_kind' | 'flag_note'>;
  compact?: boolean;
}) {
  const kind = kontakt.flag_kind;
  if (!kind) return null;
  const c = FLAG_COLORS[kind] ?? { bg: '#c0392b', fg: '#fdf6e9' };
  const label = FLAG_LABELS[kind] ?? kind;
  const title = kontakt.flag_note ? `${label} — ${kontakt.flag_note}` : label;
  if (compact) {
    return (
      <span className="flag-dot" style={{ color: c.bg }} title={title} aria-label={title}>
        <FlagIcon size={15} />
      </span>
    );
  }
  return (
    <span className="badge flag-badge" style={{ background: c.bg, color: c.fg }} title={title}>
      <FlagIcon size={13} /> {label}
    </span>
  );
}

export function Spinner({ label = 'Načítám…' }: { label?: string }) {
  return <div className="loading">{label}</div>;
}

export function ErrorBox({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="error-box">{children}</div>;
}

/** Potvrzovací modal ve stylu appky. */
export function ConfirmModal({
  title,
  children,
  confirmLabel,
  confirmClass = 'warn',
  cancelLabel = 'Zpět',
  onConfirm,
  onCancel,
  busy = false,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  confirmClass?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <div className="scrim" onClick={onCancel}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>
        {children && <div className="modal-body">{children}</div>}
        <div className="modal-actions">
          <button className="pill-btn" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button className={`pill-btn ${confirmClass}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Ukládám…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Telefonní čísla oddělená čárkou nebo středníkem vykreslí jako klikatelné tel: odkazy.
 * Středník mají v tabulce architekti (migrace 028); chatám se nic nemění.
 * `onDial` (karta ve volání) se zavolá při kliknutí na číslo: vytočená karta je rozdělaná
 * a přepnutí segmentu ji tiše nevrátí do fronty (audit APP-3).
 */
export function PhoneLinks({ phone, onDial }: { phone: string | null; onDial?: () => void }) {
  if (!phone || !phone.trim()) return <span className="muted">bez telefonu</span>;
  const parts = phone
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <span className="phone-links">
      {parts.map((p, i) => (
        <a key={i} className="phone-link" href={`tel:${p.replace(/\s+/g, '')}`} onClick={onDial}>
          {p}
        </a>
      ))}
    </span>
  );
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/* ---------------------------------------------------------------------------
   Čekání na odpověď (migrace 014). Popisky a délka čekání česky.
   --------------------------------------------------------------------------- */

export const CEKANI_LABELS: Record<CekaniKind, string> = {
  ceka_prvni: 'Čeká na první odpověď',
  ceka_po_odpovedi: 'Čeká po naší odpovědi',
};

export const CEKANI_HINTS: Record<CekaniKind, string> = {
  ceka_prvni: 'Poslali jsme návrh webu a klient se zatím vůbec neozval.',
  ceka_po_odpovedi: 'Klient si web vyžádal, my mu odpověděli a od té doby mlčí.',
};

export const ALL_CEKANI = Object.keys(CEKANI_LABELS) as CekaniKind[];

/** Koše podle stáří — výchozí je `k_zavolani`, aby začátek seznamu nezaplavili roční mlčenlivci. */
export const KOS_LABELS: Record<CekaniKos, string> = {
  cerstve: 'Čerstvé (do 7 dní)',
  k_zavolani: 'K zavolání (7–30 dní)',
  vlazne: 'Vlažné (1–2 měsíce)',
  vychladle: 'Vychladlé (2+ měsíce)',
};

export const ALL_KOSE = Object.keys(KOS_LABELS) as CekaniKos[];

/** „3 dny", „14 dní", „2 měsíce" — jak dlouho už se čeká. */
export function formatCekani(since: string | null | undefined): string {
  if (!since) return '—';
  const t = new Date(since).getTime();
  if (Number.isNaN(t)) return '—';
  const dny = Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
  if (dny === 0) return 'dnes';
  if (dny < 60) return `${dny} ${dny === 1 ? 'den' : dny <= 4 ? 'dny' : 'dní'}`;
  const m = Math.floor(dny / 30);
  return `${m} ${m <= 4 ? 'měsíce' : 'měsíců'}`;
}

/** Do kterého koše čekání spadá — stejné hranice jako v SQL (kontakt_kos). */
export function kosOf(since: string | null | undefined): CekaniKos | null {
  if (!since) return null;
  const t = new Date(since).getTime();
  if (Number.isNaN(t)) return null;
  const dny = (Date.now() - t) / 86_400_000;
  if (dny < 7) return 'cerstve';
  if (dny < 30) return 'k_zavolani';
  if (dny < 60) return 'vlazne';
  return 'vychladle';
}

/**
 * Popisek u zprávy, která navrhuje pravidlo pro všechny agenty (migrace 024). Návrh se
 * do pravidel dostane, až ho schválí Albert — do té doby se jím řídí jen tenhle případ.
 */
export function pravidloPopisek(m: Pick<ChatMessage, 'apply_always' | 'pravidlo_stav'>): string {
  switch (m.pravidlo_stav) {
    case 'ceka':
      return ' · návrh pravidla — čeká na Albertovo schválení';
    case 'zapsano':
      return ' · pravidlo schválené a zapsané';
    case 'zamitnuto':
      return ' · návrh pravidla Albert nepřijal';
    default:
      return m.apply_always ? ' · návrh pravidla' : '';
  }
}

/* ---------------------------------------------------------------------------
   Segment: chaty a architekti (migrace 028, docs/ARCHITEKTI.md oddíl 9).
   Odkud se segment bere, ví jen src/segment.ts (segmentOf).
   --------------------------------------------------------------------------- */

/** Tlačítka přepínače ve volání. */
export const SEGMENT_NAZEV: Record<Segment, string> = { chata: 'Chaty', architekt: 'Architekti' };
/** Eyebrow a filtry („volání · architekti"). */
export const SEGMENT_MNOZNE: Record<Segment, string> = { chata: 'chaty', architekt: 'architekti' };
/** „Po tomhle hovoru dostaneš architekta." */
export const SEGMENT_AKUZATIV: Record<Segment, string> = { chata: 'chatu', architekt: 'architekta' };
/** Odznak u jednoho kontaktu. */
export const SEGMENT_JEDNOTNE: Record<Segment, string> = { chata: 'chata', architekt: 'architekt' };

/** Jméno kontaktu do seznamů a nadpisů: u architekta bez jména je to jeho studio. */
export function kontaktJmeno(k: Pick<Kontakt, 'name' | 'firma'>): string {
  return k.name || k.firma || '(beze jména)';
}

function SegmentIkona({ segment, size }: { segment: Segment; size: number }) {
  return segment === 'architekt' ? <CompassIcon size={size} /> : <HomeIcon size={size} />;
}

/** Přepínač „Koho voláš" ve volání. Volba se pamatuje na zařízení (src/segment.ts). */
export function SegmentSwitch({
  value,
  onChange,
  disabled = false,
}: {
  value: Segment;
  onChange: (s: Segment) => void;
  disabled?: boolean;
}) {
  return (
    <div className="segmented segment-switch" role="group" aria-label="Koho voláš">
      {SEGMENTY.map((s) => (
        <button
          key={s}
          type="button"
          className={`${s}${value === s ? ' active' : ''}`}
          aria-pressed={value === s}
          disabled={disabled}
          onClick={() => onChange(s)}
        >
          <SegmentIkona segment={s} size={18} /> {SEGMENT_NAZEV[s]}
        </button>
      ))}
    </div>
  );
}

/** Filtr seznamů „vše / chaty / architekti". Výchozí vše, nepamatuje se (9.6). */
export function SegmentFilter({
  value,
  onChange,
}: {
  value: Segment | '';
  onChange: (s: Segment | '') => void;
}) {
  const volby: { v: Segment | ''; label: string }[] = [
    { v: '', label: 'vše' },
    ...SEGMENTY.map((s) => ({ v: s, label: SEGMENT_MNOZNE[s] })),
  ];
  return (
    <div className="segmented segment-filter" role="group" aria-label="Chaty, nebo architekti">
      {volby.map((o) => (
        <button
          key={o.v || 'vse'}
          type="button"
          className={value === o.v ? 'active' : ''}
          aria-pressed={value === o.v}
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Odznak segmentu. `compact` (seznamy) = jen u architekta, ať se seznamy chat vizuálně
 * nemění; plný (detail kontaktu) u obou.
 */
export function SegmentBadge({
  kontakt,
  compact = false,
}: {
  kontakt: Pick<Kontakt, 'segment'>;
  compact?: boolean;
}) {
  const s = segmentOf(kontakt);
  if (compact && s === 'chata') return null;
  return (
    <span className={`badge seg-${s}`} title={s === 'architekt' ? 'Architekt' : 'Chata'}>
      <SegmentIkona segment={s} size={12} /> {SEGMENT_JEDNOTNE[s]}
    </span>
  );
}

/** DPH architekta a studia (9.3). */
export const DPH_LABELS: Record<DphStav, string> = {
  platce: 'plátce DPH',
  neplatce: 'neplátce DPH',
  identifikovana_osoba: 'identifikovaná osoba, ne plný plátce',
  neovereno: 'DPH neověřeno',
};

/**
 * Řádek „obrat“ na kartě architekta ve volání (Albert 3. 10. 2026, audit APP-8, migrace 037).
 * Volající IČO architekta nevidí. Registrace k DPH je veřejná a povinná nad 2 000 000 Kč obratu
 * za rok (paušální daň veřejná není), takže DPH je jediný veřejný signál, jestli vydělává víc:
 * plátce osobně NEBO ateliér = nad 2 mil.; známý neplátce nebo identifikovaná osoba a nikdo
 * plátce = do 2 mil.; jinak null (karta ukáže „nezjištěno“). Cenu z toho appka nenavrhuje.
 */
export const OBRAT_NAD = 'nad 2 mil. Kč ročně (plátce DPH)';
export const OBRAT_DO = 'do 2 mil. Kč ročně (neplátce DPH)';
export function obratArchitekta(
  dphOsobni: DphStav | null | undefined,
  dphFirma: DphStav | null | undefined
): string | null {
  if (dphOsobni === 'platce' || dphFirma === 'platce') return OBRAT_NAD;
  const neplatce = (d: DphStav | null | undefined) => d === 'neplatce' || d === 'identifikovana_osoba';
  if (neplatce(dphOsobni) || neplatce(dphFirma)) return OBRAT_DO;
  return null;
}

/** „12345678 · neplátce DPH"; bez IČO null (detail pak ukáže „nezjištěno"). */
export function icoDph(ico: string | null | undefined, dph: DphStav | null | undefined): string | null {
  if (!ico) return null;
  return dph && DPH_LABELS[dph] ? `${ico} · ${DPH_LABELS[dph]}` : ico;
}

/* ⚠ Zdroj telefonu („odkud máme číslo“) v appce není (Albert 19. 10. 2026, migrace 043; NAHRAZUJE [ALBERT 10]).
   Popisky zdroje čísla (pro kartu i pro větu ve scénáři) a funkce k nim jsou proto pryč. */

/* ---------------------------------------------------------------------------
   Ceny a čas naplánovaných hovorů (migrace 050, Albert 21. 10. 2026). Čas vždy v Praze (src/praha.ts),
   stejně jako server: „zavolat v 15:00“ je 15:00 u klienta.
   --------------------------------------------------------------------------- */

const NBSP = '\u00a0';

/** Tisíce oddělené nezlomitelnou mezerou: 7000 -> „7 000“ (číslo se nezalomí). */
function tisice(n: number): string {
  const [cele, des] = Math.abs(n).toFixed(Number.isInteger(n) ? 0 : 2).split('.');
  const s = cele.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${n < 0 ? '-' : ''}${s}${des ? `,${des}` : ''}`;
}

/** „7 000 Kč“ (celé koruny). */
export function formatKc(n: number): string {
  return `${tisice(Math.round(n))}${NBSP}Kč`;
}

/** „75 €“, „75,50 €“. */
export function formatEur(n: number): string {
  return `${tisice(Math.round(n * 100) / 100)}${NBSP}€`;
}

/** Částka v měně výdělku (kc | eur). */
export function formatCastka(n: number, mena: 'kc' | 'eur' | null | undefined): string {
  return mena === 'eur' ? formatEur(n) : formatKc(n);
}

/**
 * Zástupné hodnoty ceny, které znamenají „nezadáno“ (x, xx, X, Xx, yx, -, —, od 22. 10. 2026 i n/a, n.a. a nula:
 * „0“, „00“, „0 Kč“, „0,-“). Migrace 051 (Albert 22. 10. 2026): cena při „Mají zájem“ je nepovinná a nedohodnutá cena se
 * ukazuje jako „n/a“. Volající do 22. 10. kvůli povinnému poli psali výplně („Xx“, „hosting 0“), ty zůstávají, jak jsou,
 * a čtou se jako nezadané; nula není cena (po revizi DB 22. 10. 2026, automatizace 0 jako cenu nikdy nebere).
 * Stejný vzor má server v app_cena_nezadana (db/migration_051_cena_na.sql), po trim() se stejnou sadou mezer jako
 * JavaScript; měnit jen spolu (tabulka vzorků v tests/volani.test.mjs a v test_051, kontrola 205).
 */
const CENA_ZASTUPNA = /^(?:x{1,3}|yx|[-–—]{1,3}|n\/a|n\.a\.|0+(?:\s*(?:kč|kc|czk|,-))?)$/i;

/**
 * Cena webu nebo hostingu zatím není dohodnutá (migrace 051, Albert 22. 10. 2026: „there's n/a on the hosting and on the
 * prices when we haven't arranged them yet“): prázdná, jen mezery nebo zástupná hodnota (CENA_ZASTUPNA). Zrcadlo serverové
 * app_cena_nezadana: stejná nezadaná cena se v Moji klienti, v detailu i ve výdělku ukáže jako „n/a“ a do výdělku se
 * nepočítá. Text „n/a“ se do databáze nikdy nezapisuje, prázdné pole se uloží jako null.
 */
export function cenaNezadana(text: string | null | undefined): boolean {
  const t = (text ?? '').trim();
  return t === '' || CENA_ZASTUPNA.test(t);
}

/** Co appka ukáže místo nedohodnuté ceny (Albert 22. 10. 2026, „n/a“, ne „dohodou“ ani pomlčka). */
export const CENA_NA = 'n/a';

/**
 * Cena tak, jak ji appka pošle serveru (volání i detail kontaktu): nedohodnutá (prázdná nebo zástupná, třeba napsané
 * „n/a“ nebo „0“) = null, jinak text oříznutý o mezery. Po revizi DB 22. 10. 2026: update_kontakt uloží, co dostane, takže
 * text „n/a“ do databáze nesmí odejít nikdy; resolve_call by ho sám zahodil, appka ho stejně pošle jako null.
 */
export function cenaProServer(text: string | null | undefined): string | null {
  return cenaNezadana(text) ? null : (text ?? '').trim();
}
/** Čisté číslo, případně s Kč, Kc, CZK nebo „,-“: ukáže se jako „7 000 Kč“. */
const CENA_CISLO = /^(\d{1,3}(?:[ .\u00a0]\d{3})+|\d+)\s*(?:kč|kc|czk|,-)?$/i;
const CENA_DELKA = 26;

/**
 * Cena webu nebo hostingu v Moji klienti: čisté číslo jako „7 000 Kč“, jiný text (190/měs, 6000-7000 po domluvě)
 * tak, jak ho kdo zapsal, dlouhý zkrácený (celý v `cele` pro title); prázdné a zástupné (x, -, n/a) = null (nezadáno,
 * stránka ukáže „n/a“, cenaNezadana).
 */
export function cenaText(text: string | null | undefined): { text: string; cele: string } | null {
  if (cenaNezadana(text)) return null;
  const t = (text ?? '').trim();
  const m = CENA_CISLO.exec(t);
  if (m) return { text: formatKc(Number(m[1].replace(/[ .\u00a0]/g, ''))), cele: t };
  const znaky = [...t];
  return { text: znaky.length > CENA_DELKA ? `${znaky.slice(0, CENA_DELKA - 1).join('')}…` : t, cele: t };
}

const DNY_KRATCE = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];
const DNY_KDY = ['v pondělí', 'v úterý', 've středu', 've čtvrtek', 'v pátek', 'v sobotu', 'v neděli'];
const DNY_NAZEV = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'];

/** Čas v Praze bez úvodní nuly: „9:00“, „15:30“. */
export function formatCas(iso: string): string {
  return prahaCas(iso).replace(/^0(\d)/, '$1');
}

/** „23. 10.“ z YYYY-MM-DD. */
function denMesic(datum: string): string {
  const [, m, d] = datum.split('-').map(Number);
  return `${d}. ${m}.`;
}

/** „čt 23. 10. v 15:00“ (Praha). */
export function formatKdy(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return '—';
  const datum = prahaDen(iso);
  return `${DNY_KRATCE[isoDen(datum) - 1]} ${denMesic(datum)} v ${formatCas(iso)}`;
}

/** Datum v Praze „21. 10. 2026“ (výdělek: den prodeje jako server, i když je telefon v jiném pásmu). */
export function formatDatumPraha(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return '—';
  const [y, m, d] = prahaDen(iso).split('-').map(Number);
  return `${d}. ${m}. ${y}`;
}

/** Nadpis dne v kalendáři: „pátek 24. 10.“ (YYYY-MM-DD). */
export function formatDenNadpis(datum: string): string {
  return `${DNY_NAZEV[isoDen(datum) - 1]} ${denMesic(datum)}`;
}

/** Věta „dnes v 15:00“, „zítra v 9:00“, „ve čtvrtek 23. 10. v 15:00“ (dnes = YYYY-MM-DD v Praze). */
export function formatKdyVeta(iso: string, dnes: string = prahaDen(new Date())): string {
  const datum = prahaDen(iso);
  if (datum === dnes) return `dnes v ${formatCas(iso)}`;
  if (datum === posunDen(dnes, 1)) return `zítra v ${formatCas(iso)}`;
  if (datum === posunDen(dnes, -1)) return `včera v ${formatCas(iso)}`;
  return `${DNY_KDY[isoDen(datum) - 1]} ${denMesic(datum)} v ${formatCas(iso)}`;
}

/** „za 2 dny“, „před 3 h“, „za 15 min“, „teď“. */
export function formatRelativne(iso: string, ted: number = Date.now()): string {
  const diff = new Date(iso).getTime() - ted;
  if (Number.isNaN(diff)) return '';
  const abs = Math.abs(diff);
  const za = diff > 0;
  const min = Math.round(abs / 60000);
  if (min < 1) return 'teď';
  if (min < 60) return za ? `za ${min} min` : `před ${min} min`;
  const h = Math.round(abs / 3600000);
  if (h < 24) return za ? `za ${h} h` : `před ${h} h`;
  const dny = Math.round(abs / 86400000);
  if (za) return `za ${dny} ${dny === 1 ? 'den' : dny <= 4 ? 'dny' : 'dní'}`;
  return `před ${dny} ${dny === 1 ? 'dnem' : 'dny'}`;
}

/**
 * Okno (dialog) z klávesnice (po recenzi 21. 10. 2026, okna Přeplánovat, Naplánovat hovor a Nerelevantní): při otevření
 * fokus na první volbu (`data-autofocus`, jinak první ovládací prvek), Tab a Shift+Tab zůstávají v okně, Escape okno
 * zavře (ne během ukládání) a po zavření se fokus vrátí tam, odkud se okno otevřelo (když ten prvek pořád je).
 */
export function useOkno(ref: RefObject<HTMLElement>, zavrit: () => void, busy: boolean): void {
  const zavritRef = useRef(zavrit);
  zavritRef.current = zavrit;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    const predtim = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const PRVKY = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]';
    const prvni = ref.current?.querySelector<HTMLElement>('[data-autofocus]:not([disabled])') ?? ref.current?.querySelector<HTMLElement>(PRVKY);
    prvni?.focus();
    const klavesa = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!busyRef.current) zavritRef.current();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const vse = Array.from(ref.current.querySelectorAll<HTMLElement>(PRVKY));
      if (vse.length === 0) return;
      const i = vse.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && (i <= 0)) {
        e.preventDefault();
        vse[vse.length - 1].focus();
      } else if (!e.shiftKey && (i === -1 || i === vse.length - 1)) {
        e.preventDefault();
        vse[0].focus();
      }
    };
    document.addEventListener('keydown', klavesa);
    return () => {
      document.removeEventListener('keydown', klavesa);
      if (predtim && document.contains(predtim)) predtim.focus();
    };
    // jen při otevření a zavření okna
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
