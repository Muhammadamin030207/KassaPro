import { forwardRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { formatMoney } from "../utils/format";

const PAY_NAMES = { cash: "Naqd", card: "Karta", click: "Click", payme: "Payme", visa: "Visa" };

/** Kodni 1D barcode ko'rinishidagi chiziqlarga aylantiradi (faqat ko'rinish uchun). */
function barcodeBars(code) {
  const seed = String(code || "SMART").split("").map((c) => c.charCodeAt(0));
  let bars = "";
  seed.forEach((n, i) => {
    const w = 1 + (n % 3); // 1..3 mm kenglik
    bars += `#000 0 ${0.6 * w}mm, transparent ${0.6 * w}mm ${0.6 * (w + 1)}mm, `;
  });
  return bars;
}

/**
 * Chop etiladigan chek — termal printerga ideal chiqadigan dizayn.
 * `window.print()` bilan chop etiladi (CSS `@media print` qoidalariga tayanadi).
 *
 * @param {{ sale: object, shopName?: string, cashierName?: string }} props
 */
export const ReceiptPrint = forwardRef(function ReceiptPrint(
  { sale, shopName = "KassaPro", cashierName = "" },
  ref
) {
  const payName = PAY_NAMES[sale?.payment_method] || sale?.payment_method;
  const created = sale?.created_at ? new Date(sale.created_at) : new Date();
  const id = sale?.id ? String(sale.id).padStart(6, "0") : "";
  const itemsFingerprint = `${id}${sale?.total || 0}`;
  const shopsave = (shopName || "KassaPro").toUpperCase();
  // Soliq/keshbek QR — fiskal keshbek tizimi uchun (my.soliq.uz / keshbek)
  const taxQr = `https://soliq.uz/tmc/${id}?total=${sale?.total || 0}`;

  return (
    <div className="print-receipt" ref={ref}>
      <div className="pr-head">
        <div className="pr-name">{shopsave}</div>
        <div className="pr-brand">KASSAPRO · KASSA TIZIMI</div>
      </div>
      <div className="pr-divider" />
      <div className="pr-row">
        <span>№ {id}</span>
        <span>
          {created.toLocaleDateString("uz-UZ")} {created.toLocaleTimeString("uz-UZ")}
        </span>
      </div>
      <div className="pr-row">
        <span className="pr-label">Kassir:</span>
        <span>{cashierName}</span>
      </div>
      <div className="pr-divider" />

      <div className="pr-table">
        {(sale?.items || []).map((it, i) => (
          <div className="pr-item" key={it.id || i}>
            <div className="pr-item-name">{it.product_name}</div>
            <div className="pr-row">
              <span>
                {it.qty} x {formatMoney(it.price_snapshot)}
              </span>
              <span>{formatMoney(it.subtotal)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="pr-total-row pr-row">
        <span>JAMI</span>
        <span className="pr-total">{formatMoney(sale?.total)}</span>
      </div>
      <div className="pr-row" style={{ marginTop: "1mm" }}>
        <span className="pr-label">To'lov:</span>
        <span>{payName}</span>
      </div>

      <div className="pr-divider" />
      <div className="pr-code-bars" style={{ backgroundImage: `repeating-linear-gradient(90deg, ${barcodeBars(itemsFingerprint)}#000 0 0.7mm, transparent 0.7mm 1.6mm)` }} />
      <div className="pr-code-text">{itemsFingerprint}</div>

      {/* Soliq/keshbek QR — skanerlaganda keshbek qaytariladi */}
      <div className="pr-taxq">
        <div className="pr-taxq-inner">
          <QRCodeSVG value={taxQr} size={92} fgColor="#000" bgColor="#fff" />
          <div className="pr-taxq-txt">
            <b>KESHBЕК / SOLIQ</b>
            <span>Skanerlab pulingizni qaytaring</span>
          </div>
        </div>
      </div>

      <div className="pr-priv" style={{ textAlign: "center", fontSize: 9, color: "#777", marginTop: "1mm" }}>
        Ushbu chek kassa jihozining esdalik hujjati hisoblanadi
      </div>

      <div className="pr-foot">
        <div className="pr-thanks">XUSH KELIBSIZ!</div>
        <div>kassapro.uz · {shopsave}</div>
      </div>
    </div>
  );
});

export default ReceiptPrint;