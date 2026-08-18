import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { api } from "../api/client";
import { useAuthStore } from "../stores/authStore";
import { useToast } from "../components/Toast";
import { Modal } from "../components/Modal";
import Icon from "../components/Icon";
import { formatMoney, formatDateTime } from "../utils/format";

function txnLabel(t) {
  if (t.type === "debt") return { txt: "Qarz", cls: "txn-debt" };
  if (t.type === "payment") return { txt: "To'lov", cls: "txn-pay" };
  return { txt: "Tuzatish", cls: "txn-adj" };
}

export function DebtsPage() {
  const user = useAuthStore((s) => s.user);
  const { show } = useToast();
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [paying, setPaying] = useState(false);
  const [reload, setReload] = useState(0);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const q = search.trim();
      const res = await api.get(`customers/?search=${encodeURIComponent(q)}&page_size=200`);
      setCustomers(res.results || res);
    } catch (err) {
      show(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [search, show]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, reload]);

  const openDetail = async (c) => {
    try {
      const data = await api.get(`customers/${c.id}/`);
      setDetail(data);
    } catch (err) {
      show(err.message, "error");
    }
  };

  const openPay = (c) => {
    setDetail(c);
    setPayOpen(true);
    setPayAmount("");
    setPayNote("");
  };

  const submitPay = async () => {
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      show("To'lov miqdorini kiriting", "error");
      return;
    }
    setPaying(true);
    try {
      const res = await api.post(`customers/${detail.id}/pay/`, {
        amount,
        type: "payment",
        note: payNote,
      });
      setDetail(res);
      setPayOpen(false);
      setReload((r) => r + 1);
      show(res.deleted ? "Qarz to'liq yopildi — mijoz ro'yxatdan o'chirildi" : "To'lov qabul qilindi", "success");
    } catch (err) {
      show(err.message, "error");
    } finally {
      setPaying(false);
    }
  };

  const totalDebt = customers.reduce((s, c) => s + Number(c.balance || 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="page-head">
        <div>
          <h1>Qarzdorlar</h1>
          <div className="sub">
            Nasiya (qarzga) sotuvi yuritiladigan mijozlar ro'yxati
          </div>
        </div>
        <div className="stat-chip" style={{ color: "var(--brand-light)" }}>
          Umumiy qarz: <b className="mono">{formatMoney(totalDebt)}</b>
        </div>
      </div>

      <div className="card glass-panel" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <input
            className="input mono"
            placeholder="Ism bo'yicha qidirish..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="sub" style={{ padding: 24 }}>Yuklanmoqda...</div>
        ) : customers.length === 0 ? (
          <div className="empty-state">
            Qarzdor mijozlar hozircha yo'q. Kassada "Nasiya" usulida savdo qilinganda
            mijoz avtomatik shu yerga tushadi.
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mijoz</th>
                  <th>Telefon</th>
                  <th>Qarzi</th>
                  <th>Status</th>
                  <th style={{ width: 150 }}>Amal</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c, i) => {
                  const settled = Number(c.balance) <= 0;
                  return (
                    <tr
                      key={c.id}
                      className="row-hover"
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      <td>
                        <button className="link-btn" onClick={() => openDetail(c)}>
                          {c.name || c.phone}
                        </button>
                      </td>
                      <td className="mono">{c.phone}</td>
                      <td>
                        <b className="mono" style={{ color: settled ? "var(--ink-soft)" : "var(--warn)" }}>
                          {formatMoney(c.balance)}
                        </b>
                      </td>
                      <td>
                        <span className={`badge ${settled ? "badge-ok" : "badge-warn"}`}>
                          {settled ? "Yopilgan" : "Qarzdor"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openPay(c)}>
                            To'lov qabul
                          </button>
                          <button className="ghost-btn" onClick={() => openDetail(c)}>
                            Tarix
                          </button>
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

      {/* Mijoz detal + tarix */}
      <Modal open={!!detail && !payOpen} onClose={() => setDetail(null)} size="lg">
        {detail && (
          <div>
            <div className="flex spread" style={{ marginBottom: 14 }}>
              <div>
                <h3>{detail.name || detail.phone}</h3>
                <div className="sub mono">{detail.phone}</div>
              </div>
              <div className="stat-chip">
                Balans:{" "}
                <b className="mono" style={{ color: Number(detail.balance) <= 0 ? "var(--success)" : "var(--warn)" }}>
                  {formatMoney(detail.balance)}
                </b>
              </div>
            </div>

            <div className="grid-2" style={{ marginBottom: 18 }}>
              <button className="btn btn-primary" onClick={() => openPay(detail)}>
                <Icon name="plus" /> To'lov qabul qilish
              </button>
              <button className="btn btn-ghost" onClick={() => window.print()}>
                <Icon name="printer" /> Chop etish
              </button>
            </div>

            <h4 style={{ margin: "6px 0 10px" }}>Tarix</h4>
            {detail.transactions && detail.transactions.length > 0 ? (
              <div className="txn-list">
                {detail.transactions.map((t) => {
                  const meta = txnLabel(t);
                  return (
                    <div key={t.id} className={`txn-row ${meta.cls}`}>
                      <span className="badge badge-txn">{meta.txt}</span>
                      <span className="mono txn-note">
                        {t.note || (t.sale ? `#${t.sale}` : "")}
                      </span>
                      <span className="mono txn-amount">{formatMoney(t.amount)}</span>
                      <span className="sub">{formatDateTime(t.created_at)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">Tranzaksiyalar yo'q</div>
            )}
          </div>
        )}
      </Modal>

      {/* To'lov qabul qilish */}
      <Modal open={payOpen} onClose={() => setPayOpen(false)}>
        <h3>Qarz to'lovi</h3>
        <div className="sub" style={{ marginBottom: 18 }}>
          {detail?.name} · <span className="mono">{detail?.phone}</span> — qarzi{" "}
          <b className="mono">{formatMoney(detail?.balance)}</b>
        </div>
        <div className="field">
          <label>To'lov miqdori (so'm)</label>
          <input
            className="input mono"
            type="number"
            min="1"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            placeholder="Qarz miqdoridan oshmasligi kerak"
          />
        </div>
        <div className="field">
          <label>Izoh (ixtiyoriy)</label>
          <input
            className="input"
            value={payNote}
            onChange={(e) => setPayNote(e.target.value)}
            placeholder="Masalan: 10.08.2026 qisman to'lov"
          />
        </div>
        <div className="grid-2">
          <button className="btn btn-ghost" onClick={() => setPayOpen(false)}>
            Bekor qilish
          </button>
          <button className="btn btn-primary" disabled={paying} onClick={submitPay}>
            <Icon name="check" /> To'langanini tasdiqlash
          </button>
        </div>
      </Modal>
    </motion.div>
  );
}

export default DebtsPage;