// ČÍSLA PŘEHLEDU PRO LIDI (Přehled vedení úkol 13, Albert 17. 11. 2026; spec docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md
// §7.2, kontrakt docs/superpowers/specs/2026-11-17-prehled-kontrakt.md §2.6, §3 a §7). Jen logika bez Reactu: jak se metrika
// ukáže (hodnota podle jednotky, peníze po měnách, nikdy „0“ za neznámé číslo), řádek pokrytí, názvy kvality, základů a zdrojů,
// sloupce řádků prokliku (tabulka i CSV) a chyba serveru bez migrace 073.
//
// „Spojeno“ (rozhodnutí koordinátora 18. 11. 2026): server počítá `dovolano` jako každý výsledek hovoru kromě „nedovoláno“
// (zájem, odmítnutí, nerelevantní, přeplánováno). Statistiky říkají „Dovoláno“ jen zájmu a odmítnutí (staré reached), proto
// Přehled serverové číslo jmenuje „Spojeno“ s vlastní definicí a „Dovoláno“ pro ně nepoužije nikde.

import { BEZ_073_LIDE, BEZ_073_PREHLED } from './api/supabase';
import type { CastkaJedna, CenaRozbor, JednotkaMetriky, KvalitaMetriky, MenaPrehledu, Metrika, PokrytiMetriky, RadekPrehledu, RadkyZdroj } from './api/types';
import { maskujOsobni, type TypSloupceCsv } from './csv';
import { prahaCas, prahaDen } from './praha';

/** Názvy a definice, které appka říká jinak než katalog serveru (jen tyhle dvě metriky). */
export const NAZVY_APPKY: Record<string, { nazev: string; definice: string }> = {
  dovolano: {
    nazev: 'Spojeno',
    definice:
      'Hovory, ve kterých jsme se s někým spojili: každý výsledek kromě „nedovoláno“ (zájem, odmítnutí, nerelevantní, přeplánováno). Není to „Dovoláno“ ze Statistik, to počítá jen zájem a odmítnutí.',
  },
  mira_dovolani: {
    nazev: 'Míra spojení',
    definice: 'Spojeno ÷ hovory: kolik pokusů o hovor skončilo spojením s člověkem (cokoli kromě „nedovoláno“).',
  },
};
export const nazevMetriky = (klic: string, nazev: string): string => NAZVY_APPKY[klic]?.nazev ?? nazev;
export const definiceMetriky = (klic: string, definice: string): string => NAZVY_APPKY[klic]?.definice ?? definice;

export const KVALITA_NAZVY: Record<KvalitaMetriky, string> = { dostupne: 'úplné', castecne: 'částečně', nedostupne: 'nedostupné' };
/** Přirozený základ metriky (§2.6 Zaklad) česky. */
export const ZAKLAD_NAZVY: Record<string, string> = {
  aktivita: 'činnost v období (hovory, práce)',
  prodej: 'datum prodeje',
  faktura: 'datum faktury',
  platba: 'datum platby',
  uzavreni: 'uzavření obchodu (vyhráno nebo ztraceno)',
  k_datu: 'stav k okamžiku',
  kohorta: 'první hovor (kohorta)',
  navrh: 'návrh, první zájem nebo nabídka',
  zprava: 'čas e-mailu',
  naklad: 'zaúčtování nákladu',
  vyplata: 'datum výplaty',
};
/** Registr zdrojů (§3.8). */
export const ZDROJ_NAZVY: Record<string, string> = {
  hovory: 'Hovory',
  dovolani: 'Zápisy „Zavolal/a jsem“',
  kontakty: 'Kontakty (stav)',
  prodeje: 'Prodeje',
  navrhy: 'Návrhy webu',
  slevy: 'Nabídky za polovinu',
  faktury: 'Faktury',
  platby: 'Platby',
  historie: 'Historie změn kontaktů',
  tymy: 'Historie týmů',
  casovac: 'Časovač práce',
  gmail: 'Zprávy z Gmailu',
  duvody: 'Důvody odmítnutí',
  naklady: 'Náklady',
  cile: 'Cíle',
  vyplaty: 'Výplaty provizí',
  snimky: 'Denní snímky',
  oznaceni: 'Označení k zavolání',
  zavolat: 'Naplánované hovory',
  rozvrh: 'Rozvrh',
  jobs: 'Práce automatizace',
  tick: 'Běh automatizace',
};
/** Podíly, jejichž čitatel a jmenovatel jsou částky v měně filtru (R8). */
export const PENEZNI_PODILY = new Set(['plneni_cile', 'koncentrace_top1', 'koncentrace_top5']);

