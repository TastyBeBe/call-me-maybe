// DEMO režim: in-memory mock implementující stejné rozhraní jako Supabase RPC.
// Umožňuje plně proklikat UI bez backendu. Data žijí jen v paměti (reload = reset).

import { icoVidi, rodinaOf, segmentOf } from '../segment';
import { pracovniDenPo, pracovniDnyMezi, prahaNaIso, zacatekDnePraha } from '../praha';
import type {
  CekaniKind,
  CekaniKos,
  AdminMessage,
  Api,
  AutomationAccount,
  AutomationControl,
  AutomationRunningJob,
  AutomationStatus,
  ChatMessage,
  ChatSender,
  ChatThread,
  ChatThreadInfo,
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
  OborNika,
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
  VysledekDovolani,
  VysledekHovoru,
  ZapisHovoruVysledek,
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
    fail(`${what} jiného člověka vidí jen super admin.`);
  }
}

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

/** Je zapnutý aspoň jeden nový filtr (Volajícímu pak sedí jen jeho klienti)? */
function filtr060(f: FiltryMlceni | null | undefined): boolean {
  return !!(f?.statusy?.length || f?.znamky?.length || f?.jen_hvezda || f?.kategorie?.length
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
    });

    // preplanovano -> nedovolano (zůstává ve frontě, drží ho kalendář), ostatní výsledky = stav (050)
    const novyStav: KontaktStatus = outcome === 'preplanovano' ? 'nedovolano' : (outcome as KontaktStatus);
    // migrace 057: změna stavu posune status_changed_at jako trigger na serveru (migrace 013)
    if (kontakt.status !== novyStav) kontakt.status_changed_at = now();
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
    checkSegment(segment, true);
    // migrace 056: řazení napřed (jako server), pak výběr člověka
    checkRazeni(filtry?.razeni);
    mayPick(user, userId, 'Klienty');
    // migrace 060: nové filtry jako server, označení jako po ticku
    checkFiltry060(filtry);
    obnovOznaceni();
    const ids = kontaktyOf([userId ?? user.id]);
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
    if (kontakt.status !== stavPred) kontakt.status_changed_at = now();
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
      if (bez && o.volajici_id !== null) return undefined;
      return o;
    };
    // příznaky v rozsahu list_flagged: Albert všechny, super admin klienti všech a bez volajícího, Volající svoji
    const moje = myKontaktIds(me);
    const rozsah = f.user_id != null ? kontaktyOf([f.user_id]) : kontaktyOf(visibleIds(me));
    // migrace 061 (Albert 2. 11. 2026): Volajícímu je info_neoverene jako bez příznaku (druhPro): řádek jen kvůli němu
    // nedostane, filtr druhů ani pořadí ho nepozná, řádek s jeho označením ano (příznak vynuluje forViewer)
    const priznakVidi = (c: Kontakt) =>
      !!druhPro(me, c) &&
      ((f.user_id == null && me.id === OWNER_ID) || rozsah.has(c.id) || (f.user_id == null && me.role === 'super_admin' && kontaktBezMajitele(c.id))) &&
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
    userId?: number | null
  ): Promise<ChatThread[]> {
    await delay();
    const user = auth(token);
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
    const jeho = userId != null ? threadsOf([userId]) : null;
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
    jenCekajici = false
  ): Promise<ZavolatSeznam> {
    await delay(120);
    const me = auth(token);
    // každý volající vidí svůj kalendář; super admini kohokoli a všech (jako Rozvrh, 042); práva napřed
    const vse = vsichni === true;
    if ((vse || (userId !== null && userId !== undefined && userId !== me.id)) && me.role !== 'super_admin') {
      fail('Kalendář jiného člověka vidí jen super admin.');
    }
    const kdo = userId ?? me.id;
    const hranice = Date.now() - 14 * 86400000;
    const polozky = zavolatRadky
      .filter((z) => (vse || z.user_id === kdo)
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
  volani?: { fn: string; args: unknown[]; ok?: boolean; id?: number | null; chyba?: string }[];
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
}

function sDemoTestem(api: Api): Api {
  const hacek = (globalThis as { __volackaDemoTest?: DemoTestHacek }).__volackaDemoTest;
  if (!hacek || typeof hacek !== 'object') return api;
  hacek.volani = hacek.volani ?? [];
  hacek.hvezdaAutomatizace = hvezdaOdAutomatizace;
  hacek.zaradPripominku = zaradPripominkuOznaceni;
  hacek.pripominkaOdeslana = pripominkaOznaceniOdeslana;
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
  });
  return new Proxy(api, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver) as unknown;
      if (typeof v !== 'function') return v;
      const fn = v as (...a: unknown[]) => Promise<unknown>;
      return async (...args: unknown[]) => {
        const zaznam: NonNullable<DemoTestHacek['volani']>[number] = { fn: String(prop), args: args.slice(1) };
        hacek.volani!.push(zaznam);
        const ms = Number(hacek.zpozdeni?.(String(prop), args.slice(1)) ?? 0);
        if (ms > 0) await new Promise<void>((r) => setTimeout(r, ms));
        try {
          const out = (await fn.apply(target, args)) as { id?: number; kontakt_id?: number } | null;
          zaznam.ok = true;
          zaznam.id = out === null ? null : out?.id ?? out?.kontakt_id;
          return out;
        } catch (e) {
          zaznam.ok = false;
          zaznam.chyba = String(e instanceof Error ? e.message : e);
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
