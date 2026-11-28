/**
 * Legenda (Albert 27. 11. 2026, spec super klientů §5): co znamená každý stav, příznak, označení a odznak, který appka
 * ukazuje, jednou větou česky. Úplnost hlídá tests/legenda.test.mjs: chybějící klíč mapy popisků z ui.tsx nebo nový odznak
 * (komponenta *Badge / *Odznak) bez věty = FAIL.
 */
import { CEKANI_LABELS, FLAG_LABELS, KOS_LABELS, OZNACENI_LABELS, STATUS_LABELS, ZNAMKA_FILTR_LABELS } from './ui';
import { NAVRH_ODZNAK } from './kontrola';

export const VYSVETLENI: Record<string, Record<string, string>> = {
  stav: {
    nekontaktovano: 'Ještě jsme mu nevolali.',
    nedovolano: 'Volali jsme, ale nezvedl to; zkusí se znovu.',
    odmitnuto: 'Řekl, že web nechce.',
    nerelevantni: 'Není to náš zákazník (špatný nebo nepoužitelný kontakt).',
    nekontaktovat: 'Nechce, abychom ho dál kontaktovali; nevolá se mu ani nepíše.',
    zajem: 'Má zájem; automatizace mu připravuje náhled webu.',
    web_ve_vyrobe: 'Náhled webu se právě staví.',
    navrh_odeslan: 'Náhled jsme mu poslali e-mailem a čekáme na jeho odpověď.',
    sleva_nabidnuta: 'Nabídli jsme mu slevu a běží lhůta, do kdy platí.',
    ceka_na_klienta: 'Čekáme, až klient něco pošle nebo rozhodne.',
    pozdeji: 'Chce se ozvat později; zavolá se mu znovu.',
    bez_odpovedi: 'Neodpověděl ani na připomínku, je v archivu.',
    upravy_ve_vyrobe: 'Zapracováváme úpravy, o které požádal.',
    schvaleno: 'Web schválil a chce ho.',
    faktura_odeslana: 'Poslali jsme mu fakturu, čekáme na platbu.',
    zaplaceno: 'Zaplatil fakturu za web.',
    domena_pripojena: 'Web už běží na jeho doméně.',
    hotovo: 'Hotovo, nic dalšího se nedělá.',
    pozastaveno: 'Pozastavený: automatizace mu nic nepíše, dokud ten, kdo ho pozastavil, neřekne „pokračuj“.',
    eskalace: 'Agent si neví rady a čeká na rozhodnutí člověka.',
  },
  priznak: {
    chybi_info: 'Nevíme, o koho jde: chybí jméno nebo firma, doplň je.',
    chybi_email: 'Chybí e-mail, bez něj mu automatizace nic nepošle.',
    email_neoveren: 'E-mail jsme neověřili, může být špatně.',
    info_neoverene: 'Údaje jsou z internetu a nikdo je zatím neověřil.',
    jine: 'Něco není v pořádku; podrobnosti jsou v poznámce u příznaku.',
    neodpovida: 'Neodpovídá na e-maily, je potřeba mu zavolat.',
  },
  oznaceni: {
    navrh: 'Neodpověděl na náš návrh webu déle než 5 pracovních dní; zavolej mu.',
    zmeny: 'Neodpověděl na změny, které jsme mu poslali, déle než 5 pracovních dní; zavolej mu.',
  },
  znamka: {
    A: 'Známka A: nejlepší klient, nejvíc zájmu.',
    B: 'Známka B: střední zájem.',
    C: 'Známka C: malý zájem.',
    bez: 'Klient zatím nemá známku.',
  },
  cekani: {
    ceka_prvni: 'Čekáme na jeho první odpověď na náš e-mail.',
    ceka_po_odpovedi: 'Odpověděli jsme mu a čekáme, co napíše dál.',
  },
  kos: {
    cerstve: 'Čeká do 7 dní, je to čerstvé.',
    k_zavolani: 'Čeká 7 až 30 dní, je čas mu zavolat.',
    vlazne: 'Čeká 1 až 2 měsíce, zájem chladne.',
    vychladle: 'Čeká přes 2 měsíce, zájem vychladl.',
  },
  navrh: {
    ceka: 'Návrh e-mailu čeká, až ho super admin schválí nebo vrátí s poznámkou.',
    schvaleno: 'Schválený e-mail; automatizace ho odešle do 15 minut.',
    odesila: 'E-mail se právě odesílá.',
    odeslano: 'E-mail odešel klientovi.',
    vraceno: 'Vrácený s poznámkou; agent e-mail přepíše.',
    nahrazeno: 'Nahradil ho novější návrh, tenhle neodejde.',
    zruseno: 'Zrušený návrh; neodejde.',
    neodeslano: 'Neodešel, protože klient mezitím napsal nebo se něco změnilo.',
    chyba: 'Odeslání selhalo; automatizace to zkusí znovu.',
  },
  znacky: {
    StatusBadge: 'Stav klienta (co který stav znamená, je výš u stavů).',
    FlagBadge: 'Příznak u kontaktu: něco chybí nebo není ověřené (vysvětlení výš u příznaků).',
    OznaceniBadge: 'Označení k zavolání: klient dlouho neodpověděl (vysvětlení výš u označení).',
    HvezdaOdznak: 'Hvězda: klient má velký zájem, volá se mu přednostně.',
    SegmentBadge: 'Druh klienta: chata, architekt nebo řemeslná firma.',
    WebNaMiruOdznak: 'Web na míru: klient dostane web postavený podle svého zadání a každý e-mail mu schvaluje člověk; '
      + '„bez našeho náhledu“ znamená, že mu náš náhled ze šablony neposíláme.',
  },
};

