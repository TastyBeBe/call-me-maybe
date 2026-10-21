// VÝBĚR ČASU HOVORU (migrace 050, Albert 21. 10. 2026: „Hey, I'm at work, call me at this time“). Jedno okno pro tři
// místa: Přeplánovat ve volání, Naplánovat hovor v detailu kontaktu a Přesunout v kalendáři. Volající to dělá s telefonem
// u ucha, proto rychlé volby jedním klepnutím (Za hodinu, Dnes 18:00, Zítra 9:00, Zítra 14:00, Za týden), pod nimi den
// a čas, a věta, co přesně se uloží („Zavoláš ve čtvrtek 23. 10. v 15:00 (za 2 dny)“). Čas je vždy pražský jako na
// serveru (src/praha.ts). Kontroly a hlášky jsou stejné jako na serveru (app_zavolat_over_kdy, app_zavolat_poznamka),
// server je hlídá sám; tady se jen nepošle, co by stejně odmítl. Super admin vybere, kdo zavolá (výchozí ten, kdo
// kontaktu volá, jinak on sám); Volající výběr nemá (server mu hovor za jiného odmítne).

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { posunDen, prahaCas, prahaDen, prahaNaIso } from '../praha';
import { ErrorBox, errMsg, formatKdyVeta, formatRelativne, useOkno } from '../ui';

export interface ZavolatVolba {
  /** okamžik hovoru ISO (UTC) pro server */
  kdy: string;
  poznamka: string | null;
  /** kdo zavolá (jen super admin; null = přihlášený) */
  userId: number | null;
}

export interface ZavolatClovek {
  user_id: number;
  display_name: string;
  popis?: string;
}

const HODINA = 3600 * 1000;
const DEN = 24 * HODINA;

/** Okamžik zaokrouhlený nahoru na celých `krok` minut. */
function nahoru(t: number, krok: number): number {
  const k = krok * 60 * 1000;
  return Math.ceil(t / k) * k;
}

interface RychlaVolba {
  popis: string;
  datum: string;
  cas: string;
}

/** Přeplánovat nejdřív za 15 minut (resolve_call po recenzi 21. 10. 2026); kdo chce mluvit hned, hovor dokončí teď. */
export const PREPLANOVAT_NEJDRIV_MIN = 15;
export const HLASKA_15_MINUT = 'Přeplánovat jde nejdřív za 15 minut. Když chce člověk mluvit hned, dokončete hovor teď.';

/**
 * Rychlé volby podle teď (Praha). „Dnes 18:00“ jen do šesti večer. `nejdrivMinut` (Přeplánovat): volby dřív, než je
 * dovolené, se nenabídnou.
 */
export function rychleVolby(ted: number = Date.now(), nejdrivMinut = 0): RychlaVolba[] {
  const dnes = prahaDen(ted);
  const zitra = posunDen(dnes, 1);
  const zaHodinu = nahoru(ted + HODINA, 5);
  // za týden ve stejnou hodinu jako teď (zaokrouhleno na čtvrthodinu), i přes změnu letního času
  const ted15 = nahoru(ted, 15);
  const volby: RychlaVolba[] = [{ popis: 'Za hodinu', datum: prahaDen(zaHodinu), cas: prahaCas(zaHodinu) }];
  if (prahaCas(ted) < '18:00') volby.push({ popis: 'Dnes 18:00', datum: dnes, cas: '18:00' });
  volby.push({ popis: 'Zítra 9:00', datum: zitra, cas: '09:00' });
  volby.push({ popis: 'Zítra 14:00', datum: zitra, cas: '14:00' });
  volby.push({ popis: 'Za týden', datum: posunDen(prahaDen(ted15), 7), cas: prahaCas(ted15) });
  if (nejdrivMinut <= 0) return volby;
  return volby.filter((v) => {
    const iso = prahaNaIso(v.datum, v.cas);
    return iso !== null && new Date(iso).getTime() >= ted + nejdrivMinut * 60 * 1000;
  });
}

/**
 * Stejné kontroly a hlášky jako app_zavolat_over_kdy na serveru (a u Přeplánovat `nejdrivMinut` jako resolve_call);
 * null = v pořádku.
 */
