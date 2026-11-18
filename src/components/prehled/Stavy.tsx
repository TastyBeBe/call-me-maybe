// STAVY PŘEHLEDU (Přehled vedení úkol 13, Albert 17. 11. 2026; spec docs/superpowers/specs/2026-11-17-prehled-vedeni-design.md §7.2:
// „Empty / loading / error / partial / demo states all distinct; an API error never shows demo data as real“). Načítání = kostra
// karet (ne točící se kolečko přes obsah), chyba = věta serveru a „Zkusit znovu“ (server bez migrace 073 svou vlastní hláškou
// a nic jiného), prázdno = co to znamená a co zkusit, částečná data = varování serveru a počet neúplných čísel, demo = pruh nahoře
// (ukázková data, ne skutečná čísla). Volající nic z toho nevidí (stránka ho přesměruje).

import type { Metrika, PrehledMeta } from '../../api/types';
import { WarningIcon, ZnovuIcon } from '../../icons';
import { bezMigrace073, KVALITA_NAZVY, nazevMetriky } from '../../prehled';

/** Kostra karet během prvního načítání. */
export function PrehledNacita({ karet = 8, popis = 'Načítám čísla…' }: { karet?: number; popis?: string }) {
  return (
    <div className="prehled-nacita" aria-busy="true" role="status" aria-label={popis}>
      <div className="kpi-mrizka">
        {Array.from({ length: karet }, (_, i) => (
          <div key={i} className="kpi-karta kostra" aria-hidden="true">
            <span className="kostra-radek kratky" />
            <span className="kostra-radek velky" />
            <span className="kostra-radek" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Chyba načtení: server bez migrace 073 má vlastní nadpis, jinak věta serveru; vždy „Zkusit znovu“. */
export function PrehledChyba({ text, onZnovu }: { text: string; onZnovu?: () => void }) {
  const migrace = bezMigrace073(text);
  return (
    <div className={`card prehled-chyba${migrace ? ' bez-migrace' : ''}`} role="alert">
      <p className="prehled-chyba-nadpis">
        <WarningIcon size={20} /> {migrace ? 'Přehled potřebuje migraci 073' : 'Čísla se nepodařilo načíst'}
      </p>
      <p className="prehled-chyba-text">
        {migrace
          ? 'Server ještě nemá funkce Přehledu (migrace 073). Dokud se nenasadí, Přehled žádná čísla neukáže; ukázková data místo skutečných nikdy.'
          : text}
      </p>
      {onZnovu && (
        <button type="button" className="pill-btn sm" onClick={onZnovu}>
          <ZnovuIcon size={14} /> Zkusit znovu
        </button>
      )}
    </div>
  );
}

/** Prázdno: nadpis a co zkusit. */
export function PrehledPrazdne({ nadpis, text }: { nadpis: string; text: string }) {
  return (
    <div className="prehled-prazdne">
      <p className="prehled-prazdne-nadpis">{nadpis}</p>
      <p className="muted">{text}</p>
    </div>
  );
}

/** Částečná data: varování serveru (meta.varovani) a neúplná čísla odpovědi. */
export function PrehledCastecne({ varovani, metriky }: { varovani: PrehledMeta['varovani']; metriky: Metrika[] }) {
  const neuplne = metriky.filter((m) => m.kvalita !== 'dostupne');
  if (varovani.length === 0 && neuplne.length === 0) return null;
  return (
    <details className="prehled-castecne">
      <summary>
        <WarningIcon size={16} /> {neuplne.length > 0 ? `Část čísel je neúplná (${neuplne.length})` : 'Upozornění k číslům'}
        {varovani.length > 0 ? ` · upozornění ${varovani.length}` : ''}
      </summary>
      {varovani.length > 0 && (
        <ul className="prehled-varovani">
          {varovani.map((v) => (
            <li key={v.kod} data-kod={v.kod}>
              {v.text}
            </li>
          ))}
        </ul>
      )}
      {neuplne.length > 0 && (
        <ul className="prehled-neuplne">
          {neuplne.map((m) => (
            <li key={m.klic}>
              <strong>{nazevMetriky(m.klic, m.nazev)}</strong> ({KVALITA_NAZVY[m.kvalita]}){m.duvod ? `: ${m.duvod}` : ''}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

/** Pruh ukázkových dat (DEMO): jasně, že čísla nejsou skutečná. */
export function DemoPruh() {
  return (
    <p className="prehled-demo" role="note">
      <span className="demo-chip">DEMO</span> Ukázková data z paměti prohlížeče, ne skutečná čísla firmy.
    </p>
  );
}
