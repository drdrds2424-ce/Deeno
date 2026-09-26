// service-worker.js
// نسخة الكاش - غيّر الرقم عند كل تحديث كبير للتطبيق لإجبار المتصفح على تحديث الملفات
const CACHE_NAME = "mudhakir-deyoon-cache-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/utils.js",
  "./js/db.js",
  "./js/app.js",
  "./js/customers.js",
  "./js/debts.js",
  "./js/whatsapp.js",
  "./js/reports.js",
  "./js/backup.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// تثبيت الـ Service Worker وتخزين ملفات التطبيق الأساسية في الكاش
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// تفعيل الـ Service Worker وحذف أي كاش قديم من نسخة سابقة
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// استراتيجية: جرّب الكاش أولاً، وإن لم يوجد اذهب للشبكة، وخزّن النتيجة الجديدة في الكاش
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // لا نتدخل في طلبات خارج نطاق التطبيق (مثل روابط واتساب)
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // إذا كان طلب صفحة HTML ولا يوجد اتصال، أعد صفحة index كحل احتياطي
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
        });
    })
  );
});
