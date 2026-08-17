import { QRCodeSVG } from "qrcode.react";
import { motion } from "framer-motion";
import { Modal } from "./Modal";
import { formatMoney } from "../utils/format";

/**
 * Payme/Click to'lov modali — QR kod + karta raqami ko'rsatiladi.
 * "Tasdiqlash" bosilganda sotuv yakunlanadi.
 *
 * @param {{
 *   open: boolean,
 *   method: string,
 *   total: number,
 *   saleId?: string|number,
 *   shopName?: string,
 *   onConfirm: function,
 *   onClose: function,
 * }} props
 */
export function PaymentModal({ open, method, total = 0, saleId, shopName, onConfirm, onClose }) {
  const isPayme = method === "payme";
  const isClick = method === "click";
  const isVisa = method === "visa";
  const brand = isPayme ? "Payme" : isClick ? "Click" : "Visa";
  const brandColor = isPayme ? "#47C7FB" : isClick ? "#30C39E" : "#1A1F71";

  // Karta to'lov raqamlari — QR ham shu kartaga pul tushish uchun
  const cardNumber = isVisa ? "4916 9903 3779 9537" : "5614 6821 1575 9963";
  const cardDigits = cardNumber.replace(/\s+/g, "");
  const holder = "ASATOVA NILUFAR";
  const qrValue = cardDigits;

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <motion.div
        key={method + total}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
      >
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <h3>{brand} orqali to'lov</h3>
          <div className="sub" style={{ color: "var(--ink-soft)", fontSize: 13, marginTop: 6 }}>
            Skaner orqali yoki karta raqamini qo'lda kiriting
          </div>
        </div>

        {/* 3D karta */}
        <motion.div
          initial={{ rotateY: -18, opacity: 0 }}
          animate={{ rotateY: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.1 }}
          style={{
            background: `linear-gradient(135deg, ${brandColor}, #0e7c5a)`,
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
            <span style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 17, letterSpacing: "0.04em" }}>{brand}</span>
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
            <QRCodeSVG value={qrValue} size={140} fgColor="#0b1110" />
          </div>
          <div className="pay-qr-txt">
            <b style={{ color: "var(--ink)", display: "block", marginBottom: 4 }}>
              {brand} orqali o'tkazing
            </b>
            Karta raqamiga pul o'tkazing yoki QR kodni {isVisa ? "bank ilovasida" : isPayme ? "Payme" : "Click"} ilovasida skanerlang.
            To'lov kelgach quyidagi tugmani bosing.
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