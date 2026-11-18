// Test záložek a grafů Přehledu vedení (úkol 14a, Albert 17. 11. 2026, rozhodnutí D1, D2, D6, D7 a D12; spec
// docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md §7.2, §7.7 a §7.8, kontrakt docs/superpowers/specs/2026-11-17-prehled-kontrakt.md
// §2.6, §3 a §5).
//
// Měří:
//  Z1) matematiku grafů bez Reactu (src/grafy.ts): pěkné dílky osy, zrnitost řady podle délky období, kumulativní součet
//      řady (nedostupný sloupec přeruší čáru, sloupec bez přesné částky přidá 0 a je částečný, nikdy se nepočítá jako ověřená 0),
//      čára s mezerou za neznámým bodem, šířky segmentů pásem s mezerou 2 px, popisky dnů, týdnů a měsíců v Praze,
//  Z2) grafy vykreslené na serveru (src/components/grafy/{Cara,Sloupce,Trychtyr,Pasma}.tsx): SVG s <title> a <desc>, barvy jen
//      z tokenů appky (var(--…), žádné vlastní hex), legenda u dvou a víc řad, „Zobrazit jako tabulku“ se stejnými čísly, neznámé
//      číslo „—“ (nikdy „0“), krok trychtýře dovolan jako „Spojen“, pásma stáří v pořadí s rampou jednoho odstínu,
//  Z3) přejmenování kroku trychtýře v src/prehled.ts (rozhodnutí koordinátora 18. 11. 2026: „Spojen“, nikdy „Dovolán“) a názvy
//      plánu („Plán za celé období“, „Splněno z plánu období“: plán počítá i dny, které teprve přijdou; koordinátor 18. 11. 2026),
//  Z4) tabulku porovnání lidí (src/pages/prehled/TabulkaLidi.tsx, řazení v src/prehled.ts): řazení podle každého sloupce,
//      neznámé vždy na konci, řádek Nepřiřazeno zvlášť a popsaný, součet v patičce, mini pruhy, čísla s proklikem jako tlačítka,
//      odpracováno z plánu „za celé období“ a nedostupný pracovní čas jako „—“ s důvodem serveru,
//  Z5) DEMO mock jako podklad záložek: týmy se sčítají na celek (bez dvojího započtení), náklady po kategoriích a dohromady,
//      pásma stáří pipeline mají v demu čísla, řádky prokliku pásma = číslo pásma, s filtrem segmentu je pracovní čas nedostupný,
//  Z6) zapojení: obecná záložka (ZalozkaObecna) je pryč, každá záložka má svou komponentu, nikde „Dovoláno“ ani „Dovolán“,
//  Z7) týmy na Vedení: každý tým svými lidmi z výběru, lidé bez týmu zvlášť, nikdo dvakrát,
//  Z8) pohyby pipeline, až budou k dispozici (DEMO je má vždy nedostupné, e2e je proto neuvidí): všech 11 řádků, neznámé „—“,
//      CZK a EUR vedle sebe (nikdy sečtené), důvod neúplnosti pod seznamem (ne uvnitř <dl>), nedostupné = prázdný stav s důvodem.
// Klikání (záložky, filtry, řádky s CSV, porovnání, telefon, Volající) měří tests/demo-e2e.mjs blok PZ.
// Nikdy nesahá na síť ani živou DB.
// Spuštění: node tests/prehledzalozky.test.mjs (APP_ROOT=/cesta/ke/kopii pro mutace). Výsledek „ALL OK (N kontrol)“ nebo řádky
// „FAIL <id>: …“ a kód 1.

