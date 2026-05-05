import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agendario",
  description: "Workspace médico + financeiro",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Mona+Sans:ital,wght@0,200..900;1,200..900&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="min-h-dvh bg-zinc-950 text-zinc-100 antialiased"
        style={{
          fontFamily:
            "'Mona Sans', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          fontFeatureSettings: '"ss02", "cv09"',
          fontOpticalSizing: "auto",
        }}
      >
        {children}
      </body>
    </html>
  );
}
