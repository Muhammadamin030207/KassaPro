import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";

import { api } from "../api/client";
import Icon from "../components/Icon";
import { Modal } from "../components/Modal";
import { useToast } from "../components/Toast";

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("uz-UZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "hozirgina";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "hozirgina";
  if (m < 60) return `${m} daqiqa oldin`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} soat oldin`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Kecha";
  return `${d} kun oldin`;
}

const TYPE_LABEL = {
  laptop: "Noutbuk",
  desktop: "Desktop",
  tablet: "Planşet",
  phone: "Telefon",
};

function deviceIcon(d) {
  const t = d?.device_type;
  if (t === "phone") return "smartphone";
  if (t === "tablet") return "tablet";
  if (t === "laptop") return "laptop";
  if (t === "desktop") return "monitor";
  const k = d?.device_kind;
  if (k === "mobile") return "smartphone";
  if (k === "tablet") return "tablet";
  return "monitor";
}

function statusInfo(d) {
  if (d.is_current) return { text: "Hozir faol", cls: "ok" };
  if (d.status === "blocked") return { text: "Bloklangan", cls: "low" };
  if (d.active_sessions > 0) return { text: "Faol", cls: "ok" };
  return { text: "Muddati tugagan", cls: "neutral" };
}

function editBadge(manual) {
  return {
    text: manual ? "Qo'lda kiritilgan" : "Avtomatik aniqlangan",
    cls: manual ? "warn" : "auto",
  };
}

function resultInfo(result) {
  if (result === "success") return { text: "Muvaffaqiyatli kirish", icon: "✓", cls: "ok" };
  if (result === "blocked") return { text: "Rad etilgan", icon: "✕", cls: "low" };
  if (result === "logout") return { text: "Chiqish", icon: "↪", cls: "neutral" };
  return { text: result, icon: "•", cls: "neutral" };
}

export function DevicesPage() {
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [confirm, setConfirm] = useState(null); // { type, device }
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editModel, setEditModel] = useState("");
  const [now, setNow] = useState(Date.now());

  const devicesQuery = useQuery({
    queryKey: ["devices"],
    queryFn: () => api.list("devices/", { page_size: 100 }),
    refetchInterval: 30000,
  });
  const historyQuery = useQuery({
    queryKey: ["device-history"],
    queryFn: () => api.list("devices/history/", { page_size: 50 }),
  });
  const sessionsQuery = useQuery({
    queryKey: ["device-sessions", detail?.id],
    queryFn: () => api.list(`devices/${detail.id}/sessions/`, { page_size: 50 }),
    enabled: Boolean(detail?.id),
  });

  // last-active "hozir faol" ko'rsatkichini jonli ushlab turish
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const refresh = () => {
    queryClient.invalidateQueries(["devices"]);
    queryClient.invalidateQueries(["device-history"]);
    queryClient.invalidateQueries(["device-sessions"]);
  };

  const revokeMutation = useMutation({
    mutationFn: (id) => api.post(`devices/${id}/revoke-session/`, {}),
    onSuccess: () => {
      show("Sessiya tugatildi. Qurilma keyingi loginlarga ochiq.", "success");
      refresh();
    },
    onError: (e) => show(e.message, "error"),
  });

  const blockMutation = useMutation({
    mutationFn: (id) => api.post(`devices/${id}/block/`, {}),
    onSuccess: (d) => {
      show(d?.detail || "Qurilma bloklandi.", "success");
      refresh();
    },
    onError: (e) => show(e.message, "error"),
  });

  const unblockMutation = useMutation({
    mutationFn: (id) => api.post(`devices/${id}/unblock/`, {}),
    onSuccess: (d) => {
      show(d?.detail || "Qurilmaga qayta kirishga ruxsat berildi.", "success");
      refresh();
    },
    onError: (e) => show(e.message, "error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => api.patch(`devices/${id}/update/`, body),
    onSuccess: () => {
      show("Qurilma ma'lumotlari yangilandi.", "success");
      setEditing(false);
      refresh();
    },
    onError: (e) => show(e.message, "error"),
  });

  const blockOthersMutation = useMutation({
    mutationFn: () => api.post("devices/block-others/", {}),
    onSuccess: (d) => {
      show(d?.detail || "Boshqa qurilmalar bloklandi.", "success");
      refresh();
    },
    onError: (e) => show(e.message, "error"),
  });

  const devices = devicesQuery.data?.results || [];
  const current = devices.find((d) => d.is_current) || null;
  const others = devices.filter((d) => !d.is_current && d.status !== "blocked");
  const blocked = devices.filter((d) => !d.is_current && d.status === "blocked");
  const history = historyQuery.data?.results || [];

  const activeCount = devices.filter((d) => d.active_sessions > 0 || d.is_current).length;
  const blockedCount = devices.filter((d) => d.status === "blocked").length;

  const runConfirm = () => {
    if (!confirm) return;
    if (confirm.type === "revoke") revokeMutation.mutate(confirm.device.id);
    else if (confirm.type === "block") blockMutation.mutate(confirm.device.id);
    else if (confirm.type === "unblock") unblockMutation.mutate(confirm.device.id);
    else blockOthersMutation.mutate();
    setConfirm(null);
  };

  const openDetail = (d) => {
    setDetail(d);
    setEditing(false);
    setEditName(d.device_name || "");
    setEditModel(d.device_model || "");
  };

  const saveEdit = () => {
    if (!detail) return;
    updateMutation.mutate({
      id: detail.id,
      body: { device_name: editName, device_model: editModel },
    });
  };

  const renderDevice = (d) => {
    const st = statusInfo(d);
    return (
      <div
        className={`device-card ${d.is_current ? "device-current" : ""}`}
        key={d.id}
      >
        <div className="device-card-top">
          <span className="device-ico">
            <Icon name={deviceIcon(d)} size={26} />
          </span>
          <div className="device-name-wrap">
            <button className="device-name" onClick={() => openDetail(d)}>
              {d.device_name || "Noma'lum qurilma"}
            </button>
            <span className="device-model">{d.device_model || "Model aniqlanmadi"}</span>
            <span className="device-meta">
              {d.os || "—"}
              {d.os_version ? ` ${d.os_version}` : ""} · {d.browser || "—"}
              {d.browser_version ? ` ${d.browser_version}` : ""}
            </span>
          </div>
          <span className={`status-pill status-${st.cls}`}>
            {st.text}
            {d.is_current && <span className="current-badge">BU QURILMA</span>}
          </span>
        </div>

        <div className="device-card-rows">
          <div className="device-row">
            <span>IP</span>
            <b className="mono">{d.ip_address || "—"}</b>
          </div>
          <div className="device-row">
            <span>Birinchi kirish</span>
            <b>{fmtDateTime(d.created_at)}</b>
          </div>
          <div className="device-row">
            <span>Oxirgi faollik</span>
            <b>{timeAgo(d.last_active_at)}</b>
          </div>
          <div className="device-row">
            <span>Sessiyalar</span>
            <b>{d.sessions_count} ta login</b>
          </div>
        </div>

        <div className="device-card-actions">
          {d.status === "active" && !d.is_current && (
            <button
              className="btn btn-danger-ghost btn-sm"
              disabled={revokeMutation.isPending || blockMutation.isPending}
              onClick={() => setConfirm({ type: "revoke", device: d })}
            >
              <Icon name="logOut" size={15} /> Sessiyani chiqarish
            </button>
          )}
          {d.status === "blocked" && (
            <button
              className="btn btn-primary btn-sm"
              disabled={unblockMutation.isPending}
              onClick={() => setConfirm({ type: "unblock", device: d })}
            >
              <Icon name="check" size={15} /> Qurilmaga ruxsat berish
            </button>
          )}
          <button className="ghost-btn" onClick={() => openDetail(d)} title="Batafsil">
            <Icon name="chevron" size={15} />
          </button>
        </div>
      </div>
    );
  };

  if (devicesQuery.isLoading) {
    return <div className="empty-state">Yuklanmoqda...</div>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="page-head">
        <h1>Qurilmalar</h1>
        <div className="sub">Hisobingizga kirgan barcha qurilmalarni boshqaring</div>
      </div>

      <div className="stats-grid device-stats">
        <div className="stat-card glass-panel">
          <div className="label">Faol qurilmalar</div>
          <div className="value" style={{ color: "var(--success)" }}>{activeCount}</div>
        </div>
        <div className="stat-card glass-panel">
          <div className="label">Bloklangan</div>
          <div className="value" style={{ color: "var(--danger)" }}>{blockedCount}</div>
        </div>
        <div className="stat-card glass-panel">
          <div className="label">Kirishlar</div>
          <div className="value">{history.length}</div>
        </div>
      </div>

      {others.length > 0 && (
        <div className="revoke-all-wrap">
          <button className="btn btn-danger-ghost" onClick={() => setConfirm({ type: "blockOthers" })}>
            <Icon name="logOut" size={16} /> Boshqa barcha qurilmalarni bloklash
          </button>
        </div>
      )}

      {current && (
        <section className="device-section">
          <h3 className="device-section-title">BU QURILMA</h3>
          {renderDevice(current)}
        </section>
      )}

      <section className="device-section">
        <h3 className="device-section-title">BOSHQA QURILMALAR</h3>
        {others.length === 0 ? (
          <div className="empty-state" style={{ padding: "24px 12px" }}>
            <div className="big">🖥</div>
            <h3>Faol qurilmalar yo'q</h3>
            <p>Boshqa qurilmadan kirganingizda shu yerda ko'rinadi.</p>
          </div>
        ) : (
          <div className="device-grid">{others.map(renderDevice)}</div>
        )}
      </section>

      {blocked.length > 0 && (
        <section className="device-section">
          <h3 className="device-section-title">BLOKLANGAN QURILMALAR</h3>
          <div className="device-grid">{blocked.map(renderDevice)}</div>
        </section>
      )}

      <section className="device-section">
        <h3 className="device-section-title">KIRISH TARIXI</h3>
        <div className="table-scroll">
          <table className="data-table history-table">
            <thead>
              <tr>
                <th>Qurilma</th>
                <th>IP</th>
                <th>Kirish vaqti</th>
                <th>Browser</th>
                <th>OS</th>
                <th>Natija</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => {
                const ri = resultInfo(h.result);
                return (
                  <tr key={h.id}>
                    <td data-label="Qurilma">{h.device_name || "—"}</td>
                    <td data-label="IP" className="mono">{h.ip_address || "—"}</td>
                    <td data-label="Vaqt">{fmtDateTime(h.created_at)}</td>
                    <td data-label="Browser">
                      {h.browser || "—"}
                      {h.browser_version ? ` ${h.browser_version}` : ""}
                    </td>
                    <td data-label="OS">
                      {h.os || "—"}
                      {h.os_version ? ` ${h.os_version}` : ""}
                    </td>
                    <td data-label="Natija">
                      <span className={`badge ${ri.cls === "ok" ? "badge-ok" : ri.cls === "low" ? "badge-low" : "badge-neutral"}`}>
                        {ri.icon} {ri.text}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {history.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "var(--ink-faint)" }}>
                    Kirish tarixi hozircha bo'sh.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Revoke-session confirm */}
      <Modal open={confirm?.type === "revoke"} onClose={() => setConfirm(null)}>
        <h3>Sessiyani chiqaramizmi?</h3>
        <p style={{ marginTop: 10, opacity: 0.85, lineHeight: 1.55 }}>
          <b>{confirm?.device?.device_name}</b> qurilmasidagi joriy login tugatiladi.
          Qurilmaning o'zi <b>ochiq</b> qoladi — keyingi loginlarga ruxsat bor.
        </p>
        <div className="grid-2" style={{ marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Bekor qilish</button>
          <button
            className="btn btn-danger"
            disabled={revokeMutation.isPending}
            onClick={runConfirm}
          >
            {revokeMutation.isPending ? "Chiqarilmoqda..." : "Sessiyani chiqarish"}
          </button>
        </div>
      </Modal>

      {/* Block confirm */}
      <Modal open={confirm?.type === "block"} onClose={() => setConfirm(null)}>
        <h3>Qurilmani bloklansinmi?</h3>
        <p style={{ marginTop: 10, opacity: 0.85, lineHeight: 1.55 }}>
          <b>{confirm?.device?.device_name}</b> to'liq bloklanadi: joriy sessiyalar
          tugaydi va bu qurilmadan parol to'g'ri bo'lsa ham<b> qayta kirish taqiqlanadi</b>.
          Faqat "Qurilmaga ruxsat berish" orqali ochiladi.
        </p>
        <div className="grid-2" style={{ marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Bekor qilish</button>
          <button
            className="btn btn-danger"
            disabled={blockMutation.isPending}
            onClick={runConfirm}
          >
            {blockMutation.isPending ? "Bloklanmoqda..." : "Qurilmani bloklash"}
          </button>
        </div>
      </Modal>

      {/* Unblock confirm */}
      <Modal open={confirm?.type === "unblock"} onClose={() => setConfirm(null)}>
        <h3>Qurilmaga qayta ruxsat berilsinmi?</h3>
        <p style={{ marginTop: 10, opacity: 0.85, lineHeight: 1.55 }}>
          <b>{confirm?.device?.device_name}</b> qurilmasidan KassaPro hisobiga qayta kirish
          ruxsati beriladi.
        </p>
        <div className="grid-2" style={{ marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Bekor qilish</button>
          <button
            className="btn btn-primary"
            disabled={unblockMutation.isPending}
            onClick={runConfirm}
          >
            {unblockMutation.isPending ? "Ruxsat berilmoqda..." : "Ruxsat berish"}
          </button>
        </div>
      </Modal>

      {/* Block-others confirm */}
      <Modal open={confirm?.type === "blockOthers"} onClose={() => setConfirm(null)}>
        <h3>Boshqa barcha qurilmalarni bloklash</h3>
        <p style={{ marginTop: 10, opacity: 0.85, lineHeight: 1.55 }}>
          Bu qurilma bundan mustasno — boshqa barcha qurilmalar bloklanadi va ularning
          sessiyalari tugatiladi. Qayta kirish uchun har biriga alohida ruxsat beriladi.
        </p>
        <div className="grid-2" style={{ marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Bekor qilish</button>
          <button
            className="btn btn-danger"
            disabled={blockOthersMutation.isPending}
            onClick={runConfirm}
          >
            {blockOthersMutation.isPending ? "Bloklanmoqda..." : "Barchasini bloklash"}
          </button>
        </div>
      </Modal>

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg">
        {detail && (
          <>
            <div className="device-detail-head">
              <span className="device-ico">
                <Icon name={deviceIcon(detail)} size={30} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="device-detail-name-row">
                  <h3>{detail.device_name}</h3>
                  <span className={`badge ${detail.is_name_manual ? "badge-warn" : "badge-ok"}`}>
                    {editBadge(detail.is_name_manual).text}
                  </span>
                </div>
                <span className={`status-pill status-${statusInfo(detail).cls}`}>
                  {statusInfo(detail).text}
                  {detail.is_current && <span className="current-badge">BU QURILMA</span>}
                </span>
              </div>
              <button className="ghost-btn" onClick={() => setEditing(!editing)} title="Tahrirlash">
                <Icon name="edit" size={16} /> <span>Tahrirlash</span>
              </button>
            </div>

            {editing ? (
              <div className="device-edit-form">
                <div className="field">
                  <label>Qurilma nomi</label>
                  <input
                    className="input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Masalan: Muhammadamin's Laptop"
                  />
                </div>
                <div className="field" style={{ marginTop: 10 }}>
                  <label>Qurilma modeli</label>
                  <input
                    className="input"
                    value={editModel}
                    onChange={(e) => setEditModel(e.target.value)}
                    placeholder="Masalan: Lenovo IdeaPad 3 15IAU7"
                  />
                </div>
                <div className="grid-2" style={{ marginTop: 14 }}>
                  <button className="btn btn-ghost" onClick={() => setEditing(false)}>Bekor qilish</button>
                  <button
                    className="btn btn-primary"
                    disabled={updateMutation.isPending}
                    onClick={saveEdit}
                  >
                    {updateMutation.isPending ? "Saqlanmoqda..." : "Saqlash"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="debt-info-row">
                  <div><span>Model</span><b>{detail.device_model || "Model aniqlanmadi"}</b></div>
                  <div><span>Turi</span><b>{TYPE_LABEL[detail.device_type] || detail.device_type || "—"}</b></div>
                </div>
                <div className="debt-info-row">
                  <div><span>Browser</span><b>{detail.browser || "—"}{detail.browser_version ? ` ${detail.browser_version}` : ""}</b></div>
                  <div><span>OS</span><b>{detail.os || "—"}{detail.os_version ? ` ${detail.os_version}` : ""}</b></div>
                </div>
                <div className="debt-info-row">
                  <div><span>IP</span><b className="mono">{detail.ip_address || "—"}</b></div>
                  <div><span>Joylashuv</span><b>{detail.location || "Noma'lum joylashuv"}</b></div>
                </div>
                <div className="debt-info-row">
                  <div><span>Birinchi kirish</span><b>{fmtDateTime(detail.created_at)}</b></div>
                  <div><span>Oxirgi login</span><b>{fmtDateTime(detail.last_login_at)}</b></div>
                </div>
                <div className="debt-info-row">
                  <div><span>Oxirgi faollik</span><b>{timeAgo(detail.last_active_at)}</b></div>
                  <div><span>Status</span><b>{detail.status === "blocked" ? "Bloklangan" : "Faol"}</b></div>
                </div>
                <div className="debt-info-row">
                  <div><span>Model ma'lumoti</span><b>
                    <span className={`badge ${detail.is_model_manual ? "badge-warn" : "badge-ok"}`}>
                      {editBadge(detail.is_model_manual).text}
                    </span>
                  </b></div>
                  <div><span>Sessiyalar</span><b>{detail.sessions_count} ta login</b></div>
                </div>
                {detail.revoked_at && (
                  <div className="debt-info-row">
                    <div><span>Bloklangan</span><b>{fmtDateTime(detail.revoked_at)}</b></div>
                    <div><span>Kim tomonidan</span><b>{detail.revoked_by_name || "—"}</b></div>
                  </div>
                )}
              </>
            )}

            {detail.status === "active" && !detail.is_current && (
              <div className="grid-2" style={{ marginTop: 18 }}>
                <button
                  className="btn btn-danger"
                  onClick={() => { setConfirm({ type: "revoke", device: detail }); setDetail(null); }}
                >
                  Sessiyani chiqarish
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => { setConfirm({ type: "block", device: detail }); setDetail(null); }}
                >
                  Qurilmani bloklash
                </button>
              </div>
            )}
            {detail.status === "blocked" && (
              <div className="grid-2" style={{ marginTop: 18 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => { setConfirm({ type: "unblock", device: detail }); setDetail(null); }}
                >
                  Qurilmaga ruxsat berish
                </button>
              </div>
            )}

            <div className="device-sessions-block">
              <h4>Kirish tarixi (sessionlar)</h4>
              {sessionsQuery.isLoading ? (
                <div className="empty-state" style={{ padding: 10 }}>Yuklanmoqda...</div>
              ) : sessionsQuery.data?.results?.length === 0 ? (
                <div className="empty-state" style={{ padding: 10 }}>Sessiya topilmadi.</div>
              ) : (
                <ul className="session-list">
                  {(sessionsQuery.data?.results || []).map((s) => {
                    const st = s.is_current
                      ? { text: "Hozir faol", cls: "ok" }
                      : s.status === "revoked"
                        ? { text: "Chiqarilgan", cls: "low" }
                        : s.status === "active"
                          ? { text: "Faol", cls: "ok" }
                          : { text: "Muddati tugagan", cls: "neutral" };
                    return (
                      <li key={s.id} className="session-item">
                        <span className={`status-pill status-${st.cls}`}>{st.text}</span>
                        <div className="session-meta">
                          <b className="mono">{s.session_id.slice(0, 12)}…</b>
                          <span>{fmtDateTime(s.last_active_at)}</span>
                          <span className="mono">{s.ip_address || "—"}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </Modal>
    </motion.div>
  );
}

export default DevicesPage;