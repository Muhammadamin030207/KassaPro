import { useAuthStore } from "../stores/authStore";

const BASE = import.meta.env.VITE_API_URL || "/api";

const KICK_MESSAGES = {
  session_revoked: "Ushbu qurilma administrator tomonidan chiqarildi.",
  session_expired: "Session muddati tugagan. Qayta kiring.",
  device_blocked: "Ushbu qurilma administrator tomonidan bloklangan.",
  network: "Internet aloqasini tekshiring.",
};

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
 * Revoked/blocklangan sessiya — foydalanuvchini xabar bilan login'ga chiqaradi.
 *
 * @param {string} path - API yo'li (masalan "products/")
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
  let body = await parseJson(res);

  // 401 — sessiya bekor/revoke qilingan yoki token eskirgan
  if (res.status === 401 && refresh) {
    try {
      const r = await fetch(`${BASE}/auth/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
      if (r.ok) {
        const data = await r.json();
        useAuthStore.getState().setTokens(data);
        baseOptions.headers.Authorization = `Bearer ${data.access}`;
        res = await fetch(`${BASE}/${path}`, baseOptions);
        body = await parseJson(res);
      } else {
        const rb = await parseJson(r);
        applyKick(rb, getState);
        getState().logout();
      }
    } catch {
      getState().setKickMessage(KICK_MESSAGES.network);
      getState().logout();
    }
  } else if (res.status === 401 && isKick(body)) {
    applyKick(body, getState);
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

function isKick(body) {
  return !!body && !!body.code && Object.prototype.hasOwnProperty.call(KICK_MESSAGES, body.code);
}

function applyKick(body, getState) {
  if (isKick(body)) {
    getState().setKickMessage(KICK_MESSAGES[body.code]);
  }
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