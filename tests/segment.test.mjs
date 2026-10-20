// Test chování: segment chaty / architekti v appce (docs/ARCHITEKTI.md, oddíl 9, migrace 028).
//
// Měří DEMO mock (src/api/mock.ts), který musí zrcadlit server, src/segment.ts, záložní cestu
// next_contact v src/api/supabase.ts (fetch je podstrčený, nic nejde po síti) a závislosti
// loadNext v CallPage.tsx. Nikdy nesahá na živou DB. Chování stránek (přepínač ve volání,
// filtry seznamů, detail) měří tests/demo-e2e.mjs v prohlížeči. Spuštění:
//   node tests/segment.test.mjs            (kořen appky = složka nad tests/)
//   APP_ROOT=/cesta/ke/kopii node tests/segment.test.mjs   (mutace v kopii)
// Výsledek: řádek „ALL OK (N kontrol)", jinak řádky „FAIL <id>: <česky> (…)" a kód 1.

import { build } from 'esbuild';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(process.env.APP_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..'));

// localStorage pro segment.ts (v Node neexistuje); `hodit` simuluje prohlížeč, který ho zakazuje
const uloziste = new Map();
let hodit = false;
globalThis.localStorage = {
  getItem: (k) => { if (hodit) throw new Error('zakázáno'); return uloziste.has(k) ? uloziste.get(k) : null; },
  setItem: (k, v) => { if (hodit) throw new Error('zakázáno'); uloziste.set(k, String(v)); },
  removeItem: (k) => { uloziste.delete(k); },
};
// mock čeká 60 až 180 ms na každé volání; test to zkrátí na nulu
const puvodniTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, _ms, ...a) => puvodniTimeout(fn, 0, ...a);

