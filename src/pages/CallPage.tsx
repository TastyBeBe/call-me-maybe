import { useCallback, useEffect, useRef, useState } from 'react';
import { getApi, type Kontakt, type Rating, type Segment } from '../api';
import { audio } from '../audio';
import { useSession } from '../auth';
import { loadCallSegment, saveCallSegment, segmentOf } from '../segment';
import { tipArchitekt } from '../tipArchitekt';
import {
  ConfirmModal,
  ErrorBox,
  flagHint,
  FLAG_LABELS,
  PhoneLinks,
  SEGMENT_AKUZATIV,
  SEGMENT_MNOZNE,
  SegmentSwitch,
  Spinner,
  StatusBadge,
  errMsg,
  obratArchitekta,
  zdrojTelefonu,
} from '../ui';
import {
  ArrowDownIcon,
  CheckIcon,
  CompassIcon,
  FlagIcon,
  PartyIcon,
  PhoneOffIcon,
  StarIcon,
  ThumbsDownIcon,
} from '../icons';

type Modal = null | 'odmitnout' | 'prepnout';

/** Hláška, když se čistou kartu nepodaří vrátit do fronty (docs/ARCHITEKTI.md 9.2). */
const NEVRACENO = 'Kontakt se nepodařilo vrátit do fronty. Zámek sám vyprší do 2 hodin.';

