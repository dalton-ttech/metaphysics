import type { Metadata } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/500.css";
import "@fontsource/noto-sans-sc/600.css";
import "./globals.css";

const huiwenMincho = localFont({
  src: "../../node_modules/@fontpkg/huiwen-mincho/Huiwen-mincho.otf",
  variable: "--font-huiwen-mincho",
  display: "swap",
  weight: "400"
});

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3000";
  const protocol = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const title = "铁板定刻｜考时定分命书";
  const description = "一珠动处分辰刻，十二卷中见旧痕。";
  return {
    metadataBase,
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "铁板定刻：考时定分，启卷论命" }]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"]
    }
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" className={huiwenMincho.variable}>
      <body>{children}</body>
    </html>
  );
}
