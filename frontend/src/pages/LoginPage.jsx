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
  import.meta.env.VITE_TELEGRAM_BOT_URL || "https://t.me/KassaPro_001_bot";
const BOT_USERNAME = BOT_URL.split("/").filter(Boolean).pop() || "KassaPro";

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
  const [apply, setApply] = useState({ store_name: "", owner_name: "", phone: "", address: "" });
  const [applyErrors, setApplyErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [applyResult, setApplyResult] = useState(null);

  const login = useAuthStore((s) => s.login);
  const kickMessage = useAuthStore((s) => s.kickMessage);
  const setKickMessage = useAuthStore((s) => s.setKickMessage);
  const navigate = useNavigate();
  const { show } = useToast();

  // Navbatda kelgan holat xabari bo'lsa — ko'rsatamiz va tozalaymiz.
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

  // Web form orqali ariza yuborish → POST /api/applications/ → Telegram admin.
  const submitApplication = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!apply.store_name.trim()) errors.store_name = "Do'kon nomi kiritilmagan";
    if (!apply.owner_name.trim()) errors.owner_name = "Egasining ism-familiyasi kiritilmagan";
    if (!apply.phone.trim()) errors.phone = "Telefon raqami kiritilmagan";
    else if (!/^\+?[0-9][0-9 ()-]{7,}$/.test(apply.phone.trim()))
      errors.phone = "Telefon raqami noto'g'ri formatda";
    if (Object.keys(errors).length) {
      setApplyErrors(errors);
      return;
    }
    setApplyErrors({});
    setSending(true);
    setApplyResult(null);
    try {
      const res = await api.post("applications/", {
        store_name: apply.store_name.trim(),
        owner_name: apply.owner_name.trim(),
        phone: apply.phone.trim(),
        address: apply.address.trim(),
      });
      if (res && res.telegram_sent) {
        setApplyResult({ ok: true, message: res.message || "Ariza muvaffaqiyatli yuborildi!" });
        setApply({ store_name: "", owner_name: "", phone: "", address: "" });
        setApplyOpen(false);
        show("Ariza muvaffaqiyatli yuborildi!", "success");
      } else {
        setApplyResult({
          ok: false,
          message:
            res?.message ||
            "Ariza saqlandi, lekin Telegram xabarnomasi yuborilmadi. Iltimos keyinroq urinib ko'ring.",
        });
        show("Arizani yuborishda xatolik yuz berdi", "error");
      }
    } catch (err) {
      setApplyResult({ ok: false, message: err.message || "Arizani yuborishda xatolik yuz berdi" });
      show(err.message || "Arizani yuborishda xatolik yuz berdi", "error");
    } finally {
      setSending(false);
    }
  };

  const applyField = (name) => (e) =>
    setApply((prev) => ({ ...prev, [name]: e.target.value }));

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
          Do'kon arizangizni @{BOT_USERNAME} ga yuboring — admin tasdiqlagach
          login va parol Telegram chat'ga keladi.
        </p>

        <motion.button
          type="button"
          className="btn btn-ghost btn-block apply-toggle"
          onClick={() => setApplyOpen((v) => !v)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          {applyOpen ? "— Formani yopish" : "Ariza formasini to'ldirish"}
        </motion.button>

        {applyOpen && (
          <motion.form
            className="apply-form"
            onSubmit={submitApplication}
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
          >
            <div className="apply-form-title">Yangi do'kon uchun ariza</div>

            <div className="field">
              <label>Do'kon nomi</label>
              <input
                className="input"
                value={apply.store_name}
                onChange={applyField("store_name")}
                placeholder="Masalan: Asosiy Savdo"
                maxLength={150}
              />
              {applyErrors.store_name && <div className="field-error">{applyErrors.store_name}</div>}
            </div>

            <div className="field">
              <label>Egasi ism-familiyasi</label>
              <input
                className="input"
                value={apply.owner_name}
                onChange={applyField("owner_name")}
                placeholder="Masalan: Aliyev Alisher"
                maxLength={255}
              />
              {applyErrors.owner_name && <div className="field-error">{applyErrors.owner_name}</div>}
            </div>

            <div className="field">
              <label>Telefon raqami</label>
              <input
                className="input input-mono"
                type="tel"
                value={apply.phone}
                onChange={applyField("phone")}
                placeholder="+998 90 123 45 67"
                inputMode="tel"
                maxLength={20}
              />
              {applyErrors.phone && <div className="field-error">{applyErrors.phone}</div>}
            </div>

            <div className="field">
              <label>Manzil (ixtiyoriy)</label>
              <input
                className="input"
                value={apply.address}
                onChange={applyField("address")}
                placeholder="Toshkent, Chilonzor 8"
                maxLength={255}
              />
            </div>

            <button className="btn btn-primary btn-block" disabled={sending}>
              {sending ? "Yuborilmoqda..." : "Arizani yuborish"}
            </button>

            {applyResult && (
              <div className={`apply-result ${applyResult.ok ? "ok" : "err"}`}>
                {applyResult.message}
              </div>
            )}
          </motion.form>
        )}

        <div className="barcode-deco" />
      </motion.div>
    </div>
  );
}

export default LoginPage;