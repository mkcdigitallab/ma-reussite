import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const KEY = "evolia-v1";
const $ = (selector) => document.querySelector(selector);
let supabase;
let currentUser;
let profile;

function showAuth(message = "") {
  let screen = $("#evolia-auth");
  if (!screen) {
    screen = document.createElement("section");
    screen.id = "evolia-auth";
    screen.className = "auth-screen";
    screen.innerHTML = `
      <div class="auth-card">
        <div class="auth-brand"><span class="brand-mark">É.</span><span><strong>Évolia</strong><small>Chaque jour, un pas de plus.</small></span></div>
        <p class="eyebrow">TON ESPACE PERSONNEL</p>
        <h1>Content de te retrouver.</h1>
        <p class="muted">Connecte-toi pour retrouver tes bilans et partager tes progrès avec ton accompagnateur.</p>
        <form id="evolia-login">
          <label for="login-email">Adresse e-mail</label><input id="login-email" type="email" autocomplete="username" required>
          <label for="login-password">Mot de passe</label><input id="login-password" type="password" autocomplete="current-password" required>
          <button class="button button-primary full-button" type="submit">Se connecter <span>→</span></button>
        </form>
        <p id="auth-message" class="auth-message" role="status"></p>
        <p class="privacy-note">Les comptes sont créés par l'accompagnateur. Il n'y a pas d'inscription publique.</p>
      </div>`;
    document.body.append(screen);
    $("#evolia-login").addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.submitter;
      if (!supabase) return;
      button.disabled = true;
      $("#auth-message").textContent = "Connexion en cours…";
      const { error } = await supabase.auth.signInWithPassword({
        email: $("#login-email").value.trim(),
        password: $("#login-password").value
      });
      button.disabled = false;
      if (error) $("#auth-message").textContent = "Connexion impossible. Vérifie tes identifiants.";
      else await startSession();
    });
  }
  screen.hidden = false;
  $("#auth-message").textContent = message;
  const loginButton = $("#evolia-login button");
  if (loginButton) loginButton.disabled = !supabase;
  $(".app-shell")?.setAttribute("hidden", "");
}

function showApp() {
  $("#evolia-auth")?.setAttribute("hidden", "");
  $(".app-shell")?.removeAttribute("hidden");
}

async function startSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return showAuth();
  currentUser = session.user;
  const { data, error } = await supabase.from("profiles")
    .select("id, role, display_name, tutor_id")
    .eq("id", currentUser.id).single();
  if (error || !data) return showAuth("Ton espace n'est pas encore configuré. Contacte ton accompagnateur.");
  profile = data;
  if (profile.role === "tutor") {
    if (!location.pathname.endsWith("/tutor.html")) location.replace("/tutor.html");
    else await loadTutorDashboard();
    return;
  }
  if (location.pathname.endsWith("/tutor.html")) {
    location.replace("/index.html");
    return;
  }
  showApp();
  await loadStudentData();
  const ready = sessionStorage.getItem("evolia-cloud-loaded");
  if (!ready) {
    sessionStorage.setItem("evolia-cloud-loaded", "1");
    location.reload();
  } else sessionStorage.removeItem("evolia-cloud-loaded");
  addSignOutButton();
}

async function loadStudentData() {
  const [{ data: logs }, { data: requests }] = await Promise.all([
    supabase.from("daily_logs").select("*").eq("student_id", currentUser.id).order("day", { ascending: false }).limit(60),
    supabase.from("help_requests").select("*").eq("student_id", currentUser.id).order("created_at", { ascending: false }).limit(60)
  ]);
  let state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
  state.dailyLogs = (logs || []).map(row => ({
    id: row.id, day: row.day, subject: row.subject, effort: row.effort,
    done: row.done, learned: row.learned, hard: row.hard || "", next: row.next || ""
  }));
  state.requests = (requests || []).map(row => ({
    id: row.id, subject: row.subject, message: row.message,
    date: row.created_at, hasPhoto: Boolean(row.photo_path), photoPath: row.photo_path
  }));
  localStorage.setItem(KEY, JSON.stringify({ ...state, name: profile.display_name || state.name || "", tasks: state.tasks || [], phone: "", dailyLogs: state.dailyLogs, requests: state.requests }));
  window.dispatchEvent(new CustomEvent("evolia:cloud-data-loaded"));
}

