import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api/client";
import Icon from "./Icon";
import { useToast } from "./Toast";

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
  const { show } = useToast();

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

  const [pushState, setPushState] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (typeof Notification === "undefined" || !navigator.serviceWorker) return;
        if (Notification.permission !== "granted") return;
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) setSubscribed(true);
        else setPushState("default");
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const enablePush = async () => {
    try {
      const perm = await Notification.requestPermission();
      setPushState(perm);
      if (perm !== "granted") return;
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await api.get("push/public-key/");
      if (!publicKey) return;
      const urlB64 = (b64) => {
        const pad = "=".repeat((4 - (b64.length % 4)) % 4);
        const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
        return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
      };
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64(publicKey),
        }));
      await api.post("push/subscribe/", sub.toJSON());
      setSubscribed(true);
      show("Push yoqildi — sinov xabari keldi! 🔔", "success");
    } catch {
      show("Push yoqib bo'lmadi", "error");
    }
  };

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
            <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
              {pushState !== "granted" && (
                <button type="button" className="notif-readall" onClick={enablePush}>
                  🔔 Telefonga yoqish
                </button>
              )}
              {pushState === "granted" && !subscribed && (
                <button type="button" className="notif-readall" onClick={enablePush}>
                  🔔 Pushni faollashtirish
                </button>
              )}
              {subscribed && (
                <button
                  type="button"
                  className="notif-readall"
                  onClick={async () => {
                    try {
                      await api.post("push/test/", {});
                      show("Sinov xabari yuborildi — telefonni tekshiring", "success");
                    } catch {
                      show("Yuborib bo'lmadi", "error");
                    }
                  }}
                >
                  📤 Sinov
                </button>
              )}
              {unread > 0 && (
                <button
                  type="button"
                  className="notif-readall"
                  onClick={() => readAll.mutate()}
                >
                  Barchasini o'qildi
                </button>
              )}
            </span>
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
