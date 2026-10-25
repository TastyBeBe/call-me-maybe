// Test chování: volání 050 (Albert 21. 10. 2026): nerelevantní kontakt, přeplánovaný hovor, kalendář hovorů, výdělek
// volajícího a sloupce v Moji klienti. Od migrace 051 (Albert 22. 10. 2026) i blok D: cena při „Mají zájem“ nepovinná,
// nedohodnutá cena = „n/a“ (db/migration_051_cena_na.sql, test db/tests/test_051_cena_na.sql).
//
// Měří DEMO mock (src/api/mock.ts), který musí zrcadlit server (db/migration_050_volani_kalendar_vydelek.sql, test
// db/tests/test_050_volani_kalendar_vydelek.sql), pomocníky v src/ui.tsx, src/praha.ts, src/zavolat.tsx
// a src/components/ZavolatModal.tsx a to, co src/api/supabase.ts posílá serveru (fetch je podstrčený, nic nejde po síti).
// Nikdy nesahá na živou DB. Klikání na stránce měří tests/demo-e2e.mjs (bloky J, N, P, K, H, E). Spuštění:
//   node tests/volani.test.mjs            (kořen appky = složka nad tests/)
//   APP_ROOT=/cesta/ke/kopii node tests/volani.test.mjs   (mutace v kopii)
// Výsledek: řádek „ALL OK (N kontrol)", jinak řádky „FAIL <id>: <česky> (…)" a kód 1.
// Každý záporný případ ověřuje TEXT hlášky (stejný jako na serveru), ne jen to, že něco selhalo.

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
// supabase.ts: žádný požadavek po síti, jen záznam, co by appka poslala
const odeslano = [];
globalThis.fetch = async (url, init) => {
  odeslano.push({ url: String(url), body: JSON.parse(init?.body ?? '{}') });
  return new Response('{"ok":true,"kontakt_id":1,"status":"nedovolano"}', { status: 200, headers: { 'Content-Type': 'application/json' } });
};

