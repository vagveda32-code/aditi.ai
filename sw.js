// अदिति — ऐप का खोल offline भी खुले; बातचीत/आवाज़ (API) हमेशा नेटवर्क से
const C = "aditi-v14";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(C).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.pathname.startsWith("/api/") || u.origin !== location.origin) return;
  // पेज: पहले नेटवर्क (नया version), न मिले तो cache
  e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(C).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match("/"))));
});
