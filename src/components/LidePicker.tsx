// VÝBĚR LIDÍ pro super admina (Přehled vedení úkol 10, Albert 17. 11. 2026, rozhodnutí D7: „all the super admins can view
// everyone, but they can also filter out only their team … compare or combine any two callers … easy to select how many
// people they want to see“; spec docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md §7.3). Jeden výběr na všech
// stránkách s osobou: Kontakty, Moji klienti, Označené, Statistiky, Kalendář, Zprávy, Rozvrh (a Přehled, úkol 13).
// ⚠ NAHRAZUJE components/PersonPicker.tsx (rozbalovací seznam jednoho člověka, id person-picker) a vlastní výběry stránek
// (#user-select ve Statistikách, #kalendar-kdo, #rozvrh-kdo, select „Filtr volajícího“ super admina v Kontaktech).
//
// Tlačítko ukazuje výběr („Všichni (14)“, „Můj tým (3)“, „VeraP + VeraB“, „Já“); panel má předvolby Já / Můj tým / Všichni /
// Tým <každý další super admin> (v Označených i „Bez volajícího“), hledání, lidi po týmech se zaškrtnutím, u týmu „vše“
// a „nic“, u člověka „jen“ (vybere jen jeho) a dole „jen aktivní“. Změna platí hned (jako výběr stavu a známky); prázdný výběr
// nejde (poslední zaškrtnutý člověk se odškrtnout nedá). Klávesnice: šipky nahoru a dolů mezi lidmi (a hledáním), Home a End,
// mezerník zaškrtne, Enter taky, Escape panel zavře a vrátí fokus na tlačítko. Na počítači panel visí pod tlačítkem (zavře ho
// klik nebo fokus mimo), na telefonu (do 640 px) je to okno odspodu přes celou šířku (role dialog), v okně „Filtry“ panelu
// filtrů se rozbalí přímo v něm. Volající výběr nikdy nevidí: seznam lidí (all_stats) dostane jen super admin a stránky ho
// kreslí jen pod isSuper; bez lidí se nevykreslí vůbec.

import { useEffect, useId, useMemo, useRef, useState, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type Ref } from 'react';
import { getApi, type UserStats } from '../api';
import { useAuth, useSession } from '../auth';
import { SearchIcon, UsersIcon, XIcon } from '../icons';
import {
  VYBER_BEZ_VOLAJICIHO,
  VYBER_JA,
  VYBER_VSICHNI,
  clenoveTymu,
  hledaniSedi,
  rozbalVyber,
  sJenAktivnimi,
  shrnutiVyberu,
  skupinyLidi,
  stejnyVyber,
  vyberZIds,
  type Clovek,
  type Vyber,
} from '../lide';
import { isSuperAdmin } from '../roles';
import { useTelefon } from './FiltrPanel';

/**
 * Lidé, které přihlášený smí vidět (jen super admin; ostatní dostanou prázdný seznam). Seznam jde z all_stats, který server
 * dává JEN super adminovi (migrace 023 a 027, Albert 2026-09-24 a 25). Přesunuto beze změny z PersonPicker.tsx.
 */
export function usePeople(): UserStats[] {
  const session = useSession();
  const [people, setPeople] = useState<UserStats[]>([]);
  const superAdmin = isSuperAdmin(session.role);

  useEffect(() => {
    if (!superAdmin) {
      setPeople([]);
      return;
    }
    let alive = true;
    getApi()
      .allStats(session.token)
      .then((rows) => {
        if (alive) setPeople(rows);
      })
      .catch(() => {
        if (alive) setPeople([]);
      });
    return () => {
      alive = false;
    };
  }, [session.token, superAdmin]);

  return people;
}

/** Zaškrtnutí lidé výběru v pořadí, v jakém je člověk vybíral (Všichni = všichni ze seznamu). */
function zaskrtnuti(v: Vyber, lide: readonly Clovek[], ja: number): number[] {
  if (v.bezVolajiciho) return [];
  if (v.druh === 'vybrani') return [...new Set(v.ids)];
  return rozbalVyber(v, lide, ja) ?? lide.map((c) => c.id);
}

