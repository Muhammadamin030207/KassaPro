import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

import { api } from "../api/client";
import { useAuthStore } from "../stores/authStore";
import { detectDeviceType, getDeviceId, getDeviceModel, getDeviceName } from "../lib/device";
import { useToast } from "../components/Toast";
import { Scene3D } from "../components/Scene3D";

// Telegram bot URL — VITE_TELEGRAM_BOT_URL env orqali, yo'q bo'lsa default bot.
const BOT_URL =
  import.meta.env.VITE_TELEGRAM_BOT_URL || "https://t.me/KassaProBot";

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

  // Telegram botga ariza qoldirish (yangi do'kon ochish).
  const openBot = () => {
    if (!BOT_URL || !/^https?:\/\//.test(BOT_URL)) {
      show("Telegram bot sozlanmagan — VITE_TELEGRAM_BOT_URL env'ni tekshiring", "error");
      return;
    }
    window.open(BOT_URL, "_blank", "noopener,noreferrer");
  };

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
          </motion.div>
        </form>

        <div className="login-divider">
          <span>yoki</span>
        </div>

        <motion.button
          type="button"
          className="btn btn-telegram btn-block"
          onClick={openBot}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 22, delay: 0.34 }}
        >
          ✈ Telegram orqali yangi do'kon ochish
        </motion.button>

        <p className="login-bot-hint">
          Do'kon arizangizni @KassaProBot ga yuboring — admin tasdiqlagach login va
          parol Telegram chat'ga keladi.
        </p>

        <div className="barcode-deco" />
      </motion.div>
    </div>
  );
}

export default LoginPage;