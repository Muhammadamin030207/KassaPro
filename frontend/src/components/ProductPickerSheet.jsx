import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { api } from "../api/client";
import { Modal } from "../components/Modal";
import { CameraScannerModal } from "../components/CameraScannerModal";
import { useToast } from "../components/Toast";
import Icon from "../components/Icon";
import { formatMoney } from "../utils/format";

/**
 * Mahsulot tanlash sheet'i — kassadan mahsulotlarni qidirib chekka qo'shish.
 * Qidiruv (nomi/barcode), barcode tezkor qo'shish, kamera skaner va
 * kategoriya filtri. Tanlanganda `onPick(product)` chaqiriladi (savatga qo'shadi),
 * sheet ochiq qoladi — bir nechta mahsulotni ketma-ket qo'shish mumkin.
 *
 * @param {{ open: boolean, onClose: function, onPick: function, title?: string }} props
 *   onPick(product) — tanlangan mahsulot (oxirida ok:boolean qaytariladi).
 */
export function ProductPickerSheet({ open, onClose, onPick, title = "Mahsulot tanlash" }) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [barcode, setBarcode] = useState("");
  const [catId, setCatId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [camOpen, setCamOpen] = useState(false);
  const { show } = useToast();

  // Ochilganda filtrlarni tozalaymiz
  useEffect(() => {
    if (open) {
      setSearch("");
      setBarcode("");
      setCatId(null);
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 260);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    api
      .list("categories/", { page_size: 50 })
      .then((d) => alive && setCategories(d.results || []))
      .catch(() => alive && setCategories([]));
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setProducts([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await api.list("products/", {
          search: debounced || undefined,
          page_size: 300,
        });
        if (!cancelled) setProducts(data.results || []);
      } catch (err) {
        if (!cancelled) show(err.message || "Mahsulotlar yuklanmadi", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debounced]);

  const filtered = catId ? products.filter((p) => p.category_id === catId) : products;

  const add = (p) => {
    if (onPick && onPick(p)) {
      show(`Qo'shildi: ${p.name}`, "success", 900);
    }
  };

  // Barcode maydonidagi Enter — aniq barcode bo'yicha topib qo'shish
  const scanBarcode = async (e) => {
    e.preventDefault();
    const code = barcode.trim();
    if (!code) return;
    try {
      const p = await api.get(`products/by-barcode/${encodeURIComponent(code)}/`);
      add(p);
      setBarcode("");
    } catch {
      show("Bu barcode bo'yicha mahsulot topilmadi", "error", 2000);
    }
  };

  const onCamDetected = async (code) => {
    setCamOpen(false);
    try {
      const p = await api.get(`products/by-barcode/${encodeURIComponent(code)}/`);
      add(p);
    } catch {
      show("Bu barcode bo'yicha mahsulot topilmadi", "error", 2000);
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} size="lg" sheet>
        <div className="picker-head">
          <h3>{title}</h3>
          <button className="ghost-btn" onClick={onClose} aria-label="Yopish">
            ✕
          </button>
        </div>

        {/* Barcode tezkor qo'shish + kamera */}
        <motion.form
          className="picker-scan-row"
          onSubmit={scanBarcode}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="pick-scan-ico">
            <Icon name="scan" />
          </span>
          <input
            className="input"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Shtrix kodni skanerlang..."
            autoComplete="off"
            inputMode="numeric"
          />
          <button
            type="button"
            className="ghost-btn pick-cam-btn"
            onClick={() => setCamOpen(true)}
            aria-label="Skaner orqali qidirish"
          >
            <Icon name="camera" />
          </button>
        </motion.form>

        <input
          className="input"
          style={{ marginBottom: 14 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Qidirish: nomi yoki shtrix kod..."
          autoFocus
        />

        {/* Kategoriya chiplari */}
        {categories.length > 0 && (
          <div className="picker-cats">
            <button
              className={`picker-cat ${catId === null ? "active" : ""}`}
              onClick={() => setCatId(null)}
            >
              Barchasi
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                className={`picker-cat ${catId === c.id ? "active" : ""}`}
                onClick={() => setCatId(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        <div className="picker-list">
          {loading ? (
            <div className="empty-state">Yuklanmoqda...</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="big">🔍</div>
              <h3>Mahsulot topilmadi</h3>
              <p className="muted">Nom yoki barcode bilan qidirib ko'ring.</p>
            </div>
          ) : (
            filtered.map((p) => {
              const stock = Number(p.stock_qty ?? 0);
              const out = stock <= 0;
              return (
                <motion.div
                  key={p.id}
                  className="picker-row"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="picker-row-info">
                    <div className="picker-row-name">
                      {p.name}
                      {p.barcode && <span className="mono picker-barcode">{p.barcode}</span>}
                    </div>
                    <div className="muted small">
                      <b className="mono">{formatMoney(p.price)}</b>
                      {!out && <span> · Qoldiq: {stock}</span>}
                    </div>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={out}
                    onClick={() => add(p)}
                  >
                    {out ? "Yo'q" : "+ Qo'shish"}
                  </button>
                </motion.div>
              );
            })
          )}
        </div>
      </Modal>

      <CameraScannerModal open={camOpen} onClose={() => setCamOpen(false)} onDetected={onCamDetected} />
    </>
  );
}

export default ProductPickerSheet;