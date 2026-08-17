import { Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "./components/AppLayout";
import { useAuthStore, isTokenExpired } from "./stores/authStore";
import LoginPage from "./pages/LoginPage";
import CashierPage from "./pages/CashierPage";
import ProductsPage from "./pages/ProductsPage";
import ReportsPage from "./pages/ReportsPage";
import StaffPage from "./pages/StaffPage";

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

/** Kassirlar sahifasi faqat owner uchun. */
function OwnerOnly({ children }) {
  const user = useAuthStore((s) => s.user);
  if (user?.role !== "owner") return <Navigate to="/" replace />;
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
        path="/staff"
        element={
          <Protected>
            <OwnerOnly>
              <StaffPage />
            </OwnerOnly>
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}