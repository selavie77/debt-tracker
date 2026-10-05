import type { Metadata } from "next";
import { Familjen_Grotesk, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const display = Familjen_Grotesk({ subsets: ["latin"], weight: ["600", "700"], variable: "--f-display", display: "swap" });
const body = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--f-body", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--f-num", display: "swap" });

export const metadata: Metadata = {
  title: "Debt Elimination Tracker",
  description: "Track debts, settlements and payments across people and companies.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
