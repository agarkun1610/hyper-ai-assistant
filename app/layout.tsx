import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hyper AI Assistant",
  description: "Your AI that gets things done.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
