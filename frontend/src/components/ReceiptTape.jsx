import { AnimatePresence, motion } from "framer-motion";
import { formatMoney } from "../utils/format";
import { useCartStore } from "../stores/cartStore";
import { useAuthStore } from "../stores/authStore";

const EMPTY_NOTE = window.innerWidth > 768
  ? "Shtrix kodni skanerlang yoki maydonga yozing"
  : "Kodni skanerlang";

/**
 * "Chek lentasi" — kassadagi savat, qog'oz chekka o'xshash chizilgan.
 * Qog'oz qirrasi (sawtooth) + mahsulot qo'shilganda slide-in + qty stepper + bekor tugmasi.
 *
 * @param {{ onEmptyAction?: function }} props
 */
export function ReceiptTape({ onEmptyAction }) {
  const items = useCartStore((s) => s.items);
  const setQty = useCartStore((s) => s.setQty);
  const removeItem = useCartStore((s) => s.removeItem);
  const total = useCartStore((s) => s.items.reduce((sum, it) => sum + it.price * it.qty, 0));
  const shopName = useAuthStore((s) => s.user?.shop_name);
  const cashier = useAuthStore((s) => s.user?.username);

  return (
    <div className="receipt-tape">
      <span className="sawtooth" />
      <div className="receipt-head">
        <h3>{shopName || "SmartKassa"}</h3>
        <div className="store">smart-kassa.cn</div>
        <div className="meta">
          #{new Date().toLocaleString("uz-UZ", { dateStyle: "short", timeStyle: "short" })}
          {" · "}Kassir: {cashier}
        </div>
      </div>

      <div className="receipt-items">
        {items.length === 0 && (
          <div className="receipt-empty">
            <span className="emoji">🧾</span>
            {EMPTY_NOTE}
            <br />
            <span style={{ fontSize: 12 }}>— chek hali bo'sh —</span>
            {onEmptyAction && (
              <div style={{ marginTop: 14 }}>
                <button className="btn btn-ghost" onClick={onEmptyAction}>
                  + Tezkor qo'shish
                </button>
              </div>
            )}
          </div>
        )}

        <AnimatePresence initial={false}>
          {items.map((it) => (
            <ReceiptRow
              key={it.product_id}
              item={it}
              bump={it.qty > 1}
              onDec={() => setQty(it.product_id, it.qty - 1)}
              onInc={() => setQty(it.product_id, it.qty + 1)}
              onRemove={() => removeItem(it.product_id)}
            />
          ))}
        </AnimatePresence>
      </div>

      <div className="receipt-total">
        <span>JAMI</span>
        <span className="amount mono">{formatMoney(total)}</span>
      </div>

      <div className="receipt-actions">
        <div
          style={{
            textAlign: "center",
            fontSize: 9.5,
            letterSpacing: "0.2em",
            color: "#b9b09a",
            fontFamily: "var(--font-mono)",
          }}
        >
          * * * * * * * * * * * * * *
        </div>
      </div>
    </div>
  );
}

function ReceiptRow({ item, bump, onDec, onInc, onRemove }) {
  return (
    <motion.div
      className="receipt-row"
      initial={{ opacity: 0, x: -28 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20, height: 0, padding: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      layout
    >
      <motion.span
        className="qty"
        key={item.qty}
        initial={{ scale: 1.6, color: "#FF8A3D" }}
        animate={{ scale: 1, color: "#0E7C5A" }}
        transition={{ type: "spring", stiffness: 520, damping: 20 }}
      >
        ×{item.qty}
      </motion.span>
      <span className="name">{item.name}</span>
      <div className="row-controls">
        <button className="row-btn minus" onClick={onDec} title="Kamaytirish" aria-label="Kamaytirish">−</button>
        <button className="row-btn plus" onClick={onInc} title="Oshirish" aria-label="Oshirish">+</button>
        <button className="row-btn remove" onClick={onRemove} title="Bekor qilish" aria-label="Bekor qilish">✕</button>
        <span className="price mono">{formatMoney(item.price * item.qty)}</span>
      </div>
    </motion.div>
  );
}

export default ReceiptTape;