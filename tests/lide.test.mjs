// Test výběru lidí (Přehled vedení úkol 10, Albert 17. 11. 2026, rozhodnutí D7: „all the super admins can view everyone, but
// they can also filter out only their team … even with the clients … view their entire team … everyone together …
// individual people … compare or combine any two callers … easy to select how many people they want to see“; spec
// docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md §7.3, kontrakt docs/superpowers/specs/2026-11-17-prehled-kontrakt.md
// §6 a §5.5).
//
// Měří:
//  L) logiku výběru (src/lide.ts): předvolby Já, Můj tým (já a všichni s mým manager_id), Tým <super admin>, Všichni (null =
//     všichni, s „jen aktivní“ jen aktivní), texty tlačítka („Všichni (14)“, „Můj tým (3)“, „VeraP + VeraB“, „Já“, „5 lidí“),
//     poznání předvolby z zaškrtnutých lidí, co jde serveru (dnešní volání pro Já a Všichni, p_user_ids jinak) a návrat na
//     dnešní volání jednoho člověka proti serveru bez migrace 074,
//  M) DEMO mock (src/api/mock.ts) jako kontrakt §6: Volající s cizím (i neexistujícím) id dostane dnešní větou serveru pro
//     cizího člověka, sjednocení řádků za každého vybraného (bez duplicit), výběr zadaný dvakrát odmítnut, neznámé id super
//     admina nic nenajde, [] = jako dnes; prehled_lide (§5.5) jen super admin, řádky vybraných lidí a součet,
//  S) co src/api/supabase.ts posílá serveru: p_user_ids jen s výběrem (nikdy s dnešním parametrem jednoho člověka), PGRST202
//     = hláška „chybí migrace 074“ (073 u prehled_lide),
//  K) komponentu (src/components/LidePicker.tsx) vykreslenou na serveru: tlačítko s textem výběru a aria-expanded, panel
//     s předvolbami, skupinami podle týmů, zaškrtnutím, „jen aktivní“ a „Bez volajícího“ jen v Označených,
//  W) zapojení stránek (zdrojový text): sedm stránek s výběrem lidí jen pro super admina, PersonPicker ani staré výběry
//     (#user-select, #person-picker, #kalendar-kdo, #rozvrh-kdo) nikde, Volající v Kontaktech beze změny.
// Klikání (předvolby, zaškrtnutí, klávesnice, telefon, Statistiky víc lidí) měří tests/demo-e2e.mjs blok LP.
// Nikdy nesahá na síť ani živou DB (fetch je podstrčený).
// Spuštění: node tests/lide.test.mjs (APP_ROOT=/cesta/ke/kopii pro mutace). Výsledek „ALL OK (N kontrol)“ nebo řádky
// „FAIL <id>: …“ a kód 1.

