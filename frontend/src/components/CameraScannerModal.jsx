import { useEffect, useRef, useState } from "react";

import { Modal } from "./Modal";
import Icon from "./Icon";
import { playBarcodeError, playBarcodeSuccess } from "../utils/sound";

let scanUID = 0;

/**
 * Sthrix-kod skaneri modali (shtrix-kod skanerlash uchun kamera).
 * Kamera ruxsati berilishi shart (https). Kod aniqlanganda onDetected(code).
 * Orqa (environment) / oldi (user) kamera o'rtasida almashish va fonar
 * (chiroq) tugmasi mavjud. Aniqlanganda qisqa tebranish beriladi.
 *
 * @param {{ open: boolean, onClose: function, onDetected: function(string): void }} props
 */
export function CameraScannerModal({ open, onClose, onDetected }) {
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [flash, setFlash] = useState(false);
  const [facing, setFacing] = useState("environment");
  const [torch, setTorch] = useState(false);
  const [continuous, setContinuous] = useState(false);
  const [lastCode, setLastCode] = useState("");
  const [zoomCaps, setZoomCaps] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [showZoomBadge, setShowZoomBadge] = useState(false);
  const pinchRef = useRef(null);
  const continuousRef = useRef(continuous);
  continuousRef.current = continuous;
  const scannerRef = useRef(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const facingRef = useRef(facing);
  facingRef.current = facing;
  const torchRef = useRef(torch);
  torchRef.current = torch;


  const readZoomCaps = (scanner) => {
    try {
      const caps = scanner.getRunningTrackCapabilities?.() || {};
      const zc = caps.zoom;
      if (zc && typeof zc.max === "number" && zc.max > 1) {
        setZoomCaps({ min: zc.min || 1, max: zc.max, step: zc.step || 1 });
      } else {
        setZoomCaps(null);
      }
    } catch {
      setZoomCaps(null);
    }
  };

  const applyZoom = async (_scanner, value) => {
    const v = Math.min(10, Math.max(1, Math.round(value * 10) / 10));
    const video = document.getElementById(readerId)?.querySelector("video");
    if (video) {
      video.style.transition = "transform 0.18s ease";
      video.style.transformOrigin = "center center";
      video.style.transform = `scale(${v})`;
    }
    setZoom(v);
    setShowZoomBadge(true);
    clearTimeout(applyZoom._t);
    applyZoom._t = setTimeout(() => setShowZoomBadge(false), 900);
  };

  const [readerId] = useState(() => `camera-reader-${++scanUID}`);
  const startScannerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setError(null);

    const startScanner = () => {
      if (cancelled) return Promise.resolve(null);
      setStarting(true);
      // html5-qrcode faqat kamera ochilganda yuklanadi (asosiy bundle'ni yengillashtiradi)
      return import("html5-qrcode")
        .then(({ Html5Qrcode, Html5QrcodeSupportedFormats }) => {
          if (cancelled) return null;
          const scanner = new Html5Qrcode(readerId, {
            experimentalFeatures: { useBarCodeDetectorIfSupported: true },
            formatsToSupport: [
              Html5QrcodeSupportedFormats.EAN_13,
              Html5QrcodeSupportedFormats.EAN_8,
              Html5QrcodeSupportedFormats.UPC_A,
              Html5QrcodeSupportedFormats.UPC_E,
              Html5QrcodeSupportedFormats.CODE_128,
              Html5QrcodeSupportedFormats.CODE_39,
              Html5QrcodeSupportedFormats.QR_CODE,
            ],
          });
          scannerRef.current = scanner;
          const vw =
            typeof window !== "undefined" ? Math.min(window.innerWidth, 720) : 420;
          const boxW = Math.round(Math.min(340, vw * 0.86));
          const onScan = (decodedText) => {
            try {
              const text = (decodedText || "").trim();
              if (!text) return;
              onDetectedRef.current?.(text);
              setLastCode(text);
              playBarcodeSuccess();
              if (!continuousRef.current) onCloseRef.current?.();
              setFlash(true);
              try {
                navigator.vibrate?.(120);
              } catch {
                /* e'tiborsiz */
              }
              setTimeout(() => setFlash(false), 350);
              const pauseMs = continuousRef.current ? 150 : 700;
              try {
                scannerRef.current?.pause(true);
                setTimeout(() => {
                  if (scannerRef.current && open) scannerRef.current?.resume();
                }, pauseMs);
              } catch {
                /* e'tiborsiz */
              }
            } catch {
              /* callback xatosi skanerni to'xtatmasin */
            }
          };
          // 1-urinish: HD + tez sozlamalar; 2-urinish: minimal (har qanday qurilma)
          return scanner
            .start(
              {
                facingMode: facingRef.current,
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
              { fps: 25, qrbox: { width: boxW, height: Math.round(boxW * 0.55) } },
              onScan,
              () => {}
            )
            .catch(() => {
              if (cancelled) return null;
              return scanner.start(
                { facingMode: facingRef.current },
                { fps: 15, qrbox: { width: 240, height: 140 } },
                onScan,
                () => {}
              );
            });
        })
        .then(() => {
          if (!cancelled) {
            setFlash(false);
            readZoomCaps(scannerRef.current);
            if (zoom !== 1) applyZoom(scannerRef.current, zoom);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            playBarcodeError();
            const msg =
              err?.name === "NotAllowedError"
                ? "Kamera ruxsati berilmadi — brauzer sozlamasidan kamera ruxsatini yoqing."
                : err?.name === "NotFoundError"
                  ? "Kamera topilmadi — qurilmada kamera mavjudligini tekshiring."
                  : `Skaner ochilmadi: ${err?.message || err || "noma'lum xato"}`;
            setError(msg);
          }
        })
        .finally(() => {
          if (!cancelled) setStarting(false);
        });
    };

    startScannerRef.current = startScanner;
    startScanner();

    return () => {
      cancelled = true;
      // Fonarni o'chirib qo'yamiz
      torchRef.current = false;
      setTorch(false);
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        try {
          Promise.resolve(s.isRunning?.() ?? true)
            .then((running) => (running ? s.stop() : null))
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
    };
  }, [open, readerId]);

  // Fonar (chiroq) — orqa kameraning torch ini yoqadi/o'chiradi
  const toggleTorch = async () => {
    const next = !torchRef.current;
    const s = scannerRef.current;
    setTorch(next);
    torchRef.current = next;
    try {
      await s?.applyVideoConstraints({ advanced: [{ torch: next }] });
    } catch {
      setError("Fonar bu qurilmada qo'llab-quvvatlanmaydi.");
    }
  };

  // Oldi / orqa kamera almashish
  const switchCamera = async () => {
    const next = facingRef.current === "environment" ? "user" : "environment";
    setFacing(next);
    facingRef.current = next;
    setError(null);

    const s = scannerRef.current;
    if (!s) return;
    try {
      const isRunning = await s.isRunning?.() ?? true;
      if (isRunning) {
        await s.stop().catch(() => {});
      }
      await s.clear().catch(() => {});
    } catch {
      /* e'tiborsiz */
    }

    scannerRef.current = null;
    import("html5-qrcode")
      .then(({ Html5Qrcode, Html5QrcodeSupportedFormats }) => {
        const scanner = new Html5Qrcode(readerId, {
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
        });
        scannerRef.current = scanner;
        const vw =
          typeof window !== "undefined" ? Math.min(window.innerWidth, 720) : 420;
        const boxW = Math.round(Math.min(340, vw * 0.86));
        const onScan2 = (decodedText) => {
          try {
            const text = (decodedText || "").trim();
            if (!text) return;
            onDetectedRef.current?.(text);
            setLastCode(text);
            playBarcodeSuccess();
            if (!continuousRef.current) onCloseRef.current?.();
            setFlash(true);
            setTimeout(() => setFlash(false), 350);
            const pauseMs = continuousRef.current ? 150 : 700;
            try {
              scannerRef.current?.pause(true);
              setTimeout(() => {
                if (scannerRef.current && open) scannerRef.current?.resume();
              }, pauseMs);
            } catch {
              /* e'tiborsiz */
            }
          } catch {
            /* e'tiborsiz */
          }
        };
        return scanner
          .start(
            {
              facingMode: next,
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            { fps: 25, qrbox: { width: boxW, height: Math.round(boxW * 0.55) } },
            onScan2,
            () => {}
          )
          .catch(() => {
            return scanner.start(
              { facingMode: next },
              { fps: 15, qrbox: { width: 240, height: 140 } },
              onScan2,
              () => {}
            );
          });
      })
      .then(() => {
        readZoomCaps(scannerRef.current);
        if (zoom !== 1) applyZoom(scannerRef.current, zoom);
      })
      .catch((err) => {
        setError(`Kamera almashmadi: ${err?.message || err || "noma'lum"}`);
      });
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
            title="Uzluksiz skanerlash — mahsulotlarni ketma-ket qo'shish"
            aria-pressed={continuous}
            style={{ color: continuous ? "var(--brand-light)" : "inherit" }}
          >
            <Icon name="refresh" size={16} /> {continuous ? "Uzluksiz: YONIQ" : "Uzluksiz"}
          </button>
          <button
            className="ghost-btn"
            onClick={toggleTorch}
            title={torch ? "Fonarni o'chirish" : "Fonarni yoqish"}
            aria-label="Fonar"
            style={{ color: torch ? "var(--warn)" : "inherit" }}
          >
            <Icon name="zap" /> Fonar
          </button>
          <button className="ghost-btn" onClick={switchCamera} title="Oldi/orqa kamera">
            <Icon name="camera" /> {facing === "environment" ? "Orqa" : "Oldi"}
          </button>
        </div>
      </div>

      <div
        className={`camera-frame ${flash ? "camera-flash" : ""}`}
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
            if (next !== zoom) applyZoom(scannerRef.current, next);
          }
        }}
        onTouchEnd={() => {
          pinchRef.current = null;
        }}
        onDoubleClick={() => applyZoom(scannerRef.current, zoom > 1 ? 1 : 3)}
      >
        <div id={readerId} className="camera-view" />
        <div className="camera-beam" />
        {showZoomBadge && <div className="zoom-badge">{zoom.toFixed(1)}x</div>}
      </div>

      {error ? (
        <div className="empty" style={{ marginTop: 12 }}>
          <div className="anti" style={{ color: "#f87171" }}>{error}</div>
          <button
            className="btn btn-primary btn-sm"
            style={{ marginTop: 10 }}
            onClick={() => {
              setError(null);
              startScannerRef.current?.();
            }}
          >
            🔄 Qayta urinish
          </button>
        </div>
      ) : starting ? (
        <div className="sub" style={{ marginTop: 12, textAlign: "center" }}>
          ⏳ Kamera ochilmoqda...
        </div>
      ) : (
        <div className="sub" style={{ marginTop: 12, textAlign: "center" }}>
          {lastCode ? (
            <>
              Oxirgi kod: <b className="mono">{lastCode}</b> — chekka qo'shildi ✓
            </>
          ) : (
            <>Shtrix kodni &laquo;ramka&raquo; ichiga qaratib turing...</>
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
