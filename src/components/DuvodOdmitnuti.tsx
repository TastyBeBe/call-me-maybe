// VÝBĚR DŮVODU ODMÍTNUTÍ NÁVRHU (Přehled vedení, Albert 17. 11. 2026, rozhodnutí D8: „why did they reject the preview after they
// viewed it, not why they refused to see the preview in the first place“). Povinný výběr „Proč návrh odmítl“ s registrem důvodů
// (kontrakt §3.2, spec §3.7), u „Jiný důvod“ povinný text. Ptá se JEN u klienta, kterému odešel návrh (first_proposal_at):
// v okně Zavolal/a jsem u výsledku „Nechce web“ (DovolaniOkno), při změně stavu na Odmítnuto v detailu (KontaktDrawer)
// a u Odmítnuto ve volání (CallPage, klient s návrhem, který se vrátil do fronty). Odmítnutí ve studeném hovoru (klient bez
// návrhu) zůstává přesně jako dřív, bez otázky.
// Výsledek hovoru nebo změna stavu se uloží NAPŘED a beze změny, důvod jde druhým voláním hned po něm (odmitnuti_duvod_zapis,
// migrace 072). Když se důvod neuloží (server bez 072, výpadek), výsledek zůstává uložený a stránka jen řekne proč: ulozDuvod
// nikdy nehodí. Fáze: sleva u klienta ve stavu Nabídnuta sleva (odmítl i nabídku za polovinu), jinak nahled.
// Jen typy z ../api a nic z ../ui: balíček mocku v testech zůstane jeden (tests/pracovnicas.test.mjs).

import type { DuvodOdmitnutiKod, FazeOdmitnuti, Kontakt, KontaktStatus } from '../api/types';

export interface DuvodPolozka {
  kod: DuvodOdmitnutiKod;
  text: string;
}

/** Registr důvodů v pořadí a se štítky spec §3.7 (kontrakt §3.2). Mock (server) má týž v DUVODY_ODMITNUTI (test M14). */
export const DUVODY: readonly DuvodPolozka[] = [
  { kod: 'ma_web', text: 'Už má web nebo ho dělá někdo jiný' },
  { kod: 'cena', text: 'Je to pro něj drahé' },
  { kod: 'navrh', text: 'Nelíbí se mu návrh' },
  { kod: 'nepotrebuje', text: 'Web nepotřebuje' },
  { kod: 'pozdeji', text: 'Teď ne, možná později' },
  { kod: 'konci', text: 'Končí s podnikáním' },
  { kod: 'jine', text: 'Jiný důvod' },
  { kod: 'neuvedl', text: 'Neřekl proč' },
];

/** Nejvýš znaků textu u „Jiný důvod“ (jako server). */
export const DUVOD_TEXT_MAX = 450;

/** Fáze odmítnutí, jak ji vede přehled vedení (kontrakt §3.4). */
export const FAZE_POPIS: Record<FazeOdmitnuti, string> = {
  nahled: 'Odmítl náhled (návrh webu)',
  sleva: 'Odmítl nabídku za polovinu',
};

/** Začátek věty pro stránku, když se výsledek uložil a důvod ne (za ní hláška chyby). */
export const DUVOD_NEULOZEN = 'Důvod odmítnutí se ale neuložil:';

/** Co člověk ve výběru zvolil: důvod (null = ještě nic) a text (jen u Jiný důvod). */
export interface VolbaDuvodu {
  duvod: DuvodOdmitnutiKod | null;
  text: string;
}
export const PRAZDNA_VOLBA: VolbaDuvodu = { duvod: null, text: '' };

/**
 * Ptát se na důvod? Jen u klienta, kterému odešel návrh (first_proposal_at). Klient bez návrhu (studený hovor, zájem bez
 * náhledu) ani cizí kontakt Volajícího (klíč server neposílá) ne.
 */
export function chceDuvod(k: Partial<Pick<Kontakt, 'first_proposal_at'>> | null | undefined): boolean {
  return !!k?.first_proposal_at;
}

/** Fáze odmítnutí podle stavu klienta PŘED odmítnutím: sleva u Nabídnuté slevy, jinak nahled (server fázi se stavem nesrovnává). */
export function fazeOdmitnuti(status: KontaktStatus): FazeOdmitnuti {
  return status === 'sleva_nabidnuta' ? 'sleva' : 'nahled';
}

/** Text tak, jak ho uloží server: každý konec řádku (CR LF, CR, LF) jako mezera, bez mezer a tabulátorů na krajích, prázdný = null. */
export function textDuvodu(t: string | null | undefined): string | null {
  const v = String(t ?? '')
    .replace(/\r\n|[\r\n]/g, ' ')
    .replace(/^[ \t]+|[ \t]+$/g, '');
  return v === '' ? null : v;
}

