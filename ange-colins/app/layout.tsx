import type { Metadata } from "next";
import { STUDIO } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: `${STUDIO.name} — ${STUDIO.tagline}`,
  description: STUDIO.blurb,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
