// SDÍLENÝ STAV PŘEHLEDU PRO ZÁLOŽKY (Přehled vedení úkol 13; úkol 14 nad ním staví obsah záložek). Stránka (PrehledPage) drží
// filtr z adresy, možnosti (prehled_moznosti) a katalog (prehled_definice) a dává je záložkám kontextem; záložka si načte svou
// funkci hookem usePrehledData (odpověď na starý filtr se zahodí, chyba jako věta pro člověka) a karty otevírá přes otevriProklik
// (panel řádků s CSV). Nic z toho se nevolá pro Volajícího: stránka ho přesměruje dřív, než se cokoli načte. Každá odpověď hlásí
// stránce svou definice_verze (hlasVerzi): jiná verze než u načteného katalogu = katalog znovu (oprava po recenzi, bod 6).
// Úkol 14b: uložení v Nastavení (cíl, náklad, výplata) zavolá zmenaDat: verzeDat + 1, takže se data záložek načtou znovu.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { DataDefinice, DataMoznosti, JednotkaMetriky, Metrika, MetrikaDefinice, PrehledFiltrVstup, PrehledObalka, PrehledProklik } from '../../api/types';
import { useSession } from '../../auth';
import { chybaPrehledu } from '../../prehled';
import type { FiltrPrehledu } from '../../prehledFiltr';

export interface OtevrenyProklik {
  proklik: PrehledProklik;
  nazev: string;
  popis?: string | null;
}

export interface PrehledKontextHodnota {
  /** filtr stránky (adresa) */
  filtr: FiltrPrehledu;
  /** týž filtr pro server (tým rozbalený na id) */
  serverFiltr: PrehledFiltrVstup;
  /** otisk serverového filtru: změní se, když se má načíst znovu */
  klicFiltru: string;
  moznosti: PrehledObalka<DataMoznosti>;
  definice: PrehledObalka<DataDefinice> | null;
  /** otevře panel řádků; `odkud` dostane fokus po zavření */
  otevriProklik: (p: OtevrenyProklik, odkud?: HTMLElement | null) => void;
  /** definice_verze odpovědi: jiná než u načteného katalogu = stránka katalog načte znovu (kontrakt §5.17) */
  hlasVerzi: (verze: string | null | undefined) => void;
  /** dnešní den v Praze */
  dnes: string;
  /**
   * Počítadlo pětiminutové obnovy čerstvosti (časovač stránky a návrat ke skryté stránce; úkol 14a, oprava po recenzi): bloky,
   * které na filtru nezávisí (kvalita dat), se načtou jednou za návštěvu a znovu jen s ním, ne při každé změně filtru.
   */
  obnova: number;
  /**
   * Verze dat Přehledu (úkol 14b): zvýší ji každé úspěšné uložení nebo zrušení v Nastavení (cíl, náklad, výplata provize); každé
   * načtení záložek (usePrehledNacteni) ji má mezi důvody načíst znovu, takže žádné číslo nezůstane z doby před uložením.
   */
  verzeDat: number;
  /** Nastavení něco uložilo nebo zrušilo: data záložek znovu a možnosti (čerstvost zdrojů Cíle, Náklady, Výplaty provizí) taky. */
  zmenaDat: () => void;
}

export const PrehledKontext = createContext<PrehledKontextHodnota | null>(null);

export function usePrehled(): PrehledKontextHodnota {
  const k = useContext(PrehledKontext);
  if (!k) throw new Error('Záložka Přehledu je mimo stránku Přehledu.');
  return k;
}

/** Řádek katalogu metriky (prehled_definice), nebo null dokud se katalog načítá. */
export function definiceMetriky(definice: PrehledObalka<DataDefinice> | null, klic: string): MetrikaDefinice | null {
  return definice?.data.metriky.find((m) => m.klic === klic) ?? null;
}

/** Jednotka metriky z katalogu; než se katalog načte, odhad z tvaru metriky (peníze = castky, podíl = jmenovatel). */
export function jednotkaMetriky(definice: PrehledObalka<DataDefinice> | null, m: Metrika): JednotkaMetriky {
  const j = definiceMetriky(definice, m.klic)?.jednotka;
  if (j) return j;
  if (m.castky.length > 0) return m.hodnota !== null ? 'pocet_a_mena' : 'mena';
  return m.jmenovatel !== null ? 'podil' : 'pocet';
}

