// The client's link: their own title and preview text (what WhatsApp shows
// when the link is sent), not the office app's "LCL Ops" name. Not indexed.
export const metadata = {
  title: "Your booking — Landlord Compliance London",
  description: "Your quote and appointment with Landlord Compliance London.",
  robots: { index: false, follow: false },
  openGraph: { title: "Your booking — Landlord Compliance London", description: "Your quote and appointment with Landlord Compliance London.", siteName: "Landlord Compliance London" },
  appleWebApp: { capable: false, title: "Landlord Compliance London" },
};

export default function ShareLayout({ children }) {
  return children;
}
