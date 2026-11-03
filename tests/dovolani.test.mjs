// Test chování API vrstvy migrace 062 (Albert 2. 11. 2026: „Zavolal/a jsem“ i bez označení, šestý výsledek „Chce web“,
// poznámky z detailu pro automatizaci, menu stavů; zadání SPEC-dovolani-vsude-2026-11-02.md, rozhodnutí D1 až D20).
// Měří DEMO mock (src/api/mock.ts), který musí zrcadlit server (db/migration_062_dovolani_vsude.sql, test
// db/tests/test_062_dovolani_vsude.sql), v tom, co bloky O9 v tests/filtry.test.mjs a Q, X v tests/volani.test.mjs
// nepokrývají: kandidáti označení z úspěšného dovolání (D6), nové řádky poznámky jako vzkaz „Poznámka (jméno): …“ (D15),
// zrušené naplánované hovory po odmítnutí a po změně stavu (D19, A3), vzkaz bez poznámky u odmítnutí klienta bez návrhu
// (D4), a co src/api/supabase.ts posílá serveru a jak hlásí server bez 062 (fetch je podstrčený, nic nejde po síti).
// Vlastní čerstvý mock (žádný jiný test před ním data nemění). Nikdy nesahá na živou DB. Spuštění:
//   node tests/dovolani.test.mjs            (kořen appky = složka nad tests/)
//   APP_ROOT=/cesta/ke/kopii node tests/dovolani.test.mjs   (mutace v kopii)
// Výsledek: řádek „ALL OK (N kontrol)“, jinak řádky „FAIL <id>: <česky> (…)“ a kód 1. Záporné případy ověřují TEXT hlášky.

import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
let odpoved = { status: 200, telo: '{"ok":true,"kontakt_id":7}' };
globalThis.fetch = async (url, init) => {
  odeslano.push({ url: String(url), body: JSON.parse(init?.body ?? '{}') });
  return new Response(odpoved.telo, { status: odpoved.status, headers: { 'Content-Type': 'application/json' } });
};
// háček DEMO mocku (src/api/mock.ts, sDemoTestem): musí být PŘED načtením balíčku
globalThis.__volackaDemoTest = {};

