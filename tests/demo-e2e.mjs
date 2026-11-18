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
// Migrace 064 (obory, Albert 7. 11. 2026): blok OB (přepínač se dvěma řadami při 360 px, karta „jejich web“, detail pro
// každý stav webu, prázdná fronta niky, stránka Jak volat).
// Migrace 062 (Albert 2. 11. 2026): bloky O062a až O062k (O062j a O062k: kalendář u označeného klienta, ověření 062) („Zavolal/a jsem“ i bez označení v Moji klienti, Kontaktech, detailu
// a kalendáři, šestý výsledek „Chce web“, vypnutá odmítnutí s důvodem, menu stavů v detailu); bez posunu do strany O61a.

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

async function novaStranka(kdo, { sirka = 1280, vyska = 900, ls = {}, hodiny = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: sirka, height: vyska } });
  // hodiny: falešné hodiny prohlížeče (Playwright clock) PŘED načtením appky; čas běží dál sám, test ho posune clock.runFor
  // (Přehled vedení úkol 12: tep časovače práce každých 60 s, blok T12)
  if (hodiny) await ctx.clock.install();
  // ls: další klíče localStorage před načtením appky (migrace 064: volacka_demo_obory zapne ukázkové niky, blok OB)
  await ctx.addInitScript((dalsi) => {
    localStorage.setItem('volacka_supabase_url', ' ');
    localStorage.setItem('volacka_sfx_enabled', '0');
    localStorage.setItem('volacka_music_enabled', '0');
    localStorage.setItem('volacka_pig_enabled', '0');
    for (const [k, v] of Object.entries(dalsi)) localStorage.setItem(k, v);
    globalThis.__volackaDemoTest = { volani: [], zpozdeni: () => 0 };
  }, ls);
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
/**
 * Migrace 060 (Albert 1. 11. 2026): stav a známka se vybírají víc najednou (VyberVice ve sdíleném řádku filtrů, tlačítko
 * s aria-label jako dřív rozbalovací seznam). ⚠ NAHRAZUJE selectOption na select[aria-label="Filtr statusu"]. `obal` = selektor
 * řádku filtrů ('' = první na stránce, '.moji-filtry'), `hodnoty` = co zaškrtnout ([] = vše).
 */
