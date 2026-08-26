import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";

import { api } from "../api/client";
import Icon from "../components/Icon";
import { Modal } from "../components/Modal";
import { useToast } from "../components/Toast";
import { getDeviceId } from "../lib/device";

const TYPE_LABEL = {
  laptop: "Noutbuk",
  desktop: "Desktop",
  tablet: "Planşet",
  phone: "Telefon",
  other: "Boshqa",
};

const MODEL_UNKNOWN = "Model aniqlanmadi";

function typeLabel(t) {
  return TYPE_LABEL[t] || t || "Noma'lum";
}

function deviceIcon(d) {
  const t = d?.device_type;
  if (t === "phone") return "smartphone";
  if (t === "tablet") return "tablet";
  if (t === "laptop") return "laptop";
  return "monitor";
}

function fmtDate(iso) {
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

function badgeManual(manual) {
  return manual
    ? { text: "Qo'lda kiritilgan", cls: "badge-warn" }
    : { text: "Avtomatik", cls: "badge-info" };
}

export function DevicesPage() {
  const queryClient = useQueryClient();
  const { show } = useToast();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("-last_active_at");
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editModel, setEditModel] = useState("");
  const [openAcc, setOpenAcc] = useState(null);
  const [now, setNow] = useState(Date.now());
  const myDeviceId = useMemo(() => getDeviceId(), []);

  const devicesQuery = useQuery({
    queryKey: ["devices"],
    queryFn: () => api.list("devices/", { page_size: 100 }),
    refetchInterval: 30000,
  });

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["devices"] });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => api.patch(`devices/${id}/`, body),
    onSuccess: () => {
      show("Qurilma ma'lumotlari saqlandi.", "success");
      setEditing(false);
      refresh();
    },
    onError: (e) => show(e.message, "error"),
  });

  const removeMutation = useMutation({
    mutationFn: (id) => api.del(`devices/${id}/`),
    onSuccess: () => {
      show("Qurilma o'chirildi — shu qurilmaning sessiyasi yopildi.", "success");
      setDetail(null);
      refresh();
    },
    onError: (e) => show(e.message, "error"),
  });

  const removeOthersMutation = useMutation({
    mutationFn: async (ids) => {
      for (const id of ids) await api.del(`devices/${id}/`);
    },
    onSuccess: (_d, ids) => {
      show(`${ids.length} ta boshqa qurilma o'chirildi — ularning sessiyalari yopildi.`, "success");
      setDetail(null);
      refresh();
    },
    onError: (e) => show(e.message, "error"),
  });

  const all = devicesQuery.data?.results || [];

  const filtered = useMemo(() => {
    let out = all;
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      out = out.filter(
        (d) =>
          (d.device_name || "").toLowerCase().includes(s) ||
          (d.device_model || "").toLowerCase().includes(s) ||
          (d.device_id || "").toLowerCase().includes(s)
      );
    }
    if (typeFilter !== "all") {
      out = out.filter((d) => d.device_type === typeFilter);
    }
    return [...out].sort((a, b) => {
      const key = sortBy.startsWith("-") ? sortBy.slice(1) : sortBy;
      const dir = sortBy.startsWith("-") ? -1 : 1;
      const va = a[key] ? new Date(a[key]).getTime() : 0;
      const vb = b[key] ? new Date(b[key]).getTime() : 0;
      return (va - vb) * dir;
    });
  }, [all, search, typeFilter, sortBy]);

  const currentDevice = all.find((d) => d.device_id === myDeviceId) || null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const activeToday = all.filter((d) => {
    const t = d.last_active_at ? new Date(d.last_active_at).getTime() : 0;
    return t >= today.getTime();
  }).length;

  const openDetail = (d) => {
    setDetail(d);
    setEditing(false);
    setEditName(d.device_name || "");
    setEditModel(d.device_model || "");
    setOpenAcc(null);
  };

  const saveEdit = () => {
    if (!detail) return;
    updateMutation.mutate({ id: detail.id, body: { device_name: editName, device_model: editModel } });
  };

  const renderCard = (d) => {
    const isCurrent = d.device_id === myDeviceId;
    return (
      <div
        className={`device-card ${isCurrent ? "device-current" : ""}`}
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
            <span className="device-model">
              {d.device_model || MODEL_UNKNOWN}
            </span>
            <span className="device-meta">
              {typeLabel(d.device_type)} · {d.os || "—"}
              {d.os_version ? ` ${d.os_version}` : ""} · {d.browser || "—"}
            </span>
          </div>
          {isCurrent && <span className="current-badge">BU QURILMA</span>}
        </div>

        <div className="device-card-rows">
          <div className="device-row">
            <span>Birinchi kirish</span>
            <b>{fmtDate(d.first_seen_at)}</b>
          </div>
          <div className="device-row">
            <span>Oxirgi faollik</span>
            <b>{timeAgo(d.last_active_at)}</b>
          </div>
          {(d.is_name_manual || d.is_model_manual) && (
            <div className="device-row">
              <span>Ma'lumot</span>
              <b>
                <span className={badgeManual(d.is_name_manual || d.is_model_manual).cls}>
                  {badgeManual(d.is_name_manual || d.is_model_manual).text}
                </span>
              </b>
            </div>
          )}
        </div>

        <div className="device-card-actions">
          <button
            className="ghost-btn"
            style={{ fontWeight: 600 }}
            onClick={() => openDetail(d)}
          >
            Batafsil
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
        <div className="sub">Hisobingiz ishlatilgan qurilmalar ro'yxati</div>
      </div>

      <div className="stats-grid device-stats">
        <div className="stat-card glass-panel">
          <div className="label">Jami qurilmalar</div>
          <div className="value">{all.length}</div>
        </div>
        <div className="stat-card glass-panel">
          <div className="label">Bugun faol</div>
          <div className="value" style={{ color: "var(--success)" }}>{activeToday}</div>
        </div>
        <div className="stat-card glass-panel">
          <div className="label">Hozirgi qurilma</div>
          <div className="value plain" style={{ color: "var(--brand-light)" }}>
            {currentDevice ? typeLabel(currentDevice.device_type) : "—"}
          </div>
        </div>
        {(() => {
          const others = all.filter((d) => d.device_id !== myDeviceId);
          if (others.length === 0) return null;
          return (
            <button
              className="btn btn-danger btn-sm"
              style={{ marginTop: 10 }}
              disabled={removeOthersMutation.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Boshqa ${others.length} ta qurilma o'chirilsinmi? Ularning barcha sessiyalari darhol yopiladi (Telegram "boshqa sessiyalarni yopish" kabi).`
                  )
                ) {
                  removeOthersMutation.mutate(others.map((d) => d.id));
                }
              }}
            >
              🚪 Boshqa {others.length} ta qurilmadan chiqish
            </button>
          );
        })()}
      </div>

      <div className="device-toolbar">
        <div className="input-wrap">
          <Icon name="scan" size={16} />
          <input
            className="input device-search"
            placeholder="Nom, model yoki ID bo'yicha qidirish..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input device-sort" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">Barcha turlar</option>
          <option value="laptop">Noutbuk</option>
          <option value="desktop">Desktop</option>
          <option value="phone">Telefon</option>
          <option value="tablet">Planşet</option>
          <option value="other">Boshqa</option>
        </select>
        <select className="input device-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="-last_active_at">Oxirgi faollik bo'yicha</option>
          <option value="-first_seen_at">Birinchi kirish bo'yicha</option>
          <option value="-last_login_at">Oxirgi login bo'yicha</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state" style={{ padding: "48px 12px" }}>
          <div className="big">🖥</div>
          <h3>{all.length === 0 ? "Hali qurilmalar yo'q" : "Hech narsa topilmadi"}</h3>
          <p>
            {all.length === 0
              ? "Boshqa qurilmadan hisobingizga kirganingizda u shu yerda ko'rinadi."
              : "Qidiruv yoki filtrga mos qurilma topilmadi."}
          </p>
        </div>
      ) : (
        <div className="device-grid">
          {filtered.map(renderCard)}
        </div>
      )}

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
                  <h3>{detail.device_name || "Noma'lum qurilma"}</h3>
                  {detail.device_id === myDeviceId && (
                    <span className="current-badge">BU QURILMA</span>
                  )}
                </div>
                <span className="device-model">
                  {detail.device_model || MODEL_UNKNOWN}
                </span>
              </div>
              <button className="ghost-btn" onClick={() => setEditing(!editing)} title="Tahrirlash">
                <Icon name="edit" size={16} /> <span>{editing ? "Bekor" : "Tahrirlash"}</span>
              </button>
              <button
                className="ghost-btn"
                style={{ color: "#f87171", borderColor: "rgba(239,68,68,.4)" }}
                disabled={removeMutation.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `"${detail.device_name || "Qurilma"}" o'chirilsinmi? Shu qurilmaning kirish sessiyasi darhol yopiladi (qayta login qila oladi).`
                    )
                  ) {
                    removeMutation.mutate(detail.id);
                  }
                }}
                title="Qurilmni o'chirish (sessiyani yopish)"
              >
                <Icon name="trash" size={16} /> <span>O'chirish</span>
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
                    disabled={updateMutation.isPending || (!editName.trim() && !editModel.trim())}
                    onClick={saveEdit}
                  >
                    {updateMutation.isPending ? "Saqlanmoqda..." : "Saqlash"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="device-accordion">
                <button
                  className={`acc-item ${openAcc === "device" ? "open" : ""}`}
                  onClick={() => setOpenAcc(openAcc === "device" ? null : "device")}
                >
                  <span>Qurilma</span>
                  <span className="acc-caret"><Icon name="chevron" size={14} /></span>
                </button>
                {openAcc === "device" && (
                  <div className="acc-body debt-info-row">
                    <div><span>Turi</span><b>{typeLabel(detail.device_type)}</b></div>
                    <div><span>Model</span><b>{detail.device_model || MODEL_UNKNOWN}</b></div>
                    <div><span>Ma'lumoti</span>
                      <b>
                        <span className={badgeManual(detail.is_model_manual).cls}>
                          {badgeManual(detail.is_model_manual).text}
                        </span>
                      </b>
                    </div>
                    <div><span>ID</span><b className="mono">{detail.device_id}</b></div>
                  </div>
                )}

                <button
                  className={`acc-item ${openAcc === "sw" ? "open" : ""}`}
                  onClick={() => setOpenAcc(openAcc === "sw" ? null : "sw")}
                >
                  <span>Dasturiy ta'minot</span>
                  <span className="acc-caret"><Icon name="chevron" size={14} /></span>
                </button>
                {openAcc === "sw" && (
                  <div className="acc-body debt-info-row">
                    <div><span>OS</span><b>{detail.os || "—"}{detail.os_version ? ` ${detail.os_version}` : ""}</b></div>
                    <div><span>Brauzer</span><b>{detail.browser || "—"}{detail.browser_version ? ` ${detail.browser_version}` : ""}</b></div>
                  </div>
                )}

                <button
                  className={`acc-item ${openAcc === "activity" ? "open" : ""}`}
                  onClick={() => setOpenAcc(openAcc === "activity" ? null : "activity")}
                >
                  <span>Faollik</span>
                  <span className="acc-caret"><Icon name="chevron" size={14} /></span>
                </button>
                {openAcc === "activity" && (
                  <div className="acc-body debt-info-row">
                    <div><span>Birinchi kirish</span><b>{fmtDate(detail.first_seen_at)}</b></div>
                    <div><span>Oxirgi login</span><b>{fmtDate(detail.last_login_at)}</b></div>
                    <div><span>Oxirgi faollik</span><b>{timeAgo(detail.last_active_at)}</b></div>
                    <div><span>Qo'lda nom</span>
                      <b>
                        <span className={badgeManual(detail.is_name_manual).cls}>
                          {badgeManual(detail.is_name_manual).text}
                        </span>
                      </b>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Modal>
    </motion.div>
  );
}

export default DevicesPage;