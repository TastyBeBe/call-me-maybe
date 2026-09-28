// Test chování: segment chaty / architekti v appce (docs/ARCHITEKTI.md, oddíl 9, migrace 028).
//
// Měří DEMO mock (src/api/mock.ts), který musí zrcadlit server, a src/segment.ts. Nikdy nesahá
// na živou DB: bere jen soubory v src/, žádný fetch. Spuštění:
//   node tests/segment.test.mjs            (kořen appky = složka nad tests/)
//   APP_ROOT=/cesta/ke/kopii node tests/segment.test.mjs   (mutace v kopii)
// Výsledek: řádek „ALL OK (N kontrol)", jinak řádky „FAIL <id>: <česky> (…)" a kód 1.

import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
        "export { mockApi } from './src/api/mock.ts';",
        "export { loadCallSegment, saveCallSegment, segmentOf } from './src/segment.ts';",
        "export { PhoneLinks } from './src/ui.tsx';",
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
const { mockApi: api, loadCallSegment, saveCallSegment, segmentOf, PhoneLinks } = bundle;

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
const petra = (await api.login('petra', 'volam')).token;   // volající pod Albertem
const honza = (await api.login('honza', 'volam')).token;   // volající pod Mikulášem
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
  over('E6', radekPetra.length === 4 && radekPetra.every((r) => !Object.prototype.hasOwnProperty.call(r, 'ico_osobni')),
    'volající nedostane v seznamu osobní IČO (klíč chybí jako u serveru)');
  over('E6b', radekPetra.find((r) => r.id === 300)?.ico_firma === '22222222', 'IČO studia v seznamu zůstává');
  const radekAlbert = (await api.listKontakty(albert, { segment: 'architekt', limit: 50 })).rows;
  over('E6c', radekAlbert.find((r) => r.id === 300)?.ico_osobni === '11111111', 'kdo smí upravit, vidí osobní IČO i v seznamu');
  const radekEva = (await api.listKontakty(eva, { segment: 'architekt', limit: 50 })).rows;
  over('E6d', radekEva.every((r) => r.smi_upravit === true || !Object.prototype.hasOwnProperty.call(r, 'ico_osobni')),
    'admin vidí osobní IČO jen u kontaktů, které smí upravit');
  const chataPetra = (await api.listKontakty(petra, { segment: 'chata', limit: 50 })).rows;
  over('E6e', chataPetra.every((r) => !Object.prototype.hasOwnProperty.call(r, 'ico_osobni')), 'maska platí i pro chaty (server odebírá klíč u každého řádku)');

  const mojeA = await api.myKontakty(petra, 2000, 0, null, 'architekt');
  over('E7', mojeA.total === 1 && mojeA.rows.length === 1 && mojeA.rows[0].id === 302, 'Moji klienti s filtrem architekti: Petra má 302', `total ${mojeA.total}`);
  over('E7b', !Object.prototype.hasOwnProperty.call(mojeA.rows[0] ?? {}, 'ico_osobni'), 'Moji klienti: osobní IČO jen pro toho, kdo smí upravit (volající ne)');
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

/* ---------------- B, C, D) fronta volání ---------------- */
await blok('BCD', async () => {
  const c1 = await api.nextContact(petra);
  over('B1', !!c1 && seg(c1) === 'chata', 'nextContact bez segmentu dá chatu (starý bundle)', c1 && `${c1.id} ${c1.segment}`);
  const vr = await api.returnContact(petra, c1.id);
  over('C1', vr && vr.ok === true && vr.kontakt_id === c1.id, 'vlastní čistá karta jde vrátit do fronty');
  const po = (await api.listKontakty(albert, { segment: 'chata', limit: 1000 })).rows.find((r) => r.id === c1.id);
  over('C1b', po && po.lock_by === null && po.lock_at === null && po.status === c1.status, 'po vrácení je kontakt odemčený a stav se nezměnil');

  const a1 = await api.nextContact(petra, 'architekt');
  over('B2', !!a1 && a1.segment === 'architekt' && [300, 301, 302].includes(a1.id), 'nextContact s architekt dá volatelného architekta', a1 && `${a1.id}`);
  over('H1', a1 && Object.prototype.hasOwnProperty.call(a1, 'ico_osobni'), 'karta ve volání nese řádek celý včetně osobního IČO');
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
  const puvodni = a1.status;
  await api.updateKontakt(albert, a1.id, { status: 'odmitnuto' });
  await chyba('C5', () => api.returnContact(petra, a1.id), new RegExp(`Kontakt ${a1.id} už není ve frontě volání \\(stav odmitnuto\\)\\. Nic se nevrátilo\\.`), 'kontakt mimo frontu se nevrací');
  await chyba('D2', () => api.resolveCall(petra, { kontakt_id: a1.id, outcome: 'nedovolano' }),
    /Kontakt už není ve stavu, který se uzavírá hovorem \(odmitnuto\)/, 'výsledek hovoru jen u volatelného stavu (migrace 015)');
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

if (chyby === 0) {
  console.log(`ALL OK (${pocet} kontrol)`);
  process.exit(0);
}
console.log(`CHYB: ${chyby} z ${pocet}`);
process.exit(1);
