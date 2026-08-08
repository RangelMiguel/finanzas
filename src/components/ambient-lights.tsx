"use client";

import { useEffect } from "react";

/** Theme-aware aurora blobs + a desktop cursor spotlight. */
export function AmbientLights() {
  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;

    const apply = () => {
      const on = fine.matches && !motion.matches;
      root.dataset.spotlight = on ? "on" : "off";
    };
    apply();

    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (root.dataset.spotlight !== "on") return;
      const x = (e.clientX / Math.max(1, window.innerWidth)) * 100;
      const y = (e.clientY / Math.max(1, window.innerHeight)) * 100;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        root.style.setProperty("--spot-x", `${x.toFixed(2)}%`);
        root.style.setProperty("--spot-y", `${y.toFixed(2)}%`);
        raf = 0;
      });
    };

    fine.addEventListener("change", apply);
    motion.addEventListener("change", apply);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      fine.removeEventListener("change", apply);
      motion.removeEventListener("change", apply);
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="ambient-stage" aria-hidden>
      <span className="ambient-blob ambient-blob-a" />
      <span className="ambient-blob ambient-blob-b" />
      <span className="ambient-blob ambient-blob-c" />
    </div>
  );
}
