/**
 * Legenda (Albert 27. 11. 2026): tlačítko „legenda“ v horní liště pro každého a okno, které vysvětlí každý stav, příznak,
 * označení a odznak appky jednou větou (src/legenda.ts, úplnost hlídá tests/legenda.test.mjs).
 */
import { useEffect, useState } from 'react';
import { NAZVY_SKUPIN, legenda } from '../legenda';
import { NAVRH_ODZNAK } from '../kontrola';
import type { KontaktStatus } from '../api/types';
import { STATUS_COLORS } from '../ui';

function Stitek({ skupina, klic, stitek }: { skupina: string; klic: string; stitek: string }) {
  if (skupina === 'stav') {
    // stejné barvy jako StatusBadge (bez zobrazeného stavu konkrétního klienta)
    const c = STATUS_COLORS[klic as KontaktStatus] ?? { bg: '#fdf6e9', fg: '#221e33' };
    return <span className="badge status-badge" style={{ background: c.bg, color: c.fg }}>{stitek}</span>;
  }
  if (skupina === 'navrh') {
    return <span className={`badge ${NAVRH_ODZNAK[klic as keyof typeof NAVRH_ODZNAK] ?? 'neutral'}`}>{stitek}</span>;
  }
  if (skupina === 'znacky' && klic === 'WebNaMiruOdznak') return <span className="badge web-na-miru">{stitek}</span>;
  return <span className="badge neutral">{stitek}</span>;
}

export function LegendaTlacitko() {
  const [otevreno, setOtevreno] = useState(false);
  useEffect(() => {
    if (!otevreno) return undefined;
    const klavesa = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOtevreno(false);
    };
    window.addEventListener('keydown', klavesa);
    return () => window.removeEventListener('keydown', klavesa);
  }, [otevreno]);
  const polozky = legenda();
  const skupiny = [...new Set(polozky.map((p) => p.skupina))];
  return (
    <>
      <button type="button" className="nav-pill legenda-btn" data-sfx="none" onClick={() => setOtevreno(true)}>
        legenda
      </button>
      {otevreno && (
        <div className="scrim" onClick={() => setOtevreno(false)}>
          <div className="modal card legenda-okno" role="dialog" aria-label="Legenda" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Legenda: co znamenají štítky v appce</h3>
            <div className="modal-body">
              {skupiny.map((s) => (
                <section key={s} className="legenda-skupina">
                  <h4>{NAZVY_SKUPIN[s] ?? s}</h4>
                  <ul>
                    {polozky.filter((p) => p.skupina === s).map((p) => (
                      <li key={p.klic} data-legenda={`${p.skupina}:${p.klic}`}>
                        <Stitek skupina={p.skupina} klic={p.klic} stitek={p.stitek} /> {p.vysvetleni}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="pill-btn" onClick={() => setOtevreno(false)}>
                Zavřít
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
