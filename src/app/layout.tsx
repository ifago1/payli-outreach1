import type { Metadata } from "next";
import "./globals.css";
import { Navigation } from "@/components/Navigation";

export const metadata: Metadata = {
  title: "Payli Outreach",
  description: "KVK-gedreven outreach voor Payli webshop & POS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        <div className="min-h-screen flex flex-col">
          <Navigation />
          <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
