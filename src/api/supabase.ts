// Reálný klient: volá Supabase PostgREST RPC funkce z migrací v db/ (db/schema.sql je
// zastaralý, živý kontrakt je v migration_0NN_*.sql).
// POST {url}/rest/v1/rpc/{fn} s hlavičkami apikey + Authorization: Bearer {anon key}.

import { getConfig } from '../config';
import type {
  AdminMessage,
  Api,
  AutomationStatus,
  ChatMessage,
  ChatThread,
  FiltryMlceni,
  FlagKind,
  Kontakt,
  KontaktPrehled,
  ListKontaktyFilters,
  ListKontaktyResult,
  MeInfo,
  MojiFiltry,
  MyStats,
  OznaceneFiltry,
  ResolveCallArgs,
  Role,
  Rozvrh,
  RozvrhDenVstup,
  RozvrhPrehledRadek,
  Segment,
  Session,
  StatistikyVolani,
  ThreadDetail,
  ThreadScope,
  ThreadStatus,
  UpdatedUser,
  UpdateUserArgs,
  UserStats,
  VysledekDovolani,
  ZapisHovoruVysledek,
  ZavolatPolozka,
  ZavolatSeznam,
} from './types';

/**
 * Server bez migrace 056 (Albert 27. 10. 2026) nové parametry nezná a odpoví PGRST202. Appka je posílá jen, když je
 * člověk zapne, takže všechno ostatní jede dál; tady jen řekne, co server ještě neumí (testy appky hlídají znění).
 */
export const BEZ_056_DEN = 'Statistiky za jeden den server ještě neumí (chybí na něm migrace 056). Statistiky celkem fungují dál.';
export const BEZ_056_RAZENI = 'Řazení podle poslední změny server ještě neumí (chybí na něm migrace 056). Vyber výchozí řazení.';
export const BEZ_056_FILTRY = 'Filtry a řazení v Moji klienti server ještě neumí (chybí na něm migrace 056). Zruš filtry a uvidíš všechny klienty.';
/**
 * Migrace 057 (Albert 28. 10. 2026): řazení podle posledního hovoru (hovor_nejnovejsi, hovor_nejstarsi) server bez 057
 * odmítne hláškou „Neplatné řazení: …“ (056 zná jen zmena_*), server bez 056 PGRST202. Appka hodnoty posílá jen, když je
 * člověk zvolí, a řekne, že to server ještě neumí. Řazení podle poslední změny jede proti serveru 056 dál (jen podle
 * updated_at) a sloupec Změněno pak ukáže updated_at (zmenenoKdy v ui.tsx).
 */
export const BEZ_057_HOVOR = 'Řazení podle posledního hovoru server ještě neumí (chybí na něm migrace 057). Vyber jiné řazení.';
/** Server odmítl řazení podle hovoru, protože ho nezná (bez 057 „Neplatné řazení“, bez 056 PGRST202). */
const hovorNezna = (razeni: string | null | undefined, e: unknown): boolean =>
  !!razeni && razeni.startsWith('hovor_') && e instanceof RpcChyba
  && (e.kod === 'PGRST202' || e.message.startsWith(`Neplatné řazení: ${razeni}.`));

/**
 * Migrace 060 (Albert 1. 11. 2026): kombinovatelné filtry seznamů (stav víc najednou, známka, hvězda, označení k zavolání,
 * mlčení v pracovních dnech), řazení mlceni a hvezda, Označené přes list_oznacene, zápis dovolání, hvězda a přehled
 * klienta. Nové parametry jdou jen zapnuté (stará DB bez 060 dál funguje, jako u 056 a 057); na PGRST202 nebo „Neplatné
 * řazení“ appka řekne, co server ještě neumí (testy appky hlídají znění).
 */
export const BEZ_060_FILTRY =
  'Filtry stavů, známek, hvězdy, označení a mlčení server ještě neumí (chybí na něm migrace 060). Zruš je a uvidíš seznam jako dřív.';
export const BEZ_060_RAZENI = 'Řazení podle mlčení a hvězdy server ještě neumí (chybí na něm migrace 060). Vyber jiné řazení.';
export const BEZ_060_OZNACENE =
  'Označení k zavolání server ještě neumí (chybí na něm migrace 060). Níž jsou jen klienti s příznakem jako dřív.';
