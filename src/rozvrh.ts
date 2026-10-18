// ROZVRH VOLÁNÍ (migrace 042, Albert 18. 10. 2026): věty pro záložku Rozvrh a připomínku na Domů.
// Čísla (cíl, hovory, kolik chybí, hovorů za hodinu) počítá server v rozvrh_get; tady jsou jen slova.
import type { Rozvrh, RozvrhDen } from './api';

export const DNY = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];

/** „1 hovor“, „3 hovory“, „5 hovorů“. */
export function hovoru(n: number): string {
  const a = Math.abs(n);
  if (a === 1) return `${n} hovor`;
  if (a >= 2 && a <= 4) return `${n} hovory`;
  return `${n} hovorů`;
}

/** „2 h“, „2,5 h“. */
export function hodin(h: number): string {
  return `${h.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} h`;
}

/** YYYY-MM-DD -> „19. 10.“ */
export function datumKratce(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}. ${m}.`;
}

export type RozvrhTon = 'zle' | 'dobre' | 'info';

/**
 * Hlavní hláška nahoře: pozadu, v plánu, napřed, bez rozvrhu. `ja` = přihlášený se dívá na svůj,
 * `jaSuper` = přihlášený je super admin (svůj rozvrh smí měnit kdykoli).
 */
export function stavHlaska(r: Rozvrh, ja: boolean, jaSuper = false): { ton: RozvrhTon; titulek: string; text: string } {
  const s = r.souhrn;
  const kdo = r.display_name;
  switch (s.stav) {
    case 'pozadu':
      return {
        ton: 'zle',
        titulek: ja ? `Jsi pozadu o ${hovoru(s.rozdil)}` : `${kdo} je pozadu o ${hovoru(s.rozdil)}`,
        text: `To je asi ${hodin(s.rozdil_hodiny)} volání. Tento týden zatím ${hovoru(s.hovory_tyden)}, do včerejška jich mělo být ${s.cil_do_vcera}.`,
      };
    case 'napred':
      return {
        ton: 'dobre',
        titulek: ja ? `Jsi napřed o ${hovoru(s.rozdil)}` : `${kdo} je napřed o ${hovoru(s.rozdil)}`,
        text: `To je asi ${hodin(s.rozdil_hodiny)} volání navíc. Tento týden zatím ${hovoru(s.hovory_tyden)}, plán na celý týden je ${s.cil_tyden}.`,
      };
    case 'v_planu':
      return {
        ton: 'dobre',
        titulek: ja ? 'Jsi v plánu' : `${kdo} je v plánu`,
        text:
          s.dnes_zbyva > 0
            ? 'Všechno z minulých dnů je hotové, zbývá dnešek.'
            : 'Všechno, co mělo být hotové do dneška, je hotové.',
      };
    default:
      return {
        ton: 'info',
        titulek: ja ? 'Ještě nemáš rozvrh' : `${kdo} ještě nemá rozvrh`,
        text: !ja
          ? 'Nastavit ho můžeš ty. Volající ho pak už nezmění, jen super admin.'
          : jaSuper
            ? 'Nastav si, kolik hodin budeš který den volat. Jako super admin ho můžeš kdykoli změnit.'
            : 'Nastav si, kolik hodin budeš který den volat. Nastavit si ho můžeš jen jednou, potom ho mění jen super admin.',
      };
  }
}

/** Připomínka na dnešek: kdy a jak dlouho volat a kolik ještě chybí. Bez rozvrhu null. */
export function dnesHlaska(r: Rozvrh, ja: boolean): string | null {
  const s = r.souhrn;
  if (!r.nastaveny) return null;
  if (s.dnes_cil > 0) {
    const kdy = s.dnes_od ? ` od ${s.dnes_od}` : '';
    let t = `${ja ? 'Dnes máš volat' : 'Dnes má volat'} ${hodin(s.dnes_hodiny)}${kdy}, to je ${hovoru(s.dnes_cil)}. Zatím ${hovoru(s.dnes_hovory)}.`;
    if (s.dnes_hovory >= s.dnes_cil) t += ' Dnešek je splněný.';
    else if (s.dnes_zbyva > 0) t += ` Do splnění plánu chybí ještě ${hovoru(s.dnes_zbyva)} (asi ${hodin(s.dnes_zbyva_hodiny)}).`;
    else {
      // napřed z minulých dnů: týden v plánu je, dnešní cíl ale ještě ne
      t += ` Na dnešek zbývá ${hovoru(s.dnes_cil - s.dnes_hovory)}, díky náskoku z minulých dnů ${ja ? 'jsi' : 'je'} ale v plánu.`;
    }
    return t;
  }
  let t = ja ? 'Dnes podle rozvrhu nevoláš.' : 'Dnes podle rozvrhu nevolá.';
  if (s.dnes_zbyva > 0) t += ` Na dohnání skluzu chybí ${hovoru(s.dnes_zbyva)} (asi ${hodin(s.dnes_zbyva_hodiny)}).`;
  return t;
}

/** Stav jednoho dne: splněno, chybí, zatím, plán, volno. */
export function denStav(d: RozvrhDen): { ton: RozvrhTon | 'nic'; text: string } {
  if (d.pred_rozvrhem) return { ton: 'nic', text: 'před rozvrhem' };
  if (!d.minuly && !d.dnes) return d.cil > 0 ? { ton: 'nic', text: `plán ${hovoru(d.cil)}` } : { ton: 'nic', text: 'volno' };
  if (d.cil === 0) return d.hovory > 0 ? { ton: 'dobre', text: `${hovoru(d.hovory)} navíc` } : { ton: 'nic', text: 'volno' };
  if (d.dnes && d.hovory < d.cil) return { ton: 'info', text: `zatím ${d.hovory} z ${d.cil}` };
  if (d.hovory >= d.cil) {
    return { ton: 'dobre', text: d.hovory > d.cil ? `splněno, ${d.hovory - d.cil} navíc` : 'splněno' };
  }
  return { ton: 'zle', text: `chybí ${hovoru(d.cil - d.hovory)} (${d.hovory} z ${d.cil})` };
}
