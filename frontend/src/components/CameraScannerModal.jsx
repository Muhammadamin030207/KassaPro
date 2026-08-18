import { useEffect, useRef, useState } from "react";

import { Modal } from "./Modal";
import Icon from "./Icon";

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
  const scannerRef = useRef(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const facingRef = useRef(facing);
  facingRef.current = facing;
  const torchRef = useRef(torch);
  torchRef.current = torch;

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
          const scanner = new Html5Qrcode(readerId);
          scannerRef.current = scanner;
          return scanner.start(
            { facingMode: facingRef.current },
            { fps: 10, qrbox: { width: 260, height: 140 } },
            (decodedText) => {
              const text = decodedText.trim();
              if (!text) return;
              onDetectedRef.current?.(text);
              setFlash(true);
              try {
                navigator.vibrate?.(120);
              } catch {
                /* e'tiborsiz */
              }
              setTimeout(() => setFlash(false), 350);
              // Duplikat urilmasligi uchun qisqa pauza
              try {
                scannerRef.current?.pause(true);
                setTimeout(() => {
                  if (scannerRef.current && open) scannerRef.current?.resume();
                }, 1300);
              } catch {
                /* e'tiborsiz */
              }
            },
            () => {}
          );
        })
        .then(() => {
          if (!cancelled) setFlash(false);
        })
        .catch(() => {
          if (!cancelled) {
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
        const scanner = new Html5Qrcode(readerId);
        scannerRef.current = scanner;
        return scanner.start(
          { facingMode: next },
          { fps: 10, qrbox: { width: 260, height: 140 } },
          (decodedText) => {
            const text = decodedText.trim();
            if (!text) return;
            onDetectedRef.current?.(text);
            setFlash(true);
            setTimeout(() => setFlash(false), 350);
            try {
              scannerRef.current?.pause(true);
              setTimeout(() => {
                if (scannerRef.current && open) scannerRef.current?.resume();
              }, 1300);
            } catch {
              /* e'tiborsiz */
            }
          },
          () => {}
        );
      })
      .catch(() => {
        setError("Skaner almashmadi, lekin yangi kamera ochilmadi.");
      });
  };

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="flex spread" style={{ marginBottom: 14 }}>
        <h3>Shtrix-kod skaneri</h3>
        <div className="flex" style={{ gap: 8 }}>
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
          <button className="ghost-btn" onClick={onClose}>
            <Icon name="trash" /> Yopish
          </button>
        </div>
      </div>

      <div className={`camera-frame ${flash ? "camera-flash" : ""}`}>
        <div id={readerId} className="camera-view" />
        <div className="camera-beam" />
      </div>

      {error ? (
        <div className="empty" style={{ marginTop: 12 }}>
          <div className="anti">{error}</div>
        </div>
      ) : (
        <div className="sub" style={{ marginTop: 12, textAlign: "center" }}>
          Shtrix kodni &laquo;ramka&raquo; ichiga qaratib turing...
        </div>
      )}

      <div className="grid-2" style={{ marginTop: 14 }}>
        <button className="btn btn-primary" onClick={onClose}>
          Tayyor
        </button>
      </div>
    </Modal>
  );
}

export default CameraScannerModal;
