// PŘEHLED KLIENTA PRO VOLAJÍCÍ (migrace 060, Albert 1. 11. 2026: „kept up to date by the automation from every e-mail,
// structured“). Panel v detailu kontaktu a na kartě ve volání, jen u vlastního klienta (server kontakt_prehled cizímu
// odmítne, appka ho u cizího kontaktu nevolá; větev jenZaklad ho nemá). Fakta skládá server z dat bez jazykového modelu
// (stav, hvězda, označení, návrh, poslední zprávy, nabídka, připomínka kampaně, smazání náhledu, naplánovaný hovor, cena)
// a jsou vždy; text od automatizace (Teď a další krok, Co klient chce, Co jsme poslali, Pozor) jen když už je (ve stage 1
// ho nic nepíše, panel pak řekne, že ho automatizace doplní). Poznámky volajících zůstávají pod ním beze změny.
// Migrace 062 (Albert 2. 11. 2026: „even if the client isn't marked yet and you call them again, you should have like a I called
// them button“): v detailu klienta BEZ označení řádek „Klient není v Označených.“ s tlačítkem „Zavolal/a jsem“
// (DovolaniTlacitko), když ho přihlášený smí zapsat (dovolatSmi: ne ve frontě volání, u Nekontaktovat, Nerelevantní,
// Odmítnuto ani u nabídnuté slevy). U otevřeného označení beze změny tlačítko u označení (okno s kategorií a lhůtou).
// Migrace 063 (Albert 1. 11. 2026, druhá etapa): řádek faktů „připomínka po lhůtě: odeslána <den>“ (fakta.pripominka_oznaceni)
// a u hvězdy od automatizace „dala ji automatizace <den> · <důvod>“.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getApi, type Kontakt, type KontaktPrehled, type PrehledFakta } from '../api';
import { useSession } from '../auth';
import { isSuperAdmin } from '../roles';
import { AlarmIcon, HvezdaIcon } from '../icons';
import {
  CENA_NA,
  OznaceniBadge,
  STATUS_LABELS,
  cenaText,
  dovolatSmi,
  formatDatumDne,
  formatDatumPraha,
  formatKdyVeta,
  formatMlci,
  hvezdaKdoText,
  lhutaText,
} from '../ui';
import DovolaniOkno, { ZrusitOznaceniOkno } from './DovolaniOkno';
import DovolaniTlacitko from './DovolaniTlacitko';

/** Prázdný přehled od automatizace (Albert 1. 11. 2026: jen fakta, text doplní automatizace). */
export const PREHLED_PRAZDNY = 'Přehled doplní automatizace po další e-mailové výměně.';

const ZDROJ: Record<string, string> = { 'e-mail': 'e-mail', hovor: 'hovor', zprava: 'zpráva v appce' };

const datum = (iso: string | null | undefined) => (iso ? formatDatumPraha(iso) : null);

