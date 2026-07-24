import type { Metadata } from "next";
import { Toaster } from "sonner";
import { DM_Sans, Fraunces } from "next/font/google";
import { AppProvider } from "@/components/providers/app-provider";
import { PwaProvider } from "@/components/pwa/pwa-provider";
import "./globals.css";

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MisFinanzas Familiar",
  description: "Finanzas del hogar seguras con passkeys",
  applicationName: "MisFinanzas",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MisFinanzas",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport = {
  themeColor: "#0a0e1a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`dark ${sans.variable} ${display.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <AppProvider>
          <PwaProvider>
            {children}
            <Toaster theme="dark" richColors position="top-right" closeButton />
          </PwaProvider>
        </AppProvider>
      </body>
    </html>
  );
}
