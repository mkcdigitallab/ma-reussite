// Service worker : permet à l'app de s'ouvrir même sans internet
const CACHE = "reussite-v1";
const FILES = ["./", "index.html", "style.css", "app.js", "manifest.json", "icon-192.png", "icon-512.png"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))));
self.addEventListener("fetch", (e) => e.respondWith(
  fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request))
));
