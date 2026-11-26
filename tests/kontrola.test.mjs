// Test chování: kontrola odpovědí (migrace 083, Albert 26. 11. 2026: „there should be like a tick box which super admin can
// tick … it doesn't reply by itself. It creates the reply, but it doesn't send it, and instead it waits for the super admin
// to review the email … an easy approve button, and then there's like a text box for a note“).
//
// Měří čisté pomocníky (src/kontrola.ts: tlačítka, věty pod kartou, popis přepínače, karta místo bubliny), demo mock (jen
// super admin, kdo smí měnit, schválení, vrácení s poznámkou do vlákna, vypnutí zruší čekající návrhy), co src/api/supabase.ts
// posílá serveru (fetch je podstrčený, nic nejde po síti) a zapojení v detailu klienta a ve Zprávách. Pravidla na serveru
// měří db/tests/test_083_kontrola_odpovedi.sql. Nikdy nesahá na živou DB. Spuštění:
//   node tests/kontrola.test.mjs            (kořen appky = složka nad tests/)
//   APP_ROOT=/cesta/ke/kopii node tests/kontrola.test.mjs   (mutace v kopii)
// Výsledek: řádek „ALL OK (N kontrol)“, jinak řádky „FAIL <id>: <česky> (…)“ a kód 1.

import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(process.env.APP_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..'));

const uloziste = new Map([['volacka_supabase_url', 'https://test.example.invalid'], ['volacka_anon_key', 'test-klic']]);
globalThis.localStorage = {
  getItem: (k) => (uloziste.has(k) ? uloziste.get(k) : null),
  setItem: (k, v) => uloziste.set(k, String(v)),
  removeItem: (k) => uloziste.delete(k),
  get length() { return uloziste.size; },
  key: (i) => [...uloziste.keys()][i] ?? null,
};
const puvodniTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, _ms, ...a) => puvodniTimeout(fn, 0, ...a);
const odeslano = [];
globalThis.fetch = async (url, init) => {
  odeslano.push({ url: String(url), body: JSON.parse(init?.body ?? '{}') });
  return new Response('{"kontakt_id": 9, "zapnuto": false, "navrhy": []}', { status: 200, headers: { 'Content-Type': 'application/json' } });
};
// háček demo zkoušky: mock do něj dá kontrolaNavrh (automatizace uloží e-mail ke schválení) a kontrolaStav
globalThis.__volackaDemoTest = { volani: [], zpozdeni: () => 0 };

