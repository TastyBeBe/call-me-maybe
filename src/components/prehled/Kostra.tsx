// KOSTRA PŘEHLEDU (Přehled vedení úkol 13; recenze 14b, drobnost 9: stránka Přehledu se načítá líně). Kostra karet, než přijdou
// čísla, a kostra celé stránky, než přijde kód Přehledu (Suspense v App.tsx). Samostatný malý soubor bez pomocníků Přehledu,
// ať hlavní balík appky (a tím i Volající, který Přehled nikdy neotevře) kód Přehledu nestahuje; Stavy.tsx kostru karet dál
// nabízí pod stejným jménem.

/** Kostra karet během prvního načítání. */
export function PrehledNacita({ karet = 8, popis = 'Načítám čísla…' }: { karet?: number; popis?: string }) {
  return (
    <div className="prehled-nacita" aria-busy="true" role="status" aria-label={popis}>
      <div className="kpi-mrizka">
        {Array.from({ length: karet }, (_, i) => (
          <div key={i} className="kpi-karta kostra" aria-hidden="true">
            <span className="kostra-radek kratky" />
            <span className="kostra-radek velky" />
            <span className="kostra-radek" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Stránka Přehledu, než se stáhne její kód: stejná hlavička jako stránka a kostra karet (žádný skok, až stránka přijde). */
export function PrehledStrankaNacita() {
  return (
    <div className="prehled-stranka">
      <header className="prehled-hlava">
        <h1 className="page-title">Přehled vedení</h1>
      </header>
      <PrehledNacita popis="Načítám Přehled…" />
    </div>
  );
}