import { build } from 'esbuild';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
// supabase.ts: žádný požadavek po síti, jen záznam, co by appka poslala; odpověď nastaví test
const odeslano = [];
let odpoved = { status: 200, telo: '{"rows":[],"total":0,"dalsi":false}' };
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
const serazene = (a) => [...new Set(a)].sort((x, y) => x - y);

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
  const dir = mkdtempSync(join(tmpdir(), 'lide-test-'));
  const f = join(dir, 'b.cjs');
  writeFileSync(f, out.outputFiles[0].text);
  try {
    return createRequire(import.meta.url)(f);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// každý kus zvlášť, ať RED ukáže, co přesně chybí
let L = null;
try {
  L = await balicek(["export * from './src/lide.ts';"]);
} catch (e) {
  over('L0', false, 'src/lide.ts nejde sestavit (logika výběru lidí chybí)', String(e.message).split('\n')[0]);
}
let API = null;
try {
  API = await balicek([
    "export { mockApi } from './src/api/mock.ts';",
    "export * from './src/api/supabase.ts';",
  ]);
} catch (e) {
  over('M0', false, 'mock a supabase.ts nejdou sestavit', String(e.message).split('\n')[0]);
}
let K = null;
try {
  K = await balicek([
    "export * from './src/components/LidePicker.tsx';",
    "export { default as LidePicker } from './src/components/LidePicker.tsx';",
    "export { renderToStaticMarkup } from 'react-dom/server';",
    "export { createElement } from 'react';",
  ]);
} catch (e) {
  over('K0', false, 'src/components/LidePicker.tsx nejde sestavit (výběr lidí chybí)', String(e.message).split('\n').slice(0, 2).join(' | '));
}

/* Lidé jako na živé DB 17. 11. 2026 (spec §1): 14 lidí, 4 super admini, SimonD neaktivní. VeraP je v seznamu před VeraB. */
const LIDE = [
  { id: 1, display_name: 'Albert', role: 'super_admin', active: true, manager_id: null },
  { id: 2, display_name: 'Mikuláš', role: 'super_admin', active: true, manager_id: null },
  { id: 3, display_name: 'Kryštof', role: 'super_admin', active: true, manager_id: null },
  { id: 4, display_name: 'PavelB', role: 'super_admin', active: true, manager_id: null },
  { id: 10, display_name: 'Kuba', role: 'admin', active: true, manager_id: 1 },
  { id: 11, display_name: 'Adam T', role: 'admin', active: true, manager_id: 1 },
  { id: 20, display_name: 'Eda', role: 'admin', active: true, manager_id: 2 },
  { id: 21, display_name: 'Josef', role: 'admin', active: true, manager_id: 2 },
  { id: 22, display_name: 'Nela', role: 'admin', active: true, manager_id: 2 },
  { id: 23, display_name: 'Martina', role: 'admin', active: true, manager_id: 2 },
  { id: 30, display_name: 'Matej', role: 'admin', active: true, manager_id: 3 },
  { id: 41, display_name: 'VeraP', role: 'admin', active: true, manager_id: 4 },
  { id: 40, display_name: 'VeraB', role: 'admin', active: true, manager_id: 4 },
  { id: 42, display_name: 'SimonD', role: 'admin', active: false, manager_id: 4 },
];
const JA = 1;

/* ---------------- L) logika výběru (src/lide.ts) ---------------- */
await blok('L', async () => {
  if (!L) return;
  const R = (v, aktivni) => L.rozbalVyber(v, LIDE, JA, aktivni);
  over('L1', stejne(R(L.VYBER_JA), [1]) && R(L.VYBER_VSICHNI) === null,
    'Já = jen já, Všichni = null (všichni, i neaktivní, bez filtru lidí)', `${JSON.stringify(R(L.VYBER_JA))} ${JSON.stringify(R(L.VYBER_VSICHNI))}`);
  over('L2', stejne(R({ druh: 'tym', tymId: 1, ids: [] }), [1, 10, 11]) && stejne(R({ druh: 'tym', tymId: 2, ids: [] }), [2, 20, 21, 22, 23]),
    'Můj tým = já a všichni s mým manager_id; Tým Mikuláš = Mikuláš a jeho lidé (super admin volá taky)',
    `${JSON.stringify(R({ druh: 'tym', tymId: 1, ids: [] }))} ${JSON.stringify(R({ druh: 'tym', tymId: 2, ids: [] }))}`);
  const pavel = { druh: 'tym', tymId: 4, ids: [] };
  over('L3', stejne(R(pavel), [4, 40, 41, 42]) && stejne(R(pavel, true), [4, 40, 41]) && stejne(R({ ...pavel, jenAktivni: true }), [4, 40, 41]),
    '„jen aktivní“ vyřadí neaktivní (SimonD) z týmu; hodnota z výběru (jenAktivni) platí i bez parametru', `${JSON.stringify(R(pavel))} ${JSON.stringify(R(pavel, true))}`);
  const vsichniAktivni = R({ ...L.VYBER_VSICHNI, jenAktivni: true });
  over('L4', Array.isArray(vsichniAktivni) && vsichniAktivni.length === 13 && !vsichniAktivni.includes(42) && stejne(vsichniAktivni, serazene(vsichniAktivni)),
    'Všichni s „jen aktivní“ = id všech aktivních vzestupně (neaktivní jen s vypnutým „jen aktivní“)', JSON.stringify(vsichniAktivni));
  over('L5', stejne(R({ druh: 'vybrani', ids: [41, 40, 41, null] }), [40, 41]), 'vybraní lidé bez duplicit a null, vzestupně (jako lide v kontraktu)');
  const T = (v) => L.shrnutiVyberu(v, LIDE, JA);
  const texty = [T(L.VYBER_VSICHNI), T({ druh: 'tym', tymId: 1, ids: [] }), T({ druh: 'vybrani', ids: [41, 40] }), T(L.VYBER_JA),
    T({ druh: 'vybrani', ids: [10, 11, 20, 21, 30] })];
  over('L6', stejne(texty, ['Všichni (14)', 'Můj tým (3)', 'VeraP + VeraB', 'Já', '5 lidí']) && T({ druh: 'vybrani', ids: [40, 41] }) === 'VeraB + VeraP',
    'text tlačítka: „Všichni (14)“, „Můj tým (3)“, „VeraP + VeraB“ (pořadí zaškrtnutí), „Já“, „5 lidí“ (spec §7.3)', texty.join(' | '));
  const dalsi = [T({ druh: 'tym', tymId: 2, ids: [] }), T({ druh: 'vybrani', ids: [10, 11, 20] }), T({ druh: 'vybrani', ids: [20] }),
    T({ ...L.VYBER_VSICHNI, jenAktivni: true }), T({ druh: 'vybrani', ids: [], bezVolajiciho: true }), T({ druh: 'tym', tymId: 4, ids: [], jenAktivni: true })];
  over('L7', stejne(dalsi, ['Tým Mikuláš (5)', '3 lidé', 'Eda', 'Všichni aktivní (13)', 'Bez volajícího', 'Tým PavelB (3)']),
    'text: cizí tým s počtem, 3 lidé, jeden člověk jménem, Všichni aktivní, Bez volajícího, tým bez neaktivních', dalsi.join(' | '));
  // poznání předvolby z zaškrtnutých lidí (Všichni ze zaškrtnutí nikdy: „Všichni“ je bez filtru lidí, zaškrtnutí ne)
  const Z = (ids, aktivni = false) => L.vyberZIds(ids, LIDE, JA, aktivni);
  const z1 = Z([1]);
  const z2 = Z([11, 1, 10]);
  const z3 = Z([2, 20, 21, 22, 23]);
  const z4 = Z(LIDE.map((c) => c.id));
  const z5 = Z([4, 40, 41], true);
  const z6 = Z([20]);
  over('L8', z1.druh === 'ja' && z2.druh === 'tym' && z2.tymId === 1 && z3.druh === 'tym' && z3.tymId === 2 && z4.druh === 'vybrani' && z4.ids.length === 14
    && z5.druh === 'tym' && z5.tymId === 4 && z5.jenAktivni === true && z6.druh === 'vybrani' && stejne(z6.ids, [20]),
    'zaškrtnutí: jen já = Já, celý tým = ten tým (i s „jen aktivní“), všichni zaškrtnutí zůstanou vybraní lidé, jeden člověk jménem',
    JSON.stringify([z1, z2, z3, z4.druh, z5, z6]));
  // co jde serveru (kontrakt §6: p_user_ids jen když výběr není „jen já“ ani „všichni“)
  const D = (v) => L.lideDotaz(v, LIDE, JA);
  const dotazy = [D(L.VYBER_JA), D(L.VYBER_VSICHNI), D({ ...L.VYBER_VSICHNI, jenAktivni: true }).druh, D({ druh: 'tym', tymId: 1, ids: [] }),
    D({ druh: 'vybrani', ids: [1] }), D({ druh: 'vybrani', ids: [41] }), D({ druh: 'vybrani', ids: [], bezVolajiciho: true })];
  over('L9', stejne(dotazy, [{ druh: 'ja' }, { druh: 'vsichni' }, 'lide', { druh: 'lide', ids: [1, 10, 11] }, { druh: 'ja' }, { druh: 'lide', ids: [41] }, { druh: 'bez' }]),
    'dotaz: Já a jen já = dnešní volání, Všichni = bez filtru, tým a vybraní = p_user_ids, Bez volajícího zvlášť', JSON.stringify(dotazy));
  // skupiny v panelu: můj tým napřed, další týmy podle jména vedoucího, lidé bez super admina na konci
  const sk = L.skupinyLidi([...LIDE, { id: 50, display_name: 'Nováček', role: 'admin', active: true, manager_id: null }], JA);
  const popis = sk.map((s) => `${s.nazev}:${s.clenove.map((c) => c.id).join(',')}`);
  over('L10', stejne(popis, ['Můj tým:1,11,10', 'Tým Kryštof:3,30', 'Tým Mikuláš:2,20,21,23,22', 'Tým PavelB:4,42,40,41', 'Bez týmu:50']),
    'skupiny: Můj tým (vedoucí napřed, pak podle jména), další týmy podle jména vedoucího, Bez týmu nakonec', popis.join(' | '));
  over('L11', L.hledaniSedi(LIDE[1], 'mikulas') && L.hledaniSedi(LIDE[11], 'ver') && !L.hledaniSedi(LIDE[0], 'ver') && L.hledaniSedi(LIDE[0], ''),
    'hledání člověka bez ohledu na diakritiku a velikost písmen');
  over('L12', L.stejnyVyber(L.VYBER_JA, { druh: 'ja', ids: [] }) && !L.stejnyVyber(L.VYBER_JA, L.VYBER_VSICHNI)
    && L.stejnyVyber({ druh: 'vybrani', ids: [2, 1] }, { druh: 'vybrani', ids: [1, 2] }) && !L.stejnyVyber(L.VYBER_VSICHNI, { ...L.VYBER_VSICHNI, jenAktivni: true }),
    'stejný výběr: pořadí id nerozhoduje, „jen aktivní“ u Všech ano');
  // server bez migrace 074: jeden člověk = dnešní volání jednoho člověka, víc lidí = hláška
  const BEZ = API?.BEZ_074_LIDE ?? 'chybí BEZ_074_LIDE';
  const zaznam = [];
  const jeden = await L.sLidmi({ druh: 'lide', ids: [41] }, async () => { zaznam.push('nove'); throw new Error(BEZ); }, async (id) => { zaznam.push(`jeden:${id}`); return 'ok'; });
  let viceChyba = '';
  try {
    await L.sLidmi({ druh: 'lide', ids: [40, 41] }, async () => { throw new Error(BEZ); }, async () => 'nemá');
  } catch (e) {
    viceChyba = e.message;
  }
  let jinaChyba = '';
  try {
    await L.sLidmi({ druh: 'lide', ids: [41] }, async () => { throw new Error('Server neodpovídá.'); }, async () => 'nemá');
  } catch (e) {
    jinaChyba = e.message;
  }
  const ja = await L.sLidmi({ druh: 'ja' }, async () => 'dnes', async () => 'nemá');
  over('L13', jeden === 'ok' && stejne(zaznam, ['nove', 'jeden:41']) && viceChyba === BEZ && jinaChyba === 'Server neodpovídá.' && ja === 'dnes'
    && /074/.test(BEZ) && /server ještě neumí/.test(BEZ),
    'server bez 074: jeden člověk znovu dnešním voláním, víc lidí hláška „chybí migrace 074“, jiná chyba projde, Já bez pokusu o 074',
    JSON.stringify({ jeden, zaznam, viceChyba, jinaChyba, ja, BEZ }));
});

/* ---------------- M) DEMO mock jako kontrakt §6 a §5.5 ---------------- */
await blok('M', async () => {
  if (!API?.mockApi) return;
  const api = API.mockApi;
  const petra = (await api.login('petra', 'volam')).token; // Volající pod Albertem (id 2)
  const albert = (await api.login('admin', 'admin')).token; // super admin a majitel (id 1)
  const mikulas = (await api.login('mikulas', 'mikulas')).token; // super admin (id 4)
  const VETY = {
    listKontakty: 'Podle volajícího můžete filtrovat jen sebe.',
    myKontakty: 'Klienty jiného člověka vidí jen jeho super admin.',
    listOznacene: 'Označené klienty jiného člověka vidí jen jeho super admin.',
    zavolatSeznam: 'Kalendář jiného člověka vidí jen super admin.',
    listThreads: 'Zprávy jiného člověka vidí jen jeho super admin.',
  };
  const VOLANI = {
    listKontakty: (t, ids, navic = {}) => api.listKontakty(t, { limit: 500, ...navic, user_ids: ids }),
    myKontakty: (t, ids, uid = null) => api.myKontakty(t, 2000, 0, uid, null, { user_ids: ids }),
    listOznacene: (t, ids, navic = {}) => api.listOznacene(t, { ...navic, user_ids: ids }),
    zavolatSeznam: (t, ids, uid = null, vsichni = false) => api.zavolatSeznam(t, uid, vsichni, false, ids),
    listThreads: (t, ids, uid = null) => api.listThreads(t, null, null, uid, ids),
  };
  for (const [fn, veta] of Object.entries(VETY)) {
    await chyba(`M1 ${fn}`, () => VOLANI[fn](petra, [3]), veta, `${fn}: Volající s id kolegy odmítnut dnešní větou serveru pro cizího člověka`);
    await chyba(`M1b ${fn}`, () => VOLANI[fn](petra, [2, 9999]), veta, `${fn}: Volající se svým a neexistujícím id odmítnut stejnou větou (nepozná, kdo existuje)`);
  }
  // Volající se svým id = jako dnes jeho vlastní
  const mojeK = await VOLANI.listKontakty(petra, [2]);
  const dnesK = await api.listKontakty(petra, { limit: 500, caller: 'Petra' });
  const mojeM = await VOLANI.myKontakty(petra, [2]);
  const dnesM = await api.myKontakty(petra, 2000, 0, null, null, null);
  over('M2', stejne(mojeK.rows.map((r) => r.id), dnesK.rows.map((r) => r.id)) && mojeK.total === null && stejne(mojeM.rows.map((r) => r.id), dnesM.rows.map((r) => r.id)),
    'Volající se svým id: stejné řádky jako dnešní filtr sebe (Kontakty bez celkového počtu, Moji klienti jeho klienti)');
  // sjednocení za každého vybraného (super admin), bez duplicit, total = sjednocení
  const idsK = async (navic) => (await api.listKontakty(albert, { limit: 500, ...navic })).rows.map((r) => r.id);
  const uK = await VOLANI.listKontakty(albert, [2, 3]);
  const ocekK = serazene([...(await idsK({ caller: 'Petra' })), ...(await idsK({ caller: 'Honza' }))]);
  over('M3a', stejne(serazene(uK.rows.map((r) => r.id)), ocekK) && uK.total === ocekK.length && uK.rows.length === new Set(uK.rows.map((r) => r.id)).size && ocekK.length > 2,
    'list_kontakty: řádky = sjednocení dnešního p_caller za každého (Petra, Honza), total = sjednocení', `${uK.total} / ${ocekK.length}`);
  const uM = await VOLANI.myKontakty(albert, [2, 3]);
  const ocekM = serazene([...(await api.myKontakty(albert, 2000, 0, 2)).rows.map((r) => r.id), ...(await api.myKontakty(albert, 2000, 0, 3)).rows.map((r) => r.id)]);
  over('M3b', stejne(serazene(uM.rows.map((r) => r.id)), ocekM) && uM.total === ocekM.length && uM.rows.length === uM.total,
    'my_kontakty: klienti kohokoli z vybraných, každý jednou, total = sjednocení', `${uM.total} / ${ocekM.length}`);
  const uO = await VOLANI.listOznacene(albert, [2, 3]);
  const ocekO = serazene([...(await api.listOznacene(albert, { user_id: 2 })).map((r) => r.id), ...(await api.listOznacene(albert, { user_id: 3 })).map((r) => r.id)]);
  over('M3c', stejne(serazene(uO.map((r) => r.id)), ocekO) && uO.length === new Set(uO.map((r) => r.id)).size && ocekO.length > 1,
    'list_oznacene: označení a příznaky kohokoli z vybraných, každý kontakt jednou', `${uO.length} / ${ocekO.length}`);
  const uZ = await VOLANI.zavolatSeznam(albert, [2, 3]);
  const ocekZ = serazene([...(await api.zavolatSeznam(albert, 2)).polozky.map((z) => z.id), ...(await api.zavolatSeznam(albert, 3)).polozky.map((z) => z.id)]);
  over('M3d', stejne(serazene(uZ.polozky.map((z) => z.id)), ocekZ) && ocekZ.length >= 3, 'zavolat_seznam: naplánované hovory kohokoli z vybraných', `${uZ.polozky.length} / ${ocekZ.length}`);
  const uT = await VOLANI.listThreads(albert, [2, 3]);
  const ocekT = serazene([...(await api.listThreads(albert, null, null, 2)).map((t) => t.id), ...(await api.listThreads(albert, null, null, 3)).map((t) => t.id)]);
  over('M3e', stejne(serazene(uT.map((t) => t.id)), ocekT) && ocekT.length >= 1, 'list_threads: vlákna kohokoli z vybraných', `${uT.length} / ${ocekT.length}`);
  // výběr zadaný dvakrát
  const DVAKRAT = 'Filtr lidí je zadaný dvakrát (jeden člověk i výběr lidí); pošlete jen jeden z nich.';
  await chyba('M4a', () => VOLANI.listKontakty(albert, [3], { caller: 'Petra' }), DVAKRAT, 'list_kontakty: p_caller i p_user_ids odmítnuto');
  await chyba('M4b', () => VOLANI.myKontakty(albert, [3], 2), DVAKRAT, 'my_kontakty: p_user_id i p_user_ids odmítnuto');
  await chyba('M4c', () => VOLANI.listOznacene(albert, [3], { user_id: 2 }), DVAKRAT, 'list_oznacene: p_user_id i p_user_ids odmítnuto');
  await chyba('M4d', () => VOLANI.listOznacene(albert, [3], { bez_volajiciho: true }), 'Vyberte buď volajícího, nebo „bez volajícího“, ne obojí.',
    'list_oznacene: bez volajícího i výběr lidí dnešní větou');
  await chyba('M4e', () => VOLANI.zavolatSeznam(albert, [3], 2), DVAKRAT, 'zavolat_seznam: p_user_id i p_user_ids odmítnuto');
  await chyba('M4f', () => VOLANI.zavolatSeznam(albert, [3], null, true), DVAKRAT, 'zavolat_seznam: p_vsichni i p_user_ids odmítnuto');
  await chyba('M4g', () => VOLANI.listThreads(albert, [3], 2), DVAKRAT, 'list_threads: p_user_id i p_user_ids odmítnuto');
  // neznámé id super admina nic nenajde, [] = jako dnes, null a duplicity pryč
  const nic = await VOLANI.listKontakty(albert, [9999]);
  const prazdne = await VOLANI.listKontakty(albert, []);
  const bez = await api.listKontakty(albert, { limit: 500 });
  const dup = await VOLANI.listKontakty(albert, [2, 2, null]);
  const jen2 = await VOLANI.listKontakty(albert, [2]);
  const nicM = await VOLANI.myKontakty(albert, [9999]);
  const nicZ = await VOLANI.zavolatSeznam(albert, [9999]);
  over('M5', nic.total === 0 && nic.rows.length === 0 && prazdne.total === bez.total && stejne(dup.rows.map((r) => r.id), jen2.rows.map((r) => r.id))
    && nicM.total === 0 && nicZ.polozky.length === 0,
    'neznámé id nic nenajde (prázdný výsledek, ne „bez filtru“), [] = jako dnes, null a duplicity se zahodí',
    JSON.stringify({ nic: nic.total, prazdne: prazdne.total, bez: bez.total, nicM: nicM.total }));
  // prehled_lide (§5.5): jen super admin, řádky vybraných lidí a součet
  if (typeof api.prehledLide !== 'function') {
    over('M6', false, 'mock nemá prehledLide (kombinované statistiky víc lidí)');
    return;
  }
  await chyba('M6', () => api.prehledLide(petra, { lide: [2] }), 'Přehled vidí jen super admin.', 'prehled_lide Volajícímu odmítnut (i s jeho id)');
  await chyba('M6b', () => api.prehledLide(albert, { lide: [2, 9999] }), 'Neplatný filtr: lide', 'neexistující id v lide = Neplatný filtr: lide');
  await chyba('M6c', () => api.prehledLide(albert, { lidi: [2] }), 'Neplatný filtr: lidi', 'neznámý klíč filtru = Neplatný filtr: <klíč>');
  await chyba('M6d', () => api.prehledLide(albert, { od: '2026-11-10', do: '2026-11-01' }), 'Neplatný filtr: do', 'do před od = Neplatný filtr: do');
  const DNES = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const od = (() => { const [y, m, d] = DNES.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d - 60)).toISOString().slice(0, 10); })();
  const o = await api.prehledLide(mikulas, { od, do: DNES, lide: [3, 2, 2] });
  const KLICE = ['hovory', 'unikatni_klienti', 'dovolano', 'mira_dovolani', 'zajem', 'odmitnuto', 'nerelevantni', 'preplanovano', 'konverze', 'navrhy',
    'pocet_prodeju', 'hodnota_prodeju', 'provize_narok', 'provize_vyplaceno', 'provize_zbyva', 'odpracovane_hodiny', 'vysledku_za_hodinu',
    'planovane_hodiny', 'plneni_planu', 'sla_prvni_kontakt_median', 'sla_prvni_kontakt_p90', 'naplanovane_hotove', 'naplanovane_po_terminu'];
  const KLICE_METRIKY = ['klic', 'verze', 'nazev', 'hodnota', 'castky', 'citatel', 'jmenovatel', 'n', 'pokryti', 'kvalita', 'duvod', 'zaklad', 'proklik'];
  const radky = o?.data?.radky ?? [];
  const tvar = [...radky, o?.data?.soucet].every((r) => r && stejne(Object.keys(r.metriky).sort(), [...KLICE].sort())
    && KLICE.every((k) => stejne(Object.keys(r.metriky[k]).sort(), [...KLICE_METRIKY].sort())));
  over('M7', o?.api_verze === '1' && o?.meta?.casove_pasmo === 'Europe/Prague' && stejne(o?.meta?.filtr?.lide, [2, 3]) && o?.meta?.filtr?.vyber === null
    && stejne(radky.map((r) => [r.druh, r.user_id]), [['osoba', 2], ['osoba', 3]]) && o?.data?.soucet?.druh === 'soucet' && o?.data?.soucet?.display_name === 'Celkem' && tvar,
    'obálka a tvar: normalizovaný filtr (lide vzestupně bez duplicit), řádek za každého vybraného, součet „Celkem“, 23 metrik po 13 klíčích',
    JSON.stringify({ filtr: o?.meta?.filtr, radky: radky.map((r) => [r.druh, r.user_id]) }));
  const st = globalThis.__volackaDemoTest.stav();
  const denP = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  const hovoryZ = (uid) => st.callLog.filter((l) => l.user_id === uid && denP(l.created_at) >= od && denP(l.created_at) <= DNES);
  const m = (r, k) => r?.metriky?.[k]?.hodnota;
  const s = o?.data?.soucet;
  const zajem = hovoryZ(2).concat(hovoryZ(3)).filter((l) => l.outcome === 'zajem').length;
  const odm = hovoryZ(2).concat(hovoryZ(3)).filter((l) => l.outcome === 'odmitnuto').length;
  over('M8', m(radky[0], 'hovory') === hovoryZ(2).length && m(radky[1], 'hovory') === hovoryZ(3).length && m(s, 'hovory') === hovoryZ(2).length + hovoryZ(3).length
    && m(s, 'zajem') === zajem && s?.metriky?.konverze?.citatel === zajem && s?.metriky?.konverze?.jmenovatel === zajem + odm
    && (zajem + odm === 0 ? m(s, 'konverze') === null : Math.abs(m(s, 'konverze') - zajem / (zajem + odm)) < 1e-6),
    'čísla: hovory za člověka z call_log v období (dny v Praze), součet = součet řádků, konverze = zájem ÷ (zájem + odmítnuto) ze součtů',
    JSON.stringify({ r: radky.map((r) => m(r, 'hovory')), s: m(s, 'hovory'), zajem, odm, konverze: s?.metriky?.konverze }));
  const money = s?.metriky?.hodnota_prodeju;
  over('M9', money?.hodnota === null && Array.isArray(money?.castky) && money.castky.length === 1 && money.castky[0].mena === 'CZK'
    && /^-?\d+\.\d{2}$/.test(money.castky[0].hodnota ?? '0.00') && s?.metriky?.hovory?.castky?.length === 0 && s?.metriky?.hovory?.citatel === null,
    'peníze: hodnota null, částky po měnách jako text na 2 místa (výchozí CZK); počty bez částek a bez čitatele', JSON.stringify(money));
  const vsichni = await api.prehledLide(albert, { od, do: DNES });
  const osoby = (vsichni?.data?.radky ?? []).filter((r) => r.druh === 'osoba').map((r) => r.user_id);
  over('M10', stejne(serazene(osoby), [1, 2, 3, 4, 5]) && vsichni?.meta?.filtr?.lide === null && stejne(vsichni?.data?.radky?.[0]?.metriky?.hovory?.proklik?.filtr?.vyber,
    { metrika: 'hovory', user_id: vsichni?.data?.radky?.[0]?.user_id }) && vsichni?.data?.soucet?.metriky?.hovory?.proklik?.filtr?.vyber?.user_id === undefined,
    'bez lide: řádek za každého uživatele; proklik řádku s user_id, součtu bez něj', JSON.stringify(osoby));
});

