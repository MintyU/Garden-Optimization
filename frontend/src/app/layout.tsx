import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MapleStory Garden Optimizer",
  description: "Jin's Mysterious Garden Optimization Tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
