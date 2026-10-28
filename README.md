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
npm test         # test chování segmentu, e-mailového příznaku, volání, rozvrhu a od 056 filtrů nad demo mockem (bez sítě, bez živé DB)
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

## Volání 050: nerelevantní, přeplánovat, kalendář hovorů, výdělek (Albert 21. 10. 2026)

Server: `../db/migration_050_volani_kalendar_vydelek.sql` (spouští se PŘED appkou). Albert 21. 10. 2026: v Moji klienti
známka a cena, ve volání „Nerelevantní“ (třeba starší lidé, do statistik ne jako odmítnutí) a „Přeplánovat“ („Hey, I'm at
work, call me at this time“), nová záložka s kalendářem lidí k zavolání (super admini i kalendáře ostatních), připomínka
v den hovoru a ve statistikách kolik volající vydělal celkem a tento týden (30 % z ceny webu, ne z hostingu).

- **Moji klienti**: sloupce Známka (A, B, C) a Cena: čistá částka jako „7 000 Kč“, jiný text tak, jak ho kdo zapsal
  (dlouhý zkrácený, celý v nápovědě), pod ní menší „hosting …“; „x“, „-“ a podobné = nezadáno (`cenaText` v `src/ui.tsx`).
  ⚠ 22. 10. 2026 (Albert, migrace 051) NAHRAZUJE pomlčku u nezadané ceny: nedohodnutá cena je „n/a“ (viz oddíl Cena 051).
  Na telefonu se do strany posouvá jen tabulka v rámečku.
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
| `#/call`      | všichni | fronta hovorů: přepínač chaty / architekti (028), karta kontaktu + výsledky (nedovoláno/odmítnuto/zájem, od 050 i nerelevantní a přeplánovat; `?zavolat=<id>` = karta z kalendáře); kontakt, kterému Volající ještě nevolal, bez stavu, poznámek a příznaku (045, 20. 10. 2026). Poznámka k hovoru je **nepovinná** — zájem jde uložit i bez ní (Albert 2026-09-23; dřív se při prázdné poznámce otevíralo potvrzovací okno navíc); od migrace 051 (Albert 22. 10. 2026) i bez ceny webu a hostingu, povinná je jen známka (⚠ NAHRAZUJE povinné ceny z 1. 9. 2026) |
| `#/kalendar`  | všichni | kalendář hovorů (050): svůj každý, super admin kohokoli nebo všech; Po termínu, Dnes, Nadcházející, Hotové a zrušené; Zavolat teď, Hotovo, Přesunout, Zrušit |
| `#/stats`     | všichni | moje statistiky; super admin (i Albert) přes dropdown kohokoli (027) a trychtýř „Klienti podle stavu" (součty celé databáze) s filtrem segmentu (028); ⚠ trychtýř od 19. 10. 2026 a dlaždice „jako #1 prodejce“ od 20. 10. 2026 jen super admin (migrace 045, NAHRAZUJE „(admin)“): Volající vidí jen svoje čísla; od migrace 056 (Albert 27. 10. 2026) super admin i statistiky za jeden den (Celkem / Jeden den, den v Praze) |
| `#/moji`      | všichni | moji klienti (+ historie poznámek v detailu); super admin může vybrat kohokoli (027); filtr segmentu (028); od migrace 056 (Albert 27. 10. 2026) super admin stejné filtry jako Kontakty a řazení podle poslední změny, Volající beze změny; od migrace 057 sloupec posledního hovoru (Volajícímu „Můj poslední hovor“) a super admin řadí i podle něj |
| `#/rozvrh`    | všichni | Rozvrh (042): týden po až ne, hodiny na den a cíl (hovorů za hodinu posílá server), plnění z hovorů, hláška pozadu / v plánu / napřed, poznámky ke dnům; Volající si ho nastaví jednou, super admin vidí přehled všech, mění a odemyká |
| `#/admin`     | všichni | Kontakty: celá databáze s filtry (i segment, 028) a fulltextem (i studio, město, IČO; IČO jen admin a super admin, 038); upravovat smí admin a super admin; počty u stavů a košů a celkový počet jen super admin (045, Volající stránkuje bez počtu); Volající stav, známku, kdo volal, čekání a poznámky jen u svých klientů, filtr stavu a hledání v poznámce jen nad nimi (045, 20. 10. 2026); od migrace 056 řazení podle poslední změny (Volajícímu jen mezi jeho klienty, cizí za nimi podle čísla); od migrace 057 Změněno i se změnami od automatizace, sloupec a řazení podle posledního hovoru (Volajícímu jen jeho hovory) |
| `#/oznacene`  | admin   | označení klienti — admin svoji; super admin a Albert všichni (027); filtr segmentu (028) |
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