/* ---------------- S) co jde serveru (src/api/supabase.ts) ---------------- */
await blok('S', async () => {
  if (!API?.supabaseApi) return;
  const sb = API.supabaseApi;
  const posledni = () => odeslano[odeslano.length - 1];
  odpoved = { status: 200, telo: '{"rows":[],"total":0,"dalsi":false}' };
  await sb.listKontakty('t', { user_ids: [2, 3], limit: 50 });
  const k = posledni();
  await sb.listKontakty('t', { caller: 'Petra', limit: 50 });
  const kDnes = posledni();
  await sb.listKontakty('t', { user_ids: [], limit: 50 });
  const kPrazdne = posledni();
  over('S1', k.fn === 'list_kontakty' && stejne(k.body.p_user_ids, [2, 3]) && !('p_caller' in k.body) && kDnes.body.p_caller === 'Petra' && !('p_user_ids' in kDnes.body)
    && !('p_user_ids' in kPrazdne.body) && kPrazdne.body.p_caller === null,
    'list_kontakty: p_user_ids jen s výběrem a nikdy s p_caller; bez výběru volání jako dřív', JSON.stringify([k.body, kDnes.body.p_caller]));
  await sb.myKontakty('t', 2000, 0, null, null, { user_ids: [2, 3] });
  const m = posledni();
  over('S2', m.fn === 'my_kontakty' && stejne(m.body.p_user_ids, [2, 3]) && !('p_user_id' in m.body), 'my_kontakty: p_user_ids bez p_user_id', JSON.stringify(m.body));
  odpoved = { status: 200, telo: '[]' };
  await sb.listOznacene('t', { user_ids: [2, 3] });
  const o = posledni();
  odpoved = { status: 200, telo: '{"dnes":"2026-11-18","ted":"2026-11-18T10:00:00+00:00","polozky":[]}' };
  await sb.zavolatSeznam('t', null, false, true, [2, 3]);
  const z = posledni();
  await sb.zavolatSeznam('t', 2, false, false);
  const zDnes = posledni();
  odpoved = { status: 200, telo: '{"threads":[]}' };
  await sb.listThreads('t', 'open', null, null, [2, 3]);
  const t = posledni();
  over('S3', o.fn === 'list_oznacene' && stejne(o.body.p_user_ids, [2, 3]) && !('p_user_id' in o.body)
    && z.fn === 'zavolat_seznam' && stejne(z.body, { p_token: 't', p_jen_cekajici: true, p_user_ids: [2, 3] })
    && stejne(zDnes.body, { p_token: 't', p_user_id: 2, p_vsichni: false, p_jen_cekajici: false })
    && t.fn === 'list_threads' && stejne(t.body, { p_token: 't', p_status: 'open', p_scope: null, p_user_ids: [2, 3] }),
    'list_oznacene, zavolat_seznam a list_threads: p_user_ids bez p_user_id a p_vsichni; dnešní volání beze změny', JSON.stringify([o.body, z.body, t.body]));
  // server bez 074 (PGRST202) = hláška, server bez 073 u prehled_lide taky
  odpoved = { status: 404, telo: '{"code":"PGRST202","message":"Could not find the function"}' };
  const hlasky = [];
  for (const f of [() => sb.listKontakty('t', { user_ids: [2, 3] }), () => sb.myKontakty('t', 200, 0, null, null, { user_ids: [2, 3] }),
    () => sb.listOznacene('t', { user_ids: [2, 3] }), () => sb.zavolatSeznam('t', null, false, false, [2, 3]), () => sb.listThreads('t', null, null, null, [2, 3])]) {
    try {
      await f();
      hlasky.push('prošlo');
    } catch (e) {
      hlasky.push(e.message);
    }
  }
  over('S4', hlasky.length === 5 && hlasky.every((h) => h === API.BEZ_074_LIDE) && typeof API.BEZ_074_LIDE === 'string',
    'server bez migrace 074: všech pět seznamů s výběrem lidí řekne „chybí migrace 074“ (Označené ne hlášku 060)', hlasky.join(' | '));
  let bez073 = '';
  try {
    await sb.prehledLide('t', { lide: [2, 3] });
  } catch (e) {
    bez073 = e.message;
  }
  over('S5', bez073 === API.BEZ_073_LIDE && /073/.test(API.BEZ_073_LIDE ?? '') && posledni().fn === 'prehled_lide' && stejne(posledni().body, { p_token: 't', p_filtr: { lide: [2, 3] } }),
    'prehled_lide: {p_token, p_filtr}; server bez 073 = hláška „chybí migrace 073“', `${bez073} ${JSON.stringify(posledni())}`);
  odpoved = { status: 400, telo: '{"code":"P0001","message":"Podle volajícího můžete filtrovat jen sebe."}' };
  let projde = '';
  try {
    await sb.listKontakty('t', { user_ids: [3] });
  } catch (e) {
    projde = e.message;
  }
  over('S6', projde === 'Podle volajícího můžete filtrovat jen sebe.', 'odmítnutí serveru (P0001) projde beze změny', projde);
  odpoved = { status: 200, telo: '[]' };
});

