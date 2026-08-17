import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { api } from "../api/client";
import { useToast } from "../components/Toast";

const FIELDS = [
  { key: "payme_merchant_id", label: "Payme Merchant ID" },
  { key: "payme_card", label: "Payme karta raqami" },
  { key: "click_service_id", label: "Click Service ID" },
  { key: "click_merchant_id", label: "Click Merchant ID" },
  { key: "click_card", label: "Click karta raqami" },
  { key: "paynet_merchant_id", label: "Paynet Merchant ID" },
  { key: "paynet_card", label: "Paynet karta raqami" },
  { key: "qr_card_number", label: "QR karta raqami (Humo/UzCard)" },
  { key: "qr_holder", label: "Karta egasi (F.I.SH)" },
];

/**
 * Do'kon sozlamalari — to'lov rekvizitlari (Payme/Click/Paynet) va
 * dinamik QR (Humo/UzCard). Faqat owner (egasi) ko'radi va tahrirlaydi.
 */
export function SettingsPage() {
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { show } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get("stores/settings/");
      const next = {};
      FIELDS.forEach((f) => {
        next[f.key] = data?.[f.key] || "";
      });
      setForm(next);
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
    setSaving(true);
    try {
      await api.patch("stores/settings/", form);
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
            To'lov rekvizitlari va dinamik QR kassada ko'rsatiladi.
          </p>
        </div>
      </div>

      <motion.form
        className="panel"
        onSubmit={save}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        {loading ? (
          <div className="empty-state">Yuklanmoqda...</div>
        ) : (
          <div className="settings-grid">
            {FIELDS.map((f) => (
              <div className="field" key={f.key}>
                <label>{f.label}</label>
                <input
                  className="input"
                  value={form[f.key] || ""}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.label}
                />
              </div>
            ))}
          </div>
        )}
        <div className="panel-foot">
          <button className="btn btn-primary" disabled={loading || saving}>
            {saving ? "Saqlanmoqda..." : "Saqlash"}
          </button>
        </div>
      </motion.form>
    </div>
  );
}

export default SettingsPage;