const SKUPINY: Record<string, Record<string, unknown>> = {
  stav: STATUS_LABELS, priznak: FLAG_LABELS, oznaceni: OZNACENI_LABELS, znamka: ZNAMKA_FILTR_LABELS, cekani: CEKANI_LABELS,
  kos: KOS_LABELS,
};
export const NAZVY_SKUPIN: Record<string, string> = {
  stav: 'Stavy klientů', priznak: 'Příznaky', oznaceni: 'Označení k zavolání', znamka: 'Známky', cekani: 'Čekání na klienta',
  kos: 'Jak dlouho klient čeká', navrh: 'Návrhy e-mailů ke schválení', znacky: 'Odznaky',
};
const ODZNAKY_NAZEV: Record<string, string> = {
  StatusBadge: 'Stav', FlagBadge: 'Příznak', OznaceniBadge: 'Označení', HvezdaOdznak: 'Hvězda', SegmentBadge: 'Druh klienta',
  WebNaMiruOdznak: 'Web na míru',
};

export interface LegendaPolozka {
  skupina: string;
  klic: string;
  stitek: string;
  vysvetleni: string;
}

/** Celá legenda v pořadí appky: stavy, příznaky, označení, známky, čekání, koše, návrhy e-mailů, odznaky. */
export function legenda(): LegendaPolozka[] {
  const ven: LegendaPolozka[] = [];
  for (const [sk, mapa] of Object.entries(SKUPINY)) {
    for (const [k, stitek] of Object.entries(mapa)) {
      ven.push({ skupina: sk, klic: k, stitek: typeof stitek === 'string' ? stitek : k, vysvetleni: VYSVETLENI[sk]?.[k] ?? '' });
    }
  }
  for (const k of Object.keys(NAVRH_ODZNAK)) ven.push({ skupina: 'navrh', klic: k, stitek: k, vysvetleni: VYSVETLENI.navrh[k] ?? '' });
  for (const [k, v] of Object.entries(VYSVETLENI.znacky)) {
    ven.push({ skupina: 'znacky', klic: k, stitek: ODZNAKY_NAZEV[k] ?? k, vysvetleni: v });
  }
  return ven;
}