export const BEZ_060_HOVOR = 'Zápis hovoru s označeným klientem server ještě neumí (chybí na něm migrace 060).';
export const BEZ_060_HVEZDA = 'Hvězdu server ještě neumí (chybí na něm migrace 060).';
export const BEZ_060_PREHLED = 'Přehled klienta server ještě neumí (chybí na něm migrace 060).';
/**
 * Migrace 061 (Albert 2. 11. 2026): pátý výsledek dovolání jine („Nic z toho výše“). Server s 060 bez 061 ho odmítne
 * hláškou „Neplatný výsledek dovolání: jine. Povolené: … mluvili.“; appka řekne, co server ještě neumí (testy appky hlídají
 * znění). Poznámku u ostatních výsledků server bez 061 přijme, ale u nedovolání ji dá jen do historie (výsledek pak nemá
 * klíč poznamka_predana).
 */
export const BEZ_061_JINE =
  'Výsledek „Nic z toho výše“ server ještě neumí (chybí na něm migrace 061). Vyberte nejbližší jiný výsledek a napište poznámku.';
/**
 * Migrace 062 (Albert 2. 11. 2026, A1: „Yes, you can add the sixth option“): šestý výsledek dovolání chce_web („Chce web“).
 * Server bez 062 ho odmítne hláškou „Neplatný výsledek dovolání: chce_web. Povolené: … jine.“; appka řekne, co server ještě
 * neumí (testy appky hlídají znění). Dovolání bez označení server bez 062 odmítne svou starou větou (Volajícímu „… kterého
 * máte v Označených k zavolání …“, super adminovi „nemá otevřené označení“); appka ji ukáže, jak přišla. Pořadí nasazení
 * (větev, migrace, appka) tenhle stav nepřipustí, jen návrat migrace.
 */
export const BEZ_062_CHCE_WEB =
  'Výsledek „Chce web“ server ještě neumí (chybí na něm migrace 062). Vyberte „Mluvili jsme“ a napište, že klient web chce.';
/** Server odmítl řazení mlceni nebo hvezda, protože ho nezná (bez 060 „Neplatné řazení“, bez 056 PGRST202). */
const razeni060Nezna = (razeni: string | null | undefined, e: unknown): boolean =>
  (razeni === 'mlceni' || razeni === 'hvezda') && e instanceof RpcChyba
  && (e.kod === 'PGRST202' || e.message.startsWith(`Neplatné řazení: ${razeni}.`));
/** Funkce s těmi parametry na serveru není (PGRST202): nová funkce nebo nový parametr na serveru bez migrace. */
const neniNaServeru = (e: unknown): boolean => e instanceof RpcChyba && e.kod === 'PGRST202';

/** Filtry z migrace 060 jen zapnuté: prázdné pole, false a null se serveru neposílají (server bez 060 je nezná). */
function filtry060(f: FiltryMlceni | null | undefined): Record<string, unknown> {
  return {
    ...(f?.statusy?.length ? { p_statusy: f.statusy } : {}),
    ...(f?.znamky?.length ? { p_znamky: f.znamky } : {}),
    ...(f?.jen_hvezda ? { p_jen_hvezda: true } : {}),
    ...(f?.kategorie?.length ? { p_kategorie: f.kategorie } : {}),
    ...(typeof f?.mlci_min === 'number' ? { p_mlci_min: f.mlci_min } : {}),
    ...(typeof f?.mlci_max === 'number' ? { p_mlci_max: f.mlci_max } : {}),
  };
}

/** Chyba z PostgREST i s kódem (`PGRST202` = funkce s těmi parametry na serveru není). */
class RpcChyba extends Error {
  constructor(
    message: string,
    readonly kod: string | null
  ) {
    super(message);
  }
}

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
    let kod: string | null = null;
    try {
      const err = (await res.json()) as { message?: string; hint?: string; code?: string };
      if (err && typeof err.message === 'string' && err.message) message = err.message;
      if (err && typeof err.code === 'string') kod = err.code;
    } catch {
      // tělo nebylo JSON — necháme obecnou hlášku
    }
    throw new RpcChyba(message, kod);
  }

  const text = await res.text();
  if (!text || text === 'null') return null as T;
  return JSON.parse(text) as T;
}

