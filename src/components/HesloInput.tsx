// Pole hesla s okem (Albert 9. 11. 2026: „there should be this eye icon which allows you to view the password you're
// typing“). Klepnutí na oko přepne zobrazení psaného hesla; heslo se nikam neukládá ani neposílá, mění se jen typ pole.
// Tlačítko je type="button" (formulář neodešle) a při klepnutí nebere poli fokus, takže se nezavře klávesnice na telefonu.
import { useState, type InputHTMLAttributes } from 'react';
import { EyeIcon, EyeOffIcon } from '../icons';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function HesloInput(props: Props) {
  const [vidim, setVidim] = useState(false);
  const popis = vidim ? 'Skrýt heslo' : 'Zobrazit heslo';
  return (
    <div className="heslo-pole">
      <input
        {...props}
        type={vidim ? 'text' : 'password'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <button
        type="button"
        className="heslo-oko"
        aria-label={popis}
        aria-pressed={vidim}
        aria-controls={props.id}
        title={popis}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setVidim((v) => !v)}
      >
        {vidim ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
      </button>
    </div>
  );
}
