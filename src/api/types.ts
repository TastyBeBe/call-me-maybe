/**
 * Role (migrace 042, Albert 18. 10. 2026): jen dvě, `admin` = v appce „Volající“ a `super_admin`.
 * ⚠ NAHRAZUJE tři role z migrace 023 (volající / admin / super admin). `caller` server od 042 neukládá;
 * v typu zůstává jen kvůli serveru před migrací 042 (appka ho popíše taky jako Volajícího).
 * Majitel účtu = users.id 1 (Albert).
 */
export type Role = 'admin' | 'caller' | 'super_admin';

export interface Session {
  token: string;
  user_id: number;
  display_name: string;
  role: Role;
}

export type KontaktStatus =
  | 'nekontaktovano'
  | 'nedovolano'
  | 'odmitnuto'
  | 'zajem'
  | 'web_ve_vyrobe'
  | 'navrh_odeslan'
  | 'ceka_na_klienta'
  | 'upravy_ve_vyrobe'
  | 'schvaleno'
  | 'faktura_odeslana'
  | 'zaplaceno'
  | 'domena_pripojena'
  | 'hotovo'
  | 'pozastaveno'
  | 'eskalace'
  /**
   * Migrace 050 (Albert 21. 10. 2026): volající zjistil, že kontakt není relevantní (starší člověk, není majitel,
   * objekt neexistuje). Konečný stav jako odmitnuto (nevolá se, nepíše se), do statistik se nepočítá jako odmítnutí.
   */
  | 'nerelevantni'
  /*
   * Migrace 059 (Albert 30. 10. 2026: „make sure that the status which is displayed next to each client truly reflects on
   * what's going on with that client“; docs/PLAYBOOK.md [2026-10-30]):
   *   sleva_nabidnuta  odešla jednorázová nabídka poloviční ceny, čeká se na odpověď (po 14 dnech bez odpovědi tick
   *                    nastaví odmitnuto, po připomínce kampaně bez_odpovedi)
   *   bez_odpovedi     návrh i nabídka odešly, klient do lhůty nenapsal
   *                    ⚠ migrace 060 (Albert 1. 11. 2026: „you don't close them, you archive them“): v appce „Archiv –
   *                    neodpověděl“, po připomínce kampaně až 60 dní od poslední zprávy nebo hovoru (Albert 4. 11. 2026, jen kdo od
   *                    návrhu nikdy nenapsal, bez hvězdy a známky A; NAHRAZUJE 14 a 30 dní); není to
   *                    konec, nová zpráva klienta nebo vstup člověka v appce klienta vrátí do práce
   *   pozdeji          klient si řekl o čas („ozvu se později“)
   *   nekontaktovat    nechce, abychom mu psali nebo volali; konečný jako nerelevantni, automatizace mu nic nepošle
   */
  | 'sleva_nabidnuta'
  | 'bez_odpovedi'
  | 'pozdeji'
  | 'nekontaktovat';

export type Rating = 'A' | 'B' | 'C';

/**
 * Segment klienta (migrace 028, docs/ARCHITEKTI.md 1.1): chaty a architekti se nikdy nesmí
 * smíchat. Nastavuje ho jen import nebo vědomý zásah v SQL, appka ho nemění.
 */
export type Segment = 'chata' | 'architekt' | Nika;

/**
 * Nika rodiny obor (migrace 064, Albert 7. 11. 2026): klíč z registru `obor_niky` (autoservis, stavby, topeni, elektro…),
 * stejná hodnota jako `kontakty.segment`. Appka žádnou niku nezná jménem: štítky, ikony, pořadí a stav čte z registru
 * (`app_obor_niky`, src/obory.ts). `string & {}` nechá v nápovědě editoru doslovné 'chata' a 'architekt'.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export type Nika = string & {};

/**
 * Rodina segmentu (migrace 064): chata, architekt, nebo obor (každá nika). Rozložení karty, nápovědy a texty se
 * rozhodují podle rodiny (rodinaOf v src/segment.ts), ne podle jednotlivé niky.
 */
export type Rodina = 'chata' | 'architekt' | 'obor';

/** Stav niky v registru (obor_niky.stav); frontu má jen `zapnuto`. */
export type StavNiky = 'priprava' | 'zkouska' | 'zapnuto' | 'pozastaveno' | 'karantena';

/**
 * Řádek registru nik z RPC app_obor_niky (migrace 064). Volající dostane jen niky, které smí volat (stav zapnuto, R9);
 * super admin všechny a navíc stav, stav_od, stav_duvod a volaji_vsichni.
 */
export interface OborNika {
  klic: string;
  /** štítek tlačítka („Autoservisy“) */
  nazev: string;
  /** „V oboru autoservisy teď nikdo k volání není.“ */
  nazev_mnozne: string;
  /** „Po tomhle hovoru dostaneš autoservis.“ */
  nazev_akuzativ: string;
  /** odznak u jednoho kontaktu („Autoservis“) */
  nazev_jednotne: string;
  ikona: string | null;
  poradi: number | null;
  /** zástupné texty ceny pro „Mají zájem“ (R12, Albert 8. 11. 2026); null = žádná částka */
  cena_web_vzor: string | null;
  cena_funkce_vzor: string | null;
  hosting_vzor: string | null;
  /** Markdown stránky „Jak volat“ (R11); null = zatím nic */
  jak_volat: string | null;
  /** smí přihlášený tuhle niku teď volat (stav zapnuto a R9) */
  smi_volat: boolean;
  /** jen super admin */
  stav?: StavNiky;
  stav_od?: string;
  stav_duvod?: string | null;
  volaji_vsichni?: boolean;
}

/** Stav webu firmy oboru z importu (migrace 064, návrh 5.4). */
export type WebStav =
  | 'potvrzeny'
  | 'nepotvrzeny'
  | 'roboti'
  | 'nenacten'
  | 'jen_socialni'
  | 'zaparkovany'
  | 'jiny_web'
  | 'katalog'
  | 'zadny'
  | 'nekontrolovan';

/** Hodnocení webu firmy A až F (jen pro volajícího; firmě se čte konkrétní nedostatek, nikdy písmeno). */
export type WebHodnoceni = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** Řádek app_zavolat_jinde (migrace 064): kolik vlastních naplánovaných hovorů, jejichž čas nastal, čeká v jiném segmentu. */
export interface ZavolatJinde {
  segment: Segment;
  pocet: number;
}

/** DPH architekta a jeho studia zvlášť (migrace 028, CHECK na čtyři hodnoty). */
export type DphStav = 'platce' | 'neplatce' | 'identifikovana_osoba' | 'neovereno';


/**
 * Červený příznak (migrace 005) — klient, který není 100 % vyřešený.
 * chybi_info     = nevíme vůbec, o jaký objekt jde
 * chybi_email    = nemáme e-mail, není kam poslat návrh
 * email_neoveren = e-mail jsme dohledali, ale není potvrzený od klienta
 * info_neoverene = informace/fotky pocházejí z internetu, klient je nepotvrdil („Údaje z internetu“). ⚠ Od migrace 061
 *                  (Albert 2. 11. 2026: „only the super admins will see this flag“) jen pro super adminy a Alberta:
 *                  Volajícímu ho server neposílá (flag_kind, flag_note, flagged_at, flagged_by null; list_flagged
 *                  a list_oznacene bez řádků jen kvůli němu), clear_flag a update_kontakt mu ho odmítnou („Tenhle
 *                  příznak řeší super admin.“), setFlag ho jeho vlastním příznakem nahradí. Appka ho Volajícímu nenabízí.
 * jine           = cokoli dalšího, popsané v poznámce
 * neodpovida     = ⚠ jen historie: od migrace 060 (Albert 1. 11. 2026) ho nahradilo označení k zavolání
 *                  (OznaceniKategorie); migrace staré příznaky zrušila a set_flag i update_kontakt ho odmítnou
 */
export type FlagKind =
  | 'chybi_info'
  | 'chybi_email'
  | 'email_neoveren'
  | 'info_neoverene'
  | 'jine'
  | 'neodpovida';

/**
 * Na koho se čeká (migrace 014). Počítá se z reálných dat z Gmailu, ne ze stavu —
 * stav `ceka_na_klienta` obsahuje i klienty, kterým jsme nikdy nic neposlali.
 *   ceka_prvni       poslali jsme návrh a klient se NIKDY neozval
 *   ceka_po_odpovedi klient se ozval, my odpověděli, od té doby mlčí
 */
export type CekaniKind = 'ceka_prvni' | 'ceka_po_odpovedi';

/** Koš podle stáří čekání — brání tomu, aby roční mlčenlivci zaplavili začátek seznamu. */
export type CekaniKos = 'cerstve' | 'k_zavolani' | 'vlazne' | 'vychladle';

/**
 * Označení k zavolání (migrace 060, Albert 1. 11. 2026: klient, který na naši zprávu neodpověděl VÍC než 5 pracovních
 * dní, je označený pro SVÉHO volajícího, ať mu zavolá a zeptá se, jestli se na web podíval). Dvě kategorie:
 *   navrh  „Neodpověděl na návrh“: dostal náhled (návrh) a nikdy neodpověděl
 *   zmeny  „Neodpověděl na změny“: napsal, my jsme změny udělali a odpověděli, od té doby mlčí
 * Kdo nikdy nic neodmítl, jen ten se označí; odmítnutí po slevě se nevolá. ⚠ NAHRAZUJE příznak `neodpovida`
 * (migrace 014, jen „po naší odpovědi“, 7 až 30 kalendářních dní, jen bez jiného příznaku).
 */
export type OznaceniKategorie = 'navrh' | 'zmeny';

/**
 * Výsledek dovolání klienta (zapis_hovor, migrace 060; od migrace 062 i u klienta bez označení). Do call_log se nepíše
 * (není to nový hovor).
 *   nedovolano     „Nedovolal/a jsem se“: u označení zůstává otevřené (i s poznámkou), jen pokus + 1; bez označení jen záznam
 *   nechce         „Nechce web“ (stav odmitnuto), nekontaktovat „Nechce, abychom ho kontaktovali“ (stav nekontaktovat)
 *   mluvili        „Mluvili jsme – co klient chce“ (povinná poznámka)
 *   jine           „Nic z toho výše“ (migrace 061, Albert 2. 11. 2026; povinná poznámka): hovor proběhl, ale nesedí nic
 *                  z ostatních; uzavře označení a počítá se jako úspěšné dovolání jako mluvili
 *   chce_web       „Chce web“ (migrace 062, Albert 2. 11. 2026, A1: „Yes, you can add the sixth option“; poznámka nepovinná):
 *                  klient web chce, stav se nemění (zbytek domluví automatizace e-mailem), vzkaz agentovi jde vždy;
 *                  uzavře označení jako mluvili a je to úspěšné dovolání
 * Poznámka (od migrace 061 u KAŽDÉHO výsledku, „Poznámka pro automatizaci“) jde s právem kontakt upravit automatizaci:
 * řádek v poznámce kontaktu a vzkaz do vlákna. nechce a nekontaktovat nejvýš 450 znaků, ostatní 2 000.
 */
export type VysledekDovolani = 'nedovolano' | 'nechce' | 'nekontaktovat' | 'mluvili' | 'jine' | 'chce_web';

/** Známka ve filtru seznamů (migrace 060): A, B, C, nebo bez známky (rating null). */
export type ZnamkaFiltr = Rating | 'bez';

