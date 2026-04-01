'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/lib/auth'
import { cn } from '@/lib/utils'

type NavItem = { label: string; href: string; external?: boolean }

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',   href: '/' },
  { label: 'Proposals',   href: '/design' },
  { label: 'Estimates',   href: '/estimates' },
  { label: 'Projects',    href: '/projects' },
  { label: 'Financials',  href: '/revenue' },
  { label: 'Programme',   href: '/programme' },
  { label: 'Settings',    href: '/settings' },
  { label: 'Lume Pools', href: 'https://lume-quoting.vercel.app', external: true },
]

export default function NavBar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleSignOut = () => {
    signOut()
    window.location.href = '/'
  }

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-fg-darker">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
        <div className="flex items-center justify-between h-14">

          {/* Logo — primary white SVG (F mark + Formation wordmark) */}
          <Link href="/" className="flex items-center shrink-0">
            <img src="/formation-primary-white.svg" alt="Formation" className="h-7 w-auto" />
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-0">
            {NAV_ITEMS.map(item => (
              item.external ? (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-1.5 text-xs font-light tracking-wide uppercase transition-colors text-white/40 hover:text-white/70"
                >
                  {item.label} ↗
                </a>
              ) : (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'px-4 py-1.5 text-xs font-light tracking-wide uppercase transition-colors',
                  isActive(item.href)
                    ? 'text-white'
                    : 'text-white/40 hover:text-white/70'
                )}
              >
                {item.label}
              </Link>
              )
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleSignOut}
              className="hidden md:block text-white/30 hover:text-white/60 text-xs font-light tracking-wide uppercase transition-colors"
            >
              Sign out
            </button>

            {/* Mobile hamburger */}
            <button
              className="md:hidden text-white/50 hover:text-white transition-colors p-1"
              onClick={() => setMobileOpen(o => !o)}
              aria-label="Toggle menu"
            >
              <div className="w-5 flex flex-col gap-1.5">
                <span className={cn('block h-px bg-current transition-all origin-center', mobileOpen ? 'rotate-45 translate-y-[7px]' : '')} />
                <span className={cn('block h-px bg-current transition-all', mobileOpen ? 'opacity-0' : '')} />
                <span className={cn('block h-px bg-current transition-all origin-center', mobileOpen ? '-rotate-45 -translate-y-[7px]' : '')} />
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-fg-darker border-t border-white/5 px-6 py-5 space-y-1">
          {NAV_ITEMS.map(item => (
            item.external ? (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileOpen(false)}
                className="block py-2.5 text-xs font-light tracking-wide uppercase transition-colors text-white/40"
              >
                {item.label} ↗
              </a>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'block py-2.5 text-xs font-light tracking-wide uppercase transition-colors',
                  isActive(item.href) ? 'text-white' : 'text-white/40'
                )}
              >
                {item.label}
              </Link>
            )
          ))}
          <div className="pt-4 border-t border-white/5">
            <button
              onClick={handleSignOut}
              className="text-xs font-light tracking-wide uppercase text-white/30"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
