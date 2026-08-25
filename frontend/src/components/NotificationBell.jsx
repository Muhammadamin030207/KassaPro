import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api/client";
import Icon from "./Icon";

const TYPE_META = {
  sale: { icon: "money", color: "#22c55e" },
  debt: { icon: "money", color: "#eab308" },
  device: { icon: "devices", color: "#60a5fa" },
  application: { icon: "shield", color: "#818cf8" },
  system: { icon: "alert", color: "#9ca3af" },
};

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "hozir";
  if (diff < 3600) return `${Math.floor(diff / 60)} daq`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} soat`;
  return `${Math.floor(diff / 86400)} kun`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get("notifications/"),
    refetchInterval: 30000,
  });

  const readOne = useMutation({
    mutationFn: (id) => api.post(`notifications/${id}/read/`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const readAll = useMutation({
    mutationFn: () => api.post("notifications/read-all/", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const unread = data?.unread || 0;
  const items = data?.results || [];

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        type="button"
        className="notif-bell"
        onClick={() => setOpen((v) => !v)}
        aria-label="Bildirishnomalar"
      >
        <Icon name="bell" size={20} />
        {unread > 0 && <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-head">
            <b>Bildirishnomalar</b>
            {unread > 0 && (
              <button
                type="button"
                className="notif-readall"
                onClick={() => readAll.mutate()}
              >
                Barchasini o'qildi
              </button>
            )}
          </div>
          <div className="notif-list">
            {items.length === 0 && (
              <div className="notif-empty">Hozircha bildirishnomalar yo'q</div>
            )}
            {items.map((n) => {
              const meta = TYPE_META[n.ntype] || TYPE_META.system;
              return (
                <button
                  key={n.id}
                  type="button"
                  className={`notif-item ${n.read ? "" : "unread"}`}
                  onClick={() => {
                    if (!n.read) readOne.mutate(n.id);
                  }}
                >
                  <span className="notif-ico" style={{ color: meta.color }}>
                    <Icon name={meta.icon} size={16} />
                  </span>
                  <span className="notif-body">
                    <b>{n.title}</b>
                    {n.body && <small>{n.body}</small>}
                    <time>{timeAgo(n.created_at)}</time>
                  </span>
                  {!n.read && <span className="notif-dot" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
