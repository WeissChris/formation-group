import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import BookingFlow from "@/components/BookingFlow";
import { STUDIO, getService } from "@/lib/config";

export const metadata = {
  title: `Book an appointment — ${STUDIO.name}`,
};

export default function BookPage({
  searchParams,
}: {
  searchParams: { service?: string };
}) {
  const preselected = searchParams.service && getService(searchParams.service)
    ? searchParams.service
    : undefined;

  return (
    <main className="min-h-screen">
      <div className="container-page py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-stone hover:text-ink"
        >
          <ArrowLeft className="size-4" /> {STUDIO.name}
        </Link>
      </div>

      <div className="container-page pb-20">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="eyebrow">Book online</p>
          <h1 className="display mt-3 text-4xl">Reserve your time</h1>
          <p className="mt-3 text-stone">
            A few quick steps and you&apos;re in the diary.
          </p>
        </div>
        <BookingFlow initialServiceId={preselected} />
      </div>
    </main>
  );
}
