import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";

import { api } from "../api/client";
import { useAuthStore } from "../stores/authStore";
import { useToast } from "../components/Toast";
import { TiltCard } from "../components/TiltCard";
import { CameraScannerModal } from "../components/CameraScannerModal";
import Icon from "../components/Icon";
import { Modal } from "../components/Modal";
import { formatMoney, formatQty } from "../utils/format";

const LOW_STOCK = 10;

/**
 * Mahsulotlar sahifasi — shtrix kod bilan ishlaydigan, 3D kartalar bilan.
 * Barcode maydoni doim fokusda; kod qaytib kelsa mahsulot formaga yuklanadi (yangi/tahrir).
 */
export function ProductsPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [camOpen, setCamOpen] = useState(false);

  const scanRef = useRef(null);
  const barcodeRef = useRef(null);
  const nameRef = useRef(null);
  const priceRef = useRef(null);
  const saleRef = useRef(null);

  const user = useAuthStore((s) => s.user);
  const isOwner = user?.role === "owner" || user?.is_admin;
  const { show } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  const { data: productsData, isLoading } = useQuery({
    queryKey: ["products", debounced],
    queryFn: () => api.list("products/", { search: debounced, page_size: 200 }),
  });
  const products = productsData?.results || [];

  // Barcode maydonida allaqachon mavjud mahsulot kodi yozilsa ogohlantirish
  const barcodeDup = (() => {
    const code = (form?.barcode || "").trim().toLowerCase();
    if (!code) return null;
    return products.find(
      (p) =>
        p.id !== editingId &&
        String(p.barcode || "").trim().toLowerCase() === code
    );
  })();

  const deleteMutation = useMutation({
    mutationFn: (id) => api.del(`products/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      show("Mahsulot o'chirildi", "success");
    },
    onError: (e) => show(e.message, "error"),
  });

  const openForm = (product = null) => {
    setEditingId(product?.id || null);
    setForm(
      product
        ? {
            barcode: product.barcode,
            name: product.name,
            price: product.price,
            cost_price: product.cost_price || "",
            stock_qty: product.stock_qty ? formatQty(product.stock_qty) : "",
          }
        : { barcode: "", name: "", price: "", cost_price: "", stock_qty: "" }
    );
    setFormOpen(true);
    setTimeout(() => barcodeRef.current?.focus(), 100);
  };

  const handleFormKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const { id } = e.target;
      if (id === "p-barcode") nameRef.current?.focus();
      else if (id === "p-name") priceRef.current?.focus();
      else if (id === "p-price") saleRef.current?.focus();
      else if (id === "p-stock") saveForm();
    }
  };

  const saveForm = async (e) => {
    if (e) e.preventDefault();
    const payload = {
      barcode: form.barcode.trim(),
      name: form.name.trim(),
      price: Number(form.price),
      cost_price: form.cost_price ? Number(form.cost_price) : null,
      stock_qty: form.stock_qty ? Number(form.stock_qty) : 0,
    };
    if (!payload.barcode || !payload.name || !payload.price) {
      show("Barcha maydonlar to'ldirilishi shart", "error");
      return;
    }

    try {
      await api.put(`products/upsert-by-barcode/`, payload);
      show(editingId ? "Mahsulot yangilandi" : "Mahsulot qo'shildi", "success", 1500);
      qc.invalidateQueries({ queryKey: ["products"] });
      setFormOpen(false);
      setForm({ barcode: "", name: "", price: "", cost_price: "", stock_qty: "" });
      setEditingId(null);
      setTimeout(() => scanRef.current?.focus(), 100);
    } catch (err) {
      show(err.message, "error");
    }
  };

  // Skaner kodni qabul qilganda: darhol qo'shish formasiga o'tamiz (bazadan
  // so'rab "yo'q" paneli chigarmaymiz). Agar kod bazada bo'lsa — formani
  // shu mahsulot bilan to'ldirib tahrirlash (edit) rejimiga o'tkazamiz.
  async function lookupAndFill(code) {
    if (!code) return;

    // Forma allaqachon ochiq — kodni formadagi barcode maydoniga yozamiz
    if (formOpen) {
      setEditingId(null);
      setForm((f) => ({ ...f, barcode: code }));
      setTimeout(() => nameRef.current?.focus(), 60);
      return;
    }

    // To'g'ridan-to'g'ri forma (yangi mahsulot), panel yo'q
    setEditingId(null);
    setForm({ barcode: code, name: "", price: "", cost_price: "", stock_qty: "" });
    setFormOpen(true);
    setTimeout(() => nameRef.current?.focus(), 60);

    // Yashirin qidiruv: bor bo'lsa formani to'ldirib edit qilamiz.
    // Topilmasa hech narsa bo'lmaydi — yangi mahsulot formasi qoladi.
    try {
      const data = await api.list("products/", { barcode: code, page_size: 1 });
      const p = data?.results?.[0];
      if (p) {
        setEditingId(p.id);
        setForm({
          barcode: p.barcode,
          name: p.name,
          price: p.price,
          cost_price: p.cost_price || "",
          stock_qty: p.stock_qty ? formatQty(p.stock_qty) : "",
        });
      }
    } catch {
      /* tarmoq xatosi — yangi mahsulot formasi davom etadi */
    } finally {
      scanRef.current?.focus();
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="page-head">
        <div>
          <motion.h1 initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}>
            Mahsulotlar
          </motion.h1>
          <div className="sub">
            <span className="listening-dot" /> Shtrix kod skanerga tayyor — kodni skanerlab formani oching
          </div>
        </div>
        {isOwner && (
          <motion.button
            className="btn btn-primary"
            onClick={() => openForm()}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            <Icon name="plus" /> Yangi mahsulot
          </motion.button>
        )}
      </div>

      <motion.div
        className="card glass-panel"
        style={{ marginBottom: 20 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
      >
        <div className="field" style={{ marginBottom: 0 }}>
          <label>
            <span className="listening-dot" /> Shtrix kod (skaner yoki klaviatura)
          </label>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div className="scan-input-wrap" style={{ flex: 1, position: "relative" }}>
              <span className="scan-icon"><Icon name="scan" /></span>
              <span className="laser" />
              <input
                ref={scanRef}
                id="p-scan"
                className="scan-input"
                placeholder="Skanerlaganda kod shu yerda paydo bo'ladi..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    lookupAndFill(e.target.value.trim());
                    e.target.value = "";
                  }
                }}
                autoComplete="off"
                inputMode="numeric"
              />
            </div>
            <motion.button
              className="camera-btn"
              onClick={() => setCamOpen(true)}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
            >
              <Icon name="camera" /> Kamera
            </motion.button>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="card glass-panel"
        style={{ marginBottom: 20 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <input
          className="input"
          placeholder="Qidirish: nom yoki shtrix kod..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </motion.div>

      {isLoading ? (
        <div className="empty-state">Yuklanmoqda...</div>
      ) : products.length === 0 ? (
        <motion.div className="empty-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="big">🗂️</div>
          <h3>Hali mahsulot yo'q</h3>
          <p>Yuqoridagi shtrix kod maydoniga skanerlang — mahsulotni darhol qo'shing.</p>
        </motion.div>
      ) : (
        <div className="product-grid">
          <AnimatePresence>
            {products.map((p, i) => {
              const low = Number(p.stock_qty) <= LOW_STOCK;
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: Math.min(i * 0.04, 0.4) }}
                >
                  <TiltCard className="product-card" maxTilt={12}>
                    <div className="pc-top">
                      <span className="pc-barcode mono">{p.barcode}</span>
                      {low ? (
                        <span className="badge badge-low">Kam: {formatQty(p.stock_qty)}</span>
                      ) : (
                        <span className="badge badge-ok">{formatQty(p.stock_qty)}</span>
                      )}
                    </div>
                    <div className="pc-bars" />
                    <div className="pc-name">{p.name}</div>
                    <div className="pc-bottom">
                      <div className="pc-price mono">{formatMoney(p.price)}</div>
                      {isOwner && (
                        <div className="flex" style={{ gap: 6 }}>
                          <button className="ghost-btn" onClick={() => openForm(p)}>
                            Tahrirlash
                          </button>
                          <button
                            className="ghost-btn"
                            onClick={() => {
                              if (window.confirm(`"${p.name}" mahsulotini o'chirishni tasdiqlaysizmi?`)) {
                                deleteMutation.mutate(p.id);
                              }
                            }}
                            title="O'chirish"
                          >
                            <Icon name="trash" />
                          </button>
                        </div>
                      )}
                    </div>
                  </TiltCard>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Mahsulot formasi */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)}>
        <motion.div key={editingId || "new"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <h3>{editingId ? "Mahsulotni tahrirlash" : "Yangi mahsulot"}</h3>
          <form onSubmit={saveForm}>
            <div className="field">
              <label>Shtrix kod</label>
              <input
                id="p-barcode"
                className="input input-mono"
                value={form?.barcode || ""}
                onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                onKeyDown={handleFormKeyDown}
                ref={barcodeRef}
                placeholder="Skanerlang yoki kiriting"
              />
              {barcodeDup && (
                <div className="field-warn">
                  Bu shtrix kod "{barcodeDup.name}" mahsulotiga tegishli
                </div>
              )}
            </div>
            <div className="field">
              <label>Nomi</label>
              <input
                id="p-name"
                className="input"
                value={form?.name || ""}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                onKeyDown={handleFormKeyDown}
                ref={nameRef}
              />
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Narx (so'm)</label>
                <input
                  id="p-price"
                  className="input mono"
                  type="number"
                  min="1"
                  value={form?.price || ""}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  onKeyDown={handleFormKeyDown}
                  ref={priceRef}
                />
              </div>
              <div className="field">
                <label>Tannarx (ixtiyoriy)</label>
                <input
                  className="input mono"
                  type="number"
                  min="0"
                  value={form?.cost_price || ""}
                  onChange={(e) => setForm((f) => ({ ...f, cost_price: e.target.value }))}
                  onKeyDown={handleFormKeyDown}
                />
              </div>
            </div>
            <div className="field">
              <label>Miqdor (zahira)</label>
              <input
                id="p-stock"
                className="input mono"
                type="number"
                min="0"
                value={form?.stock_qty || ""}
                onChange={(e) => setForm((f) => ({ ...f, stock_qty: e.target.value }))}
                onKeyDown={handleFormKeyDown}
                ref={saleRef}
              />
            </div>
            <div className="grid-2">
              <button type="button" className="btn btn-ghost" onClick={() => setFormOpen(false)}>
                Bekor
              </button>
              <button type="submit" className="btn btn-primary">
                <Icon name="check" /> Saqlash
              </button>
            </div>
          </form>
        </motion.div>
      </Modal>

      <CameraScannerModal
        open={camOpen}
        onClose={() => setCamOpen(false)}
        onDetected={(barcode) => {
          lookupAndFill(barcode);
          setCamOpen(false);
        }}
      />
    </motion.div>
  );
}

export default ProductsPage;