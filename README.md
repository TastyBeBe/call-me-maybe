# Call me maybe — interní obvolávací appka WEBDOMOV

Webová aplikace pro volající a adminy projektu WEBDOMOV (prodej webů po telefonu).
Klienti jsou ve dvou přísně oddělených segmentech: **chaty** (majitelé chat a chalup)
a od migrace 028 **architekti** (docs/ARCHITEKTI.md v repozitáři webdomov). Volající
dostávají kontakty z fronty jeden po druhém, zapisují výsledky hovorů a sledují svoje
statistiky. Admin navíc spravuje celou databázi kontaktů, odpovídá na dotazy AI agentů
a zakládá uživatele.

## Technologie

- **Vite + React + TypeScript**, routing přes `HashRouter` (funguje na GitHub Pages
  bez serverové konfigurace).
- **Žádná komponentová knihovna** — ručně psané CSS podle interního design jazyka
  (viz `../app-design-tokens.md`).
- Backend: **Supabase PostgREST RPC** — čisté `fetch` na
  `POST {SUPABASE_URL}/rest/v1/rpc/{funkce}` s hlavičkami `apikey` a
  `Authorization: Bearer {anon key}`. Platný DB kontrakt jsou migrace
  `../db/migration_0NN_*.sql` (poslední definice funkce vyhrává). `../db/schema.sql`
  je zastaralý výchozí stav a proti živé DB se NIKDY nespouští.

## Lokální vývoj

```bash
npm install
npm run dev      # dev server ⚠ bez DEMO jede proti ŽIVÉ DB, viz níž
npm run build    # produkční build do dist/ (tsc -b, zapnuté noUnusedLocals, pak vite build)
npm run preview  # náhled produkčního buildu
npm test         # test chování segmentu, e-mailového příznaku, volání, rozvrhu, od 056 filtrů a od 062 dovolání nad demo mockem (bez sítě, bez živé DB)
npm run test:e2e # zkouška stránek v DEMO v headless prohlížeči (viz níž)
```

## Nastavení Supabase (URL + anon klíč)

⚠ OPRAVENO 2026-09-28: dřív tu stálo, že appka nemá klíče zapečené v kódu a že bez
nastavení běží DEMO. Neplatí to. `src/config.ts` má jako zálohu **živou adresu
a veřejný (publishable) klíč**, takže appka bez čehokoli v `localStorage` jede proti
živé databázi. `#/setup` jen zapíše jinou adresu a klíč do `localStorage` prohlížeče
(klíče `volacka_supabase_url` a `volacka_anon_key`); záloha platí, kde nic uloženého není.

## DEMO režim

DEMO běží jen tehdy, když je v `localStorage` adresa, která po oříznutí mezer zůstane
prázdná: `localStorage.setItem('volacka_supabase_url', ' ')` (jedna mezera) **před**
načtením appky. Pak appka jede nad in-memory mockem (`src/api/mock.ts`) se stejným RPC
rozhraním a falešnými kontakty (data žijí jen do reloadu stránky).

**Zkoušet jen v DEMO.** Bez DEMO sahá appka na živá data. ⚠ OPRAVENO 2026-09-28: dřív
tu stálo `npx vite preview --port 5178 (port z .claude/launch.json)`, ale náhled
`call-me-maybe` v `.claude/launch.json` spouští `npm run dev -- --port 5178`, tedy **dev
server** s React StrictMode, který volá efekt dvakrát (dvě `next_contact` = dva zámky).
Obě cesty jedou proti živé DB, dokud DEMO není nastavené:

- **Automaticky:** `npm run test:e2e` (`tests/demo-e2e.mjs`) sestaví appku do dočasné
  složky, servíruje ji jen na 127.0.0.1, nastaví DEMO a vypnutý zvuk před načtením appky,
  každý požadavek mimo 127.0.0.1 zahodí (požadavek na Supabase = FAIL) a pouští přepínač
  ve volání, filtry seznamů a detail kontaktu i s odpověďmi mimo pořadí (zpoždění přes
  háček `__volackaDemoTest` v `src/api/mock.ts`, jen DEMO). Potřebuje Playwright
  (`PLAYWRIGHT_MODULE` nebo `~/webdomov/architect-templates/node_modules`) a prohlížeč
  (`PLAYWRIGHT_BROWSERS_PATH` nebo `~/webdomov-nastroje/pw`); bez nich skončí
  „NEJDE ZMĚŘIT" s kódem 2.
  Od migrace 061 (Albert 2. 11. 2026) měří blok O61 i to, že se Označené, Moji klienti a Kontakty na šířkách 1920 až
  360 px nikde neposouvají do strany (Volající i super admin), a okno „Zavolal/a jsem“ na telefonu i z detailu.
- **Ručně:** produkční build `npm run build` a `npx vite preview --port 5178 --strictPort`
  (bez StrictMode), nebo náhled `call-me-maybe` z `.claude/launch.json` (dev server).
  V obou případech nejdřív, **před prvním přihlášením**, `volacka_supabase_url = ' '`
  (v Playwrightu `page.addInitScript`, v panelu náhledu v konzoli a znovu načíst)
  a vypnutý zvuk (`volacka_sfx_enabled`, `volacka_music_enabled`,
  `volacka_pig_enabled` = `'0'`), pak přihlášení demo účtem.

Demo přihlášení (jen DEMO, falešná data v paměti):

| role                         | jméno     | heslo     |
| ---------------------------- | --------- | --------- |
| super admin + majitel (Albert) | `admin`   | `admin`   |
| super admin (Mikuláš)        | `mikulas` | `mikulas` |
| Volající (Eva, pod Albertem)    | `eva`     | `eva`     |
| Volající (Petra, pod Albertem; rozvrh nastavený a zamčený, je pozadu) | `petra`   | `volam`   |
| Volající (Honza, pod Mikulášem; rozvrh ještě nemá) | `honza`   | `volam`   |

⚠ Od migrace 042 jsou Petra a Honza Volající (role `admin`) jako Eva; NAHRAZUJE „volající (caller)“.
Eva má v demu rozvrh a je napřed. Hovory minulých dnů týdne jsou v demu jen pro rozvrh (mimo `callLog`).

Demo mock (`src/api/mock.ts`) má stejná pravidla viditelnosti jako server (migrace 023
až 038, role z 042, z 045 jména kolegů v poznámkách, u příznaku a zámku a v hledání maskovaná, Volajícímu bez `total` a `top_prodejce`, u cizího kontaktu jen allowlist `KLICE_CIZI` se `skryto: true`, filtr stavu a hledání v poznámce jen nad jeho klienty, příznak a zámek cizího odmítnut, vlákna o cizím klientovi skrytá; ⚠ NAHRAZUJE „023 až 036“, mock už zrcadlí i 037 a 038): i hledání osobního IČO jen celým číslem a jen u kontaktů, které smí upravit, IČO
ateliéru rovné osobnímu skryté s ním, vlastní karta ve volání napřed a strop 10 vrácení do
fronty za hodinu (audit 1. 10., APP-4 a APP-5; `npm test` blok L). Chaty mají id 1 až 9
a 90 až 92 (od migrace 050 i 10 až 13 a 20 až 23 pro kalendář hovorů a výdělek, viz oddíl Volání 050, od 051 i 24 bez ceny, oddíl Cena 051), falešní architekti id 300 až 303 (jen adresy `example.cz`, telefony s předvolbou 999, IČO `11111111` a `22222222` s neplatným
kontrolním součtem): 300 a 301 jsou ve frontě, 302 je nedovolaný s příznakem a bez
e-mailu (volala Petra), 303 má odeslaný návrh a čeká na odpověď (volal Honza).

Od migrace 060 (Albert 1. 11. 2026, oddíl Označení 060 níž) má demo i označení k zavolání: mock je počítá stejně jako tick
(`obnovOznaceni` v `src/api/mock.ts`, první běh s lhůtou 10 pracovních dní jako migrace, každé další označení 5). Chaty 93 až
98 (adresy `example.cz`, telefony 731 000 193 až 198): 93 Petra, návrh bez odpovědi, známka A a hvězda; 94 Petra, změny bez
odpovědi, s příznakem a přehledem od automatizace; 95 Petra, návrh před 2 dny (ještě neoznačený); 96 Petra mu volala, zájem
zapsal Honza (označení je Honzovo, Petra ho nevidí); 97 nabídka z připomínky kampaně bez odpovědi (označená, Mikuláš); 98
odmítl a dostal slevu (neoznačí se, rozhodnutí 2). Označení mají i 5 a 303 (Honza) a 90 až 92 (bez volajícího). Kdo se má
označit, mlčí aspoň 15 kalendářních dní, tedy v každý den aspoň 7 pracovních (i přes Vánoce): testy nezávisí na dni.
Od migrace 063 (Albert 1. 11. 2026, druhá etapa, oddíl Označení 063 níž): 96 má Honzovo označení už z doby před 16 dny,
lhůta 5 pracovních dní minula a před 2 dny mu odešla připomínka e-mailem (naše poslední zpráva; Petra označení ani čas
nevidí); 24 (Honza, schválil web) má hvězdu od automatizace s důvodem.
⚠ Chata 92 má místo příznaku `neodpovida` příznak `info_neoverene` od automatizace (migrace 060 příznaky `neodpovida`
zrušila); NAHRAZUJE „92 má příznak neodpovídá“ z migrace 014.
Od migrace 061 (Albert 2. 11. 2026, oddíl Kompaktní seznamy 061 níž) vidí příznak `info_neoverene` (92 a 94) jen super admin
a Albert: Mikuláš i Albert mají v Označených pilulku „Údaje z internetu (2)“, Petra u svého klienta 94 příznak nevidí nikde
(mock ho Volajícímu nepošle jako server 061 a appka ho navíc sama zahodí).

## Volání 050: nerelevantní, přeplánovat, kalendář hovorů, výdělek (Albert 21. 10. 2026)

Server: `../db/migration_050_volani_kalendar_vydelek.sql` (spouští se PŘED appkou). Albert 21. 10. 2026: v Moji klienti
známka a cena, ve volání „Nerelevantní“ (třeba starší lidé, do statistik ne jako odmítnutí) a „Přeplánovat“ („Hey, I'm at
work, call me at this time“), nová záložka s kalendářem lidí k zavolání (super admini i kalendáře ostatních), připomínka
v den hovoru a ve statistikách kolik volající vydělal celkem a tento týden (30 % z ceny webu, ne z hostingu).

- **Moji klienti**: sloupce Známka (A, B, C) a Cena: čistá částka jako „7 000 Kč“, jiný text tak, jak ho kdo zapsal
  (dlouhý zkrácený, celý v nápovědě), pod ní menší „hosting …“; „x“, „-“ a podobné = nezadáno (`cenaText` v `src/ui.tsx`).
  ⚠ 22. 10. 2026 (Albert, migrace 051) NAHRAZUJE pomlčku u nezadané ceny: nedohodnutá cena je „n/a“ (viz oddíl Cena 051).
  Na telefonu se do strany posouvá jen tabulka v rámečku. ⚠ NAHRAZENO 2. 11. 2026 (Albert, migrace 061, oddíl Kompaktní
  seznamy 061): Moji klienti, Kontakty i Označené mají řádky o dvou řádcích bez posunu do strany na každé šířce.
