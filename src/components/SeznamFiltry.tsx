// ŘADA FILTRŮ SEZNAMŮ (migrace 060, Albert 1. 11. 2026: „the same combinable filters in Kontakty, Moji klienti
// and Označené“): stav (víc najednou), známka (A, B, C, bez známky), skupina označení (Neodpověděl na návrh, na změny), kolik
// pracovních dní klient mlčí (od a do, předvolby 5+, 10+, 20+, 30+), čekání na odpověď (Kontakty, Moji klienti), jen
// s hvězdou, odpověděl a zatím nepotvrdil (068) a vpravo řazení. Volající má všechno taky (jen nad svými klienty, hlídá
// server). Stav filtrů je src/filtry.ts (StavFiltru), převod na parametry serveru tamtéž.
//
// ⚠ Přehled vedení úkol 11 (Albert 17. 11. 2026: filtry jsou „super messy and clunky … not in terms of the content, but how
// they are positioned and structured“) NAHRAZUJE jeden zalamovaný řádek se segmentem nad ním a hledáním a „Zrušit filtry“
// v něm: tohle je řada 2 panelu filtrů (components/FiltrPanel.tsx) v pevném pořadí stav · známka · neodpověděl · mlčí ·
// čekání · hvězda · odpověděl a řazení vpravo. Segment, osoba a hledání jsou v řadě 1 panelu, koše čekání, pilulky stránky,
// čipy a „Zrušit vše“ pod touto řadou, na telefonu všechno v okně „Filtry (n)“. Mlčí je rozbalovací výběr jako stav
// a známka (předvolby a od–do v něm), ⚠ NAHRAZUJE pole a předvolby přímo v řádku. Popisky „Stav: vše“ i s počtem
// (⚠ NAHRAZUJE „Všechny statusy (n)“ super admina).

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { CekaniKind, KontaktStatus, OznaceniKategorie, ZnamkaFiltr } from '../api';
import { MLCI_PREDVOLBY, mlciRozsah, mlciZPole, sCekanim, type StavFiltru } from '../filtry';
import { HvezdaIcon } from '../icons';
import {
  ALL_CEKANI,
  ALL_OZNACENI,
  ALL_STATUSES,
  ALL_ZNAMKY_FILTR,
  CEKANI_HINTS,
  CEKANI_LABELS,
  OZNACENI_LABELS,
  STATUS_LABELS,
  ZNAMKA_FILTR_LABELS,
} from '../ui';

export interface Volba<T extends string> {
  hodnota: T;
  text: string;
  /** počet do závorky (jen super admin) */
  pocet?: number;
}

/**
 * Rozbalovací výběr řady filtrů: tlačítko s popiskem (aria-label = `aria`) a pod ním panel. Zavře se klikem mimo, Escapem
 * nebo tlačítkem znovu. Na počítači panel visí pod tlačítkem, v okně filtrů na telefonu se rozbalí přímo v okně (CSS).
 */
