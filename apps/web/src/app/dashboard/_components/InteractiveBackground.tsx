"use client";

import { useEffect, useRef } from "react";

export function InteractiveBackground() {
  const rootRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      targetRef.current = { x, y };
    };

    const tick = () => {
      const t = targetRef.current;
      const c = currentRef.current;
      c.x += (t.x - c.x) * 0.06;
      c.y += (t.y - c.y) * 0.06;
      el.style.setProperty("--mx", c.x.toFixed(3));
      el.style.setProperty("--my", c.y.toFixed(3));
      rafRef.current = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={
        {
          ["--mx" as string]: 0,
          ["--my" as string]: 0,
        } as React.CSSProperties
      }
    >
      <div className="absolute inset-0 bg-black" />

      <div
        className="absolute h-[60vmax] w-[60vmax] rounded-full opacity-[0.28] mix-blend-screen will-change-transform"
        style={{
          top: "-15vmax",
          left: "-10vmax",
          background:
            "radial-gradient(circle at center, oklch(0.78 0.20 155) 0%, oklch(0.78 0.20 155 / 0) 60%)",
          filter: "blur(80px)",
          transform:
            "translate3d(calc(var(--mx) * 36px), calc(var(--my) * 28px), 0)",
          animation: "auroraDrift1 22s ease-in-out infinite alternate",
        }}
      />

      <div
        className="absolute h-[55vmax] w-[55vmax] rounded-full opacity-[0.22] mix-blend-screen will-change-transform"
        style={{
          top: "5vmax",
          right: "-15vmax",
          background:
            "radial-gradient(circle at center, oklch(0.70 0.22 290) 0%, oklch(0.70 0.22 290 / 0) 60%)",
          filter: "blur(90px)",
          transform:
            "translate3d(calc(var(--mx) * -42px), calc(var(--my) * -32px), 0)",
          animation: "auroraDrift2 28s ease-in-out infinite alternate",
        }}
      />

      <div
        className="absolute h-[50vmax] w-[50vmax] rounded-full opacity-[0.18] mix-blend-screen will-change-transform"
        style={{
          bottom: "-10vmax",
          left: "20vmax",
          background:
            "radial-gradient(circle at center, oklch(0.78 0.16 220) 0%, oklch(0.78 0.16 220 / 0) 60%)",
          filter: "blur(100px)",
          transform:
            "translate3d(calc(var(--mx) * 24px), calc(var(--my) * -36px), 0)",
          animation: "auroraDrift3 34s ease-in-out infinite alternate",
        }}
      />

      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at top, transparent 0%, rgba(0,0,0,0.35) 70%, rgba(0,0,0,0.6) 100%)",
        }}
      />

      <style jsx>{`
        @keyframes auroraDrift1 {
          0% {
            transform: translate3d(calc(var(--mx) * 36px), calc(var(--my) * 28px), 0) scale(1);
          }
          100% {
            transform: translate3d(calc(var(--mx) * 36px + 80px), calc(var(--my) * 28px - 60px), 0)
              scale(1.15);
          }
        }
        @keyframes auroraDrift2 {
          0% {
            transform: translate3d(calc(var(--mx) * -42px), calc(var(--my) * -32px), 0) scale(1);
          }
          100% {
            transform: translate3d(calc(var(--mx) * -42px - 100px), calc(var(--my) * -32px + 70px), 0)
              scale(0.92);
          }
        }
        @keyframes auroraDrift3 {
          0% {
            transform: translate3d(calc(var(--mx) * 24px), calc(var(--my) * -36px), 0) scale(1);
          }
          100% {
            transform: translate3d(calc(var(--mx) * 24px + 60px), calc(var(--my) * -36px + 90px), 0)
              scale(1.1);
          }
        }
      `}</style>
    </div>
  );
}
