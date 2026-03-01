/**
 * Plays a short notification sound when a new message arrives.
 * Uses Web Audio API to generate a pleasant two-tone "ding" like messaging apps.
 * On mobile, we unlock audio on first user interaction (tap/click) so sound can play.
 */

let audioContext: AudioContext | null = null;
let unlocked = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

/** Call once on app load to unlock audio on first user tap (required for mobile). */
export function unlockAudioOnFirstInteraction(): void {
  if (typeof window === 'undefined' || unlocked) return;
  const unlock = () => {
    if (unlocked) return;
    const ctx = getAudioContext();
    if (ctx?.state === 'suspended') ctx.resume();
    unlocked = true;
    window.removeEventListener('touchstart', unlock);
    window.removeEventListener('touchend', unlock);
    window.removeEventListener('click', unlock);
  };
  window.addEventListener('touchstart', unlock, { once: true, passive: true });
  window.addEventListener('touchend', unlock, { once: true, passive: true });
  window.addEventListener('click', unlock, { once: true });
}

export function playMessageNotificationSound(): void {
  if (typeof window === 'undefined') return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume if suspended (required on mobile after user gesture)
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  try {
    const now = ctx.currentTime;
    // Two-tone chime: C5 (523Hz) + E5 (659Hz) - pleasant message notification
    const freqs = [523.25, 659.25];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + i * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.2);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.25);
    });
  } catch {
    // Ignore if audio fails (e.g. autoplay blocked)
  }
}

/** Play a soft celebration tone for vibe effects. */
export function playVibeCelebrationSound(): void {
  if (typeof window === 'undefined') return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  try {
    const now = ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99, 1046.5];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + i * 0.06 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.18);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.22);
    });
  } catch {
    // Ignore
  }
}

// --- Message send/receive sound preferences (default: duck) ---
const SEND_SOUND_KEY = 'bakchod_sendSound';
const RECEIVE_SOUND_KEY = 'bakchod_receiveSound';
export type MessageSoundOption = 'duck' | 'classic' | 'none';

export function getSendSound(): MessageSoundOption {
  if (typeof window === 'undefined') return 'duck';
  const v = window.localStorage.getItem(SEND_SOUND_KEY);
  return (v === 'duck' || v === 'classic' || v === 'none') ? v : 'duck';
}

export function getReceiveSound(): MessageSoundOption {
  if (typeof window === 'undefined') return 'duck';
  const v = window.localStorage.getItem(RECEIVE_SOUND_KEY);
  return (v === 'duck' || v === 'classic' || v === 'none') ? v : 'duck';
}

export function setSendSound(value: MessageSoundOption): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SEND_SOUND_KEY, value);
}

export function setReceiveSound(value: MessageSoundOption): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RECEIVE_SOUND_KEY, value);
}

/** Duck-style "quack" sound: short descending tone + noise burst. */
export function playDuckSound(): void {
  if (typeof window === 'undefined') return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(380, now + 0.08);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.start(now);
    osc.stop(now + 0.14);
  } catch {
    // Ignore
  }
}

/** Play the configured send sound (duck by default). */
export function playSendSound(): void {
  const opt = getSendSound();
  if (opt === 'none') return;
  if (opt === 'duck') playDuckSound();
  else playMessageNotificationSound();
}

/** Play the configured receive sound (duck by default). */
export function playReceiveSound(): void {
  const opt = getReceiveSound();
  if (opt === 'none') return;
  if (opt === 'duck') playDuckSound();
  else playMessageNotificationSound();
}
