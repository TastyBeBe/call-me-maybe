// Zkouška appky v DEMO v headless prohlížeči: přepínač ve volání, filtry seznamů, detail
// kontaktu (docs/ARCHITEKTI.md 9.2 až 9.6 a 9.8). Doplňuje tests/segment.test.mjs, který měří
// jen mock a pomocné funkce: tady se měří to, co dělají stránky, včetně odpovědí mimo pořadí.
//
// Nikdy živá DB:
//  - appka se sestaví do dočasné složky a servíruje se jen na 127.0.0.1,
//  - localStorage.volacka_supabase_url = ' ' PŘED načtením appky (DEMO), zvuk vypnutý,
//  - každý požadavek mimo 127.0.0.1 se zahodí; požadavek na supabase = FAIL.
// Zpoždění a stav mocku jdou přes háček __volackaDemoTest v src/api/mock.ts (jen DEMO).
//
// Spuštění:
//   npm run test:e2e                              (kořen appky = složka nad tests/)
//   APP_ROOT=/cesta/ke/kopii node tests/demo-e2e.mjs   (mutace v kopii; node_modules odkazem)
// Playwright se hledá v PLAYWRIGHT_MODULE (složka node_modules), v node_modules appky
// a v ~/webdomov/architect-templates/node_modules; prohlížeč v PLAYWRIGHT_BROWSERS_PATH,
// jinak ~/webdomov-nastroje/pw (docs/ARCHITEKTI.md 7.3). Nic se nestahuje.
// Výsledek: „ALL OK (N kontrol)" a kód 0; „FAIL <id>: …" a kód 1; bez prohlížeče
// „NEJDE ZMĚŘIT: …" a kód 2 (nezměřeno není v pořádku).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(process.env.APP_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..'));

function nejdeZmerit(proc) {
  console.log(`NEJDE ZMĚŘIT: ${proc}`);
  process.exit(2);
}

/* ---------------- prohlížeč ---------------- */
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(join(homedir(), 'webdomov-nastroje/pw'))) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = join(homedir(), 'webdomov-nastroje/pw');
}
let chromium = null;
for (const nm of [process.env.PLAYWRIGHT_MODULE, join(ROOT, 'node_modules'), join(homedir(), 'webdomov/architect-templates/node_modules')]) {
  if (!nm) continue;
  try {
    ({ chromium } = createRequire(join(nm, 'x.js'))('playwright'));
    break;
  } catch {
    // další kandidát
  }
}
if (!chromium) nejdeZmerit('chybí balík playwright (nastav PLAYWRIGHT_MODULE na složku node_modules s ním)');

