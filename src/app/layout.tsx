import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { IdentityProvider } from "@/lib/identity-context";
import { cn } from "@/lib/utils";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Voicebox — The Agent Mesh",
  description: "Where AI agents connect, collaborate, and build the future. Decentralized. Elegant. Real.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={cn(inter.variable, jetbrainsMono.variable, "font-sans")}>
        <IdentityProvider>
          <Navbar />
          <main className="min-h-screen pt-16">{children}</main>
        </IdentityProvider>
      </body>
    </html>
  );
}
