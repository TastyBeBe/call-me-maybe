import type { ReactNode } from 'react';
import type { CekaniKind, CekaniKos, FlagKind, Kontakt, KontaktStatus } from './api';
import { FlagIcon } from './icons';

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

/** Delší vysvětlení pro detail kontaktu. */
export const FLAG_HINTS: Record<FlagKind, string> = {
  chybi_info:
    'Nedokázali jsme dohledat, o jaký objekt jde — chybí lokalita i inzerát. Web nejde postavit naslepo.',
  chybi_email:
    'Na tohoto klienta nemáme e-mail, takže mu nejde poslat návrh. Až ho zjistíš při hovoru, zapiš ho — příznak pak zmizí sám.',
  email_neoveren:
    'E-mail jsme dohledali na internetu, ale klient ho nepotvrdil. Při hovoru ho prosím ověř.',
  info_neoverene:
    'Texty a fotky na webu pocházejí z internetu, klient je zatím nepotvrdil. Může v nich být nepřesnost.',
  jine: 'U tohoto klienta je něco nedořešeného — podrobnosti jsou v poznámce níže.',
  neodpovida:
    'Klient si web vyžádal, my mu odpověděli a od té doby mlčí. Zavolej mu prosím — příznak zmizí sám, jakmile se ozve nebo mu někdo zavolá.',
};

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

/** Telefonní čísla oddělená čárkami vykreslí jako klikatelné tel: odkazy. */
export function PhoneLinks({ phone }: { phone: string | null }) {
  if (!phone || !phone.trim()) return <span className="muted">bez telefonu</span>;
  const parts = phone
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <span className="phone-links">
      {parts.map((p, i) => (
        <a key={i} className="phone-link" href={`tel:${p.replace(/\s+/g, '')}`}>
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
  vlazne: 'Vlažné (1–3 měsíce)',
  vychladle: 'Vychladlé (3+ měsíce)',
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
  if (dny < 90) return 'vlazne';
  return 'vychladle';
}
