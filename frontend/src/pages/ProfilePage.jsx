import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "../api/client";
import { useAuthStore } from "../stores/authStore";
import { useToast } from "../components/Toast";
import Icon from "../components/Icon";

/** Profil sahifasi: avatar (kamera/galereya), ma'lumotlar, do'kon nomi, parol. */
export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { show } = useToast();
  const qc = useQueryClient();

  const fileRef = useRef(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [savingAvatar, setSavingAvatar] = useState(false);

  const [firstName, setFirstName] = useState(user?.first_name || "");
  const [lastName, setLastName] = useState(user?.last_name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [shopName, setShopName] = useState(user?.shop_name || "");
  const [savingInfo, setSavingInfo] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  /** Rasmni canvas orqali 256px kvadratga siqib data URL qilamiz (DB'ga sig'adi). */
  const pickAvatar = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      show("Faqat rasm fayli", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const min = Math.min(img.width, img.height);
        ctx.drawImage(
          img,
          (img.width - min) / 2,
          (img.height - min) / 2,
          min,
          min,
          0,
          0,
          size,
          size
        );
        setAvatarPreview(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const saveAvatar = async () => {
    if (!avatarPreview) return;
    setSavingAvatar(true);
    try {
      const data = await api.patch("auth/profile/", { avatar: avatarPreview });
      setUser({ ...user, ...data });
      setAvatarPreview(null);
      show("Avatar saqlandi!", "success");
      qc.invalidateQueries();
    } catch (e) {
      show(e.message, "error");
    } finally {
      setSavingAvatar(false);
    }
  };

  const saveInfo = async (e) => {
    e.preventDefault();
    setSavingInfo(true);
    try {
      const payload = { first_name: firstName, last_name: lastName, phone };
      if (user?.role === "owner" && shopName.trim()) payload.shop_name = shopName.trim();
      const data = await api.patch("auth/profile/", payload);
      setUser({ ...user, ...data });
      show("Ma'lumotlar saqlandi!", "success");
    } catch (e) {
      show(e.message, "error");
    } finally {
      setSavingInfo(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (newPw.length < 6) {
      show("Yangi parol kamida 6 belgi", "error");
      return;
    }
    if (newPw !== newPw2) {
      show("Parollar mos kelmadi", "error");
      return;
    }
    setSavingPw(true);
    try {
      await api.post("auth/change-password/", {
        current_password: currentPw,
        new_password: newPw,
      });
      show("Parol o'zgartirildi!", "success");
      setCurrentPw("");
      setNewPw("");
      setNewPw2("");
    } catch (e) {
      show(e.message, "error");
    } finally {
      setSavingPw(false);
    }
  };

  const avatarSrc = avatarPreview || null;
  const initial = (user?.username || "?").charAt(0).toUpperCase();

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Profil</h1>
          <div className="sub">Shaxsiy ma'lumotlar va xavfsizlik</div>
        </div>
      </div>

      {/* Avatar */}
      <div className="panel" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt="avatar"
              style={{
                width: 84,
                height: 84,
                borderRadius: "50%",
                objectFit: "cover",
                border: "3px solid var(--brand)",
              }}
            />
          ) : (
            <span
              style={{
                width: 84,
                height: 84,
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 34,
                fontWeight: 700,
                color: "#fff",
                background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
              }}
            >
              {initial}
            </span>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <b style={{ fontSize: 16 }}>{user?.username}</b>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => pickAvatar(e.target.files?.[0])}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
                <Icon name="camera" size={16} /> Kamera / Galereya
              </button>
              {avatarPreview && (
                <>
                  <button className="btn btn-primary btn-sm" disabled={savingAvatar} onClick={saveAvatar}>
                    {savingAvatar ? "Saqlanmoqda..." : "Saqlash"}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setAvatarPreview(null)}>
                    Bekor
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Ma'lumotlar */}
      <form className="panel" style={{ padding: 20, marginBottom: 16 }} onSubmit={saveInfo}>
        <h3 style={{ marginBottom: 12 }}>Ma'lumotlar</h3>
        <div className="grid-2">
          <div className="field">
            <label>Ism</label>
            <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="field">
            <label>Familiya</label>
            <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div className="field">
            <label>Telefon</label>
            <input className="input mono" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998..." />
          </div>
          {user?.role === "owner" && (
            <div className="field">
              <label>Do'kon nomi</label>
              <input className="input" value={shopName} onChange={(e) => setShopName(e.target.value)} />
            </div>
          )}
        </div>
        <button className="btn btn-primary" disabled={savingInfo}>
          {savingInfo ? "Saqlanmoqda..." : "Saqlash"}
        </button>
      </form>

      {/* Parol */}
      <form className="panel" style={{ padding: 20 }} onSubmit={savePassword}>
        <h3 style={{ marginBottom: 12 }}>Parolni o'zgartirish</h3>
        <div className="field">
          <label>Joriy parol</label>
          <input className="input" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} autoComplete="current-password" />
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Yangi parol</label>
            <input className="input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="field">
            <label>Yangi parol (takror)</label>
            <input className="input" type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        <button className="btn btn-primary" disabled={savingPw || !currentPw || !newPw}>
          {savingPw ? "Saqlanmoqda..." : "Parolni o'zgartirish"}
        </button>
      </form>
    </div>
  );
}

export default ProfilePage;