async function vyber(page, aria, hodnoty, obal = '') {
  // ⚠ úkol 11 (Albert 17. 11. 2026): na telefonu jsou filtry v okně „Filtry (n)“, vFiltrech ho otevře a po sobě zavře
  await vFiltrech(page, async () => {
    const tl = page.locator(`${obal} button[aria-label="${aria}"]`.trim()).first();
    await tl.click();
    const panel = page.locator(`${obal} .vyber-vice-panel`.trim()).first();
    await panel.waitFor({ timeout: 4000 });
    if (hodnoty.length === 0) {
      await panel.locator('label.vse input').check();
    } else {
      for (const box of await panel.locator('input[value]').all()) {
        const v = await box.getAttribute('value');
        if (hodnoty.includes(v) !== (await box.isChecked())) await box.click();
      }
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
  });
}
/** Texty voleb výběru víc hodnot (otevře a zavře panel; na telefonu i okno filtrů). */
async function volbyVyberu(page, aria, obal = '') {
  return vFiltrech(page, async () => {
    await page.locator(`${obal} button[aria-label="${aria}"]`.trim()).first().click();
    const texty = (await page.locator(`${obal} .vyber-vice-panel label`.trim()).allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
    return texty;
  });
}
/**
 * Přehled vedení úkol 11 (Albert 17. 11. 2026, rozložení filtrů): na telefonu (do 640 px) jsou filtry seznamů (osoba, stav,
 * známka, mlčí, čekání s koši, hvězda, odpověděl, řazení, „Co je potřeba“) v okně, které otevře tlačítko „Filtry (n)“; venku
 * zůstane segment, hledání a čipy zapnutých filtrů. otevriFiltry okno otevře, když je tlačítko vidět a okno zavřené (vrátí,
 * jestli ho otevřela); zavriFiltry ho zavře tlačítkem dole; vFiltrech udělá krok s otevřeným oknem a po sobě ho zavře. Na
 * počítači nedělají nic. ⚠ NAHRAZUJE klikání na filtry na telefonu přímo ve stránce (bloky U, F056, R057 a O060 na 390 px).
 */
async function otevriFiltry(page) {
  const tl = page.locator('button.filtr-telefon-btn').first();
  if ((await tl.count()) === 0 || !(await tl.isVisible())) return false;
  if ((await tl.getAttribute('aria-expanded')) === 'true') return false;
  await tl.click();
  await page.locator('.filtr-sheet').waitFor({ timeout: 4000 });
  return true;
}
async function zavriFiltry(page) {
  const hotovo = page.locator('.filtr-sheet button.filtr-sheet-hotovo');
  if ((await hotovo.count()) === 0) return;
  await hotovo.click();
  await page.locator('.filtr-sheet').waitFor({ state: 'detached', timeout: 4000 });
}
async function vFiltrech(page, krok) {
  const otevrela = await otevriFiltry(page);
  try {
    return await krok();
  } finally {
    if (otevrela) await zavriFiltry(page);
  }
}
/**
 * Přehled vedení úkol 10 (Albert 17. 11. 2026, D7): výběr lidí super admina (src/components/LidePicker.tsx) místo rozbalovacích
 * seznamů jednoho člověka (#person-picker, #user-select, #kalendar-kdo, #rozvrh-kdo; ⚠ NAHRAZUJE selectOption na nich).
 * vLidech(page, krok) otevře panel výběru (na telefonu v okně „Filtry“ panelu filtrů nebo ve vlastním okně), udělá krok a panel
 * zavře Escapem; jenClovek vybere jen jednoho člověka (tlačítko „jen“ u jeho řádku), predvolba klikne na předvolbu podle textu
 * („Já“, „Všichni“, „Bez volajícího“, „Tým Mikuláš“), lideText vrátí text tlačítka („Petra“, „Všichni (5)“).
 */
async function vLidech(page, krok) {
  return vFiltrech(page, async () => {
    await page.locator('button.lide-picker-btn').first().click();
    const panel = page.locator('.lide-picker-panel').first();
    await panel.waitFor({ timeout: 4000 });
    try {
      return await krok(panel);
    } finally {
      await page.keyboard.press('Escape');
      await panel.waitFor({ state: 'detached', timeout: 4000 });
    }
  });
}
const jenClovek = (page, uid) => vLidech(page, (panel) => panel.locator(`.lide-radek[data-user-id="${uid}"] button.lide-jen`).click());
const predvolba = (page, text) =>
  vLidech(page, (panel) => panel.locator('button.lide-predvolba', { hasText: new RegExp(`^${text}( \\(\\d+\\))?$`) }).click());
const lideText = async (page) => (await page.locator('button.lide-picker-btn .lide-picker-text').first().innerText()).replace(/\s+/g, ' ').trim();
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
  // ⚠ úkol 12 (Albert 17. 11. 2026, D5): signály neviditelného časovače práce (praceTep: karta do 1 s po zobrazení, tep
  // každých 60 s) chodí nezávisle na kartě, do „přepnutí nevolá server“ se nepočítají (NAHRAZUJE „žádné volání vůbec“)
  const po = (await volani(page)).slice(pred).filter((v) => v.fn !== 'praceTep');
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
  // ⚠ úkol 12: signály časovače práce (praceTep) se nepočítají, jako u V4a (NAHRAZUJE „žádné volání vůbec“)
  const po = (await volani(page)).slice(pred).filter((v) => v.fn !== 'praceTep');
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
// ⚠ Migrace 060 (Albert 1. 11. 2026): Označené ukazují i označení k zavolání a Albert má označeného architekta 303
// (Honzovo); scénář proto měří Petru: architektku 302 s příznakem a chaty s označením (93, 94). NAHRAZUJE scénář za Alberta.
{
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/oznacene', 500);
  const radek302 = page.locator('table tbody tr', { hasText: 'Jana Vzorová' });
  const ma302 = (await radek302.count()) === 1;
  over('L3a', ma302 && (await page.locator('table tbody tr').count()) >= 2, 'Petra má označenou architektku i chatu (jinak scénář nic neměří)');
  if (ma302) {
    // ⚠ migrace 061 (Albert 2. 11. 2026, kompaktní řádek): „Vyřešeno“ je přímo v řádku; NAHRAZUJE klik na řádek a tlačítko
    // v detailu (getByRole přes celou stránku by teď našlo dvě tlačítka Vyřešeno)
    await radek302.locator('button.vyreseno-btn').click();
    await klid(page, 300);
  }
  await filtr(page, 'architekti').click();
  await klid(page, 300);
  const h2 = await page.locator('.empty-state h2').innerText().catch(() => '');
  const text = await page.locator('.empty-state').innerText().catch(() => '');
  over('L3b', h2 !== '' && h2 !== 'Všechno je vyřešené', 'pod filtrem architekti se neříká „Všechno je vyřešené", když jsou označené chaty', h2);
  over('L3c', /architekt/i.test(text), 'prázdný stav říká, že jde o architekty', text.replace(/\s+/g, ' '));
  await filtr(page, 'chaty').click();
  await klid(page, 300);
  over('L3d', (await page.locator('table tbody tr').count()) >= 1, 'pod filtrem chaty jsou označené chaty vidět');
  await ctx.close();
}

/* ============ L4) Označené: pozdní odpověď pro jiného člověka nepřepíše výběr ============ */
{
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/oznacene', 500);
  await page.evaluate(() => {
    // ⚠ migrace 060: Označené jdou přes listOznacene (výběr člověka = user_id), NAHRAZUJE listFlagged s userId
    // ⚠ úkol 10 (17. 11. 2026): jeden vybraný člověk jde serveru jako výběr lidí (user_ids), NAHRAZUJE user_id
    globalThis.__volackaDemoTest.zpozdeni = (fn, args) => (fn === 'listOznacene' && JSON.stringify(args[0]?.user_ids) === '[2]' ? 1500 : 0);
  });
  await jenClovek(page, UID.petra);
  await page.waitForTimeout(120);
  await jenClovek(page, UID.honza);
  await klid(page, 500);
  const pozdni = (await volani(page)).find((v) => v.fn === 'listOznacene' && JSON.stringify(v.args[0]?.user_ids) === '[2]');
  over('L4a', !!pozdni && pozdni.ok, 'pomalá odpověď pro Petru dorazila (jinak scénář nic neměří)');
  over('L4b', (await lideText(page)) === 'Honza' &&
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
  over('R2', /Za týden 100 hovorů/.test(await page.locator('.rozvrh-uprava').innerText()), 'úprava počítá cíl za týden (4 h + 1 h = 100 hovorů, 20 za hodinu od migrace 065)');
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
  const vyber = (await page.locator('button.lide-picker-btn').count()) > 0;
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
  // ⚠ migrace 060: stav ve výběru víc hodnot (NAHRAZUJE volby rozbalovacího seznamu)
  const moznosti = await volbyVyberu(page, 'Filtr statusu');
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
  // ⚠ migrace 060 (Albert 1. 11. 2026): přibyl sloupec Mlčí (označení a pracovní dny), u cizího kontaktu taky pomlčka (6, NAHRAZUJE 5)
  over(`U2 ${kdo} ${sirka}`, superAdmin ? pomlcky === 0 && odznak.some((o) => /Mají zájem/.test(o)) : pomlcky === 6 && !odznak.some((o) => /Mají zájem/.test(o)),
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
  await vyber(page, 'Filtr statusu', [stavF ?? 'zajem']);
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
/**
 * Výsledky okna „Zavolal/a jsem“ v pořadí okna (⚠ migrace 062, Albert 2. 11. 2026, A1: šestý „Chce web“; NAHRAZUJE pět
 * výsledků 061 v e2e O60e a O61b).
 */
const VOLBY_062 = ['Nedovolal/a jsem se', 'Chce web', 'Mluvili jsme – co klient chce', 'Nechce web', 'Nechce, abychom ho kontaktovali', 'Nic z toho výše'];
/** Stavy, ve kterých řádek bez označení „Zavolal/a jsem“ nemá (DOVOLANI_NE v src/ui.tsx), jejich popisky. */
const BEZ_DOVOLANI_062 = ['Nekontaktováno', 'Nedovoláno', 'Nekontaktovat', 'Nerelevantní', 'Odmítnuto', 'Nabídnuta sleva'];
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
    over(`K1 ${sirka}`, (await page.locator('.lide-picker').count()) === 0 && (await polozky.count()) === moje.length && moje.length >= 3,
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
      // ⚠ migrace 062 (Albert 2. 11. 2026): Hotovo u klienta mimo frontu, kterému jde dovolání zapsat, otevře okno „Zavolal/a jsem“
      // (NAHRAZUJE okno „Hovor je hotový?“ s textem; to zůstává u klienta, kterému dovolání zapsat nejde, blok O062i)
      await p9.getByRole('button', { name: 'Hotovo' }).click();
      const okno9 = page.locator('.dovolani-okno');
      await okno9.waitFor(KRATKE);
      await okno9.getByRole('radio', { name: 'Mluvili jsme – co klient chce' }).click();
      await okno9.locator('#dovolani-text').fill('domluveno, zaplatí do pátku');
      await okno9.getByRole('button', { name: 'Zapsat hovor' }).click();
      await klid(page, 700);
      const h9 = (await volani(page)).find((v) => v.fn === 'zapisHovor' && v.ok);
      const z9po = (await stav(page)).zavolat.find((z) => z.id === z9?.id);
      over('K6b', z9po?.stav === 'hotovo' && /^dovolání: mluvili/.test(z9po?.vysledek ?? '') && JSON.stringify(h9?.args.slice(0, 3)) === JSON.stringify([9, 'mluvili', 'domluveno, zaplatí do pátku']),
        'Hotovo zapíše dovolání s poznámkou a hovor uzavře (062)', JSON.stringify({ z9po, args: h9?.args }));
      await page.getByRole('button', { name: /Ukázat hotové a zrušené/ }).click();
      over('K7', (await page.locator('.zavolat-polozka.uzavrena').count()) >= 3 && /dovolání: mluvili/.test(await page.locator('.zavolat-oddil.uzavrene').innerText()),
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
  // ⚠ úkol 10: výběr lidí (předvolby Já, Můj tým, Všichni, tým každého super admina a lidé po týmech), NAHRAZUJE #kalendar-kdo
  const moznosti = await vLidech(page, async (panel) => ({
    predvolby: (await panel.locator('button.lide-predvolba').allInnerTexts()).map(txt),
    lide: (await panel.locator('.lide-jmeno').allInnerTexts()).map(txt),
  }));
  over('K9', (await lideText(page)) === 'Já' && JSON.stringify(moznosti.predvolby) === JSON.stringify(['Já', 'Můj tým (2)', 'Všichni (5)', 'Tým Albert (3)'])
    && moznosti.lide.includes('Petra') && moznosti.lide.includes('Mikuláš (já)'),
    'super admin: výběr Já / Můj tým / Všichni / Tým Albert a kdokoli z lidí', JSON.stringify(moznosti));
  over('K9b', /Zatím nemáš naplánované hovory/.test(await page.evaluate(() => document.body.innerText)), 'svůj kalendář má prázdný s nápovědou, jak hovor naplánovat');
  await jenClovek(page, UID.petra);
  await klid(page, 500);
  const st = await stav(page);
  const petriny = st.zavolat.filter((z) => z.user_id === UID.petra && z.stav === 'ceka');
  const polozky = page.locator('.zavolat-polozka:not(.uzavrena)');
  over('K10', (await polozky.count()) === petriny.length && /volá Petra/.test(await polozky.first().innerText())
    && (await page.getByRole('button', { name: 'Zavolat teď' }).count()) === 0 && (await page.getByRole('button', { name: 'Přesunout' }).count()) === petriny.length,
    'Petřin kalendář: její hovory, kdo volá, super admin přesouvá a ruší, „Zavolat teď“ jen ten, kdo má volat', `${await polozky.count()} / ${petriny.length}`);
  await predvolba(page, 'Všichni');
  await klid(page, 500);
  const text = await page.evaluate(() => document.body.innerText);
  const vs = (await volani(page)).filter((v) => v.fn === 'zavolatSeznam').map((v) => v.args);
  // ⚠ úkol 10: Petra sama jde serveru jako výběr lidí (args[3] = user_ids), Všichni jako dřív p_vsichni
  over('K11', /Srub U Potoka/.test(text) && /Chalupa Na Paloučku/.test(text) && /volá Honza/.test(text) && vs.some((a) => a[1] === true)
    && vs.some((a) => JSON.stringify(a[3]) === JSON.stringify([UID.petra])),
    'Všichni: hovory Petry i Honzy', JSON.stringify(vs));
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
  await jenClovek(page, UID.petra);
  await klid(page, 600);
  over('E7', (await celkem()) === '3 570 Kč' && (await volani(page)).some((v) => v.fn === 'statistikyVolani' && v.args[0] === UID.petra), 'super admin vidí výdělek Petry', await celkem());
  await jenClovek(page, UID.honza);
  await klid(page, 600);
  const t = txt(await page.evaluate(() => document.body.innerText));
  over('E8', (await celkem()) === '1 050 Kč' && (await page.locator('.vydelek-nejasne').count()) === 1 && /cena nejde přečíst/.test(t) && (await page.locator('.vydelek-sleva').count()) === 1
    && /3 500 Kč/.test(t), 'Honza: sleva (3 500 Kč) se počítá, nejasná cena ne a appka to řekne', t.slice(t.indexOf('Vyděláno'), t.indexOf('Vyděláno') + 300));
  await jenClovek(page, UID.eva);
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

/* ============ ZV) Zájem podle volajících ve Statistikách (migrace 069, Albert 15. 11. 2026) ============ */
// Albert: „how many interested people we have for each [caller] … responded to the preview and said they want it or just
// responded and seemed interested in it“. Super admin vidí tabulku (čísla = pravidla serveru 069 nad daty DEMO, počítaná
// tady nezávisle), filtr segmentu ji přepočítá, v pohledu jednoho dne není; Volající ji nevidí a appka se na ni ani neptá;
// na telefonu bez vodorovného posunu.
const PRODANO_ZV = ['schvaleno', 'faktura_odeslana', 'zaplaceno', 'domena_pripojena', 'hotovo'];
const MIMO_068_ZV = ['odmitnuto', 'nekontaktovat', 'nerelevantni', 'sleva_nabidnuta', 'bez_odpovedi', ...PRODANO_ZV];
/** Očekávané řádky tabulky jako text („Jméno chce odpověděl zájem čeká“), pak bez volajícího a Celkem. */
function ocekZajem(kontakty, segment) {
  const podle = new Map();
  for (const c of kontakty) {
    if (segment && c.segment !== segment) continue;
    const chce = PRODANO_ZV.includes(c.status);
    const odp = !!c.last_client_reply_at && !MIMO_068_ZV.includes(c.status);
    const ceka = c.status === 'navrh_odeslan' && !c.last_client_reply_at;
    if (!chce && !odp && !ceka) continue;
    const k = c.last_caller ?? null;
    const p = podle.get(k) ?? [0, 0, 0, 0];
    p[0] += chce ? 1 : 0;
    p[1] += odp ? 1 : 0;
    p[3] += ceka ? 1 : 0;
    p[2] = p[0] + p[1];
    podle.set(k, p);
  }
  const radky = [...podle.entries()].filter(([k]) => k !== null)
    .sort((a, b) => b[1][2] - a[1][2] || b[1][0] - a[1][0] || b[1][3] - a[1][3] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, p]) => `${k} ${p.join(' ')}`);
  const bez = podle.get(null);
  if (bez && bez[2] + bez[3] > 0) radky.push(`bez volajícího ${bez.join(' ')}`);
  const celkem = [0, 0, 0, 0];
  for (const p of podle.values()) for (let i = 0; i < 4; i++) celkem[i] += p[i];
  radky.push(`Celkem ${celkem.join(' ')}`);
  return radky;
}
// innerText dá buňky oddělené tabulátorem (textContent by je slepil); hlavička je velkými písmeny (CSS), proto ta textContent
const radkyZajmu = async (page) => (await page.locator('.zajem-volajici table.zajem-tabulka tbody tr, .zajem-volajici table.zajem-tabulka tfoot tr').allInnerTexts()).map(txt);
await blok050('ZV mikulas', async () => {
  const { ctx, page } = await novaStranka('mikulas');
  await jdi(page, '#/stats', 900);
  const hlavicky = (await page.locator('.zajem-volajici table.zajem-tabulka thead th').allTextContents()).map(txt);
  over('ZV1', JSON.stringify(hlavicky) === JSON.stringify(['Volající', 'Chce web', 'Odpověděl', 'Zájem celkem', 'Čeká na odpověď']),
    'super admin: tabulka Zájem podle volajících se sloupci chce web, odpověděl, zájem celkem a čeká na odpověď', hlavicky.join(' | '));
  const vse = await radkyZajmu(page);
  const ocV = ocekZajem((await stav(page)).kontakty, null);
  over('ZV2', JSON.stringify(vse) === JSON.stringify(ocV) && vse.length >= 4,
    'řádky volajících v pořadí serveru, bez volajícího a celkem = pravidla 069 nad daty DEMO', `${vse.join(' | ')} / ${ocV.join(' | ')}`);
  const pill = txt(await page.locator('.zajem-volajici h2 .count-pill').innerText(KRATKE).catch(() => ''));
  over('ZV2b', pill === ocV[ocV.length - 1].split(' ')[3], 'odznak u nadpisu = zájem celkem', `${pill} / ${ocV[ocV.length - 1]}`);
  await page.locator('.zajem-volajici .segment-filter').getByRole('button', { name: 'architekti', exact: true }).click();
  await klid(page, 500);
  const arch = await radkyZajmu(page);
  const ocA = ocekZajem((await stav(page)).kontakty, 'architekt');
  const vsZ = (await volani(page)).filter((v) => v.fn === 'zajemPodleVolajicich');
  over('ZV3', JSON.stringify(arch) === JSON.stringify(ocA) && vsZ.some((v) => v.args[0] === 'architekt'),
    'filtr architekti: tabulka jen z architektů (server dostal segment)', `${arch.join(' | ')} / ${ocA.join(' | ')}`);
  await page.selectOption('#obdobi-select', 'den');
  await klid(page, 600);
  const t = txt(await page.evaluate(() => document.body.innerText));
  over('ZV4', (await page.locator('.zajem-volajici').count()) === 0 && /zájem podle volajících a klienti podle stavu jsou jen v pohledu Celkem/.test(t),
    'v pohledu jednoho dne tabulka není a stránka řekne proč');
  await ctx.close();
});
await blok050('ZV petra', async () => {
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/stats', 900);
  over('ZV5', (await page.locator('.zajem-volajici').count()) === 0 && !(await volani(page)).some((v) => v.fn === 'zajemPodleVolajicich'),
    'Volající tabulku nevidí a appka se na ni ani neptá (045)');
  await ctx.close();
});
// telefon: řádky o dvou řádcích (jméno, pod ním čtyři čísla s popiskem), nic se neposouvá do strany ani v rámečku tabulky
// (Albert 2. 11. 2026, migrace 061); 390 px a 320 px, změřeno 15. 11. 2026: tabulka o pěti sloupcích přetékala o 21 a 56 px
for (const sirka of [390, 320]) {
  await blok050(`ZV ${sirka}`, async () => {
    const { ctx, page } = await novaStranka('mikulas', { sirka, vyska: 844 });
    await jdi(page, '#/stats', 900);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    const tab = await page.locator('.zajem-volajici table.zajem-tabulka').evaluate((e) => ({ s: e.scrollWidth, c: e.parentElement.clientWidth })).catch(() => null);
    over(`ZV6 ${sirka}`, w <= sirka && !!tab && tab.s <= tab.c + 1, `tabulka zájmu se na telefonu (${sirka} px) vejde bez vodorovného posunu`,
      `stránka ${w}, tabulka ${JSON.stringify(tab)}`);
    const popisky = await page.locator('.zajem-volajici table.zajem-tabulka tbody td').evaluateAll((tds) =>
      tds.map((td) => getComputedStyle(td, '::before').content));
    const hlavicka = await page.locator('.zajem-volajici table.zajem-tabulka thead').evaluate((e) => e.getBoundingClientRect().height);
    over(`ZV7 ${sirka}`, popisky.length >= 4 && popisky.every((c) => /Chce web|Odpověděl|Zájem celkem|Čeká na odpověď/.test(c)) && hlavicka <= 1,
      `telefon (${sirka} px): u každého čísla popisek, hlavička tabulky jen pro čtečky`, `${popisky.slice(0, 4).join(' | ')}; hlavička ${hlavicka}`);
    await ctx.close();
  });
}

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
  await jenClovek(page, UID.honza);
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
    await jenClovek(page, UID.petra);
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
    // ⚠ úkol 11: na telefonu je výběr člověka, čekání, koše a řazení v okně „Filtry (n)“ (vFiltrech)
    await jenClovek(page, UID.petra);
    await klid(page, 700);
    const f = (aria) => page.locator(`.moji-filtry select[aria-label="${aria}"]`);
    // ⚠ migrace 060: stav a známka jsou výběr víc hodnot (tlačítko se stejným aria-label), NAHRAZUJE dva rozbalovací seznamy
    const v = (aria) => page.locator(`.moji-filtry button[aria-label="${aria}"]`);
    const f56a = await vFiltrech(page, async () => (await v('Filtr statusu').count()) === 1 && (await v('Filtr známky').count()) === 1
      && (await f('Filtr čekání na odpověď').count()) === 1 && (await f('Řazení').count()) === 1);
    over(`F56a ${sirka}`, f56a && (await page.locator('.moji-filtry .search-input').count()) === 1, 'super admin má v Moji klienti filtry jako Kontakty');
    const s = await stav(page);
    const klienti = s.kontakty.filter((k) => k.last_caller === 'Petra' || s.callLog.some((l) => l.user_id === UID.petra && l.kontakt_id === k.id));
    const radky = page.locator('table.kontakty tbody tr');
    over(`F56b ${sirka}`, (await radky.count()) === klienti.length, 'bez filtru všichni klienti Petry', `${await radky.count()} / ${klienti.length}`);
    const nedov = klienti.filter((k) => k.status === 'nedovolano').length;
    await vyber(page, 'Filtr statusu', ['nedovolano'], '.moji-filtry');
    await klid(page, 600);
    const volba = (await volbyVyberu(page, 'Filtr statusu', '.moji-filtry')).find((x) => x.startsWith('Nedovoláno')) ?? '';
    const pill = await page.locator('h1 .count-pill').innerText().catch(() => '');
    const seznam = () => volani(page).then((vs) => vs.filter((v) => v.fn === 'myKontakty' && v.args[0] === 2000).pop());
    const posledni = await seznam();
    over(`F56c ${sirka}`, nedov > 0 && (await radky.count()) === nedov && pill === String(nedov) && volba.endsWith(`(${nedov})`)
      // ⚠ úkol 10: Petra jde serveru jako výběr lidí (user_ids), NAHRAZUJE p_user_id (args[2])
      && posledni?.args[4]?.status === 'nedovolano' && posledni?.args[2] === null && JSON.stringify(posledni?.args[4]?.user_ids) === JSON.stringify([UID.petra]),
      'filtr stavu: jen nedovolaní klienti Petry, počet v nadpisu i u volby, filtr jde na server', `${await radky.count()} / ${nedov} / ${volba} / ${JSON.stringify(posledni?.args)}`);
    await vyber(page, 'Filtr statusu', [], '.moji-filtry');
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
    await vFiltrech(page, () => f('Filtr čekání na odpověď').selectOption('ceka_prvni'));
    await klid(page, 600);
    const cek = await seznam();
    const kose = await vFiltrech(page, () => page.locator('.moji-kose button').count());
    over(`F56e ${sirka}`, kose === 5 && cek?.args[4]?.cekani === 'ceka_prvni' && cek?.args[4]?.kos === 'k_zavolani',
      'filtr čekání zapne koš „k zavolání“ a koše jako Kontakty', JSON.stringify(cek?.args[4]));
    await vFiltrech(page, () => f('Filtr čekání na odpověď').selectOption(''));
    await klid(page, 600);
    // řazení podle poslední změny: kontakt upravený teď je od nejnovější první, od nejstarší poslední
    await vFiltrech(page, () => f('Řazení').selectOption('zmena_nejnovejsi'));
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
    await vFiltrech(page, () => f('Řazení').selectOption('zmena_nejstarsi'));
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
// ⚠ Migrace 060 (Albert 1. 11. 2026: „Callers get ALL filters in Moji klienti too … but only over their own clients“)
// NAHRAZUJE F56i „Volající v Moji klienti beze změny: bez filtrů a řazení“: má stejný řádek filtrů a jde na server.
await blok050('F056 petra', async () => {
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/moji', 700);
  const pred = (await volani(page)).length;
  over('F56i', (await page.locator('.moji-filtry').count()) === 1 && (await page.locator('.moji-filtry select[aria-label="Řazení"]').count()) === 1
    && (await page.locator('.moji-filtry button[aria-label="Filtr statusu"]').count()) === 1 && (await page.locator('.moji-filtry button[aria-label="Jen s hvězdou"]').count()) === 1,
    'Volající má v Moji klienti stejné filtry a řazení jako super admin');
  await vyber(page, 'Filtr statusu', ['navrh_odeslan', 'ceka_na_klienta'], '.moji-filtry');
  await klid(page, 600);
  const posl = (await volani(page)).slice(pred).filter((x) => x.fn === 'myKontakty').pop();
  const radky = page.locator('table.kontakty tbody tr');
  const s = await stav(page);
  const moje = s.kontakty.filter((k) => (k.last_caller === 'Petra' || s.callLog.some((l) => l.user_id === UID.petra && l.kontakt_id === k.id))
    && ['navrh_odeslan', 'ceka_na_klienta'].includes(k.status));
  over('F56j', JSON.stringify(posl?.args[4]?.statusy) === JSON.stringify(['navrh_odeslan', 'ceka_na_klienta']) && (await radky.count()) === moje.length && moje.length >= 3,
    'Volající: dva stavy najednou jdou na server (p_statusy) a vrátí jen jeho klienty v těch stavech', `${await radky.count()} / ${moje.length}`);
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
  // ⚠ migrace 062: buňka stavu se hledá podle hlavičky (za telefonem přibyla buňka akcí „Zavolal/a jsem“; NAHRAZUJE td:nth-child(3))
  const iStav = (await page.locator('table.kontakty thead th').evaluateAll((t) => t.map((x) => x.textContent.trim()))).indexOf('Status');
  const skryte = await page.locator('table.kontakty tbody tr').evaluateAll((rs, j) => rs.map((r) => r.children[j]?.querySelector('.skryto') !== null), iStav);
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
    // ⚠ úkol 11: na telefonu je řazení v okně „Filtry (n)“ (vFiltrech)
    const volby = await vFiltrech(page, () => sel.locator('option').evaluateAll((os) => os.map((o) => o.value)));
    const hl = await sloupce(page);
    // ⚠ migrace 060: i mlceni a hvezda (šest řazení, NAHRAZUJE čtyři)
    over(`R57a ${sirka}`, JSON.stringify(volby) === JSON.stringify(['', 'zmena_nejnovejsi', 'zmena_nejstarsi', 'hovor_nejnovejsi', 'hovor_nejstarsi', 'mlceni', 'hvezda'])
      && hl.includes('Změněno') && hl.includes('Poslední hovor'), 'Kontakty: šest řazení a sloupec Poslední hovor', JSON.stringify({ volby, hl }));
    // od nejnovější změny: první je kontakt s nejpozdější poslední změnou (prodej z tohoto týdne, stav změnila automatizace,
    // appka ho naposledy upravila před 5 dny) a Změněno ukazuje poslední změnu, ne updated_at
    await vFiltrech(page, () => sel.selectOption('zmena_nejnovejsi'));
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
    await vFiltrech(page, () => sel.selectOption('hovor_nejnovejsi'));
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
    await jenClovek(page, UID.petra);
    await klid(page, 700);
    const hlM = await sloupce(page);
    const k2 = s.kontakty.find((k) => k.id === 2);
    const radek2 = page.locator('table.kontakty tbody tr', { hasText: k2.name }).first();
    const b2 = txt(await radek2.locator('td').nth(hlM.indexOf('Poslední hovor')).innerText());
    const volbyM = await vFiltrech(page, () => page.locator('.moji-filtry select[aria-label="Řazení"] option').evaluateAll((os) => os.map((o) => o.value)));
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
  // ⚠ migrace 062: buňka stavu podle hlavičky (NAHRAZUJE td:nth-child(3), za telefonem přibyla buňka akcí)
  const iStav = hl.indexOf('Status');
  const skryte = await page.locator('table.kontakty tbody tr').evaluateAll((rs, [j, s]) => rs.map((r) => [r.children[s]?.querySelector('.skryto') !== null,
    r.children[j]?.querySelector('.skryto') !== null]), [iHov, iStav]);
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
  // ⚠ migrace 060 (Albert 1. 11. 2026): Volající má v Moji klienti i řazení (NAHRAZUJE „výběr řazení nemá“)
  over('R57g', hlM.includes('Můj poslední hovor') && b2m === b2 && (await page.locator('.moji-filtry select[aria-label="Řazení"]').count()) === 1,
    'Volající v Moji klienti: „Můj poslední hovor“ jen z jeho hovorů a řazení má', JSON.stringify({ hlM, b2m }));
  await ctx.close();
});

/* ============ 060 (Albert 1. 11. 2026): Označené s označením k zavolání, okno Zavolal/a jsem, hvězda, přehled, filtry ============ */
// Klient, který víc než 5 pracovních dní neodpověděl, je v Označených pro SVÉHO volajícího; „Zavolal/a jsem“ má výsledky
// a hvězdu; zápis nejde do call_log; lhůta „Lhůta na zavolání do …“ bez slibu e-mailu. Volající vidí jen svoje
// označení (96 je Petřin klient, ale označení je Honzovo), super admin všechna, „bez volajícího“ a „Zrušit označení“.
// ⚠ Migrace 061 (Albert 2. 11. 2026) NAHRAZUJE „čtyři výsledky“ (O60e: pět, pátý „Nic z toho výše“) a O60k (posun stránky
// jen na dvou šířkách; měří ho celý blok O61a bez posunu stránky i rámečku na sedmi šířkách).
for (const sirka of [1280, 390]) {
  await blok050(`O060 petra ${sirka}`, async () => {
    const { ctx, page } = await novaStranka('petra', { sirka, vyska: sirka < 768 ? 844 : 900 });
    await jdi(page, '#/oznacene', 700);
    const radky = page.locator('table.kontakty tbody tr');
    const jmena = await radky.evaluateAll((rs) => rs.map((r) => r.children[0]?.textContent ?? ''));
    // textContent: innerText hlavičky je velkými písmeny (text-transform)
    const hlavicka = await page.locator('table.kontakty thead th').allTextContents();
    over(`O60a ${sirka}`, /U Rybníka/.test(jmena[0] ?? '') && jmena.some((j) => /Na Kopci/.test(j)) && jmena.some((j) => /Vzorová/.test(j))
      && !jmena.some((j) => /Na Samotě/.test(j)) && !hlavicka.some((h) => /Volající/.test(h)) && hlavicka.some((h) => /Lhůta/.test(h)),
      'Petra: svoje označení (93 s hvězdou první, 94) a klient s příznakem (302); Honzovo označení 96 ne; bez sloupce Volající', JSON.stringify(jmena));
    const lhuta = txt(await radky.first().locator('.lhuta-cell').innerText());
    over(`O60b ${sirka}`, /^Lhůta na zavolání do \d{1,2}\. \d{1,2}\. \d{4}/.test(lhuta) && !/E-mail mu půjde|Připomínka e-mailem/.test(await page.locator('body').innerText()),
      'lhůta: „Lhůta na zavolání do …“, bez slibu e-mailu (připomínku řídí přepínač, odeslanou ukáže řádek pod lhůtou)', lhuta);
    // ⚠ úkol 11: na telefonu jsou pilulky „Co je potřeba“ i „jen s hvězdou“ v okně „Filtry (n)“ (vFiltrech)
    const pilulky = (await vFiltrech(page, () => page.locator('.oznacene-druhy button').allInnerTexts())).map(txt);
    over(`O60c ${sirka}`, pilulky.includes('Neodpověděl na návrh (1)') && pilulky.includes('Neodpověděl na změny (1)') && pilulky.some((p) => /^Chybí e-mail \(1\)$/.test(p)),
      'pilulky druhů s počty (označení i příznaky)', pilulky.join(' | '));
    await vFiltrech(page, () => page.locator('.oznacene-druhy button', { hasText: 'Neodpověděl na změny' }).click());
    await page.waitForTimeout(150);
    over(`O60d ${sirka}`, (await radky.count()) === 1 && /Na Kopci/.test(await radky.first().innerText()), 'pilulka „Neodpověděl na změny“ nechá jen 94');
    await vFiltrech(page, () => page.locator('.oznacene-druhy button', { hasText: /^Vše/ }).click());
    await page.waitForTimeout(150);
    // okno Zavolal/a jsem u 93: pět výsledků (061), „Mluvili jsme“ chce text, hvězda je zaškrtnutá (93 hvězdu má)
    const s0 = await stav(page);
    await radky.first().locator('button.zavolal-btn').click();
    const okno = page.locator('.dovolani-okno');
    await okno.waitFor({ timeout: 4000 });
    const volby = (await okno.locator('.dovolani-volby button').allInnerTexts()).map(txt);
    over(`O60e ${sirka}`, JSON.stringify(volby) === JSON.stringify(VOLBY_062)
      && /Lhůta na zavolání do/.test(await okno.innerText()), 'okno Zavolal/a jsem: šest výsledků (062: Chce web; 061: Nic z toho výše) a lhůta', volby.join(' | '));
    await okno.getByRole('radio', { name: 'Mluvili jsme – co klient chce' }).click();
    const zapsat = okno.getByRole('button', { name: 'Zapsat hovor' });
    const hvezdaBox = okno.locator('.dovolani-hvezda input');
    over(`O60f ${sirka}`, (await zapsat.isDisabled()) && (await hvezdaBox.isChecked()), 'bez textu „Mluvili jsme“ nejde zapsat; hvězda zaškrtnutá, když ji klient má');
    await okno.locator('textarea').fill('web se líbí, chce víc fotek z okolí');
    await zapsat.click();
    await klid(page, 600);
    const s1 = await stav(page);
    const k93 = s1.kontakty.find((k) => k.id === 93);
    over(`O60g ${sirka}`, (await page.locator('.dovolani-okno').count()) === 0 && /je zapsaný/.test(await page.locator('.dovolani-info').innerText())
      && s1.callLog.length === s0.callLog.length && /Dovolání: web se líbí, chce víc fotek z okolí$/.test(k93.note ?? '') && !!k93.hvezda_at
      && !s1.oznaceni.some((o) => o.kontakt_id === 93 && o.uzavreno_at === null) && !(await radky.allInnerTexts()).some((r) => /U Rybníka/.test(r)),
      'zápis „Mluvili jsme“: poznámka, označení uzavřené, řádek zmizí, call_log beze změny, hvězda zůstala');
    // detail 94: přehled s označením, lhůtou, textem automatizace a tlačítkem Zavolal/a jsem; hvězda hned bez Uložit
    // (migrace 061: detail otevře jméno, prostředek kompaktního řádku může být na telefonu tlačítko nebo číslo k vytočení)
    await page.locator('table.kontakty tbody tr', { hasText: 'Na Kopci' }).first().locator('.kompakt-jmeno').click();
    await klid(page, 500);
    const panel = page.locator('.drawer .prehled-panel');
    const textPanelu = txt(await panel.innerText().catch(() => ''));
    over(`O60h ${sirka}`, /Neodpověděl na změny/.test(textPanelu) && /Lhůta na zavolání do/.test(textPanelu) && /Teď a další krok/.test(textPanelu)
      && /Co klient chce \/ napsal/.test(textPanelu) && (await panel.locator('button.zavolal-btn').count()) === 1 && (await panel.locator('button.zrusit-ozn-btn').count()) === 0,
      'detail: přehled s označením, lhůtou, textem automatizace a „Zavolal/a jsem“ (Zrušit jen super admin)', textPanelu.slice(0, 200));
    const prepinac = page.locator('.drawer .hvezda-detail button.hvezda-prepinac');
    const predH = await prepinac.getAttribute('aria-pressed');
    await prepinac.click();
    await klid(page, 400);
    const k94 = (await stav(page)).kontakty.find((k) => k.id === 94);
    over(`O60i ${sirka}`, predH === 'false' && (await prepinac.getAttribute('aria-pressed')) === 'true' && k94.hvezda_kdo === 'Petra'
      && !(await volani(page)).some((v) => v.fn === 'updateKontakt'), 'hvězda v detailu hned (nastav_hvezdu), bez „Uložit změny“');
    await page.locator('.drawer-close').click();
    await klid(page, 300);
    // filtr jen s hvězdou: 94 (93 je po dovolání pryč, hvězda zůstala, ale označení ani příznak nemá)
    await vFiltrech(page, () => page.locator('button[aria-label="Jen s hvězdou"]').click());
    await klid(page, 600);
    const sHvezdou = await radky.allInnerTexts();
    over(`O60j ${sirka}`, sHvezdou.length === 1 && /Na Kopci/.test(sHvezdou[0]), 'jen s hvězdou: 94', sHvezdou.map((r) => r.slice(0, 40)).join(' | '));
    // ⚠ O60k (stránka bez vodorovného posunu, tabulka se posouvá v rámečku) NAHRADIL blok O61a (migrace 061)
    await ctx.close();
  });
}
await blok050('O060 mikulas', async () => {
  const { ctx, page } = await novaStranka('mikulas');
  await jdi(page, '#/oznacene', 700);
  const hlavicka = await page.locator('table.kontakty thead th').allTextContents();
  const radky = page.locator('table.kontakty tbody tr');
  const r96 = page.locator('table.kontakty tbody tr', { hasText: 'Na Samotě' }).first();
  over('O60l', hlavicka.some((h) => /Volající/.test(h)) && (await r96.count()) === 1 && /Honza/.test(await r96.innerText())
    && (await r96.locator('button.zrusit-ozn-btn').count()) === 1, 'super admin: všechna označení, sloupec Volající, Zrušit označení');
  await predvolba(page, 'Bez volajícího');
  await klid(page, 600);
  const bez = (await radky.allInnerTexts()).map((r) => r.slice(0, 30));
  const v = (await volani(page)).filter((x) => x.fn === 'listOznacene').pop();
  over('O60m', v?.args[0]?.bez_volajiciho === true && bez.length >= 3 && bez.some((r) => /Tichá/.test(r)) && bez.some((r) => /U Kašny/.test(r)) && !bez.some((r) => /Na Samotě/.test(r)),
    '„Bez volajícího“: jen označení bez vlastníka (90, 91, 92)', bez.join(' | '));
  // zrušit označení s důvodem
  await page.locator('table.kontakty tbody tr', { hasText: 'Tichá' }).first().locator('button.zrusit-ozn-btn').click();
  const okno = page.locator('.modal', { hasText: 'Zrušit označení' });
  await okno.waitFor({ timeout: 4000 });
  over('O60n', await okno.getByRole('button', { name: 'Zrušit označení' }).isDisabled(), 'bez důvodu nejde zrušit');
  await okno.locator('textarea').fill('Majitel chatu prodal.');
  await okno.getByRole('button', { name: 'Zrušit označení' }).click();
  await klid(page, 600);
  const s = await stav(page);
  over('O60o', s.oznaceni.some((o) => o.kontakt_id === 90 && o.uzavreno_duvod === 'rucne') && !(await radky.allInnerTexts()).some((r) => /Tichá/.test(r)),
    'zrušené označení zmizí (uzavřené ručně)');
  await ctx.close();
});
await blok050('O060 kontakty petra', async () => {
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/admin', 700);
  const radky = page.locator('table.kontakty tbody tr');
  const r3 = page.locator('table.kontakty tbody tr', { hasText: 'Vysočina' }).first();
  const r93 = page.locator('table.kontakty tbody tr', { hasText: 'U Rybníka' }).first();
  over('O60p', (await r3.locator('.hvezda-prepinac').count()) === 0 && (await r3.locator('.mlci-cell .skryto').count()) === 1
    && (await r93.locator('.hvezda-prepinac').count()) === 1 && /Neodpověděl na návrh/.test(await r93.locator('.mlci-cell').innerText())
    && /prac\. d/.test(await r93.locator('.mlci-cell').innerText()),
    'Kontakty: u cizího kontaktu bez hvězdy a Mlčí jako pomlčka; u svého hvězda, označení a pracovní dny');
  await vyber(page, 'Filtr označení', ['navrh']);
  await klid(page, 700);
  const s = await stav(page);
  const ozn = s.oznaceni.filter((o) => o.uzavreno_at === null && o.volajici_id === UID.petra && o.kategorie === 'navrh').map((o) => o.kontakt_id);
  const jmena = await radky.allInnerTexts();
  const v = (await volani(page)).filter((x) => x.fn === 'listKontakty' && x.args[0]?.limit === 50).pop();
  over('O60q', jmena.length === ozn.length && ozn.length >= 1 && !jmena.some((j) => /Na Samotě/.test(j)) && JSON.stringify(v?.args[0]?.kategorie) === '["navrh"]',
    'Volající: filtr „Neodpověděl na návrh“ jen jeho označení (96 Honzovo ne), jde na server', `${jmena.length} / ${ozn.join()}`);
  // ⚠ úkol 11 (Albert 17. 11. 2026): „Zrušit vše“ v řadě čipů NAHRAZUJE „Zrušit filtry“; předvolby mlčení jsou v rozbalovacím
  // výběru „Mlčí“ (tlačítko aria-label „Filtr mlčení“) jako stav a známka, NAHRAZUJE předvolby přímo v řádku filtrů
  await page.getByRole('button', { name: 'Zrušit vše', exact: true }).click();
  await klid(page, 600);
  await page.locator('button[aria-label="Filtr mlčení"]').click();
  await page.locator('button.mlci-predvolba', { hasText: '10+' }).click();
  await page.keyboard.press('Escape');
  await klid(page, 700);
  const v2 = (await volani(page)).filter((x) => x.fn === 'listKontakty' && x.args[0]?.limit === 50).pop();
  over('O60r', v2?.args[0]?.mlci_min === 10 && (await radky.allInnerTexts()).every((r) => !/—\s*$/.test(r)), 'předvolba 10+: mlčí aspoň 10 pracovních dní, jde na server');
  await ctx.close();
});
await blok050('O060 volani', async () => {
  // hvězda ve formuláři zájmu: dá se až po uloženém zájmu, jiný obrázek než „Mají zájem“
  const { ctx, page } = await novaStranka('eva');
  await jdi(page, '#/call', 900);
  const id = await kartaId(page);
  if (!id) { over('O60s', false, 've frontě není karta, nejde změřit'); await ctx.close(); return; }
  await page.getByRole('button', { name: 'Mají zájem' }).click();
  await page.locator('.zajem-form .segmented button', { hasText: /^A$/ }).click();
  await page.locator('.zajem-hvezda input').check();
  await page.getByRole('button', { name: 'Uložit a další' }).click();
  await klid(page, 700);
  const vs = await volani(page);
  const iResolve = vs.findIndex((x) => x.fn === 'resolveCall' && x.args[0]?.kontakt_id === id && x.ok);
  const iHvezda = vs.findIndex((x) => x.fn === 'nastavHvezdu' && x.args[0] === id && x.args[1] === true && x.ok);
  const k = (await stav(page)).kontakty.find((x) => x.id === id);
  over('O60s', iResolve >= 0 && iHvezda > iResolve && k.status === 'zajem' && k.hvezda_kdo === 'Eva',
    've volání: hvězda po uloženém zájmu (nastav_hvezdu za resolve_call), kontakt ji má', JSON.stringify({ iResolve, iHvezda, kdo: k?.hvezda_kdo }));
  await ctx.close();
});

/* ============ 061 (Albert 2. 11. 2026): kompaktní seznamy, okno Zavolal/a jsem s pěti výsledky a poznámkou, „Vyřešeno“ v řádku,
   „Údaje z internetu“ jen super adminům ============ */
// „make it a little bit more compact … or just fits into the screen without sliding anywhere, and that includes the buttons to
// remove the mark or to say that they called“, „these four options. Plus … one more option which says none of it above. And
// plus there should be a note“, „it shouldn't be removing the mark“ a „only the super admins will see this flag, but the
// callers don't need to see the [flag]“. Každý blok ve vlastní stránce (vlastní mock v paměti).
const SIRKY_061 = [[1920, 1080], [1440, 900], [1280, 900], [1024, 768], [768, 1024], [390, 844], [360, 780]];
const STRANKY_061 = [['Označené', '#/oznacene'], ['Moji klienti', '#/moji'], ['Kontakty', '#/admin']];
// ⚠ migrace 062: okno má šest výsledků (VOLBY_062 nahoře), NAHRAZUJE VOLBY_061 s pěti
const POVINNA_061 = ['Mluvili jsme – co klient chce', 'Nic z toho výše'];

/** Bez posunu do strany (běží ve stránce): stránka, rámeček seznamu a každá buňka, tlačítko, odkaz a odznak řádků v rámečku. */
function zmer061() {
  const ven = [];
  const de = document.documentElement;
  if (de.scrollWidth > innerWidth) ven.push(`stránka ${de.scrollWidth} > ${innerWidth}`);
  const wrap = document.querySelector('.table-wrap');
  if (!wrap) return { ven, radky: 0, prazdno: !!document.querySelector('.empty-state'), akce: [] };
  if (wrap.scrollWidth > wrap.clientWidth) ven.push(`rámeček ${wrap.scrollWidth} > ${wrap.clientWidth}`);
  const wr = wrap.getBoundingClientRect();
  const fl = wr.left + wrap.clientLeft;
  const fr = fl + wrap.clientWidth;
  const pig = document.querySelector('.pig-col')?.getBoundingClientRect() ?? null;
  const rows = [...wrap.querySelectorAll('tbody tr')];
  const akce = [];
  for (const r of rows) {
    const rr = r.getBoundingClientRect();
    for (const el of r.querySelectorAll('td, button, a, .badge')) {
      if (getComputedStyle(el).display === 'none') continue;
      const rc = el.getBoundingClientRect();
      if (rc.width === 0 && rc.height === 0) continue;
      if (rc.left < fl - 0.5 || rc.right > fr + 0.5) {
        ven.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${Math.round(rc.left)}–${Math.round(rc.right)} mimo rámeček ${Math.round(fl)}–${Math.round(fr)}`);
      }
    }
    const tl = [...r.querySelectorAll('.oznacene-akce button')];
    for (const b of tl) {
      const rc = b.getBoundingClientRect();
      if (rc.width === 0 || rc.left < rr.left - 0.5 || rc.right > rr.right + 0.5 || rc.top < rr.top - 0.5 || rc.bottom > rr.bottom + 0.5) {
        ven.push(`„${b.textContent.trim()}“ mimo svůj řádek`);
      }
      if (pig && rc.left < pig.right - 0.5) ven.push(`„${b.textContent.trim()}“ vlevo pod sloupcem prasátka`);
    }
    akce.push({
      text: r.innerText.replace(/\s+/g, ' ').trim().slice(0, 60),
      // migrace 062: stav řádku (popisek) kvůli „Zavolal/a jsem“ u řádku jen s příznakem
      stav: r.querySelector('.status-badge')?.textContent?.trim() ?? '',
      oznaceni: !!r.querySelector('.oznaceni-badge'),
      zavolal: !!r.querySelector('.oznacene-akce .zavolal-btn'),
      vyreseno: !!r.querySelector('.oznacene-akce .vyreseno-btn'),
      zrusit: !!r.querySelector('.oznacene-akce .zrusit-ozn-btn'),
    });
  }
  return { ven, radky: rows.length, prazdno: false, akce };
}

// O61a: bez posunu do strany pro Volající i super admina na všech třech seznamech a sedmi šířkách; akce v řádku vždy vidět
for (const kdo of ['petra', 'mikulas', 'admin']) {
  await blok050(`O061a ${kdo}`, async () => {
    const { ctx, page } = await novaStranka(kdo);
    for (const [nazev, hash] of STRANKY_061) {
      await jdi(page, hash, 700);
      const spatne = [];
      let radku = 0;
      for (const [w, h] of SIRKY_061) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(150);
        const m = await page.evaluate(zmer061);
        radku = Math.max(radku, m.radky);
        if (m.ven.length) spatne.push(`${w} px: ${m.ven.slice(0, 2).join('; ')}${m.ven.length > 2 ? ` (+${m.ven.length - 2})` : ''}`);
        if (hash === '#/oznacene') {
          const superAdmin = kdo !== 'petra';
          for (const a of m.akce) {
            // ⚠ migrace 062: řádek jen s příznakem má „Zavolal/a jsem“, když ho přihlášený smí zapsat (dovolatSmi), nikdy ve
            // stavech DOVOLANI_NE; NAHRAZUJE „Zavolal/a jsem přesně u označení“
            if (a.oznaceni && !a.zavolal) spatne.push(`${w} px: „${a.text}“ bez „Zavolal/a jsem“`);
            if (!a.oznaceni && a.zavolal && BEZ_DOVOLANI_062.includes(a.stav)) spatne.push(`${w} px: „${a.text}“ (${a.stav}) navíc s „Zavolal/a jsem“`);
            if (a.zrusit !== (superAdmin && a.oznaceni)) spatne.push(`${w} px: „${a.text}“ ${a.zrusit ? 'navíc s' : 'bez'} „Zrušit označení“`);
          }
          if (kdo === 'petra' && !m.akce.some((a) => /Vzorová/.test(a.text) && a.vyreseno)) spatne.push(`${w} px: řádek 302 (Vzorová) bez „Vyřešeno“`);
        }
      }
      // řádky musí být (jinak se nic nezměřilo): Označené a Kontakty každý, Moji klienti Petra
      if (radku === 0 && (hash !== '#/moji' || kdo === 'petra')) spatne.push('žádné řádky, nejde změřit');
      await page.setViewportSize({ width: 1280, height: 900 });
      over(`O61a ${kdo} ${nazev}`, spatne.length === 0,
        `${nazev} (${kdo}) bez posunu do strany na 1920 až 360 px: stránka, rámeček i každá buňka, tlačítko, odkaz a odznak; akce v řádku a vpravo od sloupce prasátka`,
        spatne.slice(0, 4).join(' | '));
    }
    await ctx.close();
  });
}

// O61b: okno Zavolal/a jsem na telefonu i počítači, z řádku i z detailu: pět výsledků, poznámka vždy, povinná u dvou, délka
for (const [w, h, odkud] of [[360, 640, 'řádek'], [390, 844, 'řádek'], [1280, 900, 'řádek'], [390, 844, 'detail']]) {
  await blok050(`O061b ${w}x${h} ${odkud}`, async () => {
    const id = `O61b ${w}x${h} ${odkud}`;
    const { ctx, page } = await novaStranka('petra', { sirka: w, vyska: h });
    await jdi(page, '#/oznacene', 700);
    if (odkud === 'řádek') {
      await page.locator('table.kontakty tbody tr', { hasText: 'U Rybníka' }).first().locator('button.zavolal-btn').click();
    } else {
      await page.locator('table.kontakty tbody tr', { hasText: 'Na Kopci' }).first().locator('.kompakt-jmeno').click();
      await klid(page, 500);
      await page.locator('.drawer .prehled-panel button.zavolal-btn').click();
    }
    const okno = page.locator('.dovolani-okno');
    await okno.waitFor({ timeout: 4000 });
    const predVyberem = (await okno.locator('label[for="dovolani-text"]').isVisible()) && (await okno.locator('#dovolani-text').isVisible())
      && /^Poznámka pro automatizaci$/.test(txt(await okno.locator('label[for="dovolani-text"]').innerText()));
    const spatne = [];
    for (const v of VOLBY_062) {
      // exact: jinak „Chce web“ najde i „Nechce web“ (Playwright hledá název jako podřetězec)
      await okno.getByRole('radio', { name: v, exact: true }).click();
      await page.waitForTimeout(60);
      await okno.locator('.dovolani-volby button').first().scrollIntoViewIfNeeded();
      const m = await page.evaluate(() => {
        const o = document.querySelector('.dovolani-okno');
        const orc = o.getBoundingClientRect();
        const tl = [...o.querySelectorAll('.modal-actions button')].map((b) => b.getBoundingClientRect());
        const prvni = o.querySelector('.dovolani-volby button').getBoundingClientRect();
        const nahore = document.elementFromPoint(prvni.left + 4, prvni.top + prvni.height / 2);
        return {
          vOkne: orc.top >= -0.5 && orc.left >= -0.5 && orc.bottom <= innerHeight + 0.5 && orc.right <= innerWidth + 0.5,
          sirka: o.scrollWidth <= o.clientWidth,
          tlacitka: tl.length === 2 && tl.every((r) => r.top >= -0.5 && r.bottom <= innerHeight + 0.5 && r.left >= orc.left - 0.5 && r.right <= orc.right + 0.5
            && r.top >= orc.top - 0.5 && r.bottom <= orc.bottom + 0.5),
          volbaNahore: !!nahore?.closest('.dovolani-volby'),
          stitek: o.querySelector('label[for="dovolani-text"]')?.textContent ?? '',
          zapsat: [...o.querySelectorAll('.modal-actions button')].pop()?.disabled ?? null,
          duvod: !!o.querySelector('.duvod-odmitnuti'),
        };
      });
      const povinna = POVINNA_061.includes(v);
      // ⚠ úkol 12 (Albert 17. 11. 2026, D8): 93 i 94 dostali návrh, „Nechce web“ u nich chce povinný důvod odmítnutí
      // (výběr „Proč návrh odmítl“), Zapsat hovor je bez něj vypnuté; poznámka zůstává nepovinná (NAHRAZUJE „vypnuté jen bez
      // povinné poznámky“)
      const sDuvodem = v === 'Nechce web';
      if (!m.vOkne) spatne.push(`${v}: okno přesahuje obrazovku`);
      if (!m.sirka) spatne.push(`${v}: okno se posouvá do strany`);
      if (!m.tlacitka) spatne.push(`${v}: Zpět nebo Zapsat hovor není vidět v okně`);
      if (!m.volbaNahore) spatne.push(`${v}: první volbu něco zakrývá`);
      if (/\(povinná\)/.test(m.stitek) !== povinna || (!povinna && !/\(nepovinná\)/.test(m.stitek))) spatne.push(`${v}: štítek „${txt(m.stitek)}“`);
      if (m.duvod !== sDuvodem) spatne.push(`${v}: výběr důvodu odmítnutí ${m.duvod ? 'navíc' : 'chybí'}`);
      if (m.zapsat !== (povinna || sDuvodem)) spatne.push(`${v}: Zapsat hovor ${m.zapsat ? 'vypnuté' : 'zapnuté'} bez poznámky${sDuvodem ? ' a důvodu' : ''}`);
    }
    // 500 znaků u „Mluvili jsme“, pak „Nechce web“ (nejvýš 450): zapsat nejde, počítadlo „500 / 450“ červeně
    await okno.getByRole('radio', { name: 'Mluvili jsme – co klient chce' }).click();
    await okno.locator('#dovolani-text').fill('x'.repeat(500));
    await okno.getByRole('radio', { name: 'Nechce web' }).click();
    const pocet = txt(await okno.locator('#dovolani-text-pocet').innerText());
    const moc = await okno.locator('#dovolani-text-pocet').evaluate((e) => e.classList.contains('moc'));
    const vypnuto = await okno.getByRole('button', { name: 'Zapsat hovor' }).isDisabled();
    over(id, predVyberem && spatne.length === 0 && pocet === '500 / 450' && moc && vypnuto,
      'okno: poznámka vidět už před výběrem, šest výsledků bez přesahu a posunu, tlačítka vždy vidět, nic nezakrývá volby, povinná jen u Mluvili jsme a Nic z toho výše, 500 znaků u Nechce web nejde zapsat',
      `${spatne.slice(0, 3).join(' | ')}${predVyberem ? '' : ' | pole poznámky není vidět před výběrem'} | ${pocet} moc=${moc} vypnuto=${vypnuto}`);
    await ctx.close();
  });
}

// O61c: „Nedovolal/a jsem se“ s poznámkou označení neruší (Albert 2. 11. 2026, otázka 3), „Nic z toho výše“ ho uzavře
await blok050('O061c petra', async () => {
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/oznacene', 700);
  const r93 = page.locator('table.kontakty tbody tr', { hasText: 'U Rybníka' });
  const okno = page.locator('.dovolani-okno');
  await r93.first().locator('button.zavolal-btn').click();
  await okno.waitFor({ timeout: 4000 });
  await okno.getByRole('radio', { name: 'Nedovolal/a jsem se' }).click();
  await okno.locator('#dovolani-text').fill('nebral to');
  await okno.getByRole('button', { name: 'Zapsat hovor' }).click();
  await klid(page, 700);
  const v1 = (await volani(page)).filter((x) => x.fn === 'zapisHovor').pop();
  const s1 = await stav(page);
  const otevrene = s1.oznaceni.find((o) => o.kontakt_id === 93 && o.uzavreno_at === null);
  const lhuta = (await r93.count()) === 1 ? txt(await r93.first().locator('.lhuta-cell').innerText()) : '';
  over('O61c1', JSON.stringify(v1?.args.slice(0, 3)) === JSON.stringify([93, 'nedovolano', 'nebral to']) && v1?.ok === true
    && (await r93.count()) === 1 && otevrene?.pokusy === 1 && /nedovoláno 1×/.test(lhuta),
    '„Nedovolal/a jsem se“ s poznámkou: zapis_hovor ji dostane, označení zůstane otevřené a řádek ukáže „nedovoláno 1×“',
    JSON.stringify({ args: v1?.args, pokusy: otevrene?.pokusy, lhuta }));
  const POZN = 'chalupu prodává, ozve se nový majitel v lednu';
  await r93.first().locator('button.zavolal-btn').click();
  await okno.waitFor({ timeout: 4000 });
  await okno.getByRole('radio', { name: 'Nic z toho výše' }).click();
  const zapsat = okno.getByRole('button', { name: 'Zapsat hovor' });
  const bezPoznamky = await zapsat.isDisabled();
  await okno.locator('#dovolani-text').fill(POZN);
  await zapsat.click();
  await klid(page, 700);
  const s2 = await stav(page);
  const k93 = s2.kontakty.find((k) => k.id === 93);
  const uzavrene = s2.oznaceni.filter((o) => o.kontakt_id === 93 && o.uzavreno_at !== null).pop();
  const vzkaz = s2.zpravy.some((m) => m.sender_type === 'admin' && m.body === `Dovolání (Petra): Nic z toho výše: ${POZN}`);
  over('O61c2', bezPoznamky && !s2.oznaceni.some((o) => o.kontakt_id === 93 && o.uzavreno_at === null) && uzavrene?.vysledek === 'jine'
    && (await r93.count()) === 0 && (k93?.note ?? '').endsWith(`Dovolání: Nic z toho výše: ${POZN}`) && vzkaz,
    '„Nic z toho výše“: bez poznámky nejde zapsat; s ní označení uzavřené (jine), řádek zmizí, poznámka klienta i vzkaz agentovi',
    JSON.stringify({ vysledek: uzavrene?.vysledek, note: (k93?.note ?? '').slice(-80), vzkaz }));
  await ctx.close();
});

// O61d: „Vyřešeno“ přímo v řádku (stejná práva jako v detailu), detail se neotevře
await blok050('O061d petra', async () => {
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/oznacene', 700);
  const r302 = page.locator('table.kontakty tbody tr', { hasText: 'Jana Vzorová' });
  await r302.first().locator('button.vyreseno-btn').click();
  await klid(page, 500);
  const v = (await volani(page)).filter((x) => x.fn === 'clearFlag').pop();
  const info = txt(await page.locator('.dovolani-info').innerText().catch(() => ''));
  over('O61d1', v?.args[0] === 302 && v?.ok === true && (await r302.count()) === 0 && /^Příznak „.+“ u klienta .*Vzorová.* je vyřešený\.$/.test(info)
    && (await page.locator('.drawer').count()) === 0, 'Volající: „Vyřešeno“ v řádku zruší příznak 302, řádek zmizí, věta o tom, detail se neotevře', info);
  await ctx.close();
});
await blok050('O061d mikulas', async () => {
  const { ctx, page } = await novaStranka('mikulas');
  await jdi(page, '#/oznacene', 700);
  const r94 = page.locator('table.kontakty tbody tr', { hasText: 'Na Kopci' }).first();
  const pred = await r94.locator('.flag-badge').count();
  await r94.locator('button.vyreseno-btn').click();
  await klid(page, 500);
  const tl = (await r94.locator('.oznacene-akce button').allInnerTexts()).map(txt);
  over('O61d2', pred === 1 && (await page.locator('table.kontakty tbody tr', { hasText: 'Na Kopci' }).count()) === 1 && (await r94.locator('.flag-badge').count()) === 0
    && (await r94.locator('.oznaceni-badge').count()) === 1 && JSON.stringify(tl) === JSON.stringify(['Zavolal/a jsem', 'Zrušit označení'])
    && (await page.locator('.drawer').count()) === 0,
    'super admin: „Vyřešeno“ u 94 zruší jen příznak, řádek zůstane s označením a akcemi Zavolal/a jsem a Zrušit označení', tl.join(' | '));
  await ctx.close();
});

// O61e: „Údaje z internetu“ (info_neoverene u 92 a 94) Volající nevidí nikde, super admin ano
await blok050('O061e petra', async () => {
  const { ctx, page } = await novaStranka('petra');
  const kde = [];
  const vidi = async (misto) => {
    const text = /Údaje z internetu/.test(await page.locator('body').innerText());
    const atributy = await page.locator('[title*="Údaje z internetu"], [aria-label*="Údaje z internetu"]').count();
    if (text || atributy > 0) kde.push(misto);
  };
  const ma94 = [];
  for (const [nazev, hash] of STRANKY_061) {
    await jdi(page, hash, 700);
    if ((await page.locator('table.kontakty tbody tr', { hasText: 'Na Kopci' }).count()) === 1) ma94.push(nazev);
    await vidi(nazev);
  }
  await jdi(page, '#/oznacene', 700);
  await page.locator('table.kontakty tbody tr', { hasText: 'Na Kopci' }).first().locator('.kompakt-jmeno').click();
  await klid(page, 500);
  await vidi('detail 94');
  const pridat = page.locator('.drawer button.flag-add-btn');
  const maPridat = (await pridat.count()) === 1;
  let moznosti = [];
  if (maPridat) {
    await pridat.click();
    moznosti = (await page.locator('.drawer .flag-panel select option').allTextContents()).map(txt);
    if (moznosti.some((x) => /Údaje z internetu/.test(x))) kde.push('výběr příznaku v detailu 94');
  }
  over('O61e1', kde.length === 0 && maPridat && moznosti.length >= 3 && ma94.length === 3,
    'Volající (Petra) nevidí „Údaje z internetu“ v Označených, Moji klienti, Kontaktech, detailu 94 ani ve výběru příznaku (94 je její klient a v seznamech je)',
    `vidí: ${kde.join(', ') || '—'}; 94 v ${ma94.join(', ')}; Označit klienta ${maPridat}; volby ${moznosti.join(' | ')}`);
  await ctx.close();
});
await blok050('O061e mikulas', async () => {
  const { ctx, page } = await novaStranka('mikulas');
  await jdi(page, '#/oznacene', 700);
  const pilulky = (await page.locator('.oznacene-druhy button').allInnerTexts()).map(txt);
  over('O61e2', pilulky.includes('Údaje z internetu (2)'), 'super admin (Mikuláš) má pilulku „Údaje z internetu (2)“ (92 a 94)', pilulky.join(' | '));
  // super admin navíc ve 2. řádku, kdo volá: server u označení bez vlastníka pošle místo jména rovnou „bez volajícího“
  const volajici = (await page.locator('table.kontakty tbody tr .ozn-volajici').allInnerTexts()).map(txt);
  over('O61e3', volajici.includes('volá Petra') && volajici.includes('bez volajícího') && !volajici.some((t) => /volá bez/.test(t)),
    'super admin: u označení „volá <jméno>“ nebo „bez volajícího“, nikdy „volá bez volajícího“', volajici.join(' | '));
  await ctx.close();
});

/* ============ AU (audit soudržnosti 2. 11. 2026): „e-mail se vrátil“ u označení (F10) a věta u důvodu stavu (F11) ============ */
// F10 (nález STUCK-9): označený klient s příznakem „Chybí e-mail“ (náš e-mail se mu vrátil) návrh nejspíš neviděl; řádek
// Označených má hned za skupinou „e-mail se vrátil“, řádek zůstává kompaktní a bez posunu do strany (1920 až 360 px).
// Příznak dá člověk v detailu jako odraz od automatizace (demo žádného označeného klienta s Chybí e-mail nemá). F11 (nález
// R4): u změny stavu detail říká, kdy důvod automatizace čte, a posílá pokyn do Vzkazů agentovi.
/** Dá klientovi z řádku Označených příznak Chybí e-mail v detailu a detail zavře. */
async function odrazVDetailu(page, jmeno) {
  await page.locator('table.kontakty tbody tr', { hasText: jmeno }).first().locator('.kompakt-jmeno').click();
  await klid(page, 500);
  await page.locator('.drawer button.flag-add-btn').click();
  await page.locator('.drawer .flag-panel select').selectOption('chybi_email');
  await page.locator('.drawer .flag-panel textarea').fill('E-mail nefunguje: náš e-mail s návrhem se nedoručil.');
  await page.locator('.drawer .flag-panel').getByRole('button', { name: 'Uložit příznak' }).click();
  await klid(page, 500);
  await page.locator('.drawer-close').click();
  await klid(page, 300);
}
/** „e-mail se vrátil“ v řádku: pořadí odznaků v buňce Co je potřeba, text, nápověda a poloha vedle skupiny. */
const odrazVRadku = (r) => r.locator('td.oznacene-co').evaluate((td) => {
  const sk = td.querySelector('.oznaceni-badge')?.getBoundingClientRect();
  const od = td.querySelector('.ozn-odraz');
  const rc = od?.getBoundingClientRect();
  return {
    poradi: [...td.children].map((e) => String(e.className).split(' ').find((c) => c !== 'badge') ?? ''),
    text: od?.textContent ?? null,
    title: od?.getAttribute('title') ?? '',
    // vedle skupiny: na stejném řádku hned za ní, nebo (úzký telefon) první na dalším řádku buňky
    vedle: !!(sk && rc) && ((Math.abs(rc.top - sk.top) < 3 && rc.left >= sk.right - 0.5 && rc.left - sk.right < 16) || rc.top >= sk.bottom - 0.5),
  };
});
await blok050('AU petra', async () => {
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/oznacene', 700);
  const pred = await page.locator('.ozn-odraz').count();
  await odrazVDetailu(page, 'U Rybníka');
  const r93 = page.locator('table.kontakty tbody tr', { hasText: 'U Rybníka' }).first();
  const r302 = page.locator('table.kontakty tbody tr', { hasText: 'Jana Vzorová' }).first();
  const m = await odrazVRadku(r93);
  over('AU10a', pred === 0 && JSON.stringify(m.poradi) === JSON.stringify(['oznaceni-badge', 'ozn-odraz', 'flag-badge']) && m.text === 'e-mail se vrátil'
    && /klient návrh webu nejspíš neviděl/.test(m.title) && m.vedle
    && (await page.locator('.ozn-odraz').count()) === 1 && (await r302.locator('.ozn-odraz').count()) === 0 && (await r302.locator('.flag-badge').count()) === 1,
    'Volající: označený klient 93 s příznakem Chybí e-mail má „e-mail se vrátil“ hned za „Neodpověděl na návrh“ (před příznakem); 302 s příznakem bez označení ne',
    JSON.stringify({ pred, ...m }));
  // bez posunu do strany i s odznakem navíc, odznak vždy vidět vedle skupiny
  const spatne = [];
  for (const [w, h] of SIRKY_061) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(150);
    const z = await page.evaluate(zmer061);
    if (z.ven.length) spatne.push(`${w} px: ${z.ven.slice(0, 2).join('; ')}`);
    const mw = await odrazVRadku(r93);
    if (mw.text !== 'e-mail se vrátil' || !mw.vedle) spatne.push(`${w} px: odznak ${mw.text === null ? 'chybí' : 'není vedle skupiny'}`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  over('AU10b', spatne.length === 0, 'Označené s „e-mail se vrátil“ bez posunu do strany na 1920 až 360 px, odznak vždy vedle skupiny', spatne.slice(0, 4).join(' | '));
  // F11: změna stavu v detailu (bez uložení)
  await r93.locator('.kompakt-jmeno').click();
  await klid(page, 500);
  await page.locator('.drawer .field:has(> label:text-is("Status")) > select').selectOption('odmitnuto');
  const veta = txt(await page.locator('.drawer .duvod-stavu-napoveda').innerText());
  const detail = await page.locator('.drawer').innerText();
  over('AU11a', veta === 'Z „Návrh odeslán“ na „Odmítnuto“. Důvod čte automatizace jen u Odmítnuto (u architekta i u Nekontaktovat). Pokyn pro agenta napište do Vzkazů agentovi.'
    && !/přečte automatizace|podle něj pokračuje/.test(detail) && /Vzkazy agentovi/i.test(detail),
    'detail: u změny stavu věta, kdy důvod automatizace čte, a pokyn do Vzkazů agentovi (ty jsou v detailu níž)', veta);
  await page.locator('.drawer-close').click();
  await klid(page, 300);
  over('AU11b', !(await volani(page)).some((v) => v.fn === 'updateKontakt') && (await stav(page)).kontakty.find((k) => k.id === 93)?.status === 'navrh_odeslan',
    'zavřený detail bez uložení stav nezmění');
  await ctx.close();
});
await blok050('AU mikulas', async () => {
  // super admin má ve 2. řádku navíc „volá X“ / „bez volajícího“: i s odznakem bez posunu do strany
  const { ctx, page } = await novaStranka('mikulas');
  await jdi(page, '#/oznacene', 700);
  await odrazVDetailu(page, 'Tichá');
  const r90 = page.locator('table.kontakty tbody tr', { hasText: 'Tichá' }).first();
  const spatne = [];
  for (const [w, h] of SIRKY_061) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(150);
    const z = await page.evaluate(zmer061);
    if (z.ven.length) spatne.push(`${w} px: ${z.ven.slice(0, 2).join('; ')}`);
    const mw = await odrazVRadku(r90);
    if (mw.text !== 'e-mail se vrátil' || !mw.vedle) spatne.push(`${w} px: odznak ${mw.text === null ? 'chybí' : 'není vedle skupiny'}`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  over('AU10c', spatne.length === 0 && (await page.locator('.ozn-odraz').count()) === 1,
    'super admin: označení 90 bez volajícího s příznakem Chybí e-mail má „e-mail se vrátil“, bez posunu do strany na 1920 až 360 px', spatne.slice(0, 4).join(' | '));
  await ctx.close();
});

/* ============ 062 (Albert 2. 11. 2026): „Zavolal/a jsem“ i bez označení v Moji klienti, Kontaktech, detailu a kalendáři, šestý
   výsledek „Chce web“, menu stavů v detailu ============ */
// „I would like to have this also in my clients section … even if the client isn't marked yet and you call them again, you should
// have like a I called them button … you can even add [it] to the contacts section“, A1 „Yes, you can add the sixth option“, A3
// „if the client refuses the preview on the first call, I don't think we should be calling them again“ a o menu stavů „Limit it“.
// Bez posunu do strany s novým tlačítkem měří O61a (tři seznamy, sedm šířek, Volající i super admini).
/** Řádky seznamu: jméno, stav (popisek nebo skryto), označení, tlačítko, jeho text vidět, poloha vůči 2. řádku. */
const radky062 = (page) => page.locator('table.kontakty tbody tr').evaluateAll((rs) => rs.map((r) => {
  const tl = r.querySelector('td.radek-akce .zavolal-btn');
  const bunky = [...r.children];
  const druhy = bunky.find((td) => getComputedStyle(td).order === '2' && getComputedStyle(td).display !== 'none');
  const t = tl?.getBoundingClientRect();
  const text = tl?.querySelector('.zavolal-text');
  return {
    jmeno: (r.querySelector('td.row-name')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    stav: r.querySelector('.status-badge')?.textContent?.trim() ?? '',
    skryto: !!r.querySelector('.skryto'),
    oznaceni: !!r.querySelector('.oznaceni-badge'),
    tlacitko: !!tl,
    textVidet: !!text && getComputedStyle(text).display !== 'none',
    nazev: tl ? `${tl.getAttribute('aria-label')}|${tl.getAttribute('title')}` : '',
    // 1. řádek: tlačítko nad první buňkou 2. řádku (stav, údaje)
    prvniRadek: !tl || !druhy || t.bottom <= druhy.getBoundingClientRect().top + 0.5,
  };
}));

// O62a: tlačítko jen tam, kde ho přihlášený smí zapsat (dovolatSmi), v 1. řádku, na telefonu jen ikona s názvem v aria-label
for (const kdo of ['petra', 'admin']) {
  for (const [w, h] of [[1280, 900], [360, 780]]) {
    await blok050(`O062a ${kdo} ${w}`, async () => {
      const { ctx, page } = await novaStranka(kdo, { sirka: w, vyska: h });
      for (const [nazev, hash] of [['Moji klienti', '#/moji'], ['Kontakty', '#/admin']]) {
        await jdi(page, hash, 700);
        const rs = await radky062(page);
        const spatne = [];
        for (const r of rs) {
          // Volající u svých řádků a Albert všude smí upravit: tlačítko u označení, jinak mimo DOVOLANI_NE; cizí kontakt nikdy
          const cekam = !r.skryto && (r.oznaceni || (!!r.stav && !BEZ_DOVOLANI_062.includes(r.stav)));
          if (r.tlacitko !== cekam) spatne.push(`${r.jmeno.slice(0, 28)} (${r.stav || 'skryto'}) ${r.tlacitko ? 'navíc s' : 'bez'} tlačítkem`);
          if (r.tlacitko && !r.prvniRadek) spatne.push(`${r.jmeno.slice(0, 28)}: tlačítko není v 1. řádku`);
          if (r.tlacitko && r.textVidet !== (w > 640)) spatne.push(`${r.jmeno.slice(0, 28)}: text tlačítka ${r.textVidet ? 'vidět' : 'schovaný'} na ${w} px`);
          if (r.tlacitko && r.nazev !== 'Zavolal/a jsem|Zavolal/a jsem: zapiš, jak hovor dopadl') spatne.push(`${r.jmeno.slice(0, 28)}: název ${r.nazev}`);
        }
        const s = rs.filter((r) => r.tlacitko).length;
        // Albert v Moji klienti žádné klienty nemá (jako O61a); jinde musí být řádky s tlačítkem i bez něj, jinak se nic nezměřilo
        if (!(kdo === 'admin' && hash === '#/moji') && (s === 0 || s === rs.length)) spatne.push(`tlačítko u ${s} z ${rs.length} řádků (čekám jen u některých)`);
        over(`O62a ${kdo} ${nazev} ${w}`, spatne.length === 0,
          `${nazev} (${kdo}, ${w} px): „Zavolal/a jsem“ jen u řádků, kde ho smí zapsat (označení, nebo stav mimo frontu, Nekontaktovat, Nerelevantní, Odmítnuto a nabídnutou slevu; cizí kontakt nikdy), v 1. řádku, na telefonu jen ikona`,
          spatne.slice(0, 4).join(' | '));
      }
      await ctx.close();
    });
  }
}

// O62b: Moji klienti → klient bez označení (95): okno bez označení, šest výsledků, Chce web bez poznámky, detail se neotevře
await blok050('O062b petra', async () => {
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/moji', 700);
  const s0 = await stav(page);
  const r95 = page.locator('table.kontakty tbody tr', { hasText: 'Chalupa Pod Skálou' }).first();
  await r95.locator('button.zavolal-btn').click();
  const okno = page.locator('.dovolani-okno');
  await okno.waitFor(KRATKE);
  const volby = (await okno.locator('.dovolani-volby button').allInnerTexts()).map(txt);
  const telo = txt(await okno.innerText());
  await okno.getByRole('radio', { name: 'Chce web', exact: true }).click();
  const co = txt(await okno.locator('.dovolani-co').innerText());
  const zapsat = okno.getByRole('button', { name: 'Zapsat hovor' });
  const lzeBezPoznamky = !(await zapsat.isDisabled());
  const stitek = txt(await okno.locator('label[for="dovolani-text"]').innerText());
  over('O62b1', JSON.stringify(volby) === JSON.stringify(VOLBY_062) && telo.includes('Klient není v Označených: zapíše se další hovor, ve statistikách nový hovor není.')
    && !/Lhůta na zavolání|Neodpověděl na/.test(telo) && co === 'Klient web chce: automatizace mu pošle e-mail s odkazem a domluví zbytek (hosting, faktura).'
    && lzeBezPoznamky && /\(nepovinná\)/.test(stitek) && (await page.locator('.drawer').count()) === 0,
    'okno u klienta bez označení: šest výsledků, neutrální věta nahoře, bez lhůty a kategorie, Chce web bez poznámky, detail se neotevřel',
    `${volby.join(' | ')} || ${co} || ${telo.slice(0, 120)}`);
  // klik na pozadí okna zavře okno a detail neotevře (okno je přes createPortal, klik nesmí doputovat k řádku)
  await page.mouse.click(5, 5);
  await page.waitForTimeout(200);
  const poPozadi = (await page.locator('.dovolani-okno').count()) === 0 && (await page.locator('.drawer').count()) === 0;
  await r95.locator('button.zavolal-btn').click();
  await okno.waitFor(KRATKE);
  await okno.getByRole('radio', { name: 'Chce web', exact: true }).click();
  await zapsat.click();
  await klid(page, 700);
  const v = (await volani(page)).filter((x) => x.fn === 'zapisHovor').pop();
  const s1 = await stav(page);
  const info = txt(await page.locator('.dovolani-info').innerText().catch(() => ''));
  over('O62b2', poPozadi && JSON.stringify(v?.args.slice(0, 4)) === JSON.stringify([95, 'chce_web', null, null]) && v?.ok === true
    && /^Hovor s klientem Chalupa Pod Skálou.* je zapsaný: chce web\. Zapsáno jako další hovor bez označení\.$/.test(info)
    && s1.kontakty.find((k) => k.id === 95)?.status === s0.kontakty.find((k) => k.id === 95)?.status && s1.callLog.length === s0.callLog.length
    && s1.zpravy.some((m) => m.sender_type === 'admin' && m.body === 'Dovolání (Petra): Chce web') && (await page.locator('.drawer').count()) === 0,
    'Chce web bez označení: zapis_hovor (95, chce_web, bez poznámky), věta „Zapsáno jako další hovor bez označení.“, stav ani call_log beze změny, vzkaz agentovi, detail zavřený',
    JSON.stringify({ args: v?.args, info, poPozadi }));
  await ctx.close();
});

// O62c: odmítnutí vypnuté s důvodem (po prodeji, Eskalace u Volajícího, sdílený klient, kterého vede kolega); jinde zapnuté
await blok050('O062c petra', async () => {
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/moji', 700);
  const okno = page.locator('.dovolani-okno');
  const zmer = async (jmeno) => {
    await page.locator('table.kontakty tbody tr', { hasText: jmeno }).first().locator('button.zavolal-btn').click();
    await okno.waitFor(KRATKE);
    const vyp = await okno.locator('.dovolani-volby button').evaluateAll((bs) => bs.filter((b) => b.disabled).map((b) => b.textContent.trim()));
    const duvod = txt(await okno.locator('.dovolani-nejde').innerText().catch(() => ''));
    await okno.getByRole('button', { name: 'Zpět' }).click();
    await page.waitForTimeout(120);
    return { vyp, duvod };
  };
  const ODM = ['Nechce web', 'Nechce, abychom ho kontaktovali'];
  const prodej = await zmer('Chalupa Na Vršku');
  const esk = await zmer('Chata Jizerky');
  const kolega = await zmer('Chata Na Samotě');
  const svuj = await zmer('Chalupa Pod Skálou');
  over('O62c', JSON.stringify(prodej.vyp) === JSON.stringify(ODM) && /^Klient už web objednal \(stav Schváleno\): odmítnutí tady zapsat nejde\./.test(prodej.duvod)
    && JSON.stringify(esk.vyp) === JSON.stringify(ODM) && /^Klient je ve stavu Eskalace, o dalším kroku rozhodne Albert nebo super admin;/.test(esk.duvod)
    && JSON.stringify(kolega.vyp) === JSON.stringify(ODM) && /^Odmítnutí zapisuje volající, který klienta vede,/.test(kolega.duvod)
    && svuj.vyp.length === 0 && svuj.duvod === '' && (await page.locator('.drawer').count()) === 0,
    'odmítnutí vypnutá s důvodem: po prodeji (20), Eskalace (9), sdílený klient Honzův (96); u vlastního klienta (95) zapnutá',
    JSON.stringify({ prodej, esk, kolega, svuj }));
  await ctx.close();
});

// O62d: detail klienta bez označení (95) má tlačítko v přehledu, s označením (94) jen tlačítko u označení; zápis z detailu
await blok050('O062d petra', async () => {
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/moji', 700);
  await page.locator('table.kontakty tbody tr', { hasText: 'Roubenka Na Kopci' }).first().locator('td.row-name').click();
  await klid(page, 500);
  const panel = page.locator('.drawer .prehled-panel');
  const s94 = { tlacitek: await panel.locator('button.zavolal-btn').count(), bez: await panel.locator('.prehled-dovolani').count() };
  await page.locator('.drawer-close').click();
  await klid(page, 300);
  await page.locator('table.kontakty tbody tr', { hasText: 'Chalupa Pod Skálou' }).first().locator('td.row-name').click();
  await klid(page, 500);
  const radek = txt(await panel.locator('.prehled-dovolani').innerText().catch(() => ''));
  await panel.locator('.prehled-dovolani button.zavolal-btn').click();
  const okno = page.locator('.dovolani-okno');
  await okno.waitFor(KRATKE);
  const telo = txt(await okno.innerText());
  await okno.getByRole('radio', { name: 'Nedovolal/a jsem se' }).click();
  const co = txt(await okno.locator('.dovolani-co').innerText());
  await okno.getByRole('button', { name: 'Zapsat hovor' }).click();
  await klid(page, 700);
  const v = (await volani(page)).filter((x) => x.fn === 'zapisHovor').pop();
  over('O62d', s94.tlacitek === 1 && s94.bez === 0 && /^Klient není v Označených\./.test(radek) && telo.includes('Klient není v Označených: zapíše se další hovor')
    && co === 'Zapíše se pokus, u klienta se nic nemění.' && JSON.stringify(v?.args.slice(0, 2)) === JSON.stringify([95, 'nedovolano'])
    && (await page.locator('.drawer').count()) === 0 && /je zapsaný: nedovolal\/a jsem se\./.test(await page.locator('.dovolani-info').innerText()),
    'detail: s označením jen tlačítko u označení (94), bez označení řádek „Klient není v Označených.“ s tlačítkem (95); zápis detail zavře a řekne, co se zapsalo',
    JSON.stringify({ s94, radek, co, args: v?.args }));
  await ctx.close();
});

// O62e: Kontakty Volajícího: cizí kontakt (skryto) tlačítko nemá, vlastní řádek ano; klepnutí na řádek dál otevře detail
await blok050('O062e petra', async () => {
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/admin', 700);
  const rs = await radky062(page);
  const cizi = rs.filter((r) => r.skryto);
  const r95 = rs.find((r) => /Chalupa Pod Skálou/.test(r.jmeno));
  await page.locator('table.kontakty tbody tr', { hasText: 'Chalupa Pod Skálou' }).first().locator('td.row-name').click();
  await klid(page, 500);
  over('O62e', cizi.length > 0 && cizi.every((r) => !r.tlacitko) && r95?.tlacitko === true && (await page.locator('.drawer').count()) === 1
    && (await page.locator('.dovolani-okno').count()) === 0,
    'Kontakty (Petra): cizí kontakty bez tlačítka, vlastní klient 95 s ním; klepnutí na jméno otevře detail, ne okno',
    `${cizi.length} cizích, 95 ${r95?.tlacitko}`);
  await ctx.close();
});

// O62f: super admin (Mikuláš) má tlačítko jen u klientů, které smí upravit, a u označení: Petřin 95 ne, jeho 97 ano, 98 (sleva) ne
await blok050('O062f mikulas', async () => {
  const { ctx, page } = await novaStranka('mikulas');
  await jdi(page, '#/admin', 700);
  const rs = await radky062(page);
  const r = (re) => rs.find((x) => re.test(x.jmeno));
  over('O62f', r(/Chalupa Pod Skálou/)?.tlacitko === false && r(/Chalupa Za Humny/)?.tlacitko === true && r(/Chata Bez Zájmu/)?.tlacitko === false
    && r(/Roubenka Na Kopci/)?.tlacitko === true,
    'super admin: bez označení jen u klienta, kterého smí upravit (Petřin 95 ne, jeho nabídnutá sleva 98 ne), u označení vždy (97, 94)',
    JSON.stringify(['Skálou', 'Humny', 'Zájmu', 'Kopci'].map((j) => [j, rs.find((x) => x.jmeno.includes(j))?.tlacitko])));
  await ctx.close();
});

// O62g: kalendář: Hotovo u klienta mimo frontu (9) otevře okno Zavolal/a jsem a hovor uzavře; klient ve frontě (10) dál Zavolat teď
await blok050('O062g petra', async () => {
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/kalendar', 700);
  const s0 = await stav(page);
  const z9 = s0.zavolat.find((z) => z.kontakt_id === 9 && z.stav === 'ceka');
  const p9 = page.locator(`.zavolat-polozka[data-zavolat-id="${z9?.id}"]`);
  const z10 = s0.zavolat.find((z) => z.kontakt_id === 10 && z.stav === 'ceka');
  const p10 = page.locator(`.zavolat-polozka[data-zavolat-id="${z10?.id}"]`);
  const fronta = { teď: await p10.getByRole('button', { name: 'Zavolat teď' }).count(), hotovo: await p10.getByRole('button', { name: 'Hotovo' }).count() };
  await p9.getByRole('button', { name: 'Hotovo' }).click();
  const okno = page.locator('.dovolani-okno');
  await okno.waitFor(KRATKE);
  const confirm = await page.locator('.modal', { hasText: 'Hovor je hotový?' }).count();
  await okno.getByRole('radio', { name: 'Mluvili jsme – co klient chce' }).click();
  await okno.locator('#dovolani-text').fill('chce přidat ceník na zimu');
  await okno.getByRole('button', { name: 'Zapsat hovor' }).click();
  await klid(page, 900);
  const s1 = await stav(page);
  const z9po = s1.zavolat.find((z) => z.id === z9?.id);
  const v = (await volani(page)).filter((x) => x.fn === 'zapisHovor').pop();
  over('O62g', !!z9 && !!z10 && fronta.teď === 1 && fronta.hotovo === 0 && confirm === 0 && JSON.stringify(v?.args.slice(0, 3)) === JSON.stringify([9, 'mluvili', 'chce přidat ceník na zimu'])
    && z9po?.stav === 'hotovo' && /^dovolání: mluvili/.test(z9po?.vysledek ?? '') && (await page.locator(`.zavolat-polozka[data-zavolat-id="${z9?.id}"] button`, { hasText: 'Hotovo' }).count()) === 0
    && /je zapsaný: mluvili jsme – co klient chce\./.test(await page.locator('.dovolani-info').innerText()),
    'kalendář: Hotovo u klienta mimo frontu otevře okno Zavolal/a jsem (ne „Hovor je hotový?“), zapíše dovolání a hovor uzavře; klient ve frontě má dál Zavolat teď',
    JSON.stringify({ fronta, confirm, args: v?.args, z9po }));
  await ctx.close();
});

// O62h: menu stavů a plánování v detailu (D19): bez Nabídnuté slevy, Ozve se později a Archiv jen s návrhem, u Odmítnuto bez plánování
await blok050('O062h petra', async () => {
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/moji', 700);
  const otevri = async (jmeno) => {
    if (await page.locator('.drawer-close').count()) {
      await page.locator('.drawer-close').click();
      await klid(page, 250);
    }
    await page.locator('table.kontakty tbody tr', { hasText: jmeno }).first().locator('td.row-name').click();
    await klid(page, 500);
  };
  const volbyStavu = () => page.locator('.drawer .field:has(> label:text-is("Status")) > select option').allTextContents();
  await otevri('Chalupa Pod Skálou');
  const s95 = await volbyStavu();
  const naplan95 = await page.locator('.drawer button.zavolat-naplanovat').count();
  await page.locator('.drawer .field:has(> label:text-is("Status")) > select').selectOption('odmitnuto');
  const rusi = txt(await page.locator('.drawer .duvod-stavu-hovory').innerText().catch(() => ''));
  const pozn = txt(await page.locator('.drawer .poznamka-automatizace').innerText().catch(() => ''));
  await otevri('Roubenka U Lesa');
  const s2 = await volbyStavu();
  await otevri('Apartmány Krkonoše');
  const naplan4 = await page.locator('.drawer button.zavolat-naplanovat').count();
  over('O62h', !s95.includes('Nabídnuta sleva') && s95.includes('Ozve se později') && s95.includes('Archiv – neodpověděl') && naplan95 === 1
    && rusi === 'Naplánované hovory klienta se tím zruší.' && pozn === 'Nové řádky, které do poznámky připíšeš, dostane po uložení automatizace jako vzkaz agentovi.'
    && !s2.includes('Ozve se později') && !s2.includes('Archiv – neodpověděl') && !s2.includes('Nabídnuta sleva') && s2.includes('Nedovoláno')
    && naplan4 === 0 && !(await volani(page)).some((v) => v.fn === 'updateKontakt'),
    'detail: menu bez Nabídnuté slevy; Ozve se později a Archiv jen s návrhem (95 ano, 2 ve frontě ne); změna na Odmítnuto řekne, že se hovory zruší; u Odmítnuto (4) Naplánovat hovor není; poznámka říká, že ji automatizace dostane',
    JSON.stringify({ s95: s95.length, s2: s2.length, naplan95, naplan4, rusi, pozn }));
  await ctx.close();
});

// O62i: Hotovo u klienta mimo frontu, kterému přihlášený dovolání zapsat nesmí (Mikuláš v Petřině kalendáři u klienta 9 pod
// Albertem, smi_upravit false): okno „Hovor je hotový?“ s textem jako dřív (zavolat_hotovo), žádné okno Zavolal/a jsem
await blok050('O062i mikulas', async () => {
  const { ctx, page } = await novaStranka('mikulas');
  await jdi(page, '#/kalendar', 700);
  await jenClovek(page, UID.petra);
  await klid(page, 500);
  const z9 = (await stav(page)).zavolat.find((z) => z.kontakt_id === 9 && z.stav === 'ceka');
  await page.locator(`.zavolat-polozka[data-zavolat-id="${z9?.id}"]`).getByRole('button', { name: 'Hotovo' }).click(KRATKE);
  const okno = page.locator('.modal', { hasText: 'Hovor je hotový?' });
  await okno.waitFor(KRATKE);
  const dovolani = await page.locator('.dovolani-okno').count();
  const textOkna9 = await okno.innerText();
  await page.locator('#zavolat-vysledek').fill('domluveno, zaplatí do pátku');
  await okno.getByRole('button', { name: 'Hotovo' }).click();
  await klid(page, 500);
  const h9 = (await volani(page)).find((v) => v.fn === 'zavolatHotovo' && v.ok);
  // migrace 063 (audit F4): Mikuláš tenhle kontakt upravit nesmí, takže okno automatizaci neslibuje a do vlákna nic nejde
  const s9 = await stav(page);
  const vl9 = s9.vlakna.filter((v) => v.kontakt_id === 9).map((v) => v.id);
  over('O62i', !!z9 && dovolani === 0 && s9.zavolat.find((z) => z.id === z9?.id)?.stav === 'hotovo' && h9?.args[1] === 'domluveno, zaplatí do pátku'
    && !(await volani(page)).some((v) => v.fn === 'zapisHovor') && !textOkna9.includes('přečte si automatizace')
    && !s9.zpravy.some((m) => vl9.includes(m.thread_id) && /^Naplánovaný hovor hotový/.test(m.body)),
    'Hotovo u klienta, kterému dovolání zapsat nejde: okno „Hovor je hotový?“ s výsledkem jako dřív (zavolat_hotovo), bez okna Zavolal/a jsem; bez práva kontakt upravit do vlákna nic', JSON.stringify(h9?.args));
  await ctx.close();
});

// ⚠ 3. 11. 2026 (ověření 062, appka FIX 1 a 2): kalendář (app_zavolat_ven) klíče ozn_* neposílá; Hotovo si napřed přečte
// označení z přehledu klienta. O62j: Petřin označený klient 93 (návrh) dostane okno S OZNAČENÍM (kategorie a věty o označení,
// ne neutrální věta), zápis označení uzavře. O62k: Mikulášova kampaňová chata 97 s označením (Nabídnuta sleva) dostane okno
// Zavolal/a jsem, ne „Hovor je hotový?“ s volným textem bez dovolání.
const naplanujVDetailu = async (page, jmeno, minut) => {
  await jdi(page, '#/moji', 600);
  if (await page.locator('.drawer-close').count()) await page.locator('.drawer-close').click();
  await page.locator('table.kontakty tbody tr', { hasText: jmeno }).first().locator('td.row-name').click(KRATKE);
  await klid(page, 500);
  await page.locator('.drawer').getByRole('button', { name: /Naplánovat hovor|Přesunout hovor/ }).click(KRATKE);
  const kdy = Date.now() + minut * 60 * 1000;
  await page.fill('#zavolat-den', denP(kdy));
  await page.fill('#zavolat-cas', casP(kdy));
  await page.locator('.modal').getByRole('button', { name: /^(Naplánovat|Přesunout)$/ }).click();
  await klid(page, 600);
};
await blok050('O062j petra', async () => {
  const { ctx, page } = await novaStranka('petra');
  await naplanujVDetailu(page, 'Chata U Rybníka', 60);
  await jdi(page, '#/kalendar', 700);
  const z93 = (await stav(page)).zavolat.find((z) => z.kontakt_id === 93 && z.stav === 'ceka');
  await page.locator(`.zavolat-polozka[data-zavolat-id="${z93?.id}"]`).getByRole('button', { name: 'Hotovo' }).click(KRATKE);
  const okno = page.locator('.dovolani-okno');
  await okno.waitFor(KRATKE);
  const text = txt(await okno.innerText());
  const stary = await page.locator('.modal', { hasText: 'Hovor je hotový?' }).count();
  await okno.getByRole('radio', { name: 'Mluvili jsme – co klient chce' }).click();
  const text2 = txt(await okno.innerText());
  await okno.locator('#dovolani-text').fill('podívá se večer s manželkou');
  await okno.getByRole('button', { name: 'Zapsat hovor' }).click();
  await klid(page, 900);
  const v = (await volani(page)).filter((x) => x.fn === 'zapisHovor').pop();
  const s1 = await stav(page);
  const o93 = s1.oznaceni.filter((o) => o.kontakt_id === 93).pop();
  over('O62j', !!z93 && stary === 0 && text.includes('Neodpověděl na návrh.') && !text.includes('Klient není v Označených')
    && /Označení se uzavře/.test(text2)
    && JSON.stringify(v?.args.slice(0, 3)) === JSON.stringify([93, 'mluvili', 'podívá se večer s manželkou']) && v?.ok === true
    && o93?.uzavreno_duvod === 'hovor' && o93?.vysledek === 'mluvili' && s1.zavolat.find((z) => z.id === z93?.id)?.stav === 'hotovo',
    'kalendář: Hotovo u označeného klienta otevře okno s označením (kategorie, věty o označení, ne neutrální věta) a zápis označení uzavře',
    JSON.stringify({ z93: z93?.id, stary, text: text.slice(0, 160), o93 }));
  await ctx.close();
});
await blok050('O062k mikulas', async () => {
  const { ctx, page } = await novaStranka('mikulas');
  await naplanujVDetailu(page, 'Chalupa Za Humny', 60);
  await jdi(page, '#/kalendar', 700);
  const z97 = (await stav(page)).zavolat.find((z) => z.kontakt_id === 97 && z.stav === 'ceka');
  await page.locator(`.zavolat-polozka[data-zavolat-id="${z97?.id}"]`).getByRole('button', { name: 'Hotovo' }).click(KRATKE);
  await klid(page, 600);
  const okno = await page.locator('.dovolani-okno').count();
  const stary = await page.locator('.modal', { hasText: 'Hovor je hotový?' }).count();
  const prehled = (await volani(page)).some((x) => x.fn === 'kontaktPrehled' && x.args[0] === 97);
  over('O62k', !!z97 && okno === 1 && stary === 0 && prehled,
    'kalendář: Hotovo u kampaňové chaty s označením (Nabídnuta sleva) otevře okno Zavolal/a jsem, ne „Hovor je hotový?“',
    JSON.stringify({ z97: z97?.id, okno, stary, prehled }));
  await ctx.close();
});

/* ============ 063 (Albert 1. 11. 2026, druhá etapa): odeslaná připomínka po lhůtě a hvězda od automatizace ============ */
// Ukázková data mocku: 96 je Honzovo označení, lhůta na zavolání minula a připomínka e-mailem odešla (volala mu i Petra, ta
// označení ani čas připomínky nevidí); 24 (Honzův klient) má hvězdu od automatizace s důvodem.
const denCz = (iso) => {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(iso)).split('-').map(Number);
  return `${d}. ${m}. ${y}`;
};
await blok050('E063 mikulas', async () => {
  const { ctx, page } = await novaStranka('mikulas');
  await jdi(page, '#/oznacene', 700);
  const cas = (await stav(page)).oznaceni.find((o) => o.kontakt_id === 96 && o.uzavreno_at === null)?.pripominka_at;
  const r96 = page.locator('table.kontakty tbody tr', { hasText: 'Na Samotě' }).first();
  const lhuta96 = txt(await r96.locator('.lhuta-cell').innerText());
  const r93 = txt(await page.locator('table.kontakty tbody tr', { hasText: 'U Rybníka' }).first().locator('.lhuta-cell').innerText());
  over('E63a', !!cas && /^Lhůta na zavolání do \d{1,2}\. \d{1,2}\. \d{4}/.test(lhuta96) && lhuta96.endsWith(`Připomínka odeslána ${denCz(cas)}`)
    && !/Připomínka odeslána/.test(r93),
    'Označené (super admin): u 96 pod lhůtou „Připomínka odeslána <den>“, u označení bez připomínky ne', `${lhuta96} | ${r93}`);
  await r96.click();
  await klid(page, 500);
  const panel = txt(await page.locator('.drawer .prehled-panel').innerText().catch(() => ''));
  over('E63b', panel.includes(`připomínka po lhůtě: odeslána ${denCz(cas)}`) && /Neodpověděl na návrh/.test(panel),
    'přehled v detailu 96: řádek „připomínka po lhůtě: odeslána <den>“', panel.slice(0, 300));
  await ctx.close();
});
await blok050('E063 petra', async () => {
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/oznacene', 700);
  const oznacene = await page.locator('body').innerText();
  await jdi(page, '#/moji', 700);
  await page.locator('table.kontakty tbody tr', { hasText: 'Na Samotě' }).first().click();
  await klid(page, 500);
  const panel = txt(await page.locator('.drawer .prehled-panel').innerText().catch(() => ''));
  over('E63c', !/Připomínka odeslána/.test(oznacene) && panel.length > 0 && !/připomínka po lhůtě/.test(panel) && !/Neodpověděl na návrh/.test(panel),
    'Petra (volala 96, označení je Honzovo): čas připomínky ani označení nevidí v Označených ani v přehledu', panel.slice(0, 200));
  await ctx.close();
});
await blok050('E063 honza', async () => {
  const { ctx, page } = await novaStranka('honza');
  await jdi(page, '#/moji', 700);
  const k24 = (await stav(page)).kontakty.find((k) => k.id === 24);
  const r24 = page.locator('table.kontakty tbody tr', { hasText: 'U Studánky' }).first();
  const titul = (await r24.locator('.hvezda-prepinac').getAttribute('title')) ?? '';
  over('E63d', k24?.hvezda_kdo === 'automatizace' && titul.includes('dala ji automatizace') && titul.includes(k24.hvezda_duvod ?? '§'),
    'Moji klienti: hvězda od automatizace má v popisku „dala ji automatizace“ a důvod', titul);
  await r24.click();
  await klid(page, 500);
  const tlacitko = txt(await page.locator('.drawer .hvezda-detail button.hvezda-prepinac').innerText().catch(() => ''));
  const panel = txt(await page.locator('.drawer .prehled-panel').innerText().catch(() => ''));
  over('E63e', tlacitko === 'Hvězda od automatizace' && /hvězda: velký zájem, dala ji automatizace \d{1,2}\. \d{1,2}\. \d{4} · /.test(panel)
    && panel.includes(k24?.hvezda_duvod ?? '§'),
    'detail 24: „Hvězda od automatizace“ a v přehledu kdo a proč', `${tlacitko} | ${panel.slice(0, 200)}`);
  await ctx.close();
});

/* ============ OB) obory (migrace 064, návrh oborů 6.2 až 6.7): přepínač, karta „jejich web“, detail, prázdná fronta, Jak volat ============ */
// Bez zapnuté niky appka vypadá jako dřív; s localStorage volacka_demo_obory = autoservis (jen DEMO) se zapne autoservis
// se smyšlenými firmami. Věty o webu jako src/webFirmy.ts (tabulka návrhu 6.3).
const VETA_WEBU = {
  zadny: 'Nemá vlastní web.',
  jen_socialni: 'Má jen profil na sociální síti.',
  zaparkovany: 'Doména je jen zaparkovaná, web na ní není.',
  jiny_web: 'Adresa webu dnes vede na cizí stránku.',
  katalog: 'Má jen profil v katalogu.',
  nenacten: 'Web se při kontrole nepodařilo otevřít, ověř si ho.',
  roboti: 'Web má, ale nešel ohodnotit.',
};
const vetaWebu = (s, h) => VETA_WEBU[s] ?? (h === 'A' || h === 'B' ? 'Má dobrý web.' : h === 'C' ? 'Má průměrný web.' : h ? 'Má web, hodnocení slabé.' : 'Web má, hodnocení chybí.');
await blok050('OB0', async () => {
  // bez zapnuté niky: žádné tlačítko Obory, žádný odkaz „jak volat“, žádné volání app_zavolat_jinde
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/call', 600);
  over('OB0a', (await page.locator('.segment-switch button.obor').count()) === 0 && (await page.locator('.segment-switch button').count()) === 2,
    'bez zapnuté niky má přepínač jen Chaty a Architekti');
  over('OB0b', (await page.locator('nav a[href*="jak-volat"]').count()) === 0, 'bez niky v menu není „jak volat“');
  over('OB0c', !(await volani(page)).some((v) => v.fn === 'zavolatJinde'), 'bez niky se server na hovory jinde neptá', JSON.stringify(nazvyVolani(await volani(page))));
  await ctx.close();
});
await blok050('OB1', async () => {
  // 360 px: dvě řady, bez posunu do strany; karta autoservisu s panelem „jejich web“
  const { ctx, page } = await novaStranka('petra', { sirka: 360, vyska: 740, ls: { volacka_demo_obory: 'autoservis' } });
  await jdi(page, '#/call', 600);
  await page.locator('.segment-switch button.obor').click();
  await page.waitForTimeout(150);
  const niky = await page.locator('.segment-niky button.nika').allInnerTexts();
  over('OB1a', niky.length === 1 && txt(niky[0]) === 'Autoservisy', 'po klepnutí na Obory druhá řada jen se zapnutou nikou', JSON.stringify(niky));
  await page.locator('.segment-niky button.nika').first().click();
  await klid(page, 600);
  const sirka = await page.evaluate(() => document.documentElement.scrollWidth);
  over('OB1b', sirka <= 360, 'při 360 px se obě řady vejdou bez posunu do strany', String(sirka));
  const id = await kartaId(page);
  const k = (await stav(page)).kontakty.find((x) => x.id === id);
  over('OB1c', k?.segment === 'autoservis' && /autoservisy/.test(await eyebrow(page)), 'po volbě niky je na obrazovce autoservis', JSON.stringify(k));
  const panel = txt(await page.locator('.call-card .jejich-web').innerText().catch(() => ''));
  over('OB1d', panel.includes(vetaWebu(k?.web_stav, k?.web_hodnoceni)), 'karta: věta o stavu webu podle tabulky', `${k?.web_stav} ${k?.web_hodnoceni} | ${panel}`);
  const karta = txt(await page.locator('.call-card').innerText());
  over('OB1e', k?.email ? karta.includes('potvrď e-mail v hovoru') : karta.includes('nemáme, zjisti'), 'karta: pokyn potvrdit e-mail (nebo „nemáme, zjisti“)', karta.slice(0, 300));
  over('OB1f', !/(?<!po)známk/i.test(karta) && !/call-hint|Tip pro hovor|TIP PRO HOVOR/.test(await page.locator('.call-card').innerHTML()), 'karta bez slova „známka“ a bez rámečku s tipy');
  over('OB1g', (await page.locator('nav a[href*="jak-volat"]').count()) === 1, 's nikou, která má návody, je v menu „jak volat“ (Albertovy dokumenty, 9. 11. 2026)');
  await ctx.close();
});
await blok050('OB2', async () => {
  // detail kontaktu: blok firmy oboru s panelem „jejich web“ pro každý stav webu (14 smyšlených autoservisů)
  const { ctx, page } = await novaStranka('admin', { ls: { volacka_demo_obory: 'autoservis' } });
  await jdi(page, '#/admin', 600);
  await filtr(page, 'autoservisy').click();
  await klid(page, 500);
  const radky = page.locator('table.kontakty tbody tr');
  const n = await radky.count();
  over('OB2a', n === 14, 'filtr autoservisy ukáže 14 firem', String(n));
  const firmy = (await stav(page)).kontakty.filter((x) => x.segment === 'autoservis');
  const stavy = new Set();
  for (let i = 0; i < n; i++) {
    await radky.nth(i).click();
    await klid(page, 300);
    const blokTxt = txt(await page.locator('.drawer .obor-udaje').innerText().catch(() => ''));
    const f = firmy.find((x) => x.firma && blokTxt.includes(x.firma));
    stavy.add(f?.web_stav ?? '?');
    over('OB2b', !!f && blokTxt.includes(vetaWebu(f.web_stav, f.web_hodnoceni)) && !/(?<!po)známk/i.test(blokTxt),
      'detail: blok firmy oboru s větou o webu', `${f?.firma} ${f?.web_stav} | ${blokTxt.slice(0, 200)}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    if ((await page.locator('.drawer').count()) > 0) {
      await page.locator('.drawer button[aria-label="Zavřít"], .drawer .drawer-close').first().click().catch(() => {});
      await page.waitForTimeout(150);
    }
  }
  over('OB2c', stavy.size === 10, 'detail změřen u všech deseti stavů webu', [...stavy].join(','));
  await ctx.close();
});
await blok050('OB4', async () => {
  // karta s e-mailem: pokyn potvrdit e-mail; bez e-mailu odznak „nemáme, zjisti“ (ve frontě nechaná jedna firma)
  for (const [id, cekam, neni] of [[405, 'potvrď e-mail v hovoru', 'nemáme, zjisti'], [404, 'nemáme, zjisti', 'potvrď e-mail v hovoru']]) {
    const { ctx, page } = await novaStranka('petra', { ls: { volacka_demo_obory: 'autoservis', volacka_segment: 'autoservis' } });
    await page.evaluate((x) => globalThis.__volackaDemoTest.vyprazdniNiku('autoservis', [x]), id);
    await jdi(page, '#/call', 600);
    const karta = txt(await page.locator('.call-card').innerText().catch(() => ''));
    over('OB4', (await kartaId(page)) === id && karta.includes(cekam) && !karta.includes(neni), `karta ${id}: „${cekam}“`, karta.slice(0, 240));
    await ctx.close();
  }
});
await blok050('OB3', async () => {
  // prázdná fronta niky: obecný text z registru a odkaz na Jak volat; stránka Jak volat s textem z registru
  const { ctx, page } = await novaStranka('petra', { ls: { volacka_demo_obory: 'autoservis', volacka_segment: 'autoservis' } });
  await page.evaluate(() => globalThis.__volackaDemoTest.vyprazdniNiku('autoservis'));
  await jdi(page, '#/call', 600);
  const prazdna = txt(await page.locator('.empty-state').innerText().catch(() => ''));
  over('OB3a', prazdna.includes('V oboru autoservisy teď nikdo k volání není.'), 'prázdná fronta niky: obecný text', prazdna);
  // Albert 9. 11. 2026: stránka Jak volat odstraněná; prázdná fronta na ni neodkazuje a stará adresa stránku neukáže
  over('OB3b', (await page.locator('.empty-state a', { hasText: 'Jak volat' }).count()) === 0, 'prázdná fronta niky bez odkazu na Jak volat');
  // Albert 9. 11. 2026 odpoledne: stránka Jak volat s jeho dvěma dokumenty (skript a slovníček) a přepínačem mezi nimi
  await jdi(page, '#/jak-volat', 500);
  const zalozky = await page.locator('.jak-volat .navody-prepinac button').allInnerTexts();
  const obsah1 = txt(await page.locator('.jak-volat [role=tabpanel]').innerText().catch(() => ''));
  over('OB3c', zalozky.join('|') === 'Jak volat řemeslníkům|Slovníček webových pojmů' && obsah1.includes('Ukázka skriptu') && !obsah1.includes('Ukázka slovníčku'),
    'stránka Jak volat: přepínač dvou dokumentů, napřed skript', `${zalozky.join('|')} :: ${obsah1.slice(0, 120)}`);
  await page.locator('.jak-volat .navody-prepinac button', { hasText: 'Slovníček' }).click();
  await page.waitForTimeout(200);
  const obsah2 = txt(await page.locator('.jak-volat [role=tabpanel]').innerText().catch(() => ''));
  over('OB3d', obsah2.includes('Ukázka slovníčku') && obsah2.includes('Doména') && !obsah2.includes('Ukázka skriptu') && /dok=1/.test(page.url()),
    'klepnutí na Slovníček ukáže slovníček', `${page.url()} :: ${obsah2.slice(0, 120)}`);
  await ctx.close();
});

await blok050('OB5', async () => {
  // recenze B9: nika zapnutá, zatímco má volající appku otevřenou, se ukáže po návratu do okna bez odhlášení; nika
  // pozastavená pod rukama dá prázdnou frontu s hláškou serveru (ne chybu) a z přepínače zmizí
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/call', 600);
  const pred = await page.locator('.segment-switch button.obor').count();
  await page.evaluate(() => {
    globalThis.__volackaDemoTest.zapniNiku('autoservis');
    globalThis.__volackaDemoTest.vyprazdniNiku('autoservis');
    window.dispatchEvent(new Event('focus'));
  });
  await klid(page, 500);
  over('OB5a', pred === 0 && (await page.locator('.segment-switch button.obor').count()) === 1,
    'zapnutá nika: tlačítko Obory se objeví po návratu do okna, bez nového přihlášení', String(pred));
  await page.locator('.segment-switch button.obor').click();
  await page.waitForTimeout(150);
  await page.locator('.segment-niky button.nika').first().click();
  await klid(page, 500);
  const prazdna = txt(await page.locator('.empty-state').innerText().catch(() => ''));
  over('OB5b', prazdna.includes('V oboru autoservisy teď nikdo k volání není.'), 'po volbě nové niky se ptá serveru na její frontu', prazdna);
  await page.evaluate(() => globalThis.__volackaDemoTest.nastavStavNiky('autoservis', 'pozastaveno'));
  await page.locator('.empty-state button', { hasText: 'Zkusit znovu' }).click();
  await klid(page, 600);
  const info = txt(await page.locator('.info-box').allInnerTexts().then((a) => a.join(' ')).catch(() => ''));
  over('OB5c', (await page.locator('.error-box').count()) === 0 && (await page.locator('.empty-state').count()) === 1 && info.includes('zatím není spuštěný'),
    'pozastavená nika: prázdná fronta s hláškou serveru, žádná chyba', info);
  over('OB5d', (await page.locator('.segment-switch button.obor').count()) === 0, 'po chybě „není spuštěný“ appka načte registr znovu a nika zmizí');
  await ctx.close();
});
await blok050('OB6', async () => {
  // recenze B9: řádek „Máš naplánovaný hovor“ vykreslený na chatách; na autoservisu karta stavby z průchodu 0b bez cedulky
  // „Po tomhle hovoru dostaneš …“ (Přepnout hned by ji vrátil a 0b by ji dal znovu)
  const { ctx, page } = await novaStranka('petra', { ls: { volacka_demo_obory: 'autoservis,stavby' } });
  await page.evaluate(() => globalThis.__volackaDemoTest.naplanujDosly(421, 2));
  await jdi(page, '#/call', 600);
  const radek = txt(await page.locator('.zavolat-jinde').innerText().catch(() => ''));
  over('OB6a', /Máš naplánovaný hovor: Stav\S* \(1\)/.test(radek), 'na chatách řádek „Máš naplánovaný hovor: Stavby (1)“', radek);
  await page.locator('.segment-switch button.obor').click();
  await page.waitForTimeout(150);
  await page.locator('.segment-niky button.nika', { hasText: 'Autoservis' }).first().click();
  await klid(page, 600);
  const id = await kartaId(page);
  const telo = txt(await page.locator('main, body').first().innerText());
  over('OB6b', id === 421 && !telo.includes('Po tomhle hovoru dostaneš'), 'karta stavby z průchodu 0b na autoservisu bez cedulky o přepnutí',
    `${id} | ${telo.slice(0, 200)}`);
  await ctx.close();
});
await blok050('OB7', async () => {
  // recenze B9 (návrh 6.9): karta hovoru s panelem „jejich web“ pro každý stav webu a cena z registru ve formuláři zájmu
  const { ctx, page } = await novaStranka('petra', { ls: { volacka_demo_obory: 'autoservis', volacka_segment: 'autoservis' } });
  await page.close();
  const stavy = new Set();
  for (const id of [400, 401, 402, 403, 404, 405, 407, 408, 409, 410, 411, 412]) {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => chybyStranky.push(String(e)));
    await p.goto(BASE + '#/moji');
    await p.waitForFunction(() => typeof globalThis.__volackaDemoTest?.vyprazdniNiku === 'function', null, { timeout: 15000 });
    await p.evaluate((x) => globalThis.__volackaDemoTest.vyprazdniNiku('autoservis', [x]), id);
    await jdi(p, '#/call', 500);
    const k = (await stav(p)).kontakty.find((x) => x.id === id);
    const panel = txt(await p.locator('.call-card .jejich-web').innerText().catch(() => ''));
    if ((await kartaId(p)) === id && panel.includes(vetaWebu(k?.web_stav, k?.web_hodnoceni)) && !/(?<!po)známk/i.test(panel)) stavy.add(k?.web_stav);
    else over('OB7a', false, `karta ${id}: věta o webu`, `${k?.web_stav} ${k?.web_hodnoceni} | ${panel}`);
    if (id === 405) {
      await p.locator('.call-card button', { hasText: 'Mají zájem' }).click();
      await p.waitForTimeout(150);
      const ph = (await p.locator('#zajem-cena-web').getAttribute('placeholder')) ?? '';
      const phH = (await p.locator('#zajem-cena-hosting').getAttribute('placeholder')) ?? '';
      over('OB7b', ph.includes('7 000 Kč') && phH.includes('1 000 Kč ročně') && !/podle domluvy/.test(ph), 'zájem u oboru: ceny z registru (R12)', `${ph} | ${phH}`);
    }
    await p.close();
  }
  over('OB7c', stavy.size === 10, 'karta hovoru změřena u všech deseti stavů webu', [...stavy].join(','));
  await ctx.close();
});

await blok050('HO', async () => {
  // Albert 9. 11. 2026: oko u pole hesla (přihlášení, nový člověk a nové heslo v Lidech). Klepnutí heslo ukáže, druhé ho
  // skryje, formulář se tím neodešle a na telefonu oko leží uvnitř pole.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('volacka_supabase_url', ' ');
    localStorage.setItem('volacka_sfx_enabled', '0');
    localStorage.setItem('volacka_music_enabled', '0');
    localStorage.setItem('volacka_pig_enabled', '0');
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
  await page.fill('#password', 'tajne123');
  const oko = page.locator('#password ~ button.heslo-oko');
  const typ = () => page.getAttribute('#password', 'type');
  over('HO1', (await oko.count()) === 1 && (await typ()) === 'password' && (await oko.getAttribute('aria-label')) === 'Zobrazit heslo'
    && (await oko.getAttribute('type')) === 'button', 'přihlášení: oko u hesla, heslo skryté, tlačítko neodesílá formulář');
  await oko.click();
  over('HO2', (await typ()) === 'text' && (await page.inputValue('#password')) === 'tajne123'
    && (await oko.getAttribute('aria-label')) === 'Skrýt heslo' && page.url().includes('login'), 'klepnutí na oko heslo ukáže a formulář neodešle');
  await oko.click();
  over('HO3', (await typ()) === 'password' && (await oko.getAttribute('aria-pressed')) === 'false', 'druhé klepnutí heslo zase skryje');
  const pole = await page.locator('#password').boundingBox();
  const ob = await oko.boundingBox();
  over('HO4', !!pole && !!ob && ob.x >= pole.x && ob.x + ob.width <= pole.x + pole.width + 1 && ob.y >= pole.y - 1
    && ob.y + ob.height <= pole.y + pole.height + 1, 'oko leží uvnitř pole hesla (390 px)', JSON.stringify({ pole, ob }));
  await ctx.close();
  const { ctx: c2, page: p2 } = await novaStranka('admin');
  await jdi(p2, '#/uzivatele', 500);
  over('HO5', (await p2.locator('#nu-password ~ button.heslo-oko').count()) === 1, 'Lidé: oko u hesla nového člověka');
  await c2.close();
});

await blok050('VE', async () => {
  // Albert 9. 11. 2026: po otevření appky začíná volání u elektrikářů (jednou za relaci prohlížeče), když je volající smí volat
  const { ctx, page } = await novaStranka('petra', { ls: { volacka_demo_obory: 'autoservis,elektro', volacka_segment: 'chata' } });
  await jdi(page, '#/call', 800);
  const id1 = await kartaId(page);
  const seg1 = (await stav(page)).kontakty.find((x) => x.id === id1)?.segment;
  over('VE1', (await page.evaluate(() => localStorage.getItem('volacka_segment'))) === 'elektro' && seg1 === 'elektro',
    'po otevření appky začíná volání u elektrikářů, i když byla uložená volba chaty', `${id1} ${seg1}`);
  await page.evaluate(() => localStorage.setItem('volacka_segment', 'chata'));
  await jdi(page, '#/', 400);
  await jdi(page, '#/call', 800);
  over('VE2', (await page.evaluate(() => localStorage.getItem('volacka_segment'))) === 'chata', 've stejné relaci zůstane volba volajícího');
  await ctx.close();
  const { ctx: c2, page: p2 } = await novaStranka('petra', { ls: { volacka_demo_obory: 'autoservis', volacka_segment: 'chata' } });
  await jdi(p2, '#/call', 800);
  over('VE3', (await p2.evaluate(() => localStorage.getItem('volacka_segment'))) === 'chata', 'bez zapnutých elektrikářů zůstane uložená volba');
  await c2.close();
});

/* ============ FP (Přehled vedení úkol 11, Albert 17. 11. 2026): rozložení filtrů v Kontaktech, Moji klienti a Označených ============ */
// Albert: filtry jsou „super messy and clunky … not in terms of the content, but how they are positioned and structured“ (spec
// docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md §7.4). Tři řady: 1. osoba · segment · hledání, 2. stav · známka ·
// neodpověděl · mlčí · čekání (+ koše) · hvězda · odpověděl · řazení vpravo, 3. čipy zapnutých filtrů s křížkem a „Zrušit vše“
// (zruší i osobu, čekání, koš a „Co je potřeba“, segment nechá). Telefon (do 640 px): venku segment, hledání, „Filtry (n)“
// a čipy, ostatní v jednom okně. Filtry, parametry serveru a viditelnost se nemění (měří bloky výš i tests/filtrpanel.test.mjs).
const RADA2_FP = {
  '#/admin': ['Filtr statusu', 'Filtr známky', 'Filtr označení', 'Filtr mlčení', 'Filtr čekání na odpověď', 'Jen s hvězdou', 'Odpověděl, zatím nepotvrdil', 'Řazení'],
  '#/moji': ['Filtr statusu', 'Filtr známky', 'Filtr označení', 'Filtr mlčení', 'Filtr čekání na odpověď', 'Jen s hvězdou', 'Odpověděl, zatím nepotvrdil', 'Řazení'],
  '#/oznacene': ['Filtr statusu', 'Filtr známky', 'Filtr mlčení', 'Jen s hvězdou', 'Odpověděl, zatím nepotvrdil', 'Řazení'],
};
/** Rozložení panelu filtrů na počítači (běží ve stránce). */
function zmerFP() {
  const r1 = document.querySelector('.filtr-panel .filtr-rada-1');
  const r2 = document.querySelector('.filtr-panel .filtr-rada-2');
  const raz = r2?.querySelector('select[aria-label="Řazení"]');
  const r1b = r1?.getBoundingClientRect();
  const r2b = r2?.getBoundingClientRect();
  const rzb = raz?.getBoundingClientRect();
  // ⚠ úkol 10: osoba super admina je výběr lidí (.lide-picker), NAHRAZUJE #person-picker a select volajícího super admina
  const druh = (e) => (e.matches('.lide-picker') ? 'osoba' : e.matches('select') ? 'volajici' : e.matches('.segment-filter') ? 'segment' : 'hledat');
  return {
    panelu: document.querySelectorAll('.filtr-panel').length,
    r1: r1 ? [...r1.querySelectorAll('select[aria-label="Filtr volajícího"], .lide-picker, .segment-filter, input.search-input')].map(druh) : [],
    r2: r2 ? [...r2.querySelectorAll('button.vyber-vice-btn, button.pill-btn, select')].map((e) => e.getAttribute('aria-label')) : [],
    podSebou: !!r1b && !!r2b && r1b.bottom <= r2b.top + 0.5,
    razeniVpravo: !!rzb && !!r2b && Math.abs(rzb.right - r2b.right) <= 2 && rzb.top - r2b.top <= 4,
    cipy: [...document.querySelectorAll('.filtr-panel .filtr-cip')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()),
    sirka: document.documentElement.scrollWidth,
  };
}
for (const kdo of ['admin', 'petra']) {
  await blok050(`FP1 ${kdo}`, async () => {
    const { ctx, page } = await novaStranka(kdo);
    for (const hash of ['#/admin', '#/moji', '#/oznacene']) {
      await jdi(page, hash, 700);
      const m = await page.evaluate(zmerFP);
      // osoba: super admin výběr lidí na všech třech (úkol 10), Volající jen v Kontaktech svůj výběr („Naposledy volal/a já“)
      const osoba = kdo === 'admin' ? ['osoba'] : hash === '#/admin' ? ['volajici'] : [];
      over(`FP1 ${kdo} ${hash}`, m.panelu === 1 && JSON.stringify(m.r1) === JSON.stringify([...osoba, 'segment', 'hledat'])
        && JSON.stringify(m.r2) === JSON.stringify(RADA2_FP[hash]) && m.podSebou && m.razeniVpravo && m.cipy.length === 0 && m.sirka <= 1280,
        `${kdo} ${hash}: řada 1 osoba · segment · hledání, řada 2 filtry s řazením vpravo nahoře, bez čipů`, JSON.stringify(m));
    }
    await ctx.close();
  });
}
await blok050('FP2', async () => {
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/admin', 700);
  await filtr(page, 'architekti').click();
  await jenClovek(page, UID.petra);
  await vyber(page, 'Filtr statusu', ['zajem']);
  await page.locator('button[aria-label="Filtr mlčení"]').click();
  await page.locator('button.mlci-predvolba', { hasText: '10+' }).click();
  await page.keyboard.press('Escape');
  await page.selectOption('select[aria-label="Filtr čekání na odpověď"]', 'ceka_prvni');
  await page.locator('button[aria-label="Jen s hvězdou"]').click();
  await klid(page, 700);
  const cipy = (await page.evaluate(zmerFP)).cipy;
  over('FP2a', JSON.stringify(cipy) === JSON.stringify(['Volající: Petra', 'Stav: Mají zájem', 'Mlčí 10+ prac. dní', 'Čeká na první odpověď', 'K zavolání (7–30 dní)', 'Jen s hvězdou']),
    'čipy zapnutých filtrů v pořadí řad: osoba, stav, mlčí, čekání, koš, hvězda (segment čip nemá)', JSON.stringify(cipy));
  const posledni = async () => (await volani(page)).filter((v) => v.fn === 'listKontakty' && v.args[0]?.limit === 50).pop()?.args[0];
  await page.locator('.filtr-cip', { hasText: 'Jen s hvězdou' }).click();
  await klid(page, 600);
  const a = await posledni();
  // ⚠ úkol 10: vybraná Petra jde serveru jako výběr lidí (user_ids), NAHRAZUJE caller 'Petra'
  over('FP2b', !!a && !a.jen_hvezda && a.status === 'zajem' && a.mlci_min === 10 && a.cekani === 'ceka_prvni' && a.kos === 'k_zavolani'
    && JSON.stringify(a.user_ids) === JSON.stringify([UID.petra]) && !a.caller
    && a.segment === 'architekt' && (await page.locator('button[aria-label="Jen s hvězdou"]').getAttribute('aria-pressed')) === 'false',
    'křížek čipu zruší jen svůj filtr, ostatní jdou na server dál', JSON.stringify(a));
  await page.getByRole('button', { name: 'Zrušit vše', exact: true }).click();
  await klid(page, 700);
  const b = await posledni();
  // ⚠ rozhodnutí koordinátora 18. 11. 2026: výběr člověka je rozsah stránky jako segment, „Zrušit vše“ ho nechá (zůstane jeho
  // čip, „Zrušit vše“ pak už není); NAHRAZUJE FP2c „zruší i volajícího“ z b34677f
  const zbyle = (await page.locator('.filtr-cip').allInnerTexts()).map(txt);
  over('FP2c', !!b && b.segment === 'architekt' && JSON.stringify(b.user_ids) === JSON.stringify([UID.petra]) && !b.status && !b.statusy && !b.mlci_min && !b.cekani && !b.kos && !b.jen_hvezda
    && JSON.stringify(zbyle) === JSON.stringify(['Volající: Petra']) && (await page.getByRole('button', { name: 'Zrušit vše', exact: true }).count()) === 0
    && (await page.locator('select[aria-label="Filtr čekání na odpověď"]').inputValue()) === ''
    && (await lideText(page)) === 'Petra' && (await page.locator('.filtr-kose').count()) === 0
    && (await filtr(page, 'architekti').getAttribute('aria-pressed')) === 'true',
    'Zrušit vše: zruší stav, mlčení, čekání, koš a hvězdu; volajícího a segment nechá', JSON.stringify({ b, zbyle }));
  await ctx.close();
});
await blok050('FP6', async () => {
  // rozhodnutí koordinátora 18. 11. 2026 („a super admin viewing Petra's clients must stay on Petra's clients“): v Moji klienti
  // „Zrušit vše“ zruší filtry, výběr člověka (rozsah stránky) nechá: výběr, nadpis i dotaz na server zůstanou u Petry
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/moji', 700);
  await jenClovek(page, UID.petra);
  await klid(page, 700);
  await vyber(page, 'Filtr statusu', ['nedovolano'], '.moji-filtry');
  await page.locator('.moji-filtry button[aria-label="Jen s hvězdou"]').click();
  await klid(page, 600);
  const pred = (await page.evaluate(zmerFP)).cipy;
  await page.getByRole('button', { name: 'Zrušit vše', exact: true }).click();
  await klid(page, 700);
  const posl = (await volani(page)).filter((v) => v.fn === 'myKontakty' && v.args[0] === 2000).pop();
  const po = (await page.evaluate(zmerFP)).cipy;
  const h1 = txt(await page.locator('h1.page-title').innerText());
  over('FP6', JSON.stringify(pred) === JSON.stringify(['Klienti: Petra', 'Stav: Nedovoláno', 'Jen s hvězdou'])
    && (await lideText(page)) === 'Petra' && /Klienti — Petra/.test(h1)
    && posl?.args[2] === null && JSON.stringify(posl?.args[4]?.user_ids) === JSON.stringify([UID.petra]) && !posl?.args[4]?.status && !posl?.args[4]?.statusy && !posl?.args[4]?.jen_hvezda
    && JSON.stringify(po) === JSON.stringify(['Klienti: Petra']) && (await page.getByRole('button', { name: 'Zrušit vše', exact: true }).count()) === 0,
    'Moji klienti (super admin na klientech Petry): „Zrušit vše“ zruší filtry, Petru nechá (výběr, nadpis i dotaz na server)',
    JSON.stringify({ pred, po, h1, args: posl?.args }));
  await ctx.close();
});
await blok050('FP3', async () => {
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/oznacene', 700);
  const radky = page.locator('table.kontakty tbody tr');
  const vse = await radky.count();
  await page.locator('.oznacene-druhy button', { hasText: 'Neodpověděl na návrh' }).click();
  await page.waitForTimeout(150);
  const jen = await radky.count();
  const cipy = (await page.locator('.filtr-cip').allInnerTexts()).map(txt);
  await page.getByRole('button', { name: 'Zrušit vše', exact: true }).click();
  await klid(page, 600);
  over('FP3', vse > jen && jen >= 1 && JSON.stringify(cipy) === JSON.stringify(['Neodpověděl na návrh']) && (await radky.count()) === vse
    && (await page.locator('.oznacene-druhy button', { hasText: /^Vše/ }).getAttribute('aria-pressed')) === 'true',
    'Označené: pilulka „Co je potřeba“ má čip a Zrušit vše ji zruší', `${vse} → ${jen} → ${await radky.count()} | ${cipy.join(', ')}`);
  await ctx.close();
});
for (const [w, h] of [[390, 844], [360, 780], [320, 700]]) {
  await blok050(`FP4 ${w}`, async () => {
    const { ctx, page } = await novaStranka('admin', { sirka: w, vyska: h });
    await jdi(page, '#/admin', 700);
    const tl = page.locator('button.filtr-telefon-btn');
    const zav = await page.evaluate(() => ({
      sirka: document.documentElement.scrollWidth,
      rada2: document.querySelectorAll('.filtr-rada-2').length,
      venku: !!document.querySelector('.filtr-panel .segment-filter') && !!document.querySelector('.filtr-panel input.search-input'),
    }));
    over(`FP4a ${w}`, (await tl.isVisible()) && txt(await tl.innerText()) === 'Filtry' && zav.rada2 === 0 && zav.venku && zav.sirka <= w,
      'telefon: venku segment, hledání a „Filtry“, ostatní filtry v okně, bez posunu do strany', JSON.stringify(zav));
    await tl.click();
    const okno = page.locator('.filtr-sheet[role="dialog"]');
    await okno.waitFor({ timeout: 4000 });
    await page.waitForTimeout(300); // okno vyjíždí 200 ms
    const ot = await page.evaluate(() => {
      const o = document.querySelector('.filtr-sheet');
      const r = o.getBoundingClientRect();
      const hotovo = o.querySelector('.filtr-sheet-hotovo')?.getBoundingClientRect();
      return {
        sirka: document.documentElement.scrollWidth,
        vOkne: r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 && r.top >= -0.5,
        hotovo: !!hotovo && hotovo.top >= r.top && hotovo.bottom <= innerHeight + 0.5 && hotovo.right <= innerWidth + 0.5,
        ovladace: [...o.querySelectorAll('select[aria-label], button[aria-label]')].map((e) => e.getAttribute('aria-label') ?? e.id),
        // ⚠ úkol 10: osoba super admina = výběr lidí, NAHRAZUJE select „Filtr volajícího“
        lide: !!o.querySelector('.lide-picker button.lide-picker-btn'),
        doStrany: o.scrollWidth > o.clientWidth + 0.5,
      };
    });
    over(`FP4b ${w}`, RADA2_FP['#/admin'].every((a) => ot.ovladace.includes(a)) && ot.lide && ot.vOkne && ot.hotovo && ot.sirka <= w && !ot.doStrany,
      'okno Filtry: osoba, všechny filtry i řazení, celé na obrazovce, tlačítko dole vidět, nic do strany', JSON.stringify(ot));
    await okno.locator('button[aria-label="Filtr statusu"]').click();
    await okno.locator('.vyber-vice-panel input[value="zajem"]').check();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
    const porad = await okno.count();
    await okno.locator('.filtr-sheet-hotovo').click();
    await klid(page, 600);
    const fokus = await page.evaluate(() => document.activeElement?.classList.contains('filtr-telefon-btn') ?? false);
    const cipy = (await page.locator('.filtr-cip').allInnerTexts()).map(txt);
    over(`FP4c ${w}`, porad === 1 && (await okno.count()) === 0 && txt(await tl.innerText()) === 'Filtry (1)' && fokus
      && JSON.stringify(cipy) === JSON.stringify(['Stav: Mají zájem']) && (await page.evaluate(() => document.documentElement.scrollWidth)) <= w,
      'Escape zavře jen výběr stavu, Hotovo okno; tlačítko „Filtry (1)“ dostane fokus, čip stavu je venku, bez posunu do strany',
      `${porad} ${await tl.innerText()} fokus=${fokus} ${cipy.join(', ')}`);
    await tl.click();
    await okno.waitFor({ timeout: 4000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    over(`FP4d ${w}`, (await okno.count()) === 0, 'Escape bez otevřeného výběru zavře okno filtrů');
    await ctx.close();
  });
}
await blok050('FP5 petra 320', async () => {
  // Volající na telefonu 320 px: v okně tytéž filtry jako dřív (v Kontaktech jeho výběr volajícího, v Moji klienti
  // a Označených žádný výběr člověka), stránka se do strany neposouvá se zavřeným ani otevřeným oknem
  const { ctx, page } = await novaStranka('petra', { sirka: 320, vyska: 700 });
  for (const hash of ['#/admin', '#/moji', '#/oznacene']) {
    await jdi(page, hash, 700);
    const zavreno = await page.evaluate(() => document.documentElement.scrollWidth);
    const m = await vFiltrech(page, async () => {
      await page.waitForTimeout(300);
      return page.evaluate(() => ({
        sirka: document.documentElement.scrollWidth,
        ovladace: [...document.querySelectorAll('.filtr-sheet select[aria-label], .filtr-sheet button[aria-label], .filtr-sheet .lide-picker')]
          .map((e) => e.getAttribute('aria-label') ?? e.id).filter((a) => !/^Zavřít/.test(a)),
      }));
    });
    const cekam = hash === '#/admin' ? ['Filtr volajícího', ...RADA2_FP[hash]] : RADA2_FP[hash];
    over(`FP5 ${hash}`, JSON.stringify(m.ovladace) === JSON.stringify(cekam) && zavreno <= 320 && m.sirka <= 320,
      `Volající (${hash}, 320 px): v okně tytéž filtry jako dřív, bez posunu do strany`, JSON.stringify({ zavreno, ...m }));
  }
  await ctx.close();
});

/* ============ T12 (Přehled vedení úkol 12, Albert 17. 11. 2026, D5 a D8): neviditelný časovač práce a důvod odmítnutí ============ */
// Časovač (src/pracovniCas.ts): Volající ve volání pošle signál karta za každou kartu na obrazovce a každých 60 s tep (hodiny
// prohlížeče jsou falešné, ctx.clock), schovaná stránka konec, po odhlášení nic; na stránce o něm nic není. Důvod odmítnutí
// (src/components/DuvodOdmitnuti.tsx): „Nechce web“ (okno Zavolal/a jsem), Odmítnuto v detailu a ve volání u klienta, kterému
// odešel návrh, chce povinný výběr „Proč návrh odmítl“ a uloží ho (odmitnuti_duvod_zapis) až po výsledku; u klienta bez
// návrhu (studený hovor, zájem bez návrhu) se neptá. Chyba uložení důvodu výsledek hovoru nezruší.
const signaly = async (page) => (await volani(page)).filter((v) => v.fn === 'praceTep');
const DUVODY_T12 = ['Už má web nebo ho dělá někdo jiný', 'Je to pro něj drahé', 'Nelíbí se mu návrh', 'Web nepotřebuje', 'Teď ne, možná později',
  'Končí s podnikáním', 'Jiný důvod', 'Neřekl proč'];
const schovejStranku = (page, schovat) => page.evaluate((s) => {
  Object.defineProperty(document, 'visibilityState', { value: s ? 'hidden' : 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}, schovat);
await blok050('T12a petra', async () => {
  const { ctx, page } = await novaStranka('petra', { hodiny: true });
  await jdi(page, '#/call');
  const x = await kartaId(page);
  await page.clock.runFor(1500);
  await klid(page);
  const s1 = await signaly(page);
  const karty1 = s1.filter((v) => v.args[0] === 'karta');
  const ulozene = (await stav(page)).prace;
  over('T12a', x !== null && karty1.length === 1 && karty1[0].args[1] === x && karty1[0].ok === true && s1.some((v) => v.args[0] === 'tep' && v.ok)
    && ulozene.some((p) => p.druh === 'karta' && p.kontakt_id === x && p.user_id === UID.petra) && ulozene.every((p) => p.user_id === UID.petra),
    'Volající ve volání: jedna karta s kontaktem na obrazovce a tep; mock je uložil jen za ni', JSON.stringify({ x, s: s1.map((v) => v.args), ulozene }));
  const tepu = (s) => s.filter((v) => v.args[0] === 'tep').length;
  await page.clock.runFor(61000);
  await klid(page);
  const s2 = await signaly(page);
  over('T12b', tepu(s2) === tepu(s1) + 1 && s2.filter((v) => v.args[0] === 'karta').length === 1,
    'za 60 s další tep, karta se za tutéž kartu neopakuje', JSON.stringify(s2.map((v) => v.args)));
  const viditelne = await page.evaluate(() => document.body.innerText);
  over('T12c', !/časovač|odpracov|pracovní čas/i.test(viditelne), 'časovač na stránce nic neukazuje', viditelne.slice(0, 160));
  await page.getByRole('button', { name: 'Nedovoláno' }).click();
  await klid(page, 400);
  await page.clock.runFor(1500);
  await klid(page);
  const y = await kartaId(page);
  const s3 = await signaly(page);
  over('T12d', y !== null && y !== x && JSON.stringify(s3.filter((v) => v.args[0] === 'karta').map((v) => v.args[1])) === JSON.stringify([x, y]),
    'další karta po výsledku hovoru = další signál karta', JSON.stringify(s3.map((v) => v.args)));
  await schovejStranku(page, true);
  await klid(page);
  const s4 = await signaly(page);
  await page.clock.runFor(130000);
  await klid(page);
  const s5 = await signaly(page);
  over('T12e', s4.at(-1)?.args[0] === 'konec' && s4.filter((v) => v.args[0] === 'konec').length === 1 && s5.length === s4.length,
    'schovaná stránka pošle konec a pak žádný tep', JSON.stringify(s5.slice(s3.length).map((v) => v.args)));
  await schovejStranku(page, false);
  await klid(page);
  const s6 = await signaly(page);
  over('T12f', s6.length === s5.length + 1 && s6.at(-1)?.args[0] === 'tep', 'stránka zase vidět: hned tep', JSON.stringify(s6.slice(s5.length).map((v) => v.args)));
  await page.getByRole('button', { name: 'odhlásit' }).click();
  await page.waitForFunction(() => location.hash.includes('login'));
  await klid(page);
  const s7 = await signaly(page);
  await page.clock.runFor(130000);
  await page.waitForTimeout(200);
  const s8 = await signaly(page);
  over('T12g', s8.length === s7.length, 'po odhlášení žádný signál', JSON.stringify(s8.slice(s7.length).map((v) => v.args)));
  await ctx.close();
});

/** Okno Zavolal/a jsem u řádku `jmeno` na stránce `hash`, výsledek „Nechce web“. */
const nechceWeb = async (page, hash, jmeno) => {
  await jdi(page, hash, 700);
  await page.locator('table.kontakty tbody tr', { hasText: jmeno }).first().locator('button.zavolal-btn').click();
  const okno = page.locator('.dovolani-okno');
  await okno.waitFor(KRATKE);
  const predVolbou = await okno.locator('.duvod-odmitnuti').count();
  await okno.getByRole('radio', { name: 'Nechce web', exact: true }).click();
  await page.waitForTimeout(80);
  return { okno, predVolbou, zapsat: okno.getByRole('button', { name: 'Zapsat hovor' }) };
};
const zapisyDuvodu = async (page) => (await volani(page)).filter((v) => v.fn === 'zapisHovor' || v.fn === 'odmitnutiDuvodZapis' || v.fn === 'updateKontakt'
  || v.fn === 'resolveCall');

await blok050('T12h petra', async () => {
  // 93: Petřin klient s návrhem (Moji klienti, označení „Neodpověděl na návrh“); Jiný důvod chce text
  const { ctx, page } = await novaStranka('petra');
  const { okno, predVolbou, zapsat } = await nechceWeb(page, '#/moji', 'U Rybníka');
  const vyber = okno.locator('select#dovolani-duvod-vyber');
  await vyber.waitFor(KRATKE);
  const stitek = txt(await okno.locator('label[for="dovolani-duvod-vyber"]').innerText());
  const moznosti = (await vyber.locator('option').allInnerTexts()).map(txt);
  const faze = txt(await okno.locator('.duvod-odmitnuti-faze').innerText());
  const bezDuvodu = await zapsat.isDisabled();
  await vyber.selectOption('jine');
  const bezTextu = await zapsat.isDisabled();
  await okno.locator('#dovolani-duvod-text').fill('web mu udělá synovec');
  const sTextem = !(await zapsat.isDisabled());
  const pred = (await volani(page)).length;
  await zapsat.click();
  await klid(page, 700);
  const vs = (await zapisyDuvodu(page)).filter((v) => (v.fn === 'zapisHovor' || v.fn === 'odmitnutiDuvodZapis'));
  const s = await stav(page);
  const info = txt(await page.locator('.dovolani-info').innerText().catch(() => ''));
  over('T12h', predVolbou === 0 && /^Proč návrh odmítl/.test(stitek) && JSON.stringify(moznosti.slice(1)) === JSON.stringify(DUVODY_T12) && moznosti.length === 9
    && faze === 'Zapíše se jako: Odmítl náhled (návrh webu).' && bezDuvodu && bezTextu && sTextem
    && JSON.stringify(vs.map((v) => v.fn)) === '["zapisHovor","odmitnutiDuvodZapis"]' && vs.every((v) => v.ok)
    && JSON.stringify(vs[0].args.slice(0, 2)) === '[93,"nechce"]' && JSON.stringify(vs[1].args) === '[93,"nahled","jine","web mu udělá synovec"]'
    && s.odmitnuti.some((r) => r.kontakt_id === 93 && r.faze === 'nahled' && r.duvod === 'jine' && r.zdroj === 'volajici' && r.zapsal === 'app:2')
    && s.kontakty.find((k) => k.id === 93)?.status === 'odmitnuto' && /je zapsaný: nechce web\./.test(info) && !/neuložil/.test(info)
    && (await page.locator('.dovolani-okno').count()) === 0 && (await volani(page)).length > pred,
    '„Nechce web“ u klienta s návrhem: povinný výběr „Proč návrh odmítl“ (8 důvodů), Jiný důvod chce text; zapis_hovor napřed, pak odmitnuti_duvod_zapis (93, nahled)',
    JSON.stringify({ predVolbou, stitek, moznosti, faze, bezDuvodu, bezTextu, sTextem, vs: vs.map((v) => [v.fn, v.args]), info }));
  await ctx.close();
});

await blok050('T12i honza', async () => {
  // 3: Honzův klient v zájmu, návrh ještě nedostal: „Nechce web“ beze změny jako dřív (bez výběru důvodu, bez druhého volání)
  const { ctx, page } = await novaStranka('honza');
  const { okno, zapsat } = await nechceWeb(page, '#/moji', 'Chalupa Vysočina');
  const vyber = await okno.locator('.duvod-odmitnuti').count();
  const lze = !(await zapsat.isDisabled());
  await zapsat.click();
  await klid(page, 700);
  const vs = await zapisyDuvodu(page);
  over('T12i', vyber === 0 && lze && JSON.stringify(vs.map((v) => v.fn)) === '["zapisHovor"]' && vs[0].ok && (await stav(page)).kontakty.find((k) => k.id === 3)?.status === 'odmitnuto'
    && (await stav(page)).odmitnuti.length === 0,
    '„Nechce web“ u klienta bez návrhu: žádný výběr důvodu, Zapsat hovor hned, jen zapis_hovor', JSON.stringify({ vyber, lze, vs: vs.map((v) => v.fn) }));
  await ctx.close();
});

await blok050('T12j mikulas', async () => {
  // 97: Mikulášův klient ve stavu Nabídnuta sleva (Označené): fáze sleva
  const { ctx, page } = await novaStranka('mikulas');
  const { okno, zapsat } = await nechceWeb(page, '#/oznacene', 'Za Humny');
  const faze = txt(await okno.locator('.duvod-odmitnuti-faze').innerText().catch(() => ''));
  await okno.locator('select#dovolani-duvod-vyber').selectOption('cena');
  await zapsat.click();
  await klid(page, 700);
  const vs = (await zapisyDuvodu(page)).filter((v) => v.fn === 'odmitnutiDuvodZapis');
  const r = (await stav(page)).odmitnuti.at(-1);
  over('T12j', faze === 'Zapíše se jako: Odmítl nabídku za polovinu.' && JSON.stringify(vs.map((v) => v.args)) === '[[97,"sleva","cena",null]]' && vs[0].ok
    && r?.zdroj === 'super_admin' && r?.zapsal === 'app:4',
    'klient s nabídnutou slevou: důvod se zapíše jako odmítnutí nabídky za polovinu (fáze sleva)', JSON.stringify({ faze, vs: vs.map((v) => v.args), r }));
  await ctx.close();
});

await blok050('T12k petra', async () => {
  // detail: změna stavu na Odmítnuto u klienta s návrhem (94) chce důvod a uloží ho po update_kontakt; bez návrhu (20) ne
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/moji', 700);
  const otevri = async (jmeno) => {
    if (await page.locator('.drawer-close').count()) {
      await page.locator('.drawer-close').click();
      await klid(page, 250);
    }
    await page.locator('table.kontakty tbody tr', { hasText: jmeno }).first().locator('td.row-name').click();
    await klid(page, 500);
  };
  const stavSelect = () => page.locator('.drawer .field:has(> label:text-is("Status")) > select');
  const ulozit = () => page.locator('.drawer').getByRole('button', { name: 'Uložit změny' });
  await otevri('Chalupa Na Vršku');
  await stavSelect().selectOption('odmitnuto');
  const bezNavrhu = await page.locator('.drawer .duvod-odmitnuti').count();
  await otevri('Roubenka Na Kopci');
  const predZmenou = await page.locator('.drawer .duvod-odmitnuti').count();
  await stavSelect().selectOption('odmitnuto');
  await page.locator('#duvod-stavu').fill('návrh se mu nelíbí, řekl v telefonu');
  const vyber = page.locator('.drawer select#detail-duvod-vyber');
  const sVyberem = await vyber.count();
  const bezDuvodu = await ulozit().isDisabled();
  await vyber.selectOption('navrh');
  const lze = !(await ulozit().isDisabled());
  await ulozit().click();
  await klid(page, 700);
  const vs = (await zapisyDuvodu(page)).filter((v) => v.fn === 'updateKontakt' || v.fn === 'odmitnutiDuvodZapis');
  const s = await stav(page);
  over('T12k', bezNavrhu === 0 && predZmenou === 0 && sVyberem === 1 && bezDuvodu && lze
    && JSON.stringify(vs.map((v) => v.fn)) === '["updateKontakt","odmitnutiDuvodZapis"]' && vs.every((v) => v.ok)
    && vs[0].args[1]?.status === 'odmitnuto' && vs[0].args[1]?.status_duvod === 'návrh se mu nelíbí, řekl v telefonu'
    && JSON.stringify(vs[1].args) === '[94,"nahled","navrh",null]' && s.kontakty.find((k) => k.id === 94)?.status === 'odmitnuto'
    && (await page.locator('.drawer .error-box').count()) === 0,
    'detail: Odmítnuto u klienta s návrhem chce „Proč návrh odmítl“ (bez něj Uložit vypnuté), stav jde stejně jako dřív a důvod po něm; bez návrhu (20) se neptá',
    JSON.stringify({ bezNavrhu, predZmenou, sVyberem, bezDuvodu, lze, vs: vs.map((v) => [v.fn, v.args]) }));
  await ctx.close();
});

await blok050('T12l petra', async () => {
  // chyba při ukládání důvodu (server bez 072, vynucená háčkem mocku) výsledek hovoru nezruší: hovor zapsaný, věta řekne proč
  const { ctx, page } = await novaStranka('petra');
  const { okno, zapsat } = await nechceWeb(page, '#/moji', 'Chalupa Pod Skálou');
  await okno.locator('select#dovolani-duvod-vyber').selectOption('pozdeji');
  await page.evaluate(() => {
    globalThis.__volackaDemoTest.selhani = (fn) => (fn === 'odmitnutiDuvodZapis' ? 'Důvod odmítnutí server ještě neumí (chybí na něm migrace 072).' : null);
  });
  await zapsat.click();
  await klid(page, 700);
  const vs = (await zapisyDuvodu(page)).filter((v) => v.fn === 'zapisHovor' || v.fn === 'odmitnutiDuvodZapis');
  const info = txt(await page.locator('.dovolani-info').innerText().catch(() => ''));
  const s = await stav(page);
  over('T12l', JSON.stringify(vs.map((v) => [v.fn, v.ok])) === '[["zapisHovor",true],["odmitnutiDuvodZapis",false]]'
    && s.kontakty.find((k) => k.id === 95)?.status === 'odmitnuto' && s.odmitnuti.length === 0 && (await page.locator('.dovolani-okno').count()) === 0
    && /je zapsaný: nechce web\.( Zapsáno jako další hovor bez označení\.)? Důvod odmítnutí se ale neuložil: Důvod odmítnutí server ještě neumí \(chybí na něm migrace 072\)\.$/.test(info),
    'neuložený důvod: hovor zůstane zapsaný (stav Odmítnuto), okno se zavře a věta řekne, že důvod se neuložil a proč', JSON.stringify({ vs: vs.map((v) => [v.fn, v.ok, v.chyba]), info }));
  await ctx.close();
});

await blok050('T12m petra', async () => {
  // volání: klient s návrhem, který se vrátil do fronty (95 → Nedovoláno v detailu) a má Petřin hovor, jehož čas nastal; Odmítnuto
  // chce důvod a uloží ho po resolve_call. Studená karta bez návrhu (10, Petřin starší naplánovaný hovor, přijde první) má
  // potvrzení beze změny.
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/moji', 700);
  await page.locator('table.kontakty tbody tr', { hasText: 'Chalupa Pod Skálou' }).first().locator('td.row-name').click();
  await klid(page, 500);
  await page.locator('.drawer .field:has(> label:text-is("Status")) > select').selectOption('nedovolano');
  await page.locator('#duvod-stavu').fill('zavolat znovu');
  await page.locator('.drawer').getByRole('button', { name: 'Uložit změny' }).click();
  await klid(page, 500);
  await page.locator('.drawer-close').click();
  await page.evaluate(() => globalThis.__volackaDemoTest.naplanujDosly(95, 2));
  await jdi(page, '#/call', 700);
  const studenaKarta = await kartaId(page);
  await page.getByRole('button', { name: 'Odmítnuto' }).click();
  const studene = page.locator('.modal', { hasText: 'Opravdu odmítnuto?' });
  await studene.waitFor(KRATKE);
  const studenaBezVyberu = (await studene.locator('.duvod-odmitnuti').count()) === 0 && !(await studene.getByRole('button', { name: 'Ano, odmítli' }).isDisabled());
  await studene.getByRole('button', { name: 'Zpět' }).click();
  await page.getByRole('button', { name: 'Nedovoláno' }).click();
  await klid(page, 700);
  const karta = await kartaId(page);
  await page.getByRole('button', { name: 'Odmítnuto' }).click();
  const modal = page.locator('.modal', { hasText: 'Opravdu odmítnuto?' });
  await modal.waitFor(KRATKE);
  const ano = modal.getByRole('button', { name: 'Ano, odmítli' });
  const vypnuto = await ano.isDisabled();
  // na telefonu (390 px) výběr nezakrývá sloupec prasátka (z-index 1001) a stránka se neposouvá do strany
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const naTelefonu = await page.evaluate(() => {
    const s = document.querySelector('#volani-duvod-vyber');
    const r = s.getBoundingClientRect();
    const nahore = document.elementFromPoint(r.left + 6, r.top + r.height / 2);
    return { odkryty: !!nahore && (nahore === s || s.contains(nahore)), bezPosunu: document.documentElement.scrollWidth <= innerWidth };
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(150);
  await modal.locator('select#volani-duvod-vyber').selectOption('nepotrebuje');
  await ano.click();
  await klid(page, 700);
  const vs = (await zapisyDuvodu(page)).filter((v) => v.fn === 'resolveCall' || v.fn === 'odmitnutiDuvodZapis');
  const odmitnuti = vs.filter((v) => v.fn === 'odmitnutiDuvodZapis' || v.args[0]?.outcome === 'odmitnuto');
  over('T12m', studenaKarta === 10 && studenaBezVyberu && karta === 95 && vypnuto && naTelefonu.odkryty && naTelefonu.bezPosunu
    && JSON.stringify(odmitnuti.map((v) => v.fn)) === '["resolveCall","odmitnutiDuvodZapis"]' && odmitnuti.every((v) => v.ok)
    && odmitnuti[0].args[0]?.kontakt_id === 95 && JSON.stringify(odmitnuti[1].args) === '[95,"nahled","nepotrebuje",null]'
    && (await stav(page)).kontakty.find((k) => k.id === 95)?.status === 'odmitnuto',
    'volání: studená karta (10) bez výběru důvodu; klient s návrhem zpátky ve frontě (95): Odmítnuto chce důvod (na telefonu nezakrytý), resolve_call napřed, pak odmitnuti_duvod_zapis',
    JSON.stringify({ studenaKarta, studenaBezVyberu, karta, vypnuto, naTelefonu, vs: vs.map((v) => [v.fn, v.args]) }));
  await ctx.close();
});

/* ============ LP (Přehled vedení úkol 10, Albert 17. 11. 2026, D7): výběr lidí super admina ============ */
// Albert: „all the super admins can view everyone, but they can also filter out only their team … compare or combine any two
// callers … easy to select how many people they want to see“ (spec §7.3). Jeden výběr (src/components/LidePicker.tsx) na sedmi
// stránkách: předvolby, hledání, klávesnice (šipky, mezerník, Escape), sjednocení lidí na serveru (p_user_ids, migrace 074),
// Statistiky víc lidí ze součtu prehled_lide (migrace 073) s odkazem „Porovnat v Přehledu“, telefon (okno odspodu, v okně
// filtrů rozbalený), Rozvrh a Zprávy; Volající výběr nikde nevidí a nic nového nedostane. E2E_SNIMKY=/složka uloží snímky.
const SNIMKY = process.env.E2E_SNIMKY || '';
const snimek = async (page, jmeno) => {
  if (SNIMKY) await page.screenshot({ path: join(SNIMKY, `${jmeno}.png`) });
};
const posledniSeznam = async (page) => (await volani(page)).filter((v) => v.fn === 'listKontakty' && v.args[0]?.limit === 50).pop()?.args[0];
await blok050('LP1 klávesnice', async () => {
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/admin', 700);
  const tl = page.locator('button.lide-picker-btn');
  over('LP1a', (await tl.count()) === 1 && (await lideText(page)) === 'Všichni (5)' && (await tl.getAttribute('aria-expanded')) === 'false'
    && (await tl.getAttribute('aria-haspopup')) === 'dialog' && (await page.locator('.lide-picker-panel').count()) === 0,
    'Kontakty super admina: jeden výběr lidí „Všichni (5)“, zavřený, bez panelu');
  await tl.click();
  const panel = page.locator('.lide-picker-panel');
  await panel.waitFor(KRATKE);
  await page.waitForTimeout(200);
  const predvolby = (await panel.locator('button.lide-predvolba').allInnerTexts()).map(txt);
  const zapnuta = txt(await panel.locator('button.lide-predvolba[aria-pressed="true"]').innerText());
  const fokus1 = await page.evaluate(() => document.activeElement?.classList.contains('lide-hledat-pole') ?? false);
  await snimek(page, 'kontakty-vyber-1280');
  over('LP1b', (await tl.getAttribute('aria-expanded')) === 'true' && JSON.stringify(predvolby) === JSON.stringify(['Já', 'Můj tým (3)', 'Všichni (5)', 'Tým Mikuláš (2)'])
    && zapnuta === 'Všichni (5)' && fokus1 && (await panel.locator('.lide-skupina').count()) === 2,
    'otevřený panel: předvolby Já / Můj tým / Všichni / Tým Mikuláš, zapnutá Všichni, dva týmy, fokus v hledání', JSON.stringify({ predvolby, zapnuta, fokus1 }));
  await page.keyboard.type('mik');
  const radky = (await panel.locator('.lide-radek .lide-jmeno').allInnerTexts()).map(txt);
  await page.keyboard.press('ArrowDown');
  const fokus2 = await page.evaluate(() => document.activeElement?.closest('.lide-radek')?.getAttribute('data-user-id') ?? null);
  await page.keyboard.press('ArrowUp');
  const fokus3 = await page.evaluate(() => document.activeElement?.classList.contains('lide-hledat-pole') ?? false);
  over('LP1c', JSON.stringify(radky) === JSON.stringify(['Mikuláš']) && fokus2 === '4' && fokus3,
    'hledání „mik“ ukáže jen Mikuláše (bez diakritiky), šipka dolů na něj, nahoru zpět do hledání', JSON.stringify({ radky, fokus2, fokus3 }));
  await panel.locator('.lide-hledat-pole').fill('');
  await panel.locator('.lide-hledat-pole').focus();
  await page.keyboard.press('ArrowDown');
  const prvni = await page.evaluate(() => document.activeElement?.closest('.lide-radek')?.getAttribute('data-user-id') ?? null);
  await page.keyboard.press('Space');
  await klid(page, 600);
  const poMezerniku = await lideText(page);
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'detached', timeout: 4000 });
  const fokusTl = await page.evaluate(() => document.activeElement?.classList.contains('lide-picker-btn') ?? false);
  const posl = await posledniSeznam(page);
  over('LP1d', prvni === '1' && poMezerniku === '4 lidé' && fokusTl && JSON.stringify(posl?.user_ids) === '[2,3,4,5]' && !posl?.caller
    && (await tl.getAttribute('aria-expanded')) === 'false',
    'mezerník odškrtne prvního (já, Můj tým napřed): ze Všech zůstanou 4 lidé (user_ids), Escape zavře a vrátí fokus na tlačítko',
    JSON.stringify({ prvni, poMezerniku, fokusTl, posl }));
  // oprava po recenzi (bod 2): Tab z posledního prvku panelu ven panel zavře a fokus nechá na dalším prvku stránky (ne na tlačítku)
  await tl.click();
  await panel.waitFor(KRATKE);
  await panel.locator('.lide-aktivni input').focus();
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
  const poTabu = await page.evaluate(() => ({
    btn: document.activeElement?.classList.contains('lide-picker-btn') ?? false,
    vPanelu: !!document.activeElement?.closest('.lide-picker-panel'),
    segment: !!document.activeElement?.closest('.segment-filter'),
  }));
  const zavrenoTabem = (await panel.count()) === 0;
  // oprava po recenzi (bod 3): Escape s fokusem na tlačítku (panel otevřený) panel zavře
  await tl.click();
  await panel.waitFor(KRATKE);
  await tl.focus();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  over('LP1e', zavrenoTabem && !poTabu.btn && !poTabu.vPanelu && poTabu.segment && (await panel.count()) === 0 && (await tl.getAttribute('aria-expanded')) === 'false',
    'Tab z panelu ven: panel zavřený a fokus na dalším prvku (segment), ne zpátky na tlačítku; Escape s fokusem na tlačítku panel zavře',
    JSON.stringify({ poTabu, zavrenoTabem }));
  await ctx.close();
});
await blok050('LP2 dva lidé a tým', async () => {
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/admin', 700);
  await jenClovek(page, UID.petra);
  await klid(page, 500);
  await vLidech(page, (panel) => panel.locator('.lide-radek[data-user-id="3"] input[type="checkbox"]').check());
  await klid(page, 800);
  const s = await stav(page);
  const ocek = s.kontakty.filter((k) => k.last_caller === 'Petra' || k.last_caller === 'Honza').length;
  const posl = await posledniSeznam(page);
  const pocet = txt(await page.locator('h1.page-title .count-pill').innerText().catch(() => ''));
  const cipy = (await page.locator('.filtr-cip').allInnerTexts()).map(txt);
  over('LP2a', (await lideText(page)) === 'Petra + Honza' && JSON.stringify(posl?.user_ids) === '[2,3]' && !posl?.caller && pocet === String(ocek) && ocek > 2
    && cipy.includes('Volající: Petra + Honza') && (await page.locator('button.lide-picker-btn.zapnuto').count()) === 1,
    'Kontakty: Petra + Honza = sjednocení jejich kontaktů (user_ids), čip a žluté tlačítko', JSON.stringify({ posl, pocet, ocek, cipy }));
  await predvolba(page, 'Můj tým');
  await klid(page, 700);
  const tym = await posledniSeznam(page);
  const pocty = (await volani(page)).filter((v) => v.fn === 'listKontakty' && v.args[0]?.limit === 1).slice(-3).map((v) => v.args[0]?.user_ids);
  over('LP2b', (await lideText(page)) === 'Můj tým (3)' && JSON.stringify(tym?.user_ids) === '[1,2,5]' && pocty.every((x) => JSON.stringify(x) === '[1,2,5]'),
    'Můj tým = já a moji lidé (Albert, Petra, Eva) v seznamu i v počtech u stavů', JSON.stringify({ tym, pocty }));
  await page.locator('.filtr-cip', { hasText: 'Volající: Můj tým (3)' }).click();
  await klid(page, 700);
  const zpet = await posledniSeznam(page);
  over('LP2c', (await lideText(page)) === 'Všichni (5)' && !zpet?.user_ids && !zpet?.caller && (await page.locator('button.lide-picker-btn.zapnuto').count()) === 0,
    'křížek čipu vrátí Všechny (bez filtru volajícího, jako dřív)', JSON.stringify(zpet));
  await ctx.close();
});
await blok050('LP3 Statistiky víc lidí', async () => {
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/stats', 800);
  await predvolba(page, 'Můj tým');
  await klid(page, 900);
  const s = await stav(page);
  const hovory = s.callLog.filter((l) => [1, 2, 5].includes(l.user_id)).length;
  const v = (await volani(page)).filter((x) => x.fn === 'prehledLide').pop();
  const odkaz = await page.locator('a.stats-porovnat').getAttribute('href').catch(() => null);
  const hovoryKarta = await karta(page, 'Hovory');
  await snimek(page, 'statistiky-tym-1280');
  // oprava po recenzi (bod 7): odkaz ve formátu úkolu 13 s obdobím (posledních 730 dní) a týmem
  const odkazOcek = `#/prehled/lide?od=${v?.args[0]?.od}&do=${denP(Date.now())}&tym=1`;
  over('LP3a', (await page.locator('.stats-kombinace').count()) === 1 && hovoryKarta === String(hovory) && hovory > 0
    && JSON.stringify(v?.args[0]?.lide) === '[1,2,5]' && v?.args[0]?.do === denP(Date.now()) && odkaz === odkazOcek
    && (await page.locator('.vydelek').count()) === 0 && (await page.locator('.zajem-volajici').count()) === 1,
    'Statistiky Můj tým: karty ze součtu prehled_lide, odkaz „Porovnat v Přehledu“, bez výdělku jednoho člověka, tabulka 069 zůstane',
    JSON.stringify({ hovory, hovoryKarta, args: v?.args, odkaz }));
  await page.selectOption('#obdobi-select', 'den');
  await klid(page, 800);
  const vDen = (await volani(page)).filter((x) => x.fn === 'prehledLide').pop();
  over('LP3b', vDen?.args[0]?.od === denP(Date.now()) && vDen?.args[0]?.do === denP(Date.now()) && (await page.locator('.stats-kombinace').count()) === 1
    && !(await volani(page)).some((x) => x.fn === 'allStats' && x.args[0]),
    'jeden den: součet vybraných za ten den (od = do = den), all_stats dne netřeba', JSON.stringify(vDen?.args));
  await page.selectOption('#obdobi-select', 'celkem');
  await klid(page, 500);
  await jenClovek(page, UID.petra);
  await klid(page, 900);
  over('LP3c', (await page.locator('.stats-kombinace').count()) === 0 && (await page.locator('.vydelek-celkem').count()) === 1 && (await karta(page, 'Hovorů')) !== null
    && (await volani(page)).some((x) => x.fn === 'statistikyVolani' && x.args[0] === UID.petra),
    'jeden člověk: dosavadní pohled (karty, výdělek Petry)');
  // oprava po recenzi (bod 1): „Dovoláno“ Petry + Honzy dohromady = součet jejich „Dovoláno“ jednotlivě (zájem + odmítnutí)
  const dovPetra = Number(await karta(page, 'Dovoláno'));
  await jenClovek(page, UID.honza);
  await klid(page, 800);
  const dovHonza = Number(await karta(page, 'Dovoláno'));
  await vLidech(page, (panel) => panel.locator('.lide-radek[data-user-id="2"] input[type="checkbox"]').check());
  await klid(page, 900);
  const dovSpolu = Number(await karta(page, 'Dovoláno'));
  const odkazDva = await page.locator('a.stats-porovnat').getAttribute('href').catch(() => null);
  const popis = txt(await page.locator('.stats-kombinace').innerText().catch(() => ''));
  over('LP3d', (await page.locator('.stats-kombinace').count()) === 1 && dovPetra + dovHonza > 0 && dovSpolu === dovPetra + dovHonza
    && /nerelevantní ani přeplánované se nepočítají/.test(popis) && /&lide=2,3$/.test(odkazDva ?? ''),
    'Statistiky Petra + Honza: „Dovoláno“ = součet jejich „Dovoláno“ jednotlivě (stejné číslo jako u jednoho člověka), odkaz s lide=2,3',
    JSON.stringify({ dovPetra, dovHonza, dovSpolu, odkazDva }));
  await ctx.close();
});
await blok050('LP4 Volající', async () => {
  const { ctx, page } = await novaStranka('petra');
  const vidi = [];
  for (const h of ['#/admin', '#/moji', '#/oznacene', '#/stats', '#/kalendar', '#/zpravy', '#/rozvrh']) {
    await jdi(page, h, 600);
    if ((await page.locator('.lide-picker').count()) > 0) vidi.push(h);
  }
  const vs = await volani(page);
  const sVyberem = vs.filter((v) => /"user_ids":\[\d/.test(JSON.stringify(v.args)) || ((v.fn === 'zavolatSeznam' || v.fn === 'listThreads') && Array.isArray(v.args[3])));
  over('LP4', vidi.length === 0 && sVyberem.length === 0 && !vs.some((v) => v.fn === 'prehledLide' || v.fn === 'allStats'),
    'Volající: výběr lidí na žádné ze sedmi stránek, žádný výběr lidí serveru, žádné prehled_lide ani all_stats',
    JSON.stringify({ vidi, sVyberem: sVyberem.map((v) => v.fn) }));
  await ctx.close();
});
for (const [w, h] of [[390, 844], [320, 700]]) {
  await blok050(`LP5 ${w}`, async () => {
    const { ctx, page } = await novaStranka('admin', { sirka: w, vyska: h });
    await jdi(page, '#/stats', 800);
    await page.locator('button.lide-picker-btn').click();
    const okno = page.locator('.lide-sheet[role="dialog"]');
    await okno.waitFor(KRATKE);
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const o = document.querySelector('.lide-sheet');
      const r = o.getBoundingClientRect();
      const hot = o.querySelector('.lide-sheet-hotovo').getBoundingClientRect();
      return {
        sirka: document.documentElement.scrollWidth,
        cela: r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 && r.top >= -0.5,
        hotovo: hot.bottom <= innerHeight + 0.5 && hot.right <= innerWidth + 0.5,
        doStrany: o.scrollWidth > o.clientWidth + 0.5,
        modal: o.getAttribute('aria-modal'),
        fokus: document.activeElement?.classList.contains('lide-sheet-zavrit') ?? false,
      };
    });
    await snimek(page, `statistiky-vyber-${w}`);
    await okno.locator('.lide-radek[data-user-id="2"] button.lide-jen').click();
    await okno.locator('.lide-radek[data-user-id="3"] input[type="checkbox"]').check();
    await okno.locator('.lide-sheet-hotovo').click();
    await okno.waitFor({ state: 'detached', timeout: 4000 });
    await klid(page, 800);
    const fokus = await page.evaluate(() => document.activeElement?.classList.contains('lide-picker-btn') ?? false);
    const sirkaPo = await page.evaluate(() => document.documentElement.scrollWidth);
    if (w === 390) await snimek(page, 'statistiky-petra-honza-390');
    over(`LP5 ${w}`, m.cela && m.hotovo && !m.doStrany && m.sirka <= w && m.modal === 'true' && m.fokus && fokus && (await lideText(page)) === 'Petra + Honza'
      && (await page.locator('.stats-kombinace').count()) === 1 && sirkaPo <= w,
      `telefon ${w} px: výběr lidí jako okno odspodu přes celou šířku, Hotovo vidět, bez posunu do strany, fokus zpět na tlačítko, součet dvou lidí`,
      JSON.stringify({ ...m, fokus, sirkaPo }));
    await ctx.close();
  });
}
await blok050('LP6 390 v okně filtrů', async () => {
  const { ctx, page } = await novaStranka('admin', { sirka: 390, vyska: 844 });
  await jdi(page, '#/admin', 700);
  await otevriFiltry(page);
  await page.locator('.filtr-sheet button.lide-picker-btn').click();
  const vlozeny = page.locator('.filtr-sheet .lide-picker-panel.vlozeny');
  await vlozeny.waitFor(KRATKE);
  await page.waitForTimeout(250);
  const m = await page.evaluate(() => ({ sirka: document.documentElement.scrollWidth, okno: !!document.querySelector('.lide-sheet') }));
  await snimek(page, 'kontakty-filtry-vyber-390');
  // oprava po recenzi (bod 3): Escape s fokusem jinde v okně (tlačítko stavu) zavře napřed otevřený výběr lidí, okno zůstane
  await page.locator('.filtr-sheet button[aria-label="Filtr statusu"]').focus();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const porad = await page.locator('.filtr-sheet').count();
  const panelPryc = await vlozeny.count();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  over('LP6', !m.okno && m.sirka <= 390 && porad === 1 && panelPryc === 0 && (await page.locator('.filtr-sheet').count()) === 0,
    'telefon v okně Filtry: výběr lidí se rozbalí v okně (žádné druhé okno), Escape (i s fokusem jinde v okně) zavře napřed výběr, pak okno filtrů',
    JSON.stringify({ m, porad, panelPryc }));
  await ctx.close();
});
await blok050('LP7 Rozvrh a Zprávy', async () => {
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/rozvrh', 700);
  const pred = (await page.locator('.rozvrh-clovek').allInnerTexts()).length;
  await predvolba(page, 'Tým Mikuláš');
  await klid(page, 400);
  const radky = (await page.locator('.rozvrh-clovek .u-name').allInnerTexts()).map(txt);
  await jenClovek(page, UID.petra);
  await klid(page, 600);
  over('LP7a', pred >= 2 && JSON.stringify(radky) === JSON.stringify(['Honza']) && txt(await page.locator('h2.rozvrh-kdo').innerText()) === 'Petra'
    && (await page.locator('.rozvrh-clovek').count()) === 1,
    'Rozvrh: výběr zúží přehled (Tým Mikuláš = Honza, Mikuláš rozvrh nemá), jeden vybraný člověk = jeho rozvrh v úpravě', JSON.stringify({ pred, radky }));
  await jdi(page, '#/zpravy', 700);
  await predvolba(page, 'Tým Mikuláš');
  await klid(page, 600);
  const vt = (await volani(page)).filter((v) => v.fn === 'listThreads').pop();
  over('LP7b', JSON.stringify(vt?.args[3] ?? null) === '[3,4]' && (vt?.args[2] ?? null) === null,
    'Zprávy: tým jde serveru jako výběr lidí (user_ids), ne jeden člověk', JSON.stringify(vt?.args));
  await jdi(page, '#/oznacene', 700);
  await predvolba(page, 'Bez volajícího');
  await klid(page, 600);
  const vo = (await volani(page)).filter((v) => v.fn === 'listOznacene').pop();
  over('LP7c', vo?.args[0]?.bez_volajiciho === true && !vo?.args[0]?.user_ids && (await lideText(page)) === 'Bez volajícího',
    'Označené: předvolba „Bez volajícího“ jako dřív (p_bez_volajiciho), bez výběru lidí', JSON.stringify(vo?.args));
  await ctx.close();
});

// oprava po recenzi (bod 6): server bez migrace 074. Háček mocku `selhani` odmítne každé volání s výběrem lidí hláškou
// BEZ_074_LIDE (tak ji appka dostane ze supabase.ts na PGRST202). Jeden vybraný člověk = stránka zavolá znovu dnešním voláním
// jednoho člověka; víc lidí = hláška „chybí migrace 074“ v chybě stránky.
const BEZ_074_E2E = /export const BEZ_074_LIDE =\s*'([^']+)';/.exec(readFileSync(join(ROOT, 'src/api/supabase.ts'), 'utf8'))?.[1] ?? 'chybí BEZ_074_LIDE';
const NAVRAT_074 = {
  '#/admin': { fn: 'listKontakty', jeden: (a) => a[0]?.caller === 'Petra' && !a[0]?.user_ids && a[0]?.limit === 50 },
  '#/moji': { fn: 'myKontakty', jeden: (a) => a[2] === UID.petra && !a[4]?.user_ids },
  '#/oznacene': { fn: 'listOznacene', jeden: (a) => a[0]?.user_id === UID.petra && !a[0]?.user_ids },
  '#/kalendar': { fn: 'zavolatSeznam', jeden: (a) => a[0] === UID.petra && !a[3] },
  '#/zpravy': { fn: 'listThreads', jeden: (a) => a[2] === UID.petra && !a[3] },
};
await blok050('LP8 server bez 074', async () => {
  const { ctx, page } = await novaStranka('admin');
  await page.evaluate((bez) => {
    globalThis.__volackaDemoTest.selhani = (fn, args) =>
      /"user_ids":\[\d/.test(JSON.stringify(args)) || ((fn === 'zavolatSeznam' || fn === 'listThreads') && Array.isArray(args[3]) && args[3].length > 0) ? bez : null;
  }, BEZ_074_E2E);
  const vysledky = {};
  for (const [hash, { fn, jeden }] of Object.entries(NAVRAT_074)) {
    await jdi(page, hash, 700);
    const pred = (await volani(page)).length;
    await jenClovek(page, UID.petra);
    await klid(page, 700);
    const po = (await volani(page)).slice(pred).filter((v) => v.fn === fn);
    const chyba1 = await page.locator('.error-box').count();
    await vLidech(page, (panel) => panel.locator('.lide-radek[data-user-id="3"] input[type="checkbox"]').check());
    await klid(page, 700);
    const chyba2 = txt(await page.locator('.error-box').first().innerText().catch(() => ''));
    vysledky[hash] = {
      odmitnuto074: po.some((v) => v.ok === false && v.chyba === BEZ_074_E2E),
      navrat: po.some((v) => v.ok === true && jeden(v.args)),
      bezChyby: chyba1 === 0,
      hlaska: chyba2 === BEZ_074_E2E,
    };
  }
  over('LP8', Object.values(vysledky).every((r) => r.odmitnuto074 && r.navrat && r.bezChyby && r.hlaska) && Object.keys(vysledky).length === 5,
    'server bez 074 na pěti stránkách: jeden člověk = znovu dnešní volání jednoho člověka bez chyby, dva lidé = hláška „chybí migrace 074“',
    JSON.stringify(vysledky));
  await ctx.close();
});

/* ============ PV (Přehled vedení úkol 13, Albert 17. 11. 2026, D1, D2 a D12): stránka #/prehled jen pro super admina ============ */
// Spec §7.1, §7.2 a §7.8: pilulka a dlaždice super admina, záložky jako podstránky, filtr v adrese (proklik i odkaz ho drží), osm
// karet s „i“ a řádky (součet řádků = karta), stránkování a CSV (apostrof před vzorcem, bez telefonu a e-mailu), stavy (server bez
// migrace 073 = jen hláška, nikdy ukázková data), klávesnice (Tab, Escape, fokus zpět), telefon 320/360/390 bez posunu do strany.
// Volající: žádná pilulka ani dlaždice, #/prehled ho vrátí domů a mock nedostane žádné volání prehled_*, cile_*, naklady_*, provize_*.
const BEZ_073_E2E = /export const BEZ_073_PREHLED = '([^']+)';/.exec(readFileSync(join(ROOT, 'src/api/supabase.ts'), 'utf8'))?.[1] ?? 'chybí BEZ_073_PREHLED';
const PRAHA_PV = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' });
const dnesPV = () => PRAHA_PV.format(new Date());
const posunPV = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const KARTY_PV = ['hodnota_prodeju', 'inkaso', 'pocet_prodeju', 'plneni_cile', 'uspesnost', 'otevrene', 'odhad_mesic', 'k_zasahu'];
const ZALOZKY_PV = ['vedeni', 'lide', 'pipeline', 'klienti', 'komunikace', 'finance', 'dodani', 'prognoza'];
const snimekCely = async (page, jmeno) => {
  if (SNIMKY) await page.screenshot({ path: join(SNIMKY, `${jmeno}.png`), fullPage: true });
};
const hashPV = (page) => page.evaluate(() => location.hash);
const kartaPV = (page, klic) => page.locator(`.kpi-karta[data-klic="${klic}"]`);
const posledniPV = async (page, fn) => (await volani(page)).filter((v) => v.fn === fn).pop();
/** Klávesou: fokus a Enter (prasátko v rohu obrazovky by mohlo zakrýt klik; zároveň měří, že jde ovládat klávesnicí). */
const enterPV = async (page, locator) => {
  await locator.focus();
  await page.keyboard.press('Enter');
};

await blok050('PV1 vstup', async () => {
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/', 500);
  const dlazdice = page.locator('a.big-tile[href="#/prehled"]');
  const pilulka = page.locator('nav a.nav-pill[href="#/prehled"]');
  over('PV1a', (await dlazdice.count()) === 1 && /PŘEHLED/.test(await dlazdice.innerText()) && (await pilulka.count()) === 1 && txt(await pilulka.innerText()) === 'přehled',
    'super admin: dlaždice PŘEHLED na Domů a pilulka „přehled“ v menu', String(await dlazdice.count()));
  await enterPV(page, dlazdice);
  await klid(page, 900);
  const karty = await page.locator('.kpi-karta[data-klic]').evaluateAll((els) => els.map((e) => e.getAttribute('data-klic')));
  over('PV1b', (await hashPV(page)).startsWith('#/prehled/vedeni') && JSON.stringify(karty) === JSON.stringify(KARTY_PV)
    && txt(await page.locator('h1.page-title').innerText()) === 'Přehled vedení',
    '#/prehled vede na záložku Vedení s osmi kartami v pořadí kontraktu (§5.2)', `${await hashPV(page)} ${JSON.stringify(karty)}`);
  const hodnoty = await page.locator('.kpi-karta .kpi-hlavni').allInnerTexts();
  over('PV1c', hodnoty.length === 8 && hodnoty.every((h) => txt(h) !== '' && txt(h) !== '—'),
    'v demu má všech osm karet hodnotu (žádná pomlčka)', hodnoty.join(' | '));
  // ⚠ oprava po recenzi (bod 9): „Data: dnes 9:05“, NAHRAZUJE „Data k dnes 9:05“
  over('PV1d', (await page.locator('.prehled-demo').count()) === 1 && /^Data: /.test(txt(await page.locator('.prehled-data-k').innerText()))
    && (await page.locator('.prehled-cerstvost-cipy li').count()) === 4,
    'hlavička: pruh DEMO, „Data: …“ a čerstvost zdrojů (automatizace, pošta, Gmail, snímek)', txt(await page.locator('.prehled-data-k').innerText()));
  const spojeno = await page.locator('.kpi-karta .kpi-nazev').allInnerTexts();
  over('PV1e', !spojeno.some((t) => /Dovoláno/.test(t)), 'na Vedení se „Dovoláno“ nikde neobjeví', spojeno.join(' | '));
  await snimekCely(page, 'vedeni-1280');
  await ctx.close();
});

await blok050('PV2 filtr v adrese', async () => {
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/prehled/vedeni', 900);
  const dnes = dnesPV();
  const prvni = `${dnes.slice(0, 8)}01`;
  const minulyDo = posunPV(prvni, -1);
  const minulyOd = `${minulyDo.slice(0, 8)}01`;
  await page.locator('.prehled-obdobi select').selectOption('minuly_mesic');
  await klid(page, 800);
  const h = await hashPV(page);
  const s = await posledniPV(page, 'prehledSouhrn');
  over('PV2a', h.includes(`od=${minulyOd}`) && h.includes(`do=${minulyDo}`) && s?.args[0]?.od === minulyOd && s?.args[0]?.do === minulyDo,
    'Minulý měsíc: období v adrese i ve volání prehled_souhrn (pražské dny)', `${h} ${JSON.stringify(s?.args[0])}`);
  await page.locator('.prehled-mena button', { hasText: 'EUR' }).first().click();
  await klid(page, 800);
  const s2 = await posledniPV(page, 'prehledSouhrn');
  const cipy = (await page.locator('.prehled-cipy .filtr-cip').allInnerTexts()).map(txt);
  over('PV2b', (await hashPV(page)).includes('mena=EUR') && s2?.args[0]?.mena === 'EUR' && cipy.includes('Měna: EUR')
    && /€|—/.test(await kartaPV(page, 'hodnota_prodeju').locator('.kpi-hodnota').innerText()),
    'měna EUR: v adrese, ve volání, čip „Měna: EUR“ a karta peněz v eurech', `${await hashPV(page)} ${cipy.join('|')}`);
  // odkaz s filtrem: přepnutí záložky filtr nechá
  await page.locator('.prehled-zalozka', { hasText: 'Finance' }).click();
  await klid(page, 800);
  const f = await posledniPV(page, 'prehledFinance');
  over('PV2c', (await hashPV(page)).startsWith('#/prehled/finance?') && (await hashPV(page)).includes('mena=EUR') && f?.args[0]?.mena === 'EUR' && f?.args[0]?.od === minulyOd,
    'záložka Finance: filtr zůstal (adresa i volání prehled_finance)', await hashPV(page));
  await page.locator('.prehled-cipy .zrusit-filtry').click();
  await klid(page, 800);
  over('PV2d', !(await hashPV(page)).includes('mena=') && (await hashPV(page)).includes(`od=${minulyOd}`) && (await page.locator('.prehled-cipy').count()) === 0,
    'Zrušit vše: filtry výchozí, období zůstane', await hashPV(page));
  // sdílený odkaz: tým ze Statistik (#/prehled/lide?…&tym=4) → prehled_lide s členy týmu Mikuláše
  await jdi(page, `#/prehled/lide?od=${prvni}&do=${dnes}&tym=4`, 900);
  const l = await posledniPV(page, 'prehledLide');
  over('PV2e', JSON.stringify(l?.args[0]?.lide) === '[3,4]' && /Tým Mikuláš/.test(await page.locator('.lide-picker-btn').innerText()),
    'odkaz s tym=4 (formát „Porovnat v Přehledu“): server dostane členy týmu, výběr ukáže „Tým Mikuláš“', JSON.stringify(l?.args[0]));
  await ctx.close();
});

await blok050('PV3 řádky a CSV', async () => {
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/prehled/vedeni', 900);
  const vysledky = {};
  for (const klic of ['pocet_prodeju', 'k_zasahu', 'otevrene', 'uspesnost']) {
    const hodnota = txt(await kartaPV(page, klic).locator('.kpi-hlavni').innerText());
    await enterPV(page, kartaPV(page, klic).locator('.kpi-proklik'));
    await klid(page, 700);
    const panel = page.locator('.proklik-panel[role="dialog"]');
    const radku = await panel.locator('tbody tr').count();
    const souhrnText = txt(await panel.locator('.proklik-souhrn').innerText().catch(() => ''));
    vysledky[klic] = { hodnota, radku, souhrnText };
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  const ok = (k) => {
    const r = vysledky[k];
    const celkem = /z (\d+)/.exec(r.souhrnText)?.[1];
    if (k === 'uspesnost') return Number(celkem) === r.radku && r.radku > 0;
    return Number(r.hodnota.replace(/\s/g, '')) === r.radku && Number(celkem) === r.radku;
  };
  over('PV3a', ['pocet_prodeju', 'k_zasahu', 'otevrene', 'uspesnost'].every(ok),
    'klik na kartu: panel řádků, kolik řádků, tolik jako číslo karty (prodeje, případy k zásahu, otevřené; úspěšnost = jmenovatel)', JSON.stringify(vysledky));
  // součet peněz: řádky hodnoty prodejů = karta
  await enterPV(page, kartaPV(page, 'hodnota_prodeju').locator('.kpi-proklik'));
  await klid(page, 700);
  const karta = txt(await kartaPV(page, 'hodnota_prodeju').locator('.kpi-hlavni').innerText());
  const soucet = txt(await page.locator('.proklik-souhrn strong').first().innerText().catch(() => ''));
  over('PV3b', soucet.replace(/\s/g, '') === karta.replace(/\s/g, ''), 'součet řádků hodnoty prodejů = karta', `${soucet} / ${karta}`);
  const fokus1 = await page.evaluate(() => document.activeElement?.className ?? '');
  over('PV3c', /proklik-zavrit/.test(fokus1) && (await page.locator('.proklik-strankovani').innerText()).includes('Strana 1 z 1')
    && (await page.locator('.proklik-strankovani button', { hasText: 'Další' }).isDisabled()),
    'panel: fokus na křížku, stránkování „Strana 1 z 1“ a Další vypnuté (všechny řádky na první stránce)', fokus1);
  // CSV
  const [stazeni] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.locator('.proklik-csv').click()]);
  const obsah = readFileSync(await stazeni.path(), 'utf8');
  const radky = obsah.replace(/^﻿/, '').split('\r\n').filter(Boolean);
  over('PV3d', obsah.startsWith('﻿') && radky[0] === 'Prodáno;Klient;Cena;Cena z;Připsáno;Provize;Hosting ročně' && radky.length === 1 + (Number(/z (\d+)/.exec(txt(await page.locator('.proklik-souhrn').innerText()))?.[1]) || 0)
    && /^prehled-prodeje-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/.test(stazeni.suggestedFilename()) && !/@|\+420/.test(obsah),
    'CSV: BOM, hlavička se středníkem, řádek za každý řádek panelu, jméno souboru se zdrojem a obdobím, bez telefonu a e-mailu', `${stazeni.suggestedFilename()} ${radky.slice(0, 2).join(' / ')}`);
  await snimekCely(page, 'radky-1280');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const fokus2 = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
  over('PV3e', (await page.locator('.proklik-panel').count()) === 0 && fokus2 === 'Zobrazit řádky: Hodnota prodejů',
    'Escape zavře panel a fokus se vrátí na kartu', fokus2);
  await ctx.close();
});

await blok050('PV4 „i“ a klávesnice', async () => {
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/prehled/vedeni', 900);
  const i = kartaPV(page, 'uspesnost').locator('.definice-btn');
  await i.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const okno = page.locator('.definice-okno[role="dialog"]');
  const text = txt(await okno.innerText().catch(() => ''));
  over('PV4a', (await okno.count()) === 1 && /Vyhrané ÷/.test(text) && /Základ/.test(text) && /uzavření obchodu/.test(text) && /Verze 1/.test(text) && /katalog 2026-11-17\.1/.test(text)
    && (await i.getAttribute('aria-expanded')) === 'true',
    '„i“ Enterem: definice, základ, zdroje, verze; tlačítko aria-expanded', text.slice(0, 160));
  await snimekCely(page, 'definice-1280');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const fokus = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
  over('PV4b', (await okno.count()) === 0 && fokus === 'Co znamená Úspěšnost návrhů', 'Escape zavře „i“ a fokus je zpět na tlačítku', fokus);
  // záložky jsou odkazy dosažitelné Tabem, Enter přepne a nese filtr
  const prvni = page.locator('.prehled-zalozka').first();
  await prvni.focus();
  await page.keyboard.press('Tab');
  const dalsi = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
  await page.keyboard.press('Enter');
  await klid(page, 800);
  over('PV4c', dalsi === 'Lidé a volání' && (await hashPV(page)).startsWith('#/prehled/lide?od=') && (await page.locator('.prehled-zalozka.aktivni').innerText()).includes('Lidé a volání'),
    'Tab z první záložky na druhou, Enter otevře Lidé a volání s filtrem v adrese', `${dalsi} ${await hashPV(page)}`);
  const nazvy = (await page.locator('.kpi-karta .kpi-nazev').allInnerTexts()).map(txt);
  over('PV4d', nazvy.includes('Spojeno') && nazvy.includes('Míra spojení') && !nazvy.some((n) => /Dovoláno|dovolání/.test(n)),
    'Lidé a volání: serverové dovolano je „Spojeno“, míra „Míra spojení“; „Dovoláno“ nikde', nazvy.join(' | '));
  await ctx.close();
});

await blok050('PV5 záložky a stavy', async () => {
  const { ctx, page } = await novaStranka('mikulas');
  const vysl = {};
  for (const z of [...ZALOZKY_PV, 'nastaveni/cile', 'nastaveni/naklady', 'nastaveni/vyplaty']) {
    await jdi(page, `#/prehled/${z}`, 900);
    vysl[z] = { chyba: await page.locator('.prehled-chyba').count(), nadpis: await page.locator('.prehled-sekce-nadpis').count(), karet: await page.locator('.kpi-karta').count() };
  }
  over('PV5a', Object.values(vysl).every((v) => v.chyba === 0 && v.nadpis === 1) && ZALOZKY_PV.every((z) => vysl[z].karet > 0),
    'všech osm záložek a tři sekce nastavení se vykreslí bez chyby; každá záložka ukáže karty ze své funkce', JSON.stringify(vysl));
  const fns = new Set((await volani(page)).map((v) => v.fn));
  over('PV5b', ['prehledMoznosti', 'prehledDefinice', 'prehledSouhrn', 'prehledLide', 'prehledPipeline', 'prehledKlienti', 'prehledKomunikace', 'prehledFinance', 'prehledDodani', 'prehledPrognoza'].every((f) => fns.has(f))
    && (await volani(page)).filter((v) => /^prehled/.test(v.fn)).every((v) => v.ok === true),
    'Mikuláš (super admin): každá záložka zavolá svou funkci 073 a všechna volání prošla', [...fns].filter((f) => /^prehled/.test(f)).join(','));
  // server bez migrace 073: jen hláška, žádná čísla
  // háček přežije jen bez nového načtení stránky: pryč z Přehledu a zpět (stránka se připojí znovu a načte možnosti)
  await page.evaluate((bez) => { globalThis.__volackaDemoTest.selhani = (fn) => (/^prehled/.test(fn) ? bez : null); }, BEZ_073_E2E);
  await jdi(page, '#/', 400);
  await jdi(page, '#/prehled/vedeni', 900);
  const chyba = txt(await page.locator('.prehled-chyba').first().innerText().catch(() => ''));
  over('PV5c', /^Přehled potřebuje migraci 073/.test(chyba) && (await page.locator('.kpi-karta:not(.kostra)').count()) === 0 && (await page.locator('.prehled-filtr').count()) === 0,
    'server bez 073: „Přehled potřebuje migraci 073“, žádná karta ani filtr (nikdy ukázková čísla)', chyba);
  await snimekCely(page, 'bez-073-1280');
  await page.evaluate(() => { globalThis.__volackaDemoTest.selhani = null; });
  await page.locator('.prehled-chyba button').click();
  await klid(page, 900);
  over('PV5d', (await page.locator('.kpi-karta[data-klic]').count()) > 0 && (await page.locator('.prehled-chyba').count()) === 0, 'Zkusit znovu po opravě serveru načte čísla', '');
  await ctx.close();
});

await blok050('PV6 Volající', async () => {
  const { ctx, page } = await novaStranka('petra');
  await jdi(page, '#/', 600);
  const pilulka = await page.locator('nav a[href="#/prehled"]').count();
  const dlazdice = await page.locator('a[href="#/prehled"]').count();
  await jdi(page, '#/prehled/vedeni', 700);
  const h1 = await hashPV(page);
  await jdi(page, '#/prehled/finance?od=2026-11-01&do=2026-11-30&lide=1,4', 700);
  const h2 = await hashPV(page);
  await jdi(page, '#/stats', 700);
  const zakazana = (await volani(page)).filter((v) => /^(prehled|cile|naklady|provize)/i.test(v.fn)).map((v) => v.fn);
  over('PV6a', pilulka === 0 && dlazdice === 0 && h1 === '#/' && h2 === '#/' && (await page.locator('.prehled-stranka').count()) === 0 && zakazana.length === 0,
    'Volající: žádná pilulka ani dlaždice, #/prehled ho vrátí domů, mock nedostal žádné volání prehled_*, cile_*, naklady_*, provize_*',
    JSON.stringify({ pilulka, dlazdice, h1, h2, zakazana }));
  await ctx.close();
});

for (const sirka of [320, 360, 390]) {
  await blok050(`PV7 ${sirka}`, async () => {
    const { ctx, page } = await novaStranka('admin', { sirka, vyska: 844 });
    const vysl = {};
    for (const z of ['vedeni', 'finance', 'lide', 'nastaveni/cile']) {
      await jdi(page, `#/prehled/${z}`, 900);
      vysl[z] = await page.evaluate(() => document.documentElement.scrollWidth);
    }
    await jdi(page, '#/prehled/vedeni', 900);
    await enterPV(page, page.locator('.prehled-dalsi-btn'));
    await page.waitForTimeout(150);
    vysl.dalsi = await page.evaluate(() => document.documentElement.scrollWidth);
    await page.keyboard.press('Escape');
    await enterPV(page, kartaPV(page, 'plneni_cile').locator('.definice-btn'));
    await page.waitForTimeout(150);
    vysl.definice = await page.evaluate(() => document.documentElement.scrollWidth);
    const okno = await page.locator('.definice-okno').boundingBox();
    await page.keyboard.press('Escape');
    await enterPV(page, kartaPV(page, 'hodnota_prodeju').locator('.kpi-proklik'));
    await klid(page, 700);
    vysl.radky = await page.evaluate(() => document.documentElement.scrollWidth);
    if (sirka === 390) await snimekCely(page, 'radky-390');
    await page.keyboard.press('Escape');
    if (sirka === 390) {
      await jdi(page, '#/prehled/vedeni', 900);
      await snimekCely(page, 'vedeni-390');
    }
    over(`PV7 ${sirka}`, Object.values(vysl).every((w) => w <= sirka) && !!okno && okno.x >= 0 && okno.x + okno.width <= sirka,
      `telefon ${sirka} px: Přehled, Finance, Lidé, Nastavení, „Další“, „i“ a řádky bez posunu do strany`, JSON.stringify({ ...vysl, okno }));
    await ctx.close();
  });
}

/* ---- PV8 až PV12: oprava po recenzi úkolu 13 (task-13-fixes.md, 18. 11. 2026) ---- */
/** Den v e2e (en-US, mm/dd/yyyy) jako číslice pro psaní do pole data klávesnicí. */
const klavesyDne = (den) => { const [y, m, d] = den.split('-'); return `${m}${d}${y}`; };
const prvniDenMesicePV = (den, posun) => { const [y, m] = den.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + posun, 1)); return t.toISOString().slice(0, 10); };
const posledniDenMesicePV = (den) => posunPV(prvniDenMesicePV(den, 1), -1);
/** Opustí pole data klávesou Tab (Tab v poli data chodí po měsíci, dni, roku a tlačítku kalendáře; pak teprve ven). */
const vyjdiZPolePV = async (page, aria) => {
  for (let i = 0; i < 6; i += 1) {
    if ((await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) !== aria) return;
    await page.keyboard.press('Tab');
  }
};

await blok050('PV8 psané datum', async () => {
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/prehled/vedeni', 900);
  const dnes = dnesPV();
  const konec = posledniDenMesicePV(dnes);
  const odCil = prvniDenMesicePV(dnes, -3);
  const souhrnu = async () => (await volani(page)).filter((v) => v.fn === 'prehledSouhrn').length;
  const pred = await souhrnu();
  const historiePred = await page.evaluate(() => history.length);
  await page.locator('.prehled-obdobi select').selectOption('vlastni');
  await page.waitForTimeout(150);
  await page.locator('input[aria-label="Období od"]').focus();
  // Chromium posílá při psaní roku mezihodnoty (0002-…, 0020-…, 0202-…): do adresy smí jen celé datum
  await page.keyboard.type(klavesyDne(odCil), { delay: 60 });
  await vyjdiZPolePV(page, 'Období od');
  await klid(page, 1200);
  const h1 = await hashPV(page);
  const nove = (await volani(page)).filter((v) => v.fn === 'prehledSouhrn').slice(pred);
  over('PV8a', h1.includes(`od=${odCil}`) && h1.includes(`do=${konec}`) && nove.length === 1 && nove[0].args[0].od === odCil && nove[0].args[0].do === konec
    && (await page.evaluate(() => history.length)) - historiePred <= 1,
    'Vlastní „od“ napsané klávesnicí: jedno volání s konečným dnem, adresa od=…, konec období se nezměnil, nejvýš jeden záznam historie',
    JSON.stringify({ h1, nove: nove.map((v) => [v.args[0].od, v.args[0].do]) }));
  // obrácené období: chyba u pole, nic se nepřepíše a nic se nevolá
  const pred2 = await souhrnu();
  await page.locator('input[aria-label="Období do"]').focus();
  await page.keyboard.type(klavesyDne(posunPV(odCil, -1)), { delay: 60 });
  await vyjdiZPolePV(page, 'Období do');
  await klid(page, 1200);
  const chyba = txt(await page.locator('.prehled-obdobi-chyba').innerText().catch(() => ''));
  over('PV8b', chyba === 'Začátek období je po jeho konci.' && (await hashPV(page)) === h1 && (await souhrnu()) === pred2
    && (await page.locator('input[aria-label="Období od"]').inputValue()) === odCil,
    'konec před začátkem: věta u pole, adresa ani začátek se nezmění, žádné volání', `${chyba} ${await hashPV(page)}`);
  await snimekCely(page, 'obdobi-chyba-1280');
  // oprava konce: platné období se zapíše
  await page.locator('input[aria-label="Období do"]').focus();
  await page.keyboard.type(klavesyDne(posunPV(odCil, 20)), { delay: 60 });
  await page.keyboard.press('Enter');
  await klid(page, 1200);
  over('PV8c', (await hashPV(page)).includes(`do=${posunPV(odCil, 20)}`) && (await page.locator('.prehled-obdobi-chyba').count()) === 0,
    'opravený konec (Enter): zapíše se, chyba zmizí', await hashPV(page));
  // K datu klávesnicí
  const kDen = posunPV(dnes, -2);
  const pred3 = await souhrnu();
  await page.locator('.prehled-dalsi-btn').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  await page.locator('input[aria-label="Stav k datu"]').focus();
  await page.keyboard.type(klavesyDne(kDen), { delay: 60 });
  await vyjdiZPolePV(page, 'Stav k datu');
  await klid(page, 1200);
  const nove3 = (await volani(page)).filter((v) => v.fn === 'prehledSouhrn').slice(pred3);
  const k = nove3[0]?.args[0]?.k_datu ?? '';
  over('PV8d', nove3.length === 1 && !!k && denP(k) === kDen && (await hashPV(page)).includes('k='),
    'K datu napsané klávesnicí: jedno volání s k_datu toho dne (v Praze), adresa s k=', JSON.stringify(nove3.map((v) => v.args[0].k_datu)));
  await ctx.close();
});

await blok050('PV9 zpět a dopředu', async () => {
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/prehled/vedeni', 900);
  await page.locator('.prehled-obdobi select').selectOption('minuly_mesic');
  await klid(page, 800);
  await enterPV(page, kartaPV(page, 'pocet_prodeju').locator('.kpi-proklik'));
  await klid(page, 700);
  const otevreno = await page.locator('.proklik-panel').count();
  await page.goBack();
  await klid(page, 900);
  const zavreno = await page.locator('.proklik-panel').count();
  const fokus = await page.evaluate(() => `${document.activeElement?.tagName}.${document.activeElement?.className}`);
  const vybrano = await page.locator('.prehled-obdobi select').inputValue();
  over('PV9a', otevreno === 1 && zavreno === 0 && /kpi-proklik|page-title/.test(fokus) && vybrano === 'mesic',
    'Zpět s otevřeným panelem řádků: panel se zavře, fokus na kartu nebo nadpis, období podle adresy', JSON.stringify({ otevreno, zavreno, fokus, vybrano }));
  // „Vlastní“ nezůstane viset: Vlastní zvolené nad výchozím měsícem, napsaný začátek (Enter), Zpět = výchozí Tento měsíc
  // (výběr podle adresy, ne podle minulé volby), Vpřed = Vlastní s napsaným dnem
  await jdi(page, '#/prehled/vedeni', 900);
  const odCil = prvniDenMesicePV(dnesPV(), -2);
  await page.locator('.prehled-obdobi select').selectOption('vlastni');
  await page.locator('input[aria-label="Období od"]').focus();
  await page.keyboard.type(klavesyDne(odCil), { delay: 60 });
  await page.keyboard.press('Enter');
  await klid(page, 900);
  const hVlastni = await hashPV(page);
  await page.goBack();
  await klid(page, 900);
  const v1 = await page.locator('.prehled-obdobi select').inputValue();
  const vstupu1 = await page.locator('input[aria-label="Období od"]').count();
  await page.goForward();
  await klid(page, 900);
  const v2 = await page.locator('.prehled-obdobi select').inputValue();
  const od2 = await page.locator('input[aria-label="Období od"]').inputValue().catch(() => '');
  over('PV9b', hVlastni.includes(`od=${odCil}`) && v1 === 'mesic' && vstupu1 === 0 && v2 === 'vlastni' && od2 === odCil,
    'Zpět z vlastního období na výchozí ukáže Tento měsíc bez polí (výběr podle adresy), Vpřed zase Vlastní s napsaným dnem',
    JSON.stringify({ hVlastni, v1, vstupu1, v2, od2 }));
  await ctx.close();
});

await blok050('PV10 čerstvost', async () => {
  const { ctx, page } = await novaStranka('admin', { hodiny: true });
  await jdi(page, '#/prehled/vedeni', 900);
  const pocet = async (fn) => (await volani(page)).filter((v) => v.fn === fn).length;
  const m0 = await pocet('prehledMoznosti');
  await enterPV(page, page.locator('.prehled-zalozka', { hasText: 'Finance' }));
  await klid(page, 900);
  const m1 = await pocet('prehledMoznosti');
  await page.clock.runFor(5 * 60 * 1000 + 2000);
  await klid(page, 900);
  const m2 = await pocet('prehledMoznosti');
  const d0 = await pocet('prehledDefinice');
  await page.evaluate(() => { globalThis.__volackaDemoTest.prehledVerze = '2026-12-01.1'; });
  await enterPV(page, page.locator('.prehled-zalozka', { hasText: 'Pipeline' }));
  await klid(page, 1200);
  const d1 = await pocet('prehledDefinice');
  over('PV10', m1 === m0 + 1 && m2 >= m1 + 1 && d1 === d0 + 1,
    'čerstvost: možnosti znovu při změně záložky a po 5 minutách; katalog znovu, když odpověď nese jinou definice_verze', JSON.stringify({ m0, m1, m2, d0, d1 }));
  await ctx.close();
});

await blok050('PV11 kurzor', async () => {
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/prehled/vedeni', 900);
  // stránky po 2 řádcích (háček mocku prehledLimit), ať jde na třetí stránku s kurzorem
  await page.evaluate(() => { globalThis.__volackaDemoTest.prehledLimit = 2; });
  await enterPV(page, kartaPV(page, 'otevrene').locator('.kpi-proklik'));
  await klid(page, 700);
  const dalsiPV = page.locator('.proklik-strankovani button', { hasText: 'Další' });
  const celkem = Number(/z (\d+)/.exec(txt(await page.locator('.proklik-souhrn').innerText().catch(() => '')))?.[1] ?? 0);
  await dalsiPV.click();
  await klid(page, 600);
  // server zahodí kurzor třetí stránky (jiný filtr nebo zdroj): jednou chyba kurzoru
  await page.evaluate(() => {
    let jednou = true;
    globalThis.__volackaDemoTest.selhani = (fn) => {
      if (fn !== 'prehledRadky' || !jednou) return null;
      jednou = false;
      return 'Kurzor patří k jinému filtru nebo zdroji; načtěte řádky znovu od začátku.';
    };
  });
  await dalsiPV.click();
  await klid(page, 600);
  const chybne = (await volani(page)).filter((v) => v.fn === 'prehledRadky').pop();
  const chyba = txt(await page.locator('.proklik-panel .prehled-chyba').innerText().catch(() => ''));
  await page.locator('.proklik-panel .prehled-chyba button').click();
  await klid(page, 700);
  const radky = await page.locator('.proklik-panel tbody tr').count();
  const posledni = (await volani(page)).filter((v) => v.fn === 'prehledRadky').pop();
  const souhrn = txt(await page.locator('.proklik-souhrn').innerText().catch(() => ''));
  over('PV11', celkem >= 5 && chybne?.ok === false && typeof chybne?.args[2] === 'string' && /Kurzor patří/.test(chyba) && radky === 2
    && posledni?.args[2] === null && posledni?.ok === true && /^Řádky 1–2 z /.test(souhrn)
    && (await page.locator('.proklik-strankovani button', { hasText: 'Předchozí' }).isDisabled()),
    'chyba kurzoru na 3. stránce: „Zkusit znovu“ načte řádky od začátku (kurzor null, řádky 1–2, Předchozí vypnuté)',
    JSON.stringify({ celkem, chyba, radky, kurzor: posledni?.args[2], souhrn }));
  await page.evaluate(() => { delete globalThis.__volackaDemoTest.prehledLimit; delete globalThis.__volackaDemoTest.selhani; });
  await ctx.close();
});

await blok050('PV12 CSV po zavření', async () => {
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/prehled/vedeni', 900);
  let stazeni = 0;
  page.on('download', () => { stazeni += 1; });
  await enterPV(page, kartaPV(page, 'hodnota_prodeju').locator('.kpi-proklik'));
  await klid(page, 700);
  // stránky CSV (limit 200) přijdou až za 1,5 s; panel se mezitím zavře Escapem
  await page.evaluate(() => { globalThis.__volackaDemoTest.zpozdeni = (fn, args) => (fn === 'prehledRadky' && args[3] === 200 ? 1500 : 0); });
  await page.locator('.proklik-csv').click();
  const bezi = txt(await page.locator('.proklik-csv-stav').innerText().catch(() => ''));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2500);
  const panelu = await page.locator('.proklik-panel').count();
  await page.evaluate(() => { delete globalThis.__volackaDemoTest.zpozdeni; });
  over('PV12', /Připravuji CSV/.test(bezi) && panelu === 0 && stazeni === 0, 'zavřený panel zastaví běžící CSV: po zavření se nic nestáhne',
    JSON.stringify({ bezi, panelu, stazeni }));
  await ctx.close();
});

/* ============ PZ (Přehled vedení úkol 14a, Albert 17. 11. 2026, D1, D6, D7 a D12): záložky s daty a grafy ============ */
// Spec §7.2: Vedení (karty, trend proti cíli, trychtýř, týmy a segmenty, akční seznam), Lidé a volání (porovnání vybraných lidí
// s kombinovaným řádkem, řazení, mini pruhy, odpracováno proti plánu), Pipeline, Klienti a sektory, Komunikace a ztráty, Finance
// (náklady po kategoriích a dohromady, výsledek, provize, hosting), Dodání, Prognóza a data. Grafy (src/components/grafy): SVG
// s title a desc, legenda, „Zobrazit jako tabulku“ se stejnými čísly. Klik na číslo = řádky se stejným součtem (hodnota prodejů,
// náklady celkem, hovory jednoho člověka, jedno pásmo pipeline). Filtr (Lidé, Období, Segment) mění karty i tabulky. Volající nic,
// telefon 320/360/390 bez posunu stránky do strany (široké tabulky se posouvají ve svém rámečku s nápovědou).
const ZALOZKY_PZ = { vedeni: 'Vedení', lide: 'Lidé a volání', pipeline: 'Pipeline', klienti: 'Klienti a sektory', komunikace: 'Komunikace a ztráty', finance: 'Finance', dodani: 'Dodání', prognoza: 'Prognóza a data' };
/** Hlavní prvky záložky (aspoň jeden výskyt), podle kterých se pozná, že ukazuje svá data, ne obecné karty. */
const PRVKY_PZ = {
  vedeni: ['figure.graf[data-graf="trend"]', 'figure.graf[data-graf="trychtyr"]', 'table[data-tabulka="tymy"]', 'table[data-tabulka="segmenty"]', 'table[data-tabulka="akce"]'],
  lide: ['table[data-tabulka="lide"]', 'figure.graf[data-graf="trend"]'],
  pipeline: ['table[data-tabulka="faze"]', 'figure.graf[data-graf="pasma"]', 'table[data-tabulka="kohorty"]', 'table[data-tabulka="kalibrace"]'],
  klienti: ['table[data-tabulka="segmenty"]', 'figure.graf[data-graf="segmenty"]', 'table[data-tabulka="hodnoceni"]'],
  komunikace: ['[data-blok="cekani"]', 'table[data-tabulka="zpravy"]', 'figure.graf[data-graf="duvody"]', 'figure.graf[data-graf="po-navrhu"]'],
  finance: ['table[data-tabulka="naklady"]', 'figure.graf[data-graf="naklady"]', '.kpi-karta[data-klic="naklady_celkem"]', '.kpi-karta[data-klic="vysledek"]', '.kpi-karta[data-klic="provize_zbyva"]'],
  dodani: ['table[data-tabulka="dodani"]', 'figure.graf[data-graf="dodani"]', '[data-blok="blokace"]', 'table[data-tabulka="prace"]'],
  prognoza: ['.kpi-karta[data-klic="prognoza_zakladni"]', 'table[data-tabulka="prognoza"]', '[data-blok="presnost"]', 'table[data-tabulka="ceny"]'],
};
const cisloPZ = (s) => Number(txt(s).replace(/[^\d,-]/g, '').replace(',', '.'));
const radkyPanelu = async (page) => Number(/z (\d+)/.exec(txt(await page.locator('.proklik-souhrn').innerText().catch(() => '')))?.[1] ?? NaN);
const souctyPanelu = async (page) => txt(await page.locator('.proklik-souhrn strong').first().innerText().catch(() => ''));
const zavriPanelPZ = async (page) => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
};
/** Počet hovorů člověka v pražských dnech [od, do] ze stavu mocku (call_log). */
const hovoryPZ = async (page, uid, od, doDne) => (await stav(page)).callLog.filter((l) => l.user_id === uid && denP(l.created_at) >= od && denP(l.created_at) <= doDne).length;
/** Řádky tabulky porovnání: jméno (bez popisu pod ním), celý text první buňky (jméno a popis) a text buňky sloupce. */
const tabulkaLidiPZ = async (page, tabulka, sloupec) => page.locator(`table[data-tabulka="${tabulka}"] tbody tr`).evaluateAll((rs, s) => rs.map((r) => ({
  jmeno: (r.querySelector('.tabulka-lidi-nazev')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
  cely: [...(r.querySelector('th')?.children ?? [])].map((e) => (e.textContent ?? '').trim()).join(' ').replace(/\s+/g, ' ').trim(),
  druh: r.getAttribute('data-druh'),
  hodnota: (r.querySelector(`td[data-sloupec="${s}"] .cislo-text`)?.textContent ?? '').replace(/\s+/g, ' ').trim(),
})), sloupec);
const soucetLidiPZ = async (page, tabulka, sloupec) => txt(await page.locator(`table[data-tabulka="${tabulka}"] tfoot td[data-sloupec="${sloupec}"] .cislo-text`).innerText().catch(() => ''));

await blok050('PZ1 Vedení', async () => {
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/prehled/vedeni', 1400);
  const grafy = await page.locator('figure.graf').evaluateAll((fs) => fs.map((f) => ({ graf: f.getAttribute('data-graf'), title: f.querySelector('svg > title')?.textContent ?? '', desc: f.querySelector('svg > desc')?.textContent ?? '' })));
  over('PZ1a', ['trend', 'trychtyr'].every((g) => grafy.some((x) => x.graf === g && x.title.length > 3 && x.desc.length > 10)),
    'Vedení: graf trendu proti cíli a trychtýř, oba SVG s title a desc', JSON.stringify(grafy));
  // trend proti cíli: firma má v demu cíl 50 000 Kč na tento měsíc (lide null, CZK)
  const cil = txt(await page.locator('figure[data-graf="trend"] .graf-cil-popisek').textContent().catch(() => ''));
  const rada = await posledniPV(page, 'prehledRada');
  over('PZ1b', /50 000/.test(cil) && rada?.args[0] === 'hodnota_prodeju' && rada?.args[1] === 'den' && (await page.locator('figure[data-graf="trend"] .graf-cara').count()) === 1,
    'trend: hodnota prodejů po dnech kumulativně, čára a cíl 50 000 Kč s popiskem', `${cil} ${JSON.stringify(rada?.args.slice(0, 2))}`);
  await page.locator('.prehled-trend select[aria-label="Co ukázat v grafu"]').selectOption('hovory');
  await klid(page, 900);
  const rada2 = await posledniPV(page, 'prehledRada');
  over('PZ1c', rada2?.args[0] === 'hovory' && /Hovory/.test(await page.locator('figure[data-graf="trend"] svg > title').textContent()),
    'výběr metriky grafu načte řadu hovorů a graf se přejmenuje', JSON.stringify(rada2?.args.slice(0, 2)));
  // trychtýř: krok dovolan = „Spojen“, tabulka se stejnými čísly, bublina nad pruhem
  const trychtyr = page.locator('figure[data-graf="trychtyr"]');
  const popisky = txt(await trychtyr.innerText());
  await trychtyr.locator('rect[data-cil-kroku="osloven"]').hover();
  await page.waitForTimeout(150);
  const bublina = txt(await trychtyr.locator('.graf-bublina').innerText().catch(() => ''));
  const nGrafu = await trychtyr.locator('text.graf-hodnota[data-krok]').evaluateAll((ts) => Object.fromEntries(ts.map((t) => [t.getAttribute('data-krok'), (t.textContent ?? '').trim()])));
  await trychtyr.locator('button.graf-prepinac').click();
  await page.waitForTimeout(150);
  const radkyT = await trychtyr.locator('.graf-tabulka tbody tr[data-radek]').evaluateAll((rs) => rs.map((r) => [r.getAttribute('data-radek'), (r.children[1]?.textContent ?? '').trim()]));
  const stejneN = radkyT.length === 7 && radkyT.every(([k, n]) => !(k in nGrafu) || nGrafu[k].startsWith(n));
  over('PZ1d', /Spojen/.test(popisky) && !/Dovol/.test(popisky) && stejneN && /Osloven/.test(bublina) && (await trychtyr.locator('button.graf-prepinac').getAttribute('aria-expanded')) === 'true'
    && /Zobrazit jako graf/.test(await trychtyr.locator('button.graf-prepinac').innerText()) && (await trychtyr.locator('details.prehled-rozbal').count()) === 1,
    'trychtýř: „Spojen“ (nikdy „Dovolán“), bublina nad pruhem, „Zobrazit jako tabulku“ ukáže 7 kroků se stejnými čísly jako graf; rozbalení stavů v kartě grafu',
    JSON.stringify({ nGrafu, radkyT, bublina }));
  // týmy: řádek za tým (prehled_lide s členy týmu), Nepřiřazeno zvlášť, Celkem = celý výběr
  const tymy = await tabulkaLidiPZ(page, 'tymy', 'hovory');
  const celkemT = cisloPZ(await soucetLidiPZ(page, 'tymy', 'hovory'));
  const lideVolani = (await volani(page)).filter((v) => v.fn === 'prehledLide').map((v) => JSON.stringify(v.args[0]?.lide ?? null));
  const tymove = tymy.filter((r) => r.druh === 'tym');
  over('PZ1e', tymove.some((r) => r.jmeno === 'Tým Albert') && tymove.some((r) => r.jmeno === 'Tým Mikuláš')
    && tymove.reduce((a, r) => a + cisloPZ(r.hodnota), 0) === celkemT && celkemT === (await stav(page)).callLog.filter((l) => denP(l.created_at) >= `${dnesPV().slice(0, 8)}01` && denP(l.created_at) <= dnesPV()).length
    && lideVolani.includes('[1,2,5]') && lideVolani.includes('[3,4]'),
    'týmy: Tým Albert a Tým Mikuláš ze součtů prehled_lide s jejich lidmi, hovory týmů dají „Celkem“ (= hovory měsíce)', JSON.stringify({ tymy, celkemT, lideVolani }));
  // segmenty: kontakty segmentu = kontakty v demu; jen ten sloupec má řádky
  const seg = await page.locator('table[data-tabulka="segmenty"] tbody tr').evaluateAll((rs) => rs.map((r) => ({ k: r.getAttribute('data-radek'), n: (r.querySelector('td[data-sloupec="kontakty"]')?.textContent ?? '').trim() })));
  const st = await stav(page);
  over('PZ1f', seg.length >= 2 && seg.every((s) => Number(s.n.replace(/\s/g, '')) === st.kontakty.filter((c) => c.segment === s.k).length),
    'segmenty: řádek za segment, počet kontaktů sedí s daty dema', JSON.stringify(seg));
  // akční seznam: případy jako karta k zásahu, „Zobrazit všech“ otevře jejich řádky
  const karta = Number(txt(await kartaPV(page, 'k_zasahu').locator('.kpi-hlavni').innerText()));
  const radkuAkci = await page.locator('table[data-tabulka="akce"] tbody tr').count();
  // počty podle signálu: klient může mít víc signálů, a když je součet vyšší než počet případů, řekne to věta pod nimi
  const signaly = await page.locator('section[data-blok="akce"] ul.prehled-stavy-kohorty li').allInnerTexts();
  const soucetSignalu = signaly.reduce((a, t) => a + Number((txt(t).match(/(\d[\d\s]*)$/) ?? [null, '0'])[1].replace(/\s/g, '')), 0);
  const vetaSignalu = await page.locator('section[data-blok="akce"] .akce-pozn').count();
  await enterPV(page, page.locator('button.akce-vse'));
  await klid(page, 700);
  const vPanelu = await radkyPanelu(page);
  over('PZ1g', karta > 0 && radkuAkci === Math.min(karta, 8) && vPanelu === karta && signaly.length > 0 && (soucetSignalu > karta) === (vetaSignalu === 1),
    'akční seznam: počty podle signálu (s větou, když je jejich součet vyšší než počet případů), nejbližší případy (nejvýš 8), „Zobrazit všech“ otevře řádky všech případů k zásahu (= karta)',
    JSON.stringify({ karta, radkuAkci, vPanelu, signaly, soucetSignalu, vetaSignalu }));
  await zavriPanelPZ(page);
  await ctx.close();
});

await blok050('PZ2 záložky', async () => {
  // Albert: snímky bez oslavy odemčeného nástroje prasátka (ostatní super admini si nástroje odemykají; Mikuláše měří PV5)
  const { ctx, page } = await novaStranka('admin');
  const vysl = {};
  for (const z of Object.keys(ZALOZKY_PZ)) {
    await jdi(page, `#/prehled/${z}`, 1400);
    const chybi = [];
    for (const sel of PRVKY_PZ[z]) if ((await page.locator(sel).count()) === 0) chybi.push(sel);
    const obsah = await page.locator('.prehled-stranka').innerText();
    const grafy = await page.locator('figure.graf').evaluateAll((fs) => fs.every((f) => !!f.querySelector('svg > title')?.textContent && !!f.querySelector('svg > desc')?.textContent
      && !!f.querySelector('button.graf-prepinac')));
    vysl[z] = { chybi, chyba: await page.locator('.prehled-chyba').count(), nadpis: await page.locator('.prehled-sekce-nadpis').count(), karet: await page.locator('.kpi-karta').count(),
      dovolano: /Dovol[aá]n/.test(obsah), obecna: await page.locator('.prehled-skupina-nadpis', { hasText: 'Další čísla' }).count(), grafy };
    await snimekCely(page, `zalozka-${z}-1280`);
  }
  over('PZ2', Object.values(vysl).every((v) => v.chybi.length === 0 && v.chyba === 0 && v.nadpis === 1 && v.karet > 0 && !v.dovolano && v.obecna === 0 && v.grafy),
    'každá záložka ukáže svá data (tabulky, grafy s title, desc a přepínačem na tabulku, karty), bez chyby, bez „Dovoláno“ a bez obecných „Dalších čísel“',
    JSON.stringify(vysl));
  await ctx.close();
});

await blok050('PZ3 porovnání lidí', async () => {
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/prehled/lide', 1200);
  // všichni: Nepřiřazeno je vlastní popsaný řádek, ne člověk
  const vsichni = await tabulkaLidiPZ(page, 'lide', 'hovory');
  // záhlaví devíti sloupců pohledu Volání se zalomí, nepřekrývají se (dlouhé názvy metrik na 1280 px)
  const pretekla = await page.locator('table[data-tabulka="lide"] thead th').evaluateAll((ths) => ths.filter((th) => th.scrollWidth > th.clientWidth + 1)
    .map((th) => (th.textContent ?? '').trim()));
  over('PZ3a', vsichni.filter((r) => r.druh === 'osoba').length === 5 && vsichni.some((r) => r.druh === 'neprirazeno' && r.jmeno === 'Nepřiřazeno' && /bez připsaného/.test(r.cely))
    && vsichni[vsichni.length - 1].druh === 'neprirazeno' && pretekla.length === 0,
    'Lidé, všichni: pět lidí a pod nimi řádek „Nepřiřazeno“ s popisem (klienti bez připsaného člověka); záhlaví se nepřekrývají',
    JSON.stringify({ vsichni, pretekla }));
  // výběr dvou lidí: Petra a Honza
  await jenClovek(page, UID.petra);
  await klid(page, 900);
  await vLidech(page, (panel) => panel.locator(`.lide-radek[data-user-id="${UID.honza}"] input[type="checkbox"]`).click());
  await klid(page, 1200);
  const l = await posledniPV(page, 'prehledLide');
  const dva = await tabulkaLidiPZ(page, 'lide', 'hovory');
  const celkem = cisloPZ(await soucetLidiPZ(page, 'lide', 'hovory'));
  const od = `${dnesPV().slice(0, 8)}01`;
  const doDne = posledniDenMesicePV(dnesPV());
  const petra = await hovoryPZ(page, UID.petra, od, doDne);
  const honza = await hovoryPZ(page, UID.honza, od, doDne);
  const hodnotaPetry = cisloPZ(dva.find((r) => r.jmeno.startsWith('Petra'))?.hodnota ?? '');
  over('PZ3b', JSON.stringify(l?.args[0]?.lide) === '[2,3]' && (await hashPV(page)).includes('lide=2,3') && dva.length === 2 && dva.every((r) => r.druh === 'osoba')
    && hodnotaPetry === petra && celkem === petra + honza && /^Celkem/.test(txt(await page.locator('table[data-tabulka="lide"] tfoot tr').innerText())),
    'dva lidé: řádek Petry a Honzy, kombinovaný řádek „Celkem“ = jejich součet, čísla = hovory v datech, adresa i volání s lide=2,3',
    JSON.stringify({ lide: l?.args[0]?.lide, dva, celkem, petra, honza }));
  // řazení podle sloupce: sestupně, pak vzestupně
  const zahlavi = page.locator('table[data-tabulka="lide"] thead th[data-sloupec="hovory"]');
  await zahlavi.locator('button').click();
  await page.waitForTimeout(150);
  const s1 = (await tabulkaLidiPZ(page, 'lide', 'hovory')).map((r) => r.jmeno);
  const a1 = await zahlavi.getAttribute('aria-sort');
  await zahlavi.locator('button').click();
  await page.waitForTimeout(150);
  const s2 = (await tabulkaLidiPZ(page, 'lide', 'hovory')).map((r) => r.jmeno);
  const a2 = await zahlavi.getAttribute('aria-sort');
  const vetsi = honza >= petra ? 'Honza' : 'Petra';
  over('PZ3c', a1 === 'descending' && a2 === 'ascending' && s1[0] === vetsi && s2[1] === vetsi && (await page.locator('table[data-tabulka="lide"] .mini-pruh').count()) > 0,
    'řazení: první klik sestupně (víc hovorů nahoře), druhý vzestupně; aria-sort u záhlaví; mini pruhy v buňkách', JSON.stringify({ a1, a2, s1, s2 }));
  // odpracováno proti plánu (pohled Čas)
  await page.locator('.lide-pohled button', { hasText: 'Čas' }).click();
  await page.waitForTimeout(200);
  const plan = await page.locator('table[data-tabulka="lide"] tbody td[data-sloupec="odpracovane_hodiny"]').allInnerTexts();
  // koordinátor 18. 11. 2026: plán počítá každý den celého období (i budoucí), takže popisky říkají „za celé období“
  const zahlaviPlanu = txt(await page.locator('table[data-tabulka="lide"] thead th[data-sloupec="odpracovane_hodiny"]').innerText());
  const kartyPlanu = txt((await page.locator('.kpi-karta[data-klic="planovane_hodiny"], .kpi-karta[data-klic="plneni_planu"]').allInnerTexts()).join(' | '));
  // oprava po recenzi (drobnost 6): řazení podle sloupce, který po přepnutí pohledu zmizel, se vrátí na výchozí (bez aria-sort)
  const razeniCas = await page.locator('table[data-tabulka="lide"] thead th[aria-sort]').count();
  over('PZ3d', plan.length === 2 && plan.every((t) => /h/.test(t)) && plan.some((t) => /z\s+[\d,]+\s*h|plán/.test(txt(t))) && (await page.locator('table[data-tabulka="lide"] .metr').count()) > 0
    && /za celé období/.test(zahlaviPlanu) && /Plán za celé období/.test(kartyPlanu) && /Splněno z plánu období/.test(kartyPlanu) && razeniCas === 0,
    'pohled Čas: odpracované hodiny proti plánu z rozvrhu (měřák), u člověka bez rozvrhu věta; plán a plnění nazvané „za celé období“; skryté řazení se zruší',
    JSON.stringify({ plan: plan.map(txt), zahlaviPlanu, kartyPlanu: kartyPlanu.slice(0, 160), razeniCas }));
  await snimekCely(page, 'lide-porovnani-1280');
  // jiné období: čísla tabulky z nové odpovědi
  await page.locator('.prehled-obdobi select').selectOption('minuly_mesic');
  await klid(page, 1200);
  const mDo = posunPV(`${dnesPV().slice(0, 8)}01`, -1);
  const mOd = `${mDo.slice(0, 8)}01`;
  await page.locator('.lide-pohled button', { hasText: 'Volání' }).click();
  await page.waitForTimeout(150);
  const minule = await tabulkaLidiPZ(page, 'lide', 'hovory');
  const l2 = await posledniPV(page, 'prehledLide');
  const razeniZpet = await page.locator('table[data-tabulka="lide"] thead th[aria-sort]').count();
  over('PZ3e', l2?.args[0]?.od === mOd && l2?.args[0]?.do === mDo && cisloPZ(minule.find((r) => r.jmeno.startsWith('Petra'))?.hodnota ?? '') === await hovoryPZ(page, UID.petra, mOd, mDo)
    && razeniZpet === 0,
    'Minulý měsíc: nové volání s jeho dny a tabulka ukáže hovory toho měsíce; po návratu do pohledu Volání žádné staré řazení', JSON.stringify({ args: l2?.args[0], minule, razeniZpet }));
  await ctx.close();
});

await blok050('PZ9 segment', async () => {
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/prehled/klienti', 1200);
  const pred = await page.locator('table[data-tabulka="segmenty"] tbody tr').evaluateAll((rs) => rs.map((r) => r.getAttribute('data-radek')));
  const kartaPred = txt(await kartaPV(page, 'koncentrace_top1').locator('.kpi-pokryti').innerText().catch(() => ''));
  await vyber(page, 'Filtr segmentu', ['architekt']);
  await klid(page, 1200);
  const k = await posledniPV(page, 'prehledKlienti');
  const po = await page.locator('table[data-tabulka="segmenty"] tbody tr').evaluateAll((rs) => rs.map((r) => ({ k: r.getAttribute('data-radek'),
    n: Number((r.querySelector('td[data-sloupec="kontakty"]')?.textContent ?? '').replace(/\s/g, '')) })));
  const architektu = (await stav(page)).kontakty.filter((c) => c.segment === 'architekt').length;
  const kartaPo = txt(await kartaPV(page, 'koncentrace_top1').locator('.kpi-pokryti').innerText().catch(() => ''));
  over('PZ9', pred.length >= 2 && JSON.stringify(k?.args[0]?.segment) === '["architekt"]' && (await hashPV(page)).includes('seg=architekt')
    && po.length === 1 && po[0].k === 'architekt' && po[0].n === architektu && kartaPo !== kartaPred,
    'Segment = architekti: volání se segmentem, tabulka jen s architekty (počet z dat) a karty se přepočítají', JSON.stringify({ pred, po, architektu, kartaPred, kartaPo }));
  // se segmentem server pracovní čas ani náklady z evidence nerozdělí: „—“ s jeho důvodem, nikdy 0; provize se segmentem řídí dál
  const dotaz = (await hashPV(page)).split('?')[1] ?? '';
  await jdi(page, `#/prehled/lide?${dotaz}`, 1400);
  await page.locator('.lide-pohled button', { hasText: 'Čas' }).click();
  await page.waitForTimeout(200);
  const cas = (await page.locator('table[data-tabulka="lide"] td[data-sloupec="odpracovane_hodiny"]').allInnerTexts()).map(txt);
  const kartyCasu = (await page.locator('.kpi-karta[data-klic="odpracovane_hodiny"], .kpi-karta[data-klic="plneni_planu"]').allInnerTexts()).map(txt);
  await jdi(page, `#/prehled/finance?${dotaz}`, 1400);
  const naklady = await page.locator('table[data-tabulka="naklady"] tbody tr[data-radek]').evaluateAll((rs) => rs.map((r) => ({ k: r.getAttribute('data-radek'),
    castka: (r.querySelector('td[data-sloupec="castka"] .cislo-text')?.textContent ?? '').replace(/\s+/g, ' ').trim(), t: (r.textContent ?? '').replace(/\s+/g, ' ').trim() })));
  over('PZ9b', cas.length >= 2 && cas.every((t) => /^—/.test(t) && /segment/.test(t) && !/\b0 h\b|plán —/.test(t)) && kartyCasu.length === 2 && kartyCasu.every((t) => /—/.test(t) && /segment/.test(t))
    && naklady.length === 6 && naklady.filter((r) => r.k !== 'provize').every((r) => r.castka === '—' && /nejsou rozdělené/.test(r.t)) && /Kč/.test(naklady.find((r) => r.k === 'provize')?.castka ?? ''),
    'se segmentem: pracovní čas (tabulka i karty) „—“ s důvodem serveru, nikdy 0; náklady z evidence „—“ s důvodem, provize dál podle segmentu',
    JSON.stringify({ cas, kartyCasu: kartyCasu.map((t) => t.slice(0, 120)), naklady }));
  await ctx.close();
});

await blok050('PZ4 řádky = číslo', async () => {
  const { ctx, page } = await novaStranka('admin');
  const vysl = {};
  // a) hovory jednoho člověka v tabulce porovnání
  await jdi(page, '#/prehled/lide', 1200);
  const tlHovory = page.locator('table[data-tabulka="lide"] tbody tr', { hasText: 'Petra' }).locator('td[data-sloupec="hovory"] button.cislo-btn');
  const hovory = cisloPZ(await tlHovory.innerText());
  await enterPV(page, tlHovory);
  await klid(page, 700);
  vysl.hovory = { hovory, radku: await radkyPanelu(page), vTabulce: await page.locator('.proklik-panel tbody tr').count(), nadpis: txt(await page.locator('.proklik-panel h2').innerText()) };
  await zavriPanelPZ(page);
  // b) hodnota prodejů celého výběru (řádek Celkem)
  const tlHodnota = page.locator('table[data-tabulka="lide"] tfoot td[data-sloupec="hodnota_prodeju"] button.cislo-btn');
  await page.locator('.lide-pohled button', { hasText: 'Obchod' }).click();
  await page.waitForTimeout(150);
  const hodnota = txt(await tlHodnota.innerText());
  await enterPV(page, tlHodnota);
  await klid(page, 700);
  vysl.hodnota = { hodnota, soucet: await souctyPanelu(page) };
  await zavriPanelPZ(page);
  // c) náklady celkem (karta na Finance)
  await jdi(page, '#/prehled/finance', 1200);
  const naklady = txt(await kartaPV(page, 'naklady_celkem').locator('.kpi-hlavni').innerText());
  await enterPV(page, kartaPV(page, 'naklady_celkem').locator('.kpi-proklik'));
  await klid(page, 700);
  vysl.naklady = { naklady, soucet: await souctyPanelu(page) };
  await zavriPanelPZ(page);
  // d) jedno pásmo pipeline: číslo v tabulce grafu (klávesnicí) i segment grafu (myší)
  await jdi(page, '#/prehled/pipeline', 1200);
  const pasma = page.locator('figure[data-graf="pasma"]');
  const segment = pasma.locator('rect[data-pasmo]').first();
  const fazeSeg = await segment.getAttribute('data-faze');
  const pasmoSeg = await segment.getAttribute('data-pasmo');
  const nSeg = Number(await segment.getAttribute('data-n'));
  await segment.click();
  await klid(page, 700);
  vysl.segment = { faze: fazeSeg, pasmo: pasmoSeg, n: nSeg, radku: await radkyPanelu(page) };
  await zavriPanelPZ(page);
  await pasma.locator('button.graf-prepinac').click();
  await page.waitForTimeout(150);
  const tlPasma = pasma.locator(`.graf-tabulka tr[data-radek="${fazeSeg}"] td[data-pasmo="${pasmoSeg}"] button.cislo-btn`);
  const nTab = cisloPZ(await tlPasma.innerText());
  await enterPV(page, tlPasma);
  await klid(page, 700);
  vysl.pasmo = { n: nTab, radku: await radkyPanelu(page) };
  await zavriPanelPZ(page);
  over('PZ4', vysl.hovory.hovory > 0 && vysl.hovory.radku === vysl.hovory.hovory && vysl.hovory.vTabulce === vysl.hovory.hovory && /Petra/.test(vysl.hovory.nadpis)
    && vysl.hodnota.soucet.replace(/\s/g, '') === vysl.hodnota.hodnota.replace(/\s/g, '') && vysl.naklady.soucet.replace(/\s/g, '') === vysl.naklady.naklady.replace(/\s/g, '')
    && vysl.segment.n > 0 && vysl.segment.radku === vysl.segment.n && vysl.pasmo.n === vysl.segment.n && vysl.pasmo.radku === vysl.pasmo.n,
    'klik na číslo: hovory Petry = řádky hovorů, hodnota prodejů výběru = součet řádků, náklady celkem = součet řádků, pásmo pipeline (graf myší i tabulka klávesnicí) = řádky pásma',
    JSON.stringify(vysl));
  await ctx.close();
});

await blok050('PZ5 náklady', async () => {
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/prehled/finance', 1200);
  const radky = await page.locator('table[data-tabulka="naklady"] tbody tr[data-radek]').evaluateAll((rs) => rs.map((r) => ({ k: r.getAttribute('data-radek'), t: (r.textContent ?? '').replace(/\s+/g, ' ').trim(),
    castka: (r.querySelector('td[data-sloupec="castka"] .cislo-text')?.textContent ?? '').replace(/\s+/g, ' ').trim(), overit: !!r.querySelector('.overit-znacka') })));
  const celkem = cisloPZ(await kartaPV(page, 'naklady_celkem').locator('.kpi-hlavni').innerText());
  const soucet = radky.reduce((a, r) => a + cisloPZ(r.castka), 0);
  const graf = await page.locator('figure[data-graf="naklady"] [data-sloupec]').count();
  over('PZ5a', JSON.stringify(radky.map((r) => r.k)) === JSON.stringify(['provize', 'claude', 'lovable', 'domena', 'hosting', 'jine'])
    && radky.every((r) => r.castka !== '') && Math.round(soucet) === celkem && radky.find((r) => r.k === 'domena')?.overit && !radky.find((r) => r.k === 'claude')?.overit && graf >= 3,
    'náklady: šest kategorií každá zvlášť (provize a pět z evidence), „ověřit“ u domény, dohromady = karta Náklady celkem; graf kategorií',
    JSON.stringify({ radky, celkem, soucet, graf }));
  // s výběrem lidí jen provize: evidence nákladů není po lidech
  await jdi(page, '#/prehled/finance?od=' + `${dnesPV().slice(0, 8)}01` + '&do=' + posledniDenMesicePV(dnesPV()) + '&lide=2', 1200);
  const sLidmi = await page.locator('table[data-tabulka="naklady"] tbody tr[data-radek]').evaluateAll((rs) => rs.map((r) => ({ k: r.getAttribute('data-radek'),
    castka: (r.querySelector('td[data-sloupec="castka"] .cislo-text')?.textContent ?? '').replace(/\s+/g, ' ').trim(), t: (r.textContent ?? '').replace(/\s+/g, ' ').trim() })));
  over('PZ5b', sLidmi.filter((r) => r.k !== 'provize').every((r) => r.castka === '—' && /nejsou rozdělené podle lidí/.test(r.t)) && /Kč/.test(sLidmi.find((r) => r.k === 'provize')?.castka ?? '')
    && /—/.test(await kartaPV(page, 'naklady_celkem').locator('.kpi-hlavni').innerText()),
    's výběrem lidí: kategorie z evidence „—“ s důvodem, provize dál podle výběru, náklady celkem „—“ (nikdy 0)', JSON.stringify(sLidmi));
  await ctx.close();
});

await blok050('PZ6 grafy jako tabulka', async () => {
  const { ctx, page } = await novaStranka('admin');
  const vysl = {};
  for (const z of ['vedeni', 'lide', 'pipeline', 'klienti', 'komunikace', 'finance', 'dodani']) {
    await jdi(page, `#/prehled/${z}`, 1200);
    const grafy = page.locator('figure.graf');
    const n = await grafy.count();
    const v = [];
    for (let i = 0; i < n; i += 1) {
      const g = grafy.nth(i);
      const prepinac = g.locator('button.graf-prepinac');
      await prepinac.click();
      await page.waitForTimeout(120);
      v.push({ graf: await g.getAttribute('data-graf'), radku: await g.locator('.graf-tabulka tbody tr').count(), svg: await g.locator('svg[role="img"]').count(),
        expanded: await prepinac.getAttribute('aria-expanded') });
      await prepinac.click();
      await page.waitForTimeout(80);
    }
    vysl[z] = v;
  }
  // Klienti: čísla tabulky = čísla grafu
  await jdi(page, '#/prehled/klienti', 1200);
  const g = page.locator('figure[data-graf="segmenty"]');
  const vGrafu = await g.locator('text.graf-hodnota[data-hodnota]').evaluateAll((ts) => ts.map((t) => (t.textContent ?? '').trim()));
  await g.locator('button.graf-prepinac').click();
  await page.waitForTimeout(120);
  const vTabulce = await g.locator('.graf-tabulka tbody tr td:last-child').evaluateAll((ts) => ts.map((t) => (t.textContent ?? '').trim()));
  over('PZ6', Object.values(vysl).every((v) => v.length > 0 && v.every((x) => x.radku > 0 && x.svg === 0 && x.expanded === 'true'))
    && vGrafu.length > 0 && vGrafu.every((t) => vTabulce.includes(t)),
    'každý graf: „Zobrazit jako tabulku“ ukáže tabulku místo grafu (aria-expanded), čísla tabulky = popisky grafu', JSON.stringify({ vysl, vGrafu, vTabulce }));
  await ctx.close();
});

await blok050('PZ7 Volající', async () => {
  const { ctx, page } = await novaStranka('petra');
  const hashe = [];
  for (const z of [...Object.keys(ZALOZKY_PZ), 'nastaveni/cile']) {
    await jdi(page, `#/prehled/${z}?od=2026-11-01&do=2026-11-30&lide=1,4`, 600);
    hashe.push(await hashPV(page));
  }
  const zakazana = (await volani(page)).filter((v) => /^(prehled|cile|naklady|provize)/i.test(v.fn)).map((v) => v.fn);
  over('PZ7', hashe.every((h) => h === '#/') && zakazana.length === 0 && (await page.locator('nav a[href="#/prehled"]').count()) === 0,
    'Volající: žádná záložka Přehledu (ani s cizími lidmi v adrese) nic neukáže ani nezavolá; pilulka není', JSON.stringify({ hashe, zakazana }));
  await ctx.close();
});

// Oprava po recenzi úkolu 14a (18. 11. 2026, .superpowers/sdd/task-14a-fixes.md): týmy Vedení až po kartách a bez dvojího
// volání stejného výběru, varování odpovědi bloku vidět, akční seznam s „K datu“ bez volání, výběr metriky grafu i při chybě
// a při načítání, kvalita dat jednou za návštěvu.
await blok050('PZ10 oprava po recenzi', async () => {
  const { ctx, page } = await novaStranka('admin');
  await jdi(page, '#/prehled/vedeni', 1600);
  const v1 = await volani(page);
  const souhrn = v1.filter((v) => v.fn === 'prehledSouhrn').pop();
  const lideV = v1.filter((v) => v.fn === 'prehledLide' && v.zacatek > (souhrn?.zacatek ?? 0));
  const varovaniTymu = await page.locator('section[data-blok="tymy"] .prehled-varovani li[data-kod="CASOVAC_OD"]').count();
  over('PZ10a', !!souhrn && lideV.length >= 2 && lideV.every((v) => v.zacatek > souhrn.konec) && varovaniTymu === 1,
    'Vedení: týmy se načtou až po kartách (žádné prehled_lide před koncem prehled_souhrn); blok Týmy ukáže varování své odpovědi (CASOVAC_OD)',
    JSON.stringify({ souhrn: souhrn && [souhrn.zacatek, souhrn.konec], lide: lideV.map((v) => v.zacatek), varovaniTymu }));
  const od = `${dnesPV().slice(0, 8)}01`;
  const doDne = posledniDenMesicePV(dnesPV());
  const pred = (await volani(page)).length;
  await jdi(page, `#/prehled/vedeni?od=${od}&do=${doDne}&lide=1,2,5`, 1600);
  const poZmene = (await volani(page)).slice(pred);
  const lideTym = poZmene.filter((v) => v.fn === 'prehledLide');
  const souhrnB = poZmene.find((v) => v.fn === 'prehledSouhrn');
  over('PZ10b', lideTym.length === 1 && JSON.stringify(lideTym[0].args[0]?.lide) === '[1,2,5]' && (await page.locator('table[data-tabulka="tymy"] tbody tr[data-druh="tym"]').count()) === 1
    && !!souhrnB && lideTym[0].zacatek > souhrnB.konec,
    'výběr = celý jeden tým: jedno prehled_lide (řádek týmu z téže odpovědi), ne dvě stejná volání; i po změně filtru až po kartách',
    JSON.stringify({ lide: lideTym.map((v) => [v.args[0]?.lide, v.zacatek]), souhrn: souhrnB && [souhrnB.zacatek, souhrnB.konec] }));
  const predK = (await volani(page)).length;
  const k = new Date(Date.now() - 2 * 86400000).toISOString();
  await jdi(page, `#/prehled/vedeni?od=${od}&do=${doDne}&k=${encodeURIComponent(k)}`, 1600);
  const akceK = (await volani(page)).slice(predK).filter((v) => v.fn === 'prehledAkce').length;
  const vetaK = txt(await page.locator('section[data-blok="akce"]').innerText());
  over('PZ10c', akceK === 0 && /jen pro dnešek/.test(vetaK), 'K datu: akční seznam server nevolá a řekne, že je jen pro dnešek', JSON.stringify({ akceK, vetaK: vetaK.slice(0, 120) }));
  await ctx.close();

  const { ctx: ctx2, page: p2 } = await novaStranka('admin');
  // výběr metriky grafu je vidět už během prvního načtení řady …
  await p2.evaluate(() => {
    globalThis.__volackaDemoTest.zpozdeni = (fn) => (fn === 'prehledRada' ? 2500 : 0);
  });
  await p2.evaluate(() => { location.hash = '#/prehled/vedeni'; });
  await p2.waitForTimeout(700);
  const vyberPriNacitani = await p2.locator('select[aria-label="Co ukázat v grafu"]').count();
  const grafPriNacitani = await p2.locator('figure[data-graf="trend"]').count();
  await klid(p2, 300);
  // … i po chybě řady, a jde jím z vadné metriky odejít
  await p2.evaluate(() => {
    globalThis.__volackaDemoTest.zpozdeni = () => 0;
    globalThis.__volackaDemoTest.selhani = (fn, args) => (fn === 'prehledRada' && args[0] === 'inkaso' ? 'Řada teď nejde načíst (test).' : null);
  });
  const vyber = p2.locator('select[aria-label="Co ukázat v grafu"]');
  await vyber.selectOption('inkaso');
  await klid(p2, 600);
  const chybaRady = await p2.locator('.prehled-trend .prehled-chyba').count();
  const vyberPriChybe = await vyber.count();
  await vyber.selectOption('hovory');
  await klid(p2, 900);
  const radaH = await posledniPV(p2, 'prehledRada');
  over('PZ10d', vyberPriNacitani === 1 && grafPriNacitani === 0 && chybaRady === 1 && vyberPriChybe === 1 && radaH?.args[0] === 'hovory' && radaH?.ok === true
    && (await p2.locator('.prehled-trend figure[data-graf="trend"]').count()) === 1,
    'výběr metriky grafu je vidět při prvním načtení i po chybě řady a přepne na jinou metriku (mimo adresu)',
    JSON.stringify({ vyberPriNacitani, grafPriNacitani, chybaRady, vyberPriChybe, rada: radaH && [radaH.args[0], radaH.ok] }));
  await p2.evaluate(() => { globalThis.__volackaDemoTest.selhani = () => null; });
  // kvalita dat: jedno volání za návštěvu záložky, změna filtru ji znovu nevolá
  await jdi(p2, '#/prehled/prognoza', 1600);
  const kv1 = (await volani(p2)).filter((v) => v.fn === 'prehledKvalita').length;
  await p2.locator('.prehled-obdobi select').selectOption('minuly_mesic');
  await klid(p2, 1400);
  const kv2 = (await volani(p2)).filter((v) => v.fn === 'prehledKvalita').length;
  over('PZ10e', kv1 === 1 && kv2 === 1, 'kvalita dat: jedno volání za návštěvu záložky, změna filtru ji znovu nevolá', JSON.stringify({ kv1, kv2 }));
  await ctx2.close();
});

for (const sirka of [320, 360, 390]) {
  await blok050(`PZ8 ${sirka}`, async () => {
    const { ctx, page } = await novaStranka('admin', { sirka, vyska: 844 });
    const vysl = {};
    for (const z of Object.keys(ZALOZKY_PZ)) {
      await jdi(page, `#/prehled/${z}`, 1200);
      vysl[z] = await page.evaluate(() => document.documentElement.scrollWidth);
      if (sirka === 390) await snimekCely(page, `zalozka-${z}-390`);
    }
    await jdi(page, '#/prehled/lide', 1200);
    const obal = await page.locator('table[data-tabulka="lide"]').evaluate((t) => {
      const o = t.closest('.prehled-tabulka-obal');
      const s = o ? getComputedStyle(o).overflowX : '';
      return { siroka: !!o && o.scrollWidth > o.clientWidth + 1, posun: s, napoveda: !!o?.parentElement?.querySelector('.prehled-tabulka-napoveda:not([hidden])') };
    });
    // oprava po recenzi (důležité 1): tabulka grafu (pásma stáří) má rámeček s nápovědou a fokusem, stránka se do strany neposune
    await jdi(page, '#/prehled/pipeline', 1200);
    await page.locator('figure[data-graf="pasma"] button.graf-prepinac').click();
    await page.waitForTimeout(250);
    const tabGrafu = await page.locator('figure[data-graf="pasma"] .graf-tabulka').evaluate((g) => {
      const o = g.querySelector('.prehled-tabulka-obal');
      return { obal: !!o, tabIndex: o ? o.tabIndex : null, napoveda: !!g.querySelector('.prehled-tabulka-napoveda:not([hidden])'), siroka: !!o && o.scrollWidth > o.clientWidth + 1 };
    });
    const stranaGrafu = await page.evaluate(() => document.documentElement.scrollWidth);
    // drobnost 9: popisky osy X trendu se nepřekrývají (skutečné okraje textu, poslední zarovnaný doprava)
    await jdi(page, '#/prehled/vedeni', 1200);
    const osa = await page.locator('figure[data-graf="trend"] svg text.graf-osa').evaluateAll((ts) => {
      const maxY = Math.max(...ts.map((t) => Number(t.getAttribute('y'))));
      return ts.filter((t) => Number(t.getAttribute('y')) === maxY).map((t) => { const r = t.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), t.textContent]; })
        .sort((a, b) => a[0] - b[0]);
    });
    const prekryv = osa.filter((r, i) => i > 0 && r[0] < osa[i - 1][1] + 6).map((r) => r[2]);
    // drobnost 9: poznámka u nákladů je na telefonu čitelná (pod řádkem přes celou šířku, ne úzký sloupec)
    await jdi(page, '#/prehled/finance', 1200);
    const sirkaPozn = await page.locator('table[data-tabulka="naklady"] [data-pozn-pro="provize"]').evaluateAll((els) =>
      Math.max(0, ...els.filter((e) => e.offsetParent !== null && (e.textContent ?? '').trim().length > 0).map((e) => Math.round(e.getBoundingClientRect().width))));
    over(`PZ8 ${sirka}`, Object.values(vysl).every((w) => w <= sirka) && obal.siroka && /auto|scroll/.test(obal.posun) && obal.napoveda
      && tabGrafu.obal && (!tabGrafu.siroka || (tabGrafu.tabIndex === 0 && tabGrafu.napoveda)) && (sirka !== 320 || tabGrafu.siroka) && stranaGrafu <= sirka
      && osa.length >= 2 && prekryv.length === 0 && sirkaPozn >= 200,
      `telefon ${sirka} px: všech osm záložek bez posunu stránky do strany; široká tabulka lidí i tabulka grafu se posouvají ve svém rámečku s nápovědou; popisky osy trendu bez překryvu; poznámka nákladů čitelná`,
      JSON.stringify({ ...vysl, obal, tabGrafu, stranaGrafu, osa, prekryv, sirkaPozn }));
    await ctx.close();
  });
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
