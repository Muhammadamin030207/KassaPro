import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Modal oyna. Esc bilan yopiladi.
 *
 * @param {{ open: boolean, onClose: function, children: React.ReactNode, size?: string }} props
 */
export function Modal({ open, onClose, children, size }) {
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className={`modal ${size === "lg" ? "modal-lg" : ""}`}
            initial={{ y: 24, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, scale: 0.97, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default Modal;