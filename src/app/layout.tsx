import type { Metadata, Viewport } from "next";
import { themeBootstrap } from "@/lib/theme";
import { brand } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: `${brand.name} ERP`,
  description: `Sistema de gestão integrado ${brand.name}`,
  icons: {
    icon: brand.logo,
    shortcut: brand.logo,
    apple: brand.logo,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
