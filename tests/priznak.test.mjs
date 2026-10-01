// Test chování: e-mailový příznak po hovoru a nápověda k němu (migrace 005, vrácená migrací 029;
// revize 29. 9. 2026).
//
// Server: resolve_call ruší chybi_email a email_neoveren, když volající zapíše e-mail; appka ho
// posílá jen u zájmu. update_kontakt (e-mail zapsaný v DETAILU kontaktu) příznak NERUŠÍ.
// Proto nápověda na kartě hovoru (FLAG_HINTS) smí slíbit „zmizí sám", nápověda v detailu
// (flagHintDetail) ne (kontakt 978, 18. 9.: e-mail zapsaný v detailu, příznak zůstal).
// Měří DEMO mock (src/api/mock.ts, musí zrcadlit server) a texty v src/ui.tsx. Nikdy nesahá
// na živou DB. Spuštění:
//   node tests/priznak.test.mjs            (kořen appky = složka nad tests/)
//   APP_ROOT=/cesta/ke/kopii node tests/priznak.test.mjs   (mutace v kopii)
// Výsledek: řádek „ALL OK (N kontrol)", jinak řádky „FAIL <id>: <česky> (…)" a kód 1.

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
  setItem: (k, v) => { uloziste.set(k, String(v)); },
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
        "export { FLAG_HINTS, flagHintDetail, ALL_FLAGS } from './src/ui.tsx';",
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
  const dir = mkdtempSync(join(tmpdir(), 'priznak-test-'));
  const f = join(dir, 'b.cjs');
  writeFileSync(f, out.outputFiles[0].text);
  bundle = createRequire(import.meta.url)(f);
  rmSync(dir, { recursive: true, force: true });
}
const { mockApi: api, FLAG_HINTS, flagHintDetail, ALL_FLAGS } = bundle;

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
    over(id, false, 'blok testu spadl na nečekané chybě', String(e && e.message));
  }
}
// „zmizí sám", „zmizí sama", „se zruší sám" … jinými slovy než text v ui.tsx
const slibuje = (t) =>
  /zmiz\p{L}*\s+s[aá]m/iu.test(t) || /(?<!\p{L})(?!ne)\p{L}*zruš\p{L}*\s+s[aá]m/iu.test(t) || /s[aá]m\p{L}*\s+(?!ne)\p{L}*zmiz/iu.test(t);

/* ---------------- H) nápověda ---------------- */
await blok('H', async () => {
  const karta = FLAG_HINTS.chybi_email;
  const detail = flagHintDetail('chybi_email', false);
  const cteni = flagHintDetail('chybi_email', true);
  over('H1', slibuje(karta) && /ulož\w*\s+zájem/i.test(karta),
    'karta hovoru slibuje zmizení jen se zájmem (appka posílá e-mail jen u zájmu)', karta);
  over('H2', !slibuje(detail) && /Vyřešeno/.test(detail),
    'detail (admin) nesmí slibovat, že příznak zmizí sám, a musí poslat na tlačítko Vyřešeno', detail);
  over('H3', !slibuje(cteni) && !/Vyřešeno/.test(cteni),
    'detail (volající jen ke čtení) nesmí slibovat zmizení ani tlačítko, které nemá', cteni);
  for (const k of ALL_FLAGS) {
    if (k === 'chybi_email') continue;
    over('H4', flagHintDetail(k, false) === FLAG_HINTS[k] && flagHintDetail(k, true) === FLAG_HINTS[k],
      'ostatní příznaky mají v detailu stejnou nápovědu jako na kartě', k);
  }
  // detail kontaktu musí brát nápovědu z flagHintDetail, ne z FLAG_HINTS (tam je slib karty)
  const drawer = readFileSync(join(ROOT, 'src/components/KontaktDrawer.tsx'), 'utf8');
  over('H6', /flagHintDetail\(\s*kontakt\.flag_kind[^)]*,\s*readOnly\s*\)/.test(drawer) && !/FLAG_HINTS\s*\[/.test(drawer),
    'detail kontaktu ukazuje flagHintDetail(…, readOnly), ne FLAG_HINTS[…] ze karty hovoru');
  // negativní test detektoru jinými slovy
  over('H5', slibuje('Až ho zapíšeš, příznak zmizí sám.') && slibuje('Příznak se pak zruší sám.') && !slibuje('Příznak sám nezruší.'),
    'detektor slibu pozná „zmizí sám" i „zruší sám" a nechá „sám nezruší"');
});

