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

  // ⚠ Box s tipy pro hovor (9.4) je pryč (Albert 19. 10. 2026; NAHRAZUJE V4n až V4q „tip jmenuje tlačítko
  // Odmítnuto a stojí pod tlačítky výsledku“): na kartě architekta žádný není, tlačítka výsledku dál bez posouvání.
  await page.evaluate(() => window.scrollTo(0, 0));
  const tlacitka = (await page.locator('.outcome-row button').allInnerTexts()).map((t) => t.trim());
  over('V4n', tlacitka.includes('Odmítnuto') && tlacitka.includes('Nedovoláno'), 'karta architekta má tlačítka výsledku Nedovoláno a Odmítnuto', tlacitka.join('|'));
  over('V4o', (await page.locator('.call-hint, details').count()) === 0 && !/Tip pro hovor/i.test(await page.evaluate(() => document.body.innerText)),
    've volání u architekta není box s tipy pro hovor');
  const tlacitkaBox = await page.locator('.outcome-row').boundingBox();
  over('V4p', !!tlacitkaBox && tlacitkaBox.y + tlacitkaBox.height <= 900, 'tlačítka výsledku jsou na 1280×900 vidět bez posouvání', tlacitkaBox && `spodek ${Math.round(tlacitkaBox.y + tlacitkaBox.height)} px`);

  // po výsledku hovoru jde další kontakt ze zvoleného segmentu
  await page.getByRole('button', { name: 'Nedovoláno' }).click();
  await klid(page, 400);
  const w = await kartaId(page);
  over('V4r', w === null || (await segmentKontaktu(page, w)) === 'architekt', 'po výsledku hovoru přijde zase architekt', `karta ${w}`);
  await ctx.close();
}

/* ============ V5) mobil: karta architekta bez boxu s tipy, žádné vodorovné posouvání ============ */
// ⚠ NAHRAZUJE „tlačítka výsledku před tipem“ (box s tipy je od 19. 10. 2026 pryč, Albert).
{
  const { ctx, page } = await novaStranka('petra', { sirka: 375, vyska: 812 });
  await page.evaluate(() => localStorage.setItem('volacka_segment', 'architekt'));
  await jdi(page, '#/call');
  const tlacitkaBox = await page.locator('.outcome-row').boundingBox();
  over('V5a', !!tlacitkaBox && (await page.locator('.call-hint, details').count()) === 0, 'na mobilu má karta architekta tlačítka výsledku a žádný box s tipy');
  const sirka = await page.evaluate(() => document.scrollingElement.scrollWidth);
  over('V5b', sirka <= 375, 'karta architekta na mobilu nemá vodorovné posouvání', `${sirka} px`);
  await ctx.close();
}

/** tel: odkaz v headless prohlížeči nikam nevede: navigaci zastaví posluchač, klik Reactu projde. */
const bezVytaceni = (page) =>
  page.evaluate(() =>
    document.addEventListener('click', (e) => {
      if (e.target instanceof Element && e.target.closest('a[href^="tel:"]')) e.preventDefault();
    }, true));

/* ============ V6) vytočená karta: přepnutí ji tiše nevrátí, nabídne Nedovoláno (audit APP-3) ============ */
{
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/call');
  await bezVytaceni(page);
  const x = await kartaId(page);
  await page.locator('.call-card a.phone-link').first().click();
  const pred = (await volani(page)).length;
  const stavPred = await stav(page);
  await prepinac(page, 'architekt').click();
  await klid(page, 400);
  const po = (await volani(page)).slice(pred);
  over('V6a', po.length === 0 && (await kartaId(page)) === x, 'po kliknutí na číslo přepnutí kartu tiše nevrátí (zůstává, server se nevolá)', JSON.stringify(nazvyVolani(po)));
  over('V6b', /Po tomhle hovoru dostaneš architekta\./.test(await page.locator('.info-box').first().innerText({ timeout: 2000 }).catch(() => '')), 'žlutá cedulka jako u rozdělané karty');
  const hned = page.getByRole('button', { name: 'Přepnout hned' });
  if (await hned.count()) await hned.click();
  const modal = (await page.locator('.modal').innerText().catch(() => '')).replace(/\s+/g, ' ');
  over('V6c', /vytočil/.test(modal) && /Zapiš Nedovoláno/.test(modal), 'potvrzení u vytočené karty radí zapsat Nedovoláno', modal.slice(0, 200));
  const zapsat = page.getByRole('button', { name: 'Zapsat Nedovoláno' });
  if (await zapsat.count()) {
    await zapsat.click();
    await klid(page, 400);
  }
  const vs = (await volani(page)).slice(pred);
  const stavPo = await stav(page);
  const y = await kartaId(page);
  over('V6d', vs.some((v) => v.fn === 'resolveCall' && v.args[0]?.kontakt_id === x && v.args[0]?.outcome === 'nedovolano' && v.ok) && !vs.some((v) => v.fn === 'returnContact'),
    '„Zapsat Nedovoláno“ zapíše hovor a kartu bez zápisu nevrací', JSON.stringify(nazvyVolani(vs)));
  over('V6e', stavPo.callLog.length === stavPred.callLog.length + 1, 'hovor je v call_log');
  over('V6f', y !== null && y !== x && (await segmentKontaktu(page, y)) === 'architekt', 'další kontakt je z nového segmentu', `karta ${y}`);
  // druhá cesta: vědomé „Přepnout bez zápisu“
  if (y !== null && y !== x) {
    await page.locator('.call-card a.phone-link').first().click();
    await prepinac(page, 'chata').click();
    await klid(page, 300);
    if (await hned.count()) await hned.click();
    const pred2 = (await volani(page)).length;
    const bez = page.getByRole('button', { name: 'Přepnout bez zápisu' });
    if (await bez.count()) await bez.click();
    await klid(page, 400);
    const vs2 = (await volani(page)).slice(pred2);
    const z = await kartaId(page);
    over('V6g', vs2.some((v) => v.fn === 'returnContact' && v.args[0] === y && v.ok) && (await segmentKontaktu(page, z)) === 'chata',
      '„Přepnout bez zápisu“ kartu vrátí a vezme chatu', JSON.stringify(nazvyVolani(vs2)));
  }
  await ctx.close();
}

/* ============ V7) návrat na stránku Volání dá tutéž kartu, nezamkne další (audit APP-4, migrace 036) ============ */
{
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/call');
  const x = await kartaId(page);
  await jdi(page, '#/stats');
  await jdi(page, '#/call');
  const y = await kartaId(page);
  over('V7a', x !== null && y === x, 'po odchodu a návratu je na obrazovce stejná karta', `${x} → ${y}`);
  over('V7b', JSON.stringify(await zamkyUzivatele(page, UID.petra)) === JSON.stringify([x]), 'zamčená zůstala jen ta jedna karta',
    JSON.stringify(await zamkyUzivatele(page, UID.petra)));
  await ctx.close();
}

/* ============ V8) zdroj telefonu ve volání není (Albert 19. 10. 2026, migrace 043) ============ */
// ⚠ NAHRAZUJE „scénář architekta: Vaše číslo mám z … ve 2. osobě podle karty (audit APP-7)“: karta neříká,
// odkud máme číslo, pro Volajícího ani pro super admina; box s tipy pro hovor ve volání od 19. 10. 2026 není vůbec.
for (const kdo of ['petra', 'mikulas']) {
  const { ctx, page } = await novaStranka(kdo);
  await page.evaluate(() => localStorage.setItem('volacka_segment', 'architekt'));
  await jdi(page, '#/call');
  let videno = 0;
  for (let i = 0; i < 2; i++) {
    if ((await kartaId(page)) === null) break;
    const text = await page.evaluate(() => document.body.innerText);
    over('V8a', !/číslo máme z|číslo mám z/i.test(text), `${kdo}: karta ve volání neukazuje, odkud máme číslo`, text.match(/.{0,40}číslo m[áa]m[e]? z.{0,40}/i)?.[0] ?? '');
    over('V8b', (await page.locator('.call-hint, details').count()) === 0 && !/Tip pro hovor|Dobrý den, tady <tvoje jméno>/.test(text),
      `${kdo}: ve volání u architekta není box s tipy pro hovor ani jeho scénář`);
    videno += 1;
    await page.getByRole('button', { name: 'Nedovoláno' }).click();
    await klid(page, 300);
  }
  over('V8c', videno >= 1, `${kdo}: aspoň jedna karta architekta změřena`, `${videno}`);
  await ctx.close();
}

