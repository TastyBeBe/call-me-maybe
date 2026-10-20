// DEMO režim: in-memory mock implementující stejné rozhraní jako Supabase RPC.
// Umožňuje plně proklikat UI bez backendu. Data žijí jen v paměti (reload = reset).

import { icoVidi, segmentOf } from '../segment';
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
  FlagKind,
  Kontakt,
  KontaktStatus,
  ListKontaktyFilters,
  ListKontaktyResult,
  MeInfo,
  MyStats,
  PravidloStav,
  Rating,
  ResolveCallArgs,
  Role,
  Rozvrh,
  RozvrhDen,
  RozvrhDenVstup,
  RozvrhPrehledRadek,
  RozvrhStav,
  Segment,
  Session,
  ThreadDetail,
  ThreadScope,
  ThreadStatus,
  UpdatedUser,
  UpdateUserArgs,
  UserStats,
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
  outcome: 'nedovolano' | 'odmitnuto' | 'zajem';
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
    // migrace 028: segment + pole architekta (u chat prázdná, CHECK kontakty_architekt_pole_check)
    segment: 'chata',
    firma: null,
    mesto: null,
    ico_osobni: null,
    ico_firma: null,
    dph_osobni: null,
    dph_firma: null,
    created_at: daysAgo(30),
    updated_at: daysAgo(5),
    ...partial,
  } as Kontakt;
}

/** Čekání na odpověď (migrace 014) — stejná pravidla jako SQL kontakt_cekani/kontakt_kos. */
function cekaniOf(c: Kontakt): { kind: CekaniKind | null; since: string | null } {
  if (['zaplaceno', 'domena_pripojena', 'hotovo', 'odmitnuto', 'pozastaveno'].includes(c.status))
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
    first_proposal_at: daysAgo(12),
    last_our_reply_at: daysAgo(12),
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
    id: 92,
    name: 'Penzion U Kašny — neodpovídá po naší odpovědi',
    phone: '+420 606 300 300',
    email: 'kasna@example.cz',
    status: 'ceka_na_klienta',
    live_url: 'https://penzion-u-kasny.example.app',
    first_proposal_at: daysAgo(40),
    last_client_reply_at: daysAgo(25),
    last_our_reply_at: daysAgo(11),
    flag_kind: 'neodpovida',
    flag_note: 'Klient si web vyžádal, my mu odpověděli a od té doby mlčí (11 dní). Zavolat mu.',
    flagged_at: daysAgo(4),
    flagged_by: 'automatizace',
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
    first_proposal_at: daysAgo(10),
    last_our_reply_at: daysAgo(10),
  }),
];

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
 */
export const KLICE_CIZI = ['id', 'segment', 'name', 'firma', 'phone', 'email', 'web', 'ma_web', 'obor', 'mesto',
  'ico_osobni', 'ico_firma', 'dph_osobni', 'dph_firma'] as const;

