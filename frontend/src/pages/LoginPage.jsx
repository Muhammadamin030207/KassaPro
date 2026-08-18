import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

import { api } from "../api/client";
import { useAuthStore } from "../stores/authStore";
import { detectDeviceType, getDeviceId, getDeviceModel, getDeviceName } from "../lib/device";
import { useToast } from "../components/Toast";
import { Modal } from "../components/Modal";
import { Scene3D } from "../components/Scene3D";

const BOT_USERNAME = "KassaProBot";
const BOT_URL = `https://t.me/${BOT_USERNAME}`;

const fieldBase = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring", stiffness: 220, damping: 22 },
};

/**
 * Login sahifasi — JWT token olib store'ga saqlaydi.
 * Orqada 3D sahna (grid + suzuvchi kartalar).
 * Ro'yxatdan o'tish ochiq emas — yangi do'kon Telegram bot orqali ariza qoldiradi.
 */
export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);

  const login = useAuthStore((s) => s.login);
  const kickMessage = useAuthStore((s) => s.kickMessage);
  const setKickMessage = useAuthStore((s) => s.setKickMessage);
  const navigate = useNavigate();
  const { show } = useToast();

  // Sessiya revoke qilingan/bloklangan bo'lsa — xabarni ko'rsatamiz.
  useEffect(() => {
    if (kickMessage) {
      show(kickMessage, "error");
      setKickMessage(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const deviceType = detectDeviceType();
      const deviceModel = await getDeviceModel();
      const data = await api.post("auth/login/", {
        username,
        password,
        device_id: getDeviceId(),
        device_name: getDeviceName(username, deviceType),
        device_model: deviceModel,
        device_type: deviceType,
      });
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
              onClick={() => setApplyOpen(true)}
            >
              Yangi do'kon ochish
            </button>
          </motion.div>
        </form>

        <div className="barcode-deco" />
      </motion.div>

      <Modal open={applyOpen} onClose={() => setApplyOpen(false)}>
        <h3>Yangi do'kon ochish</h3>
        <p style={{ marginTop: 8, opacity: 0.85 }}>
          Ro'yxatdan o'tish endi <b>Telegram bot</b> orqali amalga oshiriladi.
          Bot'ga ariza qoldiring — admin tasdiqlagach, login va parol shu
          Telegram chat'ga yuboriladi.
        </p>
        <ol className="apply-steps">
          <li><span>1</span> Telegram'ni oching</li>
          <li><span>2</span> @{BOT_USERNAME} bot'ga <code>/start</code> yuboring</li>
          <li><span>3</span> Do'kon ma'lumotlarini to'ldiring</li>
          <li><span>4</span> Tasdiqlashni kuting</li>
        </ol>
        <div className="grid-2" style={{ marginTop: 18 }}>
          <a
            className="btn btn-ghost"
            href={BOT_URL}
            target="_blank"
            rel="noreferrer"
          >
            @{BOT_USERNAME}
          </a>
          <button className="btn btn-primary" type="button" onClick={() => setApplyOpen(false)}>
            Tushunarli
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default LoginPage;