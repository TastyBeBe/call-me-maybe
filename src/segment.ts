// Segment klienta: chaty a architekti (migrace 028, docs/ARCHITEKTI.md oddíl 1 a 9).
//
// Tohle je JEDINÉ místo v appce, které ví, odkud se segment bere (sloupec `segment`
// z RPC), a jediné místo, které čte a ukládá volbu „koho voláš" v localStorage.
// Sloupec `obor` je jen popisek pro lidi (u testovacích kontaktů „test"), podle něj se
// segment NIKDY neurčuje.

import type { Kontakt, Segment } from './api/types';

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
 * Řádek z úpravy bez osobního IČO, když kontakt uživatel nesmí upravit (klíč chybí jako
 * v seznamu). Osobní IČO architekta vidí jen ten, kdo kontakt smí upravit ([ALBERT 28],
 * docs/ARCHITEKTI.md 2.2 l): seznamy (list_kontakty, my_kontakty, list_flagged) klíč
 * `ico_osobni` ostatním nepošlou, detail pak ukáže „skryto". Úpravy (set_flag, clear_flag,
 * update_kontakt, oznacit_za_sveho) ale vracejí řádek celý i se `smi_upravit`, a příznak
 * a zámek smí měnit každý admin. Bez tohohle by se „skryto" po uložení příznaku přepnulo
 * na číslo (revize 28. 9.).
 */
export function bezCizihoIco(k: Kontakt): Kontakt {
  if (k.smi_upravit === true || !Object.prototype.hasOwnProperty.call(k, 'ico_osobni')) return k;
  const kopie = { ...k };
  delete kopie.ico_osobni;
  return kopie;
}
