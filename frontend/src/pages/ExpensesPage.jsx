import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";

import { api } from "../api/client";
import { formatMoney } from "../utils/format";
import { useToast } from "../components/Toast";
import Icon from "../components/Icon";

/** Xarajatlar — do'kon xaridlari va chiqimlar (sotuvchi, soni, summa). */
export function ExpensesPage() {
  const qc = useQueryClient();
  const { show } = useToast();

  const [title, setTitle] = useState("");
  const [supplier, setSupplier] = useState("");
  const [qty, setQty] = useState("1");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ["expenses"],
    queryFn: () => api.list("expenses/", { page_size: 100 }),
  });

  const items = query.data?.results || [];
  const total = items.reduce((s, x) => s + Number(x.total_amount || 0), 0);

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
      qc.invalidateQueries({ queryKey: ["reports"] });
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
      title: title.trim(),
      supplier: supplier.trim(),
      qty: Number(qty) || 1,
      total_amount: Number(amount),
      note: note.trim(),
    });
    setSaving(false);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Xarajatlar</h1>
          <div className="sub">Xaridlar va chiqimlar hisobi</div>
        </div>
      </div>

      <form className="panel" style={{ padding: 20, marginBottom: 16 }} onSubmit={submit}>
        <div className="grid-2">
          <div className="field">
            <label>Nima xarid qilindi *</label>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Masalan: Coca-Cola partiya"
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
          <div className="field">
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
        <div className="field">
          <label>Izoh (ixtiyoriy)</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={saving}>
          <Icon name="plus" size={16} /> {saving ? "Saqlanmoqda..." : "Xarajat qo'shish"}
        </button>
      </form>

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="panel" style={{ padding: 16 }}>
          <div className="muted small">Jami xarajat</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#f87171" }}>
            {formatMoney(total)} so'm
          </div>
        </div>
        <div className="panel" style={{ padding: 16 }}>
          <div className="muted small">Yozuvlar</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{items.length}</div>
        </div>
      </div>

      <div className="panel" style={{ padding: 6 }}>
        {items.length === 0 ? (
          <div className="empty-state">
            <div className="big" aria-hidden="true">🛒</div>
            <h3>Xarajatlar yo'q</h3>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Nomi</th>
                  <th>Sotuvchi</th>
                  <th>Soni</th>
                  <th>Summa</th>
                  <th>Sana</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((x) => (
                  <motion.tr key={x.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <td>
                      <b>{x.title}</b>
                      {x.note && <div className="muted small">{x.note}</div>}
                    </td>
                    <td>{x.supplier || "—"}</td>
                    <td className="mono">{Number(x.qty)}</td>
                    <td className="mono" style={{ color: "#f87171" }}>
                      {formatMoney(x.total_amount)}
                    </td>
                    <td className="muted small">
                      {new Date(x.created_at).toLocaleDateString("uz-UZ")}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default ExpensesPage;
