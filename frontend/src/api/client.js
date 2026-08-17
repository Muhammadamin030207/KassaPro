import { useAuthStore } from "../stores/authStore";

const BASE = import.meta.env.VITE_API_URL || "/api";

/**
 * JWT bilan ishlaydigan API klient.
 * Access token eskirganda refresh token orqali qayta yangilanadi.
 *
 * @param {string} path - API yo'li
 * @param {object} [options] - fetch options
 * @returns {Promise<any>} parslangan JSON
 */
export async function apiFetch(path, options = {}) {
  const { getState } = useAuthStore;
  let { access, refresh } = useAuthStore.getState();

  const baseOptions = {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    },
  };

  let res = await fetch(`${BASE}/${path}`, baseOptions);

  // 401 bo'lsa — refresh token orqali access tokenni yangilash
  if (res.status === 401 && refresh) {
    try {
      const r = await fetch(`${BASE}/auth/refresh/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          refresh,
        }),
      });

      if (r.ok) {
        let data = null;

        try {
          data = await r.json();
        } catch {
          data = null;
        }

        // Refresh API null yoki noto'g'ri response qaytarsa
        if (!data || !data.access) {
          console.error("Refresh token response noto'g'ri:", data);
          getState().logout();
        } else {
          // Yangi refresh token kelmasa, eskisini saqlab qolamiz
          const newRefresh = data.refresh || refresh;

          useAuthStore.getState().setTokens({
            access: data.access,
            refresh: newRefresh,
          });

          baseOptions.headers.Authorization = `Bearer ${data.access}`;

          // Original requestni qayta yuborish
          res = await fetch(`${BASE}/${path}`, baseOptions);
        }
      } else {
        getState().logout();
      }
    } catch (error) {
      console.error("Token refresh xatosi:", error);
      getState().logout();
    }
  }

  // 204 No Content
  if (res.status === 204) {
    return null;
  }

  let body = null;

  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const message =
      extractError(body) ||
      `So'rov muvaffaqiyatsiz (${res.status})`;

    const err = new Error(message);
    err.status = res.status;
    err.data = body;

    throw err;
  }

  return body;
}

/**
 * DRF xato shaklidan inson tilida xatolik olish
 */
function extractError(body) {
  if (!body) return null;

  if (typeof body === "string") {
    return body;
  }

  if (body.detail) {
    return typeof body.detail === "string"
      ? body.detail
      : JSON.stringify(body.detail);
  }

  const first = Object.values(body)[0];

  if (Array.isArray(first)) {
    return first[0];
  }

  if (typeof first === "string") {
    return first;
  }

  return JSON.stringify(body);
}

export const api = {
  /**
   * Paged list:
   * { count, next, previous, results }
   */
  async list(path, params = {}) {
    const qs = new URLSearchParams(params).toString();

    return apiFetch(
      qs ? `${path}?${qs}` : path
    );
  },

  get: (path) =>
    apiFetch(path),

  post: (path, body) =>
    apiFetch(path, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  put: (path, body) =>
    apiFetch(path, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  patch: (path, body) =>
    apiFetch(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  del: (path) =>
    apiFetch(path, {
      method: "DELETE",
    }),
};