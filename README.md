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
npm test         # test chování segmentu nad demo mockem (bez sítě, bez živé DB)
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

**Zkoušet jen v DEMO.** `npm run dev` bez DEMO sahá na živá data a React StrictMode
v dev režimu volá efekt dvakrát, takže dvě `next_contact` zamknou dva živé kontakty.
Postup: `npm run build`, `npx vite preview --port 5178` (port z `.claude/launch.json`),
v prohlížeči nebo v headless Playwrightu nejdřív (například `page.addInitScript`)
`volacka_supabase_url = ' '` a vypnutý zvuk (`volacka_sfx_enabled`,
`volacka_music_enabled`, `volacka_pig_enabled` = `'0'`), pak přihlášení demo účtem.

Demo přihlášení (jen DEMO, falešná data v paměti):

| role                         | jméno     | heslo     |
| ---------------------------- | --------- | --------- |
| super admin + majitel (Albert) | `admin`   | `admin`   |
| super admin (Mikuláš)        | `mikulas` | `mikulas` |
| admin (Eva, pod Albertem)    | `eva`     | `eva`     |
| volající (Petra, pod Albertem) | `petra`   | `volam`   |
| volající (Honza, pod Mikulášem) | `honza`   | `volam`   |

Demo mock (`src/api/mock.ts`) má stejná pravidla viditelnosti jako server (migrace 023
až 028). Chaty mají id 1 až 9 a 90 až 92, falešní architekti id 300 až 303 (jen adresy
`example.cz`, telefony s předvolbou 999, IČO `11111111` a `22222222` s neplatným
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
  zavřený, poznámka prázdná) vrátí do fronty (`vratit_do_fronty`: jen vlastní zámek,
  jen volatelný stav, jen do 30 minut) a vezme další. Rozdělaná karta zůstane a žlutá
  cedulka řekne, koho dostaneš po tomhle hovoru; „Přepnout hned" se ptá, protože poznámka
  se neuloží. Odpověď, která dorazí až po přepnutí, se zahodí a její zámek se vrátí.
- Karta architekta: jméno (jinak studio), studio, telefon, e-mail, město, web, IČO
  a DPH osobně a studia zvlášť, odkud máme číslo, a pod tím tip pro hovor (statický
  scénář z oddílu 9.4 a okna volání jako rada).
- **Seznamy** (Kontakty, Moji klienti, Označené, trychtýř ve Statistikách) mají filtr
  „vše / chaty / architekti", výchozí vše, nepamatuje se. Kontakty a Moji klienti filtrují
  na serveru (`p_segment` jen když není vše, i v počtech stavů a košů), Označené v appce.
  Zprávy filtr nemají, jen odznak architekta u hledaného kontaktu.
- Osobní IČO posílá server v seznamech jen tomu, kdo kontakt smí upravit; detail pak
  ukáže „skryto" ([ALBERT 28]). Karta ve volání má řádek celý.
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
