import { useCallback, useEffect, useState } from 'react';
import { getApi, type Rozvrh, type RozvrhDenVstup, type RozvrhPrehledRadek } from '../api';
import { audio } from '../audio';
import { useSession } from '../auth';
import { isSuperAdmin, roleLabel } from '../roles';
import { DNY, datumKratce, denStav, dnesHlaska, hodin, hovoru, stavHlaska } from '../rozvrh';
import { ConfirmModal, ErrorBox, Spinner, errMsg, formatDateTime } from '../ui';

/**
 * ROZVRH (migrace 042, Albert 18. 10. 2026). Týden pondělí až neděle, ten aktuální; přetočí se sám
 * a stejný rozvrh platí každý týden. Každý den hodiny volání, cíl = hodiny × hovorů za hodinu
 * (číslo posílá server), plnění z call_log. Server rozhoduje sám (rozvrh_get vrací smi_upravit,
 * smi_odemknout a smi_psat_poznamky); tady se jen nenabízí, co by odmítl:
 *   - volající: svůj rozvrh nastaví jednou, pak je zamčený; poznámky ke dnům píše jen on;
 *   - super admin: vidí přehled všech (kdo je pozadu, je první), otevře a změní rozvrh kohokoli
 *     a smí ho volajícímu odemknout, poznámky jen čte.
 */

const HODINY = Array.from({ length: 25 }, (_, i) => i / 2); // 0 až 12 po půlhodinách
const OBNOVA_MS = 120000;

type Navrh = { hodiny: number; od: string }[];

function navrhZ(r: Rozvrh): Navrh {
  return r.dny.map((d) => ({ hodiny: d.hodiny, od: d.od ?? '' }));
}

function StavKarta({ r, ja, jaSuper }: { r: Rozvrh; ja: boolean; jaSuper: boolean }) {
  const h = stavHlaska(r, ja, jaSuper);
  const dnes = dnesHlaska(r, ja);
  return (
    <div className={`card rozvrh-alert ${h.ton}`} role="status">
      <p className="rozvrh-alert-titulek">{h.titulek}</p>
      <p className="rozvrh-alert-text">{h.text}</p>
      {dnes && <p className="rozvrh-alert-dnes">{dnes}</p>}
    </div>
  );
}