async function uploadPhoto(file) {
  if (!file) return null;
  if (!file.type.startsWith("image/")) throw new Error("Le fichier doit être une image.");
  if (file.size > 8 * 1024 * 1024) throw new Error("La photo doit faire moins de 8 Mo.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${currentUser.id}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from("student-photos").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

document.addEventListener("evolia:daily-log-saved", async (event) => {
  if (!currentUser || profile?.role !== "student") return;
  const entry = event.detail;
  const { error } = await supabase.from("daily_logs").upsert({
    student_id: currentUser.id, day: entry.day, subject: entry.subject,
    effort: entry.effort, done: entry.done, learned: entry.learned,
    hard: entry.hard || "", next: entry.next || ""
  }, { onConflict: "student_id,day" });
  if (error) {
    alert("Le bilan reste enregistré sur cet appareil, mais n'a pas pu être envoyé en ligne. Vérifie ta connexion puis réessaie.");
  } else {
    document.dispatchEvent(new CustomEvent("evolia:sync-success", { detail: "Bilan synchronisé avec ton accompagnateur." }));
  }
});

document.addEventListener("evolia:request-saved", async (event) => {
  if (!currentUser || profile?.role !== "student") return;
  try {
    const photoPath = await uploadPhoto(event.detail.photo);
    const { error } = await supabase.from("help_requests").insert({
      student_id: currentUser.id, subject: event.detail.subject,
      message: event.detail.message, photo_path: photoPath
    });
    if (error) throw error;
    document.dispatchEvent(new CustomEvent("evolia:sync-success", { detail: "Demande transmise à ton accompagnateur." }));
  } catch (error) {
    alert(error.message || "La demande n'a pas pu être enregistrée en ligne. Elle reste conservée sur cet appareil.");
  }
});

function addSignOutButton() {
  let button = $("#evolia-signout");
  if (!button) {
    button = document.createElement("button");
    button.id = "evolia-signout";
    button.className = "text-button";
    button.textContent = "Déconnexion";
    $(".topbar")?.append(button);
  }
  if (button.dataset.bound) return;
  button.dataset.bound = "true";
  button.addEventListener("click", async () => { await supabase.auth.signOut(); location.replace("/"); });
}

async function loadTutorDashboard() {
  const root = $("#tutor-content");
  if (!root) return;
  const [{ data: logs, error: logError }, { data: requests, error: requestError }] = await Promise.all([
    supabase.from("daily_logs").select("*, profiles!daily_logs_student_id_fkey(display_name)").order("day", { ascending: false }).limit(100),
    supabase.from("help_requests").select("*, profiles!help_requests_student_id_fkey(display_name)").order("created_at", { ascending: false }).limit(100)
  ]);
  if (logError || requestError) {
    root.innerHTML = '<p class="muted">Impossible de charger les bilans. Vérifie les autorisations Supabase.</p>';
    return;
  }
  const studentNames = [...new Set([...(logs || []), ...(requests || [])].map(row => row.profiles?.display_name).filter(Boolean))];
  $("#tutor-student-name").textContent = studentNames.join(", ") || "ton élève";
  $("#tutor-log-count").textContent = (logs || []).length;
  $("#tutor-request-count").textContent = (requests || []).length;
  const logHtml = (logs || []).map(row => `
    <article class="tutor-entry">
      <div class="tutor-entry-head"><strong>${escapeHtml(row.subject)} · ${formatDate(row.day)}</strong><span>${escapeHtml(row.effort)}</span></div>
      <p><b>Travail réalisé :</b> ${escapeHtml(row.done)}</p>
      <p><b>Appris :</b> ${escapeHtml(row.learned)}</p>
      ${row.hard ? `<p><b>Difficultés :</b> ${escapeHtml(row.hard)}</p>` : ""}
      ${row.next ? `<p><b>Objectif :</b> ${escapeHtml(row.next)}</p>` : ""}
    </article>`).join("") || '<p class="empty-state">Aucun bilan reçu pour le moment.</p>';
  const requestHtml = (requests || []).map(row => `
    <article class="tutor-entry">
      <div class="tutor-entry-head"><strong>${escapeHtml(row.subject)}</strong><time>${new Date(row.created_at).toLocaleString("fr-FR")}</time></div>
      <p>${escapeHtml(row.message)}</p>
      ${row.photo_path ? `<button class="text-button" data-photo-path="${escapeHtml(row.photo_path)}">Voir la photo jointe →</button>` : ""}
    </article>`).join("") || '<p class="empty-state">Aucune demande reçue.</p>';
  root.innerHTML = `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">LES DERNIERS BILANS</p><h2>Journal de progression</h2></div></div>${logHtml}</section><section class="panel"><div class="panel-heading"><div><p class="eyebrow">BESOINS D'ACCOMPAGNEMENT</p><h2>Demandes et photos</h2></div></div>${requestHtml}</section>`;
  root.querySelectorAll("[data-photo-path]").forEach(button => button.addEventListener("click", async () => {
    const { data, error } = await supabase.storage.from("student-photos").createSignedUrl(button.dataset.photoPath, 90);
    if (error) return alert("Photo momentanément indisponible.");
    window.open(data.signedUrl, "_blank", "noopener");
  }));
  addSignOutButton();
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function formatDate(value) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value + "T12:00:00"));
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  showAuth("La connexion en ligne n'est pas encore configurée. L'administrateur doit terminer le branchement Supabase.");
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  startSession().catch(() => showAuth("Une erreur est survenue pendant la connexion."));
}
