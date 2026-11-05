import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, createHmac } from 'node:crypto';
import { Miniflare } from 'miniflare';

const ORIGIN = 'https://studio.example';
const API = 'https://api.example';
const TEST_SECRET = 'test-only-meta-secret-not-a-real-credential';
const bindings = {
  SITE_URL:ORIGIN+'/', PUBLIC_API_URL:API, INSTAGRAM_APP_ID:'1234567890',
  INSTAGRAM_APP_SECRET:TEST_SECRET, TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64url'),
  GRAPH_API_VERSION:'v24.0',
};
const verifier = 'v'.repeat(43);
const digest = s => createHash('sha256').update(s).digest('base64url');

async function setup(t, {processing = false, publishFailure = false, configured = true, redirectToken = false} = {}) {
  const mock = {creates:0,publishes:0,finished:!processing,requests:[]};
  const mf = new Miniflare({
    modules:true,
    scriptPath:new URL('../src/worker.mjs',import.meta.url).pathname,
    compatibilityDate:'2026-07-30',
    bindings:configured ? bindings : {SITE_URL:ORIGIN+'/'},
    d1Databases:['DB'],
    outboundService:async request => {
      const u = new URL(request.url);
      mock.requests.push({host:u.hostname,path:u.pathname,method:request.method});
      const response = data => Response.json(data);
      if (u.hostname === 'api.instagram.com' && u.pathname === '/oauth/access_token') {
        if (redirectToken) return new Response(null,{status:302,headers:{Location:'https://untrusted.example/collect'}});
        return response({data:[{access_token:'test-only-short-token',user_id:'123',permissions:['instagram_business_basic','instagram_business_content_publish']}]});
      }
      if (u.pathname === '/access_token') return response({access_token:'test-only-long-token',expires_in:5184000});
      if (u.pathname === '/v24.0/me') return response({user_id:'123',username:'test_professional'});
      if (u.pathname === '/v24.0/123/media' && request.method === 'POST') { mock.creates++; return response({id:'container-1'}); }
      if (u.pathname === '/v24.0/container-1') return response({status_code:mock.finished ? 'FINISHED' : 'IN_PROGRESS'});
      if (u.pathname === '/v24.0/123/media_publish') {
        mock.publishes++;
        if (publishFailure) return Response.json({error:{message:'upstream failure'}},{status:500});
        return response({id:'published-1'});
      }
      if (u.pathname === '/v24.0/published-1') return response({id:'published-1',permalink:'https://www.instagram.com/p/test-publication/'});
      if (u.pathname === '/v24.0/123/media' && request.method === 'GET') return response({data:[{id:'posted-0',caption:'Sample account post',media_type:'IMAGE',permalink:'https://www.instagram.com/p/existing/',timestamp:'2026-11-05T10:00:00Z'}]});
      if (u.pathname === '/v24.0/123/permissions' && request.method === 'DELETE') return response({success:true});
      throw new Error('Unexpected upstream request: '+u.hostname+u.pathname);
    },
  });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const schema = await readFile(new URL('../migrations/0001_instagram.sql',import.meta.url),'utf8');
  for (const statement of schema.split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run();
  const request = async (path, {method = 'GET',data,cookie,origin = ORIGIN,form} = {}) => {
    const headers = new Headers(); if (origin) headers.set('Origin',origin);
    if (cookie) headers.set('Cookie',cookie);
    let body;
    if (data !== undefined) { headers.set('Content-Type','application/json'); body=JSON.stringify(data); }
    if (form) { headers.set('Content-Type','application/x-www-form-urlencoded'); body=new URLSearchParams(form).toString(); }
    return mf.dispatchFetch(API+path,{method,headers,body});
  };
  const login = async () => {
    const start = await request('/oauth/start',{method:'POST',data:{challenge:digest(verifier)}});
    assert.equal(start.status,200);
    const authorization = await start.json();
    const callback = await request('/oauth/callback?state='+authorization.state+'&code=test-code',{origin:null});
    const html = await callback.text();
    const message = JSON.parse(html.match(/postMessage\((\{.*?\}),/s)[1]);
    assert.equal(message.type,'instagram-connected',JSON.stringify({message,requests:mock.requests}));
    const complete = await request('/oauth/complete',{method:'POST',data:{handoff:message.handoff,verifier}});
    assert.equal(complete.status,200);
    return {cookie:complete.headers.get('Set-Cookie').split(';')[0],authorization,message,callbackHtml:html,complete};
  };
  return {mf,db,mock,request,login};
}

test('unconfigured service never claims an account is connected',async t => {
  const {request} = await setup(t,{configured:false});
  const response = await request('/health');
  assert.equal((await response.json()).configured,false);
  assert.equal((await request('/oauth/start',{method:'POST',data:{challenge:digest(verifier)}})).status,503);
});

test('official authorization requests only basic and publishing permissions',async t => {
  const {request} = await setup(t);
  const response = await request('/oauth/start',{method:'POST',data:{challenge:digest(verifier)}});
  const data = await response.json(), url = new URL(data.url);
  assert.equal(url.origin,'https://www.instagram.com');
  assert.equal(url.pathname,'/oauth/authorize');
  assert.equal(url.searchParams.get('redirect_uri'),API+'/oauth/callback');
  assert.equal(url.searchParams.get('scope'),'instagram_business_basic,instagram_business_content_publish');
  assert.equal(url.searchParams.has('client_secret'),false);
  assert.match(data.state,/^[A-Za-z0-9_-]{43}$/);
});

test('token exchange never follows a redirect to another server',async t => {
  const {request,mock,db} = await setup(t,{redirectToken:true});
  const start = await (await request('/oauth/start',{method:'POST',data:{challenge:digest(verifier)}})).json();
  const callback = await request('/oauth/callback?state='+start.state+'&code=test-code',{origin:null});
  assert.match(await callback.text(),/instagram-error/);
  assert.equal(mock.requests.length,1);
  assert.equal(mock.requests[0].host,'api.instagram.com');
  assert.equal((await db.prepare('SELECT count(*) AS n FROM connections').first()).n,0);
});

test('OAuth stores an encrypted token, hashes sessions, and uses an HttpOnly partitioned cookie',async t => {
  const {request,login,db} = await setup(t);
  const {cookie,complete,callbackHtml} = await login();
  const setCookie = complete.headers.get('Set-Cookie');
  for (const flag of ['HttpOnly','Secure','SameSite=None','Partitioned']) assert.ok(setCookie.includes(flag));
  assert.equal(complete.headers.get('Access-Control-Allow-Origin'),ORIGIN);
  assert.equal(complete.headers.get('Access-Control-Allow-Credentials'),'true');
  assert.equal(callbackHtml.includes('test-only-long-token'),false);
  const connection = await db.prepare('SELECT * FROM connections').first();
  assert.equal(connection.encrypted_token.includes('test-only-long-token'),false);
  const session = await db.prepare('SELECT * FROM sessions').first();
  assert.notEqual(session.token_hash,cookie.split('=')[1]);
  const profile = await request('/api/me',{cookie});
  assert.equal(profile.status,200);
  assert.deepEqual(Object.keys(await profile.clone().json()).sort(),['connected','expiresAt','instagramUserId','username'].sort());
  assert.equal((await profile.json()).username,'test_professional');
});

test('OAuth state is single use and the handoff cannot be redeemed without its PKCE verifier',async t => {
  const {request,mock} = await setup(t);
  const start = await (await request('/oauth/start',{method:'POST',data:{challenge:digest(verifier)}})).json();
  const response = await request('/oauth/callback?state='+start.state+'&code=test-code',{origin:null});
  const message = JSON.parse((await response.text()).match(/postMessage\((\{.*?\}),/s)[1]);
  const calls = mock.requests.length;
  assert.match(await (await request('/oauth/callback?state='+start.state+'&code=test-code',{origin:null})).text(),/instagram-error/);
  assert.equal(mock.requests.length,calls);
  assert.equal((await request('/oauth/complete',{method:'POST',data:{handoff:message.handoff,verifier:'a'.repeat(43)}})).status,401);
  assert.equal((await request('/oauth/complete',{method:'POST',data:{handoff:message.handoff,verifier}})).status,200);
  assert.equal((await request('/oauth/complete',{method:'POST',data:{handoff:message.handoff,verifier}})).status,401);
});

test('foreign origins and unauthenticated users cannot prepare or publish',async t => {
  const {request,login,mock} = await setup(t);
  const {cookie} = await login();
  const payload = {type:'IMAGE',mediaUrl:'https://example.com/photo.jpg',caption:'Тестовая подпись'};
  assert.equal((await request('/api/publications/prepare',{method:'POST',data:payload})).status,401);
  const foreign = await request('/api/publications/prepare',{method:'POST',data:payload,cookie,origin:'https://evil.example'});
  assert.equal(foreign.status,403);
  assert.equal(foreign.headers.get('Access-Control-Allow-Origin'),null);
  assert.equal(mock.creates,0);
  assert.equal(mock.publishes,0);
});

test('preparing and advancing an unconfirmed preview never touches Instagram publishing',async t => {
  const {request,login,mock} = await setup(t);
  const {cookie} = await login();
  const result = await request('/api/publications/prepare',{method:'POST',cookie,data:{type:'IMAGE',mediaUrl:'https://example.com/photo.jpg',caption:'Мой реальный пост'}});
  assert.equal(result.status,201);
  const draft = await result.json();
  assert.equal(mock.creates,0); assert.equal(mock.publishes,0);
  assert.equal((await request(`/api/publications/${draft.id}/advance`,{method:'POST',cookie})).status,200);
  const rejected = await request(`/api/publications/${draft.id}/confirm`,{method:'POST',cookie,data:{confirm:false,confirmation:draft.confirmation}});
  assert.equal(rejected.status,400);
  assert.equal(mock.creates,0); assert.equal(mock.publishes,0);
});

test('confirmed image publishing is idempotent, including concurrent requests',async t => {
  const {request,login,mock} = await setup(t);
  const {cookie} = await login();
  const prepared = await (await request('/api/publications/prepare',{method:'POST',cookie,data:{type:'IMAGE',mediaUrl:'https://example.com/photo.jpg',caption:'Публикация после подтверждения'}})).json();
  const options = {method:'POST',cookie,data:{confirm:true,confirmation:prepared.confirmation}};
  const responses = await Promise.all([request(`/api/publications/${prepared.id}/confirm`,options),request(`/api/publications/${prepared.id}/confirm`,options)]);
  for (const response of responses) assert.ok([200,202].includes(response.status));
  const result = await (await request(`/api/publications/${prepared.id}`,{cookie})).json();
  assert.equal(result.status,'published');
  assert.equal(result.permalink,'https://www.instagram.com/p/test-publication/');
  assert.equal(mock.creates,1); assert.equal(mock.publishes,1);
  await request(`/api/publications/${prepared.id}/confirm`,options);
  assert.equal(mock.publishes,1);
});

test('Reels wait for video processing and publish only an already confirmed container',async t => {
  const {request,login,mock} = await setup(t,{processing:true});
  const {cookie} = await login();
  const prepared = await (await request('/api/publications/prepare',{method:'POST',cookie,data:{type:'REELS',mediaUrl:'https://example.com/video.mp4',caption:'Новый ролик'}})).json();
  const confirm = await request(`/api/publications/${prepared.id}/confirm`,{method:'POST',cookie,data:{confirm:true,confirmation:prepared.confirmation}});
  assert.equal(confirm.status,202); assert.equal((await confirm.json()).status,'processing');
  assert.equal(mock.creates,1); assert.equal(mock.publishes,0);
  mock.finished = true;
  const result = await (await request(`/api/publications/${prepared.id}/advance`,{method:'POST',cookie})).json();
  assert.equal(result.status,'published'); assert.equal(mock.publishes,1);
});

test('an ambiguous publishing failure is never automatically retried',async t => {
  const {request,login,mock} = await setup(t,{publishFailure:true});
  const {cookie} = await login();
  const prepared = await (await request('/api/publications/prepare',{method:'POST',cookie,data:{type:'IMAGE',mediaUrl:'https://example.com/photo.jpg',caption:'Test'}})).json();
  const options = {method:'POST',cookie,data:{confirm:true,confirmation:prepared.confirmation}};
  const first = await (await request(`/api/publications/${prepared.id}/confirm`,options)).json();
  assert.equal(first.status,'uncertain');
  await request(`/api/publications/${prepared.id}/confirm`,options);
  await request(`/api/publications/${prepared.id}/advance`,{method:'POST',cookie});
  assert.equal(mock.publishes,1);
});

test('expired previews and unsafe media URLs are rejected without publishing',async t => {
  const {request,login,db,mock} = await setup(t);
  const {cookie} = await login();
  for (const mediaUrl of ['http://example.com/a.jpg','https://127.0.0.1/a.jpg','https://user:password@example.com/a.jpg','https://example.com:8443/a.jpg','javascript:alert(1)']) {
    const result = await request('/api/publications/prepare',{method:'POST',cookie,data:{type:'IMAGE',mediaUrl,caption:'text'}});
    assert.equal(result.status,400,mediaUrl);
  }
  assert.equal((await request('/api/publications/prepare',{method:'POST',cookie,data:{type:'IMAGE',mediaUrl:'https://example.com/a.jpg',caption:'я'.repeat(2201)}})).status,400);
  const prepared = await (await request('/api/publications/prepare',{method:'POST',cookie,data:{type:'IMAGE',mediaUrl:'https://example.com/a.jpg',caption:'text'}})).json();
  await db.prepare('UPDATE publications SET expires_at=0 WHERE id=?').bind(prepared.id).run();
  assert.equal((await request(`/api/publications/${prepared.id}/confirm`,{method:'POST',cookie,data:{confirm:true,confirmation:prepared.confirmation}})).status,410);
  assert.equal(mock.creates,0); assert.equal(mock.publishes,0);
});

test('disconnect deletes encrypted credentials, sessions and pending publications',async t => {
  const {request,login,db} = await setup(t);
  const {cookie} = await login();
  await request('/api/publications/prepare',{method:'POST',cookie,data:{type:'IMAGE',mediaUrl:'https://example.com/a.jpg',caption:'text'}});
  const response = await request('/api/disconnect',{method:'POST',cookie});
  assert.equal(response.status,200); assert.ok(response.headers.get('Set-Cookie').includes('Max-Age=0'));
  assert.equal((await request('/api/me',{cookie})).status,401);
  for (const table of ['connections','sessions','publications']) assert.equal((await db.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n,0);
});

test('Meta data deletion verifies the signed request before deleting data',async t => {
  const {request,login,db} = await setup(t);
  await login();
  assert.equal((await request('/data-deletion',{method:'POST',origin:null,form:{signed_request:'invalid.signature'}})).status,403);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM connections').first()).n,1);
  const payload = Buffer.from(JSON.stringify({algorithm:'HMAC-SHA256',user_id:'123'})).toString('base64url');
  const signature = createHmac('sha256',TEST_SECRET).update(payload).digest('base64url');
  const response = await request('/data-deletion',{method:'POST',origin:null,form:{signed_request:signature+'.'+payload}});
  assert.equal(response.status,200);
  const status = await response.json();
  assert.equal((await request(new URL(status.url).pathname,{origin:null})).status,200);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM connections').first()).n,0);
});
