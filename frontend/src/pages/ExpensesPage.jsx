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

/** Xarajatlar — kategoriyali xarid va chiqimlar hisobi. */
export function ExpensesPage() {
  const qc = useQueryClient();
  const { show } = useToast();

  const [category, setCategory] = useState("xarid");
  const [title, setTitle] = useState("");
  const [supplier, setSupplier] = useState("");
  const [qty, setQty] = useState("1");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("all");

  const query = useQuery({
    queryKey: ["expenses"],
    queryFn: () => api.list("expenses/", { page_size: 200 }),
  });

  const items = query.data?.results || [];
  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((x) => x.category === filter)),
    [items, filter]
  );
  const total = filtered.reduce((s, x) => s + Number(x.total_amount || 0), 0);
  const grandTotal = items.reduce((s, x) => s + Number(x.total_amount || 0), 0);

  const createMutation = useMutation({
    mutationFn: (payload) => api.post("expenses/", payload),
    onSuccess: () => {
      show("Xarajat saqlandi ✓", "success");
      setTitle("");
      setSupplier("");
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
    if (!title.trim() || !amount) {
      show("Nomi va summa shart", "error");
      return;
    }
    setSaving(true);
    createMutation.mutate({
      category,
      title: title.trim(),
      supplier: supplier.trim(),
      qty: Number(qty) || 1,
      total_amount: Number(amount),
      note: note.trim(),
    });
    setSaving(false);
  };

  const byCategory = useMemo(() => {
    const m = {};
    for (const x of items) {
      m[x.category] = (m[x.category] || 0) + Number(x.total_amount || 0);
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [items]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Xarajatlar</h1>
          <div className="sub">Xaridlar va chiqimlar — kategoriyalar bilan</div>
        </div>
      </div>

      {/* Kategoriya tanlash */}
      <div className="exp-cats">
        {CATEGORIES.map((c) => (
          <button
            key={c.k}
            type="button"
            className={`exp-cat ${category === c.k ? "active" : ""}`}
            onClick={() => setCategory(c.k)}
          >
            <span className="exp-cat-emoji">{c.emoji}</span>
            {c.label}
          </button>
        ))}
      </div>

      {/* Form */}
      <form className="panel exp-form" onSubmit={submit}>
        <div className="exp-grid">
          <div className="field">
            <label>Nima xarid qilindi *</label>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                category === "xarid" ? "Masalan: Coca-Cola partiya" : catMeta(category).label + "..."
              }
            />
          </div>
          <div className="field">
            <label>Sotuvchi / kimdan</label>
            <input
              className="input"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Masalan: Optom savdo"
            />
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
          <div className="muted small">💸 Jami xarajat</div>
          <div className="exp-stat-num" style={{ color: "#f87171" }}>
            {formatMoney(grandTotal)}
          </div>
        </div>
        <div className="panel exp-stat">
          <div className="muted small">🧾 Yozuvlar</div>
          <div className="exp-stat-num">{items.length}</div>
        </div>
        <div className="panel exp-stat">
          <div className="muted small">📊 Kategoriyalar</div>
          <div className="exp-stat-num">{byCategory.length}</div>
        </div>
      </div>

      {/* Kategoriya bo'yicha taqsimot */}
      {byCategory.length > 0 && (
        <div className="panel exp-breakdown">
          <b style={{ fontSize: 14 }}>📊 Kategoriyalar bo'yicha</b>
          <div className="exp-break-list">
            {byCategory.map(([k, sum]) => {
              const meta = catMeta(k);
              const pct = Math.round((sum / grandTotal) * 100);
              return (
                <div key={k} className="exp-break-row">
                  <span className="exp-break-label">
                    {meta.emoji} {meta.label}
                  </span>
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
            className={`btn btn-sm ${filter === "all" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilter("all")}
          >
            Hammasi ({items.length})
          </button>
          {byCategory.map(([k, sum]) => {
            const meta = catMeta(k);
            const cnt = items.filter((x) => x.category === k).length;
            return (
              <button
                key={k}
                type="button"
                className={`btn btn-sm ${filter === k ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setFilter(k)}
              >
                {meta.emoji} {meta.label} ({cnt})
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="big" aria-hidden="true">🛒</div>
            <h3>Xarajatlar yo'q</h3>
            <p className="muted">Yuqoridan kategoriya tanlab, birinchi xarajatni qo'shing</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Kategoriya</th>
                  <th>Nomi</th>
                  <th>Sotuvchi</th>
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
                        <span className="exp-pill">
                          {meta.emoji} {meta.label}
                        </span>
                      </td>
                      <td>
                        <b>{x.title}</b>
                        {x.note && <div className="muted small">{x.note}</div>}
                      </td>
                      <td>{x.supplier || "—"}</td>
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
