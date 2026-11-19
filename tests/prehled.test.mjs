// Test Přehledu vedení (úkol 13, Albert 17. 11. 2026, rozhodnutí D1, D2 a D12; spec
// docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md §7.1, §7.2, §7.7 a §7.8, kontrakt
// docs/superpowers/specs/2026-11-17-prehled-kontrakt.md §2 a §5).
//
// Měří:
//  A) filtr v adrese (src/prehledFiltr.ts): čtení a zápis tam a zpět, špatné hodnoty = výchozí, filtr pro server (tým rozbalený
//     na id z prehled_moznosti.tymy), čipy a „Zrušit vše“,
//  B) předvolby období v pražském čase: Tento týden pondělí až neděle, Minulý měsíc přes změnu času, dny 29. 3. a 25. 10. 2026,
//  C) CSV (src/csv.ts): vzorce = + - @ dostanou apostrof, telefon a e-mail se zamaskují, uvozovky a středníky,
//  D) karta metriky (src/components/prehled/KpiKarta.tsx) vykreslená na serveru: nedostupné číslo s důvodem a nikdy „0“,
//     ověřená nula je „0“, dovolano serveru se jmenuje „Spojeno“ (nikdy „Dovoláno“), popis „i“ s definicí, základem a verzí,
//  E) DEMO mock (src/api/mock.ts) jako kontrakt: Volajícímu každá funkce Přehledu „Přehled vidí jen super admin.“ před čímkoli,
//     obálka a metriky po 13 klíčích, peníze jako text na 2 místa po měnách, karty mají v demu hodnoty, proklik každé karty vrátí
//     řádky se stejným součtem (i po stránkách), kurzor patří k filtru, chybové věty doslova,
//  F) src/api/supabase.ts: PGRST202 = „Přehled potřebuje migraci 073“ (nikdy ukázková data), co jde serveru,
//  G) zapojení: trasa #/prehled jen pro super admina, pilulka a dlaždice jen pod isSuper, stránka Volajícímu nic nevykreslí,
//  R) oprava po recenzi (task-13-fixes.md, 18. 11. 2026): psané datum (celé platné od 2020, věta u pole), prázdno jen
//     z dostupných karet, neznámá měna „— €“, chyba kurzoru, čerstvost a verze katalogu, součty jako karta, čeština,
//     maskování a odkaz do Gmailu v řádcích, nadpisy, zrušení CSV, názvy trychtýře podle kontraktu.
// Klikání (záložky, filtry, karta → řádky → CSV, klávesnice, telefon, Volající) měří tests/demo-e2e.mjs blok PV.
// Nikdy nesahá na síť ani živou DB (fetch je podstrčený).
// Spuštění: node tests/prehled.test.mjs (APP_ROOT=/cesta/ke/kopii pro mutace). Výsledek „ALL OK (N kontrol)“ nebo řádky
// „FAIL <id>: …“ a kód 1.

