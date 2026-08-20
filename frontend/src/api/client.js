import { useAuthStore } from "../stores/authStore";

const BASE = import.meta.env.VITE_API_URL || "/api";

// Access token eskirganda bir vaqtning o'zida kelgan bir nechta so'rov har biri
// alohida refresh POST yubormasligi uchun bitta promise ulashiladi.
let refreshPromise = null;

async function refreshTokens() {
  const { refresh } = useAuthStore.getState();
  if (!refresh) throw new Error("no-refresh-token");
  const r = await fetch(`${BASE}/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!r.ok) throw new Error("refresh-failed");
  const data = await r.json();
  useAuthStore.getState().setTokens(data);
  return data.access;
}

function dedupeRefresh() {
  if (!refreshPromise) {
    refreshPromise = refreshTokens().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function parseJson(res) {
  if (res.status === 204) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * JWT bilan ishlaydigan API klient.
 * Access token eskirganda refresh token orqali qayta yangilanadi.
 * Refresh ham muvaffaqiyatsiz bo'lsa — foydalanuvchi login'ga qaytariladi.
 *
 * @param {string} path - API yo'li (masalan "products/")
 * @param {object} [options] - fetch options
 * @returns {Promise<any>} parslangan JSON
 */
export async function apiFetch(path, options = {}) {
  const { getState } = useAuthStore;
  let { access } = useAuthStore.getState();

  const baseOptions = {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    },
  };

  let res = await fetch(`${BASE}/${path}`, baseOptions);
  let body = await parseJson(res);

  // 401 — token eskirgan, refresh orqali tiklashga urinamiz.
  if (res.status === 401 && useAuthStore.getState().refresh) {
    try {
      const access = await dedupeRefresh();
      baseOptions.headers.Authorization = `Bearer ${access}`;
      res = await fetch(`${BASE}/${path}`, baseOptions);
      body = await parseJson(res);
      if (res.status === 401) {
        // Refresh'dan keyin ham 401 — sessiya haqiqatan o'lgan, logout qilamiz.
        getState().logout();
      }
    } catch {
      getState().logout();
    }
  } else if (res.status === 401) {
    getState().logout();
  }

  if (res.status === 204) return null;
  if (!res.ok) {
    const message = extractError(body) || `So'rov muvaffaqiyatsiz (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.data = body;
    throw err;
  }
  return body;
}

/** DRF xato shaklidan inson tilida xatolik olish */
function extractError(body) {
  if (!body) return null;
  if (typeof body === "string") return body;
  if (body.detail) return typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);

  const first = Object.values(body)[0];
  if (Array.isArray(first)) return first[0];
  if (typeof first === "string") return first;
  return JSON.stringify(body);
}

export const api = {
  /** Paged list: { count, next, previous, results } */
  async list(path, params = {}) {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(qs ? `${path}?${qs}` : path);
  },
  get: (path) => apiFetch(path),
  post: (path, body) => apiFetch(path, { method: "POST", body: JSON.stringify(body) }),
  put: (path, body) => apiFetch(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: (path, body) => apiFetch(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: (path) => apiFetch(path, { method: "DELETE" }),
};