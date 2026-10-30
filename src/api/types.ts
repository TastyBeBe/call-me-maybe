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
export type Segment = 'chata' | 'architekt';

/** DPH architekta a jeho studia zvlášť (migrace 028, CHECK na čtyři hodnoty). */
export type DphStav = 'platce' | 'neplatce' | 'identifikovana_osoba' | 'neovereno';


/**
 * Červený příznak (migrace 005) — klient, který není 100 % vyřešený.
 * chybi_info     = nevíme vůbec, o jaký objekt jde
 * chybi_email    = nemáme e-mail, není kam poslat návrh
 * email_neoveren = e-mail jsme dohledali, ale není potvrzený od klienta
 * info_neoverene = informace/fotky pocházejí z internetu, klient je nepotvrdil
 * jine           = cokoli dalšího, popsané v poznámce
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
  // ⚠ Zdroj telefonu („odkud máme číslo“) v appce není (Albert 19. 10. 2026, migrace 043; NAHRAZUJE [ALBERT 10]). Server ho od 043 neposílá.
  /**
   * Migrace 050 (Albert 21. 10. 2026, „call me at this time“): karta ve volání (next_contact, zavolat_vzit) nese
   * čekající naplánovaný hovor přihlášeného k tomuhle kontaktu, jinak null. Seznamy klíč neposílají (undefined).
   */
  zavolat?: ZavolatKarta | null;
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
 */
export type Razeni = 'zmena_nejnovejsi' | 'zmena_nejstarsi' | 'hovor_nejnovejsi' | 'hovor_nejstarsi';

/**
 * Filtry Moji klienti (migrace 056, Albert 27. 10. 2026: „the same like filters as we have in the contacts … this only
 * applies for the super admins“). Appka je posílá jen za super admina; server je bere stejně jako list_kontakty nad
 * klienty vybraného člověka. Prázdné (null) = beze změny, jako dřív.
 */
export interface MojiFiltry {
  status?: string | null;
  rating?: string | null;
  search?: string | null;
  cekani?: CekaniKind | null;
  kos?: CekaniKos | null;
  razeni?: Razeni | null;
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
  /** Označení klienti: admin svoji, super admin svých lidí (+ userId), Albert všichni (023). */
  listFlagged(token: string, kind?: FlagKind | null, userId?: number | null): Promise<Kontakt[]>;
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
  /** Vlákna, která přihlášený smí vidět; super admin může userId = jeden z jeho lidí (023). */
  listThreads(
    token: string,
    status?: ThreadStatus | null,
    scope?: ThreadScope | null,
    userId?: number | null
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
  zavolatSeznam(token: string, userId?: number | null, vsichni?: boolean, jenCekajici?: boolean): Promise<ZavolatSeznam>;
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
}
