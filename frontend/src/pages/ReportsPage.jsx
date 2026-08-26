import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";

import { api } from "../api/client";
import { Modal } from "../components/Modal";
import { useToast } from "../components/Toast";
import { daysAgoISO, formatMoney, todayISO } from "../utils/format";
import { useCountUp } from "../hooks/useCountUp";

const PAY_COLORS = { cash: "#6366f1", card: "#818cf8", click: "#FF8A3D", payme: "#5B8DEF" };

function AnimatedStat({ label, value, plain }) {
  const animated = useCountUp(Number(value || 0), { duration: 700 });
  return (
    <motion.div
      className="stat-card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
    >
      <div className="label">{label}</div>
      <div className={`value ${plain ? "plain" : ""}`}>
        {plain ? Math.round(animated) : formatMoney(animated)}
      </div>
    </motion.div>
  );
}

/**
 * Hisobotlar sahifasi: davr tanlash, savdo grafigi, top mahsulotlar, kassirlar taqqoslash.
 */
export function ReportsPage() {
  const [from, setFrom] = useState(daysAgoISO(6));
  const [clearOpen, setClearOpen] = useState(false);
  const secretTapsRef = useRef({ n: 0, t: 0 });
  const [clearConfirm, setClearConfirm] = useState("");
  const queryClient = useQueryClient();
  const { show } = useToast();

  const clearMutation = useMutation({
    mutationFn: () =>
      api.del(`reports/clear/?confirm=${encodeURIComponent(clearConfirm.trim())}`),
    onSuccess: (res) => {
      show(`Barcha savdo tarixi tozalandi (${res?.deleted ?? 0} ta savdo).`, "success");
      setClearOpen(false);
      setClearConfirm("");
      queryClient.invalidateQueries();
    },
    onError: (e) => show(e.message, "error"),
  });
  const [to, setTo] = useState(todayISO());

  const { data, isLoading } = useQuery({
    queryKey: ["reports", from, to],
    queryFn: () => api.get(`reports/summary/?from=${from}&to=${to}`),
  });

  const { data: debtStats } = useQuery({
    queryKey: ["debt-stats"],
    queryFn: () => api.get("debts/stats/"),
  });

  const { data: topDebtors } = useQuery({
    queryKey: ["debt-top"],
    queryFn: () => api.get("debts/top/"),
  });

  const dailySeries = useMemo(
    () => (data?.daily_series || []).map((d) => ({ ...d, day: String(d.day).slice(0, 10) })),
    [data]
  );

  const topProducts = useMemo(
    () =>
      (data?.top_products || []).map((p, i) => ({
        name: p.product_name_snapshot,
        amount: Number(p.total_amount || 0),
        qty: Number(p.total_qty || 0),
        rank: i + 1,
      })),
    [data]
  );

  const byCashier = useMemo(() => (data?.by_cashier || []).map((c) => ({ name: c.cashier__username || "Noma'lum", total: Number(c.total || 0), count: c.count })), [data]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1
            style={{ cursor: "default", userSelect: "none" }}
            onClick={() => {
              const now = Date.now();
              const st = secretTapsRef.current;
              st.n = now - st.t < 1500 ? st.n + 1 : 1;
              st.t = now;
              if (st.n >= 5) {
                st.n = 0;
                setClearOpen(true);
                setClearConfirm("");
              }
            }}
          >
            Hisobotlar
          </h1>
          <div className="sub">Savdo natijalari va tahlil</div>
        </div>
        <div className="flex">
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label">Dan</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label">Gacha</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="empty-state">Yuklanmoqda...</div>
      ) : (
        <>
          <div className="stat-grid">
            <AnimatedStat label="Jami savdo" value={data?.total_revenue} />
            <AnimatedStat label="Foyda" value={data?.total_profit} />
            <AnimatedStat label="Sotuvlar soni" value={data?.sale_count} plain />
            <AnimatedStat label="Mahsulotlar" value={data?.items_sold} plain />
            <AnimatedStat
              label="O'rtacha chek"
              value={
                data?.sale_count ? Math.round((data.total_revenue || 0) / data.sale_count) : 0
              }
            />
          </div>

          <div className="stat-grid">
            <AnimatedStat label="💸 Jami xarajat" value={data?.total_expenses} />
            <AnimatedStat label="💰 Sof foyda" value={data?.net_profit} />
          </div>

          {/* Qarzdorlik xulosasi */}
          {debtStats && (
            <>
              <div className="stat-grid">
                <AnimatedStat label="Qolgan qarzlar" value={debtStats.total_debt} />
                <AnimatedStat label="Muddati o'tgan" value={debtStats.overdue_debt} />
                <AnimatedStat label="Yig'ilgan to'lovlar" value={debtStats.collected} />
                <AnimatedStat label="Qarzdorlar" value={debtStats.debtors_count} plain />
              </div>
              {topDebtors && topDebtors.length > 0 && (
                <div className="chart-card">
                  <h3>Top qarzdorlar</h3>
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Mijoz</th>
                          <th>Telefon</th>
                          <th>Balans</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topDebtors.map((d, i) => (
                          <tr key={d.id}>
                            <td className="mono">{i + 1}</td>
                            <td>{d.name}</td>
                            <td className="mono">{d.phone}</td>
                            <td className="mono" style={{ color: "var(--warn)" }}>{formatMoney(d.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="chart-card">
            <h3>Kunlik savdo</h3>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={dailySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3e8df" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} width={70} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                <Tooltip formatter={(v) => formatMoney(v)} />
                <Bar dataKey="total" fill="#29C77D" radius={[6, 6, 0, 0]} name="Savdo" />
                <Line dataKey="count" type="monotone" stroke="#FF8A3D" strokeWidth={2} dot={false} name="Cheklar" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="grid-2">
            <div className="chart-card">
              <h3>Top mahsulotlar</h3>
              {topProducts.length === 0 ? (
                <div className="empty-state" style={{ padding: 20 }}>
                  Bu davrda sotuv yo'q
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Mahsulot</th>
                        <th>Miqdor</th>
                        <th>Summa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProducts.map((p) => (
                        <tr key={p.rank}>
                          <td className="mono">{p.rank}</td>
                          <td>{p.name}</td>
                          <td className="mono">{p.qty}</td>
                          <td className="mono">{formatMoney(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="chart-card">
              <h3>Kassirlar kesimida</h3>
              {byCashier.length === 0 ? (
                <div className="empty-state" style={{ padding: 20 }}>Ma'lumot yo'q</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={byCashier} dataKey="total" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={3}>
                      {byCashier.map((_, i) => (
                        <Cell key={i} fill={PAY_COLORS[["cash", "card", "click", "payme"][i % 4]]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatMoney(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
              {byCashier.length > 0 && (
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table className="data">
                    <tbody>
                      {byCashier.map((c) => (
                        <tr key={c.name}>
                          <td>{c.name}</td>
                          <td className="mono">{c.count} ta</td>
                          <td className="mono">{formatMoney(c.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <Modal open={clearOpen} onClose={() => setClearOpen(false)}>
        <div>
          <h3>Barcha savdoni o'chirish</h3>
          <p className="muted" style={{ marginTop: 8 }}>
            Diqqat! Do'kondagi <b>BARCHA savdo tarixi</b> butunlay o'chiriladi —
            jami savdo, foyda, grafiklar <b>0</b> bo'ladi. Mahsulotlar va
            qarzlar tegilmaydi. Bu amalni <b>qaytarib bo'lmaydi</b>.
          </p>
          <div className="field" style={{ marginTop: 14 }}>
            <label>
              Tasdiqlash uchun <b className="mono">O'CHIRISH</b> deb yozing:
            </label>
            <input
              className="input"
              value={clearConfirm}
              onChange={(e) => setClearConfirm(e.target.value)}
              placeholder="O'CHIRISH"
              autoFocus
            />
          </div>
          <div className="grid-2" style={{ marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => setClearOpen(false)}>
              Bekor qilish
            </button>
            <button
              className="btn btn-danger"
              disabled={clearConfirm.trim().toUpperCase() !== "O'CHIRISH" || clearMutation.isPending}
              onClick={() => clearMutation.mutate()}
            >
              {clearMutation.isPending ? "Tozalanmoqda..." : "Ha, hammasini o'chirish"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default ReportsPage;