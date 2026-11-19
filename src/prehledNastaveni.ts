// NASTAVENÍ PŘEHLEDU BEZ REACTU (Přehled vedení úkol 14b, Albert 17. 11. 2026, D6, D9 a D10; spec
// docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md §3.4 až §3.6 a §7.2, kontrakt
// docs/superpowers/specs/2026-11-17-prehled-kontrakt.md §3.5, §3.6, §4.3 až §4.5, R6 a R7). Registry kontraktu s českými
// názvy, převod polí formuláře na vstup serveru (částka „1 234,50“ → „1234.50“, prázdné datum = null), kdo komu smí zadat cíl
// a výplatu podle prehled_moznosti (server rozhoduje sám, appka jen nenabízí, co by odmítl), texty řádků (období VČETNĚ
// posledního dne, hodnota cíle v jeho jednotce) a které pole formuláře chyba serveru myslí (aria-invalid u toho pole).

import type { Cil, DataMoznosti, KategorieNakladu, MenaPrehledu, MetrikaCile, OpakovaniNakladu, OsobaMoznosti } from './api/types';
import { isSuperAdmin } from './roles';
import { denText, formatCastka, formatHodiny } from './prehled';

/** Kategorie evidence nákladů (§3.5) v pořadí registru; provize jen ve výpočtu Financí, sem nepatří. */
export const KATEGORIE_NAKLADU: { klic: KategorieNakladu; nazev: string }[] = [
  { klic: 'claude', nazev: 'Claude (předplatné)' },
  { klic: 'lovable', nazev: 'Lovable (předplatné)' },
  { klic: 'domena', nazev: 'Domény' },
  { klic: 'hosting', nazev: 'Hosting (náš náklad)' },
  { klic: 'jine', nazev: 'Jiné' },
];
/** Opakování nákladu (§3.5); zaúčtování do období §2.12. */
export const OPAKOVANI_NAKLADU: { klic: OpakovaniNakladu; nazev: string }[] = [
  { klic: 'jednorazove', nazev: 'Jednorázově' },
  { klic: 'mesicne', nazev: 'Měsíčně' },
  { klic: 'rocne', nazev: 'Ročně' },
];
/** Metriky cíle (§3.6): v měně (hodnota prodejů a inkaso) a celé číslo (počty). */
export const METRIKY_CILU: { klic: MetrikaCile; nazev: string; vMene: boolean; celeCislo: boolean }[] = [
  { klic: 'prodane_weby', nazev: 'Prodané weby', vMene: false, celeCislo: true },
  { klic: 'hodnota_prodeju', nazev: 'Hodnota prodejů', vMene: true, celeCislo: false },
  { klic: 'inkaso', nazev: 'Inkaso', vMene: true, celeCislo: false },
  { klic: 'hovory', nazev: 'Hovory', vMene: false, celeCislo: true },
  { klic: 'zajem', nazev: 'Hovory se zájmem', vMene: false, celeCislo: true },
  { klic: 'odpracovane_hodiny', nazev: 'Odpracované hodiny', vMene: false, celeCislo: false },
];
export const MENY: MenaPrehledu[] = ['CZK', 'EUR'];

export const nazevKategorie = (k: string): string => KATEGORIE_NAKLADU.find((x) => x.klic === k)?.nazev ?? k;
export const nazevOpakovani = (o: string): string => OPAKOVANI_NAKLADU.find((x) => x.klic === o)?.nazev ?? o;
export const metrikaCile = (m: string) => METRIKY_CILU.find((x) => x.klic === m) ?? null;

/**
 * Částka z pole formuláře pro server: mezery (i pevné, jak je píše cs-CZ) pryč a desetinná čárka na tečku, když z toho vyjde
 * číslo; jinak text, jak je (server ho odmítne svou větou, appka nemá druhou sadu hlášek).
 */
export function castkaProServer(text: string): string {
  const t = text.trim();
  const cislo = t.replace(/[\s  ]/g, '').replace(',', '.');
  return /^\d+(\.\d+)?$/.test(cislo) ? cislo : t;
}
/** Částka ze serveru („50000.00“) do pole formuláře: bez nulových haléřů, desetinná čárka („30,5“). */
export function castkaDoPole(hodnota: string): string {
  const n = Number(hodnota);
  if (!Number.isFinite(n)) return hodnota;
  return String(n).replace('.', ',');
}
/** Prázdné pole data = null (server: chybí = null). */
export const datumNeboNull = (v: string): string | null => (v.trim() === '' ? null : v.trim());

