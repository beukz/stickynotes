import { getSession, startGoogleSignIn, signOut, getUserRole } from "../supabase/auth.js";
import { initSidebar } from "./sidebar.js";

const statusEl = document.getElementById("status");
const googleBtn = document.getElementById("google-btn");
const signoutBtn = document.getElementById("signout-btn");
const adminBtn = document.getElementById("admin-btn");
const openSupabaseBtn = document.getElementById("open-supabase-btn");

function setStatus(text, kind = "") {
  statusEl.className = `status ${kind}`.trim();
  statusEl.textContent = text;
}

async function refresh() {
  const session = await getSession();
  if (!session?.user) {
    setStatus("Not signed in.", "warn");
    adminBtn.classList.add("hidden");
    return;
  }

  const email = session.user.email || "(unknown)";
  setStatus(`Signed in as: ${email}\nUser ID: ${session.user.id}`, "ok");

  const role = await getUserRole();
  if (role === "admin") {
    adminBtn.classList.remove("hidden");
  } else {
    adminBtn.classList.add("hidden");
  }
}

adminBtn.addEventListener("click", () => {
  window.location.href = "admin.html";
});

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

document.addEventListener("DOMContentLoaded", async () => {
    await initSidebar();
    refresh().catch((e) => setStatus(`Failed to load session:\n${String(e?.message || e)}`, "warn"));
});
