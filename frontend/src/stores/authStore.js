import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Autentifikatsiya holati (JWT + foydalanuvchi).
 * localStorage'da saqlanadi — sahifa yangilanganda ham sessiya turaveradi.
 */
export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      access: null,
      refresh: null,

      setTokens: ({ access, refresh } = {}) => set({ access, refresh }),
      setUser: (user) => set({ user }),
      login: (data) => {
        if (!data || typeof data !== "object") {
          console.error("LOGIN DATA NULL:", data);
          return false;
        }
        set({
          access: data.access || null,
          refresh: data.refresh || null,
          user: data.user || null,
        });
        return true;
      },
      logout: () => set({ user: null, access: null, refresh: null }),
    }),
    { name: "smartkassa-auth" }
  )
);

/** JWT payload yaxlit emasligini tekshiradi (exp o'tganmi) */
export function isTokenExpired(token) {
  if (!token) return true;
  try {
    const [, payloadB64] = token.split(".");
    const payload = JSON.parse(atob(payloadB64));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}