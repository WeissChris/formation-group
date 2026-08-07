import { isAdminAuthed } from "@/lib/adminAuth";
import { listBookings } from "@/lib/bookingStore";
import { isSupabaseConfigured } from "@/lib/supabase";
import AdminLogin from "@/components/AdminLogin";
import AdminDashboard from "@/components/AdminDashboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Studio bookings — Ange Colins",
};

export default async function AdminPage() {
  if (!isAdminAuthed()) {
    return <AdminLogin />;
  }

  const bookings = await listBookings();
  return (
    <AdminDashboard
      initialBookings={bookings}
      supabaseConfigured={isSupabaseConfigured()}
    />
  );
}