let bundle;
{
  const out = await build({
    stdin: {
      contents: [
        "export * as K from './src/kontrola.ts';",
        "export { mockApi } from './src/api/mock.ts';",
        "export { supabaseApi } from './src/api/supabase.ts';",
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
  const dir = mkdtempSync(join(tmpdir(), 'kontrola-test-'));
  const f = join(dir, 'b.cjs');
  writeFileSync(f, out.outputFiles[0].text);
  bundle = createRequire(import.meta.url)(f);
  rmSync(dir, { recursive: true, force: true });
}
const { K, mockApi, supabaseApi } = bundle;
const hacek = globalThis.__volackaDemoTest;

let pocet = 0;
let chyby = 0;
function over(id, podminka, text, detail = '') {
  pocet += 1;
  if (!podminka) {
    chyby += 1;
    console.log(`FAIL ${id}: ${text}${detail ? ` (${detail})` : ''}`);
  }
}
async function chyba(fn) {
  try {
    await fn();
    return '';
  } catch (e) {
    return String(e && e.message);
  }
}
const cti = (soubor) => readFileSync(join(ROOT, soubor), 'utf8');

// --- pomocníci
const zaklad = {
  id: 7, kontakt_id: 9, stav: 'ceka', stav_text: 'čeká na schválení', druh: 'odpoved', komu: 'a@example.cz', predmet: 'Re: Web',
  telo: 'Dobrý den', priloha_nazev: null, chat_thread_id: 2, zadost_zprava_id: 50, vytvoreno: '2026-11-26T08:41:00Z',
  pripominek: 0, pripomenuto_at: null, rozhodl: null, rozhodnuto_at: null, poznamka: null, odeslat_po: null, odeslano_at: null,
  duvod: null, nahrazen_id: null, nahrazuje_id: null, zastaraly: false, smi_rozhodnout: true,
};
over('k1', JSON.stringify(K.navrhTlacitka(zaklad)) === '{"schvalit":true,"vratit":true}', 'čekající návrh má obě tlačítka');
over('k2', JSON.stringify(K.navrhTlacitka({ ...zaklad, zastaraly: true })) === '{"schvalit":false,"vratit":true}', 'zastaralý návrh jde jen vrátit');
over('k3', JSON.stringify(K.navrhTlacitka({ ...zaklad, smi_rozhodnout: false })) === '{"schvalit":false,"vratit":false}', 'kdo nesmí rozhodnout, nemá tlačítka');
over('k4', JSON.stringify(K.navrhTlacitka({ ...zaklad, stav: 'schvaleno' })) === '{"schvalit":false,"vratit":false}', 'rozhodnutý návrh nemá tlačítka');
over('k5', K.navrhVysledek({ ...zaklad, stav: 'odeslano', rozhodl: 'Mikuláš', rozhodnuto_at: '2026-11-26T13:05:00Z', odeslano_at: '2026-11-26T13:12:00Z' })
  === 'Schválil/a Mikuláš 26. 11. 2026 14:05. Odesláno 26. 11. 2026 14:12.', 'věta pod odeslaným návrhem: kdo, kdy, odesláno',
  K.navrhVysledek({ ...zaklad, stav: 'odeslano', rozhodl: 'Mikuláš', rozhodnuto_at: '2026-11-26T13:05:00Z', odeslano_at: '2026-11-26T13:12:00Z' }));
over('k6', /odejde sám nejdřív/.test(K.navrhVysledek({ ...zaklad, stav: 'schvaleno', rozhodl: 'Albert', rozhodnuto_at: '2026-11-26T10:00:00Z',
  odeslat_po: new Date(Date.now() + 20 * 3600e3).toISOString(), duvod: 'brána tří dnů' })), 'odložený schválený návrh říká, kdy odejde');
over('k7', /Vrátil\/a Mikuláš .* s poznámkou: „Bez ceny“/.test(K.navrhVysledek({ ...zaklad, stav: 'vraceno', rozhodl: 'Mikuláš',
  rozhodnuto_at: '2026-11-26T10:00:00Z', poznamka: 'Bez ceny' })), 'vrácený návrh ukazuje poznámku');
over('k8', K.navrhProZpravu([zaklad], { id: 50 })?.id === 7 && K.navrhProZpravu([zaklad], { id: 51 }) === undefined
  && K.navrhProZpravu(undefined, { id: 50 }) === undefined, 'karta jen u zprávy, která je žádostí o schválení');
over('k9', /Zapnul\/a Mikuláš 26\. 11\. 2026 9:41 · čeká na schválení: 1/.test(K.kontrolaPopis({ kontakt_id: 9, zapnuto: true, zapnul: 'Mikuláš',
  zapnul_id: 4, zapnuto_at: '2026-11-26T08:41:00Z', duvod: null, smi_menit: true, cekajici: 1, navrhy: [] })), 'popis zapnuté kontroly: kdo, kdy, kolik čeká');

// --- migrace 085: pozastavení v popisu a kdo smí rozhodovat
over('k10', /^Pozastaveno podle pokynu Mikuláš \(26\. 11\. 2026 17:05\), předtím Návrh odeslán\. Zapnul\/a Mikuláš/.test(K.kontrolaPopis({ kontakt_id: 9,
  zapnuto: true, zapnul: 'Mikuláš', zapnul_id: 4, zapnuto_at: '2026-11-26T16:05:00Z', duvod: null, smi_menit: true, cekajici: 0, navrhy: [],
  pozastaveno: true, pozastaveno_at: '2026-11-26T16:05:00Z', stav_pred: 'navrh_odeslan' }, (s) => (s === 'navrh_odeslan' ? 'Návrh odeslán' : s))),
  'popis pozastaveného klienta: podle čího pokynu, kdy a předchozí stav');
over('k11', K.kontrolaPravo({ zapnuto: true, zapnul: 'Kryštof' }) === 'Vypnout ji a schvalovat smí jen Kryštof, Mikuláš nebo Albert.'
  && K.kontrolaPravo({ zapnuto: true, zapnul: 'Mikuláš' }) === 'Vypnout ji a schvalovat smí jen Mikuláš nebo Albert.'
  && /Zapnout ji smí super admin/.test(K.kontrolaPravo({ zapnuto: false, zapnul: null })), 'kdo smí vypnout a schvalovat: schvalovatel, Mikuláš, Albert bez opakování');

// --- demo mock
const A = 'demo-1-test', P = 'demo-2-test';
over('m1', /vidí jen super admin/.test(await chyba(() => mockApi.kontrolaDetail(P, 9))), 'Volající nevidí kontrolu odpovědí');
over('m2', /smí zapnout nebo vypnout jen super admin/.test(await chyba(() => mockApi.kontrolaNastav(P, 9, true))), 'Volající kontrolu nezapne');
let d = await mockApi.kontrolaNastav(A, 9, true);
over('m3', d.zapnuto === true && d.zapnul === 'Albert' && d.smi_menit === true, 'super admin s právem kontrolu zapnul', JSON.stringify(d));
over('m4', hacek.kontrolaNavrh(999) === null, 'u kontaktu bez kontroly se návrh neuloží');
const n1 = hacek.kontrolaNavrh(9, 'Re: Návrh webu', 'Dobrý den,\n\nupravený návrh.');
d = await mockApi.kontrolaDetail(A, 9);
const v1 = d.navrhy.find((n) => n.id === n1);
over('m5', v1?.stav === 'ceka' && v1.smi_rozhodnout === true && d.cekajici === 1, 'uložený návrh čeká a super admin smí rozhodnout', JSON.stringify(d.navrhy));
const t1 = await mockApi.getThread(A, v1.chat_thread_id);
const zadost = t1.messages.find((m) => m.id === v1.zadost_zprava_id);
over('m6', t1.thread.status === 'open' && zadost?.sender_name === 'Kontrola odpovědí' && /^KE SCHVÁLENÍ: návrh e-mailu #\d+\./.test(zadost.body)
  && zadost.body.includes('upravený návrh.'), 'žádost o schválení je ve vlákně kontaktu s celým textem a vlákno je otevřené');
over('m7', /schvaluje jen super admin/.test(await chyba(() => mockApi.navrhSchvalit(P, n1))), 'Volající návrh neschválí');
const s1 = await mockApi.navrhSchvalit(A, n1);
over('m8', s1.stav === 'schvaleno' && s1.rozhodl === 'Albert' && s1.odeslat_po, 'schválení zapíše stav, kdo a kdy odeslat', JSON.stringify(s1));
over('m9', /už není ke schválení \(schváleno\)/.test(await chyba(() => mockApi.navrhSchvalit(A, n1))), 'návrh nejde schválit dvakrát');
const n2 = hacek.kontrolaNavrh(9, 'Re: Cena', 'Druhý návrh.');
over('m10', /Napiš, co má agent v e-mailu změnit/.test(await chyba(() => mockApi.navrhVratit(A, n2, '   '))), 'vrácení bez poznámky nejde');
const r2 = await mockApi.navrhVratit(A, n2, 'Bez ceny prosím');
const t2 = await mockApi.getThread(A, r2.chat_thread_id);
over('m11', r2.stav === 'vraceno' && t2.messages.some((m) => m.sender_type === 'admin' && m.sender_name === 'Albert'
  && m.body === `Vráceno k úpravě (návrh e-mailu #${n2}): Bez ceny prosím`), 'vrácení dá do vlákna zprávu člověka s poznámkou');
const n3 = hacek.kontrolaNavrh(9, 'Re: Třetí', 'Třetí návrh.');
const n4 = hacek.kontrolaNavrh(9, 'Re: Čtvrtý', 'Čtvrtý návrh.');
d = await mockApi.kontrolaDetail(A, 9);
over('m12', d.navrhy.find((n) => n.id === n3)?.stav === 'nahrazeno' && d.navrhy.find((n) => n.id === n3)?.nahrazen_id === n4,
  'novější návrh pro tytéž adresy starší nahradí');
d = await mockApi.kontrolaNastav(A, 9, false);
const t3 = await mockApi.getThread(A, d.navrhy[0].chat_thread_id);
over('m13', d.zapnuto === false && d.navrhy.find((n) => n.id === n4)?.stav === 'zruseno' && d.navrhy.find((n) => n.id === n1)?.stav === 'nahrazeno'
  && t3.messages.some((m) => m.sender_name === 'Kontrola odpovědí' && /^Kontrola odpovědí vypnuta \(Albert, /.test(m.body)),
  'vypnutí zruší čekající návrh a napíše to do vlákna (schválený neodeslaný už nahradil novější)', JSON.stringify(d.navrhy.map((n) => [n.id, n.stav])));
over('m14', hacek.kontrolaNavrh(9) === null, 'po vypnutí se nic neukládá');

// --- co appka posílá serveru
odeslano.length = 0;
await supabaseApi.kontrolaDetail('tok', 9);
await supabaseApi.kontrolaNastav('tok', 9, true);
await supabaseApi.navrhSchvalit('tok', 12);
await supabaseApi.navrhVratit('tok', 12, 'Bez ceny');
const fn = odeslano.map((o) => o.url.replace(/^.*\/rest\/v1\/rpc\//, ''));
over('s1', JSON.stringify(fn) === JSON.stringify(['kontrola_odpovedi_detail', 'kontrola_odpovedi_nastav', 'kontrola_navrh_schvalit', 'kontrola_navrh_vratit']),
  'appka volá čtyři RPC kontroly odpovědí', JSON.stringify(fn));
over('s2', JSON.stringify(odeslano.map((o) => o.body)) === JSON.stringify([
  { p_token: 'tok', p_kontakt_id: 9 }, { p_token: 'tok', p_kontakt_id: 9, p_zapnout: true },
  { p_token: 'tok', p_navrh_id: 12 }, { p_token: 'tok', p_navrh_id: 12, p_poznamka: 'Bez ceny' }]), 'parametry RPC sedí s migrací 083',
  JSON.stringify(odeslano.map((o) => o.body)));

// --- zapojení
const drawer = cti('src/components/KontaktDrawer.tsx');
const zpravy = cti('src/pages/ZpravyPage.tsx');
const komp = cti('src/components/KontrolaOdpovedi.tsx');
over('z1', /<KontrolaOdpovediPanel kontrola=\{kontrola\} kontaktId=\{kontakt\.id\} \/>/.test(drawer) && /navrhy=\{kontrola\.data\?\.navrhy\}/.test(drawer),
  'detail klienta má přepínač a karty návrhů ve vzkazech agentovi');
over('z2', /navrhProZpravu\(kontrola\.data\?\.navrhy, m\)/.test(zpravy) && /<NavrhKarta/.test(zpravy), 'Zprávy ukazují kartu návrhu místo žádosti');
over('z3', /if \(!kontrola\.jaSuper\) return null;/.test(komp) && /isSuperAdmin\(session\.role\)/.test(komp), 'přepínač a načtení jen pro super admina');
over('z4', /Schválit a odeslat/.test(komp) && /Vrátit s poznámkou/.test(komp) && /Co má agent v e-mailu změnit…/.test(komp), 'karta má tlačítka a pole na poznámku');

console.log(chyby ? `SOME FAILED (${chyby} z ${pocet})` : `ALL OK (${pocet} kontrol)`);
process.exit(chyby ? 1 : 0);