/** „ze“ nebo „z“ před číslem („1 ze 4“, „6 z 12“): ze před 2, 3, 4, 7, 14, 17 a stovkami. */
export function zeZ(n: number): 'ze' | 'z' {
  const s = String(Math.abs(Math.trunc(n)));
  return /^[2347]/.test(s) || /^1\d\d$/.test(s) || /^1[47]$/.test(s) ? 'ze' : 'z';
}

const cislo = (n: number, mist = 0): string => new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: mist }).format(n);
/**
 * „21 000 Kč“, „1 234,50 €“ (haléře a centy jen když nejsou nulové). `zaokrouhlit` = koruny bez haléřů (velké číslo karty:
 * odhad nebo MRR na haléře by předstíral přesnost); eura vždy i s centy, když nejsou nulové. Tabulky a CSV mají přesnou částku.
 */
export function formatCastka(hodnota: string | number, mena: MenaPrehledu | null, zaokrouhlit = false): string {
  const n = typeof hodnota === 'number' ? hodnota : Number(hodnota);
  const bezDesetin = Number.isInteger(n) || (zaokrouhlit && mena !== 'EUR');
  const text = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: bezDesetin ? 0 : 2, maximumFractionDigits: bezDesetin ? 0 : 2 }).format(n);
  return mena === 'EUR' ? `${text} €` : mena === 'CZK' ? `${text} Kč` : text;
}
/** „44,4 %“ (plnění může být víc než 100 %). */
export const formatPodil = (h: number): string => `${cislo(h * 100, 1)} %`;
export const formatHodiny = (h: number): string => `${cislo(h, 1)} h`;
/** „1 den“, „2 dny“, „5 dní“, „3,2 dne“. */
export function formatDny(d: number): string {
  if (!Number.isInteger(d)) return `${cislo(d, 1)} dne`;
  return d === 1 ? '1 den' : d >= 2 && d <= 4 ? `${d} dny` : `${cislo(d)} dní`;
}
/** „3 položky“, „5 položek“, „1 položka“. */
export function polozek(n: number): string {
  return n === 1 ? '1 položka' : n >= 2 && n <= 4 ? `${n} položky` : `${cislo(n)} položek`;
}

export interface FormatMetriky {
  /** hlavní číslo („21 000 Kč“, „44,4 %“, „—“ když není známé) */
  hlavni: string;
  /** další řádky (druhá měna, známá hodnota otevřených) */
  dalsi: string[];
  /** číslo není známé (pomlčka, nikdy „0“) */
  prazdna: boolean;
}

/** „— Kč“, „— €“: částka měny, která není známá (oprava po recenzi, bod 3: při obou měnách nikdy nezmizí). */
const neznamaMena = (mena: MenaPrehledu): string => (mena === 'EUR' ? '— €' : '— Kč');

/**
 * Hodnota metriky podle jednotky (§3.11). Neznámé (null) je pomlčka, ověřená nula je „0“. U peněz každá měna filtru: jedna
 * měna bez známé částky = „—“, při obou měnách neznámá měna „— €“ nebo „— Kč“ (oprava po recenzi, bod 3).
 */
export function formatMetriky(m: Metrika, jednotka: JednotkaMetriky): FormatMetriky {
  const pomlcka: FormatMetriky = { hlavni: '—', dalsi: [], prazdna: true };
  if (m.kvalita === 'nedostupne') return pomlcka;
  const znamych = m.castky.filter((c) => c.hodnota !== null).length;
  const castky = m.castky.map((c) => (c.hodnota !== null ? formatCastka(c.hodnota, c.mena, true) : neznamaMena(c.mena)));
  if (jednotka === 'mena') return znamych === 0 ? pomlcka : { hlavni: castky[0], dalsi: castky.slice(1), prazdna: false };
  if (m.hodnota === null) return pomlcka;
  // počet s penězi (otevřené obchody): známá hodnota po měnách; měna bez známé částky viditelně „neznámá“, nikdy nezmizí
  const dalsi = jednotka === 'pocet_a_mena' && znamych > 0
    ? m.castky.map((c) => (c.hodnota !== null ? `známá hodnota ${formatCastka(c.hodnota, c.mena, true)}` : `hodnota v ${c.mena === 'EUR' ? 'EUR' : 'Kč'} neznámá`))
    : [];
  const hlavni = jednotka === 'podil' ? formatPodil(m.hodnota) : jednotka === 'h' ? formatHodiny(m.hodnota) : jednotka === 'd' ? formatDny(m.hodnota) : cislo(m.hodnota);
  return { hlavni, dalsi, prazdna: false };
}

