const CACHE_NAME = "mina-vaxter-offline-v12";
const CORE_ASSETS = [
  "./iphone.html",
  "./vaxtliv.html",
  "./korsningar.html",
  "./tidigare.html",
  "./verktyg.html",
  "./stapeliader.html",
  "./common.js",
  "./hibiskus-blombedomning.js",
  "./version.json",
  "./public-data/catalog.json"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(names => Promise.all(
    names.filter(name => name.startsWith("mina-vaxter-offline-") && name !== CACHE_NAME).map(name => caches.delete(name))
  )).then(() => self.clients.claim()));
});

async function cachedResponse(request) {
  const cache = await caches.open(CACHE_NAME);
  return cache.match(request) || cache.match(request, {ignoreSearch: true});
}

function shouldCache(request, url) {
  return request.mode === "navigate" || ["script", "style", "manifest"].includes(request.destination) ||
    /\/(?:version\.json|public-data\/catalog\.json)$/.test(url.pathname);
}

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || !shouldCache(request, url)) return;
  const forceRefresh = url.searchParams.has("uppdaterad") || url.searchParams.has("v");
  const refresh = fetch(request).then(async response => {
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);
  event.waitUntil(refresh.then(() => {}));
  const localMacPreview = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (localMacPreview) {
    event.respondWith((async () => {
      const response = await refresh;
      if (response) return response;
      const cached = await cachedResponse(request);
      if (cached) return cached;
      throw new Error("Katalogen kunde inte uppdateras.");
    })());
    return;
  }
  if (forceRefresh) {
    event.respondWith((async () => {
      const response = await refresh;
      if (response) return response;
      const cached = await cachedResponse(request);
      if (cached) return cached;
      throw new Error("Katalogen kunde inte uppdateras.");
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await cachedResponse(request);
    if (cached) return cached;
    const response = await refresh;
    if (response) return response;
    throw new Error("Katalogen saknas i offline-cachen.");
  })());
});
