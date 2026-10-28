// Test chování: migrace 056 (Albert 27. 10. 2026): statistiky za jeden den (super admin), v Moji klienti stejné filtry
// jako v Kontaktech (jen super admin) a řazení podle poslední změny v obou seznamech.
// ⚠ Migrace 057 (Albert 28. 10. 2026: „both filters. One for the latest change regarding anything … and the second one
// should be just the last time they were called“): poslední změna = nejpozdější z updated_at, status_changed_at,
// first_proposal_at, last_our_reply_at a last_client_reply_at (klíč posledni_zmena, sloupec Změněno) a řazení podle
// posledního hovoru (posledni_hovor; Volajícímu jen jeho hovory). Blok H; bloky R, S a U upravené (čtyři hodnoty řazení).
//
// Měří DEMO mock (src/api/mock.ts), který musí zrcadlit server (db/migration_056_statistiky_den_filtry.sql, test
// db/tests/test_056_statistiky_den_filtry.sql), a to, co src/api/supabase.ts posílá serveru (fetch je podstrčený, nic
// nejde po síti): nové parametry jen když jsou zapnuté (stará DB bez 056 dál funguje) a srozumitelná hláška, když je
// server nezná (PGRST202). Nikdy nesahá na živou DB. Klikání na stránkách měří tests/demo-e2e.mjs (bloky F a D 056).
// Spuštění:
//   node tests/filtry.test.mjs            (kořen appky = složka nad tests/)
//   APP_ROOT=/cesta/ke/kopii node tests/filtry.test.mjs   (mutace v kopii)
// Výsledek: řádek „ALL OK (N kontrol)", jinak řádky „FAIL <id>: <česky> (…)" a kód 1.

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
// supabase.ts: žádný požadavek po síti, jen záznam, co by appka poslala; odpověď nastaví test
const odeslano = [];
let odpoved = { status: 200, telo: '[]' };
globalThis.fetch = async (url, init) => {
  odeslano.push({ url: String(url), body: JSON.parse(init?.body ?? '{}') });
  return new Response(odpoved.telo, { status: odpoved.status, headers: { 'Content-Type': 'application/json' } });
};

// háček DEMO mocku (src/api/mock.ts, sDemoTestem): musí být PŘED načtením balíčku; blok D z něj čte call_log a prodeje
globalThis.__volackaDemoTest = {};

