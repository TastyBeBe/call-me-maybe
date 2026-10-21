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
npm test         # test chování segmentu a e-mailového příznaku nad demo mockem (bez sítě, bez živé DB)
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
a 90 až 92, falešní architekti id 300 až 303 (jen adresy `example.cz`, telefony s předvolbou 999, IČO `11111111` a `22222222` s neplatným
kontrolním součtem): 300 a 301 jsou ve frontě, 302 je nedovolaný s příznakem a bez
e-mailu (volala Petra), 303 má odeslaný návrh a čeká na odpověď (volal Honza).

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
| `#/call`      | všichni | fronta hovorů: přepínač chaty / architekti (028), karta kontaktu + výsledky (nedovoláno/odmítnuto/zájem); kontakt, kterému Volající ještě nevolal, bez stavu, poznámek a příznaku (045, 20. 10. 2026). Poznámka k hovoru je **nepovinná** — zájem jde uložit i bez ní (Albert 2026-09-23; dřív se při prázdné poznámce otevíralo potvrzovací okno navíc) |
| `#/stats`     | všichni | moje statistiky; super admin (i Albert) přes dropdown kohokoli (027) a trychtýř „Klienti podle stavu" (součty celé databáze) s filtrem segmentu (028); ⚠ trychtýř od 19. 10. 2026 a dlaždice „jako #1 prodejce“ od 20. 10. 2026 jen super admin (migrace 045, NAHRAZUJE „(admin)“): Volající vidí jen svoje čísla |
| `#/moji`      | všichni | moji klienti (+ historie poznámek v detailu); super admin může vybrat kohokoli (027); filtr segmentu (028) |
| `#/rozvrh`    | všichni | Rozvrh (042): týden po až ne, hodiny na den a cíl (hovorů za hodinu posílá server), plnění z hovorů, hláška pozadu / v plánu / napřed, poznámky ke dnům; Volající si ho nastaví jednou, super admin vidí přehled všech, mění a odemyká |
| `#/admin`     | všichni | Kontakty: celá databáze s filtry (i segment, 028) a fulltextem (i studio, město, IČO; IČO jen admin a super admin, 038); upravovat smí admin a super admin; počty u stavů a košů a celkový počet jen super admin (045, Volající stránkuje bez počtu); Volající stav, známku, kdo volal, čekání a poznámky jen u svých klientů, filtr stavu a hledání v poznámce jen nad nimi (045, 20. 10. 2026) |
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
