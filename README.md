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

Demo přihlášení:

| role     | jméno   | heslo   |
| -------- | ------- | ------- |
| admin    | `admin` | `admin` |
| volající | `petra` | `volam` |
| volající | `honza` | `volam` |

## Účty a přihlášení (produkce)

- Vlastní auth v Postgresu (žádný Supabase Auth): funkce `login` vrací token,
  session platí 7 dní a klouzavě se prodlužuje.
- Prvního admina je potřeba založit ručně v SQL (viz `../db/schema.sql`,
  tabulka `users` + `crypt(heslo, gen_salt('bf'))`). Další uživatele už admin
  zakládá v appce na `#/uzivatele`.

## Stránky

| route         | kdo     | co                                                              |
| ------------- | ------- | --------------------------------------------------------------- |
| `#/login`     | všichni | přihlášení                                                       |
| `#/`          | všichni | domů — velká tlačítka VOLAT a MOJE STATISTIKY (admin i další)    |
| `#/call`      | všichni | fronta hovorů: karta kontaktu + výsledky (nedovoláno/odmítnuto/zájem) |
| `#/stats`     | všichni | moje statistiky; admin vidí přes dropdown statistiky všech       |
| `#/admin`     | admin   | tabulka kontaktů s filtry, fulltextem, detailem a úpravami       |
| `#/zpravy`    | admin   | inbox dotazů od AI agentů + odpovědi (volitelně „zapsat do pravidel") |
| `#/uzivatele` | admin   | seznam uživatelů + založení nového                               |
| `#/setup`     | všichni | nastavení Supabase URL + anon klíče                              |

## Nasazení na GitHub Pages

Workflow `.github/workflows/deploy.yml` při pushi na `main`:

1. `npm ci && npm run build` (Vite s `base: './'` → relativní cesty),
2. nahraje `dist/` přes `actions/upload-pages-artifact`,
3. nasadí přes `actions/deploy-pages`.

V nastavení repozitáře zapni **Settings → Pages → Source: GitHub Actions**.
