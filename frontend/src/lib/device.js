const DEVICE_KEY = "smartkassa-device";

const TYPE_LABELS = {
  laptop: "Laptop",
  desktop: "Desktop",
  tablet: "Tablet",
  phone: "Smartphone",
};

/** Persistent device_id — browser/installation uchun UUID v4. Logout'da o'chmaydi. */
export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = generateUuid();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

/**
 * Qurilma turini best-effort aniqlash (laptop/desktop/tablet/phone).
 * Faqat metadata — xavfsizlik qatlami emas (server session_id + status bilan tekshiradi).
 */
export function detectDeviceType() {
  try {
    const uad = navigator.userAgentData;
    if (uad && uad.mobile) {
      return typeof screen !== "undefined" && screen.width >= 768 ? "tablet" : "phone";
    }
  } catch {
    /* ignore */
  }
  const ua = navigator.userAgent || "";
  if (/iPad|Tablet|Silk/i.test(ua)) return "tablet";
  if (/Mobi|Android/i.test(ua)) return "phone";
  if (typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1) {
    return typeof screen !== "undefined" && screen.width >= 768 ? "tablet" : "phone";
  }
  // Brauzer laptop/desktopni ajrata olmaydi; no-touch qurilmalar odatda noutbuk.
  return "laptop";
}

/**
 * Haqiqiy qurilma modeli — high-entropy Client Hints orqali best-effort.
 * Faqat brauzer BERADIGAN aniqlik ishlatiladi; hech qachon yasama model
 * yaratilmaydi. Aniqlanmasa bo'sh qaytariladi (backend "Model aniqlanmadi" ko'rsatadi).
 */
export async function getDeviceModel() {
  try {
    const uad = navigator?.userAgentData;
    if (uad && typeof uad.getHighEntropyValues === "function") {
      const hints = await uad.getHighEntropyValues(["model", "platformVersion"]);
      if (hints && hints.model) return String(hints.model).trim().slice(0, 255);
    }
  } catch {
    /* ignore */
  }
  return "";
}

/** Qurilma nomi: "{username}'s Laptop" — hostname brauzer orqali olinmaydi. */
export function getDeviceName(username, deviceType) {
  const label = TYPE_LABELS[deviceType] || "Qurilma";
  const base = (username || "").trim() || "Foydalanuvchi";
  const pretty = `${base.charAt(0).toUpperCase()}${base.slice(1)}`;
  return `${pretty}'s ${label}`.slice(0, 255);
}

function generateUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}