/* ---------------- K) komponenta vykreslená na serveru ---------------- */
await blok('K', async () => {
  if (!K || typeof K.LidePicker !== 'function' || typeof K.LidePanel !== 'function') {
    if (K) over('K0b', false, 'LidePicker.tsx neexportuje LidePicker (default) a LidePanel');
    return;
  }
  const h = K.createElement;
  const nic = () => {};
  const tl = K.renderToStaticMarkup(h(K.LidePicker, { value: { druh: 'tym', tymId: 1, ids: [] }, onChange: nic, lide: LIDE, ja: JA, popisek: 'Čí klienty zobrazit' }));
  const tlText = /<button[^>]*lide-picker-btn[^>]*>([\s\S]*?)<\/button>/.exec(tl)?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
  over('K1', /Můj tým \(3\)/.test(tlText) && /aria-expanded="false"/.test(tl) && /aria-haspopup="dialog"/.test(tl) && !/lide-picker-panel/.test(tl)
    && /Čí klienty zobrazit/.test(tl) && /class="[^"]*lide-picker[^"]*"/.test(tl),
    'zavřený výběr: tlačítko s textem výběru, aria-expanded false, popisek, panel ještě není', tlText);
  over('K2', K.renderToStaticMarkup(h(K.LidePicker, { value: { druh: 'ja', ids: [] }, onChange: nic, lide: [], ja: JA })) === '',
    'bez seznamu lidí (Volající: allStats jen super admin) se výběr nevykreslí');
  const panel = (v, navic = {}) => K.renderToStaticMarkup(h(K.LidePanel, { value: v, onChange: nic, lide: LIDE, ja: JA, hledat: '', onHledat: nic, ...navic }));
  const p = panel({ druh: 'tym', tymId: 2, ids: [] });
  const predvolby = [...p.matchAll(/<button[^>]*class="[^"]*lide-predvolba[^"]*"[^>]*aria-pressed="(true|false)"[^>]*>([\s\S]*?)<\/button>/g)].map((x) => `${x[2].replace(/<[^>]+>/g, '').trim()}${x[1] === 'true' ? '*' : ''}`);
  over('K3', stejne(predvolby, ['Já', 'Můj tým (3)', 'Všichni (14)', 'Tým Kryštof (2)', 'Tým Mikuláš (5)*', 'Tým PavelB (4)']),
    'předvolby: Já, Můj tým, Všichni a tým každého dalšího super admina s počtem; zapnutá má aria-pressed', predvolby.join(' | '));
  const zaskrtnute = [...p.matchAll(/<input[^>]*type="checkbox"[^>]*value="(\d+)"[^>]*>/g)].filter((x) => /checked=""/.test(x[0])).map((x) => Number(x[1]));
  const vsechny = [...p.matchAll(/<input[^>]*type="checkbox"[^>]*value="(\d+)"[^>]*>/g)].map((x) => Number(x[1]));
  over('K4', stejne(serazene(zaskrtnute), [2, 20, 21, 22, 23]) && vsechny.length === 14 && /neaktivní/.test(p) && /jen aktivní/.test(p)
    && (p.match(/role="group"/g) ?? []).length >= 5 && /Hledat člověka/.test(p),
    'panel: 14 lidí po týmech (skupiny role group), zaškrtnutí podle výběru, neaktivní označený, „jen aktivní“, hledání', JSON.stringify({ zaskrtnute, n: vsechny.length }));
  const aktivni = panel({ druh: 'vsichni', ids: [], jenAktivni: true });
  const bezSimona = [...aktivni.matchAll(/<input[^>]*type="checkbox"[^>]*value="(\d+)"[^>]*>/g)].map((x) => Number(x[1]));
  over('K5', bezSimona.length === 13 && !bezSimona.includes(42) && /Všichni aktivní \(13\)|Všichni \(13\)/.test(aktivni),
    '„jen aktivní“: neaktivní v seznamu není a předvolba Všichni počítá jen aktivní', `${bezSimona.length}`);
  const ozn = panel({ druh: 'vybrani', ids: [], bezVolajiciho: true }, { allowBezVolajiciho: true });
  over('K6', /Bez volajícího/.test(ozn) && !/Bez volajícího/.test(p) && /aria-pressed="true"[^>]*>Bez volajícího/.test(ozn),
    '„Bez volajícího“ jen s allowBezVolajiciho (Označené), zapnuté má aria-pressed');
  const hledej = panel({ druh: 'ja', ids: [] }, { hledat: 'ver' });
  const nalezeni = [...hledej.matchAll(/<input[^>]*type="checkbox"[^>]*value="(\d+)"[^>]*>/g)].map((x) => Number(x[1]));
  over('K7', stejne(serazene(nalezeni), [40, 41]), 'hledání v panelu ukáže jen lidi, kterým sedí jméno (VeraP, VeraB)', JSON.stringify(nalezeni));
});

