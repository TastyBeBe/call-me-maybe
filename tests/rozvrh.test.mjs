// Test chování: záložka Rozvrh (migrace 042, Albert 18. 10. 2026).
//
// Měří věty v src/rozvrh.ts (hovoru, hodin, stavHlaska, dnesHlaska, denStav) a pravidla rozvrhu
// v DEMO mocku (src/api/mock.ts), který musí zrcadlit server (db/migration_042_volajici_rozvrh.sql,
// test db/tests/test_042_volajici_rozvrh.sql). Nikdy nesahá na živou DB. Klikání na stránce měří
// tests/demo-e2e.mjs (blok R). Spuštění:
//   node tests/rozvrh.test.mjs            (kořen appky = složka nad tests/)
//   APP_ROOT=/cesta/ke/kopii node tests/rozvrh.test.mjs   (mutace v kopii)
// Výsledek: řádek „ALL OK (N kontrol)", jinak řádky „FAIL <id>: <česky> (…)" a kód 1.

import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
};
// mock čeká 60 až 180 ms na každé volání; test to zkrátí na nulu
const puvodniTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, _ms, ...a) => puvodniTimeout(fn, 0, ...a);

let bundle;
{
  const out = await build({
    stdin: {
      contents: ["export { mockApi } from './src/api/mock.ts';", "export * as rozvrhModul from './src/rozvrh.ts';"].join('\n'),
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
  }).catch((e) => {
    console.log(`FAIL 0: appka nejde sestavit pro test (${String(e.message).split('\n').slice(0, 3).join(' | ')})`);
    process.exit(1);
  });
  const dir = mkdtempSync(join(tmpdir(), 'rozvrh-test-'));
  const f = join(dir, 'b.cjs');
  writeFileSync(f, out.outputFiles[0].text);
  bundle = createRequire(import.meta.url)(f);
  rmSync(dir, { recursive: true, force: true });
}
const { mockApi: api, rozvrhModul: R } = bundle;

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
    over(id, false, 'blok testu spadl na nečekané chybě', String(e && e.message));
  }
}

/** Rozvrh pro věty: jen pole, která src/rozvrh.ts čte. */
function rozvrh(souhrn, extra = {}) {
  return {
    display_name: 'Petra',
    nastaveny: true,
    souhrn: {
      stav: 'v_planu', rozdil: 0, rozdil_hodiny: 0, cil_do_vcera: 0, cil_do_dnes: 0, cil_tyden: 0, hovory_tyden: 0,
      dnes_hodiny: 0, dnes_od: null, dnes_cil: 0, dnes_hovory: 0, dnes_zbyva: 0, dnes_zbyva_hodiny: 0, ...souhrn,
    },
    ...extra,
  };
}
const den = (d) => ({ den: 1, datum: '2026-10-19', hodiny: 3, od: null, cil: 30, hovory: 0, minuly: false, dnes: false,
  pred_rozvrhem: false, poznamka: null, poznamka_at: null, ...d });

