// Konfigurace Supabase backendu.
// Čte se z localStorage (nastavitelné přes #/setup); fallback jsou konstanty níže.
// Když není nastaveno nic, aplikace běží v DEMO režimu s falešnými daty v paměti.

const FALLBACK_SUPABASE_URL = 'https://bawdicmrvcntakvzbdrt.supabase.co';
const FALLBACK_ANON_KEY = 'sb_publishable_8Qr7cKB8bltjEpvBkmtWKA_OB9tmSkz';

export const LS_URL_KEY = 'volacka_supabase_url';
export const LS_ANON_KEY = 'volacka_anon_key';

export interface AppConfig {
  supabaseUrl: string;
  anonKey: string;
  demo: boolean;
}

function safeGet(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

export function getConfig(): AppConfig {
  const url = (safeGet(LS_URL_KEY) || FALLBACK_SUPABASE_URL).trim().replace(/\/+$/, '');
  const key = (safeGet(LS_ANON_KEY) || FALLBACK_ANON_KEY).trim();
  return {
    supabaseUrl: url,
    anonKey: key,
    demo: !url || !key,
  };
}

export function saveConfig(url: string, key: string): void {
  try {
    if (url.trim()) localStorage.setItem(LS_URL_KEY, url.trim());
    else localStorage.removeItem(LS_URL_KEY);
    if (key.trim()) localStorage.setItem(LS_ANON_KEY, key.trim());
    else localStorage.removeItem(LS_ANON_KEY);
  } catch {
    // localStorage nedostupné — ignoruj
  }
}

export function clearConfig(): void {
  try {
    localStorage.removeItem(LS_URL_KEY);
    localStorage.removeItem(LS_ANON_KEY);
  } catch {
    // ignoruj
  }
}
