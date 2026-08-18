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
      sessionId: null,
      kickMessage: null,

      setTokens: ({ access, refresh } = {}) => set({ access, refresh }),
      setUser: (user) => set({ user }),
      setKickMessage: (msg) => set({ kickMessage: msg || null }),
      login: (data) => {
        if (!data || typeof data !== "object") {
          return false;
        }
        set({
          access: data.access || null,
          refresh: data.refresh || null,
          user: data.user || null,
          sessionId: data.session_id || null,
          kickMessage: null,
        });
        return true;
      },
      logout: () => set({ user: null, access: null, refresh: null, sessionId: null }),
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

/**
 * Hozirgi sessiya haqiqatan amalga oshganmi?
 * `user` bor-u lekin access token eskirgan bo'lsa — authed EMAS.
 * Shu yagona tekshiruv Protected va /login'da bir xil ishlatiladi,
 * aks holda `/?pwa=true` standalone'da cheksiz redirect loop paydo bo'ladi.
 */
export function isAuthed(state) {
  return !!(state.user && state.access && !isTokenExpired(state.access));
}