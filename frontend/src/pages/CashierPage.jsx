import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { api } from "../api/client";
import { useAuthStore } from "../stores/authStore";
import { useCartStore } from "../stores/cartStore";
import { useToast } from "../components/Toast";
import { Modal } from "../components/Modal";
import { ReceiptTape } from "../components/ReceiptTape";
import { ReceiptPrint } from "../components/ReceiptPrint";
import { CameraScannerModal } from "../components/CameraScannerModal";
import { SuccessOverlay } from "../components/SuccessOverlay";
import { PaymentModal } from "../components/PaymentModal";
import { PaymentSheet } from "../components/PaymentSheet";
import { ProductPickerSheet } from "../components/ProductPickerSheet";
import Icon from "../components/Icon";
import { useCountUp } from "../hooks/useCountUp";
import { formatMoney } from "../utils/format";

const PAY_METHODS = [
  { key: "cash", label: "Naqd" },
  { key: "card", label: "Karta" },
  { key: "click", label: "Click" },
  { key: "payme", label: "Payme" },
  { key: "paynet", label: "Paynet" },
  { key: "visa", label: "Visa" },
  { key: "nasiya", label: "Nasiya" },
];

/** Naqd/karta — to'g'ridan to'g'ri, Click/Payme/Paynet/Visa — QR+karta modali orqali */
const ONLINE_METHODS = ["click", "payme", "paynet", "visa"];

/**
 * Kassa sahifasi — shtrix kod bilan uzluksiz ishlaydi.
 * Nomavjud mahsulot skanerlanganda oqim TO'XTAMAYDI:
 * skaner maydoni ostida chiroyli inline panel ochiladi, kassir yozishda davom etishi mumkin.
 * Click/Payme to'lovda QR+karta modali chiqadi.
 */
