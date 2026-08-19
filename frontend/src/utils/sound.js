/**
 * Barcode skaner ovozlari — Web Audio API orqali, autoplay xavfsiz.
 *
 * Har skan uchun yangi AudioContext YARALMAYDI — bitta kontekst qayta
 * ishlatiladi. AudioContext faqat foydalanuvchi interaction'idan keyin
 * (autoplay policy) faollashadi; ishlamasa ovoz jin bo'lib qoladi.
 */

let _ctx = null;

function ensureCtx() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!_ctx) _ctx = new AC();
  if (_ctx.state === "suspended") _ctx.resume().catch(() => {});
  return _ctx;
}

/** Muvaffaqiyatli skan — qisqa, professional "CHIK" (≈120ms, baland emas). */
export function playBarcodeSuccess() {
  const ctx = ensureCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1046.5, now); // C6
  osc.frequency.setValueAtTime(1568, now + 0.045); // G6 — "chik" effekti
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.17, now + 0.012);
  gain.gain.setValueAtTime(0.17, now + 0.045);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.13);
}

/** Mahsulot topilmadi — past warning (SUCCESS "CHIK" chiqmaydi). */
export function playBarcodeError() {
  const ctx = ensureCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.setValueAtTime(196, now + 0.12);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.09, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.24);
}

export default {
  playBarcodeSuccess,
  playBarcodeError,
};