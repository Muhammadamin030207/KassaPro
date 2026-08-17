import { useEffect, useRef } from "react";

/**
 * Shtrix kod skaneri yoki klaviaturani tinglaydi.
 * Skaner klaviatura kabi ishlaydi: tez ketma-ket raqamlar + Enter.
 *
 * Yig'ilgan satr Enter bosilganda `onScan(code)` bilan chaqiriladi.
 * Ikki klavish orasidagi uzoq pauza yig'ishni tozalaydi.
 *
 * @param {function(string): void} onScan - kod olganda chaqiriladi
 * @param {object} [opts]
 * @param {boolean} [opts.disabled=false] - tinglashni o'chirish
 */
export function useBarcodeScanner(onScan, opts = {}) {
  const buffer = useRef("");
  const lastKeyTime = useRef(0);
  const cb = useRef(onScan);
  cb.current = onScan;

  useEffect(() => {
    if (opts.disabled) return undefined;

    const handler = (e) => {
      // Modal tuzoqmasin — faqat oddiy klavishlar
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const now = Date.now();
      const el = e.target;
      const inInput = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

      // Agar foydalanuvchi oddiy maydonda yozayotgan bo'lsa, tinglashni tark etamiz,
      // chunki boshqa sahifadagi skaner uchun kerak emas.
      if (inInput) return;

      if (e.key === "Enter") {
        const code = buffer.current.trim();
        buffer.current = "";
        if (code) cb.current(code);
        return;
      }

      // Skaner yozish tezligi ~ keyin PAYS lag ≈ <50ms
      if (now - lastKeyTime.current > 80 && buffer.current) buffer.current = "";
      lastKeyTime.current = now;

      if (e.key.length === 1) buffer.current += e.key;
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [opts.disabled]);
}

export default useBarcodeScanner;