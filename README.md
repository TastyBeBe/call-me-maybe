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
  tabulka `users` + `crypt(heslo, gen_salt('bf'))`). Další uživatele už admin
  zakládá v appce na `#/uzivatele`.

## Role a kdo co vidí (migrace 023, Albert 2026-09-24)

Tři role: **volající**, **admin**, **super admin**; majitel účtu je Albert (users.id 1).
Každý vidí **jen svoje** (statistiky, klienty, zprávy, označené); cizí lidi vidí jen super
admin (lidi pod sebou) a Albert (všechny). Kontakty (celou databázi) vidí všichni, jméno
kolegy u kontaktu ale jen jeho super admin („jiný volající"). Zprávy automatizace a stránku
Automatizace vidí jen Albert. **Hlídá to server** (SQL funkce), appka jen neukazuje, co by
server odmítl. Podrobně: `../docs/ROLE-A-VIDITELNOST.md`.

## Stránky

| route         | kdo     | co                                                              |
| ------------- | ------- | --------------------------------------------------------------- |
| `#/login`     | všichni | přihlášení                                                       |
| `#/`          | všichni | domů — dlaždice podle role                                       |
| `#/call`      | všichni | fronta hovorů: karta kontaktu + výsledky (nedovoláno/odmítnuto/zájem). Poznámka k hovoru je **nepovinná** — zájem jde uložit i bez ní (Albert 2026-09-23; dřív se při prázdné poznámce otevíralo potvrzovací okno navíc) |
| `#/stats`     | všichni | moje statistiky; super admin přes dropdown i svých lidí (Albert všech) |
| `#/moji`      | všichni | moji klienti (+ historie poznámek v detailu); super admin může vybrat člověka ze svých lidí |
| `#/admin`     | všichni | Kontakty: celá databáze s filtry a fulltextem; upravovat smí admin a super admin |
| `#/oznacene`  | admin   | označení klienti — svoji; super admin svých lidí + klienti bez volajícího |
| `#/zpravy`    | admin   | vlákna s AI agenty — svoje; super admin i svých lidí (výběr člověka); Albert i automatizaci |
| `#/uzivatele` | admin   | super admin: seznam svých lidí + úpravy; Albert: role a nadřízení; admin: jen „nový volající" |
| `#/automatizace` | Albert | vypínač automatizace a přepínač účtu Claude                    |
| `#/setup`     | všichni | nastavení Supabase URL + anon klíče                              |

## Nasazení na GitHub Pages

Workflow `.github/workflows/deploy.yml` při pushi na `main`:

1. `npm ci && npm run build` (Vite s `base: './'` → relativní cesty),
2. nahraje `dist/` přes `actions/upload-pages-artifact`,
3. nasadí přes `actions/deploy-pages`.

V nastavení repozitáře zapni **Settings → Pages → Source: GitHub Actions**.
