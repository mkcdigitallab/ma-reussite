// ===== À MODIFIER : le tuteur (numéro WhatsApp au format international, sans + ni espaces) =====
const TUTEUR = { nom: "mon tuteur", whatsapp: "221000000000" };
const MATIERES = ["Maths", "Français", "Anglais", "Physique-Chimie", "SVT", "Histoire-Géo", "Autre"];
const MESSAGES = [
  "Une petite séance aujourd’hui vaut mieux que zéro.",
  "Bloquée ? Envoie une photo, on débloque ensemble.",
  "Chaque erreur corrigée est un point de plus.",
  "Tu n’as pas besoin d’être parfaite, juste régulière.",
  "Commence par 25 minutes, le reste suivra.",
];
const MIN = 25; // durée d'une séance de révision

// ---------- Sauvegarde dans le navigateur ----------
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
let S = load("reussite", { exam: "", goal: 5, sessions: {}, days: [], errors: [], notes: [] });
const persist = () => { try { localStorage.setItem("reussite", JSON.stringify(S)); } catch {} };

// ---------- Petits outils ----------
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isoDay = (d = new Date()) => d.toLocaleDateString("sv-SE");
const fmt = (x) => x.toFixed(1).replace(".", ",");
function markActive() {
  if (!S.days.includes(isoDay())) { S.days.push(isoDay()); persist(); renderStreak(); }
}

// ---------- Navigation par onglets ----------
document.querySelectorAll("nav button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll("main section").forEach((s) => (s.hidden = s.id !== b.dataset.tab));
  document.querySelectorAll("nav button").forEach((n) => n.toggleAttribute("aria-current", n === b));
  if (b.getAttribute("aria-current")) b.setAttribute("aria-current", "page");
}));

// ---------- Série de jours et compte à rebours ----------
function renderStreak() {
  let n = 0; const d = new Date();
  if (!S.days.includes(isoDay(d))) d.setDate(d.getDate() - 1);
  while (S.days.includes(isoDay(d))) { n++; d.setDate(d.getDate() - 1); }
  $("#streak").textContent = n ? "🔥 " + n + (n > 1 ? " jours" : " jour") : "🔥 C’est parti";
}
function renderCountdown() {
  const el = $("#countdown");
  if (!S.exam) { el.textContent = "Choisis la date"; return; }
  const d = Math.ceil((new Date(S.exam + "T00:00") - new Date()) / 864e5);
  el.textContent = d > 0 ? "J-" + d : d === 0 ? "C’est aujourd’hui !" : "Examen passé";
}
$("#exam").addEventListener("change", (e) => { S.exam = e.target.value; persist(); renderCountdown(); });

// ---------- J'ai une difficulté : envoi de la photo via WhatsApp ----------
let photo = null;
$("#photo").addEventListener("change", (e) => {
  photo = e.target.files[0] || null;
  $("#preview").hidden = !photo;
  if (photo) $("#preview").src = URL.createObjectURL(photo);
});
$("#sendForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const text = "Bonjour " + TUTEUR.nom + ", j’ai une difficulté en " + f.get("matiere") + ".\n" + (f.get("msg") || "");
  markActive();
  try {
    // Plan A : le menu de partage du téléphone (permet d'envoyer la photo directement)
    if (photo && navigator.canShare && navigator.canShare({ files: [photo] })) {
      await navigator.share({ files: [photo], text });
      return;
    }
  } catch (err) { if (err.name === "AbortError") return; }
  // Plan B : on enregistre la photo et on ouvre la conversation WhatsApp avec le texte prêt
  if (photo) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(photo); a.download = photo.name || "exercice.jpg"; a.click();
  }
  window.open("https://wa.me/" + TUTEUR.whatsapp + "?text=" + encodeURIComponent(text), "_blank");
  $("#sendHint").textContent = photo ? "Photo enregistrée : ajoute-la dans la conversation WhatsApp." : "Conversation WhatsApp ouverte.";
});

