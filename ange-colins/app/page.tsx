import Link from "next/link";
import { ArrowRight, Clock, Sparkles, Heart, Leaf } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { SERVICES, STUDIO } from "@/lib/config";
import { formatPrice, formatDuration } from "@/lib/utils";

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-blush blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 size-96 rounded-full bg-sand blur-3xl" />
        <div className="container-page relative grid items-center gap-12 py-20 md:grid-cols-2 md:py-28">
          <div>
            <p className="eyebrow flex items-center gap-2">
              <Sparkles className="size-4" /> {STUDIO.tagline}
            </p>
            <h1 className="display mt-5 text-5xl md:text-6xl">
              Time to look<br />and feel your best.
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-stone">
              {STUDIO.blurb}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link href="/book" className="btn-primary">
                Book an appointment <ArrowRight className="size-4" />
              </Link>
              <Link href="#services" className="btn-ghost">
                View services
              </Link>
            </div>
          </div>
          <div className="relative">
            <div className="aspect-[4/5] overflow-hidden rounded-xl2 bg-gradient-to-br from-blush via-sand to-clay/30 shadow-xl shadow-clay/10">
              <div className="flex h-full flex-col items-center justify-center gap-4 p-10 text-center">
                <Leaf className="size-12 text-clay" />
                <p className="font-serif text-3xl text-ink">A studio that feels like a breath out.</p>
                <p className="text-sm text-stone">Unhurried appointments, by you and for you.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="border-y border-line bg-white/40">
        <div className="container-page grid gap-8 py-12 sm:grid-cols-3">
          {[
            { icon: Heart, title: "Personal & unhurried", body: "One client at a time, never rushed." },
            { icon: Sparkles, title: "Expert craft", body: "Fifteen years of colour & styling." },
            { icon: Clock, title: "Easy booking", body: "Pick a time online in under a minute." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-blush text-clay">
                <Icon className="size-5" />
              </span>
              <div>
                <p className="font-medium text-ink">{title}</p>
                <p className="text-sm text-stone">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Services */}
      <section id="services" className="container-page py-20 md:py-24">
        <div className="max-w-xl">
          <p className="eyebrow">The menu</p>
          <h2 className="display mt-3 text-4xl">Services</h2>
          <p className="mt-4 text-stone">
            Choose what suits you — each appointment includes a consultation so you
            leave with exactly what you came for.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {SERVICES.map((s) => (
            <div
              key={s.id}
              className="group flex flex-col justify-between rounded-xl2 border border-line bg-white/60 p-7 transition-shadow hover:shadow-lg hover:shadow-clay/5"
            >
              <div>
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-serif text-2xl text-ink">{s.name}</h3>
                  <span className="whitespace-nowrap font-serif text-xl text-clay">
                    {s.priceCents === 0 ? "Complimentary" : formatPrice(s.priceCents)}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-stone">{s.description}</p>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs text-stone">
                  <Clock className="size-3.5" /> {formatDuration(s.durationMinutes)}
                </span>
                <Link
                  href={`/book?service=${s.id}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-clay transition-colors hover:text-clay-dark"
                >
                  Book this <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* About */}
      <section id="about" className="border-t border-line bg-sand/50">
        <div className="container-page grid items-center gap-12 py-20 md:grid-cols-2">
          <div className="aspect-square overflow-hidden rounded-xl2 bg-gradient-to-br from-clay/20 to-blush">
            <div className="flex h-full items-center justify-center p-10 text-center">
              <p className="font-serif text-4xl text-ink/80">“Ange”</p>
            </div>
          </div>
          <div>
            <p className="eyebrow">About</p>
            <h2 className="display mt-3 text-4xl">Meet Ange</h2>
            <div className="mt-5 space-y-4 text-stone">
              <p>
                Ange Colins has spent fifteen years helping people feel like
                themselves again — one thoughtful appointment at a time. After years
                in busy city salons, she opened this studio to do things differently:
                slower, warmer, more personal.
              </p>
              <p>
                Every visit starts with a proper conversation about what you want,
                and ends with you walking out feeling brilliant. No upselling, no
                rushing, no fuss.
              </p>
            </div>
            <Link href="/book" className="btn-primary mt-8">
              Book with Ange <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container-page py-20 text-center md:py-24">
        <p className="eyebrow">Ready when you are</p>
        <h2 className="display mx-auto mt-4 max-w-2xl text-4xl md:text-5xl">
          Book your appointment in under a minute.
        </h2>
        <Link href="/book" className="btn-primary mt-9">
          Find a time <ArrowRight className="size-4" />
        </Link>
      </section>

      <SiteFooter />
    </>
  );
}
