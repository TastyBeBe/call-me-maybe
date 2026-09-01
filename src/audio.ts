import { useSyncExternalStore } from 'react';

/**
 * AudioManager — malá zvuková vrstva appky (Web Audio API, žádné závislosti).
 *
 * - 5 SFX (click / nav / success / error / send) se předdekóduje do AudioBufferů
 *   při prvním uživatelském gestu (autoplay policy: AudioContext se smí
 *   vytvořit/resumnout až po pointerdown).
 * - Každé přehrání má náhodně rozhozený playbackRate (standardní herní technika
 *   "pitch randomization": ±5–10 % podle GDC/Game Developer "The Power of Pitch
 *   Shifting" — opakované zvuky pak neznějí jako kulomet). Používáme ±6 %,
 *   u success/error jen ±3 %, aby zůstaly okamžitě rozpoznatelné.
 * - K pitchi přidáváme i drobný jitter hlasitosti (±10 %) — spolu s pitch
 *   randomizací je to nejlevnější způsob, jak opakovaný zvuk působí "živě".
 * - Hudba: <audio> loop /audio/lofi.mp3, volume 0.22. Soubor zatím nemusí
 *   existovat — selhání načtení je jen console.info a přepínač dál funguje.
 * - Dva nezávislé persistované přepínače v localStorage.
 */

export type SfxName = 'click' | 'nav' | 'success' | 'error' | 'send';

const SFX_NAMES: SfxName[] = ['click', 'nav', 'success', 'error', 'send'];

export function isSfxName(v: string | null | undefined): v is SfxName {
  return !!v && (SFX_NAMES as string[]).includes(v);
}

const LS_SFX = 'volacka_sfx_enabled';
const LS_MUSIC = 'volacka_music_enabled';

const SFX_BASE_VOLUME = 0.8; // rezerva, ať jitter +10 % nikdy neklipuje
const MUSIC_VOLUME = 0.22;

/** Rozptyl playbackRate: běžné SFX ±6 %, success/error ±3 %. */
const PITCH_SPREAD: Record<SfxName, number> = {
  click: 0.06,
  nav: 0.06,
  send: 0.06,
  success: 0.03,
  error: 0.03,
};

function audioUrl(file: string): string {
  return import.meta.env.BASE_URL + 'audio/' + file;
}

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode apod. — nastavení prostě nepřežije reload
  }
}

class AudioManager {
  private ctx: AudioContext | null = null;
  private buffers = new Map<SfxName, AudioBuffer>();
  private unlocked = false;
  private preloadStarted = false;
  private musicEl: HTMLAudioElement | null = null;
  private musicWarned = false;
  private listeners = new Set<() => void>();

  // default: obojí zapnuto
  private sfxEnabled = lsGet(LS_SFX) !== '0';
  private musicEnabled = lsGet(LS_MUSIC) !== '0';

  /* ---------- stav + odběry pro React ---------- */

  get sfxOn(): boolean {
    return this.sfxEnabled;
  }

  get musicOn(): boolean {
    return this.musicEnabled;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  setSfx(on: boolean) {
    if (this.sfxEnabled === on) return;
    this.sfxEnabled = on;
    lsSet(LS_SFX, on ? '1' : '0');
    this.emit();
  }

  setMusic(on: boolean) {
    if (this.musicEnabled === on) return;
    this.musicEnabled = on;
    lsSet(LS_MUSIC, on ? '1' : '0');
    if (on) {
      this.startMusic();
    } else {
      this.musicEl?.pause();
    }
    this.emit();
  }

  /* ---------- odemčení při prvním gestu ---------- */

  /** Volá se z capture pointerdown listeneru — první gesto odemkne audio. */
  unlock() {
    if (!this.unlocked) {
      this.unlocked = true;
      try {
        this.ctx = new AudioContext();
      } catch {
        console.info('[audio] Web Audio API není k dispozici — zvuky vypnuty.');
        return;
      }
      this.startMusic();
    }
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    if (!this.preloadStarted && this.ctx) {
      this.preloadStarted = true;
      void this.preload();
    }
  }

  private async preload() {
    const ctx = this.ctx;
    if (!ctx) return;
    await Promise.all(
      SFX_NAMES.map(async (name) => {
        try {
          const res = await fetch(audioUrl(name + '.mp3'));
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = await ctx.decodeAudioData(await res.arrayBuffer());
          this.buffers.set(name, buf);
        } catch (e) {
          console.info(`[audio] SFX "${name}" se nepodařilo načíst:`, e);
        }
      })
    );
  }

  /* ---------- SFX ---------- */

  play(name: SfxName) {
    if (!this.sfxEnabled) return;
    const ctx = this.ctx;
    const buf = this.buffers.get(name);
    if (!ctx || !buf) return;
    if (ctx.state === 'suspended') void ctx.resume();
    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      // pitch randomization: ±3–6 % na každé přehrání (viz komentář nahoře)
      const spread = PITCH_SPREAD[name];
      src.playbackRate.value = 1 + (Math.random() * 2 - 1) * spread;
      const gain = ctx.createGain();
      // volume jitter ±10 % — druhá půlka triku proti monotónnosti
      gain.gain.value = SFX_BASE_VOLUME * (1 + (Math.random() * 2 - 1) * 0.1);
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start();
    } catch (e) {
      console.info('[audio] přehrání SFX selhalo:', e);
    }
  }

  /* ---------- hudba ---------- */

  private ensureMusicEl(): HTMLAudioElement {
    if (!this.musicEl) {
      const el = new Audio(audioUrl('lofi.mp3'));
      el.loop = true;
      el.volume = MUSIC_VOLUME;
      el.preload = 'auto';
      el.addEventListener('error', () => {
        if (!this.musicWarned) {
          this.musicWarned = true;
          console.info('[audio] lofi.mp3 zatím není k dispozici — hudba se přeskočí.');
        }
      });
      this.musicEl = el;
    }
    return this.musicEl;
  }

  /** Spustí loop — jen po prvním gestu a jen když je hudba zapnutá. */
  private startMusic() {
    if (!this.unlocked || !this.musicEnabled) return;
    const el = this.ensureMusicEl();
    // po dřívějším selhání zkusit načíst znovu — soubor mezitím mohl přibýt
    if (el.error) {
      this.musicWarned = false;
      el.load();
    }
    el.play().catch(() => {
      if (!this.musicWarned) {
        this.musicWarned = true;
        console.info('[audio] hudbu se nepodařilo spustit (soubor chybí, nebo blokace prohlížeče).');
      }
    });
  }
}

/** Jediná instance pro celou appku. */
export const audio = new AudioManager();

/** React hook: stav obou přepínačů + settery. */
export function useAudioSettings() {
  const sfxOn = useSyncExternalStore(audio.subscribe, () => audio.sfxOn);
  const musicOn = useSyncExternalStore(audio.subscribe, () => audio.musicOn);
  return {
    sfxOn,
    musicOn,
    setSfx: (on: boolean) => audio.setSfx(on),
    setMusic: (on: boolean) => audio.setMusic(on),
  };
}
