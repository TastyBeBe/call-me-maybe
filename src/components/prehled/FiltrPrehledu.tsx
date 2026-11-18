// ŘADA FILTRŮ PŘEHLEDU (Přehled vedení úkol 13, Albert 17. 11. 2026; spec docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md
// §7.2: „one filter bar (Období with presets …, Lidé, Segment, Obor, Kraj, Měna, and ‚Další‘: Základ, Atribuce, K datu),
// active-filter chips with ‚Zrušit vše‘“). Stav filtru je v adrese (src/prehledFiltr.ts): každá změna jde do adresy, takže
// proklik i sdílený odkaz ukážou totéž. Lidé = společný výběr lidí (components/LidePicker.tsx, D7), seznam lidí a týmy
// z prehled_moznosti. Výběry víc hodnot jsou VyberVice jako v seznamech; obor jen když nějaká specializace existuje. „Další“
// je rozbalovací panel (Escape a klik mimo ho zavřou). Na telefonu se řada zalomí (žádný posun do strany).

import { useEffect, useId, useRef, useState } from 'react';
import type { DataMoznosti } from '../../api/types';
import { XIcon } from '../../icons';
import { rozbalVyber, shrnutiVyberu, VYBER_VSICHNI, vyberZIds, type Clovek, type Vyber } from '../../lide';
import { prahaDen, prahaNaIso, posunDen } from '../../praha';
import {
  ATRIBUCE_POPISKY,
  cipyFiltru,
  MENA_POPISKY,
  OBDOBI,
  OBDOBI_MAX_DNI,
  OBDOBI_OD_MIN,
  obdobiFiltru,
  rozsahObdobi,
  ZAKLAD_POPISKY,
  zrusVseFiltry,
  type FiltrPrehledu,
  type MenaFiltru,
  type ObdobiKlic,
  type ZakladPrehledu,
} from '../../prehledFiltr';
import { denText } from '../../prehled';
import LidePicker from '../LidePicker';
import { VyberVice } from '../SeznamFiltry';
import type { AtribucePrehledu } from '../../api/types';

/** Lidé z prehled_moznosti pro výběr lidí. */
export function lideZMoznosti(m: DataMoznosti): Clovek[] {
  return m.lide.map((l) => ({ id: l.id, display_name: l.display_name, role: l.role, active: l.active, manager_id: l.manager_id }));
}
/** Výběr lidí z filtru: tym = předvolba týmu, lide = zaškrtnutí lidé (Já, tým, vybraní), nic = Všichni. */
export function vyberZFiltru(f: FiltrPrehledu, lide: readonly Clovek[], ja: number): Vyber {
  if (f.tym !== null) return { druh: 'tym', tymId: f.tym, ids: [] };
  if (f.lide && f.lide.length > 0) return vyberZIds(f.lide, lide, ja);
  return VYBER_VSICHNI;
}
/** Filtr z výběru lidí (stejné kódování jako odkaz „Porovnat v Přehledu“ ze Statistik, src/lide.ts). */
export function filtrZVyberu(f: FiltrPrehledu, v: Vyber, lide: readonly Clovek[], ja: number): FiltrPrehledu {
  if (v.druh === 'tym' && !v.jenAktivni) return { ...f, lide: null, tym: v.tymId ?? ja };
  const ids = rozbalVyber(v, lide, ja);
  return { ...f, lide: ids && ids.length > 0 ? ids : null, tym: null };
}

/** Okamžik „k datu“ z dne v Praze: konec toho dne, nejvýš teď (server budoucnost odmítne). */
function kDatuZeDne(den: string): string | null {
  const konec = prahaNaIso(den, '23:59');
  if (!konec) return null;
  return new Date(Math.min(Date.parse(konec) + 59000, Date.now() - 1000)).toISOString();
}