- **Volání**: pod třemi hlavními tlačítky menší **Nerelevantní** (okno s povinným důvodem: rychlé „starší člověk“,
  „není majitel“, „objekt neexistuje / nepronajímá“ nebo vlastní text; kontakt se už nevolá ani nepíše a do konverze se
  nepočítá) a **Přeplánovat** (výběr času: Za hodinu, Dnes 18:00, Zítra 9:00, Zítra 14:00, Za týden nebo den a čas;
  věta „Zavoláš zítra v 9:00 (za 11 h).“; poznámka z karty se přenese; `resolve_call` s `p_kdy` nejdřív za 15 minut,
  okno to hlídá stejnou hláškou a dřívější rychlé volby nenabídne; kontakt zůstane ve frontě a ve zvolený čas přijde
  tomu, kdo ho přeplánoval, jako první karta). Karta z kalendáře má nahoře cedulku „Naplánovaný hovor …“.
  `#/call?zavolat=<id>` vezme kartu přes `zavolat_vzit` (stejná kontrola pozdních odpovědí jako `next_contact`,
  závislosti `loadNext` beze změny, kontrola 75) a parametr z adresy hned zmizí; rozdělanou kartu nejdřív potvrdí.
  Zvolený segment se nemění (po recenzi 21. 10. 2026, ⚠ NAHRAZUJE „segment jde za kartou“): karta z jiného segmentu má
  žlutou cedulku „Po tomhle hovoru dostaneš …“. „Zapsat Nedovoláno“ v okně přepnutí zůstává (kontrola 102). Okna
  Nerelevantní a Přeplánovat jdou z klávesnice (fokus v okně, Escape zavře, fokus se vrátí).
- **Kalendář** (`#/kalendar`, záložka „kalendář“ s odznakem = vlastní hovory na dnešek a po termínu, dlaždice na Domů):
  Po termínu, Dnes, Nadcházející po dnech, Hotové a zrušené za 14 dní (sbalené). U hovoru Zavolat teď (kontakt ve frontě
  a jen ten, kdo má volat), číslo k vytočení, Hotovo (jen klient mimo frontu; server klienta ve frontě odmítne), Přesunout
  a Zrušit s potvrzením. Volající vidí jen svůj (server cizí odmítne), super admin si vybere sebe, kohokoli nebo
  „Všichni volající“ a při přesunu vybere, kdo zavolá. Hovor jde naplánovat i v detailu kontaktu (Moji klienti, Kontakty:
  „Naplánovat hovor“). Po recenzi 21. 10. 2026 (⚠ NAHRAZUJE „u cizího kontaktu Volajícího taky, rozhodne server“):
  Volající jen u svého klienta, tedy u kohokoli, komu kdy volal, v jakémkoli stavu (Albert 22. 10. 2026: „anyone who has been
  called by that caller … even people who didn't pick up or were irrelevant“; klient mimo frontu přijde v kalendáři s číslem
  a Hotovo, test volani Q) (kontakt z fronty přeplánuje při hovoru; podle naplánování volného kontaktu by zjistil,
  jestli mu někdo z firmy volal), super admin u každého a volný kontakt z fronty tím tomu člověku rezervuje. Detail při
  otevření načte čekající hovor (`zavolat_kontaktu`: kdy, kdo, poznámka) a okno ho přesune (předvybraný ten, kdo ho má,
  předvyplněná poznámka). Hovor deaktivovaného člověka nic neblokuje a další naplánování ho nahradí. Okno času je
  sdílené (`src/components/ZavolatModal.tsx`), čas je vždy pražský jako na serveru (`src/praha.ts`).
- **Připomínky** (`src/zavolat.tsx`): každou minutu a hned po každé změně si appka načte vlastní čekající hovory
  (`p_jen_cekajici`); lišta na Domů „Dnes máš zavolat …“ s časy a upozornění v rohu (`role="status"`) 5 minut před až
  30 minut po čase hovoru, se zvukem podle nastavení zvuků, s tlačítky Zavolat teď a Později; každý hovor v jednom čase
  jen jednou („id|kdy“ v `localStorage` `volacka_zavolat_pripomenuto_<user_id>`, přesunutý hovor připomene znovu).
  Stránka Kalendář druhý minutový dotaz nemá (načte se při otevření, po změně a když se čekající hovory při obnově
  připomínek změní). Server bez migrace 050: nic se neukáže, chyba ne.
- **Statistiky**: karty Nerelevantní a Přeplánováno a oddíl **Vyděláno** (`statistiky_volani`): celkem, tento týden
  (po až ne v Praze) v Kč, eura zvlášť, „30 % z ceny webu, hosting se nepočítá“, upozornění na prodeje, u kterých cena
  nejde přečíst (rozpětí, „po domluvě“), a seznam prodaných webů (datum v Praze) s cenou (po nabídce poloviční ceny
  částka ze slevy, jak ji agent zapsal) a provizí (od migrace 051 prodej bez dohodnuté ceny zvlášť jako „n/a“, viz oddíl
  Cena 051). Každý prodej patří jen tomu, kdo zapsal poslední zájem (recenze
  21. 10. 2026, rozhodl Albert 22. 10. 2026: „Latest interest gets it“; my_stats „prodáno“ se nemění). Super admin vybere člověka (posílá `p_user_id`). Vysvětlivka: dovoláno = odmítli + zájem (nerelevantní ani
  přeplánované se nepočítají). Rozvrh: hovor je každý zapsaný výsledek, i nerelevantní a přeplánovaný.
- **Soukromí** (`../docs/ROLE-A-VIDITELNOST.md`): kalendář i výdělek Volající jen svůj; kontakt v kalendáři jde stejnou
  maskou jako v seznamech (cizí klient Volajícího jen jméno a kontakt se `skryto`), kdo hovor naplánoval, je u jiného
  Volajícího „jiný volající“. Appka jen neukazuje, co by server stejně odmítl.
- **Starý server** (bez 050): `p_kdy` se posílá jen u přeplánovaného hovoru, takže ostatní výsledky hovoru fungují dál;
  kalendář, připomínky a výdělek se tiše neukážou.
- **Demo**: Petra má hovor po termínu (karta 10, ve volání přijde první), hovor u klienta mimo frontu (9, Hotovo),
  kontakt z fronty, který jí na zítra naplánoval Albert (12, rezervovaný) a jeden hotový; Honza hovor na zítra (11). Petra prodala dřív Penzion Šumava
  (4 900 Kč → 1 470 Kč) a tento týden Chalupu Na Vršku (7 000 Kč → 2 100 Kč) a má jeden nerelevantní kontakt (13);
  Honza prodal web s cenou „6000-7000 Kč po domluvě“ (nejde přečíst) a jeden po slevě (3 500 Kč místo 7 000 Kč →
  1 050 Kč); Eva web za 250 eur (75 €). Mock zrcadlí server včetně hlášek (`resolve_call`, `next_contact` průchod 0b,
  `zavolat_*`, `statistiky_volani`, `app_cena_cist` jako `cenaCist`, trigger data prodeje).
- **Testy**: `npm test` blok volání (`tests/volani.test.mjs`: V výdělek a tabulka vzorků ceny shodná s test_050 mezi
  řádky „vzorky ceny: začátek/konec“, kontrola 204; M formátování; Z připomínky; K kalendář, práva a maska; N
  nerelevantní; P přeplánovat a co appka posílá serveru; R hovory deaktivovaného člověka; S zapojení) a `npm run test:e2e`
  bloky C (Moji klienti 1280 a 390 px), N, P, K (Petra a Mikuláš, 1280 a 390 px), K seg (segment se nepřepne potichu),
  H (odznak a lišta na Domů), T (detail kontaktu a upozornění) a E (výdělek, super admin vybírá člověka, 390 px).

## Cena 051: cena při „Mají zájem“ nepovinná, nedohodnutá = „n/a“ (Albert 22. 10. 2026)

Server: `../db/migration_051_cena_na.sql` (spouští se PŘED appkou: starý server bez 051 zájem bez ceny odmítne hláškou
„vyžaduje vyplněnou cenu webu“). Albert 22. 10. 2026: „make the web and hosting price optional at Mají zájem … earnings
count only once a price is known“ a nejnovější oprava „there's n/a on the hosting and on the prices when we haven't
arranged them yet“. ⚠ 22. 10. 2026 (Albert) NAHRAZUJE povinnou cenu webu i hostingu při zájmu (od 1. 9. 2026, commit
7c982cd), kvůli které volající psali výplně jako „7000 / hosting 0“ nebo „Xx“. Zapsané ceny se nepřepisují.

- **Volání**: „Cena webu (nepovinné)“ a „Cena hostingu (nepovinné)“ s nápovědou „Nech prázdné = n/a, cena zatím
  nedohodnutá“ a že se agent na cenu zeptá ve Zprávách (volajícího, super admina nebo Alberta), až klient web bude chtít,
  a tu pak klientovi napíše (Albert 22. 10. 2026 dopoledne: návrh bez dohodnuté ceny cenu neuvádí); povinná je jen známka (A, B, C). Prázdné pole (i jen mezery) i napsaná výplň („n/a“, „x“, „0“) jde
  serveru jako `null`, nikdy `''` ani text „n/a“ (`cenaProServer` v `src/ui.tsx`); server pak cenu, která u kontaktu už je,
  nepřepíše (`coalesce`, jako známka) a napsanou výplň sám taky uloží jako null (po revizi DB 22. 10. 2026).
- **Nedohodnutá cena** = prázdná nebo zástupná hodnota (x až xxx, yx, 1 až 3 pomlčky, n/a, n.a. a po revizi DB i nula:
  „0“, „00“, „0 Kč“, „0,-“; po `trim()`; `cenaNezadana` a `CENA_ZASTUPNA` v `src/ui.tsx`, zrcadlo serverové
  `app_cena_nezadana`; tabulka vzorků „vzorky nezadané ceny: začátek/konec“ v `tests/volani.test.mjs` je shodná
  s test_051, 20 řádků, kontrola 205). Text „n/a“ se do databáze nezapisuje.
- **Moji klienti** (Cena): web bez ceny šedé „n/a“, hosting bez ceny pod cenou webu „hosting n/a“, bez obou jen jedno
  šedé „n/a“ (nápověda „Cena webu ani hostingu zatím není dohodnutá“), web bez ceny a hosting s cenou „n/a“ a pod ním
  „hosting 1 000 Kč“. Kontakty sloupec s cenou nemají (cenu ukáže detail).
- **Detail kontaktu**: řádek jen ke čtení „cena webu: n/a · cena hostingu: n/a“ (jinak text, jak ho kdo zapsal); pole
  k úpravě mají nápovědu „n/a“ a vymazané pole i napsané „n/a“ nebo „0“ se uloží jako `null` (`update_kontakt` uloží, co
  dostane, proto to hlídá appka); pole pak ukáže uloženou hodnotu.
- **Statistiky** (Vyděláno): prodej, u kterého cena webu zatím není dohodnutá (bez slevy), má cenu i provizi „n/a“,
  do součtu se nepočítá a má vlastní upozornění („U 1 prodaného webu cena zatím není dohodnutá (n/a) … Započítá se sama,
  až bude cena webu v detailu klienta.“, `neznama`, `neznama_tyden`). „Cena nejde přečíst“ zůstává jen pro zapsanou
  nečitelnou cenu (`nejasne`). Server bez 051 `neznama` neposílá: appka počítá s nulou.
- **Demo**: Honza prodal tento týden Chalupu U Studánky (kontakt 24) bez ceny: v jeho výdělku „n/a“.
- **Testy**: `npm test` blok D (`tests/volani.test.mjs`: vzorky nezadané ceny, zájem bez ceny i s napsaným „n/a“ nebo
  „0“ uloží `null` a nesmaže stávající cenu, `cenaProServer`, známka povinná, výdělek `neznama`) a `npm run test:e2e`
  bloky A (zájem jen se známkou, Moji klienti, detail včetně napsaného „n/a“, Statistiky, 390 px) a C4 („n/a“ místo
  pomlčky).

## Statistiky za den, filtry Moji klienti a řazení 056 (Albert 27. 10. 2026)

