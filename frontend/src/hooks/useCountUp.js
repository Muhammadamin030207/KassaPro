import { useEffect, useRef, useState } from "react";

/**
 * Raqamni silliq count-up animatsiya bilan yangilaydi.
 * `react-spring` o'rniga qo'lda requestAnimationFrame.
 *
 * @param {number} value - yangi qiymat
 * @param {object} [opts]
 * @param {number} [opts.duration=500] - animatsiya davomiyligi (ms)
 * @returns {number} hozirgi ko'rsatilayotgan qiymat
 */
export function useCountUp(value, opts = {}) {
  const { duration = 500 } = opts;
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const startRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    fromRef.current = display;
    startRef.current = null;

    const step = (ts) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(fromRef.current + (value - fromRef.current) * eased);
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return display;
}

export default useCountUp;