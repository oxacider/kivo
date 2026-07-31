import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { FirebaseProvider } from "@/components/firebase-provider";
import { ErrorBoundary } from "@/components/error-boundary";
import { SafeAreaBootstrapper } from "@/components/capacitor/safe-area-bootstrapper";
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
  title: "KIVO — Premium Messaging",
  description: "A premium, modern, privacy-focused messaging platform. Beautiful, fast, secure.",
  keywords: ["KIVO", "messaging", "chat", "secure", "premium", "privacy"],
  authors: [{ name: "KIVO Team" }],
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f3ff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1625" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Android-specific: prevent text selection on long-press, disable callouts */}
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
        >
          <ErrorBoundary>
            <SafeAreaBootstrapper />
            <FirebaseProvider>
              {children}
              <Toaster
                position="top-center"
                toastOptions={{
                  className: "bg-surface-2 text-foreground border-border",
                }}
              />
            </FirebaseProvider>
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
