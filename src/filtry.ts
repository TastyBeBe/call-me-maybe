// KOMBINOVATELNÉ FILTRY SEZNAMŮ (migrace 060, Albert 1. 11. 2026: „the same combinable filters in Kontakty, Moji klienti
// and Označené“). Jeden stav filtrů pro všechny tři stránky (sdílený řádek filtrů v components/SeznamFiltry.tsx) a jeho
// převod na parametry serveru. Bez Reactu, používají ho stránky i testy (tests/filtry.test.mjs).
//
// Co platí (docs/ROLE-A-VIDITELNOST.md, oddíl 060): všechny zapnuté filtry najednou (A ZÁROVEŇ), z hodnot jednoho filtru
// kterákoli (NEBO). Volajícímu berou jen jeho klienty a jen jeho označení; cizí kontakt nesedí nikdy a klíče mlčení,
// označení ani hvězdy nedostane (hlídá server, mock stejně). Filtry se drží ve stavu stránky: zavření detailu ani výběr
// jiného člověka je nezruší; adresa stránky je nenese (filtry seznamů se nepamatují, docs/ARCHITEKTI.md 9.6).

import type {
  FiltryMlceni,
  KontaktStatus,
  OznaceniKategorie,
  Razeni,
  Segment,
  ZnamkaFiltr,
} from './api/types';

export interface StavFiltru {
  segment: Segment | '';
  statusy: KontaktStatus[];
  znamky: ZnamkaFiltr[];
  jenHvezda: boolean;
  kategorie: OznaceniKategorie[];
  /** mlčí aspoň / nejvýš tolik pracovních dní (včetně); null = bez meze */
  mlciMin: number | null;
  mlciMax: number | null;
  razeni: Razeni | '';
  hledat: string;
}

export const PRAZDNE_FILTRY: StavFiltru = {
  segment: '',
  statusy: [],
  znamky: [],
  jenHvezda: false,
  kategorie: [],
  mlciMin: null,
  mlciMax: null,
  razeni: '',
  hledat: '',
};

/** Předvolby „Mlčí aspoň“ (pracovní dny): 5+ je hranice označení k zavolání. */
export const MLCI_PREDVOLBY = [5, 10, 20, 30] as const;

/** Nejvyšší počet pracovních dní, který jde do pole „Mlčí od/do“ napsat (víc nemá smysl, rok je ~250). */
export const MLCI_STROP = 9999;

/** Číslo z pole „Mlčí od/do“: prázdné nebo nečíslo = null, jinak celé číslo 0 až MLCI_STROP. */
export function mlciZPole(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  return Math.min(Number(t), MLCI_STROP);
}

/** Je zapnutý aspoň jeden filtr kromě segmentu a řazení? (prázdný stav „nic nenalezeno“ vs. „zatím nic“) */
export function filtrZapnuty(f: StavFiltru): boolean {
  return (
    f.statusy.length > 0 ||
    f.znamky.length > 0 ||
    f.jenHvezda ||
    f.kategorie.length > 0 ||
    f.mlciMin !== null ||
    f.mlciMax !== null ||
    f.hledat.trim() !== ''
  );
}

/** Jsou zapnuté filtry, které Volajícímu berou jen jeho klienty (stav, známka, hvězda, označení, mlčení)? */
export function filtrJenSvoje(f: StavFiltru): boolean {
  return f.statusy.length > 0 || f.znamky.length > 0 || f.jenHvezda || f.kategorie.length > 0 || f.mlciMin !== null || f.mlciMax !== null;
}

/**
 * Filtry pro list_kontakty a my_kontakty. Jeden stav jde jako dřív přes `status` (p_status) a jedna známka A, B nebo C
 * přes `rating` (p_rating): server bez migrace 060 je umí, takže jednoduchý filtr funguje i proti němu (a význam je
 * stejný jako p_statusy s jednou hodnotou). Víc stavů, „bez známky“ a víc známek jdou přes nové p_statusy a p_znamky.
 */
export function filtryNaServer(f: StavFiltru): FiltryMlceni & { status?: string; rating?: string } {
  return {
    ...(f.statusy.length === 1 ? { status: f.statusy[0] } : f.statusy.length > 1 ? { statusy: [...f.statusy] } : {}),
    ...(f.znamky.length === 1 && f.znamky[0] !== 'bez'
      ? { rating: f.znamky[0] }
      : f.znamky.length > 0
        ? { znamky: [...f.znamky] }
        : {}),
    ...filtryMlceni(f),
  };
}

/**
 * Filtry pro list_oznacene (migrace 060): ta zná jen nová pole, stav a známka jdou vždy jako pole. Kategorie označení
 * NE: list_oznacene nemá p_kategorie (druhy vybírají pilulky „Co je potřeba“ nad načtenými řádky), poslaná by skončila
 * falešnou hláškou „server bez migrace 060“ (recenze 2. 11. 2026).
 */
export function filtryOznacenych(f: StavFiltru): Omit<FiltryMlceni, 'kategorie'> {
  const mlceni = filtryMlceni(f);
  delete mlceni.kategorie;
  return {
    ...(f.statusy.length > 0 ? { statusy: [...f.statusy] } : {}),
    ...(f.znamky.length > 0 ? { znamky: [...f.znamky] } : {}),
    ...mlceni,
  };
}

function filtryMlceni(f: StavFiltru): FiltryMlceni {
  return {
    ...(f.jenHvezda ? { jen_hvezda: true } : {}),
    ...(f.kategorie.length > 0 ? { kategorie: [...f.kategorie] } : {}),
    ...(f.mlciMin !== null ? { mlci_min: f.mlciMin } : {}),
    ...(f.mlciMax !== null ? { mlci_max: f.mlciMax } : {}),
  };
}
