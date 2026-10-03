// Segment klienta: chaty a architekti (migrace 028, docs/ARCHITEKTI.md oddíl 1 a 9).
//
// Tohle je JEDINÉ místo v appce, které ví, odkud se segment bere (sloupec `segment`
// z RPC), a jediné místo, které čte a ukládá volbu „koho voláš" v localStorage.
// Sloupec `obor` je jen popisek pro lidi (u testovacích kontaktů „test"), podle něj se
// segment NIKDY neurčuje.

import type { Kontakt, Segment } from './api/types';
import { isAdminRole } from './roles';

/** Volba ve volání, per zařízení (jako ostatní klíče `volacka_*`). */
export const LS_SEGMENT = 'volacka_segment';

/** Oba segmenty v pořadí, ve kterém je appka ukazuje. */
export const SEGMENTY: readonly Segment[] = ['chata', 'architekt'];

/**
 * Koho volající volá. Přijme jen 'chata' nebo 'architekt'; cokoli jiného (smetí, stará
 * hodnota, nedostupný localStorage) = 'chata' (RC-14): next_contact na neznámou hodnotu
 * hází chybu, takže smetí v localStorage by jinak zastavilo volání chat.
 */
export function loadCallSegment(): Segment {
  try {
    return localStorage.getItem(LS_SEGMENT) === 'architekt' ? 'architekt' : 'chata';
  } catch {
    return 'chata';
  }
}

export function saveCallSegment(s: Segment): void {
  try {
    localStorage.setItem(LS_SEGMENT, s);
  } catch {
    // localStorage nedostupné: volba platí do reloadu
  }
}

/** Segment kontaktu. Bez sloupce `segment` (server bez migrace 028) je to chata. */
export function segmentOf(k: Pick<Kontakt, 'segment'> | null | undefined): Segment {
  return k?.segment === 'architekt' ? 'architekt' : 'chata';
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