Server: `../db/migration_056_statistiky_den_filtry.sql` (spouští se PŘED appkou; nová appka bez 056 jede dál a nové volby
jen řeknou, že je server ještě neumí). Albert 27. 10. 2026: „for the super admins … when we can see anyone's statistics,
we should also be able to see their statistics for a specific day“, v Moji klienti „the same like filters as we have in
the contacts. this only applies for the super admins“ a k oběma seznamům „sort them … from the newest to the oldest updated
client“.

- **Statistiky** (jen super admin): pod výběrem člověka „Za jaké období“: Celkem (od začátku, jako dřív) nebo Jeden den
  (výchozí dnes, šipky na předchozí a další den, tlačítko Dnes, nejvýš dnešek). Den je pražský (od půlnoci do půlnoci,
  i v den změny času) jako na serveru. Za den jsou všechna čísla jen toho dne: hovory, dovoláno, zájem, odmítnuto,
  nedovoláno, konverze, nerelevantní a přeplánováno (hovory z call_log toho dne) a prodáno (weby, které se ten den
  prodaly, podle `kontakt_prodej` jako výdělek, a u kterých měl ten člověk zájem; ne podle dne hovoru, součet dnů je
  celkem). Výdělek, dny jako #1 prodejce a Klienti podle stavu den nemají, v pohledu dne se neukazují. Server
  `all_stats(p_token, p_den)` (dál jen super admin), appka posílá `p_den` jen za den (`allStats(token, den)`).
- **Moji klienti** (jen super admin): nad klienty vybraného člověka stejné filtry jako Kontakty: stav s počty, známka,
  čekání na odpověď s koši (zapnutí = koš „k zavolání“) a sloupcem Čeká, hledání na serveru (jméno, studio, telefon, web,
  e-mail, město, IČO, poznámka) a řazení. Server `my_kontakty` s `p_status`, `p_rating`, `p_search`, `p_cekani`, `p_kos`
  a `p_razeni` jako list_kontakty (hledání v poznámce přes masku jmen kolegů, osobní IČO jen celým číslem u kontaktu, který
  smí upravit), total = počet po filtru, řádky s čekáním (`cekani_*`). Volající má Moji klienti beze změny (jen hledání
  v načtených řádcích a výchozí pořadí, appka mu nové parametry neposílá).
  ⚠ Od migrace 060 (Albert 1. 11. 2026, oddíl Označení 060 níž) má filtry, hledání na serveru i řazení v Moji klienti
  i Volající, jen nad svými klienty; NAHRAZUJE „jen super admin“ a „Volající má Moji klienti beze změny“ z tohoto bodu.
  Počty u stavů a košů má dál jen super admin.
- **Řazení** (Kontakty každý, Moji klienti super admin): „Řazení: výchozí“, „Podle poslední změny (od nejnovější)“
  a „Podle poslední změny (od nejstarší)“ (`RazeniSelect` v `src/ui.tsx`). Poslední změna = sloupec Změněno
  (`updated_at`): posune ji hovor, úprava v detailu, příznak a kalendář v appce, změna stavu od agenta ne (automatizace
  `updated_at` nepíše). Volajícímu server v Kontaktech řadí podle změny jen jeho klienty, cizí kontakty jsou dál za nimi
  jen podle čísla (045: datum změny cizího kontaktu by prozradilo průběh); nápověda nad tabulkou to říká.
  ⚠ Od migrace 057 (oddíl níž) je poslední změna i změna od automatizace (`posledni_zmena`) a přibylo řazení podle
  posledního hovoru (NAHRAZUJE „Poslední změna = `updated_at`, změna stavu od agenta ne“).
- **Starý server** (bez 056): `p_den`, `p_razeni` a filtry Moji klienti jdou jen, když jsou zapnuté; na PGRST202 appka
  řekne, co server ještě neumí (`BEZ_056_DEN`, `BEZ_056_RAZENI`, `BEZ_056_FILTRY` v `src/api/supabase.ts`). Stará appka
  s 056 funguje beze změny (posílá jen staré parametry).
- **Demo**: mock dělá totéž (den v Praze, prodáno podle dne prodeje, filtry a hledání s maskou jako server, řazení podle
  `updated_at` a u Volajícího cizí jen podle čísla, stejná hláška „Neplatné řazení: …“).
- **Testy**: `npm test` soubor `tests/filtry.test.mjs` (D den, F filtry a shoda s Kontakty, R řazení, S co appka posílá
  serveru, U zapojení stránek) a `npm run test:e2e` bloky D056 (den, 1280 a 390 px, Volající výběr nemá), F056 (filtry
  a řazení Moji klienti, 1280 a 390 px, Volající beze změny) a R056 (řazení Kontakty, Volající napřed svoji). Server:
  `../db/tests/test_056_statistiky_den_filtry.sql`; kontrola 217 v repu webdomov.

## Řazení podle poslední změny a posledního hovoru 057 (Albert 28. 10. 2026)

Server: `../db/migration_057_razeni_zmena_hovor.sql` (spouští se PŘED appkou). Albert 28. 10. 2026: „I think there should be
both filters. One for the latest change regarding anything like if we send them a proposal or status change, and the second
one should be just the last time they were called, or the moment they were called, the day they were called.“

- **Poslední změna** (sloupec Změněno, řazení „Podle poslední změny“): nejpozdější z úpravy v appce (`updated_at`), změny
  stavu (i od automatizace: návrh odeslán, schváleno, faktura), odeslaného návrhu a naší odpovědi nebo odpovědi klienta
  z pošty. Server ji posílá jako `posledni_zmena` (list_kontakty, my_kontakty); appka ukáže `zmenenoKdy` (novější
  z `posledni_zmena` a `updated_at`, proti serveru bez 057 `updated_at`). Hodnoty řazení zůstaly `zmena_nejnovejsi`
  a `zmena_nejstarsi`, takže stará appka s 057 řadí stejně jako nová.
- **Poslední hovor** (nový sloupec s datem a časem, řazení „Podle posledního hovoru“ od nejnovějšího i nejstaršího,
  `hovor_nejnovejsi`, `hovor_nejstarsi`): `posledni_hovor` z call_log, kontakty bez hovoru jsou v obou směrech na konci.
  Super admin a Albert vidí hovory všech lidí. **Volající jen svoje**, i u svých klientů (045: o hovorech kolegů nezjistí
  nic): sloupec se mu jmenuje „Můj poslední hovor“, řazení „Podle mého posledního hovoru“ a u cizího kontaktu je pomlčka
  (server klíč nepošle). Kontakty: řazení pro každého (Volajícímu jen mezi jeho klienty, cizí dál za nimi podle čísla,
  nápověda to říká); Moji klienti: sloupec pro každého, řazení jen super admin (jako filtry 056).
  ⚠ Od migrace 060 (Albert 1. 11. 2026) řadí v Moji klienti i Volající (mezi svými klienty) a řazení je šest (navíc
  „Nejdéle bez odpovědi“ a „Hvězda nejdřív“); NAHRAZUJE „řazení jen super admin“ v Moji klienti.
- **Starý server** (bez 057): řazení podle hovoru server odmítne a appka řekne `BEZ_057_HOVOR` (`src/api/supabase.ts`);
  sloupec posledního hovoru má pomlčky a Změněno ukazuje `updated_at`.
- **Demo**: mock dělá totéž (`posledniZmena`, `posledniHovor`, `hovoryOd`, klíče před maskou jako server). Prodané demo
  kontakty mají změnu stavu v den prodeje (`status_changed_at`, jako trigger na serveru), takže prodeje z tohoto týdne mají
  poslední změnu novější než `updated_at`; změna stavu v mocku (`resolveCall`, `updateKontakt`) ji posune.
- **Testy**: `npm test` soubor `tests/filtry.test.mjs` blok H (poslední změna z pěti sloupců, změna stavu od automatizace,
  hovory všech u super admina, jen vlastní u Volajícího, cizí bez klíčů, hláška bez 057, stránky) a upravené bloky R a U;
  `tests/segment.test.mjs` U9 (šest pomlček u cizího kontaktu); `npm run test:e2e` bloky R057 (1280 a 390 px: čtyři řazení,
  Změněno z poslední změny, sloupec a řazení podle hovoru, Moji klienti super admina) a R057 petra („Můj poslední hovor“
  jen z jeho hovorů) a U2 (pět pomlček). Server: `../db/tests/test_057_razeni_zmena_hovor.sql`; kontrola 217 v repu webdomov.

## Označení k zavolání, hvězda, filtry a přehled 060 (Albert 1. 11. 2026)

Server: `../db/migration_060_oznaceni_hvezda.sql` (spouští se PŘED appkou; nová appka bez 060 jede dál a nové věci jen řeknou,
že je server ještě neumí). Albert 1. 11. 2026: klient, který na naši zprávu víc než 5 pracovních dní neodpověděl, je označený
pro svého volajícího, „the caller always sees only the clients he called and are marked, not other callers' clients“, a
dovolání „should not count as two separate calls … as one call and as one client still“. Tohle je první etapa (označení, hvězda,
filtry, přehled jen ke čtení); připomínku e-mailem, hvězdu a zápis přehledu od automatizace přidává druhá etapa (oddíl 063 níž;
⚠ NAHRAZUJE „přidá automatizace ve stage 2“): přehled a hvězdu píše worker po jobu s klientem bez ohledu na přepínače, připomínky po
lhůtě a doplnění přehledů ostatním klientům tick zařadí až po zapnutí přepínačů `PRIPOMINKY_OZNACENI` a `PREHLED_DOPLNIT`
(zapíná je koordinující session po Albertově ano).

- **Filtry** (`src/components/SeznamFiltry.tsx`, stav filtrů `src/filtry.ts`): jeden řádek filtrů v Kontaktech, Moji klienti
  a Označených: segment, Stav (víc najednou), Známka (A, B, C, bez známky, víc najednou), Jen s hvězdou, Neodpověděl (na
  návrh, na změny; v Označených místo něj pilulky „Co je potřeba“), Mlčí od–do v pracovních dnech s předvolbami 5+, 10+,
  20+ a 30+, Řazení (navíc „Nejdéle bez odpovědi“ a „Hvězda nejdřív“), hledání a „Zrušit filtry“; super admin navíc
  volajícího (v Označených i „bez volajícího“). Filtry se kombinují (mezi filtry a zároveň, v jednom filtru nebo) a drží se
  ve stavu stránky, ne v adrese (`docs/ARCHITEKTI.md` 9.6). Jeden stav nebo jedna známka A až C jde serveru po staru
  (`p_status`, `p_rating`), víc hodnot a nové filtry v `p_statusy`, `p_znamky`, `p_jen_hvezda`, `p_kategorie`, `p_mlci_min`
  a `p_mlci_max`, a to jen když jsou zapnuté. ⚠ Volající má filtry, hledání na serveru i řazení i v Moji klienti, jen nad
  svými klienty; NAHRAZUJE „filtry Moji klienti jen super admin“ z oddílu 056 (počty u stavů a košů dál jen super admin).
- **Sloupce**: Kontakty a Moji klienti „Mlčí“ (odznak označení a „12 prac. dní“; u cizího kontaktu Volajícímu pomlčka
  `Skryto`), hvězda u jména svého klienta. Označené: Co je potřeba, Mlčí („6 prac. dní od naší zprávy“ a zvlášť „mlčí od
  <den>“, když se liší: u návrhu od prvního návrhu; ⚠ recenze 2. 11. 2026 NAHRAZUJE „6 prac. dní od <den návrhu>“), Naše
  poslední zpráva, Klient naposledy (datum nebo „nikdy“), Lhůta, u super admina Volající.