export interface Kontakt {
  id: number;
  phone: string | null;
  name: string | null;
  ma_web: string | null;
  web: string | null;
  email: string | null;
  note: string | null;
  status: KontaktStatus;
  rating: Rating | null;
  cena_web: string | null;
  cena_hosting: string | null;
  last_caller: string | null;
  /** kdo kartu volá; od migrace 045 Volajícímu jen u vlastního zámku (cizí = null, zamceno řekne, že je zamčená) */
  lock_by: number | null;
  lock_at: string | null;
  /** migrace 045: kontakt má zámek (lock_by není null), bez toho kdo; server ho posílá každému */
  zamceno?: boolean;
  obor: string;
  lovable_project_id: string | null;
  live_url: string | null;
  flag_kind: FlagKind | null;
  flag_note: string | null;
  flagged_at: string | null;
  flagged_by: string | null;
  /* ---- čekání na odpověď (migrace 014), plní mail-sync.sh z Gmailu ---- */
  first_proposal_at: string | null;
  last_our_reply_at: string | null;
  last_client_reply_at: string | null;
  /**
   * kdy se naposledy změnil stav (trigger z migrace 013, i změna od automatizace: návrh odeslán, schváleno, faktura …);
   * server ho v řádku posílá odjakživa (k.*), u starých kontaktů null. Migrace 057 z něj skládá poslední změnu.
   */
  status_changed_at?: string | null;
  /** odvozeno v list_kontakty — na koho se čeká a od kdy */
  cekani_kind?: CekaniKind | null;
  cekani_since?: string | null;
  cekani_kos?: CekaniKos | null;
  /**
   * Migrace 057 (Albert 28. 10. 2026: „One for the latest change regarding anything like if we send them a proposal or
   * status change“): poslední změna = nejpozdější z updated_at, status_changed_at, first_proposal_at, last_our_reply_at
   * a last_client_reply_at (sloupec Změněno, řazení zmena_*). Posílají ho jen list_kontakty a my_kontakty; u cizího
   * kontaktu Volajícího chybí (allowlist, 045); server bez 057 ho neposílá a appka ukáže updated_at (zmenenoKdy v ui.tsx).
   */
  posledni_zmena?: string | null;
  /**
   * Migrace 057 („the second one should be just the last time they were called … the day they were called“): čas
   * posledního hovoru z call_log (řazení hovor_*). Super admin a Albert hovory všech lidí, Volající JEN SVOJE, i u svých
   * klientů (045: o hovorech kolegů nezjistí nic); null = žádný hovor, který se počítá. Jen list_kontakty a my_kontakty;
   * u cizího kontaktu Volajícího chybí.
   */
  posledni_hovor?: string | null;
  /** migrace 023: kontakt patří přihlášenému (volal mu / je last_caller) */
  je_muj?: boolean;
  /**
   * Migrace 045 (Albert 20. 10. 2026: Volající vidí stav jen u svých klientů): true = Volající a kontakt, kterému
   * nevolal. Server pak pošle jen allowlist (id, segment, name, firma, phone, email, web, ma_web, obor, mesto, IČO
   * a DPH jako dřív, app_kontakt_klice_cizi) a vlastní zámek; status, rating, ceny, poznámky, příznak, last_caller,
   * live_url, čekání ani data změn v řádku NEJSOU (typ je nechává povinné kvůli ostatním řádkům, appka se ptá na skryto).
   * Super admin, Albert a vlastní klienti: false (u starého serveru chybí = false).
   */
  skryto?: boolean;
  /**
   * migrace 024: smí přihlášený měnit obsah kontaktu (stav, e-mail, ceny, poznámku)?
   * Admin jen u svých klientů, super admin u svých, svých lidí a klientů bez volajícího,
   * Albert u všech, volající nikde. Příznak a zámek smí super admin u každého kontaktu, Volající jen u svého
   * klienta (migrace 045, Albert 20. 10. 2026). ⚠ NAHRAZUJE „Příznak a zámek smí admin u každého kontaktu“ (024).
   */
  smi_upravit?: boolean;
  /* ---- segment a pole architekta (migrace 028); u chat prázdná, starý server je neposílá ---- */
  /** chata | architekt; chybí jen u serveru bez migrace 028 (pak je to chata, viz segmentOf) */
  segment?: Segment;
  /** studio (ateliér) architekta */
  firma?: string | null;
  /** město k zobrazení („Praha 6", „Brno") */
  mesto?: string | null;
  /**
   * Osobní IČO. V seznamech (list_kontakty, my_kontakty, list_flagged) a v úpravách
   * (update_kontakt, set_flag, clear_flag) ho server pošle jen tomu, kdo kontakt smí upravit;
   * jinak klíč CHYBÍ (undefined = „skryto“, null = „nezjištěno“) ([ALBERT 28], 2.2 l). Karta ve
   * volání a oznacit_za_sveho ho posílají jen adminům; volajícímu IČO chybí úplně, osobní
   * i ateliéru, karta mu ukáže jen řádek „obrat“ z DPH (Albert 3. 10. 2026, migrace 037).
   */
  ico_osobni?: string | null;
  /** IČO ateliéru; když se rovná osobnímu, chybí spolu s ním i s dph_firma (migrace 032, 036);
   *  volajícímu ho server neposílá vůbec: karta ve volání a oznacit_za_sveho od 037, seznamy
   *  (Kontakty, Moji klienti) od 038, a podle IČO volající nic nenajde (icoVidi v segment.ts). */
  ico_firma?: string | null;
  dph_osobni?: DphStav | null;
  dph_firma?: DphStav | null;
  /*
   * ---- web firmy oboru (migrace 064, Albert 7. 11. 2026: volající má u firmy vidět její web a jeho hodnocení) ----
   * Jen import, appka je nemění (nejsou v update_kontakt). Server je posílá jen u řádku niky oboru, i v allowlistu
   * cizího kontaktu (app_kontakt_klice_cizi); u chat a architektů klíče chybí.
   */
  /** hodnocení webu A až F; na kartě s významem písmene, nikdy slovo „známka“ */
  web_hodnoceni?: WebHodnoceni | null;
  web_stav?: WebStav | null;
  /** 1 nemá skutečný web, 2 slabý D až F, 3 web se nenačetl, 4 průměrný C, 5 dobrý A až B, 6 nehodnocen; řadí frontu (R7) */
  web_priorita?: number | null;
  /** konec kontroly webů (YYYY-MM-DD) */
  web_hodnoceno_do?: string | null;
  /** nejvýš dvě české věty z pevné tabulky frází (R10), jen pro volajícího */
  web_duvod?: string | null;
  /** první odkaz na sociální síť u firmy, která má jen profil */
  web_socialni?: string | null;
  // ⚠ Zdroj telefonu („odkud máme číslo“) v appce není (Albert 19. 10. 2026, migrace 043; NAHRAZUJE [ALBERT 10]). Server ho od 043 neposílá.
  /**
   * Migrace 050 (Albert 21. 10. 2026, „call me at this time“): karta ve volání (next_contact, zavolat_vzit) nese
   * čekající naplánovaný hovor přihlášeného k tomuhle kontaktu, jinak null. Seznamy klíč neposílají (undefined).
   */
  zavolat?: ZavolatKarta | null;
  /*
   * ---- hvězda, mlčení a označení k zavolání (migrace 060, Albert 1. 11. 2026) ----
   * Hvězda = „velký zájem“, nad známkou a bez ohledu na ni (sloupce kontaktu, chodí s k.*); kdo ji dal, jde přes masku
   * jako flagged_by („jiný volající“ u kolegy, „automatizace“ zůstává). U cizího kontaktu Volajícího klíče CHYBÍ
   * (allowlist 045); server bez migrace 060 je neposílá vůbec (appka pak hvězdu nenabízí).
   */
  hvezda_at?: string | null;
  hvezda_kdo?: string | null;
  hvezda_duvod?: string | null;
  /**
   * Kdy automatizace naposledy zapsala přehled klienta (kontakty.prehled_at, migrace 060); null = ještě nikdy. Seznamy ho
   * posílají jen u vlastního řádku (u cizího kontaktu Volajícího klíč chybí), samotný přehled jen kontakt_prehled.
   */
  prehled_at?: string | null;
  /**
   * Kolik celých pracovních dní (Praha, bez víkendů a svátků) klient mlčí od naší poslední zprávy; null = nemlčí
   * (napsal po ní, nebo jsme mu nic neposlali). Jen list_kontakty, my_kontakty a list_oznacene, jen u vlastního řádku.
   */
  mlci_pd?: number | null;
  /**
   * Otevřené označení k zavolání: Volajícímu jen JEHO označení (volajici_id = on), super adminovi a Albertovi každé.
   * Bez označení null; u cizího kontaktu klíče chybí. ozn_lhuta_do = den (YYYY-MM-DD v Praze), do kdy zavolat.
   */
  ozn_kategorie?: OznaceniKategorie | null;
  ozn_mlci_od?: string | null;
  ozn_lhuta_do?: string | null;
  ozn_pokusy?: number | null;
  /**
   * jen list_oznacene: id označení, kdy vzniklo, poslední „nedovolal/a jsem se“, jestli je z prvního běhu (lhůta 10
   * pracovních dní) a komu je označený (ozn_volajici_id a jméno ozn_volajici, u označení bez vlastníka „bez volajícího“;
   * obojí jen super admin a Albert, Volajícímu klíče chybí)
   */
  ozn_id?: number | null;
  ozn_oznaceno_at?: string | null;
  ozn_posledni_pokus_at?: string | null;
  ozn_zavadeci?: boolean | null;
  ozn_volajici_id?: number | null;
  ozn_volajici?: string | null;
  /**
   * jen list_oznacene, migrace 063 (Albert 1. 11. 2026, druhá etapa): kdy po lhůtě na zavolání ověřeně odešla připomínka
   * e-mailem (oznaceni.pripominka_at otevřeného označení, které přihlášený vidí); null = ještě ne, server bez 063 klíč nepošle
   */
  ozn_pripominka_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MyStats {
  calls: number;
  reached: number;
  zajem: number;
  odmitnuto: number;
  nedovolano: number;
  conversion: number;
  sold: number;
}

export interface UserStats extends MyStats {
  user_id: number;
  username: string;
  display_name: string;
  role: Role;
  active: boolean;
  /** super admin, pod kterého člověk patří (migrace 023); super admin ho nemá */
  manager_id: number | null;
  manager_name: string | null;
  /**
   * Migrace 056 (Albert 27. 10. 2026): počty nerelevantních a přeplánovaných hovorů (jako statistiky_volani), s dnem
   * (`allStats(token, den)`) jen toho dne. Server bez migrace 056 je neposílá.
   */
  nerelevantni?: number;
  preplanovano?: number;
}

/**
 * Řazení seznamů podle poslední změny kontaktu (migrace 056, Albert 27. 10. 2026: „sort them … from the newest to the
 * oldest updated client“) = sloupec „Změněno“. null / chybí = výchozí pořadí serveru.
 * ⚠ Migrace 057 (Albert 28. 10. 2026: „both filters. One for the latest change regarding anything … and the second one
 * should be just the last time they were called“): poslední změna = posledni_zmena (i změna stavu, odeslaný návrh
 * a odpovědi od automatizace; NAHRAZUJE „updated_at“ z 056) a navíc hovor_* podle posledního hovoru (posledni_hovor,
 * kontakty bez hovoru na konci). Server bez 057 hovor_* odmítne („Neplatné řazení“, appka řekne BEZ_057_HOVOR).
 * Migrace 060 (Albert 1. 11. 2026: „sort by longest silence / star first“): mlceni = nejdéle bez odpovědi napřed (podle
 * mlci_pd, nemlčící na konci), hvezda = s hvězdou napřed, pak nejdéle bez odpovědi. Volajícímu jen mezi jeho klienty.
 * Server bez 060 je odmítne („Neplatné řazení“, appka řekne BEZ_060_RAZENI).
 */
export type Razeni = 'zmena_nejnovejsi' | 'zmena_nejstarsi' | 'hovor_nejnovejsi' | 'hovor_nejstarsi' | 'mlceni' | 'hvezda';

/**
 * Filtry Moji klienti (migrace 056, Albert 27. 10. 2026: „the same like filters as we have in the contacts … this only
 * applies for the super admins“). Server je bere stejně jako list_kontakty nad klienty vybraného člověka. Prázdné (null)
 * = beze změny, jako dřív. ⚠ Migrace 060 (Albert 1. 11. 2026: Volající mají v Moji klienti VŠECHNY filtry, nad svými
 * klienty) NAHRAZUJE „Appka je posílá jen za super admina“ a přidává filtry FiltryMlceni (níž).
 */
export interface MojiFiltry {
  status?: string | null;
  rating?: string | null;
  search?: string | null;
  cekani?: CekaniKind | null;
  kos?: CekaniKos | null;
  razeni?: Razeni | null;
  /* migrace 060, význam jako ve FiltryMlceni */
  statusy?: KontaktStatus[] | null;
  znamky?: ZnamkaFiltr[] | null;
  jen_hvezda?: boolean | null;
  kategorie?: OznaceniKategorie[] | null;
  mlci_min?: number | null;
  mlci_max?: number | null;
  /** migrace 068 (Albert 13. 11. 2026): jen klient, který nám napsal, neodmítl a web ještě nepotvrdil */
  odpovedel?: boolean | null;
  /**
   * Migrace 074 (Přehled vedení, Albert 17. 11. 2026, D7): výběr lidí = klienti kohokoli z nich (p_user_ids). Appka ho posílá
   * jen místo `userId` (nikdy s ním) a jen když výběr není „jen já“; server bez 074 = BEZ_074_LIDE.
   */
  user_ids?: number[] | null;
}

export interface AdminMessage {
  id: number;
  kontakt_id: number | null;
  from_agent: string | null;
  subject: string | null;
  body: string | null;
  status: 'open' | 'resolved';
  reply: string | null;
  apply_always: boolean;
  created_at: string;
  resolved_at: string | null;
  kontakt_name: string | null;
  kontakt_phone: string | null;
}

export type ChatSender = 'agent' | 'admin';
export type ThreadStatus = 'open' | 'resolved';

/** Vlákno tak, jak ho vrací get_thread (bez preview polí). */
/** Čeho se vlákno týká: celé automatizace, nebo jednoho klienta (migrace 017). */
export type ThreadScope = 'automatizace' | 'klient';

export interface ChatThreadInfo {
  id: number;
  kontakt_id: number | null;
  kontakt_name: string | null;
  subject: string;
  status: ThreadStatus;
  scope: ThreadScope;
  /** Klíč poruchy — vlákna se stejným klíčem popisují tutéž věc. */
  alert_key: string | null;
  created_by: string;
  last_message_at: string;
  created_at: string;
  /** čí je to klient (migrace 023, 027): super admin a Albert vidí jméno vždy, ostatní jen svoje */
  majitel?: string | null;
  /** migrace 027: smí přihlášený do vlákna psát / vyřešit ho? (jen get_thread; false = jen ke čtení) */
  smi_psat?: boolean;
}

/** Řádek seznamu vláken z list_threads (s preview poslední zprávy). */
export interface ChatThread extends ChatThreadInfo {
  last_message_preview: string | null;
  last_sender_type: ChatSender | null;
  message_count: number;
  /** Kolik DALŠÍCH otevřených vláken je o téže poruše (0, když alert_key chybí). */
  same_alert_open: number;
}

/** Stav návrhu pravidla (migrace 024): čeká na Albertovo schválení / zapsáno / zamítnuto. */
export type PravidloStav = 'ceka' | 'zapsano' | 'zamitnuto';

export interface ChatMessage {
  id: number;
  thread_id?: number;
  sender_type: ChatSender;
  sender_name: string;
  body: string;
  /** „Navrhnout jako pravidlo" — od migrace 024 jen NÁVRH, do pravidel ho zapíše až Albertův souhlas. */
  apply_always: boolean;
  /** stav toho návrhu (get_thread, migrace 024); null u zpráv, které návrh nejsou */
  pravidlo_stav?: PravidloStav | null;
  created_at: string;
}

export interface ThreadDetail {
  thread: ChatThreadInfo;
  messages: ChatMessage[];
}

/**
 * Kontrola odpovědí (migrace 083, Albert 26. 11. 2026): super admin u klienta zapne kontrolu a automatizace mu nic nepošle
 * bez schválení. Stav návrhu e-mailu, který brána odeslání uložila ke schválení.
 */
export type NavrhStav =
  | 'ceka'
  | 'schvaleno'
  | 'odesila'
  | 'odeslano'
  | 'vraceno'
  | 'nahrazeno'
  | 'zruseno'
  | 'neodeslano'
  | 'chyba';

/** Návrh e-mailu ke schválení (kontrola_odpovedi_detail, jen super admin). */
export interface NavrhKeKontrole {
  id: number;
  kontakt_id: number;
  stav: NavrhStav;
  stav_text: string;
  druh: 'odpoved' | 'nova';
  komu: string;
  predmet: string;
  telo: string;
  priloha_nazev: string | null;
  chat_thread_id: number | null;
  /** zpráva automatizace „KE SCHVÁLENÍ…“ ve vlákně; u super admina se místo ní ukáže karta návrhu */
  zadost_zprava_id: number | null;
  vytvoreno: string;
  pripominek: number;
  pripomenuto_at: string | null;
  rozhodl: string | null;
  rozhodnuto_at: string | null;
  poznamka: string | null;
  odeslat_po: string | null;
  odeslano_at: string | null;
  duvod: string | null;
  nahrazen_id: number | null;
  nahrazuje_id: number | null;
  /** klient od té doby napsal: schválit nejde, agent připraví nový návrh */
  zastaraly: boolean;
  /** smí přihlášený schválit a vrátit (super admin, který klienta smí upravovat) */
  smi_rozhodnout: boolean;
}

/** Přepínač kontroly odpovědí u klienta a posledních 30 návrhů (kontrola_odpovedi_detail, jen super admin). */
export interface KontrolaOdpovedi {
  kontakt_id: number;
  zapnuto: boolean;
  zapnul: string | null;
  zapnul_id: number | null;
  zapnuto_at: string | null;
  duvod: string | null;
  /** smí přihlášený přepínač měnit (super admin, který klienta smí upravovat) */
  smi_menit: boolean;
  /** návrhy, které čekají, jsou schválené nebo se odesílají */
  cekajici: number;
  navrhy: NavrhKeKontrole[];
}

export interface ListKontaktyResult {
  /**
   * Kolik řádků celkem sedí na filtr. Od migrace 045 (Albert 20. 10. 2026) u list_kontakty jen super admin
   * a Albert; Volající dostane null (součty celé databáze jsou i čísla kolegů). my_kontakty ho posílá dál.
   */
  total: number | null;
  rows: Kontakt[];
  /** migrace 045: za touhle stránkou je ještě aspoň jeden řádek (list_kontakty, každý) */
  dalsi?: boolean;
}

/**
 * Výsledek hovoru. Migrace 050 (Albert 21. 10. 2026): i `nerelevantni` (kontakt není relevantní, jen s poznámkou proč,
 * mimo konverzi) a `preplanovano` (člověk chce zavolat jindy: `kdy`, kontakt zůstává ve frontě a drží ho kalendář).
 */
export type VysledekHovoru = 'nedovolano' | 'odmitnuto' | 'zajem' | 'nerelevantni' | 'preplanovano';

export interface ResolveCallArgs {
  kontakt_id: number;
  outcome: VysledekHovoru;
  /**
   * Ceny u `zajem` jsou od migrace 051 (Albert 22. 10. 2026) nepovinné: null = cena zatím nedohodnutá („n/a“), server
   * pak cenu, která u kontaktu už je, nepřepíše. Appka prázdné pole posílá jako null, nikdy ''.
   */
  cena_web?: string | null;
  cena_hosting?: string | null;
  note?: string | null;
  rating?: string | null;
  email?: string | null;
  /** jen u `preplanovano`: kdy zavolat znovu (ISO); appka ho jinak serveru neposílá (starý server p_kdy nezná) */
  kdy?: string | null;
}

export interface ListKontaktyFilters {
  status?: string | null;
  caller?: string | null;
  rating?: string | null;
  search?: string | null;
  /** filtr „na koho se čeká" (migrace 014) */
  cekani?: CekaniKind | null;
  /** koš podle stáří čekání */
  kos?: CekaniKos | null;
  /** segment (migrace 028); null / chybí = vše */
  segment?: Segment | null;
  /** řazení podle poslední změny (migrace 056) nebo posledního hovoru (057); null / chybí = výchozí pořadí; Volajícímu jen mezi
   *  jeho klienty (a do posledního hovoru jen jeho hovory) */
  razeni?: Razeni | null;
  limit?: number;
  offset?: number;
  /* migrace 060, význam jako ve FiltryMlceni (Volajícímu jen nad jeho klienty, jako stav a známka od 045) */
  statusy?: KontaktStatus[] | null;
  znamky?: ZnamkaFiltr[] | null;
  jen_hvezda?: boolean | null;
  kategorie?: OznaceniKategorie[] | null;
  mlci_min?: number | null;
  mlci_max?: number | null;
  /** migrace 068 (Albert 13. 11. 2026): jen klient, který nám napsal, neodmítl a web ještě nepotvrdil */
  odpovedel?: boolean | null;
  /**
   * Migrace 074 (Přehled vedení, Albert 17. 11. 2026, D7): výběr lidí (p_user_ids) = sjednocení dnešního `caller` za každého
   * z nich. Nikdy spolu s `caller` (server by odmítl); server bez 074 = BEZ_074_LIDE.
   */
  user_ids?: number[] | null;
}

/**
 * Kombinovatelné filtry seznamů (migrace 060, Albert 1. 11. 2026: stejné filtry v Kontaktech, Moji klienti
 * i Označených): stav (víc najednou), známka (A, B, C, bez), jen s hvězdou, kategorie označení (na návrh, na změny)
 * a mlčení v pracovních dnech od a do (včetně). Všechny zapnuté filtry platí najednou (A ZÁROVEŇ), z hodnot jednoho
 * filtru stačí kterákoli (NEBO). Prázdné pole nebo null = filtr vypnutý; appka pak parametr serveru vůbec nepošle
 * (server bez 060 ho nezná). Volajícímu berou jen jeho klienty a jen jeho označení (cizí kontakt nikdy nesedí).
 */
export type FiltryMlceni = Pick<ListKontaktyFilters, 'statusy' | 'znamky' | 'jen_hvezda' | 'kategorie' | 'mlci_min' | 'mlci_max' | 'odpovedel'>;

/**
 * Označené (list_oznacene, migrace 060): kontakty s otevřeným označením k zavolání, které přihlášený vidí (Volající jen
 * svoje označení, super admin a Albert všechna, `user_id` / `bez_volajiciho` je zúží), A kontakty s příznakem jako dřív
 * (rozsah list_flagged). `druhy` = 'navrh', 'zmeny' a druhy příznaků (NEBO). Bez stránkování.
 */
export interface OznaceneFiltry extends Omit<FiltryMlceni, 'kategorie'> {
  druhy?: string[] | null;
  segment?: Segment | null;
  user_id?: number | null;
  bez_volajiciho?: boolean | null;
  hledat?: string | null;
  razeni?: Razeni | null;
  /** migrace 074 (D7): označení a příznaky kohokoli z vybraných (p_user_ids); nikdy s `user_id` ani `bez_volajiciho` */
  user_ids?: number[] | null;
}

/**
 * Výsledek zapis_hovor (migrace 060): co se se zápisem stalo. Od migrace 062 (Albert 2. 11. 2026: „Zavolal/a jsem“ i bez
 * označení) vybere větev server: `oznaceno` true = zápis šel do otevřeného označení (jako 061), false = dovolání bez
 * označení (oznaceni_id, otevrene a pokusy jsou null; označení kolegy ani bez volajícího se nikdy nevrátí). Chybí
 * (undefined) = server bez migrace 062 (zapsal jen do označení).
 */
export interface ZapisHovoruVysledek {
  ok: boolean;
  kontakt_id: number;
  oznaceni_id?: number | null;
  /** migrace 062: true = do označení, false = bez označení (Moji klienti, Kontakty, detail, kalendář) */
  oznaceno?: boolean;
  vysledek?: VysledekDovolani;
  /** označení zůstalo otevřené (nedovolal/a jsem se), jinak uzavřené výsledkem hovoru; bez označení null */
  otevrene?: boolean | null;
  pokusy?: number | null;
  status?: KontaktStatus;
  /** má kontakt po zápisu hvězdu, a změnila se */
  hvezda?: boolean;
  hvezda_zmena?: boolean | null;
  /** vlákno, kam šel vzkaz agentovi s poznámkou (od migrace 061 u každého výsledku s poznámkou), jinak null */
  vlakno_id?: number | null;
  /**
   * Migrace 061: kam šla poznámka. true = automatizaci (řádek v poznámce kontaktu a vzkaz „Dovolání (jméno): …“ do vlákna),
   * false = jen do události dovolani, kterou appka nikde neukazuje (kdo kontakt upravit nesmí, smí jen „Nedovolal/a jsem
   * se“), null = bez poznámky. Chybí (undefined) = server bez migrace 061: poznámku k nedovolání tam dostane jen událost.
   */
  poznamka_predana?: boolean | null;
}

/** Položka „Co klient chce / napsal“ přehledu (automatizace, migrace 060); zdroj e-mail, hovor nebo zpráva v appce. */
export interface PrehledKlientChce {
  datum: string;
  text: string;
  zdroj: 'e-mail' | 'hovor' | 'zprava';
}

/**
 * Přehled klienta, jak ho píše automatizace (kontakty.prehled, migrace 060; od druhé etapy, migrace 063, ho píše worker). Tvar hlídá
 * trigger na serveru: verze 1, „ted“ nejvýš 300 znaků, nejvýš 5 + 5 + 3 položek, bez jmen týmu, čísel faktur a technických id.
 */
export interface PrehledText {
  verze: number;
  ted?: string | null;
  klient_chce?: PrehledKlientChce[] | null;
  poslali_jsme?: { datum: string; text: string }[] | null;
  pozor?: { text: string }[] | null;
}

/**
 * Fakta přehledu (kontakt_prehled, migrace 060): server je skládá z dat bez jazykového modelu, vždycky. Chybějící klíč
 * nebo null = nic (appka řádek neukáže). Jméno vlastníka označení a toho, kdo volá naplánovaný hovor, jen super admin
 * a Albert (Volajícímu null); kdo dal hvězdu, u kolegy „jiný volající“.
 */
export interface PrehledFakta {
  stav?: KontaktStatus | null;
  stav_od?: string | null;
  hvezda?: { at: string; kdo: string | null; duvod: string | null } | null;
  oznaceni?: {
    id: number;
    kategorie: OznaceniKategorie;
    mlci_od: string | null;
    oznaceno_at: string | null;
    lhuta_do: string | null;
    pokusy: number;
    posledni_pokus_at?: string | null;
    volajici?: string | null;
  } | null;
  mlci_pd?: number | null;
  prvni_navrh?: string | null;
  nase_posledni?: string | null;
  klient_naposledy?: string | null;
  /**
   * poslední nabídka poloviční ceny: kdy odešla, poslední den platnosti (+14 dní), z kampaně, den archivu (migrace 063, Albert
   * 4. 11. 2026: +60 dní od naší poslední zprávy, hovoru nebo zprávy člověka; null = tick ho nearchivuje)
   */
  nabidka?: { odeslana_at: string; konci_dne: string | null; kampan: boolean; archiv_dne: string | null } | null;
  pripominka_kampane?: string | null;
  /**
   * migrace 063 (Albert 1. 11. 2026, druhá etapa): kdy naposledy odešla připomínka po lhůtě na zavolání (nejnovější
   * oznaceni.pripominka_at z označení, která přihlášený vidí, i uzavřených: Volajícímu jen z jeho); null = žádná
   */
  pripominka_oznaceni?: string | null;
  /** spící budík smazání náhledu (architekt po 8A) */
  nahled_smazani?: string | null;
  zavolat?: { id: number; kdy: string; poznamka: string | null; muj: boolean; volajici?: string | null } | null;
  cena_web?: string | null;
  cena_hosting?: string | null;
}

/** kontakt_prehled (migrace 060): jen vlastník podle pravidla o vlastních klientech, super admin a Albert. */
export interface KontaktPrehled {
  kontakt_id?: number;
  prehled: PrehledText | null;
  prehled_at: string | null;
  fakta: PrehledFakta;
}

/** Argumenty update_user (migrace 004) — aplikují se jen ne-null/ne-undefined pole. */
export interface UpdateUserArgs {
  display_name?: string | null;
  password?: string | null;
  role?: Role | null;
  active?: boolean | null;
  /** nadřízený super admin (mění jen Albert, migrace 023) */
  manager_id?: number | null;
}

/** Řádek uživatele, jak ho vrací update_user. */
export interface UpdatedUser {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  active: boolean;
  manager_id: number | null;
}

/* ---- přepínání účtů Claude (migrace 011) + vypínač automatizace (migrace 012) ---- */
export type AutomationPhase = 'running' | 'draining' | 'stopped';
/** Proč se vyprazdňuje: přepnutí účtu, nebo vypnutí celé automatizace. */
export type AutomationDrainReason = 'switch' | 'stop';

/** Účet Claude, který umí vézt automatizaci (token má orchestrátor v config.env). */
export interface AutomationAccount {
  slug: string;
  label: string;
  email: string | null;
  token_present: boolean;
  updated_at: string;
}

/** Jediný řádek automation_control: kdo veze automatizaci, jestli probíhá přepnutí/vypnutí a jestli je vypnutá. */
export interface AutomationControl {
  id: number;
  active_account: string;
  requested_account: string;
  phase: AutomationPhase;
  drain_reason: AutomationDrainReason | null;
  requested_by: string | null;
  requested_at: string | null;
  drain_started_at: string | null;
  switched_at: string | null;
  notified_at: string | null;
  stop_requested_at: string | null;
  stopped_at: string | null;
  stop_notified_at: string | null;
  started_at: string | null;
  updated_at: string;
}

export interface AutomationRunningJob {
  id: number;
  type: string;
  kontakt_id: number | null;
  kontakt_name: string | null;
  account: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationStatus {
  control: AutomationControl;
  accounts: AutomationAccount[];
  running: AutomationRunningJob[];
  queued: number;
}

export interface MeInfo {
  user_id: number;
  username: string;
  display_name: string;
  role: Role;
  manager_id: number | null;
}

/* ---- rozvrh volání (migrace 042, Albert 18. 10. 2026) ---- */

/** Plnění týdne: pozadu (méně hovorů než cíl dnů do včerejška), v plánu, napřed, bez rozvrhu. */
export type RozvrhStav = 'pozadu' | 'v_planu' | 'napred' | 'bez_rozvrhu';

/** Jeden den aktuálního týdne: šablona (hodiny, od), cíl, hovory z call_log a poznámka. */
export interface RozvrhDen {
  /** 1 = pondělí … 7 = neděle */
  den: number;
  /** YYYY-MM-DD (den v Praze) */
  datum: string;
  hodiny: number;
  /** HH:MM, kdy začít volat; null = nezadáno */
  od: string | null;
  /** hodiny × hovoru_za_hodinu */
  cil: number;
  hovory: number;
  minuly: boolean;
  dnes: boolean;
  /** den před tím, než byl rozvrh poprvé nastavený: bez cíle a jeho hovory se do týdne nepočítají */
  pred_rozvrhem: boolean;
  poznamka: string | null;
  poznamka_at: string | null;
}

export interface RozvrhSouhrn {
  stav: RozvrhStav;
  /** o kolik hovorů pozadu nebo napřed (v plánu 0) */
  rozdil: number;
  rozdil_hodiny: number;
  cil_do_vcera: number;
  cil_do_dnes: number;
  cil_tyden: number;
  hovory_tyden: number;
  dnes_hodiny: number;
  dnes_od: string | null;
  dnes_cil: number;
  dnes_hovory: number;
  /** kolik hovorů dnes ještě do splnění plánu (i s dluhem z dřívějších dnů) */
  dnes_zbyva: number;
  dnes_zbyva_hodiny: number;
}

/** rozvrh_get: rozvrh člověka v aktuálním týdnu a co s ním smí přihlášený dělat (server rozhoduje). */
export interface Rozvrh {
  user_id: number;
  display_name: string;
  role: Role;
  nastaveny: boolean;
  zamceno: boolean;
  nastavil: string | null;
  nastaveno_at: string | null;
  zmenil: string | null;
  zmeneno_at: string | null;
  /** cíl hovorů za hodinu volání (jediné číslo je na serveru) */
  hovoru_za_hodinu: number;
  tyden_od: string;
  tyden_do: string;
  dnes: string;
  dny: RozvrhDen[];
  souhrn: RozvrhSouhrn;
  smi_upravit: boolean;
  smi_odemknout: boolean;
  smi_psat_poznamky: boolean;
}

/** Řádek rozvrh_prehled (jen super admin): bez dnů, s nadřízeným a počtem poznámek. */
export interface RozvrhPrehledRadek extends Omit<Rozvrh, 'dny' | 'smi_upravit' | 'smi_odemknout' | 'smi_psat_poznamky'> {
  manager_id: number | null;
  manager_name: string | null;
  poznamek: number;
}

/** Den, jak ho posílá appka do rozvrh_ulozit. */
export interface RozvrhDenVstup {
  den: number;
  hodiny: number;
  od: string | null;
}

/* ---- kalendář hovorů a výdělek (migrace 050, Albert 21. 10. 2026) ---- */

/** Čekající naplánovaný hovor přihlášeného na kartě ve volání (klíč `zavolat`). */
export interface ZavolatKarta {
  id: number;
  kdy: string;
  poznamka: string | null;
}

export type ZavolatStav = 'ceka' | 'hotovo' | 'zruseno';

/**
 * Řádek kalendáře hovorů (app_zavolat_ven). `kontakt` je řádek stejnou maskou jako v seznamech: Volající u kontaktu,
 * který není jeho (naplánoval mu ho super admin), dostane jen allowlist se `skryto: true`. `vytvoril` jiného Volajícího
 * je „jiný volající“ (045).
 */
export interface ZavolatPolozka {
  id: number;
  kontakt_id: number;
  /** kdo má volat */
  user_id: number;
  volajici: string | null;
  kdy: string;
  poznamka: string | null;
  stav: ZavolatStav;
  vysledek: string | null;
  created_at: string;
  zmeneno_at: string | null;
  uzavreno_at: string | null;
  /** kdo hovor naplánoval */
  vytvoril: string | null;
  /** volá ho přihlášený */
  muj: boolean;
  /** smí ho přihlášený přesunout, zrušit nebo označit hotový (čekající a jeho, nebo super admin) */
  smi_upravit: boolean;
  /** kontakt je ve frontě volání (nekontaktovano, nedovolano): „Zavolat teď“ otevře kartu ve volání */
  ve_fronte: boolean;
  kontakt: Kontakt;
}

/** zavolat_seznam: čekající (nejstarší první, i po termínu) a uzavřené za 14 dní (nejnovější první). */
export interface ZavolatSeznam {
  /** dnešní den v Praze YYYY-MM-DD */
  dnes: string;
  /** čas serveru */
  ted: string;
  polozky: ZavolatPolozka[];
}

/** Jeden prodaný web ve výdělku (app_vydelek). */
export interface VydelekProdej {
  kontakt_id: number;
  jmeno: string;
  segment: Segment;
  prodano_at: string;
  /** text ceny, ze kterého se počítalo (cena webu, nebo částka ze slevy); u nedohodnuté ceny null nebo výplň („Xx“) */
  cena: string | null;
  zdroj: 'cena_web' | 'sleva';
  /** přečtená částka; null = cena nejde přečíst přesně, nebo zatím není dohodnutá (do součtu se nepočítá) */
  castka: number | null;
  mena: 'kc' | 'eur' | null;
  provize: number | null;
  tento_tyden: boolean;
  /**
   * Cena webu zatím není dohodnutá (migrace 051, Albert 22. 10. 2026): bez slevy a cena webu prázdná nebo zástupná
   * (app_cena_nezadana). Appka ukáže cenu i provizi „n/a“. Server bez migrace 051 klíč neposílá (= false).
   */
  neznama?: boolean;
}

/** Výdělek: 30 % z ceny každého prodaného webu (ne z hostingu), celkem a v tomto týdnu (po až ne, Praha). */
export interface Vydelek {
  sazba_procent: number;
  tyden_od: string;
  tyden_do: string;
  prodano: number;
  celkem_kc: number;
  tyden_kc: number;
  celkem_eur: number;
  tyden_eur: number;
  /** prodeje se zapsanou cenou, která nejde přečíst (rozpětí, „po domluvě“); od migrace 051 bez nedohodnutých */
  nejasne: number;
  nejasne_tyden: number;
  /**
   * Prodeje, u kterých cena webu zatím není dohodnutá (migrace 051, Albert 22. 10. 2026: „earnings count only once a
   * price is known“); do součtu se nepočítají, započítají se samy, až bude cena webu v detailu klienta. Server bez
   * migrace 051 je neposílá (= 0, takové prodeje jsou pak v `nejasne`).
   */
  neznama?: number;
  neznama_tyden?: number;
  prodeje: VydelekProdej[];
}

/** statistiky_volani: počty hovorů nerelevantni a preplanovano a výdělek. Svoje každý, cizí jen super admin. */
export interface StatistikyVolani {
  user_id: number;
  nerelevantni: number;
  preplanovano: number;
  vydelek: Vydelek;
}

/**
 * Počty klientů jednoho řádku tabulky „Zájem podle volajících“ (zajem_podle_volajicich, migrace 069, Albert 15. 11. 2026).
 * chce_web = stav schvaleno a dál (web potvrdil); odpovedel = napsal, neodmítl a web ještě nepotvrdil (filtr 068);
 * zajem = chce_web + odpovedel (Albertovo „interested“); ceka = navrh_odeslan bez odpovědi. Jsou to KONTAKTY, ne hovory.
 */
export interface ZajemPocty {
  chce_web: number;
  odpovedel: number;
  zajem: number;
  ceka: number;
}

/** Řádek volajícího (kontakty.last_caller, jako filtr Volající v Kontaktech); účet podle jména, bez účtu null. */
export interface ZajemRadek extends ZajemPocty {
  volajici: string;
  user_id: number | null;
  active: boolean | null;
}

/** zajem_podle_volajicich: řádky (jen volající s aspoň jedním klientem), klienti bez volajícího a celkem. Jen super admin. */
export interface ZajemPodleVolajicich {
  radky: ZajemRadek[];
  bez_volajiciho: ZajemPocty;
  celkem: ZajemPocty;
}

/**
 * Zobrazený stav kontaktu jen pro přihlášeného (zobrazene_stavy, migrace 071, Albert 17. 11. 2026): stav, který u toho
 * kontaktu uvidí JEN on (odznak a popisek stavu, src/zobrazeni.ts); skutečný stav (`Kontakt.status`) se nemění a logika,
 * filtry i zápisy jdou dál s ním. Prodáno a Vyděláno s ním počítá server (my_stats, statistiky_volani).
 */
export interface ZobrazenyStav {
  kontakt_id: number;
  stav: KontaktStatus;
}

/**
 * Signál neviditelného časovače práce (prace_tep, migrace 072; Albert 17. 11. 2026, rozhodnutí D5): `karta` = karta ve volání
 * na obrazovce (s kontaktem), `tep` = appka je otevřená a vidět, `konec` = stránka se zavřela nebo schovala. Odpracovaný čas
 * z nich a z výsledků hovorů počítá jen server (kontrakt §5.14); Volající časovač nevidí.
 */
export type DruhSignalu = 'karta' | 'tep' | 'konec';

/** Fáze odmítnutí (kontrakt §3.4): `nahled` = odmítl náhled (návrh webu), `sleva` = odmítl i nabídku za polovinu. */
export type FazeOdmitnuti = 'nahled' | 'sleva';

/** Kód důvodu, proč klient odmítl návrh (kontrakt §3.2; štítky v DUVODY, src/components/DuvodOdmitnuti.tsx). */
export type DuvodOdmitnutiKod = 'ma_web' | 'cena' | 'navrh' | 'nepotrebuje' | 'pozdeji' | 'konci' | 'jine' | 'neuvedl';

/* ---- Přehled vedení: obálka, metrika a lidé (migrace 073, kontrakt docs/superpowers/specs/2026-11-17-prehled-kontrakt.md §2.5–§2.7,
   §5.5 a §7). Jen to, co appka čte; tvary jsou doslova jako v kontraktu. ---- */

/** Kvalita čísla (kontrakt §2.6): dostupne = celé, castecne = část neznámá nebo odhad, nedostupne = chybí zdroj. */
export type KvalitaMetriky = 'dostupne' | 'castecne' | 'nedostupne';
export type MenaPrehledu = 'CZK' | 'EUR';
export type AtribucePrehledu = 'posledni_zajem' | 'prvni_zajem' | 'spravuje';

/** Pokrytí: kolik jednotek má známou hodnotu (podíl na 6 míst, null při celkem 0). */
export interface PokrytiMetriky {
  zname: number;
  celkem: number;
  nezname: number;
  podil: number | null;
}

/** Peníze jedné měny: hodnota je desetinný text na 2 místa („7000.00“); CZK a EUR se nikdy nesčítají. */
export interface CastkaMeny {
  mena: MenaPrehledu;
  hodnota: string | null;
  pokryti: PokrytiMetriky;
}

/** Normalizovaný filtr (meta.filtr, proklik.filtr): všechny klíče vždy přítomné. */
export interface PrehledFiltr {
  od: string;
  do: string;
  lide: number[] | null;
  atribuce: AtribucePrehledu;
  segment: string[] | null;
  obor: string[] | null;
  kraj: string[] | null;
  mena: MenaPrehledu | 'obe';
  zaklad: 'prirozeny' | 'aktivita' | 'prodej' | 'faktura' | 'platba';
  k_datu: string | null;
  /**
   * výběr řádků prokliku (jen prehled_radky; tvar Vyber v kontraktu §7, appka ho jen kopíruje z prokliku, u řady přidá od a do);
   * jinde null. ⚠ Úkol 14c (openapi k a6202706): `krok` = krok trychtýře (§5.4) nebo trychtýře po návrhu (po_navrhu), u
   * prognoza_pravdepodobnost skupina prognózy zajem, navrh, sleva nebo ostatni (§5.11)
   */
  vyber: Record<string, unknown> | null;
}

/** Vstupní filtr p_filtr: každý klíč nepovinný (neznámý klíč nebo špatná hodnota = „Neplatný filtr: <klíč>“). */
export type PrehledFiltrVstup = Partial<PrehledFiltr>;

export interface PrehledProklik {
  zdroj: string;
  filtr: PrehledFiltr;
}

/** Metrika (kontrakt §2.6): všech 13 klíčů vždy; peníze v `castky` (hodnota null), podíly s čitatelem a jmenovatelem. */
export interface Metrika {
  klic: string;
  verze: number;
  nazev: string;
  hodnota: number | null;
  castky: CastkaMeny[];
  citatel: number | null;
  jmenovatel: number | null;
  n: number | null;
  pokryti: PokrytiMetriky | null;
  kvalita: KvalitaMetriky;
  duvod: string | null;
  zaklad: string;
  proklik: PrehledProklik | null;
}

export interface PrehledMeta {
  vygenerovano: string;
  k_datu: string;
  casove_pasmo: 'Europe/Prague';
  filtr: PrehledFiltr | null;
  zdroje: { zdroj: string; od: string | null; aktualni_k: string | null }[];
  varovani: { kod: string; text: string }[];
}

/** Obálka odpovědi reportovací funkce (kontrakt §2.5). */
export interface PrehledObalka<T> {
  api_verze: '1';
  definice_verze: string;
  meta: PrehledMeta;
  data: T;
}

/** Klíče metrik řádku lidí (kontrakt MetrikyCloveka, vždy všech 23). */
export type MetrikaCloveka =
  | 'hovory' | 'unikatni_klienti' | 'dovolano' | 'mira_dovolani' | 'zajem' | 'odmitnuto' | 'nerelevantni' | 'preplanovano'
  | 'konverze' | 'navrhy' | 'pocet_prodeju' | 'hodnota_prodeju' | 'provize_narok' | 'provize_vyplaceno' | 'provize_zbyva'
  | 'odpracovane_hodiny' | 'vysledku_za_hodinu' | 'planovane_hodiny' | 'plneni_planu' | 'sla_prvni_kontakt_median'
  | 'sla_prvni_kontakt_p90' | 'naplanovane_hotove' | 'naplanovane_po_terminu';

/** Řádek tabulky lidí (prehled_lide): člověk, Nepřiřazeno, nebo součet „Celkem“. */
export interface RadekLide {
  druh: 'osoba' | 'neprirazeno' | 'soucet';
  user_id: number | null;
  display_name: string;
  role: Role | null;
  active: boolean | null;
  tym_id: number | null;
  tym_nazev: string | null;
  sla_cenzurovano: number | null;
  metriky: Record<MetrikaCloveka, Metrika>;
}

/** data funkce prehled_lide. */
export interface DataLide {
  atribuce: AtribucePrehledu;
  radky: RadekLide[];
  soucet: RadekLide;
}

/* ---- Přehled vedení: ostatní funkce migrace 073 (úkol 13, kontrakt §5.1 až §5.17 a tvary §7, doslova). Úkol 14 nad nimi staví
   obsah záložek; nic z toho Volající nedostane (server „Přehled vidí jen super admin.“, appka trasu ani volání nemá). ---- */

/** Jednotka metriky (§3.11): pocet, mena (castky), podil (0–1 i víc), h, d, pocet_a_mena. */
export type JednotkaMetriky = 'pocet' | 'mena' | 'podil' | 'h' | 'd' | 'pocet_a_mena';
/** Stav kontaktu tak, jak ho vrací reporting (skutečný stav, nikdy zobrazený, §7 Status). */
export type StavPrehledu = KontaktStatus;
/** Zdroj řádků prehled_radky (§2.8). */
export type RadkyZdroj = 'kontakty' | 'hovory' | 'prodeje' | 'faktury' | 'platby' | 'naklady' | 'provize' | 'odmitnuti' | 'zpravy' | 'akce' | 'prace';
export type ZrnitostRady = 'den' | 'tyden' | 'mesic';
/** Metriky řady prehled_rada (§5.3). */
export type MetrikaRadyKlic = 'hovory' | 'dovolano' | 'zajem' | 'navrhy' | 'pocet_prodeju' | 'hodnota_prodeju' | 'inkaso' | 'naklady_celkem' | 'odpracovane_hodiny';
export type CenaStav = 'presne' | 'rozsah' | 'nezname';
export type KategorieVyuctovani = 'provize' | 'claude' | 'lovable' | 'domena' | 'hosting' | 'jine';
export type SignalKod = 'klient_ceka' | 'navrh_mlci' | 'hovor_po_terminu' | 'faktura_nepotvrzena' | 'schvaleno_bez_faktury' | 'sleva_konci' | 'otazka';
export type DuvodRadku = DuvodOdmitnutiKod | 'nereagoval_na_nabidku' | 'mlci_po_navrhu' | 'bez_duvodu';
export type PasmoStari = '0-7' | '8-14' | '15-30' | '31+';

/** Peníze jedné měny bez pokrytí (§7 CastkaJedna). */
export interface CastkaJedna {
  mena: MenaPrehledu;
  hodnota: string | null;
}

/** Člověk, kterému se něco připisuje (§7 Osoba). */
export interface OsobaPrehledu {
  user_id: number;
  display_name: string;
  tym_id: number | null;
  tym_nazev: string | null;
}

/** Rozbor textové ceny (§7 CenaRozbor, app_cena_rozbor). */
export interface CenaRozbor {
  stav: CenaStav;
  castka: string | null;
  min: string | null;
  max: string | null;
  mena: MenaPrehledu | null;
}

/* prehled_moznosti (§5.1) */
export interface OsobaMoznosti {
  id: number;
  display_name: string;
  role: Role;
  active: boolean;
  manager_id: number | null;
  manager_name: string | null;
  tym_id: number | null;
  smim_cil: boolean;
  smim_vyplatu: boolean;
}
export interface TymPrehledu {
  id: number;
  nazev: string;
  vedouci_id: number;
  vedouci_jmeno: string;
  clenove: number[];
  clenove_aktivni: number[];
  smim_cil: boolean;
}
export interface ZdrojStav {
  zdroj: string;
  nazev: string;
  od: string | null;
  aktualni_k: string | null;
  stav: 'ok' | 'zastarale' | 'chyba' | 'chybi';
  poznamka: string | null;
}
export interface GmailSync {
  schranka: string;
  posledni_uspech: string | null;
  posledni_pokus: string | null;
  stav: 'ok' | 'bezi' | 'chyba' | 'znovu' | null;
  chyba: string | null;
}
export interface DataMoznosti {
  ja: { user_id: number; display_name: string; je_albert: boolean };
  lide: OsobaMoznosti[];
  tymy: TymPrehledu[];
  firma_smim_cil: boolean;
  segmenty: { klic: string; nazev: string; rodina: 'chata' | 'architekt' | 'obor'; stav: string | null; kontaktu: number }[];
  obory: { klic: string; segment: string; nazev: string; kontaktu: number }[];
  kraje: { klic: string; nazev: string; kontaktu: number }[];
  meny: MenaPrehledu[];
  atribuce: { klic: AtribucePrehledu; nazev: string; vychozi: boolean }[];
  zaklady: { klic: PrehledFiltr['zaklad']; nazev: string; vychozi: boolean }[];
  metriky: { klic: string; nazev: string; jednotka: JednotkaMetriky; kvalita: KvalitaMetriky; duvod: string | null }[];
  zdroje: ZdrojStav[];
  cerstvost: { tick_at: string | null; posta_klienta_at: string | null; gmail: GmailSync[]; snimek_den: string | null; snimek_at: string | null };
}

/* prehled_souhrn (§5.2) */
export type KartaKlic = 'hodnota_prodeju' | 'inkaso' | 'pocet_prodeju' | 'plneni_cile' | 'uspesnost' | 'otevrene' | 'odhad_mesic' | 'k_zasahu';
export interface CilPrehledu {
  id: number;
  metrika: 'prodane_weby' | 'hodnota_prodeju' | 'inkaso' | 'hovory' | 'zajem' | 'odpracovane_hodiny';
  obdobi_od: string;
  obdobi_do: string;
  user_id: number | null;
  user_jmeno: string | null;
  tym_id: number | null;
  tym_jmeno: string | null;
  mena: MenaPrehledu | null;
  hodnota: string;
  zadal: string;
  zadano_at: string;
  smi_upravit: boolean;
}
export interface DataSouhrn {
  karty: Record<KartaKlic, Metrika>;
  cil: CilPrehledu | null;
}

/* prehled_rada (§5.3) */
export interface BodRady {
  od: string;
  do: string;
  uplny: boolean;
  hodnota: number | null;
  castky: CastkaJedna[];
  kvalita: KvalitaMetriky;
  duvod: string | null;
}
export interface DataRada {
  metrika: { klic: string; nazev: string; jednotka: JednotkaMetriky };
  zrnitost: ZrnitostRady;
  body: BodRady[];
  proklik: PrehledProklik | null;
  cile: { cil_id: number; od: string; do: string; hodnota: string; mena: MenaPrehledu | null; skutecnost: string | null; plneni: number | null; kvalita: KvalitaMetriky }[];
}

/* prehled_trychtyr (§5.4) */
export interface KohortaTrychtyre {
  popis: string;
  od: string;
  do: string;
  n: number;
  proklik: PrehledProklik | null;
}
export interface KrokTrychtyre {
  klic: 'osloven' | 'dovolan' | 'zajem' | 'navrh' | 'prodano' | 'fakturovano' | 'zaplaceno';
  nazev: string;
  n: number | null;
  z_predchoziho: number | null;
  z_kohorty: number | null;
  otevrenych: number | null;
  bez_predchoziho: number | null;
  zdroj_od: string | null;
  kvalita: KvalitaMetriky;
  duvod: string | null;
  proklik: PrehledProklik | null;
}
export interface KrokPoNavrhu {
  klic: 'navrh' | 'odpovedel' | 'odmitl_nahled' | 'nabidka' | 'prijal_nabidku' | 'odmitl_nabidku' | 'nereagoval_na_nabidku' | 'ceka_na_nabidku' | 'prodano_bez_nabidky';
  nazev: string;
  n: number | null;
  podil: number | null;
  kvalita: KvalitaMetriky;
  duvod: string | null;
  proklik: PrehledProklik | null;
}
export interface DataTrychtyr {
  kohorta: KohortaTrychtyre;
  kroky: KrokTrychtyre[];
  stavy: { popis: string; polozky: { status: StavPrehledu; nazev: string; n: number; proklik: PrehledProklik | null }[] };
  po_navrhu: { kohorta: KohortaTrychtyre; kroky: KrokPoNavrhu[] };
}

/* prehled_pipeline (§5.6) */
export interface Starnuti {
  pasma: { pasmo: PasmoStari; n: number; proklik: PrehledProklik | null }[];
  median_d: number | null;
  p90_d: number | null;
  nezname_n: number;
  celkova_doba: { median_d: number | null; p90_d: number | null; n: number | null; kvalita: KvalitaMetriky; duvod: string | null };
}
export interface StavPipeline {
  n: number | null;
  castky: CastkaMeny[];
}
export interface DataPipeline {
  faze: { status: StavPrehledu; nazev: string; n: number; castky: CastkaMeny[]; nezname_n: number; starnuti: Starnuti; proklik: PrehledProklik | null }[];
  rychlost_navrhu: { median: Metrika; p90: Metrika; cenzurovano: number | null };
  slevy: { nabidnuto: Metrika; prijato: Metrika; mira_prijeti: Metrika; ceny: { mena: MenaPrehledu; puvodni: string; nabidnuta: string; n: number }[] };
  kohorty: {
    mesic: string;
    n: number;
    dovolano: number;
    zajem: number;
    navrh: number;
    prodano: number;
    ztraceno: number;
    otevrenych: number;
    zralost_dni: number;
    v_okne: { dni: number; zajem: number; navrh: number; prodano: number };
    proklik: PrehledProklik | null;
  }[];
  kalibrace_znamky: { znamka: 'A' | 'B' | 'C' | 'bez'; n: number; prodano: number; podil: number | null; proklik: PrehledProklik | null }[];
  kalibrace_hvezdy: Record<'s_hvezdou' | 'bez_hvezdy', { n: number; prodano: number; podil: number | null; proklik: PrehledProklik | null }>;
  pohyby: {
    kvalita: KvalitaMetriky;
    duvod: string | null;
    pocatek: StavPipeline;
    nove: number | null;
    /**
     * na konci otevřené, na začátku v jiné neotevřené skupině než fronta (prodané, ztracené, archiv, vyřazené); úkol 14c, kontrakt
     * §7 PohybyPipeline a §9 5a bod 8 (NAHRAZUJE „na začátku prodané nebo ztracené“)
     */
    znovu_otevrene: number | null;
    vyhrane: number | null;
    ztracene: number | null;
    vyrazene: number | null;
    zmena_hodnoty: CastkaMeny[];
    prirustek_hodnoty: CastkaMeny[];
    ubytek_hodnoty: CastkaMeny[];
    konec: StavPipeline;
    pruchozi: number | null;
  };
}

/* prehled_klienti (§5.7) */
export interface RadekDimenze {
  klic: string;
  nazev: string;
  kontakty: number;
  osloveno: number;
  dovolano: number;
  zajem: number;
  navrhy: number;
  prodano: number;
  hodnota: CastkaMeny[];
  proklik: PrehledProklik | null;
}
export interface DataKlienti {
  zaklad: PrehledFiltr['zaklad'];
  podle_segmentu: RadekDimenze[];
  podle_oboru: RadekDimenze[];
  podle_kraje: RadekDimenze[];
  hodnoceni_webu: { znamka: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'bez'; kontakty: number; osloveno: number; zajem: number; navrhy: number; prodano: number; proklik: PrehledProklik | null }[];
  koncentrace: { top1: Metrika; top5: Metrika };
  sablony: {
    popis: string;
    radky: { segment: string; sablona: string; varianta: string | null; navrhy: number; odpovedelo: number; prodano: number; podil_prodeje: number | null; proklik: PrehledProklik | null }[];
  };
}

/* prehled_komunikace (§5.8) */
export interface SkupinaCekani {
  n: number | null;
  median_d: number | null;
  p90_d: number | null;
  nad_limit: number | null;
  kvalita: KvalitaMetriky;
  duvod: string | null;
  proklik: PrehledProklik | null;
}
export type PoctyDruhu = Record<'clovek' | 'automaticka_odpoved' | 'nedoruceno' | 'systemova' | 'nezname', number | null>;
export interface DataKomunikace {
  cekani: { na_nas: SkupinaCekani; na_klienta: SkupinaCekani };
  zpravy: {
    kvalita: KvalitaMetriky;
    duvod: string | null;
    prichozi: PoctyDruhu;
    odchozi: PoctyDruhu;
    nedoruceno: Metrika;
    automaticke: Metrika;
    mira_odpovedi_po_navrhu: Metrika;
    nejasne_vazby: Metrika;
  };
  duvody: {
    celkem_nahled: number;
    celkem_sleva: number;
    souhrn: { duvod: DuvodRadku; nazev: string; nahled: number; sleva: number; celkem: number; podil: number | null; proklik: PrehledProklik | null }[];
    radky: { duvod: DuvodRadku; faze: FazeOdmitnuti; segment: string; user_id: number | null; n: number }[];
    nereagoval_na_nabidku: Metrika;
    mlci_po_navrhu: Metrika;
    bez_duvodu: Metrika;
  };
}

/* prehled_finance (§5.9) */
export interface ObnovaHostingu {
  kontakt_id: number;
  jmeno: string;
  zaplaceno_at: string;
  splatnost: string;
  castka: string | null;
  mena: MenaPrehledu | null;
}
export interface DataFinance {
  prodeje: Metrika;
  prodeje_mimo_prodej: Metrika;
  faktury: { pocet: Metrika; web: Metrika; hosting: Metrika; celkem: Metrika };
  platby: { inkaso: Metrika; odvozene: number };
  pohledavky: { pocet: Metrika; castka: Metrika; nejstarsi_dni: number | null; po_14_dnech: number };
  slevy: { pocet: Metrika; castka: Metrika };
  provize: { narok: Metrika; vyplaceno: Metrika; zbyva: Metrika };
  hosting: { rocne: Metrika; mrr: Metrika; arr: Metrika; obnovy: ObnovaHostingu[] };
  naklady: { kategorie: { kategorie: KategorieVyuctovani; nazev: string; castka: Metrika; overit: number }[]; celkem: Metrika };
  vysledek: Metrika;
  pokryti_nakladu: { kategorie: 'domena' | 'hosting'; zname: number; celkem: number; text: string }[];
}

/* prehled_dodani (§5.10) */
export interface DataDodani {
  faze: { status: StavPrehledu; nazev: string; n: number; starnuti: Starnuti; proklik: PrehledProklik | null }[];
  /**
   * Blokace k datu (stav a otázky z historie, §5.10): vždy castecne (otázky přibližně), před začátkem historie nedostupne s počty
   * null; ⚠ úkol 14c (kontrakt §7 Blokace): se zadaným k_datu `priznaky` null i při castecne (flag_kind se nehistorizuje)
   */
  blokace: {
    eskalace: number | null;
    pozastaveno: number | null;
    priznaky: number | null;
    otazky: number | null;
    kvalita: KvalitaMetriky;
    duvod: string | null;
    proklik: PrehledProklik | null;
  };
  prace: Record<'build' | 'change', { pocet: number; median_h: number | null; p90_h: number | null }>;
  domeny: Metrika;
  obnovy_hostingu: ObnovaHostingu[];
}

/* prehled_prognoza (§5.11) */
/**
 * Skupina otevřených obchodů prognózy (§7 PrognozaFaze). ⚠ Úkol 14c (kontrakt §5.11 a §9 5b, AMENDED 2026-11-19): `vazene` = Σ
 * příspěvků obchodů skupiny round(cena × citatel ÷ jmenovatel, 2) po měnách filtru, hodnota null bez míry (skupina bez historie,
 * N = 0) nebo bez přesné ceny v té měně; `pravdepodobnost.hodnota` null bez míry (jmenovatel 0). NAHRAZUJE „přesná hodnota
 * skupiny × zaokrouhlená míra“.
 */
export interface SkupinaPrognozy {
  faze: 'zajem' | 'navrh' | 'sleva' | 'ostatni';
  nazev: string;
  n: number;
  castky: CastkaMeny[];
  nezname_n: number;
  pravdepodobnost: Metrika;
  vazene: CastkaJedna[];
}
export interface DataPrognoza {
  mesic: string;
  od: string;
  do: string;
  zbyva_dni: number;
  stitek: 'nevalidovaný odhad';
  potvrzene: Metrika;
  otevrene: SkupinaPrognozy[];
  scenare: { zakladni: Metrika; jen_jiste: Metrika };
  presnost: {
    kvalita: KvalitaMetriky;
    duvod: string | null;
    mesice: { mesic: string; snimek_den: string; odhad: CastkaJedna[]; skutecnost: CastkaJedna[] }[];
    bias: CastkaJedna[];
    mae: CastkaJedna[];
    wape: { mena: MenaPrehledu; hodnota: number | null }[];
  };
}

/* prehled_kvalita (§5.12) */
export interface DataKvalita {
  ceny: { status: StavPrehledu; nazev: string; celkem: number; presne: number; rozsah: number; nezname: number; chybi: number }[];
  navrhy_bez_emailu: Metrika;
  nejasne_vazby: Metrika;
  platby_bez_faktury: Metrika;
  historie: { od: string | null; radku: number | null; kontaktu: number | null; kvalita: KvalitaMetriky; duvod: string | null };
  casovac: { od: string | null; signalu_7d: number | null; lidi_7d: number | null; kvalita: KvalitaMetriky; duvod: string | null };
  zdroje: ZdrojStav[];
}

/* prehled_akce (§5.13) */
export interface SignalAkce {
  kod: SignalKod;
  text: string;
  od: string;
  termin: string;
  zdroj: string;
}
export interface PripadAkce {
  kontakt_id: number;
  jmeno: string;
  segment: string;
  status: StavPrehledu;
  nazev_stavu: string;
  vlastnik: OsobaPrehledu | null;
  problem: string;
  dalsi_krok: string;
  termin: string;
  po_terminu: boolean;
  hodnota: CastkaJedna[];
  cena_stav: CenaStav;
  signaly: SignalAkce[];
  signal_zdroj: string;
}
/**
 * data funkce prehled_akce (§7 DataAkce). ⚠ Úkol 14c (kontrakt §5.13, AMENDED 2026-11-19): `pripady` nejvýš 50 s nejdřívějším
 * termínem (termín vzestupně, pak kontakt_id), celý seznam po stránkách prehled_radky('akce'); `souhrn` počítá VŠECHNY případy;
 * se zadaným k_datu `pripady` [], `pripadu` null (neznámé, nikdy 0, R7) a `podle_signalu` [] (NAHRAZUJE pripadu jako integer a
 * „všechny případy v jedné odpovědi“).
 */
export interface DataAkce {
  pripady: PripadAkce[];
  souhrn: { pripadu: number | null; podle_signalu: { kod: SignalKod; nazev: string; n: number }[] };
}

/* prehled_radky (§5.15): řádek podle zdroje (pole zdroj); klíče doslova jako §7 Radek*. ⚠ Úkol 14c (kontrakt §5.15 a §9 5b,
   AMENDED 2026-11-19): volné texty řádků (cena_web, cena_text, popis, poznamka, text) jsou bez telefonu a e-mailu (R20: adresa
   „[e-mail]“, číslo s aspoň 9 číslicemi „[telefon]“), CenaRozbor se dál čte z původního textu */
interface RadekZaklad<Z extends RadkyZdroj> {
  zdroj: Z;
  radek_id: string;
}
export interface RadekKontakty extends RadekZaklad<'kontakty'> {
  kontakt_id: number;
  jmeno: string;
  segment: string;
  obor: string | null;
  kraj: string | null;
  status: StavPrehledu;
  nazev_stavu: string;
  rating: 'A' | 'B' | 'C' | null;
  hvezda: boolean;
  /** text k datu bez telefonu a e-mailu (R20) */
  cena_web: string | null;
  /** pravidlo výdělku (z původního textu) */
  cena: CenaRozbor;
  /**
   * jen řádky odhad_mesic a prognoza_zakladni: příspěvek k odhadu (prodej cenou, otevřený obchod round(cena × citatel ÷
   * jmenovatel, 2)); null bez přesné ceny nebo míry a u jiných výběrů (úkol 14c, AMENDED 2026-11-19); součet řádků = karta
   */
  prispevek: CastkaJedna | null;
  /** jen řádky odhadu: míra skupiny jako na kartě (prodej 1); null bez míry a u jiných výběrů */
  pravdepodobnost: number | null;
  osoba: OsobaPrehledu | null;
  prvni_hovor_at: string | null;
  dovolano_at: string | null;
  zajem_at: string | null;
  navrh_at: string | null;
  prodano_at: string | null;
  faktura_at: string | null;
  zaplaceno_at: string | null;
  status_od: string | null;
  posledni_klient_at: string | null;
  posledni_my_at: string | null;
}
export interface RadekHovory extends RadekZaklad<'hovory'> {
  id: number;
  kontakt_id: number;
  jmeno: string;
  segment: string;
  user_id: number;
  volajici: string;
  vysledek: 'nedovolano' | 'odmitnuto' | 'zajem' | 'nerelevantni' | 'preplanovano';
  rating: 'A' | 'B' | 'C' | null;
  at: string;
}
export interface RadekProdeje extends RadekZaklad<'prodeje'> {
  kontakt_id: number;
  jmeno: string;
  segment: string;
  prodano_at: string;
  /** text, ze kterého se počítalo, bez telefonu a e-mailu (R20) */
  cena_text: string | null;
  cena: CenaRozbor;
  zdroj_ceny: 'cena_web' | 'sleva';
  hosting: CenaRozbor;
  osoba: OsobaPrehledu | null;
  provize: string | null;
  provize_mena: MenaPrehledu | null;
}
export interface RadekFaktury extends RadekZaklad<'faktury'> {
  event_id: number;
  kontakt_id: number;
  jmeno: string;
  at: string;
  cislo: string | null;
  web: string | null;
  hosting: string | null;
  celkem: string | null;
  mena: MenaPrehledu | null;
  zaplaceno_at: string | null;
  dni_od_vystaveni: number;
}
export interface RadekPlatby extends RadekZaklad<'platby'> {
  event_id: number | null;
  kontakt_id: number;
  jmeno: string;
  at: string;
  castka: string | null;
  mena: MenaPrehledu | null;
  zdroj_castky: 'faktura' | 'cena_prodeje' | 'neznama';
  odvozeno: boolean;
  faktury: string[];
}
export interface RadekNaklady extends RadekZaklad<'naklady'> {
  naklad_id: number | null;
  kategorie: KategorieVyuctovani;
  /** bez telefonu a e-mailu (R20) */
  popis: string | null;
  datum: string;
  castka: string | null;
  mena: MenaPrehledu | null;
  stav_ceny: CenaStav;
  opakovani: 'jednorazove' | 'mesicne' | 'rocne' | null;
  kontakt_id: number | null;
  jmeno: string | null;
  overit: boolean;
  user_id: number | null;
}
export interface RadekProvize extends RadekZaklad<'provize'> {
  druh: 'narok' | 'vyplata';
  datum: string;
  /**
   * null u nároku prodeje, u kterého nikdo nezapsal zájem (provize nemá komu připadnout); volajici null tamtéž (úkol 14c, kontrakt
   * §7 RadekProvize z 5b; NAHRAZUJE vždy vyplněné user_id a volajici)
   */
  user_id: number | null;
  volajici: string | null;
  kontakt_id: number | null;
  jmeno: string | null;
  castka: string | null;
  mena: MenaPrehledu | null;
  stav_ceny: CenaStav;
  vyplata_id: number | null;
  /** bez telefonu a e-mailu (R20) */
  poznamka: string | null;
}
export interface RadekOdmitnuti extends RadekZaklad<'odmitnuti'> {
  kontakt_id: number;
  jmeno: string;
  segment: string;
  faze: FazeOdmitnuti | null;
  duvod: DuvodRadku;
  nazev_duvodu: string;
  text: string | null;
  zdroj_zapisu: 'worker' | 'volajici' | 'super_admin' | 'zpetne' | null;
  zapsal: string | null;
  at: string;
  osoba: OsobaPrehledu | null;
}
export interface RadekZpravy extends RadekZaklad<'zpravy'> {
  id: number;
  kontakt_id: number | null;
  jmeno: string | null;
  smer: 'prichozi' | 'odchozi';
  druh: 'clovek' | 'automaticka_odpoved' | 'nedoruceno' | 'systemova' | 'nezname';
  prijato_at: string;
  vazba: 'vlakno' | 'adresa' | 'nejasne' | null;
  odkaz: string;
}
export interface RadekAkce extends RadekZaklad<'akce'>, Omit<PripadAkce, 'kontakt_id'> {
  kontakt_id: number;
}
export interface RadekPrace extends RadekZaklad<'prace'> {
  user_id: number;
  volajici: string;
  den: string;
  od: string;
  do: string;
  minut: number;
  vysledku: number;
  kvalita: 'casovac' | 'odhad';
}
export type RadekPrehledu =
  | RadekKontakty | RadekHovory | RadekProdeje | RadekFaktury | RadekPlatby | RadekNaklady | RadekProvize | RadekOdmitnuti | RadekZpravy
  | RadekAkce | RadekPrace;
export interface DataRadky {
  zdroj: RadkyZdroj;
  radky: RadekPrehledu[];
  dalsi_kurzor: string | null;
  celkem: number;
  /**
   * součet peněžního sloupce všech řádků po měnách ([] u zdrojů bez peněz); u odhad_mesic a prognoza_zakladni Σ příspěvků (= karta);
   * seznam prázdný kvůli neznámému stavu (HISTORIE_OD, K_DATU_MINULOST) má hodnotu null v každé měně filtru (úkol 14c, AMENDED
   * 2026-11-19; NAHRAZUJE „0.00“)
   */
  soucty: CastkaJedna[];
  soucet: number | null;
}

/* prehled_kontakt (§5.16) */
export interface UdalostKontaktu {
  at: string;
  druh: 'hovor' | 'dovolani' | 'stav' | 'cena' | 'navrh' | 'sleva' | 'sleva_vyprsela' | 'faktura' | 'platba' | 'duvod' | 'email' | 'oznaceni' | 'zavolat' | 'hvezda' | 'domena' | 'prodej';
  text: string;
  osoba: OsobaPrehledu | null;
  odkaz: string | null;
  zdroj: string;
}
export interface DataKontakt {
  kontakt: {
    kontakt_id: number;
    jmeno: string;
    firma: string | null;
    segment: string;
    obor: string | null;
    kraj: string | null;
    mesto: string | null;
    status: StavPrehledu;
    nazev_stavu: string;
    status_od: string | null;
    rating: 'A' | 'B' | 'C' | null;
    hvezda_at: string | null;
    /** texty cen bez telefonu a e-mailu (R20; úkol 14c, AMENDED 2026-11-19), CenaRozbor z původního textu */
    cena_web: string | null;
    cena_hosting: string | null;
    cena: CenaRozbor;
    hosting: CenaRozbor;
    live_url: string | null;
    prvni_navrh_at: string | null;
    posledni_my_at: string | null;
    posledni_klient_at: string | null;
    gmail_odkaz: string | null;
  };
  atribuce: Record<AtribucePrehledu, OsobaPrehledu | null>;
  historie_od: string | null;
  udalosti: UdalostKontaktu[];
}

/* prehled_definice (§5.17) */
export interface MetrikaDefinice {
  klic: string;
  verze: number;
  nazev: string;
  definice: string;
  zaklad: string;
  jednotka: JednotkaMetriky;
  zdroje: string;
  granularita: string;
  kvalita_pravidla: string;
  platne_od: string;
}
export interface DataDefinice {
  metriky: MetrikaDefinice[];
  duvody: { klic: DuvodOdmitnutiKod; nazev: string; vyzaduje_text: boolean }[];
  odvozene_vysledky: { klic: 'nereagoval_na_nabidku' | 'mlci_po_navrhu' | 'bez_duvodu'; nazev: string; popis: string }[];
  faze_odmitnuti: { klic: FazeOdmitnuti; nazev: string }[];
  stavy: { klic: StavPrehledu; nazev: string; skupina: 'fronta' | 'otevrene' | 'prodano' | 'ztraceno' | 'archiv' | 'vyrazeno' }[];
  signaly_akci: { kod: SignalKod; nazev: string; dalsi_krok: string }[];
  zdroje: { zdroj: string; nazev: string }[];
  kategorie_nakladu: { klic: KategorieVyuctovani; nazev: string }[];
  metriky_cilu: { klic: CilPrehledu['metrika']; nazev: string; metrika: string; v_mene: boolean; cele_cislo: boolean }[];
  varovani: { kod: string; sablona: string }[];
}

/* ---- Přehled vedení: nastavení cílů, nákladů a výplat provizí (migrace 072, úkol 14b; kontrakt §4.3 až §4.5 a tvary §7
   doslova; Albert 17. 11. 2026, D6, D9 a D10). Bez obálky: seznam = pole řádků, uložení = uložený řádek, zrušení = {ok, id}.
   Každé `*_do` je poslední den VČETNĚ (R6), peníze jako desetinný text na 2 místa (R7). Volající nic z toho nedostane
   (server „Přehled vidí jen super admin.“, appka trasu ani volání nemá). ---- */

/** Kategorie evidence nákladů (§3.5): přesně pět; provize je jen ve výpočtu prehled_finance, nikdy řádek evidence. */
export type KategorieNakladu = Exclude<KategorieVyuctovani, 'provize'>;
/** Opakování nákladu (§3.5, zaúčtování §2.12). */
export type OpakovaniNakladu = 'jednorazove' | 'mesicne' | 'rocne';
/** Metrika cíle (§3.6). */
export type MetrikaCile = CilPrehledu['metrika'];
/** Cíl (§7 Cil, cile_seznam a cile_uloz): obdobi_do poslední den včetně, smi_upravit podle D9. */
export type Cil = CilPrehledu;
/** Řádek nákladů (§7 Naklad, aktivní). */
export interface Naklad {
  id: number;
  kategorie: KategorieNakladu;
  popis: string | null;
  castka: string;
  mena: MenaPrehledu;
  opakovani: OpakovaniNakladu;
  plati_od: string;
  /** poslední den platnosti VČETNĚ; null = bez konce (u jednorázového vždy null) */
  plati_do: string | null;
  kontakt_id: number | null;
  kontakt_jmeno: string | null;
  /** částka čeká na ověření (v nastavení „ověřit“) */
  overit: boolean;
  zapsal: string;
  zapsano_at: string;
}
/** p_naklad pro naklady_uloz (§7 NakladVstup): bez id nový řádek, s id úplná náhrada; klíče jen ke čtení se ignorují. */
export interface NakladVstup {
  id?: number | null;
  kategorie: KategorieNakladu;
  popis?: string | null;
  /** kladná částka, nejvýš 2 desetinná místa, text („350.00“) nebo číslo */
  castka: string | number;
  mena: MenaPrehledu;
  opakovani: OpakovaniNakladu;
  /** prázdné pole formuláře jde jako null: server odpoví svou větou („Zadejte, od kterého dne náklad platí.“) */
  plati_od: string | null;
  plati_do?: string | null;
  /** číslo klienta; text, který číslem není, server odmítne „Kontakt id=… neexistuje.“ (app_json_cele) */
  kontakt_id?: number | string | null;
  overit?: boolean;
}
/** p_cil pro cile_uloz (§7 CilVstup): user_id i tym_id null = cíl celé firmy (jen Albert). */
export interface CilVstup {
  id?: number | null;
  metrika: MetrikaCile;
  /** prázdné pole formuláře jde jako null (server odpoví „Neplatné datum v poli obdobi_od …“) */
  obdobi_od: string | null;
  /** poslední den VČETNĚ */
  obdobi_do: string | null;
  user_id?: number | null;
  tym_id?: number | null;
  mena?: MenaPrehledu | null;
  hodnota: string | number;
}
/** Výplata provize (§7 Vyplata, aktivní). */
export interface Vyplata {
  id: number;
  user_id: number;
  jmeno: string;
  castka: string;
  mena: MenaPrehledu;
  vyplaceno_dne: string;
  za_obdobi_od: string | null;
  /** včetně */
  za_obdobi_do: string | null;
  poznamka: string | null;
  zapsal: string;
  zapsano_at: string;
}
/** p_vyplata pro provize_vyplata_uloz (§7 VyplataVstup). */
export interface VyplataVstup {
  id?: number | null;
  user_id: number;
  castka: string | number;
  mena: MenaPrehledu;
  /** prázdné pole formuláře jde jako null (server odpoví „Zadejte, kdy byla provize vyplacena.“) */
  vyplaceno_dne: string | null;
  za_obdobi_od?: string | null;
  za_obdobi_do?: string | null;
  poznamka?: string | null;
}
/** Potvrzení zrušení (§7 OkId). */
export interface OkId {
  ok: true;
  id: number;
}

/** Jednotné API rozhraní — implementuje ho reálný Supabase klient i demo mock. */
export interface Api {
  login(username: string, password: string): Promise<Session>;
  logout(token: string): Promise<void>;
  me(token: string): Promise<MeInfo>;
  /**
   * Další kontakt z fronty volání v daném segmentu (migrace 028). Server bez segmentu vrací
   * chaty (výchozí 'chata'), na neznámou hodnotu hází chybu.
   */
  nextContact(token: string, segment: Segment): Promise<Kontakt | null>;
  /**
   * Registr nik pro přepínač „Koho voláš“ (app_obor_niky, migrace 064). Server bez migrace 064 funkci nemá: appka pak
   * dostane prázdný seznam a vypadá jako dřív (jen chaty a architekti).
   */
  oborNiky(token: string): Promise<OborNika[]>;
  /**
   * Vlastní naplánované hovory, jejichž čas nastal, v jiných segmentech než `segment` (app_zavolat_jinde, migrace 064):
   * podklad řádku „Máš naplánovaný hovor: …“ ve volání. Server bez 064 = prázdný seznam.
   */
  zavolatJinde(token: string, segment: Segment): Promise<ZavolatJinde[]>;
  /**
   * Vrátit svůj zamčený kontakt do fronty bez výsledku hovoru (přepnutí segmentu, migrace 028).
   * Jen vlastní zámek, jen volatelný stav a jen do 30 minut od vzetí karty; nepíše call_log.
   */
  returnContact(token: string, id: number): Promise<{ ok: boolean; kontakt_id: number }>;
  resolveCall(
    token: string,
    args: ResolveCallArgs
  ): Promise<{ ok: boolean; kontakt_id: number; status: string }>;
  myStats(token: string): Promise<MyStats>;
  /**
   * Statistiky svoje a lidí pod sebou — jen super admin; Albert všech (migrace 023). `den` (YYYY-MM-DD, den v Praze,
   * migrace 056) = jen ten den; bez něj celé období. Server bez 056 den nezná (appka pak řekne, že to ještě neumí).
   */
  allStats(token: string, den?: string | null): Promise<UserStats[]>;
  /** Je přihlášený #1 prodejce? (Prokchop) — nevrací čísla ostatních (migrace 023); od 045 jen super admin. */
  topSeller(token: string): Promise<{ je_prvni: boolean }>;
  /** Celá databáze kontaktů: řádky vidí všichni (migrace 023), Volající u cizího kontaktu jen allowlist (skryto, 045,
   *  Albert 20. 10. 2026, ⚠ NAHRAZUJE „se stavy“); jméno kolegy jen svoje/svých lidí. */
  listKontakty(token: string, filters: ListKontaktyFilters): Promise<ListKontaktyResult>;
  /** Kontakty přihlášeného — migrace 003; super admin může userId = někdo z jeho lidí (023). */
  myKontakty(
    token: string,
    limit?: number,
    offset?: number,
    userId?: number | null,
    /** segment (migrace 028); null / chybí = vše */
    segment?: Segment | null,
    /** filtry a řazení jako v Kontaktech (migrace 056); appka je posílá jen za super admina */
    filtry?: MojiFiltry | null
  ): Promise<ListKontaktyResult>;
  /** Úprava kontaktu (admin) — obsah jen u vlastních klientů, příznak a zámek u všech (migrace 024). */
  updateKontakt(token: string, id: number, patch: Record<string, unknown>): Promise<Kontakt>;
  /**
   * Označit kontakt za svého klienta (migrace 024): smí ten, kdo mu volal, a jen dokud je
   * kontakt ve frontě volání. Mění jen „kdo volal" — stav, zámek ani fronta se nemění.
   */
  claimKontakt(token: string, id: number): Promise<Kontakt>;
  /* ---- příznaky (migrace 005) ---- */
  /** Nasadí červený příznak s poznámkou, co je u klienta špatně. */
  setFlag(token: string, id: number, kind: FlagKind, note: string): Promise<Kontakt>;
  /** Zruší příznak — klient je vyřešený. */
  clearFlag(token: string, id: number): Promise<Kontakt>;
  /** Označení klienti: admin svoji, super admin svých lidí (+ userId), Albert všichni (023). Od migrace 060 ji appka
   *  nevolá (Označené jdou přes listOznacene); zůstává pro starou appku a pro server bez 060. */
  listFlagged(token: string, kind?: FlagKind | null, userId?: number | null): Promise<Kontakt[]>;
  /* ---- označení k zavolání, hvězda a přehled (migrace 060, Albert 1. 11. 2026) ---- */
  /** Označené: otevřená označení k zavolání + příznaky, s filtry (OznaceneFiltry). Server bez 060 = BEZ_060_OZNACENE. */
  listOznacene(token: string, filtry: OznaceneFiltry): Promise<Kontakt[]>;
  /**
   * Zápis dovolání: u otevřeného označení Volající jen u SVÉHO, super admin a Albert u každého; od migrace 062 (Albert
   * 2. 11. 2026) i bez označení u klienta, kterého přihlášený smí upravit (mimo frontu volání, Odmítnuto, Nabídnutou slevu,
   * Nekontaktovat a Nerelevantní; odmítnutí jen ten, kdo klienta vede, super admin a Albert; po prodeji odmítnutí ne).
   * Větev vybere server, odpověď ji řekne v `oznaceno`. Do call_log se nepíše. `hvezda` true/false hvězdu dá/odebere
   * (null = beze změny). Od migrace 061 `poznamka` u každého výsledku (povinná u mluvili a jine); kam šla, říká
   * `poznamka_predana`. Od 062 šest výsledků (i chce_web, vzkaz agentovi vždy). Server bez 061 jine odmítne (BEZ_061_JINE),
   * server bez 062 chce_web (BEZ_062_CHCE_WEB).
   */
  zapisHovor(
    token: string,
    kontaktId: number,
    vysledek: VysledekDovolani,
    poznamka?: string | null,
    hvezda?: boolean | null
  ): Promise<ZapisHovoruVysledek>;
  /** Zrušení otevřeného označení (jen super admin a Albert, s důvodem). */
  oznaceniZavrit(token: string, kontaktId: number, duvod: string): Promise<{ ok: boolean; kontakt_id: number; oznaceni_id?: number }>;
  /** Hvězda (velký zájem): dá ji nebo odebere ten, kdo kontakt smí upravit; vrátí řádek kontaktu jako úpravy. */
  nastavHvezdu(token: string, kontaktId: number, hvezda: boolean, duvod?: string | null): Promise<Kontakt>;
  /** Přehled klienta: fakta z dat a text automatizace (když už je). Jen vlastní klient, super admin, Albert. */
  kontaktPrehled(token: string, kontaktId: number): Promise<KontaktPrehled>;
  createUser(
    token: string,
    username: string,
    password: string,
    displayName: string,
    role: Role,
    managerId?: number | null
  ): Promise<{ ok: boolean; user_id: number }>;
  /** Úprava uživatele (admin) — migrace 004; aplikují se jen zadaná pole. */
  updateUser(token: string, userId: number, args: UpdateUserArgs): Promise<UpdatedUser>;
  listAdminMessages(token: string, status?: 'open' | 'resolved' | null): Promise<AdminMessage[]>;
  replyAdminMessage(
    token: string,
    id: number,
    reply: string,
    applyAlways: boolean
  ): Promise<AdminMessage>;
  /* ---- chat (migrace 002) ---- */
  /**
   * Vlákna, která přihlášený smí vidět; super admin může userId = jeden z jeho lidí (023). Od migrace 074 (D7) `userIds` =
   * vlákna kohokoli z vybraných (p_user_ids, nikdy s `userId`); server bez 074 = BEZ_074_LIDE.
   */
  listThreads(
    token: string,
    status?: ThreadStatus | null,
    scope?: ThreadScope | null,
    userId?: number | null,
    userIds?: number[] | null
  ): Promise<ChatThread[]>;
  /** Vyřeší všechna otevřená vlákna o téže poruše najednou. */
  resolveAlert(
    token: string,
    key: string
  ): Promise<{ ok: boolean; resolved: number; key: string }>;
  getThread(token: string, threadId: number): Promise<ThreadDetail>;
  postThreadMessage(
    token: string,
    threadId: number,
    body: string,
    applyAlways: boolean
  ): Promise<ChatMessage>;
  createThread(
    token: string,
    subject: string,
    body: string,
    kontaktId?: number | null
  ): Promise<{ thread_id: number }>;
  resolveThread(
    token: string,
    threadId: number
  ): Promise<{ ok: boolean; thread_id: number; status: string }>;
  /* ---- kontrola odpovědí (migrace 083, Albert 26. 11. 2026; jen super admin, server to hlídá sám) ---- */
  /** Přepínač u klienta a jeho návrhy e-mailů ke schválení. Volající dostane chybu. */
  kontrolaDetail(token: string, kontaktId: number): Promise<KontrolaOdpovedi>;
  /** Zapne nebo vypne kontrolu (jen super admin, který klienta smí upravovat); vypnutí zruší nerozhodnuté návrhy. */
  kontrolaNastav(token: string, kontaktId: number, zapnout: boolean): Promise<KontrolaOdpovedi>;
  /** Schválí návrh ve stavu ceka; odeslání zařadí automatizace do 15 minut. */
  navrhSchvalit(token: string, navrhId: number): Promise<NavrhKeKontrole>;
  /** Vrátí návrh s poznámkou; poznámka jde do vlákna jako zpráva člověka a agent e-mail přepíše. */
  navrhVratit(token: string, navrhId: number, poznamka: string): Promise<NavrhKeKontrole>;
  /* ---- přepínání účtů Claude (migrace 011) ---- */
  /** Stav přepínače: kdo veze automatizaci, běžící joby, fronta (admin). */
  getAutomationStatus(token: string): Promise<AutomationStatus>;
  /** Požadavek na přepnutí (jen users.id = 1). Cíl = aktivní účet ⇒ zrušení. */
  requestAccountSwitch(token: string, slug: string): Promise<AutomationStatus>;
  /* ---- vypínač automatizace (migrace 012), jen users.id = 1 ---- */
  /** Vypnout šetrně: rozdělané joby doběhnou (draining/stop), pak stopped; bez jobů hned. */
  requestAutomationStop(token: string): Promise<AutomationStatus>;
  /** Zrušit probíhající vypínání (draining/stop ⇒ running). */
  cancelAutomationStop(token: string): Promise<AutomationStatus>;
  /** Zapnout (stopped ⇒ running); orchestrátor pokračuje dalším tikem (do 15 min). */
  requestAutomationStart(token: string): Promise<AutomationStatus>;
  /** Rozvrh aktuálního týdne (migrace 042): svůj každý, cizí jen super admin. */
  rozvrh(token: string, userId?: number | null): Promise<Rozvrh>;
  /** Uloží týdenní rozvrh (7 dní) a zamkne ho; volající svůj jen jednou, super admin kdykoli. */
  ulozitRozvrh(token: string, userId: number, dny: RozvrhDenVstup[]): Promise<Rozvrh>;
  /** Jen super admin: volající si rozvrh smí nastavit ještě jednou. */
  odemknoutRozvrh(token: string, userId: number): Promise<Rozvrh>;
  /** Vlastní poznámka ke dni tohoto týdne (YYYY-MM-DD); prázdný text ji smaže. */
  poznamkaRozvrhu(token: string, den: string, text: string): Promise<Rozvrh>;
  /** Jen super admin: plnění rozvrhu všech Volajících, kdo je pozadu, je první. */
  prehledRozvrhu(token: string): Promise<RozvrhPrehledRadek[]>;
  /* ---- kalendář hovorů a výdělek (migrace 050, Albert 21. 10. 2026) ---- */
  /**
   * Kalendář: svůj každý; super admin kohokoli (userId) nebo všech (vsichni). `jenCekajici` (p_jen_cekajici, po recenzi
   * 21. 10. 2026): jen čekající hovory, bez uzavřených za 14 dní (připomínky a odznak to víc nepotřebují).
   */
  zavolatSeznam(
    token: string,
    userId?: number | null,
    vsichni?: boolean,
    jenCekajici?: boolean,
    /** migrace 074 (D7): hovory kohokoli z vybraných (p_user_ids, nikdy s `userId` ani `vsichni`); server bez 074 = BEZ_074_LIDE */
    userIds?: number[] | null
  ): Promise<ZavolatSeznam>;
  /**
   * Čekající hovor kontaktu (po recenzi 21. 10. 2026): Volající jen svůj hovor, super admin kterýkoli; jinak null.
   * Detail kontaktu podle něj ukáže, kdy a kdo volá, a okno otevře jako Přesunout.
   */
  zavolatKontaktu(token: string, kontaktId: number): Promise<ZavolatPolozka | null>;
  /** Naplánuje hovor (kdy = ISO). Volající sám sobě; super admin vybere, kdo zavolá (userId). Čekající hovor kontaktu přesune. */
  zavolatNaplanovat(
    token: string,
    kontaktId: number,
    kdy: string,
    poznamka: string | null,
    userId?: number | null
  ): Promise<ZavolatPolozka>;
  /** Přesune čekající hovor (poznámka se přepíše, null ji smaže); jinému člověku jen super admin. */
  zavolatPresunout(
    token: string,
    id: number,
    kdy: string,
    poznamka: string | null,
    userId?: number | null
  ): Promise<ZavolatPolozka>;
  zavolatZrusit(token: string, id: number): Promise<{ ok: boolean; id: number }>;
  /** Hotovo u klienta mimo frontu (zavolal mu sám); ve frontě se hovor uzavírá výsledkem hovoru. */
  zavolatHotovo(token: string, id: number, vysledek?: string | null): Promise<{ ok: boolean; id: number }>;
  /** „Zavolat teď“: zamkne kontakt ve frontě pro toho, kdo má volat, a vrátí kartu jako next_contact. */
  zavolatVzit(token: string, id: number): Promise<Kontakt>;
  /** Nerelevantní, přeplánované a výdělek: svoje každý, cizí (userId) jen super admin. */
  statistikyVolani(token: string, userId?: number | null): Promise<StatistikyVolani>;
  /**
   * Tabulka „Zájem podle volajících“ ve Statistikách (migrace 069, Albert 15. 11. 2026): klienti, kteří web potvrdili,
   * odpověděli a ještě nepotvrdili, a návrhy bez odpovědi, po volajících (kontakty.last_caller). Jen super admin;
   * `segment` null = vše (jako Kontakty). Server bez 069 = chyba BEZ_069_ZAJEM.
   */
  zajemPodleVolajicich(token: string, segment?: Segment | null): Promise<ZajemPodleVolajicich>;
  /**
   * Vlastní zobrazené stavy přihlášeného (migrace 071, Albert 17. 11. 2026): jen jeho řádky [{kontakt_id, stav}], nikdy
   * cizí (ani super adminovi). Appka jimi nahradí jen popisek stavu (src/zobrazeni.ts). Server bez 071 = prázdný seznam.
   */
  zobrazeneStavy(token: string): Promise<ZobrazenyStav[]>;
  /* ---- časovač práce a důvody odmítnutí (migrace 072, Přehled vedení; Albert 17. 11. 2026, D5 a D8) ---- */
  /**
   * Signál časovače práce (prace_tep) vždy jen za přihlášeného (uživatel z tokenu). `kontaktId` jen u `karta`; server ji uloží
   * jen u kontaktu, který přihlášený smí dělat (cizí a neexistující stejnou odpovědí bez zápisu). true = server signál vzal
   * ({ok: true}), false = server funkci nemá (bez migrace 072, PGRST202): časovač se pak zastaví. `konec` jde s keepalive
   * (dojde i ze zavírané stránky). Jiné chyby (síť, relace) hodí; časovač je spolkne.
   */
  praceTep(token: string, druh: DruhSignalu, kontaktId?: number | null): Promise<boolean>;
  /**
   * Proč klient odmítl návrh (odmitnuti_duvod_zapis): Volající jen u klienta, kterého smí upravit a který dostal návrh
   * (first_proposal_at); cizí, neexistující a bez návrhu stejnou větou. Super admin u každého klienta s návrhem. `text` jen
   * u `jine` (povinný, nejvýš 450 znaků). Přidá řádek (nikdy nepřepisuje), odpověď přesně {ok: true}. Appka ho volá až po
   * uloženém výsledku hovoru nebo změně stavu; server bez 072 = chyba BEZ_072_DUVOD.
   */
  odmitnutiDuvodZapis(
    token: string,
    kontaktId: number,
    faze: FazeOdmitnuti,
    duvod: DuvodOdmitnutiKod,
    text?: string | null
  ): Promise<{ ok: true }>;
  /* ---- Přehled vedení (migrace 073, Albert 17. 11. 2026) ---- */
  /**
   * Lidé a volání (prehled_lide, kontrakt §5.5): řádek za každého z `filtr.lide` (null = všichni a řádek Nepřiřazeno) a součet
   * vybraných (Statistiky „kombinované karty“). Jen super admin („Přehled vidí jen super admin.“); server bez 073 = chyba
   * BEZ_073_LIDE.
   */
  prehledLide(token: string, filtr?: PrehledFiltrVstup | null): Promise<PrehledObalka<DataLide>>;
  /*
   * Přehled vedení, ostatní funkce migrace 073 (úkol 13, kontrakt §5): všechny jen super admin („Přehled vidí jen super admin.“
   * před kontrolou parametrů), obálka §2.5; server bez 073 (PGRST202) = chyba BEZ_073_PREHLED, nikdy ukázková data.
   */
  /** Možnosti filtru, lidé a týmy, dostupnost metrik, zdroje a čerstvost (§5.1). */
  prehledMoznosti(token: string): Promise<PrehledObalka<DataMoznosti>>;
  /** Osm karet vedení a použitý cíl (§5.2). */
  prehledSouhrn(token: string, filtr?: PrehledFiltrVstup | null): Promise<PrehledObalka<DataSouhrn>>;
  /** Časová řada jedné metriky po dnech, týdnech (po–ne) nebo měsících v Praze (§5.3). */
  prehledRada(token: string, metrika: MetrikaRadyKlic, zrnitost?: ZrnitostRady, filtr?: PrehledFiltrVstup | null): Promise<PrehledObalka<DataRada>>;
  prehledTrychtyr(token: string, filtr?: PrehledFiltrVstup | null): Promise<PrehledObalka<DataTrychtyr>>;
  prehledPipeline(token: string, filtr?: PrehledFiltrVstup | null): Promise<PrehledObalka<DataPipeline>>;
  prehledKlienti(token: string, filtr?: PrehledFiltrVstup | null): Promise<PrehledObalka<DataKlienti>>;
  prehledKomunikace(token: string, filtr?: PrehledFiltrVstup | null): Promise<PrehledObalka<DataKomunikace>>;
  prehledFinance(token: string, filtr?: PrehledFiltrVstup | null): Promise<PrehledObalka<DataFinance>>;
  prehledDodani(token: string, filtr?: PrehledFiltrVstup | null): Promise<PrehledObalka<DataDodani>>;
  prehledPrognoza(token: string, filtr?: PrehledFiltrVstup | null): Promise<PrehledObalka<DataPrognoza>>;
  /** Kvalita dat bez filtru (§5.12). */
  prehledKvalita(token: string): Promise<PrehledObalka<DataKvalita>>;
  prehledAkce(token: string, filtr?: PrehledFiltrVstup | null): Promise<PrehledObalka<DataAkce>>;
  /**
   * Řádky za kartou nebo buňkou (§5.15): `filtr` = proklik.filtr beze změny (vyber vybírá řádky), `kurzor` = dalsi_kurzor předchozí
   * stránky (patří k filtru a zdroji), `limit` 1 až 200.
   */
  prehledRadky(token: string, zdroj: RadkyZdroj, filtr?: PrehledFiltrVstup | null, kurzor?: string | null, limit?: number): Promise<PrehledObalka<DataRadky>>;
  /** Časová osa jednoho klienta (§5.16), bez telefonu a e-mailu. */
  prehledKontakt(token: string, kontaktId: number): Promise<PrehledObalka<DataKontakt>>;
  /** Katalog metrik a registry (§5.17); appka ho drží podle definice_verze. */
  prehledDefinice(token: string): Promise<PrehledObalka<DataDefinice>>;
  /*
   * Přehled vedení, nastavení (migrace 072, úkol 14b, kontrakt §4.3 až §4.5): všechny jen super admin („Přehled vidí jen super
   * admin.“ před kontrolou parametrů), bez obálky; server bez 072 (PGRST202) = chyba BEZ_072_NASTAVENI. Zrušení je měkké
   * (řádek zmizí ze seznamu i z výpočtů, v tabulce a v událostech zůstane).
   */
  /** Aktivní náklady všech, plati_od sestupně (§4.3a). */
  nakladySeznam(token: string): Promise<Naklad[]>;
  /** Nový náklad (bez id) nebo úplná náhrada aktivního (s id); každý super admin smí každý řádek (§4.3b). */
  nakladyUloz(token: string, naklad: NakladVstup): Promise<Naklad>;
  nakladyZrus(token: string, id: number): Promise<OkId>;
  /** Aktivní cíle všech (každý super admin vidí všechny), `smi_upravit` podle D9 (§4.4a). */
  cileSeznam(token: string): Promise<Cil[]>;
  /** Nový cíl nebo úplná náhrada v rozsahu D9; odmítne jen přesný duplikát (§4.4b, R21). */
  cileUloz(token: string, cil: CilVstup): Promise<Cil>;
  cileZrus(token: string, id: number): Promise<OkId>;
  /** Aktivní výplaty provizí všech, vyplaceno_dne sestupně (§4.5a). */
  provizeVyplatySeznam(token: string): Promise<Vyplata[]>;
  /** Nová výplata nebo úplná náhrada: super admin svému týmu, Albert komukoli (§4.5b, D10). */
  provizeVyplataUloz(token: string, vyplata: VyplataVstup): Promise<Vyplata>;
  provizeVyplataZrus(token: string, id: number): Promise<OkId>;
}
