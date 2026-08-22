import { useCallback, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Icon from "./Icon";
import { Scene3D } from "./Scene3D";
import { useAuthStore } from "../stores/authStore";
import { api } from "../api/client";

/** Mobile-only bottom navigation links (4 main + extra via sheet) */
const MOBILE_LINKS = [
  { to: "/", label: "Kassa", icon: "scan", end: true, key: "kassa" },
  { to: "/products", label: "Mahsulotlar", icon: "bag", key: "mahsulotlar" },
  { to: "/debts", label: "Qarzdorlik", icon: "money", key: "qarzdorlik" },
  { to: "/reports", label: "Hisobotlar", icon: "chart", key: "hisobotlar" },
];

const EXTRA_LINKS = [
  { to: "/staff", label: "Kassirlar", icon: "users", ownerOnly: true, key: "kassirlar" },
  { to: "/devices", label: "Qurilmalar", icon: "devices", superAdminOnly: true, key: "qurilmalar" },
  { to: "/settings", label: "Sozlamalar", icon: "settings", ownerOnly: true, key: "sozlamalar" },
  { to: "/admin", label: "Admin", icon: "shield", superAdminOnly: true, key: "admin" },
];

/** Faqat mobil ekranda ko'rinadigan bottom-nav holatini saqlaydi */
function useBottomNav() {
  const navigate = useNavigate();
  const [activeKey, setActiveKey] = useState(MOBILE_LINKS[0].key);
  const [showExtra, setShowExtra] = useState(false);

  const toggleExtra = () => setShowExtra((v) => !v);

  /* Drawer state for mobile */
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleDrawer = () => setDrawerOpen((v) => !v);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    document.body.classList.add("drawer-open");
    return () => document.body.classList.remove("drawer-open");
  }, [drawerOpen]);

  // faqat mobil (max-width: 768px)da show, desktopda none
  useEffect(() => {
    const update = () => {
      const isMobile = window.innerWidth <= 768;
      document.body.style.setProperty(
        "--bottom-nav-display",
        isMobile ? "flex" : "none",
        "important"
      );
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const setActive = (key) => {
    setActiveKey(key);
    navigate(key);
  };

  return { activeKey, setActive, showExtra, toggleExtra, toggleDrawer, drawerOpen };
}

/** Mobil header — hamburger O'CHIRIQLANGAN, o'za o'ng nav bar qo'shilgan. */
export function AppLayout({ children }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const { activeKey, setActive, showExtra, toggleExtra, toggleDrawer, drawerOpen } = useBottomNav();

  const isAdmin = user?.role === "super_admin" || user?.is_admin;
  const roleLabel =
    user?.role === "owner"
      ? "Do'kon egasi"
      : isAdmin
        ? "Admin"
        : "Kassir";

  // Faqat mobildagi 4 ta asosiy linikal (extra bo'lmagan)
  /* Barcha 8 bo'limni birga: 4 ta asosiy + 4 ta admin bo'lim */
  const allLinks = MOBILE_LINKS.concat(EXTRA_LINKS).filter(
    (l) =>
      (!l.ownerOnly || user?.role === "owner" || isAdmin) &&
      (!l.superAdminOnly || user?.role === "super_admin" || isAdmin)
  );

  const onLogout = () => {
    setActive(MOBILE_LINKS[0].key);
    const { refresh } = useAuthStore.getState();
    if (refresh) {
      api.post("auth/logout/", { refresh }).catch(() => {});
    }
    logout();
    navigate("/login");
  };

  const first = (user?.username || "?").charAt(0).toUpperCase();

  return (
    <div className="app-shell">
      <Scene3D />

      {/* ==== MOBIL: pastki navigatsiya panelishi (bottom navigation) ==== */}
      <div className="hamburger-container">
  <button
    className={`hamburger-btn ${drawerOpen ? "is-open" : ""}`}
    onClick={toggleDrawer}
    aria-expanded={drawerOpen}
    aria-label="Menyuni ochish/yopish"
  >
    <div className="hamburger-icon">
      <div className="hamburger-ico">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  </button>
</div>

<div className="mobile-bottom-nav">
        {MOBILE_LINKS.map((l) => (
          <NavLink
            key={l.key}
            className={`bottom-nav-item ${activeKey === l.key ? "active" : ""}`}
            onClick={() => setActive(l.key)}
          >
            <Icon name={l.icon} />
            <span className="bottom-nav-label">{l.label}</span>
          </NavLink>
        ))}
        {showExtra && (
          <div className="bottom-sheet" onClick={toggleExtra}>
            <div className="sheet-header">
              <span className="sheet-title">Ko'proq</span>
              <button className="sheet-close" onClick={toggleExtra}>✕</button>
            </div>
            <nav className="sheet-nav">
              {EXTRA_LINKS.map((l) => (
                <NavLink
                  key={l.key}
                  to={l.to}
                  className={({ isActive }) =>
                    `sheet-nav-link ${isActive ? "active" : ""}`
                  }
                >
                  <Icon name={l.icon} />
                  <span>{l.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        )}
      </div>



      {/* Mobile drawer when hamburger is open */}
      {drawerOpen && (
        <div className="drawer-menu" onClick={toggleDrawer}>
          <nav onClick={(e) => e.stopPropagation()}>
            <ul>
              {MOBILE_LINKS.map((l) => (
                <li key={l.key} className="nav-item">
                  <a
                    className="nav-link"
                    href={l.to}
                    onClick={(e) => {
                      e.preventDefault();
                      toggleDrawer();
                      navigate(l.to);
                    }}
                  >
                    <Icon name={l.icon} />
                    <span>{l.label}</span>
                  </a>
                </li>
              ))}
              {EXTRA_LINKS.map((l) => {
                const canView =
                  (!l.ownerOnly || user?.role === "owner" || isAdmin) &&
                  (!l.superAdminOnly || user?.role === "super_admin" || isAdmin);
                if (!canView) return null;
                return (
                  <li key={l.key} className="nav-item">
                    <a
                      className="nav-link"
                      href={l.to}
                      onClick={(e) => {
                        e.preventDefault();
                        toggleDrawer();
                        navigate(l.to);
                      }}
                    >
                      <Icon name={l.icon} />
                      <span>{l.label}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      )}

      {/* ==== DESKTOP: old Sidebar (faqat dasturlash yoki admin uchun) ==== */}
      {/* Sidebar faqat max-width: 768px (mobile)da ko'rinadi, kattakor zhurnali chiqarib ketadi */}
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
        {/* Desktop sidebarga faqat oddiy user uchun barcha linklar, adminlar uchun filter */}
        {allLinks.map((l, i) => (
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