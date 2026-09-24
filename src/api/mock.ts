// DEMO režim: in-memory mock implementující stejné rozhraní jako Supabase RPC.
// Umožňuje plně proklikat UI bez backendu. Data žijí jen v paměti (reload = reset).

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
  Rating,
  ResolveCallArgs,
  Role,
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
// ním Honza; Petra a Eva (admin) pod Albertem. Hesla jsou jen pro DEMO (README).
const users: MockUser[] = [
  { id: 1, username: 'admin', display_name: 'Albert', password: 'admin', role: 'super_admin', active: true, manager_id: null },
  { id: 2, username: 'petra', display_name: 'Petra', password: 'volam', role: 'caller', active: true, manager_id: 1 },
  { id: 3, username: 'honza', display_name: 'Honza', password: 'volam', role: 'caller', active: true, manager_id: 4 },
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
    note: '[2026-08-20 Petra] Nebrali telefon, zkusit odpoledne.',
    status: 'nedovolano',
    last_caller: 'Petra',
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
];

const callLog: CallLogRow[] = [
  { id: nextCallLogId++, kontakt_id: 2, user_id: 2, outcome: 'nedovolano', created_at: daysAgo(12) },
  { id: nextCallLogId++, kontakt_id: 4, user_id: 2, outcome: 'odmitnuto', created_at: daysAgo(22) },
  { id: nextCallLogId++, kontakt_id: 7, user_id: 2, outcome: 'zajem', created_at: daysAgo(33) },
  { id: nextCallLogId++, kontakt_id: 3, user_id: 3, outcome: 'zajem', created_at: daysAgo(14) },
  { id: nextCallLogId++, kontakt_id: 5, user_id: 3, outcome: 'zajem', created_at: daysAgo(27) },
  { id: nextCallLogId++, kontakt_id: 8, user_id: 3, outcome: 'nedovolano', created_at: daysAgo(7) },
];

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

