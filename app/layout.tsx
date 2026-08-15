import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://alejandroromerog.github.io/viento-temperatura-mexico/";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Viento y temperatura sobre México",
  description:
    "Visualización interactiva de 40 días de viento y temperatura sobre México con datos horarios ERA5.",
  authors: [
    {
      name: "Alejandro Romero González",
      url: "https://github.com/AlejandroRomeroG",
    },
  ],
  keywords: [
    "México",
    "viento",
    "temperatura",
    "ERA5",
    "visualización de datos",
    "meteorología",
  ],
  alternates: { canonical: siteUrl },
  openGraph: {
    type: "website",
    locale: "es_MX",
    url: siteUrl,
    title: "Viento y temperatura sobre México",
    description:
      "40 días de atmósfera, hora por hora: orientación, velocidad y temperatura sobre México.",
    siteName: "Viento y temperatura sobre México",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#05070a" },
    { media: "(prefers-color-scheme: light)", color: "#f1f3ef" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-MX" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
