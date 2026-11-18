// SDÍLENÝ STAV PŘEHLEDU PRO ZÁLOŽKY (Přehled vedení úkol 13; úkol 14 nad ním staví obsah záložek). Stránka (PrehledPage) drží
// filtr z adresy, možnosti (prehled_moznosti) a katalog (prehled_definice) a dává je záložkám kontextem; záložka si načte svou
// funkci hookem usePrehledData (odpověď na starý filtr se zahodí, chyba jako věta pro člověka) a karty otevírá přes otevriProklik
// (panel řádků s CSV). Nic z toho se nevolá pro Volajícího: stránka ho přesměruje dřív, než se cokoli načte. Každá odpověď hlásí
// stránce svou definice_verze (hlasVerzi): jiná verze než u načteného katalogu = katalog znovu (oprava po recenzi, bod 6).

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

export interface StavDat<T> {
  data: PrehledObalka<T> | null;
  chyba: string | null;
  /** načítá se (i znovu po změně filtru; stará data pak zůstanou vidět ztlumená) */
  nacita: boolean;
  znovu: () => void;
}

/**
 * Načte funkci Přehledu pro filtr záložky. Odpověď na starší filtr se zahodí (rychlé klikání ve filtru), chyba je věta pro člověka
 * (server bez 073 = „Přehled potřebuje migraci 073“), data z minulého filtru zůstanou do nové odpovědi (ztlumená, aria-busy).
 */
export function usePrehledData<T>(nacti: (token: string, filtr: PrehledFiltrVstup) => Promise<PrehledObalka<T>>): StavDat<T> {
  const session = useSession();
  const { serverFiltr, klicFiltru, hlasVerzi } = usePrehled();
  const hlasVerziRef = useRef(hlasVerzi);
  hlasVerziRef.current = hlasVerzi;
  const [data, setData] = useState<PrehledObalka<T> | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [nacita, setNacita] = useState(true);
  const [kolo, setKolo] = useState(0);
  const cislo = useRef(0);
  const nactiRef = useRef(nacti);
  nactiRef.current = nacti;

  useEffect(() => {
    const moje = ++cislo.current;
    setNacita(true);
    setChyba(null);
    nactiRef
      .current(session.token, serverFiltr)
      .then((o) => {
        if (moje !== cislo.current) return;
        setData(o);
        setNacita(false);
        hlasVerziRef.current(o.definice_verze);
      })
      .catch((e: unknown) => {
        if (moje !== cislo.current) return;
        setData(null);
        setChyba(chybaPrehledu(e));
        setNacita(false);
      });
    // serverFiltr se mění s klicFiltru (otisk); objekt sám se tvoří při každém vykreslení, proto v závislostech není
  }, [session.token, klicFiltru, kolo]);

  const znovu = useCallback(() => setKolo((k) => k + 1), []);
  return { data, chyba, nacita, znovu };
}
