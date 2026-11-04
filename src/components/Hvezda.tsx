// HVĚZDA „VELKÝ ZÁJEM“ (migrace 060, Albert 1. 11. 2026: „like A+ above the grade, regardless of grade“; volající ji dá
// při prvním hovoru i kdykoli později všude, kde pracuje se svými klienty). Přepínač volá nastav_hvezdu hned, bez
// „Uložit změny“; smí ten, kdo kontakt smí upravit (smi_upravit, jako obsah kontaktu), ostatní vidí jen odznak.
// U cizího kontaktu Volajícího (skryto) a proti serveru bez 060 (klíč hvezda_at chybí) se neukáže nic.
// Migrace 063 (Albert 1. 11. 2026, druhá etapa): hvězdu dává i automatizace (hvezda_kdo „automatizace“); title ukáže
// „dala ji automatizace <den> · <důvod>“, velká varianta v detailu „Hvězda od automatizace“. Odebrat ji smí člověk jako
// každou jinou; automatizace ji pak znovu nedá, dokud klient znovu nenapíše (server).

import { useState, type MouseEvent } from 'react';
import { getApi, type Kontakt } from '../api';
import { audio } from '../audio';
import { useSession } from '../auth';
import { HvezdaIcon } from '../icons';
import { HVEZDA_AUTOMATIZACE, HvezdaOdznak, errMsg, hvezdaPopis, jenZaklad } from '../ui';

/** Má řádek klíče hvězdy? (server s migrací 060 je posílá u každého vlastního řádku, i když hvězda není) */
export function hvezdaZnama(k: Kontakt): boolean {
  return !jenZaklad(k) && Object.prototype.hasOwnProperty.call(k, 'hvezda_at');
}

export function HvezdaPrepinac({
  kontakt,
  onZmena,
  velka = false,
}: {
  kontakt: Kontakt;
  /** řádek s novou hvězdou (stránka ho dá do seznamu, ostatní klíče řádku zůstanou) */
  onZmena: (k: Kontakt) => void;
  /** velká varianta s textem (detail kontaktu) */
  velka?: boolean;
}) {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  if (!hvezdaZnama(kontakt)) return null;
  if (kontakt.smi_upravit === false) return <HvezdaOdznak kontakt={kontakt} />;
  const ma = !!kontakt.hvezda_at;
  const prepni = async (e: MouseEvent) => {
    // v řádku seznamu klik na hvězdu neotevře detail
    e.stopPropagation();
    setBusy(true);
    setChyba('');
    try {
      const r = await getApi().nastavHvezdu(session.token, kontakt.id, !ma, null);
      audio.play('success');
      onZmena({
        ...kontakt,
        hvezda_at: r?.hvezda_at ?? null,
        hvezda_kdo: r?.hvezda_kdo ?? null,
        hvezda_duvod: r?.hvezda_duvod ?? null,
        updated_at: r?.updated_at ?? kontakt.updated_at,
      });
    } catch (err) {
      setChyba(errMsg(err));
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        className={`hvezda-prepinac${ma ? ' ma' : ''}${velka ? ' velka pill-btn sm' : ''}`}
        aria-pressed={ma}
        aria-label={ma ? 'Odebrat hvězdu' : 'Dát hvězdu (velký zájem)'}
        title={ma ? `${hvezdaPopis(kontakt)}. Klikni a hvězdu odeber.` : 'Dát hvězdu: klient má velký zájem'}
        disabled={busy}
        onClick={(e) => void prepni(e)}
      >
        <HvezdaIcon size={velka ? 17 : 16} plna={ma} />
        {/* migrace 063: hvězda od automatizace se v detailu jmenuje tak (kdo a proč je v title i v přehledu) */}
        {velka ? (ma ? (kontakt.hvezda_kdo === HVEZDA_AUTOMATIZACE ? ' Hvězda od automatizace' : ' Hvězda: velký zájem') : ' Dát hvězdu (velký zájem)') : null}
      </button>
      {chyba && (
        <span className="hvezda-chyba" role="alert">
          {chyba}
        </span>
      )}
    </>
  );
}