/**
 * Řádek pokrytí (spec §7.2 „coverage line“): u podílu čitatel z jmenovatele, u všeho „pokrytí 3 ze 4“ (jednotky se známou
 * hodnotou z všech); nedostupné bez řádku. `mena` = měna filtru pro podíly z peněz (plnění cíle, koncentrace).
 */
export function pokrytiText(m: Metrika, jednotka: JednotkaMetriky, mena: MenaPrehledu | null = 'CZK'): string | null {
  if (m.kvalita === 'nedostupne' || !m.pokryti) return null;
  const p: PokrytiMetriky = m.pokryti;
  const pokr = p.celkem === 0 ? 'žádná položka' : `pokrytí ${cislo(p.zname)} ${zeZ(p.celkem)} ${cislo(p.celkem)}`;
  if (jednotka === 'podil' && m.citatel !== null && m.jmenovatel !== null) {
    const zlomek = PENEZNI_PODILY.has(m.klic)
      ? `${formatCastka(m.citatel, mena)} z ${formatCastka(m.jmenovatel, mena)}`
      : `${cislo(m.citatel, 2)} ${zeZ(m.jmenovatel)} ${cislo(m.jmenovatel, 2)}`;
    return p.nezname > 0 ? `${zlomek} · ${pokr}` : zlomek;
  }
  return pokr;
}

/** Chyba volání Přehledu pro člověka: server bez 073 = „Přehled potřebuje migraci 073“ (i z prehled_lide), jinak věta serveru. */
export function chybaPrehledu(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  return text === BEZ_073_LIDE ? BEZ_073_PREHLED : text;
}
/** Chyba znamená server bez migrace 073 (stránka pak ukáže jen tuhle hlášku, žádná čísla). */
export const bezMigrace073 = (text: string | null): boolean => !!text && text.startsWith('Přehled potřebuje migraci 073');

/** „18. 11. 2026“ z pražského dne. */
export function denText(den: string): string {
  const [y, m, d] = den.split('-').map(Number);
  return `${d}. ${m}. ${y}`;
}
/** „dnes 9:05“, „17. 11. 2026 21:40“ v Praze. */
export function casText(iso: string, dnes: string = prahaDen(Date.now())): string {
  const den = prahaDen(iso);
  const cas = prahaCas(iso).replace(/^0/, '');
  return den === dnes ? `dnes ${cas}` : `${denText(den)} ${cas}`;
}

/** Cena z rozboru („7 000 Kč“, „6 000–7 000 Kč“, „neznámá“). */
export function cenaText(c: CenaRozbor | null | undefined): string {
  if (!c) return '—';
  if (c.stav === 'presne' && c.castka !== null) return formatCastka(c.castka, c.mena);
  if (c.stav === 'rozsah' && c.min !== null && c.max !== null) return `${formatCastka(c.min, null)}–${formatCastka(c.max, c.mena)}`;
  return 'neznámá';
}
/**
 * Součty řádků po měnách stejně jako na kartě („16 888 Kč · 75,50 €“: koruny celé, oprava po recenzi, bod 8); neznámá měna
 * „— €“. null = žádná známá částka.
 */
export function souctyText(soucty: CastkaJedna[]): string | null {
  if (!soucty.some((s) => s.hodnota !== null)) return null;
  return soucty.map((s) => (s.hodnota !== null ? formatCastka(s.hodnota, s.mena, true) : neznamaMena(s.mena))).join(' · ');
}
/** Tytéž součty přesně (haléře), do bubliny k zaokrouhlenému součtu. */
export function souctyPresne(soucty: CastkaJedna[]): string | null {
  if (!soucty.some((s) => s.hodnota !== null)) return null;
  return soucty.map((s) => (s.hodnota !== null ? formatCastka(s.hodnota, s.mena) : neznamaMena(s.mena))).join(' · ');
}
/** Přesné částky karty (bublina u zaokrouhleného čísla), null když se zaokrouhlením nic nemění. */
export function presneCastky(m: Metrika): string | null {
  const presne = souctyPresne(m.castky);
  return presne && presne !== souctyText(m.castky) ? presne : null;
}