export function chybaCasu(iso: string | null, ted: number = Date.now(), nejdrivMinut = 0): string | null {
  if (!iso) return 'Vyberte den a čas, kdy zavolat.';
  const t = new Date(iso).getTime();
  if (t < ted - 10 * 60 * 1000) return 'Ten čas už je pryč. Vyberte den a čas, který teprve přijde.';
  if (t > ted + 366 * DEN) return 'Hovor jde naplánovat nejvýš rok dopředu.';
  if (nejdrivMinut > 0 && t < ted + nejdrivMinut * 60 * 1000) return HLASKA_15_MINUT;
  return null;
}

export default function ZavolatModal({
  titulek,
  komu,
  uvod,
  vychoziKdy = null,
  vychoziPoznamka = null,
  poznamkaMax = 500,
  poznamkaPopisek = 'Poznámka (nepovinná)',
  poznamkaNapoveda,
  nejdrivMinut = 0,
  lide,
  vychoziKdo = null,
  jaId,
  potvrdit,
  onUlozit,
  onZavrit,
}: {
  titulek: string;
  /** jméno kontaktu v nadpisu */
  komu: string;
  uvod?: ReactNode;
  /** předvyplněný čas (přesun), ISO */
  vychoziKdy?: string | null;
  vychoziPoznamka?: string | null;
  /** 500 v kalendáři (server), 2 000 u Přeplánovat (poznámka z hovoru, do kalendáře jde prvních 500 znaků) */
  poznamkaMax?: number;
  poznamkaPopisek?: string;
  poznamkaNapoveda?: string;
  /** nejdřív za kolik minut (Přeplánovat: 15, resolve_call); 0 = jen pravidla serveru pro kalendář */
  nejdrivMinut?: number;
  /** super admin: lidé pro výběr „Kdo zavolá“ (prázdné = výběr se neukáže) */
  lide?: ZavolatClovek[];
  /** výchozí člověk ve výběru (ten, kdo kontaktu volá); jinak přihlášený */
  vychoziKdo?: number | null;
  /** přihlášený (výchozí volba „Kdo zavolá“, „Zavoláš“ ve větě) */
  jaId: number;
  /** popisek tlačítka: Naplánovat, Přesunout, Přeplánovat a další */
  potvrdit: string;
  /** uloží; chyba (hláška serveru) se ukáže v okně a okno zůstane otevřené */
  onUlozit: (v: ZavolatVolba) => Promise<void>;
  onZavrit: () => void;
}) {
  const [datum, setDatum] = useState(vychoziKdy ? prahaDen(vychoziKdy) : '');
  const [cas, setCas] = useState(vychoziKdy ? prahaCas(vychoziKdy) : '');
  const [poznamka, setPoznamka] = useState(vychoziPoznamka ?? '');
  const vyber = (lide ?? []).length > 0;
  const [kdo, setKdo] = useState<number>(
    vychoziKdo !== null && (lide ?? []).some((p) => p.user_id === vychoziKdo) ? vychoziKdo : jaId
  );
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  // lidi (all_stats) se načítají až s oknem: dokud člověk výběr nezměnil, předvybere se ten, kdo hovor má, jakmile dorazí
  const kdoZmenen = useRef(false);
  useEffect(() => {
    if (!kdoZmenen.current && vychoziKdo !== null && (lide ?? []).some((p) => p.user_id === vychoziKdo)) setKdo(vychoziKdo);
  }, [lide, vychoziKdo]);

  const volby = useMemo(() => rychleVolby(Date.now(), nejdrivMinut), [nejdrivMinut]);
  const dnes = prahaDen(Date.now());
  const iso = datum && cas ? prahaNaIso(datum, cas) : null;
  const kdoJmeno = kdo === jaId ? null : (lide ?? []).find((p) => p.user_id === kdo)?.display_name ?? null;
  const veta = iso
    ? `${kdoJmeno ? `Zavolá ${kdoJmeno}` : 'Zavoláš'} ${formatKdyVeta(iso, dnes)} (${formatRelativne(iso)}).`
    : null;
  const delka = [...poznamka].length;

  const ulozit = async () => {
    const c = chybaCasu(iso, Date.now(), nejdrivMinut);
    if (c) {
      setChyba(c);
      return;
    }
    if (delka > poznamkaMax) {
      setChyba(
        poznamkaMax === 500
          ? 'Poznámka k naplánovanému hovoru může mít nejvýš 500 znaků.'
          : 'Poznámka z hovoru je moc dlouhá: nejvýš 2 000 znaků.'
      );
      return;
    }
    setBusy(true);
    setChyba('');
    try {
      await onUlozit({ kdy: iso!, poznamka: poznamka.trim() || null, userId: vyber && kdo !== jaId ? kdo : null });
    } catch (e) {
      setChyba(errMsg(e));
      setBusy(false);
    }
  };

  const zavrit = () => {
    if (!busy) onZavrit();
  };
  const okno = useRef<HTMLDivElement>(null);
  useOkno(okno, onZavrit, busy);

  return (
    <div className="scrim" onClick={zavrit}>
      <div
        ref={okno}
        className="modal card zavolat-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="zavolat-modal-titulek"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title" id="zavolat-modal-titulek">
          {titulek}
        </h3>
        <p className="zavolat-komu">{komu}</p>
        {uvod && <div className="modal-body zavolat-uvod">{uvod}</div>}
        {nejdrivMinut > 0 && (
          <p className="muted zavolat-nejdriv">Nejdřív za {nejdrivMinut} minut. Kdo chce mluvit hned, s tím hovor dokonči teď.</p>
        )}

        <div className="zavolat-volby" role="group" aria-label="Rychlá volba času">
          {volby.map((v, i) => {
            const zvolena = v.datum === datum && v.cas === cas;
            return (
              <button
                key={v.popis}
                data-autofocus={i === 0 ? true : undefined}
                type="button"
                className={`pill-btn sm zavolat-volba${zvolena ? ' active' : ''}`}
                aria-pressed={zvolena}
                disabled={busy}
                onClick={() => {
                  setDatum(v.datum);
                  setCas(v.cas);
                  setChyba('');
                }}
              >
                {v.popis}
              </button>
            );
          })}
        </div>

        <div className="zavolat-kdy">
          <div className="field">
            <label htmlFor="zavolat-den">Den</label>
            <input
              id="zavolat-den"
              type="date"
              value={datum}
              min={dnes}
              max={posunDen(dnes, 366)}
              disabled={busy}
              onChange={(e) => {
                setDatum(e.target.value);
                setChyba('');
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="zavolat-cas">Čas</label>
            <input
              id="zavolat-cas"
              type="time"
              step={300}
              value={cas}
              disabled={busy}
              onChange={(e) => {
                setCas(e.target.value);
                setChyba('');
              }}
            />
          </div>
        </div>

        {vyber && (
          <div className="field">
            <label htmlFor="zavolat-kdo">Kdo zavolá</label>
            <select
              id="zavolat-kdo"
              value={String(kdo)}
              disabled={busy}
              onChange={(e) => {
                kdoZmenen.current = true;
                setKdo(Number(e.target.value));
              }}
            >
              {(lide ?? []).map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.user_id === jaId ? `Já (${p.display_name})` : p.display_name}
                  {p.popis ? ` · ${p.popis}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <p className={`zavolat-veta${veta ? '' : ' muted'}`} aria-live="polite">
          {veta ?? 'Vyber rychlou volbu, nebo den a čas.'}
        </p>

        <div className="field">
          <label htmlFor="zavolat-poznamka">{poznamkaPopisek}</label>
          <textarea
            id="zavolat-poznamka"
            rows={3}
            maxLength={poznamkaMax}
            value={poznamka}
            disabled={busy}
            placeholder="Třeba: Volat po 15. hodině, chce mluvit s manželkou."
            onChange={(e) => setPoznamka(e.target.value)}
          />
          <span className="muted zavolat-pocet">
            {poznamkaNapoveda ? `${poznamkaNapoveda} · ` : ''}
            {delka} / {poznamkaMax}
          </span>
        </div>

        <ErrorBox>{chyba}</ErrorBox>
        <div className="modal-actions">
          <button type="button" className="pill-btn" onClick={zavrit} disabled={busy}>
            Zpět
          </button>
          <button type="button" className="pill-btn go zavolat-ulozit" onClick={() => void ulozit()} disabled={busy}>
            {busy ? 'Ukládám…' : potvrdit}
          </button>
        </div>
      </div>
    </div>
  );
}
