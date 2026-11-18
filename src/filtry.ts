// KOMBINOVATELNÉ FILTRY SEZNAMŮ (migrace 060, Albert 1. 11. 2026: „the same combinable filters in Kontakty, Moji klienti
// and Označené“). Jeden stav filtrů pro všechny tři stránky (panel filtrů components/FiltrPanel.tsx s řadou filtrů
// components/SeznamFiltry.tsx) a jeho převod na parametry serveru. Bez Reactu, používají ho stránky i testy
// (tests/filtry.test.mjs, tests/filtrpanel.test.mjs).
//
// Co platí (docs/ROLE-A-VIDITELNOST.md, oddíl 060): všechny zapnuté filtry najednou (A ZÁROVEŇ), z hodnot jednoho filtru
// kterákoli (NEBO). Volajícímu berou jen jeho klienty a jen jeho označení; cizí kontakt nesedí nikdy a klíče mlčení,
// označení ani hvězdy nedostane (hlídá server, mock stejně). Filtry se drží ve stavu stránky: zavření detailu ani výběr
// jiného člověka je nezruší; adresa stránky je nenese (filtry seznamů se nepamatují, docs/ARCHITEKTI.md 9.6).
//
// Přehled vedení úkol 11 (Albert 17. 11. 2026, rozložení filtrů): ve stavu jsou i čekání s košem (Kontakty, Moji klienti)
// a pilulky „Co je potřeba“ (Označené, `druhy`), ať je „Zrušit vše“ zruší spolu s ostatními (zrusVse; segment zůstane jako
// dřív). ⚠ NAHRAZUJE čekání, koš a druhy ve vlastním stavu stránek, které „Zrušit filtry“ nechávalo zapnuté. Převod na
// parametry serveru se nemění (čekání a koš posílá stránka sama jako dřív, druhy vybírá appka nad načtenými řádky).

import type {
  CekaniKind,
  CekaniKos,
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
  /** migrace 068 (Albert 13. 11. 2026): jen klienti, kteří odpověděli, neodmítli a web ještě nepotvrdili */
  jenOdpovedel: boolean;
  kategorie: OznaceniKategorie[];
  /** mlčí aspoň / nejvýš tolik pracovních dní (včetně); null = bez meze */
  mlciMin: number | null;
  mlciMax: number | null;
  razeni: Razeni | '';
  hledat: string;
  /** čekání na odpověď (migrace 014; Kontakty a Moji klienti), '' = vypnuto */
  cekani: CekaniKind | '';
  /** koš čekání podle stáří; platí jen se zapnutým čekáním ('' = všechny koše) */
  kos: CekaniKos | '';
  /** Označené: pilulky „Co je potřeba“ (kategorie označení a druhy příznaků), vybírá appka nad načtenými řádky */
  druhy: string[];
}

export const PRAZDNE_FILTRY: StavFiltru = {
  segment: '',
  statusy: [],
  znamky: [],
  jenHvezda: false,
  jenOdpovedel: false,
  kategorie: [],
  mlciMin: null,
  mlciMax: null,
  razeni: '',
  hledat: '',
  cekani: '',
  kos: '',
  druhy: [],
};

/**
 * „Zrušit vše“ (úkol 11, Albert 17. 11. 2026): zruší každý filtr stavu i čekání, koš a pilulky „Co je potřeba“, hledání
 * a řazení (jako dřív „Zrušit filtry“); segment zůstane jako dřív. Výběr člověka (řada 1) není ve stavu filtrů a zůstane
 * taky: je to rozsah stránky jako segment (rozhodnutí koordinátora 18. 11. 2026; ⚠ NAHRAZUJE „výběr člověka vrací stránka
 * přes onZrusVse“ z b34677f).
 */
export function zrusVse(f: StavFiltru): StavFiltru {
  return { ...PRAZDNE_FILTRY, segment: f.segment };
}

