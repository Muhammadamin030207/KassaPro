import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

import { api } from "../api/client";
import { useAuthStore } from "../stores/authStore";
import { useToast } from "../components/Toast";
import { Modal } from "../components/Modal";
import { Scene3D } from "../components/Scene3D";
import { PhoneInputMask } from "../components/PhoneInputMask";

const fieldBase = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring", stiffness: 220, damping: 22 },
};

/**
 * Login sahifasi — JWT token olib store'ga saqlaydi.
 * Orqada 3D sahna (grid + suzuvchi kartalar).
 */
export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [reg, setReg] = useState({ username: "", password: "", shop_name: "", phone: "", address: "" });

  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const { show } = useToast();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api.post("auth/login/", { username, password });
      if (!data || !data.access) {
        throw new Error("Serverdan bo'sh javob keldi — qayta urinib ko'ring");
      }
      const ok = login(data);
      if (!ok) throw new Error("Login natijasi saqlanmadi");
      show("Xush kelibsiz!", "success");
      navigate("/");
    } catch (err) {
      show(err.message || "Login yoki parol xato", "error");
    } finally {
      setLoading(false);
    }
  };

  const register = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await api.post("auth/register/", reg);
      if (!user) throw new Error("Serverdan bo'sh javob keldi");
      const data = await api.post("auth/login/", {
        username: user.username,
        password: reg.password,
      });
      if (!data || !data.access) {
        throw new Error("Ro'yxatdan o'tdi, lekin kirishda xatolik — qayta kiring");
      }
      const ok = login(data);
      if (!ok) throw new Error("Login natijasi saqlanmadi");
      show("Do'kon yaratildi!", "success");
      setRegisterOpen(false);
      navigate("/");
    } catch (err) {
      show(err.message || "Ro'yxatdan o'tishda xatolik", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <Scene3D />

      <motion.div
        className="login-card"
        initial={{ opacity: 0, y: 34, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 22 }}
      >
        <div className="brand">
          <img src="/favicon.svg" alt="KassaPro" />
          <div>
            <h1>KassaPro</h1>
            <div className="sub">Do'koningiz uchun zamonaviy kassa tizimi</div>
          </div>
        </div>

        <form onSubmit={submit}>
          <motion.div className="field" {...fieldBase} transition={{ ...fieldBase.transition, delay: 0.1 }}>
            <label>Login</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
              placeholder="kassir"
            />
          </motion.div>
          <motion.div className="field" {...fieldBase} transition={{ ...fieldBase.transition, delay: 0.18 }}>
            <label>Parol</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </motion.div>
          <motion.div {...fieldBase} transition={{ ...fieldBase.transition, delay: 0.26 }}>
            <button className="btn btn-primary btn-block btn-lg" disabled={loading}>
              {loading ? "Kirmoqda..." : "Kirish"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              style={{ marginTop: 12 }}
              onClick={() => setRegisterOpen(true)}
            >
              Yangi do'kon ochish
            </button>
          </motion.div>
        </form>

        <div className="barcode-deco" />
      </motion.div>

      <Modal open={registerOpen} onClose={() => setRegisterOpen(false)}>
        <h3>Yangi do'kon ro'yxatdan o'tkazish</h3>
        <form onSubmit={register}>
          <div className="field">
            <label>Do'kon nomi</label>
            <input className="input" value={reg.shop_name} onChange={(e) => setReg({ ...reg, shop_name: e.target.value })} required />
          </div>
          <div className="field">
            <label>Telefon (ixtiyoriy)</label>
            <PhoneInputMask
              value={reg.phone}
              onChange={(v) => setReg({ ...reg, phone: v })}
            />
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Login</label>
              <input className="input" value={reg.username} onChange={(e) => setReg({ ...reg, username: e.target.value })} required />
            </div>
            <div className="field">
              <label>Parol</label>
              <input className="input" type="password" value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} required />
            </div>
          </div>
          <div className="grid-2">
            <button className="btn btn-ghost" type="button" onClick={() => setRegisterOpen(false)}>
              Bekor qilish
            </button>
            <button className="btn btn-primary" disabled={loading}>
              Yaratish
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default LoginPage;