// „ZAVOLAL/A JSEM“ U OZNAČENÉHO KLIENTA (migrace 060, Albert 1. 11. 2026: „a proper menu: didn't reach him / client doesn't
// want the website / client doesn't want to be contacted / we spoke — write down what the client wants (the automation
// acts on it)“). Okno s výsledky, poznámkou a hvězdou volá zapis_hovor. Druhý hovor NENÍ nový hovor ve statistikách („as one
// call and as one client still“): server nepíše call_log, Rozvrh ani výdělek se nemění. Lhůta bez slibu e-mailu („Lhůta na
// zavolání do …“; připomínku po lhůtě řídí přepínač PRIPOMINKY_OZNACENI, migrace 063). Super admin navíc „Zrušit označení“.
// ⚠ Migrace 061 (Albert 2. 11. 2026: „there are currently only four options … there should definitely be also a note below it
// where you can write a note for the automation … these four options. Plus … one more option which says none of it above.
// And plus there should be a note and you should be able to write down the note when you hit the I called them button“)
// NAHRAZUJE „okno se čtyřmi výsledky, text jen u Mluvili jsme a důvod“: pět výsledků (pátý „Nic z toho výše“, jine) a pole
// „Poznámka pro automatizaci“ pod nimi vždy, i před výběrem; povinná u „Mluvili jsme“ a „Nic z toho výše“, jinak nepovinná,
// nejvýš 450 znaků u Nechce web a Nechce, abychom ho kontaktovali (server ji dává i do důvodu změny stavu), jinak 2 000.
// Poznámka jde serveru u KAŽDÉHO výsledku: s právem kontakt upravit ji automatizace dostane jako u „Mluvili jsme“ (řádek
// v poznámce kontaktu a vzkaz do vlákna), bez něj zůstane jen v události dovolani, kterou appka nikde neukazuje
// (poznamka_predana false, okno to řekne; recenze 2. 11. 2026: ⚠ NAHRAZUJE větu o historii, kterou appka nemá).
// „Nedovolal/a jsem se“ označení neruší (Albert 2. 11. 2026: „it shouldn't be removing the mark“), jen přičte pokus.
// Obě okna jdou přes createPortal do body: z detailu (PrehledPanel v drawer, z-index 50) by jinak byla pod sloupcem
// prasátka (z-index 1001) a ten zakrýval levý kraj voleb; okno je sloupec, posouvá se jen jeho tělo, chyba a tlačítka zůstávají.
// ⚠ Migrace 062 (Albert 2. 11. 2026: „I would like to have this also in my clients section … even if the client isn't marked
// yet and you call them again … You should again be able to select if they decided that they liked the preview and they
// wanted or rejected it. … Plus you should be able to write down the note“; k šestému výsledku A1: „if the client accepts it
// over the second call the automation should then … write him an email … he should be sent the same website“) NAHRAZUJE
// „okno jen u otevřeného označení“ a „pět výsledků“: okno otevře i klient bez označení (Moji klienti, Kontakty, detail,
// kalendář, Označené u řádku jen s příznakem; DovolaniTlacitko.tsx), kategorie je pak null a nahoře neutrální věta
// „Klient není v Označených: zapíše se další hovor, ve statistikách nový hovor není.“; šest výsledků, šestý „Chce web“
// (chce_web: poznámka nepovinná, vzkaz agentovi jde vždy, označení uzavře jako Mluvili jsme, stav nemění; automatizace pošle
// e-mail s odkazem na TENTÝŽ web, nikdy druhý náhled; architekta napřed poprosí o krátké písemné potvrzení, rozhodnutí D22
// z 3. 11. 2026, protože odpovědi architektům slibují „Nic nefakturuji, dokud mi sám písemně nenapíšete“). Pořadí: Nedovolal/a jsem se, Chce web, Mluvili jsme, obě odmítnutí,
// Nic z toho výše poslední (jeho text říká „z toho výše“; Chce web není hned vedle Nechce web, aby se nespletly). Odmítnutí
// jsou vypnutá s důvodem ze serveru (rozhodnutí D2 a D3): klient po prodeji, Eskalace nebo Pozastaveno u Volajícího a bez
// označení Volající, který klienta nevede (posledním volajícím je kolega). Kterou větev server vybral, vrací `oznaceno`
// a věta po zápisu to řekne (bez označení, nebo označení mezitím zmizelo, nebo se označení tímhle uzavřelo).

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getApi, type Kontakt, type OznaceniKategorie, type VysledekDovolani, type ZapisHovoruVysledek } from '../api';
import { audio } from '../audio';
import { useSession } from '../auth';
import { HvezdaIcon } from '../icons';
import { OWNER_USER_ID, isSuperAdmin } from '../roles';
import { segmentOf } from '../segment';
import {
  ErrorBox,
  OZNACENI_HINTS,
  OZNACENI_LABELS,
  PRODEJ,
  STATUS_LABELS,
  errMsg,
  kontaktJmeno,
  lhutaText,
  maNahled,
  useOkno,
} from '../ui';

