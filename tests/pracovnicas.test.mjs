// Test neviditelného časovače práce a výběru důvodu odmítnutí (Přehled vedení úkol 12, Albert 17. 11. 2026, rozhodnutí D5
// a D8; kontrakt docs/superpowers/specs/2026-11-17-prehled-kontrakt.md §4.1 prace_tep a §4.2 odmitnuti_duvod_zapis).
//
// Měří:
//  C) časovač (src/pracovniCas.ts) s falešnými hodinami a falešným API: jedna karta za každou kartu na obrazovce, tep každých
//     60 s jen s viditelnou stránkou, nic po odhlášení, konec při pagehide i při schování stránky (jednou), chyby polyká,
//     po PGRST202 (server bez migrace 072) se sám zastaví,
//  S) co src/api/supabase.ts posílá serveru (konec s keepalive a se stejnými hlavičkami jako ostatní RPC), server bez 072,
//  M) DEMO mock (src/api/mock.ts) jako kontrakt: signály jen za sebe, karta jen u kontaktu, který smí dělat (cizí a neexistující
//     stejnou odpovědí bez zápisu), tep nejvýš jednou za 20 s; důvod jen u vlastního klienta s návrhem (cizí, neexistující
//     a bez návrhu jednou větou), jine s textem, maska jmen kolegů, super admin u každého klienta s návrhem,
//  D) výběr důvodu (src/components/DuvodOdmitnuti.tsx): registr DUVODY v pořadí a se štítky spec §3.7, fáze sleva u Nabídnuté
//     slevy jinak nahled, ptát se jen u klienta s návrhem (first_proposal_at), jine chce text, uložení po výsledku nikdy
//     nehodí chybu (výsledek hovoru zůstává uložený),
//  W) zapojení (zdrojový text): App.tsx časovač spustí jednou a zastaví, CallPage hlásí kartu, okno Zavolal/a jsem, detail
//     a volání se ptají jen u odmítnutí klienta s návrhem a důvod ukládají až po výsledku.
// Klikání (Volající ve volání pošle kartu a tep, „Nechce web“ po návrhu chce důvod, před návrhem ne) měří tests/demo-e2e.mjs
// blok T12. Nikdy nesahá na síť ani živou DB (fetch je podstrčený).
// Spuštění: node tests/pracovnicas.test.mjs (APP_ROOT=/cesta/ke/kopii pro mutace). Výsledek „ALL OK (N kontrol)“ nebo řádky
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
// mock čeká 60 až 180 ms na každé volání; test to zkrátí na nulu (časovač měří vlastní falešné hodiny, ne setTimeout)
const puvodniTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, _ms, ...a) => puvodniTimeout(fn, 0, ...a);
// supabase.ts: žádný požadavek po síti, jen záznam, co by appka poslala; odpověď nastaví test
const odeslano = [];
let odpoved = { status: 200, telo: '{"ok":true}' };
globalThis.fetch = async (url, init) => {
  odeslano.push({ url: String(url), init: init ?? {}, body: JSON.parse(init?.body ?? '{}') });
  return new Response(odpoved.telo, { status: odpoved.status, headers: { 'Content-Type': 'application/json' } });
};
// háček DEMO mocku (src/api/mock.ts, sDemoTestem): musí být PŘED načtením balíčku s mockem
globalThis.__volackaDemoTest = {};
// časovač nesmí nechat neošetřenou chybu (v prohlížeči by to byla chyba stránky)
const neosetrene = [];
process.on('unhandledRejection', (e) => neosetrene.push(String(e && e.message ? e.message : e)));

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
    over(id, false, 'blok testu spadl na nečekané chybě', String(e && e.stack).split('\n').slice(0, 4).join(' | '));
  }
}
const presne = (t) => new RegExp(`^${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
const flush = () => new Promise((r) => setImmediate(r));

/** Balíček jednoho kusu appky (každý kus zvlášť: RED ukáže, co přesně chybí; mock je jen v jednom, jinak by háček přepsal). */
async function balicek(radky, loader = 'ts') {
  const out = await build({
    stdin: { contents: radky.join('\n'), resolveDir: ROOT, loader },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    define: { 'import.meta.env.BASE_URL': '"/"', 'process.env.NODE_ENV': '"production"' },
  });
  const dir = mkdtempSync(join(tmpdir(), 'pracovnicas-test-'));
  const f = join(dir, 'b.cjs');
  writeFileSync(f, out.outputFiles[0].text);
  try {
    return createRequire(import.meta.url)(f);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const sestav = async (id, radky, co, loader) => {
  try {
    return await balicek(radky, loader);
  } catch (e) {
    over(id, false, `${co} nejde sestavit`, String(e.message).split('\n').slice(0, 2).join(' | '));
    return null;
  }
};

const C = await sestav('C0', ["export * from './src/pracovniCas.ts';"], 'src/pracovniCas.ts (časovač chybí)');
const D = await sestav('D0', [
  "export * from './src/components/DuvodOdmitnuti.tsx';",
  "export { default as DuvodOdmitnuti } from './src/components/DuvodOdmitnuti.tsx';",
  "export { renderToStaticMarkup } from 'react-dom/server';",
  "export { createElement } from 'react';",
], 'src/components/DuvodOdmitnuti.tsx (výběr důvodu chybí)', 'tsx');
// mock a supabase.ts naposled a jen jednou (háček __volackaDemoTest drží stav tohohle mocku)
const A = await sestav('A0', [
  "export * from './src/api/mock.ts';",
  "export * from './src/api/supabase.ts';",
], 'src/api/mock.ts a src/api/supabase.ts');

/* ---------------- C) časovač s falešnými hodinami ---------------- */
await blok('C', async () => {
  if (!C) return;
  over('C0a', typeof C.spustCasovac === 'function' && C.TEP_MS === 60000 && typeof C.KARTA_MS === 'number' && C.KARTA_MS > 0 && C.KARTA_MS <= 1000,
    'pracovniCas.ts: spustCasovac, TEP_MS = 60 s a kontrola karty nejvýš po 1 s', JSON.stringify({ TEP_MS: C.TEP_MS, KARTA_MS: C.KARTA_MS }));
  over('C0b', typeof C.nastavKartu === 'function' && typeof C.aktualniKarta === 'function',
    'pracovniCas.ts: nastavKartu a aktualniKarta (karta na obrazovce volání)');
  if (typeof C.nastavKartu === 'function' && typeof C.aktualniKarta === 'function') {
    C.nastavKartu(93);
    const a = C.aktualniKarta();
    C.nastavKartu(null);
    over('C0c', a === 93 && C.aktualniKarta() === null, 'nastavKartu / aktualniKarta drží kartu na obrazovce');
  }
  if (typeof C.spustCasovac !== 'function') return;

  // falešné hodiny jen pro setInterval (časovač jiné nepoužívá)
  let ted = 0;
  let dalsiId = 1;
  const hodiny = new Map();
  const puvodni = { si: globalThis.setInterval, ci: globalThis.clearInterval };
  globalThis.setInterval = (fn, ms) => {
    const id = dalsiId++;
    hodiny.set(id, { fn, ms, kdy: ted + ms });
    return id;
  };
  globalThis.clearInterval = (id) => {
    hodiny.delete(id);
  };
  const posun = async (ms) => {
    const cil = ted + ms;
    for (;;) {
      let nej = null;
      for (const [id, h] of hodiny) if (h.kdy <= cil && (!nej || h.kdy < nej.h.kdy || (h.kdy === nej.h.kdy && id < nej.id))) nej = { id, h };
      if (!nej) break;
      ted = nej.h.kdy;
      nej.h.kdy += nej.h.ms;
      nej.h.fn();
      await flush();
    }
    ted = cil;
    await flush();
  };
  // falešný dokument a okno (viditelnost, visibilitychange, pagehide)
  const dok = new EventTarget();
  dok.visibilityState = 'visible';
  const okno = new EventTarget();
  globalThis.document = dok;
  globalThis.window = okno;
  const schovej = () => {
    dok.visibilityState = 'hidden';
    dok.dispatchEvent(new Event('visibilitychange'));
  };
  const ukaz = () => {
    dok.visibilityState = 'visible';
    dok.dispatchEvent(new Event('visibilitychange'));
  };
  const zavri = () => okno.dispatchEvent(new Event('pagehide'));

  try {
    /* C1–C6: jeden běh od otevření appky po odhlášení */
    const sig = [];
    const api = {
      praceTep(token, druh, kontaktId) {
        sig.push({ token, druh, kid: kontaktId ?? null, t: ted });
        return Promise.resolve(true);
      },
    };
    let token = 'T1';
    let karta = null;
    const stop = C.spustCasovac(api, () => token, () => karta);
    await flush();
    const druhy = () => sig.map((s) => s.druh + (s.kid === null ? '' : `:${s.kid}`));
    over('C1', JSON.stringify(druhy()) === '["tep"]' && sig[0].token === 'T1' && sig[0].t === 0,
      'po spuštění s viditelnou stránkou a přihlášeným hned jeden tep (appka je otevřená), karta žádná', JSON.stringify(sig));
    karta = 93;
    await posun(1000);
    await posun(5000);
    over('C2a', JSON.stringify(druhy()) === '["tep","karta:93"]' && sig[1].t <= 1000,
      'karta na obrazovce: do 1 s jeden signál karta s jejím kontaktem, dál už ne', JSON.stringify(druhy()));
    karta = 95;
    await posun(1000);
    karta = null;
    await posun(2000);
    karta = 95;
    await posun(1000);
    over('C2b', JSON.stringify(druhy()) === '["tep","karta:93","karta:95","karta:95"]',
      'jedna karta za každou zobrazenou kartu (93, 95, po zmizení znovu 95), bez karty nic', JSON.stringify(druhy()));
    const tepy = () => sig.filter((s) => s.druh === 'tep');
    await posun(60000 - ted);
    over('C3a', tepy().length === 2 && tepy()[1].t === 60000, 'tep každých 60 s (druhý v 60. sekundě)', JSON.stringify(tepy().map((s) => s.t)));
    await posun(60000);
    over('C3b', tepy().length === 3 && tepy()[2].t === 120000, 'třetí tep ve 120. sekundě', JSON.stringify(tepy().map((s) => s.t)));
    schovej();
    await flush();
    const pS = sig.length;
    over('C4a', sig.at(-1)?.druh === 'konec' && sig.at(-1)?.t === 120000 && sig.at(-1)?.kid === null,
      'schovaná stránka (visibilitychange hidden) pošle hned konec', JSON.stringify(sig.at(-1)));
    await posun(180000);
    zavri();
    await flush();
    over('C4b', sig.length === pS, 'schovaná stránka tep neposílá a zavření po schování druhý konec nepošle',
      JSON.stringify(sig.slice(pS)));
    ukaz();
    await flush();
    over('C4c', sig.length === pS + 1 && sig.at(-1).druh === 'tep', 'stránka zase vidět: hned tep', JSON.stringify(sig.slice(pS)));
    await posun(60000);
    const pZ = sig.length;
    zavri();
    zavri();
    await flush();
    over('C5', sig.length === pZ + 1 && sig.at(-1).druh === 'konec',
      'pagehide pošle konec jednou (druhé pagehide už ne)', JSON.stringify(sig.slice(pZ)));
    ukaz();
    await flush();
    // odhlášení: getToken vrací null, žádný signál (tep, karta, konec)
    token = null;
    const pO = sig.length;
    karta = 300;
    await posun(180000);
    schovej();
    zavri();
    ukaz();
    await posun(60000);
    over('C6a', sig.length === pO, 'po odhlášení žádný signál (ani tep, karta nebo konec)', JSON.stringify(sig.slice(pO)));
    token = 'T2';
    karta = 301;
    await posun(1000);
    over('C6b', JSON.stringify(sig.slice(pO).map((s) => `${s.druh}${s.kid === null ? '' : `:${s.kid}`}:${s.token}`)) === '["tep:T2","karta:301:T2"]',
      'po přihlášení do 1 s tep a karta na obrazovce, s novým tokenem (časovač token čte vždy znovu)', JSON.stringify(sig.slice(pO)));
    await posun(60000);
    over('C6b2', sig.slice(pO).filter((s) => s.druh === 'tep').length === 2 && sig.slice(pO).every((s) => s.token === 'T2'),
      'pak tep dál každých 60 s s novým tokenem', JSON.stringify(sig.slice(pO)));
    stop();
    const pStop = sig.length;
    karta = 302;
    await posun(300000);
    schovej();
    zavri();
    await flush();
    over('C6c', sig.length === pStop && hodiny.size === 0, 'zastavený časovač nic neposílá a nenechá běžet žádný interval',
      `${sig.length - pStop} signálů, ${hodiny.size} intervalů`);
    ukaz();

    /* C7: chyby polyká, jede dál */
    const sig2 = [];
    let rezim = 'chyba';
    const api2 = {
      praceTep(token2, druh) {
        sig2.push(druh);
        if (rezim === 'hod') throw new Error('Server neodpovídá. Zkontrolujte připojení k internetu.');
        return Promise.reject(new Error('Neplatná nebo vypršelá relace. Přihlaste se znovu.'));
      },
    };
    const stop2 = C.spustCasovac(api2, () => 'T', () => null);
    await posun(60000);
    rezim = 'hod';
    await posun(60000);
    zavri();
    await flush();
    over('C7', sig2.join() === 'tep,tep,tep,konec' && neosetrene.length === 0,
      'chyba serveru ani výjimka časovač nezastaví a nic neprobublá (žádná neošetřená chyba)', `${sig2.join()} | ${neosetrene.join(' | ')}`);
    stop2();
    ukaz();

    /* C8: server bez migrace 072 (praceTep vrátí false, supabase.ts tak hlásí PGRST202): časovač se zastaví */
    const sig3 = [];
    const api3 = {
      praceTep(token3, druh, kid) {
        sig3.push(druh + (kid ? `:${kid}` : ''));
        return Promise.resolve(false);
      },
    };
    let karta3 = null;
    C.spustCasovac(api3, () => 'T', () => karta3);
    await flush();
    await posun(120000);
    karta3 = 93;
    await posun(5000);
    schovej();
    zavri();
    await flush();
    over('C8', sig3.join() === 'tep' && hodiny.size === 0,
      'po odpovědi „server funkci nemá“ (PGRST202) už žádný signál a žádný interval', `${sig3.join()} | intervalů ${hodiny.size}`);
    ukaz();
  } finally {
    globalThis.setInterval = puvodni.si;
    globalThis.clearInterval = puvodni.ci;
    delete globalThis.document;
    delete globalThis.window;
  }
});

/* ---------------- S) supabase.ts: co jde serveru ---------------- */
await blok('S', async () => {
  if (!A) return;
  const sb = A.supabaseApi;
  over('S0', typeof sb.praceTep === 'function' && typeof sb.odmitnutiDuvodZapis === 'function' && typeof A.BEZ_072_DUVOD === 'string',
    'supabase.ts: praceTep, odmitnutiDuvodZapis a hláška BEZ_072_DUVOD');
  if (typeof sb.praceTep !== 'function') return;
  odeslano.length = 0;
  odpoved = { status: 200, telo: '{"ok":true}' };
  const r1 = await sb.praceTep('tok', 'karta', 93);
  const r2 = await sb.praceTep('tok', 'tep');
  const r3 = await sb.praceTep('tok', 'konec');
  const [k, t, e] = odeslano;
  const hlavicky = (x) => x && x.init.headers && x.init.headers.apikey && x.init.headers.Authorization === `Bearer ${x.init.headers.apikey}`
    && x.init.headers['Content-Type'] === 'application/json' && x.init.method === 'POST';
  over('S1', r1 === true && /\/rest\/v1\/rpc\/prace_tep$/.test(k?.url ?? '') && JSON.stringify(k?.body) === '{"p_token":"tok","p_druh":"karta","p_kontakt_id":93}'
    && hlavicky(k) && !k.init.keepalive,
    'karta: POST /rest/v1/rpc/prace_tep {p_token, p_druh: karta, p_kontakt_id} s hlavičkami apikey a Bearer, bez keepalive; odpověď true',
    JSON.stringify(k));
  over('S2', r2 === true && JSON.stringify(t?.body) === '{"p_token":"tok","p_druh":"tep"}' && hlavicky(t) && !t.init.keepalive,
    'tep: jen p_token a p_druh (kontakt jen u karty)', JSON.stringify(t?.body));
  over('S3', r3 === true && JSON.stringify(e?.body) === '{"p_token":"tok","p_druh":"konec"}' && hlavicky(e) && e.init.keepalive === true
    && JSON.stringify(e.init.headers) === JSON.stringify(k.init.headers),
    'konec: fetch s keepalive: true a se stejnými hlavičkami jako ostatní volání RPC', JSON.stringify(e?.init));
  odpoved = { status: 404, telo: '{"code":"PGRST202","message":"Could not find the function public.prace_tep(p_druh, p_token) in the schema cache"}' };
  const bez = await sb.praceTep('tok', 'tep');
  over('S4', bez === false, 'server bez migrace 072 (PGRST202): praceTep vrátí false, nehodí (časovač se podle toho zastaví)', String(bez));
  odpoved = { status: 400, telo: '{"code":"P0001","message":"Neplatná nebo vypršelá relace. Přihlaste se znovu."}' };
  await chyba('S5', () => sb.praceTep('tok', 'tep'), presne('Neplatná nebo vypršelá relace. Přihlaste se znovu.'), 'jiná chyba serveru projde, jak přišla');
  odeslano.length = 0;
  odpoved = { status: 200, telo: '{"ok":true}' };
  const d1 = await sb.odmitnutiDuvodZapis('tok', 93, 'nahled', 'cena');
  const d2 = await sb.odmitnutiDuvodZapis('tok', 97, 'sleva', 'jine', 'web mu dělá synovec');
  over('S6', JSON.stringify(d1) === '{"ok":true}' && /\/rest\/v1\/rpc\/odmitnuti_duvod_zapis$/.test(odeslano[0]?.url ?? '')
    && JSON.stringify(odeslano[0]?.body) === '{"p_token":"tok","p_kontakt_id":93,"p_faze":"nahled","p_duvod":"cena","p_text":null}'
    && JSON.stringify(odeslano[1]?.body) === '{"p_token":"tok","p_kontakt_id":97,"p_faze":"sleva","p_duvod":"jine","p_text":"web mu dělá synovec"}'
    && JSON.stringify(d2) === '{"ok":true}' && hlavicky(odeslano[0]) && !odeslano[0].init.keepalive,
    'odmitnuti_duvod_zapis: {p_token, p_kontakt_id, p_faze, p_duvod, p_text} (bez textu null), odpověď {ok: true}', JSON.stringify(odeslano.map((o) => o.body)));
  odpoved = { status: 404, telo: '{"code":"PGRST202","message":"Could not find the function public.odmitnuti_duvod_zapis"}' };
  await chyba('S7', () => sb.odmitnutiDuvodZapis('tok', 93, 'nahled', 'cena'), presne(A.BEZ_072_DUVOD ?? '?'), 'server bez 072: důvod hláškou BEZ_072_DUVOD');
  over('S7b', /chybí na něm migrace 072/.test(A.BEZ_072_DUVOD ?? '') && /^Důvod odmítnutí/.test(A.BEZ_072_DUVOD ?? ''),
    'hláška bez 072 říká, co server neumí a že chybí migrace 072', A.BEZ_072_DUVOD);
  odpoved = { status: 400, telo: '{"code":"P0001","message":"Důvod odmítnutí zapíšete jen u svého klienta, kterému odešel návrh webu."}' };
  await chyba('S8', () => sb.odmitnutiDuvodZapis('tok', 3, 'nahled', 'cena'), /^Důvod odmítnutí zapíšete jen u svého klienta/, 'odmítnutí serveru projde, jak přišlo');
});

/* ---------------- M) DEMO mock jako kontrakt ---------------- */
await blok('M', async () => {
  if (!A) return;
  const api = A.mockApi;
  over('M0', typeof api.praceTep === 'function' && typeof api.odmitnutiDuvodZapis === 'function', 'mock má praceTep a odmitnutiDuvodZapis');
  if (typeof api.praceTep !== 'function' || typeof api.odmitnutiDuvodZapis !== 'function') return;
  const stav = () => globalThis.__volackaDemoTest.stav();
  over('M0b', Array.isArray(stav().prace) && Array.isArray(stav().odmitnuti), 'háček mocku ukazuje uložené signály (prace) a důvody (odmitnuti)');
  const petra = (await api.login('petra', 'volam')).token;   // Volající pod Albertem (id 2)
  const honza = (await api.login('honza', 'volam')).token;   // Volající pod Mikulášem (id 3)
  const albert = (await api.login('admin', 'admin')).token;  // majitel, super admin (id 1)
  const mikulas = (await api.login('mikulas', 'mikulas')).token; // super admin (id 4)
  const prace = () => stav().prace;

  /* signály */
  const r1 = await api.praceTep(petra, 'tep');
  const r2 = await api.praceTep(petra, 'tep');
  over('M1', r1 === true && r2 === true && prace().filter((p) => p.user_id === 2 && p.druh === 'tep').length === 1
    && prace().every((p) => p.kontakt_id === null),
    'tep: uloží se za přihlášeného (z tokenu), druhý do 20 s ne; odpověď vždy stejná', JSON.stringify(prace()));
  await api.praceTep(petra, 'konec');
  await api.praceTep(petra, 'konec', 93);
  over('M2', prace().filter((p) => p.user_id === 2 && p.druh === 'konec').length === 2 && prace().every((p) => p.kontakt_id === null),
    'konec: uloží se vždy, kontakt se u něj nebere', JSON.stringify(prace()));
  const kontaktyKaret = () => prace().filter((p) => p.druh === 'karta').map((p) => `${p.user_id}:${p.kontakt_id}`);
  const vlastni = await api.praceTep(petra, 'karta', 93);
  const cizi = await api.praceTep(petra, 'karta', 3);
  const neni = await api.praceTep(petra, 'karta', 99999);
  over('M3', vlastni === true && cizi === true && neni === true && JSON.stringify(kontaktyKaret()) === '["2:93"]',
    'karta: vlastní klient (93) uložený; cizí (3, Honzův) a neexistující kontakt stejnou odpovědí a bez zápisu', JSON.stringify(kontaktyKaret()));
  // Eva (id 5) nemá žádný naplánovaný hovor a jen klienta 23: karta z fronty je cizí kontakt, uloží se jen díky zámku
  const eva = (await api.login('eva', 'eva')).token;
  const kartaEvy = await api.nextContact(eva, 'chata');
  await api.praceTep(eva, 'karta', kartaEvy.id);
  // naplánovaný hovor pro Petru u kontaktu bez volajícího (6): smí ho dělat i bez zámku a bez toho, aby byl její
  globalThis.__volackaDemoTest.naplanujDosly(6, 2);
  await api.praceTep(petra, 'karta', 6);
  // super admin: kontakt bez volajícího smí upravit (app_smi_upravit) i bez zámku
  await api.praceTep(mikulas, 'karta', 1);
  over('M4', kartaEvy && kartaEvy.id !== 23 && JSON.stringify(kontaktyKaret()) === JSON.stringify(['2:93', `5:${kartaEvy.id}`, '2:6', '4:1']),
    'karta: i cizí kontakt, který má zamčený (karta ve volání), kontakt s čekajícím vlastním hovorem, a super admin u kontaktu, který smí upravit',
    JSON.stringify({ evy: kartaEvy?.id, karty: kontaktyKaret() }));
  await chyba('M5a', () => api.praceTep(petra, 'pauza'), presne('Neplatný druh signálu: pauza. Povolené: karta, tep, konec.'), 'neznámý druh signálu');
  await chyba('M5b', () => api.praceTep(petra, 'karta'), presne('Signál karta potřebuje kontakt.'), 'karta bez kontaktu');
  await chyba('M5c', () => api.praceTep('demo-x', 'tep'), presne('Neplatná nebo vypršelá relace. Přihlaste se znovu.'), 'neplatná relace');
  const pocetPred = prace().length;
  await api.praceTep(honza, 'tep');
  over('M6', prace().length === pocetPred + 1 && prace().at(-1).user_id === 3, 'každý signál jen za toho, komu patří token (Honza = 3)',
    JSON.stringify(prace().at(-1)));

  /* důvody odmítnutí */
  const odm = () => stav().odmitnuti;
  const v1 = await api.odmitnutiDuvodZapis(petra, 93, 'nahled', 'cena');
  over('M7', JSON.stringify(v1) === '{"ok":true}' && JSON.stringify(odm().map(({ at, id, ...r }) => r)) ===
    JSON.stringify([{ kontakt_id: 93, faze: 'nahled', duvod: 'cena', text: null, zdroj: 'volajici', zapsal: 'app:2' }])
    && typeof odm()[0].at === 'string',
    'Volající u vlastního klienta s návrhem: řádek (zdroj volajici, zapsal app:2), odpověď přesně {ok: true} bez čísla', JSON.stringify(odm()));
  const JEDNA = 'Důvod odmítnutí zapíšete jen u svého klienta, kterému odešel návrh webu.';
  // 20: Petřin klient po prodeji bez návrhu; 5: návrh má, ale je Honzův (Petra mu nevolala, upravit ho nesmí); 99999 neexistuje
  await chyba('M8a', () => api.odmitnutiDuvodZapis(petra, 20, 'nahled', 'cena'), presne(JEDNA), 'vlastní klient bez návrhu: jedna věta');
  await chyba('M8b', () => api.odmitnutiDuvodZapis(petra, 5, 'nahled', 'cena'), presne(JEDNA), 'cizí klient s návrhem: stejná věta');
  await chyba('M8c', () => api.odmitnutiDuvodZapis(petra, 99999, 'nahled', 'cena'), presne(JEDNA), 'neexistující kontakt: stejná věta');
  await chyba('M9a', () => api.odmitnutiDuvodZapis(petra, 93, 'nahled', 'jine'), presne('U důvodu „Jiný důvod“ napište, proč návrh odmítl.'), 'jine bez textu');
  await chyba('M9b', () => api.odmitnutiDuvodZapis(petra, 93, 'nahled', 'jine', '  \n  '), presne('U důvodu „Jiný důvod“ napište, proč návrh odmítl.'), 'jine jen s mezerami a koncem řádku');
  await chyba('M9c', () => api.odmitnutiDuvodZapis(petra, 93, 'nahled', 'cena', 'x'.repeat(451)), presne('Text důvodu je moc dlouhý: nejvýš 450 znaků.'), 'text přes 450 znaků');
  await chyba('M10a', () => api.odmitnutiDuvodZapis(petra, 5, 'pozde', 'cena'), presne('Neplatná fáze odmítnutí: pozde. Povolené: nahled, sleva.'),
    'neplatná fáze (kontrola před kontaktem, i u cizího)');
  await chyba('M10b', () => api.odmitnutiDuvodZapis(petra, 5, 'nahled', 'drahota'),
    presne('Neplatný důvod odmítnutí: drahota. Povolené: ma_web, cena, navrh, nepotrebuje, pozdeji, konci, jine, neuvedl.'), 'neplatný důvod');
  await chyba('M10c', () => api.odmitnutiDuvodZapis(petra, 99999, 'nahled', 'jine'), presne('U důvodu „Jiný důvod“ napište, proč návrh odmítl.'),
    'text se kontroluje před kontaktem');
  await chyba('M10d', () => api.odmitnutiDuvodZapis('demo-x', 93, 'nahled', 'cena'), presne('Neplatná nebo vypršelá relace. Přihlaste se znovu.'), 'neplatná relace');
  await api.odmitnutiDuvodZapis(petra, 94, 'nahled', 'jine', ' web mu\nslíbil Honza  ');
  over('M11', odm().at(-1)?.text === 'web mu slíbil jiný volající' && odm().at(-1)?.duvod === 'jine' && odm().at(-1)?.kontakt_id === 94,
    'text: konce řádků jako mezera, bez mezer na krajích, jméno kolegy Volajícímu maskou 045', JSON.stringify(odm().at(-1)));
  await api.odmitnutiDuvodZapis(petra, 94, 'nahled', 'konci', '\t prodává\r\n\nfirmu \t');
  over('M11b', odm().at(-1)?.text === 'prodává  firmu' && odm().at(-1)?.duvod === 'konci',
    'text jako server: každý konec řádku jedna mezera, tabulátory a mezery na krajích pryč (i u jiného důvodu než jine)', JSON.stringify(odm().at(-1)));
  await api.odmitnutiDuvodZapis(petra, 93, 'nahled', 'navrh');
  over('M12', odm().filter((r) => r.kontakt_id === 93).map((r) => r.duvod).join() === 'cena,navrh', 'každý zápis přidá řádek (nikdy nepřepisuje)',
    JSON.stringify(odm()));
  await chyba('M13a', () => api.odmitnutiDuvodZapis(albert, 99999, 'nahled', 'cena'), presne('Kontakt id=99999 neexistuje.'), 'super admin: neexistující kontakt');
  await chyba('M13b', () => api.odmitnutiDuvodZapis(albert, 1, 'nahled', 'cena'),
    presne('Klientovi ještě neodešel návrh webu: důvod odmítnutí návrhu se u něj nezapisuje.'), 'super admin: klient bez návrhu');
  // Mikuláš: 93 je Petřin klient (Albertův tým), upravit ho nesmí, důvod zapsat smí (super admin u každého klienta s návrhem)
  await api.odmitnutiDuvodZapis(mikulas, 93, 'sleva', 'jine', 'mluvil s Petrou');
  over('M13c', JSON.stringify((({ at, id, ...r }) => r)(odm().at(-1))) ===
    JSON.stringify({ kontakt_id: 93, faze: 'sleva', duvod: 'jine', text: 'mluvil s Petrou', zdroj: 'super_admin', zapsal: 'app:4' }),
    'super admin u klienta s návrhem, kterého upravit nesmí: zapíše, zdroj super_admin, jména beze změny', JSON.stringify(odm().at(-1)));
  if (D && Array.isArray(A.DUVODY_ODMITNUTI)) {
    over('M14', JSON.stringify(A.DUVODY_ODMITNUTI) === JSON.stringify(D.DUVODY),
      'registr důvodů mocku (server) a appky je stejný: kódy, štítky i pořadí', JSON.stringify(A.DUVODY_ODMITNUTI));
  } else {
    over('M14', false, 'mock exportuje registr DUVODY_ODMITNUTI (kódy a štítky jako server)');
  }
});

/* ---------------- D) výběr důvodu ---------------- */
await blok('D', async () => {
  if (!D) return;
  const OCEK = [
    { kod: 'ma_web', text: 'Už má web nebo ho dělá někdo jiný' },
    { kod: 'cena', text: 'Je to pro něj drahé' },
    { kod: 'navrh', text: 'Nelíbí se mu návrh' },
    { kod: 'nepotrebuje', text: 'Web nepotřebuje' },
    { kod: 'pozdeji', text: 'Teď ne, možná později' },
    { kod: 'konci', text: 'Končí s podnikáním' },
    { kod: 'jine', text: 'Jiný důvod' },
    { kod: 'neuvedl', text: 'Neřekl proč' },
  ];
  over('D1', JSON.stringify(D.DUVODY) === JSON.stringify(OCEK), 'DUVODY: kódy a štítky přesně podle spec §3.7 a kontraktu §3.2, v pořadí', JSON.stringify(D.DUVODY));
  const STAVY = ['nekontaktovano', 'nedovolano', 'zajem', 'web_ve_vyrobe', 'navrh_odeslan', 'ceka_na_klienta', 'upravy_ve_vyrobe', 'sleva_nabidnuta',
    'pozdeji', 'pozastaveno', 'eskalace', 'schvaleno', 'faktura_odeslana', 'zaplaceno', 'domena_pripojena', 'hotovo', 'odmitnuto', 'bez_odpovedi',
    'nerelevantni', 'nekontaktovat'];
  const faze = STAVY.map((s) => D.fazeOdmitnuti(s));
  over('D2', faze.filter((f) => f === 'sleva').length === 1 && D.fazeOdmitnuti('sleva_nabidnuta') === 'sleva' && faze.filter((f) => f === 'nahled').length === STAVY.length - 1,
    'fáze: sleva jen u stavu Nabídnuta sleva, jinak nahled', JSON.stringify(faze));
  over('D3', D.chceDuvod({ first_proposal_at: '2026-11-01T10:00:00+00:00' }) === true && D.chceDuvod({ first_proposal_at: null }) === false
    && D.chceDuvod({}) === false && D.chceDuvod(null) === false,
    'ptát se na důvod jen u klienta, kterému odešel návrh (first_proposal_at); bez návrhu, bez klíče (cizí kontakt) ani bez kontaktu ne');
  const V = (duvod, text = '') => ({ duvod, text });
  over('D4', D.duvodChybi(D.PRAZDNA_VOLBA) !== null && D.duvodChybi(V('cena')) === null && D.duvodChybi(V('neuvedl', '')) === null
    && D.duvodChybi(V('jine')) !== null && D.duvodChybi(V('jine', ' \n ')) !== null && D.duvodChybi(V('jine', 'synovec')) === null
    && D.duvodChybi(V('jine', 'x'.repeat(451))) !== null && D.duvodChybi(V('jine', 'x'.repeat(450))) === null && D.DUVOD_TEXT_MAX === 450,
    'povinný výběr; Jiný důvod chce text (mezery a konec řádku nestačí), nejvýš 450 znaků');
  over('D5', D.textDuvodu('  web\nmu dělá\r\nsynovec  ') === 'web mu dělá synovec' && D.textDuvodu(' \n ') === null && D.textDuvodu('') === null
    && D.textDuvodu('\ta\n\nb\t') === 'a  b',
    'text jako server (každý konec řádku jedna mezera, bez mezer a tabulátorů na krajích, prázdný = null)',
    JSON.stringify([D.textDuvodu('  web\nmu dělá\r\nsynovec  '), D.textDuvodu('\ta\n\nb\t')]));
  const volani = [];
  const okApi = { odmitnutiDuvodZapis: async (...a) => { volani.push(a); return { ok: true }; } };
  const r1 = await D.ulozDuvod(okApi, 'tok', 93, 'nahled', V('jine', ' synovec '));
  const r2 = await D.ulozDuvod(okApi, 'tok', 97, 'sleva', V('cena', 'nic'));
  const r3 = await D.ulozDuvod(okApi, 'tok', 97, 'sleva', D.PRAZDNA_VOLBA);
  over('D6a', r1 === null && r2 === null && r3 === null && JSON.stringify(volani) === JSON.stringify([['tok', 93, 'nahled', 'jine', 'synovec'], ['tok', 97, 'sleva', 'cena', null]]),
    'uložení: jine s textem, ostatní důvody bez textu, bez výběru nic', JSON.stringify(volani));
  const spatneApi = { odmitnutiDuvodZapis: async () => { throw new Error('Důvod odmítnutí server ještě neumí (chybí na něm migrace 072).'); } };
  let hodilo = false;
  let r4 = null;
  try {
    r4 = await D.ulozDuvod(spatneApi, 'tok', 93, 'nahled', V('cena'));
  } catch {
    hodilo = true;
  }
  over('D6b', !hodilo && r4 === 'Důvod odmítnutí server ještě neumí (chybí na něm migrace 072).',
    'chyba uložení důvodu nehodí: vrátí hlášku (výsledek hovoru zůstává uložený)', String(r4));
  over('D6c', /^Důvod odmítnutí se ale neuložil/.test(D.DUVOD_NEULOZEN ?? ''), 'věta pro stránku, když se důvod neuložil', D.DUVOD_NEULOZEN);
  // vykreslení (react-dom/server)
  const h = D.createElement;
  const nic = () => undefined;
  const prazdny = D.renderToStaticMarkup(h(D.DuvodOdmitnuti, { faze: 'nahled', volba: D.PRAZDNA_VOLBA, onVolba: nic, id: 'x' }));
  const moznosti = [...prazdny.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map((m) => [m[1], m[2]]);
  over('D7a', /<label[^>]*for="x-vyber"[^>]*>Proč návrh odmítl/.test(prazdny) && /<select[^>]*id="x-vyber"[^>]*required=""/.test(prazdny)
    && JSON.stringify(moznosti.slice(1)) === JSON.stringify(OCEK.map((d) => [d.kod, d.text])) && moznosti[0]?.[0] === '' && !/<textarea/.test(prazdny)
    && !/duvod-odmitnuti-chybi/.test(prazdny),
    'výběr „Proč návrh odmítl“: povinný select s osmi důvody v pořadí (první prázdná výzva), bez pole textu a bez věty navíc', prazdny.slice(0, 400));
  const jineBez = D.renderToStaticMarkup(h(D.DuvodOdmitnuti, { faze: 'nahled', volba: V('jine', ' '), onVolba: nic, id: 'x' }));
  over('D7d', /class="muted duvod-odmitnuti-chybi" id="x-chybi">Napiš, jaký jiný důvod klient řekl\.</.test(jineBez)
    && /<textarea[^>]*aria-invalid="true"/.test(jineBez),
    'Jiný důvod bez textu: věta, co chybí, a pole označené jako neplatné', jineBez.slice(0, 900));
  over('D7b', /Odmítl náhled \(návrh webu\)/.test(prazdny), 'u fáze nahled věta „Odmítl náhled (návrh webu)“');
  const jine = D.renderToStaticMarkup(h(D.DuvodOdmitnuti, { faze: 'sleva', volba: V('jine', 'abc'), onVolba: nic, id: 'x' }));
  over('D7c', /<textarea[^>]*id="x-text"[^>]*maxLength="450"|<textarea[^>]*maxlength="450"[^>]*id="x-text"/i.test(jine) && /Odmítl nabídku za polovinu/.test(jine)
    && /<label[^>]*for="x-text"/.test(jine) && />abc<\/textarea>/.test(jine),
    'Jiný důvod: pole textu (nejvýš 450 znaků) se štítkem; u fáze sleva věta „Odmítl nabídku za polovinu“', jine.slice(0, 600));
});

/* ---------------- W) zapojení ve stránkách (zdrojový text) ---------------- */
await blok('W', async () => {
  const cti = (p) => {
    try {
      return readFileSync(join(ROOT, p), 'utf8');
    } catch {
      return '';
    }
  };
  const bezKomentaru = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const app = bezKomentaru(cti('src/App.tsx'));
  over('W1', /import \{[^}]*\bspustCasovac\b[^}]*\} from '\.\/pracovniCas'/.test(app)
    && /useEffect\(\s*\(\)\s*=>\s*spustCasovac\(/.test(app) && /\.praceTep\(/.test(app) && /aktualniKarta/.test(app) && /<PracovniCasovac \/>/.test(app)
    && (app.match(/spustCasovac\(/g) ?? []).length === 1,
    'App.tsx: časovač se spustí jednou (efekt vrátí zastavení), signály přes getApi().praceTep, karta z aktualniKarta');
  const komp = app.match(/function PracovniCasovac\(\)[\s\S]*?\n\}/)?.[0] ?? '';
  over('W1b', /return null;/.test(komp) && !/<\/|\/>/.test(komp), 'časovač nemá žádné UI (komponenta vrací null, žádný prvek JSX)', komp.slice(0, 200));
  const cas = bezKomentaru(cti('src/pracovniCas.ts'));
  over('W1c', cas !== '' && !/createElement|innerHTML|textContent|appendChild|console\./.test(cas), 'pracovniCas.ts nic nevykresluje ani nevypisuje');
  const call = bezKomentaru(cti('src/pages/CallPage.tsx'));
  over('W2', /nastavKartu\(/.test(call) && /useEffect\(\(\) => \(\) => nastavKartu\(null\), \[\]\)/.test(call),
    'CallPage hlásí kartu na obrazovce (nastavKartu) a po odchodu z volání ji zruší');
  const okno = bezKomentaru(cti('src/components/DovolaniOkno.tsx'));
  over('W3', /vysledek === 'nechce' && chceDuvod\(kontakt\)/.test(okno) && /<DuvodOdmitnuti\b/.test(okno)
    && okno.indexOf('getApi().zapisHovor(') > -1 && okno.indexOf('ulozDuvod(') > okno.indexOf('getApi().zapisHovor(')
    && /fazeOdmitnuti\(kontakt\.status\)/.test(okno),
    'okno Zavolal/a jsem: důvod jen u Nechce web klienta s návrhem, uloží se až po zapis_hovor, fáze ze stavu klienta');
  const drawer = bezKomentaru(cti('src/components/KontaktDrawer.tsx'));
  over('W4', /status === 'odmitnuto' && kontakt\.status !== 'odmitnuto' && chceDuvod\(kontakt\)/.test(drawer) && /<DuvodOdmitnuti\b/.test(drawer)
    && drawer.indexOf('ulozDuvod(') > drawer.indexOf('getApi().updateKontakt(session.token, kontakt.id, patch)')
    && /fazeOdmitnuti\(kontakt\.status\)/.test(drawer),
    'detail: důvod jen při změně stavu na Odmítnuto u klienta s návrhem, uloží se až po update_kontakt');
  over('W5', /chceDuvod\(kontakt\)/.test(call) && /<DuvodOdmitnuti\b/.test(call) && call.indexOf('ulozDuvod(') > call.indexOf('getApi().resolveCall(')
    && /fazeOdmitnuti\(kontakt\.status\)/.test(call),
    'volání: Odmítnuto u klienta s návrhem chce důvod, uloží se až po resolve_call');
});

if (chyby === 0) {
  console.log(`ALL OK (${pocet} kontrol)`);
  process.exit(0);
}
console.log(`CHYB: ${chyby} z ${pocet}`);
process.exit(1);
