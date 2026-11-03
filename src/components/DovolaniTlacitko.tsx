// „ZAVOLAL/A JSEM“ V ŘÁDKU SEZNAMU A V DETAILU (migrace 062, Albert 2. 11. 2026: „currently when you're in the marked feature
// you can hit the I called them … and I like the I called them … feature. So I would like to have this also in my clients
// section … even if the client isn't marked yet and you call them again, you should have like a I called them button …
// so that I called them again feature is both in the flagged/marked section and also in the my clients section, and you can
// even add [it] to the contacts section“). Jedno tlačítko pro Označené (i řádek jen s příznakem), Moji klienti, Kontakty
// (jen vlastní řádky; buňky Skryto cizího kontaktu, kontrola 193, se nemění) a detail klienta bez označení (PrehledPanel).
// Je to pilulka z Označených (061): klik neotevře detail (stopPropagation, i z okna: okno je přes createPortal v body, ale
// události React jdou stromem komponent, takže klik na pozadí okna by jinak doputoval k řádku a otevřel detail) a okno
// DovolaniOkno má vlastní stav. Ukáže se jen tam, kde ho smí zapsat (dovolatSmi v ui.tsx): ne u cizího kontaktu
// Volajícího, ve frontě volání, u Nekontaktovat, Nerelevantní, Odmítnuto ani u nabídnuté slevy bez označení (Albert
// 2. 11. 2026: „if the client refuses the preview on the first call, I don't think we should be calling them again“).
// Kterou větev zapíše (označení, nebo další hovor bez něj), vybere server; řádek předá klíče označení, které přihlášený vidí.
// `jenIkonaNaTelefonu` (Moji klienti, Kontakty): do 640 px jen ikona, název zůstává v aria-label a title (styles.css).

import { useState } from 'react';
import type { Kontakt } from '../api';
import { AlarmIcon } from '../icons';
import { dovolatSmi } from '../ui';
import DovolaniOkno, { type DovolaniZapsano } from './DovolaniOkno';

/** Klíče řádku, které tlačítko a okno potřebují (seznamy je posílají u vlastního řádku, detail z řádku seznamu). */
export type DovolaniKontakt = Pick<
  Kontakt,
  'id' | 'name' | 'firma' | 'status' | 'skryto' | 'smi_upravit' | 'first_proposal_at' | 'live_url' | 'last_caller' | 'segment'
> &
  Partial<Pick<Kontakt, 'ozn_kategorie' | 'ozn_lhuta_do' | 'ozn_pokusy' | 'hvezda_at' | 'flag_note'>>;

/** Název tlačítka (i aria-label a title, když je na telefonu jen ikona). */
export const ZAVOLAL_POPIS = 'Zavolal/a jsem';
export const ZAVOLAL_NAPOVEDA = 'Zavolal/a jsem: zapiš, jak hovor dopadl';

export default function DovolaniTlacitko({
  kontakt,
  onDovolano,
  jenIkonaNaTelefonu = false,
}: {
  kontakt: DovolaniKontakt;
  /** po zápisu: věta pro stránku (stránka zavře detail a načte seznam znovu) */
  onDovolano: (veta: string, zapsano: DovolaniZapsano) => void;
  /** do 640 px jen ikona (řádky Moji klienti a Kontakty: tlačítko zůstává v 1. řádku vedle telefonu) */
  jenIkonaNaTelefonu?: boolean;
}) {
  const [otevreno, setOtevreno] = useState(false);
  if (!dovolatSmi(kontakt)) return null;
  const smiUpravit = kontakt.smi_upravit !== false;
  return (
    <>
      <button
        type="button"
        className={`pill-btn go sm zavolal-btn${jenIkonaNaTelefonu ? ' zavolal-ikona-telefon' : ''}`}
        aria-label={ZAVOLAL_POPIS}
        title={ZAVOLAL_NAPOVEDA}
        onClick={(e) => {
          e.stopPropagation();
          setOtevreno(true);
        }}
      >
        <AlarmIcon size={14} /> <span className="zavolal-text">{ZAVOLAL_POPIS}</span>
      </button>
      {otevreno && (
        // klik z okna (přes createPortal v body) jde stromem komponent nahoru k řádku: tady se zastaví (klávesy ne: Escape
        // a Tab okna poslouchá useOkno na document a zastavená událost by k němu nedošla)
        <span className="dovolani-obal" onClick={(e) => e.stopPropagation()}>
          <DovolaniOkno
            kontakt={kontakt}
            kategorie={kontakt.ozn_kategorie ?? null}
            lhutaDo={kontakt.ozn_lhuta_do ?? null}
            pokusy={kontakt.ozn_pokusy ?? 0}
            maHvezdu={!!kontakt.hvezda_at}
            smiUpravit={smiUpravit}
            smiHvezdu={smiUpravit && Object.prototype.hasOwnProperty.call(kontakt, 'hvezda_at')}
            onZavrit={() => setOtevreno(false)}
            onHotovo={(veta, zapsano) => {
              setOtevreno(false);
              onDovolano(veta, zapsano);
            }}
          />
        </span>
      )}
    </>
  );
}
