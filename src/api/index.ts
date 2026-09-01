import { getConfig } from '../config';
import { mockApi } from './mock';
import { supabaseApi } from './supabase';
import type { Api } from './types';

export function getApi(): Api {
  return getConfig().demo ? mockApi : supabaseApi;
}

export * from './types';