let bundle;
{
  const out = await build({
    stdin: {
      contents: [
        "export { mockApi, cenaCist, cenaNezadanaMock, maVlastniWeb } from './src/api/mock.ts';",
        "export { supabaseApi } from './src/api/supabase.ts';",
        "export * as uiModul from './src/ui.tsx';",
        "export * as prahaModul from './src/praha.ts';",
        "export * as zavolatModul from './src/zavolat.tsx';",
        "export * as oknoModul from './src/components/ZavolatModal.tsx';",
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
  const dir = mkdtempSync(join(tmpdir(), 'volani-test-'));
  const f = join(dir, 'b.cjs');
  writeFileSync(f, out.outputFiles[0].text);
  bundle = createRequire(import.meta.url)(f);
  rmSync(dir, { recursive: true, force: true });
}
const { mockApi: api, cenaCist, cenaNezadanaMock, maVlastniWeb, supabaseApi, uiModul: U, prahaModul: P, zavolatModul: Z, oknoModul: O } = bundle;

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
/** Doslovná hláška jako regulární výraz (celý text). */
const presne = (t) => new RegExp(`^${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
const MIN = 60 * 1000;
const za = (ms) => new Date(Date.now() + ms).toISOString();
const NBSP = ' ';
const mezery = (s) => String(s ?? '').replace(/ /g, ' ');

const petra = (await api.login('petra', 'volam')).token;   // Volající pod Albertem (id 2)
const honza = (await api.login('honza', 'volam')).token;   // Volající pod Mikulášem (id 3)
const albert = (await api.login('admin', 'admin')).token;  // majitel (id 1)
const mikulas = (await api.login('mikulas', 'mikulas')).token; // super admin (id 4)
const eva = (await api.login('eva', 'eva')).token;          // Volající pod Albertem (id 5)

const seznam = async (tok, uid = null, vse = false) => (await api.zavolatSeznam(tok, uid, vse)).polozky;
const radek = async (id) => (await api.listKontakty(albert, { limit: 1000 })).rows.find((r) => r.id === id);
const cekajici = async (tok, kid, uid = null, vse = false) => (await seznam(tok, uid, vse)).find((z) => z.kontakt_id === kid && z.stav === 'ceka');

/* ---------------- V) výdělek: čtení ceny, 30 %, tento týden, sleva, eura (mock = app_cena_cist a app_vydelek) ---------------- */
// VZORKY CENY (spec 050 „Shared price-reader samples“): db/tests/test_050_volani_kalendar_vydelek.sql (mezi řádky
// „-- vzorky ceny: začátek“ a „-- vzorky ceny: konec“) a tenhle test mají TUTÉŽ tabulku ve stejném pořadí, kontrola 204
// v repu webdomov je porovnává. Měnit jen spolu.
// vzorky ceny: začátek
const VZORKY_CENY = [
  ['7000', 7000, 'kc'],
  ['10000 Kč', 10000, 'kc'],
  ['15000 Kc', 15000, 'kc'],
  ['15.000,-', 15000, 'kc'],
  ['15 000 Kč', 15000, 'kc'],
  ['20 tis.', 20000, 'kc'],
  ['20k', 20000, 'kc'],
  ['250 eur', 250, 'eur'],
  ['300 €', 300, 'eur'],
  ['6000-7000 Kč po domluvě', null, null],
  ['do 8000', null, null],
  ['od 7000', null, null],
  ['7000 + hosting 1500', null, null],
  ['Xx', null, null],
  ['500', null, null],
  ['100 USD', null, null],
  ['', null, null],
  ['3 500 kc ', 3500, 'kc'],
];
// vzorky ceny: konec
await blok('V', async () => {
  over('V0', typeof cenaCist === 'function' && VZORKY_CENY.length === 18, 'mock má cenaCist (app_cena_cist) a tabulka vzorků má 18 řádků');
  VZORKY_CENY.forEach(([text, castka, mena], i) => {
    const r = cenaCist(text);
    over(`V0.${i + 1}`, r.castka === castka && r.mena === mena, `cena „${text}“ = ${castka ?? 'nejasná'} ${mena ?? ''}`, JSON.stringify(r));
  });
  over('V0b', cenaCist(null).castka === null && cenaCist('20 tisíc').castka === 20000 && cenaCist('max 9000').castka === null
    && cenaCist('až 9000').castka === null && cenaCist('1 000 001').castka === null && cenaCist('39 €').castka === null
    && cenaCist('40000 eur').castka === 40000 && cenaCist('7 000 Kč').castka === 7000,
    'další pravidla: tisíc, max, až, rozsah Kč a €');

  const vp = await api.statistikyVolani(petra);
  const v = vp.vydelek;
  const dnes = P.prahaDen(new Date());
  const pondeli = P.posunDen(dnes, -(P.isoDen(dnes) - 1));
  over('V1', vp.user_id === 2 && v.sazba_procent === 30 && v.tyden_od === pondeli && v.tyden_do === P.posunDen(pondeli, 6),
    'Petra: sazba 30 %, týden po až ne v Praze', JSON.stringify({ s: v.sazba_procent, od: v.tyden_od, do: v.tyden_do }));
  over('V2', v.prodano === 2 && v.celkem_kc === 3570 && v.tyden_kc === 2100 && v.celkem_eur === 0 && v.nejasne === 0,
    'Petra: dva prodané weby, 1 470 Kč dřív a 2 100 Kč tento týden', JSON.stringify(v).slice(0, 220));
  const [p20, p7] = v.prodeje;
  over('V3', p20?.kontakt_id === 20 && p20.tento_tyden && p20.castka === 7000 && p20.provize === 2100 && p20.zdroj === 'cena_web' && p20.cena === '7 000 Kč'
    && p7?.kontakt_id === 7 && !p7.tento_tyden && p7.castka === 4900 && p7.provize === 1470 && p7.mena === 'kc' && p7.jmeno === 'Penzion Šumava — Kučerovi',
    'Petra: seznam prodejů od nejnovějšího s cenou, provizí a příznakem tohoto týdne', JSON.stringify(v.prodeje).slice(0, 300));
  const st = await api.myStats(petra);
  over('V4', st.sold === v.prodano, 'prodáno ve výdělku = prodáno v my_stats (stejné pravidlo)', `${st.sold} / ${v.prodano}`);

  const vh = (await api.statistikyVolani(honza)).vydelek;
  const s22 = vh.prodeje.find((x) => x.kontakt_id === 22);
  const s21 = vh.prodeje.find((x) => x.kontakt_id === 21);
  over('V5', s22?.zdroj === 'sleva' && s22.cena === '3 500 Kč' && s22.castka === 3500 && s22.provize === 1050,
    'Honza: po nabídce poloviční ceny se počítá částka ze slevy (3 500 Kč, ne 7 000 Kč)', JSON.stringify(s22));
  over('V6', s21?.castka === null && s21.provize === null && s21.mena === null && s21.cena === '6000-7000 Kč po domluvě' && vh.nejasne === 1
    && vh.celkem_kc === 1050, 'Honza: cena „6000-7000 Kč po domluvě“ nejde přečíst, do součtu se nepočítá', JSON.stringify({ s21, n: vh.nejasne, c: vh.celkem_kc }));
  const ve = (await api.statistikyVolani(eva)).vydelek;
  over('V7', ve.celkem_eur === 75 && ve.celkem_kc === 0 && ve.prodeje[0]?.mena === 'eur' && ve.prodeje[0]?.provize === 75,
    'Eva: web za 250 eur = 75 € zvlášť, na koruny se nepřepočítává', JSON.stringify(ve).slice(0, 200));
  for (const [kdo, tok] of [['Petra', petra], ['Honza', honza], ['Eva', eva], ['Mikuláš', mikulas]]) {
    over('V8', (await api.statistikyVolani(tok)).vydelek.prodano === (await api.myStats(tok)).sold, `${kdo}: prodáno ve výdělku = my_stats`);
  }

  // práva: Volající jen svoje (práva napřed, hláška stejná i pro neexistující id), super admin kohokoli
  await chyba('V9', () => api.statistikyVolani(petra, 3), presne('Statistiky jiného člověka vidí jen super admin.'), 'Volající cizí výdělek nevidí');
  await chyba('V9b', () => api.statistikyVolani(petra, 9999), presne('Statistiky jiného člověka vidí jen super admin.'), 'Volající podle hlášky nepozná, které id existuje');
  await chyba('V9c', () => api.statistikyVolani(mikulas, 9999), presne('Uživatel id=9999 neexistuje.'), 'super admin: neexistující člověk');
  const mp = await api.statistikyVolani(mikulas, 2);
  over('V10', JSON.stringify(mp) === JSON.stringify(vp), 'super admin vidí Petřina čísla stejně, jak je vidí ona', JSON.stringify(mp).slice(0, 120));
  over('V10b', JSON.stringify(await api.statistikyVolani(petra, 2)) === JSON.stringify(vp), 'Volající s vlastním id = svoje');

  // datum prodeje: trigger zapíše PRVNÍ vstup do prodeje (tento týden), návrat a nový vstup datum nemění; zaokrouhlení
  await api.updateKontakt(albert, 5, { status: 'schvaleno', cena_web: '1 005 Kč' });
  let h = (await api.statistikyVolani(honza)).vydelek;
  const s5 = h.prodeje.find((x) => x.kontakt_id === 5);
  // migrace 051 (22. 10. 2026): Honza má navíc prodej 24 s nedohodnutou cenou (tento týden, do součtu se nepočítá),
  // proto prodano o jedna víc (⚠ NAHRAZUJE 3 a v V12 2) a tyden_kc beze změny
  over('V11', s5?.tento_tyden === true && s5.provize === 302 && h.tyden_kc === 302 && h.prodano === 4,
    'nový prodej (stav schváleno) je tento týden; 30 % z 1 005 Kč = 302 Kč (celé koruny)', JSON.stringify(s5));
  await api.updateKontakt(albert, 5, { status: 'navrh_odeslan' });
  over('V11b', !(await api.statistikyVolani(honza)).vydelek.prodeje.some((x) => x.kontakt_id === 5), 'kontakt mimo stavy prodeje ve výdělku není');
  await api.updateKontakt(albert, 5, { status: 'zaplaceno' });
  h = (await api.statistikyVolani(honza)).vydelek;
  over('V11c', h.prodeje.find((x) => x.kontakt_id === 5)?.prodano_at === s5?.prodano_at, 'nový vstup do prodeje datum prodeje nemění (první vstup platí)');
  await api.updateKontakt(albert, 5, { status: 'navrh_odeslan', cena_web: '5900' });
  // po recenzi 21. 10. 2026: prodej patří jen tomu, kdo zapsal POSLEDNÍ zájem (Honza zájem, pak Petra zájem → jen Petra)
  // kontakt 1 (volný): super admin ho dá Honzovi, Honza ho vezme „Zavolat teď“ a zapíše zájem; pak totéž Petra
  const x = 1;
  const zhx = await api.zavolatNaplanovat(mikulas, x, za(60 * MIN), null, 3);
  const kh = await api.zavolatVzit(honza, zhx.id);
  await api.resolveCall(honza, { kontakt_id: kh.id, outcome: 'zajem', cena_web: '8000', cena_hosting: '1000/rok', rating: 'A' });
  await api.updateKontakt(albert, x, { status: 'nedovolano' });
  const zpx = await api.zavolatNaplanovat(mikulas, x, za(60 * MIN), null, 2);
  const kp = await api.zavolatVzit(petra, zpx.id);
  await api.resolveCall(petra, { kontakt_id: kp.id, outcome: 'zajem', cena_web: '8000', cena_hosting: '1000/rok', rating: 'A' });
  await api.updateKontakt(albert, x, { status: 'schvaleno' });
  const vpx = (await api.statistikyVolani(petra)).vydelek;
  const vhx = (await api.statistikyVolani(honza)).vydelek;
  over('V13', zhx.user_id === 3 && kh?.id === x && kp?.id === x && vpx.prodeje.some((r) => r.kontakt_id === x && r.provize === 2400)
    && !vhx.prodeje.some((r) => r.kontakt_id === x) && (await api.myStats(honza)).sold === vhx.prodano + 1,
    'prodej s dvěma zájmy připadne jen poslednímu (Petra), my_stats „prodáno“ ho dál počítá oběma', JSON.stringify({ p: vpx.prodano, h: vhx.prodano }));
  await api.updateKontakt(albert, x, { status: 'odmitnuto' }); // ven z prodeje i z fronty (nepletl by další bloky)
  h = (await api.statistikyVolani(honza)).vydelek;
  over('V12', h.celkem_kc === 1050 && h.prodano === 3 && !h.prodeje.some((x) => /hosting|190/.test(String(x.cena))), 'po návratu stavu zpět; hosting se nikde nepočítá');
});

/* ---------------- F) fronta architektů: napřed bez vlastního webu (migrace 054, Albert 25. 10. 2026) ---------------- */
await blok('F', async () => {
  // pomocník = app_kontakt_ma_web na serveru (stejná tabulka jako test 054, 54a)
  const tab = [[null, null, false], ['', '', false], ['   ', ' ', false], [null, 'nemá web', false], [null, 'NEMÁ WEB', false],
    ['', '773126585', false], [null, 'ne', false], [' ', 'nevím', false], ['https://atelier.example.cz', null, true],
    ['https://atelier.example.cz', 'nemá web', true], [null, 'má web', true], ['', ' Má web ', true], [null, 'ma web', true], [null, 'ano', true]];
  const spatne = tab.filter(([w, m, c]) => maVlastniWeb(w, m) !== c);
  over('F1', spatne.length === 0, 'maVlastniWeb = app_kontakt_ma_web (adresa nebo „má web“ = web, jinak bez webu)', JSON.stringify(spatne));
  // demo: jediný volatelný architekt bez webu je 301, s webem 300 a 302
  // šestkrát (vrácení do fronty má strop 10 za hodinu na člověka): při náhodném výběru ze tří by 301 přišel pokaždé s 0,14 %
  const tahy = [];
  for (const tok of [eva, albert, mikulas, eva, albert, mikulas]) {
    const c = await api.nextContact(tok, 'architekt');
    tahy.push(c?.id ?? null);
    if (c) await api.returnContact(tok, c.id);
  }
  const prvni = await api.nextContact(petra, 'architekt');
  over('F2', prvni?.id === 301 && tahy.every((x) => x === 301), 'první architekt ve frontě je vždy ten bez webu (301), ne 300 ani 302 s webem', `${tahy.join()} / ${prvni?.id}`);
  const druhy = await api.nextContact(honza, 'architekt');
  over('F3', !!druhy && [300, 302].includes(druhy.id), 'architekt s webem přijde, až když bez webu nikdo nezbyl', druhy && `${druhy.id}`);
  if (prvni) await api.returnContact(petra, prvni.id);
  if (druhy) await api.returnContact(honza, druhy.id);
  // chaty: přednost se nepoužije (u chat s webem i bez web náhodně jako dřív); měří se zdroj, náhodu nejde změřit napevno
  const m = readFileSync(join(ROOT, 'src/api/mock.ts'), 'utf8');
  over('F4', /const bezWebu = segment === 'architekt' \? pool\.filter\(\(c\) => !maVlastniWeb\(c\.web, c\.ma_web\)\) : \[\];\s*const z = bezWebu\.length > 0 \? bezWebu : pool;/.test(m)
    && (m.match(/pick\(callable\.filter/g) ?? []).length === 2,
    'přednost bez webu jen u architektů a v obou průchodech (1 i 2) jedním výběrem pick');
});

/* ---------------- M) Moji klienti a čas: formátování ceny, data a času v Praze ---------------- */
await blok('M', async () => {
  const c = (t) => U.cenaText(t);
  over('M1', mezery(c('7000')?.text) === '7 000 Kč' && c('7000')?.text === `7${NBSP}000${NBSP}Kč`, 'čistá částka „7000“ = „7 000 Kč“ (nezlomitelné mezery)', c('7000')?.text);
  over('M2', mezery(c('4900')?.text) === '4 900 Kč' && mezery(c('7 000 Kč')?.text) === '7 000 Kč' && mezery(c('15.000,-')?.text) === '15 000 Kč'
    && mezery(c('6500 Kc')?.text) === '6 500 Kč' && mezery(c('1000000')?.text) === '1 000 000 Kč', 'čistá částka s Kč, Kc, „,-“ nebo tečkou se sjednotí');
  over('M3', c('190/měs')?.text === '190/měs' && c('1000/rok')?.text === '1000/rok' && c('6000-7000 Kč po domluvě')?.text === '6000-7000 Kč po domluvě',
    'jiný text ceny zůstane, jak ho kdo zapsal');
  const dlouhy = 'cena podle rozsahu, asi deset až patnáct tisíc s fotkami';
  over('M4', [...(c(dlouhy)?.text ?? '')].length === 26 && c(dlouhy)?.text.endsWith('…') && c(dlouhy)?.cele === dlouhy, 'dlouhý text se zkrátí, celý je v nápovědě', c(dlouhy)?.text);
  for (const z of ['x', 'xx', 'X', 'Xx', 'yx', '-', '—', '', '   ', null, undefined]) {
    over('M5', c(z) === null, `zástupná nebo prázdná cena „${z}“ = nezadáno`, JSON.stringify(c(z)));
  }
  over('M6', mezery(U.formatKc(2100)) === '2 100 Kč' && mezery(U.formatKc(1470.4)) === '1 470 Kč' && mezery(U.formatEur(75)) === '75 €'
    && mezery(U.formatEur(75.5)) === '75,50 €' && mezery(U.formatCastka(1050, 'kc')) === '1 050 Kč' && mezery(U.formatCastka(12.25, 'eur')) === '12,25 €',
    'formatKc a formatEur');
  // Praha: letní i zimní čas, neplatné datum
  over('M7', P.prahaNaIso('2026-10-23', '15:00') === '2026-10-23T13:00:00.000Z' && P.prahaNaIso('2026-12-01', '09:00') === '2026-12-01T08:00:00.000Z'
    && P.prahaNaIso('2026-02-30', '09:00') === null && P.prahaNaIso('2026-10-23', '25:00') === null && P.prahaNaIso('', '') === null,
    'pražský den a čas jako okamžik (CEST +2, CET +1), neplatné = null', `${P.prahaNaIso('2026-10-23', '15:00')} ${P.prahaNaIso('2026-12-01', '09:00')}`);
  over('M8', P.prahaDen('2026-10-22T22:30:00Z') === '2026-10-23' && P.prahaCas('2026-10-22T22:30:00Z') === '00:30', 'den a čas v Praze po půlnoci UTC');
  over('M9', U.formatKdy('2026-10-22T13:00:00Z') === 'čt 22. 10. v 15:00' && U.formatKdy('2026-10-26T08:05:00Z') === 'po 26. 10. v 9:05' && U.formatKdy(null) === '—',
    'formatKdy „čt 22. 10. v 15:00“ (po změně času v zimě +1 h)', U.formatKdy('2026-10-22T13:00:00Z'));
  over('M10', U.formatKdyVeta('2026-10-22T13:00:00Z', '2026-10-20') === 've čtvrtek 22. 10. v 15:00' && U.formatKdyVeta('2026-10-21T16:00:00Z', '2026-10-21') === 'dnes v 18:00'
    && U.formatKdyVeta('2026-10-22T07:00:00Z', '2026-10-21') === 'zítra v 9:00' && U.formatKdyVeta('2026-10-21T08:00:00Z', '2026-10-22') === 'včera v 10:00'
    && U.formatKdyVeta('2026-10-21T10:00:00Z', '2026-10-19') === 've středu 21. 10. v 12:00',
    'věta „dnes v …“, „zítra v …“, „ve čtvrtek 22. 10. v 15:00“');
  const t0 = Date.parse('2026-10-21T10:00:00Z');
  const rel = (ms) => U.formatRelativne(new Date(t0 + ms).toISOString(), t0);
  over('M11', rel(20 * 1000) === 'teď' && rel(15 * MIN) === 'za 15 min' && rel(-15 * MIN) === 'před 15 min' && rel(2 * 60 * MIN) === 'za 2 h'
    && rel(-3 * 60 * MIN) === 'před 3 h' && rel(26 * 60 * MIN) === 'za 1 den' && rel(42 * 60 * MIN) === 'za 2 dny' && rel(5 * 24 * 60 * MIN) === 'za 5 dní'
    && rel(-24 * 60 * MIN) === 'před 1 dnem' && rel(-3 * 24 * 60 * MIN) === 'před 3 dny',
    'relativní čas česky', [rel(20000), rel(15 * MIN), rel(42 * 60 * MIN), rel(-3 * 24 * 60 * MIN)].join(' | '));
  over('M12', U.STATUS_LABELS.nerelevantni === 'Nerelevantní' && U.ALL_STATUSES.includes('nerelevantni')
    && U.STATUS_COLORS.nerelevantni && U.STATUS_COLORS.nerelevantni.bg !== U.STATUS_COLORS.odmitnuto.bg,
    'stav Nerelevantní má popisek a vlastní barvu (jinou než Odmítnuto)');
  // výběr času (ZavolatModal): rychlé volby a hlášky jako server
  const ted = Date.parse('2026-10-21T08:00:00Z'); // 10:00 v Praze
  const volby = O.rychleVolby(ted);
  over('M13', volby.map((x) => `${x.popis}=${x.datum} ${x.cas}`).join('|') === 'Za hodinu=2026-10-21 11:00|Dnes 18:00=2026-10-21 18:00|Zítra 9:00=2026-10-22 09:00|Zítra 14:00=2026-10-22 14:00|Za týden=2026-10-28 10:00',
    'rychlé volby (Za hodinu, Dnes 18:00, Zítra 9:00, Zítra 14:00, Za týden) v Praze', volby.map((x) => `${x.popis}=${x.datum} ${x.cas}`).join('|'));
  over('M13b', !O.rychleVolby(Date.parse('2026-10-21T17:30:00Z')).some((x) => x.popis === 'Dnes 18:00'), 'po 18. hodině volba „Dnes 18:00“ není');
  over('M14', O.chybaCasu(null, ted) === 'Vyberte den a čas, kdy zavolat.' && O.chybaCasu(new Date(ted - 11 * MIN).toISOString(), ted) === 'Ten čas už je pryč. Vyberte den a čas, který teprve přijde.'
    && O.chybaCasu(new Date(ted - 9 * MIN).toISOString(), ted) === null && O.chybaCasu(new Date(ted + 367 * 86400000).toISOString(), ted) === 'Hovor jde naplánovat nejvýš rok dopředu.',
    'okno hlídá čas stejnými hláškami jako server (10 minut zpět, nejvýš rok)');
  const H15 = 'Přeplánovat jde nejdřív za 15 minut. Když chce člověk mluvit hned, dokončete hovor teď.';
  over('M15', O.HLASKA_15_MINUT === H15 && O.chybaCasu(new Date(ted + 10 * MIN).toISOString(), ted, 15) === H15
    && O.chybaCasu(new Date(ted + 15 * MIN).toISOString(), ted, 15) === null && O.chybaCasu(new Date(ted + 10 * MIN).toISOString(), ted) === null,
    'Přeplánovat: okno chce aspoň 15 minut dopředu (stejná hláška jako resolve_call), kalendář ne');
  const pozde = Date.parse('2026-10-21T15:50:00Z'); // 17:50 v Praze
  over('M16', O.rychleVolby(pozde, 15).every((v) => v.popis !== 'Dnes 18:00') && O.rychleVolby(pozde).some((v) => v.popis === 'Dnes 18:00')
    && O.rychleVolby(pozde, 15).some((v) => v.popis === 'Za hodinu'), 'u Přeplánovat se nenabídne volba dřív než za 15 minut (v 17:50 „Dnes 18:00“ ne)');
});

/* ---------------- Z) připomínky (src/zavolat.tsx): dnešní a po termínu, okno −5 až +30 minut, každý hovor jednou ---------------- */
await blok('Z', async () => {
  const t0 = Date.parse('2026-10-21T10:00:00Z');
  const pol = (id, kdy, extra = {}) => ({ id, kontakt_id: id, kdy: new Date(kdy).toISOString(), stav: 'ceka', muj: true, ...extra });
  const s = { dnes: '2026-10-21', ted: new Date(t0).toISOString(), polozky: [
    pol(1, t0 + 3 * 60 * MIN), pol(2, t0 - 26 * 60 * MIN), pol(3, t0 + 20 * 60 * MIN * 3 * 24), pol(4, t0 + 4 * MIN),
    pol(5, t0 - 10 * MIN, { stav: 'hotovo' }), pol(6, t0 + 2 * MIN, { muj: false }), pol(7, t0 - 31 * MIN),
  ] };
  const dnes = Z.dnesAPoTerminu(s).map((x) => x.id);
  over('Z1', JSON.stringify(dnes) === '[2,7,4,1]', 'odznak a lišta: vlastní čekající na dnešek a po termínu, nejstarší první', JSON.stringify(dnes));
  over('Z2', Z.kUpozorneni(s, t0, new Set())?.id === 4, 'upozornění na hovor za 4 minuty (okno 5 minut před)');
  const kl = (id) => Z.klicPripominky(s.polozky.find((x) => x.id === id));
  over('Z3', Z.kUpozorneni(s, t0, new Set([kl(4)])) === null, 'hovor, na který už appka upozornila, znovu ne; 31 minut po termínu ani cizí ne');
  over('Z4', Z.kUpozorneni(s, t0 - 2 * MIN, new Set([kl(7)])) === null && Z.kUpozorneni(s, t0 - MIN, new Set([kl(7)]))?.id === 4, 'okno začíná 5 minut před časem hovoru');
  over('Z5', Z.kUpozorneni(s, t0 + 3 * 60 * MIN + 29 * MIN, new Set([kl(4)]))?.id === 1 && Z.kUpozorneni(s, t0 + 3 * 60 * MIN + 31 * MIN, new Set([kl(4)])) === null,
    'okno končí 30 minut po čase hovoru');
  over('Z6', Z.PRIPOMINKA_PRED_MS === 5 * MIN && Z.PRIPOMINKA_PO_MS === 30 * MIN && Z.LS_PRIPOMENUTO === 'volacka_zavolat_pripomenuto_', 'okno −5 až +30 minut, paměť v localStorage na člověka');
  over('Z7', Z.dnesAPoTerminu(null).length === 0 && Z.kUpozorneni(null, t0, new Set()) === null, 'bez kalendáře (server bez migrace 050) nic');
  // po recenzi 21. 10. 2026: paměť je „id|kdy“, přesunutý hovor (stejné id, jiný čas) připomene znovu
  const presunuty = { ...s, polozky: s.polozky.map((x) => (x.id === 4 ? { ...x, kdy: new Date(t0 + 2 * MIN).toISOString() } : x)) };
  over('Z8', Z.klicPripominky({ id: 4, kdy: '2026-10-21T10:04:00Z' }) === '4|2026-10-21T10:04:00.000Z' && Z.kUpozorneni(presunuty, t0, new Set([kl(4)]))?.id === 4,
    'přesunutý hovor (nový čas) připomene znovu');
});

/* ---------------- K) kalendář: seznam, práva a maska kontaktu (zavolat_*) ---------------- */
await blok('K', async () => {
  await chyba('K1', () => api.zavolatSeznam(petra, 3), presne('Kalendář jiného člověka vidí jen super admin.'), 'Volající cizí kalendář nevidí');
  await chyba('K1b', () => api.zavolatSeznam(petra, null, true), presne('Kalendář jiného člověka vidí jen super admin.'), 'Volající kalendář všech nevidí');
  await chyba('K1c', () => api.zavolatSeznam(petra, 9999), presne('Kalendář jiného člověka vidí jen super admin.'), 'Volající podle hlášky nepozná, které id existuje');
  const s = await api.zavolatSeznam(petra);
  over('K2', s.dnes === P.prahaDen(new Date()) && typeof s.ted === 'string' && Array.isArray(s.polozky), 'zavolat_seznam vrací dnes (Praha), ted a polozky');
  const p = s.polozky;
  const pend = p.filter((z) => z.stav === 'ceka').map((z) => z.kontakt_id);
  over('K3', JSON.stringify(pend) === '[10,9,12]' && p[p.length - 1]?.stav === 'hotovo' && p[p.length - 1]?.kontakt_id === 4 && p.every((z) => z.user_id === 2 && z.muj),
    'Petra: jen svoje, čekající od nejstaršího (i po termínu), uzavřené na konci', JSON.stringify(p.map((z) => [z.kontakt_id, z.stav])));
  const [z10, z9, z12] = [10, 9, 12].map((k) => p.find((z) => z.kontakt_id === k));
  over('K4', z10.ve_fronte === true && z9.ve_fronte === false && z12.ve_fronte === true && z10.smi_upravit && !p[p.length - 1].smi_upravit
    && z9.vytvoril === 'Albert' && z10.vytvoril === 'Petra' && z10.volajici === 'Petra',
    've_fronte, smi_upravit (jen čekající), kdo naplánoval (Albert vidět je)', JSON.stringify(z9).slice(0, 200));
  over('K4b', Object.keys(z10).sort().join() === 'created_at,id,kdy,kontakt,kontakt_id,muj,poznamka,smi_upravit,stav,user_id,uzavreno_at,ve_fronte,volajici,vysledek,vytvoril,zmeneno_at',
    'položka kalendáře má klíče jako app_zavolat_ven', Object.keys(z10).sort().join());
  over('K4c', z10.kontakt.skryto === false && z10.kontakt.status === 'nedovolano' && z10.kontakt.smi_upravit === true && !('cekani_kind' in z10.kontakt),
    'kontakt vlastního klienta je celý (maska ze seznamů)');
  const h = (await seznam(honza)).filter((z) => z.stav === 'ceka');
  over('K5', h.length === 1 && h[0].kontakt_id === 11 && h[0].user_id === 3, 'Honza vidí jen svůj čekající hovor', JSON.stringify(h.map((z) => z.kontakt_id)));
  const vse = await seznam(mikulas, null, true);
  over('K6', vse.filter((z) => z.stav === 'ceka').length === 4 && vse.some((z) => z.volajici === 'Honza') && vse.some((z) => z.volajici === 'Petra'),
    'super admin vidí kalendář všech', `${vse.length}`);
  over('K6b', (await seznam(mikulas, 2)).length === p.length && (await seznam(mikulas)).length === 0, 'super admin vidí Petřin kalendář; svůj má prázdný');

  // maska: hovor, který super admin naplánoval Petře u Honzova klienta (3, zájem), Petra vidí jen se základem kontaktu
  const z3 = await api.zavolatNaplanovat(mikulas, 3, za(3 * 60 * MIN), 'Zavolej mu kvůli fotkám', 2);
  over('K7', z3.user_id === 2 && z3.vytvoril === 'Mikuláš' && z3.muj === false && z3.smi_upravit === true && z3.kontakt.skryto === false,
    'super admin naplánuje hovor komukoli a vybere, kdo zavolá', JSON.stringify(z3).slice(0, 160));
  const z3p = await cekajici(petra, 3);
  const navic = Object.keys(z3p?.kontakt ?? {}).filter((k) => !['id', 'segment', 'name', 'firma', 'phone', 'email', 'web', 'ma_web', 'obor', 'mesto',
    'ico_osobni', 'ico_firma', 'dph_osobni', 'dph_firma', 'je_muj', 'skryto', 'smi_upravit'].includes(k));
  over('K8', z3p?.kontakt.skryto === true && navic.length === 0 && !('status' in z3p.kontakt) && !('email' in z3p.kontakt) && z3p.vytvoril === 'Mikuláš' && z3p.muj === true,
    'Petra u cizího klienta v kalendáři jen allowlist se skryto (bez stavu, poznámky, e-mailu chaty)', navic.join());
  await api.zavolatZrusit(mikulas, z3.id);
  // kdo naplánoval: jiný Volající je „jiný volající“
  const z8 = await api.zavolatNaplanovat(honza, 8, za(5 * 60 * MIN), null);
  over('K9', z8.vytvoril === 'Honza' && z8.muj, 'Volající si naplánuje hovor svému klientovi');
  await api.zavolatPresunout(mikulas, z8.id, za(6 * 60 * MIN), 'přeřazeno', 2);
  const z8p = await cekajici(petra, 8);
  over('K10', z8p?.vytvoril === 'jiný volající' && z8p.id === z8.id && z8p.poznamka === 'přeřazeno' && (await cekajici(mikulas, 8, 2))?.vytvoril === 'Honza',
    'Petra nevidí, který kolega hovor naplánoval; super admin ano', `${z8p?.vytvoril}`);
  over('K10b', !(await seznam(honza)).some((z) => z.kontakt_id === 8 && z.stav === 'ceka'), 'přeřazený hovor z kalendáře Honzy zmizel');
  await api.zavolatZrusit(petra, z8.id);

  // naplánovat: práva napřed, jedna hláška pro cizí kontakt
  const kdy = za(2 * 60 * MIN);
  await chyba('K11', () => api.zavolatNaplanovat(petra, 6, kdy, null, 3), presne('Hovor za jiného člověka plánuje jen super admin.'), 'Volající neplánuje za kolegu');
  await chyba('K11b', () => api.zavolatNaplanovat(petra, 999999, kdy, null, 9999), presne('Hovor za jiného člověka plánuje jen super admin.'), 'práva napřed (nepozná, které id existuje)');
  // po recenzi 21. 10. 2026: Volající jen svému klientovi (⚠ NAHRAZUJE „i kontaktu ve frontě, kterému nikdo nevolal“)
  const JEN_SVUJ = presne('Naplánovat hovor můžete jen svému klientovi (kontaktu, kterému jste volal/a). Kontakt z fronty naplánujete při hovoru tlačítkem Přeplánovat.');
  await chyba('K12', () => api.zavolatNaplanovat(petra, 3, kdy, null), JEN_SVUJ, 'cizí klient mimo frontu: jedna hláška');
  await chyba('K12b', () => api.zavolatNaplanovat(petra, 8, kdy, null), JEN_SVUJ, 'cizí kontakt ve frontě (volal mu kolega): stejná hláška');
  await chyba('K12c', () => api.zavolatNaplanovat(petra, 303, kdy, null), JEN_SVUJ, 'cizí architekt: stejná hláška');
  await chyba('K12d', () => api.zavolatNaplanovat(petra, 999999, kdy, null), presne('Kontakt id=999999 neexistuje.'), 'neexistující kontakt');
  // čas a poznámka (app_zavolat_over_kdy, app_zavolat_poznamka)
  await chyba('K13', () => api.zavolatNaplanovat(petra, 6, null, null), presne('Vyberte den a čas, kdy zavolat.'), 'bez času');
  await chyba('K13b', () => api.zavolatNaplanovat(petra, 6, za(-11 * MIN), null), presne('Ten čas už je pryč. Vyberte den a čas, který teprve přijde.'), 'čas před víc než 10 minutami');
  await chyba('K13c', () => api.zavolatNaplanovat(petra, 6, za(367 * 86400000), null), presne('Hovor jde naplánovat nejvýš rok dopředu.'), 'víc než rok dopředu');
  await chyba('K13d', () => api.zavolatNaplanovat(petra, 6, kdy, 'x'.repeat(501)), presne('Poznámka k naplánovanému hovoru může mít nejvýš 500 znaků.'), 'poznámka nad 500 znaků');
  over('K13e', (await radek(6))?.last_caller === null && !(await cekajici(petra, 6)), 'odmítnuté plánování nic nezměnilo');

  // volný kontakt ve frontě: Volající ho sám nenaplánuje (přeplánuje ho při hovoru); super admin ho dá Petře a tím se jí
  // rezervuje (last_caller), zrušení rezervaci vrátí
  await chyba('K14a', () => api.zavolatNaplanovat(petra, 6, kdy, null), JEN_SVUJ, 'volný kontakt z fronty Volající nenaplánuje (žádné rezervace naplánováním)');
  const z6 = await api.zavolatNaplanovat(mikulas, 6, za(-5 * MIN), `  zavolat${String.fromCharCode(7)} po obědě  `, 2);
  over('K14', z6.poznamka === 'zavolat po obědě' && (await radek(6))?.last_caller === 'Petra' && (await api.myKontakty(petra, 500, 0)).rows.some((r) => r.id === 6),
    'super admin dá volný kontakt Petře: rezervuje se jí (je v Moji klienti), poznámka bez řídicích znaků; 5 minut zpět projde', JSON.stringify(z6.poznamka));
  await chyba('K14b', () => api.zavolatNaplanovat(honza, 6, kdy, null), JEN_SVUJ, 'rezervovaný kontakt už kolega naplánovat nemůže');
  const z6b = await api.zavolatNaplanovat(petra, 6, za(4 * 60 * MIN), '   ');
  over('K14c', z6b.id === z6.id && z6b.poznamka === 'zavolat po obědě' && (await seznam(petra)).filter((z) => z.kontakt_id === 6 && z.stav === 'ceka').length === 1,
    'Petra svůj (rezervovaný) hovor přesune znovu naplánováním (jeden na kontakt); bez nové poznámky zůstane stará');
  // super admin ho dá Honzovi: rezervace se vrátí a kontakt se rezervuje Honzovi
  const z6h = await api.zavolatNaplanovat(mikulas, 6, za(4 * 60 * MIN), null, 3);
  over('K15', z6h.id === z6.id && z6h.user_id === 3 && (await radek(6))?.last_caller === 'Honza' && !(await cekajici(petra, 6)),
    'super admin přeřadí hovor Honzovi: Petřina rezervace se vrátí, kontakt se rezervuje Honzovi', `${(await radek(6))?.last_caller}`);
  // přesun s přeřazením (zavolat_presunout): rezervace jde s hovorem zpátky k Petře
  const z6p = await api.zavolatPresunout(mikulas, z6.id, za(5 * 60 * MIN), null, 2);
  over('K15c', z6p.user_id === 2 && (await radek(6))?.last_caller === 'Petra' && (await api.myKontakty(petra, 500, 0)).rows.some((r) => r.id === 6)
    && !(await api.myKontakty(honza, 500, 0)).rows.some((r) => r.id === 6),
    'super admin přesune hovor jinému člověku: rezervace volného kontaktu jde s ním (Honzova se vrátí)', `${(await radek(6))?.last_caller}`);
  const z6s = await api.zavolatPresunout(mikulas, z6.id, za(6 * 60 * MIN), 'jen čas', null);
  over('K15d', z6s.user_id === 2 && (await radek(6))?.last_caller === 'Petra' && z6s.poznamka === 'jen čas', 'přesun bez přeřazení rezervaci nechá');
  await api.zavolatPresunout(mikulas, z6.id, za(6 * 60 * MIN), null, 3);
  await api.zavolatZrusit(honza, z6.id);
  over('K15b', (await radek(6))?.last_caller === null, 'zrušení vrátí rezervaci (Honza kontaktu nevolal)');
  // kontakt s cizím čekajícím hovorem
  const z2 = await api.zavolatNaplanovat(mikulas, 2, kdy, 'Honza zavolá', 3);
  await chyba('K16', () => api.zavolatNaplanovat(petra, 2, kdy, null), presne('Tenhle kontakt už má naplánovaný hovor u jiného člověka. Přesunout ho může on nebo super admin.'),
    'Volající nepřesune cizí naplánovaný hovor svého klienta');
  const z2h = await api.zavolatNaplanovat(honza, 2, za(3 * 60 * MIN), 'posunuto');
  over('K16b', z2h.id === z2.id && z2h.poznamka === 'posunuto', 'ten, kdo má volat, svůj hovor přesune znovu naplánováním');
  await api.zavolatZrusit(mikulas, z2.id);
  // neaktivní člověk
  const nu = await api.createUser(albert, 'neaktivni050', 'heslo-050', 'Neaktivní Test', 'admin', 1);
  await api.updateUser(albert, nu.user_id, { active: false });
  await chyba('K17', () => api.zavolatNaplanovat(mikulas, 6, kdy, null, nu.user_id), presne(`Uživatel id=${nu.user_id} neexistuje nebo není aktivní.`), 'super admin nenaplánuje neaktivnímu');
  await chyba('K17b', () => api.zavolatNaplanovat(mikulas, 6, kdy, null, 99999), presne('Uživatel id=99999 neexistuje nebo není aktivní.'), 'ani neexistujícímu');

  // přesunout, zrušit, hotovo: cizí hovor stejně jako neexistující
  const NENI = (id) => presne(`Naplánovaný hovor id=${id} neexistuje nebo není váš.`);
  await chyba('K18', () => api.zavolatPresunout(honza, z10.id, kdy, null), NENI(z10.id), 'Volající nepřesune cizí hovor');
  await chyba('K18b', () => api.zavolatPresunout(honza, 999999, kdy, null), NENI(999999), 'neexistující hovor stejnou hláškou');
  await chyba('K18c', () => api.zavolatPresunout(petra, z12.id, kdy, null, 3), presne('Hovor jinému člověku přeřadí jen super admin.'), 'Volající hovor nepřeřadí');
  await chyba('K18d', () => api.zavolatPresunout(petra, z12.id, za(-20 * MIN), null), presne('Ten čas už je pryč. Vyberte den a čas, který teprve přijde.'), 'přesun do minulosti');
  await chyba('K18e', () => api.zavolatPresunout(mikulas, z12.id, kdy, null, nu.user_id), presne(`Uživatel id=${nu.user_id} neexistuje nebo není aktivní.`), 'přeřazení neaktivnímu');
  const hotZ = p[p.length - 1];
  await chyba('K18f', () => api.zavolatPresunout(petra, hotZ.id, kdy, null), presne('Hovor už není naplánovaný (je hotový nebo zrušený). Naplánujte nový.'), 'uzavřený hovor se nepřesouvá');
  await chyba('K19', () => api.zavolatZrusit(honza, z10.id), NENI(z10.id), 'Volající nezruší cizí hovor');
  await chyba('K19b', () => api.zavolatZrusit(petra, hotZ.id), presne('Hovor už není naplánovaný (je hotový nebo zrušený).'), 'uzavřený hovor se neruší');
  await chyba('K20', () => api.zavolatHotovo(honza, z9.id), NENI(z9.id), 'Volající neoznačí cizí hovor');
  await chyba('K20b', () => api.zavolatHotovo(petra, hotZ.id), presne('Hovor už není naplánovaný (je hotový nebo zrušený).'), 'uzavřený hovor znovu hotový nebude');
  await chyba('K20c', () => api.zavolatHotovo(petra, z9.id, 'y'.repeat(501)), presne('Poznámka k naplánovanému hovoru může mít nejvýš 500 znaků.'), 'výsledek nad 500 znaků');
  await chyba('K20d', () => api.zavolatHotovo(petra, z12.id), presne('Klient je ve frontě volání: hovor uzavřete výsledkem ve volání (Zavolat teď), nebo ho zrušte.'),
    'klient ve frontě se neoznačí jako hotový (uzavře ho výsledek hovoru nebo zrušení)');
  await chyba('K20e', () => api.zavolatHotovo(honza, z12.id), NENI(z12.id), 'cizí hovor ve frontě: napřed hláška „není váš“ (práva napřed)');
  const pp = await api.zavolatPresunout(petra, z12.id, za(5 * 60 * MIN), null);
  over('K21', pp.id === z12.id && pp.poznamka === null && new Date(pp.kdy).getTime() > Date.now() + 4 * 60 * MIN && pp.zmeneno_at !== null,
    'přesun změní čas a poznámku přepíše (null ji smaže)');

  // Zavolat teď (zavolat_vzit): jen ten, kdo má volat; klient mimo frontu; cizí zámek
  await chyba('K22', () => api.zavolatVzit(mikulas, z10.id), NENI(z10.id), 'ani super admin nevezme kartu za Petru');
  await chyba('K22b', () => api.zavolatVzit(petra, z9.id), presne('Tenhle klient není ve frontě volání, kartu volání pro něj appka nemá. Zavolejte mu (číslo je v kalendáři) a hovor pak označte jako hotový.'),
    'klient mimo frontu kartu ve volání nemá');
  const kH = await api.nextContact(honza, 'chata');
  over('K23', kH && kH.zavolat === null && ![10, 11, 12].includes(kH.id), 'karta ve volání má klíč zavolat (null) a kontakty s čekajícím hovorem nikomu jinému nenabídne', kH && `${kH.id} ${JSON.stringify(kH.zavolat)}`);
  const zH = await api.zavolatNaplanovat(mikulas, kH.id, kdy, null, 2);
  await chyba('K23b', () => api.zavolatVzit(petra, zH.id), presne('Kontakt teď volá někdo jiný. Zkuste to za chvíli.'), 'kontakt volá kolega (zámek mladší 2 h)');
  await api.zavolatZrusit(mikulas, zH.id);
  await api.returnContact(honza, kH.id);
  const k10 = await api.zavolatVzit(petra, z10.id);
  over('K24', k10.id === 10 && k10.lock_by === 2 && k10.zavolat?.id === z10.id && k10.zavolat.poznamka === 'Byl v práci, ať zavoláme odpoledne.'
    && Object.keys(k10.zavolat).sort().join() === 'id,kdy,poznamka', '„Zavolat teď“ zamkne kontakt Petře a vrátí kartu s klíčem zavolat', JSON.stringify(k10.zavolat));
  // po recenzi 21. 10. 2026: vlastní platný zámek si čas nechá (30 minut na vrácení a 2 h zámku běží od vzetí karty)
  const zamekPred = (await radek(10))?.lock_at;
  await new Promise((r) => puvodniTimeout(r, 15));
  const k10b = await api.zavolatVzit(petra, z10.id);
  over('K24b', k10b.id === 10 && !!zamekPred && (await radek(10))?.lock_at === zamekPred, '„Zavolat teď“ u vlastní zamčené karty zámek neposune', `${zamekPred} → ${(await radek(10))?.lock_at}`);
  await api.returnContact(petra, 10);
  // čekající hovor kontaktu (zavolat_kontaktu): Volající jen svůj, super admin kterýkoli, jinak null
  const zk12 = await api.zavolatKontaktu(petra, 12);
  const zk11p = await api.zavolatKontaktu(petra, 11);
  const zk11m = await api.zavolatKontaktu(mikulas, 11);
  const zk1 = await api.zavolatKontaktu(mikulas, 1);
  over('K26', zk12?.id === z12.id && zk12.muj && zk11p === null && zk11m?.volajici === 'Honza' && zk11m.muj === false && zk1 === null,
    'zavolat_kontaktu: Petra svůj hovor, cizí ne (null); super admin i Honzův; bez hovoru null', JSON.stringify({ a: zk12?.id, b: zk11p, c: zk11m?.volajici, d: zk1 }));
  // jen čekající (p_jen_cekajici): připomínky nepotřebují uzavřené hovory
  const jen = (await api.zavolatSeznam(petra, null, false, true)).polozky;
  over('K27', jen.length > 0 && jen.every((z) => z.stav === 'ceka') && (await seznam(petra)).some((z) => z.stav !== 'ceka'),
    'zavolat_seznam s p_jen_cekajici vrátí jen čekající hovory');
  // hotovo u klienta mimo frontu
  const h9 = await api.zavolatHotovo(petra, z9.id, null);
  const z9po = (await seznam(petra)).find((z) => z.id === z9.id);
  over('K25', h9.ok && h9.id === z9.id && z9po?.stav === 'hotovo' && z9po.vysledek === 'hotovo' && z9po.uzavreno_at && !z9po.smi_upravit,
    'Hotovo uzavře hovor (výsledek „hotovo“) a zůstane v uzavřených', JSON.stringify(z9po).slice(0, 160));
});

/* ---------------- N) nerelevantní: výsledek jen s důvodem, konečný stav, mimo konverzi ---------------- */
await blok('N', async () => {
  const pred = await api.myStats(petra);
  const predV = await api.statistikyVolani(petra);
  const k = await api.nextContact(petra, 'chata');
  over('N0', k?.id === 10 && k.zavolat !== null, 'Petře přijde napřed její hovor po termínu (průchod 0b)', k && `${k.id}`);
  await chyba('N1', () => api.resolveCall(petra, { kontakt_id: k.id, outcome: 'xyz' }),
    presne('Neplatný výsledek hovoru: xyz. Povolené: nedovolano, odmitnuto, zajem, nerelevantni, preplanovano.'), 'neznámý výsledek hovoru');
  const BEZ_DUVODU = presne('Výsledek "nerelevantni" vyžaduje poznámku, proč kontakt není relevantní (třeba starší člověk, není majitel).');
  await chyba('N2', () => api.resolveCall(petra, { kontakt_id: k.id, outcome: 'nerelevantni' }), BEZ_DUVODU, 'nerelevantní bez důvodu neprojde');
  await chyba('N2b', () => api.resolveCall(petra, { kontakt_id: k.id, outcome: 'nerelevantni', note: '  \n  \r\n ' }), BEZ_DUVODU, 'důvod jen z mezer a konců řádků neprojde');
  await chyba('N2c', () => api.resolveCall(honza, { kontakt_id: k.id, outcome: 'nerelevantni', note: 'x' }), /^Tenhle kontakt teď nemáte přidělený/, 'jen se svým zámkem');
  over('N2d', (await api.myStats(petra)).calls === pred.calls && (await radek(10))?.status === 'nedovolano', 'odmítnutý zápis nic nezapsal');
  const r = await api.resolveCall(petra, { kontakt_id: k.id, outcome: 'nerelevantni', note: 'starší člověk · web nechce' });
  const row = await radek(10);
  over('N3', r.status === 'nerelevantni' && row.status === 'nerelevantni' && row.lock_by === null && /\] starší člověk · web nechce$/.test(row.note ?? '')
    && row.last_caller === 'Petra', 'nerelevantní: konečný stav, zámek pryč, důvod v poznámce s hlavičkou', JSON.stringify({ s: row.status, n: row.note }));
  const po = await api.myStats(petra);
  over('N4', po.calls === pred.calls + 1 && po.reached === pred.reached && po.odmitnuto === pred.odmitnuto && po.nedovolano === pred.nedovolano && po.conversion === pred.conversion,
    'do konverze se nepočítá: hovor přibyde, dovoláno, odmítnuto i konverze zůstanou', JSON.stringify({ pred, po }));
  over('N5', (await api.statistikyVolani(petra)).nerelevantni === predV.nerelevantni + 1, 'statistiky_volani: nerelevantní +1');
  const z10 = (await seznam(petra)).find((z) => z.kontakt_id === 10);
  over('N6', z10?.stav === 'hotovo' && z10.vysledek === 'hovor: nerelevantni', 'výsledek hovoru uzavře vlastní naplánovaný hovor („hovor: nerelevantni“)', JSON.stringify(z10?.vysledek));
  const dalsi = await api.nextContact(petra, 'chata');
  over('N7', !dalsi || dalsi.id !== 10, 'nerelevantní kontakt se ve frontě nenabízí');
  if (dalsi) await api.returnContact(petra, dalsi.id);
  // svůj nerelevantní kontakt naplánovat jde (třeba zavolá sám), ale je mimo frontu: karta ve volání pro něj není
  const z = await api.zavolatNaplanovat(petra, 10, za(60 * MIN), null);
  over('N7b', z.ve_fronte === false && z.kontakt.status === 'nerelevantni', 'naplánovaný hovor nerelevantního kontaktu je mimo frontu', JSON.stringify(z.ve_fronte));
  await chyba('N7c', () => api.zavolatVzit(petra, z.id),
    presne('Tenhle klient není ve frontě volání, kartu volání pro něj appka nemá. Zavolejte mu (číslo je v kalendáři) a hovor pak označte jako hotový.'),
    'nerelevantní kontakt kartu ve volání nemá');
  await api.zavolatZrusit(petra, z.id);
  // čekání: nerelevantní nikdy nečeká (kontakt_cekani)
  await api.updateKontakt(albert, 90, { status: 'nerelevantni' });
  const ceka = (await api.listKontakty(albert, { cekani: 'ceka_prvni', limit: 500 })).rows.map((x) => x.id);
  await api.updateKontakt(albert, 90, { status: 'navrh_odeslan' });
  const ceka2 = (await api.listKontakty(albert, { cekani: 'ceka_prvni', limit: 500 })).rows.map((x) => x.id);
  over('N8', !ceka.includes(90) && ceka2.includes(90), 'nerelevantní kontakt se mezi čekajícími na odpověď nepočítá', `${ceka.join()} / ${ceka2.join()}`);
  // pořadí v seznamech: hned za odmítnutými
  const moji = (await api.myKontakty(petra, 500, 0)).rows.map((x) => x.status);
  const iOdm = moji.lastIndexOf('odmitnuto');
  const iNer = moji.indexOf('nerelevantni');
  over('N9', iOdm >= 0 && iNer > iOdm && moji.slice(iNer).every((s) => s === 'nerelevantni'), 'Moji klienti: nerelevantní na konci, za odmítnutými (STATUS_ORDER 31)', moji.join());
});

/* ---------------- P) přeplánovat: čas, kalendář, fronta, uzavření a cizí hovor ---------------- */
await blok('P', async () => {
  const predV = await api.statistikyVolani(petra);
  const predS = await api.myStats(petra);
  const a = await api.nextContact(petra, 'chata');
  if (!a) { over('P0', false, 'fronta chat je prázdná, nejde změřit'); return; }
  over('P0', a.zavolat === null, 'karta bez naplánovaného hovoru má zavolat null');
  await chyba('P1', () => api.resolveCall(petra, { kontakt_id: a.id, outcome: 'preplanovano' }), presne('Vyberte den a čas, kdy zavolat.'), 'přeplánovat bez času');
  await chyba('P1b', () => api.resolveCall(petra, { kontakt_id: a.id, outcome: 'preplanovano', kdy: za(-30 * MIN) }),
    presne('Ten čas už je pryč. Vyberte den a čas, který teprve přijde.'), 'přeplánovat do minulosti');
  await chyba('P1d', () => api.resolveCall(petra, { kontakt_id: a.id, outcome: 'preplanovano', kdy: za(10 * MIN) }),
    presne('Přeplánovat jde nejdřív za 15 minut. Když chce člověk mluvit hned, dokončete hovor teď.'), 'přeplánovat dřív než za 15 minut');
  await chyba('P1c', () => api.resolveCall(petra, { kontakt_id: a.id, outcome: 'preplanovano', kdy: za(400 * 86400000) }),
    presne('Hovor jde naplánovat nejvýš rok dopředu.'), 'přeplánovat víc než rok dopředu');
  const kdy1 = za(24 * 60 * MIN);
  const r = await api.resolveCall(petra, { kontakt_id: a.id, outcome: 'preplanovano', kdy: kdy1, note: 'zavolat zítra' });
  const row = await radek(a.id);
  const z = await cekajici(petra, a.id);
  over('P2', r.status === 'nedovolano' && row.status === 'nedovolano' && row.lock_by === null && row.last_caller === 'Petra',
    'přeplánováno: kontakt zůstane ve frontě (nedovoláno), zámek pryč, je Petřin', JSON.stringify({ s: row.status, l: row.lock_by }));
  over('P3', z && new Date(z.kdy).getTime() === new Date(kdy1).getTime() && z.poznamka === 'zavolat zítra' && z.vytvoril === 'Petra' && z.ve_fronte,
    'v kalendáři je Petřin hovor na zvolený čas s poznámkou z hovoru', JSON.stringify(z).slice(0, 160));
  over('P4', (await api.myStats(petra)).calls === predS.calls + 1 && (await api.myStats(petra)).reached === predS.reached
    && (await api.statistikyVolani(petra)).preplanovano === predV.preplanovano + 1, 'hovor se počítá do hovorů, ne do dovoláno; přeplánováno +1');
  // znovu: vlastní čekající hovor se přesune (stejné id), poznámka prvních 500 znaků, prázdná poznámka ji nechá
  await api.zavolatVzit(petra, z.id);
  const kdy2 = za(48 * 60 * MIN);
  await api.resolveCall(petra, { kontakt_id: a.id, outcome: 'preplanovano', kdy: kdy2, note: 'p'.repeat(600) });
  let z2 = await cekajici(petra, a.id);
  over('P5', z2?.id === z.id && new Date(z2.kdy).getTime() === new Date(kdy2).getTime() && z2.poznamka.length === 500, 'přeplánování znovu hovor přesune, poznámka do 500 znaků', `${z2?.id} ${z2?.poznamka?.length}`);
  await api.zavolatVzit(petra, z.id);
  await api.resolveCall(petra, { kontakt_id: a.id, outcome: 'preplanovano', kdy: kdy1 });
  z2 = await cekajici(petra, a.id);
  over('P5b', z2?.poznamka?.length === 500, 'přeplánování bez poznámky nechá poznámku hovoru');
  // fronta: kontakt s čekajícím hovorem nikdo nedostane, ani Petra, dokud čas nenastane
  const videne = [];
  for (const [tok] of [[honza], [petra], [eva]]) {
    for (let i = 0; i < 25; i++) {
      const c = await api.nextContact(tok, 'chata');
      if (!c) break;
      videne.push(c.id);
      await api.resolveCall(tok, { kontakt_id: c.id, outcome: 'nedovolano' });
    }
  }
  over('P6', videne.length > 0 && !videne.includes(a.id) && !videne.includes(11) && !videne.includes(12), 'kontakt s čekajícím hovorem (i cizím) se nikomu nenabídne', `${a.id}: ${videne.join()}`);
  // čas nastal (10 minut zpět jde): průchod 0b dá kartu Petře, i když jí dnes volala
  await api.zavolatPresunout(petra, z.id, za(-5 * MIN), 'teď');
  const due = await api.nextContact(petra, 'chata');
  over('P7', due?.id === a.id && due.zavolat?.id === z.id && due.zavolat.poznamka === 'teď', 'když čas hovoru nastane, karta přijde Petře (i po termínu)', due && `${due.id}`);
  over('P7b', (await api.nextContact(petra, 'architekt'))?.id !== a.id, 'průchod 0b jen ve svém segmentu');
  const arch = await api.nextContact(petra, 'architekt');
  if (arch) await api.returnContact(petra, arch.id);
  await api.resolveCall(petra, { kontakt_id: a.id, outcome: 'nedovolano' });
  const zHot = (await seznam(petra)).find((x) => x.id === z.id);
  over('P8', zHot?.stav === 'hotovo' && zHot.vysledek === 'hovor: nedovolano', 'jiný výsledek hovoru vlastní naplánovaný hovor uzavře', JSON.stringify(zHot?.vysledek));
  // cizí čekající hovor: nedovoláno ho nechá, odmítnutí (kontakt opustil frontu) ho zruší
  const b = a.id;
  const zb = await api.zavolatNaplanovat(mikulas, b, za(-5 * MIN), null, 2);
  const kb = await api.nextContact(petra, 'chata');
  await api.zavolatPresunout(mikulas, zb.id, za(60 * MIN), 'Honza', 3);
  await api.resolveCall(petra, { kontakt_id: kb.id, outcome: 'nedovolano' });
  over('P9', kb.id === b && (await cekajici(mikulas, b, 3))?.id === zb.id, 'cizí čekající hovor kontaktu ve frontě výsledek hovoru nezruší');
  await api.zavolatPresunout(mikulas, zb.id, za(-5 * MIN), null, 2);
  await api.nextContact(petra, 'chata');
  await api.zavolatPresunout(mikulas, zb.id, za(60 * MIN), null, 3);
  await api.resolveCall(petra, { kontakt_id: b, outcome: 'odmitnuto' });
  const zbPo = (await seznam(mikulas, 3)).find((x) => x.id === zb.id);
  over('P10', zbPo?.stav === 'zruseno' && zbPo.vysledek === 'kontakt už není ve frontě volání', 'kontakt opustil frontu: cizí hovor se zruší', JSON.stringify(zbPo?.vysledek));
  // přeplánování kontaktu s cizím hovorem: ten se zruší a vznikne vlastní
  const veFronte = async (id) => ['nekontaktovano', 'nedovolano'].includes((await radek(id))?.status);
  let c2 = null;
  for (const id of [2, 8, 6, 1]) if (id !== a.id && !c2 && (await veFronte(id)) && !(await cekajici(mikulas, id, null, true))) c2 = id;
  const zc = await api.zavolatNaplanovat(mikulas, c2, za(-5 * MIN), null, 2);
  const kc = await api.nextContact(petra, 'chata');
  await api.zavolatPresunout(mikulas, zc.id, za(60 * MIN), null, 3);
  await api.resolveCall(petra, { kontakt_id: kc.id, outcome: 'preplanovano', kdy: za(90 * MIN), note: 'převzala jsem' });
  const zcPo = (await seznam(mikulas, 3)).find((x) => x.id === zc.id);
  const nova = await cekajici(petra, c2);
  over('P11', kc.id === c2 && zcPo?.stav === 'zruseno' && zcPo.vysledek === 'přeplánováno při jiném hovoru' && nova && nova.id !== zc.id && nova.poznamka === 'převzala jsem',
    'přeplánování převezme cizí hovor: ten se zruší s neutrálním textem, vznikne vlastní', JSON.stringify({ z: zcPo?.vysledek, n: nova?.id }));

  // supabase.ts: p_kdy jen u přeplánovaného hovoru (starý server ho nezná), nová RPC s názvy parametrů jako SQL
  odeslano.length = 0;
  await supabaseApi.resolveCall('tok', { kontakt_id: 5, outcome: 'nedovolano', note: 'x' });
  await supabaseApi.resolveCall('tok', { kontakt_id: 5, outcome: 'nerelevantni', note: 'x', kdy: '2026-10-23T13:00:00.000Z' });
  await supabaseApi.resolveCall('tok', { kontakt_id: 5, outcome: 'preplanovano', kdy: '2026-10-23T13:00:00.000Z' });
  over('P12', odeslano.length === 3 && !('p_kdy' in odeslano[0].body) && !('p_kdy' in odeslano[1].body) && odeslano[2].body.p_kdy === '2026-10-23T13:00:00.000Z'
    && odeslano.every((o) => /\/rpc\/resolve_call$/.test(o.url)), 'resolve_call posílá p_kdy jen u preplanovano', JSON.stringify(odeslano.map((o) => Object.keys(o.body))));
  odeslano.length = 0;
  await supabaseApi.zavolatSeznam('tok', 3, true);
  await supabaseApi.zavolatKontaktu('tok', 7);
  await supabaseApi.zavolatNaplanovat('tok', 7, '2026-10-23T13:00:00.000Z', 'pozn', 2);
  await supabaseApi.zavolatPresunout('tok', 9, '2026-10-23T13:00:00.000Z', null, null);
  await supabaseApi.zavolatZrusit('tok', 9);
  await supabaseApi.zavolatHotovo('tok', 9, 'ok');
  await supabaseApi.zavolatVzit('tok', 9);
  await supabaseApi.statistikyVolani('tok', 2);
  const tvar = odeslano.map((o) => `${o.url.split('/rpc/')[1]}(${Object.keys(o.body).join(',')})`).join(' ');
  over('P13', tvar === 'zavolat_seznam(p_token,p_user_id,p_vsichni,p_jen_cekajici) zavolat_kontaktu(p_token,p_kontakt_id) zavolat_naplanovat(p_token,p_kontakt_id,p_kdy,p_poznamka,p_user_id) '
    + 'zavolat_presunout(p_token,p_id,p_kdy,p_poznamka,p_user_id) zavolat_zrusit(p_token,p_id) zavolat_hotovo(p_token,p_id,p_vysledek) '
    + 'zavolat_vzit(p_token,p_id) statistiky_volani(p_token,p_user_id)', 'appka volá RPC 050 s parametry jako migrace', tvar);
});

/* ---------------- R) recenze 21. 10. 2026: hovory neaktivního člověka, jen vlastní klienti ---------------- */
await blok('R', async () => {
  const kdy = za(26 * 60 * MIN);
  const NEAKTIVNI = 'člověk, který měl volat, už není aktivní';
  // hovory neaktivního člověka: průchody 1 a 2 je nepočítají (průchod 0b beze změny)
  const u = await api.createUser(albert, 'docasny050', 'heslo-050', 'Dočasný Test', 'admin', 1);
  const jeho = {};
  for (const id of [300, 301, 302]) {
    const st = (await radek(id))?.status;
    if (st === 'nekontaktovano' || st === 'nedovolano') jeho[id] = (await api.zavolatNaplanovat(mikulas, id, kdy, null, u.user_id)).id;
  }
  const a1 = await api.nextContact(honza, 'architekt');
  over('R1', Object.keys(jeho).length === 3 && a1 === null, 'architekti s čekajícím hovorem aktivního člověka se nikomu nenabídnou', a1 && `${a1.id}`);
  await api.updateUser(albert, u.user_id, { active: false });
  const a2 = await api.nextContact(honza, 'architekt');
  over('R2', !!a2 && [300, 301, 302].includes(a2.id), 'po deaktivaci jeho hovory kontakty neblokují', a2 && `${a2.id}`);
  if (a2) await api.returnContact(honza, a2.id);
  const vse = await seznam(mikulas, null, true);
  over('R3', Object.values(jeho).every((id) => vse.some((z) => z.id === id && z.stav === 'ceka' && z.volajici === 'Dočasný Test')),
    'hovory neaktivního člověka super admin dál vidí ve „Všichni volající“ (přeřadí nebo zruší)');
  // naplánování kontaktu, jehož hovor drží neaktivní člověk: starý se zruší, vznikne nový (302 je Petřin klient)
  const n302 = await api.zavolatNaplanovat(petra, 302, kdy, 'převzato');
  const s302 = (await seznam(mikulas, null, true)).find((z) => z.id === jeho[302]);
  over('R4', n302.id !== jeho[302] && n302.user_id === 2 && s302?.stav === 'zruseno' && s302.vysledek === NEAKTIVNI,
    'hovor neaktivního člověka naplánování nahradí (zruší se s vysvětlením, vznikne nový)', JSON.stringify(s302?.vysledek));
  // přeplánování ve volání: totéž (Petře přijde 300 nebo 301, hovor neaktivního je neblokuje)
  const ka = await api.nextContact(petra, 'architekt');
  over('R5', !!ka && [300, 301].includes(ka.id), 'Petra dostane architekta s hovorem neaktivního člověka', ka && `${ka.id}`);
  if (ka) {
    await api.resolveCall(petra, { kontakt_id: ka.id, outcome: 'preplanovano', kdy, note: 'zítra' });
    const sk = (await seznam(mikulas, null, true)).find((z) => z.id === jeho[ka.id]);
    over('R6', sk?.stav === 'zruseno' && sk.vysledek === NEAKTIVNI && (await cekajici(petra, ka.id))?.user_id === 2,
      'přeplánování nahradí hovor neaktivního člověka stejným vysvětlením', JSON.stringify(sk?.vysledek));
  }
  // zbylý kontakt (rezervovaný neaktivnímu): Volající ho nenaplánuje, super admin ho dá Petře a rezervace jde s ním
  const zbyl = [300, 301].find((id) => id !== ka?.id);
  await chyba('R7', () => api.zavolatNaplanovat(petra, zbyl, kdy, null),
    presne('Naplánovat hovor můžete jen svému klientovi (kontaktu, kterému jste volal/a). Kontakt z fronty naplánujete při hovoru tlačítkem Přeplánovat.'),
    'kontakt, který není Petřin (ani volný z fronty), Petra nenaplánuje');
  const nz = await api.zavolatNaplanovat(mikulas, zbyl, kdy, null, 2);
  const sz = (await seznam(mikulas, null, true)).find((z) => z.id === jeho[zbyl]);
  over('R8', nz.id !== jeho[zbyl] && sz?.vysledek === NEAKTIVNI && (await radek(zbyl))?.last_caller === 'Petra',
    'super admin naplánuje kontakt s hovorem neaktivního: starý se zruší, rezervace přejde na Petru', `${(await radek(zbyl))?.last_caller}`);
  // jiný výsledek hovoru (nedovoláno, kontakt zůstává ve frontě) hovor neaktivního člověka taky zruší
  const u2 = await api.createUser(albert, 'docasny050b', 'heslo-050', 'Dočasný Druhý', 'admin', 1);
  const zu2 = await api.zavolatNaplanovat(mikulas, zbyl, kdy, null, u2.user_id);
  await api.updateUser(albert, u2.user_id, { active: false });
  const kz = await api.nextContact(petra, 'architekt');
  if (kz) await api.resolveCall(petra, { kontakt_id: kz.id, outcome: 'nedovolano' });
  const su2 = (await seznam(mikulas, null, true)).find((z) => z.id === zu2.id);
  over('R9', kz?.id === zbyl && su2?.stav === 'zruseno' && su2.vysledek === NEAKTIVNI,
    'nedovoláno zruší hovor deaktivovaného člověka, i když kontakt zůstává ve frontě', JSON.stringify({ k: kz?.id, v: su2?.vysledek }));
  for (const z of (await seznam(petra)).filter((x) => x.stav === 'ceka' && [300, 301, 302].includes(x.kontakt_id))) await api.zavolatZrusit(petra, z.id);
});

/* ---------------- S) zapojení: test v npm test, stránka v appce, Zapsat Nedovoláno zůstává ---------------- */
await blok('S', async () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  over('S1', /node tests\/volani\.test\.mjs/.test(pkg.scripts?.test ?? ''), 'npm test pouští tests/volani.test.mjs');
  const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8');
  over('S2', /path="\/kalendar"/.test(app) && /<ZavolatProvider>/.test(app) && /to="\/kalendar"/.test(app), 'appka má záložku kalendář, stránku /kalendar a připomínky');
  const call = readFileSync(join(ROOT, 'src/pages/CallPage.tsx'), 'utf8');
  over('S3', call.includes('confirmLabel="Zapsat Nedovoláno"') && /\.zavolatVzit\(/.test(call), 've volání zůstává Zapsat Nedovoláno (kontrola 102) a karta z kalendáře jde přes zavolat_vzit');
  // po recenzi 21. 10. 2026: karta z kalendáře zvolený segment nemění (žlutá cedulka), kalendář nemá druhý minutový dotaz
  const telo = call.slice(call.indexOf('const loadNext = useCallback('), call.indexOf('}, [session.token, session.user_id]);'));
  over('S4', telo.length > 100 && !/setSegment\(|saveCallSegment\(/.test(telo) && !/setInterval/.test(readFileSync(join(ROOT, 'src/pages/KalendarPage.tsx'), 'utf8')),
    'karta z kalendáře segment tiše nepřepne; stránka Kalendář se neptá serveru každou minutu sama');
  const drawer = readFileSync(join(ROOT, 'src/components/KontaktDrawer.tsx'), 'utf8');
  over('S5', /const smi = isSuperAdmin\(session\.role\) \|\| kontakt\.je_muj === true;/.test(drawer) && /if \(!smi\) return null;/.test(drawer),
    'detail: Naplánovat hovor Volající jen u svého klienta');
});

// Albert 22. 10. 2026 (přes S33): „keep it for their own clients … anyone who has been called by that caller can be entered into the
// calendar. Even people who didn't pick up or were irrelevant.“ Svůj klient = kdokoli, komu Volající kdy volal (nebo je jeho
// last_caller), v jakémkoli stavu; klient mimo frontu přijde v kalendáři bez karty ve volání a uzavře ho Hotovo; kontakt, kterému
// volal jen kolega, odmítnut stejnou hláškou (jako server, test 050 případ 50m).
await blok('Q', async () => {
  const kdy = za(48 * 60 * MIN);
  const CIZI = 'Naplánovat hovor můžete jen svému klientovi (kontaktu, kterému jste volal/a). Kontakt z fronty naplánujete při hovoru tlačítkem Přeplánovat.';
  const presne = new RegExp('^' + CIZI.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
  for (const id of [13, 4, 7]) {   // Petřini klienti: nerelevantní, odmítnutý, prodaný (zaplaceno)
    const r = await radek(id);
    over(`Q0-${id}`, r && r.last_caller === 'Petra' && !['nekontaktovano', 'nedovolano'].includes(r.status),
      'ukázkový klient Petry je mimo frontu (předpoklad testu)', r && r.status);
    const p = await api.zavolatNaplanovat(petra, id, kdy, 'Albert 22. 10. 2026');
    over(`Q1-${id}`, p.muj === true && p.ve_fronte === false, `Volající naplánuje hovor svému klientovi ve stavu ${r && r.status}`,
      JSON.stringify({ muj: p.muj, ve_fronte: p.ve_fronte }));
    await chyba(`Q2-${id}`, () => api.zavolatVzit(petra, p.id), /^Tenhle klient není ve frontě volání, kartu volání pro něj appka nemá\./,
      'klient mimo frontu nemá kartu ve volání (uzavře ho Hotovo)');
    const h = await api.zavolatHotovo(petra, p.id, 'zavolala jsem mu');
    over(`Q3-${id}`, h && h.ok === true, 'hovor klienta mimo frontu jde uzavřít jako hotový');
  }
  // Honzovi klienti, kterým Petra nikdy nevolala (podle Moji klienti obou; dřívější bloky volají náhodné karty)
  const petriny = new Set((await api.myKontakty(petra, 2000)).rows.map((r) => r.id));
  const jenHonzovi = (await api.myKontakty(honza, 2000)).rows.map((r) => r.id).filter((id) => !petriny.has(id));
  over('Q4', jenHonzovi.length >= 2, 'demo má aspoň dva kontakty, kterým volal jen kolega (předpoklad testu)', `${jenHonzovi.length}`);
  for (const id of jenHonzovi.slice(0, 3)) {
    await chyba(`Q4-${id}`, () => api.zavolatNaplanovat(petra, id, kdy), presne, 'kontakt, kterému volal jen kolega, Volající nenaplánuje');
  }
});

/* ---------------- D) cena při „Mají zájem“ nepovinná, nedohodnutá = „n/a“ (migrace 051, Albert 22. 10. 2026) ---------------- */
// Albert 22. 10. 2026: „make the web and hosting price optional at Mají zájem … earnings count only once a price is known“
// a „there's n/a on the hosting and on the prices when we haven't arranged them yet“. Mock = server (resolve_call bez
// povinné ceny, coalesce(case when app_cena_nezadana(p) then null else trim(p) end, stávající), app_cena_nezadana,
// app_vydelek neznama), appka = src/ui.tsx (cenaNezadana, cenaProServer).
// Blok běží POSLEDNÍ: bere karty z fronty a mění prodej 24 (ostatní bloky by to pletlo).
// VZORKY NEZADANÉ CENY (spec 051 „Shared samples nezadaná cena“): db/tests/test_051_cena_na.sql (mezi řádky
// „-- vzorky nezadané ceny: začátek“ a „-- vzorky nezadané ceny: konec“) a tenhle test mají TUTÉŽ tabulku ve stejném
// pořadí, kontrola 205 v repu webdomov je porovnává. Měnit jen spolu.
// vzorky nezadané ceny: začátek
const VZORKY_NEZADANE = [
  ['', true],
  ['   ', true],
  ['x', true],
  ['X', true],
  ['Xx', true],
  ['XXX', true],
  ['yx', true],
  ['-', true],
  ['—', true],
  ['n/a', true],
  ['N/A', true],
  ['n.a.', true],
  ['0', true],
  ['0 Kč', true],
  ['xxxx', false],
  ['7000', false],
  ['7 000 Kč', false],
  ['Nebylo řečeno', false],
  ['190/měs', false],
  ['po domluvě', false],
];
// vzorky nezadané ceny: konec
await blok('D', async () => {
  over('D0', typeof U.cenaNezadana === 'function' && typeof cenaNezadanaMock === 'function' && VZORKY_NEZADANE.length === 20,
    'appka má cenaNezadana (src/ui.tsx), mock app_cena_nezadana a tabulka vzorků má 20 řádků');
  VZORKY_NEZADANE.forEach(([text, nezadana], i) => {
    over(`D0.${i + 1}`, U.cenaNezadana(text) === nezadana && cenaNezadanaMock(text) === nezadana,
      `cena „${text}“ ${nezadana ? 'není dohodnutá (n/a)' : 'je zapsaná'} (appka i mock)`, `${U.cenaNezadana(text)} / ${cenaNezadanaMock(text)}`);
  });
  over('D0b', U.cenaNezadana(null) && U.cenaNezadana(undefined) && cenaNezadanaMock(null) && U.CENA_NA === 'n/a'
    && U.cenaText('n/a') === null && U.cenaText(' N.A. ') === null && mezery(U.cenaText('7000')?.text) === '7 000 Kč',
    'null = nedohodnutá; cenaText vrátí null i pro n/a (stránka ukáže „n/a“), čistá cena dál „7 000 Kč“');
  // po revizi DB 22. 10. 2026: nula je výplň („hosting 0“), ne cena; „010“ a „0 Kč/měs“ už ne
  over('D0c', ['00', '0,-', '0 kc', '0 CZK', ' 0 KČ '].every((z) => U.cenaNezadana(z) && cenaNezadanaMock(z))
    && !['010', '0 Kč/měs', '100'].some((z) => U.cenaNezadana(z) || cenaNezadanaMock(z)),
    'nula s měnou nebo bez je nedohodnutá cena (appka i mock), „010“ a „0 Kč/měs“ ne');
  // cena pro server (volání i detail): nedohodnutá = null, nikdy text „n/a“; skutečná oříznutá
  const ps = U.cenaProServer;
  over('D0d', typeof ps === 'function' && ps('n/a') === null && ps(' N/A ') === null && ps('0') === null && ps('0 Kč') === null && ps('Xx') === null
    && ps('   ') === null && ps('') === null && ps(null) === null && ps(' 7 000 Kč ') === '7 000 Kč' && ps('190/měs') === '190/měs',
    'cenaProServer: „n/a“, „0“, „Xx“ a prázdné pole jdou jako null, cena oříznutá');

  // šest chat, které předchozí bloky z fronty vyřadily nebo zamkly (odmítnuté, nedovolané, zájem 3), Albert vrátí do fronty
  // bez cen; super admin je dá Evě a ona si je vezme „Zavolat teď“ (fronta demo chat je po blocích výš skoro prázdná)
  // (blok P si náhodně vybere jednu z nich pro Petřin naplánovaný hovor a karty z fronty mohou zůstat zamčené: obojí
  // tu super admin a Albert napřed uklidí, jinak by výsledek záležel na pořadí fronty)
  const volne = [1, 4, 8, 6, 2, 3];
  for (const id of volne) {
    const z = await cekajici(mikulas, id, null, true);
    if (z) await api.zavolatZrusit(mikulas, z.id);
    await api.updateKontakt(albert, id, { clear_lock: true });
    await api.updateKontakt(albert, id, { status: 'nekontaktovano', cena_web: null, cena_hosting: null });
  }
  const pripraveno = [];
  for (const id of volne) {
    const r = await radek(id);
    if (r?.segment === 'chata' && r.status === 'nekontaktovano' && r.lock_by === null && r.cena_web === null && !(await cekajici(mikulas, id, null, true))) pripraveno.push(id);
  }
  over('D1-pred', pripraveno.length === 6, 'šest volných chat ve frontě bez ceny a bez čekajícího hovoru (předpoklad testu)', pripraveno.join());
  if (pripraveno.length < 6) return;
  const vezmi = async (id) => api.zavolatVzit(eva, (await api.zavolatNaplanovat(mikulas, id, za(60 * MIN), null, 5)).id);
  const [a, b, c, d, e, f] = volne;

  // známka zůstává povinná (přesná hláška serveru), ceny ne; odmítnutý zápis nic nezapíše
  await vezmi(a);
  const hovoryPred = (await api.myStats(eva)).calls;
  await chyba('D1', () => api.resolveCall(eva, { kontakt_id: a, outcome: 'zajem', cena_web: '', cena_hosting: '' }),
    presne('Výsledek "zajem" vyžaduje rating A, B nebo C.'), 'Mají zájem bez známky neprojde ani bez ceny (hláška jako server)');
  over('D1b', (await api.myStats(eva)).calls === hovoryPred && (await radek(a))?.status !== 'zajem', 'odmítnutý zájem nic nezapsal');

  // prázdné ceny (jak je appka posílá: null; i '' a mezery od starší appky) projdou a uloží null, nikdy ''
  const r1 = await api.resolveCall(eva, { kontakt_id: a, outcome: 'zajem', cena_web: null, cena_hosting: null, rating: 'B' });
  const ka = await radek(a);
  over('D2', r1?.status === 'zajem' && ka?.status === 'zajem' && ka.cena_web === null && ka.cena_hosting === null && ka.rating === 'B',
    'Mají zájem jen se známkou projde, ceny zůstanou null', JSON.stringify({ s: ka?.status, w: ka?.cena_web, h: ka?.cena_hosting }));
  await vezmi(b);
  await api.resolveCall(eva, { kontakt_id: b, outcome: 'zajem', cena_web: '', cena_hosting: '   ', rating: 'C' });
  const kb = await radek(b);
  over('D2b', kb?.status === 'zajem' && kb.cena_web === null && kb.cena_hosting === null,
    'prázdné pole a pole jen z mezer se uloží jako null, ne jako prázdný text', JSON.stringify({ w: kb?.cena_web, h: kb?.cena_hosting }));

  // cena, která u kontaktu už je (7 kontaktů ve frontě má starou cenu z tabulky), prázdné pole nesmaže; nová ji přepíše
  await api.updateKontakt(albert, c, { cena_web: '7000', cena_hosting: '190/měs' });
  await vezmi(c);
  await api.resolveCall(eva, { kontakt_id: c, outcome: 'zajem', cena_web: '', cena_hosting: null, rating: 'A' });
  const kc = await radek(c);
  over('D3', kc?.status === 'zajem' && kc.cena_web === '7000' && kc.cena_hosting === '190/měs',
    'prázdná cena při zájmu stávající cenu nesmaže (coalesce jako server)', JSON.stringify({ w: kc?.cena_web, h: kc?.cena_hosting }));
  await api.updateKontakt(albert, d, { cena_web: '5000', cena_hosting: null });
  await vezmi(d);
  await api.resolveCall(eva, { kontakt_id: d, outcome: 'zajem', cena_web: '  8 000 Kč  ', cena_hosting: ' 1000/rok ', rating: 'A' });
  const kd = await radek(d);
  over('D3b', kd?.cena_web === '8 000 Kč' && kd.cena_hosting === '1000/rok', 'zapsaná cena přepíše starou (oříznutá o mezery)',
    JSON.stringify({ w: kd?.cena_web, h: kd?.cena_hosting }));
  // po revizi DB 22. 10. 2026: napsaná výplň („n/a“, „0“) je totéž co prázdné pole: stávající cenu nesmaže a bez ní uloží null
  await api.updateKontakt(albert, e, { cena_web: '7000', cena_hosting: '190/měs' });
  await vezmi(e);
  await api.resolveCall(eva, { kontakt_id: e, outcome: 'zajem', cena_web: 'n/a', cena_hosting: '0', rating: 'B' });
  const ke = await radek(e);
  over('D3c', ke?.status === 'zajem' && ke.cena_web === '7000' && ke.cena_hosting === '190/měs',
    'napsané „n/a“ a „0“ při zájmu stávající cenu nesmažou', JSON.stringify({ w: ke?.cena_web, h: ke?.cena_hosting }));
  await vezmi(f);
  await api.resolveCall(eva, { kontakt_id: f, outcome: 'zajem', cena_web: ' N/A ', cena_hosting: '0 Kč', rating: 'C' });
  const kf = await radek(f);
  over('D3d', kf?.status === 'zajem' && kf.cena_web === null && kf.cena_hosting === null,
    'napsané „N/A“ a „0 Kč“ bez dřívější ceny se uloží jako null, ne jako text', JSON.stringify({ w: kf?.cena_web, h: kf?.cena_hosting }));

  // výdělek: prodej 24 (Honza, tento týden, bez ceny) je „neznámá cena“, nesčítá se a nejasne se nemění
  const vydelek = async (tok) => (await api.statistikyVolani(tok)).vydelek;
  const soucetKc = (v) => v.prodeje.reduce((s, r) => s + (r.mena === 'kc' ? r.provize ?? 0 : 0), 0);
  let vh = await vydelek(honza);
  let s24 = vh.prodeje.find((r) => r.kontakt_id === 24);
  const s21 = vh.prodeje.find((r) => r.kontakt_id === 21);
  over('D4', s24?.neznama === true && s24.castka === null && s24.mena === null && s24.provize === null && s24.cena === null
    && s24.zdroj === 'cena_web' && s24.tento_tyden === true,
    'prodej bez dohodnuté ceny: neznama, bez částky, měny a provize, cena null', JSON.stringify(s24));
  over('D4b', vh.neznama === 1 && vh.neznama_tyden === 1 && vh.nejasne === 1 && s21?.neznama === false && s21.castka === null,
    'neznama 1 (tento týden 1), nejasne dál 1 (jen „6000-7000 Kč po domluvě“)', JSON.stringify({ n: vh.neznama, nt: vh.neznama_tyden, j: vh.nejasne }));
  const celkemPred = vh.celkem_kc;
  const tydenPred = vh.tyden_kc;
  over('D4c', celkemPred === soucetKc(vh) && vh.prodeje.filter((r) => r.kontakt_id !== 24).every((r) => r.neznama === false),
    'neznámá cena se do součtu nepočítá; ostatní prodeje mají neznama false', `${celkemPred} / ${soucetKc(vh)}`);
  // výplň z doby povinné ceny („Xx“, „N/A“) je taky neznámá cena, text zůstane, jak je
  await api.updateKontakt(albert, 24, { cena_web: 'Xx' });
  vh = await vydelek(honza);
  s24 = vh.prodeje.find((r) => r.kontakt_id === 24);
  over('D5', s24?.neznama === true && s24.cena === 'Xx' && vh.neznama === 1 && vh.nejasne === 1 && vh.celkem_kc === celkemPred,
    'výplň „Xx“ je nedohodnutá cena (ne nečitelná) a zůstane zapsaná, jak je', JSON.stringify({ s24, j: vh.nejasne }));
  // cenu doplní Volající sám v detailu klienta: prodej se započítá
  await api.updateKontakt(honza, 24, { cena_web: '6 000 Kč' });
  vh = await vydelek(honza);
  s24 = vh.prodeje.find((r) => r.kontakt_id === 24);
  over('D6', s24?.neznama === false && s24.castka === 6000 && s24.provize === 1800 && vh.neznama === 0 && vh.neznama_tyden === 0
    && vh.celkem_kc === celkemPred + 1800 && vh.tyden_kc === tydenPred + 1800 && vh.nejasne === 1,
    'po doplnění ceny webu (6 000 Kč) se prodej započítá sám: +1 800 Kč celkem i tento týden', JSON.stringify({ s24, c: vh.celkem_kc }));
  await api.updateKontakt(honza, 24, { cena_web: null });
  over('D6b', (await vydelek(honza)).neznama === 1 && (await radek(24))?.cena_web === null, 'vymazaná cena: prodej je zase neznámý');

  // nový prodej z kontaktu s prázdnou cenou (Eva, kontakt a): neznámý, po doplnění ceny se počítá
  await api.updateKontakt(albert, a, { status: 'schvaleno' });
  let ve = await vydelek(eva);
  const ea = () => ve.prodeje.find((r) => r.kontakt_id === a);
  over('D7', ea()?.neznama === true && ea().provize === null && ve.neznama === 1 && ve.neznama_tyden === 1 && ve.nejasne === 0,
    'web prodaný po zájmu bez ceny: Eva ho má jako neznámou cenu, ne jako nečitelnou', JSON.stringify(ea()));
  await api.updateKontakt(eva, a, { cena_web: '7 000 Kč' });
  ve = await vydelek(eva);
  over('D7b', ea()?.neznama === false && ea().provize === 2100 && ve.neznama === 0 && ve.tyden_kc === 2100,
    'po doplnění ceny se Evě prodej započítá (2 100 Kč tento týden)', JSON.stringify(ea()));

  // supabase.ts posílá prázdnou cenu jako null (CallPage ji tak předá), nikdy ''
  odeslano.length = 0;
  await supabaseApi.resolveCall('tok', { kontakt_id: 5, outcome: 'zajem', cena_web: null, cena_hosting: null, rating: 'A' });
  await supabaseApi.resolveCall('tok', { kontakt_id: 5, outcome: 'zajem', rating: 'A' });
  over('D8', odeslano.length === 2 && odeslano.every((o) => o.body.p_cena_web === null && o.body.p_cena_hosting === null && o.body.p_rating === 'A'),
    'resolve_call dostane prázdné ceny jako null', JSON.stringify(odeslano.map((o) => [o.body.p_cena_web, o.body.p_cena_hosting])));

  // CallPage (React, klikání měří tests/demo-e2e.mjs blok A): jen známka povinná, prázdné pole = null, popisky nepovinné
  const call = readFileSync(join(ROOT, 'src/pages/CallPage.tsx'), 'utf8');
  over('D9', /const zajemValid = rating !== '';/.test(call) && /cena_web: outcome === 'zajem' \? cenaProServer\(cenaWeb\) : null/.test(call)
    && /cena_hosting: outcome === 'zajem' \? cenaProServer\(cenaHosting\) : null/.test(call)
    && call.includes('Cena webu (nepovinné)') && call.includes('Cena hostingu (nepovinné)') && /Nech prázdné = n\/a, cena zatím nedohodnutá/.test(call)
    && !/Vyplň cenu webu/.test(call) && !/Cena webu <span className="req">/.test(call),
    've volání je povinná jen známka, ceny jsou nepovinné a prázdná jde jako null');
  // detail kontaktu (klikání měří e2e blok A, A9): pole s „n/a“ nebo prázdné se uloží jako null (update_kontakt uloží, co dostane)
  const drawer = readFileSync(join(ROOT, 'src/components/KontaktDrawer.tsx'), 'utf8');
  over('D10', /patch\.cena_web = cenaProServer\(cenaWeb\);/.test(drawer) && /patch\.cena_hosting = cenaProServer\(cenaHosting\);/.test(drawer)
    && (drawer.match(/placeholder=\{CENA_NA\}/g) ?? []).length === 2,
    'detail: obě pole cen se ukládají přes cenaProServer („n/a“ = null) a mají nápovědu „n/a“');
});

if (chyby === 0) {
  console.log(`ALL OK (${pocet} kontrol)`);
  process.exit(0);
}
console.log(`CHYB: ${chyby} z ${pocet}`);
process.exit(1);
