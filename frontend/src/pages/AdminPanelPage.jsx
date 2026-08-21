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
 *  - Arizani tasdiqlash / rad etish (fikrni o'zgartirish)
 *  - Do'konlar ro'yxati va do'konni yopish (yumshoq o'chirish)
 *  - Yangi do'kon + owner qo'lda yaratish
 */
export function AdminPanelPage() {
  const [tab, setTab] = useState("pending");
  const [apps, setApps] = useState([]);
  const [count, setCount] = useState(0);
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
      const data = await api.list("admin/applications/", { status: tab, page_size: 100 });
      setApps(data.results || []);
      setCount(data.count || 0);
    } catch (err) {
      if (!silent) show(err.message || "Arizalarni yuklashda xatolik", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [tab, show]);

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

  useEffect(() => {
    if (tab === "stores") {
      loadStores();
    } else {
      loadApps();
    }
  }, [tab, loadApps, loadStores]);

  // Real-time fallback: WebSocket yo'q bo'lsa — har 15 soniyada yangilash.
  // Telegram bot arizasi kelishi/yechilishi panelda kutmasdan ko'rinadi.
  useEffect(() => {
    const poll = () => {
      if (tab === "stores") {
        loadStores(true);
      } else {
        loadApps(true);
      }
    };
    const t = setInterval(poll, 15000);
    return () => clearInterval(t);
  }, [tab, loadApps, loadStores]);

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
      setForm({ store_name: "", owner_name: "", phone: "", address: "", telegram_chat_id: "" });
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
        {["pending", "approved", "rejected", "stores"].map((s) => (
          <button
            key={s}
            className={`tab ${tab === s ? "active" : ""}`}
            onClick={() => setTab(s)}
          >
            {s === "stores" ? "Do'konlar" : STATUS_LABEL[s]}
            <span className="badge">{s === tab ? (s === "stores" ? stores.length : count) : ""}</span>
          </button>
        ))}
      </div>

      {tab === "stores" ? (
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
      ) : loading ? (
        <div className="empty-state">Yuklanmoqda...</div>
      ) : apps.length === 0 ? (
        <div className="empty-state">
          <div className="big">
  display: inline-block;
  width: 1em;
  height: 1em;
  --svg: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='black' d='M19.5 2A1.5 1.5 0 0 0 18 3.5V4H5a4 4 0 0 0-4 4v19a4 4 0 0 0 4 4h22a4 4 0 0 0 4-4V8a4 4 0 0 0-4-4h-2v-.5A1.5 1.5 0 0 0 23.5 2zM29 14.535A4 4 0 0 0 27 14H14v-.5a1.5 1.5 0 0 0-1.5-1.5h-4A1.5 1.5 0 0 0 7 13.5v.5H5c-.729 0-1.412.195-2 .535V13a2 2 0 0 1 2-2h22a2 2 0 0 1 2 2zM3 18a2 2 0 0 1 2-2h22a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm26-8.465A4 4 0 0 0 27 9h-7v-.5A1.5 1.5 0 0 0 18.5 7h-4A1.5 1.5 0 0 0 13 8.5V9H5c-.729 0-1.412.195-2 .535V8a2 2 0 0 1 2-2h22a2 2 0 0 1 2 2z'/%3E%3C/svg%3E");
  background-color: currentColor;
  -webkit-mask-image: var(--svg);
  mask-image: var(--svg);
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  - webkit-mask-size: 100% 100%;
     mask-size: 100% 100%;
  }
  """></div>
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