import { build } from 'esbuild';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  const dir = mkdtempSync(join(tmpdir(), 'prehled-zalozky-'));
  const f = join(dir, 'b.cjs');
  writeFileSync(f, out.outputFiles[0].text);
  try {
    return createRequire(import.meta.url)(f);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// každý kus zvlášť, ať RED ukáže, co přesně chybí
let G = null;
try {
  G = await balicek(["export * from './src/grafy.ts';"]);
} catch (e) {
  over('Z0a', false, 'src/grafy.ts nejde sestavit (matematika grafů chybí)', String(e.message).split('\n')[0]);
}
let V = null;
try {
  V = await balicek([
    "export { default as Cara } from './src/components/grafy/Cara.tsx';",
    "export { default as Sloupce } from './src/components/grafy/Sloupce.tsx';",
    "export { default as Trychtyr } from './src/components/grafy/Trychtyr.tsx';",
    "export { default as Pasma } from './src/components/grafy/Pasma.tsx';",
    "export { renderToStaticMarkup } from 'react-dom/server';",
    "export { createElement } from 'react';",
  ]);
} catch (e) {
  over('Z0b', false, 'grafy (src/components/grafy/Cara, Sloupce, Trychtyr, Pasma) nejdou sestavit', String(e.message).split('\n').slice(0, 2).join(' | '));
}
let L = null;
try {
  L = await balicek([
    "export { default as TabulkaLidi } from './src/pages/prehled/TabulkaLidi.tsx';",
    "export { default as TabulkaDimenze } from './src/pages/prehled/TabulkaDimenze.tsx';",
    "export { PrehledKontext } from './src/pages/prehled/kontext.tsx';",
    "export * from './src/prehled.ts';",
    "export { renderToStaticMarkup } from 'react-dom/server';",
    "export { createElement } from 'react';",
  ]);
} catch (e) {
  over('Z0c', false, 'tabulka porovnání lidí (src/pages/prehled/TabulkaLidi.tsx) nejde sestavit', String(e.message).split('\n').slice(0, 2).join(' | '));
}
const ZALOZKY = ['ZalozkaVedeni', 'ZalozkaLide', 'ZalozkaPipeline', 'ZalozkaKlienti', 'ZalozkaKomunikace', 'ZalozkaFinance', 'ZalozkaDodani', 'ZalozkaPrognoza'];
let Z = null;
try {
  Z = await balicek([...ZALOZKY.map((z) => `export { default as ${z} } from './src/pages/prehled/${z}.tsx';`),
    "export { skupinyTymu } from './src/pages/prehled/ZalozkaVedeni.tsx';"]);
} catch (e) {
  over('Z0d', false, 'záložky Přehledu (src/pages/prehled/Zalozka*.tsx) nejdou sestavit', String(e.message).split('\n').slice(0, 2).join(' | '));
}
let P = null;
try {
  P = await balicek([
    "export { Pohyby } from './src/pages/prehled/ZalozkaPipeline.tsx';",
    "export { renderToStaticMarkup } from 'react-dom/server';",
    "export { createElement } from 'react';",
  ]);
} catch (e) {
  over('Z0f', false, 'pohyby pipeline (Pohyby ze src/pages/prehled/ZalozkaPipeline.tsx) nejdou vykreslit samostatně', String(e.message).split('\n').slice(0, 2).join(' | '));
}
// úkol 14b (přenesené z recenze 14a): akční seznam jako samostatná tabulka a text tlačítka „Zobrazit … případů“
let A = null;
try {
  A = await balicek([
    "export { TabulkaAkci, textZobrazitPripady } from './src/pages/prehled/ZalozkaVedeni.tsx';",
    "export { renderToStaticMarkup } from 'react-dom/server';",
    "export { createElement } from 'react';",
  ]);
} catch (e) {
  over('Z0g', false, 'tabulka akčního seznamu (TabulkaAkci, textZobrazitPripady ze ZalozkaVedeni.tsx) nejde vykreslit samostatně', String(e.message).split('\n').slice(0, 2).join(' | '));
}

// mock jako poslední balíček: háček __volackaDemoTest (stav, naplanujDosly …) patří k instanci API.mockApi
let API = null;
try {
  API = await balicek(["export { mockApi } from './src/api/mock.ts';"]);
} catch (e) {
  over('Z0e', false, 'mock nejde sestavit', String(e.message).split('\n')[0]);
}

/* ---------------- Z1) matematika grafů ---------------- */
await blok('Z1', async () => {
  if (!G) return;
  over('Z1a', stejne(G.dilkyOsy(47, 4, true), [0, 20, 40, 60]) && stejne(G.dilkyOsy(0), [0, 1]) && stejne(G.dilkyOsy(0.83), [0, 0.25, 0.5, 0.75, 1])
    && stejne(G.dilkyOsy(21000), [0, 10000, 20000, 30000]) && stejne(G.dilkyOsy(3, 4, true), [0, 1, 2, 3]) && stejne(G.dilkyOsy(1, 4, true), [0, 1]),
    'dílky osy od nuly po kroku 1, 2, 2,5 nebo 5 × 10^k; počty jen celé; prázdná osa 0 až 1',
    JSON.stringify([G.dilkyOsy(47, 4, true), G.dilkyOsy(0), G.dilkyOsy(0.83), G.dilkyOsy(21000), G.dilkyOsy(3, 4, true), G.dilkyOsy(1, 4, true)]));
  over('Z1b', G.zrnitostObdobi('2026-11-01', '2026-11-30') === 'den' && G.zrnitostObdobi('2026-10-01', '2026-12-01') === 'den'
    && G.zrnitostObdobi('2026-10-01', '2026-12-02') === 'tyden' && G.zrnitostObdobi('2026-01-01', '2026-12-31') === 'tyden'
    && G.zrnitostObdobi('2025-01-01', '2026-11-30') === 'mesic',
    'zrnitost řady: do 62 dní po dnech, do 366 dní po týdnech, delší po měsících', '');
  const k = G.kumulativne([
    { hodnota: null, dostupny: false }, { hodnota: 0, dostupny: true }, { hodnota: 3500, dostupny: true }, { hodnota: null, dostupny: true },
    { hodnota: 7000, dostupny: true }, { hodnota: null, dostupny: false }, { hodnota: 1000, dostupny: true },
  ]);
  over('Z1c', stejne(k.map((b) => b.hodnota), [null, 0, 3500, 3500, 10500, null, null]) && stejne(k.map((b) => b.castecne), [false, false, false, true, true, false, false]),
    'kumulativně: sloupec před zdrojem = bez čáry, bez přesné částky + 0 a částečně (dál taky), nedostupný po známých čáru ukončí',
    JSON.stringify(k));
  over('Z1d', G.castkaVMene([{ mena: 'CZK', hodnota: '7000.50' }, { mena: 'EUR', hodnota: null }], 'CZK') === 7000.5
    && G.castkaVMene([{ mena: 'CZK', hodnota: '7000.50' }, { mena: 'EUR', hodnota: null }], 'EUR') === null && G.castkaVMene([], 'CZK') === null,
    'částka v měně z textu na 2 místa; neznámá nebo chybějící měna = null (nikdy 0)', '');
  const cesta = G.cestaCary([1, null, 3, 4], (i) => i * 10, (v) => v);
  over('Z1e', (cesta.match(/M/g) ?? []).length === 2 && (cesta.match(/L/g) ?? []).length === 1 && /^M0 1 M20 3 L30 4$/.test(cesta.replace(/\s+/g, ' ').trim()),
    'čára: neznámý bod ji přeruší (nový úsek M), žádná spojnice přes mezeru', cesta);
  const s = G.segmentyPruhu([2, 0, 5, 1], 100);
  const sirky = s.map((x) => x.w);
  over('Z1f', s.length === 4 && sirky[1] === 0 && Math.abs(sirky[0] + sirky[2] + sirky[3] + 4 - 100) < 0.01 && Math.abs(sirky[2] / sirky[0] - 2.5) < 0.01
    && s[2].x > s[0].x + s[0].w && s[3].x > s[2].x + s[2].w,
    'segmenty pruhu úměrně počtu, mezi nenulovými mezera 2 px, nula nekreslí nic', JSON.stringify(s));
  over('Z1g', G.popisekBodu('2026-11-08', '2026-11-08', 'den') === '8. 11.' && G.popisekBodu('2026-11-02', '2026-11-08', 'tyden') === '2.–8. 11.'
    && G.popisekBodu('2026-10-26', '2026-11-01', 'tyden') === '26. 10.–1. 11.' && G.popisekBodu('2026-11-01', '2026-11-30', 'mesic') === 'listopad 2026',
    'popisky osy: den „8. 11.“, týden „2.–8. 11.“ (i přes měsíc), měsíc „listopad 2026“',
    [G.popisekBodu('2026-11-08', '2026-11-08', 'den'), G.popisekBodu('2026-10-26', '2026-11-01', 'tyden'), G.popisekBodu('2026-11-01', '2026-11-30', 'mesic')].join(' | '));
  over('Z1h', stejne(G.zalomText('Nereagoval ani na nabídku za polovinu', 20), ['Nereagoval ani na', 'nabídku za polovinu'])
    && stejne(G.zalomText('Chaty', 20), ['Chaty']) && stejne(G.zalomText('a b c d e f', 1, 3), ['a', 'b', 'c d e f']) && stejne(G.zalomText('Dlouhéslovobezmezer', 5), ['Dlouhéslovobezmezer']),
    'popisek grafu se zalomí po slovech (SVG text sám nezalomí, na telefonu by přetekl); nejvýš 3 řádky, dlouhé slovo celé',
    JSON.stringify(G.zalomText('Nereagoval ani na nabídku za polovinu', 20)));
});

/* ---------------- Z2) grafy vykreslené na serveru ---------------- */
const prokl = (vyber) => ({ zdroj: 'kontakty', filtr: { od: '2026-11-01', do: '2026-11-30', lide: null, atribuce: 'posledni_zajem', segment: null, obor: null, kraj: null, mena: 'CZK', zaklad: 'prirozeny', k_datu: null, vyber } });
/** Jen barvy z tokenů: fill a stroke v SVG nikdy jako vlastní hex. */
const vlastniBarvy = (html) => [...html.matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]{3,8}|rgb[^"]*)"/g)].map((m) => m[1]);
await blok('Z2', async () => {
  if (!V) return;
  const h = V.createElement;
  const R = (C, props) => V.renderToStaticMarkup(h(C, props));
  // Sloupce: jedna řada, bez legendy
  const polozky = [
    { klic: 'chata', nazev: 'Chaty', hodnota: 4, text: '4', proklik: prokl({ metrika: 'klienti_segment', segment: 'chata' }) },
    { klic: 'architekt', nazev: 'Architekti', hodnota: 0, text: '0', proklik: null },
    { klic: 'autoservis', nazev: 'Autoservisy', hodnota: null, text: '—', pozn: 'Zdroj zatím nemá data.' },
  ];
  const s1 = R(V.Sloupce, { nadpis: 'Prodáno podle segmentu', polozky, nazevHodnoty: 'Prodáno', onProklik: () => {} });
  over('Z2a', /<svg[^>]*role="img"/.test(s1) && /<title[^>]*>Prodáno podle segmentu<\/title>/.test(s1) && /<desc[^>]*>[^<]+<\/desc>/.test(s1)
    && (s1.match(/data-sloupec=/g) ?? []).length === 1 && vlastniBarvy(s1).length === 0 && !/graf-legenda/.test(s1)
    && /aria-expanded="false"[^>]*>[^<]*(<[^>]+>)*[^<]*Zobrazit jako tabulku/.test(s1.replace(/\n/g, '')) && text(s1).includes('—'),
    'sloupce: SVG s title a desc, pruh jen u nenulové známé hodnoty, barvy z tokenů, jedna řada bez legendy, přepínač na tabulku, neznámé „—“',
    `${(s1.match(/data-sloupec=/g) ?? []).length} pruhů, barvy ${vlastniBarvy(s1).join(',')}`);
  const s2 = R(V.Sloupce, { nadpis: 'Prodáno podle segmentu', polozky, nazevHodnoty: 'Prodáno', onProklik: () => {}, vychoziTabulka: true });
  const radky = [...s2.matchAll(/<tr[^>]*data-radek="([^"]+)"[\s\S]*?<\/tr>/g)].map((m) => text(m[0]));
  over('Z2b', radky.length === 3 && radky[0].includes('Chaty') && radky[0].includes('4') && radky[1].includes('0') && radky[2].includes('—')
    && /class="[^"]*graf-tabulka/.test(s2) && /aria-label="Zobrazit řádky: Prodáno – Chaty"/.test(s2) && /aria-expanded="true"/.test(s2),
    'sloupce jako tabulka: stejná čísla po řádcích (neznámé „—“), číslo s proklikem je tlačítko na řádky', radky.join(' | '));
  // Cara: řada s mezerou a cíl (legenda dvou položek)
  const body = [
    { klic: '2026-11-01', popisek: '1. 11.', hodnota: null, text: '—' },
    { klic: '2026-11-02', popisek: '2. 11.', hodnota: 0, text: '0 Kč' },
    { klic: '2026-11-03', popisek: '3. 11.', hodnota: 3500, text: '3 500 Kč' },
    { klic: '2026-11-04', popisek: '4. 11.', hodnota: null, text: '—' },
    { klic: '2026-11-05', popisek: '5. 11.', hodnota: 10500, text: '10 500 Kč' },
    { klic: '2026-11-06', popisek: '6. 11.', hodnota: 12000, text: '12 000 Kč' },
  ];
  const c1 = R(V.Cara, { nadpis: 'Hodnota prodejů proti cíli', nazevRady: 'Hodnota prodejů (kumulativně)', body, cil: { hodnota: 50000, text: '50 000 Kč' } });
  const d = [...c1.matchAll(/<path[^>]*class="graf-cara"[^>]*d="([^"]+)"/g)].map((m) => m[1])[0] ?? '';
  over('Z2c', /<title[^>]*>Hodnota prodejů proti cíli<\/title>/.test(c1) && /<desc[^>]*>[^<]+<\/desc>/.test(c1) && (d.match(/M/g) ?? []).length === 2
    && /class="graf-cil"/.test(c1) && /stroke-dasharray/.test(c1) && /Cíl/.test(text(c1)) && (c1.match(/class="graf-legenda-polozka/g) ?? []).length === 2
    && vlastniBarvy(c1).length === 0,
    'čára: title a desc, neznámý bod čáru přeruší, cíl přerušovanou čarou s popiskem, legenda řady a cíle, barvy z tokenů', `${d} | ${vlastniBarvy(c1).join(',')}`);
  const c2 = R(V.Cara, { nadpis: 'Hodnota prodejů proti cíli', nazevRady: 'Hodnota prodejů (kumulativně)', body, cil: null, vychoziTabulka: true });
  const rc = [...c2.matchAll(/<tr[^>]*data-radek="([^"]+)"[\s\S]*?<\/tr>/g)].map((m) => text(m[0]));
  over('Z2d', rc.length === 6 && rc[0].includes('—') && rc[2].includes('3 500 Kč') && !/class="graf-cil"/.test(c2) && (c2.match(/class="graf-legenda-polozka/g) ?? []).length === 0,
    'čára jako tabulka: řádek za každý bod se stejným textem (neznámé „—“); bez cíle jedna řada bez legendy', rc.join(' | '));
  // Trychtyr: 7 kroků, dovolan = Spojen, rampa jednoho odstínu v pořadí
  const kroky = [['osloven', 'Osloven', 12, null], ['dovolan', 'Dovolán', 9, 0.75], ['zajem', 'Zájem', 6, 0.666667], ['navrh', 'Návrh odeslán', 5, 0.833333],
    ['prodano', 'Prodáno', 3, 0.6], ['fakturovano', 'Fakturováno', 1, 0.333333], ['zaplaceno', 'Zaplaceno', null, null]]
    .map(([klic, nazev, n, z], i) => ({ klic, nazev, n, zPredchoziho: z, zKohorty: n === null ? null : n / 12, otevrenych: i === 0 ? 0 : 1, bezPredchoziho: 0, duvod: n === null ? 'Platby se evidují od 5. 11. 2026.' : null,
      proklik: prokl({ metrika: 'trychtyr', krok: klic }) }));
  const t1 = R(V.Trychtyr, { nadpis: 'Trychtýř prvního hovoru', kroky, onProklik: () => {} });
  const vyplne = [...t1.matchAll(/data-krok="[^"]+"[^>]*fill="([^"]+)"|fill="([^"]+)"[^>]*data-krok="/g)].map((m) => m[1] ?? m[2]);
  over('Z2e', text(t1).includes('Spojen') && !/Dovolán/.test(t1) && stejne(vyplne, ['var(--graf-krok-1)', 'var(--graf-krok-2)', 'var(--graf-krok-3)', 'var(--graf-krok-4)', 'var(--graf-krok-5)', 'var(--graf-krok-6)'])
    && /75 %/.test(text(t1)) && /<title[^>]*>Trychtýř prvního hovoru<\/title>/.test(t1) && vlastniBarvy(t1).length === 0,
    'trychtýř: krok dovolan je „Spojen“ (nikdy „Dovolán“), rampa jednoho odstínu krok po kroku, převod z předchozího v %, neznámý krok bez pruhu',
    `${vyplne.join(',')} | ${text(t1).slice(0, 160)}`);
  const t2 = R(V.Trychtyr, { nadpis: 'Trychtýř prvního hovoru', kroky, onProklik: () => {}, vychoziTabulka: true });
  const rt = [...t2.matchAll(/<tr[^>]*data-radek="([^"]+)"[\s\S]*?<\/tr>/g)].map((m) => text(m[0]));
  over('Z2f', rt.length === 7 && rt[1].startsWith('Spojen') && rt[1].includes('9') && rt[6].includes('—') && /Bez předchozího/.test(text(t2)) && /Otevřen/.test(text(t2)),
    'trychtýř jako tabulka: krok, klientů, z předchozího, z kohorty, otevřených a bez předchozího kroku (neznámé „—“)', rt.join(' | '));
  // Pasma: legenda čtyř pásem v pořadí, nula nekreslí nic
  const pasmo = (n0, n1, n2, n3) => ['0-7', '8-14', '15-30', '31+'].map((p, i) => ({ pasmo: p, n: [n0, n1, n2, n3][i], proklik: prokl({ metrika: 'pipeline_faze', status: 'navrh_odeslan', pasmo: p }) }));
  const radkyPasem = [
    { klic: 'navrh_odeslan', nazev: 'Návrh odeslán', pasma: pasmo(1, 0, 5, 1), nezname: 0, median: 19, p90: 31 },
    { klic: 'ceka_na_klienta', nazev: 'Čeká na klienta', pasma: pasmo(0, 0, 0, 0), nezname: 2, median: null, p90: null },
  ];
  const p1 = R(V.Pasma, { nadpis: 'Stáří ve fázi', radky: radkyPasem, onProklik: () => {} });
  const legenda = [...p1.matchAll(/class="graf-legenda-polozka[^"]*"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => text(m[1]));
  const segmenty = [...p1.matchAll(/data-pasmo="([^"]+)"[^>]*fill="([^"]+)"|fill="([^"]+)"[^>]*data-pasmo="([^"]+)"/g)].map((m) => `${m[1] ?? m[4]}:${m[2] ?? m[3]}`);
  over('Z2g', stejne(legenda, ['0–7 dní', '8–14 dní', '15–30 dní', '31 a víc dní']) && stejne(segmenty, ['0-7:var(--graf-pasmo-1)', '15-30:var(--graf-pasmo-3)', '31+:var(--graf-pasmo-4)'])
    && /<desc[^>]*>[^<]+<\/desc>/.test(p1) && /neznám/i.test(text(p1)) && vlastniBarvy(p1).length === 0,
    'pásma stáří: legenda čtyř pásem v pořadí, segment jen u nenulového pásma, rampa jednoho odstínu, neznámý vstup u fáze vidět',
    `${legenda.join(',')} | ${segmenty.join(',')}`);
  const p2 = R(V.Pasma, { nadpis: 'Stáří ve fázi', radky: radkyPasem, onProklik: () => {}, vychoziTabulka: true });
  const rp = [...p2.matchAll(/<tr[^>]*data-radek="([^"]+)"[\s\S]*?<\/tr>/g)].map((m) => text(m[0]));
  over('Z2h', rp.length === 2 && /Návrh odeslán 1 0 5 1 0/.test(rp[0]) && /Čeká na klienta 0 0 0 0 2/.test(rp[1])
    && /aria-label="Zobrazit řádky: Návrh odeslán, 15–30 dní"/.test(p2),
    'pásma jako tabulka: fáze × pásma a neznámý vstup se stejnými čísly, číslo pásma je tlačítko na řádky', rp.join(' | '));
  // oprava po recenzi 18. 11. 2026 (task-14a-fixes.md)
  // důležité 1: tabulka grafu je v rámečku tabulky (nápověda a fokusovatelná oblast při posunu do strany)
  over('Z2i', [s2, c2, t2, p2].every((html) => /class="graf-tabulka"[^>]*>\s*<div class="prehled-tabulka-blok"[\s\S]*class="prehled-tabulka-obal"/.test(html)
    && /class="prehled-tabulka-napoveda"/.test(html)),
    'tabulka grafu (sloupce, čára, trychtýř, pásma) je v rámečku TabulkaObal s nápovědou „Tabulka je širší…“', '');
  // drobnost 14: jméno obrázku grafu je jen nadpis (aria-labelledby na nadpis), ne text výběru a přepínače
  const jmenoGrafu = (html) => {
    const id = /<figure[^>]*aria-labelledby="([^"]+)"/.exec(html)?.[1];
    return id ? text(new RegExp(`<h[34][^>]*id="${id.replace(/[:]/g, '\\$&')}"[^>]*>([\\s\\S]*?)</h[34]>`).exec(html)?.[1] ?? '') : null;
  };
  over('Z2j', jmenoGrafu(s1) === 'Prodáno podle segmentu' && jmenoGrafu(c1) === 'Hodnota prodejů proti cíli' && jmenoGrafu(t1) === 'Trychtýř prvního hovoru',
    'obrázek grafu má jméno jen z nadpisu (aria-labelledby), ne z textu ovládání', JSON.stringify([jmenoGrafu(s1), jmenoGrafu(c1), jmenoGrafu(t1)]));
  // drobnost 8: v oranžovém pásmu 8–14 dní žádné číslo (ink 4,22:1 ani krém 3,56:1 nesplní AA 4,5:1 při 12 px); jinde ano
  const p3 = R(V.Pasma, { nadpis: 'Stáří ve fázi', radky: [{ klic: 'navrh_odeslan', nazev: 'Návrh odeslán', pasma: pasmo(9, 9, 9, 9), nezname: 0, median: 10, p90: 30 }], onProklik: () => {} });
  const vPruhu = [...p3.matchAll(/data-pasmo-text="([^"]+)"/g)].map((m) => m[1]);
  over('Z2k', stejne(vPruhu, ['0-7', '15-30', '31+']), 'čísla uvnitř pásem jen tam, kde text splní kontrast AA (ne v oranžovém pásmu 8–14 dní)', vPruhu.join(','));
  // drobnost 9: rozbalení pod trychtýřem patří do jeho karty (obsah pod grafem uvnitř <figure>)
  const t3 = R(V.Trychtyr, { nadpis: 'Trychtýř prvního hovoru', kroky, onProklik: () => {}, pata: h('details', { className: 'prehled-rozbal' }, h('summary', null, 'Současné rozložení stavů')) });
  over('Z2l', /<figure[\s\S]*<details class="prehled-rozbal">[\s\S]*<\/figure>/.test(t3), 'pata grafu (rozbalení „Současné rozložení stavů“) je uvnitř karty grafu', '');
});

/* ---------------- Z3) přejmenování kroku trychtýře ---------------- */
await blok('Z3', async () => {
  if (!L) return;
  over('Z3', L.nazevMetriky('dovolan', 'Dovolán') === 'Spojen' && /nedovol/i.test(L.definiceMetriky('dovolan', 'x')) && L.nazevMetriky('dovolano', 'Dovoláno') === 'Spojeno',
    'krok trychtýře dovolan je v Přehledu „Spojen“ s vlastní definicí (stejná tabulka jako „Spojeno“)', L.nazevMetriky('dovolan', 'Dovolán'));
  // koordinátor 18. 11. 2026 (revize databáze): plán počítá každý den období od nastavení rozvrhu, i dny, které teprve přijdou
  // (bez svátků), takže v půlce měsíce je plnění postup k plánu celého období, ne neúspěch
  const defPlan = L.definiceMetriky('planovane_hodiny', 'x');
  const defPlneni = L.definiceMetriky('plneni_planu', 'x');
  over('Z3b', L.nazevMetriky('planovane_hodiny', 'Plánované hodiny') === 'Plán za celé období' && L.nazevMetriky('plneni_planu', 'Plnění plánu') === 'Splněno z plánu období'
    && /teprve přijdou/.test(defPlan) && /svát/.test(defPlan) && /celého období/.test(defPlneni) && /teprve přijdou/.test(defPlneni),
    'plán a jeho plnění: „Plán za celé období“ a „Splněno z plánu období“; definice říkají, že plán počítá i dny, které teprve přijdou (bez svátků)',
    JSON.stringify([L.nazevMetriky('planovane_hodiny', 'Plánované hodiny'), L.nazevMetriky('plneni_planu', 'Plnění plánu'), defPlan, defPlneni]));
});

/* ---------------- Z4) tabulka porovnání lidí ---------------- */
const pokr = (n) => ({ zname: n, celkem: n, nezname: 0, podil: n === 0 ? null : 1 });
/** Názvy metrik jako ze serveru (katalog §3.11): dovolano je tam „Dovoláno“, appka ho ukáže jako „Spojeno“. */
const NAZVY_SERVERU = { hovory: 'Hovory', dovolano: 'Dovoláno', pocet_prodeju: 'Počet prodejů', hodnota_prodeju: 'Hodnota prodejů' };
function metr(klic, hodnota, o = {}) {
  return { klic, verze: 1, nazev: NAZVY_SERVERU[klic] ?? klic, hodnota, castky: [], citatel: null, jmenovatel: null, n: hodnota, pokryti: hodnota === null ? null : pokr(hodnota), kvalita: hodnota === null ? 'nedostupne' : 'dostupne',
    duvod: hodnota === null ? 'Zdroj chybí.' : null, zaklad: 'aktivita', proklik: hodnota === null ? null : { zdroj: 'hovory', filtr: { od: '2026-11-01', do: '2026-11-30', vyber: { metrika: klic } } }, ...o };
}
const penize = (klic, castka) => metr(klic, null, { kvalita: 'dostupne', duvod: null, n: 1, pokryti: pokr(1), castky: [{ mena: 'CZK', hodnota: castka, pokryti: pokr(1) }], proklik: { zdroj: 'prodeje', filtr: { vyber: { metrika: klic } } } });
function radekLidi(druh, uid, jmeno, hovory, prodeje, hodnota) {
  return { druh, user_id: uid, display_name: jmeno, role: druh === 'osoba' ? 'admin' : null, active: druh === 'osoba' ? true : null, tym_id: druh === 'osoba' ? 1 : null, tym_nazev: druh === 'osoba' ? 'Tým Albert' : null, sla_cenzurovano: 0,
    metriky: { hovory: metr('hovory', hovory), dovolano: metr('dovolano', hovory === null ? null : Math.floor(hovory / 2)), pocet_prodeju: metr('pocet_prodeju', prodeje), hodnota_prodeju: penize('hodnota_prodeju', hodnota) } };
}
await blok('Z4', async () => {
  if (!L) return;
  const petra = { klic: 'u2', nazev: 'Petra', druh: 'osoba', radek: radekLidi('osoba', 2, 'Petra', 6, 1, '7000.00') };
  const cenek = { klic: 'u7', nazev: 'Čeněk', druh: 'osoba', radek: radekLidi('osoba', 7, 'Čeněk', null, 0, '0.00') };
  const honza = { klic: 'u3', nazev: 'Honza', druh: 'osoba', radek: radekLidi('osoba', 3, 'Honza', 7, 3, '3500.00') };
  const adam = { klic: 'u8', nazev: 'Adam', druh: 'osoba', radek: radekLidi('osoba', 8, 'Adam', 2, 0, '0.00') };
  const s1 = L.seradRadkyLidi([petra, cenek, honza, adam], 'hovory', 'sestupne', 'CZK').map((r) => r.nazev);
  const s2 = L.seradRadkyLidi([petra, cenek, honza, adam], 'hovory', 'vzestupne', 'CZK').map((r) => r.nazev);
  const s3 = L.seradRadkyLidi([petra, cenek, honza, adam], 'jmeno', 'vzestupne', 'CZK').map((r) => r.nazev);
  const s4 = L.seradRadkyLidi([petra, cenek, honza, adam], 'hodnota_prodeju', 'sestupne', 'CZK').map((r) => r.nazev);
  over('Z4a', stejne(s1, ['Honza', 'Petra', 'Adam', 'Čeněk']) && stejne(s2, ['Adam', 'Petra', 'Honza', 'Čeněk']) && stejne(s3, ['Adam', 'Čeněk', 'Honza', 'Petra'])
    && stejne(s4, ['Petra', 'Honza', 'Adam', 'Čeněk']),
    'řazení: podle čísla oběma směry, neznámé vždy na konci, jména česky (Č po C), peníze podle měny filtru (shoda jménem)', JSON.stringify([s1, s2, s3, s4]));
  const h = L.createElement;
  const nikdo = { klic: 'neprirazeno', nazev: 'Nepřiřazeno', popis: 'klienti bez připsaného člověka', druh: 'neprirazeno', radek: radekLidi('neprirazeno', null, 'Nepřiřazeno', 0, 2, '9800.00') };
  const soucet = radekLidi('soucet', null, 'Celkem', 13, 6, '20300.00');
  const html = L.renderToStaticMarkup(h(L.TabulkaLidi, {
    popisek: 'Porovnání lidí', radky: [petra, honza, nikdo], soucet, sloupce: ['hovory', 'dovolano', 'pocet_prodeju', 'hodnota_prodeju'], mena: 'CZK', definice: null,
    onProklik: () => {}, vychoziRazeni: { klic: 'hovory', smer: 'sestupne' },
  }));
  const telo = /<tbody[^>]*>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? '';
  const pata = /<tfoot[^>]*>([\s\S]*?)<\/tfoot>/.exec(html)?.[1] ?? '';
  const radky = [...telo.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => text(m[1]));
  over('Z4b', radky.length === 3 && radky[0].startsWith('Honza') && radky[1].startsWith('Petra') && /^Nepřiřazeno/.test(radky[2]) && /bez připsaného člověka/.test(radky[2])
    && /prehled-radek-neprirazeno/.test(telo) && /^Celkem/.test(text(pata)) && text(pata).includes('13'),
    'tabulka: lidé podle řazení, Nepřiřazeno zvlášť pod nimi s popisem (nikdy do člověka), součet „Celkem“ v patičce', `${radky.join(' | ')} || ${text(pata)}`);
  over('Z4c', /aria-sort="descending"/.test(html) && (html.match(/aria-sort=/g) ?? []).length === 1 && /<th[^>]*>\s*<button[^>]*>[\s\S]*?Spojeno/.test(html) && !/Dovoláno/.test(html)
    && /class="mini-pruh"/.test(html) && /aria-label="Zobrazit řádky: Hovory – Petra"/.test(html) && /aria-label="Zobrazit řádky: Hovory – Celkem"/.test(html)
    && /7 000 Kč/.test(text(html)),
    'záhlaví jsou tlačítka řazení (aria-sort u řazeného), „Spojeno“ místo „Dovoláno“, mini pruhy, čísla s proklikem jsou tlačítka i v součtu',
    text(html).slice(0, 200));
  // odpracováno z plánu: záhlaví říká „za celé období“; s filtrem segmentu je pracovní čas nedostupný a buňka ukáže důvod serveru
  // (⚠ úkol 14b: věta databáze z kontraktu §9 bod 14 NAHRAZUJE „Pracovní čas není rozdělený podle segmentu, oboru ani kraje …“)
  const BEZ_DIM = 'Pracovní doba není rozdělená podle klientů; zrušte filtr.';
  const hodiny = (r, odpr, plan, plneni) => ({ ...r, radek: { ...r.radek, metriky: { ...r.radek.metriky,
    odpracovane_hodiny: odpr === null ? metr('odpracovane_hodiny', null, { duvod: BEZ_DIM }) : metr('odpracovane_hodiny', odpr),
    planovane_hodiny: plan === null ? metr('planovane_hodiny', null, { duvod: BEZ_DIM }) : metr('planovane_hodiny', plan),
    plneni_planu: plneni === null ? metr('plneni_planu', null, { duvod: BEZ_DIM }) : metr('plneni_planu', plneni, { citatel: odpr, jmenovatel: plan }) } } });
  const casHtml = L.renderToStaticMarkup(h(L.TabulkaLidi, {
    popisek: 'Porovnání lidí', radky: [hodiny(petra, 2.3, 103, 0.022330), hodiny(honza, null, null, null)], soucet: null, sloupce: ['odpracovane_hodiny'], mena: 'CZK', definice: null, onProklik: () => {},
  }));
  const zahlavi = text(/<thead[^>]*>([\s\S]*?)<\/thead>/.exec(casHtml)?.[1]);
  const bunky = [...casHtml.matchAll(/<td[^>]*data-sloupec="odpracovane_hodiny"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => text(m[1]));
  over('Z4d', /za celé období/.test(zahlavi) && /^2,3 h z 103 h/.test(bunky[0] ?? '') && /Splněno z plánu období: 2,2 %/.test(casHtml)
    && /^— /.test(bunky[1] ?? '') && (bunky[1] ?? '').includes(BEZ_DIM) && !/plán —|\b0 h/.test(bunky[1] ?? ''),
    'odpracováno z plánu: záhlaví „… za celé období“, bublina „Splněno z plánu období“; nedostupný pracovní čas = „—“ s důvodem serveru (nikdy 0 ani „plán —“)',
    JSON.stringify({ zahlavi, bunky }));
  // oprava po recenzi 18. 11. 2026 (task-14a-fixes.md)
  // drobnost 14: plnění plánu člověka je i v textu (ne jen v bublině title)
  over('Z4e', /splněno 2,2 %/.test(bunky[0] ?? ''), 'plnění plánu člověka je vidět v buňce („splněno 2,2 %“), ne jen v bublině', bunky[0] ?? '');
  // drobnost 1: částečné číslo má viditelnou značku „částečně“ a bublina nese přesnou částku i důvod
  const castecna = { ...petra, radek: { ...petra.radek, metriky: { ...petra.radek.metriky,
    hodnota_prodeju: { ...penize('hodnota_prodeju', '7000.50'), kvalita: 'castecne', duvod: 'U 1 z 2 prodejů není přesná cena.' } } } };
  const htmlC = L.renderToStaticMarkup(h(L.TabulkaLidi, { popisek: 'P', radky: [castecna], soucet: null, sloupce: ['hodnota_prodeju'], mena: 'CZK', definice: null, onProklik: () => {} }));
  const bunkaC = /<td[^>]*data-sloupec="hodnota_prodeju"[^>]*>([\s\S]*?)<\/td>/.exec(htmlC)?.[1] ?? '';
  const titulekC = (/title="([^"]*)"/.exec(bunkaC)?.[1] ?? '').replace(/\s+/g, ' ');
  over('Z4f', /částečně/.test(text(bunkaC)) && /7 000,5/.test(titulekC) && titulekC.includes('U 1 z 2 prodejů není přesná cena.'),
    'částečné číslo v tabulce: viditelná značka „částečně“, v bublině přesná částka i důvod', JSON.stringify({ bunka: text(bunkaC), titulekC }));
  // drobnost 7: Nepřiřazeno nemá pracovní čas: sloupce práce „—“ (žádné „0 h · plán —“)
  const nikdoCas = { ...nikdo, radek: { ...nikdo.radek, metriky: { ...nikdo.radek.metriky,
    odpracovane_hodiny: metr('odpracovane_hodiny', 0), planovane_hodiny: metr('planovane_hodiny', null, { duvod: 'Rozvrh není nastavený.' }),
    vysledku_za_hodinu: metr('vysledku_za_hodinu', null, { kvalita: 'dostupne', jmenovatel: 0, citatel: 0, duvod: 'Jmenovatel je 0, podíl nejde spočítat.' }) } } };
  const htmlN = L.renderToStaticMarkup(h(L.TabulkaLidi, { popisek: 'P', radky: [hodiny(petra, 2.3, 103, 0.02233), nikdoCas], soucet: null, sloupce: ['odpracovane_hodiny', 'vysledku_za_hodinu'], mena: 'CZK', definice: null, onProklik: () => {} }));
  const radekN = /<tr[^>]*data-druh="neprirazeno"[^>]*>([\s\S]*?)<\/tr>/.exec(htmlN)?.[1] ?? '';
  const bunkyN = [...radekN.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => text(m[1]));
  over('Z4g', bunkyN.length === 2 && bunkyN.every((t) => t === '—'), 'Nepřiřazeno: sloupce pracovního času jen „—“ (nikdy „0 h · plán —“)', JSON.stringify(bunkyN));
  // drobnost 1: tabulka segmentů ukáže pokrytí u součtu, který není úplný
  const dim = L.renderToStaticMarkup(h(L.PrehledKontext.Provider, { value: { otevriProklik: () => {} } }, h(L.TabulkaDimenze, { tabulka: 'segmenty', popisek: 'S', prvni: 'Segment', radky: [
    { klic: 'chata', nazev: 'Chaty', kontakty: 27, osloveno: 10, dovolano: 8, zajem: 5, navrhy: 5, prodano: 4, hodnota: [{ mena: 'CZK', hodnota: '10500.00', pokryti: { zname: 2, celkem: 4, nezname: 2, podil: 0.5 } }], proklik: null },
    { klic: 'architekt', nazev: 'Architekti', kontakty: 4, osloveno: 2, dovolano: 1, zajem: 1, navrhy: 1, prodano: 1, hodnota: [{ mena: 'CZK', hodnota: '6000.00', pokryti: { zname: 1, celkem: 1, nezname: 0, podil: 1 } }], proklik: null },
  ] })));
  const hodnotyDim = [...dim.matchAll(/<tr[^>]*data-radek="([^"]+)"[\s\S]*?<\/tr>/g)].map((m) => text(m[0]));
  over('Z4h', /pokrytí 2 ze 4/.test(hodnotyDim[0] ?? '') && !/pokrytí/.test(hodnotyDim[1] ?? ''), 'segmenty: neúplný součet hodnoty ukáže pokrytí („pokrytí 2 ze 4“), úplný ne', hodnotyDim.join(' | '));
  // úkol 14b (přeneseno z recenze 14a): v buňce týmu na Vedení je důvod plnění plánu součtu („Bez rozvrhu: N lidí; …“) v bublině
  // i jako text pro oči a čtečky, a částečné odpracované hodiny mají vlastní značku „částečně“ (s důvodem pro čtečky)
  const BEZ_ROZVRHU = 'Bez rozvrhu: 2 lidé; jejich hodiny se do plnění plánu nepočítají.';
  const ODHAD = 'U 1 ze 4 pracovních úseků je čas odhad z výsledků hovorů, bez časovače.';
  const tym = (odprKvalita) => ({ klic: 'tym-1', nazev: 'Tým Albert', popis: '3 lidé', druh: 'tym', radek: { ...radekLidi('soucet', null, 'Tým Albert', 10, 1, '7000.00'), metriky: {
    ...radekLidi('soucet', null, 'Tým Albert', 10, 1, '7000.00').metriky,
    odpracovane_hodiny: metr('odpracovane_hodiny', 12.5, odprKvalita === 'castecne' ? { kvalita: 'castecne', duvod: ODHAD } : {}),
    planovane_hodiny: metr('planovane_hodiny', 40),
    plneni_planu: metr('plneni_planu', 0.15, { kvalita: 'castecne', citatel: 6, jmenovatel: 40, duvod: BEZ_ROZVRHU }) } } });
  const bunkaTymu = (r) => {
    const html = L.renderToStaticMarkup(h(L.TabulkaLidi, { tabulka: 'tymy', popisek: 'Týmy', prvniSloupec: 'Tým', radky: [r], soucet: null, sloupce: ['odpracovane_hodiny'], mena: 'CZK', definice: null, onProklik: () => {} }));
    return /<td[^>]*data-sloupec="odpracovane_hodiny"[^>]*>([\s\S]*?)<\/td>/.exec(html)?.[1] ?? '';
  };
  const b1 = bunkaTymu(tym('castecne'));
  const b2 = bunkaTymu(tym('dostupne'));
  const bublina1 = [...b1.matchAll(/title="([^"]*)"/g)].map((m) => m[1].replace(/\s+/g, ' ')).join(' | ');
  const castecneKolik = (b) => (text(b).match(/částečně/g) ?? []).length;
  over('Z4i', text(b1).includes(BEZ_ROZVRHU) && bublina1.includes(BEZ_ROZVRHU) && text(b1).includes(ODHAD) && castecneKolik(b1) === 2
    && text(b2).includes(BEZ_ROZVRHU) && castecneKolik(b2) === 1 && /^12,5 h z 40 h/.test(text(b1)),
    'buňka týmu: důvod plnění plánu („Bez rozvrhu: 2 lidé; …“) v bublině i viditelně; částečné hodiny vlastní značkou „částečně“ s důvodem pro čtečky',
    JSON.stringify({ b1: text(b1), b2: text(b2), bublina1 }));
});

/* ---------------- Z9) jeden tvar množného čísla a měsíce (oprava po recenzi, drobnosti 10 a 11) ---------------- */
await blok('Z9', async () => {
  if (!L || !G) return;
  const T = ['# klient', '# klienti', '# klientů'];
  const tvary = [0, 1, 2, 4, 5, 21, 1000].map((n) => L.pocetSlovy(n, T).replace(/\s+/g, ' '));
  over('Z9a', stejne(tvary, ['0 klientů', '1 klient', '2 klienti', '4 klienti', '5 klientů', '21 klientů', '1 000 klientů']) && L.pocetSlovy(3, ['zbývá # den', 'zbývají # dny', 'zbývá # dní']) === 'zbývají 3 dny',
    'jeden pomocník množného čísla (1 / 2–4 / 0 a 5+) v src/prehled.ts', JSON.stringify(tvary));
  over('Z9b', G.mesicNazev('2026-11') === 'listopad 2026' && G.mesicNazev('2027-01') === 'leden 2027', 'měsíc „2026-11“ jako „listopad 2026“ (src/grafy.ts)', '');
  const bezKomentaru = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const zdroje = ['src/pages/prehled/ZalozkaVedeni.tsx', 'src/pages/prehled/ZalozkaPipeline.tsx', 'src/pages/prehled/ZalozkaPrognoza.tsx', 'src/pages/prehled/ZalozkaFinance.tsx',
    'src/pages/prehled/ZalozkaKomunikace.tsx', 'src/pages/prehled/ZalozkaKlienti.tsx', 'src/components/grafy/Pasma.tsx', 'src/components/grafy/Trychtyr.tsx', 'src/pages/prehled/ZalozkaDodani.tsx'];
  const pevne = zdroje.filter((p) => /(formatPocet|cislo)\([^)]*\)\}?\s?(klientů|dní|nabídek|kontaktů|signálů|lidí|řádků|případů)/.test(bezKomentaru(src(p))));
  const mistni = zdroje.filter((p) => /const (cislo|mesicText|lidi) =/.test(bezKomentaru(src(p))));
  const zFinance = /from '\.\/ZalozkaFinance'/.test(src('src/pages/prehled/ZalozkaDodani.tsx'));
  over('Z9c', pevne.length === 0 && mistni.length === 0 && !zFinance,
    'žádné pevné množné číslo za číslem, žádné místní kopie (cislo, mesicText, lidi), obnovy hostingu ze sdílené komponenty', JSON.stringify({ pevne, mistni, zFinance }));
});

