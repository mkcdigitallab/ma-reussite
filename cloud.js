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
        <div class="auth-brand"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40" focusable="false"><path d="M20 31V17m0 7c-7 0-11-4-11-10 7 0 11 4 11 10Zm0-5c0-7 4-11 10-11 0 7-4 11-10 11Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 32h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></span><span><strong>Évolia</strong><small>Chaque jour, un pas de plus.</small></span></div>
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

let tutorStudents = [];
let tutorLogs = [];
let tutorRequests = [];

async function loadTutorDashboard() {
  const root = $("#tutor-content");
  if (!root) return;
  root.innerHTML = '<div class="tutor-loading"><span class="loading-dot"></span> Chargement du suivi…</div>';

  const { data: students, error: studentsError } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("tutor_id", currentUser.id)
    .order("display_name", { ascending: true });

  if (studentsError) {
    root.innerHTML = '<p class="tutor-error">Impossible de charger la liste des élèves. Vérifie les autorisations.</p>';
    return;
  }

  tutorStudents = students || [];
  $("#tutor-name").textContent = profile.display_name || "accompagnateur";
  $("#tutor-student-count").textContent = tutorStudents.length;

  const filter = $("#tutor-student-filter");
  const previousValue = filter.value || "all";
  filter.innerHTML = '<option value="all">Tous les élèves</option>' +
    tutorStudents.map(student => `<option value="${escapeHtml(student.id)}">${escapeHtml(student.display_name || "Élève sans prénom")}</option>`).join("");
  filter.value = tutorStudents.some(student => student.id === previousValue) ? previousValue : "all";
  filter.onchange = renderTutorDashboard;

  if (!tutorStudents.length) {
    tutorLogs = [];
    tutorRequests = [];
    renderTutorDashboard();
    return;
  }

  const studentIds = tutorStudents.map(student => student.id);
  const [{ data: logs, error: logError }, { data: requests, error: requestError }] = await Promise.all([
    supabase.from("daily_logs")
      .select("*")
      .in("student_id", studentIds)
      .order("day", { ascending: false })
      .limit(500),
    supabase.from("help_requests")
      .select("*")
      .in("student_id", studentIds)
      .order("created_at", { ascending: false })
      .limit(500)
  ]);

  if (logError || requestError) {
    root.innerHTML = '<p class="tutor-error">Impossible de charger les données. Vérifie les autorisations Supabase puis actualise.</p>';
    return;
  }

  tutorLogs = logs || [];
  tutorRequests = requests || [];
  renderTutorDashboard();
  addSignOutButton();
}

