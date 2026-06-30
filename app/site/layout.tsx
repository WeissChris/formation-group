// The /site supervisor cockpit shell. Public route (skips the admin gate via LoginGate's PUBLIC_PATHS),
// so it renders full-bleed with no office NavBar. White, phone-first canvas.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white text-fg-heading">{children}</div>
}
