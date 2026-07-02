"use client";

/**
 * CountdownTimer — décompte générique. Appelle onExpire une seule fois.
 */

import { useEffect, useRef, useState } from "react";

export function CountdownTimer({
  seconds,
  running,
  onExpire,
}: {
  seconds: number;
  running: boolean;
  onExpire: () => void;
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
  return (
    <span
      className={`rounded px-2 py-1 font-mono text-sm ${
        left <= 30 ? "bg-red-100 text-red-700" : "bg-gray-100"
      }`}
    >
      {m}:{s.toString().padStart(2, "0")}
    </span>
  );
}