/** Nejvýš znaků poznámky dovolání (jako poznámka z hovoru v resolve_call, 2 000). */
export const DOVOLANI_MAX = 2000;

/**
 * Nejvýš znaků důvodu u „Nechce web“ a „Nechce, abychom ho kontaktovali“: server ho s úvodem „Dovolání: …“ ukládá jako důvod
 * změny stavu (nejvýš 500), proto víc než 450 odmítne (zapis_hovor; recenze 2. 11. 2026).
 */
export const DOVOLANI_DUVOD_MAX = 450;

/** Kolik znaků poznámky výsledek pustí: nechce a nekontaktovat 450, ostatní (i bez výběru) 2 000 (jako server). */
export function dovolaniMax(v: VysledekDovolani | null): number {
  return v === 'nechce' || v === 'nekontaktovat' ? DOVOLANI_DUVOD_MAX : DOVOLANI_MAX;
}

/** Výsledky, které mění stav na odmítnutí (D2 a D3: tlačítkem jen u některých klientů a jen někdo). */
export const ODMITNUTI_DOVOLANI: VysledekDovolani[] = ['nechce', 'nekontaktovat'];

/**
 * Výsledky v okně. `co` je věta pro označeného klienta (jako od 061); bez označení a podle náhledu ji okno skládá v coDovolani.
 * ⚠ Migrace 062 NAHRAZUJE pořadí 061 (Nedovolal/a jsem se, Nechce web, Nechce, abychom ho kontaktovali, Mluvili jsme, Nic
 * z toho výše): Chce web druhý, Mluvili jsme za ním, odmítnutí pohromadě, Nic z toho výše dál poslední.
 */
export const DOVOLANI_VOLBY: { v: VysledekDovolani; text: string; co: string }[] = [
  {
    v: 'nedovolano',
    text: 'Nedovolal/a jsem se',
    co: 'Zapíše se pokus. Označení zůstane, dokud se klientovi nedovoláš nebo se neozve sám.',
  },
  {
    // migrace 062 (Albert 2. 11. 2026, A1: „if the caller marks … that the client accepted the website, the automation can
    // really pick it up and resolve the rest of the process with the client via the emails“): šestý výsledek, klient web chce
    v: 'chce_web',
    text: 'Chce web',
    co: 'Klient web chce: automatizace mu pošle e-mail s odkazem a domluví zbytek (hosting, faktura). Označení se uzavře.',
  },
  {
    v: 'mluvili',
    text: 'Mluvili jsme – co klient chce',
    co: 'Označení se uzavře a automatizace pokračuje podle toho, co klient chce.',
  },
  {
    v: 'nechce',
    text: 'Nechce web',
    co: 'Stav se změní na Odmítnuto. Když klient ještě nedostal nabídku poloviční ceny, automatizace mu ji jednou pošle.',
  },
  {
    v: 'nekontaktovat',
    text: 'Nechce, abychom ho kontaktovali',
    co: 'Stav se změní na Nekontaktovat: už mu nikdo nezavolá a automatizace mu nic nepošle.',
  },
  {
    // migrace 061 (Albert 2. 11. 2026: „one more option which says none of it above“): hovor proběhl, nesedí nic ze čtyř
    v: 'jine',
    text: 'Nic z toho výše',
    // ⚠ migrace 062: od šestého výsledku nesedí nic z pěti ostatních (NAHRAZUJE „ze čtyř“ v poznámce nad v: 'jine')
    co: 'Hovor proběhl, ale nesedí nic z toho výše. Označení se uzavře a automatizace pokračuje podle tvé poznámky.',
  },
];

