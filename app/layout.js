import { Inter_Tight, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import AuthGate from "@/components/AuthGate";
import PWARegister from "@/components/PWARegister";

// TWO faces, deliberately — one family everywhere is what made small text
// read soft, because a face that looks premium in a headline looks juvenile
// in a 12px label.
//
//   Inter Tight    — all UI text: labels, table cells, buttons, body.
//                    Inter's proportions with tighter sidebearings, so a
//                    dense table of figures fits more per row without
//                    dropping the size. Neutral on purpose: at 12–15px,
//                    personality is noise.
//   Space Grotesk  — display only: page titles and big figures. Sharp
//                    terminals and a slightly technical cut — character
//                    without roundness.
//
// History: IBM Plex Sans ("institutional"), then Plus Jakarta to match a
// supplied reference, then Inter + Outfit. Outfit was the problem: a
// geometric face whose round bowls and single-storey shapes read as
// childish at display sizes on a finance screen. Replaced at the owner's
// request, Sep 2026, after offering four directions — this is the one
// they picked. Don't collapse it to one family, and don't reintroduce a
// round geometric for headings, without checking with the owner.
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
              "try{var t=localStorage.getItem('lcl-theme');var isDark=t!=='light';if(isDark)document.documentElement.classList.add('dark');var m=document.createElement('meta');m.name='theme-color';m.content=isDark?'#0a0a0a':'#f6f6f7';document.head.appendChild(m)}catch(e){document.documentElement.classList.add('dark')}",
          }}
        />
      </head>
      <body>
        <PWARegister />
        <AuthProvider>
          <AuthGate>{children}</AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
