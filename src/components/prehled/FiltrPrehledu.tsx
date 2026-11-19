// ŘADA FILTRŮ PŘEHLEDU (Přehled vedení úkol 13, Albert 17. 11. 2026; spec docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md
// §7.2: „one filter bar (Období with presets …, Lidé, Segment, Obor, Kraj, Měna, and ‚Další‘: Základ, Atribuce, K datu),
// active-filter chips with ‚Zrušit vše‘“). Stav filtru je v adrese (src/prehledFiltr.ts): každá změna jde do adresy, takže
// proklik i sdílený odkaz ukážou totéž. Lidé = společný výběr lidí (components/LidePicker.tsx, D7), seznam lidí a týmy
// z prehled_moznosti. Výběry víc hodnot jsou VyberVice jako v seznamech; obor jen když nějaká specializace existuje. „Další“
// je rozbalovací panel (Escape a klik mimo ho zavřou). Na telefonu se řada zalomí (žádný posun do strany).
//
// Psané datum (oprava po recenzi 18. 11. 2026, bod 1): „Vlastní“ od/do a „Stav k datu“ mají koncept v poli. Pole data posílá při
// psaní roku mezihodnoty (0002-…, 0020-…, 0202-…), takže do adresy jde datum až při opuštění pole, Enteru, nebo samo, když je
// celé, platné a od 1. 1. 2020 a 0,8 s se nepíše. Druhý konec období se nikdy potichu nepřepisuje: obrácené, příliš dlouhé
// nebo neúplné období ukáže větu u pole a adresa zůstane. První zápis jedné úpravy přidá záznam historie, další ho nahradí.
// ⚠ NAHRAZUJE zápis každé změny pole rovnou do adresy s dorovnáním druhého konce (úkol 13, 23c94b3).
// Výběr období se řídí adresou (bod 7): „Vlastní“ zvolené bez změny dnů platí jen pro tyhle dny a Zpět/Vpřed ho zruší.
// Úkol 14c (parita s 073, app_prehled_filtr): začátek období v budoucnosti a k datu před začátkem období ukážou u pole větu
// databáze („Neplatný filtr: od je v budoucnosti.“, „Neplatný filtr: k_datu je před začátkem období.“) a do adresy nejdou;
// odkaz se začátkem v budoucnosti dostane výchozí období (ctiFiltr), odkaz s k datu před začátkem období ukáže větu u Období
// (role alert). ⚠ NAHRAZUJE kontrolu k datu jen proti dnešku.

