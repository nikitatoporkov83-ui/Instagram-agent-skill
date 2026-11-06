/** Official Instagram Login + explicit-confirmation publishing for insta.studio.
 * Instagram tokens stay encrypted in D1. Browsers receive an HttpOnly session,
 * never a Meta token or application secret. A timer can finish only posts which
 * have already received the user's explicit confirmation.
 */
import { handleApify } from './apify.mjs';
const SCOPES = ['instagram_business_basic', 'instagram_business_content_publish'];
const DAY = 86400;
const encoder = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
const hash = async text => b64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))));
const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function configuration(env) {
  const missing = [];
  for (const name of ['INSTAGRAM_APP_ID','INSTAGRAM_APP_SECRET','TOKEN_ENCRYPTION_KEY','SITE_URL','PUBLIC_API_URL','DB']) if (!env[name]) missing.push(name);
  let site, api, key;
  try {
    site = new URL(env.SITE_URL); api = new URL(env.PUBLIC_API_URL);
    const local = env.ALLOW_LOCAL_DEV === '1';
    for (const u of [site, api]) if (u.protocol !== 'https:' && !(local && ['127.0.0.1','localhost'].includes(u.hostname) && u.protocol === 'http:')) throw new Error();
    if (api.pathname !== '/' || api.search || api.hash || api.username || api.password || site.username || site.password) throw new Error();
    key = unb64(env.TOKEN_ENCRYPTION_KEY || '');
    if (key.length !== 32 || !/^\d{3,64}$/.test(env.INSTAGRAM_APP_ID || '') || !/^v\d+\.0$/.test(env.GRAPH_API_VERSION || 'v24.0')) throw new Error();
  } catch { missing.push('VALID_CONFIGURATION'); }
  return {ready:missing.length === 0, missing, site, api, key, version:env.GRAPH_API_VERSION || 'v24.0'};
}
function requireConfiguration(env) { const c = configuration(env); if (!c.ready) throw new ApiError(503, 'Подключение Instagram ещё не настроено владельцем сайта.'); return c; }
async function cryptKey(env) { return crypto.subtle.importKey('raw', unb64(env.TOKEN_ENCRYPTION_KEY), 'AES-GCM', false, ['encrypt','decrypt']); }
async function encrypt(env, token) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({name:'AES-GCM',iv}, await cryptKey(env), encoder.encode(token));
  return b64(iv) + '.' + b64(new Uint8Array(cipher));
}
async function decrypt(env, value) {
  const [iv, cipher] = value.split('.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv)}, await cryptKey(env), unb64(cipher)));
}
function headers(request, env, extra = {}) {
  const h = new Headers({'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...extra});
  const origin = request.headers.get('Origin');
  try { if (origin && origin === new URL(env.SITE_URL).origin) { h.set('Access-Control-Allow-Origin',origin); h.set('Access-Control-Allow-Credentials','true'); h.set('Vary','Origin'); } } catch { /* Unconfigured public health response. */ }
  return h;
}
const json = (request, env, data, status = 200, extra = {}) => new Response(JSON.stringify(data),{status,headers:headers(request,env,extra)});
function checkOrigin(request, env) { if (request.headers.get('Origin') !== new URL(env.SITE_URL).origin) throw new ApiError(403,'Запрос должен исходить из вашей студии.'); }
async function body(request, max = 12000) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new ApiError(415,'Нужен JSON-запрос.');
  const text = await request.text();
  if (text.length > max) throw new ApiError(413,'Запрос слишком большой.');
  try { const result = JSON.parse(text); if (!result || Array.isArray(result) || typeof result !== 'object') throw new Error(); return result; }
  catch { throw new ApiError(400,'Некорректный JSON.'); }
}
function cookie(env, token, expires) {
  const local = env.ALLOW_LOCAL_DEV === '1';
  return `insta_session=${token}; Path=/; HttpOnly; Max-Age=${Math.max(0,expires-now())}; ${local ? 'SameSite=Lax' : 'Secure; SameSite=None; Partitioned'}`;
}
async function authenticated(request, env) {
  const match = request.headers.get('Cookie')?.match(/(?:^|;\s*)insta_session=([A-Za-z0-9_-]{43})(?:;|$)/);
  if (!match) throw new ApiError(401,'Подключите аккаунт Instagram.');
  const digest = await hash(match[1]);
  const connection = await env.DB.prepare('SELECT c.*, s.token_hash AS session_hash FROM sessions s JOIN connections c ON c.id=s.connection_id WHERE s.token_hash=? AND s.expires_at>?').bind(digest,now()).first();
  if (!connection || connection.token_expires_at <= now()) throw new ApiError(401,'Сеанс закончился. Подключите аккаунт заново.');
  return connection;
}
async function upstream(url, options = {}, message = 'Instagram временно не ответил. Попробуйте позже.') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(),15000);
  try {
    // Workers support manual/follow. Manual prevents forwarding tokens on redirects.
    const response = await fetch(url,{...options,redirect:'manual',signal:controller.signal});
    let result;
    try { result = await response.json(); } catch { throw new ApiError(502,message); }
    if (!response.ok || result.error) throw new ApiError(502,message);
    return result;
  } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(502,message); }
  finally { clearTimeout(timer); }
}
async function graph(env, token, path, method = 'GET', fields = {}) {
  const url = new URL(`https://graph.instagram.com/${configuration(env).version}/${path}`);
  const options = {method,headers:{Authorization:`Bearer ${token}`}};
  if (method === 'GET') for (const [k,v] of Object.entries(fields)) url.searchParams.set(k,String(v));
  else { options.body = new URLSearchParams(fields); options.headers['Content-Type']='application/x-www-form-urlencoded'; }
  return upstream(url, options, 'Instagram не выполнил запрос. Проверьте права приложения, доступность и формат медиа.');
}
function callbackPage(env, message) {
  const c = configuration(env), nonce = random();
  const payload = JSON.stringify(message).replace(/</g,'\\u003c');
  const target = JSON.stringify(c.site.origin);
  const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Подключение Instagram</title><body><h1>${message.type === 'instagram-connected' ? 'Instagram подключён' : 'Подключение не завершено'}</h1><p>Вернитесь в окно insta.studio.</p><script nonce="${nonce}">history.replaceState(null,'','/oauth/callback');if(window.opener){window.opener.postMessage(${payload},${target});window.close();}</script></body></html>`;
  return new Response(html,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'`}});
}
async function startOAuth(request, env) {
  const c = requireConfiguration(env), data = await body(request,1000);
  if (!/^[A-Za-z0-9_-]{43}$/.test(data.challenge || '')) throw new ApiError(400,'Не удалось подготовить защищённый вход.');
  const id = random();
  await env.DB.prepare('INSERT INTO oauth_states (id,challenge,expires_at) VALUES (?,?,?)').bind(id,data.challenge,now()+600).run();
  const url = new URL('https://www.instagram.com/oauth/authorize');
  for (const [key,value] of Object.entries({client_id:env.INSTAGRAM_APP_ID,redirect_uri:c.api.origin+'/oauth/callback',response_type:'code',scope:SCOPES.join(','),state:id,enable_fb_login:'0',force_authentication:'1'})) url.searchParams.set(key,value);
  return json(request,env,{url:url.href,state:id});
}
async function callback(request, env) {
  const c = requireConfiguration(env), url = new URL(request.url), state = url.searchParams.get('state') || '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return callbackPage(env,{type:'instagram-error',message:'Сеанс входа не найден. Начните подключение заново.',state});
  const row = await env.DB.prepare('DELETE FROM oauth_states WHERE id=? AND expires_at>? RETURNING *').bind(state,now()).first();
  if (!row) return callbackPage(env,{type:'instagram-error',message:'Ссылка входа устарела или уже использована.',state});
  if (url.searchParams.has('error')) return callbackPage(env,{type:'instagram-error',message:'Вы отменили подключение Instagram.',state});
  const code = url.searchParams.get('code');
  if (!code || code.length > 4000) return callbackPage(env,{type:'instagram-error',message:'Instagram не передал код входа.',state});
  try {
    const result = await upstream('https://api.instagram.com/oauth/access_token',{method:'POST',body:new URLSearchParams({client_id:env.INSTAGRAM_APP_ID,client_secret:env.INSTAGRAM_APP_SECRET,grant_type:'authorization_code',redirect_uri:c.api.origin+'/oauth/callback',code})});
    const short = result.data?.[0] || result;
    if (!short.access_token) throw new ApiError(502,'Не получен доступ Instagram.');
    const exchange = new URL('https://graph.instagram.com/access_token');
    exchange.search = new URLSearchParams({grant_type:'ig_exchange_token',client_secret:env.INSTAGRAM_APP_SECRET,access_token:short.access_token}).toString();
    const long = await upstream(exchange);
    if (!long.access_token || !Number.isFinite(Number(long.expires_in)) || Number(long.expires_in) < 60) throw new ApiError(502,'Instagram не выдал действующий доступ.');
    const profile = await graph(env,long.access_token,'me','GET',{fields:'user_id,username'});
    const userId = String(profile.user_id || profile.id || short.user_id || '');
    if (!/^\d+$/.test(userId) || typeof profile.username !== 'string') throw new ApiError(502,'Не удалось получить профиль Instagram.');
    const connectionId = random(), handoff = random();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO connections (id,instagram_user_id,username,encrypted_token,token_expires_at,created_at) VALUES (?,?,?,?,?,?)').bind(connectionId,userId,profile.username,await encrypt(env,long.access_token),now()+Number(long.expires_in),now()),
      env.DB.prepare('INSERT INTO handoffs (id,connection_id,challenge,expires_at) VALUES (?,?,?,?)').bind(handoff,connectionId,row.challenge,now()+180),
    ]);
    return callbackPage(env,{type:'instagram-connected',handoff,state});
  } catch { return callbackPage(env,{type:'instagram-error',state,message:'Не удалось завершить официальный вход Instagram. Проверьте настройки приложения Meta и повторите подключение.'}); }
}
async function completeOAuth(request, env) {
  const data = await body(request,1000);
  if (!/^[A-Za-z0-9_-]{43}$/.test(data.handoff || '') || !/^[A-Za-z0-9_-]{43,128}$/.test(data.verifier || '')) throw new ApiError(400,'Недействительное подтверждение входа.');
  const record = await env.DB.prepare('DELETE FROM handoffs WHERE id=? AND challenge=? AND expires_at>? RETURNING *').bind(data.handoff,await hash(data.verifier),now()).first();
  if (!record) throw new ApiError(401,'Подтверждение входа устарело или уже использовано.');
  const token = random(), expires = now()+30*DAY;
  await env.DB.prepare('INSERT INTO sessions (token_hash,connection_id,expires_at) VALUES (?,?,?)').bind(await hash(token),record.connection_id,expires).run();
  return json(request,env,{connected:true},200,{'Set-Cookie':cookie(env,token,expires)});
}
function mediaPayload(data) {
  if (!['IMAGE','REELS'].includes(data.type)) throw new ApiError(400,'Выберите фото или Reels.');
  if (typeof data.caption !== 'string' || [...data.caption].length > 2200) throw new ApiError(400,'Подпись должна быть не длиннее 2 200 символов.');
  let url;
  try { url = new URL(data.mediaUrl); } catch { throw new ApiError(400,'Укажите полную HTTPS-ссылку на файл.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.href.length > 3000 || !url.hostname.includes('.') || /^(?:\d+\.){3}\d+$/.test(url.hostname) || url.hostname.includes(':') || /(?:^|\.)(?:localhost|local|internal)$/.test(url.hostname) || url.port) throw new ApiError(400,'Нужна публичная HTTPS-ссылка на JPEG или MP4, без локальных адресов.');
  return {type:data.type,mediaUrl:url.href,caption:data.caption.trim()};
}
function publication(row) {
  return {id:row.id,status:row.status,...JSON.parse(row.payload),instagramMediaId:row.instagram_media_id || null,permalink:row.permalink || null,error:row.error || null,createdAt:row.created_at,confirmedAt:row.confirmed_at || null};
}
async function ownPublication(env,id,connection) {
  const row = await env.DB.prepare('SELECT * FROM publications WHERE id=? AND connection_id=? AND session_hash=?').bind(id,connection.id,connection.session_hash).first();
  if (!row) throw new ApiError(404,'Публикация не найдена.');
  return row;
}
async function preparePublication(request,env,connection) {
  const data = mediaPayload(await body(request)), id = random(), confirmation = random(), time = now();
  await env.DB.prepare("INSERT INTO publications (id,connection_id,session_hash,confirmation_hash,payload,status,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,'prepared',?,?,?)").bind(id,connection.id,connection.session_hash,await hash(confirmation),JSON.stringify(data),time+600,time,time).run();
  return json(request,env,{id,confirmation,username:connection.username,...data,expiresAt:time+600},201);
}
async function advance(env,id) {
  let row = await env.DB.prepare('SELECT * FROM publications WHERE id=?').bind(id).first();
  if (!row || !row.confirmed_at || row.status !== 'processing') return;
  const connection = await env.DB.prepare('SELECT * FROM connections WHERE id=?').bind(row.connection_id).first();
  if (!connection || connection.token_expires_at <= now()) {
    await env.DB.prepare("UPDATE publications SET status='failed',error=?,updated_at=? WHERE id=? AND status='processing'").bind('Нужно заново подключить Instagram.',now(),id).run(); return;
  }
  try {
    const token = await decrypt(env,connection.encrypted_token);
    const status = await graph(env,token,row.container_id,'GET',{fields:'status_code'});
    if (['ERROR','EXPIRED'].includes(status.status_code)) {
      await env.DB.prepare("UPDATE publications SET status='failed',error=?,updated_at=? WHERE id=? AND status='processing'").bind('Instagram не смог обработать файл. Проверьте формат и доступность ссылки.',now(),id).run(); return;
    }
    if (status.status_code !== 'FINISHED') return;
    const lock = await env.DB.prepare("UPDATE publications SET status='publishing',updated_at=? WHERE id=? AND status='processing' RETURNING id").bind(now(),id).first();
    if (!lock) return;
    let media;
    try { media = await graph(env,token,`${connection.instagram_user_id}/media_publish`,'POST',{creation_id:row.container_id}); if (!media.id) throw new Error(); }
    catch {
      await env.DB.prepare("UPDATE publications SET status='uncertain',error=?,updated_at=? WHERE id=?").bind('Результат отправки не подтверждён. Проверьте аккаунт Instagram: автоматической повторной отправки не будет.',now(),id).run(); return;
    }
    await env.DB.prepare("UPDATE publications SET status='published',instagram_media_id=?,updated_at=? WHERE id=?").bind(String(media.id),now(),id).run();
    try {
      const details = await graph(env,token,String(media.id),'GET',{fields:'permalink'});
      if (typeof details.permalink === 'string' && /^https:\/\/(?:www\.)?instagram\.com\//i.test(details.permalink)) await env.DB.prepare('UPDATE publications SET permalink=? WHERE id=?').bind(details.permalink,id).run();
    } catch { /* The post is published even if its optional permalink is unavailable. */ }
  } catch {
    // A failed status read can be retried; it has no publishing side effect.
    await env.DB.prepare('UPDATE publications SET updated_at=? WHERE id=? AND status=?').bind(now(),id,'processing').run();
  }
}
async function confirmPublication(request,env,connection,id) {
  let row = await ownPublication(env,id,connection);
  const data = await body(request,1000);
  if (data.confirm !== true || typeof data.confirmation !== 'string' || await hash(data.confirmation) !== row.confirmation_hash) throw new ApiError(400,'Для отправки требуется ваше подтверждение.');
  if (row.status === 'prepared' && row.expires_at <= now()) throw new ApiError(410,'Предпросмотр устарел. Подготовьте публикацию заново.');
  const lock = await env.DB.prepare("UPDATE publications SET status='creating',confirmed_at=?,updated_at=? WHERE id=? AND status='prepared' AND expires_at>? RETURNING *").bind(now(),now(),id,now()).first();
  if (lock) {
    try {
      const token = await decrypt(env,connection.encrypted_token), payload = JSON.parse(row.payload);
      const form = payload.type === 'REELS' ? {media_type:'REELS',video_url:payload.mediaUrl,share_to_feed:'true',caption:payload.caption} : {image_url:payload.mediaUrl,caption:payload.caption};
      const container = await graph(env,token,`${connection.instagram_user_id}/media`,'POST',form);
      if (!container.id) throw new Error();
      await env.DB.prepare("UPDATE publications SET status='processing',container_id=?,updated_at=? WHERE id=? AND status='creating'").bind(String(container.id),now(),id).run();
    } catch {
      await env.DB.prepare("UPDATE publications SET status='failed',error=?,updated_at=? WHERE id=? AND status='creating'").bind('Не удалось подготовить файл в Instagram. Проверьте формат, ссылку и разрешение на публикацию.',now(),id).run();
    }
  }
  await advance(env,id);
  row = await ownPublication(env,id,connection);
  return json(request,env,publication(row),['creating','processing','publishing'].includes(row.status) ? 202 : 200);
}
async function signedUser(request,env) {
  const text = await request.text();
  if (text.length > 12000) throw new ApiError(413,'Запрос слишком большой.');
  const signed = new URLSearchParams(text).get('signed_request') || '';
  try {
    const [signature,payload,...extra] = signed.split('.');
    if (!signature || !payload || extra.length) throw new Error();
    const key = await crypto.subtle.importKey('raw',encoder.encode(env.INSTAGRAM_APP_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    if (!await crypto.subtle.verify('HMAC',key,unb64(signature),encoder.encode(payload))) throw new Error();
    const data = JSON.parse(new TextDecoder().decode(unb64(payload)));
    if (data.algorithm?.toUpperCase() !== 'HMAC-SHA256' || !/^\d+$/.test(String(data.user_id || ''))) throw new Error();
    return String(data.user_id);
  } catch { throw new ApiError(403,'Недействительная подпись Meta.'); }
}
async function deleteUser(env,id) { await env.DB.prepare('DELETE FROM connections WHERE instagram_user_id=?').bind(id).run(); }

async function handle(request,env) {
  const apifyResponse = await handleApify(request,env);
  if (apifyResponse) return apifyResponse;
  const url = new URL(request.url), path = url.pathname, c = configuration(env);
  if (path === '/health' && request.method === 'GET') return json(request,env,{configured:c.ready,permissions:SCOPES});
  if (request.method === 'OPTIONS') {
    if (!c.ready) return json(request,env,{configured:false},503);
    checkOrigin(request,env);
    return new Response(null,{status:204,headers:headers(request,env,{'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'})});
  }
  requireConfiguration(env);
  if (path === '/oauth/callback' && request.method === 'GET') return callback(request,env);
  if (['/oauth/deauthorize','/data-deletion'].includes(path) && request.method === 'POST') {
    await deleteUser(env,await signedUser(request,env));
    if (path === '/oauth/deauthorize') return json(request,env,{success:true});
    const code = random();
    await env.DB.prepare('INSERT INTO deletion_requests (id,expires_at) VALUES (?,?)').bind(code,now()+7*DAY).run();
    return json(request,env,{url:c.api.origin+'/data-deletion/status/'+code,confirmation_code:code});
  }
  if (path.startsWith('/data-deletion/status/') && request.method === 'GET') {
    const record = await env.DB.prepare('SELECT id FROM deletion_requests WHERE id=? AND expires_at>?').bind(path.split('/').at(-1),now()).first();
    return new Response(record ? 'Данные подключения удалены.' : 'Подтверждение не найдено или устарело.',{status:record ? 200 : 404,headers:{'Content-Type':'text/plain;charset=utf-8','Cache-Control':'no-store'}});
  }
  checkOrigin(request,env);
  if (path === '/oauth/start' && request.method === 'POST') return startOAuth(request,env);
  if (path === '/oauth/complete' && request.method === 'POST') return completeOAuth(request,env);
  const connection = await authenticated(request,env);
  if (path === '/api/me' && request.method === 'GET') return json(request,env,{connected:true,username:connection.username,instagramUserId:connection.instagram_user_id,expiresAt:connection.token_expires_at});
  if (path === '/api/media' && request.method === 'GET') {
    const result = await graph(env,await decrypt(env,connection.encrypted_token),`${connection.instagram_user_id}/media`,'GET',{fields:'id,caption,media_type,permalink,timestamp',limit:12});
    return json(request,env,{media:(result.data || []).map(m => ({id:m.id,caption:m.caption || '',type:m.media_type,permalink:typeof m.permalink === 'string' && /^https:\/\/(?:www\.)?instagram\.com\//i.test(m.permalink) ? m.permalink : null,timestamp:m.timestamp}))});
  }
  if (path === '/api/disconnect' && request.method === 'POST') {
    let revoked = false;
    try { await graph(env,await decrypt(env,connection.encrypted_token),`${connection.instagram_user_id}/permissions`,'DELETE'); revoked = true; } catch { /* Delete local access even if Meta cannot be reached. */ }
    await deleteUser(env,connection.instagram_user_id);
    return json(request,env,{connected:false,revoked},200,{'Set-Cookie':cookie(env,'',0)});
  }
  if (path === '/api/publications' && request.method === 'GET') {
    const result = await env.DB.prepare('SELECT * FROM publications WHERE connection_id=? AND session_hash=? ORDER BY created_at DESC LIMIT 20').bind(connection.id,connection.session_hash).all();
    return json(request,env,{publications:result.results.map(publication)});
  }
  if (path === '/api/publications/prepare' && request.method === 'POST') return preparePublication(request,env,connection);
  const match = path.match(/^\/api\/publications\/([A-Za-z0-9_-]{43})(?:\/(confirm|advance))?$/);
  if (match) {
    const [,id,operation] = match;
    if (operation === 'confirm' && request.method === 'POST') return confirmPublication(request,env,connection,id);
    if (operation === 'advance' && request.method === 'POST') {
      await ownPublication(env,id,connection); await advance(env,id);
      return json(request,env,publication(await ownPublication(env,id,connection)));
    }
    if (!operation && request.method === 'GET') return json(request,env,publication(await ownPublication(env,id,connection)));
  }
  throw new ApiError(404,'Адрес не найден.');
}

export default {
  async fetch(request,env) {
    try { return await handle(request,env); }
    catch (error) { return json(request,env,{error:error instanceof ApiError ? error.message : 'Сервис временно недоступен.'},error instanceof ApiError ? error.status : 500); }
  },
  async scheduled(event,env,ctx) {
    if (!configuration(env).ready) return;
    const result = await env.DB.prepare("SELECT id FROM publications WHERE status='processing' AND confirmed_at IS NOT NULL LIMIT 10").all();
    for (const row of result.results) await advance(env,row.id);
    const time = now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM oauth_states WHERE expires_at<?').bind(time),
      env.DB.prepare('DELETE FROM handoffs WHERE expires_at<?').bind(time),
      env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(time),
      env.DB.prepare('DELETE FROM deletion_requests WHERE expires_at<?').bind(time),
      env.DB.prepare("DELETE FROM publications WHERE (status='prepared' AND expires_at<?) OR created_at<?").bind(time,time-30*DAY),
      env.DB.prepare('DELETE FROM connections WHERE token_expires_at<? OR (created_at<? AND NOT EXISTS (SELECT 1 FROM sessions WHERE connection_id=connections.id))').bind(time,time-DAY),
      env.DB.prepare("UPDATE publications SET status='uncertain',error=?,updated_at=? WHERE status IN ('creating','publishing') AND updated_at<?").bind('Отправка прервалась. Проверьте аккаунт перед повторной публикацией.',time,time-300),
    ]);
  },
};

export { mediaPayload, configuration };
