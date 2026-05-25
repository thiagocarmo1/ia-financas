const CACHE_NAME = 'polly-thi-finance-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/app_icon.png',
  '/manifest.json'
];

// Instalar Service Worker e Cachear arquivos fundamentais
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Ativar e limpar caches antigos
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Responder requisições com cache fallbacks
self.addEventListener('fetch', (e) => {
  // Evitar interceptação de APIs REST para não corromper o banco
  if (e.request.url.includes('/api/')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});

// ESCUTAR NOTIFICAÇÕES PUSH
self.addEventListener('push', (event) => {
  let data = { title: 'Polly e Thi finance', body: 'Você tem uma nova notificação!' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch(e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/app_icon.png',
    badge: '/app_icon.png',
    vibrate: [100, 50, 100],
    data: {
      url: self.location.origin
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ABRIR O APP AO CLICAR NA NOTIFICAÇÃO
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return clients.openWindow('/');
    })
  );
});
