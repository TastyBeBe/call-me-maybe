// AUTOMATICKÁ AKTUALIZACE (Albert 21. 10. 2026): appka, která v prohlížeči zůstala otevřená (záložka, okno
// nainstalované appky, obnovená relace), běžela dál ve STARÉ verzi. Na jednom počítači tak 21. 10. ráno pořád
// ukazovala dole ve volání box s radami k hovoru, který je z nasazené verze pryč od 19. 10. Server pravidla vynutí sám (statistiky
// kolegů starší kopie nedostane), ale co je jen v kódu stránky, zmizí až po načtení nové verze.
//
// Proto si běžící appka každých 5 minut, při návratu na záložku a při zaměření okna stáhne index.html (bez cache)
// a porovná jméno balíčku assets/index-*.js s tím, ze kterého sama běží. Když je na serveru jiná verze, stránku
// znovu načte. Nikdy uprostřed psaní: dokud je kurzor v políčku, je vyplněné textové políčko (poznámka k hovoru,
// ceny, zpráva) nebo je otevřené potvrzovací okno, ukáže jen lištu „Je tu nová verze appky“ s tlačítkem a zkusí to
// znovu za 15 s. Přihlášení, trasa (#/…) i nastavení zůstanou (localStorage, hash v adrese). Jen v produkčním
// sestavení: ve vývoji (vite dev) ani bez balíčku assets/index-*.js nedělá nic.

const KONTROLA_MS = 5 * 60 * 1000;
const ZNOVU_MS = 15 * 1000;
const VZOR = /assets\/index-[A-Za-z0-9_-]+\.js/;

/** Jméno balíčku („assets/index-XXXX.js“) z textu index.html, nebo null. */
export function bundleZHtml(html: string): string | null {
  const m = VZOR.exec(html);
  return m ? m[0] : null;
}

/** Je na serveru jiná verze než ta, která běží? Nejasný stav (chybí jedno z jmen) = ne. */
export function jeNovaVerze(bezici: string | null, html: string): boolean {
  const nova = bundleZHtml(html);
  return !!bezici && !!nova && nova !== bezici;
}

type Pole = { tagName: string; type?: string; value?: string; isContentEditable?: boolean };
type Dokument = {
  activeElement: Pole | null;
  querySelectorAll: (s: string) => ArrayLike<Pole>;
  querySelector: (s: string) => unknown;
};

const TEXTOVA = new Set(['', 'text', 'email', 'tel', 'number', 'search', 'url', 'password']);

/** Píše teď člověk něco, co by načtení stránky smazalo? */
export function rozepsano(doc: Dokument): boolean {
  const a = doc.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable)) {
    return true;
  }
  const pole = Array.from(doc.querySelectorAll('textarea, input'));
  for (const p of pole) {
    if (p.tagName === 'INPUT' && !TEXTOVA.has((p.type || '').toLowerCase())) continue;
    if ((p.value || '').trim() !== '') return true;
  }
  return !!doc.querySelector('.modal');
}

function beziciBundle(): string | null {
  for (const s of Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'))) {
    const jmeno = bundleZHtml(s.src);
    if (jmeno) return jmeno;
  }
  return null;
}

export function spustAktualizace(): void {
  if (!import.meta.env.PROD) return;
  const bezici = beziciBundle();
  if (!bezici) return;

  let ceka = false;
  let lista: HTMLElement | null = null;
  const nacti = () => window.location.reload();

  const ukazListu = () => {
    if (lista) return;
    lista = document.createElement('div');
    lista.className = 'nova-verze';
    lista.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.textContent = 'Je tu nová verze appky. Načte se sama, až dopíšeš a uložíš.';
    const tlacitko = document.createElement('button');
    tlacitko.className = 'pill-btn sm';
    tlacitko.textContent = 'Načíst teď';
    tlacitko.addEventListener('click', nacti);
    lista.append(text, tlacitko);
    document.body.appendChild(lista);
  };

  const zkusNacist = () => {
    if (!rozepsano(document)) {
      nacti();
      return;
    }
    ukazListu();
    window.setTimeout(zkusNacist, ZNOVU_MS);
  };

  const zkontroluj = async () => {
    if (ceka) return;
    try {
      const adresa = new URL('./index.html', window.location.href);
      adresa.search = 'v=' + Date.now();
      const odpoved = await fetch(adresa.toString(), { cache: 'no-store' });
      if (!odpoved.ok) return;
      if (jeNovaVerze(bezici, await odpoved.text())) {
        ceka = true;
        zkusNacist();
      }
    } catch {
      // bez sítě nebo při výpadku Pages nic: zkusí se při další kontrole
    }
  };

  window.setInterval(() => void zkontroluj(), KONTROLA_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void zkontroluj();
  });
  window.addEventListener('focus', () => void zkontroluj());
  void zkontroluj();
}
