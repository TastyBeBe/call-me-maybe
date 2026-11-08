// Web firmy oboru na kartě hovoru a v detailu (migrace 064, Albert 7. 11. 2026; návrh oborů 5.4, 5.5, 6.3, R10).
//
// Volající před hovorem vidí, jaký web firma má: odkaz, hodnocení A až F s významem písmene, jednu větu o stavu webu
// a nejvýš dvě konkrétní české věty o nedostatcích (kontakty.web_duvod z pevné tabulky frází). Písmeno je jen pro
// volajícího; firmě se čte konkrétní nedostatek. Slovo pro školní hodnocení se tu nikde nepoužívá (návrh 6.8).
// Číslo priority se nikde netiskne (nese ho věta).

import type { WebHodnoceni, WebStav } from './api/types';

/** Barva odznaku hodnocení: A a B zelená, C neutrální, D až F červená. */
export type HodnoceniTon = 'dobry' | 'prumerny' | 'slaby';

export const HODNOCENI_TON: Record<WebHodnoceni, HodnoceniTon> = {
  A: 'dobry',
  B: 'dobry',
  C: 'prumerny',
  D: 'slaby',
  E: 'slaby',
  F: 'slaby',
};

/** Slovo na odznaku vedle písmene. */
export const TON_SLOVO: Record<HodnoceniTon, string> = { dobry: 'dobrý', prumerny: 'průměrný', slaby: 'slabý' };

/** Význam písmen v nápovědě odznaku (podle tabulky kontroly webů). */
export const VYZNAM_HODNOCENI: Record<WebHodnoceni, string> = {
  A: 'A: výborný, moderní web',
  B: 'B: dobrý web, drobné nedostatky',
  C: 'C: funguje, ale je zastaralý nebo nevyrovnaný',
  D: 'D: zastaralý, špatně se používá',
  E: 'E: velmi slabý web',
  F: 'F: výjimečně slabý, vzhled z doby kolem roku 2000',
};

const HODNOCENI = new Set<string>(['A', 'B', 'C', 'D', 'E', 'F']);

/** Hodnocení z řádku, jen platné písmeno (jinak null). */
export function hodnoceniWebu(h: string | null | undefined): WebHodnoceni | null {
  return h && HODNOCENI.has(h) ? (h as WebHodnoceni) : null;
}

/** Věty ke stavům bez vlastního hodnoceného webu (tabulka návrhu 6.3). */
const VETA_STAVU: Partial<Record<WebStav, string>> = {
  zadny: 'Nemá vlastní web.',
  jen_socialni: 'Má jen profil na sociální síti.',
  zaparkovany: 'Doména je jen zaparkovaná, web na ní není.',
  jiny_web: 'Adresa webu dnes vede na cizí stránku.',
  katalog: 'Má jen profil v katalogu.',
  nenacten: 'Web se při kontrole nepodařilo otevřít, ověř si ho.',
  roboti: 'Web má, ale nešel ohodnotit.',
};

/** Stavy, u kterých firma vlastní web nemá (odkaz se neukáže, místo něj „nemá vlastní web“). */
export const BEZ_VLASTNIHO_WEBU: readonly WebStav[] = ['zadny', 'jen_socialni', 'zaparkovany', 'jiny_web', 'katalog'];

/**
 * Jedna věta o stavu webu podle web_stav a hodnocení (tabulka návrhu 6.3). Stav s vlastní větou má přednost; potvrzený
 * nebo nepotvrzený web (i stav, který nevíme) podle písmene; bez písmene „Web má, hodnocení chybí.“, bez webu i stavu
 * „Nemá vlastní web.“.
 */
export function vetaOWebu(stav: string | null | undefined, hodnoceni: string | null | undefined, web?: string | null): string {
  const veta = stav ? VETA_STAVU[stav as WebStav] : undefined;
  if (veta) return veta;
  const h = hodnoceniWebu(hodnoceni);
  if (h) {
    const ton = HODNOCENI_TON[h];
    return ton === 'dobry' ? 'Má dobrý web.' : ton === 'prumerny' ? 'Má průměrný web.' : 'Má web, hodnocení slabé.';
  }
  if (!stav && !(web ?? '').trim()) return 'Nemá vlastní web.';
  return 'Web má, hodnocení chybí.';
}

/** Ukáže se odkaz na vlastní web? (je adresa a stav neříká, že vlastní web nemá) */
export function maVlastniWebFirmy(stav: string | null | undefined, web: string | null | undefined): boolean {
  return !!(web ?? '').trim() && !BEZ_VLASTNIHO_WEBU.includes(stav as WebStav);
}

/** Nejvýš dvě věty o nedostatcích webu (server jich víc neposílá; appka to drží i tak), prázdné = žádná. */
export function vetyNedostatku(duvod: string | null | undefined): string[] {
  const t = (duvod ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  return (t.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [])
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 2);
}

/** Popisek odkazu na sociální síť u firmy bez vlastního webu („jen Facebook“). */
export function socialniPopisek(url: string | null | undefined): string | null {
  const u = (url ?? '').trim();
  if (!u) return null;
  let host = '';
  try {
    host = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.toLowerCase();
  } catch {
    return 'jen profil na sociální síti';
  }
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(host)) return 'jen Facebook';
  if (/(^|\.)instagram\.com$/.test(host)) return 'jen Instagram';
  return 'jen profil na sociální síti';
}

/** Bezpečná adresa pro odkaz (jen http a https; jinak null). */
export function odkazWebu(url: string | null | undefined): string | null {
  const u = (url ?? '').trim();
  if (!u) return null;
  const s = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  try {
    const p = new URL(s);
    return p.protocol === 'http:' || p.protocol === 'https:' ? p.href : null;
  } catch {
    return null;
  }
}

/** „6. 11. 2026“ z YYYY-MM-DD (bez časového pásma; datum kontroly je den). */
export function denCesky(d: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? '');
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : null;
}
