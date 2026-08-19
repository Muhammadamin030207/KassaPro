import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { api } from "../api/client";
import { useToast } from "../components/Toast";
import Icon from "../components/Icon";

const SECTIONS = [
  {
    id: "qr",
    title: "Dinamik QR (Humo / UzCard)",
    icon: "smartphone",
    badge: "Asosiy",
    desc:
      "Kassada mijoz skanerlaydigan QR. To'lov to'g'ridan-to'g'ri " +
      "kartangizga tushadi — boshqa kabinet ochish shart emas.",
    fields: [
      {
        key: "qr_card_number",
        label: "Karta raqami (Humo/UzCard)",
        placeholder: "9860 0000 0000 0000",
        hint: "QR shu kartaga pul o'tkazish uchun yaratiladi.",
        mono: true,
      },
      {
        key: "qr_holder",
        label: "Karta egasi (F.I.SH)",
        placeholder: "ASATOVA NILUFAR",
        hint: "Karta ro'yxatdan o'tgan ism-familiya (katta harflar bilan).",
        mono: true,
      },
    ],
  },
  {
    id: "payme",
    title: "Payme (onlayn to'lov)",
    icon: "zap",
    badge: "Ixtiyoriy",
    desc:
      "Mijoz payme.uz orqali to'laydi. Ishga tushirish uchun " +
      "merchant.paycom.uz da ro'yxatdan o'ting va 'Web kassa' yarating.",
    fields: [
      {
        key: "payme_merchant_id",
        label: "Payme Merchant ID",
        placeholder: "5e01ea93c6d9c24334933856",
        hint:
          "Payme kabinetida 'Web kassa' ochganda beriladigan 24 belgili ID.",
        mono: true,
      },
      {
        key: "payme_card",
        label: "Karta raqami",
        placeholder: "8600 0000 0000 0000",
        hint: "Payme hisobingizga ulangan karta — to'lovlar shu yerga tushadi.",
        mono: true,
      },
    ],
  },
  {
    id: "click",
    title: "Click (onlayn to'lov)",
    icon: "zap",
    badge: "Ixtiyoriy",
    desc:
      "Mijoz Click ilovasi orqali to'laydi. Buning uchun " +
      "cabinet.click.uz da xizmat (service) ochish kerak.",
    fields: [
      {
        key: "click_service_id",
        label: "Click Service ID",
        placeholder: "12345",
        hint: "Click kabinetida xizmat ochganda berilgan raqam.",
        mono: true,
      },
      {
        key: "click_merchant_id",
        label: "Click Merchant ID",
        placeholder: "5432",
        hint: "Click xizmatining 'Merchant ID' raqami.",
        mono: true,
      },
      {
        key: "click_card",
        label: "Karta raqami",
        placeholder: "8600 0000 0000 0000",
        hint: "Click hisobingizga ulangan karta.",
        mono: true,
      },
    ],
  },
  {
    id: "paynet",
    title: "Paynet (onlayn to'lov)",
    icon: "zap",
    badge: "Ixtiyoriy",
    desc:
      "Mijoz Paynet orqali to'laydi. Ishga tushirish uchun " +
      "Paynet kabinetida do'kon (merchant) ochish kerak.",
    fields: [
      {
        key: "paynet_merchant_id",
        label: "Paynet Merchant ID",
        placeholder: "Merchant ID raqami",
        hint: "Paynet kabinetida do'koningizga berilgan raqam.",
        mono: true,
      },
      {
        key: "paynet_card",
        label: "Karta raqami",
        placeholder: "8600 0000 0000 0000",
        hint: "Paynet hisobingizga ulangan karta.",
        mono: true,
      },
    ],
  },
];

const ALL_FIELDS = SECTIONS.flatMap((s) => s.fields);

/**
 * Do'kon sozlamalari — to'lov rekvizitlari (QR / Payme / Click / Paynet).
 * Owner ham, admin ham tahrirlay oladi; kassir faqat ko'radi.
 */
export function SettingsPage() {
  const [form, setForm] = useState({});
  const [shopName, setShopName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { show } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get("stores/settings/");
      const next = {};
      ALL_FIELDS.forEach((f) => {
        next[f.key] = data?.[f.key] || "";
      });
      setForm(next);
      setShopName(data?.shop_name || "");
    } catch (err) {
      show(err.message || "Sozlamalarni yuklashda xatolik", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const res = await api.patch("stores/settings/", form);
      setShopName(res?.shop_name || shopName);
      show("Sozlamalar saqlandi", "success");
    } catch (err) {
      show(err.message || "Saqlashda xatolik", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Do'kon sozlamalari</h1>
          <p className="muted">
            To'lov ma'lumotlari kassadagi QR va to'lov oynalarida ishlatiladi.
            {shopName ? (
              <span className="settings-shop"> · {shopName}</span>
            ) : null}
          </p>
        </div>
      </div>

      <motion.form
        className="settings-form"
        onSubmit={save}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div className="settings-note">
          <Icon name="alert" size={20} />
          <div>
            <b>Qaysi qatorni to'ldirishim kerak?</b>
            <p>
              Eng oddiy va faol usul — <b>Dinamik QR</b>: faqat kartangiz
              raqami va egasini kiriting, kassada seplash uchun QR ko'rsatiladi.
              Payme/Click/Paynet — ixtiyoriy onlayn to'lov xizmatlari
              (ularning ID raqamlari shu xizmatlarning kabinetida aynan
              do'koningizga beriladi, shuning uchun ularni o'zingiz olasiz).
              Agar hozircha yo'q bo'lsa, bo'sh qoldiring — kassa bemalol
              ishlayveradi.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="panel">
            <div className="empty-state">Yuklanmoqda...</div>
          </div>
        ) : (
          SECTIONS.map((section, idx) => (
            <section className="panel settings-group" key={section.id}>
              <div className="settings-group-head">
                <span className="settings-group-icon">
                  <Icon name={section.icon} size={20} />
                </span>
                <div className="settings-group-title">
                  <b>{section.title}</b>
                  <span className={`settings-badge ${idx === 0 ? "settings-badge-main" : ""}`}>
                    {section.badge}
                  </span>
                </div>
                <p className="muted settings-group-desc">{section.desc}</p>
              </div>
              <div className="settings-grid">
                {section.fields.map((f) => (
                  <div className="field" key={f.key}>
                    <label>{f.label}</label>
                    <input
                      className={`input ${f.mono ? "input-mono" : ""}`}
                      value={form[f.key] || ""}
                      onChange={(e) =>
                        setForm({ ...form, [f.key]: e.target.value })
                      }
                      placeholder={f.placeholder}
                      spellCheck={false}
                    />
                    {f.hint ? <p className="field-hint">{f.hint}</p> : null}
                  </div>
                ))}
              </div>
            </section>
          ))
        )}

        <div className="panel-foot">
          <button
            className="btn btn-primary"
            disabled={loading || saving}
            type="submit"
          >
            {saving ? "Saqlanmoqda..." : "Saqlash"}
          </button>
        </div>
      </motion.form>
    </div>
  );
}

export default SettingsPage;