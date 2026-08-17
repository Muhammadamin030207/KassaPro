import { useState } from "react";
import { motion } from "framer-motion";

import { api } from "../api/client";
import { Modal } from "./Modal";
import { PhoneInputMask } from "./PhoneInputMask";
import { formatMoney } from "../utils/format";

/**
 * Nasiya sotuvi uchun mijozni topish/yangi yaratish modali.
 * Telefon raqam bo'yicha qidiriladi; topilsa ko'rsatiladi (avvalgi qarzi bilan),
 * topilmasa yangi mijoz yaratish taklif qilinadi.
 *
 * @param {{
 *   open: boolean,
 *   total: number,
 *   onSelect: (customer: {phone: string, name?: string}) => void,
 *   onClose: () => void,
 * }} props
 */
export function NasiyaCustomerModal({ open, total, onSelect, onClose }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [found, setFound] = useState(null);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState("search"); // search | create

  const lookup = async () => {
    if (!phone || phone.replace(/\D/g, "").length !== 12) {
      setFound(null);
      return;
    }
    setSearching(true);
    setFound(null);
    try {
      const data = await api.get(`customers/by-phone/${phone}/`);
      setFound(data);
      setMode("search");
    } catch {
      setFound(null);
      setMode("create");
    } finally {
      setSearching(false);
    }
  };

  const pickFound = () => {
    onSelect({ phone: found.phone, name: found.name });
  };

  const createNew = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const data = await api.post("customers/", { name: name.trim(), phone });
      onSelect({ phone: data.phone, name: data.name });
    } catch (err) {
      setCreating(false);
      throw err;
    }
  };

  const reset = () => {
    setPhone("");
    setName("");
    setFound(null);
    setMode("search");
  };

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Modal open={open} onClose={close}>
      <motion.div
        key={mode}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <h3>Nasiya sotuvi</h3>
        <div className="sub" style={{ color: "var(--ink-soft)", margin: "6px 0 18px" }}>
          Jami: <b className="mono" style={{ color: "var(--warn)" }}>{formatMoney(total)}</b> — mijozni tanlang
        </div>

        <div className="field">
          <label>Mijoz telefoni</label>
          <PhoneInputMask
            value={phone}
            onChange={setPhone}
            autoFocus
          />
        </div>
        <div style={{ margin: "10px 0 4px" }}>
          <button
            className="btn btn-primary"
            onClick={lookup}
            disabled={searching || !phone || phone.replace(/\D/g, "").length !== 12}
            style={{ width: "100%" }}
          >
            {searching ? "Qidirilmoqda..." : "Raqam bo'yicha qidirish"}
          </button>
        </div>

        {mode === "search" && found && (
          <motion.div
            className="glass-panel"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ marginTop: 16, padding: 16 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{found.name}</div>
                <div className="mono sub">{found.phone}</div>
                <div className="sub" style={{ marginTop: 4 }}>
                  Joriy qarzi:{" "}
                  <b className="mono" style={{ color: Number(found.balance) > 0 ? "var(--warn)" : "var(--success)" }}>
                    {formatMoney(found.balance)}
                  </b>
                </div>
              </div>
              <button className="btn btn-primary" onClick={pickFound}>
                Tanlash
              </button>
            </div>
          </motion.div>
        )}

        {mode === "create" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ marginTop: 16 }}
          >
            <div className="sub" style={{ color: "var(--ink-faint)", marginBottom: 10 }}>
              Bu raqam bo'yicha mijoz topilmadi. Yangi mijoz sifatida qo'shamizmi?
            </div>
            <div className="field">
              <label>Mijoz ismi</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Masalan: Asatova Nilufar"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createNew(); } }}
              />
            </div>
            <button
              className="btn btn-accent"
              onClick={createNew}
              disabled={creating || !name.trim()}
              style={{ width: "100%" }}
            >
              {creating ? "Saqlanmoqda..." : "Yangi mijoz yaratish va nasiya qilish"}
            </button>
          </motion.div>
        )}

        <div style={{ marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={close} style={{ width: "100%" }}>
            Bekor qilish
          </button>
        </div>
      </motion.div>
    </Modal>
  );
}

export default NasiyaCustomerModal;