/** app_viditelni: Albert všechny, super admin sebe + své lidi, ostatní jen sebe. */
function visibleIds(u: MockUser): number[] {
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

/** app_vlakna_viditelna: Albert vše; systémová nikdo jiný; super admin navíc klienty bez volajícího. */
function visibleThreadIds(u: MockUser): Set<number> {
  if (u.id === OWNER_ID) return new Set(chatThreads.map((t) => t.id));
  const own = threadsOf(visibleIds(u));
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

/** app_kontakt_ven: jméno volajícího jen svoje / svých lidí (Albert vše), je_muj. */
function maskedName(u: MockUser, name: string | null): string | null {
  if (name === null) return null;
  if (u.id === OWNER_ID || namesOf(visibleIds(u)).includes(name)) return name;
  return JINY;
}

function forViewer(u: MockUser, c: Kontakt): Kontakt {
  return { ...c, last_caller: maskedName(u, c.last_caller), je_muj: myKontaktIds(u).has(c.id) };
}

function mayPick(u: MockUser, target: number | null | undefined, what: string): void {
  if (target == null || target === u.id) return;
  if (!(u.role === 'super_admin' && visibleIds(u).includes(target))) {
    fail(`${what} jiného člověka vidí jen jeho super admin.`);
  }
}

const RESERVED = ['agent', 'automatizace', 'dispatcher', 'hlídka', 'hlidka', 'watchdog', 'live:session',
  'admin', 'systém', 'system', 'jiný volající', 'jiny volajici'];

function checkName(name: string, selfId: number | null): void {
  const n = name.trim();
  if (n.length < 2 || n.length > 60) fail('Zobrazované jméno musí mít 2–60 znaků.');
  if (RESERVED.includes(n.toLowerCase()) || /^agent\b/i.test(n)) fail(`Jméno „${n}" je vyhrazené pro automatizaci. Zvolte jiné.`);
  if (users.some((x) => x.id !== selfId && x.display_name.trim().toLowerCase() === n.toLowerCase())) {
    fail(`Jméno „${n}" už má jiný uživatel. Zvolte jiné (klienti a zprávy se lidem přiřazují podle jména).`);
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

export const mockApi: Api = {
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

  async nextContact(token: string): Promise<Kontakt | null> {
    await delay();
    const user = auth(token);
    const cutoff = Date.now() - 2 * 3600 * 1000;
    // Musí zůstat shodné s db/migration_007_next_contact_random.sql:
    // jen nekontaktovano + nedovolano, koho jsme dnes už volali se dnes
    // znovu nenabídne, a výběr je NÁHODNÝ (ne podle id).
    const callable = kontakty.filter(
      (c) =>
        (c.status === 'nekontaktovano' || c.status === 'nedovolano') &&
        (c.lock_by === null ||
          (c.lock_at !== null && new Date(c.lock_at).getTime() < cutoff) ||
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
    return forViewer(user, next);
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
    const kontakt = kontakty.find((c) => c.id === args.kontakt_id);
    if (!kontakt) fail(`Kontakt id=${args.kontakt_id} neexistuje.`);

    callLog.push({
      id: nextCallLogId++,
      kontakt_id: kontakt.id,
      user_id: user.id,
      outcome,
      created_at: now(),
    });

    const note = (args.note ?? '').trim();
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
    if (note) {
      const stamp = `[${new Date().toISOString().slice(0, 10)} ${user.display_name}] ${note}`;
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
    const best = users
      .map((u) => ({ id: u.id, ...statsFor(u.id) }))
      .sort((a, b) => b.sold - a.sold || b.calls - a.calls || a.id - b.id)[0];
    return { je_prvni: !!best && best.sold > 0 && best.id === me.id };
  },

  async listKontakty(token: string, f: ListKontaktyFilters): Promise<ListKontaktyResult> {
    await delay();
    // Kontakty vidí všichni (migrace 023); filtr podle volajícího jen sebe / své lidi.
    const me = auth(token);
    if (f.caller && me.id !== OWNER_ID && !namesOf(visibleIds(me)).includes(f.caller)) {
      fail(`Podle volajícího můžete filtrovat jen sebe${me.role === 'super_admin' ? ' a své lidi' : ''}.`);
    }
    const search = (f.search ?? '').trim().toLowerCase();
    const matches = (c: Kontakt) =>
      (!f.status || c.status === f.status) &&
      (!f.caller || c.last_caller === f.caller) &&
      (!f.rating || c.rating === f.rating) &&
      (!f.cekani || cekaniOf(c).kind === f.cekani) &&
      (!f.kos || kosOfMock(cekaniOf(c).since) === f.kos) &&
      (!search ||
        [c.name, c.phone, c.web, c.email, c.note].some(
          (v) => v && v.toLowerCase().includes(search)
        ));
    const filtered = kontakty.filter(matches).sort((a, b) => {
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
    const limit = Math.max(f.limit ?? 200, 1);
    return {
      total: filtered.length,
      rows: filtered.slice(offset, offset + limit).map((c) => {
        const cek = cekaniOf(c);
        return {
          ...forViewer(me, c),
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
    userId: number | null = null
  ): Promise<ListKontaktyResult> {
    await delay();
    const user = auth(token);
    mayPick(user, userId, 'Klienty');
    const ids = kontaktyOf([userId ?? user.id]);
    const filtered = kontakty
      .filter((c) => ids.has(c.id))
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
      rows: filtered.slice(off, off + lim).map((c) => forViewer(user, c)),
    };
  },

  async updateKontakt(token: string, id: number, patch: Record<string, unknown>): Promise<Kontakt> {
    await delay();
    const me = authAdmin(token);
    // komu kontakt patří (last_caller) mění jen super admin, a jen na své lidi (migrace 023)
    if (patch && 'last_caller' in patch) {
      if (me.role !== 'super_admin') fail('Přeřadit kontakt jinému volajícímu smí jen super admin.');
      const v = String(patch.last_caller ?? '').trim();
      if (v && me.id !== OWNER_ID && !namesOf(visibleIds(me)).includes(v)) {
        fail('Kontakt můžete přeřadit jen sobě nebo svým lidem.');
      }
    }
    const allowed = [
      'phone', 'name', 'ma_web', 'web', 'email', 'note', 'status', 'rating',
      'cena_web', 'cena_hosting', 'last_caller', 'obor',
      'lovable_project_id', 'live_url', 'clear_lock',
      'flag_kind', 'flag_note',
    ];
    if (!patch || Object.keys(patch).length === 0) fail('Prázdný patch — není co měnit.');
    for (const key of Object.keys(patch)) {
      if (!allowed.includes(key)) {
        fail(`Pole "${key}" nelze měnit přes update_kontakt. Povolená: ${allowed.join(', ')}`);
      }
    }
    const kontakt = kontakty.find((c) => c.id === id);
    if (!kontakt) fail(`Kontakt id=${id} neexistuje.`);
    const target = kontakt as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'clear_lock') {
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
    return forViewer(me, kontakt);
  },

  /* ---- příznaky (migrace 005) ---- */

  async setFlag(token: string, id: number, kind: FlagKind, note: string): Promise<Kontakt> {
    await delay();
    const user = authAdmin(token);
    const kontakt = kontakty.find((c) => c.id === id);
    if (!kontakt) fail(`Kontakt id=${id} neexistuje.`);
    kontakt.flag_kind = kind;
    kontakt.flag_note = note.trim() || null;
    kontakt.flagged_at = now();
    kontakt.flagged_by = user.display_name;
    kontakt.updated_at = now();
    return forViewer(user, kontakt);
  },

  async clearFlag(token: string, id: number): Promise<Kontakt> {
    await delay();
    const user = authAdmin(token);
    const kontakt = kontakty.find((c) => c.id === id);
    if (!kontakt) fail(`Kontakt id=${id} neexistuje.`);
    kontakt.flag_kind = null;
    kontakt.flag_note = null;
    kontakt.flagged_at = null;
    kontakt.flagged_by = null;
    kontakt.updated_at = now();
    return forViewer(user, kontakt);
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
      .map((c) => forViewer(user, c));
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
    if (!username.trim()) fail('Uživatelské jméno nesmí být prázdné.');
    if (!password || password.length < 6) fail('Heslo musí mít alespoň 6 znaků.');
    if (role !== 'admin' && role !== 'caller' && role !== 'super_admin') {
      fail(`Neplatná role: ${role}. Povolené: caller, admin, super_admin.`);
    }
    if (role !== 'caller' && admin.id !== OWNER_ID) {
      fail('Nového admina nebo super admina může založit jen Albert. Vy můžete zakládat volající.');
    }
    if (users.some((u) => u.username === username.trim())) {
      fail(`Uživatel "${username.trim()}" už existuje.`);
    }
    const name = displayName.trim() || username.trim();
    checkName(name, null);
    const manager =
      role === 'super_admin'
        ? null
        : admin.id === OWNER_ID
          ? managerId ?? OWNER_ID
          : admin.role === 'super_admin'
            ? admin.id
            : admin.manager_id ?? OWNER_ID;
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
    const role = args.role ?? null;
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
    if (role !== null && role !== user.role) {
      if (admin.id !== OWNER_ID) fail('Roli může měnit jen majitel účtu.');
      if (userId === admin.id) fail('Vlastní roli změnit nejde.');
    }
    if (mgr !== null && mgr !== user.manager_id && admin.id !== OWNER_ID) fail('Nadřízeného může měnit jen Albert.');
    if (active === false && active !== user.active) {
      if (userId === admin.id) fail('Nemůžete deaktivovat sám sebe.');
      if (user.role !== 'caller' && admin.id !== OWNER_ID) fail('Deaktivovat admina nebo super admina může jen Albert.');
    }
    if (pw !== null && pw.length < 6) fail('Heslo musí mít alespoň 6 znaků.');
    if (dn !== null && dn.trim() !== user.display_name) checkName(dn, userId);
    if (mgr !== null && users.find((u) => u.id === mgr)?.role !== 'super_admin') fail('Nadřízený musí být super admin.');

    // přejmenování: přepsat jméno i u klientů a zpráv, ať staré jméno nejde „převzít"
    if (dn !== null && dn.trim() !== user.display_name) {
      const old = user.display_name;
      const nove = dn.trim();
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
          subject: t.subject,
          status: t.status,
          scope: mockScope(t),
          alert_key: t.alert_key ?? null,
          created_by: t.created_by,
          last_message_at: t.last_message_at,
          created_at: t.created_at,
          majitel: maskedName(user, k?.last_caller ?? null),
          last_message_preview: last ? last.body.slice(0, 140) : null,
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
    const thread: ChatThreadInfo = {
      id: t.id,
      kontakt_id: t.kontakt_id,
      kontakt_name: k?.name ?? null,
      subject: t.subject,
      status: t.status,
      scope: mockScope(t),
      alert_key: t.alert_key ?? null,
      created_by: t.created_by,
      last_message_at: t.last_message_at,
      created_at: t.created_at,
      majitel: maskedName(user, k?.last_caller ?? null),
    };
    const messagesAsc: ChatMessage[] = chatMessages
      .filter((m) => m.thread_id === t.id)
      .sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.id - b.id
      )
      .map((m) => ({ ...m }));
    return { thread, messages: messagesAsc };
  },

  async postThreadMessage(token: string, threadId: number, body: string, applyAlways: boolean) {
    await delay();
    const user = auth(token);
    if (!body.trim()) fail('Zpráva nesmí být prázdná.');
    const t = chatThreads.find((x) => x.id === threadId);
    if (!t) fail(`Vlákno id=${threadId} neexistuje.`);
    if (!visibleThreadIds(user).has(t.id)) fail('Tohle vlákno patří někomu jinému.');
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
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      if (kontaktId == null || !myKontaktIds(user).has(kontaktId)) {
        fail('Jen ke svým klientům.');
      }
    }
    if (kontaktId != null && !kontakty.some((c) => c.id === kontaktId)) {
      fail(`Kontakt id=${kontaktId} neexistuje.`);
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
};

// interní čítač, ať TypeScript nehlásí nepoužitou proměnnou při budoucích úpravách
void nextKontaktId;
void nextMessageId;
