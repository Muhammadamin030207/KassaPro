import { useCallback, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Icon from "./Icon";
import { Scene3D } from "./Scene3D";
import { useAuthStore } from "../stores/authStore";

const LINKS = [
  { to: "/", label: "Kassa", icon: "scan", end: true },
  { to: "/products", label: "Mahsulotlar", icon: "bag" },
  { to: "/reports", label: "Hisobotlar", icon: "chart" },
  { to: "/debts", label: "Qarzdorlar", icon: "money" },
  { to: "/staff", label: "Kassirlar", icon: "users", ownerOnly: true },
  { to: "/settings", label: "Sozlamalar", icon: "settings", ownerOnly: true },
  { to: "/admin", label: "Admin", icon: "shield", superAdminOnly: true },
];

/**
 * Asosiy layout: chapdagi shisha (glass) sidebar + 3D fon sahna + kontent.
 *
 * Mobile (<768px) da sidebar yashiriladi va o'rniga yuqoridagi header
 * (hamburger + KassaPro + profil) hamda animatsiyali navigatsiya drawer'i ishlaydi.
 * Overlay bosilganda yoki ESC bosilganda drawer yopiladi.
 *
 * @param {{ children: React.ReactNode }} props
 */
export function AppLayout({ children }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isAdmin = user?.role === "super_admin" || user?.is_admin;
  const roleLabel =
    user?.role === "owner"
      ? "Do'kon egasi"
      : isAdmin
        ? "Admin"
        : "Kassir";
  const links = LINKS.filter(
    (l) =>
      (!l.ownerOnly || user?.role === "owner" || isAdmin) &&
      (!l.superAdminOnly || isAdmin)
  );

  const onLogout = () => {
    setDrawerOpen(false);
    logout();
    navigate("/login");
  };

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // ESC — drawer yopish
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // Drawer ochiq bo'lganda body scroll blok (iOS safe)
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  const first = (user?.username || "?").charAt(0).toUpperCase();

  return (
    <div className="app-shell">
      <Scene3D />

      {/* Mobile header — faqat <768px da ko'rinadi */}
      <header className="mobile-header">
        <button
          className="hamburger-btn"
          onClick={() => setDrawerOpen(true)}
          aria-label="Menyuni ochish"
        >
          <Icon name="menu" />
        </button>
        <span className="mobile-logo">
          <img src="/favicon.svg" alt="KassaPro" />
          KassaPro
        </span>
        <span className="mobile-avatar" title={user?.username}>
          {first}
        </span>
      </header>

      {/* Mobile navigatsiya drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              className="drawer-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeDrawer}
            />
            <motion.aside
              className="mobile-drawer"
              role="dialog"
              aria-label="Navigatsiya menyusi"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
            >
              <div className="drawer-head">
                <span className="drawer-title">
                  <img src="/favicon.svg" alt="KassaPro" />
                  KassaPro
                </span>
                <button
                  className="drawer-close"
                  onClick={closeDrawer}
                  aria-label="Menyuni yopish"
                >
                  ✕
                </button>
              </div>
              <nav className="drawer-nav">
                {links.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.end}
                    className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                    onClick={() => setDrawerOpen(false)}
                  >
                    <Icon name={l.icon} />
                    {l.label}
                  </NavLink>
                ))}
              </nav>
              <div className="drawer-foot">
                <div className="user-box">
                  <span>
                    <b>{user?.username}</b>{" "}
                    {user?.shop_name ? `— ${user.shop_name}` : ""}
                  </span>
                  <span className="role">
                    {roleLabel}
                  </span>
                  <button className="logout-btn" onClick={onLogout}>
                    <Icon name="logOut" /> Chiqish
                  </button>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <aside className="sidebar">
        <motion.div
          className="logo"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <img src="/favicon.svg" alt="KassaPro" />
          <span>
            KassaPro
            <span className="logo-sub">Barcode POS</span>
          </span>
        </motion.div>
        {links.map((l, i) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            {({ isActive }) => (
              <motion.span
                style={{ display: "flex", alignItems: "center", gap: 12 }}
                animate={isActive ? { x: 3 } : { x: 0 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <Icon name={l.icon} />
                {l.label}
              </motion.span>
            )}
          </NavLink>
        ))}
        <div className="spacer" />
        <div className="user-box">
          <span>
            <b>{user?.username}</b> {user?.shop_name ? `— ${user.shop_name}` : ""}
          </span>
          <span className="role">{roleLabel}</span>
          <button className="logout-btn" onClick={onLogout}>
            <Icon name="logOut" /> Chiqish
          </button>
        </div>
      </aside>
      <motion.main
        className="main"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {children}
      </motion.main>
    </div>
  );
}

export default AppLayout;
