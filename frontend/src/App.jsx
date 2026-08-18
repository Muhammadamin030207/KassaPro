import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "./components/AppLayout";
import { apiFetch } from "./api/client";
import { useAuthStore, isAuthed, isTokenExpired } from "./stores/authStore";
import LoginPage from "./pages/LoginPage";
import CashierPage from "./pages/CashierPage";
import ProductsPage from "./pages/ProductsPage";
import ReportsPage from "./pages/ReportsPage";
import StaffPage from "./pages/StaffPage";
import DebtsPage from "./pages/DebtsPage";
import SettingsPage from "./pages/SettingsPage";
import AdminPanelPage from "./pages/AdminPanelPage";

const BASE = import.meta.env.VITE_API_URL || "/api";

/**
 * Sahifa himoyasi: login bo'lmagan yo token eskirgan bo'lsa /login'ga.
 *
 * @param {{ children: React.ReactNode }} props
 */
function Protected({ children }) {
  const authed = useAuthStore(isAuthed);

  if (!authed) {
    return <Navigate to="/login" replace />;
  }
  return <AppLayout>{children}</AppLayout>;
}

/** Owner / Admin sahifalari faqat egasi yoki platforma adminiga. */
function OwnerOnly({ children }) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "super_admin" || user?.is_admin;
  if (user?.role !== "owner" && !isAdmin) return <Navigate to="/" replace />;
  return children;
}

/** Super Admin sahifalari faqat platforma adminiga. */
function SuperAdminOnly({ children }) {
  const user = useAuthStore((s) => s.user);
  if (!user?.is_admin && user?.role !== "super_admin") return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const user = useAuthStore((s) => s.user);
  const authed = useAuthStore(isAuthed);
  const [booted, setBooted] = useState(false);

  // Keep-alive: har 4 daqiqada backend'ni uyg'otib turamiz (Render sleep mode)
  useEffect(() => {
    const ping = () => {
      apiFetch("health/").catch(() => {});
    };
    ping();
    const t = setInterval(ping, 4 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // PWA standalone / sahifa ochilishi: access token eskirgan bo'lsa refresh
  // orqali tiklash. Aks holda / -> /login -> / cheksiz loop (bounce) yuz beradi.
  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      const { access, refresh, setTokens, setUser, logout } = useAuthStore.getState();

      // Token hali amalga ega bo'lsa — darhol kiramiz.
      if (access && !isTokenExpired(access)) {
        if (!cancelled) setBooted(true);
        return;
      }
      // Refresh token bo'lmasa — login zarur, sessiya artish ham shart emas.
      if (!refresh) {
        if (!cancelled) setBooted(true);
        return;
      }

      // Umumiy kutish limiti: backend uyqusiz/hanging bo'lsa ham ilova
      // DOIM ochilishi kafolatlanadi (cheksiz boot ekranida qolmaydi).
      const deadline = setTimeout(() => {
        if (!cancelled) setBooted(true);
      }, 15000);

      try {
        const res = await fetch(`${BASE}/auth/refresh/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh }),
        });
        if (!res.ok) {
          // Refresh rad etildi (muddat tugagan) — sessiyani tozalab login'ga.
          logout();
          if (!cancelled) setBooted(true);
          return;
        }
        const data = await res.json();
        setTokens(data);
        const me = await fetch(`${BASE}/auth/me/`, {
          headers: { Authorization: `Bearer ${data.access}` },
        });
        if (me.ok) {
          setUser(await me.json());
        }
        if (!cancelled) setBooted(true);
      } catch {
        // Tarmoq xatosi — backend uyqudan uyg'onayotgan bo'lishi mumkin.
        // Sessiyani O'CHIRMAYMIZ va 3 soniyadan keyin qayta urinamiz,
        // lekin umumiy limitdan oshmaydi (yuqoridagi deadline).
        if (!cancelled) {
          setTimeout(boot, 3000);
        }
      } finally {
        clearTimeout(deadline);
      }
    };
    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!booted) {
    return (
      <div className="boot-screen">
        <img src="/favicon.svg" alt="KassaPro" />
        <div className="boot-title">KassaPro</div>
        <div className="boot-sub">Ulanish davom etmoqda, bir oz kuting...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={authed ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<Protected><CashierPage /></Protected>} />
      <Route path="/products" element={<Protected><ProductsPage /></Protected>} />
      <Route path="/reports" element={<Protected><ReportsPage /></Protected>} />
      <Route
        path="/debts"
        element={
          <Protected>
            <OwnerOnly>
              <DebtsPage />
            </OwnerOnly>
          </Protected>
        }
      />
      <Route
        path="/staff"
        element={
          <Protected>
            <OwnerOnly>
              <StaffPage />
            </OwnerOnly>
          </Protected>
        }
      />
      <Route
        path="/settings"
        element={
          <Protected>
            <OwnerOnly>
              <SettingsPage />
            </OwnerOnly>
          </Protected>
        }
      />
      <Route
        path="/admin"
        element={
          <Protected>
            <SuperAdminOnly>
              <AdminPanelPage />
            </SuperAdminOnly>
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}