- **Označené** (`#/oznacene`, `list_oznacene`): otevřená označení k zavolání, která přihlášený vidí (Volající jen svá),
  a klienti s příznakem jako dřív; s hvězdou nahoře. „Zavolal/a jsem“ otevře okno (`src/components/DovolaniOkno.tsx`) se
  čtyřmi výsledky (⚠ NAHRAZENO 2. 11. 2026, Albert, migrace 061: pět výsledků, pátý „Nic z toho výše“, a poznámka pro
  automatizaci u každého, oddíl Kompaktní seznamy 061 níž): „Nedovolal/a jsem se“ (označení zůstává, počítá pokusy), „Nechce
  web“ (stav odmítnuto), „Nechce, abychom ho kontaktovali“ (stav nekontaktovat) a „Mluvili jsme – co klient chce“ (text
  povinný: jde do poznámky a jako vzkaz automatizaci do vlákna kontaktu), a s „Velký zájem (hvězda)“; `zapis_hovor` nikdy nepíše call_log (statistiky, Rozvrh,
  výdělek ani fronta se nemění) a naplánovaný hovor vyřídí jako hovor z fronty (vlastní hotovo, cizí zrušený). Kdo kontakt
  nesmí upravit (`smi_upravit` false, třeba super admin cizího týmu), dostane v okně jen „Nedovolal/a jsem se“ (server
  ostatní odmítne); důvod u „Nechce web“ a „Nechce, abychom ho kontaktovali“ nejvýš 450 znaků jako server (recenze
  2. 11. 2026). Lhůta: „Lhůta na zavolání do <den>“ (bez slibu e-mailu; ⚠ etapa 2, migrace 063: zůstává tak, ať je
  přepínač připomínek zapnutý, nebo ne, NAHRAZUJE „Připomínka e-mailem po <den>“; odeslanou připomínku
  ukáže řádek pod lhůtou, oddíl 063). Super admin a Albert ještě „Zrušit označení“ s povinným důvodem (`oznaceni_zavrit`).
- **Hvězda** (velký zájem nad známkou, `src/components/Hvezda.tsx`, ikona `HvezdaIcon`, jiná než u „Mají zájem“): ve
  volání zaškrtávátko „Velký zájem (hvězda)“ u zájmu (`nastav_hvezdu` až po uloženém `resolve_call`; když hvězda selže,
  zájem zůstane a appka řekne, ať ji dá v detailu), v detailu přepínač hned bez „Uložit změny“, v seznamech u svých klientů.
  Kdo smí: jako úprava kontaktu (`app_smi_upravit`). Kolegovo jméno u hvězdy je Volajícímu „jiný volající“.
- **Přehled klienta** (`src/components/PrehledPanel.tsx`, `kontakt_prehled`): v detailu a na kartě ve volání, jen u svého
  klienta (nikdy ve větvi cizího kontaktu): fakta (stav a od kdy, hvězda, označení s lhůtou, mlčení, první návrh, naše
  poslední zpráva, klient naposledy, nabídka slevy, naplánovaný hovor, cena) a texty automatizace „Teď a další krok“, „Co
  klient chce / napsal“, „Co jsme poslali a slíbili“, „Pozor“; bez textu „Přehled doplní automatizace po další e-mailové
  výměně.“ Na kartě ve volání jen, když je co říct navíc ke stavu. Seznamy přehled nenesou.
- **Popisky**: `bez_odpovedi` = „Archiv – neodpověděl“ (⚠ NAHRAZUJE „Neodpověděl“), kategorie „Neodpověděl na návrh“
  a „Neodpověděl na změny“. ⚠ Příznak `neodpovida` už nejde vybrat ani nastavit (`VOLITELNE_FLAGS` v `src/ui.tsx`, server
  ho odmítne); NAHRAZUJE „neodpovídá nasadí i člověk“ a slib v nápovědě příznaku, staré příznaky zůstávají jen v historii.
- **Soukromí** (jako 045): Volajícímu cizí kontakt žádnému novému filtru nevyhoví a nenese žádný nový klíč (allowlist
  `KLICE_CIZI` beze změny), označení vidí jen svoje (`volajici_id`), u společného klienta ani kolegovo.
- **Starý server** (bez 060): nové parametry jdou jen zapnuté; na PGRST202 appka řekne, co server ještě neumí
  (`BEZ_060_FILTRY`, `BEZ_060_RAZENI`, `BEZ_060_OZNACENE`, `BEZ_060_HOVOR`, `BEZ_060_HVEZDA`, `BEZ_060_PREHLED` v
  `src/api/supabase.ts`); Označené pak ukážou klienty s příznakem jako dřív (`list_flagged`).
- **Demo**: mock dělá totéž (pracovní dny se stejnými svátky v `src/praha.ts`, `obnovOznaceni` jako tick, vlastník podle
  posledního zájmu, kampaň ano a odmítnutí se slevou ne, stejné hlášky a pořadí kontrol), data v oddílu DEMO režim.
- **Testy**: `npm test` soubor `tests/filtry.test.mjs` blok O (pracovní dny, označení, filtry, soukromí, co appka posílá
  serveru, hlášky bez 060), `tests/segment.test.mjs` U10 (cizí řádky bez nových klíčů, větev cizího kontaktu bez přehledu
  a hvězdy), `tests/priznak.test.mjs` H7 a M7 (`neodpovida`), `tests/volani.test.mjs` blok Y (dovolání mimo call_log,
  hvězda ve volání) a `npm run test:e2e` bloky O060 (Označené 1280 a 390 px, okno a hvězda, přehled, super admin, filtry
  Kontaktů Volajícího, hvězda ve volání) a upravené F056, R057, U5. Server: `../db/tests/test_060_oznaceni.sql`.

## Kompaktní seznamy, příznak z internetu jen super adminům a pátý výsledek dovolání 061 (Albert 2. 11. 2026)

Server: `../db/migration_061_internet_jen_super_dovolani.sql` (spouští se PŘED appkou; nová appka proti serveru bez 061 jede
dál, jen „Nic z toho výše“ server odmítne a appka to řekne hláškou `BEZ_061_JINE`). Albert 2. 11. 2026: „you have to slide …
to the side and it's super inconvenient … make it a little bit more compact … or just fits into the screen without sliding
anywhere, and that includes the buttons“, „these four options. Plus … one more option which says none of it above. And plus
there should be a note“, u „Nedovolal/a jsem se“ „it shouldn't be removing the mark“ a k příznaku z internetu „only the super
admins will see this flag, but the callers don't need to see the [flag]“.

- **Kompaktní řádky** (`table.kontakty.kompakt` v `src/styles.css`; Označené, Moji klienti, Kontakty): ⚠ NAHRAZUJE širokou
  tabulku, která se posouvala do strany v rámečku (1 364 až 1 427 px v rámečku 1 180 px, poslední sloupec nebyl vidět na
  žádné šířce). Každý klient je řádek o dvou řádcích bez vodorovného posunu na každé šířce od 360 px, pro Volajícího i super
  admina. Nahoře hvězda, segment, jméno a telefon (v Označených telefon jako odkaz k vytočení a akce), pod tím ostatní údaje
  s malým popiskem (jen v CSS, `data-label`), které se na úzké obrazovce zalomí. Tabulka zůstává tabulkou (role v TSX, protože
  se mění `display`), hlavička je jen pro čtečky; prázdná buňka se nevykreslí a buňku jen s pomlčkou cizího kontaktu (`Skryto`)
  CSS schová (nápověda nad Kontakty to vysvětluje). Obsah buněk Moji klienti a Kontaktů se nemění; klepnutí na řádek dál
  otevře detail, telefon tam zůstává obyčejný text.
- **Řádek Označených**: 1. řádek hvězda, segment, jméno (tlačítko, otevře detail i z klávesnice), telefon jako odkaz
  k vytočení a akce „Zavolal/a jsem“ (označení; ⚠ od 062 i řádek jen s příznakem, když ho přihlášený smí zapsat), „Vyřešeno“ (příznak, který přihlášený smí zrušit, stejná práva jako
  v detailu: super admin každý, Volající u svého klienta) a super adminovi „Zrušit označení“. 2. řádek Co je potřeba, stav,
  mlčení („6 prac. dní od naší zprávy“ a „mlčí od …“), naše zpráva, klient naposledy, lhůta s „nedovoláno N×“, super adminovi
  „volá X“ nebo „bez volajícího“ a poznámka příznaku na dva řádky (celá v nápovědě a v detailu). „Vyřešeno“ v řádku zavolá
  `clear_flag` bez potvrzení (jako detail) a detail neotevře: bez označení řádek zmizí, s označením zůstane bez příznaku;
  věta o tom je v živé oblasti (`role="status"`). Na telefonu jsou akce na vlastním řádku přes celou šířku a větší.
- **Okno „Zavolal/a jsem“** (`src/components/DovolaniOkno.tsx`): pět výsledků (⚠ NAHRAZENO 2. 11. 2026 migrací 062: šest, i „Chce web“, a okno i bez označení, oddíl 062 níž), pátý „Nic z toho výše“ (`jine`: hovor
  proběhl, ale nesedí nic ze čtyř; označení se uzavře a počítá se jako úspěšné dovolání jako „Mluvili jsme“). Pod nimi vždy,
  i před výběrem, pole „Poznámka pro automatizaci“: povinná u „Mluvili jsme“ a „Nic z toho výše“ (`poznamkaPovinna`), jinak
  nepovinná; nejvýš 450 znaků u „Nechce web“ a „Nechce, abychom ho kontaktovali“ (server ji dává i do důvodu změny stavu),
  jinak 2 000; počítadlo „N / max“ zčervená, když je poznámka moc dlouhá (i po přepnutí na kratší výsledek). Poznámka jde
  serveru u každého výsledku (i „Nedovolal/a jsem se“, které dál označení neruší, jen přičte pokus). S právem kontakt upravit
  ji automatizace dostane jako u „Mluvili jsme“: řádek „[den jméno] Dovolání: <výsledek>: <poznámka>“ v poznámce kontaktu
  a vzkaz „Dovolání (jméno): <výsledek>: <poznámka>“ do vlákna. Kdo kontakt upravit nesmí (jen „Nedovolal/a jsem se“), toho
  poznámka zůstane jen v události `dovolani`, kterou appka nikde neukazuje; okno to řekne pod polem a po zápisu („Poznámka
  se uložila jen k záznamu pokusu, v appce ji nikdo neuvidí.“, `poznamka_predana` false; recenze 2. 11. 2026 ⚠ NAHRAZUJE
  slib historie, kterou appka nemá). Detail kontaktu má na telefonu pod sloupcem prasátka vlastní pruh vlevo jako stránka
  (`body.pig-layer .drawer`, obsah od 70 px), pilulky „Nerelevantní“ a „⏰ Přeplánovat“ ve volání nejsou užší než text
  a na úzkém telefonu se zalomí pod sebe. Okno i „Zrušit označení“ jdou přes `createPortal` do `body` nad sloupec prasátka (z detailu by
  jinak byla pod ním); okno je sloupec, posouvá se jen jeho tělo, chyba serveru a tlačítka zůstávají vidět.
- **Příznak „Údaje z internetu“ (`info_neoverene`) jen super adminům a Albertovi**: server 061 ho Volajícímu neposílá,
  appka ho navíc zahodí sama (`JEN_SUPER_FLAGS`, `priznakVidi`, `priznakProRoli` v `src/ui.tsx`): Volající nemá pilulku,
  odznak, počet, řádek jen s tímto příznakem, kartu ve volání, panel v detailu ani volbu ve výběru příznaku; skrytý příznak
  je pro něj jako žádný a „Označit klienta“ ho nahradí jeho vlastním (061 to dovolí). Super admin beze změny.
- **Demo**: chaty 92 a 94 mají `info_neoverene`: Petra (Volající) u svého klienta 94 příznak nevidí, Mikuláš a Albert ano
  („Údaje z internetu (2)“).
