const DEVICE_KEY = "smartkassa-device";

/** Persistent device_id — browser/installation uchun UUID v4. */
export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = generateUuid();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

function generateUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const DEVICE_MODEL_UNKNOWN = "Noutbuk modeli aniqlanmadi";
export const DEVICE_MODEL_UNKNOWN_MOBILE = "Qurilma modeli aniqlanmadi";

const TYPE_LABELS = {
  laptop: "Laptop",
  desktop: "Desktop",
  tablet: "Tablet",
  phone: "Smartphone",
};

const VERSION_RE = /([\d.]+)/;

function versionAfter(ua, marker) {
  const idx = ua.indexOf(marker);
  if (idx === -1) return "";
  const rest = ua.slice(idx + marker.length);
  const m = rest.match(VERSION_RE);
  return m ? m[1] : "";
}

function parseUserAgent(ua) {
  let browser = "", browserVersion = "", os = "", osVersion = "";

  if (/Edg\//.test(ua)) {
    browser = "Edge";
    browserVersion = versionAfter(ua, "Edg/");
  } else if (/OPR\//.test(ua)) {
    browser = "Opera";
    browserVersion = versionAfter(ua, "OPR/");
  } else if (/SamsungBrowser\//.test(ua)) {
    browser = "Samsung Internet";
    browserVersion = versionAfter(ua, "SamsungBrowser/");
  } else if (/CriOS\//.test(ua)) {
    browser = "Chrome (iOS)";
    browserVersion = versionAfter(ua, "CriOS/");
  } else if (/FxiOS\//.test(ua)) {
    browser = "Firefox (iOS)";
    browserVersion = versionAfter(ua, "FxiOS/");
  } else if (/Firefox\//.test(ua)) {
    browser = "Firefox";
    browserVersion = versionAfter(ua, "Firefox/");
  } else if (/Chrome\//.test(ua)) {
    browser = "Chrome";
    browserVersion = versionAfter(ua, "Chrome/");
  } else if (/Safari\//.test(ua)) {
    browser = "Safari";
    browserVersion = versionAfter(ua, "Version/");
  } else {
    browser = "Noma'lum";
  }

  if (/Windows NT 10/.test(ua)) {
    os = "Windows";
    osVersion = "10/11";
  } else if (/Windows NT 6\.3/.test(ua)) {
    os = "Windows";
    osVersion = "8.1";
  } else if (/Windows NT 6\.1/.test(ua)) {
    os = "Windows";
    osVersion = "7";
  } else if (/Windows/.test(ua)) {
    os = "Windows";
  } else if (/Android/.test(ua)) {
    os = "Android";
    osVersion = versionAfter(ua, "Android ");
  } else if (/iPad/.test(ua)) {
    os = "iPadOS";
    osVersion = versionAfter(ua, "OS ");
  } else if (/iPhone/.test(ua)) {
    os = "iOS";
    osVersion = versionAfter(ua, "OS ");
  } else if (/Mac OS X/.test(ua)) {
    os = "macOS";
    osVersion = versionAfter(ua, "Mac OS X ").replace(/_/g, ".");
  } else if (/CrOS/.test(ua)) {
    os = "ChromeOS";
  } else if (/Ubuntu/.test(ua)) {
    os = "Ubuntu";
  } else if (/X11|Linux/.test(ua)) {
    os = "Linux";
  } else {
    os = "Noma'lum OS";
  }

  return { browser, browserVersion, os, osVersion };
}

const MAX_TOUCH = (() => {
  try {
    return navigator.maxTouchPoints || 0;
  } catch {
    return 0;
  }
})();

function detectType({ ua }) {
  if (/iPad/.test(ua) || (/Tablet/.test(ua)) || (/Android/.test(ua) && !/Mobile/.test(ua))) {
    return "tablet";
  }
  if (/iPhone|iPod/.test(ua) || (/Android/.test(ua) && /Mobile/.test(ua))) {
    return "phone";
  }
  if (/Windows|Mac OS X|Linux|CrOS|X11/.test(ua) && MAX_TOUCH > 0) {
    return "laptop";
  }
  return "desktop";
}

function androidModel(ua) {
  const m = ua.match(/Android [\d.]+; ([^;)]+)/);
  if (!m) return "";
  const raw = m[1].trim();
  if (!raw || raw === "Build" || /\(/.test(raw)) return "";
  return raw;
}

function detectModel({ ua, type }) {
  if (/iPad/.test(ua)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) {
    const model = androidModel(ua);
    if (model) return model;
  }
  return type === "phone" || type === "tablet"
    ? DEVICE_MODEL_UNKNOWN_MOBILE
    : DEVICE_MODEL_UNKNOWN;
}

/**
 * Login vaqtida yuboriladigan qurilma metadata'si.
 *
 * @param {string} [username] - login kiritilgan username (deviceda qayd qilinadi)
 */
export function detectDevice(username = "") {
  const ua = (() => {
    try {
      return navigator.userAgent || "";
    } catch {
      return "";
    }
  })();
  const type = detectType({ ua });
  const parsed = parseUserAgent(ua);
  const name = username
    ? `${username}'s ${TYPE_LABELS[type] || "Qurilma"}`
    : "";
  return {
    device_name: name,
    device_model: detectModel({ ua, type }),
    device_type: type,
    ...parsed,
  };
}