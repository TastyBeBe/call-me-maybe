// ODKAZ NA E-MAILOVOU KONVERZACI S KLIENTEM V GMAILU WEBDOMOV (Albert 13. 11. 2026: „for each client, when you click on the
// client, if there would be like a link to the email conversation which the automation is having with them“; volba „Gmail
// link only“ a „the Gmail link should be only visible to the super admins“). Appka e-maily nemá: odkaz otevře v Gmailu účtu
// automatizace hledání všech adres klienta (pole e-mail, adresa pro rezervace a adresa souhlasu s náhledem), takže ukáže
// všechna vlákna s ním. Otevře se jen tomu, kdo je do toho Gmailu přihlášený. Detail ho kreslí jen super adminovi.
import type { Kontakt } from './api/types';

/** Gmail, do kterého automatizace píše a ze kterého čte poštu klientů. */
export const GMAIL_AUTOMATIZACE = 'domovwebu@gmail.com';

type SAdresami = Pick<Kontakt, 'email'> & { email_rezervace?: string | null; souhlas_email?: string | null };

/** Adresy klienta bez opakování (malými písmeny, jen tvar s @), v pořadí pole e-mail, rezervace, souhlas. */
export function adresyKlienta(k: SAdresami): string[] {
  const out: string[] = [];
  for (const a of [k.email, k.email_rezervace, k.souhlas_email]) {
    const t = (a ?? '').trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Odkaz na hledání konverzace v Gmailu automatizace, nebo null, když klient žádnou adresu nemá. */
export function gmailOdkaz(k: SAdresami): string | null {
  const adresy = adresyKlienta(k);
  if (adresy.length === 0) return null;
  const dotaz = adresy.join(' OR ');
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(GMAIL_AUTOMATIZACE)}#search/${encodeURIComponent(dotaz)}`;
}
