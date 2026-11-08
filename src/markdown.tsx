// Malý a bezpečný převod Markdownu na React (stránka „Jak volat“, migrace 064, návrh oborů 6.7 a R11).
//
// Text píše živá session do obor_niky.jak_volat; appka z něj nikdy nedělá HTML (žádné innerHTML): umí nadpisy (#, ##,
// ###), odrážky (- nebo *), číslované řádky (1.), odstavce a **tučně**. Cokoli jiného se ukáže jako obyčejný text.

import type { ReactNode } from 'react';

export type MdBlok =
  | { druh: 'nadpis'; uroven: 2 | 3; text: string }
  | { druh: 'odrazky'; cislovane: boolean; polozky: string[] }
  | { druh: 'odstavec'; text: string };

/** Rozloží Markdown na bloky (testovatelné bez Reactu). */
export function mdBloky(md: string | null | undefined): MdBlok[] {
  const bloky: MdBlok[] = [];
  let odstavec: string[] = [];
  let seznam: { cislovane: boolean; polozky: string[] } | null = null;
  const zavri = () => {
    if (odstavec.length) bloky.push({ druh: 'odstavec', text: odstavec.join(' ') });
    odstavec = [];
    if (seznam) bloky.push({ druh: 'odrazky', ...seznam });
    seznam = null;
  };
  for (const syrovy of String(md ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const r = syrovy.trim();
    if (!r) {
      zavri();
      continue;
    }
    const nadpis = /^(#{1,3})\s+(.*)$/.exec(r);
    if (nadpis) {
      zavri();
      bloky.push({ druh: 'nadpis', uroven: nadpis[1].length >= 3 ? 3 : 2, text: nadpis[2].trim() });
      continue;
    }
    const odrazka = /^[-*]\s+(.*)$/.exec(r);
    const cislo = /^\d{1,2}[.)]\s+(.*)$/.exec(r);
    if (odrazka || cislo) {
      if (odstavec.length) {
        bloky.push({ druh: 'odstavec', text: odstavec.join(' ') });
        odstavec = [];
      }
      const cislovane = !odrazka;
      if (!seznam || seznam.cislovane !== cislovane) {
        if (seznam) bloky.push({ druh: 'odrazky', ...seznam });
        seznam = { cislovane, polozky: [] };
      }
      seznam.polozky.push(((odrazka ?? cislo) as RegExpExecArray)[1].trim());
      continue;
    }
    if (seznam) {
      bloky.push({ druh: 'odrazky', ...seznam });
      seznam = null;
    }
    odstavec.push(r);
  }
  zavri();
  return bloky;
}

/** **tučně** jako <strong>, zbytek obyčejný text. */
function radek(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((cast, i) =>
    /^\*\*[^*]+\*\*$/.test(cast) ? <strong key={i}>{cast.slice(2, -2)}</strong> : cast
  );
}

export function Markdown({ text }: { text: string | null | undefined }) {
  return (
    <>
      {mdBloky(text).map((b, i) => {
        if (b.druh === 'nadpis') return b.uroven === 2 ? <h2 key={i}>{radek(b.text)}</h2> : <h3 key={i}>{radek(b.text)}</h3>;
        if (b.druh === 'odrazky') {
          const polozky = b.polozky.map((p, j) => <li key={j}>{radek(p)}</li>);
          return b.cislovane ? <ol key={i}>{polozky}</ol> : <ul key={i}>{polozky}</ul>;
        }
        return <p key={i}>{radek(b.text)}</p>;
      })}
    </>
  );
}
