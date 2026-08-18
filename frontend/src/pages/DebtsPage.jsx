import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { api } from "../api/client";
import { useAuthStore } from "../stores/authStore";
import { useToast } from "../components/Toast";
import { Modal } from "../components/Modal";
import Icon from "../components/Icon";
import { formatDateTime, formatMoney, todayISO } from "../utils/format";

const BASE = import.meta.env.VITE_API_URL || "/api";

const STATUS_META = {
  active: { txt: "Aktiv", cls: "badge-ok" },
  partially_paid: { txt: "Qisman to'langan", cls: "badge-pay" },
  overdue: { txt: "Muddati o'tgan", cls: "badge-low" },
  paid: { txt: "To'langan", cls: "badge-ok" },
  cancelled: { txt: "Bekor qilingan", cls: "badge-txn" },
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

  const [debts, setDebts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [due, setDue] = useState("");
  const [sort, setSort] = useState("");
  const [reload, setReload] = useState(0);

  // Tarix / to'lov
  const [detail, setDetail] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payNote, setPayNote] = useState("");
  const [paying, setPaying] = useState(false);
  const [payDone, setPayDone] = useState(null);

  // Yangi qarz (faqat egasi/admin)
  const [newOpen, setNewOpen] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDue, setNewDue] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  });
  const [creating, setCreating] = useState(false);

  const query = useCallback(() => {
    const q = {};
    if (status) q.status = status;
    if (due) q.due = due;
    if (sort) q.sort = sort;
    const s = search.trim();
    if (s) q.search = s;
    return q;
  }, [status, due, sort, search]);

  const loadDebts = useCallback(
    async (keep = false) => {
      try {
        if (!keep) setLoading(true);
        const res = await api.list("debts/", { ...query(), page_size: 200 });
        setDebts(res.results || res);
      } catch (err) {
        show(err.message, "error");
      } finally {
        setLoading(false);
      }
    },
    [query, show]
  );

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get("debts/stats/");
      setStats(res);
    } catch {
      /* stats kartalar ko'rinmay qolsa ham ro'yxat ishlayveradi */
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadDebts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, due, sort, reload]);

  useEffect(() => {
    loadDebts(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const openDetail = async (d) => {
    try {
      const data = await api.get(`debts/${d.id}/`);
      setDetail(data);
    } catch (err) {
      show(err.message, "error");
    }
  };

  const openPay = (d) => {
    setDetail(d);
    setPayOpen(true);
    setPayAmount("");
    setPayNote("");
    setPayMethod("cash");
    setPayDone(null);
  };

  const closePay = () => {
    setPayOpen(false);
    setPayDone(null);
    setReload((r) => r + 1);
    loadStats();
  };

  const submitPay = async () => {
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      show("To'lov miqdorini kiriting", "error");
      return;
    }
    const remaining = Number(detail?.remaining_amount || 0);
    if (amount > remaining) {
      show(`To'lov summasi qolgan qarzdan oshib ketdi. Qolgan qarz: ${formatMoney(remaining)}`, "error");
      return;
    }
    setPaying(true);
    try {
      const res = await api.post(`debts/${detail.id}/pay/`, {
        amount,
        payment_method: payMethod,
        note: payNote,
      });
      setPayDone(res);
      loadStats();
      setReload((r) => r + 1);
    } catch (err) {
      show(err.message, "error");
    } finally {
      setPaying(false);
    }
  };

  const cancelDebt = async (d) => {
    if (!window.confirm(`${d.customer_name} qarzini bekor qilasizmi?`)) return;
    try {
      const res = await api.post(`debts/${d.id}/cancel/`);
      show("Qarz bekor qilindi", "ok");
      setDetail(null);
      setReload((r) => r + 1);
      loadStats();
    } catch (err) {
      show(err.message, "error");
    }
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

  const totalDebt = Number(stats?.total_debt || 0);

  const statusChips = [
    { v: "", t: "Hammasi" },
    { v: "overdue", t: "Muddati o'tgan" },
    { v: "active", t: "Aktiv" },
    { v: "partially_paid", t: "Qisman" },
    { v: "paid", t: "To'langan" },
    { v: "cancelled", t: "Bekor" },
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
          <div className="sub">Nasiya (qarzga) sotuvlar, muddatlar, to'lovlar</div>
        </div>
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
            Umumiy qarz: <b className="mono">{formatMoney(totalDebt)}</b>
          </div>
        </div>
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
                <div className="stat-value mono" style={{ color: s.color }}>
                  {s.value}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtrlar */}
      <div className="card glass-panel" style={{ marginTop: 16 }}>
        <div className="quick-add-head">
          <input
            className="input mono"
            placeholder="Mijoz izlash..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 180 }}
          />
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 170 }}>
            {statusChips.map((c) => (
              <option key={c.v} value={c.v}>{c.t}</option>
            ))}
          </select>
          <select className="input" value={due} onChange={(e) => setDue(e.target.value)} style={{ width: 160 }}>
            {dueChips.map((c) => (
              <option key={c.v} value={c.v}>{c.t}</option>
            ))}
          </select>
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 150 }}>
            <option value="">Muddat bo'yicha</option>
            <option value="-amount">Eng katta qarz</option>
            <option value="amount">Eng kichik qarz</option>
            <option value="-remaining">Eng ko'p qolgan</option>
            <option value="due_date">Eng yaqin muddat</option>
          </select>
        </div>

        {loading && debts.length === 0 ? (
          <div className="sub" style={{ padding: 24 }}>Yuklanmoqda...</div>
        ) : debts.length === 0 ? (
          <div className="empty-state">
            Qarzlar hozircha yo'q. Kassada "Nasiya" usulida savdo qilinganda yoki egasi
            "Yangi qarz" tugmasi orqali qarz yozish mumkin.
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mijoz</th>
                  <th>Qarz</th>
                  <th style={{ width: 150 }}>To'langan</th>
                  <th>Muddat</th>
                  <th>Holat</th>
                  <th style={{ width: 190 }}>Amal</th>
                </tr>
              </thead>
              <tbody>
                {debts.map((d, i) => {
                  const meta = statusMeta(d.effective_status);
                  const pct = Number(d.paid_percent || 0);
                  return (
                    <tr key={d.id} className="row-hover" style={{ animationDelay: `${Math.min(i, 24) * 30}ms` }}>
                      <td>
                        <button className="link-btn" onClick={() => openDetail(d)}>
                          {d.customer_name}
                          <div className="sub mono">{d.customer_phone}</div>
                        </button>
                      </td>
                      <td>
                        <b className="mono" style={{ color: d.effective_status === "overdue" ? "var(--danger)" : "var(--ink)" }}>
                          {formatMoney(d.remaining_amount)}
                        </b>
                        <div className="sub" style={{ fontSize: 11 }}>/ {formatMoney(d.original_amount)}</div>
                      </td>
                      <td>
                        <div className="debt-progress" style={{ "--pct": `${Math.min(pct, 100)}%` }}>
                          <div className="debt-progress-fill" />
                        </div>
                        <div className="sub mono" style={{ fontSize: 11 }}>{pct}%</div>
                      </td>
                      <td>
                        <div className="mono" style={{ color: d.effective_status === "overdue" ? "var(--danger)" : "var(--ink-soft)" }}>
                          {fmtDate(d.due_date)}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${meta.cls}`}>{meta.txt}</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-primary btn-sm" disabled={Number(d.remaining_amount) <= 0} onClick={() => openPay(d)}>
                            To'lov
                          </button>
                          <button className="ghost-btn" onClick={() => openDetail(d)}>
                            Tarix
                          </button>
                          {isOwner && (
                            <button
                              className="ghost-btn"
                              style={{ color: "var(--danger)" }}
                              disabled={Number(d.remaining_amount) <= 0}
                              onClick={() => cancelDebt(d)}
                            >
                              Bekor
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Qarz detal + to'lovlar tarixi */}
      <Modal open={!!detail && !payOpen} onClose={() => setDetail(null)} size="lg">
        {detail && (
          <div>
            <div className="flex spread" style={{ marginBottom: 14 }}>
              <div>
                <h3>{detail.customer_name}</h3>
                <div className="sub mono">{detail.customer_phone}</div>
              </div>
              <div className="stat-chip">
                Qolgan:{" "}
                <b className="mono" style={{ color: Number(detail.remaining_amount) > 0 ? "var(--danger)" : "var(--success)" }}>
                  {formatMoney(detail.remaining_amount)}
                </b>
              </div>
            </div>

            <div className="grid-2">
              <div className="debt-info-row"><span>Boshlang'ich qarz</span><b className="mono">{formatMoney(detail.original_amount)}</b></div>
              <div className="debt-info-row"><span>To'langan</span><b className="mono">{formatMoney(detail.paid_amount)}</b></div>
              <div className="debt-info-row"><span>To'lash muddati</span><b className="mono">{fmtDate(detail.due_date)}</b></div>
              <div className="debt-info-row"><span>Holat</span><b><span className={`badge ${statusMeta(detail.effective_status).cls}`}>{statusMeta(detail.effective_status).txt}</span></b></div>
            </div>

            <div className="debt-progress" style={{ "--pct": `${Math.min(Number(detail.paid_percent || 0), 100)}%`, margin: "14px 0 4px" }}>
              <div className="debt-progress-fill" />
            </div>
            <div className="sub" style={{ marginBottom: 12 }}>
              To'langan: <b className="mono">{detail.paid_percent}%</b>
            </div>

            {Number(detail.remaining_amount) > 0 && (
              <button className="btn btn-primary btn-block" style={{ marginBottom: 18 }} onClick={() => openPay(detail)}>
                <Icon name="money" /> To'lov qabul qilish
              </button>
            )}

            <h4 style={{ margin: "6px 0 10px" }}>To'lovlar tarixi</h4>
            {detail.payments && detail.payments.length > 0 ? (
              <div className="txn-list">
                {detail.payments.map((p) => (
                  <div key={p.id} className="txn-row txn-pay">
                    <span className="badge badge-pay">
                      {p.method_display}
                    </span>
                    <span className="mono txn-note">{p.note || p.received_by_name || "To'lov"}</span>
                    <span className="mono txn-amount">{formatMoney(p.amount)}</span>
                    <span className="sub">{formatDateTime(p.created_at)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">Hali to'lovlar yo'q</div>
            )}
          </div>
        )}
      </Modal>

      {/* To'lov qabul qilish */}
      <Modal open={payOpen} onClose={() => { if (!paying) closePay(); }}>
        {!payDone ? (
          <AnimatePresence mode="wait">
            <motion.div key="pay" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <h3>Qarz to'lovi</h3>
              <div className="sub" style={{ marginBottom: 18 }}>
                {detail?.customer_name} · <span className="mono">{detail?.customer_phone}</span> — qolgan qarz{" "}
                <b className="mono">{formatMoney(detail?.remaining_amount)}</b>
              </div>

              <div className="quick-amounts" style={{ marginBottom: 14 }}>
                {[0.25, 0.5, 0.75, 1].map((f) => (
                  <button
                    key={f}
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPayAmount(Math.floor(Number(detail?.remaining_amount) * f))}
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
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="Qolgan qarzdan oshmasligi kerak"
                />
              </div>
              <div className="field">
                <label>To'lov usuli</label>
                <select className="input" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                  <option value="cash">Naqd</option>
                  <option value="card">Karta</option>
                  <option value="mixed">Aralash</option>
                </select>
              </div>
              <div className="field">
                <label>Izoh (ixtiyoriy)</label>
                <input className="input" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Masalan: 3-qism to'lov" />
              </div>
              <div className="grid-2">
                <button className="btn btn-ghost" onClick={closePay} disabled={paying}>
                  Bekor qilish
                </button>
                <button className="btn btn-primary" disabled={paying} onClick={submitPay}>
                  <Icon name="check" /> {paying ? "Saqlanmoqda..." : "To'lovni qabul etish"}
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
                width: 56,
                height: 56,
                margin: "0 auto 12px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #10b981, #34d399)",
                color: "#04231a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="check" size={28} />
            </motion.div>
            <h3>{Number(payDone.remaining_amount) <= 0 ? "Qarz to'liq yopildi" : "To'lov qabul qilindi"}</h3>
            <div className="sub" style={{ color: "var(--ink-soft)", margin: "10px 0 4px" }}>
              {Number(payDone.remaining_amount) <= 0 ? (
                <>
                  <b style={{ color: "var(--success)" }}>{payDone.customer_name}</b> qarzini to'liq to'ladi.
                </>
              ) : (
                <>
                  Qolgan qarz:{" "}
                  <b className="mono" style={{ color: "var(--warn)" }}>{formatMoney(payDone.remaining_amount)}</b>
                </>
              )}
            </div>
            <button className="btn btn-accent btn-lg btn-block" style={{ marginTop: 20 }} onClick={closePay}>
              Yopish
            </button>
          </motion.div>
        )}
      </Modal>

      {/* Yangi qarz (egasi/admin) */}
      <Modal open={newOpen} onClose={() => { if (!creating) setNewOpen(false); }}>
        <div>
          <h3>Yangi qarz yozish</h3>
          <div className="sub" style={{ marginBottom: 18 }}>
            Telefon avtomatik topiladi, topilmasa yangi mijoz sifatida yaratiladi.
          </div>
          <div className="field">
            <label>Telefon raqam</label>
            <input
              className="input mono"
              placeholder="+998 90 123 45 67"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
            />
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