export interface StavNacteni<T> {
  data: T | null;
  chyba: string | null;
  /** načítá se (i znovu po změně filtru; stará data pak zůstanou vidět ztlumená) */
  nacita: boolean;
  znovu: () => void;
  /** otisk filtru (klicFiltru), ke kterému patří data nebo chyba; null před první odpovědí */
  pro: string | null;
}

/**
 * Volby načtení (úkol 14a, oprava po recenzi): `aktivni: false` = zatím nevolat (třeba týmy Vedení, dokud nedorazí karty,
 * nebo akční seznam s „K datu“); `bezFiltru` = funkce na filtru nezávisí, takže změna filtru ji znovu nevolá.
 */
export interface VolbyNacteni {
  aktivni?: boolean;
  bezFiltru?: boolean;
}
export type StavDat<T> = StavNacteni<PrehledObalka<T>>;

/**
 * Načte data záložky pro filtr (i víc funkcí naráz, třeba prehled_lide pro každý tým; úkol 14a). Odpověď na starší filtr se
 * zahodí (rychlé klikání ve filtru), chyba je věta pro člověka (server bez 073 = „Přehled potřebuje migraci 073“), data z minulého
 * filtru zůstanou do nové odpovědi (ztlumená, aria-busy). `verze` vrátí definice_verze všech odpovědí (každá se hlásí stránce,
 * kontrakt §5.17); `klic` = další důvod načíst znovu kromě filtru (třeba metrika grafu). ⚠ Úkol 14a: NAHRAZUJE jen tělo
 * usePrehledData (dál stejné chování, nově nad tímto hookem).
 */
export function usePrehledNacteni<T>(
  nacti: (token: string, filtr: PrehledFiltrVstup) => Promise<T>,
  verze: (t: T) => (string | null | undefined)[],
  klic = '',
  volby: VolbyNacteni = {}
): StavNacteni<T> {
  const aktivni = volby.aktivni ?? true;
  const bezFiltru = volby.bezFiltru ?? false;
  const session = useSession();
  const { serverFiltr, klicFiltru, hlasVerzi, verzeDat } = usePrehled();
  const hlasVerziRef = useRef(hlasVerzi);
  hlasVerziRef.current = hlasVerzi;
  const [data, setData] = useState<T | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [nacita, setNacita] = useState(true);
  const [kolo, setKolo] = useState(0);
  const [pro, setPro] = useState<string | null>(null);
  const cislo = useRef(0);
  const nactiRef = useRef(nacti);
  nactiRef.current = nacti;
  const verzeRef = useRef(verze);
  verzeRef.current = verze;

  const klicNacteni = bezFiltru ? '' : klicFiltru;
  useEffect(() => {
    const moje = ++cislo.current;
    setNacita(true);
    setChyba(null);
    // neaktivní: nevolat; při změně na aktivní se efekt spustí znovu (aktivni je v závislostech)
    if (!aktivni) return;
    const k = klicFiltru;
    nactiRef
      .current(session.token, serverFiltr)
      .then((o) => {
        if (moje !== cislo.current) return;
        setData(o);
        setPro(k);
        setNacita(false);
        for (const v of verzeRef.current(o)) hlasVerziRef.current(v);
      })
      .catch((e: unknown) => {
        if (moje !== cislo.current) return;
        setData(null);
        setChyba(chybaPrehledu(e));
        setPro(k);
        setNacita(false);
      });
    // serverFiltr se mění s klicFiltru (otisk); objekt sám se tvoří při každém vykreslení, proto v závislostech není;
    // verzeDat = po uložení v Nastavení znovu (úkol 14b)
  }, [session.token, klicNacteni, kolo, klic, aktivni, verzeDat]);

  const znovu = useCallback(() => setKolo((k) => k + 1), []);
  return { data, chyba, nacita, znovu, pro };
}

/** Jedna funkce Přehledu pro filtr záložky (obálka §2.5); `klic` jako u usePrehledNacteni. */
export function usePrehledData<T>(nacti: (token: string, filtr: PrehledFiltrVstup) => Promise<PrehledObalka<T>>, klic = '', volby: VolbyNacteni = {}): StavDat<T> {
  return usePrehledNacteni(nacti, (o) => [o.definice_verze], klic, volby);
}

/** Otevření panelu řádků z tabulky nebo grafu záložky (číslo, jeho název, kam vrátit fokus). */
export function useOtevriRadky(): (p: PrehledProklik, nazev: string, odkud: HTMLElement | null) => void {
  const { otevriProklik } = usePrehled();
  return useCallback((p: PrehledProklik, nazev: string, odkud: HTMLElement | null) => otevriProklik({ proklik: p, nazev }, odkud), [otevriProklik]);
}