/** Výchozí období nového cíle: celý měsíc dne (poslední den VČETNĚ, R6). */
export function mesicDne(den: string): { od: string; do: string } {
  const [y, m] = den.split('-').map(Number);
  const posledni = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { od: `${den.slice(0, 7)}-01`, do: `${den.slice(0, 7)}-${String(posledni).padStart(2, '0')}` };
}

/** Období včetně posledního dne (R6): „1. 11. 2026 – 30. 11. 2026“, „od 1. 11. 2026“, jeden den jednou, nic = „—“. */
export function obdobiText(od: string | null, doDne: string | null): string {
  if (od && doDne) return od === doDne ? denText(od) : `${denText(od)} – ${denText(doDne)}`;
  if (od) return `od ${denText(od)}`;
  if (doDne) return `do ${denText(doDne)}`;
  return '—';
}

/** Kdo cíl má: Celá firma, tým („Tým Mikuláš“), nebo člověk. */
export function rozsahCile(c: Pick<Cil, 'user_id' | 'user_jmeno' | 'tym_id' | 'tym_jmeno'>): string {
  if (c.user_id !== null) return c.user_jmeno ?? `#${c.user_id}`;
  if (c.tym_id !== null) return c.tym_jmeno ?? `Tým #${c.tym_id}`;
  return 'Celá firma';
}

/**
 * Proč je cíl jen ke čtení: věta serveru 072 (odmítnutí cile_uloz a cile_zrus) podle rozsahu; cíl firmy zadává jen Albert
 * (recenze 14b, drobnost 5, ⚠ NAHRAZUJE jednu větu „Tenhle cíl mění jen jeho super admin nebo Albert.“ i u cíle firmy).
 */
export function procJenKCteniCile(c: { user_id: number | null; tym_id: number | null }): string {
  if (c.user_id !== null) return 'Cíl pro tohoto člověka zadává jen jeho super admin nebo Albert.';
  if (c.tym_id !== null) return 'Cíl pro tento tým zadává jen jeho super admin nebo Albert.';
  return 'Cíl pro celou firmu zadává jen Albert.';
}

/** Hodnota cíle v jeho jednotce: peníze v měně cíle, počty celé, hodiny s „h“. */
export function textHodnotyCile(c: Pick<Cil, 'metrika' | 'hodnota' | 'mena'>): string {
  const m = metrikaCile(c.metrika);
  if (m?.vMene) return formatCastka(c.hodnota, c.mena);
  if (c.metrika === 'odpracovane_hodiny') return formatHodiny(Number(c.hodnota));
  return formatCastka(c.hodnota, null);
}

/** Volba „Pro koho“ cíle: hodnota do selectu („firma“, „tym:4“, „osoba:3“). */
export interface VolbaRozsahu {
  hodnota: string;
  nazev: string;
  skupina: 'firma' | 'tym' | 'osoba';
}
/**
 * Komu smí přihlášený zadat cíl (D9, prehled_moznosti): celé firmě jen Albert (firma_smim_cil), týmům se smim_cil (svůj tým,
 * Albert každý) a lidem se smim_cil (on sám, jeho lidé, Albert každého), v pořadí možností.
 */
export function volbyRozsahuCile(m: Pick<DataMoznosti, 'firma_smim_cil' | 'tymy' | 'lide'>): VolbaRozsahu[] {
  return [
    ...(m.firma_smim_cil ? [{ hodnota: 'firma', nazev: 'Celá firma', skupina: 'firma' as const }] : []),
    ...m.tymy.filter((t) => t.smim_cil).map((t) => ({ hodnota: `tym:${t.id}`, nazev: t.nazev, skupina: 'tym' as const })),
    ...m.lide.filter((l) => l.smim_cil).map((l) => ({ hodnota: `osoba:${l.id}`, nazev: jmenoOsoby(l), skupina: 'osoba' as const })),
  ];
}
/** Jméno člověka do výběru (neaktivní označený). */
export const jmenoOsoby = (l: Pick<OsobaMoznosti, 'display_name' | 'active'>): string => (l.active ? l.display_name : `${l.display_name} (neaktivní)`);
export function rozsahZVolby(v: string): { user_id: number | null; tym_id: number | null } {
  const m = /^(tym|osoba):(\d+)$/.exec(v);
  if (!m) return { user_id: null, tym_id: null };
  return m[1] === 'tym' ? { user_id: null, tym_id: Number(m[2]) } : { user_id: Number(m[2]), tym_id: null };
}
export function volbaZRozsahu(c: { user_id: number | null; tym_id: number | null }): string {
  if (c.user_id !== null) return `osoba:${c.user_id}`;
  if (c.tym_id !== null) return `tym:${c.tym_id}`;
  return 'firma';
}

