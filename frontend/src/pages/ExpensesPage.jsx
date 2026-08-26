import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api/client";
import { formatMoney } from "../utils/format";
import { useToast } from "../components/Toast";

/** Kategoriyalar — taylarga mos ikonkalar */
const CATEGORIES = [
  { k: "ijara", emoji: "🏠", label: "Ijara" },
  { k: "kommunal", emoji: "⚡", label: "Kommunal" },
  { k: "ish_haqi", emoji: "👥", label: "Ish haqi" },
  { k: "tovar", emoji: "📦", label: "Tovar / Yetkazib beruvchi" },
  { k: "transport", emoji: "🚗", label: "Transport" },
  { k: "tamirlash", emoji: "🔧", label: "Ta'mirlash" },
  { k: "boshqa", emoji: "⋯", label: "Boshqa" },
];

const CAT_COLORS = [
  "#f59e0b", "#22d3ee", "#a78bfa", "#34d399",
  "#f472b6", "#60a5fa", "#fbbf24",
];

const catMeta = (k) => CATEGORIES.find((c) => c.k === k) || CATEGORIES[CATEGORIES.length - 1];
const catColor = (k) => CAT_COLORS[CATEGORIES.findIndex((c) => c.k === k) % CAT_COLORS.length] || "#22d3ee";

