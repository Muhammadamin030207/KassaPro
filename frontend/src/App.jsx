import { Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "./components/AppLayout";
import { useAuthStore, isTokenExpired } from "./stores/authStore";
import LoginPage from "./pages/LoginPage";
import CashierPage from "./pages/CashierPage";
import ProductsPage from "./pages/ProductsPage";
import ReportsPage from "./pages/ReportsPage";
import StaffPage from "./pages/StaffPage";
import DebtsPage from "./pages/DebtsPage";
import SettingsPage from "./pages/SettingsPage";
import AdminPanelPage from "./pages/AdminPanelPage";

/**
 * Sahifa himoyasi: login bo'lmagan yo token eskirgan bo'lsa /login'ga.
 *
 * @param {{ children: React.ReactNode }} props
 */
function Protected({ children }) {
  const access = useAuthStore((s) => s.access);
  const user = useAuthStore((s) => s.user);

  if (!access || !user || isTokenExpired(access)) {
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

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
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