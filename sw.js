const CACHE_NAME = "fluxo-v6";
const ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/config.js",
  "./js/db.js",
  "./js/notifications.js",
  "./js/auth.js",
  "./js/postagens.js",
  "./js/calendario.js",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Rede primeiro: sempre busca a versão mais nova quando há conexão,
  // e só usa o cache como reserva se estiver offline. Evita servir
  // JS/CSS desatualizado depois de uma atualização do app.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Preparado para quando o backend (Vercel + web-push) passar a
// enviar notificações reais com o app fechado.
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "Fluxo";
  const body = data.body || "Você tem algo pendente.";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      tag: "fluxo-proximo-item",
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow("./");
    })
  );
});