/** Povinná poznámka (migrace 061): u „Mluvili jsme“ a „Nic z toho výše“ je poznámka jediné, co automatizaci řekne, co dál. */
export function poznamkaPovinna(v: VysledekDovolani | null): boolean {
  return v === 'mluvili' || v === 'jine';
}

/** Neutrální věta nahoře u klienta bez označení (migrace 062, D11, doslova ze zadání). */
export const BEZ_OZNACENI_HLAVICKA = 'Klient není v Označených: zapíše se další hovor, ve statistikách nový hovor není.';

/** Okolnosti klienta, podle kterých okno říká, co výsledek udělá (coDovolani). */
export interface DovolaniKontext {
  /** okno otevřené u otevřeného označení (kategorie) */
  oznaceno: boolean;
  /** klient má náhled webu (nový web nebo odeslaný návrh; maNahled v ui.tsx) */
  nahled: boolean;
  /** klient dostal návrh e-mailem (first_proposal_at): jen pak může přijít nabídka poloviční ceny */
  navrh: boolean;
  /** klient web objednal (PRODEJ) */
  prodej: boolean;
  /** architekt (rozhodnutí D22: po telefonu ho automatizace napřed poprosí o krátké písemné potvrzení, fakturu až po něm) */
  architekt?: boolean;
}

/**
 * Co výsledek udělá (věta pod volbami). U označení věty od 061, bez označení bez slova „Označení“ (D11); „Chce web“ podle
 * náhledu („Náhled ještě nemá: automatizace ho připraví (jen jeden).“, doslova ze zadání) a po prodeji bez druhého potvrzení
 * (D8 b: klient už web objednal, automatizace odpoví jen na nové otázky).
 */
export function coDovolani(v: VysledekDovolani, k: DovolaniKontext): string {
  switch (v) {
    case 'nedovolano':
      return k.oznaceno ? 'Zapíše se pokus. Označení zůstane, dokud se klientovi nedovoláš nebo se neozve sám.' : 'Zapíše se pokus, u klienta se nic nemění.';
    case 'chce_web': {
      const co = k.prodej
        ? 'Klient už web objednal: druhé potvrzení mu automatizace neposílá, odpoví jen na nové otázky z poznámky.'
        : k.nahled
          ? k.architekt
            ? 'Architekt web chce: automatizace mu pošle e-mail s odkazem a poprosí o krátké písemné potvrzení, fakturu pošle až po něm.'
            : 'Klient web chce: automatizace mu pošle e-mail s odkazem a domluví zbytek (hosting, faktura).'
          : 'Náhled ještě nemá: automatizace ho připraví (jen jeden).';
      return k.oznaceno ? `${co} Označení se uzavře.` : co;
    }
    case 'mluvili':
      return `${k.oznaceno ? 'Označení se uzavře a automatizace pokračuje podle toho, co klient chce.' : 'Automatizace pokračuje podle toho, co klient chce.'} Když web objednává, vyber „Chce web“.`;
    case 'nechce':
      return k.navrh
        ? 'Stav se změní na Odmítnuto. Když klient ještě nedostal nabídku poloviční ceny, automatizace mu ji jednou pošle.'
        : 'Stav se změní na Odmítnuto, automatizace mu nic nepošle.';
    case 'nekontaktovat':
      return 'Stav se změní na Nekontaktovat: už mu nikdo nezavolá a automatizace mu nic nepošle.';
    default:
      return k.oznaceno
        ? 'Hovor proběhl, ale nesedí nic z toho výše. Označení se uzavře a automatizace pokračuje podle tvé poznámky.'
        : 'Hovor proběhl, ale nesedí nic z toho výše. Automatizace pokračuje podle tvé poznámky.';
  }
}

/**
 * Proč okno „Nechce web“ a „Nechce, abychom ho kontaktovali“ nenabídne (věty serveru z rozhodnutí D2 a D3 zadání 062; null =
 * jde). Po prodeji nikdo (stav se mění v detailu s důvodem); Eskalace a Pozastaveno Volající ne (rozhodne Albert nebo super
 * admin); bez označení Volající jen u klienta, kterého vede (appka to pozná podle posledního volajícího, kolega je „jiný
 * volající“; server podle posledního zájmu, oznaceni_vlastnik). Eskalaci a Pozastaveno po prodeji pozná jen server: super
 * admin tam odmítnutí v okně má a server mu případně řekne, proč nejde.
 */
