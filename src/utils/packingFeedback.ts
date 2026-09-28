// Scan feedback (sound + vibration) for the packing desk — deliberately
// synthesized via WebAudio rather than shipping audio asset files, so there's
// nothing to fetch/host and no license question for a beep.

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

function beep(frequency: number, durationMs: number, volume = 0.15) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.value = volume;
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + durationMs / 1000);
}

const SOUND_PREF_KEY = "annvriksh_cms_scan_sound_enabled";

/** Per-viewer convenience only (this device's mute toggle) — not shared
 * state, so plain localStorage is appropriate here. */
export function isScanSoundEnabled(): boolean {
  try {
    const stored = localStorage.getItem(SOUND_PREF_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

export function setScanSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_PREF_KEY, String(enabled));
  } catch {
    // Ignore — private browsing / storage blocked; the toggle just won't persist.
  }
}

export function playScanSuccess(): void {
  if (!isScanSoundEnabled()) return;
  beep(880, 120);
}

export function playScanRejected(): void {
  if (!isScanSoundEnabled()) return;
  beep(220, 220, 0.18);
}

export function vibrateSuccess(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(60);
  }
}

export function vibrateRejected(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate([50, 60, 50]);
  }
}