/** Řádky faktů (jen ty, které něco říkají). `kratce` = karta ve volání: bez stavu (ten je na kartě zvlášť). */
function radkyFaktu(f: PrehledFakta, kratce: boolean): { klic: string; text: string }[] {
  const r: { klic: string; text: string }[] = [];
  if (!kratce && f.stav) {
    r.push({ klic: 'stav', text: `${STATUS_LABELS[f.stav] ?? f.stav}${f.stav_od ? ` od ${datum(f.stav_od)}` : ''}` });
  }
  if (f.hvezda?.at) {
    // migrace 063: hvězda od automatizace „dala ji automatizace … · důvod“ (důvod napsal worker podle zprávy klienta)
    r.push({
      klic: 'hvězda',
      text: `velký zájem, ${hvezdaKdoText(f.hvezda.kdo)} ${datum(f.hvezda.at)}${f.hvezda.duvod ? ` · ${f.hvezda.duvod}` : ''}`,
    });
  }
  if (f.prvni_navrh || f.nase_posledni || f.klient_naposledy) {
    const kusy = [
      f.prvni_navrh ? `první návrh ${datum(f.prvni_navrh)}` : null,
      `naše poslední zpráva ${datum(f.nase_posledni) ?? '—'}`,
      `klient naposledy ${datum(f.klient_naposledy) ?? 'nikdy'}`,
    ].filter(Boolean);
    r.push({ klic: 'pošta', text: `${kusy.join(' · ')}${f.mlci_pd != null ? ` · mlčí ${formatMlci(f.mlci_pd)}` : ''}` });
  }
  if (f.nabidka) {
    r.push({
      klic: 'nabídka',
      text: `poloviční cena odešla ${datum(f.nabidka.odeslana_at)}${f.nabidka.konci_dne ? `, platí do ${formatDatumDne(f.nabidka.konci_dne)}` : ''}${
        f.nabidka.archiv_dne ? `; bez odpovědi do archivu ${formatDatumDne(f.nabidka.archiv_dne)}` : ''
      }`,
    });
  }
  if (f.pripominka_kampane) r.push({ klic: 'připomínka', text: `připomínka kampaně odešla ${datum(f.pripominka_kampane)}` });
  // migrace 063 (Albert 1. 11. 2026): obyčejná připomínka e-mailem po lhůtě na zavolání (jedna na mlčení)
  if (f.pripominka_oznaceni) r.push({ klic: 'připomínka po lhůtě', text: `odeslána ${datum(f.pripominka_oznaceni)}` });
  if (f.nahled_smazani) r.push({ klic: 'náhled', text: `náhled webu se smaže ${datum(f.nahled_smazani)}` });
  if (f.zavolat) {
    r.push({
      klic: 'hovor',
      text: `naplánovaný hovor ${formatKdyVeta(f.zavolat.kdy)}${f.zavolat.muj ? '' : f.zavolat.volajici ? `, volá ${f.zavolat.volajici}` : ''}${
        f.zavolat.poznamka ? ` · ${f.zavolat.poznamka}` : ''
      }`,
    });
  }
  const web = cenaText(f.cena_web);
  const hosting = cenaText(f.cena_hosting);
  if (web || hosting) r.push({ klic: 'cena', text: `web ${web?.text ?? CENA_NA} · hosting ${hosting?.text ?? CENA_NA}` });
  return r;
}