/* ---------------- V) věty (src/rozvrh.ts) ---------------- */
await blok('V', async () => {
  const { hovoru, hodin, stavHlaska, dnesHlaska, denStav } = R;
  over('V0', [hovoru, hodin, stavHlaska, dnesHlaska, denStav].every((f) => typeof f === 'function'), 'rozvrh.ts má hovoru, hodin, stavHlaska, dnesHlaska, denStav');
  for (const [n, cil] of [[0, '0 hovorů'], [1, '1 hovor'], [2, '2 hovory'], [4, '4 hovory'], [5, '5 hovorů'], [22, '22 hovorů']]) {
    over('V1', hovoru(n) === cil, `hovoru(${n}) je „${cil}“`, hovoru(n));
  }
  over('V2', hodin(2.5) === '2,5 h' && hodin(4) === '4 h', 'hodin píše desetinnou čárku', `${hodin(2.5)} ${hodin(4)}`);

  let h = stavHlaska(rozvrh({ stav: 'pozadu', rozdil: 25, rozdil_hodiny: 2.5, hovory_tyden: 35, cil_do_vcera: 60 }), true);
  over('V3', h.ton === 'zle' && h.titulek === 'Jsi pozadu o 25 hovorů' && /asi 2,5 h/.test(h.text) && /do včerejška jich mělo být 60/.test(h.text),
    'pozadu: vlastní rozvrh, kolik hovorů a hodin', JSON.stringify(h));
  h = stavHlaska(rozvrh({ stav: 'pozadu', rozdil: 3, rozdil_hodiny: 0.3 }), false);
  over('V3b', h.titulek === 'Petra je pozadu o 3 hovory', 'pozadu: cizí rozvrh ve třetí osobě', h.titulek);
  h = stavHlaska(rozvrh({ stav: 'napred', rozdil: 15, rozdil_hodiny: 1.5, cil_tyden: 105 }), true);
  over('V4', h.ton === 'dobre' && h.titulek === 'Jsi napřed o 15 hovorů', 'napřed', JSON.stringify(h));
  h = stavHlaska(rozvrh({ stav: 'v_planu', dnes_zbyva: 10 }), true);
  over('V5', h.ton === 'dobre' && h.titulek === 'Jsi v plánu' && /zbývá dnešek/.test(h.text), 'v plánu se zbytkem dneška', JSON.stringify(h));
  h = stavHlaska(rozvrh({ stav: 'v_planu', dnes_zbyva: 0 }), true);
  over('V5b', /je hotové/.test(h.text), 'v plánu bez zbytku: hotovo', h.text);
  h = stavHlaska(rozvrh({ stav: 'bez_rozvrhu' }, { nastaveny: false }), true);
  over('V6', h.ton === 'info' && h.titulek === 'Ještě nemáš rozvrh' && /jen jednou/.test(h.text), 'bez rozvrhu: Volající si ho nastaví jednou', h.text);
  h = stavHlaska(rozvrh({ stav: 'bez_rozvrhu' }, { nastaveny: false }), true, true);
  over('V6b', /kdykoli změnit/.test(h.text) && !/jen jednou/.test(h.text), 'bez rozvrhu: super admin svůj mění kdykoli', h.text);
  h = stavHlaska(rozvrh({ stav: 'bez_rozvrhu' }, { nastaveny: false }), false, true);
  over('V6c', h.titulek === 'Petra ještě nemá rozvrh' && /Nastavit ho můžeš ty/.test(h.text), 'bez rozvrhu: super admin u cizího', h.text);

  over('V7', dnesHlaska(rozvrh({}, { nastaveny: false }), true) === null, 'bez rozvrhu žádná připomínka na dnešek');
  let t = dnesHlaska(rozvrh({ dnes_hodiny: 4, dnes_od: '14:00', dnes_cil: 40, dnes_hovory: 12, dnes_zbyva: 28, dnes_zbyva_hodiny: 2.8 }), true);
  over('V8', t === 'Dnes máš volat 4 h od 14:00, to je 40 hovorů. Zatím 12 hovorů. Do splnění plánu chybí ještě 28 hovorů (asi 2,8 h).',
    'dnešek: kdy, jak dlouho a kolik chybí', t);
  t = dnesHlaska(rozvrh({ dnes_hodiny: 2, dnes_cil: 20, dnes_hovory: 21 }), false);
  over('V9', /^Dnes má volat 2 h, to je 20 hovorů\./.test(t) && /Dnešek je splněný\./.test(t), 'dnešek splněný (třetí osoba)', t);
  t = dnesHlaska(rozvrh({ dnes_hodiny: 2, dnes_cil: 20, dnes_hovory: 5, dnes_zbyva: 0 }), true);
  over('V10', /Na dnešek zbývá 15 hovorů, díky náskoku z minulých dnů jsi ale v plánu\./.test(t) && !/splněný/.test(t),
    'napřed z minulých dnů: dnešek neprohlásí za splněný', t);
  t = dnesHlaska(rozvrh({ dnes_cil: 0, dnes_zbyva: 34, dnes_zbyva_hodiny: 3.4 }), true);
  over('V11', t === 'Dnes podle rozvrhu nevoláš. Na dohnání skluzu chybí 34 hovorů (asi 3,4 h).', 'den bez volání se skluzem', t);

  const s = (d) => denStav(den(d));
  over('V12', s({ pred_rozvrhem: true, minuly: true, hovory: 9 }).text === 'před rozvrhem', 'den před nastavením rozvrhu');
  over('V13', s({}).text === 'plán 30 hovorů' && s({ cil: 0 }).text === 'volno', 'budoucí den: plán nebo volno');
  let st = s({ dnes: true, hovory: 10 });
  over('V14', st.ton === 'info' && st.text === 'zatím 10 z 30', 'dnešek rozdělaný', JSON.stringify(st));
  over('V15', s({ minuly: true, hovory: 30 }).text === 'splněno' && s({ minuly: true, hovory: 35 }).text === 'splněno, 5 navíc', 'minulý den splněný');
  st = s({ minuly: true, hovory: 23 });
  over('V16', st.ton === 'zle' && st.text === 'chybí 7 hovorů (23 z 30)', 'minulý den nesplněný', JSON.stringify(st));
  over('V17', s({ minuly: true, cil: 0, hovory: 3 }).text === '3 hovory navíc', 'den bez plánu s hovory');
});

