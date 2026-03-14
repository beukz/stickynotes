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
 * @param {string} [accessToken]
 */
export async function insertRows(table, rows, accessToken = null) {
  const url = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}`;
  const extraHeaders = { Prefer: "return=representation" };
  if (accessToken) extraHeaders.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(extraHeaders),
    body: JSON.stringify(rows)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase insert failed (${res.status}): ${text}`);
  }
  return await res.json().catch(() => null);
}

/**
 * Selects rows from a Supabase table.
 * @param {string} table
 * @param {string} query - e.g. "user_id=eq.xxx"
 * @param {string} [accessToken]
 */
export async function selectRows(table, query = "", accessToken = null) {
  let url = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}`;
  if (query) url += `?${query}`;

  const extraHeaders = {};
  if (accessToken) extraHeaders.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(url, {
    method: "GET",
    headers: buildHeaders(extraHeaders)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase select failed (${res.status}): ${text}`);
  }
  return await res.json();
}

/**
 * Updates rows in a Supabase table.
 * @param {string} table
 * @param {string} query - e.g. "id=eq.xxx"
 * @param {any} updates
 * @param {string} [accessToken]
 */
export async function updateRows(table, query, updates, accessToken = null) {
  const url = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}?${query}`;
  const extraHeaders = { Prefer: "return=minimal" };
  if (accessToken) extraHeaders.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: buildHeaders(extraHeaders),
    body: JSON.stringify(updates)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase update failed (${res.status}): ${text}`);
  }
}

/**
 * Deletes rows from a Supabase table.
 * @param {string} table
 * @param {string} query - e.g. "id=eq.xxx"
 * @param {string} [accessToken]
 */
export async function deleteRows(table, query, accessToken = null) {
  const url = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}?${query}`;
  const extraHeaders = {};
  if (accessToken) extraHeaders.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: buildHeaders(extraHeaders)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase delete failed (${res.status}): ${text}`);
  }
}
