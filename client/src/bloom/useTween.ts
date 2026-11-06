import { useEffect, useRef, useState } from "react";

/** Smoothly animates a number towards `target` (ease-out). Jumps instantly with prefers-reduced-motion. */
export function useTween(target: number, ms = 2000) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  const cur = useRef(target);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || Math.abs(target - cur.current) < 1e-4) {
      cur.current = target;
      setValue(target);
      return;
    }
    from.current = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      cur.current = from.current + (target - from.current) * e;
      setValue(cur.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}
