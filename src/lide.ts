// VÝBĚR LIDÍ (Přehled vedení úkol 10, Albert 17. 11. 2026, rozhodnutí D7: „all the super admins can view everyone, but they can
// also filter out only their team … even with the clients … view their entire team … everyone together … individual people
// … compare or combine any two callers … easy to select how many people they want to see“; spec
// docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md §7.3, kontrakt docs/superpowers/specs/2026-11-17-prehled-kontrakt.md
// §6 a §5.5). Jen logika bez Reactu: co výběr znamená (rozbalVyber), jak se jmenuje na tlačítku (shrnutiVyberu), co jde serveru
// (lideDotaz) a návrat na dnešní volání jednoho člověka proti serveru bez migrace 074 (sLidmi). Komponenta je
// components/LidePicker.tsx; Volající ji nikdy nevidí (seznam lidí dává all_stats jen super adminovi, stránky ji kreslí jen pod
// isSuper), takže Volajícímu se nic nemění.
//
// Tým = super admin a všichni, jejichž manager_id je on (super admin volá taky, kontrakt Tym). „Všichni“ = bez filtru lidí
// (null: i neaktivní, v seznamech i kontakty bez volajícího, jako dřív „Všichni volající“); se zapnutým „jen aktivní“ všichni
// aktivní jmenovitě. „jen aktivní“ vyřadí neaktivní z předvoleb (tým, Všichni) a ze seznamu v panelu; zaškrtnutí lidé platí,
// jak jsou (panel neaktivní při zapnutí sám odškrtne). Filtry se nepamatují (docs/ARCHITEKTI.md 9.6): výběr drží stránka.

import { BEZ_074_LIDE } from './api/supabase';
import type { Role } from './api/types';

/** Člověk ve výběru (z all_stats nebo z prehled_moznosti.lide): jen to, co výběr potřebuje. */
export interface Clovek {
  id: number;
  display_name: string;
  role: Role | string;
  active: boolean;
  /** super admin, pod kterého patří; super admin ho nemá */
  manager_id: number | null;
}

export type DruhVyberu = 'ja' | 'tym' | 'vsichni' | 'vybrani';

/**
 * Výběr lidí: Já, tým (`tymId` = id super admina; Můj tým = můj), Všichni, nebo vybraní lidé (`ids`). `jenAktivni` = zaškrtnuté
 * „jen aktivní“ (platí pro předvolby). `bezVolajiciho` = Označené „Bez volajícího“ (migrace 060): označení, která nepatří nikomu;
 * jde jen samo (server ho s výběrem lidí odmítne).
 */
export interface Vyber {
  druh: DruhVyberu;
  tymId?: number;
  ids: number[];
  jenAktivni?: boolean;
  bezVolajiciho?: boolean;
}

export const VYBER_JA: Vyber = { druh: 'ja', ids: [] };
export const VYBER_VSICHNI: Vyber = { druh: 'vsichni', ids: [] };
export const VYBER_BEZ_VOLAJICIHO: Vyber = { druh: 'vybrani', ids: [], bezVolajiciho: true };

/** Řádek all_stats (nebo cokoli s user_id) jako člověk výběru. */
export function clovekZ(u: { user_id: number; display_name: string; role: Role | string; active: boolean; manager_id: number | null }): Clovek {
  return { id: u.user_id, display_name: u.display_name, role: u.role, active: u.active, manager_id: u.manager_id };
}

const vzestupne = (ids: readonly (number | null | undefined)[]): number[] =>
  [...new Set(ids.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)))].sort((a, b) => a - b);

const jeSuperAdmin = (c: Clovek | undefined): boolean => c?.role === 'super_admin';

/** „Tým Mikuláš“ (kontrakt Tym.nazev = „Tým <jméno>“). */
export function nazevTymu(tymId: number, lide: readonly Clovek[]): string {
  const v = lide.find((c) => c.id === tymId);
  return `Tým ${v ? v.display_name : `#${tymId}`}`;
}

/** Id členů týmu vzestupně: super admin a všichni s jeho manager_id; s `jenAktivni` bez neaktivních. */
export function clenoveTymu(tymId: number, lide: readonly Clovek[], jenAktivni = false): number[] {
  const vedouci = lide.find((c) => c.id === tymId);
  const clenove = [vedouci ?? { id: tymId, active: true }, ...lide.filter((c) => c.manager_id === tymId && c.id !== tymId)];
  return vzestupne(clenove.filter((c) => !jenAktivni || c.active).map((c) => c.id));
}

