// DEMO režim: in-memory mock implementující stejné rozhraní jako Supabase RPC.
// Umožňuje plně proklikat UI bez backendu. Data žijí jen v paměti (reload = reset).

import { icoVidi, rodinaOf, segmentOf } from '../segment';
import { pracovniDenPo, pracovniDnyMezi, prahaNaIso, zacatekDnePraha } from '../praha';
import type {
  AtribucePrehledu,
  BodRady,
  CastkaJedna,
  CastkaMeny,
  CenaRozbor,
  CenaStav,
  CilPrehledu,
  DataAkce,
  DataDefinice,
  DataDodani,
  DataFinance,
  DataKlienti,
  DataKomunikace,
  DataKontakt,
  DataKvalita,
  DataMoznosti,
  DataPipeline,
  DataPrognoza,
  DataRada,
  DataRadky,
  DataSouhrn,
  DataTrychtyr,
  DuvodRadku,
  GmailSync,
  JednotkaMetriky,
  KategorieVyuctovani,
  KrokPoNavrhu,
  KrokTrychtyre,
  MetrikaRadyKlic,
  ObnovaHostingu,
  OsobaMoznosti,
  OsobaPrehledu,
  PasmoStari,
  PoctyDruhu,
  PrehledProklik,
  PripadAkce,
  RadekAkce,
  RadekDimenze,
  RadekFaktury,
  RadekHovory,
  RadekKontakty,
  RadekNaklady,
  RadekOdmitnuti,
  RadekPlatby,
  RadekPrace,
  RadekPrehledu,
  RadekProdeje,
  RadekProvize,
  RadekZpravy,
  RadkyZdroj,
  SignalAkce,
  SignalKod,
  SkupinaCekani,
  Starnuti,
  TymPrehledu,
  UdalostKontaktu,
  ZdrojStav,
  ZrnitostRady,
  CekaniKind,
  CekaniKos,
  AdminMessage,
  DataLide,
  MenaPrehledu,
  Metrika,
  MetrikaCloveka,
  PokrytiMetriky,
  PrehledFiltr,
  PrehledFiltrVstup,
  PrehledMeta,
  PrehledObalka,
  RadekLide,
  Api,
  AutomationAccount,
  AutomationControl,
  AutomationRunningJob,
  AutomationStatus,
  ChatMessage,
  ChatSender,
  ChatThread,
  ChatThreadInfo,
  CilVstup,
  DruhSignalu,
  DuvodOdmitnutiKod,
  FazeOdmitnuti,
  FiltryMlceni,
  FlagKind,
  Kontakt,
  KontaktPrehled,
  KontaktStatus,
  ListKontaktyFilters,
  ListKontaktyResult,
  MeInfo,
  MojiFiltry,
  MyStats,
  Naklad,
  NakladVstup,
  OborNika,
  OkId,
  OznaceneFiltry,
  OznaceniKategorie,
  PravidloStav,
  PrehledFakta,
  PrehledText,
  Rating,
  Razeni,
  ResolveCallArgs,
  Role,
  Rozvrh,
  RozvrhDen,
  RozvrhDenVstup,
  RozvrhPrehledRadek,
  RozvrhStav,
  Segment,
  Session,
  StatistikyVolani,
  ThreadDetail,
  ThreadScope,
  ThreadStatus,
  UpdatedUser,
  UpdateUserArgs,
  UserStats,
  Vydelek,
  VydelekProdej,
  Vyplata,
  VyplataVstup,
  VysledekDovolani,
  VysledekHovoru,
  ZajemPocty,
  ZajemPodleVolajicich,
  ZajemRadek,
  ZapisHovoruVysledek,
  ZobrazenyStav,
  ZavolatKarta,
  ZavolatPolozka,
  ZavolatSeznam,
  ZavolatStav,
  ZnamkaFiltr,
} from './types';

interface MockUser {
  id: number;
  username: string;
  display_name: string;
  password: string;
  role: Role;
  active: boolean;
  /** nadřízený super admin (migrace 023); super admin ho nemá */
  manager_id: number | null;
}

interface CallLogRow {
  id: number;
  kontakt_id: number;
  user_id: number;
  /** migrace 050: i nerelevantni a preplanovano */
  outcome: VysledekHovoru;
  created_at: string;
  /** známka hovoru (call_log.rating; časová osa Přehledu ji ukáže u hovoru, úkol 14c); ukázkové řádky ji nemají */
  rating?: Rating | null;
}

const now = () => new Date().toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
const delay = (ms = 180) => new Promise<void>((r) => setTimeout(r, ms));

// Demo role (migrace 023): Albert = majitel + super admin; Mikuláš = super admin a pod
// ním Honza; Petra a Eva pod Albertem. Hesla jsou jen pro DEMO (README).
// ⚠ Od migrace 042 (Albert 18. 10. 2026) jsou Petra a Honza Volající (role admin) jako Eva;
// NAHRAZUJE „Petra a Honza = caller“. Role caller na serveru není, mock ji taky nemá.
const users: MockUser[] = [
  { id: 1, username: 'admin', display_name: 'Albert', password: 'admin', role: 'super_admin', active: true, manager_id: null },
  { id: 2, username: 'petra', display_name: 'Petra', password: 'volam', role: 'admin', active: true, manager_id: 1 },
  { id: 3, username: 'honza', display_name: 'Honza', password: 'volam', role: 'admin', active: true, manager_id: 4 },
  { id: 4, username: 'mikulas', display_name: 'Mikuláš', password: 'mikulas', role: 'super_admin', active: true, manager_id: null },
  { id: 5, username: 'eva', display_name: 'Eva', password: 'eva', role: 'admin', active: true, manager_id: 1 },
];

let nextUserId = 6;
let nextKontaktId = 100;
let nextCallLogId = 1;

function k(partial: Partial<Kontakt> & { id: number }): Kontakt {
  return {
    phone: null,
    name: null,
    ma_web: null,
    web: null,
    email: null,
    note: null,
    status: 'nekontaktovano',
    rating: null,
    cena_web: null,
    cena_hosting: null,
    last_caller: null,
    lock_by: null,
    lock_at: null,
    obor: 'chata',
    lovable_project_id: null,
    live_url: null,
    flag_kind: null,
    flag_note: null,
    flagged_at: null,
    flagged_by: null,
    first_proposal_at: null,
    last_our_reply_at: null,
    last_client_reply_at: null,
    // migrace 057: kdy se naposledy změnil stav (na serveru trigger z migrace 013; starý kontakt null)
    status_changed_at: null,
    // migrace 028: segment + pole architekta (u chat prázdná, CHECK kontakty_architekt_pole_check)
    segment: 'chata',
    firma: null,
    mesto: null,
    ico_osobni: null,
    ico_firma: null,
    dph_osobni: null,
    dph_firma: null,
    // migrace 060 (Albert 1. 11. 2026): hvězda „velký zájem“ (sloupce kontaktu, CHECK hvezda_at a hvezda_kdo obě nebo žádná)
    hvezda_at: null,
    hvezda_kdo: null,
    hvezda_duvod: null,
    // přehled klienta: kdy ho automatizace naposledy zapsala (sloupec kontaktu, seznamy ho posílají; samotný přehled ne)
    prehled_at: null,
    created_at: daysAgo(30),
    updated_at: daysAgo(5),
    ...partial,
  } as Kontakt;
}

/** Čekání na odpověď (migrace 014) — stejná pravidla jako SQL kontakt_cekani/kontakt_kos. */
function cekaniOf(c: Kontakt): { kind: CekaniKind | null; since: string | null } {
  // migrace 050 (Albert 21. 10. 2026): nerelevantni nikdy nečeká, jako odmitnuto
  // migrace 059 (Albert 30. 10. 2026): ani nekontaktovat, bez_odpovedi a pozdeji (má vlastní budík); sleva_nabidnuta čeká
  if (['zaplaceno', 'domena_pripojena', 'hotovo', 'odmitnuto', 'pozastaveno', 'nerelevantni',
       'nekontaktovat', 'bez_odpovedi', 'pozdeji'].includes(c.status))
    return { kind: null, since: null };
  if (c.last_client_reply_at && c.last_our_reply_at && c.last_our_reply_at > c.last_client_reply_at)
    return { kind: 'ceka_po_odpovedi', since: c.last_our_reply_at };
  if (!c.last_client_reply_at && c.first_proposal_at)
    return { kind: 'ceka_prvni', since: c.first_proposal_at };
  return { kind: null, since: null };
}
function kosOfMock(since: string | null): CekaniKos | null {
  if (!since) return null;
  const d = (Date.now() - new Date(since).getTime()) / 86_400_000;
  if (d < 7) return 'cerstve';
  if (d < 30) return 'k_zavolani';
  if (d < 60) return 'vlazne';
  return 'vychladle';
}

const kontakty: Kontakt[] = [
  // --- ukázka pro filtry čekání (migrace 014) ---
  k({
    id: 90,
    name: 'Chalupa Tichá — čeká na první odpověď',
    phone: '+420 606 100 100',
    email: 'ticha@example.cz',
    status: 'navrh_odeslan',
    live_url: 'https://chalupa-ticha.example.app',
    // migrace 060: 15 dní = vždy aspoň 7 celých pracovních dní (i přes Vánoce), označení „Neodpověděl na návrh“ v každý den
    first_proposal_at: daysAgo(15),
    last_our_reply_at: daysAgo(15),
  }),
  k({
    id: 91,
    name: 'Chata Mlčenlivá — mlčí rok',
    phone: '+420 606 200 200',
    email: 'mlcenliva@example.cz',
    status: 'navrh_odeslan',
    first_proposal_at: daysAgo(300),
    last_our_reply_at: daysAgo(300),
  }),
  k({
    // ⚠ Migrace 060 (Albert 1. 11. 2026): příznak neodpovida je pryč (migrace staré zrušila), mlčení po naší odpovědi
    // ukazuje označení „Neodpověděl na změny“ (bez volajícího). NAHRAZUJE flag_kind 'neodpovida' z migrace 014; kontakt
    // má místo něj příznak od automatizace info_neoverene (označení i příznak najednou, jako u většiny živých klientů).
    id: 92,
    name: 'Penzion U Kašny — neodpovídá po naší odpovědi',
    phone: '+420 606 300 300',
    email: 'kasna@example.cz',
    status: 'ceka_na_klienta',
    live_url: 'https://penzion-u-kasny.example.app',
    first_proposal_at: daysAgo(40),
    last_client_reply_at: daysAgo(25),
    last_our_reply_at: daysAgo(15),
    flag_kind: 'info_neoverene',
    flag_note: 'Texty a fotky jsou z inzerátu, klient je zatím nepotvrdil.',
    flagged_at: daysAgo(40),
    flagged_by: 'automatizace',
  }),
  // --- označení k zavolání, hvězda a přehled (migrace 060, Albert 1. 11. 2026) ---
  // Jen vymyšlená data (example.cz, čísla 731 000 19x). Kdo je označený, počítá mock stejně jako tick (obnovOznaceni):
  // 93 Petra, návrh bez odpovědi, s hvězdou; 94 Petra, změny bez odpovědi i s příznakem; 95 Petra, návrh před 2 dny
  // (ještě ne 5 pracovních dní); 96 Petra mu volala, ale zájem zapsal Honza (označení je Honzovo, Petra ho nevidí);
  // 97 nabídka z připomínky kampaně bez odpovědi (označí se, Mikuláš); 98 odmítl a dostal slevu (neoznačí se). Kdo se má
  // označit, mlčí aspoň 15 kalendářních dní: to je v každý den aspoň 7 celých pracovních dní (i přes Vánoce), testy tak
  // nezávisí na tom, jaký je den.
  k({
    id: 93,
    name: 'Chata U Rybníka — návrh bez odpovědi',
    phone: '+420 731 000 193',
    email: 'rybnik@example.cz',
    note: '[2026-10-12 Petra] Zájem A, chtějí web s kalendářem obsazenosti.',
    status: 'navrh_odeslan',
    rating: 'A',
    cena_web: '6 000 Kč',
    cena_hosting: '1 500 Kč/rok',
    last_caller: 'Petra',
    live_url: 'https://chata-u-rybnika.example.app',
    first_proposal_at: daysAgo(18),
    last_our_reply_at: daysAgo(18),
    hvezda_at: daysAgo(17),
    hvezda_kdo: 'Petra',
    hvezda_duvod: 'Chtějí web co nejdřív, na sezónu',
  }),
  k({
    id: 94,
    name: 'Roubenka Na Kopci — změny bez odpovědi',
    phone: '+420 731 000 194',
    email: 'nakopci@example.cz',
    note: '[2026-10-01 Petra] Zájem B, chtějí víc fotek okolí.',
    status: 'ceka_na_klienta',
    rating: 'B',
    last_caller: 'Petra',
    live_url: 'https://roubenka-na-kopci.example.app',
    first_proposal_at: daysAgo(30),
    last_client_reply_at: daysAgo(21),
    last_our_reply_at: daysAgo(15),
    flag_kind: 'info_neoverene',
    flag_note: 'Texty a fotky jsou z inzerátu, klient je zatím nepotvrdil.',
    flagged_at: daysAgo(30),
    flagged_by: 'automatizace',
  }),
  k({
    id: 95,
    name: 'Chalupa Pod Skálou — návrh před 2 dny',
    phone: '+420 731 000 195',
    email: 'podskalou@example.cz',
    status: 'navrh_odeslan',
    rating: 'C',
    last_caller: 'Petra',
    live_url: 'https://chalupa-pod-skalou.example.app',
    first_proposal_at: daysAgo(2),
    last_our_reply_at: daysAgo(2),
  }),
  k({
    id: 96,
    name: 'Chata Na Samotě — zájem u kolegy',
    phone: '+420 731 000 196',
    email: 'nasamote@example.cz',
    note: '[2026-10-08 Petra] Nebrali.\n[2026-10-11 Honza] Zájem B, poslat návrh.',
    status: 'navrh_odeslan',
    rating: 'B',
    last_caller: 'Honza',
    live_url: 'https://chata-na-samote.example.app',
    first_proposal_at: daysAgo(20),
    // migrace 063: naše poslední zpráva je připomínka po lhůtě na zavolání (označení 96 níž, ukázková data druhé etapy)
    last_our_reply_at: daysAgo(2),
  }),
  k({
    id: 97,
    name: 'Chalupa Za Humny — připomínka s nabídkou',
    phone: '+420 731 000 197',
    email: 'zahumny@example.cz',
    status: 'sleva_nabidnuta',
    rating: 'B',
    cena_web: '4 900 Kč',
    last_caller: 'Mikuláš',
    live_url: 'https://chalupa-za-humny.example.app',
    first_proposal_at: daysAgo(40),
    last_our_reply_at: daysAgo(16),
  }),
  k({
    id: 98,
    name: 'Chata Bez Zájmu — odmítl, nabídka odešla',
    phone: '+420 731 000 198',
    email: 'bezzajmu@example.cz',
    status: 'sleva_nabidnuta',
    rating: 'C',
    cena_web: '4 900 Kč',
    last_caller: 'Mikuláš',
    first_proposal_at: daysAgo(35),
    last_our_reply_at: daysAgo(15),
  }),
  k({
    id: 1,
    name: 'Chata Pod Smrkem — Novákovi',
    phone: '+420 601 111 222',
    ma_web: 'ne',
    email: null,
    note: null,
    status: 'nekontaktovano',
  }),
  k({
    id: 2,
    name: 'Roubenka U Lesa',
    phone: '+420 602 333 444, +420 603 555 666',
    ma_web: 'ano',
    web: 'https://roubenka-u-lesa.example.cz',
    email: 'info@roubenka-u-lesa.cz',
    note: '[2026-08-20 Petra] Nebrali telefon, zkusit odpoledne.\n[2026-08-29 Honza] Zase nebrali.',
    status: 'nedovolano',
    // volali mu Petra i Honza (demo pro „Označit jako mého klienta", migrace 024)
    last_caller: 'Honza',
  }),
  k({
    id: 3,
    name: 'Chalupa Vysočina — pan Dvořák',
    phone: '+420 604 777 888',
    ma_web: 'ne',
    email: 'dvorak@seznam.cz',
    note: '[2026-08-18 Honza] Zájem! Chtějí jednoduchý web s fotkami a kalendářem.',
    status: 'zajem',
    rating: 'A',
    cena_web: '4900',
    cena_hosting: '190/měs',
    last_caller: 'Honza',
  }),
  k({
    id: 4,
    name: 'Apartmány Krkonoše',
    phone: '+420 605 123 456',
    ma_web: 'ano',
    web: 'http://apartmany-krkonose.example.cz',
    email: 'rezervace@apartmany-krk.cz',
    note: '[2026-08-10 Petra] Mají starý web, ale nechtějí nic měnit.',
    status: 'odmitnuto',
    last_caller: 'Petra',
  }),
  k({
    id: 5,
    name: 'Chata Lipno — paní Svobodová',
    phone: '+420 606 987 654',
    ma_web: 'ne',
    email: 'svobodova.lipno@gmail.com',
    note: '[2026-08-05 Honza] Zájem, rating B. Chce vidět návrh.\n[2026-08-12 Albert] Návrh odeslán mailem.',
    status: 'navrh_odeslan',
    rating: 'B',
    cena_web: '5900',
    cena_hosting: '190/měs',
    last_caller: 'Honza',
    // migrace 060: návrh odešel den po zájmu a klient mlčí (Honzovo označení „Neodpověděl na návrh“)
    first_proposal_at: daysAgo(26),
    last_our_reply_at: daysAgo(26),
  }),
  k({
    id: 6,
    name: 'Srub Beskydy',
    phone: '+420 607 222 333',
    ma_web: 'ne',
    status: 'nekontaktovano',
  }),
  k({
    id: 7,
    name: 'Penzion Šumava — Kučerovi',
    phone: '+420 608 444 555',
    ma_web: 'ano',
    web: 'https://penzion-sumava.example.cz',
    email: 'kucera@penzion-sumava.cz',
    note: '[2026-07-30 Petra] Zájem, rating A, domluvená cena.\n[2026-08-15 Albert] Web hotový, faktura zaplacena.',
    status: 'zaplaceno',
    rating: 'A',
    cena_web: '4900',
    cena_hosting: '190/měs',
    last_caller: 'Petra',
    live_url: 'https://penzion-sumava.webdomov.cz',
  }),
  k({
    id: 8,
    name: 'Chalupa Orlické hory',
    phone: '+420 609 666 777',
    ma_web: 'ne',
    note: '[2026-08-25 Honza] Vlažný zájem (C), zavolat příští měsíc znovu — zatím nedovoláno napodruhé.',
    status: 'nedovolano',
    rating: 'C',
    last_caller: 'Honza',
  }),
  k({
    id: 9,
    name: 'Chata Jizerky — pan Malý',
    phone: '+420 720 111 999',
    ma_web: 'ne',
    email: 'maly.jizerky@email.cz',
    note: '[2026-08-01 Petra] Zájem A. \n[2026-08-20 Albert] Klient neodpovídá na maily — eskalace.',
    status: 'eskalace',
    rating: 'A',
    cena_web: '4900',
    cena_hosting: '190/měs',
    last_caller: 'Petra',
  }),

  // --- kalendář hovorů, nerelevantní a výdělek (migrace 050, Albert 21. 10. 2026) ---
  // Jen vymyšlená data (example.cz, čísla 7xx 000 1xx). Naplánované hovory k nim jsou v `zavolatRadky` níž; kontakty
  // s čekajícím hovorem next_contact nikomu náhodně nenabídne, proto jsou NAVÍC (fronta pro ostatní testy se nezmenší).
  k({
    // Petra mu volala, člověk byl v práci: přeplánovaný hovor po termínu (karta ve volání ho dá Petře hned první)
    id: 10,
    name: 'Chalupa Na Paloučku',
    phone: '+420 731 000 110',
    ma_web: 'ne',
    note: '[2026-10-20 Petra] Byl v práci, ať zavoláme odpoledne.',
    status: 'nedovolano',
    last_caller: 'Petra',
  }),
  k({
    // Honzův přeplánovaný hovor na zítra (Petra ho ve frontě nedostane, drží ho kalendář)
    id: 11,
    name: 'Srub U Potoka',
    phone: '+420 731 000 111',
    ma_web: 'ne',
    note: '[2026-10-20 Honza] Chce zavolat zítra po třetí.',
    status: 'nedovolano',
    last_caller: 'Honza',
  }),
  k({
    // kontakt bez volajícího, kterému si Petra naplánovala hovor: plánováním se jí rezervoval (last_caller)
    id: 12,
    name: 'Chata Pod Hájem',
    phone: '+420 731 000 112',
    ma_web: 'ne',
    status: 'nekontaktovano',
    last_caller: 'Petra',
  }),
  k({
    // Petra zjistila, že kontakt není relevantní (do konverze se nepočítá)
    id: 13,
    name: 'Chalupa U Lípy — paní Veselá',
    phone: '+420 731 000 113',
    ma_web: 'ne',
    note: '[2026-10-17 Petra] starší člověk · web nechce, chalupu prodává',
    status: 'nerelevantni',
    last_caller: 'Petra',
  }),
  k({
    // Petra prodala TENTO týden (7 000 Kč → 2 100 Kč)
    id: 20,
    name: 'Chalupa Na Vršku',
    phone: '+420 731 000 120',
    ma_web: 'ne',
    email: 'navrsku@example.cz',
    note: '[2026-10-12 Petra] Zájem A, chtějí galerii a mapu.',
    status: 'schvaleno',
    rating: 'A',
    cena_web: '7 000 Kč',
    cena_hosting: '1 500 Kč/rok',
    last_caller: 'Petra',
    live_url: 'https://chalupa-na-vrsku.example.app',
  }),
  k({
    // Honza prodal, ale cena nejde přečíst přesně (rozpětí): do výdělku se nepočítá
    id: 21,
    name: 'Chata Pod Ještědem',
    phone: '+420 731 000 121',
    ma_web: 'ne',
    email: 'jested@example.cz',
    status: 'zaplaceno',
    rating: 'B',
    cena_web: '6000-7000 Kč po domluvě',
    cena_hosting: '190/měs',
    last_caller: 'Honza',
  }),
  k({
    // Honza prodal po nabídce poloviční ceny (sleva_odeslana před prodejem): počítá se 3 500 Kč, ne 7 000 Kč
    id: 22,
    name: 'Roubenka Mlýnek',
    phone: '+420 731 000 122',
    ma_web: 'ano',
    web: 'https://roubenka-mlynek.example.cz',
    email: 'mlynek@example.cz',
    status: 'faktura_odeslana',
    rating: 'B',
    cena_web: '7 000 Kč',
    cena_hosting: '1 000 Kč/rok',
    last_caller: 'Honza',
  }),
  k({
    // Eva prodala za eura (250 € → 75 €): ve výdělku zvlášť, nepřepočítává se
    id: 23,
    name: 'Apartmán Alpský výhled',
    phone: '+420 731 000 123',
    ma_web: 'ne',
    email: 'alpsky@example.cz',
    status: 'hotovo',
    rating: 'A',
    cena_web: '250 eur',
    cena_hosting: '10 eur/měs',
    last_caller: 'Eva',
    live_url: 'https://alpsky-vyhled.example.app',
  }),
  k({
    // migrace 051 (Albert 22. 10. 2026): Honza prodal TENTO týden, cenu při „Mají zájem“ nechal prázdnou (zatím
    // nedohodnutá): v Moji klienti „n/a“, ve výdělku cena i provize „n/a“ a do součtu se nepočítá, dokud cena webu
    // nebude v detailu klienta
    id: 24,
    name: 'Chalupa U Studánky',
    phone: '+420 731 000 124',
    ma_web: 'ne',
    email: 'studanka@example.cz',
    note: '[2026-10-20 Honza] Zájem B, cenu ještě probereme.',
    status: 'schvaleno',
    rating: 'B',
    cena_web: null,
    cena_hosting: null,
    last_caller: 'Honza',
    live_url: 'https://chalupa-u-studanky.example.app',
  }),

  // --- architekti (migrace 028, docs/ARCHITEKTI.md 9.7) ---
  // Jen vymyšlená data: jména „Ukázka / Vzor / Příklad", adresy example.cz, telefony
  // s předvolbou 999 (v ČR neexistuje) a IČO s NEPLATNÝM kontrolním součtem
  // (11111111, 22222222), takže nepatří žádnému skutečnému subjektu.
  k({
    // volatelný, jméno i studio, obě IČO, dvě čísla oddělená středníkem
    id: 300,
    segment: 'architekt',
    obor: 'architekt',
    name: 'Ing. arch. Tomáš Ukázka',
    firma: 'Ukázkový ateliér s.r.o.',
    mesto: 'Brno',
    phone: '+420 999 000 300; +420 999 000 310',
    email: 'ukazka@example.cz',
    web: 'https://ukazka.example.cz',
    ma_web: 'má web',
    ico_osobni: '11111111',
    dph_osobni: 'neplatce',
    ico_firma: '22222222',
    dph_firma: 'platce',
    note: 'Město: Brno, Žabovřesky',
  }),
  k({
    // volatelný, jen studio (bez jména), bez e-mailu, bez webu, bez města, zdroj neznámý
    id: 301,
    segment: 'architekt',
    obor: 'architekt',
    name: null,
    firma: 'Studio Příklad',
    phone: '+420 999 000 301',
    ma_web: 'nemá web',
    ico_firma: '22222222',
    dph_firma: 'neovereno',
  }),
  k({
    // nedovoláno, s příznakem, bez e-mailu, web jen profil; volala Petra
    id: 302,
    segment: 'architekt',
    obor: 'architekt',
    name: 'Ing. arch. Jana Vzorová',
    mesto: 'Praha 6',
    phone: '+420 999 000 302',
    web: 'https://profil.example.cz/jana-vzorova',
    ma_web: 'má web',
    ico_osobni: '11111111',
    dph_osobni: 'identifikovana_osoba',
    status: 'nedovolano',
    last_caller: 'Petra',
    note: '[2026-09-26 Petra] Nebrala, zkusit v úterý dopoledne.',
    flag_kind: 'chybi_email',
    flag_note: 'Na architekta nemáme e-mail. Zjistit při hovoru.',
    flagged_at: daysAgo(2),
    flagged_by: 'Petra',
  }),
  k({
    // návrh odeslán, čeká na první odpověď; volal Honza
    id: 303,
    segment: 'architekt',
    obor: 'architekt',
    name: 'Ing. arch. Petr Příkladný',
    firma: 'Příkladný ateliér',
    mesto: 'Tábor',
    phone: '+420 999 000 303',
    email: 'priklad@example.cz',
    web: 'https://priklad.example.cz',
    ma_web: 'má web',
    ico_firma: '22222222',
    dph_firma: 'neplatce',
    status: 'navrh_odeslan',
    rating: 'B',
    cena_web: '6500',
    cena_hosting: '1000/rok',
    last_caller: 'Honza',
    live_url: 'https://arch-prikladny-tabor.example.cz',
    first_proposal_at: daysAgo(15),
    last_our_reply_at: daysAgo(15),
  }),
];

/* ---------------------------------------------------------------------------
   Obory (migrace 064, Albert 7. 11. 2026; návrh oborů oddíl 6). Registr nik zrcadlí seed serveru: čtyři niky ve stavu
   priprava (žádná zapnutá), volají všichni volající (R9, Albert 8. 11. 2026), ceny jako u architektů (R12). Dokud nika
   není zapnutá, appka ji volajícím neukáže a next_contact ji odmítne stejnou hláškou jako server.
   Ukázkové firmy oborů (jen vymyšlená data: názvy „Ukázka / Vzor / Příklad“, adresy example.cz, telefony s předvolbou
   999, která v ČR neexistuje, IČO s neplatným kontrolním součtem) se do demo dat přidají jen na požádání:
   zapniDemoObory (testy) nebo localStorage `volacka_demo_obory` = čárkami oddělené klíče nik, které se zapnou (např.
   „autoservis“; „vse“ zapne všechny čtyři), nastavené PŘED načtením appky. Bez toho jsou demo data jako před 064.
   --------------------------------------------------------------------------- */

interface MockNika extends OborNika {
  stav: NonNullable<OborNika['stav']>;
  volaji_vsichni: boolean;
}

/** Ukázkové návody stránky „Jak volat“ (Albert 9. 11. 2026: dva jeho dokumenty; na serveru jsou celé v obor_niky.jak_volat). */
const JAK_VOLAT_UKAZKA = [
  '# Jak volat řemeslníkům',
  'Ukázka skriptu pro telefonní specialisty.',
  '',
  '## Jak mluvit',
  '- Mluvte jako normální člověk, ne jako call centrum.',
  '',
  '# Slovníček webových pojmů',
  'Ukázka slovníčku.',
  '',
  '## 1 Základy',
  '- **Doména:** Adresa webu, třeba kominictvinovak.cz.',
].join('\n');

const oborNikyMock: MockNika[] = [
  { klic: 'autoservis', nazev: 'Autoservisy', nazev_mnozne: 'autoservisy', nazev_akuzativ: 'autoservis', nazev_jednotne: 'Autoservis', ikona: 'autoservis', poradi: 1 },
  { klic: 'stavby', nazev: 'Stavby', nazev_mnozne: 'stavební firmy', nazev_akuzativ: 'stavební firmu', nazev_jednotne: 'Stavební firma', ikona: 'stavby', poradi: 2 },
  { klic: 'topeni', nazev: 'Topení', nazev_mnozne: 'topenáři', nazev_akuzativ: 'topenáře', nazev_jednotne: 'Topenář', ikona: 'topeni', poradi: 3 },
  { klic: 'elektro', nazev: 'Elektro', nazev_mnozne: 'elektrikáři', nazev_akuzativ: 'elektrikáře', nazev_jednotne: 'Elektrikář', ikona: 'elektro', poradi: 4 },
].map((n) => ({
  ...n,
  cena_web_vzor: '7 000 Kč',
  hosting_vzor: '1 000 Kč ročně',
  cena_funkce_vzor: 'podle domluvy',
  jak_volat: n.klic === 'autoservis' ? JAK_VOLAT_UKAZKA : null,
  smi_volat: false,
  stav: 'priprava' as const,
  stav_od: daysAgo(1),
  stav_duvod: null,
  volaji_vsichni: true,
}));

/** obor_volajici (migrace 064): lidé, kteří smí niku volat, když volaji_vsichni není true. Seed prázdný. */
const oborVolajiciMock: { segment: string; user_id: number }[] = [];

/** app_segment_platny: chata, architekt nebo klíč z registru (v jakémkoli stavu). */
function segmentPlatnyMock(s: unknown): boolean {
  return s === 'chata' || s === 'architekt' || (typeof s === 'string' && oborNikyMock.some((n) => n.klic === s));
}

/** obor_smi_volat (migrace 064, R9): nika zapnuto a všichni, nebo člověk z obor_volajici. */
function oborSmiVolat(userId: number, klic: string): boolean {
  const n = oborNikyMock.find((x) => x.klic === klic);
  return !!n && n.stav === 'zapnuto' && (n.volaji_vsichni || oborVolajiciMock.some((v) => v.segment === klic && v.user_id === userId));
}

/** app_je_obor (migrace 064): rodina obor = cokoli kromě chata a architekt (null nikdy). */
function jeOborMock(s: string | null | undefined): boolean {
  return !!s && s !== 'chata' && s !== 'architekt';
}

/** Den konce kontroly webů v ukázkových datech (YYYY-MM-DD). */
const WEB_HODNOCENO_DO = '2026-11-06';

/** Vymyšlené firmy oborů: každá kombinace stavu webu a hodnocení aspoň jednou (autoservis), ostatní niky po dvou. */
function demoFirmyOboru(): Kontakt[] {
  const f = (id: number, segment: string, p: Partial<Kontakt>): Kontakt =>
    // šest klíčů hodnocení webu má řádek niky vždy (server je posílá jen niky oboru, i null), chata a architekt ne
    k({ id, segment, obor: segment, phone: `+420 999 000 ${id}`, web_hodnoceni: null, web_stav: null, web_priorita: null,
      web_hodnoceno_do: WEB_HODNOCENO_DO, web_duvod: null, web_socialni: null, ...p });
  return [
    // autoservis: priorita 1 (nemá skutečný web)
    f(400, 'autoservis', { firma: 'Autoservis Ukázka s.r.o.', name: 'Petr Ukázka', mesto: 'Brno', email: 'servis@ukazka-autoservis.example.cz', web: null, ma_web: 'nemá web', web_stav: 'zadny', web_priorita: 1, ico_firma: '33333333' }),
    f(401, 'autoservis', { firma: 'Pneuservis Vzor', name: null, obor: 'pneuservis, geometrie', mesto: 'Olomouc', web_stav: 'jen_socialni', web_priorita: 1, web_socialni: 'https://www.facebook.com/pneuservis.vzor.example', ma_web: 'nemá web' }),
    f(402, 'autoservis', { firma: 'Karosárna Příklad', name: 'Jana Příkladová', mesto: 'Tábor', email: 'info@karosarna-priklad.example.cz', web_stav: 'zaparkovany', web_priorita: 1, ma_web: 'nemá web' }),
    f(403, 'autoservis', { firma: 'Servis Vzorová dílna', mesto: 'Kolín', web_stav: 'jiny_web', web_priorita: 1, ma_web: 'nemá web' }),
    f(404, 'autoservis', { firma: 'Auto Ukázkov', mesto: 'Písek', web_stav: 'katalog', web_priorita: 1, ma_web: 'nemá web' }),
    // priorita 2 (slabý web D až F)
    f(405, 'autoservis', { firma: 'Autodílna Vzor a syn', name: 'Karel Vzor', mesto: 'Plzeň', email: 'dilna@vzor-autodilna.example.cz', web: 'https://vzor-autodilna.example.cz', ma_web: 'má web', web_stav: 'potvrzeny', web_hodnoceni: 'D', web_priorita: 2, web_duvod: 'Na mobilu se nedá zavolat jedním klepnutím. Na webu chybí otevírací doba.' }),
    f(406, 'autoservis', { firma: 'Příklad Motor', mesto: 'Jihlava', web: 'https://priklad-motor.example.cz', ma_web: 'má web', web_stav: 'potvrzeny', web_hodnoceni: 'E', web_priorita: 2, web_duvod: 'Web působí zastarale.' }),
    f(407, 'autoservis', { firma: 'Ukázka Auto Centrum', mesto: 'Zlín', web: 'https://ukazka-centrum.example.cz', ma_web: 'má web', web_stav: 'nepotvrzeny', web_hodnoceni: 'F', web_priorita: 2, web_duvod: 'Na mobilu se stránka špatně zobrazuje. Na webu zůstal text ze šablony. Web má rozbitou češtinu.' }),
    // priorita 3 (web se nenačetl)
    f(408, 'autoservis', { firma: 'Servis Vzorník', mesto: 'Kladno', web: 'https://vzornik-servis.example.cz', ma_web: 'má web', web_stav: 'nenacten', web_priorita: 3 }),
    // priorita 4 (průměrný C)
    f(409, 'autoservis', { firma: 'Autoservis Příkladná', mesto: 'Liberec', email: 'kontakt@prikladna.example.cz', web: 'https://prikladna.example.cz', ma_web: 'má web', web_stav: 'potvrzeny', web_hodnoceni: 'C', web_priorita: 4, web_duvod: 'Na webu chybí přehled služeb.' }),
    // priorita 6 (nehodnocen) a bez priority
    f(410, 'autoservis', { firma: 'Vzor Garage', mesto: 'Opava', web: 'https://vzor-garage.example.cz', ma_web: 'má web', web_stav: 'roboti', web_priorita: 6 }),
    f(411, 'autoservis', { firma: 'Ukázková pneu', mesto: 'Most', web: 'https://ukazkova-pneu.example.cz', ma_web: 'má web', web_stav: 'nekontrolovan', web_priorita: null, web_hodnoceno_do: null }),
    // priorita 5 (dobrý web B, pak A úplně nakonec)
    f(412, 'autoservis', { firma: 'Autoservis Vzorný', mesto: 'Hradec Králové', web: 'https://vzorny-autoservis.example.cz', ma_web: 'má web', web_stav: 'potvrzeny', web_hodnoceni: 'B', web_priorita: 5 }),
    f(413, 'autoservis', { firma: 'Příklad Premium Servis', mesto: 'Pardubice', web: 'https://priklad-premium.example.cz', ma_web: 'má web', web_stav: 'potvrzeny', web_hodnoceni: 'A', web_priorita: 5 }),
    // ostatní niky
    f(420, 'stavby', { firma: 'Stavby Ukázka s.r.o.', name: 'Tomáš Ukázka', mesto: 'Brno', web_stav: 'zadny', web_priorita: 1, ma_web: 'nemá web' }),
    f(421, 'stavby', { firma: 'Rekonstrukce Vzor', mesto: 'Praha 9', web: 'https://rekonstrukce-vzor.example.cz', ma_web: 'má web', web_stav: 'potvrzeny', web_hodnoceni: 'D', web_priorita: 2, web_duvod: 'Na webu nejsou fotky jejich práce.' }),
    f(430, 'topeni', { firma: 'Topenář Příklad', name: 'Jiří Příklad', mesto: 'Ostrava', web_stav: 'jen_socialni', web_priorita: 1, web_socialni: 'https://www.instagram.com/topenar.priklad.example', ma_web: 'nemá web' }),
    f(431, 'topeni', { firma: 'Tepelná čerpadla Vzor', mesto: 'Český Krumlov', web: 'https://cerpadla-vzor.example.cz', ma_web: 'má web', web_stav: 'potvrzeny', web_hodnoceni: 'C', web_priorita: 4, web_duvod: 'Na webu není, kam jezdí.' }),
    f(440, 'elektro', { firma: 'Elektro Ukázka', name: 'Martin Ukázka', mesto: 'Karlovy Vary', web_stav: 'zadny', web_priorita: 1, ma_web: 'nemá web' }),
    f(441, 'elektro', { firma: 'Elektroinstalace Vzor', mesto: 'Teplice', web: 'https://elektro-vzor.example.cz', ma_web: 'má web', web_stav: 'potvrzeny', web_hodnoceni: 'E', web_priorita: 2, web_duvod: 'Na webu visí stará akce.' }),
  ];
}

let demoOboryPridane = false;

/**
 * Přidá vymyšlené firmy oborů do demo dat (jednou) a zapne vybrané niky (stav zapnuto; „vse“ = všechny). Jen DEMO a testy;
 * server niky zapíná živá session na Albertovo slovo (obor_niky.stav).
 */
export function zapniDemoObory(klice: readonly string[]): void {
  if (!demoOboryPridane) {
    demoOboryPridane = true;
    kontakty.push(...demoFirmyOboru());
  }
  const vse = klice.includes('vse');
  for (const n of oborNikyMock) if (vse || klice.includes(n.klic)) n.stav = 'zapnuto';
}

/** Jen DEMO a testy: nastaví stav niky (zkouska, pozastaveno …), jako by ho změnila živá session. */
export function nastavStavNikyDemo(klic: string, stav: MockNika['stav'], volajiVsichni?: boolean): void {
  const n = oborNikyMock.find((x) => x.klic === klic);
  if (!n) throw new Error(`Nika ${klic} v demu není.`);
  n.stav = stav;
  n.stav_od = new Date().toISOString();
  if (volajiVsichni !== undefined) n.volaji_vsichni = volajiVsichni;
}

/** localStorage `volacka_demo_obory` (jen DEMO): niky, které se při načtení appky zapnou, a s nimi ukázkové firmy. */
function demoOboryZUloziste(): void {
  let v: string | null = null;
  try {
    v = typeof localStorage !== 'undefined' ? localStorage.getItem('volacka_demo_obory') : null;
  } catch {
    v = null;
  }
  const klice = (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (klice.length > 0) zapniDemoObory(klice);
}

const callLog: CallLogRow[] = [
  { id: nextCallLogId++, kontakt_id: 2, user_id: 2, outcome: 'nedovolano', created_at: daysAgo(12) },
  { id: nextCallLogId++, kontakt_id: 4, user_id: 2, outcome: 'odmitnuto', created_at: daysAgo(22) },
  { id: nextCallLogId++, kontakt_id: 7, user_id: 2, outcome: 'zajem', created_at: daysAgo(33) },
  { id: nextCallLogId++, kontakt_id: 3, user_id: 3, outcome: 'zajem', created_at: daysAgo(14) },
  { id: nextCallLogId++, kontakt_id: 5, user_id: 3, outcome: 'zajem', created_at: daysAgo(27) },
  { id: nextCallLogId++, kontakt_id: 8, user_id: 3, outcome: 'nedovolano', created_at: daysAgo(7) },
  { id: nextCallLogId++, kontakt_id: 2, user_id: 3, outcome: 'nedovolano', created_at: daysAgo(3) },
  // architekti (migrace 028): 302 volala Petra, 303 Honza
  { id: nextCallLogId++, kontakt_id: 302, user_id: 2, outcome: 'nedovolano', created_at: daysAgo(2) },
  { id: nextCallLogId++, kontakt_id: 303, user_id: 3, outcome: 'zajem', created_at: daysAgo(14) },
  // migrace 050 (Albert 21. 10. 2026): přeplánované a nerelevantní hovory, prodeje pro výdělek
  { id: nextCallLogId++, kontakt_id: 10, user_id: 2, outcome: 'preplanovano', created_at: daysAgo(1) },
  { id: nextCallLogId++, kontakt_id: 11, user_id: 3, outcome: 'preplanovano', created_at: daysAgo(1) },
  { id: nextCallLogId++, kontakt_id: 13, user_id: 2, outcome: 'nerelevantni', created_at: daysAgo(4) },
  { id: nextCallLogId++, kontakt_id: 20, user_id: 2, outcome: 'zajem', created_at: daysAgo(9) },
  { id: nextCallLogId++, kontakt_id: 21, user_id: 3, outcome: 'zajem', created_at: daysAgo(20) },
  { id: nextCallLogId++, kontakt_id: 22, user_id: 3, outcome: 'zajem', created_at: daysAgo(16) },
  { id: nextCallLogId++, kontakt_id: 23, user_id: 5, outcome: 'zajem', created_at: daysAgo(45) },
  // migrace 051 (22. 10. 2026): Honzův zájem bez ceny (kontakt 24, prodaný tento týden)
  { id: nextCallLogId++, kontakt_id: 24, user_id: 3, outcome: 'zajem', created_at: daysAgo(8) },
  // migrace 060 (1. 11. 2026): zájmy u označených klientů (vlastník označení = poslední zájem); 96 volala Petra (nedovolala
  // se), zájem zapsal Honza. Všechny starší než týden (rozvrh tohoto týdne zůstane jako dřív) a v jiné dny než Petřiny hovory,
  // které měří statistiky za den (filtry.test.mjs blok D: 1, 4 a 9 dní).
  { id: nextCallLogId++, kontakt_id: 93, user_id: 2, outcome: 'zajem', created_at: daysAgo(19) },
  { id: nextCallLogId++, kontakt_id: 94, user_id: 2, outcome: 'zajem', created_at: daysAgo(31) },
  { id: nextCallLogId++, kontakt_id: 95, user_id: 2, outcome: 'zajem', created_at: daysAgo(14) },
  { id: nextCallLogId++, kontakt_id: 96, user_id: 2, outcome: 'nedovolano', created_at: daysAgo(24) },
  { id: nextCallLogId++, kontakt_id: 96, user_id: 3, outcome: 'zajem', created_at: daysAgo(21) },
  { id: nextCallLogId++, kontakt_id: 97, user_id: 4, outcome: 'zajem', created_at: daysAgo(41) },
  { id: nextCallLogId++, kontakt_id: 98, user_id: 4, outcome: 'zajem', created_at: daysAgo(36) },
];

/** Události vraceno_do_fronty (kdo a kdy, Date.now()): strop 10 za hodinu ve returnContact. */
const vraceniDoFronty: { user_id: number; at: number }[] = [];

const messages: AdminMessage[] = [
  {
    id: 1,
    kontakt_id: 5,
    from_agent: 'builder-agent',
    subject: 'Chybí fotky pro Chatu Lipno',
    body: 'Klientka poslala jen 2 fotky v nízkém rozlišení. Mám použít ilustrační fotky Lipna, nebo počkat na lepší od klientky?',
    status: 'open',
    reply: null,
    apply_always: false,
    created_at: daysAgo(1),
    resolved_at: null,
    kontakt_name: 'Chata Lipno — paní Svobodová',
    kontakt_phone: '+420 606 987 654',
  },
  {
    id: 2,
    kontakt_id: 9,
    from_agent: 'invoice-agent',
    subject: 'Klient neodpovídá — poslat upomínku?',
    body: 'Pan Malý 14 dní nereaguje na faktury ani maily. Mám poslat druhou upomínku, nebo to řešíte telefonicky?',
    status: 'open',
    reply: null,
    apply_always: false,
    created_at: daysAgo(0),
    resolved_at: null,
    kontakt_name: 'Chata Jizerky — pan Malý',
    kontakt_phone: '+420 720 111 999',
  },
  {
    id: 3,
    kontakt_id: 7,
    from_agent: 'domain-agent',
    subject: 'Doména penzion-sumava.cz je obsazená',
    body: 'Chtěná doména je registrovaná někým jiným. Použil jsem subdoménu webdomov.cz — OK?',
    status: 'resolved',
    reply: 'Ano, subdoména je v pořádku. Vlastní doménu řešíme jen když ji klient výslovně chce.',
    apply_always: true,
    created_at: daysAgo(9),
    resolved_at: daysAgo(8),
    kontakt_name: 'Penzion Šumava — Kučerovi',
    kontakt_phone: '+420 608 444 555',
  },
];

let nextMessageId = 4;

/* ---- chat (migrace 002): vlákna + zprávy ---- */

interface MockThread {
  id: number;
  kontakt_id: number | null;
  subject: string;
  status: ThreadStatus;
  /** Nepovinné — když chybí, odvodí se z kontakt_id (jako DB trigger, migrace 017). */
  scope?: ThreadScope;
  alert_key?: string | null;
  created_by: string;
  last_message_at: string;
  created_at: string;
}

interface MockChatMessage {
  id: number;
  thread_id: number;
  sender_type: ChatSender;
  sender_name: string;
  body: string;
  apply_always: boolean;
  /** návrh pravidla (migrace 024): jeho stav ve frontě ke schválení */
  pravidlo_stav?: PravidloStav | null;
  created_at: string;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600000).toISOString();

/** Demo režim: scope se odvodí stejně jako v DB triggeru (migrace 017). */
function mockScope(t: MockThread): ThreadScope {
  return t.scope ?? (t.kontakt_id === null ? 'automatizace' : 'klient');
}

const chatThreads: MockThread[] = [
  {
    id: 1,
    kontakt_id: 5,
    subject: 'Chybí fotky pro Chatu Lipno',
    status: 'open',
    created_by: 'agent',
    last_message_at: hoursAgo(1),
    created_at: daysAgo(1),
  },
  {
    id: 2,
    kontakt_id: 9,
    subject: 'Klient neodpovídá — poslat upomínku?',
    status: 'open',
    created_by: 'agent',
    last_message_at: hoursAgo(3),
    created_at: hoursAgo(3),
  },
  {
    id: 3,
    kontakt_id: 7,
    subject: 'Doména penzion-sumava.cz je obsazená',
    status: 'resolved',
    created_by: 'agent',
    last_message_at: daysAgo(8),
    created_at: daysAgo(9),
  },
  // Systémové hlášení (admin_alert) — od migrace 023 ho vidí jen Albert.
  {
    id: 4,
    kontakt_id: null,
    subject: 'POZOR: Nefunguje odesílání e-mailů (Google)',
    status: 'open',
    scope: 'automatizace',
    alert_key: 'gws-auth',
    created_by: 'agent',
    last_message_at: hoursAgo(2),
    created_at: hoursAgo(2),
  },
  // Klient, kterému nikdo nevolal (Srub Beskydy) — vidí všichni super admini.
  {
    id: 5,
    kontakt_id: 6,
    subject: 'Srub Beskydy: potřebujeme e-mail na majitele',
    status: 'open',
    created_by: 'agent',
    last_message_at: hoursAgo(6),
    created_at: hoursAgo(6),
  },
];

const chatMessages: MockChatMessage[] = [
  {
    id: 1,
    thread_id: 1,
    sender_type: 'agent',
    sender_name: 'Agent — Chata Lipno',
    body: 'Klientka poslala jen 2 fotky v nízkém rozlišení. Mám použít ilustrační fotky Lipna, nebo počkat na lepší od klientky?',
    apply_always: false,
    created_at: daysAgo(1),
  },
  {
    id: 2,
    thread_id: 1,
    sender_type: 'admin',
    sender_name: 'Albert',
    body: 'Napiš jí ještě jednou o fotky, dej jí do zítřka. Kdyby nic, použij ilustrační.',
    apply_always: false,
    created_at: hoursAgo(5),
  },
  {
    id: 3,
    thread_id: 1,
    sender_type: 'agent',
    sender_name: 'Agent — Chata Lipno',
    body: 'Napsáno. Klientka slíbila poslat nové fotky dnes večer — čekám do zítřejšího rána, pak nasadím ilustrační.',
    apply_always: false,
    created_at: hoursAgo(1),
  },
  {
    id: 4,
    thread_id: 2,
    sender_type: 'agent',
    sender_name: 'Agent — fakturace',
    body: 'Pan Malý 14 dní nereaguje na fakturu ani maily. Mám poslat druhou upomínku, nebo to řešíte telefonicky?',
    apply_always: false,
    created_at: hoursAgo(3),
  },
  {
    id: 5,
    thread_id: 3,
    sender_type: 'agent',
    sender_name: 'Agent — domény',
    body: 'Chtěná doména penzion-sumava.cz je registrovaná někým jiným. Použil jsem subdoménu penzion-sumava.webdomov.cz — je to OK?',
    apply_always: false,
    created_at: daysAgo(9),
  },
  {
    id: 6,
    thread_id: 3,
    sender_type: 'admin',
    sender_name: 'Albert',
    body: 'Ano, subdoména je v pořádku. Vlastní doménu řešíme jen když ji klient výslovně chce.',
    apply_always: true,
    pravidlo_stav: 'zapsano',
    created_at: daysAgo(8),
  },
  {
    id: 7,
    thread_id: 4,
    sender_type: 'agent',
    sender_name: 'Automatizace',
    body: 'Automatizace nemůže poslat klientům ani jeden e-mail a nečte příchozí poštu. Spraví to jen Albert.',
    apply_always: false,
    created_at: hoursAgo(2),
  },
  {
    id: 8,
    thread_id: 5,
    sender_type: 'agent',
    sender_name: 'Agent — Srub Beskydy',
    body: 'Web je hotový, ale na majitele nemáme e-mail. Kdo mu bude volat, zeptejte se prosím na adresu.',
    apply_always: false,
    created_at: hoursAgo(6),
  },
];

let nextThreadId = 6;
let nextChatMessageId = 9;

const sessions = new Map<string, number>(); // token -> user_id

function fail(message: string): never {
  throw new Error(message);
}

function auth(token: string): MockUser {
  let uid = sessions.get(token);
  // Demo relace dřív umřela při každém reloadu (mapa v paměti je prázdná, ale token
  // v localStorage přežije) — správně tvarovaný demo token se sám zaregistruje.
  if (uid === undefined) {
    const m = /^demo-(\d+)-/.exec(token);
    if (m) { const id = Number(m[1]); if (users.some((u) => u.id === id && u.active)) { sessions.set(token, id); uid = id; } }
  }
  const user = users.find((u) => u.id === uid && u.active);
  if (!user) fail('Neplatná nebo vypršelá relace. Přihlaste se znovu.');
  return user;
}

function authAdmin(token: string): MockUser {
  const user = auth(token);
  if (user.role !== 'admin' && user.role !== 'super_admin') fail('Přístup zamítnut: vyžadována role admin.');
  return user;
}

/* ---- kdo co vidí — zrcadlí db/migration_023_role.sql (docs/ROLE-A-VIDITELNOST.md) ---- */

const OWNER_ID = 1;
const JINY = 'jiný volající';

function authOwner(token: string): MockUser {
  const user = auth(token);
  if (user.id !== OWNER_ID) fail('Přístup zamítnut: tohle smí jen Albert.');
  return user;
}

/** app_viditelni (migrace 027): Albert i každý super admin VIDÍ všechny, ostatní jen sebe. */
function visibleIds(u: MockUser): number[] {
  if (u.id === OWNER_ID || u.role === 'super_admin') return users.map((x) => x.id);
  return [u.id];
}

/** app_lide_pod (migrace 027): za koho člověk odpovídá — rozsah ÚPRAV a PSANÍ (Albert všichni). */
function ownPeopleIds(u: MockUser): number[] {
  if (u.id === OWNER_ID) return users.map((x) => x.id);
  if (u.role === 'super_admin') return [u.id, ...users.filter((x) => x.manager_id === u.id).map((x) => x.id)];
  return [u.id];
}

function namesOf(ids: number[]): string[] {
  return users.filter((x) => ids.includes(x.id)).map((x) => x.display_name);
}

/** app_kontakty_uzivatelu: last_caller = jejich jméno NEBO jim kdy volali (call_log). */
function kontaktyOf(ids: number[]): Set<number> {
  const names = namesOf(ids);
  const out = new Set<number>();
  for (const c of kontakty) if (c.last_caller !== null && names.includes(c.last_caller)) out.add(c.id);
  for (const l of callLog) if (ids.includes(l.user_id)) out.add(l.kontakt_id);
  return out;
}

/** Množina kontaktů jednoho uživatele — zrcadlí app_my_kontakt_ids (migrace 003). */
function myKontaktIds(user: MockUser): Set<number> {
  return kontaktyOf([user.id]);
}

function kontaktBezMajitele(kid: number): boolean {
  const c = kontakty.find((k) => k.id === kid);
  const names = users.map((x) => x.display_name);
  return !callLog.some((l) => l.kontakt_id === kid) && !(c?.last_caller && names.includes(c.last_caller));
}

/** app_vlakna_uzivatelu: o jejich klientovi, NEBO je založili (ne agent), NEBO do nich psali. */
function threadsOf(ids: number[]): Set<number> {
  const names = namesOf(ids);
  const ks = kontaktyOf(ids);
  const out = new Set<number>();
  for (const t of chatThreads) {
    if ((t.kontakt_id !== null && ks.has(t.kontakt_id)) || (t.created_by !== 'agent' && names.includes(t.created_by))) {
      out.add(t.id);
    }
  }
  for (const m of chatMessages) if (m.sender_type === 'admin' && names.includes(m.sender_name)) out.add(m.thread_id);
  return out;
}

function isSystemThread(t: MockThread): boolean {
  return mockScope(t) === 'automatizace' && t.created_by === 'agent';
}

/** app_vlakna_viditelna: Albert vše; systémová nikdo jiný; super admin navíc klienty bez volajícího.
 *  Migrace 045 (Albert 20. 10. 2026: Volající vidí stav jen u svých): Volající klientské vlákno jen u svého klienta. */
function visibleThreadIds(u: MockUser): Set<number> {
  const out = threadIdsFor(u, visibleIds(u));
  if (u.id === OWNER_ID || u.role === 'super_admin') return out;
  const moje = kontaktyOf([u.id]);
  for (const t of chatThreads) if (t.kontakt_id !== null && !moje.has(t.kontakt_id)) out.delete(t.id);
  return out;
}

/** app_vlakna_moje (migrace 027): vlákna, do kterých smí PSÁT a která smí VYŘEŠIT —
 *  svých lidí + o klientovi, kterého smí upravit (systémová ne). */
function writableThreadIds(u: MockUser): Set<number> {
  const out = threadIdsFor(u, ownPeopleIds(u));
  for (const t of chatThreads) {
    if (t.kontakt_id !== null && !isSystemThread(t) && canEdit(u, t.kontakt_id)) out.add(t.id);
  }
  return out;
}

function threadIdsFor(u: MockUser, ids: number[]): Set<number> {
  if (u.id === OWNER_ID) return new Set(chatThreads.map((t) => t.id));
  const own = threadsOf(ids);
  const out = new Set<number>();
  for (const t of chatThreads) {
    if (isSystemThread(t)) continue;
    if (own.has(t.id)) out.add(t.id);
    else if (
      u.role === 'super_admin' && t.created_by === 'agent' && t.kontakt_id !== null &&
      mockScope(t) === 'klient' && kontaktBezMajitele(t.kontakt_id)
    ) out.add(t.id);
  }
  return out;
}

/** Před jménem klienta stojí titul nebo iniciála („MgA. Mikuláš Medlík“, „L. Kuba“), jako v SQL masce. */
const TITUL_PRED = /(^|[^\p{L}\p{N}_])(\p{Lu}|Ing|arch|Akad|akad|MgA|Mgr|BcA|Bc|doc|prof|Dr|PhDr|RNDr|JUDr|MUDr)\. $/u;

/**
 * app_bez_diakritiky (migrace 045, recenze 20. 10. 2026): text bez české a středoevropské diakritiky znak za znak
 * (stejná délka, pozice sedí), stejná tabulka jako na serveru. Maska pak pozná i „Mikulas“ a „Matěj“ u „Matej“.
 */
const DIAKRITIKA_Z = 'ÁÀÂÄÃÅĄČĆÇĎĐÉÈÊËĚĘÍÌÎÏĹĽŁŇŃÑÓÒÔÖÕŐŔŘŠŚŤÚÙÛÜŮŰÝŸŽŹŻáàâäãåąčćçďđéèêëěęíìîïĺľłňńñóòôöõőŕřšśťúùûüůűýÿžźż';
const DIAKRITIKA_NA = 'AAAAAAACCCDDEEEEEEIIIILLLNNNOOOOOORRSSTUUUUUUYYZZZaaaaaaacccddeeeeeeiiiilllnnnoooooorrsstuuuuuuyyzzz';
export function bezDiakritiky(s: string): string {
  let out = '';
  for (const ch of s) {
    const i = DIAKRITIKA_Z.indexOf(ch);
    out += i >= 0 ? DIAKRITIKA_NA[i] : ch;
  }
  return out;
}

/**
 * app_poznamka_bez_cizich (migrace 045, Albert 19. a 20. 10. 2026: čísla jiných lidí vidí jen super admin,
 * „Hide all of it“): jméno z `cizi` v poznámce nahradí „jiný volající“. V hlavičce „[datum Jméno]“
 * a „[datum Jméno, …]“ vždy, v ostatním textu jako samostatné slovo (velikost písmen ani diakritika nerozhoduje,
 * recenze 20. 10. 2026), ale ne jako část jména klienta (za jménem příjmení s velkým písmenem, před ním titul nebo
 * iniciála). Jména z `vlastni` zůstávají; nejdelší jméno první, aby „Adam“ nesáhl do „Adam T“. Skloňované tvary
 * („Honzovi“) maska nepozná. Server to dělá v řádcích, hledání a vláknech (app_kontakt_ven, list_kontakty,
 * get_thread, list_threads). ⚠ NAHRAZUJE „jen hlavičky a jen pro hledání; text poznámky zůstává (Albert 25. 9. 2026)“.
 */
export function poznamkaBezCizich(note: string | null, cizi: string[], vlastni: string[] = []): string | null {
  if (note === null || cizi.length === 0) return note;
  let out = note.replace(/[]/g, '');
  const kusy: string[] = [];
  const jmena = [...new Set([...cizi, ...vlastni].map((x) => x.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0));
  for (const jm of jmena) {
    // hledá se v textu bez diakritiky; pozice sedí na původní text (bezDiakritiky mění znak za znak)
    const bez = bezDiakritiky(out);
    const jmBez = bezDiakritiky(jm);
    if (!bez.toLowerCase().includes(jmBez.toLowerCase())) continue;
    const doslova = jmBez.replace(/[.^$*+?()[\]{}|\\]/g, '\\$&');
    const maskovat = cizi.includes(jm) && !vlastni.includes(jm);
    let res = '';
    let od = 0;
    for (const m of bez.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_])${doslova}(?![\\p{L}\\p{N}_])`, 'giu'))) {
      const pos = m.index ?? 0;
      const delka = m[0].length;
      const pred = bez.slice(0, pos);
      const za = bez.slice(pos + delka);
      const hlavicka = /\[\d{4}-\d{2}-\d{2} $/.test(pred);
      const klient = /^ \p{Lu}/u.test(za) || TITUL_PRED.test(pred);
      kusy.push(maskovat && (hlavicka || !klient) ? JINY : out.slice(pos, pos + delka));
      res += `${out.slice(od, pos)}${kusy.length}`;
      od = pos + delka;
    }
    out = res + out.slice(od);
  }
  return out.replace(/(\d+)/g, (_m: string, i: string) => kusy[Number(i) - 1]);
}

const radkyPoznamky = (s: string | null): string[] => (s === null || s === '' ? [] : s.split('\n'));

/** btrim a trim v SQL: oříznou jen obyčejné mezery (ne tabulátor ani konec řádku), na rozdíl od String.trim(). */
const oriznoutMezery = (s: string): string => s.replace(/^ +| +$/g, '');

/** left(text, 80) v SQL: prvních 80 znaků (kódových bodů, ne jednotek UTF-16). */
const prvnich80 = (s: string | null): string => [...(s ?? '')].slice(0, 80).join('');

/**
 * app_jmeno_klic (migrace 046, dvě recenze 045 z 20. 10. 2026): klíč pro porovnání jmen a hlaviček poznámky, krok za
 * krokem jako na serveru: pryč neviditelné znaky (nulová šířka, měkký spojovník, směr textu, kombinující diakritika),
 * každá mezera Unicode (NBSP, tabulátor, úzké mezery) jako obyčejná, cyrilice, řečtina a široké znaky podobné latince
 * jako latinka, pomlčky jako „-“, závorky jako „[“ a „]“ (tabulka KLIC_Z a KLIC_NA, znak za znak), pak bezDiakritiky,
 * malá písmena, mezery sloučené a oříznuté. Délka se mění, proto jen na porovnání, nikdy na pozice v textu.
 * Tabulka je zapsaná únikovými sekvencemi \u, aby v kódu nebyl žádný neviditelný ani cyrilský znak.
 */
const KLIC_NEVIDITELNE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\u0300-\u036F]/g;
const KLIC_MEZERY = /[\u0009-\u000D\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g;
export const KLIC_Z =
  // cyrilice a řečtina, velká písmena
  '\u0410\u0412\u0415\u041A\u041C\u041D\u041E\u0420\u0421\u0422\u0425\u0423\u0405\u0406\u0408\u051A\u051C\u0391\u0392\u0395\u0396\u0397\u0399\u039A\u039C\u039D\u039F\u03A1\u03A4\u03A5\u03A7' +
  // cyrilice a řečtina, malá písmena
  '\u0430\u0435\u043E\u0440\u0441\u0443\u0445\u0455\u0456\u0458\u04BB\u0501\u051B\u051D\u043A\u043C\u0442\u043D\u0432\u03B1\u03BF\u03C1\u03B9\u03BA\u03BD\u03C4\u03C5\u03C7' +
  // široká písmena A a B b až Z z
  '\uFF21\uFF41\uFF22\uFF42\uFF23\uFF43\uFF24\uFF44\uFF25\uFF45\uFF26\uFF46\uFF27\uFF47\uFF28\uFF48\uFF29\uFF49\uFF2A\uFF4A\uFF2B\uFF4B\uFF2C\uFF4C\uFF2D\uFF4D' +
  '\uFF2E\uFF4E\uFF2F\uFF4F\uFF30\uFF50\uFF31\uFF51\uFF32\uFF52\uFF33\uFF53\uFF34\uFF54\uFF35\uFF55\uFF36\uFF56\uFF37\uFF57\uFF38\uFF58\uFF39\uFF59\uFF3A\uFF5A' +
  // široké číslice
  '\uFF10\uFF11\uFF12\uFF13\uFF14\uFF15\uFF16\uFF17\uFF18\uFF19' +
  // závorky „[“ a „]“, pomlčky a mínus
  '\uFF3B\u3010\u27E6\u2045\uFE5D\uFF3D\u3011\u27E7\u2046\uFE5E\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D';
export const KLIC_NA =
  'ABEKMHOPCTXYSIJQWABEZHIKMNOPTYXaeopcyxsijhdqwkmthbaopikvtuxAaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz0123456789[[[[[]]]]]----------';
export function jmenoKlic(s: string | null | undefined): string {
  if (s === null || s === undefined) return '';   // server vrátí null; mock prázdný klíč, který se nikdy nerovná jménu
  let prelozeno = '';
  for (const ch of s.replace(KLIC_NEVIDITELNE, '').replace(KLIC_MEZERY, ' ')) {
    const i = KLIC_Z.indexOf(ch);
    prelozeno += i >= 0 ? KLIC_NA[i] : ch;
  }
  return oriznoutMezery(bezDiakritiky(prelozeno).toLowerCase().replace(/ {2,}/g, ' '));
}

/**
 * Hlavička s datem „[YYYY-MM-DD …]“ jen na začátku řádku v klíči (app_hlavicka_cizi i app_poznamka_zpet; recenze 046,
 * 20. 10. 2026: ⚠ NAHRAZUJE „hlavička kdekoli v textu“, datum v závorkách uprostřed řádku hlavička není).
 * Druhá recenze 046 (20. 10. 2026; ⚠ NAHRAZUJE „hlavička přesně na začátku klíče“): před hlavičkou smí stát znaky, které
 * nejsou písmeno ani číslice (odrážka „- “, neviditelné znaky, které klíč nezná: U+E0100, U+E0020, U+2800, U+1D173,
 * U+FFF9), hlavička to pořád je; jako „[^[:alnum:][]*“ na serveru (písmena a desítkové číslice Unicode).
 */
const HLAVICKA_NA_ZACATKU = /^[^\p{L}\p{Nd}[]*\[ ?\d{4} ?- ?\d{1,2} ?- ?\d{1,2}([^\][]*)/u;
const HLAVICKA_RADKU = /^[^\p{L}\p{Nd}[]*(\[ ?\d{4} ?- ?\d{1,2} ?- ?\d{1,2}([^\][]*)\]?)/u;
/** Konce řádků jako v app_hlavicka_cizi: \r\n, \n až \r, U+0085, U+2028 a U+2029. */
const KONCE_RADKU = /\r\n|[\n\v\f\r\u0085\u2028\u2029]/;

/**
 * app_hlavicka_cizi (migrace 046, dvě recenze 045 a recenze 046 z 20. 10. 2026): první hlavička s datem na začátku
 * řádku textu (konce řádků i Unicode), která nenese žádné z vlastních jmen (za jménem smí být jen „, …“), porovnáno
 * klíčem jmenoKlic; null = žádná cizí. Volající smí řádek začít hlavičkou s datem jen se svým jménem: neviditelný
 * znak, cyrilice, NBSP nebo tabulátor za datem, chybějící mezera, mezera na začátku ani jiná velikost písmen kontrolu
 * neobejdou. Datum v závorkách uprostřed řádku („zavolat [2026-10-25 odpoledne]“) projde.
 */
export function hlavickaCizi(text: string | null, vlastni: string[]): string | null {
  const klice = vlastni.map((v) => jmenoKlic(v)).filter((kl) => kl !== '');
  for (const radek of (text ?? '').split(KONCE_RADKU)) {
    const h = HLAVICKA_RADKU.exec(jmenoKlic(radek));
    if (!h) continue;
    const jm = oriznoutMezery(h[2]);
    if (!klice.some((kl) => jm === kl || jm.startsWith(`${kl},`))) return h[1];
  }
  return null;
}

/**
 * Druhá recenze 046 (20. 10. 2026, pravidlo 045; ⚠ NAHRAZUJE „za vlastním jménem cokoli za čárkou“): hlavička s datem na
 * začátku některého řádku textu, ve které je jméno kolegy nebo „jiný volající“ kdekoli, i za čárkou („[2026-10-20 Petra,
 * Honza] Honza souhlasí“, „[2026-10-20 tabulka, Honza] x“): maska jmen kolegů v klíči (jména i text jmenoKlic) by ji
 * změnila. Jako dotaz nad app_jmeno_klic a app_poznamka_bez_cizich v app_poznamka_zpet na serveru.
 */
function hlavickaSKolegou(text: string, kliceCizich: string[], kliceVlastnich: string[]): boolean {
  for (const radek of text.split(KONCE_RADKU)) {
    const h = HLAVICKA_RADKU.exec(jmenoKlic(radek));
    if (h && (h[1].includes('jiny volajici') || poznamkaBezCizich(h[1], kliceCizich, kliceVlastnich) !== h[1])) return true;
  }
  return false;
}

/**
 * app_poznamka_zpet (migrace 045 a 046, recenze 045 a dvě další recenze 20. 10. 2026): poznámka, kterou ukládá Volající,
 * krok za krokem jako na serveru. Řádky kolegů jsou jen ke čtení: řádek, který maska mění, a každý řádek záznamu
 * kolegy (hlavička „[datum Jméno]“ se jménem kolegy a řádky bez hlavičky za ní až do další hlavičky; `celaCizi` =
 * celý uložený text je kolegův, poznámka příznaku, který dal kolega). Každý musí v nové poznámce zůstat beze změny
 * a ve stejném pořadí a uloží se doslova (přiřazení podle pořadí, takže se dva stejně maskované řádky dvou kolegů
 * nespletou); záznam kolegy zůstane celý (nic se do něj nevloží, nic se z něj nevyjme). Nový nebo upravený řádek smí
 * mít hlavičku s datem jen s vlastním jménem (hlavickaCizi). Konce řádků \r\n a \r jako \n. Vlastní řádky volně.
 * ⚠ NAHRAZUJE „řádek kolegy = řádek, který maska mění“ a „hlavička nesmí nést jméno kolegy ani jiný volající“
 * (podobu po první recenzi 20. 10. 2026).
 * Recenze 046 (20. 10. 2026; ⚠ NAHRAZUJE odmítnutí „Řádek hned za záznamem kolegy začněte hlavičkou …“): prázdný řádek
 * nepatří nikomu (nikdy se neodmítne, záznam jím nekončí), vlastní řádek bez hlavičky v záznamu kolegy dostane hlavičku
 * „[dnešní den v Praze vlastní jméno] “ a jméno z hlavičky uloženého řádku, který kolegův není (systémová hlavička),
 * smí být i v novém řádku (nikdy jméno kolegy, „jiný volající“, prázdné ani jméno začínající jménem kolegy).
 * Druhá recenze 046 (20. 10. 2026): hlavička i za odrážkou nebo neviditelným znakem; v hlavičce nového řádku ani za čárkou
 * jméno kolegy nebo „jiný volající“ (hlavickaSKolegou); poznámka příznaku kolegy (`celaCizi`) je celá jeden jeho záznam
 * (beh 0 u každého neprázdného řádku, výstup začíná v něm): nic se do ní nevloží, řádek připsaný na konec dostane vlastní
 * hlavičku a uložený řádek s hlavičkou její záznam nekončí (⚠ NAHRAZUJE „celaCizi chrání jen uložené řádky“).
 */
export function poznamkaZpet(
  ulozena: string | null,
  nova: string | null,
  cizi: string[],
  vlastni: string[] = [],
  celaCizi = false,
): string | null {
  if (cizi.length === 0) return nova;   // super admin a Albert ukládají beze změny
  const st = radkyPoznamky(ulozena);
  // konce řádků: \r\n i samotné \r jako \n (jinak by se řádek kolegy s \r na konci nenašel)
  const nv = radkyPoznamky(nova === null ? null : nova.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));
  const n = st.length;
  const m = nv.length;
  if (n * m > 160000) fail('Poznámka je na uložení moc dlouhá, zkraťte ji.');
  const ck = cizi.filter((x) => oriznoutMezery(x) !== '').map((x) => jmenoKlic(x));
  const vk = vlastni.filter((x) => oriznoutMezery(x) !== '').map((x) => jmenoKlic(x));
  const maska = st.map((x) => poznamkaBezCizich(x, cizi, vlastni) ?? '');
  const kol: boolean[] = [];   // uložený řádek kolegy (Volající ho dostává maskovaný nebo patří k záznamu kolegy)
  const hk: boolean[] = [];    // uložený řádek je hlavička se jménem kolegy (začátek jeho záznamu)
  const beh: number[] = [];    // beh[k] = hlavička kolegy, k jejímuž záznamu uložený řádek k patří (-1 = žádná, prázdný vždy -1;
                               // celaCizi: 0 u každého neprázdného řádku, celý text je jeden záznam kolegy)
  const sys: string[] = [];    // jména z hlaviček uložených řádků, které kolegovy nejsou (smí zůstat v upraveném řádku)
  let b = -1;
  for (let k = 0; k < n; k++) {
    hk[k] = false;
    beh[k] = -1;
    kol[k] = false;
    const kl = jmenoKlic(st[k]);
    if (kl === '') continue;   // prázdný řádek nepatří nikomu (recenze 046)
    const h = HLAVICKA_NA_ZACATKU.exec(kl);
    if (h) {
      hk[k] = ck.includes(oriznoutMezery(h[1].split(',')[0]));
      b = hk[k] ? k : -1;
    }
    beh[k] = celaCizi ? 0 : b;   // druhá recenze 046: poznámka příznaku kolegy je celá jeden jeho záznam
    kol[k] = celaCizi || b >= 0 || maska[k] !== st[k];
    if (!kol[k] && h) sys.push(oriznoutMezery(h[1].split(',')[0]));
  }
  // jméno systémové hlavičky nikdy nesmí být jméno kolegy, „jiný volající“, prázdné ani začínat jménem kolegy
  const sysJmena = sys.filter((x) => x !== '' && x !== 'jiny volajici' && !ck.includes(x) && !ck.some((c) => x.startsWith(`${c} `)));
  // vážená nejdelší společná podposloupnost: řádek kolegy váží víc než všechny ostatní shody dohromady
  const w = n + 1;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let v = Math.max(dp[i - 1][j], dp[i][j - 1]);
      if (maska[i - 1] === nv[j - 1]) v = Math.max(v, dp[i - 1][j - 1] + (kol[i - 1] ? w : 1));
      dp[i][j] = v;
    }
  }
  const par = new Array<number>(m).fill(-1);
  const hit = new Array<boolean>(n).fill(false);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (maska[i - 1] === nv[j - 1] && dp[i][j] === dp[i - 1][j - 1] + (kol[i - 1] ? w : 1)) {
      par[j - 1] = i - 1;
      hit[i - 1] = true;
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i -= 1;
    else j -= 1;
  }
  // každý řádek kolegy musí zůstat beze změny a na svém místě vůči ostatním řádkům kolegů
  for (let k = 0; k < n; k++) {
    if (kol[k] && !hit[k]) {
      fail(`Řádek kolegy upravit ani smazat nejde, připište nový řádek. Chybí nebo je změněný či přesunutý řádek „${prvnich80(maska[k])}“.`);
    }
  }
  const jm = oriznoutMezery(vlastni[0] ?? '') || 'vaše jméno';
  // hlavička, kterou dostane vlastní řádek bez hlavičky v záznamu kolegy (dnešní den v Praze, vlastní jméno)
  const pred = oriznoutMezery(vlastni[0] ?? '') !== '' ? `[${denPraha(new Date())} ${oriznoutMezery(vlastni[0] ?? '')}] ` : null;
  const out: string[] = [];
  // druhá recenze 046: v poznámce příznaku kolegy výstup začíná v jeho záznamu (vložení před jeho řádek nebo mezi ně se
  // odmítne, řádek připsaný na konec dostane vlastní hlavičku)
  b = celaCizi ? 0 : -1;
  for (let k = 0; k < m; k++) {
    const p = par[k];
    if (p >= 0) {
      out.push(st[p]);   // uložený řádek doslova (řádek kolegy s původním jménem)
    } else {
      // nový nebo upravený řádek: hlavička „[datum …]“ na začátku jen s vlastním jménem nebo jménem systémové hlavičky,
      // která v poznámce už je; výjimka je vlastní uložený řádek, který se jen přesunul
      if (!st.some((x, s) => !kol[s] && x === nv[k])) {
        if (hlavickaCizi(nv[k], [...vlastni, ...sysJmena]) !== null) {
          fail(`Nový řádek nesmí mít v hlavičce „[datum jméno]“ jiné jméno než vaše (ani jméno kolegy, „jiný volající“ nebo prázdné), napište ho pod svým jménem („[2026-10-20 ${jm}] …“): „${prvnich80(poznamkaBezCizich(nv[k], cizi, vlastni))}“.`);
        }
        // druhá recenze 046 (pravidlo 045): ani za čárkou jméno kolegy nebo „jiný volající“
        if (hlavickaSKolegou(nv[k], ck, vk)) {
          fail(`Nový řádek nesmí mít v hlavičce „[datum jméno]“ jméno kolegy ani „jiný volající“, ani za čárkou, napište ho pod svým jménem („[2026-10-20 ${jm}] …“): „${prvnich80(poznamkaBezCizich(nv[k], cizi, vlastni))}“.`);
        }
      }
      out.push(nv[k]);   // nový řádek přesně, jak ho Volající napsal
    }
    // záznam kolegy zůstává celý: každý řádek patří k témuž záznamu jako v uložené poznámce, nový k žádnému;
    // prázdný řádek nepatří nikomu (nic se nekontroluje, záznam jím nekončí)
    const kl = jmenoKlic(out[k]);
    if (kl === '') continue;
    // (druhá recenze 046: v poznámce příznaku kolegy uložený řádek s hlavičkou jeho záznam nekončí)
    if (HLAVICKA_NA_ZACATKU.test(kl) && !(celaCizi && p >= 0)) b = p >= 0 && hk[p] ? p : -1;
    else if (b >= 0 && !(p >= 0 && beh[p] >= 0) && pred !== null) {
      out[k] = pred + out[k];   // vlastní řádek bez hlavičky v záznamu kolegy dostane vlastní hlavičku (recenze 046)
      b = -1;
    }
    if (b !== (p >= 0 ? beh[p] : -1)) {
      if (p >= 0 && beh[p] >= 0) {
        fail(`Řádek kolegy upravit ani smazat nejde, připište nový řádek. Do záznamu kolegy nejde nic vložit ani z něj nic vyjmout: „${prvnich80(maska[p])}“.`);
      }
      fail(`Řádek hned za záznamem kolegy začněte hlavičkou se svým jménem („[2026-10-20 ${jm}] …“), jinak by patřil ke kolegovu záznamu: „${prvnich80(poznamkaBezCizich(out[k], cizi, vlastni))}“.`);
    }
  }
  if (m === 0) return nova;   // prázdná poznámka (jen když v ní žádný řádek kolegy nebyl)
  return out.join('\n');
}

/**
 * Strop délky poznámek z appky (migrace 046, dvě recenze 045 z 20. 10. 2026; update_kontakt, set_flag): odmítne se jen text,
 * který má víc než 5 000 znaků nebo víc než 100 řádků A je delší než uložená poznámka tak, jak ji ukládající vidí
 * (`videna`, maskovaná: recenze 046, ⚠ NAHRAZUJE „delší než uložený originál“, maska přidá 6 až 10 znaků na jméno
 * kolegy); delší poznámku jde vždy nechat nebo zkrátit; maska roste s druhou mocninou délky. Délka ve znacích jako
 * length() v SQL, řádky jako string_to_array(…, E'\n'); null strop nemá. ⚠ NAHRAZUJE „nejvýš 20 000 znaků a 300 řádků
 * vždy“ (stejný den).
 */
function poznamkaPresStrop(nova: unknown, videna: string | null | undefined): boolean {
  if (nova === null || nova === undefined) return false;
  const t = String(nova);
  const delka = [...t].length;
  return (delka > 5000 || (t === '' ? 0 : t.split('\n').length) > 100) && delka > [...(videna ?? '')].length;
}

/** app_jmena_cizi (migrace 045): jména lidí, které přihlášený vidět nesmí, a ta, která vidí. */
function jmenaPro(u: MockUser): { cizi: string[]; vidi: string[] } {
  const vidi = namesOf(visibleIds(u));
  if (u.id === OWNER_ID) return { cizi: [], vidi };
  return { cizi: users.map((x) => x.display_name).filter((n) => n && !vidi.includes(n)), vidi };
}

/** app_jmena_kolegu (migrace 045, recenze 20. 10. 2026): jména ostatních Volajících (ne super admin, ne Albert),
 *  která přihlášený vidět nesmí; pro vlákna. Jména super adminů a agentů ve vláknech zůstávají. */
function jmenaKolegu(u: MockUser): { kolegove: string[]; vidi: string[] } {
  const vidi = namesOf(visibleIds(u));
  if (u.id === OWNER_ID) return { kolegove: [], vidi };
  return {
    kolegove: users
      .filter((x) => x.role !== 'super_admin' && x.id !== OWNER_ID && x.display_name && !vidi.includes(x.display_name))
      .map((x) => x.display_name),
    vidi,
  };
}

/** app_kontakt_ven: jméno volajícího jen svoje / svých lidí (Albert vše), je_muj. */
function maskedName(u: MockUser, name: string | null): string | null {
  if (name === null) return null;
  if (u.id === OWNER_ID || namesOf(visibleIds(u)).includes(name)) return name;
  return JINY;
}

/**
 * app_smi_upravit (migrace 024): obsah kontaktu smí měnit admin jen u svých klientů,
 * super admin u svých, svých lidí a klientů bez volajícího, Albert u všech, volající nikde.
 */
function canEdit(u: MockUser, kid: number): boolean {
  if (u.role !== 'admin' && u.role !== 'super_admin') return false;
  if (u.id === OWNER_ID) return true;
  if (kontaktyOf(ownPeopleIds(u)).has(kid)) return true;   // migrace 027: úpravy dál jen svoje lidi
  return u.role === 'super_admin' && kontaktBezMajitele(kid);
}

/**
 * app_kontakt_klice_cizi (migrace 045, Albert 20. 10. 2026: Volající vidí stav jen u svých klientů): klíče, které
 * Volající dostane u kontaktu, kterému nevolal (identifikace a kontakt pro hovor). Stejný seznam jako na serveru;
 * nic o průběhu (stav, známka, ceny, poznámky, příznak, kdo volal, nový web, čekání, data změn).
 * Od migrace 064 (Albert 7. 11. 2026, obory) i šest klíčů hodnocení webu firmy (u chat a architektů NULL, mock je u nich
 * nemá a smyčka níž chybějící klíč přeskočí); zbytek oborů v mocku (checkSegment, ukázkové niky) doplní krok B9.
 */
export const KLICE_CIZI = ['id', 'segment', 'name', 'firma', 'phone', 'email', 'web', 'ma_web', 'obor', 'mesto',
  'ico_osobni', 'ico_firma', 'dph_osobni', 'dph_firma',
  'web_hodnoceni', 'web_stav', 'web_priorita', 'web_hodnoceno_do', 'web_duvod', 'web_socialni'] as const;

/**
 * app_bez_cisla_faktury (migrace 048, audit soukromí 20. 10. 2026): číslo faktury z roční řady iDokladu (osm číslic
 * 20RRNNNN, kolem kterých nestojí číslice) „(číslo skryto)“. Řada je jedna pro celou firmu, číslo by Volajícímu řeklo,
 * kolik faktur firma vydala. Stejný vzor jako na serveru.
 */
export function bezCislaFaktury(s: string): string {
  return s.replace(/(?<![0-9])20[0-9]{6}(?![0-9])/g, '(číslo skryto)');
}

function forViewer(u: MockUser, c: Kontakt): Kontakt {
  const je_muj = myKontaktIds(u).has(c.id);
  const { cizi, vidi } = jmenaPro(u);
  // app_kontakt_ven (migrace 045, Albert 20. 10. 2026: Volající vidí stav jen u svých klientů): cizí kontakt jen
  // s klíči z allowlistu, skryto true; vlastní zámek (karta, kterou právě volá) zůstává
  if (cizi.length > 0 && !je_muj) {
    const zdroj = c as unknown as Record<string, unknown>;
    const z: Record<string, unknown> = {};
    // migrace 048 (audit soukromí 20. 10. 2026): e-mail cizí chaty jen na kartě, kterou Volající právě volá (chata ho má
    // skoro jen po zájmu v hovoru, prozradil by, které cizí chaty řekly ano); u architekta zůstává
    const mojeKarta = c.lock_by !== null && c.lock_by === u.id;
    for (const key of KLICE_CIZI) {
      if (!(key in zdroj)) continue;
      if (key === 'email' && segmentOf(c) === 'chata' && !mojeKarta) continue;
      z[key] = zdroj[key];
    }
    z.je_muj = false;
    z.skryto = true;
    z.smi_upravit = canEdit(u, c.id);
    if (c.lock_by !== null && c.lock_by === u.id) {
      z.lock_by = c.lock_by;
      z.lock_at = c.lock_at;
      z.zamceno = true;
    }
    return z as unknown as Kontakt;
  }
  const r: Kontakt = {
    ...c,
    last_caller: maskedName(u, c.last_caller),
    je_muj,
    skryto: false,
    smi_upravit: canEdit(u, c.id),
    zamceno: c.lock_by !== null,
  };
  // app_kontakt_ven (migrace 045, Albert 20. 10. 2026): kdo nevidí všechny lidi (Volající), dostane jména
  // kolegů v poznámkách jako „jiný volající“, kdo z kolegů dal příznak taky, a u cizího zámku jen zamceno
  if (cizi.length > 0) {
    r.note = poznamkaBezCizich(c.note, cizi, vidi);
    r.flag_note = poznamkaBezCizich(c.flag_note, cizi, vidi);
    if (c.flagged_by !== null && cizi.includes(c.flagged_by)) r.flagged_by = JINY;
    // migrace 060 (Albert 1. 11. 2026): kdo dal hvězdu, stejnou maskou jako kdo dal příznak („automatizace“ zůstává), a důvod
    // hvězdy přes masku jmen jako poznámka
    if (c.hvezda_kdo && cizi.includes(c.hvezda_kdo)) r.hvezda_kdo = JINY;
    if (c.hvezda_duvod) r.hvezda_duvod = poznamkaBezCizich(c.hvezda_duvod, cizi, vidi);
    if (c.lock_by !== null && !visibleIds(u).includes(c.lock_by)) {
      r.lock_by = null;
      r.lock_at = null;
    }
    // migrace 061 (Albert 2. 11. 2026: „only the super admins will see this flag, but the callers don't need to see the
    // [flag]“): příznak info_neoverene (Údaje z internetu) Volajícímu vůbec, řádek jako bez příznaku (jako server)
    if (c.flag_kind === 'info_neoverene') {
      r.flag_kind = null;
      r.flag_note = null;
      r.flagged_at = null;
      r.flagged_by = null;
    }
  }
  return r;
}

/**
 * Osobní IČO pryč pro toho, kdo kontakt nesmí upravit ([ALBERT 28], migrace 028). Server
 * klíč odebírá (`- 'ico_osobni'`), takže tu taky CHYBÍ, ne je null. IČO ateliéru, které se
 * rovná osobnímu (živnostník), odpadne s ním i s DPH ateliéru (migrace 032 v seznamech,
 * 036 v úpravách); jiné IČO ateliéru zůstává.
 */
function bezOsobnihoIco(r: Kontakt): Kontakt {
  if (r.smi_upravit) return r;
  if (r.ico_firma != null && r.ico_firma === r.ico_osobni) {
    delete r.ico_firma;
    delete r.dph_firma;
  }
  delete r.ico_osobni;
  return r;
}

/**
 * Řádek SEZNAMU (list_kontakty, my_kontakty, list_flagged; migrace 028 a 032) a ÚPRAVY
 * (update_kontakt, set_flag, clear_flag; migrace 028 a 036): bez osobního IČO pro toho,
 * kdo nesmí upravit. Karta ve volání (next_contact) a oznacit_za_sveho jdou přes kartaPro.
 */
function forList(u: MockUser, c: Kontakt): Kontakt {
  const r = bezOsobnihoIco(forViewer(u, c));
  // Migrace 038 (Albert 3. 10. 2026): volající IČO architekta nevidí ani v seznamech, ani IČO
  // ateliéru jiné než osobní (dřív zůstávalo). Úpravy jsou jen pro adminy, tady se nic nemění.
  if (!icoVidi(u.role)) {
    delete r.ico_osobni;
    delete r.ico_firma;
  }
  return r;
}

/**
 * Karta ve volání (next_contact) a označení klienta (oznacit_za_sveho): admin a super admin
 * dostanou řádek bez masky seznamu (forViewer), volající bez IČO architekta, osobního
 * i ateliéru (Albert 3. 10. 2026, audit APP-8, migrace 037). Server klíče odebírá, takže tu
 * taky CHYBÍ. DPH zůstává, karta z něj ukazuje řádek „obrat“ (obratArchitekta v ui.tsx).
 */
function kartaPro(u: MockUser, c: Kontakt): Kontakt {
  const r = forViewer(u, c);
  if (u.role === 'admin' || u.role === 'super_admin') return r;
  delete r.ico_osobni;
  delete r.ico_firma;
  return r;
}

/** Stejná kontrola jako v SQL funkcích migrace 028 (null = vše jen v seznamech). */
function checkSegment(s: unknown, nullOk: boolean): void {
  // ⚠ Od migrace 064 (obory): i klíč niky z registru (app_segment_platny), hláška jako na serveru
  if (segmentPlatnyMock(s)) return;
  if (nullOk && (s === null || s === undefined)) return;
  fail(`Neplatný segment: ${s === null || s === undefined || s === '' ? '(nic)' : String(s)}. Povolené: chata, architekt nebo obor z registru.`);
}

function mayPick(u: MockUser, target: number | null | undefined, what: string): void {
  if (target == null || target === u.id) return;
  if (!(u.role === 'super_admin' && visibleIds(u).includes(target))) {
    // ⚠ Přehled vedení úkol 10 (18. 11. 2026): věta serveru („… vidí jen jeho super admin.“, migrace 023 až 068 pro my_kontakty,
    // list_flagged a list_threads); NAHRAZUJE „… vidí jen super admin.“, které mock psal jinak než server
    fail(`${what} jiného člověka vidí jen jeho super admin.`);
  }
}

/**
 * Výběr lidí p_user_ids (migrace 074, Přehled vedení, Albert 17. 11. 2026, D7; kontrakt §6): bez null a duplicit; prázdný = null
 * (přesně jako dnes, bez filtru lidí).
 */
function idsVyberu(ids: readonly (number | null | undefined)[] | null | undefined): number[] | null {
  if (!Array.isArray(ids)) return null;
  const x = [...new Set(ids.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)))];
  return x.length > 0 ? x : null;
}

/**
 * Kontrakt §6: Volající smí poslat jen [své id]; cokoli jiného (kolega, super admin, neexistující id) odmítne dnešní větou funkce
 * pro cizího člověka, dřív než cokoli čte. Super admin (i Albert) smí jakákoli id; neexistující nic nenajdou.
 */
function overVyber(u: MockUser, ids: number[], veta: string): void {
  if (u.id === OWNER_ID || u.role === 'super_admin') return;
  if (ids.length !== 1 || ids[0] !== u.id) fail(veta);
}

/** Kontrakt §6: p_user_ids spolu s dnešním parametrem jednoho člověka (nebo p_vsichni). */
const VYBER_DVAKRAT = 'Filtr lidí je zadaný dvakrát (jeden člověk i výběr lidí); pošlete jen jeden z nich.';

/**
 * app_over_jmeno (migrace 023, 042, 046): kontrola zobrazovaného jména. Od migrace 046 (dvě recenze 045, 20. 10. 2026) se vyhrazená jména
 * i jedinečnost porovnávají klíčem jmenoKlic (velikost písmen, diakritika, neviditelné znaky, mezery a znaky podobné
 * latince nerozhodují: „Mikulas“ vedle „Mikuláš“ neprojde) a jméno s neviditelným nebo řídicím znakem neprojde vůbec.
 * Jméno je vzor masky jmen kolegů, proto nesmí být dvojník. ⚠ NAHRAZUJE porovnání jen malými písmeny (042). Od recenze 046
 * (20. 10. 2026) neprojde ani čárka nebo hranatá závorka (i podobná).
 */
const VYHRAZENA = ['agent', 'automatizace', 'dispatcher', 'hlidka', 'watchdog', 'live:session', 'admin', 'system', 'jiny volajici'];
const JMENO_NEVIDITELNE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\u0001-\u001F\u007F]/;

function checkName(name: string, selfId: number | null): void {
  const n = oriznoutMezery(name);
  if ([...n].length < 2 || [...n].length > 60) fail('Zobrazované jméno musí mít 2–60 znaků.');
  if (JMENO_NEVIDITELNE.test(name)) fail('Zobrazované jméno obsahuje neviditelný nebo řídicí znak. Napište ho znovu obyčejnými písmeny.');
  const klic = jmenoKlic(name);
  // recenze 046 (20. 10. 2026): čárka nebo hranatá závorka (i podobná, klíčem) by hlavičku „[datum jméno]“ rozbila
  if (/[\][,]/.test(klic)) fail('Zobrazované jméno nesmí obsahovat čárku ani hranatou závorku (jméno se píše do hlaviček poznámek „[datum jméno]“).');
  // \M v SQL = konec slova (za „agent“ nesmí být písmeno, číslice ani podtržítko)
  if (VYHRAZENA.includes(klic) || /^agent(?![\p{L}\p{N}_])/u.test(klic)) fail(`Jméno „${n}" je vyhrazené pro automatizaci. Zvolte jiné.`);
  if (users.some((x) => x.id !== selfId && jmenoKlic(x.display_name) === klic)) {
    fail(`Jméno „${n}" už má jiný uživatel (velikost písmen ani diakritika nerozhodují). Zvolte jiné (klienti a zprávy se lidem přiřazují podle jména).`);
  }
}

/**
 * Řazení seznamů (migrace 056, Albert 27. 10. 2026; ⚠ migrace 057, Albert 28. 10. 2026, přidala hovor_nejnovejsi
 * a hovor_nejstarsi): zmena_* podle poslední změny, hovor_* podle posledního hovoru, null = výchozí pořadí; jiná hodnota
 * stejná chyba jako server (list_kontakty, my_kontakty).
 */
// ⚠ Migrace 060 (Albert 1. 11. 2026) přidala mlceni a hvezda; NAHRAZUJE čtyři hodnoty z 057 i v hlášce.
const RAZENI_POVOLENA: readonly string[] = ['zmena_nejnovejsi', 'zmena_nejstarsi', 'hovor_nejnovejsi', 'hovor_nejstarsi', 'mlceni', 'hvezda'];
function checkRazeni(r: unknown): void {
  if (r === null || r === undefined || RAZENI_POVOLENA.includes(String(r))) return;
  fail(`Neplatné řazení: ${String(r)}. Povolené: zmena_nejnovejsi, zmena_nejstarsi, hovor_nejnovejsi, hovor_nejstarsi, mlceni, hvezda.`);
}

/**
 * Poslední změna kontaktu jako server od migrace 057 (Albert 28. 10. 2026: „the latest change regarding anything like if we
 * send them a proposal or status change“): nejpozdější z updated_at, status_changed_at, first_proposal_at,
 * last_our_reply_at a last_client_reply_at (greatest přeskočí null). ⚠ NAHRAZUJE „jen updated_at“ z 056.
 */
export function posledniZmena(c: Kontakt): string {
  let nej = c.updated_at;
  for (const cas of [c.status_changed_at, c.first_proposal_at, c.last_our_reply_at, c.last_client_reply_at]) {
    if (cas && new Date(cas).getTime() > new Date(nej).getTime()) nej = cas;
  }
  return nej;
}

/**
 * Poslední hovor kontaktu (migrace 057, Albert 28. 10. 2026: „the last time they were called“): nejpozdější created_at
 * v call_log; `od` = čí hovory se počítají (null = všech lidí: super admin a Albert; jinak jen hovory toho člověka,
 * Volajícímu i u jeho klientů, 045). null = žádný.
 */
function posledniHovor(kontaktId: number, od: number | null): string | null {
  let nej: string | null = null;
  for (const l of callLog) {
    if (l.kontakt_id !== kontaktId || (od !== null && l.user_id !== od)) continue;
    if (nej === null || new Date(l.created_at).getTime() > new Date(nej).getTime()) nej = l.created_at;
  }
  return nej;
}

/** Čí hovory se přihlášenému počítají do posledního hovoru (v_hovory_od na serveru, migrace 057). */
function hovoryOd(u: MockUser): number | null {
  return u.id === OWNER_ID || u.role === 'super_admin' ? null : u.id;
}

/**
 * Kontakt s klíči posledni_zmena a posledni_hovor (migrace 057) PŘED maskou (forList, forViewer), jako server: u cizího
 * kontaktu je Volající nedostane (nejsou v allowlistu KLICE_CIZI). Od migrace 060 (Albert 1. 11. 2026) i mlci_pd a klíče
 * otevřeného označení (klice060): `od` tu zároveň říká, čí označení přihlášený vidí (Volající jen svoje).
 */
function sPoslednimi(c: Kontakt, od: number | null): Kontakt {
  return { ...c, posledni_zmena: posledniZmena(c), posledni_hovor: posledniHovor(c.id, od), ...klice060(c, od) };
}

/**
 * Porovnání podle p_razeni (migrace 056 a 057); 0 = stejně (pak výchozí pořadí). Podle hovoru jsou kontakty bez hovoru
 * v obou směrech na konci (nulls last jako server); `od` jako hovoryOd.
 */
function podleRazeni(razeni: Razeni | null | undefined, a: Kontakt, b: Kontakt, od: number | null): number {
  if (!razeni) return 0;
  if (razeni === 'zmena_nejnovejsi' || razeni === 'zmena_nejstarsi') {
    const ua = new Date(posledniZmena(a)).getTime();
    const ub = new Date(posledniZmena(b)).getTime();
    if (ua === ub) return 0;
    return razeni === 'zmena_nejnovejsi' ? ub - ua : ua - ub;
  }
  // migrace 060 (Albert 1. 11. 2026): mlceni = nejvíc pracovních dní mlčení napřed, nemlčící na konci; hvezda = s hvězdou
  // napřed, pak stejně podle mlčení (shoda = výchozí pořadí)
  if (razeni === 'mlceni' || razeni === 'hvezda') {
    if (razeni === 'hvezda' && !a.hvezda_at !== !b.hvezda_at) return a.hvezda_at ? -1 : 1;
    const pa = mlciPd(a);
    const pb = mlciPd(b);
    if (pa === null || pb === null) return pa === pb ? 0 : pa === null ? 1 : -1;
    return pb - pa;
  }
  const ha = posledniHovor(a.id, od);
  const hb = posledniHovor(b.id, od);
  if (ha === null || hb === null) return ha === hb ? 0 : ha === null ? 1 : -1;
  const ta = new Date(ha).getTime();
  const tb = new Date(hb).getTime();
  if (ta === tb) return 0;
  return razeni === 'hovor_nejnovejsi' ? tb - ta : ta - tb;
}

/**
 * Den prodeje jako server (all_stats s p_den od migrace 056 a výdělek od 050): kontakt_prodej, jinak status_changed_at,
 * jinak updated_at (⚠ od 057 mock status_changed_at vede, NAHRAZUJE „status_changed_at mock nevede“).
 */
function datumProdeje(c: Kontakt): string {
  return kontaktProdej.get(c.id)?.prodano_at ?? c.status_changed_at ?? c.updated_at;
}

/**
 * my_stats / all_stats. `den` (YYYY-MM-DD, migrace 056) = jen hovory toho dne v Praze a prodáno = kontakty prodané
 * toho dne (datumProdeje), u kterých má člověk zájem v hovoru kdykoli (stejná množina jako prodáno celkem).
 */
function statsFor(userId: number, den: string | null = null): MyStats {
  const logs = callLog.filter((l) => l.user_id === userId && (den === null || denPraha(new Date(l.created_at)) === den));
  const calls = logs.length;
  // dovoláno = odmítli + zájem VÝSLOVNĚ jako my_stats na serveru (migrace 050, Albert 21. 10. 2026: nerelevantní ani
  // přeplánované hovory se do konverze nepočítají). ⚠ NAHRAZUJE „všechno kromě nedovolano“ (dřív jiné výsledky nebyly).
  const reached = logs.filter((l) => l.outcome === 'odmitnuto' || l.outcome === 'zajem').length;
  const zajem = logs.filter((l) => l.outcome === 'zajem').length;
  const odmitnuto = logs.filter((l) => l.outcome === 'odmitnuto').length;
  const nedovolano = logs.filter((l) => l.outcome === 'nedovolano').length;
  // prodáno = klient web schválil a dál (migrace 022 — shodně se serverem); za den jen prodané toho dne (056)
  const soldIds = new Set(
    kontakty
      .filter(
        (c) =>
          ['schvaleno', 'faktura_odeslana', 'zaplaceno', 'domena_pripojena', 'hotovo'].includes(c.status) &&
          callLog.some((l) => l.kontakt_id === c.id && l.user_id === userId && l.outcome === 'zajem') &&
          (den === null || denPraha(new Date(datumProdeje(c))) === den)
      )
      .map((c) => c.id)
  );
  return {
    calls,
    reached,
    zajem,
    odmitnuto,
    nedovolano,
    conversion: reached === 0 ? 0 : Math.round((zajem / reached) * 1000) / 10,
    sold: soldIds.size,
  };
}

// Pořadí jako list_kontakty a my_kontakty na serveru (migrace 059, Albert 30. 10. 2026): nové stavy vedle příbuzných
// (sleva_nabidnuta za navrh_odeslan, pozdeji za ceka_na_klienta, bez_odpovedi a nekontaktovat za odmitnuto), pořadí
// dosavadních stavů mezi sebou beze změny; nerelevantni poslední (server: else 40)
const STATUS_ORDER: Record<string, number> = {
  eskalace: 0,
  zajem: 1,
  schvaleno: 2,
  zaplaceno: 3,
  upravy_ve_vyrobe: 4,
  web_ve_vyrobe: 5,
  navrh_odeslan: 6,
  sleva_nabidnuta: 7,
  faktura_odeslana: 8,
  ceka_na_klienta: 9,
  pozdeji: 10,
  domena_pripojena: 11,
  hotovo: 12,
  pozastaveno: 13,
  nedovolano: 20,
  nekontaktovano: 21,
  odmitnuto: 30,
  bez_odpovedi: 31,
  nekontaktovat: 32,
  // migrace 050: nerelevantní na konci, za odmítnutými (konečný stav, nevolá se; server else 40)
  nerelevantni: 40,
};

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/* ---- přepínání účtů Claude (migrace 011) — demo stav v paměti ---- */
const mockAccounts: AutomationAccount[] = [
  { slug: 'albert', label: 'Albert Brunda', email: 'albertbrundaa@gmail.com', token_present: true, updated_at: daysAgo(3) },
  { slug: 'druhy', label: 'Druhý účet', email: null, token_present: false, updated_at: daysAgo(3) },
];
const mockControl: AutomationControl = {
  id: 1,
  active_account: 'albert',
  requested_account: 'albert',
  phase: 'running',
  drain_reason: null,
  requested_by: null,
  requested_at: null,
  drain_started_at: null,
  switched_at: null,
  notified_at: null,
  stop_requested_at: null,
  stopped_at: null,
  stop_notified_at: null,
  started_at: null,
  updated_at: now(),
};
let mockRunning: AutomationRunningJob[] = [];
const mockDemoJobs = (): AutomationRunningJob[] => [
  { id: 901, type: 'build', kontakt_id: 1, kontakt_name: 'Chata Balcar', account: mockControl.active_account, created_at: now(), updated_at: now() },
  { id: 902, type: 'photo', kontakt_id: 2, kontakt_name: 'Chalupa Pod Lesem', account: mockControl.active_account, created_at: now(), updated_at: now() },
];

function mockAuthAdmin(token: string): MockUser {
  // stejná obnova demo relace jako auth() + admin i super admin (migrace 023)
  return authAdmin(token);
}

/** Demo: během vyprazdňování „doběhne" jeden job každých 8 s; po posledním se přepne / vypne. */
function mockAutomationStatus(): AutomationStatus {
  if (mockControl.phase === 'draining' && mockControl.drain_started_at) {
    const t = Date.now() - new Date(mockControl.drain_started_at).getTime();
    mockRunning = mockRunning.filter((_, i) => t < (i + 1) * 8000);
    if (mockRunning.length === 0) {
      if (mockControl.drain_reason === 'stop') {
        mockControl.phase = 'stopped';
        mockControl.stopped_at = now();
      } else {
        mockControl.active_account = mockControl.requested_account;
        mockControl.phase = 'running';
        mockControl.switched_at = now();
      }
      mockControl.drain_reason = null;
      mockControl.updated_at = now();
    }
  }
  return {
    control: { ...mockControl },
    accounts: mockAccounts.map((a) => ({ ...a })),
    running: mockRunning.map((j) => ({ ...j })),
    queued: 2,
  };
}

/* ---- rozvrh volání — zrcadlí db/migration_042_volajici_rozvrh.sql ---- */

/** app_rozvrh_za_hodinu() na serveru; appka číslo bere z odpovědi (hovoru_za_hodinu), ne odtud. */
const ZA_HODINU = 20; // migrace 065 (Albert 9. 11. 2026): 20 hovorů za hodinu, dřív 10

interface MockRozvrh {
  zamceno: boolean;
  nastavil_id: number;
  nastaveno_at: string;
  zmenil_id: number | null;
  zmeneno_at: string | null;
  dny: { den: number; hodiny: number; od: string | null }[];
}

const rozvrhy = new Map<number, MockRozvrh>();
/** Poznámky ke dni: klíč `${user_id}|${YYYY-MM-DD}`. */
const rozvrhPoznamky = new Map<string, { text: string; at: string }>();
/**
 * Hovory z minulých dnů týdne jen pro demo rozvrhu (klíč `${user_id}|${YYYY-MM-DD}` -> počet).
 * Schválně mimo callLog: falešné hovory by v demu změnily frontu volání a „svoje“ klienty, které
 * měří npm test. Server počítá jen call_log; hovory zapsané v demu (resolveCall) se počítají taky.
 */
const demoHovoryRozvrhu = new Map<string, number>();

const PRAHA_DEN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' });
/** Den v Praze jako YYYY-MM-DD (rozvrh, poznámky a hovory se počítají po pražských dnech). */
function denPraha(d: Date): string {
  return PRAHA_DEN.format(d);
}
function posunDen(datum: string, n: number): string {
  const [y, m, d] = datum.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/** ISO den v týdnu: 1 = pondělí … 7 = neděle. */
function isoDen(datum: string): number {
  const [y, m, d] = datum.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}

/** app_rozvrh_stav: rozvrh, hovory a plnění týdne s dneškem `dnes` (bez práv přihlášeného). */
function rozvrhStav(uid: number, dnes = denPraha(new Date())) {
  const hlava = rozvrhy.get(uid) ?? null;
  const dnesI = isoDen(dnes);
  const od = posunDen(dnes, -(dnesI - 1));
  // den, kdy byl rozvrh poprvé nastavený: dny před ním cíl nemají a jejich hovory se nepočítají
  const start = hlava ? denPraha(new Date(hlava.nastaveno_at)) : od;
  const dny: RozvrhDen[] = [];
  for (let i = 1; i <= 7; i++) {
    const datum = posunDen(od, i - 1);
    const sablona = hlava?.dny.find((d) => d.den === i);
    const hodiny = sablona?.hodiny ?? 0;
    const hovory =
      callLog.filter((l) => l.user_id === uid && denPraha(new Date(l.created_at)) === datum).length +
      (demoHovoryRozvrhu.get(`${uid}|${datum}`) ?? 0);
    const pozn = rozvrhPoznamky.get(`${uid}|${datum}`) ?? null;
    const pred = datum < start;
    dny.push({
      den: i,
      datum,
      hodiny,
      od: hodiny > 0 ? sablona?.od ?? null : null,
      cil: pred ? 0 : Math.round(hodiny * ZA_HODINU),
      hovory,
      minuly: datum < dnes,
      dnes: datum === dnes,
      pred_rozvrhem: pred,
      poznamka: pozn?.text ?? null,
      poznamka_at: pozn?.at ?? null,
    });
  }
  const soucet = (f: (d: RozvrhDen) => boolean, v: (d: RozvrhDen) => number) => dny.filter(f).reduce((a, d) => a + v(d), 0);
  const cilV = soucet((d) => d.den < dnesI, (d) => d.cil);
  const cilD = soucet((d) => d.den <= dnesI, (d) => d.cil);
  const hov = soucet((d) => d.datum <= dnes && !d.pred_rozvrhem, (d) => d.hovory);
  let stav: RozvrhStav = 'v_planu';
  let rozdil = 0;
  if (!hlava) stav = 'bez_rozvrhu';
  else if (hov < cilV) { stav = 'pozadu'; rozdil = cilV - hov; }
  else if (hov > cilD) { stav = 'napred'; rozdil = hov - cilD; }
  const dnesD = dny[dnesI - 1];
  const zbyva = Math.max(cilD - hov, 0);
  const jmeno = (id: number | null | undefined) => users.find((u) => u.id === id)?.display_name ?? null;
  return {
    user_id: uid,
    nastaveny: !!hlava,
    zamceno: hlava?.zamceno ?? false,
    nastavil: jmeno(hlava?.nastavil_id),
    nastaveno_at: hlava?.nastaveno_at ?? null,
    zmenil: jmeno(hlava?.zmenil_id),
    zmeneno_at: hlava?.zmeneno_at ?? null,
    hovoru_za_hodinu: ZA_HODINU,
    tyden_od: od,
    tyden_do: posunDen(od, 6),
    dnes,
    dny,
    souhrn: {
      stav,
      rozdil,
      rozdil_hodiny: Math.round((rozdil / ZA_HODINU) * 10) / 10,
      cil_do_vcera: cilV,
      cil_do_dnes: cilD,
      cil_tyden: soucet(() => true, (d) => d.cil),
      hovory_tyden: hov,
      dnes_hodiny: dnesD.hodiny,
      dnes_od: dnesD.od,
      dnes_cil: dnesD.cil,
      dnes_hovory: dnesD.hovory,
      dnes_zbyva: zbyva,
      dnes_zbyva_hodiny: Math.round((zbyva / ZA_HODINU) * 10) / 10,
    },
  };
}

/** app_rozvrh_pro: stav + co s ním smí přihlášený dělat. */
function rozvrhPro(me: MockUser, cil: MockUser): Rozvrh {
  const s = rozvrhStav(cil.id);
  return {
    ...s,
    display_name: cil.display_name,
    role: cil.role,
    smi_upravit: me.role === 'super_admin' || (cil.id === me.id && !s.zamceno),
    smi_odemknout: me.role === 'super_admin' && s.nastaveny && s.zamceno,
    smi_psat_poznamky: cil.id === me.id,
  };
}

const DNY_ZKRATKY = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];

// Demo: Petra má rozvrh nastavený a zamčený a je pozadu, Eva je napřed, Honza rozvrh ještě nemá
// (může si ho nastavit sám). Hovory z minulých dnů týdne jsou jen v demoHovoryRozvrhu.
(() => {
  const dnes = denPraha(new Date());
  const od = posunDen(dnes, -(isoDen(dnes) - 1));
  const tyden = (h: number[], odKdy: (string | null)[]) => h.map((hodiny, i) => ({ den: i + 1, hodiny, od: hodiny > 0 ? odKdy[i] : null }));
  rozvrhy.set(2, {
    zamceno: true, nastavil_id: 2, nastaveno_at: daysAgo(14), zmenil_id: null, zmeneno_at: null,
    dny: tyden([3, 3, 2, 3, 2, 0, 0], ['09:00', '09:00', '14:00', '09:00', '10:00', null, null]),
  });
  rozvrhy.set(5, {
    zamceno: true, nastavil_id: 4, nastaveno_at: daysAgo(14), zmenil_id: null, zmeneno_at: null,
    dny: tyden([2, 2, 2, 2, 2, 2, 2], ['16:00', '16:00', '16:00', '16:00', '16:00', '10:00', '10:00']),
  });
  for (let i = 1; i < isoDen(dnes); i++) {
    const datum = posunDen(od, i - 1);
    const petra = rozvrhy.get(2)!.dny[i - 1].hodiny * ZA_HODINU;
    if (petra > 0) demoHovoryRozvrhu.set(`2|${datum}`, Math.max(petra - 7, 0));
    demoHovoryRozvrhu.set(`5|${datum}`, 2 * ZA_HODINU + 4);
  }
  demoHovoryRozvrhu.set(`5|${dnes}`, 5);
  if (isoDen(dnes) > 2) {
    rozvrhPoznamky.set(`2|${posunDen(od, 1)}`, { text: 'Dopoledne jsem byla u doktora, volala jsem až odpoledne.', at: daysAgo(1) });
  }
})();

/* ---- kalendář hovorů a výdělek: zrcadlí db/migration_050_volani_kalendar_vydelek.sql (Albert 21. 10. 2026) ---- */

const VE_FRONTE = (status: KontaktStatus): boolean => status === 'nekontaktovano' || status === 'nedovolano';
/** Stavy prodeje (prodáno v my_stats od 022, kontakt_prodej od 050). */
const PRODANO_STAVY: KontaktStatus[] = ['schvaleno', 'faktura_odeslana', 'zaplaceno', 'domena_pripojena', 'hotovo'];

/** Řádek tabulky zavolat (migrace 050 B a). Kontakt má nejvýš jeden čekající hovor. */
interface MockZavolat {
  id: number;
  kontakt_id: number;
  user_id: number;
  kdy: string;
  poznamka: string | null;
  stav: ZavolatStav;
  vysledek: string | null;
  rezervace: boolean;
  puvodni_last_caller: string | null;
  vytvoril_id: number | null;
  created_at: string;
  zmenil_id: number | null;
  zmeneno_at: string | null;
  uzavreno_at: string | null;
}

let nextZavolatId = 1;
const zavolatRadky: MockZavolat[] = [];
/** kontakt_prodej: kdy kontakt poprvé vstoupil do stavů prodeje (trigger trg_kontakty_prodano; první vstup platí). */
const kontaktProdej = new Map<number, { prodano_at: string; zdroj: string }>();
/** Události sleva_odeslana (worker poslal nabídku poloviční ceny): text „3 500 Kč místo 7 000 Kč“. Mock jiné události nevede. */
const slevy = new Map<number, { detail: string; created_at: string }[]>();

/** Trigger kontakty_prodano: první vstup do stavů prodeje zapíše datum, návrat a nový vstup ho nemění. */
function zapisProdej(c: Kontakt, predtim: KontaktStatus | null): void {
  if (!PRODANO_STAVY.includes(c.status)) return;
  if (predtim !== null && PRODANO_STAVY.includes(predtim)) return;
  if (!kontaktProdej.has(c.id)) {
    kontaktProdej.set(c.id, { prodano_at: now(), zdroj: `stav ${predtim ?? '(nový kontakt)'} -> ${c.status}` });
  }
}

/** app_zavolat_over_kdy: čas od teď (10 minut zpět kvůli hodinám v telefonu) do roka. */
function overKdy(kdy: string | null | undefined): string {
  if (kdy === null || kdy === undefined || String(kdy).trim() === '') fail('Vyberte den a čas, kdy zavolat.');
  const t = new Date(kdy).getTime();
  // server: PostgREST nepřevede text na timestamptz a celé volání odmítne
  if (Number.isNaN(t)) fail(`invalid input syntax for type timestamp with time zone: "${kdy}"`);
  if (t < Date.now() - 10 * 60 * 1000) fail('Ten čas už je pryč. Vyberte den a čas, který teprve přijde.');
  if (t > Date.now() + 366 * 86400000) fail('Hovor jde naplánovat nejvýš rok dopředu.');
  return new Date(t).toISOString();
}

/** app_zavolat_poznamka: bez řídicích znaků (konce řádků a tabulátor zůstávají), prázdná = null, nejvýš 500 znaků. */
function zavolatPoznamka(p: string | null | undefined): string | null {
  // eslint-disable-next-line no-control-regex
  const v = oriznoutMezery(String(p ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''));
  if (v === '') return null;
  if ([...v].length > 500) fail('Poznámka k naplánovanému hovoru může mít nejvýš 500 znaků.');
  return v;
}

/** Čekající hovor kontaktu (unikátní index zavolat_jeden_cekajici). */
function cekajiciHovor(kid: number): MockZavolat | undefined {
  return zavolatRadky.find((z) => z.kontakt_id === kid && z.stav === 'ceka');
}

/** Má hovor volat aktivní člověk? Hovor deaktivovaného nikoho neblokuje a další naplánování ho nahradí (recenze 21. 10. 2026). */
function drziAktivni(z: MockZavolat): boolean {
  return users.some((u) => u.id === z.user_id && u.active);
}

/** Text u hovoru neaktivního člověka, který naplánování nebo přeplánování nahradilo. */
const NEAKTIVNI = 'člověk, který měl volat, už není aktivní';

/** app_zavolat_karta: {id, kdy, poznamka} čekajícího hovoru kontaktu pro toho, kdo ho má volat, jinak null. */
function zavolatKarta(uid: number, kid: number): ZavolatKarta | null {
  const z = zavolatRadky.find((x) => x.kontakt_id === kid && x.stav === 'ceka' && x.user_id === uid);
  return z ? { id: z.id, kdy: z.kdy, poznamka: z.poznamka } : null;
}

/** Karta ve volání s klíčem zavolat (next_contact, zavolat_vzit; migrace 050). */
function kartaSHovorem(u: MockUser, c: Kontakt): Kontakt {
  return { ...kartaPro(u, c), zavolat: zavolatKarta(u.id, c.id) };
}

/**
 * app_zavolat_vrat_rezervaci: kontakt bez volajícího dostal plánováním last_caller (rezervace); když mu ten člověk
 * nikdy nevolal a kontakt je pořád ve frontě, vrátí se původní last_caller (zrušení i přeřazení jinému člověku).
 */
function vratRezervaci(z: MockZavolat): void {
  if (!z.rezervace) return;
  const c = kontakty.find((x) => x.id === z.kontakt_id);
  const jmeno = users.find((u) => u.id === z.user_id)?.display_name;
  if (!c || !VE_FRONTE(c.status) || c.last_caller !== jmeno) return;
  if (callLog.some((l) => l.kontakt_id === z.kontakt_id && l.user_id === z.user_id)) return;
  c.last_caller = z.puvodni_last_caller;
  c.updated_at = now();
}

/**
 * app_zavolat_ven: řádek kalendáře pro přihlášeného. Kontakt stejnou maskou jako v seznamech (forList: Volající
 * u kontaktu, který není jeho, jen allowlist se skryto), kdo hovor naplánoval jen svoje, super admina nebo Alberta,
 * jinak „jiný volající“ (045).
 */
function zavolatVen(me: MockUser, z: MockZavolat): ZavolatPolozka {
  const c = kontakty.find((x) => x.id === z.kontakt_id)!;
  const tvurce = z.vytvoril_id === null ? undefined : users.find((u) => u.id === z.vytvoril_id);
  const vidiTvurce = (t: MockUser) =>
    t.id === me.id || t.id === OWNER_ID || t.role === 'super_admin' || me.id === OWNER_ID || me.role === 'super_admin';
  return {
    id: z.id,
    kontakt_id: z.kontakt_id,
    user_id: z.user_id,
    volajici: users.find((u) => u.id === z.user_id)?.display_name ?? null,
    kdy: z.kdy,
    poznamka: z.poznamka,
    stav: z.stav,
    vysledek: z.vysledek,
    created_at: z.created_at,
    zmeneno_at: z.zmeneno_at,
    uzavreno_at: z.uzavreno_at,
    vytvoril: tvurce ? (vidiTvurce(tvurce) ? tvurce.display_name : JINY) : null,
    muj: z.user_id === me.id,
    smi_upravit: z.stav === 'ceka' && (z.user_id === me.id || me.role === 'super_admin'),
    ve_fronte: VE_FRONTE(c.status),
    kontakt: forList(me, c),
  };
}

/**
 * app_cena_cist (migrace 050): PŘESNÁ cena webu z volného textu, krok za krokem jako na serveru (pravidla
 * orchestrator/model_vyber.py a hosting_cena.py). NFKC, bez diakritiky, malými písmeny; mezery, tečky a čárky mezi
 * trojicemi číslic jsou oddělovače tisíců, „tis“, „tisíc“ a „k“ násobí tisícem, Kč/Kc/CZK/„,-“/nic = koruny, eur a € =
 * eura. Jiná měna, rozpětí (dvě čísla), „do/max/nejvýš/až/od“ před číslem, žádné číslo nebo mimo 1 000 až 1 000 000 Kč
 * (40 až 40 000 €) = nejasná cena (null). \m a \M ze serveru (začátek a konec slova) jsou tu hranice písmen a číslic.
 */
const SLOVO = '[\\p{L}\\p{N}_]';
const CENA_EUR = new RegExp(`(?<!${SLOVO})eur(a|o${SLOVO}*)?(?!${SLOVO})|€`, 'u');
const CENA_JINA_MENA = new RegExp(`(?<!${SLOVO})(usd|gbp|chf|pln|huf|dolar${SLOVO}*)(?!${SLOVO})|[$£]`, 'u');
const CENA_VZOR = `([0-9]{1,3}(?:[ .,][0-9]{3})+(?![0-9])|[0-9]+)\\s*(tis\\.?|tisic${SLOVO}*|k(?!${SLOVO}))?`;
const CENA_PRED = new RegExp(`(^|\\s)(do|max${SLOVO}*\\.?|nejvys${SLOVO}*|az|od)\\s*$`, 'u');
export function cenaCist(p: string | null | undefined): { castka: number | null; mena: 'kc' | 'eur' | null } {
  const nic = { castka: null, mena: null };
  if (p === null || p === undefined || oriznoutMezery(p) === '') return nic;
  const t = bezDiakritiky(p.normalize('NFKC')).toLowerCase();
  let mena: 'kc' | 'eur';
  if (CENA_EUR.test(t)) mena = 'eur';
  else if (CENA_JINA_MENA.test(t)) return nic;
  else mena = 'kc';
  const shody = [...t.matchAll(new RegExp(CENA_VZOR, 'gu'))];
  if (shody.length !== 1) return nic;
  const m = shody[0];
  const hodnota = Number(m[1].replace(/[ .,]/g, '')) * (m[2] !== undefined ? 1000 : 1);
  if (CENA_PRED.test(t.slice(0, m.index ?? 0))) return nic;
  if ((mena === 'kc' && hodnota >= 1000 && hodnota <= 1000000) || (mena === 'eur' && hodnota >= 40 && hodnota <= 40000)) {
    return { castka: hodnota, mena };
  }
  return nic;
}

/** Text ceny ze slevy ke čtení: kus před slovem „místo“ (server: regexp_replace(bez diakritiky, '\mmisto\M.*$', '')). */
function cenaZeSlevy(detail: string): string {
  return bezDiakritiky(detail.toLowerCase()).replace(new RegExp(`(?<!${SLOVO})misto(?!${SLOVO})[\\s\\S]*$`, 'u'), '');
}

/** Text ceny ze slevy pro appku: jak ho agent zapsal („3 500 Kč“), před „místo“ (server: '\mm[ií]sto\M.*$' s 'i'). */
function cenaZeSlevyText(detail: string): string {
  return oriznoutMezery(detail.replace(new RegExp(`(?<!${SLOVO})m[ií]sto(?!${SLOVO})[\\s\\S]*$`, 'iu'), ''));
}

/** app_provize_sazba: 30 % (jediné místo s tím číslem v mocku; appka ho bere z odpovědi, sazba_procent). */
const PROVIZE_PROCENT = 30;

/**
 * app_cena_nezadana (migrace 051, Albert 22. 10. 2026): cena zatím není dohodnutá = null, prázdná nebo zástupná hodnota
 * (x až xxx, yx, 1 až 3 pomlčky, n/a, n.a., po revizi DB i nula: 0, 00, 0 Kč, 0,-; velikost písmen nehraje roli) po trim()
 * se sadou mezer jako JavaScript (server ji má vypsanou stejně). Mock appku (src/ui.tsx) neimportuje, proto je tu vzor
 * ZNOVU a doslova stejný jako CENA_ZASTUPNA a cenaNezadana v src/ui.tsx; měnit všechna tři místa spolu (tabulka vzorků
 * „nezadané ceny“ v tests/volani.test.mjs a v test_051, kontrola 205).
 */
const CENA_ZASTUPNA_MOCK = /^(?:x{1,3}|yx|[-–—]{1,3}|n\/a|n\.a\.|0+(?:\s*(?:kč|kc|czk|,-))?)$/i;
/**
 * app_kontakt_ma_web (db/migration_054_fronta_bez_webu.sql, Albert 25. 10. 2026): má kontakt VLASTNÍ web? Adresa ve `web`
 * (aspoň jedna tečka mezi znaky, jako doména) nebo `ma_web` „má web“, „ma web“ či „ano“ = web; null, prázdné, slovo bez
 * tečky („ne“, „-“), „nemá web“ a cokoli jiného = bez webu.
 * live_url (náš web pro klienta) se nečte. Musí zůstat shodné se serverem (kontrola 214).
 */
export function maVlastniWeb(web: string | null | undefined, maWeb: string | null | undefined): boolean {
  return /\S\.\S/.test(web ?? '') || ['má web', 'ma web', 'ano'].includes((maWeb ?? '').trim().toLowerCase());
}

/**
 * Vrstva kontaktu v průchodech 1 a 2 next_contact (db/migration_054_fronta_bez_webu.sql; Albert 25. 10. 2026 večer: po
 * druhém nedovolání jde architekt bez webu za architekty s webem). Menší napřed, v ní náhodně. Chata vždy 0. Architekt:
 * 0 = bez vlastního webu a méně než 2 nedovolání, 1 = s vlastním webem, 2 = bez webu a 2 a víc nedovolání (call_log
 * s výsledkem nedovolano za celou dobu; preplanovano se nepočítá). Musí zůstat shodné se serverem (kontrola 214).
 */
export function vrstvaFronty(segment: string, web: string | null | undefined, maWeb: string | null | undefined, nedovolani: number): number {
  if (segment !== 'architekt') return 0;
  if (maVlastniWeb(web, maWeb)) return 1;
  return nedovolani >= 2 ? 2 : 0;
}

/**
 * Pořadí firmy ve frontě niky oboru (obor_poradi_fronty, db/migration_064_segment_obory.sql; R7, Albert 8. 11. 2026),
 * menší napřed, rozhoduje až za vrstvou (vrstvaFronty, u niky vždy 0), v něm náhodně: 2 × skupina + 1 za dvě a víc
 * nedovolání. Skupina 0 = priorita 1, 2 a 3 (jedna hodnota, takže se promíchají náhodou; zdroj čísla se nečte),
 * 1 = 4, 2 = 6 a bez priority, 3 = 5 se známkou jinou než A, 4 = 5 se známkou A. Chata a architekt vždy 0 (beze změny).
 * Musí zůstat shodné se serverem (kontrola 255).
 */
export function poradiFronty(segment: string, priorita: number | null | undefined, hodnoceni: string | null | undefined, nedovolani: number): number {
  if (!jeOborMock(segment)) return 0;
  const skupina = priorita === 1 || priorita === 2 || priorita === 3 ? 0 : priorita === 4 ? 1 : priorita === 5 && hodnoceni === 'A' ? 4 : priorita === 5 ? 3 : 2;
  return skupina * 2 + (nedovolani >= 2 ? 1 : 0);
}

export function cenaNezadanaMock(p: string | null | undefined): boolean {
  const t = (p ?? '').trim();
  return t === '' || CENA_ZASTUPNA_MOCK.test(t);
}

/**
 * app_vydelek: výdělek člověka. Kontakt ve stavu prodeje, u kterého má člověk v call_log POSLEDNÍ zájem (po recenzi
 * 21. 10. 2026; my_stats „prodáno“ počítá každého, kdo zájem zapsal). Cena = částka ze slevy (sleva_odeslana PŘED prodejem), jinak cena webu; hosting
 * nikdy. 30 % v Kč na celé koruny, v € na haléře (centy). Tento týden = po až ne v Praze podle data prodeje.
 */
function vydelekPro(uid: number): Vydelek {
  const dnes = denPraha(new Date());
  const od = posunDen(dnes, -(isoDen(dnes) - 1));
  const doDne = posunDen(od, 6);
  const radky: (VydelekProdej & { razeni: number })[] = kontakty
    // po recenzi 21. 10. 2026: prodej patří jen tomu, kdo kontaktu zapsal POSLEDNÍ zájem (jeden web = jedna provize).
    // ⚠ NAHRAZUJE „každému, kdo má u kontaktu zájem“ (my_stats „prodáno“ zůstává beze změny)
    .filter((c) => {
      if (!PRODANO_STAVY.includes(c.status)) return false;
      const posledni = callLog
        .filter((l) => l.kontakt_id === c.id && l.outcome === 'zajem')
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)[0];
      return posledni?.user_id === uid;
    })
    .map((c) => {
      const prodanoAt = kontaktProdej.get(c.id)?.prodano_at ?? c.status_changed_at ?? c.updated_at;
      const sleva = (slevy.get(c.id) ?? [])
        .filter((e) => e.created_at <= prodanoAt)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      const zdrojText = sleva ? cenaZeSlevy(sleva.detail) : c.cena_web;
      // migrace 051: bez slevy a s nedohodnutou cenou webu je cena neznámá (castka, mena i provize null, cena = text jak je)
      const neznama = !sleva && cenaNezadanaMock(c.cena_web);
      const { castka, mena } = neznama ? { castka: null, mena: null } : cenaCist(zdrojText);
      const provize = castka === null ? null : mena === 'kc' ? Math.round((castka * PROVIZE_PROCENT) / 100) : Math.round(castka * PROVIZE_PROCENT) / 100;
      const den = denPraha(new Date(prodanoAt));
      return {
        kontakt_id: c.id,
        jmeno: (c.name ?? '').trim() || (c.firma ?? '').trim() || `#${c.id}`,
        segment: segmentOf(c),
        prodano_at: prodanoAt,
        cena: sleva ? cenaZeSlevyText(sleva.detail) : c.cena_web,
        zdroj: sleva ? ('sleva' as const) : ('cena_web' as const),
        castka,
        mena,
        provize,
        tento_tyden: den >= od && den <= doDne,
        neznama,
        razeni: new Date(prodanoAt).getTime(),
      };
    })
    .sort((a, b) => b.razeni - a.razeni || b.kontakt_id - a.kontakt_id);
  const soucet = (f: (r: VydelekProdej) => boolean) => radky.filter(f).reduce((a, r) => a + (r.provize ?? 0), 0);
  const centy = (n: number) => Math.round(n * 100) / 100;
  return {
    sazba_procent: PROVIZE_PROCENT,
    tyden_od: od,
    tyden_do: doDne,
    prodano: radky.length,
    celkem_kc: soucet((r) => r.mena === 'kc'),
    tyden_kc: soucet((r) => r.mena === 'kc' && r.tento_tyden),
    celkem_eur: centy(soucet((r) => r.mena === 'eur')),
    tyden_eur: centy(soucet((r) => r.mena === 'eur' && r.tento_tyden)),
    // migrace 051: nejasne jen zapsaná nečitelná cena, nedohodnutá zvlášť (neznama); ani jedno se nesčítá
    nejasne: radky.filter((r) => r.castka === null && !r.neznama).length,
    nejasne_tyden: radky.filter((r) => r.castka === null && !r.neznama && r.tento_tyden).length,
    neznama: radky.filter((r) => r.neznama).length,
    neznama_tyden: radky.filter((r) => r.neznama && r.tento_tyden).length,
    prodeje: radky.map(({ razeni: _r, ...r }) => r),
  };
}

// Demo (Albert 21. 10. 2026): Petra má hovor po termínu (ve frontě: karta ve volání ho dá hned první), dnes později
// (klient mimo frontu: „Hotovo“) a zítra (rezervovaný kontakt bez volajícího) a jeden hotový; Honza jeden na zítra.
// Prodeje: Petra 7 (dřív, 4 900 Kč → 1 470 Kč) a 20 (tento týden), Honza 21 (cena nejde přečíst), 22 (po slevě)
// a od migrace 051 24 (tento týden, cena zatím nedohodnutá = „n/a“), Eva 23 (eura). Časy jsou mimo okno připomínky
// (−5 až +30 minut), ať demo po přihlášení nic samo neohlásí.
(() => {
  const dnes = denPraha(new Date());
  const zitra = posunDen(dnes, 1);
  const vPraze = (datum: string, cas: string) => prahaNaIso(datum, cas) ?? now();
  // čas zaokrouhlený na 5 minut (v demu „20:00“, ne „20:02“)
  const kolem = (ms: number) => new Date(Math.round((Date.now() + ms) / 300000) * 300000).toISOString();
  const pridej = (z: Partial<MockZavolat> & Pick<MockZavolat, 'kontakt_id' | 'user_id' | 'kdy'>) => {
    zavolatRadky.push({
      id: nextZavolatId++,
      poznamka: null,
      stav: 'ceka',
      vysledek: null,
      rezervace: false,
      puvodni_last_caller: null,
      vytvoril_id: z.user_id,
      created_at: daysAgo(1),
      zmenil_id: null,
      zmeneno_at: null,
      uzavreno_at: null,
      ...z,
    });
  };
  pridej({ kontakt_id: 10, user_id: 2, kdy: kolem(-2 * 3600000), poznamka: 'Byl v práci, ať zavoláme odpoledne.' });
  pridej({ kontakt_id: 9, user_id: 2, kdy: kolem(2 * 3600000), vytvoril_id: 1, created_at: hoursAgo(3),
    poznamka: 'Domluvit platbu faktury, chce to probrat po telefonu.' });
  // volný kontakt z fronty, který Petře dal Albert (super admin): tím se jí rezervoval
  pridej({ kontakt_id: 12, user_id: 2, kdy: vPraze(zitra, '10:00'), poznamka: 'Majitel bere telefon jen dopoledne.',
    rezervace: true, puvodni_last_caller: null, vytvoril_id: 1, created_at: hoursAgo(5) });
  pridej({ kontakt_id: 11, user_id: 3, kdy: vPraze(zitra, '15:30'), poznamka: 'Chce zavolat zítra po třetí.' });
  pridej({ kontakt_id: 4, user_id: 2, kdy: daysAgo(3), stav: 'hotovo', vysledek: 'hovor: odmitnuto', created_at: daysAgo(5),
    uzavreno_at: daysAgo(3) });
  // prodeje: Petřin 20 tento týden (nejdřív začátek týdne v Praze, jinak před dvěma hodinami)
  const zacatekTydne = zacatekDnePraha(posunDen(dnes, -(isoDen(dnes) - 1)));
  kontaktProdej.set(7, { prodano_at: daysAgo(25), zdroj: 'demo' });
  kontaktProdej.set(20, { prodano_at: new Date(Math.max(Date.now() - 2 * 3600000, zacatekTydne + 60000)).toISOString(), zdroj: 'demo' });
  kontaktProdej.set(21, { prodano_at: daysAgo(12), zdroj: 'demo' });
  kontaktProdej.set(22, { prodano_at: daysAgo(10), zdroj: 'demo' });
  kontaktProdej.set(23, { prodano_at: daysAgo(30), zdroj: 'demo' });
  kontaktProdej.set(24, { prodano_at: new Date(Math.max(Date.now() - 3 * 3600000, zacatekTydne + 120000)).toISOString(), zdroj: 'demo' });
  // migrace 057 (Albert 28. 10. 2026): stav prodaného kontaktu změnila automatizace (schválení, platba) v den prodeje
  // a appka kontakt od té doby nezměnila (updated_at před 5 dny); jako trigger na serveru je status_changed_at den
  // prodeje, takže prodeje z tohoto týdne (20, 24) mají poslední změnu novější než updated_at (sloupec Změněno)
  for (const [kid, p] of kontaktProdej) {
    const c = kontakty.find((x) => x.id === kid);
    if (c) c.status_changed_at = p.prodano_at;
  }
  slevy.set(22, [{ detail: '3 500 Kč místo 7 000 Kč', created_at: daysAgo(11) }]);
})();

/* ---- označení k zavolání, hvězda a přehled: zrcadlí db/migration_060 (Albert 1. 11. 2026) ----
   Albert 1. 11. 2026: klient, který na naši zprávu neodpověděl VÍC než 5 pracovních dní, je označený pro SVÉHO volajícího
   (navrh „Neodpověděl na návrh“, zmeny „Neodpověděl na změny“); jen kdo opravdu nikdy neodpověděl (odmítnutí po slevě ne,
   nabídka z připomínky kampaně bez odpovědi ano); Volající vidí jen svoje označení; zápis hovoru jde mimo call_log. */

/** Řádek tabulky oznaceni (migrace 060). Kontakt má nejvýš jedno otevřené (uzavreno_at null). */
interface MockOznaceni {
  id: number;
  kontakt_id: number;
  kategorie: OznaceniKategorie;
  /** naše zpráva, na kterou klient neodpověděl: klíč epizody (tutéž zprávu tick nikdy neoznačí znovu) */
  od: string;
  /** „mlčí od“: u návrhu první návrh, u změn `od` */
  mlci_od: string;
  oznaceno_at: string;
  /** lhůta na zavolání (den v Praze): +10 pracovních dní u prvního běhu (zavadeci), jinak +5 */
  lhuta_do: string;
  zavadeci: boolean;
  volajici_id: number | null;
  pokusy: number;
  posledni_pokus_at: string | null;
  zavolano_at: string | null;
  zavolano_kdo: number | null;
  /** od migrace 061 i jine (Nic z toho výše), od 062 i chce_web (Chce web); každý výsledek je úspěšné dovolání */
  vysledek: Exclude<VysledekDovolani, 'nedovolano'> | null;
  poznamka: string | null;
  /** migrace 063: job připomínky po lhůtě (zařadil tick) a kdy ověřeně odešla (oznaceni_pripominka_odeslana) */
  pripominka_job: number | null;
  pripominka_at: string | null;
  uzavreno_at: string | null;
  uzavreno_duvod: 'odpovedel' | 'hovor' | 'stav' | 'archiv' | 'rucne' | null;
}

let nextOznaceniId = 1;
const oznaceniRadky: MockOznaceni[] = [];
/** Události pripominka_odeslana (připomínka kampaně s nabídkou): kdy odešla. Mock jiné události nevede. */
const pripominkyKampane = new Map<number, string>();
/** Ruční odmítnutí po návrhu (na serveru událost stav_rucne na odmitnuto nebo job rucni_odmitnuti). */
const rucniOdmitnuti = new Set<number>();
/**
 * Úspěšná dovolání (migrace 062, Albert 2. 11. 2026: „Zavolal/a jsem“ i bez označení): na serveru událost dovolani, jejíž
 * první slovo není nedovol…, v Označených i bez označení, JEDINÝ záznam úspěšného hovoru (oznaceni_kandidati ho čte místo
 * oznaceni.zavolano_at). Kdy se volající klientovi dovolal, podle kontaktu. ⚠ NAHRAZUJE v kandidatOznaceni zavolano_at
 * řádků označení (dovolání bez označení by kandidáti jinak neviděli).
 */
const dovolaniUspesna = new Map<number, string[]>();
/**
 * kontakty.prehled (migrace 060): mimo řádek kontaktu, protože seznamy ho neposílají (jen kontakt_prehled). ⚠ prehled_at
 * je na řádku kontaktu jako na serveru (seznamy a update_kontakt ho posílají; recenze 2. 11. 2026, NAHRAZUJE „i prehled_at
 * mimo řádek“).
 */
const prehledy = new Map<number, { prehled: PrehledText }>();

/** Stavy, ve kterých se označuje (výčet, ne vyloučení: budoucí stav se tak nikdy nepřimíchá). */
const STAVY_OZNACENI: readonly KontaktStatus[] = ['navrh_odeslan', 'ceka_na_klienta', 'sleva_nabidnuta'];
const casMs = (iso: string | null | undefined): number | null => (iso ? new Date(iso).getTime() : null);

/**
 * mlci_pd jako server: celé pracovní dny (Praha, bez víkendů a svátků) od naší poslední zprávy do dneška, když klient od
 * ní nenapsal; jinak (nebo bez naší zprávy) null.
 */
export function mlciPd(c: Pick<Kontakt, 'last_our_reply_at' | 'last_client_reply_at'>, dnes = denPraha(new Date())): number | null {
  const nase = casMs(c.last_our_reply_at);
  if (nase === null) return null;
  const klient = casMs(c.last_client_reply_at);
  if (klient !== null && klient >= nase) return null;
  return pracovniDnyMezi(denPraha(new Date(nase)), dnes);
}

/** Nabídka z kampaně (jako stavy_kontaktu.py): připomínka kampaně do 60 minut od poslední sleva_odeslana. */
function slevaZKampane(kid: number): boolean {
  const posledni = (slevy.get(kid) ?? []).map((s) => casMs(s.created_at) ?? 0).sort((a, b) => b - a)[0];
  const pripominka = casMs(pripominkyKampane.get(kid));
  return posledni !== undefined && pripominka !== null && Math.abs(pripominka - posledni) <= 60 * 60 * 1000;
}

/** Odmítnutí po návrhu: hovor s výsledkem odmitnuto po návrhu nebo ruční změna stavu na odmitnuto. */
function odmitlPoNavrhu(c: Kontakt): boolean {
  const navrh = casMs(c.first_proposal_at) ?? 0;
  return rucniOdmitnuti.has(c.id) || callLog.some((l) => l.kontakt_id === c.id && l.outcome === 'odmitnuto' && (casMs(l.created_at) ?? 0) > navrh);
}

/**
 * oznaceni_kandidati (migrace 060): smí se kontakt označit, a do které kategorie? Výčet stavů, bez návrhu ne, s příznakem
 * „NEKONTAKTOVAT …“ ne (jako lib.sh; testovací architekty ani ateliéry mock nemá, server člena ateliéru bez vlastního webu
 * neoznačí nikdy). navrh: klient po návrhu nikdy nenapsal (last_client_reply_at null nebo <= first_proposal_at; stav
 * navrh_odeslan, ceka_na_klienta, nebo sleva_nabidnuta z kampaně bez odmítnutí), hodiny od pozdější z návrhu a naší poslední
 * zprávy; zmeny: napsal po návrhu a naše zpráva je novější (stav ceka_na_klienta nebo navrh_odeslan), hodiny od naší
 * poslední zprávy. „Napsal“ = e-mail NEBO hovor, ve kterém se mu volající dovolal (recenze 2. 11. 2026): po „Mluvili jsme“
 * a naší novější zprávě je to zmeny. ⚠ Migrace 062 (D6): úspěšné dovolání z dovolaniUspesna (na serveru událost dovolani,
 * v Označených i bez označení), NAHRAZUJE zavolano_at řádků označení.
 */
function kandidatOznaceni(c: Kontakt): { kategorie: OznaceniKategorie; od: string } | null {
  if (!c.first_proposal_at || !STAVY_OZNACENI.includes(c.status)) return null;
  if ((c.flag_note ?? '').trimStart().toUpperCase().startsWith('NEKONTAKTOVAT')) return null;
  const navrh = casMs(c.first_proposal_at) ?? 0;
  const nase = casMs(c.last_our_reply_at);
  const hovory = (dovolaniUspesna.get(c.id) ?? []).map((t) => casMs(t) ?? 0);
  const email = casMs(c.last_client_reply_at);
  const klient = hovory.length > 0 || email !== null ? Math.max(email ?? 0, ...hovory) : null;
  if (klient === null || klient <= navrh) {
    const smi = c.status !== 'sleva_nabidnuta' || (slevaZKampane(c.id) && !odmitlPoNavrhu(c));
    if (!smi) return null;
    return { kategorie: 'navrh', od: nase !== null && nase > navrh && c.last_our_reply_at ? c.last_our_reply_at : c.first_proposal_at };
  }
  if (c.status !== 'sleva_nabidnuta' && nase !== null && nase > klient && c.last_our_reply_at) {
    return { kategorie: 'zmeny', od: c.last_our_reply_at };
  }
  return null;
}

/**
 * Vlastník označení: kdo zapsal poslední zájem (call_log), jinak jediný člověk se jménem last_caller, jinak nikdo. Jen
 * aktivní lidé (recenze 2. 11. 2026, jako server): deaktivovaného přeskočí.
 */
function vlastnikOznaceni(c: Kontakt): number | null {
  const aktivni = (id: number) => users.some((u) => u.id === id && u.active);
  const zajem = callLog
    .filter((l) => l.kontakt_id === c.id && l.outcome === 'zajem' && aktivni(l.user_id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)[0];
  if (zajem) return zajem.user_id;
  const sJmenem = users.filter((u) => u.display_name === c.last_caller && u.active);
  return sJmenem.length === 1 ? sJmenem[0].id : null;
}

function otevreneOznaceni(kid: number): MockOznaceni | undefined {
  return oznaceniRadky.find((o) => o.kontakt_id === kid && o.uzavreno_at === null);
}

/** Otevřené označení, které přihlášený vidí: `od` = null (super admin, Albert) všechna, jinak jen to s jeho volajici_id. */
function oznaceniPro(kid: number, od: number | null): MockOznaceni | undefined {
  const o = otevreneOznaceni(kid);
  return o && (od === null || o.volajici_id === od) ? o : undefined;
}

function zavritOznaceni(o: MockOznaceni, duvod: NonNullable<MockOznaceni['uzavreno_duvod']>): void {
  o.uzavreno_at = now();
  o.uzavreno_duvod = duvod;
}

/**
 * oznaceni_obnov tak, jak by ho pustil tick (v demu tick není, mock ho pouští před každým čtením označení):
 * 1. zavře otevřená označení, kde klient po `od` napsal (odpovedel), kontakt je v archivu (archiv), u návrhu klient po
 *    návrhu napsal (odpovedel) nebo kontakt na pravidla přestal sedět (stav), 2. obnoví vlastníka, 3. označí kontakty, které
 *    mlčí aspoň 5 celých pracovních dní
 *    a nemají označení téže epizody (od >= hodiny; uzavřené kvůli stavu se nepočítá), s lhůtou `lhutaPd` pracovních dní. updated_at kontaktu nemění. Úklid
 *    info_neoverene u uzavřených (krok 4 na serveru) appka nevidí, mock ho nedělá.
 */
function obnovOznaceni(lhutaPd = 5, zavadeci = false): void {
  const dnes = denPraha(new Date());
  for (const o of oznaceniRadky) {
    if (o.uzavreno_at !== null) continue;
    const c = kontakty.find((x) => x.id === o.kontakt_id);
    if (!c) {
      zavritOznaceni(o, 'stav');
      continue;
    }
    // pořadí důvodů jako na serveru: klient od naší zprávy napsal, archiv, návrh s odpovědí po návrhu, jiná kategorie
    const klient = casMs(c.last_client_reply_at);
    const duvod: MockOznaceni['uzavreno_duvod'] =
      klient !== null && klient > (casMs(o.od) ?? 0)
        ? 'odpovedel'
        : c.status === 'bez_odpovedi'
          ? 'archiv'
          : o.kategorie === 'navrh' && klient !== null && klient > (casMs(c.first_proposal_at) ?? 0)
            ? 'odpovedel'
            : kandidatOznaceni(c)?.kategorie !== o.kategorie
              ? 'stav'
              : null;
    if (duvod) {
      zavritOznaceni(o, duvod);
      continue;
    }
    o.volajici_id = vlastnikOznaceni(c);
  }
  for (const c of kontakty) {
    if (otevreneOznaceni(c.id)) continue;
    const kand = kandidatOznaceni(c);
    if (!kand || pracovniDnyMezi(denPraha(new Date(kand.od)), dnes) < 5) continue;
    // tatáž epizoda podruhé ne; uzavřené kvůli stavu ji neblokuje (návrat bez nové zprávy = znovu, recenze 2. 11. 2026)
    if (oznaceniRadky.some((o) => o.kontakt_id === c.id && o.uzavreno_duvod !== 'stav' && (casMs(o.od) ?? 0) >= (casMs(kand.od) ?? 0))) continue;
    oznaceniRadky.push({
      id: nextOznaceniId++,
      kontakt_id: c.id,
      kategorie: kand.kategorie,
      od: kand.od,
      mlci_od: kand.kategorie === 'navrh' ? (c.first_proposal_at ?? kand.od) : kand.od,
      oznaceno_at: now(),
      lhuta_do: pracovniDenPo(dnes, lhutaPd),
      zavadeci,
      volajici_id: vlastnikOznaceni(c),
      pokusy: 0,
      posledni_pokus_at: null,
      zavolano_at: null,
      zavolano_kdo: null,
      vysledek: null,
      poznamka: null,
      pripominka_job: null,
      pripominka_at: null,
      uzavreno_at: null,
      uzavreno_duvod: null,
    });
  }
}

/**
 * Klíče mlčení a označení do řádku seznamu (list_kontakty, my_kontakty), PŘED maskou jako posledni_* (u cizího kontaktu
 * je Volající nedostane). `od` jako u hovorů: super admin a Albert null (všechna označení), Volající jen svoje označení.
 */
function klice060(c: Kontakt, od: number | null): Partial<Kontakt> {
  const o = oznaceniPro(c.id, od);
  return {
    mlci_pd: mlciPd(c),
    ozn_kategorie: o?.kategorie ?? null,
    ozn_mlci_od: o?.mlci_od ?? null,
    ozn_lhuta_do: o?.lhuta_do ?? null,
    ozn_pokusy: o ? o.pokusy : null,
  };
}

const ZNAMKY_POVOLENE: readonly string[] = ['A', 'B', 'C', 'bez'];
const KATEGORIE_POVOLENE: readonly string[] = ['navrh', 'zmeny'];
/** p_druhy v list_oznacene: kategorie označení a druhy příznaků (bez neodpovida, ten od 060 nikdo nemá). */
const DRUHY_OZNACENYCH: readonly string[] = ['navrh', 'zmeny', 'chybi_info', 'chybi_email', 'email_neoveren', 'info_neoverene', 'jine'];

/** Kontrola nových filtrů jako server (stejné hlášky a pořadí; kategorie list_oznacene nemá, má druhy). */
function checkFiltry060(f: FiltryMlceni | null | undefined): void {
  const znamky = (f?.znamky ?? []).filter((z) => z !== null && z !== undefined);
  if (znamky.some((z) => !ZNAMKY_POVOLENE.includes(String(z)))) fail(`Neplatná známka ve filtru: ${znamky.join(', ')}. Povolené: A, B, C, bez.`);
  const kategorie = (f?.kategorie ?? []).filter((k) => k !== null && k !== undefined);
  if (kategorie.some((k) => !KATEGORIE_POVOLENE.includes(String(k)))) fail(`Neplatné označení ve filtru: ${kategorie.join(', ')}. Povolené: navrh, zmeny.`);
  const od = typeof f?.mlci_min === 'number' ? f.mlci_min : null;
  const doMez = typeof f?.mlci_max === 'number' ? f.mlci_max : null;
  if ((od !== null && od < 0) || (doMez !== null && doMez < 0) || (od !== null && doMez !== null && od > doMez)) {
    fail(`Neplatný rozsah mlčení: od ${od ?? '…'} do ${doMez ?? '…'} pracovních dní.`);
  }
}

/** Migrace 068: stavy, které filtr „Odpověděl, zatím nepotvrdil“ nepustí (doslova jako server). */
const STAVY_MIMO_068: string[] = ['odmitnuto', 'nekontaktovat', 'nerelevantni', 'sleva_nabidnuta', 'bez_odpovedi',
  'schvaleno', 'faktura_odeslana', 'zaplaceno', 'domena_pripojena', 'hotovo'];

/** Je zapnutý aspoň jeden nový filtr (Volajícímu pak sedí jen jeho klienti)? */
function filtr060(f: FiltryMlceni | null | undefined): boolean {
  return !!(f?.statusy?.length || f?.znamky?.length || f?.jen_hvezda || f?.odpovedel || f?.kategorie?.length
    || typeof f?.mlci_min === 'number' || typeof f?.mlci_max === 'number');
}

/**
 * Sedí kontakt na nové filtry? Stav a známka (NEBO mezi hodnotami), jen s hvězdou, kategorie OTEVŘENÉHO označení, které
 * přihlášený vidí (`od`), a mlčení od a do včetně (nemlčící nesedí, když je mez zapnutá). Všechno najednou.
 */
function sedi060(c: Kontakt, f: FiltryMlceni | null | undefined, od: number | null): boolean {
  if (!f) return true;
  if (f.statusy?.length && !f.statusy.includes(c.status)) return false;
  if (f.znamky?.length && !f.znamky.includes((c.rating ?? 'bez') as ZnamkaFiltr)) return false;
  if (f.jen_hvezda && !c.hvezda_at) return false;
  // migrace 068 (db/migration_068_odpovedel_nepotvrdil.sql): napsal, neodmítl, web ještě nepotvrdil
  if (f.odpovedel && !(c.last_client_reply_at && !STAVY_MIMO_068.includes(c.status))) return false;
  if (f.kategorie?.length) {
    const o = oznaceniPro(c.id, od);
    if (!o || !f.kategorie.includes(o.kategorie)) return false;
  }
  if (typeof f.mlci_min === 'number' || typeof f.mlci_max === 'number') {
    const pd = mlciPd(c);
    if (pd === null || (typeof f.mlci_min === 'number' && pd < f.mlci_min) || (typeof f.mlci_max === 'number' && pd > f.mlci_max)) return false;
  }
  return true;
}

/**
 * app_hvezda_zapis (migrace 060): dá nebo vezme hvězdu. Dát: čas první hvězdy zůstává, kdo = ten, kdo ji teď dal, důvod nový
 * nebo dosavadní; když hvězdu už má a nový důvod není, nic se nezmění. Vzít: všechny tři null. Změna posune updated_at.
 * Vrátí, jestli se něco změnilo. Důvod: mezery sloučené, prázdný = null, nejvýš 300 znaků.
 */
function zapisHvezdu(c: Kontakt, kdo: MockUser, hvezda: boolean, duvod: string | null): boolean {
  const d = oriznoutMezery(String(duvod ?? '').replace(/\s+/g, ' ')) || null;
  if (d !== null && [...d].length > 300) fail('Důvod hvězdy je moc dlouhý: nejvýš 300 znaků.');
  if (hvezda) {
    if (c.hvezda_at && (d === null || d === c.hvezda_duvod)) return false;
    c.hvezda_at = c.hvezda_at ?? now();
    c.hvezda_kdo = kdo.display_name;
    c.hvezda_duvod = d ?? c.hvezda_duvod ?? null;
  } else {
    if (!c.hvezda_at) return false;
    c.hvezda_at = null;
    c.hvezda_kdo = null;
    c.hvezda_duvod = null;
    // migrace 063: kdo a kdy hvězdu vzal (automatizace ji pak znovu nedá, dokud klient znovu nenapíše)
    hvezdyVzate.set(c.id, [...(hvezdyVzate.get(c.id) ?? []), { kdo: kdo.display_name, at: now() }]);
  }
  c.updated_at = now();
  return true;
}

/* ---- druhá etapa (migrace 063, Albert 1. 11. 2026): hvězda od automatizace a zápis odeslané připomínky po lhůtě ----
   Na serveru obojí volá jen služba (worker přes lib.sh hvezda_nastav_auto a oznaceni_pripominka_odeslana), appka nikdy;
   mock tím zakládá ukázková data a test (háček __volackaDemoTest) ověřuje, že pravidla sedí se serverem. */

/** Kdo a kdy hvězdu vzal (na serveru událost hvezda „Hvězda: ano (…) → ne.“ od člověka). */
const hvezdyVzate = new Map<number, { kdo: string; at: string }[]>();
const HVEZDA_AUTO = 'automatizace';

/**
 * hvezda_automatizace: hvězda s hvezda_kdo „automatizace“, důvod povinný (mezery sloučené) a nejvýš 300 znaků. Jen kontaktu
 * bez hvězdy, kterému ji žádný člověk od poslední zprávy klienta nevzal (klient nikdy nenapsal = kdykoli). Hvězdu nikdy
 * nepřepíše ani nevezme, updated_at nemění.
 */
function hvezdaOdAutomatizace(kid: number, duvod: string | null): { nastaveno: boolean; proc: string } {
  const d = oriznoutMezery(String(duvod ?? '').replace(/\s+/g, ' ')) || null;
  if (d === null) fail('Hvězda od automatizace potřebuje důvod: jednu větu, proč má klient velký zájem.');
  if ([...d].length > 300) fail('Důvod hvězdy je moc dlouhý: nejvýš 300 znaků.');
  const c = kontakty.find((x) => x.id === kid);
  if (!c) fail(`Kontakt id=${kid} neexistuje.`);
  if (c.hvezda_at) {
    return { nastaveno: false, proc: `Kontakt už hvězdu má (dal/a ji ${c.hvezda_kdo ?? '(neznámo)'} ${denPraha(new Date(c.hvezda_at))}); automatizace ji nemění.` };
  }
  const klient = casMs(c.last_client_reply_at);
  const vzal = (hvezdyVzate.get(kid) ?? []).filter((v) => v.kdo !== HVEZDA_AUTO && (klient === null || (casMs(v.at) ?? 0) >= klient)).pop();
  if (vzal) {
    return {
      nastaveno: false,
      proc: `Hvězdu vzal/a ${vzal.kdo} ${denPraha(new Date(vzal.at))}, po poslední zprávě klienta; automatizace ji znovu nedá, dokud klient znovu nenapíše.`,
    };
  }
  c.hvezda_at = now();
  c.hvezda_kdo = HVEZDA_AUTO;
  c.hvezda_duvod = d;
  return { nastaveno: true, proc: 'Hvězda od automatizace dána: klient jasně ukázal velký zájem.' };
}

/** Tick zařadí připomínku po lhůtě (na serveru PATCH oznaceni?id=eq.<id>&pripominka_job=is.null): jen otevřené označení bez jobu. */
function zaradPripominkuOznaceni(kid: number, job: number): boolean {
  const o = otevreneOznaceni(kid);
  if (!o || o.pripominka_job !== null) return false;
  o.pripominka_job = job;
  return true;
}

/**
 * oznaceni_pripominka_odeslana: pripominka_at = teď jen u OTEVŘENÉHO označení s pripominka_job a prázdným pripominka_at;
 * jinak nic a proč (uzavřené označení nikdy, podruhé nic). Neexistující kontakt = chyba.
 */
function pripominkaOznaceniOdeslana(kid: number): { zapsano: boolean; oznaceni_id: number | null; pripominka_at: string | null; proc: string } {
  if (!kontakty.some((x) => x.id === kid)) fail(`Kontakt id=${kid} neexistuje.`);
  const o = otevreneOznaceni(kid);
  if (!o) {
    return { zapsano: false, oznaceni_id: null, pripominka_at: null,
      proc: 'Kontakt nemá otevřené označení k zavolání (mezitím napsal, někdo se mu dovolal, změnil se stav nebo je v archivu); připomínka se k žádnému označení nezapíše.' };
  }
  if (o.pripominka_job === null) {
    return { zapsano: false, oznaceni_id: o.id, pripominka_at: null,
      proc: `Označení ${o.id} nemá zařazenou připomínku (pripominka_job je prázdné): připomínku po lhůtě zařazuje jen tick, zapíše se jen ta.` };
  }
  if (o.pripominka_at !== null) {
    return { zapsano: false, oznaceni_id: o.id, pripominka_at: o.pripominka_at, proc: `Připomínka k označení ${o.id} už je zapsaná; druhá se nezapisuje.` };
  }
  o.pripominka_at = now();
  return { zapsano: true, oznaceni_id: o.id, pripominka_at: o.pripominka_at, proc: 'Připomínka po lhůtě na zavolání zapsaná k otevřenému označení.' };
}

/**
 * kontakt_prehled fakta.pripominka_oznaceni (migrace 063): nejnovější pripominka_at z označení kontaktu, která přihlášený
 * vidí (`od` null = super admin a Albert všechna, jinak jen s jeho volajici_id), otevřených i uzavřených.
 */
function pripominkaOznaceniPro(kid: number, od: number | null): string | null {
  const casy = oznaceniRadky
    .filter((x) => x.kontakt_id === kid && x.pripominka_at !== null && (od === null || x.volajici_id === od))
    .map((x) => x.pripominka_at as string)
    .sort();
  return casy.length > 0 ? casy[casy.length - 1] : null;
}

const NENI_VAS_HVEZDA_CIZI =
  'Tohle není váš klient: u kontaktu, kterému jste nevolal/a, hvězdu nevidíte ani neměníte. Dá ji ten, kdo mu volá, jeho super admin nebo Albert.';
const NENI_VAS_HVEZDA = 'Tohle není váš klient — hvězdu mu dá ten, kdo mu volá, jeho super admin nebo Albert.';
const NENI_VAS_UPRAVIT = 'Tohle není váš klient — upravit ho může ten, kdo mu volá, jeho super admin nebo Albert.';
/** set_flag a update_kontakt od migrace 060 (doslova ze zadání, 4.1). */
const NEODPOVIDA_NAHRAZEN = 'Příznak „neodpovídá“ nahradilo označení k zavolání (migrace 060).';
/** clear_flag a update_kontakt od migrace 061 (Albert 2. 11. 2026): příznak info_neoverene řeší jen super admin a Albert. */
const INFO_JEN_SUPER = 'Tenhle příznak řeší super admin.';
/**
 * Migrace 061 (Albert 2. 11. 2026: „only the super admins will see this flag“): druh příznaku, který přihlášený vidí.
 * Volajícímu je info_neoverene jako bez příznaku (list_flagged, list_oznacene: řádek, filtr druhů i pořadí), super admin
 * a Albert vidí všechno. Řádek sám vynuluje forViewer (app_kontakt_ven).
 */
function druhPro(u: MockUser, c: Kontakt): FlagKind | null {
  return u.id === OWNER_ID || u.role === 'super_admin' || c.flag_kind !== 'info_neoverene' ? c.flag_kind : null;
}
/**
 * Migrace 061: výsledek dovolání, jak ho dostane automatizace v poznámce kontaktu a ve vzkazu do vlákna („Dovolání
 * (jméno): <výsledek>: <poznámka>“); u mluvili jde jen text (beze změny od 060). Stejné texty jako server (zapis_hovor).
 */
const DOVOLANI_PRO_AUTOMATIZACI: Record<Exclude<VysledekDovolani, 'mluvili'>, string> = {
  nedovolano: 'Nedovolal/a jsem se',
  nechce: 'Nechce web',
  nekontaktovat: 'Nechce, abychom ho kontaktovali',
  jine: 'Nic z toho výše',
  // migrace 062 (Albert 2. 11. 2026, A1): šestý výsledek, vzkaz jde vždy (i bez poznámky jen „Chce web“)
  chce_web: 'Chce web',
};
const VYSLEDKY_DOVOLANI: readonly VysledekDovolani[] = ['nedovolano', 'nechce', 'nekontaktovat', 'mluvili', 'jine', 'chce_web'];
/**
 * ⚠ Migrace 062 (Albert 2. 11. 2026: tlačítko i v Moji klienti, Kontaktech a detailu) NAHRAZUJE větu „… kterého máte
 * v Označených k zavolání. Tenhle mezi nimi není (nebo ho mezitím někdo vyřídil); zapíše ho ten, komu je označený, …“.
 */
const NENI_VASE_OZNACENI =
  'Dovolání zapíšete jen u svého klienta. Tenhle mezi nimi není; zapíše ho ten, kdo mu volá, jeho super admin nebo Albert.';
/** Stráže dovolání bez označení (migrace 062, D3; Albert A3: kdo web odmítl, tomu znovu nevoláme). Stejné věty jako server. */
const DOVOLANI_ODMITL =
  'Klient web odmítl, znovu mu nevoláme (Albert 2. 11. 2026). Když se ozval sám, že web chce, napište to agentovi ve vzkazu u klienta.';
const DOVOLANI_FRONTA =
  'Klient je ve frontě volání: naplánujte si hovor (Naplánovat hovor v detailu) a výsledek zapište přes Zavolat teď ve Volání.';
const DOVOLANI_NEVEDE =
  'Odmítnutí zapisuje volající, který klienta vede, jeho super admin nebo Albert. Zapište, co klient řekl, do „Mluvili jsme“ nebo „Nic z toho výše“.';
/** ⚠ 3. 11. 2026 (ověření 062, DB F3): starý příznak „NEKONTAKTOVAT …“ (poznámka příznaku z doby před stavem nekontaktovat)
 * platí jako stav nekontaktovat; stejný výraz jako server (oznaceni_kandidati, zapis_hovor). */
const DOVOLANI_PRIZNAK_NEKONTAKTOVAT =
  'Klient má příznak NEKONTAKTOVAT: dovolání se u něj nezapisuje. Když chce, abychom se mu zase ozývali, zrušte příznak v detailu klienta a důvod napište do poznámky.';
function priznakNekontaktovat(c: Pick<Kontakt, 'flag_note'>): boolean {
  return (c.flag_note ?? '').replace(/^\s+/, '').toUpperCase().startsWith('NEKONTAKTOVAT');
}

/**
 * Vzkaz agentovi do vlákna kontaktu jako composer v detailu (zapis_hovor od 060, update_kontakt od 062): poslední otevřené
 * vlákno kontaktu, do kterého přihlášený smí psát (app_vlakna_moje), jinak nové „Vzkaz od <jméno>: <klient>“ s kontakt_id;
 * zpráva člověka (sender_type admin), dispečer z ní udělá job. Vrátí číslo vlákna.
 */
function vzkazAgentovi(me: MockUser, c: Kontakt, body: string): number {
  const smi = writableThreadIds(me);
  const otevrene = chatThreads
    .filter((x) => x.kontakt_id === c.id && x.status === 'open' && smi.has(x.id))
    .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime() || b.id - a.id)[0];
  const vl: MockThread = otevrene ?? {
    id: nextThreadId++,
    kontakt_id: c.id,
    subject: `Vzkaz od ${me.display_name}: ${(c.name ?? '').trim() || (c.firma ?? '').trim() || `#${c.id}`}`,
    status: 'open',
    created_by: me.display_name,
    last_message_at: now(),
    created_at: now(),
  };
  if (!otevrene) chatThreads.push(vl);
  vl.last_message_at = now();
  vl.status = 'open';
  chatMessages.push({
    id: nextChatMessageId++, thread_id: vl.id, sender_type: 'admin', sender_name: me.display_name,
    body, apply_always: false, created_at: now(),
  });
  return vl.id;
}

/**
 * Nové řádky poznámky (migrace 062, D15): neprázdné řádky nové poznámky (oříznuté jen o mezery jako btrim), které v uložené
 * nebyly (tolikrát), bez hlavičky „[datum jméno]“ s cizím jménem (hlavickaCizi); samo smazání nebo přeházení nic nedá.
 */
function noveRadkyPoznamky(stara: string | null, nova: string | null, jmeno: string): string[] {
  const radky = (s: string | null) => (s ?? '').replace(/\r\n?/g, '\n').split('\n').map(oriznoutMezery);
  const zbyva = new Map<string, number>();
  for (const r of radky(stara)) zbyva.set(r, (zbyva.get(r) ?? 0) + 1);
  const ven: string[] = [];
  for (const r of radky(nova)) {
    if (r === '') continue;
    const n = zbyva.get(r) ?? 0;
    if (n > 0) {
      zbyva.set(r, n - 1);
      continue;
    }
    if (hlavickaCizi(r, [jmeno]) === null) ven.push(r);
  }
  return ven;
}

// Demo (1. 11. 2026): 97 dostal nabídku z připomínky kampaně (sleva_odeslana a pripominka_odeslana ve stejnou chvíli)
// a neodpověděl, 98 nabídku po odmítnutí (ruční změna stavu na odmítnuto); 94 má přehled od automatizace (na serveru ho píše
// worker od druhé etapy, migrace 063). Pak první běh označení jako migrace 060 (lhůta 10 dní).
(() => {
  slevy.set(97, [{ detail: '2 450 Kč místo 4 900 Kč', created_at: daysAgo(16) }]);
  pripominkyKampane.set(97, daysAgo(16));
  slevy.set(98, [{ detail: '2 450 Kč místo 4 900 Kč', created_at: daysAgo(15) }]);
  rucniOdmitnuti.add(98);
  const k94 = kontakty.find((k) => k.id === 94);
  if (k94) k94.prehled_at = daysAgo(15);
  prehledy.set(94, {
    prehled: {
      verze: 1,
      ted: 'Poslali jsme web s fotkami okolí a mapou; klient se od té doby neozval. Zavolat a zeptat se, jestli změny viděl.',
      klient_chce: [{ datum: denPraha(new Date(daysAgo(21))), text: 'Chce víc fotek okolí a odkaz na mapu.', zdroj: 'e-mail' }],
      poslali_jsme: [{ datum: denPraha(new Date(daysAgo(15))), text: 'Upravený web s fotkami okolí a mapou.' }],
      pozor: [],
    },
  });
  // migrace 063 (druhá etapa): 96 je Honzovo označení z doby před 16 dny, lhůta 5 pracovních dní už minula a po ní odešla
  // připomínka (před 2 dny, je to i naše poslední zpráva); Petra, která mu taky volala, označení ani čas připomínky nevidí.
  // 24 (schválil web a ptá se na platbu) má hvězdu od automatizace.
  const k96 = kontakty.find((k) => k.id === 96);
  if (k96?.first_proposal_at) {
    oznaceniRadky.push({
      id: nextOznaceniId++,
      kontakt_id: 96,
      kategorie: 'navrh',
      od: k96.first_proposal_at,
      mlci_od: k96.first_proposal_at,
      oznaceno_at: daysAgo(16),
      lhuta_do: pracovniDenPo(denPraha(new Date(daysAgo(16))), 5),
      zavadeci: false,
      volajici_id: 3,
      pokusy: 0,
      posledni_pokus_at: null,
      zavolano_at: null,
      zavolano_kdo: null,
      vysledek: null,
      poznamka: null,
      pripominka_job: 4242,
      pripominka_at: k96.last_our_reply_at,
      uzavreno_at: null,
      uzavreno_duvod: null,
    });
  }
  hvezdaOdAutomatizace(24, 'Klient web schválil a ptá se, jak zaplatit fakturu.');
  obnovOznaceni(10, true);
})();

/* ---- časovač práce a důvody odmítnutí: zrcadlí db/migration_072_prehled_zaklad.sql (Přehled vedení, Albert 17. 11. 2026,
   rozhodnutí D5 a D8; kontrakt docs/superpowers/specs/2026-11-17-prehled-kontrakt.md §4.1 prace_tep, §4.2 odmitnuti_duvod_zapis) ---- */

/** Řádek prace_aktivita: signál neviditelného časovače (karta, tep, konec), vždy za uživatele z tokenu, nikdy z parametru. */
interface MockSignal {
  id: number;
  user_id: number;
  druh: DruhSignalu;
  at: string;
  kontakt_id: number | null;
}
const praceAktivita: MockSignal[] = [];
let nextPraceId = 1;
const DRUHY_SIGNALU: readonly DruhSignalu[] = ['karta', 'tep', 'konec'];

/**
 * Ukázkové signály časovače jen pro Přehled (úkol 14a, D5): u každého výsledku hovoru ukázkových dat z posledních 14 dní karta
 * 6 minut před ním, tep každou minutu 20 minut po něm a konec, takže pohled Čas (odpracováno z plánu) a řada odpracovaných hodin
 * mají v demu čísla a starší dny zůstanou odhadem z výsledků (CASOVAC_OD). Přehled je čte přes signalyPrace(); uložené signály
 * appky (praceAktivita, háček stav().prace, testy časovače) se nemění.
 */
const PREHLED_SIGNALY_DEMO: MockSignal[] = (() => {
  const ted = Date.now();
  const out: MockSignal[] = [];
  let id = 900000;
  for (const l of callLog) {
    const t = Date.parse(l.created_at);
    if (ted - t > 14 * 86400000 || ted - t < 25 * 60000) continue;
    const s = (druh: DruhSignalu, posun: number, kontakt: number | null) => out.push({ id: id++, user_id: l.user_id, druh, at: new Date(t + posun * 60000).toISOString(), kontakt_id: kontakt });
    s('karta', -6, l.kontakt_id);
    for (let m = 1; m <= 20; m += 1) s('tep', m, null);
    s('konec', 21, null);
  }
  return out;
})();
/** Signály časovače, které Přehled počítá: uložené (praceAktivita) a ukázkové (PREHLED_SIGNALY_DEMO). */
const signalyPrace = (): MockSignal[] => [...praceAktivita, ...PREHLED_SIGNALY_DEMO];

/**
 * Registr důvodů odmítnutí návrhu (kontrakt §3.2, spec §3.7; na serveru komentář migrace 072 a prehled_definice): kódy, štítky
 * a pořadí. Appka má týž registr v DUVODY (src/components/DuvodOdmitnuti.tsx); tests/pracovnicas.test.mjs (M14) hlídá, že se
 * neliší. „Nereagoval ani na nabídku za polovinu“ řádek není (počítá se z události sleva_vyprsela).
 */
export const DUVODY_ODMITNUTI: readonly { kod: DuvodOdmitnutiKod; text: string }[] = [
  { kod: 'ma_web', text: 'Už má web nebo ho dělá někdo jiný' },
  { kod: 'cena', text: 'Je to pro něj drahé' },
  { kod: 'navrh', text: 'Nelíbí se mu návrh' },
  { kod: 'nepotrebuje', text: 'Web nepotřebuje' },
  { kod: 'pozdeji', text: 'Teď ne, možná později' },
  { kod: 'konci', text: 'Končí s podnikáním' },
  { kod: 'jine', text: 'Jiný důvod' },
  { kod: 'neuvedl', text: 'Neřekl proč' },
];

/** Řádek odmitnuti: jen přidávání (nikdy úprava); přehled bere nejnovější řádek pro (kontakt, fáze). Pořadí klíčů jako tabulka. */
interface MockOdmitnuti {
  id: number;
  kontakt_id: number;
  faze: FazeOdmitnuti;
  duvod: DuvodOdmitnutiKod;
  text: string | null;
  zdroj: 'volajici' | 'super_admin';
  zapsal: string;
  at: string;
}
const odmitnutiRadky: MockOdmitnuti[] = [];
let nextOdmitnutiId = 1;
/** Jedna věta Volajícímu pro cizí, neexistující i vlastní kontakt bez návrhu (podle ní nic nepozná). */
const ODMITNUTI_JEN_SVUJ = 'Důvod odmítnutí zapíšete jen u svého klienta, kterému odešel návrh webu.';

/**
 * Smí člověk kontakt dělat (signál karta, kontrakt R25)? Kontakt existuje a zámek je jeho, nebo ho smí upravit (app_smi_upravit),
 * nebo je to jeho klient (app_kontakty_uzivatelu), nebo k němu má vlastní čekající naplánovaný hovor.
 */
function smiDelatKontakt(u: MockUser, kid: number): boolean {
  const c = kontakty.find((x) => x.id === kid);
  if (!c) return false;
  return c.lock_by === u.id || canEdit(u, kid) || kontaktyOf([u.id]).has(kid)
    || zavolatRadky.some((z) => z.kontakt_id === kid && z.user_id === u.id && z.stav === 'ceka');
}

/* ---- Přehled vedení: prehled_lide (migrace 073, kontrakt docs/superpowers/specs/2026-11-17-prehled-kontrakt.md §5.5, §2.5–§2.7,
   §3.11 a §5.14; Albert 17. 11. 2026, D7: „compare or combine any two callers“) ----
   Jen super admin („Přehled vidí jen super admin.“ před čímkoli dalším), filtr p_filtr s kontrolami a normalizací jako server
   (neznámý klíč nebo špatná hodnota = „Neplatný filtr: <klíč>“, id, které není uživatel = „Neplatný filtr: lide“), řádek za
   každého z lide (i bez činnosti), bez lide každý uživatel a řádek Nepřiřazeno, když něco má, a součet vybraných řádků:
   počty a peníze sečtené, různí klienti přes všechny řádky, podíly ze sečteného čitatele a jmenovatele, medián a p90 ze
   všech pozorování dohromady. Peníze po měnách filtru jako text na 2 místa, CZK a EUR nikdy dohromady, neznámá cena v pokrytí
   (nikdy 0). Hovory podle call_log.user_id, návrhy a prodeje podle atribuce, provize vždy posledni_zajem (pravidlo výdělku),
   odpracovaný čas podle §5.14 (úseky z výsledků, mezera nad 30 min, konec podle signálů časovače; den bez signálu = odhad).
   Demo nemá historii stavů (kontakt_historie): stav kontaktu se bere dnešní. */
const PREHLED_JEN_SUPER = 'Přehled vidí jen super admin.';
const PREHLED_DEFINICE_VERZE = '2026-11-17.1';
/**
 * definice_verze odpovědí (§2.5). Háček zkoušky `__volackaDemoTest.prehledVerze` ji změní, jako by server mezitím nasadil nový
 * katalog (oprava po recenzi úkolu 13, bod 6: appka pak katalog prehled_definice načte znovu; e2e PV10, npm test R6a).
 */
function definiceVerzePrehledu(): string {
  const v = (globalThis as { __volackaDemoTest?: { prehledVerze?: unknown } }).__volackaDemoTest?.prehledVerze;
  return typeof v === 'string' && v ? v : PREHLED_DEFINICE_VERZE;
}
const FILTR_KLICE = ['od', 'do', 'lide', 'atribuce', 'segment', 'obor', 'kraj', 'mena', 'zaklad', 'k_datu', 'vyber'];
const HODINA_MS = 3600000;
const USEK_MEZERA_MS = 30 * 60000;
const SIGNAL_RETEZ_MS = 150000;

/**
 * Kontrola a normalizace p_filtr (kontrakt §2.7). `sVyberem` (úkol 13): jen prehled_radky smí poslat vyber (proklik.filtr beze
 * změny, §2.8), jinde „Neplatný filtr: vyber“.
 */
function prehledFiltr(vstup: unknown, sVyberem = false): PrehledFiltr {
  const f = (vstup === null || vstup === undefined ? {} : vstup) as Record<string, unknown>;
  if (typeof f !== 'object' || Array.isArray(f)) fail('Neplatný filtr: p_filtr');
  // ⚠ Úkol 14c (parita s 073 app_prehled_filtr): kontroly v pořadí serveru: neznámý klíč (první v pořadí bajtů), od, do, období
  // (od před 2020, od v budoucnosti, do < od, přes 730 dní), lide, atribuce, segment, obor, kraj, měna, základ, k_datu (budoucnost,
  // před začátkem období), vyber; klíč s hodnotou null u od, do, atribuce, měny a základu odmítne jako server (jen pole a k_datu
  // null přijme). NAHRAZUJE pořadí úkolu 10 (k_datu a vyber dřív než atribuce a seznamy, do dřív než od).
  const nezname = Object.keys(f).filter((k) => !FILTR_KLICE.includes(k)).sort()[0];
  if (nezname !== undefined) fail(`Neplatný filtr: ${nezname}`);
  const ma = (k: string) => Object.prototype.hasOwnProperty.call(f, k) && f[k] !== undefined;
  const datum = (k: string): string | null => {
    if (!ma(k)) return null;
    const v = f[k];
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || posunDen(v, 0) !== v) fail(`Neplatný filtr: ${k}`);
    return v;
  };
  const dnes = denPraha(new Date());
  const odVstup = datum('od');
  const doVstup = datum('do');
  const doDen = doVstup ?? dnes;
  const odDen = odVstup ?? `${doDen.slice(0, 8)}01`;
  if (odDen < '2020-01-01') fail(`Neplatný filtr: ${ma('od') ? 'od' : 'do'}`);
  // období, které celé začíná až po dnešku, server odmítne dřív než do < od (073, koordinátor 18. 11. 2026, recenze 5a)
  if (odDen > dnes) fail('Neplatný filtr: od je v budoucnosti.');
  if (doDen < odDen || (Date.parse(`${doDen}T00:00:00Z`) - Date.parse(`${odDen}T00:00:00Z`)) / 86400000 > 730) fail('Neplatný filtr: do');
  let lide: number[] | null = null;
  if (ma('lide') && f.lide !== null) {
    if (!Array.isArray(f.lide) || f.lide.some((x) => typeof x !== 'number' || !Number.isInteger(x) || x < 1)) fail('Neplatný filtr: lide');
    const ids = [...new Set(f.lide as number[])].sort((a, b) => a - b);
    if (ids.some((id) => !users.some((u) => u.id === id))) fail('Neplatný filtr: lide');
    lide = ids.length > 0 ? ids : null;
  }
  const volba = <T extends string>(k: string, povolene: readonly T[], vychozi: T): T => {
    if (!ma(k)) return vychozi;
    const v = f[k];
    if (typeof v !== 'string' || !povolene.includes(v as T)) fail(`Neplatný filtr: ${k}`);
    return v as T;
  };
  const pole = (k: string, platny: (s: string) => boolean): string[] | null => {
    if (!ma(k) || f[k] === null) return null;
    const v = f[k];
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !platny(x))) fail(`Neplatný filtr: ${k}`);
    const s = [...new Set(v as string[])].sort();
    return s.length > 0 ? s : null;
  };
  const atribuce = volba('atribuce', ['posledni_zajem', 'prvni_zajem', 'spravuje'] as const, 'posledni_zajem');
  const segment = pole('segment', (s) => segmentPlatnyMock(s));
  const obor = pole('obor', (s) => /^[^:]+: .+$/.test(s));
  const kraj = pole('kraj', (s) => s.trim() !== '');
  const mena = volba('mena', ['CZK', 'EUR', 'obe'] as const, 'CZK');
  const zaklad = volba('zaklad', ['prirozeny', 'aktivita', 'prodej', 'faktura', 'platba'] as const, 'prirozeny');
  let kDatu: string | null = null;
  if (ma('k_datu') && f.k_datu !== null) {
    const k = f.k_datu;
    if (typeof k !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}:\d{2}|Z)$/.test(k) || Number.isNaN(Date.parse(k))
      || Date.parse(k) > Date.now()) fail('Neplatný filtr: k_datu');
    // k_datu před začátkem období (od 0:00 v Praze) o období nic neví; přesně od 0:00 projde (073, recenze 5a)
    if (Date.parse(k) < zacatekDnePraha(odDen)) fail('Neplatný filtr: k_datu je před začátkem období.');
    kDatu = k;
  }
  const vyber = !ma('vyber') || f.vyber === null ? null : sVyberem ? vyberFiltru(f.vyber) : fail('Neplatný filtr: vyber');
  return { od: odDen, do: doDen, lide, atribuce, segment, obor, kraj, mena, zaklad, k_datu: kDatu, vyber };
}

/** Katalog metrik řádku lidí (§3.11): název, jednotka, základ a zdroj prokliku (§2.8; null = proklik nejde). */
const METRIKY_LIDI: { klic: MetrikaCloveka; nazev: string; jednotka: 'pocet' | 'mena' | 'podil' | 'h'; zaklad: string; zdroj: string | null }[] = [
  { klic: 'hovory', nazev: 'Hovory', jednotka: 'pocet', zaklad: 'aktivita', zdroj: 'hovory' },
  { klic: 'unikatni_klienti', nazev: 'Různí klienti', jednotka: 'pocet', zaklad: 'aktivita', zdroj: 'kontakty' },
  { klic: 'dovolano', nazev: 'Dovoláno', jednotka: 'pocet', zaklad: 'aktivita', zdroj: 'hovory' },
  { klic: 'mira_dovolani', nazev: 'Míra dovolání', jednotka: 'podil', zaklad: 'aktivita', zdroj: 'hovory' },
  { klic: 'zajem', nazev: 'Hovory se zájmem', jednotka: 'pocet', zaklad: 'aktivita', zdroj: 'hovory' },
  { klic: 'odmitnuto', nazev: 'Odmítnuto v hovoru', jednotka: 'pocet', zaklad: 'aktivita', zdroj: 'hovory' },
  { klic: 'nerelevantni', nazev: 'Nerelevantní', jednotka: 'pocet', zaklad: 'aktivita', zdroj: 'hovory' },
  { klic: 'preplanovano', nazev: 'Přeplánováno', jednotka: 'pocet', zaklad: 'aktivita', zdroj: 'hovory' },
  { klic: 'konverze', nazev: 'Telefonní konverze', jednotka: 'podil', zaklad: 'aktivita', zdroj: 'hovory' },
  { klic: 'navrhy', nazev: 'Návrhy', jednotka: 'pocet', zaklad: 'navrh', zdroj: 'kontakty' },
  { klic: 'pocet_prodeju', nazev: 'Počet prodejů', jednotka: 'pocet', zaklad: 'prodej', zdroj: 'prodeje' },
  { klic: 'hodnota_prodeju', nazev: 'Hodnota prodejů', jednotka: 'mena', zaklad: 'prodej', zdroj: 'prodeje' },
  { klic: 'provize_narok', nazev: 'Provize – nárok', jednotka: 'mena', zaklad: 'prodej', zdroj: 'provize' },
  { klic: 'provize_vyplaceno', nazev: 'Provize – vyplaceno', jednotka: 'mena', zaklad: 'vyplata', zdroj: 'provize' },
  { klic: 'provize_zbyva', nazev: 'Provize – zbývá vyplatit', jednotka: 'mena', zaklad: 'vyplata', zdroj: 'provize' },
  { klic: 'odpracovane_hodiny', nazev: 'Odpracované hodiny', jednotka: 'h', zaklad: 'aktivita', zdroj: 'prace' },
  { klic: 'vysledku_za_hodinu', nazev: 'Výsledků za hodinu', jednotka: 'podil', zaklad: 'aktivita', zdroj: 'prace' },
  { klic: 'planovane_hodiny', nazev: 'Plánované hodiny', jednotka: 'h', zaklad: 'aktivita', zdroj: null },
  { klic: 'plneni_planu', nazev: 'Plnění plánu', jednotka: 'podil', zaklad: 'aktivita', zdroj: 'prace' },
  { klic: 'sla_prvni_kontakt_median', nazev: 'Doba do zavolání (medián)', jednotka: 'h', zaklad: 'aktivita', zdroj: 'kontakty' },
  { klic: 'sla_prvni_kontakt_p90', nazev: 'Doba do zavolání (90. percentil)', jednotka: 'h', zaklad: 'aktivita', zdroj: 'kontakty' },
  { klic: 'naplanovane_hotove', nazev: 'Naplánované hovory hotové', jednotka: 'pocet', zaklad: 'aktivita', zdroj: 'kontakty' },
  { klic: 'naplanovane_po_terminu', nazev: 'Naplánované hovory po termínu', jednotka: 'pocet', zaklad: 'k_datu', zdroj: 'kontakty' },
];

/** Surová čísla jednoho řádku: z nich se staví metriky řádku i součtu (sčítají se jednotky, ne hotové metriky). */
interface SurovyRadek {
  hovory: { id: number; kontakt_id: number; outcome: string }[];
  navrhy: number[];
  /** prodeje: kontakt, částka (null = neznámá: rozsah, nečitelná, nedohodnutá), měna */
  prodeje: { kontakt_id: number; castka: number | null; mena: MenaPrehledu | null }[];
  provize: { kontakt_id: number; castka: number | null; mena: MenaPrehledu | null }[];
  provizeDoKonce: { kontakt_id: number; castka: number | null; mena: MenaPrehledu | null }[];
  useky: { od: number; do: number; kotev: number; odhad: boolean }[];
  plan: { hodiny: number; dni: number; castecne: boolean } | null;
  /**
   * Rozhodnutí koordinátora 18. 11. 2026 (oprava úkolu 14a): plnění plánu v součtu jen za lidi s plánem. `planUseky` = úseky
   * lidí s plánem (u člověka jeho úseky, když plán má), `bezPlanu` = kolik lidí bez rozvrhu v období pracovalo. Chybí = člověk.
   */
  planUseky?: { od: number; do: number; kotev: number; odhad: boolean }[];
  bezPlanu?: number;
  sla: { hodiny: number | null }[];
  hotove: number;
  poTerminu: number;
  /** úkol 13: výplaty provizí člověka v období a do konce období (provize_vyplaty) */
  vyplaty: { castka: number; mena: MenaPrehledu }[];
  vyplatyDoKonce: { castka: number; mena: MenaPrehledu }[];
}

const zaokr = (x: number, mist: number): number => Math.round(x * 10 ** mist) / 10 ** mist;
/** „18. 11. 2026“ a „9:05“ v Praze (texty varování §3.10; mock appku src/ui.tsx neimportuje). */
const denCesky = (iso: string): string => {
  const [y, m, d] = denPraha(new Date(iso)).split('-').map(Number);
  return `${d}. ${m}. ${y}`;
};
const casCesky = (iso: string): string =>
  new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
const pokryti = (zname: number, celkem: number): PokrytiMetriky => ({ zname, celkem, nezname: celkem - zname, podil: celkem === 0 ? null : zaokr(zname / celkem, 6) });
const castkaText = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);
/** percentile_cont jako PostgreSQL (lineární interpolace mezi seřazenými hodnotami). */
function percentil(hodnoty: number[], p: number): number | null {
  if (hodnoty.length === 0) return null;
  const s = [...hodnoty].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const d = Math.floor(i);
  return d + 1 < s.length ? s[d] + (s[d + 1] - s[d]) * (i - d) : s[d];
}

/** Kdo dostal kontakt podle atribuce (R15): poslední / první zájem z call_log (do k_datu), nebo kdo ho teď vede (last_caller). */
function pripsanyClovek(c: Kontakt, atribuce: AtribucePrehledu, kMs: number): number | null {
  if (atribuce === 'spravuje') return users.find((u) => u.display_name === c.last_caller)?.id ?? null;
  const zajmy = callLog
    .filter((l) => l.kontakt_id === c.id && l.outcome === 'zajem' && Date.parse(l.created_at) <= kMs)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
  const l = atribuce === 'prvni_zajem' ? zajmy[0] : zajmy[zajmy.length - 1];
  return l ? l.user_id : null;
}

/** Cena prodeje podle pravidla výdělku (sleva před prodejem, jinak cena webu); null = neznámá. */
function cenaProdeje(c: Kontakt): { castka: number | null; mena: MenaPrehledu | null } {
  const prodanoAt = datumProdeje(c);
  const sleva = (slevy.get(c.id) ?? []).filter((e) => e.created_at <= prodanoAt).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!sleva && cenaNezadanaMock(c.cena_web)) return { castka: null, mena: null };
  const { castka, mena } = cenaCist(sleva ? cenaZeSlevy(sleva.detail) : c.cena_web);
  return castka === null ? { castka: null, mena: null } : { castka, mena: mena === 'eur' ? 'EUR' : 'CZK' };
}

/** Pracovní úseky člověka (§5.14): kotvy = výsledky (call_log, dovolání v označení, hotové naplánované hovory). */
function pracovniUseky(uid: number, kMs: number): SurovyRadek['useky'] {
  const kotvy = [
    ...callLog.filter((l) => l.user_id === uid).map((l) => ({ t: Date.parse(l.created_at), kid: l.kontakt_id })),
    ...oznaceniRadky.filter((o) => o.zavolano_kdo === uid && o.zavolano_at).map((o) => ({ t: Date.parse(o.zavolano_at!), kid: o.kontakt_id })),
    // hotový naplánovaný hovor je výsledek toho, kdo ho uzavřel (coalesce(zmenil_id, user_id); kontrakt §9, 18. 11. 2026, úkol 3,
    // bod 4; úkol 14b, ⚠ NAHRAZUJE „vlastníka hovoru“)
    ...zavolatRadky.filter((z) => (z.zmenil_id ?? z.user_id) === uid && z.stav === 'hotovo' && z.uzavreno_at).map((z) => ({ t: Date.parse(z.uzavreno_at!), kid: z.kontakt_id })),
  ]
    .filter((k) => k.t <= kMs)
    .sort((a, b) => a.t - b.t);
  const signaly = signalyPrace()
    .filter((s) => s.user_id === uid && Date.parse(s.at) <= kMs)
    .map((s) => ({ t: Date.parse(s.at), druh: s.druh, kid: s.kontakt_id }))
    .sort((a, b) => a.t - b.t);
  const dnySignalu = new Set(signaly.map((s) => denPraha(new Date(s.t))));
  const useky: SurovyRadek['useky'] = [];
  let i = 0;
  while (i < kotvy.length) {
    let j = i;
    while (j + 1 < kotvy.length && kotvy[j + 1].t - kotvy[j].t <= USEK_MEZERA_MS) j += 1;
    const prvni = kotvy[i];
    const posledni = kotvy[j].t;
    const kotev = j - i + 1;
    if (!dnySignalu.has(denPraha(new Date(prvni.t)))) {
      // den bez signálu (před časovačem, stará appka): odhad z výsledků hovorů
      useky.push({ od: prvni.t, do: posledni, kotev, odhad: true });
    } else {
      const karta = signaly.filter((s) => s.druh === 'karta' && s.kid === prvni.kid && s.t <= prvni.t && prvni.t - s.t <= USEK_MEZERA_MS).pop();
      let pred = posledni;
      let konecRetezu: number | null = null;
      let konec: number | null = null;
      for (const s of signaly) {
        if (s.t <= posledni) continue;
        if (s.t - pred > SIGNAL_RETEZ_MS) break;
        pred = s.t;
        konecRetezu = s.t;
        if (s.druh === 'konec' && s.t - posledni <= USEK_MEZERA_MS) {
          konec = s.t;
          break;
        }
      }
      const doKdy = konec ?? (konecRetezu !== null && konecRetezu - posledni <= USEK_MEZERA_MS ? konecRetezu : posledni);
      useky.push({ od: karta ? karta.t : prvni.t, do: doKdy, kotev, odhad: false });
    }
    i = j + 1;
  }
  return useky;
}

/** Surová čísla jednoho člověka (uid) nebo kontaktů bez připsaného člověka (uid null, řádek Nepřiřazeno). */
function surovyRadek(uid: number | null, f: PrehledFiltr, odMs: number, doMs: number, kMs: number): SurovyRadek {
  const vObdobi = (iso: string | null | undefined) => {
    if (!iso) return false;
    const t = Date.parse(iso);
    return t >= odMs && t < doMs && t <= kMs;
  };
  const sedi = (c: Kontakt | undefined) => {
    if (!c) return false;
    if (f.segment && !f.segment.includes(segmentOf(c))) return false;
    if (f.obor) {
      const m = /^([^:]+):\s*(.*)$/.exec(c.obor ?? '');
      const spec = m ? m[2].split(',').map((x) => `${m[1].trim()}: ${x.trim()}`) : [];
      if (!f.obor.some((o) => spec.includes(o))) return false;
    }
    // kraj zná server jen u firem oborů (obor_udaje); demo je nemá, každý kontakt je v „neznamy“
    if (f.kraj && !f.kraj.includes('neznamy')) return false;
    return true;
  };
  const kontakt = (id: number) => kontakty.find((c) => c.id === id);
  const hovory = uid === null ? [] : callLog.filter((l) => l.user_id === uid && vObdobi(l.created_at) && sedi(kontakt(l.kontakt_id)));
  const prodane = kontakty.filter((c) => PRODANO_STAVY.includes(c.status) && sedi(c));
  const prodeje = prodane
    .filter((c) => vObdobi(datumProdeje(c)) && pripsanyClovek(c, f.atribuce, kMs) === uid)
    .map((c) => ({ kontakt_id: c.id, ...cenaProdeje(c) }));
  const provize = (doKdy: number, odKdy: number) =>
    prodane
      .filter((c) => {
        const t = Date.parse(datumProdeje(c));
        return t >= odKdy && t < doKdy && t <= kMs && pripsanyClovek(c, 'posledni_zajem', kMs) === uid;
      })
      .map((c) => {
        const { castka, mena } = cenaProdeje(c);
        return { kontakt_id: c.id, mena, castka: castka === null ? null : mena === 'CZK' ? Math.round((castka * PROVIZE_PROCENT) / 100) : Math.round(castka * PROVIZE_PROCENT) / 100 };
      });
  const r = uid === null ? undefined : rozvrhy.get(uid);
  let plan: SurovyRadek['plan'] = null;
  if (r) {
    const odPlanu = denPraha(new Date(r.nastaveno_at));
    let hodiny = 0;
    let dni = 0;
    for (let d = f.od > odPlanu ? f.od : odPlanu; d <= f.do; d = posunDen(d, 1)) {
      hodiny += r.dny[isoDen(d) - 1]?.hodiny ?? 0;
      dni += 1;
    }
    plan = { hodiny, dni, castecne: !!r.zmeneno_at && denPraha(new Date(r.zmeneno_at)) >= f.od };
  }
  return {
    hovory: hovory.map((l) => ({ id: l.id, kontakt_id: l.kontakt_id, outcome: l.outcome })),
    // úkol 13: první návrh i u prodaných ukázkových klientů (navrhAt), jako ostatní funkce Přehledu
    navrhy: kontakty.filter((c) => vObdobi(navrhAt(c)) && sedi(c) && pripsanyClovek(c, f.atribuce, kMs) === uid).map((c) => c.id),
    prodeje,
    // Nepřiřazeno nemá provize ani plán (§9 úkol 4 bod 9; úkol 14c, ⚠ NAHRAZUJE nárok prodejů bez zájmu v řádku Nepřiřazeno; ty
    // jsou v řádcích provizí s user_id null)
    provize: uid === null ? [] : provize(doMs, odMs),
    provizeDoKonce: uid === null ? [] : provize(doMs, -Infinity),
    useky: uid === null ? [] : pracovniUseky(uid, kMs).filter((u) => u.od >= odMs && u.od < doMs),
    plan,
    // doba do zavolání z jednoho zdroje s řádky prokliku (073 app_prehled_sla; úkol 14c): komu označení patří, označení bez
    // volajícího = Nepřiřazeno, uzavřená bez hovoru a zrušené hovory vynechané
    sla: slaPozorovani(f, odMs, doMs, kMs).filter((s) => s.user_id === uid).map((s) => ({ hodiny: s.hodin })),
    // hotový naplánovaný hovor tomu, kdo ho uzavřel (coalesce(zmenil_id, user_id); kontrakt §9, 18. 11. 2026, úkol 4, bod 8;
    // úkol 14b, ⚠ NAHRAZUJE „vlastníkovi hovoru“); po termínu a doba do zavolání zůstávají vlastníkovi
    hotove: uid === null ? 0 : zavolatRadky.filter((z) => (z.zmenil_id ?? z.user_id) === uid && z.stav === 'hotovo' && vObdobi(z.uzavreno_at) && sedi(kontakt(z.kontakt_id))).length,
    // úkol 13: výplaty provizí (provize_vyplaty, D10) s datem výplaty v období a do konce období; platné k okamžiku (zapsané do
    // něj a nezrušené do něj, 073 app_prehled_vyplaty; recenze 14b, drobnost 2, ⚠ NAHRAZUJE „jen nezrušené“, které pohledu k datu
    // vzalo výplatu zrušenou až po něm)
    vyplaty: uid === null ? [] : PREHLED_VYPLATY.filter((v) => platiKDatu(v.zapsano_at, v.zruseno_at, kMs) && v.user_id === uid && v.vyplaceno_dne >= f.od && v.vyplaceno_dne <= f.do)
      .map((v) => ({ castka: v.castka, mena: v.mena })),
    vyplatyDoKonce: uid === null ? [] : PREHLED_VYPLATY.filter((v) => platiKDatu(v.zapsano_at, v.zruseno_at, kMs) && v.user_id === uid && v.vyplaceno_dne <= f.do)
      .map((v) => ({ castka: v.castka, mena: v.mena })),
    poTerminu: uid === null ? 0 : zavolatRadky.filter((z) => z.user_id === uid && z.stav === 'ceka' && Date.parse(z.kdy) < kMs && sedi(kontakt(z.kontakt_id))).length,
  };
}

/**
 * Pozorování doby do zavolání (073 app_prehled_sla, jeden zdroj pro tabulku lidí i řádky prokliku): označení začatá v období (do
 * k_datu) a naplánované hovory založené v období; hodin do zavolání nebo do uzavření hotovo, čekající null (cenzurované);
 * označení uzavřená bez zavolání a zrušené hovory vynechané; user_id = komu patří (označení bez volajícího null = Nepřiřazeno);
 * lidé z filtru, segment, obor a kraj; se zadaným k_datu nic (úkol 14c).
 */
function slaPozorovani(f: PrehledFiltr, odMs: number, doMs: number, kMs: number): { user_id: number | null; kontakt_id: number; hodin: number | null }[] {
  if (f.k_datu) return [];
  const vObdobi = (iso: string | null | undefined) => { if (!iso) return false; const t = Date.parse(iso); return t >= odMs && t < doMs && t <= kMs; };
  const doK = (iso: string | null | undefined) => !!iso && Date.parse(iso) <= kMs;
  const lidi = (uid: number | null) => !f.lide || (uid !== null && f.lide.includes(uid));
  return [
    ...oznaceniRadky.filter((o) => vObdobi(o.oznaceno_at) && (doK(o.zavolano_at) || !o.uzavreno_at || Date.parse(o.uzavreno_at) > kMs) && lidi(o.volajici_id)
      && sediFiltru(kontaktPodleId(o.kontakt_id), f))
      .map((o) => ({ user_id: o.volajici_id, kontakt_id: o.kontakt_id, hodin: doK(o.zavolano_at) ? (Date.parse(o.zavolano_at!) - Date.parse(o.oznaceno_at)) / HODINA_MS : null })),
    ...zavolatRadky.filter((z) => vObdobi(z.created_at) && ((z.stav === 'hotovo' && doK(z.uzavreno_at)) || z.stav === 'ceka' || (!!z.uzavreno_at && Date.parse(z.uzavreno_at) > kMs))
      && lidi(z.user_id) && sediFiltru(kontaktPodleId(z.kontakt_id), f))
      .map((z) => ({ user_id: z.user_id, kontakt_id: z.kontakt_id, hodin: z.stav === 'hotovo' && doK(z.uzavreno_at) ? (Date.parse(z.uzavreno_at!) - Date.parse(z.created_at)) / HODINA_MS : null })),
  ];
}
/** Sečtení surových řádků (součet: jednotky dohromady, různí klienti a pozorování se počítají ze sjednocení). */
function sectiRadky(rs: SurovyRadek[]): SurovyRadek {
  const plany = rs.map((r) => r.plan).filter((p): p is NonNullable<SurovyRadek['plan']> => p !== null);
  return {
    hovory: rs.flatMap((r) => r.hovory),
    navrhy: rs.flatMap((r) => r.navrhy),
    prodeje: rs.flatMap((r) => r.prodeje),
    provize: rs.flatMap((r) => r.provize),
    provizeDoKonce: rs.flatMap((r) => r.provizeDoKonce),
    useky: rs.flatMap((r) => r.useky),
    plan: plany.length === 0 ? null : { hodiny: plany.reduce((a, p) => a + p.hodiny, 0), dni: plany.reduce((a, p) => a + p.dni, 0), castecne: plany.some((p) => p.castecne) },
    planUseky: rs.flatMap((r) => (r.plan ? r.planUseky ?? r.useky : [])),
    // kdo bez rozvrhu odpracoval nějaký čas (073 pl_bez_hodin: sekundy > 0; úkol 14b, ⚠ NAHRAZUJE „aspoň jeden úsek“)
    bezPlanu: rs.reduce((a, r) => a + (r.plan ? r.bezPlanu ?? 0 : r.useky.some((u) => u.do > u.od) ? 1 : 0), 0),
    sla: rs.flatMap((r) => r.sla),
    hotove: rs.reduce((a, r) => a + r.hotove, 0),
    poTerminu: rs.reduce((a, r) => a + r.poTerminu, 0),
    vyplaty: rs.flatMap((r) => r.vyplaty),
    vyplatyDoKonce: rs.flatMap((r) => r.vyplatyDoKonce),
  };
}

/**
 * Pracovní doba a důvod, proč ji filtr segmentu, oboru nebo kraje nerozdělí (úkol 14a). ⚠ Úkol 14b (kontrakt §9, 18. 11. 2026,
 * úkol 4, bod 14; databáze 073): věta databáze a plán z rozvrhu klienty filtrovaný není, takže zůstává; NAHRAZUJE větu „Pracovní
 * čas není rozdělený podle segmentu, oboru ani kraje; zrušte tyto filtry.“ a nedostupný plán úkolu 14a.
 */
const PRACE_METRIKY = ['odpracovane_hodiny', 'vysledku_za_hodinu', 'plneni_planu'] as const;
const PRACE_BEZ_DIMENZE = 'Pracovní doba není rozdělená podle klientů; zrušte filtr.';
/** Metriky řádku lidí z hovorů (call_log): bez zdroje Hovory nedostupné (073 v_hk). */
const HOVOROVE_METRIKY: MetrikaCloveka[] = ['hovory', 'unikatni_klienti', 'dovolano', 'mira_dovolani', 'zajem', 'odmitnuto', 'nerelevantni', 'preplanovano', 'konverze', 'vysledku_za_hodinu'];

/** Metriky řádku (kontrakt §2.6: všech 13 klíčů; nula jen ověřená; neznámé v pokrytí). */
function metrikyRadku(s: SurovyRadek, f: PrehledFiltr, vyber: Record<string, unknown>): Record<MetrikaCloveka, Metrika> {
  const meny: MenaPrehledu[] = f.mena === 'obe' ? ['CZK', 'EUR'] : [f.mena];
  const proklik = (zdroj: string | null, klic: string) => (zdroj === null ? null : { zdroj, filtr: { ...f, vyber: { metrika: klic, ...vyber } } });
  const out = {} as Record<MetrikaCloveka, Metrika>;
  const dej = (klic: MetrikaCloveka, m: Partial<Metrika>) => {
    const def = METRIKY_LIDI.find((x) => x.klic === klic)!;
    const kvalita = m.kvalita ?? 'dostupne';
    out[klic] = {
      klic, verze: 1, nazev: def.nazev, hodnota: null, castky: [], citatel: null, jmenovatel: null, n: null, pokryti: null,
      kvalita, duvod: null, zaklad: def.zaklad, ...m,
      proklik: kvalita === 'nedostupne' ? null : proklik(def.zdroj, klic),
    } as Metrika;
  };
  // úkol 14c (073 app_prehled_lide_metriky v_hk, navrhy_od): metriky z hovorů a návrhy castecne s větou ZDROJ_OD, když období začíná
  // před prvním hovorem nebo prvním návrhem (do k_datu); návrhy bez jediného nedostupne (⚠ NAHRAZUJE „vždy dostupne“)
  const kZdroje = f.k_datu ? Date.parse(f.k_datu) : Infinity;
  const odObdobi = zacatekDnePraha(f.od);
  const zdrojPred = (z: ZdrojKlicPrehledu): string | null => { const od = rozsahZdroje(z, kZdroje).od; return od && odObdobi < Date.parse(od) ? zdrojOdText(z, od) : null; };
  const hovoryD = zdrojPred('hovory');
  const pocet = (klic: MetrikaCloveka, n: number, duvod: string | null = null) => dej(klic, { hodnota: n, n, pokryti: pokryti(n, n), kvalita: duvod ? 'castecne' : 'dostupne', duvod });
  const podil = (klic: MetrikaCloveka, c: number, j: number, n: number, p: PokrytiMetriky, kvalita: Metrika['kvalita'] = 'dostupne', duvod: string | null = null) =>
    dej(klic, { hodnota: j === 0 ? null : zaokr(c / j, 6), citatel: c, jmenovatel: j, n, pokryti: p, kvalita,
      duvod: [duvod, j === 0 ? 'Jmenovatel je 0, podíl nejde spočítat.' : null].filter(Boolean).join(' ') || null });
  const penize = (klic: MetrikaCloveka, polozky: { castka: number | null; mena: MenaPrehledu | null }[], co: string) => {
    const znamych = polozky.filter((x) => x.castka !== null).length;
    const castky: CastkaMeny[] = meny.map((mena) => {
      const v = polozky.filter((x) => x.mena === mena && x.castka !== null);
      return { mena, hodnota: v.length === 0 && znamych < polozky.length ? null : castkaText(v.reduce((a, x) => a + (x.castka ?? 0), 0)), pokryti: pokryti(v.length, v.length) };
    });
    const nezname = polozky.length - znamych;
    dej(klic, {
      castky, n: polozky.length, pokryti: pokryti(znamych, polozky.length), kvalita: nezname > 0 ? 'castecne' : 'dostupne',
      duvod: nezname > 0 ? `U ${nezname} z ${polozky.length} ${co} cena nejde přečíst nebo zatím není dohodnutá.` : null,
    });
  };
  const h = s.hovory;
  const vysledek = (o: string) => h.filter((l) => l.outcome === o).length;
  const dovolano = h.filter((l) => l.outcome !== 'nedovolano').length;
  const kvH: Metrika['kvalita'] = hovoryD ? 'castecne' : 'dostupne';
  pocet('hovory', h.length, hovoryD);
  pocet('unikatni_klienti', new Set(h.map((l) => l.kontakt_id)).size, hovoryD);
  pocet('dovolano', dovolano, hovoryD);
  podil('mira_dovolani', dovolano, h.length, h.length, pokryti(h.length, h.length), kvH, hovoryD);
  pocet('zajem', vysledek('zajem'), hovoryD);
  pocet('odmitnuto', vysledek('odmitnuto'), hovoryD);
  pocet('nerelevantni', vysledek('nerelevantni'), hovoryD);
  pocet('preplanovano', vysledek('preplanovano'), hovoryD);
  const zajem = vysledek('zajem');
  const odmitnuto = vysledek('odmitnuto');
  podil('konverze', zajem, zajem + odmitnuto, zajem + odmitnuto, pokryti(zajem + odmitnuto, zajem + odmitnuto), kvH, hovoryD);
  const navrhyZ = rozsahZdroje('navrhy', kZdroje);
  if (navrhyZ.od === null && navrhyZ.aktualni_k === null) dej('navrhy', { kvalita: 'nedostupne', duvod: 'Zdroj „Návrhy webu“ zatím nemá žádná data.' });
  else pocet('navrhy', new Set(s.navrhy).size, zdrojPred('navrhy'));
  pocet('pocet_prodeju', s.prodeje.length);
  penize('hodnota_prodeju', s.prodeje, 'prodejů');
  penize('provize_narok', s.provize, 'prodejů');
  // ⚠ úkol 13: výplaty z provize_vyplaty (demo PREHLED_VYPLATY); NAHRAZUJE ověřenou nulu úkolu 10 (tabulka byla prázdná)
  penize('provize_vyplaceno', s.vyplaty, 'výplat');
  penize('provize_zbyva', s.provizeDoKonce, 'prodejů');
  // zbývá = nárok do konce období − výplaty do konce období, po měnách (neznámý nárok bez přesné částky zůstane null, R7)
  out.provize_zbyva.castky = out.provize_zbyva.castky.map((c) => ({
    ...c,
    hodnota: c.hodnota === null ? null : castkaText(Number(c.hodnota) - s.vyplatyDoKonce.filter((v) => v.mena === c.mena).reduce((a, v) => a + v.castka, 0)),
  }));
  const useky = s.useky;
  const hodiny = zaokr(useky.reduce((a, u) => a + (u.do - u.od), 0) / HODINA_MS, 2);
  const odhady = useky.filter((u) => u.odhad).length;
  const pokrytiPrace = pokryti(useky.length - odhady, useky.length);
  const kvalitaPrace: Metrika['kvalita'] = odhady > 0 ? 'castecne' : 'dostupne';
  const duvodPrace = odhady > 0 ? `Odhad z výsledků hovorů, bez časovače, u ${odhady} z ${useky.length} pracovních úseků.` : null;
  dej('odpracovane_hodiny', { hodnota: hodiny, n: useky.length, pokryti: pokrytiPrace, kvalita: kvalitaPrace, duvod: duvodPrace });
  const kotev = useky.reduce((a, u) => a + u.kotev, 0);
  podil('vysledku_za_hodinu', kotev, hodiny, useky.length, pokrytiPrace, kvalitaPrace, duvodPrace);
  if (!s.plan) {
    dej('planovane_hodiny', { kvalita: 'nedostupne', duvod: 'Rozvrh není nastavený.' });
    dej('plneni_planu', { kvalita: 'nedostupne', duvod: 'Rozvrh není nastavený, plán nejde spočítat.' });
  } else {
    const planDuvod = s.plan.castecne ? 'Rozvrh se v období měnil; starší šablony se nezaznamenávaly.' : null;
    dej('planovane_hodiny', { hodnota: zaokr(s.plan.hodiny, 2), n: s.plan.dni, pokryti: pokryti(s.plan.dni, s.plan.dni), kvalita: planDuvod ? 'castecne' : 'dostupne', duvod: planDuvod });
    // plnění jen za lidi s plánem (rozhodnutí koordinátora 18. 11. 2026): jejich hodiny ÷ jejich plán; kdo bez rozvrhu pracoval,
    // jeho hodiny se nepočítají a plnění je částečné s důvodem („Odpracováno“ v součtu dál za všechny)
    const plUseky = s.planUseky ?? useky;
    const plHodiny = zaokr(plUseky.reduce((a, u) => a + (u.do - u.od), 0) / HODINA_MS, 2);
    const plOdhady = plUseky.filter((u) => u.odhad).length;
    const bez = s.bezPlanu ?? 0;
    const duvodPlneni = [
      plOdhady > 0 ? `Odpracované hodiny jsou u ${plOdhady} z ${plUseky.length} úseků odhad.` : null,
      planDuvod,
      bez > 0 ? `Bez rozvrhu: ${bez === 1 ? '1 člověk; jeho' : `${bez} ${bez <= 4 ? 'lidé' : 'lidí'}; jejich`} hodiny se do plnění plánu nepočítají.` : null,
    ].filter(Boolean).join(' ') || null;
    podil('plneni_planu', plHodiny, zaokr(s.plan.hodiny, 2), plUseky.length, pokryti(plUseky.length - plOdhady, plUseky.length),
      plOdhady > 0 || !!planDuvod || bez > 0 ? 'castecne' : 'dostupne', duvodPlneni);
  }
  // úkol 14b (073 v_hk): bez jediného hovoru (zdroj Hovory chybí) jsou čísla z hovorů i výsledků za hodinu nedostupná, nikdy 0
  if (rozsahZdroje('hovory').aktualni_k === null) {
    for (const klic of HOVOROVE_METRIKY) dej(klic, { kvalita: 'nedostupne', duvod: HOVORY_CHYBI });
  }
  // úkol 14a (koordinátor 18. 11. 2026 z revize databáze): pracovní doba nemá klienta, s filtrem segmentu, oboru nebo kraje ji
  // server vrací nedostupnou s důvodem (provize se filtrem řídí dál; plán z rozvrhu zůstává, úkol 14b)
  if (filtrKlientu(f)) {
    for (const klic of PRACE_METRIKY) dej(klic, { kvalita: 'nedostupne', duvod: PRACE_BEZ_DIMENZE });
    // úkol 14b (kontrakt §9, 18. 11. 2026, úkol 4, bod 17): výplaty mají člověka, ne klienta; nárok se filtrem řídí dál
    dej('provize_vyplaceno', { kvalita: 'nedostupne', duvod: VYPLATY_BEZ_KLIENTU });
    dej('provize_zbyva', { kvalita: 'nedostupne', duvod: VYPLATY_BEZ_KLIENTU });
  }
  // úkol 14b (R11; §9 bod 5): komu označení patří a termín naplánovaného hovoru se nehistorizují, se zadaným k_datu nedostupné
  if (f.k_datu) {
    dej('sla_prvni_kontakt_median', { kvalita: 'nedostupne', duvod: SLA_JEN_DNES });
    dej('sla_prvni_kontakt_p90', { kvalita: 'nedostupne', duvod: SLA_JEN_DNES });
  } else {
    const zmerene = s.sla.map((x) => x.hodiny).filter((x): x is number => x !== null);
    const necenz = s.sla.length - zmerene.length;
    for (const [klic, p] of [['sla_prvni_kontakt_median', 0.5], ['sla_prvni_kontakt_p90', 0.9]] as const) {
      const v = percentil(zmerene, p);
      dej(klic, {
        hodnota: v === null ? null : zaokr(v, 2), n: zmerene.length, pokryti: pokryti(zmerene.length, s.sla.length),
        kvalita: necenz > 0 ? 'castecne' : 'dostupne',
        // věty 073 app_prehled_lide_metriky (úkol 14c, ⚠ NAHRAZUJE „… ještě nejsou zavolané.“ a „… žádné označení ani naplánovaný hovor.“)
        duvod: [necenz > 0 ? `U ${zN(necenz, s.sla.length, 'označení nebo naplánovaného hovoru', 'označení a naplánovaných hovorů')} zavolání ještě chybí.` : null,
          zmerene.length === 0 ? 'V období není žádné změřené zavolání.' : null].filter(Boolean).join(' ') || null,
      });
    }
  }
  pocet('naplanovane_hotove', s.hotove);
  if (f.k_datu) dej('naplanovane_po_terminu', { kvalita: 'nedostupne', duvod: PO_TERMINU_JEN_DNES });
  else pocet('naplanovane_po_terminu', s.poTerminu);
  // úkol 14b (§9 bod 4): filtr segmentu (před začátkem historie), oboru nebo kraje se zadaným k_datu = metriky castecne, kromě
  // plánu z rozvrhu (ten klienty filtrovaný není)
  const dim = dimKDatu(f).duvod;
  if (dim) for (const klic of Object.keys(out) as MetrikaCloveka[]) if (klic !== 'planovane_hodiny') out[klic] = sDalsimDuvodem(out[klic], dim);
  return out;
}

/**
 * meta.zdroje prehled_lide (§5.5, pořadí registru §3.8). ⚠ Úkol 13: z registru zdrojů Přehledu (rozsahZdroje níž), aby historie,
 * výplaty a návrhy seděly s ostatními funkcemi; NAHRAZUJE vlastní výčet úkolu 10 (historie a výplaty tam byly vždy prázdné).
 */
function zdrojePrehleduLidi(kMs = Infinity): PrehledMeta['zdroje'] {
  return zdrojeMeta(['hovory', 'dovolani', 'kontakty', 'prodeje', 'navrhy', 'slevy', 'historie', 'casovac', 'vyplaty', 'oznaceni', 'zavolat', 'rozvrh'], kMs);
}

/** prehled_lide (kontrakt §5.5). */
function prehledLideMock(me: MockUser, vstup: PrehledFiltrVstup | null | undefined): PrehledObalka<DataLide> {
  if (me.role !== 'super_admin') fail(PREHLED_JEN_SUPER);
  const f = prehledFiltr(vstup);
  const vygenerovano = now();
  const kMs = f.k_datu ? Date.parse(f.k_datu) : Date.parse(vygenerovano);
  const odMs = zacatekDnePraha(f.od);
  const doMs = zacatekDnePraha(posunDen(f.do, 1));
  const tymUzivatele = (u: MockUser) => (u.role === 'super_admin' ? u.id : u.manager_id);
  const lideRadku = (f.lide ? users.filter((u) => f.lide!.includes(u.id)) : [...users]).sort((a, b) => {
    const ta = tymUzivatele(a);
    const tb = tymUzivatele(b);
    if (ta !== tb) return ta === null ? 1 : tb === null ? -1 : ta - tb;
    if ((a.role === 'super_admin') !== (b.role === 'super_admin')) return a.role === 'super_admin' ? -1 : 1;
    return a.display_name.localeCompare(b.display_name, 'cs') || a.id - b.id;
  });
  const surove: { radek: Omit<RadekLide, 'metriky' | 'sla_cenzurovano'>; s: SurovyRadek; vyber: Record<string, unknown> }[] = lideRadku.map((u) => {
    const tym = tymUzivatele(u);
    return {
      radek: { druh: 'osoba', user_id: u.id, display_name: u.display_name, role: u.role, active: u.active, tym_id: tym,
        tym_nazev: tym === null ? null : `Tým ${users.find((x) => x.id === tym)?.display_name ?? tym}` },
      s: surovyRadek(u.id, f, odMs, doMs, kMs),
      vyber: { user_id: u.id },
    };
  });
  if (!f.lide) {
    const nikdo = surovyRadek(null, f, odMs, doMs, kMs);
    // Nepřiřazeno, když má návrhy, prodeje nebo označení bez volajícího (073; úkol 14c, ⚠ NAHRAZUJE „i provize“)
    if (nikdo.navrhy.length + nikdo.prodeje.length + nikdo.sla.length > 0) {
      surove.push({
        radek: { druh: 'neprirazeno', user_id: null, display_name: 'Nepřiřazeno', role: null, active: null, tym_id: null, tym_nazev: null },
        s: nikdo,
        vyber: { bez_prirazeni: true },
      });
    }
  }
  // se zadaným k_datu je doba do zavolání nedostupná, cenzurované pak null (úkol 14b, §9 bod 5)
  const cenzurovano = (s: SurovyRadek): number | null => (f.k_datu ? null : s.sla.filter((x) => x.hodiny === null).length);
  const radky: RadekLide[] = surove.map(({ radek, s, vyber }) => ({ ...radek, sla_cenzurovano: cenzurovano(s), metriky: metrikyRadku(s, f, vyber) }));
  const vsechno = sectiRadky(surove.map((x) => x.s));
  const soucet: RadekLide = {
    druh: 'soucet', user_id: null, display_name: 'Celkem', role: null, active: null, tym_id: null, tym_nazev: null,
    sla_cenzurovano: cenzurovano(vsechno), metriky: metrikyRadku(vsechno, f, {}),
  };
  // varování v pořadí 073 app_prehled_lide (úkol 14c, ⚠ NAHRAZUJE CASOVAC_OD podle odhadu v úsecích a větu „Časovač práce zatím nemá
  // žádný signál …“, která v registru není): filtr, provize vždy podle posledního zájmu, historie, ZDROJ_OD hovorů a návrhů,
  // CASOVAC_OD (období před prvním signálem), ZDROJ_OD výplat; víc ZDROJ_OD spojí obálka do jedné věty za každý zdroj
  const varovani: PrehledMeta['varovani'] = [];
  const kZ = f.k_datu ? kMs : Infinity;
  if (f.k_datu) varovani.push({ kod: 'K_DATU_MINULOST', text: `Čísla jsou k ${denCesky(f.k_datu)} ${casCesky(f.k_datu)}; bloky bez historie (kdo psal naposledy, mlčení) jsou jen pro dnešek.` });
  if (f.zaklad !== 'prirozeny') {
    varovani.push({ kod: 'ZAKLAD_JEN_KLIENTI', text: `Základ „${ZAKLADY_VOLBY.find((z) => z.klic === f.zaklad)?.nazev ?? f.zaklad}“ mění jen tabulky klientů; karty a ostatní tabulky mají svůj přirozený základ.` });
  }
  if (f.mena === 'obe') varovani.push({ kod: 'MENY_ODDELENE', text: 'Částky v CZK a EUR se nikdy nesčítají; každá měna je zvlášť.' });
  if (f.kraj) varovani.push({ kod: 'KRAJ_JEN_OBORY', text: 'Kraj známe jen u firem oborů; chaty a architekti jsou v „Neznámý kraj“.' });
  if (f.atribuce !== 'posledni_zajem') {
    varovani.push({ kod: 'PROVIZE_POSLEDNI_ZAJEM', text: 'Provize se počítá vždy podle posledního, kdo zapsal zájem (pravidlo výdělku), bez ohledu na zvolenou atribuci.' });
  }
  // stav k datu před historií a segment k datu před ní (úkol 14b, §9 bod 4) = HISTORIE_OD
  if ((f.k_datu && kMs < Date.parse(PREHLED_HISTORIE_OD)) || dimKDatu(f).historie) varovani.push({ kod: 'HISTORIE_OD', text: historieText() });
  for (const z of ['hovory', 'navrhy', 'casovac', 'vyplaty'] as const) {
    const od = rozsahZdroje(z, kZ).od;
    if (!od || odMs >= Date.parse(od)) continue;
    varovani.push(z === 'casovac' ? { kod: 'CASOVAC_OD', text: `Časovač práce běží od ${denCesky(od)}; dny před ním jsou odhad z výsledků hovorů, bez časovače.` }
      : { kod: 'ZDROJ_OD', text: zdrojOdText(z, od) });
  }
  return {
    api_verze: '1',
    definice_verze: definiceVerzePrehledu(),
    meta: { vygenerovano, k_datu: f.k_datu ?? vygenerovano, casove_pasmo: 'Europe/Prague', filtr: f, zdroje: zdrojePrehleduLidi(kZ), varovani: spojVarovani(varovani) },
    data: { atribuce: f.atribuce, radky, soucet },
  };
}

/* ---- Přehled vedení: ostatní funkce migrace 073 (úkol 13; kontrakt docs/superpowers/specs/2026-11-17-prehled-kontrakt.md §2,
   §3 a §5.1 až §5.17; Albert 17. 11. 2026, D1 až D12) ----
   Stejná pravidla jako prehled_lide výš: stráž super admina před čímkoli dalším, filtr p_filtr jako server (§2.7), peníze po
   měnách filtru jako text na 2 místa (CZK a EUR nikdy dohromady), neznámá cena jen v pokrytí (nikdy 0), nedostupné bez čísla
   s důvodem, proklik na řádky prehled_radky ze STEJNÝCH jednotek, ze kterých se počítá karta (součet řádků = karta).
   Demo nemá kontakt_historie: stav kontaktu je dnešní a historie „začíná“ 30 hodin před načtením dema (jako po nasazení 072),
   takže bloky z historie jsou nedostupné nebo částečné a varování HISTORIE_OD je vidět. Nové tabulky a události 072/073
   (faktury a platby, náklady, cíle, výplaty, zprávy z Gmailu, joby, tick, důvod zpětně) mají v demu vlastní ukázkové řádky
   níž, vždy u existujících ukázkových klientů; řádky kontaktů a call_log jsou společné s ostatními stránkami a nemění se. */

type ZdrojKlicPrehledu =
  | 'hovory' | 'dovolani' | 'kontakty' | 'prodeje' | 'navrhy' | 'slevy' | 'faktury' | 'platby' | 'historie' | 'tymy' | 'casovac'
  | 'gmail' | 'duvody' | 'naklady' | 'cile' | 'vyplaty' | 'snimky' | 'oznaceni' | 'zavolat' | 'rozvrh' | 'jobs' | 'tick';

/** Registr zdrojů (§3.8), v tomhle pořadí i v meta.zdroje. */
const ZDROJE_PREHLEDU: { zdroj: ZdrojKlicPrehledu; nazev: string }[] = [
  { zdroj: 'hovory', nazev: 'Hovory' },
  { zdroj: 'dovolani', nazev: 'Zápisy „Zavolal/a jsem“' },
  { zdroj: 'kontakty', nazev: 'Kontakty (stav)' },
  { zdroj: 'prodeje', nazev: 'Prodeje' },
  { zdroj: 'navrhy', nazev: 'Návrhy webu' },
  { zdroj: 'slevy', nazev: 'Nabídky za polovinu' },
  { zdroj: 'faktury', nazev: 'Faktury' },
  { zdroj: 'platby', nazev: 'Platby' },
  { zdroj: 'historie', nazev: 'Historie změn kontaktů' },
  { zdroj: 'tymy', nazev: 'Historie týmů' },
  { zdroj: 'casovac', nazev: 'Časovač práce' },
  { zdroj: 'gmail', nazev: 'Zprávy z Gmailu' },
  { zdroj: 'duvody', nazev: 'Důvody odmítnutí' },
  { zdroj: 'naklady', nazev: 'Náklady' },
  { zdroj: 'cile', nazev: 'Cíle' },
  { zdroj: 'vyplaty', nazev: 'Výplaty provizí' },
  { zdroj: 'snimky', nazev: 'Denní snímky' },
  { zdroj: 'oznaceni', nazev: 'Označení k zavolání' },
  { zdroj: 'zavolat', nazev: 'Naplánované hovory' },
  { zdroj: 'rozvrh', nazev: 'Rozvrh' },
  { zdroj: 'jobs', nazev: 'Práce automatizace' },
  { zdroj: 'tick', nazev: 'Běh automatizace' },
];

type SkupinaStavu = 'fronta' | 'otevrene' | 'prodano' | 'ztraceno' | 'archiv' | 'vyrazeno';
/** Stavy a skupiny reportingu (§3.1). */
const STAVY_PREHLEDU: { klic: KontaktStatus; nazev: string; skupina: SkupinaStavu }[] = [
  { klic: 'nekontaktovano', nazev: 'Nekontaktováno', skupina: 'fronta' },
  { klic: 'nedovolano', nazev: 'Nedovoláno', skupina: 'fronta' },
  { klic: 'zajem', nazev: 'Mají zájem', skupina: 'otevrene' },
  { klic: 'web_ve_vyrobe', nazev: 'Web ve výrobě', skupina: 'otevrene' },
  { klic: 'navrh_odeslan', nazev: 'Návrh odeslán', skupina: 'otevrene' },
  { klic: 'ceka_na_klienta', nazev: 'Čeká na klienta', skupina: 'otevrene' },
  { klic: 'upravy_ve_vyrobe', nazev: 'Úpravy ve výrobě', skupina: 'otevrene' },
  { klic: 'sleva_nabidnuta', nazev: 'Nabídnuta sleva', skupina: 'otevrene' },
  { klic: 'pozdeji', nazev: 'Ozve se později', skupina: 'otevrene' },
  { klic: 'pozastaveno', nazev: 'Pozastaveno', skupina: 'otevrene' },
  { klic: 'eskalace', nazev: 'Eskalace', skupina: 'otevrene' },
  { klic: 'schvaleno', nazev: 'Schváleno', skupina: 'prodano' },
  { klic: 'faktura_odeslana', nazev: 'Faktura odeslána', skupina: 'prodano' },
  { klic: 'zaplaceno', nazev: 'Zaplaceno', skupina: 'prodano' },
  { klic: 'domena_pripojena', nazev: 'Doména připojena', skupina: 'prodano' },
  { klic: 'hotovo', nazev: 'Hotovo', skupina: 'prodano' },
  { klic: 'odmitnuto', nazev: 'Odmítnuto', skupina: 'ztraceno' },
  { klic: 'bez_odpovedi', nazev: 'Archiv – neodpověděl', skupina: 'archiv' },
  { klic: 'nerelevantni', nazev: 'Nerelevantní', skupina: 'vyrazeno' },
  { klic: 'nekontaktovat', nazev: 'Nekontaktovat', skupina: 'vyrazeno' },
];
const nazevStavu = (s: KontaktStatus): string => STAVY_PREHLEDU.find((x) => x.klic === s)?.nazev ?? s;
const skupinaStavu = (s: KontaktStatus): SkupinaStavu => STAVY_PREHLEDU.find((x) => x.klic === s)?.skupina ?? 'fronta';
const OTEVRENE_STAVY: KontaktStatus[] = STAVY_PREHLEDU.filter((s) => s.skupina === 'otevrene').map((s) => s.klic);
const DODANI_STAVY: KontaktStatus[] = ['web_ve_vyrobe', 'navrh_odeslan', 'upravy_ve_vyrobe', 'schvaleno', 'faktura_odeslana', 'zaplaceno', 'domena_pripojena', 'hotovo'];

/** Signály akčního seznamu (§3.9). */
const SIGNALY_AKCI: { kod: SignalKod; nazev: string; dalsi_krok: string }[] = [
  { kod: 'klient_ceka', nazev: 'Klient napsal a čeká na odpověď', dalsi_krok: 'Odpovědět klientovi' },
  { kod: 'navrh_mlci', nazev: 'Mlčí po návrhu víc než 5 pracovních dní, hovor není naplánovaný', dalsi_krok: 'Zavolat, jestli se na návrh podíval' },
  { kod: 'hovor_po_terminu', nazev: 'Naplánovaný hovor je po termínu', dalsi_krok: 'Zavolat (hovor je po termínu)' },
  { kod: 'faktura_nepotvrzena', nazev: 'Faktura bez potvrzené platby déle než 14 dní', dalsi_krok: 'Ověřit platbu faktury' },
  { kod: 'schvaleno_bez_faktury', nazev: 'Web schválený, faktura neodešla do 3 dnů', dalsi_krok: 'Vystavit fakturu' },
  { kod: 'sleva_konci', nazev: 'Nabídka za polovinu končí do 2 dnů', dalsi_krok: 'Zavolat před koncem nabídky' },
  { kod: 'otazka', nazev: 'Otevřená otázka automatizace pro Alberta nebo super admina', dalsi_krok: 'Odpovědět na otázku automatizace' },
];
const KATEGORIE_VYUCTOVANI: { klic: KategorieVyuctovani; nazev: string }[] = [
  { klic: 'provize', nazev: 'Provize' },
  { klic: 'claude', nazev: 'Claude (předplatné)' },
  { klic: 'lovable', nazev: 'Lovable (předplatné)' },
  { klic: 'domena', nazev: 'Domény' },
  { klic: 'hosting', nazev: 'Hosting (náš náklad)' },
  { klic: 'jine', nazev: 'Jiné' },
];
const METRIKY_CILU: DataDefinice['metriky_cilu'] = [
  { klic: 'prodane_weby', nazev: 'Prodané weby', metrika: 'pocet_prodeju', v_mene: false, cele_cislo: true },
  { klic: 'hodnota_prodeju', nazev: 'Hodnota prodejů', metrika: 'hodnota_prodeju', v_mene: true, cele_cislo: false },
  { klic: 'inkaso', nazev: 'Inkaso', metrika: 'inkaso', v_mene: true, cele_cislo: false },
  { klic: 'hovory', nazev: 'Hovory', metrika: 'hovory', v_mene: false, cele_cislo: true },
  { klic: 'zajem', nazev: 'Hovory se zájmem', metrika: 'zajem', v_mene: false, cele_cislo: true },
  { klic: 'odpracovane_hodiny', nazev: 'Odpracované hodiny', metrika: 'odpracovane_hodiny', v_mene: false, cele_cislo: false },
];
const VAROVANI_SABLONY: DataDefinice['varovani'] = [
  { kod: 'HISTORIE_OD', sablona: 'Historie změn stavů a cen začíná {datum}; dřívější průchody fázemi nejsou známé.' },
  { kod: 'CASOVAC_OD', sablona: 'Časovač práce běží od {datum}; dny před ním jsou odhad z výsledků hovorů, bez časovače.' },
  { kod: 'ZDROJ_OD', sablona: 'Zdroj „{nazev}“ se eviduje od {datum}; dřívější data nejsou známá.' },
  { kod: 'GMAIL_CHYBI', sablona: 'Zprávy z Gmailu se zatím nesynchronizují (žádná úspěšná synchronizace).' },
  { kod: 'GMAIL_ZASTARALE', sablona: 'Poslední úspěšná synchronizace Gmailu byla {cas}.' },
  { kod: 'TICK_ZASTARALY', sablona: 'Automatizace naposledy běžela {cas}; čísla mohou být starší.' },
  { kod: 'MENY_ODDELENE', sablona: 'Částky v CZK a EUR se nikdy nesčítají; každá měna je zvlášť.' },
  { kod: 'KRAJ_JEN_OBORY', sablona: 'Kraj známe jen u firem oborů; chaty a architekti jsou v „Neznámý kraj“.' },
  { kod: 'PROVIZE_POSLEDNI_ZAJEM', sablona: 'Provize se počítá vždy podle posledního, kdo zapsal zájem (pravidlo výdělku), bez ohledu na zvolenou atribuci.' },
  { kod: 'K_DATU_MINULOST', sablona: 'Čísla jsou k {cas}; bloky bez historie (kdo psal naposledy, mlčení) jsou jen pro dnešek.' },
  { kod: 'NAKLADY_OVERIT', sablona: 'Počet nákladů, jejichž částka čeká na ověření: {n}.' },
  { kod: 'ODHAD', sablona: 'Odhad do konce měsíce je nevalidovaný odhad z naší historie, ne závazek.' },
  { kod: 'ZAKLAD_JEN_KLIENTI', sablona: 'Základ „{zaklad}“ mění jen tabulky klientů; karty a ostatní tabulky mají svůj přirozený základ.' },
];
const ATRIBUCE_VOLBY: DataMoznosti['atribuce'] = [
  { klic: 'posledni_zajem', nazev: 'Poslední, kdo zapsal zájem (jako výdělek)', vychozi: true },
  { klic: 'prvni_zajem', nazev: 'První, kdo zapsal zájem', vychozi: false },
  { klic: 'spravuje', nazev: 'Kdo klienta teď vede', vychozi: false },
];
const ZAKLADY_VOLBY: DataMoznosti['zaklady'] = [
  { klic: 'prirozeny', nazev: 'Přirozený základ každého čísla', vychozi: true },
  { klic: 'aktivita', nazev: 'Klienti s hovorem v období', vychozi: false },
  { klic: 'prodej', nazev: 'Klienti prodaní v období', vychozi: false },
  { klic: 'faktura', nazev: 'Klienti s fakturou v období', vychozi: false },
  { klic: 'platba', nazev: 'Klienti s platbou v období', vychozi: false },
];

interface KatalogMetriky {
  klic: string;
  nazev: string;
  jednotka: JednotkaMetriky;
  zaklad: string;
  zdroje: ZdrojKlicPrehledu[];
  /** zdroj řádků prokliku (§2.8); null = žádný seznam řádků hodnotu nereprodukuje (R19) */
  radky: RadkyZdroj | null;
  definice: string;
}
/** Katalog metrik verze 1 (§3.11, 70 metrik v pořadí kontraktu); na serveru tabulka prehled_metriky ze seedu 073. */
const KATALOG_PREHLEDU: KatalogMetriky[] = ([
  ['hodnota_prodeju', 'Hodnota prodejů', 'mena', 'prodej', 'prodeje kontakty', 'prodeje', 'Součet ceny prodejů s datem prodeje v období (cena podle pravidla výdělku: přijatá nabídka za polovinu, jinak cena webu; jen přesné ceny, rozsahy a neznámé v pokrytí).'],
  ['inkaso', 'Inkaso', 'mena', 'platba', 'platby faktury', 'platby', 'Platby potvrzené super adminem (D3) v období: částka faktur, které potvrzení jmenuje, jinak cena prodeje (částečně); stav zaplaceno bez události = odvozená platba.'],
  ['pocet_prodeju', 'Počet prodejů', 'pocet', 'prodej', 'prodeje kontakty', 'prodeje', 'Počet klientů v prodaném stavu k datu s datem prodeje v období (každý klient jednou).'],
  ['plneni_cile', 'Plnění cíle', 'podil', 'prodej', 'prodeje kontakty cile', 'prodeje', 'Hodnota prodejů ÷ cíl hodnoty prodejů pro stejný rozsah lidí, měnu a období, které období filtru obsahuje; bez cíle null.'],
  ['uspesnost', 'Úspěšnost návrhů', 'podil', 'uzavreni', 'navrhy prodeje kontakty', 'kontakty', 'Vyhrané ÷ (vyhrané + ztracené) mezi klienty s návrhem uzavřenými v období; ztracené = odmítnuto po návrhu (i sleva_vyprsela); otevřené mimo.'],
  ['otevrene', 'Otevřené obchody', 'pocet_a_mena', 'k_datu', 'kontakty navrhy slevy', 'kontakty', 'Klienti v otevřených stavech k datu a známá hodnota (cena nabídky za polovinu, jinak cena webu).'],
  ['odhad_mesic', 'Odhad do konce měsíce', 'mena', 'k_datu', 'kontakty navrhy slevy', 'kontakty', 'Potvrzené prodeje měsíce + \u03a3 známá otevřená hodnota × historická míra „fáze → prodáno do konce měsíce“; nevalidovaný odhad.'],
  ['k_zasahu', 'Případy k zásahu', 'pocet', 'k_datu', 'kontakty zavolat faktury platby', 'akce', 'Počet různých klientů v akčním seznamu (prehled_akce) se stejným filtrem.'],
  ['hovory', 'Hovory', 'pocet', 'aktivita', 'hovory', 'hovory', 'Řádky call_log v období (pokusy, ne klienti; dovolání „Zavolal/a jsem“ nejsou hovory, Albert 1. 11. 2026).'],
  ['unikatni_klienti', 'Různí klienti', 'pocet', 'aktivita', 'hovory', 'kontakty', 'Počet různých kontaktů s aspoň jedním hovorem v období.'],
  ['dovolano', 'Dovoláno', 'pocet', 'aktivita', 'hovory', 'hovory', 'Hovory s výsledkem jiným než nedovolano (zájem, odmítnuto, nerelevantní, přeplánováno); není to reached z all_stats.'],
  ['mira_dovolani', 'Míra dovolání', 'podil', 'aktivita', 'hovory', 'hovory', 'dovolano ÷ hovory.'],
  ['zajem', 'Hovory se zájmem', 'pocet', 'aktivita', 'hovory', 'hovory', 'Hovory s výsledkem zajem.'],
  ['odmitnuto', 'Odmítnuto v hovoru', 'pocet', 'aktivita', 'hovory', 'hovory', 'Hovory s výsledkem odmitnuto (odmítnutí hovoru, ne ztráta obchodu).'],
  ['nerelevantni', 'Nerelevantní', 'pocet', 'aktivita', 'hovory', 'hovory', 'Hovory s výsledkem nerelevantni.'],
  ['preplanovano', 'Přeplánováno', 'pocet', 'aktivita', 'hovory', 'hovory', 'Hovory s výsledkem preplanovano.'],
  ['konverze', 'Telefonní konverze', 'podil', 'aktivita', 'hovory', 'hovory', 'zajem ÷ (zajem + odmitnuto) z hovorů v období (jako dnešní Statistiky); není to úspěšnost obchodu.'],
  ['navrhy', 'Návrhy', 'pocet', 'navrh', 'navrhy hovory', 'kontakty', 'Klienti s prvním návrhem (first_proposal_at) v období, připsaní podle atribuce.'],
  ['provize_narok', 'Provize – nárok', 'mena', 'prodej', 'prodeje hovory', 'provize', '30 % z ceny webu prodejů v období (bez hostingu, pravidlo app_vydelek; vždy atribuce posledni_zajem); CZK zaokrouhleně na koruny, EUR na centy.'],
  ['provize_vyplaceno', 'Provize – vyplaceno', 'mena', 'vyplata', 'vyplaty', 'provize', 'Součet výplat provizí (provize_vyplaty) s datem výplaty v období.'],
  ['provize_zbyva', 'Provize – zbývá vyplatit', 'mena', 'vyplata', 'prodeje hovory vyplaty', 'provize', 'Nárok s datem prodeje do konce období − výplaty do konce období (může být záporné).'],
  ['odpracovane_hodiny', 'Odpracované hodiny', 'h', 'aktivita', 'hovory dovolani casovac', 'prace', 'Součet pracovních úseků (D5, §5.14) začínajících v období.'],
  ['vysledku_za_hodinu', 'Výsledků za hodinu', 'podil', 'aktivita', 'hovory dovolani casovac', 'prace', 'Počet kotev (výsledky hovorů a dovolání) v úsecích ÷ odpracované hodiny; může být víc než 1.'],
  ['planovane_hodiny', 'Plánované hodiny', 'h', 'aktivita', 'rozvrh', null, 'Hodiny podle dnešní šablony rozvrhu pro dny období od nastavení rozvrhu.'],
  ['plneni_planu', 'Plnění plánu', 'podil', 'aktivita', 'hovory dovolani casovac rozvrh', 'prace', 'odpracovane_hodiny ÷ planovane_hodiny; může být víc než 1.'],
  ['sla_prvni_kontakt_median', 'Doba do zavolání (medián)', 'h', 'aktivita', 'oznaceni zavolat', 'kontakty', 'Medián hodin od označení (oznaceni.oznaceno_at) nebo naplánování (zavolat.created_at) do zavolání; začátek v období, nezavolané v pokrytí jako neznámé.'],
  ['sla_prvni_kontakt_p90', 'Doba do zavolání (90. percentil)', 'h', 'aktivita', 'oznaceni zavolat', 'kontakty', 'percentile_cont(0.9) téhož.'],
  ['naplanovane_hotove', 'Naplánované hovory hotové', 'pocet', 'aktivita', 'zavolat', 'kontakty', 'Řádky zavolat se stavem hotovo uzavřené v období.'],
  ['naplanovane_po_terminu', 'Naplánované hovory po termínu', 'pocet', 'k_datu', 'zavolat', 'kontakty', 'Řádky zavolat ve stavu ceka s časem před k_datu.'],
  ['rychlost_navrhu_median', 'Rychlost návrhu (medián)', 'd', 'navrh', 'hovory navrhy', 'kontakty', 'Medián dní od prvního zájmu (call_log zajem) do prvního návrhu; pokrytí: zname = s návrhem, nezname = čekají (cenzurované).'],
  ['rychlost_navrhu_p90', 'Rychlost návrhu (90. percentil)', 'd', 'navrh', 'hovory navrhy', 'kontakty', 'percentile_cont(0.9) téhož.'],
  ['slevy_nabidnuto', 'Nabídky za polovinu odeslané', 'pocet', 'navrh', 'slevy', 'kontakty', 'Klienti s první událostí sleva_odeslana v období.'],
  ['slevy_prijato', 'Nabídky za polovinu přijaté', 'pocet', 'navrh', 'slevy', 'kontakty', 'Z nich klienti prodaní po nabídce (do k_datu).'],
  ['slevy_mira_prijeti', 'Míra přijetí nabídky', 'podil', 'navrh', 'slevy', 'kontakty', 'slevy_prijato ÷ slevy_nabidnuto (otevřené v pokrytí jako neznámé).'],
  ['koncentrace_top1', 'Podíl největšího klienta', 'podil', 'prodej', 'prodeje kontakty', 'prodeje', 'Hodnota největšího prodeje ÷ hodnota prodejů v období, jedna měna.'],
  ['koncentrace_top5', 'Podíl 5 největších klientů', 'podil', 'prodej', 'prodeje kontakty', 'prodeje', 'Součet 5 největších ÷ hodnota prodejů v období, jedna měna.'],
  ['zpravy_nedoruceno', 'Nedoručené e-maily', 'pocet', 'zprava', 'gmail', 'zpravy', 'Zprávy email_zpravy s druhem nedoruceno v období.'],
  ['zpravy_automaticke', 'Automatické odpovědi', 'pocet', 'zprava', 'gmail', 'zpravy', 'Zprávy s druhem automaticka_odpoved v období.'],
  ['mira_odpovedi_po_navrhu', 'Odpověděli po návrhu', 'podil', 'navrh', 'navrhy gmail', 'kontakty', 'Klienti s návrhem v období, kteří po návrhu lidsky odpověděli (Gmail, jinak last_client_reply_at částečně) ÷ klienti s návrhem.'],
  ['nejasne_vazby', 'Nejasně přiřazené zprávy', 'pocet', 'zprava', 'gmail', 'zpravy', 'Zprávy s vazbou nejasne v období (seznam ke kontrole).'],
  ['nereagoval_na_nabidku', 'Nereagoval ani na nabídku za polovinu', 'pocet', 'uzavreni', 'slevy', 'odmitnuti', 'Události sleva_vyprsela v období (různí klienti).'],
  ['mlci_po_navrhu', 'Mlčí po návrhu', 'pocet', 'k_datu', 'kontakty navrhy', 'odmitnuti', 'Otevření klienti s návrhem, mlčí víc než 5 pracovních dní (kontakt_mlci_pd ≥ 5); jen pro dnešek.'],
  ['ztraty_bez_duvodu', 'Ztráty bez důvodu', 'pocet', 'uzavreni', 'duvody navrhy', 'odmitnuti', 'Klienti ztracení po návrhu v období bez řádku v odmitnuti.'],
  ['prodeje_mimo_prodej', 'Prodeje, kde klient už není v prodaném stavu', 'pocet', 'prodej', 'prodeje kontakty', 'prodeje', 'Řádky kontakt_prodej s datem v období, jejichž klient k datu není v prodaném stavu (v pocet_prodeju nejsou).'],
  ['faktury_pocet', 'Vystavené faktury', 'pocet', 'faktura', 'faktury platby', 'faktury', 'Události faktura_odeslana v období (doplňkové faktury taky; nejsou nový prodej).'],
  ['faktury_web', 'Fakturováno – web', 'mena', 'faktura', 'faktury platby', 'faktury', 'Součet části „web“ faktur v období, kde ji text faktury uvádí.'],
  ['faktury_hosting', 'Fakturováno – hosting', 'mena', 'faktura', 'faktury platby', 'faktury', 'Součet části „hosting“ faktur v období.'],
  ['faktury_celkem', 'Fakturováno celkem', 'mena', 'faktura', 'faktury platby', 'faktury', 'Součet celkových částek faktur v období.'],
  ['pohledavky_pocet', 'Nezaplacené faktury', 'pocet', 'k_datu', 'faktury platby', 'faktury', 'Faktury k datu bez potvrzené platby (§5.9).'],
  ['pohledavky_castka', 'Nezaplaceno', 'mena', 'k_datu', 'faktury platby', 'faktury', 'Součet celkových částek nezaplacených faktur k datu.'],
  ['slevy_castka', 'Poskytnuté slevy', 'mena', 'prodej', 'prodeje kontakty', 'prodeje', '\u03a3 (původní cena − nabídnutá cena) u prodejů po nabídce za polovinu v období, kde obě ceny jdou přečíst ve stejné měně.'],
  ['hosting_rocne', 'Hosting ročně', 'mena', 'k_datu', 'prodeje kontakty', 'prodeje', '\u03a3 roční ceny hostingu prodaných klientů k datu (cena hostingu je roční, PLAYBOOK); jen přesné.'],
  ['hosting_mrr', 'Hosting měsíčně (MRR)', 'mena', 'k_datu', 'prodeje kontakty', 'prodeje', 'hosting_rocne ÷ 12 (na 2 desetinná místa).'],
  ['hosting_arr', 'Hosting ročně (ARR)', 'mena', 'k_datu', 'prodeje kontakty', 'prodeje', 'hosting_mrr × 12.'],
  ['naklady_provize', 'Náklady – provize', 'mena', 'naklad', 'prodeje hovory', 'naklady', 'provize_narok v období jako náklad.'],
  ['naklady_claude', 'Náklady – Claude', 'mena', 'naklad', 'naklady', 'naklady', 'Rozpis řádků kategorie claude do období (§2.12).'],
  ['naklady_lovable', 'Náklady – Lovable', 'mena', 'naklad', 'naklady', 'naklady', 'Totéž pro lovable.'],
  ['naklady_domena', 'Náklady – domény', 'mena', 'naklad', 'naklady', 'naklady', 'Totéž pro domena.'],
  ['naklady_hosting', 'Náklady – hosting', 'mena', 'naklad', 'naklady', 'naklady', 'Totéž pro hosting (náš náklad, ne příjem).'],
  ['naklady_jine', 'Náklady – jiné', 'mena', 'naklad', 'naklady', 'naklady', 'Totéž pro jine.'],
  ['naklady_celkem', 'Náklady celkem', 'mena', 'naklad', 'naklady prodeje', 'naklady', 'Součet všech kategorií včetně provizí.'],
  ['vysledek', 'Výsledek', 'mena', 'platba', 'platby naklady', null, 'inkaso − naklady_celkem v období, po měnách; bez nákladů není zisk = tržba.'],
  ['domeny_pripojene', 'Připojené domény', 'pocet', 'aktivita', 'kontakty', 'kontakty', 'Události domena_pripojena v období.'],
  ['prognoza_potvrzene', 'Potvrzené prodeje měsíce', 'mena', 'prodej', 'prodeje kontakty', 'prodeje', 'Hodnota prodejů od prvního dne měsíce k_datu do k_datu.'],
  ['prognoza_pravdepodobnost', 'Míra „fáze → prodáno do konce měsíce“', 'podil', 'k_datu', 'kontakty navrhy slevy', 'kontakty', 'Podíl klientů, kteří za posledních 180 dní vstoupili do fáze a prodali se do tolika dní, kolik zbývá do konce měsíce.'],
  ['prognoza_zakladni', 'Odhad – základní', 'mena', 'k_datu', 'kontakty navrhy slevy', 'kontakty', 'prognoza_potvrzene + \u03a3 známá otevřená hodnota × míra fáze.'],
  ['prognoza_jen_jiste', 'Odhad – jen jisté', 'mena', 'k_datu', 'prodeje kontakty', 'prodeje', 'Jen prognoza_potvrzene.'],
  ['kvalita_navrhy_bez_emailu', 'Návrhy bez e-mailu', 'pocet', 'k_datu', 'navrhy kontakty', 'kontakty', 'Klienti s návrhem a bez e-mailu.'],
  ['kvalita_nejasne_vazby', 'Nejasně přiřazené zprávy', 'pocet', 'k_datu', 'gmail', 'zpravy', 'Všechny zprávy email_zpravy s vazbou nejasne.'],
  ['kvalita_platby_bez_faktury', 'Platby bez faktury', 'pocet', 'k_datu', 'platby faktury', 'platby', 'Platby, jejichž částka je cena prodeje, ne faktura.'],
] as [string, string, JednotkaMetriky, string, string, RadkyZdroj | null, string][]).map(([klic, nazev, jednotka, zaklad, zdroje, radky, definice]) => ({
  klic, nazev, jednotka, zaklad, zdroje: zdroje.split(' ') as ZdrojKlicPrehledu[], radky, definice,
}));
const KATALOG_MAPA = new Map(KATALOG_PREHLEDU.map((m) => [m.klic, m]));
/** Klíče tabulek, které proklik smí vybrat navíc ke katalogu (§7 VyberKlic). */
const VYBER_TABULKY = ['trychtyr', 'po_navrhu', 'stavy_kohorty', 'pipeline_faze', 'kohorta_mesic', 'kalibrace_znamky', 'kalibrace_hvezdy',
  'klienti_segment', 'klienti_obor', 'klienti_kraj', 'hodnoceni_webu', 'sablony', 'cekani_na_nas', 'cekani_na_klienta', 'duvody', 'dodani_faze',
  'blokace', 'pohyby'];
/** Povolené vyber.metrika podle zdroje řádků (§2.8). */
const VYBER_PODLE_ZDROJE: Record<RadkyZdroj, string[]> = {
  kontakty: ['otevrene', 'uspesnost', 'odhad_mesic', 'unikatni_klienti', 'navrhy', 'mira_odpovedi_po_navrhu', 'rychlost_navrhu_median', 'rychlost_navrhu_p90',
    'slevy_nabidnuto', 'slevy_prijato', 'slevy_mira_prijeti', 'sla_prvni_kontakt_median', 'sla_prvni_kontakt_p90', 'naplanovane_hotove', 'naplanovane_po_terminu',
    'domeny_pripojene', 'prognoza_pravdepodobnost', 'prognoza_zakladni', 'kvalita_navrhy_bez_emailu', 'trychtyr', 'po_navrhu', 'stavy_kohorty', 'pipeline_faze',
    'kohorta_mesic', 'kalibrace_znamky', 'kalibrace_hvezdy', 'klienti_segment', 'klienti_obor', 'klienti_kraj', 'hodnoceni_webu', 'sablony', 'cekani_na_nas',
    'cekani_na_klienta', 'dodani_faze', 'blokace', 'pohyby'],
  hovory: ['hovory', 'dovolano', 'mira_dovolani', 'zajem', 'odmitnuto', 'nerelevantni', 'preplanovano', 'konverze'],
  prodeje: ['pocet_prodeju', 'hodnota_prodeju', 'plneni_cile', 'prodeje_mimo_prodej', 'slevy_castka', 'koncentrace_top1', 'koncentrace_top5', 'prognoza_potvrzene',
    'prognoza_jen_jiste', 'hosting_rocne', 'hosting_mrr', 'hosting_arr'],
  faktury: ['faktury_pocet', 'faktury_web', 'faktury_hosting', 'faktury_celkem', 'pohledavky_pocet', 'pohledavky_castka'],
  platby: ['inkaso', 'kvalita_platby_bez_faktury'],
  naklady: ['naklady_provize', 'naklady_claude', 'naklady_lovable', 'naklady_domena', 'naklady_hosting', 'naklady_jine', 'naklady_celkem'],
  provize: ['provize_narok', 'provize_vyplaceno', 'provize_zbyva'],
  odmitnuti: ['duvody', 'nereagoval_na_nabidku', 'mlci_po_navrhu', 'ztraty_bez_duvodu'],
  zpravy: ['zpravy_nedoruceno', 'zpravy_automaticke', 'nejasne_vazby', 'kvalita_nejasne_vazby'],
  akce: ['k_zasahu'],
  prace: ['odpracovane_hodiny', 'vysledku_za_hodinu', 'plneni_planu'],
};
const ZDROJE_RADKU = Object.keys(VYBER_PODLE_ZDROJE) as RadkyZdroj[];
const VYBER_KLICE = ['metrika', 'krok', 'status', 'pasmo', 'segment', 'obor', 'kraj', 'znamka', 'user_id', 'bez_prirazeni', 'duvod', 'faze', 'kategorie', 'mena',
  'mesic', 'od', 'do', 'signal', 'smer', 'druh', 'sablona', 'hvezda'];

/** vyber (§7 Vyber): jen prehled_radky; neznámý klíč nebo špatná hodnota = „Neplatný filtr: vyber.<klíč>“. */
function vyberFiltru(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail('Neplatný filtr: vyber');
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!VYBER_KLICE.includes(k)) fail(`Neplatný filtr: vyber.${k}`);
  if (typeof o.metrika !== 'string' || !(KATALOG_MAPA.has(o.metrika) || VYBER_TABULKY.includes(o.metrika))) fail('Neplatný filtr: vyber.metrika');
  for (const k of ['od', 'do']) if (o[k] !== undefined && (typeof o[k] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o[k] as string))) fail(`Neplatný filtr: vyber.${k}`);
  if (o.user_id !== undefined && !Number.isInteger(o.user_id)) fail('Neplatný filtr: vyber.user_id');
  if (o.bez_prirazeni !== undefined && o.bez_prirazeni !== true) fail('Neplatný filtr: vyber.bez_prirazeni');
  if (o.hvezda !== undefined && typeof o.hvezda !== 'boolean') fail('Neplatný filtr: vyber.hvezda');
  for (const k of VYBER_KLICE) {
    if (['metrika', 'od', 'do', 'user_id', 'bez_prirazeni', 'hvezda'].includes(k)) continue;
    if (o[k] !== undefined && typeof o[k] !== 'string') fail(`Neplatný filtr: vyber.${k}`);
  }
  if (o.mena !== undefined && o.mena !== 'CZK' && o.mena !== 'EUR') fail('Neplatný filtr: vyber.mena');
  return { ...o };
}

/* --- ukázková data jen pro Přehled (nové tabulky 072/073 a události, které řádky dema nemají) --- */

/** Kdy demo začalo (ukázkové časy níž jsou od něj). */
const PREHLED_DEMO_START = Date.now();
const hodinZpet = (h: number): string => new Date(PREHLED_DEMO_START - h * HODINA_MS).toISOString();
/** Okamžik dnes v Praze nejvýš `h` hodin zpět (nikdy včera, nikdy v budoucnu): ukázka, která padne do Dnes i do tohoto měsíce. */
function dnesZpet(h: number): string {
  const ted = PREHLED_DEMO_START;
  const zacatek = zacatekDnePraha(denPraha(new Date(ted)));
  return new Date(Math.min(ted - 30000, Math.max(ted - h * HODINA_MS, zacatek + 60000))).toISOString();
}
/** Historie kontaktů a týmů (072) v demu „začíná“ 30 hodin před načtením (jako po nasazení migrace). */
const PREHLED_HISTORIE_OD = hodinZpet(30);
/**
 * Historie stavů kontaktů (kontakt_historie, pole status) v demu: změny stavu z appky v téhle relaci (výsledek hovoru, úprava
 * kontaktu, dovolání), nejstarší první (úkol 14c, parita s 073). Do začátku historie (PREHLED_HISTORIE_OD) dema žádné nejsou: stav
 * k okamžiku po jejím začátku je pravidlem R11 (stavKDatu) nejnovější řádek do toho okamžiku, jinak `stara` nejstaršího
 * pozdějšího, jinak dnešní stav.
 */
interface ZmenaStavuMock { kontakt_id: number; at: string; stara: KontaktStatus | null; nova: KontaktStatus }
const HISTORIE_STAVU: ZmenaStavuMock[] = [];
/** Poslední tick dispečera (události tick). */
const PREHLED_TICK_AT = hodinZpet(0.12);
/** Platnost nabídky za polovinu ve dnech (sleva_konci: nejnovější sleva_odeslana + 14 dní, §5.13). */
const SLEVA_PLATI_DNI = 14;
/**
 * První návrh prodaných ukázkových klientů a klienta 4 (na serveru first_proposal_at a události navrh_odeslan). Řádky dema
 * vznikly před migrací 060, ostatní stránky (čekání, označení) je proto bez návrhu znají dál; jen Přehled je čte (navrhAt).
 */
const PREHLED_NAVRHY = new Map<number, string>([[7, daysAgo(31)], [20, daysAgo(7)], [21, daysAgo(18)], [22, daysAgo(14)], [23, daysAgo(40)], [24, daysAgo(6)], [4, daysAgo(30)]]);
/** Ruční změny stavu na odmítnuto po návrhu (události stav_rucne „Stav: navrh_odeslan → odmitnuto“): kdy klient odmítl (R17). */
const PREHLED_ZTRATY = new Map<number, string>([[4, dnesZpet(6)]]);
/** Důvody zapsané zpětně (spec §6.4, zdroj zpetne): klient 4 „Mají starý web, ale nechtějí nic měnit“. */
const PREHLED_DUVODY_ZPETNE: { id: number; kontakt_id: number; faze: FazeOdmitnuti; duvod: DuvodOdmitnutiKod; text: string | null; zdroj: 'zpetne'; zapsal: string; at: string }[] = [
  { id: 900, kontakt_id: 4, faze: 'nahled', duvod: 'ma_web', text: 'Mají starý web a nechtějí nic měnit.', zdroj: 'zpetne', zapsal: 'zpetne:backfill', at: dnesZpet(2) },
];
interface UdalostPrehledu { id: number; kontakt_id: number; at: string; detail: string }
/** Události faktura_odeslana (detail jako na serveru, čte ho app_faktura_rozbor). */
const PREHLED_FAKTURY: UdalostPrehledu[] = [
  { id: 9001, kontakt_id: 23, at: daysAgo(29), detail: 'faktura 20260040 (250 EUR web + 120 EUR hosting = 370 EUR), vlakno demo' },
  { id: 9002, kontakt_id: 7, at: daysAgo(24), detail: 'faktura 20260041 (4900 Kc web = 4900 Kc), vlakno demo' },
  { id: 9003, kontakt_id: 9, at: daysAgo(16), detail: 'faktura 20260050 (4900 Kc web = 4900 Kc), vlakno demo' },
  { id: 9004, kontakt_id: 21, at: daysAgo(11), detail: 'faktura 20260057 (6500 Kc web + 1500 Kc hosting = 8000 Kc), vlakno demo' },
  { id: 9005, kontakt_id: 22, at: daysAgo(9), detail: 'faktura 20260059 (3500 Kc web + 1000 Kc hosting = 4500 Kc), vlakno demo' },
];
/** Události platba_prijata (D3: super admin potvrdil platbu); detail jmenuje čísla faktur, nebo žádné. */
const PREHLED_PLATBY: UdalostPrehledu[] = [
  { id: 9101, kontakt_id: 23, at: daysAgo(27), detail: 'zaplaceno, faktura 20260040' },
  { id: 9102, kontakt_id: 7, at: daysAgo(20), detail: 'zaplaceno, faktura 20260041' },
  { id: 9103, kontakt_id: 21, at: daysAgo(8), detail: 'zaplaceno, faktura 20260057' },
  { id: 9104, kontakt_id: 22, at: dnesZpet(5), detail: 'Albert potvrdil platbu v hovoru' },
];
interface MockNaklad {
  id: number;
  kategorie: Exclude<KategorieVyuctovani, 'provize'>;
  popis: string | null;
  castka: number;
  mena: MenaPrehledu;
  opakovani: 'jednorazove' | 'mesicne' | 'rocne';
  plati_od: string;
  plati_do: string | null;
  kontakt_id: number | null;
  overit: boolean;
  zapsal_id: number;
  zapsano_at: string;
  zruseno_at: string | null;
  /** kdo náklad zrušil (úkol 14b, naklady_zrus) */
  zrusil_id?: number | null;
}
const POPIS_D6 = 'Albert 17. 11. 2026 potvrdil částku; od kdy platíme, není známo, zadáno od 1. 11. 2026';
/** Náklady (D6, seed migrace 072): tři Claude po 5 000 Kč a Lovable 500 Kč měsíčně od 1. 11. 2026; doména jednoho klienta k ověření. */
const NAKLADY_DEMO: MockNaklad[] = [
  ...[1, 2, 3].map((id) => ({ id, kategorie: 'claude' as const, popis: POPIS_D6, castka: 5000, mena: 'CZK' as const, opakovani: 'mesicne' as const, plati_od: '2026-11-01',
    plati_do: null, kontakt_id: null, overit: false, zapsal_id: 1, zapsano_at: '2026-11-17T20:00:00.000Z', zruseno_at: null })),
  { id: 4, kategorie: 'lovable', popis: POPIS_D6, castka: 500, mena: 'CZK', opakovani: 'mesicne', plati_od: '2026-11-01', plati_do: null, kontakt_id: null, overit: false,
    zapsal_id: 1, zapsano_at: '2026-11-17T20:00:00.000Z', zruseno_at: null },
  { id: 5, kategorie: 'domena', popis: 'Doména penzion-sumava.cz (cena z faktury registrátora)', castka: 290, mena: 'CZK', opakovani: 'rocne', plati_od: denPraha(new Date(Date.parse(daysAgo(25)))),
    plati_do: null, kontakt_id: 7, overit: true, zapsal_id: 4, zapsano_at: daysAgo(20), zruseno_at: null },
];
const PREHLED_NAKLADY: MockNaklad[] = NAKLADY_DEMO.filter((n) => Date.parse(n.zapsano_at) <= PREHLED_DEMO_START);
interface MockCil {
  id: number;
  metrika: CilPrehledu['metrika'];
  obdobi_od: string;
  obdobi_do: string;
  user_id: number | null;
  tym_id: number | null;
  mena: MenaPrehledu | null;
  hodnota: number;
  zadal_id: number;
  zadano_at: string;
  zruseno_at: string | null;
}
const posledniDenMesice = (den: string): string => posunDen(`${posunDen(`${den.slice(0, 7)}-28`, 4).slice(0, 7)}-01`, -1);
const DEMO_DNES = denPraha(new Date(PREHLED_DEMO_START));
const DEMO_MESIC_OD = `${DEMO_DNES.slice(0, 7)}-01`;
const DEMO_ZADANO = new Date(Math.min(PREHLED_DEMO_START - 60000, zacatekDnePraha(DEMO_MESIC_OD) + 3 * HODINA_MS)).toISOString();
/** Cíle (D9): firma na tento měsíc a rok (hodnota prodejů v CZK), tým Mikuláše (prodané weby) a Petra (hovory). */
const PREHLED_CILE: MockCil[] = [
  { id: 1, metrika: 'hodnota_prodeju', obdobi_od: DEMO_MESIC_OD, obdobi_do: posledniDenMesice(DEMO_MESIC_OD), user_id: null, tym_id: null, mena: 'CZK', hodnota: 50000, zadal_id: 1, zadano_at: DEMO_ZADANO, zruseno_at: null },
  { id: 2, metrika: 'prodane_weby', obdobi_od: DEMO_MESIC_OD, obdobi_do: posledniDenMesice(DEMO_MESIC_OD), user_id: null, tym_id: 4, mena: null, hodnota: 3, zadal_id: 4, zadano_at: DEMO_ZADANO, zruseno_at: null },
  { id: 3, metrika: 'hovory', obdobi_od: DEMO_MESIC_OD, obdobi_do: posledniDenMesice(DEMO_MESIC_OD), user_id: 2, tym_id: null, mena: null, hodnota: 40, zadal_id: 1, zadano_at: DEMO_ZADANO, zruseno_at: null },
  { id: 4, metrika: 'hodnota_prodeju', obdobi_od: `${DEMO_DNES.slice(0, 4)}-01-01`, obdobi_do: `${DEMO_DNES.slice(0, 4)}-12-31`, user_id: null, tym_id: null, mena: 'CZK', hodnota: 400000, zadal_id: 1, zadano_at: DEMO_ZADANO, zruseno_at: null },
];
interface MockVyplata { id: number; user_id: number; castka: number; mena: MenaPrehledu; vyplaceno_dne: string; za_obdobi_od: string | null; za_obdobi_do: string | null; poznamka: string | null; zapsal_id: number; zapsano_at: string; zruseno_at: string | null }
/** Výplaty provizí (D10): Petře provize za Penzion Šumava. */
const PREHLED_VYPLATY: MockVyplata[] = [
  { id: 1, user_id: 2, castka: 1470, mena: 'CZK', vyplaceno_dne: denPraha(new Date(Date.parse(daysAgo(3)))), za_obdobi_od: null, za_obdobi_do: null, poznamka: 'Provize za Penzion Šumava', zapsal_id: 1, zapsano_at: daysAgo(3), zruseno_at: null },
];

/* ---- Přehled vedení: nastavení cílů, nákladů a výplat provizí (migrace 072, úkol 14b; kontrakt docs/superpowers/specs/
   2026-11-17-prehled-kontrakt.md §4.3 až §4.5, R6, R7, R21 a R32; Albert 17. 11. 2026, D6, D9 a D10) ----
   Stejné kontroly a věty ve stejném pořadí jako db/migration_072_prehled_zaklad.sql (naklady_uloz, cile_uloz,
   provize_vyplata_uloz a jejich _seznam a _zrus): stráž super admina před čímkoli, objekt, neznámý klíč (první podle abecedy;
   klíče tvaru jen ke čtení se ignorují), pole, práva D9 a D10 na nový i uložený rozsah, přesný duplikát cíle, id. Ukládá do
   PREHLED_NAKLADY, PREHLED_CILE a PREHLED_VYPLATY, ze kterých čtou prehled_souhrn, prehled_finance, prehled_lide, prehled_rada
   a prehled_radky: uložený náklad je hned v Nákladech celkem, cíl v Plnění cíle, výplata v Provize vyplaceno a zbývá. Zrušení
   je měkké (zruseno_at). Tabulka cile má v databázi obdobi_do den PO posledním dni a funkce převádějí; mock drží poslední den
   VČETNĚ jako API (R6), tak jak ho čtou souhrn a řada. Události naklad_zmena, cil_zmena a vyplata_zmena mají text serveru
   (háček zkoušky stav().udalostiNastaveni). */
interface UdalostNastaveni { type: 'naklad_zmena' | 'cil_zmena' | 'vyplata_zmena'; actor: string; detail: string; at: string }
const UDALOSTI_NASTAVENI: UdalostNastaveni[] = [];
let dalsiNakladId = Math.max(0, ...NAKLADY_DEMO.map((n) => n.id)) + 1;
let dalsiCilId = Math.max(0, ...PREHLED_CILE.map((c) => c.id)) + 1;
let dalsiVyplataId = Math.max(0, ...PREHLED_VYPLATY.map((v) => v.id)) + 1;
const udalostNastaveni = (type: UdalostNastaveni['type'], me: MockUser, detail: string): void => {
  UDALOSTI_NASTAVENI.push({ type, actor: me.display_name, detail, at: now() });
};
/** Stráž nastavení (R3): přihlášený super admin, jinak „Přehled vidí jen super admin.“ ještě před kontrolou parametrů. */
function superNastaveni(token: string): MockUser {
  const me = auth(token);
  if (me.role !== 'super_admin') fail(PREHLED_JEN_SUPER);
  return me;
}
const jeObjektJson = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Text hodnoty pole JSON jako `->>` v SQL: chybí nebo null = null, řetězec beze změny, jinak jeho JSON. */
const jsonText = (v: unknown): string | null => (v === undefined || v === null ? null : typeof v === 'string' ? v : JSON.stringify(v));
/** Neznámý klíč objektu: první podle abecedy mimo povolené (min(k) v SQL). */
const neznamyKlic = (o: Record<string, unknown>, povolene: readonly string[]): string | null => Object.keys(o).filter((k) => !povolene.includes(k)).sort()[0] ?? null;
/** app_json_datum: chybí nebo null = null; jinak RRRR-MM-DD s platným dnem, jinak „Neplatné datum v poli <pole>: …“. */
function jsonDatum(v: unknown, pole: string): string | null {
  if (v === undefined || v === null) return null;
  const platny = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))
    && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
  if (!platny) fail(`Neplatné datum v poli ${pole}: čekám RRRR-MM-DD.`);
  return v as string;
}
/** app_json_castka: kladné číslo (JSON číslo, nebo text „1234.50“ bez mezer a čárek), nejvýš 2 desetinná místa, pod max; jinak null. */
function jsonCastka(v: unknown, max: number): number | null {
  let n: number;
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || Math.abs(Math.round(v * 100) - v * 100) > 1e-6) return null;
    n = v;
  } else if (typeof v === 'string' && /^\d+(\.\d{1,2})?$/.test(v)) {
    n = Number(v);
  } else {
    return null;
  }
  return n <= 0 || n >= max ? null : Math.round(n * 100) / 100;
}
/** app_json_cele: chybí nebo null = null; celé nezáporné číslo nebo text číslic = to číslo; cokoli jiného -1 (žádný řádek ho nemá). */
function jsonCele(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 ? v : -1;
  return typeof v === 'string' && /^\d{1,18}$/.test(v) ? Number(v) : -1;
}
/** btrim(text, ' \t\r\n') a prázdný = null (popis nákladu, poznámka výplaty). */
function oriznutyText(v: unknown): string | null {
  const t = jsonText(v);
  if (t === null) return null;
  const s = t.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
  return s === '' ? null : s;
}
const delkaZnaku = (s: string): number => [...s].length;

const KLICE_NAKLADU = ['id', 'kategorie', 'popis', 'castka', 'mena', 'opakovani', 'plati_od', 'plati_do', 'kontakt_id', 'overit', 'kontakt_jmeno', 'zapsal', 'zapsano_at'] as const;
const KATEGORIE_EVIDENCE: MockNaklad['kategorie'][] = ['claude', 'lovable', 'domena', 'hosting', 'jine'];
/** app_naklad_json: řádek jako tvar Naklad (§7), kontakt_jmeno coalesce(jméno, firma, #id). */
function nakladVen(n: MockNaklad): Naklad {
  const c = n.kontakt_id === null ? undefined : kontakty.find((k) => k.id === n.kontakt_id);
  return {
    id: n.id, kategorie: n.kategorie, popis: n.popis, castka: castkaText(n.castka), mena: n.mena, opakovani: n.opakovani, plati_od: n.plati_od, plati_do: n.plati_do,
    kontakt_id: n.kontakt_id, kontakt_jmeno: c ? (c.name ?? '').trim() || (c.firma ?? '').trim() || `#${c.id}` : null, overit: n.overit,
    zapsal: users.find((u) => u.id === n.zapsal_id)?.display_name ?? '?', zapsano_at: n.zapsano_at,
  };
}
/** naklady_seznam (§4.3a): aktivní řádky, plati_od a id sestupně. */
function nakladySeznamMock(): Naklad[] {
  return PREHLED_NAKLADY.filter((n) => !n.zruseno_at).sort((a, b) => b.plati_od.localeCompare(a.plati_od) || b.id - a.id).map(nakladVen);
}
/** naklady_uloz (§4.3b): nový (bez id) nebo úplná náhrada aktivního řádku; každý super admin smí každý řádek. */
function nakladyUlozMock(me: MockUser, vstup: unknown): Naklad {
  if (!jeObjektJson(vstup)) fail('Náklad chybí: pošlete objekt s poli nákladu.');
  const klic = neznamyKlic(vstup, KLICE_NAKLADU);
  if (klic !== null) fail(`Neplatné pole nákladu: ${klic}.`);
  if (vstup.overit !== undefined && vstup.overit !== null && typeof vstup.overit !== 'boolean') fail('Neplatné pole nákladu: overit.');
  const kategorie = jsonText(vstup.kategorie);
  if (kategorie === null || !(KATEGORIE_EVIDENCE as string[]).includes(kategorie)) {
    fail(`Neplatná kategorie nákladu: ${kategorie ?? '(null)'}. Povolené: claude, lovable, domena, hosting, jine.`);
  }
  const castka = jsonCastka(vstup.castka, 1e10);
  if (castka === null) fail('Částka nákladu musí být kladné číslo s nejvýš dvěma desetinnými místy.');
  const mena = jsonText(vstup.mena);
  if (mena !== 'CZK' && mena !== 'EUR') fail(`Neplatná měna: ${mena ?? '(null)'}. Povolené: CZK, EUR.`);
  const opakovani = jsonText(vstup.opakovani);
  if (opakovani !== 'jednorazove' && opakovani !== 'mesicne' && opakovani !== 'rocne') fail(`Neplatné opakování: ${opakovani ?? '(null)'}. Povolené: jednorazove, mesicne, rocne.`);
  const od = jsonDatum(vstup.plati_od, 'plati_od');
  if (od === null) fail('Zadejte, od kterého dne náklad platí.');
  const doDne = jsonDatum(vstup.plati_do, 'plati_do');
  if (doDne !== null && doDne < od) fail('Náklad nemůže skončit dřív, než začne.');
  if (opakovani === 'jednorazove' && doDne !== null) fail('Jednorázový náklad nemá konec platnosti; plati_do nechte prázdné.');
  if (typeof vstup.popis === 'object' && vstup.popis !== null) fail('Neplatné pole nákladu: popis.');
  const popis = oriznutyText(vstup.popis);
  if (popis !== null && delkaZnaku(popis) > 300) fail('Popis nákladu je moc dlouhý: nejvýš 300 znaků.');
  const kontaktId = jsonCele(vstup.kontakt_id);
  if (kontaktId !== null && !kontakty.some((c) => c.id === kontaktId)) fail(`Kontakt id=${jsonText(vstup.kontakt_id)} neexistuje.`);
  const overit = vstup.overit === true;
  const id = jsonCele(vstup.id);
  const pole = { kategorie: kategorie as MockNaklad['kategorie'], popis, castka, mena: mena as MenaPrehledu, opakovani: opakovani as MockNaklad['opakovani'], plati_od: od,
    plati_do: doDne, kontakt_id: kontaktId, overit, zapsal_id: me.id, zapsano_at: now() };
  let n: MockNaklad;
  if (id !== null) {
    const puvodni = PREHLED_NAKLADY.find((x) => x.id === id);
    if (!puvodni) fail(`Náklad id=${jsonText(vstup.id)} neexistuje.`);
    if (puvodni.zruseno_at) fail(`Náklad id=${id} je zrušený, změnit ani zrušit ho už nejde.`);
    n = Object.assign(puvodni, pole);
  } else {
    n = { id: dalsiNakladId++, ...pole, zruseno_at: null };
    PREHLED_NAKLADY.push(n);
  }
  udalostNastaveni('naklad_zmena', me, `Náklad ${n.id} ${id === null ? 'přidán' : 'změněn'}: ${n.kategorie} ${castkaText(n.castka)} ${n.mena}, ${n.opakovani}, od ${n.plati_od}`
    + (n.plati_do ? ` do ${n.plati_do}` : '') + (n.kontakt_id !== null ? `, kontakt ${n.kontakt_id}` : '') + (n.overit ? ', ověřit' : ''));
  return nakladVen(n);
}
/** naklady_zrus (§4.3c): měkké zrušení; řádek zmizí ze seznamu i z nákladů od toho okamžiku. */
function nakladyZrusMock(me: MockUser, id: number): OkId {
  const n = PREHLED_NAKLADY.find((x) => x.id === id);
  if (!n) fail(`Náklad id=${id} neexistuje.`);
  if (n.zruseno_at) fail(`Náklad id=${id} je zrušený, změnit ani zrušit ho už nejde.`);
  n.zruseno_at = now();
  n.zrusil_id = me.id;
  udalostNastaveni('naklad_zmena', me, `Náklad ${id} zrušen.`);
  return { ok: true, id };
}

const KLICE_CILE = ['id', 'metrika', 'obdobi_od', 'obdobi_do', 'user_id', 'tym_id', 'mena', 'hodnota', 'user_jmeno', 'tym_jmeno', 'zadal', 'zadano_at', 'smi_upravit'] as const;
/**
 * app_cil_smi_upravit (D9): Albert vše; jiný super admin svůj osobní cíl, osobní cíl člověka s manager_id = on a cíl svého
 * týmu (tym_id = on); cíl celé firmy jen Albert. Totéž smi_upravit v cile_seznam.
 */
function smiCil(me: MockUser, userId: number | null, tymId: number | null): boolean {
  if (me.role !== 'super_admin') return false;
  if (me.id === OWNER_ID) return true;
  if (userId !== null && tymId === null) return userId === me.id || users.find((u) => u.id === userId)?.manager_id === me.id;
  return userId === null && tymId !== null && tymId === me.id;
}
const odmitnutiCile = (userId: number | null, tymId: number | null): string =>
  userId !== null ? 'Cíl pro tohoto člověka zadává jen jeho super admin nebo Albert.'
    : tymId !== null ? 'Cíl pro tento tým zadává jen jeho super admin nebo Albert.' : 'Cíl pro celou firmu zadává jen Albert.';
/** cile_seznam (§4.4a): aktivní cíle všech, obdobi_od a id sestupně, smi_upravit pro přihlášeného. */
function cileSeznamMock(me: MockUser): CilPrehledu[] {
  return PREHLED_CILE.filter((c) => !c.zruseno_at).sort((a, b) => b.obdobi_od.localeCompare(a.obdobi_od) || b.id - a.id).map((c) => cilVen(me, c));
}
/** cile_uloz (§4.4b): nový cíl nebo úplná náhrada v rozsahu D9; odmítne jen přesný duplikát (R21). */
function cileUlozMock(me: MockUser, vstup: unknown): CilPrehledu {
  if (!jeObjektJson(vstup)) fail('Cíl chybí: pošlete objekt s poli cíle.');
  const klic = neznamyKlic(vstup, KLICE_CILE);
  if (klic !== null) fail(`Neplatné pole cíle: ${klic}.`);
  const metrika = jsonText(vstup.metrika);
  const def = METRIKY_CILU.find((m) => m.klic === metrika);
  if (!def) fail(`Neplatná metrika cíle: ${metrika ?? '(null)'}. Povolené: prodane_weby, hodnota_prodeju, inkaso, hovory, zajem, odpracovane_hodiny.`);
  const od = jsonDatum(vstup.obdobi_od, 'obdobi_od');
  if (od === null) fail('Neplatné datum v poli obdobi_od: čekám RRRR-MM-DD.');
  const doDne = jsonDatum(vstup.obdobi_do, 'obdobi_do');
  if (doDne === null) fail('Neplatné datum v poli obdobi_do: čekám RRRR-MM-DD.');
  if (doDne < od) fail('Období cíle: konec nesmí být dřív než začátek.');
  const hodnota = jsonCastka(vstup.hodnota, 1e12);
  if (hodnota === null) fail('Hodnota cíle musí být kladné číslo s nejvýš dvěma desetinnými místy.');
  if (def.cele_cislo && !Number.isInteger(hodnota)) fail(`Cíl ${def.klic} musí být celé číslo.`);
  const mena = jsonText(vstup.mena);
  if (def.v_mene) {
    if (mena === null) fail(`Cíl ${def.klic} je v penězích: zadejte měnu CZK nebo EUR.`);
    if (mena !== 'CZK' && mena !== 'EUR') fail(`Neplatná měna: ${mena}. Povolené: CZK, EUR.`);
  } else if (mena !== null) {
    fail(`Cíl ${def.klic} se v měně nezadává.`);
  }
  const userId = jsonCele(vstup.user_id);
  const tymId = jsonCele(vstup.tym_id);
  if (userId !== null && tymId !== null) fail('Cíl je buď pro člověka, nebo pro tým, ne pro obojí.');
  if (userId !== null && !users.some((u) => u.id === userId)) fail(`Uživatel id=${jsonText(vstup.user_id)} neexistuje.`);
  if (tymId !== null && !users.some((u) => u.id === tymId && u.role === 'super_admin')) fail(`Tým id=${jsonText(vstup.tym_id)} neexistuje (tým je super admin a jeho lidé).`);
  // práva D9 na nový rozsah a u úpravy i na uložený (stejné pořadí jako server: duplikát až po právech, id až po duplikátu)
  if (!smiCil(me, userId, tymId)) fail(odmitnutiCile(userId, tymId));
  const id = jsonCele(vstup.id);
  const puvodni = id === null ? undefined : PREHLED_CILE.find((c) => c.id === id);
  if (puvodni && !smiCil(me, puvodni.user_id, puvodni.tym_id)) fail(odmitnutiCile(puvodni.user_id, puvodni.tym_id));
  const duplikat = PREHLED_CILE.filter((c) => !c.zruseno_at && c.metrika === def.klic && c.user_id === userId && c.tym_id === tymId && c.mena === mena
    && c.obdobi_od === od && c.obdobi_do === doDne && c.id !== id).sort((a, b) => a.id - b.id)[0];
  if (duplikat) fail(`Stejný cíl už je zadaný (id=${duplikat.id}): stejná metrika, rozsah, měna i období. Upravte ten.`);
  const pole = { metrika: def.klic, obdobi_od: od, obdobi_do: doDne, user_id: userId, tym_id: tymId, mena: mena as MenaPrehledu | null, hodnota, zadal_id: me.id, zadano_at: now() };
  let c: MockCil;
  if (id !== null) {
    if (!puvodni) fail(`Cíl id=${jsonText(vstup.id)} neexistuje.`);
    if (puvodni.zruseno_at) fail(`Cíl id=${id} je zrušený, změnit ani zrušit ho už nejde.`);
    c = Object.assign(puvodni, pole);
  } else {
    c = { id: dalsiCilId++, ...pole, zruseno_at: null };
    PREHLED_CILE.push(c);
  }
  const rozsah = c.user_id !== null ? `osoba ${c.user_id}` : c.tym_id !== null ? `tým ${c.tym_id}` : 'firma';
  udalostNastaveni('cil_zmena', me, `Cíl ${c.id} ${id === null ? 'přidán' : 'změněn'}: ${c.metrika} ${castkaText(c.hodnota)}${c.mena ? ` ${c.mena}` : ''} ${c.obdobi_od} až ${c.obdobi_do}, ${rozsah}`);
  return cilVen(me, c);
}
/** cile_zrus (§4.4c): měkké zrušení s právem smi_upravit. */
function cileZrusMock(me: MockUser, id: number): OkId {
  const c = PREHLED_CILE.find((x) => x.id === id);
  if (!c) fail(`Cíl id=${id} neexistuje.`);
  if (c.zruseno_at) fail(`Cíl id=${id} je zrušený, změnit ani zrušit ho už nejde.`);
  if (!smiCil(me, c.user_id, c.tym_id)) fail(odmitnutiCile(c.user_id, c.tym_id));
  c.zruseno_at = now();
  udalostNastaveni('cil_zmena', me, `Cíl ${id} zrušen.`);
  return { ok: true, id };
}

const KLICE_VYPLATY = ['id', 'user_id', 'castka', 'mena', 'vyplaceno_dne', 'za_obdobi_od', 'za_obdobi_do', 'poznamka', 'jmeno', 'zapsal', 'zapsano_at'] as const;
const VYPLATA_JEN_TYM = 'Výplatu provize zapisuje jen super admin toho člověka nebo Albert.';
/** app_vyplata_smi (D10): Albert komukoli; jiný super admin sobě a lidem, jejichž manager_id je on. Jako smim_vyplatu. */
const smiVyplatuMock = (me: MockUser, userId: number): boolean =>
  me.role === 'super_admin' && (me.id === OWNER_ID || userId === me.id || users.find((u) => u.id === userId)?.manager_id === me.id);
/** app_vyplata_json: tvar Vyplata (§7), jméno příjemce a kdo řádek naposledy uložil. */
function vyplataVen(v: MockVyplata): Vyplata {
  return {
    id: v.id, user_id: v.user_id, jmeno: users.find((u) => u.id === v.user_id)?.display_name ?? '?', castka: castkaText(v.castka), mena: v.mena, vyplaceno_dne: v.vyplaceno_dne,
    za_obdobi_od: v.za_obdobi_od, za_obdobi_do: v.za_obdobi_do, poznamka: v.poznamka, zapsal: users.find((u) => u.id === v.zapsal_id)?.display_name ?? '?', zapsano_at: v.zapsano_at,
  };
}
/** provize_vyplaty_seznam (§4.5a): aktivní výplaty všech, vyplaceno_dne a id sestupně. */
function provizeVyplatySeznamMock(): Vyplata[] {
  return PREHLED_VYPLATY.filter((v) => !v.zruseno_at).sort((a, b) => b.vyplaceno_dne.localeCompare(a.vyplaceno_dne) || b.id - a.id).map(vyplataVen);
}
/** provize_vyplata_uloz (§4.5b): super admin svému týmu, Albert komukoli; u úpravy právo i na uloženého příjemce. */
function provizeVyplataUlozMock(me: MockUser, vstup: unknown): Vyplata {
  if (!jeObjektJson(vstup)) fail('Výplata chybí: pošlete objekt s poli výplaty.');
  const klic = neznamyKlic(vstup, KLICE_VYPLATY);
  if (klic !== null) fail(`Neplatné pole výplaty: ${klic}.`);
  const userId = jsonCele(vstup.user_id);
  if (userId === null || !users.some((u) => u.id === userId)) fail(`Uživatel id=${jsonText(vstup.user_id) ?? '(null)'} neexistuje.`);
  const castka = jsonCastka(vstup.castka, 1e10);
  if (castka === null) fail('Částka výplaty musí být kladné číslo s nejvýš dvěma desetinnými místy.');
  const mena = jsonText(vstup.mena);
  if (mena !== 'CZK' && mena !== 'EUR') fail(`Neplatná měna: ${mena ?? '(null)'}. Povolené: CZK, EUR.`);
  const dne = jsonDatum(vstup.vyplaceno_dne, 'vyplaceno_dne');
  const zaOd = jsonDatum(vstup.za_obdobi_od, 'za_obdobi_od');
  const zaDo = jsonDatum(vstup.za_obdobi_do, 'za_obdobi_do');
  if (dne === null) fail('Zadejte, kdy byla provize vyplacena.');
  if (zaOd !== null && zaDo !== null && zaDo < zaOd) fail('Období výplaty: konec nesmí být dřív než začátek.');
  if (typeof vstup.poznamka === 'object' && vstup.poznamka !== null) fail('Neplatné pole výplaty: poznamka.');
  const poznamka = oriznutyText(vstup.poznamka);
  if (poznamka !== null && delkaZnaku(poznamka) > 300) fail('Poznámka k výplatě je moc dlouhá: nejvýš 300 znaků.');
  if (!smiVyplatuMock(me, userId)) fail(VYPLATA_JEN_TYM);
  const id = jsonCele(vstup.id);
  const pole = { user_id: userId, castka, mena: mena as MenaPrehledu, vyplaceno_dne: dne, za_obdobi_od: zaOd, za_obdobi_do: zaDo, poznamka, zapsal_id: me.id, zapsano_at: now() };
  let v: MockVyplata;
  if (id !== null) {
    const puvodni = PREHLED_VYPLATY.find((x) => x.id === id);
    if (puvodni && !smiVyplatuMock(me, puvodni.user_id)) fail(VYPLATA_JEN_TYM);
    if (!puvodni) fail(`Výplata id=${jsonText(vstup.id)} neexistuje.`);
    if (puvodni.zruseno_at) fail(`Výplata id=${id} je zrušená, změnit ani zrušit ji už nejde.`);
    v = Object.assign(puvodni, pole);
  } else {
    v = { id: dalsiVyplataId++, ...pole, zruseno_at: null };
    PREHLED_VYPLATY.push(v);
  }
  udalostNastaveni('vyplata_zmena', me, `Výplata ${v.id} ${id === null ? 'přidána' : 'změněna'}: ${v.user_id} ${castkaText(v.castka)} ${v.mena} ${v.vyplaceno_dne}`);
  return vyplataVen(v);
}
/** provize_vyplata_zrus (§4.5c): měkké zrušení se stejným právem jako zápis. */
function provizeVyplataZrusMock(me: MockUser, id: number): OkId {
  const v = PREHLED_VYPLATY.find((x) => x.id === id);
  if (!v) fail(`Výplata id=${id} neexistuje.`);
  if (v.zruseno_at) fail(`Výplata id=${id} je zrušená, změnit ani zrušit ji už nejde.`);
  if (!smiVyplatuMock(me, v.user_id)) fail(VYPLATA_JEN_TYM);
  v.zruseno_at = now();
  udalostNastaveni('vyplata_zmena', me, `Výplata ${id} zrušena.`);
  return { ok: true, id };
}
const SCHRANKA_DEMO = 'domovwebu@gmail.com';
interface MockZprava { id: number; kontakt_id: number | null; smer: 'prichozi' | 'odchozi'; druh: RadekZpravy['druh']; prijato_at: string; vazba: RadekZpravy['vazba']; vlakno_id: string }
/** email_zpravy (D4): jen metadata a odkaz na vlákno, nikdy obsah, předmět ani adresa. */
const PREHLED_ZPRAVY: MockZprava[] = ([
  [1, 90, 'odchozi', 'clovek', daysAgo(15), 'vlakno'],
  [2, 92, 'prichozi', 'clovek', daysAgo(25), 'vlakno'],
  [3, 92, 'odchozi', 'clovek', daysAgo(15), 'vlakno'],
  [4, 94, 'prichozi', 'clovek', daysAgo(21), 'adresa'],
  [5, 94, 'odchozi', 'clovek', daysAgo(15), 'vlakno'],
  [6, 93, 'odchozi', 'clovek', daysAgo(18), 'vlakno'],
  [7, 93, 'prichozi', 'automaticka_odpoved', new Date(Date.parse(daysAgo(18)) + 300000).toISOString(), 'vlakno'],
  [8, 95, 'odchozi', 'clovek', daysAgo(2), 'vlakno'],
  [9, 95, 'prichozi', 'nedoruceno', new Date(Date.parse(daysAgo(2)) + 120000).toISOString(), 'vlakno'],
  [10, 22, 'prichozi', 'clovek', daysAgo(10.5), 'vlakno'],
  [11, 22, 'odchozi', 'clovek', daysAgo(9), 'vlakno'],
  [12, 20, 'prichozi', 'clovek', dnesZpet(3), 'vlakno'],
  [13, null, 'prichozi', 'clovek', daysAgo(4), 'nejasne'],
  [14, 303, 'prichozi', 'systemova', daysAgo(5), 'vlakno'],
] as [number, number | null, MockZprava['smer'], MockZprava['druh'], string, MockZprava['vazba']][]).map(([id, kontakt_id, smer, druh, prijato_at, vazba]) => ({
  id, kontakt_id, smer, druh, prijato_at, vazba, vlakno_id: `18c${(0x4a00 + (kontakt_id ?? 99) * 7).toString(16)}d${id}`,
}));
const odkazGmailu = (vlakno: string): string => `https://mail.google.com/mail/u/?authuser=${SCHRANKA_DEMO}#all/${vlakno}`;
/** email_sync: poslední úspěšná synchronizace před 24 minutami. */
const PREHLED_EMAIL_SYNC: GmailSync[] = [{ schranka: SCHRANKA_DEMO, posledni_uspech: hodinZpet(0.4), posledni_pokus: hodinZpet(0.4), stav: 'ok', chyba: null }];
const GMAIL_OD = '2026-09-01T00:00:00.000Z';
/** Joby automatizace (build a change) hotové; doba od založení do dokončení. */
const PREHLED_JOBY: { id: number; typ: 'build' | 'change'; kontakt_id: number; created_at: string; updated_at: string }[] = [
  { id: 7001, typ: 'build', kontakt_id: 93, created_at: daysAgo(19), updated_at: daysAgo(18.6) },
  { id: 7002, typ: 'build', kontakt_id: 20, created_at: daysAgo(8), updated_at: daysAgo(7.8) },
  { id: 7003, typ: 'build', kontakt_id: 24, created_at: daysAgo(7), updated_at: daysAgo(6.7) },
  { id: 7004, typ: 'build', kontakt_id: 95, created_at: daysAgo(3), updated_at: daysAgo(2.2) },
  { id: 7005, typ: 'change', kontakt_id: 94, created_at: daysAgo(22), updated_at: daysAgo(21.4) },
  { id: 7006, typ: 'change', kontakt_id: 92, created_at: daysAgo(16), updated_at: daysAgo(15.9) },
];

/* --- pomocníci --- */

/** První návrh klienta (first_proposal_at, u prodaných ukázkových klientů z PREHLED_NAVRHY). */
function navrhAt(c: Kontakt): string | null {
  return c.first_proposal_at ?? PREHLED_NAVRHY.get(c.id) ?? null;
}
/** Segment, obor a kraj filtru (R12, R13): demo nemá obor_udaje, každý kontakt je v kraji „neznamy“. */
function sediFiltru(c: Kontakt | undefined, f: PrehledFiltr): boolean {
  if (!c) return false;
  if (f.segment && !f.segment.includes(segmentOf(c))) return false;
  if (f.obor) {
    const m = /^([^:]+):\s*(.*)$/.exec(c.obor ?? '');
    const spec = m ? m[2].split(',').map((x) => `${m[1].trim()}: ${x.trim()}`) : [];
    if (!f.obor.some((o) => spec.includes(o))) return false;
  }
  if (f.kraj && !f.kraj.includes('neznamy')) return false;
  return true;
}
const kontaktPodleId = (id: number | null | undefined): Kontakt | undefined => (id === null || id === undefined ? undefined : kontakty.find((c) => c.id === id));
const jmenoKontaktu = (c: Kontakt): string => c.name ?? c.firma ?? `#${c.id}`;
/** Osoba (§7): člověk, jeho tým (super admin = on sám) a „Tým <jméno>“. */
function osobaPrehledu(uid: number | null | undefined): OsobaPrehledu | null {
  const u = users.find((x) => x.id === uid);
  if (!u) return null;
  const tym = u.role === 'super_admin' ? u.id : u.manager_id;
  return { user_id: u.id, display_name: u.display_name, tym_id: tym, tym_nazev: tym === null ? null : `Tým ${users.find((x) => x.id === tym)?.display_name ?? tym}` };
}
const NEZNAMA_CENA: CenaRozbor = { stav: 'nezname', castka: null, min: null, max: null, mena: null };
/** app_cena_rozbor: presne (jedna částka jako app_cena_cist), rozsah („6000-7000“, „6 000 až 7 000“), jinak nezname. */
function cenaRozborMock(text: string | null | undefined): CenaRozbor {
  const { castka, mena } = cenaCist(text);
  if (castka !== null) return { stav: 'presne', castka: castkaText(castka), min: null, max: null, mena: mena === 'eur' ? 'EUR' : 'CZK' };
  const t = bezDiakritiky((text ?? '').toLowerCase());
  const m = /(\d{1,3}(?:[ .]\d{3})+|\d+)\s*(?:-|–|az)\s*(\d{1,3}(?:[ .]\d{3})+|\d+)/.exec(t);
  if (m) {
    const a = Number(m[1].replace(/[ .]/g, ''));
    const b = Number(m[2].replace(/[ .]/g, ''));
    if (a > 0 && b > a) return { stav: 'rozsah', castka: null, min: castkaText(a), max: castkaText(b), mena: /eur|€/.test(t) ? 'EUR' : 'CZK' };
  }
  return { ...NEZNAMA_CENA };
}
/**
 * Roční cena hostingu (PLAYBOOK: hosting se účtuje ročně; 073 app_prehled_hosting_rozbor): text bez období nebo s ročním = roční
 * cena; jiné období (měsíčně, týdně, denně, čtvrtletně, pololetně, víc let) se nepřevádí = neznámá s důvodem `obdobi`; právě jedna
 * částka 1 až 100 000 Kč nebo 1 až 4 000 EUR (bez „do“, „od“, „max“, „až“ těsně před ní; „tis“ a „k“ násobí tisícem), jinak
 * `necitelne`; prázdné a zástupná výplň (app_cena_nezadana) `chybi`. ⚠ Úkol 14c NAHRAZUJE „jedno číslo, jen měsíčně neznámé“.
 */
function hostingRozbor(text: string | null | undefined): CenaRozbor & { duvod: 'chybi' | 'obdobi' | 'necitelne' | null } {
  const nez = (duvod: 'chybi' | 'obdobi' | 'necitelne') => ({ ...NEZNAMA_CENA, duvod });
  if (text === null || text === undefined || !text.trim() || cenaNezadanaMock(text)) return nez('chybi');
  const t = bezDiakritiky(text.normalize('NFKC').toLowerCase());
  if (/(^|[^\p{L}\p{N}_])(mesic\w*|mesicne|mes|tyden\w*|tydne\w*|tydenne|denne|ctvrtlet\w*|pololet\w*|roky|let|leta|month\w*|week\w*)(?![\p{L}\p{N}_])/u.test(t)) return nez('obdobi');
  let mena: MenaPrehledu = 'CZK';
  if (/(^|[^\p{L}\p{N}_])eur(a|o\w*)?(?![\p{L}\p{N}_])|€/u.test(t)) mena = 'EUR';
  else if (/(^|[^\p{L}\p{N}_])(usd|gbp|chf|pln|huf|dolar\w*)(?![\p{L}\p{N}_])|[$£]/u.test(t)) return nez('necitelne');
  const vzor = /(\d{1,3}(?:[ .,]\d{3})+(?!\d)|\d+)\s*(tis\.?|tisic\w*|k(?![\p{L}\p{N}_]))?/gu;
  const shody = [...t.matchAll(vzor)];
  if (shody.length !== 1) return nez('necitelne');
  const m = shody[0];
  const castka = Number(m[1].replace(/[ .,]/g, '')) * (m[2] ? 1000 : 1);
  if (/(^|\s)(do|max\w*\.?|nejvys\w*|az|od)\s*$/u.test(t.slice(0, m.index)) || !(castka > 0) || (mena === 'CZK' && castka > 100000) || (mena === 'EUR' && castka > 4000)) return nez('necitelne');
  return { stav: 'presne', castka: castkaText(castka), min: null, max: null, mena, duvod: null };
}
/** Hosting do tvaru CenaRozbor (bez důvodu), jak ho nesou řádky a časová osa (073 app_prehled_cena_api). */
const hostingApi = (text: string | null | undefined): CenaRozbor => { const { duvod: _d, ...r } = hostingRozbor(text); void _d; return r; };
interface CenaKontaktu { text: string | null; zdroj: 'cena_web' | 'sleva'; rozbor: CenaRozbor; castka: number | null; mena: MenaPrehledu | null }
/** Cena podle pravidla výdělku k okamžiku (§2.9): nejnovější nabídka za polovinu do té doby, jinak cena webu. */
function cenaKontaktu(c: Kontakt, doIso: string): CenaKontaktu {
  const sleva = (slevy.get(c.id) ?? []).filter((e) => e.created_at <= doIso).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const rozbor = sleva ? cenaRozborMock(cenaZeSlevy(sleva.detail)) : cenaNezadanaMock(c.cena_web) ? { ...NEZNAMA_CENA } : cenaRozborMock(c.cena_web);
  return {
    text: sleva ? cenaZeSlevyText(sleva.detail) : c.cena_web ?? null,
    zdroj: sleva ? 'sleva' : 'cena_web',
    rozbor,
    castka: rozbor.stav === 'presne' ? Number(rozbor.castka) : null,
    mena: rozbor.stav === 'nezname' ? null : rozbor.mena,
  };
}
/**
 * „ze“ nebo „z“ před číslem ve 2. pádě podle výslovnosti (073 app_prehled_ze): ze 2, 3, 4, 6, 7, 12 až 14, 16, 17, 20 až 49, 60 až
 * 79, 100 až 499, 600 až 799 …; z 1, 5, 8 až 11, 15, 18, 19, 50 až 59, 80 až 99, 1 000 … (úkol 14c, ⚠ NAHRAZUJE „ze před 2, 3, 4,
 * 7, 14, 17 a stovkami“, které psalo „z 6“, „z 12“ nebo „z 60“).
 */
const ZE = (p: number): string => {
  let n = Math.abs(Math.trunc(p));
  for (;;) {
    if (n >= 1000000) { if (Math.floor(n / 1000000) === 1) return 'z'; n = Math.floor(n / 1000000); }
    else if (n >= 1000) { if (Math.floor(n / 1000) === 1) return 'z'; n = Math.floor(n / 1000); }
    else break;
  }
  if (n >= 100) return [5, 8, 9].includes(Math.floor(n / 100)) ? 'z' : 'ze';
  if (n >= 20) return [5, 8, 9].includes(Math.floor(n / 10)) ? 'z' : 'ze';
  return [2, 3, 4, 6, 7, 12, 13, 14, 16, 17].includes(n) ? 'ze' : 'z';
};
/** Předložka z/ze jako server (export jen pro npm test prehledparita P7i). */
export const zeMock = ZE;
/** „1 ze 4 prodejů“ (073 app_prehled_z_n): a, předložka podle b, b a jméno ve 2. pádě (jednotné číslo pro b = 1). */
const zN = (a: number, b: number, jednotne: string, mnozne: string): string => `${a} ${ZE(b)} ${b} ${b === 1 ? jednotne : mnozne}`;
/** Volný text bez e-mailové adresy a telefonního čísla s aspoň 9 číslicemi (073 app_prehled_bez_kontaktu, R20). */
function bezKontaktu(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  return s.replace(/[^\s@<>()]+@[^\s@<>()]+/g, '[e-mail]').replace(/\+?\d(?:[\s./-]?\d){8,}/g, '[telefon]');
}
const meny = (f: PrehledFiltr): MenaPrehledu[] => (f.mena === 'obe' ? ['CZK', 'EUR'] : [f.mena]);
/** Položka peněz jednotky (073 app_prehled_penize {m, c, s}): přesná částka, nebo null s měnou (rozsah) či bez ní (neznámá). */
interface PolozkaPenez { castka: number | null; mena: MenaPrehledu | null; stav?: CenaStav }
/**
 * Peníze po měnách (R7, 073 app_prehled_penize): součet přesných v měně; null jen když v měně není nic přesného a jsou nejisté
 * položky, které do ní patřit můžou (rozsah té měny nebo neznámá měna); pokrytí měny = přesné a rozsahy té měny. ⚠ Úkol 14c
 * (kontrakt §9 úkol 4 bod 1): nejistá položka JINÉ měny tu měnu nenuluje (NAHRAZUJE „null, kdykoli je nějaká neznámá“).
 */
function castkyZ(polozky: PolozkaPenez[], mn: MenaPrehledu[]): CastkaMeny[] {
  return mn.map((mena) => {
    const v = polozky.filter((x) => x.mena === mena && x.castka !== null);
    const rozsahu = polozky.filter((x) => x.mena === mena && x.castka === null && (x.stav ?? 'rozsah') === 'rozsah').length;
    const nejiste = polozky.some((x) => x.castka === null && (x.mena === mena || x.mena === null));
    return { mena, hodnota: v.length === 0 && nejiste ? null : castkaText(v.reduce((a, x) => a + (x.castka ?? 0), 0)), pokryti: pokryti(v.length, v.length + rozsahu) };
  });
}
/**
 * Historie stavů (R11, 073 app_kontakt_pole_k_datu): stav kontaktu k okamžiku tMs = nejnovější řádek historie do tMs, jinak `stara`
 * nejstaršího pozdějšího, jinak dnešní stav; před založením kontaktu null (úkol 14c, most pipeline).
 */
function stavKDatu(c: Kontakt, tMs: number): KontaktStatus | null {
  let pred: ZmenaStavuMock | null = null;
  let po: ZmenaStavuMock | null = null;
  for (const h of HISTORIE_STAVU) {
    if (h.kontakt_id !== c.id) continue;
    const t = Date.parse(h.at);
    if (t <= tMs) { if (!pred || t >= Date.parse(pred.at)) pred = h; }
    else if (!po || t < Date.parse(po.at)) po = h;
  }
  if (pred) return pred.nova;
  if (po) return po.stara;
  const zalozen = (c as { created_at?: string | null }).created_at;
  return zalozen && Date.parse(zalozen) > tMs ? null : c.status;
}
/** Změna stavu z appky do historie dema (na serveru trigger kontakt_historie, migrace 072). */
function zapisZmenuStavu(kontaktId: number, stara: KontaktStatus | null, nova: KontaktStatus): void {
  if (stara !== nova) HISTORIE_STAVU.push({ kontakt_id: kontaktId, at: now(), stara, nova });
}
const jedneCastky = (c: CastkaMeny[]): CastkaJedna[] => c.map((x) => ({ mena: x.mena, hodnota: x.hodnota }));

interface KontextPrehledu {
  f: PrehledFiltr;
  meny: MenaPrehledu[];
  vygenerovano: string;
  kMs: number;
  /** strop záznamů zdrojů (073 app_prehled_zdroje p_k_datu): zadané k_datu, živě bez stropu (úkol 14c) */
  kZdroje: number;
  kIso: string;
  odMs: number;
  doMs: number;
  vObdobi: (iso: string | null | undefined) => boolean;
  doKDatu: (iso: string | null | undefined) => boolean;
  sedi: (c: Kontakt | undefined) => boolean;
  osoba: (c: Kontakt) => number | null;
  lidi: (uid: number | null) => boolean;
}
/** Stráž super admina a filtr (R3: stráž před parametry), pak kontext výpočtu. */
function kontextPrehledu(me: MockUser, vstup: unknown, sVyberem = false): KontextPrehledu {
  if (me.role !== 'super_admin') fail(PREHLED_JEN_SUPER);
  const f = prehledFiltr(vstup, sVyberem);
  const vygenerovano = now();
  const kMs = f.k_datu ? Date.parse(f.k_datu) : Date.parse(vygenerovano);
  const odMs = zacatekDnePraha(f.od);
  const doMs = zacatekDnePraha(posunDen(f.do, 1));
  return {
    f, meny: meny(f), vygenerovano, kMs, kZdroje: f.k_datu ? kMs : Infinity, kIso: new Date(kMs).toISOString(), odMs, doMs,
    vObdobi: (iso) => { if (!iso) return false; const t = Date.parse(iso); return t >= odMs && t < doMs && t <= kMs; },
    doKDatu: (iso) => !!iso && Date.parse(iso) <= kMs,
    sedi: (c) => sediFiltru(c, f),
    osoba: (c) => pripsanyClovek(c, f.atribuce, kMs),
    lidi: (uid) => !f.lide || (uid !== null && f.lide.includes(uid)),
  };
}

/**
 * Metrika (§2.6, všech 13 klíčů) z katalogu; proklik nese normalizovaný filtr a vyber (R19: nedostupné a bez zdroje řádků null).
 * Úkol 14b (kontrakt §9, 18. 11. 2026, úkol 4, bod 4): filtr segmentu, oboru nebo kraje se zadaným k_datu, který historie
 * nezná, udělá každou dostupnou metriku bloku castecne s důvodem (dimKDatu); nedostupné zůstanou nedostupné.
 */
function metrikaPrehledu(klic: string, x: KontextPrehledu | null, m: Partial<Metrika>, vyber: Record<string, unknown> = {}): Metrika {
  const def = KATALOG_MAPA.get(klic)!;
  const kvalita = m.kvalita ?? 'dostupne';
  const out: Metrika = {
    klic, verze: 1, nazev: def.nazev, hodnota: null, castky: [], citatel: null, jmenovatel: null, n: null, pokryti: null, kvalita, duvod: null, zaklad: def.zaklad,
    ...m,
    proklik: kvalita === 'nedostupne' || def.radky === null || x === null ? null : { zdroj: def.radky, filtr: { ...x.f, vyber: { metrika: klic, ...vyber } } },
  };
  return x ? sDalsimDuvodem(out, dimKDatu(x.f).duvod) : out;
}
const nedostupnaMetrika = (klic: string, x: KontextPrehledu | null, duvod: string): Metrika => metrikaPrehledu(klic, x, { kvalita: 'nedostupne', duvod });
/** Počet (n = hodnota); `castecne` = důvod částečnosti (zdroj začíná po začátku období …). */
function pocetMetrika(klic: string, x: KontextPrehledu | null, n: number, castecne: string | null = null, vyber: Record<string, unknown> = {}): Metrika {
  return metrikaPrehledu(klic, x, { hodnota: n, n, pokryti: pokryti(n, n), kvalita: castecne ? 'castecne' : 'dostupne', duvod: castecne }, vyber);
}
/**
 * Podíl (R8, 073 app_prehled_m_podil): na 6 míst s čitatelem, jmenovatelem a n; jmenovatel 0 = null s větou R8, která se připojí
 * i za důvod částečnosti (úkol 14c, ⚠ NAHRAZUJE „důvod částečnosti místo věty R8“: skupina prognózy s N = 0 má obě věty).
 */
function podilMetrika(klic: string, x: KontextPrehledu | null, c: number, j: number, n: number, p: PokrytiMetriky, castecne: string | null = null, vyber: Record<string, unknown> = {}): Metrika {
  return metrikaPrehledu(klic, x, {
    hodnota: j === 0 ? null : zaokr(c / j, 6), citatel: c, jmenovatel: j, n, pokryti: p, kvalita: castecne ? 'castecne' : 'dostupne',
    duvod: [castecne, j === 0 ? 'Jmenovatel je 0, podíl nejde spočítat.' : null].filter(Boolean).join(' ') || null,
  }, vyber);
}
/** „z 1 položky“, „ze 4 položek“: 2. pád podle celku (jednotné číslo u jedné). */
const JEDNA: Record<string, string> = { prodejů: 'prodeje', plateb: 'platby', faktur: 'faktury', položek: 'položky', 'prodaných klientů': 'prodaného klienta', výplat: 'výplaty',
  'prodejů po nabídce': 'prodeje po nabídce', nabídek: 'nabídky', otevřených: 'otevřeného' };
const zCelku = (celkem: number, co: string): string => `${ZE(celkem)} ${celkem} ${celkem === 1 ? JEDNA[co] ?? co : co}`;
/**
 * Peníze (R7, 073 app_prehled_m_penize): castky po měnách filtru, n = jednotky, pokrytí jednotek s přesnou částkou; když část
 * jednotek přesnou částku nemá, castecne s důvodem „U a z n <jednotek ve 2. pádě> <veta>“, k tomu `dalsi` (začátek zdroje,
 * ověření …). ⚠ Úkol 14c: slova a věta jako 073 (NAHRAZUJE jednu větu „… není přesná částka; součet je jen ze známých.“).
 */
function penizeMetrika(klic: string, x: KontextPrehledu, polozky: PolozkaPenez[], jednotne: string, mnozne: string, veta: string, dalsi: string | null = null,
  vyber: Record<string, unknown> = {}): Metrika {
  return metrikaPrehledu(klic, x, penizeZaklad(x, polozky, jednotne, mnozne, veta, dalsi), vyber);
}
/** Části peněžní metriky bez filtru k datu (ten přidá metrikaPrehledu jednou): částky, n, pokrytí, kvalita a důvod (073 m_penize). */
function penizeZaklad(x: KontextPrehledu, polozky: PolozkaPenez[], jednotne: string, mnozne: string, veta: string, dalsi: string | null = null): Partial<Metrika> {
  const zname = polozky.filter((p) => p.castka !== null).length;
  const nezname = polozky.length - zname;
  const duvod = [nezname > 0 ? `U ${zN(nezname, polozky.length, jednotne, mnozne)} ${veta}` : null, dalsi].filter(Boolean).join(' ') || null;
  return { castky: castkyZ(polozky, x.meny), n: polozky.length, pokryti: pokryti(zname, polozky.length), kvalita: duvod ? 'castecne' : 'dostupne', duvod };
}
/** Věty 073 opakované ve víc blocích (app_prehled_veta a šablony §3.10). */
const CENA_VETA = 'není přesná cena; součet je jen ze známých cen.';
const PROVIZE_VETA = 'není přesná cena; provize je jen ze známých cen.';
/** Šablona ZDROJ_OD (§3.10) pro zdroj registru a jeho začátek. */
const zdrojOdText = (z: ZdrojKlicPrehledu, od: string): string => `Zdroj „${ZDROJE_PREHLEDU.find((r) => r.zdroj === z)?.nazev ?? z}“ se eviduje od ${denCesky(od)}; dřívější data nejsou známá.`;
/** Šablona HISTORIE_OD (§3.10) = důvod nedostupnosti stavu k datu před začátkem historie (073 app_prehled_historie, v_hist_t). */
const historieText = (): string => `Historie změn stavů a cen začíná ${denCesky(PREHLED_HISTORIE_OD)}; dřívější průchody fázemi nejsou známé.`;
/** Trvání (medián nebo p90, R9 a R36): změřené jednotky v n, cenzurované v pokrytí jako neznámé. */
function trvaniMetrika(klic: string, x: KontextPrehledu, zmerene: number[], cenzurovano: number, p: number, mist: number, prazdno: string): Metrika {
  const v = percentil(zmerene, p);
  return metrikaPrehledu(klic, x, {
    hodnota: v === null ? null : zaokr(v, mist), n: zmerene.length, pokryti: pokryti(zmerene.length, zmerene.length + cenzurovano),
    kvalita: cenzurovano > 0 ? 'castecne' : 'dostupne',
    duvod: cenzurovano > 0 ? `${cenzurovano} ${ZE(zmerene.length + cenzurovano)} ${zmerene.length + cenzurovano} ještě nemá výsledek (cenzurované, v čísle nejsou).` : v === null ? prazdno : null,
  });
}

/**
 * Od kdy zdroj existuje a jeho poslední záznam (meta.zdroje, §2.5; 073 app_prehled_zdroje). ⚠ Úkol 14c: s `kMs` (k_datu) jen
 * záznamy do té chvíle (zrušení po k datu se nepočítá); kontakty a prodeje jsou stav kontaktu: od null (§9 úkol 3 bod 2;
 * NAHRAZUJE od prodejů = první prodej, které dělalo ZDROJ_OD prodejů, a záznamy po k datu v pohledu k datu).
 */
function rozsahZdroje(z: ZdrojKlicPrehledu, kMs = Infinity): { od: string | null; aktualni_k: string | null } {
  const doK = (c: string | null | undefined): c is string => !!c && Date.parse(c) <= kMs;
  const rozsah = (casy: (string | null | undefined)[]) => {
    const s = casy.filter(doK).sort();
    return { od: s[0] ?? null, aktualni_k: s.length ? s[s.length - 1] : null };
  };
  /** evidence se zrušením (073 greatest(max zapsáno, max zrušeno do k)): jen řádky zapsané do k */
  const evidence = (r: { zapsano: string; zruseno: string | null }[]) => {
    const zapsane = r.filter((x) => doK(x.zapsano));
    return { od: rozsah(zapsane.map((x) => x.zapsano)).od, aktualni_k: rozsah(zapsane.flatMap((x) => [x.zapsano, x.zruseno])).aktualni_k };
  };
  switch (z) {
    case 'hovory': return rozsah(callLog.map((l) => l.created_at));
    case 'dovolani': return rozsah([...oznaceniRadky.map((o) => o.zavolano_at), ...[...dovolaniUspesna.values()].flat()]);
    case 'kontakty': return { od: null, aktualni_k: rozsah(kontakty.map((c) => c.updated_at)).aktualni_k };
    case 'prodeje': return { od: null, aktualni_k: rozsah([...kontaktProdej.values()].map((p) => p.prodano_at)).aktualni_k };
    case 'navrhy': return rozsah(kontakty.map((c) => navrhAt(c)));
    case 'slevy': return rozsah([...slevy.values()].flat().map((e) => e.created_at));
    case 'faktury': return rozsah(PREHLED_FAKTURY.map((e) => e.at));
    case 'platby': return rozsah(PREHLED_PLATBY.map((e) => e.at));
    case 'historie': return rozsah([PREHLED_HISTORIE_OD, ...HISTORIE_STAVU.map((h) => h.at)]);
    case 'tymy': return rozsah([PREHLED_HISTORIE_OD]);
    case 'casovac': return rozsah(signalyPrace().map((p) => p.at));
    case 'gmail': {
      // úspěch do k_datu, jinak nejnovější zpráva uložená do té chvíle (073)
      const uspech = PREHLED_EMAIL_SYNC[0]?.posledni_uspech ?? null;
      if (!uspech) return { od: null, aktualni_k: null };
      return { od: Date.parse(GMAIL_OD) <= kMs ? GMAIL_OD : null, aktualni_k: doK(uspech) ? uspech : rozsah(PREHLED_ZPRAVY.map((m) => m.prijato_at)).aktualni_k };
    }
    case 'duvody': return rozsah([...odmitnutiRadky.map((r) => r.at), ...PREHLED_DUVODY_ZPETNE.map((r) => r.at)]);
    // zrušení je taky záznam: poslední = pozdější z posledního zápisu a posledního zrušení, začátek = první zápis (073
    // prehled_moznosti, greatest(max zapsáno, max zrušeno); recenze 14b, drobnost 2, ⚠ NAHRAZUJE jen zápisy)
    case 'naklady': return evidence(PREHLED_NAKLADY.map((n) => ({ zapsano: n.zapsano_at, zruseno: n.zruseno_at })));
    case 'cile': return evidence(PREHLED_CILE.map((c) => ({ zapsano: c.zadano_at, zruseno: c.zruseno_at })));
    case 'vyplaty': return evidence(PREHLED_VYPLATY.map((v) => ({ zapsano: v.zapsano_at, zruseno: v.zruseno_at })));
    case 'snimky': return { od: null, aktualni_k: null };
    case 'oznaceni': {
      const r = oznaceniRadky.filter((o) => doK(o.oznaceno_at));
      return { od: rozsah(r.map((o) => o.oznaceno_at)).od, aktualni_k: rozsah(r.flatMap((o) => [o.oznaceno_at, o.zavolano_at, o.uzavreno_at, o.posledni_pokus_at])).aktualni_k };
    }
    case 'zavolat': {
      const r = zavolatRadky.filter((x) => doK(x.created_at));
      return { od: rozsah(r.map((x) => x.created_at)).od, aktualni_k: rozsah(r.flatMap((x) => [x.created_at, x.zmeneno_at, x.uzavreno_at])).aktualni_k };
    }
    case 'rozvrh': return rozsah([...rozvrhy.values()].flatMap((r) => [r.nastaveno_at, r.zmeneno_at ?? null]));
    case 'jobs': return { od: rozsah(PREHLED_JOBY.map((j) => j.created_at)).od, aktualni_k: rozsah(PREHLED_JOBY.filter((j) => doK(j.created_at)).map((j) => j.updated_at)).aktualni_k };
    case 'tick': return rozsah([...callLog.map((l) => l.created_at).sort().slice(0, 1), PREHLED_TICK_AT]);
  }
}
const zdrojeMeta = (klice: ZdrojKlicPrehledu[], kMs = Infinity): PrehledMeta['zdroje'] =>
  ZDROJE_PREHLEDU.filter((z) => klice.includes(z.zdroj)).map((z) => ({ zdroj: z.zdroj, ...rozsahZdroje(z.zdroj, kMs) }));
/** Stav zdroje (prehled_moznosti, prehled_kvalita): chybi, zastarale (tick > 60 min, Gmail > 2 h), chyba, jinak ok. */
function stavZdroje(z: { zdroj: ZdrojKlicPrehledu; nazev: string }): ZdrojStav {
  const r = rozsahZdroje(z.zdroj);
  let stav: ZdrojStav['stav'] = r.aktualni_k ? 'ok' : 'chybi';
  let poznamka: string | null = r.aktualni_k ? null : 'Zatím žádná data.';
  const ted = Date.now();
  if (z.zdroj === 'tick' && r.aktualni_k && ted - Date.parse(r.aktualni_k) > 60 * 60000) { stav = 'zastarale'; poznamka = `Poslední běh ${casCesky(r.aktualni_k)}.`; }
  if (z.zdroj === 'gmail') {
    const s = PREHLED_EMAIL_SYNC[0];
    if (!s?.posledni_uspech) { stav = 'chybi'; poznamka = 'Zatím žádná úspěšná synchronizace.'; }
    else if (s.stav === 'chyba') { stav = 'chyba'; poznamka = s.chyba ?? 'Synchronizace hlásí chybu.'; }
    else if (ted - Date.parse(s.posledni_uspech) > 2 * HODINA_MS) { stav = 'zastarale'; poznamka = `Poslední úspěšná synchronizace ${denCesky(s.posledni_uspech)} ${casCesky(s.posledni_uspech)}.`; }
  }
  return { zdroj: z.zdroj, nazev: z.nazev, od: r.od, aktualni_k: r.aktualni_k, stav, poznamka };
}

type VarovaniPrehledu = PrehledMeta['varovani'][number];
/**
 * Varování (§2.11, texty §3.10); každý kód nejvýš jednou, ZDROJ_OD smí přijít za každý zdroj (obálka je spojí do jedné věty
 * za každý zdroj v pořadí registru, 073 app_prehled_obalka; úkol 14c, ⚠ NAHRAZUJE „jen zdroj s nejpozdějším začátkem“).
 */
function varovaniPrehledu(x: KontextPrehledu | null, o: { historie?: boolean | 'k_datu'; zdroje?: ZdrojKlicPrehledu[]; gmail?: boolean; provize?: boolean; odhad?: boolean; zakladJenKlienti?: boolean; nakladyOverit?: number; casovac?: boolean; bezDimenze?: boolean } = {}): VarovaniPrehledu[] {
  const v: VarovaniPrehledu[] = [];
  const dej = (kod: string, text: string) => { if (!v.some((w) => w.kod === kod && (kod !== 'ZDROJ_OD' || w.text === text))) v.push({ kod, text }); };
  // úkol 14b (kontrakt §9, 18. 11. 2026, úkol 4, bod 4): segment k datu před začátkem historie = HISTORIE_OD (bez toho jen u bloků
  // s historií); bezDimenze = blok, který filtr klientů stejně celý vrací nedostupný (řada nákladů a pracovní doby)
  // historie 'k_datu' = jen stav k datu před začátkem historie (073 app_prehled_historie), true i období před ní
  if (x && ((o.historie && ((o.historie === true && x.odMs < Date.parse(PREHLED_HISTORIE_OD)) || x.kMs < Date.parse(PREHLED_HISTORIE_OD))) || (!o.bezDimenze && dimKDatu(x.f).historie))) {
    dej('HISTORIE_OD', `Historie změn stavů a cen začíná ${denCesky(PREHLED_HISTORIE_OD)}; dřívější průchody fázemi nejsou známé.`);
  }
  // CASOVAC_OD jen když časovač má první signál (do k_datu) a období začíná před ním (073 app_prehled_varovani_zdroje; úkol 14c,
  // ⚠ NAHRAZUJE větu „Časovač práce zatím nemá žádný signál …“, která v registru varování není)
  if (x && o.casovac) {
    const prvni = rozsahZdroje('casovac', x.kZdroje).od;
    if (prvni && x.odMs < Date.parse(prvni)) dej('CASOVAC_OD', `Časovač práce běží od ${denCesky(prvni)}; dny před ním jsou odhad z výsledků hovorů, bez časovače.`);
  }
  if (x && o.zdroje) {
    for (const z of o.zdroje) {
      const od = rozsahZdroje(z, x.kZdroje).od;
      if (od && Date.parse(od) > x.odMs) dej('ZDROJ_OD', zdrojOdText(z, od));
    }
  }
  if (o.gmail) {
    const s = PREHLED_EMAIL_SYNC[0];
    if (!s?.posledni_uspech) dej('GMAIL_CHYBI', 'Zprávy z Gmailu se zatím nesynchronizují (žádná úspěšná synchronizace).');
    else if (Date.now() - Date.parse(s.posledni_uspech) > 2 * HODINA_MS) dej('GMAIL_ZASTARALE', `Poslední úspěšná synchronizace Gmailu byla ${denCesky(s.posledni_uspech)} ${casCesky(s.posledni_uspech)}.`);
  }
  if (Date.now() - Date.parse(PREHLED_TICK_AT) > 60 * 60000) dej('TICK_ZASTARALY', `Automatizace naposledy běžela ${denCesky(PREHLED_TICK_AT)} ${casCesky(PREHLED_TICK_AT)}; čísla mohou být starší.`);
  if (x?.f.mena === 'obe') dej('MENY_ODDELENE', 'Částky v CZK a EUR se nikdy nesčítají; každá měna je zvlášť.');
  if (x?.f.kraj) dej('KRAJ_JEN_OBORY', 'Kraj známe jen u firem oborů; chaty a architekti jsou v „Neznámý kraj“.');
  if (x && o.provize && x.f.atribuce !== 'posledni_zajem') {
    dej('PROVIZE_POSLEDNI_ZAJEM', 'Provize se počítá vždy podle posledního, kdo zapsal zájem (pravidlo výdělku), bez ohledu na zvolenou atribuci.');
  }
  if (x?.f.k_datu) dej('K_DATU_MINULOST', `Čísla jsou k ${denCesky(x.f.k_datu)} ${casCesky(x.f.k_datu)}; bloky bez historie (kdo psal naposledy, mlčení) jsou jen pro dnešek.`);
  // úkol 14c (§9 5a bod 17): počet řádků nákladů s overit, které se v období účtují a platí k datu (spočítá volající ze zaúčtování);
  // ⚠ NAHRAZUJE „všechny nezrušené řádky s overit“
  if (o.nakladyOverit) dej('NAKLADY_OVERIT', `Počet nákladů, jejichž částka čeká na ověření: ${o.nakladyOverit}.`);
  if (o.odhad) dej('ODHAD', 'Odhad do konce měsíce je nevalidovaný odhad z naší historie, ne závazek.');
  if (x && o.zakladJenKlienti && x.f.zaklad !== 'prirozeny') {
    dej('ZAKLAD_JEN_KLIENTI', `Základ „${ZAKLADY_VOLBY.find((z) => z.klic === x.f.zaklad)?.nazev ?? x.f.zaklad}“ mění jen tabulky klientů; karty a ostatní tabulky mají svůj přirozený základ.`);
  }
  return v;
}
/**
 * Varování obálky (073 app_prehled_obalka): každý kód nejvýš jednou v pořadí prvního výskytu; víc ZDROJ_OD = jedno varování na
 * místě prvního, jehož text je věta za každý zdroj (bez opakování) v pořadí registru zdrojů §3.8, spojené mezerou (§9 5b bod 1).
 */
function spojVarovani(v: VarovaniPrehledu[]): VarovaniPrehledu[] {
  const poradi = (t: string) => { const n = /„([^“]*)“/.exec(t)?.[1]; const i = ZDROJE_PREHLEDU.findIndex((z) => z.nazev === n); return i < 0 ? 1000 : i; };
  const zdroje = [...new Set(v.filter((w) => w.kod === 'ZDROJ_OD').map((w) => w.text))].sort((a, b) => poradi(a) - poradi(b) || (a < b ? -1 : a > b ? 1 : 0));
  const out: VarovaniPrehledu[] = [];
  for (const w of v) {
    if (out.some((u) => u.kod === w.kod)) continue;
    out.push(w.kod === 'ZDROJ_OD' ? { kod: 'ZDROJ_OD', text: zdroje.join(' ') } : w);
  }
  return out;
}
/** Obálka (§2.5): meta.zdroje k datu (úkol 14c), varování spojená jako 073. */
function obalkaPrehledu<T>(x: KontextPrehledu | null, data: T, zdroje: ZdrojKlicPrehledu[], varovani: VarovaniPrehledu[]): PrehledObalka<T> {
  const vygenerovano = x?.vygenerovano ?? now();
  return {
    api_verze: '1',
    definice_verze: definiceVerzePrehledu(),
    meta: { vygenerovano, k_datu: x?.f.k_datu ?? vygenerovano, casove_pasmo: 'Europe/Prague', filtr: x ? x.f : null, zdroje: zdrojeMeta(zdroje, x?.kZdroje ?? Infinity),
      varovani: spojVarovani(varovani) },
    data,
  };
}
/** Důvod částečnosti, když období začíná před začátkem zdroje (ZDROJ_OD; 073 věty zdrojů za sebou v pořadí volajícího). */
function zdrojPozdeji(x: KontextPrehledu, zdroje: ZdrojKlicPrehledu[]): string | null {
  const vety: string[] = [];
  for (const z of zdroje) {
    const od = rozsahZdroje(z, x.kZdroje).od;
    if (od && Date.parse(od) > x.odMs) vety.push(zdrojOdText(z, od));
  }
  return vety.join(' ') || null;
}
/** Stav k minulému okamžiku před začátkem historie (R11) neznáme. */
const stavNeznamy = (x: KontextPrehledu): boolean => !!x.f.k_datu && x.kMs < Date.parse(PREHLED_HISTORIE_OD);
/**
 * Filtr segmentu, oboru a kraje k zadanému k_datu (app_prehled_dim_k_datu; kontrakt §9, 18. 11. 2026, úkol 4, bod 4; úkol 14b):
 * segment k datu zná historie (v demu od PREHLED_HISTORIE_OD, segment se nemění); před jejím začátkem se bere dnešní a každá
 * metrika bloku je castecne s „Segment podle dnešního stavu: historie začíná …“ (varování HISTORIE_OD); obor a kraj se
 * nehistorizují, se zadaným k_datu vždy castecne s „Obor a kraj podle dnešního stavu (nejsou v historii).“; jinak null.
 */
function dimKDatu(f: PrehledFiltr): { duvod: string | null; historie: boolean } {
  if (!f.k_datu) return { duvod: null, historie: false };
  const segmentPred = !!f.segment && Date.parse(f.k_datu) < Date.parse(PREHLED_HISTORIE_OD);
  const duvod = [segmentPred ? `Segment podle dnešního stavu: historie začíná ${denCesky(PREHLED_HISTORIE_OD)}.` : null,
    f.obor || f.kraj ? 'Obor a kraj podle dnešního stavu (nejsou v historii).' : null].filter(Boolean).join(' ');
  return { duvod: duvod || null, historie: segmentPred };
}
/** app_prehled_castecne: dostupné → castecne s dalším důvodem, částečné s doplněným důvodem; nedostupné (a bez důvodu) beze změny. */
function sDalsimDuvodem<T extends { kvalita: Metrika['kvalita']; duvod: string | null }>(o: T, duvod: string | null): T {
  if (!duvod || (o.kvalita !== 'dostupne' && o.kvalita !== 'castecne')) return o;
  return { ...o, kvalita: 'castecne', duvod: [o.duvod, duvod].filter(Boolean).join(' ') };
}
/** Neuchovávaná měřená pole se zadaným k_datu (R11; kontrakt §9, 18. 11. 2026, úkol 4, bod 5): věty databáze 073. */
const SLA_JEN_DNES = 'Komu označení patří, se nezaznamenává; doba do zavolání je jen pro dnešek.';
const PO_TERMINU_JEN_DNES = 'Termín naplánovaného hovoru se nezaznamenává; hovory po termínu jsou jen pro dnešek.';
const ODPOVED_JEN_DNES = 'Poslední odpověď klienta se nezaznamenává; odpovědi po návrhu jsou jen pro dnešek.';
/** Výplaty mají člověka, ne klienta (kontrakt §9, 18. 11. 2026, úkol 4, bod 17): s filtrem segmentu, oboru nebo kraje nedostupné. */
const VYPLATY_BEZ_KLIENTU = 'Výplaty provizí nejsou rozdělené podle klientů; zrušte filtr.';
const filtrKlientu = (f: PrehledFiltr): boolean => !!(f.segment || f.obor || f.kraj);
/** Zdroj Hovory bez jediného řádku (stav chybi): čísla z hovorů nedostupná, nikdy ověřená 0 (073 v_hk). */
const HOVORY_CHYBI = 'Zdroj „Hovory“ zatím nemá žádná data.';
/**
 * Řádek evidence (náklad, cíl, výplata) platný k okamžiku kMs: zapsaný nejpozději v něm a nezrušený do něj (zrušení až po
 * něm se v pohledu k datu ještě nepočítá; 073 app_prehled_naklady, app_prehled_cile, app_prehled_vyplaty; recenze 14b, drobnost 2).
 */
function platiKDatu(zapsano: string, zruseno: string | null, kMs: number): boolean {
  return Date.parse(zapsano) <= kMs && (!zruseno || Date.parse(zruseno) > kMs);
}
/**
 * Povinné kategorie evidence (claude, lovable, domena, hosting) bez řádku platného k okamžiku: kategorie, náklady celkem a řada
 * nákladů jsou castecne; volitelná Jiné neúplnost nikdy nedělá (kontrakt §9, 18. 11. 2026, úkol 4, bod 13). Věty doslova jako
 * 073 v 7553864d: řada nákladů (prehled_rada) „Bez zadaného nákladu: …“ (bezNakladuText), Finance (prehled_finance) u každé
 * prázdné kategorie „Pro kategorii „…“ není zadaný žádný náklad.“ (prazdnaKategorieText; recenze 14b, drobnost 8, ⚠ NAHRAZUJE
 * „Bez zadaného nákladu: …“ i ve Financích).
 */
function kategorieBezNakladu(kMs: number): { klic: KategorieVyuctovani; nazev: string }[] {
  return KATEGORIE_VYUCTOVANI.filter((k) => k.klic !== 'provize' && k.klic !== 'jine'
    && !PREHLED_NAKLADY.some((n) => n.kategorie === k.klic && platiKDatu(n.zapsano_at, n.zruseno_at, kMs)));
}
const bezNakladuText = (kat: { nazev: string }[]): string | null => (kat.length > 0 ? `Bez zadaného nákladu: ${kat.map((k) => k.nazev).join(', ')}.` : null);
const prazdnaKategorieText = (k: { nazev: string }): string => `Pro kategorii „${k.nazev}“ není zadaný žádný náklad.`;
/** Čekání a mlčení se zadaným k_datu (073 app_prehled_veta cekani_jen_dnes; úkol 14c, ⚠ NAHRAZUJE „Tohle číslo je jen pro dnešek …“). */
const JEN_DNES = 'Kdo psal naposledy, se nezaznamenává; čekání a mlčení jsou jen pro dnešek.';

/* --- jednotky (společné pro karty, tabulky i řádky prehled_radky) --- */

interface JednotkaProdeje { c: Kontakt; at: string; cena: CenaKontaktu; osoba: number | null; provizeKomu: number | null; provize: { castka: number | null; mena: MenaPrehledu | null } }
/** Provize z ceny (pravidlo výdělku, 30 %): CZK na koruny, EUR na centy; neznámá cena = neznámá provize. */
function provizeZ(cena: CenaKontaktu): { castka: number | null; mena: MenaPrehledu | null } {
  if (cena.castka === null) return { castka: null, mena: cena.mena };
  return { castka: cena.mena === 'EUR' ? Math.round(cena.castka * PROVIZE_PROCENT) / 100 : Math.round((cena.castka * PROVIZE_PROCENT) / 100), mena: cena.mena };
}
/** Prodeje (R16) s datem v [odMs, doMs) a do k_datu, kontakt podle filtru, člověk podle atribuce (lide). */
function prodejeV(x: KontextPrehledu, odMs = x.odMs, doMs = x.doMs, atribuce: AtribucePrehledu = x.f.atribuce): JednotkaProdeje[] {
  return kontakty
    .filter((c) => PRODANO_STAVY.includes(c.status) && x.sedi(c))
    .map((c) => ({ c, at: datumProdeje(c) }))
    .filter(({ at }) => { const t = Date.parse(at); return t >= odMs && t < doMs && t <= x.kMs; })
    .map(({ c, at }) => {
      const cena = cenaKontaktu(c, at);
      return { c, at, cena, osoba: pripsanyClovek(c, atribuce, x.kMs), provizeKomu: pripsanyClovek(c, 'posledni_zajem', x.kMs), provize: provizeZ(cena) };
    })
    .filter((p) => x.lidi(p.osoba));
}
/** kontakt_prodej, jehož klient už není v prodaném stavu (R16: v pocet_prodeju není). */
function prodejeMimoProdej(x: KontextPrehledu): JednotkaProdeje[] {
  return [...kontaktProdej.entries()]
    .map(([kid, p]) => ({ c: kontaktPodleId(kid), at: p.prodano_at }))
    .filter((r): r is { c: Kontakt; at: string } => !!r.c && !PRODANO_STAVY.includes(r.c.status) && x.vObdobi(r.at) && x.sedi(r.c))
    .map(({ c, at }) => { const cena = cenaKontaktu(c, at); return { c, at, cena, osoba: x.osoba(c), provizeKomu: pripsanyClovek(c, 'posledni_zajem', x.kMs), provize: provizeZ(cena) }; })
    .filter((p) => x.lidi(p.osoba));
}
interface FakturaRozbor { cislo: string | null; web: number | null; hosting: number | null; celkem: number | null; mena: MenaPrehledu | null }
/** app_faktura_rozbor: „faktura 20260059 (7000 Kc web + 1000 Kc hosting = 8000 Kc)“; nevýslovné části null. */
function fakturaRozbor(detail: string): FakturaRozbor {
  const t = bezDiakritiky(detail.toLowerCase());
  const cast = (re: RegExp) => { const m = re.exec(t); return m ? { n: Number(m[1].replace(/\s/g, '')), mena: (m[2] === 'eur' ? 'EUR' : 'CZK') as MenaPrehledu } : null; };
  const web = cast(/(\d[\d ]*)\s*(kc|eur)\s*web/);
  const hosting = cast(/(\d[\d ]*)\s*(kc|eur)\s*hosting/);
  const celkem = cast(/=\s*(\d[\d ]*)\s*(kc|eur)/);
  return { cislo: /faktura\s+(\d+)/.exec(t)?.[1] ?? null, web: web?.n ?? null, hosting: hosting?.n ?? null, celkem: celkem?.n ?? null, mena: celkem?.mena ?? web?.mena ?? null };
}
interface JednotkaPlatby { id: number | null; c: Kontakt; at: string; castka: number | null; mena: MenaPrehledu | null; zdroj_castky: RadekPlatby['zdroj_castky']; odvozeno: boolean; faktury: string[] }
/** Platby (R18) do k_datu: události platba_prijata a odvozené ze stavu zaplaceno bez události. */
function platbyDoKDatu(x: KontextPrehledu): JednotkaPlatby[] {
  const out: JednotkaPlatby[] = [];
  for (const p of PREHLED_PLATBY) {
    const c = kontaktPodleId(p.kontakt_id);
    if (!c || !x.doKDatu(p.at)) continue;
    const jmenovane = PREHLED_FAKTURY.filter((f) => f.kontakt_id === c.id && f.at <= p.at).map((f) => ({ f, r: fakturaRozbor(f.detail) })).filter(({ r }) => r.cislo && p.detail.includes(r.cislo));
    if (jmenovane.length > 0 && jmenovane.every(({ r }) => r.celkem !== null && r.mena === jmenovane[0].r.mena)) {
      out.push({ id: p.id, c, at: p.at, castka: jmenovane.reduce((a, { r }) => a + (r.celkem ?? 0), 0), mena: jmenovane[0].r.mena, zdroj_castky: 'faktura', odvozeno: false, faktury: jmenovane.map(({ r }) => r.cislo!) });
    } else {
      const cena = PRODANO_STAVY.includes(c.status) ? cenaKontaktu(c, datumProdeje(c)) : null;
      out.push({ id: p.id, c, at: p.at, castka: cena?.castka ?? null, mena: cena?.mena ?? null, zdroj_castky: cena?.castka !== null && cena ? 'cena_prodeje' : 'neznama', odvozeno: false, faktury: [] });
    }
  }
  for (const c of kontakty) {
    if (c.status !== 'zaplaceno' || PREHLED_PLATBY.some((p) => p.kontakt_id === c.id)) continue;
    const at = c.status_changed_at;
    if (!at || !x.doKDatu(at)) continue;
    const cena = cenaKontaktu(c, datumProdeje(c));
    out.push({ id: null, c, at, castka: cena.castka, mena: cena.mena, zdroj_castky: cena.castka === null ? 'neznama' : 'cena_prodeje', odvozeno: true, faktury: [] });
  }
  return out;
}
const platbyV = (x: KontextPrehledu): JednotkaPlatby[] => platbyDoKDatu(x).filter((p) => x.vObdobi(p.at) && x.sedi(p.c) && x.lidi(x.osoba(p.c)));
interface JednotkaFaktury { e: UdalostPrehledu; c: Kontakt; r: FakturaRozbor; zaplacenoAt: string | null }
/** Faktury do k_datu a čím jsou zaplacené (§2.9: platba jmenuje číslo, nebo platba bez čísla po faktuře, nebo odvozená po ní). */
function fakturyDoKDatu(x: KontextPrehledu): JednotkaFaktury[] {
  const platby = platbyDoKDatu(x);
  return PREHLED_FAKTURY.filter((e) => x.doKDatu(e.at)).flatMap((e) => {
    const c = kontaktPodleId(e.kontakt_id);
    if (!c) return [];
    const r = fakturaRozbor(e.detail);
    const p = platby.filter((pl) => pl.c.id === c.id && pl.at >= e.at && (pl.faktury.includes(r.cislo ?? '-') || pl.faktury.length === 0))
      .sort((a, b) => a.at.localeCompare(b.at))[0];
    return [{ e, c, r, zaplacenoAt: p?.at ?? null }];
  });
}
const fakturyV = (x: KontextPrehledu): JednotkaFaktury[] => fakturyDoKDatu(x).filter((f) => x.vObdobi(f.e.at) && x.sedi(f.c) && x.lidi(x.osoba(f.c)));
const pohledavkyKDatu = (x: KontextPrehledu): JednotkaFaktury[] => fakturyDoKDatu(x).filter((f) => !f.zaplacenoAt && x.sedi(f.c) && x.lidi(x.osoba(f.c)));
const dniOd = (iso: string, kMs: number): number => Math.round((zacatekDnePraha(denPraha(new Date(kMs))) - zacatekDnePraha(denPraha(new Date(iso)))) / 86400000);

interface JednotkaOtevrena { c: Kontakt; cena: CenaKontaktu; osoba: number | null }
/** Otevření klienti k datu (skupina otevrene; demo bere dnešní stav). */
function otevreneKDatu(x: KontextPrehledu): JednotkaOtevrena[] {
  return kontakty.filter((c) => OTEVRENE_STAVY.includes(c.status) && x.sedi(c)).map((c) => ({ c, cena: cenaKontaktu(c, x.kIso), osoba: x.osoba(c) })).filter((u) => x.lidi(u.osoba));
}
/** Kdy klient po návrhu odmítl (R17): ruční změna stavu, jinak status_changed_at, dokud je odmitnuto. */
const ztrataAt = (c: Kontakt): string | null => (c.status !== 'odmitnuto' ? null : PREHLED_ZTRATY.get(c.id) ?? c.status_changed_at ?? null);
interface JednotkaUzavreni { c: Kontakt; vyhra: boolean; at: string }
/** Uzavření po návrhu v období (§2.9): vyhrané = prodej v období, ztracené = odmítnuto po návrhu v období. */
function uzavreneV(x: KontextPrehledu): JednotkaUzavreni[] {
  const out: JednotkaUzavreni[] = [];
  for (const c of kontakty) {
    const navrh = navrhAt(c);
    if (!navrh || !x.doKDatu(navrh) || !x.sedi(c) || !x.lidi(x.osoba(c))) continue;
    if (PRODANO_STAVY.includes(c.status) && x.vObdobi(datumProdeje(c))) out.push({ c, vyhra: true, at: datumProdeje(c) });
    const z = ztrataAt(c);
    if (z && z > navrh && x.vObdobi(z)) out.push({ c, vyhra: false, at: z });
  }
  return out;
}
const hovoryV = (x: KontextPrehledu): CallLogRow[] =>
  callLog.filter((l) => x.vObdobi(l.created_at) && x.sedi(kontaktPodleId(l.kontakt_id)) && x.lidi(l.user_id));

/** Zdroj signálu textem 073 (§9 5b bod 3; úkol 14c, ⚠ NAHRAZUJE technické názvy tabulek). */
const ZDROJ_SIGNALU: Record<SignalKod, string> = {
  klient_ceka: 'Gmail (automatizace)', navrh_mlci: 'Poslední zpráva klientovi (automatizace)', hovor_po_terminu: 'Naplánované hovory',
  faktura_nepotvrzena: 'Faktury a potvrzené platby', schvaleno_bez_faktury: 'Prodeje a faktury', sleva_konci: 'Nabídky za polovinu', otazka: 'Otázky automatizace',
};
/** Akční seznam (§5.13): jeden případ na klienta, jen pro teď (k_datu null); všechny případy (stavitel vezme prvních 50). */
function pripadyAkce(x: KontextPrehledu): PripadAkce[] {
  if (x.f.k_datu) return [];
  const ted = Date.now();
  const sig = (kod: SignalKod, od: string, termin: string, zdroj: string): SignalAkce => ({ kod, text: SIGNALY_AKCI.find((s) => s.kod === kod)!.nazev, od, termin, zdroj });
  const faktury = fakturyDoKDatu(x);
  const fakturyOd = rozsahZdroje('faktury').od;
  const out: PripadAkce[] = [];
  for (const c of kontakty) {
    if (!x.sedi(c)) continue;
    const osoba = x.osoba(c);
    if (!x.lidi(osoba)) continue;
    const s: SignalAkce[] = [];
    const sk = skupinaStavu(c.status);
    const klient = casMs(c.last_client_reply_at);
    const nase = casMs(c.last_our_reply_at);
    if (klient !== null && (nase === null || klient > nase) && ted - klient > 24 * HODINA_MS && sk !== 'ztraceno' && sk !== 'vyrazeno') {
      s.push(sig('klient_ceka', c.last_client_reply_at!, new Date(klient + 24 * HODINA_MS).toISOString(), ZDROJ_SIGNALU.klient_ceka));
    }
    const ceka = zavolatRadky.filter((z) => z.kontakt_id === c.id && z.stav === 'ceka');
    if ((c.status === 'navrh_odeslan' || c.status === 'ceka_na_klienta') && (mlciPd(c) ?? 0) >= 5 && ceka.length === 0 && c.last_our_reply_at) {
      s.push(sig('navrh_mlci', c.last_our_reply_at, prahaNaIso(pracovniDenPo(denPraha(new Date(c.last_our_reply_at)), 5), '00:00') ?? c.last_our_reply_at, ZDROJ_SIGNALU.navrh_mlci));
    }
    // jeden signál na kontakt: nejdřívější termín čekajícího hovoru, nejstarší nezaplacená faktura (073 distinct on kontakt_id)
    const poTerminu = ceka.filter((z) => Date.parse(z.kdy) < ted).sort((a, b) => a.kdy.localeCompare(b.kdy) || a.id - b.id)[0];
    if (poTerminu) s.push(sig('hovor_po_terminu', poTerminu.created_at, poTerminu.kdy, ZDROJ_SIGNALU.hovor_po_terminu));
    const fak = faktury.filter((f) => f.c.id === c.id && !f.zaplacenoAt && ted - Date.parse(f.e.at) > 14 * 86400000).sort((a, b) => a.e.at.localeCompare(b.e.at))[0];
    if (fak) s.push(sig('faktura_nepotvrzena', fak.e.at, new Date(Date.parse(fak.e.at) + 14 * 86400000).toISOString(), ZDROJ_SIGNALU.faktura_nepotvrzena));
    if (PRODANO_STAVY.includes(c.status)) {
      const prodano = Date.parse(datumProdeje(c));
      // jen prodeje od začátku zdroje faktur (prodej z doby před evidencí faktur se nikdy neoznačí; §9 5b bod 3)
      if (ted - prodano > 3 * 86400000 && fakturyOd !== null && prodano >= Date.parse(fakturyOd) && !faktury.some((f) => f.c.id === c.id)) {
        s.push(sig('schvaleno_bez_faktury', datumProdeje(c), new Date(prodano + 3 * 86400000).toISOString(), ZDROJ_SIGNALU.schvaleno_bez_faktury));
      }
    }
    if (c.status === 'sleva_nabidnuta') {
      const posledni = (slevy.get(c.id) ?? []).map((e) => e.created_at).sort().pop();
      const konec = posledni ? Date.parse(posledni) + SLEVA_PLATI_DNI * 86400000 : null;
      if (posledni && konec !== null && konec >= ted && konec - ted <= 2 * 86400000) s.push(sig('sleva_konci', posledni, new Date(konec).toISOString(), ZDROJ_SIGNALU.sleva_konci));
    }
    const otazka = messages.filter((m) => m.kontakt_id === c.id && m.status === 'open').map((m) => m.created_at).sort().pop();
    if (otazka) s.push(sig('otazka', otazka, otazka, ZDROJ_SIGNALU.otazka));
    if (s.length === 0) continue;
    // podle termínu, pak pořadí registru (073 order by termin, poradi)
    const poradi = (k: SignalKod) => SIGNALY_AKCI.findIndex((g) => g.kod === k);
    s.sort((a, b) => a.termin.localeCompare(b.termin) || poradi(a.kod) - poradi(b.kod));
    const prvni = s[0];
    const cena = cenaKontaktu(c, x.kIso);
    out.push({
      kontakt_id: c.id, jmeno: jmenoKontaktu(c), segment: segmentOf(c), status: c.status, nazev_stavu: nazevStavu(c.status), vlastnik: osobaPrehledu(osoba),
      problem: prvni.text, dalsi_krok: SIGNALY_AKCI.find((k) => k.kod === prvni.kod)!.dalsi_krok, termin: prvni.termin, po_terminu: Date.parse(prvni.termin) < x.kMs,
      hodnota: cena.castka !== null && cena.mena ? [{ mena: cena.mena, hodnota: castkaText(cena.castka) }] : [], cena_stav: cena.rozbor.stav, signaly: s, signal_zdroj: prvni.zdroj,
    });
  }
  return out.sort((a, b) => a.termin.localeCompare(b.termin) || a.kontakt_id - b.kontakt_id);
}

/* --- náklady a provize (§2.12, D6, D10) --- */
interface Zauctovani { radek_id: string; naklad_id: number | null; kategorie: KategorieVyuctovani; popis: string | null; datum: string; castka: number | null; mena: MenaPrehledu | null; stav_ceny: CenaStav; opakovani: MockNaklad['opakovani'] | null; kontakt_id: number | null; overit: boolean; user_id: number | null }
/** Zaúčtování nákladu do dnů [odDen, doDen] (§2.12): měsíčně v každém dotčeném měsíci, ročně 1/12, jednorázově v den plati_od. */
function zauctovaniNakladu(n: MockNaklad, odDen: string, doDen: string, kMs: number): Zauctovani[] {
  if (!platiKDatu(n.zapsano_at, n.zruseno_at, kMs)) return [];
  const radek = (datum: string, castka: number): Zauctovani => ({ radek_id: `n:${n.id}:${datum}`, naklad_id: n.id, kategorie: n.kategorie, popis: n.popis, datum, castka, mena: n.mena,
    stav_ceny: 'presne', opakovani: n.opakovani, kontakt_id: n.kontakt_id, overit: n.overit, user_id: null });
  if (n.opakovani === 'jednorazove') return n.plati_od >= odDen && n.plati_od <= doDen ? [radek(n.plati_od, n.castka)] : [];
  const out: Zauctovani[] = [];
  for (let m = `${odDen.slice(0, 7)}-01`; m <= doDen; m = `${posunDen(`${m.slice(0, 7)}-28`, 4).slice(0, 7)}-01`) {
    const d = m > n.plati_od ? m : n.plati_od;
    if (d.slice(0, 7) !== m.slice(0, 7) || d < n.plati_od || (n.plati_do && d > n.plati_do) || d < odDen || d > doDen) continue;
    out.push(radek(d, n.opakovani === 'rocne' ? Math.round((n.castka / 12) * 100) / 100 : n.castka));
  }
  return out;
}
/** Náklady období po kategoriích včetně provize (= provize_narok období, zaúčtovaná v den prodeje). */
function nakladyV(x: KontextPrehledu): Zauctovani[] {
  const provize: Zauctovani[] = prodejeV(x, x.odMs, x.doMs, 'posledni_zajem').map((p) => ({
    radek_id: `c:${p.c.id}`, naklad_id: null, kategorie: 'provize', popis: `Provize 30 % z ceny webu (${jmenoKontaktu(p.c)})`, datum: denPraha(new Date(p.at)),
    castka: p.provize.castka, mena: p.provize.mena, stav_ceny: p.cena.rozbor.stav, opakovani: null, kontakt_id: p.c.id, overit: false, user_id: p.provizeKomu,
  }));
  return [...PREHLED_NAKLADY.flatMap((n) => zauctovaniNakladu(n, x.f.od, x.f.do, x.kMs)), ...provize];
}
const NAKLADY_BEZ_FILTRU = 'Náklady z evidence nejsou rozdělené podle lidí ani klientů; zrušte filtr.';
const nakladyFiltrovane = (x: KontextPrehledu): boolean => !!(x.f.lide || x.f.segment || x.f.obor || x.f.kraj);
interface JednotkaProvize { radek_id: string; druh: 'narok' | 'vyplata'; datum: string; at: string; user_id: number | null; kontakt_id: number | null; castka: number | null; mena: MenaPrehledu | null; stav_ceny: CenaStav; vyplata_id: number | null; poznamka: string | null; jmeno: string | null }
/**
 * Nárok z prodejů [odMs, doMs) (vždy posledni_zajem, D10) a výplaty s datem [odDen, doDen]; lide = příjemce. ⚠ Úkol 14c (073
 * prehled_radky provize, kontrakt §7 RadekProvize z 5b): nárok prodeje, u kterého nikdo nezapsal zájem, má user_id null a bez
 * filtru lidí se počítá (NAHRAZUJE vynechání takového prodeje).
 */
function provizeJednotky(x: KontextPrehledu, odMs: number, odDen: string): JednotkaProvize[] {
  const narok: JednotkaProvize[] = prodejeV(x, odMs, x.doMs, 'posledni_zajem').map((p) => ({
    radek_id: `n:${p.c.id}`, druh: 'narok', datum: denPraha(new Date(p.at)), at: p.at, user_id: p.provizeKomu, kontakt_id: p.c.id, castka: p.provize.castka, mena: p.provize.mena,
    stav_ceny: p.cena.rozbor.stav, vyplata_id: null, poznamka: null, jmeno: jmenoKontaktu(p.c),
  }));
  const vyplaty: JednotkaProvize[] = PREHLED_VYPLATY.filter((v) => platiKDatu(v.zapsano_at, v.zruseno_at, x.kMs) && v.vyplaceno_dne >= odDen && v.vyplaceno_dne <= x.f.do && x.lidi(v.user_id))
    .map((v) => ({ radek_id: `v:${v.id}`, druh: 'vyplata', datum: v.vyplaceno_dne, at: new Date(zacatekDnePraha(v.vyplaceno_dne)).toISOString(), user_id: v.user_id, kontakt_id: null,
      castka: v.castka, mena: v.mena, stav_ceny: 'presne', vyplata_id: v.id, poznamka: v.poznamka, jmeno: null }));
  return [...narok, ...vyplaty];
}
/** Zbývá vyplatit po měnách: nárok − výplaty jako jedny peníze (073: výplata záporná položka; R7 po měnách). */
function zbyvaCastky(jednotky: JednotkaProvize[], mn: MenaPrehledu[]): CastkaMeny[] {
  return castkyZ(jednotky.map((j) => ({ castka: j.castka === null ? null : j.druh === 'vyplata' ? -j.castka : j.castka, mena: j.mena, stav: j.stav_ceny })), mn);
}

/* --- funkce --- */

/** prehled_moznosti (§5.1). */
function prehledMoznostiMock(me: MockUser): PrehledObalka<DataMoznosti> {
  if (me.role !== 'super_admin') fail(PREHLED_JEN_SUPER);
  const albert = me.id === OWNER_ID;
  const tymOf = (u: MockUser) => (u.role === 'super_admin' ? u.id : u.manager_id);
  const vlastni = (u: MockUser) => albert || u.id === me.id || u.manager_id === me.id;
  const lide: OsobaMoznosti[] = [...users].sort((a, b) => {
    const ta = tymOf(a);
    const tb = tymOf(b);
    if (ta !== tb) return ta === null ? 1 : tb === null ? -1 : ta - tb;
    if ((a.role === 'super_admin') !== (b.role === 'super_admin')) return a.role === 'super_admin' ? -1 : 1;
    return a.display_name.localeCompare(b.display_name, 'cs') || a.id - b.id;
  }).map((u) => ({
    id: u.id, display_name: u.display_name, role: u.role, active: u.active, manager_id: u.manager_id,
    manager_name: users.find((x) => x.id === u.manager_id)?.display_name ?? null, tym_id: tymOf(u), smim_cil: vlastni(u), smim_vyplatu: vlastni(u),
  }));
  const tymy: TymPrehledu[] = users.filter((u) => u.role === 'super_admin').sort((a, b) => a.id - b.id).map((v) => {
    const clenove = [v, ...users.filter((u) => u.manager_id === v.id && u.id !== v.id)];
    return { id: v.id, nazev: `Tým ${v.display_name}`, vedouci_id: v.id, vedouci_jmeno: v.display_name, clenove: clenove.map((u) => u.id).sort((a, b) => a - b),
      clenove_aktivni: clenove.filter((u) => u.active).map((u) => u.id).sort((a, b) => a - b), smim_cil: albert || v.id === me.id };
  });
  const pocet = (klic: string) => kontakty.filter((c) => segmentOf(c) === klic).length;
  const segmenty: DataMoznosti['segmenty'] = [
    { klic: 'chata', nazev: 'Chaty', rodina: 'chata', stav: null, kontaktu: pocet('chata') },
    { klic: 'architekt', nazev: 'Architekti', rodina: 'architekt', stav: null, kontaktu: pocet('architekt') },
    ...[...oborNikyMock].sort((a, b) => (a.poradi ?? 99) - (b.poradi ?? 99)).map((n) => ({ klic: n.klic, nazev: n.nazev, rodina: 'obor' as const, stav: n.stav, kontaktu: pocet(n.klic) })),
  ];
  const specializace = new Map<string, { klic: string; segment: string; nazev: string; kontaktu: number }>();
  for (const c of kontakty) {
    const m = /^([^:]+):\s*(.*)$/.exec(c.obor ?? '');
    if (!m) continue;
    for (const s of m[2].split(',').map((x) => x.trim()).filter(Boolean)) {
      const klic = `${m[1].trim()}: ${s}`;
      const r = specializace.get(klic) ?? { klic, segment: m[1].trim(), nazev: s, kontaktu: 0 };
      r.kontaktu += 1;
      specializace.set(klic, r);
    }
  }
  const prvniHovor = callLog.map((l) => l.created_at).sort()[0];
  const metriky = KATALOG_PREHLEDU.map((m) => {
    const stavy = m.zdroje.map((z) => stavZdroje(ZDROJE_PREHLEDU.find((r) => r.zdroj === z)!));
    const nutny = stavy[0];
    const pozde = stavy.find((s) => s.od && prvniHovor && Date.parse(s.od) - Date.parse(prvniHovor) > 86400000);
    if (nutny.stav === 'chybi') return { klic: m.klic, nazev: m.nazev, jednotka: m.jednotka, kvalita: 'nedostupne' as const, duvod: `Zdroj „${nutny.nazev}“ zatím nemá žádná data.` };
    const vada = stavy.find((s) => s.stav !== 'ok');
    if (vada || pozde) {
      return { klic: m.klic, nazev: m.nazev, jednotka: m.jednotka, kvalita: 'castecne' as const,
        duvod: vada ? `Zdroj „${vada.nazev}“: ${vada.poznamka ?? vada.stav}` : `Zdroj „${pozde!.nazev}“ se eviduje od ${denCesky(pozde!.od!)}.` };
    }
    return { klic: m.klic, nazev: m.nazev, jednotka: m.jednotka, kvalita: 'dostupne' as const, duvod: null };
  });
  const data: DataMoznosti = {
    ja: { user_id: me.id, display_name: me.display_name, je_albert: albert },
    lide,
    tymy,
    firma_smim_cil: albert,
    segmenty,
    obory: [...specializace.values()].sort((a, b) => a.segment.localeCompare(b.segment) || b.kontaktu - a.kontaktu || a.nazev.localeCompare(b.nazev)),
    kraje: [{ klic: 'neznamy', nazev: 'Neznámý kraj', kontaktu: kontakty.length }],
    meny: ['CZK', 'EUR'],
    atribuce: ATRIBUCE_VOLBY,
    zaklady: ZAKLADY_VOLBY,
    metriky,
    zdroje: ZDROJE_PREHLEDU.map(stavZdroje),
    cerstvost: {
      tick_at: PREHLED_TICK_AT,
      posta_klienta_at: kontakty.map((c) => c.last_client_reply_at).filter((v): v is string => !!v).sort().pop() ?? null,
      gmail: PREHLED_EMAIL_SYNC.map((s) => ({ ...s })),
      snimek_den: null,
      snimek_at: null,
    },
  };
  return obalkaPrehledu(null, data, ZDROJE_PREHLEDU.map((z) => z.zdroj), varovaniPrehledu(null, { gmail: true }));
}

/** Cíl podle §2.10 (R21): rozsah lidí přesně, období cíle obsahuje období filtru, nejkratší a nejnovější vyhrává. */
function cilProFiltr(x: KontextPrehledu, metrika: CilPrehledu['metrika']): { cil: MockCil | null; duvod: string | null } {
  const vMene = METRIKY_CILU.find((m) => m.klic === metrika)?.v_mene ?? false;
  if (vMene && x.f.mena === 'obe') return { cil: null, duvod: 'Plnění cíle se počítá jen pro jednu měnu; vyberte CZK nebo EUR.' };
  if (x.f.segment || x.f.obor || x.f.kraj) return { cil: null, duvod: 'Cíle nejsou rozdělené podle segmentu, oboru ani kraje; zrušte tyto filtry.' };
  const stejne = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
  const rozsahSedi = (c: MockCil) => {
    if (c.user_id === null && c.tym_id === null) return x.f.lide === null;
    if (c.user_id !== null) return !!x.f.lide && stejne(x.f.lide, [c.user_id]);
    const clenove = [c.tym_id!, ...users.filter((u) => u.manager_id === c.tym_id && u.id !== c.tym_id).map((u) => u.id)].sort((a, b) => a - b);
    const aktivni = clenove.filter((id) => users.find((u) => u.id === id)?.active);
    return !!x.f.lide && (stejne(x.f.lide, clenove) || stejne(x.f.lide, aktivni));
  };
  const kandidati = PREHLED_CILE.filter((c) => platiKDatu(c.zadano_at, c.zruseno_at, x.kMs) && c.metrika === metrika && rozsahSedi(c)
    && (!vMene || c.mena === x.f.mena) && c.obdobi_od <= x.f.od && c.obdobi_do >= x.f.do)
    .sort((a, b) => (zacatekDnePraha(a.obdobi_do) - zacatekDnePraha(a.obdobi_od)) - (zacatekDnePraha(b.obdobi_do) - zacatekDnePraha(b.obdobi_od))
      || b.zadano_at.localeCompare(a.zadano_at) || b.id - a.id);
  return kandidati[0] ? { cil: kandidati[0], duvod: null } : { cil: null, duvod: 'Pro toto období a výběr lidí není zadaný cíl.' };
}
/** Cíl pro API (§7 Cil): obdobi_do včetně, smi_upravit podle D9 (smiCil, jedno pravidlo se zápisem; úkol 14b). */
function cilVen(me: MockUser, c: MockCil): CilPrehledu {
  const smi = smiCil(me, c.user_id, c.tym_id);
  return {
    id: c.id, metrika: c.metrika, obdobi_od: c.obdobi_od, obdobi_do: c.obdobi_do, user_id: c.user_id, user_jmeno: users.find((u) => u.id === c.user_id)?.display_name ?? null,
    tym_id: c.tym_id, tym_jmeno: c.tym_id === null ? null : `Tým ${users.find((u) => u.id === c.tym_id)?.display_name ?? c.tym_id}`, mena: c.mena, hodnota: castkaText(c.hodnota),
    zadal: users.find((u) => u.id === c.zadal_id)?.display_name ?? '?', zadano_at: c.zadano_at, smi_upravit: smi,
  };
}

/**
 * Karta hodnoty prodejů z jednotek (i plnění cíle a proklik). ⚠ Úkol 14c (073 app_prehled_souhrn a finance): stav k datu před
 * historií nedostupne s větou HISTORIE_OD, jinak „U a z n prodejů není přesná cena; součet je jen ze známých cen.“; prodeje jsou
 * stav kontaktu (bez ZDROJ_OD), NAHRAZUJE ZDROJ_OD prodejů a větu „… není přesná částka; součet je jen ze známých.“
 */
const hodnotaProdejuMetrika = (x: KontextPrehledu, prodeje: JednotkaProdeje[], klic = 'hodnota_prodeju'): Metrika =>
  (stavNeznamy(x) ? nedostupnaMetrika(klic, x, historieText())
    : penizeMetrika(klic, x, prodeje.map((p) => ({ castka: p.cena.castka, mena: p.cena.mena })), 'prodeje', 'prodejů', CENA_VETA));
/**
 * Karta inkasa (073 app_prehled_m_inkaso, jedno místo pro souhrn i finance; úkol 14c, ⚠ NAHRAZUJE věty úkolu 13): castecne, když
 * platba nejmenuje fakturu (cena prodeje), je odvozená ze stavu zaplaceno, nemá přesnou částku, zdroj plateb chybí nebo období
 * začíná před ním (ZDROJ_OD).
 */
function inkasoMetrika(x: KontextPrehledu, platby: JednotkaPlatby[]): Metrika {
  const n = platby.length;
  const zCeny = platby.filter((p) => !p.odvozeno && p.zdroj_castky !== 'faktura').length;
  const odvozene = platby.filter((p) => p.odvozeno).length;
  const bezCastky = platby.filter((p) => p.castka === null).length;
  const zdroj = rozsahZdroje('platby', x.kZdroje);
  const duvod = [
    zCeny > 0 ? `U ${zN(zCeny, n, 'platby', 'plateb')} je částka z ceny prodeje, ne z faktury.` : null,
    odvozene > 0 ? `U ${zN(odvozene, n, 'platby', 'plateb')} je platba odvozená ze stavu zaplaceno, bez potvrzení.` : null,
    bezCastky > 0 ? `U ${zN(bezCastky, n, 'platby', 'plateb')} není přesná částka.` : null,
    zdroj.od === null && zdroj.aktualni_k === null ? 'Zdroj „Platby“ zatím nemá žádná data.' : zdroj.od && x.odMs < Date.parse(zdroj.od) ? zdrojOdText('platby', zdroj.od) : null,
  ].filter(Boolean).join(' ') || null;
  return metrikaPrehledu('inkaso', x, { castky: castkyZ(platby.map((p) => ({ castka: p.castka, mena: p.mena })), x.meny), n, pokryti: pokryti(n - bezCastky, n),
    kvalita: duvod ? 'castecne' : 'dostupne', duvod });
}
/**
 * Plnění cíle (073 app_prehled_souhrn; úkol 14c, věty doslova): bez cíle nedostupne s důvodem cilProFiltr, stav k datu před
 * historií nedostupne (HISTORIE_OD), žádná přesná cena v měně = castecne bez hodnoty, jinak podíl s „U a z n prodejů není přesná
 * cena; plnění je jen ze známých cen.“ (NAHRAZUJE „… hodnota prodejů je jen ze známých cen.“); data.cil jen u zobrazeného plnění.
 */
function plneniCile(me: MockUser, x: KontextPrehledu, prodeje: JednotkaProdeje[]): { metrika: Metrika; cil: CilPrehledu | null } {
  const { cil, duvod } = cilProFiltr(x, 'hodnota_prodeju');
  if (!cil) return { metrika: nedostupnaMetrika('plneni_cile', x, duvod!), cil: null };
  if (stavNeznamy(x)) return { metrika: nedostupnaMetrika('plneni_cile', x, historieText()), cil: null };
  const polozky = prodeje.map((p) => ({ castka: p.cena.castka, mena: p.cena.mena }));
  const cit = x.f.mena === 'obe' ? null : castkyZ(polozky, [x.f.mena])[0].hodnota;
  const nezname = prodeje.filter((p) => p.cena.castka === null).length;
  const p = pokryti(prodeje.length - nezname, prodeje.length);
  const m = cit === null
    ? metrikaPrehledu('plneni_cile', x, { hodnota: null, jmenovatel: zaokr(cil.hodnota, 2), n: prodeje.length, pokryti: p, kvalita: 'castecne',
      duvod: 'Žádný prodej v období nemá přesnou cenu; plnění cíle nejde spočítat.' })
    : podilMetrika('plneni_cile', x, Number(cit), zaokr(cil.hodnota, 2), prodeje.length, p,
      nezname > 0 ? `U ${zN(nezname, prodeje.length, 'prodeje', 'prodejů')} není přesná cena; plnění je jen ze známých cen.` : null);
  return { metrika: m, cil: cilVen(me, cil) };
}
/**
 * Úspěšnost (073 app_prehled_souhrn): stav k datu před historií nedostupne; období před začátkem historie castecne s větou
 * HISTORIE_OD a „Ztráty před ní se datují podle událostí a poslední změny stavu.“ (úkol 14c, NAHRAZUJE „Historie stavů začíná …;
 * dřívější změny známe jen z posledních milníků.“).
 */
function uspesnostMetrika(x: KontextPrehledu, u: JednotkaUzavreni[]): Metrika {
  if (stavNeznamy(x)) return nedostupnaMetrika('uspesnost', x, historieText());
  const vyhry = u.filter((j) => j.vyhra).length;
  return podilMetrika('uspesnost', x, vyhry, u.length, u.length, pokryti(u.length, u.length),
    x.odMs < Date.parse(PREHLED_HISTORIE_OD) ? `${historieText()} Ztráty před ní se datují podle událostí a poslední změny stavu.` : null);
}
function otevreneMetrika(x: KontextPrehledu): Metrika {
  // stav k datu před historií: věta HISTORIE_OD jako 073 (úkol 14c, NAHRAZUJE „Stav k tomuto okamžiku není známý: …“)
  if (stavNeznamy(x)) return nedostupnaMetrika('otevrene', x, historieText());
  const o = otevreneKDatu(x);
  const zname = o.filter((j) => j.cena.castka !== null).length;
  return metrikaPrehledu('otevrene', x, {
    hodnota: o.length, castky: castkyZ(o.map((j) => ({ castka: j.cena.castka, mena: j.cena.mena })), x.meny), n: o.length, pokryti: pokryti(zname, o.length),
    kvalita: zname < o.length ? 'castecne' : 'dostupne', duvod: zname < o.length ? `U ${zN(o.length - zname, o.length, 'otevřeného', 'otevřených')} není přesná cena.` : null,
  });
}

/** prehled_souhrn (§5.2). */
function prehledSouhrnMock(me: MockUser, vstup: unknown): PrehledObalka<DataSouhrn> {
  const x = kontextPrehledu(me, vstup);
  const prodeje = prodejeV(x);
  const { metrika: plneni, cil } = plneniCile(me, x, prodeje);
  const prognoza = prognozaData(x);
  const odhad = { ...prognoza.scenare.zakladni, klic: 'odhad_mesic', nazev: KATALOG_MAPA.get('odhad_mesic')!.nazev, zaklad: KATALOG_MAPA.get('odhad_mesic')!.zaklad,
    proklik: prognoza.scenare.zakladni.proklik ? { zdroj: 'kontakty', filtr: { ...x.f, vyber: { metrika: 'odhad_mesic' } } } : null };
  const akce = pripadyAkce(x);
  const karty: DataSouhrn['karty'] = {
    hodnota_prodeju: hodnotaProdejuMetrika(x, prodeje),
    inkaso: inkasoMetrika(x, platbyV(x)),
    pocet_prodeju: stavNeznamy(x) ? nedostupnaMetrika('pocet_prodeju', x, historieText()) : pocetMetrika('pocet_prodeju', x, prodeje.length),
    plneni_cile: plneni,
    uspesnost: uspesnostMetrika(x, uzavreneV(x)),
    otevrene: otevreneMetrika(x),
    odhad_mesic: odhad,
    // k_zasahu = souhrn.pripadu akčního seznamu (VŠECHNY případy, ne jen 50); s k datu nedostupne větou 073 (úkol 14c, AMENDED
    // 2026-11-19; ⚠ NAHRAZUJE větu „Tohle číslo je jen pro dnešek …“)
    k_zasahu: x.f.k_datu ? nedostupnaMetrika('k_zasahu', x, 'Případy k zásahu jsou jen pro dnešek; s k datu v minulosti nejsou známé.') : pocetMetrika('k_zasahu', x, akce.length),
  };
  // varování jako 073 souhrn: filtr, historie (stav k datu, období před historií u úspěšnosti), ZDROJ_OD plateb (karta inkasa),
  // ODHAD jen u zobrazeného odhadu (úkol 14c, ⚠ NAHRAZUJE ZDROJ_OD prodejů, návrhů a faktur, které souhrn nemá)
  return obalkaPrehledu(x, { karty, cil: plneni.kvalita === 'nedostupne' ? null : cil }, ['hovory', 'kontakty', 'prodeje', 'navrhy', 'slevy', 'faktury', 'platby', 'historie', 'cile', 'snimky', 'oznaceni', 'zavolat'],
    varovaniPrehledu(x, { historie: true, zdroje: ['platby'], odhad: odhad.kvalita !== 'nedostupne', zakladJenKlienti: true }));
}

const METRIKY_RADY = ['hovory', 'dovolano', 'zajem', 'navrhy', 'pocet_prodeju', 'hodnota_prodeju', 'inkaso', 'naklady_celkem', 'odpracovane_hodiny'];
const ZDROJE_RADY: Record<string, ZdrojKlicPrehledu[]> = {
  hovory: ['hovory', 'cile'], dovolano: ['hovory'], zajem: ['hovory', 'cile'], navrhy: ['hovory', 'kontakty', 'navrhy'],
  pocet_prodeju: ['hovory', 'kontakty', 'prodeje', 'historie', 'cile'], hodnota_prodeju: ['hovory', 'kontakty', 'prodeje', 'slevy', 'historie', 'cile'],
  inkaso: ['hovory', 'kontakty', 'prodeje', 'faktury', 'platby', 'historie', 'cile'], naklady_celkem: ['hovory', 'prodeje', 'slevy', 'naklady'],
  odpracovane_hodiny: ['hovory', 'dovolani', 'casovac', 'cile', 'zavolat'],
};
/** Zdroj, od kterého řada začíná (073 app_prehled_rada v_szdroj); prodeje jsou stav kontaktu bez začátku. */
const SERIE_ZDROJ: Record<string, ZdrojKlicPrehledu | null> = {
  hovory: 'hovory', dovolano: 'hovory', zajem: 'hovory', navrhy: 'navrhy', pocet_prodeju: null, hodnota_prodeju: null, inkaso: 'platby', naklady_celkem: 'naklady',
  odpracovane_hodiny: 'hovory',
};
/** Událost řady (073 v_ud): pražský den, jednotka, peníze, hodiny, odhad, zdroj platby, ověření nákladu. */
interface UdalostRady { d: string; j: string; stav: CenaStav; castka?: number | null; mena?: MenaPrehledu | null; h?: number; odhad?: boolean; z?: 'faktura' | 'cena' | 'odvozeno'; overit?: boolean; nid?: number | null }
/** Události metriky řady v období do k_datu (úkol 14c, jeden průchod pro sloupce i NAKLADY_OVERIT). */
function udalostiRady(x: KontextPrehledu, metrika: string): UdalostRady[] {
  const den = (iso: string) => denPraha(new Date(iso));
  switch (metrika) {
    case 'hovory': case 'dovolano': case 'zajem':
      return hovoryV(x).filter((l) => metrika === 'hovory' || (metrika === 'dovolano' ? l.outcome !== 'nedovolano' : l.outcome === 'zajem'))
        .map((l) => ({ d: den(l.created_at), j: `h:${l.id}`, stav: 'presne' }));
    case 'navrhy': return kontakty.filter((c) => x.vObdobi(navrhAt(c)) && x.sedi(c) && x.lidi(x.osoba(c))).map((c) => ({ d: den(navrhAt(c)!), j: `k:${c.id}`, stav: 'presne' }));
    case 'pocet_prodeju': case 'hodnota_prodeju':
      return prodejeV(x).map((p) => ({ d: den(p.at), j: `p:${p.c.id}`, castka: p.cena.castka, mena: p.cena.mena, stav: p.cena.rozbor.stav }));
    case 'inkaso':
      return platbyV(x).map((p) => ({ d: den(p.at), j: p.id === null ? `z:${p.c.id}` : `e:${p.id}`, castka: p.castka, mena: p.mena, stav: p.castka === null ? 'nezname' : 'presne',
        z: p.odvozeno ? 'odvozeno' : p.zdroj_castky === 'faktura' ? 'faktura' : 'cena' }));
    case 'naklady_celkem':
      return nakladyV(x).map((n) => ({ d: n.datum, j: n.radek_id, castka: n.castka, mena: n.mena, stav: n.stav_ceny, overit: n.overit, nid: n.naklad_id }));
    default:
      return useyV(x).map((s) => ({ d: denPraha(new Date(s.od)), j: `${s.uid}:${s.od}`, stav: 'presne', h: (s.do - s.od) / HODINA_MS, odhad: s.odhad }));
  }
}
/** Pracovní úseky lidí filtru (§5.14) začínající v [odMs, doMs). */
function useyV(x: KontextPrehledu, odMs = x.odMs, doMs = x.doMs): { uid: number; od: number; do: number; kotev: number; odhad: boolean }[] {
  return users.filter((u) => x.lidi(u.id)).flatMap((u) => pracovniUseky(u.id, x.kMs).filter((s) => s.od >= odMs && s.od < doMs).map((s) => ({ uid: u.id, ...s })));
}
/** Hodnota jedné metriky řady za [odMs, doMs) (číslo, nebo peníze po měnách). */
function hodnotaRady(x: KontextPrehledu, metrika: string, odMs: number, doMs: number, odDen: string, doDen: string): { hodnota: number | null; castky: CastkaJedna[] } {
  const v = (iso: string | null | undefined) => { if (!iso) return false; const t = Date.parse(iso); return t >= odMs && t < doMs && t <= x.kMs; };
  const hovory = () => hovoryV(x).filter((l) => v(l.created_at));
  switch (metrika) {
    case 'hovory': return { hodnota: hovory().length, castky: [] };
    case 'dovolano': return { hodnota: hovory().filter((l) => l.outcome !== 'nedovolano').length, castky: [] };
    case 'zajem': return { hodnota: hovory().filter((l) => l.outcome === 'zajem').length, castky: [] };
    case 'navrhy': return { hodnota: kontakty.filter((c) => v(navrhAt(c)) && x.sedi(c) && x.lidi(x.osoba(c))).length, castky: [] };
    case 'pocet_prodeju': return { hodnota: prodejeV(x, odMs, doMs).length, castky: [] };
    case 'hodnota_prodeju': return { hodnota: null, castky: jedneCastky(castkyZ(prodejeV(x, odMs, doMs).map((p) => ({ castka: p.cena.castka, mena: p.cena.mena })), x.meny)) };
    case 'inkaso': return { hodnota: null, castky: jedneCastky(castkyZ(platbyV(x).filter((p) => v(p.at)).map((p) => ({ castka: p.castka, mena: p.mena })), x.meny)) };
    case 'naklady_celkem': {
      const xx = { ...x, f: { ...x.f, od: odDen, do: doDen }, odMs, doMs };
      return { hodnota: null, castky: jedneCastky(castkyZ(nakladyV(xx).map((n) => ({ castka: n.castka, mena: n.mena })), x.meny)) };
    }
    default: return { hodnota: zaokr(useyV(x, odMs, doMs).reduce((a, s) => a + (s.do - s.od), 0) / HODINA_MS, 2), castky: [] };
  }
}
/** prehled_rada (§5.3): sloupce dnů, týdnů po–ne nebo měsíců v Praze, oříznuté na období. */
function prehledRadaMock(me: MockUser, metrika: unknown, zrnitost: unknown, vstup: unknown): PrehledObalka<DataRada> {
  const x = kontextPrehledu(me, vstup);
  if (typeof metrika !== 'string' || !METRIKY_RADY.includes(metrika)) fail(`Neplatná metrika řady: ${String(metrika)}. Povolené: ${METRIKY_RADY.join(', ')}.`);
  const zrn = zrnitost === undefined || zrnitost === null ? 'den' : zrnitost;
  if (zrn !== 'den' && zrn !== 'tyden' && zrn !== 'mesic') fail(`Neplatná zrnitost: ${String(zrn)}. Povolené: den, tyden, mesic.`);
  const def = KATALOG_MAPA.get(metrika)!;
  // řada, kterou filtr celá nerozdělí (úkol 14b, kontrakt §9, 18. 11. 2026, úkol 4, body 14 a 15): náklady z evidence nemají
  // člověka ani klienta, pracovní doba nemá klienta; každý sloupec nedostupný s větou databáze
  const celaBez = metrika === 'naklady_celkem' && (x.f.lide || filtrKlientu(x.f)) ? NAKLADY_BEZ_FILTRU
    : metrika === 'odpracovane_hodiny' && filtrKlientu(x.f) ? PRACE_BEZ_DIMENZE : null;
  // ⚠ Úkol 14c (073 app_prehled_rada; NAHRAZUJE začátek zdroje z katalogu, věty „Sloupec je až po datu dat …“, „Sloupec je před
  // začátkem zdroje …“, „Zdroj začíná …, uprostřed sloupce.“, „Sloupec ještě běží.“ a peníze null ve sloupci bez dat): začátek
  // sloupců dává zdroj řady (hovory, návrhy, platby; náklady se účtují podle dne platnosti), prázdný zdroj (kromě plateb) = sloupce
  // nedostupné; stav k datu před historií u prodejů a nákladů (provize z prodejů) = sloupce nedostupné s větou HISTORIE_OD;
  // neúplné jednotky sloupce castecne větami 073; sloupec bez hodnoty má castky []
  const szdroj = SERIE_ZDROJ[metrika];
  const sZdroj = szdroj && !celaBez ? rozsahZdroje(szdroj, x.kZdroje) : null;
  const chybiT = sZdroj && szdroj !== 'platby' && sZdroj.od === null && sZdroj.aktualni_k === null ? `Zdroj „${ZDROJE_PREHLEDU.find((z) => z.zdroj === szdroj)!.nazev}“ zatím nemá žádná data.` : null;
  const start = sZdroj && szdroj !== 'naklady' && sZdroj.od ? sZdroj.od : null;
  const startT = start ? zdrojOdText(szdroj!, start) : null;
  const historieNezna = ['pocet_prodeju', 'hodnota_prodeju', 'naklady_celkem'].includes(metrika) && stavNeznamy(x);
  const penizni = def.jednotka === 'mena';
  const j1 = metrika === 'inkaso' ? 'platby' : metrika === 'naklady_celkem' ? 'nákladu' : 'prodeje';
  const j2 = metrika === 'inkaso' ? 'plateb' : metrika === 'naklady_celkem' ? 'nákladů' : 'prodejů';
  // náklady: povinná kategorie bez zadaného nákladu = sloupce castecne (volitelná Jiné nikdy, §9 bod 13)
  const bezNakladu = metrika === 'naklady_celkem' ? bezNakladuText(kategorieBezNakladu(x.kMs)) : null;
  const dim = dimKDatu(x.f).duvod;
  const udalosti = celaBez || chybiT || historieNezna ? [] : udalostiRady(x, metrika);
  const body: BodRady[] = [];
  for (let od = x.f.od; od <= x.f.do && body.length < 731;) {
    const konecJednotky = zrn === 'den' ? od : zrn === 'tyden' ? posunDen(od, 7 - isoDen(od)) : posledniDenMesice(od);
    const zacatekJednotky = zrn === 'den' ? od : zrn === 'tyden' ? posunDen(od, 1 - isoDen(od)) : `${od.slice(0, 7)}-01`;
    const doDne = konecJednotky < x.f.do ? konecJednotky : x.f.do;
    const odMs = zacatekDnePraha(od);
    const doMs = zacatekDnePraha(posunDen(doDne, 1));
    const uplny = zacatekJednotky >= x.f.od && konecJednotky <= x.f.do;
    const prazdny = (duvod: string): BodRady => ({ od, do: doDne, uplny, hodnota: null, castky: [], kvalita: 'nedostupne', duvod });
    let bod: BodRady;
    if (celaBez) bod = prazdny(celaBez);
    else if (odMs > x.kMs) bod = prazdny(x.f.k_datu ? 'Tohle období je až po zvoleném okamžiku k datu.' : 'Tohle období ještě nezačalo.');
    else if (chybiT) bod = prazdny(chybiT);
    else if (historieNezna) bod = prazdny(historieText());
    else if (start && doMs <= Date.parse(start)) bod = prazdny(startT!);
    else {
      const u = udalosti.filter((e) => e.d >= od && e.d <= doDne);
      const jednotky = new Set(u.map((e) => e.j)).size;
      const pocetJ = (fn: (e: UdalostRady) => boolean) => new Set(u.filter(fn).map((e) => e.j)).size;
      const nejiste = pocetJ((e) => e.stav !== 'presne');
      const odhad = pocetJ((e) => !!e.odhad);
      const zCeny = pocetJ((e) => e.z === 'cena');
      const odvozene = pocetJ((e) => e.z === 'odvozeno');
      const overit = new Set(u.filter((e) => e.overit).map((e) => e.nid)).size;
      const duvod = [
        start && odMs < Date.parse(start) ? startT : null,
        nejiste > 0 ? `U ${zN(nejiste, jednotky, j1, j2)} není přesná částka.` : null,
        odhad > 0 ? `U ${zN(odhad, jednotky, 'pracovního úseku', 'pracovních úseků')} je čas odhad z výsledků hovorů, bez časovače.` : null,
        zCeny > 0 ? `U ${zN(zCeny, jednotky, 'platby', 'plateb')} je částka z ceny prodeje, ne z faktury.` : null,
        odvozene > 0 ? `U ${zN(odvozene, jednotky, 'platby', 'plateb')} je platba odvozená ze stavu zaplaceno, bez potvrzení.` : null,
        overit > 0 ? `U ${zN(overit, jednotky, 'nákladu', 'nákladů')} čeká částka na ověření.` : null,
        bezNakladu,
      ].filter(Boolean).join(' ') || null;
      bod = sDalsimDuvodem({
        od, do: doDne, uplny,
        hodnota: penizni ? null : def.jednotka === 'h' ? zaokr(u.reduce((a, e) => a + (e.h ?? 0), 0), 2) : jednotky,
        castky: penizni ? jedneCastky(castkyZ(u.map((e) => ({ castka: e.castka ?? null, mena: e.mena ?? null, stav: e.stav })), x.meny)) : [],
        kvalita: duvod ? 'castecne' : 'dostupne', duvod,
      }, dim);
    }
    body.push(bod);
    od = posunDen(doDne, 1);
  }
  // NAKLADY_OVERIT: řádky nákladů (ne zaúčtování) s overit, které se v období účtují, jen u řady, která se počítá (073, §9 5a bod 17)
  const nakladyOverit = metrika === 'naklady_celkem' ? new Set(udalosti.filter((e) => e.overit).map((e) => e.nid)).size : 0;
  const mapaCile: Record<string, CilPrehledu['metrika'][]> = { hovory: ['hovory'], zajem: ['zajem'], pocet_prodeju: ['prodane_weby'], hodnota_prodeju: ['hodnota_prodeju'], inkaso: ['inkaso'], odpracovane_hodiny: ['odpracovane_hodiny'] };
  const cile: DataRada['cile'] = [];
  for (const mc of mapaCile[metrika] ?? []) {
    const vMene = METRIKY_CILU.find((m) => m.klic === mc)!.v_mene;
    if (x.f.segment || x.f.obor || x.f.kraj || (vMene && x.f.mena === 'obe')) continue;
    // cíl platný k okamžiku (zadaný do něj, nezrušený do něj; 073 app_prehled_cile; recenze 14b, drobnost 2)
    for (const c of PREHLED_CILE.filter((c) => platiKDatu(c.zadano_at, c.zruseno_at, x.kMs) && c.metrika === mc && c.obdobi_od <= x.f.do && c.obdobi_do >= x.f.od && (!vMene || c.mena === x.f.mena))) {
      const sedi = c.user_id === null && c.tym_id === null ? x.f.lide === null
        : c.user_id !== null ? !!x.f.lide && x.f.lide.length === 1 && x.f.lide[0] === c.user_id
          : !!x.f.lide && JSON.stringify(x.f.lide) === JSON.stringify([c.tym_id!, ...users.filter((u) => u.manager_id === c.tym_id).map((u) => u.id)].sort((a, b) => a - b));
      if (!sedi) continue;
      const od = c.obdobi_od > x.f.od ? c.obdobi_od : x.f.od;
      const doDne = c.obdobi_do < x.f.do ? c.obdobi_do : x.f.do;
      const h = hodnotaRady(x, metrika, zacatekDnePraha(od), Math.min(zacatekDnePraha(posunDen(doDne, 1)), x.kMs + 1), od, doDne);
      const skutecnost = vMene ? h.castky.find((k) => k.mena === c.mena)?.hodnota ?? null : h.hodnota === null ? null : castkaText(h.hodnota);
      cile.push({ cil_id: c.id, od: c.obdobi_od, do: c.obdobi_do, hodnota: castkaText(c.hodnota), mena: c.mena, skutecnost, plneni: skutecnost === null ? null : zaokr(Number(skutecnost) / c.hodnota, 6),
        kvalita: vMene && metrika === 'hodnota_prodeju' && prodejeV(x).some((p) => p.cena.castka === null) ? 'castecne' : 'dostupne' });
    }
  }
  const data: DataRada = {
    metrika: { klic: metrika, nazev: def.nazev, jednotka: def.jednotka }, zrnitost: zrn as DataRada['zrnitost'], body,
    proklik: def.radky ? { zdroj: def.radky, filtr: { ...x.f, vyber: { metrika } } } : null, cile,
  };
  // CASOVAC_OD jen u řady, která se počítá (073: s filtrem klientů je řada hodin celá nedostupná); ZDROJ_OD jen zdroje řady (ne
  // nákladů), HISTORIE_OD jen se stavem k datu před historií (úkol 14c, ⚠ NAHRAZUJE ZDROJ_OD všech zdrojů řady a HISTORIE_OD
  // období před historií)
  return obalkaPrehledu(x, data, ZDROJE_RADY[metrika], varovaniPrehledu(x, { zdroje: szdroj && szdroj !== 'naklady' && !celaBez && !chybiT ? [szdroj] : [],
    casovac: metrika === 'odpracovane_hodiny' && celaBez === null, historie: historieNezna && !celaBez ? 'k_datu' : undefined, bezDimenze: celaBez !== null,
    nakladyOverit: historieNezna ? 0 : nakladyOverit }));
}

/** Milníky kontaktu do k_datu (trychtýř §5.4). */
function milnikyKontaktu(x: KontextPrehledu, c: Kontakt): Record<KrokTrychtyre['klic'], string | null> {
  const hovory = callLog.filter((l) => l.kontakt_id === c.id && x.doKDatu(l.created_at)).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
  const faktura = PREHLED_FAKTURY.filter((f) => f.kontakt_id === c.id && x.doKDatu(f.at)).map((f) => f.at).sort()[0] ?? null;
  const platba = platbyDoKDatu(x).filter((p) => p.c.id === c.id).map((p) => p.at).sort()[0] ?? null;
  const navrh = navrhAt(c);
  const prodej = PRODANO_STAVY.includes(c.status) ? datumProdeje(c) : null;
  return {
    osloven: hovory[0]?.created_at ?? null,
    dovolan: hovory.find((l) => l.outcome !== 'nedovolano')?.created_at ?? null,
    zajem: hovory.find((l) => l.outcome === 'zajem')?.created_at ?? null,
    navrh: navrh && x.doKDatu(navrh) ? navrh : null,
    prodano: prodej && x.doKDatu(prodej) ? prodej : null,
    fakturovano: faktura,
    zaplaceno: platba,
  };
}
const KROKY_TRYCHTYRE: { klic: KrokTrychtyre['klic']; nazev: string; zdroj: ZdrojKlicPrehledu }[] = [
  { klic: 'osloven', nazev: 'Osloven', zdroj: 'hovory' },
  { klic: 'dovolan', nazev: 'Dovolán', zdroj: 'hovory' },
  { klic: 'zajem', nazev: 'Zájem', zdroj: 'hovory' },
  { klic: 'navrh', nazev: 'Návrh odeslán', zdroj: 'navrhy' },
  { klic: 'prodano', nazev: 'Prodáno', zdroj: 'prodeje' },
  { klic: 'fakturovano', nazev: 'Fakturováno', zdroj: 'faktury' },
  { klic: 'zaplaceno', nazev: 'Zaplaceno', zdroj: 'platby' },
];
/** Kohorta trychtýře: první hovor kontaktu (kýmkoli) v období; s lide ho dělal někdo z nich. */
function kohortaTrychtyre(x: KontextPrehledu): Kontakt[] {
  return kontakty.filter((c) => {
    if (!x.sedi(c)) return false;
    const prvni = callLog.filter((l) => l.kontakt_id === c.id).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)[0];
    return !!prvni && x.vObdobi(prvni.created_at) && x.lidi(prvni.user_id);
  });
}
/** Kontakty kroku trychtýře (n) a kdo má milník bez dřívějšího (bez_predchoziho). */
function krokTrychtyre(x: KontextPrehledu, kohorta: Kontakt[], krok: KrokTrychtyre['klic']): { v: Kontakt[]; bez: Kontakt[]; otevrenych: Kontakt[] } {
  const i = KROKY_TRYCHTYRE.findIndex((k) => k.klic === krok);
  const ma = (c: Kontakt, j: number) => milnikyKontaktu(x, c)[KROKY_TRYCHTYRE[j].klic] !== null;
  const vsechny = (c: Kontakt, j: number) => KROKY_TRYCHTYRE.slice(0, j + 1).every((_, k) => ma(c, k));
  // uzavřené: ztraceno, archiv, vyrazeno a u kroků do „prodáno“ včetně i prodano; u fakturováno a zaplaceno je prodaný klient
  // otevřený (kontrakt §5.4; 073 po recenzi úkolu 4; úkol 14b, ⚠ NAHRAZUJE „prodaný otevřený u každého kroku“)
  const iProdano = KROKY_TRYCHTYRE.findIndex((k) => k.klic === 'prodano');
  const uzavreny = (c: Kontakt) => ['ztraceno', 'archiv', 'vyrazeno'].includes(skupinaStavu(c.status)) || (i <= iProdano && skupinaStavu(c.status) === 'prodano');
  return {
    v: kohorta.filter((c) => vsechny(c, i)),
    bez: kohorta.filter((c) => ma(c, i) && !vsechny(c, i)),
    otevrenych: i === 0 ? [] : kohorta.filter((c) => vsechny(c, i - 1) && !ma(c, i) && !uzavreny(c)),
  };
}
const KROKY_PO_NAVRHU: { klic: KrokPoNavrhu['klic']; nazev: string }[] = [
  { klic: 'navrh', nazev: 'Návrh odeslán' },
  { klic: 'odpovedel', nazev: 'Odpověděl' },
  { klic: 'odmitl_nahled', nazev: 'Odmítl náhled' },
  { klic: 'nabidka', nazev: 'Dostal nabídku za polovinu' },
  { klic: 'prijal_nabidku', nazev: 'Přijal nabídku' },
  { klic: 'odmitl_nabidku', nazev: 'Odmítl nabídku' },
  { klic: 'nereagoval_na_nabidku', nazev: 'Nereagoval ani na nabídku za polovinu' },
  { klic: 'ceka_na_nabidku', nazev: 'Nabídka běží' },
  { klic: 'prodano_bez_nabidky', nazev: 'Prodáno bez nabídky' },
];
/** Důvody (odmitnuti z appky i zpětné), nejnovější na kontakt a fázi. */
function duvodyRadky(): { id: number; kontakt_id: number; faze: FazeOdmitnuti; duvod: DuvodOdmitnutiKod; text: string | null; zdroj: RadekOdmitnuti['zdroj_zapisu']; zapsal: string; at: string }[] {
  const vse = [...odmitnutiRadky.map((r) => ({ ...r })), ...PREHLED_DUVODY_ZPETNE.map((r) => ({ ...r }))];
  const nejnovejsi = new Map<string, (typeof vse)[number]>();
  for (const r of vse) {
    const k = `${r.kontakt_id}|${r.faze}`;
    const p = nejnovejsi.get(k);
    if (!p || r.at > p.at || (r.at === p.at && r.id > p.id)) nejnovejsi.set(k, r);
  }
  return [...nejnovejsi.values()];
}
/** Kontakty kroku po návrhu (D8). */
function krokPoNavrhu(x: KontextPrehledu, kohorta: Kontakt[], krok: KrokPoNavrhu['klic']): Kontakt[] {
  const duvody = duvodyRadky();
  const sleva = (c: Kontakt) => (slevy.get(c.id) ?? []).filter((e) => x.doKDatu(e.created_at) && e.created_at > (navrhAt(c) ?? '')).map((e) => e.created_at).sort()[0] ?? null;
  const prodano = (c: Kontakt) => (PRODANO_STAVY.includes(c.status) && x.doKDatu(datumProdeje(c)) ? datumProdeje(c) : null);
  const odpovedel = (c: Kontakt) => {
    const n = navrhAt(c) ?? '';
    return PREHLED_ZPRAVY.some((z) => z.kontakt_id === c.id && z.smer === 'prichozi' && z.druh === 'clovek' && z.prijato_at > n && x.doKDatu(z.prijato_at))
      || (!!c.last_client_reply_at && c.last_client_reply_at > n) || callLog.some((l) => l.kontakt_id === c.id && l.outcome !== 'nedovolano' && l.created_at > n && x.doKDatu(l.created_at));
  };
  switch (krok) {
    case 'navrh': return kohorta;
    case 'odpovedel': return kohorta.filter(odpovedel);
    case 'odmitl_nahled': return kohorta.filter((c) => duvody.some((d) => d.kontakt_id === c.id && d.faze === 'nahled') || (!!ztrataAt(c) && !sleva(c)) || !!sleva(c));
    case 'nabidka': return kohorta.filter((c) => !!sleva(c));
    case 'prijal_nabidku': return kohorta.filter((c) => { const s = sleva(c); const p = prodano(c); return !!s && !!p && p > s; });
    case 'odmitl_nabidku': return kohorta.filter((c) => !!sleva(c) && (duvody.some((d) => d.kontakt_id === c.id && d.faze === 'sleva') || (!!ztrataAt(c) && ztrataAt(c)! > sleva(c)!)));
    case 'nereagoval_na_nabidku': return [];
    case 'ceka_na_nabidku': return kohorta.filter((c) => !!sleva(c) && !prodano(c) && !ztrataAt(c) && !duvody.some((d) => d.kontakt_id === c.id && d.faze === 'sleva'));
    default: return kohorta.filter((c) => !!prodano(c) && !sleva(c));
  }
}
const kohortaPoNavrhu = (x: KontextPrehledu): Kontakt[] => kontakty.filter((c) => x.vObdobi(navrhAt(c)) && x.sedi(c) && x.lidi(x.osoba(c)));
/** prehled_trychtyr (§5.4). */
function prehledTrychtyrMock(me: MockUser, vstup: unknown): PrehledObalka<DataTrychtyr> {
  const x = kontextPrehledu(me, vstup);
  const kohorta = kohortaTrychtyre(x);
  const proklik = (vyber: Record<string, unknown>): PrehledProklik => ({ zdroj: 'kontakty', filtr: { ...x.f, vyber } });
  // úkol 14b (§9 bod 4): filtr klientů k datu, který historie nezná, = kroky obou trychtýřů castecne
  const dim = dimKDatu(x.f).duvod;
  let predchozi = kohorta.length;
  const kroky: KrokTrychtyre[] = KROKY_TRYCHTYRE.map((k) => {
    const r = krokTrychtyre(x, kohorta, k.klic);
    const od = rozsahZdroje(k.zdroj).od;
    const castecne = od && Date.parse(od) > x.odMs ? `Milník se eviduje od ${denCesky(od)}; dřívější průchody nejsou známé.` : null;
    const krok: KrokTrychtyre = {
      klic: k.klic, nazev: k.nazev, n: r.v.length, z_predchoziho: predchozi === 0 ? null : zaokr(r.v.length / predchozi, 6), z_kohorty: kohorta.length === 0 ? null : zaokr(r.v.length / kohorta.length, 6),
      otevrenych: r.otevrenych.length, bez_predchoziho: r.bez.length, zdroj_od: od, kvalita: castecne ? 'castecne' : 'dostupne', duvod: castecne, proklik: proklik({ metrika: 'trychtyr', krok: k.klic }),
    };
    predchozi = r.v.length;
    return sDalsimDuvodem(krok, dim);
  });
  const stavy = STAVY_PREHLEDU.map((s) => ({ status: s.klic, nazev: s.nazev, n: kohorta.filter((c) => c.status === s.klic).length, proklik: proklik({ metrika: 'stavy_kohorty', status: s.klic }) })).filter((s) => s.n > 0);
  const poNavrhu = kohortaPoNavrhu(x);
  const data: DataTrychtyr = {
    kohorta: { popis: 'První hovor v období', od: x.f.od, do: x.f.do, n: kohorta.length, proklik: proklik({ metrika: 'trychtyr', krok: 'osloven' }) },
    kroky,
    stavy: { popis: 'Současné rozložení stavů (stav k datu, ne trychtýř)', polozky: stavy },
    po_navrhu: {
      kohorta: { popis: 'První návrh v období', od: x.f.od, do: x.f.do, n: poNavrhu.length, proklik: proklik({ metrika: 'po_navrhu', krok: 'navrh' }) },
      kroky: KROKY_PO_NAVRHU.map((k): KrokPoNavrhu => {
        // „odpověděl“ stojí na poslední odpovědi klienta, která se nehistorizuje: se zadaným k_datu nedostupné (R11, §9 bod 5; úkol 14b)
        if (k.klic === 'odpovedel' && x.f.k_datu) return { klic: k.klic, nazev: k.nazev, n: null, podil: null, kvalita: 'nedostupne', duvod: ODPOVED_JEN_DNES, proklik: null };
        const n = krokPoNavrhu(x, poNavrhu, k.klic).length;
        const castecne = k.klic === 'odpovedel' ? 'Odpověď z Gmailu, jinak z posledního data odpovědi klienta (částečně).' : k.klic === 'nereagoval_na_nabidku' ? 'Události sleva_vyprsela jsou jen od 2. 11. 2026.' : null;
        return sDalsimDuvodem({ klic: k.klic, nazev: k.nazev, n, podil: poNavrhu.length === 0 ? null : zaokr(n / poNavrhu.length, 6), kvalita: castecne ? 'castecne' as const : 'dostupne' as const,
          duvod: castecne, proklik: proklik({ metrika: 'po_navrhu', krok: k.klic }) }, dim);
      }),
    },
  };
  return obalkaPrehledu(x, data, ['hovory', 'kontakty', 'prodeje', 'navrhy', 'slevy', 'faktury', 'platby', 'historie', 'gmail', 'duvody'],
    varovaniPrehledu(x, { historie: true, zdroje: ['navrhy', 'faktury', 'platby'], gmail: true, zakladJenKlienti: true }));
}

/** Vstup do aktuální fáze: status_changed_at, jinak milník fáze (zájem, návrh, nabídka); null = neznámý. */
function vstupDoFaze(c: Kontakt): string | null {
  if (c.status_changed_at) return c.status_changed_at;
  if (c.status === 'zajem') return callLog.filter((l) => l.kontakt_id === c.id && l.outcome === 'zajem').map((l) => l.created_at).sort().pop() ?? null;
  if (c.status === 'navrh_odeslan') return navrhAt(c);
  if (c.status === 'sleva_nabidnuta') return (slevy.get(c.id) ?? []).map((e) => e.created_at).sort().pop() ?? null;
  if (PRODANO_STAVY.includes(c.status) && c.status === 'schvaleno') return datumProdeje(c);
  return null;
}
const PASMA: PasmoStari[] = ['0-7', '8-14', '15-30', '31+'];
const pasmoDni = (d: number): PasmoStari => (d <= 7 ? '0-7' : d <= 14 ? '8-14' : d <= 30 ? '15-30' : '31+');
function starnuti(x: KontextPrehledu, cs: Kontakt[], vyber: Record<string, unknown>, metrika: string): Starnuti {
  const dny = cs.map((c) => { const v = vstupDoFaze(c); return v && x.doKDatu(v) ? dniOd(v, x.kMs) : null; });
  const zname = dny.filter((d): d is number => d !== null);
  return {
    pasma: PASMA.map((p) => ({ pasmo: p, n: zname.filter((d) => pasmoDni(d) === p).length, proklik: { zdroj: 'kontakty', filtr: { ...x.f, vyber: { metrika, ...vyber, pasmo: p } } } })),
    median_d: zname.length ? zaokr(percentil(zname, 0.5)!, 1) : null,
    p90_d: zname.length ? zaokr(percentil(zname, 0.9)!, 1) : null,
    nezname_n: dny.length - zname.length,
    celkova_doba: { median_d: null, p90_d: null, n: null, kvalita: 'nedostupne', duvod: 'Celkový čas ve fázi přes opakované vstupy je jen z historie změn stavů, která období ještě nepokrývá.' },
  };
}
/** Kontakty se zájmem v období (první zájmový hovor v období, lide = kdo ho zapsal). */
const zajemVObdobi = (x: KontextPrehledu): { c: Kontakt; at: string }[] => kontakty.flatMap((c) => {
  const prvni = callLog.filter((l) => l.kontakt_id === c.id && l.outcome === 'zajem').sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)[0];
  return prvni && x.vObdobi(prvni.created_at) && x.sedi(c) && x.lidi(prvni.user_id) ? [{ c, at: prvni.created_at }] : [];
});
/** Nabídky za polovinu: první sleva_odeslana v období. */
const slevyVObdobi = (x: KontextPrehledu): { c: Kontakt; at: string; detail: string }[] => kontakty.flatMap((c) => {
  const prvni = (slevy.get(c.id) ?? []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  return prvni && x.vObdobi(prvni.created_at) && x.sedi(c) && x.lidi(x.osoba(c)) ? [{ c, at: prvni.created_at, detail: prvni.detail }] : [];
});
const prodanPo = (c: Kontakt, iso: string, kMs: number): boolean => PRODANO_STAVY.includes(c.status) && datumProdeje(c) >= iso && Date.parse(datumProdeje(c)) <= kMs;
/** Kohorty měsíců prvního hovoru, které období zasahuje (§5.6). */
function kohortyMesicu(x: KontextPrehledu): { mesic: string; cs: { c: Kontakt; prvni: string }[] }[] {
  const out: { mesic: string; cs: { c: Kontakt; prvni: string }[] }[] = [];
  for (let m = x.f.od.slice(0, 7); m <= x.f.do.slice(0, 7); m = posunDen(`${m}-28`, 4).slice(0, 7)) {
    const cs = kontakty.flatMap((c) => {
      const prvni = callLog.filter((l) => l.kontakt_id === c.id && x.doKDatu(l.created_at)).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)[0];
      return prvni && denPraha(new Date(prvni.created_at)).slice(0, 7) === m && x.sedi(c) && x.lidi(prvni.user_id) ? [{ c, prvni: prvni.created_at }] : [];
    });
    out.push({ mesic: m, cs });
  }
  return out;
}
/**
 * Kandidáti mostu otevřené pipeline (073 app_prehled_pohyby, jeden zdroj pro most i jeho řádky): stav na začátku období (od 0:00)
 * a na konci (do+1 0:00, nejvýš k_datu) z historie stavů (stavKDatu), skupina obou stavů a příznak otevřený; jen otevření na
 * začátku, na konci nebo uvnitř období (průchozí), segment, obor a kraj, lidé podle atribuce (úkol 14c).
 */
function kandidatiMostu(x: KontextPrehledu): { c: Kontakt; s0: KontaktStatus | null; s1: KontaktStatus | null; g0: SkupinaStavu | null; g1: SkupinaStavu | null; o0: boolean; o1: boolean }[] {
  const t0 = x.odMs;
  const t1 = Math.min(x.doMs, x.kMs);
  const otevreny = (s: KontaktStatus | null) => !!s && skupinaStavu(s) === 'otevrene';
  return kontakty.flatMap((c) => {
    const vHistorii = HISTORIE_STAVU.filter((h) => h.kontakt_id === c.id);
    if (!otevreny(c.status) && !vHistorii.some((h) => otevreny(h.nova) || otevreny(h.stara))) return [];
    const s0 = stavKDatu(c, t0);
    const s1 = stavKDatu(c, t1);
    const o0 = otevreny(s0);
    const o1 = otevreny(s1);
    const uvnitr = vHistorii.some((h) => { const t = Date.parse(h.at); return t > t0 && t < t1 && otevreny(h.nova); });
    if (!(o0 || o1 || uvnitr) || !x.sedi(c) || !x.lidi(x.osoba(c))) return [];
    return [{ c, s0, s1, g0: s0 ? skupinaStavu(s0) : null, g1: s1 ? skupinaStavu(s1) : null, o0, o1 }];
  });
}
/**
 * Most otevřené pipeline (Pavel §12.18, kontrakt §5.6 a §9 5a bod 8; 073 app_prehled_pipeline; úkol 14c, ⚠ NAHRAZUJE „vždy
 * nedostupné“): období před začátkem historie nedostupne („Historie změn stavů začíná …; most pipeline je dostupný pro období od
 * toho dne.“); jinak nové (z žádného stavu nebo z fronty), znovu otevřené (z jiné neotevřené skupiny než fronta: prodané, ztracené,
 * archiv, vyřazené), vyhrané, ztracené, vyřazené (archiv, vyřazené, zpět ve frontě) a průchozí; hodnoty podle pravidla výdělku
 * k oběma okamžikům, neznámé ceny jen v pokrytí (castecne s větou 073).
 */
function mostPipeline(x: KontextPrehledu): DataPipeline['pohyby'] {
  if (x.odMs < Date.parse(PREHLED_HISTORIE_OD)) {
    const prazdny = { n: null, castky: [] };
    return { kvalita: 'nedostupne', duvod: `Historie změn stavů začíná ${denCesky(PREHLED_HISTORIE_OD)}; most pipeline je dostupný pro období od toho dne.`,
      pocatek: prazdny, nove: null, znovu_otevrene: null, vyhrane: null, ztracene: null, vyrazene: null, zmena_hodnoty: [], prirustek_hodnoty: [], ubytek_hodnoty: [],
      konec: prazdny, pruchozi: null };
  }
  const t0 = new Date(x.odMs).toISOString();
  const t1 = new Date(Math.min(x.doMs, x.kMs)).toISOString();
  const k = kandidatiMostu(x).map((r) => ({ ...r, c0: r.o0 ? cenaKontaktu(r.c, t0) : null, c1: r.o1 ? cenaKontaktu(r.c, t1) : null }));
  const pol = (c: CenaKontaktu | null): PolozkaPenez => ({ castka: c?.castka ?? null, mena: c?.mena ?? null, stav: c?.rozbor.stav ?? 'nezname' });
  const zmena: PolozkaPenez[] = k.filter((r) => r.o0 && r.o1).map((r) => (r.c0!.castka !== null && r.c1!.castka !== null && r.c0!.mena === r.c1!.mena
    ? { castka: zaokr(r.c1!.castka - r.c0!.castka, 2), mena: r.c1!.mena } : { castka: null, mena: r.c0!.mena === r.c1!.mena ? r.c1!.mena : null, stav: 'nezname' as const }));
  const neznamych = k.filter((r) => (r.o0 && r.c0!.castka === null) || (r.o1 && r.c1!.castka === null)).length;
  const klientu = k.filter((r) => r.o0 || r.o1).length;
  const most: DataPipeline['pohyby'] = {
    kvalita: neznamych > 0 ? 'castecne' : 'dostupne',
    duvod: neznamych > 0 ? `U ${zN(neznamych, klientu, 'klienta', 'klientů')} není přesná cena; hodnoty mostu jsou jen ze známých cen.` : null,
    pocatek: { n: k.filter((r) => r.o0).length, castky: castkyZ(k.filter((r) => r.o0).map((r) => pol(r.c0)), x.meny) },
    nove: k.filter((r) => r.o1 && !r.o0 && (r.s0 === null || r.g0 === 'fronta')).length,
    znovu_otevrene: k.filter((r) => r.o1 && !r.o0 && r.s0 !== null && r.g0 !== 'fronta').length,
    vyhrane: k.filter((r) => r.o0 && r.g1 === 'prodano').length,
    ztracene: k.filter((r) => r.o0 && r.g1 === 'ztraceno').length,
    vyrazene: k.filter((r) => r.o0 && !r.o1 && r.g1 !== 'prodano' && r.g1 !== 'ztraceno').length,
    zmena_hodnoty: castkyZ(zmena, x.meny),
    prirustek_hodnoty: castkyZ(k.filter((r) => r.o1 && !r.o0).map((r) => pol(r.c1)), x.meny),
    ubytek_hodnoty: castkyZ(k.filter((r) => r.o0 && !r.o1).map((r) => pol(r.c0)), x.meny),
    konec: { n: k.filter((r) => r.o1).length, castky: castkyZ(k.filter((r) => r.o1).map((r) => pol(r.c1)), x.meny) },
    pruchozi: k.filter((r) => !r.o0 && !r.o1).length,
  };
  return sDalsimDuvodem(most, dimKDatu(x.f).duvod);
}
/** prehled_pipeline (§5.6). */
function prehledPipelineMock(me: MockUser, vstup: unknown): PrehledObalka<DataPipeline> {
  const x = kontextPrehledu(me, vstup);
  const neznamy = stavNeznamy(x);
  const otevrene = neznamy ? [] : otevreneKDatu(x);
  const faze = neznamy ? [] : OTEVRENE_STAVY.map((s) => {
    const o = otevrene.filter((j) => j.c.status === s);
    return { status: s, nazev: nazevStavu(s), n: o.length, castky: castkyZ(o.map((j) => ({ castka: j.cena.castka, mena: j.cena.mena })), x.meny),
      nezname_n: o.filter((j) => j.cena.castka === null).length, starnuti: starnuti(x, o.map((j) => j.c), { status: s }, 'pipeline_faze'),
      proklik: { zdroj: 'kontakty', filtr: { ...x.f, vyber: { metrika: 'pipeline_faze', status: s } } } };
  });
  const zajmy = zajemVObdobi(x);
  const zmerene: number[] = [];
  let cenzurovano = 0;
  for (const z of zajmy) {
    const n = navrhAt(z.c);
    if (n && x.doKDatu(n) && n >= z.at) zmerene.push(zaokr((Date.parse(n) - Date.parse(z.at)) / 86400000, 1));
    else cenzurovano += 1;
  }
  const slevyO = slevyVObdobi(x);
  const prijato = slevyO.filter((s) => prodanPo(s.c, s.at, x.kMs)).length;
  const otevreneSlevy = slevyO.filter((s) => !prodanPo(s.c, s.at, x.kMs) && !ztrataAt(s.c)).length;
  const ceny = new Map<MenaPrehledu, { mena: MenaPrehledu; puvodni: number; nabidnuta: number; n: number }>();
  for (const s of slevyO) {
    const nabidnuta = cenaRozborMock(cenaZeSlevy(s.detail));
    const puvodni = cenaRozborMock(s.c.cena_web);
    if (nabidnuta.stav === 'presne' && puvodni.stav === 'presne' && nabidnuta.mena === puvodni.mena && nabidnuta.mena) {
      const r = ceny.get(nabidnuta.mena) ?? { mena: nabidnuta.mena, puvodni: 0, nabidnuta: 0, n: 0 };
      r.puvodni += Number(puvodni.castka);
      r.nabidnuta += Number(nabidnuta.castka);
      r.n += 1;
      ceny.set(nabidnuta.mena, r);
    }
  }
  const kohorty = kohortyMesicu(x);
  const zralost = (mesic: string) => {
    const konec = posledniDenMesice(`${mesic}-01`);
    const kDen = denPraha(new Date(x.kMs));
    return Math.max(0, Math.round((zacatekDnePraha(kDen) - zacatekDnePraha(konec < kDen ? konec : `${mesic}-01`)) / 86400000));
  };
  const okno = kohorty.length ? Math.min(...kohorty.map((k) => zralost(k.mesic))) : 0;
  const vOkne = (prvni: string, iso: string | null) => !!iso && Date.parse(iso) - Date.parse(prvni) <= okno * 86400000;
  const hvezdy = kohortaPoNavrhu(x);
  const hvezdaPred = (c: Kontakt) => !!c.hvezda_at && x.doKDatu(c.hvezda_at) && (!PRODANO_STAVY.includes(c.status) || c.hvezda_at <= datumProdeje(c));
  const radekHvezdy = (cs: Kontakt[], hvezda: boolean) => {
    const prodano = cs.filter((c) => PRODANO_STAVY.includes(c.status) && x.doKDatu(datumProdeje(c))).length;
    return { n: cs.length, prodano, podil: cs.length === 0 ? null : zaokr(prodano / cs.length, 6), proklik: { zdroj: 'kontakty', filtr: { ...x.f, vyber: { metrika: 'kalibrace_hvezdy', hvezda } } } };
  };
  const data: DataPipeline = {
    faze,
    rychlost_navrhu: {
      median: trvaniMetrika('rychlost_navrhu_median', x, zmerene, cenzurovano, 0.5, 1, 'V období nikdo se zájmem nedostal návrh.'),
      p90: trvaniMetrika('rychlost_navrhu_p90', x, zmerene, cenzurovano, 0.9, 1, 'V období nikdo se zájmem nedostal návrh.'),
      cenzurovano,
    },
    slevy: {
      nabidnuto: pocetMetrika('slevy_nabidnuto', x, slevyO.length),
      prijato: pocetMetrika('slevy_prijato', x, prijato),
      mira_prijeti: podilMetrika('slevy_mira_prijeti', x, prijato, slevyO.length, slevyO.length, pokryti(slevyO.length - otevreneSlevy, slevyO.length),
        otevreneSlevy > 0 ? `${otevreneSlevy} ${zCelku(slevyO.length, 'nabídek')} ještě běží (neznámý výsledek).` : null),
      ceny: [...ceny.values()].map((r) => ({ mena: r.mena, puvodni: castkaText(r.puvodni), nabidnuta: castkaText(r.nabidnuta), n: r.n })),
    },
    kohorty: kohorty.map((k) => {
      const cs = k.cs;
      const m = (c: Kontakt) => milnikyKontaktu(x, c);
      return {
        mesic: k.mesic, n: cs.length, dovolano: cs.filter(({ c }) => m(c).dovolan).length, zajem: cs.filter(({ c }) => m(c).zajem).length, navrh: cs.filter(({ c }) => m(c).navrh).length,
        prodano: cs.filter(({ c }) => m(c).prodano).length, ztraceno: cs.filter(({ c }) => skupinaStavu(c.status) === 'ztraceno').length,
        otevrenych: cs.filter(({ c }) => skupinaStavu(c.status) === 'otevrene').length, zralost_dni: zralost(k.mesic),
        v_okne: { dni: okno, zajem: cs.filter(({ c, prvni }) => vOkne(prvni, m(c).zajem)).length, navrh: cs.filter(({ c, prvni }) => vOkne(prvni, m(c).navrh)).length,
          prodano: cs.filter(({ c, prvni }) => vOkne(prvni, m(c).prodano)).length },
        proklik: { zdroj: 'kontakty', filtr: { ...x.f, vyber: { metrika: 'kohorta_mesic', mesic: k.mesic } } },
      };
    }),
    kalibrace_znamky: (['A', 'B', 'C', 'bez'] as const).map((z) => {
      const cs = zajmy.filter((j) => (j.c.rating ?? 'bez') === z);
      const prodano = cs.filter((j) => prodanPo(j.c, j.at, x.kMs)).length;
      return { znamka: z, n: cs.length, prodano, podil: cs.length === 0 ? null : zaokr(prodano / cs.length, 6), proklik: { zdroj: 'kontakty', filtr: { ...x.f, vyber: { metrika: 'kalibrace_znamky', znamka: z } } } };
    }),
    kalibrace_hvezdy: { s_hvezdou: radekHvezdy(hvezdy.filter(hvezdaPred), true), bez_hvezdy: radekHvezdy(hvezdy.filter((c) => !hvezdaPred(c)), false) },
    pohyby: mostPipeline(x),
  };
  return obalkaPrehledu(x, data, ['hovory', 'kontakty', 'prodeje', 'navrhy', 'slevy', 'historie'], varovaniPrehledu(x, { historie: true, zdroje: ['navrhy', 'slevy'], zakladJenKlienti: true }));
}

/** Populace tabulky klientů podle základu (§5.7, R31). */
function populaceKlientu(x: KontextPrehledu): { cs: Kontakt[]; kohortove: boolean } {
  const z = x.f.zaklad;
  if (z === 'prirozeny') return { cs: kontakty.filter((c) => x.sedi(c)), kohortove: false };
  const ids = new Set<number>(
    z === 'aktivita' ? hovoryV(x).map((l) => l.kontakt_id)
      : z === 'prodej' ? prodejeV(x).map((p) => p.c.id)
        : z === 'faktura' ? fakturyV(x).map((f) => f.c.id)
          : platbyV(x).map((p) => p.c.id),
  );
  return { cs: kontakty.filter((c) => ids.has(c.id) && x.sedi(c)), kohortove: true };
}
function radekDimenze(x: KontextPrehledu, klic: string, nazev: string, cs: Kontakt[], kohortove: boolean, vyber: Record<string, unknown>): RadekDimenze {
  const ids = new Set(cs.map((c) => c.id));
  const hovory = (kohortove ? callLog.filter((l) => x.doKDatu(l.created_at)) : hovoryV(x)).filter((l) => ids.has(l.kontakt_id) && x.lidi(l.user_id));
  const prvniV = (c: Kontakt) => {
    const p = callLog.filter((l) => l.kontakt_id === c.id).sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    return !!p && (kohortove ? x.doKDatu(p.created_at) : x.vObdobi(p.created_at)) && x.lidi(p.user_id);
  };
  const prodeje = (kohortove ? prodejeV(x, -Infinity, Infinity) : prodejeV(x)).filter((p) => ids.has(p.c.id));
  return {
    klic, nazev, kontakty: cs.length, osloveno: cs.filter(prvniV).length,
    dovolano: new Set(hovory.filter((l) => l.outcome !== 'nedovolano').map((l) => l.kontakt_id)).size,
    zajem: new Set(hovory.filter((l) => l.outcome === 'zajem').map((l) => l.kontakt_id)).size,
    navrhy: cs.filter((c) => (kohortove ? x.doKDatu(navrhAt(c)) : x.vObdobi(navrhAt(c))) && x.lidi(x.osoba(c))).length,
    prodano: prodeje.length, hodnota: castkyZ(prodeje.map((p) => ({ castka: p.cena.castka, mena: p.cena.mena })), x.meny),
    proklik: { zdroj: 'kontakty', filtr: { ...x.f, vyber } },
  };
}
/** prehled_klienti (§5.7). */
function prehledKlientiMock(me: MockUser, vstup: unknown): PrehledObalka<DataKlienti> {
  const x = kontextPrehledu(me, vstup);
  const { cs, kohortove } = populaceKlientu(x);
  const segmenty = [...new Set(cs.map((c) => segmentOf(c)))];
  const poradiSegmentu = (s: string) => (s === 'chata' ? 0 : s === 'architekt' ? 1 : 2 + (oborNikyMock.find((n) => n.klic === s)?.poradi ?? 99));
  const nazevSegmentu = (s: string) => (s === 'chata' ? 'Chaty' : s === 'architekt' ? 'Architekti' : oborNikyMock.find((n) => n.klic === s)?.nazev ?? s);
  const podleOboru = new Map<string, Kontakt[]>();
  for (const c of cs) {
    const m = /^([^:]+):\s*(.*)$/.exec(c.obor ?? '');
    if (!m) continue;
    for (const s of m[2].split(',').map((v) => v.trim()).filter(Boolean)) podleOboru.set(`${m[1].trim()}: ${s}`, [...(podleOboru.get(`${m[1].trim()}: ${s}`) ?? []), c]);
  }
  const prodeje = prodejeV(x);
  const meny1 = x.f.mena === 'obe' ? null : x.f.mena;
  const koncentrace = (klic: 'koncentrace_top1' | 'koncentrace_top5', kolik: number): Metrika => {
    if (!meny1) return nedostupnaMetrika(klic, x, 'Koncentrace se počítá jen pro jednu měnu; vyberte CZK nebo EUR.');
    const v = prodeje.filter((p) => p.cena.castka !== null && p.cena.mena === meny1).map((p) => p.cena.castka!).sort((a, b) => b - a);
    const celkem = zaokr(v.reduce((a, b) => a + b, 0), 2);
    const nezname = prodeje.filter((p) => p.cena.castka === null).length;
    return podilMetrika(klic, x, zaokr(v.slice(0, kolik).reduce((a, b) => a + b, 0), 2), celkem, prodeje.length, pokryti(prodeje.length - nezname, prodeje.length),
      nezname > 0 ? `U ${zN(nezname, prodeje.length, 'prodeje', 'prodejů')} není přesná cena; podíl je jen ze známých cen.` : null);
  };
  const firmy = cs.filter((c) => rodinaOf(segmentOf(c)) === 'obor');
  // ⚠ Úkol 14c (073 app_prehled_klienti, §9 5a bod 11 a 5b čtení 9): stav k datu před historií = tabulky [] a koncentrace nedostupne
  // (HISTORIE_OD); se zadaným k_datu hodnocení webu a šablony [] (web_hodnoceni ani odpovědi se nehistorizují, řádky kvalitu nemají;
  // K_DATU_MINULOST z filtru), popis šablon zůstává (NAHRAZUJE hodnocení webu podle dnešní známky i k datu)
  if (stavNeznamy(x)) {
    const hist = historieText();
    return obalkaPrehledu(x, { zaklad: x.f.zaklad, podle_segmentu: [], podle_oboru: [], podle_kraje: [], hodnoceni_webu: [],
      koncentrace: { top1: nedostupnaMetrika('koncentrace_top1', x, hist), top5: nedostupnaMetrika('koncentrace_top5', x, hist) },
      sablony: { popis: 'Pozorování, ne důkaz účinku šablony.', radky: [] } }, ['hovory', 'kontakty', 'prodeje', 'navrhy', 'slevy'],
    varovaniPrehledu(x, { historie: 'k_datu', zdroje: ['hovory', 'navrhy'] }));
  }
  const data: DataKlienti = {
    zaklad: x.f.zaklad,
    podle_segmentu: segmenty.sort((a, b) => poradiSegmentu(a) - poradiSegmentu(b)).map((s) => radekDimenze(x, s, nazevSegmentu(s), cs.filter((c) => segmentOf(c) === s), kohortove, { metrika: 'klienti_segment', segment: s })),
    podle_oboru: [...podleOboru.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([klic, v]) => radekDimenze(x, klic, klic.split(': ')[1] ?? klic, v, kohortove, { metrika: 'klienti_obor', obor: klic })),
    podle_kraje: cs.length ? [radekDimenze(x, 'neznamy', 'Neznámý kraj', cs, kohortove, { metrika: 'klienti_kraj', kraj: 'neznamy' })] : [],
    hodnoceni_webu: x.f.k_datu ? [] : (['A', 'B', 'C', 'D', 'E', 'F', 'bez'] as const).map((z) => {
      const v = firmy.filter((c) => (c.web_hodnoceni ?? 'bez') === z);
      const r = radekDimenze(x, z, z, v, kohortove, { metrika: 'hodnoceni_webu', znamka: z });
      return { znamka: z, kontakty: r.kontakty, osloveno: r.osloveno, zajem: r.zajem, navrhy: r.navrhy, prodano: r.prodano, proklik: r.proklik };
    }),
    koncentrace: { top1: koncentrace('koncentrace_top1', 1), top5: koncentrace('koncentrace_top5', 5) },
    sablony: { popis: 'Pozorování, ne důkaz účinku šablony.', radky: [] },
  };
  // ZDROJ_OD hovorů a návrhů jako 073 (úkol 14c, ⚠ NAHRAZUJE návrhy a prodeje: prodeje jsou stav kontaktu bez začátku)
  return obalkaPrehledu(x, data, ['hovory', 'kontakty', 'prodeje', 'navrhy', 'slevy'], varovaniPrehledu(x, { historie: 'k_datu', zdroje: ['hovory', 'navrhy'] }));
}

/** Čekání (§5.8): na nás = klient psal poslední, na klienta = my; jen otevření a jen pro teď. */
function cekaniJednotky(x: KontextPrehledu, kdo: 'na_nas' | 'na_klienta'): { c: Kontakt; od: string }[] {
  return kontakty.flatMap((c) => {
    if (!OTEVRENE_STAVY.includes(c.status) || !x.sedi(c) || !x.lidi(x.osoba(c))) return [];
    const klient = casMs(c.last_client_reply_at);
    const nase = casMs(c.last_our_reply_at);
    if (kdo === 'na_nas') return klient !== null && (nase === null || klient > nase) ? [{ c, od: c.last_client_reply_at! }] : [];
    return nase !== null && (klient === null || nase > klient) ? [{ c, od: c.last_our_reply_at! }] : [];
  });
}
function skupinaCekani(x: KontextPrehledu, kdo: 'na_nas' | 'na_klienta'): SkupinaCekani {
  if (x.f.k_datu) return { n: null, median_d: null, p90_d: null, nad_limit: null, kvalita: 'nedostupne', duvod: JEN_DNES, proklik: null };
  const j = cekaniJednotky(x, kdo);
  const dny = j.map((u) => zaokr((Date.now() - Date.parse(u.od)) / 86400000, 1));
  const nad = kdo === 'na_nas' ? j.filter((u) => Date.now() - Date.parse(u.od) > 24 * HODINA_MS).length : j.filter((u) => (mlciPd(u.c) ?? 0) >= 5).length;
  return { n: j.length, median_d: dny.length ? zaokr(percentil(dny, 0.5)!, 1) : null, p90_d: dny.length ? zaokr(percentil(dny, 0.9)!, 1) : null, nad_limit: nad, kvalita: 'dostupne',
    duvod: j.length === 0 ? 'Nikdo nečeká.' : null, proklik: { zdroj: 'kontakty', filtr: { ...x.f, vyber: { metrika: kdo === 'na_nas' ? 'cekani_na_nas' : 'cekani_na_klienta' } } } };
}
/** Zprávy z Gmailu v období a ve filtru (nejasné jen bez lide, segmentu, oboru a kraje). */
const zpravyV = (x: KontextPrehledu): MockZprava[] => PREHLED_ZPRAVY.filter((z) => {
  if (!x.vObdobi(z.prijato_at)) return false;
  const c = kontaktPodleId(z.kontakt_id);
  if (!c) return !x.f.lide && !x.f.segment && !x.f.obor && !x.f.kraj;
  return x.sedi(c) && x.lidi(x.osoba(c));
});
/** Odpověděl po návrhu člověk (Gmail, jinak last_client_reply_at částečně). */
const odpovedelPoNavrhu = (c: Kontakt, kMs: number): boolean => {
  const n = navrhAt(c) ?? '';
  return PREHLED_ZPRAVY.some((z) => z.kontakt_id === c.id && z.smer === 'prichozi' && z.druh === 'clovek' && z.prijato_at > n && Date.parse(z.prijato_at) <= kMs)
    || (!!c.last_client_reply_at && c.last_client_reply_at > n && Date.parse(c.last_client_reply_at) <= kMs);
};
/** Odvozené výsledky a důvody (§5.8, D8): řádky zdroje odmitnuti. */
interface JednotkaOdmitnuti { radek_id: string; c: Kontakt; faze: FazeOdmitnuti | null; duvod: DuvodRadku; text: string | null; zdroj: RadekOdmitnuti['zdroj_zapisu']; zapsal: string | null; at: string }
function odmitnutiJednotky(x: KontextPrehledu, co: 'duvody' | 'nereagoval_na_nabidku' | 'mlci_po_navrhu' | 'ztraty_bez_duvodu' | 'vse'): JednotkaOdmitnuti[] {
  const out: JednotkaOdmitnuti[] = [];
  const duvody = duvodyRadky();
  if (co === 'duvody' || co === 'vse') {
    for (const d of duvody) {
      const c = kontaktPodleId(d.kontakt_id);
      if (!c || !x.vObdobi(d.at) || !x.sedi(c) || !x.lidi(x.osoba(c))) continue;
      out.push({ radek_id: `o:${d.id}`, c, faze: d.faze, duvod: d.duvod, text: d.text, zdroj: d.zdroj, zapsal: d.zapsal, at: d.at });
    }
  }
  if ((co === 'mlci_po_navrhu' || co === 'vse') && !x.f.k_datu) {
    for (const c of kontakty) {
      if (!OTEVRENE_STAVY.includes(c.status) || !navrhAt(c) || (mlciPd(c) ?? 0) < 5 || !x.sedi(c) || !x.lidi(x.osoba(c))) continue;
      out.push({ radek_id: `m:${c.id}`, c, faze: null, duvod: 'mlci_po_navrhu', text: null, zdroj: null, zapsal: null, at: c.last_our_reply_at ?? navrhAt(c)! });
    }
  }
  if (co === 'ztraty_bez_duvodu' || co === 'vse') {
    for (const u of uzavreneV(x).filter((j) => !j.vyhra)) {
      if (duvody.some((d) => d.kontakt_id === u.c.id)) continue;
      out.push({ radek_id: `b:${u.c.id}`, c: u.c, faze: null, duvod: 'bez_duvodu', text: null, zdroj: null, zapsal: null, at: u.at });
    }
  }
  return out;
}
const NAZVY_DUVODU: Record<DuvodRadku, string> = {
  ...Object.fromEntries(DUVODY_ODMITNUTI.map((d) => [d.kod, d.text])) as Record<DuvodOdmitnutiKod, string>,
  nereagoval_na_nabidku: 'Nereagoval ani na nabídku za polovinu',
  mlci_po_navrhu: 'Mlčí po návrhu',
  bez_duvodu: 'Důvod nezapsán',
};
/** prehled_komunikace (§5.8). */
function prehledKomunikaceMock(me: MockUser, vstup: unknown): PrehledObalka<DataKomunikace> {
  const x = kontextPrehledu(me, vstup);
  const sync = PREHLED_EMAIL_SYNC[0];
  const gmailChybi = !sync?.posledni_uspech;
  const zpravy = zpravyV(x);
  const pocty = (smer: 'prichozi' | 'odchozi') => Object.fromEntries((['clovek', 'automaticka_odpoved', 'nedoruceno', 'systemova', 'nezname'] as const)
    .map((d) => [d, gmailChybi ? null : zpravy.filter((z) => z.smer === smer && z.druh === d).length])) as PoctyDruhu;
  const navrhyO = kohortaPoNavrhu(x);
  const odpovedeli = navrhyO.filter((c) => odpovedelPoNavrhu(c, x.kMs)).length;
  const predGmailem = navrhyO.filter((c) => (navrhAt(c) ?? '') < GMAIL_OD).length;
  const duvodyZ = rozsahZdroje('duvody', x.kZdroje);
  const duvody = odmitnutiJednotky(x, 'duvody');
  const celkemN = duvody.filter((d) => d.faze === 'nahled').length;
  const celkemS = duvody.filter((d) => d.faze === 'sleva').length;
  const bezDuvodu = odmitnutiJednotky(x, 'ztraty_bez_duvodu');
  const souhrn = [...DUVODY_ODMITNUTI.map((d) => d.kod as DuvodRadku), 'bez_duvodu' as DuvodRadku].map((kod) => {
    const v = kod === 'bez_duvodu' ? bezDuvodu : duvody.filter((d) => d.duvod === kod);
    const nahled = v.filter((d) => d.faze === 'nahled').length;
    const sleva = v.filter((d) => d.faze === 'sleva').length;
    const celkem = v.length;
    return { duvod: kod, nazev: NAZVY_DUVODU[kod], nahled, sleva, celkem, podil: celkemN + celkemS === 0 ? null : zaokr(celkem / (celkemN + celkemS), 6),
      proklik: { zdroj: 'odmitnuti', filtr: { ...x.f, vyber: kod === 'bez_duvodu' ? { metrika: 'ztraty_bez_duvodu' } : { metrika: 'duvody', duvod: kod } } } };
  });
  const bunky = new Map<string, { duvod: DuvodRadku; faze: FazeOdmitnuti; segment: string; user_id: number | null; n: number }>();
  for (const d of duvody) {
    if (!d.faze) continue;
    const uid = x.osoba(d.c);
    const k = `${d.duvod}|${d.faze}|${segmentOf(d.c)}|${uid}`;
    const b = bunky.get(k) ?? { duvod: d.duvod, faze: d.faze, segment: segmentOf(d.c), user_id: uid, n: 0 };
    b.n += 1;
    bunky.set(k, b);
  }
  const gmailMetrika = (klic: string, n: number) => (gmailChybi ? nedostupnaMetrika(klic, x, 'Zprávy z Gmailu se zatím nesynchronizují.') : pocetMetrika(klic, x, n));
  const data: DataKomunikace = {
    cekani: { na_nas: skupinaCekani(x, 'na_nas'), na_klienta: skupinaCekani(x, 'na_klienta') },
    zpravy: {
      kvalita: gmailChybi ? 'nedostupne' : 'dostupne', duvod: gmailChybi ? 'Zprávy z Gmailu se zatím nesynchronizují.' : null,
      prichozi: pocty('prichozi'), odchozi: pocty('odchozi'),
      nedoruceno: gmailMetrika('zpravy_nedoruceno', zpravy.filter((z) => z.druh === 'nedoruceno').length),
      automaticke: gmailMetrika('zpravy_automaticke', zpravy.filter((z) => z.druh === 'automaticka_odpoved').length),
      // 073 app_prehled_komunikace (úkol 14c): k datu nedostupne (poslední odpověď se nehistorizuje, §9 5a bod 12); návrhy z doby
      // před synchronizací Gmailu podle posledních odpovědí; nejasné vazby s filtrem lidí nebo klientů nedostupne (⚠ NAHRAZUJE
      // výpočet k datu, ZDROJ_OD Gmailu a nejasné vazby s filtrem)
      mira_odpovedi_po_navrhu: x.f.k_datu ? nedostupnaMetrika('mira_odpovedi_po_navrhu', x, ODPOVED_JEN_DNES)
        : podilMetrika('mira_odpovedi_po_navrhu', x, odpovedeli, navrhyO.length, navrhyO.length, pokryti(navrhyO.length, navrhyO.length),
          gmailChybi && navrhyO.length > 0 ? 'Gmail se zatím nesynchronizuje; podle posledních odpovědí klientů.'
            : predGmailem > 0 ? `U ${zN(predGmailem, navrhyO.length, 'návrhu', 'návrhů')} z doby před synchronizací Gmailu je odpověď podle posledních odpovědí klientů.` : null),
      nejasne_vazby: x.f.lide || filtrKlientu(x.f) ? nedostupnaMetrika('nejasne_vazby', x, 'Nejasně přiřazené zprávy nemají klienta; s filtrem lidí nebo klientů se nepočítají.')
        : gmailMetrika('nejasne_vazby', zpravy.filter((z) => z.vazba === 'nejasne').length),
    },
    duvody: {
      celkem_nahled: celkemN, celkem_sleva: celkemS, souhrn, radky: [...bunky.values()],
      nereagoval_na_nabidku: pocetMetrika('nereagoval_na_nabidku', x, 0, zdrojPozdeji(x, ['slevy'])),
      mlci_po_navrhu: x.f.k_datu ? nedostupnaMetrika('mlci_po_navrhu', x, JEN_DNES) : pocetMetrika('mlci_po_navrhu', x, odmitnutiJednotky(x, 'mlci_po_navrhu').length),
      // ztráty bez důvodu (073, §9 5a bod 13; úkol 14c): stav k datu před historií nedostupne; jinak castecne, když důvody nikdo
      // nezapsal nebo se zapisují až od začátku zdroje, a když období začíná před historií (věta HISTORIE_OD a „Ztráty před ní se
      // datují podle událostí a poslední změny stavu.“, varování HISTORIE_OD)
      bez_duvodu: stavNeznamy(x) ? nedostupnaMetrika('ztraty_bez_duvodu', x, historieText()) : pocetMetrika('ztraty_bez_duvodu', x, bezDuvodu.length, [
        duvodyZ.od === null && duvodyZ.aktualni_k === null ? 'Důvody odmítnutí zatím nikdo nezapsal; ztráty důvod nemají.'
          : duvodyZ.od && x.odMs < Date.parse(duvodyZ.od) ? `Důvody odmítnutí se zapisují od ${denCesky(duvodyZ.od)}; ztráty před tím důvod nemají.` : null,
        x.odMs < Date.parse(PREHLED_HISTORIE_OD) ? `${historieText()} Ztráty před ní se datují podle událostí a poslední změny stavu.` : null,
      ].filter(Boolean).join(' ') || null),
    },
  };
  return obalkaPrehledu(x, data, ['kontakty', 'navrhy', 'slevy', 'historie', 'gmail', 'duvody'], varovaniPrehledu(x, { historie: true, gmail: true, zdroje: ['navrhy', 'gmail', 'duvody'] }));
}

/** Obnovy hostingu: poslední platba + 1 rok, splatné do 60 dní po k_datu nebo po splatnosti (§5.9). */
function obnovyHostingu(x: KontextPrehledu): ObnovaHostingu[] {
  const platby = platbyDoKDatu(x);
  return kontakty.filter((c) => PRODANO_STAVY.includes(c.status) && x.sedi(c) && x.lidi(x.osoba(c))).flatMap((c) => {
    const posledni = platby.filter((p) => p.c.id === c.id).map((p) => p.at).sort().pop();
    if (!posledni) return [];
    const splatnost = posunDen(denPraha(new Date(posledni)), 365);
    if (zacatekDnePraha(splatnost) - x.kMs > 60 * 86400000) return [];
    const h = hostingRozbor(c.cena_hosting);
    return [{ kontakt_id: c.id, jmeno: jmenoKontaktu(c), zaplaceno_at: posledni, splatnost, castka: h.castka, mena: h.mena }];
  });
}
/**
 * prehled_finance (§5.9). ⚠ Úkol 14c (parita s 073 app_prehled_finance; NAHRAZUJE věty a pravidla úkolů 13 a 14b): věty důvodů
 * doslova jako 073 (app_prehled_m_penize „U a z n <jednotek> <věta>“, app_prehled_veta), stav k datu před historií = metriky
 * stavu nedostupne s větou HISTORIE_OD, faktury s ZDROJ_OD nebo prázdným zdrojem, pohledávky odeslané před začátkem plateb
 * castecne (5a bod 15), nabídky a výplaty s ZDROJ_OD svého zdroje (5a bod 18), hosting ARR = součet přesných ročních cen a MRR =
 * ARR ÷ 12 (5a bod 16), kategorie s ověřováním „U a z n nákladů čeká částka na ověření.“ a NAKLADY_OVERIT = řádky nákladů
 * s overit zaúčtované v období a platné k datu (5a bod 17), náklady celkem a výsledek jako 073.
 */
function prehledFinanceMock(me: MockUser, vstup: unknown): PrehledObalka<DataFinance> {
  const x = kontextPrehledu(me, vstup);
  const znamy = !stavNeznamy(x);
  const hist = historieText();
  const filtr = nakladyFiltrovane(x);
  const zdroj = (z: ZdrojKlicPrehledu) => rozsahZdroje(z, x.kZdroje);
  const chybi = (z: ZdrojKlicPrehledu) => { const r = zdroj(z); return r.od === null && r.aktualni_k === null; };
  const pred = (z: ZdrojKlicPrehledu): string | null => { const od = zdroj(z).od; return od && x.odMs < Date.parse(od) ? zdrojOdText(z, od) : null; };
  const prodeje = prodejeV(x);
  const faktury = fakturyV(x);
  const platby = platbyV(x);
  const pohledavky = pohledavkyKDatu(x);
  const slevyO = slevyVObdobi(x);
  // faktury: období před začátkem zdroje = ZDROJ_OD, prázdný zdroj = „Zdroj „Faktury“ zatím nemá žádná data.“
  const fakT = pred('faktury') ?? (chybi('faktury') ? 'Zdroj „Faktury“ zatím nemá žádná data.' : null);
  const castFaktury = (klic: string, cast: 'web' | 'hosting' | 'celkem', veta: string) =>
    penizeMetrika(klic, x, faktury.map((f) => ({ castka: f.r[cast], mena: f.r.mena, stav: f.r[cast] === null ? 'nezname' as const : 'presne' as const })), 'faktury', 'faktur', veta, fakT);
  // pohledávky: faktura odeslaná před začátkem zdroje plateb (bez záznamu platby) je nezaplacená jen přibližně (5a bod 15)
  const platbyOd = zdroj('platby').od;
  const plT = pohledavky.some((f) => platbyOd === null || f.e.at < platbyOd)
    ? (platbyOd === null ? 'Platby zatím nikdo nezapsal; nezaplacená faktura mohla být zaplacena.' : `Platby evidujeme od ${denCesky(platbyOd)}; starší faktura mohla být zaplacena dřív.`) : null;
  // provize (D10, vždy poslední zájem): nárok v období, vyplaceno v období, zbývá = nárok do konce období − výplaty do konce období
  const provizeObdobi = provizeJednotky(x, x.odMs, x.f.od);
  const narok = provizeObdobi.filter((p) => p.druh === 'narok');
  const vyplaty = provizeObdobi.filter((p) => p.druh === 'vyplata');
  const doKonce = provizeJednotky(x, -Infinity, '0000-01-01');
  const vyplatyOd = zdroj('vyplaty').od;
  const zbyvaPred = doKonce.some((p) => p.druh === 'narok' && (vyplatyOd === null || p.at < vyplatyOd));
  const zbyvaPolozky = doKonce.map((p) => ({ castka: p.castka === null ? null : p.druh === 'vyplata' ? -p.castka : p.castka, mena: p.mena, stav: p.stav_ceny }));
  // hosting: prodaní klienti k datu podle atribuce, roční cena z textu hostingu (5a bod 16)
  const sProdanymi = kontakty.filter((c) => PRODANO_STAVY.includes(c.status) && x.sedi(c) && Date.parse(datumProdeje(c)) <= x.kMs && x.lidi(x.osoba(c)));
  const hosting = sProdanymi.map((c) => ({ c, h: hostingRozbor(c.cena_hosting) }));
  const nHost = hosting.length;
  const nectene = hosting.filter(({ h }) => h.stav !== 'presne' && h.duvod !== 'obdobi').length;
  const obdobi = hosting.filter(({ h }) => h.duvod === 'obdobi').length;
  const hostDuvod = [nectene > 0 ? `Cena hostingu chybí, je „X“ nebo nejde přečíst u ${zN(nectene, nHost, 'prodaného klienta', 'prodaných klientů')}.` : null,
    obdobi > 0 ? `U ${zN(obdobi, nHost, 'prodaného klienta', 'prodaných klientů')} cena hostingu neuvádí roční období (hosting se účtuje ročně); do součtu se nepočítá.` : null]
    .filter(Boolean).join(' ') || null;
  const rocnePolozky = hosting.map(({ h }) => ({ castka: h.castka === null ? null : Number(h.castka), mena: h.mena }));
  // ročně a ARR = součet přesných ročních cen se stejným pokrytím a větou (důvod nahradí větu m_penize, 073), MRR = ARR ÷ 12 na 2 místa
  // ze stejného základu (filtr k datu se přidá až potom, jednou: metrikaPrehledu)
  const hostZname = rocnePolozky.filter((h) => h.castka !== null).length;
  const hostZaklad = { castky: castkyZ(rocnePolozky, x.meny), n: nHost, pokryti: pokryti(hostZname, nHost), kvalita: (hostZname < nHost ? 'castecne' : 'dostupne') as Metrika['kvalita'],
    duvod: hostZname < nHost ? hostDuvod : null };
  const rocneM = znamy ? metrikaPrehledu('hosting_rocne', x, hostZaklad) : nedostupnaMetrika('hosting_rocne', x, hist);
  const arr = znamy ? metrikaPrehledu('hosting_arr', x, hostZaklad) : nedostupnaMetrika('hosting_arr', x, hist);
  const mrr = znamy ? metrikaPrehledu('hosting_mrr', x, { ...hostZaklad, castky: hostZaklad.castky.map((c) => ({ ...c, hodnota: c.hodnota === null ? null : castkaText(Number(c.hodnota) / 12) })) })
    : nedostupnaMetrika('hosting_mrr', x, hist);
  // náklady (§2.12, D6): provize (nárok období) a kategorie evidence; s filtrem lidí nebo klientů evidence, celkem a výsledek nedostupne
  const evidence = PREHLED_NAKLADY.flatMap((n) => zauctovaniNakladu(n, x.f.od, x.f.do, x.kMs));
  const prazdne = kategorieBezNakladu(x.kMs);
  const narokPolozky = narok.map((p) => ({ castka: p.castka, mena: p.mena, stav: p.stav_ceny }));
  const kategorie = KATEGORIE_VYUCTOVANI.map((k) => {
    if (k.klic === 'provize') {
      return { kategorie: k.klic, nazev: k.nazev, overit: 0,
        castka: znamy ? penizeMetrika('naklady_provize', x, narokPolozky, 'prodeje', 'prodejů', PROVIZE_VETA) : nedostupnaMetrika('naklady_provize', x, hist) };
    }
    const v = evidence.filter((z) => z.kategorie === k.klic);
    const radky = new Set(v.map((z) => z.naklad_id));
    const overit = new Set(v.filter((z) => z.overit).map((z) => z.naklad_id)).size;
    const castka = filtr ? nedostupnaMetrika(`naklady_${k.klic}`, x, NAKLADY_BEZ_FILTRU)
      : penizeMetrika(`naklady_${k.klic}`, x, v.map((z) => ({ castka: z.castka, mena: z.mena })), 'nákladu', 'nákladů', 'není přesná částka.',
        [prazdne.some((b) => b.klic === k.klic) ? prazdnaKategorieText(k) : null,
          overit > 0 ? `U ${zN(overit, radky.size, 'nákladu', 'nákladů')} čeká částka na ověření.` : null].filter(Boolean).join(' ') || null);
    return { kategorie: k.klic, nazev: k.nazev, castka, overit };
  });
  const nakladyOverit = filtr ? 0 : new Set(evidence.filter((z) => z.overit).map((z) => z.naklad_id)).size;
  // pokrytí nákladů na klienta (jen se známým stavem k datu): doména u prodaných s připojenou doménou, hosting u prodaných s cenou
  const domenaKlienti = sProdanymi.filter((c) => c.status === 'domena_pripojena');
  const maNaklad = (kat: 'domena' | 'hosting', kid: number) => PREHLED_NAKLADY.some((n) => n.kategorie === kat && n.kontakt_id === kid && platiKDatu(n.zapsano_at, n.zruseno_at, x.kMs));
  const domenaZname = domenaKlienti.filter((c) => maNaklad('domena', c.id)).length;
  const hostingKlienti = hosting.filter(({ h }) => h.stav === 'presne');
  const hostingZname = hostingKlienti.filter(({ c }) => maNaklad('hosting', c.id)).length;
  const pokryti_nakladu: DataFinance['pokryti_nakladu'] = znamy ? [
    { kategorie: 'domena', zname: domenaZname, celkem: domenaKlienti.length, text: `doména zadána u ${zN(domenaZname, domenaKlienti.length, 'klienta s doménou', 'klientů s doménou')}` },
    { kategorie: 'hosting', zname: hostingZname, celkem: hostingKlienti.length, text: `hosting zadán u ${zN(hostingZname, hostingKlienti.length, 'klienta s hostingem', 'klientů s hostingem')}` },
  ] : [];
  const inkaso = inkasoMetrika(x, platby);
  let celkem: Metrika;
  let vysledek: Metrika;
  if (filtr) {
    celkem = nedostupnaMetrika('naklady_celkem', x, NAKLADY_BEZ_FILTRU);
    vysledek = nedostupnaMetrika('vysledek', x, NAKLADY_BEZ_FILTRU);
  } else if (!znamy) {
    celkem = nedostupnaMetrika('naklady_celkem', x, hist);
    vysledek = nedostupnaMetrika('vysledek', x, hist);
  } else {
    // každá neznámá částka patří některé kategorii: důvod celku = důvody neúplných kategorií a neúplné pokrytí na klienta (073)
    const neuplne = pokryti_nakladu.filter((p) => p.zname < p.celkem).map((p) => p.text).join('; ');
    const duvod = [...kategorie.filter((k) => k.castka.kvalita !== 'dostupne').map((k) => k.castka.duvod),
      neuplne ? `${neuplne.charAt(0).toUpperCase()}${neuplne.slice(1)}.` : null].filter(Boolean).join(' ') || null;
    const m = penizeMetrika('naklady_celkem', x, [...evidence.map((z) => ({ castka: z.castka, mena: z.mena })), ...narokPolozky], 'nákladu', 'nákladů', 'není přesná částka.');
    celkem = { ...m, kvalita: duvod ? 'castecne' : 'dostupne', duvod };
    const oba = inkaso.kvalita === 'dostupne' && celkem.kvalita === 'dostupne';
    vysledek = metrikaPrehledu('vysledek', x, {
      castky: x.meny.map((mena) => {
        const i = inkaso.castky.find((c) => c.mena === mena)!;
        const n = celkem.castky.find((c) => c.mena === mena)!;
        return { mena, hodnota: i.hodnota === null || n.hodnota === null ? null : castkaText(Number(i.hodnota) - Number(n.hodnota)),
          pokryti: pokryti(i.pokryti.zname + n.pokryti.zname, i.pokryti.celkem + n.pokryti.celkem) };
      }),
      n: (inkaso.n ?? 0) + (celkem.n ?? 0), pokryti: pokryti((inkaso.pokryti?.zname ?? 0) + (celkem.pokryti?.zname ?? 0), (inkaso.n ?? 0) + (celkem.n ?? 0)),
      kvalita: oba ? 'dostupne' : 'castecne', duvod: oba ? null : 'Náklady nebo inkaso nejsou úplné; bez nákladů není zisk = tržba. Řádky: Inkaso a Náklady celkem.',
    });
  }
  // poskytnuté slevy u prodejů po nabídce: původní − nabídnutá, jen obě přesně ve stejné měně
  const slevaCastky: PolozkaPenez[] = prodeje.filter((p) => p.cena.zdroj === 'sleva').map((p) => {
    const puvodni = cenaRozborMock(p.c.cena_web);
    return puvodni.stav === 'presne' && p.cena.castka !== null && puvodni.mena === p.cena.mena
      ? { castka: Number(puvodni.castka) - p.cena.castka, mena: p.cena.mena } : { castka: null, mena: null, stav: 'nezname' };
  });
  const dim = filtrKlientu(x.f);
  const data: DataFinance = {
    prodeje: hodnotaProdejuMetrika(x, prodeje),
    prodeje_mimo_prodej: znamy ? pocetMetrika('prodeje_mimo_prodej', x, prodejeMimoProdej(x).length) : nedostupnaMetrika('prodeje_mimo_prodej', x, hist),
    faktury: { pocet: pocetMetrika('faktury_pocet', x, faktury.length, fakT), web: castFaktury('faktury_web', 'web', 'není v textu částka za web.'),
      hosting: castFaktury('faktury_hosting', 'hosting', 'není v textu částka za hosting.'), celkem: castFaktury('faktury_celkem', 'celkem', 'není v textu celková částka.') },
    platby: { inkaso, odvozene: platby.filter((p) => p.odvozeno).length },
    pohledavky: {
      pocet: pocetMetrika('pohledavky_pocet', x, pohledavky.length, plT),
      castka: penizeMetrika('pohledavky_castka', x, pohledavky.map((f) => ({ castka: f.r.celkem, mena: f.r.mena, stav: f.r.celkem === null ? 'nezname' as const : 'presne' as const })),
        'faktury', 'faktur', 'není v textu celková částka.', plT),
      nejstarsi_dni: pohledavky.length ? Math.max(...pohledavky.map((f) => dniOd(f.e.at, x.kMs))) : null,
      po_14_dnech: pohledavky.filter((f) => dniOd(f.e.at, x.kMs) > 14).length,
    },
    slevy: { pocet: pocetMetrika('slevy_nabidnuto', x, slevyO.length, pred('slevy')),
      castka: znamy ? penizeMetrika('slevy_castka', x, slevaCastky, 'prodeje po nabídce', 'prodejů po nabídce', 'nejde přečíst původní i nabídnutou cenu ve stejné měně.')
        : nedostupnaMetrika('slevy_castka', x, hist) },
    // výplaty mají člověka, ne klienta: s filtrem segmentu, oboru nebo kraje vyplaceno i zbývá nedostupné (§9 úkol 4 bod 17)
    provize: {
      narok: znamy ? penizeMetrika('provize_narok', x, narokPolozky, 'prodeje', 'prodejů', PROVIZE_VETA) : nedostupnaMetrika('provize_narok', x, hist),
      vyplaceno: dim ? nedostupnaMetrika('provize_vyplaceno', x, VYPLATY_BEZ_KLIENTU)
        : penizeMetrika('provize_vyplaceno', x, vyplaty.map((p) => ({ castka: p.castka, mena: p.mena })), 'výplaty', 'výplat', 'není přesná částka.',
          chybi('vyplaty') ? 'Výplaty provizí zatím nikdo nezapsal.' : pred('vyplaty')),
      zbyva: dim ? nedostupnaMetrika('provize_zbyva', x, VYPLATY_BEZ_KLIENTU) : !znamy ? nedostupnaMetrika('provize_zbyva', x, hist)
        : penizeMetrika('provize_zbyva', x, zbyvaPolozky, 'položky', 'položek', 'není přesná částka.',
          chybi('vyplaty') ? 'Výplaty provizí zatím nikdo nezapsal; zbývá je celý nárok.'
            : zbyvaPred ? (vyplatyOd ? `Výplaty provizí se evidují od ${denCesky(vyplatyOd)}; starší výplaty nejsou známé.` : 'Starší výplaty provizí nejsou známé.') : null),
    },
    hosting: { rocne: rocneM, mrr, arr, obnovy: znamy ? obnovyHostingu(x) : [] },
    naklady: { kategorie, celkem },
    vysledek,
    pokryti_nakladu,
  };
  return obalkaPrehledu(x, data, ['kontakty', 'prodeje', 'slevy', 'faktury', 'platby', 'historie', 'naklady', 'vyplaty'],
    varovaniPrehledu(x, { zdroje: ['slevy', 'faktury', 'platby', 'vyplaty'], provize: true, nakladyOverit, zakladJenKlienti: true }));
}

/**
 * Blokovaní klienti k datu (073 app_prehled_blokace): stav eskalace nebo pozastaveno, otevřená otázka automatizace zapsaná do k_datu
 * (v demu otevřené vlákno s kontaktem; přibližně) a příznak flag_kind jen živě. Jeden zdroj pro blokace dodání i jejich řádky.
 */
function blokovaniKlienti(x: KontextPrehledu): { c: Kontakt; eskalace: boolean; pozastaveno: boolean; priznak: boolean | null; otazka: boolean }[] {
  return kontakty.filter((c) => x.sedi(c) && x.lidi(x.osoba(c))).flatMap((c) => {
    const otazka = messages.some((m) => m.kontakt_id === c.id && m.status === 'open' && x.doKDatu(m.created_at));
    const priznak = x.f.k_datu ? null : !!c.flag_kind;
    const r = { c, eskalace: c.status === 'eskalace', pozastaveno: c.status === 'pozastaveno', priznak, otazka };
    return r.eskalace || r.pozastaveno || !!r.priznak || r.otazka ? [r] : [];
  });
}
function pocetBlokaci(x: KontextPrehledu): { eskalace: number; pozastaveno: number; priznaky: number | null; otazky: number } {
  const b = blokovaniKlienti(x);
  return { eskalace: b.filter((r) => r.eskalace).length, pozastaveno: b.filter((r) => r.pozastaveno).length,
    priznaky: x.f.k_datu ? null : b.filter((r) => r.priznak).length, otazky: b.filter((r) => r.otazka).length };
}
/** prehled_dodani (§5.10). */
function prehledDodaniMock(me: MockUser, vstup: unknown): PrehledObalka<DataDodani> {
  const x = kontextPrehledu(me, vstup);
  const neznamy = stavNeznamy(x);
  const vFiltru = kontakty.filter((c) => x.sedi(c) && x.lidi(x.osoba(c)));
  const faze = neznamy ? [] : DODANI_STAVY.map((s) => {
    const cs = vFiltru.filter((c) => c.status === s);
    return { status: s, nazev: nazevStavu(s), n: cs.length, starnuti: starnuti(x, cs, { status: s }, 'dodani_faze'), proklik: { zdroj: 'kontakty', filtr: { ...x.f, vyber: { metrika: 'dodani_faze', status: s } } } };
  });
  const joby = (typ: 'build' | 'change') => {
    const v = PREHLED_JOBY.filter((j) => j.typ === typ && x.vObdobi(j.updated_at) && x.sedi(kontaktPodleId(j.kontakt_id))).map((j) => (Date.parse(j.updated_at) - Date.parse(j.created_at)) / HODINA_MS);
    return { pocet: v.length, median_h: v.length ? zaokr(percentil(v, 0.5)!, 2) : null, p90_h: v.length ? zaokr(percentil(v, 0.9)!, 2) : null };
  };
  const data: DataDodani = {
    faze,
    // blokace k datu (073 app_prehled_dodani a app_prehled_blokace, §9 5a bod 19; úkol 14c, ⚠ NAHRAZUJE větu „… přesný seznam má
    // automatizace“ a příznaky k datu): eskalace, pozastaveno a otevřené otázky do k_datu, příznaky jen živě (se zadaným k_datu null
    // s větou „Příznaky nejsou v historii.“), vždy castecne; stav k datu před historií nedostupne s počty null a větou HISTORIE_OD
    blokace: neznamy
      ? { eskalace: null, pozastaveno: null, priznaky: null, otazky: null, kvalita: 'nedostupne', duvod: historieText(), proklik: null }
      : sDalsimDuvodem({ ...pocetBlokaci(x), kvalita: 'castecne' as const,
        duvod: [x.f.k_datu ? 'Příznaky nejsou v historii.' : null, 'Otevřené otázky jsou přibližně (bez odpovědí ve vláknech).'].filter(Boolean).join(' '),
        proklik: { zdroj: 'kontakty', filtr: { ...x.f, vyber: { metrika: 'blokace' } } } }, dimKDatu(x.f).duvod),
    prace: { build: joby('build'), change: joby('change') },
    domeny: pocetMetrika('domeny_pripojene', x, 0),
    obnovy_hostingu: neznamy ? [] : obnovyHostingu(x),
  };
  return obalkaPrehledu(x, data, ['kontakty', 'platby', 'historie', 'jobs'], varovaniPrehledu(x, { historie: true, zakladJenKlienti: true }));
}

/** Skupina prognózy (§5.11, 073 app_prehled_prognoza_faze). */
const fazePrognozy = (s: KontaktStatus): DataPrognoza['otevrene'][number]['faze'] =>
  s === 'zajem' || s === 'web_ve_vyrobe' ? 'zajem' : s === 'navrh_odeslan' || s === 'ceka_na_klienta' || s === 'upravy_ve_vyrobe' ? 'navrh' : s === 'sleva_nabidnuta' ? 'sleva' : 'ostatni';
/** Názvy skupin doslova jako 073 (úkol 14c, ⚠ NAHRAZUJE „Ostatní otevření“). */
const NAZVY_FAZI_PROGNOZY: Record<DataPrognoza['otevrene'][number]['faze'], string> = { zajem: 'Zájem', navrh: 'Po návrhu', sleva: 'Nabídka za polovinu', ostatni: 'Ostatní otevřené' };
const OSTATNI_PRAVDEPODOBNOST = 'Ozve se později, pozastavené a eskalace se do odhadu nepočítají (pravděpodobnost 0).';
/** Příspěvek otevřeného obchodu k odhadu (073 app_prehled_prognoza_vypocet): round(cena × citatel ÷ jmenovatel, 2), nikdy přes zaokrouhlenou míru. */
const prispevekObchodu = (cena: number, citatel: number, jmenovatel: number): number => zaokr((cena * citatel) / jmenovatel, 2);
/**
 * Vážená hodnota skupiny po měnách (073 app_prehled_prognoza, AMENDED 2026-11-19): součet příspěvků jejích obchodů v měně, null bez míry
 * (jmenovatel 0) nebo bez přesné ceny v té měně. Export jen pro npm test (příklad §5.11: 1 520 700 Kč při 2 ÷ 111 = 27 400.00).
 */
export function vazeneOdhadu(ceny: PolozkaPenez[], citatel: number, jmenovatel: number, mn: MenaPrehledu[]): CastkaJedna[] {
  return castkyZ(ceny, mn).map((c) => ({
    mena: c.mena,
    hodnota: c.hodnota === null || jmenovatel <= 0 ? null
      : castkaText(ceny.filter((p) => p.mena === c.mena && p.castka !== null).reduce((a, p) => a + prispevekObchodu(p.castka!, citatel, jmenovatel), 0)),
  }));
}
interface JednotkaPrognozy { c: Kontakt; druh: 'prodej' | 'otevreny'; faze: DataPrognoza['otevrene'][number]['faze'] | null; cena: CenaKontaktu; citatel: number; jmenovatel: number; prispevek: number | null }
/**
 * Výpočet prognózy (073 app_prehled_prognoza_jednotky, _mira a _vypocet; jeden zdroj pro stavitele i řádky prokliku): jednotky =
 * prodeje pražského měsíce k_datu do k_datu (podle atribuce) a otevřené obchody k datu; míra skupiny = kohorta milníku (první
 * zájem, první návrh, první nabídka za polovinu, vše do k_datu) v [k_datu − 180 dní, k_datu − zbyva_dni dní] (segment, obor, kraj,
 * lidé podle atribuce), prodaná do zbyva_dni dní od milníku; ostatni 0 z jejích otevřených obchodů. Příspěvek: prodej cenou,
 * otevřený obchod round(cena × citatel ÷ jmenovatel, 2); bez přesné ceny nebo míry null.
 */
function prognozaVypocet(x: KontextPrehledu): { kDen: string; od: string; doDne: string; zbyva: number; jednotky: JednotkaPrognozy[];
  skupiny: Record<DataPrognoza['otevrene'][number]['faze'], { citatel: number; jmenovatel: number; kohorta: Kontakt[] }> } {
  const kDen = denPraha(new Date(x.kMs));
  const od = `${kDen.slice(0, 7)}-01`;
  const doDne = posledniDenMesice(od);
  const zbyva = Math.round((zacatekDnePraha(doDne) - zacatekDnePraha(kDen)) / 86400000) + 1;
  const milnik = (c: Kontakt, faze: string): string | null => {
    if (faze === 'zajem') return callLog.filter((l) => l.kontakt_id === c.id && l.outcome === 'zajem' && x.doKDatu(l.created_at)).map((l) => l.created_at).sort()[0] ?? null;
    if (faze === 'navrh') { const n = navrhAt(c); return n && x.doKDatu(n) ? n : null; }
    return (slevy.get(c.id) ?? []).map((e) => e.created_at).filter((t) => x.doKDatu(t)).sort()[0] ?? null;
  };
  const otevrene = otevreneKDatu(x);
  const skupiny = {} as Record<DataPrognoza['otevrene'][number]['faze'], { citatel: number; jmenovatel: number; kohorta: Kontakt[] }>;
  for (const faze of ['zajem', 'navrh', 'sleva'] as const) {
    const kohorta = kontakty.filter((c) => {
      const m = milnik(c, faze);
      return !!m && Date.parse(m) >= x.kMs - 180 * 86400000 && Date.parse(m) <= x.kMs - zbyva * 86400000 && x.sedi(c) && x.lidi(x.osoba(c));
    });
    const citatel = kohorta.filter((c) => {
      if (!PRODANO_STAVY.includes(c.status)) return false;
      const m = Date.parse(milnik(c, faze)!);
      const s = Date.parse(datumProdeje(c));
      return s <= x.kMs && s >= m && s <= m + zbyva * 86400000;
    }).length;
    skupiny[faze] = { citatel, jmenovatel: kohorta.length, kohorta };
  }
  skupiny.ostatni = { citatel: 0, jmenovatel: otevrene.filter((j) => fazePrognozy(j.c.status) === 'ostatni').length, kohorta: [] };
  const jednotky: JednotkaPrognozy[] = [
    ...prodejeV(x, zacatekDnePraha(od), zacatekDnePraha(posunDen(doDne, 1))).map((p) => ({ c: p.c, druh: 'prodej' as const, faze: null, cena: p.cena, citatel: 1, jmenovatel: 1,
      prispevek: p.cena.castka })),
    ...otevrene.map((j) => {
      const faze = fazePrognozy(j.c.status);
      const s = skupiny[faze];
      return { c: j.c, druh: 'otevreny' as const, faze, cena: j.cena, citatel: s.citatel, jmenovatel: s.jmenovatel,
        prispevek: j.cena.castka === null || s.jmenovatel <= 0 ? null : prispevekObchodu(j.cena.castka, s.citatel, s.jmenovatel) };
    }),
  ];
  return { kDen, od, doDne, zbyva, jednotky, skupiny };
}
/** Položka peněz příspěvku jednotky (073 pen): přesná jen se známým příspěvkem; přesná cena bez míry je neznámá. */
const penPrispevku = (j: JednotkaPrognozy): PolozkaPenez => ({ castka: j.prispevek, mena: j.cena.mena, stav: j.prispevek !== null ? 'presne' : j.cena.castka !== null ? 'nezname' : j.cena.rozbor.stav });
/**
 * Data prognózy (i karta odhad_mesic souhrnu). ⚠ Úkol 14c (073 app_prehled_prognoza, AMENDED 2026-11-19; NAHRAZUJE „hodnota
 * skupiny × zaokrouhlená míra“ a věty úkolu 13): vážené = součet příspěvků, základní = součet příspěvků všech jednotek, věty doslova jako 073,
 * ostatní míra 0 z jejích obchodů, skupina bez historie dvě věty (Málo historie (N = 0). Jmenovatel je 0 …), vyber skupiny = krok.
 */
function prognozaData(x: KontextPrehledu): DataPrognoza {
  const v = prognozaVypocet(x);
  const hist = historieText();
  const filtr = !!(x.f.lide || x.f.segment || x.f.obor || x.f.kraj);
  const presnost = (duvod: string) => ({ kvalita: 'nedostupne' as const, duvod, mesice: [], bias: [], mae: [], wape: [] });
  const zaklad = { mesic: v.kDen.slice(0, 7), od: v.od, do: v.doDne, zbyva_dni: v.zbyva, stitek: 'nevalidovaný odhad' as const };
  if (stavNeznamy(x)) {
    return { ...zaklad, potvrzene: nedostupnaMetrika('prognoza_potvrzene', x, hist), otevrene: [],
      scenare: { zakladni: nedostupnaMetrika('prognoza_zakladni', x, hist), jen_jiste: nedostupnaMetrika('prognoza_jen_jiste', x, hist) },
      presnost: presnost(filtr ? 'Denní snímky jsou za celou firmu; s filtrem lidí nebo klientů se přesnost nepočítá.' : hist) };
  }
  const prodeje = v.jednotky.filter((j) => j.druh === 'prodej');
  // potvrzené a jen jisté ze stejného základu (073: jen_jiste = metrika z částek, pokrytí, kvality a důvodu potvrzených)
  const zakladPotvrzenych = penizeZaklad(x, prodeje.map((j) => ({ castka: j.cena.castka, mena: j.cena.mena, stav: j.cena.rozbor.stav })), 'prodeje', 'prodejů', CENA_VETA);
  const potvrzene = metrikaPrehledu('prognoza_potvrzene', x, zakladPotvrzenych);
  const skupiny: DataPrognoza['otevrene'] = (['zajem', 'navrh', 'sleva', 'ostatni'] as const).map((faze) => {
    const o = v.jednotky.filter((j) => j.druh === 'otevreny' && j.faze === faze);
    const s = v.skupiny[faze];
    const ceny = o.map((j) => ({ castka: j.cena.castka, mena: j.cena.mena, stav: j.cena.rozbor.stav }));
    const castky = castkyZ(ceny, x.meny);
    const pravdepodobnost = podilMetrika('prognoza_pravdepodobnost', x, s.citatel, s.jmenovatel, s.jmenovatel, pokryti(s.jmenovatel, s.jmenovatel),
      faze === 'ostatni' ? OSTATNI_PRAVDEPODOBNOST : s.jmenovatel < 20 ? `Málo historie (N = ${s.jmenovatel}).` : null, { krok: faze });
    return {
      faze, nazev: NAZVY_FAZI_PROGNOZY[faze], n: o.length, castky, nezname_n: o.filter((j) => j.cena.castka === null).length, pravdepodobnost,
      vazene: castky.map((c) => ({ mena: c.mena, hodnota: c.hodnota === null || s.jmenovatel <= 0 ? null
        : castkaText(o.filter((j) => j.cena.mena === c.mena && j.prispevek !== null).reduce((a, j) => a + (j.prispevek ?? 0), 0)) })),
    };
  });
  const pen = v.jednotky.map(penPrispevku);
  const zname = pen.filter((p) => p.castka !== null).length;
  const nezname = pen.length - zname;
  const zakladni = metrikaPrehledu('prognoza_zakladni', x, {
    castky: castkyZ(pen, x.meny), n: pen.length, pokryti: pokryti(zname, pen.length), kvalita: 'castecne',
    duvod: ['Nevalidovaný odhad z naší historie.', nezname > 0 ? `U ${zN(nezname, pen.length, 'klienta', 'klientů')} není přesná cena nebo historie fáze; odhad je jen ze známých.` : null]
      .filter(Boolean).join(' '),
  });
  const jenJiste = metrikaPrehledu('prognoza_jen_jiste', x, zakladPotvrzenych);
  return {
    ...zaklad, potvrzene, otevrene: skupiny, scenare: { zakladni, jen_jiste: jenJiste },
    // přesnost jen za celou firmu; demo denní snímky nemá
    presnost: presnost(filtr ? 'Denní snímky jsou za celou firmu; s filtrem lidí nebo klientů se přesnost nepočítá.' : 'Zatím není žádný denní snímek z minulého měsíce.'),
  };
}
function prehledPrognozaMock(me: MockUser, vstup: unknown): PrehledObalka<DataPrognoza> {
  const x = kontextPrehledu(me, vstup);
  // varování jako 073: filtr, historie jen pro stav k datu před ní, ODHAD jen u zobrazeného odhadu (úkol 14c)
  return obalkaPrehledu(x, prognozaData(x), ['kontakty', 'prodeje', 'navrhy', 'slevy', 'historie', 'snimky'],
    varovaniPrehledu(x, { historie: 'k_datu', odhad: !stavNeznamy(x), zakladJenKlienti: true }));
}

/** prehled_kvalita (§5.12): vždy teď, bez filtru. */
function prehledKvalitaMock(me: MockUser): PrehledObalka<DataKvalita> {
  if (me.role !== 'super_admin') fail(PREHLED_JEN_SUPER);
  const x = kontextPrehledu(me, null);
  const ceny = STAVY_PREHLEDU.filter((s) => s.skupina !== 'fronta').map((s) => {
    const cs = kontakty.filter((c) => c.status === s.klic);
    const r = cs.map((c) => (c.cena_web === null || oriznoutMezery(c.cena_web) === '' ? 'chybi' : cenaNezadanaMock(c.cena_web) ? 'nezname' : cenaRozborMock(c.cena_web).stav));
    return { status: s.klic, nazev: s.nazev, celkem: cs.length, presne: r.filter((v) => v === 'presne').length, rozsah: r.filter((v) => v === 'rozsah').length,
      nezname: r.filter((v) => v === 'nezname').length, chybi: r.filter((v) => v === 'chybi').length };
  }).filter((s) => s.celkem > 0);
  const bezEmailu = kontakty.filter((c) => navrhAt(c) && !(c.email ?? '').trim()).length;
  const sedmDni = signalyPrace().filter((p) => Date.now() - Date.parse(p.at) <= 7 * 86400000);
  const prvniSignal = signalyPrace().map((p) => p.at).sort()[0] ?? null;
  const data: DataKvalita = {
    ceny,
    navrhy_bez_emailu: pocetMetrika('kvalita_navrhy_bez_emailu', x, bezEmailu),
    nejasne_vazby: pocetMetrika('kvalita_nejasne_vazby', x, PREHLED_ZPRAVY.filter((z) => z.vazba === 'nejasne').length),
    platby_bez_faktury: pocetMetrika('kvalita_platby_bez_faktury', x, platbyDoKDatu(x).filter((p) => p.zdroj_castky === 'cena_prodeje').length),
    historie: { od: PREHLED_HISTORIE_OD, radku: kontakty.length, kontaktu: kontakty.length, kvalita: 'castecne', duvod: `Historie změn začíná ${denCesky(PREHLED_HISTORIE_OD)}; dřív jen poslední milníky.` },
    casovac: prvniSignal
      ? { od: prvniSignal, signalu_7d: sedmDni.length, lidi_7d: new Set(sedmDni.map((p) => p.user_id)).size, kvalita: 'castecne', duvod: `Časovač běží od ${denCesky(prvniSignal)}; dřívější práce je odhad z výsledků.` }
      : { od: null, signalu_7d: null, lidi_7d: null, kvalita: 'nedostupne', duvod: 'Časovač zatím nemá žádný signál.' },
    zdroje: ZDROJE_PREHLEDU.map(stavZdroje),
  };
  return obalkaPrehledu(null, data, ['kontakty', 'platby', 'historie', 'casovac', 'gmail', 'tick'], varovaniPrehledu(null, { gmail: true }));
}

/** prehled_akce (§5.13). */
/** Akční seznam na odpověď (073 app_prehled_akce): nejvýš tolik případů s nejdřívějším termínem, souhrn ze všech. */
const AKCI_NA_ODPOVED = 50;
function prehledAkceMock(me: MockUser, vstup: unknown): PrehledObalka<DataAkce> {
  const x = kontextPrehledu(me, vstup);
  // ⚠ Úkol 14c (kontrakt §5.13, AMENDED 2026-11-19): pripady nejvýš 50 (termín, pak kontakt), souhrn počítá VŠECHNY případy, celý
  // seznam je po stránkách v prehled_radky('akce'); se zadaným k_datu pripady [], pripadu null (neznámé, R7) a podle_signalu []
  // (NAHRAZUJE všechny případy v odpovědi a pripadu 0 k datu)
  const pripady = pripadyAkce(x);
  const data: DataAkce = x.f.k_datu ? { pripady: [], souhrn: { pripadu: null, podle_signalu: [] } } : {
    pripady: pripady.slice(0, AKCI_NA_ODPOVED),
    souhrn: { pripadu: pripady.length, podle_signalu: SIGNALY_AKCI.map((s) => ({ kod: s.kod, nazev: s.nazev, n: pripady.filter((p) => p.signaly.some((g) => g.kod === s.kod)).length })) },
  };
  return obalkaPrehledu(x, data, ['kontakty', 'prodeje', 'slevy', 'faktury', 'platby', 'zavolat'], varovaniPrehledu(x, { zakladJenKlienti: true }));
}

/* --- prehled_radky (§5.15) --- */

/**
 * Řádek zdroje kontakty (§7 RadekKontakty). ⚠ Úkol 14c (073 app_prehled_radek_kontaktu, AMENDED 2026-11-19): cena_web bez telefonu
 * a e-mailu (R20, CenaRozbor z původního textu), u řádků odhadu příspěvek a pravděpodobnost (jinak null).
 */
function radekKontaktu(x: KontextPrehledu, c: Kontakt, odhad: { prispevek: CastkaJedna | null; pravdepodobnost: number | null; cena?: CenaKontaktu } | null = null): RadekKontakty {
  const m = milnikyKontaktu(x, c);
  const cena = odhad?.cena ?? cenaKontaktu(c, PRODANO_STAVY.includes(c.status) ? datumProdeje(c) : x.kIso);
  return {
    zdroj: 'kontakty', radek_id: `k:${c.id}`, kontakt_id: c.id, jmeno: jmenoKontaktu(c), segment: segmentOf(c), obor: /^[^:]+:/.test(c.obor ?? '') ? c.obor : null, kraj: null,
    status: c.status, nazev_stavu: nazevStavu(c.status), rating: c.rating ?? null, hvezda: !!c.hvezda_at, cena_web: bezKontaktu(c.cena_web), cena: cena.rozbor,
    prispevek: odhad?.prispevek ?? null, pravdepodobnost: odhad?.pravdepodobnost ?? null, osoba: osobaPrehledu(x.osoba(c)),
    prvni_hovor_at: m.osloven, dovolano_at: m.dovolan, zajem_at: m.zajem, navrh_at: m.navrh, prodano_at: m.prodano, faktura_at: m.fakturovano, zaplaceno_at: m.zaplaceno,
    status_od: vstupDoFaze(c), posledni_klient_at: c.last_client_reply_at, posledni_my_at: c.last_our_reply_at,
  };
}
/** Patří řádek (člověk uid) do buňky prokliku: buňka člověka jen jeho (vyber.user_id), Nepřiřazeno nikoho, součet každého. */
function clovekBunky(v: Record<string, unknown>, uid: number | null): boolean {
  return typeof v.user_id === 'number' ? uid === v.user_id : !v.bez_prirazeni;
}
/** Kontakty prokliku podle vyber (vždy z týchž funkcí jako karta nebo tabulka). */
function kontaktyProVyber(x: KontextPrehledu, v: Record<string, unknown> | null): Kontakt[] {
  const sDuplicitou = (cs: Kontakt[]) => [...new Map(cs.map((c) => [c.id, c])).values()];
  if (!v) {
    const z = x.f.zaklad;
    if (z === 'prodej') return sDuplicitou(prodejeV(x).map((p) => p.c));
    if (z === 'faktura') return sDuplicitou(fakturyV(x).map((f) => f.c));
    if (z === 'platba') return sDuplicitou(platbyV(x).map((p) => p.c));
    return sDuplicitou(hovoryV(x).map((l) => kontaktPodleId(l.kontakt_id)!).filter(Boolean));
  }
  const metrika = String(v.metrika);
  const pasmo = (cs: Kontakt[]) => (typeof v.pasmo === 'string' ? cs.filter((c) => { const e = vstupDoFaze(c); return !!e && x.doKDatu(e) && pasmoDni(dniOd(e, x.kMs)) === v.pasmo; }) : cs);
  const lidiRadku = (cs: Kontakt[]) => (typeof v.user_id === 'number' ? cs.filter((c) => x.osoba(c) === v.user_id) : v.bez_prirazeni ? cs.filter((c) => x.osoba(c) === null) : cs);
  switch (metrika) {
    case 'otevrene': return stavNeznamy(x) ? [] : otevreneKDatu(x).map((j) => j.c);
    // jednotky odhadu (prodeje měsíce a otevřené obchody) staví radkyZdroje s příspěvky (úkol 14c)
    case 'odhad_mesic': case 'prognoza_zakladni': return prognozaVypocet(x).jednotky.map((j) => j.c);
    // most pipeline: kontakty otevřené na začátku nebo na konci období (073 app_prehled_pohyby, úkol 14c)
    case 'pohyby': return kandidatiMostu(x).filter((k) => k.o0 || k.o1).map((k) => k.c);
    case 'uspesnost': return sDuplicitou(uzavreneV(x).map((u) => u.c));
    case 'unikatni_klienti': return lidiRadkuHovoru(x, v);
    case 'navrhy': return lidiRadku(kontakty.filter((c) => x.vObdobi(navrhAt(c)) && x.sedi(c) && x.lidi(x.osoba(c))));
    case 'mira_odpovedi_po_navrhu': return kohortaPoNavrhu(x);
    case 'rychlost_navrhu_median': case 'rychlost_navrhu_p90': return zajemVObdobi(x).map((z) => z.c);
    case 'slevy_nabidnuto': case 'slevy_mira_prijeti': return slevyVObdobi(x).map((s) => s.c);
    case 'slevy_prijato': return slevyVObdobi(x).filter((s) => prodanPo(s.c, s.at, x.kMs)).map((s) => s.c);
    // pozorování doby do zavolání (073 app_prehled_sla, jeden zdroj s tabulkou lidí): řádek = kontakt (dvě označení téhož kontaktu
    // jeden řádek), buňka člověka podle toho, komu označení patří, Nepřiřazeno označení bez volajícího (úkol 14c, ⚠ NAHRAZUJE
    // člověka podle atribuce a označení uzavřená bez hovoru)
    case 'sla_prvni_kontakt_median': case 'sla_prvni_kontakt_p90':
      return sDuplicitou(slaPozorovani(x.f, x.odMs, x.doMs, x.kMs).filter((s) => (typeof v.user_id === 'number' ? s.user_id === v.user_id : v.bez_prirazeni ? s.user_id === null : true))
        .map((s) => kontaktPodleId(s.kontakt_id)!).filter(Boolean));
    // jako karta (surovyRadek): hotový hovor tomu, kdo ho uzavřel (coalesce(zmenil_id, user_id)), po termínu vlastníkovi; buňka
    // člověka jen jeho hovory (vyber.user_id), Nepřiřazeno žádné (recenze 14b, důležité 1, ⚠ NAHRAZUJE vlastníka u hotových
    // a všechny lidi filtru v každé buňce)
    case 'naplanovane_hotove': return sDuplicitou(zavolatRadky.filter((z) => z.stav === 'hotovo' && x.vObdobi(z.uzavreno_at) && x.lidi(z.zmenil_id ?? z.user_id)
      && clovekBunky(v, z.zmenil_id ?? z.user_id)).map((z) => kontaktPodleId(z.kontakt_id)!).filter((c) => !!c && x.sedi(c)));
    case 'naplanovane_po_terminu': return sDuplicitou(zavolatRadky.filter((z) => z.stav === 'ceka' && Date.parse(z.kdy) < x.kMs && x.lidi(z.user_id)
      && clovekBunky(v, z.user_id)).map((z) => kontaktPodleId(z.kontakt_id)!).filter((c) => !!c && x.sedi(c)));
    case 'domeny_pripojene': return [];
    // jmenovatel míry skupiny (vyber.krok, 073 prehled_radky): kohorta milníku skupiny, u ostatni její otevřené obchody (úkol 14c,
    // ⚠ NAHRAZUJE otevřené obchody skupiny a klíč faze)
    case 'prognoza_pravdepodobnost': {
      const pv = prognozaVypocet(x);
      const krok = typeof v.krok === 'string' ? v.krok : null;
      const kohorty = (['zajem', 'navrh', 'sleva'] as const).filter((f) => krok === null || krok === f).flatMap((f) => pv.skupiny[f].kohorta);
      const ostatni = krok === null || krok === 'ostatni' ? pv.jednotky.filter((j) => j.faze === 'ostatni').map((j) => j.c) : [];
      return sDuplicitou([...kohorty, ...ostatni]);
    }
    case 'kvalita_navrhy_bez_emailu': return kontakty.filter((c) => navrhAt(c) && !(c.email ?? '').trim());
    case 'trychtyr': {
      const kohorta = kohortaTrychtyre(x);
      return typeof v.krok === 'string' && v.krok !== 'osloven' ? krokTrychtyre(x, kohorta, v.krok as KrokTrychtyre['klic']).v : kohorta;
    }
    case 'po_navrhu': return typeof v.krok === 'string' ? krokPoNavrhu(x, kohortaPoNavrhu(x), v.krok as KrokPoNavrhu['klic']) : kohortaPoNavrhu(x);
    case 'stavy_kohorty': return kohortaTrychtyre(x).filter((c) => !v.status || c.status === v.status);
    case 'pipeline_faze': return pasmo(otevreneKDatu(x).map((j) => j.c).filter((c) => !v.status || c.status === v.status));
    case 'kohorta_mesic': return (kohortyMesicu(x).find((k) => k.mesic === v.mesic)?.cs ?? []).map((k) => k.c);
    case 'kalibrace_znamky': return zajemVObdobi(x).filter((z) => !v.znamka || (z.c.rating ?? 'bez') === v.znamka).map((z) => z.c);
    case 'kalibrace_hvezdy': return kohortaPoNavrhu(x).filter((c) => v.hvezda === undefined || (!!c.hvezda_at && x.doKDatu(c.hvezda_at) && (!PRODANO_STAVY.includes(c.status) || c.hvezda_at <= datumProdeje(c))) === v.hvezda);
    case 'klienti_segment': case 'klienti_obor': case 'klienti_kraj': case 'hodnoceni_webu': {
      const { cs } = populaceKlientu(x);
      return cs.filter((c) => (v.segment ? segmentOf(c) === v.segment : true) && (v.obor ? sediFiltru(c, { ...x.f, obor: [String(v.obor)] }) : true)
        && (v.znamka ? rodinaOf(segmentOf(c)) === 'obor' && (c.web_hodnoceni ?? 'bez') === v.znamka : true));
    }
    case 'sablony': return [];
    case 'cekani_na_nas': return x.f.k_datu ? [] : cekaniJednotky(x, 'na_nas').map((j) => j.c);
    case 'cekani_na_klienta': return x.f.k_datu ? [] : cekaniJednotky(x, 'na_klienta').map((j) => j.c);
    case 'dodani_faze': return pasmo(kontakty.filter((c) => x.sedi(c) && x.lidi(x.osoba(c)) && (!v.status || c.status === v.status) && DODANI_STAVY.includes(c.status)));
    case 'blokace': return blokovaniKlienti(x).map((r) => r.c);
    default: return [];
  }
}
/** Různí klienti s hovorem (řádek člověka nebo součet). */
function lidiRadkuHovoru(x: KontextPrehledu, v: Record<string, unknown>): Kontakt[] {
  const hovory = hovoryV(x).filter((l) => (typeof v.user_id === 'number' ? l.user_id === v.user_id : true));
  return [...new Set(hovory.map((l) => l.kontakt_id))].map((id) => kontaktPodleId(id)!).filter(Boolean);
}
/** Řádky jednoho zdroje (bez stránkování): řádky, součty a součet. */
function radkyZdroje(x: KontextPrehledu, zdroj: RadkyZdroj): { radky: RadekPrehledu[]; soucty: CastkaJedna[]; soucet: number | null } {
  const v = x.f.vyber;
  const metrika = v ? String(v.metrika) : null;
  const vOdDo = (iso: string | null | undefined) => {
    if (!v || typeof v.od !== 'string' || typeof v.do !== 'string') return true;
    if (!iso) return false;
    const t = Date.parse(iso);
    return t >= zacatekDnePraha(v.od) && t < zacatekDnePraha(posunDen(v.do, 1));
  };
  const penize = (p: PolozkaPenez[]) => jedneCastky(castkyZ(p, x.meny));
  const castka = (n: number | null) => (n === null ? null : castkaText(n));
  switch (zdroj) {
    case 'kontakty': {
      if (metrika === 'odhad_mesic' || metrika === 'prognoza_zakladni') {
        // jednotky odhadu s příspěvkem ke kartě (073 app_prehled_prognoza_vypocet): peníze řádku = příspěvek, řádek ukáže i plnou cenu
        // a pravděpodobnost skupiny (prodej 1); součet řádků = součet příspěvků = karta (úkol 14c, AMENDED 2026-11-19; ⚠ NAHRAZUJE plné ceny
        // otevřených obchodů)
        const jed = prognozaVypocet(x).jednotky.filter((j) => vOdDo(navrhAt(j.c) ?? j.c.updated_at));
        const radky = jed.map((j) => radekKontaktu(x, j.c, {
          prispevek: j.prispevek === null || !j.cena.mena ? null : { mena: j.cena.mena, hodnota: castkaText(j.prispevek) },
          pravdepodobnost: j.druh === 'prodej' ? 1 : j.jmenovatel > 0 ? zaokr(j.citatel / j.jmenovatel, 6) : null, cena: j.cena,
        })).sort((a, b) => b.kontakt_id - a.kontakt_id);
        return { radky, soucty: penize(jed.map(penPrispevku)), soucet: null };
      }
      const cs = kontaktyProVyber(x, v).filter((c) => vOdDo(navrhAt(c) ?? c.updated_at));
      const radky = cs.map((c) => radekKontaktu(x, c)).sort((a, b) => b.kontakt_id - a.kontakt_id);
      const ceny = metrika === 'otevrene'
        ? otevreneKDatu(x).filter((j) => cs.includes(j.c)).map((j) => ({ castka: j.cena.castka, mena: j.cena.mena }))
        : radky.map((r) => ({ castka: r.cena.stav === 'presne' ? Number(r.cena.castka) : null, mena: r.cena.mena, stav: r.cena.stav }));
      return { radky, soucty: penize(ceny), soucet: null };
    }
    case 'hovory': {
      const hovory = hovoryV(x).filter((l) => vOdDo(l.created_at) && (typeof v?.user_id === 'number' ? l.user_id === v.user_id : true)).filter((l) => {
        switch (metrika) {
          case 'dovolano': return l.outcome !== 'nedovolano';
          case 'zajem': case 'odmitnuto': case 'nerelevantni': case 'preplanovano': return l.outcome === metrika;
          case 'konverze': return l.outcome === 'zajem' || l.outcome === 'odmitnuto';
          default: return true;
        }
      });
      const radky: RadekHovory[] = hovory.map((l): RadekHovory => {
        const c = kontaktPodleId(l.kontakt_id)!;
        return { zdroj: 'hovory', radek_id: `h:${l.id}`, id: l.id, kontakt_id: l.kontakt_id, jmeno: jmenoKontaktu(c), segment: segmentOf(c), user_id: l.user_id,
          volajici: users.find((u) => u.id === l.user_id)?.display_name ?? '?', vysledek: l.outcome as RadekHovory['vysledek'], rating: c.rating ?? null, at: l.created_at };
      }).sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id);
      return { radky, soucty: [], soucet: null };
    }
    case 'prodeje': {
      let prodeje = metrika === 'prognoza_potvrzene' || metrika === 'prognoza_jen_jiste'
        ? prodejeV(x, zacatekDnePraha(`${denPraha(new Date(x.kMs)).slice(0, 7)}-01`), x.kMs + 1)
        : metrika === 'prodeje_mimo_prodej' ? prodejeMimoProdej(x)
          : metrika === 'hosting_rocne' || metrika === 'hosting_mrr' || metrika === 'hosting_arr'
            ? kontakty.filter((c) => PRODANO_STAVY.includes(c.status) && x.sedi(c) && Date.parse(datumProdeje(c)) <= x.kMs && x.lidi(x.osoba(c)))
              .map((c) => { const at = datumProdeje(c); const cena = cenaKontaktu(c, at); return { c, at, cena, osoba: x.osoba(c), provizeKomu: pripsanyClovek(c, 'posledni_zajem', x.kMs), provize: provizeZ(cena) }; })
            : prodejeV(x);
      if (metrika === 'slevy_castka') prodeje = prodeje.filter((p) => p.cena.zdroj === 'sleva');
      if (typeof v?.user_id === 'number') prodeje = prodeje.filter((p) => p.osoba === v.user_id);
      if (v?.bez_prirazeni) prodeje = prodeje.filter((p) => p.osoba === null);
      prodeje = prodeje.filter((p) => vOdDo(p.at));
      const radky: RadekProdeje[] = prodeje.map((p): RadekProdeje => ({
        zdroj: 'prodeje', radek_id: `p:${p.c.id}`, kontakt_id: p.c.id, jmeno: jmenoKontaktu(p.c), segment: segmentOf(p.c), prodano_at: p.at, cena_text: bezKontaktu(p.cena.text), cena: p.cena.rozbor,
        zdroj_ceny: p.cena.zdroj, hosting: hostingApi(p.c.cena_hosting), osoba: osobaPrehledu(p.osoba), provize: castka(p.provize.castka), provize_mena: p.provize.castka === null ? null : p.provize.mena,
      })).sort((a, b) => b.prodano_at.localeCompare(a.prodano_at) || b.radek_id.localeCompare(a.radek_id));
      let soucty: CastkaJedna[];
      if (metrika === 'slevy_castka') {
        soucty = penize(prodeje.map((p) => { const pu = cenaRozborMock(p.c.cena_web); return pu.stav === 'presne' && p.cena.castka !== null && pu.mena === p.cena.mena ? { castka: Number(pu.castka) - p.cena.castka, mena: p.cena.mena } : { castka: null, mena: p.cena.mena }; }));
      } else if (metrika === 'hosting_rocne' || metrika === 'hosting_arr' || metrika === 'hosting_mrr') {
        // ročně a ARR = součet ročních cen, MRR = round(součet ÷ 12, 2) (073 §5.15; úkol 14c, ⚠ NAHRAZUJE ARR = zaokrouhlené MRR × 12)
        const rocne = castkyZ(prodeje.map((p) => { const h = hostingRozbor(p.c.cena_hosting); return { castka: h.castka === null ? null : Number(h.castka), mena: h.mena }; }), x.meny);
        soucty = rocne.map((c) => ({ mena: c.mena, hodnota: c.hodnota === null ? null : metrika === 'hosting_mrr' ? castkaText(Number(c.hodnota) / 12) : c.hodnota }));
      } else {
        soucty = penize(prodeje.map((p) => ({ castka: p.cena.castka, mena: p.cena.mena })));
      }
      return { radky, soucty, soucet: null };
    }
    case 'faktury': {
      const f = (metrika === 'pohledavky_pocet' || metrika === 'pohledavky_castka' ? pohledavkyKDatu(x) : fakturyV(x)).filter((j) => vOdDo(j.e.at));
      const radky: RadekFaktury[] = f.map((j): RadekFaktury => ({
        zdroj: 'faktury', radek_id: `f:${j.e.id}`, event_id: j.e.id, kontakt_id: j.c.id, jmeno: jmenoKontaktu(j.c), at: j.e.at, cislo: j.r.cislo, web: castka(j.r.web), hosting: castka(j.r.hosting),
        celkem: castka(j.r.celkem), mena: j.r.mena, zaplaceno_at: j.zaplacenoAt, dni_od_vystaveni: dniOd(j.e.at, x.kMs),
      })).sort((a, b) => b.at.localeCompare(a.at) || b.radek_id.localeCompare(a.radek_id));
      const cast = metrika === 'faktury_web' ? 'web' : metrika === 'faktury_hosting' ? 'hosting' : 'celkem';
      return { radky, soucty: penize(f.map((j) => ({ castka: j.r[cast], mena: j.r[cast] === null ? null : j.r.mena }))), soucet: null };
    }
    case 'platby': {
      const p = platbyV(x).filter((j) => vOdDo(j.at) && (metrika === 'kvalita_platby_bez_faktury' ? j.zdroj_castky === 'cena_prodeje' : true));
      const radky: RadekPlatby[] = p.map((j): RadekPlatby => ({
        zdroj: 'platby', radek_id: j.id === null ? `z:${j.c.id}` : `e:${j.id}`, event_id: j.id, kontakt_id: j.c.id, jmeno: jmenoKontaktu(j.c), at: j.at, castka: castka(j.castka), mena: j.mena,
        zdroj_castky: j.zdroj_castky, odvozeno: j.odvozeno, faktury: j.faktury,
      })).sort((a, b) => b.at.localeCompare(a.at) || b.radek_id.localeCompare(a.radek_id));
      return { radky, soucty: penize(p.map((j) => ({ castka: j.castka, mena: j.mena }))), soucet: null };
    }
    case 'naklady': {
      const kat = metrika && metrika !== 'naklady_celkem' ? metrika.replace('naklady_', '') : null;
      const z = (nakladyFiltrovane(x) ? nakladyV(x).filter((r) => r.kategorie === 'provize' && (kat === null || kat === 'provize')) : nakladyV(x))
        .filter((r) => (kat ? r.kategorie === kat : true) && (typeof v?.kategorie === 'string' ? r.kategorie === v.kategorie : true) && vOdDo(r.datum));
      const radky: RadekNaklady[] = z.map((r): RadekNaklady => ({ zdroj: 'naklady', radek_id: r.radek_id, naklad_id: r.naklad_id, kategorie: r.kategorie, popis: bezKontaktu(r.popis), datum: r.datum, castka: castka(r.castka),
        mena: r.mena, stav_ceny: r.stav_ceny, opakovani: r.opakovani, kontakt_id: r.kontakt_id, jmeno: r.kontakt_id === null ? null : jmenoKontaktu(kontaktPodleId(r.kontakt_id)!), overit: r.overit, user_id: r.user_id }))
        .sort((a, b) => b.datum.localeCompare(a.datum) || b.radek_id.localeCompare(a.radek_id));
      return { radky, soucty: penize(z.map((r) => ({ castka: r.castka, mena: r.mena }))), soucet: null };
    }
    case 'provize': {
      // 073 prehled_radky provize (úkol 14c): nárok prodeje bez zájmu má user_id i volajici null, buňka Nepřiřazeno nemá řádky
      // (provize nemá komu připadnout, výplata má vždy člověka), poznámka bez telefonu a e-mailu; součet záporné výplaty jen u zbývá
      const j = v?.bez_prirazeni ? [] : (metrika === 'provize_zbyva' ? provizeJednotky(x, -Infinity, '0000-01-01') : provizeJednotky(x, x.odMs, x.f.od))
        .filter((p) => (metrika === 'provize_narok' ? p.druh === 'narok' : metrika === 'provize_vyplaceno' ? p.druh === 'vyplata' : true))
        .filter((p) => (typeof v?.user_id === 'number' ? p.user_id === v.user_id : true) && vOdDo(p.datum));
      const radky: RadekProvize[] = j.map((p): RadekProvize => ({ zdroj: 'provize', radek_id: p.radek_id, druh: p.druh, datum: p.datum, user_id: p.user_id,
        volajici: p.user_id === null ? null : users.find((u) => u.id === p.user_id)?.display_name ?? null,
        kontakt_id: p.kontakt_id, jmeno: p.jmeno, castka: castka(p.castka), mena: p.mena, stav_ceny: p.stav_ceny, vyplata_id: p.vyplata_id, poznamka: bezKontaktu(p.poznamka) }))
        .sort((a, b) => b.datum.localeCompare(a.datum) || b.radek_id.localeCompare(a.radek_id));
      return { radky, soucty: metrika === 'provize_zbyva' ? jedneCastky(zbyvaCastky(j, x.meny)) : penize(j.map((p) => ({ castka: p.castka, mena: p.mena, stav: p.stav_ceny }))), soucet: null };
    }
    case 'odmitnuti': {
      const co = metrika === 'nereagoval_na_nabidku' ? 'nereagoval_na_nabidku' : metrika === 'mlci_po_navrhu' ? 'mlci_po_navrhu' : metrika === 'ztraty_bez_duvodu' ? 'ztraty_bez_duvodu' : metrika === 'duvody' ? 'duvody' : 'vse';
      const o = odmitnutiJednotky(x, co).filter((r) => (typeof v?.duvod === 'string' ? r.duvod === v.duvod : true) && (typeof v?.faze === 'string' ? r.faze === v.faze : true) && vOdDo(r.at));
      const radky: RadekOdmitnuti[] = o.map((r): RadekOdmitnuti => ({ zdroj: 'odmitnuti', radek_id: r.radek_id, kontakt_id: r.c.id, jmeno: jmenoKontaktu(r.c), segment: segmentOf(r.c), faze: r.faze, duvod: r.duvod,
        nazev_duvodu: NAZVY_DUVODU[r.duvod], text: bezKontaktu(r.text), zdroj_zapisu: r.zdroj, zapsal: r.zapsal, at: r.at, osoba: osobaPrehledu(x.osoba(r.c)) }))
        .sort((a, b) => b.at.localeCompare(a.at) || b.radek_id.localeCompare(a.radek_id));
      return { radky, soucty: [], soucet: null };
    }
    case 'zpravy': {
      const z = (metrika === 'kvalita_nejasne_vazby' ? PREHLED_ZPRAVY.filter((m) => m.vazba === 'nejasne') : zpravyV(x)).filter((m) => {
        if (metrika === 'zpravy_nedoruceno') return m.druh === 'nedoruceno';
        if (metrika === 'zpravy_automaticke') return m.druh === 'automaticka_odpoved';
        if (metrika === 'nejasne_vazby') return m.vazba === 'nejasne';
        return (typeof v?.smer === 'string' ? m.smer === v.smer : true) && (typeof v?.druh === 'string' ? m.druh === v.druh : true);
      }).filter((m) => vOdDo(m.prijato_at));
      const radky: RadekZpravy[] = z.map((m): RadekZpravy => ({ zdroj: 'zpravy', radek_id: `z:${m.id}`, id: m.id, kontakt_id: m.kontakt_id, jmeno: m.kontakt_id === null ? null : jmenoKontaktu(kontaktPodleId(m.kontakt_id)!),
        smer: m.smer, druh: m.druh, prijato_at: m.prijato_at, vazba: m.vazba, odkaz: odkazGmailu(m.vlakno_id) }))
        .sort((a, b) => b.prijato_at.localeCompare(a.prijato_at) || b.id - a.id);
      return { radky, soucty: [], soucet: null };
    }
    case 'akce': {
      const p = pripadyAkce(x).filter((c) => (typeof v?.signal === 'string' ? c.signaly.some((s) => s.kod === v.signal) : true));
      const radky: RadekAkce[] = p.map((c): RadekAkce => ({ zdroj: 'akce', radek_id: `a:${c.kontakt_id}`, ...c }));
      return { radky, soucty: [], soucet: null };
    }
    case 'prace': {
      // úsek má vždy člověka: buňka Nepřiřazeno žádné nemá; pracovní doba nemá klienta (s filtrem segmentu, oboru nebo kraje žádné);
      // plnění plánu jen lidé s rozvrhem v období (073 prehled_radky prace; úkol 14c, ⚠ NAHRAZUJE úseky všech v buňce Nepřiřazeno)
      const sRozvrhem = (uid: number) => { const r = rozvrhy.get(uid); return !!r && Date.parse(r.nastaveno_at) <= x.kMs && (x.f.od > denPraha(new Date(r.nastaveno_at)) ? x.f.od : denPraha(new Date(r.nastaveno_at))) <= x.f.do; };
      const u = v?.bez_prirazeni || filtrKlientu(x.f) ? [] : useyV(x).filter((s) => (typeof v?.user_id === 'number' ? s.uid === v.user_id : true) && vOdDo(new Date(s.od).toISOString())
        && (metrika !== 'plneni_planu' || sRozvrhem(s.uid)));
      const radky: RadekPrace[] = u.map((s): RadekPrace => ({ zdroj: 'prace', radek_id: `w:${s.uid}:${Math.floor(s.od / 1000)}`, user_id: s.uid, volajici: users.find((x2) => x2.id === s.uid)?.display_name ?? '?',
        den: denPraha(new Date(s.od)), od: new Date(s.od).toISOString(), do: new Date(s.do).toISOString(), minut: Math.round((s.do - s.od) / 60000), vysledku: s.kotev, kvalita: s.odhad ? 'odhad' : 'casovac' }))
        .sort((a, b) => b.od.localeCompare(a.od) || b.radek_id.localeCompare(a.radek_id));
      return { radky, soucty: [], soucet: zaokr(u.reduce((a, s) => a + (s.do - s.od), 0) / HODINA_MS, 2) };
    }
  }
}
/** vyber.metrika, jejíž řádky potřebují stav k datu (073 app_prehled_vyber_mapa, s): před začátkem historie [] s HISTORIE_OD. */
const RADKY_STAV = new Set(['otevrene', 'uspesnost', 'odhad_mesic', 'slevy_prijato', 'slevy_mira_prijeti', 'prognoza_pravdepodobnost', 'prognoza_zakladni', 'trychtyr',
  'stavy_kohorty', 'pipeline_faze', 'kohorta_mesic', 'kalibrace_znamky', 'kalibrace_hvezdy', 'klienti_segment', 'klienti_obor', 'klienti_kraj', 'hodnoceni_webu', 'sablony',
  'dodani_faze', 'blokace', 'pohyby', 'pocet_prodeju', 'hodnota_prodeju', 'plneni_cile', 'prodeje_mimo_prodej', 'slevy_castka', 'koncentrace_top1', 'koncentrace_top5',
  'prognoza_potvrzene', 'prognoza_jen_jiste', 'hosting_rocne', 'hosting_mrr', 'hosting_arr', 'naklady_provize', 'naklady_celkem', 'provize_narok', 'provize_zbyva',
  'ztraty_bez_duvodu']);
/** vyber.metrika, jejíž seznam je jen pro dnešek (073 app_prehled_vyber_mapa, d): se zadaným k_datu []. */
const RADKY_JEN_DNES = new Set(['mira_odpovedi_po_navrhu', 'sla_prvni_kontakt_median', 'sla_prvni_kontakt_p90', 'naplanovane_po_terminu', 'hodnoceni_webu', 'sablony',
  'cekani_na_nas', 'cekani_na_klienta', 'mlci_po_navrhu', 'k_zasahu']);
/** Zdroje řádků s penězi (součty po měnách filtru). */
const PENEZNI_ZDROJE: RadkyZdroj[] = ['kontakty', 'prodeje', 'faktury', 'platby', 'naklady', 'provize'];
const ZDROJE_META_RADKU: Record<RadkyZdroj, ZdrojKlicPrehledu[]> = {
  kontakty: ['hovory', 'kontakty', 'prodeje', 'navrhy', 'slevy', 'faktury', 'platby', 'historie', 'gmail', 'oznaceni', 'zavolat'], hovory: ['hovory', 'kontakty'],
  prodeje: ['hovory', 'kontakty', 'prodeje', 'slevy', 'historie'], faktury: ['hovory', 'kontakty', 'faktury', 'platby'], platby: ['hovory', 'kontakty', 'prodeje', 'faktury', 'platby', 'historie'],
  naklady: ['hovory', 'kontakty', 'prodeje', 'slevy', 'naklady'], provize: ['hovory', 'kontakty', 'prodeje', 'slevy', 'vyplaty'], odmitnuti: ['hovory', 'kontakty', 'navrhy', 'slevy', 'historie', 'duvody'],
  zpravy: ['hovory', 'kontakty', 'gmail'], akce: ['hovory', 'kontakty', 'prodeje', 'slevy', 'faktury', 'platby', 'zavolat'], prace: ['hovory', 'dovolani', 'casovac', 'zavolat'],
};
/** Otisk filtru do kurzoru (kurzor patří k filtru a zdroji). */
function otiskFiltru(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
/** prehled_radky (§5.15): pevné pořadí, stránky po limit řádků s kurzorem. */
function prehledRadkyMock(me: MockUser, zdroj: unknown, vstup: unknown, kurzor: unknown, limit: unknown): PrehledObalka<DataRadky> {
  const x = kontextPrehledu(me, vstup, true);
  if (typeof zdroj !== 'string' || !ZDROJE_RADKU.includes(zdroj as RadkyZdroj)) fail(`Neplatný zdroj řádků: ${String(zdroj)}. Povolené: ${ZDROJE_RADKU.join(', ')}.`);
  const z = zdroj as RadkyZdroj;
  const lim0 = limit === undefined || limit === null ? 50 : limit;
  if (typeof lim0 !== 'number' || !Number.isInteger(lim0) || lim0 < 1 || lim0 > 200) fail(`Neplatný limit: ${String(lim0)} (povoleno 1 až 200).`);
  // háček zkoušky `__volackaDemoTest.prehledLimit`: menší stránky, ať e2e PV11 dojde na třetí stránku s pár ukázkovými řádky
  const limHacek = (globalThis as { __volackaDemoTest?: { prehledLimit?: unknown } }).__volackaDemoTest?.prehledLimit;
  const lim = typeof limHacek === 'number' && Number.isInteger(limHacek) && limHacek >= 1 ? Math.min(lim0, limHacek) : lim0;
  if (x.f.vyber && !VYBER_PODLE_ZDROJE[z].includes(String(x.f.vyber.metrika))) fail('Neplatný filtr: vyber.metrika');
  const otisk = otiskFiltru(JSON.stringify({ ...x.f }));
  let offset = 0;
  if (kurzor !== undefined && kurzor !== null) {
    let k: { z?: unknown; f?: unknown; o?: unknown } | null = null;
    try {
      k = typeof kurzor === 'string' ? (JSON.parse(atob(kurzor)) as { z?: unknown; f?: unknown; o?: unknown }) : null;
    } catch {
      k = null;
    }
    if (!k || typeof k.o !== 'number' || typeof k.z !== 'string' || typeof k.f !== 'string') fail('Neplatný kurzor.');
    if (k.z !== z || k.f !== otisk) fail('Kurzor patří k jinému filtru nebo zdroji; načtěte řádky znovu od začátku.');
    offset = k.o;
  }
  // seznam vyprázdněný kvůli neznámému stavu (073 app_prehled_radky v_nezname, AMENDED 2026-11-19; úkol 14c): stav k datu před
  // historií u řádků, které stav potřebují (HISTORIE_OD; most i u období před historií), seznam jen pro dnešek se zadaným k_datu
  // (K_DATU_MINULOST z filtru); celkem 0 a součty null v každé měně filtru u peněžních zdrojů (neznámé, nikdy ověřená 0)
  const m = x.f.vyber ? String(x.f.vyber.metrika) : null;
  const krok = x.f.vyber && typeof x.f.vyber.krok === 'string' ? x.f.vyber.krok : null;
  const potrebujeStav = (m !== null && RADKY_STAV.has(m)) || (m === null && (z === 'prodeje' || (z === 'kontakty' && x.f.zaklad === 'prodej')))
    || (m === 'po_navrhu' && krok !== null && ['odmitl_nahled', 'prijal_nabidku', 'odmitl_nabidku', 'ceka_na_nabidku', 'prodano_bez_nabidky'].includes(krok));
  const stavNeznamyRadku = (stavNeznamy(x) && potrebujeStav) || (m === 'pohyby' && x.odMs < Date.parse(PREHLED_HISTORIE_OD));
  const jenDnes = !!x.f.k_datu && ((m !== null && RADKY_JEN_DNES.has(m)) || (m === null && z === 'akce'));
  const vse = stavNeznamyRadku || jenDnes
    ? { radky: [] as RadekPrehledu[], soucty: PENEZNI_ZDROJE.includes(z) ? x.meny.map((mena) => ({ mena, hodnota: null })) : [], soucet: z === 'prace' ? 0 : null }
    : radkyZdroje(x, z);
  const stranka = vse.radky.slice(offset, offset + lim);
  const dalsi = offset + lim < vse.radky.length ? btoa(JSON.stringify({ z, f: otisk, o: offset + lim })) : null;
  const data: DataRadky = { zdroj: z, radky: stranka, dalsi_kurzor: dalsi, celkem: vse.radky.length, soucty: vse.soucty, soucet: vse.soucet };
  // HISTORIE_OD jen u seznamu, který stav k datu nezná (a u provizí se stavem k datu před historií), jako 073 (úkol 14c, ⚠ NAHRAZUJE
  // HISTORIE_OD u kontaktů a prodejů s obdobím před historií)
  const historie = stavNeznamyRadku && m === 'pohyby' && !stavNeznamy(x) ? true : stavNeznamyRadku || (z === 'provize' && stavNeznamy(x)) ? 'k_datu' as const : undefined;
  return obalkaPrehledu(x, data, ZDROJE_META_RADKU[z], varovaniPrehledu(x, { historie, zakladJenKlienti: z !== 'kontakty' || !!x.f.vyber }));
}

/**
 * prehled_kontakt (§5.16): časová osa bez telefonu a e-mailu. ⚠ Úkol 14c (073 app_prehled_kontakt, AMENDED 2026-11-19; NAHRAZUJE
 * texty úkolu 13): texty událostí česky jako 073 (výsledky hovorů, dovolání s výsledkem, stavy a ceny z historie s výchozím stavem
 * při jejím začátku, první návrh, nabídka s částkou, faktura a platba s částkou, důvod s fází, e-mail, označení s kategorií,
 * naplánovaný hovor se stavem, hvězda, prodej), volné texty a ceny kontaktu zamaskované (R20), pořadí od nejnovější (shoda druh,
 * pak pořadí v rámci druhu sestupně), nejvýš 500.
 */
function prehledKontaktMock(me: MockUser, kontaktId: unknown): PrehledObalka<DataKontakt> {
  if (me.role !== 'super_admin') fail(PREHLED_JEN_SUPER);
  const c = kontaktPodleId(typeof kontaktId === 'number' ? kontaktId : Number(kontaktId));
  if (!c) fail(`Kontakt id=${String(kontaktId)} neexistuje.`);
  const x = kontextPrehledu(me, null);
  const u: (UdalostKontaktu & { poradi: number })[] = [];
  const pridej = (at: string | null | undefined, druh: UdalostKontaktu['druh'], text: string, osoba: number | null, zdroj: string, poradi: number, odkaz: string | null = null) => {
    if (at) u.push({ at, druh, text, osoba: osobaPrehledu(osoba), odkaz, zdroj, poradi });
  };
  const castkaMena = (castka: number, mena: MenaPrehledu | null) => `${castkaText(castka)} ${mena ?? 'CZK'}`;
  const vysl: Record<string, string> = { nedovolano: 'nedovoláno', odmitnuto: 'odmítnuto', zajem: 'zájem', nerelevantni: 'nerelevantní', preplanovano: 'přeplánováno' };
  for (const l of callLog.filter((l) => l.kontakt_id === c.id)) {
    pridej(l.created_at, 'hovor', `Hovor: ${vysl[l.outcome] ?? 'jiný výsledek'}${l.rating ? `, známka ${l.rating}` : ''}.`, l.user_id, 'hovory', l.id);
  }
  const VYSLEDKY_DOVOLANI: Record<string, string> = { chce_web: 'Chce web', mluvili: 'Mluvili jsme – co klient chce', nechce: 'Nechce web',
    nekontaktovat: 'Nechce, abychom ho kontaktovali', jine: 'Nic z toho výše' };
  for (const o of oznaceniRadky.filter((o) => o.kontakt_id === c.id && o.zavolano_at)) {
    pridej(o.zavolano_at, 'dovolani', `Zavolal/a jsem${o.vysledek && VYSLEDKY_DOVOLANI[o.vysledek] ? `, výsledek: ${VYSLEDKY_DOVOLANI[o.vysledek]}` : ''}.`, o.zavolano_kdo, 'dovolani', o.id);
  }
  (dovolaniUspesna.get(c.id) ?? []).forEach((at, i) => pridej(at, 'dovolani', 'Zavolal/a jsem.', null, 'dovolani', i + 1));
  // stav a ceny z historie: výchozí stav při jejím začátku (072, pozorování) a změny stavu z appky; ztráta po návrhu z ukázkových dat
  const nazev = (s: KontaktStatus | null) => (s === null ? '–' : STAVY_PREHLEDU.find((r) => r.klic === s)?.nazev ?? 'neznámý stav');
  const zmeny = HISTORIE_STAVU.filter((h) => h.kontakt_id === c.id);
  const stavNaZacatku = zmeny.length ? zmeny.slice().sort((a, b) => a.at.localeCompare(b.at))[0].stara : c.status;
  pridej(PREHLED_HISTORIE_OD, 'stav', `Stav při začátku historie: ${nazev(stavNaZacatku)}.`, null, 'historie', 1);
  pridej(PREHLED_HISTORIE_OD, 'cena', `Cena webu při začátku historie: ${bezKontaktu(c.cena_web) ?? '–'}.`, null, 'historie', 2);
  pridej(PREHLED_HISTORIE_OD, 'cena', `Cena hostingu při začátku historie: ${bezKontaktu(c.cena_hosting) ?? '–'}.`, null, 'historie', 3);
  zmeny.forEach((h, i) => pridej(h.at, 'stav', `Stav: ${nazev(h.stara)} → ${nazev(h.nova)}.`, null, 'historie', 10 + i));
  const z = PREHLED_ZTRATY.get(c.id);
  if (z) pridej(z, 'stav', `Stav: ${nazev('navrh_odeslan')} → ${nazev('odmitnuto')}.`, null, 'historie', 9);
  const navrh = navrhAt(c);
  if (navrh) pridej(navrh, 'navrh', 'První návrh webu.', null, 'navrhy', 0);
  for (const s of slevy.get(c.id) ?? []) {
    const r = cenaRozborMock(cenaZeSlevy(s.detail));
    pridej(s.created_at, 'sleva', `Nabídka za polovinu${r.stav === 'presne' ? ` (${castkaMena(Number(r.castka), r.mena)})` : ''}.`, null, 'slevy', 0);
  }
  for (const f of PREHLED_FAKTURY.filter((f) => f.kontakt_id === c.id)) {
    const r = fakturaRozbor(f.detail);
    pridej(f.at, 'faktura', `Faktura${r.cislo ? ` ${r.cislo}` : ''}${r.celkem !== null ? `: ${castkaMena(r.celkem, r.mena)}` : ''}.`, null, 'faktury', f.id);
  }
  for (const pl of platbyDoKDatu(x).filter((pl) => pl.c.id === c.id)) {
    pridej(pl.at, 'platba', `${pl.odvozeno ? 'Platba odvozená ze stavu zaplaceno' : 'Platba potvrzena'}${pl.castka !== null ? `: ${castkaMena(pl.castka, pl.mena)}` : ''}${
      pl.odvozeno ? '.' : pl.zdroj_castky === 'faktura' ? ' (podle faktury).' : ' (podle ceny prodeje).'}`, null, 'platby', 0);
  }
  const FAZE_ODMITNUTI: Record<FazeOdmitnuti, string> = { nahled: 'Odmítl náhled (návrh webu)', sleva: 'Odmítl nabídku za polovinu' };
  for (const d of duvodyRadky().filter((d) => d.kontakt_id === c.id)) {
    const text = bezKontaktu(d.text)?.trim();
    const zapsal = /^app:(\d+)$/.exec(d.zapsal ?? '');
    pridej(d.at, 'duvod', `Důvod odmítnutí (${FAZE_ODMITNUTI[d.faze]}): ${NAZVY_DUVODU[d.duvod]}${text ? ` – ${text}` : ''}.`, zapsal ? Number(zapsal[1]) : null, 'duvody', d.id);
  }
  const DRUH_ZPRAVY: Record<string, string> = { clovek: '', automaticka_odpoved: ' (automatická odpověď)', nedoruceno: ' (nedoručeno)', systemova: ' (systémová zpráva)', nezname: ' (neznámý druh)' };
  for (const m of PREHLED_ZPRAVY.filter((m) => m.kontakt_id === c.id)) {
    pridej(m.prijato_at, 'email', `${m.smer === 'prichozi' ? 'E-mail od klienta' : 'E-mail klientovi'}${DRUH_ZPRAVY[m.druh] ?? ' (neznámý druh)'}.`, null, 'gmail', m.id, odkazGmailu(m.vlakno_id));
  }
  const KATEGORIE_OZNACENI: Record<string, string> = { navrh: 'Neodpověděl na návrh', zmeny: 'Neodpověděl na změny' };
  for (const o of oznaceniRadky.filter((o) => o.kontakt_id === c.id)) {
    pridej(o.oznaceno_at, 'oznaceni', `Označeno k zavolání${KATEGORIE_OZNACENI[o.kategorie] ? `: ${KATEGORIE_OZNACENI[o.kategorie]}` : ''}.`, o.volajici_id, 'oznaceni', o.id);
  }
  const STAV_HOVORU: Record<string, string> = { ceka: ' (čeká).', hotovo: ' (hotovo).', zruseno: ' (zrušeno).' };
  for (const zv of zavolatRadky.filter((r) => r.kontakt_id === c.id)) {
    pridej(zv.created_at, 'zavolat', `Naplánovaný hovor na ${denCesky(zv.kdy)} ${casCesky(zv.kdy)}${STAV_HOVORU[zv.stav] ?? '.'}`, zv.user_id, 'zavolat', zv.id);
  }
  if (c.hvezda_at) pridej(c.hvezda_at, 'hvezda', 'Hvězda.', null, 'kontakty', 0);
  if (PRODANO_STAVY.includes(c.status)) {
    const cena = cenaKontaktu(c, datumProdeje(c));
    const text = cena.castka !== null ? castkaMena(cena.castka, cena.mena) : bezKontaktu(cena.text)?.trim() || 'neznámá';
    pridej(datumProdeje(c), 'prodej', `Prodáno: cena ${text}${cena.zdroj === 'sleva' ? ' (nabídka za polovinu).' : ' (cena webu).'}`, pripsanyClovek(c, 'posledni_zajem', x.kMs), 'prodeje', 0);
  }
  const cena = cenaKontaktu(c, PRODANO_STAVY.includes(c.status) ? datumProdeje(c) : x.kIso);
  const posledniVlakno = PREHLED_ZPRAVY.filter((m) => m.kontakt_id === c.id).sort((a, b) => b.prijato_at.localeCompare(a.prijato_at))[0];
  const udalosti = u.sort((a, b) => b.at.localeCompare(a.at) || (a.druh < b.druh ? -1 : a.druh > b.druh ? 1 : 0) || b.poradi - a.poradi).slice(0, 500)
    .map(({ poradi: _p, ...e }) => { void _p; return e; });
  const data: DataKontakt = {
    kontakt: {
      kontakt_id: c.id, jmeno: jmenoKontaktu(c), firma: c.firma ?? null, segment: segmentOf(c), obor: /^[^:]+:/.test(c.obor ?? '') ? c.obor : null, kraj: null, mesto: c.mesto ?? null,
      status: c.status, nazev_stavu: nazevStavu(c.status), status_od: vstupDoFaze(c), rating: c.rating ?? null, hvezda_at: c.hvezda_at ?? null,
      // texty cen bez telefonu a e-mailu (R20), rozbor z původního textu
      cena_web: bezKontaktu(c.cena_web), cena_hosting: bezKontaktu(c.cena_hosting),
      cena: cena.rozbor, hosting: hostingApi(c.cena_hosting), live_url: c.live_url, prvni_navrh_at: navrhAt(c), posledni_my_at: c.last_our_reply_at, posledni_klient_at: c.last_client_reply_at,
      gmail_odkaz: posledniVlakno ? odkazGmailu(posledniVlakno.vlakno_id) : null,
    },
    atribuce: {
      prvni_zajem: osobaPrehledu(pripsanyClovek(c, 'prvni_zajem', x.kMs)), posledni_zajem: osobaPrehledu(pripsanyClovek(c, 'posledni_zajem', x.kMs)), spravuje: osobaPrehledu(pripsanyClovek(c, 'spravuje', x.kMs)),
    },
    historie_od: PREHLED_HISTORIE_OD,
    udalosti,
  };
  return obalkaPrehledu(null, data, ['hovory', 'kontakty', 'prodeje', 'navrhy', 'slevy', 'faktury', 'platby', 'historie', 'gmail', 'duvody', 'oznaceni', 'zavolat'], []);
}

/** prehled_definice (§5.17). */
function prehledDefiniceMock(me: MockUser): PrehledObalka<DataDefinice> {
  if (me.role !== 'super_admin') fail(PREHLED_JEN_SUPER);
  const granularita = (zaklad: string) => (zaklad === 'k_datu' ? 'stav k okamžiku (k_datu); bez řady' : 'období filtru; řada po dnech, týdnech (po–ne) a měsících podle pražského kalendáře');
  const kvalita = (j: JednotkaMetriky) => (j === 'mena' || j === 'pocet_a_mena'
    ? 'Koruny a eura zvlášť, nikdy sečtené. Do součtu jdou jen přesné částky; rozsahy a neznámé ceny jsou v pokrytí a číslo je pak částečné. Bez zdroje je nedostupné.'
    : j === 'podil' ? 'Podíl ukazuje čitatel a jmenovatel. Když je jmenovatel 0, podíl nejde spočítat. Částečný je, když část jednotek chybí nebo období začíná před zdrojem.'
      : 'Částečné, když období začíná před začátkem zdroje nebo část jednotek chybí; bez zdroje nedostupné.');
  const data: DataDefinice = {
    metriky: KATALOG_PREHLEDU.map((m) => ({
      klic: m.klic, verze: 1, nazev: m.nazev, definice: m.definice, zaklad: m.zaklad, jednotka: m.jednotka, zdroje: m.zdroje.join(', '),
      granularita: granularita(m.zaklad), kvalita_pravidla: kvalita(m.jednotka), platne_od: '2026-11-17',
    })),
    duvody: DUVODY_ODMITNUTI.map((d) => ({ klic: d.kod, nazev: d.text, vyzaduje_text: d.kod === 'jine' })),
    odvozene_vysledky: [
      { klic: 'nereagoval_na_nabidku', nazev: 'Nereagoval ani na nabídku za polovinu', popis: 'událost sleva_vyprsela (tick: nabídka vypršela bez reakce)' },
      { klic: 'mlci_po_navrhu', nazev: 'Mlčí po návrhu', popis: 'otevřený klient s návrhem, mlčí víc než 5 pracovních dní (pravidlo označení, migrace 060)' },
      { klic: 'bez_duvodu', nazev: 'Důvod nezapsán', popis: 'klient po návrhu odmítl (stav odmitnuto), řádek v odmitnuti chybí' },
    ],
    faze_odmitnuti: [{ klic: 'nahled', nazev: 'Odmítl náhled (návrh webu)' }, { klic: 'sleva', nazev: 'Odmítl nabídku za polovinu' }],
    stavy: STAVY_PREHLEDU.map((s) => ({ ...s })),
    signaly_akci: SIGNALY_AKCI.map((s) => ({ ...s })),
    zdroje: ZDROJE_PREHLEDU.map((z) => ({ ...z })),
    kategorie_nakladu: KATEGORIE_VYUCTOVANI.map((k) => ({ ...k })),
    metriky_cilu: METRIKY_CILU.map((m) => ({ ...m })),
    varovani: VAROVANI_SABLONY.map((v) => ({ ...v })),
  };
  return obalkaPrehledu(null, data, [], []);
}

const mockApiZaklad: Api = {
  async login(username: string, password: string): Promise<Session> {
    await delay();
    const user = users.find((u) => u.username === username.trim() && u.active);
    if (!user || user.password !== password) {
      fail('Nesprávné přihlašovací jméno nebo heslo.');
    }
    const token = `demo-${user.id}-${Math.random().toString(36).slice(2)}`;
    sessions.set(token, user.id);
    return { token, user_id: user.id, display_name: user.display_name, role: user.role };
  },

  async logout(token: string): Promise<void> {
    await delay(60);
    sessions.delete(token);
  },

  async me(token: string): Promise<MeInfo> {
    await delay(60);
    const u = auth(token);
    return {
      user_id: u.id,
      username: u.username,
      display_name: u.display_name,
      role: u.role,
      manager_id: u.manager_id,
    };
  },

  async nextContact(token: string, segment: Segment = 'chata'): Promise<Kontakt | null> {
    await delay();
    const user = auth(token);
    // Výchozí 'chata' jako server: starý bundle volá bez segmentu a nesmí dostat architekta.
    // Výslovné null nebo smetí = chyba (migrace 028).
    checkSegment(segment, false);
    // Od migrace 064 (obory): nika jen ve stavu zapnuto a jen pro toho, kdo ji smí volat (R9), hlášky jako na serveru
    if (jeOborMock(segment)) {
      const n = oborNikyMock.find((x) => x.klic === segment)!;
      if (n.stav !== 'zapnuto') fail(`Obor ${n.nazev} zatím není spuštěný.`);
      if (!n.volaji_vsichni && !oborVolajiciMock.some((v) => v.segment === segment && v.user_id === user.id)) {
        fail(`Obor ${n.nazev} zatím volají jen vybraní volající.`);
      }
    }
    const cutoff = Date.now() - 2 * 3600 * 1000;
    // 0. průchod (db/migration_036_vlastni_karta.sql, audit APP-4): vlastní platná karta
    // v tomhle segmentu napřed, nejnovější; zámek se neposouvá. Reload tak ukáže tutéž kartu.
    const vlastni = kontakty
      .filter(
        (c) =>
          c.lock_by === user.id &&
          c.lock_at !== null &&
          new Date(c.lock_at).getTime() > cutoff &&
          (c.status === 'nekontaktovano' || c.status === 'nedovolano') &&
          segmentOf(c) === segment
      )
      .sort((a, b) => b.lock_at!.localeCompare(a.lock_at!) || b.id - a.id)[0];
    if (vlastni) return kartaSHovorem(user, vlastni);
    // 0b. průchod (migrace 050, Albert 21. 10. 2026, „call me at this time“): vlastní naplánovaný hovor, jehož čas
    // nastal (i po termínu), v tomhle segmentu a ve frontě; nejstarší první. Cizí zámek mladší 2 h ho přeskočí.
    const dosly = zavolatRadky
      .filter((z) => z.stav === 'ceka' && z.user_id === user.id && new Date(z.kdy).getTime() <= Date.now())
      .map((z) => ({ z, c: kontakty.find((x) => x.id === z.kontakt_id) }))
      .filter(
        (x): x is { z: MockZavolat; c: Kontakt } =>
          !!x.c &&
          VE_FRONTE(x.c.status) &&
          // Od migrace 064 (návrh 6.2): na nice přijde naplánovaný hovor z kterékoli zapnuté niky rodiny, kterou smí volat
          (segmentOf(x.c) === segment ||
            (jeOborMock(segment) && jeOborMock(segmentOf(x.c)) && oborSmiVolat(user.id, segmentOf(x.c)))) &&
          (x.c.lock_by === null || x.c.lock_at === null || new Date(x.c.lock_at).getTime() < cutoff || x.c.lock_by === user.id)
      )
      .sort((a, b) => new Date(a.z.kdy).getTime() - new Date(b.z.kdy).getTime() || a.c.id - b.c.id)[0];
    if (dosly) {
      dosly.c.lock_by = user.id;
      dosly.c.lock_at = now();
      dosly.c.updated_at = now();
      return kartaSHovorem(user, dosly.c);
    }
    // Musí zůstat shodné s db/migration_036_vlastni_karta.sql (tělo z 023 a 028):
    // jen nekontaktovano + nedovolano, jen zvolený segment, koho jsme dnes už volali
    // se dnes znovu nenabídne, a výběr je NÁHODNÝ (ne podle id); ⚠ od migrace 054 u architektů podle vrstev (pick, vrstvaFronty).
    // Migrace 050: kontakt s čekajícím naplánovaným hovorem nikomu (dostane ho jen ten, kdo má volat, průchod 0b).
    // Jen hovor AKTIVNÍHO člověka (recenze 21. 10. 2026): hovory deaktivovaného kontakty neblokují, super admin je
    // v kalendáři „Všichni volající“ přeřadí nebo zruší.
    const blokuje = (kid: number) =>
      zavolatRadky.some((z) => z.kontakt_id === kid && z.stav === 'ceka' && users.some((u) => u.id === z.user_id && u.active));
    const callable = kontakty.filter(
      (c) =>
        segmentOf(c) === segment &&
        (c.status === 'nekontaktovano' || c.status === 'nedovolano') &&
        (c.lock_by === null ||
          c.lock_at === null ||
          new Date(c.lock_at).getTime() < cutoff ||
          c.lock_by === user.id) &&
        !blokuje(c.id)
    );
    const lastCall = (c: Kontakt) =>
      Math.max(
        0,
        ...callLog
          .filter((l) => l.kontakt_id === c.id)
          .map((l) => new Date(l.created_at).getTime())
      );
    // Migrace 054 (Albert 25. 10. 2026): v každém průchodu napřed nejnižší vrstva (vrstvaFronty: architekt bez webu
    // s méně než 2 nedovoláními, pak s webem, pak bez webu po 2 a víc nedovoláních), v ní náhodně; u chat vždy vrstva 0,
    // tedy náhodně jako dřív.
    const nedovolani = (c: Kontakt) => callLog.filter((l) => l.kontakt_id === c.id && l.outcome === 'nedovolano').length;
    const pick = (pool: Kontakt[]) => {
      if (pool.length === 0) return null;
      const v = pool.map((c) => vrstvaFronty(segment, c.web, c.ma_web, nedovolani(c)));
      const nejnizsi = Math.min(...v);
      const z = pool.filter((_, i) => v[i] === nejnizsi);
      // Od migrace 064 (R7): za vrstvou (beze změny) pořadí niky oboru, v něm náhodně; u chat a architektů vždy 0, takže z2 = z
      const o = z.map((c) => poradiFronty(segment, c.web_priorita, c.web_hodnoceni, nedovolani(c)));
      const nejmensi = Math.min(...o);
      const z2 = z.filter((_, i) => o[i] === nejmensi);
      return z2[Math.floor(Math.random() * z2.length)];
    };
    const next =
      // 1. průchod: dnes na ně nikdo nevolal
      pick(callable.filter((c) => lastCall(c) < startOfToday())) ??
      // 2. průchod (záloha): povolí opakování, ale ne do 4 hodin
      pick(callable.filter((c) => lastCall(c) < Date.now() - 4 * 3600 * 1000));
    if (!next) return null;
    next.lock_by = user.id;
    next.lock_at = now();
    next.updated_at = now();
    return kartaSHovorem(user, next); // volajícímu bez IČO architekta (037); klíč zavolat (050)
  },

  async oborNiky(token: string): Promise<OborNika[]> {
    await delay(60);
    // app_obor_niky (migrace 064): volající jen niky, které smí volat; super admin všechny i se stavem
    const user = auth(token);
    const zaklad = (n: MockNika): OborNika => ({
      klic: n.klic,
      nazev: n.nazev,
      nazev_mnozne: n.nazev_mnozne,
      nazev_akuzativ: n.nazev_akuzativ,
      nazev_jednotne: n.nazev_jednotne,
      ikona: n.ikona,
      poradi: n.poradi,
      cena_web_vzor: n.cena_web_vzor,
      cena_funkce_vzor: n.cena_funkce_vzor,
      hosting_vzor: n.hosting_vzor,
      jak_volat: n.jak_volat,
      smi_volat: oborSmiVolat(user.id, n.klic),
    });
    const sup = user.role === 'super_admin';
    return [...oborNikyMock]
      .sort((a, b) => (a.poradi ?? 9999) - (b.poradi ?? 9999) || a.klic.localeCompare(b.klic))
      .filter((n) => sup || oborSmiVolat(user.id, n.klic))
      .map((n) => (sup ? { ...zaklad(n), stav: n.stav, stav_od: n.stav_od, stav_duvod: n.stav_duvod ?? null, volaji_vsichni: n.volaji_vsichni } : zaklad(n)));
  },

  async zavolatJinde(token: string, segment: Segment): Promise<{ segment: Segment; pocet: number }[]> {
    await delay(60);
    // app_zavolat_jinde (migrace 064): vlastní čekající hovory, jejichž čas nastal, u kontaktu ve frontě v jiném segmentu;
    // niky jen ty, které smí volat; volajícímu na nice se ostatní zapnuté niky nepočítají (dá mu je průchod 0b)
    const user = auth(token);
    if (segment === null || segment === undefined || !segmentPlatnyMock(segment)) {
      fail(`Neplatný segment: ${segment === null || segment === undefined ? '(nic)' : String(segment)}. Povolené: chata, architekt nebo obor z registru.`);
    }
    const rodina = jeOborMock(segment) && oborSmiVolat(user.id, segment);
    const pocty = new Map<string, number>();
    for (const z of zavolatRadky) {
      if (z.stav !== 'ceka' || z.user_id !== user.id || new Date(z.kdy).getTime() > Date.now()) continue;
      const c = kontakty.find((x) => x.id === z.kontakt_id);
      if (!c || !VE_FRONTE(c.status)) continue;
      const s = segmentOf(c);
      if (s === segment) continue;
      if (jeOborMock(s) && !oborSmiVolat(user.id, s)) continue;
      if (rodina && jeOborMock(s)) continue;
      pocty.set(s, (pocty.get(s) ?? 0) + 1);
    }
    return [...pocty.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([s, pocet]) => ({ segment: s, pocet }));
  },

  async returnContact(token: string, id: number): Promise<{ ok: boolean; kontakt_id: number }> {
    await delay(60);
    // vratit_do_fronty (migrace 028, DB-7): jen vlastní zámek, jen volatelný stav, jen do
    // 30 minut od vzetí karty, nejvýš 10 karet za hodinu na člověka. Nepíše call_log, nemění
    // stav ani poznámku (server píše jen událost vraceno_do_fronty).
    const user = auth(token);
    const kontakt = kontakty.find((c) => c.id === id);
    if (!kontakt) fail(`Kontakt ${id} neexistuje.`);
    if (kontakt.lock_by !== user.id) fail(`Kontakt ${id} nemáte zamčený. Nic se nevrátilo.`);
    // migrace 046 (dvě recenze 045, 20. 10. 2026): bez stavu v textu (⚠ NAHRAZUJE „(stav …)“ z migrace 028)
    if (kontakt.status !== 'nekontaktovano' && kontakt.status !== 'nedovolano') {
      fail(`Kontakt ${id} už není ve frontě volání. Nic se nevrátilo.`);
    }
    if (kontakt.lock_at !== null && new Date(kontakt.lock_at).getTime() < Date.now() - 30 * 60 * 1000) {
      fail('Kartu máte déle než 30 minut. Zapište výsledek hovoru, zámek sám vyprší do 2 hodin.');
    }
    // strop 10 vrácení za hodinu na člověka (revize 28. 9., sonda P3; audit APP-5): bez něj
    // by se přepínáním dalo listovat celými kartami bez jediného záznamu hovoru
    const zaHodinu = vraceniDoFronty.filter((v) => v.user_id === user.id && v.at > Date.now() - 3600 * 1000).length;
    if (zaHodinu >= 10) {
      fail(`Za poslední hodinu jste bez výsledku hovoru vrátili do fronty už ${zaHodinu} karet (strop 10 za hodinu). Zapište výsledek hovoru.`);
    }
    vraceniDoFronty.push({ user_id: user.id, at: Date.now() });
    kontakt.lock_by = null;
    kontakt.lock_at = null;
    kontakt.updated_at = now();
    return { ok: true, kontakt_id: id };
  },

  async resolveCall(token: string, args: ResolveCallArgs) {
    await delay();
    const user = auth(token);
    const { outcome } = args;
    // migrace 050 (Albert 21. 10. 2026): i nerelevantni a preplanovano. ⚠ NAHRAZUJE jen tři výsledky (015).
    if (!['nedovolano', 'odmitnuto', 'zajem', 'nerelevantni', 'preplanovano'].includes(outcome)) {
      fail(`Neplatný výsledek hovoru: ${outcome ?? '(null)'}. Povolené: nedovolano, odmitnuto, zajem, nerelevantni, preplanovano.`);
    }
    const rating = (args.rating ?? '').trim();
    if (rating && !['A', 'B', 'C'].includes(rating)) {
      fail(`Neplatný rating: ${rating}. Povolené: A, B, C.`);
    }
    // ⚠ Migrace 051 (Albert 22. 10. 2026: „make the web and hosting price optional at Mají zájem“) NAHRAZUJE povinnou cenu
    // webu a hostingu (hlášky „vyžaduje vyplněnou cenu webu / hostingu“ jsou pryč); povinná zůstává jen známka.
    if (outcome === 'zajem') {
      if (!['A', 'B', 'C'].includes(rating)) fail('Výsledek "zajem" vyžaduje rating A, B nebo C.');
    }
    // migrace 050: přeplánovaný hovor potřebuje čas (od teď do roka, app_zavolat_over_kdy)
    const kdy = outcome === 'preplanovano' ? overKdy(args.kdy) : null;
    // po recenzi 21. 10. 2026: přeplánovat nejdřív za 15 minut (kdo chce mluvit hned, s tím se hovor dokončí teď)
    if (kdy !== null && new Date(kdy).getTime() < Date.now() + 15 * 60 * 1000) {
      fail('Přeplánovat jde nejdřív za 15 minut. Když chce člověk mluvit hned, dokončete hovor teď.');
    }
    // Migrace 046 (dvě recenze 045, 20. 10. 2026): poznámka z hovoru je v poznámce kontaktu jeden řádek s hlavičkou
    // „[datum Jméno]“. ⚠ NAHRAZUJE víceřádkový zápis (migrace 029): řádky pod hlavičkou nenesly jméno a kolega je mohl
    // upravit nebo smazat. Konce řádků (i Unicode) jako mezera, strop 2 000 znaků, Volající v ní hlavičku s datem
    // jen se svým jménem (super admin a Albert beze změny). Všechno před načtením kontaktu, jako na serveru.
    if ([...(args.note ?? '')].length > 2000) fail('Poznámka z hovoru je moc dlouhá: nejvýš 2 000 znaků.');
    // recenze 046 (20. 10. 2026; ⚠ NAHRAZUJE „hlavička kdekoli v poznámce“): hlavička jen na začátku řádku, jak je Volající
    // napsal, proto PŘED spojením řádků; datum v závorkách uprostřed řádku projde
    const note = args.note ?? '';
    if (user.id !== OWNER_ID && user.role !== 'super_admin' && hlavickaCizi(note, [user.display_name]) !== null) {
      fail('Poznámka z hovoru nesmí mít hlavičku „[datum jméno]“ s jiným jménem než vaším (ani jméno kolegy, „jiný volající“ nebo prázdné). Hlavičku s datem a vaším jménem připíše zápis hovoru sám.');
    }
    const jedenRadek = oriznoutMezery(note.replace(/[\n\v\f\r\u0085\u2028\u2029]+/g, ' '));
    // migrace 050: nerelevantní kontakt jen s důvodem (super admin vidí, proč se nezapočítal do konverze)
    if (outcome === 'nerelevantni' && jedenRadek === '') {
      fail('Výsledek "nerelevantni" vyžaduje poznámku, proč kontakt není relevantní (třeba starší člověk, není majitel).');
    }
    const kontakt = kontakty.find((c) => c.id === args.kontakt_id);
    if (!kontakt) fail(`Kontakt id=${args.kontakt_id} neexistuje.`);
    // KONTROLA VLASTNICTVÍ (migrace 015): v mocku dřív chyběla, takže demo nikdy neukázalo,
    // co se stane s kartou po vrácení do fronty nebo po přepnutí segmentu.
    if (kontakt.lock_by !== user.id) {
      fail('Tenhle kontakt teď nemáte přidělený (zámek patří někomu jinému). Načtěte si dalšího.');
    }
    // migrace 046 (dvě recenze 045, 20. 10. 2026): bez stavu v textu (⚠ NAHRAZUJE „(…)“ se stavem z migrace 015): kartu,
    // kterou Volající drží a kterou mezitím někdo posunul, nevidí se stavem, chyba ho neprozradí
    if (kontakt.status !== 'nekontaktovano' && kontakt.status !== 'nedovolano') {
      fail('Kontakt už není ve frontě volání, váš zámek na něj tedy neplatí. Načtěte si dalšího.');
    }

    callLog.push({
      id: nextCallLogId++,
      kontakt_id: kontakt.id,
      user_id: user.id,
      outcome,
      created_at: now(),
      rating: rating ? (rating as Rating) : null,
    });

    // preplanovano -> nedovolano (zůstává ve frontě, drží ho kalendář), ostatní výsledky = stav (050)
    const novyStav: KontaktStatus = outcome === 'preplanovano' ? 'nedovolano' : (outcome as KontaktStatus);
    // migrace 057: změna stavu posune status_changed_at jako trigger na serveru (migrace 013)
    if (kontakt.status !== novyStav) {
      kontakt.status_changed_at = now();
      zapisZmenuStavu(kontakt.id, kontakt.status, novyStav);
    }
    kontakt.status = novyStav;
    kontakt.last_caller = user.display_name;
    kontakt.lock_by = null;
    kontakt.lock_at = null;
    if (rating) kontakt.rating = rating as Rating;
    // migrace 051 (po revizi DB 22. 10. 2026): coalesce(case when app_cena_nezadana(p) then null else trim(p) end, stávající)
    // jako server: prázdné pole ani napsaná výplň („n/a“, „x“, „0“) nikdy neuloží '' ani text „n/a“ a cenu, která u kontaktu
    // už je, nesmaže (stejně jako známka); skutečná cena se uloží oříznutá (trim v SQL = jen obyčejné mezery). ⚠ NAHRAZUJE
    // coalesce(nullif(trim(p), ''), stávající) z první verze 051, která napsané „n/a“ uložila jako text.
    if (outcome === 'zajem') {
      const web = cenaNezadanaMock(args.cena_web) ? null : oriznoutMezery(args.cena_web ?? '');
      const hosting = cenaNezadanaMock(args.cena_hosting) ? null : oriznoutMezery(args.cena_hosting ?? '');
      kontakt.cena_web = web ?? kontakt.cena_web;
      kontakt.cena_hosting = hosting ?? kontakt.cena_hosting;
    }
    const email = (args.email ?? '').trim();
    if (email) kontakt.email = email;
    // Pravidlo z migrace 005 (vrácené migrací 029): e-mail zapsaný při hovoru ruší e-mailový
    // příznak. Ostatní příznaky zůstávají, prázdné pole nic neruší.
    if (email && (kontakt.flag_kind === 'chybi_email' || kontakt.flag_kind === 'email_neoveren')) {
      kontakt.flag_kind = null;
      kontakt.flag_note = null;
      kontakt.flagged_at = null;
      kontakt.flagged_by = null;
    }
    if (jedenRadek) {
      const stamp = `[${new Date().toISOString().slice(0, 10)} ${user.display_name}] ${jedenRadek}`;
      kontakt.note = kontakt.note ? `${kontakt.note}\n${stamp}` : stamp;
    }
    kontakt.updated_at = now();
    // Migrace 050: kalendář hovorů. Přeplánováno = vlastní čekající hovor kontaktu se přesune, nebo vznikne (cizí
    // čekající hovor téhož kontaktu se zruší: hovor teď převzal on). Každý jiný výsledek vlastní čekající hovor uzavře
    // (hotovo) a cizí zruší, jen když kontakt frontu opustil.
    const z = cekajiciHovor(kontakt.id);
    if (outcome === 'preplanovano') {
      const pozn = jedenRadek === '' ? null : [...jedenRadek].slice(0, 500).join('');
      if (z && z.user_id === user.id) {
        z.kdy = kdy!;
        z.poznamka = pozn ?? z.poznamka;
        z.zmenil_id = user.id;
        z.zmeneno_at = now();
      } else {
        if (z) {
          // neutrální text (po recenzi 21. 10. 2026): kdo hovor převzal, se u cizího hovoru neříká
          z.stav = 'zruseno';
          z.uzavreno_at = now();
          z.vysledek = drziAktivni(z) ? 'přeplánováno při jiném hovoru' : NEAKTIVNI;
        }
        zavolatRadky.push({
          id: nextZavolatId++, kontakt_id: kontakt.id, user_id: user.id, kdy: kdy!, poznamka: pozn, stav: 'ceka', vysledek: null,
          rezervace: false, puvodni_last_caller: null, vytvoril_id: user.id, created_at: now(), zmenil_id: null, zmeneno_at: null,
          uzavreno_at: null,
        });
      }
    } else if (z && (z.user_id === user.id || !VE_FRONTE(novyStav) || !drziAktivni(z))) {
      // cizí hovor se zruší, když kontakt opustil frontu nebo když ho drží deaktivovaný člověk (recenze 21. 10. 2026)
      const muj = z.user_id === user.id;
      z.stav = muj ? 'hotovo' : 'zruseno';
      z.uzavreno_at = now();
      z.vysledek = muj ? `hovor: ${outcome}` : !drziAktivni(z) ? NEAKTIVNI : 'kontakt už není ve frontě volání';
    }
    return { ok: true, kontakt_id: kontakt.id, status: kontakt.status };
  },

  async myStats(token: string): Promise<MyStats> {
    await delay();
    const user = auth(token);
    return statsFor(user.id);
  },

  async allStats(token: string, den: string | null = null): Promise<UserStats[]> {
    await delay();
    const me = auth(token);
    if (me.role !== 'super_admin') fail('Statistiky ostatních vidí jen super admin.');
    // migrace 056: p_den je na serveru typ date, nečitelný text odmítne Postgres sám
    if (den !== null && den !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(den)) fail(`invalid input syntax for type date: "${den}"`);
    const d = den ?? null;
    const ids = visibleIds(me);
    return users
      .filter((u) => ids.includes(u.id))
      .map((u) => {
        // migrace 056: navíc nerelevantní a přeplánované hovory (jako statistiky_volani), s dnem jen toho dne
        const hovory = callLog.filter((l) => l.user_id === u.id && (d === null || denPraha(new Date(l.created_at)) === d));
        return {
          user_id: u.id,
          username: u.username,
          display_name: u.display_name,
          role: u.role,
          active: u.active,
          manager_id: u.manager_id,
          manager_name: users.find((m) => m.id === u.manager_id)?.display_name ?? null,
          ...statsFor(u.id, d),
          nerelevantni: hovory.filter((l) => l.outcome === 'nerelevantni').length,
          preplanovano: hovory.filter((l) => l.outcome === 'preplanovano').length,
        };
      })
      .sort((a, b) => b.calls - a.calls);
  },

  async topSeller(token: string): Promise<{ je_prvni: boolean }> {
    await delay(60);
    const me = auth(token);
    // migrace 045 (Albert 20. 10. 2026): „jsi #1?“ je žebříček kolegů, Volajícímu ne
    if (me.role !== 'super_admin') fail('Žebříček prodejců vidí jen super admin.');
    const best = users
      .map((u) => ({ id: u.id, ...statsFor(u.id) }))
      .sort((a, b) => b.sold - a.sold || b.calls - a.calls || a.id - b.id)[0];
    return { je_prvni: !!best && best.sold > 0 && best.id === me.id };
  },

  async listKontakty(token: string, f: ListKontaktyFilters): Promise<ListKontaktyResult> {
    await delay();
    // Kontakty vidí všichni (migrace 023), ⚠ od 045 (Albert 20. 10. 2026) Volající u cizího kontaktu jen allowlist
    // (forViewer, KLICE_CIZI), NAHRAZUJE „se stavy“; filtr podle volajícího jen sebe / své lidi.
    const me = auth(token);
    // migrace 074 (kontrakt §6.1): výběr lidí napřed (Volající jen sám sebe, dnešní větou), pak spolu s p_caller odmítnut
    const vyberLidi = idsVyberu(f.user_ids);
    if (vyberLidi) {
      overVyber(me, vyberLidi, 'Podle volajícího můžete filtrovat jen sebe.');
      if (f.caller) fail(VYBER_DVAKRAT);
    }
    // sjednocení dnešního p_caller za každého vybraného: last_caller = jméno kohokoli z nich (neznámé id nic nenajde)
    const jmenaVyberu = vyberLidi ? namesOf(vyberLidi) : null;
    checkSegment(f.segment, true);
    checkRazeni(f.razeni);
    // migrace 060: nové filtry (známka, kategorie označení) se kontrolují jako na serveru; označení jako po ticku
    checkFiltry060(f);
    obnovOznaceni();
    if (f.caller && me.id !== OWNER_ID && !namesOf(visibleIds(me)).includes(f.caller)) {
      fail(`Podle volajícího můžete filtrovat jen sebe${me.role === 'super_admin' ? ' a své lidi' : ''}.`);
    }
    const search = (f.search ?? '').trim().toLowerCase();
    // osobní IČO jen CELÝM číslem (mezery se ignorují) a jen u řádků, které smí upravit;
    // IČO ateliéru kouskem, ale ne když se rovná osobnímu (migrace 028 a 032, audit APP-5);
    // volající podle IČO nehledá vůbec (migrace 038, Albert 3. 10. 2026)
    const icoHledane = (f.search ?? '').replace(/\s/g, '');
    const icoShoda = (c: Kontakt) =>
      icoVidi(me.role) &&
      ((!!c.ico_osobni && c.ico_osobni === icoHledane && canEdit(me, c.id)) ||
        (!!c.ico_firma && c.ico_firma !== c.ico_osobni && c.ico_firma.toLowerCase().includes(search)));
    // jména lidí, které přihlášený vidět nesmí: hledání je v poznámkách nenajde, stejná maska jako řádky (migrace 045)
    const { cizi, vidi } = jmenaPro(me);
    // Volající vidí stav jen u svých klientů (migrace 045, Albert 20. 10. 2026): filtr stavu, známky a čekání
    // a hledání v poznámce jen nad jeho klienty, cizí kontakty za jeho jen podle id (jako server)
    const vidiCisla = me.id === OWNER_ID || me.role === 'super_admin';
    const jenSvoje = !vidiCisla;
    const moje = myKontaktIds(me);
    const skryty = (c: Kontakt) => jenSvoje && !moje.has(c.id);
    // migrace 060 (Albert 1. 11. 2026: „never revealing anything about other callers“): i nové filtry (stav víc najednou,
    // známka, hvězda, označení, mlčení) berou Volajícímu jen jeho klienty, cizí kontakt nesedí nikdy
    const filtrStavu = !!(f.status || f.rating || f.cekani || f.kos) || filtr060(f);
    // migrace 057: čí hovory se počítají do posledního hovoru (super admin a Albert všech, Volající jen svoje)
    const od = hovoryOd(me);
    const poznamkaVHledani = (c: Kontakt) => (skryty(c) ? null : poznamkaBezCizich(c.note, cizi, vidi));
    // migrace 048 (audit soukromí 20. 10. 2026): e-mail cizí chaty Volající nevyhledá (jako poznámku), architekta ano
    const emailVHledani = (c: Kontakt) => (skryty(c) && segmentOf(c) === 'chata' ? null : c.email);
    const matches = (c: Kontakt) =>
      (!f.segment || segmentOf(c) === f.segment) &&
      (!filtrStavu || !skryty(c)) &&
      (!f.status || c.status === f.status) &&
      (!f.caller || c.last_caller === f.caller) &&
      (!jmenaVyberu || (c.last_caller !== null && jmenaVyberu.includes(c.last_caller))) &&
      (!f.rating || c.rating === f.rating) &&
      (!f.cekani || cekaniOf(c).kind === f.cekani) &&
      (!f.kos || kosOfMock(cekaniOf(c).since) === f.kos) &&
      // migrace 060: nové filtry (Volajícímu jen jeho označení, `od`)
      sedi060(c, f, od) &&
      // hledání i ve studiu, městě a IČO (migrace 028), IČO podle icoShoda výš
      (!search ||
        icoShoda(c) ||
        [c.name, c.phone, c.web, emailVHledani(c), poznamkaVHledani(c), c.firma, c.mesto].some(
          (v) => v && v.toLowerCase().includes(search)
        ));
    const filtered = kontakty.filter(matches).sort((a, b) => {
      // Volající: napřed jeho klienti, cizí jen podle id (stav, čekání ani datum změny cizího pořadí neurčují)
      if (skryty(a) !== skryty(b)) return skryty(a) ? 1 : -1;
      if (skryty(a)) return a.id - b.id;
      // migrace 056 a 057: podle poslední změny nebo posledního hovoru (Volajícímu jen mezi jeho klienty a jen jeho hovory,
      // cizí výš jen podle id), shoda = výchozí pořadí
      const zm = podleRazeni(f.razeni, a, b, od);
      if (zm !== 0) return zm;
      // při filtru čekání: nejdéle čekající nahoře (Albert 2026-09-07)
      if (f.cekani) {
        const sa = cekaniOf(a).since ?? '';
        const sb = cekaniOf(b).since ?? '';
        if (sa !== sb) return sa < sb ? -1 : 1;
      }
      const oa = STATUS_ORDER[a.status] ?? 40;
      const ob = STATUS_ORDER[b.status] ?? 40;
      if (oa !== ob) return oa - ob;
      const ua = new Date(a.updated_at).getTime();
      const ub = new Date(b.updated_at).getTime();
      if (ua !== ub) return ub - ua;
      return a.id - b.id;
    });
    const offset = Math.max(f.offset ?? 0, 0);
    // Volající nejvýš 200 řádků na stránku (recenze 045, 20. 10. 2026: s velkým limitem by dostal celou databázi)
    const limit = vidiCisla ? Math.max(f.limit ?? 200, 1) : Math.min(Math.max(f.limit ?? 200, 1), 200);
    return {
      // součty celé databáze jen super admin a Albert (migrace 045); Volající jen „je další stránka?“
      total: vidiCisla ? filtered.length : null,
      dalsi: filtered.length > offset + limit,
      rows: filtered.slice(offset, offset + limit).map((c) => {
        // migrace 057: posledni_zmena a posledni_hovor před maskou (cizí kontakt Volajícího je nedostane, jako server)
        const cc = sPoslednimi(c, od);
        // cizí kontakt Volajícího bez čekání (je to průběh), jako server (cekani_* nejsou v allowlistu)
        if (skryty(c)) return forList(me, cc);
        const cek = cekaniOf(c);
        return {
          ...forList(me, cc),
          cekani_kind: cek.kind,
          cekani_since: cek.since,
          cekani_kos: kosOfMock(cek.since),
        };
      }),
    };
  },

  async myKontakty(
    token: string,
    limit = 200,
    offset = 0,
    userId: number | null = null,
    segment: Segment | null = null,
    filtry: MojiFiltry | null = null
  ): Promise<ListKontaktyResult> {
    await delay();
    const user = auth(token);
    // migrace 074 (kontrakt §6.2): výběr lidí napřed (Volající jen sám sebe, dnešní větou), pak spolu s p_user_id odmítnut
    const vyberLidi = idsVyberu(filtry?.user_ids);
    if (vyberLidi) {
      overVyber(user, vyberLidi, 'Klienty jiného člověka vidí jen jeho super admin.');
      if (userId !== null && userId !== undefined) fail(VYBER_DVAKRAT);
    }
    checkSegment(segment, true);
    // migrace 056: řazení napřed (jako server), pak výběr člověka
    checkRazeni(filtry?.razeni);
    mayPick(user, userId, 'Klienty');
    // migrace 060: nové filtry jako server, označení jako po ticku
    checkFiltry060(filtry);
    obnovOznaceni();
    // migrace 074: klienti kohokoli z vybraných (app_kontakty_uzivatelu(p_user_ids)), každý jednou
    const ids = vyberLidi ? kontaktyOf(vyberLidi) : kontaktyOf([userId ?? user.id]);
    // Migrace 056 (Albert 27. 10. 2026: v Moji klienti stejné filtry jako v Kontaktech): stav, známka, čekání, koš
    // a hledání jako listKontakty nad klienty vybraného člověka. Řádky jsou celé (Volající jen svoje, super admin
    // vidí všechny), hledání v poznámce ale přes stejnou masku jmen kolegů jako řádky (Volající jméno kolegy nenajde).
    const f: MojiFiltry = filtry ?? {};
    const search = (f.search ?? '').trim().toLowerCase();
    const icoHledane = (f.search ?? '').replace(/\s/g, '');
    const icoShoda = (c: Kontakt) =>
      icoVidi(user.role) &&
      ((!!c.ico_osobni && c.ico_osobni === icoHledane && canEdit(user, c.id)) ||
        (!!c.ico_firma && c.ico_firma !== c.ico_osobni && c.ico_firma.toLowerCase().includes(search)));
    const { cizi, vidi } = jmenaPro(user);
    // migrace 057: čí hovory se počítají do posledního hovoru (super admin a Albert všech, Volající jen svoje)
    const od = hovoryOd(user);
    // jako server: poznámka sedí, když hledaný text má uložená poznámka i ta, kterou přihlášený vidí (maska jmen kolegů)
    const poznamkaShoda = (c: Kontakt) =>
      !!c.note &&
      c.note.toLowerCase().includes(search) &&
      (cizi.length === 0 || (poznamkaBezCizich(c.note, cizi, vidi) ?? '').toLowerCase().includes(search));
    const filtered = kontakty
      .filter(
        (c) =>
          ids.has(c.id) &&
          (!segment || segmentOf(c) === segment) &&
          (!f.status || c.status === f.status) &&
          (!f.rating || c.rating === f.rating) &&
          (!f.cekani || cekaniOf(c).kind === f.cekani) &&
          (!f.kos || kosOfMock(cekaniOf(c).since) === f.kos) &&
          // migrace 060 (Albert 1. 11. 2026): nové filtry i pro Volajícího (nad jeho klienty, jen jeho označení)
          sedi060(c, f, od) &&
          (!search ||
            icoShoda(c) ||
            poznamkaShoda(c) ||
            [c.name, c.phone, c.web, c.email, c.firma, c.mesto].some((v) => v && v.toLowerCase().includes(search)))
      )
      .sort((a, b) => {
        // migrace 056 a 057: podle poslední změny nebo posledního hovoru, pak s filtrem čekání nejdéle čekající nahoře
        const zm = podleRazeni(f.razeni, a, b, od);
        if (zm !== 0) return zm;
        if (f.cekani) {
          const sa = cekaniOf(a).since ?? '';
          const sb = cekaniOf(b).since ?? '';
          if (sa !== sb) return !sa ? 1 : !sb ? -1 : sa < sb ? -1 : 1;
        }
        const oa = STATUS_ORDER[a.status] ?? 40;
        const ob = STATUS_ORDER[b.status] ?? 40;
        if (oa !== ob) return oa - ob;
        const ua = new Date(a.updated_at).getTime();
        const ub = new Date(b.updated_at).getTime();
        if (ua !== ub) return ub - ua;
        return a.id - b.id;
      });
    const off = Math.max(offset, 0);
    const lim = Math.max(limit, 1);
    return {
      total: filtered.length,
      // migrace 056: řádky nesou čekání jako v Kontaktech (sloupec Čeká při filtru čekání)
      rows: filtered.slice(off, off + lim).map((c) => {
        const cek = cekaniOf(c);
        // migrace 057: posledni_zmena a posledni_hovor před maskou (jako server)
        return { ...forList(user, sPoslednimi(c, od)), cekani_kind: cek.kind, cekani_since: cek.since, cekani_kos: kosOfMock(cek.since) };
      }),
    };
  },

  async updateKontakt(token: string, id: number, patch: Record<string, unknown>): Promise<Kontakt> {
    await delay();
    const me = authAdmin(token);
    // Pořadí kontrol jako update_kontakt na serveru (migrace 046, dvě recenze 045 z 20. 10. 2026): prázdný patch, povolená
    // pole, kontakt existuje, strop délky, vlastní klient, obsah, last_caller, poznámky, druh příznaku, pole architekta.
    // ⚠ NAHRAZUJE pořadí mocku „kontakt existuje, vlastní klient, obsah, last_caller, prázdný patch, povolená pole“.
    // migrace 028 přidává pole architekta; segment ani zdroj telefonu appka nemění (import)
    const allowed = [
      'phone', 'name', 'ma_web', 'web', 'email', 'note', 'status', 'rating',
      'cena_web', 'cena_hosting', 'last_caller', 'obor',
      'lovable_project_id', 'live_url', 'clear_lock',
      'flag_kind', 'flag_note',
      'firma', 'mesto', 'ico_osobni', 'ico_firma', 'dph_osobni', 'dph_firma',
      // migrace 059: důvod ruční změny stavu (jen se status)
      'status_duvod',
    ];
    if (!patch || Object.keys(patch).length === 0) fail('Prázdný patch — není co měnit.');
    for (const key of Object.keys(patch)) {
      if (!allowed.includes(key)) {
        fail(`Pole "${key}" nelze měnit přes update_kontakt. Povolená: ${allowed.join(', ')}`);
      }
    }
    const kontakt = kontakty.find((c) => c.id === id);
    if (!kontakt) fail(`Kontakt id=${id} neexistuje.`);
    // Volající u kontaktu, kterému nevolal, nevidí stav, poznámky, příznak ani zámek, takže je ani nemění (migrace
    // 045, Albert 20. 10. 2026; ⚠ NAHRAZUJE „příznak a zámek u každého kontaktu“ pro Volající)
    if (me.id !== OWNER_ID && me.role !== 'super_admin' && !myKontaktIds(me).has(id)) {
      fail('Tohle není váš klient: u kontaktu, kterému jste nevolal/a, nevidíte ani neměníte stav, poznámky, příznak ani zámek. Upraví ho ten, kdo mu volá, jeho super admin nebo Albert.');
    }
    // migrace 061 (Albert 2. 11. 2026): příznak info_neoverene Volající nevidí, takže ho tu nezruší, nezmění ani mu
    // nepřepíše poznámku (jako clear_flag); svůj příznak místo něj dá přes setFlag (jako server)
    if (('flag_kind' in patch || 'flag_note' in patch) && me.id !== OWNER_ID && me.role !== 'super_admin'
        && kontakt.flag_kind === 'info_neoverene') {
      fail(INFO_JEN_SUPER);
    }
    // obsah jen u vlastních klientů; příznak a zámek super admin u každého kontaktu (migrace 024, 045)
    const vsude = ['clear_lock', 'flag_kind', 'flag_note'];
    if (Object.keys(patch).some((key) => !vsude.includes(key)) && !canEdit(me, id)) {
      fail('Tohle není váš klient — upravit ho může ten, kdo mu volá, jeho super admin nebo Albert. Příznak a zámek u něj měnit smíte.');
    }
    // komu kontakt patří (last_caller) mění jen super admin, a jen na své lidi (migrace 023)
    if ('last_caller' in patch) {
      if (me.role !== 'super_admin') fail('Přeřadit kontakt jinému volajícímu smí jen super admin.');
      const v = String(patch.last_caller ?? '').trim();
      if (v && me.id !== OWNER_ID && !namesOf(ownPeopleIds(me)).includes(v)) {   // migrace 027: jen na SVÉ lidi
        fail('Kontakt můžete přeřadit jen sobě nebo svým lidem.');
      }
    }
    // Migrace 059 (Albert 30. 10. 2026): změna stavu chce krátký důvod (status_duvod, nejvýš 500 znaků), Albert ne; server
    // zapíše událost stav_rucne se starým a novým stavem a důvodem (mock události nevede). Stejné hlášky jako server.
    if ('status_duvod' in patch && !('status' in patch)) {
      fail('Důvod změny stavu (status_duvod) patří jen ke změně stavu (status).');
    }
    if ('status' in patch) {
      const novy = patch.status === null || patch.status === undefined ? null : String(patch.status);
      const duvod = String(patch.status_duvod ?? '').replace(/\s+/g, ' ').trim();
      // migrace 062 (D19, Albert 2. 11. 2026 o menu stavů: „Limit it“), pro každého i Alberta: nabídnutou slevu nastavuje
      // jen automatizace, „Ozve se později“ a „Archiv – neodpověděl“ jen klient, kterému už odešel návrh (jako server)
      if (novy !== kontakt.status && novy === 'sleva_nabidnuta') fail('Nabídnutou slevu nastavuje automatizace, když nabídku pošle.');
      if (novy !== kontakt.status && (novy === 'pozdeji' || novy === 'bez_odpovedi') && !kontakt.first_proposal_at) {
        if (VE_FRONTE(kontakt.status)) fail('Naplánujte hovor (Naplánovat hovor), klient je ve frontě volání.');
        fail(`Stav „${novy === 'pozdeji' ? 'Ozve se později' : 'Archiv – neodpověděl'}“ jde nastavit jen klientovi, kterému už odešel návrh webu.`);
      }
      if (novy !== kontakt.status && duvod === '' && me.id !== OWNER_ID) {
        fail(`Napište krátce důvod změny stavu (z ${kontakt.status} na ${novy}). Bez důvodu stav změnit nejde.`);
      }
      if (novy !== kontakt.status && duvod.length > 500) fail('Důvod změny stavu je moc dlouhý: nejvýš 500 znaků.');
    }
    const target = kontakt as unknown as Record<string, unknown>;
    // migrace 045 (recenze 20. 10. 2026): poznámku a poznámku příznaku dostal Volající maskovanou; řádky kolegů jsou
    // jen ke čtení (poznamkaZpet je uloží doslova, jinak chyba). Spočítá se napřed, aby chyba nic nezměnila.
    // Dvě recenze 20. 10. 2026: poznámka příznaku, který dal kolega (flagged_by), je celá jeho (celaCizi).
    const { cizi, vidi } = jmenaPro(me);
    // strop délky poznámek z appky (migrace 046), všem; recenze 046 (20. 10. 2026, ⚠ NAHRAZUJE „ještě před kontrolou
    // vlastníka, proti uloženému originálu“): až po kontrole vlastníka a proti poznámce tak, jak ji ukládající vidí
    if ('note' in patch && poznamkaPresStrop(patch.note, poznamkaBezCizich(kontakt.note, cizi, vidi))) {
      fail('Poznámka je moc dlouhá: nejvýš 5 000 znaků a 100 řádků (delší poznámku jde jen zkrátit).');
    }
    if ('flag_note' in patch && poznamkaPresStrop(patch.flag_note, poznamkaBezCizich(kontakt.flag_note, cizi, vidi))) {
      fail('Poznámka příznaku je moc dlouhá: nejvýš 5 000 znaků a 100 řádků (delší poznámku jde jen zkrátit).');
    }
    const poznamky: Record<string, string | null> = {};
    for (const key of ['note', 'flag_note']) {
      if (key in patch && cizi.length > 0) {
        const value = patch[key];
        const celaCizi = key === 'flag_note' && kontakt.flagged_by !== null && cizi.includes(kontakt.flagged_by);
        poznamky[key] = poznamkaZpet(target[key] as string | null, value === null || value === undefined ? null : String(value), cizi, vidi, celaCizi);
      }
    }
    // druh příznaku: nullif(trim(…), '') jako server, neplatný druh = chyba s hodnotou, jak přišla
    const druhSurovy = patch.flag_kind === null || patch.flag_kind === undefined ? null : String(patch.flag_kind);
    const druh = druhSurovy === null ? null : oriznoutMezery(druhSurovy) || null;
    // migrace 060: neodpovida nahradilo označení k zavolání (jako set_flag); ⚠ NAHRAZUJE neodpovida mezi druhy z 014
    if ('flag_kind' in patch && druh === 'neodpovida') fail(NEODPOVIDA_NAHRAZEN);
    if ('flag_kind' in patch && druh !== null
        && !['chybi_email', 'email_neoveren', 'info_neoverene', 'chybi_info', 'jine'].includes(druh)) {
      fail(`Neplatný druh příznaku: ${druhSurovy}.`);
    }
    // Pole architekta: stejné úpravy a CHECKy jako server (migrace 028, 2.2 b a g), a než
    // se cokoli zapíše (v SQL by porušený CHECK vrátil celý update).
    const ARCH_POLE = ['firma', 'mesto', 'ico_osobni', 'ico_firma', 'dph_osobni', 'dph_firma'] as const;
    const DPH = ['platce', 'neplatce', 'identifikovana_osoba', 'neovereno'];
    const archNove: Record<string, string | null> = {};
    for (const key of ARCH_POLE) {
      if (!(key in patch)) continue;
      const raw = patch[key];
      const s = raw === null || raw === undefined ? null : String(raw);
      const v = s === null ? null : key.startsWith('ico_') ? s.replace(/\s/g, '') : s.trim();
      archNove[key] = v === '' ? null : v;
    }
    const porusuje = (c: string) => fail(`new row for relation "kontakty" violates check constraint "${c}"`);
    for (const key of ['ico_osobni', 'ico_firma'] as const) {
      const v = archNove[key];
      if (v !== undefined && v !== null && !/^[0-9]{8}$/.test(v)) porusuje(`kontakty_${key}_check`);
    }
    for (const key of ['dph_osobni', 'dph_firma'] as const) {
      const v = archNove[key];
      if (v !== undefined && v !== null && !DPH.includes(v)) porusuje(`kontakty_${key}_check`);
    }
    // ⚠ Od migrace 064: CHECK kontakty_architekt_pole_check platí jen pro chaty (segment <> 'chata' or …), firma oboru
    // pole firmy smí mít; NAHRAZUJE „!== 'architekt'“, které by niku oboru bralo jako chatu
    if (rodinaOf(segmentOf(kontakt)) === 'chata') {
      const vysledek = ARCH_POLE.map((key) => (key in archNove ? archNove[key] : kontakt[key] ?? null));
      // zdroj čísla appka od migrace 043 nezná (server ho neposílá), CHECK tu hlídá jen pole výš
      if (vysledek.some((v) => v !== null)) {
        porusuje('kontakty_architekt_pole_check');
      }
    }
    // Migrace 046 (dvě recenze 045, 20. 10. 2026): kdo a kdy příznak dal, se přepíše jen se změnou druhu (⚠ NAHRAZUJE
    // „každé uložení flag_kind přepíše flagged_by na toho, kdo ukládá“; mock dřív flagged_* neměnil vůbec). Server od
    // recenze 046 zapíše změněný nebo zrušený příznak (druh, kdo, kdy, poznámka) do události update; mock události nevede.
    if ('flag_kind' in patch && druh !== kontakt.flag_kind) {
      kontakt.flagged_at = druh === null ? null : now();
      kontakt.flagged_by = druh === null ? null : me.display_name;
    }
    const stavPred = kontakt.status;
    const poznamkaPred = kontakt.note;   // migrace 062 (D15): nové řádky poznámky proti uložené
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'status_duvod') continue;   // migrace 059: důvod není sloupec kontaktu
      if (key === 'flag_kind') {
        kontakt.flag_kind = druh as FlagKind | null;
      } else if (key === 'flag_note') {
        const text = key in poznamky ? poznamky[key] : value === null || value === undefined ? null : String(value);
        kontakt.flag_note = text === null ? null : oriznoutMezery(text) || null;   // nullif(trim(…), '')
      } else if (key in poznamky) {
        target[key] = poznamky[key];
      } else if (key in archNove) {
        target[key] = archNove[key];
      } else if (key === 'clear_lock') {
        if (value) {
          kontakt.lock_by = null;
          kontakt.lock_at = null;
        }
      } else if (key === 'rating') {
        kontakt.rating = value ? (String(value) as Rating) : null;
      } else {
        target[key] = value === null ? null : String(value);
      }
    }
    kontakt.updated_at = now();
    // migrace 057: změna stavu posune status_changed_at jako trigger na serveru (migrace 013)
    if (kontakt.status !== stavPred) {
      kontakt.status_changed_at = now();
      zapisZmenuStavu(kontakt.id, stavPred, kontakt.status);
    }
    // migrace 050: trigger trg_kontakty_prodano (kdy se kontakt prodal, pro výdělek „tento týden“)
    if ('status' in patch) zapisProdej(kontakt, stavPred);
    // migrace 060: ruční odmítnutí (na serveru událost stav_rucne) = klient odmítl, jeho nabídku z kampaně tick neoznačí
    if (kontakt.status === 'odmitnuto' && stavPred !== 'odmitnuto') rucniOdmitnuti.add(kontakt.id);
    // migrace 062 (D19): změna stavu na nekontaktovat, nerelevantni nebo odmitnuto zruší čekající naplánovaný hovor kontaktu
    // (už se mu nevolá; Albert A3) s důvodem změny stavu (na serveru i událost zavolat)
    if (kontakt.status !== stavPred && ['nekontaktovat', 'nerelevantni', 'odmitnuto'].includes(kontakt.status)) {
      const z = cekajiciHovor(kontakt.id);
      if (z) {
        const duvod = String(patch.status_duvod ?? '').replace(/\s+/g, ' ').trim() || '(bez důvodu, Albert)';
        z.stav = 'zruseno';
        z.uzavreno_at = now();
        z.zmenil_id = me.id;
        z.zmeneno_at = now();
        z.vysledek = `zrušeno změnou stavu ${stavPred} → ${kontakt.status}: ${duvod}`.slice(0, 500);
      }
    }
    // migrace 062 (D15, Albert 2. 11. 2026, A1: „every time there's something new … in the notes, the automation actually
    // reads it“): nové vlastní řádky poznámky jdou automatizaci jako vzkaz „Poznámka (jméno): …“ (jako server)
    if ('note' in patch) {
      const nove = noveRadkyPoznamky(poznamkaPred, kontakt.note, me.display_name);
      if (nove.length > 0) vzkazAgentovi(me, kontakt, `Poznámka (${me.display_name}): ${nove.join('\n')}`);
    }
    return forList(me, kontakt); // bez osobního IČO, když nesmí upravit (028, 036)
  },

  async claimKontakt(token: string, id: number): Promise<Kontakt> {
    await delay();
    // oznacit_za_sveho (migrace 024): jen kdo volal, jen dokud je kontakt ve frontě volání
    const user = auth(token);
    const kontakt = kontakty.find((c) => c.id === id);
    if (!kontakt) fail(`Kontakt id=${id} neexistuje.`);
    if (!callLog.some((l) => l.kontakt_id === id && l.user_id === user.id)) {
      fail('Za svého klienta si můžete označit jen kontakt, kterému jste sami volali.');
    }
    if (kontakt.status !== 'nekontaktovano' && kontakt.status !== 'nedovolano') {
      fail(`Kontakt už není ve frontě volání (stav ${kontakt.status}) — za svého se dá označit jen kontakt, který ve frontě je.`);
    }
    if (kontakt.last_caller !== user.display_name) {
      kontakt.last_caller = user.display_name; // stav, zámek ani fronta se nemění
      kontakt.updated_at = now();
    }
    // jako server (app_kontakt_pro, 037): volajícímu bez IČO architekta; detail řádek pošle
    // dál přes bezCizihoIco
    return kartaPro(user, kontakt);
  },

  /* ---- příznaky (migrace 005) ---- */

  async setFlag(token: string, id: number, kind: FlagKind, note: string): Promise<Kontakt> {
    await delay();
    const user = authAdmin(token);
    const druh = oriznoutMezery(kind ?? '');
    // migrace 060 (Albert 1. 11. 2026): neodpovida nahradilo označení k zavolání (hodnota zůstává v CHECKu jen kvůli historii);
    // ⚠ NAHRAZUJE neodpovida mezi druhy, které smí nasadit člověk (014)
    if (druh === 'neodpovida') fail(NEODPOVIDA_NAHRAZEN);
    if (!['chybi_email', 'email_neoveren', 'info_neoverene', 'chybi_info', 'jine'].includes(druh)) {
      fail(`Neplatný druh příznaku: ${kind ?? '(null)'}. Povolené: chybi_email, email_neoveren, info_neoverene, chybi_info, jine.`);
    }
    // příznak cizího kontaktu Volající nevidí, nasadí ho jen u svého klienta (migrace 045, Albert 20. 10. 2026)
    if (user.id !== OWNER_ID && user.role !== 'super_admin' && !myKontaktIds(user).has(id)) {
      fail('Tohle není váš klient: příznak u kontaktu, kterému jste nevolal/a, nevidíte ani neměníte. Nastaví ho ten, kdo mu volá, jeho super admin nebo Albert.');
    }
    const kontakt = kontakty.find((c) => c.id === id);
    // migrace 045 (recenze 20. 10. 2026): poznámka příznaku přišla Volajícímu maskovaná; řádky kolegů jen ke čtení
    // (poznamkaZpet, napřed, aby chyba nic nezměnila). Dvě recenze 20. 10. 2026: poznámka příznaku, který dal kolega
    // (flagged_by), je celá jeho (celaCizi); hlavička s datem jen s vlastním jménem.
    const { cizi, vidi } = jmenaPro(user);
    // migrace 061 (Albert 2. 11. 2026: „only the super admins will see this flag“): příznak info_neoverene Volající nevidí,
    // jeho poznámka ani autor tedy nejsou záznam, který by musel zachovat: nový příznak ho nahradí celý (poznámka se
    // kontroluje jako nová; server nahrazený příznak zapíše do události flag_set, mock události nevede)
    const skryty = cizi.length > 0 && kontakt?.flag_kind === 'info_neoverene';
    const ulozena = skryty ? null : kontakt?.flag_note ?? null;
    // strop délky poznámky z appky (migrace 046; jako update_kontakt: jen delší než uložená poznámka příznaku tak, jak ji
    // ukládající vidí, recenze 046 ⚠ NAHRAZUJE „delší než uložený originál“)
    if (poznamkaPresStrop(note, poznamkaBezCizich(ulozena, cizi, vidi))) {
      fail('Poznámka příznaku je moc dlouhá: nejvýš 5 000 znaků a 100 řádků (delší poznámku jde jen zkrátit).');
    }
    if (!kontakt) fail(`Kontakt ${id} neexistuje.`);
    const celaCizi = !skryty && kontakt.flagged_by !== null && cizi.includes(kontakt.flagged_by);
    const text = cizi.length > 0 ? poznamkaZpet(ulozena, note, cizi, vidi, celaCizi) : note;
    const flagNote = text === null || text === undefined ? null : oriznoutMezery(text) || null;   // nullif(trim(…), '')
    // Migrace 046 (dvě recenze 045, 20. 10. 2026): flagged_at a flagged_by jen se změnou druhu příznaku, nebo když chybí
    // (⚠ NAHRAZUJE „každé set_flag přepíše, kdo a kdy příznak dal“); stejný druh s novou poznámkou nechá autora
    if (kontakt.flag_kind !== druh || kontakt.flagged_at === null) kontakt.flagged_at = now();
    if (kontakt.flag_kind !== druh || kontakt.flagged_by === null) kontakt.flagged_by = user.display_name;
    kontakt.flag_kind = druh as FlagKind;
    kontakt.flag_note = flagNote;
    kontakt.updated_at = now();
    return forList(user, kontakt); // bez osobního IČO, když nesmí upravit (028, 036)
  },

  async clearFlag(token: string, id: number): Promise<Kontakt> {
    await delay();
    const user = authAdmin(token);
    // příznak cizího kontaktu Volající nevidí, nezruší ho tedy naslepo (migrace 045, Albert 20. 10. 2026)
    if (user.id !== OWNER_ID && user.role !== 'super_admin' && !myKontaktIds(user).has(id)) {
      fail('Tohle není váš klient: příznak u kontaktu, kterému jste nevolal/a, nevidíte ani neměníte. Zruší ho ten, kdo mu volá, jeho super admin nebo Albert.');
    }
    const kontakt = kontakty.find((c) => c.id === id);
    if (!kontakt) fail(`Kontakt id=${id} neexistuje.`);
    // migrace 061 (Albert 2. 11. 2026: „This should be exclusive to the super admins“): info_neoverene řeší jen super admin
    // a Albert; Volající ho nevidí, takže ho nezruší ani naslepo (jako server)
    if (kontakt.flag_kind === 'info_neoverene' && user.id !== OWNER_ID && user.role !== 'super_admin') fail(INFO_JEN_SUPER);
    // Server od dvou recenzí 20. 10. 2026 zapíše do události flag_cleared, jaký příznak to byl, kdo ho dal, kdy
    // a jeho poznámku („Příznak zrušen (vyřešeno). Byl: …, dal ho …, poznámka příznaku: …“). Mock události nevede
    // (appka je nikde nečte), proto ten zápis vynechává; řádek kontaktu vrací stejně jako server.
    kontakt.flag_kind = null;
    kontakt.flag_note = null;
    kontakt.flagged_at = null;
    kontakt.flagged_by = null;
    kontakt.updated_at = now();
    return forList(user, kontakt); // bez osobního IČO, když nesmí upravit (028, 036)
  },

  async listFlagged(token: string, kind?: FlagKind | null, userId?: number | null): Promise<Kontakt[]> {
    await delay();
    // admin svoji, super admin svých lidí + klienti bez volajícího, Albert všichni (migrace 023)
    const user = authAdmin(token);
    mayPick(user, userId, 'Označené klienty');
    const scopeIds = userId != null ? kontaktyOf([userId]) : kontaktyOf(visibleIds(user));
    const order: Record<string, number> = {
      chybi_info: 0, chybi_email: 1, email_neoveren: 2, info_neoverene: 3, jine: 4,
    };
    return kontakty
      // migrace 061 (Albert 2. 11. 2026): příznak info_neoverene jen super adminovi a Albertovi; Volajícímu řádek s ním
      // nevrátí (ani s kind info_neoverene), jako server
      .filter((c) => druhPro(user, c) && (!kind || c.flag_kind === kind))
      .filter(
        (c) =>
          (userId == null && user.id === OWNER_ID) ||
          scopeIds.has(c.id) ||
          (userId == null && user.role === 'super_admin' && kontaktBezMajitele(c.id))
      )
      .sort((a, b) => (order[a.flag_kind!] ?? 9) - (order[b.flag_kind!] ?? 9) || a.id - b.id)
      .map((c) => forList(user, c));
  },

  /* ---- označení k zavolání, hvězda a přehled (migrace 060, Albert 1. 11. 2026): stejná pravidla a hlášky jako server ---- */

  async listOznacene(token: string, f: OznaceneFiltry): Promise<Kontakt[]> {
    await delay();
    const me = authAdmin(token);
    // migrace 074 (kontrakt §6.3): výběr lidí napřed (Volající jen sám sebe), s bez volajícího dnešní větou, s p_user_id odmítnut
    const vyberLidi = idsVyberu(f.user_ids);
    if (vyberLidi) {
      overVyber(me, vyberLidi, 'Označené klienty jiného člověka vidí jen jeho super admin.');
      if (f.bez_volajiciho === true) fail('Vyberte buď volajícího, nebo „bez volajícího“, ne obojí.');
      if (f.user_id !== null && f.user_id !== undefined) fail(VYBER_DVAKRAT);
    }
    // výběr jednoho člověka nebo lidí: bez něj super admin vidí všechno
    const zuzeno = (f.user_id !== null && f.user_id !== undefined) || vyberLidi !== null;
    // kontroly ve stejném pořadí a se stejnými hláškami jako server
    checkSegment(f.segment, true);
    checkRazeni(f.razeni);
    const druhy = (f.druhy ?? []).filter((d) => d !== null && d !== undefined);
    if (druhy.some((d) => !DRUHY_OZNACENYCH.includes(String(d)))) {
      fail(`Neplatný druh ve filtru: ${druhy.join(', ')}. Povolené: ${DRUHY_OZNACENYCH.join(', ')}.`);
    }
    checkFiltry060({ ...f, kategorie: null });
    const vse = me.id === OWNER_ID || me.role === 'super_admin';
    // výběr člověka jako list_flagged (stejná věta jako server, kontrola 193); „bez volajícího“ jen super admin a Albert
    if (f.user_id != null && f.user_id !== me.id && !(me.role === 'super_admin' && visibleIds(me).includes(f.user_id))) {
      fail('Označené klienty jiného člověka vidí jen jeho super admin.');
    }
    const bez = f.bez_volajiciho === true;
    if (bez && !vse) fail('Označené klienty bez volajícího vidí jen super admin.');
    if (bez && f.user_id != null) fail('Vyberte buď volajícího, nebo „bez volajícího“, ne obojí.');
    obnovOznaceni();
    // otevřené označení, které přihlášený vidí: Volající jen svoje, super admin a Albert všechna (výběr zúží)
    const oznaceniVidi = (c: Kontakt): MockOznaceni | undefined => {
      const o = otevreneOznaceni(c.id);
      if (!o || (!vse && o.volajici_id !== me.id)) return undefined;
      if (f.user_id != null && o.volajici_id !== f.user_id) return undefined;
      // migrace 074: označení kohokoli z vybraných
      if (vyberLidi && (o.volajici_id === null || !vyberLidi.includes(o.volajici_id))) return undefined;
      if (bez && o.volajici_id !== null) return undefined;
      return o;
    };
    // příznaky v rozsahu list_flagged: Albert všechny, super admin klienti všech a bez volajícího, Volající svoji
    const moje = myKontaktIds(me);
    const rozsah = vyberLidi ? kontaktyOf(vyberLidi) : f.user_id != null ? kontaktyOf([f.user_id]) : kontaktyOf(visibleIds(me));
    // migrace 061 (Albert 2. 11. 2026): Volajícímu je info_neoverene jako bez příznaku (druhPro): řádek jen kvůli němu
    // nedostane, filtr druhů ani pořadí ho nepozná, řádek s jeho označením ano (příznak vynuluje forViewer)
    const priznakVidi = (c: Kontakt) =>
      !!druhPro(me, c) &&
      ((!zuzeno && me.id === OWNER_ID) || rozsah.has(c.id) || (!zuzeno && me.role === 'super_admin' && kontaktBezMajitele(c.id))) &&
      (!bez || kontaktBezMajitele(c.id));
    const od = hovoryOd(me);
    const { cizi, vidi } = jmenaPro(me);
    const hledat = (f.hledat ?? '').trim().toLowerCase();
    const sedi = (c: Kontakt, o: MockOznaceni | undefined) =>
      (druhy.length === 0 || (o !== undefined && druhy.includes(o.kategorie)) || (!!druhPro(me, c) && druhy.includes(druhPro(me, c)!))) &&
      (!f.segment || segmentOf(c) === f.segment) &&
      // kategorie tu jde přes druhy; stav, známka, hvězda a mlčení jako v seznamech
      sedi060(c, { ...f, kategorie: null }, od) &&
      (!hledat ||
        [c.name, c.phone, c.web, c.email, c.firma, c.mesto].some((v) => v && v.toLowerCase().includes(hledat)) ||
        (!!c.note && c.note.toLowerCase().includes(hledat) && (cizi.length === 0 || (poznamkaBezCizich(c.note, cizi, vidi) ?? '').toLowerCase().includes(hledat))));
    const PRIORITA: Record<string, number> = { chybi_info: 0, chybi_email: 1, email_neoveren: 2, info_neoverene: 3 };
    const radky = kontakty
      .map((c) => ({ c, o: oznaceniVidi(c) }))
      .filter(({ c, o }) => ((o !== undefined && (vse || moje.has(c.id))) || priznakVidi(c)) && sedi(c, o))
      .sort((a, b) => {
        // zvolené řazení napřed (hvezda je výchozí pořadí), pak výchozí: s hvězdou, označení před samotnými příznaky,
        // nejdéle mlčící, nejstarší označení, příznaky jako list_flagged (druh, novější), id
        const zm = f.razeni === 'hvezda' ? 0 : podleRazeni(f.razeni, a.c, b.c, od);
        if (zm !== 0) return zm;
        if (!a.c.hvezda_at !== !b.c.hvezda_at) return a.c.hvezda_at ? -1 : 1;
        if (!a.o !== !b.o) return a.o ? -1 : 1;
        const pa = mlciPd(a.c);
        const pb = mlciPd(b.c);
        if (pa !== pb) return pa === null ? 1 : pb === null ? -1 : pb - pa;
        const oa = casMs(a.o?.oznaceno_at);
        const ob = casMs(b.o?.oznaceno_at);
        if (oa !== ob) return oa === null ? 1 : ob === null ? -1 : oa - ob;
        const ka = PRIORITA[druhPro(me, a.c) ?? ''] ?? 4;
        const kb = PRIORITA[druhPro(me, b.c) ?? ''] ?? 4;
        if (ka !== kb) return ka - kb;
        const fa = druhPro(me, a.c) ? casMs(a.c.flagged_at) : null;
        const fb = druhPro(me, b.c) ? casMs(b.c.flagged_at) : null;
        if (fa !== fb) return fa === null ? 1 : fb === null ? -1 : fb - fa;
        return a.c.id - b.c.id;
      });
    // řádek = kontakt přes masku + klíče označení (komu je označený jen super admin a Albert) + mlčení a poslední změna
    // a hovor (057); forList dává i smi_upravit
    return radky.map(({ c, o }) => ({
      ...forList(me, {
        ...c,
        ozn_id: o?.id ?? null,
        ozn_kategorie: o?.kategorie ?? null,
        ozn_mlci_od: o?.mlci_od ?? null,
        ozn_oznaceno_at: o?.oznaceno_at ?? null,
        ozn_lhuta_do: o?.lhuta_do ?? null,
        ozn_pokusy: o ? o.pokusy : null,
        ozn_posledni_pokus_at: o?.posledni_pokus_at ?? null,
        ozn_zavadeci: o ? o.zavadeci : null,
        // migrace 063: kdy odešla připomínka po lhůtě (jen u označení, které přihlášený vidí)
        ozn_pripominka_at: o?.pripominka_at ?? null,
        ...(vse
          ? {
              ozn_volajici_id: o?.volajici_id ?? null,
              ozn_volajici: o ? users.find((u) => u.id === o.volajici_id)?.display_name ?? 'bez volajícího' : null,
            }
          : {}),
        mlci_pd: mlciPd(c),
        posledni_zmena: posledniZmena(c),
        posledni_hovor: posledniHovor(c.id, od),
      }),
    }));
  },

  async zapisHovor(
    token: string,
    kontaktId: number,
    vysledek: VysledekDovolani,
    poznamka: string | null = null,
    hvezda: boolean | null = null
  ): Promise<ZapisHovoruVysledek> {
    await delay();
    const me = authAdmin(token);
    const vse = me.id === OWNER_ID || me.role === 'super_admin';
    // migrace 061 (Albert 2. 11. 2026: „these four options. Plus … one more option which says none of it above“): pátý
    // výsledek jine („Nic z toho výše“); migrace 062 (A1: „Yes, you can add the sixth option“): šestý chce_web („Chce web“)
    if (!VYSLEDKY_DOVOLANI.includes(vysledek)) {
      fail(`Neplatný výsledek dovolání: ${vysledek ?? '(null)'}. Povolené: nedovolano, nechce, nekontaktovat, mluvili, jine, chce_web.`);
    }
    if ([...(poznamka ?? '')].length > 2000) fail('Poznámka k dovolání je moc dlouhá: nejvýš 2 000 znaků.');
    // jeden řádek jako poznámka z hovoru (046): konce řádků (i Unicode) jako mezera, mezery na krajích pryč
    const text = oriznoutMezery((poznamka ?? '').replace(/[\n\v\f\r\u0085\u2028\u2029]+/g, ' ')) || null;
    if (vysledek === 'mluvili' && text === null) {
      fail('Napište, co klient chce (co jste spolu domluvili). Bez toho dovolání „Mluvili jsme“ zapsat nejde.');
    }
    // migrace 061: u „Nic z toho výše“ je poznámka jediné, co automatizaci řekne, jak hovor dopadl
    if (vysledek === 'jine' && text === null) fail('Napište, jak hovor dopadl. Bez toho „Nic z toho výše“ zapsat nejde.');
    // důvod změny stavu má od 059 nejvýš 500 znaků; s úvodem „Dovolání: …“ se 450 vejde
    if ((vysledek === 'nechce' || vysledek === 'nekontaktovat') && text !== null && [...text].length > 450) {
      fail('Důvod je moc dlouhý: nejvýš 450 znaků.');
    }
    obnovOznaceni();
    // Volající napřed: podle hlášky nepozná, jestli kontakt existuje, má označení, ani čí je (jedna věta)
    if (!vse && !myKontaktIds(me).has(kontaktId)) fail(NENI_VASE_OZNACENI);
    const c = kontakty.find((x) => x.id === kontaktId);
    if (!c) fail(`Kontakt id=${kontaktId} neexistuje.`);
    // migrace 062 (D1, Albert 2. 11. 2026): větev vybere server. Otevřené označení, které přihlášený smí (super admin
    // a Albert každé, Volající jen své; označení bez volajícího ho do označení nepustí) = s označením jako 061; jinak bez
    // označení (⚠ NAHRAZUJE „nemá otevřené označení“ super admina a odmítnutí Volajícího u označení kolegy)
    const o = otevreneOznaceni(c.id);
    const ozn = !!o && (vse || o.volajici_id === me.id);
    const smi = canEdit(me, c.id);
    // bez označení každý výsledek (i nedovolano a hvězda) jen s právem kontakt upravit (D2)
    if (!ozn && !smi) fail(NENI_VAS_UPRAVIT);
    // výsledek, který kontakt mění (poznámka, stav, vzkaz agentovi, hvězda), jen s právem kontakt upravit (024)
    if ((vysledek !== 'nedovolano' || typeof hvezda === 'boolean') && !smi) fail(NENI_VAS_UPRAVIT);
    // stráže (D3, Albert A3: „if the client refuses the preview on the first call, I don't think we should be calling them
    // again“) před prvním zápisem: bez označení kdo web odmítl a fronta volání, v obou větvích nekontaktovat a nerelevantni
    if (!ozn && (c.status === 'odmitnuto' || c.status === 'sleva_nabidnuta')) fail(DOVOLANI_ODMITL);
    if (!ozn && VE_FRONTE(c.status)) fail(DOVOLANI_FRONTA);
    if (c.status === 'nekontaktovat' || c.status === 'nerelevantni') {
      fail(`Klient je ve stavu ${c.status}: dovolání se u něj nezapisuje. Když chce, abychom se mu zase ozývali, změňte stav v detailu klienta s důvodem.`);
    }
    // ⚠ 3. 11. 2026 (ověření 062, DB F3): starý příznak „NEKONTAKTOVAT …“ jako stav nekontaktovat (jako server)
    if (priznakNekontaktovat(c)) fail(DOVOLANI_PRIZNAK_NEKONTAKTOVAT);
    const odmitnuti = vysledek === 'nechce' || vysledek === 'nekontaktovat';
    if (odmitnuti) {
      // D2 napřed (⚠ 3. 11. 2026, ověření 062, DB F1, NAHRAZUJE kontrolu vlastníka až za prodejem: kolega by podle věty poznal,
      // jestli klient web objednal): bez označení odmítnutí jen ten, kdo klienta vede (oznaceni_vlastnik: poslední zájem,
      // jinak last_caller)
      if (!ozn && !vse && vlastnikOznaceni(c) !== me.id) fail(DOVOLANI_NEVEDE);
      // po prodeji odmítnutí tlačítkem ne: stav prodeje, nebo eskalace a pozastaveno s historií prodeje (mock vede jen
      // kontakt_prodej; server i události faktura_odeslana a platba_prijata, stav_rucne, status_fix a stav_pred jobu)
      const drzeny = c.status === 'eskalace' || c.status === 'pozastaveno';
      if (PRODANO_STAVY.includes(c.status) || (drzeny && kontaktProdej.has(c.id))) {
        fail(`Klient už web objednal (stav ${c.status}): odmítnutí tady zapsat nejde. Napište, co řekl, do „Mluvili jsme“ nebo „Nic z toho výše“; stav se mění v detailu klienta s důvodem.`);
      }
      if (drzeny && !vse) {
        fail(`Klient je ve stavu ${c.status}, o dalším kroku rozhodne Albert nebo super admin; zapište „Nic z toho výše“ s poznámkou.`);
      }
    }
    let vlakno: number | null = null;
    // migrace 061 (Albert 2. 11. 2026: „there should definitely be also a note below it where you can write a note for the
    // automation“): poznámka u KAŽDÉHO výsledku jde automatizaci jako u „Mluvili jsme“ od 060: řádek do poznámky (den
    // v Praze, vlastní jméno) a vzkaz agentovi do vlákna kontaktu (vzkazAgentovi; dispečer z něj udělá chat job). U mluvili
    // text beze změny, u ostatních „<výsledek>[: text]“. Jen s právem kontakt upravit; bez něj (smí jen nedovolano) zůstane
    // poznámka jen v události dovolani na serveru (mock události nevede). Migrace 062 (D4): bez poznámky vzkaz u chce_web
    // vždy a u odmítnutí klienta, který ještě nemá návrh nebo náhled
    const predat = smi && (text !== null || vysledek === 'chce_web'
      || (odmitnuti && (!c.first_proposal_at || oriznoutMezery(c.live_url ?? '') === '')));
    if (predat) {
      const zprava = vysledek === 'mluvili' ? (text ?? '') : `${DOVOLANI_PRO_AUTOMATIZACI[vysledek]}${text === null ? '' : `: ${text}`}`;
      const radek = `[${denPraha(new Date())} ${me.display_name}] Dovolání: ${zprava}`;
      c.note = c.note ? `${c.note}\n${radek}` : radek;
      c.updated_at = now();
      vlakno = vzkazAgentovi(me, c, `Dovolání (${me.display_name}): ${zprava}`);
    }
    if (vysledek === 'nedovolano') {
      // označení zůstává otevřené, lhůta beze změny, i s poznámkou (Albert 2. 11. 2026: „it shouldn't be removing the mark“);
      // bez označení (062) jen záznam, označení kolegy nedovolání nemění (D5)
      if (o && ozn) {
        o.pokusy += 1;
        o.posledni_pokus_at = now();
      }
    } else {
      if (odmitnuti) {
        // nechce = odmitnuto (tick pošle jednu nabídku, když žádná neodešla), nekontaktovat = konečný stav; stopa jako ruční
        // změna stavu (událost stav_rucne s důvodem „Dovolání: …“; mock události nevede, odmítnutí si pamatuje)
        const novy: KontaktStatus = vysledek === 'nechce' ? 'odmitnuto' : 'nekontaktovat';
        if (c.status !== novy) {
          zapisZmenuStavu(c.id, c.status, novy);
          c.status = novy;
          c.status_changed_at = now();
          c.updated_at = now();
        }
        if (novy === 'odmitnuto') rucniOdmitnuti.add(c.id);
      }
      // mluvili, jine (061) a chce_web (062) kontakt nemění; všechno kromě nedovolano otevřené označení uzavře, bez označení
      // (062, D5) i označení kolegy nebo bez volajícího (úspěšný hovor je odpověď klienta); odpověď ho nejmenuje
      if (o) {
        o.zavolano_at = now();
        o.zavolano_kdo = me.id;
        o.vysledek = vysledek;
        o.poznamka = text;
        zavritOznaceni(o, 'hovor');
      }
      // naplánovaný hovor (050) jako resolve_call: vlastní uzavře (hotovo), cizí zruší neutrálně; po nedovolání zůstává
      // (recenze 2. 11. 2026: okno slibuje „už mu nikdo nezavolá“). Migrace 062: jen hovor s časem do konce dneška v Praze,
      // pozdější zůstává (D20); bez označení jen vlastní (D2); odmítnutí zruší každý čekající hovor kontaktu (A3, jako D19)
      const z = cekajiciHovor(c.id);
      if (z && denPraha(new Date(z.kdy)) <= denPraha(new Date()) && (ozn || z.user_id === me.id)) {
        const muj = z.user_id === me.id;
        z.stav = muj ? 'hotovo' : 'zruseno';
        z.uzavreno_at = now();
        z.vysledek = muj ? `dovolání: ${vysledek}` : !drziAktivni(z) ? NEAKTIVNI : 'hovor vyřídilo dovolání v Označených';
      } else if (z && odmitnuti) {
        z.stav = 'zruseno';
        z.uzavreno_at = now();
        z.zmenil_id = me.id;
        z.zmeneno_at = now();
        z.vysledek = `zrušeno: dovolání ${vysledek}`;
      }
      // jediný záznam úspěšného hovoru (062, D6; na serveru událost dovolani), čtou ho kandidáti označení
      dovolaniUspesna.set(c.id, [...(dovolaniUspesna.get(c.id) ?? []), now()]);
    }
    const zmenaHvezdy = typeof hvezda === 'boolean' ? zapisHvezdu(c, me, hvezda, hvezda ? 'Velký zájem při dovolání' : null) : null;
    // dovolání není nový hovor (Albert 1. 11. 2026): call_log, statistiky, Rozvrh, výdělek ani fronta se nemění
    return {
      ok: true, kontakt_id: c.id,
      // migrace 062: oznaceno = zápis šel do označení; bez označení číslo, otevřenost ani pokusy (i označení kolegy) nikdy
      oznaceni_id: o && ozn ? o.id : null, oznaceno: ozn, vysledek,
      otevrene: o && ozn ? o.uzavreno_at === null : null, pokusy: o && ozn ? o.pokusy : null,
      status: c.status, hvezda: !!c.hvezda_at, hvezda_zmena: zmenaHvezdy, vlakno_id: vlakno,
      // migrace 061: true = poznámka šla automatizaci, false = jen do události (bez práva kontakt upravit), null = bez poznámky
      poznamka_predana: text === null ? null : predat,
    };
  },

  async oznaceniZavrit(token: string, kontaktId: number, duvod: string): Promise<{ ok: boolean; kontakt_id: number; oznaceni_id?: number }> {
    await delay();
    const me = authAdmin(token);
    if (me.id !== OWNER_ID && me.role !== 'super_admin') fail('Označení k zavolání ruší jen super admin nebo Albert.');
    const d = oriznoutMezery(String(duvod ?? '').replace(/\s+/g, ' '));
    if (d === '') fail('Napište krátce důvod, proč označení rušíte.');
    if ([...d].length > 500) fail('Důvod je moc dlouhý: nejvýš 500 znaků.');
    obnovOznaceni();
    const o = otevreneOznaceni(kontaktId);
    if (!o) fail(`Kontakt id=${kontaktId} nemá otevřené označení k zavolání.`);
    // důvod jde na serveru do události oznaceni; tatáž epizoda se pak znovu neoznačí
    zavritOznaceni(o, 'rucne');
    return { ok: true, kontakt_id: kontaktId, oznaceni_id: o.id };
  },

  async nastavHvezdu(token: string, kontaktId: number, hvezda: boolean, duvod: string | null = null): Promise<Kontakt> {
    await delay();
    const me = authAdmin(token);
    if (hvezda !== true && hvezda !== false) fail('Řekněte, jestli hvězdu dát (true), nebo vzít (false).');
    // Volající napřed: podle hlášky nepozná, jestli cizí kontakt existuje
    if (me.id !== OWNER_ID && me.role !== 'super_admin' && !myKontaktIds(me).has(kontaktId)) fail(NENI_VAS_HVEZDA_CIZI);
    const c = kontakty.find((x) => x.id === kontaktId);
    if (!c) fail(`Kontakt id=${kontaktId} neexistuje.`);
    // stejné právo jako úprava kontaktu (app_smi_upravit, 024)
    if (!canEdit(me, c.id)) fail(NENI_VAS_HVEZDA);
    const zmena = zapisHvezdu(c, me, hvezda, duvod);
    // řádek jako update_kontakt (maska, osobní IČO jen se smi_upravit) a hvezda_zmena
    return { ...forList(me, c), hvezda_zmena: zmena } as Kontakt;
  },

  async kontaktPrehled(token: string, kontaktId: number): Promise<KontaktPrehled> {
    await delay(80);
    const me = authAdmin(token);
    const vse = me.id === OWNER_ID || me.role === 'super_admin';
    // Volající jen u svého klienta (pravidlo 023) a napřed: podle hlášky nepozná, jestli cizí kontakt existuje
    if (!vse && !myKontaktIds(me).has(kontaktId)) fail('Přehled klienta vidí jen ten, kdo mu volá, jeho super admin nebo Albert.');
    const c = kontakty.find((x) => x.id === kontaktId);
    if (!c) fail(`Kontakt id=${kontaktId} neexistuje.`);
    obnovOznaceni();
    const { cizi, vidi } = jmenaPro(me);
    const o = oznaceniPro(c.id, vse ? null : me.id);
    const sleva = (slevy.get(c.id) ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const kampan = !!sleva && slevaZKampane(c.id);
    const z = cekajiciHovor(c.id);
    const zVidi = z && (vse || z.user_id === me.id) ? z : undefined;
    const fakta: PrehledFakta = {
      stav: c.status,
      stav_od: c.status_changed_at ?? null,
      hvezda: c.hvezda_at
        ? {
            at: c.hvezda_at,
            kdo: c.hvezda_kdo && cizi.includes(c.hvezda_kdo) ? JINY : c.hvezda_kdo ?? null,
            duvod: poznamkaBezCizich(c.hvezda_duvod ?? null, cizi, vidi),
          }
        : null,
      oznaceni: o
        ? {
            id: o.id,
            kategorie: o.kategorie,
            mlci_od: o.mlci_od,
            oznaceno_at: o.oznaceno_at,
            lhuta_do: o.lhuta_do,
            pokusy: o.pokusy,
            posledni_pokus_at: o.posledni_pokus_at,
            // komu je označený jen super admin a Albert
            volajici: vse ? users.find((u) => u.id === o.volajici_id)?.display_name ?? 'bez volajícího' : null,
          }
        : null,
      mlci_pd: mlciPd(c),
      prvni_navrh: c.first_proposal_at,
      nase_posledni: c.last_our_reply_at,
      klient_naposledy: c.last_client_reply_at,
      // nabídka platí 14 dní. ⚠ Migrace 063 (Albert 4. 11. 2026: „the archiving is more so for like truly lost clients“)
      // NAHRAZUJE archiv 30 dní od pozdější z naší poslední zprávy a nabídky: den archivu (bez_odpovedi) jen když ho tick může
      // archivovat (nabídka v připomínce kampaně, stav sleva_nabidnuta, klient od návrhu nikdy nenapsal, bez hvězdy, známka ne
      // A, adresa není společná s jiným kontaktem: ověření 4. 11. 2026, mock vede jen hlavní adresu, rezervační a ateliér ne), 60 dní
      // od nejpozdějšího z naší poslední zprávy, nabídky, úspěšného hovoru, hotového hovoru z kalendáře a zprávy
      // člověka ve vláknech kontaktu (jako stavy_kontaktu.py)
      nabidka: sleva
        ? {
            odeslana_at: sleva.created_at,
            konci_dne: posunDen(denPraha(new Date(sleva.created_at)), 14),
            kampan,
            archiv_dne: kampan && c.status === 'sleva_nabidnuta' && !!c.first_proposal_at
              && (!c.last_client_reply_at || (casMs(c.last_client_reply_at) ?? 0) < (casMs(c.first_proposal_at) ?? 0))
              && !c.hvezda_at && c.rating !== 'A'
              && !(c.email && kontakty.some((x) => x.id !== c.id && (x.email ?? '').trim().toLowerCase() === c.email!.trim().toLowerCase()))
              ? posunDen(denPraha(new Date(Math.max(casMs(c.last_our_reply_at) ?? 0, casMs(sleva.created_at) ?? 0,
                  ...(dovolaniUspesna.get(c.id) ?? []).map((t) => casMs(t) ?? 0),
                  ...zavolatRadky.filter((x) => x.kontakt_id === c.id && x.stav === 'hotovo').map((x) => casMs(x.uzavreno_at) ?? 0),
                  ...chatMessages
                    .filter((m) => m.sender_type === 'admin' && chatThreads.some((t) => t.id === m.thread_id && t.kontakt_id === c.id))
                    .map((m) => casMs(m.created_at) ?? 0)))), 60)
              : null,
          }
        : null,
      pripominka_kampane: pripominkyKampane.get(c.id) ?? null,
      // migrace 063: poslední připomínka po lhůtě z označení, která přihlášený vidí (i uzavřených)
      pripominka_oznaceni: pripominkaOznaceniPro(c.id, vse ? null : me.id),
      // spící job smazat_nahled mock nevede
      nahled_smazani: null,
      zavolat: zVidi
        ? { id: zVidi.id, kdy: zVidi.kdy, poznamka: zVidi.poznamka, muj: zVidi.user_id === me.id,
            volajici: vse ? users.find((u) => u.id === zVidi.user_id)?.display_name ?? null : null }
        : null,
      cena_web: c.cena_web,
      cena_hosting: c.cena_hosting,
    };
    const p = prehledy.get(c.id);
    return { kontakt_id: c.id, prehled: p ? p.prehled : null, prehled_at: c.prehled_at ?? null, fakta };
  },

  async createUser(
    token: string,
    username: string,
    password: string,
    displayName: string,
    role: Role,
    managerId?: number | null
  ) {
    await delay();
    const admin = authAdmin(token);
    // lidi zakládá jen super admin (migrace 024)
    if (admin.role !== 'super_admin') fail('Nové uživatele zakládá jen super admin. Požádejte svého super admina.');
    if (!username.trim()) fail('Uživatelské jméno nesmí být prázdné.');
    if (!password || password.length < 6) fail('Heslo musí mít alespoň 6 znaků.');
    // migrace 042: role jen admin („Volající“) a super_admin; stará hodnota caller = admin
    if (role === 'caller') role = 'admin';
    if (role !== 'admin' && role !== 'super_admin') {
      fail(`Neplatná role: ${role}. Povolené: admin (Volající), super_admin.`);
    }
    // ⚠ NAHRAZUJE (042) „Nového admina nebo super admina může založit jen Albert“
    if (role === 'super_admin' && admin.id !== OWNER_ID) {
      fail('Nového super admina může založit jen Albert. Vy můžete zakládat volající.');
    }
    if (users.some((u) => u.username === username.trim())) {
      fail(`Uživatel "${username.trim()}" už existuje.`);
    }
    const name = displayName.trim() || username.trim();
    checkName(name, null);
    const manager =
      role === 'super_admin' ? null : admin.id === OWNER_ID ? managerId ?? OWNER_ID : admin.id;
    const user: MockUser = {
      id: nextUserId++,
      username: username.trim(),
      display_name: name,
      password,
      role,
      active: true,
      manager_id: manager,
    };
    users.push(user);
    return { ok: true, user_id: user.id };
  },

  async updateUser(token: string, userId: number, args: UpdateUserArgs): Promise<UpdatedUser> {
    await delay();
    const admin = authAdmin(token);
    const dn = args.display_name ?? null;
    const pw = args.password ?? null;
    // migrace 042: stará hodnota caller = admin („Volající“)
    const role: Role | null = args.role === 'caller' ? 'admin' : args.role ?? null;
    const active = args.active ?? null;
    const mgr = args.manager_id ?? null;

    if (dn === null && pw === null && role === null && active === null && mgr === null) {
      fail('Není co měnit — zadejte alespoň jedno pole.');
    }
    // migrace 048 (audit soukromí 20. 10. 2026): Volající smí jen svůj účet, práva napřed (jinak by podle chyby
    // „neexistuje“ proti „jen svůj účet“ poznal, která id lidí existují)
    if (admin.id !== OWNER_ID && admin.role !== 'super_admin' && userId !== admin.id) {
      fail('Upravit můžete jen svůj účet. Účty ostatních mění jejich super admin.');
    }
    const user = users.find((u) => u.id === userId);
    if (!user) fail(`Uživatel id=${userId} neexistuje.`);

    // kdo smí upravit koho — zrcadlí migraci 023
    if (userId === OWNER_ID && admin.id !== OWNER_ID) fail('Účet majitele může měnit jen on sám.');
    if (admin.id !== OWNER_ID && userId !== admin.id) {
      if (admin.role !== 'super_admin') fail('Upravit můžete jen svůj účet. Účty ostatních mění jejich super admin.');
      if (user.manager_id !== admin.id) fail('Upravit můžete jen sebe a lidi, kteří jsou pod vámi.');
    }
    // Migrace 046 (dvě recenze 045, 20. 10. 2026): Volající (admin) své zobrazované jméno nemění, jen heslo; přejmenuje ho
    // jeho super admin nebo Albert. Jméno je vzor masky jmen kolegů (přejmenování na „chata“ by kolegovi schovalo jeho
    // vlastní řádky). ⚠ NAHRAZUJE „Admin mění jen sebe“ pro jméno (migrace 023).
    if (dn !== null && oriznoutMezery(dn) !== user.display_name && admin.id !== OWNER_ID && admin.role !== 'super_admin') {
      fail('Zobrazované jméno mění jen super admin nebo Albert. Požádejte svého super admina.');
    }
    if (role !== null && role !== user.role) {
      if (admin.id !== OWNER_ID) fail('Roli může měnit jen majitel účtu.');
      if (userId === admin.id) fail('Vlastní roli změnit nejde.');
      if (role !== 'admin' && role !== 'super_admin') fail(`Neplatná role: ${role}. Povolené: admin (Volající), super_admin.`);
    }
    if (mgr !== null && mgr !== user.manager_id && admin.id !== OWNER_ID) fail('Nadřízeného může měnit jen Albert.');
    if (active === false && active !== user.active) {
      if (userId === admin.id) fail('Nemůžete deaktivovat sám sebe.');
      // ⚠ NAHRAZUJE (042) „Deaktivovat admina nebo super admina může jen Albert“: Volajícího pod sebou smí super admin
      if (user.role === 'super_admin' && admin.id !== OWNER_ID) fail('Deaktivovat super admina může jen Albert.');
    }
    if (pw !== null && pw.length < 6) fail('Heslo musí mít alespoň 6 znaků.');
    // jméno jako server: trim (jen mezery), a jen když se opravdu mění (app_over_jmeno)
    if (dn !== null && oriznoutMezery(dn) !== user.display_name) checkName(oriznoutMezery(dn), userId);
    if (mgr !== null && users.find((u) => u.id === mgr)?.role !== 'super_admin') fail('Nadřízený musí být super admin.');

    // přejmenování: přepsat jméno i u klientů a zpráv, ať staré jméno nejde „převzít"
    if (dn !== null && oriznoutMezery(dn) !== user.display_name) {
      const old = user.display_name;
      const nove = oriznoutMezery(dn);
      for (const c of kontakty) if (c.last_caller === old) c.last_caller = nove;
      for (const t of chatThreads) if (t.created_by === old && t.created_by !== 'agent') t.created_by = nove;
      for (const m of chatMessages) if (m.sender_type === 'admin' && m.sender_name === old) m.sender_name = nove;
      user.display_name = nove;
    }
    if (pw !== null) user.password = pw;
    if (role !== null && role !== user.role) {
      if (user.role === 'super_admin') {
        for (const u of users) if (u.manager_id === user.id) u.manager_id = OWNER_ID;
      }
      user.role = role;
      user.manager_id = role === 'super_admin' ? null : mgr ?? user.manager_id ?? OWNER_ID;
    } else if (mgr !== null && user.role !== 'super_admin') {
      user.manager_id = mgr;
    }
    if (active !== null) user.active = active;

    return {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      active: user.active,
      manager_id: user.manager_id,
    };
  },

  async listAdminMessages(token: string, status?: 'open' | 'resolved' | null) {
    await delay();
    authOwner(token); // stará tabulka o všech klientech — jen Albert (migrace 023)
    if (status && status !== 'open' && status !== 'resolved') {
      fail(`Neplatný status: ${status}. Povolené: open, resolved.`);
    }
    return messages
      .filter((m) => !status || m.status === status)
      .slice()
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
      .map((m) => ({ ...m }));
  },

  async replyAdminMessage(token: string, id: number, reply: string, applyAlways: boolean) {
    await delay();
    authOwner(token);
    if (!reply.trim()) fail('Odpověď nesmí být prázdná.');
    const msg = messages.find((m) => m.id === id);
    if (!msg) fail(`Zpráva id=${id} neexistuje.`);
    msg.reply = reply.trim();
    msg.apply_always = applyAlways;
    msg.status = 'resolved';
    msg.resolved_at = now();
    return { ...msg };
  },

  /* ---- chat (migrace 002, viditelnost migrace 023) ---- */

  async listThreads(
    token: string,
    status?: ThreadStatus | null,
    scope?: ThreadScope | null,
    userId?: number | null,
    userIds?: number[] | null
  ): Promise<ChatThread[]> {
    await delay();
    const user = auth(token);
    // migrace 074 (kontrakt §6.5): výběr lidí napřed (Volající jen sám sebe, dnešní větou), spolu s p_user_id odmítnut
    const vyberLidi = idsVyberu(userIds);
    if (vyberLidi) {
      overVyber(user, vyberLidi, 'Zprávy jiného člověka vidí jen jeho super admin.');
      if (userId !== null && userId !== undefined) fail(VYBER_DVAKRAT);
    }
    if (status && status !== 'open' && status !== 'resolved') {
      fail(`Neplatný status: ${status}. Povolené: open, resolved.`);
    }
    if (scope && scope !== 'automatizace' && scope !== 'klient') {
      fail(`Neplatný scope: ${scope}. Povolené: automatizace, klient.`);
    }
    mayPick(user, userId, 'Zprávy');
    // migrace 045 (recenze 20. 10. 2026): jméno jiného Volajícího „jiný volající“ (created_by, předmět, náhled)
    const { kolegove, vidi } = jmenaKolegu(user);
    const bezKolegu = (s: string) => poznamkaBezCizich(s, kolegove, vidi) ?? s;
    // migrace 048 (audit soukromí 20. 10. 2026): Volajícímu číslo faktury „(číslo skryto)“ (předmět, náhled)
    const skryt = !(user.id === OWNER_ID || user.role === 'super_admin');
    const bezCisel = (s: string) => (skryt ? bezCislaFaktury(s) : s);
    const visible = visibleThreadIds(user);
    // migrace 074: vlákna kohokoli z vybraných (app_vlakna_uzivatelu(p_user_ids)), dál jen ta, která přihlášený vidí
    const jeho = vyberLidi ? threadsOf(vyberLidi) : userId != null ? threadsOf([userId]) : null;
    const rows = chatThreads
      .filter((t) => visible.has(t.id))
      .filter((t) => jeho === null || jeho.has(t.id))
      .filter((t) => !status || t.status === status)
      .filter((t) => !scope || mockScope(t) === scope)
      .map((t) => {
        const msgs = chatMessages
          .filter((m) => m.thread_id === t.id)
          .sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.id - b.id
          );
        const last = msgs[msgs.length - 1] ?? null;
        const k = kontakty.find((c) => c.id === t.kontakt_id);
        return {
          id: t.id,
          kontakt_id: t.kontakt_id,
          kontakt_name: k?.name ?? null,
          subject: bezCisel(bezKolegu(t.subject)),
          status: t.status,
          scope: mockScope(t),
          alert_key: t.alert_key ?? null,
          created_by: bezKolegu(t.created_by),
          last_message_at: t.last_message_at,
          created_at: t.created_at,
          majitel: maskedName(user, k?.last_caller ?? null),
          last_message_preview: last ? [...bezCisel(bezKolegu(last.body))].slice(0, 140).join('') : null,
          last_sender_type: last ? last.sender_type : null,
          message_count: msgs.length,
          same_alert_open:
            user.id === OWNER_ID && t.alert_key && t.kontakt_id === null
              ? chatThreads.filter(
                  (s) => s.alert_key === t.alert_key && s.status === 'open' && s.id !== t.id && s.kontakt_id === null
                    && s.created_by === 'agent'   // migrace 048: jen systémová vlákna
                ).length
              : 0,
        };
      });
    // řazení jako server: čeká na člověka, pak ostatní otevřená, pak vyřešená; od nejnovějšího
    const rank = (t: ChatThread) =>
      t.status !== 'open' ? 2 : t.last_sender_type === 'agent' ? 0 : 1;
    return rows.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime() ||
        b.id - a.id
    );
  },

  async getThread(token: string, threadId: number): Promise<ThreadDetail> {
    await delay();
    const user = auth(token);
    const t = chatThreads.find((x) => x.id === threadId);
    if (!t) fail(`Vlákno id=${threadId} neexistuje.`);
    if (!visibleThreadIds(user).has(t.id)) fail('Tohle vlákno patří někomu jinému.');
    const k = kontakty.find((c) => c.id === t.kontakt_id);
    // migrace 045 (recenze 20. 10. 2026): jméno jiného Volajícího „jiný volající“ (created_by, předmět, odesílatel,
    // text); super admini, Albert a agenti beze změny
    const { kolegove, vidi } = jmenaKolegu(user);
    const bezKolegu = (s: string) => poznamkaBezCizich(s, kolegove, vidi) ?? s;
    // migrace 048 (audit soukromí 20. 10. 2026): Volajícímu číslo faktury „(číslo skryto)“ (předmět, text zpráv)
    const skryt = !(user.id === OWNER_ID || user.role === 'super_admin');
    const bezCisel = (s: string) => (skryt ? bezCislaFaktury(s) : s);
    const thread: ChatThreadInfo = {
      id: t.id,
      kontakt_id: t.kontakt_id,
      kontakt_name: k?.name ?? null,
      subject: bezCisel(bezKolegu(t.subject)),
      status: t.status,
      scope: mockScope(t),
      alert_key: t.alert_key ?? null,
      created_by: bezKolegu(t.created_by),
      last_message_at: t.last_message_at,
      created_at: t.created_at,
      majitel: maskedName(user, k?.last_caller ?? null),
      smi_psat: writableThreadIds(user).has(t.id),   // migrace 027: cizí vlákno jen ke čtení
    };
    const messagesAsc: ChatMessage[] = chatMessages
      .filter((m) => m.thread_id === t.id)
      .sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.id - b.id
      )
      .map((m) => ({ ...m, sender_name: bezKolegu(m.sender_name), body: bezCisel(bezKolegu(m.body)), pravidlo_stav: m.pravidlo_stav ?? null }));
    return { thread, messages: messagesAsc };
  },

  async postThreadMessage(token: string, threadId: number, body: string, applyAlways: boolean) {
    await delay();
    const user = auth(token);
    if (!body.trim()) fail('Zpráva nesmí být prázdná.');
    const t = chatThreads.find((x) => x.id === threadId);
    if (!t) fail(`Vlákno id=${threadId} neexistuje.`);
    if (!visibleThreadIds(user).has(t.id)) fail('Tohle vlákno patří někomu jinému.');
    if (!writableThreadIds(user).has(t.id)) fail('Tohle vlákno můžete číst, ale psát do něj může jen ten, komu klient patří, jeho super admin nebo Albert.');
    if (applyAlways && user.role !== 'admin' && user.role !== 'super_admin') {
      fail('Zapsat do pravidel smí jen admin.');
    }
    const msg: MockChatMessage = {
      id: nextChatMessageId++,
      thread_id: t.id,
      sender_type: 'admin',
      sender_name: user.display_name,
      body: body.trim(),
      apply_always: applyAlways,
      // „zapsat do pravidel" = návrh do fronty ke schválení Albertem (migrace 024)
      pravidlo_stav: applyAlways ? 'ceka' : null,
      created_at: now(),
    };
    chatMessages.push(msg);
    t.last_message_at = msg.created_at;
    t.status = 'open'; // resolved vlákno se odpovědí znovu otevře
    return { ...msg };
  },

  async createThread(token: string, subject: string, body: string, kontaktId?: number | null) {
    await delay();
    const user = auth(token);
    if (!subject.trim()) fail('Předmět nesmí být prázdný.');
    if (!body.trim()) fail('Zpráva nesmí být prázdná.');
    if (kontaktId != null && !kontakty.some((c) => c.id === kontaktId)) {
      fail(`Kontakt id=${kontaktId} neexistuje.`);
    }
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      if (kontaktId == null || !myKontaktIds(user).has(kontaktId)) {
        fail('Jen ke svým klientům.');
      }
    } else if (kontaktId != null && !canEdit(user, kontaktId)) {
      // vzkaz agentovi = pokyn workerovi, takže jen ke klientovi, kterého smí upravovat (migrace 025)
      fail('Vzkaz agentovi k tomuhle klientovi může založit jen ten, kdo mu volá, jeho super admin nebo Albert.');
    }
    const t: MockThread = {
      id: nextThreadId++,
      kontakt_id: kontaktId ?? null,
      subject: subject.trim(),
      status: 'open',
      created_by: user.display_name,
      last_message_at: now(),
      created_at: now(),
    };
    chatThreads.push(t);
    chatMessages.push({
      id: nextChatMessageId++,
      thread_id: t.id,
      sender_type: 'admin',
      sender_name: user.display_name,
      body: body.trim(),
      apply_always: false,
      created_at: t.created_at,
    });
    return { thread_id: t.id };
  },

  async resolveThread(token: string, threadId: number) {
    await delay();
    const user = authAdmin(token);
    const t = chatThreads.find((x) => x.id === threadId);
    if (!t) fail(`Vlákno id=${threadId} neexistuje.`);
    if (!visibleThreadIds(user).has(t.id)) fail('Tohle vlákno patří někomu jinému.');
    if (!writableThreadIds(user).has(t.id)) fail('Tohle vlákno můžete číst, ale vyřešit ho může jen ten, komu klient patří, jeho super admin nebo Albert.');
    t.status = 'resolved';
    return { ok: true, thread_id: t.id, status: 'resolved' };
  },

  async resolveAlert(token: string, key: string) {
    await delay();
    authOwner(token); // systémová vlákna vidí jen Albert (migrace 023)
    let n = 0;
    for (const t of chatThreads) {
      if (t.alert_key === key && t.status === 'open' && t.kontakt_id === null && mockScope(t) === 'automatizace') {
        t.status = 'resolved';
        n += 1;
      }
    }
    return { ok: true, resolved: n, key };
  },

  /* ---- přepínání účtů Claude (migrace 011) ---- */

  async getAutomationStatus(token: string): Promise<AutomationStatus> {
    await delay();
    authOwner(token); // stav automatizace jen Albert (migrace 023)
    return mockAutomationStatus();
  },

  async requestAccountSwitch(token: string, slug: string): Promise<AutomationStatus> {
    await delay();
    const u = mockAuthAdmin(token);
    if (u.id !== 1) throw new Error('Přepínat účet automatizace smí jen Albert.');
    if (!mockAccounts.some((a) => a.slug === slug)) throw new Error(`Neznámý účet: ${slug}`);
    if (mockControl.phase === 'draining' && mockControl.drain_reason === 'stop') {
      throw new Error('Automatizace se právě vypíná. Nejdřív zruš vypnutí, pak přepni účet.');
    }
    if (mockControl.phase === 'stopped') {
      // vypnuto = nic neběží, přepne se hned
      mockControl.active_account = slug;
      mockControl.requested_account = slug;
      mockControl.switched_at = now();
    } else if (slug === mockControl.active_account) {
      mockControl.requested_account = slug;
      mockControl.phase = 'running';
      mockControl.drain_reason = null;
      mockRunning = [];
    } else {
      mockControl.requested_account = slug;
      mockControl.phase = 'draining';
      mockControl.drain_reason = 'switch';
      mockControl.requested_by = u.display_name;
      mockControl.requested_at = now();
      mockControl.drain_started_at = now();
      mockRunning = mockDemoJobs();
    }
    mockControl.updated_at = now();
    return mockAutomationStatus();
  },

  /* ---- vypínač automatizace (migrace 012) ---- */

  async requestAutomationStop(token: string): Promise<AutomationStatus> {
    await delay();
    const u = mockAuthAdmin(token);
    if (u.id !== 1) throw new Error('Vypínat automatizaci smí jen Albert.');
    if (mockControl.phase === 'draining' && mockControl.drain_reason === 'switch') {
      throw new Error('Právě probíhá přepnutí účtu. Počkej, až doběhne, nebo ho nejdřív zruš.');
    }
    if (mockControl.phase === 'running') {
      mockControl.phase = 'draining';
      mockControl.drain_reason = 'stop';
      mockControl.stop_requested_at = now();
      mockControl.drain_started_at = now();
      mockRunning = mockDemoJobs();
      mockControl.updated_at = now();
    }
    return mockAutomationStatus();
  },

  async cancelAutomationStop(token: string): Promise<AutomationStatus> {
    await delay();
    const u = mockAuthAdmin(token);
    if (u.id !== 1) throw new Error('Vypínat automatizaci smí jen Albert.');
    if (mockControl.phase === 'draining' && mockControl.drain_reason === 'stop') {
      mockControl.phase = 'running';
      mockControl.drain_reason = null;
      mockControl.stop_requested_at = null;
      mockRunning = [];
      mockControl.updated_at = now();
    }
    return mockAutomationStatus();
  },

  async requestAutomationStart(token: string): Promise<AutomationStatus> {
    await delay();
    const u = mockAuthAdmin(token);
    if (u.id !== 1) throw new Error('Zapínat automatizaci smí jen Albert.');
    if (mockControl.phase === 'stopped') {
      mockControl.phase = 'running';
      mockControl.drain_reason = null;
      mockControl.stop_requested_at = null;
      mockControl.stopped_at = null;
      mockControl.stop_notified_at = null;
      mockControl.started_at = now();
      mockControl.updated_at = now();
    } else if (mockControl.phase === 'draining' && mockControl.drain_reason === 'stop') {
      return this.cancelAutomationStop(token);
    }
    return mockAutomationStatus();
  },

  /* ---- rozvrh volání (migrace 042): stejná pravidla a hlášky jako server ---- */

  async rozvrh(token: string, userId: number | null = null): Promise<Rozvrh> {
    await delay(120);
    const me = auth(token);
    if (userId !== null && userId !== undefined && userId !== me.id && me.role !== 'super_admin') {
      fail('Rozvrh jiného člověka vidí jen super admin.');
    }
    const cil = users.find((u) => u.id === (userId ?? me.id));
    if (!cil) fail(`Uživatel id=${userId} neexistuje.`);
    return rozvrhPro(me, cil);
  },

  async ulozitRozvrh(token: string, userId: number, dny: RozvrhDenVstup[]): Promise<Rozvrh> {
    await delay();
    const me = auth(token);
    // práva napřed jako server (recenze 18. 10. 2026): Volající podle hlášky nepozná, které id existuje
    if ((userId ?? me.id) !== me.id && me.role !== 'super_admin') fail('Rozvrh jiného člověka nastavuje jen super admin.');
    const cil = users.find((u) => u.id === (userId ?? me.id));
    if (!cil) fail(`Uživatel id=${userId} neexistuje.`);
    const hlava = rozvrhy.get(cil.id);
    if (me.role !== 'super_admin' && hlava?.zamceno) fail('Rozvrh už je nastavený. Změnit ho může jen super admin.');
    if (!Array.isArray(dny) || dny.length !== 7) fail('Rozvrh musí mít všech 7 dní (pondělí až neděle).');
    const videno = new Set<number>();
    for (const d of dny) {
      const hodiny = Number(d.hodiny ?? 0);
      if (!Number.isInteger(d.den) || Number.isNaN(hodiny)) fail('Neplatný den nebo počet hodin v rozvrhu.');
      if (d.den < 1 || d.den > 7 || videno.has(d.den)) fail('Rozvrh musí mít každý den pondělí až neděle právě jednou.');
      if (hodiny < 0 || hodiny > 12 || hodiny * 2 !== Math.trunc(hodiny * 2)) {
        fail(`Hodiny na den jsou 0 až 12, po půlhodinách (${DNY_ZKRATKY[d.den - 1]}: ${hodiny}).`);
      }
      videno.add(d.den);
    }
    const ulozene = [...dny]
      .sort((a, b) => a.den - b.den)
      .map((d) => {
        const hodiny = Number(d.hodiny ?? 0);
        const od = hodiny > 0 && d.od && d.od.trim() ? d.od.trim() : null;
        if (od !== null && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(od)) {
          fail(`Čas začátku je ve tvaru HH:MM (${DNY_ZKRATKY[d.den - 1]}: ${od}).`);
        }
        return { den: d.den, hodiny, od: od && od.length === 4 ? '0' + od : od };
      });
    rozvrhy.set(cil.id, hlava
      ? { ...hlava, zamceno: true, zmenil_id: me.id, zmeneno_at: now(), dny: ulozene }
      : { zamceno: true, nastavil_id: me.id, nastaveno_at: now(), zmenil_id: null, zmeneno_at: null, dny: ulozene });
    return rozvrhPro(me, cil);
  },

  async odemknoutRozvrh(token: string, userId: number): Promise<Rozvrh> {
    await delay();
    const me = auth(token);
    if (me.role !== 'super_admin') fail('Odemknout rozvrh může jen super admin.');
    const cil = users.find((u) => u.id === userId);
    if (!cil) fail(`Uživatel id=${userId} neexistuje.`);
    const hlava = rozvrhy.get(cil.id);
    if (!hlava) fail('Rozvrh ještě není nastavený, není co odemknout.');
    rozvrhy.set(cil.id, { ...hlava, zamceno: false, zmenil_id: me.id, zmeneno_at: now() });
    return rozvrhPro(me, cil);
  },

  async poznamkaRozvrhu(token: string, den: string, text: string): Promise<Rozvrh> {
    await delay(120);
    const me = auth(token);
    const dnes = denPraha(new Date());
    const od = posunDen(dnes, -(isoDen(dnes) - 1));
    if (!den || den < od || den > posunDen(od, 6)) fail('Poznámku jde napsat jen ke dni tohoto týdne.');
    const t = (text ?? '').trim();
    if (!t) rozvrhPoznamky.delete(`${me.id}|${den}`);
    else {
      if (t.length > 1000) fail('Poznámka může mít nejvýš 1000 znaků.');
      rozvrhPoznamky.set(`${me.id}|${den}`, { text: t, at: now() });
    }
    return rozvrhPro(me, me);
  },

  async prehledRozvrhu(token: string): Promise<RozvrhPrehledRadek[]> {
    await delay();
    const me = auth(token);
    if (me.role !== 'super_admin') fail('Přehled rozvrhů vidí jen super admin.');
    const poradi: Record<RozvrhStav, number> = { pozadu: 0, bez_rozvrhu: 1, v_planu: 2, napred: 3 };
    return users
      .filter((u) => u.active && (u.role !== 'super_admin' || rozvrhy.has(u.id)))
      .map((u) => {
        const { dny, ...s } = rozvrhStav(u.id);
        return {
          ...s,
          display_name: u.display_name,
          role: u.role,
          manager_id: u.manager_id,
          manager_name: users.find((m) => m.id === u.manager_id)?.display_name ?? null,
          poznamek: dny.filter((d) => d.poznamka !== null).length,
        };
      })
      .sort((a, b) => poradi[a.souhrn.stav] - poradi[b.souhrn.stav] || b.souhrn.rozdil - a.souhrn.rozdil
        || a.display_name.localeCompare(b.display_name, 'cs'));
  },

  /* ---- kalendář hovorů a výdělek (migrace 050, Albert 21. 10. 2026): stejná pravidla a hlášky jako server ---- */

  async zavolatSeznam(
    token: string,
    userId: number | null = null,
    vsichni = false,
    jenCekajici = false,
    userIds: number[] | null = null
  ): Promise<ZavolatSeznam> {
    await delay(120);
    const me = auth(token);
    // migrace 074 (kontrakt §6.4): výběr lidí napřed (Volající jen sám sebe, dnešní větou), spolu s p_user_id nebo p_vsichni odmítnut
    const vyberLidi = idsVyberu(userIds);
    if (vyberLidi) {
      overVyber(me, vyberLidi, 'Kalendář jiného člověka vidí jen super admin.');
      if ((userId !== null && userId !== undefined) || vsichni === true) fail(VYBER_DVAKRAT);
    }
    // každý volající vidí svůj kalendář; super admini kohokoli a všech (jako Rozvrh, 042); práva napřed
    const vse = vsichni === true;
    if ((vse || (userId !== null && userId !== undefined && userId !== me.id)) && me.role !== 'super_admin') {
      fail('Kalendář jiného člověka vidí jen super admin.');
    }
    const kdo = userId ?? me.id;
    const hranice = Date.now() - 14 * 86400000;
    const polozky = zavolatRadky
      .filter((z) => (vyberLidi ? vyberLidi.includes(z.user_id) : vse || z.user_id === kdo)
        && (z.stav === 'ceka' || (jenCekajici !== true && z.uzavreno_at !== null && new Date(z.uzavreno_at).getTime() > hranice)))
      .map((z) => ({ z, uzavreny: z.stav !== 'ceka', razeni: z.stav === 'ceka' ? new Date(z.kdy).getTime() : -new Date(z.uzavreno_at!).getTime() }))
      .sort((a, b) => Number(a.uzavreny) - Number(b.uzavreny) || a.razeni - b.razeni || a.z.id - b.z.id)
      .slice(0, 500)
      .map(({ z }) => zavolatVen(me, z));
    return { dnes: denPraha(new Date()), ted: now(), polozky };
  },

  async zavolatNaplanovat(
    token: string,
    kontaktId: number,
    kdy: string,
    poznamka: string | null,
    userId: number | null = null
  ): Promise<ZavolatPolozka> {
    await delay();
    const me = auth(token);
    // práva napřed (jako rozvrh_ulozit, recenze 042): Volající podle hlášky nepozná, které id člověka existuje
    if (userId !== null && userId !== undefined && userId !== me.id && me.role !== 'super_admin') {
      fail('Hovor za jiného člověka plánuje jen super admin.');
    }
    let cil: MockUser = me;
    if (userId !== null && userId !== undefined && userId !== me.id) {
      const u = users.find((x) => x.id === userId && x.active);
      if (!u) fail(`Uživatel id=${userId} neexistuje nebo není aktivní.`);
      cil = u;
    }
    const kdyIso = overKdy(kdy);
    const pozn = zavolatPoznamka(poznamka);
    const c = kontakty.find((x) => x.id === kontaktId);
    if (!c) fail(`Kontakt id=${kontaktId} neexistuje.`);
    // Po recenzi 21. 10. 2026: Volající jen svému klientovi (kontaktu, kterému volal); kontakt z fronty přeplánuje při
    // hovoru. Jedna hláška pro všechno ostatní (cizí klient, kontakt mimo frontu, volný kontakt): podle ní nepozná, jestli
    // cizímu kontaktu někdo volal, ani jak je daleko (045, 048). ⚠ NAHRAZUJE „i kontaktu ve frontě, kterému nikdo
    // nevolal“ (rezervace naplánováním) a strop 30 rezervací. Volný kontakt rezervuje jen super admin, když ho někomu dá.
    if (me.role !== 'super_admin' && !kontaktyOf([me.id]).has(c.id)) {
      fail('Naplánovat hovor můžete jen svému klientovi (kontaktu, kterému jste volal/a). Kontakt z fronty naplánujete při hovoru tlačítkem Přeplánovat.');
    }
    // migrace 062 (D19, Albert 2. 11. 2026: „Limit it“; A3): odmítnutému, Nekontaktovat a Nerelevantnímu se hovor neplánuje,
    // až po kontrole vlastního klienta (o cizím kontaktu se Volající nedozví ani stav), stejné věty jako server
    if (c.status === 'odmitnuto') {
      fail('Klient web odmítl, hovor se mu neplánuje (Albert 2. 11. 2026). Když se ozval sám, že web chce, napište to agentovi ve vzkazu u klienta.');
    }
    if (c.status === 'nekontaktovat' || c.status === 'nerelevantni') {
      fail(`Klient je ve stavu ${c.status}: hovor se mu neplánuje. Když chce, abychom se mu zase ozývali, změňte stav v detailu klienta s důvodem.`);
    }
    let z = cekajiciHovor(c.id);
    // čekající hovor neaktivního člověka: zruší se a vznikne nový (nikdo ho už nevolá, Volající ho přesunout nesmí)
    if (z && !drziAktivni(z)) {
      vratRezervaci(z);
      z.stav = 'zruseno';
      z.uzavreno_at = now();
      z.vysledek = NEAKTIVNI;
      z.zmenil_id = me.id;
      z.zmeneno_at = now();
      z = undefined;
    }
    if (z && z.user_id !== me.id && me.role !== 'super_admin') {
      fail('Tenhle kontakt už má naplánovaný hovor u jiného člověka. Přesunout ho může on nebo super admin.');
    }
    if (z) {
      // jeden čekající hovor na kontakt: další naplánování ho přesune (super admin ho smí dát jinému člověku)
      if (z.user_id !== cil.id) {
        vratRezervaci(z);
        z.rezervace = false;
      }
      z.user_id = cil.id;
      z.kdy = kdyIso;
      // po recenzi 21. 10. 2026: bez nové poznámky zůstane stará (coalesce)
      z.poznamka = pozn ?? z.poznamka;
      z.zmenil_id = me.id;
      z.zmeneno_at = now();
    } else {
      z = {
        id: nextZavolatId++, kontakt_id: c.id, user_id: cil.id, kdy: kdyIso, poznamka: pozn, stav: 'ceka', vysledek: null,
        rezervace: false, puvodni_last_caller: null, vytvoril_id: me.id, created_at: now(), zmenil_id: null, zmeneno_at: null,
        uzavreno_at: null,
      };
      zavolatRadky.push(z);
    }
    // rezervace: kontakt ve frontě bez volajícího, kterému super admin naplánoval hovor (Volající sem s volným kontaktem
    // nedojde), dostane last_caller toho, kdo má volat (znovu změřeno po přesunu: vrácená rezervace kontakt zase uvolní)
    if (me.role === 'super_admin' && VE_FRONTE(c.status) && kontaktBezMajitele(c.id)) {
      z.rezervace = true;
      z.puvodni_last_caller = c.last_caller;
      c.last_caller = cil.display_name;
      c.updated_at = now();
    }
    return zavolatVen(me, z);
  },

  async zavolatPresunout(
    token: string,
    id: number,
    kdy: string,
    poznamka: string | null,
    userId: number | null = null
  ): Promise<ZavolatPolozka> {
    await delay();
    const me = auth(token);
    if (userId !== null && userId !== undefined && userId !== me.id && me.role !== 'super_admin') {
      fail('Hovor jinému člověku přeřadí jen super admin.');
    }
    const z = zavolatRadky.find((x) => x.id === id);
    // cizí hovor Volajícímu stejnou hláškou jako neexistující (nepozná, čí hovory existují)
    if (!z || (z.user_id !== me.id && me.role !== 'super_admin')) fail(`Naplánovaný hovor id=${id} neexistuje nebo není váš.`);
    if (z.stav !== 'ceka') fail('Hovor už není naplánovaný (je hotový nebo zrušený). Naplánujte nový.');
    // ⚠ 3. 11. 2026 (ověření 062, DB F2): hovor klienta ve stavu odmitnuto, nekontaktovat nebo nerelevantni se nepřesouvá,
    // stejnými větami jako zavolatNaplanovat (jako server)
    const kz = kontakty.find((x) => x.id === z.kontakt_id);
    if (kz?.status === 'odmitnuto') {
      fail('Klient web odmítl, hovor se mu neplánuje (Albert 2. 11. 2026). Když se ozval sám, že web chce, napište to agentovi ve vzkazu u klienta.');
    }
    if (kz && (kz.status === 'nekontaktovat' || kz.status === 'nerelevantni')) {
      fail(`Klient je ve stavu ${kz.status}: hovor se mu neplánuje. Když chce, abychom se mu zase ozývali, změňte stav v detailu klienta s důvodem.`);
    }
    let cil = users.find((u) => u.id === z.user_id)!;
    if (userId !== null && userId !== undefined && userId !== z.user_id) {
      const u = users.find((x) => x.id === userId && x.active);
      if (!u) fail(`Uživatel id=${userId} neexistuje nebo není aktivní.`);
      cil = u;
    }
    const kdyIso = overKdy(kdy);
    // poznámka napřed: na serveru chyba v ní vrátí celou transakci i s vrácenou rezervací
    const pozn = zavolatPoznamka(poznamka);
    const prerazeni = cil.id !== z.user_id;
    if (prerazeni) {
      vratRezervaci(z);
      z.rezervace = false;
    }
    z.user_id = cil.id;
    z.kdy = kdyIso;
    z.poznamka = pozn;
    z.zmenil_id = me.id;
    z.zmeneno_at = now();
    // přeřazení jinému člověku: rezervace volného kontaktu jde s hovorem jako v zavolat_naplanovat (oprava migrace 050
    // po suchém běhu 21. 10. 2026: bez ní kontakt bez volajícího po přeřazení nepatřil nikomu)
    const c = kontakty.find((x) => x.id === z.kontakt_id);
    if (prerazeni && c && VE_FRONTE(c.status) && kontaktBezMajitele(c.id)) {
      z.rezervace = true;
      z.puvodni_last_caller = c.last_caller;
      c.last_caller = cil.display_name;
      c.updated_at = now();
    }
    return zavolatVen(me, z);
  },

  async zavolatZrusit(token: string, id: number): Promise<{ ok: boolean; id: number }> {
    await delay();
    const me = auth(token);
    const z = zavolatRadky.find((x) => x.id === id);
    if (!z || (z.user_id !== me.id && me.role !== 'super_admin')) fail(`Naplánovaný hovor id=${id} neexistuje nebo není váš.`);
    if (z.stav !== 'ceka') fail('Hovor už není naplánovaný (je hotový nebo zrušený).');
    vratRezervaci(z);
    z.stav = 'zruseno';
    z.uzavreno_at = now();
    z.vysledek = 'zrušeno';
    z.zmenil_id = me.id;
    z.zmeneno_at = now();
    return { ok: true, id: z.id };
  },

  async zavolatHotovo(token: string, id: number, vysledek: string | null = null): Promise<{ ok: boolean; id: number }> {
    await delay();
    const me = auth(token);
    const z = zavolatRadky.find((x) => x.id === id);
    if (!z || (z.user_id !== me.id && me.role !== 'super_admin')) fail(`Naplánovaný hovor id=${id} neexistuje nebo není váš.`);
    if (z.stav !== 'ceka') fail('Hovor už není naplánovaný (je hotový nebo zrušený).');
    // klient ve frontě se uzavírá výsledkem hovoru (resolve_call) nebo zrušením, jinak by rezervace zůstala bez hovoru
    const kh = kontakty.find((x) => x.id === z.kontakt_id);
    if (kh && VE_FRONTE(kh.status)) {
      fail('Klient je ve frontě volání: hovor uzavřete výsledkem ve volání (Zavolat teď), nebo ho zrušte.');
    }
    const text = zavolatPoznamka(vysledek);
    const vys = text ?? 'hotovo';
    z.stav = 'hotovo';
    z.uzavreno_at = now();
    z.vysledek = vys;
    z.zmenil_id = me.id;
    z.zmeneno_at = now();
    // migrace 063 (audit F4; Albert 2. 11. 2026: „the automation actually reads it“): text z Hotovo jde do vlákna kontaktu jako
    // zpráva člověka, jen s právem kontakt upravit; bez textu nic a „dovolání: …“ (poDovolani v kalendáři, vzkaz už poslal
    // zapis_hovor) taky ne
    if (kh && text !== null && !text.startsWith('dovolání: ') && canEdit(me, kh.id)) {
      vzkazAgentovi(me, kh, `Naplánovaný hovor hotový (${me.display_name}): ${text}`);
    }
    return { ok: true, id: z.id };
  },

  async zavolatVzit(token: string, id: number): Promise<Kontakt> {
    await delay();
    const me = auth(token);
    const z = zavolatRadky.find((x) => x.id === id);
    // „Zavolat teď“ jen ten, kdo má volat (i super admin jen svůj hovor; cizí si přeřadí přes zavolat_presunout)
    if (!z || z.user_id !== me.id) fail(`Naplánovaný hovor id=${id} neexistuje nebo není váš.`);
    if (z.stav !== 'ceka') fail('Hovor už není naplánovaný (je hotový nebo zrušený).');
    const c = kontakty.find((x) => x.id === z.kontakt_id)!;
    if (!VE_FRONTE(c.status)) {
      fail('Tenhle klient není ve frontě volání, kartu volání pro něj appka nemá. Zavolejte mu (číslo je v kalendáři) a hovor pak označte jako hotový.');
    }
    if (c.lock_by !== null && c.lock_by !== me.id && c.lock_at !== null && new Date(c.lock_at).getTime() > Date.now() - 2 * 3600 * 1000) {
      fail('Kontakt teď volá někdo jiný. Zkuste to za chvíli.');
    }
    // vlastní platný zámek zůstává i s časem (po recenzi 21. 10. 2026): 30 minut na vrácení a 2 h zámku běží od vzetí
    // karty, „Zavolat teď“ je neposouvá (jako průchod 0 v next_contact)
    const vlastniPlatny = c.lock_by === me.id && c.lock_at !== null && new Date(c.lock_at).getTime() > Date.now() - 2 * 3600 * 1000;
    c.lock_by = me.id;
    if (!vlastniPlatny) c.lock_at = now();
    c.updated_at = now();
    return kartaSHovorem(me, c);
  },

  async zavolatKontaktu(token: string, kontaktId: number): Promise<ZavolatPolozka | null> {
    await delay(80);
    const me = auth(token);
    // čekající hovor kontaktu: Volající jen svůj (o cizím se nedozví ani to, že existuje), super admin kterýkoli
    const z = cekajiciHovor(kontaktId);
    if (!z || (z.user_id !== me.id && me.role !== 'super_admin')) return null;
    return zavolatVen(me, z);
  },

  async statistikyVolani(token: string, userId: number | null = null): Promise<StatistikyVolani> {
    await delay(120);
    const me = auth(token);
    // práva napřed (jako rozvrh_get, 042): Volající jen svoje (Albert 19. a 20. 10. 2026, migrace 045)
    if (userId !== null && userId !== undefined && userId !== me.id && me.role !== 'super_admin') {
      fail('Statistiky jiného člověka vidí jen super admin.');
    }
    const cil = users.find((u) => u.id === (userId ?? me.id));
    if (!cil) fail(`Uživatel id=${userId} neexistuje.`);
    const logs = callLog.filter((l) => l.user_id === cil.id);
    return {
      user_id: cil.id,
      nerelevantni: logs.filter((l) => l.outcome === 'nerelevantni').length,
      preplanovano: logs.filter((l) => l.outcome === 'preplanovano').length,
      vydelek: vydelekPro(cil.id),
    };
  },

  async zobrazeneStavy(token: string): Promise<ZobrazenyStav[]> {
    await delay(40);
    // zobrazene_stavy (migrace 071): server vrací jen vlastní řádky přihlášeného; demo zobrazený stav nemá nikomu
    // (Prodáno a Vyděláno s ním počítá jen server, test db/tests/test_071_zobrazeny_stav.sql)
    auth(token);
    return [];
  },

  async zajemPodleVolajicich(token: string, segment: Segment | null = null): Promise<ZajemPodleVolajicich> {
    await delay(100);
    const me = auth(token);
    // migrace 069 (db/migration_069_zajem_podle_volajicich.sql): jen super admin jako all_stats (045), pak segment
    if (me.role !== 'super_admin') fail('Statistiky ostatních vidí jen super admin.');
    checkSegment(segment, true);
    const nuly = (): ZajemPocty => ({ chce_web: 0, odpovedel: 0, zajem: 0, ceka: 0 });
    const podle = new Map<string | null, ZajemPocty>();
    for (const c of kontakty) {
      if (segment && segmentOf(c) !== segment) continue;
      // doslova jako server: potvrzený web (PRODANO_STAVY = prodáno), filtr 068 (napsal, neodmítl, nepotvrdil), návrh
      // bez odpovědi
      const chce = PRODANO_STAVY.includes(c.status);
      const odp = !!c.last_client_reply_at && !STAVY_MIMO_068.includes(c.status);
      const ceka = c.status === 'navrh_odeslan' && !c.last_client_reply_at;
      if (!chce && !odp && !ceka) continue;
      const klic = c.last_caller ?? null;
      const p = podle.get(klic) ?? nuly();
      if (chce) p.chce_web += 1;
      if (odp) p.odpovedel += 1;
      if (ceka) p.ceka += 1;
      p.zajem = p.chce_web + p.odpovedel;
      podle.set(klic, p);
    }
    const radky: ZajemRadek[] = [...podle.entries()]
      .filter((e): e is [string, ZajemPocty] => e[0] !== null)
      .map(([volajici, p]) => {
        const u = users.find((x) => x.display_name === volajici);
        return { volajici, user_id: u?.id ?? null, active: u ? u.active : null, ...p };
      })
      // pořadí jako server: zájem, chce web, čeká (sestupně), pak jméno (collate "C" = pořadí znaků)
      .sort((a, b) => b.zajem - a.zajem || b.chce_web - a.chce_web || b.ceka - a.ceka
        || (a.volajici < b.volajici ? -1 : a.volajici > b.volajici ? 1 : 0));
    const bez = podle.get(null) ?? nuly();
    const celkem = nuly();
    for (const p of podle.values()) {
      celkem.chce_web += p.chce_web;
      celkem.odpovedel += p.odpovedel;
      celkem.zajem += p.zajem;
      celkem.ceka += p.ceka;
    }
    return { radky, bez_volajiciho: bez, celkem };
  },

  async praceTep(token: string, druh: DruhSignalu, kontaktId: number | null = null): Promise<boolean> {
    await delay(60);
    // prace_tep (migrace 072, kontrakt §4.1): každý přihlášený jen sám za sebe; odpověď vždy stejná, bez čísel (true = {ok: true})
    const user = auth(token);
    if (!DRUHY_SIGNALU.includes(druh)) fail(`Neplatný druh signálu: ${druh ?? '(null)'}. Povolené: karta, tep, konec.`);
    if (druh === 'karta' && (kontaktId === null || kontaktId === undefined)) fail('Signál karta potřebuje kontakt.');
    // úklid jako server: řádky starší 400 dní, nejvýš 1 000 za volání
    const hranice = Date.now() - 400 * 86400000;
    for (let i = praceAktivita.length - 1, n = 0; i >= 0 && n < 1000; i--) {
      if (new Date(praceAktivita[i].at).getTime() < hranice) {
        praceAktivita.splice(i, 1);
        n += 1;
      }
    }
    const zapis = (kid: number | null) => praceAktivita.push({ id: nextPraceId++, user_id: user.id, druh, at: now(), kontakt_id: kid });
    if (druh === 'karta') {
      // jen kontakt, který smí dělat; cizí a neexistující stejnou odpovědí bez zápisu (nic neprozradí)
      if (smiDelatKontakt(user, kontaktId as number)) zapis(kontaktId as number);
    } else if (druh === 'tep') {
      // tep nejvýš jednou za 20 s (mladší tep téhož člověka = nic)
      const posledni = praceAktivita.filter((p) => p.user_id === user.id && p.druh === 'tep').pop();
      if (!posledni || Date.now() - new Date(posledni.at).getTime() >= 20000) zapis(null);
    } else {
      zapis(null);
    }
    return true;
  },

  async odmitnutiDuvodZapis(
    token: string,
    kontaktId: number,
    faze: FazeOdmitnuti,
    duvod: DuvodOdmitnutiKod,
    text: string | null = null
  ): Promise<{ ok: true }> {
    await delay(60);
    // odmitnuti_duvod_zapis (migrace 072, kontrakt §4.2). Pořadí kontrol jako server: relace, role, fáze, důvod, text, kontakt.
    const user = authAdmin(token);
    if (faze !== 'nahled' && faze !== 'sleva') fail(`Neplatná fáze odmítnutí: ${faze ?? '(null)'}. Povolené: nahled, sleva.`);
    if (!DUVODY_ODMITNUTI.some((d) => d.kod === duvod)) {
      fail(`Neplatný důvod odmítnutí: ${duvod ?? '(null)'}. Povolené: ma_web, cena, navrh, nepotrebuje, pozdeji, konci, jine, neuvedl.`);
    }
    // text jako server (regexp_replace '\r\n|[\r\n]' na mezeru, btrim mezer a tabulátorů): prázdný = null, nejvýš 450
    // znaků, u jine povinný
    const t = String(text ?? '').replace(/\r\n|[\r\n]/g, ' ').replace(/^[ \t]+|[ \t]+$/g, '') || null;
    if (duvod === 'jine' && t === null) fail('U důvodu „Jiný důvod“ napište, proč návrh odmítl.');
    if (t !== null && [...t].length > 450) fail('Text důvodu je moc dlouhý: nejvýš 450 znaků.');
    const c = kontakty.find((x) => x.id === kontaktId);
    const sup = user.role === 'super_admin';
    if (!sup) {
      // Volající: jen klient, kterého smí upravit a který dostal návrh; cizí, neexistující a bez návrhu jednou větou
      if (!c || !canEdit(user, c.id) || !c.first_proposal_at) fail(ODMITNUTI_JEN_SVUJ);
    } else {
      // super admin u každého klienta s návrhem (i u toho, kterého upravit nesmí)
      if (!c) fail(`Kontakt id=${kontaktId} neexistuje.`);
      if (!c.first_proposal_at) fail('Klientovi ještě neodešel návrh webu: důvod odmítnutí návrhu se u něj nezapisuje.');
    }
    // jména kolegů v textu maskou 045 (super admin vidí všechny, jeho text zůstane)
    const { cizi, vidi } = jmenaPro(user);
    odmitnutiRadky.push({
      id: nextOdmitnutiId++,
      kontakt_id: c.id,
      faze,
      duvod,
      text: poznamkaBezCizich(t, cizi, vidi),
      zdroj: sup ? 'super_admin' : 'volajici',
      zapsal: `app:${user.id}`,
      at: now(),
    });
    // bez čísla řádku (pořadové číslo celé firmy je číslo, které Volající vidět nesmí)
    return { ok: true };
  },

  async prehledLide(token: string, filtr: PrehledFiltrVstup | null = null): Promise<PrehledObalka<DataLide>> {
    await delay();
    // Přehled vedení (migrace 073, kontrakt §5.5): jen super admin, napřed stráž, pak filtr
    return prehledLideMock(auth(token), filtr);
  },

  // Přehled vedení, ostatní funkce migrace 073 (úkol 13): napřed relace a stráž super admina, pak parametry (R3)
  async prehledMoznosti(token: string) { await delay(); return prehledMoznostiMock(auth(token)); },
  async prehledSouhrn(token: string, filtr: PrehledFiltrVstup | null = null) { await delay(); return prehledSouhrnMock(auth(token), filtr); },
  async prehledRada(token: string, metrika: MetrikaRadyKlic, zrnitost: ZrnitostRady = 'den', filtr: PrehledFiltrVstup | null = null) {
    await delay();
    return prehledRadaMock(auth(token), metrika, zrnitost, filtr);
  },
  async prehledTrychtyr(token: string, filtr: PrehledFiltrVstup | null = null) { await delay(); return prehledTrychtyrMock(auth(token), filtr); },
  async prehledPipeline(token: string, filtr: PrehledFiltrVstup | null = null) { await delay(); return prehledPipelineMock(auth(token), filtr); },
  async prehledKlienti(token: string, filtr: PrehledFiltrVstup | null = null) { await delay(); return prehledKlientiMock(auth(token), filtr); },
  async prehledKomunikace(token: string, filtr: PrehledFiltrVstup | null = null) { await delay(); return prehledKomunikaceMock(auth(token), filtr); },
  async prehledFinance(token: string, filtr: PrehledFiltrVstup | null = null) { await delay(); return prehledFinanceMock(auth(token), filtr); },
  async prehledDodani(token: string, filtr: PrehledFiltrVstup | null = null) { await delay(); return prehledDodaniMock(auth(token), filtr); },
  async prehledPrognoza(token: string, filtr: PrehledFiltrVstup | null = null) { await delay(); return prehledPrognozaMock(auth(token), filtr); },
  async prehledKvalita(token: string) { await delay(); return prehledKvalitaMock(auth(token)); },
  async prehledAkce(token: string, filtr: PrehledFiltrVstup | null = null) { await delay(); return prehledAkceMock(auth(token), filtr); },
  async prehledRadky(token: string, zdroj: RadkyZdroj, filtr: PrehledFiltrVstup | null = null, kurzor: string | null = null, limit = 50) {
    await delay();
    return prehledRadkyMock(auth(token), zdroj, filtr, kurzor, limit);
  },
  async prehledKontakt(token: string, kontaktId: number) { await delay(); return prehledKontaktMock(auth(token), kontaktId); },
  async prehledDefinice(token: string) { await delay(); return prehledDefiniceMock(auth(token)); },

  // Přehled vedení, nastavení (migrace 072, úkol 14b): napřed relace a stráž super admina, pak parametry (R3); bez obálky
  async nakladySeznam(token: string) { await delay(); superNastaveni(token); return nakladySeznamMock(); },
  async nakladyUloz(token: string, naklad: NakladVstup) { await delay(); return nakladyUlozMock(superNastaveni(token), naklad); },
  async nakladyZrus(token: string, id: number) { await delay(); return nakladyZrusMock(superNastaveni(token), id); },
  async cileSeznam(token: string) { await delay(); return cileSeznamMock(superNastaveni(token)); },
  async cileUloz(token: string, cil: CilVstup) { await delay(); return cileUlozMock(superNastaveni(token), cil); },
  async cileZrus(token: string, id: number) { await delay(); return cileZrusMock(superNastaveni(token), id); },
  async provizeVyplatySeznam(token: string) { await delay(); superNastaveni(token); return provizeVyplatySeznamMock(); },
  async provizeVyplataUloz(token: string, vyplata: VyplataVstup) { await delay(); return provizeVyplataUlozMock(superNastaveni(token), vyplata); },
  async provizeVyplataZrus(token: string, id: number) { await delay(); return provizeVyplataZrusMock(superNastaveni(token), id); },
};

/**
 * Háček pro zkoušku v DEMO (tests/demo-e2e.mjs). Zapne se jen tehdy, když stránka ještě
 * PŘED načtením appky nastaví `globalThis.__volackaDemoTest` (Playwright `addInitScript`).
 * Mock běží jen v DEMO nad falešnými daty v paměti, takže háček nikdy nesáhne na živou DB.
 * - `zpozdeni(fn, args)` vrátí extra čekání v ms pro jedno volání (args bez tokenu); tak test
 *   pustí odpovědi mimo pořadí (odpověď po přepnutí segmentu nebo filtru).
 * - `volani` dostává záznam každého volání: jméno, argumenty bez tokenu, výsledek.
 * - `stav()` vrátí snímek zámků, stavů, poznámek, DPH architektů, od 051 jmen a cen, call_log a předmětů vláken.
 */
interface DemoTestHacek {
  zpozdeni?: (fn: string, args: unknown[]) => number;
  volani?: { fn: string; args: unknown[]; ok?: boolean; id?: number | null; chyba?: string; zacatek?: number; konec?: number }[];
  stav?: () => unknown;
  /** migrace 063: služební cesty serveru (worker, tick), appka je nevolá; test jimi ověřuje pravidla mocku */
  hvezdaAutomatizace?: (kid: number, duvod: string | null) => unknown;
  zaradPripominku?: (kid: number, job: number) => boolean;
  pripominkaOdeslana?: (kid: number) => unknown;
  /** migrace 064 (obory): fronta niky prázdná (její firmy odmítnuté, kromě `nechat`), e2e blok OB měří text prázdné fronty a kartu */
  vyprazdniNiku?: (klic: string, nechat?: number[]) => number;
  /** recenze B9: živá session zapne niku v DB, zatímco má volající appku otevřenou (e2e OB5: obnova registru bez odhlášení) */
  zapniNiku?: (klic: string) => void;
  /** recenze B9: živá session niku pozastaví (e2e OB5: otevřená záložka se starým registrem) */
  nastavStavNiky?: (klic: string, stav: MockNika['stav']) => void;
  /** recenze B9: vlastní naplánovaný hovor člověka `uid`, jehož čas už nastal (e2e OB6: řádek „Máš naplánovaný hovor“) */
  naplanujDosly?: (kid: number, uid: number) => number;
  /**
   * Přehled vedení úkol 12: vynucená chyba volání (vrátí text chyby, nebo nic = volání proběhne). e2e T12l jím měří, že neuložený
   * důvod odmítnutí výsledek hovoru nezruší (server bez migrace 072).
   */
  selhani?: (fn: string, args: unknown[]) => string | null | undefined;
  /** Přehled vedení úkol 13, oprava po recenzi (bod 6): jiná definice_verze odpovědí, jako by server nasadil nový katalog (e2e PV10) */
  prehledVerze?: string;
  /** totéž, bod 4: nejvýš tolik řádků na stránku prehled_radky (e2e PV11: chyba kurzoru na třetí stránce) */
  prehledLimit?: number;
  /**
   * Přehled vedení úkol 14b: zdroj Hovory bez jediného řádku (call_log prázdný), jako server před prvním hovorem; vrátí funkci,
   * která řádky vrátí zpět (npm test Z10g2: výsledků za hodinu nedostupné, nikdy ověřená 0)
   */
  vyprazdniHovory?: () => () => void;
  /**
   * Přehled vedení úkol 14c (parita s 073): živé ukázkové tabulky Přehledu (kontakty, historie stavů, faktury, platby, náklady,
   * výplaty, naplánované hovory, označení, zprávy) a začátek historie; npm test prehledparita z nich staví scénáře 073 (faktura před
   * začátkem plateb, víc než 50 případů, změny stavu pro most pipeline …) a po sobě je uklidí
   */
  prehledDemo?: () => unknown;
}

/** Pořadí začátků a konců volání v záznamu e2e (zacatek, konec). */
let poradiVolani = 0;

function sDemoTestem(api: Api): Api {
  const hacek = (globalThis as { __volackaDemoTest?: DemoTestHacek }).__volackaDemoTest;
  if (!hacek || typeof hacek !== 'object') return api;
  hacek.volani = hacek.volani ?? [];
  hacek.hvezdaAutomatizace = hvezdaOdAutomatizace;
  hacek.zaradPripominku = zaradPripominkuOznaceni;
  hacek.pripominkaOdeslana = pripominkaOznaceniOdeslana;
  hacek.vyprazdniHovory = () => {
    const zaloha = callLog.splice(0, callLog.length);
    return () => {
      callLog.push(...zaloha);
    };
  };
  hacek.prehledDemo = () => ({
    kontakty, callLog, historieStavu: HISTORIE_STAVU, historieOd: PREHLED_HISTORIE_OD, faktury: PREHLED_FAKTURY, platby: PREHLED_PLATBY,
    naklady: PREHLED_NAKLADY, vyplaty: PREHLED_VYPLATY, zavolat: zavolatRadky, oznaceni: oznaceniRadky, zpravy: PREHLED_ZPRAVY,
  });
  hacek.zapniNiku = (klic: string) => zapniDemoObory([klic]);
  hacek.nastavStavNiky = (klic: string, stav: MockNika['stav']) => nastavStavNikyDemo(klic, stav);
  hacek.naplanujDosly = (kid: number, uid: number) => {
    const id = nextZavolatId++;
    zavolatRadky.push({
      id, kontakt_id: kid, user_id: uid, kdy: new Date(Date.now() - 5 * 60 * 1000).toISOString(), poznamka: null, stav: 'ceka',
      vysledek: null, rezervace: false, puvodni_last_caller: null, vytvoril_id: uid, created_at: now(), zmenil_id: null,
      zmeneno_at: null, uzavreno_at: null,
    });
    return id;
  };
  hacek.vyprazdniNiku = (klic: string, nechat: number[] = []) => {
    let n = 0;
    for (const c of kontakty) {
      if (segmentOf(c) !== klic || nechat.includes(c.id)) continue;
      c.status = 'odmitnuto';
      c.lock_by = null;
      c.lock_at = null;
      n += 1;
    }
    return n;
  };
  hacek.stav = () => ({
    kontakty: kontakty.map((c) => ({
      id: c.id,
      segment: segmentOf(c),
      status: c.status,
      lock_by: c.lock_by,
      last_caller: c.last_caller,
      note: c.note,
      flag_kind: c.flag_kind,
      dph_osobni: c.dph_osobni ?? null,
      dph_firma: c.dph_firma ?? null,
      // migrace 064 (obory): stav a hodnocení webu firmy (e2e blok OB: věta na kartě a v detailu)
      web_stav: c.web_stav ?? null,
      web_hodnoceni: c.web_hodnoceni ?? null,
      email: c.email,
      firma: c.firma ?? null,
      // migrace 051 (22. 10. 2026): jméno a ceny (e2e blok A: zájem bez ceny uloží null, ne prázdný text)
      name: c.name,
      cena_web: c.cena_web,
      cena_hosting: c.cena_hosting,
      // migrace 056 (27. 10. 2026): poslední změna, stav a známka pro e2e bloky F (filtry Moji klienti a řazení)
      updated_at: c.updated_at,
      // migrace 057 (28. 10. 2026): změna stavu a poslední změna (e2e blok R057)
      status_changed_at: c.status_changed_at ?? null,
      posledni_zmena: posledniZmena(c),
      rating: c.rating,
      cekani_kind: cekaniOf(c).kind,
      prodano_at: PRODANO_STAVY.includes(c.status) ? datumProdeje(c) : null,
      // migrace 060 (1. 11. 2026): hvězda, mlčení a časy pošty (e2e bloky O060)
      hvezda_at: c.hvezda_at ?? null,
      hvezda_kdo: c.hvezda_kdo ?? null,
      // migrace 063: důvod hvězdy (u hvězdy od automatizace ho píše worker)
      hvezda_duvod: c.hvezda_duvod ?? null,
      mlci_pd: mlciPd(c),
      first_proposal_at: c.first_proposal_at,
      last_our_reply_at: c.last_our_reply_at,
      last_client_reply_at: c.last_client_reply_at,
    })),
    // migrace 056: i čas hovoru (e2e blok D: statistiky za jeden den v Praze)
    callLog: callLog.map((l) => ({ kontakt_id: l.kontakt_id, user_id: l.user_id, outcome: l.outcome, created_at: l.created_at })),
    vlakna: chatThreads.map((t) => ({ id: t.id, kontakt_id: t.kontakt_id, subject: t.subject })),
    // migrace 060: zprávy ve vláknech (dovolání „mluvili jsme“ jde agentovi jako vzkaz)
    zpravy: chatMessages.map((m) => ({ thread_id: m.thread_id, sender_type: m.sender_type, sender_name: m.sender_name, body: m.body })),
    // migrace 050: kalendář hovorů (e2e bloky N, P, K, H)
    zavolat: zavolatRadky.map((z) => ({ id: z.id, kontakt_id: z.kontakt_id, user_id: z.user_id, kdy: z.kdy, poznamka: z.poznamka, stav: z.stav, rezervace: z.rezervace, vysledek: z.vysledek })),
    // migrace 060: označení k zavolání (otevřená i uzavřená)
    oznaceni: oznaceniRadky.map((o) => ({ ...o })),
    // migrace 062 (D6): kdo je teď kandidát označení (oznaceni_kandidati) a úspěšná dovolání, která ho rozhodují
    kandidati: kontakty.flatMap((c) => {
      const kand = kandidatOznaceni(c);
      return kand ? [{ kontakt_id: c.id, kategorie: kand.kategorie, od: kand.od }] : [];
    }),
    dovolani: [...dovolaniUspesna.entries()].map(([kontakt_id, casy]) => ({ kontakt_id, casy: [...casy] })),
    // Přehled vedení úkol 12 (migrace 072): uložené signály časovače práce a důvody odmítnutí (e2e blok T12, npm test pracovnicas)
    prace: praceAktivita.map((p) => ({ ...p })),
    odmitnuti: odmitnutiRadky.map((r) => ({ ...r })),
    // Přehled vedení úkol 14b (migrace 072): události nastavení naklad_zmena, cil_zmena a vyplata_zmena (npm test prehlednastaveni)
    udalostiNastaveni: UDALOSTI_NASTAVENI.map((u) => ({ ...u })),
  });
  return new Proxy(api, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver) as unknown;
      if (typeof v !== 'function') return v;
      const fn = v as (...a: unknown[]) => Promise<unknown>;
      return async (...args: unknown[]) => {
        // zacatek a konec = pořadí událostí (úkol 14a, oprava po recenzi: e2e měří, že týmy Vedení začnou až po kartách)
        const zaznam: NonNullable<DemoTestHacek['volani']>[number] = { fn: String(prop), args: args.slice(1), zacatek: ++poradiVolani };
        hacek.volani!.push(zaznam);
        const ms = Number(hacek.zpozdeni?.(String(prop), args.slice(1)) ?? 0);
        if (ms > 0) await new Promise<void>((r) => setTimeout(r, ms));
        const vynucena = hacek.selhani?.(String(prop), args.slice(1));
        if (vynucena) {
          zaznam.ok = false;
          zaznam.chyba = vynucena;
          zaznam.konec = ++poradiVolani;
          throw new Error(vynucena);
        }
        try {
          const out = (await fn.apply(target, args)) as { id?: number; kontakt_id?: number } | null;
          zaznam.ok = true;
          zaznam.id = out === null ? null : out?.id ?? out?.kontakt_id;
          zaznam.konec = ++poradiVolani;
          return out;
        } catch (e) {
          zaznam.ok = false;
          zaznam.chyba = String(e instanceof Error ? e.message : e);
          zaznam.konec = ++poradiVolani;
          throw e;
        }
      };
    },
  });
}

demoOboryZUloziste();

export const mockApi: Api = sDemoTestem(mockApiZaklad);

// interní čítač, ať TypeScript nehlásí nepoužitou proměnnou při budoucích úpravách
void nextKontaktId;
void nextMessageId;