/* ---------------- Z5) DEMO mock jako podklad záložek ---------------- */
await blok('Z5', async () => {
  if (!API) return;
  const T = 'demo-1-x';
  const m = await API.mockApi.prehledMoznosti(T);
  const cele = await API.mockApi.prehledLide(T, null);
  const tymy = await Promise.all(m.data.tymy.map((t) => API.mockApi.prehledLide(T, { lide: t.clenove })));
  const hovoryTymu = tymy.reduce((a, t) => a + t.data.soucet.metriky.hovory.hodnota, 0);
  const prodejeTymu = tymy.reduce((a, t) => a + t.data.soucet.metriky.pocet_prodeju.hodnota, 0);
  const nikdo = cele.data.radky.find((r) => r.druh === 'neprirazeno');
  over('Z5a', m.data.tymy.length >= 2 && hovoryTymu === cele.data.soucet.metriky.hovory.hodnota
    && prodejeTymu + (nikdo?.metriky.pocet_prodeju.hodnota ?? 0) === cele.data.soucet.metriky.pocet_prodeju.hodnota
    && tymy.every((t) => t.data.soucet.metriky.hovory.proklik?.filtr.lide?.length > 0),
    'týmy: součty týmů (prehled_lide s členy týmu) dají celek bez dvojího započtení; proklik týmu nese jeho lidi',
    JSON.stringify({ hovoryTymu, cele: cele.data.soucet.metriky.hovory.hodnota, prodejeTymu, nikdo: nikdo?.metriky.pocet_prodeju.hodnota }));
  const f = await API.mockApi.prehledFinance(T, null);
  const kat = f.data.naklady.kategorie;
  const soucetKat = kat.reduce((a, k) => a + Number(k.castka.castky.find((c) => c.mena === 'CZK')?.hodnota ?? 0), 0);
  over('Z5b', stejne(kat.map((k) => k.kategorie), ['provize', 'claude', 'lovable', 'domena', 'hosting', 'jine']) && kat.some((k) => k.overit > 0)
    && Math.abs(soucetKat - Number(f.data.naklady.celkem.castky[0].hodnota)) < 0.005 && kat.every((k) => !!k.castka.proklik),
    'náklady: šest kategorií (provize a pět z evidence) zvlášť, každá s řádky, dohromady = součet; v demu je položka „ověřit“',
    JSON.stringify(kat.map((k) => `${k.kategorie}:${k.castka.castky[0]?.hodnota}:${k.overit}`)));
  const p = await API.mockApi.prehledPipeline(T, null);
  const s = p.data.faze.filter((x) => x.n > 0);
  const pasmaSN = new Set(s.flatMap((x) => x.starnuti.pasma.filter((b) => b.n > 0).map((b) => b.pasmo)));
  const vzor = s.flatMap((x) => x.starnuti.pasma.filter((b) => b.n > 0).map((b) => ({ x, b })))[0];
  const r = vzor ? await API.mockApi.prehledRadky(T, vzor.b.proklik.zdroj, vzor.b.proklik.filtr) : null;
  // filtr segmentu, oboru nebo kraje: pracovní čas není po klientech, server ho vrátí nedostupný s důvodem (koordinátor
  // 18. 11. 2026, revize databáze); provize se filtrem řídí dál; řada hodin je nedostupná celá. ⚠ Úkol 14b (kontrakt §9 bod 14,
  // databáze 073): věta „Pracovní doba není rozdělená podle klientů; zrušte filtr.“ a plán z rozvrhu klienty filtrovaný není, takže
  // zůstává; NAHRAZUJE „plán taky nedostupný“ a větu „Pracovní čas není rozdělený podle segmentu, oboru ani kraje …“ úkolu 14a.
  const PRACE = ['odpracovane_hodiny', 'vysledku_za_hodinu', 'plneni_planu'];
  const BEZ_KLIENTU = 'Pracovní doba není rozdělená podle klientů; zrušte filtr.';
  const seg = await API.mockApi.prehledLide(T, { segment: ['architekt'] });
  const radkySeg = [seg.data.soucet, ...seg.data.radky];
  const radaSeg = await API.mockApi.prehledRada(T, 'odpracovane_hodiny', 'den', { segment: ['architekt'] });
  const rada = await API.mockApi.prehledRada(T, 'odpracovane_hodiny', 'den', null);
  over('Z5d', radkySeg.length >= 2 && radkySeg.every((rr) => PRACE.every((k) => rr.metriky[k]?.kvalita === 'nedostupne' && rr.metriky[k].hodnota === null && rr.metriky[k].duvod === BEZ_KLIENTU))
    && seg.data.radky.find((rr) => rr.user_id === 2)?.metriky.planovane_hodiny.kvalita !== 'nedostupne'
    && seg.data.soucet.metriky.provize_narok.kvalita !== 'nedostupne' && cele.data.soucet.metriky.odpracovane_hodiny.kvalita !== 'nedostupne'
    && radaSeg.data.body.length > 0 && radaSeg.data.body.every((b) => b.kvalita === 'nedostupne' && b.hodnota === null && b.duvod === BEZ_KLIENTU)
    && rada.data.body.some((b) => b.kvalita !== 'nedostupne'),
    'filtr segmentu: pracovní čas (odpracováno, výsledků za hodinu, plnění) nedostupný s větou databáze v každém řádku, plán z rozvrhu zůstává, provize dál; řada hodin celá nedostupná',
    JSON.stringify({ soucet: [...PRACE, 'planovane_hodiny'].map((k) => [k, seg.data.soucet.metriky[k]?.kvalita, seg.data.soucet.metriky[k]?.duvod]), body: radaSeg.data.body.slice(0, 2) }));
  // rozhodnutí koordinátora 18. 11. 2026 (task-14a-fixes.md): plnění plánu v součtu jen za lidi s plánem; hodiny lidí bez
  // rozvrhu se do něj nepočítají (částečné s důvodem), odpracováno v součtu dál za všechny
  const dva = await API.mockApi.prehledLide(T, { lide: [2, 3] });
  const rPetra = dva.data.radky.find((x) => x.user_id === 2);
  const rHonza = dva.data.radky.find((x) => x.user_id === 3);
  const pl = dva.data.soucet.metriky.plneni_planu;
  const hodinyObou = (rPetra?.metriky.odpracovane_hodiny.hodnota ?? NaN) + (rHonza?.metriky.odpracovane_hodiny.hodnota ?? NaN);
  over('Z5e', rPetra?.metriky.planovane_hodiny.kvalita !== 'nedostupne' && rHonza?.metriky.planovane_hodiny.kvalita === 'nedostupne' && rHonza.metriky.odpracovane_hodiny.hodnota > 0
    && Math.abs(pl.citatel - rPetra.metriky.odpracovane_hodiny.hodnota) < 0.011 && Math.abs(pl.jmenovatel - rPetra.metriky.planovane_hodiny.hodnota) < 0.011
    && pl.kvalita === 'castecne' && /Bez rozvrhu: 1 člověk; jeho hodiny se do plnění plánu nepočítají\./.test(pl.duvod ?? '')
    && Math.abs(dva.data.soucet.metriky.odpracovane_hodiny.hodnota - hodinyObou) < 0.011,
    'součet Petra (s plánem) + Honza (bez rozvrhu): plnění = hodiny Petry ÷ plán Petry, částečně s „Bez rozvrhu: 1 člověk; …“; odpracováno = oba',
    JSON.stringify({ pl: { c: pl.citatel, j: pl.jmenovatel, k: pl.kvalita, d: pl.duvod }, petra: rPetra?.metriky.odpracovane_hodiny.hodnota, honza: rHonza?.metriky.odpracovane_hodiny.hodnota,
      odpr: dva.data.soucet.metriky.odpracovane_hodiny.hodnota }));
  over('Z5c', s.length >= 2 && pasmaSN.size >= 2 && !!r && r.data.celkem === vzor.b.n,
    'pipeline v demu: aspoň dvě fáze a dvě různá pásma stáří s čísly; řádky prokliku pásma = číslo pásma',
    JSON.stringify({ fazi: s.length, pasma: [...pasmaSN], celkem: r?.data.celkem, n: vzor?.b.n }));
});

