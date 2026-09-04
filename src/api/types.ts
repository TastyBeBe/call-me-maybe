export type Role = 'admin' | 'caller';

export interface Session {
  token: string;
  user_id: number;
  display_name: string;
  role: Role;
}

export type KontaktStatus =
  | 'nekontaktovano'
  | 'nedovolano'
  | 'odmitnuto'
  | 'zajem'
  | 'web_ve_vyrobe'
  | 'navrh_odeslan'
  | 'ceka_na_klienta'
  | 'upravy_ve_vyrobe'
  | 'schvaleno'
  | 'faktura_odeslana'
  | 'zaplaceno'
  | 'domena_pripojena'
  | 'hotovo'
  | 'pozastaveno'
  | 'eskalace';

export type Rating = 'A' | 'B' | 'C';

/**
 * Červený příznak (migrace 005) — klient, který není 100 % vyřešený.
 * chybi_info     = nevíme vůbec, o jaký objekt jde
 * chybi_email    = nemáme e-mail, není kam poslat návrh
 * email_neoveren = e-mail jsme dohledali, ale není potvrzený od klienta
 * info_neoverene = informace/fotky pocházejí z internetu, klient je nepotvrdil
 * jine           = cokoli dalšího, popsané v poznámce
 */
export type FlagKind =
  | 'chybi_info'
  | 'chybi_email'
  | 'email_neoveren'
  | 'info_neoverene'
  | 'jine';