/**
 * Výběr jako id lidí vzestupně (bez duplicit); null = všichni bez filtru (Všichni s vypnutým „jen aktivní“). Bez volajícího
 * = [] (žádný člověk; stránka ho pozná dřív, lideDotaz).
 */
export function rozbalVyber(v: Vyber, lide: readonly Clovek[], ja: number, jenAktivni = v.jenAktivni === true): number[] | null {
  if (v.bezVolajiciho) return [];
  switch (v.druh) {
    case 'ja':
      return [ja];
    case 'tym':
      return clenoveTymu(v.tymId ?? ja, lide, jenAktivni);
    case 'vsichni':
      return jenAktivni ? vzestupne(lide.filter((c) => c.active).map((c) => c.id)) : null;
    default:
      return vzestupne(v.ids);
  }
}

/** „1 člověk“, „3 lidé“, „5 lidí“. */
export function pocetLidi(n: number): string {
  if (n === 1) return '1 člověk';
  return n >= 2 && n <= 4 ? `${n} lidé` : `${n} lidí`;
}

/**
 * Text tlačítka a čipu (spec §7.3): „Všichni (14)“, „Všichni aktivní (13)“, „Můj tým (3)“, „Tým Mikuláš (5)“, „VeraP + VeraB“
 * (jména v pořadí seznamu lidí), „Já“, „Eda“, „3 lidé“, „5 lidí“, „Bez volajícího“.
 */
export function shrnutiVyberu(v: Vyber, lide: readonly Clovek[], ja: number): string {
  if (v.bezVolajiciho) return 'Bez volajícího';
  const ids = rozbalVyber(v, lide, ja);
  if (v.druh === 'ja') return 'Já';
  if (v.druh === 'vsichni') {
    if (ids === null) return lide.length > 0 ? `Všichni (${lide.length})` : 'Všichni';
    return `Všichni aktivní (${ids.length})`;
  }
  const n = ids?.length ?? 0;
  if (v.druh === 'tym') {
    const tym = v.tymId ?? ja;
    return `${tym === ja ? 'Můj tým' : nazevTymu(tym, lide)} (${n})`;
  }
  const jmeno = (id: number) => (id === ja ? 'Já' : (lide.find((c) => c.id === id)?.display_name ?? `#${id}`));
  if (n === 0) return 'Nikdo';
  if (n === 1) return jmeno(ids![0]);
  // dva lidé jménem v pořadí, v jakém je člověk zaškrtl („VeraP + VeraB“)
  if (n === 2) return bezDuplicit(v.ids).map(jmeno).join(' + ');
  return pocetLidi(n);
}

/** Id bez duplicit a null v původním pořadí (pořadí zaškrtnutí; serveru jde vzestupně, rozbalVyber). */
function bezDuplicit(ids: readonly (number | null | undefined)[]): number[] {
  return [...new Set(ids.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)))];
}

/** Skupina v panelu: tým (super admin a jeho lidé) nebo lidé bez týmu (id null). */
export interface SkupinaLidi {
  id: number | null;
  nazev: string;
  mujTym: boolean;
  clenove: Clovek[];
}

/**
 * Skupiny panelu: Můj tým napřed, další týmy podle jména vedoucího, nakonec „Bez týmu“ (lidé, jejichž manager_id není super
 * admin). V týmu vedoucí napřed, pak podle jména (česky).
 */
export function skupinyLidi(lide: readonly Clovek[], ja: number): SkupinaLidi[] {
  const jmeno = (a: Clovek, b: Clovek) => a.display_name.localeCompare(b.display_name, 'cs') || a.id - b.id;
  const vedouci = lide.filter(jeSuperAdmin);
  const tymy: SkupinaLidi[] = vedouci
    .map((v) => ({
      id: v.id,
      nazev: v.id === ja ? 'Můj tým' : `Tým ${v.display_name}`,
      mujTym: v.id === ja,
      clenove: [v, ...lide.filter((c) => c.manager_id === v.id && c.id !== v.id).sort(jmeno)],
    }))
    .sort((a, b) => Number(b.mujTym) - Number(a.mujTym) || jmeno(a.clenove[0], b.clenove[0]));
  const vTymu = new Set(tymy.flatMap((t) => t.clenove.map((c) => c.id)));
  const bez = lide.filter((c) => !vTymu.has(c.id)).sort(jmeno);
  return bez.length > 0 ? [...tymy, { id: null, nazev: 'Bez týmu', mujTym: false, clenove: bez }] : tymy;
}

