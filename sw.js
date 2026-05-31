// 固定SW: バージョンで中身を変えない（変えると新SWが自動有効化され裏で更新されるため）
// バージョン管理は version.json + アプリ内のUPDATE_NOWで制御する
const CACHE = 'mileage-app';
const ASSETS = [
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  // version.jsonは常にネットワークから取得（新バージョン検出のため）
  if(e.request.url.includes('version.json')){
    e.respondWith(fetch(e.request));
    return;
  }
  // ナビゲーション（アプリ起動）はキャッシュのindex.htmlを返す
  // → ユーザーが「はい」を押すまで古いバージョンを配信し続ける
  if(e.request.mode === 'navigate'){
    e.respondWith(caches.match('./index.html').then(c => c || fetch(e.request)));
    return;
  }
  // その他はキャッシュ優先
  e.respondWith(caches.match(e.request).then(cached => {
    if(cached) return cached;
    return fetch(e.request).then(res => {
      if(!res || res.status !== 200 || res.type === 'opaque') return res;
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }).catch(() => caches.match('./index.html'));
  }));
});

self.addEventListener('message', e => {
  // 旧バージョンからの移行用（待機SWを起動）
  if(e.data && e.data.type === 'SKIP_WAITING'){
    self.skipWaiting();
    return;
  }
  // 「はい」押下時: キャッシュを最新に更新してから完了通知
  if(e.data && e.data.type === 'UPDATE_NOW'){
    e.waitUntil((async () => {
      const c = await caches.open(CACHE);
      // index.html と manifest を最新で取り直す
      const refetch = ['./index.html', './manifest.json'];
      await Promise.all(refetch.map(async url => {
        try{
          const r = await fetch(url + '?t=' + Date.now(), {cache:'no-store'});
          if(r && r.ok) await c.put(url, r);
        }catch(_){}
      }));
      const client = e.source;
      if(client) client.postMessage({type:'UPDATE_DONE'});
    })());
  }
});