/* ---------------- M) mock = server (db/tests/test_042) ---------------- */
await blok('M', async () => {
  const petra = (await api.login('petra', 'volam')).token;
  const honza = (await api.login('honza', 'volam')).token;
  const eva = (await api.login('eva', 'eva')).token;
  const mikulas = (await api.login('mikulas', 'mikulas')).token;
  const tyden = (h) => h.map((hodiny, i) => ({ den: i + 1, hodiny, od: hodiny > 0 ? '09:00' : null }));

  let r = await api.rozvrh(honza);
  over('M1', r.nastaveny === false && r.smi_upravit === true && r.smi_psat_poznamky === true && r.hovoru_za_hodinu === 10
    && r.dny.length === 7 && r.souhrn.stav === 'bez_rozvrhu', 'Honza bez rozvrhu ho smí nastavit (10 hovorů za hodinu)', JSON.stringify(r.souhrn));
  await chyba('M2', () => api.rozvrh(honza, 2), /vidí jen super admin/, 'Volající cizí rozvrh nevidí');
  await chyba('M3', () => api.ulozitRozvrh(honza, 2, tyden([1, 1, 1, 1, 1, 0, 0])), /nastavuje jen super admin/, 'Volající cizí rozvrh nenastaví');
  await chyba('M3b', () => api.ulozitRozvrh(honza, -42, tyden([1, 1, 1, 1, 1, 0, 0])), /nastavuje jen super admin/,
    'Volající podle hlášky nepozná, jestli id existuje (práva napřed jako server)');
  await chyba('M4', () => api.ulozitRozvrh(honza, 3, tyden([1, 1, 1, 1, 1, 0, 0]).slice(0, 6)), /všech 7 dní/, 'šest dní neprojde');
  await chyba('M5', () => api.ulozitRozvrh(honza, 3, tyden([13, 1, 1, 1, 1, 0, 0])), /0 až 12, po půlhodinách/, '13 hodin neprojde');
  await chyba('M6', () => api.ulozitRozvrh(honza, 3, tyden([2.25, 1, 1, 1, 1, 0, 0])), /po půlhodinách/, '2,25 hodiny neprojde');
  await chyba('M7', () => api.ulozitRozvrh(honza, 3, tyden([1, 1, 1, 1, 1, 0, 0]).map((d) => (d.den === 1 ? { ...d, od: '25:00' } : d))),
    /HH:MM/, 'čas 25:00 neprojde');
  r = await api.ulozitRozvrh(honza, 3, tyden([2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5]));
  const dnes = r.dny.find((d) => d.dnes);
  over('M8', r.nastaveny && r.zamceno && !r.smi_upravit && r.nastavil === 'Honza', 'po uložení je rozvrh zamčený', JSON.stringify({ z: r.zamceno, s: r.smi_upravit }));
  over('M9', dnes && dnes.cil === 25 && r.dny.filter((d) => d.minuly).every((d) => d.pred_rozvrhem && d.cil === 0),
    'cíl dneška 2,5 h × 10 = 25, dny před nastavením bez cíle', JSON.stringify(r.dny.map((d) => [d.den, d.cil, d.pred_rozvrhem])));
  await chyba('M10', () => api.ulozitRozvrh(honza, 3, tyden([1, 1, 1, 1, 1, 0, 0])), /už je nastavený/, 'podruhé Volající rozvrh nezmění');
  await chyba('M11', () => api.odemknoutRozvrh(honza, 3), /jen super admin/, 'Volající si rozvrh neodemkne');

  // poznámky: jen svoje, jen tento týden, prázdná smaže; super admin čte
  r = await api.poznamkaRozvrhu(honza, dnes.datum, '  nemohl jsem volat  ');
  over('M12', r.dny.find((d) => d.dnes).poznamka === 'nemohl jsem volat', 'poznámka se uloží oříznutá');
  await chyba('M13', () => api.poznamkaRozvrhu(honza, '2020-01-06', 'x'), /jen ke dni tohoto týdne/, 'poznámka k jinému týdnu neprojde');
  let m = await api.rozvrh(mikulas, 3);
  over('M14', m.dny.find((d) => d.dnes).poznamka === 'nemohl jsem volat' && m.smi_psat_poznamky === false && m.smi_upravit && m.smi_odemknout,
    'super admin poznámku čte, nepíše, smí upravit a odemknout');
  r = await api.poznamkaRozvrhu(honza, dnes.datum, '   ');
  over('M15', r.dny.find((d) => d.dnes).poznamka === null, 'prázdná poznámka smaže starou');

  // super admin mění a odemyká, volající pak smí jednou
  m = await api.ulozitRozvrh(mikulas, 3, tyden([1, 1, 1, 1, 1, 0, 0]));
  over('M16', m.zmenil === 'Mikuláš' && m.zamceno, 'super admin rozvrh změní, zůstane zamčený');
  m = await api.odemknoutRozvrh(mikulas, 3);
  over('M17', m.zamceno === false && m.smi_odemknout === false, 'super admin rozvrh odemkne');
  r = await api.ulozitRozvrh(honza, 3, tyden([2, 2, 2, 2, 2, 0, 0]));
  over('M18', r.zamceno === true && r.smi_upravit === false, 'po odemčení Volající uloží jednou a je zase zamčeno');
  await chyba('M19', () => api.ulozitRozvrh(honza, 3, tyden([2, 2, 2, 2, 2, 0, 0])), /už je nastavený/, 'odemčení platí jen jednou');

  // hovor zapsaný ve volání se do dneška počítá (server: call_log)
  const pred = (await api.rozvrh(eva)).souhrn.dnes_hovory;
  const k = (await api.nextContact(eva, 'chata')) ?? (await api.nextContact(eva, 'architekt'));
  if (!k) over('M20', false, 'fronta je prázdná, nejde změřit');
  else {
    await api.resolveCall(eva, { kontakt_id: k.id, outcome: 'nedovolano' });
    over('M20', (await api.rozvrh(eva)).souhrn.dnes_hovory === pred + 1, 'zapsaný hovor přibude v dnešku', `${pred} → ?`);
  }

  // přehled: jen super admin, kdo je pozadu, je první, bez dnů
  await chyba('M21', () => api.prehledRozvrhu(petra), /jen super admin/, 'Volající přehled nevidí');
  const p = await api.prehledRozvrhu(mikulas);
  const poradi = { pozadu: 0, bez_rozvrhu: 1, v_planu: 2, napred: 3 };
  over('M22', p.length >= 3 && p.every((x, i) => i === 0 || poradi[p[i - 1].souhrn.stav] <= poradi[x.souhrn.stav]) && p.every((x) => !('dny' in x)),
    'přehled seřazený (pozadu nahoře) a bez dnů', p.map((x) => `${x.display_name}:${x.souhrn.stav}`).join(' '));
  over('M23', p.some((x) => x.display_name === 'Petra' && x.poznamek >= 0 && x.manager_name === 'Albert'), 'přehled nese nadřízeného a počet poznámek');
});

if (chyby === 0) {
  console.log(`ALL OK (${pocet} kontrol)`);
  process.exit(0);
}
console.log(`CHYB: ${chyby} z ${pocet}`);
process.exit(1);
