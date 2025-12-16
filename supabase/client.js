// supabase/client.js
// Minimal Supabase REST client for MV3 extensions.
// We use the REST endpoint directly to avoid bundlers.
//
// NOTE: For production, you should NOT hardcode secrets.
// The anon key is okay to ship, but you must enforce RLS policies.

export const SUPABASE_URL = "https://qrnnthitqgpiowixmlpd.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFybm50aGl0cWdwaW93aXhtbHBkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0NDIyMjksImV4cCI6MjA3MzAxODIyOX0.XOde44pjV-jh1ITX9KfWbnJBWg14tuMyqQSFQ4dBtXk";

function buildHeaders(extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}

/**
 * Inserts rows into a Supabase table via PostgREST.
 * @param {string} table
 * @param {any[]} rows
 */
export async function insertRows(table, rows) {
  const url = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify(rows)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase insert failed (${res.status}): ${text}`);
  }
}
