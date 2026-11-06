/** Read-only Apify bridge. The provider token never reaches the browser. */
import '../../web/apify-data.js';

const DATA = globalThis.IG_APIFY_DATA;
const encoder = new TextEncoder();
class ApifyError extends Error {
  constructor(status,message) { super(message); this.status = status; }
}
function configured(env) {
  try {
    const site = new URL(env.SITE_URL);
    const allowed = site.protocol === 'https:' || (env.ALLOW_LOCAL_DEV === '1' && site.protocol === 'http:' && ['localhost','127.0.0.1'].includes(site.hostname));
    return allowed && !!env.APIFY_API_TOKEN && typeof env.APIFY_ACCESS_KEY === 'string' && env.APIFY_ACCESS_KEY.length >= 32 && env.APIFY_ACCESS_KEY.length <= 256;
  } catch { return false; }
}
function response(request,env,data,status = 200) {
  const headers = new Headers({'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  try {
    const origin = new URL(env.SITE_URL).origin;
    if (request.headers.get('Origin') === origin) {
      headers.set('Access-Control-Allow-Origin',origin); headers.set('Vary','Origin');
      headers.set('Access-Control-Allow-Methods','GET,POST,OPTIONS'); headers.set('Access-Control-Allow-Headers','Content-Type,Authorization');
      headers.set('Access-Control-Max-Age','600');
    }
  } catch { /* Status may be checked before setup. */ }
  return new Response(status === 204 ? null : JSON.stringify(data),{status,headers});
}
async function limitedJson(message, max = 2 * 1024 * 1024) {
  if (!message.body) throw new ApifyError(502,'Источник вернул пустой ответ.');
  const reader = message.body.getReader(), parts = [];
  let length = 0;
  try {
    while (true) {
      const {value,done} = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > max) { await reader.cancel(); throw new ApifyError(413,'Ответ слишком большой. Уменьшите число роликов.'); }
      parts.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const p of parts) { bytes.set(p,offset); offset += p.length; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new ApifyError(502,'Источник вернул некорректный JSON.'); }
  } finally { reader.releaseLock(); }
}
async function authorize(request,env) {
  const supplied = request.headers.get('Authorization')?.match(/^Bearer (.{1,256})$/)?.[1];
  if (!supplied) throw new ApifyError(401,'Введите код доступа к студии.');
  const digests = await Promise.all([supplied,env.APIFY_ACCESS_KEY].map(value => crypto.subtle.digest('SHA-256',encoder.encode(value))));
  const a = new Uint8Array(digests[0]), b = new Uint8Array(digests[1]);
  let difference = 0; for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  if (difference) throw new ApifyError(401,'Код доступа не подошёл.');
}
async function get(env,path,signal) {
  const result = await fetch('https://api.apify.com/v2/'+path,{method:'GET',headers:{Authorization:'Bearer '+env.APIFY_API_TOKEN,Accept:'application/json'},redirect:'manual',signal});
  if (result.status === 429) throw new ApifyError(429,'Apify ограничил частоту запросов. Попробуйте позже.');
  if (result.status === 401 || result.status === 403) throw new ApifyError(502,'Apify отклонил доступ. Проверьте токен и его права на сервере.');
  if (result.status === 404) throw new ApifyError(404,'Источник Apify не найден или у него ещё нет успешного запуска.');
  if (!result.ok) throw new ApifyError(502,'Не удалось получить результаты Apify.');
  return limitedJson(result);
}
export async function handleApify(request,env) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/api/apify/')) return null;
  try {
    let origin;
    try { origin = new URL(env.SITE_URL).origin; } catch { /* Unconfigured. */ }
    if (request.headers.get('Origin') && request.headers.get('Origin') !== origin) throw new ApifyError(403,'Запрос должен исходить из вашей студии.');
    if (path === '/api/apify/status' && request.method === 'GET') return response(request,env,{configured:configured(env),maxItems:100,readOnly:true});
    if (!configured(env)) throw new ApifyError(503,'Сервер Apify ещё не настроен владельцем сайта.');
    if (request.method === 'OPTIONS') return response(request,env,null,204);
    if (path !== '/api/apify/import' || request.method !== 'POST') throw new ApifyError(404,'Маршрут не найден.');
    if (request.headers.get('Origin') !== origin) throw new ApifyError(403,'Запрос должен исходить из вашей студии.');
    await authorize(request,env);
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new ApifyError(415,'Нужен JSON-запрос.');
    const input = await limitedJson(request,2000);
    let source;
    try { source = DATA.source(input.source?.id,input.source?.kind); }
    catch (error) { throw new ApifyError(400,error.message); }
    const limit = input.limit ?? 50, offset = input.offset ?? 0;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 10000) throw new ApifyError(400,'Выберите от 1 до 100 записей и допустимое смещение.');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(),20000);
    try {
      let dataset = source.id;
      if (source.kind !== 'dataset') {
        const endpoint = source.kind === 'run' ? 'actor-runs/'+encodeURIComponent(source.id) : 'acts/'+encodeURIComponent(source.id)+'/runs/last?status=SUCCEEDED';
        const run = (await get(env,endpoint,controller.signal)).data;
        if (run?.status !== 'SUCCEEDED' || !/^[A-Za-z0-9_-]{1,80}$/.test(run.defaultDatasetId || '')) throw new ApifyError(409,'Дождитесь успешного завершения сбора в Apify.');
        dataset = run.defaultDatasetId;
      }
      const items = await get(env,`datasets/${encodeURIComponent(dataset)}/items?clean=true&format=json&offset=${offset}&limit=${limit}`,controller.signal);
      if (!Array.isArray(items)) throw new ApifyError(502,'Apify не вернул список записей Dataset.');
      let result;
      try { result = DATA.normalize(items,limit); } catch { throw new ApifyError(502,'Результаты Apify не похожи на выгрузку Instagram Reels.'); }
      return response(request,env,{...result,source:{kind:'dataset',id:dataset},offset,nextOffset:offset+items.length,hasMore:items.length===limit});
    } finally { clearTimeout(timer); }
  } catch (error) {
    return response(request,env,{error:error instanceof ApifyError ? error.message : 'Сервис Apify временно недоступен.'},error instanceof ApifyError ? error.status : 502);
  }
}