export default function RadaFiltru({
  filtr,
  onFiltr,
  moznosti,
  ja,
  dnes,
}: {
  filtr: FiltrPrehledu;
  onFiltr: (f: FiltrPrehledu) => void;
  moznosti: DataMoznosti;
  ja: number;
  /** dnešní den v Praze (předvolby období) */
  dnes: string;
}) {
  const lide = lideZMoznosti(moznosti);
  const vyber = vyberZFiltru(filtr, lide, ja);
  const obdobi = obdobiFiltru(filtr.od, filtr.do, dnes);
  const [vlastni, setVlastni] = useState(obdobi === 'vlastni');
  const [dalsi, setDalsi] = useState(false);
  const dalsiObal = useRef<HTMLDivElement>(null);
  const idDalsi = useId();
  const ukazVlastni = vlastni || obdobi === 'vlastni';

  useEffect(() => {
    if (!dalsi) return;
    const mimo = (e: MouseEvent | TouchEvent) => {
      if (dalsiObal.current && !dalsiObal.current.contains(e.target as Node)) setDalsi(false);
    };
    const klavesa = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setDalsi(false);
      dalsiObal.current?.querySelector<HTMLButtonElement>('.prehled-dalsi-btn')?.focus();
    };
    document.addEventListener('mousedown', mimo);
    document.addEventListener('touchstart', mimo);
    document.addEventListener('keydown', klavesa);
    return () => {
      document.removeEventListener('mousedown', mimo);
      document.removeEventListener('touchstart', mimo);
      document.removeEventListener('keydown', klavesa);
    };
  }, [dalsi]);

  const zmenObdobi = (klic: ObdobiKlic) => {
    if (klic === 'vlastni') {
      setVlastni(true);
      return;
    }
    setVlastni(false);
    onFiltr({ ...filtr, ...rozsahObdobi(klic, dnes) });
  };
  const zmenDen = (kde: 'od' | 'do', hodnota: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hodnota)) return;
    let od = kde === 'od' ? hodnota : filtr.od;
    let doDne = kde === 'do' ? hodnota : filtr.do;
    if (od < OBDOBI_OD_MIN) od = OBDOBI_OD_MIN;
    if (doDne < od) {
      if (kde === 'od') doDne = od;
      else od = doDne;
    }
    if (posunDen(od, OBDOBI_MAX_DNI) < doDne) {
      if (kde === 'od') doDne = posunDen(od, OBDOBI_MAX_DNI);
      else od = posunDen(doDne, -OBDOBI_MAX_DNI);
    }
    onFiltr({ ...filtr, od, do: doDne });
  };

  const segmenty = Object.fromEntries(moznosti.segmenty.map((s) => [s.klic, s.nazev]));
  const obory = Object.fromEntries(moznosti.obory.map((o) => [o.klic, `${o.nazev} (${segmenty[o.segment] ?? o.segment})`]));
  const kraje = Object.fromEntries(moznosti.kraje.map((k) => [k.klic, k.nazev]));
  const cipy = cipyFiltru(filtr, { lide: shrnutiVyberu(vyber, lide, ja), segmenty, obory, kraje });
  const dalsiZapnuto = [filtr.zaklad !== 'prirozeny', filtr.atribuce !== 'posledni_zajem', !!filtr.k].filter(Boolean).length;
  const rozsahText = `${denText(filtr.od)} – ${denText(filtr.do)}`;

  return (
    <section className="card prehled-filtr" aria-label="Filtr přehledu">
      <div className="prehled-filtr-rada">
        <div className="prehled-pole prehled-obdobi">
          <label className="prehled-pole-popisek" htmlFor={`${idDalsi}-obdobi`}>
            Období
          </label>
          <select id={`${idDalsi}-obdobi`} className="prehled-select" value={ukazVlastni ? 'vlastni' : obdobi} onChange={(e) => zmenObdobi(e.target.value as ObdobiKlic)}>
            {OBDOBI.map((o) => (
              <option key={o.klic} value={o.klic}>
                {o.nazev}
              </option>
            ))}
          </select>
          {ukazVlastni ? (
            <span className="prehled-vlastni">
              <input type="date" aria-label="Období od" value={filtr.od} min={OBDOBI_OD_MIN} max={filtr.do} onChange={(e) => zmenDen('od', e.target.value)} />
              <span aria-hidden="true">–</span>
              <input type="date" aria-label="Období do" value={filtr.do} min={filtr.od} onChange={(e) => zmenDen('do', e.target.value)} />
            </span>
          ) : (
            <span className="prehled-rozsah muted">{rozsahText}</span>
          )}
        </div>
        <div className="prehled-pole prehled-lide">
          <span className="prehled-pole-popisek" aria-hidden="true">
            Lidé
          </span>
          <LidePicker value={vyber} onChange={(v) => onFiltr(filtrZVyberu(filtr, v, lide, ja))} lide={lide} ja={ja} vychozi={VYBER_VSICHNI} />
        </div>
        <VyberVice
          aria="Filtr segmentu"
          nazev="Segment"
          vseText="Segment: vše"
          volby={moznosti.segmenty.map((s) => ({ hodnota: s.klic, text: s.nazev, pocet: s.kontaktu }))}
          vybrane={filtr.segment}
          onChange={(v) => onFiltr({ ...filtr, segment: [...v].sort() })}
          className="prehled-vyber"
        />
        {moznosti.obory.length > 0 && (
          <VyberVice
            aria="Filtr oboru"
            nazev="Obor"
            vseText="Obor: vše"
            volby={moznosti.obory.map((o) => ({ hodnota: o.klic, text: obory[o.klic], pocet: o.kontaktu }))}
            vybrane={filtr.obor}
            onChange={(v) => onFiltr({ ...filtr, obor: [...v].sort() })}
            className="prehled-vyber"
          />
        )}
        <VyberVice
          aria="Filtr kraje"
          nazev="Kraj"
          vseText="Kraj: vše"
          volby={moznosti.kraje.map((k) => ({ hodnota: k.klic, text: k.nazev, pocet: k.kontaktu }))}
          vybrane={filtr.kraj}
          onChange={(v) => onFiltr({ ...filtr, kraj: [...v].sort() })}
          className="prehled-vyber"
        />
        <div className="segmented prehled-mena" role="group" aria-label="Měna">
          {(['CZK', 'EUR', 'obe'] as MenaFiltru[]).map((m) => (
            <button key={m} type="button" className={filtr.mena === m ? 'active' : ''} aria-pressed={filtr.mena === m} onClick={() => onFiltr({ ...filtr, mena: m })}>
              {MENA_POPISKY[m]}
            </button>
          ))}
        </div>
        <div className="prehled-dalsi" ref={dalsiObal}>
          <button
            type="button"
            className={`vyber-vice-btn prehled-dalsi-btn${dalsiZapnuto > 0 ? ' zapnuto' : ''}`}
            aria-expanded={dalsi}
            aria-controls={dalsi ? idDalsi : undefined}
            onClick={() => setDalsi((o) => !o)}
          >
            {dalsiZapnuto > 0 ? `Další (${dalsiZapnuto})` : 'Další'} <span aria-hidden="true">▾</span>
          </button>
          {dalsi && (
            <div className="prehled-dalsi-panel" id={idDalsi} role="group" aria-label="Další volby filtru">
              <label className="prehled-pole-svisle">
                <span className="prehled-pole-popisek">Základ tabulek klientů</span>
                <select className="prehled-select" value={filtr.zaklad} onChange={(e) => onFiltr({ ...filtr, zaklad: e.target.value as ZakladPrehledu })}>
                  {(Object.keys(ZAKLAD_POPISKY) as ZakladPrehledu[]).map((z) => (
                    <option key={z} value={z}>
                      {ZAKLAD_POPISKY[z]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="prehled-pole-svisle">
                <span className="prehled-pole-popisek">Komu se klient počítá</span>
                <select className="prehled-select" value={filtr.atribuce} onChange={(e) => onFiltr({ ...filtr, atribuce: e.target.value as AtribucePrehledu })}>
                  {(Object.keys(ATRIBUCE_POPISKY) as AtribucePrehledu[]).map((a) => (
                    <option key={a} value={a}>
                      {ATRIBUCE_POPISKY[a]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="prehled-pole-svisle">
                <span className="prehled-pole-popisek">Stav k datu (prázdné = teď)</span>
                <span className="prehled-k-datu">
                  <input
                    type="date"
                    aria-label="Stav k datu"
                    max={dnes}
                    min={OBDOBI_OD_MIN}
                    value={filtr.k ? prahaDen(filtr.k) : ''}
                    onChange={(e) => onFiltr({ ...filtr, k: e.target.value ? kDatuZeDne(e.target.value) : null })}
                  />
                  {filtr.k && (
                    <button type="button" className="pill-btn sm" onClick={() => onFiltr({ ...filtr, k: null })}>
                      Teď
                    </button>
                  )}
                </span>
              </label>
              <p className="muted prehled-dalsi-napoveda">Provize se počítá vždy podle posledního, kdo zapsal zájem; karty mají každá svůj přirozený základ.</p>
            </div>
          )}
        </div>
      </div>
      {cipy.length > 0 && (
        <div className="filtr-rada filtr-cipy prehled-cipy" role="group" aria-label="Zapnuté filtry">
          {cipy.map((c) => (
            <button key={c.klic} type="button" className="filtr-cip" aria-label={`Zrušit filtr: ${c.text}`} title="Zrušit tento filtr" onClick={() => onFiltr(c.zrus())}>
              {c.text} <XIcon size={13} />
            </button>
          ))}
          <button type="button" className="pill-btn sm zrusit-filtry" onClick={() => onFiltr(zrusVseFiltry(filtr))}>
            <XIcon size={14} /> Zrušit vše
          </button>
        </div>
      )}
    </section>
  );
}
