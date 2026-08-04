// Cooper Debate Team — Firebase Cloud Messaging Service Worker
// Handles push notifications when the portal tab is closed.
// Must live at the root of the site (cooperdebateteam.com/firebase-messaging-sw.js).

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyD0LYz6AAdiOKIrZ8cmaJEpfHBuYfm_TSc",
  authDomain:        "cooper-debate-team.firebaseapp.com",
  projectId:         "cooper-debate-team",
  storageBucket:     "cooper-debate-team.firebasestorage.app",
  messagingSenderId: "112813790184",
  appId:             "1:112813790184:web:ac559cb64747d7fd590a5d"
});

const messaging = firebase.messaging();

// Show notification when a push arrives in the background
messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification || {};
  if (!title) return;
  self.registration.showNotification(title, {
    body,
    icon:  '/images/cooper-debate-badge.png',
    badge: '/images/cooper-debate-badge.png',
    data:  { url: 'https://cooperdebateteam.com/members.html' },
  });
});

// When user taps the notification, open/focus the portal
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url)
    || 'https://cooperdebateteam.com/members.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes('cooperdebateteam.com') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
