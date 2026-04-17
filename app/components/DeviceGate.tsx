"use client";

import { useDeviceDetection } from "@/app/hooks/useDeviceDetection";
import MobileBlockedScreen from "./MobileBlockedScreen";

interface DeviceGateProps {
  children: React.ReactNode;
}

/**
 * Wraps page content and blocks rendering on mobile devices.
 *
 * Usage:
 *   <DeviceGate>
 *     <YourPageContent />
 *   </DeviceGate>
 *
 * - Mobile  → shows MobileBlockedScreen (no access to children)
 * - Tablet  → renders children normally
 * - Desktop → renders children normally
 * - Loading → shows nothing (avoids flash of blocked screen on desktop)
 */
export default function DeviceGate({ children }: DeviceGateProps) {
  const { isMobileBlocked, isLoading } = useDeviceDetection();

  // During SSR/initial load, render nothing to avoid flash
  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#fafafa",
        }}
      />
    );
  }

  if (isMobileBlocked) {
    return <MobileBlockedScreen />;
  }

  return <>{children}</>;
}
