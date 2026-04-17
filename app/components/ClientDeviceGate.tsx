"use client";

import dynamic from "next/dynamic";

// Dynamic import with no SSR — avoids hydration mismatch
// since device detection relies on window/navigator
const DeviceGate = dynamic(() => import("./DeviceGate"), {
  ssr: false,
  loading: () => (
    <div style={{ minHeight: "100vh", background: "#fafafa" }} />
  ),
});

interface Props {
  children: React.ReactNode;
}

/**
 * Client-only wrapper safe to use inside a server component layout.
 * Wraps the entire app with DeviceGate (mobile blocker).
 */
export default function ClientDeviceGate({ children }: Props) {
  return <DeviceGate>{children}</DeviceGate>;
}