/* ---------------- sestavení a server jen na 127.0.0.1 ---------------- */
const OUT = mkdtempSync(join(tmpdir(), 'volacka-e2e-'));
const vite = join(ROOT, 'node_modules/vite/bin/vite.js');
if (!existsSync(vite)) nejdeZmerit(`chybí ${vite} (npm ci v appce)`);
const sestaveni = spawnSync(process.execPath, [vite, 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'], {
  cwd: ROOT,
  encoding: 'utf8',
});
if (sestaveni.status !== 0) {
  console.log(`FAIL 0: appka nejde sestavit (${(sestaveni.stderr || sestaveni.stdout).split('\n').slice(0, 4).join(' | ')})`);
  rmSync(OUT, { recursive: true, force: true });
  process.exit(1);
}
const TYPY = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg',
};
const server = createServer((req, res) => {
  const cesta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let soubor = normalize(join(OUT, cesta === '/' ? 'index.html' : cesta));
  if (!soubor.startsWith(OUT) || !existsSync(soubor) || statSync(soubor).isDirectory()) soubor = join(OUT, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPY[extname(soubor)] ?? 'application/octet-stream' });
  res.end(readFileSync(soubor));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

let browser;
try {
  browser = await chromium.launch();
} catch (e) {
  server.close();
  rmSync(OUT, { recursive: true, force: true });
  nejdeZmerit(`prohlížeč nejde spustit (${String(e.message).split('\n')[0]})`);
}

/* ---------------- pomocníci ---------------- */
let pocet = 0;
let chyby = 0;
function over(id, podminka, text, detail = '') {
  pocet += 1;
  if (!podminka) {
    chyby += 1;
    console.log(`FAIL ${id}: ${text}${detail ? ` (${detail})` : ''}`);
  }
}
const supabase = [];
const chybyStranky = [];
const UID = { admin: 1, petra: 2, honza: 3, mikulas: 4, eva: 5 };
const HESLO = { admin: 'admin', petra: 'volam', honza: 'volam', mikulas: 'mikulas', eva: 'eva' };

async function novaStranka(kdo, { sirka = 1280, vyska = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: sirka, height: vyska } });
  await ctx.addInitScript(() => {
    localStorage.setItem('volacka_supabase_url', ' ');
    localStorage.setItem('volacka_sfx_enabled', '0');
    localStorage.setItem('volacka_music_enabled', '0');
    localStorage.setItem('volacka_pig_enabled', '0');
    globalThis.__volackaDemoTest = { volani: [], zpozdeni: () => 0 };
  });
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    if (/supabase/i.test(u)) supabase.push(u);
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => chybyStranky.push(String(e)));
  await page.goto(BASE + '#/login');
  await page.fill('#username', kdo);
  await page.fill('#password', HESLO[kdo]);
  await page.click('button[type=submit]');
  await page.waitForFunction(() => !location.hash.includes('login'));
  const hacek = await page.evaluate(() => typeof globalThis.__volackaDemoTest?.stav === 'function');
  if (!hacek) nejdeZmerit('mock nezapnul háček __volackaDemoTest (src/api/mock.ts)');
  return { ctx, page };
}

/** Počká, až doběhnou všechna volání mocku (i ta, která spustí vykreslení po nich). */
async function klid(page, ms = 250) {
  const hotovo = () => globalThis.__volackaDemoTest.volani.every((v) => v.ok !== undefined);
  await page.waitForFunction(hotovo, null, { timeout: 15000 });
  await page.waitForTimeout(ms);
  await page.waitForFunction(hotovo, null, { timeout: 15000 });
}
async function jdi(page, hash, ms = 450) {
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
  await page.waitForTimeout(80);
  await klid(page, ms);
}
const stav = (page) => page.evaluate(() => globalThis.__volackaDemoTest.stav());
const volani = (page) => page.evaluate(() => globalThis.__volackaDemoTest.volani.map((v) => ({ ...v })));
const zamkyUzivatele = async (page, uid) =>
  (await stav(page)).kontakty.filter((k) => k.lock_by === uid).map((k) => k.id).sort((a, b) => a - b);
const segmentKontaktu = async (page, id) => (await stav(page)).kontakty.find((k) => k.id === id)?.segment;
const eyebrow = async (page) => (await page.locator('p.eyebrow').first().textContent()) ?? '';
async function kartaId(page) {
  const m = /kontakt #(\d+)/i.exec(await eyebrow(page));
  return m ? Number(m[1]) : null;
}
const prepinac = (page, s) => page.locator(`.segment-switch button.${s}`);
const filtr = (page, text) => page.locator('.segment-filter button', { hasText: new RegExp(`^${text}$`) });
const nazvyVolani = (vs) => vs.map((v) => v.fn);

