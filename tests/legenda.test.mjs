// Test úplnosti legendy (Albert 27. 11. 2026, spec super klientů §5: „a legend: every status and every badge or marking the app
// can show has an entry“). Každý klíč map popisků v src/ui.tsx (stavy, příznaky, označení, známky, čekání, koše), každý stav
// návrhu e-mailu (src/kontrola.ts NAVRH_ODZNAK) a každá exportovaná komponenta *Badge / *Odznak musí mít v src/legenda.ts
// opravdovou větu; nový stav nebo odznak bez věty = FAIL. Spuštění: node tests/legenda.test.mjs (kořen appky nad tests/).
// Výsledek: řádek „ALL OK (N kontrol)“, jinak řádky „FAIL <id>: <česky> (…)“ a kód 1. Nesahá na síť ani na DB.

import { build } from 'esbuild';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

let bundle;
{
  const out = await build({
    stdin: {
      contents: [
        "export * as L from './src/legenda.ts';",
        "export * as U from './src/ui.tsx';",
        "export * as K from './src/kontrola.ts';",
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
  const dir = mkdtempSync(join(tmpdir(), 'legenda-test-'));
  const f = join(dir, 'b.cjs');
  writeFileSync(f, out.outputFiles[0].text);
  bundle = createRequire(import.meta.url)(f);
  rmSync(dir, { recursive: true, force: true });
}
const { L, U, K } = bundle;

let pocet = 0;
let chyby = 0;
function over(id, podminka, text, detail = '') {
  pocet += 1;
  if (!podminka) {
    chyby += 1;
    console.log(`FAIL ${id}: ${text}${detail ? ` (${detail})` : ''}`);
  }
}

// l1, l2: každá mapa popisků z ui.tsx a každý její klíč má větu
const mapy = { stav: U.STATUS_LABELS, priznak: U.FLAG_LABELS, oznaceni: U.OZNACENI_LABELS, znamka: U.ZNAMKA_FILTR_LABELS,
               cekani: U.CEKANI_LABELS, kos: U.KOS_LABELS };
for (const [sk, m] of Object.entries(mapy)) {
  over('l1-' + sk, !!m && typeof m === 'object' && Object.keys(m).length > 0, `ui.tsx exportuje mapu popisků skupiny ${sk}`);
  const chybi = Object.keys(m || {}).filter((k) => !(L.VYSVETLENI[sk] && L.VYSVETLENI[sk][k]));
  over('l2-' + sk, chybi.length === 0, `legenda vysvětluje každý klíč skupiny ${sk}`, chybi.join(', '));
}
// l3: stavy návrhu e-mailu (kontrola odpovědí)
const navrhy = Object.keys(K.NAVRH_ODZNAK || {});
over('l3', navrhy.length > 0 && navrhy.every((k) => L.VYSVETLENI.navrh?.[k]), 'legenda vysvětluje každý stav návrhu e-mailu',
  navrhy.filter((k) => !L.VYSVETLENI.navrh?.[k]).join(', '));
// l4: každá exportovaná komponenta *Badge / *Odznak má řádek (nová značka bez vysvětlení = FAIL)
const soubory = ['src/ui.tsx', ...readdirSync(join(ROOT, 'src/components')).filter((x) => x.endsWith('.tsx')).map((x) => 'src/components/' + x)];
const komponenty = [];
for (const s of soubory) {
  for (const m of readFileSync(join(ROOT, s), 'utf8').matchAll(/export (?:default )?function (\w+(?:Badge|Odznak))\b/g)) komponenty.push(m[1]);
}
over('l4a', komponenty.includes('StatusBadge') && komponenty.includes('WebNaMiruOdznak'), 'hledání odznaků najde StatusBadge i WebNaMiruOdznak',
  komponenty.join(', '));
const bez = komponenty.filter((k) => !L.VYSVETLENI.znacky?.[k]);
over('l4', bez.length === 0, 'každý odznak (komponenta) má řádek v legendě', bez.join(', '));
// l5: řádky jsou opravdové věty a legenda je seznam se všemi skupinami
const polozky = L.legenda();
over('l5', polozky.length >= 40 && polozky.every((p) => p.vysvetleni.length >= 10 && !/TODO|\?\?\?/.test(p.vysvetleni)),
  'řádky legendy jsou opravdové věty', polozky.filter((p) => p.vysvetleni.length < 10).map((p) => p.klic).join(', '));
over('l6', ['stav', 'priznak', 'oznaceni', 'znamka', 'cekani', 'kos', 'navrh', 'znacky'].every((s) => polozky.some((p) => p.skupina === s)),
  'legenda má všechny skupiny');
// l7: zapojení: tlačítko v horní liště pro všechny role
const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8');
over('l7', /<LegendaTlacitko \/>/.test(app), 'tlačítko legendy je v horní liště');

console.log(chyby ? `SOME FAILED (${chyby} z ${pocet})` : `ALL OK (${pocet} kontrol)`);
process.exit(chyby ? 1 : 0);