/* ============ V9) karta architekta: obrat místo IČO (Albert 3. 10. 2026, APP-8, migrace 037) ============ */
// Volající nevidí IČO architekta (osobní ani ateliéru) ani poznámku o DPH studia; karta ukáže řádek
// „obrat“ podle DPH (plátce osobně nebo ateliér = nad 2 mil., známý neplátce = do 2 mil., jinak
// nezjištěno). Karta je stejná pro každého, kdo volá (i Albert), IČO admini vidí v detailu kontaktu.
{
  const NAD = 'nad 2 mil. Kč ročně (plátce DPH)';
  const DO = 'do 2 mil. Kč ročně (neplátce DPH)';
  const ocekavany = (k) =>
    k.dph_osobni === 'platce' || k.dph_firma === 'platce' ? NAD
      : ['neplatce', 'identifikovana_osoba'].includes(k.dph_osobni) || ['neplatce', 'identifikovana_osoba'].includes(k.dph_firma) ? DO
        : 'nezjištěno';
  for (const kdo of ['petra', 'admin']) {
    const { ctx, page } = await novaStranka(kdo);
    await page.evaluate(() => localStorage.setItem('volacka_segment', 'architekt'));
    await jdi(page, '#/call');
    const vysledky = new Set();
    for (let i = 0; i < 3; i++) {
      const id = await kartaId(page);
      if (id === null) break;
      const karta = await page.locator('.call-card').innerText();
      const k = (await stav(page)).kontakty.find((x) => x.id === id);
      over('V9a', !/IČO/i.test(karta) && !/\b\d{8}\b/.test(karta) && !/DPH studia/i.test(karta),
        `${kdo}: karta architekta neukazuje IČO ani poznámku o DPH studia`, karta.replace(/\s+/g, ' ').slice(0, 200));
      const radky = page.locator('.call-row', { hasText: /^\s*obrat/i });
      const hodnota = (await radky.count()) === 1 ? (await radky.first().locator('span:not(.k)').first().innerText()).trim() : '(řádek obrat chybí)';
      over('V9b', !!k && hodnota === ocekavany(k), `${kdo}: řádek obrat odpovídá DPH osobně a ateliéru`, `karta ${id}: „${hodnota}“, čekám „${k && ocekavany(k)}“`);
      vysledky.add(hodnota);
      await page.getByRole('button', { name: 'Nedovoláno' }).click();
      await klid(page, 300);
    }
    if (kdo === 'petra') over('V9c', vysledky.size >= 3, 'změřeny všechny tři podoby řádku (nad, do, nezjištěno)', [...vysledky].join(' | '));
    await ctx.close();
  }
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

/* ============ D2) Kontakty a detail: Volající IČO vidí a hledá jako admin (Albert 18. 10. 2026, migrace 042) ============ */
// ⚠ NAHRAZENO migrací 042 (Albert 18. 10. 2026: „Volající“ mají práva dnešních adminů, IČO vidí jako
// admini): dřív „volající (role caller) IČO nevidí ani nehledá, detail ukazuje jen obrat“ (038).
// Petra je Volající: hledání nabízí IČO, IČO studia najde, u cizího architekta (300) vidí IČO studia
// a osobní IČO má skryté (smí ho upravit jen kdo mu volá, 028).
{
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/admin', 600);
  const hledani = page.locator('input.search-input');
  over('D2a', /IČO/.test((await hledani.getAttribute('placeholder')) ?? ''), 'Volající: pole hledání nabízí hledání podle IČO (042)', await hledani.getAttribute('placeholder'));
  await hledani.fill('22222222');
  await klid(page, 700);
  over('D2b', (await page.locator('table.kontakty tbody tr', { hasText: /Ukázka|Příklad/ }).count()) > 0, 'Volající: hledání IČO studia architekta najde (042)');
  await hledani.fill('');
  await klid(page, 700);
  await filtr(page, 'architekti').click();
  await klid(page, 400);
  await page.locator('table.kontakty tbody tr', { hasText: 'Tomáš Ukázka' }).click();
  const udaje = (await page.locator('.drawer .arch-udaje').innerText()).replace(/\s+/g, ' ');
  over('D2c', /IČO studia:\s*22222222/.test(udaje) && /IČO osobně:\s*skryto/.test(udaje), 'Volající: u cizího architekta IČO studia vidí, osobní IČO skryté (042, 028)', udaje);
  over('D2d', !/číslo máme z|číslo mám z/i.test(await page.locator('.drawer').innerText()), 'Volající: detail architekta neukazuje, odkud máme číslo (043)', udaje);
  await ctx.close();
}
{
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/admin', 600);
  over('D2e', /IČO/.test((await page.locator('input.search-input').getAttribute('placeholder')) ?? ''), 'Albert: hledání podle IČO zůstává');
  await filtr(page, 'architekti').click();
  await klid(page, 400);
  await page.locator('table.kontakty tbody tr', { hasText: 'Tomáš Ukázka' }).click();
  const udaje = (await page.locator('.drawer .arch-udaje').innerText()).replace(/\s+/g, ' ');
  over('D2f', /IČO osobně:\s*11111111/.test(udaje) && /IČO studia:\s*22222222/.test(udaje), 'Albert: detail architekta ukazuje obě IČO jako dřív', udaje);
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
  // e-mailový příznak v detailu: e-mail zapsaný tady ho sám neruší (update_kontakt), takže
  // nápověda nesmí slibovat „zmizí sám" a posílá na Vyřešeno (revize migrace 029, kontakt 978)
  const napoveda = (await detail.locator('.flag-hint').innerText()).replace(/\s+/g, ' ');
  over('D1e', /Vyřešeno/.test(napoveda) && !/zmizí sám/.test(napoveda), 'detail (admin): nápověda k chybějícímu e-mailu posílá na Vyřešeno a neslibuje zmizení', napoveda);
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

/* ============ D4) detail u vlastního klienta Volajícího: nápověda bez slibu, tlačítko Vyřešeno má ============ */
// ⚠ NAHRAZENO migrací 042 (Albert 18. 10. 2026): dřív „detail jen ke čtení (volající, role caller):
// nápověda posílá za adminem a tlačítko Vyřešeno chybí“. Role caller není, Petra je Volající (admin)
// a Jana Vzorová (302) je její klientka: příznak smí vyřešit sama, nápověda jí neslibuje zmizení.
{
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/admin', 600);
  await filtr(page, 'architekti').click();
  await klid(page, 400);
  await page.locator('table.kontakty tbody tr', { hasText: 'Jana Vzorová' }).click();
  const detail = page.locator('.drawer');
  const napoveda = (await detail.locator('.flag-hint').innerText()).replace(/\s+/g, ' ');
  over('D4a', /Chybí e-mail/.test(await detail.locator('.flag-panel-head').innerText()), 'Volající vidí v detailu příznak Chybí e-mail (jinak scénář nic neměří)');
  over('D4b', !/zmizí sám/.test(napoveda) && /Vyřešeno/.test(napoveda) && !/adminovi/.test(napoveda),
    'Volající u svého klienta: nápověda neslibuje zmizení a říká, ať klikne na Vyřešeno', napoveda);
  over('D4c', (await detail.getByRole('button', { name: 'Vyřešeno' }).count()) > 0, 'Volající má u svého klienta tlačítko Vyřešeno');
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

/* ============ R) Rozvrh (migrace 042, Albert 18. 10. 2026): Volající nastaví jednou, super admin mění a odemyká ============ */
{
  const { ctx, page } = await novaStranka('honza');
  await jdi(page, '#/rozvrh', 600);
  const alert = () => page.locator('.rozvrh-alert').first().innerText();
  over('R1', /Ještě nemáš rozvrh/.test(await alert()), 'Honza bez rozvrhu vidí výzvu k nastavení', await alert());
  await page.getByRole('button', { name: 'Nastavit rozvrh' }).click();
  await page.selectOption('#rh-0', '4');
  await page.selectOption('#rh-6', '1');
  over('R2', /Za týden 50 hovorů/.test(await page.locator('.rozvrh-uprava').innerText()), 'úprava počítá cíl za týden (4 h + 1 h = 50 hovorů)');
  await page.getByRole('button', { name: 'Uložit rozvrh' }).click();
  over('R3', (await page.getByRole('button', { name: 'Uložit a zamknout' }).count()) === 1, 'Volající musí uložení potvrdit (pak už rozvrh nezmění)');
  await page.getByRole('button', { name: 'Uložit a zamknout' }).click();
  await klid(page, 400);
  over('R4', /uložený a zamčený/.test(await page.locator('.info-box').innerText())
    && (await page.getByRole('button', { name: 'Upravit rozvrh' }).count()) === 0, 'po uložení je rozvrh zamčený, Upravit rozvrh chybí');
  over('R5', /zamčený, změnit ho může jen super admin/.test(await page.locator('.rozvrh-kdo-nastavil').innerText()), 'Volající ví, kdo rozvrh mění');
  // poznámka ke dnešku
  const dnes = page.locator('.rozvrh-den.dnes');
  await dnes.getByRole('button', { name: 'Napsat poznámku' }).click();
  await dnes.locator('textarea').fill('Nemohl jsem volat, byl jsem u doktora.');
  await dnes.getByRole('button', { name: 'Uložit poznámku' }).click();
  await klid(page, 300);
  over('R6', /u doktora/.test(await dnes.locator('.rozvrh-poznamka').innerText()), 'poznámka ke dnešku se uloží a ukáže');
  await ctx.close();
}
{
  const { ctx, page } = await novaStranka('mikulas');
  await jdi(page, '#/rozvrh', 700);
  const radky = await page.locator('.rozvrh-clovek').allInnerTexts();
  over('R7', radky.some((r) => /^Petra/.test(r)) && radky.some((r) => /^Honza\s*bez rozvrhu/.test(r)), 'super admin vidí přehled Volajících', radky.join(' | '));
  await page.locator('.rozvrh-clovek', { hasText: 'Petra' }).click();
  await klid(page, 400);
  over('R8', (await page.locator('.rozvrh-kdo').innerText()) === 'Petra' && (await page.locator('.rozvrh-pozn-btn').count()) === 0,
    'super admin otevře cizí rozvrh, poznámky jen čte');
  await page.getByRole('button', { name: 'Upravit rozvrh' }).click();
  await page.selectOption('#rh-0', '2');
  await page.getByRole('button', { name: 'Uložit rozvrh' }).click();
  await klid(page, 400);
  over('R9', (await page.getByRole('button', { name: 'Uložit a zamknout' }).count()) === 0
    && /naposledy změnil\(a\) Mikuláš/.test(await page.locator('.rozvrh-kdo-nastavil').innerText()), 'super admin uloží bez potvrzení zámku, změna má jeho jméno');
  await page.getByRole('button', { name: 'Povolit volajícímu nastavit ho znovu' }).click();
  await klid(page, 400);
  over('R10', /může rozvrh ještě jednou nastavit/.test(await page.locator('.info-box').innerText()), 'super admin rozvrh odemkne');
  await ctx.close();
}
{
  const { ctx, page } = await novaStranka('honza', { sirka: 390, vyska: 844 });
  await jdi(page, '#/rozvrh', 600);
  const sirka = await page.evaluate(() => document.documentElement.scrollWidth);
  over('R11', sirka <= 390, 'Rozvrh se na telefonu (390 px) vejde bez vodorovného posunu', `scrollWidth ${sirka}`);
  await ctx.close();
}

/* ============ S) čísla jiných lidí vidí jen super admin (Albert 19. a 20. 10. 2026, migrace 045) ============ */
// Volající (Petra): Statistiky jen svoje karty, bez výběru člověka, bez trychtýře celé databáze (součty jsou
// i prodeje kolegů) a bez dlaždice „jako #1 prodejce“; hledání jména kolegy v Kontaktech nic nenajde ani nespočítá
// (hlavičky poznámek „[datum Honza]“); Kontakty bez počtů u stavů a bez celkového počtu; v detailu kontaktu jméno
// kolegy v poznámce „jiný volající“; Prokchop se na top_prodejce neptá. Super admin (Mikuláš): všechno jako dřív.
for (const [kdo, superAdmin] of [['petra', false], ['mikulas', true]]) {
  const { ctx, page } = await novaStranka(kdo);
  await jdi(page, '#/stats', 700);
  const text = await page.evaluate(() => document.body.innerText);
  const karty = await page.locator('.stat-card').count();
  const trychtyr = /klienti podle stavu/i.test(text);
  const vyber = (await page.locator('#user-select').count()) > 0;
  over('S1', karty >= 6 && /hovorů/i.test(text) && trychtyr === superAdmin && vyber === superAdmin,
    `${kdo}: Statistiky ${superAdmin ? 'mají' : 'nemají'} výběr člověka a trychtýř celé databáze`, `karet ${karty}, trychtýř ${trychtyr}, výběr ${vyber}`);
  over('S1b', /jako #1 prodejce/i.test(text) === superAdmin, `${kdo}: dlaždice „jako #1 prodejce“ ${superAdmin ? 'je' : 'není'}`);
  const pred = (await volani(page)).length;
  await jdi(page, '#/admin', 600);
  await page.locator('input.search-input').fill('Honza');
  await klid(page, 800);
  const radky = await page.locator('table.kontakty tbody tr').count();
  const vs = (await volani(page)).slice(pred).filter((v) => v.fn === 'listKontakty');
  over('S2', vs.some((v) => v.ok && JSON.stringify(v.args).includes('Honza')) && (superAdmin ? radky >= 3 : radky === 0 && /Nic nenalezeno/.test(await page.evaluate(() => document.body.innerText))),
    `${kdo}: hledání „Honza“ (jméno kolegy v poznámkách) ${superAdmin ? 'najde jeho kontakty' : 'nic nenajde'}`, `${radky} řádků`);
  // počty u stavů a celkový počet (součty celé databáze) jen super admin
  await page.locator('input.search-input').fill('');
  await klid(page, 800);
  const moznosti = await page.locator('select[aria-label="Filtr statusu"] option').allInnerTexts();
  const sPocty = moznosti.filter((o) => /\(\d+\)/.test(o)).length;
  const pilulka = await page.locator('h1.page-title .count-pill').count();
  const dotazyPocty = (await volani(page)).slice(pred).filter((v) => v.fn === 'listKontakty' && JSON.stringify(v.args).includes('"limit":1')).length;
  over('S3', superAdmin ? sPocty >= 3 && pilulka === 1 && dotazyPocty >= 10 : sPocty === 0 && pilulka === 0 && dotazyPocty === 0,
    `${kdo}: Kontakty ${superAdmin ? 'mají' : 'nemají'} počty u stavů a celkový počet`, `stavů s počtem ${sPocty}, pilulka ${pilulka}, dotazů na počty ${dotazyPocty}`);
  // detail kontaktu 2 (poznámka „[2026-08-29 Honza] Zase nebrali.“): jméno kolegy jen pro super admina
  await page.locator('input.search-input').fill('Zase nebrali');
  await klid(page, 800);
  await page.locator('table.kontakty tbody tr').first().click();
  await klid(page, 500);
  const detail = await page.locator('.drawer-note-ro, .drawer textarea, textarea').allInnerTexts().catch(() => []);
  const hodnoty = await page.locator('textarea').evaluateAll((els) => els.map((e) => e.value)).catch(() => []);
  const poznamka = [...detail, ...hodnoty, await page.evaluate(() => document.body.innerText)].join('\n');
  over('S4', superAdmin ? /\[2026-08-29 Honza\] Zase nebrali/.test(poznamka) : /\[2026-08-29 jiný volající\] Zase nebrali/.test(poznamka) && !/\[2026-08-29 Honza\]/.test(poznamka),
    `${kdo}: v detailu kontaktu ${superAdmin ? 'je' : 'není'} jméno kolegy v poznámce`, poznamka.match(/\[2026-08-29 [^\]]*\]/)?.[0] ?? 'poznámka nenalezena');
  // řádky kolegů jsou Volajícímu jen ke čtení (recenze 045, 20. 10. 2026): u poznámky vidí nápovědu, a když řádek
  // kolegy upraví, uložení se odmítne a detail chybu ukáže; data zůstanou; super admin nápovědu nemá
  const napoveda = await page.locator('.radky-kolegu').count();
  if (superAdmin) over('S6', napoveda === 0, 'mikulas: u poznámky není nápověda o řádcích kolegů (jména vidí)', `${napoveda}`);
  else {
    const pole = page.locator('textarea[rows="7"]').first();
    const puvodni = await pole.inputValue();
    const predUlozenim = (await volani(page)).length;
    await pole.fill(puvodni.replace('Zase nebrali.', 'Zase nebrali!'));
    await page.getByRole('button', { name: 'Uložit změny' }).click();
    await klid(page, 600);
    const ulozeni = (await volani(page)).slice(predUlozenim).filter((v) => v.fn === 'updateKontakt');
    const chyba = await page.locator('.error-box').allInnerTexts();
    over('S6', napoveda === 1 && ulozeni.length === 1 && ulozeni[0].ok === false
      && chyba.some((c) => /^Řádek kolegy upravit ani smazat nejde, připište nový řádek\./.test(c)),
      'petra: nápověda u poznámky, upravený řádek kolegy server odmítne a detail chybu ukáže', `${napoveda} / ${chyba.join(' | ').slice(0, 120)}`);
    // recenze 046 (20. 10. 2026): obyčejný řádek pod zápisem kolegy se uloží s vlastní hlavičkou a detail ji po uložení
    // hned ukáže (server vrátí uloženou poznámku); ⚠ NAHRAZUJE odmítnutí „Řádek hned za záznamem kolegy začněte hlavičkou …“
    const dnes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const predPripsanim = (await volani(page)).length;
    await pole.fill(`${puvodni}\nzavolám zítra`);
    await page.getByRole('button', { name: 'Uložit změny' }).click();
    await klid(page, 700);
    const pripsani = (await volani(page)).slice(predPripsanim).filter((v) => v.fn === 'updateKontakt');
    const poUlozeni = await pole.inputValue();
    over('S6b', pripsani.length === 1 && pripsani[0].ok === true && poUlozeni === `${puvodni}\n[${dnes} Petra] zavolám zítra`
      && (await page.locator('.radky-kolegu').innerText()).includes('dostane při uložení vaši hlavičku'),
      'petra: obyčejný řádek pod zápisem kolegy se uloží s její hlavičkou a pole ji po uložení hned ukáže', JSON.stringify(poUlozeni.slice(-60)));
  }
  // Prokchop: top_prodejce (žebříček) jen za super admina
  const top = (await volani(page)).filter((v) => v.fn === 'topSeller').length;
  if (!superAdmin) over('S5', top === 0, 'petra: Prokchop se Volajícího na „#1 prodejce“ (top_prodejce) neptá', `${top} volání`);
  await ctx.close();
}

/* ============ U) Volající vidí stav jen u svých klientů (Albert 20. 10. 2026, migrace 045) ============ */
// Albert: „they should only be able to see the status or how the website is going for the people they actually called“.
// Petra (Volající): v Kontaktech u cizího kontaktu (3 je jen Honzův) pomlčka místo stavu, známky, kdo volal a data změny,
// nápověda nad tabulkou; detail cizího kontaktu jen jméno a kontakt (bez stavu, poznámek, příznaku, zámku a vzkazů);
// filtr stavu vrátí jen její klienty; karta ve volání u kontaktu, kterému nevolala, bez řádku status. Na 1280 i 390 px.
// Mikuláš (super admin): všechno jako dřív. ⚠ NAHRAZUJE „Kontakty se stavy vidí každý“ (023).
for (const [kdo, superAdmin, sirka] of [['petra', false, 1280], ['petra', false, 390], ['mikulas', true, 1280]]) {
  const { ctx, page } = await novaStranka(kdo, { sirka, vyska: sirka < 768 ? 844 : 900 });
  const st = await stav(page);
  const moje = new Set([...st.callLog.filter((l) => l.user_id === UID[kdo]).map((l) => l.kontakt_id),
    ...st.kontakty.filter((k) => k.last_caller === 'Petra' && kdo === 'petra').map((k) => k.id)]);
  await jdi(page, '#/admin', 700);
  const napoveda = await page.locator('.skryto-napoveda').count();
  over(`U1 ${kdo} ${sirka}`, napoveda === (superAdmin ? 0 : 1), `${kdo}: nápověda „stav jen u svých“ nad Kontakty ${superAdmin ? 'není' : 'je'}`, `${napoveda}`);
  await page.locator('input.search-input').fill('Vysočina');
  await klid(page, 800);
  const radek = page.locator('table.kontakty tbody tr').first();
  const pomlcky = await radek.locator('.skryto').count();
  const odznak = await radek.locator('.badge').allInnerTexts();
  // ⚠ migrace 057 (Albert 28. 10. 2026): přibyl sloupec posledního hovoru, u cizího kontaktu taky pomlčka (5, NAHRAZUJE 4)
  over(`U2 ${kdo} ${sirka}`, superAdmin ? pomlcky === 0 && odznak.some((o) => /Mají zájem/.test(o)) : pomlcky === 5 && !odznak.some((o) => /Mají zájem/.test(o)),
    `${kdo}: u cizího kontaktu 3 ${superAdmin ? 'stav vidí' : 'stav, známku, kdo volal, datum změny a poslední hovor nevidí'}`, `pomlček ${pomlcky}, odznaky ${odznak.join(',')}`);
  await radek.click();
  await klid(page, 500);
  const drawer = await page.locator('.drawer').innerText();
  const zaklad = await page.locator('.drawer-skryto').count();
  over(`U3 ${kdo} ${sirka}`, superAdmin
    ? zaklad === 0 && /status/i.test(drawer) && /Honza/.test(drawer)
    : zaklad === 1 && /jen u svých klientů/.test(drawer) && /\+420 604 777 888/.test(drawer)
      && !/status|Mají zájem|Vzkazy agentovi|Označit klienta|4900|Honza|jiný volající|naposledy volal|změněno|známka/i.test(drawer),
    `${kdo}: detail cizího kontaktu ${superAdmin ? 'celý' : 'jen jméno a kontakt'}`, drawer.replace(/\s+/g, ' ').slice(0, 160));
  // recenze appky 20. 10. 2026: detail cizího kontaktu (větev jenZaklad, třída „drawer drawer-skryto“) nemá odznak stavu
  // (StatusBadge, třída status-badge), příznak ani tlačítko příznaku, text poznámky ani známku; u super admina řádek
  // tabulky odznak stavu s tou třídou má (jinak by kontrola u Volajícího nic neměřila)
  if (!superAdmin) {
    const skryty = page.locator('.drawer.drawer-skryto');
    const textSkryty = (await skryty.innerText().catch(() => '')).replace(/\s+/g, ' ');
    const stavy = await skryty.locator('.status-badge').count();
    const priznaky = await skryty.locator('.flag-panel, .flag-add-btn, .flag-note').count();
    const znamky = await skryty.locator('.badge.rating').count();
    const poznamky = await skryty.locator('textarea, .drawer-note-ro').count();
    over(`U3b ${kdo} ${sirka}`, (await skryty.count()) === 1 && stavy === 0 && priznaky === 0 && znamky === 0 && poznamky === 0
      && !/jednoduchý web s fotkami|kalendářem/.test(textSkryty),
      `${kdo}: detail cizího kontaktu (drawer-skryto) bez odznaku stavu, příznaku, textu poznámky a známky`,
      `drawer-skryto ${await skryty.count()}, stav ${stavy}, příznak ${priznaky}, známka ${znamky}, poznámka ${poznamky}`);
  } else {
    over(`U3b ${kdo} ${sirka}`, (await radek.locator('.status-badge').count()) === 1, `${kdo}: odznak stavu v řádku má třídu status-badge (selektor U3b měří)`);
  }
  await page.locator('.drawer-close').click();
  await klid(page, 300);
  if (sirka < 768) {
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    over(`U4 ${kdo} ${sirka}`, w <= sirka, `${kdo}: Kontakty se na telefonu vejdou bez vodorovného posunu`, `scrollWidth ${w}`);
  }
  // filtr stavu: Volajícímu jen jeho klienti
  await page.locator('input.search-input').fill('');
  await klid(page, 600);
  // stav, který má Petra u svého klienta i někdo jiný u cizího (data mocku se v testu mění, proto výběr za běhu)
  const st2 = await stav(page);
  const petriny = new Set([...st2.callLog.filter((l) => l.user_id === 2).map((l) => l.kontakt_id), ...st2.kontakty.filter((k) => k.last_caller === 'Petra').map((k) => k.id)]);
  const stavF = [...new Set(st2.kontakty.map((k) => k.status))].find((s) =>
    st2.kontakty.some((k) => k.status === s && petriny.has(k.id)) && st2.kontakty.some((k) => k.status === s && !petriny.has(k.id)));
  const predF = (await volani(page)).length;
  await page.selectOption('select[aria-label="Filtr statusu"]', stavF ?? 'zajem');
  await klid(page, 800);
  const filtrovane = (await volani(page)).slice(predF).filter((v) => v.fn === 'listKontakty' && v.ok);
  const sTimStavem = st2.kontakty.filter((k) => k.status === stavF).map((k) => k.id);
  const radky = await page.locator('table.kontakty tbody tr').count();
  const cekane = superAdmin ? Math.min(sTimStavem.length, 50) : sTimStavem.filter((id) => petriny.has(id)).length;
  over(`U5 ${kdo} ${sirka}`, !!stavF && filtrovane.length >= 1 && radky === cekane && cekane >= 1 && (superAdmin || cekane < sTimStavem.length),
    `${kdo}: filtr stavu vrátí ${superAdmin ? 'všechny' : 'jen svoje'} kontakty`, `${stavF}: ${radky} řádků, čekáno ${cekane} z ${sTimStavem.length}`);
  // karta ve volání
  await jdi(page, '#/call', 900);
  const id = await kartaId(page);
  if (!id) over(`U6 ${kdo} ${sirka}`, false, `${kdo}: ve volání není karta, nejde změřit`);
  else {
    const klice = (await page.locator('.call-card .call-row .k').allInnerTexts()).map((x) => x.trim().toLowerCase());
    const ciziKarta = !moje.has(id) && !superAdmin;
    over(`U6 ${kdo} ${sirka}`, klice.includes('telefon') && klice.includes('status') === !ciziKarta,
      `${kdo}: karta ve volání ${ciziKarta ? 'u kontaktu, kterému nevolal(a), bez stavu' : 'se stavem'}`, `#${id}: ${klice.join(',')}`);
  }
  await ctx.close();
}

/* ============ X) po auditu soukromí 20. 10. 2026 (migrace 048): e-mail cizí chaty ============ */
// Albert 20. 10. 2026: „… how many cottages we've sold as a whole company …“. Chata má e-mail skoro jen po zájmu v hovoru,
// proto Petra (Volající) u cizí chaty (3 je jen Honzova) e-mail v detailu nevidí a podle e-mailu ji nenajde; e-mail cizího
// architekta (300, veřejný import) vidí; Mikuláš (super admin) vidí a najde všechno.
for (const [kdo, superAdmin] of [['petra', false], ['mikulas', true]]) {
  const { ctx, page } = await novaStranka(kdo, { sirka: 1280, vyska: 900 });
  await jdi(page, '#/admin', 700);
  const hledej = async (q) => {
    await page.locator('input.search-input').fill(q);
    await klid(page, 800);
    return page.locator('table.kontakty tbody tr');
  };
  const detail = async (q) => {
    const r = await hledej(q);
    if ((await r.count()) === 0) return '';
    await r.first().click();
    await klid(page, 500);
    // super admin má e-mail v poli formuláře (innerText ho neukáže), Volající u cizího kontaktu v textu
    const pole = (await page.locator('.drawer input[type="email"]').count()) > 0 ? await page.locator('.drawer input[type="email"]').first().inputValue() : '';
    const text = ((await page.locator('.drawer').innerText()) + ' ' + pole).replace(/\s+/g, ' ');
    await page.locator('.drawer-close').click();
    await klid(page, 300);
    return text;
  };
  const d3 = await detail('Vysočina');
  over(`X1 ${kdo}`, superAdmin ? /dvorak@seznam\.cz/.test(d3) : d3.length > 0 && !/dvorak@seznam\.cz|e-mail:/.test(d3),
    `${kdo}: detail cizí chaty 3 ${superAdmin ? 's e-mailem' : 'bez e-mailu (ani řádek e-mail)'}`, d3.slice(0, 160));
  const d300 = await detail('Ukázka');
  over(`X2 ${kdo}`, /ukazka@example\.cz/.test(d300), `${kdo}: detail cizího architekta 300 s e-mailem (veřejný import)`, d300.slice(0, 160));
  const r = await hledej('@seznam.cz');
  const n = await r.count();
  const prazdne = n === 1 && /Žádné kontakty|nic|nenaš/i.test((await r.first().innerText()).replace(/\s+/g, ' '));
  over(`X3 ${kdo}`, superAdmin ? n >= 1 && !prazdne : n === 0 || prazdne, `${kdo}: hledání „@seznam.cz“ ${superAdmin ? 'najde cizí chatu' : 'cizí chatu podle e-mailu nenajde'}`, `${n} řádků`);
  await ctx.close();
}

/* ============ Volání 050 (Albert 21. 10. 2026): Moji klienti, nerelevantní, přeplánovat, kalendář, připomínky, výdělek ============ */
// Bloky C, N, P, K, H, T, E (od migrace 051 na konci i A: cena „n/a“). Každý blok běží ve vlastní stránce (vlastní mock v paměti) a nečekaná chyba (chybějící
// tlačítko na staré appce) je FAIL bloku, ne pád celé zkoušky. Čas a dny počítá v Praze jako server a appka.
const PRAHA_DEN_E2E = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' });
const PRAHA_CAS_E2E = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const denP = (x) => PRAHA_DEN_E2E.format(new Date(x));
const casP = (x) => PRAHA_CAS_E2E.format(new Date(x));
const plus1 = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10); };
const txt = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const KRATKE = { timeout: 4000 };
async function blok050(id, fn) {
  try {
    await fn();
  } catch (e) {
    over(id, false, 'blok spadl (prvek chybí nebo nečekaná chyba)', String(e && e.message).split('\n')[0]);
  }
}
/** Kolik vlastních čekajících hovorů je na dnešek a po termínu (odznak u kalendáře). */
const kZavolaniDnes = async (page, uid) => {
  const dnes = denP(Date.now());
  return (await stav(page)).zavolat.filter((z) => z.user_id === uid && z.stav === 'ceka' && denP(z.kdy) <= dnes).length;
};
const odznak = async (page) => {
  const b = page.locator('nav .nav-badge');
  return (await b.count()) ? Number(await b.first().innerText()) : 0;
};

/* ============ C) Moji klienti: sloupce Známka a Cena (pod ní hosting), 1280 i 390 px ============ */
for (const sirka of [1280, 390]) {
  await blok050(`C ${sirka}`, async () => {
    const { ctx, page } = await novaStranka('petra', { sirka, vyska: sirka < 768 ? 844 : 900 });
    await jdi(page, '#/moji', 600);
    const hlavicky = (await page.locator('table.kontakty thead th').allInnerTexts()).map((t) => txt(t).toLowerCase());
    over(`C1 ${sirka}`, hlavicky.includes('známka') && hlavicky.includes('cena'), 'Moji klienti mají sloupce Známka a Cena', hlavicky.join('|'));
    const bunky = async (jmeno) => {
      const r = page.locator('table.kontakty tbody tr', { hasText: jmeno }).first();
      const i = hlavicky.indexOf('známka');
      const j = hlavicky.indexOf('cena');
      const td = r.locator('td');
      return { znamka: i >= 0 ? txt(await td.nth(i).innerText()) : '', cena: j >= 0 ? txt(await td.nth(j).innerText()) : '' };
    };
    const vrsek = await bunky('Chalupa Na Vršku');
    over(`C2 ${sirka}`, vrsek.znamka === 'A' && vrsek.cena === '7 000 Kč hosting 1 500 Kč/rok', 'čistá cena „7 000 Kč“ a pod ní hosting', JSON.stringify(vrsek));
    const sumava = await bunky('Penzion Šumava');
    over(`C3 ${sirka}`, sumava.znamka === 'A' && sumava.cena === '4 900 Kč hosting 190/měs', 'cena „4900“ jako „4 900 Kč“, hosting „190/měs“ jak je zapsaný', JSON.stringify(sumava));
    const palouček = await bunky('Chalupa Na Paloučku');
    // ⚠ migrace 051 (Albert 22. 10. 2026): nedohodnutá cena je „n/a“, NAHRAZUJE pomlčku (známka bez hodnoty dál „—“)
    over(`C4 ${sirka}`, palouček.znamka === '—' && palouček.cena === 'n/a', 'bez známky pomlčka, bez ceny „n/a“', JSON.stringify(palouček));
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    over(`C5 ${sirka}`, w <= sirka, 'stránka se do strany neposouvá (tabulka uvnitř rámečku)', `scrollWidth ${w}`);
    await ctx.close();
  });
}

/* ============ N) Nerelevantní: okno s povinným důvodem, call_log, další karta, odznak ============ */
await blok050('N', async () => {
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/call', 600);
  const x = await kartaId(page);
  const odznakPred = await odznak(page);
  await page.getByRole('button', { name: 'Nerelevantní', exact: true }).click(KRATKE);
  const okno = page.locator('.modal');
  // klávesnice (po recenzi 21. 10. 2026): fokus v okně na prvním důvodu, Escape okno zavře a fokus vrátí na tlačítko
  const fokus = () => page.evaluate(() => ({ v: !!document.activeElement?.closest('.modal'), t: document.activeElement?.textContent?.trim() ?? '' }));
  const f1 = await fokus();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const f2 = await fokus();
  over('N0', f1.v && f1.t === 'starší člověk' && (await page.locator('.modal').count()) === 0 && f2.t === 'Nerelevantní',
    'okno Nerelevantní: fokus na prvním důvodu, Escape zavře a fokus se vrátí', JSON.stringify({ f1, f2 }));
  await page.getByRole('button', { name: 'Nerelevantní', exact: true }).click(KRATKE);
  const potvrdit = okno.getByRole('button', { name: 'Ano, nerelevantní' });
  over('N1', /nepočítá jako odmítnutí/.test(txt(await okno.innerText())) && /nezavolá/.test(txt(await okno.innerText())),
    'okno vysvětlí, že se kontaktu už nevolá a do statistik se nepočítá jako odmítnutí', txt(await okno.innerText()).slice(0, 160));
  over('N2', await potvrdit.isDisabled(), 'bez důvodu nejde potvrdit');
  const pred = (await stav(page)).callLog.length;
  await okno.getByRole('button', { name: 'není majitel' }).click();
  over('N3', !(await potvrdit.isDisabled()) && (await okno.getByRole('button', { name: 'není majitel' }).getAttribute('aria-pressed')) === 'true',
    'rychlý důvod se vybere a potvrzení jde');
  await potvrdit.click();
  await klid(page, 500);
  const st = await stav(page);
  const zapis = st.callLog.slice(pred);
  const k = st.kontakty.find((c) => c.id === x);
  over('N4', zapis.length === 1 && zapis[0].kontakt_id === x && zapis[0].outcome === 'nerelevantni' && zapis[0].user_id === UID.petra,
    'call_log má hovor s výsledkem nerelevantni', JSON.stringify(zapis));
  over('N5', k?.status === 'nerelevantni' && /není majitel/.test(k?.note ?? ''), 'kontakt je nerelevantní a důvod je v poznámce', JSON.stringify({ s: k?.status, n: k?.note }));
  const y = await kartaId(page);
  over('N6', (await page.locator('.modal').count()) === 0 && y !== null && y !== x, 'okno se zavře a přijde další karta', `${x} → ${y}`);
  // karta x byla naplánovaný hovor po termínu: výsledek ho uzavře a odznak se hned sníží (bez minutového čekání)
  await page.waitForTimeout(400);
  over('N7', odznakPred >= 1 && (await odznak(page)) === odznakPred - 1 && (await odznak(page)) === (await kZavolaniDnes(page, UID.petra)),
    'odznak u kalendáře se po výsledku hovoru hned sníží', `${odznakPred} → ${await odznak(page)}`);
  await ctx.close();
});

/* ============ P) Přeplánovat: výběr času, call_log, kalendář, kontakt se do té doby nenabízí ============ */
await blok050('P', async () => {
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/call', 600);
  // napřed karta z kalendáře (10, po termínu): zapsat Nedovoláno, ať je na obrazovce obyčejná karta z fronty
  if ((await kartaId(page)) === 10) {
    await page.getByRole('button', { name: 'Nedovoláno', exact: true }).click(KRATKE);
    await klid(page, 400);
  }
  const y = await kartaId(page);
  await page.locator('.call-card textarea').last().fill('chce zavolat zítra ráno');
  await page.getByRole('button', { name: 'Přeplánovat' }).click(KRATKE);
  const okno = page.locator('.modal');
  const vOkne = await page.evaluate(() => !!document.activeElement?.closest('.modal'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  over('P0', vOkne && (await okno.count()) === 0 && (await page.locator('.call-card textarea').last().inputValue()) === 'chce zavolat zítra ráno',
    'okno Přeplánovat: fokus v okně, Escape zavře a poznámka na kartě zůstane');
  await page.getByRole('button', { name: 'Přeplánovat' }).click(KRATKE);
  over('P1', (await okno.locator('textarea').inputValue()) === 'chce zavolat zítra ráno', 'poznámka z karty se přenese do okna');
  const vsPred = (await volani(page)).length;
  await okno.getByRole('button', { name: 'Přeplánovat a další' }).click();
  await page.waitForTimeout(200);
  over('P2', /Vyberte den a čas, kdy zavolat\./.test(await okno.locator('.error-box').innerText().catch(() => ''))
    && !(await volani(page)).slice(vsPred).some((v) => v.fn === 'resolveCall'), 'bez času okno řekne „Vyberte den a čas“ a nic neuloží');
  // po recenzi 21. 10. 2026: přeplánovat nejdřív za 15 minut (okno to řekne samo a nic neuloží)
  const brzy = Date.now() + 5 * 60 * 1000;
  await page.fill('#zavolat-den', denP(brzy));
  await page.fill('#zavolat-cas', casP(brzy));
  await okno.getByRole('button', { name: 'Přeplánovat a další' }).click();
  await page.waitForTimeout(200);
  over('P2b', /Přeplánovat jde nejdřív za 15 minut\. Když chce člověk mluvit hned, dokončete hovor teď\./.test(await okno.locator('.error-box').innerText().catch(() => ''))
    && !(await volani(page)).slice(vsPred).some((v) => v.fn === 'resolveCall') && /Nejdřív za 15 minut/.test(await okno.innerText()),
    'za 5 minut okno odmítne hláškou serveru (nejdřív za 15 minut)');
  await okno.getByRole('button', { name: 'Zítra 9:00' }).click();
  over('P3', /^Zavoláš zítra v 9:00 \(za \d+ (h|min|den)\)\.$/.test(txt(await okno.locator('.zavolat-veta').innerText())),
    'věta říká, co se uloží', txt(await okno.locator('.zavolat-veta').innerText()));
  const pred = (await stav(page)).callLog.length;
  await okno.getByRole('button', { name: 'Přeplánovat a další' }).click();
  await klid(page, 500);
  const vs = (await volani(page)).slice(vsPred).filter((v) => v.fn === 'resolveCall' && v.ok);
  const st = await stav(page);
  const z = st.zavolat.find((r) => r.kontakt_id === y && r.stav === 'ceka');
  const zitra = plus1(denP(Date.now()));
  over('P4', vs.length === 1 && vs[0].args[0].outcome === 'preplanovano' && denP(vs[0].args[0].kdy) === zitra && casP(vs[0].args[0].kdy) === '09:00'
    && st.callLog.slice(pred).some((l) => l.kontakt_id === y && l.outcome === 'preplanovano'),
    'zápis hovoru „preplanovano“ s časem zítra v 9:00 (Praha)', JSON.stringify(vs[0]?.args?.[0]));
  over('P5', !!z && z.user_id === UID.petra && denP(z.kdy) === zitra && z.poznamka === 'chce zavolat zítra ráno' && st.kontakty.find((c) => c.id === y)?.status === 'nedovolano',
    'v kalendáři čeká Petřin hovor, kontakt zůstal ve frontě', JSON.stringify(z));
  const dalsi = [];
  for (let i = 0; i < 12; i++) {
    const id = await kartaId(page);
    if (id === null) break;
    dalsi.push(id);
    await page.getByRole('button', { name: 'Nedovoláno', exact: true }).click(KRATKE);
    await klid(page, 300);
  }
  over('P6', dalsi.length >= 1 && !dalsi.includes(y), 'přeplánovaný kontakt ve frontě nepřijde, dokud čas nenastane', `${y}: ${dalsi.join()}`);
  await jdi(page, '#/kalendar', 600);
  const polozka = page.locator(`.zavolat-polozka[data-zavolat-id="${z?.id}"]`);
  over('P7', (await polozka.count()) === 1 && /9:00/.test(await polozka.innerText()) && /chce zavolat zítra ráno/.test(await polozka.innerText())
    && /Nadcházející/.test(await page.locator('.zavolat-oddil.nadchazejici').innerText().catch(() => '')),
    'hovor je v kalendáři v Nadcházejících v 9:00 s poznámkou');
  await ctx.close();
});

/* ============ K) Kalendář: Volající jen svůj, akce; super admin filtr a Všichni volající; 1280 a 390 px ============ */
for (const sirka of [1280, 390]) {
  await blok050(`K petra ${sirka}`, async () => {
    const { ctx, page } = await novaStranka('petra', { sirka, vyska: sirka < 768 ? 844 : 900 });
    await jdi(page, '#/kalendar', 700);
    const st = await stav(page);
    const moje = st.zavolat.filter((z) => z.user_id === UID.petra && z.stav === 'ceka');
    const polozky = page.locator('.zavolat-polozka:not(.uzavrena)');
    over(`K1 ${sirka}`, (await page.locator('#kalendar-kdo').count()) === 0 && (await polozky.count()) === moje.length && moje.length >= 3,
      'Petra: bez výběru člověka, jen svoje čekající hovory', `${await polozky.count()} / ${moje.length}`);
    const text = await page.evaluate(() => document.body.innerText);
    over(`K2 ${sirka}`, !/Srub U Potoka/.test(text) && /Po termínu/.test(text) && /Chalupa Na Paloučku/.test(text),
      'Petra nevidí Honzův hovor; hovor po termínu je v oddílu Po termínu');
    const vs = (await volani(page)).filter((v) => v.fn === 'zavolatSeznam');
    over(`K3 ${sirka}`, vs.length >= 1 && vs.every((v) => (v.args[0] ?? null) === null && !v.args[1]), 'Volající se ptá jen na svůj kalendář', JSON.stringify(vs.map((v) => v.args)));
    // po recenzi 21. 10. 2026: připomínky jen čekající (p_jen_cekajici), kalendář celý seznam
    over(`K3b ${sirka}`, vs.some((v) => v.args[2] === true) && vs.some((v) => v.args[2] !== true), 'připomínky se ptají jen na čekající, kalendář na celý seznam', JSON.stringify(vs.map((v) => v.args)));
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    over(`K4 ${sirka}`, w <= sirka, 'kalendář se do strany neposouvá', `scrollWidth ${w}`);
    if (sirka === 1280) {
      // Zrušit s potvrzením
      const z12 = moje.find((z) => z.kontakt_id === 12);
      const p12 = page.locator(`.zavolat-polozka[data-zavolat-id="${z12?.id}"]`);
      await p12.getByRole('button', { name: 'Zrušit' }).click(KRATKE);
      over('K5', /Zrušit naplánovaný hovor\?/.test(await page.locator('.modal').innerText()), 'Zrušit se napřed potvrzuje');
      await page.getByRole('button', { name: 'Ano, zrušit' }).click();
      await klid(page, 500);
      over('K5b', (await stav(page)).zavolat.find((z) => z.id === z12?.id)?.stav === 'zruseno' && (await p12.count()) === 0, 'po potvrzení je hovor zrušený a z kalendáře zmizí');
      // Hotovo u klienta mimo frontu (9)
      const z9 = moje.find((z) => z.kontakt_id === 9);
      const p9 = page.locator(`.zavolat-polozka[data-zavolat-id="${z9?.id}"]`);
      over('K6', (await p9.getByRole('button', { name: 'Zavolat teď' }).count()) === 0 && (await p9.getByRole('button', { name: 'Hotovo' }).count()) === 1,
        'klient mimo frontu: Hotovo místo Zavolat teď');
      await p9.getByRole('button', { name: 'Hotovo' }).click();
      await page.locator('#zavolat-vysledek').fill('domluveno, zaplatí do pátku');
      await page.locator('.modal').getByRole('button', { name: 'Hotovo' }).click();
      await klid(page, 500);
      const h9 = (await volani(page)).find((v) => v.fn === 'zavolatHotovo' && v.ok);
      over('K6b', (await stav(page)).zavolat.find((z) => z.id === z9?.id)?.stav === 'hotovo' && h9?.args[1] === 'domluveno, zaplatí do pátku', 'Hotovo s výsledkem uzavře hovor');
      await page.getByRole('button', { name: /Ukázat hotové a zrušené/ }).click();
      over('K7', (await page.locator('.zavolat-polozka.uzavrena').count()) >= 3 && /domluveno, zaplatí do pátku/.test(await page.locator('.zavolat-oddil.uzavrene').innerText()),
        'hotové a zrušené za 14 dní jsou sbalené a jdou rozbalit');
      // Zavolat teď: karta ve volání přes zavolat_vzit, parametr z adresy zmizí
      const z10 = moje.find((z) => z.kontakt_id === 10);
      await page.locator(`.zavolat-polozka[data-zavolat-id="${z10?.id}"]`).getByRole('button', { name: 'Zavolat teď' }).click();
      await klid(page, 700);
      const vz = (await volani(page)).filter((v) => v.fn === 'zavolatVzit');
      over('K8', vz.length >= 1 && vz.every((v) => v.args[0] === z10?.id) && (await kartaId(page)) === 10 && !/zavolat=/.test(await page.evaluate(() => location.hash))
        && /Naplánovaný hovor/.test(await page.locator('.zavolat-banner').innerText().catch(() => '')),
        '„Zavolat teď“ otevře kartu ve volání s cedulkou naplánovaného hovoru a parametr z adresy zmizí', await page.evaluate(() => location.hash));
    }
    await ctx.close();
  });
}
await blok050('K mikulas', async () => {
  const { ctx, page } = await novaStranka('mikulas');
  await jdi(page, '#/kalendar', 700);
  const moznosti = (await page.locator('#kalendar-kdo option').allInnerTexts()).map(txt);
  over('K9', moznosti[0]?.startsWith('Já (Mikuláš)') && moznosti.some((o) => o.startsWith('Petra')) && moznosti[moznosti.length - 1] === 'Všichni volající',
    'super admin: výběr Já / kdokoli / Všichni volající', moznosti.join('|'));
  over('K9b', /Zatím nemáš naplánované hovory/.test(await page.evaluate(() => document.body.innerText)), 'svůj kalendář má prázdný s nápovědou, jak hovor naplánovat');
  await page.selectOption('#kalendar-kdo', String(UID.petra));
  await klid(page, 500);
  const st = await stav(page);
  const petriny = st.zavolat.filter((z) => z.user_id === UID.petra && z.stav === 'ceka');
  const polozky = page.locator('.zavolat-polozka:not(.uzavrena)');
  over('K10', (await polozky.count()) === petriny.length && /volá Petra/.test(await polozky.first().innerText())
    && (await page.getByRole('button', { name: 'Zavolat teď' }).count()) === 0 && (await page.getByRole('button', { name: 'Přesunout' }).count()) === petriny.length,
    'Petřin kalendář: její hovory, kdo volá, super admin přesouvá a ruší, „Zavolat teď“ jen ten, kdo má volat', `${await polozky.count()} / ${petriny.length}`);
  await page.selectOption('#kalendar-kdo', 'vsichni');
  await klid(page, 500);
  const text = await page.evaluate(() => document.body.innerText);
  const vs = (await volani(page)).filter((v) => v.fn === 'zavolatSeznam').map((v) => v.args);
  over('K11', /Srub U Potoka/.test(text) && /Chalupa Na Paloučku/.test(text) && /volá Honza/.test(text) && vs.some((a) => a[1] === true) && vs.some((a) => a[0] === UID.petra),
    'Všichni volající: hovory Petry i Honzy', JSON.stringify(vs));
  // přesun Honzova hovoru Petře (Kdo zavolá)
  const zH = st.zavolat.find((z) => z.kontakt_id === 11 && z.stav === 'ceka');
  await page.locator(`.zavolat-polozka[data-zavolat-id="${zH?.id}"]`).getByRole('button', { name: 'Přesunout' }).click(KRATKE);
  over('K12', (await page.locator('#zavolat-kdo').inputValue()) === String(UID.honza), 'při přesunu je předvybraný ten, kdo hovor má');
  await page.selectOption('#zavolat-kdo', String(UID.petra));
  await page.getByRole('button', { name: 'Zítra 14:00' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Přesunout' }).click();
  await klid(page, 500);
  const z2 = (await stav(page)).zavolat.find((z) => z.id === zH?.id);
  over('K12b', z2?.user_id === UID.petra && casP(z2.kdy) === '14:00', 'super admin hovor přesune a přeřadí Petře', JSON.stringify(z2));
  // detail kontaktu (po recenzi 21. 10. 2026): čekající hovor (kdy, kdo, poznámka) a Přesunout s předvybraným, kdo ho má
  await jdi(page, '#/admin', 700);
  await page.locator('input.search-input').fill('Chata Pod Hájem');
  await klid(page, 800);
  await page.locator('table.kontakty tbody tr', { hasText: 'Chata Pod Hájem' }).first().click(KRATKE);
  await klid(page, 500);
  const blok = txt(await page.locator('.drawer .zavolat-blok').innerText(KRATKE));
  over('K13', /Naplánovaný hovor .*volá Petra · Majitel bere telefon jen dopoledne\./.test(blok) && /Přesunout hovor/.test(blok),
    'super admin vidí v detailu hovor kontaktu (kdy, kdo, poznámka)', blok);
  await page.locator('.drawer').getByRole('button', { name: 'Přesunout hovor' }).click(KRATKE);
  over('K13b', /Přesunout hovor/.test(await page.locator('.modal').innerText()) && (await page.locator('#zavolat-kdo').inputValue()) === String(UID.petra)
    && (await page.locator('#zavolat-poznamka').inputValue()) === 'Majitel bere telefon jen dopoledne.',
    'okno Přesunout: předvybraná Petra a předvyplněná poznámka, super admin smí vybrat jiného');
  await page.keyboard.press('Escape');
  // cizí kontakt (Honzův klient 3): super admin plánovat smí
  await page.locator('.drawer-close').click();
  await page.locator('input.search-input').fill('Vysočina');
  await klid(page, 800);
  await page.locator('table.kontakty tbody tr').first().click(KRATKE);
  await klid(page, 500);
  over('K13c', (await page.locator('.drawer').getByRole('button', { name: 'Naplánovat hovor' }).count()) === 1, 'super admin plánuje hovor i kontaktu, který není jeho');
  await ctx.close();
});

/* ============ K seg) Zavolat teď u architekta, když volám chaty: segment se nepřepne potichu, žlutá cedulka ============ */
await blok050('K seg', async () => {
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/moji', 600);
  await page.locator('table.kontakty tbody tr', { hasText: 'Jana Vzorová' }).click(KRATKE);
  await klid(page, 400);
  await page.locator('.drawer').getByRole('button', { name: 'Naplánovat hovor' }).click(KRATKE);
  const ted = Date.now();
  await page.fill('#zavolat-den', denP(ted));
  await page.fill('#zavolat-cas', casP(ted));
  await page.locator('.modal').getByRole('button', { name: /^Naplánovat$/ }).click();
  await klid(page, 500);
  const z = (await stav(page)).zavolat.find((x) => x.kontakt_id === 302 && x.stav === 'ceka');
  await jdi(page, '#/kalendar', 600);
  await page.locator(`.zavolat-polozka[data-zavolat-id="${z?.id}"]`).getByRole('button', { name: 'Zavolat teď' }).click(KRATKE);
  await klid(page, 700);
  const cedulka = await page.locator('.info-box').first().innerText().catch(() => '');
  over('K14', (await kartaId(page)) === 302 && (await prepinac(page, 'chata').getAttribute('aria-pressed')) === 'true'
    && /Po tomhle hovoru dostaneš chatu\./.test(cedulka) && (await page.evaluate(() => localStorage.getItem('volacka_segment'))) !== 'architekt',
    'karta architekta z kalendáře při zvolených chatách: přepínač zůstane na chatách a žlutá cedulka to řekne', cedulka);
  await ctx.close();
});

/* ============ H) Odznak u kalendáře a lišta na Domů ============ */
for (const kdo of ['petra', 'honza']) {
  await blok050(`H ${kdo}`, async () => {
    const { ctx, page } = await novaStranka(kdo);
    await jdi(page, '#/', 700);
    const cekane = await kZavolaniDnes(page, UID[kdo]);
    over(`H1 ${kdo}`, (await odznak(page)) === cekane, `${kdo}: odznak u kalendáře = hovory na dnešek a po termínu`, `${await odznak(page)} / ${cekane}`);
    const lista = page.locator('.home-zavolat');
    if (cekane > 0) {
      const t = txt(await lista.innerText());
      over(`H2 ${kdo}`, (await lista.count()) === 1 && /^Dnes máš zavolat/.test(t) && /Chalupa Na Paloučku/.test(t) && /po termínu/.test(t) && (await lista.getAttribute('href'))?.endsWith('/kalendar'),
        `${kdo}: lišta na Domů s časy a odkazem na kalendář`, t.slice(0, 160));
    } else {
      over(`H2 ${kdo}`, (await lista.count()) === 0, `${kdo}: bez hovorů na dnešek lišta není`);
    }
    over(`H3 ${kdo}`, (await page.locator('a.big-tile[href$="/kalendar"]').count()) === 1, `${kdo}: dlaždice Kalendář na Domů`);
    await ctx.close();
  });
}

/* ============ T) Detail kontaktu: Naplánovat hovor; upozornění v rohu (−5 až +30 minut, každý hovor jednou) ============ */
await blok050('T', async () => {
  const { ctx, page } = await novaStranka('petra');
  const naplanovat = async (jmeno, minut, poznamka) => {
    await jdi(page, '#/moji', 600);
    if (await page.locator('.drawer-close').count()) await page.locator('.drawer-close').click();
    await page.locator('table.kontakty tbody tr', { hasText: jmeno }).click(KRATKE);
    await klid(page, 400);
    await page.locator('.drawer').getByRole('button', { name: /Naplánovat hovor|Přesunout hovor/ }).click(KRATKE);
    const kdy = Date.now() + minut * 60 * 1000;
    await page.fill('#zavolat-den', denP(kdy));
    await page.fill('#zavolat-cas', casP(kdy));
    await page.fill('#zavolat-poznamka', poznamka);
    await page.locator('.modal').getByRole('button', { name: /^(Naplánovat|Přesunout)$/ }).click();
    await klid(page, 600);
    return kdy;
  };
  await jdi(page, '#/moji', 600);
  await page.locator('table.kontakty tbody tr', { hasText: 'Roubenka U Lesa' }).click();
  await klid(page, 400);
  await page.locator('.drawer').getByRole('button', { name: 'Naplánovat hovor' }).click(KRATKE);
  over('T1', (await page.locator('#zavolat-kdo').count()) === 0 && /Naplánovat hovor/.test(await page.locator('.modal').innerText()), 'Volající v okně nevybírá, kdo zavolá');
  await page.locator('.modal').getByRole('button', { name: 'Zpět' }).click();
  const kdy = await naplanovat('Roubenka U Lesa', 3, 'připomeň mi to');
  const n = (await volani(page)).find((v) => v.fn === 'zavolatNaplanovat' && v.ok);
  over('T2', !!n && n.args[0] === 2 && n.args[2] === 'připomeň mi to' && (n.args[3] ?? null) === null && casP(n.args[1]) === casP(kdy),
    'detail kontaktu naplánuje hovor (pražský čas)', JSON.stringify(n?.args));
  const toast = page.locator('.zavolat-toast[role="status"]');
  await toast.waitFor({ timeout: 5000 }).catch(() => {});
  over('T3', (await toast.count()) === 1 && /Za chvíli máš zavolat/.test(await toast.innerText()) && /Roubenka U Lesa/.test(await toast.innerText()),
    'upozornění v rohu hned po naplánování hovoru za 3 minuty', await toast.innerText().catch(() => ''));
  const pamet = await page.evaluate(() => localStorage.getItem('volacka_zavolat_pripomenuto_2'));
  over('T4', !!n && JSON.parse(pamet ?? '[]').some((k) => k.startsWith(`${n.id}|`)), 'appka si pamatuje, na který hovor (a čas) už upozornila', pamet);
  await toast.getByRole('button', { name: 'Později' }).click(KRATKE);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cmm:zavolat-changed')));
  await klid(page, 800);
  over('T5', (await page.locator('.zavolat-toast').count()) === 0, 'po „Později“ se stejné upozornění znovu neukáže');
  // detail kontaktu s čekajícím hovorem (po recenzi 21. 10. 2026): kdy, kdo a poznámka, okno jako Přesunout s poznámkou
  if (await page.locator('.drawer-close').count()) await page.locator('.drawer-close').click();
  await page.locator('table.kontakty tbody tr', { hasText: 'Chalupa Na Paloučku' }).click(KRATKE);
  await klid(page, 500);
  const blok = txt(await page.locator('.drawer .zavolat-blok').innerText(KRATKE));
  await page.locator('.drawer').getByRole('button', { name: 'Přesunout hovor' }).click(KRATKE);
  const okno = txt(await page.locator('.modal').innerText());
  over('T5b', /Naplánovaný hovor .* · volá ty · Byl v práci, ať zavoláme odpoledne\./.test(blok) && /^Přesunout hovor/.test(okno)
    && (await page.locator('#zavolat-poznamka').inputValue()) === 'Byl v práci, ať zavoláme odpoledne.',
    'detail ukáže čekající hovor a okno ho přesune s předvyplněnou poznámkou', blok);
  await page.keyboard.press('Escape');
  // přesunutý hovor (stejné id, nový čas za 2 minuty) připomene znovu; „Zavolat teď“ otevře kartu ve volání
  await naplanovat('Chalupa Na Paloučku', 2, 'teď');
  over('T5c', (await volani(page)).some((v) => v.fn === 'zavolatPresunout' && v.ok) && !(await volani(page)).some((v) => v.fn === 'zavolatNaplanovat' && v.args[0] === 10),
    'u kontaktu s hovorem detail hovor přesune (zavolat_presunout), nevytváří nový');
  await toast.waitFor({ timeout: 5000 }).catch(() => {});
  over('T6', /Chalupa Na Paloučku/.test(await toast.innerText().catch(() => '')), 'přesunutý hovor (nový čas) upozorní');
  await toast.getByRole('button', { name: 'Zavolat teď' }).click(KRATKE);
  await klid(page, 700);
  over('T7', (await kartaId(page)) === 10 && !/zavolat=/.test(await page.evaluate(() => location.hash)) && (await toast.count()) === 0
    && (await volani(page)).some((v) => v.fn === 'zavolatVzit' && v.ok), '„Zavolat teď“ v upozornění otevře kartu ve volání', `${await kartaId(page)} ${await page.evaluate(() => location.hash)}`);
  // cizí kontakt (Honzův klient 3, detail „skryto“): Volající hovor naplánovat nesmí, tlačítko tam není
  await jdi(page, '#/admin', 700);
  await page.locator('input.search-input').fill('Vysočina');
  await klid(page, 800);
  await page.locator('table.kontakty tbody tr').first().click(KRATKE);
  await klid(page, 500);
  over('T8', (await page.locator('.drawer-skryto').count()) === 1 && (await page.locator('.drawer').getByRole('button', { name: /Naplánovat hovor|Přesunout hovor/ }).count()) === 0
    && !(await volani(page)).some((v) => v.fn === 'zavolatKontaktu' && v.args[0] === 3),
    'detail cizího kontaktu: Volající nemá Naplánovat hovor (a appka se na jeho hovor ani neptá)');
  await ctx.close();
});

/* ============ E) Statistiky: nerelevantní, přeplánované a výdělek; super admin vybere člověka; 390 px ============ */
await blok050('E petra', async () => {
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/stats', 800);
  const hodnota = async (sel) => txt(await page.locator(`${sel} .stat-value`).innerText(KRATKE));
  const text = txt(await page.evaluate(() => document.body.innerText));
  over('E1', (await hodnota('.stat-nerelevantni')) === '1' && (await hodnota('.stat-preplanovano')) === '1', 'karty Nerelevantní a Přeplánováno');
  over('E2', /dovoláno = odmítli \+ zájem \(nerelevantní ani přeplánované se nepočítají\)/.test(text), 'vysvětlivka: nerelevantní ani přeplánované se do dovoláno nepočítají');
  const tyden = txt(await page.locator('.vydelek-tyden').innerText());
  over('E3', (await hodnota('.vydelek-celkem')) === '3 570 Kč' && (await hodnota('.vydelek-tyden')) === '2 100 Kč' && /Tento týden \(\d+\. \d+\. až \d+\. \d+\.\)/i.test(tyden)
    && /30 % z ceny webu, hosting se nepočítá/.test(text), 'Vyděláno: celkem, tento týden s daty, 30 % bez hostingu', tyden);
  const prodeje = (await page.locator('.vydelek-prodeje li').allInnerTexts()).map(txt);
  over('E4', prodeje.length === 2 && /Chalupa Na Vršku .*7 000 Kč 2 100 Kč/.test(prodeje[0]) && /Penzion Šumava — Kučerovi 4 900 Kč 1 470 Kč/.test(prodeje[1]),
    'seznam prodaných webů s cenou a provizí', prodeje.join(' | '));
  const vs = (await volani(page)).filter((v) => v.fn === 'statistikyVolani');
  over('E5', vs.length >= 1 && vs.every((v) => (v.args[0] ?? null) === null) && !/€/.test(text) && (await page.locator('.vydelek-nejasne').count()) === 0,
    'Volající jen svoje; bez eur a bez nejasných cen žádný řádek navíc', JSON.stringify(vs.map((v) => v.args)));
  await ctx.close();
});
await blok050('E mikulas', async () => {
  const { ctx, page } = await novaStranka('mikulas');
  await jdi(page, '#/stats', 800);
  const celkem = async () => txt(await page.locator('.vydelek-celkem .stat-value').innerText(KRATKE));
  over('E6', (await celkem()) === '0 Kč', 'super admin bez prodejů: 0 Kč');
  await page.selectOption('#user-select', String(UID.petra));
  await klid(page, 600);
  over('E7', (await celkem()) === '3 570 Kč' && (await volani(page)).some((v) => v.fn === 'statistikyVolani' && v.args[0] === UID.petra), 'super admin vidí výdělek Petry', await celkem());
  await page.selectOption('#user-select', String(UID.honza));
  await klid(page, 600);
  const t = txt(await page.evaluate(() => document.body.innerText));
  over('E8', (await celkem()) === '1 050 Kč' && (await page.locator('.vydelek-nejasne').count()) === 1 && /cena nejde přečíst/.test(t) && (await page.locator('.vydelek-sleva').count()) === 1
    && /3 500 Kč/.test(t), 'Honza: sleva (3 500 Kč) se počítá, nejasná cena ne a appka to řekne', t.slice(t.indexOf('Vyděláno'), t.indexOf('Vyděláno') + 300));
  await page.selectOption('#user-select', String(UID.eva));
  await klid(page, 600);
  over('E9', /Za weby v eurech navíc: celkem 75 €/.test(txt(await page.locator('.vydelek-eur').innerText().catch(() => ''))), 'eura zvlášť, když nějaká jsou');
  await ctx.close();
});
await blok050('E 390', async () => {
  const { ctx, page } = await novaStranka('petra', { sirka: 390, vyska: 844 });
  await jdi(page, '#/stats', 800);
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  over('E10', w <= 390 && (await page.locator('.vydelek-celkem').count()) === 1, 'Statistiky s výdělkem se na telefonu vejdou bez vodorovného posunu', `scrollWidth ${w}`);
  await jdi(page, '#/call', 800);
  const w2 = await page.evaluate(() => document.documentElement.scrollWidth);
  const tl = page.locator('.outcome-row .outcome-dalsi button');
  const presahuje = await tl.evaluateAll((els) => els.some((e) => e.scrollWidth > e.clientWidth + 1));
  over('E11', w2 <= 390 && (await tl.count()) === 2 && !presahuje, 'volání na telefonu: Nerelevantní a Přeplánovat se vejdou', `scrollWidth ${w2}`);
  await ctx.close();
});

/* ============ A) Cena při „Mají zájem“ nepovinná, nedohodnutá = „n/a“ (migrace 051, Albert 22. 10. 2026) ============ */
// Albert: „make the web and hosting price optional at Mají zájem“ a „there's n/a on the hosting and on the prices when we
// haven't arranged them yet“. Volající uloží zájem jen se známkou; Moji klienti, detail i výdělek ukážou „n/a“.
const cenaBunka = async (page, jmeno) => {
  const hlavicky = (await page.locator('table.kontakty thead th').allInnerTexts()).map((t) => txt(t).toLowerCase());
  const td = page.locator('table.kontakty tbody tr', { hasText: jmeno }).first().locator('td').nth(hlavicky.indexOf('cena'));
  return { text: txt(await td.innerText(KRATKE)), na: await td.locator('.cena-na').count(), title: (await td.locator('.cena-na').first().getAttribute('title').catch(() => null)) ?? '' };
};
const poleCeny = (page, popisek) => page.locator('.drawer .field', { has: page.locator('label', { hasText: new RegExp(`^${popisek}$`) }) }).locator('input');
await blok050('A petra', async () => {
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/call', 600);
  const x = await kartaId(page);
  const jmeno = (await stav(page)).kontakty.find((k) => k.id === x)?.name ?? '';
  await page.getByRole('button', { name: 'Mají zájem' }).click(KRATKE);
  const formular = page.locator('.zajem-form');
  const ft = txt(await formular.innerText(KRATKE));
  const ulozit = formular.getByRole('button', { name: /Uložit a další/ });
  over('A1', /Cena webu \(nepovinné\)/.test(ft) && /Cena hostingu \(nepovinné\)/.test(ft) && /Nech prázdné = n\/a, cena zatím nedohodnutá/.test(ft)
    && (await formular.locator('.form-grid .req').count()) === 0 && (await page.locator('#zajem-cena-web').inputValue()) === ''
    && (await page.locator('#zajem-cena-hosting').inputValue()) === '',
    'formulář zájmu: ceny nepovinné, nápověda „nech prázdné = n/a“, u cen žádná hvězdička', ft.slice(0, 200));
  over('A2', (await ulozit.isDisabled()) && /Vyber známku zájmu/.test(ft), 'bez známky uložit nejde (známka zůstává povinná)');
  await formular.locator('.segmented button', { hasText: /^B$/ }).click();
  over('A3', !(await ulozit.isDisabled()), 's prázdnými cenami a známkou uložit jde');
  // po revizi DB 22. 10. 2026: napsaná výplň („0“ u hostingu) je totéž co prázdné pole
  await page.fill('#zajem-cena-hosting', '0');
  const pred = (await volani(page)).length;
  await ulozit.click();
  await klid(page, 600);
  const zapis = (await volani(page)).slice(pred).find((v) => v.fn === 'resolveCall');
  const k = (await stav(page)).kontakty.find((c) => c.id === x);
  over('A4', !!zapis && zapis.ok && zapis.args[0].outcome === 'zajem' && zapis.args[0].rating === 'B' && zapis.args[0].cena_web === null
    && zapis.args[0].cena_hosting === null && k?.status === 'zajem' && k.cena_web === null && k.cena_hosting === null && (await kartaId(page)) !== x,
    'zájem jen se známkou se uloží, prázdná cena i napsaná „0“ jdou jako null (ne text) a přijde další karta', JSON.stringify({ a: zapis?.args[0], w: k?.cena_web, h: k?.cena_hosting }));

  // Moji klienti: obě ceny nedohodnuté = JEDNO šedé „n/a“
  await jdi(page, '#/moji', 600);
  let b = await cenaBunka(page, jmeno);
  over('A5', b.text === 'n/a' && b.na === 1 && b.title === 'Cena webu ani hostingu zatím není dohodnutá',
    'Moji klienti: bez ceny webu i hostingu jedno „n/a“ s nápovědou', JSON.stringify(b));
  // detail vlastního klienta: pole cen prázdná s nápovědou „n/a“; hosting doplní, web ne → „n/a“ a „hosting 190/měs“
  const otevri = async () => {
    if (await page.locator('.drawer-close').count()) await page.locator('.drawer-close').click();
    await page.locator('table.kontakty tbody tr', { hasText: jmeno }).first().click(KRATKE);
    await klid(page, 400);
  };
  const ulozDetail = async () => {
    const p0 = (await volani(page)).length;
    await page.locator('.drawer').getByRole('button', { name: 'Uložit změny' }).click(KRATKE);
    await klid(page, 500);
    return (await volani(page)).slice(p0).find((v) => v.fn === 'updateKontakt');
  };
  await otevri();
  over('A6', (await poleCeny(page, 'Cena webu').inputValue()) === '' && (await poleCeny(page, 'Cena webu').getAttribute('placeholder')) === 'n/a'
    && (await poleCeny(page, 'Cena hostingu').getAttribute('placeholder')) === 'n/a', 'detail: prázdná pole cen s nápovědou „n/a“');
  await poleCeny(page, 'Cena hostingu').fill('190/měs');
  const u1 = await ulozDetail();
  await page.locator('.drawer-close').click();
  b = await cenaBunka(page, jmeno);
  over('A7', u1?.ok && JSON.stringify(u1.args[1]) === '{"cena_hosting":"190/měs"}' && b.text === 'n/a hosting 190/měs' && b.na === 1,
    'cena webu nedohodnutá, hosting ano: „n/a“ a pod ním „hosting 190/měs“', JSON.stringify({ p: u1?.args[1], b }));
  // web 7000, hosting vymazaný: vymazané pole se uloží jako null → „7 000 Kč“ a „hosting n/a“
  await otevri();
  await poleCeny(page, 'Cena webu').fill('7000');
  await poleCeny(page, 'Cena hostingu').fill('');
  const u2 = await ulozDetail();
  await page.locator('.drawer-close').click();
  b = await cenaBunka(page, jmeno);
  const k2 = (await stav(page)).kontakty.find((c) => c.id === x);
  over('A8', u2?.ok && u2.args[1].cena_web === '7000' && u2.args[1].cena_hosting === null && k2?.cena_hosting === null && b.text === '7 000 Kč hosting n/a',
    'vymazaná cena hostingu se uloží jako null, Moji klienti „7 000 Kč“ a „hosting n/a“', JSON.stringify({ p: u2?.args[1], b }));
  // po revizi DB 22. 10. 2026: napsané „n/a“ se uloží jako null (update_kontakt uloží, co dostane, text „n/a“ tam nesmí),
  // pole pak ukáže prázdno s nápovědou „n/a“ a v Moji klienti je jedno „n/a“
  await otevri();
  await poleCeny(page, 'Cena webu').fill('n/a');
  const u3 = await ulozDetail();
  const pole = await poleCeny(page, 'Cena webu').inputValue();
  const ulozitJde = !(await page.locator('.drawer').getByRole('button', { name: 'Uložit změny' }).isDisabled());
  await page.locator('.drawer-close').click();
  b = await cenaBunka(page, jmeno);
  over('A9', u3?.ok && u3.args[1].cena_web === null && (await stav(page)).kontakty.find((c) => c.id === x)?.cena_web === null && pole === ''
    && !ulozitJde && b.text === 'n/a' && b.na === 1,
    'napsané „n/a“ v detailu se uloží jako null, pole je pak prázdné a v Moji klienti jedno „n/a“', JSON.stringify({ p: u3?.args[1], pole, ulozitJde, b }));
  await ctx.close();
});
await blok050('A mikulas', async () => {
  const { ctx, page } = await novaStranka('mikulas');
  // detail jen ke čtení (Petřin klient, super admin Honzy ho neupraví): „cena webu: n/a · cena hostingu: n/a“
  const radekCeny = async (hledat) => {
    await jdi(page, '#/admin', 700);
    await page.locator('input.search-input').fill(hledat);
    await klid(page, 800);
    await page.locator('table.kontakty tbody tr', { hasText: hledat }).first().click(KRATKE);
    await klid(page, 500);
    const t = txt(await page.locator('.drawer .cena-radek').innerText(KRATKE));
    await page.locator('.drawer-close').click();
    return t;
  };
  const r10 = await radekCeny('Paloučku');
  const r7 = await radekCeny('Penzion Šumava');
  over('A10', r10 === 'cena webu: n/a · cena hostingu: n/a' && r7 === 'cena webu: 4900 · cena hostingu: 190/měs',
    'detail jen ke čtení: nedohodnutá cena „n/a“, zapsaná tak, jak ji kdo zapsal', `${r10} | ${r7}`);
  // Statistiky Honzy: prodej Chalupa U Studánky bez ceny = „n/a“, vlastní upozornění, do součtu ne; nečitelná cena zvlášť
  await jdi(page, '#/stats', 800);
  await page.selectOption('#user-select', String(UID.honza));
  await klid(page, 600);
  const pozn = txt(await page.locator('.vydelek-neznama').innerText(KRATKE));
  const li = page.locator('.vydelek-prodeje li', { hasText: 'Chalupa U Studánky' });
  const cena = txt(await li.locator('.vydelek-cena').innerText(KRATKE));
  const provize = txt(await li.locator('.vydelek-provize').innerText(KRATKE));
  over('A11', pozn === 'U 1 prodaného webu cena zatím není dohodnutá (n/a), do součtu se nepočítá (z toho tento týden 1). Započítá se sama, až bude cena webu v detailu klienta.'
    && cena === 'n/a' && provize === 'n/a' && (await li.locator('.vydelek-provize.neznama').count()) === 1,
    'výdělek: prodej bez dohodnuté ceny má cenu i provizi „n/a“ a vlastní upozornění', `${pozn} | ${cena} | ${provize}`);
  const celkem = txt(await page.locator('.vydelek-celkem .stat-value').innerText(KRATKE));
  const nejasne = txt(await page.locator('.vydelek-nejasne').innerText(KRATKE));
  over('A12', celkem === '1 050 Kč' && (await page.locator('.vydelek-nejasne').count()) === 1 && /^U 1 prodaného webu cena nejde přečíst/.test(nejasne)
    && (await page.locator('.vydelek-neznama').count()) === 1,
    'nedohodnutá cena se nesčítá a „cena nejde přečíst“ zůstává jen pro nečitelnou cenu (1)', `${celkem} | ${nejasne.slice(0, 80)}`);
  await ctx.close();
});
await blok050('A 390', async () => {
  const { ctx, page } = await novaStranka('petra', { sirka: 390, vyska: 844 });
  await jdi(page, '#/call', 700);
  await page.getByRole('button', { name: 'Mají zájem' }).click(KRATKE);
  await page.waitForTimeout(150);
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  over('A13', w <= 390 && (await page.locator('.zajem-cena-napoveda').isVisible()), 'formulář zájmu s nápovědou se na telefonu vejde', `scrollWidth ${w}`);
  await ctx.close();
});

/* ============ 056 (Albert 27. 10. 2026): statistiky za jeden den, filtry v Moji klienti, řazení podle poslední změny ============ */
// „when we can see anyone's statistics, we should also be able to see their statistics for a specific day“, „in the my
// client section … the same like filters as we have in the contacts. this only applies for the super admins“ a „sort them
// … from the newest to the oldest updated client“. Bloky D056 (den), F056 (Moji klienti) a R056 (Kontakty).
const posunD = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const karta = async (page, popisek) => {
  const c = page.locator('.stat-card', { has: page.locator('.stat-label', { hasText: new RegExp(`^${popisek}$`, 'i') }) }).first();
  return (await c.count()) ? txt(await c.locator('.stat-value').innerText()) : null;
};
const jmenoRadku = async (r) => txt(await r.locator('td').first().innerText());
for (const sirka of [1280, 390]) {
  await blok050(`D056 ${sirka}`, async () => {
    const { ctx, page } = await novaStranka('mikulas', { sirka, vyska: sirka < 768 ? 844 : 900 });
    await jdi(page, '#/stats', 800);
    over(`D56a ${sirka}`, (await page.locator('#obdobi-select').count()) === 1 && (await page.locator('#den-datum').count()) === 0
      && (await page.locator('#obdobi-select').inputValue()) === 'celkem', 'super admin má výběr období, výchozí Celkem');
    await page.selectOption('#user-select', String(UID.petra));
    await klid(page, 600);
    const celkemHovoru = await karta(page, 'Hovorů');
    await page.selectOption('#obdobi-select', 'den');
    await klid(page, 600);
    const dnes = denP(Date.now());
    const sDnem = (await volani(page)).filter((v) => v.fn === 'allStats' && v.args[0]);
    over(`D56b ${sirka}`, (await page.locator('#den-datum').inputValue()) === dnes && sDnem.length >= 1 && sDnem[sDnem.length - 1].args[0] === dnes,
      'Jeden den: výchozí dnes v Praze a allStats dostane den', JSON.stringify(sDnem.map((v) => v.args)));
    // den přeplánovaného hovoru Petry: čísla jen z hovorů toho dne (počítané tady z dat mocku, ne ze stránky)
    const s = await stav(page);
    const hovoryPetry = s.callLog.filter((l) => l.user_id === UID.petra);
    const vybrany = denP(hovoryPetry.find((l) => l.outcome === 'preplanovano').created_at);
    await page.fill('#den-datum', vybrany);
    await klid(page, 600);
    const toho = hovoryPetry.filter((l) => denP(l.created_at) === vybrany);
    const pocet = (o) => String(toho.filter((l) => l.outcome === o).length);
    const ocek = { 'Hovorů': String(toho.length), 'Zájem v hovoru': pocet('zajem'), 'Odmítli v hovoru': pocet('odmitnuto'),
      'Nedovolaných pokusů': pocet('nedovolano'), 'Nerelevantní': pocet('nerelevantni'), 'Přeplánováno': pocet('preplanovano') };
    const vidim = {};
    for (const k of Object.keys(ocek)) vidim[k] = await karta(page, k);
    over(`D56c ${sirka}`, JSON.stringify(vidim) === JSON.stringify(ocek) && toho.length >= 1, 'Petra za vybraný den: jen hovory toho dne',
      `${JSON.stringify(vidim)} / ${JSON.stringify(ocek)}`);
    const popis = txt(await page.locator('.stats-den-popis').innerText(KRATKE));
    over(`D56d ${sirka}`, /den v Praze/.test(popis) && (await page.locator('.vydelek').count()) === 0 && (await page.locator('.stats-den-jen-celkem').count()) === 1
      && (await page.locator('.stat-label', { hasText: '#1 prodejce' }).count()) === 0 && (await page.locator('h2', { hasText: 'Klienti podle stavu' }).count()) === 0,
      'pohled dne: popis dne, bez výdělku, dlaždice #1 prodejce a klientů podle stavu', popis);
    await page.locator('.den-predchozi').click();
    await klid(page, 600);
    over(`D56e ${sirka}`, (await page.locator('#den-datum').inputValue()) === posunD(vybrany, -1)
      && (await volani(page)).filter((v) => v.fn === 'allStats').pop()?.args[0] === posunD(vybrany, -1), 'šipka zpět = předchozí den (i na serveru)');
    over(`D56f ${sirka}`, await page.locator('.den-dalsi').isEnabled() && (await page.locator('#den-datum').getAttribute('max')) === dnes,
      'další den jde, nejvýš dnešek');
    await page.selectOption('#obdobi-select', 'celkem');
    await klid(page, 600);
    over(`D56g ${sirka}`, (await karta(page, 'Hovorů')) === celkemHovoru && (await page.locator('.vydelek').count()) === 1 && (await page.locator('#den-datum').count()) === 0,
      'zpět na Celkem: čísla celkem a výdělek', `${await karta(page, 'Hovorů')} / ${celkemHovoru}`);
    if (sirka < 768) {
      await page.selectOption('#obdobi-select', 'den');
      await klid(page, 500);
      const w = await page.evaluate(() => document.documentElement.scrollWidth);
      over(`D56h ${sirka}`, w <= sirka, 'výběr dne se na telefonu vejde bez vodorovného posunu', `scrollWidth ${w}`);
    }
    await ctx.close();
  });
}
await blok050('D056 petra', async () => {
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/stats', 800);
  over('D56i', (await page.locator('#obdobi-select').count()) === 0 && !(await volani(page)).some((v) => v.fn === 'allStats'),
    'Volající výběr dne nemá a allStats nevolá (čísla jiných lidí jen super admin, 045)');
  await ctx.close();
});
for (const sirka of [1280, 390]) {
  await blok050(`F056 ${sirka}`, async () => {
    const { ctx, page } = await novaStranka('admin', { sirka, vyska: sirka < 768 ? 844 : 900 });
    await jdi(page, '#/moji', 700);
    await page.selectOption('#person-picker', String(UID.petra));
    await klid(page, 700);
    const f = (aria) => page.locator(`.moji-filtry select[aria-label="${aria}"]`);
    over(`F56a ${sirka}`, (await f('Filtr statusu').count()) === 1 && (await f('Filtr známky').count()) === 1 && (await f('Filtr čekání na odpověď').count()) === 1
      && (await f('Řazení').count()) === 1 && (await page.locator('.moji-filtry .search-input').count()) === 1, 'super admin má v Moji klienti filtry jako Kontakty');
    const s = await stav(page);
    const klienti = s.kontakty.filter((k) => k.last_caller === 'Petra' || s.callLog.some((l) => l.user_id === UID.petra && l.kontakt_id === k.id));
    const radky = page.locator('table.kontakty tbody tr');
    over(`F56b ${sirka}`, (await radky.count()) === klienti.length, 'bez filtru všichni klienti Petry', `${await radky.count()} / ${klienti.length}`);
    const nedov = klienti.filter((k) => k.status === 'nedovolano').length;
    await f('Filtr statusu').selectOption('nedovolano');
    await klid(page, 600);
    const volba = txt(await f('Filtr statusu').locator('option[value="nedovolano"]').innerText());
    const pill = await page.locator('h1 .count-pill').innerText().catch(() => '');
    const seznam = () => volani(page).then((vs) => vs.filter((v) => v.fn === 'myKontakty' && v.args[0] === 2000).pop());
    const posledni = await seznam();
    over(`F56c ${sirka}`, nedov > 0 && (await radky.count()) === nedov && pill === String(nedov) && volba.endsWith(`(${nedov})`)
      && posledni?.args[4]?.status === 'nedovolano' && posledni?.args[2] === UID.petra,
      'filtr stavu: jen nedovolaní klienti Petry, počet v nadpisu i u volby, filtr jde na server', `${await radky.count()} / ${nedov} / ${volba} / ${JSON.stringify(posledni?.args)}`);
    await f('Filtr statusu').selectOption('');
    await klid(page, 500);
    await page.fill('.moji-filtry .search-input', 'Nebral');
    await page.waitForTimeout(450);
    await klid(page, 600);
    const hledane = klienti.filter((k) => /nebral/i.test(k.note ?? '')).length;
    const hl = await seznam();
    over(`F56d ${sirka}`, hledane > 0 && (await radky.count()) === hledane && hl?.args[4]?.search === 'Nebral', 'hledání v Moji klienti jde na server (i do poznámky)',
      `${await radky.count()} / ${hledane}`);
    await page.fill('.moji-filtry .search-input', '');
    await page.waitForTimeout(450);
    await klid(page, 600);
    await f('Filtr čekání na odpověď').selectOption('ceka_prvni');
    await klid(page, 600);
    const cek = await seznam();
    over(`F56e ${sirka}`, (await page.locator('.moji-kose button').count()) === 5 && cek?.args[4]?.cekani === 'ceka_prvni' && cek?.args[4]?.kos === 'k_zavolani',
      'filtr čekání zapne koš „k zavolání“ a koše jako Kontakty', JSON.stringify(cek?.args[4]));
    await f('Filtr čekání na odpověď').selectOption('');
    await klid(page, 600);
    // řazení podle poslední změny: kontakt upravený teď je od nejnovější první, od nejstarší poslední
    await f('Řazení').selectOption('zmena_nejnovejsi');
    await klid(page, 600);
    const jmeno = await jmenoRadku(radky.last());
    await radky.last().click();
    await klid(page, 500);
    const pole = page.locator('.drawer textarea[rows="7"]').first();
    await pole.fill(`${await pole.inputValue()}\nzkouška řazení 056`);
    await page.getByRole('button', { name: 'Uložit změny' }).click();
    await klid(page, 800);
    await page.locator('.drawer-close').click();
    await klid(page, 300);
    over(`F56f ${sirka}`, (await jmenoRadku(radky.first())) === jmeno && (await radky.count()) === klienti.length,
      'od nejnovější změny: právě upravený kontakt je první', `${await jmenoRadku(radky.first())} / ${jmeno}`);
    await f('Řazení').selectOption('zmena_nejstarsi');
    await klid(page, 600);
    const raz = await seznam();
    over(`F56g ${sirka}`, (await jmenoRadku(radky.last())) === jmeno && raz?.args[4]?.razeni === 'zmena_nejstarsi',
      'od nejstarší změny: upravený kontakt je poslední, řazení jde na server', JSON.stringify(raz?.args[4]));
    if (sirka < 768) {
      const w = await page.evaluate(() => document.documentElement.scrollWidth);
      over(`F56h ${sirka}`, w <= sirka, 'filtry Moji klienti se na telefonu vejdou bez vodorovného posunu', `scrollWidth ${w}`);
    }
    await ctx.close();
  });
}
await blok050('F056 petra', async () => {
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/moji', 700);
  const vs = (await volani(page)).filter((v) => v.fn === 'myKontakty');
  over('F56i', (await page.locator('.moji-filtry').count()) === 0 && (await page.locator('select[aria-label="Řazení"]').count()) === 0
    && vs.length >= 1 && vs.every((v) => (v.args[4] ?? null) === null), 'Volající v Moji klienti beze změny: bez filtrů a řazení, serveru nic nového',
    JSON.stringify(vs.map((v) => v.args)));
  await ctx.close();
});
await blok050('R056 admin', async () => {
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/admin', 700);
  const radky = page.locator('table.kontakty tbody tr');
  const jmeno = await jmenoRadku(radky.last());
  await radky.last().click();
  await klid(page, 500);
  const pole = page.locator('.drawer textarea[rows="7"]').first();
  await pole.fill(`${await pole.inputValue()}\nzkouška řazení 056`);
  await page.getByRole('button', { name: 'Uložit změny' }).click();
  await klid(page, 800);
  await page.locator('.drawer-close').click();
  await page.selectOption('.filter-bar select[aria-label="Řazení"]', 'zmena_nejnovejsi');
  await klid(page, 600);
  const v = (await volani(page)).filter((x) => x.fn === 'listKontakty' && x.args[0]?.limit === 50).pop();
  over('R56a', (await jmenoRadku(radky.first())) === jmeno && v?.args[0]?.razeni === 'zmena_nejnovejsi' && v?.args[0]?.offset === 0,
    'Kontakty od nejnovější změny: upravený kontakt první, řazení jde na server', `${await jmenoRadku(radky.first())} / ${jmeno}`);
  await page.selectOption('.filter-bar select[aria-label="Řazení"]', 'zmena_nejstarsi');
  await klid(page, 600);
  // demo má méně než 50 kontaktů (jedna strana): upravený kontakt je od nejstarší úplně poslední
  const strana = await radky.count();
  const pill = await page.locator('h1 .count-pill').innerText().catch(() => '');
  over('R56b', String(strana) === pill && (await jmenoRadku(radky.last())) === jmeno && (await jmenoRadku(radky.first())) !== jmeno,
    'od nejstarší změny: upravený kontakt je poslední', `${strana} / ${pill} / ${await jmenoRadku(radky.last())}`);
  await ctx.close();
});
await blok050('R056 petra', async () => {
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/admin', 700);
  await page.selectOption('.filter-bar select[aria-label="Řazení"]', 'zmena_nejnovejsi');
  await klid(page, 600);
  const skryte = await page.locator('table.kontakty tbody tr').evaluateAll((rs) => rs.map((r) => r.querySelector('td:nth-child(3) .skryto') !== null));
  const prvniSkryty = skryte.indexOf(true);
  const napoveda = txt(await page.locator('.skryto-napoveda').innerText().catch(() => ''));
  over('R56c', prvniSkryty > 0 && skryte.slice(prvniSkryty).every(Boolean) && /Podle poslední změny se řadí jen tvoji klienti/.test(napoveda),
    'Volající: podle změny napřed svoji klienti, cizí kontakty za nimi, nápověda to říká', `${JSON.stringify(skryte.slice(0, 20))} | ${napoveda.slice(0, 80)}`);
  await ctx.close();
});

/* ============ 057 (Albert 28. 10. 2026): poslední změna i od automatizace a řazení podle posledního hovoru ============ */
// „I think there should be both filters. One for the latest change regarding anything like if we send them a proposal or
// status change, and the second one should be just the last time they were called, or the moment they were called, the day
// they were called.“ Bloky R057 (Kontakty a Moji klienti super admina, obě šířky) a R057 petra (Volající: jen jeho hovory).
// Očekávané hodnoty se počítají z dat mocku (háček __volackaDemoTest), čas se porovnává ve formátu sloupce (formatDateTime).
const casCs = (page, iso) => page.evaluate((x) => (x ? new Date(x).toLocaleString('cs-CZ', {
  day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'), iso);
const hovorMs = (s, kid, uid = null) => {
  const h = s.callLog.filter((l) => l.kontakt_id === kid && (uid === null || l.user_id === uid)).map((l) => new Date(l.created_at).getTime());
  return h.length ? Math.max(...h) : null;
};
const sloupce = (page) => page.locator('table.kontakty thead th').evaluateAll((t) => t.map((x) => x.textContent.trim()));
const bunkySloupce = (page, i) => page.locator('table.kontakty tbody tr').evaluateAll((rs, j) => rs.map((r) => r.children[j]?.textContent.trim() ?? ''), i);
for (const sirka of [1280, 390]) {
  await blok050(`R057 ${sirka}`, async () => {
    const { ctx, page } = await novaStranka('admin', { sirka, vyska: sirka < 768 ? 844 : 900 });
    await jdi(page, '#/admin', 700);
    const sel = page.locator('.filter-bar select[aria-label="Řazení"]');
    const volby = await sel.locator('option').evaluateAll((os) => os.map((o) => o.value));
    const hl = await sloupce(page);
    over(`R57a ${sirka}`, JSON.stringify(volby) === JSON.stringify(['', 'zmena_nejnovejsi', 'zmena_nejstarsi', 'hovor_nejnovejsi', 'hovor_nejstarsi'])
      && hl.includes('Změněno') && hl.includes('Poslední hovor'), 'Kontakty: čtyři řazení a sloupec Poslední hovor', JSON.stringify({ volby, hl }));
    // od nejnovější změny: první je kontakt s nejpozdější poslední změnou (prodej z tohoto týdne, stav změnila automatizace,
    // appka ho naposledy upravila před 5 dny) a Změněno ukazuje poslední změnu, ne updated_at
    await sel.selectOption('zmena_nejnovejsi');
    await klid(page, 600);
    const s = await stav(page);
    const nej = [...s.kontakty].sort((a, b) => new Date(b.posledni_zmena) - new Date(a.posledni_zmena))[0];
    const radky = page.locator('table.kontakty tbody tr');
    const zm = await bunkySloupce(page, hl.indexOf('Změněno'));
    over(`R57b ${sirka}`, (await jmenoRadku(radky.first())).includes(nej.name) && zm[0] === (await casCs(page, nej.posledni_zmena))
      && new Date(nej.updated_at) < new Date(nej.posledni_zmena) && zm[0] !== (await casCs(page, nej.updated_at)),
      'od nejnovější změny: první kontakt změněný automatizací, Změněno ukazuje poslední změnu (ne updated_at)',
      JSON.stringify({ prvni: await jmenoRadku(radky.first()), nej: nej.name, zm: zm[0], pz: nej.posledni_zmena, upd: nej.updated_at }));
    // od posledního hovoru: první má nejnovější hovor (kohokoli), sloupec ukazuje jeho datum a čas, bez hovoru na konci
    await sel.selectOption('hovor_nejnovejsi');
    await klid(page, 600);
    const hov = await bunkySloupce(page, hl.indexOf('Poslední hovor'));
    const maxH = Math.max(...s.kontakty.map((k) => hovorMs(s, k.id) ?? 0));
    const sHovorem = s.kontakty.filter((k) => hovorMs(s, k.id) !== null).length;
    const v = (await volani(page)).filter((x) => x.fn === 'listKontakty' && x.args[0]?.limit === 50).pop();
    over(`R57c ${sirka}`, hov[0] === (await casCs(page, new Date(maxH).toISOString())) && hov.slice(0, sHovorem).every((x) => x !== '—')
      && hov.slice(sHovorem).every((x) => x === '—') && v?.args[0]?.razeni === 'hovor_nejnovejsi',
      'od posledního hovoru: nejnovější hovor první s datem a časem, kontakty bez hovoru na konci, řazení jde na server',
      JSON.stringify({ hov: hov.slice(0, 4), sHovorem, razeni: v?.args[0]?.razeni }));
    // Moji klienti Petry (super admin): sloupec Poslední hovor s hovory všech (kontakt 2: Honza volal později než Petra)
    await jdi(page, '#/moji', 700);
    await page.selectOption('#person-picker', String(UID.petra));
    await klid(page, 700);
    const hlM = await sloupce(page);
    const k2 = s.kontakty.find((k) => k.id === 2);
    const radek2 = page.locator('table.kontakty tbody tr', { hasText: k2.name }).first();
    const b2 = txt(await radek2.locator('td').nth(hlM.indexOf('Poslední hovor')).innerText());
    const volbyM = await page.locator('.moji-filtry select[aria-label="Řazení"] option').evaluateAll((os) => os.map((o) => o.value));
    over(`R57d ${sirka}`, hlM.includes('Poslední hovor') && b2 === (await casCs(page, new Date(hovorMs(s, 2)).toISOString())) && hovorMs(s, 2) > hovorMs(s, 2, UID.petra)
      && volbyM.includes('hovor_nejnovejsi') && volbyM.includes('hovor_nejstarsi'),
      'Moji klienti super admina: poslední hovor kohokoli (i kolegy), řazení podle hovoru', JSON.stringify({ hlM, b2, volbyM }));
    if (sirka < 768) {
      const w = await page.evaluate(() => document.documentElement.scrollWidth);
      over(`R57e ${sirka}`, w <= sirka, 'sloupec posledního hovoru se na telefonu vejde (tabulka se posouvá uvnitř rámečku)', `scrollWidth ${w}`);
    }
    await ctx.close();
  });
}
await blok050('R057 petra', async () => {
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/admin', 700);
  const hl = await sloupce(page);
  const popisky = await page.locator('.filter-bar select[aria-label="Řazení"] option').evaluateAll((os) => os.map((o) => o.textContent.trim()));
  await page.selectOption('.filter-bar select[aria-label="Řazení"]', 'hovor_nejnovejsi');
  await klid(page, 600);
  const s = await stav(page);
  const k2 = s.kontakty.find((k) => k.id === 2);
  const iHov = hl.indexOf('Můj poslední hovor');
  const radek2 = page.locator('table.kontakty tbody tr', { hasText: k2.name }).first();
  const b2 = txt(await radek2.locator('td').nth(iHov).innerText());
  const skryte = await page.locator('table.kontakty tbody tr').evaluateAll((rs, j) => rs.map((r) => [r.querySelector('td:nth-child(3) .skryto') !== null,
    r.children[j]?.querySelector('.skryto') !== null]), iHov);
  const prvniCizi = skryte.findIndex(([c]) => c);
  const napoveda = txt(await page.locator('.skryto-napoveda').innerText().catch(() => ''));
  over('R57f', iHov >= 0 && !hl.includes('Poslední hovor') && popisky.includes('Podle mého posledního hovoru (od nejnovějšího)')
    && b2 === (await casCs(page, new Date(hovorMs(s, 2, UID.petra)).toISOString())) && hovorMs(s, 2) > hovorMs(s, 2, UID.petra)
    && prvniCizi > 0 && skryte.slice(prvniCizi).every(([c, h]) => c && h) && /počítají se jen tvoje hovory/.test(napoveda),
    'Volající: sloupec „Můj poslední hovor“ jen z jeho hovorů (pozdější hovor kolegy ne), svoji napřed, u cizích pomlčka, nápověda',
    JSON.stringify({ hl, b2, prvniCizi, napoveda: napoveda.slice(0, 80) }));
  await jdi(page, '#/moji', 700);
  const hlM = await sloupce(page);
  const b2m = txt(await page.locator('table.kontakty tbody tr', { hasText: k2.name }).first().locator('td').nth(hlM.indexOf('Můj poslední hovor')).innerText());
  over('R57g', hlM.includes('Můj poslední hovor') && b2m === b2 && (await page.locator('select[aria-label="Řazení"]').count()) === 0,
    'Volající v Moji klienti: „Můj poslední hovor“ jen z jeho hovorů, výběr řazení nemá (jako filtry 056)', JSON.stringify({ hlM, b2m }));
  await ctx.close();
});

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