export function odmitnutiNejde(
  k: Pick<Kontakt, 'status' | 'last_caller'>,
  ja: { jaSuper: boolean; jmeno: string },
  oznaceno: boolean
): string | null {
  const stav = STATUS_LABELS[k.status] ?? k.status;
  if (PRODEJ.includes(k.status)) {
    return `Klient už web objednal (stav ${stav}): odmítnutí tady zapsat nejde. Napište, co řekl, do „Mluvili jsme“ nebo „Nic z toho výše“; stav se mění v detailu klienta s důvodem.`;
  }
  if (!ja.jaSuper && (k.status === 'eskalace' || k.status === 'pozastaveno')) {
    return `Klient je ve stavu ${stav}, o dalším kroku rozhodne Albert nebo super admin; zapište „Nic z toho výše“ s poznámkou.`;
  }
  if (!ja.jaSuper && !oznaceno && k.last_caller !== ja.jmeno) {
    return 'Odmítnutí zapisuje volající, který klienta vede, jeho super admin nebo Albert. Zapište, co klient řekl, do „Mluvili jsme“ nebo „Nic z toho výše“.';
  }
  return null;
}

/**
 * Věta za „Hovor … je zapsaný“ podle toho, kterou větev server vybral (`oznaceno` od 062; bez klíče = server bez 062, nic).
 * Okno otevřené u označení, server bez něj: označení mezitím zmizelo. Okno bez označení, server s ním (kalendář, detail):
 * označení se tím uzavřelo, u nedovolání zůstává.
 */
export function vetaOznaceni(oznacenoServer: boolean | null | undefined, oknoOznacene: boolean, vysledek: VysledekDovolani): string {
  if (oznacenoServer === false) {
    return oknoOznacene
      ? ' Označení už nebylo otevřené (klient se mezitím ozval nebo ho někdo vyřídil): zapsalo se jako další hovor bez označení.'
      : ' Zapsáno jako další hovor bez označení.';
  }
  if (oznacenoServer === true && !oknoOznacene) {
    return vysledek === 'nedovolano' ? ' Klient je v Označených: označení zůstává.' : ' Klient byl v Označených: označení se tím uzavřelo.';
  }
  return '';
}

/** Příklad do pole poznámky podle výsledku (bez výběru obecný). */
const PRIKLAD: Record<VysledekDovolani, string> = {
  nedovolano: 'Třeba: nebral to, zvoní naprázdno.',
  chce_web: 'Třeba: web bere, hosting chce na rok, fakturu na firmu.',
  nechce: 'Třeba: web nechce, chalupu pronajímá přes Booking.',
  nekontaktovat: 'Třeba: ať mu už nevoláme ani nepíšeme.',
  mluvili: 'Třeba: web se mu líbí, chce jinou úvodní fotku a cenu na rok.',
  jine: 'Třeba: chalupu prodává, ozve se nový majitel v lednu.',
};
const PRIKLAD_BEZ_VYBERU = 'Co má automatizace o hovoru vědět.';

/** Kam poznámka půjde (pod polem). Bez práva kontakt upravit jen do události dovolani, kterou appka neukazuje (server 061, poznamka_predana false). */
function kamPoznamka(v: VysledekDovolani | null, smiUpravit: boolean): string {
  if (!smiUpravit) {
    return 'Uloží se jen k záznamu pokusu: v appce ji nikdo neuvidí a agent ji nedostane. Do poznámek klienta a agentovi ji dá jen ten, kdo klienta smí upravit.';
  }
  if (v === 'nechce' || v === 'nekontaktovat') {
    return 'Uloží se do poznámek klienta i jako důvod změny stavu a agent ji dostane jako vzkaz.';
  }
  // migrace 062 (D4 a): vzkaz „Dovolání (jméno): Chce web“ jde agentovi vždy, i bez poznámky
  if (v === 'chce_web') {
    return 'Uloží se do poznámek klienta a agent ji dostane jako vzkaz (vzkaz „Chce web“ dostane i bez poznámky).';
  }
  return 'Uloží se do poznámek klienta a agent ji dostane jako vzkaz.';
}