/* ============ V1) čistá karta: přepnutí ji vrátí do fronty a vezme architekta ============ */
{
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/call');
  const x = await kartaId(page);
  over('V1a', x !== null && (await segmentKontaktu(page, x)) === 'chata', 'volání začíná chatou', `karta ${x}`);
  over('V1b', JSON.stringify(await zamkyUzivatele(page, UID.petra)) === JSON.stringify([x]), 'zamčená je jen karta na obrazovce');
  const pred = (await volani(page)).length;
  await prepinac(page, 'architekt').click();
  await klid(page);
  const po = (await volani(page)).slice(pred);
  const y = await kartaId(page);
  over('V1c', po.some((v) => v.fn === 'returnContact' && v.args[0] === x && v.ok), 'čistá karta se po přepnutí vrátí do fronty (vratit_do_fronty)', JSON.stringify(nazvyVolani(po)));
  over('V1d', y !== null && y !== x && (await segmentKontaktu(page, y)) === 'architekt', 'po přepnutí je na obrazovce architekt', `karta ${y}`);
  over('V1e', JSON.stringify(await zamkyUzivatele(page, UID.petra)) === JSON.stringify([y]), 'po přepnutí je zamčený jen nový architekt, stará chata ne',
    JSON.stringify(await zamkyUzivatele(page, UID.petra)));
  over('V1f', /architekti/.test(await eyebrow(page)), 'eyebrow říká architekti', await eyebrow(page));
  await ctx.close();
}

/* ============ V2) odpověď, která dorazí po přepnutí, se zahodí a její zámek vrátí ============ */
{
  const { ctx, page } = await novaStranka('petra');
  await page.evaluate(() => {
    let n = 0;
    globalThis.__volackaDemoTest.zpozdeni = (fn) => (fn === 'nextContact' && n++ === 0 ? 1500 : 0);
  });
  await page.evaluate(() => {
    location.hash = '#/call';
  });
  await page.waitForSelector('.segment-switch button.architekt');
  await page.waitForTimeout(150);
  await prepinac(page, 'architekt').click();
  await klid(page, 400);
  const vs = await volani(page);
  const pozdni = vs.find((v) => v.fn === 'nextContact' && v.args[0] === 'chata');
  const y = await kartaId(page);
  over('V2a', !!pozdni && pozdni.ok && typeof pozdni.id === 'number', 'pomalá odpověď s chatou opravdu dorazila (jinak scénář nic neměří)', JSON.stringify(pozdni));
  over('V2b', y !== null && (await segmentKontaktu(page, y)) === 'architekt', 'na obrazovce je architekt, ne pozdní chata', `karta ${y}`);
  over('V2c', !!pozdni && vs.some((v) => v.fn === 'returnContact' && v.args[0] === pozdni.id && v.ok), 'zámek pozdní chaty se vrátil do fronty', JSON.stringify(nazvyVolani(vs)));
  over('V2d', JSON.stringify(await zamkyUzivatele(page, UID.petra)) === JSON.stringify([y]), 'zamčený zůstal jen zobrazený architekt',
    JSON.stringify(await zamkyUzivatele(page, UID.petra)));
  await ctx.close();
}

/* ============ V3) tam a zpět: pomalá chata, rychlý architekt, zpátky na chaty ============ */
{
  const { ctx, page } = await novaStranka('petra');
  await page.evaluate(() => {
    let n = 0;
    globalThis.__volackaDemoTest.zpozdeni = (fn) => (fn === 'nextContact' && n++ === 0 ? 1800 : 0);
  });
  await page.evaluate(() => {
    location.hash = '#/call';
  });
  await page.waitForSelector('.segment-switch button.architekt');
  await page.waitForTimeout(150);
  await prepinac(page, 'architekt').click();
  await page.waitForSelector('.call-card');
  await page.waitForFunction(() => !document.querySelector('.segment-switch button:disabled'));
  await prepinac(page, 'chata').click();
  await klid(page, 500);
  const z = await kartaId(page);
  over('V3a', z !== null && (await segmentKontaktu(page, z)) === 'chata', 'po návratu na chaty je na obrazovce chata', `karta ${z}`);
  over('V3b', JSON.stringify(await zamkyUzivatele(page, UID.petra)) === JSON.stringify([z]), 'po dvou přepnutích a pozdní odpovědi je zamčená jen zobrazená karta',
    JSON.stringify(await zamkyUzivatele(page, UID.petra)));
  await ctx.close();
}

