import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ARC AI DApp",
  description: "AI-powered DApp on Arc Testnet",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Script id="suppress-ext-errors" strategy="beforeInteractive">{`
          window.addEventListener('error', function(e) {
            if (e.filename && e.filename.includes('chrome-extension')) {
              e.stopImmediatePropagation();
              e.preventDefault();
              return true;
            }
          });
          window.addEventListener('unhandledrejection', function(e) {
            if (e.reason && e.reason.stack && e.reason.stack.includes('chrome-extension')) {
              e.stopImmediatePropagation();
              e.preventDefault();
            }
          });
        `}</Script>
      </body>
    </html>
  );
}
