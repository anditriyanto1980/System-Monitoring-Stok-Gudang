/**
 * Web Audio API synthesizer for stock alerts
 * Zero external audio files required, fast, works across desktop and mobile.
 */

export function playStockAlertSound(type: 'warning' | 'critical' = 'warning'): void {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    if (type === 'critical') {
      // 2 short crisp attention-grabbing beeps (Habis / Nol)
      const playBeep = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration);
      };
      playBeep(880, 0, 0.12);
      playBeep(1174, 0.16, 0.22);
    } else {
      // Elegant pleasant double chime (Kritis / Menipis)
      const playChime = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration);
      };
      playChime(784, 0, 0.25); // G5
      playChime(1046, 0.15, 0.35); // C6
    }
  } catch (err) {
    console.warn('Audio alert notification not supported or blocked by browser policy:', err);
  }
}
