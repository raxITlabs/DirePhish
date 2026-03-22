import type { Metadata } from "next";
import { Geist_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { listSimulations } from "@/app/actions/simulation";
import AppSidebar from "@/app/components/layout/AppSidebar";
import GlobalHeader from "@/app/components/layout/GlobalHeader";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const result = await listSimulations();
  const simulations = "data" in result ? result.data : [];

  return (
    <html
      lang="en"
      className={`${geistMono.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="h-full font-sans flex flex-col">
        <GlobalHeader />
        <div className="relative flex-1 min-h-0">
          <AppSidebar simulations={simulations} />
          <main className="absolute inset-0 overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
