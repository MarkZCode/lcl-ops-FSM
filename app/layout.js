import { Inter_Tight, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import AuthGate from "@/components/AuthGate";
import PWARegister from "@/components/PWARegister";
import ViewportHeightFix from "@/components/ViewportHeightFix";

// SF Pro, with Inter Tight as the fallback for non-Apple platforms.
//
//   --font-sans     SF Pro Text    — body, tables, labels, buttons (<20px)
//   --font-heading  SF Pro Display — titles and big figures (>=19px)
//
// `-apple-system` resolves to the real SF Pro on macOS, iOS and Safari,
// which is every device this is actually used on. Everywhere else the
// stack falls through to Inter Tight, the closest open substitute — still
// loaded via next/font so that fallback is a real webfont rather than
// whatever the machine happens to have.
//
// History: IBM Plex Sans, then Plus Jakarta, then Inter + Outfit, then
// Inter Tight + Space Grotesk. Moved onto SF Pro in Sep 2026 when the
// owner asked for the Apple system applied in full.
const inter = Inter_Tight({ subsets: ["latin"], display: "swap", weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const plex = Inter_Tight({ subsets: ["latin"], display: "swap", weight: ["400", "500", "600", "700"], variable: "--font-inter" });
const plexHeading = Space_Grotesk({ subsets: ["latin"], display: "swap", weight: ["500", "600", "700"], variable: "--font-heading" });
const mono = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--font-mono" });

export const metadata = {
  title: "LCL Ops — Field Service Management",
  description: "Internal job, scheduling and client management for Landlord Compliance London.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LCL Ops",
  },
};

export const viewport = {
  // Matches --surface-page dynamically via script to prevent banding
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom enabled (WCAG 1.4.4). Inputs use ≥16px font on mobile so iOS
  // doesn't auto-zoom on focus — the original reason zoom was locked.
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-GB" className={`${inter.variable} ${plex.variable} ${plexHeading.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              // Dark is the product's default look, not a system-following
              // preference — the console design is built for the near-black
              // surface and reads washed out on white. Only an explicit
              // "light" choice from the toggle opts out; everyone else,
              // including OS-light users, gets dark.
              // Same reasoning as ViewportHeightFix.js: set --app-height
              // before first paint (blocking script, runs before body
              // renders) from window.innerHeight, the one number that can't
              // be wrong, instead of the shell painting one frame against a
              // vh/dvh unit that mobile Safari has repeatedly gotten wrong
              // for this app. ViewportHeightFix keeps it updated after this.
              "try{var t=localStorage.getItem('lcl-theme');var isDark=t!=='light';if(isDark)document.documentElement.classList.add('dark');var m=document.createElement('meta');m.name='theme-color';m.content=isDark?'#0a0a0a':'#f6f6f7';document.head.appendChild(m);document.documentElement.style.setProperty('--app-height',window.innerHeight+'px')}catch(e){document.documentElement.classList.add('dark')}",
          }}
        />
      </head>
      <body>
        <PWARegister />
        <ViewportHeightFix />
        <AuthProvider>
          <AuthGate>{children}</AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