/** Karty Vedení bez čísla (oprava po recenzi, bod 2): jen z dostupných karet a aspoň jedné; samé „nedostupné“ prázdno nejsou. */
export function souhrnPrazdny(karty: Record<string, Metrika>): boolean {
  const dostupne = Object.values(karty).filter((m) => m.kvalita !== 'nedostupne');
  return dostupne.length > 0 && dostupne.every((m) => (m.hodnota === null || m.hodnota === 0) && m.castky.every((c) => c.hodnota === null || Number(c.hodnota) === 0));
}

/** Chyba kurzoru prehled_radky (§5.15): server říká „začněte znovu“, panel pak načte první stránku. */
export function jeChybaKurzoru(text: string | null): boolean {
  return !!text && (text === 'Neplatný kurzor.' || text.startsWith('Kurzor patří k jinému filtru nebo zdroji'));
}

/** Odkaz do Gmailu jen https://mail.google.com (jiný odkaz z dat se jako odkaz nevykreslí). */
export function odkazGmailu(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.host === 'mail.google.com' ? url : null;
  } catch {
    return null;
  }
}

const VYSLEDKY: Record<string, string> = { nedovolano: 'Nedovoláno', odmitnuto: 'Odmítnuto', zajem: 'Zájem', nerelevantni: 'Nerelevantní', preplanovano: 'Přeplánováno' };
const DRUHY_ZPRAV: Record<string, string> = { clovek: 'člověk', automaticka_odpoved: 'automatická odpověď', nedoruceno: 'nedoručeno', systemova: 'systémová', nezname: 'nejasné' };
const OPAKOVANI: Record<string, string> = { jednorazove: 'Jednorázově', mesicne: 'Měsíčně', rocne: 'Ročně' };
const KATEGORIE: Record<string, string> = { provize: 'Provize', claude: 'Claude', lovable: 'Lovable', domena: 'Domény', hosting: 'Hosting', jine: 'Jiné' };
const ZDROJ_CASTKY: Record<string, string> = { faktura: 'z faktury', cena_prodeje: 'z ceny prodeje', neznama: 'neznámá' };

type R = Record<string, unknown>;
/** Sloupec řádků prokliku: klíč a název, typ pro CSV, syrová hodnota (CSV) a text do tabulky. */
export interface SloupecRadku {
  klic: string;
  nazev: string;
  typ: TypSloupceCsv;
  hodnota: (r: R) => unknown;
  text: (r: R) => string;
}
const cas = (k: string, nazev: string): SloupecRadku => ({ klic: k, nazev, typ: 'cas', hodnota: (r) => r[k], text: (r) => (typeof r[k] === 'string' ? casText(r[k] as string) : '—') });
const den = (k: string, nazev: string): SloupecRadku => ({ klic: k, nazev, typ: 'datum', hodnota: (r) => r[k], text: (r) => (typeof r[k] === 'string' ? denText(r[k] as string) : '—') });
// text do tabulky zamaskovaný stejně jako v CSV (oprava po recenzi, bod 11: volný text odmítnutí, jméno)
const txt = (k: string, nazev: string, mapa?: Record<string, string>): SloupecRadku => ({
  klic: k, nazev, typ: 'text', hodnota: (r) => (mapa && typeof r[k] === 'string' ? mapa[r[k] as string] ?? r[k] : r[k]),
  text: (r) => {
    const v = r[k];
    if (v === null || v === undefined || v === '') return '—';
    return maskujOsobni(Array.isArray(v) ? v.map(String).join(', ') : String(mapa && typeof v === 'string' ? mapa[v] ?? v : v));
  },
});
const cis = (k: string, nazev: string): SloupecRadku => ({ klic: k, nazev, typ: 'cislo', hodnota: (r) => r[k], text: (r) => (typeof r[k] === 'number' ? cislo(r[k] as number, 2) : '—') });
const penize = (k: string, nazev: string, menaKlic = 'mena'): SloupecRadku => ({
  klic: k, nazev, typ: 'castka', hodnota: (r) => r[k],
  text: (r) => (typeof r[k] === 'string' ? formatCastka(r[k] as string, (r[menaKlic] as MenaPrehledu | null) ?? null) : '—'),
});
const osoba = (k: string, nazev: string): SloupecRadku => ({
  klic: k, nazev, typ: 'text', hodnota: (r) => (r[k] as { display_name?: string } | null)?.display_name ?? null,
  text: (r) => (r[k] as { display_name?: string } | null)?.display_name ?? '—',
});
const cena = (k: string, nazev: string): SloupecRadku => ({
  klic: k, nazev, typ: 'text', hodnota: (r) => cenaText(r[k] as CenaRozbor), text: (r) => cenaText(r[k] as CenaRozbor),
});
const ano = (k: string, nazev: string): SloupecRadku => ({ klic: k, nazev, typ: 'text', hodnota: (r) => r[k], text: (r) => (r[k] ? 'ano' : 'ne') });

