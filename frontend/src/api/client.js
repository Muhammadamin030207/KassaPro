import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      access: null,
      refresh: null,

      setTokens: (tokens) => {
        if (!tokens) {
          console.error("setTokens: tokens null");
          return;
        }

        set({
          access: tokens.access || null,
          refresh: tokens.refresh || null,
        });
      },

      setUser: (user) => {
        set({
          user: user || null,
        });
      },

      login: (data) => {
        console.log("AUTH LOGIN DATA:", data);

        if (!data) {
          console.error("LOGIN DATA NULL!");
          return false;
        }

        set({
          access: data.access || null,
          refresh: data.refresh || null,
          user: data.user || null,
        });

        return true;
      },

      logout: () => {
        set({
          user: null,
          access: null,
          refresh: null,
        });
      },
    }),
    {
      name: "smartkassa-auth",
    }
  )
);