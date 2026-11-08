// Panel „jejich web“ u firmy oboru (migrace 064, Albert 7. 11. 2026; návrh oborů 6.3 a 6.4). Tentýž panel je na kartě
// hovoru i v detailu kontaktu: odkaz na vlastní web (nebo „nemá vlastní web“ a odkaz na sociální síť), hodnocení webu
// A až F s významem písmene, jedna věta o stavu webu, nejvýš dvě konkrétní věty o nedostatcích a datum kontroly.
// Písmeno je jen pro volajícího, firmě se čte konkrétní nedostatek. Hodnocení, stav ani důvody nejdou upravit (import).

import type { Kontakt } from '../api';
import {
  denCesky,
  hodnoceniWebu,
  HODNOCENI_TON,
  maVlastniWebFirmy,
  odkazWebu,
  socialniPopisek,
  TON_SLOVO,
  vetaOWebu,
  vetyNedostatku,
  VYZNAM_HODNOCENI,
} from '../webFirmy';

type WebKontakt = Pick<
  Kontakt,
  'web' | 'web_stav' | 'web_hodnoceni' | 'web_duvod' | 'web_socialni' | 'web_hodnoceno_do'
>;

/** Třída odznaku podle tónu hodnocení (barvy v styles.css). */
const TRIDA_TONU = { dobry: 'green', prumerny: 'neutral', slaby: 'red' } as const;

export default function JejichWeb({ kontakt, naKarte = false }: { kontakt: WebKontakt; naKarte?: boolean }) {
  const vlastni = maVlastniWebFirmy(kontakt.web_stav, kontakt.web);
  const odkaz = vlastni ? odkazWebu(kontakt.web) : null;
  const socialni = odkazWebu(kontakt.web_socialni);
  const socialniText = socialniPopisek(kontakt.web_socialni);
  const h = hodnoceniWebu(kontakt.web_hodnoceni);
  const ton = h ? HODNOCENI_TON[h] : null;
  const vety = vetyNedostatku(kontakt.web_duvod);
  const den = denCesky(kontakt.web_hodnoceno_do);
  return (
    <div className={`jejich-web${naKarte ? ' na-karte' : ''}`} data-web-stav={kontakt.web_stav ?? ''}>
      <div className="jejich-web-odkaz">
        {odkaz ? (
          <a href={odkaz} target="_blank" rel="noreferrer">
            {kontakt.web}
          </a>
        ) : (
          <span className="badge yellow">nemá vlastní web</span>
        )}
        {!vlastni && socialni && socialniText && (
          <>
            {' '}
            <a href={socialni} target="_blank" rel="noreferrer" className="jejich-web-socialni">
              {socialniText}
            </a>
          </>
        )}
      </div>
      {h && ton && (
        <div className="jejich-web-hodnoceni">
          <span className="muted">hodnocení webu</span>{' '}
          <span
            className={`badge hodnoceni-webu ${TRIDA_TONU[ton]}`}
            title={`${VYZNAM_HODNOCENI[h]}. Písmeno je jen pro tebe, firmě řekni konkrétní nedostatek.`}
          >
            {h} · {TON_SLOVO[ton]}
          </span>
        </div>
      )}
      <p className="jejich-web-veta">{vetaOWebu(kontakt.web_stav, kontakt.web_hodnoceni, kontakt.web)}</p>
      {vety.length > 0 && (
        <ul className="jejich-web-nedostatky">
          {vety.map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>
      )}
      {den && <p className="jejich-web-den muted">hodnoceno k {den}</p>}
    </div>
  );
}

/**
 * Písmeno hodnocení webu firmy oboru do buňky „Web“ v seznamech (návrh 6.4): odznak s písmenem, věta o stavu webu jako
 * `title`. U chat, architektů a firmy bez hodnocení nic.
 */
export function HodnoceniVSeznamu({ kontakt }: { kontakt: WebKontakt & Pick<Kontakt, 'segment'> }) {
  const h = hodnoceniWebu(kontakt.web_hodnoceni);
  if (!h || kontakt.segment === 'chata' || kontakt.segment === 'architekt' || !kontakt.segment) return null;
  const ton = HODNOCENI_TON[h];
  return (
    <span
      className={`badge hodnoceni-webu ${TRIDA_TONU[ton]}`}
      title={`hodnocení webu ${h} (${TON_SLOVO[ton]}): ${vetaOWebu(kontakt.web_stav, kontakt.web_hodnoceni, kontakt.web)}`}
    >
      {h}
    </span>
  );
}