/** Je co rušit? (zrusVse by změnilo něco jiného než segment) */
export function lzeZrusit(f: StavFiltru): boolean {
  return (
    filtrZapnuty(f) ||
    f.razeni !== '' ||
    f.hledat !== '' ||
    f.cekani !== '' ||
    f.kos !== '' ||
    f.druhy.length > 0
  );
}

/**
 * Zapnutí nebo vypnutí čekání: zapnutí rovnou zvolí koš „k zavolání“, aby začátek seznamu nezaplavili klienti, kteří mlčí
 * rok (Albert 2026-09-07), vypnutí koš zruší. Stejně jako dřív výběr čekání v Kontaktech a Moji klienti.
 */
export function sCekanim(f: StavFiltru, cekani: CekaniKind | ''): StavFiltru {
  return { ...f, cekani, kos: cekani ? 'k_zavolani' : '' };
}

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

/**
 * Zapnuté mlčení slovy (tlačítko „Mlčí: …“ a čip, úkol 11): „10+ prac. dní“, „nejvýš 20 prac. dní“, „5–20 prac. dní“,
 * „3 prac. dny“; bez mezí null.
 */
export function mlciRozsah(min: number | null, max: number | null): string | null {
  const dni = (n: number) => (n === 1 ? 'prac. den' : n >= 2 && n <= 4 ? 'prac. dny' : 'prac. dní');
  if (min === null && max === null) return null;
  if (max === null) return `${min}+ prac. dní`;
  if (min === null) return `nejvýš ${max} ${dni(max)}`;
  if (min === max) return `${min} ${dni(min)}`;
  return `${min}–${max} prac. dní`;
}

/** Je zapnutý aspoň jeden filtr kromě segmentu a řazení? (prázdný stav „nic nenalezeno“ vs. „zatím nic“) */
export function filtrZapnuty(f: StavFiltru): boolean {
  return (
    f.statusy.length > 0 ||
    f.znamky.length > 0 ||
    f.jenHvezda ||
    f.jenOdpovedel ||
    f.kategorie.length > 0 ||
    f.mlciMin !== null ||
    f.mlciMax !== null ||
    f.hledat.trim() !== ''
  );
}

/** Jsou zapnuté filtry, které Volajícímu berou jen jeho klienty (stav, známka, hvězda, označení, mlčení)? */
export function filtrJenSvoje(f: StavFiltru): boolean {
  return f.statusy.length > 0 || f.znamky.length > 0 || f.jenHvezda || f.jenOdpovedel || f.kategorie.length > 0 || f.mlciMin !== null || f.mlciMax !== null;
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
 * Filtry pro počty u stavů (Albert 13. 11. 2026: „when I selected Vera, it showed that there were two, but when I clicked
 * on the filter, it didn't show a single listing“): totéž co filtryNaServer, jen bez výběru stavu, protože počet se ptá na
 * každý stav zvlášť. Stránka k nim přidá všechno, co posílá se seznamem (volající, hledání, čekání a koš, segment), takže
 * číslo u stavu je přesně počet řádků, které ukáže klik na ten stav. ⚠ NAHRAZUJE počty jen podle segmentu (Kontakty, 045)
 * a jen podle člověka a segmentu (Moji klienti, 056), které se zapnutými filtry ukazovaly čísla celé databáze.
 */
export function filtryBezStavu(f: StavFiltru): ReturnType<typeof filtryNaServer> {
  return filtryNaServer({ ...f, statusy: [] });
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
    // migrace 068: jen zapnutý (server bez 068 parametr nezná)
    ...(f.jenOdpovedel ? { odpovedel: true } : {}),
    ...(f.kategorie.length > 0 ? { kategorie: [...f.kategorie] } : {}),
    ...(f.mlciMin !== null ? { mlci_min: f.mlciMin } : {}),
    ...(f.mlciMax !== null ? { mlci_max: f.mlciMax } : {}),
  };
}
