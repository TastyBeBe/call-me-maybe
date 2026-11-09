// Segment klienta: chaty a architekti (migrace 028, docs/ARCHITEKTI.md oddíl 1 a 9) a od migrace 064 (Albert 7. 11. 2026)
// niky rodiny obor (autoservis, stavby, topeni, elektro … z registru obor_niky, src/obory.ts).
//
// Tohle je JEDINÉ místo v appce, které ví, odkud se segment bere (sloupec `segment`
// z RPC), a jediné místo, které čte a ukládá volbu „koho voláš" v localStorage.
// Sloupec `obor` je jen popisek pro lidi (u testovacích kontaktů „test"), podle něj se
// segment NIKDY neurčuje.

import type { Kontakt, Rodina, Segment } from './api/types';
import { isAdminRole } from './roles';

/** Volba ve volání, per zařízení (jako ostatní klíče `volacka_*`). */
export const LS_SEGMENT = 'volacka_segment';

/**
 * Chaty a architekti v pořadí, ve kterém je appka ukazuje. Niky oboru jdou za nimi, štítky a pořadí z registru
 * (app_obor_niky, src/obory.ts); appka žádnou niku nezná jménem (návrh oborů 6.1).
 */
export const SEGMENTY: readonly Segment[] = ['chata', 'architekt'];

/** Tři rodiny (migrace 064): podle nich se rozhoduje rozložení karty, nápovědy a texty. */
export const RODINY: readonly Rodina[] = ['chata', 'architekt', 'obor'];

/** Tvar klíče niky jako CHECK obor_niky.klic na serveru (migrace 064): malá písmena a číslice, 2 až 24 znaků. */
const KLIC_NIKY = /^[a-z][a-z0-9]{1,23}$/;

/** Je hodnota klíč niky oboru (tvarem; jestli je v registru, ví src/obory.ts)? chata, architekt a obor nikdy. */
export function jeKlicNiky(s: unknown): s is string {
  return typeof s === 'string' && KLIC_NIKY.test(s) && s !== 'chata' && s !== 'architekt' && s !== 'obor';
}

/**
 * Rodina segmentu (migrace 064, návrh 6.1): null, prázdné a chata = chata, architekt = architekt, klíč niky = obor.
 * Hodnota, která nemá tvar klíče niky (smetí), je chata jako dřív (RC-14); server jiné hodnoty než z registru nepošle.
 */
export function rodinaOf(seg: string | null | undefined): Rodina {
  if (seg === 'architekt') return 'architekt';
  return jeKlicNiky(seg) ? 'obor' : 'chata';
}

/** Patří segment do rodiny obor (některá nika)? */
export function jeObor(seg: string | null | undefined): boolean {
  return rodinaOf(seg) === 'obor';
}

/**
 * Koho volající volá. Přijme 'architekt', od migrace 064 i niku, která je v `niky` (klíče nik, které smí teď volat,
 * z registru app_obor_niky); cokoli jiného (smetí, stará hodnota, nika, která už zapnutá není, nedostupný localStorage)
 * = 'chata' (RC-14): next_contact na neznámou nebo vypnutou hodnotu hází chybu, takže smetí v localStorage by jinak
 * zastavilo volání chat. Bez seznamu nik (registr ještě není načtený) jen chata a architekt.
 */
export function loadCallSegment(niky: readonly string[] = []): Segment {
  try {
    const v = localStorage.getItem(LS_SEGMENT);
    if (v === 'architekt') return 'architekt';
    return jeKlicNiky(v) && niky.includes(v) ? v : 'chata';
  } catch {
    return 'chata';
  }
}

/** Uložená volba je nika (tvarem)? CallPage pak s první kartou počká na registr nik, ať niku nepřepne na chaty. */
export function ulozenaNika(): boolean {
  try {
    return jeKlicNiky(localStorage.getItem(LS_SEGMENT));
  } catch {
    return false;
  }
}

/** Událost po změně volby „koho voláš“ (menu ukáže odkaz „jak volat“, jen když je zvolená nika). */
export const UDALOST_SEGMENT = 'cmm:segment-changed';

export function saveCallSegment(s: Segment): void {
  try {
    localStorage.setItem(LS_SEGMENT, s);
  } catch {
    // localStorage nedostupné: volba platí do reloadu
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(UDALOST_SEGMENT, { detail: { segment: s } }));
  }
}

/** Albert 9. 11. 2026: „when they open the app and go to the call feature, by default, it opens the electricians“. */
export const VYCHOZI_NIKA = 'elektro';
const SS_VYCHOZI = 'volacka_vychozi_nika';

