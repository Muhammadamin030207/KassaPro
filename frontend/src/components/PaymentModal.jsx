import { QRCodeSVG } from "qrcode.react";
import { motion } from "framer-motion";
import { Modal } from "./Modal";
import { formatMoney } from "../utils/format";

const BRANDS = {
  payme: { label: "Payme", color: "#47C7FB" },
  click: { label: "Click", color: "#30C39E" },
  paynet: { label: "Paynet", color: "#E86A10" },
  visa: { label: "Visa", color: "#1A1F71" },
};

const DEFAULT_CARDS = {
  payme: "5614 6821 1575 9963",
  click: "5600 0004 6646 4473",
  paynet: "9860 0103 4291 8749",
  visa: "4916 9903 3779 9537",
};

/**
 * To'lov QR + karta modali.
 *
 * - Agar do'kon sozlamalarida merchant ID ko'rsatilgan bo'lsa — dinamik QR
 *   (Payme: checkout.paycom.uz, Click: my.click.uz, Paynet: paynet.uz).
 * - Aks holda karta raqamiga QR tushadi (skaner orqali pul o'tkazish).
 *
 * @param {{
 *   open: boolean,
 *   method: string,
 *   total: number,
 *   saleId?: string|number,
 *   orderId?: string|number,
 *   settings?: object,
 *   shopName?: string,
 *   onConfirm: function,
 *   onClose: function,
 * }} props
 */
export function PaymentModal({ open, method, total = 0, saleId, orderId, settings = {}, shopName, onConfirm, onClose }) {
  const brand = BRANDS[method];
  if (!brand) return null;

  const { label, color } = brand;
  const isVisa = method === "visa";
  const amount = Math.round(Number(total) || 0);
  const ord = orderId ?? saleId ?? "";

  // Dinamik QR (agar merchant ID sozlangan bo'lsa)
  let qrValue = "";
  if (method === "payme" && settings.payme_merchant_id) {
    qrValue = `https://checkout.paycom.uz/${settings.payme_merchant_id}?amount=${amount}00&order_id=${ord}`;
  } else if (method === "click" && settings.click_merchant_id && settings.click_service_id) {
    qrValue = `https://my.click.uz/services/pay?merchant_id=${settings.click_merchant_id}&service_id=${settings.click_service_id}&amount=${amount}`;
  } else if (method === "paynet" && settings.paynet_merchant_id) {
    qrValue = `https://paynet.uz/pay/${settings.paynet_merchant_id}?amount=${amount}`;
  }

  // Agar merchant yo'q bo'lsa — karta raqamiga QR
  const cardNumber = settings.qr_card_number || (isVisa ? DEFAULT_CARDS.visa : settings[`${method}_card`] || DEFAULT_CARDS[method]);
  const effectiveQr = qrValue || cardNumber.replace(/\s+/g, "");
  const holder = settings.qr_holder || "ASATOVA NILUFAR";

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <motion.div
        key={method + total}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
      >
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <h3>{label} orqali to'lov</h3>
          <div className="sub" style={{ color: "var(--ink-soft)", fontSize: 13, marginTop: 6 }}>
            {qrValue
              ? "QR kodni ilovada skanerlang yoki ushbu ilovada otqazing"
              : "Skaner orqali yoki karta raqamini qo'lda kiriting"}
          </div>
        </div>

        {/* 3D karta */}
        <motion.div
          initial={{ rotateY: -18, opacity: 0 }}
          animate={{ rotateY: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.1 }}
          style={{
            background: `linear-gradient(135deg, ${color}, #4338ca)`,
            borderRadius: 20,
            padding: "22px 24px",
            color: "#fff",
            boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
            transformStyle: "preserve-3d",
            position: "relative",
            overflow: "hidden",
            maxWidth: 420,
            margin: "0 auto",
          }}
        >
          <div style={{ position: "absolute", right: -40, top: -50, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.12)" }} />
          <div style={{ position: "absolute", right: 20, bottom: -60, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.1)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 17, letterSpacing: "0.04em" }}>{label}</span>
            <span style={{ fontSize: 11, opacity: 0.85 }}>{shopName || "KassaPro"}</span>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 21, letterSpacing: "0.1em", margin: "22px 0 14px" }}>
            {cardNumber}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <span style={{ fontSize: 11, opacity: 0.9 }}>{holder}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700 }}>{formatMoney(total)}</span>
          </div>
        </motion.div>

        {/* QR kod */}
        <div className="pay-qr-block">
          <div style={{ background: "#fff", padding: 12, borderRadius: 12, boxShadow: "var(--shadow-md)" }}>
            <QRCodeSVG value={effectiveQr} size={140} fgColor="#0f1115" />
          </div>
          <div className="pay-qr-txt">
            <b style={{ color: "var(--ink)", display: "block", marginBottom: 4 }}>
              {qrValue ? `${label} orqali o'tkazing` : "Karta raqamiga o'tkazing"}
            </b>
            {qrValue
              ? `QR kod ${label} ilovasida skanerlanadi, summa avtomatik: ${formatMoney(total)}. To'lov kelgach tasdiqlash tugmasini bosing.`
              : `Karta raqamiga pul o'tkazing yoki QR kodni ${label} ilovasida skanerlang. To'lov kelgach quyidagi tugmani bosing.`}
          </div>
        </div>

        <div className="grid-2">
          <button className="btn btn-ghost" onClick={onClose} disabled={!onClose}>
            Bekor qilish
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            ✓ To'lov tasdiqlandi
          </button>
        </div>
      </motion.div>
    </Modal>
  );
}

export default PaymentModal;