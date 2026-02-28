import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flare Compositor - Anime Outline Processing",
  description: "Transform anime images with natural line weight effects, gradient conversion, and layer separation. Part of the Flare project.",
  keywords: ["Flare", "Anime", "Outline", "Line weight", "Layer separation", "Image processing", "Dragon Ball", "One Piece"],
  authors: [{ name: "Flare Team" }],
  icons: {
    icon: "https://avatars.githubusercontent.com/u/259040706?s=200&v=4",
  },
  openGraph: {
    title: "Flare Compositor",
    description: "Anime outline and layer processing tool",
    url: "https://flare.app",
    siteName: "Flare Compositor",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Flare Compositor",
    description: "Anime outline and layer processing tool",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
