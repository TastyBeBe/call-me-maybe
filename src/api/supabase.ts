// Reálný klient: volá Supabase PostgREST RPC funkce definované v db/schema.sql.
// POST {url}/rest/v1/rpc/{fn} s hlavičkami apikey + Authorization: Bearer {anon key}.

import { getConfig } from '../config';
import type {
  AdminMessage,
  Api,
  AutomationStatus,
  ChatMessage,
  ChatThread,
  FlagKind,
  Kontakt,
  ListKontaktyFilters,
  ListKontaktyResult,
  MeInfo,
  MyStats,
  ResolveCallArgs,
  Role,
  Session,
  ThreadDetail,
  ThreadStatus,
  UpdatedUser,
  UpdateUserArgs,
  UserStats,
} from './types';

async function rpc<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { supabaseUrl, anonKey } = getConfig();
  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Server neodpovídá. Zkontrolujte připojení k internetu.');
  }

  if (!res.ok) {
    let message = `Chyba serveru (${res.status}).`;
    try {
      const err = (await res.json()) as { message?: string; hint?: string };
      if (err && typeof err.message === 'string' && err.message) message = err.message;
    } catch {
      // tělo nebylo JSON — necháme obecnou hlášku
    }
    throw new Error(message);
  }

  const text = await res.text();
  if (!text || text === 'null') return null as T;
  return JSON.parse(text) as T;
}

export const supabaseApi: Api = {
  async login(username: string, password: string): Promise<Session> {
    return rpc<Session>('login', { p_username: username, p_password: password });
  },

  async logout(token: string): Promise<void> {
    await rpc<void>('logout', { p_token: token });
  },

  async me(token: string): Promise<MeInfo> {
    return rpc<MeInfo>('me', { p_token: token });
  },

  async nextContact(token: string): Promise<Kontakt | null> {
    return rpc<Kontakt | null>('next_contact', { p_token: token });
  },

  async resolveCall(token: string, args: ResolveCallArgs) {
    return rpc<{ ok: boolean; kontakt_id: number; status: string }>('resolve_call', {
      p_token: token,
      p_kontakt_id: args.kontakt_id,
      p_outcome: args.outcome,
      p_cena_web: args.cena_web ?? null,
      p_cena_hosting: args.cena_hosting ?? null,
      p_note: args.note ?? null,
      p_rating: args.rating ?? null,
      p_email: args.email ?? null,
    });
  },

  async myStats(token: string): Promise<MyStats> {
    return rpc<MyStats>('my_stats', { p_token: token });
  },

  async allStats(token: string): Promise<UserStats[]> {
    return rpc<UserStats[]>('all_stats', { p_token: token });
  },

  async listKontakty(token: string, f: ListKontaktyFilters): Promise<ListKontaktyResult> {
    return rpc<ListKontaktyResult>('list_kontakty', {
      p_token: token,
      p_status: f.status ?? null,
      p_caller: f.caller ?? null,
      p_rating: f.rating ?? null,
      p_search: f.search ?? null,
      p_limit: f.limit ?? 200,
      p_offset: f.offset ?? 0,
    });
  },

  async myKontakty(token: string, limit = 200, offset = 0): Promise<ListKontaktyResult> {
    return rpc<ListKontaktyResult>('my_kontakty', {
      p_token: token,
      p_limit: limit,
      p_offset: offset,
    });
  },

  async updateKontakt(token: string, id: number, patch: Record<string, unknown>): Promise<Kontakt> {
    return rpc<Kontakt>('update_kontakt', { p_token: token, p_id: id, p_patch: patch });
  },

  /* ---- příznaky (migrace 005) ---- */

  async setFlag(token: string, id: number, kind: FlagKind, note: string): Promise<Kontakt> {
    return rpc<Kontakt>('set_flag', {
      p_token: token,
      p_id: id,
      p_kind: kind,
      p_note: note,
    });
  },

  async clearFlag(token: string, id: number): Promise<Kontakt> {
    return rpc<Kontakt>('clear_flag', { p_token: token, p_id: id });
  },

  async listFlagged(token: string, kind?: FlagKind | null): Promise<Kontakt[]> {
    return (await rpc<Kontakt[]>('list_flagged', { p_token: token, p_kind: kind ?? null })) ?? [];
  },

  async createUser(
    token: string,
    username: string,
    password: string,
    displayName: string,
    role: Role
  ) {
    return rpc<{ ok: boolean; user_id: number }>('create_user', {
      p_token: token,
      p_username: username,
      p_password: password,
      p_display_name: displayName,
      p_role: role,
    });
  },

  async updateUser(token: string, userId: number, args: UpdateUserArgs): Promise<UpdatedUser> {
    return rpc<UpdatedUser>('update_user', {
      p_token: token,
      p_user_id: userId,
      p_display_name: args.display_name ?? null,
      p_password: args.password ?? null,
      p_role: args.role ?? null,
      p_active: args.active ?? null,
    });
  },

  async listAdminMessages(token: string, status?: 'open' | 'resolved' | null) {
    return rpc<AdminMessage[]>('list_admin_messages', {
      p_token: token,
      p_status: status ?? null,
    });
  },

  async replyAdminMessage(token: string, id: number, reply: string, applyAlways: boolean) {
    return rpc<AdminMessage>('reply_admin_message', {
      p_token: token,
      p_id: id,
      p_reply: reply,
      p_apply_always: applyAlways,
    });
  },

  /* ---- chat (migrace 002) ---- */

  async listThreads(token: string, status?: ThreadStatus | null): Promise<ChatThread[]> {
    const out = await rpc<{ threads: ChatThread[] }>('list_threads', {
      p_token: token,
      p_status: status ?? null,
    });
    return out?.threads ?? [];
  },

  async getThread(token: string, threadId: number): Promise<ThreadDetail> {
    return rpc<ThreadDetail>('get_thread', { p_token: token, p_thread_id: threadId });
  },

  async postThreadMessage(token: string, threadId: number, body: string, applyAlways: boolean) {
    return rpc<ChatMessage>('post_thread_message', {
      p_token: token,
      p_thread_id: threadId,
      p_body: body,
      p_apply_always: applyAlways,
    });
  },

  async createThread(token: string, subject: string, body: string, kontaktId?: number | null) {
    return rpc<{ thread_id: number }>('create_thread', {
      p_token: token,
      p_subject: subject,
      p_body: body,
      p_kontakt_id: kontaktId ?? null,
    });
  },

  async resolveThread(token: string, threadId: number) {
    return rpc<{ ok: boolean; thread_id: number; status: string }>('resolve_thread', {
      p_token: token,
      p_thread_id: threadId,
    });
  },

  /* ---- přepínání účtů Claude (migrace 011) ---- */

  async getAutomationStatus(token: string): Promise<AutomationStatus> {
    return rpc<AutomationStatus>('get_automation_status', { p_token: token });
  },

  async requestAccountSwitch(token: string, slug: string): Promise<AutomationStatus> {
    return rpc<AutomationStatus>('request_account_switch', { p_token: token, p_slug: slug });
  },

  /* ---- vypínač automatizace (migrace 012) ---- */

  async requestAutomationStop(token: string): Promise<AutomationStatus> {
    return rpc<AutomationStatus>('request_automation_stop', { p_token: token });
  },

  async cancelAutomationStop(token: string): Promise<AutomationStatus> {
    return rpc<AutomationStatus>('cancel_automation_stop', { p_token: token });
  },

  async requestAutomationStart(token: string): Promise<AutomationStatus> {
    return rpc<AutomationStatus>('request_automation_start', { p_token: token });
  },
};
