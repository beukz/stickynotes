// pages/account.js
import { getSession, startGoogleSignIn, signOut } from "../supabase/auth.js";

const statusEl = document.getElementById("status");
const googleBtn = document.getElementById("google-btn");
const signoutBtn = document.getElementById("signout-btn");
const openSupabaseBtn = document.getElementById("open-supabase-btn");

function setStatus(text, kind = "") {
  statusEl.className = `status ${kind}`.trim();
  statusEl.textContent = text;
}

async function refresh() {
  const session = await getSession();
  if (!session?.user) {
    setStatus("Not signed in.", "warn");
    return;
  }

  const email = session.user.email || "(unknown)";
  setStatus(`Signed in as: ${email}\nUser ID: ${session.user.id}`, "ok");
}

googleBtn.addEventListener("click", async () => {
  setStatus("Opening Google sign-in…");
  await startGoogleSignIn();
});

signoutBtn.addEventListener("click", async () => {
  await signOut();
  await refresh();
});

openSupabaseBtn.addEventListener("click", () => {
  window.open("https://supabase.com/dashboard/project/qrnnthitqgpiowixmlpd", "_blank");
});

refresh().catch((e) => setStatus(`Failed to load session:\n${String(e?.message || e)}`, "warn"));
