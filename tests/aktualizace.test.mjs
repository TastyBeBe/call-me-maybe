// Test chování: automatická aktualizace appky (src/aktualizace.ts, Albert 21. 10. 2026).
//
// Otevřená appka si sama načte novou nasazenou verzi (jméno balíčku assets/index-*.js v index.html se liší
// od běžícího), ale nikdy uprostřed psaní. Měří čisté funkce bundleZHtml, jeNovaVerze a rozepsano a že main.tsx
// aktualizaci spouští. Nikdy nesahá na síť ani živou DB. Spuštění:
//   node tests/aktualizace.test.mjs        (kořen appky = složka nad tests/)
// Výsledek: řádek „ALL OK (N kontrol)", jinak řádky „FAIL <id>: <česky>" a kód 1.

import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(process.env.APP_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..'));
const tmp = mkdtempSync(join(tmpdir(), 'aktualizace-test-'));
const out = join(tmp, 'aktualizace.mjs');
await build({
  entryPoints: [join(ROOT, 'src/aktualizace.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  define: { 'import.meta.env.PROD': 'false' },
  logLevel: 'silent',
});
const m = await import(pathToFileURL(out).href);

let n = 0;
let fail = 0;
const ok = (id, podminka, text) => {
  n++;
  if (!podminka) {
    fail++;
    console.log(`FAIL ${id}: ${text}`);
  }
};

const html = (b) => `<html><head><script type="module" crossorigin src="./assets/${b}"></script></head></html>`;

// A: jméno balíčku z index.html
ok('A1', m.bundleZHtml(html('index-DOQQ837K.js')) === 'assets/index-DOQQ837K.js', 'jméno balíčku se z index.html nevytáhne');
ok('A2', m.bundleZHtml('<html>bez skriptu</html>') === null, 'index.html bez balíčku nedá null');
ok('A3', m.bundleZHtml(html('index-a_b-C.js')) === 'assets/index-a_b-C.js', 'jméno s podtržítkem a pomlčkou se nevytáhne celé');

// B: rozhodnutí o nové verzi
ok('B1', m.jeNovaVerze('assets/index-AAA.js', html('index-BBB.js')) === true, 'jiný balíček na serveru se nepozná jako nová verze');
ok('B2', m.jeNovaVerze('assets/index-AAA.js', html('index-AAA.js')) === false, 'stejný balíček se bere jako nová verze');
ok('B3', m.jeNovaVerze(null, html('index-BBB.js')) === false, 'bez běžícího balíčku (vývoj) se načítá');
ok('B4', m.jeNovaVerze('assets/index-AAA.js', '<html>chyba Pages</html>') === false, 'stránka bez balíčku (výpadek) spustí načtení');

// C: nikdy uprostřed psaní
const dok = ({ aktivni = null, pole = [], modal = false } = {}) => ({
  activeElement: aktivni,
  querySelectorAll: () => pole,
  querySelector: (s) => (s === '.modal' && modal ? {} : null),
});
ok('C1', m.rozepsano(dok()) === false, 'prázdná stránka se bere jako rozepsaná');
ok('C2', m.rozepsano(dok({ aktivni: { tagName: 'TEXTAREA' } })) === true, 'kurzor v poznámce nebrání načtení');
ok('C3', m.rozepsano(dok({ aktivni: { tagName: 'INPUT', type: 'text' } })) === true, 'kurzor v políčku nebrání načtení');
ok('C4', m.rozepsano(dok({ pole: [{ tagName: 'TEXTAREA', value: 'volat zítra' }] })) === true, 'vyplněná poznámka bez kurzoru nebrání načtení');
ok('C5', m.rozepsano(dok({ pole: [{ tagName: 'INPUT', type: 'number', value: '14000' }] })) === true, 'vyplněná cena nebrání načtení');
ok('C6', m.rozepsano(dok({ pole: [{ tagName: 'INPUT', type: 'checkbox', value: 'on' }] })) === false, 'zaškrtávátko brání načtení');
ok('C7', m.rozepsano(dok({ pole: [{ tagName: 'TEXTAREA', value: '   ' }] })) === false, 'poznámka jen z mezer brání načtení');
ok('C8', m.rozepsano(dok({ modal: true })) === true, 'otevřené potvrzovací okno nebrání načtení');
ok('C9', m.rozepsano(dok({ aktivni: { tagName: 'BUTTON' } })) === false, 'kliknuté tlačítko brání načtení');

// D: zapojení
ok('D1', m.spustAktualizace() === undefined, 'spustAktualizace mimo produkci nevrací nic / padá');
const main = readFileSync(join(ROOT, 'src/main.tsx'), 'utf8');
ok('D2', /import \{ spustAktualizace \} from '\.\/aktualizace'/.test(main) && /\nspustAktualizace\(\);/.test(main), 'main.tsx aktualizaci nespouští');
const zdroj = readFileSync(join(ROOT, 'src/aktualizace.ts'), 'utf8');
ok('D3', /cache: 'no-store'/.test(zdroj), 'index.html se nestahuje bez cache');
ok('D4', /if \(!import\.meta\.env\.PROD\) return;/.test(zdroj), 'aktualizace běží i ve vývoji');

rmSync(tmp, { recursive: true, force: true });
if (fail) process.exit(1);
console.log(`ALL OK (${n} kontrol)`);