let bundle;
{
  const out = await build({
    stdin: {
      contents: [
        "export { mockApi } from './src/api/mock.ts';",
        "export { supabaseApi, BEZ_061_JINE, BEZ_062_CHCE_WEB } from './src/api/supabase.ts';",
        "export * as prahaModul from './src/praha.ts';",
      ].join('\n'),
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    define: { 'import.meta.env.BASE_URL': '"/"' },
  }).catch((e) => {
    console.log(`FAIL 0: appka nejde sestavit pro test (${String(e.message).split('\n').slice(0, 3).join(' | ')})`);
    process.exit(1);
  });
  const dir = mkdtempSync(join(tmpdir(), 'dovolani-test-'));
  const f = join(dir, 'b.cjs');
  writeFileSync(f, out.outputFiles[0].text);
  bundle = createRequire(import.meta.url)(f);
  rmSync(dir, { recursive: true, force: true });
}
const { mockApi: api, supabaseApi, BEZ_061_JINE, BEZ_062_CHCE_WEB, prahaModul: P } = bundle;

let pocet = 0;
let chyby = 0;
function over(id, podminka, text, detail = '') {
  pocet += 1;
  if (!podminka) {
    chyby += 1;
    console.log(`FAIL ${id}: ${text}${detail ? ` (${detail})` : ''}`);
  }
}
/** Čeká chybu s DŮVODEM (vzor), ne jen jakoukoli chybu. */
async function chyba(id, fn, vzor, text) {
  try {
    await fn();
    over(id, false, text, 'prošlo, mělo selhat');
  } catch (e) {
    over(id, vzor.test(e.message), text, `hláška: ${e.message}`);
  }
}
async function blok(id, fn) {
  try {
    await fn();
  } catch (e) {
    over(id, false, 'blok testu spadl na nečekané chybě', String(e && e.stack));
  }
}
const presne = (t) => new RegExp(`^${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
const stav = () => globalThis.__volackaDemoTest.stav();
const kontakt = (kid) => stav().kontakty.find((k) => k.id === kid);
const kandidat = (kid) => stav().kandidati.find((x) => x.kontakt_id === kid) ?? null;
const zpravy = (kid) => {
  const s = stav();
  const vl = new Set(s.vlakna.filter((v) => v.kontakt_id === kid).map((v) => v.id));
  return s.zpravy.filter((z) => vl.has(z.thread_id));
};
const zavolat = (kid) => stav().zavolat.filter((z) => z.kontakt_id === kid);
const dnes = P.prahaDen(new Date());
const zitra = new Date(Date.now() + 86400000).toISOString();

const petra = (await api.login('petra', 'volam')).token;   // Volající pod Albertem (id 2)
const honza = (await api.login('honza', 'volam')).token;   // Volající pod Mikulášem (id 3)
const albert = (await api.login('admin', 'admin')).token;  // majitel (id 1)

/* ---------------- D) kandidáti označení z úspěšného dovolání (D6) ---------------- */
// 95: Petřin klient, návrh před 2 dny, bez označení (ještě nemlčí 5 pracovních dní): kandidát navrh. Nedovolání na tom
// nic nezmění, úspěšný hovor bez označení ano (na serveru událost dovolani, oznaceni_kandidati od 062).
await blok('D', async () => {
  over('D0', kandidat(95)?.kategorie === 'navrh' && !stav().oznaceni.some((o) => o.kontakt_id === 95),
    'příprava: 95 je kandidát navrh bez označení', JSON.stringify(kandidat(95)));
  const n = await api.zapisHovor(petra, 95, 'nedovolano');
  over('D1', n.oznaceno === false && kandidat(95)?.kategorie === 'navrh' && !stav().dovolani.some((d) => d.kontakt_id === 95),
    'nedovolání bez označení není odpověď klienta: 95 zůstává kandidát navrh', JSON.stringify(n));
  const m = await api.zapisHovor(petra, 95, 'mluvili', 'podívá se na to o víkendu');
  over('D2', m.oznaceno === false && kandidat(95) === null && stav().dovolani.find((d) => d.kontakt_id === 95)?.casy.length === 1,
    'úspěšné dovolání bez označení je odpověď klienta: 95 už není kandidát (D6)', JSON.stringify(kandidat(95)));
  // dovolání v Označených se zapíše stejně (jediný záznam): 93 po „Chce web“ není kandidát
  const c = await api.zapisHovor(petra, 93, 'chce_web');
  over('D3', c.oznaceno === true && c.otevrene === false && kandidat(93) === null && stav().dovolani.some((d) => d.kontakt_id === 93),
    'Chce web v Označených: úspěšné dovolání, 93 není kandidát', JSON.stringify(c));
});

/* ---------------- N) nové řádky poznámky jdou automatizaci (D15) ---------------- */
await blok('N', async () => {
  // 93: Petra připíše vlastní řádek → jeden vzkaz „Poznámka (Petra): …“ jen s novým řádkem
  const pred = zpravy(93).length;
  const stara = kontakt(93).note;
  await api.updateKontakt(petra, 93, { note: `${stara}\nchce i rezervační formulář` });
  const po = zpravy(93);
  over('N1', po.length === pred + 1 && po.at(-1).body === 'Poznámka (Petra): chce i rezervační formulář' && po.at(-1).sender_type === 'admin',
    'nový řádek poznámky jde automatizaci jako vzkaz „Poznámka (Petra): …“', JSON.stringify(po.at(-1)));
  // samo smazání řádku ani změna stavu nic nepošlou
  await api.updateKontakt(petra, 93, { note: 'chce i rezervační formulář' });
  await api.updateKontakt(petra, 93, { status: 'ceka_na_klienta', status_duvod: 'čeká na fotky' });
  over('N2', zpravy(93).length === pred + 1, 'smazání řádku a změna stavu vzkaz „Poznámka“ nepošlou', JSON.stringify(zpravy(93).map((z) => z.body)));
  // 96: Petra dostane řádek Honzy maskovaný („jiný volající“); připíše vlastní řádek s hlavičkou → jen ten
  const r96 = (await api.myKontakty(petra, 500, 0)).rows.find((r) => r.id === 96);
  over('N3', r96 && r96.note.includes('jiný volající') && !r96.note.includes('Honza'), 'příprava: Petra vidí řádek kolegy maskovaný', r96 && r96.note);
  const p96 = zpravy(96).length;
  await api.updateKontakt(petra, 96, { note: `${r96.note}\n[${dnes} Petra] prý chce víc fotek` });
  const z96 = zpravy(96);
  over('N4', z96.length === p96 + 1 && z96.at(-1).body === `Poznámka (Petra): [${dnes} Petra] prý chce víc fotek`
    && kontakt(96).note.includes('[2026-10-11 Honza] Zájem B, poslat návrh.'),
    'Volající: vzkaz jen s vlastním novým řádkem, řádek kolegy zůstal a do vzkazu nejde', JSON.stringify(z96.at(-1)));
  // Albert: upravený řádek s cizí hlavičkou (Petry) nepošle nic, nový řádek bez hlavičky ano (víc řádků jedním vzkazem)
  const s93 = kontakt(93).note;
  await api.updateKontakt(albert, 5, { note: kontakt(5).note.replace('Chce vidět návrh.', 'Chce vidět návrh hned.') });
  over('N5', !zpravy(5).some((z) => z.body.startsWith('Poznámka (')), 'upravený řádek s cizí hlavičkou („[… Honza]“ u Alberta) se nepošle',
    JSON.stringify(zpravy(5).map((z) => z.body)));
  await api.updateKontakt(albert, 5, { note: kontakt(5).note.replace('Návrh odeslán mailem.', 'Návrh odeslán mailem znovu.') });
  over('N5b', zpravy(5).filter((z) => z.body.startsWith('Poznámka (')).map((z) => z.body).join() === 'Poznámka (Albert): [2026-08-12 Albert] Návrh odeslán mailem znovu.',
    'upravený vlastní řádek („[… Albert]“ u Alberta) se pošle jako nový', JSON.stringify(zpravy(5).map((z) => z.body)));
  await api.updateKontakt(albert, 93, { note: `${s93}\n\n  první  \ndruhý` });
  over('N6', zpravy(93).at(-1).body === 'Poznámka (Albert): první\ndruhý', 'víc nových řádků jeden vzkaz, prázdné řádky a mezery na krajích pryč', zpravy(93).at(-1).body);
});

/* ---------------- Z) naplánované hovory po odmítnutí a změně stavu (D19, A3) ---------------- */
await blok('Z', async () => {
  // 95: Petra má hovor na zítra; „Nechce web“ (vede ho ona) ho zruší, i když je až zítra
  await api.zavolatNaplanovat(petra, 95, zitra, 'zavolat zítra');
  const o = await api.zapisHovor(petra, 95, 'nechce');
  over('Z1', o.status === 'odmitnuto' && o.vlakno_id === null
    && zavolat(95).map((z) => `${z.stav}: ${z.vysledek}`).join() === 'zruseno: zrušeno: dovolání nechce',
    'odmítnutí zruší i pozdější naplánovaný hovor (klientovi, který web odmítl, se už nevolá)', JSON.stringify(zavolat(95)));
  await chyba('Z2', () => api.zavolatNaplanovat(petra, 95, zitra, null),
    presne('Klient web odmítl, hovor se mu neplánuje (Albert 2. 11. 2026). Když se ozval sám, že web chce, napište to agentovi ve vzkazu u klienta.'),
    'odmítnutému se hovor neplánuje');
  // 94: hovor na zítra, Petra změní stav na Nekontaktovat s důvodem → hovor zrušený s důvodem
  await api.zavolatNaplanovat(petra, 94, zitra, null);
  await api.updateKontakt(petra, 94, { status: 'nekontaktovat', status_duvod: 'nechce, abychom volali' });
  over('Z3', zavolat(94).at(-1)?.stav === 'zruseno' && zavolat(94).at(-1)?.vysledek === 'zrušeno změnou stavu ceka_na_klienta → nekontaktovat: nechce, abychom volali',
    'změna stavu na Nekontaktovat zruší čekající hovor s důvodem (D19)', JSON.stringify(zavolat(94)));
  await chyba('Z4', () => api.zavolatNaplanovat(albert, 94, zitra, null, 2),
    presne('Klient je ve stavu nekontaktovat: hovor se mu neplánuje. Když chce, abychom se mu zase ozývali, změňte stav v detailu klienta s důvodem.'),
    'Nekontaktovat: hovor se neplánuje ani super adminem');
  // cizí kontakt: Volající dostane napřed větu o cizím klientovi (o stavu se nic nedozví)
  await chyba('Z5', () => api.zavolatNaplanovat(petra, 3, zitra, null),
    presne('Naplánovat hovor můžete jen svému klientovi (kontaktu, kterému jste volal/a). Kontakt z fronty naplánujete při hovoru tlačítkem Přeplánovat.'),
    'cizí kontakt: věta o vlastním klientovi napřed');
});

/* ---------------- V) vzkaz bez poznámky u odmítnutí klienta bez návrhu (D4) ---------------- */
await blok('V', async () => {
  // 3: Honzův klient v zájmu bez návrhu; „Nechce web“ bez poznámky → stav Odmítnuto a vzkaz „Dovolání (Honza): Nechce web“
  over('V0', kontakt(3)?.status === 'zajem' && !kontakt(3)?.first_proposal_at, 'příprava: 3 je v zájmu bez návrhu', JSON.stringify(kontakt(3)));
  const v = await api.zapisHovor(honza, 3, 'nechce');
  over('V1', v.status === 'odmitnuto' && v.oznaceno === false && v.poznamka_predana === null && v.vlakno_id !== null
    && zpravy(3).at(-1)?.body === 'Dovolání (Honza): Nechce web' && kontakt(3).note.endsWith(`[${dnes} Honza] Dovolání: Nechce web`),
    'odmítnutí klienta bez návrhu jde automatizaci i bez poznámky (úklid bloků architekta, N bod 7)', JSON.stringify(v));
  await chyba('V2', () => api.zapisHovor(honza, 3, 'mluvili', 'rozmyslel si to'),
    presne('Klient web odmítl, znovu mu nevoláme (Albert 2. 11. 2026). Když se ozval sám, že web chce, napište to agentovi ve vzkazu u klienta.'),
    'po odmítnutí bez označení se tlačítkem znovu nevolá (Albert A3)');
});

/* ---------------- S) co appka posílá serveru a server bez 062 (supabase.ts) ---------------- */
await blok('S', async () => {
  odeslano.length = 0;
  odpoved = { status: 200, telo: '{"ok":true,"kontakt_id":7,"oznaceni_id":null,"oznaceno":false,"otevrene":null,"pokusy":null,"vysledek":"chce_web"}' };
  const r = await supabaseApi.zapisHovor('t', 7, 'chce_web', '   ');
  await supabaseApi.zapisHovor('t', 7, 'chce_web', 'hosting na rok');
  over('S1', odeslano[0].body.p_vysledek === 'chce_web' && odeslano[0].body.p_poznamka === null && !('p_hvezda' in odeslano[0].body)
    && odeslano[1].body.p_poznamka === 'hosting na rok' && r.oznaceno === false && r.oznaceni_id === null,
    'zapis_hovor pošle chce_web, prázdná poznámka jako null; odpověď bez označení projde beze změny', JSON.stringify(odeslano.map((o) => o.body)));
  odpoved = { status: 400, telo: '{"code":"P0001","message":"Neplatný výsledek dovolání: chce_web. Povolené: nedovolano, nechce, nekontaktovat, mluvili, jine."}' };
  await chyba('S2', () => supabaseApi.zapisHovor('t', 7, 'chce_web'), presne(BEZ_062_CHCE_WEB), 'server bez 062: Chce web srozumitelně');
  odpoved = { status: 400, telo: '{"code":"P0001","message":"Neplatný výsledek dovolání: chce_web. Povolené: nedovolano, nechce, nekontaktovat, mluvili."}' };
  await chyba('S2', () => supabaseApi.zapisHovor('t', 7, 'chce_web'), presne(BEZ_062_CHCE_WEB), 'server s 060 bez 061: Chce web srozumitelně');
  odpoved = { status: 400, telo: '{"code":"P0001","message":"Klient web odmítl, znovu mu nevoláme (Albert 2. 11. 2026). Když se ozval sám, že web chce, napište to agentovi ve vzkazu u klienta."}' };
  await chyba('S3', () => supabaseApi.zapisHovor('t', 7, 'chce_web'), /^Klient web odmítl, znovu mu nevoláme/, 'jiná chyba serveru u chce_web zůstane, jak přišla');
  odpoved = { status: 400, telo: '{"code":"P0001","message":"Neplatný výsledek dovolání: jine. Povolené: nedovolano, nechce, nekontaktovat, mluvili."}' };
  await chyba('S4', () => supabaseApi.zapisHovor('t', 7, 'jine', 'x'), presne(BEZ_061_JINE), 'server bez 061: Nic z toho výše dál jako dřív');
  over('S5', /migrace 062/.test(BEZ_062_CHCE_WEB) && /Mluvili jsme/.test(BEZ_062_CHCE_WEB), 'hláška bez 062 říká, co chybí a co zvolit místo toho', BEZ_062_CHCE_WEB);
});

if (chyby === 0) {
  console.log(`ALL OK (${pocet} kontrol)`);
  process.exit(0);
}
console.log(`CHYB: ${chyby} z ${pocet}`);
process.exit(1);