function Prehled({
  radky,
  vybrany,
  onVyber,
}: {
  radky: RozvrhPrehledRadek[];
  vybrany: number;
  onVyber: (id: number) => void;
}) {
  if (radky.length === 0) return null;
  return (
    <div className="card panel" style={{ marginBottom: 20 }}>
      <p className="panel-title">všichni volající tento týden · kdo je pozadu, je nahoře</p>
      <div className="panel-body">
        {radky.map((p) => {
          const s = p.souhrn;
          const ton = s.stav === 'pozadu' ? 'zle' : s.stav === 'bez_rozvrhu' ? 'info' : 'dobre';
          const stav =
            s.stav === 'pozadu'
              ? `pozadu o ${hovoru(s.rozdil)}`
              : s.stav === 'napred'
                ? `napřed o ${hovoru(s.rozdil)}`
                : s.stav === 'v_planu'
                  ? 'v plánu'
                  : 'bez rozvrhu';
          return (
            <button
              key={p.user_id}
              type="button"
              className={`rozvrh-clovek${vybrany === p.user_id ? ' vybrany' : ''}`}
              onClick={() => onVyber(p.user_id)}
            >
              <span className="u-name">{p.display_name}</span>
              <span className={`badge rozvrh-ton ${ton}`}>{stav}</span>
              {s.stav === 'pozadu' && <span className="muted">asi {hodin(s.rozdil_hodiny)}</span>}
              <span className="spacer" />
              {p.nastaveny && (
                <span className="muted rozvrh-dnes-kratce">
                  dnes {s.dnes_hovory} z {s.dnes_cil}
                </span>
              )}
              {p.poznamek > 0 && <span className="badge neutral">poznámky: {p.poznamek}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function RozvrhPage() {
  const session = useSession();
  const isSuper = isSuperAdmin(session.role);
  const [vybrany, setVybrany] = useState<number>(session.user_id);
  const [r, setR] = useState<Rozvrh | null>(null);
  const [prehled, setPrehled] = useState<RozvrhPrehledRadek[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [navrh, setNavrh] = useState<Navrh | null>(null); // úprava rozvrhu
  const [potvrdit, setPotvrdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [akceChyba, setAkceChyba] = useState('');
  const [hotovo, setHotovo] = useState('');

  const [poznDen, setPoznDen] = useState<string | null>(null); // datum dne, kterému se píše poznámka
  const [poznText, setPoznText] = useState('');

  const ja = vybrany === session.user_id;

  const nacti = useCallback(
    async (tiche = false) => {
      if (!tiche) setLoading(true);
      try {
        const api = getApi();
        const [rv, pr] = await Promise.all([
          api.rozvrh(session.token, vybrany === session.user_id ? null : vybrany),
          isSuper ? api.prehledRozvrhu(session.token) : Promise.resolve([] as RozvrhPrehledRadek[]),
        ]);
        setR(rv);
        setPrehled(pr);
        setError('');
      } catch (e) {
        if (!tiche) setError(errMsg(e));
      } finally {
        if (!tiche) setLoading(false);
      }
    },
    [session.token, session.user_id, vybrany, isSuper]
  );

  useEffect(() => {
    setNavrh(null);
    setPoznDen(null);
    setHotovo('');
    setAkceChyba('');
    void nacti();
    // týden se přetočí a hovory přibývají: tiché obnovení, dokud je stránka otevřená
    const timer = setInterval(() => void nacti(true), OBNOVA_MS);
    return () => clearInterval(timer);
  }, [nacti]);

  const vsichni: { id: number; jmeno: string; role: string }[] = isSuper
    ? [
        { id: session.user_id, jmeno: `Já (${session.display_name})`, role: '' },
        ...prehled
          .filter((p) => p.user_id !== session.user_id)
          .map((p) => ({ id: p.user_id, jmeno: p.display_name, role: roleLabel(p.role) })),
      ]
    : [];

  const zacniUpravu = () => {
    if (!r) return;
    setNavrh(navrhZ(r));
    setAkceChyba('');
    setHotovo('');
  };

  const ulozit = async () => {
    if (!r || !navrh) return;
    setBusy(true);
    setAkceChyba('');
    try {
      const dny: RozvrhDenVstup[] = navrh.map((d, i) => ({
        den: i + 1,
        hodiny: d.hodiny,
        od: d.hodiny > 0 && d.od ? d.od : null,
      }));
      const nove = await getApi().ulozitRozvrh(session.token, r.user_id, dny);
      setR(nove);
      setNavrh(null);
      setPotvrdit(false);
      setHotovo(ja && !isSuper ? 'Rozvrh je uložený a zamčený.' : 'Rozvrh je uložený.');
      audio.play('success');
      if (isSuper) void nacti(true);
    } catch (e) {
      setAkceChyba(errMsg(e));
      setPotvrdit(false);
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };

  const odemknout = async () => {
    if (!r) return;
    setBusy(true);
    setAkceChyba('');
    try {
      setR(await getApi().odemknoutRozvrh(session.token, r.user_id));
      setHotovo(`${r.display_name} si teď může rozvrh ještě jednou nastavit.`);
      audio.play('success');
    } catch (e) {
      setAkceChyba(errMsg(e));
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };

  const ulozitPoznamku = async (datum: string, text: string) => {
    setBusy(true);
    setAkceChyba('');
    try {
      setR(await getApi().poznamkaRozvrhu(session.token, datum, text));
      setPoznDen(null);
      setPoznText('');
      audio.play('success');
    } catch (e) {
      setAkceChyba(errMsg(e));
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };

  const cilNavrhu = navrh && r ? navrh.reduce((a, d) => a + Math.round(d.hodiny * r.hovoru_za_hodinu), 0) : 0;

  return (
    <div>
      <p className="eyebrow">
        {r ? `týden ${datumKratce(r.tyden_od)} až ${datumKratce(r.tyden_do)}` : 'týden pondělí až neděle'}
      </p>
      <h1 className="page-title">Rozvrh</h1>

      {isSuper && (
        <>
          <Prehled radky={prehled} vybrany={vybrany} onVyber={setVybrany} />
          {vsichni.length > 1 && (
            <div className="field" style={{ maxWidth: 360 }}>
              <label htmlFor="rozvrh-kdo">Čí rozvrh</label>
              <select id="rozvrh-kdo" value={String(vybrany)} onChange={(e) => setVybrany(Number(e.target.value))}>
                {vsichni.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.jmeno}
                    {p.role ? ` · ${p.role}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      <ErrorBox>{error}</ErrorBox>
      {loading && !r && <Spinner label="Načítám rozvrh…" />}

      {r && (
        <>
          {!ja && <h2 className="rozvrh-kdo">{r.display_name}</h2>}
          <StavKarta r={r} ja={ja} jaSuper={isSuper} />
          <ErrorBox>{akceChyba}</ErrorBox>
          {hotovo && <div className="info-box">{hotovo}</div>}

          {navrh ? (
            <div className="card panel rozvrh-uprava">
              <p className="panel-title">
                {r.nastaveny ? 'upravit rozvrh' : 'nastavit rozvrh'} · {r.hovoru_za_hodinu} hovorů za hodinu
              </p>
              <div className="panel-body">
                {navrh.map((d, i) => (
                  <div key={i} className="rozvrh-uprava-den">
                    <span className="rozvrh-den-jmeno">{DNY[i]}</span>
                    <label className="sr-only" htmlFor={`rh-${i}`}>
                      Hodiny {DNY[i]}
                    </label>
                    <select
                      id={`rh-${i}`}
                      value={String(d.hodiny)}
                      onChange={(e) => {
                        const h = Number(e.target.value);
                        setNavrh(navrh.map((x, j) => (j === i ? { hodiny: h, od: h > 0 ? x.od : '' } : x)));
                      }}
                    >
                      {HODINY.map((h) => (
                        <option key={h} value={String(h)}>
                          {h === 0 ? (ja ? 'nevolám' : 'nevolá') : hodin(h)}
                        </option>
                      ))}
                    </select>
                    <label className="rozvrh-od">
                      od
                      <input
                        type="time"
                        step={900}
                        value={d.od}
                        disabled={d.hodiny === 0}
                        onChange={(e) => setNavrh(navrh.map((x, j) => (j === i ? { ...x, od: e.target.value } : x)))}
                      />
                    </label>
                    <span className="muted rozvrh-cil">
                      {d.hodiny > 0 ? hovoru(Math.round(d.hodiny * r.hovoru_za_hodinu)) : 'volno'}
                    </span>
                  </div>
                ))}
                <p className="muted" style={{ margin: '10px 0' }}>
                  Za týden {hovoru(cilNavrhu)}. Čas „od“ je nepovinný, slouží k připomínce.
                </p>
                {ja && !isSuper && (
                  <p className="rozvrh-varovani">
                    Po uložení už rozvrh nezměníš. Změnit ho může jen super admin.
                  </p>
                )}
                <div className="edit-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    className="pill-btn go"
                    type="button"
                    disabled={busy}
                    onClick={() => (ja && !isSuper ? setPotvrdit(true) : void ulozit())}
                  >
                    {busy ? 'Ukládám…' : 'Uložit rozvrh'}
                  </button>
                  <button className="pill-btn" type="button" disabled={busy} onClick={() => setNavrh(null)}>
                    Zrušit
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rozvrh-akce">
              {r.smi_upravit && (
                <button className="pill-btn go" type="button" onClick={zacniUpravu}>
                  {r.nastaveny ? 'Upravit rozvrh' : 'Nastavit rozvrh'}
                </button>
              )}
              {r.smi_odemknout && (
                <button className="pill-btn" type="button" disabled={busy} onClick={() => void odemknout()}>
                  Povolit volajícímu nastavit ho znovu
                </button>
              )}
              {r.nastaveny && (
                <p className="muted rozvrh-kdo-nastavil">
                  {r.zamceno && !r.smi_upravit && 'Rozvrh je zamčený, změnit ho může jen super admin. '}
                  {!r.zamceno && r.nastaveny && ja && !isSuper && 'Super admin ti povolil nastavit rozvrh ještě jednou. '}
                  Nastavil(a) {r.nastavil ?? 'neznámo kdo'} {formatDateTime(r.nastaveno_at)}
                  {r.zmenil ? `, naposledy změnil(a) ${r.zmenil} ${formatDateTime(r.zmeneno_at)}` : ''}.
                </p>
              )}
            </div>
          )}

          <div className="rozvrh-dny">
            {r.dny.map((d) => {
              const st = denStav(d);
              const pise = poznDen === d.datum;
              return (
                <div key={d.datum} className={`card rozvrh-den${d.dnes ? ' dnes' : ''}`}>
                  <div className="rozvrh-den-hlava">
                    <span className="rozvrh-den-jmeno">
                      {DNY[d.den - 1]} <span className="muted">{datumKratce(d.datum)}</span>
                      {d.dnes && <span className="badge yellow" style={{ marginLeft: 8 }}>dnes</span>}
                    </span>
                    <span className="rozvrh-den-plan">
                      {d.hodiny > 0
                        ? `${hodin(d.hodiny)}${d.od ? ` od ${d.od}` : ''}${d.pred_rozvrhem ? '' : ` · cíl ${d.cil}`}`
                        : 'nevolá se'}
                    </span>
                    <span className="rozvrh-den-hovory">
                      hovorů: <strong>{d.hovory}</strong>
                    </span>
                    <span className={`badge rozvrh-ton ${st.ton}`}>{st.text}</span>
                  </div>
                  {d.poznamka && !pise && (
                    <p className="rozvrh-poznamka">
                      <span className="muted">Poznámka:</span> {d.poznamka}
                    </p>
                  )}
                  {r.smi_psat_poznamky && !pise && (
                    <button
                      type="button"
                      className="pill-btn sm tag rozvrh-pozn-btn"
                      onClick={() => {
                        setPoznDen(d.datum);
                        setPoznText(d.poznamka ?? '');
                      }}
                    >
                      {d.poznamka ? 'Upravit poznámku' : 'Napsat poznámku'}
                    </button>
                  )}
                  {pise && (
                    <div className="rozvrh-pozn-form">
                      <label className="sr-only" htmlFor={`pz-${d.datum}`}>
                        Poznámka k {DNY[d.den - 1]}
                      </label>
                      <textarea
                        id={`pz-${d.datum}`}
                        rows={3}
                        maxLength={1000}
                        value={poznText}
                        placeholder="Třeba: Nemohl(a) jsem volat, protože…"
                        onChange={(e) => setPoznText(e.target.value)}
                      />
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                        <button
                          type="button"
                          className="pill-btn go sm"
                          disabled={busy}
                          onClick={() => void ulozitPoznamku(d.datum, poznText)}
                        >
                          Uložit poznámku
                        </button>
                        {d.poznamka && (
                          <button
                            type="button"
                            className="pill-btn warn sm"
                            disabled={busy}
                            onClick={() => void ulozitPoznamku(d.datum, '')}
                          >
                            Smazat
                          </button>
                        )}
                        <button type="button" className="pill-btn sm" disabled={busy} onClick={() => setPoznDen(null)}>
                          Zrušit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="muted" style={{ marginTop: 12 }}>
            {/* migrace 050 (Albert 21. 10. 2026): i nerelevantní a přeplánovaný hovor je práce volajícího, do Rozvrhu se
                počítá (app_rozvrh_stav bere každý řádek call_log). ⚠ NAHRAZUJE výčet jen tří výsledků. */}
            Hovor je každý zapsaný výsledek ve volání (nedovoláno, odmítnuto, zájem, nerelevantní, přeplánováno). Cíl je {r.hovoru_za_hodinu} hovorů
            za hodinu volání. Týden se v pondělí přetočí sám a rozvrh platí dál.
          </p>
        </>
      )}

      {potvrdit && (
        <ConfirmModal
          title="Uložit rozvrh?"
          confirmLabel="Uložit a zamknout"
          confirmClass="go"
          busy={busy}
          onConfirm={() => void ulozit()}
          onCancel={() => setPotvrdit(false)}
        >
          Po uložení už rozvrh nezměníš. Když bude potřeba něco změnit, řekni super adminovi.
        </ConfirmModal>
      )}
    </div>
  );
}
