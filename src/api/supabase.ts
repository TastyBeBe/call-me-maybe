// Reálný klient: volá Supabase PostgREST RPC funkce definované v db/schema.sql.
// POST {url}/rest/v1/rpc/{fn} s hlavičkami apikey + Authorization: Bearer {anon key}.

import { getConfig } from '../config';
import type {
  AdminMessage,
  Api,
  Kontakt,
  ListKontaktyFilters,
  ListKontaktyResult,
  MeInfo,
  MyStats,
  ResolveCallArgs,
  Role,
  Session,
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

  async updateKontakt(token: string, id: number, patch: Record<string, unknown>): Promise<Kontakt> {
    return rpc<Kontakt>('update_kontakt', { p_token: token, p_id: id, p_patch: patch });
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
};
