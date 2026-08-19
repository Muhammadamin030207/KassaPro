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

/**
 * Super Admin paneli:
 *  - Telegram bot orqali kelgan arizalar ro'yxati
 *  - Arizani tasdiqlash / rad etish
 *  - Yangi do'kon + owner qo'lda yaratish
 */
export function AdminPanelPage() {
  const [apps, setApps] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("pending");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdUser, setCreatedUser] = useState(null);
  const [approveApp, setApproveApp] = useState(null);
  const [form, setForm] = useState({
    store_name: "",
    owner_name: "",
    phone: "",
    address: "",
    telegram_chat_id: "",
  });
  const { show } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.list("admin/applications/", { status: tab, page_size: 100 });
      setApps(data.results || []);
      setCount(data.count || 0);
    } catch (err) {
      show(err.message || "Arizalarni yuklashda xatolik", "error");
    } finally {
      setLoading(false);
    }
  }, [tab, show]);

  useEffect(() => {
    load();
  }, [load]);

  const reject = async (app) => {
    try {
      const data = await api.post(`admin/applications/${app.id}/reject/`, { note: "" });
      show(`"${data.store_name}" rad etildi`, "success");
      load();
    } catch (err) {
      show(err.message || "Amalda xatolik", "error");
    }
  };

  const openApprove = (app) => {
    setApproveApp(app);
    setForm({
      store_name: app.store_name,
      owner_name: app.owner_name,
      phone: app.phone || "",
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
      setCreateOpen(false);
      setApproveApp(null);
      setForm({ store_name: "", owner_name: "", phone: "", address: "", telegram_chat_id: "" });
      load();
    } catch (err) {
      show(err.message || "Yaratishda xatolik", "error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Admin panel</h1>
          <p className="muted">Platforma boshqaruvi — arizalar va do'konlar</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          + Yangi do'kon
        </button>
      </div>

      <div className="tabs">
        {["pending", "approved", "rejected"].map((s) => (
          <button
            key={s}
            className={`tab ${tab === s ? "active" : ""}`}
            onClick={() => setTab(s)}
          >
            {STATUS_LABEL[s]}
            <span className="badge">{s === tab ? count : ""}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state">Yuklanmoqda...</div>
      ) : apps.length === 0 ? (
        <div className="empty-state">
          <div className="big">🗂️</div>
          <h3>Bu bo'limda ariza yo'q</h3>
        </div>
      ) : (
        <div className="app-list">
          {apps.map((app) => (
            <motion.div
              key={app.id}
              className="panel app-card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="app-card-head">
                <div>
                  <h3>{app.store_name}</h3>
                  <div className="muted">
                    {app.owner_name} · {app.phone || "Tel yo'q"}
                    {app.telegram_chat_id ? " · Telegramda" : ""}
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
                  <button className="btn btn-danger btn-sm" onClick={() => reject(app)}>
                    Rad etish
                  </button>
                </div>
              )}
              {app.note && <div className="muted small">Izoh: {app.note}</div>}
            </motion.div>
          ))}
        </div>
      )}

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
              {createdUser.telegram_sent && (
                <div className="muted small">Telegram'ga yuborildi ✅</div>
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
                Arizadan ma'lumotlar ko'chirildi. Login/parol avtomatik yaratiladi.
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
                <label>Telegram chat ID (ixtiyoriy — bo'lsa login/parol u yerga boradi)</label>
                <input
                  className="input"
                  value={form.telegram_chat_id}
                  onChange={(e) => setForm({ ...form, telegram_chat_id: e.target.value })}
                  placeholder="123456789"
                />
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