/** Komu smí přihlášený zapsat výplatu provize (D10, smim_vyplatu: jeho tým, Albert každého), v pořadí možností. */
export const lideProVyplatu = (m: Pick<DataMoznosti, 'lide'>): OsobaMoznosti[] => m.lide.filter((l) => l.smim_vyplatu);
/**
 * Výchozí příjemce nové výplaty: první Volající (role admin, i stará caller, tedy ne super admin; výplata jde obvykle volajícímu),
 * jinak první ze seznamu, prázdný seznam 0. ⚠ Úkol 14c (kontrola pravidel 49 b: role přes isSuperAdmin, ne přímým porovnáním s klíčem admin).
 */
export const vychoziPrijemceVyplaty = (lide: readonly Pick<OsobaMoznosti, 'id' | 'role'>[]): number => (lide.find((l) => !isSuperAdmin(l.role)) ?? lide[0])?.id ?? 0;
/** Smí přihlášený změnit a zrušit uloženou výplatu (právo na uloženého příjemce, jako server)? */
export const smiVyplatu = (m: Pick<DataMoznosti, 'lide'>, userId: number): boolean => m.lide.some((l) => l.id === userId && l.smim_vyplatu);

export type FormularNastaveni = 'naklad' | 'cil' | 'vyplata';
/**
 * Pole formuláře, které věta serveru myslí (aria-invalid a odkaz na větu u něj), podle znění kontraktu §4.3b, §4.4b a §4.5b;
 * věta bez pole (duplikát cíle, zrušený řádek, síť) = null. Pole: kategorie, castka, hodnota, mena, opakovani, plati_od,
 * plati_do, popis, kontakt_id, metrika, obdobi_od, obdobi_do, rozsah, user_id, vyplaceno_dne, za_obdobi_od, za_obdobi_do, poznamka.
 */
export function poleChyby(text: string | null, formular: FormularNastaveni): string | null {
  if (!text) return null;
  const datum = /^Neplatné datum v poli ([a-z_]+):/.exec(text);
  if (datum) return datum[1];
  const PRAVIDLA: [RegExp, string][] = [
    [/^Neplatná kategorie nákladu/, 'kategorie'],
    [/^Částka (nákladu|výplaty) musí být/, 'castka'],
    [/^Hodnota cíle musí být|^Cíl \S+ musí být celé číslo/, 'hodnota'],
    [/^Neplatná měna|je v penězích: zadejte měnu|se v měně nezadává/, 'mena'],
    [/^Neplatné opakování/, 'opakovani'],
    [/^Zadejte, od kterého dne náklad platí/, 'plati_od'],
    [/^Náklad nemůže skončit dřív|^Jednorázový náklad nemá konec/, 'plati_do'],
    [/^Popis nákladu je moc dlouhý/, 'popis'],
    [/^Kontakt id=/, 'kontakt_id'],
    [/^Neplatná metrika cíle/, 'metrika'],
    [/^Období cíle: konec/, 'obdobi_do'],
    [/^Zadejte, kdy byla provize vyplacena/, 'vyplaceno_dne'],
    [/^Období výplaty: konec/, 'za_obdobi_do'],
    [/^Poznámka k výplatě je moc dlouhá/, 'poznamka'],
    [/^Výplatu provize zapisuje jen/, 'user_id'],
  ];
  for (const [re, pole] of PRAVIDLA) if (re.test(text)) return pole;
  if (/^Uživatel id=/.test(text)) return formular === 'vyplata' ? 'user_id' : 'rozsah';
  if (formular === 'cil' && /^Cíl je buď pro člověka|^Tým id=|^Cíl pro (celou firmu|tohoto člověka|tento tým)/.test(text)) return 'rozsah';
  return null;
}
