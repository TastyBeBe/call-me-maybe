// Test parity appky s databází 073 a 074 (Přehled vedení, úkol 14c, 19. 11. 2026; brief .superpowers/sdd/task-14c-brief.md,
// kontrakt docs/superpowers/specs/2026-11-17-prehled-kontrakt.md §2, §5, §6, §7 a §9 s poznámkami „AMENDED 2026-11-19“,
// zdroj pravdy db/migration_073_prehled_funkce.sql a db/migration_074_lide_filtry.sql).
//
// Měří:
//  T)  typy src/api/types.ts jako §7 a reporting/openapi.yaml k a6202706 (tsc nad souborem s typovými tvrzeními): RadekProvize
//      user_id a volajici null, RadekKontakty prispevek a pravdepodobnost (povinné, null), SouhrnAkci.pripadu null, součty řádků
//      a vážené hodnoty prognózy s hodnotou null,
//  F)  dvě odmítnutí filtru (§2.7, app_prehled_filtr): „Neplatný filtr: od je v budoucnosti.“ a „Neplatný filtr: k_datu je před
//      začátkem období.“ v mocku (pořadí kontrol jako server) i ve filtru appky (věta u pole, adresa, uložený filtr),
//  P)  5a: most pipeline (znovu_otevrene z archivu i vyřazených), hosting ARR = Σ ročních cen a MRR = ARR ÷ 12, blokace k datu,
//      šablony a hodnocení webu k datu, faktury před začátkem plateb, ZDROJ_OD nabídek a výplat a jedno sloučené varování
//      ZDROJ_OD, bez_duvodu s HISTORIE_OD, řada nákladů před historií, NAKLADY_OVERIT podle zaúčtování v období a k datu,
//      věty financí doslova jako 073, zdroje meta.zdroje k datu, metriky hovorů lidí castecne před prvním hovorem,
//  Q)  5b: akční seznam nejvýš 50 případů (souhrn všechny), pripadu null k datu, Nepřiřazeno bez pracovních úseků, řádky doby do
//      zavolání po kontaktech a vlastníkovi, příspěvky prognózy (řádky = karta, příklad §5.11 1 520 700.00 / 27 400.00), maska
//      volných textů a české texty časové osy, prázdný seznam neznámého stavu se součty null,
//  L)  074 na pěti seznamech: sjednocení, Volající jen [sebe], výběr zadaný dvakrát (věty doslova jako 074),
//  K)  kontrola pravidel 49 b: appka netestuje roli postaru (výchozí příjemce výplaty přes isSuperAdmin).
// Nikdy nesahá na síť ani živou DB. Spuštění: node tests/prehledparita.test.mjs (APP_ROOT=/cesta/ke/kopii pro mutace).
// Výsledek „ALL OK (N kontrol)“ nebo řádky „FAIL <id>: …“ a kód 1.

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(process.env.APP_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..'));

const uloziste = new Map();
globalThis.localStorage = {
  getItem: (k) => (uloziste.has(k) ? uloziste.get(k) : null),
  setItem: (k, v) => uloziste.set(k, String(v)),
  removeItem: (k) => uloziste.delete(k),
  get length() { return uloziste.size; },
  key: (i) => [...uloziste.keys()][i] ?? null,
};
const puvodniTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, _ms, ...a) => puvodniTimeout(fn, 0, ...a);
globalThis.__volackaDemoTest = {};

let pocet = 0;
let chyby = 0;
function over(id, podminka, text, detail = '') {
  pocet += 1;
  if (!podminka) {
    chyby += 1;
    console.log(`FAIL ${id}: ${text}${detail ? ` (${detail})` : ''}`);
  }
}
async function blok(id, fn) {
  try {
    await fn();
  } catch (e) {
    over(id, false, 'blok testu spadl na nečekané chybě', String(e && e.stack).split('\n').slice(0, 4).join(' | '));
  }
}
/** Čeká chybu s DŮVODEM (přesná věta), ne jen jakoukoli chybu. */
async function chyba(id, fn, veta, text) {
  try {
    await fn();
    over(id, false, text, 'prošlo, mělo selhat');
  } catch (e) {
    over(id, e?.message === veta, text, `hláška: ${e?.message}`);
  }
}
async function projde(id, fn, text) {
  try {
    await fn();
    over(id, true, text);
  } catch (e) {
    over(id, false, text, `hláška: ${e?.message}`);
  }
}
const stejne = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const text = (html) => String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;| | /g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

