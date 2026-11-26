/**
 * Kontrola odpovědí (migrace 083, Albert 26. 11. 2026): „make sure that there is an option on all the clients for super
 * admins, that they can pause replies … It creates the reply, but it doesn't send it, and instead it waits for the super
 * admin to review the email.“ Čisté pomocníky pro přepínač v detailu klienta a karty návrhů ve vláknech (testy
 * tests/kontrola.test.mjs). Co kdo smí, rozhoduje server (kontrola_odpovedi_detail: smi_menit, smi_rozhodnout).
 */
import type { ChatMessage, KontrolaOdpovedi, NavrhKeKontrole, NavrhStav } from './api/types';

/** Třída odznaku stavu návrhu (badge v styles.css). */
export const NAVRH_ODZNAK: Record<NavrhStav, string> = {
  ceka: 'yellow',
  schvaleno: 'navrh-ok',
  odesila: 'navrh-ok',
  odeslano: 'navrh-ok',
  vraceno: 'neutral',
  nahrazeno: 'neutral',
  zruseno: 'neutral',
  neodeslano: 'warn',
  chyba: 'warn',
};

/** Pražský čas „26. 11. 2026 9:41“ (jako zprávy automatizace). */
export function casKontroly(iso: string | null | undefined): string {
  if (!iso) return '?';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('cs-CZ', {
    timeZone: 'Europe/Prague',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Tlačítka Schválit a Vrátit: jen kdo smí rozhodnout, jen návrh, který čeká. Zastaralý jde jen vrátit. */
export function navrhTlacitka(n: NavrhKeKontrole): { schvalit: boolean; vratit: boolean } {
  const ceka = n.smi_rozhodnout && n.stav === 'ceka';
  return { schvalit: ceka && !n.zastaraly, vratit: ceka };
}

/** Věta pod kartou: kdo rozhodl, kdy a co se stalo (prázdná, když se ještě nerozhodlo). */
export function navrhVysledek(n: NavrhKeKontrole): string {
  const kdo = n.rozhodl ? `${n.rozhodl} ${casKontroly(n.rozhodnuto_at)}` : '';
  switch (n.stav) {
    case 'ceka':
      return n.zastaraly
        ? 'Klient mezitím napsal znovu: tenhle návrh už neodpovídá na všechno, agent připraví nový. Schválit ho nejde, jen vrátit s poznámkou.'
        : '';
    case 'schvaleno':
      return n.odeslat_po && new Date(n.odeslat_po).getTime() > Date.now() + 60_000
        ? `Schválil/a ${kdo}. Zatím neodešel: ${n.duvod ?? 'brána tří dnů'}, odejde sám nejdřív ${casKontroly(n.odeslat_po)}.`
        : `Schválil/a ${kdo}. Odejde při nejbližším běhu automatizace (do 15 minut).`;
    case 'odesila':
      return `Schválil/a ${kdo}. Právě se odesílá.`;
    case 'odeslano':
      return `Schválil/a ${kdo}. Odesláno ${casKontroly(n.odeslano_at)}.`;
    case 'vraceno':
      return `Vrátil/a ${kdo} s poznámkou: „${n.poznamka ?? ''}“. Agent připraví nový návrh.`;
    case 'nahrazeno':
      return n.nahrazen_id ? `Nahrazeno novějším návrhem #${n.nahrazen_id}; tenhle se už neodešle.` : 'Nahrazeno novějším návrhem.';
    case 'zruseno':
      return `Zrušeno: ${n.duvod ?? 'kontrola odpovědí vypnuta'}.`;
    case 'neodeslano':
      return `Neodesláno: ${n.duvod ?? '?'}.`;
    case 'chyba':
      return `Chyba při odesílání: ${n.duvod ?? '?'}.`;
  }
}

/** Řádek pod přepínačem v detailu klienta (od migrace 085 i pozastavení z pokynu; nazevStavu převede klíč stavu na název). */
export function kontrolaPopis(k: KontrolaOdpovedi, nazevStavu: (s: string) => string = (s) => s): string {
  if (!k.zapnuto) {
    return 'Když je zapnuto, automatizace tomuhle klientovi nic nepošle sama: každý e-mail připraví a pošle sem ke schválení. Vypne se, jen když ji někdo odškrtne.';
  }
  const ceka = k.cekajici === 0 ? 'nic nečeká' : `čeká na schválení: ${k.cekajici}`;
  const zaklad = `Zapnul/a ${k.zapnul ?? '?'} ${casKontroly(k.zapnuto_at)} · ${ceka}. Klientovi nic neodejde bez schválení; sama se nevypne.`;
  if (!k.pozastaveno) return zaklad;
  const pred = k.stav_pred ? `, předtím ${nazevStavu(k.stav_pred)}` : '';
  return `Pozastaveno podle pokynu ${k.zapnul ?? '?'} (${casKontroly(k.pozastaveno_at)})${pred}. ${zaklad}`;
}

/** Kdo smí kontrolu vypnout a návrhy schvalovat (od migrace 085): ten, kdo ji zapnul, Mikuláš a Albert; zapnout super admin s právem. */
export function kontrolaPravo(k: Pick<KontrolaOdpovedi, 'zapnuto' | 'zapnul'>): string {
  if (!k.zapnuto) return 'Zapnout ji smí super admin, který tohoto klienta smí upravovat.';
  const jmena = [...new Set([k.zapnul ?? 'ten, kdo ji zapnul', 'Mikuláš', 'Albert'])];
  return `Vypnout ji a schvalovat smí jen ${jmena.slice(0, -1).join(', ')} nebo ${jmena[jmena.length - 1]}.`;
}

/** Karta návrhu místo bubliny zprávy „KE SCHVÁLENÍ…“ (jen super admin, který dostal návrhy ze serveru). */
export function navrhProZpravu(navrhy: NavrhKeKontrole[] | null | undefined, m: Pick<ChatMessage, 'id'>): NavrhKeKontrole | undefined {
  return navrhy?.find((n) => n.zadost_zprava_id === m.id);
}
