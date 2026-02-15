import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PostHogProvider } from "@/components/posthog-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Daily Dilemma",
  description: "Vote on today's dilemma",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
