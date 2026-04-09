import "./globals.css";

export const metadata = {
  title: "Serious Job Game",
  description: "Simulation de gestion de crise professionnelle",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}