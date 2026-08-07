import Link from "next/link";
import { STUDIO } from "@/lib/config";
import { Instagram, Mail, MapPin, Phone } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-cream/85 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between">
        <Link href="/" className="flex flex-col leading-none">
          <span className="font-serif text-2xl font-medium tracking-tight text-ink">
            {STUDIO.name}
          </span>
          <span className="text-[0.6rem] uppercase tracking-wide2 text-stone">
            {STUDIO.tagline}
          </span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-stone md:flex">
          <Link href="/#services" className="transition-colors hover:text-ink">
            Services
          </Link>
          <Link href="/#about" className="transition-colors hover:text-ink">
            About
          </Link>
          <Link href="/#visit" className="transition-colors hover:text-ink">
            Visit
          </Link>
        </nav>
        <Link href="/book" className="btn-primary px-5 py-2">
          Book now
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer id="visit" className="border-t border-line bg-sand/60">
      <div className="container-page grid gap-10 py-14 md:grid-cols-3">
        <div>
          <p className="font-serif text-2xl text-ink">{STUDIO.name}</p>
          <p className="mt-2 max-w-xs text-sm text-stone">{STUDIO.tagline}</p>
        </div>
        <div className="space-y-3 text-sm text-stone">
          <p className="eyebrow">Visit</p>
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-clay" />
            {STUDIO.address}
          </p>
          <p className="flex items-center gap-2">
            <Phone className="size-4 shrink-0 text-clay" />
            <a href={`tel:${STUDIO.phone.replace(/\s/g, "")}`} className="hover:text-ink">
              {STUDIO.phone}
            </a>
          </p>
          <p className="flex items-center gap-2">
            <Mail className="size-4 shrink-0 text-clay" />
            <a href={`mailto:${STUDIO.email}`} className="hover:text-ink">
              {STUDIO.email}
            </a>
          </p>
          <p className="flex items-center gap-2">
            <Instagram className="size-4 shrink-0 text-clay" />
            {STUDIO.instagram}
          </p>
        </div>
        <div className="space-y-3 text-sm text-stone">
          <p className="eyebrow">Opening hours</p>
          <ul className="space-y-1">
            <li className="flex justify-between"><span>Tue – Wed</span><span>9am – 6pm</span></li>
            <li className="flex justify-between"><span>Thursday</span><span>9am – 8pm</span></li>
            <li className="flex justify-between"><span>Friday</span><span>9am – 6pm</span></li>
            <li className="flex justify-between"><span>Saturday</span><span>9am – 3pm</span></li>
            <li className="flex justify-between text-stone/60"><span>Sun – Mon</span><span>Closed</span></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line/70">
        <div className="container-page flex flex-col items-center justify-between gap-2 py-5 text-xs text-stone sm:flex-row">
          <p>© {new Date().getFullYear()} {STUDIO.name}. All rights reserved.</p>
          <Link href="/admin" className="hover:text-ink">Studio login</Link>
        </div>
      </div>
    </footer>
  );
}
