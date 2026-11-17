export type ScanToneKind = 'ENTRY' | 'EXIT' | 'UNKNOWN';

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedAudioCtx) {
    try {
      sharedAudioCtx = new AudioCtx();
    } catch {
      return null;
    }
  }
  return sharedAudioCtx;
}

/**
 * Unlocks/resumes browser audio on any user interaction so automatic USB Serial
 * RFID scans can play confirmation and warning tones without browser blocking.
 */
export function unlockAudioContext(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

function scheduleTone(
  ctx: AudioContext,
  freq: number,
  startOffsetSec: number,
  durationSec: number,
  type: OscillatorType,
  peakGain: number
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const startAt = ctx.currentTime + startOffsetSec;
  const stopAt = startAt + durationSec;

  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startAt);
  osc.stop(stopAt + 0.02);
}

function playToneSequence(ctx: AudioContext, kind: ScanToneKind): void {
  if (kind === 'ENTRY') {
    // Bright ascending gate chime
    scheduleTone(ctx, 880, 0, 0.09, 'sine', 0.22);
    scheduleTone(ctx, 1174.66, 0.09, 0.16, 'sine', 0.24);
  } else if (kind === 'EXIT') {
    // Clean descending exit chime
    scheduleTone(ctx, 880, 0, 0.09, 'sine', 0.2);
    scheduleTone(ctx, 659.25, 0.09, 0.16, 'sine', 0.22);
  } else {
    // Distinct warning double-beep for unregistered / unknown RFID cards
    scheduleTone(ctx, 330, 0, 0.16, 'triangle', 0.3);
    scheduleTone(ctx, 240, 0.2, 0.26, 'triangle', 0.32);
  }
}

export function playCardReadTone(kind: ScanToneKind): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx
      .resume()
      .then(() => {
        playToneSequence(ctx, kind);
      })
      .catch(() => {});
    return;
  }

  playToneSequence(ctx, kind);
}
