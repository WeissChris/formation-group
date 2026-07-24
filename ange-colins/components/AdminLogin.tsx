"use client";

import { useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { STUDIO } from "@/lib/config";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Incorrect password.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl2 border border-line bg-white/70 p-8 text-center"
      >
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-blush text-clay">
          <Lock className="size-5" />
        </span>
        <h1 className="display mt-5 text-2xl">{STUDIO.name}</h1>
        <p className="mt-1 text-sm text-stone">Studio login</p>
        <input
          type="password"
          autoFocus
          className="field mt-6"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary mt-5 w-full">
          {loading ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
        </button>
      </form>
    </main>
  );
}
