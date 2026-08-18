import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";

import { api } from "../api/client";
import { useToast } from "../components/Toast";
import Icon from "../components/Icon";
import { Modal } from "../components/Modal";

/**
 * Kassirlar sahifasi — faqat owner uchun.
 * Yangi kassir qo'shish, o'chirish.
 */
export function StaffPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", phone: "" });
  const [created, setCreated] = useState(null);

  const { show } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: () => api.list("staff/", { page_size: 100 }),
  });
  const staff = data?.results || [];

  const createMutation = useMutation({
    mutationFn: (payload) => api.post("staff/", payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      setCreated(res);
      setForm({ username: "", password: "", phone: "" });
      show("Kassir qo'shildi", "success");
    },
    onError: (e) => show(e.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.del(`staff/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      show("Kassir o'chirildi", "success");
    },
    onError: (e) => show(e.message, "error"),
  });

  const submit = (e) => {
    e.preventDefault();
    if (!form.username || !form.password) {
      show("Login va parol kiritilishi shart", "error");
      return;
    }
    createMutation.mutate(form);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="page-head">
        <div>
          <motion.h1 initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}>
            Kassirlar
          </motion.h1>
          <div className="sub">Do'koningiz xodimlari</div>
        </div>
        <motion.button
          className="btn btn-primary"
          onClick={() => setFormOpen(true)}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          <Icon name="plus" /> Yangi kassir
        </motion.button>
      </div>

      {isLoading ? (
        <div className="empty-state">Yuklanmoqda...</div>
      ) : staff.length === 0 ? (
        <div className="empty-state">
          <div className="big">👩‍💼</div>
          <h3>Hali kassirlar yo'q</h3>
          <p>"Yangi kassir" tugmasi bilan xodim qo'shing.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Login</th>
                <th>Telefon</th>
                <th>Rol</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.username}</b></td>
                  <td className="mono">{s.phone || "—"}</td>
                  <td><span className="badge badge-ok">Kassir</span></td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="ghost-btn"
                      onClick={() => {
                        if (window.confirm(`"${s.username}" kassirini o'chirishni tasdiqlaysizmi?`)) {
                          deleteMutation.mutate(s.id);
                        }
                      }}
                    >
                      <Icon name="trash" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)}>
        <h3>Yangi kassir</h3>
        <form onSubmit={submit}>
          <div className="field">
            <label>Login</label>
            <input
              className="input"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              autoFocus
            />
          </div>
          <div className="field">
            <label>Parol (min 6 belgi)</label>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Telefon (ixtiyoriy)</label>
            <input
              className="input mono"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+99890..."
            />
          </div>
          <div className="grid-2">
            <button type="button" className="btn btn-outline" onClick={() => setFormOpen(false)}>
              Bekor
            </button>
            <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Yuborilmoqda..." : "Yaratish"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Yangi kassir login ma'lumotlari */}
      <Modal open={!!created} onClose={() => setCreated(null)}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>🔑</div>
          <h3>Kassir yaratildi</h3>
          <p style={{ color: "var(--ink-soft)" }}>Quyidagi ma'lumotlarni kassirga bering:</p>
          <div className="card" style={{ background: "#f5faf5", textAlign: "left", margin: "14px 0" }}>
            <div className="flex spread">
              <span>Login</span>
              <b className="mono">{created?.username}</b>
            </div>
            <div className="flex spread" style={{ marginTop: 8 }}>
              <span>Parol</span>
              <b className="mono">{created?.generated_password}</b>
            </div>
          </div>
            <button className="btn btn-primary btn-block" onClick={() => setCreated(null)}>
            Tayyor
          </button>
        </div>
      </Modal>
    </motion.div>
  );
}

export default StaffPage;