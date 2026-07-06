import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AniTorrent — Raw Anime Downloader",
  description:
    "Web-based torrent client built specifically for downloading raw anime. Upload .torrent files or paste magnet links to start downloading directly on your Mac.",
  keywords: ["anime", "torrent", "raw anime", "downloader", "webtorrent"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#08080f" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
