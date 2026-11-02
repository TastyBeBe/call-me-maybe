// Test chování: migrace 056 (Albert 27. 10. 2026): statistiky za jeden den (super admin), v Moji klienti stejné filtry
// jako v Kontaktech (jen super admin) a řazení podle poslední změny v obou seznamech.
// ⚠ Migrace 057 (Albert 28. 10. 2026: „both filters. One for the latest change regarding anything … and the second one
// should be just the last time they were called“): poslední změna = nejpozdější z updated_at, status_changed_at,
// first_proposal_at, last_our_reply_at a last_client_reply_at (klíč posledni_zmena, sloupec Změněno) a řazení podle
// posledního hovoru (posledni_hovor; Volajícímu jen jeho hovory). Blok H; bloky R, S a U upravené (čtyři hodnoty řazení).
// ⚠ Migrace 060 (Albert 1. 11. 2026: označení k zavolání, hvězda, stejné kombinovatelné filtry v Kontaktech, Moji klienti
// i Označených, přehled klienta): blok O měří mock proti db/migration_060_oznaceni_hvezda.sql (test db/tests/test_060_oznaceni.sql),
// co supabase.ts posílá a stránky; bloky R a U upravené (šest hodnot řazení, filtry Moji klienti pro každého).
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
        "export { BEZ_060_FILTRY, BEZ_060_RAZENI, BEZ_060_OZNACENE, BEZ_060_HOVOR, BEZ_060_HVEZDA, BEZ_060_PREHLED } from './src/api/supabase.ts';",
        // migrace 061: pátý výsledek dovolání proti serveru bez 061
        "export { BEZ_061_JINE } from './src/api/supabase.ts';",
        "export * as prahaModul from './src/praha.ts';",
        "export * as uiModul from './src/ui.tsx';",
        // migrace 060: stav filtrů a jeho převod na parametry serveru, okno Zavolal/a jsem
        "export * as filtryModul from './src/filtry.ts';",
        "export * as dovolaniModul from './src/components/DovolaniOkno.tsx';",
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
const { BEZ_060_FILTRY, BEZ_060_RAZENI, BEZ_060_OZNACENE, BEZ_060_HOVOR, BEZ_060_HVEZDA, BEZ_060_PREHLED, filtryModul: FM, dovolaniModul: DM } = bundle;
const { BEZ_061_JINE } = bundle;

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
  // ⚠ migrace 057: hláška se čtyřmi hodnotami (jako server 057); ⚠ migrace 060 (Albert 1. 11. 2026): i mlceni a hvezda
  // (NAHRAZUJE čtyři hodnoty)
  const NEPLATNE = 'Neplatné řazení: nahodne. Povolené: zmena_nejnovejsi, zmena_nejstarsi, hovor_nejnovejsi, hovor_nejstarsi, mlceni, hvezda.';
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
  // ⚠ migrace 060 (Albert 1. 11. 2026: „Callers get ALL filters in Moji klienti too … but only over their own clients“)
  // NAHRAZUJE U3 „filtry jen za super admina (ostatním null)“ a U4 „Volajícímu původní hledání beze změny“: sdílený řádek
  // filtrů má každý, filtry jdou serveru za každého (jen zapnuté), hledání na serveru i za Volajícího
  over('U3', /const isSuper = isSuperAdmin\(session\.role\);/.test(moji) && /<SeznamFiltry\s[\s\S]{0,600}className="moji-filtry"/.test(moji)
    && /\.\.\.filtryNaServer\(stav\),\s*search: hledani \|\| null,/.test(moji) && !/isSuper\s*\?\s*\{\s*status:/.test(moji)
    && /getApi\(\)\.myKontakty\(session\.token, MOJI_LIMIT, 0, kdo, segment \|\| null, filtry\)/.test(moji),
    'Moji klienti: filtry a řazení každý (sdílený řádek filtrů), serveru jen zapnuté');
  over('U4', !/if \(!isSuper\) return;\s*const t = setTimeout/.test(moji) && /setTimeout\(\(\) => setHledani\(search\.trim\(\)\), 300\)/.test(moji)
    && !/placeholder="Hledat jméno, studio, město, telefon, web, e-mail, poznámku…"/.test(moji),
    'Moji klienti: hledání jde na server se zpožděním i za Volajícího (ne v načtených řádcích)');
  const admin = readFileSync(join(ROOT, 'src/pages/AdminPage.tsx'), 'utf8');
  over('U5', /<RazeniSelect\s+value=\{razeni\}/.test(admin) && /razeni: razeni \|\| null,/.test(admin), 'Kontakty: výběr řazení jde do list_kontakty');
  // ⚠ migrace 057: čtyři volby (NAHRAZUJE „dvě volby“ z 056); ⚠ migrace 060 (Albert 1. 11. 2026): šest voleb, i „Nejdéle bez
  // odpovědi“ a „Hvězda nejdřív“ (NAHRAZUJE „čtyři volby“)
  over('U6', U.RAZENI_LABELS.zmena_nejnovejsi === 'Podle poslední změny (od nejnovější)' && U.RAZENI_LABELS.zmena_nejstarsi === 'Podle poslední změny (od nejstarší)'
    && U.RAZENI_LABELS.hovor_nejnovejsi === 'Podle posledního hovoru (od nejnovějšího)' && U.RAZENI_LABELS.hovor_nejstarsi === 'Podle posledního hovoru (od nejstaršího)'
    && U.RAZENI_LABELS.mlceni === 'Nejdéle bez odpovědi' && U.RAZENI_LABELS.hvezda === 'Hvězda nejdřív'
    && U.ALL_RAZENI.length === 6, 'popisky řazení česky, šest voleb');
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

/* ---------------- O) migrace 060: označení k zavolání, hvězda, kombinovatelné filtry, přehled (Albert 1. 11. 2026) ---------------- */
// Server: db/migration_060_oznaceni_hvezda.sql (test db/tests/test_060_oznaceni.sql). Mock musí počítat stejně: pracovní dny
// v Praze se svátky, označení jen pro toho, kdo opravdu neodpověděl (odmítnutí se slevou ne, nabídka z připomínky kampaně
// ano), vlastník = poslední zájem, Volající jen svoje označení a filtry jen nad svými klienty (cizí kontakt nikdy nesedí
// a nové klíče nenese), dovolání mimo call_log. Demo klienti k označení mlčí aspoň 15 dní, takže test nezávisí na dni.
// Běží poslední (mění data: dovolání, hvězdy, zrušené označení).
await blok('O', async () => {
  const stavO = () => globalThis.__volackaDemoTest.stav();
  const dnes = P.prahaDen(new Date());
  const otevrena = () => stavO().oznaceni.filter((o) => o.uzavreno_at === null);
  const oznaceniKontaktu = (kid) => otevrena().find((o) => o.kontakt_id === kid);
  const lk = async (tok, fl) => api.listKontakty(tok, { limit: 1000, ...fl });
  const radekA = async (id) => (await lk(albert, {})).rows.find((r) => r.id === id);

  // O1 pracovní dny jako server (pracovni_dny_mezi, pracovni_den_po, svátky 2026 až 2028)
  over('O1', P.pracovniDnyMezi('2026-11-02', '2026-11-10') === 5 && P.pracovniDnyMezi('2026-11-02', '2026-11-09') === 4
    && P.pracovniDnyMezi('2026-11-02', '2026-11-03') === 0 && P.pracovniDnyMezi('2026-11-10', '2026-11-02') === 0
    && !P.jePracovniDen('2026-11-17') && !P.jePracovniDen('2026-09-28') && !P.jePracovniDen('2026-11-07') && P.jePracovniDen('2026-11-16')
    && P.pracovniDenPo('2026-11-10', 5) === '2026-11-18' && P.pracovniDenPo('2026-12-23', 1) === '2026-12-28'
    && P.SVATKY.length === 39 && P.SVATKY.includes('2027-03-26') && P.SVATKY.includes('2028-04-17'),
    'pracovní dny: odesláno po 2. 11. = označený út 10. 11. (5 dní), 17. 11. a 28. 9. svátek, n-tý pracovní den, 39 svátků');

  // O2 první běh (jako konec migrace): kdo je označený, kategorie, vlastník, lhůta 10 pracovních dní, zavadeci
  const cekane = { 90: ['navrh', null], 91: ['navrh', null], 92: ['zmeny', null], 5: ['navrh', 3], 303: ['navrh', 3], 93: ['navrh', 2],
    94: ['zmeny', 2], 96: ['navrh', 3], 97: ['navrh', 4] };
  const o0 = otevrena();
  const ids0 = o0.map((o) => o.kontakt_id).sort((a, b) => a - b);
  over('O2', JSON.stringify(ids0) === JSON.stringify(Object.keys(cekane).map(Number).sort((a, b) => a - b))
    && o0.every((o) => o.kategorie === cekane[o.kontakt_id][0] && o.volajici_id === cekane[o.kontakt_id][1] && o.zavadeci === true
      && o.lhuta_do === P.pracovniDenPo(dnes, 10) && o.pokusy === 0),
    'první běh: označení 90, 91, 92, 5, 303, 93, 94, 96, 97 se správnou kategorií, vlastníkem a lhůtou 10 pracovních dní',
    JSON.stringify(o0.map((o) => [o.kontakt_id, o.kategorie, o.volajici_id, o.lhuta_do])));
  over('O2b', !oznaceniKontaktu(95) && !oznaceniKontaktu(98) && oznaceniKontaktu(96)?.volajici_id === 3,
    'neoznačený: 95 (návrh před 2 dny), 98 (odmítl, sleva); 96 patří Honzovi (poslední zájem), i když mu volala i Petra');
  over('O2c', oznaceniKontaktu(93)?.mlci_od === stavO().kontakty.find((k) => k.id === 93).first_proposal_at
    && oznaceniKontaktu(94)?.mlci_od === stavO().kontakty.find((k) => k.id === 94).last_our_reply_at,
    'mlčí od: u návrhu první návrh, u změn naše poslední zpráva');

  // O3 Kontakty super admina: nové klíče a filtry (A ZÁROVEŇ, hodnoty NEBO)
  const vseA = await lk(albert, {});
  const r93 = vseA.rows.find((r) => r.id === 93);
  over('O3', vseA.rows.every((r) => 'mlci_pd' in r && 'ozn_kategorie' in r && 'hvezda_at' in r)
    && r93?.ozn_kategorie === 'navrh' && r93?.ozn_lhuta_do === P.pracovniDenPo(dnes, 10) && r93?.ozn_pokusy === 0 && r93?.mlci_pd >= 5 && !!r93?.hvezda_at
    && vseA.rows.find((r) => r.id === 95)?.mlci_pd <= 1 && vseA.rows.find((r) => r.id === 95)?.ozn_kategorie === null
    && vseA.rows.find((r) => r.id === 1)?.mlci_pd === null,
    'Kontakty (Albert): každý řádek nese mlci_pd, ozn_* a hvezda_*; 93 označený s lhůtou, 95 mlčí krátce bez označení, 1 nemlčí');
  const idsF = async (tok, fl) => serazene(ids(await lk(tok, fl)));
  over('O3b', stejne(await idsF(albert, { kategorie: ['navrh'] }), [5, 90, 91, 93, 96, 97, 303])
    && stejne(await idsF(albert, { kategorie: ['zmeny'] }), [92, 94])
    && stejne(await idsF(albert, { kategorie: ['navrh', 'zmeny'] }), [5, 90, 91, 92, 93, 94, 96, 97, 303]),
    'filtr označení: na návrh, na změny, oboje (NEBO)');
  const sZnamkou = async (z) => idsF(albert, { znamky: z });
  const vsechny = vseA.rows;
  over('O3c', stejne(await sZnamkou(['bez']), serazene(vsechny.filter((r) => r.rating === null).map((r) => r.id)))
    && stejne(await sZnamkou(['A', 'bez']), serazene(vsechny.filter((r) => r.rating === 'A' || r.rating === null).map((r) => r.id)))
    && stejne(await idsF(albert, { rating: 'B' }), await sZnamkou(['B']))
    && stejne(await idsF(albert, { status: 'navrh_odeslan' }), await idsF(albert, { statusy: ['navrh_odeslan'] }))
    && stejne(await idsF(albert, { statusy: ['sleva_nabidnuta', 'ceka_na_klienta'] }),
      serazene(vsechny.filter((r) => ['sleva_nabidnuta', 'ceka_na_klienta'].includes(r.status)).map((r) => r.id))),
    'známka (i bez známky) a stav víc najednou; jedna hodnota přes staré p_status a p_rating = totéž jako pole');
  const mlciRadky = (mn, mx) => serazene(vsechny.filter((r) => r.mlci_pd !== null && (mn === null || r.mlci_pd >= mn) && (mx === null || r.mlci_pd <= mx)).map((r) => r.id));
  over('O3d', stejne(await idsF(albert, { mlci_min: 5 }), mlciRadky(5, null)) && stejne(await idsF(albert, { mlci_min: 0, mlci_max: 3 }), mlciRadky(0, 3))
    && (await idsF(albert, { mlci_min: 0, mlci_max: 3 })).includes(95) && !(await idsF(albert, { mlci_min: 0 })).includes(1),
    'mlčení od a do včetně; nemlčící se zapnutou mezí nesedí');
  over('O3e', stejne(await idsF(albert, { jen_hvezda: true }), [93]) && stejne(await idsF(albert, { jen_hvezda: true, kategorie: ['zmeny'] }), [])
    && stejne(await idsF(albert, { kategorie: ['navrh'], znamky: ['B'], segment: 'architekt' }), [303])
    && stejne(await idsF(albert, { jen_hvezda: false }), serazene(vsechny.map((r) => r.id))),
    'hvězda a kombinace filtrů (A ZÁROVEŇ); jen_hvezda false = bez filtru');
  // řazení
  const mlc = (await lk(albert, { razeni: 'mlceni' })).rows;
  const sMlcenim = mlc.filter((r) => r.mlci_pd !== null);
  over('O3f', sMlcenim.length > 5 && mlc.slice(0, sMlcenim.length).every((r) => r.mlci_pd !== null) && sMlcenim.every((r, i) => i === 0 || sMlcenim[i - 1].mlci_pd >= r.mlci_pd),
    'řazení nejdéle bez odpovědi: mlčící od nejdelšího, nemlčící na konci');
  const hv = (await lk(albert, { razeni: 'hvezda' })).rows;
  over('O3g', hv[0]?.id === 93 && hv.slice(1).every((r) => !r.hvezda_at), 'řazení hvězda nejdřív: 93 (jediná hvězda) první', hv.slice(0, 3).map((r) => r.id).join());

  // O4 Volající (Petra): nové filtry jen nad jejími klienty, jen její označení; cizí kontakt bez nových klíčů
  const vseP = await lk(petra, {});
  const cizi = vseP.rows.filter((r) => r.skryto);
  over('O4', cizi.length > 5 && cizi.every((r) => !('mlci_pd' in r) && !('ozn_kategorie' in r) && !('hvezda_at' in r) && !('hvezda_kdo' in r) && !('ozn_lhuta_do' in r)),
    'Volající: cizí kontakt nenese mlci_pd, ozn_* ani hvezda_* (allowlist beze změny)');
  for (const fl of [{ kategorie: ['navrh'] }, { kategorie: ['zmeny'] }, { mlci_min: 0 }, { znamky: ['bez'] }, { jen_hvezda: true }, { statusy: ['navrh_odeslan', 'ceka_na_klienta'] }]) {
    const r = await lk(petra, fl);
    over('O4b', r.rows.length > 0 && r.rows.every((x) => x.je_muj === true && !x.skryto), `Volající s filtrem ${JSON.stringify(fl)}: jen jeho klienti`, ids(r).join());
  }
  const p96 = vseP.rows.find((r) => r.id === 96);
  over('O4c', p96?.je_muj === true && p96.ozn_kategorie === null && p96.ozn_lhuta_do === null && typeof p96.mlci_pd === 'number'
    && stejne(await idsF(petra, { kategorie: ['navrh'] }), [93]) && stejne(await idsF(petra, { kategorie: ['zmeny'] }), [94])
    && (await idsF(honza, { kategorie: ['navrh'] })).includes(96),
    '96 je Petřin klient, ale označení je Honzovo: Petra ho bez klíčů označení vidí a filtr označení ho nevrátí, Honzovi ano');
  const ml = (await lk(petra, { razeni: 'mlceni' })).rows;
  const prvniCizi = ml.findIndex((r) => r.skryto);
  over('O4d', prvniCizi > 0 && ml.slice(prvniCizi).every((r) => r.skryto) && ml.slice(prvniCizi).every((r, i, a) => i === 0 || a[i - 1].id < r.id),
    'Volající: řazení podle mlčení jen mezi jeho klienty, cizí za nimi podle id');

  // O5 Moji klienti: stejné filtry nad klienty vybraného člověka; super admin vidí i označení jiného volajícího
  const mp = async (tok, uid, fl) => serazene(ids(await api.myKontakty(tok, 2000, 0, uid, null, fl)));
  over('O5', stejne(await mp(petra, null, { kategorie: ['navrh', 'zmeny'] }), [93, 94])
    && stejne(await mp(albert, 2, { kategorie: ['navrh', 'zmeny'] }), [93, 94, 96])
    && stejne(await mp(petra, null, { jen_hvezda: true }), [93])
    && stejne(await mp(petra, null, { mlci_min: 5 }), serazene((await api.myKontakty(petra, 2000, 0)).rows.filter((r) => r.mlci_pd >= 5).map((r) => r.id))),
    'Moji klienti: Volající jen svoje označení (96 ne), super admin pro Petru i 96 (označení všech)');
  const mm = (await api.myKontakty(albert, 2000, 0, 2)).rows.find((r) => r.id === 96);
  over('O5b', mm?.ozn_kategorie === 'navrh', 'super admin v Moji klienti Petry vidí u 96 Honzovo označení');

  // O6 kontroly vstupu stejné jako server
  await chyba('O6', () => lk(albert, { znamky: ['A', 'X'] }), presne('Neplatná známka ve filtru: A, X. Povolené: A, B, C, bez.'), 'neplatná známka');
  await chyba('O6', () => lk(albert, { kategorie: ['navrh', 'neodpovida'] }), presne('Neplatné označení ve filtru: navrh, neodpovida. Povolené: navrh, zmeny.'), 'neplatné označení');
  await chyba('O6', () => api.myKontakty(albert, 10, 0, null, null, { mlci_min: 9, mlci_max: 3 }), presne('Neplatný rozsah mlčení: od 9 do 3 pracovních dní.'), 'rozsah mlčení od > do');
  await chyba('O6', () => lk(albert, { mlci_max: -1 }), presne('Neplatný rozsah mlčení: od … do -1 pracovních dní.'), 'záporné mlčení');

  // O7 Označené (list_oznacene)
  const lo = async (tok, fl = {}) => api.listOznacene(tok, fl);
  const oP = await lo(petra);
  // ⚠ migrace 061 (Albert 2. 11. 2026: „only the super admins will see this flag“): příznak info_neoverene u 94 Petra
  // nevidí (řádek s jejím označením bez příznaku); NAHRAZUJE „94 v Označených Volajícího s info_neoverene“ z 060
  const r94P = oP.find((r) => r.id === 94);
  over('O7', stejne(serazene(oP.map((r) => r.id)), [93, 94, 302]) && oP.every((r) => !('ozn_volajici' in r) && !('ozn_volajici_id' in r))
    && oP.find((r) => r.id === 302)?.ozn_kategorie === null && oP.find((r) => r.id === 302)?.flag_kind === 'chybi_email'
    && r94P?.ozn_kategorie === 'zmeny' && r94P?.flag_kind === null && r94P?.flag_note === null && r94P?.flagged_at === null && r94P?.flagged_by === null
    && oP[0]?.id === 93 && !JSON.stringify(oP).includes('info_neoverene'),
    'Volající: jeho označení (93, 94 bez příznaku info_neoverene) a jeho klienti s příznakem (302); jméno volajícího u označení nevidí; hvězda první',
    JSON.stringify(oP.map((r) => [r.id, r.ozn_kategorie, r.flag_kind])));
  const sPriznakem = async (tok, fl) => serazene((await lo(tok, fl)).map((r) => r.id));
  over('O7h', stejne(await sPriznakem(petra, { druhy: ['info_neoverene'] }), []) && stejne(await sPriznakem(petra, { druhy: ['info_neoverene', 'chybi_email'] }), [302])
    && (await sPriznakem(albert, { druhy: ['info_neoverene'] })).includes(94) && (await sPriznakem(albert, { druhy: ['info_neoverene'] })).includes(92)
    && !(await api.listFlagged(petra, null, null)).some((r) => r.flag_kind === 'info_neoverene' || r.id === 94)
    && (await api.listFlagged(petra, 'info_neoverene', null)).length === 0 && (await api.listFlagged(albert, 'info_neoverene', null)).some((r) => r.id === 94),
    'druh info_neoverene: Volajícímu filtr nic nenajde ani list_flagged nic nevrátí, super admin a Albert ano (061)');
  const oA = await lo(albert);
  const flagged = stavO().kontakty.filter((k) => k.flag_kind).map((k) => k.id);
  over('O7b', stejne(serazene(oA.map((r) => r.id)), serazene([...new Set([...Object.keys(cekane).map(Number), ...flagged])]))
    && oA.find((r) => r.id === 93)?.ozn_volajici === 'Petra' && oA.find((r) => r.id === 90)?.ozn_volajici === 'bez volajícího' && oA.find((r) => r.id === 302)?.ozn_volajici === null,
    'Albert: všechna označení a všechny příznaky; jméno volajícího, „bez volajícího“, u příznaku null');
  const poradi = oA.map((r) => r.id);
  const prvniPriznak = oA.findIndex((r) => !r.ozn_kategorie);
  over('O7c', poradi[0] === 93 && prvniPriznak > 0 && oA.slice(prvniPriznak).every((r) => !r.ozn_kategorie)
    && oA.slice(1, prvniPriznak).every((r, i, a) => i === 0 || (a[i - 1].mlci_pd ?? -1) >= (r.mlci_pd ?? -1)),
    'výchozí pořadí: s hvězdou, označení před samotnými příznaky, nejdéle mlčící', poradi.join());
  over('O7d', stejne(serazene((await lo(albert, { user_id: 2 })).map((r) => r.id)), [93, 94, 302])
    && stejne(serazene((await lo(albert, { bez_volajiciho: true })).map((r) => r.id)), [90, 91, 92])
    && stejne(serazene((await lo(mikulas, { user_id: 3 })).map((r) => r.id)), [5, 96, 303]),
    'výběr volajícího zúží označení i příznaky; bez volajícího jen označení bez vlastníka a příznaky klientů bez volajícího');
  for (const druhy of [['zmeny'], ['navrh'], ['chybi_email'], ['info_neoverene', 'navrh']]) {
    const s = serazene((await lo(albert, { druhy })).map((r) => r.id));
    const klient = serazene(oA.filter((r) => druhy.includes(r.ozn_kategorie) || druhy.includes(r.flag_kind)).map((r) => r.id));
    over('O7e', stejne(s, klient) && s.length > 0, `druhy ${druhy.join(',')}: server = výběr ze všech řádků (jako pilulky v appce)`, `${s.join()} / ${klient.join()}`);
  }
  over('O7f', stejne(serazene((await lo(albert, { segment: 'architekt' })).map((r) => r.id)), [302, 303])
    && stejne(serazene((await lo(petra, { jen_hvezda: true })).map((r) => r.id)), [93])
    && stejne(serazene((await lo(albert, { hledat: 'kopci' })).map((r) => r.id)), [94])
    && stejne(serazene((await lo(petra, { hledat: 'Honza' })).map((r) => r.id)), []),
    'segment, hvězda a hledání; Volající jméno kolegy v poznámce nenajde');
  await chyba('O7g', () => lo(petra, { bez_volajiciho: true }), presne('Označené klienty bez volajícího vidí jen super admin.'), 'Volající „bez volajícího“ nedostane');
  await chyba('O7g', () => lo(petra, { user_id: 3 }), presne('Označené klienty jiného člověka vidí jen jeho super admin.'), 'Volající cizí klienty nedostane (věta jako list_flagged)');
  await chyba('O7g', () => lo(albert, { user_id: 2, bez_volajiciho: true }), presne('Vyberte buď volajícího, nebo „bez volajícího“, ne obojí.'), 'obojí najednou ne');
  await chyba('O7g', () => lo(albert, { druhy: ['neodpovida'] }), /^Neplatný druh ve filtru: neodpovida\. Povolené: navrh, zmeny, chybi_info/, 'neodpovida už není druh');

  // O8 přehled klienta (kontakt_prehled): jen vlastní klient, fakta, text automatizace
  await chyba('O8', () => api.kontaktPrehled(petra, 3), presne('Přehled klienta vidí jen ten, kdo mu volá, jeho super admin nebo Albert.'), 'cizí kontakt Volající přehled nedostane');
  const pr94 = await api.kontaktPrehled(petra, 94);
  over('O8b', pr94.prehled?.verze === 1 && !!pr94.prehled?.ted && pr94.prehled.klient_chce?.[0]?.zdroj === 'e-mail' && pr94.fakta.oznaceni?.kategorie === 'zmeny'
    && pr94.fakta.oznaceni.volajici === null && pr94.fakta.stav === 'ceka_na_klienta' && pr94.fakta.klient_naposledy && pr94.fakta.mlci_pd >= 5,
    'přehled 94 (Petra): text automatizace, fakta, označení bez jména volajícího');
  const pr93 = await api.kontaktPrehled(albert, 93);
  over('O8c', pr93.fakta.oznaceni?.volajici === 'Petra' && pr93.fakta.hvezda?.kdo === 'Petra' && pr93.prehled === null && pr93.fakta.cena_web === '6 000 Kč',
    'super admin: jméno volajícího u označení, kdo dal hvězdu; bez textu automatizace prehled null');
  const pr97 = await api.kontaktPrehled(mikulas, 97);
  const pr98 = await api.kontaktPrehled(mikulas, 98);
  const k97 = stavO().kontakty.find((k) => k.id === 97);
  over('O8d', pr97.fakta.nabidka?.kampan === true && pr97.fakta.nabidka.archiv_dne === P.posunDen(P.prahaDen(k97.last_our_reply_at), 30)
    && pr97.fakta.nabidka.konci_dne === P.posunDen(P.prahaDen(pr97.fakta.nabidka.odeslana_at), 14) && !!pr97.fakta.pripominka_kampane
    && pr98.fakta.nabidka?.kampan === false && pr98.fakta.nabidka.archiv_dne === null && pr98.fakta.oznaceni === null,
    'nabídka: kampaň s datem archivu (+30 dní od naší zprávy), konec za 14 dní; po odmítnutí bez archivu a bez označení');
  const hovorPred = stavO().callLog.length;
  const statsPred = JSON.stringify(await api.myStats(petra));

  // O9 dovolání (zapis_hovor)
  const NENI = 'Dovolání zapíšete jen u svého klienta, kterého máte v Označených k zavolání. Tenhle mezi nimi není (nebo ho mezitím někdo vyřídil); zapíše ho ten, komu je označený, jeho super admin nebo Albert.';
  await chyba('O9', () => api.zapisHovor(petra, 96, 'nedovolano'), presne(NENI), 'Volající u označení kolegy (96): stejná věta, nepozná čí');
  await chyba('O9', () => api.zapisHovor(petra, 3, 'nedovolano'), presne(NENI), 'Volající u cizího kontaktu: stejná věta');
  await chyba('O9', () => api.zapisHovor(petra, 95, 'nedovolano'), presne(NENI), 'Volající u svého klienta bez označení: stejná věta');
  await chyba('O9', () => api.zapisHovor(albert, 95, 'nedovolano'), /^Kontakt id=95 nemá otevřené označení k zavolání/, 'super admin bez označení: hláška s číslem');
  await chyba('O9', () => api.zapisHovor(petra, 93, 'mluvili', '   '), /^Napište, co klient chce/, 'mluvili bez textu ne');
  await chyba('O9', () => api.zapisHovor(petra, 93, 'zavolano'), presne('Neplatný výsledek dovolání: zavolano. Povolené: nedovolano, nechce, nekontaktovat, mluvili, jine.'),
    'neplatný výsledek (od 061 pět povolených)');
  // migrace 061 (Albert 2. 11. 2026): pátý výsledek „Nic z toho výše“ jen s poznámkou
  await chyba('O9', () => api.zapisHovor(petra, 93, 'jine', '  \n '), presne('Napište, jak hovor dopadl. Bez toho „Nic z toho výše“ zapsat nejde.'), 'jine bez poznámky ne');
  await chyba('O9', () => api.zapisHovor(petra, 93, 'jine', 'x'.repeat(2001)), presne('Poznámka k dovolání je moc dlouhá: nejvýš 2 000 znaků.'), 'jine s poznámkou přes 2 000 znaků ne');
  // recenze 2. 11. 2026: naplánovaný hovor vyřídí dovolání jako hovor z fronty (vlastní hotovo, cizí zrušený), po nedovolání zůstane
  const zitra = new Date(Date.now() + 86400000).toISOString();
  await api.zavolatNaplanovat(petra, 93, zitra, 'zkusit znovu');
  await api.zavolatNaplanovat(petra, 94, zitra, null);
  await api.zavolatNaplanovat(albert, 97, zitra, null, 2);
  const zav = (kid) => stavO().zavolat.filter((z) => z.kontakt_id === kid).map((z) => `${z.stav}: ${z.vysledek ?? ''}`).join(', ');
  const n1 = await api.zapisHovor(petra, 93, 'nedovolano');
  over('O9b', n1.ok && n1.otevrene === true && n1.pokusy === 1 && oznaceniKontaktu(93)?.pokusy === 1 && !!oznaceniKontaktu(93)?.posledni_pokus_at,
    'nedovolal/a jsem se: pokus +1, označení zůstává', JSON.stringify(n1));
  // super admin, který kontakt upravit nesmí (Mikuláš u Petřina klienta pod Albertem): jen „nedovolal/a jsem se“
  await chyba('O9c', () => api.zapisHovor(mikulas, 93, 'mluvili', 'chce web'), presne('Tohle není váš klient — upravit ho může ten, kdo mu volá, jeho super admin nebo Albert.'),
    'super admin bez práva kontakt upravit „mluvili“ nezapíše');
  await chyba('O9c', () => api.zapisHovor(mikulas, 93, 'nedovolano', null, false), /^Tohle není váš klient — upravit ho může/, 'ani hvězdu');
  over('O9c', (await api.zapisHovor(mikulas, 93, 'nedovolano')).pokusy === 2, 'super admin „nedovolal/a jsem se“ zapíše i u cizího označení');
  // migrace 061: poznámka u nedovolání jde automatizaci (poznámka kontaktu a vzkaz do vlákna), označení ZŮSTÁVÁ otevřené
  // (Albert 2. 11. 2026: „it shouldn't be removing the mark“); bez práva kontakt upravit (Mikuláš) jen do historie
  const poznamka93 = stavO().kontakty.find((k) => k.id === 93).note;
  const n3 = await api.zapisHovor(petra, 93, 'nedovolano', 'nebere, zkusím zítra ráno');
  const s93 = stavO();
  over('O9j', n3.otevrene === true && n3.pokusy === 3 && !!oznaceniKontaktu(93) && n3.poznamka_predana === true && n3.vlakno_id !== null
    && s93.kontakty.find((k) => k.id === 93).note === `${poznamka93}\n[${dnes} Petra] Dovolání: Nedovolal/a jsem se: nebere, zkusím zítra ráno`
    && s93.zpravy.some((z) => z.thread_id === n3.vlakno_id && z.sender_type === 'admin' && z.body === 'Dovolání (Petra): Nedovolal/a jsem se: nebere, zkusím zítra ráno'),
    'nedovolal/a jsem se s poznámkou: označení otevřené, pokus +1, poznámka a vzkaz automatizaci s výsledkem napřed', JSON.stringify(n3));
  const n4 = await api.zapisHovor(mikulas, 93, 'nedovolano', 'Mikuláš: nebere');
  over('O9j', n4.otevrene === true && n4.pokusy === 4 && n4.poznamka_predana === false && n4.vlakno_id === null
    && !stavO().kontakty.find((k) => k.id === 93).note.includes('Mikuláš: nebere') && !stavO().zpravy.some((z) => z.body.includes('Mikuláš: nebere')),
    'bez práva kontakt upravit jde poznámka jen do historie (ne do poznámky kontaktu ani do vlákna)', JSON.stringify(n4));
  const n5 = await api.zapisHovor(petra, 93, 'nedovolano');
  over('O9j', n5.otevrene === true && n5.poznamka_predana === null && n5.vlakno_id === null, 'nedovolání bez poznámky: nic automatizaci, označení otevřené', JSON.stringify(n5));
  const text = 'web se mu líbí, chce jinou úvodní fotku';
  const m1 = await api.zapisHovor(petra, 94, 'mluvili', `  ${text}\nhned  `, true);
  const s94 = stavO();
  const k94 = s94.kontakty.find((k) => k.id === 94);
  const vlakno = s94.vlakna.find((v) => v.id === m1.vlakno_id);
  over('O9d', m1.otevrene === false && !oznaceniKontaktu(94) && s94.oznaceni.find((o) => o.kontakt_id === 94)?.uzavreno_duvod === 'hovor'
    && k94.note.endsWith(`\n[${dnes} Petra] Dovolání: ${text} hned`) && vlakno?.kontakt_id === 94
    && s94.zpravy.some((z) => z.thread_id === vlakno.id && z.sender_type === 'admin' && z.body === `Dovolání (Petra): ${text} hned`)
    && !!k94.hvezda_at && m1.hvezda === true && m1.hvezda_zmena === true,
    'mluvili: označení uzavřené (hovor), řádek „[den Petra] Dovolání: …“ v poznámce, vzkaz agentovi do vlákna kontaktu, hvězda', JSON.stringify(m1));
  // ⚠ migrace 061: 94 má jen příznak info_neoverene, který Petra nevidí; po dovolání ho v Označených nemá vůbec, Albert
  // ano (kvůli příznaku). NAHRAZUJE „94 v Označených Volajícího už jen kvůli příznaku“ z 060
  over('O9e', !(await lo(petra)).some((r) => r.id === 94) && (await lo(albert)).some((r) => r.id === 94 && !r.ozn_kategorie && r.flag_kind === 'info_neoverene'),
    'po dovolání 94 Volající v Označených nemá (zbyl jen skrytý příznak), Albert ano kvůli příznaku, bez označení');
  const h1 = await api.zapisHovor(honza, 5, 'nechce', 'chalupu prodává');
  const h2 = await api.zapisHovor(honza, 303, 'nekontaktovat');
  over('O9f', h1.status === 'odmitnuto' && h2.status === 'nekontaktovat' && (await radekA(5))?.status === 'odmitnuto' && (await radekA(303))?.status === 'nekontaktovat'
    && !oznaceniKontaktu(5) && !oznaceniKontaktu(303),
    'nechce = Odmítnuto, nekontaktovat = Nekontaktovat; označení uzavřená');
  // migrace 061: důvod u nechce jde automatizaci i jako poznámka a vzkaz s výsledkem; bez poznámky nic
  const s5 = stavO();
  over('O9f2', h1.poznamka_predana === true && s5.kontakty.find((k) => k.id === 5).note?.endsWith(`[${dnes} Honza] Dovolání: Nechce web: chalupu prodává`)
    && s5.zpravy.some((z) => z.thread_id === h1.vlakno_id && z.body === 'Dovolání (Honza): Nechce web: chalupu prodává')
    && h2.poznamka_predana === null && h2.vlakno_id === null,
    'nechce s poznámkou: řádek „… Dovolání: Nechce web: …“ a vzkaz do vlákna; nekontaktovat bez poznámky nic', JSON.stringify([h1, h2]));
  // migrace 061: „Nic z toho výše“ (jine) s poznámkou: označení uzavřené hovorem, kontakt beze změny stavu, poznámka
  // a vzkaz automatizaci; je to úspěšné dovolání, tatáž epizoda ani nový návrh se znovu neoznačí
  const stav96 = (await radekA(96))?.status;
  const j96 = await api.zapisHovor(honza, 96, 'jine', 'manželka říká, že jsou do prosince v zahraničí');
  await lk(albert, {});
  const s96 = stavO();
  over('O9k', j96.otevrene === false && j96.vysledek === 'jine' && j96.status === stav96 && j96.poznamka_predana === true
    && s96.oznaceni.find((o) => o.kontakt_id === 96 && o.vysledek === 'jine')?.uzavreno_duvod === 'hovor' && !oznaceniKontaktu(96)
    && s96.kontakty.find((k) => k.id === 96).note?.endsWith(`[${dnes} Honza] Dovolání: Nic z toho výše: manželka říká, že jsou do prosince v zahraničí`)
    && s96.zpravy.some((z) => z.thread_id === j96.vlakno_id && z.sender_type === 'admin' && z.body === 'Dovolání (Honza): Nic z toho výše: manželka říká, že jsou do prosince v zahraničí'),
    'jine: uzavře označení (hovor), stav beze změny, poznámka a vzkaz „Nic z toho výše: …“, po obnově se neoznačí znovu', JSON.stringify(j96));
  const a97 = await api.zapisHovor(albert, 97, 'mluvili', 'zavolá v pondělí', true);
  over('O9g', a97.hvezda === true && stavO().kontakty.find((k) => k.id === 97).hvezda_kdo === 'Albert', 'Albert u kteréhokoli označení, i s hvězdou');
  over('O9i', zav(93) === 'ceka: ' && zav(94) === 'hotovo: dovolání: mluvili' && zav(97) === 'zruseno: hovor vyřídilo dovolání v Označených',
    'naplánovaný hovor: po nedovolání zůstává, vlastní po dovolání hotovo, cizí zrušený neutrálně (jako server)', `${zav(93)} | ${zav(94)} | ${zav(97)}`);
  over('O9h', stavO().callLog.length === hovorPred && JSON.stringify(await api.myStats(petra)) === statsPred,
    'dovolání není nový hovor: call_log ani statistiky se nezměnily (Albert: „as one call and as one client still“)');

  // O10 zrušit označení (jen super admin a Albert, s důvodem; tatáž epizoda se znovu neoznačí)
  await chyba('O10', () => api.oznaceniZavrit(petra, 93, 'nechci'), presne('Označení k zavolání ruší jen super admin nebo Albert.'), 'Volající ne');
  await chyba('O10', () => api.oznaceniZavrit(albert, 91, '  '), presne('Napište krátce důvod, proč označení rušíte.'), 'bez důvodu ne');
  const z91 = await api.oznaceniZavrit(albert, 91, 'Majitel zemřel, chatu prodávají.');
  await chyba('O10', () => api.oznaceniZavrit(albert, 91, 'znovu'), presne('Kontakt id=91 nemá otevřené označení k zavolání.'), 'podruhé už není co rušit');
  await lk(albert, {});
  over('O10b', z91.ok && !oznaceniKontaktu(91) && stavO().oznaceni.find((o) => o.kontakt_id === 91)?.uzavreno_duvod === 'rucne',
    'zrušené ručně (rucne) a tatáž epizoda se po obnově znovu neoznačí');

  // O11 hvězda (nastav_hvezdu): kdo smí upravit; maska kdo; důvod
  await chyba('O11', () => api.nastavHvezdu(petra, 3, true), presne('Tohle není váš klient: u kontaktu, kterému jste nevolal/a, hvězdu nevidíte ani neměníte. Dá ji ten, kdo mu volá, jeho super admin nebo Albert.'),
    'Volající u cizího kontaktu');
  await chyba('O11', () => api.nastavHvezdu(mikulas, 93, false), presne('Tohle není váš klient — hvězdu mu dá ten, kdo mu volá, jeho super admin nebo Albert.'),
    'super admin bez práva kontakt upravit');
  await chyba('O11', () => api.nastavHvezdu(petra, 95, true, 'x'.repeat(301)), presne('Důvod hvězdy je moc dlouhý: nejvýš 300 znaků.'), 'důvod nejvýš 300 znaků');
  // důvod jmenuje kolegyni Evu, kterou Honza vidět nesmí (maska jmen kolegů jako u poznámky, 045)
  const h96 = await api.nastavHvezdu(petra, 96, true, 'Eva doporučila, chtějí web');
  const hz96 = (await lk(honza, {})).rows.find((r) => r.id === 96);
  const al96 = await radekA(96);
  over('O11b', h96.hvezda_kdo === 'Petra' && h96.hvezda_zmena === true && hz96?.hvezda_kdo === 'jiný volající' && hz96?.hvezda_duvod === 'jiný volající doporučila, chtějí web'
    && al96?.hvezda_kdo === 'Petra' && al96?.hvezda_duvod === 'Eva doporučila, chtějí web',
    'hvězda: kolega vidí „jiný volající“ i v důvodu, super admin jméno', JSON.stringify([hz96?.hvezda_kdo, hz96?.hvezda_duvod]));
  const znovu = await api.nastavHvezdu(petra, 96, true);
  const pryc = await api.nastavHvezdu(petra, 96, false);
  over('O11c', znovu.hvezda_zmena === false && pryc.hvezda_zmena === true && pryc.hvezda_at === null && pryc.hvezda_kdo === null && pryc.hvezda_duvod === null,
    'tatáž hvězda bez nového důvodu nic nemění; odebrání vynuluje všechno');

  // O12 příznak neodpovida končí
  const NAHR = 'Příznak „neodpovídá“ nahradilo označení k zavolání (migrace 060).';
  await chyba('O12', () => api.setFlag(albert, 1, 'neodpovida', 'x'), presne(NAHR), 'set_flag neodpovida odmítne');
  await chyba('O12', () => api.updateKontakt(albert, 1, { flag_kind: 'neodpovida' }), presne(NAHR), 'update_kontakt neodpovida odmítne');
  await chyba('O12', () => api.setFlag(albert, 1, 'xyz', 'x'), presne('Neplatný druh příznaku: xyz. Povolené: chybi_email, email_neoveren, info_neoverene, chybi_info, jine.'), 'výčet druhů bez neodpovida');
  over('O12b', !stavO().kontakty.some((k) => k.flag_kind === 'neodpovida') && !U.VOLITELNE_FLAGS.includes('neodpovida') && U.ALL_FLAGS.includes('neodpovida'),
    'v demu nikdo neodpovida nemá; vybrat ho nejde, popisek zůstává kvůli starému serveru');

  // O13 co appka posílá serveru (supabase.ts): nové parametry jen zapnuté, srozumitelné hlášky proti serveru bez 060
  odpoved = { status: 200, telo: '{"total":0,"rows":[]}' };
  odeslano.length = 0;
  await supabaseApi.listKontakty('t', { limit: 5, statusy: [], znamky: [], kategorie: [], jen_hvezda: false, mlci_min: null, mlci_max: null });
  await supabaseApi.listKontakty('t', { limit: 5, statusy: ['navrh_odeslan', 'ceka_na_klienta'], znamky: ['bez'], kategorie: ['navrh'], jen_hvezda: true, mlci_min: 5, mlci_max: 0, razeni: 'mlceni' });
  await supabaseApi.myKontakty('t', 2000, 0, null, null, { kategorie: ['zmeny'], mlci_min: 10 });
  const b = odeslano.map((o) => o.body);
  over('O13', !['p_statusy', 'p_znamky', 'p_kategorie', 'p_jen_hvezda', 'p_mlci_min', 'p_mlci_max'].some((k) => k in b[0])
    && stejne(b[1].p_statusy, ['navrh_odeslan', 'ceka_na_klienta']) && stejne(b[1].p_znamky, ['bez']) && stejne(b[1].p_kategorie, ['navrh'])
    && b[1].p_jen_hvezda === true && b[1].p_mlci_min === 5 && b[1].p_mlci_max === 0 && b[1].p_razeni === 'mlceni'
    && stejne(b[2].p_kategorie, ['zmeny']) && b[2].p_mlci_min === 10 && !('p_status' in b[2]),
    'nové parametry jen zapnuté (prázdné pole, false a null ne), pole jako pole, nula jako nula', JSON.stringify(b).slice(0, 300));
  odpoved = { status: 404, telo: '{"code":"PGRST202","message":"Could not find the function public.list_kontakty in the schema cache"}' };
  await chyba('O13b', () => supabaseApi.listKontakty('t', { limit: 5, kategorie: ['navrh'] }), presne(BEZ_060_FILTRY), 'stará DB: nové filtry Kontaktů');
  await chyba('O13b', () => supabaseApi.myKontakty('t', 5, 0, null, null, { jen_hvezda: true }), presne(BEZ_060_FILTRY), 'stará DB: nové filtry Moji klienti');
  await chyba('O13b', () => supabaseApi.listKontakty('t', { limit: 5, razeni: 'hvezda' }), presne(BEZ_060_RAZENI), 'server bez 056: řazení hvězda');
  await chyba('O13b', () => supabaseApi.listOznacene('t', {}), presne(BEZ_060_OZNACENE), 'stará DB: Označené');
  await chyba('O13b', () => supabaseApi.zapisHovor('t', 1, 'nedovolano'), presne(BEZ_060_HOVOR), 'stará DB: dovolání');
  await chyba('O13b', () => supabaseApi.nastavHvezdu('t', 1, true), presne(BEZ_060_HVEZDA), 'stará DB: hvězda');
  await chyba('O13b', () => supabaseApi.kontaktPrehled('t', 1), presne(BEZ_060_PREHLED), 'stará DB: přehled');
  odpoved = { status: 400, telo: '{"code":"P0001","message":"Neplatné řazení: mlceni. Povolené: zmena_nejnovejsi, zmena_nejstarsi, hovor_nejnovejsi, hovor_nejstarsi."}' };
  await chyba('O13b', () => supabaseApi.myKontakty('t', 5, 0, null, null, { razeni: 'mlceni' }), presne(BEZ_060_RAZENI), 'server 057: řazení mlčení');
  odpoved = { status: 400, telo: '{"code":"P0001","message":"Neplatná známka ve filtru: X. Povolené: A, B, C, bez."}' };
  await chyba('O13b', () => supabaseApi.listKontakty('t', { limit: 5, znamky: ['X'] }), /^Neplatná známka ve filtru/, 'jiná chyba serveru zůstane');
  odpoved = { status: 200, telo: '[]' };
  odeslano.length = 0;
  await supabaseApi.listOznacene('t', {});
  await supabaseApi.listOznacene('t', { druhy: ['navrh', 'chybi_email'], segment: 'chata', statusy: ['navrh_odeslan'], znamky: ['A'], jen_hvezda: true, mlci_min: 5, user_id: 3, hledat: '  kopci ', razeni: 'hvezda' });
  await supabaseApi.listOznacene('t', { bez_volajiciho: true, hledat: '   ' });
  odpoved = { status: 200, telo: '{"ok":true,"kontakt_id":1}' };
  await supabaseApi.zapisHovor('t', 7, 'mluvili', 'chce web');
  await supabaseApi.zapisHovor('t', 7, 'nedovolano', null, false);
  await supabaseApi.nastavHvezdu('t', 7, true, 'velký zájem');
  await supabaseApi.oznaceniZavrit('t', 7, 'domluveno');
  await supabaseApi.kontaktPrehled('t', 7);
  const o = odeslano.map((x) => [x.url.split('/rpc/')[1], x.body]);
  over('O13c', o[0][0] === 'list_oznacene' && Object.keys(o[0][1]).join() === 'p_token'
    && stejne(o[1][1].p_druhy, ['navrh', 'chybi_email']) && o[1][1].p_segment === 'chata' && stejne(o[1][1].p_statusy, ['navrh_odeslan']) && stejne(o[1][1].p_znamky, ['A'])
    && o[1][1].p_jen_hvezda === true && o[1][1].p_mlci_min === 5 && o[1][1].p_user_id === 3 && o[1][1].p_hledat === 'kopci' && o[1][1].p_razeni === 'hvezda' && !('p_kategorie' in o[1][1])
    && Object.keys(o[2][1]).sort().join() === 'p_bez_volajiciho,p_token'
    && o[3][0] === 'zapis_hovor' && o[3][1].p_kontakt_id === 7 && o[3][1].p_vysledek === 'mluvili' && o[3][1].p_poznamka === 'chce web' && !('p_hvezda' in o[3][1])
    && o[4][1].p_hvezda === false && o[5][0] === 'nastav_hvezdu' && o[5][1].p_hvezda === true && o[5][1].p_duvod === 'velký zájem'
    && o[6][0] === 'oznaceni_zavrit' && o[6][1].p_duvod === 'domluveno' && o[7][0] === 'kontakt_prehled' && o[7][1].p_kontakt_id === 7,
    'list_oznacene jen zapnuté parametry; zapis_hovor, nastav_hvezdu, oznaceni_zavrit a kontakt_prehled s parametry podle serveru', JSON.stringify(o).slice(0, 400));
  // migrace 061: poznámka u každého výsledku (i nedovolano a jine), prázdná jako null; server s 060 jine odmítne srozumitelně
  odeslano.length = 0;
  await supabaseApi.zapisHovor('t', 7, 'nedovolano', 'nebere, zkusím ráno');
  await supabaseApi.zapisHovor('t', 7, 'jine', 'volala manželka');
  await supabaseApi.zapisHovor('t', 7, 'nechce', '   ');
  const o61 = odeslano.map((x) => x.body);
  over('O13d', o61[0].p_vysledek === 'nedovolano' && o61[0].p_poznamka === 'nebere, zkusím ráno' && o61[1].p_vysledek === 'jine' && o61[1].p_poznamka === 'volala manželka'
    && o61[2].p_poznamka === null, 'zapis_hovor pošle poznámku u každého výsledku, jen mezery jako null', JSON.stringify(o61));
  odpoved = { status: 400, telo: '{"code":"P0001","message":"Neplatný výsledek dovolání: jine. Povolené: nedovolano, nechce, nekontaktovat, mluvili."}' };
  await chyba('O13d', () => supabaseApi.zapisHovor('t', 7, 'jine', 'x'), presne(BEZ_061_JINE), 'server bez 061: Nic z toho výše');
  odpoved = { status: 400, telo: '{"code":"P0001","message":"Napište, jak hovor dopadl. Bez toho „Nic z toho výše“ zapsat nejde."}' };
  await chyba('O13d', () => supabaseApi.zapisHovor('t', 7, 'jine', ' '), /^Napište, jak hovor dopadl/, 'jiná chyba serveru u jine zůstane');

  // O14 stav filtrů (src/filtry.ts): jeden stav a jedna známka jdou starými parametry, jinak pole
  const S = (patch) => ({ ...FM.PRAZDNE_FILTRY, ...patch });
  over('O14', stejne(FM.filtryNaServer(S({ statusy: ['zajem'] })), { status: 'zajem' }) && stejne(FM.filtryNaServer(S({ statusy: ['zajem', 'navrh_odeslan'] })), { statusy: ['zajem', 'navrh_odeslan'] })
    && stejne(FM.filtryNaServer(S({ znamky: ['A'] })), { rating: 'A' }) && stejne(FM.filtryNaServer(S({ znamky: ['bez'] })), { znamky: ['bez'] })
    && stejne(FM.filtryNaServer(S({ znamky: ['A', 'B'] })), { znamky: ['A', 'B'] }) && stejne(FM.filtryNaServer(S({})), {})
    && stejne(FM.filtryNaServer(S({ jenHvezda: true, kategorie: ['navrh'], mlciMin: 0, mlciMax: 30 })), { jen_hvezda: true, kategorie: ['navrh'], mlci_min: 0, mlci_max: 30 })
    && stejne(FM.filtryOznacenych(S({ statusy: ['zajem'], znamky: ['A'] })), { statusy: ['zajem'], znamky: ['A'] })
    // list_oznacene nemá p_kategorie: kategorie se do Označených nikdy neposílá (recenze 2. 11. 2026)
    && stejne(FM.filtryOznacenych(S({ kategorie: ['navrh'], jenHvezda: true, mlciMin: 5 })), { jen_hvezda: true, mlci_min: 5 })
    && FM.mlciZPole(' 12 ') === 12 && FM.mlciZPole('x') === null && FM.mlciZPole('') === null && FM.mlciZPole('-3') === null
    && FM.filtrZapnuty(S({ mlciMin: 0 })) && !FM.filtrZapnuty(S({ segment: 'chata', razeni: 'mlceni' })) && stejne([...FM.MLCI_PREDVOLBY], [5, 10, 20, 30]),
    'filtry.ts: převod na server, pole mlčení, předvolby 5+, 10+, 20+, 30+');

  // O15 texty a okno Zavolal/a jsem
  over('O15', U.STATUS_LABELS.bez_odpovedi === 'Archiv – neodpověděl' && U.OZNACENI_LABELS.navrh === 'Neodpověděl na návrh'
    && U.OZNACENI_LABELS.zmeny === 'Neodpověděl na změny' && U.formatMlci(12) === '12 prac. dní' && U.formatMlci(1) === '1 prac. den'
    && U.formatMlci(3) === '3 prac. dny' && U.formatMlci(null) === '—' && U.lhutaText('2026-11-18') === 'Lhůta na zavolání do 18. 11. 2026'
    && U.mlciOd({ mlci_pd: 6, ozn_kategorie: null, ozn_mlci_od: null, first_proposal_at: '2026-10-01T10:00:00Z', last_our_reply_at: '2026-10-20T10:00:00Z' }) === '2026-10-20T10:00:00Z'
    && U.mlciOd({ mlci_pd: null, ozn_kategorie: null, ozn_mlci_od: null, first_proposal_at: 'x', last_our_reply_at: 'y' }) === null,
    'popisky: archiv, dvě kategorie, pracovní dny, lhůta (ve stage 1 bez slibu e-mailu), mlčí od');
  // ⚠ migrace 061 (Albert 2. 11. 2026: „these four options. Plus … one more option which says none of it above“): pět
  // výsledků, pátý „Nic z toho výše“ (jine); NAHRAZUJE „čtyři výsledky ze zadání“ z 060
  over('O15b', stejne(DM.DOVOLANI_VOLBY.map((x) => x.v), ['nedovolano', 'nechce', 'nekontaktovat', 'mluvili', 'jine'])
    && stejne(DM.DOVOLANI_VOLBY.map((x) => x.text), ['Nedovolal/a jsem se', 'Nechce web', 'Nechce, abychom ho kontaktovali', 'Mluvili jsme – co klient chce', 'Nic z toho výše'])
    && DM.DOVOLANI_MAX === 2000 && !DM.DOVOLANI_VOLBY.some((x) => /e-mail(em)? (mu )?p[ůu]jde|připomínk/i.test(x.co)),
    'okno Zavolal/a jsem: pět výsledků ze zadání (061), poznámka nejvýš 2 000 znaků, žádný slib e-mailu (ve stage 1 neplatí)');
  // recenze 2. 11. 2026: bez práva kontakt upravit jen „Nedovolal/a jsem se“ (server ostatní odmítne), důvod nechce
  // a nekontaktovat nejvýš 450 znaků jako server; jine jako mluvili 2 000 (061)
  over('O15c', stejne(DM.volbyDovolani(false).map((x) => x.v), ['nedovolano']) && stejne(DM.volbyDovolani(true).map((x) => x.v), ['nedovolano', 'nechce', 'nekontaktovat', 'mluvili', 'jine'])
    && DM.DOVOLANI_DUVOD_MAX === 450 && DM.dovolaniMax('nechce') === 450 && DM.dovolaniMax('nekontaktovat') === 450
    && DM.dovolaniMax('mluvili') === 2000 && DM.dovolaniMax('jine') === 2000 && DM.dovolaniMax('nedovolano') === 2000 && DM.dovolaniMax(null) === 2000
    && /smiUpravit=\{okno\.k\.smi_upravit !== false\}/.test(readFileSync(join(ROOT, 'src/pages/OznacenePage.tsx'), 'utf8'))
    && /smiUpravit=\{kontakt\.smi_upravit !== false\}/.test(readFileSync(join(ROOT, 'src/components/PrehledPanel.tsx'), 'utf8')),
    'okno Zavolal/a jsem: bez práva úprav jen nedovolání, důvod odmítnutí nejvýš 450 znaků, obě místa okna předávají smi_upravit');

  // O16 zapojení stránek (klikání měří e2e bloky O060)
  const src = (p) => readFileSync(join(ROOT, p), 'utf8');
  const admin = src('src/pages/AdminPage.tsx');
  const moji = src('src/pages/MojiPage.tsx');
  const ozn = src('src/pages/OznacenePage.tsx');
  const drawer = src('src/components/KontaktDrawer.tsx');
  const call = src('src/pages/CallPage.tsx');
  over('O16', /<SeznamFiltry\s/.test(admin) && (admin.match(/jenZaklad\(r\) \? <Skryto \/> :/g) ?? []).length === 6 && /<MlceniBunka kontakt=\{r\} \/>/.test(admin)
    && /<HvezdaPrepinac kontakt=\{r\}/.test(admin) && /\.\.\.naServer,/.test(admin),
    'Kontakty: sdílený řádek filtrů, šest pomlček jenZaklad zůstává, sloupec Mlčí, hvězda u jména, nové filtry do list_kontakty');
  over('O16b', /<SeznamFiltry\s/.test(moji) && /<MlceniBunka kontakt=\{r\} \/>/.test(moji) && /<HvezdaPrepinac kontakt=\{r\}/.test(moji),
    'Moji klienti: sdílený řádek filtrů pro každého, sloupec Mlčí, hvězda');
  // ⚠ migrace 061 (Albert 2. 11. 2026, kompaktní řádek): „Zrušit označení“ je v řádku vedle „Vyřešeno“, proto
  // {jaSuper && r.ozn_kategorie && (…)}; NAHRAZUJE kotvu {jaSuper && (<button …> uvnitř {r.ozn_kategorie && …} z 060
  over('O16c', /getApi\(\)\.listOznacene\(session\.token, filtry\)/.test(ozn) && /if \(errMsg\(e\) !== BEZ_060_OZNACENE\) throw e;\s*\/\/[^\n]*\n\s*r = await getApi\(\)\.listFlagged\(/.test(ozn)
    && /<DovolaniOkno/.test(ozn) && /<ZrusitOznaceniOkno/.test(ozn) && /\{jaSuper && r\.ozn_kategorie && \(\s*<button/.test(ozn) && /lhutaText\(r\.ozn_lhuta_do\)/.test(ozn)
    && !/E-mail mu půjde/.test(ozn) && /bezVolajiciho="Bez volajícího"/.test(ozn) && /kategorie=\{false\}/.test(ozn),
    'Označené: list_oznacene (list_flagged jen proti serveru bez 060), okno Zavolal/a jsem, zrušení jen super admin, lhůta bez slibu e-mailu, bez volajícího');
  const vetevCizi = /if \(jenZaklad\(kontakt\)\) \{\s*return \(([\s\S]*?)\n    \);\n  \}/.exec(drawer)?.[1] ?? '';
  over('O16d', vetevCizi.length > 100 && !/PrehledPanel|Hvezda|hvezda_|prehled|ozn_|mlci/.test(vetevCizi) && /<PrehledPanel\s+kontakt=\{kontakt\}\s+smiZapsat/.test(drawer)
    && /<HvezdaPrepinac kontakt=\{kontakt\} velka onZmena=\{onSaved\} \/>/.test(drawer) && /VOLITELNE_FLAGS\.map\(\(f\) =>/.test(drawer),
    'detail: přehled a hvězda jen u vlastního klienta (ne ve větvi jenZaklad), neodpovida vybrat nejde');
  over('O16e', /await getApi\(\)\.resolveCall\([\s\S]{0,1600}if \(outcome === 'zajem' && hvezda\) \{\s*try \{\s*await getApi\(\)\.nastavHvezdu\(session\.token, kontakt\.id, true, null\);/.test(call)
    && /Zájem je uložený, ale hvězdu se nepodařilo dát/.test(call) && /await loadNext\(hlaska\);/.test(call) && /\{!jenZaklad\(kontakt\) && <PrehledPanel kontakt=\{kontakt\} naKarte \/>\}/.test(call)
    && /<HvezdaIcon size=\{17\} plna=\{hvezda\} \/> Velký zájem \(hvězda\)/.test(call) && /<StarIcon size=\{18\} \/> Mají zájem/.test(call),
    'volání: hvězda až po uloženém zájmu (chyba se ukáže), jiný obrázek než Mají zájem, přehled jen u vlastního klienta');
  const hint = U.FLAG_HINTS.neodpovida;
  over('O16f', !/zmiz\p{L}*\s+s[aá]m|zavol[aá]\s*$/iu.test(hint) && /starý příznak/i.test(hint), 'nápověda neodpovida nic neslibuje (hovor mimo frontu se dřív nedal zapsat)', hint);
});

if (chyby === 0) {
  console.log(`ALL OK (${pocet} kontrol)`);
  process.exit(0);
}
console.log(`CHYB: ${chyby} z ${pocet}`);
process.exit(1);
