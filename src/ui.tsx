import type { ReactNode } from 'react';
import type { FlagKind, Kontakt, KontaktStatus } from './api';
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
};

export const ALL_FLAGS = Object.keys(FLAG_LABELS) as FlagKind[];

export const FLAG_COLORS: Record<FlagKind, { bg: string; fg: string }> = {
  chybi_info: { bg: '#c0392b', fg: '#fdf6e9' },
  chybi_email: { bg: '#e2596f', fg: '#fdf6e9' },
  email_neoveren: { bg: '#e4926f', fg: '#221e33' },
  info_neoverene: { bg: '#e8b04b', fg: '#221e33' },
  jine: { bg: '#a2988a', fg: '#221e33' },
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
