/**
 * Web na míru, super klienti (migrace 086, Albert 27. 11. 2026): „anyone for their client, but of course the super admins
 * should also be able to do it for anyone … even when you're in the call feature, you should be able to toggle this“.
 * Čisté pomocníky pro přepínač, odznaky a stránku Ke schválení (tests/superKlient.test.mjs). Co kdo smí, rozhoduje server
 * (super_klient_detail: viditelne, smi_menit; ke_schvaleni_seznam jen super admin).
 */
import type { KeSchvaleni, KeSchvaleniPolozka, SuperKlientDetail, SuperKlientOdznak } from './api/types';

export const WEB_NA_MIRU = 'Web na míru';
export const BEZ_NAHLEDU = 'bez našeho náhledu';
export const CHCE = 'Chce i náš náhled';
export const NECHCE = 'Nechce náš náhled, jen náhled na míru';
export const ZAMCENO = 'Web na míru u tohoto klienta mění jen jeho Volající nebo super admin.';
export const KONTROLA_ZUSTAVA = 'U klienta s označením Web na míru zůstává kontrola zapnutá; nejdřív zruš označení Web na míru.';

/** Přepínač se ukáže, jen když ho server uživateli u kontaktu ukazuje (Volající jen u svého klienta a karty, kterou volá). */
export function prepinacViditelny(d: Pick<SuperKlientDetail, 'viditelne'> | null | undefined): boolean {
  return !!d && d.viditelne === true;
}

/** Texty odznaku: „Web na míru“ a u „nechce“ ještě „bez našeho náhledu“. */
export function odznakText(o: Pick<SuperKlientOdznak, 'chce_nahled'> | null | undefined): string[] {
  if (!o) return [];
  return o.chce_nahled === false ? [WEB_NA_MIRU, BEZ_NAHLEDU] : [WEB_NA_MIRU];
}

/** Pořadí karet na stránce Ke schválení: super klienti napřed, pak čekající, pak nejstarší. */
export function poradiKaret<T extends Pick<KeSchvaleniPolozka, 'navrh' | 'super_klient'>>(p: T[]): T[] {
  return [...p].sort((a, b) =>
    Number(b.super_klient !== null) - Number(a.super_klient !== null)
    || Number(b.navrh.stav === 'ceka') - Number(a.navrh.stav === 'ceka')
    || String(a.navrh.vytvoreno).localeCompare(String(b.navrh.vytvoreno))
    || a.navrh.id - b.navrh.id);
}

/** Počet čekajících návrhů na pilulce „ke schválení“. */
export function pocetCeka(k: Pick<KeSchvaleni, 'pocet_ceka'> | null | undefined): number {
  return k && Number.isFinite(k.pocet_ceka) ? k.pocet_ceka : 0;
}

/* Odznaky do seznamů: načtou se jednou za sezení (jako zobrazeni.ts) a znovu po každé změně přepínače. */
let odznaky = new Map<number, SuperKlientOdznak>();
let verze = 0;
const posluchaci = new Set<() => void>();
export function nastavOdznaky(seznam: SuperKlientOdznak[]): void {
  odznaky = new Map(seznam.map((o) => [o.kontakt_id, o]));
  verze += 1;
  posluchaci.forEach((f) => f());
}
export function odznakPro(kontaktId: number): SuperKlientOdznak | undefined {
  return odznaky.get(kontaktId);
}
export function verzeOdznaku(): number {
  return verze;
}
export function sledujOdznaky(f: () => void): () => void {
  posluchaci.add(f);
  return () => {
    posluchaci.delete(f);
  };
}