/** Har kategoriya uchun o'z maydonlari */
const CATEGORY_FORMS = {
  ijara: {
    periodLabel: "IJARA DAVRI",
    periodPh: "Masalan: Sentabr 2026",
    title: { label: "NIMA UCHUN", ph: "Masalan: Do'kon ijarasi" },
    supplier: { label: "KIMGA / QAYERGA", ph: "Masalan: Chilonzor tijorat" },
    qty: false,
  },
  kommunal: {
    periodLabel: "QAYSI OY",
    periodPh: "Masalan: Avgust 2026",
    title: { label: "XIZMAT TURI", ph: "Suv / Elektr / Gaz" },
    supplier: { label: "TASHKILOT", ph: "Masalan: Toshkent energo" },
    qty: false,
  },
  ish_haqi: {
    periodLabel: "QAYSI OY",
    periodPh: "Masalan: Sentabr 2026",
    title: { label: "KIMGA", ph: "Xodim ismi" },
    supplier: { label: "IZOH", ph: "Masalan: Oldindan to'lov" },
    qty: false,
  },
  tovar: {
    periodLabel: null,
    title: { label: "NIMA OLINDI", ph: "Masalan: Lays 50 quti" },
    supplier: { label: "YETKAZIB BERUVCHI", ph: "Masalan: Cheers, Ays Tea" },
    qty: true,
  },
  transport: {
    periodLabel: null,
    title: { label: "NIMA UCHUN", ph: "Masalan: Yetkazib berish" },
    supplier: { label: "KIM / QAYERGA", ph: "Masalan: Taksi" },
    qty: false,
  },
  tamirlash: {
    periodLabel: null,
    title: { label: "NIMA TAMIRLANDI", ph: "Masalan: Muzlatgich" },
    supplier: { label: "USTAXONA / USTA", ph: "Masalan: Refrizerator usta" },
    qty: false,
  },
  boshqa: {
    periodLabel: null,
    title: { label: "NIMA UCHUN", ph: "Izoh yozing" },
    supplier: { label: "KIMGA / NIMGA", ph: "—" },
    qty: false,
  },
};

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Xarajatlar — do'kon chiqimlari nazorati (mockup dizayn). */
export function ExpensesPage() {
  const qc = useQueryClient();
  const { show } = useToast();

  const [category, setCategory] = useState("ijara");
  const [period, setPeriod] = useState("");
  const [title, setTitle] = useState("");
  const [supplier, setSupplier] = useState("");
  const [qty, setQty] = useState("1");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ["expenses"],
    queryFn: () => api.list("expenses/", { page_size: 200 }),
  });

  const items = query.data?.results || [];
  const form = CATEGORY_FORMS[category] || CATEGORY_FORMS.boshqa;

  const todayStr = todayISO();
  const todayTotal = items
    .filter((x) => (x.date || (x.created_at || "").slice(0, 10)) === todayStr)
    .reduce((s, x) => s + Number(x.total_amount || 0), 0);
  const monthStr = todayStr.slice(0, 7);
  const monthItems = items.filter(
    (x) => (x.date || (x.created_at || "").slice(0, 7)) === monthStr
  );
  const grandTotal = items.reduce((s, x) => s + Number(x.total_amount || 0), 0);

  const byCategory = useMemo(() => {
    const m = {};
    for (const x of items) {
      m[x.category] = (m[x.category] || 0) + Number(x.total_amount || 0);
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [items]);

  const topCat = byCategory[0] ? catMeta(byCategory[0][0]).label : "—";

  /** Donut: conic-gradient */
  const donutSegments = useMemo(() => {
    let acc = 0;
    return byCategory.map(([k, sum]) => {
      const pct = grandTotal ? (sum / grandTotal) * 100 : 0;
      const seg = { k, pct, from: acc };
      acc += pct;
      return seg;
    });
  }, [byCategory, grandTotal]);
  const donutCss = donutSegments
    .map((s) => `${catColor(s.k)} ${s.from}% ${s.from + s.pct}%`)
    .join(", ");

  const createMutation = useMutation({
    mutationFn: (payload) => api.post("expenses/", payload),
    onSuccess: () => {
      show("Xarajat saqlandi ✓", "success");
      setPeriod("");
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
      show("Nima uchun va summa shart", "error");
      return;
    }
    setSaving(true);
    createMutation.mutate({
      category,
      title: title.trim(),
      supplier: supplier.trim(),
      qty: Number(qty) || 1,
      total_amount: Number(amount),
      period: period.trim(),
      date: date || todayISO(),
      note: note.trim(),
    });
    setSaving(false);
  };

  return (
    <div className="page exp2-page">
      {/* HEADER */}
      <div className="exp2-head">
        <div className="exp2-head-left">
          <span className="exp2-logo">$</span>
          <div>
            <h1 className="exp2-title">Xarajatlar</h1>
            <div className="exp2-sub">DO'KON CHIQIMLARI NAZORATI</div>
          </div>
        </div>
        <div className="exp2-head-right">
          <div className="exp2-total">{formatMoney(grandTotal)} <span>so'm</span></div>
          <div className="exp2-total-sub">SHU OY JAMI</div>
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="exp2-stats">
        <div className="exp2-card">
          <div className="exp2-card-head">
            <span className="exp2-ico" style={{ color: "#fb7185" }}>📅</span>
            BUGUNGI XARAJAT
          </div>
          <div className="exp2-num" style={{ color: "#fb7185" }}>
            {formatMoney(todayTotal)}<small>so'm</small>
          </div>
        </div>
        <div className="exp2-card">
          <div className="exp2-card-head">
            <span className="exp2-ico" style={{ color: "#22d3ee" }}>📋</span>
            SHU OY YOZUVLAR
          </div>
          <div className="exp2-num" style={{ color: "#22d3ee" }}>
            {monthItems.length}<small>ta</small>
          </div>
        </div>
        <div className="exp2-card">
          <div className="exp2-card-head">
            <span className="exp2-ico" style={{ color: "#facc15" }}>⚡</span>
            ENG KO'P SARFLANGAN
          </div>
          <div className="exp2-num" style={{ color: "#facc15" }}>{topCat}</div>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="exp2-grid">
        {/* FORM */}
        <form className="exp2-card exp2-form" onSubmit={submit}>
          <h3 className="exp2-form-title">Yangi xarajat qo'shish</h3>
          <p className="exp2-form-sub">
            Kategoriyani tanlang — forma o'sha turdagi maydon bilan o'zgaradi
          </p>

          <div className="exp2-tiles">
            {CATEGORIES.map((c) => (
              <button
                key={c.k}
                type="button"
                className={`exp2-tile ${category === c.k ? "active" : ""}`}
                onClick={() => setCategory(c.k)}
              >
                <span className="exp2-tile-ico">{c.emoji}</span>
                <span className="exp2-tile-label">{c.label}</span>
              </button>
            ))}
          </div>

          {form.periodLabel && (
            <div className="exp2-field">
              <label>{form.periodLabel}</label>
              <input
                className="exp2-input"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder={form.periodPh}
              />
            </div>
          )}

          <div className="exp2-row">
            <div className="exp2-field" style={{ flex: 1 }}>
              <label>SUMMA (SO'M)</label>
              <input
                className="exp2-input"
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="exp2-field" style={{ width: 180 }}>
              <label>SANA</label>
              <input
                className="exp2-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="exp2-field">
            <label>{form.title.label}</label>
            <input
              className="exp2-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={form.title.ph}
            />
          </div>

          {form.supplier && (
            <div className="exp2-field">
              <label>{form.supplier.label}</label>
              <input
                className="exp2-input"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder={form.supplier.ph}
                list="exp2-suppliers"
              />
              <datalist id="exp2-suppliers">
                {[...new Set(items.map((x) => x.supplier).filter(Boolean))].map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
          )}

          {form.qty && (
            <div className="exp2-field">
              <label>SONI</label>
              <input
                className="exp2-input"
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
          )}

          <div className="exp2-field">
            <label>IZOH (IXTIYORIY)</label>
            <textarea
              className="exp2-input"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Qo'shimcha izoh..."
            />
          </div>

          <button className="exp2-save" disabled={saving}>
            {saving ? "Saqlanmoqda..." : "Xarajatni saqlash"}
          </button>
        </form>

        {/* RIGHT COLUMN */}
        <div className="exp2-right">
          {/* Donut */}
          <div className="exp2-card">
            <b className="exp2-card-title">Kategoriya bo'yicha taqsimot</b>
            {grandTotal === 0 ? (
              <div className="exp2-empty">Hozircha xarajat yo'q</div>
            ) : (
              <>
                <div className="exp2-donut-wrap">
                  <div
                    className="exp2-donut"
                    style={{
                      background: `conic-gradient(${donutCss})`,
                    }}
                  >
                    <div className="exp2-donut-hole">
                      <div>{formatMoney(grandTotal)}</div>
                      <small>JAMI</small>
                    </div>
                  </div>
                </div>
                <div className="exp2-legend">
                  {byCategory.map(([k, sum]) => (
                    <div key={k} className="exp2-legend-row">
                      <span
                        className="exp2-dot"
                        style={{ background: catColor(k) }}
                      />
                      <span>{catMeta(k).label}</span>
                      <b>
                        {grandTotal
                          ? Math.round((sum / grandTotal) * 100)
                          : 0}
                        %
                      </b>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* So'nggi */}
          <div className="exp2-card">
            <div className="exp2-recent-head">
              <b className="exp2-card-title">So'nggi xarajatlar</b>
              <span className="exp2-badge">{items.length} ta</span>
            </div>
            {items.length === 0 ? (
              <div className="exp2-empty">Hozircha yozuv yo'q</div>
            ) : (
              <div className="exp2-recent">
                {items.slice(0, 6).map((x) => {
                  const meta = catMeta(x.category);
                  return (
                    <div key={x.id} className="exp2-recent-row">
                      <span
                        className="exp2-recent-ico"
                        style={{ color: catColor(x.category) }}
                      >
                        {meta.emoji}
                      </span>
                      <div className="exp2-recent-body">
                        <b>
                          {meta.label}
                          {x.title ? ` — ${x.title}` : ""}
                        </b>
                        <small>
                          {(x.date || (x.created_at || "").slice(0, 10))}
                          {x.supplier ? ` · ${x.supplier}` : ""}
                        </small>
                      </div>
                      <span className="exp2-recent-sum">
                        -{formatMoney(x.total_amount)}
                      </span>
                      <button
                        type="button"
                        className="exp2-del"
                        title="O'chirish"
                        onClick={() => {
                          if (window.confirm(`"${x.title}" o'chirilsinmi?`))
                            deleteMutation.mutate(x.id);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExpensesPage;
