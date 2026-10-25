import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "My Journal — A personal journal",
  description:
    "Stories from the road, notes from ordinary days, and the things worth remembering.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
