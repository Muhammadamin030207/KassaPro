import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { api } from "../api/client";
import { useToast } from "./Toast";
import { Modal } from "./Modal";
import Icon from "./Icon";
import { formatDateTime, formatMoney } from "../utils/format";

/**
 * Qarz uchun to'lov modal — yagona to'lov flow.
 * To'liq to'lovda "QARZ YOPILDI" muvaffaqiyat ekrani ko'rsatiladi.
 *
 * @param {{ debt: object|null, open: boolean, onClose: () => void, onPaid: (result: object) => void }} props
 */
export function DebtPaymentModal({ debt, open, onClose, onPaid }) {
  const { show } = useToast();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState(null);

  const remaining = Number(debt?.remaining_amount || 0);
  const fullyPaid = !!result && Number(result.remaining_amount) <= 0;

  useEffect(() => {
    if (open) {
      setAmount("");
      setMethod("cash");
      setNote("");
      setResult(null);
      setPaying(false);
    }
  }, [open]);

  const close = () => {
    if (paying) return;
    onClose();
  };

  const submit = async () => {
    const value = Number(amount);
    if (!value || value <= 0) {
      show("To'lov miqdorini kiriting", "error");
      return;
    }
    if (value > remaining) {
      show(`To'lov summasi qolgan qarzdan oshib ketdi. Qolgan qarz: ${formatMoney(remaining)}`, "error");
      return;
    }
    setPaying(true);
    try {
      const res = await api.post(`debts/${debt.id}/payments/`, {
        amount: value,
        payment_method: method,
        note,
      });
      setResult(res);
      onPaid(res);
    } catch (err) {
      show(err.message, "error");
    } finally {
      setPaying(false);
    }
  };

  const closeAfterPaid = () => {
    onClose();
  };

  return (
    <Modal open={open} onClose={close}>
      {!result ? (
        <AnimatePresence mode="wait">
          <motion.div key="pay" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <h3>Qarz to'lovi</h3>
            <div className="sub" style={{ marginBottom: 16 }}>
              {debt?.customer_name} · <span className="mono">{debt?.customer_phone}</span> — qolgan qarz{" "}
              <b className="mono" style={{ color: "var(--warn)" }}>{formatMoney(remaining)}</b>
            </div>

            <div className="quick-amounts" style={{ marginBottom: 14 }}>
              {[0.25, 0.5, 0.75, 1].map((f) => (
                <button
                  key={f}
                  className={`btn btn-sm ${f === 1 ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setAmount(String(Math.max(1, Math.round(remaining * f))))}
                >
                  {f === 1 ? "To'liq" : `${f * 100}%`}
                </button>
              ))}
            </div>

            <div className="field">
              <label>To'lov miqdori (so'm)</label>
              <input
                className="input mono"
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Qolgan qarzdan oshmasligi kerak"
              />
            </div>
            <div className="field">
              <label>To'lov usuli</label>
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="cash">Naqd</option>
                <option value="card">Karta</option>
                <option value="mixed">Aralash</option>
              </select>
            </div>
            <div className="field">
              <label>Izoh (ixtiyoriy)</label>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Masalan: 2-qism to'lov" />
            </div>
            <div className="grid-2">
              <button className="btn btn-ghost" onClick={close} disabled={paying}>
                Bekor qilish
              </button>
              <button className="btn btn-primary" disabled={paying} onClick={submit}>
                <Icon name="check" /> {paying ? "Saqlanmoqda..." : Number(amount) >= remaining ? "To'liq yopish" : "To'lovni qabul etish"}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          style={{ textAlign: "center", padding: "6px 0 2px" }}
        >
          <motion.div
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 240, damping: 14 }}
            style={{
              width: 64,
              height: 64,
              margin: "0 auto 14px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #6366f1, #818cf8)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="check" size={30} />
          </motion.div>
          <h3>{fullyPaid ? "QARZ YOPILDI" : "To'lov qabul qilindi"}</h3>
          <div className="sub" style={{ color: "var(--ink-soft)", margin: "10px 0 16px" }}>
            <div>Mijoz: <b style={{ color: "var(--ink)" }}>{result.customer_name}</b></div>
            <div>To'lov: <b className="mono">{formatMoney(result.paid_amount)}</b></div>
            {fullyPaid ? (
              <div style={{ color: "var(--success)", marginTop: 6 }}>
                ✓ Qoldiq: 0 so'm — qarz tarixga o'tdi
              </div>
            ) : (
              <div>
                Qoldiq: <b className="mono" style={{ color: "var(--warn)" }}>{formatMoney(result.remaining_amount)}</b>
              </div>
            )}
            {result.paid_at && (
              <div style={{ marginTop: 6 }}>
                Yopilgan: <span className="mono">{formatDateTime(result.paid_at)}</span>
              </div>
            )}
          </div>
          <button className="btn btn-accent btn-lg btn-block" onClick={closeAfterPaid}>
            Yopish
          </button>
        </motion.div>
      )}
    </Modal>
  );
}

export default DebtPaymentModal;