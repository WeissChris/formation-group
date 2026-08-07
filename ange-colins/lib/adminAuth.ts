// Lightweight password gate for the /admin dashboard. This is deliberately simple
// — it protects a low-stakes appointment list, not financial data. For stronger
// auth, swap this for Supabase Auth.

import { cookies } from "next/headers";
import { createHash } from "crypto";

const COOKIE = "ange_admin";

function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || "ange-admin";
}

/** Opaque token derived from the password — changes if the password changes. */
export function adminToken(): string {
  return createHash("sha256")
    .update(`ange-colins:${adminPassword()}`)
    .digest("hex");
}

export function checkPassword(password: string): boolean {
  return password === adminPassword();
}

export function isAdminAuthed(): boolean {
  return cookies().get(COOKIE)?.value === adminToken();
}

export const ADMIN_COOKIE = COOKIE;
