// Souhrn stavu vypínače automatizace (migrace 012) — jedna věta + barevný štítek.
// Používá ho stránka Automatizace i dlaždice na úvodu, ať Albert vidí totéž na obou místech.

import type { AutomationStatus } from './api';

export type PowerTone = 'on' | 'draining' | 'off';

export interface PowerSummary {
  tone: PowerTone;
  /** krátký text do štítku */
  pill: string;
  /** jedna věta pro Alberta */
  text: string;
}

export function accountLabel(st: AutomationStatus, slug: string): string {
  return st.accounts.find((a) => a.slug === slug)?.label ?? slug;
}

export function powerSummary(st: AutomationStatus): PowerSummary {
  const { control, running } = st;
  if (control.phase === 'stopped') {
    return { tone: 'off', pill: 'Vypnuto', text: 'Automatizace je vypnutá' };
  }
  if (control.phase === 'draining') {
    const tail =
      control.drain_reason === 'stop'
        ? 'pak se vypne'
        : `pak se přepne na účet ${accountLabel(st, control.requested_account)}`;
    return {
      tone: 'draining',
      pill: running.length > 0 ? `Dokončuje ${running.length}` : 'Dokončuje',
      text: `Agenti dokončují rozdělanou práci – ${tail}`,
    };
  }
  const active = st.accounts.find((a) => a.slug === control.active_account);
  if (active && !active.token_present) {
    return {
      tone: 'on',
      pill: 'Zapnuto',
      text: `Automatizace je zapnutá, ale účet ${active.label} ještě nemá přihlášení pro agenty`,
    };
  }
  return { tone: 'on', pill: 'Běží', text: 'Automatizace běží' };
}

/** Zapnuto před méně než 15 minutami = agenti se teprve rozjedou s dalším tikem. */
export function justStarted(startedAt: string | null): boolean {
  if (!startedAt) return false;
  return Date.now() - new Date(startedAt).getTime() < 15 * 60 * 1000;
}
