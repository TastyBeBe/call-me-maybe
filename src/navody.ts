// Návody pro volající na stránce „Jak volat“ (Albert 9. 11. 2026: „instead of the section we had there before, we can include
// these two files … so you can view the dictionary, or view the procedure … kind of like tutorial how to call“). Obsahem jsou
// dva Albertovy dokumenty (skript pro telefonní specialisty a slovníček webových pojmů) převedené do Markdownu a uložené
// v registru nik (obor_niky.jak_volat). Appka je tak dostane jen po přihlášení (app_obor_niky), ne ve veřejném kódu: oba
// dokumenty jsou „Interní materiál“. Každý dokument začíná nadpisem první úrovně („# Jak volat řemeslníkům“) a stránka podle
// těchto nadpisů ukáže přepínač.
import type { OborNika } from './api/types';

export type Navod = { nazev: string; telo: string };

/** Rozdělí Markdown na dokumenty podle řádků „# Nadpis“ (ne „## “). Text před prvním takovým nadpisem je „Jak volat“. */
export function rozdelNavody(text: string | null | undefined): Navod[] {
  const out: Navod[] = [];
  let cur: Navod | null = null;
  for (const radek of String(text ?? '').split('\n')) {
    const m = /^#\s+(\S.*?)\s*$/.exec(radek);
    if (m) {
      cur = { nazev: m[1], telo: '' };
      out.push(cur);
      continue;
    }
    if (!cur) {
      if (!radek.trim()) continue;
      cur = { nazev: 'Jak volat', telo: '' };
      out.push(cur);
    }
    cur.telo += (cur.telo ? '\n' : '') + radek;
  }
  return out.map((d) => ({ nazev: d.nazev, telo: d.telo.trim() }));
}

/** Text návodů z registru: nejdřív u preferované niky, jinak u první niky v seznamu, která nějaký má; null = žádný. */
export function textNavodu(niky: OborNika[], preferovana?: string | null): string | null {
  const s = niky.find((n) => n.klic === preferovana && n.jak_volat?.trim());
  const t = s ?? niky.find((n) => n.jak_volat?.trim());
  return t?.jak_volat ?? null;
}