import { build } from 'esbuild';
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
// mock čeká 60 až 180 ms na každé volání; test to zkrátí na nulu
const puvodniTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, _ms, ...a) => puvodniTimeout(fn, 0, ...a);
const odeslano = [];
let odpoved = { status: 200, telo: '{}' };
globalThis.fetch = async (url, init) => {
  odeslano.push({ fn: String(url).split('/rpc/')[1], body: JSON.parse(init?.body ?? '{}') });
  return new Response(odpoved.telo, { status: odpoved.status, headers: { 'Content-Type': 'application/json' } });
};
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
const stejne = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Text bez značek a s normálními mezerami (cs-CZ píše mezi tisíce pevnou mezeru). */
const text = (html) => String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;| | /g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
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
  const dir = mkdtempSync(join(tmpdir(), 'prehled-test-'));
  const f = join(dir, 'b.cjs');
  writeFileSync(f, out.outputFiles[0].text);
  try {
    return createRequire(import.meta.url)(f);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// každý kus zvlášť, ať RED ukáže, co přesně chybí
let F = null;
try {
  F = await balicek(["export * from './src/prehledFiltr.ts';"]);
} catch (e) {
  over('A0', false, 'src/prehledFiltr.ts nejde sestavit (filtr Přehledu v adrese chybí)', String(e.message).split('\n')[0]);
}
let C = null;
try {
  C = await balicek(["export * from './src/csv.ts';"]);
} catch (e) {
  over('C0', false, 'src/csv.ts nejde sestavit (CSV chybí)', String(e.message).split('\n')[0]);
}
let K = null;
try {
  K = await balicek([
    "export { default as KpiKarta } from './src/components/prehled/KpiKarta.tsx';",
    "export { default as DefinicePopover } from './src/components/prehled/DefinicePopover.tsx';",
    "export * from './src/prehled.ts';",
    "export { renderToStaticMarkup } from 'react-dom/server';",
    "export { createElement } from 'react';",
  ]);
} catch (e) {
  over('D0', false, 'karta metriky (KpiKarta, DefinicePopover, src/prehled.ts) nejde sestavit', String(e.message).split('\n').slice(0, 2).join(' | '));
}
let API = null;
try {
  API = await balicek([
    "export { mockApi } from './src/api/mock.ts';",
    "export * from './src/api/supabase.ts';",
  ]);
} catch (e) {
  over('E0', false, 'mock a supabase.ts nejdou sestavit', String(e.message).split('\n')[0]);
}
let P = null;
try {
  P = await balicek([
    "export { default as PrehledPage } from './src/pages/prehled/PrehledPage.tsx';",
    "export { AuthProvider, LS_SESSION } from './src/auth.tsx';",
    "export { MemoryRouter, Routes, Route } from 'react-router-dom';",
    "export { renderToStaticMarkup } from 'react-dom/server';",
    "export { createElement } from 'react';",
  ]);
} catch (e) {
  over('G0', false, 'stránka Přehledu (src/pages/prehled/PrehledPage.tsx) nejde sestavit', String(e.message).split('\n').slice(0, 2).join(' | '));
}

let LF = null;
try {
  LF = await balicek([
    "export { vyberZFiltru, filtrZVyberu } from './src/components/prehled/FiltrPrehledu.tsx';",
    "export { shrnutiVyberu, VYBER_VSICHNI, sJenAktivnimi, vyberZIds } from './src/lide.ts';",
    "export * from './src/prehledFiltr.ts';",
  ]);
} catch (e) {
  over('M0', false, 'výběr lidí v řadě filtrů Přehledu nejde sestavit', String(e.message).split('\n')[0]);
}

const DNES = '2026-11-18';

/* ---------------- A) filtr v adrese ---------------- */
await blok('A', async () => {
  if (!F) return;
  const kanon = 'od=2026-11-01&do=2026-11-30&lide=2,3&seg=architekt,chata&mena=obe&zaklad=prodej&atribuce=spravuje&k=2026-11-10T09%3A00%3A00.000Z';
  const f = F.ctiFiltr(`?${kanon}`, DNES);
  over('A1', F.zapisFiltr(f) === kanon && stejne(f.lide, [2, 3]) && f.tym === null && stejne(f.segment, ['architekt', 'chata']) && f.mena === 'obe'
    && f.zaklad === 'prodej' && f.atribuce === 'spravuje' && f.k === '2026-11-10T09:00:00.000Z',
    'adresa tam a zpět beze změny (pevné pořadí klíčů, seznamy čárkou)', F.zapisFiltr(f));
  const vzorky = [
    { ...F.vychoziFiltr(DNES), tym: 4 },
    { ...F.vychoziFiltr(DNES), od: '2026-10-01', do: '2026-10-31', obor: ['autoservis: pneuservis', 'topeni: klimatizace'], kraj: ['Praha', 'neznamy'] },
    { ...F.vychoziFiltr(DNES), od: '2026-03-29', do: '2026-03-29', mena: 'EUR', atribuce: 'prvni_zajem', lide: [5] },
  ];
  const zpet = vzorky.map((v) => F.ctiFiltr(F.zapisFiltr(v), DNES));
  over('A2', vzorky.every((v, i) => stejne(zpet[i], v)), 'filtr → adresa → filtr se nezmění (tým, obory s dvojtečkou a mezerou, kraje, EUR, jeden člověk)',
    JSON.stringify(zpet.map((z) => F.zapisFiltr(z))));
  const vych = F.vychoziFiltr(DNES);
  over('A3', stejne(F.ctiFiltr('', DNES), vych) && vych.od === '2026-11-01' && vych.do === '2026-11-30' && vych.lide === null && vych.tym === null
    && vych.mena === 'CZK' && vych.zaklad === 'prirozeny' && vych.atribuce === 'posledni_zajem' && vych.k === null
    && F.zapisFiltr(vych) === 'od=2026-11-01&do=2026-11-30',
    'bez parametrů = Tento měsíc a výchozí volby; zápis vynechá výchozí hodnoty, období píše vždy', F.zapisFiltr(vych));
  const spatne = F.ctiFiltr('od=2026-11-20&do=2026-11-01&lide=x,2,-1,2&mena=USD&zaklad=nic&atribuce=x&k=2999-01-01T00:00:00Z&seg=,chata,', DNES);
  over('A4', spatne.od === vych.od && spatne.do === vych.do && stejne(spatne.lide, [2]) && spatne.mena === 'CZK' && spatne.zaklad === 'prirozeny'
    && spatne.atribuce === 'posledni_zajem' && spatne.k === null && stejne(spatne.segment, ['chata']),
    'ručně pokažená adresa: do před od = výchozí období, neplatná id, měna, základ, atribuce a budoucí k_datu se zahodí', JSON.stringify(spatne));
  const dlouhe = F.ctiFiltr('od=2020-01-01&do=2026-11-18', DNES);
  const stare = F.ctiFiltr('od=2019-12-31&do=2020-01-05', DNES);
  over('A5', dlouhe.od === vych.od && stare.od === vych.od, 'období přes 730 dní nebo před rokem 2020 = výchozí (server by je odmítl)', `${dlouhe.od} ${stare.od}`);
  const oba = F.ctiFiltr('od=2026-11-01&do=2026-11-30&lide=2&tym=4', DNES);
  over('A6', stejne(oba.lide, [2]) && oba.tym === null, 'lide i tym naráz: platí lide (výběr je vždy jen jeden)', JSON.stringify(oba));
  const tymy = [{ id: 1, clenove: [1, 2, 5] }, { id: 4, clenove: [3, 4] }];
  const s1 = F.filtrProServer({ ...vych, tym: 4 }, tymy);
  const s2 = F.filtrProServer({ ...vych, lide: [3, 2], segment: [], k: '2026-11-10T09:00:00.000Z' }, tymy);
  over('A7', stejne(s1.lide, [3, 4]) && s1.segment === null && s1.obor === null && s1.kraj === null && s1.k_datu === null && s1.od === vych.od
    && s1.do === vych.do && s1.mena === 'CZK' && !('vyber' in s1) && stejne(s2.lide, [2, 3]) && s2.k_datu === '2026-11-10T09:00:00.000Z',
    'filtr pro server: tým rozbalený na členy z prehled_moznosti.tymy, prázdné seznamy null, k → k_datu, bez vyber', JSON.stringify([s1, s2]));
  const s3 = F.filtrProServer({ ...vych, tym: 99 }, tymy);
  over('A8', stejne(s3.lide, [99]), 'tým, který v možnostech není: jen jeho vedoucí (nikdy [] = všichni)', JSON.stringify(s3.lide));
  const plny = { ...vych, lide: [2], segment: ['chata'], kraj: ['neznamy'], mena: 'EUR', zaklad: 'aktivita', atribuce: 'spravuje', k: '2026-11-10T09:00:00.000Z' };
  const cipy = F.cipyFiltru(plny, { lide: 'Petra', segmenty: { chata: 'Chaty' }, kraje: { neznamy: 'Neznámý kraj' } });
  const texty = cipy.map((c) => c.text);
  const bezSeg = cipy.find((c) => c.klic === 'segment:chata')?.zrus();
  const nic = F.zrusVseFiltry(plny);
  over('A9', texty.length === 7 && texty.includes('Lidé: Petra') && texty.includes('Chaty') && texty.includes('Neznámý kraj') && texty.includes('Měna: EUR')
    && bezSeg && stejne(bezSeg.segment, []) && stejne(bezSeg.lide, [2])
    && stejne({ ...nic }, { ...vych }) ,
    'čipy: lidé, segment, kraj, měna, základ, atribuce, k datu; křížek zruší jen svůj filtr; Zrušit vše vrátí výchozí, období nechá',
    JSON.stringify(texty));
  over('A10', Array.isArray(F.ZALOZKY) && stejne(F.ZALOZKY.map((z) => z.klic), ['vedeni', 'lide', 'pipeline', 'klienti', 'komunikace', 'finance', 'dodani', 'prognoza'])
    && stejne(F.ZALOZKY.map((z) => z.nazev), ['Vedení', 'Lidé a volání', 'Pipeline', 'Klienti a sektory', 'Komunikace a ztráty', 'Finance', 'Dodání', 'Prognóza a data'])
    && stejne((F.NASTAVENI_SEKCE ?? []).map((z) => z.klic), ['cile', 'naklady', 'vyplaty']),
    'osm záložek a nastavení (Cíle, Náklady, Výplaty provizí) v pořadí spec §7.2', JSON.stringify(F.ZALOZKY));
  over('A11', F.odkazZalozky('finance', { ...vych, tym: 4 }) === '/prehled/finance?od=2026-11-01&do=2026-11-30&tym=4',
    'odkaz záložky nese filtr (proklik i sdílený odkaz ho drží)', F.odkazZalozky('finance', { ...vych, tym: 4 }));
});

/* ---------------- M1) „jen aktivní“ přežije adresu (závěrečná recenze, M1) ---------------- */
await blok('M1', async () => {
  if (!LF) return;
  const lide = [
    { id: 1, display_name: 'Albert', role: 'super_admin', active: true, manager_id: null },
    { id: 2, display_name: 'Mikuláš', role: 'super_admin', active: true, manager_id: null },
    { id: 4, display_name: 'Kuba', role: 'admin', active: true, manager_id: 1 },
    { id: 5, display_name: 'Eda', role: 'admin', active: true, manager_id: 2 },
    { id: 6, display_name: 'Bývalý', role: 'admin', active: false, manager_id: 1 },
  ];
  const ja = 1;
  const zacatek = LF.vychoziFiltr(DNES);
  const pruchod = (vyber) => {
    const f = LF.filtrZVyberu(zacatek, vyber, lide, ja);
    const adr = LF.zapisFiltr(f);
    const znovu = LF.ctiFiltr(`?${adr}`, DNES);
    const v = LF.vyberZFiltru(znovu, lide, ja);
    return { f, adr, znovu, v, text: LF.shrnutiVyberu(v, lide, ja), textPred: LF.shrnutiVyberu(vyber, lide, ja) };
  };
  const vsichniAkt = pruchod({ ...LF.VYBER_VSICHNI, jenAktivni: true });
  over('M1a', vsichniAkt.v.jenAktivni === true && vsichniAkt.v.druh === 'vsichni' && vsichniAkt.text === vsichniAkt.textPred && vsichniAkt.text === 'Všichni aktivní (4)'
    && /&aktivni=1/.test(vsichniAkt.adr), 'Všichni + jen aktivní: po adrese tam a zpět zůstane zaškrtnuto i text „Všichni aktivní (4)“', JSON.stringify([vsichniAkt.adr, vsichniAkt.v, vsichniAkt.text]));
  const tymAkt = pruchod(LF.sJenAktivnimi({ druh: 'tym', tymId: 1, ids: [] }, lide, ja, true));
  over('M1b', tymAkt.v.jenAktivni === true && tymAkt.text === tymAkt.textPred, 'Můj tým + jen aktivní: po adrese tam a zpět stejný výběr i text', JSON.stringify([tymAkt.adr, tymAkt.v, tymAkt.text, tymAkt.textPred]));
  const vybraniAkt = pruchod(LF.vyberZIds([4, 5], lide, ja, true));
  over('M1c', vybraniAkt.v.jenAktivni === true && vybraniAkt.text === vybraniAkt.textPred, 'vybraní lidé + jen aktivní: tam a zpět stejný výběr', JSON.stringify([vybraniAkt.adr, vybraniAkt.v, vybraniAkt.text]));
  // staré adresy zůstanou čitelné a bez příznaku se nic nemění; příznak bez lidí a Zrušit vše ho zahodí
  const stara = LF.ctiFiltr('?od=2026-11-01&do=2026-11-30&lide=1,2,4,5', DNES);
  const bezLidi = LF.ctiFiltr('?od=2026-11-01&do=2026-11-30&aktivni=1', DNES);
  const zrus = LF.zrusVseFiltry(LF.ctiFiltr(vsichniAkt.adr.length ? `?${vsichniAkt.adr}` : '', DNES));
  over('M1d', stara.aktivni === undefined && LF.vyberZFiltru(stara, lide, ja).jenAktivni !== true && LF.zapisFiltr(stara) === 'od=2026-11-01&do=2026-11-30&lide=1,2,4,5'
    && bezLidi.aktivni === undefined && LF.zapisFiltr(bezLidi) === 'od=2026-11-01&do=2026-11-30'
    && zrus.aktivni === undefined && !/aktivni/.test(LF.zapisFiltr(zrus)), 'stará adresa bez příznaku čitelná jako dřív; příznak bez lidí a „Zrušit vše“ ho zahodí');
  const vypnuto = LF.filtrZVyberu(vsichniAkt.znovu, LF.VYBER_VSICHNI, lide, ja);
  over('M1e', vypnuto.lide === null && vypnuto.aktivni === undefined && !/aktivni/.test(LF.zapisFiltr(vypnuto)), 'vypnutí jen aktivních (Všichni) příznak z adresy odstraní');
});

/* ---------------- B) předvolby období v pražském čase ---------------- */
await blok('B', async () => {
  if (!F) return;
  const R = (klic, ted) => F.rozsahObdobi(klic, F.dnesVPraze(ted));
  // neděle 29. 3. 2026 23:30 v Praze (letní čas od 2:00) = 21:30 UTC; pondělí 30. 3. 0:30 v Praze = 22:30 UTC
  const nedele = R('tyden', '2026-03-29T21:30:00Z');
  const pondeli = R('tyden', '2026-03-29T22:30:00Z');
  const streda = R('tyden', '2026-11-18T10:00:00Z');
  over('B1', stejne(nedele, { od: '2026-03-23', do: '2026-03-29' }) && stejne(pondeli, { od: '2026-03-30', do: '2026-04-05' })
    && stejne(streda, { od: '2026-11-16', do: '2026-11-22' }),
    'Tento týden = pondělí až neděle podle dne v Praze (o půlnoci v Praze je v UTC ještě neděle)', JSON.stringify([nedele, pondeli, streda]));
  // 1. 11. 2026 0:30 v Praze = 31. 10. 23:30 UTC; říjen má 25. 10. přechod na zimní čas
  const listopad = R('minuly_mesic', '2026-10-31T23:30:00Z');
  const duben = R('minuly_mesic', '2026-03-31T22:30:00Z');
  const leden = R('minuly_mesic', '2027-01-01T00:30:00+01:00');
  over('B2', stejne(listopad, { od: '2026-10-01', do: '2026-10-31' }) && stejne(duben, { od: '2026-03-01', do: '2026-03-31' })
    && stejne(leden, { od: '2026-12-01', do: '2026-12-31' }),
    'Minulý měsíc podle Prahy i přes přechod času a přes konec roku (UTC by dal září a únor)', JSON.stringify([listopad, duben, leden]));
  const vse = Object.fromEntries(['dnes', 'mesic', 'dni30', 'letos'].map((k) => [k, R(k, '2026-10-31T23:30:00Z')]));
  over('B3', stejne(vse, {
    dnes: { od: '2026-11-01', do: '2026-11-01' },
    mesic: { od: '2026-11-01', do: '2026-11-30' },
    dni30: { od: '2026-10-03', do: '2026-11-01' },
    letos: { od: '2026-01-01', do: '2026-12-31' },
  }), 'Dnes, Tento měsíc (celý kalendářní měsíc), Posledních 30 dní (dnešek včetně), Letos v Praze', JSON.stringify(vse));
  const O = (od, doDne) => F.obdobiFiltru(od, doDne, '2026-11-18');
  over('B4', O('2026-11-16', '2026-11-22') === 'tyden' && O('2026-10-01', '2026-10-31') === 'minuly_mesic' && O('2026-11-18', '2026-11-18') === 'dnes'
    && O('2026-11-02', '2026-11-30') === 'vlastni' && stejne(F.OBDOBI.map((o) => o.nazev),
      ['Dnes', 'Tento týden', 'Tento měsíc', 'Minulý měsíc', 'Posledních 30 dní', 'Letos', 'Vlastní']),
    'předvolba se pozná z od a do (jinak Vlastní); názvy předvoleb podle spec §7.2', [O('2026-11-16', '2026-11-22'), O('2026-11-02', '2026-11-30')].join(' '));
  const H = (od, doDne) => { const c = F.obdobiNaCasy(od, doDne); return (c.doMs - c.odMs) / 3600000; };
  const rijen = F.obdobiNaCasy('2026-10-01', '2026-10-31');
  over('B5', H('2026-03-29', '2026-03-29') === 23 && H('2026-10-25', '2026-10-25') === 25 && H('2026-10-01', '2026-10-31') === 745
    && new Date(rijen.odMs).toISOString() === '2026-09-30T22:00:00.000Z' && new Date(rijen.doMs).toISOString() === '2026-10-31T23:00:00.000Z',
    'období = [od 0:00, do+1 0:00) v Praze: 29. 3. má 23 h, 25. 10. má 25 h, říjen 745 h', `${H('2026-03-29', '2026-03-29')} ${H('2026-10-25', '2026-10-25')} ${H('2026-10-01', '2026-10-31')}`);
});

/* ---------------- C) CSV ---------------- */
await blok('C', async () => {
  if (!C) return;
  const sloupce = [
    { klic: 'jmeno', nazev: 'Jméno' },
    { klic: 'pozn', nazev: 'Poznámka; text' },
    { klic: 'castka', nazev: 'Částka', typ: 'castka' },
    { klic: 'den', nazev: 'Den', typ: 'datum' },
    { klic: 'n', nazev: 'Počet', typ: 'cislo' },
  ];
  const radky = [
    { jmeno: '=HYPERLINK("http://x")', pozn: '+420 601 111 222 volat', castka: '-120.50', den: '2026-11-17', n: 3 },
    { jmeno: '-2+3', pozn: 'psát na jan.novak@example.cz', castka: '7000.00', den: '2026-11-18', n: 1.5 },
    { jmeno: '@SUM(A1)', pozn: 'řekl "ne"; zavolat\nzítra', castka: null, den: null, n: null },
    { jmeno: 'Chata U Lípy', pozn: 'tel. 731000113', castka: '153000.00', den: '2026-01-02', n: 0 },
  ];
  const csv = C.doCsv(radky, sloupce);
  const r = csv.split('\r\n');
  over('C1', r[0] === 'Jméno;"Poznámka; text";Částka;Den;Počet' && r.length === 6 && r[5] === '',
    'hlavička, středník mezi sloupci, CRLF a konec řádku i za posledním; buňka se středníkem v uvozovkách', JSON.stringify(r.slice(0, 2)));
  over('C2', r[1].startsWith('"\'=HYPERLINK(""http://x"")"') && r[2].startsWith("'-2+3;") && r.some((x) => x.startsWith("'@SUM(A1);")),
    'vzorce: text začínající =, -, @ (i +) dostane apostrof; uvozovky zdvojené', JSON.stringify(r.slice(1, 4)));
  over('C3', !/601 111 222|731000113|jan\.novak@example\.cz/.test(csv) && /\[telefon skrytý\]/.test(r[1]) && /\[e-mail skrytý\]/.test(r[2]) && /\[telefon skrytý\]/.test(r[4]),
    'telefon (i bez mezer) a e-mail se v textu zamaskují (R20: Přehled je nemá vůbec, CSV pro jistotu)', JSON.stringify([r[1], r[2], r[4]]));
  over('C4', r[1].includes(';-120,50;2026-11-17;3') && r[2].includes(';7000,00;2026-11-18;1,5') && r[4].includes(';153000,00;2026-01-02;0')
    && r[3].includes('"řekl ""ne""; zavolat\nzítra";;;'),
    'částky a čísla s desetinnou čárkou (český Excel), záporná částka bez apostrofu, datum beze změny, prázdné = prázdná buňka; nový řádek v uvozovkách',
    JSON.stringify([r[1], r[2], r[3], r[4]]));
  over('C5', C.CSV_MAX_RADKU === 5000 && C.maskujOsobni('volal +420 731 000 123 a 00420731000124') === 'volal [telefon skrytý] a [telefon skrytý]'
    && C.maskujOsobni('faktura 20260059 ze dne 2026-11-17, cena 7 000 Kč') === 'faktura 20260059 ze dne 2026-11-17, cena 7 000 Kč',
    'strop 5 000 řádků; maska bere telefony, ale ne čísla faktur, data a částky', C.maskujOsobni('faktura 20260059 ze dne 2026-11-17, cena 7 000 Kč'));
});

/* ---------------- D) karta metriky ---------------- */
const zakladMetriky = (m) => ({ verze: 1, castky: [], citatel: null, jmenovatel: null, n: null, pokryti: null, kvalita: 'dostupne', duvod: null, zaklad: 'prodej', proklik: null, ...m });
await blok('D', async () => {
  if (!K) return;
  const h = K.createElement;
  const R = (props) => K.renderToStaticMarkup(h(K.KpiKarta, props));
  const hodnotaZ = (html) => text(/class="kpi-hodnota[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '');
  const nedost = zakladMetriky({ klic: 'plneni_cile', nazev: 'Plnění cíle', kvalita: 'nedostupne', duvod: 'Pro toto období a výběr lidí není zadaný cíl.' });
  const html1 = R({ metrika: nedost, jednotka: 'podil' });
  over('D1', /nedostupn/i.test(text(html1)) && text(html1).includes('Pro toto období a výběr lidí není zadaný cíl.') && !/0/.test(hodnotaZ(html1))
    && hodnotaZ(html1).includes('—') && /kvalita-nedostupne/.test(html1),
    'nedostupná metrika: odznak „nedostupné“, důvod viditelně u čísla, místo čísla pomlčka, nikdy „0“', hodnotaZ(html1));
  const neznamaCena = zakladMetriky({ klic: 'hodnota_prodeju', nazev: 'Hodnota prodejů', kvalita: 'castecne', n: 2, duvod: 'U 2 ze 2 prodejů není přesná cena; součet je jen ze známých cen.',
    castky: [{ mena: 'CZK', hodnota: null, pokryti: { zname: 0, celkem: 2, nezname: 2, podil: 0 } }], pokryti: { zname: 0, celkem: 2, nezname: 2, podil: 0 } });
  const html2 = R({ metrika: neznamaCena, jednotka: 'mena' });
  over('D2', hodnotaZ(html2).includes('—') && !/0\s*Kč/.test(hodnotaZ(html2)) && /částečně/i.test(text(html2)) && /0 ze 2|0 z 2/.test(text(html2)),
    'peníze bez jediné přesné ceny: pomlčka (ne „0 Kč“), odznak „částečně“, pokrytí 0 ze 2', `${hodnotaZ(html2)} | ${text(html2)}`);
  const nula = zakladMetriky({ klic: 'pocet_prodeju', nazev: 'Počet prodejů', hodnota: 0, n: 0, pokryti: { zname: 0, celkem: 0, nezname: 0, podil: null } });
  const html3 = R({ metrika: nula, jednotka: 'pocet' });
  over('D3', hodnotaZ(html3) === '0' && !/nedostupn|částečně/i.test(text(html3)), 'ověřená nula je „0“ bez odznaku neúplnosti', hodnotaZ(html3));
  const spojeno = zakladMetriky({ klic: 'dovolano', nazev: 'Dovoláno', hodnota: 12, n: 12, zaklad: 'aktivita', pokryti: { zname: 12, celkem: 12, nezname: 0, podil: 1 } });
  const html4 = R({ metrika: spojeno, jednotka: 'pocet', definice: { klic: 'dovolano', verze: 1, nazev: 'Dovoláno', definice: 'Hovory s výsledkem jiným než nedovolano …', zaklad: 'aktivita',
    jednotka: 'pocet', zdroje: 'hovory', granularita: 'den', kvalita_pravidla: '—', platne_od: '2026-11-17' } });
  const mira = R({ metrika: zakladMetriky({ klic: 'mira_dovolani', nazev: 'Míra dovolání', hodnota: 0.5, citatel: 6, jmenovatel: 12, n: 12, zaklad: 'aktivita',
    pokryti: { zname: 12, celkem: 12, nezname: 0, podil: 1 } }), jednotka: 'podil' });
  over('D4', text(html4).includes('Spojeno') && !/Dovoláno/.test(text(html4)) && text(mira).includes('Míra spojení') && text(mira).includes('50 %') && /6 z 12/.test(text(mira))
    && K.nazevMetriky('dovolano', 'Dovoláno') === 'Spojeno' && /nedovol/i.test(K.definiceMetriky('dovolano', 'x')),
    'server „dovolano“ (každý výsledek kromě nedovoláno) je v Přehledu „Spojeno“ s vlastní definicí, míra „Míra spojení“ s čitatelem a jmenovatelem',
    `${text(html4)} | ${text(mira)}`);
  const penize = zakladMetriky({ klic: 'hodnota_prodeju', nazev: 'Hodnota prodejů', n: 3, kvalita: 'castecne', duvod: 'U 1 ze 3 prodejů není přesná cena; součet je jen ze známých cen.',
    castky: [{ mena: 'CZK', hodnota: '10500.00', pokryti: { zname: 2, celkem: 2, nezname: 0, podil: 1 } }, { mena: 'EUR', hodnota: '75.00', pokryti: { zname: 0, celkem: 0, nezname: 0, podil: null } }],
    pokryti: { zname: 2, celkem: 3, nezname: 1, podil: 0.666667 }, proklik: { zdroj: 'prodeje', filtr: {} } });
  const html5 = R({ metrika: penize, jednotka: 'mena', onProklik: () => {} });
  over('D5', /10 500 Kč/.test(text(html5)) && /75 €/.test(text(html5)) && /2 ze 3|2 z 3/.test(text(html5)) && /kpi-proklik/.test(html5)
    && /aria-label="Zobrazit řádky: Hodnota prodejů"/.test(html5),
    'peníze po měnách zvlášť (CZK i EUR, nikdy sečtené), pokrytí, tlačítko na řádky se jménem metriky', text(html5));
  const bezProkliku = R({ metrika: { ...penize, proklik: null }, jednotka: 'mena', onProklik: () => {} });
  over('D6', !/kpi-proklik/.test(bezProkliku), 'bez prokliku (R19) karta řádky nenabízí', '');
  const pop = K.renderToStaticMarkup(h(K.DefinicePopover, {
    metrika: zakladMetriky({ klic: 'uspesnost', nazev: 'Úspěšnost návrhů', hodnota: 0.5, zaklad: 'uzavreni' }),
    definice: { klic: 'uspesnost', verze: 1, nazev: 'Úspěšnost návrhů', definice: 'Vyhrané ÷ (vyhrané + ztracené) mezi klienty s návrhem.', zaklad: 'uzavreni', jednotka: 'podil',
      zdroje: 'navrhy, prodeje, kontakty', granularita: 'den, týden, měsíc', kvalita_pravidla: 'castecne, když období začíná před historií stavů', platne_od: '2026-11-17' },
    zdroje: [{ zdroj: 'prodeje', od: '2026-09-09T12:00:00+00:00', aktualni_k: '2026-11-16T14:19:53+00:00' }],
    definiceVerze: '2026-11-17.1',
    vychoziOtevreno: true,
  }));
  over('D7', /role="dialog"/.test(pop) && text(pop).includes('Vyhrané ÷ (vyhrané + ztracené)') && /uzavření|uzavreni/i.test(text(pop)) && /verze 1/i.test(text(pop))
    && text(pop).includes('2026-11-17.1') && /Prodeje/.test(text(pop)) && /16\. 11\. 2026/.test(text(pop)) && /aria-expanded="true"/.test(pop),
    'popis „i“: definice, základ, zdroje s čerstvostí, verze definice a katalogu, tlačítko s aria-expanded', text(pop));
});

/* ---------------- E) mock jako kontrakt ---------------- */
const KLICE_METRIKY = ['castky', 'citatel', 'duvod', 'hodnota', 'jmenovatel', 'klic', 'kvalita', 'n', 'nazev', 'pokryti', 'proklik', 'verze', 'zaklad'];
const CASTKA = /^-?\d+\.\d{2}$/;
/** Všechny metriky v odpovědi (objekt se 13 klíči metriky) i s cestou. */
function metrikyV(o, cesta = 'data', out = []) {
  if (!o || typeof o !== 'object') return out;
  if (!Array.isArray(o) && 'klic' in o && 'kvalita' in o && 'castky' in o && 'proklik' in o) out.push({ cesta, m: o });
  for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object') metrikyV(v, `${cesta}.${k}`, out);
  return out;
}
function vadyMetriky(m, meny) {
  const v = [];
  if (!stejne(Object.keys(m).sort(), KLICE_METRIKY)) v.push(`klíče ${Object.keys(m).sort().join(',')}`);
  if (!['dostupne', 'castecne', 'nedostupne'].includes(m.kvalita)) v.push(`kvalita ${m.kvalita}`);
  if (m.kvalita === 'nedostupne' && (m.hodnota !== null || m.pokryti !== null || m.castky.length !== 0 || m.proklik !== null || !m.duvod)) v.push('nedostupne s hodnotou');
  if (m.kvalita !== 'dostupne' && !m.duvod) v.push('bez důvodu');
  if (m.castky.length > 0) {
    // otevrene je jednotka pocet_a_mena (§3.11): počet v hodnota a známá hodnota v castky
    if (m.hodnota !== null && m.klic !== 'otevrene') v.push('peníze s hodnotou');
    if (!stejne(m.castky.map((c) => c.mena), meny)) v.push(`měny ${m.castky.map((c) => c.mena)}`);
    for (const c of m.castky) if (c.hodnota !== null && !CASTKA.test(c.hodnota)) v.push(`částka ${c.hodnota}`);
  }
  if (m.proklik && (!m.proklik.zdroj || !m.proklik.filtr || !m.proklik.filtr.vyber || m.proklik.filtr.vyber.metrika === undefined)) v.push('proklik bez vyber');
  return v;
}
function vadyObalky(o, sFiltrem) {
  const v = [];
  if (o?.api_verze !== '1' || o?.definice_verze !== '2026-11-17.1') v.push('verze');
  const meta = o?.meta;
  if (!meta || !stejne(Object.keys(meta).sort(), ['casove_pasmo', 'filtr', 'k_datu', 'varovani', 'vygenerovano', 'zdroje'])) v.push('meta klíče');
  if (meta?.casove_pasmo !== 'Europe/Prague') v.push('pásmo');
  if (sFiltrem ? !meta?.filtr || meta.filtr.vyber !== undefined && meta.filtr.vyber !== null && !('metrika' in meta.filtr.vyber) : meta?.filtr !== null) v.push('filtr');
  if (!Array.isArray(meta?.zdroje) || meta.zdroje.some((z) => !stejne(Object.keys(z).sort(), ['aktualni_k', 'od', 'zdroj']))) v.push('zdroje');
  if (!Array.isArray(meta?.varovani) || meta.varovani.some((w) => !w.kod || !w.text)) v.push('varování');
  return v;
}

await blok('E', async () => {
  if (!API?.mockApi) return;
  const api = API.mockApi;
  const albert = 'demo-1-x';
  const mikulas = 'demo-4-x';
  const petra = 'demo-2-x';
  const JEN_SUPER = 'Přehled vidí jen super admin.';
  const FN = ['prehledMoznosti', 'prehledSouhrn', 'prehledRada', 'prehledTrychtyr', 'prehledLide', 'prehledPipeline', 'prehledKlienti', 'prehledKomunikace',
    'prehledFinance', 'prehledDodani', 'prehledPrognoza', 'prehledKvalita', 'prehledAkce', 'prehledRadky', 'prehledKontakt', 'prehledDefinice'];
  const chybi = FN.filter((fn) => typeof api[fn] !== 'function');
  over('E1', chybi.length === 0, 'mock má všechny funkce Přehledu (kontrakt §5)', chybi.join(', '));
  if (chybi.length > 0) return;
  // Volající: stráž je první, i se špatným filtrem a špatnými parametry dostane tutéž větu (R3)
  const volani = {
    prehledMoznosti: () => api.prehledMoznosti(petra),
    prehledSouhrn: () => api.prehledSouhrn(petra, { nesmysl: 1 }),
    prehledRada: () => api.prehledRada(petra, 'nesmysl', 'rok', null),
    prehledTrychtyr: () => api.prehledTrychtyr(petra, null),
    prehledLide: () => api.prehledLide(petra, { lide: [2] }),
    prehledPipeline: () => api.prehledPipeline(petra, null),
    prehledKlienti: () => api.prehledKlienti(petra, null),
    prehledKomunikace: () => api.prehledKomunikace(petra, null),
    prehledFinance: () => api.prehledFinance(petra, null),
    prehledDodani: () => api.prehledDodani(petra, null),
    prehledPrognoza: () => api.prehledPrognoza(petra, null),
    prehledKvalita: () => api.prehledKvalita(petra),
    prehledAkce: () => api.prehledAkce(petra, null),
    prehledRadky: () => api.prehledRadky(petra, 'nesmysl', null, 'x', 0),
    prehledKontakt: () => api.prehledKontakt(petra, 999999),
    prehledDefinice: () => api.prehledDefinice(petra),
  };
  for (const [fn, f] of Object.entries(volani)) await chyba(`E2 ${fn}`, f, JEN_SUPER, `${fn}: Volající dostane „${JEN_SUPER}“ před kontrolou parametrů`);
  await chyba('E2 relace', () => api.prehledSouhrn('demo-999-x', null), 'Neplatná nebo vypršelá relace. Přihlaste se znovu.', 'neplatná relace = věta relace');

  const DNES_P = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const vychozi = F ? F.filtrProServer(F.vychoziFiltr(DNES_P), []) : { od: `${DNES_P.slice(0, 8)}01`, do: DNES_P };
  const souhrn = await api.prehledSouhrn(albert, vychozi);
  const moz = await api.prehledMoznosti(albert);
  const def = await api.prehledDefinice(albert);
  const jednotka = Object.fromEntries((def?.data?.metriky ?? []).map((m) => [m.klic, m.jednotka]));
  over('E3', vadyObalky(souhrn, true).length === 0 && vadyObalky(moz, false).length === 0 && vadyObalky(def, false).length === 0
    && stejne(Object.keys(souhrn.data.karty), ['hodnota_prodeju', 'inkaso', 'pocet_prodeju', 'plneni_cile', 'uspesnost', 'otevrene', 'odhad_mesic', 'k_zasahu'])
    && 'cil' in souhrn.data && def.data.metriky.length === 70 && def.data.duvody.length === 8 && def.data.stavy.length === 20,
    'obálka (§2.5): verze, meta se šesti klíči, filtr jen u funkcí s p_filtr; souhrn má 8 karet a cil; katalog 70 metrik, 8 důvodů, 20 stavů',
    JSON.stringify({ s: vadyObalky(souhrn, true), m: vadyObalky(moz, false), d: vadyObalky(def, false), n: def?.data?.metriky?.length }));
  const mozData = moz.data;
  over('E4', mozData.ja.user_id === 1 && mozData.ja.je_albert === true && mozData.lide.length === 5 && mozData.tymy.length === 2
    && stejne(mozData.tymy.map((t) => [t.id, t.clenove]), [[1, [1, 2, 5]], [4, [3, 4]]]) && stejne(mozData.meny, ['CZK', 'EUR'])
    && mozData.zdroje.length === 22 && mozData.metriky.length === 70 && 'tick_at' in mozData.cerstvost && mozData.firma_smim_cil === true
    && mozData.segmenty[0].klic === 'chata' && mozData.kraje.at(-1).klic === 'neznamy',
    'prehled_moznosti: já, 5 lidí, 2 týmy s členy, měny, 22 zdrojů, dostupnost 70 metrik, čerstvost; cíl firmy smí jen Albert',
    JSON.stringify({ ja: mozData.ja, tymy: mozData.tymy, zdroje: mozData.zdroje?.length }));
  const mozM = await api.prehledMoznosti(mikulas);
  over('E4b', mozM.data.firma_smim_cil === false && mozM.data.ja.je_albert === false
    && mozM.data.lide.find((l) => l.id === 3)?.smim_vyplatu === true && mozM.data.lide.find((l) => l.id === 2)?.smim_vyplatu === false,
    'Mikuláš: cíl firmy ne, výplatu jen svému týmu (Honza ano, Petra ne)', JSON.stringify(mozM.data.lide.map((l) => [l.id, l.smim_cil, l.smim_vyplatu])));

  // každá metrika v každé odpovědi: 13 klíčů, peníze jako text po měnách filtru, nedostupné bez hodnoty
  const odpovedi = {
    souhrn,
    rada: await api.prehledRada(albert, 'hodnota_prodeju', 'tyden', vychozi),
    trychtyr: await api.prehledTrychtyr(albert, vychozi),
    lide: await api.prehledLide(albert, vychozi),
    pipeline: await api.prehledPipeline(albert, vychozi),
    klienti: await api.prehledKlienti(albert, vychozi),
    komunikace: await api.prehledKomunikace(albert, vychozi),
    finance: await api.prehledFinance(albert, vychozi),
    dodani: await api.prehledDodani(albert, vychozi),
    prognoza: await api.prehledPrognoza(albert, vychozi),
    akce: await api.prehledAkce(albert, vychozi),
  };
  const kvalita = await api.prehledKvalita(albert);
  const vady = [];
  for (const [jmeno, o] of Object.entries(odpovedi)) {
    for (const x of vadyObalky(o, true)) vady.push(`${jmeno}: ${x}`);
    for (const { cesta, m } of metrikyV(o.data)) for (const x of vadyMetriky(m, ['CZK'])) vady.push(`${jmeno} ${cesta}: ${x}`);
  }
  for (const x of vadyObalky(kvalita, false)) vady.push(`kvalita: ${x}`);
  for (const { cesta, m } of metrikyV(kvalita.data)) for (const x of vadyMetriky(m, ['CZK'])) vady.push(`kvalita ${cesta}: ${x}`);
  over('E5', vady.length === 0 && metrikyV(odpovedi.finance.data).length >= 20, 'všechny odpovědi: obálka a každá metrika podle §2.6 (13 klíčů, peníze po měnách, nedostupné bez čísla)', vady.slice(0, 6).join(' | '));
  const tvary = {
    rada: ['cile', 'body', 'metrika', 'proklik', 'zrnitost'],
    trychtyr: ['kohorta', 'kroky', 'po_navrhu', 'stavy'],
    pipeline: ['faze', 'kalibrace_hvezdy', 'kalibrace_znamky', 'kohorty', 'pohyby', 'rychlost_navrhu', 'slevy'],
    klienti: ['hodnoceni_webu', 'koncentrace', 'podle_kraje', 'podle_oboru', 'podle_segmentu', 'sablony', 'zaklad'],
    komunikace: ['cekani', 'duvody', 'zpravy'],
    finance: ['faktury', 'hosting', 'naklady', 'platby', 'pohledavky', 'pokryti_nakladu', 'prodeje', 'prodeje_mimo_prodej', 'provize', 'slevy', 'vysledek'],
    dodani: ['blokace', 'domeny', 'faze', 'obnovy_hostingu', 'prace'],
    prognoza: ['do', 'mesic', 'od', 'otevrene', 'potvrzene', 'presnost', 'scenare', 'stitek', 'zbyva_dni'],
    akce: ['pripady', 'souhrn'],
  };
  const spatneTvary = Object.entries(tvary).filter(([k, klice]) => !stejne(Object.keys(odpovedi[k].data).sort(), [...klice].sort())).map(([k]) => `${k}: ${Object.keys(odpovedi[k].data).sort()}`);
  over('E6', spatneTvary.length === 0 && odpovedi.trychtyr.data.kroky.length === 7 && odpovedi.trychtyr.data.po_navrhu.kroky.length === 9
    && odpovedi.pipeline.data.faze.length === 9 && odpovedi.dodani.data.faze.length === 8 && odpovedi.prognoza.data.otevrene.length === 4
    && odpovedi.finance.data.naklady.kategorie.length === 6 && odpovedi.akce.data.souhrn.podle_signalu.length === 7 && odpovedi.prognoza.data.stitek === 'nevalidovaný odhad'
    && stejne(Object.keys(kvalita.data).sort(), ['casovac', 'ceny', 'historie', 'navrhy_bez_emailu', 'nejasne_vazby', 'platby_bez_faktury', 'zdroje']),
    'data funkcí mají klíče §7 (trychtýř 7 a 9 kroků, 9 fází pipeline, 8 fází dodání, 4 skupiny prognózy, 6 kategorií nákladů, 7 signálů)',
    spatneTvary.join(' | '));
  // karty mají v demu hodnoty (koordinátor 18. 11. 2026: „a demo dataset big enough that every card has values“)
  const karty = souhrn.data.karty;
  const bezHodnoty = Object.entries(karty).filter(([, m]) => m.hodnota === null && !m.castky.some((c) => c.hodnota !== null)).map(([k, m]) => `${k}: ${m.duvod}`);
  over('E7', bezHodnoty.length === 0 && karty.plneni_cile.hodnota !== null && souhrn.data.cil?.metrika === 'hodnota_prodeju' && karty.k_zasahu.hodnota > 0
    && karty.otevrene.hodnota > 0 && karty.inkaso.castky[0].hodnota !== '0.00' && karty.uspesnost.jmenovatel > 0,
    'demo: všech 8 karet má hodnotu (plnění cíle s cílem firmy na tento měsíc, inkaso nenulové, úspěšnost s uzavřenými)', bezHodnoty.join(' | '));
  // proklik každé karty: řádky se stejným součtem, po stránkách (limit 3) stejně jako najednou
  const vsechnyRadky = async (proklik, limit) => {
    const radky = [];
    let kurzor = null;
    let prvni = null;
    for (let i = 0; i < 400; i += 1) {
      const o = await api.prehledRadky(albert, proklik.zdroj, proklik.filtr, kurzor, limit);
      prvni = prvni ?? o;
      radky.push(...o.data.radky);
      kurzor = o.data.dalsi_kurzor;
      if (!kurzor) break;
    }
    return { radky, prvni };
  };
  const nesedi = [];
  for (const [klic, m] of Object.entries(karty)) {
    if (!m.proklik) { nesedi.push(`${klic}: bez prokliku`); continue; }
    const { radky, prvni } = await vsechnyRadky(m.proklik, 3);
    const naraz = await api.prehledRadky(albert, m.proklik.zdroj, m.proklik.filtr, null, 200);
    const d = prvni.data;
    if (new Set(radky.map((r) => r.radek_id)).size !== radky.length) nesedi.push(`${klic}: duplicitní radek_id`);
    if (radky.length !== d.celkem || naraz.data.radky.length !== d.celkem) nesedi.push(`${klic}: stránky ${radky.length} / celkem ${d.celkem}`);
    if (!stejne(radky.map((r) => r.radek_id), naraz.data.radky.map((r) => r.radek_id))) nesedi.push(`${klic}: pořadí stránek`);
    if (radky.some((r) => r.zdroj !== m.proklik.zdroj)) nesedi.push(`${klic}: zdroj řádku`);
    const j = jednotka[klic];
    if (klic === 'odhad_mesic') {
      if (d.celkem !== m.n) nesedi.push(`${klic}: celkem ${d.celkem} ≠ n ${m.n}`);
    } else if (klic === 'plneni_cile') {
      const czk = d.soucty.find((s) => s.mena === 'CZK')?.hodnota;
      if (Number(czk) !== m.citatel) nesedi.push(`${klic}: součet ${czk} ≠ čitatel ${m.citatel}`);
    } else if (j === 'podil') {
      if (d.celkem !== m.jmenovatel) nesedi.push(`${klic}: celkem ${d.celkem} ≠ jmenovatel ${m.jmenovatel}`);
    } else if (j === 'pocet' || j === 'pocet_a_mena') {
      if (d.celkem !== m.hodnota) nesedi.push(`${klic}: celkem ${d.celkem} ≠ hodnota ${m.hodnota}`);
    }
    if (j === 'mena' && klic !== 'odhad_mesic' || j === 'pocet_a_mena') {
      const karta = m.castky.map((c) => ({ mena: c.mena, hodnota: c.hodnota }));
      if (!stejne(d.soucty, karta)) nesedi.push(`${klic}: součty ${JSON.stringify(d.soucty)} ≠ karta ${JSON.stringify(karta)}`);
    }
  }
  over('E8', nesedi.length === 0, 'proklik každé karty: řádky (i po 3 na stránku) sedí s kartou: počet = hodnota nebo jmenovatel, součty = částky karty', nesedi.join(' | '));
  // R20: v řádcích nikdy telefon ani e-mail
  const vse = [];
  for (const z of ['kontakty', 'hovory', 'prodeje', 'faktury', 'platby', 'naklady', 'provize', 'odmitnuti', 'zpravy', 'akce', 'prace']) {
    const o = await api.prehledRadky(albert, z, { od: '2026-01-01', do: DNES_P }, null, 200);
    vse.push(...o.data.radky);
    if (o.data.zdroj !== z) vse.push({ spatnyZdroj: z });
  }
  const json = JSON.stringify(vse);
  over('E9', vse.length > 20 && !/"(phone|email)":/.test(json) && !/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(json.replace(/mail\.google\.com\/mail\/u\/\?authuser=[^#"]+/g, '')) && !/\+420/.test(json)
    && !json.includes('spatnyZdroj'),
    'R20: řádky všech 11 zdrojů bez telefonu a e-mailu (kromě schránky v odkazu Gmailu)', json.slice(0, 200));
  // kurzor patří k filtru a zdroji; chybové věty doslova
  const h1 = await api.prehledRadky(albert, 'hovory', { od: '2026-01-01', do: DNES_P }, null, 1);
  over('E10', h1.data.radky.length === 1 && typeof h1.data.dalsi_kurzor === 'string' && h1.data.celkem > 1 && h1.meta.filtr.vyber === null,
    'stránka po 1 řádku má kurzor dál; meta.filtr řádků bez vyber má vyber null', JSON.stringify(h1.data.celkem));
  await chyba('E11a', () => api.prehledRadky(albert, 'hovory', { od: '2026-02-01', do: DNES_P }, h1.data.dalsi_kurzor, 1),
    'Kurzor patří k jinému filtru nebo zdroji; načtěte řádky znovu od začátku.', 'kurzor s jiným filtrem odmítnut');
  await chyba('E11b', () => api.prehledRadky(albert, 'prodeje', { od: '2026-01-01', do: DNES_P }, h1.data.dalsi_kurzor, 1),
    'Kurzor patří k jinému filtru nebo zdroji; načtěte řádky znovu od začátku.', 'kurzor s jiným zdrojem odmítnut');
  await chyba('E11c', () => api.prehledRadky(albert, 'hovory', null, 'nesmysl', 1), 'Neplatný kurzor.', 'nečitelný kurzor = Neplatný kurzor.');
  await chyba('E11d', () => api.prehledRadky(albert, 'hovory', null, null, 0), 'Neplatný limit: 0 (povoleno 1 až 200).', 'limit 0 odmítnut');
  await chyba('E11e', () => api.prehledRadky(albert, 'x', null, null, 50),
    'Neplatný zdroj řádků: x. Povolené: kontakty, hovory, prodeje, faktury, platby, naklady, provize, odmitnuti, zpravy, akce, prace.', 'neznámý zdroj odmítnut');
  await chyba('E11f', () => api.prehledRadky(albert, 'hovory', { vyber: { metrika: 'inkaso' } }, null, 50), 'Neplatný filtr: vyber.metrika', 'metrika, která ke zdroji nepatří');
  await chyba('E11g', () => api.prehledSouhrn(albert, { vyber: { metrika: 'inkaso' } }), 'Neplatný filtr: vyber', 'vyber mimo prehled_radky odmítnut');
  await chyba('E11h', () => api.prehledRada(albert, 'nesmysl', 'den', null),
    'Neplatná metrika řady: nesmysl. Povolené: hovory, dovolano, zajem, navrhy, pocet_prodeju, hodnota_prodeju, inkaso, naklady_celkem, odpracovane_hodiny.', 'neznámá metrika řady');
  await chyba('E11i', () => api.prehledRada(albert, 'hovory', 'rok', null), 'Neplatná zrnitost: rok. Povolené: den, tyden, mesic.', 'neznámá zrnitost');
  await chyba('E11j', () => api.prehledKontakt(albert, 999999), 'Kontakt id=999999 neexistuje.', 'neexistující kontakt');
  await chyba('E11k', () => api.prehledSouhrn(albert, { mena: 'USD' }), 'Neplatný filtr: mena', 'neznámá měna');
  // obě měny: dvě položky, nikdy sečtené; cíl jen pro jednu měnu
  const obe = await api.prehledSouhrn(albert, { ...vychozi, mena: 'obe' });
  over('E12', obe.data.karty.hodnota_prodeju.castky.length === 2 && stejne(obe.data.karty.hodnota_prodeju.castky.map((c) => c.mena), ['CZK', 'EUR'])
    && obe.data.karty.plneni_cile.hodnota === null && obe.data.karty.plneni_cile.kvalita === 'nedostupne'
    && obe.data.karty.plneni_cile.duvod === 'Plnění cíle se počítá jen pro jednu měnu; vyberte CZK nebo EUR.'
    && obe.meta.varovani.some((w) => w.kod === 'MENY_ODDELENE'),
    'měna „obe“: CZK a EUR zvlášť, plnění cíle nedostupné s větou §2.10, varování MENY_ODDELENE', JSON.stringify(obe.data.karty.plneni_cile));
  const seg = await api.prehledSouhrn(albert, { ...vychozi, segment: ['chata'] });
  over('E13', seg.data.karty.plneni_cile.duvod === 'Cíle nejsou rozdělené podle segmentu, oboru ani kraje; zrušte tyto filtry.' && seg.meta.filtr.segment[0] === 'chata',
    'filtr segmentu: cíl se nepoužije (věta §2.10)', seg.data.karty.plneni_cile.duvod);
  // řada: sloupce týdnů po–ne, oříznuté na období, peníze po měnách
  const rada = odpovedi.rada.data;
  over('E14', rada.zrnitost === 'tyden' && rada.body.length >= 4 && rada.body[0].od === vychozi.od && rada.body.at(-1).do === vychozi.do
    && rada.body.every((b) => Array.isArray(b.castky) && (b.hodnota === null)) && rada.proklik?.zdroj === 'prodeje',
    'řada hodnoty prodejů po týdnech: od začátku do konce období, peníze v castky (hodnota null), proklik na prodeje', JSON.stringify(rada.body.map((b) => [b.od, b.do, b.uplny])));
  // kontakt: časová osa bez telefonu a e-mailu, skutečný stav
  const k = await api.prehledKontakt(albert, 22);
  over('E15', k.data.kontakt.kontakt_id === 22 && k.data.kontakt.status === 'faktura_odeslana' && Array.isArray(k.data.udalosti) && k.data.udalosti.length >= 3
    && !/"(phone|email)":|@example\.cz|\+420/.test(JSON.stringify(k)) && k.meta.filtr === null && 'prvni_zajem' in k.data.atribuce,
    'prehled_kontakt: skutečný stav, atribuce, časová osa (hovor, prodej, faktura …) bez telefonu a e-mailu', JSON.stringify(k.data.udalosti.map((u) => u.druh)));
  // historie volání mocku: Volající volání Přehledu dostal odmítnuté
  const log = globalThis.__volackaDemoTest.volani ?? [];
  over('E16', log.filter((v) => /^prehled/.test(v.fn) && v.ok === false && v.chyba === JEN_SUPER).length >= 16,
    'háček mocku zapisuje volání Přehledu i s odmítnutím (e2e podle něj hlídá Volajícího)', String(log.length));
});

/* ---------------- F) supabase.ts ---------------- */
await blok('F', async () => {
  if (!API?.supabaseApi) return;
  const sb = API.supabaseApi;
  over('F1', typeof API.BEZ_073_PREHLED === 'string' && API.BEZ_073_PREHLED.startsWith('Přehled potřebuje migraci 073'),
    'hláška serveru bez migrace 073 začíná „Přehled potřebuje migraci 073“', String(API.BEZ_073_PREHLED));
  odpoved = { status: 404, telo: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.prehled_souhrn' }) };
  const vysledky = [];
  for (const [fn, f] of [
    ['prehledMoznosti', () => sb.prehledMoznosti('t')], ['prehledSouhrn', () => sb.prehledSouhrn('t', {})], ['prehledRada', () => sb.prehledRada('t', 'hovory', 'den', {})],
    ['prehledTrychtyr', () => sb.prehledTrychtyr('t', {})], ['prehledPipeline', () => sb.prehledPipeline('t', {})], ['prehledKlienti', () => sb.prehledKlienti('t', {})],
    ['prehledKomunikace', () => sb.prehledKomunikace('t', {})], ['prehledFinance', () => sb.prehledFinance('t', {})], ['prehledDodani', () => sb.prehledDodani('t', {})],
    ['prehledPrognoza', () => sb.prehledPrognoza('t', {})], ['prehledKvalita', () => sb.prehledKvalita('t')], ['prehledAkce', () => sb.prehledAkce('t', {})],
    ['prehledRadky', () => sb.prehledRadky('t', 'hovory', {}, null, 50)], ['prehledKontakt', () => sb.prehledKontakt('t', 5)], ['prehledDefinice', () => sb.prehledDefinice('t')],
  ]) {
    try {
      await f();
      vysledky.push(`${fn}: prošlo`);
    } catch (e) {
      if (e?.message !== API.BEZ_073_PREHLED) vysledky.push(`${fn}: ${e?.message}`);
    }
  }
  over('F2', vysledky.length === 0, 'PGRST202 u každé funkce Přehledu = chyba „Přehled potřebuje migraci 073“ (žádná ukázková data místo skutečných)', vysledky.join(' | '));
  odpoved = { status: 400, telo: JSON.stringify({ code: 'P0001', message: 'Přehled vidí jen super admin.' }) };
  let veta = '';
  try { await sb.prehledSouhrn('t', {}); } catch (e) { veta = e?.message; }
  over('F3', veta === 'Přehled vidí jen super admin.', 'jiná chyba serveru projde doslova', veta);
  odpoved = { status: 200, telo: JSON.stringify({ api_verze: '1', data: {} }) };
  await sb.prehledRadky('t', 'prodeje', { od: '2026-11-01', do: '2026-11-30', vyber: { metrika: 'hodnota_prodeju' } }, 'abc', 200);
  const r = odeslano[odeslano.length - 1];
  await sb.prehledRada('t', 'inkaso', 'tyden', { od: '2026-11-01' });
  const rr = odeslano[odeslano.length - 1];
  await sb.prehledKontakt('t', 22);
  const kk = odeslano[odeslano.length - 1];
  // oprava po závěrečné recenzi (M5): anglické texty PostgreSQL česky, české věty serveru beze změny
  const veta2 = async (telo, status = 400, volani = () => sb.prehledSouhrn('t', {})) => {
    odpoved = { status, telo: JSON.stringify(telo) };
    try { await volani(); return 'prošlo'; } catch (e) { return e?.message; }
  };
  const anglicke = [
    await veta2({ code: '57014', message: 'canceling statement due to statement timeout' }),
    await veta2({ message: 'canceling statement due to statement timeout' }),
    await veta2({ code: '57014', message: 'neco jineho' }, 500, () => sb.prehledLide('t', {})),
  ];
  over('F5a', anglicke.every((t) => t === API.CHYBA_CASOVY_LIMIT) && /^Výpočet trval příliš dlouho/.test(API.CHYBA_CASOVY_LIMIT),
    'statement timeout (kód 57014 i jen anglický text) = česká věta o dlouhém výpočtu, Přehled i prehled_lide', JSON.stringify(anglicke));
  const jine = [
    await veta2({ code: '42P01', message: 'relation "x" does not exist' }),
    await veta2({ code: 'XX000', message: 'internal error' }),
    await veta2({ message: 'Connection terminated unexpectedly' }, 502),
  ];
  over('F5b', jine.every((t) => t === API.CHYBA_SERVERU_OBECNA) && !jine.some((t) => /relation|internal|Connection/i.test(t)),
    'jiné anglické chyby serveru = obecná česká věta bez syrového textu', JSON.stringify(jine));
  const ceske = [
    'Přehled vidí jen super admin.',
    'Neplatný filtr: od je v budoucnosti.',
    'Filtr lidí je zadaný dvakrát (p_user_ids i p_filtr.lide).',
    'Neplatný filtr: k_datu je před začátkem období.',
  ];
  const zpet = [];
  for (const t of ceske) zpet.push(await veta2({ code: 'P0001', message: t }));
  zpet.push(await veta2({ message: 'Filtr lidí je zadaný dvakrát' }));
  zpet.push(await veta2({ message: 'Chyba serveru (500)' }, 500));
  odpoved = { status: 404, telo: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function' }) };
  let bez073 = '';
  try { await sb.prehledSouhrn('t', {}); } catch (e) { bez073 = e?.message; }
  over('F5c', zpet.slice(0, 4).every((t, i) => t === ceske[i]) && zpet[4] === 'Filtr lidí je zadaný dvakrát' && zpet[5] === 'Chyba serveru (500)' && bez073 === API.BEZ_073_PREHLED,
    'české věty serveru (P0001, s diakritikou, obecná „Chyba serveru“) a hláška BEZ_073 zůstanou doslova', JSON.stringify(zpet));
  over('F4', r.fn === 'prehled_radky' && stejne(r.body, { p_token: 't', p_zdroj: 'prodeje', p_filtr: { od: '2026-11-01', do: '2026-11-30', vyber: { metrika: 'hodnota_prodeju' } }, p_kurzor: 'abc', p_limit: 200 })
    && rr.fn === 'prehled_rada' && stejne(rr.body, { p_token: 't', p_metrika: 'inkaso', p_zrnitost: 'tyden', p_filtr: { od: '2026-11-01' } })
    && kk.fn === 'prehled_kontakt' && stejne(kk.body, { p_token: 't', p_kontakt_id: 22 }),
    'co jde serveru: prehled_radky (zdroj, filtr s vyber beze změny, kurzor, limit), prehled_rada, prehled_kontakt', JSON.stringify([r, rr, kk]));
});

/* ---------------- R) oprava po recenzi (task-13-fixes.md, 18. 11. 2026) ---------------- */
await blok('R', async () => {
  // 1. rozepsané datum: do adresy jde jen celé platné datum od 2020, obrácené období je chyba u pole (nic se nepřepíše potichu)
  if (F) {
    const okF = typeof F.chybaObdobi === 'function' && typeof F.celyDen === 'function' && typeof F.chybaKDatu === 'function';
    over('R1', okF && F.chybaObdobi('2026-11-01', '2026-11-30') === null && F.chybaObdobi('2026-11-20', '2026-11-01') === 'Začátek období je po jeho konci.'
      && F.chybaObdobi('2019-12-31', '2020-01-05') === 'Období může začínat nejdřív 1. 1. 2020.' && F.chybaObdobi('2020-01-01', '2026-11-18') === 'Období může mít nejvýš 730 dní.'
      && F.chybaObdobi('0202-11-01', '2026-11-30') === 'Období může začínat nejdřív 1. 1. 2020.' && F.chybaObdobi('2026-02-30', '2026-03-01') === 'Zadejte celé datum začátku i konce.'
      && !F.celyDen('0202-11-01') && !F.celyDen('2025-11-3') && F.celyDen('2025-11-01')
      && F.chybaKDatu('', '2026-11-18') === null && F.chybaKDatu('2026-11-19', '2026-11-18') === 'K datu nemůže být v budoucnosti.'
      && F.chybaKDatu('0020-11-18', '2026-11-18') === 'K datu může být nejdřív 1. 1. 2020.' && F.chybaKDatu('2026-11-10', '2026-11-18') === null,
      'rozepsané datum: celé platné datum od 1. 1. 2020; obrácené, dlouhé a neúplné období i budoucí k datu = věta u pole', okF ? '' : 'chybí chybaObdobi / celyDen / chybaKDatu');
  }
  if (K) {
    const m0 = (klic, hodnota, kvalita = 'dostupne', castky = []) => zakladMetriky({ klic, nazev: klic, hodnota, kvalita, castky, duvod: kvalita === 'nedostupne' ? 'x' : null });
    const karty = (pole) => Object.fromEntries(pole.map((m) => [m.klic, m]));
    const vse = ['hodnota_prodeju', 'inkaso', 'pocet_prodeju', 'plneni_cile', 'uspesnost', 'otevrene', 'odhad_mesic', 'k_zasahu'];
    const nedostupne = karty(vse.map((k) => m0(k, null, 'nedostupne')));
    const nuly = karty(vse.map((k, i) => (i < 2 ? m0(k, null, 'dostupne', [{ mena: 'CZK', hodnota: '0.00', pokryti: { zname: 0, celkem: 0, nezname: 0, podil: null } }]) : i === 3 ? m0(k, null, 'nedostupne') : m0(k, 0))));
    const neco = { ...nuly, k_zasahu: m0('k_zasahu', 2) };
    over('R2', typeof K.souhrnPrazdny === 'function' && K.souhrnPrazdny(nedostupne) === false && K.souhrnPrazdny(nuly) === true && K.souhrnPrazdny(neco) === false,
      'prázdno jen z dostupných čísel (aspoň jedno): samé „nedostupné“ prázdno nejsou, nuly a nedostupné ano, jedno číslo ne', '');
    const dveMeny = (cz, eu) => zakladMetriky({ klic: 'hodnota_prodeju', nazev: 'Hodnota prodejů', kvalita: 'castecne', duvod: 'x', n: 2, pokryti: { zname: 1, celkem: 2, nezname: 1, podil: 0.5 },
      castky: [{ mena: 'CZK', hodnota: cz, pokryti: { zname: 1, celkem: 1, nezname: 0, podil: 1 } }, { mena: 'EUR', hodnota: eu, pokryti: { zname: 0, celkem: 0, nezname: 0, podil: null } }] });
    const f1 = K.formatMetriky(dveMeny('10500.00', null), 'mena');
    const f2 = K.formatMetriky(dveMeny(null, '75.00'), 'mena');
    const t = (x) => text([x.hlavni, ...x.dalsi].join(' | '));
    over('R3', t(f1) === '10 500 Kč | — €' && t(f2) === '— Kč | 75 €' && !f1.prazdna && !f2.prazdna,
      'obě měny: neznámá částka jedné měny je „— €“ nebo „— Kč“, nikdy nezmizí', `${t(f1)} / ${t(f2)}`);
    const otevrene = zakladMetriky({ klic: 'otevrene', nazev: 'Otevřené obchody', hodnota: 4, n: 4, pokryti: { zname: 3, celkem: 4, nezname: 1, podil: 0.75 },
      castky: [{ mena: 'CZK', hodnota: '10500.00', pokryti: { zname: 3, celkem: 3, nezname: 0, podil: 1 } }, { mena: 'EUR', hodnota: null, pokryti: { zname: 0, celkem: 1, nezname: 1, podil: 0 } }] });
    const f3 = K.formatMetriky(otevrene, 'pocet_a_mena');
    over('R3b', t(f3) === '4 | známá hodnota 10 500 Kč | hodnota v EUR neznámá',
      'počet s penězi při obou měnách: měna bez známé částky „hodnota v EUR neznámá“, nikdy nezmizí', t(f3));
    over('R4', typeof K.jeChybaKurzoru === 'function' && K.jeChybaKurzoru('Kurzor patří k jinému filtru nebo zdroji; načtěte řádky znovu od začátku.')
      && K.jeChybaKurzoru('Neplatný kurzor.') && !K.jeChybaKurzoru('Přehled vidí jen super admin.'),
      'chyba kurzoru se pozná (panel pak začne znovu od první stránky)', '');
    const soucty = [{ mena: 'CZK', hodnota: '16887.91' }, { mena: 'EUR', hodnota: '75.50' }];
    over('R8', text(K.souctyText(soucty)) === '16 888 Kč · 75,50 €' && typeof K.souctyPresne === 'function' && text(K.souctyPresne(soucty)) === '16 887,91 Kč · 75,50 €'
      && text(K.souctyText([{ mena: 'CZK', hodnota: '100.00' }, { mena: 'EUR', hodnota: null }])) === '100 Kč · — €',
      'součet řádků jako karta (koruny celé), přesná částka zvlášť do bubliny; neznámá měna „— €“', `${text(K.souctyText(soucty))}`);
    const h = K.createElement;
    const ted = new Date().toISOString();
    const pop = K.renderToStaticMarkup(h(K.DefinicePopover, {
      metrika: zakladMetriky({ klic: 'hovory', nazev: 'Hovory', zaklad: 'aktivita' }),
      definice: { klic: 'hovory', verze: 1, nazev: 'Hovory', definice: 'Řádky call_log v období.', zaklad: 'aktivita', jednotka: 'pocet', zdroje: 'hovory', granularita: 'den',
        kvalita_pravidla: 'x', platne_od: '2026-11-17' },
      zdroje: [{ zdroj: 'hovory', od: '2026-09-02T07:41:10+00:00', aktualni_k: ted }], definiceVerze: '2026-11-17.1', vychoziOtevreno: true,
    }));
    over('R9', !/\bk dnes\b/.test(text(pop)) && /aktuální: dnes/.test(text(pop)) && !/\bData k\b/.test(src('src/pages/prehled/PrehledPage.tsx'))
      && !/k \$\{casText\(/.test(src('src/components/prehled/ProklikPanel.tsx')),
      'čeština: nikdy „k dnes …“ (popis „i“, hlavička „Data:“, panel řádků „stav k datu:“)', text(pop).slice(0, 200));
    const odm = K.SLOUPCE_RADKU.odmitnuti.find((x) => x.klic === 'text');
    over('R11a', /\[telefon skrytý\]/.test(odm.text({ text: 'volat 731000113 nebo psát jan@example.cz' })) && /\[e-mail skrytý\]/.test(odm.text({ text: 'psát jan@example.cz' })),
      'volný text v panelu řádků je zamaskovaný stejně jako v CSV', odm.text({ text: 'volat 731000113' }));
    over('R11b', typeof K.odkazGmailu === 'function' && K.odkazGmailu('https://mail.google.com/mail/u/?authuser=domovwebu@gmail.com#all/18c1') === 'https://mail.google.com/mail/u/?authuser=domovwebu@gmail.com#all/18c1'
      && K.odkazGmailu('javascript:alert(1)') === null && K.odkazGmailu('https://zly.example/mail.google.com') === null && K.odkazGmailu('http://mail.google.com/x') === null,
      'odkaz do Gmailu jen https://mail.google.com, jinak žádný odkaz', '');
    const kartaH4 = K.renderToStaticMarkup(h(K.KpiKarta, { metrika: zakladMetriky({ klic: 'hovory', nazev: 'Hovory', hodnota: 3, n: 3, pokryti: { zname: 3, celkem: 3, nezname: 0, podil: 1 } }), jednotka: 'pocet', uroven: 4 }));
    // ⚠ úkol 14a: obecná záložka úkolu 13 je pryč; karty pod nadpisem skupiny (h3) dávají záložky přes Karty s uroven 4
    // (NAHRAZUJE kontrolu zdroje ZalozkaObecna.tsx, jejíž druhá část byla mrtvá, minor-findings úkolu 13)
    over('R11c', /<h4 class="kpi-nazev"/.test(kartaH4) && /uroven=\{4\}/.test(src('src/pages/prehled/ZalozkaFinance.tsx')) && /uroven=\{uroven\}/.test(src('src/pages/prehled/Karty.tsx')),
      'nadpisy: karta pod nadpisem skupiny (h3) je h4 (záložky předají uroven 4 přes Karty)', kartaH4.slice(0, 120));
    over('R11d', /zrusenoCsv|csvZruseno/.test(src('src/components/prehled/ProklikPanel.tsx')) && /return \(\) => \{[\s\S]{0,200}(zrusenoCsv|csvZruseno)\.current = true/.test(src('src/components/prehled/ProklikPanel.tsx')),
      'běžící CSV se zavřením panelu zruší (žádné stažení po zavření)', '');
  }
  if (API?.mockApi) {
    const t = await API.mockApi.prehledTrychtyr('demo-1-x', null);
    const kroky = t.data.kroky.map((k) => k.nazev);
    const po = t.data.po_navrhu.kroky.map((k) => k.nazev);
    over('R10', JSON.stringify(kroky) === JSON.stringify(['Osloven', 'Dovolán', 'Zájem', 'Návrh odeslán', 'Prodáno', 'Fakturováno', 'Zaplaceno'])
      && JSON.stringify(po) === JSON.stringify(['Návrh odeslán', 'Odpověděl', 'Odmítl náhled', 'Dostal nabídku za polovinu', 'Přijal nabídku', 'Odmítl nabídku',
        'Nereagoval ani na nabídku za polovinu', 'Nabídka běží', 'Prodáno bez nabídky'])
      && t.data.kohorta.popis === 'První hovor v období' && t.data.po_navrhu.kohorta.popis === 'První návrh v období',
      'mock trychtýře: názvy kroků a popisy kohort doslova jako kontrakt §5.4', `${kroky.join(',')} | ${po.join(',')}`);
    globalThis.__volackaDemoTest.prehledVerze = '2026-12-01.1';
    const v = await API.mockApi.prehledSouhrn('demo-1-x', null);
    delete globalThis.__volackaDemoTest.prehledVerze;
    over('R6a', v.definice_verze === '2026-12-01.1', 'háček mocku prehledVerze změní definice_verze odpovědí (e2e PV10 tak měří nové načtení katalogu)', v.definice_verze);
  }
  const stranka = src('src/pages/prehled/PrehledPage.tsx');
  over('R6b', /5 \* 60 \* 1000|300000/.test(stranka) && /visibilityState/.test(stranka) && /definice_verze/.test(src('src/pages/prehled/kontext.tsx') + stranka),
    'čerstvost: možnosti znovu při změně záložky a nejvýš po 5 minutách, když je stránka vidět; katalog znovu při jiné definice_verze', '');
});

/* ---------------- G) zapojení: jen super admin ---------------- */
await blok('G', async () => {
  const app = src('src/App.tsx');
  const home = src('src/pages/HomePage.tsx');
  // stránka se načítá líně (React.lazy) v Suspense s kostrou UVNITŘ RequireAuth, ať Volající její kód nikdy nestáhne (recenze 14b,
  // drobnost 9; ⚠ NAHRAZUJE <PrehledPage /> přímo pod RequireAuth se statickým importem)
  over('G1', /path="\/prehled\/\*"\s+element=\{\s*<RequireAuth superAdmin>\s*<Suspense fallback=\{<PrehledStrankaNacita \/>\}>\s*<PrehledPage \/>/.test(app)
    && /const PrehledPage = lazy\(\(\) => import\('\.\/pages\/prehled\/PrehledPage'\)\)/.test(app) && !/^import PrehledPage /m.test(app)
    && /\{isSuper && \(\s*<NavLink\s+to="\/prehled"/.test(app)
    && />\s*přehled\s*</.test(app) && /\{isSuper && \(\s*<Link to="\/prehled"/.test(home) && /PŘEHLED/.test(home),
    'trasa #/prehled/* jen pod RequireAuth superAdmin (líná stránka v Suspense s kostrou uvnitř), pilulka „přehled“ a dlaždice PŘEHLED jen pod isSuper', '');
  // nic jiného než Přehled a kombinované Statistiky (super admin) funkce Přehledu nevolá
  const stranky = ['src/pages/AdminPage.tsx', 'src/pages/CallPage.tsx', 'src/pages/HomePage.tsx', 'src/pages/KalendarPage.tsx', 'src/pages/MojiPage.tsx',
    'src/pages/OznacenePage.tsx', 'src/pages/RozvrhPage.tsx', 'src/pages/ZpravyPage.tsx', 'src/pages/UzivatelePage.tsx', 'src/App.tsx'];
  const volaji = stranky.filter((p) => /\.(prehled(Moznosti|Souhrn|Rada|Trychtyr|Lide|Pipeline|Klienti|Komunikace|Finance|Dodani|Prognoza|Kvalita|Akce|Radky|Kontakt|Definice)|cile\w*|naklady\w*|provize\w*)\(/.test(src(p)));
  over('G2', volaji.length === 0, 'žádná jiná stránka funkce Přehledu, cílů, nákladů ani výplat nevolá (Volající je nikdy nedostane)', volaji.join(', '));
  if (!P) return;
  const h = P.createElement;
  const vykresli = (role) => {
    localStorage.setItem(P.LS_SESSION ?? 'volacka_session', JSON.stringify({ token: role === 'super_admin' ? 'demo-1-x' : 'demo-2-x', user_id: role === 'super_admin' ? 1 : 2, display_name: 'X', role }));
    return P.renderToStaticMarkup(h(P.AuthProvider, null, h(P.MemoryRouter, { initialEntries: ['/prehled/vedeni'] },
      h(P.Routes, null, h(P.Route, { path: '/prehled/*', element: h(P.PrehledPage) })))));
  };
  const volajici = vykresli('admin');
  const sup = vykresli('super_admin');
  over('G3', volajici === '' && /prehled-stranka/.test(sup) && /Přehled vedení/.test(text(sup)),
    'pojistka: stránka Přehledu Volajícímu nevykreslí nic (přesměruje), super adminovi ano', `${volajici.slice(0, 80)} | ${text(sup).slice(0, 80)}`);
  const pkg = JSON.parse(src('package.json'));
  over('G4', /tests\/prehled\.test\.mjs/.test(pkg.scripts.test), 'npm test pouští i tests/prehled.test.mjs', pkg.scripts.test);
});

if (chyby === 0) {
  console.log(`ALL OK (${pocet} kontrol)`);
  process.exit(0);
}
console.log(`CHYB: ${chyby} z ${pocet}`);
process.exit(1);