export interface Kontakt {
  id: number;
  phone: string | null;
  name: string | null;
  ma_web: string | null;
  web: string | null;
  email: string | null;
  note: string | null;
  status: KontaktStatus;
  rating: Rating | null;
  cena_web: string | null;
  cena_hosting: string | null;
  last_caller: string | null;
  lock_by: number | null;
  lock_at: string | null;
  obor: string;
  lovable_project_id: string | null;
  live_url: string | null;
  flag_kind: FlagKind | null;
  flag_note: string | null;
  flagged_at: string | null;
  flagged_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MyStats {
  calls: number;
  reached: number;
  zajem: number;
  odmitnuto: number;
  nedovolano: number;
  conversion: number;
  sold: number;
}

export interface UserStats extends MyStats {
  user_id: number;
  username: string;
  display_name: string;
  role: Role;
  active: boolean;
}

export interface AdminMessage {
  id: number;
  kontakt_id: number | null;
  from_agent: string | null;
  subject: string | null;
  body: string | null;
  status: 'open' | 'resolved';
  reply: string | null;
  apply_always: boolean;
  created_at: string;
  resolved_at: string | null;
  kontakt_name: string | null;
  kontakt_phone: string | null;
}

export type ChatSender = 'agent' | 'admin';
export type ThreadStatus = 'open' | 'resolved';

/** Vlákno tak, jak ho vrací get_thread (bez preview polí). */
export interface ChatThreadInfo {
  id: number;
  kontakt_id: number | null;
  kontakt_name: string | null;
  subject: string;
  status: ThreadStatus;
  created_by: string;
  last_message_at: string;
  created_at: string;
}

/** Řádek seznamu vláken z list_threads (s preview poslední zprávy). */
export interface ChatThread extends ChatThreadInfo {
  last_message_preview: string | null;
  last_sender_type: ChatSender | null;
  message_count: number;
}

export interface ChatMessage {
  id: number;
  thread_id?: number;
  sender_type: ChatSender;
  sender_name: string;
  body: string;
  apply_always: boolean;
  created_at: string;
}

export interface ThreadDetail {
  thread: ChatThreadInfo;
  messages: ChatMessage[];
}

export interface ListKontaktyResult {
  total: number;
  rows: Kontakt[];
}

export interface ResolveCallArgs {
  kontakt_id: number;
  outcome: 'nedovolano' | 'odmitnuto' | 'zajem';
  cena_web?: string | null;
  cena_hosting?: string | null;
  note?: string | null;
  rating?: string | null;
  email?: string | null;
}

export interface ListKontaktyFilters {
  status?: string | null;
  caller?: string | null;
  rating?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}

/** Argumenty update_user (migrace 004) — aplikují se jen ne-null/ne-undefined pole. */
export interface UpdateUserArgs {
  display_name?: string | null;
  password?: string | null;
  role?: Role | null;
  active?: boolean | null;
}

/** Řádek uživatele, jak ho vrací update_user. */
export interface UpdatedUser {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  active: boolean;
}

/* ---- přepínání účtů Claude (migrace 011) ---- */
export type AutomationPhase = 'running' | 'draining';

/** Účet Claude, který umí vézt automatizaci (token má orchestrátor v config.env). */
export interface AutomationAccount {
  slug: string;
  label: string;
  email: string | null;
  token_present: boolean;
  updated_at: string;
}

/** Jediný řádek automation_control: kdo veze automatizaci a jestli probíhá přepnutí. */
export interface AutomationControl {
  id: number;
  active_account: string;
  requested_account: string;
  phase: AutomationPhase;
  requested_by: string | null;
  requested_at: string | null;
  drain_started_at: string | null;
  switched_at: string | null;
  notified_at: string | null;
  updated_at: string;
}

export interface AutomationRunningJob {
  id: number;
  type: string;
  kontakt_id: number | null;
  kontakt_name: string | null;
  account: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationStatus {
  control: AutomationControl;
  accounts: AutomationAccount[];
  running: AutomationRunningJob[];
  queued: number;
}

export interface MeInfo {
  user_id: number;
  username: string;
  display_name: string;
  role: Role;
}

/** Jednotné API rozhraní — implementuje ho reálný Supabase klient i demo mock. */
export interface Api {
  login(username: string, password: string): Promise<Session>;
  logout(token: string): Promise<void>;
  me(token: string): Promise<MeInfo>;
  nextContact(token: string): Promise<Kontakt | null>;
  resolveCall(
    token: string,
    args: ResolveCallArgs
  ): Promise<{ ok: boolean; kontakt_id: number; status: string }>;
  myStats(token: string): Promise<MyStats>;
  allStats(token: string): Promise<UserStats[]>;
  listKontakty(token: string, filters: ListKontaktyFilters): Promise<ListKontaktyResult>;
  /** Kontakty přihlášeného uživatele (obě role) — migrace 003. */
  myKontakty(token: string, limit?: number, offset?: number): Promise<ListKontaktyResult>;
  updateKontakt(token: string, id: number, patch: Record<string, unknown>): Promise<Kontakt>;
  /* ---- příznaky (migrace 005) ---- */
  /** Nasadí červený příznak s poznámkou, co je u klienta špatně. */
  setFlag(token: string, id: number, kind: FlagKind, note: string): Promise<Kontakt>;
  /** Zruší příznak — klient je vyřešený. */
  clearFlag(token: string, id: number): Promise<Kontakt>;
  /** Přehled všech označených klientů (nevyřešených). */
  listFlagged(token: string, kind?: FlagKind | null): Promise<Kontakt[]>;
  createUser(
    token: string,
    username: string,
    password: string,
    displayName: string,
    role: Role
  ): Promise<{ ok: boolean; user_id: number }>;
  /** Úprava uživatele (admin) — migrace 004; aplikují se jen zadaná pole. */
  updateUser(token: string, userId: number, args: UpdateUserArgs): Promise<UpdatedUser>;
  listAdminMessages(token: string, status?: 'open' | 'resolved' | null): Promise<AdminMessage[]>;
  replyAdminMessage(
    token: string,
    id: number,
    reply: string,
    applyAlways: boolean
  ): Promise<AdminMessage>;
  /* ---- chat (migrace 002) ---- */
  listThreads(token: string, status?: ThreadStatus | null): Promise<ChatThread[]>;
  getThread(token: string, threadId: number): Promise<ThreadDetail>;
  postThreadMessage(
    token: string,
    threadId: number,
    body: string,
    applyAlways: boolean
  ): Promise<ChatMessage>;
  createThread(
    token: string,
    subject: string,
    body: string,
    kontaktId?: number | null
  ): Promise<{ thread_id: number }>;
  resolveThread(
    token: string,
    threadId: number
  ): Promise<{ ok: boolean; thread_id: number; status: string }>;
  /* ---- přepínání účtů Claude (migrace 011) ---- */
  /** Stav přepínače: kdo veze automatizaci, běžící joby, fronta (admin). */
  getAutomationStatus(token: string): Promise<AutomationStatus>;
  /** Požadavek na přepnutí (jen users.id = 1). Cíl = aktivní účet ⇒ zrušení. */
  requestAccountSwitch(token: string, slug: string): Promise<AutomationStatus>;
}
