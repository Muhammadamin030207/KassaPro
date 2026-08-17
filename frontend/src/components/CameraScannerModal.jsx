import { useEffect, useRef, useState } from "react";

import { Modal } from "./Modal";
import Icon from "./Icon";

let scanUID = 0;

/**
 * Kamera orqali shtrix kod skanerlash modali.
 * Kamera ruxsati berilishi shart (https). Kod aniqlanganda onDetected(code).
 *
 * @param {{ open: boolean, onClose: function, onDetected: function(string): void }} props
 */
export function CameraScannerModal({ open, onClose, onDetected }) {
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(false);
  const scannerRef = useRef(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const [readerId] = useState(() => `camera-reader-${++scanUID}`);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setError(null);

    // html5-qrcode faqat kamera ochilganda yuklanadi (asosiy bundle'ni yengillashtiradi)
    import("html5-qrcode")
      .then(({ Html5Qrcode }) => {
        if (cancelled) return null;
        const scanner = new Html5Qrcode(readerId);
        scannerRef.current = scanner;
        return scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 140 } },
          (decodedText) => {
            const text = decodedText.trim();
            if (!text) return;
            onDetectedRef.current?.(text);
            setFlash(true);
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
          setError("Kamera ochilmadi. Brauzer ruxsat so'raganda «Ruxsat berish»ni bosing.");
        }
      });

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        s.stop()
          .then(() => s.clear())
          .catch(() => s.clear().catch(() => {}));
      }
    };
  }, [open, readerId]);

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="flex spread" style={{ marginBottom: 14 }}>
        <h3>Kamera orqali skanerlash</h3>
        <button className="ghost-btn" onClick={onClose}>
          <Icon name="trash" /> Yopish
        </button>
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