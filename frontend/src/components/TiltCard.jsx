import { useRef, useState } from "react";

/**
 * Sichqoncha harakatiga qarab 3D tilt (perspective + rotateX/rotateY)
 * va porloq glare effekti.
 *
 * @param {{ children: React.ReactNode, className?: string, maxTilt?: number, glare?: boolean }} props
 */
export function TiltCard({ children, className = "card-3d", maxTilt = 10, glare = true }) {
  const ref = useRef(null);
  const [style, setStyle] = useState({ transform: "perspective(1000px) rotateX(0deg) rotateY(0deg)" });

  const onMouseMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setStyle({
      transform: `perspective(1000px) rotateX(${(-y * maxTilt).toFixed(2)}deg) rotateY(${(x * maxTilt).toFixed(2)}deg) translateY(-4px) scale3d(1.02, 1.02, 1.02)`,
      "--gx": `${((x + 0.5) * 100).toFixed(1)}%`,
      "--gy": `${((y + 0.5) * 100).toFixed(1)}%`,
    });
  };

  const reset = () => setStyle({ transform: "perspective(1000px) rotateX(0deg) rotateY(0deg)" });

  return (
    <div
      ref={ref}
      className={className}
      style={{ ...style, transition: "transform 0.12s ease-out" }}
      onMouseMove={onMouseMove}
      onMouseLeave={reset}
    >
      {glare && <span className="glare" />}
      {children}
    </div>
  );
}

export default TiltCard;