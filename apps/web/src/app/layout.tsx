import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: { default: "Navo", template: "%s · Navo" }, description: "AI Account Intelligence and Outbound Orchestration for Industrial Exporters." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body>{children}</body></html>; }
