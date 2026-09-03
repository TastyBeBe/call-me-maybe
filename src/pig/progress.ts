/**
 * Procop's PROGRESS model: the app's real counters -> dances, tool unlocks, PROKCHOP and the closet.
 *
 * COUNTER MAPPING (src/api/types.ts + db/schema.sql, my_stats / all_stats):
 *   calls    = MyStats.calls  — every call_log row this user wrote (any outcome)
 *   accepted = MyStats.zajem  — outcome 'zajem' ("Mají zájem": the client agrees to the preview)
 *   sold     = MyStats.sold   — distinct kontakty at status zaplaceno / domena_pripojena / hotovo
 *                               that this user had a 'zajem' call on
 * All three come from my_stats for every role, so callers and admins get their own progress.
 *
 * PROKCHOP (Albert): 1 per call, +2 more when they accept the preview, +10 more when they buy.
 * Everything a user "has" (spent chops, owned hats, the chosen hat, which milestones already
 * fired) is per-user localStorage. Počítadla jdou vždy ze skutečných čísel v my_stats —
 * simulace ani ladicí přepisy tady nejsou.
 */
export type CounterKey = 'calls' | 'accepted' | 'sold';
export interface Counters { calls: number; accepted: number; sold: number }

export function earnedChops(c: Counters): number {
  return c.calls + 2 * c.accepted + 10 * c.sold;
}

export interface Milestone { id: string; counter: CounterKey; need: number; dance: string; label: string }
export const MILESTONES: Milestone[] = [
  { id: 'acc1',    counter: 'accepted', need: 1,   dance: 'dance_wave',      label: 'první klient, který chce návrh' },
  { id: 'sold1',   counter: 'sold',     need: 1,   dance: 'dance_ovcacek',   label: 'první prodaný web' },
  { id: 'acc10',   counter: 'accepted', need: 10,  dance: 'dance_buckbuck',  label: '10 klientů chce návrh' },
  { id: 'sold10',  counter: 'sold',     need: 10,  dance: 'dance_twerk',     label: '10 prodaných webů' },
  { id: 'sold100', counter: 'sold',     need: 100, dance: 'dance_handstand', label: '100 prodaných webů' },
];

export interface Unlock { counter: CounterKey; need: number; hidden?: boolean }
/** null = available from the start */
export const UNLOCKS: Record<string, Unlock | null> = {
  hand: null, suk: null, glove: null,
  bat: { counter: 'accepted', need: 1 },
  pan: { counter: 'sold', need: 1 },
  hammer: { counter: 'accepted', need: 10 },
  knife: { counter: 'sold', need: 10 },
  whip: { counter: 'accepted', need: 20 },
  chainsaw: { counter: 'sold', need: 20 },
  grenade: { counter: 'accepted', need: 50 },
  crystal: { counter: 'sold', need: 100, hidden: true },
};

/** Czech declension after a number: 1 zájem / 2-4 zájmy / 5+ zájmů */
export function unit(k: CounterKey, n: number): string {
  const forms: Record<CounterKey, [string, string, string]> = {
    calls: ['hovor', 'hovory', 'hovorů'],
    accepted: ['zájem', 'zájmy', 'zájmů'],
    sold: ['prodej', 'prodeje', 'prodejů'],
  };
  const f = forms[k];
  return n === 1 ? f[0] : n >= 2 && n <= 4 ? f[1] : f[2];
}
const VERB: Record<CounterKey, string> = { calls: 'Zavolej', accepted: 'Získej', sold: 'Prodej' };

export function isUnlocked(toolId: string, c: Counters): boolean {
  const u = UNLOCKS[toolId];
  return !u || c[u.counter] >= u.need;
}
/** what the user must DO, for the hover card of a locked item */
export function requirement(toolId: string): string {
  const u = UNLOCKS[toolId];
  if (!u) return 'Odemčeno od začátku';
  if (u.hidden) return 'Tajný předmět — prodávej dál…';
  return `${VERB[u.counter]} ${u.need} ${unit(u.counter, u.need)}`;
}
/** `have / need`; the crystal shows progress but never its target */
export function progressLabel(toolId: string, c: Counters): string {
  const u = UNLOCKS[toolId];
  if (!u) return 'odemčeno';
  const have = c[u.counter];
  return u.hidden ? `${have} / ?` : `${have} / ${u.need}`;
}
export function progressFrac(toolId: string, c: Counters): number {
  const u = UNLOCKS[toolId];
  if (!u) return 1;
  if (u.hidden) return Math.min(0.92, c[u.counter] / u.need);
  return Math.min(1, c[u.counter] / u.need);
}