async function balicek(radky) {
  const out = await build({
    stdin: { contents: radky.join('\n'), resolveDir: ROOT, loader: 'tsx' },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    define: { 'import.meta.env.BASE_URL': '"/"', 'process.env.NODE_ENV': '"production"' },
  });
  const dir = mkdtempSync(join(tmpdir(), 'prehled-parita-'));
  const f = join(dir, 'b.cjs');
  writeFileSync(f, out.outputFiles[0].text);
  try {
    return createRequire(import.meta.url)(f);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ---- čas a české texty jako 073 (app_prehled_den_text, app_prehled_ze, app_prehled_z_n, šablony varování) ---- */
const denPraha = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const posunD = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
/** Začátek pražského dne jako okamžik (ms). */
function zacatekDne(den) {
  const [y, m, d] = den.split('-').map(Number);
  for (const h of [-2, -1, 0]) {
    const t = Date.UTC(y, m - 1, d, h, 0, 0);
    if (denPraha(t) === den && denPraha(t - 1) !== den) return t;
  }
  // DST: hledání po minutách v okolí půlnoci
  let t = Date.UTC(y, m - 1, d, -3, 0, 0);
  while (denPraha(t) !== den) t += 60000;
  return t;
}
const denText = (t) => { const [y, m, d] = denPraha(t).split('-').map(Number); return `${d}. ${m}. ${y}`; };
/** app_prehled_ze: předložka z/ze podle výslovnosti čísla. */
function ze(p) {
  let n = Math.abs(Math.trunc(p ?? 0));
  for (;;) {
    if (n >= 1000000) { if (Math.floor(n / 1000000) === 1) return 'z'; n = Math.floor(n / 1000000); }
    else if (n >= 1000) { if (Math.floor(n / 1000) === 1) return 'z'; n = Math.floor(n / 1000); }
    else break;
  }
  if (n >= 100) return [5, 8, 9].includes(Math.floor(n / 100)) ? 'z' : 'ze';
  if (n >= 20) return [5, 8, 9].includes(Math.floor(n / 10)) ? 'z' : 'ze';
  return [2, 3, 4, 6, 7, 12, 13, 14, 16, 17].includes(n) ? 'ze' : 'z';
}
const zN = (a, b, j1, j2) => `${a} ${ze(b)} ${b} ${b === 1 ? j1 : j2}`;
const zdrojOd = (nazev, iso) => `Zdroj „${nazev}“ se eviduje od ${denText(iso)}; dřívější data nejsou známá.`;
const historieOd = (iso) => `Historie změn stavů a cen začíná ${denText(iso)}; dřívější průchody fázemi nejsou známé.`;
/** app_prehled_bez_kontaktu (R20). */
const maska = (s) => String(s).replace(/[^\s@<>()]+@[^\s@<>()]+/g, '[e-mail]').replace(/\+?\d(?:[\s./-]?\d){8,}/g, '[telefon]');
const castka2 = (n) => (Math.round(n * 100) / 100).toFixed(2);

const DNES = denPraha(Date.now());
const OD_MESIC = `${DNES.slice(0, 8)}01`;
const DO_MESIC = posunD(`${posunD(`${DNES.slice(0, 8)}28`, 4).slice(0, 8)}01`, -1);
const ZITRA = posunD(DNES, 1);
const DALSI_MESIC = `${posunD(`${DNES.slice(0, 8)}28`, 4).slice(0, 8)}15`;
const OD0 = new Date(zacatekDne(DNES)).toISOString();
const ODB = 'Neplatný filtr: od je v budoucnosti.';
const KPRED = 'Neplatný filtr: k_datu je před začátkem období.';
const T = 'demo-1-x';

// každý kus zvlášť, ať RED ukáže, co přesně chybí
let F = null;
try {
  F = await balicek(["export * from './src/prehledFiltr.ts';"]);
} catch (e) {
  over('F0a', false, 'src/prehledFiltr.ts nejde sestavit', String(e.message).split('\n')[0]);
}
let N = null;
try {
  N = await balicek(["export * from './src/prehledNastaveni.ts';"]);
} catch (e) {
  over('K0', false, 'src/prehledNastaveni.ts nejde sestavit', String(e.message).split('\n')[0]);
}
let U = null;
try {
  U = await balicek([
    "export { default as RadaFiltru } from './src/components/prehled/FiltrPrehledu.tsx';",
    "export { MemoryRouter } from 'react-router-dom';",
    "export { renderToStaticMarkup } from 'react-dom/server';",
    "export { createElement } from 'react';",
  ]);
} catch (e) {
  over('F0b', false, 'řada filtrů Přehledu (FiltrPrehledu.tsx) nejde vykreslit samostatně', String(e.message).split('\n').slice(0, 2).join(' | '));
}
// mock jako poslední balíček: háček __volackaDemoTest patří k instanci API.mockApi
let API = null;
try {
  API = await balicek(["export * from './src/api/mock.ts';"]);
} catch (e) {
  over('M0', false, 'mock nejde sestavit', String(e.message).split('\n')[0]);
}
const hacek = globalThis.__volackaDemoTest;
const demo = () => (typeof hacek.prehledDemo === 'function' ? hacek.prehledDemo() : null);

/* ---------------- T) typy jako §7 a openapi (a6202706) ---------------- */
await blok('T', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prehled-parita-typy-'));
  const f = join(dir, 'typy.ts');
  const typy = join(ROOT, 'src/api/types.ts').replace(/\\/g, '/');
  writeFileSync(f, `import type { RadekProvize, RadekKontakty, DataAkce, DataRadky, DataPrognoza } from '${typy}';
type Povinny<T, K extends keyof T> = {} extends Pick<T, K> ? false : true;
type MaNull<T> = null extends T ? true : false;
export const t1: MaNull<RadekProvize['user_id']> = true;
export const t2: MaNull<RadekProvize['volajici']> = true;
export const t3: Povinny<RadekKontakty, 'prispevek'> = true;
export const t4: MaNull<RadekKontakty['prispevek']> = true;
export const t5: Povinny<RadekKontakty, 'pravdepodobnost'> = true;
export const t6: MaNull<RadekKontakty['pravdepodobnost']> = true;
export const t7: MaNull<DataAkce['souhrn']['pripadu']> = true;
export const t8: MaNull<DataRadky['soucty'][number]['hodnota']> = true;
export const t9: MaNull<DataPrognoza['otevrene'][number]['vazene'][number]['hodnota']> = true;
export const t10: MaNull<DataPrognoza['otevrene'][number]['pravdepodobnost']['hodnota']> = true;
export const t11: NonNullable<RadekKontakty['prispevek']> = { mena: 'CZK', hodnota: '27400.00' };
export const t12: RadekKontakty['pravdepodobnost'] = 0.018018;
`);
  let vystup = '';
  let ok = true;
  try {
    execFileSync(process.execPath, [join(ROOT, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--target', 'ES2020', '--module', 'ESNext',
      '--moduleResolution', 'bundler', '--allowImportingTsExtensions', '--skipLibCheck', '--lib', 'ES2020,DOM', '--jsx', 'react-jsx', f], { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    ok = false;
    vystup = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  over('T1', ok, 'typy jako §7 a openapi k a6202706: RadekProvize user_id a volajici null, RadekKontakty prispevek a pravdepodobnost povinné a null, SouhrnAkci.pripadu null, součty a vážené s hodnotou null',
    vystup.split('\n').filter((r) => /error TS/.test(r)).map((r) => r.replace(/^.*typy\.ts/, 'typy.ts')).slice(0, 8).join(' | '));
  const t = src('src/api/types.ts');
  over('T2', /skupina prognózy/.test(t) && /nejvýš 50/.test(t) && /bez telefonu a e-mailu/.test(t),
    'komentáře typů jako openapi: vyber.krok i skupina prognózy, pripady nejvýš 50, maskované texty (R20)', '');
});

/* ---------------- F) odmítnutí filtru (§2.7) v mocku a ve filtru appky ---------------- */
await blok('F', async () => {
  if (!API) return;
  const api = API.mockApi;
  await chyba('F1a', () => api.prehledSouhrn(T, { od: ZITRA, do: ZITRA }), ODB, 'od zítra: „Neplatný filtr: od je v budoucnosti.“');
  await chyba('F1b', () => api.prehledSouhrn(T, { do: DALSI_MESIC }), ODB, 'jen do v příštím měsíci: výchozí od (jeho první den) je v budoucnosti');
  await chyba('F1c', () => api.prehledSouhrn(T, { od: ZITRA }), ODB, 'od v budoucnosti se kontroluje před do < od (do = dnes)');
  await chyba('F1d', () => api.prehledSouhrn(T, { do: '2019-12-31' }), 'Neplatný filtr: do', 'od před 2020 jen z výchozí hodnoty: hláška jmenuje do (p bez od)');
  await chyba('F1e', () => api.prehledSouhrn(T, { od: '2019-12-31', do: '2020-01-05' }), 'Neplatný filtr: od', 'od před 2020: Neplatný filtr: od');
  await chyba('F1f', () => api.prehledSouhrn(T, { od: ZITRA, lide: [999999] }), ODB, 'od v budoucnosti dřív než lide');
  await chyba('F1g', () => api.prehledSouhrn(T, { atribuce: 'x', k_datu: '2999-01-01T00:00:00.000Z' }), 'Neplatný filtr: atribuce', 'pořadí jako server: atribuce dřív než k_datu');
  await chyba('F1h', () => api.prehledSouhrn(T, { mena: 'USD', k_datu: new Date(zacatekDne(DNES) - 1).toISOString(), od: DNES, do: DNES }), 'Neplatný filtr: mena', 'pořadí jako server: měna dřív než k_datu');
  await chyba('F2a', () => api.prehledSouhrn(T, { od: DNES, do: DNES, k_datu: new Date(zacatekDne(DNES) - 1).toISOString() }), KPRED,
    'k_datu o milisekundu před od 00:00 (Praha): „Neplatný filtr: k_datu je před začátkem období.“');
  await projde('F2b', () => api.prehledSouhrn(T, { od: DNES, do: DNES, k_datu: OD0 }), 'k_datu přesně od 00:00 (Praha) projde');
  await chyba('F2c', () => api.prehledSouhrn(T, { od: DNES, do: DNES, k_datu: new Date(zacatekDne(DNES) - 1).toISOString(), vyber: { metrika: 'hovory' } }), KPRED,
    'k_datu před začátkem období dřív než vyber mimo prehled_radky');
  // každá funkce s filtrem odmítnutí dědí (§9 5a bod 0)
  const kPred = { od: DNES, do: DNES, k_datu: new Date(zacatekDne(DNES) - 1).toISOString() };
  const fn = {
    souhrn: (f) => api.prehledSouhrn(T, f), rada: (f) => api.prehledRada(T, 'hovory', 'den', f), trychtyr: (f) => api.prehledTrychtyr(T, f),
    lide: (f) => api.prehledLide(T, f), pipeline: (f) => api.prehledPipeline(T, f), klienti: (f) => api.prehledKlienti(T, f),
    komunikace: (f) => api.prehledKomunikace(T, f), finance: (f) => api.prehledFinance(T, f), dodani: (f) => api.prehledDodani(T, f),
    prognoza: (f) => api.prehledPrognoza(T, f), akce: (f) => api.prehledAkce(T, f), radky: (f) => api.prehledRadky(T, 'kontakty', f),
  };
  const spatne = [];
  for (const [k, f] of Object.entries(fn)) {
    for (const [filtr, veta] of [[kPred, KPRED], [{ od: ZITRA, do: ZITRA }, ODB]]) {
      try { await f(filtr); spatne.push(`${k}: prošlo`); } catch (e) { if (e?.message !== veta) spatne.push(`${k}: ${e?.message}`); }
    }
  }
  over('F3', spatne.length === 0, 'obě odmítnutí ve všech 12 funkcích s p_filtr (souhrn až řádky)', spatne.join(' | '));
  await chyba('F4', () => api.prehledRada(T, 'xx', 'den', { od: ZITRA, do: ZITRA }), ODB, 'řada: filtr dřív než metrika (pořadí serveru)');
});

await blok('FU', async () => {
  if (!F) return;
  const d = '2026-11-19';
  over('FU1', F.chybaObdobi('2026-11-20', '2026-11-25', d) === ODB && F.chybaObdobi('2026-11-20', '2026-11-10', d) === ODB
    && F.chybaObdobi('2026-11-01', '2026-11-30', d) === null && F.chybaObdobi('2026-11-19', '2026-11-19', d) === null
    && F.chybaObdobi('2026-11-20', '2026-11-10') === 'Začátek období je po jeho konci.',
    'vlastní období: od po dnešku = věta serveru „Neplatný filtr: od je v budoucnosti.“ (dřív než obrácené období); bez dneška jako dřív',
    JSON.stringify([F.chybaObdobi('2026-11-20', '2026-11-25', d), F.chybaObdobi('2026-11-20', '2026-11-10', d)]));
  over('FU2', F.chybaObdobi('2026-11-10', '2026-11-30', d, '2026-11-09T22:59:59.000Z') === KPRED
    && F.chybaObdobi('2026-11-05', '2026-11-30', d, '2026-11-04T23:00:00.000Z') === null && F.chybaObdobi('2026-11-05', '2026-11-30', d, null) === null,
    'vlastní období se zadaným k datu: začátek po k datu = věta serveru „Neplatný filtr: k_datu je před začátkem období.“; přesně od 0:00 projde',
    String(F.chybaObdobi('2026-11-10', '2026-11-30', d, '2026-11-09T22:59:59.000Z')));
  over('FU3', F.chybaKDatu('2026-11-04', d, '2026-11-05') === KPRED && F.chybaKDatu('2026-11-05', d, '2026-11-05') === null
    && F.chybaKDatu('2026-11-04', d) === null && F.chybaKDatu('2026-11-20', d, '2026-11-01') === 'K datu nemůže být v budoucnosti.',
    'k datu před začátkem období = věta serveru; den začátku období projde; bez období jako dřív', String(F.chybaKDatu('2026-11-04', d, '2026-11-05')));
  const zak = { od: '2026-11-19', do: '2026-11-19', lide: null, tym: null, segment: [], obor: [], kraj: [], mena: 'CZK', zaklad: 'prirozeny', atribuce: 'posledni_zajem' };
  over('FU4', typeof F.chybaFiltru === 'function' && F.chybaFiltru({ ...zak, k: '2026-11-18T22:59:59.000Z' }, d) === KPRED
    && F.chybaFiltru({ ...zak, k: null }, d) === null && F.chybaFiltru({ ...zak, k: '2026-11-18T23:00:00.000Z' }, d) === null,
    'uložený filtr (předvolba po zadaném k datu): věta serveru „k_datu je před začátkem období“, jinak nic', '');
  const c = F.ctiFiltr('od=2026-11-25&do=2026-11-30', d);
  over('FU5', c.od === '2026-11-01' && c.do === '2026-11-30', 'adresa s období od zítřka = výchozí období (jako ostatní období mimo pravidla serveru)', JSON.stringify([c.od, c.do]));
  if (!U) return;
  const h = U.createElement;
  const moznosti = { ja: { user_id: 1, display_name: 'Albert', je_albert: true }, lide: [], tymy: [], firma_smim_cil: true, segmenty: [], obory: [], kraje: [],
    meny: ['CZK', 'EUR'], atribuce: [], zaklady: [], metriky: [], zdroje: [], cerstvost: { tick_at: null, posta_klienta_at: null, gmail: [], snimek_den: null, snimek_at: null } };
  const vykresli = (filtr) => U.renderToStaticMarkup(h(U.MemoryRouter, null, h(U.RadaFiltru, { filtr, onFiltr: () => {}, moznosti, ja: 1, dnes: d })));
  const html = vykresli({ ...zak, k: '2026-11-18T22:59:59.000Z' });
  const ok = vykresli({ ...zak, k: null });
  over('FU6', /role="alert"[^>]*>[^<]*Neplatný filtr: k_datu je před začátkem období\./.test(html) && !/Neplatný filtr/.test(ok),
    'řada filtrů: uložený filtr s k datu před začátkem období ukáže větu serveru u období (i když je „Další“ zavřené)', text(html).slice(0, 200));
});

/* ---------------- P) 5a ---------------- */
// změna stavu v demu jako zápis historie (kontakt_historie): stav i řádek historie, vrátí funkci na úklid
function zmenStav(D, c, novy, msZpet) {
  const zaznam = { kontakt_id: c.id, at: new Date(Date.now() - msZpet).toISOString(), stara: c.status, nova: novy };
  D.historieStavu.push(zaznam);
  const stary = c.status;
  c.status = novy;
  return () => {
    c.status = stary;
    const i = D.historieStavu.indexOf(zaznam);
    if (i >= 0) D.historieStavu.splice(i, 1);
  };
}

await blok('P1', async () => {
  if (!API) return;
  const api = API.mockApi;
  const D = demo();
  over('P1a', !!D && Array.isArray(D.historieStavu) && Array.isArray(D.kontakty), 'háček zkoušky prehledDemo(): kontakty, historie stavů a ukázkové tabulky Přehledu', String(!!D));
  if (!D) return;
  // období začínající před historií: most nedostupný s větou 073
  const predHist = posunD(DNES, -2);
  const pN = await api.prehledPipeline(T, { od: predHist, do: DNES });
  over('P1b', pN.data.pohyby.kvalita === 'nedostupne' && pN.data.pohyby.duvod === `Historie změn stavů začíná ${denText(D.historieOd)}; most pipeline je dostupný pro období od toho dne.`
    && pN.data.pohyby.nove === null && pN.data.pohyby.pocatek.n === null && stejne(pN.data.pohyby.zmena_hodnoty, []),
    'most pipeline před začátkem historie: nedostupne s větou 073 „Historie změn stavů začíná …; most pipeline je dostupný pro období od toho dne.“', pN.data.pohyby.duvod);
  // Dnes (historie začíná 30 h před demem, tedy před dnešní půlnocí): most se počítá
  const p0 = await api.prehledPipeline(T, { od: DNES, do: DNES });
  const m0 = p0.data.pohyby;
  over('P1c', m0.kvalita !== 'nedostupne' && m0.nove === 0 && m0.znovu_otevrene === 0 && m0.vyhrane === 0 && m0.ztracene === 0 && m0.vyrazene === 0 && m0.pruchozi === 0
    && m0.pocatek.n === m0.konec.n && m0.pocatek.n > 0,
    'most za Dnes bez změn stavu v období: všechno 0, začátek = konec', JSON.stringify({ k: m0.kvalita, d: m0.duvod, p: m0.pocatek.n, n: m0.konec.n }));
  // změny stavu dnes: znovu otevřený ze ztracených i z archivu nebo vyřazených (čtení 5a bod 8), nový z fronty, vyhraný, ztracený,
  // vyřazený a průchozí
  const pouzite = new Set();
  const vem = (stavy) => { const c = D.kontakty.find((k) => stavy.includes(k.status) && !pouzite.has(k.id) && !k.lock_by); if (c) pouzite.add(c.id); return c; };
  const ztraceny = vem(['odmitnuto']);
  const archiv = vem(['bez_odpovedi', 'nerelevantni', 'nekontaktovat']);
  const fronta = vem(['nekontaktovano', 'nedovolano']);
  const otevreny1 = vem(['navrh_odeslan', 'ceka_na_klienta', 'zajem']);
  const otevreny2 = vem(['navrh_odeslan', 'ceka_na_klienta', 'zajem', 'web_ve_vyrobe']);
  const otevreny3 = vem(['navrh_odeslan', 'ceka_na_klienta', 'zajem', 'web_ve_vyrobe', 'pozdeji']);
  const pruchozi = vem(['nekontaktovano', 'nedovolano']);
  const vse = [ztraceny, archiv, fronta, otevreny1, otevreny2, otevreny3, pruchozi];
  over('P1d', vse.every(Boolean), 'demo má kontakty pro scénář mostu (ztracený, archiv nebo vyřazený, fronta, tři otevření, průchozí)', JSON.stringify(vse.map((c) => c?.id)));
  if (!vse.every(Boolean)) return;
  const uklid = [
    zmenStav(D, ztraceny, 'zajem', 9000), zmenStav(D, archiv, 'navrh_odeslan', 9000), zmenStav(D, fronta, 'zajem', 9000),
    zmenStav(D, otevreny1, 'schvaleno', 9000), zmenStav(D, otevreny2, 'odmitnuto', 9000), zmenStav(D, otevreny3, 'nerelevantni', 9000),
    zmenStav(D, pruchozi, 'zajem', 8000), zmenStav(D, pruchozi, 'odmitnuto', 7000),
  ];
  try {
    const p1 = await api.prehledPipeline(T, { od: DNES, do: DNES });
    const m = p1.data.pohyby;
    over('P1e', m.nove === 1 && m.znovu_otevrene === 2 && m.vyhrane === 1 && m.ztracene === 1 && m.vyrazene === 1 && m.pruchozi === 1 && m.pocatek.n === m0.pocatek.n
      && m.konec.n === m.pocatek.n + m.nove + m.znovu_otevrene - m.vyhrane - m.ztracene - m.vyrazene,
      'most: znovu otevřený ze ztracených i z archivu nebo vyřazených (5a bod 8), nový z fronty, vyhraný, ztracený, vyřazený, průchozí; konec = začátek + nové + znovu − vyhrané − ztracené − vyřazené',
      JSON.stringify({ nove: m.nove, znovu: m.znovu_otevrene, vyhrane: m.vyhrane, ztracene: m.ztracene, vyrazene: m.vyrazene, pruchozi: m.pruchozi, p: m.pocatek.n, k: m.konec.n }));
    const hodnoty = (c) => Number(c?.hodnota ?? NaN);
    const czk = (pole) => pole.find((c) => c.mena === 'CZK');
    const most = hodnoty(czk(m.pocatek.castky)) + hodnoty(czk(m.prirustek_hodnoty)) + hodnoty(czk(m.zmena_hodnoty)) - hodnoty(czk(m.ubytek_hodnoty));
    over('P1f', Math.abs(most - hodnoty(czk(m.konec.castky))) < 0.005 || [czk(m.pocatek.castky), czk(m.prirustek_hodnoty), czk(m.zmena_hodnoty), czk(m.ubytek_hodnoty), czk(m.konec.castky)].some((c) => c?.hodnota === null),
      'most v hodnotě: konec = začátek + přírůstek + změna − úbytek (CZK)', JSON.stringify({ most, konec: czk(m.konec.castky) }));
    const r = await api.prehledRadky(T, 'kontakty', { od: DNES, do: DNES, vyber: { metrika: 'pohyby' } });
    over('P1g', r.data.celkem === m.pocatek.n + m.nove + m.znovu_otevrene, 'řádky mostu = kontakty otevřené na začátku nebo na konci (app_prehled_pohyby)', `${r.data.celkem} vs ${m.pocatek.n + m.nove + m.znovu_otevrene}`);
    const neznamych = [...new Set([...p1.data.faze.flatMap(() => [])])].length; // jen kontrola tvaru níž
    void neznamych;
    over('P1h', m.kvalita === 'dostupne' ? m.duvod === null : /^U \d+ ze? \d+ (klienta|klientů) není přesná cena; hodnoty mostu jsou jen ze známých cen\.$/.test(m.duvod ?? ''),
      'most s neznámou cenou: castecne „U a z n klientů není přesná cena; hodnoty mostu jsou jen ze známých cen.“', String(m.duvod));
  } finally {
    uklid.reverse().forEach((f) => f());
  }
});

await blok('P2', async () => {
  if (!API) return;
  const api = API.mockApi;
  const D = demo();
  if (!D) return;
  const PRODANO = ['schvaleno', 'faktura_odeslana', 'zaplaceno', 'domena_pripojena', 'hotovo'];
  const prodani = D.kontakty.filter((c) => PRODANO.includes(c.status));
  over('P2a', prodani.length >= 5, 'demo má aspoň 5 prodaných klientů pro hosting', String(prodani.length));
  if (prodani.length < 5) return;
  const zaloha = prodani.map((c) => c.cena_hosting);
  const ceny = ['1 500 Kč/rok', '1 000 Kč/rok', '1000 Kč', '190/měs'];
  prodani.forEach((c, i) => { c.cena_hosting = ceny[i] ?? null; });
  try {
    const f = await api.prehledFinance(T, null);
    const h = f.data.hosting;
    const cz = (m) => m.castky.find((c) => c.mena === 'CZK')?.hodnota;
    const n = prodani.length;
    const duvod = [n - 4 > 0 ? `Cena hostingu chybí, je „X“ nebo nejde přečíst u ${zN(n - 4, n, 'prodaného klienta', 'prodaných klientů')}.` : null,
      `U ${zN(1, n, 'prodaného klienta', 'prodaných klientů')} cena hostingu neuvádí roční období (hosting se účtuje ročně); do součtu se nepočítá.`].filter(Boolean).join(' ');
    over('P2b', cz(h.rocne) === '3500.00' && cz(h.arr) === '3500.00' && cz(h.mrr) === '291.67',
      'hosting: ARR = Σ přesných ročních cen (= ročně, nikdy ze zaokrouhleného MRR), MRR = ARR ÷ 12 na 2 místa', JSON.stringify([cz(h.rocne), cz(h.arr), cz(h.mrr)]));
    over('P2c', h.rocne.duvod === duvod && h.arr.duvod === duvod && h.mrr.duvod === duvod && h.rocne.kvalita === 'castecne' && h.arr.n === n && h.arr.pokryti.zname === 3,
      'hosting: věty 073 (chybí / „X“ / nejde přečíst; neuvádí roční období) u ročně, ARR i MRR, pokrytí 3 z n', `${h.rocne.duvod} || ${duvod}`);
    const rArr = await api.prehledRadky(T, 'prodeje', { vyber: { metrika: 'hosting_arr' } });
    const rMrr = await api.prehledRadky(T, 'prodeje', { vyber: { metrika: 'hosting_mrr' } });
    over('P2d', rArr.data.soucty.find((c) => c.mena === 'CZK')?.hodnota === '3500.00' && rMrr.data.soucty.find((c) => c.mena === 'CZK')?.hodnota === '291.67',
      'řádky hostingu: součet ARR = karta ARR, MRR = round(Σ ÷ 12, 2)', JSON.stringify([rArr.data.soucty, rMrr.data.soucty]));
  } finally {
    prodani.forEach((c, i) => { c.cena_hosting = zaloha[i]; });
  }
});

await blok('P3', async () => {
  if (!API) return;
  const api = API.mockApi;
  const D = demo();
  if (!D) return;
  const OTAZKY = 'Otevřené otázky jsou přibližně (bez odpovědí ve vláknech).';
  const zive = await api.prehledDodani(T, null);
  const kNyni = new Date(Date.now() - 1000).toISOString();
  const kd = await api.prehledDodani(T, { od: DNES, do: DNES, k_datu: kNyni });
  const kPred = new Date(Date.parse(D.historieOd) - 3600000).toISOString();
  const den = denPraha(kPred);
  const pred = await api.prehledDodani(T, { od: den, do: den, k_datu: kPred });
  over('P3a', zive.data.blokace.kvalita === 'castecne' && zive.data.blokace.duvod === OTAZKY && typeof zive.data.blokace.priznaky === 'number',
    'blokace živě: castecne „Otevřené otázky jsou přibližně (bez odpovědí ve vláknech).“, příznaky číslem', String(zive.data.blokace.duvod));
  over('P3b', kd.data.blokace.kvalita === 'castecne' && kd.data.blokace.priznaky === null && kd.data.blokace.duvod === `Příznaky nejsou v historii. ${OTAZKY}`,
    'blokace k datu: castecne, příznaky null a důvod začíná „Příznaky nejsou v historii.“', String(kd.data.blokace.duvod));
  over('P3c', pred.data.blokace.kvalita === 'nedostupne' && pred.data.blokace.eskalace === null && pred.data.blokace.priznaky === null && pred.data.blokace.proklik === null
    && pred.data.blokace.duvod === historieOd(D.historieOd) && stejne(pred.data.faze, []),
    'blokace k datu před začátkem historie: nedostupne s počty null a větou HISTORIE_OD (073 v_hist_t)', String(pred.data.blokace.duvod));
  // šablony a hodnocení webu k datu (5a bod 11, 5b čtení 9)
  const kl = await api.prehledKlienti(T, { od: DNES, do: DNES, k_datu: kNyni });
  over('P3d', stejne(kl.data.hodnoceni_webu, []) && stejne(kl.data.sablony.radky, []) && kl.data.sablony.popis === 'Pozorování, ne důkaz účinku šablony.'
    && kl.meta.varovani.some((v) => v.kod === 'K_DATU_MINULOST'),
    'klienti k datu: hodnoceni_webu [] a šablony [] (popis zůstává) s varováním K_DATU_MINULOST', JSON.stringify({ h: kl.data.hodnoceni_webu.length, s: kl.data.sablony.radky.length }));
  const klZive = await api.prehledKlienti(T, null);
  over('P3e', klZive.data.hodnoceni_webu.length === 7, 'klienti živě: hodnocení webu A až F a bez', String(klZive.data.hodnoceni_webu.length));
  for (const [id, vyber] of [['P3f', { metrika: 'hodnoceni_webu', znamka: 'A' }], ['P3g', { metrika: 'sablony', segment: 'chata', sablona: '01' }]]) {
    const r = await api.prehledRadky(T, 'kontakty', { od: DNES, do: DNES, k_datu: kNyni, vyber });
    over(id, r.data.celkem === 0 && stejne(r.data.soucty, [{ mena: 'CZK', hodnota: null }]),
      `řádky ${vyber.metrika} k datu: seznam jen pro dnešek prázdný a součet null (neznámé, nikdy 0.00)`, JSON.stringify(r.data.soucty));
  }
  const rPred = await api.prehledRadky(T, 'kontakty', { od: den, do: den, k_datu: kPred, vyber: { metrika: 'otevrene' } });
  over('P3h', rPred.data.celkem === 0 && stejne(rPred.data.soucty, [{ mena: 'CZK', hodnota: null }]) && rPred.meta.varovani.some((v) => v.kod === 'HISTORIE_OD'),
    'řádky stavu k datu před historií: prázdné, součet null a HISTORIE_OD', JSON.stringify(rPred.data.soucty));
});

await blok('P4', async () => {
  if (!API) return;
  const api = API.mockApi;
  const D = demo();
  if (!D) return;
  // faktura odeslaná před začátkem zdroje plateb a nezaplacená (5a bod 15)
  const prvniPlatba = D.platby.map((p) => p.at).sort()[0];
  const kontakt = D.kontakty.find((c) => !D.platby.some((p) => p.kontakt_id === c.id) && c.status !== 'zaplaceno');
  const fak = { id: 99901, kontakt_id: kontakt.id, at: new Date(Date.parse(prvniPlatba) - 5 * 86400000).toISOString(), detail: 'faktura 20269901 (5000 Kc web = 5000 Kc), vlakno test' };
  D.faktury.push(fak);
  try {
    const f = await api.prehledFinance(T, null);
    const veta = `Platby evidujeme od ${denText(prvniPlatba)}; starší faktura mohla být zaplacena dřív.`;
    over('P4a', f.data.pohledavky.pocet.kvalita === 'castecne' && f.data.pohledavky.pocet.duvod === veta
      && f.data.pohledavky.castka.kvalita === 'castecne' && (f.data.pohledavky.castka.duvod ?? '').endsWith(veta),
      'nezaplacená faktura před začátkem plateb: pohledávky castecne „Platby evidujeme od …; starší faktura mohla být zaplacena dřív.“', String(f.data.pohledavky.pocet.duvod));
    const platby = D.platby.splice(0, D.platby.length);
    try {
      const f2 = await api.prehledFinance(T, null);
      over('P4b', f2.data.pohledavky.pocet.duvod === 'Platby zatím nikdo nezapsal; nezaplacená faktura mohla být zaplacena.',
        'bez jediného záznamu platby: „Platby zatím nikdo nezapsal; nezaplacená faktura mohla být zaplacena.“', String(f2.data.pohledavky.pocet.duvod));
    } finally {
      D.platby.push(...platby);
    }
  } finally {
    D.faktury.splice(D.faktury.indexOf(fak), 1);
  }
});

await blok('P5', async () => {
  if (!API) return;
  const api = API.mockApi;
  const D = demo();
  if (!D) return;
  // období 60 dní zpět: nabídky, faktury, platby a výplaty se evidují později → jedno ZDROJ_OD s větou za každý zdroj v pořadí
  // registru (5b čtení 1), slevy a výplaty financí castecne s větou svého zdroje (5a bod 18)
  const od = posunD(DNES, -60);
  const f = await api.prehledFinance(T, { od, do: DNES });
  const z = Object.fromEntries(f.meta.zdroje.map((s) => [s.zdroj, s.od]));
  const NAZVY = { slevy: 'Nabídky za polovinu', faktury: 'Faktury', platby: 'Platby', vyplaty: 'Výplaty provizí' };
  const odMs = zacatekDne(od);
  const ocek = ['slevy', 'faktury', 'platby', 'vyplaty'].filter((k) => z[k] && Date.parse(z[k]) > odMs).map((k) => zdrojOd(NAZVY[k], z[k])).join(' ');
  const zo = f.meta.varovani.filter((v) => v.kod === 'ZDROJ_OD');
  over('P5a', zo.length === 1 && zo[0].text === ocek && /Nabídky za polovinu/.test(ocek) && /Výplaty provizí/.test(ocek),
    'jedno varování ZDROJ_OD: věta za každý zdroj (nabídky, faktury, platby, výplaty) v pořadí registru', JSON.stringify({ zo: zo.map((v) => v.text), ocek }));
  over('P5b', f.data.slevy.pocet.kvalita === 'castecne' && f.data.slevy.pocet.duvod === zdrojOd('Nabídky za polovinu', z.slevy)
    && f.data.provize.vyplaceno.kvalita === 'castecne' && (f.data.provize.vyplaceno.duvod ?? '').endsWith(zdrojOd('Výplaty provizí', z.vyplaty)),
    'finance: nabídky a výplaty castecne s větou ZDROJ_OD svého zdroje', JSON.stringify([f.data.slevy.pocet.duvod, f.data.provize.vyplaceno.duvod]));
  // komunikace: ztráty bez důvodu castecne kvůli historii nesou HISTORIE_OD (5a bod 13)
  const k = await api.prehledKomunikace(T, { od: OD_MESIC < posunD(DNES, -2) ? OD_MESIC : posunD(DNES, -2), do: DNES });
  const bez = k.data.duvody.bez_duvodu;
  const hist = `${historieOd(D.historieOd)} Ztráty před ní se datují podle událostí a poslední změny stavu.`;
  over('P5c', bez.kvalita === 'castecne' && (bez.duvod ?? '').endsWith(hist) && k.meta.varovani.some((v) => v.kod === 'HISTORIE_OD'),
    'ztráty bez důvodu před historií: castecne s větou historie a „Ztráty před ní se datují …“, varování HISTORIE_OD', String(bez.duvod));
});

await blok('P6', async () => {
  if (!API) return;
  const api = API.mockApi;
  const D = demo();
  if (!D) return;
  // řada nákladů k datu před historií: každý sloupec nedostupne s větou HISTORIE_OD (provize z prodejů neznámé, 5a bod 17)
  const kPred = new Date(Date.parse(D.historieOd) - 3600000).toISOString();
  const den = denPraha(kPred);
  const r = await api.prehledRada(T, 'naklady_celkem', 'den', { od: posunD(den, -2), do: den, k_datu: kPred });
  over('P6a', r.data.body.length === 3 && r.data.body.every((b) => b.kvalita === 'nedostupne' && b.duvod === historieOd(D.historieOd) && stejne(b.castky, []))
    && r.meta.varovani.some((v) => v.kod === 'HISTORIE_OD') && !r.meta.varovani.some((v) => v.kod === 'NAKLADY_OVERIT'),
    'řada nákladů k datu před historií: sloupce nedostupne s větou HISTORIE_OD, castky [], bez NAKLADY_OVERIT', JSON.stringify(r.data.body.slice(0, 1)));
  // NAKLADY_OVERIT = řádky nákladů s overit, které se v období účtují, platné k datu (5a bod 17)
  const vOverit = (o) => o.meta.varovani.find((v) => v.kod === 'NAKLADY_OVERIT')?.text ?? null;
  const f0 = await api.prehledFinance(T, { od: OD_MESIC, do: DO_MESIC });
  const n0 = Number(/(\d+)\.$/.exec(vOverit(f0) ?? '')?.[1] ?? 0);
  const pristi = `${posunD(`${DNES.slice(0, 8)}28`, 4).slice(0, 8)}01`;
  const budouci = { id: 99801, kategorie: 'jine', popis: 'test', castka: 100, mena: 'CZK', opakovani: 'jednorazove', plati_od: pristi, plati_do: null, kontakt_id: null,
    overit: true, zapsal_id: 1, zapsano_at: new Date(Date.now() - 3600000).toISOString(), zruseno_at: null };
  const pozdni = { id: 99802, kategorie: 'jine', popis: 'test', castka: 100, mena: 'CZK', opakovani: 'jednorazove', plati_od: OD_MESIC, plati_do: null, kontakt_id: null,
    overit: true, zapsal_id: 1, zapsano_at: new Date(Date.now() - 5000).toISOString(), zruseno_at: null };
  D.naklady.push(budouci, pozdni);
  try {
    const f1 = await api.prehledFinance(T, { od: OD_MESIC, do: DO_MESIC, k_datu: new Date(Date.now() - 60000).toISOString() });
    const r1 = await api.prehledRada(T, 'naklady_celkem', 'den', { od: OD_MESIC, do: DO_MESIC, k_datu: new Date(Date.now() - 60000).toISOString() });
    over('P6b', (vOverit(f1) ?? null) === (n0 > 0 ? `Počet nákladů, jejichž částka čeká na ověření: ${n0}.` : null) && vOverit(r1) === vOverit(f1),
      'NAKLADY_OVERIT jen řádky zaúčtované v období a zapsané do k_datu (náklad příštího měsíce ani zapsaný po k datu se nepočítá); řada stejně', `${vOverit(f1)} | ${vOverit(r1)} | n0=${n0}`);
  } finally {
    D.naklady.splice(D.naklady.indexOf(budouci), 1);
    D.naklady.splice(D.naklady.indexOf(pozdni), 1);
  }
});

await blok('P7', async () => {
  if (!API) return;
  const api = API.mockApi;
  const D = demo();
  if (!D) return;
  // věty financí doslova jako 073 (5a bod 17 a app_prehled_finance)
  const f = await api.prehledFinance(T, { od: OD_MESIC, do: DO_MESIC });
  const kat = Object.fromEntries(f.data.naklady.kategorie.map((k) => [k.kategorie, k]));
  const dom = kat.domena;
  const overitN = dom.overit;
  over('P7a', dom.castka.kvalita === 'castecne' && /^U \d+ ze? \d+ (nákladu|nákladů) čeká částka na ověření\.$/.test(dom.castka.duvod ?? '') && overitN >= 1,
    'kategorie s řádkem k ověření: „U a z n nákladů čeká částka na ověření.“ (počet řádků nákladů, ne zaúčtování)', String(dom.castka.duvod));
  over('P7b', kat.hosting.castka.duvod === 'Pro kategorii „Hosting (náš náklad)“ není zadaný žádný náklad.', 'prázdná povinná kategorie: věta 073', String(kat.hosting.castka.duvod));
  const neuplne = f.data.naklady.kategorie.filter((k) => k.castka.kvalita !== 'dostupne').map((k) => k.castka.duvod);
  const pokr = f.data.pokryti_nakladu.filter((p) => p.zname < p.celkem).map((p) => p.text).join('; ');
  const celkemDuvod = [...neuplne, pokr ? `${pokr.charAt(0).toUpperCase()}${pokr.slice(1)}.` : null].filter(Boolean).join(' ');
  over('P7c', f.data.naklady.celkem.duvod === (celkemDuvod || null), 'náklady celkem: důvody neúplných kategorií a věta pokrytí na klienta s velkým písmenem (073)',
    `${f.data.naklady.celkem.duvod} || ${celkemDuvod}`);
  const p0 = f.data.pokryti_nakladu;
  over('P7d', p0.length === 2 && p0[0].text === `doména zadána u ${zN(p0[0].zname, p0[0].celkem, 'klienta s doménou', 'klientů s doménou')}`
    && p0[1].text === `hosting zadán u ${zN(p0[1].zname, p0[1].celkem, 'klienta s hostingem', 'klientů s hostingem')}`,
    'pokrytí nákladů na klienta: „doména zadána u a z n klientů s doménou“, „hosting zadán u …“', JSON.stringify(p0.map((p) => p.text)));
  over('P7e', f.data.vysledek.kvalita === 'dostupne' ? f.data.vysledek.duvod === null : f.data.vysledek.duvod === 'Náklady nebo inkaso nejsou úplné; bez nákladů není zisk = tržba. Řádky: Inkaso a Náklady celkem.',
    'výsledek castecne: věta 073', String(f.data.vysledek.duvod));
  const ink = f.data.platby.inkaso;
  const nInk = ink.n;
  over('P7f', ink.kvalita === 'dostupne' || (ink.duvod ?? '').split(/(?<=\.) /).every((s) => new RegExp(`^U \\d+ ${'z[e]?'} ${nInk} (platby|plateb) (je částka z ceny prodeje, ne z faktury|je platba odvozená ze stavu zaplaceno, bez potvrzení|není přesná částka)\\.$`).test(s) || /^Zdroj „Platby“/.test(s)),
    'inkaso: věty 073 („U a z n plateb je částka z ceny prodeje, ne z faktury.“ …)', String(ink.duvod));
  const zb = f.data.provize.zbyva;
  const vypOd = f.meta.zdroje.find((s) => s.zdroj === 'vyplaty')?.od;
  over('P7g', zb.kvalita === 'castecne' && (zb.duvod ?? '').includes(`Výplaty provizí se evidují od ${denText(vypOd)}; starší výplaty nejsou známé.`),
    'provize zbývá: prodej starší než první výplata = „Výplaty provizí se evidují od …; starší výplaty nejsou známé.“', String(zb.duvod));
  // vysledek: pokrytí po měnách = součet pokrytí inkasa a nákladů (073)
  const vy = f.data.vysledek.castky[0];
  const ic = ink.castky[0];
  const nc = f.data.naklady.celkem.castky[0];
  over('P7h', !!vy && vy.pokryti.zname === ic.pokryti.zname + nc.pokryti.zname && vy.pokryti.celkem === ic.pokryti.celkem + nc.pokryti.celkem,
    'výsledek: pokrytí měny = pokrytí inkasa + pokrytí nákladů (073), ne 0 z 0', JSON.stringify(vy?.pokryti));
  // ze/z jako 073 (app_prehled_ze): „ze 6“, „ze 12“, „ze 60“, „z 5“
  over('P7i', typeof API.zeMock === 'function' && [6, 12, 13, 16, 17, 60, 70, 600, 5, 8, 15, 50, 1000, 2000].map((n) => API.zeMock(n)).join(',') === [6, 12, 13, 16, 17, 60, 70, 600, 5, 8, 15, 50, 1000, 2000].map(ze).join(','),
    'předložka z/ze před číslem jako app_prehled_ze (6, 12, 13, 16, 17, 60, 70, 600 = ze; 5, 8, 15, 50, 1000 = z; 2000 = ze)', typeof API.zeMock === 'function' ? [6, 12, 60, 1000].map((n) => API.zeMock(n)).join(',') : 'chybí zeMock');
});

await blok('P8', async () => {
  if (!API) return;
  const api = API.mockApi;
  const D = demo();
  if (!D) return;
  // meta.zdroje k datu: od i aktualni_k jen ze záznamů do k_datu (073 app_prehled_zdroje s p_k_datu)
  const k = new Date(Date.now() - 2 * 3600000).toISOString();
  const den = denPraha(k);
  const kMs = Date.parse(k);
  const bloky = [await api.prehledFinance(T, { od: den, do: den, k_datu: k }), await api.prehledSouhrn(T, { od: den, do: den, k_datu: k }),
    await api.prehledLide(T, { od: den, do: den, k_datu: k }), await api.prehledDodani(T, { od: den, do: den, k_datu: k })];
  const pozde = bloky.flatMap((o) => o.meta.zdroje.filter((z) => (z.aktualni_k && Date.parse(z.aktualni_k) > kMs) || (z.od && Date.parse(z.od) > kMs)).map((z) => `${z.zdroj}:${z.aktualni_k}`));
  over('P8a', pozde.length === 0, 'meta.zdroje k datu: žádný zdroj nehlásí záznam po k_datu', pozde.join(' | '));
});

await blok('P9', async () => {
  if (!API) return;
  const api = API.mockApi;
  const D = demo();
  if (!D) return;
  // metriky hovorů lidí castecne, když období začíná před prvním hovorem (073 v_hk), stejně návrhy (navrhy_od)
  const od = posunD(DNES, -700);
  const l = await api.prehledLide(T, { od, do: DNES });
  const z = Object.fromEntries(l.meta.zdroje.map((s) => [s.zdroj, s.od]));
  const HOV = ['hovory', 'unikatni_klienti', 'dovolano', 'mira_dovolani', 'zajem', 'odmitnuto', 'nerelevantni', 'preplanovano', 'konverze'];
  const vetaH = zdrojOd('Hovory', z.hovory);
  const spatne = [l.data.soucet, ...l.data.radky].flatMap((r) => HOV.filter((k) => !(r.metriky[k].kvalita === 'castecne' && (r.metriky[k].duvod ?? '').startsWith(vetaH))).map((k) => `${r.display_name}:${k}:${r.metriky[k].kvalita}:${r.metriky[k].duvod}`));
  over('P9a', spatne.length === 0, 'lidé: metriky hovorů castecne s větou ZDROJ_OD hovorů, když období začíná před prvním hovorem', spatne.slice(0, 3).join(' | '));
  const nav = l.data.soucet.metriky.navrhy;
  over('P9b', nav.kvalita === 'castecne' && nav.duvod === zdrojOd('Návrhy webu', z.navrhy), 'lidé: návrhy castecne s větou ZDROJ_OD návrhů', String(nav.duvod));
  const zo = l.meta.varovani.filter((v) => v.kod === 'ZDROJ_OD');
  over('P9c', zo.length === 1 && zo[0].text.startsWith(`${vetaH} ${zdrojOd('Návrhy webu', z.navrhy)}`),
    'lidé: jedno ZDROJ_OD s větou hovorů a návrhů v pořadí registru', JSON.stringify(zo.map((v) => v.text)));
  const zivo = await api.prehledLide(T, { od: DNES, do: DNES });
  over('P9d', zivo.data.soucet.metriky.hovory.kvalita === 'dostupne', 'lidé za Dnes (po prvním hovoru): hovory dostupne', zivo.data.soucet.metriky.hovory.kvalita);
});

/* ---------------- Q) 5b ---------------- */
await blok('Q1', async () => {
  if (!API) return;
  const api = API.mockApi;
  const D = demo();
  if (!D) return;
  // akční seznam: nejvýš 50 případů (termín, pak kontakt), souhrn a řádky všechny (5b čtení 3, AMENDED 2026-11-19)
  const pridane = [];
  const kandidati = D.kontakty.filter((c) => !['odmitnuto', 'nerelevantni', 'nekontaktovat', 'bez_odpovedi'].includes(c.status));
  let klon = 0;
  while (kandidati.length < 60) {
    const vzor = D.kontakty[0];
    const c = { ...vzor, id: 990000 + klon, name: `Test ${klon}`, status: 'zajem', lock_by: null, last_client_reply_at: null, last_our_reply_at: null };
    D.kontakty.push(c);
    pridane.push(c);
    kandidati.push(c);
    klon += 1;
  }
  const zavolat = kandidati.slice(0, 60).map((c, i) => ({ id: 98000 + i, kontakt_id: c.id, user_id: 1, kdy: new Date(Date.now() - (i + 2) * 3600000).toISOString(), poznamka: null, stav: 'ceka',
    vysledek: null, rezervace: false, puvodni_last_caller: null, vytvoril_id: 1, created_at: new Date(Date.now() - 200 * 3600000).toISOString(), zmenil_id: null, zmeneno_at: null, uzavreno_at: null }));
  D.zavolat.push(...zavolat);
  try {
    const a = await api.prehledAkce(T, null);
    const s = await api.prehledSouhrn(T, null);
    const r = await api.prehledRadky(T, 'akce', { vyber: { metrika: 'k_zasahu' } });
    const serazene = [...a.data.pripady].sort((x, y) => x.termin.localeCompare(y.termin) || x.kontakt_id - y.kontakt_id);
    over('Q1a', a.data.pripady.length === 50 && a.data.souhrn.pripadu > 50 && stejne(serazene.map((p) => p.kontakt_id), a.data.pripady.map((p) => p.kontakt_id)),
      'akční seznam: pripady nejvýš 50 (termín, pak kontakt), souhrn.pripadu všechny', `${a.data.pripady.length} / ${a.data.souhrn.pripadu}`);
    over('Q1b', r.data.celkem === a.data.souhrn.pripadu && s.data.karty.k_zasahu.hodnota === a.data.souhrn.pripadu,
      'řádky akce = souhrn.pripadu = karta Případy k zásahu (všechny, ne jen 50)', `${r.data.celkem} / ${a.data.souhrn.pripadu} / ${s.data.karty.k_zasahu.hodnota}`);
    const zdroje = new Set(a.data.pripady.flatMap((p) => p.signaly.map((g) => `${g.kod}=${g.zdroj}`)));
    const ZDROJE = { klient_ceka: 'Gmail (automatizace)', navrh_mlci: 'Poslední zpráva klientovi (automatizace)', hovor_po_terminu: 'Naplánované hovory',
      faktura_nepotvrzena: 'Faktury a potvrzené platby', schvaleno_bez_faktury: 'Prodeje a faktury', sleva_konci: 'Nabídky za polovinu', otazka: 'Otázky automatizace' };
    over('Q1c', [...zdroje].every((z) => { const [k, v] = z.split('='); return ZDROJE[k] === v; }), 'signály: zdroj textem 073 (Naplánované hovory, Gmail (automatizace), …)', [...zdroje].slice(0, 4).join(' | '));
  } finally {
    for (const z of zavolat) D.zavolat.splice(D.zavolat.indexOf(z), 1);
    for (const c of pridane) D.kontakty.splice(D.kontakty.indexOf(c), 1);
  }
  // k datu: pripady [], pripadu null, podle_signalu [], karta nedostupná s větou 073, řádky prázdné
  const k = new Date(Date.now() - 1000).toISOString();
  const ak = await api.prehledAkce(T, { od: DNES, do: DNES, k_datu: k });
  const sk = await api.prehledSouhrn(T, { od: DNES, do: DNES, k_datu: k });
  const rk = await api.prehledRadky(T, 'akce', { od: DNES, do: DNES, k_datu: k, vyber: { metrika: 'k_zasahu' } });
  over('Q1d', stejne(ak.data.pripady, []) && ak.data.souhrn.pripadu === null && stejne(ak.data.souhrn.podle_signalu, []),
    'akce k datu: pripady [], pripadu null (neznámé, nikdy 0), podle_signalu []', JSON.stringify(ak.data.souhrn));
  over('Q1e', sk.data.karty.k_zasahu.kvalita === 'nedostupne' && sk.data.karty.k_zasahu.duvod === 'Případy k zásahu jsou jen pro dnešek; s k datu v minulosti nejsou známé.'
    && rk.data.celkem === 0 && stejne(rk.data.soucty, []),
    'karta k zásahu k datu: nedostupne s větou 073; řádky akce k datu prázdné (bez peněz, součty [])', String(sk.data.karty.k_zasahu.duvod));
});

await blok('Q2', async () => {
  if (!API) return;
  const api = API.mockApi;
  const D = demo();
  if (!D) return;
  // Nepřiřazeno nemá pracovní úseky (073 prehled_radky prace, úsek má vždy člověka)
  const r = await api.prehledRadky(T, 'prace', { vyber: { metrika: 'odpracovane_hodiny', bez_prirazeni: true } });
  const vse = await api.prehledRadky(T, 'prace', { vyber: { metrika: 'odpracovane_hodiny' } });
  over('Q2a', vse.data.celkem > 0 && r.data.celkem === 0 && r.data.soucet === 0, 'řádky práce Nepřiřazeno: žádné úseky, součet 0 hodin', `${r.data.celkem} / ${r.data.soucet}`);
  // doba do zavolání: řádky = různé kontakty vlastníka (dvě označení téhož kontaktu = jeden řádek), označení bez volajícího
  // patří Nepřiřazeno (073 app_prehled_sla)
  const lide0 = await api.prehledLide(T, null);
  const c = D.kontakty.find((k) => k.status === 'navrh_odeslan' || k.status === 'ceka_na_klienta');
  const uid = 3;
  const ted = Date.now();
  const ozn = (id, vol) => ({ id, kontakt_id: c.id, kategorie: 'navrh', od: new Date(ted - 7200000).toISOString(), mlci_od: new Date(ted - 7200000).toISOString(),
    oznaceno_at: new Date(ted - 3600000 - id).toISOString(), lhuta_do: DNES, zavadeci: false, volajici_id: vol, pokusy: 0, posledni_pokus_at: null, zavolano_at: null, zavolano_kdo: null,
    vysledek: null, poznamka: null, pripominka_job: null, pripominka_at: null, uzavreno_at: null, uzavreno_duvod: null });
  const nove = [ozn(97001, uid), ozn(97002, uid), ozn(97003, null)];
  D.oznaceni.push(...nove);
  try {
    const lide1 = await api.prehledLide(T, null);
    const radek = (o, u) => (u === null ? o.data.radky.find((x) => x.druh === 'neprirazeno') : o.data.radky.find((x) => x.user_id === u));
    const p0 = radek(lide0, uid)?.metriky.sla_prvni_kontakt_median.pokryti?.celkem ?? 0;
    const p1 = radek(lide1, uid)?.metriky.sla_prvni_kontakt_median.pokryti?.celkem ?? 0;
    const r0 = await api.prehledRadky(T, 'kontakty', { vyber: { metrika: 'sla_prvni_kontakt_median', user_id: uid } });
    const rN = await api.prehledRadky(T, 'kontakty', { vyber: { metrika: 'sla_prvni_kontakt_median', bez_prirazeni: true } });
    const nep = radek(lide1, null);
    over('Q2b', p1 === p0 + 2 && r0.data.radky.filter((x) => x.kontakt_id === c.id).length === 1 && r0.data.celkem <= p1,
      'doba do zavolání: dvě označení téhož kontaktu = 2 jednotky, ale 1 řádek; řádky ≤ jednotky', `${p0}→${p1}, řádků ${r0.data.celkem}`);
    over('Q2c', !!nep && (nep.metriky.sla_prvni_kontakt_median.pokryti?.celkem ?? 0) >= 1 && rN.data.radky.some((x) => x.kontakt_id === c.id),
      'označení bez volajícího patří Nepřiřazeno (tabulka lidí i řádky bez_prirazeni)', JSON.stringify({ nep: nep?.metriky.sla_prvni_kontakt_median.pokryti, radku: rN.data.celkem }));
  } finally {
    for (const o of nove) D.oznaceni.splice(D.oznaceni.indexOf(o), 1);
  }
});

await blok('Q3', async () => {
  if (!API) return;
  const api = API.mockApi;
  // prognóza: příspěvky jednotek, vážené = Σ příspěvků skupiny, karta = Σ všech příspěvků = potvrzené + Σ vážených, řádky = karta
  const p = await api.prehledPrognoza(T, null);
  const s = await api.prehledSouhrn(T, null);
  const NAZVY = ['Zájem', 'Po návrhu', 'Nabídka za polovinu', 'Ostatní otevřené'];
  over('Q3a', stejne(p.data.otevrene.map((g) => g.nazev), NAZVY), 'skupiny prognózy názvy 073 (Ostatní otevřené)', JSON.stringify(p.data.otevrene.map((g) => g.nazev)));
  const ost = p.data.otevrene.find((g) => g.faze === 'ostatni');
  const OST = 'Ozve se později, pozastavené a eskalace se do odhadu nepočítají (pravděpodobnost 0).';
  over('Q3b', ost.pravdepodobnost.citatel === 0 && ost.pravdepodobnost.jmenovatel === ost.n
    && (ost.n > 0 ? ost.pravdepodobnost.hodnota === 0 && ost.pravdepodobnost.duvod === OST : ost.pravdepodobnost.hodnota === null && ost.pravdepodobnost.duvod === `${OST} Jmenovatel je 0, podíl nejde spočítat.`),
    'ostatní: míra 0 z jejích otevřených obchodů s větou 073 (bez obchodů null a věta R8)', JSON.stringify(ost.pravdepodobnost));
  const malo = p.data.otevrene.filter((g) => g.faze !== 'ostatni');
  over('Q3c', malo.every((g) => (g.pravdepodobnost.jmenovatel === 0
    ? g.pravdepodobnost.hodnota === null && g.pravdepodobnost.duvod === 'Málo historie (N = 0). Jmenovatel je 0, podíl nejde spočítat.' && g.vazene.every((v) => v.hodnota === null)
    : g.pravdepodobnost.jmenovatel < 20 ? g.pravdepodobnost.duvod === `Málo historie (N = ${g.pravdepodobnost.jmenovatel}).` : true)
    && stejne(g.pravdepodobnost.proklik?.filtr.vyber ?? null, g.pravdepodobnost.proklik ? { metrika: 'prognoza_pravdepodobnost', krok: g.faze } : null)),
    'skupina bez historie (N = 0): dvě věty, míra a vážené null; vyber skupiny = krok (Vyber.krok)', JSON.stringify(malo.map((g) => [g.faze, g.pravdepodobnost.jmenovatel, g.pravdepodobnost.duvod, g.vazene])));
  const zak = p.data.scenare.zakladni;
  over('Q3d', zak.kvalita === 'castecne' && /^Nevalidovaný odhad z naší historie\.( U \d+ ze? \d+ (klienta|klientů) není přesná cena nebo historie fáze; odhad je jen ze známých\.)?$/.test(zak.duvod ?? ''),
    'základní scénář: „Nevalidovaný odhad z naší historie.“ (+ neznámé jednotky)', String(zak.duvod));
  const r = await api.prehledRadky(T, 'kontakty', { vyber: { metrika: 'odhad_mesic' } });
  const kartaCzk = s.data.karty.odhad_mesic.castky.find((c) => c.mena === 'CZK')?.hodnota;
  const radkyCzk = r.data.radky.filter((x) => x.prispevek && x.prispevek.mena === 'CZK').reduce((a, x) => a + Number(x.prispevek.hodnota), 0);
  over('Q3e', r.data.soucty.find((c) => c.mena === 'CZK')?.hodnota === kartaCzk && (kartaCzk === null || Math.abs(radkyCzk - Number(kartaCzk)) < 0.005)
    && r.data.radky.every((x) => 'prispevek' in x && 'pravdepodobnost' in x),
    'řádky odhadu: každý s příspěvkem a pravděpodobností, součet příspěvků = karta odhad_mesic přesně', `${kartaCzk} vs ${castka2(radkyCzk)} / ${JSON.stringify(r.data.soucty)}`);
  const skupMira = Object.fromEntries(p.data.otevrene.map((g) => [g.faze, g.pravdepodobnost]));
  const otevreny = r.data.radky.find((x) => x.pravdepodobnost !== 1 && x.cena.stav === 'presne' && x.prispevek);
  const bezPrispevku = r.data.radky.filter((x) => x.prispevek === null);
  over('Q3f', !otevreny || Object.values(skupMira).some((m) => m.jmenovatel > 0 && castka2(Number(otevreny.cena.castka) * m.citatel / m.jmenovatel) === otevreny.prispevek.hodnota),
    'příspěvek otevřeného obchodu = round(cena × citatel ÷ jmenovatel, 2) jeho skupiny', JSON.stringify(otevreny ?? null));
  over('Q3g', bezPrispevku.every((x) => x.cena.stav !== 'presne' || x.pravdepodobnost === null), 'bez příspěvku jen bez přesné ceny nebo bez míry', JSON.stringify(bezPrispevku.slice(0, 2).map((x) => [x.cena.stav, x.pravdepodobnost])));
  // příklad §5.11: 278 obchodů po násobcích 111 Kč (1 520 700 Kč) při 2 ÷ 111 = přesně 27 400.00
  const ceny = [];
  let zbyva = 13700;
  for (let i = 0; i < 278; i += 1) { const k = i === 277 ? zbyva : 49; ceny.push({ castka: 111 * k, mena: 'CZK' }); zbyva -= 49; }
  ceny.push(...Array.from({ length: 29 }, () => ({ castka: null, mena: null })));
  const v = typeof API.vazeneOdhadu === 'function' ? API.vazeneOdhadu(ceny, 2, 111, ['CZK']) : null;
  over('Q3h', ceny.filter((c) => c.castka !== null).reduce((a, c) => a + c.castka, 0) === 1520700 && stejne(v, [{ mena: 'CZK', hodnota: '27400.00' }]),
    'příklad §5.11: 1 520 700.00 Kč po násobcích 111 při 2 ÷ 111 = vážené 27 400.00 (příspěvek po obchodech, ne přes zaokrouhlenou míru)', JSON.stringify(v));
  const pres = p.data.presnost;
  const lide = await api.prehledPrognoza(T, { lide: [2] });
  over('Q3i', pres.kvalita === 'nedostupne' && pres.duvod === 'Zatím není žádný denní snímek z minulého měsíce.'
    && lide.data.presnost.duvod === 'Denní snímky jsou za celou firmu; s filtrem lidí nebo klientů se přesnost nepočítá.',
    'přesnost: bez snímku a s filtrem lidí věty 073', `${pres.duvod} | ${lide.data.presnost.duvod}`);
  const g = p.data.otevrene.find((x) => x.faze === 'navrh');
  const rg = await api.prehledRadky(T, 'kontakty', { vyber: { metrika: 'prognoza_pravdepodobnost', krok: 'navrh' } });
  over('Q3j', rg.data.celkem === g.pravdepodobnost.jmenovatel, 'řádky míry skupiny = kohorta milníku skupiny (jmenovatel)', `${rg.data.celkem} vs ${g.pravdepodobnost.jmenovatel}`);
});

await blok('Q4', async () => {
  if (!API) return;
  const api = API.mockApi;
  const D = demo();
  if (!D) return;
  // volné texty bez telefonu a e-mailu (R20): cena webu, text ceny prodeje, popis nákladu, poznámka výplaty, důvod, časová osa
  const PRODANO = ['schvaleno', 'faktura_odeslana', 'zaplaceno', 'domena_pripojena', 'hotovo'];
  const prodany = D.kontakty.find((c) => PRODANO.includes(c.status) && D.kontakty.indexOf(c) >= 0);
  const otevreny = D.kontakty.find((c) => ['navrh_odeslan', 'zajem', 'ceka_na_klienta'].includes(c.status));
  const TXT = '5000 Kč, volat 731 000 113 nebo jan.novak@example.cz';
  const zal = [prodany.cena_web, otevreny.cena_web, otevreny.cena_hosting];
  prodany.cena_web = TXT;
  otevreny.cena_web = TXT;
  otevreny.cena_hosting = 'tel. +420731000113';
  const naklad = { id: 99701, kategorie: 'jine', popis: `Faktura od ${'pepa@example.cz'}, tel 777 123 456`, castka: 100, mena: 'CZK', opakovani: 'jednorazove', plati_od: DNES, plati_do: null,
    kontakt_id: null, overit: false, zapsal_id: 1, zapsano_at: new Date(Date.now() - 3600000).toISOString(), zruseno_at: null };
  D.naklady.push(naklad);
  const vypl = { id: 99702, user_id: 2, castka: 10, mena: 'CZK', vyplaceno_dne: DNES, za_obdobi_od: null, za_obdobi_do: null, poznamka: 'na účet, volat 731000113', zapsal_id: 1,
    zapsano_at: new Date(Date.now() - 3600000).toISOString(), zruseno_at: null };
  D.vyplaty.push(vypl);
  try {
    const rk = await api.prehledRadky(T, 'kontakty', { vyber: { metrika: 'otevrene' } }, null, 200);
    const rp = await api.prehledRadky(T, 'prodeje', { od: posunD(DNES, -700), do: DNES }, null, 200);
    const rn = await api.prehledRadky(T, 'naklady', { od: OD_MESIC, do: DO_MESIC, vyber: { metrika: 'naklady_celkem' } }, null, 200);
    const rv = await api.prehledRadky(T, 'provize', { od: OD_MESIC, do: DO_MESIC, vyber: { metrika: 'provize_vyplaceno' } }, null, 200);
    const kk = await api.prehledKontakt(T, otevreny.id);
    const rKon = rk.data.radky.find((x) => x.kontakt_id === otevreny.id);
    const rPro = rp.data.radky.find((x) => x.kontakt_id === prodany.id);
    const rNak = rn.data.radky.find((x) => x.naklad_id === 99701);
    const rVyp = rv.data.radky.find((x) => x.vyplata_id === 99702);
    over('Q4a', rKon?.cena_web === maska(TXT) && rPro?.cena_text === maska(TXT) && rNak?.popis === maska(naklad.popis) && rVyp?.poznamka === maska(vypl.poznamka),
      'řádky: cena_web, cena_text, popis nákladu a poznámka výplaty zamaskované jako 073 („[telefon]“, „[e-mail]“)',
      JSON.stringify([rKon?.cena_web, rPro?.cena_text, rNak?.popis, rVyp?.poznamka]));
    over('Q4b', kk.data.kontakt.cena_web === maska(TXT) && kk.data.kontakt.cena_hosting === maska(otevreny.cena_hosting)
      && !kk.data.udalosti.some((u) => /\d{9}|@/.test(u.text.replace(/\s/g, ''))),
      'časová osa: ceny kontaktu a texty událostí bez telefonu a e-mailu', JSON.stringify([kk.data.kontakt.cena_web, kk.data.kontakt.cena_hosting]));
  } finally {
    prodany.cena_web = zal[0];
    otevreny.cena_web = zal[1];
    otevreny.cena_hosting = zal[2];
    D.naklady.splice(D.naklady.indexOf(naklad), 1);
    D.vyplaty.splice(D.vyplaty.indexOf(vypl), 1);
  }
  // řádky provizí: nárok prodeje, u kterého nikdo nezapsal zájem, má user_id a volajici null (§7 RadekProvize, AMENDED 2026-11-19)
  const rz = await api.prehledRadky(T, 'provize', { od: posunD(DNES, -700), do: DNES, vyber: { metrika: 'provize_narok' } }, null, 200);
  const nikdo = rz.data.radky.filter((x) => x.user_id === null);
  over('Q4c', nikdo.every((x) => x.volajici === null && x.druh === 'narok'), 'řádek nároku bez zájmu: user_id i volajici null (nikdy „?“)', JSON.stringify(nikdo.slice(0, 2)));
});

await blok('Q5', async () => {
  if (!API) return;
  const api = API.mockApi;
  const D = demo();
  if (!D) return;
  // časová osa česky (073 app_prehled_kontakt): výsledky, stavy z registru, nabídky, faktury, platby, označení, hovory, hvězda
  const sFakturou = D.faktury[0];
  const k = await api.prehledKontakt(T, sFakturou.kontakt_id);
  const texty = k.data.udalosti.map((u) => u.text);
  const fakText = texty.find((t) => t.startsWith('Faktura'));
  const platText = texty.find((t) => t.startsWith('Platba'));
  over('Q5a', /^Faktura \d+: \d+\.\d{2} (CZK|EUR)\.$/.test(fakText ?? '') && /^(Platba potvrzena|Platba odvozená ze stavu zaplaceno)(: \d+\.\d{2} (CZK|EUR))?( \(podle faktury\)| \(podle ceny prodeje\))?\.$/.test(platText ?? ''),
    'časová osa: „Faktura 20260040: 370.00 EUR.“ a „Platba potvrzena: … (podle faktury).“ jako 073', `${fakText} | ${platText}`);
  const stav = texty.find((t) => t.startsWith('Stav při začátku historie: '));
  over('Q5b', !!stav && /^Stav při začátku historie: [A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][^.]*\.$/.test(stav) && !/_/.test(stav),
    'časová osa: výchozí stav historie názvem z registru (nikdy kód)', String(stav));
  const vse = D.kontakty.map((c) => c.id);
  const zavolatKontakt = D.zavolat[0]?.kontakt_id ?? vse[0];
  const kz = await api.prehledKontakt(T, zavolatKontakt);
  const z = kz.data.udalosti.find((u) => u.druh === 'zavolat');
  over('Q5c', !z || /^Naplánovaný hovor na \d{1,2}\. \d{1,2}\. \d{4} \d{1,2}:\d{2} \((čeká|hotovo|zrušeno)\)\.$/.test(z.text),
    'časová osa: naplánovaný hovor „… (čeká|hotovo|zrušeno).“ (nikdy kód stavu)', String(z?.text));
  const sHvezdou = D.kontakty.find((c) => c.hvezda_at);
  if (sHvezdou) {
    const kh = await api.prehledKontakt(T, sHvezdou.id);
    over('Q5d', kh.data.udalosti.some((u) => u.druh === 'hvezda' && u.text === 'Hvězda.'), 'časová osa: hvězda „Hvězda.“', JSON.stringify(kh.data.udalosti.filter((u) => u.druh === 'hvezda')));
  }
  const sNavrhem = D.kontakty.find((c) => c.first_proposal_at);
  if (sNavrhem) {
    const kn = await api.prehledKontakt(T, sNavrhem.id);
    over('Q5e', kn.data.udalosti.some((u) => u.druh === 'navrh' && u.text === 'První návrh webu.'), 'časová osa: první návrh „První návrh webu.“ (bez událostí návrhu)', '');
  }
  const poradi = k.data.udalosti.map((u) => u.at);
  over('Q5f', poradi.every((t, i) => i === 0 || poradi[i - 1] >= t), 'časová osa od nejnovější', '');
});

/* ---------------- L) 074: pět seznamů ---------------- */
await blok('L', async () => {
  if (!API) return;
  const api = API.mockApi;
  const DVAKRAT = 'Filtr lidí je zadaný dvakrát (jeden člověk i výběr lidí); pošlete jen jeden z nich.';
  const vol = 'demo-2-x';
  await chyba('L1a', () => api.listKontakty(vol, { limit: 50, user_ids: [3] }), 'Podle volajícího můžete filtrovat jen sebe.', 'list_kontakty: Volající cizí id → věta 074');
  await chyba('L1b', () => api.myKontakty(vol, 200, 0, null, null, { user_ids: [3] }), 'Klienty jiného člověka vidí jen jeho super admin.', 'my_kontakty: Volající cizí id → věta 074');
  await chyba('L1c', () => api.listOznacene(vol, { user_ids: [3] }), 'Označené klienty jiného člověka vidí jen jeho super admin.', 'list_oznacene: Volající cizí id → věta 074');
  await chyba('L1d', () => api.zavolatSeznam(vol, null, false, false, [3]), 'Kalendář jiného člověka vidí jen super admin.', 'zavolat_seznam: Volající cizí id → věta 074');
  await chyba('L1e', () => api.listThreads(vol, 'open', null, null, [3]), 'Zprávy jiného člověka vidí jen jeho super admin.', 'list_threads: Volající cizí id → věta 074');
  await projde('L2', async () => { await api.listKontakty(vol, { limit: 50, user_ids: [2, 2, null] }); await api.zavolatSeznam(vol, null, false, false, [2]); }, 'Volající s [sebe] (i s duplicitou a null) projde');
  await chyba('L3a', () => api.listKontakty(T, { limit: 50, user_ids: [3], caller: 'Petra' }), DVAKRAT, 'list_kontakty: p_caller i p_user_ids');
  await chyba('L3b', () => api.zavolatSeznam(T, null, true, false, [3]), DVAKRAT, 'zavolat_seznam: p_vsichni i p_user_ids');
  await chyba('L3c', () => api.listOznacene(T, { user_ids: [3], bez_volajiciho: true }), 'Vyberte buď volajícího, nebo „bez volajícího“, ne obojí.', 'list_oznacene: bez volajícího i p_user_ids');
  const a = await api.listKontakty(T, { limit: 500, user_ids: [2] });
  const b = await api.listKontakty(T, { limit: 500, user_ids: [3] });
  const ab = await api.listKontakty(T, { limit: 500, user_ids: [2, 3] });
  const ids = (r) => (r.rows ?? r).map((x) => x.id).sort((x, y) => x - y);
  over('L4', stejne(ids(ab), [...new Set([...ids(a), ...ids(b)])].sort((x, y) => x - y)), 'p_user_ids = sjednocení výsledků po jednom člověku', `${ids(ab).length} vs ${ids(a).length}+${ids(b).length}`);
});

/* ---------------- K) kontrola pravidel 49 b ---------------- */
await blok('K', async () => {
  const soubory = ['src/pages/prehled/NastaveniVyplaty.tsx', 'src/pages/prehled/NastaveniCile.tsx', 'src/pages/prehled/NastaveniNaklady.tsx', 'src/pages/prehled/NastaveniSpolecne.tsx'];
  const stare = soubory.filter((p) => /\.role (===|!==) 'admin'/.test(src(p)));
  over('K1', stare.length === 0, 'kontrola 49 b: appka netestuje roli postaru (`.role === \'admin\'`), má isAdminRole/isSuperAdmin', stare.join(', '));
  if (!N) return;
  const lide = [{ id: 1, role: 'super_admin' }, { id: 4, role: 'super_admin' }, { id: 2, role: 'admin' }, { id: 7, role: 'caller' }];
  over('K2', typeof N.vychoziPrijemceVyplaty === 'function' && N.vychoziPrijemceVyplaty(lide) === 2 && N.vychoziPrijemceVyplaty([{ id: 1, role: 'super_admin' }]) === 1
    && N.vychoziPrijemceVyplaty([]) === 0 && N.vychoziPrijemceVyplaty([{ id: 1, role: 'super_admin' }, { id: 7, role: 'caller' }]) === 7,
    'výchozí příjemce výplaty: první Volající (ne super admin, i stará role caller), jinak první ze seznamu, prázdný seznam 0', '');
});

if (chyby === 0) {
  console.log(`ALL OK (${pocet} kontrol)`);
  process.exit(0);
}
console.log(`CHYB: ${chyby} z ${pocet}`);
process.exit(1);
