// ŘÁDKY ZA ČÍSLEM (Přehled vedení úkol 13, Albert 17. 11. 2026; spec docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md
// §7.2: „click → drilldown drawer (rows, paging, CSV)“; kontrakt §2.8 a §5.15). Panel zprava nad stránkou (role dialog, Tab
// zůstává v něm, Escape a křížek zavřou, fokus se vrátí na kartu): řádky prehled_radky s proklik.filtr beze změny po 50 na
// stránku (kurzor, „Další“ a „Předchozí“), počet a součet všech řádků (stejné číslo jako karta), stažení CSV až 5 000 řádků
// po stránkách 200 (src/csv.ts: apostrof před vzorcem, telefon a e-mail zamaskované, středník, BOM pro český Excel).

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { getApi, type DataRadky, type PrehledObalka, type PrehledProklik } from '../../api';
import { useSession } from '../../auth';
import { CSV_MAX_RADKU, doCsv } from '../../csv';
import { DownloadIcon, XIcon, ZnovuIcon } from '../../icons';
import { casText, chybaPrehledu, denText, radekZaznam, SLOUPCE_RADKU, souctyText } from '../../prehled';

const NA_STRANKU = 50;
const CSV_STRANKA = 200;

export default function ProklikPanel({
  proklik,
  nazev,
  popis,
  onZavri,
}: {
  proklik: PrehledProklik;
  /** nadpis (název metriky nebo buňky) */
  nazev: string;
  /** věta pod nadpisem (hodnota karty, období) */
  popis?: string | null;
  onZavri: () => void;
}) {
  const session = useSession();
  const idNadpisu = useId();
  const panel = useRef<HTMLDivElement>(null);
  // kurzory stránek: [null, kurzor 2. stránky, …]; strana = index do něj
  const [kurzory, setKurzory] = useState<(string | null)[]>([null]);
  const [strana, setStrana] = useState(0);
  const [odpoved, setOdpoved] = useState<PrehledObalka<DataRadky> | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [nacita, setNacita] = useState(true);
  const [znovu, setZnovu] = useState(0);
  const [csv, setCsv] = useState<{ stav: 'nic' | 'bezi' | 'hotovo' | 'chyba'; text: string }>({ stav: 'nic', text: '' });
  const cislo = useRef(0);

  useEffect(() => {
    const moje = ++cislo.current;
    setNacita(true);
    setChyba(null);
    getApi()
      .prehledRadky(session.token, proklik.zdroj as DataRadky['zdroj'], proklik.filtr, kurzory[strana] ?? null, NA_STRANKU)
      .then((o) => {
        if (moje !== cislo.current) return;
        setOdpoved(o);
        setNacita(false);
      })
      .catch((e: unknown) => {
        if (moje !== cislo.current) return;
        setChyba(chybaPrehledu(e));
        setNacita(false);
      });
  }, [session.token, proklik, strana, kurzory, znovu]);

  // otevřený panel: fokus na křížek, stránka pod ním se neposouvá, Escape zavře (otevřený popis „i“ zavře Escape napřed sám sebe)
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('.proklik-zavrit')?.focus();
    const puvodni = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const klavesa = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onZavri();
    };
    document.addEventListener('keydown', klavesa);
    return () => {
      document.body.style.overflow = puvodni;
      document.removeEventListener('keydown', klavesa);
    };
  }, [onZavri]);

  const tabVPanelu = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panel.current) return;
    const prvky = [...panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
    if (prvky.length === 0) return;
    const prvni = prvky[0];
    const posledni = prvky[prvky.length - 1];
    if (e.shiftKey && document.activeElement === prvni) {
      e.preventDefault();
      posledni.focus();
    } else if (!e.shiftKey && document.activeElement === posledni) {
      e.preventDefault();
      prvni.focus();
    }
  };

  const dalsi = () => {
    const k = odpoved?.data.dalsi_kurzor;
    if (!k) return;
    setKurzory((p) => [...p.slice(0, strana + 1), k]);
    setStrana((s) => s + 1);
  };
  const predchozi = () => setStrana((s) => Math.max(0, s - 1));

  const stahni = useCallback(async () => {
    setCsv({ stav: 'bezi', text: 'Připravuji CSV…' });
    try {
      const radky: Record<string, unknown>[] = [];
      let kurzor: string | null = null;
      let celkem = 0;
      do {
        const o: PrehledObalka<DataRadky> = await getApi().prehledRadky(session.token, proklik.zdroj as DataRadky['zdroj'], proklik.filtr, kurzor, CSV_STRANKA);
        celkem = o.data.celkem;
        radky.push(...o.data.radky.map(radekZaznam));
        kurzor = o.data.dalsi_kurzor;
      } while (kurzor && radky.length < CSV_MAX_RADKU);
      const vyrez = radky.slice(0, CSV_MAX_RADKU);
      const sloupce = SLOUPCE_RADKU[proklik.zdroj as DataRadky['zdroj']].map((s) => ({ klic: s.klic, nazev: s.nazev, typ: s.typ, hodnota: s.hodnota }));
      const obsah = doCsv(vyrez, sloupce);
      const soubor = `prehled-${proklik.zdroj}-${proklik.filtr.od}-${proklik.filtr.do}.csv`;
      const url = URL.createObjectURL(new Blob(['﻿', obsah], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = soubor;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setCsv({ stav: 'hotovo', text: celkem > CSV_MAX_RADKU ? `Staženo prvních ${CSV_MAX_RADKU} řádků z ${celkem}.` : `Staženo ${vyrez.length} řádků.` });
    } catch (e) {
      setCsv({ stav: 'chyba', text: `CSV se nepovedlo: ${chybaPrehledu(e)}` });
    }
  }, [session.token, proklik]);

  const d = odpoved?.data;
  const sloupce = SLOUPCE_RADKU[proklik.zdroj as DataRadky['zdroj']] ?? [];
  const od = strana * NA_STRANKU + 1;
  const doRadku = d ? strana * NA_STRANKU + d.radky.length : 0;
  const soucty = d ? souctyText(d.soucty) : null;
  const obdobi = `${denText(proklik.filtr.od)} – ${denText(proklik.filtr.do)}`;

  return (
    <>
      <div className="drawer-scrim" aria-hidden="true" onClick={onZavri} />
      <div className="drawer proklik-panel" role="dialog" aria-modal="true" aria-labelledby={idNadpisu} ref={panel} onKeyDown={tabVPanelu}>
        <button type="button" className="drawer-close proklik-zavrit" aria-label="Zavřít řádky" onClick={onZavri}>
          <XIcon size={18} />
        </button>
        <h2 id={idNadpisu}>{nazev}</h2>
        <p className="proklik-popis">
          {popis ? `${popis} · ` : ''}
          {obdobi}
          {proklik.filtr.k_datu ? ` · k ${casText(proklik.filtr.k_datu)}` : ''}
        </p>
        {d && !chyba && (
          <p className="proklik-souhrn" aria-live="polite">
            {d.celkem === 0 ? 'Žádné řádky' : `Řádky ${od}–${doRadku} z ${d.celkem}`}
            {soucty ? <> · součet <strong>{soucty}</strong></> : null}
            {d.soucet !== null ? <> · součet <strong>{d.soucet.toLocaleString('cs-CZ')} h</strong></> : null}
          </p>
        )}
        {chyba ? (
          <div className="prehled-chyba" role="alert">
            <p className="prehled-chyba-text">{chyba}</p>
            <button type="button" className="pill-btn sm" onClick={() => setZnovu((z) => z + 1)}>
              <ZnovuIcon size={14} /> Zkusit znovu
            </button>
          </div>
        ) : nacita && !d ? (
          <div className="proklik-kostra" aria-busy="true" aria-label="Načítám řádky">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="kostra-radek" />
            ))}
          </div>
        ) : d && d.celkem === 0 ? (
          <div className="prehled-prazdne">
            <p className="prehled-prazdne-nadpis">Za tímhle číslem nejsou žádné řádky.</p>
            <p className="muted">V tomhle období a výběru není nic, co by se do čísla počítalo. Zkuste delší období nebo jiný výběr lidí.</p>
          </div>
        ) : d ? (
          <div className={`table-wrap proklik-tabulka-obal${nacita ? ' prepocitava' : ''}`} aria-busy={nacita}>
            <table className="proklik-tabulka">
              <thead>
                <tr>
                  {sloupce.map((s) => (
                    <th key={s.klic} scope="col">
                      {s.nazev}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.radky.map((r) => {
                  const z = radekZaznam(r);
                  return (
                    <tr key={r.radek_id} data-radek={r.radek_id}>
                      {sloupce.map((s) => (
                        <td key={s.klic} data-label={s.nazev}>
                          {s.typ === 'odkaz' && typeof z[s.klic] === 'string' ? (
                            <a href={z[s.klic] as string} target="_blank" rel="noopener noreferrer">
                              {s.text(z)}
                            </a>
                          ) : (
                            s.text(z)
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {d && d.celkem > 0 && (
          <div className="proklik-ovladani">
            <div className="proklik-strankovani" role="group" aria-label="Stránky řádků">
              <button type="button" className="pill-btn sm" onClick={predchozi} disabled={strana === 0 || nacita}>
                Předchozí
              </button>
              <span className="muted">Strana {strana + 1} z {Math.max(1, Math.ceil(d.celkem / NA_STRANKU))}</span>
              <button type="button" className="pill-btn sm" onClick={dalsi} disabled={!d.dalsi_kurzor || nacita}>
                Další
              </button>
            </div>
            <button type="button" className="pill-btn sm go proklik-csv" onClick={() => void stahni()} disabled={csv.stav === 'bezi'}>
              <DownloadIcon size={14} /> Stáhnout CSV
            </button>
          </div>
        )}
        {csv.text && (
          <p className={`proklik-csv-stav ${csv.stav}`} role="status">
            {csv.text}
          </p>
        )}
      </div>
    </>
  );
}
