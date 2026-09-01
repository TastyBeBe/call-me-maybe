import { useCallback, useEffect, useState } from 'react';
import { getApi, type Kontakt, type Rating } from '../api';
import { useSession } from '../auth';
import {
  ConfirmModal,
  ErrorBox,
  PhoneLinks,
  Spinner,
  StatusBadge,
  errMsg,
} from '../ui';
import {
  ArrowDownIcon,
  CheckIcon,
  PartyIcon,
  PhoneOffIcon,
  StarIcon,
  ThumbsDownIcon,
} from '../icons';

type Modal = null | 'odmitnout' | 'bez-poznamky';

export default function CallPage() {
  const session = useSession();
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

  const loadNext = useCallback(async () => {
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
    try {
      const next = await getApi().nextContact(session.token);
      if (!next) {
        setKontakt(null);
        setEmpty(true);
      } else {
        setKontakt(next);
        setEmail(next.email ?? '');
        if (next.lock_by !== null && next.lock_by !== session.user_id) {
          setWarning(
            'Pozor: kontakt měl zámek od jiného volajícího (starší než 2 h) — teď je zamčený pro tebe.'
          );
        }
      }
    } catch (e) {
      setKontakt(null);
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [session.token, session.user_id]);

  useEffect(() => {
    void loadNext();
  }, [loadNext]);

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
      await loadNext();
    } catch (e) {
      const msg = errMsg(e);
      if (/zamk|zámek|lock|relace/i.test(msg)) {
        setWarning(msg);
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const zajemValid = cenaWeb.trim() !== '' && cenaHosting.trim() !== '' && rating !== '';

  const submitZajem = () => {
    if (!zajemValid) return;
    if (!note.trim()) {
      setModal('bez-poznamky');
      return;
    }
    void resolve('zajem');
  };

  if (loading) {
    return (
      <div>
        <h1 className="page-title">Volání</h1>
        <Spinner label="Hledám další kontakt…" />
      </div>
    );
  }

  if (empty) {
    return (
      <div>
        <h1 className="page-title">Volání</h1>
        <div className="card empty-state">
          <div className="big-emoji"><PartyIcon size={56} /></div>
          <h2>Fronta je prázdná!</h2>
          <p className="muted">
            Žádný kontakt k obvolání. Dej si kafe, nebo mrkni na svoje statistiky.
          </p>
          <button className="pill-btn hot" onClick={() => void loadNext()}>
            Zkusit znovu
          </button>
        </div>
      </div>
    );
  }

  if (!kontakt) {
    return (
      <div>
        <h1 className="page-title">Volání</h1>
        <ErrorBox>{error || 'Něco se pokazilo.'}</ErrorBox>
        <button className="pill-btn hot" onClick={() => void loadNext()}>
          Zkusit znovu
        </button>
      </div>
    );
  }

  const hasWeb = !!(kontakt.web && kontakt.web.trim());

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <p className="eyebrow">volání · kontakt #{kontakt.id}</p>
      <h1 className="page-title">
        Zavolej jim <ArrowDownIcon size={26} />
      </h1>

      {warning && <div className="info-box">{warning}</div>}
      <ErrorBox>{error}</ErrorBox>

      <div className="card call-card">
        <h2 className="call-name">{kontakt.name || '(beze jména)'}</h2>

        <div className="call-row">
          <span className="k">telefon</span>
          <PhoneLinks phone={kontakt.phone} />
        </div>

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
                  placeholder="např. 4900"
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
                  placeholder="např. 190/měs"
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
              <label>Poznámka</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Co říkali? Na čem jste se domluvili?"
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

      {modal === 'bez-poznamky' && (
        <ConfirmModal
          title="Opravdu bez poznámky?"
          confirmLabel="Uložit bez poznámky"
          confirmClass="go"
          busy={busy}
          onCancel={() => setModal(null)}
          onConfirm={() => {
            setModal(null);
            void resolve('zajem');
          }}
        >
          Poznámka hodně pomůže tomu, kdo bude web vyrábět. Určitě nechceš nic připsat?
        </ConfirmModal>
      )}
    </div>
  );
}
