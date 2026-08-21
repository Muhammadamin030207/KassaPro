import { useCallback, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Icon from "./Icon";
import { Scene3D } from "./Scene3D";
import { useAuthStore } from "../stores/authStore";
import { api } from "../api/client";

const DRAWER_LINKS = [
  { to: "/", label: "Kassa", icon: "scan", end: true, key: "kassa" },
  { to: "/products", label: "Mahsulotlar", icon: "bag", key: "mahsulotlar" },
  { to: "/debts", label: "Qarzdorlik", icon: "money", key: "qarzdorlik" },
  { to: "/reports", label: "Hisobotlar", icon: "chart", key: "hisobotlar" },
];

const DRAWER_EXTRA_LINKS = [
  { to: "/staff", label: "Kassirlar", icon: "users", ownerOnly: true, key: "kassirlar" },
  { to: "/devices", label: "Qurilmalar", icon: "devices", superAdminOnly: true, key: "qurilmalar" },
  { to: "/settings", label: "Sozlamalar", icon: "settings", ownerOnly: true, key: "sozlamalar" },
  { to: "/admin", label: "Admin", icon: "shield", superAdminOnly: true, key: "admin" },
];

const LINKS = [
  { to: "/", label: "Kassa", icon: "scan", end: true, key: "kassa" },
  { to: "/products", label: "Mahsulotlar", icon: "bag", key: "mahsulotlar" },
  { to: "/debts", label: "Qarzdorlik", icon: "money", key: "qarzdorlik" },
  { to: "/reports", label: "Hisobotlar", icon: "chart", key: "hisobotlar" },
];

const bottomNavLinks = LINKS.map((l) => ({
  ...l,
  isActive: false,
}));

/** Pastki navigatsiya panelini (bottom navigation bar) qaytaradi. */
function useBottomNav() {
  const navigate = useNavigate();
  const [showExtra, setShowExtra] = useState(false);
  const [extraLinks, setExtraLinks] = useState([]);

  const toggleExtra = () => setShowExtra((v) => !v);

  // Scroll hiding show (optional)
  useEffect(() => {
    const wrapper = document.querySelector(".app-shell");
    if (!wrapper) return;
    let timeoutId;
    const handler = () => {
      clearTimeout(timeoutId);
      wrapper.classList.add("bottom-nav-hidden");
      timeoutId = setTimeout(() => wrapper.classList.remove("bottom-nav-hidden"), 1000);
    };
    wrapper.addEventListener("mouseenter", handler);
    wrapper.addEventListener("mouseleave", () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {}, 1000);
    });
    return () => {
      wrapper.removeEventListener("mouseenter", handler);
      wrapper.removeEventListener("mouseleave", () => {});
    };
  }, []);

  const renderExtraLinks = () => {
    if (!showExtra) return null;
    return (
      <div className="bottom-sheet" onClick={toggleExtra}>
        <div className="sheet-header">
          <span className="sheet-title">Ko'proq</span>
          <button className="sheet-close" onClick={toggleExtra}>✕</button>
        </div>
        <nav className="sheet-nav">
          {extraLinks.map((l) => (
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
    );
  };

  return {
    showExtra,
    toggleExtra,
    renderExtraLinks,
    extraLinks: extraLinks.map((l) => ({
      ...l,
      isActive: false,
    })),
  };
}

/** Mobil header — hamburger O'CHIRIQLANGAN, o'za o'ng nav bar qo'shilgan. */
export function AppLayout({ children }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const { showExtra, toggleExtra, renderExtraLinks, extraLinks } = useBottomNav();

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

  // Bottom nav state
  const [activeKey, setActiveKey] = useState(LINKS[0].key);

  const onLogout = () => {
    setActiveKey(LINKS[0].key);
    // Backend'ga chiqishni xabar qilamiz (sessiyani EXPIRED qiladi).
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

      {/* ==== MOBIL: pastki navigatsiya panelisi (bottom navigation) ==== */}
      <div className="mobile-bottom-nav">
        {LINKS.map((l) => (
          <NavLink
            key={l.key}
            className={`bottom-nav-item ${activeKey === l.key ? "active" : ""}`}
            onClick={() => {
              setActiveKey(l.key);
              navigate(l.to);
            }}
          >
            <Icon name={l.icon} />
            <span className="bottom-nav-label">{l.label}</span>
          </NavLink>
        ))}
        {showExtra && renderExtraLinks()}
      </div>

      {/* Desktop sidebar (o'zgartirilib turmush — ekanchani ya'ni qoldiq) */}
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