import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";

import { api } from "../api/client";
import { formatMoney } from "../utils/format";
import { useToast } from "../components/Toast";
import Icon from "../components/Icon";

const CATEGORIES = [
  { k: "xarid", emoji: "🛒", label: "Xarid" },
  { k: "ijara", emoji: "🏠", label: "Ijara" },
  { k: "kommunal", emoji: "💡", label: "Kommunal" },
  { k: "transport", emoji: "🚗", label: "Transport" },
  { k: "maosh", emoji: "👥", label: "Maosh" },
  { k: "yetkazish", emoji: "📦", label: "Yetkazib berish" },
  { k: "reklama", emoji: "📣", label: "Reklama" },
  { k: "boshqa", emoji: "🧾", label: "Boshqa" },
];

const catMeta = (k) => CATEGORIES.find((c) => c.k === k) || CATEGORIES[CATEGORIES.length - 1];

/** Xarajatlar — do'kon xaridlari: yetkazuvchi firmalar (Qatiq, Musa, Cheers...). */
export function ExpensesPage() {
  const qc = useQueryClient();
  const { show } = useToast();

  const [category, setCategory] = useState("xarid");
  const [supplier, setSupplier] = useState("");
  const [title, setTitle] = useState("");
  const [qty, setQty] = useState("1");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [filterCat, setFilterCat] = useState("all");

  const query = useQuery({
    queryKey: ["expenses"],
    queryFn: () => api.list("expenses/", { page_size: 200 }),
  });

  const items = query.data?.results || [];

  /** Avval ishlatilgan yetkazuvchilar — tez tanlash uchun */
  const suppliers = useMemo(() => {
    const m = {};
    for (const x of items) {
      const sup = (x.supplier || "").trim();
      if (sup) m[sup] = (m[sup] || 0) + Number(x.total_amount || 0);
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter(
        (x) =>
          (filterSupplier === "all" || x.supplier === filterSupplier) &&
          (filterCat === "all" || x.category === filterCat)
      ),
    [items, filterSupplier, filterCat]
  );

  const total = filtered.reduce((s, x) => s + Number(x.total_amount || 0), 0);
  const grandTotal = items.reduce((s, x) => s + Number(x.total_amount || 0), 0);

  const createMutation = useMutation({
    mutationFn: (payload) => api.post("expenses/", payload),
    onSuccess: () => {
      show("Xarid saqlandi ✓", "success");
      setSupplier("");
      setTitle("");
      setQty("1");
      setAmount("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e) => show(e.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.del(`expenses/${id}/`),
    onSuccess: () => {
      show("O'chirildi", "success");
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e) => show(e.message, "error"),
  });

  const submit = (e) => {
    e.preventDefault();
    if (!supplier.trim() || !title.trim() || !amount) {
      show("Yetkazuvchi, nomi va summa shart", "error");
      return;
    }
    setSaving(true);
    createMutation.mutate({
      category,
      supplier: supplier.trim(),
      title: title.trim(),
      qty: Number(qty) || 1,
      total_amount: Number(amount),
      note: note.trim(),
    });
    setSaving(false);
  };

  const byCategory = useMemo(() => {
    const m = {};
    for (const x of filtered) {
      m[x.category] = (m[x.category] || 0) + Number(x.total_amount || 0);
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  return (
    <div className="page exp-page">
      <div className="page-head">
        <div>
          <h1>Xarajatlar</h1>
          <div className="sub">Do'kon xaridlari — yetkazuvchi firmalar bo'yicha</div>
        </div>
      </div>

      {/* Yetkazuvchi firmalar — tez tanlash */}
      {suppliers.length > 0 && (
        <div className="exp-suppliers">
          <span className="exp-sup-label">🏪 Yetkazuvchilar:</span>
          {suppliers.map(([name, sum]) => (
            <button
              key={name}
              type="button"
              className={`exp-sup-chip ${filterSupplier === name ? "active" : ""}`}
              onClick={() =>
                setFilterSupplier((f) => (f === name ? "all" : name))
              }
              title={`Jami: ${formatMoney(sum)} so'm`}
            >
              {name}
            </button>
          ))}
          {filterSupplier !== "all" && (
            <button
              type="button"
              className="exp-sup-clear"
              onClick={() => setFilterSupplier("all")}
            >
              ✕ Tozalash
            </button>
          )}
        </div>
      )}

      {/* Xarid qo'shish */}
      <form className="panel exp-form" onSubmit={submit}>
        <div className="exp-form-title">🛒 Yangi xarid</div>
        <div className="exp-grid">
          <div className="field">
            <label>🏪 Yetkazuvchi firma *</label>
            <input
              className="input"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Masalan: Qatiq, Musa, Cheers, Lays, Ays Tea..."
              list="exp-suppliers-list"
            />
            <datalist id="exp-suppliers-list">
              {suppliers.map(([name]) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label>Nima olindi *</label>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Masalan: Qatiq 10 karton, Lays 50 quti"
            />
          </div>
          <div className="field">
            <label>Kategoriya</label>
            <select
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.k} value={c.k}>
                  {c.emoji} {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field exp-qty">
            <label>Soni</label>
            <input
              className="input mono"
              type="number"
              min="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Umumiy summa (so'm) *</label>
            <input
              className="input mono"
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
        <div className="exp-form-foot">
          <input
            className="input"
            style={{ flex: 1, minWidth: 200 }}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Izoh (ixtiyoriy)"
          />
          <button className="btn btn-primary" disabled={saving}>
            <Icon name="plus" size={16} /> {saving ? "Saqlanmoqda..." : "Qo'shish"}
          </button>
        </div>
      </form>

      {/* Statistikalar */}
      <div className="stat-grid">
        <div className="panel exp-stat">
          <div className="muted small">💸 Jami xarid</div>
          <div className="exp-stat-num" style={{ color: "#f87171" }}>
            {formatMoney(grandTotal)}
          </div>
        </div>
        <div className="panel exp-stat">
          <div className="muted small">🏪 Yetkazuvchilar</div>
          <div className="exp-stat-num">{suppliers.length}</div>
        </div>
        <div className="panel exp-stat">
          <div className="muted small">🧾 Yozuvlar</div>
          <div className="exp-stat-num">{items.length}</div>
        </div>
      </div>

      {/* Yetkazuvchilar bo'yicha taqsimot */}
      {suppliers.length > 0 && (
        <div className="panel exp-breakdown">
          <b style={{ fontSize: 14 }}>🏪 Yetkazuvchilar bo'yicha</b>
          <div className="exp-break-list">
            {suppliers.map(([name, sum]) => {
              const pct = grandTotal ? Math.round((sum / grandTotal) * 100) : 0;
              return (
                <div key={name} className="exp-break-row">
                  <span className="exp-break-label">🏪 {name}</span>
                  <div className="exp-break-bar">
                    <div style={{ width: `${pct}%` }} />
                  </div>
                  <span className="mono exp-break-sum">{formatMoney(sum)}</span>
                  <span className="muted small">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ro'yxat */}
      <div className="panel" style={{ padding: 6 }}>
        <div className="flex" style={{ gap: 8, padding: "10px 12px", flexWrap: "wrap" }}>
          <button
            type="button"
            className={`btn btn-sm ${filterCat === "all" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilterCat("all")}
          >
            Hammasi ({filtered.length})
          </button>
          {byCategory.map(([k, sum]) => {
            const meta = catMeta(k);
            const cnt = filtered.filter((x) => x.category === k).length;
            return (
              <button
                key={k}
                type="button"
                className={`btn btn-sm ${filterCat === k ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setFilterCat(k)}
              >
                {meta.emoji} {meta.label} ({cnt})
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="big" aria-hidden="true">🛒</div>
            <h3>Xaridlar yo'q</h3>
            <p className="muted">
              Yetkazuvchi firma nomini yozing (Qatiq, Musa, Cheers...) va birinchi
              xaridni qo'shing
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>🏪 Yetkazuvchi</th>
                  <th>Nima olindi</th>
                  <th>Soni</th>
                  <th>Summa</th>
                  <th>Sana</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((x) => {
                  const meta = catMeta(x.category);
                  return (
                    <motion.tr
                      key={x.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <td>
                        <span className="exp-pill">🏪 {x.supplier || "—"}</span>
                        <div className="muted small" style={{ marginTop: 3 }}>
                          {meta.emoji} {meta.label}
                        </div>
                      </td>
                      <td>
                        <b>{x.title}</b>
                        {x.note && <div className="muted small">{x.note}</div>}
                      </td>
                      <td className="mono">{Number(x.qty)}</td>
                      <td className="mono" style={{ color: "#f87171", fontWeight: 700 }}>
                        {formatMoney(x.total_amount)}
                      </td>
                      <td className="muted small">
                        {new Date(x.created_at).toLocaleDateString("uz-UZ", {
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </td>
                      <td>
                        <button
                          className="ghost-btn"
                          title="O'chirish"
                          onClick={() => {
                            if (window.confirm(`"${x.title}" o'chirilsinmi?`))
                              deleteMutation.mutate(x.id);
                          }}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default ExpensesPage;
