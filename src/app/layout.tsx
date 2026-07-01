import type { Metadata } from "next";
import { Comfortaa, Inter } from "next/font/google";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Toaster } from "sonner";
import "./globals.css";

// Comfortaa is the primary brand typeface across the whole app.
const comfortaa = Comfortaa({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});
// Inter kept as a legible fallback for dense numeric/tabular content.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Flowora — AI Sales & Outreach Platform",
  description: "Professional AI CRM for WhatsApp and Voice campaign management.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${comfortaa.variable} ${inter.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {children}
          <Toaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
