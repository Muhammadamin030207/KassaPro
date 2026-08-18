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

function deviceIcon(kind) {
  if (kind === "mobile") return "smartphone";
  if (kind === "tablet") return "tablet";
  return "monitor";
}

function statusInfo(d, now) {
  if (d.is_current) return { text: "Hozir faol", cls: "ok" };
  if (d.status === "revoked") return { text: "Bloklangan", cls: "low" };
  if (d.status === "allowed") return { text: "Ruxsat berilgan", cls: "warn" };
  if (d.status === "expired") return { text: "Muddati tugagan", cls: "neutral" };
  const mins = Math.floor((now - new Date(d.last_active_at).getTime()) / 60000);
  if (mins < 5) return { text: "Hozir faol", cls: "ok" };
  return { text: timeAgo(d.last_active_at), cls: "ok" };
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

  // last-active "hozir faol" ko'rsatkichini jonli ushlab turish
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const refresh = () => {
    queryClient.invalidateQueries(["devices"]);
    queryClient.invalidateQueries(["device-history"]);
  };

  const revokeMutation = useMutation({
    mutationFn: (id) => api.post(`devices/${id}/revoke/`, {}),
    onSuccess: () => {
      show("Qurilma chiqarildi.", "success");
      refresh();
    },
    onError: (e) => show(e.message, "error"),
  });

  const unblockMutation = useMutation({
    mutationFn: (id) => api.post(`devices/${id}/unblock/`, {}),
    onSuccess: () => {
      show("Qurilmaga qayta kirishga ruxsat berildi.", "success");
      refresh();
    },
    onError: (e) => show(e.message, "error"),
  });

  const revokeAllMutation = useMutation({
    mutationFn: () => api.post("devices/revoke-all/", {}),
    onSuccess: (d) => {
      show(d?.detail || "Boshqa qurilmalar chiqarildi.", "success");
      refresh();
    },
    onError: (e) => show(e.message, "error"),
  });

  const devices = devicesQuery.data?.results || [];
  const current = devices.find((d) => d.is_current) || null;
  const others = devices.filter((d) => !d.is_current && d.status === "active");
  const blocked = devices.filter((d) => !d.is_current && (d.status === "revoked" || d.status === "allowed"));
  const history = historyQuery.data?.results || [];

  const activeCount = devices.filter((d) => d.status === "active").length;
  const blockedCount = devices.filter((d) => d.status === "revoked").length;

  const runConfirm = () => {
    if (!confirm) return;
    if (confirm.type === "revoke") revokeMutation.mutate(confirm.device.id);
    else if (confirm.type === "unblock") unblockMutation.mutate(confirm.device.id);
    else revokeAllMutation.mutate();
    setConfirm(null);
  };

  const renderDevice = (d) => {
    const st = statusInfo(d, now);
    const busy = revokeMutation.isPending || unblockMutation.isPending;
    return (
      <div
        className={`device-card ${d.is_current ? "device-current" : ""}`}
        key={d.id}
      >
        <div className="device-card-top">
          <span className="device-ico">
            <Icon name={deviceIcon(d.device_kind)} size={26} />
          </span>
          <div className="device-name-wrap">
            <button className="device-name" onClick={() => setDetail(d)}>
              {d.device_name || "Noma'lum qurilma"}
            </button>
            <span className="device-meta">
              {d.browser || "—"}
              {d.browser_version ? ` ${d.browser_version}` : ""}
              {" · "}
              {d.os || "—"}
              {d.os_version ? ` ${d.os_version}` : ""}
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
            <span>Kirilgan</span>
            <b>{fmtDateTime(d.created_at)}</b>
          </div>
          <div className="device-row">
            <span>Oxirgi faollik</span>
            <b>{timeAgo(d.last_active_at)}</b>
          </div>
        </div>

        <div className="device-card-actions">
          {d.status === "active" && !d.is_current && (
            <button className="btn btn-danger-ghost btn-sm" disabled={busy} onClick={() => setConfirm({ type: "revoke", device: d })}>
              <Icon name="logOut" size={15} /> Qurilmani chiqarish
            </button>
          )}
          {d.status === "revoked" && (
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setConfirm({ type: "unblock", device: d })}>
              <Icon name="check" size={15} /> Qurilmaga qayta ruxsat berish
            </button>
          )}
          <button className="ghost-btn" onClick={() => setDetail(d)} title="Batafsil">
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
          <button className="btn btn-danger-ghost" onClick={() => setConfirm({ type: "revokeAll" })}>
            <Icon name="logOut" size={16} /> Boshqa barcha qurilmalardan chiqish
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

      {/* Revoke confirm */}
      <Modal open={confirm?.type === "revoke"} onClose={() => setConfirm(null)}>
        <h3>Qurilmani chiqaramizmi?</h3>
        <p style={{ marginTop: 10, opacity: 0.85, lineHeight: 1.55 }}>
          <b>{confirm?.device?.device_name}</b> KassaPro hisobidan chiqariladi va uning joriy
          sessioni bekor qilinadi. Bu qurilmadan qayta kirish uchun{" "}
          <b>Qurilmaga qayta ruxsat berish</b> kerak bo'ladi.
        </p>
        <div className="grid-2" style={{ marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Bekor qilish</button>
          <button
            className="btn btn-danger"
            disabled={revokeMutation.isPending}
            onClick={runConfirm}
          >
            {revokeMutation.isPending ? "Chiqarilmoqda..." : "Qurilmani chiqarish"}
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

      {/* Revoke-all confirm */}
      <Modal open={confirm?.type === "revokeAll"} onClose={() => setConfirm(null)}>
        <h3>Boshqa barcha qurilmalardan chiqish</h3>
        <p style={{ marginTop: 10, opacity: 0.85, lineHeight: 1.55 }}>
          Bu qurilmadan tashqari barcha active sessiyalar chiqariladi. Chiqarilgan qurilmalardan
          qayta kirish <b>bloklanadi</b>.
        </p>
        <div className="grid-2" style={{ marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Bekor qilish</button>
          <button
            className="btn btn-danger"
            disabled={revokeAllMutation.isPending}
            onClick={runConfirm}
          >
            {revokeAllMutation.isPending ? "Chiqarilmoqda..." : "Barchasidan chiqish"}
          </button>
        </div>
      </Modal>

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <>
            <div className="device-detail-head">
              <span className="device-ico">
                <Icon name={deviceIcon(detail.device_kind)} size={30} />
              </span>
              <div>
                <h3>{detail.device_name}</h3>
                <span className={`status-pill status-${statusInfo(detail, now).cls}`}>
                  {statusInfo(detail, now).text}
                  {detail.is_current && <span className="current-badge">BU QURILMA</span>}
                </span>
              </div>
            </div>
            <div className="debt-info-row">
              <div><span>Device ID</span><b className="mono" style={{ fontSize: 12 }}>{detail.device_id}</b></div>
              <div><span>Session ID</span><b className="mono" style={{ fontSize: 12 }}>{detail.session_id}</b></div>
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
              <div><span>Status</span><b>{detail.status}</b></div>
            </div>
            {detail.revoked_at && (
              <div className="debt-info-row">
                <div><span>Chiqarilgan</span><b>{fmtDateTime(detail.revoked_at)}</b></div>
                <div><span>Kim tomonidan</span><b>{detail.revoked_by_name || "—"}</b></div>
              </div>
            )}
            {detail.status === "active" && !detail.is_current && (
              <div className="grid-2" style={{ marginTop: 18 }}>
                <button className="btn btn-danger" onClick={() => { setConfirm({ type: "revoke", device: detail }); setDetail(null); }}>
                  Qurilmani chiqarish
                </button>
              </div>
            )}
          </>
        )}
      </Modal>
    </motion.div>
  );
}

export default DevicesPage;