import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * The page itself is a client component and cannot export metadata, so the
 * product's name and description live here. This is what a browser tab, a
 * bookmark and a link shared on WhatsApp will show.
 */
export const metadata: Metadata = {
  title: "Hyper — your compliance partner",
  description:
    "Photograph a purchase bill, a sales bill or a GST notice. The figures are read for you and checked against the GST rules before they reach your books.",
  openGraph: {
    title: "Hyper — your compliance partner",
    description:
      "Photograph a bill. Hyper reads it, checks it, and keeps your stock and returns straight.",
    type: "website",
  },
};

export default function HyperLayout({ children }: { children: ReactNode }) {
  return children;
}
