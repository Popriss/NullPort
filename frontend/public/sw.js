// NullPort V3 Service Worker - Web Push Notifications & Background Alerts

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'NullPort Chat', body: 'Nova notificação de mensagem', url: '/' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  // RN05: Privacidade Estrita em Notificações do SO (Blind Push)
  // Se a mensagem for de modo secreto, efêmera, tiver TTL ou visualização única,
  // oculta rigorosamente o remetente e a prévia do texto na tela de bloqueio.
  const isBlind = data.is_secret || data.is_ephemeral || data.is_secret_mode || Boolean(data.ttl_seconds) || data.is_view_once;
  const title = isBlind ? 'NullPort' : (data.title || 'NullPort Chat');
  const bodyText = isBlind ? 'Nova mensagem confidencial recebida.' : (data.body || 'Você possui novas mensagens no NullPort.');

  const options = {
    body: bodyText,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
