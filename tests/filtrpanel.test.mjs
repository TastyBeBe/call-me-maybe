// Test rozložení filtrů seznamů (Přehled vedení, úkol 11; Albert 17. 11. 2026: filtry jsou „super messy and clunky … not in
// terms of the content, but how they are positioned and structured“). Kontakty, Moji klienti a Označené mají tytéž filtry,
// tytéž parametry serveru a tutéž viditelnost jako dřív; mění se jen pořadí, skupiny, popisky, čipy zapnutých filtrů se
// „Zrušit vše“ a na telefonu panel „Filtry (n)“ (spec docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md §7.4).
//
// Měří:
//  - stav filtrů (src/filtry.ts): čekání, koš a pilulky „Co je potřeba“ jsou ve stavu stránky, zrusVse je zruší a segment
//    nechá, převod na parametry serveru je bajtově stejný jako před úkolem 11 (zmražená kopie z commitu 1e8e882 níž),
//  - čipy (aktivniChipy v src/components/FiltrPanel.tsx): text a zrušení každého zapnutého filtru,
//  - panel (FiltrPanel) vykreslený na serveru (react-dom/server): pořadí tří řad na počítači, na telefonu tlačítko
//    „Filtry (n)“ bez řady filtrů, dokud se panel neotevře,
//  - zapojení stránek (zdrojový text): jeden panel, jedno hledání s jedním zpožděním, osoba v řadě 1.
// Klikání na stránkách (1280, 390, 360 a 320 px) měří tests/demo-e2e.mjs blok FP.
// Spuštění: node tests/filtrpanel.test.mjs (APP_ROOT=/cesta/ke/kopii pro mutace). Výsledek „ALL OK (N kontrol)“ nebo
// řádky „FAIL <id>: …“ a kód 1.

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
globalThis.fetch = async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
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
/** Porovnání bez ohledu na pořadí klíčů (parametry serveru jsou objekt, pořadí klíčů nic neznamená). */
const kanon = (x) => JSON.stringify(x, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));
const stejne = (a, b) => kanon(a) === kanon(b);

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
  const dir = mkdtempSync(join(tmpdir(), 'filtrpanel-test-'));
  const f = join(dir, 'b.cjs');
  writeFileSync(f, out.outputFiles[0].text);
  try {
    return createRequire(import.meta.url)(f);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// stav filtrů zvlášť (jde sestavit i bez panelu: RED ukáže, co přesně chybí)
let FM = null;
try {
  FM = await balicek(["export * from './src/filtry.ts';"]);
} catch (e) {
  over('FP0a', false, 'src/filtry.ts nejde sestavit', String(e.message).split('\n')[0]);
}
let P = null;
try {
  P = await balicek([
    "export * from './src/components/FiltrPanel.tsx';",
    "export { default as FiltrPanel } from './src/components/FiltrPanel.tsx';",
    "export { renderToStaticMarkup } from 'react-dom/server';",
    "export { createElement } from 'react';",
  ]);
} catch (e) {
  over('FP0', false, 'src/components/FiltrPanel.tsx nejde sestavit (panel filtrů chybí)', String(e.message).split('\n').slice(0, 2).join(' | '));
}

/* ---------------- zmražený převod na server z commitu 1e8e882 (před úkolem 11) ---------------- */
const REF = {
  mlceni(f) {
    return {
      ...(f.jenHvezda ? { jen_hvezda: true } : {}),
      ...(f.jenOdpovedel ? { odpovedel: true } : {}),
      ...(f.kategorie.length > 0 ? { kategorie: [...f.kategorie] } : {}),
      ...(f.mlciMin !== null ? { mlci_min: f.mlciMin } : {}),
      ...(f.mlciMax !== null ? { mlci_max: f.mlciMax } : {}),
    };
  },
  filtryNaServer(f) {
    return {
      ...(f.statusy.length === 1 ? { status: f.statusy[0] } : f.statusy.length > 1 ? { statusy: [...f.statusy] } : {}),
      ...(f.znamky.length === 1 && f.znamky[0] !== 'bez' ? { rating: f.znamky[0] } : f.znamky.length > 0 ? { znamky: [...f.znamky] } : {}),
      ...REF.mlceni(f),
    };
  },
  filtryBezStavu(f) {
    return REF.filtryNaServer({ ...f, statusy: [] });
  },
  filtryOznacenych(f) {
    const m = REF.mlceni(f);
    delete m.kategorie;
    return { ...(f.statusy.length > 0 ? { statusy: [...f.statusy] } : {}), ...(f.znamky.length > 0 ? { znamky: [...f.znamky] } : {}), ...m };
  },
};

/** Plný stav: všechno zapnuté (segment, řazení a hledání taky). */
const PLNY = {
  segment: 'architekt',
  statusy: ['zajem', 'navrh_odeslan'],
  znamky: ['A', 'bez'],
  jenHvezda: true,
  jenOdpovedel: true,
  kategorie: ['navrh', 'zmeny'],
  mlciMin: 5,
  mlciMax: 20,
  razeni: 'mlceni',
  hledat: 'Novák',
  cekani: 'ceka_prvni',
  kos: 'k_zavolani',
  druhy: ['navrh', 'chybi_email'],
};

/* ---------------- S) stav filtrů: nová pole a Zrušit vše ---------------- */
await blok('S', async () => {
  if (!FM) return;
  const P0 = FM.PRAZDNE_FILTRY;
  over('FP1', P0 && P0.cekani === '' && P0.kos === '' && Array.isArray(P0.druhy) && P0.druhy.length === 0 && P0.segment === '',
    'prázdný stav má čekání, koš a druhy (Co je potřeba) vypnuté', JSON.stringify(P0));
  over('FP7', typeof FM.zrusVse === 'function', 'filtry.ts má zrusVse(f)');
  if (typeof FM.zrusVse === 'function') {
    const kopie = JSON.parse(JSON.stringify(PLNY));
    const z = FM.zrusVse(PLNY);
    over('FP7a', z.segment === 'architekt', 'Zrušit vše nechá segment (jako dřív „Zrušit filtry“)', JSON.stringify(z));
    over('FP7b', z.cekani === '' && z.kos === '', 'Zrušit vše vypne čekání i koš', JSON.stringify(z));
    over('FP7c', z.kategorie.length === 0 && z.druhy.length === 0, 'Zrušit vše vypne Neodpověděl i pilulky „Co je potřeba“', JSON.stringify(z));
    over('FP7d', z.mlciMin === null && z.mlciMax === null && !z.jenHvezda && !z.jenOdpovedel, 'Zrušit vše vypne mlčení, hvězdu a „odpověděl, zatím nepotvrdil“', JSON.stringify(z));
    over('FP7e', z.statusy.length === 0 && z.znamky.length === 0, 'Zrušit vše vypne stav a známku', JSON.stringify(z));
    over('FP7f', z.hledat === '' && z.razeni === '', 'Zrušit vše vrátí hledání i řazení (jako dřív „Zrušit filtry“)', JSON.stringify(z));
    over('FP7g', stejne(z, { ...P0, segment: 'architekt' }) && stejne(PLNY, kopie), 'Zrušit vše = prázdný stav se stejným segmentem, původní stav se nemění');
  }
  over('FP8', typeof FM.lzeZrusit === 'function', 'filtry.ts má lzeZrusit(f)');
  if (typeof FM.lzeZrusit === 'function') {
    const jedno = Object.keys(PLNY).filter((k) => k !== 'segment').filter((k) => !FM.lzeZrusit({ ...P0, [k]: PLNY[k] }));
    over('FP8a', !FM.lzeZrusit(P0) && !FM.lzeZrusit({ ...P0, segment: 'chata' }) && jedno.length === 0,
      'lzeZrusit: ne u prázdného stavu ani u samotného segmentu, ano u každého jiného zapnutého pole', jedno.join(', '));
  }
  over('FP9', typeof FM.sCekanim === 'function', 'filtry.ts má sCekanim(f, čekání)');
  if (typeof FM.sCekanim === 'function') {
    const a = FM.sCekanim({ ...P0, kos: 'vlazne' }, 'ceka_prvni');
    const b = FM.sCekanim({ ...P0, cekani: 'ceka_prvni', kos: 'vlazne' }, '');
    const c = FM.sCekanim({ ...P0, cekani: 'ceka_prvni', kos: 'vlazne' }, 'ceka_po_odpovedi');
    over('FP9a', a.cekani === 'ceka_prvni' && a.kos === 'k_zavolani' && b.cekani === '' && b.kos === '' && c.kos === 'k_zavolani',
      'zapnutí čekání rovnou zapne koš „k zavolání“, vypnutí koš zruší (jako dřív výběr čekání)', JSON.stringify([a, b, c]));
  }
});

/* ---------------- R) regrese: parametry serveru přesně jako před úkolem 11 ---------------- */
await blok('R', async () => {
  if (!FM) return;
  const S = (patch) => ({ ...FM.PRAZDNE_FILTRY, ...patch });
  // tabulka z filtry.test.mjs O14 a krajní případy
  const pripady = [
    S({}), S({ statusy: ['zajem'] }), S({ statusy: ['zajem', 'navrh_odeslan'] }), S({ znamky: ['A'] }), S({ znamky: ['bez'] }),
    S({ znamky: ['A', 'B'] }), S({ jenHvezda: true, kategorie: ['navrh'], mlciMin: 0, mlciMax: 30 }), S({ jenOdpovedel: true }),
    S({ mlciMax: 9999 }), S({ statusy: ['hotovo'], znamky: ['C'] }), S(PLNY), S({ cekani: 'ceka_po_odpovedi', kos: 'vychladle' }),
    S({ druhy: ['chybi_info'], segment: 'chata', razeni: 'hvezda', hledat: 'x' }),
  ];
  // a 600 stavů z deterministického generátoru (všechna pole, i nová)
  let semeno = 17;
  const nahoda = () => ((semeno = (semeno * 1103515245 + 12345) % 2147483648) / 2147483648);
  const vyber = (pole) => pole.filter(() => nahoda() < 0.3);
  const STAVY = ['nekontaktovano', 'nedovolano', 'zajem', 'navrh_odeslan', 'ceka_na_klienta', 'hotovo', 'eskalace'];
  for (let i = 0; i < 600; i++) {
    pripady.push(S({
      segment: ['', 'chata', 'architekt', 'autoservis'][Math.floor(nahoda() * 4)],
      statusy: vyber(STAVY),
      znamky: vyber(['A', 'B', 'C', 'bez']),
      jenHvezda: nahoda() < 0.3,
      jenOdpovedel: nahoda() < 0.3,
      kategorie: vyber(['navrh', 'zmeny']),
      mlciMin: nahoda() < 0.3 ? Math.floor(nahoda() * 40) : null,
      mlciMax: nahoda() < 0.3 ? Math.floor(nahoda() * 40) : null,
      razeni: nahoda() < 0.3 ? 'mlceni' : '',
      hledat: nahoda() < 0.3 ? 'Nov' : '',
      cekani: nahoda() < 0.3 ? 'ceka_prvni' : '',
      kos: nahoda() < 0.3 ? 'vlazne' : '',
      druhy: vyber(['navrh', 'chybi_email']),
    }));
  }
  const spatne = [];
  for (const f of pripady) {
    for (const fn of ['filtryNaServer', 'filtryBezStavu', 'filtryOznacenych']) {
      if (!stejne(FM[fn](f), REF[fn](f))) spatne.push(`${fn} ${JSON.stringify(f)} → ${JSON.stringify(FM[fn](f))} ≠ ${JSON.stringify(REF[fn](f))}`);
    }
  }
  over('FP10', spatne.length === 0, `parametry serveru pro ${pripady.length} stavů přesně jako před úkolem 11 (čekání, koš ani druhy do nich nejdou)`,
    spatne.slice(0, 2).join(' | '));
  const nove = FM.filtryNaServer(S(PLNY));
  over('FP10b', !('cekani' in nove) && !('kos' in nove) && !('druhy' in nove) && !('segment' in nove) && !('search' in nove),
    'filtryNaServer neposílá čekání, koš, druhy, segment ani hledání (ty posílá stránka sama jako dřív)', JSON.stringify(nove));
});

/* ---------------- C) čipy zapnutých filtrů ---------------- */
await blok('C', async () => {
  if (!P || !FM) return;
  over('FP2', typeof P.aktivniChipy === 'function', 'FiltrPanel.tsx má aktivniChipy(f)');
  if (typeof P.aktivniChipy !== 'function') return;
  const cipy = P.aktivniChipy(PLNY);
  const ocek = [
    ['stav:zajem', 'Stav: Mají zájem'],
    ['stav:navrh_odeslan', 'Stav: Návrh odeslán'],
    ['znamka:A', 'Známka A'],
    ['znamka:bez', 'Bez známky'],
    ['kategorie:navrh', 'Neodpověděl na návrh'],
    ['kategorie:zmeny', 'Neodpověděl na změny'],
    ['mlci', 'Mlčí 5–20 prac. dní'],
    ['cekani', 'Čeká na první odpověď'],
    ['kos', 'K zavolání (7–30 dní)'],
    ['hvezda', 'Jen s hvězdou'],
    ['odpovedel', 'Odpověděl, zatím nepotvrdil'],
    ['druh:navrh', 'Neodpověděl na návrh'],
    ['druh:chybi_email', 'Chybí e-mail'],
  ];
  over('FP2a', stejne(cipy.map((c) => [c.klic, c.text]), ocek), 'čipy plného stavu v pořadí řady filtrů (segment, řazení a hledání čip nemají)',
    JSON.stringify(cipy.map((c) => [c.klic, c.text])));
  // každý čip zruší jen svou hodnotu
  const ocekZrus = {
    'stav:zajem': { statusy: ['navrh_odeslan'] },
    'stav:navrh_odeslan': { statusy: ['zajem'] },
    'znamka:A': { znamky: ['bez'] },
    'znamka:bez': { znamky: ['A'] },
    'kategorie:navrh': { kategorie: ['zmeny'] },
    'kategorie:zmeny': { kategorie: ['navrh'] },
    mlci: { mlciMin: null, mlciMax: null },
    cekani: { cekani: '', kos: '' },
    kos: { kos: '' },
    hvezda: { jenHvezda: false },
    odpovedel: { jenOdpovedel: false },
    'druh:navrh': { druhy: ['chybi_email'] },
    'druh:chybi_email': { druhy: ['navrh'] },
  };
  const spatne = cipy.filter((c) => !stejne(c.zrus(), { ...PLNY, ...ocekZrus[c.klic] })).map((c) => `${c.klic} → ${JSON.stringify(c.zrus())}`);
  over('FP3', cipy.length === ocek.length && spatne.length === 0, 'křížek čipu zruší jen jeho hodnotu, ostatní filtry zůstanou', spatne.slice(0, 2).join(' | '));
  const P0 = FM.PRAZDNE_FILTRY;
  over('FP4', P.aktivniChipy(P0).length === 0 && P.aktivniChipy({ ...P0, segment: 'chata', razeni: 'hvezda', hledat: 'Novák' }).length === 0,
    'bez filtrů žádný čip; segment, řazení a hledání čip nedělají (jsou vidět ve svém poli)');
  const mlci = (mlciMin, mlciMax) => P.aktivniChipy({ ...P0, mlciMin, mlciMax }).map((c) => c.text).join('|');
  over('FP5', mlci(10, null) === 'Mlčí 10+ prac. dní' && mlci(null, 20) === 'Mlčí nejvýš 20 prac. dní' && mlci(null, 1) === 'Mlčí nejvýš 1 prac. den'
    && mlci(5, 20) === 'Mlčí 5–20 prac. dní' && mlci(3, 3) === 'Mlčí 3 prac. dny' && mlci(0, null) === 'Mlčí 0+ prac. dní',
    'čip mlčení: od, nejvýš, rozsah i jeden den', [mlci(10, null), mlci(null, 20), mlci(null, 1), mlci(5, 20), mlci(3, 3), mlci(0, null)].join(' / '));
  over('FP6', P.aktivniChipy({ ...P0, kos: 'vlazne' }).length === 0
    && stejne(P.aktivniChipy({ ...P0, cekani: 'ceka_po_odpovedi', kos: '' }).map((c) => c.text), ['Čeká po naší odpovědi']),
    'koš bez čekání čip nemá (stránka ho bez čekání neposílá); čekání bez koše jen čip čekání');
});

/* ---------------- V) panel vykreslený na serveru: pořadí řad (počítač) a telefon ---------------- */
await blok('V', async () => {
  if (!P || !FM || typeof P.FiltrPanel !== 'function') return;
  const h = P.createElement;
  const props = (filtry, navic = {}) => ({
    filtry,
    onFiltry: () => {},
    lide: h('select', { 'aria-label': 'Filtr volajícího' }, h('option', { value: '' }, 'Všichni volající')),
    hledat: { aria: 'Hledat v kontaktech', placeholder: 'Hledat jméno…' },
    razeni: h('select', { 'aria-label': 'Řazení', className: 'razeni-select' }),
    cekani: true,
    koseClassName: 'moji-kose',
    className: 'moji-filtry',
    ...navic,
  });
  const html = P.renderToStaticMarkup(h(P.FiltrPanel, props(PLNY)));
  const kde = (s) => html.indexOf(s);
  const poradi = [
    'filtr-rada-1', 'aria-label="Filtr volajícího"', 'segment-filter', 'search-input',
    'filtr-rada-2', 'aria-label="Filtr statusu"', 'aria-label="Filtr známky"', 'aria-label="Filtr označení"', 'aria-label="Filtr mlčení"',
    'aria-label="Filtr čekání na odpověď"', 'aria-label="Jen s hvězdou"', 'aria-label="Odpověděl, zatím nepotvrdil"', 'aria-label="Řazení"',
    'moji-kose', 'filtr-cipy', 'Zrušit vše',
  ];
  const ind = poradi.map(kde);
  over('FP11', ind.every((i) => i >= 0) && ind.every((i, j) => j === 0 || ind[j - 1] < i),
    'počítač: řada 1 osoba · segment · hledání, řada 2 stav · známka · neodpověděl · mlčí · čekání · hvězda · odpověděl · řazení, pod ní koše, řada 3 čipy a Zrušit vše',
    poradi.map((p, j) => `${p}@${ind[j]}`).join(' '));
  // počet prvků s přesně touhle třídou (ne podřetězec: flag-filter-bar není filter-bar)
  const tridy = (s, t) => [...s.matchAll(/class="([^"]*)"/g)].filter((m) => m[1].split(/\s+/).includes(t)).length;
  over('FP11b', tridy(html, 'search-input') === 1 && tridy(html, 'filter-bar') === 1
    && /class="[^"]*filtr-panel[^"]*moji-filtry/.test(html) && !/filtr-telefon-btn/.test(html) && !/role="dialog"/.test(html),
    'počítač: jedno pole hledání, jedna řada filter-bar s řazením, třída stránky na panelu, bez tlačítka a okna telefonu');
  const prazdny = P.renderToStaticMarkup(h(P.FiltrPanel, props(FM.PRAZDNE_FILTRY)));
  over('FP11c', !/filtr-cipy/.test(prazdny) && !/Zrušit vše/.test(prazdny) && !/moji-kose/.test(prazdny) && /Stav: vše/.test(prazdny),
    'bez filtrů žádné čipy ani Zrušit vše, koše jen se zapnutým čekáním; tlačítko stavu „Stav: vše“');
  const oznacene = P.renderToStaticMarkup(h(P.FiltrPanel, props(FM.PRAZDNE_FILTRY, { kategorie: false, cekani: false, lide: null, extra: h('div', { className: 'oznacene-druhy' }) })));
  over('FP11d', !/aria-label="Filtr označení"/.test(oznacene) && !/Filtr čekání/.test(oznacene) && /oznacene-druhy/.test(oznacene)
    && oznacene.indexOf('filtr-rada-2') < oznacene.indexOf('oznacene-druhy'),
    'Označené: bez Neodpověděl a čekání, pilulky „Co je potřeba“ pod řadou filtrů');
  // ⚠ rozhodnutí koordinátora 18. 11. 2026: výběr člověka je rozsah stránky jako segment, „Zrušit vše“ ho nechá. Čip osoby
  // zůstává (je vidět i na telefonu, kde je výběr v okně) a zruší ho jen jeho křížek; „Zrušit vše“ je jen u čipů filtrů, sám
  // čip osoby ho nemá (tlačítko by nic nezrušilo). NAHRAZUJE „Zrušit vše vrátí i výběr člověka“ (b34677f).
  const lideCipJen = { text: 'Klienti: Petra', zrus: () => {} };
  const jenOsoba = P.renderToStaticMarkup(h(P.FiltrPanel, props(FM.PRAZDNE_FILTRY, { lideCip: lideCipJen })));
  const sOsobou = P.renderToStaticMarkup(h(P.FiltrPanel, props({ ...FM.PRAZDNE_FILTRY, jenHvezda: true }, { lideCip: lideCipJen })));
  over('FP11e', /filtr-cipy/.test(jenOsoba) && /Klienti: Petra/.test(jenOsoba) && !/Zrušit vše/.test(jenOsoba)
    && /Klienti: Petra/.test(sOsobou) && /Jen s hvězdou/.test(sOsobou) && /Zrušit vše/.test(sOsobou),
    'počítač: čip osoby bez „Zrušit vše“, když jiný filtr zapnutý není; s filtrem čip osoby i „Zrušit vše“');
  // telefon (do 640 px): hledání a segment venku, ostatní filtry až v panelu „Filtry (n)“
  globalThis.window = { matchMedia: (q) => ({ matches: /max-width:\s*640px/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) };
  try {
    const lideCip = { text: 'Volající: Petra', zrus: () => {} };
    const tel = P.renderToStaticMarkup(h(P.FiltrPanel, props(PLNY, { lideCip })));
    const n = P.aktivniChipy(PLNY).length + 1;
    const tlacitko = /<button[^>]*filtr-telefon-btn[^>]*>([\s\S]*?)<\/button>/.exec(tel)?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
    over('FP12', tlacitko === `Filtry (${n})` && /aria-expanded="false"/.test(tel) && /segment-filter/.test(tel) && /search-input/.test(tel)
      && !/aria-label="Filtr statusu"/.test(tel) && !/aria-label="Řazení"/.test(tel) && !/aria-label="Filtr volajícího"/.test(tel),
      'telefon: segment, hledání a tlačítko „Filtry (n)“ (n = počet čipů i s osobou), osoba, stav a řazení až v panelu', `${tlacitko} | n=${n}`);
    over('FP12b', /Volající: Petra/.test(tel) && /Zrušit vše/.test(tel) && tel.indexOf('search-input') < tel.indexOf('filtr-telefon-btn'),
      'telefon: čipy (i osoby) a Zrušit vše hned pod hledáním vedle tlačítka Filtry');
    const telPrazdny = P.renderToStaticMarkup(h(P.FiltrPanel, props(FM.PRAZDNE_FILTRY)));
    const t2 = /<button[^>]*filtr-telefon-btn[^>]*>([\s\S]*?)<\/button>/.exec(telPrazdny)?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
    over('FP12c', t2 === 'Filtry' && !/Zrušit vše/.test(telPrazdny), 'telefon bez filtrů: jen „Filtry“, žádné Zrušit vše', t2);
    // rozhodnutí koordinátora 18. 11. 2026: jen vybraný člověk = čip osoby a „Filtry (1)“, ale žádné „Zrušit vše“
    const telOsoba = P.renderToStaticMarkup(h(P.FiltrPanel, props(FM.PRAZDNE_FILTRY, { lideCip })));
    const t3 = /<button[^>]*filtr-telefon-btn[^>]*>([\s\S]*?)<\/button>/.exec(telOsoba)?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
    over('FP12d', t3 === 'Filtry (1)' && /Volající: Petra/.test(telOsoba) && !/Zrušit vše/.test(telOsoba),
      'telefon jen s vybraným člověkem: „Filtry (1)“ a čip osoby, „Zrušit vše“ ne (osobu nechává)', t3);
  } finally {
    delete globalThis.window;
  }
});

/* ---------------- Z) zapojení stránek ---------------- */
await blok('Z', async () => {
  const src = (p) => readFileSync(join(ROOT, p), 'utf8');
  const admin = src('src/pages/AdminPage.tsx');
  const moji = src('src/pages/MojiPage.tsx');
  const ozn = src('src/pages/OznacenePage.tsx');
  let panel = '';
  try { panel = src('src/components/FiltrPanel.tsx'); } catch { /* chybí: FP0 */ }
  const strany = { Kontakty: admin, 'Moji klienti': moji, 'Označené': ozn };
  const spatne = [];
  for (const [n, s] of Object.entries(strany)) {
    if ((s.match(/<FiltrPanel\s/g) ?? []).length !== 1) spatne.push(`${n}: ne právě jeden <FiltrPanel>`);
    if (/<SeznamFiltry\s|<SegmentFilter\s|className="search-input"/.test(s)) spatne.push(`${n}: vlastní řádek filtrů, segment nebo pole hledání mimo panel`);
    if (!/useZpozdeneHledani\(/.test(s) || /setTimeout\(/.test(s)) spatne.push(`${n}: hledání bez sdíleného zpoždění (useZpozdeneHledani) nebo vlastní setTimeout`);
  }
  over('FP13', spatne.length === 0, 'tři stránky: jeden panel FiltrPanel, hledání jen v panelu, jedno zpoždění hledání', spatne.join(' | '));
  over('FP13b', P?.HLEDANI_ZPOZDENI_MS === 300 && (panel.match(/setTimeout\(/g) ?? []).length === 1,
    'zpoždění hledání 300 ms jako dřív, na jednom místě (FiltrPanel)', String(P?.HLEDANI_ZPOZDENI_MS));
  // ⚠ rozhodnutí koordinátora 18. 11. 2026: „Zrušit vše“ výběr člověka nechá (rozsah stránky jako segment); NAHRAZUJE FP13c
  // „Zrušit vše přes zrusVse a co stránka vrátí navíc (onZrusVse: výběr člověka)“ z b34677f
  const zrusKlik = /const zrusVseKlik = \(\) => \{([\s\S]*?)\};/.exec(panel)?.[1] ?? '';
  // kód bez komentářů (poznámky „NAHRAZUJE … onZrusVse“ v komentářích zůstávají jako historie)
  const kod = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  over('FP13c', zrusKlik.trim() === 'onFiltry(zrusVse(filtry));' && !/onZrusVse/.test(kod(panel)) && !/onZrusVse/.test(kod(admin + moji + ozn))
    && /role="dialog"/.test(panel) && /aria-modal="true"/.test(panel),
    'panel: Zrušit vše jen zrusVse (výběr člověka ani segment nemění, stránky nic navíc nevracejí), na telefonu okno role dialog',
    zrusKlik.trim().slice(0, 120));
  // osoba v řadě 1: Kontakty výběr volajícího (i Volající, jako dřív), Moji klienti a Označené PersonPicker (jen super admin)
  over('FP13d', (admin.match(/aria-label="Filtr volajícího"/g) ?? []).length === 1 && /<option value="">Všichni volající<\/option>/.test(admin)
    && /<option value=\{session\.display_name\}>Naposledy volal\/a já<\/option>/.test(admin)
    && /lide=\{\s*<select/.test(admin) && /lide=\{\s*<PersonPicker/.test(moji) && /lide=\{\s*<PersonPicker/.test(ozn)
    && /label="Čí klienty zobrazit"/.test(moji) && /bezVolajiciho="Bez volajícího"/.test(ozn),
    'osoba v řadě 1: Kontakty výběr volajícího (Volající „Naposledy volal/a já“ jako dřív), Moji klienti a Označené PersonPicker');
  over('FP13e', /\n\s+cekani\n/.test(admin) && /\n\s+cekani\n/.test(moji) && /koseClassName="moji-kose"/.test(moji)
    && /kategorie=\{false\}/.test(ozn) && !/\n\s+cekani\n|\scekani=\{/.test(ozn)
    && /stav\.druhy/.test(ozn) && !/const \[druhy, setDruhy\]/.test(ozn),
    'čekání s koši v Kontaktech a Moji klienti, Označené bez Neodpověděl a čekání, pilulky „Co je potřeba“ ve stavu filtrů');
  over('FP13f', /const cekani = filtry\.cekani;/.test(admin) && /const kos = filtry\.kos;/.test(admin)
    && /const cekani = stav\.cekani;/.test(moji) && /const kos = stav\.kos;/.test(moji),
    'Kontakty a Moji klienti berou čekání a koš ze stavu filtrů (Zrušit vše je zruší)');
});

if (chyby === 0) {
  console.log(`ALL OK (${pocet} kontrol)`);
  process.exit(0);
}
console.log(`CHYB: ${chyby} z ${pocet}`);
process.exit(1);
