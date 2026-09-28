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
