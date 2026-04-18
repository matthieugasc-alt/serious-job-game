import "./globals.css";
import ClientDeviceGate from "./components/ClientDeviceGate";
import type { Viewport } from "next";

export const metadata = {
  title: "Serious Job Game",
  description: "Simulation de gestion de crise professionnelle",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>
        <ClientDeviceGate>{children}</ClientDeviceGate>
      </body>
    </html>
  );
}