// SDÍLENÝ ŘÁDEK FILTRŮ SEZNAMŮ (migrace 060, Albert 1. 11. 2026: „the same combinable filters in Kontakty, Moji klienti
// and Označené“): segment, stav (víc najednou), známka (A, B, C, bez známky), jen s hvězdou, skupina označení (na návrh, na
// změny), kolik pracovních dní klient mlčí (od a do, předvolby 5+, 10+, 20+, 30+), řazení a hledání. Stejný v Kontaktech
// (AdminPage), Moji klienti (MojiPage) i Označených (OznacenePage); stránka přidá, co má navíc (volající, čekání), a pošle
// řazení vlastním RazeniSelect. Volající má všechno taky (jen nad svými klienty, hlídá server). Stav filtrů je
// src/filtry.ts (StavFiltru), převod na parametry serveru tamtéž.

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { KontaktStatus, OznaceniKategorie, ZnamkaFiltr } from '../api';
import { MLCI_PREDVOLBY, filtrZapnuty, mlciZPole, type StavFiltru, PRAZDNE_FILTRY } from '../filtry';
import { HvezdaIcon, XIcon } from '../icons';
import {
  ALL_OZNACENI,
  ALL_STATUSES,
  ALL_ZNAMKY_FILTR,
  OZNACENI_LABELS,
  STATUS_LABELS,
  SegmentFilter,
  ZNAMKA_FILTR_LABELS,
} from '../ui';

export interface Volba<T extends string> {
  hodnota: T;
  text: string;
  /** počet do závorky (jen super admin, součty celé databáze) */
  pocet?: number;
}

/**
 * Výběr víc hodnot najednou: tlačítko s popiskem (aria-label = `aria`, jako dřív u rozbalovacího seznamu) a pod ním
 * zaškrtávací políčka. Zavře se klikem mimo, Escapem nebo tlačítkem znovu. Nic nevybrané = filtr vypnutý.
 */