/** Je výchozí nika v téhle relaci prohlížeče už vyřízená? (sessionStorage; nedostupné úložiště = ano, nic se nemění) */
export function vychoziNikaVyrizena(): boolean {
  try {
    return sessionStorage.getItem(SS_VYCHOZI) !== null;
  } catch {
    return true;
  }
}

/**
 * Jednou za relaci prohlížeče (nové otevření appky): když přihlášený smí volat elektrikáře, uloží se volba „koho voláš“
 * elektro a vrátí true. S načteným registrem, kde elektro volat nesmí, se relace jen označí (vrátí false). Bez načteného
 * registru se nic nezmění (zkusí se znovu po načtení). Potom si volající přepíná jako dřív a jeho volba platí do zavření
 * appky. NAHRAZUJE „začni tam, kde jsi minule skončil“ pro první otevření volání v relaci.
 */
export function vychoziNikaRelace(kVolani: readonly string[], registrNacten: boolean): boolean {
  try {
    if (sessionStorage.getItem(SS_VYCHOZI) !== null) return false;
    if (kVolani.includes(VYCHOZI_NIKA)) {
      sessionStorage.setItem(SS_VYCHOZI, VYCHOZI_NIKA);
      saveCallSegment(VYCHOZI_NIKA);
      return true;
    }
    if (registrNacten) sessionStorage.setItem(SS_VYCHOZI, '-');
    return false;
  } catch {
    return false;
  }
}

/** Uložená volba bez kontroly registru (null = nic uloženého nebo nedostupný localStorage); jen pro menu a „Jak volat“. */
export function ulozenaVolba(): string | null {
  try {
    return localStorage.getItem(LS_SEGMENT);
  } catch {
    return null;
  }
}

/**
 * Segment kontaktu. Bez sloupce `segment` (server bez migrace 028) je to chata. Od migrace 064 vrací niku oboru tak, jak
 * přišla (nikdy ji nepřevede na chatu; dřív „cokoli kromě architekta = chata“); smetí bez tvaru klíče = chata.
 */
export function segmentOf(k: Pick<Kontakt, 'segment'> | null | undefined): Segment {
  const s = k?.segment;
  if (s === 'architekt') return 'architekt';
  return jeKlicNiky(s) ? s : 'chata';
}

/**
 * Smí uživatel s touhle rolí vidět a hledat IČO architekta (osobní i ateliéru)? Jen admin a super
 * admin (Albert 3. 10. 2026, APP-8, migrace 037 a 038). Volající IČO nevidí nikde: karta ve volání,
 * Kontakty, Moji klienti ani detail kontaktu; detail mu místo IČO ukáže řádek „obrat“ podle DPH.
 * Neznámá role = ne. Server klíče volajícímu neposílá; tohle drží appku, i kdyby je poslal starý server.
 */
export function icoVidi(role: string | null | undefined): boolean {
  return isAdminRole(role);
}

/**
 * Řádek z úpravy bez osobního IČO, když kontakt uživatel nesmí upravit (klíč chybí jako
 * v seznamu). Osobní IČO architekta vidí jen ten, kdo kontakt smí upravit ([ALBERT 28],
 * docs/ARCHITEKTI.md 2.2 l): seznamy (list_kontakty, my_kontakty, list_flagged) klíč
 * `ico_osobni` ostatním nepošlou, detail pak ukáže „skryto“. IČO ateliéru, které se rovná
 * osobnímu (živnostník), odpadne s ním i s DPH ateliéru (migrace 032).
 * Úpravy set_flag, clear_flag a update_kontakt osobní IČO takovému uživateli neposílají
 * (migrace 028, IČO ateliéru od 036); bez masky seznamu i se `smi_upravit` vrací řádek jen
 * oznacit_za_sveho (adminovi s IČO, volajícímu od migrace 037 bez IČO architekta), a příznak
 * a zámek smí měnit každý admin. Bez tohohle by se „skryto“
 * po označení klienta (nebo na serveru před migrací 036 po uložení příznaku) přepnulo na
 * číslo (revize 28. 9., audit APP-5).
 */
export function bezCizihoIco(k: Kontakt): Kontakt {
  if (k.smi_upravit === true || !Object.prototype.hasOwnProperty.call(k, 'ico_osobni')) return k;
  const kopie = { ...k };
  if (kopie.ico_firma != null && kopie.ico_firma === kopie.ico_osobni) {
    delete kopie.ico_firma;
    delete kopie.dph_firma;
  }
  delete kopie.ico_osobni;
  return kopie;
}
