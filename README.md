# Call me maybe — interní obvolávací appka WEBDOMOV

Webová aplikace pro volající a adminy projektu WEBDOMOV (prodej webů majitelům chat
a chalup). Volající dostávají kontakty z fronty jeden po druhém, zapisují výsledky
hovorů a sledují svoje statistiky. Admin navíc spravuje celou databázi kontaktů,
odpovídá na dotazy AI agentů a zakládá uživatele.

## Technologie

- **Vite + React + TypeScript**, routing přes `HashRouter` (funguje na GitHub Pages
  bez serverové konfigurace).
- **Žádná komponentová knihovna** — ručně psané CSS podle interního design jazyka
  (viz `../app-design-tokens.md`).
- Backend: **Supabase PostgREST RPC** — čisté `fetch` na
  `POST {SUPABASE_URL}/rest/v1/rpc/{funkce}` s hlavičkami `apikey` a
  `Authorization: Bearer {anon key}`. Kompletní DB kontrakt je v `../db/schema.sql`.

## Lokální vývoj

```bash
npm install
npm run dev      # dev server
npm run build    # produkční build do dist/
npm run preview  # náhled produkčního buildu
```

## Nastavení Supabase (URL + anon klíč)

Aplikace **nemá klíče zapečené v kódu**. Nastavují se za běhu:

1. Otevři v aplikaci route **`#/setup`** (např. `https://…/index.html#/setup`).
2. Vlož **Supabase URL** (`https://xxxx.supabase.co`) a **anon (public) klíč**.
3. Ulož — hodnoty se zapíšou do `localStorage` prohlížeče
   (klíče `volacka_supabase_url` a `volacka_anon_key`) a appka se restartuje
   připojená k backendu.

Nastavení je per-prohlížeč — každý volající si ho udělá jednou na svém zařízení.
Alternativně jdou vyplnit fallback konstanty v `src/config.ts` a appku rebuildnout.

## DEMO režim

Dokud není Supabase nastavené, běží appka v **DEMO režimu**: in-memory mock se
stejným RPC rozhraním a několika falešnými kontakty, takže celé UI jde proklikat
bez backendu (data žijí jen do reloadu stránky).

Demo přihlášení (jen DEMO, falešná data v paměti):

| role                         | jméno     | heslo     |
| ---------------------------- | --------- | --------- |
| super admin + majitel (Albert) | `admin`   | `admin`   |
| super admin (Mikuláš)        | `mikulas` | `mikulas` |
| admin (Eva, pod Albertem)    | `eva`     | `eva`     |
| volající (Petra, pod Albertem) | `petra`   | `volam`   |
| volající (Honza, pod Mikulášem) | `honza`   | `volam`   |

Demo mock (`src/api/mock.ts`) má stejná pravidla viditelnosti jako server (migrace 023).

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

## Stránky

| route         | kdo     | co                                                              |
| ------------- | ------- | --------------------------------------------------------------- |
| `#/login`     | všichni | přihlášení                                                       |
| `#/`          | všichni | domů — dlaždice podle role                                       |
| `#/call`      | všichni | fronta hovorů: karta kontaktu + výsledky (nedovoláno/odmítnuto/zájem). Poznámka k hovoru je **nepovinná** — zájem jde uložit i bez ní (Albert 2026-09-23; dřív se při prázdné poznámce otevíralo potvrzovací okno navíc) |
| `#/stats`     | všichni | moje statistiky; super admin (i Albert) přes dropdown kohokoli (027) |
| `#/moji`      | všichni | moji klienti (+ historie poznámek v detailu); super admin může vybrat kohokoli (027) |
| `#/admin`     | všichni | Kontakty: celá databáze s filtry a fulltextem; upravovat smí admin a super admin |
| `#/oznacene`  | admin   | označení klienti — admin svoji; super admin a Albert všichni (027) |
| `#/zpravy`    | admin   | vlákna s AI agenty — admin svoje; super admin vlákna všech lidí (cizí jen ke čtení, 027); Albert i automatizaci |
| `#/uzivatele` | super admin | super admin: všichni lidé, upravuje sebe a své lidi + nový volající (027); Albert: role a nadřízení (⚠ od migrace 024 normální admin stránku nemá) |
| `#/automatizace` | Albert | vypínač automatizace a přepínač účtu Claude                    |
| `#/setup`     | všichni | nastavení Supabase URL + anon klíče                              |

## Nasazení na GitHub Pages

Workflow `.github/workflows/deploy.yml` při pushi na `main`:

1. `npm ci && npm run build` (Vite s `base: './'` → relativní cesty),
2. nahraje `dist/` přes `actions/upload-pages-artifact`,
3. nasadí přes `actions/deploy-pages`.

V nastavení repozitáře zapni **Settings → Pages → Source: GitHub Actions**.
