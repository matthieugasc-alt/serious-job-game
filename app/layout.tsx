import "./globals.css";
import ClientDeviceGate from "./components/ClientDeviceGate";

export const metadata = {
  title: "Serious Job Game",
  description: "Simulation de gestion de crise professionnelle",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
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