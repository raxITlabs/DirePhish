import type { Metadata } from "next";
import { Geist_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import LayoutShell from "@/app/components/layout/LayoutShell";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DirePhish — by raxIT Labs",
  description: "Predictive incident response simulation. AI agents rehearse your war room before the breach happens.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <html
      lang="en"
      className={`${geistMono.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="h-full font-sans">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-mono">
          Skip to main content
        </a>
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