// ---------- Séance de révision (minuteur) ----------
let end = null, tick = null;
function renderTimer() {
  const left = end ? Math.max(0, end - Date.now()) : MIN * 60000;
  $("#time").textContent = String(Math.floor(left / 60000)).padStart(2, "0") + ":" + String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
  if (end && left <= 0) finishSession();
}
function finishSession() {
  end = null; clearInterval(tick);
  S.sessions[isoDay()] = (S.sessions[isoDay()] || 0) + 1; markActive(); persist();
  navigator.vibrate?.([300, 150, 300]);
  $("#timerMsg").textContent = "Bravo, séance terminée ! Prends 5 minutes de pause 🎉";
  $("#startBtn").textContent = "Démarrer"; renderTimer(); renderGoal();
}
$("#startBtn").addEventListener("click", () => {
  if (end) { end = null; clearInterval(tick); $("#startBtn").textContent = "Démarrer"; }
  else { end = Date.now() + MIN * 60000; tick = setInterval(renderTimer, 500); $("#startBtn").textContent = "Arrêter"; $("#timerMsg").textContent = ""; }
  renderTimer();
});
function renderGoal() {
  const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // lundi de cette semaine
  let n = 0; for (let i = 0; i < 7; i++) { n += S.sessions[isoDay(d)] || 0; d.setDate(d.getDate() + 1); }
  $("#bar").style.width = Math.min(100, (n / S.goal) * 100) + "%";
  $("#goalText").textContent = n + " séance" + (n > 1 ? "s" : "") + " sur " + S.goal + " cette semaine" + (n >= S.goal ? " : objectif atteint ! 🏆" : "");
}
$("#goal").addEventListener("change", (e) => { S.goal = Math.max(1, Number(e.target.value) || 1); persist(); renderGoal(); });

// ---------- Carnet d'erreurs ----------
function renderErrors() {
  const todo = S.errors.filter((e) => !e.ok).length;
  $("#errCount").textContent = S.errors.length ? (todo ? todo + " à revoir" : "Tout est revu, bravo !") : "Note ici ce que tu as raté pour le revoir avant l’examen.";
  $("#errList").innerHTML = [...S.errors].sort((a, b) => a.ok - b.ok).map((e) =>
    `<li class="${e.ok ? "ok" : ""}"><input type="checkbox" data-err="${e.id}" ${e.ok ? "checked" : ""} aria-label="Revu">
     <span><b>${esc(e.m)}</b> · ${esc(e.t)}</span><button class="x" data-del-err="${e.id}" aria-label="Supprimer">✕</button></li>`).join("");
}
$("#errForm").addEventListener("submit", (e) => {
  e.preventDefault(); const f = new FormData(e.target);
  S.errors.push({ id: String(Date.now()), m: f.get("m"), t: f.get("t"), ok: false });
  persist(); e.target.reset(); renderErrors();
});

// ---------- Notes ----------
function renderNotes() {
  const by = {}; S.notes.forEach((n) => (by[n.m] ||= []).push(n.v));
  const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const rows = Object.entries(by).map(([m, a]) => `<tr><td>${esc(m)}</td><td>${fmt(avg(a))}/20</td></tr>`).join("");
  const tot = S.notes.length ? `<tr class="tot"><td>Moyenne (sans coefficients)</td><td>${fmt(avg(Object.values(by).map(avg)))}/20</td></tr>` : "";
  $("#avgs").innerHTML = rows + tot;
  $("#noteList").innerHTML = S.notes.map((n) =>
    `<span>${esc(n.m)} ${fmt(n.v)} <button class="x" data-del-note="${n.id}" aria-label="Supprimer">✕</button></span>`).join("");
}
$("#noteForm").addEventListener("submit", (e) => {
  e.preventDefault(); const f = new FormData(e.target);
  S.notes.push({ id: String(Date.now()), m: f.get("m"), v: Math.min(20, Math.max(0, Number(f.get("v")))) });
  persist(); e.target.reset(); renderNotes();
});

// ---------- Clics sur cases à cocher et boutons ✕ ----------
document.addEventListener("click", (e) => {
  const t = e.target;
  if (t.dataset.delErr) { S.errors = S.errors.filter((x) => x.id !== t.dataset.delErr); persist(); renderErrors(); }
  if (t.dataset.delNote) { S.notes = S.notes.filter((x) => x.id !== t.dataset.delNote); persist(); renderNotes(); }
});
document.addEventListener("change", (e) => {
  const id = e.target.dataset.err; if (!id) return;
  const err = S.errors.find((x) => x.id === id); if (err) { err.ok = e.target.checked; if (err.ok) markActive(); persist(); renderErrors(); }
});

// ---------- Démarrage ----------
document.querySelectorAll(".mat").forEach((s) => (s.innerHTML = MATIERES.map((m) => `<option>${m}</option>`).join("")));
$("#message").textContent = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
$("#exam").value = S.exam; $("#goal").value = S.goal;
renderStreak(); renderCountdown(); renderGoal(); renderErrors(); renderNotes(); renderTimer();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js");
