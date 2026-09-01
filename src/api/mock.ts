// DEMO režim: in-memory mock implementující stejné rozhraní jako Supabase RPC.
// Umožňuje plně proklikat UI bez backendu. Data žijí jen v paměti (reload = reset).

import type {
  AdminMessage,
  Api,
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
  UserStats,
} from './types';

interface MockUser {
  id: number;
  username: string;
  display_name: string;
  password: string;
  role: Role;
  active: boolean;
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

const users: MockUser[] = [
  { id: 1, username: 'admin', display_name: 'Albert', password: 'admin', role: 'admin', active: true },
  { id: 2, username: 'petra', display_name: 'Petra', password: 'volam', role: 'caller', active: true },
  { id: 3, username: 'honza', display_name: 'Honza', password: 'volam', role: 'caller', active: true },
];

let nextUserId = 4;
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
    created_at: daysAgo(30),
    updated_at: daysAgo(5),
    ...partial,
  } as Kontakt;
}

const kontakty: Kontakt[] = [
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

const sessions = new Map<string, number>(); // token -> user_id

function fail(message: string): never {
  throw new Error(message);
}

function auth(token: string): MockUser {
  const uid = sessions.get(token);
  const user = users.find((u) => u.id === uid && u.active);
  if (!user) fail('Neplatná nebo vypršelá relace. Přihlaste se znovu.');
  return user;
}

function authAdmin(token: string): MockUser {
  const user = auth(token);
  if (user.role !== 'admin') fail('Přístup zamítnut: vyžadována role admin.');
  return user;
}

function statsFor(userId: number): MyStats {
  const logs = callLog.filter((l) => l.user_id === userId);
  const calls = logs.length;
  const reached = logs.filter((l) => l.outcome !== 'nedovolano').length;
  const zajem = logs.filter((l) => l.outcome === 'zajem').length;
  const odmitnuto = logs.filter((l) => l.outcome === 'odmitnuto').length;
  const nedovolano = logs.filter((l) => l.outcome === 'nedovolano').length;
  const soldIds = new Set(
    kontakty
      .filter(
        (c) =>
          ['zaplaceno', 'domena_pripojena', 'hotovo'].includes(c.status) &&
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
    return { user_id: u.id, username: u.username, display_name: u.display_name, role: u.role };
  },

  async nextContact(token: string): Promise<Kontakt | null> {
    await delay();
    const user = auth(token);
    const cutoff = Date.now() - 2 * 3600 * 1000;
    const candidates = kontakty
      .filter(
        (c) =>
          (c.status === 'nekontaktovano' || c.status === 'nedovolano') &&
          (c.lock_by === null ||
            (c.lock_at !== null && new Date(c.lock_at).getTime() < cutoff) ||
            c.lock_by === user.id)
      )
      .sort((a, b) => {
        const prio = (c: Kontakt) => {
          const calledToday = callLog.some(
            (l) => l.kontakt_id === c.id && new Date(l.created_at).getTime() >= startOfToday()
          );
          if (c.status === 'nedovolano' && !calledToday) return 0;
          if (c.status === 'nekontaktovano') return 1;
          return 2;
        };
        return prio(a) - prio(b) || a.id - b.id;
      });
    const next = candidates[0] ?? null;
    if (!next) return null;
    next.lock_by = user.id;
    next.lock_at = now();
    next.updated_at = now();
    return { ...next };
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
    authAdmin(token);
    return users
      .map((u) => ({
        user_id: u.id,
        username: u.username,
        display_name: u.display_name,
        role: u.role,
        active: u.active,
        ...statsFor(u.id),
      }))
      .sort((a, b) => b.calls - a.calls);
  },

  async listKontakty(token: string, f: ListKontaktyFilters): Promise<ListKontaktyResult> {
    await delay();
    authAdmin(token);
    const search = (f.search ?? '').trim().toLowerCase();
    const matches = (c: Kontakt) =>
      (!f.status || c.status === f.status) &&
      (!f.caller || c.last_caller === f.caller) &&
      (!f.rating || c.rating === f.rating) &&
      (!search ||
        [c.name, c.phone, c.web, c.email, c.note].some(
          (v) => v && v.toLowerCase().includes(search)
        ));
    const filtered = kontakty.filter(matches).sort((a, b) => {
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
      rows: filtered.slice(offset, offset + limit).map((c) => ({ ...c })),
    };
  },

  async updateKontakt(token: string, id: number, patch: Record<string, unknown>): Promise<Kontakt> {
    await delay();
    authAdmin(token);
    const allowed = [
      'phone', 'name', 'ma_web', 'web', 'email', 'note', 'status', 'rating',
      'cena_web', 'cena_hosting', 'last_caller', 'obor',
      'lovable_project_id', 'live_url', 'clear_lock',
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
    return { ...kontakt };
  },

  async createUser(token: string, username: string, password: string, displayName: string, role: Role) {
    await delay();
    authAdmin(token);
    if (!username.trim()) fail('Uživatelské jméno nesmí být prázdné.');
    if (!password || password.length < 6) fail('Heslo musí mít alespoň 6 znaků.');
    if (role !== 'admin' && role !== 'caller') fail(`Neplatná role: ${role}. Povolené: admin, caller.`);
    if (users.some((u) => u.username === username.trim())) {
      fail(`Uživatel "${username.trim()}" už existuje.`);
    }
    const user: MockUser = {
      id: nextUserId++,
      username: username.trim(),
      display_name: displayName.trim() || username.trim(),
      password,
      role,
      active: true,
    };
    users.push(user);
    return { ok: true, user_id: user.id };
  },

  async listAdminMessages(token: string, status?: 'open' | 'resolved' | null) {
    await delay();
    authAdmin(token);
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
    authAdmin(token);
    if (!reply.trim()) fail('Odpověď nesmí být prázdná.');
    const msg = messages.find((m) => m.id === id);
    if (!msg) fail(`Zpráva id=${id} neexistuje.`);
    msg.reply = reply.trim();
    msg.apply_always = applyAlways;
    msg.status = 'resolved';
    msg.resolved_at = now();
    return { ...msg };
  },
};

// interní čítač, ať TypeScript nehlásí nepoužitou proměnnou při budoucích úpravách
void nextKontaktId;
void nextMessageId;
