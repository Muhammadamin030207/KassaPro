import { useEffect, useRef, useState } from "react";

import { Modal } from "./Modal";
import Icon from "./Icon";
import { playBarcodeError, playBarcodeSuccess } from "../utils/sound";

let scanUID = 0;

const WANT_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"];

/**
 * Shtrix-kod skaneri — ikki dvigatel:
 *  1) NATIVE BarcodeDetector (Android Chrome — eng tez va eng ishonchli)
 *  2) html5-qrcode vanilla fallback (qolgan brauzerlar)
 * Kamera xom getUserMedia bilan ochiladi — kutubxona konfiguratsiya xatolari yo'q.
 */
export function CameraScannerModal({ open, onClose, onDetected }) {
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [engine, setEngine] = useState(null); // "native" | "lib" | null
  const [flash, setFlash] = useState(false);
  const [facing, setFacing] = useState("environment");
  const [torch, setTorch] = useState(false);
  const [torchOk, setTorchOk] = useState(true);
  const [continuous, setContinuous] = useState(false);
  const [lastCode, setLastCode] = useState("");
  const [zoom, setZoom] = useState(1);
  const [showZoomBadge, setShowZoomBadge] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const rafRef = useRef(null);
  const cooldownRef = useRef(0);
  const pinchRef = useRef(null);
  const libScannerRef = useRef(null);

  const continuousRef = useRef(continuous);
  continuousRef.current = continuous;
  const facingRef = useRef(facing);
  facingRef.current = facing;
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const openRef = useRef(open);
  openRef.current = open;

  const [readerId] = useState(() => `camera-reader-${++scanUID}`);
  const startRef = useRef(null);

  const applyZoom = (value) => {
    const v = Math.min(10, Math.max(1, Math.round(value * 10) / 10));
    const track = streamRef.current?.getVideoTracks?.()[0];
    const caps = track?.getCapabilities?.();
    if (caps?.zoom && v <= caps.zoom.max) {
      track
        .applyConstraints({ advanced: [{ zoom: v }] })
        .catch(() => {});
    }
    const video = videoRef.current;
    if (video) {
      video.style.transition = "transform 0.16s ease";
      video.style.transformOrigin = "center center";
      video.style.transform = `scale(${v})`;
    }
    setZoom(v);
    setShowZoomBadge(true);
    clearTimeout(applyZoom._t);
    applyZoom._t = setTimeout(() => setShowZoomBadge(false), 900);
  };

  const handleDetect = (text) => {
    try {
      text = (text || "").trim();
      if (!text) return;
      const now = Date.now();
      if (now < cooldownRef.current) return;
      cooldownRef.current = now + (continuousRef.current ? 250 : 900);
      onDetectedRef.current?.(text);
      setLastCode(text);
      playBarcodeSuccess();
      if (!continuousRef.current) onCloseRef.current?.();
      setFlash(true);
      setTimeout(() => setFlash(false), 350);
      try {
        navigator.vibrate?.(110);
      } catch {
        /* e'tiborsiz */
      }
    } catch {
      /* callback xatosi skanerni to'xtatmasin */
    }
  };

  const stopEverything = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    detectorRef.current = null;
    const s = libScannerRef.current;
    libScannerRef.current = null;
    if (s) {
      try {
        Promise.resolve(s.isRunning?.() ?? true)
          .then((r) => (r ? s.stop() : null))
          .then(() => s.clear())
          .catch(() => {
            try {
              s.clear();
            } catch {
              /* e'tiborsiz */
            }
          });
      } catch {
        /* e'tiborsiz */
      }
    }
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        /* e'tiborsiz */
      }
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setTorch(false);
  };

  const startNative = async () => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Brauzer kamerani qo'llab-quvvatlamaydi");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingRef.current },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    if (!openRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    streamRef.current = stream;
    const video = videoRef.current;
    video.srcObject = stream;
    video.setAttribute("playsinline", "true");
    await video.play().catch(() => {});

    if (!("BarcodeDetector" in window)) throw new Error("__NO_NATIVE__");
    const supported = (await window.BarcodeDetector.getSupportedFormats?.()) || [];
    const formats = WANT_FORMATS.filter((f) => supported.includes(f));
    detectorRef.current = new window.BarcodeDetector(
      formats.length ? { formats } : undefined
    );
    setEngine("native");

    let lastRun = 0;
    const loop = async (ts) => {
      if (!openRef.current || !detectorRef.current) return;
      if (ts - lastRun > 110 && Date.now() > cooldownRef.current) {
        lastRun = ts;
        try {
          const v = videoRef.current;
          if (v && v.readyState >= 2) {
            const codes = await detectorRef.current.detect(v);
            if (codes && codes.length) handleDetect(codes[0].rawValue);
          }
        } catch {
          /* kadr o'tkazib yuboriladi */
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  const startLib = async () => {
    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode(readerId);
    libScannerRef.current = scanner;
    setEngine("lib");
    await scanner.start(
      { facingMode: facingRef.current },
      { fps: 12, qrbox: { width: 240, height: 140 } },
      (decoded) => handleDetect(decoded),
      () => {}
    );
  };

  const start = async () => {
    if (!openRef.current) return;
    setError(null);
    setStarting(true);
    setEngine(null);
    stopEverything();
    try {
      await startNative();
    } catch (e) {
      if (String(e?.message || e).includes("__NO_NATIVE__")) {
        try {
          await startLib();
        } catch (e2) {
          setError(`Skaner ochilmadi: ${e2?.message || e2 || "noma'lum"}`);
          playBarcodeError();
          stopEverything();
        }
      } else {
        const name = e?.name || "";
        const msg =
          name === "NotAllowedError"
            ? "Kamera ruxsati berilmadi — brauzer sozlamalaridan kameraga ruxsat bering."
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "Kamera topilmadi yoki band — boshqa ilova kamerani ishlatyotgan bo'lishi mumkin."
              : `Kamera ochilmadi: ${e?.message || e || "noma'lum"}`;
        setError(msg);
        playBarcodeError();
        stopEverything();
      }
    } finally {
      if (openRef.current) setStarting(false);
    }
  };
  startRef.current = start;

  useEffect(() => {
    if (!open) return undefined;
    startRef.current?.();
    return () => stopEverything();
  }, [open]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    const next = !torch;
    setTorch(next);
    try {
      await track?.applyConstraints({ advanced: [{ torch: next }] });
    } catch {
      setTorch(false);
      setTorchOk(false);
      setTimeout(() => setTorchOk(true), 2500);
    }
  };

  const switchCamera = async () => {
    const next = facingRef.current === "environment" ? "user" : "environment";
    setFacing(next);
    facingRef.current = next;
    setError(null);
    setZoom(1);
    const video = videoRef.current;
    if (video) video.style.transform = "scale(1)";
    startRef.current?.();
  };

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="flex spread" style={{ marginBottom: 14 }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="scanbar" /> Shtrix-kod skaneri
        </h3>
        <div className="flex" style={{ gap: 8 }}>
          <button
            className={`ghost-btn ${continuous ? "active" : ""}`}
            onClick={() => setContinuous((v) => !v)}
            title="Uzluksiz skanerlash"
            aria-pressed={continuous}
            style={{ color: continuous ? "var(--brand-light)" : "inherit" }}
          >
            <Icon name="refresh" size={16} /> {continuous ? "Uzluksiz ✓" : "Uzluksiz"}
          </button>
          {engine === "native" && (
            <button
              className="ghost-btn"
              onClick={toggleTorch}
              title="Fonar"
              aria-label="Fonar"
              style={{
                color: torch ? "var(--warn)" : "inherit",
                opacity: torchOk ? 1 : 0.4,
              }}
            >
              <Icon name="zap" size={16} /> Fonar
            </button>
          )}
          <button className="ghost-btn" onClick={switchCamera} title="Oldi/orqa kamera">
            <Icon name="camera" size={16} /> {facing === "environment" ? "Orqa" : "Oldi"}
          </button>
        </div>
      </div>

      <div
        className={`camera-frame ${flash ? "camera-flash" : ""}`}
        style={{ touchAction: "none" }}
        onTouchStart={(e) => {
          if (e.touches.length === 2) {
            const [a, b] = e.touches;
            pinchRef.current = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 2 && pinchRef.current) {
            const [a, b] = e.touches;
            const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
            const ratio = dist / pinchRef.current;
            const next = Math.min(10, Math.max(1, Math.round(zoom * ratio * 10) / 10));
            pinchRef.current = dist;
            if (next !== zoom) applyZoom(next);
          }
        }}
        onTouchEnd={() => {
          pinchRef.current = null;
        }}
        onDoubleClick={() => applyZoom(zoom > 1 ? 1 : 3)}
      >
        <video
          ref={videoRef}
          style={{
            width: "100%",
            display: engine === "native" ? "block" : "none",
            background: "#000",
          }}
          autoPlay
          playsInline
          muted
        />
        <div
          id={readerId}
          style={{ display: engine === "lib" ? "block" : "none" }}
        />
        <div className="camera-beam" />
        {showZoomBadge && <div className="zoom-badge">{zoom.toFixed(1)}x</div>}
        {starting && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,.55)",
              color: "#fff",
              fontSize: 14,
              zIndex: 6,
            }}
          >
            ⏳ Kamera ochilmoqda...
          </div>
        )}
      </div>

      {error ? (
        <div className="empty" style={{ marginTop: 12 }}>
          <div className="anti" style={{ color: "#f87171" }}>{error}</div>
          <button
            className="btn btn-primary btn-sm"
            style={{ marginTop: 10 }}
            onClick={() => startRef.current?.()}
          >
            🔄 Qayta urinish
          </button>
        </div>
      ) : (
        <div className="sub" style={{ marginTop: 12, textAlign: "center" }}>
          {lastCode ? (
            <>
              Oxirgi kod: <b className="mono">{lastCode}</b> — chekka qo'shildi ✓
            </>
          ) : (
            <>Shtrix kodni ramka ichiga qaratib turing · pinch = zoom</>
          )}
        </div>
      )}

      <button
        className="btn btn-ghost"
        style={{ marginTop: 14, width: "100%", minHeight: 48 }}
        onClick={onClose}
      >
        <Icon name="x" /> Yopish
      </button>
    </Modal>
  );
}

export default CameraScannerModal;
