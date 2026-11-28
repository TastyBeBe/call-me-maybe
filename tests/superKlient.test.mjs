// Test chování: Web na míru (super klienti, migrace 086, Albert 27. 11. 2026: „anyone for their client, but of course the super
// admins should also be able to do it for anyone … even when you're in the call feature, you should be able to toggle this“;
// „any email before it's sent needs to be shown in the app to the super admin who's responsible“).
//
// Měří čisté pomocníky (src/superKlient.ts: popisky, pořadí karet, počet na pilulce, kdo vidí přepínač), demo mock (Volající
// označí svého klienta i kartu, kterou volá, cizího ne; super admin kohokoli; stránku Ke schválení má jen super admin; kontrolu
// odpovědí označeného klienta nejde odškrtnout), co src/api/supabase.ts posílá serveru (fetch je podstrčený) a zapojení
// v detailu klienta, v okně po hovoru, na kartě hovoru a v trasách. Pravidla na serveru měří db/tests/test_086_super_klienti.sql.
// Nikdy nesahá na živou DB. Spuštění:
//   node tests/superKlient.test.mjs            (kořen appky = složka nad tests/)
//   APP_ROOT=/cesta/ke/kopii node tests/superKlient.test.mjs   (mutace v kopii)
// Výsledek: řádek „ALL OK (N kontrol)“, jinak řádky „FAIL <id>: <česky> (…)“ a kód 1.

import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(process.env.APP_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..'));

const uloziste = new Map([['volacka_supabase_url', 'https://test.example.invalid'], ['volacka_anon_key', 'test-klic']]);
globalThis.localStorage = {
  getItem: (k) => (uloziste.has(k) ? uloziste.get(k) : null),
  setItem: (k, v) => uloziste.set(k, String(v)),
  removeItem: (k) => uloziste.delete(k),
  get length() { return uloziste.size; },
  key: (i) => [...uloziste.keys()][i] ?? null,
};
const puvodniTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, _ms, ...a) => puvodniTimeout(fn, 0, ...a);
const odeslano = [];
globalThis.fetch = async (url, init) => {
  odeslano.push({ url: String(url), body: JSON.parse(init?.body ?? '{}') });
  return new Response('{"kontakt_id": 9, "viditelne": true, "smi_menit": true}', { status: 200, headers: { 'Content-Type': 'application/json' } });
};
// háček demo zkoušky: mock do něj dá kontrolaNavrh a pomocníky mojeKontaktId / ciziKontaktId
globalThis.__volackaDemoTest = { volani: [], zpozdeni: () => 0 };

