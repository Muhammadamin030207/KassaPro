/**
 * Barcode skaner ovozlari — Web Audio API, autoplay xavfsiz.
 *
 * Bitta AudioContext qayta ishlatiladi (faqat foydalanuvchi interaction'dan
 * keyin faollashadi). Master DynamicsCompressor orqali ovoz baland, lekin
 * headroom saqlangan — klip qilmaydi.
 *
 * SUCCESS: haqiqiy kassa skaneri kabi "CHIT-CHIT" — ikkita baland, o'tkir,
 * qisqa beep. ERROR: past-ohangli ikki "vu-vu".
 */

let _ctx = null;
let _master = null;

function ensureCtx() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!_ctx) {
    _ctx = new AC();
    // Master limiter: baland ovoz, lekin kesilish (clip) bo'lmaydi.
    _master = _ctx.createDynamicsCompressor();
    _master.threshold.value = -12;
    _master.knee.value = 8;
    _master.ratio.value = 8;
    _master.attack.value = 0.002;
    _master.release.value = 0.05;
    _master.connect(_ctx.destination);
  }
  if (_ctx.state === "suspended") _ctx.resume().catch(() => {});
  return _ctx;
}

/**
 * Bitta beep — o'tkir (square), tez chiqadigan va sokin o'chuvchi.
 * freq -> fEnd — mikro "chirp" siljishi (chunki real skaner shunday eshitiladi).
 */
function beep({ t, freq, fEnd = freq, dur = 0.06, vol = 0.6, type = "square" }) {
  const ctx = ensureCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1800; // past shovqinni kesadi, o'tkirlik qoldiradi
  osc.type = type;
  const end = t + dur;
  osc.frequency.setValueAtTime(freq, t);
  if (fEnd !== freq) osc.frequency.exponentialRampToValueAtTime(fEnd, end);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(vol * 0.6, t + dur * 0.55);
  gain.gain.exponentialRampToValueAtTime(0.0001, end - 0.004);
  osc.connect(hp);
  hp.connect(gain);
  gain.connect(_master || ctx.destination);
  osc.start(t);
  osc.stop(end);
}

/** Muvaffaqiyatli skan — "CHIT-CHIT": ikkita baland qisqa beep (≈340ms). */
export function playBarcodeSuccess() {
  const ctx = ensureCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const f = 2900; // haqiqiy skaner ohangi (2.4–3.2kHz oralig'ida)
  beep({ t: now, freq: f, fEnd: f * 1.12, dur: 0.065, vol: 0.65 });
  beep({ t: now + 0.115, freq: f, fEnd: f * 1.08, dur: 0.09, vol: 0.62 });
}

/** Mahsulot topilmadi — past "vu-vu" (SUCCESS "CHIT-CHIT" chiqmaydi). */
export function playBarcodeError() {
  const ctx = ensureCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  beep({ t: now, freq: 740, fEnd: 620, dur: 0.12, vol: 0.5, type: "triangle" });
  beep({ t: now + 0.16, freq: 620, fEnd: 520, dur: 0.16, vol: 0.45, type: "triangle" });
}

export default {
  playBarcodeSuccess,
  playBarcodeError,
};