let bundle;
{
  const out = await build({
    stdin: {
      contents: [
        "export { mockApi, poznamkaBezCizich, poznamkaZpet, jmenoKlic, hlavickaCizi, KLIC_Z, KLIC_NA } from './src/api/mock.ts';",
        "export { supabaseApi } from './src/api/supabase.ts';",
        "export { loadCallSegment, saveCallSegment, segmentOf } from './src/segment.ts';",
        "export * as segmentModul from './src/segment.ts';",
        "export { PhoneLinks } from './src/ui.tsx';",
        "export * as uiModul from './src/ui.tsx';",
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
  }).catch((e) => {
    console.log(`FAIL 0: appka nejde sestavit pro test (${String(e.message).split('\n').slice(0, 3).join(' | ')})`);
    process.exit(1);
  });
  const dir = mkdtempSync(join(tmpdir(), 'segment-test-'));
  const f = join(dir, 'b.cjs');
  writeFileSync(f, out.outputFiles[0].text);
  bundle = createRequire(import.meta.url)(f);
  rmSync(dir, { recursive: true, force: true });
}
const { mockApi: api, poznamkaBezCizich, poznamkaZpet, jmenoKlic, hlavickaCizi, KLIC_Z, KLIC_NA, supabaseApi, loadCallSegment, saveCallSegment, segmentOf, segmentModul, PhoneLinks, uiModul } = bundle;

let pocet = 0;
let chyby = 0;
function over(id, podminka, text, detail = '') {
  pocet += 1;
  if (!podminka) {
    chyby += 1;
    console.log(`FAIL ${id}: ${text}${detail ? ` (${detail})` : ''}`);
  }
}
/** Čeká chybu s DŮVODEM (vzor), ne jen jakoukoli chybu (ZMENA-AUTOMATIZACE, 25. 9.). */
async function chyba(id, fn, vzor, text) {
  try {
    await fn();
    over(id, false, text, 'prošlo, mělo selhat');
  } catch (e) {
    over(id, vzor.test(e.message), text, `hláška: ${e.message}`);
  }
}
const seg = (k) => (k && k.segment === 'architekt' ? 'architekt' : 'chata');
const ARCH = [300, 301, 302, 303];

/* ---------------- A) segment.ts ---------------- */
over('A1', loadCallSegment() === 'chata', 'bez uložené volby se volají chaty');
uloziste.set('volacka_segment', 'architekt');
over('A2', loadCallSegment() === 'architekt', 'uložené „architekt" se načte');
uloziste.set('volacka_segment', 'chata');
over('A3', loadCallSegment() === 'chata', 'uložené „chata" se načte');
for (const smeti of ['xyz', ' architekt', 'Architekt', '', 'null', 'architekti']) {
  uloziste.set('volacka_segment', smeti);
  over('A4', loadCallSegment() === 'chata', 'smetí v localStorage = chaty (RC-14)', JSON.stringify(smeti));
}
hodit = true;
over('A5', loadCallSegment() === 'chata', 'nedostupný localStorage = chaty');
let vyhodilo = false;
try { saveCallSegment('architekt'); } catch { vyhodilo = true; }
over('A6', !vyhodilo, 'uložení volby při nedostupném localStorage nesmí shodit stránku');
hodit = false;
saveCallSegment('architekt');
over('A6b', uloziste.get('volacka_segment') === 'architekt' && loadCallSegment() === 'architekt', 'uložená volba přežije načtení');
uloziste.delete('volacka_segment');
over('A7', segmentOf({ segment: 'architekt' }) === 'architekt', 'segmentOf pozná architekta');
over('A7b', segmentOf({}) === 'chata' && segmentOf(null) === 'chata', 'segmentOf bez segmentu = chata');
over('A7c', segmentOf({ segment: 'x' }) === 'chata', 'segmentOf s neznámou hodnotou = chata');
over('A7d', segmentOf({ obor: 'architekt' }) === 'chata', 'segmentOf se řídí sloupcem segment, ne popiskem obor (1.1)');

/* ---------------- přihlášení ---------------- */
// ⚠ Od migrace 042 jsou Petra a Honza Volající (role admin) se stejnými právy jako Eva.
const petra = (await api.login('petra', 'volam')).token;   // Volající pod Albertem
const honza = (await api.login('honza', 'volam')).token;   // Volající pod Mikulášem
const albert = (await api.login('admin', 'admin')).token;  // majitel, smí upravit vše
const mikulas = (await api.login('mikulas', 'mikulas')).token; // super admin
const eva = (await api.login('eva', 'eva')).token;          // admin pod Albertem

/** Blok testu: nečekaná výjimka se zapíše jako FAIL a pokračuje se dalším blokem. */
async function blok(id, fn) {
  try {
    await fn();
  } catch (e) {
    over(id, false, 'blok testu spadl na nečekané chybě', String(e && e.message));
  }
}

/* ---------------- S) čísla jiných lidí vidí jen super admin (Albert 19. a 20. 10. 2026, migrace 045) ---------------- */
// Albert: Volající (role admin) nesmí NIJAK vidět čísla jiných lidí (prodeje, počty hovorů, žebříček, statistiky
// kolegů), jen super admini; 20. 10. 2026 „Hide all of it“. Mock = server (db/tests/test_045): all_stats, my_stats,
// top_prodejce jen super admin, rozvrh, výběr člověka, hledání i řádky s maskou jmen kolegů v poznámce a poznámce
// příznaku, kdo dal příznak, cizí zámek bez id, total null a dalsi, uložení maskované poznámky bez ztráty jmen.
// Stránky: Kontakty bez počtů, Statistiky bez trychtýře a „#1 prodejce“, Prokchop bez top_prodejce. ⚠ NAHRAZUJE S3
// („top_prodejce vrátí {je_prvni} každému“) a S5e („poznámka v řádku beze změny, Albert 25. 9. 2026“).
// Běží před bloky, které mění data (hovory, poznámky); co tu změní (příznak, zámek, poznámka), vrátí.
await blok('S', async () => {
  await chyba('S1', () => api.allStats(petra), /^Statistiky ostatních vidí jen super admin/, 'all_stats Volajícímu odmítnut');
  const vsichni = await api.allStats(mikulas);
  const petraVsech = vsichni.find((u) => u.user_id === 2);
  const mojeP = await api.myStats(petra);
  over('S2', !!petraVsech && Object.keys(mojeP).sort().join() === 'calls,conversion,nedovolano,odmitnuto,reached,sold,zajem'
    && ['calls', 'reached', 'zajem', 'sold'].every((k) => mojeP[k] === petraVsech[k]),
    'my_stats Volajícímu vrátí jen jeho vlastní čísla (stejná, jaká o něm vidí super admin)', JSON.stringify(mojeP));
  over('S2b', vsichni.some((u) => u.user_id !== 2 && u.calls > 0), 'super admin vidí čísla kolegů (jinak by S nic neměřil)');
  await chyba('S3', () => api.topSeller(petra), /^Žebříček prodejců vidí jen super admin/, 'top_prodejce („jsi #1?“, žebříček kolegů) Volajícímu odmítnut');
  const top = await api.topSeller(mikulas);
  over('S3b', Object.keys(top).join() === 'je_prvni' && typeof top.je_prvni === 'boolean', 'top_prodejce super adminovi vrátí jen {je_prvni}', JSON.stringify(top));
  await chyba('S4', () => api.prehledRozvrhu(petra), /^Přehled rozvrhů vidí jen super admin/, 'přehled rozvrhů (plnění všech) Volajícímu odmítnut');
  await chyba('S4b', () => api.rozvrh(petra, 3), /^Rozvrh jiného člověka vidí jen super admin/, 'rozvrh kolegy Volajícímu odmítnut');
  await chyba('S4c', () => api.myKontakty(petra, 200, 0, 3), /jiného člověka vidí jen super admin/, 'Moji klienti kolegy Volajícímu odmítnuti');
  await chyba('S4d', () => api.listKontakty(petra, { caller: 'Honza', limit: 5 }), /^Podle volajícího můžete filtrovat jen sebe/, 'filtr Kontaktů podle kolegy Volajícímu odmítnut');
  // hledání v poznámkách: Honza je v mocku jen v hlavičkách „[2026-08-.. Honza]“
  const honzaV = await api.listKontakty(petra, { search: 'Honza', limit: 200 });
  const honzaS = await api.listKontakty(mikulas, { search: 'Honza', limit: 200 });
  const honzaA = await api.listKontakty(albert, { search: 'Honza', limit: 200 });
  over('S5', honzaV.rows.length === 0 && honzaV.total === null && honzaV.dalsi === false, 'Volající hledáním jména kolegy v poznámkách nic nenajde (a součet nedostane)', `řádků ${honzaV.rows.length}, total ${honzaV.total}`);
  over('S5b', honzaS.total >= 3 && honzaA.total === honzaS.total && honzaS.rows.length === honzaS.total, 'super admin a Albert hledáním jména najdou kolegovy kontakty i se součtem', `${honzaS.total} / ${honzaA.total}`);
  for (const q of ['onza', 'Honza]', 'nza]', 'honza']) {
    const r = await api.listKontakty(petra, { search: q, limit: 200 });
    over(`S5c ${q}`, r.rows.length === 0, `ani kousek jména kolegy („${q}“) Volajícímu nic nenajde`, `řádků ${r.rows.length}`);
  }
  const mojeHlav = await api.listKontakty(petra, { search: 'Petra', limit: 200 });
  over('S5d', mojeHlav.rows.length >= 1, 'svou hlavičku v poznámce Volající najde dál', `řádků ${mojeHlav.rows.length}`);
  // S5e: text poznámky Volající najde, ale jméno kolegy v ní dostane jako „jiný volající“ (hlavička i text)
  const text = await api.listKontakty(petra, { search: 'Zase nebrali', limit: 200 });
  over('S5e', text.rows.length === 1 && text.rows[0].note === '[2026-08-20 Petra] Nebrali telefon, zkusit odpoledne.\n[2026-08-29 jiný volající] Zase nebrali.',
    'text poznámky Volající najde a jméno kolegy v ní má jako „jiný volající“, své jméno ne', text.rows[0]?.note ?? '');
  const textS = await api.listKontakty(mikulas, { search: 'Zase nebrali', limit: 200 });
  over('S5f', /\[2026-08-29 Honza\]/.test(textS.rows[0]?.note ?? ''), 'super admin vidí v poznámce jméno beze změny', textS.rows[0]?.note ?? '');
  // maska stejná jako app_poznamka_bez_cizich (db/tests/test_045 45a8 až 45a9c)
  over('S6', poznamkaBezCizich('[2026-01-02 Eda] text Eda]\n[2026-01-03 Edan] x\n[2026-01-04 Eda, chat 2] y, eda volal', ['Eda'], ['Kuba'])
    === '[2026-01-02 jiný volající] text jiný volající]\n[2026-01-03 Edan] x\n[2026-01-04 jiný volající, chat 2] y, jiný volající volal',
    'maska bere jméno kolegy v hlavičce i v textu, jen celé slovo, bez ohledu na velikost písmen');
  over('S6b', poznamkaBezCizich('[2026-01-02 A.*] x [2026-01-02 AB] y', ['A.*']) === '[2026-01-02 jiný volající] x [2026-01-02 AB] y',
    'maska bere jméno doslova (metaznaky regulárního výrazu)');
  over('S6c', poznamkaBezCizich('Ateliér: MgA. Mikuláš Medlík. Mikuláš chtěl kopii; Albert Pražák; (Albert 2026-09-28); L. Kuba. Ing. arch. Kryštof Peřestý; [2026-10-01 Albert] Novák',
    ['Mikuláš', 'Albert', 'Kuba', 'Kryštof'], ['Eda'])
    === 'Ateliér: MgA. Mikuláš Medlík. jiný volající chtěl kopii; Albert Pražák; (jiný volající 2026-09-28); L. Kuba. Ing. arch. Kryštof Peřestý; [2026-10-01 jiný volající] Novák',
    'maska nesáhne na jméno klienta (titul, iniciála, příjmení za jménem), jinde jméno kolegy maskuje');
  over('S6d', poznamkaBezCizich('[2026-10-01 Adam] já, [2026-10-02 Adam T] kolega', ['Adam T'], ['Adam']) === '[2026-10-01 Adam] já, [2026-10-02 jiný volající] kolega',
    'vlastní jméno zůstane, delší jméno kolegy se maskuje celé');
  over('S6i', poznamkaBezCizich('[2026-10-01 Eda Novák] volal; Eda Novák je klient', ['Eda']) === '[2026-10-01 jiný volající Novák] volal; Eda Novák je klient',
    'v hlavičce „[datum Jméno …]“ maska jméno bere vždy, mimo ni je „Eda Novák“ jméno klienta (jako 45a9d)');
  // ⚠ NAHRAZUJE „po smazání řádku nepřiřadí jméno jinému řádku“ (recenze 045, 20. 10. 2026): smazat řádek kolegy nejde
  await chyba('S6e', async () => poznamkaZpet('[2026-10-01 Eda] a\n[2026-10-02 Mikuláš] b', '[2026-10-02 jiný volající] b', ['Eda', 'Mikuláš'], ['Kuba']),
    /^Řádek kolegy upravit ani smazat nejde/, 'poznamkaZpet nedovolí smazat řádek kolegy (jako app_poznamka_zpet)');
  await chyba('S6f', async () => poznamkaZpet('[2026-10-04 Eda] nedovoláno\n[2026-10-04 Mikuláš] nedovoláno', '[2026-10-04 jiný volající] nedovoláno', ['Eda', 'Mikuláš'], []),
    /^Řádek kolegy upravit ani smazat nejde/, 'dva stejně maskované řádky dvou kolegů: smazat jeden nejde (nespletou se)');
  over('S6g', poznamkaZpet('[2026-10-04 Eda] nedovoláno\n[2026-10-04 Mikuláš] nedovoláno', '[2026-10-04 jiný volající] nedovoláno\n[2026-10-04 jiný volající] nedovoláno\n[2026-10-05 Kuba] já', ['Eda', 'Mikuláš'], ['Kuba'])
    === '[2026-10-04 Eda] nedovoláno\n[2026-10-04 Mikuláš] nedovoláno\n[2026-10-05 Kuba] já', 'řádky kolegů se uloží doslova podle pořadí, nový řádek přesně');
  // jména bez diakritiky (recenze 045): „Mikulas“ je Mikuláš, „Matěj“ je Matej; celé slovo a jméno klienta platí dál
  over('S6h', poznamkaBezCizich('[2026-10-01 Mikulas] x, mikulas volal, MIKULÁŠ taky; Matěj ok; Mikulasek; Mikulas Medlík', ['Mikuláš', 'Matej'])
    === '[2026-10-01 jiný volající] x, jiný volající volal, jiný volající taky; jiný volající ok; Mikulasek; Mikulas Medlík',
    'maska pozná jméno kolegy bez diakritiky i s jinou diakritikou (jako app_poznamka_bez_cizich)');
  // součty celé databáze: Volající total null při každém filtru, dalsi sedí; super admin a Albert total mají
  for (const f of [{ status: 'zaplaceno', limit: 1 }, { limit: 1 }, { segment: 'architekt', limit: 1 }, { caller: 'Petra', limit: 1 }, { cekani: 'ceka_prvni', limit: 1 }]) {
    const r = await api.listKontakty(petra, f);
    over('S8', r.total === null, `Volající nedostane součet celé databáze (${JSON.stringify(f)})`, `total ${r.total}`);
  }
  const strana = await api.listKontakty(petra, { limit: 2 });
  const konec = await api.listKontakty(petra, { limit: 2, offset: 100000 });
  over('S8b', strana.rows.length === 2 && strana.dalsi === true && konec.dalsi === false, 'Volající stránkuje podle dalsi (je ještě další stránka?)', `${strana.dalsi} / ${konec.dalsi}`);
  for (const [kdo, tok] of [['super admin', mikulas], ['Albert', albert]]) {
    const r = await api.listKontakty(tok, { status: 'zaplaceno', limit: 1 });
    over('S8c', typeof r.total === 'number' && r.total >= 1 && r.dalsi === r.total > 1, `${kdo} dostane součet stavu i dalsi`, `total ${r.total}, dalsi ${r.dalsi}`);
  }
  const moji = await api.myKontakty(petra, 200, 0);
  over('S8d', moji.total === moji.rows.length && moji.total > 0, 'Moji klienti (vlastní čísla) Volající počet dál má', `total ${moji.total}`);
  // kdo dal příznak a co v poznámce příznaku stojí: kolega Honza označí klienta 2 (volali mu oba, je Petřin i jeho).
  // ⚠ NAHRAZUJE měření na klientovi 3 (jen Honzův): cizí kontakt Volající od 20. 10. 2026 dostane bez příznaku (blok U)
  await api.setFlag(honza, 2, 'jine', 'Honza slíbil zjistit e-mail');
  const k3 = (await api.listKontakty(petra, { search: 'Roubenka U Lesa', limit: 5 })).rows.find((r) => r.id === 2);
  over('S9', k3?.flagged_by === 'jiný volající' && k3?.flag_note === 'jiný volající slíbil zjistit e-mail',
    'Volající nevidí, kdo z kolegů dal příznak, ani jméno v poznámce příznaku', `${k3?.flagged_by} / ${k3?.flag_note}`);
  const k3s = (await api.listKontakty(mikulas, { search: 'Roubenka U Lesa', limit: 5 })).rows.find((r) => r.id === 2);
  over('S9b', k3s?.flagged_by === 'Honza' && k3s?.flag_note === 'Honza slíbil zjistit e-mail', 'super admin vidí, kdo dal příznak, i poznámku beze změny', `${k3s?.flagged_by}`);
  const auto = (await api.listFlagged(albert)).find((r) => r.id === 92);
  const p302 = (await api.listKontakty(petra, { search: 'Nebrala, zkusit v úterý', limit: 5 })).rows.find((r) => r.id === 302);
  over('S9c', auto?.flagged_by === 'automatizace' && p302?.flagged_by === 'Petra', 'štítek agenta a vlastní jméno u příznaku zůstávají', `${auto?.flagged_by} / ${p302?.flagged_by}`);
  // Volající přepíše příznak se stejnou (maskovanou) poznámkou: jméno kolegy v datech zůstane, a protože druh je stejný,
  // zůstane i to, kdo příznak dal. ⚠ NAHRAZUJE „flagged_by === 'Petra'“ (každé set_flag přepsalo autora; migrace 045,
  // dvě recenze 20. 10. 2026: flagged_by a flagged_at jen se změnou druhu)
  await api.setFlag(petra, 2, 'jine', 'jiný volající slíbil zjistit e-mail');
  const k3po = (await api.listKontakty(albert, { search: 'Roubenka U Lesa', limit: 5 })).rows.find((r) => r.id === 2);
  over('S9d', k3po?.flag_note === 'Honza slíbil zjistit e-mail' && k3po?.flagged_by === 'Honza', 'uložení maskované poznámky příznaku jméno kolegy nesmaže ani nepřepíše, kdo příznak dal', `${k3po?.flag_note} / ${k3po?.flagged_by}`);
  await api.clearFlag(albert, 2);
  // zámek kolegy: Volající ví jen, že je karta zamčená
  const karta = await api.nextContact(honza, 'chata');
  if (!karta) over('S10', false, 'fronta chat je prázdná, zámek nejde změřit');
  else {
    const vsechnyP = await api.listKontakty(petra, { search: karta.name, limit: 50 });
    const vsechnyS = await api.listKontakty(mikulas, { limit: 500 });
    const kp = vsechnyP.rows.find((r) => r.id === karta.id);
    const ks = vsechnyS.rows.find((r) => r.id === karta.id);
    // ⚠ Od 20. 10. 2026 (Volající vidí stav jen u svých): u svého klienta jen zamceno, u cizího ani to (skryto)
    over('S10', kp?.je_muj
      ? kp?.lock_by === null && kp?.lock_at === null && kp?.zamceno === true
      : kp?.skryto === true && !('lock_by' in (kp ?? {})) && !('zamceno' in (kp ?? {})),
      'Volající u karty, kterou volá kolega, vidí jen zamceno (ne kdo), u cizího kontaktu nic', `je_muj ${kp?.je_muj}, lock_by ${kp?.lock_by}, zamceno ${kp?.zamceno}`);
    over('S10b', ks?.lock_by === 3 && ks?.zamceno === true && karta.lock_by === 3, 'super admin a volající sám vidí id u zámku', `${ks?.lock_by} / ${karta.lock_by}`);
    await api.updateKontakt(albert, karta.id, { clear_lock: true });
  }
  // uložení maskované poznámky svého klienta (7 má hlavičku Alberta): jména v datech zůstanou
  const k7 = (await api.myKontakty(petra, 200, 0)).rows.find((r) => r.id === 7);
  const puvodni7 = (await api.listKontakty(albert, { search: 'faktura zaplacena', limit: 5 })).rows.find((r) => r.id === 7)?.note ?? null;
  over('S11', k7?.note === '[2026-07-30 Petra] Zájem, rating A, domluvená cena.\n[2026-08-15 jiný volající] Web hotový, faktura zaplacena.', 'Moji klienti: jméno kolegy (Albert) v poznámce maskované', k7?.note ?? '');
  const vraceno = await api.updateKontakt(petra, 7, { note: `${k7?.note}\n[2026-10-20 Petra] doplněno` });
  const ulozeno = (await api.listKontakty(albert, { search: 'faktura zaplacena', limit: 5 })).rows.find((r) => r.id === 7)?.note;
  over('S11b', ulozeno === `${puvodni7}\n[2026-10-20 Petra] doplněno` && !/Albert/.test(vraceno.note ?? ''),
    'uložení maskované poznámky Volajícím jména kolegů v datech nesmaže a vrácený řádek je dál maskovaný', ulozeno ?? '');
  await api.updateKontakt(albert, 7, { note: puvodni7 });
  // řádky kolegů jsou Volajícímu jen ke čtení (recenze 045, 20. 10. 2026): klient 2 je Petřin i Honzův (oba volali)
  const puvodni2 = (await api.listKontakty(albert, { search: 'Roubenka U Lesa', limit: 5 })).rows.find((r) => r.id === 2)?.note ?? null;
  const maska2 = (await api.myKontakty(petra, 200, 0)).rows.find((r) => r.id === 2)?.note ?? '';
  over('S12', maska2 === '[2026-08-20 Petra] Nebrali telefon, zkusit odpoledne.\n[2026-08-29 jiný volající] Zase nebrali.', 'Volající má u klienta 2 řádek kolegy maskovaný (jinak by S12 nic neměřil)', maska2);
  const [vlastni2, kolegy2] = maska2.split('\n');
  for (const [id, nova, vzor, co] of [
    ['S12b', `${vlastni2}\n${kolegy2} Prý v pátek.`, /^Řádek kolegy upravit ani smazat nejde/, 'upravený text v řádku kolegy'],
    ['S12c', vlastni2, /^Řádek kolegy upravit ani smazat nejde/, 'smazaný řádek kolegy'],
    ['S12d', `${vlastni2}\n${kolegy2.replace('2026-08-29', '2026-08-30')}`, /^Řádek kolegy upravit ani smazat nejde/, 'změněné datum v hlavičce řádku kolegy'],
    ['S12e', null, /^Řádek kolegy upravit ani smazat nejde/, 'smazaná celá poznámka'],
    ['S12f', `${vlastni2}\n[2026-08-29 jiný volající] podvrh\n${kolegy2}`, /^Nový řádek nesmí mít v hlavičce/, 'podvržený řádek „[datum jiný volající]“ před řádkem kolegy'],
    ['S12g', `${maska2}\n[2026-10-20 honza] podvrh`, /^Nový řádek nesmí mít v hlavičce/, 'nový řádek se jménem kolegy v hlavičce'],
    ['S12h', `${maska2}\n[2026-10-20 Mikulas] podvrh`, /^Nový řádek nesmí mít v hlavičce/, 'nový řádek se jménem kolegy bez diakritiky v hlavičce'],
  ]) {
    await chyba(id, () => api.updateKontakt(petra, 2, { note: nova }), vzor, `Volající neuloží: ${co}`);
    const po2 = (await api.listKontakty(albert, { search: 'Roubenka U Lesa', limit: 5 })).rows.find((r) => r.id === 2)?.note ?? null;
    over(`${id}x`, po2 === puvodni2, `odmítnuté uložení (${co}) nechá data beze změny`, po2 ?? '');
  }
  // co smí: vlastní řádek přesunout pod řádek kolegy a připsat nový; řádek kolegy se uloží doslova
  await api.updateKontakt(petra, 2, { note: `${kolegy2}\n${vlastni2}\n[2026-10-20 Petra] nová` });
  const presunuto2 = (await api.listKontakty(albert, { search: 'Roubenka U Lesa', limit: 5 })).rows.find((r) => r.id === 2)?.note ?? null;
  over('S12i', presunuto2 === '[2026-08-29 Honza] Zase nebrali.\n[2026-08-20 Petra] Nebrali telefon, zkusit odpoledne.\n[2026-10-20 Petra] nová',
    'Volající smí přesunout a připsat vlastní řádky, řádek kolegy zůstane doslova se jménem', presunuto2 ?? '');
  await api.updateKontakt(albert, 2, { note: puvodni2 });
  // poznámka příznaku stejně: Honza označí svého klienta 2, Petra jeho řádek upravit nesmí
  await api.setFlag(honza, 2, 'jine', 'Honza ověří e-mail');
  await chyba('S12j', () => api.setFlag(petra, 2, 'jine', 'jiný volající ověří e-mail zítra'), /^Řádek kolegy upravit ani smazat nejde/, 'Volající neupraví řádek kolegy v poznámce příznaku');
  const priz2 = (await api.listKontakty(albert, { search: 'Roubenka U Lesa', limit: 5 })).rows.find((r) => r.id === 2);
  over('S12k', priz2?.flag_note === 'Honza ověří e-mail' && priz2?.flagged_by === 'Honza', 'odmítnutý příznak nechá poznámku i to, kdo ho dal', `${priz2?.flag_note} / ${priz2?.flagged_by}`);
  await api.clearFlag(albert, 2);
  // strop stránky (recenze 045): Volající nejvýš 200 řádků, super admin bez stropu (mock má méně řádků, měří se i kód)
  const velkaP = await api.listKontakty(petra, { limit: 100000 });
  const velkaS = await api.listKontakty(mikulas, { limit: 100000 });
  over('S13', velkaP.rows.length <= 200 && velkaS.rows.length === velkaS.total
    && /const limit = vidiCisla \? Math\.max\(f\.limit \?\? 200, 1\) : Math\.min\(Math\.max\(f\.limit \?\? 200, 1\), 200\);/.test(readFileSync(join(ROOT, 'src/api/mock.ts'), 'utf8')),
    'Volající dostane nejvýš 200 řádků na stránku (jako list_kontakty), super admin všechny', `${velkaP.rows.length} / ${velkaS.rows.length}`);
  // vlákna (recenze 045): jméno jiného Volajícího „jiný volající“, super admin a agent beze změny
  const novy = await api.createThread(honza, 'Sleva, píše Honza', 'Honza: klient chce slevu, honza to ví', 2);
  await api.postThreadMessage(mikulas, novy.thread_id, 'Mikuláš: sleva ne', false);
  const tp = (await api.listThreads(petra)).find((x) => x.id === novy.thread_id);
  over('S14', tp?.created_by === 'jiný volající' && tp?.subject === 'Sleva, píše jiný volající' && !/honza/i.test(JSON.stringify(tp ?? {})),
    'Zprávy: Volající nevidí jméno kolegy u vlákna (kdo založil, předmět, náhled)', JSON.stringify(tp ?? {}).slice(0, 200));
  const dp = await api.getThread(petra, novy.thread_id);
  over('S14b', dp.thread.created_by === 'jiný volající' && dp.messages[0]?.sender_name === 'jiný volající'
    && dp.messages[0]?.body === 'jiný volající: klient chce slevu, jiný volající to ví' && dp.messages[1]?.sender_name === 'Mikuláš'
    && dp.messages[1]?.body === 'Mikuláš: sleva ne' && !/honza/i.test(JSON.stringify(dp)),
    'vlákno: kolega Volající „jiný volající“ (odesílatel i text), super admin beze změny', JSON.stringify(dp.messages).slice(0, 200));
  const ds = await api.getThread(mikulas, novy.thread_id);
  over('S14c', ds.thread.created_by === 'Honza' && ds.messages[0]?.sender_name === 'Honza', 'super admin vidí ve vlákně jména beze změny', ds.thread.created_by);
  // stránky: kdo volá allStats a topSeller, kdo vidí trychtýř, počty Kontaktů a dlaždici #1
  const stats = readFileSync(join(ROOT, 'src/pages/StatsPage.tsx'), 'utf8');
  over('S7', /\{isSuper && <KlientiFunnel/.test(stats) && !/isAdmin(Role)?\b[^\n]*<KlientiFunnel/.test(stats),
    'Statistiky: trychtýř „Klienti podle stavu“ (součty celé databáze) jen pro super admina');
  over('S7b', /if \(isSuper\) \{\s*const all = await api\.allStats/.test(stats), 'Statistiky volají allStats jen pro super admina');
  over('S7f', /\{isSuper && \(\s*<div className="card stat-card">\s*<div className="stat-value">\{topDays\}/.test(stats), 'Statistiky: dlaždice „jako #1 prodejce“ jen pro super admina');
  const picker = readFileSync(join(ROOT, 'src/components/PersonPicker.tsx'), 'utf8');
  over('S7c', /if \(!superAdmin\) \{\s*setPeople\(\[\]\);\s*return;/.test(picker), 'výběr člověka (PersonPicker) volá allStats jen pro super admina');
  const uziv = readFileSync(join(ROOT, 'src/pages/UzivatelePage.tsx'), 'utf8');
  over('S7d', /if \(!isSuper\) return;[^\n]*\n[\s\S]{0,200}allStats/.test(uziv), 'stránka Uživatelé volá allStats jen pro super admina');
  const pig = readFileSync(join(ROOT, 'src/pig/PigLayer.tsx'), 'utf8');
  over('S7e', !/allStats/.test(pig) && /if \(!zebricek\) \{ awardTop\(false\); return; \}[\s\S]{0,700}\.topSeller\(/.test(pig)
    && /COSMETICS\.filter\(\(c\) => zebricek \|\| c\.price !== null\)/.test(pig),
    'Prokchop: allStats nikdy, topSeller jen za super admina, odměnu za #1 Volajícímu nenabízí');
  const admin = readFileSync(join(ROOT, 'src/pages/AdminPage.tsx'), 'utf8');
  over('S7g', (admin.match(/if \(!isSuper\) \{\s*setStatusCounts\(\{\}\);\s*return;/g) ?? []).length === 1 && /if \(!cekani \|\| !isSuper\) \{/.test(admin)
    && /total !== null && total > 0 && <span className="count-pill">/.test(admin),
    'Kontakty: počty u stavů a košů a celkový počet jen pro super admina');
});

/* ---------------- U) Volající vidí stav jen u svých klientů (Albert 20. 10. 2026, migrace 045) ---------------- */
// Albert: „they should only be able to see the status or how the website is going for the people they actually called,
// but not for other people … They should still be able to see all the contacts“. Mock = server (db/tests/test_045, 45s):
// cizí kontakt Volajícího jen s klíči z allowlistu (KLICE_CIZI = app_kontakt_klice_cizi), skryto true; filtr stavu,
// známky a čekání a hledání v poznámce jen nad svými; svoji napřed, cizí podle id; příznak a zámek cizího odmítnuty;
// vlákna o cizím klientovi skrytá. Super admin a Albert beze změny. ⚠ NAHRAZUJE „Kontakty vidí všichni se stavy“ (023).
await blok('U', async () => {
  const POVOLENE = ['id', 'segment', 'name', 'firma', 'phone', 'email', 'web', 'ma_web', 'obor', 'mesto',
    'ico_osobni', 'ico_firma', 'dph_osobni', 'dph_firma'];
  const navic = (r, dalsi = []) => Object.keys(r).filter((k) => !POVOLENE.includes(k) && !['je_muj', 'skryto', 'smi_upravit', ...dalsi].includes(k));
  const vse = await api.listKontakty(petra, { limit: 200 });
  const cizi = vse.rows.filter((r) => !r.je_muj);
  const moje = vse.rows.filter((r) => r.je_muj);
  over('U1', cizi.length >= 5 && cizi.every((r) => r.skryto === true && navic(r).length === 0 && !('status' in r) && 'name' in r && 'phone' in r),
    'Volající dostane u cizího kontaktu jen jméno a kontakt (allowlist), žádný stav, poznámku, příznak ani průběh webu',
    cizi.filter((r) => navic(r).length > 0).map((r) => `${r.id}: ${navic(r).join(',')}`).slice(0, 3).join(' | '));
  over('U1b', moje.length >= 2 && moje.every((r) => r.skryto === false && typeof r.status === 'string' && 'note' in r && 'updated_at' in r),
    'svoje klienty Volající vidí celé (stav, poznámka, datum změny)', `${moje.length} svých`);
  for (const [kdo, tok] of [['super admin', mikulas], ['Albert', albert]]) {
    const r = await api.listKontakty(tok, { limit: 500 });
    over('U2', r.rows.every((x) => x.skryto === false && typeof x.status === 'string'), `${kdo} vidí všechny kontakty celé`);
  }
  // filtr stavu, známky a čekání jen nad svými
  for (const fl of [{ status: 'navrh_odeslan' }, { status: 'zajem' }, { rating: 'A' }, { cekani: 'ceka_prvni' }, { cekani: 'ceka_po_odpovedi', kos: 'k_zavolani' }]) {
    const p = await api.listKontakty(petra, { ...fl, limit: 200 });
    const s = await api.listKontakty(mikulas, { ...fl, limit: 200 });
    const mojeId = new Set(moje.map((r) => r.id));
    over('U3', p.rows.every((r) => r.je_muj === true && mojeId.has(r.id)) && s.rows.some((r) => !mojeId.has(r.id)),
      `filtr ${JSON.stringify(fl)} vrátí Volajícímu jen jeho klienty (super admin i cizí)`, `${p.rows.map((r) => r.id).join()} / ${s.rows.length}`);
  }
  // hledání v poznámce cizího kontaktu (klient 3 je jen Honzův): Volající nic, super admin ano; jméno najde
  const hp = await api.listKontakty(petra, { search: 'jednoduchý web s fotkami', limit: 50 });
  const hs = await api.listKontakty(mikulas, { search: 'jednoduchý web s fotkami', limit: 50 });
  over('U4', hp.rows.length === 0 && hs.rows.some((r) => r.id === 3), 'text poznámky cizího kontaktu Volající nevyhledá (super admin ano)', `${hp.rows.length} / ${hs.rows.length}`);
  const jm = (await api.listKontakty(albert, { limit: 500 })).rows.find((r) => r.id === 3)?.name ?? '';
  const pj = await api.listKontakty(petra, { search: jm, limit: 50 });
  over('U4b', !!jm && pj.rows.some((r) => r.id === 3 && r.skryto === true), 'cizí kontakt Volající podle jména najde (kontakty vidí všechny), jen bez stavu', jm);
  // pořadí: svoji napřed, cizí jen podle id
  const prvniCizi = vse.rows.findIndex((r) => !r.je_muj);
  const ciziId = cizi.map((r) => r.id);
  over('U5', prvniCizi === moje.length && ciziId.every((id, i) => i === 0 || ciziId[i - 1] < id),
    'Volající má napřed své klienty, cizí jen podle id (pořadí stav cizího neprozradí)', ciziId.slice(0, 8).join());
  // příznak a zámek cizího kontaktu Volající nemění, data beze změny; super admin smí
  const pred3 = (await api.listKontakty(albert, { search: jm, limit: 5 })).rows.find((r) => r.id === 3);
  await chyba('U6', () => api.setFlag(petra, 3, 'jine', 'podvrh'), /^Tohle není váš klient/, 'Volající nedá příznak cizímu kontaktu');
  await chyba('U6b', () => api.clearFlag(petra, 92), /^Tohle není váš klient/, 'Volající nezruší příznak cizího kontaktu (92 od automatizace)');
  await chyba('U6c', () => api.updateKontakt(petra, 3, { clear_lock: true }), /^Tohle není váš klient/, 'Volající neuvolní zámek cizího kontaktu');
  await chyba('U6d', () => api.updateKontakt(petra, 3, { flag_kind: 'jine', flag_note: 'x' }), /^Tohle není váš klient/, 'Volající nezmění příznak cizího kontaktu přes update_kontakt');
  const po3 = (await api.listKontakty(albert, { search: jm, limit: 5 })).rows.find((r) => r.id === 3);
  const po92 = (await api.listFlagged(albert)).find((r) => r.id === 92);
  over('U6e', po3?.flag_kind === pred3?.flag_kind && po3?.flag_note === pred3?.flag_note && po92?.flag_kind === 'neodpovida', 'odmítnuté úpravy nechají data beze změny');
  const fs = await api.setFlag(mikulas, 3, 'jine', 'super admin smí');
  over('U6f', fs.flagged_by === 'Mikuláš', 'super admin dál smí dát příznak i kontaktu, který upravit nesmí (pravidlo 24. 9. 2026)');
  await api.clearFlag(albert, 3);
  // karta ve volání: kontakt, kterému Volající ještě nevolal, bez stavu a poznámek, s jeho zámkem
  const karta = await api.nextContact(petra, 'chata');
  if (!karta) over('U7', false, 'fronta chat je prázdná, kartu nejde změřit');
  else {
    over('U7', karta.je_muj ? karta.skryto === false : karta.skryto === true && navic(karta, ['lock_by', 'lock_at', 'zamceno']).length === 0 && karta.lock_by === 2,
      'karta ve volání nese u kontaktu, kterému Volající nevolal, jen allowlist a jeho zámek', navic(karta, ['lock_by', 'lock_at', 'zamceno']).join());
    await api.returnContact(petra, karta.id);
  }
  // vlákna: Volající nevidí žádné vlákno o cizím klientovi
  const mojeVse = new Set((await api.myKontakty(petra, 500, 0)).rows.map((r) => r.id));
  const vl = await api.listThreads(petra);
  over('U8', vl.every((x) => x.kontakt_id === null || mojeVse.has(x.kontakt_id)), 'Zprávy: Volající nevidí vlákno o klientovi, který není jeho',
    vl.filter((x) => x.kontakt_id !== null && !mojeVse.has(x.kontakt_id)).map((x) => x.id).join());
  const mockSrc = readFileSync(join(ROOT, 'src/api/mock.ts'), 'utf8');
  over('U8b', /if \(t\.kontakt_id !== null && !moje\.has\(t\.kontakt_id\)\) out\.delete\(t\.id\);/.test(mockSrc), 'mock skrývá vlákna o cizím klientovi jako app_vlakna_viditelna');
  // stránky: Kontakty, detail a karta ve volání ukazují u cizího kontaktu jen základ
  const adminSrc = readFileSync(join(ROOT, 'src/pages/AdminPage.tsx'), 'utf8');
  over('U9', (adminSrc.match(/jenZaklad\(r\) \? <Skryto \/> :/g) ?? []).length === 5, 'Kontakty: stav, známka, kdo volal, čekání a datum změny cizího kontaktu jsou pomlčka');
  const drawerSrc = readFileSync(join(ROOT, 'src/components/KontaktDrawer.tsx'), 'utf8');
  over('U9b', /if \(jenZaklad\(kontakt\)\) \{\s*return \(/.test(drawerSrc), 'detail cizího kontaktu jen se základními údaji (bez stavu, poznámek, příznaku, zámku a vláken)');
  const callSrc = readFileSync(join(ROOT, 'src/pages/CallPage.tsx'), 'utf8');
  over('U9c', /\{!jenZaklad\(kontakt\) && \(\s*<div className="call-row">\s*<span className="k">status<\/span>/.test(callSrc), 'karta ve volání ukáže stav jen u vlastního klienta');
});

/* ---------------- W) po dvou recenzích 045: záznam kolegy, hlavička s datem, jméno, chyby bez stavu (20. 10. 2026) ---------------- */
// Dvě recenze 20. 10. 2026 (databáze a appka, ROLLBACK proti živé DB) našly obejití pravidel 045: řádky záznamu kolegy
// bez jména (pokračování zápisu z resolve_call) šly upravit i smazat; podvrženou hlavičku „[datum kolega]“ obešel znak
// nulové šířky, cyrilice, NBSP nebo tabulátor za datem, chybějící mezera i mezera na začátku a resolve_call ji uložil bez
// kontroly; Volající se mohl přejmenovat a „Mikulas“ vedle „Mikuláš“ prošel; chyba resolve_call a vratit_do_fronty říkala
// stav; set_flag a update_kontakt se stejným druhem přepsaly autora příznaku; poznámky neměly strop. Mock = server
// (db/migration_046_privatnost_po_recenzi.sql, db/tests/test_046_privatnost_po_recenzi.sql). Speciální znaky se skládají z kódů (String.fromCodePoint), aby
// v testu nebyl žádný neviditelný ani cyrilský znak. Běží po bloku U a před bloky, které frontu provolají; co změní
// (poznámka, příznak, zámek, jméno, stav), vrátí.
await blok('W', async () => {
  const ZW = String.fromCodePoint(0x200b);      // znak nulové šířky
  const NBSP = String.fromCodePoint(0xa0);      // nezlomitelná mezera
  const TAB = String.fromCodePoint(0x9);        // tabulátor
  const LS = String.fromCodePoint(0x2028);      // oddělovač řádků Unicode
  const CYR_T = String.fromCodePoint(0x422);    // cyrilské velké T
  const CYR_A = String.fromCodePoint(0x430);    // cyrilské malé a
  // kladný krok, který mutace mocku může odmítnout: zapíše FAIL a blok jede dál (ověřeno mutacemi, každá kontrola zvlášť)
  const projde = async (id, fn, text) => {
    try {
      await fn();
      return true;
    } catch (e) {
      over(id, false, text, `odmítnuto: ${e.message}`);
      return false;
    }
  };
  const poznamka2 = async () => (await api.listKontakty(albert, { search: 'Roubenka U Lesa', limit: 5 })).rows.find((r) => r.id === 2) ?? null;
  const puvodni2 = (await poznamka2())?.note ?? null;

  // klíč jmen (app_jmeno_klic) a hlavička s datem (app_hlavicka_cizi) jako server
  over('W0', typeof jmenoKlic === 'function' && typeof hlavickaCizi === 'function' && KLIC_Z?.length === 141 && KLIC_NA?.length === 141,
    'mock má jmenoKlic, hlavickaCizi a tabulku podobných znaků 141 na 141 (jako app_jmeno_klic)', `${KLIC_Z?.length} / ${KLIC_NA?.length}`);
  over('W0b', jmenoKlic(`  Mi${ZW}kul${CYR_A}š${NBSP}${NBSP}${TAB}Novák `) === 'mikulas novak' && jmenoKlic(null) === '',
    'jmenoKlic: bez neviditelných znaků, cyrilice jako latinka, mezery Unicode sloučené, bez diakritiky, malými písmeny', jmenoKlic(`  Mi${ZW}kul${CYR_A}š${NBSP}${NBSP}${TAB}Novák `));
  over('W0c', hlavickaCizi('[2026-10-20 petra] x', ['Petra']) === null && hlavickaCizi('[2026-10-20 Petra, chata 2] x', ['Petra']) === null
    && hlavickaCizi('[2026-10-20 Petrak] x', ['Petra']) === '[2026-10-20 petrak]',
    'hlavickaCizi: vlastní jméno (i malými a s „, …“) projde, jiné jméno vrátí v klíči');
  // recenze 046 (20. 10. 2026): jen hlavička na začátku řádku (i za Unicode koncem řádku); datum uprostřed řádku projde
  over('W0f', hlavickaCizi('zavolat [2026-10-25 odpoledne]', ['Petra']) === null && hlavickaCizi('text [2026-10-20 Petrak] x', ['Petra']) === null
    && hlavickaCizi(`ok${LS}[2026-10-20 Petrak] x`, ['Petra']) === '[2026-10-20 petrak]' && hlavickaCizi('ok\r[2026-10-20 Petrak] x', ['Petra']) === '[2026-10-20 petrak]',
    'hlavickaCizi: hlavička jen na začátku řádku (i za U+2028 a \\r), datum v závorkách uprostřed řádku projde');
  // druhá recenze 046 (20. 10. 2026): hlavička i za odrážkou a za neviditelnými znaky, které klíč nezná
  const PRED_HLAVICKOU = [0xe0100, 0xe0020, 0x2800, 0x1d173, 0xfff9].map((k) => String.fromCodePoint(k));
  over('W0g', [...PRED_HLAVICKOU, '- ', `- ${PRED_HLAVICKOU[2]}`].every((z) => hlavickaCizi(`${z}[2026-10-20 Petrak] x`, ['Petra']) === '[2026-10-20 petrak]')
    && hlavickaCizi('- [2026-10-20 Petra] x', ['Petra']) === null && hlavickaCizi(`${PRED_HLAVICKOU[0]}[2026-10-20 Petra] x`, ['Petra']) === null
    && hlavickaCizi('zavolat [2026-10-25 odpoledne]', ['Petra']) === null && hlavickaCizi('1) [2026-10-20 Petrak] x', ['Petra']) === null,
    'hlavickaCizi: hlavička i za odrážkou a za U+E0100, U+E0020, U+2800, U+1D173, U+FFF9 (jako server), vlastní projde, za slovem nebo číslem hlavička není',
    [...PRED_HLAVICKOU, '- '].map((z) => hlavickaCizi(`${z}[2026-10-20 Petrak] x`, ['Petra'])).join(' | '));
  const mockZdroj = readFileSync(join(ROOT, 'src/api/mock.ts'), 'utf8');
  const podezrely = [...mockZdroj].filter((c) => {
    const k = c.codePointAt(0);
    return (k >= 0x370 && k <= 0x52f) || k === 0xa0 || k === 0xad || (k >= 0x2000 && k <= 0x200f) || (k >= 0x2028 && k <= 0x202f)
      || (k >= 0x2060 && k <= 0x206f) || k === 0xfeff || (k >= 0xfe00 && k <= 0xfe0f) || (k >= 0xff00 && k <= 0xffef);
  });
  over('W0d', podezrely.length === 0, 'src/api/mock.ts nemá žádný neviditelný, cyrilský ani široký znak doslova (tabulka jen únikovými sekvencemi)',
    podezrely.slice(0, 5).map((c) => c.codePointAt(0).toString(16)).join());
  await chyba('W0e', async () => poznamkaZpet(Array(600).fill('a').join('\n'), Array(300).fill('a').join('\n'), ['Eda'], ['Kuba']),
    /^Poznámka je na uložení moc dlouhá, zkraťte ji\.$/, 'poznamkaZpet odmítne uložení nad 160 000 porovnání (jako app_poznamka_zpet)');

  // záznam kolegy s pokračováním bez jména (víceřádkový zápis z doby před 045): celý je Volajícímu jen ke čtení
  const sPokracovanim = `${puvodni2}\nPokračování zápisu kolegy bez jména.`;
  await api.updateKontakt(albert, 2, { note: sPokracovanim });
  try {
    const maska = (await api.myKontakty(petra, 200, 0)).rows.find((r) => r.id === 2)?.note ?? '';
    const [vlastni, kolegy, pokracovani] = maska.split('\n');
    over('W1', kolegy === '[2026-08-29 jiný volající] Zase nebrali.' && pokracovani === 'Pokračování zápisu kolegy bez jména.',
      'Volající má u klienta 2 záznam kolegy se dvěma řádky (jinak W nic neměří)', maska);
    const ODMITNUTI = [
      ['W2', `${vlastni}\n${kolegy}`, /^Řádek kolegy upravit ani smazat nejde, připište nový řádek\. Chybí nebo je změněný či přesunutý řádek „Pokračování/, 'smazaný řádek bez jména v záznamu kolegy'],
      ['W2b', `${vlastni}\n${kolegy}\nPokračování zápisu kolegy, upravené.`, /^Řádek kolegy upravit ani smazat nejde/, 'upravený řádek bez jména v záznamu kolegy'],
      ['W2c', `${vlastni}\n${kolegy}\n[2026-10-20 Petra] vložené doprostřed\n${pokracovani}`,
        /^Řádek kolegy upravit ani smazat nejde, připište nový řádek\. Do záznamu kolegy nejde nic vložit ani z něj nic vyjmout: „Pokračování/, 'vlastní hlavička vložená do záznamu kolegy'],
      // recenze 046: obyčejný řádek vložený doprostřed záznamu dostane vlastní hlavičku, pokračování kolegy by pak stálo pod ní
      ['W2d', `${vlastni}\n${kolegy}\nobyčejný vložený doprostřed\n${pokracovani}`,
        /^Řádek kolegy upravit ani smazat nejde, připište nový řádek\. Do záznamu kolegy nejde nic vložit ani z něj nic vyjmout: „Pokračování/, 'obyčejný řádek vložený do záznamu kolegy'],
    ];
    // podvržená hlavička: každé obejití z recenze (server hledá v klíči app_jmeno_klic)
    const PODVRHY = [
      ['W3', '[2026-10-20 Honza] podvrh', 'jméno kolegy'],
      ['W3b', `[2026-10-20 Hon${ZW}za] podvrh`, 'znak nulové šířky ve jménu'],
      ['W3c', `[2026-10-20${NBSP}Honza] podvrh`, 'NBSP za datem'],
      ['W3d', `[2026-10-20 Alber${CYR_T}] podvrh`, 'cyrilské T místo latinského'],
      ['W3e', `[2026-10-20${TAB}Honza] podvrh`, 'tabulátor za datem'],
      ['W3f', '[2026-10-20Honza] podvrh', 'bez mezery za datem'],
      ['W3g', ' [2026-10-20 Honza] podvrh', 'mezera na začátku řádku'],
      ['W3h', '[ 2026-10-20 Honza] podvrh', 'mezera za závorkou „[ 2026“'],
      ['W3j', '[2026-10-20 jiný  volající] podvrh', 'dvě mezery v „jiný  volající“'],
      ['W3k', '[2026-10-20 Albert] podvrh', 'jméno Alberta'],
      ['W3l', '[2026-10-20] podvrh', 'hlavička bez jména'],
      // druhá recenze 046: hlavička kolegy za neviditelným znakem, který klíč nezná, nebo za odrážkou
      ['W3m', `${PRED_HLAVICKOU[0]}[2026-10-15 Honza] podvrh`, 'U+E0100 před hlavičkou'],
      ['W3n', `${PRED_HLAVICKOU[1]}[2026-10-15 Honza] podvrh`, 'U+E0020 před hlavičkou'],
      ['W3o', `${PRED_HLAVICKOU[2]}[2026-10-15 Honza] podvrh`, 'U+2800 před hlavičkou'],
      ['W3p', `${PRED_HLAVICKOU[3]}[2026-10-15 Honza] podvrh`, 'U+1D173 před hlavičkou'],
      ['W3q', `${PRED_HLAVICKOU[4]}[2026-10-15 Honza] podvrh`, 'U+FFF9 před hlavičkou'],
      ['W3r', '- [2026-10-15 Honza] podvrh', 'odrážka před hlavičkou'],
    ];
    for (const [id, radek, co] of PODVRHY) {
      ODMITNUTI.push([id, `${maska}\n${radek}`,
        /^Nový řádek nesmí mít v hlavičce „\[datum jméno\]“ jiné jméno než vaše \(ani jméno kolegy, „jiný volající“ nebo prázdné\), napište ho pod svým jménem \(„\[2026-10-20 Petra\] …“\): „/, `podvržená hlavička: ${co}`]);
    }
    // druhá recenze 046 (pravidlo 045): jméno kolegy ani „jiný volající“ v hlavičce ani za čárkou
    for (const [id, radek, co] of [
      ['W3s', '[2026-10-20 Petra, Honza] Honza souhlasí', 'vlastní jméno, za čárkou kolega'],
      ['W3t', '[2026-10-20 Petra, jiný volající] x', 'za čárkou „jiný volající“'],
      ['W3u', `[2026-10-20 Petra, Honz${CYR_A}] x`, 'za čárkou kolega s cyrilským a'],
      ['W3v', `- [2026-10-20 Petra, Hon${ZW}za] x`, 'za odrážkou, za čárkou kolega se znakem nulové šířky'],
    ]) {
      ODMITNUTI.push([id, `${maska}\n${radek}`,
        /^Nový řádek nesmí mít v hlavičce „\[datum jméno\]“ jméno kolegy ani „jiný volající“, ani za čárkou, napište ho pod svým jménem \(„\[2026-10-20 Petra\] …“\): „/, `jméno kolegy za čárkou: ${co}`]);
    }
    for (const [id, nova, vzor, co] of ODMITNUTI) {
      await chyba(id, () => api.updateKontakt(petra, 2, { note: nova }), vzor, `Volající neuloží: ${co}`);
      const po = (await poznamka2())?.note ?? null;
      over(`${id}x`, po === sPokracovanim, `odmítnuté uložení (${co}) nechá data beze změny`, po ?? '');
      if (po !== sPokracovanim) await api.updateKontakt(albert, 2, { note: sPokracovanim });   // další případ od stejného stavu
    }
    // druhá recenze 046: uložený zápis kolegy za odrážkou nebo neviditelným znakem je hlavička jeho záznamu (pokračování
    // pod ním jen ke čtení)
    for (const [id, z] of [['W2e', '- '], ['W2f', PRED_HLAVICKOU[2]]]) {
      // vlastní řádek mezi záznamy, aby pokračování nepatřilo k předchozímu zápisu Honzy v puvodni2
      const sOdrazkou = `${puvodni2}\n[2026-10-19 Petra] moje mezi\n${z}[2026-10-15 Honza] zapsal\npokračování bez jména`;
      await api.updateKontakt(albert, 2, { note: sOdrazkou });
      const maskaOdr = (await api.myKontakty(petra, 200, 0)).rows.find((r) => r.id === 2)?.note ?? '';
      await chyba(id, () => api.updateKontakt(petra, 2, { note: maskaOdr.split('\n').slice(0, -1).join('\n') }), /^Řádek kolegy upravit ani smazat nejde/,
        `Volající nesmaže pokračování zápisu kolegy, jehož hlavička stojí za „${z === '- ' ? '- ' : 'U+2800'}“`);
      over(`${id}x`, (await poznamka2())?.note === sOdrazkou, 'odmítnutí nechá zápis kolegy beze změny');
    }
    await api.updateKontakt(albert, 2, { note: sPokracovanim });
    // recenze 046 (20. 10. 2026): běžná práce pod zápisem kolegy projde (tvar kontaktů 1582 a 1962: last_caller kolega,
    // Volající volal); prázdný řádek nepatří nikomu, obyčejný řádek dostane vlastní hlavičku s dnešním dnem v Praze
    const dnes = `[${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())} Petra] `;
    for (const [id, ulozena, nova, cil, co] of [
      ['W14', sPokracovanim, `${maska}\nobyčejný řádek bez hlavičky`, `${sPokracovanim}\n${dnes}obyčejný řádek bez hlavičky`, 'obyčejně připsaný řádek pod zápisem kolegy'],
      ['W14b', sPokracovanim, `${maska}\n\n[2026-10-20 Petra] text`, `${sPokracovanim}\n\n[2026-10-20 Petra] text`, 'prázdný řádek a pod ním vlastní hlavička'],
      ['W14c', sPokracovanim, `${maska}\n`, `${sPokracovanim}\n`, 'jen Enter (prázdný poslední řádek)'],
      ['W14d', sPokracovanim, `${maska}\n\ntext`, `${sPokracovanim}\n\n${dnes}text`, 'Enter dvakrát a text'],
      ['W14e', `${sPokracovanim}\n`, `${maska}\ntext`, `${sPokracovanim}\n${dnes}text`, 'psaní na prázdném posledním řádku'],
      ['W14f', `${puvodni2}\n\nPokračování zápisu kolegy bez jména.`, maska, sPokracovanim, 'smazaný prázdný řádek uprostřed záznamu kolegy'],
      ['W14g', sPokracovanim, `${maska}\nzavolat [2026-10-25 odpoledne]`, `${sPokracovanim}\n${dnes}zavolat [2026-10-25 odpoledne]`, 'datum v závorkách uprostřed řádku'],
      // druhá recenze 046: vlastní hlavička za odrážkou nebo za neviditelným znakem a „[datum Petra, …]“ bez kolegy projdou
      ['W14h', sPokracovanim, `${maska}\n- [2026-10-20 Petra] s odrážkou`, `${sPokracovanim}\n- [2026-10-20 Petra] s odrážkou`, 'vlastní hlavička za odrážkou'],
      ['W14i', sPokracovanim, `${maska}\n${PRED_HLAVICKOU[2]}[2026-10-20 petra] za znakem`, `${sPokracovanim}\n${PRED_HLAVICKOU[2]}[2026-10-20 petra] za znakem`, 'vlastní hlavička za U+2800'],
      ['W14j', sPokracovanim, `${maska}\n[2026-10-20 Petra, volala klientovi] ok`, `${sPokracovanim}\n[2026-10-20 Petra, volala klientovi] ok`, 'vlastní hlavička s čárkou bez jména kolegy'],
    ]) {
      await api.updateKontakt(albert, 2, { note: ulozena });
      let vraceno = null;
      await projde(id, async () => { vraceno = await api.updateKontakt(petra, 2, { note: nova }); }, `Volající uloží: ${co}`);
      over(id, (await poznamka2())?.note === cil, `Volající uloží běžnou práci pod zápisem kolegy (${co}), řádky kolegy zůstanou doslova`,
        JSON.stringify((await poznamka2())?.note ?? ''));
      if (id === 'W14') {
        over('W14x', vraceno?.note === `${maska}\n${dnes}obyčejný řádek bez hlavičky` && !/Honza/.test(vraceno?.note ?? ''),
          'update_kontakt vrátí uloženou poznámku s připsanou hlavičkou (detail ji hned ukáže), jména kolegů maskovaná', vraceno?.note ?? '');
      }
    }
    await api.updateKontakt(albert, 2, { note: sPokracovanim });

    // recenze 046: řádek se systémovou hlavičkou Volající upraví; hlavička, která v poznámce je, smí být i v novém řádku
    const sSystemovou = `${sPokracovanim}\n[2026-10-01 tabulka] import z tabulky\n[2026-10-02 Agent — rešerše] web nalezen`;
    await api.updateKontakt(albert, 2, { note: sSystemovou });
    const maskaSys = (await api.myKontakty(petra, 200, 0)).rows.find((r) => r.id === 2)?.note ?? '';
    for (const [id, nova, cil, co] of [
      ['W15', maskaSys.replace('import z tabulky', 'import z tabulky, opraveno'), sSystemovou.replace('import z tabulky', 'import z tabulky, opraveno'), 'upravený řádek „[datum tabulka]“'],
      ['W15b', maskaSys.replace('web nalezen', 'web nalezen, starý'), sSystemovou.replace('web nalezen', 'web nalezen, starý'), 'upravený řádek „[datum Agent — rešerše]“'],
      ['W15c', `${maskaSys}\n[2026-10-20 tabulka] nová řádka`, `${sSystemovou}\n[2026-10-20 tabulka] nová řádka`, 'nový řádek s hlavičkou „tabulka“, která v poznámce je'],
    ]) {
      await api.updateKontakt(albert, 2, { note: sSystemovou });
      await projde(id, () => api.updateKontakt(petra, 2, { note: nova }), `Volající uloží: ${co}`);
      over(id, (await poznamka2())?.note === cil, `Volající upraví řádek se systémovou hlavičkou (${co})`, JSON.stringify((await poznamka2())?.note ?? ''));
    }
    for (const [id, nova, co] of [
      ['W15d', `${maskaSys}\n[2026-10-20 živá session] x`, 'systémová hlavička, která v poznámce není'],
      ['W15e', `${maskaSys}\n[2026-10-20 jiný volající] x`, '„jiný volající“'],
      ['W15f', maskaSys.replace('[2026-10-01 tabulka]', '[2026-10-01 Honza]'), 'jméno kolegy místo „tabulka“'],
      ['W15g', `${maskaSys}\n[2026-10-20 tabulka, Honza] x`, 'systémová hlavička, za čárkou kolega (druhá recenze 046)'],
    ]) {
      await api.updateKontakt(albert, 2, { note: sSystemovou });
      await chyba(id, () => api.updateKontakt(petra, 2, { note: nova }), /^Nový řádek nesmí mít v hlavičce/, `Volající neuloží: ${co}`);
      over(`${id}x`, (await poznamka2())?.note === sSystemovou, `odmítnutí (${co}) nechá data beze změny`);
    }
    await api.updateKontakt(albert, 2, { note: sPokracovanim });

    // recenze 046: strop proti poznámce, jak ji Volající vidí (maskované): poznámka 4 960 znaků se jmény kolegy je pro
    // Petru přes 5 000; smazat vlastní řádek a uložit beze změny jde, prodloužit ne
    const kolegaRadky = Array.from({ length: 95 }, (_, i) => `[2026-10-${String((i % 28) + 1).padStart(2, '0')} Honza] volal Honza, pak Honza znovu`).join('\n');
    let blizko = `${kolegaRadky}\n[2026-10-19 Petra] moje `;
    blizko += 'm'.repeat(4960 - [...blizko].length);
    await api.updateKontakt(albert, 2, { note: blizko });
    const maskaBlizko = (await api.myKontakty(petra, 200, 0)).rows.find((r) => r.id === 2)?.note ?? '';
    over('W16', [...blizko].length === 4960 && [...maskaBlizko].length > 5000, 'Petra vidí poznámku 4 960 znaků se jmény kolegy jako delší než 5 000 (jinak W16 nic neměří)', `${[...maskaBlizko].length}`);
    const bezMoji = maskaBlizko.split('\n').slice(0, -1).join('\n');
    await projde('W16b', () => api.updateKontakt(petra, 2, { note: bezMoji }), 'smazaný vlastní řádek u stropu projde');
    over('W16b', (await poznamka2())?.note === kolegaRadky, 'poznámku přes strop (jak ji Volající vidí) jde zkrátit smazáním vlastního řádku', `${[...((await poznamka2())?.note ?? '')].length}`);
    await api.updateKontakt(albert, 2, { note: blizko });
    await projde('W16c', () => api.updateKontakt(petra, 2, { note: maskaBlizko }), 'uložení beze změny u stropu projde');
    over('W16c', (await poznamka2())?.note === blizko, 'poznámku u stropu jde uložit beze změny');
    await chyba('W16d', () => api.updateKontakt(petra, 2, { note: `${maskaBlizko} x` }),
      /^Poznámka je moc dlouhá: nejvýš 5 000 znaků a 100 řádků \(delší poznámku jde jen zkrátit\)\.$/, 'prodloužit poznámku přes strop nejde');
    await api.updateKontakt(albert, 2, { note: sPokracovanim });

    // co smí: vlastní hlavičku za záznamem kolegy (i malými písmeny, i s „, …“) a pod ní obyčejný řádek; \r\n jako \n
    await projde('W4', () => api.updateKontakt(petra, 2, { note: `${maska}\n[2026-10-20 Petra] moje po kolegovi\na pokračuji pod svým jménem` }), 'vlastní hlavička za záznamem kolegy projde');
    over('W4', (await poznamka2())?.note === `${sPokracovanim}\n[2026-10-20 Petra] moje po kolegovi\na pokračuji pod svým jménem`,
      'Volající připíše vlastní hlavičku za záznam kolegy a pod ni obyčejný řádek, záznam kolegy zůstane doslova', (await poznamka2())?.note ?? '');
    await api.updateKontakt(albert, 2, { note: sPokracovanim });
    await projde('W4b', () => api.updateKontakt(petra, 2, { note: `${maska}\n[2026-10-20 petra] malými písmeny\n[2026-10-20 Petra, druhý hovor] s čárkou` }), 'vlastní hlavička malými písmeny projde');
    over('W4b', (await poznamka2())?.note === `${sPokracovanim}\n[2026-10-20 petra] malými písmeny\n[2026-10-20 Petra, druhý hovor] s čárkou`,
      'vlastní hlavička malými písmeny i „[datum Jméno, …]“ projde', (await poznamka2())?.note ?? '');
    await api.updateKontakt(albert, 2, { note: sPokracovanim });
    await projde('W5', () => api.updateKontakt(petra, 2, { note: `${maska.split('\n').join('\r\n')}\r\n[2026-10-20 Petra] přes CRLF` }), 'poznámka s \\r\\n projde');
    over('W5', (await poznamka2())?.note === `${sPokracovanim}\n[2026-10-20 Petra] přes CRLF`,
      'poznámka s konci řádků \\r\\n se uloží (řádky kolegy se najdou) a uloží se s \\n', JSON.stringify((await poznamka2())?.note ?? ''));
    await api.updateKontakt(albert, 2, { note: sPokracovanim });

    // strop délky (všem, i super adminovi): text nad 5 000 znaků nebo nad 100 řádků, který je delší než uložený
    const radky = (pocet) => Array(pocet).fill('[2026-10-20 Petra] ř').join('\n');
    const DLOUHA = /^Poznámka je moc dlouhá: nejvýš 5 000 znaků a 100 řádků \(delší poznámku jde jen zkrátit\)\.$/;
    const DLOUHA_PRIZNAK = /^Poznámka příznaku je moc dlouhá: nejvýš 5 000 znaků a 100 řádků \(delší poznámku jde jen zkrátit\)\.$/;
    for (const [id, tok, patch, vzor, co] of [
      ['W6', petra, { note: 'x'.repeat(5001) }, DLOUHA, 'poznámka 5 001 znaků'],
      ['W6b', petra, { note: `${maska}\n${radky(98)}` }, DLOUHA, 'poznámka 101 řádků'],
      ['W6c', albert, { note: 'x'.repeat(5001) }, DLOUHA, 'poznámka 5 001 znaků od Alberta'],
      ['W6d', petra, { flag_note: 'x'.repeat(5001) }, DLOUHA_PRIZNAK, 'poznámka příznaku 5 001 znaků'],
      ['W6e', petra, { flag_note: radky(101) }, DLOUHA_PRIZNAK, 'poznámka příznaku 101 řádků'],
    ]) {
      await chyba(id, () => api.updateKontakt(tok, 2, patch), vzor, `update_kontakt odmítne: ${co}`);
      const po = await poznamka2();
      if (po?.note !== sPokracovanim || po?.flag_kind !== null || po?.flag_note !== null) {
        over(`${id}x`, false, `odmítnutá dlouhá poznámka (${co}) nechá data beze změny`);
        await api.updateKontakt(albert, 2, { note: sPokracovanim });
        await api.clearFlag(albert, 2);
      }
    }
    await chyba('W6f', () => api.setFlag(petra, 2, 'jine', radky(101)), DLOUHA_PRIZNAK, 'set_flag odmítne poznámku příznaku 101 řádků');
    const po6 = await poznamka2();
    over('W6x', po6?.note === sPokracovanim && po6?.flag_kind === null && po6?.flag_note === null, 'odmítnuté dlouhé poznámky nechají data beze změny', `${po6?.flag_kind}`);
    if (po6?.flag_kind !== null || po6?.flag_note !== null) await api.clearFlag(albert, 2);
    await projde('W6g', () => api.updateKontakt(petra, 2, { note: `${maska}\n${radky(97)}` }), 'poznámka 100 řádků projde');
    over('W6g', ((await poznamka2())?.note ?? '').split('\n').length === 100, 'poznámka přesně 100 řádků projde (strop je nad 100)');
    await api.updateKontakt(albert, 2, { note: sPokracovanim });
  } finally {
    await api.updateKontakt(albert, 2, { note: puvodni2 });
  }

  // příznak: poznámka příznaku, který dal kolega, je celá jeho (i řádek bez jména); autor se mění jen se změnou druhu
  await api.clearFlag(albert, 2);   // čistý stav i po případném selhání výš
  await api.setFlag(honza, 2, 'jine', 'Zavolat zpět\nřádek bez jména od kolegy');
  try {
    await chyba('W7', () => api.setFlag(petra, 2, 'jine', 'Zavolat zpět'), /^Řádek kolegy upravit ani smazat nejde/, 'Volající nesmaže řádek bez jména v poznámce příznaku kolegy (set_flag)');
    await chyba('W7b', () => api.updateKontakt(petra, 2, { flag_note: 'Zavolat zpět' }), /^Řádek kolegy upravit ani smazat nejde/, 'ani přes update_kontakt');
    const p7 = await poznamka2();
    over('W7x', p7?.flag_note === 'Zavolat zpět\nřádek bez jména od kolegy' && p7?.flagged_by === 'Honza', 'odmítnutí nechá poznámku příznaku i autora', `${p7?.flagged_by}`);
    // druhá recenze 046 (20. 10. 2026): poznámka příznaku kolegy je celá jeden jeho záznam: vložit nejde, připsaný řádek
    // dostane vlastní hlavičku, autor zůstane kolega, uložení beze změny projde
    const dnes17 = `[${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())} Petra] `;
    const priznakHonzy = 'Zavolat zpět\nřádek bez jména od kolegy';
    for (const [id, fn, co] of [
      ['W17', () => api.setFlag(petra, 2, 'jine', 'Zavolat zpět\nvložené mezi\nřádek bez jména od kolegy'), 'obyčejný řádek vložený mezi řádky (set_flag)'],
      ['W17b', () => api.updateKontakt(petra, 2, { flag_note: `[2026-10-20 Petra] před\n${priznakHonzy}` }), 'vlastní hlavička před poznámkou (update_kontakt)'],
      ['W17c', () => api.setFlag(petra, 2, 'jine', `před\n${priznakHonzy}`), 'obyčejný řádek před poznámkou (set_flag)'],
    ]) {
      await chyba(id, fn, /^Řádek kolegy upravit ani smazat nejde, připište nový řádek\. Do záznamu kolegy nejde nic vložit/, `Volající nevloží do poznámky příznaku kolegy: ${co}`);
      const p17 = await poznamka2();
      over(`${id}x`, p17?.flag_note === priznakHonzy && p17?.flagged_by === 'Honza', `odmítnutí (${co}) nechá poznámku příznaku i autora`, `${p17?.flag_note} / ${p17?.flagged_by}`);
    }
    await projde('W17d', () => api.setFlag(petra, 2, 'jine', `${priznakHonzy}\nobyčejně připsaný`), 'řádek připsaný na konec poznámky příznaku kolegy projde');
    const p17d = await poznamka2();
    over('W17d', p17d?.flag_note === `${priznakHonzy}\n${dnes17}obyčejně připsaný` && p17d?.flagged_by === 'Honza',
      'řádek připsaný na konec poznámky příznaku kolegy dostane vlastní hlavičku, autor zůstane kolega', `${p17d?.flag_note} / ${p17d?.flagged_by}`);
    await projde('W17e', () => api.updateKontakt(petra, 2, { flag_note: p17d?.flag_note ?? '' }), 'uložení beze změny s vlastním připsaným řádkem projde');
    over('W17e', (await poznamka2())?.flag_note === p17d?.flag_note, 'poznámka příznaku kolegy s vlastním připsaným řádkem jde uložit beze změny');
    await api.setFlag(albert, 2, 'jine', '[2026-10-15 Honza] chybí e-mail\n[2026-10-16 Honza] pořád chybí');
    await chyba('W17f', () => api.setFlag(petra, 2, 'jine', '[2026-10-15 jiný volající] chybí e-mail\n[2026-10-20 Petra] vložené\n[2026-10-16 jiný volající] pořád chybí'),
      /^Řádek kolegy upravit ani smazat nejde, připište nový řádek\. Do záznamu kolegy nejde nic vložit/, 'Volající nevloží vlastní hlavičku mezi dva zápisy kolegy v poznámce jeho příznaku');
    await api.setFlag(albert, 2, 'jine', priznakHonzy);
    over('W17x', (await poznamka2())?.flagged_by === 'Honza', 'příznak po W17 zase Honzův (W8 měří od stejného stavu)', (await poznamka2())?.flagged_by);
    await projde('W8', () => api.setFlag(petra, 2, 'jine', 'Zavolat zpět\nřádek bez jména od kolegy\n[2026-10-20 Petra] doplním e-mail'), 'připsaný vlastní řádek v poznámce příznaku kolegy projde');
    const p8 = await poznamka2();
    over('W8', p8?.flagged_by === 'Honza' && p8?.flag_note === 'Zavolat zpět\nřádek bez jména od kolegy\n[2026-10-20 Petra] doplním e-mail',
      'set_flag se stejným druhem nechá autora příznaku (kolegu), připsaný vlastní řádek se uloží', `${p8?.flagged_by} / ${p8?.flag_note}`);
    await projde('W8b', () => api.setFlag(petra, 2, 'chybi_info', p8?.flag_note ?? ''), 'set_flag s jiným druhem projde');
    const p8b = await poznamka2();
    over('W8b', p8b?.flagged_by === 'Petra' && p8b?.flag_kind === 'chybi_info', 'set_flag s jiným druhem zapíše nového autora', `${p8b?.flagged_by}`);
    await projde('W8c', () => api.updateKontakt(honza, 2, { flag_kind: 'jine' }), 'update_kontakt s druhem příznaku projde');
    over('W8c', (await poznamka2())?.flagged_by === 'Honza', 'update_kontakt se změnou druhu zapíše autora (kolega Honza)', (await poznamka2())?.flagged_by);
    await projde('W8d', () => api.updateKontakt(petra, 2, { flag_kind: 'jine', flag_note: p8?.flag_note ?? '' }), 'update_kontakt se stejným druhem a stejnou poznámkou projde');
    over('W8d', (await poznamka2())?.flagged_by === 'Honza', 'update_kontakt se stejným druhem autora nepřepíše', (await poznamka2())?.flagged_by);
    // autor před změnou druhu je jistě někdo jiný (Albert přes set_flag s jiným druhem), aby W8e měřil přepis autora
    await api.setFlag(albert, 2, 'info_neoverene', p8?.flag_note ?? '');
    const p8pred = await poznamka2();
    await projde('W8e', () => api.updateKontakt(petra, 2, { flag_kind: 'chybi_email' }), 'update_kontakt s jiným druhem projde');
    const p8e = await poznamka2();
    over('W8e', p8pred?.flagged_by === 'Albert' && p8e?.flagged_by === 'Petra' && p8e?.flag_kind === 'chybi_email' && !!p8e?.flagged_at,
      'update_kontakt s jiným druhem zapíše nového autora a čas', `${p8pred?.flagged_by} → ${p8e?.flagged_by}`);
    await chyba('W8f', () => api.updateKontakt(petra, 2, { flag_kind: 'blbost' }), /^Neplatný druh příznaku: blbost\.$/, 'update_kontakt odmítne neznámý druh příznaku (jako server)');
  } finally {
    await api.clearFlag(albert, 2);
  }

  // poznámka z hovoru: strop, hlavička jen s vlastním jménem (i přes obejití), jeden řádek; chyby bez stavu
  const hovoryPred = (await api.myStats(petra)).calls;
  await chyba('W9', () => api.resolveCall(petra, { kontakt_id: 2, outcome: 'nedovolano', note: '[2026-10-20 Honza] podvrh' }),
    /^Poznámka z hovoru nesmí mít hlavičku „\[datum jméno\]“ s jiným jménem než vaším \(ani jméno kolegy, „jiný volající“ nebo prázdné\)\. Hlavičku s datem a vaším jménem připíše zápis hovoru sám\.$/,
    'resolve_call odmítne poznámku s hlavičkou kolegy');
  await chyba('W9b', () => api.resolveCall(petra, { kontakt_id: 2, outcome: 'nedovolano', note: `řádek\n[2026-10-20 Hon${ZW}za] podvrh` }),
    /^Poznámka z hovoru nesmí mít hlavičku/, 'resolve_call odmítne podvrženou hlavičku i se znakem nulové šířky na druhém řádku');
  await chyba('W9c', () => api.resolveCall(petra, { kontakt_id: 2, outcome: 'nedovolano', note: 'x'.repeat(2001) }),
    /^Poznámka z hovoru je moc dlouhá: nejvýš 2 000 znaků\.$/, 'resolve_call odmítne poznámku nad 2 000 znaků');
  // recenze 046: datum v závorkách uprostřed řádku kontrolou hlavičky projde (dál zastaví až zámek, kontakt 2 Petra nedrží)
  await chyba('W9d', () => api.resolveCall(petra, { kontakt_id: 2, outcome: 'nedovolano', note: 'zavolat [2026-10-25 odpoledne]' }),
    /^Tenhle kontakt teď nemáte přidělený/, 'resolve_call nebere datum uprostřed řádku za hlavičku');
  await chyba('W9e', () => api.resolveCall(petra, { kontakt_id: 2, outcome: 'nedovolano', note: `ok${LS}[2026-10-20 Honza] podvrh` }),
    /^Poznámka z hovoru nesmí mít hlavičku/, 'resolve_call najde hlavičku kolegy i za Unicode koncem řádku');
  over('W9x', (await api.myStats(petra)).calls === hovoryPred && (await poznamka2())?.note === puvodni2, 'odmítnutý zápis hovoru nic nezapíše');
  const karta = await api.nextContact(honza, 'chata');
  if (!karta) over('W10', false, 'fronta chat je prázdná, zápis hovoru nejde změřit');
  else {
    const radekPred = (await api.listKontakty(albert, { segment: 'chata', limit: 1000 })).rows.find((r) => r.id === karta.id);
    await api.updateKontakt(albert, karta.id, { status: 'odmitnuto' });
    let hlaskaHovor = '';
    let hlaskaVraceni = '';
    try { await api.resolveCall(honza, { kontakt_id: karta.id, outcome: 'nedovolano' }); } catch (e) { hlaskaHovor = e.message; }
    try { await api.returnContact(honza, karta.id); } catch (e) { hlaskaVraceni = e.message; }
    over('W10', hlaskaHovor === 'Kontakt už není ve frontě volání, váš zámek na něj tedy neplatí. Načtěte si dalšího.' && !/odmitnuto|odmítnut/i.test(hlaskaHovor),
      'chyba resolve_call mimo frontu neřekne stav kontaktu', hlaskaHovor);
    over('W10b', hlaskaVraceni === `Kontakt ${karta.id} už není ve frontě volání. Nic se nevrátilo.`, 'chyba vratit_do_fronty mimo frontu neřekne stav kontaktu', hlaskaVraceni);
    await api.updateKontakt(albert, karta.id, { status: radekPred?.status ?? 'nekontaktovano' });
    // poznámka 4 000 znaků (pod stropem) a k ní zápis hovoru: uložená poznámka pak má přes 5 000 znaků (resolve_call
    // připisuje bez stropu celé poznámky, jako u klienta s mnoha hovory)
    const dlouha = 'x'.repeat(4000);
    await api.updateKontakt(albert, karta.id, { note: dlouha });
    const ypsilony = 'y'.repeat(1900);
    await projde('W10c', () => api.resolveCall(honza, { kontakt_id: karta.id, outcome: 'nedovolano', note: `první řádek\nřádek pod ním\r\ntřetí${LS}čtvrtý ${ypsilony}  ` }), 'zápis hovoru s poznámkou projde');
    const ulozenaPo = async () => (await api.listKontakty(albert, { segment: 'chata', limit: 1000 })).rows.find((r) => r.id === karta.id)?.note ?? null;
    const zapis = `[${new Date().toISOString().slice(0, 10)} Honza] první řádek řádek pod ním třetí čtvrtý ${ypsilony}`;
    const ulozena = await ulozenaPo();
    over('W10c', ulozena === `${dlouha}\n${zapis}`,
      'resolve_call zapíše poznámku z hovoru jako jeden řádek (konce řádků i Unicode jako mezera)', JSON.stringify((ulozena ?? '').slice(4000, 4080)));
    // delší poznámku jde jen zkrátit: kratší (pořád přes 5 000 znaků) se uloží, delší ne
    const kratsi = (ulozena ?? '').slice(0, -100);
    await projde('W10d', () => api.updateKontakt(honza, karta.id, { note: kratsi }), 'zkrácená dlouhá poznámka projde');
    over('W10d', [...kratsi].length > 5000 && (await ulozenaPo()) === kratsi, 'uložená poznámka přes 5 000 znaků jde uložit zkrácená (i Volajícím)', `${[...kratsi].length} znaků`);
    await chyba('W10e', () => api.updateKontakt(albert, karta.id, { note: `${kratsi}x` }),
      /^Poznámka je moc dlouhá: nejvýš 5 000 znaků a 100 řádků \(delší poznámku jde jen zkrátit\)\.$/, 'poznámku přes 5 000 znaků prodloužit nejde');
    over('W10f', (await ulozenaPo()) === kratsi, 'odmítnuté prodloužení nechá poznámku beze změny');
    await api.updateKontakt(albert, karta.id, { note: radekPred?.note ?? null });
  }

  // zobrazované jméno: Volající se nepřejmenuje (heslo změní), dvojník jména neprojde ani Albertovi
  await chyba('W11', () => api.updateUser(petra, 2, { display_name: 'Petruška' }),
    /^Zobrazované jméno mění jen super admin nebo Albert\. Požádejte svého super admina\.$/, 'Volající své zobrazované jméno nezmění');
  // heslo z demo dat má 5 znaků, server chce aspoň 6; test ho nechá změněné (další bloky jedou na už vydaných tokenech)
  let heslo = null;
  let stejne = null;
  let prihlaseni = null;
  await projde('W11b', async () => {
    heslo = await api.updateUser(petra, 2, { password: 'volam-w11' });
    stejne = await api.updateUser(petra, 2, { display_name: ' Petra ', password: 'volam-w11b' });
    prihlaseni = await api.login('petra', 'volam-w11b');
  }, 'Volající si změní heslo');
  over('W11b', heslo?.display_name === 'Petra' && stejne?.display_name === 'Petra' && prihlaseni?.display_name === 'Petra' && (await api.me(petra)).display_name === 'Petra',
    'Volající si změní heslo (i se stejným jménem v požadavku), jméno zůstane', `${heslo?.display_name} / ${stejne?.display_name}`);
  if (prihlaseni) await api.logout(prihlaseni.token);
  for (const [id, jmeno, vzor, co] of [
    ['W12', 'Mikulas', /^Jméno „Mikulas" už má jiný uživatel \(velikost písmen ani diakritika nerozhodují\)\. Zvolte jiné/, 'jméno super admina bez diakritiky'],
    ['W12b', `Mikul${CYR_A}š`, /už má jiný uživatel \(velikost písmen ani diakritika nerozhodují\)/, 'jméno super admina s cyrilským a'],
    ['W12c', `Miku${ZW}láš`, /^Zobrazované jméno obsahuje neviditelný nebo řídicí znak\. Napište ho znovu obyčejnými písmeny\.$/, 'jméno se znakem nulové šířky'],
    ['W12d', `Jiný${NBSP}Volající`, /je vyhrazené pro automatizaci/, '„jiný volající“ s NBSP a velkými písmeny'],
    ['W12e', 'Agent-7', /je vyhrazené pro automatizaci/, 'jméno začínající „agent“'],
    // recenze 046: čárka a hranatá závorka (i široká a 【) by hlavičku „[datum jméno, …]“ rozbily
    ['W12g', 'Novák, Jan', /^Zobrazované jméno nesmí obsahovat čárku ani hranatou závorku/, 'jméno s čárkou'],
    ['W12h', 'Jan] x', /^Zobrazované jméno nesmí obsahovat čárku ani hranatou závorku/, 'jméno s hranatou závorkou'],
    ['W12i', `Jan${String.fromCodePoint(0xff3b)}x`, /^Zobrazované jméno nesmí obsahovat čárku ani hranatou závorku/, 'jméno se širokou závorkou'],
    ['W12j', `Jan${String.fromCodePoint(0x3010)}x`, /^Zobrazované jméno nesmí obsahovat čárku ani hranatou závorku/, 'jméno se závorkou 【'],
  ]) {
    await chyba(id, () => api.updateUser(albert, 3, { display_name: jmeno }), vzor, `Albert nepřejmenuje Honzu: ${co}`);
  }
  const lide = await api.allStats(mikulas);
  over('W12x', lide.find((u) => u.user_id === 3)?.display_name === 'Honza' && lide.find((u) => u.user_id === 2)?.display_name === 'Petra',
    'odmítnutá přejmenování nechají jména beze změny');
  let prejm = null;
  let zpet = null;
  await projde('W12f', async () => {
    prejm = await api.updateUser(albert, 5, { display_name: 'Eva K' });
    zpet = await api.updateUser(albert, 5, { display_name: 'Eva' });
  }, 'Albert přejmenuje na jméno bez dvojníka');
  over('W12f', prejm?.display_name === 'Eva K' && zpet?.display_name === 'Eva', 'Albert dál přejmenuje na jméno bez dvojníka (kontrola nepřísná)');

  // detail: nápověda u poznámky říká nová pravidla (řádky bez jména, řádek za záznamem kolegy, hlavička s datem; druhá
  // recenze 046: i za odrážkou a bez jména kolegy za čárkou; poznámka příznaku kolegy: nic vložit, připsaný řádek s hlavičkou)
  const drawer = readFileSync(join(ROOT, 'src/components/KontaktDrawer.tsx'), 'utf8');
  const napoveda = /export const RADKY_KOLEGU_NAPOVEDA =\s*([\s\S]*?);\n/.exec(drawer)?.[1] ?? '';
  over('W13', /bez jména/.test(napoveda) && /dostane při ' \+\s*'uložení vaši hlavičku|dostane při uložení vaši hlavičku/.test(napoveda) && /Prázdné řádky/.test(napoveda) && /jen se svým jménem/.test(napoveda)
    && !/začněte|jinak by patřil/.test(napoveda),
    'detail: nápověda k řádkům kolegů říká, že řádky bez jména v záznamu kolegy jsou jen ke čtení, obyčejný řádek pod nimi dostane vlastní hlavičku sám, prázdné řádky jdou a hlavička s datem nese jen vlastní jméno (recenze 046)', napoveda.slice(0, 260));
  over('W13b', /if \('note' in patch\) setNote\(updated\.note \?\? ''\);/.test(drawer), 'detail po uložení ukáže poznámku, jak ji server uložil (s připsanou hlavičkou)');
  over('W13c', /i za odrážkou/.test(napoveda) && /ani za čárkou/.test(napoveda), 'detail: nápověda říká, že hlavičkou je i řádek za odrážkou a jméno kolegy v ní nesmí být ani za čárkou (druhá recenze 046)', napoveda.slice(0, 400));
  const napovedaPriznak = /export const PRIZNAK_KOLEGY_NAPOVEDA =\s*([\s\S]*?);\n/.exec(drawer)?.[1] ?? '';
  over('W13d', /ani do ní nic vložit/.test(napovedaPriznak) && /na konec připsat/.test(napovedaPriznak) && /vaši hlavičku/.test(napovedaPriznak),
    'detail: nápověda k příznaku kolegy říká, že do poznámky nic vložit nejde a připsaný řádek dostane vlastní hlavičku (druhá recenze 046)', napovedaPriznak.slice(0, 300));
});

/* ---------------- O) karta architekta: obrat místo IČO (Albert 3. 10. 2026, APP-8, migrace 037) ---------------- */
// Volající nevidí IČO architekta. Karta ukáže jeden řádek „obrat“ podle veřejné registrace k DPH
// (povinná nad 2 000 000 Kč obratu za rok): plátce osobně NEBO ateliér = nad 2 mil., známý neplátce
// nebo identifikovaná osoba a nikdo plátce = do 2 mil., jinak nezjištěno (null). Běží před bloky,
// které frontu architektů provolají (dnes volaný kontakt next_contact 4 h nenabídne).
await blok('O', async () => {
  const obrat = uiModul.obratArchitekta;
  over('O0', typeof obrat === 'function', 'ui.tsx má obratArchitekta(dph_osobni, dph_firma)');
  if (typeof obrat === 'function') {
    const NAD = 'nad 2 mil. Kč ročně (plátce DPH)';
    const DO = 'do 2 mil. Kč ročně (neplátce DPH)';
    const PRIPADY = [
      ['platce', null, NAD], [null, 'platce', NAD], ['neplatce', 'platce', NAD], ['platce', 'identifikovana_osoba', NAD],
      ['neplatce', null, DO], [null, 'identifikovana_osoba', DO], ['identifikovana_osoba', 'neovereno', DO], ['neplatce', 'neplatce', DO],
      [null, null, null], ['neovereno', 'neovereno', null], [undefined, undefined, null], ['neovereno', null, null],
    ];
    PRIPADY.forEach(([o, f, cil], i) => {
      over(`O1.${i}`, obrat(o, f) === cil, `obrat při DPH osobně ${o} a ateliéru ${f} je ${cil ?? 'nezjištěno (null)'}`, String(obrat(o, f)));
    });
  }
  const ma = (r, k) => !!r && Object.prototype.hasOwnProperty.call(r, k);
  // mock = server (037): volající (role caller) dostal kartu bez IČO; admin a super admin jako dřív.
  // ⚠ NAHRAZENO migrací 042 (Albert 18. 10. 2026: Volající vidí IČO jako dřív admini): role caller není,
  // Petra a Honza jsou Volající a kartu dostanou s IČO jako Eva.
  for (const [kdo, tok, ico] of [['Petra (Volající)', petra, true], ['Honza (Volající)', honza, true], ['Eva (Volající)', eva, true], ['Albert', albert, true]]) {
    const k = await api.nextContact(tok, 'architekt');
    if (!k) { over('O2', false, `${kdo}: fronta architektů je prázdná, nejde změřit`); continue; }
    await api.updateKontakt(albert, k.id, { clear_lock: true }); // další uživatel dostane volnou kartu
    over('O2', ma(k, 'ico_osobni') === ico && ma(k, 'ico_firma') === ico, `${kdo}: karta ve volání ${ico ? 'nese' : 'nenese'} IČO architekta`, `karta ${k.id}`);
    over('O3', ma(k, 'dph_osobni') && ma(k, 'dph_firma') && ma(k, 'firma'), `${kdo}: karta nese DPH osobně, DPH ateliéru a firmu (obrat se z nich počítá)`, `karta ${k.id}`);
  }
  // oznacit_za_sveho (Petra volala 302, ten je nedovolano). ⚠ NAHRAZENO migrací 042 (Albert 18. 10. 2026: Volající vidí IČO jako dřív admini): 
  // Volající dostane řádek s IČO jako admin.
  const oz = await api.claimKontakt(petra, 302);
  over('O4', oz.ico_osobni === '11111111' && ma(oz, 'dph_osobni'), 'označení klienta Volajícímu pošle IČO i DPH jako adminovi (042)');
});

/* ---------------- P) seznamy a detail: volající IČO nevidí ani nehledá (Albert 3. 10. 2026, migrace 038) ---------------- */
await blok('P', async () => {
  const ma = (r, k) => !!r && Object.prototype.hasOwnProperty.call(r, k);
  const { icoVidi } = segmentModul;
  over('P0', typeof icoVidi === 'function', 'segment.ts má icoVidi(role)');
  if (typeof icoVidi === 'function') {
    over('P0b', icoVidi('admin') && icoVidi('super_admin') && !icoVidi('caller') && !icoVidi(undefined) && !icoVidi('neco'),
      'IČO vidí jen admin a super admin (neznámá role ne)');
  }
  // ⚠ NAHRAZENO migrací 042 (Albert 18. 10. 2026: Volající vidí IČO jako dřív admini): dřív tu Petra a Honza
  // (role caller) IČO neviděli ani nehledali a Označené neměli. Teď jsou Volající jako Eva: osobní IČO
  // jen u svých klientů (smi_upravit), IČO studia (jiné než osobní) u všech, Označené jen svoje.
  for (const [kdo, tok, svuj] of [['Petra', petra, 302], ['Honza', honza, 303]]) {
    const vse = (await api.listKontakty(tok, { segment: 'architekt', limit: 50 })).rows;
    over('P1', vse.length === 4 && vse.every((r) => ma(r, 'ico_osobni') === r.smi_upravit), `${kdo}: seznam Kontakty: osobní IČO jen u kontaktů, které smí upravit (028)`);
    over('P1a', vse.find((r) => r.id === 300)?.ico_firma === '22222222', `${kdo}: seznam Kontakty: IČO studia vidí jako admin (042)`);
    over('P1b', vse.every((r) => ma(r, 'dph_osobni') || ma(r, 'dph_firma')), `${kdo}: seznam nese DPH (obrat v detailu)`);
    const moje = (await api.myKontakty(tok, 2000, 0, null, 'architekt')).rows;
    over('P2', moje.some((r) => r.id === svuj) && moje.every((r) => r.id !== svuj || (r.smi_upravit && ma(r, 'ico_osobni'))), `${kdo}: Moji klienti: u svého architekta osobní IČO vidí (042)`);
    over('P3', (await api.listKontakty(tok, { search: '22222222', limit: 50 })).rows.some((r) => r.id === 300), `${kdo}: hledání IČO studia najde studio (042)`);
    const osobni = (await api.listKontakty(tok, { search: '11111111', limit: 50 })).rows.map((r) => r.id);
    over('P3b', !osobni.includes(300) && osobni.includes(svuj) === (svuj === 302), `${kdo}: osobní IČO najde jen u kontaktu, který smí upravit`, osobni.join());
    const ozn = await api.listFlagged(tok, null, null);
    over('P4', Array.isArray(ozn) && ozn.every((r) => r.je_muj || r.smi_upravit), `${kdo}: Označené otevře, jen svoje (042)`);
  }
  const ev = (await api.listKontakty(eva, { segment: 'architekt', limit: 50 })).rows.find((r) => r.id === 300);
  over('P5', ev?.ico_firma === '22222222' && !ma(ev, 'ico_osobni'), 'admin (nesmí upravit) dál vidí IČO studia, osobní ne (028, 032)');
  const al = (await api.listKontakty(albert, { segment: 'architekt', limit: 50 })).rows.find((r) => r.id === 300);
  over('P6', al?.ico_firma === '22222222' && al?.ico_osobni === '11111111', 'Albert vidí obě IČO');
});

/* ---------------- E) seznamy ---------------- */
await blok('E', async () => {
  const vse = await api.listKontakty(albert, { limit: 1000 });
  const ch = await api.listKontakty(albert, { segment: 'chata', limit: 1000 });
  const ar = await api.listKontakty(albert, { segment: 'architekt', limit: 1000 });
  over('E1', ar.total === 4 && ar.rows.every((r) => r.segment === 'architekt'), 'filtr architekti vrací jen 4 falešné architekty', `total ${ar.total}`);
  over('E1b', ar.rows.map((r) => r.id).sort().join() === ARCH.join(), 'falešní architekti mají id 300 až 303', ar.rows.map((r) => r.id).join());
  over('E1c', ch.rows.every((r) => seg(r) === 'chata') && ch.total > 0, 'filtr chaty nevrací architekta');
  over('E1d', ch.total + ar.total === vse.total, 'chaty + architekti = vše (null = celá databáze)', `${ch.total}+${ar.total}≠${vse.total}`);
  over('E1e', ch.rows.every((r) => r.segment === 'chata'), 'každá chata nese segment chata (k() v mocku)');
  for (const r of ar.rows) {
    over('E1f', /@example\.cz$/.test(r.email ?? 'x@example.cz') && (!r.web || /example\.cz/.test(r.web)), 'falešní architekti mají jen adresy example.cz', `${r.id}`);
    for (const ico of [r.ico_osobni, r.ico_firma]) {
      over('E1g', ico == null || ico === '11111111' || ico === '22222222', 'IČO architektů v mocku jen s neplatným součtem', `${r.id} ${ico}`);
    }
  }
  await chyba('E2', () => api.listKontakty(albert, { segment: 'xyz' }), /Neplatný segment: xyz/, 'seznam s neznámým segmentem skončí chybou');
  const n = await api.listKontakty(albert, { status: 'nekontaktovano', segment: 'architekt', limit: 1 });
  over('E3', n.total === 2, 'počet stavu nekontaktovano u architektů = 2 (300, 301)', `total ${n.total}`);
  const nch = await api.listKontakty(albert, { status: 'nekontaktovano', segment: 'chata', limit: 1 });
  const nvse = await api.listKontakty(albert, { status: 'nekontaktovano', limit: 1 });
  over('E3b', nch.total + n.total === nvse.total, 'počty stavů podle segmentu dávají součet');
  const hledej = async (q, s = null) => (await api.listKontakty(albert, { search: q, segment: s, limit: 50 })).rows.map((r) => r.id);
  over('E4', (await hledej('ukázkový ateliér')).includes(300), 'hledání najde studio (firma)');
  over('E4b', (await hledej('tábor')).includes(303), 'hledání najde město');
  over('E4c', (await hledej('22222222')).includes(300), 'hledání najde IČO studia');
  const ico = await hledej('11111111', 'architekt');
  over('E4d', ico.includes(300) && ico.includes(302), 'hledání najde osobní IČO', ico.join());
  over('E4e', (await hledej('ukázkový ateliér', 'chata')).length === 0, 'hledání respektuje filtr segmentu');
  const cek = await api.listKontakty(albert, { cekani: 'ceka_prvni', segment: 'architekt', limit: 50 });
  over('E5', cek.rows.some((r) => r.id === 303) && cek.rows.every((r) => r.segment === 'architekt'), 'čekání + filtr architekti: 303 čeká na první odpověď');
  const kos = await api.listKontakty(albert, { cekani: 'ceka_prvni', kos: 'k_zavolani', segment: 'chata', limit: 50 });
  over('E5b', kos.rows.every((r) => r.segment === 'chata') && !kos.rows.some((r) => r.id === 303), 'koš čekání s filtrem chaty architekta nevrátí');

  // [ALBERT 28]: osobní IČO v seznamech jen tomu, kdo kontakt smí upravit (2.2 l)
  const radekPetra = (await api.listKontakty(petra, { segment: 'architekt', limit: 50 })).rows;
  over('E6', radekPetra.length === 4 && radekPetra.every((r) => Object.prototype.hasOwnProperty.call(r, 'ico_osobni') === r.smi_upravit),
    'Volající dostane v seznamu osobní IČO jen u kontaktů, které smí upravit (klíč jinak chybí jako u serveru)');
  // ⚠ NAHRAZENO 3. 10. 2026 (Albert, migrace 038): dřív „IČO studia v seznamu zůstává“ i volajícímu.
  // ⚠ NAHRAZENO migrací 042 (Albert 18. 10. 2026: Volající vidí IČO jako dřív admini): IČO studia Volající zase vidí.
  over('E6b', radekPetra.find((r) => r.id === 300)?.ico_firma === '22222222', 'Volající dostane v seznamu IČO studia jako admin (042)');
  over('E6b2', radekPetra.find((r) => r.id === 300)?.dph_firma === 'platce', 'DPH studia volající v seznamu dostane (detail z něj ukáže obrat)');
  const radekAlbert = (await api.listKontakty(albert, { segment: 'architekt', limit: 50 })).rows;
  over('E6c', radekAlbert.find((r) => r.id === 300)?.ico_osobni === '11111111', 'kdo smí upravit, vidí osobní IČO i v seznamu');
  const radekEva = (await api.listKontakty(eva, { segment: 'architekt', limit: 50 })).rows;
  over('E6d', radekEva.every((r) => r.smi_upravit === true || !Object.prototype.hasOwnProperty.call(r, 'ico_osobni')),
    'admin vidí osobní IČO jen u kontaktů, které smí upravit');
  const chataPetra = (await api.listKontakty(petra, { segment: 'chata', limit: 50 })).rows;
  over('E6e', chataPetra.every((r) => r.smi_upravit || !Object.prototype.hasOwnProperty.call(r, 'ico_osobni')), 'maska platí i pro chaty (server odebírá klíč u každého řádku, který nesmí upravit)');

  const mojeA = await api.myKontakty(petra, 2000, 0, null, 'architekt');
  over('E7', mojeA.total === 1 && mojeA.rows.length === 1 && mojeA.rows[0].id === 302, 'Moji klienti s filtrem architekti: Petra má 302', `total ${mojeA.total}`);
  over('E7b', mojeA.rows[0]?.smi_upravit === true && mojeA.rows[0]?.ico_osobni === '11111111', 'Moji klienti: Volající u svého klienta osobní IČO vidí (smí ho upravit, 042)');
  const mojeC = await api.myKontakty(petra, 2000, 0, null, 'chata');
  const mojeV = await api.myKontakty(petra, 2000, 0, null);
  over('E7c', mojeC.rows.every((r) => r.segment === 'chata') && mojeC.total + mojeA.total === mojeV.total, 'Moji klienti: chaty + architekti = vše, počet ze serveru');
  over('E7d', mojeV.rows.some((r) => r.id === 302), 'Moji klienti bez filtru ukážou i architekta');
  await chyba('E7e', () => api.myKontakty(petra, 2000, 0, null, 'xyz'), /Neplatný segment/, 'Moji klienti s neznámým segmentem skončí chybou');
  const honzaA = await api.myKontakty(honza, 2000, 0, null, 'architekt');
  over('E7f', honzaA.rows.map((r) => r.id).join() === '303', 'Honza má z architektů jen 303', honzaA.rows.map((r) => r.id).join());

  const ozn = await api.listFlagged(mikulas, null, null);
  const r302 = ozn.find((r) => r.id === 302);
  over('E8', !!r302 && !Object.prototype.hasOwnProperty.call(r302, 'ico_osobni') && r302.smi_upravit === false,
    'Označené: cizí klient super admina bez osobního IČO');
  const oznA = await api.listFlagged(albert, null, null);
  over('E8b', oznA.find((r) => r.id === 302)?.ico_osobni === '11111111', 'Označené: Albert osobní IČO vidí');
});

/* ---------------- L) mock = server: IČO, vlastní karta napřed, strop vrácení (audit APP-4, APP-5) ---------------- */
// Server: list_kontakty hledá osobní IČO jen CELÝM číslem (mezery se ignorují) a jen u řádků,
// které přihlášený smí upravit (migrace 028); IČO ateliéru rovné osobnímu se v seznamech
// skrývá s ním (032) a v úpravách taky (036); next_contact vrátí nejdřív vlastní platnou kartu
// (036); vratit_do_fronty nejvýš 10 karet za hodinu na člověka (028). Běží PŘED blokem BCD,
// který obě fronty vyčerpá. Strop zkouší Eva (v BCD nic nevrací).
await blok('L', async () => {
  const najdi = async (tok, q) => (await api.listKontakty(tok, { search: q, segment: 'architekt', limit: 50 })).rows.map((r) => r.id);
  const maKlic = (r, k) => Object.prototype.hasOwnProperty.call(r ?? {}, k);
  const castecne = await najdi(albert, '1111111');
  over('L1', !castecne.includes(302) && !castecne.includes(300), 'osobní IČO se hledá jen celým číslem, ne kouskem (028)', castecne.join());
  const petraIco = await najdi(petra, '11111111');
  over('L2', petraIco.includes(302) && !petraIco.includes(300), 'Volající osobní IČO vyhledá jen u svého klienta (302 ano, 300 ne)', petraIco.join());
  const sMezerou = await najdi(albert, '1111 1111');
  over('L2b', sMezerou.includes(300) && sMezerou.includes(302), 'mezery v hledaném osobním IČO se ignorují jako na serveru', sMezerou.join());
  const evaIco = await najdi(eva, '11111111');
  over('L3', !evaIco.includes(300) && !evaIco.includes(302), 'admin osobní IČO vyhledá jen u kontaktů, které smí upravit', evaIco.join());
  // ⚠ NAHRAZENO 3. 10. 2026 (Albert, migrace 038): dřív „IČO ateliéru (jiné než osobní) hledá každý“
  // ⚠ NAHRAZENO migrací 042 (Albert 18. 10. 2026: Volající vidí IČO jako dřív admini): Volající IČO ateliéru zase vyhledá.
  over('L4', (await najdi(petra, '22222222')).includes(300), 'Volající IČO ateliéru (jiné než osobní) vyhledá jako admin (042)');
  over('L4b', (await najdi(eva, '22222222')).includes(300), 'admin IČO ateliéru (jiné než osobní) vyhledá dál');

  // živnostník: IČO ateliéru = osobní IČO (032)
  await api.updateKontakt(albert, 302, { ico_firma: '11111111', dph_firma: 'neplatce' });
  try {
    // maska 032 pro toho, kdo kontakt nesmí upravit (⚠ 042: měří se na Evě, Petra je u 302 Volající, která ho smí upravit)
    const r = (await api.listKontakty(eva, { segment: 'architekt', limit: 50 })).rows.find((x) => x.id === 302);
    over('L5', !!r && !maKlic(r, 'ico_osobni') && !maKlic(r, 'ico_firma') && !maKlic(r, 'dph_firma'),
      'seznam skryje i IČO ateliéru rovné osobnímu a DPH ateliéru (032)', r && Object.keys(r).filter((k) => k.startsWith('ico') || k.startsWith('dph')).join());
    over('L5b', !(await najdi(eva, '11111111')).includes(302), 'IČO ateliéru rovné osobnímu se nevyhledá přes ico_firma (032)');
    const ra = (await api.listKontakty(albert, { segment: 'architekt', limit: 50 })).rows.find((x) => x.id === 302);
    over('L5c', ra?.ico_firma === '11111111' && ra?.ico_osobni === '11111111', 'kdo smí upravit, vidí obě IČO');
    // úpravy: Mikuláš (super admin) smí příznak a zámek, upravit 302 nesmí (Petra není jeho člověk).
    // ⚠ NAHRAZUJE Evu (Volající): ta od 20. 10. 2026 příznak ani zámek cizího kontaktu nemění (blok U)
    const f = await api.setFlag(mikulas, 302, 'jine', 'test L');
    over('L6', f.smi_upravit === false && !maKlic(f, 'ico_osobni') && !maKlic(f, 'ico_firma') && !maKlic(f, 'dph_firma'),
      'set_flag nepošle osobní IČO ani IČO ateliéru rovné osobnímu tomu, kdo nesmí upravit (028, 036)', Object.keys(f).filter((k) => k.startsWith('ico')).join());
    const c = await api.clearFlag(mikulas, 302);
    over('L6b', !maKlic(c, 'ico_osobni') && !maKlic(c, 'ico_firma'), 'clear_flag taky ne');
    const u = await api.updateKontakt(mikulas, 302, { clear_lock: true });
    over('L6c', !maKlic(u, 'ico_osobni') && !maKlic(u, 'ico_firma'), 'update_kontakt (zámek) taky ne');
    const fa = await api.setFlag(albert, 302, 'jine', 'test L');
    over('L6d', fa.ico_osobni === '11111111' && fa.ico_firma === '11111111' && fa.dph_firma === 'neplatce', 'Albert (smí upravit) dostane z úprav všechno');
    await api.clearFlag(albert, 302);
  } finally {
    await api.updateKontakt(albert, 302, { ico_firma: null, dph_firma: null });
  }
  // ⚠ NAHRAZUJE set_flag Evy u 300 (od 20. 10. 2026 příznak cizího kontaktu Volající nemění): měří se seznam
  const f300 = (await api.listKontakty(eva, { search: '22222222', segment: 'architekt', limit: 5 })).rows.find((r) => r.id === 300);
  over('L6e', !!f300 && !maKlic(f300, 'ico_osobni') && f300.ico_firma === '22222222' && f300.dph_firma === 'platce', 'jiné IČO ateliéru zůstává, schová se jen osobní');
  // oznacit_za_sveho (Petra 302 volala): ⚠ NAHRAZENO 3. 10. 2026 (Albert, migrace 037), dřív
  // „vrací řádek celý jako server“; volajícímu teď bez IČO architekta, detail řádek pošle přes bezCizihoIco
  // ⚠ NAHRAZENO migrací 042 (Albert 18. 10. 2026: Volající vidí IČO jako dřív admini): Volající dostane řádek s IČO jako admin.
  const claim = await api.claimKontakt(petra, 302);
  over('L7', claim.smi_upravit === true && claim.ico_osobni === '11111111' && claim.dph_osobni === 'identifikovana_osoba',
    'oznacit_za_sveho pošle Volajícímu u jeho klienta IČO i DPH (jako server od 042)');

  // vlastní karta napřed (036): reload nebo další volání dá tutéž kartu, nezamkne další
  const k1 = await api.nextContact(eva, 'chata');
  const zamky = () => api.listKontakty(albert, { segment: 'chata', limit: 1000 }).then((x) => x.rows.filter((r) => r.lock_by === 5));
  const pred = (await zamky()).find((r) => r.id === k1.id)?.lock_at;
  const dalsi = [];
  for (let i = 0; i < 4; i++) dalsi.push((await api.nextContact(eva, 'chata'))?.id);
  over('L8', dalsi.every((id) => id === k1.id), 'opakovaný next_contact vrací tutéž vlastní kartu (036)', `${k1.id}: ${dalsi.join()}`);
  const po = await zamky();
  over('L8b', po.length === 1 && po[0].id === k1.id, 'reload nezamyká další karty', po.map((r) => r.id).join());
  over('L8c', po[0]?.lock_at === pred, 'zámek se reloadem neposouvá (30 minut a 2 h běží od vzetí)', `${pred} → ${po[0]?.lock_at}`);
  const a = await api.nextContact(eva, 'architekt');
  over('L8d', !!a && a.segment === 'architekt', 'vlastní chata se v segmentu architekt nevrátí', a && `${a.id} ${a.segment}`);
  await api.returnContact(eva, a.id);

  // strop 10 vrácení za hodinu (vratit_do_fronty, 028): Eva už vrátila 1 (architekta)
  let karta = k1;
  let vraceno = 1;
  let strop = '';
  for (let i = 0; i < 12 && karta; i++) {
    try {
      await api.returnContact(eva, karta.id);
      vraceno += 1;
      karta = await api.nextContact(eva, 'chata');
    } catch (e) {
      strop = e.message;
      break;
    }
  }
  over('L9', vraceno === 10 && /Za poslední hodinu jste bez výsledku hovoru vrátili do fronty už 10 karet \(strop 10 za hodinu\)\. Zapište výsledek hovoru\./.test(strop),
    'jedenácté vrácení za hodinu skončí hláškou serveru o stropu', `vráceno ${vraceno}, hláška: ${strop}`);
  const drzi = karta && (await zamky()).some((r) => r.id === karta.id);
  over('L9b', !!drzi, 'karta po stropu zůstane zamčená (nic se nevrátilo)');
  if (karta) await api.updateKontakt(albert, karta.id, { clear_lock: true });
});

/* ---------------- B, C, D) fronta volání ---------------- */
await blok('BCD', async () => {
  const c1 = await api.nextContact(petra);
  over('B1', !!c1 && seg(c1) === 'chata', 'nextContact bez segmentu dá chatu (starý bundle)', c1 && `${c1.id} ${c1.segment}`);
  // stav karty se měří Albertovým seznamem: cizí karta Volajícího stav nenese (od 20. 10. 2026, blok U)
  const pred1 = (await api.listKontakty(albert, { segment: 'chata', limit: 1000 })).rows.find((r) => r.id === c1.id)?.status;
  const vr = await api.returnContact(petra, c1.id);
  over('C1', vr && vr.ok === true && vr.kontakt_id === c1.id, 'vlastní čistá karta jde vrátit do fronty');
  const po = (await api.listKontakty(albert, { segment: 'chata', limit: 1000 })).rows.find((r) => r.id === c1.id);
  over('C1b', po && po.lock_by === null && po.lock_at === null && !!pred1 && po.status === pred1, 'po vrácení je kontakt odemčený a stav se nezměnil');

  const a1 = await api.nextContact(petra, 'architekt');
  over('B2', !!a1 && a1.segment === 'architekt' && [300, 301, 302].includes(a1.id), 'nextContact s architekt dá volatelného architekta', a1 && `${a1.id}`);
  // ⚠ NAHRAZENO 3. 10. 2026 (Albert, APP-8, migrace 037): dřív „karta ve volání nese řádek celý
  // včetně osobního IČO“. Volající IČO architekta nevidí, karta z DPH ukáže jen řádek obrat.
  // ⚠ NAHRAZENO migrací 042 (Albert 18. 10. 2026: Volající vidí IČO jako dřív admini): Petra je Volající
  // (role admin) a kartu dostane celou jako admin; karta sama dál ukazuje jen řádek obrat (CallPage).
  over('H1', a1 && Object.prototype.hasOwnProperty.call(a1, 'ico_osobni')
    && Object.prototype.hasOwnProperty.call(a1, 'dph_osobni') && Object.prototype.hasOwnProperty.call(a1, 'dph_firma'),
    'karta ve volání Volajícímu nese IČO i DPH jako adminovi (042)');
  await chyba('C2', () => api.returnContact(honza, a1.id), new RegExp(`Kontakt ${a1.id} nemáte zamčený\\. Nic se nevrátilo\\.`), 'cizí zámek se nevrací');
  const skutecne = Date.now;
  Date.now = () => skutecne() + 31 * 60 * 1000;
  try {
    await chyba('C3', () => api.returnContact(petra, a1.id), /Kartu máte déle než 30 minut\. Zapište výsledek hovoru, zámek sám vyprší do 2 hodin\./, 'karta starší 30 minut se nevrací (DB-7)');
  } finally {
    Date.now = skutecne;
  }
  await chyba('C4', () => api.returnContact(petra, 999999), /Kontakt 999999 neexistuje\./, 'neexistující kontakt');
  await chyba('D1', () => api.resolveCall(honza, { kontakt_id: a1.id, outcome: 'nedovolano' }),
    /Tenhle kontakt teď nemáte přidělený \(zámek patří někomu jinému\)\. Načtěte si dalšího\./, 'výsledek hovoru jen se svým zámkem (migrace 015)');
  // stav z Albertova seznamu: cizí karta Volajícího stav nenese (od 20. 10. 2026, blok U)
  const puvodni = (await api.listKontakty(albert, { segment: 'architekt', limit: 1000 })).rows.find((r) => r.id === a1.id)?.status;
  await api.updateKontakt(albert, a1.id, { status: 'odmitnuto' });
  // ⚠ NAHRAZUJE „(stav odmitnuto)“ a „(odmitnuto)“ v textu chyby (migrace 046, dvě recenze 045 z 20. 10. 2026): chyba stav
  // neprozradí (karta Volajícího stav nenese)
  await chyba('C5', () => api.returnContact(petra, a1.id), new RegExp(`^Kontakt ${a1.id} už není ve frontě volání\\. Nic se nevrátilo\\.$`), 'kontakt mimo frontu se nevrací');
  await chyba('D2', () => api.resolveCall(petra, { kontakt_id: a1.id, outcome: 'nedovolano' }),
    /^Kontakt už není ve frontě volání, váš zámek na něj tedy neplatí\. Načtěte si dalšího\.$/, 'výsledek hovoru jen u volatelného stavu (migrace 015)');
  await api.updateKontakt(albert, a1.id, { status: puvodni });
  const vr2 = await api.returnContact(petra, a1.id);
  over('C6', vr2.ok === true, 'po obnově stavu jde kontakt vrátit');
  const a2 = await api.nextContact(honza, 'architekt');
  over('C6b', !!a2 && a2.segment === 'architekt', 'vrácený architekt je hned k dispozici ostatním');
  await api.returnContact(honza, a2.id);

  await chyba('B3', () => api.nextContact(petra, 'xyz'), /Neplatný segment: xyz\. Povolené: chata, architekt\./, 'nextContact s neznámým segmentem skončí chybou');
  await chyba('B3b', () => api.nextContact(petra, null), /Neplatný segment: \(nic\)/, 'nextContact s výslovným null skončí chybou jako server');

  // vyčerpat frontu architektů: jen architekti a jen ti tři volatelní
  const vzati = [];
  for (let i = 0; i < 10; i++) {
    const a = await api.nextContact(petra, 'architekt');
    if (!a) break;
    vzati.push(a);
    await api.resolveCall(petra, { kontakt_id: a.id, outcome: 'nedovolano' });
  }
  over('B4', vzati.length === 3 && vzati.every((a) => a.segment === 'architekt'), 'fronta architektů = 300, 301, 302 a nic jiného', vzati.map((a) => a.id).join());
  over('B4b', (await api.nextContact(petra, 'architekt')) === null, 'obvolaní architekti = prázdná fronta architektů');
  const c2 = await api.nextContact(petra, 'chata');
  over('B5', !!c2 && seg(c2) === 'chata', 'prázdná fronta architektů neovlivní chaty');
  const chaty = [c2];
  await api.resolveCall(petra, { kontakt_id: c2.id, outcome: 'nedovolano' });
  for (let i = 0; i < 20; i++) {
    const c = await api.nextContact(petra, 'chata');
    if (!c) break;
    chaty.push(c);
    await api.resolveCall(petra, { kontakt_id: c.id, outcome: 'nedovolano' });
  }
  over('B6', chaty.every((c) => seg(c) === 'chata'), 'fronta chat nikdy nedá architekta', chaty.map((c) => c.id).join());
  over('B6b', (await api.nextContact(petra)) === null, 'obvolané chaty = prázdná fronta chat');
});

/* ---------------- F) update_kontakt (2.2 g) ---------------- */
await blok('F', async () => {
  const u1 = await api.updateKontakt(albert, 300, { ico_firma: '2222 2222', firma: '  Nový ateliér  ', mesto: '' });
  over('F1', u1.ico_firma === '22222222' && u1.firma === 'Nový ateliér' && u1.mesto === null, 'update_kontakt normalizuje pole architekta jako server',
    `${u1.ico_firma}|${u1.firma}|${u1.mesto}`);
  await chyba('F2', () => api.updateKontakt(albert, 300, { ico_osobni: '123' }), /kontakty_ico_osobni_check/, 'osobní IČO musí mít 8 číslic');
  await chyba('F3', () => api.updateKontakt(albert, 300, { dph_osobni: 'mozna' }), /kontakty_dph_osobni_check/, 'DPH jen ze čtyř hodnot');
  await chyba('F4', () => api.updateKontakt(albert, 1, { firma: 'Ateliér' }), /kontakty_architekt_pole_check/, 'chata nesmí dostat pole architekta');
  await chyba('F5', () => api.updateKontakt(albert, 300, { segment: 'chata' }), /Pole "segment" nelze měnit přes update_kontakt/, 'segment appka nemění');
  await chyba('F6', () => api.updateKontakt(albert, 300, { zdroj_telefonu: 'jiny' }), /Pole "zdroj_telefonu" nelze měnit přes update_kontakt/, 'zdroj telefonu nastavuje jen import');
  await chyba('F7', () => api.updateKontakt(eva, 300, { firma: 'X' }), /Tohle není váš klient/, 'pole architekta upravuje jen ten, kdo smí');
});

/* ---------------- G) telefonní čísla oddělená čárkou i středníkem ---------------- */
await blok('G', async () => {
  const el = PhoneLinks({ phone: '+420 999 000 300; +420 999 000 310, +420 999 000 320' });
  const deti = [].concat(el?.props?.children ?? []);
  const odkazy = deti.filter((d) => d && d.props && String(d.props.href).startsWith('tel:'));
  over('G1', odkazy.length === 3, 'PhoneLinks dělí čísla podle , i ;', `${odkazy.length} odkazů`);
  over('G2', odkazy.every((d) => !/[;,\s]/.test(d.props.href)), 'tel: odkaz nemá mezery ani oddělovač', odkazy.map((d) => d.props.href).join('|'));
  const jedno = PhoneLinks({ phone: '+420 606 100 100' });
  over('G3', [].concat(jedno?.props?.children ?? []).length === 1, 'jedno číslo = jeden odkaz');
});

/* ---------------- I) next_contact na serveru bez migrace 028 (supabase.ts) ---------------- */
// Podstrčený fetch: žádné volání neodejde po síti; adresa v localStorage není živá.
await blok('I', async () => {
  uloziste.set('volacka_supabase_url', 'http://127.0.0.1:9');
  uloziste.set('volacka_anon_key', 'test-klic');
  const puvodniFetch = globalThis.fetch;
  const odeslano = [];
  let odpovedi = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    odeslano.push({ url: String(url), body });
    const f = odpovedi.shift();
    if (!f) throw new Error(`test: nečekané volání ${url}`);
    const { status, telo } = f(body);
    return new Response(typeof telo === 'string' ? telo : JSON.stringify(telo), { status });
  };
  // skutečný tvar odpovědi PostgREST, když funkce s těmi parametry neexistuje (HTTP 404)
  const chybiFunkce = () => ({
    status: 404,
    telo: {
      code: 'PGRST202',
      details: 'Searched for the function public.next_contact with parameters p_segment, p_token or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.',
      hint: 'Perhaps you meant to call the function public.next_contact(p_token)',
      message: 'Could not find the function public.next_contact(p_segment, p_token) in the schema cache',
    },
  });
  const karta = { id: 7, name: 'Chata U Testu', segment: 'chata' };
  const znovu = async (fn) => {
    try {
      return { v: await fn() };
    } catch (e) {
      return { e: String(e && e.message) };
    }
  };
  try {
    odpovedi = [() => ({ status: 200, telo: { id: 300, segment: 'architekt' } })];
    const a = await znovu(() => supabaseApi.nextContact('tok', 'architekt'));
    over('I1', a.v?.id === 300 && odeslano.length === 1 && odeslano[0].body.p_segment === 'architekt' && /\/rpc\/next_contact$/.test(odeslano[0].url),
      'next_contact posílá p_segment', JSON.stringify(odeslano));
    over('I1b', !odeslano[0].url.includes('supabase.co'), 'test nevolá živou adresu', odeslano[0].url);

    odeslano.length = 0;
    odpovedi = [chybiFunkce, (body) => ({ status: 200, telo: Object.keys(body).join() === 'p_token' ? karta : null })];
    const c = await znovu(() => supabaseApi.nextContact('tok', 'chata'));
    over('I2', c.v?.id === 7, 'chaty na serveru bez 028: druhý pokus jen s p_token vrátí kartu (volání chat nestojí)', JSON.stringify(c));
    over('I2b', odeslano.length === 2 && JSON.stringify(odeslano[1].body) === JSON.stringify({ p_token: 'tok' }), 'druhý pokus posílá jen p_token',
      JSON.stringify(odeslano.map((o) => o.body)));

    odeslano.length = 0;
    odpovedi = [chybiFunkce, () => ({ status: 200, telo: karta })];
    const ar = await znovu(() => supabaseApi.nextContact('tok', 'architekt'));
    over('I3', ar.e !== undefined && odeslano.length === 1, 'architekti na serveru bez 028: žádný druhý pokus (dostali by chatu)', JSON.stringify({ ar, n: odeslano.length }));
    over('I3b', /architekt/i.test(ar.e ?? '') && /028/.test(ar.e ?? ''), 'architekti na serveru bez 028: česká hláška, že server architekty ještě neumí', ar.e);

    odeslano.length = 0;
    odpovedi = [() => ({ status: 400, telo: { code: 'P0001', message: 'Neplatná relace. Přihlaste se znovu.' } }), () => ({ status: 200, telo: karta })];
    const r = await znovu(() => supabaseApi.nextContact('tok', 'chata'));
    over('I4', r.e === 'Neplatná relace. Přihlaste se znovu.' && odeslano.length === 1, 'jiná chyba serveru se neopakuje a projde beze změny', JSON.stringify({ r, n: odeslano.length }));

    odeslano.length = 0;
    odpovedi = [() => ({ status: 404, telo: 'not found' }), () => ({ status: 200, telo: karta })];
    const n = await znovu(() => supabaseApi.nextContact('tok', 'chata'));
    over('I5', n.e !== undefined && odeslano.length === 1, '404 bez kódu PGRST202 se neopakuje', JSON.stringify({ n, pocet: odeslano.length }));
  } finally {
    globalThis.fetch = puvodniFetch;
    uloziste.delete('volacka_supabase_url');
    uloziste.delete('volacka_anon_key');
  }
});

/* ---------------- J) osobní IČO cizího kontaktu v detailu ([ALBERT 28], 2.2 l) ---------------- */
// Řádek celý i se smi_upravit vrací jen oznacit_za_sveho (a karta ve volání). set_flag,
// clear_flag a update_kontakt osobní IČO tomu, kdo nesmí upravit, neposílají (028, 036);
// bezCizihoIco je pojistka pro oznacit_za_sveho a pro server před migrací 036.
await blok('J', async () => {
  const { bezCizihoIco } = segmentModul;
  const bezKlice = (r) => !Object.prototype.hasOwnProperty.call(r, 'ico_osobni');
  over('J0', typeof bezCizihoIco === 'function', 'segment.ts má bezCizihoIco');
  if (typeof bezCizihoIco !== 'function') return;
  const cizi = { id: 302, segment: 'architekt', ico_osobni: '11111111', dph_osobni: 'neplatce', smi_upravit: false };
  const b = bezCizihoIco(cizi);
  over('J1', bezKlice(b), 'řádek, který uživatel nesmí upravit, ztratí osobní IČO (klíč chybí jako v seznamu)');
  over('J1b', b.dph_osobni === 'neplatce' && b.id === 302 && cizi.ico_osobni === '11111111', 'ostatní pole zůstanou a vstup se nezmění');
  const svuj = { id: 300, ico_osobni: '11111111', smi_upravit: true };
  over('J2', bezCizihoIco(svuj).ico_osobni === '11111111', 'kdo smí upravit, osobní IČO dostane');
  over('J3', bezKlice(bezCizihoIco({ id: 1, ico_osobni: null })), 'bez smi_upravit se IČO taky schová');
  const seznam = { id: 301, smi_upravit: false };
  over('J4', bezCizihoIco(seznam) === seznam, 'řádek bez klíče (ze seznamu) projde beze změny');
  // přes mock: Mikuláš (super admin) nesmí upravit Petřina architekta 302, příznak ano
  const po = await api.setFlag(mikulas, 302, 'chybi_email', 'test J');
  over('J5', po.smi_upravit === false && bezKlice(po), 'set_flag osobní IČO tomu, kdo nesmí upravit, nepošle (jako server)');
  over('J6', bezKlice(bezCizihoIco(po)), 'po uložení příznaku zůstane osobní IČO cizího architekta skryté');
  // IČO ateliéru rovné osobnímu (032) bezCizihoIco schová taky, i s DPH ateliéru
  const zivn = { id: 302, ico_osobni: '11111111', ico_firma: '11111111', dph_firma: 'neplatce', firma: 'X', smi_upravit: false };
  const z = bezCizihoIco(zivn);
  over('J7', bezKlice(z) && !('ico_firma' in z) && !('dph_firma' in z) && z.firma === 'X', 'IČO ateliéru rovné osobnímu se v detailu schová s ním (032)');
  const jine = bezCizihoIco({ id: 300, ico_osobni: '11111111', ico_firma: '22222222', dph_firma: 'platce', smi_upravit: false });
  over('J7b', bezKlice(jine) && jine.ico_firma === '22222222' && jine.dph_firma === 'platce', 'jiné IČO ateliéru v detailu zůstává');
});

/* ---------------- M) zdroj telefonu v appce není (Albert 19. 10. 2026, migrace 043) ---------------- */
// ⚠ NAHRAZUJE blok „odkud máme číslo: věta pro hovor ve 2. osobě (audit APP-7)“ a [ALBERT 10]: zdroj čísla
// (dřív kontakty.zdroj_telefonu na kartě, v detailu a ve scénáři) appka nesmí ukázat nikde, ani Albertovi.
// Pojistka proti návratu: žádný soubor v src/ to slovo, popisek ani větu nezmiňuje (kontrola 104 v repu
// webdomov ten test pouští).
const ZAKAZANY_ZDROJ = /zdroj_?telefon|zdrojTelefon|ZDROJ_TELEFON|číslo máme z|číslo mám z/i;
function souborySrc(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? souborySrc(join(dir, e.name)) : [join(dir, e.name)]));
}
await blok('M', async () => {
  // ⚠ M0 až M2 měřily scénář architekta (tipArchitekt): box s tipy je od 19. 10. 2026 pryč (blok T níž).
  over('M3', !Object.keys(uiModul).some((k) => /zdroj/i.test(k)), 'ui.tsx nemá žádný popisek ani funkci zdroje čísla', Object.keys(uiModul).filter((k) => /zdroj/i.test(k)).join());
  const nalezy = souborySrc(join(ROOT, 'src')).flatMap((f) =>
    readFileSync(f, 'utf8').split('\n').map((r, i) => (ZAKAZANY_ZDROJ.test(r) ? `${f.slice(ROOT.length + 1)}:${i + 1}` : null)).filter(Boolean));
  over('M4', nalezy.length === 0, 'žádný soubor v src/ nezmiňuje zdroj telefonu (Albert 19. 10. 2026)', nalezy.slice(0, 5).join(' '));
  // fronta architektů je tu už obvolaná (blok BCD), měří se proto seznam: řádky jako ze serveru po 043
  const rows = (await api.listKontakty(albert, { segment: 'architekt', limit: 50 })).rows;
  over('M5', rows.length === 4 && rows.every((r) => !('zdroj_telefonu' in r)), 'řádky architektů z mocku (jako server po 043) nenesou zdroj čísla (e-mailový email_zdroj se netýká)', `${rows.length} řádků`);
});

/* ---------------- T) box s tipy pro hovor ve volání není (Albert 19. 10. 2026) ---------------- */
// ⚠ NAHRAZUJE scénář architekta „Tip pro hovor“ pod tlačítky výsledku (docs/ARCHITEKTI.md 9.4, src/tipArchitekt.ts,
// audit APP-7 a revize 28. 9.): Albert chce blok dole ve volání úplně pryč, u architektů i u chat (tam nikdy nebyl).
// Pojistka proti návratu: soubor scénáře neexistuje, žádný soubor v src/ nemá třídu boxu ani jeho nadpis a nikdo
// neimportuje tipArchitekt (kontrola 104 v repu webdomov ten blok čte).
const ZAKAZANY_TIP = /call-hint|tipArchitekt|Tip pro hovor|TIP PRO HOVOR/;
await blok('T', async () => {
  over('T1', !existsSync(join(ROOT, 'src/tipArchitekt.ts')), 'src/tipArchitekt.ts (scénář pro hovor) neexistuje');
  const nalezy = souborySrc(join(ROOT, 'src')).flatMap((f) =>
    readFileSync(f, 'utf8').split('\n').map((r, i) => (ZAKAZANY_TIP.test(r) ? `${f.slice(ROOT.length + 1)}:${i + 1}` : null)).filter(Boolean));
  over('T2', nalezy.length === 0, 'žádný soubor v src/ nemá box s tipy pro hovor (call-hint, tipArchitekt, nadpis)', nalezy.slice(0, 5).join(' '));
  const call = readFileSync(join(ROOT, 'src/pages/CallPage.tsx'), 'utf8');
  over('T3', !/<details\b/.test(call), 'CallPage nemá žádný rozbalovací box (<details>) pod tlačítky výsledku');
});

/* ---------------- N) vytočené číslo dělá kartu rozdělanou (audit APP-3) ---------------- */
await blok('N', async () => {
  const klik = () => {};
  const el = PhoneLinks({ phone: '+420 999 000 300; +420 999 000 310', onDial: klik });
  const odkazy = [].concat(el?.props?.children ?? []).filter((d) => d && d.props && String(d.props.href).startsWith('tel:'));
  over('N1', odkazy.length === 2 && odkazy.every((d) => d.props.onClick === klik), 'každý tel: odkaz zavolá onDial', odkazy.map((d) => typeof d.props.onClick).join());
  const bez = PhoneLinks({ phone: '+420 606 100 100' });
  over('N2', [].concat(bez?.props?.children ?? []).every((d) => d.props.onClick === undefined), 'bez onDial odkaz nic navíc nedělá (detail kontaktu)');
  const zdroj = readFileSync(join(ROOT, 'src/pages/CallPage.tsx'), 'utf8');
  const rozdelano = /const rozdelano\s*=\s*([^;]+);/.exec(zdroj);
  over('N3', !!rozdelano && /\bvytoceno\b/.test(rozdelano[1]), 'karta je rozdělaná i po kliknutí na číslo (vytoceno)', rozdelano && rozdelano[1]);
  over('N4', /<PhoneLinks[^>]*onDial=/.test(zdroj), 'karta ve volání předává PhoneLinks onDial');
});

/* ---------------- K) loadNext v CallPage: závislosti bez segmentu (9.1, kontrola 75) ---------------- */
// Segment v závislostech loadNext by při každém kliku na přepínač vzal novou kartu a starou
// nechal zamčenou 2 h. Měří se zdroják; chování měří tests/demo-e2e.mjs (V4).
function zavislostiNextContact(zdroj) {
  const konec = (s, i) => {
    let h = 0;
    for (; i < s.length; i++) {
      if (s.startsWith('//', i)) { i = s.indexOf('\n', i); if (i < 0) return -1; continue; }
      if (s.startsWith('/*', i)) { i = s.indexOf('*/', i + 2); if (i < 0) return -1; i += 1; continue; }
      const c = s[i];
      if (c === "'" || c === '"' || c === '`') {
        let j = i + 1;
        while (j < s.length && s[j] !== c) j += s[j] === '\\' ? 2 : 1;
        i = j;
        continue;
      }
      if ('([{'.includes(c)) h += 1;
      else if (')]}'.includes(c) && --h === 0) return i;
    }
    return -1;
  };
  const vysledky = [];
  for (const m of zdroj.matchAll(/useCallback\s*\(/g)) {
    const zac = m.index + m[0].length - 1;
    const kon = konec(zdroj, zac);
    if (kon < 0) continue;
    const telo = zdroj.slice(zac + 1, kon);
    if (!telo.includes('nextContact(')) continue;
    const d = /,\s*\[([^[\]]*)\]\s*,?\s*$/.exec(telo);
    vysledky.push(d ? d[1].split(',').map((x) => x.trim()).filter(Boolean) : null);
  }
  return vysledky;
}
await blok('K', async () => {
  const spravne = (v) => v.length > 0 && v.every((d) => JSON.stringify(d) === JSON.stringify(['session.token', 'session.user_id']));
  const z = zavislostiNextContact(readFileSync(join(ROOT, 'src/pages/CallPage.tsx'), 'utf8'));
  over('K1', spravne(z), 'loadNext (useCallback s nextContact) má závislosti přesně [session.token, session.user_id]', JSON.stringify(z));
  // negativní testy jiným tvarem, než jak přemýšlí detektor
  const vadny = `const nacti = useCallback(\n  async () => {\n    await getApi().nextContact(session.token, vybrany); // ", [x]"\n  },\n  [\n    session.token,\n    vybrany,\n    session.user_id,\n  ]\n);`;
  over('K2', !spravne(zavislostiNextContact(vadny)), 'detektor chytí segment v závislostech zapsaných na víc řádků');
  const bez = `const nacti = useCallback(async () => { await getApi().nextContact(session.token, s); });`;
  over('K3', !spravne(zavislostiNextContact(bez)), 'detektor chytí useCallback bez závislostí');
  const dobry = `const loadNext = useCallback(async () => {\n  const x = '[a, b]'; await getApi().nextContact(session.token, segmentRef.current);\n}, [session.token, session.user_id]);`;
  over('K4', spravne(zavislostiNextContact(dobry)), 'detektor nechá správné závislosti (i s hranatými závorkami v řetězci)');
});

if (chyby === 0) {
  console.log(`ALL OK (${pocet} kontrol)`);
  process.exit(0);
}
console.log(`CHYB: ${chyby} z ${pocet}`);
process.exit(1);
