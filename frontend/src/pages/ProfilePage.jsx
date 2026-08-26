import { useRef, useState } from "react";

import { api } from "../api/client";
import { useAuthStore } from "../stores/authStore";
import { useToast } from "../components/Toast";
import Icon from "../components/Icon";
import { PhoneInputMask } from "../components/PhoneInputMask";

/** Profil: avatar + ma'lumotlar + do'kon nomi — BITTA Saqlash tugmasi.
 *  Parol alohida bo'lim (o'z tasdiqlashi bilan). Xatolar maydon ostida. */
export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { show } = useToast();

  const fileRef = useRef(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarDirty, setAvatarDirty] = useState(false);

  const [firstName, setFirstName] = useState(user?.first_name || "");
  const [lastName, setLastName] = useState(user?.last_name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [shopName, setShopName] = useState(user?.shop_name || "");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwErrors, setPwErrors] = useState({});
  const [savingPw, setSavingPw] = useState(false);

  /** Rasmni 256px kvadratga siqib data URL qilamiz. */
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
        setAvatarDirty(true);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const saveAll = async (e) => {
    e.preventDefault();
    setErrors({});
    setSaving(true);
    try {
      const payload = {
        first_name: firstName,
        last_name: lastName,
        phone,
      };
      if (avatarDirty) payload.avatar = avatarPreview || "";
      if (user?.role === "owner" && shopName.trim()) payload.shop_name = shopName.trim();
      const data = await api.patch("auth/profile/", payload);
      setUser({ ...user, ...data });
      setAvatarPreview(null);
      setAvatarDirty(false);
      show("Profil saqlandi! Barcha qurilmalarda yangilanadi.", "success");
    } catch (err) {
      setErrors(err.data || {});
      const first =
        err.data && typeof err.data === "object"
          ? Object.values(err.data)[0]
          : null;
      show(
        typeof first === "string"
          ? first
          : err.message || "Saqlashda xatolik",
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setPwErrors({});
    if (newPw.length < 6) {
      setPwErrors({ new_password: "Kamida 6 belgi bo'lsin" });
      return;
    }
    if (newPw !== newPw2) {
      setPwErrors({ new_password2: "Parollar mos kelmadi" });
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
    } catch (err) {
      setPwErrors(err.data || {});
      const first =
        err.data && typeof err.data === "object"
          ? Object.values(err.data)[0]
          : null;
      show(typeof first === "string" ? first : err.message || "Xatolik", "error");
    } finally {
      setSavingPw(false);
    }
  };

  const avatarSrc = avatarPreview || user?.avatar || null;
  const initial = (user?.username || "?").charAt(0).toUpperCase();
  const fieldErr = (k) =>
    errors[k] && (
      <div className="field-error" style={{ marginTop: 4 }}>
        {Array.isArray(errors[k]) ? errors[k][0] : errors[k]}
      </div>
    );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Profil</h1>
          <div className="sub">Shaxsiy ma'lumotlar va xavfsizlik</div>
        </div>
      </div>

      <form className="panel" style={{ padding: 20, marginBottom: 16 }} onSubmit={saveAll}>
        {/* Avatar */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", marginBottom: 16 }}>
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
          <div>
            <b style={{ fontSize: 16 }}>{user?.username}</b>
            <div className="muted small" style={{ margin: "4px 0 8px" }}>
              Rasm tanlansin — Saqlash bilan birga amalga oshadi
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => pickAvatar(e.target.files?.[0])}
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
              <Icon name="camera" size={16} /> Kamera / Galereya
            </button>
            {fieldErr("avatar")}
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label>Ism</label>
            <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            {fieldErr("first_name")}
          </div>
          <div className="field">
            <label>Familiya</label>
            <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            {fieldErr("last_name")}
          </div>
          <div className="field">
            <label>Telefon</label>
            <PhoneInputMask value={phone} onChange={(v) => setPhone(v)} placeholder="+998 90 123 45 67" />
            {fieldErr("phone")}
          </div>
          {user?.role === "owner" && (
            <div className="field">
              <label>Do'kon nomi</label>
              <input className="input" value={shopName} onChange={(e) => setShopName(e.target.value)} />
              {fieldErr("shop_name")}
            </div>
          )}
        </div>

        <button className="btn btn-primary" disabled={saving}>
          <Icon name="check" size={16} /> {saving ? "Saqlanmoqda..." : "Saqlash"}
        </button>
      </form>

      {/* Parol — alohida (xavfsizlik) */}
      <form className="panel" style={{ padding: 20 }} onSubmit={savePassword}>
        <h3 style={{ marginBottom: 12 }}>Parolni o'zgartirish</h3>
        <div className="field">
          <label>Joriy parol</label>
          <input
            className="input"
            type="password"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            autoComplete="current-password"
          />
          {pwErrors.current_password && (
            <div className="field-error" style={{ marginTop: 4 }}>
              {Array.isArray(pwErrors.current_password)
                ? pwErrors.current_password[0]
                : pwErrors.current_password}
            </div>
          )}
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Yangi parol</label>
            <input className="input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
            {pwErrors.new_password && (
              <div className="field-error" style={{ marginTop: 4 }}>
                {Array.isArray(pwErrors.new_password) ? pwErrors.new_password[0] : pwErrors.new_password}
              </div>
            )}
          </div>
          <div className="field">
            <label>Yangi parol (takror)</label>
            <input className="input" type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} autoComplete="new-password" />
            {pwErrors.new_password2 && (
              <div className="field-error" style={{ marginTop: 4 }}>{pwErrors.new_password2}</div>
            )}
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
