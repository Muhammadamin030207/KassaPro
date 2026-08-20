import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuthStore } from "../stores/authStore";

import { api } from "../api/client";
import { Modal } from "./Modal";
import { PhoneInputMask } from "./PhoneInputMask";
import { useToast } from "./Toast";
import { formatMoney } from "../utils/format";

const BRANDS = {
  payme: { label: "Payme", color: "#47C7FB" },
  click: { label: "Click", color: "#30C39E" },
  paynet: { label: "Paynet", color: "#E86A10" },
  visa: { label: "Visa", color: "#1A1F71" },
};

const DEFAULT_CARDS = {
  payme: "5614 6821 1575 9963",
  click: "8600 0000 0000 0000",
  paynet: "9860 0000 0000 0000",
  visa: "4916 9903 3779 9537",
};

/**
 * To'lov bottom-sheet modali — barcha usullar bittada:
 *   Naqd (mijoz bergan summa + qaytim), Karta, Click/Payme/Paynet (dinamik QR),
 *   Nasiya (mijoz qidirish/yaratish) — va katta yashil "TASDIQLASH" tugmasi.
 *
 * "TASDIQLASH" bosilganda `onConfirm({ method, customer, cashReceived, change })`
 * chaqiriladi; CashierPage keyingi qadamni (QR modali / bevosita checkout) o'zi hal qiladi.
 *
 * @param {{
 *   open: boolean,
 *   total: number,
 *   settings?: object,
 *   shopName?: string,
 *   initialMethod?: string,
 *   onConfirm: function,
 *   onClose: function,
 * }} props
 */
