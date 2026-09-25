// Role v appce (migrace 023, Albert 2026-09-24) — kdo co vidí je popsané
// v ../docs/ROLE-A-VIDITELNOST.md. Server to vynucuje sám; tady se jen neukazuje
// to, co by server stejně odmítl.
import type { Role } from './api/types';

/** Albertův účet (users.id = 1): majitel — vidí všechny lidi, zprávy automatizace a Automatizaci. */
export const OWNER_USER_ID = 1;

/** admin i super admin (stránky Označené, Zprávy, úpravy kontaktů). */
export function isAdminRole(role: Role | string | null | undefined): boolean {
  return role === 'admin' || role === 'super_admin';
}

/** super admin = VIDÍ všechny lidi (migrace 027); upravuje sebe a lidi pod sebou. */
export function isSuperAdmin(role: Role | string | null | undefined): boolean {
  return role === 'super_admin';
}

export const ROLE_LABELS: Record<Role, string> = {
  caller: 'volající',
  admin: 'admin',
  super_admin: 'super admin',
};

export function roleLabel(role: Role | string): string {
  return ROLE_LABELS[role as Role] ?? role;
}

/** Maska, kterou server posílá místo jména kolegy, kterého přihlášený nesmí vidět. */
export const JINY_VOLAJICI = 'jiný volající';
