// pages/auth-callback.js
import { exchangeCodeForSession } from "../supabase/auth.js";

const statusEl = document.getElementById("status");

function setStatus(text, kind = "") {
  statusEl.className = `status ${kind}`.trim();
  statusEl.textContent = text;
}

(async function run() {
  try {
    const url = new URL(window.location.href);

    // Supabase returns ?code=... for PKCE
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    const errorDesc = url.searchParams.get("error_description");

    if (error) {
      setStatus(`Sign-in failed:\n${error}\n${errorDesc || ""}`.trim(), "err");
      return;
    }

    if (!code) {
      setStatus("No OAuth code found in URL. Did you configure the redirect URL in Supabase?", "err");
      return;
    }

    setStatus("Exchanging code for session…");
    const session = await exchangeCodeForSession(code);

    const userEmail = session?.user?.email || "(unknown)";
    setStatus(`Signed in successfully as: ${userEmail}\n\nYou can close this tab.`, "ok");

    // Optional: close automatically after a short delay
    setTimeout(() => {
      try { window.close(); } catch {}
    }, 1200);
  } catch (e) {
    console.error(e);
    setStatus(`Sign-in failed:\n${String(e?.message || e)}`, "err");
  }
})();
