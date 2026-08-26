import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";

import { api } from "../api/client";
import { useToast } from "../components/Toast";
import { Modal } from "../components/Modal";
import { PhoneInputMask } from "../components/PhoneInputMask";

const STATUS_LABEL = {
  pending: "Kutilmoqda",
  approved: "Tasdiqlangan",
  rejected: "Rad etilgan",
};

const BOT_STATUS_LABEL = {
  new: "Yangi",
  in_review: "Ko'rib chiqilmoqda",
  accepted: "Qabul qilindi",
  rejected: "Rad etildi",
  completed: "Yakunlandi",
};

/**
 * Super Admin paneli:
 *  - Telegram bot orqali kelgan arizalar ro'yxati
 *  - Arizani tasdiqlash / rad etish (fikrni o'zgartirish)
 *  - Do'konlar ro'yxati va do'konni yopish (yumshoq o'chirish)
 *  - Yangi do'kon + owner qo'lda yaratish
 */
export function AdminPanelPage() {
  const [sourceFilter, setSourceFilter] = useState("all");
  const [apps, setApps] = useState([]);
  const [count, setCount] = useState(0);
  const [botApps, setBotApps] = useState([]);
  const [botCount, setBotCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdUser, setCreatedUser] = useState(null);
  const [approveApp, setApproveApp] = useState(null);
  const [rejectApp, setRejectApp] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [form, setForm] = useState({
    store_name: "",
    owner_name: "",
    phone: "",
    email: "",
    address: "",
    telegram_chat_id: "",
  });

  // Do'konlar (yopish)
  const [stores, setStores] = useState([]);
  const [closeStore, setCloseStore] = useState(null);
  const [closeConfirm, setCloseConfirm] = useState("");
  const [closing, setClosing] = useState(false);

  const { show } = useToast();

  const loadApps = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.list("admin/applications/", { page_size: 100 });
      setApps(data.results || []);
      setCount(data.count || 0);
    } catch (err) {
      if (!silent) show(err.message || "Arizalarni yuklashda xatolik", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [show]);

  const loadStores = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.list("admin/stores/", { page_size: 200 });
      setStores(data.results || []);
    } catch (err) {
      if (!silent) show(err.message || "Do'konlarni yuklashda xatolik", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [show]);

  const loadBotApps = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.list("admin/bot-applications/", { page_size: 100 });
      setBotApps(data.results || []);
      setBotCount(data.count || 0);
    } catch (err) {
      if (!silent) show(err.message || "Murojaatlarni yuklashda xatolik", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [show]);

  const setBotStatus = async (app, next) => {
    try {
      await api.patch(`admin/bot-applications/${app.id}/`, { status: next });
      show(`${app.application_number}: ${BOT_STATUS_LABEL[next]}`, "success");
      loadBotApps(true);
    } catch (err) {
      show(err.message || "Holatni o'zgartirishda xatolik", "error");
    }
  };

  useEffect(() => {
    loadApps();
    loadBotApps();
    loadStores();
  }, [loadApps, loadStores, loadBotApps]);

  // Real-time: har 15 soniyada hammasi yangilanadi
  useEffect(() => {
    const poll = () => {
      loadApps(true);
      loadBotApps(true);
      loadStores(true);
    };
    const t = setInterval(poll, 15000);
    return () => clearInterval(t);
  }, [loadApps, loadStores, loadBotApps]);

  const openReject = (app) => {
    setRejectApp(app);
    setRejectReason("");
  };

  const submitReject = async () => {
    const app = rejectApp;
    if (!app) return;
    const reason = (rejectReason || "").trim();
    if (!reason) {
      show("Rad etish sababi kiritilishi shart", "error");
      return;
    }
    setRejecting(true);
    try {
      const data = await api.post(`admin/applications/${app.id}/reject/`, { note: reason });
      show(`"${data.store_name}" rad etildi`, "success");
      setRejectApp(null);
      setRejectReason("");
      loadApps();
    } catch (err) {
      show(err.message || "Amalda xatolik", "error");
    } finally {
      setRejecting(false);
    }
  };

  const openApprove = (app) => {
    setApproveApp(app);
    setForm({
      store_name: app.store_name,
      owner_name: app.owner_name,
      phone: app.phone || "",
      email: app.email || "",
      address: app.address || "",
      telegram_chat_id: app.telegram_chat_id ? String(app.telegram_chat_id) : "",
    });
    setCreateOpen(true);
  };

  const createStore = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const data = await api.post("admin/stores/", {
        ...form,
        telegram_chat_id: form.telegram_chat_id ? Number(form.telegram_chat_id) : null,
        application_id: approveApp?.id || null,
      });
      setCreatedUser(data);
      show("Do'kon yaratildi!", "success");
      // Modal YOPILMAYDI — kredensiallar ekranda ko'rsatilishi shart.
      // (Login/parolni saqlash imkoniyati bo'lmasa, parol tiklash qiyin.)
      setApproveApp(null);
      setForm({ store_name: "", owner_name: "", phone: "", email: "", address: "", telegram_chat_id: "" });
      loadStores();
      loadApps();
    } catch (err) {
      show(err.message || "Yaratishda xatolik", "error");
    } finally {
      setCreating(false);
    }
  };

  const closeStoreNow = async () => {
    if (!closeStore) return;
    if ((closeConfirm || "").trim().toLowerCase() !== closeStore.name.toLowerCase()) {
      show("Do'kon nomini to'g'ri yozing", "error");
      return;
    }
    setClosing(true);
    try {
      const data = await api.post(`admin/stores/${closeStore.id}/close/`, {});
      show(`"${data.name}" yopildi`, "success");
      setCloseStore(null);
      setCloseConfirm("");
      loadStores();
    } catch (err) {
      show(err.message || "Do'konni yopishda xatolik", "error");
    } finally {
      setClosing(false);
    }
  };

  /** Yopilgan do'konni qayta ochish — ega/kassirlar ham qayta faollashadi. */
  const reopenStore = async (store) => {
    try {
      const data = await api.post(`admin/stores/${store.id}/reopen/`, {});
      show(`"${data.name}" qayta ochildi`, "success");
      loadStores();
    } catch (err) {
      show(err.message || "Do'konni qayta ochishda xatolik", "error");
    }
  };

  /** Arizadagi qarorni o'zgartirish — qayta ko'rib chiqishga (pending) qaytarish. */
  const reconsider = async (app) => {
    try {
      const data = await api.patch(`admin/applications/${app.id}/`, { status: "pending" });
      show(`"${data.store_name}" qayta ko'rib chiqish uchun ochildi`, "success");
      loadApps();
    } catch (err) {
      show(err.message || "Holatni o'zgartirishda xatolik", "error");
    }
  };

  const pendingApps = apps.filter((a) => a.status === "pending");
  const approvedApps = apps.filter((a) => a.status === "approved");
  const rejectedApps = apps.filter((a) => a.status === "rejected");

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Admin panel</h1>
          <p className="muted">
            🟡 Kutilmoqda — do'kon ochish arizalari · 📨 Murojaatlar — bot
            savollari · 🏪 Do'konlar — barcha mijozlar
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          + Yangi do'kon
        </button>
      </div>



      <h2 className="admin-sec-title">🟡 Kutilmoqda arizalar <span className="badge">{pendingApps.length}</span></h2>
      <div className="flex" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          { k: "all", label: "Hammasi" },
          { k: "web", label: "🌐 Websaytdan" },
          { k: "bot", label: "🤖 Botdan" },
        ].map((f) => (
          <button
            key={f.k}
            className={`btn btn-sm ${sourceFilter === f.k ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setSourceFilter(f.k)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="empty-state">Yuklanmoqda...</div>
      ) : pendingApps.length === 0 ? (
        <div className="empty-state">
          <div className="big" aria-hidden="true">📁</div>
          <h3>Bu bo'limda ariza yo'q</h3>
        </div>
      ) : (
        <div className="app-list">
          {pendingApps
            .filter((a) => sourceFilter === "all" || a.source === sourceFilter)
            .map((app) => (
            <motion.div
              key={app.id}
              className="panel app-card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="app-card-head">
                <div>
                  <h3>
                    <span
                      className="status-pill"
                      style={{
                        background:
                          app.source === "bot"
                            ? "rgba(99,102,241,.15)"
                            : "rgba(34,197,94,.15)",
                        color: app.source === "bot" ? "#818cf8" : "#22c55e",
                        marginRight: 8,
                        fontSize: 11,
                      }}
                    >
                      {app.source === "bot" ? "🤖 Bot" : "🌐 Websayt"}
                    </span>
                    {app.store_name}
                  </h3>
                  <div className="muted">
                    {app.owner_name} · {app.phone || "Tel yo'q"}
                  </div>
                  <div className="muted small">
                    {app.email ? `📧 ${app.email}` : "📧 email yo'q"}
                    {app.telegram_chat_id ? " · 💬 Telegram ulangan" : ""}
                  </div>
                  <div className="muted small">{app.address || "Manzil berilmagan"}</div>
                </div>
                <span className={`status-pill status-${app.status}`}>{app.status_display}</span>
              </div>
              {app.status === "pending" && (
                <div className="app-card-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => openApprove(app)}>
                    Tasdiqlash
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => openReject(app)}>
                    Rad etish
                  </button>
                </div>
              )}
              {app.status === "rejected" && (
                <div className="app-card-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => openApprove(app)}>
                    Tasdiqlash (fikrni o'zgartirish)
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => reconsider(app)}>
                    Qayta ko'rib chiqish
                  </button>
                </div>
              )}
              {app.status === "approved" && (
                <div className="app-card-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => reconsider(app)}>
                    Qayta ko'rib chiqish
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => openReject(app)}>
                    Rad etish (fikrni o'zgartirish)
                  </button>
                </div>
              )}
              {app.note && <div className="muted small">Izoh: {app.note}</div>}
            </motion.div>
            ))}
        </div>
      )}

      <h2 className="admin-sec-title">✅ Tasdiqlangan <span className="badge">{approvedApps.length}</span></h2>
      {approvedApps.length === 0 ? (
        <div className="empty-state" style={{ padding: "18px 0" }}><span className="muted">Hozircha bo'sh</span></div>
      ) : (
        <div className="app-list">
          {approvedApps.map((app) => (
            <motion.div
              key={app.id}
              className="panel app-card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="app-card-head">
                <div>
                  <h3>
                    <span
                      className="status-pill"
                      style={{
                        background:
                          app.source === "bot"
                            ? "rgba(99,102,241,.15)"
                            : "rgba(34,197,94,.15)",
                        color: app.source === "bot" ? "#818cf8" : "#22c55e",
                        marginRight: 8,
                        fontSize: 11,
                      }}
                    >
                      {app.source === "bot" ? "🤖 Bot" : "🌐 Websayt"}
                    </span>
                    {app.store_name}
                  </h3>
                  <div className="muted">
                    {app.owner_name} · {app.phone || "Tel yo'q"}
                  </div>
                  <div className="muted small">
                    {app.email ? `📧 ${app.email}` : "📧 email yo'q"}
                    {app.telegram_chat_id ? " · 💬 Telegram ulangan" : ""}
                  </div>
                  <div className="muted small">{app.address || "Manzil berilmagan"}</div>
                </div>
                <span className={`status-pill status-${app.status}`}>{app.status_display}</span>
              </div>
              {app.status === "pending" && (
                <div className="app-card-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => openApprove(app)}>
                    Tasdiqlash
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => openReject(app)}>
                    Rad etish
                  </button>
                </div>
              )}
              {app.status === "rejected" && (
                <div className="app-card-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => openApprove(app)}>
                    Tasdiqlash (fikrni o'zgartirish)
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => reconsider(app)}>
                    Qayta ko'rib chiqish
                  </button>
                </div>
              )}
              {app.status === "approved" && (
                <div className="app-card-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => reconsider(app)}>
                    Qayta ko'rib chiqish
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => openReject(app)}>
                    Rad etish (fikrni o'zgartirish)
                  </button>
                </div>
              )}
              {app.note && <div className="muted small">Izoh: {app.note}</div>}
            </motion.div>
          ))}
        </div>
      )}

      <h2 className="admin-sec-title">❌ Rad etilgan <span className="badge">{rejectedApps.length}</span></h2>
      {rejectedApps.length === 0 ? (
        <div className="empty-state" style={{ padding: "18px 0" }}><span className="muted">Hozircha bo'sh</span></div>
      ) : (
        <div className="app-list">
          {rejectedApps.map((app) => (
            <motion.div
              key={app.id}
              className="panel app-card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="app-card-head">
                <div>
                  <h3>
                    <span
                      className="status-pill"
                      style={{
                        background:
                          app.source === "bot"
                            ? "rgba(99,102,241,.15)"
                            : "rgba(34,197,94,.15)",
                        color: app.source === "bot" ? "#818cf8" : "#22c55e",
                        marginRight: 8,
                        fontSize: 11,
                      }}
                    >
                      {app.source === "bot" ? "🤖 Bot" : "🌐 Websayt"}
                    </span>
                    {app.store_name}
                  </h3>
                  <div className="muted">
                    {app.owner_name} · {app.phone || "Tel yo'q"}
                  </div>
                  <div className="muted small">
                    {app.email ? `📧 ${app.email}` : "📧 email yo'q"}
                    {app.telegram_chat_id ? " · 💬 Telegram ulangan" : ""}
                  </div>
                  <div className="muted small">{app.address || "Manzil berilmagan"}</div>
                </div>
                <span className={`status-pill status-${app.status}`}>{app.status_display}</span>
              </div>
              {app.status === "pending" && (
                <div className="app-card-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => openApprove(app)}>
                    Tasdiqlash
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => openReject(app)}>
                    Rad etish
                  </button>
                </div>
              )}
              {app.status === "rejected" && (
                <div className="app-card-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => openApprove(app)}>
                    Tasdiqlash (fikrni o'zgartirish)
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => reconsider(app)}>
                    Qayta ko'rib chiqish
                  </button>
                </div>
              )}
              {app.status === "approved" && (
                <div className="app-card-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => reconsider(app)}>
                    Qayta ko'rib chiqish
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => openReject(app)}>
                    Rad etish (fikrni o'zgartirish)
                  </button>
                </div>
              )}
              {app.note && <div className="muted small">Izoh: {app.note}</div>}
            </motion.div>
          ))}
        </div>
      )}

      <h2 className="admin-sec-title">📨 Murojaatlar <span className="badge">{botApps.length}</span></h2>
          <div className="empty-state">Yuklanmoqda...</div>
        ) : botApps.length === 0 ? (
          <div className="empty-state">
            <div className="big" aria-hidden="true">📨</div>
            <h3>Murojaatlar yo'q</h3>
            <p className="muted">Telegram bot orqali kelgan arizalar shu yerda ko'rinadi</p>
          </div>
        ) : (
          <div className="app-list">
            {botApps.map((b) => (
              <motion.div
                key={b.id}
                className="panel app-card"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="app-card-head">
                  <div>
                    <h3>
                      <span className="mono">{b.application_number}</span> · {b.full_name}
                    </h3>
                    <div className="muted">
                      {b.phone}
                      {b.telegram_username ? ` · @${b.telegram_username}` : ""}
                    </div>
                    {b.message && <div style={{ marginTop: 6 }}>{b.message}</div>}
                    {b.note && <div className="muted small">Izoh: {b.note}</div>}
                  </div>
                  <span
                    className="status-pill"
                    style={{
                      background:
                        b.status === "new"
                          ? "rgba(234,179,8,.15)"
                          : b.status === "in_review"
                            ? "rgba(59,130,246,.15)"
                            : b.status === "accepted"
                              ? "rgba(34,197,94,.15)"
                              : b.status === "rejected"
                                ? "rgba(239,68,68,.15)"
                                : "rgba(120,120,140,.15)",
                      color:
                        b.status === "new"
                          ? "#eab308"
                          : b.status === "in_review"
                            ? "#60a5fa"
                            : b.status === "accepted"
                              ? "#22c55e"
                              : b.status === "rejected"
                                ? "#ef4444"
                                : "#9ca3af",
                    }}
                  >
                    {BOT_STATUS_LABEL[b.status] || b.status}
                  </span>
                </div>
                <div className="muted small" style={{ marginTop: 4 }}>
                  {new Date(b.created_at).toLocaleString("uz-UZ", { dateStyle: "short", timeStyle: "short" })}
                </div>
                <div className="app-card-actions">
                  {(b.status === "new" || b.status === "in_review") && (
                    <>
                      {b.status === "new" && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setBotStatus(b, "in_review")}>
                          Ko'rib chiqish
                        </button>
                      )}
                      <button className="btn btn-primary btn-sm" onClick={() => setBotStatus(b, "accepted")}>
                        Qabul qilish
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => setBotStatus(b, "rejected")}>
                        Rad etish
                      </button>
                    </>
                  )}
                  {(b.status === "accepted" || b.status === "rejected") && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setBotStatus(b, "completed")}>
                      Yakunlash
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )

      <h2 className="admin-sec-title">🏪 Do'konlar <span className="badge">{stores.length}</span></h2>
        loading ? (
          <div className="empty-state">Yuklanmoqda...</div>
        ) : stores.length === 0 ? (
          <div className="empty-state">
            <div className="big">🏪</div>
            <h3>Do'konlar yo'q</h3>
          </div>
        ) : (
          <div className="app-list">
            {stores.map((s) => (
              <motion.div
                key={s.id}
                className="panel app-card"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="app-card-head">
                  <div>
                    <h3>{s.name}</h3>
                    <div className="muted">
                      {s.owner_name || s.owner_username}
                      {s.owner_phone ? ` · ${s.owner_phone}` : ""} · Login: {s.owner_username}
                    </div>
                    <div className="muted small">
                      {s.product_count} mahsulot · {s.sale_count} savdo · {s.open_debt_count} ochiq qarz
                      <br />
                      Arizasi: {s.address ? `Manzil: ${s.address}` : "Manzil yo'q"}
                    </div>
                  </div>
                  <span className={`status-pill ${s.is_active ? "status-approved" : "status-rejected"}`}>
                    {s.status_display}
                  </span>
                </div>
                {s.is_active ? (
                  <div className="app-card-actions">
                    <button className="btn btn-danger btn-sm" onClick={() => { setCloseStore(s); setCloseConfirm(""); }}>
                      Do'konni yopish (o'chirish)
                    </button>
                  </div>
                ) : (
                  <div className="app-card-actions">
                    <div className="muted small" style={{ marginBottom: 8 }}>
                      Yopiq — egasi kira olmaydi, ma'lumotlar arxivda
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => reopenStore(s)}>
                      Do'konni qayta ochish
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )


      {/* Arizani rad etish — sabab majburiy */}
      <Modal open={!!rejectApp} onClose={() => setRejectApp(null)}>
        <div>
          <h3>Arizani rad etish</h3>
          <p className="muted" style={{ marginTop: 8 }}>
            <b>{rejectApp?.store_name}</b> arizasi rad etiladi. Sabab
            arizachiga Telegram orqali yuboriladi — kiritilishi shart.
          </p>
          <div className="field" style={{ marginTop: 14 }}>
            <label>Rad etish sababi</label>
            <textarea
              className="input"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Masalan: Hujjatlar to'liq emas, manzil tasdiqlanmadi..."
              maxLength={255}
              autoFocus
            />
          </div>
          <div className="grid-2" style={{ marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => setRejectApp(null)} disabled={rejecting}>
              Bekor qilish
            </button>
            <button className="btn btn-danger" onClick={submitReject} disabled={rejecting}>
              {rejecting ? "Yuborilmoqda..." : "Rad etish"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Do'konni yopish tasdiqlash */}
      <Modal open={!!closeStore} onClose={() => setCloseStore(null)}>        <div>
          <h3>Do'konni yopish</h3>
          <p className="muted" style={{ marginTop: 8 }}>
            <b>{closeStore?.name}</b> do'koni yopiladi. Ega endi kira olmaydi va barcha qurilmalari
            bekor qilinadi. Savdo/qarz tarixi arxivda saqlanadi — qayta ochish mumkin.
          </p>
          <div className="field" style={{ marginTop: 14 }}>
            <label>
              Tasdiqlash uchun do'kon nomini yozing: <b className="mono">{closeStore?.name}</b>
            </label>
            <input
              className="input"
              value={closeConfirm}
              onChange={(e) => setCloseConfirm(e.target.value)}
              placeholder={closeStore?.name}
              autoFocus
            />
          </div>
          <div className="grid-2" style={{ marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => setCloseStore(null)} disabled={closing}>
              Bekor qilish
            </button>
            <button className="btn btn-danger" onClick={closeStoreNow} disabled={closing}>
              {closing ? "Yopilmoqda..." : "Do'konni yopish"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Do'kon yaratish / ariza tasdiqlash */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)}>
        {createdUser ? (
          <div>
            <h3>Kredensiallar</h3>
            <p className="muted">Do'kon yaratildi. Login/parolni saqlang:</p>
            <div className="creds-box">
              <div>
                <span>Do'kon</span> <b>{createdUser.store_name}</b>
              </div>
              <div>
                <span>Login</span> <b>{createdUser.username}</b>
              </div>
              <div>
                <span>Parol</span> <b>{createdUser.password}</b>
              </div>
              {(() => {
                const msg = `KassaPro hisobingiz tayyor!\nDo'kon: ${createdUser.store_name}\nLogin: ${createdUser.username}\nParol: ${createdUser.password}\nKirish: https://smartkassa-1.onrender.com/login`;
                return (
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(msg);
                          show("Nusxa olindi — istalgan joyga yopishtiring", "success");
                        } catch {
                          show("Nusxa olinmadi — qo'lda ko'chiring", "error");
                        }
                      }}
                    >
                      📋 Nusxa olish
                    </button>
                    <a
                      className="btn btn-ghost btn-sm"
                      href={`https://wa.me/?text=${encodeURIComponent(msg)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      💬 WhatsApp
                    </a>
                    <a
                      className="btn btn-ghost btn-sm"
                      href={`https://t.me/share/url?url=${encodeURIComponent("https://smartkassa-1.onrender.com/login")}&text=${encodeURIComponent(msg)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      ✈️ Telegram
                    </a>
                  </div>
                );
              })()}
              {createdUser.telegram_sent && (
                <div className="muted small">✅ Telegram botga yuborildi</div>
              )}
              {createdUser.email_sent ? (
                <div className="muted small">✅ Emailga yuborildi: {createdUser.sent_to_email || ""}</div>
              ) : createdUser.delivery_channel === "email" ? (
                <div className="muted small" style={{ color: "#ef4444" }}>
                  ❌ Emailga yuborilmadi{createdUser.email_error ? ` (${createdUser.email_error})` : " — SMTP sozlanmagan"} — kredensiallarni qo'lda yuboring
                </div>
              ) : null}
              {!createdUser.telegram_sent && !createdUser.email_sent && createdUser.delivery_channel === "none" && (
                <div className="muted small" style={{ color: "#eab308" }}>
                  ⚠️ Telegram va email mavjud emas — kredensiallarni qo'lda yuboring
                </div>
              )}
            </div>
            <div className="grid-2" style={{ marginTop: 18 }}>
              <button className="btn btn-ghost" type="button" onClick={() => { setCreatedUser(null); setCreateOpen(false); }}>
                Yopish
              </button>
              <button className="btn btn-primary" type="button" onClick={() => setCreatedUser(null)}>
                Yangi yaratish
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h3>
              {approveApp
                ? `"${approveApp.store_name}" do'konini tasdiqlash`
                : "Yangi do'kon yaratish"}
            </h3>
            {approveApp && (
              <p className="muted small" style={{ marginTop: 6 }}>
                Manba:{" "}
                <b>{approveApp.source === "bot" ? "🤖 Telegram bot" : "🌐 Websayt"}</b>
                {" — "}
                {approveApp.source === "bot"
                  ? "chat ID avtomatik ulandi, bot o'zi yuboradi"
                  : "emailga avtomatik yuboriladi"}
                .
              </p>
            )}
            <form onSubmit={createStore}>
              <div className="field">
                <label>Do'kon nomi</label>
                <input
                  className="input"
                  value={form.store_name}
                  onChange={(e) => setForm({ ...form, store_name: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Egasi (ism familiya)</label>
                <input
                  className="input"
                  value={form.owner_name}
                  onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Telefon (ixtiyoriy)</label>
                <PhoneInputMask
                  className="input"
                  value={form.phone}
                  onChange={(v) => setForm({ ...form, phone: v })}
                />
              </div>
              <div className="field">
                <label>Manzil (ixtiyoriy)</label>
                <input
                  className="input"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Yetkazib berish yo'nalishi (avtomatik)</label>
                <div
                  className="input"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "rgba(99,102,241,.08)",
                    borderColor: "rgba(99,102,241,.35)",
                    minHeight: 44,
                  }}
                >
                  {form.telegram_chat_id ? (
                    <>
                      💬 <b>Telegram botga</b> yuboriladi (chat ID: {form.telegram_chat_id})
                    </>
                  ) : form.email ? (
                    <>
                      📧 <b>Emailga</b> yuboriladi: {form.email}
                    </>
                  ) : (
                    <>
                      ⚠️ Telegram ham email ham yo'q — kredensiallarni <b>qo'lda</b> yuborishingiz kerak
                    </>
                  )}
                </div>
              </div>
              <div className="grid-2">
                <button className="btn btn-ghost" type="button" onClick={() => { setApproveApp(null); setCreateOpen(false); }}>
                  Bekor qilish
                </button>
                <button className="btn btn-primary" disabled={creating}>
                  {creating ? "Yaratilmoqda..." : approveApp ? "Tasdiqlash" : "Yaratish"}
                </button>
              </div>
            </form>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default AdminPanelPage;