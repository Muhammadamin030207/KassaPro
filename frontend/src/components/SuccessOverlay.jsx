import { useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Sotuv muvaffaqiyatli yakunlangandagi ko'p qatlamli animatsiya:
 * yashil belgi (check) + konfetti + raqam count-up + havola.
 *
 * @param {{ open: boolean, total: number, onPrint: function, onClose: function, shopName?: string }} props
 */
export function SuccessOverlay({ open, total = 0, onPrint, onClose, shopName }) {
  // Tasodifiy konfetti zarralari (ochilishda bitta marta)
  const confetti = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => ({
        id: i,
        left: 8 + Math.random() * 84,
        delay: Math.random() * 0.7,
        duration: 1.6 + Math.random() * 1.2,
        rotate: Math.random() * 720 - 360,
        size: 6 + Math.random() * 8,
        color: ["#2EE59A", "#FF8A3D", "#5B8DEF", "#FFD479", "#FFFFFF"][i % 5],
      })),
    []
  );

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => onClose?.(), 4200);
    return () => clearTimeout(t);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="success-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
        >
          {confetti.map((c) => (
            <motion.span
              key={c.id}
              className="confetti"
              style={{
                left: `${c.left}%`,
                top: "-30px",
                width: c.size,
                height: c.size * 1.6,
                background: c.color,
              }}
              initial={{ y: 0, opacity: 0, rotate: 0 }}
              animate={{ y: window.innerHeight + 80, opacity: [0, 1, 1, 0.7], rotate: c.rotate }}
              transition={{ duration: c.duration, delay: c.delay, ease: "easeIn" }}
            />
          ))}

          <motion.div
            className="success-check"
            initial={{ scale: 0, rotate: -40 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 16 }}
          >
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            style={{ fontFamily: "var(--font-head)", fontSize: 30 }}
          >
            Sotuv yakunlandi!
          </motion.h2>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            style={{ fontFamily: "var(--font-mono)", fontSize: 34, fontWeight: 700, color: "var(--brand-light)", textShadow: "0 0 30px rgba(46,229,154,0.4)", marginTop: 8 }}
          >
            {total.toLocaleString("uz-UZ")} so'm
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            style={{ marginTop: 26, display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}
          >
            <button className="btn btn-primary btn-lg" onClick={onPrint}>
              🖨 Chekni chop etish
            </button>
            <button className="btn btn-ghost btn-lg" onClick={onClose}>
              Yopish
            </button>
          </motion.div>

          {shopName && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
              style={{ marginTop: 18, color: "var(--ink-faint)", fontSize: 13 }}
            >
              {shopName}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default SuccessOverlay;