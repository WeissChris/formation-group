import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import LoginGate from '@/components/LoginGate'

const inter = Inter({ subsets: ['latin'], weight: ['300', '400', '500'] })

export const metadata: Metadata = {
  title: 'Formation Group',
  description: 'Business management — Formation Landscapes & Lume Pools',
  icons: { icon: '/formation-icon-dark.svg' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      {/* spellCheck on the body cascades the browser spell checker to every input/textarea in the
          app; lang="en-AU" makes it use the Australian dictionary so "colour"/"organise" aren't
          flagged. Individual fields can still opt out with spellCheck={false}. */}
      <body className={`${inter.className} bg-fg-bg min-h-screen`} spellCheck={true}>
        <LoginGate>{children}</LoginGate>
      </body>
    </html>
  )
}