- **Testy**: `npm test` `tests/volani.test.mjs` blok W (pomocníci D1, pět výsledků, poznámka u každého výsledku, zapojení
  stránek), `tests/filtry.test.mjs` O15b, O15c a O16c, `tests/priznak.test.mjs` M4b a M4c; `npm run test:e2e` blok O61
  (O61a bez posunu do strany: Petra, Mikuláš a Albert × Označené, Moji klienti, Kontakty × 1920, 1440, 1280, 1024, 768, 390
  a 360 px, stránka, rámeček i každá buňka a tlačítko; O61b okno na 360×640, 390×844 a 1280×900 z řádku a 390×844 z detailu;
  O61c nedovolání s poznámkou nechá označení a „nedovoláno 1×“, „Nic z toho výše“ ho uzavře s poznámkou a vzkazem; O61d
  „Vyřešeno“ v řádku Volajícího i super admina; O61e „Údaje z internetu“ Volající nikde, super admin ano) a upravené L3a,
  O60e, O60h (⚠ O60k nahradil O61a). Server: `../db/tests/test_061_internet_jen_super_dovolani.sql`.

## „E-mail se vrátil“ u označení a věta u důvodu stavu (audit soudržnosti, Albert 2. 11. 2026)

Bez migrace (appka nad serverem 061). Albert 2. 11. 2026: „make sure that all the parts of the automation work together and
the agents don't get confused by what they're supposed to be doing“ (audit soudržnosti automatizace, nálezy STUCK-9 a R4).

- **„e-mail se vrátil“ v řádku Označených** (`EmailSeVratil` a `emailSeVratil` v `src/ui.tsx`, styl `.badge.ozn-odraz`):
  označený klient (Neodpověděl na návrh nebo na změny) s příznakem „Chybí e-mail“ (`chybi_email`, dává ho odraz našeho
  e-mailu, `../orchestrator/odrazy.py`) má hned za skupinou světlý odznak s růžovým okrajem „e-mail se vrátil“: klient návrh
  (u změn naši poslední zprávu) nejspíš nikdy neviděl, volající se ho tedy nemá ptát, jestli se na web podíval (nápověda
  odznaku: „… Při hovoru zjisti platný e-mail (víc v poznámce příznaku).“). Bez označení odznak není (příznak stačí sám),
  u jiných druhů příznaku taky ne (`email_neoveren` = adresa funguje, jen ji klient nepotvrdil). Řádek zůstává kompaktní,
  bez posunu do strany od 360 do 1920 px.
- **Věta u důvodu změny stavu v detailu** (`DUVOD_STAVU_NAPOVEDA` v `src/ui.tsx`): „Důvod čte automatizace jen u Odmítnuto
  (u architekta i u Nekontaktovat). Pokyn pro agenta napište do Vzkazů agentovi.“ ⚠ NAHRAZUJE „Důvod si přečte automatizace
  a podle něj pokračuje (třeba u „Odmítnuto“ po návrhu pošle jednu nabídku poloviční ceny).“ (migrace 059): důvod jiné změny
  stavu žádný agent nečte (předávat důvody začne až migrace 062).
- **Demo**: žádný označený klient příznak „Chybí e-mail“ nemá; e2e ho dá v detailu (93 Petra, 90 Mikuláš).
- **Testy**: `npm test` `tests/volani.test.mjs` blok AU (AU1 až AU5); `npm run test:e2e` blok AU (AU10a odznak hned za
  skupinou a před příznakem, 302 s příznakem bez označení bez odznaku; AU10b a AU10c bez posunu do strany na 1920 až 360 px
  pro Volajícího i super admina; AU11a věta u důvodu stavu, AU11b zavřený detail bez uložení nic nezmění).

## „Zavolal/a jsem“ všude, šestý výsledek „Chce web“ a menu stavů 062 (Albert 2. 11. 2026)

Server: `../db/migration_062_dovolani_vsude.sql` (pořadí nasazení v `../db/README-DEPLOY.md`, oddíl Migrace 062; appka až po
migraci: server bez 062 výsledek `chce_web` odmítne „Neplatný výsledek dovolání: chce_web. …“ a stará appka s 062 funguje dál).
Albert 2. 11. 2026: „I would like to have this also in my clients section … even if the client isn't marked yet and you call
them again, you should have like a I called them button … you can even add [it] to the contacts section“; k šestému výsledku
(A1) „Yes, you can add the sixth option“ a „if the client accepts it over the second call the automation should then … write him
an email … he should be sent the same website“; A3 „if the client refuses the preview on the first call, I don't think we should
be calling them again“; o menu stavů „Limit it“.

- **Tlačítko „Zavolal/a jsem“** (`src/components/DovolaniTlacitko.tsx`, pilulka z Označených s vlastním oknem): Označené (i řádek
  jen s příznakem), Moji klienti a Kontakty v 1. řádku za telefonem (buňka `td.radek-akce`, prázdná se schová; na telefonu do
  640 px jen ikona, název v `aria-label` a `title`), detail klienta bez označení (`PrehledPanel`: „Klient není v Označených.“
  s tlačítkem; u označení beze změny tlačítko u označení). Klik detail neotevře (`stopPropagation`, i klik na pozadí okna:
  okno je přes `createPortal`, ale události React jdou stromem komponent k řádku). Kdo ho vidí, říká `dovolatSmi` v `src/ui.tsx`:
  nikdy u cizího kontaktu Volajícího (`skryto`), u otevřeného označení, které přihlášený vidí, vždy, jinak jen s `smi_upravit`
  a mimo `DOVOLANI_NE` (fronta volání `nekontaktovano` a `nedovolano`, `nekontaktovat`, `nerelevantni`, `odmitnuto`
  a `sleva_nabidnuta`; kampaňová chata s nabídnutou slevou ho má přes své označení). Šest buněk `Skryto` v Kontaktech
  (kontrola 193) se nemění. Kterou větev zapíše, vybere server (`zapis_hovor`: označení přihlášeného = jako 061, jinak další
  hovor bez označení, odpověď `oznaceno` false a `oznaceni_id`, `otevrene`, `pokusy` null).
- **Okno** (`src/components/DovolaniOkno.tsx`): šest výsledků v pořadí Nedovolal/a jsem se, Chce web, Mluvili jsme – co klient
  chce, Nechce web, Nechce, abychom ho kontaktovali, Nic z toho výše (⚠ NAHRAZUJE pořadí 061 s pěti výsledky: „Chce web“ není
  hned vedle „Nechce web“, „Nic z toho výše“ zůstává poslední). „Chce web“ (`chce_web`) má nepovinnou poznámku, vzkaz agentovi
  jde vždy; nápověda „Klient web chce: automatizace mu pošle e-mail s odkazem a domluví zbytek (hosting, faktura).“, bez náhledu
  „Náhled ještě nemá: automatizace ho připraví (jen jeden).“, po prodeji „druhé potvrzení neposílá“, u architekta s náhledem
  „… poprosí o krátké písemné potvrzení, fakturu pošle až po něm“ (rozhodnutí D22 z 3. 11. 2026: odpovědi architektům slibují
  „Nic nefakturuji, dokud mi sám písemně nenapíšete, že web chcete“). Bez označení nahoře
  „Klient není v Označených: zapíše se další hovor, ve statistikách nový hovor není.“ a žádná věta o označení ani lhůtě.
  „Nechce web“ a „Nechce, abychom ho kontaktovali“ jsou vypnuté s větou serveru (`odmitnutiNejde`): po prodeji (`PRODEJ`),
  u Eskalace a Pozastaveno pro Volajícího a bez označení u klienta, kterého vede kolega (poslední volající „jiný volající“;
  server měří posledního zájemce, `oznaceni_vlastnik`). Věta po zápisu říká, kterou větev server vybral (`vetaOznaceni`: „Zapsáno
  jako další hovor bez označení.“, označení mezitím zmizelo, nebo se tím uzavřelo).
- **Kalendář**: Hotovo u klienta mimo frontu, kterému jde dovolání zapsat, otevře stejné okno; když hovor, na který člověk klikl,
  po zápisu pořád čeká (pozdější den, server vyřídí jen hovory do konce dneška; hovor kolegy u super admina), uzavře ho appka
  (`zavolat_hotovo`, „dovolání: …“); po „Nedovolal/a jsem se“ zůstává a stránka to řekne. Ostatní klienti mimo frontu mají
  Hotovo s textem jako dřív (od migrace 063 text i do vlákna klienta, oddíl 063), klient ve frontě Zavolat teď.
- **Detail** (`src/components/KontaktDrawer.tsx`): menu stavů jen se stavy, které člověk smí nastavit (`stavyVMenu`: bez Nabídnuté
  slevy, tu nastavuje automatizace; Ozve se později a Archiv – neodpověděl jen klientovi s návrhem; stávající stav vždy), u
  Nekontaktovat, Nerelevantní a Odmítnuto bez Naplánovat hovor (`hovorPlanovatSmi`) a změna na ně řekne „Naplánované hovory
  klienta se tím zruší.“; pod poznámkou „Nové řádky, které do poznámky připíšeš, dostane po uložení automatizace jako vzkaz
  agentovi.“ (server pošle nové řádky jako „Poznámka (jméno): …“) a vzkazy se po uložení načtou znovu. Platí i pro Alberta.
- **Testy**: `npm test` `tests/filtry.test.mjs` blok O9 přepsaný na obě větve (O9, O9b až O9t: věty a stráže serveru, šestý
  výsledek, označení kolegy, naplánované hovory do konce dneška, call_log beze změny) a O15b až O15g, O16c a O16g;
  `tests/volani.test.mjs` W3 (šest výsledků), Q a N7b (hovor se neplánuje u Odmítnuto a Nerelevantní), X12 až X13 (stavy z menu),
  S5; `npm run test:e2e` bloky O062a až O062i (tlačítko u správných řádků v 1. řádku, na telefonu jen ikona, okno bez označení,
  Chce web, vypnutá odmítnutí s důvodem, detail, Kontakty Volajícího a super admina, kalendář s oknem Zavolal/a jsem i se starým
  oknem Hotovo, menu stavů) a upravené O60e, O61a, O61b, K6b, K7, R56c a R57f. Bez posunu do strany s novým tlačítkem měří O61a (Označené, Moji klienti, Kontakty, 1920 až 360 px).
  Mock a `src/api/supabase.ts` proti serveru 062 (kandidáti z úspěšného dovolání, vzkaz „Poznámka (jméno): …“, zrušené hovory po
  odmítnutí a změně stavu, hláška `BEZ_062_CHCE_WEB`) měří `tests/dovolani.test.mjs` (součást `npm test`).

## Označení, druhá etapa 063 (Albert 1. 11. 2026)

Server: `../db/migration_063_oznaceni_etapa2.sql` (pořadí vůči větvi automatizace rozhodne brána nasazení; appka bez 063 jede dál,
nové klíče jen nepřijdou a nic navíc se neukáže). Albert 1. 11. 2026: po lhůtě na zavolání pošle automatizace sama jednu připomínku e-mailem
a hvězdu dává i automatizace, když klient jasně ukáže velký zájem (bez ohledu na známku). Připomínky a hvězdy píše jen
automatizace (služba), appka je jen ukazuje. Připomínky po lhůtě tick zařadí až po zapnutí přepínače `PRIPOMINKY_OZNACENI`
v `config.env` (do té doby ostrá appka řádek „Připomínka odeslána“ neukáže nikomu; demo ho má u kontaktu 96):
- **Označené**: pod lhůtou „Připomínka odeslána <den>“, když řádek nese `ozn_pripominka_at` (server ho dá jen u označení,
  které přihlášený vidí: vlastníkovi, super adminům a Albertovi, kolegovi u společného klienta ne). Lhůta sama zůstává
  „Lhůta na zavolání do <den>“ (platí, ať je přepínač připomínek zapnutý, nebo ne).