/** Sloupce řádků podle zdroje (§7 Radek*): tabulka v panelu i CSV. Telefon ani e-mail mezi nimi není (R20). */
export const SLOUPCE_RADKU: Record<RadkyZdroj, SloupecRadku[]> = {
  kontakty: [txt('jmeno', 'Klient'), txt('segment', 'Segment'), txt('nazev_stavu', 'Stav'), osoba('osoba', 'Připsáno'), cena('cena', 'Cena'),
    cas('navrh_at', 'Návrh'), cas('prodano_at', 'Prodáno'), cas('posledni_klient_at', 'Klient psal'), cis('kontakt_id', 'Číslo')],
  hovory: [cas('at', 'Kdy'), txt('volajici', 'Volal/a'), txt('jmeno', 'Klient'), txt('vysledek', 'Výsledek', VYSLEDKY), txt('segment', 'Segment')],
  prodeje: [cas('prodano_at', 'Prodáno'), txt('jmeno', 'Klient'), cena('cena', 'Cena'), txt('zdroj_ceny', 'Cena z', { cena_web: 'ceny webu', sleva: 'nabídky za polovinu' }),
    osoba('osoba', 'Připsáno'), penize('provize', 'Provize', 'provize_mena'), cena('hosting', 'Hosting ročně')],
  faktury: [cas('at', 'Vystaveno'), txt('jmeno', 'Klient'), txt('cislo', 'Číslo faktury'), penize('web', 'Web'), penize('hosting', 'Hosting'), penize('celkem', 'Celkem'),
    cas('zaplaceno_at', 'Zaplaceno'), cis('dni_od_vystaveni', 'Dní od vystavení')],
  platby: [cas('at', 'Kdy'), txt('jmeno', 'Klient'), penize('castka', 'Částka'), txt('zdroj_castky', 'Částka', ZDROJ_CASTKY), ano('odvozeno', 'Odvozená ze stavu'), txt('faktury', 'Faktury')],
  naklady: [den('datum', 'Zaúčtováno'), txt('kategorie', 'Kategorie', KATEGORIE), txt('popis', 'Popis'), penize('castka', 'Částka'), txt('opakovani', 'Opakování', OPAKOVANI),
    txt('jmeno', 'Klient'), ano('overit', 'Ověřit')],
  provize: [den('datum', 'Datum'), txt('druh', 'Druh', { narok: 'nárok', vyplata: 'výplata' }), txt('volajici', 'Komu'), txt('jmeno', 'Klient'), penize('castka', 'Částka'), txt('poznamka', 'Poznámka')],
  odmitnuti: [cas('at', 'Kdy'), txt('jmeno', 'Klient'), txt('faze', 'Fáze', { nahled: 'náhled', sleva: 'nabídka za polovinu' }), txt('nazev_duvodu', 'Důvod'), txt('text', 'Text'), osoba('osoba', 'Připsáno')],
  zpravy: [cas('prijato_at', 'Kdy'), txt('jmeno', 'Klient'), txt('smer', 'Směr', { prichozi: 'příchozí', odchozi: 'odchozí' }), txt('druh', 'Druh', DRUHY_ZPRAV),
    txt('vazba', 'Přiřazení', { vlakno: 'vlákno', adresa: 'adresa', nejasne: 'nejasné' }), { klic: 'odkaz', nazev: 'Gmail', typ: 'odkaz', hodnota: (r) => r.odkaz, text: () => 'otevřít' }],
  akce: [cas('termin', 'Termín'), txt('jmeno', 'Klient'), txt('problem', 'Problém'), txt('dalsi_krok', 'Další krok'), osoba('vlastnik', 'Vlastník'), txt('nazev_stavu', 'Stav')],
  prace: [den('den', 'Den'), txt('volajici', 'Kdo'), cas('od', 'Od'), cas('do', 'Do'), cis('minut', 'Minut'), cis('vysledku', 'Výsledků'), txt('kvalita', 'Měřeno', { casovac: 'časovač', odhad: 'odhad z výsledků' })],
};

/** Řádek jako záznam pro sloupce. */
export const radekZaznam = (r: RadekPrehledu): R => r as unknown as R;