/* ---------------- Z7) týmy Vedení: skupiny výběru ---------------- */
await blok('Z7', async () => {
  if (!Z) return;
  // oprava po recenzi (drobnost 4): seznamy členů týmů se můžou překrývat (Mikuláš je v obou), člověk patří do týmu podle
  // lide[].tym_id, takže řádky týmů nikdy nedají víc než Celkem
  const m = {
    tymy: [{ id: 1, nazev: 'Tým Albert', clenove: [1, 2, 4, 5] }, { id: 4, nazev: 'Tým Mikuláš', clenove: [3, 4] }],
    lide: [1, 2, 3, 4, 5, 9].map((id) => ({ id, tym_id: id === 9 ? null : [1, 2, 5].includes(id) ? 1 : 4 })),
  };
  const vse = Z.skupinyTymu(m, null);
  const vyber = Z.skupinyTymu(m, [2, 3, 4]);
  const jeden = Z.skupinyTymu(m, [9]);
  const kolikrat = vse.flatMap((s) => s.ids).reduce((a, id) => a.set(id, (a.get(id) ?? 0) + 1), new Map());
  over('Z7', stejne(vse.map((s) => [s.nazev, s.ids]), [['Tým Albert', [1, 2, 5]], ['Tým Mikuláš', [3, 4]], ['Bez týmu', [9]]])
    && stejne(vyber.map((s) => [s.nazev, s.ids]), [['Tým Albert', [2]], ['Tým Mikuláš', [3, 4]]]) && stejne(jeden.map((s) => [s.nazev, s.ids]), [['Bez týmu', [9]]])
    && [...kolikrat.values()].every((n) => n === 1),
    'týmy na Vedení: člověk v týmu podle tym_id (i když ho seznam členů jiného týmu uvádí), prázdný tým vynechán, lidé bez týmu zvlášť; nikdo dvakrát',
    JSON.stringify([vse, vyber, jeden]));
});

