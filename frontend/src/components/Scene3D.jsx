import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/**
 * Butun ilova orqasida aylanib turadigan 3D sahna:
 * parallax grid + glow orblar. Sokin (statsionar) animatsiya,
 * hech qanday resurs talab qilmaydi.
 */
export function Scene3D() {
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
    </div>
  );
}

export default Scene3D;