export function PaymentSheet({
  open,
  total = 0,
  settings = {},
  initialMethod = "cash",
  onConfirm,
  onClose,
}) {
  const [method, setMethod] = useState(initialMethod);
  const [given, setGiven] = useState("");

  // Nasiya — mijoz izlash / yangi yaratish
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [found, setFound] = useState(null);
  const [searching, setSearching] = useState(false);
  const [nasiyaMode, setNasiyaMode] = useState("search"); // search | create
  const [creating, setCreating] = useState(false);
  const [dueWeeks, setDueWeeks] = useState(1); // necha haftadan keyin muddat

  const user = useAuthStore((s) => s.user);
  const { show } = useToast();

  useEffect(() => {
    if (open) {
      setMethod(initialMethod);
      setGiven("");
      setPhone("");
      setCustomerName("");
      setFound(null);
      setNasiyaMode("search");
    }
  }, [open]);

  const cash = Number(given || 0);
  const change = Math.max(0, cash - total);
  const insufficient = method === "cash" && given !== "" && cash < total;

  const dueDateAt = (weeks) => {
    const d = new Date();
    d.setDate(d.getDate() + weeks * 7);
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  };
  const dueDate = dueDateAt(dueWeeks);
  const dueDate2 = dueDateAt(2);
  const dueDate4 = dueDateAt(4);

  // Nasiya rasmiylashtirish xulosasi
  const afterDebt = found ? Number(found.balance || 0) + total : total;
  const overLimit =
    found && Number(found.has_credit_limit) > 0 && afterDebt > Number(found.credit_limit || 0);

  const isOnline = ["click", "payme", "paynet", "visa"].includes(method);
  const amount = Math.round(total);
  const ord = Date.now();

  let qrValue = "";
  if (method === "payme" && settings.payme_merchant_id) {
    qrValue = `https://checkout.paycom.uz/${settings.payme_merchant_id}?amount=${amount}00&order_id=${ord}`;
  } else if (method === "click" && settings.click_merchant_id && settings.click_service_id) {
    qrValue = `https://my.click.uz/services/pay?merchant_id=${settings.click_merchant_id}&service_id=${settings.click_service_id}&amount=${amount}`;
  } else if (method === "paynet" && settings.paynet_merchant_id) {
    qrValue = `https://paynet.uz/pay/${settings.paynet_merchant_id}?amount=${amount}`;
  }
  const cardNumber =
    settings.qr_card_number || DEFAULT_CARDS[method] || "";
  const effectiveQr = qrValue || cardNumber.replace(/\s+/g, "");

  const lookup = async () => {
    if (!phone || phone.replace(/\D/g, "").length !== 12) return;
    setSearching(true);
    setFound(null);
    try {
      const data = await api.get(`customers/by-phone/${phone}/`);
      setFound(data);
      setNasiyaMode("search");
    } catch (err) {
      // Faqat 404 "topilmadi" — yangi mijoz formasi ochiladi.
      // Tarmoq/5xx xatosida mavjud mijoz topilmasa ham noto'g'ri oqimga o'tmaymiz.
      if (err.status !== 404) {
        show(err.message || "Mijozni qidirib bo'lmadi", "error");
        return;
      }
      setFound(null);
      setNasiyaMode("create");
    } finally {
      setSearching(false);
    }
  };

  const createCustomer = async () => {
    if (!customerName.trim()) {
      show("Mijoz ismini kiriting", "error");
      return false;
    }
    setCreating(true);
    try {
      const data = await api.post("customers/", {
        name: customerName.trim(),
        phone,
      });
      setFound(data);
      setNasiyaMode("search");
      return data;
    } catch (err) {
      // Telefon allaqachon boshqa ismli mijozga tegishli — duplikat yaratmaymiz,
      // mavjud mijozni qayta qidirib ko'rsatamiz.
      if (typeof err.message === "string" && err.message.includes("tegishli")) {
        show(err.message, "info");
        return lookup().then(() => null);
      }
      show(err.message || "Mijoz yaratishda xatolik", "error");
      return false;
    } finally {
      setCreating(false);
    }
  };

  const submit = () => {
    if (method === "cash" && insufficient) {
      show("Berilgan summa to'lovdan kam — qaytim manfiy bo'lishi mumkin emas", "error");
      return;
    }
    if (method === "nasiya") {
      const customer = found;
      if (!customer) {
        if (nasiyaMode === "create" && customerName.trim()) {
          // Yangi mijoz yaratib, shu zahoti davom etamiz
          createCustomer().then((created) => {
            if (created) {
              onConfirm({ method, customer: created, dueDate });
              onClose();
            }
          });
          return;
        }
        show("Nasiya uchun mijozni toping yoki yarating", "error");
        return;
      }
      onConfirm({ method, customer, dueDate });
      onClose();
      return;
    }
    onConfirm({ method, cashReceived: method === "cash" ? cash : undefined, change });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" sheet>
      <motion.div
        key={method}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
      >
        {/* 1. Jami summa */}
        <div className="pay-total-display" style={{ textAlign: "center", marginBottom: 18 }}>
          <div className="label">Jami summa</div>
          <motion.div
            key={Math.round(total)}
            className="amount mono"
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 0.35 }}
          >
            {formatMoney(total)}
          </motion.div>
          <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 6 }}>
            {user?.shop_name || "KassaPro"} · {new Date().toLocaleString("uz-UZ", { timeStyle: "short" })}
          </div>
        </div>

        {/* 2. To'lov usuli */}
        <div className="pay-row" style={{ marginBottom: 16 }}>
          <button className={`pay-btn ${method === "cash" ? "selected" : ""}`} onClick={() => setMethod("cash")}>
            💵 Naqd
          </button>
          <button className={`pay-btn ${method === "card" ? "selected" : ""}`} onClick={() => setMethod("card")}>
            💳 Karta
          </button>
          <button className={`pay-btn ${method === "click" ? "selected" : ""}`} onClick={() => setMethod("click")}>
            📱 Click
          </button>
          <button className={`pay-btn ${method === "payme" ? "selected" : ""}`} onClick={() => setMethod("payme")}>
            📱 Payme
          </button>
          {settings.paynet_merchant_id ? (
            <button className={`pay-btn ${method === "paynet" ? "selected" : ""}`} onClick={() => setMethod("paynet")}>
              📱 Paynet
            </button>
          ) : null}
          <button className={`pay-btn ${method === "visa" ? "selected" : ""}`} onClick={() => setMethod("visa")}>
            💳 Visa
          </button>
          <button className={`pay-btn ${method === "nasiya" ? "selected" : ""}`} onClick={() => setMethod("nasiya")}>
            📜 Nasiya (Qarz)
          </button>
        </div>

        <AnimatePresence mode="wait">
          {/* Naqd: berilgan summa + qaytim */}
          {method === "cash" && (
            <motion.div key="cash" className="sheet-block" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="grid-2">
                <div className="field">
                  <label>Mijoz bergan summa</label>
                  <input
                    className="input mono"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={given}
                    onChange={(e) => setGiven(e.target.value)}
                    placeholder={formatMoney(total)}
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label>Qaytim (sdacha)</label>
                  <div
                    className="mono"
                    style={{
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: "1px solid var(--line)",
                      background: change > 0 ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.04)",
                      color: change > 0 ? "#34d399" : "var(--ink-soft)",
                      fontWeight: 700,
                      fontSize: 22,
                    }}
                  >
                    {insufficient ? "−" + formatMoney(Math.abs(cash - total)) : formatMoney(change)}
                  </div>
                </div>
              </div>
              {insufficient && (
                <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8, textAlign: "center" }}>
                  Berilgan summa to'lovdan kam — qaytim chiqarib bo'lmaydi
                </div>
              )}
            </motion.div>
          )}

          {/* Atir/online: dinamik QR */}
          {isOnline && (
            <motion.div key="online" className="sheet-block" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="pay-qr-block">
                <div style={{ background: "#fff", padding: 10, borderRadius: 12 }}>
                  <QRCodeSVG value={effectiveQr || "0"} size={150} fgColor="#0f1115" />
                </div>
                <div className="pay-qr-txt">
                  <b style={{ display: "block", marginBottom: 4 }}>
                    {qrValue ? `${BRANDS[method].label} orqali o'tkazing` : "Karta raqamiga o'tkazing"}
                  </b>
                  {qrValue
                    ? `QR kod ${BRANDS[method].label} ilovasida skanerlanadi — summa avtomatik qo'yiladi.`
                    : "Karta raqamiga pul o'tkazing. To'lov kelgach TASDIQLASH tugmasini bosing."}
                </div>
              </div>
            </motion.div>
          )}

          {/* Nasiya: mijoz izlash / yaratish */}
          {method === "nasiya" && (
            <motion.div key="nasiya" className="sheet-block" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="field">
                <label>Mijoz telefoni</label>
                <PhoneInputMask value={phone} onChange={setPhone} autoFocus={false} />
              </div>
              <button
                className="btn btn-primary"
                style={{ width: "100%", marginTop: 8 }}
                onClick={lookup}
                disabled={searching || !phone || phone.replace(/\D/g, "").length !== 12}
              >
                {searching ? "Qidirilmoqda..." : "Raqam bo'yicha qidirish"}
              </button>

              {nasiyaMode === "search" && found && (
                <div className="glass-panel" style={{ marginTop: 12, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{found.name}</div>
                      <div className="mono sub">{found.phone}</div>
                    </div>
                  </div>
                  <div className="nasiya-summary" style={{ marginTop: 12 }}>
                    <div className="flex spread">
                      <span className="sub">Joriy qarzi</span>
                      <b className="mono" style={{ color: Number(found.balance) > 0 ? "var(--warn)" : "var(--success)" }}>
                        {formatMoney(found.balance)}
                      </b>
                    </div>
                    <div className="flex spread">
                      <span className="sub">Kredit limiti</span>
                      <b className="mono">{formatMoney(found.credit_limit)}</b>
                    </div>
                    <div className="flex spread">
                      <span className="sub">Limit bo'sh</span>
                      <b className="mono" style={{ color: "var(--brand-light)" }}>{formatMoney(found.credit_available)}</b>
                    </div>
                    <div className="flex spread">
                      <span className="sub">Nasiyadan so'ng</span>
                      <b className="mono" style={{ color: overLimit ? "var(--danger)" : "var(--ink)" }}>
                        {formatMoney(afterDebt)}
                      </b>
                    </div>
                    {overLimit && (
                      <div className="sub" style={{ color: "var(--danger)", marginTop: 8 }}>
                        Diqqat: bu mijoz kredit limitidan oshadi. Owner tasdiqlamasa, nasiya qabul qilinmaydi.
                      </div>
                    )}
                  </div>
                  <div className="field" style={{ marginTop: 12 }}>
                    <label>To'lov muddati</label>
                    <select className="input" value={dueWeeks} onChange={(e) => setDueWeeks(Number(e.target.value))}>
                      <option value={1}>1 hafta ({dueDate})</option>
                      <option value={2}>2 hafta ({dueDate2})</option>
                      <option value={4}>1 oy ({dueDate4})</option>
                    </select>
                  </div>
                </div>
              )}

              {nasiyaMode === "create" && !found && (
                <div style={{ marginTop: 12 }}>
                  <div className="sub" style={{ color: "var(--ink-faint)", marginBottom: 8 }}>
                    Bu raqam bo'yicha mijoz topilmadi. Yangi mijoz sifatida qo'shamizmi?
                  </div>
                  <div className="field">
                    <label>Mijoz ismi</label>
                    <input
                      className="input"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Masalan: Asatova Nilufar"
                    />
                  </div>
                  <button
                    className="btn btn-accent"
                    style={{ width: "100%" }}
                    onClick={createCustomer}
                    disabled={creating || !customerName.trim()}
                  >
                    {creating ? "Saqlanmoqda..." : "Yangi mijoz yaratish"}
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 3. TASDIQLASH */}
        <motion.button
          className="btn pay-confirm"
          onClick={submit}
          animate={insufficient ? { x: [0, -6, 6, -4, 4, 0] } : {}}
          transition={{ duration: 0.4 }}
        >
          ✓ TASDIQLASH VA CHEK CHIQARISH · {formatMoney(total)}
        </motion.button>
      </motion.div>
    </Modal>
  );
}

export default PaymentSheet;