// ShiftHarbour Service Worker
// Provides offline support and caching for PWA

const CACHE_NAME = 'shiftharbour-v3';
const OFFLINE_URL = '/index.html';

// Assets to cache on install
const PRECACHE = [
  '/index.html',
  '/about.html',
  '/contact.html',
  '/vision.html',
  '/privacy.html',
  '/manifest.json',
];

// Install — cache critical assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching assets');
      return cache.addAll(PRECACHE.map(url => new Request(url, {cache: 'reload'})));
    }).catch(err => {
      console.warn('[SW] Pre-cache failed (some files may not exist yet):', err);
      return caches.open(CACHE_NAME).then(cache => cache.add('/index.html'));
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first with cache fallback
self.addEventListener('fetch', event => {
  const {request} = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests
  if(request.method !== 'GET') return;
  if(url.origin !== location.origin) return;

  // For HTML pages: network first, fallback to cache, then offline page
  if(request.destination === 'document'){
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match(OFFLINE_URL)))
    );
    return;
  }

  // For other assets: cache first, then network
  event.respondWith(
    caches.match(request).then(cached => {
      if(cached) return cached;
      return fetch(request).then(response => {
        if(!response || response.status !== 200 || response.type !== 'basic') return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      });
    })
  );
});

// Background sync — retry failed posts when back online
self.addEventListener('sync', event => {
  if(event.tag === 'sync-applications'){
    event.waitUntil(syncPendingApplications());
  }
});

async function syncPendingApplications(){
  // In production: retry any queued application submissions
  console.log('[SW] Syncing pending applications…');
}

// Push notifications
self.addEventListener('push', event => {
  if(!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'ShiftHarbour', {
      body:    data.body || 'You have a new notification',
      icon:    '/manifest.json',
      badge:   '/manifest.json',
      tag:     'shiftharbour-push',
      data:    data.url || '/',
      actions: data.actions || []
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data || '/')
  );
});