/* ---------------- M) mock zrcadlí resolve_call z migrace 029 ---------------- */
const petra = (await api.login('petra', 'volam')).token;
const albert = (await api.login('admin', 'admin')).token;
const radek = async (id) => (await api.listKontakty(albert, { limit: 1000 })).rows.find((r) => r.id === id);
/** Vezme další kontakt z fronty (chaty, pak architekti), dá mu příznak a vrátí jeho id
 *  (zámek zůstává Petře). Mock má ve frontě šest kontaktů, test jich potřebuje pět. */
async function kontaktSPriznakem(kind) {
  const c = (await api.nextContact(petra, 'chata')) ?? (await api.nextContact(petra, 'architekt'));
  if (!c) throw new Error('fronta volání je prázdná');
  await api.setFlag(albert, c.id, kind, `TEST ${kind}`);
  return c.id;
}
const ZAJEM = { outcome: 'zajem', cena_web: '7000', cena_hosting: '190/měs', rating: 'A' };

await blok('M', async () => {
  const k1 = await kontaktSPriznakem('chybi_email');
  await api.resolveCall(petra, { kontakt_id: k1, ...ZAJEM, email: '  novy@example.invalid ' });
  let r = await radek(k1);
  over('M1', r && r.flag_kind === null && r.flag_note === null && r.flagged_at === null && r.flagged_by === null
    && r.email === 'novy@example.invalid' && r.status === 'zajem',
    'zájem se zapsaným e-mailem zruší chybi_email a zapíše oříznutý e-mail', r && `${r.flag_kind} ${r.email} ${r.status}`);

  const k2 = await kontaktSPriznakem('email_neoveren');
  await api.resolveCall(petra, { kontakt_id: k2, ...ZAJEM, email: 'overeny@example.invalid' });
  r = await radek(k2);
  over('M2', r && r.flag_kind === null, 'zájem s e-mailem zruší email_neoveren', r && r.flag_kind);

  const k3 = await kontaktSPriznakem('chybi_email');
  await api.resolveCall(petra, { kontakt_id: k3, ...ZAJEM, email: '   ' });
  r = await radek(k3);
  over('M3', r && r.flag_kind === 'chybi_email', 'e-mail jen z mezer příznak nezruší', r && r.flag_kind);

  const k4 = await kontaktSPriznakem('info_neoverene');
  await api.resolveCall(petra, { kontakt_id: k4, ...ZAJEM, email: 'info@example.invalid' });
  r = await radek(k4);
  over('M4', r && r.flag_kind === 'info_neoverene', 'zapsaný e-mail neruší jiný příznak', r && r.flag_kind);

  const k5 = await kontaktSPriznakem('email_neoveren');
  await api.resolveCall(petra, { kontakt_id: k5, outcome: 'nedovolano' });
  r = await radek(k5);
  over('M5', r && r.flag_kind === 'email_neoveren', 'hovor bez e-mailu příznak nezruší', r && r.flag_kind);

  // detail kontaktu: update_kontakt s novým e-mailem příznak NERUŠÍ (jako server); kontakt
  // z M1 je po zájmu mimo frontu, jako skoro každý kontakt s e-mailovým příznakem
  await api.setFlag(albert, k1, 'chybi_email', 'TEST návrh se odrazil');
  await api.updateKontakt(albert, k1, { email: 'detail@example.invalid' });
  r = await radek(k1);
  over('M6', r && r.flag_kind === 'chybi_email' && r.email === 'detail@example.invalid',
    'e-mail zapsaný v detailu (update_kontakt) příznak neruší — proto nápověda v detailu posílá na Vyřešeno', r && `${r.flag_kind} ${r.email}`);
});

if (chyby === 0) {
  console.log(`ALL OK (${pocet} kontrol)`);
  process.exit(0);
}
console.log(`CHYB: ${chyby} z ${pocet}`);
process.exit(1);
