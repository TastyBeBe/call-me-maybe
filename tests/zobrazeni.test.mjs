// Test chování: zobrazený stav klienta jen pro přihlášeného (src/zobrazeni.ts, migrace 071, Albert 17. 11. 2026: volající
// VeraP má u dvou svých klientů vidět „Zaplaceno“ a ve Statistikách dva prodeje, „make sure that it's only visible there
// for her and for other people including us it stays tagged correctly“).
//
// Měří modul (popisek podle vlastních řádků, beze změny bez nich, zapomenutí po odhlášení, jedno načtení za přihlášení),
// odznak StatusBadge (vykreslený přes react-dom/server), co src/api/supabase.ts posílá serveru a jak se chová proti serveru
// bez 071 (fetch je podstrčený, nic nejde po síti), demo mock (žádný zobrazený stav), větu okna „Zavolal/a jsem“ (popisek
// zobrazený, rozhodnutí podle skutečného stavu) a zapojení na místech, kde appka stav ukazuje (odznaky, menu stavu
// v detailu, přehled, načtení v App.tsx). Prodáno a Vyděláno počítá server (test db/tests/test_071_zobrazeny_stav.sql).
// Nikdy nesahá na živou DB. Spuštění:
//   node tests/zobrazeni.test.mjs            (kořen appky = složka nad tests/)
//   APP_ROOT=/cesta/ke/kopii node tests/zobrazeni.test.mjs   (mutace v kopii)
// Výsledek: řádek „ALL OK (N kontrol)“, jinak řádky „FAIL <id>: <česky> (…)“ a kód 1.

import { build } from 'esbuild';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
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
// mock čeká desítky ms na každé volání; test to zkrátí na nulu
const puvodniTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, _ms, ...a) => puvodniTimeout(fn, 0, ...a);
// supabase.ts: žádný požadavek po síti, jen záznam, co by appka poslala; odpověď nastaví test
const odeslano = [];
let odpoved = { status: 200, telo: '[]' };
globalThis.fetch = async (url, init) => {
  odeslano.push({ url: String(url), body: JSON.parse(init?.body ?? '{}') });
  return new Response(odpoved.telo, { status: odpoved.status, headers: { 'Content-Type': 'application/json' } });
};

