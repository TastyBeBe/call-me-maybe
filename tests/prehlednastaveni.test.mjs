// Test nastavení Přehledu vedení: cíle, náklady a výplaty provizí (úkol 14b, Albert 17. 11. 2026, rozhodnutí D6, D9 a D10;
// spec docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md §3.4 až §3.6 a §7.2, kontrakt
// docs/superpowers/specs/2026-11-17-prehled-kontrakt.md §4.3 až §4.5, R6, R7, R21, R32, §3.5, §3.6, §7 a §8).
//
// Měří:
//  N1) src/api/supabase.ts: devět volání migrace 072 se jmény a parametry serveru (p_token, p_naklad, p_cil, p_vyplata, p_id),
//      PGRST202 = věta BEZ_072_NASTAVENI („… migraci 072 …“), jiná chyba serveru doslova,
//  N2) DEMO mock (src/api/mock.ts): Volajícímu každé z devíti volání „Přehled vidí jen super admin.“ před kontrolou
//      parametrů, neplatná relace větou relace,
//  N3) náklady: seznam jen aktivních (plati_od a id sestupně, 13 klíčů tvaru Naklad, částka „5000.00“), každá kontrola
//      naklady_uloz doslova a v pořadí kontraktu, klíče jen ke čtení se ignorují, úplná náhrada, každý super admin smí každý
//      řádek, měkké zrušení, události naklad_zmena,
//  N4) cíle: všichni super admini vidí všechny cíle, smi_upravit podle D9 (Albert vše; jinak svůj cíl, cíle svých lidí, cíl
//      svého týmu; firmu jen Albert), práva na nový i uložený rozsah, jen přesný duplikát odmítnutý (R21), obdobi_do
//      poslední den včetně (R6), každá kontrola doslova, události cil_zmena,
//  N5) výplaty: super admin svému týmu (sobě a lidem s manager_id = on), Albert komukoli, právo i na uloženého příjemce,
//      kontroly doslova, události vyplata_zmena,
//  N6) uložení se projeví v číslech: náklad v Nákladech celkem (prehled_finance), cíl v Plnění cíle (prehled_souhrn),
//      výplata v Provize vyplaceno a zbývá (prehled_finance i prehled_lide); zrušení je vrátí, pohled k datu před zrušením je
//      ještě má a cíl zadaný až po tom okamžiku ne (073; recenze 14b), čerstvost zdrojů počítá i zrušení,
//  N7) pomocníci formulářů (src/prehledNastaveni.ts): registry kontraktu, částka „1 234,50“ → „1234.50“, rozsah cíle
//      a příjemci výplaty podle práv z prehled_moznosti (D9, D10), datum včetně, pole chyby serveru, důvod „jen ke čtení“
//      u cíle větou serveru podle rozsahu,
//  N8) tabulky nastavení vykreslené na serveru: „ověřit“ jen u nákladů k ověření, částky každá ve své měně (nikdy sečtené),
//      období včetně, tlačítka jen u řádků, které přihlášený smí měnit („jen ke čtení“ jinak), výslovné role tabulky (telefon
//      ji skládá do bloků), povinné pole s aria-required,
//  N9) zapojení: npm test soubor pouští, záložka Nastavení už neříká „Zadávání se připravuje.“
// Klikání (formuláře, potvrzení zrušení, čísla v záložkách po uložení, práva Mikuláše, klávesnice, telefon, Volající) měří
// tests/demo-e2e.mjs blok PN.
// Nikdy nesahá na síť ani živou DB (fetch je podstrčený).
// Spuštění: node tests/prehlednastaveni.test.mjs (APP_ROOT=/cesta/ke/kopii pro mutace). Výsledek „ALL OK (N kontrol)“ nebo
// řádky „FAIL <id>: …“ a kód 1.

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
/** Skutečné čekání (pohled k datu potřebuje okamžik mezi zápisem a zrušením; mock píše čas na milisekundy). */
const pockej = (ms) => new Promise((r) => puvodniTimeout(r, ms));
const odeslano = [];
let odpoved = { status: 200, telo: '[]' };
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
    over(id, false, text, `prošlo, mělo selhat (${veta})`);
  } catch (e) {
    over(id, e?.message === veta, text, `hláška: ${e?.message}`);
  }
}
/** Čeká úspěch (vrátí výsledek), jinak FAIL s hláškou. */
async function projde(id, fn, text) {
  try {
    return await fn();
  } catch (e) {
    over(id, false, text, `selhalo: ${e?.message}`);
    return null;
  }
}
const stejne = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Text bez značek a s normálními mezerami (cs-CZ píše mezi tisíce pevnou mezeru). */
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
  const dir = mkdtempSync(join(tmpdir(), 'prehled-nastaveni-'));
  const f = join(dir, 'b.cjs');
  writeFileSync(f, out.outputFiles[0].text);
  try {
    return createRequire(import.meta.url)(f);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// každý kus zvlášť, ať RED ukáže, co přesně chybí
let H = null;
try {
  H = await balicek(["export * from './src/prehledNastaveni.ts';"]);
} catch (e) {
  over('N0b', false, 'pomocníci nastavení (src/prehledNastaveni.ts) nejdou sestavit', String(e.message).split('\n')[0]);
}
let T = null;
try {
  T = await balicek([
    "export { TabulkaCilu } from './src/pages/prehled/NastaveniCile.tsx';",
    "export { TabulkaNakladu } from './src/pages/prehled/NastaveniNaklady.tsx';",
    "export { TabulkaVyplat } from './src/pages/prehled/NastaveniVyplaty.tsx';",
    "export { default as ZalozkaNastaveni } from './src/pages/prehled/ZalozkaNastaveni.tsx';",
    "export { PoleFormulare } from './src/pages/prehled/NastaveniSpolecne.tsx';",
    "export { renderToStaticMarkup } from 'react-dom/server';",
    "export { createElement } from 'react';",
  ]);
} catch (e) {
  over('N0c', false, 'tabulky nastavení (NastaveniCile, NastaveniNaklady, NastaveniVyplaty) nejdou sestavit', String(e.message).split('\n').slice(0, 2).join(' | '));
}

// mock jako poslední balíček: každý balíček s mockem (i tabulky přes getApi) si do sdíleného háčku __volackaDemoTest zapíše
// své funkce a poslední vyhraje; stav() a události pak patří k instanci API.mockApi
let API = null;
try {
  API = await balicek(["export { mockApi } from './src/api/mock.ts';", "export * from './src/api/supabase.ts';"]);
} catch (e) {
  over('N0a', false, 'mock a supabase.ts nejdou sestavit', String(e.message).split('\n')[0]);
}

const ALBERT = 'demo-1-x';
const PETRA = 'demo-2-x';
const MIKULAS = 'demo-4-x';
const EVA = 'demo-5-x';
const JEN_SUPER = 'Přehled vidí jen super admin.';
const DNES = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const MESIC_OD = `${DNES.slice(0, 8)}01`;
const posun = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const MESIC_DO = posun(`${posun(`${DNES.slice(0, 8)}28`, 4).slice(0, 8)}01`, -1);
const udalosti = () => globalThis.__volackaDemoTest.stav?.().udalostiNastaveni ?? [];
const posledniUdalost = () => udalosti().at(-1) ?? null;
const KLICE_NAKLADU = ['castka', 'id', 'kategorie', 'kontakt_id', 'kontakt_jmeno', 'mena', 'opakovani', 'overit', 'plati_do', 'plati_od', 'popis', 'zapsal', 'zapsano_at'];
const KLICE_CILE = ['hodnota', 'id', 'mena', 'metrika', 'obdobi_do', 'obdobi_od', 'smi_upravit', 'tym_id', 'tym_jmeno', 'user_id', 'user_jmeno', 'zadal', 'zadano_at'];
const KLICE_VYPLATY = ['castka', 'id', 'jmeno', 'mena', 'poznamka', 'user_id', 'vyplaceno_dne', 'za_obdobi_do', 'za_obdobi_od', 'zapsal', 'zapsano_at'];
const serazeno = (radky, klic) => radky.every((r, i) => i === 0 || radky[i - 1][klic] > r[klic] || (radky[i - 1][klic] === r[klic] && radky[i - 1].id > r.id));

/* ---------------- N1) supabase.ts ---------------- */
await blok('N1', async () => {
  if (!API?.supabaseApi) return;
  const sb = API.supabaseApi;
  over('N1a', typeof API.BEZ_072_NASTAVENI === 'string' && /migraci 072/.test(API.BEZ_072_NASTAVENI),
    'hláška serveru bez migrace 072 (BEZ_072_NASTAVENI) říká „migraci 072“', String(API.BEZ_072_NASTAVENI));
  const vstupN = { kategorie: 'hosting', castka: '350.00', mena: 'CZK', opakovani: 'mesicne', plati_od: '2026-11-01' };
  const vstupC = { metrika: 'hovory', obdobi_od: '2026-11-01', obdobi_do: '2026-11-30', user_id: 3, hodnota: '40' };
  const vstupV = { user_id: 3, castka: '500', mena: 'CZK', vyplaceno_dne: '2026-11-18' };
  const VOLANI = [
    ['naklady_seznam', () => sb.nakladySeznam('t'), { p_token: 't' }],
    ['naklady_uloz', () => sb.nakladyUloz('t', vstupN), { p_token: 't', p_naklad: vstupN }],
    ['naklady_zrus', () => sb.nakladyZrus('t', 4), { p_token: 't', p_id: 4 }],
    ['cile_seznam', () => sb.cileSeznam('t'), { p_token: 't' }],
    ['cile_uloz', () => sb.cileUloz('t', vstupC), { p_token: 't', p_cil: vstupC }],
    ['cile_zrus', () => sb.cileZrus('t', 5), { p_token: 't', p_id: 5 }],
    ['provize_vyplaty_seznam', () => sb.provizeVyplatySeznam('t'), { p_token: 't' }],
    ['provize_vyplata_uloz', () => sb.provizeVyplataUloz('t', vstupV), { p_token: 't', p_vyplata: vstupV }],
    ['provize_vyplata_zrus', () => sb.provizeVyplataZrus('t', 2), { p_token: 't', p_id: 2 }],
  ];
  const spatne = [];
  odpoved = { status: 200, telo: '{"ok": true, "id": 1}' };
  for (const [fn, f, telo] of VOLANI) {
    const pred = odeslano.length;
    try { await f(); } catch (e) { spatne.push(`${fn}: ${e?.message}`); continue; }
    const r = odeslano[pred];
    if (!r || r.fn !== fn || !stejne(r.body, telo)) spatne.push(`${fn}: ${JSON.stringify(r)}`);
  }
  over('N1b', spatne.length === 0, 'devět volání nastavení jde na funkce 072 s parametry serveru (p_token, p_naklad, p_cil, p_vyplata, p_id)', spatne.join(' | '));
  odpoved = { status: 200, telo: 'null' };
  const prazdne = [await sb.nakladySeznam('t'), await sb.cileSeznam('t'), await sb.provizeVyplatySeznam('t')];
  over('N1c', prazdne.every((x) => Array.isArray(x) && x.length === 0), 'seznam bez řádků je prázdné pole (nikdy null)', JSON.stringify(prazdne));
  odpoved = { status: 404, telo: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.cile_seznam' }) };
  const bez = [];
  for (const [fn, f] of VOLANI) {
    try { await f(); bez.push(`${fn}: prošlo`); } catch (e) { if (e?.message !== API.BEZ_072_NASTAVENI) bez.push(`${fn}: ${e?.message}`); }
  }
  over('N1d', bez.length === 0, 'PGRST202 u každého z devíti volání = věta BEZ_072_NASTAVENI (server ještě nemá migraci 072)', bez.join(' | '));
  odpoved = { status: 400, telo: JSON.stringify({ code: 'P0001', message: 'Cíl pro celou firmu zadává jen Albert.' }) };
  let veta = '';
  try { await sb.cileUloz('t', vstupC); } catch (e) { veta = e?.message; }
  over('N1e', veta === 'Cíl pro celou firmu zadává jen Albert.', 'jiná chyba serveru projde doslova', veta);
  odpoved = { status: 200, telo: '[]' };
});

/* ---------------- N2) Volající nic ---------------- */
await blok('N2', async () => {
  if (!API?.mockApi) return;
  const api = API.mockApi;
  const FN = ['nakladySeznam', 'nakladyUloz', 'nakladyZrus', 'cileSeznam', 'cileUloz', 'cileZrus', 'provizeVyplatySeznam', 'provizeVyplataUloz', 'provizeVyplataZrus'];
  const chybi = FN.filter((fn) => typeof api[fn] !== 'function');
  over('N2a', chybi.length === 0, 'mock má všech devět volání nastavení (kontrakt §4.3 až §4.5)', chybi.join(', '));
  if (chybi.length > 0) return;
  for (const kdo of [PETRA, EVA]) {
    const volani = {
      nakladySeznam: () => api.nakladySeznam(kdo),
      nakladyUloz: () => api.nakladyUloz(kdo, { nesmysl: 1 }),
      nakladyZrus: () => api.nakladyZrus(kdo, 999999),
      cileSeznam: () => api.cileSeznam(kdo),
      cileUloz: () => api.cileUloz(kdo, null),
      cileZrus: () => api.cileZrus(kdo, -1),
      provizeVyplatySeznam: () => api.provizeVyplatySeznam(kdo),
      provizeVyplataUloz: () => api.provizeVyplataUloz(kdo, 'x'),
      provizeVyplataZrus: () => api.provizeVyplataZrus(kdo, 1),
    };
    for (const [fn, f] of Object.entries(volani)) await chyba(`N2b ${kdo} ${fn}`, f, JEN_SUPER, `${fn}: Volající dostane „${JEN_SUPER}“ před kontrolou parametrů`);
  }
  await chyba('N2c', () => api.cileSeznam('demo-999-x'), 'Neplatná nebo vypršelá relace. Přihlaste se znovu.', 'neplatná relace = věta relace');
  // Volajícímu se nic nezměnilo: výplata Petry pořád jedna, žádný nový řádek ani událost
  const vyplaty = await api.provizeVyplatySeznam(ALBERT);
  over('N2d', vyplaty.length === 1 && udalosti().length === 0, 'odmítnutá volání Volajícího nic nezapsala', JSON.stringify({ vyplaty: vyplaty.length, udalosti: udalosti().length }));
});

/* ---------------- N3) náklady ---------------- */
let novyNaklad = null;
await blok('N3', async () => {
  if (!API?.mockApi?.nakladySeznam) return;
  const api = API.mockApi;
  const seznam = await api.nakladySeznam(MIKULAS);
  const kontakt7 = globalThis.__volackaDemoTest.stav().kontakty.find((k) => k.id === 7);
  const n5 = seznam.find((n) => n.id === 5);
  over('N3a', seznam.length === 5 && serazeno(seznam, 'plati_od') && seznam.every((n) => stejne(Object.keys(n).sort(), KLICE_NAKLADU))
    && seznam.filter((n) => n.kategorie === 'claude').every((n) => n.castka === '5000.00' && n.mena === 'CZK' && n.opakovani === 'mesicne' && n.plati_od === '2026-11-01' && n.plati_do === null && !n.overit && n.zapsal === 'Albert')
    && seznam.filter((n) => n.kategorie === 'claude').length === 3 && seznam.find((n) => n.kategorie === 'lovable')?.castka === '500.00'
    && n5?.overit === true && n5?.kontakt_id === 7 && n5?.kontakt_jmeno === kontakt7.name && n5?.zapsal === 'Mikuláš' && n5?.castka === '290.00',
    'seznam nákladů: 5 aktivních (seed D6 + doména k ověření), plati_od a id sestupně, 13 klíčů, částka „5000.00“, kontakt_jmeno, zapsal',
    JSON.stringify(seznam.map((n) => [n.id, n.kategorie, n.castka, n.plati_od, n.overit, n.zapsal])));
  const Z = { kategorie: 'hosting', castka: '350.00', mena: 'CZK', opakovani: 'mesicne', plati_od: MESIC_OD };
  const KATEGORIE = 'Povolené: claude, lovable, domena, hosting, jine.';
  const CASTKA = 'Částka nákladu musí být kladné číslo s nejvýš dvěma desetinnými místy.';
  await chyba('N3b1', () => api.nakladyUloz(ALBERT, null), 'Náklad chybí: pošlete objekt s poli nákladu.', 'bez objektu');
  await chyba('N3b2', () => api.nakladyUloz(ALBERT, [Z]), 'Náklad chybí: pošlete objekt s poli nákladu.', 'pole místo objektu');
  await chyba('N3b3', () => api.nakladyUloz(ALBERT, { ...Z, zzz: 1, abc: 2 }), 'Neplatné pole nákladu: abc.', 'neznámý klíč (první podle abecedy)');
  await chyba('N3b4', () => api.nakladyUloz(ALBERT, { ...Z, overit: 'ano' }), 'Neplatné pole nákladu: overit.', 'overit jen true/false');
  await chyba('N3b5', () => api.nakladyUloz(ALBERT, { ...Z, kategorie: 'provize' }), `Neplatná kategorie nákladu: provize. ${KATEGORIE}`, 'provize není kategorie evidence (§3.5)');
  await chyba('N3b6', () => api.nakladyUloz(ALBERT, { ...Z, kategorie: undefined }), `Neplatná kategorie nákladu: (null). ${KATEGORIE}`, 'chybějící kategorie');
  for (const [i, c] of [['0', '0'], ['a', -5], ['b', '12.345'], ['c', '1 000'], ['d', 'abc'], ['e', 0], ['f', 10000000000], ['g', null], ['h', '1,5']]) {
    await chyba(`N3b7${i}`, () => api.nakladyUloz(ALBERT, { ...Z, castka: c }), CASTKA, `částka ${JSON.stringify(c)} odmítnuta`);
  }
  await chyba('N3b8', () => api.nakladyUloz(ALBERT, { ...Z, mena: 'USD' }), 'Neplatná měna: USD. Povolené: CZK, EUR.', 'měna');
  await chyba('N3b9', () => api.nakladyUloz(ALBERT, { ...Z, opakovani: 'tydne' }), 'Neplatné opakování: tydne. Povolené: jednorazove, mesicne, rocne.', 'opakování');
  await chyba('N3b10', () => api.nakladyUloz(ALBERT, { ...Z, plati_od: '1. 11. 2026' }), 'Neplatné datum v poli plati_od: čekám RRRR-MM-DD.', 'datum od ve špatném tvaru');
  await chyba('N3b11', () => api.nakladyUloz(ALBERT, { ...Z, plati_od: '2026-02-30' }), 'Neplatné datum v poli plati_od: čekám RRRR-MM-DD.', 'neexistující den');
  await chyba('N3b12', () => api.nakladyUloz(ALBERT, { ...Z, plati_od: null }), 'Zadejte, od kterého dne náklad platí.', 'bez plati_od');
  await chyba('N3b13', () => api.nakladyUloz(ALBERT, { ...Z, plati_do: '2026-13-01' }), 'Neplatné datum v poli plati_do: čekám RRRR-MM-DD.', 'datum do ve špatném tvaru');
  await chyba('N3b14', () => api.nakladyUloz(ALBERT, { ...Z, plati_do: posun(MESIC_OD, -1) }), 'Náklad nemůže skončit dřív, než začne.', 'konec před začátkem');
  await chyba('N3b15', () => api.nakladyUloz(ALBERT, { ...Z, opakovani: 'jednorazove', plati_do: MESIC_DO }), 'Jednorázový náklad nemá konec platnosti; plati_do nechte prázdné.', 'jednorázový s koncem');
  await chyba('N3b16', () => api.nakladyUloz(ALBERT, { ...Z, popis: { a: 1 } }), 'Neplatné pole nákladu: popis.', 'popis jako objekt');
  await chyba('N3b17', () => api.nakladyUloz(ALBERT, { ...Z, popis: 'x'.repeat(301) }), 'Popis nákladu je moc dlouhý: nejvýš 300 znaků.', 'popis přes 300 znaků');
  await chyba('N3b18', () => api.nakladyUloz(ALBERT, { ...Z, kontakt_id: 999999 }), 'Kontakt id=999999 neexistuje.', 'neexistující klient');
  await chyba('N3b19', () => api.nakladyUloz(ALBERT, { ...Z, kontakt_id: 'abc' }), 'Kontakt id=abc neexistuje.', 'klient jako nesmysl = poslaná hodnota v hlášce');
  await chyba('N3b20', () => api.nakladyUloz(ALBERT, { ...Z, id: 999999 }), 'Náklad id=999999 neexistuje.', 'úprava neexistujícího řádku');
  // pořadí kontrol (kontrakt §4.3b): kategorie před částkou, částka před měnou, data před popisem
  await chyba('N3c1', () => api.nakladyUloz(ALBERT, { ...Z, kategorie: 'x', castka: 0, mena: 'USD' }), `Neplatná kategorie nákladu: x. ${KATEGORIE}`, 'kategorie se kontroluje první');
  await chyba('N3c2', () => api.nakladyUloz(ALBERT, { ...Z, castka: 0, mena: 'USD' }), CASTKA, 'částka před měnou');
  await chyba('N3c3', () => api.nakladyUloz(ALBERT, { ...Z, plati_od: null, popis: 'x'.repeat(400) }), 'Zadejte, od kterého dne náklad platí.', 'data před popisem');
  over('N3c4', udalosti().length === 0 && (await api.nakladySeznam(ALBERT)).length === 5, 'odmítnuté uložení nic nezapsalo', String(udalosti().length));
  // vložení (zapsal = kdo ukládá), klíče jen ke čtení se ignorují, popis oříznutý, částka jako číslo
  const n = await projde('N3d', () => api.nakladyUloz(ALBERT, { ...Z, castka: 350, popis: '  Hosting webu klienta  ', overit: true, kontakt_jmeno: 'x', zapsal: 'Nikdo', zapsano_at: '2000-01-01' }), 'nový náklad');
  novyNaklad = n;
  over('N3e', !!n && n.id === 6 && stejne(Object.keys(n).sort(), KLICE_NAKLADU) && n.castka === '350.00' && n.popis === 'Hosting webu klienta' && n.overit === true
    && n.zapsal === 'Albert' && n.zapsano_at !== '2000-01-01' && n.kontakt_id === null && n.kontakt_jmeno === null && n.plati_do === null,
    'nový náklad: id 6, tvar Naklad, částka „350.00“, popis oříznutý, ověřit, zapsal = přihlášený (klíče jen ke čtení ignorované)', JSON.stringify(n));
  over('N3f', posledniUdalost()?.type === 'naklad_zmena' && posledniUdalost()?.actor === 'Albert'
    && posledniUdalost()?.detail === `Náklad 6 přidán: hosting 350.00 CZK, mesicne, od ${MESIC_OD}, ověřit`,
    'událost naklad_zmena „Náklad 6 přidán: …, ověřit“', JSON.stringify(posledniUdalost()));
  // úplná náhrada jiným super adminem (každý super admin smí každý řádek): popis vynechaný = null, kontakt a konec platnosti
  const u = await projde('N3g', () => api.nakladyUloz(MIKULAS, { id: 6, kategorie: 'hosting', castka: '400.5', mena: 'CZK', opakovani: 'rocne', plati_od: MESIC_OD, plati_do: MESIC_DO, kontakt_id: 7 }), 'úprava cizího nákladu Mikulášem');
  over('N3h', !!u && u.id === 6 && u.castka === '400.50' && u.popis === null && u.overit === false && u.opakovani === 'rocne' && u.plati_do === MESIC_DO
    && u.kontakt_id === 7 && u.kontakt_jmeno === kontakt7.name && u.zapsal === 'Mikuláš'
    && posledniUdalost()?.detail === `Náklad 6 změněn: hosting 400.50 CZK, rocne, od ${MESIC_OD} do ${MESIC_DO}, kontakt 7`,
    'úplná náhrada: vynechaný popis = null, overit chybí = false, zapsal Mikuláš, událost „Náklad 6 změněn: … do …, kontakt 7“', JSON.stringify({ u, e: posledniUdalost() }));
  const s2 = await api.nakladySeznam(ALBERT);
  over('N3i', s2.length === 6 && serazeno(s2, 'plati_od') && s2.some((x) => x.id === 6 && x.castka === '400.50'), 'seznam má nový řádek ve správném pořadí', JSON.stringify(s2.map((x) => [x.id, x.plati_od])));
  const z = await projde('N3j', () => api.nakladyZrus(MIKULAS, 6), 'zrušení nákladu');
  over('N3k', stejne(z, { ok: true, id: 6 }) && !(await api.nakladySeznam(ALBERT)).some((x) => x.id === 6) && posledniUdalost()?.detail === 'Náklad 6 zrušen.',
    'měkké zrušení: {ok: true, id}, řádek zmizí ze seznamu, událost „Náklad 6 zrušen.“', JSON.stringify({ z, e: posledniUdalost() }));
  await chyba('N3l1', () => api.nakladyZrus(ALBERT, 6), 'Náklad id=6 je zrušený, změnit ani zrušit ho už nejde.', 'zrušený znovu zrušit nejde');
  await chyba('N3l2', () => api.nakladyUloz(ALBERT, { ...Z, id: 6 }), 'Náklad id=6 je zrušený, změnit ani zrušit ho už nejde.', 'zrušený změnit nejde');
  await chyba('N3l3', () => api.nakladyZrus(ALBERT, 999), 'Náklad id=999 neexistuje.', 'zrušení neexistujícího');
});

/* ---------------- N4) cíle (D9) ---------------- */
await blok('N4', async () => {
  if (!API?.mockApi?.cileSeznam) return;
  const api = API.mockApi;
  const proM = await api.cileSeznam(MIKULAS);
  const proA = await api.cileSeznam(ALBERT);
  const c1 = proA.find((c) => c.id === 1);
  const smiM = Object.fromEntries(proM.map((c) => [c.id, c.smi_upravit]));
  over('N4a', proM.length === 4 && proA.length === 4 && serazeno(proA, 'obdobi_od') && proA.every((c) => stejne(Object.keys(c).sort(), KLICE_CILE))
    && proA.every((c) => c.smi_upravit === true) && stejne(smiM, { 1: false, 2: true, 3: false, 4: false })
    && c1?.obdobi_od === MESIC_OD && c1?.obdobi_do === MESIC_DO && c1?.hodnota === '50000.00' && c1?.mena === 'CZK' && c1?.user_id === null && c1?.tym_id === null
    && proA.find((c) => c.id === 2)?.tym_jmeno === 'Tým Mikuláš' && proA.find((c) => c.id === 2)?.hodnota === '3.00' && proA.find((c) => c.id === 3)?.user_jmeno === 'Petra',
    'cíle: každý super admin vidí všechny (4), obdobi_od a id sestupně, 13 klíčů, obdobi_do poslední den VČETNĚ, hodnota „50000.00“; smi_upravit: Albert vše, Mikuláš jen cíl svého týmu',
    JSON.stringify({ smiM, c1 }));
  const Z = { metrika: 'prodane_weby', obdobi_od: MESIC_OD, obdobi_do: MESIC_DO, hodnota: 2 };
  const OSOBA = 'Cíl pro tohoto člověka zadává jen jeho super admin nebo Albert.';
  const TYM = 'Cíl pro tento tým zadává jen jeho super admin nebo Albert.';
  const FIRMA = 'Cíl pro celou firmu zadává jen Albert.';
  // D9: Mikuláš sobě, svým lidem a svému týmu ano; Petře (lidé Alberta), Albertovi, týmu Alberta a firmě ne
  const vlastni = await projde('N4b1', () => api.cileUloz(MIKULAS, { ...Z, user_id: 4 }), 'Mikuláš sám sobě');
  const honza = await projde('N4b2', () => api.cileUloz(MIKULAS, { ...Z, user_id: 3, metrika: 'hovory', hodnota: '40' }), 'Mikuláš Honzovi (jeho člověk)');
  await chyba('N4b3', () => api.cileUloz(MIKULAS, { ...Z, user_id: 2 }), OSOBA, 'Mikuláš Petře (člověk Alberta)');
  await chyba('N4b4', () => api.cileUloz(MIKULAS, { ...Z, user_id: 1 }), OSOBA, 'Mikuláš Albertovi');
  await chyba('N4b5', () => api.cileUloz(MIKULAS, { ...Z, tym_id: 1 }), TYM, 'Mikuláš týmu Alberta');
  await chyba('N4b6', () => api.cileUloz(MIKULAS, Z), FIRMA, 'Mikuláš cíl firmy');
  over('N4b7', !!vlastni && vlastni.smi_upravit === true && vlastni.user_jmeno === 'Mikuláš' && vlastni.zadal === 'Mikuláš' && !!honza && honza.user_id === 3 && honza.hodnota === '40.00',
    'uložený cíl: smi_upravit, jméno člověka, zadal = přihlášený, hodnota „40.00“ i u počtu', JSON.stringify({ vlastni, honza }));
  // na uložený rozsah: cíl firmy Mikuláš nezmění ani přesunutím na svůj tým, ani nezruší
  await chyba('N4c1', () => api.cileUloz(MIKULAS, { id: 1, metrika: 'hodnota_prodeju', obdobi_od: MESIC_OD, obdobi_do: MESIC_DO, tym_id: 4, mena: 'CZK', hodnota: 1 }), FIRMA,
    'úprava cíle firmy na svůj tým: právo i na uložený rozsah');
  await chyba('N4c2', () => api.cileZrus(MIKULAS, 1), FIRMA, 'Mikuláš cíl firmy nezruší');
  await chyba('N4c3', () => api.cileZrus(MIKULAS, 3), OSOBA, 'Mikuláš cíl Petry nezruší');
  // Albert smí vše
  const tymA = await projde('N4d1', () => api.cileUloz(ALBERT, { ...Z, tym_id: 4, metrika: 'zajem', hodnota: 12 }), 'Albert týmu Mikuláše');
  await projde('N4d2', () => api.cileUloz(ALBERT, { ...Z, user_id: 3, metrika: 'odpracovane_hodiny', hodnota: '30.5' }), 'Albert Honzovi, hodiny s desetinami');
  over('N4d3', !!tymA && tymA.tym_jmeno === 'Tým Mikuláš' && tymA.smi_upravit === true, 'Albert: cíl týmu Mikuláše', JSON.stringify(tymA));
  // kontroly doslova (kontrakt §4.4b)
  await chyba('N4e1', () => api.cileUloz(ALBERT, null), 'Cíl chybí: pošlete objekt s poli cíle.', 'bez objektu');
  await chyba('N4e2', () => api.cileUloz(ALBERT, { ...Z, zzz: 1 }), 'Neplatné pole cíle: zzz.', 'neznámý klíč');
  await chyba('N4e3', () => api.cileUloz(ALBERT, { ...Z, metrika: 'provize' }), 'Neplatná metrika cíle: provize. Povolené: prodane_weby, hodnota_prodeju, inkaso, hovory, zajem, odpracovane_hodiny.', 'metrika');
  await chyba('N4e4', () => api.cileUloz(ALBERT, { ...Z, obdobi_od: undefined }), 'Neplatné datum v poli obdobi_od: čekám RRRR-MM-DD.', 'chybí začátek');
  await chyba('N4e5', () => api.cileUloz(ALBERT, { ...Z, obdobi_do: '30. 11. 2026' }), 'Neplatné datum v poli obdobi_do: čekám RRRR-MM-DD.', 'konec ve špatném tvaru');
  await chyba('N4e6', () => api.cileUloz(ALBERT, { ...Z, obdobi_do: posun(MESIC_OD, -1) }), 'Období cíle: konec nesmí být dřív než začátek.', 'konec před začátkem');
  await chyba('N4e7', () => api.cileUloz(ALBERT, { ...Z, hodnota: 0 }), 'Hodnota cíle musí být kladné číslo s nejvýš dvěma desetinnými místy.', 'hodnota 0');
  await chyba('N4e8', () => api.cileUloz(ALBERT, { ...Z, hodnota: '2.5' }), 'Cíl prodane_weby musí být celé číslo.', 'prodané weby celé');
  await chyba('N4e9', () => api.cileUloz(ALBERT, { ...Z, metrika: 'hodnota_prodeju', hodnota: 1000 }), 'Cíl hodnota_prodeju je v penězích: zadejte měnu CZK nebo EUR.', 'peníze bez měny');
  await chyba('N4e10', () => api.cileUloz(ALBERT, { ...Z, metrika: 'inkaso', mena: 'USD', hodnota: 1000 }), 'Neplatná měna: USD. Povolené: CZK, EUR.', 'neplatná měna');
  await chyba('N4e11', () => api.cileUloz(ALBERT, { ...Z, metrika: 'hovory', mena: 'CZK' }), 'Cíl hovory se v měně nezadává.', 'počet s měnou');
  await chyba('N4e12', () => api.cileUloz(ALBERT, { ...Z, user_id: 3, tym_id: 4 }), 'Cíl je buď pro člověka, nebo pro tým, ne pro obojí.', 'člověk i tým');
  await chyba('N4e13', () => api.cileUloz(ALBERT, { ...Z, user_id: 999 }), 'Uživatel id=999 neexistuje.', 'neexistující člověk');
  await chyba('N4e14', () => api.cileUloz(ALBERT, { ...Z, tym_id: 2 }), 'Tým id=2 neexistuje (tým je super admin a jeho lidé).', 'tým = jen super admin');
  await chyba('N4e15', () => api.cileUloz(ALBERT, { ...Z, id: 999 }), 'Cíl id=999 neexistuje.', 'úprava neexistujícího cíle');
  // jen přesný duplikát (R21): stejná metrika, rozsah, měna a období; jiná délka nebo měna smí, úprava sebe sama ne-duplikát
  const C1 = { metrika: 'hodnota_prodeju', obdobi_od: MESIC_OD, obdobi_do: MESIC_DO, mena: 'CZK', hodnota: '80000' };
  await chyba('N4f1', () => api.cileUloz(ALBERT, C1), 'Stejný cíl už je zadaný (id=1): stejná metrika, rozsah, měna i období. Upravte ten.', 'přesný duplikát cíle firmy');
  const kratsi = await projde('N4f2', () => api.cileUloz(ALBERT, { ...C1, obdobi_do: posun(MESIC_OD, 9) }), 'překrývající se období jiné délky smí');
  const eur = await projde('N4f3', () => api.cileUloz(ALBERT, { ...C1, mena: 'EUR', hodnota: 2000 }), 'jiná měna není duplikát');
  const sebe = await projde('N4f4', () => api.cileUloz(ALBERT, { ...C1, id: 1, hodnota: '50000' }), 'uložení cíle beze změny rozsahu není duplikát sebe sama');
  over('N4f5', !!kratsi && !!eur && sebe?.id === 1 && sebe?.hodnota === '50000.00', 'jen přesný duplikát odmítnutý', JSON.stringify({ kratsi: kratsi?.id, eur: eur?.id, sebe: sebe?.id }));
  // zrušení: smi_upravit; po zrušení stejný cíl jde zadat znovu; zrušený už změnit ani zrušit nejde
  const zr = await projde('N4g1', () => api.cileZrus(ALBERT, eur.id), 'zrušení cíle');
  const znovu = await projde('N4g2', () => api.cileUloz(ALBERT, { ...C1, mena: 'EUR', hodnota: 2000 }), 'po zrušení jde stejný cíl zadat znovu');
  await chyba('N4g3', () => api.cileZrus(ALBERT, eur.id), `Cíl id=${eur.id} je zrušený, změnit ani zrušit ho už nejde.`, 'zrušený znovu zrušit nejde');
  // (jiné období: přesný duplikát nového cíle by se ohlásil dřív než zrušený řádek, pořadí kontrol §4.4b)
  await chyba('N4g4', () => api.cileUloz(ALBERT, { ...C1, mena: 'EUR', obdobi_do: posun(MESIC_OD, 3), id: eur.id }), `Cíl id=${eur.id} je zrušený, změnit ani zrušit ho už nejde.`, 'zrušený změnit nejde');
  await chyba('N4g4b', () => api.cileUloz(ALBERT, { ...C1, mena: 'EUR', id: eur.id }), `Stejný cíl už je zadaný (id=${znovu?.id}): stejná metrika, rozsah, měna i období. Upravte ten.`,
    'duplikát se kontroluje před tím, jestli je upravovaný řádek zrušený (pořadí kontrol serveru)');
  await chyba('N4g5', () => api.cileZrus(ALBERT, 999), 'Cíl id=999 neexistuje.', 'zrušení neexistujícího cíle');
  over('N4g6', stejne(zr, { ok: true, id: eur.id }) && !!znovu && znovu.id !== eur.id && !(await api.cileSeznam(MIKULAS)).some((c) => c.id === eur.id)
    && udalosti().some((e) => e.type === 'cil_zmena' && e.detail === `Cíl ${eur.id} zrušen.`),
    'zrušení: {ok: true, id}, zmizí ze seznamu, událost „Cíl <id> zrušen.“', JSON.stringify(zr));
  const prid = udalosti().find((e) => e.type === 'cil_zmena' && e.detail.startsWith(`Cíl ${vlastni?.id} přidán`));
  const pridTym = udalosti().find((e) => e.type === 'cil_zmena' && e.detail.startsWith(`Cíl ${tymA?.id} přidán`));
  const pridEur = udalosti().find((e) => e.type === 'cil_zmena' && e.detail.startsWith(`Cíl ${eur?.id} přidán`));
  over('N4h', prid?.detail === `Cíl ${vlastni?.id} přidán: prodane_weby 2.00 ${MESIC_OD} až ${MESIC_DO}, osoba 4` && prid?.actor === 'Mikuláš'
    && pridTym?.detail === `Cíl ${tymA?.id} přidán: zajem 12.00 ${MESIC_OD} až ${MESIC_DO}, tým 4`
    && pridEur?.detail === `Cíl ${eur?.id} přidán: hodnota_prodeju 2000.00 EUR ${MESIC_OD} až ${MESIC_DO}, firma`
    && udalosti().some((e) => e.detail === `Cíl 1 změněn: hodnota_prodeju 50000.00 CZK ${MESIC_OD} až ${MESIC_DO}, firma`),
    'události cil_zmena: „Cíl <id> přidán/změněn: <metrika> <hodnota>[ <mena>] <od> až <do>, osoba/tým/firma“', JSON.stringify(udalosti().filter((e) => e.type === 'cil_zmena').map((e) => e.detail)));
});

/* ---------------- N5) výplaty provizí (D10) ---------------- */
await blok('N5', async () => {
  if (!API?.mockApi?.provizeVyplatySeznam) return;
  const api = API.mockApi;
  const s = await api.provizeVyplatySeznam(MIKULAS);
  over('N5a', s.length === 1 && stejne(Object.keys(s[0]).sort(), KLICE_VYPLATY) && s[0].user_id === 2 && s[0].jmeno === 'Petra' && s[0].castka === '1470.00' && s[0].zapsal === 'Albert',
    'výplaty: každý super admin vidí všechny, tvar Vyplata (11 klíčů), částka „1470.00“', JSON.stringify(s));
  const V = { user_id: 3, castka: '500', mena: 'CZK', vyplaceno_dne: DNES };
  const PRAVO = 'Výplatu provize zapisuje jen super admin toho člověka nebo Albert.';
  const honza = await projde('N5b1', () => api.provizeVyplataUloz(MIKULAS, { ...V, poznamka: ' za říjen ', za_obdobi_od: '2026-10-01', za_obdobi_do: '2026-10-31' }), 'Mikuláš Honzovi');
  await projde('N5b2', () => api.provizeVyplataUloz(MIKULAS, { ...V, user_id: 4 }), 'Mikuláš sám sobě (jeho tým)');
  await chyba('N5b3', () => api.provizeVyplataUloz(MIKULAS, { ...V, user_id: 2 }), PRAVO, 'Mikuláš Petře (tým Alberta)');
  await chyba('N5b4', () => api.provizeVyplataUloz(MIKULAS, { ...V, user_id: 1 }), PRAVO, 'Mikuláš Albertovi');
  await chyba('N5b5', () => api.provizeVyplataUloz(MIKULAS, { ...V, id: 1 }), PRAVO, 'výplatu Petry nezmění ani přepsáním na Honzu (právo na uloženého příjemce)');
  await chyba('N5b6', () => api.provizeVyplataZrus(MIKULAS, 1), PRAVO, 'výplatu Petry nezruší');
  await chyba('N5b7', () => api.provizeVyplataUloz(MIKULAS, { ...V, user_id: 2, castka: 0 }), 'Částka výplaty musí být kladné číslo s nejvýš dvěma desetinnými místy.', 'kontrola částky před právem');
  over('N5b8', !!honza && stejne(Object.keys(honza).sort(), KLICE_VYPLATY) && honza.jmeno === 'Honza' && honza.castka === '500.00' && honza.poznamka === 'za říjen'
    && honza.za_obdobi_do === '2026-10-31' && honza.zapsal === 'Mikuláš' && posledniUdalost()?.type === 'vyplata_zmena',
    'uložená výplata: jméno příjemce, „500.00“, poznámka oříznutá, období včetně, zapsal Mikuláš', JSON.stringify(honza));
  const pEva = await projde('N5c1', () => api.provizeVyplataUloz(ALBERT, { ...V, user_id: 5, castka: 123.4 }), 'Albert komukoli (Eva)');
  over('N5c2', udalosti().some((e) => e.detail === `Výplata ${honza?.id} přidána: 3 500.00 CZK ${DNES}`) && posledniUdalost()?.detail === `Výplata ${pEva?.id} přidána: 5 123.40 CZK ${DNES}`,
    'událost vyplata_zmena „Výplata <id> přidána: <user_id> <castka> <mena> <vyplaceno_dne>“', JSON.stringify(udalosti().filter((e) => e.type === 'vyplata_zmena').map((e) => e.detail)));
  // kontroly doslova (kontrakt §4.5b)
  await chyba('N5d1', () => api.provizeVyplataUloz(ALBERT, null), 'Výplata chybí: pošlete objekt s poli výplaty.', 'bez objektu');
  await chyba('N5d2', () => api.provizeVyplataUloz(ALBERT, { ...V, jmeno: 'x', komu: 1 }), 'Neplatné pole výplaty: komu.', 'neznámý klíč (jmeno je jen ke čtení)');
  await chyba('N5d3', () => api.provizeVyplataUloz(ALBERT, { ...V, user_id: undefined }), 'Uživatel id=(null) neexistuje.', 'bez příjemce');
  await chyba('N5d4', () => api.provizeVyplataUloz(ALBERT, { ...V, user_id: 999 }), 'Uživatel id=999 neexistuje.', 'neexistující příjemce');
  await chyba('N5d5', () => api.provizeVyplataUloz(ALBERT, { ...V, castka: '-1' }), 'Částka výplaty musí být kladné číslo s nejvýš dvěma desetinnými místy.', 'záporná částka');
  await chyba('N5d6', () => api.provizeVyplataUloz(ALBERT, { ...V, mena: 'czk' }), 'Neplatná měna: czk. Povolené: CZK, EUR.', 'měna velkými písmeny');
  await chyba('N5d7', () => api.provizeVyplataUloz(ALBERT, { ...V, vyplaceno_dne: '18. 11.' }), 'Neplatné datum v poli vyplaceno_dne: čekám RRRR-MM-DD.', 'den výplaty ve špatném tvaru');
  await chyba('N5d8', () => api.provizeVyplataUloz(ALBERT, { ...V, vyplaceno_dne: null }), 'Zadejte, kdy byla provize vyplacena.', 'bez dne výplaty');
  await chyba('N5d9', () => api.provizeVyplataUloz(ALBERT, { ...V, za_obdobi_od: 'říjen' }), 'Neplatné datum v poli za_obdobi_od: čekám RRRR-MM-DD.', 'období ve špatném tvaru');
  await chyba('N5d10', () => api.provizeVyplataUloz(ALBERT, { ...V, za_obdobi_od: '2026-10-31', za_obdobi_do: '2026-10-01' }), 'Období výplaty: konec nesmí být dřív než začátek.', 'obrácené období');
  await chyba('N5d11', () => api.provizeVyplataUloz(ALBERT, { ...V, poznamka: ['x'] }), 'Neplatné pole výplaty: poznamka.', 'poznámka jako pole');
  await chyba('N5d12', () => api.provizeVyplataUloz(ALBERT, { ...V, poznamka: 'p'.repeat(301) }), 'Poznámka k výplatě je moc dlouhá: nejvýš 300 znaků.', 'dlouhá poznámka');
  await chyba('N5d13', () => api.provizeVyplataUloz(ALBERT, { ...V, id: 999 }), 'Výplata id=999 neexistuje.', 'úprava neexistující výplaty');
  const z = await projde('N5e1', () => api.provizeVyplataZrus(ALBERT, pEva.id), 'zrušení výplaty');
  await chyba('N5e2', () => api.provizeVyplataZrus(ALBERT, pEva.id), `Výplata id=${pEva.id} je zrušená, změnit ani zrušit ji už nejde.`, 'zrušenou znovu zrušit nejde');
  await chyba('N5e3', () => api.provizeVyplataUloz(ALBERT, { ...V, id: pEva.id }), `Výplata id=${pEva.id} je zrušená, změnit ani zrušit ji už nejde.`, 'zrušenou změnit nejde');
  await chyba('N5e4', () => api.provizeVyplataZrus(ALBERT, 999), 'Výplata id=999 neexistuje.', 'zrušení neexistující');
  over('N5e5', stejne(z, { ok: true, id: pEva.id }) && posledniUdalost()?.detail === `Výplata ${pEva.id} zrušena.` && !(await api.provizeVyplatySeznam(ALBERT)).some((v) => v.id === pEva.id),
    'zrušení výplaty: {ok: true, id}, zmizí ze seznamu, událost „Výplata <id> zrušena.“', JSON.stringify(z));
  const s2 = await api.provizeVyplatySeznam(ALBERT);
  over('N5f', serazeno(s2, 'vyplaceno_dne'), 'výplaty seřazené podle dne výplaty a id sestupně', JSON.stringify(s2.map((v) => [v.id, v.vyplaceno_dne])));
});

/* ---------------- N6) uložení se projeví v číslech ---------------- */
await blok('N6', async () => {
  if (!API?.mockApi?.nakladyUloz) return;
  const api = API.mockApi;
  const F = { od: MESIC_OD, do: MESIC_DO };
  const czk = (m) => Number(m.castky.find((c) => c.mena === 'CZK')?.hodnota ?? NaN);
  // náklad → Náklady celkem a kategorie (prehled_finance)
  const f0 = await api.prehledFinance(ALBERT, F);
  const kat0 = Object.fromEntries(f0.data.naklady.kategorie.map((k) => [k.kategorie, k]));
  const n = await api.nakladyUloz(ALBERT, { kategorie: 'jine', castka: '1234.50', mena: 'CZK', opakovani: 'jednorazove', plati_od: DNES, overit: true });
  const f1 = await api.prehledFinance(ALBERT, F);
  const kat1 = Object.fromEntries(f1.data.naklady.kategorie.map((k) => [k.kategorie, k]));
  const v1 = f1.meta.varovani.find((v) => v.kod === 'NAKLADY_OVERIT')?.text ?? '';
  over('N6a', Math.abs(czk(f1.data.naklady.celkem) - czk(f0.data.naklady.celkem) - 1234.5) < 0.005 && Math.abs(czk(kat1.jine.castka) - czk(kat0.jine.castka) - 1234.5) < 0.005
    && kat1.jine.overit === kat0.jine.overit + 1 && /: 2\.$/.test(v1),
    'uložený náklad: Náklady celkem a kategorie Jiné o 1 234,50 Kč víc, „ověřit“ u kategorie a NAKLADY_OVERIT započítá nový řádek',
    JSON.stringify({ pred: f0.data.naklady.celkem.castky, po: f1.data.naklady.celkem.castky, v1 }));
  await pockej(5);
  await api.nakladyZrus(ALBERT, n.id);
  const f2 = await api.prehledFinance(ALBERT, F);
  over('N6b', czk(f2.data.naklady.celkem) === czk(f0.data.naklady.celkem), 'zrušený náklad se už neúčtuje', JSON.stringify(f2.data.naklady.celkem.castky));
  // cíl → Plnění cíle a data.cil (prehled_souhrn): cíl firmy na tento měsíc 50 000 → 100 000 Kč
  const s0 = await api.prehledSouhrn(ALBERT, F);
  await api.cileUloz(ALBERT, { id: 1, metrika: 'hodnota_prodeju', obdobi_od: MESIC_OD, obdobi_do: MESIC_DO, mena: 'CZK', hodnota: '100000' });
  const s1 = await api.prehledSouhrn(ALBERT, F);
  const p0 = s0.data.karty.plneni_cile;
  const p1 = s1.data.karty.plneni_cile;
  over('N6c', p0.jmenovatel === 50000 && p1.jmenovatel === 100000 && s1.data.cil?.id === 1 && s1.data.cil?.hodnota === '100000.00' && p1.citatel === p0.citatel
    && (p0.hodnota === null || Math.abs(p1.hodnota - p0.hodnota / 2) < 1e-6),
    'uložený cíl: Plnění cíle počítá s novou hodnotou (100 000 Kč), data.cil je uložený cíl', JSON.stringify({ p0: [p0.citatel, p0.jmenovatel, p0.hodnota], p1: [p1.citatel, p1.jmenovatel, p1.hodnota] }));
  // zrušený cíl firmy na měsíc: plnění vezme roční cíl firmy (nejkratší, který období obsahuje)
  await pockej(5);
  const kCil = new Date().toISOString(); // okamžik, kdy cíl 1 (100 000 Kč) ještě platí
  await pockej(5);
  await api.cileZrus(ALBERT, 1);
  const s2 = await api.prehledSouhrn(ALBERT, F);
  over('N6d', s2.data.cil?.id === 4 && s2.data.karty.plneni_cile.jmenovatel === 400000, 'po zrušení cíle na měsíc platí roční cíl firmy', JSON.stringify(s2.data.cil));
  // pohled k datu PŘED zrušením (scénář recenze 14b over-kdatu.mjs; 073: zadaný nejpozději k datu a zruseno_at > k_datu ještě
  // platí): cíl 1 tam pořád je; cíl zadaný až po tom okamžiku tam není (souhrn i trend proti cíli)
  const sK = await api.prehledSouhrn(ALBERT, { ...F, k_datu: kCil });
  const X = await api.cileUloz(ALBERT, { metrika: 'hodnota_prodeju', obdobi_od: MESIC_OD, obdobi_do: MESIC_DO, user_id: null, tym_id: null, mena: 'CZK', hodnota: '60000' });
  const s3 = await api.prehledSouhrn(ALBERT, F);
  const s3K = await api.prehledSouhrn(ALBERT, { ...F, k_datu: kCil });
  const cileRady = async (f) => (await api.prehledRada(ALBERT, 'hodnota_prodeju', 'den', f)).data.cile.map((c) => c.cil_id);
  const rZive = await cileRady(F);
  const rK = await cileRady({ ...F, k_datu: kCil });
  over('N6d2', sK.data.cil?.id === 1 && sK.data.karty.plneni_cile.jmenovatel === 100000 && s3.data.cil?.id === X.id && s3K.data.cil?.id === 1
    && rZive.includes(X.id) && !rZive.includes(1) && rK.includes(1) && !rK.includes(X.id),
    'k datu před zrušením: zrušený cíl 1 v plnění cíle i v trendu dál platí, cíl zadaný až potom ne; živě naopak',
    JSON.stringify({ kDatu: sK.data.cil, s3: s3.data.cil?.id, s3K: s3K.data.cil?.id, rZive, rK }));
  await pockej(5);
  await api.cileZrus(ALBERT, X.id);
  // výplata → Provize vyplaceno a zbývá (prehled_finance) a řádek člověka (prehled_lide)
  const fin0 = await api.prehledFinance(ALBERT, F);
  const lide0 = await api.prehledLide(ALBERT, { ...F, lide: [5] });
  const v = await api.provizeVyplataUloz(ALBERT, { user_id: 5, castka: '777', mena: 'CZK', vyplaceno_dne: DNES });
  const fin1 = await api.prehledFinance(ALBERT, F);
  const lide1 = await api.prehledLide(ALBERT, { ...F, lide: [5] });
  const eva0 = lide0.data.radky.find((r) => r.user_id === 5).metriky;
  const eva1 = lide1.data.radky.find((r) => r.user_id === 5).metriky;
  over('N6e', Math.abs(czk(fin1.data.provize.vyplaceno) - czk(fin0.data.provize.vyplaceno) - 777) < 0.005
    && Math.abs(czk(fin0.data.provize.zbyva) - czk(fin1.data.provize.zbyva) - 777) < 0.005
    && Math.abs(czk(eva1.provize_vyplaceno) - czk(eva0.provize_vyplaceno) - 777) < 0.005 && Math.abs(czk(eva0.provize_zbyva) - czk(eva1.provize_zbyva) - 777) < 0.005,
    'uložená výplata: Provize vyplaceno o 777 Kč víc a zbývá o 777 Kč méně ve Financích i v řádku Evy', JSON.stringify({ f0: fin0.data.provize.vyplaceno.castky, f1: fin1.data.provize.vyplaceno.castky, eva1: eva1.provize_vyplaceno.castky }));
  await pockej(5);
  const kV = new Date().toISOString(); // okamžik, kdy výplata 777 Kč ještě platí
  await pockej(5);
  await api.provizeVyplataZrus(ALBERT, v.id);
  const fin2 = await api.prehledFinance(ALBERT, F);
  over('N6f', czk(fin2.data.provize.vyplaceno) === czk(fin0.data.provize.vyplaceno), 'zrušená výplata se už nepočítá', JSON.stringify(fin2.data.provize.vyplaceno.castky));
  // k datu před zrušením (073 app_prehled_vyplaty: zapsaná nejpozději k datu, zruseno_at > k_datu): výplata se pořád počítá ve
  // Financích i v řádku Evy (vyplaceno i zbývá), jako v okamžiku, kdy platila
  const finK = await api.prehledFinance(ALBERT, { ...F, k_datu: kV });
  const evaK = (await api.prehledLide(ALBERT, { ...F, lide: [5], k_datu: kV })).data.radky.find((r) => r.user_id === 5).metriky;
  over('N6f2', czk(finK.data.provize.vyplaceno) === czk(fin1.data.provize.vyplaceno) && czk(evaK.provize_vyplaceno) === czk(eva1.provize_vyplaceno)
    && czk(evaK.provize_zbyva) === czk(eva1.provize_zbyva),
    'k datu před zrušením: zrušená výplata ve Financích i v řádku člověka (vyplaceno i zbývá) dál platí',
    JSON.stringify({ finK: finK.data.provize.vyplaceno.castky, fin1: fin1.data.provize.vyplaceno.castky, evaK: evaK.provize_vyplaceno.castky, eva1: eva1.provize_vyplaceno.castky }));
  // zdroj v hlavičce: poslední záznam nákladů, cílů a výplat je čas posledního uložení
  const m = await api.prehledMoznosti(ALBERT);
  const zdroj = (k) => m.data.zdroje.find((z) => z.zdroj === k);
  over('N6g', ['naklady', 'cile', 'vyplaty'].every((k) => zdroj(k)?.stav === 'ok' && Date.now() - Date.parse(zdroj(k).aktualni_k) < 60000),
    'prehled_moznosti: zdroje Náklady, Cíle a Výplaty provizí mají čerstvý poslední záznam', JSON.stringify(['naklady', 'cile', 'vyplaty'].map(zdroj)));
  // zrušení je taky záznam (073 prehled_moznosti: greatest(max zapsáno, max zrušeno)): poslední byla zrušení, ne zápisy
  over('N6g2', Date.parse(zdroj('naklady')?.aktualni_k) > Date.parse(n.zapsano_at) && Date.parse(zdroj('cile')?.aktualni_k) > Date.parse(X.zadano_at)
    && Date.parse(zdroj('vyplaty')?.aktualni_k) > Date.parse(v.zapsano_at),
    'čerstvost zdrojů Náklady, Cíle a Výplaty počítá i zrušení (poslední záznam = poslední zrušení)',
    JSON.stringify({ naklady: [n.zapsano_at, zdroj('naklady')?.aktualni_k], cile: [X.zadano_at, zdroj('cile')?.aktualni_k], vyplaty: [v.zapsano_at, zdroj('vyplaty')?.aktualni_k] }));
});

/* ---------------- N7) pomocníci formulářů ---------------- */
await blok('N7', async () => {
  if (!H) return;
  over('N7a', stejne(H.KATEGORIE_NAKLADU.map((k) => [k.klic, k.nazev]), [['claude', 'Claude (předplatné)'], ['lovable', 'Lovable (předplatné)'], ['domena', 'Domény'], ['hosting', 'Hosting (náš náklad)'], ['jine', 'Jiné']])
    && stejne(H.OPAKOVANI_NAKLADU.map((o) => [o.klic, o.nazev]), [['jednorazove', 'Jednorázově'], ['mesicne', 'Měsíčně'], ['rocne', 'Ročně']])
    && stejne(H.METRIKY_CILU.map((m) => [m.klic, m.nazev, m.vMene, m.celeCislo]), [['prodane_weby', 'Prodané weby', false, true], ['hodnota_prodeju', 'Hodnota prodejů', true, false],
      ['inkaso', 'Inkaso', true, false], ['hovory', 'Hovory', false, true], ['zajem', 'Hovory se zájmem', false, true], ['odpracovane_hodiny', 'Odpracované hodiny', false, false]]),
    'registry kontraktu §3.5 a §3.6: pět kategorií evidence (bez provize), tři opakování, šest metrik cíle s měnou a celým číslem', '');
  over('N7b', H.castkaProServer('1 234,50') === '1234.50' && H.castkaProServer(' 350 ') === '350' && H.castkaProServer('12.5') === '12.5' && H.castkaProServer('1 000 Kč') === '1 000 Kč'
    && H.castkaProServer('5 000') === '5000' && H.castkaProServer('') === '',
    'částka z pole: mezery (i pevné) pryč a desetinná čárka na tečku; co není číslo, jde serveru, jak je (odmítne svou větou)', '');
  const moz = await API?.mockApi?.prehledMoznosti(MIKULAS);
  const mozA = await API?.mockApi?.prehledMoznosti(ALBERT);
  if (moz && mozA) {
    const volbyM = H.volbyRozsahuCile(moz.data).map((v) => [v.hodnota, v.nazev]);
    const volbyA = H.volbyRozsahuCile(mozA.data).map((v) => v.hodnota);
    over('N7c', stejne(volbyM, [['tym:4', 'Tým Mikuláš'], ['osoba:4', 'Mikuláš'], ['osoba:3', 'Honza']])
      && stejne(volbyA, ['firma', 'tym:1', 'tym:4', 'osoba:1', 'osoba:5', 'osoba:2', 'osoba:4', 'osoba:3']),
      'rozsah cíle podle D9: Mikuláš jen svůj tým, sebe a Honzu; Albert celou firmu, oba týmy a každého (pořadí týmů a lidí z prehled_moznosti)',
      JSON.stringify({ volbyM, volbyA }));
    over('N7d', stejne(H.rozsahZVolby('firma'), { user_id: null, tym_id: null }) && stejne(H.rozsahZVolby('tym:4'), { user_id: null, tym_id: 4 }) && stejne(H.rozsahZVolby('osoba:3'), { user_id: 3, tym_id: null })
      && H.volbaZRozsahu({ user_id: null, tym_id: null }) === 'firma' && H.volbaZRozsahu({ user_id: 3, tym_id: null }) === 'osoba:3' && H.volbaZRozsahu({ user_id: null, tym_id: 4 }) === 'tym:4',
      'rozsah cíle tam a zpět (firma, tým, člověk)', '');
    over('N7e', stejne(H.lideProVyplatu(moz.data).map((l) => l.id), [4, 3]) && stejne(H.lideProVyplatu(mozA.data).map((l) => l.id), [1, 5, 2, 4, 3])
      && H.smiVyplatu(moz.data, 3) && !H.smiVyplatu(moz.data, 2) && H.smiVyplatu(mozA.data, 2),
      'příjemci výplaty podle D10: Mikuláš sobě a Honzovi, Albert komukoli; smiVyplatu u uložené výplaty', JSON.stringify(H.lideProVyplatu(moz.data).map((l) => l.id)));
  }
  over('N7f', H.rozsahCile({ user_id: null, user_jmeno: null, tym_id: null, tym_jmeno: null }) === 'Celá firma' && H.rozsahCile({ user_id: null, user_jmeno: null, tym_id: 4, tym_jmeno: 'Tým Mikuláš' }) === 'Tým Mikuláš'
    && H.rozsahCile({ user_id: 3, user_jmeno: 'Honza', tym_id: null, tym_jmeno: null }) === 'Honza',
    'kdo: Celá firma, tým, člověk', '');
  over('N7g', text(H.obdobiText('2026-11-01', '2026-11-30')) === '1. 11. 2026 – 30. 11. 2026' && H.obdobiText('2026-11-01', null) === 'od 1. 11. 2026' && H.obdobiText(null, null) === '—'
    && H.obdobiText('2026-11-21', '2026-11-21') === '21. 11. 2026' && H.obdobiText(null, '2026-10-31') === 'do 31. 10. 2026',
    'období včetně posledního dne (R6): „1. 11. 2026 – 30. 11. 2026“, otevřené „od …“, jeden den jednou', '');
  over('N7h', text(H.textHodnotyCile({ metrika: 'hodnota_prodeju', hodnota: '50000.00', mena: 'CZK' })) === '50 000 Kč' && text(H.textHodnotyCile({ metrika: 'inkaso', hodnota: '2000.50', mena: 'EUR' })) === '2 000,50 €'
    && H.textHodnotyCile({ metrika: 'prodane_weby', hodnota: '3.00', mena: null }) === '3' && text(H.textHodnotyCile({ metrika: 'odpracovane_hodiny', hodnota: '30.50', mena: null })) === '30,5 h',
    'hodnota cíle: peníze v měně cíle, počty celé, hodiny s „h“', '');
  const POLE = [
    ['naklad', 'Neplatná kategorie nákladu: x. Povolené: claude, lovable, domena, hosting, jine.', 'kategorie'],
    ['naklad', 'Částka nákladu musí být kladné číslo s nejvýš dvěma desetinnými místy.', 'castka'],
    ['naklad', 'Neplatná měna: USD. Povolené: CZK, EUR.', 'mena'],
    ['naklad', 'Neplatné opakování: x. Povolené: jednorazove, mesicne, rocne.', 'opakovani'],
    ['naklad', 'Neplatné datum v poli plati_do: čekám RRRR-MM-DD.', 'plati_do'],
    ['naklad', 'Zadejte, od kterého dne náklad platí.', 'plati_od'],
    ['naklad', 'Náklad nemůže skončit dřív, než začne.', 'plati_do'],
    ['naklad', 'Jednorázový náklad nemá konec platnosti; plati_do nechte prázdné.', 'plati_do'],
    ['naklad', 'Popis nákladu je moc dlouhý: nejvýš 300 znaků.', 'popis'],
    ['naklad', 'Kontakt id=9 neexistuje.', 'kontakt_id'],
    ['cil', 'Hodnota cíle musí být kladné číslo s nejvýš dvěma desetinnými místy.', 'hodnota'],
    ['cil', 'Cíl hovory musí být celé číslo.', 'hodnota'],
    ['cil', 'Cíl inkaso je v penězích: zadejte měnu CZK nebo EUR.', 'mena'],
    ['cil', 'Období cíle: konec nesmí být dřív než začátek.', 'obdobi_do'],
    ['cil', 'Cíl pro tento tým zadává jen jeho super admin nebo Albert.', 'rozsah'],
    ['cil', 'Uživatel id=3 neexistuje.', 'rozsah'],
    ['cil', 'Stejný cíl už je zadaný (id=1): stejná metrika, rozsah, měna i období. Upravte ten.', null],
    ['vyplata', 'Uživatel id=3 neexistuje.', 'user_id'],
    ['vyplata', 'Výplatu provize zapisuje jen super admin toho člověka nebo Albert.', 'user_id'],
    ['vyplata', 'Zadejte, kdy byla provize vyplacena.', 'vyplaceno_dne'],
    ['vyplata', 'Období výplaty: konec nesmí být dřív než začátek.', 'za_obdobi_do'],
    ['vyplata', 'Poznámka k výplatě je moc dlouhá: nejvýš 300 znaků.', 'poznamka'],
    ['vyplata', 'Server neodpovídá. Zkontrolujte připojení k internetu.', null],
  ];
  const spatne = POLE.filter(([f, t, p]) => H.poleChyby(t, f) !== p).map(([f, t, p]) => `${f} „${t}“ → ${H.poleChyby(t, f)} (čekám ${p})`);
  over('N7i', spatne.length === 0, 'chyba serveru ukáže na své pole (aria-invalid), věta formuláře bez pole na žádné', spatne.join(' | '));
  over('N7j', stejne(H.mesicDne('2026-11-18'), { od: '2026-11-01', do: '2026-11-30' }) && stejne(H.mesicDne('2028-02-10'), { od: '2028-02-01', do: '2028-02-29' }),
    'výchozí období nového cíle = celý měsíc dne (i přestupný únor)', '');
  // důvod „jen ke čtení“ u cíle = věta serveru 072 podle rozsahu (recenze 14b, drobnost 5: cíl firmy zadává jen Albert)
  const proc = typeof H.procJenKCteniCile === 'function'
    ? [H.procJenKCteniCile({ user_id: null, tym_id: null }), H.procJenKCteniCile({ user_id: null, tym_id: 4 }), H.procJenKCteniCile({ user_id: 3, tym_id: null })] : null;
  over('N7k', stejne(proc, ['Cíl pro celou firmu zadává jen Albert.', 'Cíl pro tento tým zadává jen jeho super admin nebo Albert.', 'Cíl pro tohoto člověka zadává jen jeho super admin nebo Albert.']),
    'cíl jen ke čtení: důvod větou serveru podle rozsahu (firma jen Albert, tým a člověk jejich super admin nebo Albert)', JSON.stringify(proc));
});

/* ---------------- N8) tabulky nastavení ---------------- */
await blok('N8', async () => {
  if (!T) return;
  const { renderToStaticMarkup: r, createElement: h } = T;
  const nakl = [
    { id: 6, kategorie: 'hosting', popis: 'Hosting webu', castka: '350.00', mena: 'CZK', opakovani: 'mesicne', plati_od: '2026-11-01', plati_do: '2026-12-31', kontakt_id: 7, kontakt_jmeno: 'Penzion Šumava', overit: true, zapsal: 'Mikuláš', zapsano_at: '2026-11-18T08:00:00.000Z' },
    { id: 7, kategorie: 'jine', popis: null, castka: '12.50', mena: 'EUR', opakovani: 'jednorazove', plati_od: '2026-11-21', plati_do: null, kontakt_id: null, kontakt_jmeno: null, overit: false, zapsal: 'Albert', zapsano_at: '2026-11-18T08:00:00.000Z' },
    { id: 1, kategorie: 'claude', popis: 'Seed', castka: '5000.00', mena: 'CZK', opakovani: 'mesicne', plati_od: '2026-11-01', plati_do: null, kontakt_id: null, kontakt_jmeno: null, overit: false, zapsal: 'Albert', zapsano_at: '2026-11-17T20:00:00.000Z' },
  ];
  const htmlN = r(h(T.TabulkaNakladu, { radky: nakl, onUpravit: () => {}, onZrusit: () => {} }));
  const radek = (html, id) => text((new RegExp(`<tr[^>]*data-id="${id}"[^>]*>([\\s\\S]*?)</tr>`).exec(html) ?? [])[1] ?? '');
  over('N8a', /data-tabulka="nastaveni-naklady"/.test(htmlN) && /ověřit/.test(radek(htmlN, 6)) && !/ověřit/.test(radek(htmlN, 7)) && !/ověřit/.test(radek(htmlN, 1))
    && /350 Kč/.test(radek(htmlN, 6)) && /12,50 €/.test(radek(htmlN, 7)) && /5 000 Kč/.test(radek(htmlN, 1))
    && /1\. 11\. 2026 – 31\. 12\. 2026/.test(radek(htmlN, 6)) && /od 1\. 11\. 2026/.test(radek(htmlN, 1)) && /21\. 11\. 2026/.test(radek(htmlN, 7))
    && /Penzion Šumava/.test(radek(htmlN, 6)) && /Hosting \(náš náklad\)/.test(radek(htmlN, 6)) && /Měsíčně/.test(radek(htmlN, 6)) && /Jednorázově/.test(radek(htmlN, 7))
    && (htmlN.match(/data-akce="upravit"/g) ?? []).length === 3 && (htmlN.match(/data-akce="zrusit"/g) ?? []).length === 3 && !/Celkem|Dohromady/.test(text(htmlN)),
    'tabulka nákladů: „ověřit“ jen u řádku k ověření, částka ve své měně (Kč i €, nikdy sečtené), období včetně, klient, kategorie a opakování česky, akce u každého řádku',
    radek(htmlN, 6));
  const cile = [
    { id: 1, metrika: 'hodnota_prodeju', obdobi_od: '2026-11-01', obdobi_do: '2026-11-30', user_id: null, user_jmeno: null, tym_id: null, tym_jmeno: null, mena: 'CZK', hodnota: '50000.00', zadal: 'Albert', zadano_at: '2026-11-01T03:00:00.000Z', smi_upravit: false },
    { id: 2, metrika: 'prodane_weby', obdobi_od: '2026-11-01', obdobi_do: '2026-11-30', user_id: null, user_jmeno: null, tym_id: 4, tym_jmeno: 'Tým Mikuláš', mena: null, hodnota: '3.00', zadal: 'Mikuláš', zadano_at: '2026-11-01T03:00:00.000Z', smi_upravit: true },
    { id: 9, metrika: 'odpracovane_hodiny', obdobi_od: '2026-11-01', obdobi_do: '2026-11-30', user_id: 3, user_jmeno: 'Honza', tym_id: null, tym_jmeno: null, mena: null, hodnota: '30.50', zadal: 'Mikuláš', zadano_at: '2026-11-01T03:00:00.000Z', smi_upravit: true },
  ];
  const htmlC = r(h(T.TabulkaCilu, { radky: cile, onUpravit: () => {}, onZrusit: () => {} }));
  over('N8b', /data-tabulka="nastaveni-cile"/.test(htmlC) && /Celá firma/.test(radek(htmlC, 1)) && /50 000 Kč/.test(radek(htmlC, 1)) && /jen ke čtení/.test(radek(htmlC, 1))
    && !/data-akce/.test((new RegExp('<tr[^>]*data-id="1"[^>]*>([\\s\\S]*?)</tr>').exec(htmlC) ?? [])[1] ?? '')
    && /Tým Mikuláš/.test(radek(htmlC, 2)) && /Prodané weby/.test(radek(htmlC, 2)) && /\b3\b/.test(radek(htmlC, 2)) && /30,5 h/.test(radek(htmlC, 9)) && /Honza/.test(radek(htmlC, 9))
    && /1\. 11\. 2026 – 30\. 11\. 2026/.test(radek(htmlC, 2)) && (htmlC.match(/data-akce="upravit"/g) ?? []).length === 2,
    'tabulka cílů: kdo, metrika, hodnota v jednotce, období včetně; bez smi_upravit jen „jen ke čtení“ a žádné tlačítko', radek(htmlC, 1));
  const vyplaty = [
    { id: 1, user_id: 2, jmeno: 'Petra', castka: '1470.00', mena: 'CZK', vyplaceno_dne: '2026-11-15', za_obdobi_od: '2026-10-01', za_obdobi_do: '2026-10-31', poznamka: 'Provize za Penzion Šumava', zapsal: 'Albert', zapsano_at: '2026-11-15T08:00:00.000Z' },
    { id: 2, user_id: 3, jmeno: 'Honza', castka: '20.00', mena: 'EUR', vyplaceno_dne: '2026-11-16', za_obdobi_od: null, za_obdobi_do: null, poznamka: null, zapsal: 'Mikuláš', zapsano_at: '2026-11-16T08:00:00.000Z' },
  ];
  const htmlV = r(h(T.TabulkaVyplat, { radky: vyplaty, smi: (v) => v.user_id === 3, onUpravit: () => {}, onZrusit: () => {} }));
  over('N8c', /data-tabulka="nastaveni-vyplaty"/.test(htmlV) && /1 470 Kč/.test(radek(htmlV, 1)) && /20 €/.test(radek(htmlV, 2)) && /1\. 10\. 2026 – 31\. 10\. 2026/.test(radek(htmlV, 1))
    && /15\. 11\. 2026/.test(radek(htmlV, 1)) && /jen ke čtení/.test(radek(htmlV, 1)) && (htmlV.match(/data-akce="upravit"/g) ?? []).length === 1,
    'tabulka výplat: částka ve své měně, den výplaty, období včetně; výplatu cizího týmu jen ke čtení', radek(htmlV, 1));
  // čtečky: každá tabulka má popisek a záhlaví sloupců; tlačítka nesou, co mění
  over('N8d', [htmlN, htmlC, htmlV].every((x) => /<table[^>]*aria-label="[^"]+"/.test(x) && /<th scope="col"/.test(x))
    && /aria-label="Upravit náklad: Hosting \(náš náklad\)[^"]*"/.test(htmlN) && /aria-label="Zrušit cíl: Prodané weby[^"]*"/.test(htmlC),
    'tabulky mají popisek a záhlaví; tlačítka „Upravit …: <co>“ a „Zrušit …: <co>“ pro čtečky', '');
  // cíl firmy jen ke čtení: věta serveru „Cíl pro celou firmu zadává jen Albert.“ v bublině i pro čtečky (recenze 14b, drobnost 5)
  const radek1 = (new RegExp('<tr[^>]*data-id="1"[^>]*>([\\s\\S]*?)</tr>').exec(htmlC) ?? [])[1] ?? '';
  over('N8b2', /title="Cíl pro celou firmu zadává jen Albert\."/.test(radek1) && /jen ke čtení\s*: Cíl pro celou firmu zadává jen Albert\./.test(text(radek1)),
    'cíl firmy jen ke čtení: důvod „Cíl pro celou firmu zadává jen Albert.“ v bublině i textem pro čtečky', text(radek1));
  // telefon (do 640 px) skládá tabulky do bloků: výslovné role (table, rowgroup, row, columnheader, rowheader, cell), ať čtečka
  // (VoiceOver) tabulku dál čte jako tabulku (recenze 14b, drobnost 6)
  const role = (html) => ({
    table: /<table[^>]*role="table"/.test(html),
    rowgroup: (html.match(/<(thead|tbody)[^>]*role="rowgroup"/g) ?? []).length === 2,
    row: (html.match(/<tr\b/g) ?? []).length === (html.match(/<tr[^>]*role="row"/g) ?? []).length,
    columnheader: (html.match(/<th scope="col"/g) ?? []).length === (html.match(/<th scope="col"[^>]*role="columnheader"/g) ?? []).length,
    rowheader: (html.match(/<th scope="row"/g) ?? []).length === (html.match(/<th scope="row"[^>]*role="rowheader"/g) ?? []).length,
    cell: (html.match(/<td\b/g) ?? []).length === (html.match(/<td[^>]*role="cell"/g) ?? []).length,
  });
  const roleTabulek = [htmlN, htmlC, htmlV].map(role);
  over('N8f', roleTabulek.every((r) => Object.values(r).every(Boolean)),
    'tabulky nastavení mají výslovné role tabulky (na telefonu display:block nesmí vzít čtečce tabulku)', JSON.stringify(roleTabulek));
  // povinné pole: hvězdička i aria-required="true" na ovládacím prvku; nepovinné bez něj (recenze 14b, drobnost 4)
  const pole = (povinne) => r(h(T.PoleFormulare, { id: 'p-x', popisek: 'Pole', povinne }, h('input', { id: 'p-x', type: 'text' })));
  over('N8e', !!T.PoleFormulare && /<input[^>]*aria-required="true"/.test(pole(true)) && /class="req"/.test(pole(true)) && !/aria-required/.test(pole(false)),
    'povinné pole formuláře nese aria-required="true" (jako důvod odmítnutí), nepovinné ne', JSON.stringify([pole(true), pole(false)]));
});

/* ---------------- N9) zapojení ---------------- */
await blok('N9', async () => {
  const pkg = JSON.parse(src('package.json'));
  const zal = src('src/pages/prehled/ZalozkaNastaveni.tsx');
  over('N9a', /node tests\/prehlednastaveni\.test\.mjs/.test(pkg.scripts.test) && !/Zadávání se připravuje/.test(zal),
    'npm test pouští tests/prehlednastaveni.test.mjs; Nastavení už neříká „Zadávání se připravuje.“', '');
});

if (chyby === 0) {
  console.log(`ALL OK (${pocet} kontrol)`);
  process.exit(0);
}
console.log(`CHYB: ${chyby} z ${pocet}`);
process.exit(1);