/** Co ještě chybí, než jde výsledek uložit (null = nic). */
export function duvodChybi(v: VolbaDuvodu): string | null {
  if (!v.duvod) return 'Vyber, proč návrh odmítl.';
  if (v.duvod !== 'jine') return null;
  const t = textDuvodu(v.text);
  if (t === null) return 'Napiš, jaký jiný důvod klient řekl.';
  if ([...t].length > DUVOD_TEXT_MAX) return `Text důvodu je moc dlouhý: nejvýš ${DUVOD_TEXT_MAX} znaků.`;
  return null;
}

/** Co uložení potřebuje od API (getApi()). */
export interface DuvodApi {
  odmitnutiDuvodZapis(
    token: string,
    kontaktId: number,
    faze: FazeOdmitnuti,
    duvod: DuvodOdmitnutiKod,
    text?: string | null
  ): Promise<unknown>;
}

/**
 * Uloží důvod druhým voláním PO uloženém výsledku. Nikdy nehodí: vrátí null (uloženo, nebo nebylo co ukládat) nebo hlášku
 * chyby, kterou stránka připíše za DUVOD_NEULOZEN. Text jde jen u Jiný důvod.
 */
export async function ulozDuvod(
  api: DuvodApi,
  token: string,
  kontaktId: number,
  faze: FazeOdmitnuti,
  v: VolbaDuvodu
): Promise<string | null> {
  if (!v.duvod) return null;
  try {
    await api.odmitnutiDuvodZapis(token, kontaktId, faze, v.duvod, v.duvod === 'jine' ? textDuvodu(v.text) : null);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/**
 * Výběr „Proč návrh odmítl“ (povinný select s registrem) a u „Jiný důvod“ pole textu. `id` je předpona: `<id>-vyber`,
 * `<id>-text`. Stav drží stránka (volba, onVolba); co chybí, řekne duvodChybi (stránka podle něj vypne uložení).
 */
export default function DuvodOdmitnuti({
  faze,
  volba,
  onVolba,
  disabled = false,
  id = 'duvod-odmitnuti',
}: {
  faze: FazeOdmitnuti;
  volba: VolbaDuvodu;
  onVolba: (v: VolbaDuvodu) => void;
  disabled?: boolean;
  id?: string;
}) {
  // před výběrem stačí „Vyber důvod…“ a „(povinné)“ (uložení je vypnuté); věta, co chybí, až u Jiný důvod bez textu
  const chybi = volba.duvod === null ? null : duvodChybi(volba);
  const jine = volba.duvod === 'jine';
  const delka = [...(textDuvodu(volba.text) ?? '')].length;
  return (
    <div className="duvod-odmitnuti">
      <div className="field">
        <label htmlFor={`${id}-vyber`}>
          Proč návrh odmítl <span className="req">(povinné)</span>
        </label>
        <select
          id={`${id}-vyber`}
          required
          aria-required="true"
          aria-invalid={volba.duvod === null || undefined}
          aria-describedby={`${id}-faze`}
          value={volba.duvod ?? ''}
          disabled={disabled}
          onChange={(e) => onVolba({ ...volba, duvod: (e.target.value || null) as DuvodOdmitnutiKod | null })}
        >
          <option value="" disabled>
            Vyber důvod…
          </option>
          {DUVODY.map((d) => (
            <option key={d.kod} value={d.kod}>
              {d.text}
            </option>
          ))}
        </select>
        <p className="muted duvod-odmitnuti-faze" id={`${id}-faze`}>
          Zapíše se jako: {FAZE_POPIS[faze]}.
        </p>
      </div>
      {jine && (
        <div className="field duvod-odmitnuti-text">
          <label htmlFor={`${id}-text`}>
            Jaký jiný důvod <span className="req">(povinné)</span>
          </label>
          <textarea
            id={`${id}-text`}
            rows={2}
            maxLength={DUVOD_TEXT_MAX}
            required
            aria-required="true"
            aria-invalid={!!chybi || undefined}
            aria-describedby={`${id}-pocet${chybi ? ` ${id}-chybi` : ''}`}
            value={volba.text}
            disabled={disabled}
            placeholder="Třeba: web mu udělá synovec."
            onChange={(e) => onVolba({ ...volba, text: e.target.value })}
          />
          <span id={`${id}-pocet`} className={`zavolat-pocet ${delka > DUVOD_TEXT_MAX ? 'moc' : 'muted'}`}>
            {delka} / {DUVOD_TEXT_MAX}
          </span>
        </div>
      )}
      {chybi && (
        <p className="muted duvod-odmitnuti-chybi" id={`${id}-chybi`}>
          {chybi}
        </p>
      )}
    </div>
  );
}
