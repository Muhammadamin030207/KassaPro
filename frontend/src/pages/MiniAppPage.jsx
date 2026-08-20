import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiFetch } from "../api/client";
import { useAuthStore } from "../stores/authStore";

/**
 * 5.6 / 5.7 — Telegram Mini App sahifasi.
 *
 * Telegram bot ichida ochiladi (WebApp). `initData` bot tokeni bilan
 * backend'da tekshiriladi — har qanday soxta so'rov rad etiladi (403).
 *  - Ariza holatini ko'rsatadi (status, izoh, sanalar)
 *  - Tasdiqlangan do'kon egasi uchun avto-login (JWT) beradi
 */
function getInitData() {
  try {
    const wa = window.Telegram?.WebApp;
    if (wa?.initData) {
      wa.ready?.();
      wa.expand?.();
      return wa.initData;
    }
  } catch {
    /* WebView ichida emas — botni to'g'ri ochish haqida ko'rsatamiz */
  }
  return null;
}

const STATUS_STYLE = {
  pending: { emoji: "🟡", label: "Kutilmoqda" },
  approved: { emoji: "🟢", label: "Tasdiqlangan" },
  rejected: { emoji: "🔴", label: "Rad etilgan" },
};

export function MiniAppPage() {
  const initData = getInitData();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [state, setState] = useState({
    phase: initData ? "loading" : "no-telegram",
    app: null,
    username: "",
    name: "",
    canLogin: false,
    error: "",
  });

  useEffect(() => {
    if (!initData) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await apiFetch("miniapp/status/", {
          method: "POST",
          body: JSON.stringify({ init_data: initData }),
        });
        if (cancelled) return;
        setState({
          phase: "ready",
          app: data.application || null,
          username: data.username || "",
          name: data.first_name || "",
          canLogin: !!data.can_login,
          error: "",
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          phase: "error",
          app: null,
          username: "",
          name: "",
          canLogin: false,
          error: err.message || "Holatni olishda xatolik",
        });
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const autoLogin = async () => {
    try {
      const data = await apiFetch("miniapp/login/", {
        method: "POST",
        body: JSON.stringify({ init_data: initData }),
      });
      if (!data || !data.access) throw new Error("Avto-login javobi yaroqsiz");
      const ok = login(data);
      if (!ok) throw new Error("Sessiya saqlanmadi");
      navigate("/", { replace: true });
    } catch (err) {
      setState((s) => ({
        ...s,
        error: err.message || "Avto-login muvaffaqiyatsiz",
      }));
    }
  };

  const st = STATUS_STYLE[state.app?.status] || { emoji: "❓", label: "Noma'lum" };

  return (
    <div className="miniapp-page">
      <div className="miniapp-card panel">
        <div className="brand" style={{ marginBottom: 8 }}>
          <img src="/favicon.svg" alt="KassaPro" />
          <div>
            <h1>KassaPro</h1>
            <div className="sub">Telegram ilova</div>
          </div>
        </div>

        {state.phase === "no-telegram" && (
          <div className="miniapp-msg">
            🚫 Bu sahifa faqat Telegram bot ichida ishlaydi.
            <p className="muted small" style={{ marginTop: 8 }}>
              Botda <b>/start</b> ni bosing va «Uyg'onga o'tish» tugmasidan
              foydalaning.
            </p>
          </div>
        )}

        {state.phase === "loading" && (
          <div className="miniapp-msg">Holat tekshirilmoqda...</div>
        )}

        {state.phase === "error" && (
          <div className="miniapp-msg err">
            ❌ {state.error}
            <p className="muted small" style={{ marginTop: 8 }}>
              Telegram imzosi tasdiqlanmagan bo'lishi mumkin. Qayta oching.
            </p>
          </div>
        )}

        {state.phase === "ready" && (
          <>
            {state.name && <div className="sm">Salom, <b>{state.name}</b> 👋</div>}

            {!state.app ? (
              <div className="miniapp-msg">
                📋 Siz hali ariza qoldirmagansiz.
              </div>
            ) : (
              <div className="miniapp-app">
                <div className="miniapp-app-row">
                  <span className="muted">Do'kon</span>
                  <b>{state.app.store_name}</b>
                </div>
                <div className="miniapp-app-row">
                  <span className="muted">Egas</span>
                  <span>{state.app.owner_name}</span>
                </div>
                <div className="miniapp-app-row">
                  <span className="muted">Telefon</span>
                  <span>{state.app.phone || "—"}</span>
                </div>
                <div className="miniapp-app-row">
                  <span className="muted">Holat</span>
                  <span className={`status-pill status-${state.app.status}`}>
                    {st.emoji} {state.app.status_display || st.label}
                  </span>
                </div>
                {state.app.note && (
                  <div className="miniapp-app-row">
                    <span className="muted">Izoh</span>
                    <span>{state.app.note}</span>
                  </div>
                )}
                <div className="miniapp-app-row">
                  <span className="muted">Ariza</span>
                  <span>{new Date(state.app.created_at).toLocaleDateString("uz-UZ")}</span>
                </div>
              </div>
            )}

            {state.app?.status === "pending" && (
              <p className="muted small" style={{ marginTop: 12 }}>
                ⏳ Admin tasdiqlashini kuting. Tasdiqlangach login/parol shu
                bot chatga yuboriladi.
              </p>
            )}
            {state.app?.status === "rejected" && (
              <p className="muted small" style={{ marginTop: 12 }}>
                ❌ Arizangiz rad etilgan. Yangi ariza qoldirish uchun botda
                «Do'kon arizasi» tugmasini bosing.
              </p>
            )}

            {state.canLogin && (
              <button className="btn btn-primary btn-block btn-lg" onClick={autoLogin}>
                🔓 Kirishni sinab ko'rish
              </button>
            )}

            {state.error && (
              <div className="miniapp-msg err" style={{ marginTop: 12 }}>
                {state.error}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default MiniAppPage;