export default function CallPage() {
  const session = useSession();
  // Koho voláš (migrace 028): ve stavu kvůli vykreslení, v refu kvůli loadNext. Segment
  // NESMÍ do závislostí loadNext: efekt níž by pak při každém kliku na přepínač vzal
  // novou kartu a starou nechal zamčenou 2 h (kontrola 75).
  const [segment, setSegment] = useState<Segment>(loadCallSegment);
  const segmentRef = useRef<Segment>(segment);
  // Počítadlo požadavků: odpověď, která dorazí po přepnutí, se zahodí a její zámek vrátí.
  const reqId = useRef(0);
  const doneId = useRef(0);
  const shownId = useRef<number | null>(null);
  const staleIds = useRef<number[]>([]);
  const [kontakt, setKontakt] = useState<Kontakt | null>(null);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<Modal>(null);

  // formulář "Mají zájem"
  const [showZajem, setShowZajem] = useState(false);
  const [cenaWeb, setCenaWeb] = useState('');
  const [cenaHosting, setCenaHosting] = useState('');
  const [email, setEmail] = useState('');
  const [rating, setRating] = useState<Rating | ''>('');
  const [note, setNote] = useState('');
  // Kliknul na číslo (tel:). Karta je pak rozdělaná: přepnutí segmentu ji tiše nevrátí
  // a „Přepnout hned“ nabídne zapsat Nedovoláno (audit APP-3).
  const [vytoceno, setVytoceno] = useState(false);

  const loadNext = useCallback(async (hlaska = '') => {
    const my = ++reqId.current;
    const seg = segmentRef.current;
    /** Vrátí do fronty karty, které přišly pozdě (po přepnutí). Tu zobrazenou nikdy. */
    const vratitZahozene = (ids: number[]) => {
      for (const id of ids) {
        if (id === shownId.current) continue;
        void getApi()
          .returnContact(session.token, id)
          .catch(() => {
            // zámek sám vyprší do 2 hodin
          });
      }
    };
    setLoading(true);
    setError('');
    setWarning('');
    setEmpty(false);
    setShowZajem(false);
    setModal(null);
    setCenaWeb('');
    setCenaHosting('');
    setRating('');
    setNote('');
    setVytoceno(false);
    let next: Kontakt | null = null;
    try {
      next = await getApi().nextContact(session.token, seg);
      if (my !== reqId.current) {
        // Mezitím se přepnulo (nebo načetlo znovu): odpověď zahodit a zámek vrátit. Když
        // novější požadavek ještě běží, počká se na něj: ve stejném segmentu by mohl dostat
        // TENTÝŽ kontakt a vrácení by mu ho odemklo pod rukama.
        if (next) {
          if (doneId.current === reqId.current) vratitZahozene([next.id]);
          else staleIds.current.push(next.id);
        }
        return;
      }
      shownId.current = next ? next.id : null;
      if (!next) {
        setKontakt(null);
        setEmpty(true);
        if (hlaska) setWarning(hlaska);
      } else {
        setKontakt(next);
        setEmail(next.email ?? '');
        const cizi =
          next.lock_by !== null && next.lock_by !== session.user_id
            ? 'Pozor: kontakt měl zámek od jiného volajícího (starší než 2 h) — teď je zamčený pro tebe.'
            : '';
        setWarning([hlaska, cizi].filter(Boolean).join(' '));
      }
    } catch (e) {
      if (my !== reqId.current) return;
      shownId.current = null;
      setKontakt(null);
      setError(errMsg(e));
      if (hlaska) setWarning(hlaska);
      audio.play('error');
    } finally {
      if (my === reqId.current) {
        doneId.current = my;
        setLoading(false);
        const zahozene = staleIds.current;
        staleIds.current = [];
        vratitZahozene(zahozene);
      }
    }
  }, [session.token, session.user_id]);

  useEffect(() => {
    void loadNext();
  }, [loadNext]);

  // Karta je rozdělaná, když je otevřený formulář zájmu, je napsaná poznámka nebo volající
  // klikl na číslo (9.2, audit APP-3). Vytočenou kartu server do 30 minut vrátit pustí,
  // takže tichému vrácení (a kolegovi, který by tomu člověku hned volal znovu) brání appka.
  const rozdelano = showZajem || note.trim() !== '' || vytoceno;

  /** Vrátit tuhle kartu do fronty a vzít další z aktuálního segmentu. */
  const prepnoutHned = async () => {
    const id = kontakt?.id;
    setBusy(true);
    let hlaska = '';
    try {
      if (id !== undefined) {
        try {
          await getApi().returnContact(session.token, id);
        } catch {
          hlaska = NEVRACENO;
        }
      }
    } finally {
      setBusy(false);
    }
    await loadNext(hlaska);
  };

  const zvolitSegment = (s: Segment) => {
    if (busy || s === segmentRef.current) return;
    segmentRef.current = s;
    setSegment(s);
    saveCallSegment(s);
    if (!kontakt || loading) {
      // bez karty (načítání, prázdná fronta, chyba): hned další v novém segmentu
      void loadNext();
      return;
    }
    if (segmentOf(kontakt) === s) return; // zpátky na segment karty: nic se neděje
    if (!rozdelano) void prepnoutHned(); // čistá karta: vrátit a vzít další
    // rozdělaná karta: platí od dalšího kontaktu (žlutá cedulka s „Přepnout hned")
  };

  const hlavicka = <SegmentSwitch value={segment} onChange={zvolitSegment} disabled={busy} />;

  const resolve = async (outcome: 'nedovolano' | 'odmitnuto' | 'zajem') => {
    if (!kontakt) return;
    setBusy(true);
    setError('');
    try {
      await getApi().resolveCall(session.token, {
        kontakt_id: kontakt.id,
        outcome,
        cena_web: outcome === 'zajem' ? cenaWeb : null,
        cena_hosting: outcome === 'zajem' ? cenaHosting : null,
        note: note.trim() || null,
        rating: outcome === 'zajem' ? rating || null : null,
        email: outcome === 'zajem' ? email.trim() || null : null,
      });
      audio.play('success');
      await loadNext();
    } catch (e) {
      const msg = errMsg(e);
      if (/zamk|zámek|lock|relace/i.test(msg)) {
        setWarning(msg);
      } else {
        setError(msg);
      }
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };

  const zajemValid = cenaWeb.trim() !== '' && cenaHosting.trim() !== '' && rating !== '';

  // Poznámka je VOLITELNÁ (Albert 2026-09-23). Do té doby se při prázdné poznámce
  // otevřelo potvrzovací okno „Opravdu bez poznámky?" — u klienta, který si jen řekl
  // o náhled a nic dalšího nechtěl, to byl krok navíc a nic nepřidával.
  const submitZajem = () => {
    if (!zajemValid) return;
    void resolve('zajem');
  };

  // Bez karty eyebrow říká zvolený segment; s kartou segment KARTY (rozdělaná chata po
  // přepnutí na architekty je pořád chata, revize 28. 9.).
  const eyebrow = `volání · ${SEGMENT_MNOZNE[kontakt && !loading ? segmentOf(kontakt) : segment]}`;

  if (loading) {
    return (
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title">Volání</h1>
        {hlavicka}
        {warning && <div className="info-box">{warning}</div>}
        <Spinner label="Hledám další kontakt…" />
      </div>
    );
  }

  if (empty) {
    const arch = segment === 'architekt';
    return (
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title">Volání</h1>
        {hlavicka}
        {warning && <div className="info-box">{warning}</div>}
        <div className="card empty-state">
          <div className="big-emoji">{arch ? <CompassIcon size={56} /> : <PartyIcon size={56} />}</div>
          {arch ? (
            <>
              <h2>Architekti jsou obvolaní.</h2>
              <p className="muted">
                Teď není žádný architekt k obvolání. Buď jsou všichni obvolaní, nebo je má kolega
                rozdělané (zámek platí 2 hodiny).
              </p>
            </>
          ) : (
            <>
              <h2>Fronta je prázdná!</h2>
              <p className="muted">
                Žádný kontakt k obvolání. Dej si kafe, nebo mrkni na svoje statistiky.
              </p>
            </>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="pill-btn hot" onClick={() => void loadNext()}>
              Zkusit znovu
            </button>
            <button className="pill-btn" onClick={() => zvolitSegment(arch ? 'chata' : 'architekt')}>
              {arch ? 'Volat chaty' : 'Volat architekty'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!kontakt) {
    return (
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title">Volání</h1>
        {hlavicka}
        {warning && <div className="info-box">{warning}</div>}
        <ErrorBox>{error || 'Něco se pokazilo.'}</ErrorBox>
        <button className="pill-btn hot" onClick={() => void loadNext()}>
          Zkusit znovu
        </button>
      </div>
    );
  }

  const hasWeb = !!(kontakt.web && kontakt.web.trim());
  const architekt = segmentOf(kontakt) === 'architekt';
  const obrat = obratArchitekta(kontakt.dph_osobni, kontakt.dph_firma);
  const cekaPrepnuti = segmentOf(kontakt) !== segment;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <p className="eyebrow">
        {eyebrow} · kontakt #{kontakt.id}
      </p>
      <h1 className="page-title">
        Zavolej jim <ArrowDownIcon size={26} />
      </h1>
      {hlavicka}

      {cekaPrepnuti && (
        <div className="info-box">
          Po tomhle hovoru dostaneš {SEGMENT_AKUZATIV[segment]}.{' '}
          <button className="pill-btn sm" disabled={busy} onClick={() => setModal('prepnout')}>
            Přepnout hned
          </button>
        </div>
      )}
      {warning && <div className="info-box">{warning}</div>}
      <ErrorBox>{error}</ErrorBox>

      <div className={`card call-card${architekt ? ' seg-architekt' : ''}`}>
        <h2 className="call-name">
          {architekt ? kontakt.name || kontakt.firma || '(beze jména)' : kontakt.name || '(beze jména)'}
        </h2>
        {architekt && kontakt.name && kontakt.firma && <p className="call-sub">{kontakt.firma}</p>}

        {kontakt.flag_kind && (
          <div className="call-flag">
            <div className="call-flag-head">
              <FlagIcon size={16} /> <strong>{FLAG_LABELS[kontakt.flag_kind]}</strong>
            </div>
            <p>{flagHint(kontakt.flag_kind, architekt ? 'architekt' : 'chata')}</p>
            {kontakt.flag_note && <p className="flag-note">{kontakt.flag_note}</p>}
          </div>
        )}

        <div className="call-row">
          <span className="k">telefon</span>
          <PhoneLinks phone={kontakt.phone} onDial={() => setVytoceno(true)} />
        </div>

        {architekt ? (
          <>
            <div className="call-row">
              <span className="k">e-mail</span>
              {kontakt.email ? (
                <a href={`mailto:${kontakt.email}`}>{kontakt.email}</a>
              ) : (
                <span className="badge yellow">nemáme, zjisti</span>
              )}
            </div>
            <div className="call-row">
              <span className="k">město</span>
              {kontakt.mesto ? <span>{kontakt.mesto}</span> : <span className="muted">nezjištěno</span>}
            </div>
            <div className="call-row">
              <span className="k">web</span>
              {hasWeb ? (
                <a href={kontakt.web!} target="_blank" rel="noreferrer">
                  {kontakt.web}
                </a>
              ) : (
                <span className="badge yellow">web nenalezen v registru</span>
              )}
            </div>
            {/* Albert 3. 10. 2026 (APP-8, migrace 037): volající IČO architekta nevidí, jen jestli
                vydělává víc, podle veřejné registrace k DPH. ⚠ NAHRAZUJE dva řádky s IČO
                (osobní a ateliéru) a šedou poznámku o DPH ateliéru. */}
            <div className="call-row">
              <span className="k">obrat</span>
              {obrat ? <span>{obrat}</span> : <span className="muted">nezjištěno</span>}
            </div>
            <div className="call-row">
              <span className="k">číslo máme z</span>
              <span>{zdrojTelefonu(kontakt.zdroj_telefonu)}</span>
            </div>
          </>
        ) : (
          <>
            <div className="call-row">
              <span className="k">web</span>
              {hasWeb ? (
                <a href={kontakt.web!} target="_blank" rel="noreferrer">
                  {kontakt.web}
                </a>
              ) : (
                <span className="badge yellow">nemá web</span>
              )}
            </div>

            {kontakt.email && (
              <div className="call-row">
                <span className="k">e-mail</span>
                <a href={`mailto:${kontakt.email}`}>{kontakt.email}</a>
              </div>
            )}
          </>
        )}

        <div className="call-row">
          <span className="k">status</span>
          <StatusBadge status={kontakt.status} />
          {kontakt.last_caller && (
            <span className="muted" style={{ fontSize: 13 }}>
              naposledy volal/a {kontakt.last_caller}
            </span>
          )}
        </div>

        {kontakt.note && (
          <>
            <div className="call-row" style={{ marginTop: 10 }}>
              <span className="k">poznámky</span>
            </div>
            <div className="note-history">{kontakt.note}</div>
          </>
        )}

        {!showZajem && (
          <div className="outcome-row">
            <button className="pill-btn" disabled={busy} onClick={() => void resolve('nedovolano')}>
              <PhoneOffIcon size={18} /> Nedovoláno
            </button>
            <button className="pill-btn warn" disabled={busy} onClick={() => setModal('odmitnout')}>
              <ThumbsDownIcon size={18} /> Odmítnuto
            </button>
            <button className="pill-btn go" disabled={busy} onClick={() => setShowZajem(true)}>
              <StarIcon size={18} /> Mají zájem
            </button>
          </div>
        )}

        {showZajem && (
          <div className="zajem-form">
            <p className="eyebrow">mají zájem — vyplň detaily</p>
            <div className="form-grid">
              <div className="field">
                <label>
                  Cena webu <span className="req">*</span>
                </label>
                <input
                  value={cenaWeb}
                  onChange={(e) => setCenaWeb(e.target.value)}
                  placeholder={architekt ? 'např. 6500' : 'např. 4900'}
                  autoFocus
                />
              </div>
              <div className="field">
                <label>
                  Cena hostingu <span className="req">*</span>
                </label>
                <input
                  value={cenaHosting}
                  onChange={(e) => setCenaHosting(e.target.value)}
                  placeholder={architekt ? 'např. 1000/rok' : 'např. 190/měs'}
                />
              </div>
            </div>
            <div className="field">
              <label>E-mail klienta (ověř po telefonu)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="klient@email.cz"
              />
            </div>
            <div className="field">
              <label>
                Známka zájmu <span className="req">*</span>
              </label>
              <div className="segmented">
                {(['A', 'B', 'C'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={rating === r ? 'active' : ''}
                    onClick={() => setRating(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <span className="muted" style={{ fontSize: 12.5 }}>
                A = žhaví · B = zájem · C = chtějí, ale vlažně
              </span>
            </div>
            <div className="field">
              <label>Poznámka (nepovinná)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Co říkali? Na čem jste se domluvili? Když nic navíc nechtěli, nech prázdné."
              />
            </div>
            <div className="outcome-row">
              <button className="pill-btn" disabled={busy} onClick={() => setShowZajem(false)}>
                Zpět
              </button>
              <button className="pill-btn go" disabled={busy || !zajemValid} onClick={submitZajem}>
                {busy ? (
                  'Ukládám…'
                ) : (
                  <>
                    <CheckIcon size={18} /> Uložit a další
                  </>
                )}
              </button>
            </div>
            {!zajemValid && (
              <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                Vyplň cenu webu, cenu hostingu a známku zájmu.
              </p>
            )}
          </div>
        )}

        {!showZajem && (
          <div className="field" style={{ marginTop: 16, marginBottom: 0 }}>
            <label>Poznámka k hovoru (uloží se s výsledkem)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="volitelné…"
            />
          </div>
        )}

        {/* Scénář až pod tlačítky výsledku a poznámkou: nad nimi odsouval tlačítka pod okraj
            obrazovky (na 1280×900 na 1 230 px, na mobilu skoro 1 900 px; revize 28. 9.).
            Rozbalený, dá se sbalit. */}
        {architekt && (
          <details className="call-hint" open>
            <summary className="call-hint-head">
              <CompassIcon size={16} /> Tip pro hovor
            </summary>
            {tipArchitekt(kontakt.zdroj_telefonu).map((b) => (
              <p key={b.nadpis}>
                {b.nadpis && <strong>{b.nadpis}: </strong>}
                {b.text}
              </p>
            ))}
          </details>
        )}
      </div>

      {modal === 'odmitnout' && (
        <ConfirmModal
          title="Opravdu odmítnuto?"
          confirmLabel="Ano, odmítli"
          confirmClass="warn"
          busy={busy}
          onCancel={() => setModal(null)}
          onConfirm={() => {
            setModal(null);
            void resolve('odmitnuto');
          }}
        >
          Kontakt se označí jako <b>odmítnuto</b> a už mu nikdy nebudeme volat.
        </ConfirmModal>
      )}

      {modal === 'prepnout' && !vytoceno && (
        <ConfirmModal
          title="Přepnout hned?"
          confirmLabel="Ano, přepnout"
          cancelLabel="Dokončím hovor"
          confirmClass="hot"
          busy={busy}
          onCancel={() => setModal(null)}
          onConfirm={() => {
            setModal(null);
            void prepnoutHned();
          }}
        >
          Poznámka se neuloží a tenhle kontakt se vrátí do fronty pro ostatní.
        </ConfirmModal>
      )}

      {/* Vytočená karta (audit APP-3): doporučená cesta je zapsat Nedovoláno. Hovor se uloží
          i s poznámkou, kolega tomu člověku hned znovu nezavolá a další kontakt už přijde
          z nového segmentu. Vrácení bez zápisu zůstává jako vědomá volba. */}
      {modal === 'prepnout' && vytoceno && (
        <ConfirmModal
          title="Přepnout hned?"
          confirmLabel="Zapsat Nedovoláno"
          cancelLabel="Dokončím hovor"
          confirmClass="hot"
          busy={busy}
          onCancel={() => setModal(null)}
          onConfirm={() => {
            setModal(null);
            void resolve('nedovolano');
          }}
        >
          <p style={{ marginTop: 0 }}>
            Číslo už jsi vytočil/a. Nikdo to nevzal? Zapiš <b>Nedovoláno</b>: hovor se uloží i s poznámkou,
            kolega tomu člověku hned znovu nezavolá a další kontakt dostaneš z nového segmentu.
          </p>
          <button
            className="pill-btn sm"
            disabled={busy}
            onClick={() => {
              setModal(null);
              void prepnoutHned();
            }}
          >
            Přepnout bez zápisu
          </button>
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
            Bez zápisu se poznámka neuloží a kontakt se vrátí do fronty pro ostatní.
          </p>
        </ConfirmModal>
      )}

    </div>
  );
}
