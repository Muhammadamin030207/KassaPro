import { NavLink, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Icon from "./Icon";
import { Scene3D } from "./Scene3D";
import { useAuthStore } from "../stores/authStore";

const LINKS = [
  { to: "/", label: "Kassa", icon: "scan", end: true },
  { to: "/products", label: "Mahsulotlar", icon: "bag" },
  { to: "/reports", label: "Hisobotlar", icon: "chart" },
  { to: "/staff", label: "Kassirlar", icon: "users", ownerOnly: true },
];

/**
 * Asosiy layout: chapdagi shisha (glass) sidebar + 3D fon sahna + kontent.
 *
 * @param {{ children: React.ReactNode }} props
 */
export function AppLayout({ children }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const links = LINKS.filter((l) => !l.ownerOnly || user?.role === "owner");

  const onLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="app-shell">
      <Scene3D />
      <aside className="sidebar">
        <motion.div
          className="logo"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <img src="/favicon.svg" alt="SmartKassa" />
          <span>
            SmartKassa
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
          <span className="role">{user?.role === "owner" ? "Do'kon egasi" : "Kassir"}</span>
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