/* ---------------- Z8) pohyby pipeline s daty ---------------- */
await blok('Z8', async () => {
  if (!P) return;
  const castka = (mena, hodnota) => ({ mena, hodnota, pokryti: null });
  const pohyby = {
    kvalita: 'castecne', duvod: 'Hodnota jen u klientů s cenou.',
    pocatek: { n: 12, castky: [castka('CZK', '120000.00'), castka('EUR', '900.00')] },
    nove: 4, znovu_otevrene: 1, vyhrane: 2, ztracene: 3, vyrazene: null,
    zmena_hodnoty: [castka('CZK', '-5000.00')], prirustek_hodnoty: [castka('CZK', '40000.00')], ubytek_hodnoty: [],
    konec: { n: 12, castky: [castka('CZK', '155000.00')] }, pruchozi: 17,
  };
  const html = P.renderToStaticMarkup(P.createElement(P.Pohyby, { d: { pohyby } }));
  const radky = [...html.matchAll(/<dt>([\s\S]*?)<\/dt><dd>([\s\S]*?)<\/dd>/g)].map((m) => [text(m[1]), text(m[2])]);
  const hodnota = (zacatek) => radky.find(([k]) => k.startsWith(zacatek))?.[1];
  const konecDl = html.indexOf('</dl>');
  const duvod = html.indexOf('Hodnota jen u klientů s cenou.');
  const nedostupne = P.renderToStaticMarkup(P.createElement(P.Pohyby, { d: { pohyby: { ...pohyby, kvalita: 'nedostupne', duvod: 'Historie začíná 17. 11.' } } }));
  over('Z8', radky.length === 11 && hodnota('Vyřazené') === '—' && hodnota('Úbytek hodnoty') === '—' && hodnota('Prošly obdobím') === '17'
    && /^12 · 120 000 Kč · 900 €$/.test(hodnota('Na začátku období') ?? '') && /^40 000 Kč$/.test(hodnota('Přírůstek hodnoty') ?? '')
    && /−5 000 Kč|-5 000 Kč/.test(hodnota('Změna hodnoty') ?? '') && konecDl > 0 && duvod > konecDl
    && !/<dl/.test(nedostupne) && /Historie začíná 17\. 11\./.test(nedostupne),
    'pohyby pipeline s daty: 11 řádků, neznámé „—“, CZK a EUR vedle sebe, důvod pod seznamem (ne v <dl>); nedostupné = prázdný stav s důvodem',
    JSON.stringify({ radky, konecDl, duvod, nedostupne: text(nedostupne).slice(0, 120) }));
});