export function CashierPage() {
  const [code, setCode] = useState("");
  const [payment, setPayment] = useState("cash");
  const [quickBarcode, setQuickBarcode] = useState("");
  const [quickStep, setQuickStep] = useState("confirm");
  const [quickName, setQuickName] = useState("");
  const [quickPrice, setQuickPrice] = useState("");
  const [paying, setPaying] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [orderId, setOrderId] = useState(null);
  const [settings, setSettings] = useState(null);
  const [lastSale, setLastSale] = useState(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [lastCash, setLastCash] = useState(null);

  const inputRef = useRef(null);
  const quickNameRef = useRef(null);
  const quickPriceRef = useRef(null);
  const user = useAuthStore((s) => s.user);
  const { show } = useToast();

  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const clearCart = useCartStore((s) => s.clear);

  const total = items.reduce((sum, it) => sum + it.price * it.qty, 0);
  const totalAnimated = useCountUp(total, { duration: 450 });
  const hasItems = items.length > 0;
  const isOwner = user?.role === "owner" || user?.role === "super_admin";

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Do'kon to'lov sozlamalari (Payme/Click/Paynet merchant ID'lari) — dinamik QR uchun
  useEffect(() => {
    let alive = true;
    api
      .get("stores/settings/")
      .then((s) => alive && setSettings(s))
      .catch(() => alive && setSettings(null));
    return () => {
      alive = false;
    };
  }, []);

  const focusInput = useCallback(() => inputRef.current?.focus(), []);

  // Mahsulotni chekka qo'shish — stock limitidan oshsa rad etiladi.
  const addToCart = (product) => {
    const res = addItem({
      product_id: product.id,
      barcode: product.barcode,
      name: product.name,
      price: Number(product.price),
      stock_qty: product.stock_qty,
    });
    if (!res.ok) {
      show(`Qoldiq yetarli emas (${Number(product.stock_qty)} dona)`, "error");
      return false;
    }
    return true;
  };

  // Shtrix kodni bazadan qidirib chekka qo'shish (fizik skaner / kamera / qo'lda)
  const processBarcode = async (barcode) => {
    if (!barcode) return;
    try {
      const product = await api.get(`products/by-barcode/${encodeURIComponent(barcode)}/`);
      if (addToCart(product)) {
        show(`Qo'shildi: ${product.name}`, "success", 1200);
      }
    } catch (err) {
      // 404 (topilmadi), tarmoq xatosi yoki server 5xx xatosi — hammasida
      // "Bunday mahsulot yo'q + Shu mahsulotni qo'shamiz" panelini ochamiz.
      // Oqim to'xtamaydi, kassir davom etadi.
      const notFound = err.status === 404 || !err.status || err.status >= 500;
      if (notFound) {
        setQuickBarcode(barcode);
        setQuickStep("confirm");
        setQuickName("");
        setQuickPrice("");
        show(
          err.status === 404
            ? `Bunday mahsulot yo'q — "${barcode}" bazada topilmadi`
            : `"${barcode}" topilmadi yoki server javob bermadi — quyida tekshiring`,
          "info",
          3000
        );
      } else {
        show(err.message, "error");
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const barcode = code.trim();
    if (!barcode) return;
    await processBarcode(barcode);
    setCode("");
    inputRef.current?.focus();
  };

  // Fizik skaner Enter yubormasa ham kodni avtomatik aniqlash (pauza > 150ms)
  useEffect(() => {
    if (!code.trim() || code.trim().length < 4) return undefined;
    const t = setTimeout(() => {
      const barcode = code.trim();
      setCode("");
      processBarcode(barcode);
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Inline panel orqali tezkor qo'shish (upsert-by-barcode) keyin chekka qo'shish
  const quickAdd = async () => {
    if (!quickName || !quickPrice) {
      show("Nom va narx kiritilishi shart", "error");
      return;
    }
    try {
      const product = await api.put("products/upsert-by-barcode/", {
        barcode: quickBarcode.trim(),
        name: quickName.trim(),
        price: Number(quickPrice),
      });
      if (addToCart(product)) {
        show(`Qo'shildi: ${product.name}`, "success", 1500);
      }
      setQuickBarcode("");
      setQuickStep("confirm");
      setQuickName("");
      setQuickPrice("");
      inputRef.current?.focus();
    } catch (err) {
      show(err.message, "error");
    }
  };

  const closeQuick = () => {
    setQuickBarcode("");
    setQuickStep("confirm");
    setQuickName("");
    setQuickPrice("");
    inputRef.current?.focus();
  };

  const startQuickAdd = () => {
    setQuickStep("form");
    setTimeout(() => quickNameRef.current?.focus(), 80);
  };

  // To'lov: asosan "TO'LOVGA O'TISH" tugmasi PaymentSheet (bottom-sheet) ochadi —
  // usullar, naqd qaytim va nasiya mijozini tanlash shu yerda hal qilinadi.
  const onPay = () => {
    if (!hasItems) return;
    setSheetOpen(true);
  };

  // Bottom-sheet "TASDIQLASH" tugmasi — tanlangan usul bo'yicha davom etamiz.
  const handleSheetConfirm = ({ method, customer, cashReceived, change, dueDate }) => {
    if (ONLINE_METHODS.includes(method)) {
      setPayment(method);
      setOrderId(Date.now());
      setPayOpen(true);
      return;
    }
    setPayment(method);
    checkout(customer, method, cashReceived, change, dueDate);
  };

  // Sotuvni yakunlash (asosiy API chaqiruvi)
  const checkout = async (customer, method = payment, cashReceived, change, dueDate, forceCredit = false) => {
    if (!hasItems) return;
    setPaying(true);
    setPayOpen(false);
    try {
      const payload = {
        payment_method: method,
        items: items.map((it) => ({ product_id: it.product_id, qty: it.qty })),
      };
      if (method === "nasiya") {
        const phone = customer?.phone;
        if (!phone) {
          setPaying(false);
          show("Nasiya uchun mijoz telefonini tanlang", "error");
          return;
        }
        payload.phone = phone;
        if (customer?.name) payload.customer_name = customer.name;
        if (dueDate) payload.due_date = dueDate;
        if (forceCredit) payload.force_credit = true;
      }
      const sale = await api.post("sales/", payload);
      setLastSale(sale);
      setLastCash(
        method === "cash" && cashReceived != null
          ? { received: cashReceived, change: change ?? Math.max(0, cashReceived - sale.total) }
          : null
      );
      clearCart();
      show(
        method === "nasiya"
          ? `Nasiya saqlandi: ${formatMoney(sale.total)}`
          : `Sotuv saqlandi: ${formatMoney(sale.total)}`,
        "success",
        2000
      );
      setCelebrate(true);
    } catch (err) {
      if (
        method === "nasiya" &&
        err?.data?.credit &&
        (isOwner || user?.role === "super_admin")
      ) {
        const ok = window.confirm(
          `${err.data.credit}\n\nLimitdan oshirib, "force_credit" bilan davom etasizmi?`
        );
        if (ok) {
          setPaying(false);
          checkout(customer, method, cashReceived, change, dueDate, true);
          return;
        }
      }
      show(err.message, "error");
    } finally {
      setPaying(false);
    }
  };

  const quickVisible = !!quickBarcode;

  return (
    <motion.div
      className="cashier-page"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="page-head">
        <div>
          <motion.h1
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 }}
          >
            Kassa
          </motion.h1>
          <div className="sub">
          <span className="listening-dot" /> Shtrix kodni skanerlang yoki maydonga kiriting
        </div>
      </div>
        <button className="btn btn-ghost cashier-products-btn" onClick={() => { setPickerOpen(true); }}>
          <Icon name="bag" /> <span className="cashier-products-lbl">Mahsulotlar</span>
        </button>
      </div>

      <div className="cashier-layout">
        <div className="scan-zone">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <motion.form
              className="scan-input-wrap"
              style={{ flex: 1, minWidth: 260 }}
              onSubmit={handleSubmit}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <span className="scan-icon">
                <Icon name="scan" />
              </span>
              <span className="laser" />
              <input
                ref={inputRef}
                className="scan-input"
                placeholder="Shtrix kod..."
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                inputMode="numeric"
              />
            </motion.form>
            <motion.button
              className="camera-btn"
              onClick={() => setCamOpen(true)}
              title="Skaner orqali qidirish"
              aria-label="Skaner orqali qidirish"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
            >
              <Icon name="camera" /> <span className="cam-lbl">Skaner</span>
            </motion.button>
          </div>

          {/* Nomavjud mahsulot — inline tezkor qo'shish paneli (oqimni to'xtatmaydi) */}
          <AnimatePresence>
            {quickVisible && (
              <motion.div
                className="glass-panel quick-add-panel"
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 26 }}
                style={{ overflow: "hidden" }}
              >
                <div className="quick-add-head">
                  <span className="listening-dot" />
                  <span>
                    <b className="mono">{quickBarcode}</b> — Bunday mahsulot yo'q
                  </span>
                  <button className="ghost-btn" onClick={closeQuick} aria-label="Bekor qilish">
                    ✕
                  </button>
                </div>

                {quickStep === "confirm" ? (
                  <div className="pnf-body" style={{ padding: "6px 0 2px" }}>
                    <div className="pnf-sub" style={{ marginBottom: 12 }}>
                      Bazada <b className="mono">{quickBarcode}</b> bo'yicha mahsulot topilmadi.
                      Avval bazada tekshirildi — bunday mahsulot yo'q.
                    </div>
                    <div className="pnf-actions">
                      <button className="btn btn-primary" onClick={startQuickAdd}>
                        <Icon name="plus" /> Shu mahsulotni qo'shamizmi?
                      </button>
                      <button className="btn btn-ghost" onClick={closeQuick}>
                        Bekor
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="quick-add-grid">
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Nomi</label>
                      <input
                        ref={quickNameRef}
                        className="input"
                        value={quickName}
                        onChange={(e) => setQuickName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); quickPriceRef.current?.focus(); }
                        }}
                        placeholder="Masalan: Cappy Pulpy 1L"
                      />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Narx (so'm)</label>
                      <input
                        ref={quickPriceRef}
                        className="input mono"
                        type="number"
                        min="1"
                        value={quickPrice}
                        onChange={(e) => setQuickPrice(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); quickAdd(); }
                        }}
                        placeholder="16000"
                      />
                    </div>
                    <div className="quick-add-btns">
                      <button className="btn btn-ghost" onClick={closeQuick}>
                        Bekor
                      </button>
                      <button className="btn btn-primary" onClick={quickAdd}>
                        <Icon name="check" /> Chekka qo'shish
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            className="card glass-panel"
            style={{ flex: 1, display: "flex", flexDirection: "column" }}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            <div className="flex spread" style={{ marginBottom: 14 }}>
              <h3>Chek</h3>
              {hasItems && (
                <button className="ghost-btn" onClick={() => setClearOpen(true)} aria-label="Chekni tozalash">
                  Tozalash
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", flex: 1 }} className="receipt-row-wrap">
              <div style={{ flex: "1 1 300px", minHeight: 340 }} className="receipt-area">
                <ReceiptTape onEmptyAction={() => setPickerOpen(true)} />
              </div>

              {/* Jami va to'lov */}
              <motion.div
                className="glass-panel pay-zone"
                style={{ flex: "0 0 320px", alignSelf: "start", padding: 24 }}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 20 }}
              >
                <div className="pay-total-display">
                  <div className="label">Jami summa</div>
                  <motion.div
                    key={Math.round(total / 100)}
                    className="amount mono"
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 0.3 }}
                  >
                    {formatMoney(totalAnimated)}
                  </motion.div>
                  {hasItems ? (
                    <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 8 }}>
                      {items.length} tur · {items.reduce((n, it) => n + it.qty, 0)} dona
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 8 }}>
                      chek bo'sh
                    </div>
                  )}
                </div>

                <AnimatePresence>
                  {hasItems && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{ overflow: "hidden" }}
                    >
                      <div className="pay-row" style={{ marginTop: 8 }}>
                        {PAY_METHODS.map((m) => (
                          <button
                            key={m.key}
                            className={`pay-btn ${payment === m.key ? "selected" : ""}`}
                            onClick={() => setPayment(m.key)}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.button
                  className="btn btn-accent btn-lg btn-block pay-checkout"
                  disabled={!hasItems || paying}
                  onClick={onPay}
                  style={{ marginTop: 16 }}
                  whileTap={hasItems && !paying ? { scale: 0.97 } : {}}
                >
                  <Icon name="check" size={20} />
                  {paying ? "Yuborilmoqda..." : `To'lov · ${formatMoney(total)}`}
                </motion.button>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>

      <CameraScannerModal
        open={camOpen}
        onClose={() => { setCamOpen(false); focusInput(); }}
        onDetected={async (barcode) => {
          await processBarcode(barcode);
          setCode("");
          setCamOpen(false);
          focusInput();
        }}
      />

      {/* Click/Payme/Paynet — QR + karta modali */}
      <PaymentModal
        open={payOpen}
        method={payment}
        total={total}
        orderId={orderId}
        settings={settings || {}}
        shopName={user?.shop_name}
        onConfirm={checkout}
        onClose={() => setPayOpen(false)}
      />

      {/* To'lov bottom-sheet — Naqd/Karta/QR/Nasiya bittada */}
      <PaymentSheet
        open={sheetOpen}
        total={total}
        settings={settings || {}}
        initialMethod={payment}
        onConfirm={handleSheetConfirm}
        onClose={() => setSheetOpen(false)}
      />

      {/* Mahsulot tanlash (qidiruv/barcode/kategoriya) — savatga qo'shish */}
      <ProductPickerSheet
        open={pickerOpen}
        onClose={() => { setPickerOpen(false); focusInput(); }}
        onPick={(product) => addToCart(product)}
      />

      {/* Chekni tozalash — tasdiqlash */}
      <Modal open={clearOpen} onClose={() => setClearOpen(false)}>
        <h3>Chekni tozalamoqchimisiz?</h3>
        <p style={{ marginTop: 10, opacity: 0.85, lineHeight: 1.55 }}>
          Savatdagi barcha mahsulotlar o'chiriladi va to'lov turi qayta
          o'rnatiladi. Bu amalni qaytarib bo'lmaydi.
        </p>
        <div className="grid-2" style={{ marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={() => setClearOpen(false)}>Bekor qilish</button>
          <button
            className="btn btn-danger"
            onClick={() => {
              clearCart();
              setPayment("cash");
              setClearOpen(false);
              show("Chek tozalandi", "info", 1500);
              focusInput();
            }}
          >
            Tozalash
          </button>
        </div>
      </Modal>

      {/* Chop etish modali */}
      <Modal open={printOpen} onClose={() => { setPrintOpen(false); focusInput(); }}>
        <div style={{ textAlign: "center" }}>
          <motion.div
            initial={{ scale: 0.6, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            style={{ marginBottom: 10, color: "var(--brand-light)" }}
          >
            <Icon name="check" size={44} />
          </motion.div>
          <h3>Chek saqlandi</h3>
          <div className="sub" style={{ color: "var(--ink-soft)", marginBottom: 18 }}>
            Jami: <b className="mono" style={{ color: "var(--brand-light)" }}>{formatMoney(lastSale?.total)}</b>
          </div>
          <div className="grid-2">
            <button className="btn btn-primary" onClick={() => window.print()}>
              <Icon name="printer" /> Chop etish
            </button>
            <button className="btn btn-ghost" onClick={() => { setPrintOpen(false); focusInput(); }}>
              Yopish
            </button>
          </div>
        </div>
      </Modal>

      {/* Sotuv muvaffaqiyatli — qonfetti + check */}
      <SuccessOverlay
        open={celebrate}
        total={lastSale?.total}
        shopName={user?.shop_name}
        onPrint={() => { setCelebrate(false); setPrintOpen(true); }}
        onClose={() => { setCelebrate(false); focusInput(); }}
      />

      {lastSale && (
        <ReceiptPrint
          sale={lastSale}
          shopName={user?.shop_name}
          cashierName={user?.username}
          cash={lastCash}
        />
      )}
    </motion.div>
  );
}

export default CashierPage;