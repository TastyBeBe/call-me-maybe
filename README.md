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
| admin (Eva, pod Albertem)    | `eva`     | `eva`     |
| volající (Petra, pod Albertem) | `petra`   | `volam`   |
| volající (Honza, pod Mikulášem) | `honza`   | `volam`   |

Demo mock (`src/api/mock.ts`) má stejná pravidla viditelnosti jako server (migrace 023
až 036): i hledání osobního IČO jen celým číslem a jen u kontaktů, které smí upravit, IČO
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

Tři role: **volající**, **admin**, **super admin**; majitel účtu je Albert (users.id 1).
Každý vidí **jen svoje** (statistiky, klienty, zprávy, označené); cizí lidi vidí super
admin a Albert — od migrace 027 (Albert 2026-09-25) **každý super admin všechny**;
upravovat a psát do vlákna ale dál jen u svých lidí (cizí vlákno je jen ke čtení, server
posílá `smi_psat`). Kontakty (celou databázi) vidí všichni, jméno kolegy u kontaktu jen
super admin a Albert („jiný volající"). Zprávy automatizace a stránku
Automatizace vidí jen Albert. **Hlídá to server** (SQL funkce), appka jen neukazuje, co by
server odmítl. Podrobně: `../docs/ROLE-A-VIDITELNOST.md`.

Od migrace 024/025 (Albert 2026-09-24 večer): kontakt **upravuje** jen ten, komu patří,
jeho super admin a Albert (server posílá u každého řádku `smi_upravit`; příznak a zámek
smí každý admin), vzkaz agentovi ke klientovi taky; kdo kontaktu volal, si ho může
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
- Karta architekta: jméno (jinak studio), studio, telefon, e-mail, město, web, „obrat“
  a odkud máme číslo. IČO architekta volající nevidí (Albert 3. 10. 2026, migrace 037):
  server mu ho v kartě ani v „Označit jako mého klienta“ nepošle a řádek „obrat“ říká
  z veřejné registrace k DPH (povinná nad 2 mil. Kč obratu za rok) jen „nad 2 mil. Kč ročně
  (plátce DPH)“, když je plátce on nebo ateliér, „do 2 mil. Kč ročně (neplátce DPH)“, když je
  známý neplátce nebo identifikovaná osoba, jinak „nezjištěno“ (`obratArchitekta`
  v `src/ui.tsx`). ⚠ NAHRAZUJE řádky „IČO osobně“, „IČO studia“ a poznámku o DPH studia.
  Tip pro hovor (scénář z oddílu 9.4
  v `src/tipArchitekt.ts`: věta „Vaše číslo mám z …“ říká, odkud číslo máme, oslovením
  ve 2. osobě, `zdrojTelefonuVeta` v `src/ui.tsx`, audit APP-7; okna volání jako rada)
  stojí až pod tlačítky výsledku a poznámkou, aby tlačítka zůstala na počítači vidět bez posouvání, a dá se sbalit. Eyebrow nad kartou
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
| `#/call`      | všichni | fronta hovorů: přepínač chaty / architekti (028), karta kontaktu + výsledky (nedovoláno/odmítnuto/zájem). Poznámka k hovoru je **nepovinná** — zájem jde uložit i bez ní (Albert 2026-09-23; dřív se při prázdné poznámce otevíralo potvrzovací okno navíc) |
| `#/stats`     | všichni | moje statistiky; super admin (i Albert) přes dropdown kohokoli (027); trychtýř „Klienti podle stavu" (admin) s filtrem segmentu (028) |
| `#/moji`      | všichni | moji klienti (+ historie poznámek v detailu); super admin může vybrat kohokoli (027); filtr segmentu (028) |
| `#/admin`     | všichni | Kontakty: celá databáze s filtry (i segment, 028) a fulltextem (i studio, město, IČO); upravovat smí admin a super admin |
| `#/oznacene`  | admin   | označení klienti — admin svoji; super admin a Albert všichni (027); filtr segmentu (028) |
| `#/zpravy`    | admin   | vlákna s AI agenty — admin svoje; super admin vlákna všech lidí (cizí jen ke čtení, 027); Albert i automatizaci; odznak architekta u hledaného kontaktu (028) |
| `#/uzivatele` | super admin | super admin: všichni lidé, upravuje sebe a své lidi + nový volající (027); Albert: role a nadřízení (⚠ od migrace 024 normální admin stránku nemá) |
| `#/automatizace` | Albert | vypínač automatizace a přepínač účtu Claude                    |
| `#/setup`     | všichni | nastavení Supabase URL + anon klíče                              |

## Nasazení na GitHub Pages

Workflow `.github/workflows/deploy.yml` při pushi na `main`:

1. `npm ci && npm run build` (Vite s `base: './'` → relativní cesty),
2. nahraje `dist/` přes `actions/upload-pages-artifact`,
3. nasadí přes `actions/deploy-pages`.

V nastavení repozitáře zapni **Settings → Pages → Source: GitHub Actions**.
