import { getConfig } from '../config';
import { mockApi } from './mock';
import { supabaseApi } from './supabase';
import type { Api } from './types';

/** Volání, která mění data, na kterých stojí Procopovy milníky. */
const MUTATING = new Set<PropertyKey>(['resolveCall', 'updateKontakt', 'setFlag', 'clearFlag']);

/** Po úspěšném měnícím volání pošli `cmm:data-changed` (vrstva s Procopem si načte my_stats). */
function withChangeEvents(api: Api): Api {
  return new Proxy(api, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver) as unknown;
      if (typeof v !== 'function' || !MUTATING.has(prop)) return v;
      const fn = v as (...a: unknown[]) => Promise<unknown>;
      return async (...args: unknown[]) => {
        const out = await fn.apply(target, args);
        window.dispatchEvent(new CustomEvent('cmm:data-changed', { detail: { fn: String(prop) } }));
        return out;
      };
    },
  });
}

export function getApi(): Api {
  return withChangeEvents(getConfig().demo ? mockApi : supabaseApi);
}

export * from './types';