function Rozbalovac({
  aria,
  text,
  zapnuto,
  title,
  panelAria,
  className = '',
  children,
}: {
  aria: string;
  text: string;
  zapnuto: boolean;
  title?: string;
  /** popisek skupiny v panelu (výchozí `aria`) */
  panelAria?: string;
  className?: string;
  children: ReactNode;
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
  return (
    <div className={`vyber-vice ${className}`.trim()} ref={obal}>
      <button
        type="button"
        className={`vyber-vice-btn${zapnuto ? ' zapnuto' : ''}`}
        aria-label={aria}
        aria-expanded={otevreno}
        aria-controls={id}
        title={title}
        onClick={() => setOtevreno((o) => !o)}
      >
        {text} <span aria-hidden="true">▾</span>
      </button>
      {otevreno && (
        <div className="vyber-vice-panel" id={id} role="group" aria-label={panelAria ?? aria}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Výběr víc hodnot najednou: tlačítko s popiskem (aria-label = `aria`, jako dřív u rozbalovacího seznamu) a pod ním
 * zaškrtávací políčka. Nic nevybrané = filtr vypnutý.
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
  const text =
    vybrane.length === 0
      ? vseText
      : vybrane.length === 1
        ? `${nazev}: ${volby.find((v) => v.hodnota === vybrane[0])?.text ?? vybrane[0]}`
        : `${nazev}: ${vybrane.length} ${vybrane.length <= 4 ? 'vybrané' : 'vybraných'}`;
  const prepni = (h: T) => onChange(vybrane.includes(h) ? vybrane.filter((x) => x !== h) : [...vybrane, h]);
  return (
    <Rozbalovac
      aria={aria}
      text={text}
      zapnuto={vybrane.length > 0}
      className={className}
      title={vybrane.length > 1 ? vybrane.map((h) => volby.find((v) => v.hodnota === h)?.text ?? h).join(', ') : undefined}
    >
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
    </Rozbalovac>
  );
}

/**
 * Mlčí (pracovní dny): rozbalovací výběr jako stav a známka. V panelu předvolby 5+, 10+, 20+, 30+ (5+ je hranice označení
 * k zavolání; klik na zapnutou ji vypne) a pole od–do. Tlačítko říká, co je zapnuté („Mlčí: 10+ prac. dní“).
 */
function MlciFiltr({ filtry, zmen }: { filtry: StavFiltru; zmen: (patch: Partial<StavFiltru>) => void }) {
  const [od, setOd] = useState(filtry.mlciMin === null ? '' : String(filtry.mlciMin));
  const [doPole, setDoPole] = useState(filtry.mlciMax === null ? '' : String(filtry.mlciMax));
  // předvolba, čip nebo „Zrušit vše“ zvenku přepíše pole
  useEffect(() => setOd(filtry.mlciMin === null ? '' : String(filtry.mlciMin)), [filtry.mlciMin]);
  useEffect(() => setDoPole(filtry.mlciMax === null ? '' : String(filtry.mlciMax)), [filtry.mlciMax]);
  const rozsah = mlciRozsah(filtry.mlciMin, filtry.mlciMax);
  return (
    <Rozbalovac
      aria="Filtr mlčení"
      text={`Mlčí: ${rozsah ?? 'vše'}`}
      zapnuto={rozsah !== null}
      panelAria="Mlčí (pracovní dny)"
      title="Kolik pracovních dní klient mlčí od naší poslední zprávy"
      className="mlci-vyber"
    >
      <div className="mlci-filtr">
        <div className="mlci-predvolby">
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
        <div className="mlci-rozsah">
          <span className="mlci-filtr-popisek">od</span>
          <input
            className="mlci-pole"
            inputMode="numeric"
            aria-label="Mlčí aspoň (pracovních dní)"
            value={od}
            onChange={(e) => {
              setOd(e.target.value);
              zmen({ mlciMin: mlciZPole(e.target.value) });
            }}
          />
          <span className="mlci-filtr-popisek">do</span>
          <input
            className="mlci-pole"
            inputMode="numeric"
            aria-label="Mlčí nejvýš (pracovních dní)"
            value={doPole}
            onChange={(e) => {
              setDoPole(e.target.value);
              zmen({ mlciMax: mlciZPole(e.target.value) });
            }}
          />
          <span className="muted mlci-filtr-jednotka">prac. dní</span>
        </div>
      </div>
    </Rozbalovac>
  );
}

/**
 * Řada 2 panelu filtrů. `statusPocty` jen super admin (045); od 13. 11. 2026 počty se všemi zapnutými filtry seznamu kromě
 * stavu (filtryBezStavu). `kategorie` false = bez Neodpověděl (Označené mají vlastní pilulky „Co je potřeba“), `cekani` =
 * výběr čekání na odpověď (Kontakty, Moji klienti), `kose` = koše čekání hned za ním (jen okno filtrů na telefonu; na
 * počítači je panel dá pod řadu), `razeni` = RazeniSelect stránky vpravo (v okně na telefonu ho panel dá až na konec).
 */
export default function SeznamFiltry({
  filtry,
  onChange,
  statusPocty,
  statusSoucet,
  kategorie = true,
  cekani = false,
  kose,
  razeni,
  className = '',
}: {
  filtry: StavFiltru;
  onChange: (f: StavFiltru) => void;
  statusPocty?: Record<string, number>;
  statusSoucet?: number;
  kategorie?: boolean;
  cekani?: boolean;
  kose?: ReactNode;
  razeni?: ReactNode;
  className?: string;
}) {
  const zmen = (patch: Partial<StavFiltru>) => onChange({ ...filtry, ...patch });
  const statusVolby: Volba<KontaktStatus>[] = ALL_STATUSES.map((s) => ({
    hodnota: s,
    text: STATUS_LABELS[s],
    ...(statusPocty && statusPocty[s] !== undefined ? { pocet: statusPocty[s] } : {}),
  }));
  const znamkaVolby: Volba<ZnamkaFiltr>[] = ALL_ZNAMKY_FILTR.map((z) => ({ hodnota: z, text: ZNAMKA_FILTR_LABELS[z] }));
  const oznaceniVolby: Volba<OznaceniKategorie>[] = ALL_OZNACENI.map((k) => ({ hodnota: k, text: OZNACENI_LABELS[k] }));
  return (
    <div className={`filter-bar seznam-filtry filtr-rada-2 ${className}`.trim()}>
      <div className="filtr-volby">
        <VyberVice
          aria="Filtr statusu"
          nazev="Stav"
          vseText={`Stav: vše${statusPocty && statusSoucet ? ` (${statusSoucet})` : ''}`}
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
        <MlciFiltr filtry={filtry} zmen={zmen} />
        {cekani && (
          <select
            className={`cekani-select${filtry.cekani ? ' zapnuto' : ''}`}
            value={filtry.cekani}
            onChange={(e) => onChange(sCekanim(filtry, e.target.value as CekaniKind | ''))}
            aria-label="Filtr čekání na odpověď"
            title={filtry.cekani ? CEKANI_HINTS[filtry.cekani] : 'Klienti, kteří nám neodpověděli'}
          >
            <option value="">Čekání: vše</option>
            {ALL_CEKANI.map((c) => (
              <option key={c} value={c}>
                {CEKANI_LABELS[c]}
              </option>
            ))}
          </select>
        )}
        {cekani && kose}
        <div className="filtr-prepinace">
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
          {/* migrace 068 (Albert 13. 11. 2026: „a filter for all the clients who responded and the response wasn't that they
              refused us“): klient nám napsal, neodmítl a web ještě nepotvrdil (Schváleno a dál mají své stavy) */}
          <button
            type="button"
            className={`pill-btn sm odpovedel-filtr${filtry.jenOdpovedel ? ' go' : ''}`}
            aria-pressed={filtry.jenOdpovedel}
            aria-label="Odpověděl, zatím nepotvrdil"
            title="Klient nám napsal, neodmítl a web ještě nepotvrdil (bez Odmítnuto, Nekontaktovat, Nerelevantní, Nabídnuta sleva, Archiv a bez Schváleno, Faktura odeslána, Zaplaceno, Doména připojena, Hotovo)"
            onClick={() => zmen({ jenOdpovedel: !filtry.jenOdpovedel })}
          >
            odpověděl, zatím nepotvrdil
          </button>
        </div>
      </div>
      {razeni && <div className="filtr-razeni">{razeni}</div>}
    </div>
  );
}