/* ---------------- Z6) zapojení ---------------- */
await blok('Z6', async () => {
  const stranka = src('src/pages/prehled/PrehledPage.tsx');
  over('Z6a', !existsSync(join(ROOT, 'src/pages/prehled/ZalozkaObecna.tsx')) && !/ZalozkaObecna/.test(stranka)
    && ['ZalozkaLide', 'ZalozkaPipeline', 'ZalozkaKlienti', 'ZalozkaKomunikace', 'ZalozkaFinance', 'ZalozkaDodani', 'ZalozkaPrognoza'].every((z) => new RegExp(`<${z}\\b`).test(stranka)),
    'obecná záložka je pryč; stránka vykreslí pro každou záložku její vlastní komponentu', '');
  const bezKomentaru = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const zdroje = [...ZALOZKY.map((z) => `src/pages/prehled/${z}.tsx`), 'src/pages/prehled/TabulkaLidi.tsx', 'src/components/grafy/Trychtyr.tsx']
    .filter((p) => existsSync(join(ROOT, p)));
  const dovolano = zdroje.filter((p) => /Dovolán/.test(bezKomentaru(src(p))));
  over('Z6b', zdroje.length === ZALOZKY.length + 2 && dovolano.length === 0,
    'v záložkách, tabulce lidí a trychtýři nikde text „Dovoláno“ ani „Dovolán“ (Přehled říká „Spojeno“ a „Spojen“)', dovolano.join(', '));
  const css = src('src/styles.css');
  over('Z6c', /--graf-krok-1:/.test(css) && /--graf-krok-7:/.test(css) && /--graf-pasmo-4:/.test(css) && /--graf-krok-3:\s*var\(--orange\)/.test(css),
    'rampa grafů (7 kroků, 4 pásma) je v tokenech appky, prostřední krok je oranžová appky', '');
  const pkg = JSON.parse(src('package.json'));
  over('Z6d', /tests\/prehledzalozky\.test\.mjs/.test(pkg.scripts.test), 'npm test pouští i tests/prehledzalozky.test.mjs', pkg.scripts.test);
});

/* ---------------- Z12) akční seznam: termín jen dnem, tlačítko s neznámým počtem (úkol 14b, přeneseno z recenze 14a) ---------------- */
await blok('Z12', async () => {
  if (!A) return;
  const pripad = (id, termin, po) => ({ kontakt_id: id, jmeno: `Klient ${id}`, segment: 'chata', status: 'navrh_odeslan', nazev_stavu: 'Návrh odeslán', vlastnik: null, problem: 'Mlčí po návrhu',
    dalsi_krok: 'Zavolat', termin, po_terminu: po, hodnota: [], cena_stav: 'nezname', signaly: [{ kod: 'navrh_mlci', text: 'Mlčí po návrhu', od: termin, termin, zdroj: 'x' }], signal_zdroj: 'x' });
  const html = A.renderToStaticMarkup(A.createElement(A.TabulkaAkci, { pripady: [pripad(1, '2027-03-20', false), pripad(2, '2027-03-20T08:15:00+00:00', true)] }));
  const radek = (id) => text((new RegExp(`<tr[^>]*data-radek="${id}"[^>]*>([\\s\\S]*?)</tr>`).exec(html) ?? [])[1] ?? '');
  over('Z12a', /data-tabulka="akce"/.test(html) && /^20\. 3\. 2027 Klient 1/.test(radek(1)) && !/0:00/.test(radek(1)) && /^20\. 3\. 2027 9:15 po termínu/.test(radek(2)),
    'akční seznam: termín jen dnem se ukáže bez „0:00“, termín s časem s časem v Praze', JSON.stringify([radek(1), radek(2)]));
  const t = [1, 3, 12, null].map((n) => A.textZobrazitPripady(n));
  // neznámý počet: „Zobrazit případy“ bez čísla (recenze 14b, drobnost 7; ⚠ NAHRAZUJE „Zobrazit všech — případů“), nikdy 0
  over('Z12b', stejne(t, ['Zobrazit jeden případ', 'Zobrazit všechny 3 případy', 'Zobrazit všech 12 případů', 'Zobrazit případy']),
    'tlačítko akčního seznamu: tvar podle počtu, neznámý počet „Zobrazit případy“ (nikdy 0 ani „—“ uprostřed věty)', JSON.stringify(t));
});

