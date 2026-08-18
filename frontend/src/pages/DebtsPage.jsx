import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

import { api } from "../api/client";
import { useAuthStore } from "../stores/authStore";
import { useToast } from "../components/Toast";
import { Modal } from "../components/Modal";
import Icon from "../components/Icon";
import { DebtDetailModal } from "../components/DebtDetailModal";
import { DebtPaymentModal } from "../components/DebtPaymentModal";
import { formatMoney, todayISO } from "../utils/format";

const BASE = import.meta.env.VITE_API_URL || "/api";

const STATUS_META = {
  active: { txt: "Aktiv", cls: "badge-ok" },
  partially_paid: { txt: "Qisman", cls: "badge-pay" },
  overdue: { txt: "Muddati o'tgan", cls: "badge-low" },
  paid: { txt: "✓ To'langan", cls: "badge-ok" },
  cancelled: { txt: "Bekor", cls: "badge-txn" },
};

function statusMeta(st) {
  return STATUS_META[st] || { txt: st || "—", cls: "badge-txn" };
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function DebtsPage() {
  const user = useAuthStore((s) => s.user);
  const { show } = useToast();
  const isOwner = user?.role === "owner" || user?.role === "super_admin";

  const [tab, setTab] = useState("active");
  const [active, setActive] = useState([]);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("");
  const [dueF, setDueF] = useState("");
  const [sortF, setSortF] = useState("");
  const [reload, setReload] = useState(0);

  // Modallar
  const [detail, setDetail] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [payDebt, setPayDebt] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDue, setNewDue] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  });

  const searchTimer = useRef(null);

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get("debts/stats/");
      setStats(res);
    } catch {
      /* stats karta bo'lmasa ham sahifa ishlaydi */
    }
  }, []);

  const loadActive = useCallback(async () => {
    try {
      setLoading(true);
      const q = {};
      if (statusF) q.status = statusF;
      if (dueF) q.due = dueF;
      if (sortF) q.sort = sortF;
      const s = search.trim();
      if (s) q.search = s;
      const res = await api.list("debts/", { ...q, page_size: 200 });
      setActive(res.results || res);
    } catch (err) {
      show(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [statusF, dueF, sortF, search, show]);

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      const q = {};
      const s = search.trim();
      if (s) q.search = s;
      const res = await api.list("debts/history/", { ...q, page_size: 200 });
      setHistory(res.results || res);
    } catch (err) {
      show(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [search, show]);

  useEffect(() => {
    loadStats();
  }, [loadStats, reload]);

  useEffect(() => {
    if (tab === "active") loadActive();
    else loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, statusF, dueF, sortF, reload]);

  // search — 300ms debounce
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      if (tab === "active") loadActive();
      else loadHistory();
    }, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const onPaid = (result) => {
    // Backend asosiy manba: to'liq to'langan qarz endi active'da qaytmaydi.
    // Frontend ham qo'shimcha protection sifatida darhol olib tashlaydi.
    setActive((prev) => prev.filter((d) => d.id !== result.id));
    setHistory((prev) => (Number(result.remaining_amount) <= 0 ? [result, ...prev] : prev));
    loadStats();
  };

  const openDetail = async (d) => {
    try {
      const data = await api.get(`debts/${d.id}/`);
      setDetail(data);
      setDetailOpen(true);
    } catch (err) {
      show(err.message, "error");
    }
  };

  const openPay = (d) => {
    setPayDebt(d.id ? d : detail);
    setPayOpen(true);
  };

  const closePay = () => {
    setPayOpen(false);
    // detail'ni yangilash (to'lovdan keyin qolgan qarz yangi)
    setReload((r) => r + 1);
    setDetail(null);
    setDetailOpen(false);
  };

  const createDebt = async () => {
    const amount = Number(newAmount);
    const phone = (newPhone || "").trim();
    if (!phone) return show("Telefon raqamini kiriting", "error");
    if (!amount || amount <= 0) return show("Qarz miqdorini kiriting", "error");
    if (!newDue) return show("To'lash muddatini tanlang", "error");
    setCreating(true);
    try {
      let customer = null;
      try {
        customer = await api.get(`customers/by-phone/${encodeURIComponent(phone)}/`);
      } catch {
        customer = await api.post("customers/", { name: newName.trim() || phone, phone });
      }
      await api.post("debts/", {
        customer_id: customer.id,
        original_amount: amount,
        due_date: newDue,
        note: "Qo'lda qarz yozildi",
      });
      show("Qarz yozildi", "ok");
      setNewOpen(false);
      setNewPhone("");
      setNewName("");
      setNewAmount("");
      setReload((r) => r + 1);
      loadStats();
    } catch (err) {
      show(err.message, "error");
    } finally {
      setCreating(false);
    }
  };

  const exportCSV = async () => {
    try {
      const { access } = useAuthStore.getState();
      const res = await fetch(`${BASE}/debts/export/`, {
        headers: access ? { Authorization: `Bearer ${access}` } : {},
      });
      if (!res.ok) throw new Error("CSV yuklab bo'lmadi");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `qarzdorlik-${todayISO()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      show("CSV yuklab olindi", "ok");
    } catch (err) {
      show(err.message, "error");
    }
  };

  const statusChips = [
    { v: "", t: "Hammasi" },
    { v: "overdue", t: "Muddati o'tgan" },
    { v: "active", t: "Aktiv" },
    { v: "partially_paid", t: "Qisman" },
  ];

  const dueChips = [
    { v: "", t: "Barcha muddat" },
    { v: "overdue", t: "Muddati o'tgan" },
    { v: "today", t: "Bugun" },
    { v: "week", t: "Bu hafta" },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="page-head">
        <div>
          <h1>Qarzdorlik</h1>
          <div className="sub">Nasiya (qarzga) sotuvlar va ularning to'lovlari</div>
        </div>
        {tab === "active" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {isOwner && (
              <button className="btn btn-primary btn-sm" onClick={() => setNewOpen(true)}>
                <Icon name="plus" /> Yangi qarz
              </button>
            )}
            <button className="btn btn-accent btn-sm" onClick={exportCSV}>
              <Icon name="download" /> CSV
            </button>
            <div className="stat-chip" style={{ color: "var(--brand-light)" }}>
              Umumiy qarz: <b className="mono">{formatMoney(Number(stats?.total_debt || 0))}</b>
            </div>
          </div>
        )}
      </div>

      {/* Stats kartalar */}
      <div className="stats-grid" style={{ marginTop: 16 }}>
        {[
          { label: "Umumiy qarz", value: formatMoney(stats?.total_debt), icon: "money", color: "var(--brand-light)" },
          { label: "Muddati o'tgan", value: formatMoney(stats?.overdue_debt), icon: "alert", color: "var(--danger)" },
          { label: "Bugun to'lanadi", value: formatMoney(stats?.due_today), icon: "clock", color: "var(--warn)" },
          { label: "Qarzdorlar", value: String(stats?.debtors_count ?? "—"), icon: "users", color: "var(--accent)" },
          { label: "Yig'ilgan", value: formatMoney(stats?.collected), icon: "check", color: "var(--success)" },
        ].map((s) => (
          <div key={s.label} className="stat-card glass-panel">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: s.color, display: "inline-flex" }}>
                <Icon name={s.icon} size={20} />
              </span>
              <div>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value mono" style={{ color: s.color }}>{s.value}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card glass-panel" style={{ marginTop: 16 }}>
        {/* Tabs + filtrlar */}
        <div className="debt-tabs">
          <button className={`debt-tab ${tab === "active" ? "active" : ""}`} onClick={() => setTab("active")}>
            Aktiv qarzlar
            {active.filter((d) => Number(d.remaining_amount) > 0).length > 0 && (
              <span className="debt-tab-count">{active.filter((d) => Number(d.remaining_amount) > 0).length}</span>
            )}
          </button>
          <button className={`debt-tab ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>
            Qarzlar tarixi
          </button>
        </div>

        <div className="quick-add-head" style={{ marginTop: 14 }}>
          <input
            className="input mono"
            placeholder={tab === "active" ? "Mijoz (ism/telefon) izlash..." : "Tarixdan qidirish..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 170 }}
          />
          {tab === "active" && (
            <>
              <select className="input" value={statusF} onChange={(e) => setStatusF(e.target.value)} style={{ width: 165 }}>
                {statusChips.map((c) => (
                  <option key={c.v} value={c.v}>{c.t}</option>
                ))}
              </select>
              <select className="input" value={dueF} onChange={(e) => setDueF(e.target.value)} style={{ width: 150 }}>
                {dueChips.map((c) => (
                  <option key={c.v} value={c.v}>{c.t}</option>
                ))}
              </select>
              <select className="input" value={sortF} onChange={(e) => setSortF(e.target.value)} style={{ width: 150 }}>
                <option value="">Muddat bo'yicha</option>
                <option value="-amount">Eng katta qarz</option>
                <option value="amount">Eng kichik qarz</option>
                <option value="-remaining">Eng ko'p qolgan</option>
              </select>
            </>
          )}
        </div>

        {loading && (tab === "active" ? active.length === 0 : history.length === 0) ? (
          <div className="sub" style={{ padding: 24 }}>Yuklanmoqda...</div>
        ) : tab === "active" ? (
          active.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: 32, marginBottom: 6 }}>🎉</div>
              <b>Qarzdorlar yo'q</b>
              <div className="sub">Barcha qarzlar yopilgan. Kassada "Nasiya" usulida savdo qilinsa, qarzlar shu yerda paydo bo'ladi.</div>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data-table debt-table">
                <thead>
                  <tr>
                    <th>Mijoz</th>
                    <th>Qarz</th>
                    <th className="hide-m">To'langan</th>
                    <th>Qoldiq</th>
                    <th>Muddat</th>
                    <th>Status</th>
                    <th>Amal</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((d) => {
                    const remaining = Number(d.remaining_amount);
                    const meta = statusMeta(d.effective_status);
                    const pct = Number(d.paid_percent || 0);
                    return (
                      <tr key={d.id} className="row-hover" data-id={d.id}>
                        <td data-label="Mijoz">
                          <button className="link-btn" onClick={() => openDetail(d)}>
                            {d.customer_name}
                            <div className="sub mono">{d.customer_phone}</div>
                          </button>
                        </td>
                        <td data-label="Qarz">
                          <b className="mono" style={{ color: d.effective_status === "overdue" ? "var(--danger)" : "var(--ink)" }}>
                            {formatMoney(remaining)}
                          </b>
                          <div className="sub" style={{ fontSize: 11 }}>/ {formatMoney(d.original_amount)}</div>
                        </td>
                        <td data-label="To'langan" className="hide-m">
                          <div className="debt-progress" style={{ "--pct": `${Math.min(pct, 100)}%` }}>
                            <div className="debt-progress-fill" />
                          </div>
                          <div className="sub mono" style={{ fontSize: 11 }}>{pct}%</div>
                        </td>
                        <td data-label="Qoldiq">
                          <b className="mono" style={{ color: remaining > 0 ? "var(--warn)" : "var(--success)" }}>
                            {formatMoney(remaining)}
                          </b>
                        </td>
                        <td data-label="Muddat">
                          <div className="mono" style={{ color: d.effective_status === "overdue" ? "var(--danger)" : "var(--ink-soft)" }}>
                            {fmtDate(d.due_date)}
                          </div>
                        </td>
                        <td data-label="Status">
                          <span className={`badge ${meta.cls}`}>{meta.txt}</span>
                        </td>
                        <td data-label="Amal">
                          <div style={{ display: "flex", gap: 6 }}>
                            {remaining > 0 && (
                              <button className="btn btn-primary btn-sm" onClick={() => openPay(d)}>
                                To'lov
                              </button>
                            )}
                            <button className="ghost-btn" onClick={() => openDetail(d)}>
                              Batafsil
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : history.length === 0 ? (
          <div className="empty-state">
            <b>Qarzlar tarixi bo'sh</b>
            <div className="sub">To'liq to'langan qarzlar shu yerda ko'rsatiladi.</div>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table history-table">
              <thead>
                <tr>
                  <th>Mijoz</th>
                  <th>Summa</th>
                  <th>To'langan</th>
                  <th>Yopilgan sana</th>
                  <th className="hide-m">Kassir</th>
                  <th>Status</th>
                  <th>Amal</th>
                </tr>
              </thead>
              <tbody>
                {history.map((d) => (
                  <tr key={d.id} className="row-hover">
                    <td data-label="Mijoz">
                      <button className="link-btn" onClick={() => openDetail(d)}>
                        {d.customer_name}
                        <div className="sub mono">{d.customer_phone}</div>
                      </button>
                    </td>
                    <td data-label="Summa"><b className="mono">{formatMoney(d.original_amount)}</b></td>
                    <td data-label="To'langan" className="mono" style={{ color: "var(--success)" }}>{formatMoney(d.paid_amount)}</td>
                    <td data-label="Yopilgan" className="mono">{d.paid_at ? fmtDate(d.paid_at) : "—"}</td>
                    <td data-label="Kassir" className="hide-m">{d.paid_by_name || "—"}</td>
                    <td data-label="Status"><span className={`badge ${statusMeta(d.effective_status).cls}`}>{statusMeta(d.effective_status).txt}</span></td>
                    <td data-label="Amal">
                      <button className="ghost-btn" onClick={() => openDetail(d)}>
                        Ko'rish
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Qarz batafsil */}
      <DebtDetailModal
        debt={detail}
        open={detailOpen && !payOpen}
        onClose={() => setDetailOpen(false)}
        onPay={openPay}
      />

      {/* To'lov */}
      <DebtPaymentModal
        debt={payDebt}
        open={payOpen}
        onClose={closePay}
        onPaid={onPaid}
      />

      {/* Yangi qarz (egasi/admin) */}
      <Modal open={newOpen} onClose={() => { if (!creating) setNewOpen(false); }}>
        <div>
          <h3>Yangi qarz yozish</h3>
          <div className="sub" style={{ marginBottom: 18 }}>
            Telefon avtomatik topiladi, topilmasa yangi mijoz sifatida yaratiladi.
          </div>
          <div className="field">
            <label>Telefon raqam</label>
            <input className="input mono" placeholder="+998 90 123 45 67" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
          </div>
          <div className="field">
            <label>Mijoz ismi (yangi bo'lsa)</label>
            <input className="input" placeholder="Masalan: Alisher" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Qarz miqdori (so'm)</label>
              <input className="input mono" type="number" min="1" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="field">
              <label>To'lash muddati</label>
              <input className="input mono" type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
            </div>
          </div>
          <div className="grid-2">
            <button className="btn btn-ghost" onClick={() => setNewOpen(false)} disabled={creating}>
              Bekor qilish
            </button>
            <button className="btn btn-primary" disabled={creating} onClick={createDebt}>
              <Icon name="check" /> {creating ? "Saqlanmoqda..." : "Qarzni yozish"}
            </button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}

export default DebtsPage;