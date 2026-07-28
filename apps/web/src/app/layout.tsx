import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Navo", template: "%s · Navo" },
  description: "AI Account Intelligence and Outbound Orchestration for Industrial Exporters.",
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/brand/navo-app-icon-512.png", sizes: "512x512", type: "image/png" }],
  },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body>{children}</body></html>; }
