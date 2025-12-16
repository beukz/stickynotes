// supabase/auth.js
// Supabase Auth helpers for MV3 Chrome extensions.
// Implements Google OAuth using PKCE and a redirect back to an extension page.
//
// You must add this redirect URL in Supabase Auth settings:
// chrome-extension://<EXTENSION_ID>/pages/auth-callback.html

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./client.js";

const STORAGE_KEY = "supabase_session";

function base64UrlEncode(bytes) {
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Base64Url(input) {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return base64UrlEncode(new Uint8Array(digest));
}

function randomString(length = 64) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function getRedirectUrl() {
  // Works in extension pages.
  return chrome.runtime.getURL("pages/auth-callback.html");
}

async function setLocal(obj) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(obj, () => {
      if (chrome.runtime?.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}

async function getLocal(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (data) => {
      if (chrome.runtime?.lastError) reject(chrome.runtime.lastError);
      else resolve(data || {});
    });
  });
}

async function removeLocal(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      if (chrome.runtime?.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}

export async function getSession() {
  const data = await getLocal([STORAGE_KEY]);
  return data[STORAGE_KEY] || null;
}

export async function signOut() {
  // Best-effort revoke on Supabase; still clear local session.
  const session = await getSession();
  if (session?.access_token) {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`
        }
      });
    } catch {
      // ignore
    }
  }
  await removeLocal([STORAGE_KEY, "pkce_verifier"]);
}

export async function startGoogleSignIn() {
  // Create PKCE verifier/challenge
  const verifier = randomString(64);
  const challenge = await sha256Base64Url(verifier);

  await setLocal({ pkce_verifier: verifier });

  const redirectTo = getRedirectUrl();

  // Supabase OAuth authorize endpoint
  const url = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
  url.searchParams.set("provider", "google");
  url.searchParams.set("redirect_to", redirectTo);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "s256");

  // Open in a new tab (most reliable for extensions)
  chrome.tabs.create({ url: url.toString() });
}

export async function exchangeCodeForSession(code) {
  const { pkce_verifier: verifier } = await getLocal(["pkce_verifier"]);
  if (!verifier) throw new Error("Missing PKCE verifier. Please restart sign-in.");

  const redirectTo = getRedirectUrl();

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      auth_code: code,
      code_verifier: verifier,
      redirect_to: redirectTo
    })
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${json?.error_description || json?.msg || JSON.stringify(json)}`);
  }

  // Store session locally
  await setLocal({ [STORAGE_KEY]: json, pkce_verifier: null });
  return json;
}
