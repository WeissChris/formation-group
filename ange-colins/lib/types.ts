export type BookingStatus = "confirmed" | "cancelled";

export interface Service {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
}

export interface Booking {
  id: string;
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  priceCents: number;
  bookingDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm (24h)
  endTime: string; // HH:mm (24h)
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes: string;
  status: BookingStatus;
  createdAt: string; // ISO
}

export interface NewBookingInput {
  serviceId: string;
  bookingDate: string;
  startTime: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes?: string;
}
