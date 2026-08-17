import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/**
 * Butun ilova orqasida aylanib turadigan 3D sahna:
 * parallax grid + glow orblar + suzuvchi 3D karta (barcode).
 * Sokin (statsionar) animatsiya, hech qanday resurs talab qilmaydi.
 *
 * @param {{ cards?: boolean }} props
 */
export function Scene3D({ cards = true }) {
  const [moved, setMoved] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let raf;
    const onMove = (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setMoved({
          x: (e.clientX / window.innerWidth - 0.5) * 14,
          y: (e.clientY / window.innerHeight - 0.5) * 14,
        });
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="scene-3d" style={{ transform: `translate3d(${moved.x}px, ${moved.y}px, 0)` }}
      aria-hidden>
      <div className="scene-grid" />
      <motion.div
        className="scene-orb orb-1"
        animate={{ y: [0, -40, 0], x: [0, 30, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="scene-orb orb-2"
        animate={{ y: [0, 40, 0], x: [0, -26, 0] }}
        transition={{ duration: 19, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="scene-orb orb-3"
        animate={{ y: [0, -26, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      {cards && (
        <>
          <motion.div
            className="scene-card sc-new"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: [0, 1, 1], scale: [0.7, 1, 1] }}
            transition={{ duration: 1.4, ease: "easeOut", delay: 0.3 }}
          >
            <div className="sc-name-holder">CHƎK · SOTUV</div>
            <div className="sc-bars" />
            <div className="sc-line" style={{ top: 200 }} />
            <div className="sc-amount">24 000 so'm</div>
          </motion.div>

          <motion.div
            className="scene-card sc-pos"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: [0, 1, 1], scale: [0.7, 1, 1] }}
            transition={{ duration: 1.4, ease: "easeOut", delay: 0.7 }}
          >
            <div className="sc-chip" />
            <div className="sc-bars" style={{ top: 110 }} />
            <div className="sc-line" style={{ top: 210 }} />
            <div className="sc-amount" style={{ color: "#ffd479" }}>*SKANER*</div>
          </motion.div>
        </>
      )}
    </div>
  );
}

export default Scene3D;