import type { ReactNode } from 'react';
import type {
  CekaniKind,
  CekaniKos,
  ChatMessage,
  DphStav,
  FlagKind,
  Kontakt,
  KontaktStatus,
  Segment,
  ZdrojTelefonu,
} from './api';
import { CompassIcon, FlagIcon, HomeIcon } from './icons';
import { SEGMENTY, segmentOf } from './segment';

/** České popisky statusů kontaktu. */
export const STATUS_LABELS: Record<KontaktStatus, string> = {
  nekontaktovano: 'Nekontaktováno',
  nedovolano: 'Nedovoláno',
  odmitnuto: 'Odmítnuto',
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

export function StatusBadge({ status }: { status: KontaktStatus }) {
  const c = STATUS_COLORS[status] ?? { bg: '#fdf6e9', fg: '#221e33' };
  return (
    <span className="badge" style={{ background: c.bg, color: c.fg }}>
      {STATUS_LABELS[status] ?? status}
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
      ? 'Na tohoto klienta nemáme funkční e-mail, takže mu nejde poslat návrh. Když ho zjistíš, dej ho vědět adminovi — příznak pak zruší on nebo ona.'
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

/** „12345678 · neplátce DPH"; bez IČO null (volající pak vidí „nezjištěno"). */
export function icoDph(ico: string | null | undefined, dph: DphStav | null | undefined): string | null {
  if (!ico) return null;
  return dph && DPH_LABELS[dph] ? `${ico} · ${DPH_LABELS[dph]}` : ico;
}

/** Odkud máme číslo (9.3, [ALBERT 10]). Volající to říká na „odkud máte moje číslo". */
export const ZDROJ_TELEFONU_LABELS: Record<ZdrojTelefonu, string> = {
  cka_registr: 'registru České komory architektů',
  web_vlastni: 'jeho webu',
  firmy_cz: 'firmy.cz',
  jiny: 'jiného veřejného zdroje',
  neznamy: 'neznámo, řekni: z veřejného seznamu architektů',
};

export function zdrojTelefonu(z: ZdrojTelefonu | null | undefined): string {
  return (z && ZDROJ_TELEFONU_LABELS[z]) || ZDROJ_TELEFONU_LABELS.neznamy;
}

/**
 * Totéž, jak to volající ŘEKNE architektovi: „Vaše číslo mám z …“ (scénář 9.4, audit APP-7).
 * Popisky výš jsou pro řádek karty a mluví o architektovi ve 3. osobě („jeho webu“); věta
 * v hovoru ho oslovuje. Neznámý zdroj = to, co popisek radí říct.
 */
export const ZDROJ_TELEFONU_VETA: Record<ZdrojTelefonu, string> = {
  cka_registr: 'registru České komory architektů',
  web_vlastni: 'vašeho webu',
  firmy_cz: 'firmy.cz',
  jiny: 'veřejně dostupného zdroje',
  neznamy: 'veřejného seznamu architektů',
};

export function zdrojTelefonuVeta(z: ZdrojTelefonu | null | undefined): string {
  return (z && ZDROJ_TELEFONU_VETA[z]) || ZDROJ_TELEFONU_VETA.neznamy;
}