let bundle;
{
  const out = await build({
    stdin: {
      contents: [
        "export * as S from './src/superKlient.ts';",
        "export { mockApi } from './src/api/mock.ts';",
        "export { supabaseApi } from './src/api/supabase.ts';",
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
  const dir = mkdtempSync(join(tmpdir(), 'superklient-test-'));
  const f = join(dir, 'b.cjs');
  writeFileSync(f, out.outputFiles[0].text);
  bundle = createRequire(import.meta.url)(f);
  rmSync(dir, { recursive: true, force: true });
}
const { S, mockApi, supabaseApi } = bundle;
const hacek = globalThis.__volackaDemoTest;

let pocet = 0;
let chyby = 0;
function over(id, podminka, text, detail = '') {
  pocet += 1;
  if (!podminka) {
    chyby += 1;
    console.log(`FAIL ${id}: ${text}${detail ? ` (${detail})` : ''}`);
  }
}
async function chyba(fn) {
  try {
    await fn();
    return '';
  } catch (e) {
    return String(e && e.message);
  }
}
const cti = (soubor) => readFileSync(join(ROOT, soubor), 'utf8');

// --- s1 čisté pomocníky
over('s1a', S.WEB_NA_MIRU === 'Web na míru' && S.BEZ_NAHLEDU === 'bez našeho náhledu', 'popisky odznaků');
over('s1b', JSON.stringify(S.odznakText({ chce_nahled: false })) === '["Web na míru","bez našeho náhledu"]', 'odznak „nechce“');
over('s1c', JSON.stringify(S.odznakText({ chce_nahled: true })) === '["Web na míru"]' && S.odznakText(undefined).length === 0, 'odznak „chce“ a žádný');
const karty = [
  { navrh: { id: 3, stav: 'ceka', vytvoreno: '2026-11-27T10:00:00Z' }, super_klient: null },
  { navrh: { id: 2, stav: 'schvaleno', vytvoreno: '2026-11-27T08:00:00Z' }, super_klient: { faze: 'ceka_na_zadani' } },
  { navrh: { id: 1, stav: 'ceka', vytvoreno: '2026-11-27T09:00:00Z' }, super_klient: { faze: 'ceka_na_zadani' } },
];
over('s1d', S.poradiKaret(karty).map((k) => k.navrh.id).join(',') === '1,2,3', 'super klienti napřed, čekající napřed, nejstarší napřed',
  S.poradiKaret(karty).map((k) => k.navrh.id).join(','));
over('s1e', S.pocetCeka({ pocet_ceka: 4, navrhy: [] }) === 4 && S.pocetCeka(null) === 0, 'počet na pilulce');
over('s1f', S.prepinacViditelny({ viditelne: false }) === false && S.prepinacViditelny({ viditelne: true }) === true
  && S.prepinacViditelny(null) === false, 'kdo vidí přepínač');

// --- s2 demo mock (tokeny demo-<id>-test: 1 Albert, 2 Petra, 4 Mikuláš)
const A = 'demo-1-test', P = 'demo-2-test';
const svuj = hacek.mojeKontaktId?.(2);
const cizi = hacek.ciziKontaktId?.(2);
over('s2', Number.isInteger(svuj) && Number.isInteger(cizi) && svuj !== cizi, 'háček dá Petřina a cizího klienta', `${svuj} ${cizi}`);
let d = await mockApi.superKlientNastav(P, svuj, true, true);
over('s2a', d.oznacen === true && d.chce_nahled === true && d.kontrola_zapnuta === true && d.schvalovatel === 'Albert',
  'Volající označí svého klienta, kontrolu schvaluje jeho nadřízený', JSON.stringify(d));
over('s2b', /smí označit jen jeho Volající/.test(await chyba(() => mockApi.superKlientNastav(P, cizi, true, true))), 'Volající neoznačí cizího');
d = await mockApi.superKlientNastav(A, cizi, true, false);
over('s2c', d.oznacen === true && d.chce_nahled === false, 'super admin označí kohokoli', JSON.stringify(d));
over('s2d', /Ke schválení vidí jen super admin/.test(await chyba(() => mockApi.keSchvaleni(P))), 'Volající nemá stránku Ke schválení');
const ks = await mockApi.keSchvaleni(A);
over('s2e', ks.navrhy.length >= 1 && ks.navrhy[0].super_klient !== null && ks.pocet_ceka >= 1,
  'DEMO super klient s návrhem je na stránce nahoře', JSON.stringify(ks).slice(0, 240));
over('s2f', /nejde vypnout/.test(await chyba(() => mockApi.kontrolaNastav(A, cizi, false))), 'kontrolu označeného klienta nejde odškrtnout');
const od = await mockApi.superKlientiOdznaky(P);
over('s2g', od.some((o) => o.kontakt_id === svuj) && !od.some((o) => o.kontakt_id === cizi), 'odznaky Volajícího jen u jeho klientů',
  JSON.stringify(od));
d = await mockApi.superKlientDetail(P, cizi);
over('s2h', d.viditelne === false && d.oznacen === undefined, 'Volající nevidí Web na míru cizího klienta', JSON.stringify(d));
d = await mockApi.superKlientNastav(P, svuj, false, null);
over('s2i', d.oznacen === false && (await mockApi.kontrolaDetail(A, svuj)).zapnuto === true, 'zrušení označení nechá kontrolu zapnutou');

// --- s3 co posílá supabase.ts
odeslano.length = 0;
await supabaseApi.superKlientNastav('t', 9, true, false).catch(() => {});
const p = odeslano.find((x) => x.url.endsWith('/rpc/super_klient_nastav'));
over('s3a', p && p.body.p_token === 't' && p.body.p_kontakt_id === 9 && p.body.p_zapnout === true && p.body.p_chce_nahled === false,
  'tělo super_klient_nastav', JSON.stringify(p));
for (const [f, rpcJm, args] of [['superKlientDetail', 'super_klient_detail', ['t', 9]], ['keSchvaleni', 'ke_schvaleni_seznam', ['t']],
  ['superKlientiOdznaky', 'super_klienti_odznaky', ['t']]]) {
  odeslano.length = 0;
  await supabaseApi[f](...args).catch(() => {});
  over('s3b-' + f, odeslano.some((x) => x.url.endsWith('/rpc/' + rpcJm)), `${f} volá ${rpcJm}`);
}

// --- s4 zapojení (zdroj)
over('s4a', cti('src/components/KontaktDrawer.tsx').includes('<WebNaMiruPrepinac'), 'přepínač v detailu klienta');
over('s4b', cti('src/components/DovolaniOkno.tsx').includes('<WebNaMiruPrepinac'), 'přepínač v okně po hovoru');
over('s4c', cti('src/pages/CallPage.tsx').includes('<WebNaMiruPrepinac'), 'přepínač na kartě hovoru');
over('s4d', /<RequireAuth superAdmin>\s*<KeSchvaleniPage/.test(cti('src/App.tsx')), 'Ke schválení jen pro super admina');
over('s4e', /ke schválení/.test(cti('src/App.tsx')) && /isSuper && \(/.test(cti('src/App.tsx')), 'pilulka „ke schválení“ jen u super admina');
over('s4f', /KONTROLA_ZUSTAVA/.test(cti('src/components/KontrolaOdpovedi.tsx')), 'detail říká, proč kontrolu nejde odškrtnout');
over('s4g', /searchParams\.get\('vlakno'\)/.test(cti('src/pages/ZpravyPage.tsx')), 'Zprávy otevřou vlákno z adresy (?vlakno=)');

console.log(chyby ? `SOME FAILED (${chyby} z ${pocet})` : `ALL OK (${pocet} kontrol)`);
process.exit(chyby ? 1 : 0);
