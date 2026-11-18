// CSV ŘÁDKŮ PŘEHLEDU (Přehled vedení úkol 13, Albert 17. 11. 2026; spec docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md
// §7.2: „CSV: built from prehled_radky pages (cap 5 000 rows), cells starting with = + - @ prefixed with ', phone and e-mail
// masked“; kontrakt R20). Řádky Přehledu telefon ani e-mail nikdy nemají (server je neposílá); maska je pojistka pro text,
// kdyby se tam přece objevil (poznámka, jméno). Formát pro český Excel: středník mezi sloupci, desetinná čárka, CRLF; BOM přidá
// až stažení (ProklikPanel), funkce vrací čistý text. Jen logika bez Reactu.

import { prahaCas, prahaDen } from './praha';

export type TypSloupceCsv = 'text' | 'cislo' | 'castka' | 'datum' | 'cas' | 'odkaz';

export interface SloupecCsv {
  klic: string;
  nazev: string;
  /**
   * text (výchozí: maska a ochrana proti vzorcům), cislo, castka („7000.00“), datum (YYYY-MM-DD), cas (ISO → Praha), odkaz (náš
   * odkaz do Gmailu: adresa schránky v něm je naše, nemaskuje se, ochrana proti vzorcům ano)
   */
  typ?: TypSloupceCsv;
  /** hodnota z řádku (jinak radek[klic]) */
  hodnota?: (radek: Record<string, unknown>) => unknown;
}

export const CSV_ODDELOVAC = ';';
/** Strop řádků v jednom CSV (25 stránek po 200, kontrakt §5.15). */
export const CSV_MAX_RADKU = 5000;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
/** +420 731 000 123, 00420731000124, 601 111 222, 731000113 (devět číslic, volitelně předvolba); ne data, částky ani čísla faktur. */
const TELEFON = /(?:\+|\b00)\d{3}[ -]?\d{3}[ -]?\d{3}[ -]?\d{3}\b|\b\d{3}[ -]?\d{3}[ -]?\d{3}\b/g;
/** Začátek, který by tabulkový procesor vzal jako vzorec (OWASP CSV injection). */
const VZOREC = /^[=+\-@\t\r]/;

/** Telefon a e-mail v textu nahradí slovem (R20). */
export function maskujOsobni(text: string): string {
  return text.replace(EMAIL, '[e-mail skrytý]').replace(TELEFON, '[telefon skrytý]');
}

/** Uvozovky kolem buňky se středníkem, uvozovkou nebo novým řádkem (uvozovka zdvojená). */
function uvozovky(s: string): string {
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Jedna buňka: prázdná hodnota = prázdná buňka, čísla s desetinnou čárkou, text zamaskovaný a s apostrofem před vzorcem. */
export function bunkaCsv(v: unknown, typ: TypSloupceCsv = 'text'): string {
  if (v === null || v === undefined || v === '') return '';
  if (typ === 'castka' && /^-?\d+(\.\d+)?$/.test(String(v))) return String(v).replace('.', ',');
  if (typ === 'cislo' && typeof v === 'number' && Number.isFinite(v)) return String(v).replace('.', ',');
  if (typ === 'datum' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (typ === 'cas' && typeof v === 'string' && !Number.isNaN(Date.parse(v))) return `${prahaDen(v)} ${prahaCas(v)}`;
  let t = typeof v === 'boolean' ? (v ? 'ano' : 'ne') : Array.isArray(v) ? v.map(String).join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (typ !== 'odkaz') t = maskujOsobni(t);
  if (VZOREC.test(t)) t = `'${t}`;
  return uvozovky(t);
}

/** CSV z řádků a sloupců: hlavička z názvů, středník, CRLF za každým řádkem. */
export function doCsv(radky: readonly Record<string, unknown>[], sloupce: readonly SloupecCsv[]): string {
  const hlavicka = sloupce.map((s) => bunkaCsv(s.nazev)).join(CSV_ODDELOVAC);
  const telo = radky.map((r) => sloupce.map((s) => bunkaCsv(s.hodnota ? s.hodnota(r) : r[s.klic], s.typ)).join(CSV_ODDELOVAC));
  return [hlavicka, ...telo].map((radek) => `${radek}\r\n`).join('');
}