/* ============ V4) rozdělaná karta: žlutá cedulka, „Přepnout hned", výsledek hovoru ============ */
{
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/call');
  const x = await kartaId(page);
  const poznamka = page.locator('.call-card textarea').last();
  await poznamka.fill('zkouška rozdělané karty');
  const pred = (await volani(page)).length;
  const stavPred = await stav(page);
  await prepinac(page, 'architekt').click();
  await klid(page, 500);
  const po = (await volani(page)).slice(pred);
  over('V4a', po.length === 0, 'přepnutí u rozdělané karty nevolá server (karta zůstává)', JSON.stringify(nazvyVolani(po)));
  over('V4b', (await kartaId(page)) === x, 'rozdělaná karta zůstala na obrazovce', `${await kartaId(page)} ≠ ${x}`);
  over('V4c', (await poznamka.inputValue()) === 'zkouška rozdělané karty', 'poznámka zůstala napsaná');
  over('V4d', /Po tomhle hovoru dostaneš architekta\./.test(await page.locator('.info-box').first().innerText()), 'žlutá cedulka říká, koho dostaneš po hovoru');
  const eb = await eyebrow(page);
  over('V4e', /volání · chaty · kontakt #\d+/.test(eb), 'eyebrow u karty chaty říká chaty, i když je přepnuto na architekty', eb);
  over('V4f', (await prepinac(page, 'architekt').getAttribute('aria-pressed')) === 'true', 'přepínač ukazuje zvolené architekty');

  await page.getByRole('button', { name: 'Přepnout hned' }).click();
  const textModalu = await page.locator('body').innerText();
  over('V4g', textModalu.includes('Přepnout hned?') && textModalu.includes('Poznámka se neuloží a tenhle kontakt se vrátí do fronty pro ostatní.'),
    'potvrzení „Přepnout hned?" s vysvětlením');
  await page.getByRole('button', { name: 'Dokončím hovor' }).click();
  await page.waitForTimeout(150);
  over('V4h', (await poznamka.inputValue()) === 'zkouška rozdělané karty' && (await kartaId(page)) === x, '„Dokončím hovor" nechá kartu i poznámku');

  await page.getByRole('button', { name: 'Přepnout hned' }).click();
  await page.getByRole('button', { name: 'Ano, přepnout' }).click();
  await klid(page, 400);
  const stavPo = await stav(page);
  const y = await kartaId(page);
  const vs = await volani(page);
  over('V4i', vs.some((v) => v.fn === 'returnContact' && v.args[0] === x && v.ok), '„Ano, přepnout" vrátí kartu do fronty');
  over('V4j', stavPo.callLog.length === stavPred.callLog.length, 'vrácení nezapíše hovor do call_log');
  over('V4k', stavPo.kontakty.find((k) => k.id === x)?.note === stavPred.kontakty.find((k) => k.id === x)?.note, 'poznámka se k vrácenému kontaktu neuloží');
  over('V4l', y !== null && (await segmentKontaktu(page, y)) === 'architekt', 'po potvrzení je na obrazovce architekt');
  over('V4m', JSON.stringify(await zamkyUzivatele(page, UID.petra)) === JSON.stringify([y]), 'zamčený je jen nový architekt');

  // TIP PRO HOVOR (9.4): jmenuje jen tlačítka, která na kartě jsou, a nestojí nad nimi
  await page.evaluate(() => window.scrollTo(0, 0));
  const tlacitka = (await page.locator('.outcome-row button').allInnerTexts()).map((t) => t.trim());
  const tip = await page.locator('.call-hint').innerText();
  over('V4n', tlacitka.includes('Odmítnuto') && /Odmítnuto/.test(tip), 'tip posílá volajícího na tlačítko Odmítnuto', tlacitka.join('|'));
  over('V4o', !/Nemají zájem/i.test(tip), 'tip nejmenuje tlačítko, které na kartě není („Nemají zájem")');
  const tlacitkaBox = await page.locator('.outcome-row').boundingBox();
  const tipBox = await page.locator('.call-hint').boundingBox();
  over('V4p', !!tlacitkaBox && tlacitkaBox.y + tlacitkaBox.height <= 900, 'tlačítka výsledku jsou na 1280×900 vidět bez posouvání', tlacitkaBox && `spodek ${Math.round(tlacitkaBox.y + tlacitkaBox.height)} px`);
  over('V4q', !!tlacitkaBox && !!tipBox && tipBox.y >= tlacitkaBox.y + tlacitkaBox.height, 'tip stojí pod tlačítky výsledku, ne nad nimi');

  // po výsledku hovoru jde další kontakt ze zvoleného segmentu
  await page.getByRole('button', { name: 'Nedovoláno' }).click();
  await klid(page, 400);
  const w = await kartaId(page);
  over('V4r', w === null || (await segmentKontaktu(page, w)) === 'architekt', 'po výsledku hovoru přijde zase architekt', `karta ${w}`);
  await ctx.close();
}

/* ============ V5) mobil: tlačítka výsledku před tipem, žádné vodorovné posouvání ============ */
{
  const { ctx, page } = await novaStranka('petra', { sirka: 375, vyska: 812 });
  await page.evaluate(() => localStorage.setItem('volacka_segment', 'architekt'));
  await jdi(page, '#/call');
  const tlacitkaBox = await page.locator('.outcome-row').boundingBox();
  const tipBox = await page.locator('.call-hint').boundingBox();
  over('V5a', !!tlacitkaBox && !!tipBox && tipBox.y >= tlacitkaBox.y + tlacitkaBox.height, 'na mobilu je tip pod tlačítky výsledku');
  const sirka = await page.evaluate(() => document.scrollingElement.scrollWidth);
  over('V5b', sirka <= 375, 'karta architekta na mobilu nemá vodorovné posouvání', `${sirka} px`);
  await ctx.close();
}

/* ============ L1) Kontakty: pozdní odpověď filtru nesmí přepsat zvolený segment ============ */
{
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/admin', 600);
  await page.evaluate(() => {
    globalThis.__volackaDemoTest.zpozdeni = (fn, args) =>
      fn === 'listKontakty' && args[0]?.segment === 'architekt' && args[0]?.limit === 50 ? 1500 : 0;
  });
  await filtr(page, 'architekti').click();
  await page.waitForTimeout(120);
  await filtr(page, 'chaty').click();
  await klid(page, 500);
  const chat = (await stav(page)).kontakty.filter((k) => k.segment === 'chata').length;
  const radky = page.locator('table.kontakty tbody tr');
  const architektu = await radky.locator('.badge.seg-architekt').count();
  const pill = await page.locator('h1 .count-pill').innerText().catch(() => '');
  over('L1a', (await filtr(page, 'chaty').getAttribute('aria-pressed')) === 'true', 'zvolené jsou chaty');
  over('L1b', architektu === 0 && (await radky.count()) === Math.min(chat, 50), 'pod filtrem chaty jsou jen chaty, i když odpověď pro architekty dorazila později',
    `${await radky.count()} řádků, z toho ${architektu} architektů`);
  over('L1c', pill === String(chat), 'počet v nadpisu je počet chat', `„${pill}" ≠ ${chat}`);

  // placeholder hledání (9.6) je na 1280 px celý vidět
  const ph = await page.evaluate(() => {
    const i = document.querySelector('.search-input');
    const cs = getComputedStyle(i);
    const c = document.createElement('canvas').getContext('2d');
    c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return {
      text: i.placeholder,
      sirka: c.measureText(i.placeholder).width,
      misto: i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
    };
  });
  over('L1d', ph.text === 'Hledat jméno, studio, telefon, web, e-mail, město, IČO, poznámku…', 'nápověda hledání má znění z 9.6', ph.text);
  over('L1e', ph.sirka <= ph.misto, 'nápověda hledání se na 1280 px vejde celá', `${Math.round(ph.sirka)} px textu, ${Math.round(ph.misto)} px místa`);
  await ctx.close();
}

/* ============ L2) Moji klienti: totéž ============ */
{
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/moji', 500);
  await page.evaluate(() => {
    globalThis.__volackaDemoTest.zpozdeni = (fn, args) => (fn === 'myKontakty' && args[3] === 'architekt' ? 1500 : 0);
  });
  await filtr(page, 'architekti').click();
  await page.waitForTimeout(120);
  await filtr(page, 'chaty').click();
  await klid(page, 500);
  const vs = await volani(page);
  const pozdni = vs.find((v) => v.fn === 'myKontakty' && v.args[3] === 'architekt');
  const radky = page.locator('table tbody tr');
  const n = await radky.count();
  const architektu = await radky.locator('.badge.seg-architekt').count();
  const pill = await page.locator('h1 .count-pill').innerText().catch(() => '');
  over('L2a', !!pozdni && pozdni.ok, 'pomalá odpověď s architekty dorazila (jinak scénář nic neměří)');
  over('L2b', (await filtr(page, 'chaty').getAttribute('aria-pressed')) === 'true' && architektu === 0,
    'Moji klienti pod filtrem chaty neukazují architekta z pozdní odpovědi', `${n} řádků, z toho ${architektu} architektů`);
  over('L2c', n === 0 ? pill === '' : pill === String(n), 'počet v nadpisu sedí s řádky chat', `„${pill}" / ${n}`);
  await ctx.close();
}

/* ============ L3) Označené: prázdná skupina není „všechno je vyřešené" ============ */
{
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/oznacene', 500);
  const radek302 = page.locator('table tbody tr', { hasText: 'Jana Vzorová' });
  const ma302 = (await radek302.count()) === 1;
  over('L3a', ma302 && (await page.locator('table tbody tr').count()) >= 2, 'Albert má označeného architekta i chatu (jinak scénář nic neměří)');
  if (ma302) {
    await radek302.click();
    await page.getByRole('button', { name: 'Vyřešeno' }).click();
    await klid(page, 300);
  }
  await filtr(page, 'architekti').click();
  await page.waitForTimeout(150);
  const h2 = await page.locator('.empty-state h2').innerText().catch(() => '');
  const text = await page.locator('.empty-state').innerText().catch(() => '');
  over('L3b', h2 !== '' && h2 !== 'Všechno je vyřešené', 'pod filtrem architekti se neříká „Všechno je vyřešené", když jsou označené chaty', h2);
  over('L3c', /architekt/i.test(text), 'prázdný stav říká, že jde o architekty', text.replace(/\s+/g, ' '));
  await filtr(page, 'chaty').click();
  await page.waitForTimeout(150);
  over('L3d', (await page.locator('table tbody tr').count()) >= 1, 'pod filtrem chaty jsou označené chaty vidět');
  await ctx.close();
}

/* ============ L4) Označené: pozdní odpověď pro jiného člověka nepřepíše výběr ============ */
{
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/oznacene', 500);
  await page.evaluate(() => {
    globalThis.__volackaDemoTest.zpozdeni = (fn, args) => (fn === 'listFlagged' && args[1] === 2 ? 1500 : 0);
  });
  await page.selectOption('#person-picker', String(UID.petra));
  await page.waitForTimeout(120);
  await page.selectOption('#person-picker', String(UID.honza));
  await klid(page, 500);
  const pozdni = (await volani(page)).find((v) => v.fn === 'listFlagged' && v.args[1] === UID.petra);
  over('L4a', !!pozdni && pozdni.ok, 'pomalá odpověď pro Petru dorazila (jinak scénář nic neměří)');
  over('L4b', (await page.locator('#person-picker').inputValue()) === String(UID.honza) &&
    (await page.locator('table tbody tr', { hasText: 'Jana Vzorová' }).count()) === 0,
    'pod Honzou nejsou Petřini označení z pozdní odpovědi');
  await ctx.close();
}

/* ============ D1) detail: osobní IČO cizího architekta zůstane skryté i po uložení příznaku ============ */
{
  const { ctx, page } = await novaStranka('mikulas');
  await jdi(page, '#/admin', 600);
  await filtr(page, 'architekti').click();
  await klid(page, 400);
  await page.locator('table.kontakty tbody tr', { hasText: 'Jana Vzorová' }).click();
  const detail = page.locator('.drawer');
  const ico = () => detail.locator('.arch-udaje').innerText();
  over('D1a', /IČO osobně:\s*skryto/.test(await ico()), 'cizí architekt: osobní IČO je v detailu skryté', (await ico()).replace(/\s+/g, ' '));
  await detail.getByRole('button', { name: 'Upravit' }).click();
  await detail.getByRole('button', { name: 'Uložit příznak' }).click();
  await klid(page, 300);
  over('D1b', /IČO osobně:\s*skryto/.test(await ico()) && !(await ico()).includes('11111111'), 'po uložení příznaku zůstane osobní IČO skryté (set_flag vrací řádek celý)',
    (await ico()).replace(/\s+/g, ' '));
  await detail.getByRole('button', { name: 'Vyřešeno' }).click();
  await klid(page, 300);
  over('D1c', /IČO osobně:\s*skryto/.test(await ico()) && !(await ico()).includes('11111111'), 'po vyřešení příznaku zůstane osobní IČO skryté (clear_flag)',
    (await ico()).replace(/\s+/g, ' '));
  const radek = page.locator('table.kontakty tbody tr', { hasText: 'Jana Vzorová' });
  await detail.getByRole('button', { name: 'Zavřít' }).click();
  await radek.click();
  over('D1d', /IČO osobně:\s*skryto/.test(await ico()), 'znovu otevřený detail (řádek ze seznamu po uložení) má IČO pořád skryté', (await ico()).replace(/\s+/g, ' '));
  await ctx.close();
}

/* ============ D2) detail: kdo smí upravit, osobní IČO vidí ============ */
{
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/admin', 600);
  await filtr(page, 'architekti').click();
  await klid(page, 400);
  await page.locator('table.kontakty tbody tr', { hasText: 'Jana Vzorová' }).click();
  const ico = () => page.locator('.drawer .arch-udaje').innerText();
  over('D2a', (await ico()).includes('11111111'), 'Albert osobní IČO v detailu vidí');
  await page.locator('.drawer').getByRole('button', { name: 'Upravit' }).click();
  await page.locator('.drawer').getByRole('button', { name: 'Uložit příznak' }).click();
  await klid(page, 300);
  over('D2b', (await ico()).includes('11111111'), 'Albertovi osobní IČO po uložení příznaku nezmizí');
  await ctx.close();
}

/* ============ D3) vzkaz agentovi u architekta bez jména: předmět nese studio ============ */
{
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/admin', 600);
  await filtr(page, 'architekti').click();
  await klid(page, 400);
  await page.locator('table.kontakty tbody tr', { hasText: 'Studio Příklad' }).click();
  await klid(page, 300);
  const pred = (await volani(page)).length;
  await page.locator('.drawer .composer-row textarea').fill('zkouška předmětu vlákna');
  await page.locator('.drawer .send-btn').click();
  await klid(page, 300);
  const nove = (await volani(page)).slice(pred).find((v) => v.fn === 'createThread');
  over('D3a', !!nove, 'vzkaz založil nové vlákno (jinak scénář nic neměří)', JSON.stringify(nazvyVolani((await volani(page)).slice(pred))));
  over('D3b', !!nove && nove.args[0] === 'Vzkaz od Albert: Studio Příklad', 'předmět vlákna u architekta bez jména nese studio, ne #id', nove && nove.args[0]);
  await ctx.close();
}

await browser.close();
server.close();
rmSync(OUT, { recursive: true, force: true });

over('Z1', supabase.length === 0, 'žádný požadavek na Supabase (jen DEMO)', supabase.slice(0, 3).join(' '));
over('Z2', chybyStranky.length === 0, 'stránka nehodila žádnou chybu', chybyStranky.slice(0, 3).join(' | '));

if (chyby === 0) {
  console.log(`ALL OK (${pocet} kontrol)`);
  process.exit(0);
}
console.log(`CHYB: ${chyby} z ${pocet}`);
process.exit(1);