- **Přehled klienta**: řádek faktů „připomínka po lhůtě: odeslána <den>“ z `fakta.pripominka_oznaceni` (poslední připomínka
  z označení, která přihlášený vidí, i po archivu).
- **Den archivu v přehledu** (Albert 4. 11. 2026: „the archiving is more so for like truly lost clients“; ⚠ NAHRAZUJE +30 dní):
  „bez odpovědi do archivu <den>“ jen u klienta, kterého tick opravdu může archivovat (nabídka v připomínce kampaně, stav Nabídnutá
  sleva, od návrhu nikdy nenapsal, bez hvězdy a známky A, adresa ani ateliér nejsou společné s jiným kontaktem), 60 dní od nejpozdějšího z naší poslední zprávy, nabídky, úspěšného hovoru,
  hotového hovoru z kalendáře a zprávy člověka ve vláknech kontaktu; jinak se den neukáže (`fakta.nabidka.archiv_dne` null).
- **Hotovo s textem v kalendáři** (audit F4; Albert 2. 11. 2026: „the automation actually reads it“): u klienta, kterému dovolání zapsat
  nejde (Nabídnutá sleva bez označení), jde text i do vlákna klienta jako zpráva člověka „Naplánovaný hovor hotový (jméno): text“, jen
  když ho přihlášený smí upravit (okno to pak říká); bez práva nebo bez textu jen uzavře hovor jako dřív. Text „dovolání: …“, kterým appka
  uzavírá hovor po zápisu dovolání, do vlákna nejde (vzkaz už poslal `zapis_hovor`).
- **Hvězda od automatizace** (`hvezda_kdo` = „automatizace“, `HVEZDA_AUTOMATIZACE` v `src/ui.tsx`): popisek hvězdy
  „dala ji automatizace <den> · <důvod>“, v detailu tlačítko „Hvězda od automatizace“, u kontaktu jen ke čtení
  „velký zájem (od automatizace)“, v přehledu kdo a proč. Není to jméno kolegy, maska ho nemění. Odebrat ji smí člověk jako
  každou jinou; automatizace ji pak znovu nedá, dokud klient znovu nenapíše (server).
- **Demo**: mock zrcadlí obě služební funkce (`hvezdaOdAutomatizace`, `pripominkaOznaceniOdeslana` a zařazení jobu
  připomínky tickem v `src/api/mock.ts`; háček `__volackaDemoTest` je dává testům), klíče, fakta, den archivu a text z Hotovo
  stejně jako server.
- **Testy**: `npm test` soubor `tests/filtry.test.mjs` blok P (čas připomínky jen u viditelného označení, fakta, hvězda od
  automatizace bez masky, pravidla služebních funkcí jako server, popisky, P7 den archivu, P8 text z Hotovo)
  a upravené O2, O3e, O3g, O8d; `npm run test:e2e` bloky
  E063 (Označené a přehled super admina, Petra nic nevidí, hvězda od automatizace v Moji klienti a v detailu). Server:
  `../db/tests/test_063_oznaceni_etapa2.sql`.

## Účty a přihlášení (produkce)

- Vlastní auth v Postgresu (žádný Supabase Auth): funkce `login` vrací token,
  session platí 7 dní a klouzavě se prodlužuje.
- Prvního admina je potřeba založit ručně v SQL (viz `../db/schema.sql`,
  tabulka `users` + `crypt(heslo, gen_salt('bf'))`). Další uživatele zakládá v appce
  na `#/uzivatele` super admin (od migrace 024 jen on).

## Role a kdo co vidí (migrace 023, Albert 2026-09-24)

