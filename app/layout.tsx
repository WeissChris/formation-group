import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import NavBar from '@/components/NavBar'
import LoginGate from '@/components/LoginGate'

const inter = Inter({ subsets: ['latin'], weight: ['300', '400', '500'] })

export const metadata: Metadata = {
  title: 'Formation Group',
  description: 'Business management — Formation Landscapes & Lume Pools',
  icons: { icon: '/formation-icon-dark.svg' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-fg-bg min-h-screen`}>
        <LoginGate>
          <NavBar />
          <main className="pt-14">
            {children}
          </main>
        </LoginGate>
      </body>
    </html>
  )
}