/* ---------------- Z10) mock podle rozhodnutí databáze 18. 11. 2026 (kontrakt §9, úkol 4; úkol 14b) ---------------- */
// Sedm pravidel, která databáze 073 po recenzi úkolu 4 dodržuje a mock musí stejně: 1) filtr segmentu, oboru a kraje se zadaným
// k_datu = metriky bloku částečné, 2) neuchovávaná měřená pole se zadaným k_datu nedostupná, 3) náklady z evidence s filtrem lidí
// nebo klientů nedostupné a volitelná kategorie Jiné nikdy neúplnost, 4) výplaty s filtrem klientů nedostupné, 5) otevření
// v trychtýři, 6) hotové naplánované hovory tomu, kdo je uzavřel, 7) pracovní doba s filtrem klientů nedostupná.
await blok('Z10', async () => {
  if (!API) return;
  const api = API.mockApi;
  const T = 'demo-1-x';
  const hacek = globalThis.__volackaDemoTest;
  const DNES = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const posunD = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
  const OD = `${DNES.slice(0, 8)}01`;
  const DO = posunD(`${posunD(`${DNES.slice(0, 8)}28`, 4).slice(0, 8)}01`, -1);
  const hodinZpet = (h) => new Date(Date.now() - h * 3600000).toISOString();
  const KD_PRED = hodinZpet(48); // před začátkem historie dema (30 h zpět)
  const KD_PO = hodinZpet(2); // po začátku historie
  const SEG = 'Segment podle dnešního stavu: historie začíná ';
  const OBK = 'Obor a kraj podle dnešního stavu (nejsou v historii).';
  const radkyLidi = (o) => [o.data.soucet, ...o.data.radky];
  // 1) filtr segmentu před začátkem historie (a obor a kraj vždy) se zadaným k_datu: každá metrika bloku castecne s důvodem
  const denKD = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(KD_PRED));
  const fSeg = { od: posunD(denKD, -6), do: denKD, segment: ['chata'], k_datu: KD_PRED };
  const souhrn = await api.prehledSouhrn(T, fSeg);
  const rada = await api.prehledRada(T, 'hovory', 'den', fSeg);
  const trych = await api.prehledTrychtyr(T, fSeg);
  const lide = await api.prehledLide(T, fSeg);
  const castecneS = (objekty, veta) => objekty.length > 0 && objekty.every((m) => m.kvalita === 'nedostupne' || (m.kvalita === 'castecne' && (m.duvod ?? '').includes(veta)));
  const kartyDost = Object.values(souhrn.data.karty).filter((m) => m.kvalita !== 'nedostupne');
  const metrikyLidi = (o) => radkyLidi(o).flatMap((r) => Object.entries(r.metriky).filter(([k]) => k !== 'planovane_hodiny').map(([, m]) => m));
  const plany = (o) => radkyLidi(o).map((r) => r.metriky.planovane_hodiny);
  over('Z10a1', kartyDost.length > 0 && castecneS(kartyDost, SEG) && souhrn.meta.varovani.some((v) => v.kod === 'HISTORIE_OD')
    && castecneS(rada.data.body.filter((b) => b.kvalita !== 'nedostupne'), SEG) && rada.data.body.some((b) => b.kvalita !== 'nedostupne')
    && castecneS([...trych.data.kroky, ...trych.data.po_navrhu.kroky], SEG) && trych.meta.varovani.some((v) => v.kod === 'HISTORIE_OD')
    && castecneS(metrikyLidi(lide), SEG) && plany(lide).every((m) => !(m.duvod ?? '').includes(SEG)) && lide.meta.varovani.some((v) => v.kod === 'HISTORIE_OD'),
    'segment se zadaným k_datu před začátkem historie: karty, sloupce řady, kroky trychtýře a metriky lidí (kromě plánu) castecne „Segment podle dnešního stavu: historie začíná …“, varování HISTORIE_OD',
    JSON.stringify({ karty: kartyDost.map((m) => [m.klic, m.kvalita, m.duvod]).slice(0, 3), bod: rada.data.body.find((b) => b.kvalita !== 'nedostupne'), krok: trych.data.kroky[1], lide: lide.meta.varovani.map((v) => v.kod) }));
  const fKraj = { od: OD, do: DO, kraj: ['neznamy'], k_datu: KD_PO };
  const sKraj = await api.prehledSouhrn(T, fKraj);
  const lKraj = await api.prehledLide(T, fKraj);
  const lSegPo = await api.prehledLide(T, { od: OD, do: DO, segment: ['chata'], k_datu: KD_PO });
  const lSegZive = await api.prehledLide(T, { od: OD, do: DO, segment: ['chata'] });
  const nikde = (o, veta) => metrikyLidi(o).every((m) => !(m.duvod ?? '').includes(veta));
  over('Z10a2', castecneS(Object.values(sKraj.data.karty).filter((m) => m.kvalita !== 'nedostupne'), OBK) && castecneS(metrikyLidi(lKraj), OBK)
    && !lKraj.meta.varovani.some((v) => v.kod === 'HISTORIE_OD') && nikde(lSegPo, SEG) && nikde(lSegZive, SEG) && nikde(lSegZive, OBK),
    'obor a kraj se zadaným k_datu vždy castecne „Obor a kraj podle dnešního stavu (nejsou v historii).“; segment po začátku historie a bez k_datu bez té věty',
    JSON.stringify({ kraj: metrikyLidi(lKraj).slice(0, 2).map((m) => [m.klic, m.kvalita, m.duvod]), segPo: lSegPo.meta.varovani.map((v) => v.kod) }));
  // 2) se zadaným k_datu: doba do zavolání, hovory po termínu a „odpověděl“ po návrhu nedostupné (R11), K_DATU_MINULOST
  const fK = { od: OD, do: DO, k_datu: KD_PO };
  const lK = await api.prehledLide(T, fK);
  const tK = await api.prehledTrychtyr(T, fK);
  const lZ = await api.prehledLide(T, { od: OD, do: DO });
  const tZ = await api.prehledTrychtyr(T, { od: OD, do: DO });
  const SLA = 'Komu označení patří, se nezaznamenává; doba do zavolání je jen pro dnešek.';
  const PO_TERMINU = 'Termín naplánovaného hovoru se nezaznamenává; hovory po termínu jsou jen pro dnešek.';
  const ODPOVEDEL = 'Poslední odpověď klienta se nezaznamenává; odpovědi po návrhu jsou jen pro dnešek.';
  const nedost = (m, veta) => !!m && m.kvalita === 'nedostupne' && m.hodnota === null && m.duvod === veta && m.proklik === null;
  const odp = tK.data.po_navrhu.kroky.find((k) => k.klic === 'odpovedel');
  over('Z10b', radkyLidi(lK).every((r) => r.sla_cenzurovano === null && nedost(r.metriky.sla_prvni_kontakt_median, SLA) && nedost(r.metriky.sla_prvni_kontakt_p90, SLA)
      && nedost(r.metriky.naplanovane_po_terminu, PO_TERMINU) && r.metriky.naplanovane_hotove.kvalita !== 'nedostupne')
    && lK.meta.varovani.some((v) => v.kod === 'K_DATU_MINULOST') && odp?.kvalita === 'nedostupne' && odp.n === null && odp.podil === null && odp.proklik === null && odp.duvod === ODPOVEDEL
    && radkyLidi(lZ).every((r) => typeof r.sla_cenzurovano === 'number' && r.metriky.sla_prvni_kontakt_median.kvalita !== 'nedostupne' && r.metriky.naplanovane_po_terminu.kvalita !== 'nedostupne')
    && tZ.data.po_navrhu.kroky.find((k) => k.klic === 'odpovedel')?.kvalita !== 'nedostupne',
    'se zadaným k_datu: doba do zavolání a hovory po termínu nedostupné s větou databáze, sla_cenzurovano null, „Odpověděl“ po návrhu nedostupný; živě dostupné',
    JSON.stringify({ sla: lK.data.soucet.metriky.sla_prvni_kontakt_median, odp }));
  // 3) náklady z evidence s filtrem lidí, segmentu, oboru nebo kraje: kategorie, celkem a výsledek nedostupné, provize dál; řada
  //    nákladů celá nedostupná; bez filtru prázdná povinná kategorie (hosting) = castecne, volitelná Jiné nikdy
  const NAKL = 'Náklady z evidence nejsou rozdělené podle lidí ani klientů; zrušte filtr.';
  const vadyNakladu = [];
  for (const f of [{ lide: [2] }, { segment: ['chata'] }, { obor: ['autoservis: pneuservis'] }, { kraj: ['neznamy'] }]) {
    const fin = await api.prehledFinance(T, { od: OD, do: DO, ...f });
    const r = await api.prehledRada(T, 'naklady_celkem', 'den', { od: OD, do: DO, ...f });
    const kat = fin.data.naklady.kategorie;
    const ok = kat.every((k) => (k.kategorie === 'provize' ? k.castka.kvalita !== 'nedostupne' : nedost(k.castka, NAKL) && k.castka.castky.length === 0))
      && nedost(fin.data.naklady.celkem, NAKL) && nedost(fin.data.vysledek, NAKL) && r.data.body.length > 0 && r.data.body.every((b) => b.kvalita === 'nedostupne' && b.duvod === NAKL);
    if (!ok) vadyNakladu.push(`${JSON.stringify(f)}: ${JSON.stringify({ celkem: fin.data.naklady.celkem.kvalita, bod: r.data.body[0] })}`);
  }
  over('Z10c1', vadyNakladu.length === 0, 'náklady z evidence a výsledek s filtrem lidí, segmentu, oboru nebo kraje nedostupné s větou databáze, provize podle filtru; řada nákladů celá nedostupná', vadyNakladu.join(' | '));
  // věty doslova jako 073 v 7553864d: Finance (prehled_finance) „Pro kategorii „…“ není zadaný žádný náklad.“ u kategorie i v Nákladech
  // celkem, řada nákladů (prehled_rada) „Bez zadaného nákladu: …“ (recenze 14b, drobnost 8; ⚠ NAHRAZUJE „Bez zadaného nákladu: …“
  // i ve Financích)
  const BEZ_HOSTINGU = 'Bez zadaného nákladu: Hosting (náš náklad).';
  const PRAZDNY_HOSTING = 'Pro kategorii „Hosting (náš náklad)“ není zadaný žádný náklad.';
  const fin0 = await api.prehledFinance(T, { od: OD, do: DO });
  const kat0 = Object.fromEntries(fin0.data.naklady.kategorie.map((k) => [k.kategorie, k.castka]));
  const r0 = await api.prehledRada(T, 'naklady_celkem', 'mesic', { od: OD, do: DO });
  over('Z10c2', kat0.jine.kvalita === 'dostupne' && kat0.jine.castky[0]?.hodnota === '0.00' && kat0.hosting.kvalita === 'castecne' && kat0.hosting.duvod === PRAZDNY_HOSTING
    && (fin0.data.naklady.celkem.duvod ?? '').includes(PRAZDNY_HOSTING) && !/Jiné/.test(fin0.data.naklady.celkem.duvod ?? '') && fin0.data.vysledek.kvalita === 'castecne'
    && !JSON.stringify(fin0.data.naklady).includes('Bez zadaného nákladu')
    && r0.data.body.every((b) => b.kvalita !== 'castecne' || ((b.duvod ?? '').includes(BEZ_HOSTINGU) && !/Jiné/.test(b.duvod ?? ''))) && r0.data.body.some((b) => (b.duvod ?? '').includes(BEZ_HOSTINGU))
    && !r0.data.body.some((b) => /Pro kategorii/.test(b.duvod ?? '')),
    'prázdná povinná kategorie (hosting): ve Financích u kategorie i v Nákladech celkem věta 073 „Pro kategorii „Hosting (náš náklad)“ není zadaný žádný náklad.“ (výsledek castecne), řada nákladů „Bez zadaného nákladu: …“; prázdná volitelná Jiné je ověřená 0 a neúplnost nedělá',
    JSON.stringify({ jine: kat0.jine, hosting: kat0.hosting, celkem: fin0.data.naklady.celkem.duvod, bod: r0.data.body[0] }));
  // 4) výplaty s filtrem segmentu, oboru nebo kraje nedostupné v každém řádku lidí i v součtu (a ve Financích); s lidmi dál podle člověka
  const VYPL = 'Výplaty provizí nejsou rozdělené podle klientů; zrušte filtr.';
  const vadyVyplat = [];
  for (const f of [{ segment: ['chata'] }, { obor: ['autoservis: pneuservis'] }, { kraj: ['neznamy'] }]) {
    const l = await api.prehledLide(T, { od: OD, do: DO, ...f });
    const fin = await api.prehledFinance(T, { od: OD, do: DO, ...f });
    const ok = radkyLidi(l).every((r) => nedost(r.metriky.provize_vyplaceno, VYPL) && nedost(r.metriky.provize_zbyva, VYPL) && r.metriky.provize_vyplaceno.castky.length === 0
      && r.metriky.provize_narok.kvalita !== 'nedostupne') && nedost(fin.data.provize.vyplaceno, VYPL) && nedost(fin.data.provize.zbyva, VYPL) && fin.data.provize.narok.kvalita !== 'nedostupne';
    if (!ok) vadyVyplat.push(`${JSON.stringify(f)}: ${JSON.stringify(l.data.soucet.metriky.provize_vyplaceno)}`);
  }
  const lPetra = await api.prehledLide(T, { od: posunD(DNES, -10), do: DNES, lide: [2] });
  over('Z10d', vadyVyplat.length === 0 && lPetra.data.radky[0]?.metriky.provize_vyplaceno.castky[0]?.hodnota === '1470.00',
    'výplaty provizí s filtrem segmentu, oboru nebo kraje nedostupné s větou databáze v každém řádku, součtu i Financích (nárok dál); s výběrem lidí podle příjemce',
    `${vadyVyplat.join(' | ')} || ${JSON.stringify(lPetra.data.radky[0]?.metriky.provize_vyplaceno.castky)}`);
  // 7) pracovní doba s filtrem segmentu, oboru nebo kraje nedostupná (plán zůstává), bez zdroje hovorů výsledky za hodinu nedostupné
  const PRACE_TXT = 'Pracovní doba není rozdělená podle klientů; zrušte filtr.';
  const vadyPrace = [];
  for (const f of [{ segment: ['chata'] }, { obor: ['autoservis: pneuservis'] }, { kraj: ['neznamy'] }]) {
    const l = await api.prehledLide(T, { od: OD, do: DO, ...f });
    const r = await api.prehledRada(T, 'odpracovane_hodiny', 'den', { od: OD, do: DO, ...f });
    const ok = radkyLidi(l).every((rr) => ['odpracovane_hodiny', 'vysledku_za_hodinu', 'plneni_planu'].every((k) => rr.metriky[k].kvalita === 'nedostupne' && rr.metriky[k].hodnota === null && rr.metriky[k].duvod === PRACE_TXT))
      && l.data.radky.find((rr) => rr.user_id === 2)?.metriky.planovane_hodiny.kvalita !== 'nedostupne' && r.data.body.every((b) => b.kvalita === 'nedostupne' && b.duvod === PRACE_TXT);
    if (!ok) vadyPrace.push(`${JSON.stringify(f)}: ${JSON.stringify(l.data.soucet.metriky.odpracovane_hodiny)}`);
  }
  over('Z10g1', vadyPrace.length === 0, 'pracovní doba (odpracováno, výsledků za hodinu, plnění) s filtrem segmentu, oboru nebo kraje nedostupná s větou databáze, plán z rozvrhu zůstává, řada hodin celá nedostupná', vadyPrace.join(' | '));
  if (typeof hacek.vyprazdniHovory !== 'function') {
    over('Z10g2', false, 'háček mocku vyprazdniHovory chybí (zkouška zdroje hovorů bez dat)', '');
  } else {
    const obnov = hacek.vyprazdniHovory();
    let lBez;
    try { lBez = await api.prehledLide(T, { od: OD, do: DO }); } finally { obnov(); }
    const lPo = await api.prehledLide(T, { od: OD, do: DO });
    const HOVORY = 'Zdroj „Hovory“ zatím nemá žádná data.';
    over('Z10g2', radkyLidi(lBez).every((r) => nedost(r.metriky.vysledku_za_hodinu, HOVORY) && r.metriky.hovory.kvalita === 'nedostupne' && r.metriky.hovory.hodnota === null)
      && lPo.data.soucet.metriky.hovory.kvalita !== 'nedostupne',
      'bez jediného hovoru (zdroj Hovory chybí): výsledků za hodinu a čísla z hovorů nedostupné, nikdy ověřená 0', JSON.stringify(lBez.data.soucet.metriky.vysledku_za_hodinu));
  }
  // 6) hotový naplánovaný hovor se připíše tomu, kdo ho uzavřel (coalesce(zmenil_id, user_id)); po termínu a doba do zavolání
  //    zůstávají vlastníkovi
  const M = 'demo-4-x';
  const st = hacek.stav();
  const ceka = new Set(st.zavolat.filter((z) => z.stav === 'ceka').map((z) => z.kontakt_id));
  const kand = st.kontakty.filter((c) => ['navrh_odeslan', 'ceka_na_klienta', 'zajem', 'upravy_ve_vyrobe'].includes(c.status) && !ceka.has(c.id) && c.segment === 'chata');
  const F6 = { od: DNES, do: DNES, lide: [3, 4] };
  const radekU = (o, uid) => o.data.radky.find((r) => r.user_id === uid)?.metriky;
  const l6a = await api.prehledLide(T, F6);
  const kdy = new Date(Date.now() + 86400000).toISOString();
  const z = await api.zavolatNaplanovat(M, kand[0].id, kdy, null, 3);
  await api.zavolatHotovo(M, z.id, null);
  const l6b = await api.prehledLide(T, F6);
  hacek.naplanujDosly(kand[1].id, 3);
  const l6c = await api.prehledLide(T, F6);
  const hot = (o, uid) => radekU(o, uid)?.naplanovane_hotove.hodnota;
  const kotvy = (o, uid) => radekU(o, uid)?.vysledku_za_hodinu.citatel;
  const poT = (o, uid) => radekU(o, uid)?.naplanovane_po_terminu.hodnota;
  over('Z10f', kand.length >= 2 && hot(l6b, 4) === hot(l6a, 4) + 1 && hot(l6b, 3) === hot(l6a, 3) && kotvy(l6b, 4) === kotvy(l6a, 4) + 1 && kotvy(l6b, 3) === kotvy(l6a, 3)
    && poT(l6c, 3) === poT(l6b, 3) + 1 && poT(l6c, 4) === poT(l6b, 4),
    'hovor Honzy uzavřený Mikulášem: hotový i výsledek pracovní doby u Mikuláše (kdo uzavřel), po termínu zůstává vlastníkovi',
    JSON.stringify({ hot: [hot(l6a, 4), hot(l6b, 4), hot(l6a, 3), hot(l6b, 3)], kotvy: [kotvy(l6a, 4), kotvy(l6b, 4), kotvy(l6a, 3), kotvy(l6b, 3)], poT: [poT(l6b, 3), poT(l6c, 3)] }));
  // řádky prokliku proti kartě (recenze 14b, důležité 1): hotové podle toho, kdo uzavřel, a jen člověka buňky (vyber.user_id),
  // po termínu podle vlastníka a taky jen člověka buňky; součet = lidé filtru; počet řádků (různí klienti) = číslo v kartě
  const idsRadku = async (m) => (m?.proklik ? (await api.prehledRadky(T, m.proklik.zdroj, m.proklik.filtr, null, 200)).data.radky.map((r) => r.kontakt_id) : null);
  const metrikaU = (o, uid, k) => (uid === null ? o.data.soucet.metriky : radekU(o, uid))?.[k];
  const hR = { m: await idsRadku(metrikaU(l6b, 4, 'naplanovane_hotove')), h: await idsRadku(metrikaU(l6b, 3, 'naplanovane_hotove')), s: await idsRadku(metrikaU(l6b, null, 'naplanovane_hotove')) };
  const pR = { m: await idsRadku(metrikaU(l6c, 4, 'naplanovane_po_terminu')), h: await idsRadku(metrikaU(l6c, 3, 'naplanovane_po_terminu')), s: await idsRadku(metrikaU(l6c, null, 'naplanovane_po_terminu')) };
  const hK = [metrikaU(l6b, 4, 'naplanovane_hotove')?.hodnota, metrikaU(l6b, 3, 'naplanovane_hotove')?.hodnota, metrikaU(l6b, null, 'naplanovane_hotove')?.hodnota];
  const pK = [metrikaU(l6c, 4, 'naplanovane_po_terminu')?.hodnota, metrikaU(l6c, 3, 'naplanovane_po_terminu')?.hodnota, metrikaU(l6c, null, 'naplanovane_po_terminu')?.hodnota];
  over('Z10f2', Object.values(hR).every(Array.isArray) && Object.values(pR).every(Array.isArray)
    && hR.m.includes(kand[0].id) && !hR.h.includes(kand[0].id) && hR.s.includes(kand[0].id) && stejne([hR.m.length, hR.h.length, hR.s.length], hK)
    && pR.h.includes(kand[1].id) && !pR.m.includes(kand[1].id) && pR.s.includes(kand[1].id) && stejne([pR.m.length, pR.h.length, pR.s.length], pK),
    'řádky prokliku = karta: hotový hovor Honzy uzavřený Mikulášem v řádcích Mikuláše a součtu, ne Honzy; po termínu v řádcích vlastníka (Honzy) a součtu; každá buňka jen svého člověka',
    JSON.stringify({ hotove: { radky: hR, karta: hK }, poTerminu: { radky: pR, karta: pK } }));
  // scénář recenze 14b (over-hotove.mjs): ve filtru jen Mikuláš; Honzův hovor, který uzavřel, je v jeho kartě i v jeho řádcích
  const l6d = await api.prehledLide(T, { od: DNES, do: DNES, lide: [4] });
  const jenM = { karta: metrikaU(l6d, 4, 'naplanovane_hotove')?.hodnota, soucet: metrikaU(l6d, null, 'naplanovane_hotove')?.hodnota,
    radky: await idsRadku(metrikaU(l6d, 4, 'naplanovane_hotove')), radkySoucet: await idsRadku(metrikaU(l6d, null, 'naplanovane_hotove')) };
  over('Z10f3', Array.isArray(jenM.radky) && Array.isArray(jenM.radkySoucet) && jenM.radky.includes(kand[0].id) && jenM.radkySoucet.includes(kand[0].id)
    && jenM.karta === hot(l6b, 4) && jenM.soucet === jenM.karta && jenM.radky.length === jenM.karta && jenM.radkySoucet.length === jenM.soucet,
    'filtr jen Mikuláš: hovor Honzy uzavřený Mikulášem je v kartě i v řádcích Mikuláše a součtu (řádky = karta)', JSON.stringify(jenM));
  // 5) otevření v trychtýři: prodaný klient je u kroků do „prodáno“ včetně uzavřený, u „fakturováno“ a „zaplaceno“ otevřený
  const F5 = { od: posunD(DNES, -60), do: DNES };
  const t5 = await api.prehledTrychtyr(T, F5);
  const krok = (o, k) => o.data.kroky.find((x) => x.klic === k);
  const idsKroku = async (o, k) => new Set((await api.prehledRadky(T, krok(o, k).proklik.zdroj, krok(o, k).proklik.filtr, null, 200)).data.radky.map((r) => r.kontakt_id));
  const seZajmem = await idsKroku(t5, 'zajem');
  const sNavrhem = await idsKroku(t5, 'navrh');
  const st5 = hacek.stav();
  const otevrene = ['zajem', 'web_ve_vyrobe', 'ceka_na_klienta', 'upravy_ve_vyrobe', 'pozdeji', 'pozastaveno', 'eskalace', 'navrh_odeslan'];
  const c5 = st5.kontakty.find((c) => seZajmem.has(c.id) && !sNavrhem.has(c.id) && otevrene.includes(c.status));
  if (!c5) {
    over('Z10e', false, 'v demu chybí klient kohorty se zájmem bez návrhu (zkouška otevřených v trychtýři)', '');
  } else {
    const puvodni = c5.status;
    await api.updateKontakt(T, c5.id, { status: 'schvaleno' });
    let t5b;
    try { t5b = await api.prehledTrychtyr(T, F5); } finally { await api.updateKontakt(T, c5.id, { status: puvodni }); }
    const prodane = await idsKroku(t5b, 'prodano');
    const fakturovane = await idsKroku(t5b, 'fakturovano');
    over('Z10e', krok(t5b, 'navrh').otevrenych === krok(t5, 'navrh').otevrenych - 1 && krok(t5b, 'zajem').otevrenych === krok(t5, 'zajem').otevrenych
      && krok(t5b, 'fakturovano').otevrenych === [...prodane].filter((id) => !fakturovane.has(id)).length,
      'trychtýř: prodaný klient bez návrhu u kroku „Návrh odeslán“ už není otevřený (do „prodáno“ včetně je prodaný uzavřený); u „Fakturováno“ je každý prodaný bez faktury otevřený',
      JSON.stringify({ navrh: [krok(t5, 'navrh').otevrenych, krok(t5b, 'navrh').otevrenych], fakt: [krok(t5b, 'fakturovano').otevrenych, prodane.size, fakturovane.size] }));
  }
});