⚠ Od migrace 042 (Albert 18. 10. 2026) NAHRAZUJE „tři role volající, admin, super admin“: role jsou
jen dvě, **Volající** (klíč `admin`, stará role `caller` je s ním sloučená) a **Super admin**; majitel
účtu je Albert (users.id 1).
Každý vidí **jen svoje** (statistiky, klienty, zprávy, označené); cizí lidi vidí super
admin a Albert — od migrace 027 (Albert 2026-09-25) **každý super admin všechny**;
upravovat a psát do vlákna ale dál jen u svých lidí (cizí vlákno je jen ke čtení, server
posílá `smi_psat`). Kontakty (celou databázi) vidí všichni, jméno kolegy u kontaktu jen
super admin a Albert („jiný volající"); ⚠ od migrace 045 (Albert 20. 10. 2026) Volající stav a průběh jen
u svých klientů (oddíl „Volající vidí stav jen u svých klientů“ níž, NAHRAZUJE „Kontakty se stavy vidí
všichni“). Zprávy automatizace a stránku
Automatizace vidí jen Albert. **Hlídá to server** (SQL funkce), appka jen neukazuje, co by
server odmítl. Podrobně: `../docs/ROLE-A-VIDITELNOST.md`.

**Čísla jiných lidí vidí jen super admin** (Albert 19. 10. 2026: Volající nesmí nijak vidět prodeje,
počty hovorů, žebříček ani jiné statistiky kolegů; 20. 10. 2026 „Hide all of it“; migrace 045, test
`../db/tests/test_045_statistiky_jen_super_admin.sql`, celé pravidlo `../docs/ROLE-A-VIDITELNOST.md`).
Server: `all_stats`, `rozvrh_prehled` a `top_prodejce` („#1 prodejce“) jen super admin, `my_stats` jen vlastní,
výběr jiného člověka (`p_user_id`, `p_caller`) jen super admin; Volajícímu jména kolegů v poznámce a poznámce
příznaku „jiný volající“ (hlavička „[datum Jméno]“ i text, ne jméno klienta s titulem nebo příjmením; velikost
písmen ani diakritika nerozhoduje, „Mikulas“ je Mikuláš), kdo z kolegů dal příznak taky, u cizího zámku jen `zamceno`
(bez `lock_by`), hledání podle jména kolegy nic nenajde a `total` z `list_kontakty` (součty celé databáze) je `null`,
stránkuje se podle `dalsi`, nejvýš 200 řádků na stránku (appka chce 50). Ve Zprávách (`get_thread`, `list_threads`)
jméno jiného Volajícího „jiný volající“ (kdo založil, předmět, odesílatel, text, náhled); jména super adminů, Alberta
a agentů zůstávají. **Řádky kolegů v poznámce a poznámce příznaku jsou Volajícímu jen ke čtení** (recenze 20. 10.
2026): server je uloží doslova, a když některý chybí, je změněný nebo přesunutý, uložení odmítne („Řádek kolegy
upravit ani smazat nejde, připište nový řádek.“); nový řádek s hlavičkou „[datum …]“ se jménem kolegy nebo
„jiný volající“ taky („Nový řádek nesmí mít v hlavičce …“). Detail chybu ukáže v rámečku chyby a pod polem
poznámky i poznámky příznaku Volajícímu napíše nápovědu, když v nich řádky kolegů jsou (`maRadkyKolegu`).
Appka: Kontakty Volajícímu bez počtů u stavů a košů a bez celkového počtu, Statistiky bez trychtýře „Klienti podle
stavu“ a dlaždice „jako #1 prodejce“, Prokchop se na #1 neptá a swagger brýle nenabízí, detail u cizího zámku jen
„Kontakt je zamčený“; `allStats` a `topSeller` volá jen super admin; demo mock dělá totéž (`poznamkaBezCizich`,
`bezDiakritiky`, `poznamkaZpet`, strop 200, `jmenaKolegu` ve vláknech); `npm test` blok S a e2e S. ⚠ NAHRAZUJE
„text poznámek se jmény kolegů zůstává (Albert 25. 9. 2026), stejně jako `lock_by`“, „`top_prodejce` jen
`{je_prvni}` pro každého“ a „uložení maskované poznámky vrátí jména do nezměněných i upravených řádků“ (recenze
20. 10. 2026: upravený nebo přesunutý řádek kolegy jméno ztratil nebo ho dostal jiný řádek).

**Volající vidí stav jen u svých klientů** (Albert 20. 10. 2026: „they should only be able to see the status or how
the website is going for the people they actually called, but not for other people … They should still be able to see
all the contacts“; migrace 045, test 045 případ 45s, pravidlo `../docs/ROLE-A-VIDITELNOST.md`). ⚠ NAHRAZUJE „Kontakty
(celou databázi) se stavy vidí všichni“ (migrace 023) a „Co zůstává: součty celé databáze podle stavu po stránkách“.
Svoji klienti = kontakty, kde je Volající `last_caller`, nebo kterým kdy volal (`je_muj`). U cizího kontaktu server
pošle `skryto: true` a jen allowlist (`app_kontakt_klice_cizi`, v mocku `KLICE_CIZI`): id, segment, jméno, studio,
telefon, e-mail, web, „má web“, obor, město, IČO a DPH jako dřív. Stav, známka, ceny, poznámky, příznak, kdo volal,
zámek kolegy, nový web, čekání ani data změn v řádku nejsou. Filtr stavu, známky a čekání a hledání v poznámce berou
jen jeho klienty, cizí kontakty server řadí za jeho jen podle id; příznak a zámek cizího kontaktu Volající nemění
(chyba „Tohle není váš klient: …“), vlákno o cizím klientovi nevidí. Appka (`jenZaklad`, `Skryto`, `SKRYTO_NAPOVEDA`
v `ui.tsx`): Kontakty ukážou u cizího kontaktu pomlčku místo stavu, známky, „volal/a“, čekání a data změny a nad
tabulkou nápovědu; detail cizího kontaktu jen jméno, telefon, e-mail, web a údaje architekta (bez stavu, poznámek,
příznaku, zámku a vzkazů; ⚠ od migrace 048 e-mail jen u architekta a na kartě, kterou Volající volá, u cizí chaty ne,
oddíl „Po auditu soukromí 20. 10. 2026“ níž); karta ve volání u kontaktu, kterému Volající ještě nevolal, bez řádku status a poznámek
(po hovoru je jeho a vidí ho celý). Super admin a Albert vidí všechno jako dřív. Hlídá `npm test` blok U, e2e U
a kontrola 193 v repu webdomov.

**Po dvou recenzích 045 (20. 10. 2026)** (databáze a appka, ROLLBACK proti živé DB; migrace 046, test 046
případ 45t). Server a demo mock stejně: **záznam kolegy v poznámce je Volajícímu celý jen ke čtení**, i řádky bez jména
pod hlavičkou „[datum kolega]“ až do další hlavičky; nic se do něj nevloží a nic se z něj nevyjme (⚠ od recenze 046
obyčejný řádek pod ním dostane při uložení vlastní hlavičku „[dnešní den v Praze vlastní jméno] “ sám a detail ji po
uložení hned ukáže; NAHRAZUJE odmítnutí „Řádek hned za záznamem kolegy začněte hlavičkou se svým jménem …“).
Poznámka příznaku, který dal kolega, je celá jeho. **Hlavička s datem jen s vlastním jménem**: nový nebo upravený řádek
(i poznámka z hovoru) smí mít „[datum …]“ jen se jménem přihlášeného; porovnává se klíčem `app_jmeno_klic` (v mocku
`jmenoKlic`: bez neviditelných znaků, mezery Unicode jako mezera, cyrilice, řečtina a široké znaky jako latinka, bez
diakritiky, malými písmeny), takže znak nulové šířky, NBSP, tabulátor, chybějící mezera, „[ 2026“, „jiný  volající“,
Albert ani hlavička bez jména kontrolu neobejdou (`app_hlavicka_cizi`, v mocku `hlavickaCizi`).
**Poznámka z hovoru je jeden řádek** (konce řádků jako mezera, nejvýš 2 000 znaků). **Volající se nepřejmenuje** (jméno
mění super admin nebo Albert; heslo si změní dál) a **jména jsou jedinečná i bez diakritiky** („Mikulas“ vedle „Mikuláš“
neprojde, jméno s neviditelným znakem taky ne). **Chyby `resolve_call` a `vratit_do_fronty` mimo frontu neříkají stav.**
`set_flag` a `update_kontakt` **přepíšou autora a čas příznaku jen se změnou druhu**; `clear_flag` zapíše zrušený
příznak do události (mock události nevede). **Strop délky**: poznámka a poznámka příznaku nad 5 000 znaků nebo nad
100 řádků, která je delší než uložená, se odmítne (delší poznámku jde jen zkrátit). Appka: nápověda u poznámky
(`RADKY_KOLEGU_NAPOVEDA`) a u příznaku kolegy (`PRIZNAK_KOLEGY_NAPOVEDA`), Zprávy říkají „vlákna o svých klientech
a vlákna bez klienta“, prázdné Kontakty s filtrem stavu Volajícímu vysvětlí, že filtr bere jen jeho klienty. Hlídá
`npm test` blok W a e2e U3b. ⚠ NAHRAZUJE „řádek kolegy = řádek, který maska mění“, „hlavička nesmí nést jméno kolegy ani
jiný volající“, víceřádkovou poznámku z hovoru (029), „Admin mění jen sebe“ pro jméno (023), jedinečnost jména jen podle
velikosti písmen (042), stav v textu chyby (015, 028) a přepis autora příznaku při každém uložení.

**Po recenzi 046 (20. 10. 2026)** (ROLLBACK proti živé DB a přehrání 1 722 běžných úprav Volajících; opravy přímo
v migraci 046, která ostře neběžela). Server a mock stejně: **prázdný řádek nepatří nikomu** (nikdy jen ke čtení, nikdy
se neodmítne) a **obyčejný řádek pod zápisem kolegy dostane vlastní hlavičku** s dnešním dnem v Praze (Edovy kontakty
1582 a 1962 s jediným řádkem Mikuláše by jinak nešly doplnit); detail po uložení ukáže poznámku tak, jak ji server
uložil (`setNote(updated.note)`). **Hlavička s datem jen na začátku řádku** (i za Unicode koncem řádku; „zavolat
[2026-10-25 odpoledne]“ projde i v zápisu hovoru, kde se hlavička hledá před spojením řádků). **Řádek se systémovou
hlavičkou** („[datum tabulka]“, „[datum Agent — rešerše]“) Volající upraví a hlavička, která v poznámce je, smí být
i v novém řádku; jméno kolegy, „jiný volající“ ani prázdné nikdy. **Strop délky proti poznámce, jak ji ukládající
vidí** (maskované, maska přidá 6 až 10 znaků na jméno kolegy; až po kontrole vlastníka), takže zkrátit jde vždy.
**Jméno bez čárky a hranaté závorky** (i podobné). Server navíc nechá změněný nebo zrušený příznak z `update_kontakt`
v události (mock události nevede). Nápověda `RADKY_KOLEGU_NAPOVEDA` to říká. Hlídá `npm test` blok W (W0f, W2d, W9d,
W9e, W12g až W12j, W13, W13b, W14 až W16d) a e2e S6b.

**Po druhé recenzi 046 (20. 10. 2026)** (ROLLBACK proti živé DB; opravy přímo v migraci 046, která ostře neběžela).
Server a mock stejně: **hlavička s datem i za znaky, které nejsou písmeno ani číslice** (odrážka „- “, neviditelné znaky,
které klíč nezná: U+E0100, U+E0020, U+2800, U+1D173, U+FFF9), takže podvržená hlavička kolegy za nimi neprojde a uložený
zápis kolegy za nimi je začátek jeho záznamu (`HLAVICKA_RADKU` a `HLAVICKA_NA_ZACATKU` s `[^\p{L}\p{Nd}[]*` jako
`[^[:alnum:][]*` na serveru); **v hlavičce nového řádku ani za čárkou jméno kolegy nebo „jiný volající“**
(„[datum Petra, Honza] Honza souhlasí“, „[datum tabulka, Honza] x“; `hlavickaSKolegou`, maska jmen v klíči);
**poznámka příznaku kolegy je celá jeden jeho záznam**: nic se do ní nevloží (ani před ni), řádek připsaný na konec
dostane vlastní hlavičku a autor zůstane kolega. Nápovědy `RADKY_KOLEGU_NAPOVEDA` a `PRIZNAK_KOLEGY_NAPOVEDA` to říkají.
Hlídá `npm test` blok W (W0g, W2e, W2f, W3m až W3v, W14h až W14j, W15g, W17 až W17f, W13c, W13d).

**Po auditu soukromí 20. 10. 2026 (migrace 048)** (Albert 20. 10. 2026: „double check if there's truly no way for the callers
to see ... how many cottages we've sold as a whole company or the stats of any other caller aside from them“; pravidlo
`../docs/ROLE-A-VIDITELNOST.md`, oddíl stejného jména). Server a mock stejně: **e-mail cizí chaty Volající nedostane ani
nevyhledá** (chata ho má skoro jen po zájmu v hovoru, takže prozradil, které cizí chaty řekly ano a kolik jich je), jen na
kartě, kterou právě volá; e-mail cizího architekta (veřejný import) a vlastního klienta zůstává; detail cizího kontaktu
kreslí řádek e-mailu, jen když ho server poslal, a nápověda hledání Volajícímu říká „e-mail architekta; e-mail chaty
a poznámku jen u mých“. **Číslo faktury** (iDoklad čísluje jednou roční řadou pro celou firmu, 20RRNNNN) je Volajícímu
ve vláknech „(číslo skryto)“ v předmětu, textu i náhledu (`bezCislaFaktury`, na serveru `app_bez_cisla_faktury`).
**`update_user`** dá Volajícímu pro každé cizí id stejnou chybu (nepozná, která id lidí existují). **Prokchop** (milníky,
utracené PROKCHOPy, dny „#1 prodejce“ v `localStorage`) ostatních lidí se smaže při přihlášení, při odhlášení (zůstane jen
ten, kdo se odhlásil) a při startu appky (`uklidCiziPokrok` v `src/pig/progress.ts`, volá ho `auth.tsx`). Hlídá `npm test`
blok X, e2e X a kontroly 193 a 201 v repu webdomov. Stará appka s 048 funguje (u cizí chaty ukáže e-mail jako nevyplněný).

Od migrace 024/025 (Albert 2026-09-24 večer): kontakt **upravuje** jen ten, komu patří,
jeho super admin a Albert (server posílá u každého řádku `smi_upravit`; příznak a zámek
smí každý admin, ⚠ od migrace 045 Volající jen u svých klientů, super admin u každého), vzkaz agentovi ke klientovi taky; kdo kontaktu volal, si ho může
**označit jako svého klienta** (stav i fronta volání zůstávají); **uživatele** zakládá
jen super admin (stránka Uživatelé jen pro něj); „zapsat do pravidel" je jen **návrh**,
který schvaluje Albert (u zprávy je vidět jeho stav).

## Segmenty: chaty a architekti (migrace 028, docs/ARCHITEKTI.md oddíl 9)

- Segment kontaktu je sloupec `segment` z RPC; jediné místo, které to ví, je
  `src/segment.ts` (`segmentOf`). `obor` je jen popisek, appka podle něj nic nerozhoduje
  a segment nikdy nemění.
- **Volání:** přepínač „Chaty / Architekti" mají všichni volající. Volba se pamatuje na
  zařízení (`localStorage.volacka_segment`); cokoli jiného než `chata` nebo `architekt`
  = chaty. `next_contact` dostává segment vždy (`p_segment`).
- Přepnutí bez karty vezme hned kontakt z nového segmentu. Čistou kartu (formulář zájmu
  zavřený, poznámka prázdná, na číslo se neklikalo) vrátí do fronty (`vratit_do_fronty`:
  jen vlastní zámek, jen volatelný stav, jen do 30 minut, nejvýš 10 karet za hodinu) a vezme
  další. Rozdělaná karta zůstane a žlutá cedulka řekne, koho dostaneš po tomhle hovoru;
  „Přepnout hned“ se ptá, protože poznámka se neuloží. Po kliknutí na číslo (audit APP-3)
  nabídne rovnou „Zapsat Nedovoláno“ (hovor se uloží, kolega tomu člověku hned znovu
  nezavolá) a vrácení bez zápisu je jen vědomá volba „Přepnout bez zápisu“. Odpověď, která
  dorazí až po přepnutí, se zahodí a její zámek se vrátí.
- `next_contact` od migrace 036 vrací nejdřív vlastní platnou kartu v segmentu (zámek mladší
  2 h, zámek se neposouvá): reload nebo návrat na Volání ukáže tutéž kartu a nezamkne další.
- ⚠ Od migrace 054 (Albert 25. 10. 2026) jdou architekti v náhodných průchodech (dnes nevolaní, pak záloha po 4 h) po
  vrstvách, v každé náhodně: napřed bez vlastního webu s méně než dvěma nedovoláními, pak s webem, nakonec bez webu po
  dvou a víc nedovoláních (Albert večer: „if they don't pick up for the second time, then they should allow people with
  websites to go in front of them“). Další vrstva přijde, až když v té předchozí nikdo volatelný nezbyl. Web =
  `app_kontakt_ma_web` (adresa s tečkou ve `web` nebo „má web“); nedovolání = hovory s výsledkem nedovoláno za celou dobu,
  přeplánování se nepočítá. Vlastní karta a naplánovaný hovor jsou dál první, chaty jdou náhodně jako dřív (NAHRAZUJE
  u architektů „náhodně“). Demo mock totéž (`maVlastniWeb`, `vrstvaFronty` v `src/api/mock.ts`), `npm test` blok F
  (volani.test.mjs), kontrola 214 repozitáře automatizace.
- Karta architekta: jméno (jinak studio), studio, telefon, e-mail, město, web a „obrat“
  (⚠ odkud máme číslo už ne: migrace 043, Albert 19. 10. 2026). IČO architekta volající nevidí (Albert 3. 10. 2026, migrace 037; ⚠ od 042
  role `caller` není a Volající = `admin` IČO vidí, viz níž):
  server mu ho v kartě ani v „Označit jako mého klienta“ nepošle a řádek „obrat“ říká
  z veřejné registrace k DPH (povinná nad 2 mil. Kč obratu za rok) jen „nad 2 mil. Kč ročně
  (plátce DPH)“, když je plátce on nebo ateliér, „do 2 mil. Kč ročně (neplátce DPH)“, když je
  známý neplátce nebo identifikovaná osoba, jinak „nezjištěno“ (`obratArchitekta`
  v `src/ui.tsx`). ⚠ NAHRAZUJE řádky „IČO osobně“, „IČO studia“ a poznámku o DPH studia.
  Zdroj telefonu („odkud máme číslo“) appka neukazuje nikde, na kartě ani v detailu, a server ho
  neposílá (migrace 043, Albert 19. 10. 2026; `npm test` blok M hlídá, že se do `src/` nevrátí).
  ⚠ Box „Tip pro hovor“ pod tlačítky výsledku (scénář z oddílu 9.4, dřív `src/tipArchitekt.ts`) je
  pryč (Albert 19. 10. 2026: blok dole ve volání úplně odstranit; u chat žádný nebyl), pod poznámkou
  už nic není; hlídá `npm test` blok T a kontrola 104. NAHRAZUJE „Tip pro hovor stojí až pod tlačítky
  výsledku a poznámkou a dá se sbalit“. Eyebrow nad kartou
  říká segment karty, bez karty zvolený segment.
- **Seznamy** (Kontakty, Moji klienti, Označené, trychtýř ve Statistikách) mají filtr
  „vše / chaty / architekti", výchozí vše, nepamatuje se. Kontakty a Moji klienti filtrují
  na serveru (`p_segment` jen když není vše, i v počtech stavů a košů), Označené v appce.
  Zprávy filtr nemají, jen odznak architekta u hledaného kontaktu.
- Osobní IČO posílá server v seznamech a v úpravách (příznak, zámek, uložení) jen tomu, kdo
  kontakt smí upravit; IČO ateliéru, které se mu rovná, i s DPH ateliéru taky (migrace 032
  a 036). Detail pak ukáže „skryto“ ([ALBERT 28]). Bez masky seznamu posílají řádek jen karta
  ve volání a „Označit jako mého klienta“ (`oznacit_za_sveho`), adminům i s IČO, volajícím od
  migrace 037 bez IČO architekta; detail proto každý řádek z úpravy pošle dál přes
  `bezCizihoIco` (`src/segment.ts`) a „skryto“ zůstane.
- Volající IČO architekta nevidí ani nehledá nikde (Albert 3. 10. 2026, migrace 037 a 038):
  server mu v Kontaktech ani v Mých klientech nepošle osobní IČO ani IČO ateliéru a hledání
  podle IČO mu nic nenajde, ani v počtu. Appka mu v detailu kontaktu místo řádků s IČO ukáže
  „obrat“ podle DPH jako na kartě a pole hledání IČO nenabízí (`icoVidi` v `src/segment.ts`).
  Admin a super admin beze změny. ⚠ NAHRAZUJE „IČO ateliéru v seznamu zůstává a hledá ho
  každý“ pro volající.
  ⚠ Od migrace 042 (18. 10. 2026) role `caller` není: Volající je role `admin` a IČO vidí
  i hledá jako admin (`icoVidi` = `isAdminRole`), takže maska z 037 a 038 výš na nikoho nedopadá.
- Seznamy (Kontakty, Moji klienti, Označené) zahodí odpověď staršího požadavku: po
  rychlém přepnutí filtru nezůstanou pod „chaty" architekti z pozdní odpovědi.
- Server bez migrace 028 odpoví na `next_contact` s `p_segment` chybou `PGRST202`. Appka
  pak chaty zkusí znovu jen s `p_token` (starý server má jen chaty, volání nestojí);
  architekty nikdy, volající dostane hlášku, že server architekty ještě neumí.
- ⚠ Push appky na `main` až po živé a otestované migraci 028: nová appka volá
  `next_contact(p_token, p_segment)` a `vratit_do_fronty`, které starý server nemá.

## Stránky

| route         | kdo     | co                                                              |
| ------------- | ------- | --------------------------------------------------------------- |
| `#/login`     | všichni | přihlášení                                                       |
| `#/`          | všichni | domů — dlaždice podle role                                       |
| `#/call`      | všichni | fronta hovorů: přepínač chaty / architekti (028), karta kontaktu + výsledky (nedovoláno/odmítnuto/zájem, od 050 i nerelevantní a přeplánovat; `?zavolat=<id>` = karta z kalendáře); kontakt, kterému Volající ještě nevolal, bez stavu, poznámek a příznaku (045, 20. 10. 2026). Poznámka k hovoru je **nepovinná** — zájem jde uložit i bez ní (Albert 2026-09-23; dřív se při prázdné poznámce otevíralo potvrzovací okno navíc); od migrace 051 (Albert 22. 10. 2026) i bez ceny webu a hostingu, povinná je jen známka (⚠ NAHRAZUJE povinné ceny z 1. 9. 2026); od migrace 060 (Albert 1. 11. 2026) u zájmu „Velký zájem (hvězda)“ a u svého klienta přehled klienta (`kontakt_prehled`) |
| `#/kalendar`  | všichni | kalendář hovorů (050): svůj každý, super admin kohokoli nebo všech; Po termínu, Dnes, Nadcházející, Hotové a zrušené; Zavolat teď, Hotovo, Přesunout, Zrušit; ⚠ od migrace 062 (Albert 2. 11. 2026) Hotovo u klienta mimo frontu, kterému jde zapsat dovolání, otevře okno „Zavolal/a jsem“ (NAHRAZUJE „Hotovo jen s textem“ u takového klienta); ⚠ od 3. 11. 2026 (ověření 062) si napřed přečte označení z přehledu klienta (`kontakt_prehled`), takže označený klient dostane okno s označením a kampaňová chata s označením okno „Zavolal/a jsem“, ne „Hovor je hotový?“ |
| `#/stats`     | všichni | moje statistiky; super admin (i Albert) přes dropdown kohokoli (027) a trychtýř „Klienti podle stavu" (součty celé databáze) s filtrem segmentu (028); ⚠ trychtýř od 19. 10. 2026 a dlaždice „jako #1 prodejce“ od 20. 10. 2026 jen super admin (migrace 045, NAHRAZUJE „(admin)“): Volající vidí jen svoje čísla; od migrace 056 (Albert 27. 10. 2026) super admin i statistiky za jeden den (Celkem / Jeden den, den v Praze) |
| `#/moji`      | všichni | moji klienti (+ historie poznámek v detailu); super admin může vybrat kohokoli (027); filtr segmentu (028); od migrace 056 (Albert 27. 10. 2026) super admin stejné filtry jako Kontakty a řazení podle poslední změny, Volající beze změny; od migrace 057 sloupec posledního hovoru (Volajícímu „Můj poslední hovor“) a super admin řadí i podle něj; ⚠ od migrace 060 (Albert 1. 11. 2026) filtry, hledání na serveru a řazení i Volající nad svými klienty (NAHRAZUJE „Volající beze změny“), sloupec Mlčí, hvězda, „Zavolal/a jsem“ v přehledu detailu; ⚠ od migrace 061 (Albert 2. 11. 2026) řádky o dvou řádcích bez posunu do strany (NAHRAZUJE tabulku posouvanou v rámečku); ⚠ od migrace 062 (Albert 2. 11. 2026) „Zavolal/a jsem“ v 1. řádku i u klienta bez označení (NAHRAZUJE „jen v přehledu detailu u označení“), v detailu i bez označení, menu stavů jen se stavy, které člověk smí nastavit |
| `#/rozvrh`    | všichni | Rozvrh (042): týden po až ne, hodiny na den a cíl (hovorů za hodinu posílá server), plnění z hovorů, hláška pozadu / v plánu / napřed, poznámky ke dnům; Volající si ho nastaví jednou, super admin vidí přehled všech, mění a odemyká |
| `#/admin`     | všichni | Kontakty: celá databáze s filtry (i segment, 028) a fulltextem (i studio, město, IČO; IČO jen admin a super admin, 038); upravovat smí admin a super admin; počty u stavů a košů a celkový počet jen super admin (045, Volající stránkuje bez počtu); Volající stav, známku, kdo volal, čekání a poznámky jen u svých klientů, filtr stavu a hledání v poznámce jen nad nimi (045, 20. 10. 2026); od migrace 056 řazení podle poslední změny (Volajícímu jen mezi jeho klienty, cizí za nimi podle čísla); od migrace 057 Změněno i se změnami od automatizace, sloupec a řazení podle posledního hovoru (Volajícímu jen jeho hovory); od migrace 060 (Albert 1. 11. 2026) spojitelné filtry (víc stavů a známek, hvězda, označení, mlčení v pracovních dnech), sloupec Mlčí a hvězda u svých klientů (Volajícímu jen nad jeho klienty); ⚠ od migrace 061 (Albert 2. 11. 2026) řádky o dvou řádcích bez posunu do strany (NAHRAZUJE tabulku posouvanou v rámečku) a Volající nevidí příznak „Údaje z internetu“; ⚠ od migrace 062 (Albert 2. 11. 2026: „you can even add [it] to the contacts section“) „Zavolal/a jsem“ v 1. řádku u vlastních klientů, kterým ho přihlášený smí zapsat |
| `#/oznacene`  | admin   | označení klienti — admin svoji; super admin a Albert všichni (027); filtr segmentu (028); ⚠ od migrace 060 (Albert 1. 11. 2026) „Označené k zavolání“ (`list_oznacene`): klienti, kteří víc než 5 pracovních dní mlčí (Neodpověděl na návrh, na změny), Volajícímu jen jeho, a klienti s příznakem; okno „Zavolal/a jsem“ (`zapis_hovor`, nikdy call_log), „Lhůta na zavolání do …“, stejné filtry jako Kontakty, super admin sloupec Volající, „bez volajícího“ a „Zrušit označení“ (NAHRAZUJE „jen příznaky přes list_flagged“); ⚠ od migrace 061 (Albert 2. 11. 2026) řádky o dvou řádcích bez posunu do strany s akcemi přímo v řádku („Zavolal/a jsem“, „Vyřešeno“ u příznaku, super admin „Zrušit označení“), okno s pěti výsledky (i „Nic z toho výše“) a poznámkou pro automatizaci u každého, příznak „Údaje z internetu“ jen super admin; od auditu soudržnosti (2. 11. 2026) u označeného klienta s příznakem „Chybí e-mail“ hned za skupinou „e-mail se vrátil“; ⚠ od migrace 062 (Albert 2. 11. 2026) okno se šesti výsledky (i „Chce web“, NAHRAZUJE „s pěti výsledky“) a „Zavolal/a jsem“ i u řádku jen s příznakem, když ho přihlášený smí zapsat; od migrace 063 pod lhůtou „Připomínka odeslána <den>“, když po lhůtě odešla připomínka e-mailem |
| `#/zpravy`    | admin   | vlákna s AI agenty — admin svoje; super admin vlákna všech lidí (cizí jen ke čtení, 027); Albert i automatizaci; odznak architekta u hledaného kontaktu (028) |
| `#/uzivatele` | super admin | super admin: všichni lidé, upravuje sebe a své lidi + nový Volající (027, 042); Albert: role (Volající / Super admin, 042) a nadřízení (⚠ od migrace 024 Volající stránku nemá) |
| `#/automatizace` | Albert | vypínač automatizace a přepínač účtu Claude                    |
| `#/setup`     | všichni | nastavení Supabase URL + anon klíče                              |

## Nasazení na GitHub Pages

Workflow `.github/workflows/deploy.yml` při pushi na `main`:

1. `npm ci && npm run build` (Vite s `base: './'` → relativní cesty),
2. nahraje `dist/` přes `actions/upload-pages-artifact`,
3. nasadí přes `actions/deploy-pages`.

V nastavení repozitáře zapni **Settings → Pages → Source: GitHub Actions**.

### Otevřená appka se aktualizuje sama (Albert 21. 10. 2026)

Appka otevřená v prohlížeči (záložka, okno nainstalované appky, obnovená relace) dřív běžela ve staré verzi,
dokud ji člověk sám nenačetl znovu: 21. 10. ráno tak na jednom počítači pořád ukazovala dole ve volání box
s radami k hovoru, který je z nasazené verze pryč od 19. 10. Od 21. 10. si běžící appka (`src/aktualizace.ts`, spouští ji
`src/main.tsx`) každých 5 minut, při návratu na záložku a při zaměření okna stáhne `index.html` bez cache
a porovná jméno balíčku `assets/index-*.js` s tím, ze kterého běží. Když se liší, stránku znovu načte, ale
nikdy uprostřed psaní: dokud je kurzor v políčku, je vyplněné textové políčko nebo otevřené potvrzovací okno,
ukáže jen lištu „Je tu nová verze appky“ s tlačítkem „Načíst teď“ a zkusí to znovu za 15 s. Přihlášení, stránka
i nastavení zůstanou. Jen v produkčním sestavení. Test `npm test` (`tests/aktualizace.test.mjs`).
Pravidla viditelnosti tím nevznikají ani neslábnou: vynucuje je server, stará kopie appky od něj cizí čísla
nedostane; aktualizace jen zajistí, že zmizí i to, co bylo jen v kódu stránky.