function forViewer(u: MockUser, c: Kontakt): Kontakt {
  const je_muj = myKontaktIds(u).has(c.id);
  const { cizi, vidi } = jmenaPro(u);
  // app_kontakt_ven (migrace 045, Albert 20. 10. 2026: Volající vidí stav jen u svých klientů): cizí kontakt jen
  // s klíči z allowlistu, skryto true; vlastní zámek (karta, kterou právě volá) zůstává
  if (cizi.length > 0 && !je_muj) {
    const zdroj = c as unknown as Record<string, unknown>;
    const z: Record<string, unknown> = {};
    for (const key of KLICE_CIZI) if (key in zdroj) z[key] = zdroj[key];
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
    if (c.lock_by !== null && !visibleIds(u).includes(c.lock_by)) {
      r.lock_by = null;
      r.lock_at = null;
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
  if (s === 'chata' || s === 'architekt') return;
  if (nullOk && (s === null || s === undefined)) return;
  fail(`Neplatný segment: ${s === null || s === undefined || s === '' ? '(nic)' : String(s)}. Povolené: chata, architekt.`);
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

function statsFor(userId: number): MyStats {
  const logs = callLog.filter((l) => l.user_id === userId);
  const calls = logs.length;
  const reached = logs.filter((l) => l.outcome !== 'nedovolano').length;
  const zajem = logs.filter((l) => l.outcome === 'zajem').length;
  const odmitnuto = logs.filter((l) => l.outcome === 'odmitnuto').length;
  const nedovolano = logs.filter((l) => l.outcome === 'nedovolano').length;
  // prodáno = klient web schválil a dál (migrace 022 — shodně se serverem)
  const soldIds = new Set(
    kontakty
      .filter(
        (c) =>
          ['schvaleno', 'faktura_odeslana', 'zaplaceno', 'domena_pripojena', 'hotovo'].includes(c.status) &&
          callLog.some((l) => l.kontakt_id === c.id && l.user_id === userId && l.outcome === 'zajem')
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

const STATUS_ORDER: Record<string, number> = {
  eskalace: 0,
  zajem: 1,
  schvaleno: 2,
  zaplaceno: 3,
  upravy_ve_vyrobe: 4,
  web_ve_vyrobe: 5,
  navrh_odeslan: 6,
  faktura_odeslana: 7,
  ceka_na_klienta: 8,
  domena_pripojena: 9,
  hotovo: 10,
  pozastaveno: 11,
  nedovolano: 20,
  nekontaktovano: 21,
  odmitnuto: 30,
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
const ZA_HODINU = 10;

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
    if (vlastni) return kartaPro(user, vlastni);
    // Musí zůstat shodné s db/migration_036_vlastni_karta.sql (tělo z 023 a 028):
    // jen nekontaktovano + nedovolano, jen zvolený segment, koho jsme dnes už volali
    // se dnes znovu nenabídne, a výběr je NÁHODNÝ (ne podle id).
    const callable = kontakty.filter(
      (c) =>
        segmentOf(c) === segment &&
        (c.status === 'nekontaktovano' || c.status === 'nedovolano') &&
        (c.lock_by === null ||
          c.lock_at === null ||
          new Date(c.lock_at).getTime() < cutoff ||
          c.lock_by === user.id)
    );
    const lastCall = (c: Kontakt) =>
      Math.max(
        0,
        ...callLog
          .filter((l) => l.kontakt_id === c.id)
          .map((l) => new Date(l.created_at).getTime())
      );
    const pick = (pool: Kontakt[]) =>
      pool.length === 0 ? null : pool[Math.floor(Math.random() * pool.length)];
    const next =
      // 1. průchod: dnes na ně nikdo nevolal
      pick(callable.filter((c) => lastCall(c) < startOfToday())) ??
      // 2. průchod (záloha): povolí opakování, ale ne do 4 hodin
      pick(callable.filter((c) => lastCall(c) < Date.now() - 4 * 3600 * 1000));
    if (!next) return null;
    next.lock_by = user.id;
    next.lock_at = now();
    next.updated_at = now();
    return kartaPro(user, next); // volajícímu bez IČO architekta (037)
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
    if (!['nedovolano', 'odmitnuto', 'zajem'].includes(outcome)) {
      fail(`Neplatný výsledek hovoru: ${outcome}. Povolené: nedovolano, odmitnuto, zajem.`);
    }
    const rating = (args.rating ?? '').trim();
    if (rating && !['A', 'B', 'C'].includes(rating)) {
      fail(`Neplatný rating: ${rating}. Povolené: A, B, C.`);
    }
    if (outcome === 'zajem') {
      if (!(args.cena_web ?? '').trim()) fail('Výsledek "zajem" vyžaduje vyplněnou cenu webu (cena_web).');
      if (!(args.cena_hosting ?? '').trim())
        fail('Výsledek "zajem" vyžaduje vyplněnou cenu hostingu (cena_hosting).');
      if (!['A', 'B', 'C'].includes(rating)) fail('Výsledek "zajem" vyžaduje rating A, B nebo C.');
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

    kontakt.status = outcome as KontaktStatus;
    kontakt.last_caller = user.display_name;
    kontakt.lock_by = null;
    kontakt.lock_at = null;
    if (rating) kontakt.rating = rating as Rating;
    if (outcome === 'zajem') {
      kontakt.cena_web = (args.cena_web ?? '').trim();
      kontakt.cena_hosting = (args.cena_hosting ?? '').trim();
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
    return { ok: true, kontakt_id: kontakt.id, status: kontakt.status };
  },

  async myStats(token: string): Promise<MyStats> {
    await delay();
    const user = auth(token);
    return statsFor(user.id);
  },

  async allStats(token: string): Promise<UserStats[]> {
    await delay();
    const me = auth(token);
    if (me.role !== 'super_admin') fail('Statistiky ostatních vidí jen super admin.');
    const ids = visibleIds(me);
    return users
      .filter((u) => ids.includes(u.id))
      .map((u) => ({
        user_id: u.id,
        username: u.username,
        display_name: u.display_name,
        role: u.role,
        active: u.active,
        manager_id: u.manager_id,
        manager_name: users.find((m) => m.id === u.manager_id)?.display_name ?? null,
        ...statsFor(u.id),
      }))
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
    const filtrStavu = !!(f.status || f.rating || f.cekani || f.kos);
    const poznamkaVHledani = (c: Kontakt) => (skryty(c) ? null : poznamkaBezCizich(c.note, cizi, vidi));
    const matches = (c: Kontakt) =>
      (!f.segment || segmentOf(c) === f.segment) &&
      (!filtrStavu || !skryty(c)) &&
      (!f.status || c.status === f.status) &&
      (!f.caller || c.last_caller === f.caller) &&
      (!f.rating || c.rating === f.rating) &&
      (!f.cekani || cekaniOf(c).kind === f.cekani) &&
      (!f.kos || kosOfMock(cekaniOf(c).since) === f.kos) &&
      // hledání i ve studiu, městě a IČO (migrace 028), IČO podle icoShoda výš
      (!search ||
        icoShoda(c) ||
        [c.name, c.phone, c.web, c.email, poznamkaVHledani(c), c.firma, c.mesto].some(
          (v) => v && v.toLowerCase().includes(search)
        ));
    const filtered = kontakty.filter(matches).sort((a, b) => {
      // Volající: napřed jeho klienti, cizí jen podle id (stav, čekání ani datum změny cizího pořadí neurčují)
      if (skryty(a) !== skryty(b)) return skryty(a) ? 1 : -1;
      if (skryty(a)) return a.id - b.id;
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
        // cizí kontakt Volajícího bez čekání (je to průběh), jako server (cekani_* nejsou v allowlistu)
        if (skryty(c)) return forList(me, c);
        const cek = cekaniOf(c);
        return {
          ...forList(me, c),
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
    segment: Segment | null = null
  ): Promise<ListKontaktyResult> {
    await delay();
    const user = auth(token);
    checkSegment(segment, true);
    mayPick(user, userId, 'Klienty');
    const ids = kontaktyOf([userId ?? user.id]);
    const filtered = kontakty
      .filter((c) => ids.has(c.id) && (!segment || segmentOf(c) === segment))
      .sort((a, b) => {
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
      rows: filtered.slice(off, off + lim).map((c) => forList(user, c)),
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
    if ('flag_kind' in patch && druh !== null
        && !['chybi_email', 'email_neoveren', 'info_neoverene', 'chybi_info', 'jine', 'neodpovida'].includes(druh)) {
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
    if (segmentOf(kontakt) !== 'architekt') {
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
    for (const [key, value] of Object.entries(patch)) {
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
    if (!['chybi_email', 'email_neoveren', 'info_neoverene', 'chybi_info', 'jine', 'neodpovida'].includes(druh)) {
      fail(`Neplatný druh příznaku: ${kind ?? '(null)'}. Povolené: chybi_email, email_neoveren, info_neoverene, chybi_info, jine, neodpovida.`);
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
    // strop délky poznámky z appky (migrace 046; jako update_kontakt: jen delší než uložená poznámka příznaku tak, jak ji
    // ukládající vidí, recenze 046 ⚠ NAHRAZUJE „delší než uložený originál“)
    if (poznamkaPresStrop(note, poznamkaBezCizich(kontakt?.flag_note ?? null, cizi, vidi))) {
      fail('Poznámka příznaku je moc dlouhá: nejvýš 5 000 znaků a 100 řádků (delší poznámku jde jen zkrátit).');
    }
    if (!kontakt) fail(`Kontakt ${id} neexistuje.`);
    const celaCizi = kontakt.flagged_by !== null && cizi.includes(kontakt.flagged_by);
    const text = cizi.length > 0 ? poznamkaZpet(kontakt.flag_note, note, cizi, vidi, celaCizi) : note;
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
      .filter((c) => c.flag_kind && (!kind || c.flag_kind === kind))
      .filter(
        (c) =>
          (userId == null && user.id === OWNER_ID) ||
          scopeIds.has(c.id) ||
          (userId == null && user.role === 'super_admin' && kontaktBezMajitele(c.id))
      )
      .sort((a, b) => (order[a.flag_kind!] ?? 9) - (order[b.flag_kind!] ?? 9) || a.id - b.id)
      .map((c) => forList(user, c));
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
          subject: bezKolegu(t.subject),
          status: t.status,
          scope: mockScope(t),
          alert_key: t.alert_key ?? null,
          created_by: bezKolegu(t.created_by),
          last_message_at: t.last_message_at,
          created_at: t.created_at,
          majitel: maskedName(user, k?.last_caller ?? null),
          last_message_preview: last ? [...bezKolegu(last.body)].slice(0, 140).join('') : null,
          last_sender_type: last ? last.sender_type : null,
          message_count: msgs.length,
          same_alert_open:
            user.id === OWNER_ID && t.alert_key && t.kontakt_id === null
              ? chatThreads.filter(
                  (s) => s.alert_key === t.alert_key && s.status === 'open' && s.id !== t.id && s.kontakt_id === null
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
    const thread: ChatThreadInfo = {
      id: t.id,
      kontakt_id: t.kontakt_id,
      kontakt_name: k?.name ?? null,
      subject: bezKolegu(t.subject),
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
      .map((m) => ({ ...m, sender_name: bezKolegu(m.sender_name), body: bezKolegu(m.body), pravidlo_stav: m.pravidlo_stav ?? null }));
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
};

/**
 * Háček pro zkoušku v DEMO (tests/demo-e2e.mjs). Zapne se jen tehdy, když stránka ještě
 * PŘED načtením appky nastaví `globalThis.__volackaDemoTest` (Playwright `addInitScript`).
 * Mock běží jen v DEMO nad falešnými daty v paměti, takže háček nikdy nesáhne na živou DB.
 * - `zpozdeni(fn, args)` vrátí extra čekání v ms pro jedno volání (args bez tokenu); tak test
 *   pustí odpovědi mimo pořadí (odpověď po přepnutí segmentu nebo filtru).
 * - `volani` dostává záznam každého volání: jméno, argumenty bez tokenu, výsledek.
 * - `stav()` vrátí snímek zámků, stavů, poznámek, DPH architektů, call_log a předmětů vláken.
 */
interface DemoTestHacek {
  zpozdeni?: (fn: string, args: unknown[]) => number;
  volani?: { fn: string; args: unknown[]; ok?: boolean; id?: number | null; chyba?: string }[];
  stav?: () => unknown;
}

function sDemoTestem(api: Api): Api {
  const hacek = (globalThis as { __volackaDemoTest?: DemoTestHacek }).__volackaDemoTest;
  if (!hacek || typeof hacek !== 'object') return api;
  hacek.volani = hacek.volani ?? [];
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
    })),
    callLog: callLog.map((l) => ({ kontakt_id: l.kontakt_id, user_id: l.user_id, outcome: l.outcome })),
    vlakna: chatThreads.map((t) => ({ id: t.id, kontakt_id: t.kontakt_id, subject: t.subject })),
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

export const mockApi: Api = sDemoTestem(mockApiZaklad);

// interní čítač, ať TypeScript nehlásí nepoužitou proměnnou při budoucích úpravách
void nextKontaktId;
void nextMessageId;
