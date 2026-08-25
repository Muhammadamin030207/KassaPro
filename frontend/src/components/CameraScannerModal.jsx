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
  const [flash, setFlash] = useState(false);
  const [facing, setFacing] = useState("environment");
  const [torch, setTorch] = useState(false);
  const [continuous, setContinuous] = useState(false);
  const [lastCode, setLastCode] = useState("");
  const [zoomCaps, setZoomCaps] = useState(null);
  const [zoom, setZoom] = useState(1);
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

  const applyZoom = async (scanner, value) => {
    if (zoomCaps) {
      try {
        await scanner?.applyVideoConstraints({ advanced: [{ zoom: value }] });
      } catch {
        /* hardware zoom yo'q — CSS digital zoom ishlaydi */
      }
    }
    const video = document.getElementById(readerId)?.querySelector("video");
    if (video) {
      video.style.transition = "transform 0.18s ease";
      video.style.transformOrigin = "center center";
      video.style.transform = `scale(${value})`;
    }
    setZoom(value);
  };

  const [readerId] = useState(() => `camera-reader-${++scanUID}`);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setError(null);

    const startScanner = () => {
      if (cancelled) return Promise.resolve(null);
      // html5-qrcode faqat kamera ochilganda yuklanadi (asosiy bundle'ni yengillashtiradi)
      return import("html5-qrcode")
        .then(({ Html5Qrcode }) => {
          if (cancelled) return null;
          const scanner = new Html5Qrcode(readerId, {
            experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          });
          scannerRef.current = scanner;
          const vw =
            typeof window !== "undefined" ? Math.min(window.innerWidth, 720) : 420;
          const boxW = Math.round(Math.min(300, vw * 0.78));
          return scanner.start(
            { facingMode: facingRef.current },
            { fps: 15, qrbox: { width: boxW, height: Math.round(boxW * 0.5) } },
            (decodedText) => {
              const text = decodedText.trim();
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
              // Duplikat urilmasligi uchun qisqa pauza.
              // Uzluksiz rejimda pauza qisqa — tezkor ketma-ket skanerlash.
              const pauseMs = continuousRef.current ? 550 : 1300;
              try {
                scannerRef.current?.pause(true);
                setTimeout(() => {
                  if (scannerRef.current && open) scannerRef.current?.resume();
                }, pauseMs);
              } catch {
                /* e'tiborsiz */
              }
            },
            () => {}
          );
        })
        .then(() => {
          if (!cancelled) {
            setFlash(false);
            readZoomCaps(scannerRef.current);
            if (zoom !== 1) applyZoom(scannerRef.current, zoom);
          }
        })
        .catch(() => {
          if (!cancelled) {
            playBarcodeError();
            setError("Skaner ochilmadi. Brauzer ruxsat so'raganda «Ruxsat berish»ni bosing.");
          }
        });
    };

    startScanner();

    return () => {
      cancelled = true;
      // Fonarni o'chirib qo'yamiz
      torchRef.current = false;
      setTorch(false);
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        s.stop()
          .then(() => s.clear())
          .catch(() => s.clear().catch(() => {}));
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
      .then(({ Html5Qrcode }) => {
        const scanner = new Html5Qrcode(readerId, {
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        });
        scannerRef.current = scanner;
        const vw =
          typeof window !== "undefined" ? Math.min(window.innerWidth, 720) : 420;
        const boxW = Math.round(Math.min(300, vw * 0.78));
        return scanner.start(
          { facingMode: next },
          { fps: 15, qrbox: { width: boxW, height: Math.round(boxW * 0.5) } },
          (decodedText) => {
            const text = decodedText.trim();
            if (!text) return;
            onDetectedRef.current?.(text);
            setLastCode(text);
            playBarcodeSuccess();
            if (!continuousRef.current) onCloseRef.current?.();
            setFlash(true);
            setTimeout(() => setFlash(false), 350);
            const pauseMs = continuousRef.current ? 550 : 1300;
            try {
              scannerRef.current?.pause(true);
              setTimeout(() => {
                if (scannerRef.current && open) scannerRef.current?.resume();
              }, pauseMs);
            } catch {
              /* e'tiborsiz */
            }
          },
          () => {}
        );
      })
      .then(() => {
        readZoomCaps(scannerRef.current);
        if (zoom !== 1) applyZoom(scannerRef.current, zoom);
      })
      .catch(() => {
        setError("Skaner almashmadi, lekin yangi kamera ochilmadi.");
      });
  };

  const zoomLevels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

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
            <Icon name="zap" /> {continuous ? "Uzluksiz: YONIQ" : "Uzluksiz"}
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
            <Icon name="refresh" /> {facing === "environment" ? "Orqa" : "Oldi"}
          </button>
        </div>
      </div>

      <div className={`camera-frame ${flash ? "camera-flash" : ""}`}>
        <div id={readerId} className="camera-view" />
        <div className="camera-beam" />
      </div>

      {zoomLevels.length > 1 && (
        <div className="zoom-row" role="group" aria-label="Kamera zoom">
          {zoomLevels.map((l) => (
            <button
              key={l}
              type="button"
              className={`zoom-chip ${zoom === l ? "on" : ""}`}
              onClick={() => applyZoom(scannerRef.current, l)}
            >
              {l}x
            </button>
          ))}
        </div>
      )}

      {error ? (
        <div className="empty" style={{ marginTop: 12 }}>
          <div className="anti">{error}</div>
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