let bundle;
{
  const out = await build({
    stdin: {
      contents: [
        "export * as Z from './src/zobrazeni.ts';",
        "export { StatusBadge, STATUS_LABELS, STATUS_COLORS } from './src/ui.tsx';",
        "export { odmitnutiNejde } from './src/components/DovolaniOkno.tsx';",
        "export { mockApi } from './src/api/mock.ts';",
        "export { supabaseApi } from './src/api/supabase.ts';",
        "export { createElement } from 'react';",
        "export { renderToStaticMarkup } from 'react-dom/server';",
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
    define: { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env.PROD': 'false' },
  }).catch((e) => {
    console.log(`FAIL 0: appka nejde sestavit pro test (${String(e.message).split('\n').slice(0, 3).join(' | ')})`);
    process.exit(1);
  });
  const dir = mkdtempSync(join(tmpdir(), 'zobrazeni-test-'));
  const f = join(dir, 'b.cjs');
  writeFileSync(f, out.outputFiles[0].text);
  bundle = createRequire(import.meta.url)(f);
  rmSync(dir, { recursive: true, force: true });
}
const { Z, StatusBadge, STATUS_LABELS, STATUS_COLORS, odmitnutiNejde, mockApi, supabaseApi, createElement, renderToStaticMarkup } = bundle;

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
    over(id, false, 'blok testu spadl na nečekané chybě', String(e && e.stack));
  }
}
const odznak = (status, kontaktId) => renderToStaticMarkup(createElement(StatusBadge, kontaktId === undefined ? { status } : { status, kontaktId }));
const cti = (soubor) => readFileSync(join(ROOT, soubor), 'utf8');

// A: modul — popisek podle vlastních řádků, beze změny bez nich
await blok('A', async () => {
  Z.zapomenZobrazeneStavy();
  over('A1', Z.zobrazenyStav(5, 'ceka_na_klienta') === 'ceka_na_klienta', 'bez řádků se ukazuje jiný stav než skutečný');
  Z.nastavZobrazeneStavy([{ kontakt_id: 5, stav: 'zaplaceno' }, { kontakt_id: 9, stav: 'navrh_odeslan' }]);
  over('A2', Z.zobrazenyStav(5, 'ceka_na_klienta') === 'zaplaceno', 'kontakt se zobrazeným stavem neukazuje zobrazený stav');
  over('A3', Z.zobrazenyStav(6, 'ceka_na_klienta') === 'ceka_na_klienta', 'jiný kontakt dostal cizí zobrazený stav');
  over('A4', Z.zobrazenyStav(null, 'zajem') === 'zajem' && Z.zobrazenyStav(undefined, 'zajem') === 'zajem', 'bez čísla kontaktu se neukáže skutečný stav');
  over('A5', Z.zobrazenyStav(9, 'web_ve_vyrobe') === 'navrh_odeslan', 'zobrazený stav mimo prodej se neukáže (popisek je jakýkoli stav)');
  Z.nastavZobrazeneStavy([{ kontakt_id: '5', stav: 'zaplaceno' }, { kontakt_id: 7 }, null, { kontakt_id: 8, stav: '' }]);
  over('A6', Z.zobrazenyStav(5, 'zajem') === 'zajem' && Z.zobrazenyStav(7, 'zajem') === 'zajem' && Z.zobrazenyStav(8, 'zajem') === 'zajem',
    'neplatný řádek (číslo jako text, bez stavu, prázdný stav) změnil popisek');
  Z.nastavZobrazeneStavy([{ kontakt_id: 5, stav: 'zaplaceno' }]);
  Z.zapomenZobrazeneStavy();
  over('A7', Z.zobrazenyStav(5, 'ceka_na_klienta') === 'ceka_na_klienta', 'po odhlášení zůstal zobrazený stav předchozího člověka');
});

// B: odznak StatusBadge
await blok('B', async () => {
  Z.nastavZobrazeneStavy([{ kontakt_id: 5, stav: 'zaplaceno' }]);
  const s5 = odznak('ceka_na_klienta', 5);
  over('B1', s5.includes(`>${STATUS_LABELS.zaplaceno}<`) && s5.includes('status-badge') && !s5.includes(STATUS_LABELS.ceka_na_klienta),
    'odznak kontaktu se zobrazeným stavem neukazuje „Zaplaceno“ (nebo ukazuje i skutečný stav)', s5);
  over('B2', s5.toLowerCase().includes(STATUS_COLORS.zaplaceno.bg.toLowerCase()), 'odznak zobrazeného stavu nemá barvu toho stavu', s5);
  over('B3', odznak('ceka_na_klienta').includes(`>${STATUS_LABELS.ceka_na_klienta}<`), 'odznak bez čísla kontaktu neukazuje skutečný stav');
  over('B4', odznak('ceka_na_klienta', 6).includes(`>${STATUS_LABELS.ceka_na_klienta}<`), 'odznak jiného kontaktu ukazuje cizí zobrazený stav');
  Z.zapomenZobrazeneStavy();
  over('B5', odznak('ceka_na_klienta', 5).includes(`>${STATUS_LABELS.ceka_na_klienta}<`), 'odznak po zapomenutí ukazuje starý zobrazený stav');
});

// C: supabase.ts — co jde serveru, server bez 071
await blok('C', async () => {
  odeslano.length = 0;
  odpoved = { status: 200, telo: '[{"kontakt_id":3985,"stav":"zaplaceno"},{"kontakt_id":3178,"stav":"zaplaceno"}]' };
  const r = await supabaseApi.zobrazeneStavy('tok-c');
  over('C1', odeslano.length === 1 && odeslano[0].url.endsWith('/rest/v1/rpc/zobrazene_stavy') && JSON.stringify(odeslano[0].body) === '{"p_token":"tok-c"}',
    'zobrazeneStavy neposílá jen p_token na rpc/zobrazene_stavy', JSON.stringify(odeslano));
  over('C2', r.length === 2 && r[0].kontakt_id === 3985 && r[1].stav === 'zaplaceno', 'řádky serveru se nevrátí, jak přišly', JSON.stringify(r));
  odpoved = { status: 404, telo: '{"code":"PGRST202","message":"Could not find the function public.zobrazene_stavy(p_token) in the schema cache"}' };
  let r2;
  try { r2 = await supabaseApi.zobrazeneStavy('tok-c'); } catch (e) { r2 = `chyba: ${e.message}`; }
  over('C3', Array.isArray(r2) && r2.length === 0, 'server bez migrace 071 (PGRST202) nedá prázdný seznam', JSON.stringify(r2));
  odpoved = { status: 200, telo: 'null' };
  const r3 = await supabaseApi.zobrazeneStavy('tok-c');
  over('C4', Array.isArray(r3) && r3.length === 0, 'odpověď null nedá prázdný seznam');
  odpoved = { status: 400, telo: '{"code":"P0001","message":"Neplatná nebo vypršelá relace. Přihlaste se znovu."}' };
  let msg = '';
  try { await supabaseApi.zobrazeneStavy('tok-c'); } catch (e) { msg = e.message; }
  over('C5', msg === 'Neplatná nebo vypršelá relace. Přihlaste se znovu.', 'chyba přihlášení se ztratí (má projít beze změny)', msg);
});

// D: načtení jednou za přihlášení (getApi = supabase, localStorage bez nastavení)
await blok('D', async () => {
  Z.zapomenZobrazeneStavy();
  odeslano.length = 0;
  odpoved = { status: 200, telo: '[{"kontakt_id":3178,"stav":"zaplaceno"}]' };
  await Promise.all([Z.nactiZobrazeneStavy('tok-d'), Z.nactiZobrazeneStavy('tok-d')]);
  await Z.nactiZobrazeneStavy('tok-d');
  over('D1', odeslano.filter((x) => x.url.endsWith('/rpc/zobrazene_stavy')).length === 1, 'zobrazené stavy se pro jedno přihlášení načítají víckrát', String(odeslano.length));
  over('D2', Z.zobrazenyStav(3178, 'ceka_na_klienta') === 'zaplaceno', 'načtený zobrazený stav se neukáže');
  Z.zapomenZobrazeneStavy();
  odpoved = { status: 404, telo: '{"code":"PGRST202","message":"Could not find the function"}' };
  await Z.nactiZobrazeneStavy('tok-d2');
  over('D3', Z.zobrazenyStav(3178, 'ceka_na_klienta') === 'ceka_na_klienta', 'po odhlášení a přihlášení jiného (server bez 071) zůstal cizí zobrazený stav');
  odpoved = { status: 500, telo: '{"message":"boom"}' };
  Z.zapomenZobrazeneStavy();
  let spadlo = false;
  try { await Z.nactiZobrazeneStavy('tok-d3'); } catch { spadlo = true; }
  over('D4', !spadlo && Z.zobrazenyStav(3178, 'ceka_na_klienta') === 'ceka_na_klienta', 'chyba serveru shodí načtení nebo nechá zobrazený stav');
  Z.zapomenZobrazeneStavy();
});

// E: demo mock — zobrazený stav nemá nikdo
await blok('E', async () => {
  const s = await mockApi.login('petra', 'volam');
  const r = await mockApi.zobrazeneStavy(s.token);
  over('E1', Array.isArray(r) && r.length === 0, 'demo vrací zobrazený stav', JSON.stringify(r));
  let msg = '';
  try { await mockApi.zobrazeneStavy('neplatny-token'); } catch (e) { msg = e.message; }
  over('E2', /relace|přihlas/i.test(msg), 'demo pustí zobrazené stavy i s neplatným tokenem', msg);
});

// F: okno „Zavolal/a jsem“ — věta se zobrazeným stavem, rozhodnutí podle skutečného
await blok('F', async () => {
  Z.nastavZobrazeneStavy([{ kontakt_id: 7, stav: 'zaplaceno' }, { kontakt_id: 8, stav: 'zaplaceno' }]);
  const ja = { jaSuper: false, jmeno: 'Petra' };
  const v7 = odmitnutiNejde({ id: 7, status: 'faktura_odeslana', last_caller: 'Petra' }, ja, false);
  over('F1', typeof v7 === 'string' && v7.startsWith(`Klient už web objednal (stav ${STATUS_LABELS.zaplaceno})`), 'věta okna neukazuje zobrazený stav', v7);
  over('F2', odmitnutiNejde({ id: 8, status: 'ceka_na_klienta', last_caller: 'Petra' }, ja, false) === null,
    'okno rozhoduje podle zobrazeného stavu místo skutečného (odmítnutí klienta, který web neobjednal, zablokované)');
  over('F3', odmitnutiNejde({ status: 'schvaleno', last_caller: 'Petra' }, ja, false)?.startsWith(`Klient už web objednal (stav ${STATUS_LABELS.schvaleno})`) === true,
    'okno bez čísla kontaktu neukazuje skutečný stav');
  Z.zapomenZobrazeneStavy();
});

// G: zapojení na místech, kde appka stav ukazuje (zdroj)
await blok('G', async () => {
  for (const [soubor, vzor] of [
    ['src/pages/MojiPage.tsx', '<StatusBadge status={r.status} kontaktId={r.id} />'],
    ['src/pages/OznacenePage.tsx', '<StatusBadge status={r.status} kontaktId={r.id} />'],
    ['src/pages/AdminPage.tsx', '<td role="cell">{jenZaklad(r) ? <Skryto /> : <StatusBadge status={r.status} kontaktId={r.id} />}</td>'],
    ['src/pages/CallPage.tsx', '<StatusBadge status={kontakt.status} kontaktId={kontakt.id} />'],
    ['src/components/KontaktDrawer.tsx', 'status: <StatusBadge status={kontakt.status} kontaktId={kontakt.id} />'],
  ]) {
    over(`G1 ${soubor}`, cti(soubor).includes(vzor), `${soubor}: odznak stavu bez zobrazeného stavu (kontaktId)`);
  }
  const vsechny = (adr) => readdirSync(adr).flatMap((x) => (statSync(join(adr, x)).isDirectory() ? vsechny(join(adr, x)) : [join(adr, x)]));
  const bezId = vsechny(join(ROOT, 'src')).filter((f) => /\.tsx$/.test(f)).flatMap((f) =>
    (readFileSync(f, 'utf8').match(/<StatusBadge status=\{[^}]*\} \/>/g) ?? []).map((m) => `${relative(ROOT, f)}: ${m}`));
  over('G2', bezId.length === 0, 'odznak stavu kontaktu bez kontaktId (zobrazený stav by se tam neukázal)', bezId.join(' | '));
  const kd = cti('src/components/KontaktDrawer.tsx');
  over('G3', kd.includes('const zobrazeny = useZobrazenyStav(kontakt.id, kontakt.status);') && kd.includes('<select value={status} onChange={(e) => setStatus(e.target.value as KontaktStatus)}>'),
    'detail: menu stavu nedrží skutečný stav jako hodnotu nebo nezná zobrazený stav');
  over('G4', kd.includes('{STATUS_LABELS[s === kontakt.status ? zobrazeny : s]}') && kd.includes('s !== kontakt.status && s === zobrazeny ? null : ('),
    'detail: menu stavu neukazuje u stávajícího stavu popisek zobrazeného, nebo ukazuje jeho popisek dvakrát');
  over('G5', kd.includes('Z „{STATUS_LABELS[zobrazeny] ?? zobrazeny}“ na') && /if \(status !== kontakt\.status\) \{\s*patch\.status = status;/.test(kd),
    'detail: věta změny stavu bez zobrazeného stavu, nebo uložení neporovnává se skutečným stavem');
  const pp = cti('src/components/PrehledPanel.tsx');
  over('G6', pp.includes('radkyFaktu(f, naKarte, f.stav ? zobrazenyStav(kontakt.id, f.stav) : f.stav)') && pp.includes('useZobrazeneStavy();'),
    'přehled klienta: řádek stavu bez zobrazeného stavu');
  const app = cti('src/App.tsx');
  over('G7', app.includes('<ZobrazeniNacitani />') && app.includes('if (token) void nactiZobrazeneStavy(token);') && app.includes('else zapomenZobrazeneStavy();'),
    'App.tsx: zobrazené stavy se po přihlášení nenačtou nebo po odhlášení nezapomenou');
  const volajiRpc = vsechny(join(ROOT, 'src')).filter((f) => /\.tsx?$/.test(f) && /\.zobrazeneStavy\(/.test(readFileSync(f, 'utf8'))).map((f) => relative(ROOT, f)).sort();
  over('G8', JSON.stringify(volajiRpc) === JSON.stringify(['src/zobrazeni.ts']), 'zobrazené stavy načítá i jiné místo než src/zobrazeni.ts', volajiRpc.join(', '));
  over('G9', !/zobrazeni/.test(cti('src/pages/StatsPage.tsx')), 'Statistiky si čísla se zobrazeným stavem počítají samy (má je počítat server)');
});

if (chyby) process.exit(1);
console.log(`ALL OK (${pocet} kontrol)`);
