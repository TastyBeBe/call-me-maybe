import type { ZdrojTelefonu } from './api/types';
import { zdrojTelefonuVeta } from './ui';

/**
 * Scénář pro volajícího u architekta (docs/ARCHITEKTI.md 9.4). Stejný pro všechny, jen věta
 * o tom, odkud máme číslo, nese skutečný zdroj z karty ve 2. osobě („Vaše číslo mám z vašeho
 * webu."), ne popisek řádku karty („jeho webu"; audit APP-7). Okna volání jsou jen rada,
 * appka volání v jiný čas neomezuje ([ALBERT 25]). Tlačítko jmenuje přesně tak, jak je na
 * kartě: „Odmítnuto" (9.4 psal „Nemají zájem", takové tlačítko není; revize 28. 9.).
 */
export function tipArchitekt(zdroj: ZdrojTelefonu | null | undefined): { nadpis?: string; text: string }[] {
  return [
    {
      nadpis: 'Úvod',
      text: `„Dobrý den, tady <tvoje jméno> z WEBDOMOV. Volám, protože z vašich zveřejněných realizací umím sestavit náhled webu a poslat vám ho e-mailem. Vaše číslo mám z ${zdrojTelefonuVeta(zdroj)}. Když o to nestojíte, řekněte a už se neozvu." Nikdy se neptej „neruším?". Důvod hovoru patří do první věty.`,
    },
    {
      nadpis: 'Kontrolní otázka',
      text: '„Děláte vlastní zakázky pro klienty, nebo hlavně pro jiný ateliér?" Hlavně pro jiný ateliér: poděkuj, Odmítnuto, do poznámky „pracuje pro jiný ateliér".',
    },
    {
      nadpis: 'Když chce',
      text: '„Na jaký e-mail vám náhled pošlu?", „Můžu se vám k němu jednou ozvat?", „Kdo fotil vaše stavby a smím fotky do ukázky použít s uvedením autora?" Odpovědi do poznámky.',
    },
    {
      nadpis: 'Cena na dotaz',
      text: '6 000 až 7 000 Kč jednorázově, hosting 1 000 Kč ročně, platí se až po jeho písemném ano.',
    },
    {
      nadpis: 'Slova',
      text: 'Říkej: ateliér, realizace, studie, klient. Neříkej: projektant, designér, firma, levný, akce, na míru, moderní.',
    },
    {
      nadpis: 'Hlasová schránka',
      text: 'Nic nenechávej. „Nevolejte" = Odmítnuto a do poznámky NEVOLAT. Nevhodná chvíle: zeptej se, kdy zavolat, a zapiš to.',
    },
    {
      nadpis: 'Kdy volat',
      text: 'Nejlépe úterý až čtvrtek 10:00 až 11:45 a 13:30 až 16:00. Je to jen rada, volat můžeš kdykoli.',
    },
    {
      nadpis: 'Když namítne',
      text: 'Doporučení: „Web je pro ty, kterým vás někdo doporučil a chtějí vidět vaše stavby." Instagram nebo ČKA: „Registr potvrzuje autorizaci, vaši práci ale neukazuje." Šablona: „Je to střídmý rám, nosné jsou vaše stavby a texty." Čas: „Náhled je hotový z toho, co už jste zveřejnili. Stačí se podívat." Podvod: „Nic nefakturujeme, dokud nám sám písemně nenapíšete, že web chcete."',
    },
  ];
}
