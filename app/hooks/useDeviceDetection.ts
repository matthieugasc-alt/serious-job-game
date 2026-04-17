"use client";

import { useEffect, useState } from "react";

// ════════════════════════════════════════════════════════════════
// Breakpoints
// ════════════════════════════════════════════════════════════════
// Mobile  : < 768px   → BLOCKED
// Tablet  : 768–1024  → responsive, usable
// Desktop : > 1024    → full experience
// ════════════════════════════════════════════════════════════════

const MOBILE_MAX = 768;

export type DeviceType = "mobile" | "tablet" | "desktop";

interface DeviceInfo {
  /** Resolved device category */
  device: DeviceType;
  /** true when the device should be blocked from gameplay */
  isMobileBlocked: boolean;
  /** true while the hook is still resolving (avoids flash) */
  isLoading: boolean;
  /** Viewport width in px (0 during SSR) */
  width: number;
}

/**
 * Detects device type using a combination of viewport width
 * and user-agent heuristics.
 *
 * - Screen width < 768 → mobile (blocked)
 * - Mobile UA on a narrow viewport → mobile (blocked)
 * - Everything else → tablet or desktop (allowed)
 */
export function useDeviceDetection(): DeviceInfo {
  const [info, setInfo] = useState<DeviceInfo>({
    device: "desktop",
    isMobileBlocked: false,
    isLoading: true,
    width: 0,
  });

  useEffect(() => {
    function detect() {
      const w = window.innerWidth;
      const ua = navigator.userAgent.toLowerCase();

      // User-agent hints for phones (not tablets)
      const isMobileUA =
        /iphone|ipod|android.*mobile|windows phone|blackberry|opera mini|iemobile/i.test(
          ua
        );

      // Tablets typically have wider viewports — iPad, Android tablets
      // We only block narrow screens OR phone-specific UAs on small screens
      const isMobile = w < MOBILE_MAX || (isMobileUA && w < MOBILE_MAX);
      const isTablet = !isMobile && w <= 1024;

      const device: DeviceType = isMobile
        ? "mobile"
        : isTablet
          ? "tablet"
          : "desktop";

      setInfo({
        device,
        isMobileBlocked: isMobile,
        isLoading: false,
        width: w,
      });
    }

    detect();
    window.addEventListener("resize", detect);
    return () => window.removeEventListener("resize", detect);
  }, []);

  return info;
}
