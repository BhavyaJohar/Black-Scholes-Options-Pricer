import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Options Risk Lab | Pricing, Volatility Surfaces & Portfolio Risk",
  description:
    "A quantitative research terminal built by Bhavya Johar: Black-Scholes and CRR pricing, delayed option-chain diagnostics, implied-volatility smiles, and portfolio risk analytics.",
  keywords: [
    "options pricing",
    "Black-Scholes calculator",
    "binomial tree model",
    "option payoff diagram",
    "Greeks",
    "financial modeling",
    "portfolio analysis",
    "alpha beta analysis",
    "sharpe ratio calculator",
    "monte carlo simulation",
    "portfolio metrics",
    "Bhavya Johar",
    "options strategies",
    "implied volatility surface",
    "Market Data API"
  ],
  authors: [{ name: "Bhavya Johar", url: "https://bhavyarjohar.com" }],
  creator: "Bhavya Johar",
  openGraph: {
    title: "Options Risk Lab | Pricing, Volatility Surfaces & Portfolio Risk",
    description:
      "Quantitative options and portfolio research with delayed market-chain diagnostics, independent IV inversion, Black-Scholes, CRR, and risk analytics.",
    url: "https://bhavyas-options-pricing.vercel.app/",
    siteName: "Options & Portfolio Analysis",
    type: "website"
  },
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
