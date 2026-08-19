/** Sonlarni 'sum' formatida chiqarish. */
export function formatMoney(n) {
  const v = Number(n || 0);
  return `${v.toLocaleString("uz-UZ", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} so'm`;
}

/**
 * Miqdor (dona) formatlash — butun son bo'lsa '1', kasr bo'lsa '2.5'.
 * '1.00' → '1' (Decimal string'lardan yuqoriga chiqishni tozalaydi).
 */
export function formatQty(n) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v === 0) return "0";
  if (Number.isInteger(v)) return String(v);
  return String(v.toFixed(2)).replace(/\.?0+$/, "");
}

/** Sana/vaqtni formatlash. */
export function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("uz-UZ", { dateStyle: "medium", timeStyle: "short" });
}

/** Bugungi sanani YYYY-MM-DD ko'rinishida. */
export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

/** n kun oldingi sanani YYYY-MM-DD ko'rinishida. */
export function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export default { formatMoney, formatQty, formatDateTime, todayISO, daysAgoISO };