/* ---------------- Z11) množné číslo věty „Bez rozvrhu“ v součtu (úkol 14b, přeneseno z recenze 14a) ---------------- */
// Pět nových Volajících bez rozvrhu odpracuje dnes kus času (Albert jim naplánuje hovor u klienta mimo frontu, oni otevřou
// kartu a hovor uzavřou: výsledek pracovní doby, §5.14); s Petrou (má rozvrh) v součtu: 1 člověk / jeho, 2–4 lidé / jejich,
// 5 a víc lidí / jejich. Až na konci souboru: zakládá lidi a hovory v mocku.
await blok('Z11', async () => {
  if (!API) return;
  const api = API.mockApi;
  const T = 'demo-1-x';
  const DNES = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const st = globalThis.__volackaDemoTest.stav();
  const ceka = new Set(st.zavolat.filter((z) => z.stav === 'ceka').map((z) => z.kontakt_id));
  const volni = st.kontakty.filter((c) => ['navrh_odeslan', 'ceka_na_klienta', 'zajem', 'upravy_ve_vyrobe', 'web_ve_vyrobe', 'eskalace'].includes(c.status) && !ceka.has(c.id));
  const novi = [];
  for (let i = 0; i < 5; i += 1) {
    const r = await api.createUser(T, `bezrozvrhu${i}`, 'heslo123', `Bez Rozvrhu ${i}`, 'admin', 1);
    const s = await api.login(`bezrozvrhu${i}`, 'heslo123');
    const z = await api.zavolatNaplanovat(T, volni[i].id, new Date(Date.now() + 86400000).toISOString(), null, r.user_id);
    await api.praceTep(s.token, 'karta', volni[i].id);
    const t0 = Date.now();
    while (Date.now() - t0 < 3) { /* aspoň 3 ms práce mezi kartou a výsledkem */ }
    await api.zavolatHotovo(s.token, z.id, null);
    novi.push(r.user_id);
  }
  const veta = async (n) => (await api.prehledLide(T, { od: DNES, do: DNES, lide: [2, ...novi.slice(0, n)] })).data.soucet.metriky.plneni_planu;
  const v = [];
  for (const n of [1, 2, 4, 5]) v.push(await veta(n));
  const ma = (m, s) => m.kvalita === 'castecne' && (m.duvod ?? '').includes(s);
  over('Z11', ma(v[0], 'Bez rozvrhu: 1 člověk; jeho hodiny se do plnění plánu nepočítají.') && ma(v[1], 'Bez rozvrhu: 2 lidé; jejich hodiny se do plnění plánu nepočítají.')
    && ma(v[2], 'Bez rozvrhu: 4 lidé; jejich hodiny se do plnění plánu nepočítají.') && ma(v[3], 'Bez rozvrhu: 5 lidí; jejich hodiny se do plnění plánu nepočítají.'),
    'věta součtu „Bez rozvrhu“ ve správném tvaru: 1 člověk / jeho, 2 a 4 lidé / jejich, 5 lidí / jejich', JSON.stringify(v.map((m) => [m.kvalita, m.duvod])));
});

if (chyby === 0) {
  console.log(`ALL OK (${pocet} kontrol)`);
  process.exit(0);
}
console.log(`CHYB: ${chyby} z ${pocet}`);
process.exit(1);