let bundle;
{
  const out = await build({
    stdin: {
      contents: [
        "export { mockApi } from './src/api/mock.ts';",
        "export { supabaseApi, BEZ_056_DEN, BEZ_056_RAZENI, BEZ_056_FILTRY, BEZ_057_HOVOR } from './src/api/supabase.ts';",
        "export * as prahaModul from './src/praha.ts';",
        "export * as uiModul from './src/ui.tsx';",
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
  const dir = mkdtempSync(join(tmpdir(), 'filtry-test-'));
  const f = join(dir, 'b.cjs');
  writeFileSync(f, out.outputFiles[0].text);
  bundle = createRequire(import.meta.url)(f);
  rmSync(dir, { recursive: true, force: true });
}
const { mockApi: api, supabaseApi, BEZ_056_DEN, BEZ_056_RAZENI, BEZ_056_FILTRY, BEZ_057_HOVOR, prahaModul: P, uiModul: U } = bundle;

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
const ids = (r) => r.rows.map((x) => x.id);
const serazene = (a) => [...a].sort((x, y) => x - y);
const stejne = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const DEN_MS = 86_400_000;

const petra = (await api.login('petra', 'volam')).token;   // Volající pod Albertem (id 2)
const honza = (await api.login('honza', 'volam')).token;   // Volající pod Mikulášem (id 3)
const albert = (await api.login('admin', 'admin')).token;  // majitel (id 1)
const mikulas = (await api.login('mikulas', 'mikulas')).token; // super admin (id 4)

/* ---------------- D) statistiky za jeden den (all_stats s p_den) ---------------- */
await blok('D', async () => {
  const den = (ms) => P.prahaDen(new Date(Date.now() - ms));
  const radekDne = async (tok, d, uid) => (await api.allStats(tok, d)).find((u) => u.user_id === uid);
  // Petra: přeplánováno před dnem (kontakt 10), nedovoláno před 2 dny (302), nerelevantní před 4 dny (13), zájem před 9 dny
  // (20). Data mají časy „teď minus N × 24 h“: kolem změny času padnou dva sousední na týž pražský den (26. 10. 2026 ve 23:19
  // přeplánovaný i nedovolaný hovor na 25. 10.) a Petřin prodej z tohoto týdne („před dvěma hodinami“) padne mezi půlnocí
  // a 2:00 na včerejšek (změřeno 27. a 28. 10. 2026 s posunutými hodinami). Očekávaná čísla dne se proto počítají přímo
  // z dat mocku (háček __volackaDemoTest, jako e2e blok D056) a každý případ navíc hlídá, co je na něm podstatné.
  const stavMocku = () => globalThis.__volackaDemoTest.stav();
  const ocekDne = (uid, d) => {
    const s = stavMocku();
    const h = s.callLog.filter((l) => l.user_id === uid && P.prahaDen(l.created_at) === d);
    const n = (o) => h.filter((l) => l.outcome === o).length;
    const reached = n('odmitnuto') + n('zajem');
    const sZajmem = new Set(s.callLog.filter((l) => l.user_id === uid && l.outcome === 'zajem').map((l) => l.kontakt_id));
    return {
      calls: h.length, reached, zajem: n('zajem'), odmitnuto: n('odmitnuto'), nedovolano: n('nedovolano'),
      nerelevantni: n('nerelevantni'), preplanovano: n('preplanovano'),
      conversion: reached === 0 ? 0 : Math.round((n('zajem') / reached) * 1000) / 10,
      sold: s.kontakty.filter((c) => c.prodano_at && P.prahaDen(c.prodano_at) === d && sZajmem.has(c.id)).length,
    };
  };
  const sedi = (r, o) => !!r && Object.keys(o).every((k) => r[k] === o[k]);
  const denHovoru = (uid, kontakt, outcome) =>
    P.prahaDen(stavMocku().callLog.find((l) => l.user_id === uid && l.kontakt_id === kontakt && l.outcome === outcome).created_at);
  const hovoruPetry = stavMocku().callLog.filter((l) => l.user_id === 2).length;
  const dPrepl = denHovoru(2, 10, 'preplanovano');
  const vcera = await radekDne(mikulas, dPrepl, 2);
  const oPrepl = ocekDne(2, dPrepl);
  over('D1', sedi(vcera, oPrepl) && vcera.preplanovano === 1 && vcera.calls < hovoruPetry,
    'den přeplánovaného hovoru: jen hovory toho dne (přeplánovaný do dovoláno ani konverze ne)', `${JSON.stringify(vcera)} / ${JSON.stringify(oPrepl)}`);
  const dZajem = denHovoru(2, 20, 'zajem');
  const zajem = await radekDne(mikulas, dZajem, 2);
  const oZajem = ocekDne(2, dZajem);
  over('D2', sedi(zajem, oZajem) && zajem.zajem === 1 && zajem.reached >= 1 && zajem.conversion > 0 && zajem.sold === 0,
    'den zájmu: hovor, dovoláno, zájem a konverze toho dne; prodáno ne (prodalo se jindy)', `${JSON.stringify(zajem)} / ${JSON.stringify(oZajem)}`);
  const dNerel = denHovoru(2, 13, 'nerelevantni');
  const nerel = await radekDne(mikulas, dNerel, 2);
  const oNerel = ocekDne(2, dNerel);
  over('D3', sedi(nerel, oNerel) && nerel.nerelevantni === 1, 'den nerelevantního hovoru (do dovoláno se nepočítá)',
    `${JSON.stringify(nerel)} / ${JSON.stringify(oNerel)}`);
  const prodeje = (await api.statistikyVolani(petra)).vydelek.prodeje;
  const p20 = prodeje.find((x) => x.kontakt_id === 20);
  const denProdeje = P.prahaDen(p20.prodano_at);
  // prodáno podle dne prodeje (kontakt_prodej), ne podle dne hovoru
  const prodejDen = await radekDne(mikulas, denProdeje, 2);
  over('D4', prodejDen && prodejDen.sold === 1, 'den prodeje Chalupy Na Vršku: prodáno 1', `${denProdeje} ${JSON.stringify(prodejDen)}`);
  // součet přes dny = celkem (hovory, zájem, nedovoláno, nerelevantní, přeplánováno i prodáno)
  const celkem = (await api.allStats(mikulas)).find((u) => u.user_id === 2);
  const soucet = { calls: 0, zajem: 0, nedovolano: 0, nerelevantni: 0, preplanovano: 0, sold: 0 };
  // každý den jen jednou: krok 24 h přes změnu času (25h den v říjnu) dá kolem půlnoci tentýž pražský den dvakrát
  // (změřeno 27. 10. 2026 ve 23:19: 25. 10. by se započítal dvakrát); data mají časy „teď minus N × 24 h“,
  // takže množina dnů den(i × 24 h) obsahuje den každého hovoru právě jednou
  const dny = new Set();
  for (let i = 0; i <= 60; i++) dny.add(den(i * DEN_MS));
  for (const d of dny) {
    const r = await radekDne(mikulas, d, 2);
    for (const k of Object.keys(soucet)) soucet[k] += r?.[k] ?? 0;
  }
  over('D5', Object.keys(soucet).every((k) => soucet[k] === celkem[k]) && celkem.calls > 0 && celkem.sold === 2,
    'součet dnů za 61 dní = celkem (Petra má všechno v tom rozsahu)', `${JSON.stringify(soucet)} / ${JSON.stringify(celkem)}`);
  // bez dne stejné jako my_stats a statistiky_volani (jako server, test 056 56b3 a 56b4)
  const moje = await api.myStats(petra);
  const sv = await api.statistikyVolani(petra);
  over('D6', ['calls', 'reached', 'zajem', 'odmitnuto', 'nedovolano', 'conversion', 'sold'].every((k) => moje[k] === celkem[k])
    && celkem.nerelevantni === sv.nerelevantni && celkem.preplanovano === sv.preplanovano,
    'celkem: all_stats = my_stats a nerelevantní a přeplánované = statistiky_volani', `${JSON.stringify(moje)} / ${JSON.stringify(celkem)}`);
  over('D7', (await api.allStats(mikulas, den(DEN_MS))).length === (await api.allStats(mikulas)).length,
    'za den i celkem stejní lidé (řádek i bez hovorů)');
  const prazdny = await radekDne(mikulas, '2020-01-01', 2);
  over('D8', prazdny && prazdny.calls === 0 && prazdny.sold === 0 && prazdny.conversion === 0, 'den bez hovorů: nuly', JSON.stringify(prazdny));
  await chyba('D9', () => api.allStats(petra, den(DEN_MS)), presne('Statistiky ostatních vidí jen super admin.'), 'Volající den nedostane (stejná hláška jako bez dne)');
  await chyba('D10', () => api.allStats(mikulas, 'zitra'), presne('invalid input syntax for type date: "zitra"'), 'nečitelný den odmítne (jako Postgres)');
  // den v Praze: hovor těsně po pražské půlnoci patří k novému dni (jako server; den = prahaDen)
  const h = (await api.allStats(albert, P.prahaDen(new Date()))).find((u) => u.user_id === 2);
  over('D11', h && typeof h.calls === 'number', 'Albert (majitel) den vidí');
});

/* ---------------- F) Moji klienti: filtry jako Kontakty (mock = my_kontakty z 056) ---------------- */
await blok('F', async () => {
  const vse = await api.myKontakty(mikulas, 2000, 0, 2);
  const klientiPetry = new Set(ids(vse));
  over('F0', vse.total === vse.rows.length && klientiPetry.size >= 8 && vse.rows.every((r) => 'cekani_kind' in r && 'cekani_kos' in r),
    'super admin vidí klienty Petry s čekáním v řádcích', `${vse.total} ${JSON.stringify(vse.rows[0]).slice(0, 120)}`);
  const stare = await api.myKontakty(mikulas, 2000, 0, 2, null, null);
  over('F0b', stejne(ids(stare), ids(vse)), 'bez filtrů (null) totéž jako bez parametru (stará appka)');
  // shoda s listKontakty se stejným filtrem omezeným na klienty Petry
  const sady = [
    { status: 'nedovolano' }, { rating: 'A' }, { status: 'zaplaceno', rating: 'A' }, { cekani: 'ceka_prvni' },
    { cekani: 'ceka_prvni', kos: 'k_zavolani' }, { search: 'Nebral' }, { search: 'Petra' }, { search: 'Honza' },
    { search: 'example.cz' }, { search: '11111111' }, { search: '2222' },
  ];
  for (const fl of sady) {
    const m = await api.myKontakty(mikulas, 2000, 0, 2, null, fl);
    const l = await api.listKontakty(mikulas, { ...fl, limit: 1000 });
    const lv = serazene(ids(l).filter((i) => klientiPetry.has(i)));
    over('F1', stejne(serazene(ids(m)), lv) && m.total === m.rows.length, `filtr ${JSON.stringify(fl)}: Moji klienti = Kontakty omezené na klienty Petry`,
      `${JSON.stringify(serazene(ids(m)))} / ${JSON.stringify(lv)}`);
  }
  const arch = await api.myKontakty(mikulas, 2000, 0, 2, 'architekt', { search: 'Vzorov' });
  over('F2', stejne(ids(arch), [302]), 'segment a hledání dohromady (architektka Vzorová)', JSON.stringify(ids(arch)));
  const zajem = await api.myKontakty(mikulas, 2000, 0, 3, null, { status: 'zajem' });
  over('F3', zajem.rows.length > 0 && zajem.rows.every((r) => r.status === 'zajem') && zajem.total === zajem.rows.length,
    'Honzovi klienti se zájmem: jen stav zájem, total = řádky', JSON.stringify(ids(zajem)));
  // Volající: maska jmen kolegů platí i v hledání (kontakt 2 má v poznámce zápis Honzy)
  const vol = await api.myKontakty(petra, 2000, 0, null, null, { search: 'Honza' });
  const sup = await api.myKontakty(mikulas, 2000, 0, 2, null, { search: 'Honza' });
  over('F4', !ids(vol).includes(2) && ids(sup).includes(2), 'Volající jméno kolegy v poznámce nenajde, super admin ano',
    `${JSON.stringify(ids(vol))} / ${JSON.stringify(ids(sup))}`);
  const volText = await api.myKontakty(petra, 2000, 0, null, null, { search: 'zase nebrali' });
  over('F5', ids(volText).includes(2), 'Volající text poznámky (bez jména kolegy) najde');
  await chyba('F6', () => api.myKontakty(petra, 200, 0, 3, null, { status: 'zajem' }), /^Klienty jiného člověka vidí jen super admin\.$/,
    'Volající s filtrem klienty kolegy nedostane');
  // osobní IČO jen tomu, kdo kontakt smí upravit (028): Mikuláš klienty Petry (pod Albertem) upravit nesmí
  const icoM = await api.myKontakty(mikulas, 2000, 0, 2, null, { search: '11111111' });
  const icoA = await api.myKontakty(albert, 2000, 0, 2, null, { search: '11111111' });
  over('F7', !ids(icoM).includes(302) && ids(icoA).includes(302) && icoM.rows.every((r) => !('ico_osobni' in r)),
    'osobní IČO najde jen ten, kdo kontakt smí upravit (Albert ano, Mikuláš ne)', `${JSON.stringify(ids(icoM))} / ${JSON.stringify(ids(icoA))}`);
});

/* ---------------- R) řazení podle poslední změny (list_kontakty a my_kontakty s p_razeni) ---------------- */
await blok('R', async () => {
  // ⚠ migrace 057: poslední změna je posledni_zmena (nejpozdější z pěti sloupců), NAHRAZUJE updated_at z 056
  const cas = (r) => new Date(r.posledni_zmena ?? r.updated_at).getTime();
  const nerostouci = (rows) => rows.every((r, i) => i === 0 || cas(rows[i - 1]) >= cas(r));
  const neklesajici = (rows) => rows.every((r, i) => i === 0 || cas(rows[i - 1]) <= cas(r));
  // úprava v appce posune poslední změnu: kontakt 4 (klient Petry, upravit smí Albert)
  await api.updateKontakt(albert, 4, { rating: 'B' });
  const nove = await api.myKontakty(mikulas, 2000, 0, 2, null, { razeni: 'zmena_nejnovejsi' });
  const stare = await api.myKontakty(mikulas, 2000, 0, 2, null, { razeni: 'zmena_nejstarsi' });
  over('R1', nove.rows[0]?.id === 4 && nerostouci(nove.rows), 'Moji klienti od nejnovější změny: upravený kontakt první, dál podle změny',
    JSON.stringify(nove.rows.map((r) => [r.id, r.updated_at])).slice(0, 300));
  over('R2', stare.rows[stare.rows.length - 1]?.id === 4 && neklesajici(stare.rows), 'Moji klienti od nejstarší: upravený kontakt poslední');
  const vychozi = await api.myKontakty(mikulas, 2000, 0, 2);
  over('R3', vychozi.rows[0]?.status === 'eskalace', 'bez řazení výchozí pořadí (nejdůležitější nahoře)', vychozi.rows[0]?.status);
  // Kontakty super admina: celé podle změny
  const lk = await api.listKontakty(albert, { razeni: 'zmena_nejnovejsi', limit: 1000 });
  over('R4', lk.rows[0]?.id === 4 && nerostouci(lk.rows), 'Kontakty (Albert) od nejnovější změny');
  // Volající: napřed svoji podle změny, cizí za nimi jen podle id (045), i když se cizí kontakt změnil naposledy
  await api.updateKontakt(albert, 6, { note: 'změna kontaktu, který Petře nepatří' });
  const lp = await api.listKontakty(petra, { razeni: 'zmena_nejnovejsi', limit: 200 });
  const svoje = lp.rows.filter((r) => !r.skryto);
  const cizi = lp.rows.filter((r) => r.skryto);
  const hranice = lp.rows.findIndex((r) => r.skryto);
  over('R5', svoje.length > 0 && cizi.length > 0 && lp.rows.slice(hranice).every((r) => r.skryto) && nerostouci(svoje) && svoje[0].id === 4
    && cizi.every((r, i) => i === 0 || cizi[i - 1].id < r.id),
    'Volající: svoji podle změny napřed, cizí za nimi jen podle id (cizí 6 změněný naposledy první není)',
    JSON.stringify(lp.rows.map((r) => r.id)).slice(0, 200));
  const lps = await api.listKontakty(petra, { razeni: 'zmena_nejstarsi', limit: 200 });
  const svojeS = lps.rows.filter((r) => !r.skryto);
  over('R6', neklesajici(svojeS) && svojeS[svojeS.length - 1].id === 4, 'Volající od nejstarší: svoji podle změny, upravený poslední z nich');
  // ⚠ migrace 057: hláška se čtyřmi hodnotami (jako server 057)
  const NEPLATNE = 'Neplatné řazení: nahodne. Povolené: zmena_nejnovejsi, zmena_nejstarsi, hovor_nejnovejsi, hovor_nejstarsi.';
  await chyba('R7', () => api.listKontakty(albert, { razeni: 'nahodne', limit: 5 }), presne(NEPLATNE), 'neplatné řazení v Kontaktech odmítne hláškou serveru');
  await chyba('R8', () => api.myKontakty(albert, 5, 0, 2, null, { razeni: 'nahodne' }), presne(NEPLATNE), 'neplatné řazení v Moji klienti odmítne hláškou serveru');
  // Honza (Volající) si svoje klienty seřadí taky (server to smí, appka mu výběr nedává)
  const hz = await api.myKontakty(honza, 2000, 0, null, null, { razeni: 'zmena_nejnovejsi' });
  over('R9', nerostouci(hz.rows) && hz.total === hz.rows.length, 'Volající svoje klienty podle změny (server i mock stejně)');
});

/* ---------------- S) co appka posílá serveru (supabase.ts) ---------------- */
await blok('S', async () => {
  odpoved = { status: 200, telo: '[]' };
  odeslano.length = 0;
  await supabaseApi.allStats('t');
  await supabaseApi.allStats('t', null);
  await supabaseApi.allStats('t', '2026-10-25');
  const k = odeslano.map((o) => Object.keys(o.body).sort().join(','));
  over('S1', stejne(k, ['p_token', 'p_token', 'p_den,p_token']) && odeslano[2].body.p_den === '2026-10-25' && odeslano.every((o) => /\/rpc\/all_stats$/.test(o.url)),
    'all_stats: p_den jen u statistik za den (stará DB bez 056 dál funguje)', JSON.stringify(k));
  odpoved = { status: 200, telo: '{"total":0,"rows":[]}' };
  odeslano.length = 0;
  await supabaseApi.listKontakty('t', { limit: 5 });
  await supabaseApi.listKontakty('t', { limit: 5, razeni: null });
  await supabaseApi.listKontakty('t', { limit: 5, razeni: 'zmena_nejstarsi' });
  over('S2', !('p_razeni' in odeslano[0].body) && !('p_razeni' in odeslano[1].body) && odeslano[2].body.p_razeni === 'zmena_nejstarsi',
    'list_kontakty: p_razeni jen když je řazení zvolené', JSON.stringify(odeslano.map((o) => Object.keys(o.body))));
  odeslano.length = 0;
  await supabaseApi.myKontakty('t', 2000, 0, null, null);
  await supabaseApi.myKontakty('t', 2000, 0, 3, 'chata', null);
  await supabaseApi.myKontakty('t', 2000, 0, 3, null, { status: null, rating: null, search: null, cekani: null, kos: null, razeni: null });
  await supabaseApi.myKontakty('t', 2000, 0, 3, null, { status: 'zajem', search: 'x', cekani: 'ceka_prvni', kos: 'k_zavolani', razeni: 'zmena_nejnovejsi' });
  const m = odeslano.map((o) => Object.keys(o.body).sort().join(','));
  over('S3', m[0] === 'p_limit,p_offset,p_token,p_user_id' && m[1] === 'p_limit,p_offset,p_segment,p_token,p_user_id'
    && m[2] === 'p_limit,p_offset,p_token,p_user_id'
    && m[3] === 'p_cekani,p_kos,p_limit,p_offset,p_razeni,p_search,p_status,p_token,p_user_id' && odeslano[3].body.p_status === 'zajem',
    'my_kontakty: bez filtrů přesně jako dřív, filtry jen zapnuté', JSON.stringify(m));
  // server bez 056: PGRST202 jen u nových parametrů se srozumitelnou hláškou, jinak hláška serveru
  odpoved = { status: 404, telo: '{"code":"PGRST202","message":"Could not find the function public.all_stats(p_den, p_token) in the schema cache"}' };
  await chyba('S4', () => supabaseApi.allStats('t', '2026-10-25'), presne(BEZ_056_DEN), 'stará DB: den řekne, že server statistiky za den ještě neumí');
  await chyba('S5', () => supabaseApi.allStats('t'), /Could not find the function/, 'bez dne zůstane hláška serveru');
  await chyba('S6', () => supabaseApi.listKontakty('t', { limit: 5, razeni: 'zmena_nejnovejsi' }), presne(BEZ_056_RAZENI), 'stará DB: řazení řekne, že ho server neumí');
  await chyba('S7', () => supabaseApi.myKontakty('t', 5, 0, 3, null, { status: 'zajem' }), presne(BEZ_056_FILTRY), 'stará DB: filtry Moji klienti řeknou, že je server neumí');
  await chyba('S8', () => supabaseApi.myKontakty('t', 5, 0, 3, null, null), /Could not find the function/, 'bez filtrů zůstane hláška serveru');
  odpoved = { status: 200, telo: '[]' };
  over('S9', /056/.test(BEZ_056_DEN) && /056/.test(BEZ_056_RAZENI) && /056/.test(BEZ_056_FILTRY), 'hlášky jmenují migraci 056');
});

/* ---------------- U) stránky (zapojení; klikání měří e2e) ---------------- */
await blok('U', async () => {
  const stats = readFileSync(join(ROOT, 'src/pages/StatsPage.tsx'), 'utf8');
  over('U1', /\{isSuper && \(\s*<div className="field stats-obdobi">/.test(stats), 'Statistiky: výběr dne jen pod super adminem');
  over('U2', /if \(!isSuper\) return;\s*if \(den === null\) return;[\s\S]{0,120}\.allStats\(session\.token, den\)/.test(stats),
    'Statistiky: allStats se dnem jen za super admina a jen se zvoleným dnem');
  const moji = readFileSync(join(ROOT, 'src/pages/MojiPage.tsx'), 'utf8');
  over('U3', /const isSuper = isSuperAdmin\(session\.role\);/.test(moji) && /isSuper\s*\?\s*\{\s*status: status \|\| null,/.test(moji)
    && /:\s*null,\s*\[isSuper, status, rating, hledani, cekani, kos, razeni\]/.test(moji),
    'Moji klienti: filtry jen za super admina (ostatním null = jako dřív)');
  over('U4', /\{isSuper \? \(/.test(moji) && /placeholder="Hledat jméno, studio, město, telefon, web, e-mail, poznámku…"/.test(moji),
    'Moji klienti: Volajícímu původní hledání beze změny');
  const admin = readFileSync(join(ROOT, 'src/pages/AdminPage.tsx'), 'utf8');
  over('U5', /<RazeniSelect\s+value=\{razeni\}/.test(admin) && /razeni: razeni \|\| null,/.test(admin), 'Kontakty: výběr řazení jde do list_kontakty');
  // ⚠ migrace 057: čtyři volby (NAHRAZUJE „dvě volby“ z 056)
  over('U6', U.RAZENI_LABELS.zmena_nejnovejsi === 'Podle poslední změny (od nejnovější)' && U.RAZENI_LABELS.zmena_nejstarsi === 'Podle poslední změny (od nejstarší)'
    && U.RAZENI_LABELS.hovor_nejnovejsi === 'Podle posledního hovoru (od nejnovějšího)' && U.RAZENI_LABELS.hovor_nejstarsi === 'Podle posledního hovoru (od nejstaršího)'
    && U.ALL_RAZENI.length === 4, 'popisky řazení česky, čtyři volby');
  over('U7', U.formatDenSRokem('2026-10-25') === 'neděle 25. 10. 2026', 'den s rokem česky', U.formatDenSRokem('2026-10-25'));
});

/* ---------------- H) migrace 057: poslední změna i od automatizace a řazení podle posledního hovoru ---------------- */
await blok('H', async () => {
  const stav = () => globalThis.__volackaDemoTest.stav();
  const ms = (x) => (x ? new Date(x).getTime() : null);
  const nejpozdeji = (r) => Math.max(...[r.updated_at, r.status_changed_at, r.first_proposal_at, r.last_our_reply_at, r.last_client_reply_at]
    .filter(Boolean).map((x) => new Date(x).getTime()));
  const hovorVsech = (kid) => {
    const h = stav().callLog.filter((l) => l.kontakt_id === kid).map((l) => ms(l.created_at));
    return h.length ? Math.max(...h) : null;
  };
  const hovorKoho = (kid, uid) => {
    const h = stav().callLog.filter((l) => l.kontakt_id === kid && l.user_id === uid).map((l) => ms(l.created_at));
    return h.length ? Math.max(...h) : null;
  };
  // H1: super admin, Kontakty od nejnovější změny: každý řádek má posledni_zmena = nejpozdější z pěti sloupců, řazení podle ní
  const lz = await api.listKontakty(albert, { razeni: 'zmena_nejnovejsi', limit: 1000 });
  const spatne = lz.rows.filter((r) => ms(r.posledni_zmena) !== nejpozdeji(r)).map((r) => r.id);
  over('H1', lz.rows.length > 10 && spatne.length === 0 && lz.rows.every((r, i) => i === 0 || ms(lz.rows[i - 1].posledni_zmena) >= ms(r.posledni_zmena)),
    'poslední změna = nejpozdější z updated_at, změny stavu, návrhu a odpovědí; řazení podle ní', JSON.stringify(spatne));
  // H2: Chalupa Na Vršku (20) schválená tento týden automatizací (změna stavu), appka ji naposledy změnila před 5 dny:
  // poslední změna je změna stavu a v řazení je před všemi, které se naposledy změnily dřív
  const r20 = lz.rows.find((r) => r.id === 20);
  const s20 = stav().kontakty.find((c) => c.id === 20);
  over('H2', !!r20 && ms(r20.posledni_zmena) === ms(s20.status_changed_at) && ms(r20.updated_at) < ms(r20.posledni_zmena)
    && lz.rows.slice(lz.rows.indexOf(r20) + 1).every((r) => ms(r.posledni_zmena) <= ms(r20.posledni_zmena)),
    'změna stavu od automatizace (bez updated_at) je poslední změnou a posune kontakt nahoru', JSON.stringify(r20 && [r20.updated_at, r20.posledni_zmena]));
  // H3, H4: super admin podle posledního hovoru (hovory všech): s hovorem napřed (od nejnovějšího, od nejstaršího), bez hovoru na konci
  const lh = await api.listKontakty(albert, { razeni: 'hovor_nejnovejsi', limit: 1000 });
  const sH = lh.rows.filter((r) => r.posledni_hovor);
  const hranice = lh.rows.findIndex((r) => !r.posledni_hovor);
  over('H3', sH.length >= 10 && hranice === sH.length && lh.rows.slice(hranice).every((r) => r.posledni_hovor === null)
    && sH.every((r, i) => i === 0 || ms(sH[i - 1].posledni_hovor) >= ms(r.posledni_hovor)) && lh.rows.every((r) => ms(r.posledni_hovor) === hovorVsech(r.id)),
    'super admin od posledního hovoru: hovory všech lidí, od nejnovějšího, kontakty bez hovoru na konci', JSON.stringify(lh.rows.map((r) => r.id)).slice(0, 200));
  const ls = await api.listKontakty(albert, { razeni: 'hovor_nejstarsi', limit: 1000 });
  const sS = ls.rows.filter((r) => r.posledni_hovor);
  over('H4', sS.length === sH.length && ls.rows.findIndex((r) => !r.posledni_hovor) === sS.length
    && sS.every((r, i) => i === 0 || ms(sS[i - 1].posledni_hovor) <= ms(r.posledni_hovor)),
    'od nejstaršího hovoru: s hovorem napřed od nejstaršího, bez hovoru taky na konci');
  // H5: Volající Petra v Kontaktech podle hovoru: napřed svoji podle JEJÍHO posledního hovoru (hovor kolegy se nepočítá:
  // kontakt 2 jí Honza volal později než ona), cizí za nimi jen podle id a bez klíčů posledni_zmena a posledni_hovor (045)
  const lp = await api.listKontakty(petra, { razeni: 'hovor_nejnovejsi', limit: 200 });
  const svoje = lp.rows.filter((r) => !r.skryto);
  const cizi = lp.rows.filter((r) => r.skryto);
  const r2 = svoje.find((r) => r.id === 2);
  const sHovorem = svoje.filter((r) => r.posledni_hovor);
  over('H5', !!r2 && ms(r2.posledni_hovor) === hovorKoho(2, 2) && hovorVsech(2) > hovorKoho(2, 2)
    && svoje.every((r) => ms(r.posledni_hovor) === hovorKoho(r.id, 2))
    && sHovorem.every((r, i) => i === 0 || ms(sHovorem[i - 1].posledni_hovor) >= ms(r.posledni_hovor))
    && lp.rows.slice(0, svoje.length).every((r) => !r.skryto) && cizi.length > 0
    && cizi.every((r, i) => (i === 0 || cizi[i - 1].id < r.id) && !('posledni_hovor' in r) && !('posledni_zmena' in r)),
    'Volající: do posledního hovoru jen jeho hovory, svoji napřed, cizí jen podle id a bez času změny i hovoru',
    JSON.stringify({ r2: r2 && r2.posledni_hovor, poradi: lp.rows.map((r) => r.id).slice(0, 30) }));
  // H6: Moji klienti: Volající (sám) jen svoje hovory, super admin pro Petru hovory všech (kontakt 2 s Honzovým hovorem)
  const mp = await api.myKontakty(petra, 2000, 0, null, null, { razeni: 'hovor_nejnovejsi' });
  const mm = await api.myKontakty(mikulas, 2000, 0, 2, null, { razeni: 'hovor_nejnovejsi' });
  const m2p = mp.rows.find((r) => r.id === 2);
  const m2m = mm.rows.find((r) => r.id === 2);
  over('H6', !!m2p && !!m2m && ms(m2p.posledni_hovor) === hovorKoho(2, 2) && ms(m2m.posledni_hovor) === hovorVsech(2)
    && mp.rows.every((r) => ms(r.posledni_hovor) === hovorKoho(r.id, 2)) && mm.rows.every((r) => ms(r.posledni_hovor) === hovorVsech(r.id))
    && mm.rows.every((r) => ms(r.posledni_zmena) === nejpozdeji(r)),
    'Moji klienti: Volající jen svoje hovory, super admin hovory všech; poslední změna jako v Kontaktech',
    JSON.stringify([m2p?.posledni_hovor, m2m?.posledni_hovor]));
  // H7: co appka posílá (hovor_* jen zvolené) a server bez 057 (056 hovor_* odmítne, bez 056 PGRST202): srozumitelná hláška
  odpoved = { status: 200, telo: '{"total":0,"rows":[]}' };
  odeslano.length = 0;
  await supabaseApi.listKontakty('t', { limit: 5, razeni: 'hovor_nejnovejsi' });
  await supabaseApi.myKontakty('t', 2000, 0, 3, null, { razeni: 'hovor_nejstarsi' });
  over('H7', odeslano[0]?.body.p_razeni === 'hovor_nejnovejsi' && odeslano[1]?.body.p_razeni === 'hovor_nejstarsi', 'hovor_* jde na server jako p_razeni');
  odpoved = { status: 400, telo: '{"code":"P0001","message":"Neplatné řazení: hovor_nejnovejsi. Povolené: zmena_nejnovejsi, zmena_nejstarsi."}' };
  await chyba('H8', () => supabaseApi.listKontakty('t', { limit: 5, razeni: 'hovor_nejnovejsi' }), presne(BEZ_057_HOVOR), 'server 056: řazení podle hovoru řekne, že ho server ještě neumí');
  odpoved = { status: 400, telo: '{"code":"P0001","message":"Neplatné řazení: hovor_nejstarsi. Povolené: zmena_nejnovejsi, zmena_nejstarsi."}' };
  await chyba('H8', () => supabaseApi.myKontakty('t', 5, 0, 3, null, { razeni: 'hovor_nejstarsi' }), presne(BEZ_057_HOVOR), 'server 056: v Moji klienti taky');
  odpoved = { status: 404, telo: '{"code":"PGRST202","message":"Could not find the function public.list_kontakty in the schema cache"}' };
  await chyba('H8', () => supabaseApi.listKontakty('t', { limit: 5, razeni: 'hovor_nejnovejsi' }), presne(BEZ_057_HOVOR), 'server bez 056: řazení podle hovoru stejná hláška');
  await chyba('H8', () => supabaseApi.listKontakty('t', { limit: 5, razeni: 'zmena_nejnovejsi' }), presne(BEZ_056_RAZENI), 'server bez 056: řazení podle změny dál hláška 056');
  odpoved = { status: 400, telo: '{"code":"P0001","message":"Podle volajícího můžete filtrovat jen sebe."}' };
  await chyba('H8', () => supabaseApi.listKontakty('t', { limit: 5, razeni: 'hovor_nejnovejsi', caller: 'X' }), /^Podle volajícího/, 'jiná chyba serveru zůstane');
  odpoved = { status: 200, telo: '[]' };
  over('H9', /057/.test(BEZ_057_HOVOR), 'hláška jmenuje migraci 057');
  // H10: pomocníci a stránky
  over('H10', U.zmenenoKdy({ updated_at: '2026-10-20T10:00:00Z', posledni_zmena: '2026-10-25T10:00:00Z' }) === '2026-10-25T10:00:00Z'
    && U.zmenenoKdy({ updated_at: '2026-10-20T10:00:00Z' }) === '2026-10-20T10:00:00Z'
    && U.zmenenoKdy({ updated_at: '2026-10-28T10:00:00Z', posledni_zmena: '2026-10-25T10:00:00Z' }) === '2026-10-28T10:00:00Z'
    && U.hovorNadpis(true) === 'Můj poslední hovor' && U.hovorNadpis(false) === 'Poslední hovor'
    && U.RAZENI_LABELS_MOJE.hovor_nejnovejsi === 'Podle mého posledního hovoru (od nejnovějšího)',
    'Změněno = posledni_zmena (jinak updated_at, novější vyhraje), popisky sloupce a řazení pro Volajícího');
  const admin = readFileSync(join(ROOT, 'src/pages/AdminPage.tsx'), 'utf8');
  const moji = readFileSync(join(ROOT, 'src/pages/MojiPage.tsx'), 'utf8');
  over('H11', /jenMojeHovory=\{!isSuper\}/.test(admin) && /\{jenZaklad\(r\) \? <Skryto \/> : formatDateTime\(zmenenoKdy\(r\)\)\}/.test(admin)
    && /\{jenZaklad\(r\) \? <Skryto \/> : formatDateTime\(r\.posledni_hovor \?\? null\)\}/.test(admin) && /\{hovorNadpis\(!isSuper\)\}/.test(admin),
    'Kontakty: Změněno z posledni_zmena, sloupec posledního hovoru (u cizího pomlčka), Volajícímu „Můj poslední hovor“');
  over('H12', /\{formatDateTime\(zmenenoKdy\(r\)\)\}/.test(moji) && /\{formatDateTime\(r\.posledni_hovor \?\? null\)\}/.test(moji)
    && /\{hovorNadpis\(!isSuper\)\}/.test(moji), 'Moji klienti: Změněno z posledni_zmena a sloupec posledního hovoru');
});

if (chyby === 0) {
  console.log(`ALL OK (${pocet} kontrol)`);
  process.exit(0);
}
console.log(`CHYB: ${chyby} z ${pocet}`);
process.exit(1);
