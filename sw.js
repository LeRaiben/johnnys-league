self.addEventListener('push', function (event) {
  var data = { title: "Johnny's League", body: "¡Nuevo mensaje en el tablón!" };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  var options = {
    body: data.body || 'Entra para ver las novedades de la liga.',
    icon: 'assets/escudo.png',
    badge: 'assets/escudo.png',
    data: {
      url: data.url || '/tablon.html'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "Johnny's League", options)
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var urlToOpen = event.notification.data && event.notification.data.url ? event.notification.data.url : '/tablon.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url.includes('tablon.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
