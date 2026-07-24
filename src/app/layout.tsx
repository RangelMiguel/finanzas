import type { Metadata } from "next";
import { Toaster } from "sonner";
import { DM_Sans, Fraunces } from "next/font/google";
import { AppProvider } from "@/components/providers/app-provider";
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
  description: "Secure multi-user household finances",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`dark ${sans.variable} ${display.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <AppProvider>
          {children}
          <Toaster theme="dark" richColors position="top-right" closeButton />
        </AppProvider>
      </body>
    </html>
  );
}