function renderTutorDashboard() {
  const root = $("#tutor-content");
  if (!root) return;
  const selectedStudent = $("#tutor-student-filter")?.value || "all";
  const logs = tutorLogs.filter(row => selectedStudent === "all" || row.student_id === selectedStudent);
  const requests = tutorRequests.filter(row => selectedStudent === "all" || row.student_id === selectedStudent);
  $("#tutor-log-count").textContent = logs.length;
  $("#tutor-request-count").textContent = requests.length;

  if (!tutorStudents.length) {
    root.innerHTML = '<section class="tutor-empty"><span>⌂</span><h2>Aucun élève associé</h2><p>Le compte élève doit être associé à ton compte accompagnateur pour que ses bilans apparaissent ici.</p></section>';
    return;
  }

  const studentName = id => tutorStudents.find(student => student.id === id)?.display_name || "Élève";
  const logHtml = logs.map(row => `
    <article class="tutor-entry">
      <div class="tutor-entry-top">
        <div><span class="tutor-entry-kind">BILAN QUOTIDIEN</span><h3>${escapeHtml(row.subject)} <span>·</span> ${formatDate(row.day)}</h3></div>
        <span class="tutor-effort">${escapeHtml(row.effort || "—")}</span>
      </div>
      ${selectedStudent === "all" && tutorStudents.length > 1 ? `<p class="tutor-student-name">${escapeHtml(studentName(row.student_id))}</p>` : ""}
      <div class="tutor-entry-details">
        <div><span>TRAVAIL RÉALISÉ</span><p>${escapeHtml(row.done)}</p></div>
        <div><span>CE QUI A ÉTÉ APPRIS</span><p>${escapeHtml(row.learned)}</p></div>
        ${row.hard ? `<div class="tutor-difficulty"><span>DIFFICULTÉS RENCONTRÉES</span><p>${escapeHtml(row.hard)}</p></div>` : ""}
        ${row.next ? `<div><span>PROCHAIN OBJECTIF</span><p>${escapeHtml(row.next)}</p></div>` : ""}
      </div>
      <div class="tutor-entry-actions"><button class="tutor-delete" type="button" data-delete-log="${escapeHtml(row.id)}">Supprimer ce bilan</button></div>
    </article>`).join("") || '<div class="tutor-empty-inline">Aucun bilan reçu pour cette sélection.</div>';

  const requestHtml = requests.map(row => `
    <article class="tutor-entry">
      <div class="tutor-entry-top">
        <div><span class="tutor-entry-kind">DEMANDE D’AIDE</span><h3>${escapeHtml(row.subject)}</h3></div>
        <time>${new Date(row.created_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</time>
      </div>
      ${selectedStudent === "all" && tutorStudents.length > 1 ? `<p class="tutor-student-name">${escapeHtml(studentName(row.student_id))}</p>` : ""}
      <p class="tutor-request-message">${escapeHtml(row.message)}</p>
      <div class="tutor-entry-actions">
        ${row.photo_path ? `<button class="tutor-photo-button" type="button" data-photo-path="${escapeHtml(row.photo_path)}">Voir la photo jointe ↗</button>` : '<span class="tutor-no-photo">Aucune photo jointe</span>'}
        <button class="tutor-delete" type="button" data-delete-request="${escapeHtml(row.id)}" data-photo-path="${escapeHtml(row.photo_path || "")}">Supprimer cette demande</button>
      </div>
    </article>`).join("") || '<div class="tutor-empty-inline">Aucune demande d’aide pour cette sélection.</div>';

  root.innerHTML = `
    <section class="tutor-section">
      <div class="tutor-section-heading"><div><p class="eyebrow">APPRENTISSAGES</p><h2>Bilans quotidiens</h2><p>Ce que l’élève a travaillé et appris chaque jour.</p></div><span class="tutor-section-count">${logs.length}</span></div>
      <div class="tutor-list">${logHtml}</div>
    </section>
    <section class="tutor-section">
      <div class="tutor-section-heading"><div><p class="eyebrow">ÉCHANGES</p><h2>Demandes d’aide</h2><p>Les questions et difficultés pour lesquelles l’élève a besoin de toi.</p></div><span class="tutor-section-count">${requests.length}</span></div>
      <div class="tutor-list">${requestHtml}</div>
    </section>`;

  root.querySelectorAll("[data-photo-path]").forEach(button => {
    if (button.hasAttribute("data-delete-request")) return;
    button.addEventListener("click", async () => {
      const { data, error } = await supabase.storage.from("student-photos").createSignedUrl(button.dataset.photoPath, 90);
      if (error) return alert("Photo momentanément indisponible.");
      window.open(data.signedUrl, "_blank", "noopener");
    });
  });

  root.querySelectorAll("[data-delete-log]").forEach(button => {
    button.addEventListener("click", () => deleteTutorLog(button.dataset.deleteLog, button));
  });
  root.querySelectorAll("[data-delete-request]").forEach(button => {
    button.addEventListener("click", () => deleteTutorRequest(button.dataset.deleteRequest, button.dataset.photoPath, button));
  });
}

async function deleteTutorLog(id, button) {
  if (!confirm("Supprimer définitivement ce bilan ? Cette action ne peut pas être annulée.")) return;
  button.disabled = true;
  button.textContent = "Suppression…";
  const { data, error } = await supabase.from("daily_logs").delete().eq("id", id).select("id").maybeSingle();
  if (error || !data) {
    button.disabled = false;
    button.textContent = "Supprimer ce bilan";
    alert("Le bilan n’a pas pu être supprimé. Vérifie les autorisations puis réessaie.");
    return;
  }
  tutorLogs = tutorLogs.filter(row => row.id !== id);
  renderTutorDashboard();
}

async function deleteTutorRequest(id, photoPath, button) {
  if (!confirm("Supprimer définitivement cette demande" + (photoPath ? " et sa photo jointe" : "") + " ? Cette action ne peut pas être annulée.")) return;
  button.disabled = true;
  button.textContent = "Suppression…";

  if (photoPath) {
    const { error: photoError } = await supabase.storage.from("student-photos").remove([photoPath]);
    if (photoError) {
      button.disabled = false;
      button.textContent = "Supprimer cette demande";
      alert("La photo n’a pas pu être supprimée. La demande a été conservée.");
      return;
    }
  }

  const { data, error } = await supabase.from("help_requests").delete().eq("id", id).select("id").maybeSingle();
  if (error || !data) {
    button.disabled = false;
    button.textContent = "Supprimer cette demande";
    alert("La demande n’a pas pu être supprimée. Si elle comportait une photo, celle-ci a peut-être déjà été retirée.");
    return;
  }
  tutorRequests = tutorRequests.filter(row => row.id !== id);
  renderTutorDashboard();
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