/**
 * Výsledky, které okno nabídne. Kdo kontakt nesmí upravit (smi_upravit false: třeba super admin, kterému klient ani jeho
 * volající nepatří), zapíše jen „Nedovolal/a jsem se“: ostatní výsledky kontakt mění a server je bez práva úprav odmítne
 * (zapis_hovor, app_smi_upravit; recenze 2. 11. 2026). Bez označení okno otevře jen ten, kdo klienta smí upravit (dovolatSmi).
 */
export function volbyDovolani(smiUpravit: boolean): typeof DOVOLANI_VOLBY {
  return smiUpravit ? DOVOLANI_VOLBY : DOVOLANI_VOLBY.filter((x) => x.v === 'nedovolano');
}

/** Co okno předá stránce po zápisu (kalendář podle toho uzavře hovor, na který člověk klikl). */
export interface DovolaniZapsano {
  vysledek: VysledekDovolani;
  /** text výsledku v okně („Chce web“) */
  text: string;
  /** poznámka, jak šla serveru (bez mezer na krajích), nebo null */
  poznamka: string | null;
  odpoved: ZapisHovoruVysledek | null;
}

export default function DovolaniOkno({
  kontakt,
  kategorie,
  lhutaDo,
  pokusy,
  maHvezdu,
  smiUpravit,
  smiHvezdu,
  onZavrit,
  onHotovo,
}: {
  kontakt: Pick<Kontakt, 'id' | 'name' | 'firma' | 'status' | 'first_proposal_at' | 'live_url' | 'last_caller' | 'segment'>;
  /** otevřené označení (kategorie); null = klient bez označení (migrace 062): neutrální věta nahoře a věty bez „Označení“ */
  kategorie: OznaceniKategorie | null;
  lhutaDo: string | null;
  pokusy: number;
  maHvezdu: boolean;
  /** smí kontakt upravit (smi_upravit)? Jinak okno nabídne jen „Nedovolal/a jsem se“ (volbyDovolani) */
  smiUpravit: boolean;
  /** hvězdu smí měnit jen ten, kdo kontakt smí upravit (jinak zaškrtávátko není) */
  smiHvezdu: boolean;
  onZavrit: () => void;
  /** po zápisu: věta pro stránku („Zapsáno: …“) a co se zapsalo */
  onHotovo: (veta: string, zapsano: DovolaniZapsano) => void;
}) {
  const session = useSession();
  // super admin a Albert (jako server v zapis_hovor: users.id 1 nebo role super_admin)
  const jaSuper = session.user_id === OWNER_USER_ID || isSuperAdmin(session.role);
  const [vysledek, setVysledek] = useState<VysledekDovolani | null>(null);
  const [text, setText] = useState('');
  const [hvezda, setHvezda] = useState(maHvezdu);
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  const okno = useRef<HTMLDivElement>(null);
  useOkno(okno, onZavrit, busy);
  const oznaceno = kategorie !== null;
  const volby = volbyDovolani(smiUpravit);
  const volba = volby.find((x) => x.v === vysledek);
  const kontext: DovolaniKontext = {
    oznaceno,
    nahled: maNahled(kontakt),
    navrh: !!kontakt.first_proposal_at,
    prodej: PRODEJ.includes(kontakt.status),
    architekt: segmentOf(kontakt) === 'architekt',
  };
  // migrace 062 (D2, D3): proč odmítnutí nejde; vypnuté volby to mají v title a věta je pod volbami
  const nejde = smiUpravit ? odmitnutiNejde(kontakt, { jaSuper, jmeno: session.display_name }, oznaceno) : null;
  const vypnuta = (v: VysledekDovolani) => !!nejde && ODMITNUTI_DOVOLANI.includes(v);
  const max = dovolaniMax(vysledek);
  // znaky jako server (bez mezer na krajích, emoji jako jeden znak)
  const delka = [...text.trim()].length;
  const chybiText = poznamkaPovinna(vysledek) && !text.trim();
  // v každém stavu: text psaný u delšího výsledku (2 000) a pak přepnutý na nechce či nekontaktovat (450) maxLength nezkrátí
  const prilisDlouhy = delka > max;
  const zapsat = async () => {
    if (!vysledek || chybiText || prilisDlouhy || vypnuta(vysledek)) return;
    setBusy(true);
    setChyba('');
    try {
      const v = await getApi().zapisHovor(
        session.token,
        kontakt.id,
        vysledek,
        // migrace 061: poznámka u každého výsledku (prázdná jako null)
        text.trim() || null,
        smiHvezdu && hvezda !== maHvezdu ? hvezda : null
      );
      audio.play('success');
      onHotovo(
        `Hovor s klientem ${kontaktJmeno(kontakt)} je zapsaný: ${volba?.text.toLowerCase() ?? vysledek}.` +
          (v?.poznamka_predana === false ? ' Poznámka se uložila jen k záznamu pokusu, v appce ji nikdo neuvidí.' : '') +
          // migrace 062: kterou větev server vybral (oznaceno)
          vetaOznaceni(v?.oznaceno, oznaceno, vysledek),
        { vysledek, text: volba?.text ?? vysledek, poznamka: text.trim() || null, odpoved: v ?? null }
      );
    } catch (e) {
      setChyba(errMsg(e));
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };
  return createPortal(
    <div className="scrim dovolani-scrim" onClick={() => !busy && onZavrit()}>
      <div
        ref={okno}
        className="modal card dovolani-okno"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dovolani-titulek"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title" id="dovolani-titulek">
          Zavolal/a jsem: {kontaktJmeno(kontakt)}
        </h3>
        <div className="modal-body">
          {kategorie ? (
            <p style={{ marginTop: 0 }}>
              <b>{OZNACENI_LABELS[kategorie]}.</b> {OZNACENI_HINTS[kategorie]}
            </p>
          ) : (
            // migrace 062 (D11): klient bez označení, zapíše se další hovor
            <p className="dovolani-bez-oznaceni" style={{ marginTop: 0 }}>
              {BEZ_OZNACENI_HLAVICKA}
            </p>
          )}
          {oznaceno && (lhutaDo || pokusy > 0) && (
            <p className="muted dovolani-lhuta" style={{ fontSize: 13.5 }}>
              {lhutaText(lhutaDo)}
              {pokusy > 0 ? `${lhutaDo ? ' · ' : ''}nedovoláno už ${pokusy}×` : ''}
            </p>
          )}
          <p className="nerelevantni-otazka" id="dovolani-otazka">
            Jak hovor dopadl?
          </p>
          <div className="zavolat-volby dovolani-volby" role="radiogroup" aria-labelledby="dovolani-otazka">
            {volby.map((x, i) => (
              <button
                key={x.v}
                type="button"
                role="radio"
                aria-checked={vysledek === x.v}
                data-autofocus={i === 0 ? true : undefined}
                className={`pill-btn sm zavolat-volba${vysledek === x.v ? ' active' : ''}`}
                disabled={busy || vypnuta(x.v)}
                title={vypnuta(x.v) ? nejde ?? undefined : undefined}
                aria-describedby={vypnuta(x.v) ? 'dovolani-nejde' : undefined}
                onClick={() => setVysledek(x.v)}
              >
                {x.text}
              </button>
            ))}
          </div>
          {!smiUpravit && (
            <p className="muted dovolani-jen-pokus" style={{ fontSize: 13.5 }}>
              Ostatní výsledky zapíše ten, kdo klienta smí upravit: jeho volající, jeho super admin nebo Albert.
            </p>
          )}
          {nejde && (
            <p className="muted dovolani-nejde" id="dovolani-nejde" style={{ fontSize: 13.5 }}>
              {nejde}
            </p>
          )}
          {volba && <p className="muted dovolani-co" style={{ fontSize: 13.5 }}>{coDovolani(volba.v, kontext)}</p>}
          {/* migrace 061: poznámka pro automatizaci vždy, i před výběrem výsledku */}
          <div className="field dovolani-poznamka">
            <label htmlFor="dovolani-text">
              Poznámka pro automatizaci
              {vysledek && (
                <>
                  {' '}
                  {poznamkaPovinna(vysledek) ? <span className="req">(povinná)</span> : <span className="muted">(nepovinná)</span>}
                </>
              )}
            </label>
            <textarea
              id="dovolani-text"
              rows={3}
              maxLength={dovolaniMax(vysledek)}
              value={text}
              disabled={busy}
              aria-required={poznamkaPovinna(vysledek)}
              aria-invalid={prilisDlouhy || undefined}
              aria-describedby="dovolani-text-kam dovolani-text-pocet dovolani-text-chyba"
              placeholder={vysledek ? PRIKLAD[vysledek] : PRIKLAD_BEZ_VYBERU}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="dovolani-pod-polem">
              <span id="dovolani-text-kam" className="muted">
                {kamPoznamka(vysledek, smiUpravit)}
              </span>
              <span id="dovolani-text-pocet" className={`zavolat-pocet ${prilisDlouhy ? 'moc' : 'muted'}`}>
                {delka} / {max}
              </span>
            </div>
            {prilisDlouhy ? (
              <p id="dovolani-text-chyba" className="dovolani-chyba">
                Poznámka je moc dlouhá: nejvýš {max} znaků.
              </p>
            ) : chybiText ? (
              <p id="dovolani-text-chyba" className="muted dovolani-chybi">
                {vysledek === 'mluvili' ? 'Napiš, co klient chce.' : 'Napiš, jak hovor dopadl.'}
              </p>
            ) : null}
          </div>
          {smiHvezdu && (
            <label className="dovolani-hvezda">
              <input type="checkbox" checked={hvezda} disabled={busy} onChange={(e) => setHvezda(e.target.checked)} />{' '}
              <HvezdaIcon size={16} plna={hvezda} /> Velký zájem (hvězda)
            </label>
          )}
        </div>
        {/* mimo posouvané tělo okna: chyba serveru i tlačítka jsou vidět vždy */}
        <ErrorBox>{chyba}</ErrorBox>
        <div className="modal-actions">
          <button type="button" className="pill-btn" onClick={onZavrit} disabled={busy}>
            Zpět
          </button>
          <button
            type="button"
            className="pill-btn go"
            onClick={() => void zapsat()}
            disabled={busy || !vysledek || chybiText || prilisDlouhy || (!!vysledek && vypnuta(vysledek))}
          >
            {busy ? 'Ukládám…' : 'Zapsat hovor'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Super admin a Albert: zrušit otevřené označení s důvodem (oznaceni_zavrit). */
export function ZrusitOznaceniOkno({
  kontakt,
  onZavrit,
  onHotovo,
}: {
  kontakt: Pick<Kontakt, 'id' | 'name' | 'firma'>;
  onZavrit: () => void;
  onHotovo: (veta: string) => void;
}) {
  const session = useSession();
  const [duvod, setDuvod] = useState('');
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  const okno = useRef<HTMLDivElement>(null);
  useOkno(okno, onZavrit, busy);
  const zrusit = async () => {
    if (!duvod.trim()) return;
    setBusy(true);
    setChyba('');
    try {
      await getApi().oznaceniZavrit(session.token, kontakt.id, duvod.trim());
      audio.play('success');
      onHotovo(`Označení klienta ${kontaktJmeno(kontakt)} je zrušené.`);
    } catch (e) {
      setChyba(errMsg(e));
      audio.play('error');
    } finally {
      setBusy(false);
    }
  };
  // migrace 061: jako okno Zavolal/a jsem přes createPortal nad sloupcem prasátka (i z detailu)
  return createPortal(
    <div className="scrim dovolani-scrim" onClick={() => !busy && onZavrit()}>
      <div ref={okno} className="modal card" role="dialog" aria-modal="true" aria-labelledby="zrusit-ozn-titulek" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title" id="zrusit-ozn-titulek">
          Zrušit označení: {kontaktJmeno(kontakt)}
        </h3>
        <div className="modal-body">
          <p style={{ marginTop: 0 }}>
            Klient zmizí z označených k zavolání. Když bude dál mlčet po naší další zprávě, automatizace ho označí znovu.
          </p>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="zrusit-ozn-duvod">Proč (povinné)</label>
            <textarea
              id="zrusit-ozn-duvod"
              rows={2}
              maxLength={500}
              value={duvod}
              disabled={busy}
              data-autofocus
              placeholder="Třeba: domluveno osobně, ozve se v prosinci."
              onChange={(e) => setDuvod(e.target.value)}
            />
          </div>
          <ErrorBox>{chyba}</ErrorBox>
        </div>
        <div className="modal-actions">
          <button type="button" className="pill-btn" onClick={onZavrit} disabled={busy}>
            Zpět
          </button>
          <button type="button" className="pill-btn warn" onClick={() => void zrusit()} disabled={busy || !duvod.trim()}>
            {busy ? 'Ukládám…' : 'Zrušit označení'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