export const supabaseApi: Api = {
  async login(username: string, password: string): Promise<Session> {
    // Od 2026-09-09 vrací server neúspěšné přihlášení jako { error: "..." } s HTTP 200,
    // ne jako výjimku. Důvod: neúspěšný pokus se musí ZAPSAT (kvůli limitu pěti pokusů
    // za hodinu), a výjimka v PostgREST vrátí celou transakci zpět i s tím zápisem.
    // Starší server, který ještě vyhazuje výjimku, funguje beze změny — tu zachytí rpc().
    const out = await rpc<Session & { error?: string }>('login', {
      p_username: username,
      p_password: password,
    });
    if (!out || out.error) throw new Error(out?.error || 'Přihlášení se nezdařilo.');
    return out;
  },

  async logout(token: string): Promise<void> {
    await rpc<void>('logout', { p_token: token });
  },

  async me(token: string): Promise<MeInfo> {
    return rpc<MeInfo>('me', { p_token: token });
  },

  async nextContact(token: string, segment: Segment): Promise<Kontakt | null> {
    // Segment se posílá VŽDY (migrace 028). Server bez něj vrací chaty, takže přepínač
    // „Architekti" by jinak tiše volal chaty (kontrola 75).
    try {
      return await rpc<Kontakt | null>('next_contact', { p_token: token, p_segment: segment });
    } catch (e) {
      // Server bez migrace 028 (appka pushnutá dřív, nebo 028 vrácená dřív než appka) zná jen
      // next_contact(p_token) a na p_segment odpoví PGRST202. Ten starý server má jen chaty,
      // takže chaty se zkusí znovu bez segmentu a volání nestojí. Architekty NIKDY: dostali by
      // chatu pod přepínačem „Architekti" (revize 28. 9.).
      if (!(e instanceof RpcChyba) || e.kod !== 'PGRST202') throw e;
      if (segment !== 'chata') {
        throw new Error('Server ještě neumí volat architekty (chybí na něm migrace 028). Chaty volat jde.');
      }
      return rpc<Kontakt | null>('next_contact', { p_token: token });
    }
  },

  async returnContact(token: string, id: number): Promise<{ ok: boolean; kontakt_id: number }> {
    // vratit_do_fronty (migrace 028): vlastní čistá karta zpět do fronty při přepnutí segmentu.
    return rpc<{ ok: boolean; kontakt_id: number }>('vratit_do_fronty', {
      p_token: token,
      p_kontakt_id: id,
    });
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
      // Migrace 050 (Albert 21. 10. 2026): p_kdy jen u přeplánovaného hovoru. Ostatní výsledky ho neposílají, takže
      // nová appka zapisuje hovory i proti serveru bez migrace 050 (ten p_kdy nezná a celé volání by odmítl).
      ...(args.outcome === 'preplanovano' ? { p_kdy: args.kdy ?? null } : {}),
    });
  },

  async myStats(token: string): Promise<MyStats> {
    return rpc<MyStats>('my_stats', { p_token: token });
  },

  async allStats(token: string, den: string | null = null): Promise<UserStats[]> {
    // Migrace 056 (Albert 27. 10. 2026): p_den jen u statistik za jeden den, jinak se neposílá, takže výběr člověka
    // a statistiky celkem fungují i proti serveru bez 056 (ten p_den nezná a celé volání by odmítl).
    try {
      return await rpc<UserStats[]>('all_stats', { p_token: token, ...(den ? { p_den: den } : {}) });
    } catch (e) {
      if (den && e instanceof RpcChyba && e.kod === 'PGRST202') throw new Error(BEZ_056_DEN);
      throw e;
    }
  },

  async topSeller(token: string): Promise<{ je_prvni: boolean }> {
    return rpc<{ je_prvni: boolean }>('top_prodejce', { p_token: token });
  },

  async listKontakty(token: string, f: ListKontaktyFilters): Promise<ListKontaktyResult> {
    // migrace 060: nové filtry jen zapnuté (server bez 060 je nezná)
    const nove = filtry060(f);
    try {
      return await rpc<ListKontaktyResult>('list_kontakty', {
        p_token: token,
        p_status: f.status ?? null,
        p_caller: f.caller ?? null,
        p_rating: f.rating ?? null,
        p_search: f.search ?? null,
        p_cekani: f.cekani ?? null,
        p_kos: f.kos ?? null,
        p_limit: f.limit ?? 200,
        p_offset: f.offset ?? 0,
        // „vše" klíč vynechá (výchozí null na serveru)
        ...(f.segment ? { p_segment: f.segment } : {}),
        // migrace 056: řazení jen když je zvolené (server bez 056 p_razeni nezná)
        ...(f.razeni ? { p_razeni: f.razeni } : {}),
        ...nove,
      });
    } catch (e) {
      // migrace 060: server bez 060 nové filtry nezná (PGRST202) a řazení mlceni a hvezda odmítne
      if (Object.keys(nove).length > 0 && neniNaServeru(e)) throw new Error(BEZ_060_FILTRY);
      if (razeni060Nezna(f.razeni, e)) throw new Error(BEZ_060_RAZENI);
      // migrace 057: řazení podle hovoru na serveru bez 057 (nebo bez 056) srozumitelně, ostatní řazení jako u 056
      if (hovorNezna(f.razeni, e)) throw new Error(BEZ_057_HOVOR);
      if (f.razeni && e instanceof RpcChyba && e.kod === 'PGRST202') throw new Error(BEZ_056_RAZENI);
      throw e;
    }
  },

  async myKontakty(
    token: string,
    limit = 200,
    offset = 0,
    userId: number | null = null,
    segment: Segment | null = null,
    filtry: MojiFiltry | null = null
  ): Promise<ListKontaktyResult> {
    // Migrace 056 (Albert 27. 10. 2026): filtry a řazení Moji klienti jen když jsou zapnuté, jinak volání stejné jako
    // dřív (i proti serveru bez 056). ⚠ Od migrace 060 (Albert 1. 11. 2026) je appka posílá i za Volajícího (filtry nad
    // jeho klienty), NAHRAZUJE „appka je posílá jen za super admina“; nové filtry 060 taky jen zapnuté.
    const nove = filtry060(filtry);
    const navic = {
      ...(filtry?.status ? { p_status: filtry.status } : {}),
      ...(filtry?.rating ? { p_rating: filtry.rating } : {}),
      ...(filtry?.search ? { p_search: filtry.search } : {}),
      ...(filtry?.cekani ? { p_cekani: filtry.cekani } : {}),
      ...(filtry?.kos ? { p_kos: filtry.kos } : {}),
      ...(filtry?.razeni ? { p_razeni: filtry.razeni } : {}),
    };
    try {
      return await rpc<ListKontaktyResult>('my_kontakty', {
        p_token: token,
        p_limit: limit,
        p_offset: offset,
        p_user_id: userId,
        ...(segment ? { p_segment: segment } : {}),
        ...navic,
        ...nove,
      });
    } catch (e) {
      // migrace 060: nové filtry a řazení mlceni a hvezda na serveru bez 060 srozumitelně (jako v Kontaktech)
      if (Object.keys(nove).length > 0 && neniNaServeru(e)) throw new Error(BEZ_060_FILTRY);
      if (razeni060Nezna(filtry?.razeni, e)) throw new Error(BEZ_060_RAZENI);
      // migrace 057: řazení podle hovoru na serveru bez 057 srozumitelně (jako v Kontaktech)
      if (hovorNezna(filtry?.razeni, e)) throw new Error(BEZ_057_HOVOR);
      if (Object.keys(navic).length > 0 && e instanceof RpcChyba && e.kod === 'PGRST202') throw new Error(BEZ_056_FILTRY);
      throw e;
    }
  },

  async updateKontakt(token: string, id: number, patch: Record<string, unknown>): Promise<Kontakt> {
    return rpc<Kontakt>('update_kontakt', { p_token: token, p_id: id, p_patch: patch });
  },

  async claimKontakt(token: string, id: number): Promise<Kontakt> {
    return rpc<Kontakt>('oznacit_za_sveho', { p_token: token, p_kontakt_id: id });
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

  async listFlagged(token: string, kind?: FlagKind | null, userId?: number | null): Promise<Kontakt[]> {
    return (
      (await rpc<Kontakt[]>('list_flagged', {
        p_token: token,
        p_kind: kind ?? null,
        p_user_id: userId ?? null,
      })) ?? []
    );
  },

  /* ---- označení k zavolání, hvězda a přehled (migrace 060, Albert 1. 11. 2026) ---- */

  async listOznacene(token: string, f: OznaceneFiltry): Promise<Kontakt[]> {
    // jen zapnuté filtry (výchozí null na serveru); server bez 060 funkci nezná (PGRST202)
    const hledat = (f.hledat ?? '').trim();
    try {
      return (
        (await rpc<Kontakt[]>('list_oznacene', {
          p_token: token,
          ...(f.druhy?.length ? { p_druhy: f.druhy } : {}),
          ...(f.segment ? { p_segment: f.segment } : {}),
          ...filtry060(f),
          ...(typeof f.user_id === 'number' ? { p_user_id: f.user_id } : {}),
          ...(f.bez_volajiciho ? { p_bez_volajiciho: true } : {}),
          ...(hledat ? { p_hledat: hledat } : {}),
          ...(f.razeni ? { p_razeni: f.razeni } : {}),
        })) ?? []
      );
    } catch (e) {
      if (neniNaServeru(e)) throw new Error(BEZ_060_OZNACENE);
      throw e;
    }
  },

  async zapisHovor(
    token: string,
    kontaktId: number,
    vysledek: VysledekDovolani,
    poznamka: string | null = null,
    hvezda: boolean | null = null
  ): Promise<ZapisHovoruVysledek> {
    try {
      return await rpc<ZapisHovoruVysledek>('zapis_hovor', {
        p_token: token,
        p_kontakt_id: kontaktId,
        p_vysledek: vysledek,
        // migrace 061: poznámka u každého výsledku (i jine a nedovolano), prázdná jako null; server ji zbaví konců řádků
        // (od 062 i chce_web: bez poznámky null, vzkaz „Chce web“ server pošle i tak)
        p_poznamka: poznamka?.trim() ? poznamka : null,
        // hvězda jen když se mění (null = beze změny)
        ...(typeof hvezda === 'boolean' ? { p_hvezda: hvezda } : {}),
      });
    } catch (e) {
      if (neniNaServeru(e)) throw new Error(BEZ_060_HOVOR);
      // migrace 061: server s 060 pátý výsledek nezná
      if (vysledek === 'jine' && e instanceof RpcChyba && e.message.startsWith('Neplatný výsledek dovolání: jine.')) {
        throw new Error(BEZ_061_JINE);
      }
      // migrace 062: server bez 062 šestý výsledek nezná (s 060 i bez 061 stejná hláška)
      if (vysledek === 'chce_web' && e instanceof RpcChyba && e.message.startsWith('Neplatný výsledek dovolání: chce_web.')) {
        throw new Error(BEZ_062_CHCE_WEB);
      }
      throw e;
    }
  },

  async oznaceniZavrit(token: string, kontaktId: number, duvod: string): Promise<{ ok: boolean; kontakt_id: number; oznaceni_id?: number }> {
    // tlačítko je jen u otevřeného označení, které posílá jen server s 060 (bez něj by ho appka neukázala)
    return rpc<{ ok: boolean; kontakt_id: number; oznaceni_id?: number }>('oznaceni_zavrit', {
      p_token: token,
      p_kontakt_id: kontaktId,
      p_duvod: duvod,
    });
  },

  async nastavHvezdu(token: string, kontaktId: number, hvezda: boolean, duvod: string | null = null): Promise<Kontakt> {
    try {
      return await rpc<Kontakt>('nastav_hvezdu', {
        p_token: token,
        p_kontakt_id: kontaktId,
        p_hvezda: hvezda,
        p_duvod: duvod,
      });
    } catch (e) {
      if (neniNaServeru(e)) throw new Error(BEZ_060_HVEZDA);
      throw e;
    }
  },

  async kontaktPrehled(token: string, kontaktId: number): Promise<KontaktPrehled> {
    try {
      return await rpc<KontaktPrehled>('kontakt_prehled', { p_token: token, p_kontakt_id: kontaktId });
    } catch (e) {
      if (neniNaServeru(e)) throw new Error(BEZ_060_PREHLED);
      throw e;
    }
  },

  async createUser(
    token: string,
    username: string,
    password: string,
    displayName: string,
    role: Role,
    managerId?: number | null
  ) {
    return rpc<{ ok: boolean; user_id: number }>('create_user', {
      p_token: token,
      p_username: username,
      p_password: password,
      p_display_name: displayName,
      p_role: role,
      p_manager_id: managerId ?? null,
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
      p_manager_id: args.manager_id ?? null,
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

  async listThreads(
    token: string,
    status?: ThreadStatus | null,
    scope?: ThreadScope | null,
    userId?: number | null
  ): Promise<ChatThread[]> {
    // Filtry se posílají zvlášť a server je kombinuje (migrace 017); userId = jen
    // vlákna jednoho z lidí pod super adminem (migrace 023, server to hlídá).
    const out = await rpc<{ threads: ChatThread[] }>('list_threads', {
      p_token: token,
      p_status: status ?? null,
      p_scope: scope ?? null,
      p_user_id: userId ?? null,
    });
    return out?.threads ?? [];
  },

  async resolveAlert(token: string, key: string) {
    return rpc<{ ok: boolean; resolved: number; key: string }>('resolve_alert', {
      p_token: token,
      p_key: key,
    });
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

  /* ---- rozvrh volání (migrace 042) ---- */

  async rozvrh(token: string, userId: number | null = null): Promise<Rozvrh> {
    return rpc<Rozvrh>('rozvrh_get', { p_token: token, p_user_id: userId });
  },

  async ulozitRozvrh(token: string, userId: number, dny: RozvrhDenVstup[]): Promise<Rozvrh> {
    return rpc<Rozvrh>('rozvrh_ulozit', { p_token: token, p_user_id: userId, p_dny: dny });
  },

  async odemknoutRozvrh(token: string, userId: number): Promise<Rozvrh> {
    return rpc<Rozvrh>('rozvrh_odemknout', { p_token: token, p_user_id: userId });
  },

  async poznamkaRozvrhu(token: string, den: string, text: string): Promise<Rozvrh> {
    return rpc<Rozvrh>('rozvrh_poznamka', { p_token: token, p_den: den, p_text: text });
  },

  async prehledRozvrhu(token: string): Promise<RozvrhPrehledRadek[]> {
    return (await rpc<RozvrhPrehledRadek[]>('rozvrh_prehled', { p_token: token })) ?? [];
  },

  /* ---- kalendář hovorů a výdělek (migrace 050, Albert 21. 10. 2026) ---- */

  async zavolatSeznam(
    token: string,
    userId: number | null = null,
    vsichni = false,
    jenCekajici = false
  ): Promise<ZavolatSeznam> {
    return rpc<ZavolatSeznam>('zavolat_seznam', {
      p_token: token,
      p_user_id: userId,
      p_vsichni: vsichni,
      p_jen_cekajici: jenCekajici,
    });
  },

  async zavolatKontaktu(token: string, kontaktId: number): Promise<ZavolatPolozka | null> {
    return rpc<ZavolatPolozka | null>('zavolat_kontaktu', { p_token: token, p_kontakt_id: kontaktId });
  },

  async zavolatNaplanovat(
    token: string,
    kontaktId: number,
    kdy: string,
    poznamka: string | null,
    userId: number | null = null
  ): Promise<ZavolatPolozka> {
    return rpc<ZavolatPolozka>('zavolat_naplanovat', {
      p_token: token,
      p_kontakt_id: kontaktId,
      p_kdy: kdy,
      p_poznamka: poznamka,
      p_user_id: userId,
    });
  },

  async zavolatPresunout(
    token: string,
    id: number,
    kdy: string,
    poznamka: string | null,
    userId: number | null = null
  ): Promise<ZavolatPolozka> {
    return rpc<ZavolatPolozka>('zavolat_presunout', {
      p_token: token,
      p_id: id,
      p_kdy: kdy,
      p_poznamka: poznamka,
      p_user_id: userId,
    });
  },

  async zavolatZrusit(token: string, id: number): Promise<{ ok: boolean; id: number }> {
    return rpc<{ ok: boolean; id: number }>('zavolat_zrusit', { p_token: token, p_id: id });
  },

  async zavolatHotovo(token: string, id: number, vysledek: string | null = null): Promise<{ ok: boolean; id: number }> {
    return rpc<{ ok: boolean; id: number }>('zavolat_hotovo', { p_token: token, p_id: id, p_vysledek: vysledek });
  },

  async zavolatVzit(token: string, id: number): Promise<Kontakt> {
    return rpc<Kontakt>('zavolat_vzit', { p_token: token, p_id: id });
  },

  async statistikyVolani(token: string, userId: number | null = null): Promise<StatistikyVolani> {
    return rpc<StatistikyVolani>('statistiky_volani', { p_token: token, p_user_id: userId });
  },
};
