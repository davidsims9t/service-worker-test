'use strict';

const config = {
  version: 'achilles',
  staticCacheItems: [
    '/images/nyan-cat.gif',
    '/css/styles.css',
    '/js/site.js',
    '/offline/',
    '/'
  ],
  cachePathPattern: /^\/(?:(20[0-9]{2}|css|images|js)\/(.+)?)?$/,
  offlineImage: '',
  offlinePage: '/offline/'
};

function cacheName(key, opts) {
  return `${opts.version}-${key}`;
}

function addToCache(cacheKey, request, response) {
  if (response.ok) {
    const copy = response.clone();
    caches.open(cacheKey).then(cache => {
      cache.put(request, copy);
    });
  }

  return response;
}

function fetchFromCache(event) {
  return caches.match(event.request).then(response => {
    if (!response) {
      throw Error(`${event.request.url} not found in cache`);
    }

    return response;
  });
}

function offlineResponse(resourceType, opts) {
  if (resourceType === 'image') {
    return new Response(opts.offlineImage,
      {
        headers: {
          'Content-Type': 'image/svg+xml'
        }
      }
    );
  } else if (resourceType === 'content') {
    return caches.match(opts.offlinePage);
  }

  return undefined;
}

self.addEventListener('install', event => {
  function onInstall(event, opts) {
    return caches.open('static')
      .then(cache => cache.addAll(opts.staticCacheItems));
  }

  event.waitUntil(onInstall(event, config).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  function onActivate(event, opts) {
    return caches.keys()
      .then(cacheKeys => {
        const oldCacheKeys = cacheKeys.filter(key => key.indexOf(opts.version) !== 0);
        const deletePromises = oldCacheKeys.map(oldKey => caches.delete(oldKey));
        return Promise.all(deletePromises);
      });
  }

  event.waitUntil(
    onActivate(event, config)
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  function shouldHandleFetch(event, opts) {
    const request = event.request;
    const url = new URL(request.url);
    const criteria = {
      matchesPathPattern: !!opts.cachePathPattern.exec(url.pathname),
      isGETRequest: request.method === 'GET',
      isFromMyOrigin: url.origin === self.location.origin
    };

    // Create a new array with just the keys from criteria that have
    // failing (i.e. false) values.
    const failingCriteria = Object.keys(criteria).filter(criteriaKey => !criteria[criteriaKey]);

    // If that failing array has any length, one or more tests failed.
    return !failingCriteria.length;
  }

  function onFetch(event, opts) {
    const request = event.request;
    const acceptHeader = request.headers.get('Accept');
    let resourceType = 'static';
    let cacheKey = cacheName(resourceType, opts);

    if (resourceType === 'content') {
      event.respondWith(
        fetch(request)
          .then(response => addToCache(cacheKey, request, response))
          .catch(() => fetchFromCache(event))
          .catch(() => offlineResponse(resourceType, opts))
      );
    } else {
      event.respondWith(
        fetchFromCache(event)
          .catch(() => fetch(request))
            .then(response => addToCache(cacheKey, request, response))
          .catch(() => offlineResponse(resourceType, opts))
      );
    }
  }

  if (shouldHandleFetch(event, config)) {
    onFetch(event, config);
  }
});
