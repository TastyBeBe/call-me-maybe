// Role v appce (migrace 023, Albert 2026-09-24) — kdo co vidí je popsané
// v ../docs/ROLE-A-VIDITELNOST.md. Server to vynucuje sám; tady se jen neukazuje
// to, co by server stejně odmítl.
// ⚠ ZMĚNĚNO migrací 042 (Albert 18. 10. 2026): role jsou jen dvě. Klíč `admin` se v appce
// jmenuje „Volající“, `super_admin` „Super admin“; stará role `caller` je sloučená do `admin`
// (server ji od 042 neukládá) a appka ji, kdyby ji poslal starý server, popíše taky jako Volající.
import type { Role } from './api/types';

/** Albertův účet (users.id = 1): majitel — vidí všechny lidi, zprávy automatizace a Automatizaci. */
export const OWNER_USER_ID = 1;

/** Volající (admin) i super admin (stránky Označené, Zprávy, úpravy kontaktů). */
export function isAdminRole(role: Role | string | null | undefined): boolean {
  return role === 'admin' || role === 'super_admin';
}

/** super admin = VIDÍ všechny lidi (migrace 027); upravuje sebe a lidi pod sebou. */
export function isSuperAdmin(role: Role | string | null | undefined): boolean {
  return role === 'super_admin';
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Volající',
  super_admin: 'Super admin',
  caller: 'Volající',
};

/** Role, které jde v appce vybrat (migrace 042): Volající a Super admin. */
export const ROLE_VOLBY: { value: Role; label: string }[] = [
  { value: 'admin', label: ROLE_LABELS.admin },
  { value: 'super_admin', label: ROLE_LABELS.super_admin },
];

export function roleLabel(role: Role | string): string {
  return ROLE_LABELS[role as Role] ?? role;
}

/** Maska, kterou server posílá místo jména kolegy, kterého přihlášený nesmí vidět. */
export const JINY_VOLAJICI = 'jiný volající';