export default function PrehledPanel({
  kontakt,
  naKarte = false,
  smiZapsat = false,
  onDovolano,
}: {
  /** migrace 062: i stav, náhled, poslední volající, skryto a označení řádku (tlačítko bez označení a texty okna) */
  kontakt: Pick<Kontakt, 'id' | 'name' | 'firma' | 'smi_upravit' | 'status' | 'first_proposal_at' | 'live_url' | 'last_caller' | 'skryto'> &
    Partial<Pick<Kontakt, 'ozn_kategorie' | 'hvezda_at' | 'flag_note'>>;
  /** karta ve volání: kratší, bez stavu, bez zápisu hovoru; když nic neříká, nevykreslí nic */
  naKarte?: boolean;
  /** detail kontaktu: u otevřeného označení tlačítko „Zavolal/a jsem“ (a pro super admina „Zrušit označení“), od migrace 062
   *  i bez označení (DovolaniTlacitko, jen když ho přihlášený smí zapsat) */
  smiZapsat?: boolean;
  /** po zápisu hovoru nebo zrušení označení (stránka zavře detail a načte seznam znovu) */
  onDovolano?: (veta: string) => void;
}) {
  const session = useSession();
  const jaSuper = isSuperAdmin(session.role);
  const [data, setData] = useState<KontaktPrehled | null>(null);
  const [nacteno, setNacteno] = useState(false);
  const [okno, setOkno] = useState<null | 'zapis' | 'zrusit'>(null);
  const posledni = useRef(0);
  const nacti = useCallback(() => {
    const muj = ++posledni.current;
    getApi()
      .kontaktPrehled(session.token, kontakt.id)
      .then((p) => {
        if (muj !== posledni.current) return;
        setData(p);
        setNacteno(true);
      })
      .catch(() => {
        // server bez 060 nebo cizí kontakt: panel se neukáže (detail jde dál beze změny)
        if (muj !== posledni.current) return;
        setData(null);
        setNacteno(true);
      });
  }, [session.token, kontakt.id]);
  useEffect(() => {
    setData(null);
    setNacteno(false);
    setOkno(null);
    nacti();
  }, [nacti]);
  if (!nacteno || !data) return null;
  const f = data.fakta ?? {};
  const fakta = radkyFaktu(f, naKarte);
  const p = data.prehled;
  const maText = !!p && (!!p.ted || !!p.klient_chce?.length || !!p.poslali_jsme?.length || !!p.pozor?.length);
  const o = f.oznaceni ?? null;
  // migrace 062: bez otevřeného označení (které přihlášený vidí) tlačítko jako u klienta bez označení; klíče označení z řádku
  // seznamu se nepřenesou (mohou být starší než přehled)
  const bezOznaceni = { ...kontakt, ozn_kategorie: null, ozn_lhuta_do: null, ozn_pokusy: null };
  const dovolatBezOznaceni = !naKarte && smiZapsat && !o && dovolatSmi(bezOznaceni);
  // na kartě ve volání jen když přehled něco říká (stav je na kartě zvlášť)
  if (naKarte && !maText && !o && fakta.length === 0) return null;
  return (
    <div className={`prehled-panel${naKarte ? ' na-karte' : ''}`}>
      <div className="drawer-section-title prehled-nadpis">Přehled klienta</div>
      {o && (
        <div className="prehled-oznaceni">
          <OznaceniBadge kategorie={o.kategorie} />{' '}
          <span>
            mlčí od {datum(o.mlci_od) ?? '—'} · {lhutaText(o.lhuta_do)}
            {o.pokusy > 0 ? ` · nedovoláno ${o.pokusy}×${o.posledni_pokus_at ? ` (naposledy ${datum(o.posledni_pokus_at)})` : ''}` : ''}
            {jaSuper && o.volajici ? ` · volá ${o.volajici}` : ''}
          </span>
          {smiZapsat && (
            <span className="prehled-akce">
              <button type="button" className="pill-btn go sm zavolal-btn" onClick={() => setOkno('zapis')}>
                <AlarmIcon size={14} /> Zavolal/a jsem
              </button>
              {jaSuper && (
                <button type="button" className="pill-btn sm zrusit-ozn-btn" onClick={() => setOkno('zrusit')}>
                  Zrušit označení
                </button>
              )}
            </span>
          )}
        </div>
      )}
      {dovolatBezOznaceni && (
        <div className="prehled-oznaceni prehled-dovolani">
          <span className="muted">Klient není v Označených.</span>
          <span className="prehled-akce">
            <DovolaniTlacitko
              kontakt={bezOznaceni}
              onDovolano={(veta) => {
                if (onDovolano) onDovolano(veta);
                else nacti();
              }}
            />
          </span>
        </div>
      )}
      {fakta.length > 0 && (
        <ul className="prehled-fakta">
          {fakta.map((x) => (
            <li key={x.klic}>
              {x.klic === 'hvězda' ? <HvezdaIcon size={14} /> : null} <span className="prehled-klic">{x.klic}:</span> {x.text}
            </li>
          ))}
        </ul>
      )}
      {maText ? (
        <div className="prehled-text">
          {p?.ted && (
            <section>
              <h4>Teď a další krok</h4>
              <p>{p.ted}</p>
            </section>
          )}
          {!!p?.klient_chce?.length && (
            <section>
              <h4>Co klient chce / napsal</h4>
              <ul>
                {p.klient_chce.map((x, i) => (
                  <li key={i}>
                    <span className="muted">
                      {formatDatumDne(x.datum)} · {ZDROJ[x.zdroj] ?? x.zdroj}:
                    </span>{' '}
                    {x.text}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!!p?.poslali_jsme?.length && (
            <section>
              <h4>Co jsme poslali a slíbili</h4>
              <ul>
                {p.poslali_jsme.map((x, i) => (
                  <li key={i}>
                    <span className="muted">{formatDatumDne(x.datum)}:</span> {x.text}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!!p?.pozor?.length && (
            <section className="prehled-pozor">
              <h4>Pozor</h4>
              <ul>
                {p.pozor.map((x, i) => (
                  <li key={i}>{x.text}</li>
                ))}
              </ul>
            </section>
          )}
          {data.prehled_at && <p className="muted prehled-kdy">automatizace {formatDatumPraha(data.prehled_at)}</p>}
        </div>
      ) : (
        !naKarte && <p className="muted prehled-prazdny">{PREHLED_PRAZDNY}</p>
      )}
      {okno === 'zapis' && o && (
        <DovolaniOkno
          kontakt={kontakt}
          kategorie={o.kategorie}
          lhutaDo={o.lhuta_do}
          pokusy={o.pokusy}
          maHvezdu={!!f.hvezda?.at}
          smiUpravit={kontakt.smi_upravit !== false}
          smiHvezdu={kontakt.smi_upravit !== false}
          onZavrit={() => setOkno(null)}
          onHotovo={(veta) => {
            setOkno(null);
            if (onDovolano) onDovolano(veta);
            else nacti();
          }}
        />
      )}
      {okno === 'zrusit' && o && (
        <ZrusitOznaceniOkno
          kontakt={kontakt}
          onZavrit={() => setOkno(null)}
          onHotovo={(veta) => {
            setOkno(null);
            if (onDovolano) onDovolano(veta);
            else nacti();
          }}
        />
      )}
    </div>
  );
}

