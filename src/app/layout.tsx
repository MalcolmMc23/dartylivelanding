import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const bodyClassName = `${geistSans.variable} ${geistMono.variable} antialiased`;

export const metadata: Metadata = {
  title: "DormParty.live",
  description: "DormParty - Call with College Students",
  icons: {
    icon: "/images/DormParty_cup.png",
    apple: "/images/DormParty_cup.png",
    shortcut: "/images/DormParty_cup.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={bodyClassName} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