/* ---------- the CLOSET ---------- */
export interface Cosmetic { id: string; label: string; price: number | null; award?: 'top_seller' }
export const COS_PRICE = 50;
// the crown, the trainer cap and the golden #1 cap are GONE (his order); the SWAGGER GLASSES are
// the #1-seller award now and cannot be bought.
export const COSMETICS: Cosmetic[] = [
  { id: 'cos_cone',     label: 'Dopravní kužel',  price: COS_PRICE },
  { id: 'cos_burglar',  label: 'Lupičská čepice', price: COS_PRICE },
  { id: 'cos_sombrero', label: 'Mini sombrero',   price: COS_PRICE },
  { id: 'cos_latex',    label: 'Gumová čepička',  price: COS_PRICE },
  { id: 'cos_santa',    label: 'Santova čepice',  price: COS_PRICE },
  { id: 'cos_glasses',  label: 'Swagger brýle',   price: null, award: 'top_seller' },
];
/** the cosmetic the #1 seller wears (and the ULTRA TWERK puts on) */
export const TOP_COSMETIC = 'cos_glasses';

export interface Progress {
  fired: string[]; seen: string[]; pigOn: boolean;
  spent: number; owned: string[]; cos: string | null; topSeller: boolean;
}
const EMPTY: Progress = { fired: [], seen: [], pigOn: true, spent: 0, owned: [], cos: null, topSeller: false };
const key = (uid: number | string) => `procop_progress_${uid}`;

export function loadProgress(uid: number | string): Progress {
  try {
    const raw = localStorage.getItem(key(uid));
    if (raw) return { ...EMPTY, ...(JSON.parse(raw) as Partial<Progress>) };
  } catch { /* ignore */ }
  return { ...EMPTY };
}
export function saveProgress(uid: number | string, p: Progress): void {
  try { localStorage.setItem(key(uid), JSON.stringify(p)); } catch { /* ignore */ }
}
export function balance(c: Counters, p: Progress): number {
  return Math.max(0, earnedChops(c) - (p.spent || 0));
}

/** admin simulation: counters that REPLACE the real ones while set */

/* ---------- how long each person has been #1 SELLER (his ask: it is part of their stats) ----------
 * Counted in whole DAYS: every calendar day on which they held the crown adds one. Kept per user id
 * in one map so the Statistics page can show it for whoever is selected. */
export interface TopDays { days: number; lastDay: string | null; sinceDay: string | null }
const TKEY = 'procop_top_days';
const today = () => new Date().toISOString().slice(0, 10);
export function loadTopDays(): Record<string, TopDays> {
  try { return JSON.parse(localStorage.getItem(TKEY) || '{}') as Record<string, TopDays>; } catch { return {}; }
}
export function topDaysFor(uid: number | string): TopDays {
  return loadTopDays()[String(uid)] ?? { days: 0, lastDay: null, sinceDay: null };
}
/** call whenever the leaderboard is checked: adds a day the first time it is seen each date */
export function tickTopDays(uid: number | string, isTop: boolean): TopDays {
  const all = loadTopDays(); const k = String(uid);
  const cur: TopDays = all[k] ?? { days: 0, lastDay: null, sinceDay: null };
  if (isTop) {
    const d = today();
    if (cur.lastDay !== d) { cur.days += 1; cur.lastDay = d; if (!cur.sinceDay) cur.sinceDay = d; }
  } else if (cur.sinceDay) { cur.sinceDay = null; }
  all[k] = cur;
  try { localStorage.setItem(TKEY, JSON.stringify(all)); } catch { /* ignore */ }
  return cur;
}
export function dayWord(n: number): string { return n === 1 ? 'den' : n >= 2 && n <= 4 ? 'dny' : 'dní'; }
