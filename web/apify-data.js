/* Shared, allowlisted projection of Apify Instagram exports. No credentials. */
(() => {
  'use strict';
  const ID = /^[A-Za-z0-9_-]{1,80}$/;
  const ACTOR = /^[A-Za-z0-9_-]{1,80}(?:~[A-Za-z0-9_-]{1,80})?$/;
  const first = (...values) => values.find(v => v !== undefined && v !== null);
  const text = (value, max = 10000) => typeof value === 'string' ? value.slice(0, max) : '';
  function count(...values) {
    for (const value of values) {
      if (value === '' || value === null || value === undefined || typeof value === 'boolean') continue;
      if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) continue;
      const n = Number(value);
      if (Number.isSafeInteger(n) && n >= 0) return n;
    }
    return null;
  }
  function source(value, kind = 'dataset') {
    value = String(value || '').trim();
    if (/apify_api_|[?&](?:token|access_token|api_key)=/i.test(value)) throw new Error('Укажите ссылку без API-токена. Токен хранится только на сервере.');
    let id = value;
    if (/^https?:/i.test(value)) {
      let u;
      try { u = new URL(value); } catch { throw new Error('Некорректная ссылка Apify.'); }
      if (u.protocol !== 'https:' || u.username || u.password || u.port || !['apify.com','console.apify.com','api.apify.com'].includes(u.hostname)) throw new Error('Нужна HTTPS-ссылка на Apify или ID источника.');
      const parts = u.pathname.split('/').filter(Boolean);
      const dataset = parts.indexOf('datasets'), run = parts.indexOf('runs');
      if (dataset >= 0 && parts[dataset + 1]) { kind = 'dataset'; id = parts[dataset + 1]; }
      else if (run >= 0 && parts[run + 1]) { kind = 'run'; id = parts[run + 1]; }
      else if (u.hostname === 'apify.com' && parts.length === 2) { kind = 'actor'; id = parts.join('~'); }
      else if (parts[0] === 'actors' && parts[1]) { kind = 'actor'; id = parts[1]; }
      else throw new Error('Скопируйте ссылку на Dataset, Run или страницу Actor.');
    } else if (value.includes('/') || value.includes('~')) { kind = 'actor'; id = value.replace('/', '~'); }
    if (!['dataset','run','actor'].includes(kind) || !(kind === 'actor' ? ACTOR : ID).test(id)) throw new Error('Некорректный ID источника Apify.');
    return {kind, id};
  }
  function instagramUrl(value) {
    try {
      const u = new URL(value);
      if (u.protocol !== 'https:' || u.username || u.password || u.port || !['instagram.com','www.instagram.com'].includes(u.hostname)) return null;
      const match = u.pathname.match(/^\/(reel|reels|p)\/([A-Za-z0-9_-]{5,80})\/?$/);
      return match ? `https://www.instagram.com/${match[1] === 'p' ? 'p' : 'reel'}/${match[2]}/` : null;
    } catch { return null; }
  }
  function mediaUrl(value) {
    try {
      const u = new URL(value);
      if (u.protocol !== 'https:' || u.username || u.password || u.port || u.href.length > 6000 || !/(?:^|\.)(?:cdninstagram\.com|fbcdn\.net)$/.test(u.hostname)) return null;
      if ([...u.searchParams.keys()].some(k => /^(?:token|access_token|api_key|key)$/i.test(k))) return null;
      u.hash = '';
      return u.href;
    } catch { return null; }
  }
  function normalize(payload, limit = 200) {
    const raw = Array.isArray(payload) ? payload : first(payload?.items, Array.isArray(payload?.data) ? payload.data : payload?.data?.items);
    if (!Array.isArray(raw)) throw new Error('Ожидается JSON-массив из экспорта Apify.');
    const rows = [], seen = new Set();
    let skipped = 0, duplicates = 0;
    for (const item of raw.slice(0, limit)) {
      if (!item || typeof item !== 'object' || Array.isArray(item) || item.error || ['image','sidecar','carousel'].includes(String(item.type || '').toLowerCase())) { skipped++; continue; }
      const code = text(first(item.shortCode, item.shortcode, item.code),80);
      const url = instagramUrl(first(item.url, item.postUrl, item.permalink)) || (/^[A-Za-z0-9_-]{5,80}$/.test(code) ? `https://www.instagram.com/reel/${code}/` : null);
      const video = mediaUrl(first(item.videoUrl, item.videoURL, item.video?.url));
      const isVideo = /\/reels?\//.test(url || '') || video || /reel|video|clips/i.test(String(item.type || item.productType || item.product_type || ''));
      if (!url || !isVideo) { skipped++; continue; }
      const reelId = url.split('/').filter(Boolean).at(-1);
      if (seen.has(reelId)) { duplicates++; continue; }
      seen.add(reelId);
      const username = text(first(item.ownerUsername, item.username, item.owner?.username, item.author?.username, item.account),80).replace(/^@/,'');
      const caption = text(first(typeof item.caption === 'string' ? item.caption : item.caption?.text, item.text, item.description));
      const timestamp = first(item.timestamp, item.takenAt, item.taken_at, item.postedAt);
      let postedAt = null;
      if (timestamp) {
        const date = new Date(typeof timestamp === 'number' && timestamp < 1e12 ? timestamp * 1000 : timestamp);
        if (Number.isFinite(date.getTime())) postedAt = date.toISOString();
      }
      rows.push({
        id:url.split('/').filter(Boolean).at(-1), url,
        account:/^[a-zA-Z0-9._]{1,30}$/.test(username) ? '@'+username : null,
        caption, captionFirstLine:caption.split(/\r?\n/).find(v => v.trim())?.trim().slice(0,400) || '',
        views:count(item.videoPlayCount,item.videoViewCount,item.playCount,item.viewCount,item.views,item.playsCount),
        likes:count(item.likesCount,item.likeCount,item.likes), comments:count(item.commentsCount,item.commentCount,item.comments),
        followers:count(item.ownerFollowersCount,item.followersCount,item.followers,item.owner?.followersCount,item.author?.followers),
        median:count(item.median,item.medianViews,item.accountMedianViews),
        videoUrl:video, thumbnailUrl:mediaUrl(first(item.displayUrl,item.thumbnailUrl,item.thumbnail_src)), postedAt,
      });
    }
    return {rows, received:raw.length, skipped, duplicates, truncated:raw.length > limit};
  }
  function tsv(rows) {
    const eligible = rows.filter(r => r.account && r.views !== null && (r.median > 0 || r.followers > 0));
    if (!eligible.length) throw new Error('Для относительного сравнения нужны просмотры и число подписчиков или медиана аккаунта. Этих данных в выгрузке нет.');
    const cell = value => String(value ?? '').replace(/[\t\r\n]/g, ' ');
    let omittedRussianHooks = 0;
    const lines = eligible.map(r => {
      const russian = /[\u0400-\u04ff]/.test(r.captionFirstLine);
      if (russian) omittedRussianHooks++;
      return [r.account,r.followers,r.median,r.views,russian ? '' : r.captionFirstLine].map(cell).join('\t');
    });
    return {text:'account\tfollowers\tmedian\tviews\thook\n'+lines.join('\n'), imported:eligible.length, skipped:rows.length-eligible.length, omittedRussianHooks};
  }
  globalThis.IG_APIFY_DATA = Object.freeze({source, normalize, tsv, instagramUrl, mediaUrl});
})();