export function VyberVice<T extends string>({
  aria,
  nazev,
  vseText,
  volby,
  vybrane,
  onChange,
  className = '',
}: {
  aria: string;
  /** „Stav“, „Známka“ … do textu tlačítka */
  nazev: string;
  /** text tlačítka bez výběru („Stav: vše“, u super admina i s počtem) */
  vseText: string;
  volby: Volba<T>[];
  vybrane: T[];
  onChange: (v: T[]) => void;
  className?: string;
}) {
  const [otevreno, setOtevreno] = useState(false);
  const obal = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!otevreno) return;
    const mimo = (e: MouseEvent | TouchEvent) => {
      if (obal.current && !obal.current.contains(e.target as Node)) setOtevreno(false);
    };
    const klavesa = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOtevreno(false);
        obal.current?.querySelector<HTMLButtonElement>('button.vyber-vice-btn')?.focus();
      }
    };
    document.addEventListener('mousedown', mimo);
    document.addEventListener('touchstart', mimo);
    document.addEventListener('keydown', klavesa);
    return () => {
      document.removeEventListener('mousedown', mimo);
      document.removeEventListener('touchstart', mimo);
      document.removeEventListener('keydown', klavesa);
    };
  }, [otevreno]);
  const text =
    vybrane.length === 0
      ? vseText
      : vybrane.length === 1
        ? `${nazev}: ${volby.find((v) => v.hodnota === vybrane[0])?.text ?? vybrane[0]}`
        : `${nazev}: ${vybrane.length} ${vybrane.length <= 4 ? 'vybrané' : 'vybraných'}`;
  const prepni = (h: T) => onChange(vybrane.includes(h) ? vybrane.filter((x) => x !== h) : [...vybrane, h]);
  return (
    <div className={`vyber-vice ${className}`.trim()} ref={obal}>
      <button
        type="button"
        className={`vyber-vice-btn${vybrane.length > 0 ? ' zapnuto' : ''}`}
        aria-label={aria}
        aria-expanded={otevreno}
        aria-controls={id}
        title={vybrane.length > 1 ? vybrane.map((h) => volby.find((v) => v.hodnota === h)?.text ?? h).join(', ') : undefined}
        onClick={() => setOtevreno((o) => !o)}
      >
        {text} <span aria-hidden="true">▾</span>
      </button>
      {otevreno && (
        <div className="vyber-vice-panel" id={id} role="group" aria-label={aria}>
          <label className="vyber-vice-volba vse">
            <input type="checkbox" checked={vybrane.length === 0} onChange={() => onChange([])} /> vše
          </label>
          {volby.map((v) => (
            <label key={v.hodnota} className="vyber-vice-volba">
              <input type="checkbox" value={v.hodnota} checked={vybrane.includes(v.hodnota)} onChange={() => prepni(v.hodnota)} />{' '}
              {v.text}
              {v.pocet !== undefined ? ` (${v.pocet})` : ''}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Sdílený řádek filtrů. `statusPocty` jen super admin (045); ⚠ od 13. 11. 2026 jsou to počty se všemi zapnutými filtry
 * seznamu kromě stavu (filtryBezStavu), NAHRAZUJE „součty celé databáze“. `kategorie` false = bez výběru skupiny
 * označení (Označené mají vlastní pilulky druhů i s příznaky). `razeni` = RazeniSelect stránky, `children` = filtry navíc
 * (volající, čekání), `hledat*` = popisek a nápověda pole hledání.
 */
export default function SeznamFiltry({
  filtry,
  onChange,
  statusPocty,
  statusSoucet,
  kategorie = true,
  razeni,
  hledatAria,
  hledatPlaceholder,
  className = '',
  children,
}: {
  filtry: StavFiltru;
  onChange: (f: StavFiltru) => void;
  statusPocty?: Record<string, number>;
  statusSoucet?: number;
  kategorie?: boolean;
  razeni: ReactNode;
  hledatAria: string;
  hledatPlaceholder: string;
  className?: string;
  children?: ReactNode;
}) {
  const zmen = (patch: Partial<StavFiltru>) => onChange({ ...filtry, ...patch });
  const [od, setOd] = useState(filtry.mlciMin === null ? '' : String(filtry.mlciMin));
  const [doPole, setDoPole] = useState(filtry.mlciMax === null ? '' : String(filtry.mlciMax));
  // předvolba nebo zrušení filtrů zvenku přepíše pole
  useEffect(() => setOd(filtry.mlciMin === null ? '' : String(filtry.mlciMin)), [filtry.mlciMin]);
  useEffect(() => setDoPole(filtry.mlciMax === null ? '' : String(filtry.mlciMax)), [filtry.mlciMax]);
  const statusVolby: Volba<KontaktStatus>[] = ALL_STATUSES.map((s) => ({
    hodnota: s,
    text: STATUS_LABELS[s],
    ...(statusPocty && statusPocty[s] !== undefined ? { pocet: statusPocty[s] } : {}),
  }));
  const znamkaVolby: Volba<ZnamkaFiltr>[] = ALL_ZNAMKY_FILTR.map((z) => ({ hodnota: z, text: ZNAMKA_FILTR_LABELS[z] }));
  const oznaceniVolby: Volba<OznaceniKategorie>[] = ALL_OZNACENI.map((k) => ({ hodnota: k, text: OZNACENI_LABELS[k] }));
  const nejakyFiltr = filtrZapnuty(filtry) || filtry.razeni !== '';
  return (
    <>
      <SegmentFilter value={filtry.segment} onChange={(s) => zmen({ segment: s })} />
      <div className={`filter-bar seznam-filtry ${className}`.trim()}>
        <VyberVice
          aria="Filtr statusu"
          nazev="Stav"
          vseText={statusPocty ? `Všechny statusy${statusSoucet ? ` (${statusSoucet})` : ''}` : 'Stav: vše'}
          volby={statusVolby}
          vybrane={filtry.statusy}
          onChange={(v) => zmen({ statusy: v })}
        />
        <VyberVice
          aria="Filtr známky"
          nazev="Známka"
          vseText="Známka: vše"
          volby={znamkaVolby}
          vybrane={filtry.znamky}
          onChange={(v) => zmen({ znamky: v })}
        />
        <button
          type="button"
          className={`pill-btn sm hvezda-filtr${filtry.jenHvezda ? ' go' : ''}`}
          aria-pressed={filtry.jenHvezda}
          aria-label="Jen s hvězdou"
          title="Jen klienti s hvězdou (velký zájem)"
          onClick={() => zmen({ jenHvezda: !filtry.jenHvezda })}
        >
          <HvezdaIcon size={15} plna={filtry.jenHvezda} /> jen s hvězdou
        </button>
        {kategorie && (
          <VyberVice
            aria="Filtr označení"
            nazev="Neodpověděl"
            vseText="Neodpověděl: vše"
            volby={oznaceniVolby}
            vybrane={filtry.kategorie}
            onChange={(v) => zmen({ kategorie: v })}
          />
        )}
        <div className="mlci-filtr" role="group" aria-label="Mlčí (pracovní dny)">
          <span className="mlci-filtr-popisek">Mlčí</span>
          <input
            className="mlci-pole"
            inputMode="numeric"
            aria-label="Mlčí aspoň (pracovních dní)"
            placeholder="od"
            value={od}
            onChange={(e) => {
              setOd(e.target.value);
              zmen({ mlciMin: mlciZPole(e.target.value) });
            }}
          />
          <span aria-hidden="true">–</span>
          <input
            className="mlci-pole"
            inputMode="numeric"
            aria-label="Mlčí nejvýš (pracovních dní)"
            placeholder="do"
            value={doPole}
            onChange={(e) => {
              setDoPole(e.target.value);
              zmen({ mlciMax: mlciZPole(e.target.value) });
            }}
          />
          <span className="muted mlci-filtr-jednotka">prac. dní</span>
          {MLCI_PREDVOLBY.map((n) => {
            const ano = filtry.mlciMin === n && filtry.mlciMax === null;
            return (
              <button
                key={n}
                type="button"
                className={`pill-btn sm mlci-predvolba${ano ? ' go' : ''}`}
                aria-pressed={ano}
                title={`Mlčí aspoň ${n} pracovních dní`}
                onClick={() => zmen(ano ? { mlciMin: null, mlciMax: null } : { mlciMin: n, mlciMax: null })}
              >
                {n}+
              </button>
            );
          })}
        </div>
        {children}
        {razeni}
        <div className="search-wrap search-wide">
          <input
            className="search-input"
            aria-label={hledatAria}
            placeholder={hledatPlaceholder}
            value={filtry.hledat}
            onChange={(e) => zmen({ hledat: e.target.value })}
          />
        </div>
        {nejakyFiltr && (
          <button
            type="button"
            className="pill-btn sm zrusit-filtry"
            onClick={() => onChange({ ...PRAZDNE_FILTRY, segment: filtry.segment })}
            title="Zrušit všechny filtry kromě segmentu"
          >
            <XIcon size={14} /> Zrušit filtry
          </button>
        )}
      </div>
    </>
  );
}
