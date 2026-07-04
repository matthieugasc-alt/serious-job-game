"use client";

/**
 * CountdownTimer — décompte générique. Appelle onExpire une seule fois.
 */

import { useEffect, useRef, useState } from "react";

export function CountdownTimer({
  seconds,
  running,
  onExpire,
  size = "sm",
}: {
  seconds: number;
  running: boolean;
  onExpire: () => void;
  /** "lg" : gros timer central (presentation). */
  size?: "sm" | "lg";
}) {
  const [left, setLeft] = useState(seconds);
  const expired = useRef(false);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          clearInterval(id);
          if (!expired.current) {
            expired.current = true;
            onExpire();
          }
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, onExpire]);

  const m = Math.floor(left / 60);
  const s = left % 60;
  const urgent = left <= 30;
  if (size === "lg") {
    return (
      <span
        className={`inline-flex items-center gap-2 rounded-2xl border px-6 py-3 font-mono text-3xl font-semibold tabular-nums shadow-sm ${
          urgent
            ? "animate-pulse border-red-200 bg-red-50 text-red-700"
            : "border-gray-200 bg-white text-gray-900"
        }`}
      >
        <span aria-hidden className="text-xl">
          ⏱
        </span>
        {m}:{s.toString().padStart(2, "0")}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-lg px-2.5 py-1 font-mono text-sm font-medium tabular-nums ${
        urgent ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"
      }`}
    >
      {m}:{s.toString().padStart(2, "0")}
    </span>
  );
}
