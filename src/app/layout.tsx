import type { Metadata, Viewport } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { MotionPrefs } from "@/components/chat/motion-prefs";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Veil — Anonymous Chat That Vanishes",
  description:
    "Veil pairs you with strangers in rooms that keep no records. No accounts, no logs, no traces — just words that disappear. Speak freely. Leave nothing.",
  keywords: [
    "anonymous chat",
    "ephemeral messaging",
    "encrypted chat",
    "veil",
    "privacy",
    "vanishing messages",
  ],
  authors: [{ name: "Veil" }],
  icons: {
    icon: "/ghost.svg",
  },
  openGraph: {
    title: "Veil — Anonymous Chat That Vanishes",
    description:
      "No accounts. No logs. No traces. Anonymous rooms where messages burn on exit.",
    siteName: "Veil",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0E0E13",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${spaceGrotesk.variable} ${plexMono.variable} antialiased bg-ink text-cream font-display overflow-x-clip`}
      >
        <MotionPrefs>
          {children}
        </MotionPrefs>
        <Toaster />
      </body>
    </html>
  );
}
