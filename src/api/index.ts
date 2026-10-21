import { getConfig } from '../config';
import { mockApi } from './mock';
import { supabaseApi } from './supabase';
import type { Api } from './types';

/** Volání, která mění data, na kterých stojí Prokchopovy milníky. */
const MUTATING = new Set<PropertyKey>(['resolveCall', 'updateKontakt', 'setFlag', 'clearFlag']);

/**
 * Volání, která mění kalendář hovorů (migrace 050, Albert 21. 10. 2026): výsledek hovoru uzavře nebo přeplánuje čekající
 * hovor, ostatní ho plánují, přesouvají a ruší. Po nich `cmm:zavolat-changed`: připomínky (src/zavolat.tsx) a kalendář
 * se hned obnoví, ať odznak a lišta na Domů nečekají na minutový interval.
 */
const ZAVOLAT_ZMENY = new Set<PropertyKey>(['resolveCall', 'zavolatNaplanovat', 'zavolatPresunout', 'zavolatZrusit', 'zavolatHotovo']);

/** Po úspěšném měnícím volání pošli `cmm:data-changed` (vrstva s Prokchopem si načte my_stats). */
function withChangeEvents(api: Api): Api {
  return new Proxy(api, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver) as unknown;
      if (typeof v !== 'function' || (!MUTATING.has(prop) && !ZAVOLAT_ZMENY.has(prop))) return v;
      const fn = v as (...a: unknown[]) => Promise<unknown>;
      return async (...args: unknown[]) => {
        const out = await fn.apply(target, args);
        if (MUTATING.has(prop)) window.dispatchEvent(new CustomEvent('cmm:data-changed', { detail: { fn: String(prop) } }));
        if (ZAVOLAT_ZMENY.has(prop)) window.dispatchEvent(new CustomEvent('cmm:zavolat-changed', { detail: { fn: String(prop) } }));
        return out;
      };
    },
  });
}

export function getApi(): Api {
  return withChangeEvents(getConfig().demo ? mockApi : supabaseApi);
}

export * from './types';