import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import type { DataMoznosti } from '../../api/types';
import { XIcon } from '../../icons';
import { rozbalVyber, shrnutiVyberu, VYBER_VSICHNI, vyberZIds, type Clovek, type Vyber } from '../../lide';
import { prahaDen, prahaNaIso } from '../../praha';
import {
  ATRIBUCE_POPISKY,
  celyDen,
  chybaFiltru,
  chybaKDatu,
  chybaObdobi,
  cipyFiltru,
  MENA_POPISKY,
  OBDOBI,
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

/** Jak zapsat změnu filtru do adresy: nahradit = bez nového záznamu historie (další zápis téže úpravy data). */
export interface VolbyZapisu {
  nahradit?: boolean;
}

/** Celé platné datum se zapíše samo po téhle pauze v psaní (ms); Tab, klik jinam a Enter zapíšou hned. */
export const ZAPIS_DATA_PO_MS = 800;

export default function RadaFiltru({
  filtr,
  onFiltr,
  moznosti,
  ja,
  dnes,
}: {
  filtr: FiltrPrehledu;
  onFiltr: (f: FiltrPrehledu, volby?: VolbyZapisu) => void;
  moznosti: DataMoznosti;
  ja: number;
  /** dnešní den v Praze (předvolby období) */
  dnes: string;
}) {
  const lide = lideZMoznosti(moznosti);
  const vyber = vyberZFiltru(filtr, lide, ja);
  const obdobi = obdobiFiltru(filtr.od, filtr.do, dnes);
  const klicObdobi = `${filtr.od}|${filtr.do}`;
  // „Vlastní“ zvolené nad dny předvolby (nebo zapsané z vlastních polí): platí jen pro tyhle dny v adrese (bod 7)
  const [vlastniPro, setVlastniPro] = useState<string | null>(null);
  // koncepty psaných dat (bod 1): null = pole ukazuje adresu
  const [koncept, setKoncept] = useState<{ od: string; do: string } | null>(null);
  const [chybaObd, setChybaObd] = useState<string | null>(null);
  const [kKoncept, setKKoncept] = useState<string | null>(null);
  const [chybaK, setChybaK] = useState<string | null>(null);
  const [dalsi, setDalsi] = useState(false);
  const dalsiObal = useRef<HTMLDivElement>(null);
  const idDalsi = useId();
  const ukazVlastni = obdobi === 'vlastni' || vlastniPro === klicObdobi;
  // poslední filtr a zápis pro odložený zápis (časovač běží mezi vykresleními)
  const filtrRef = useRef(filtr);
  filtrRef.current = filtr;
  const onFiltrRef = useRef(onFiltr);
  onFiltrRef.current = onFiltr;
  const casovac = useRef<{ obdobi?: number; k?: number }>({});
  // v téhle úpravě pole už jeden záznam historie je: další zápisy ho nahradí (Zpět pak nevrací každou číslici)
  const zapsano = useRef({ obdobi: false, k: false });
  const misto = useLocation();
  const typNavigace = useNavigationType();

  const zrusCasovac = (kde: 'obdobi' | 'k') => {
    const id = casovac.current[kde];
    if (id !== undefined) window.clearTimeout(id);
    casovac.current[kde] = undefined;
  };

  /** Zapíše vlastní období, když je platné; jinak (s ukazChybu) ukáže větu u pole. Druhý konec zůstane, jak ho člověk nechal. */
  const zapisObdobi = (od: string, doDne: string, ukazChybu: boolean): boolean => {
    zrusCasovac('obdobi');
    // úkol 14c: i začátek po dnešku a po zadaném k datu, větou serveru (app_prehled_filtr)
    const chyba = chybaObdobi(od, doDne, dnes, filtrRef.current.k);
    if (chyba) {
      if (ukazChybu) setChybaObd(chyba);
      return false;
    }
    setChybaObd(null);
    setKoncept(null);
    setVlastniPro(`${od}|${doDne}`);
    const f = filtrRef.current;
    if (f.od === od && f.do === doDne) return true;
    onFiltrRef.current({ ...f, od, do: doDne }, { nahradit: zapsano.current.obdobi });
    zapsano.current.obdobi = true;
    return true;
  };
  /** Zapíše „k datu“ (prázdné = teď), když je platné; jinak (s ukazChybu) ukáže větu u pole. */
  const zapisKDatu = (den: string, ukazChybu: boolean): boolean => {
    zrusCasovac('k');
    // úkol 14c: k datu před začátkem období server odmítne; věta serveru u pole
    const chyba = chybaKDatu(den, dnes, filtrRef.current.od);
    if (chyba) {
      if (ukazChybu) setChybaK(chyba);
      return false;
    }
    setChybaK(null);
    setKKoncept(null);
    const f = filtrRef.current;
    if ((f.k ? prahaDen(f.k) : '') === den) return true;
    onFiltrRef.current({ ...f, k: den ? kDatuZeDne(den) : null }, { nahradit: zapsano.current.k });
    zapsano.current.k = true;
    return true;
  };
  /** Zavře „Další“; rozepsané platné k datu se zapíše, neplatné zahodí (pole zmizí). */
  const zavriDalsi = () => {
    if (kKoncept !== null && !zapisKDatu(kKoncept, false)) {
      setKKoncept(null);
      setChybaK(null);
    }
    zrusCasovac('k');
    zapsano.current.k = false;
    setDalsi(false);
  };
  const zavriDalsiRef = useRef(zavriDalsi);
  zavriDalsiRef.current = zavriDalsi;

  // Zpět a Vpřed (bod 7): výběr období a pole se řídí adresou, rozepsané koncepty a „Vlastní“ bez změny dnů se zahodí
  useEffect(() => {
    if (typNavigace !== 'POP') return;
    zrusCasovac('obdobi');
    zrusCasovac('k');
    zapsano.current = { obdobi: false, k: false };
    setVlastniPro(null);
    setKoncept(null);
    setChybaObd(null);
    setKKoncept(null);
    setChybaK(null);
  }, [misto.key, typNavigace]);
  // odchod ze stránky: odložený zápis se už nepustí
  useEffect(
    () => () => {
      const c = casovac.current;
      if (c.obdobi !== undefined) window.clearTimeout(c.obdobi);
      if (c.k !== undefined) window.clearTimeout(c.k);
    },
    []
  );

  useEffect(() => {
    if (!dalsi) return;
    const mimo = (e: MouseEvent | TouchEvent) => {
      if (dalsiObal.current && !dalsiObal.current.contains(e.target as Node)) zavriDalsiRef.current();
    };
    const klavesa = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      zavriDalsiRef.current();
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
    zrusCasovac('obdobi');
    setKoncept(null);
    setChybaObd(null);
    if (klic === 'vlastni') {
      setVlastniPro(klicObdobi);
      return;
    }
    setVlastniPro(null);
    onFiltr({ ...filtr, ...rozsahObdobi(klic, dnes) });
  };
  // psaní do pole od/do: jen koncept; celé platné období se zapíše samo po pauze (mezihodnoty roku se nezapíšou nikdy). Obě
  // data celá, ale období obrácené nebo delší než 730 dní: po téže pauze věta u pole (Tab v poli data chodí po dni, měsíci a
  // roku, takže pole se opouští až po několika Tab)
  const zmenDen = (kde: 'od' | 'do', hodnota: string) => {
    const k = { od: koncept?.od ?? filtr.od, do: koncept?.do ?? filtr.do };
    k[kde] = hodnota;
    setKoncept(k);
    zrusCasovac('obdobi');
    const chyba = chybaObdobi(k.od, k.do, dnes, filtr.k);
    if (chyba === null) {
      setChybaObd(null);
      casovac.current.obdobi = window.setTimeout(() => zapisObdobi(k.od, k.do, false), ZAPIS_DATA_PO_MS);
    } else if (celyDen(k.od) && celyDen(k.do)) {
      casovac.current.obdobi = window.setTimeout(() => setChybaObd(chyba), ZAPIS_DATA_PO_MS);
    }
  };
  /** Neúplné datum v poli (rozepsaný den, měsíc nebo rok): prohlížeč pak hlásí prázdnou hodnotu. */
  const neuplne = (el: HTMLInputElement) => !!el.validity?.badInput;
  const opustilObdobi = (e: FocusEvent<HTMLSpanElement>) => {
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return; // z „od“ do „do“: úprava pokračuje
    if ([...e.currentTarget.querySelectorAll('input')].some(neuplne)) setChybaObd('Zadejte celé datum začátku i konce.');
    else if (koncept) zapisObdobi(koncept.od, koncept.do, true);
    zapsano.current.obdobi = false;
  };
  const enterObdobi = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (neuplne(e.currentTarget)) setChybaObd('Zadejte celé datum začátku i konce.');
    else if (koncept) zapisObdobi(koncept.od, koncept.do, true);
  };
  const zmenKDatu = (hodnota: string) => {
    setKKoncept(hodnota);
    zrusCasovac('k');
    const chyba = hodnota ? chybaKDatu(hodnota, dnes, filtr.od) : 'prázdné';
    if (chyba === null) {
      setChybaK(null);
      casovac.current.k = window.setTimeout(() => zapisKDatu(hodnota, false), ZAPIS_DATA_PO_MS);
    } else if (celyDen(hodnota)) {
      // celé datum od 2020, jen v budoucnosti: věta po pauze
      casovac.current.k = window.setTimeout(() => setChybaK(chyba), ZAPIS_DATA_PO_MS);
    }
  };
  const opustilKDatu = (e: FocusEvent<HTMLInputElement>) => {
    if (neuplne(e.currentTarget)) setChybaK('Zadejte celé datum.');
    else if (kKoncept !== null) zapisKDatu(kKoncept, true);
    zapsano.current.k = false;
  };
  const enterKDatu = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (neuplne(e.currentTarget)) setChybaK('Zadejte celé datum.');
    else if (kKoncept !== null) zapisKDatu(kKoncept, true);
  };
  const idChybyObdobi = `${idDalsi}-chyba-obdobi`;
  const idChybyK = `${idDalsi}-chyba-k`;

  const segmenty = Object.fromEntries(moznosti.segmenty.map((s) => [s.klic, s.nazev]));
  const obory = Object.fromEntries(moznosti.obory.map((o) => [o.klic, `${o.nazev} (${segmenty[o.segment] ?? o.segment})`]));
  const kraje = Object.fromEntries(moznosti.kraje.map((k) => [k.klic, k.nazev]));
  const cipy = cipyFiltru(filtr, { lide: shrnutiVyberu(vyber, lide, ja), segmenty, obory, kraje });
  const dalsiZapnuto = [filtr.zaklad !== 'prirozeny', filtr.atribuce !== 'posledni_zajem', !!filtr.k].filter(Boolean).length;
  const rozsahText = `${denText(filtr.od)} – ${denText(filtr.do)}`;
  // úkol 14c: uložený filtr, který server odmítne (předvolba po zadaném k datu, třeba Dnes a k datu včera): věta serveru u období,
  // vidět i se zavřeným „Další“; čip „K datu …“ nebo „Teď“ ji zruší (nic se potichu nepřepisuje)
  const chybaUlozena = ukazVlastni && chybaObd ? null : chybaFiltru(filtr, dnes);

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
            <span className="prehled-vlastni" onBlur={opustilObdobi}>
              <input
                type="date"
                aria-label="Období od"
                value={koncept?.od ?? filtr.od}
                min={OBDOBI_OD_MIN}
                aria-invalid={chybaObd ? true : undefined}
                aria-describedby={chybaObd ? idChybyObdobi : undefined}
                onChange={(e) => zmenDen('od', e.target.value)}
                onKeyDown={enterObdobi}
              />
              <span aria-hidden="true">–</span>
              <input
                type="date"
                aria-label="Období do"
                value={koncept?.do ?? filtr.do}
                min={OBDOBI_OD_MIN}
                aria-invalid={chybaObd ? true : undefined}
                aria-describedby={chybaObd ? idChybyObdobi : undefined}
                onChange={(e) => zmenDen('do', e.target.value)}
                onKeyDown={enterObdobi}
              />
            </span>
          ) : (
            <span className="prehled-rozsah muted">{rozsahText}</span>
          )}
          {ukazVlastni && chybaObd && (
            <p className="prehled-obdobi-chyba" id={idChybyObdobi} role="alert">
              {chybaObd}
            </p>
          )}
          {chybaUlozena && (
            <p className="prehled-obdobi-chyba prehled-filtr-chyba" role="alert">
              {chybaUlozena}
            </p>
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
            onClick={() => (dalsi ? zavriDalsi() : setDalsi(true))}
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
                    value={kKoncept ?? (filtr.k ? prahaDen(filtr.k) : '')}
                    aria-invalid={chybaK ? true : undefined}
                    aria-describedby={chybaK ? idChybyK : undefined}
                    onChange={(e) => zmenKDatu(e.target.value)}
                    onBlur={opustilKDatu}
                    onKeyDown={enterKDatu}
                  />
                  {filtr.k && (
                    <button
                      type="button"
                      className="pill-btn sm"
                      onClick={() => {
                        zrusCasovac('k');
                        setKKoncept(null);
                        setChybaK(null);
                        onFiltr({ ...filtr, k: null });
                      }}
                    >
                      Teď
                    </button>
                  )}
                </span>
              </label>
              {chybaK && (
                <p className="prehled-k-datu-chyba" id={idChybyK} role="alert">
                  {chybaK}
                </p>
              )}
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
