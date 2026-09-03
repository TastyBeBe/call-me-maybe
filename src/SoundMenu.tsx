import { useEffect, useRef, useState } from 'react';
import { audio, useAudioSettings } from './audio';
import { MusicIcon, MusicOffIcon, SpeakerIcon, SpeakerOffIcon } from './icons';

/**
 * Zvukové menu (Albert 2026-09-03).
 *
 * Tři nezávislé kanály, každý s vlastním vypínačem A vlastním posuvníkem:
 *   • zvuky aplikace (klik, přechod, odeslání…)
 *   • Procop (kviky, zbraně, fanfáry)
 *   • hudba
 *
 * Proč posuvníky a ne jen vypínače: Procop je hlasitý a hraje často, kdežto
 * klikání tlačítek chce člověk slyšet pořád. Bez oddělené hlasitosti se dřív
 * musely vypnout obě věci najednou.
 *
 * Náhled: při tažení posuvníku se přehraje ukázka toho kanálu, ať je slyšet,
 * co si člověk nastavuje (u hudby to není potřeba — ta hraje).
 */

interface PigRuntimeLike {
  play?: (name: string, vol?: number) => void;
}

function previewPig() {
  const rt = (window as unknown as { __pig?: PigRuntimeLike }).__pig;
  try {
    rt?.play?.('oink_happy', 0.7);
  } catch {
    // Procop zrovna neběží (odhlášeno / vypnutý) — náhled prostě nebude
  }
}

function Row({
  icon,
  label,
  on,
  value,
  onToggle,
  onValue,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  on: boolean;
  value: number;
  onToggle: () => void;
  onValue: (v: number) => void;
  disabled?: boolean;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className={`snd-row${on ? '' : ' off'}`}>
      <button
        type="button"
        className="snd-toggle"
        data-sfx="none"
        aria-pressed={on}
        title={on ? `Vypnout: ${label}` : `Zapnout: ${label}`}
        onClick={onToggle}
      >
        {icon}
      </button>
      <div className="snd-body">
        <div className="snd-head">
          <span className="snd-label">{label}</span>
          <span className="snd-pct">{on ? `${pct} %` : 'vypnuto'}</span>
        </div>
        <input
          className="snd-range"
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          /* vyplněnou část dráhy kreslí CSS gradient podle --pct */
          style={{ ['--pct' as string]: `${pct}%` } as React.CSSProperties}
          disabled={disabled || !on}
          aria-label={`Hlasitost: ${label}`}
          onChange={(e) => onValue(Number(e.target.value) / 100)}
        />
      </div>
    </div>
  );
}

export default function SoundMenu() {
  const {
    sfxOn, musicOn, pigOn,
    sfxVolume, musicVolume, pigVolume,
    setSfx, setMusic, setPig,
    setSfxVolume, setMusicVolume, setPigVolume,
  } = useAudioSettings();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // klik mimo panel a Esc ho zavřou
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const allOff = !sfxOn && !musicOn && !pigOn;

  return (
    <div className="snd-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`tb-btn audio-toggle${allOff ? ' off' : ''}${open ? ' open' : ''}`}
        data-sfx="none"
        aria-label="Nastavení zvuku"
        aria-expanded={open}
        title="Nastavení zvuku"
        onClick={() => {
          setOpen((o) => !o);
          if (sfxOn) audio.play('click');
        }}
      >
        {allOff ? <SpeakerOffIcon size={18} /> : <SpeakerIcon size={18} />}
      </button>

      {open && (
        <div className="snd-panel card" role="dialog" aria-label="Nastavení zvuku">
          <div className="snd-title">Zvuk</div>

          <Row
            icon={sfxOn ? <SpeakerIcon size={18} /> : <SpeakerOffIcon size={18} />}
            label="Zvuky aplikace"
            on={sfxOn}
            value={sfxVolume}
            onToggle={() => {
              const next = !sfxOn;
              setSfx(next);
              if (next) audio.play('click');
            }}
            onValue={(v) => {
              setSfxVolume(v);
              audio.play('click');
            }}
          />

          <Row
            icon={
              <img
                className="snd-pig-ico"
                src={import.meta.env.BASE_URL + 'icons/procop_icon_32.png'}
                alt=""
                aria-hidden="true"
                style={{ opacity: pigOn ? 1 : 0.35 }}
              />
            }
            label="Procop"
            on={pigOn}
            value={pigVolume}
            onToggle={() => {
              const next = !pigOn;
              setPig(next);
              if (next) previewPig();
            }}
            onValue={(v) => {
              setPigVolume(v);
              previewPig();
            }}
          />

          <Row
            icon={musicOn ? <MusicIcon size={18} /> : <MusicOffIcon size={18} />}
            label="Hudba"
            on={musicOn}
            value={musicVolume}
            onToggle={() => setMusic(!musicOn)}
            onValue={(v) => setMusicVolume(v)}
          />
        </div>
      )}
    </div>
  );
}