/* ---------------- W) zapojení stránek (zdrojový text) ---------------- */
await blok('W', async () => {
  const src = (p) => {
    try { return readFileSync(join(ROOT, p), 'utf8'); } catch { return ''; }
  };
  const STRANKY = ['AdminPage', 'MojiPage', 'OznacenePage', 'StatsPage', 'KalendarPage', 'ZpravyPage', 'RozvrhPage'];
  const vsechnySrc = [];
  const walk = (d) => {
    for (const x of readdirSync(join(ROOT, d), { withFileTypes: true })) {
      const p = join(d, x.name);
      if (x.isDirectory()) walk(p);
      else if (/\.(tsx?|css)$/.test(x.name)) vsechnySrc.push([p, src(p)]);
    }
  };
  walk('src');
  const spatne = [];
  for (const s of STRANKY) {
    const t = src(`src/pages/${s}.tsx`);
    if (!/import LidePicker[^\n]*from '\.\.\/components\/LidePicker'/.test(t)) spatne.push(`${s}: neimportuje LidePicker`);
    const vyskyty = [...t.matchAll(/<LidePicker\b/g)];
    if (vyskyty.length !== 1) spatne.push(`${s}: <LidePicker> ${vyskyty.length}× (čekáno jednou)`);
    // jen pro super admina: v okolí výskytu musí být podmínka isSuper / jaSuper
    for (const v of vyskyty) {
      if (!/(isSuper|jaSuper)\b[^\n]*(\?|&&)/.test(t.slice(Math.max(0, v.index - 700), v.index))) spatne.push(`${s}: <LidePicker> mimo podmínku super admina`);
    }
  }
  over('W1', spatne.length === 0, 'sedm stránek s jedním výběrem lidí, vždy jen pod podmínkou super admina', spatne.join(' | '));
  // kód bez komentářů (poznámky „NAHRAZUJE PersonPicker …“ zůstávají jako historie)
  const kod = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const stare = vsechnySrc.filter(([, t]) => /PersonPicker|id="user-select"|id="person-picker"|id="kalendar-kdo"|id="rozvrh-kdo"|htmlFor="(user-select|person-picker|kalendar-kdo|rozvrh-kdo)"/.test(kod(t))).map(([p]) => p);
  over('W2', stare.length === 0 && !existsSync(join(ROOT, 'src/components/PersonPicker.tsx')),
    'PersonPicker a staré výběry jednoho člověka (#user-select, #person-picker, #kalendar-kdo, #rozvrh-kdo) nikde', stare.join(', '));
  const admin = src('src/pages/AdminPage.tsx');
  over('W3', (admin.match(/aria-label="Filtr volajícího"/g) ?? []).length === 1 && /<option value=\{session\.display_name\}>Naposledy volal\/a já<\/option>/.test(admin)
    && /isSuper \? \(\s*<LidePicker/.test(admin),
    'Kontakty: super admin výběr lidí, Volající svůj výběr volajícího jako dřív („Naposledy volal/a já“)');
  const stats = src('src/pages/StatsPage.tsx');
  over('W4', /\.prehledLide\(/.test(stats) && /Porovnat v Přehledu/.test(stats) && /\/prehled\/lide/.test(stats) && /BEZ_073_LIDE|neumí/.test(src('src/api/supabase.ts')),
    'Statistiky: víc lidí = kombinované karty z prehled_lide a odkaz „Porovnat v Přehledu“');
  const pk = src('src/components/LidePicker.tsx');
  over('W5', /if \(!superAdmin\) \{\s*setPeople\(\[\]\);\s*return;/.test(pk) && /aria-expanded=/.test(pk) && /Escape/.test(pk) && /ArrowDown/.test(pk) && /ArrowUp/.test(pk),
    'LidePicker: seznam lidí (allStats) jen pro super admina, klávesnice (šipky, Escape), aria-expanded');
  const pkg = src('package.json');
  over('W6', /node tests\/lide\.test\.mjs/.test(pkg), 'npm test pouští tests/lide.test.mjs');
});

if (chyby === 0) {
  console.log(`ALL OK (${pocet} kontrol)`);
  process.exit(0);
}
console.log(`CHYB: ${chyby} z ${pocet}`);
process.exit(1);