/**
 * Výběr ze zaškrtnutých lidí (v pořadí zaškrtnutí): jen já = Já; dva a víc lidí, kteří jsou celý tým (s ohledem na „jen
 * aktivní“) = ten tým (můj napřed); jinak vybraní lidé. Všichni ze zaškrtnutí nikdy nevzniknou: Všichni je bez filtru lidí,
 * zaškrtnutí lidé ne.
 */
export function vyberZIds(ids: readonly number[], lide: readonly Clovek[], ja: number, jenAktivni = false): Vyber {
  const poradi = bezDuplicit(ids);
  const mnozina = vzestupne(poradi);
  const s = jenAktivni ? { jenAktivni: true } : {};
  if (mnozina.length === 1 && mnozina[0] === ja) return { druh: 'ja', ids: [], ...s };
  if (mnozina.length >= 2) {
    for (const t of skupinyLidi(lide, ja)) {
      if (t.id === null) continue;
      const clenove = clenoveTymu(t.id, lide, jenAktivni);
      if (clenove.length === mnozina.length && clenove.every((x, i) => x === mnozina[i])) return { druh: 'tym', tymId: t.id, ids: [], ...s };
    }
  }
  return { druh: 'vybrani', ids: poradi, ...s };
}

/** Stejný výběr? Pořadí id nerozhoduje; „jen aktivní“ jen u předvoleb, kde mění rozsah (tým, Všichni). */
export function stejnyVyber(a: Vyber, b: Vyber): boolean {
  if (!!a.bezVolajiciho !== !!b.bezVolajiciho) return false;
  if (a.bezVolajiciho) return true;
  if (a.druh !== b.druh) return false;
  if (a.druh === 'tym' && a.tymId !== b.tymId) return false;
  if ((a.druh === 'tym' || a.druh === 'vsichni') && !!a.jenAktivni !== !!b.jenAktivni) return false;
  if (a.druh === 'vybrani') {
    const x = vzestupne(a.ids);
    const y = vzestupne(b.ids);
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  return true;
}

/**
 * Co jde serveru (kontrakt §6): `vsichni` = dnešní volání bez filtru lidí, `ja` = dnešní volání sebe (i výběr, ve kterém
 * jsem jen já), `lide` = p_user_ids (074), `bez` = Označené „bez volajícího“. Prázdný výběr panel nedovolí; kdyby přišel,
 * znamená sebe (server bere [] jako „bez filtru“, to by ukázalo všechny).
 */
export type LideDotaz = { druh: 'vsichni' } | { druh: 'ja' } | { druh: 'lide'; ids: number[] } | { druh: 'bez' };

export function lideDotaz(v: Vyber, lide: readonly Clovek[], ja: number): LideDotaz {
  if (v.bezVolajiciho) return { druh: 'bez' };
  const ids = rozbalVyber(v, lide, ja);
  if (ids === null) return { druh: 'vsichni' };
  if (ids.length === 0 || (ids.length === 1 && ids[0] === ja)) return { druh: 'ja' };
  return { druh: 'lide', ids };
}

/**
 * Volání s výběrem lidí: `nove` (u dotazu `lide` s p_user_ids). Server bez migrace 074 (supabase.ts hodí BEZ_074_LIDE na
 * PGRST202): jeden vybraný člověk = znovu dnešním voláním jednoho člověka (`jeden`), víc lidí = ta hláška. Jiné chyby
 * projdou beze změny; dotazy bez výběru (Já, Všichni, Bez volajícího) jdou rovnou.
 */
export async function sLidmi<T>(d: LideDotaz, nove: () => Promise<T>, jeden: (id: number) => Promise<T>): Promise<T> {
  if (d.druh !== 'lide') return nove();
  try {
    return await nove();
  } catch (e) {
    if (d.ids.length === 1 && e instanceof Error && e.message === BEZ_074_LIDE) return jeden(d.ids[0]);
    throw e;
  }
}

const bezHacku = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Hledání v panelu: jméno bez ohledu na diakritiku a velikost písmen; prázdný text = každý. */
export function hledaniSedi(c: Clovek, text: string): boolean {
  const q = bezHacku(text.trim());
  return q === '' || bezHacku(c.display_name).includes(q);
}