/**
 * Obsah panelu (předvolby, hledání, lidé po týmech, „jen aktivní“). Samostatně kvůli vykreslení v testu (tests/lide.test.mjs);
 * stránky berou celý LidePicker.
 */
export function LidePanel({
  value,
  onChange,
  lide,
  ja,
  allowBezVolajiciho = false,
  hledat,
  onHledat,
  hledatRef,
}: {
  value: Vyber;
  onChange: (v: Vyber) => void;
  lide: Clovek[];
  ja: number;
  allowBezVolajiciho?: boolean;
  hledat: string;
  onHledat: (text: string) => void;
  hledatRef?: Ref<HTMLInputElement>;
}) {
  const idPanelu = useId();
  const jenAktivni = value.jenAktivni === true;
  const viditelni = useMemo(() => lide.filter((c) => !jenAktivni || c.active), [lide, jenAktivni]);
  const skupiny = useMemo(() => skupinyLidi(viditelni, ja), [viditelni, ja]);
  const vybrane = zaskrtnuti(value, lide, ja);
  const mnozina = new Set(vybrane);
  const s = jenAktivni ? { jenAktivni: true } : {};
  const zmen = (ids: number[]) => {
    if (ids.length > 0) onChange(vyberZIds(ids, lide, ja, jenAktivni));
  };
  const prepni = (id: number) => zmen(mnozina.has(id) ? vybrane.filter((x) => x !== id) : [...vybrane, id]);
  const mojeSkupina = skupiny.find((t) => t.mujTym);
  const predvolby: { klic: string; text: string; vyber: Vyber }[] = [
    { klic: 'ja', text: 'Já', vyber: { ...VYBER_JA, ...s } },
    ...(mojeSkupina ? [{ klic: 'muj', text: `Můj tým (${clenoveTymu(ja, lide, jenAktivni).length})`, vyber: { druh: 'tym' as const, tymId: ja, ids: [], ...s } }] : []),
    { klic: 'vsichni', text: shrnutiVyberu({ ...VYBER_VSICHNI, ...s }, lide, ja), vyber: { ...VYBER_VSICHNI, ...s } },
    ...skupiny
      .filter((t) => t.id !== null && !t.mujTym)
      .map((t) => ({ klic: `tym-${t.id}`, text: `${t.nazev} (${clenoveTymu(t.id!, lide, jenAktivni).length})`, vyber: { druh: 'tym' as const, tymId: t.id!, ids: [], ...s } })),
    ...(allowBezVolajiciho ? [{ klic: 'bez', text: 'Bez volajícího', vyber: { ...VYBER_BEZ_VOLAJICIHO, ...s } }] : []),
  ];
  // zaškrtnutí neaktivní se odškrtnou (v seznamu nebudou vidět); kdyby nezbyl nikdo (i tým bez aktivních), výběr přejde na Já
  // (oprava po recenzi 18. 11. 2026, bod 4: nikdy prázdný výběr pod „Tým X (0)“)
  const prepniAktivni = (zap: boolean) => onChange(sJenAktivnimi(value, lide, ja, zap));
  const nalezene = skupiny
    .map((t) => ({ ...t, clenove: t.clenove.filter((c) => hledaniSedi(c, hledat)) }))
    .filter((t) => t.clenove.length > 0);

  return (
    <>
      <div className="lide-predvolby" role="group" aria-label="Předvolby výběru lidí">
        {predvolby.map((p) => {
          const ano = stejnyVyber(value, p.vyber);
          return (
            <button
              key={p.klic}
              type="button"
              className={`pill-btn sm lide-predvolba${ano ? ' go' : ''}`}
              aria-pressed={ano}
              onClick={() => onChange(p.vyber)}
            >
              {p.text}
            </button>
          );
        })}
      </div>
      <div className="lide-hledat">
        <SearchIcon size={16} />
        <input
          ref={hledatRef}
          type="search"
          className="lide-hledat-pole"
          placeholder="Hledat člověka"
          aria-label="Hledat člověka"
          aria-controls={`${idPanelu}-seznam`}
          enterKeyHint="search"
          value={hledat}
          onChange={(e) => onHledat(e.target.value)}
        />
      </div>
      <div className="lide-seznam" id={`${idPanelu}-seznam`}>
        {nalezene.length === 0 && <p className="lide-nikdo">Nikdo takový tu není.</p>}
        {nalezene.map((t) => {
          const idNazvu = `${idPanelu}-${t.id ?? 'bez'}`;
          const ids = t.clenove.map((c) => c.id);
          const vsichniVybrani = ids.every((id) => mnozina.has(id));
          const zbylo = vybrane.filter((id) => !ids.includes(id));
          return (
            <div key={t.id ?? 'bez'} className="lide-skupina" role="group" aria-labelledby={idNazvu}>
              <div className="lide-skupina-hlava">
                <span className="lide-skupina-nazev" id={idNazvu}>
                  {t.nazev}
                </span>
                <button
                  type="button"
                  className="lide-skupina-akce"
                  disabled={vsichniVybrani}
                  aria-label={`Přidat všechny: ${t.nazev}`}
                  onClick={() => zmen([...vybrane, ...ids.filter((id) => !mnozina.has(id))])}
                >
                  vše
                </button>
                <button
                  type="button"
                  className="lide-skupina-akce"
                  disabled={!ids.some((id) => mnozina.has(id)) || zbylo.length === 0}
                  title={zbylo.length === 0 ? 'Aspoň jeden člověk musí zůstat vybraný' : undefined}
                  aria-label={`Odebrat všechny: ${t.nazev}`}
                  onClick={() => zmen(zbylo)}
                >
                  nic
                </button>
              </div>
              {t.clenove.map((c) => {
                const ano = mnozina.has(c.id);
                const posledni = ano && vybrane.length === 1;
                return (
                  <div key={c.id} className={`lide-radek${ano ? ' vybrany' : ''}`} data-user-id={c.id}>
                    <label className="lide-volba" title={posledni ? 'Aspoň jeden člověk musí zůstat vybraný' : undefined}>
                      <input type="checkbox" value={c.id} checked={ano} disabled={posledni} onChange={() => prepni(c.id)} />
                      <span className="lide-jmeno">{c.id === ja ? `${c.display_name} (já)` : c.display_name}</span>
                      {c.role === 'super_admin' && <span className="lide-znacka">super admin</span>}
                      {!c.active && <span className="lide-znacka neaktivni">neaktivní</span>}
                    </label>
                    <button type="button" className="lide-jen" aria-label={`Jen ${c.display_name}`} onClick={() => zmen([c.id])}>
                      jen
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="lide-pata">
        <label className="lide-aktivni">
          <input type="checkbox" checked={jenAktivni} onChange={(e) => prepniAktivni(e.target.checked)} /> jen aktivní
        </label>
        <span className="lide-pocet" aria-live="polite">
          {value.bezVolajiciho ? 'bez volajícího' : value.druh === 'vsichni' && !jenAktivni ? 'všichni' : `vybráno ${vybrane.length}`}
        </span>
      </div>
    </>
  );
}

/** Kde je panel otevřený: pod tlačítkem (počítač), okno odspodu (telefon), nebo rozbalený v okně „Filtry“ (panel filtrů). */
type Rezim = 'pod' | 'okno' | 'vlozeny';

export default function LidePicker({
  value,
  onChange,
  lide,
  ja,
  allowBezVolajiciho = false,
  popisek,
  vychozi,
  className = '',
}: {
  value: Vyber;
  onChange: (v: Vyber) => void;
  /** lidé k výběru (super admin: z all_stats); prázdný seznam = výběr se nevykreslí */
  lide: Clovek[];
  /** id přihlášeného (Já, Můj tým) */
  ja: number;
  /** Označené: předvolba „Bez volajícího“ (migrace 060) */
  allowBezVolajiciho?: boolean;
  /** viditelný popisek („Čí klienty zobrazit“); jinak „Lidé“ jen pro čtečku */
  popisek?: string;
  /** výchozí výběr stránky: jiný výběr má tlačítko žluté jako zapnutý filtr */
  vychozi?: Vyber;
  className?: string;
}) {
  const telefon = useTelefon();
  const [otevreno, setOtevreno] = useState(false);
  const [rezim, setRezim] = useState<Rezim>('pod');
  const [hledat, setHledat] = useState('');
  const obal = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const tlacitko = useRef<HTMLButtonElement>(null);
  const hledatPole = useRef<HTMLInputElement>(null);
  const bylOtevreno = useRef(false);
  // vrátit fokus na tlačítko po zavření? Jen když panel zavřel člověk (Escape, Hotovo, křížek, tlačítko, závoj okna);
  // ne když fokus odešel Tabem jinam nebo klikl mimo (oprava po recenzi 18. 11. 2026, bod 2)
  const vratitFokus = useRef(false);
  // pojistka (oprava po recenzi, bod 8): výběr jen pro přihlášeného super admina, i kdyby stránka poslala lidi
  const superAdmin = isSuperAdmin(useAuth().session?.role);
  const idPanelu = useId();
  const idPopisku = useId();
  const idNadpisu = useId();

  const zavri = (vratit: boolean) => {
    vratitFokus.current = vratit;
    setOtevreno(false);
  };
  const otevri = () => {
    // v okně „Filtry“ panelu filtrů (telefon) se panel rozbalí přímo v něm, jinak na telefonu vlastní okno odspodu
    setRezim(obal.current?.closest('.filtr-sheet') ? 'vlozeny' : telefon ? 'okno' : 'pod');
    setHledat('');
    setOtevreno(true);
  };

  // jiná šířka (otočení telefonu) panel zavře, ať nezůstane v režimu, který k obrazovce nepatří
  useEffect(() => {
    vratitFokus.current = false;
    setOtevreno(false);
  }, [telefon]);

  // po otevření fokus do panelu (počítač: hledání; okno a rozbalený panel: první předvolba), po zavření zpět na tlačítko, jen
  // když ho zavřel člověk (Escape, Hotovo, křížek, tlačítko); Tab ven a klik mimo nechají fokus tam, kam šel
  useEffect(() => {
    if (!otevreno) {
      if (bylOtevreno.current && vratitFokus.current) tlacitko.current?.focus();
      bylOtevreno.current = false;
      vratitFokus.current = false;
      return;
    }
    bylOtevreno.current = true;
    if (rezim === 'pod') hledatPole.current?.focus();
    else panel.current?.querySelector<HTMLElement>(rezim === 'okno' ? '.lide-sheet-zavrit' : '.lide-predvolba')?.focus();
  }, [otevreno, rezim]);

  // pod tlačítkem: klik mimo zavře (jako výběr stavu a známky); okno: stránka pod ním se neposouvá
  useEffect(() => {
    if (!otevreno) return;
    if (rezim === 'okno') {
      const puvodni = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = puvodni;
      };
    }
    if (rezim !== 'pod') return;
    const mimo = (e: MouseEvent | TouchEvent) => {
      if (obal.current && !obal.current.contains(e.target as Node)) zavri(false);
    };
    document.addEventListener('mousedown', mimo);
    document.addEventListener('touchstart', mimo);
    return () => {
      document.removeEventListener('mousedown', mimo);
      document.removeEventListener('touchstart', mimo);
    };
  }, [otevreno, rezim]);

  // Escape s otevřeným panelem zavře panel, ať je fokus kdekoli: v panelu, na tlačítku, nebo jinde v okně „Filtry“ (jako
  // rozbalovací výběry řady filtrů, Rozbalovac v SeznamFiltry.tsx; oprava po recenzi 18. 11. 2026, bod 3). Okno filtrů pod
  // ním zůstane: FiltrPanel napřed zavře otevřený výběr (.lide-picker-panel), a ten je v DOM ještě během téže klávesy.
  useEffect(() => {
    if (!otevreno) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      vratitFokus.current = true;
      setOtevreno(false);
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [otevreno]);

  const klavesa = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const kde = panel.current;
    if (!kde) return;
    const cil = e.target as HTMLElement;
    const polozky = [...kde.querySelectorAll<HTMLElement>('.lide-hledat-pole, .lide-volba input[type="checkbox"]:not([disabled])')];
    const i = polozky.indexOf(cil);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (i < 0 && !cil.classList.contains('lide-predvolba')) return;
      e.preventDefault();
      const dalsi = i < 0 ? polozky[0] : polozky[Math.min(Math.max(i + (e.key === 'ArrowDown' ? 1 : -1), 0), polozky.length - 1)];
      dalsi?.focus();
    } else if ((e.key === 'Home' || e.key === 'End') && i > 0) {
      e.preventDefault();
      (e.key === 'Home' ? polozky[1] : polozky[polozky.length - 1])?.focus();
    } else if (e.key === 'Enter' && cil instanceof HTMLInputElement && cil.type === 'checkbox') {
      e.preventDefault();
      cil.click();
    } else if (e.key === 'Tab' && rezim === 'okno') {
      // okno (aria-modal): Tab zůstane v něm
      const vse = [...kde.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')].filter((x) => x.offsetParent !== null);
      if (vse.length === 0) return;
      if (e.shiftKey && document.activeElement === vse[0]) {
        e.preventDefault();
        vse[vse.length - 1].focus();
      } else if (!e.shiftKey && document.activeElement === vse[vse.length - 1]) {
        e.preventDefault();
        vse[0].focus();
      }
    }
  };
  // pod tlačítkem: fokus mimo výběr (Tab dál) panel zavře a fokus nechá tam, kam šel
  const fokusPryc = (e: ReactFocusEvent<HTMLDivElement>) => {
    if (rezim === 'pod' && otevreno && obal.current && e.relatedTarget instanceof Node && !obal.current.contains(e.relatedTarget)) zavri(false);
  };

  if (lide.length === 0 || !superAdmin) return null;
  const shrnuti = shrnutiVyberu(value, lide, ja);
  const zapnuto = !!vychozi && !stejnyVyber(value, vychozi);
  const obsah = (
    <LidePanel
      value={value}
      onChange={onChange}
      lide={lide}
      ja={ja}
      allowBezVolajiciho={allowBezVolajiciho}
      hledat={hledat}
      onHledat={setHledat}
      hledatRef={hledatPole}
    />
  );

  return (
    <div className={`lide-picker${popisek ? ' s-popiskem' : ''} ${className}`.trim()} ref={obal} onBlur={fokusPryc}>
      {popisek && (
        <span className="lide-picker-popisek" id={idPopisku}>
          {popisek}
        </span>
      )}
      <button
        ref={tlacitko}
        type="button"
        className={`lide-picker-btn${zapnuto ? ' zapnuto' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={otevreno}
        aria-controls={otevreno ? idPanelu : undefined}
        aria-label={`${popisek ?? 'Lidé'}: ${shrnuti}`}
        title={shrnuti}
        onClick={() => (otevreno ? zavri(true) : otevri())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !otevreno) {
            e.preventDefault();
            otevri();
          }
        }}
      >
        <UsersIcon size={17} />
        <span className="lide-picker-text">{shrnuti}</span>
        <span className="lide-picker-sipka" aria-hidden="true">
          ▾
        </span>
      </button>
      {otevreno && rezim !== 'okno' && (
        <div
          ref={panel}
          className={`lide-picker-panel${rezim === 'vlozeny' ? ' vlozeny' : ''}`}
          id={idPanelu}
          role="dialog"
          aria-label={popisek ?? 'Výběr lidí'}
          onKeyDown={klavesa}
        >
          {obsah}
        </div>
      )}
      {otevreno && rezim === 'okno' && (
        <>
          {/* závoj modálního okna zavře okno jako křížek (fokus zpět na tlačítko, jinak by po zavření okna nebyl nikde) */}
          <div className="lide-sheet-scrim" aria-hidden="true" onClick={() => zavri(true)} />
          <div
            ref={panel}
            className="lide-sheet lide-picker-panel okno"
            id={idPanelu}
            role="dialog"
            aria-modal="true"
            aria-labelledby={idNadpisu}
            onKeyDown={klavesa}
          >
            <div className="lide-sheet-hlava">
              <h2 className="lide-sheet-nadpis" id={idNadpisu}>
                {popisek ?? 'Výběr lidí'}
              </h2>
              <button type="button" className="drawer-close lide-sheet-zavrit" aria-label="Zavřít výběr lidí" onClick={() => zavri(true)}>
                <XIcon size={18} />
              </button>
            </div>
            <div className="lide-sheet-telo">{obsah}</div>
            <div className="lide-sheet-pata">
              <span className="lide-sheet-vyber">{shrnuti}</span>
              <button type="button" className="pill-btn go lide-sheet-hotovo" onClick={() => zavri(true)}>
                Hotovo
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
