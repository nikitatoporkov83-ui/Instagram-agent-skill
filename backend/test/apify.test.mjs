import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import '../../web/apify-data.js';

const D = globalThis.IG_APIFY_DATA;
const ORIGIN = 'https://studio.example';
const ACCESS = 'test-only-access-key-with-at-least-32-characters';
const PROVIDER = 'test-only-provider-token-never-return-to-client';
const row = {type:'Video',shortCode:'GTA600001',ownerUsername:'gta_example',caption:'3 details you missed.\n#GTA6',videoPlayCount:8000,likesCount:200,commentsCount:9,ownerFollowersCount:4000,videoUrl:'https://scontent.cdninstagram.com/reel.mp4?oh=public-cdn-signature',access_token:PROVIDER};
async function setup(t,options = {}) {
  const calls = [];
  const mf = new Miniflare({
    modules:true, modulesRoot:new URL('../../',import.meta.url).pathname,
    scriptPath:new URL('../src/worker.mjs',import.meta.url).pathname,
    compatibilityDate:'2026-07-30',
    bindings:{SITE_URL:ORIGIN+'/',APIFY_API_TOKEN:PROVIDER,...(options.unconfigured ? {} : {APIFY_ACCESS_KEY:ACCESS})},
    outboundService:async request => {
      const url = new URL(request.url);
      calls.push({host:url.hostname,path:url.pathname,search:url.search,method:request.method,authorization:request.headers.get('Authorization')});
      assert.equal(url.hostname,'api.apify.com');
      assert.equal(request.headers.get('Authorization'),'Bearer '+PROVIDER);
      if (options.redirect) return new Response(null,{status:302,headers:{Location:'https://untrusted.example/steal'}});
      if (options.denied) return Response.json({error:{message:PROVIDER}},{status:401});
      if (options.limited) return Response.json({error:{message:PROVIDER}},{status:429});
      if (options.oversized) return new Response('x'.repeat(2*1024*1024+1));
      if (url.pathname.includes('/runs/') || url.pathname.includes('/actor-runs/')) return Response.json({data:{status:options.running ? 'RUNNING' : 'SUCCEEDED',defaultDatasetId:'dataset123'}});
      return Response.json([row,{...row}, {...row,shortCode:'GTA600002',ownerFollowersCount:null,videoPlayCount:-1,videoUrl:'javascript:alert(1)'},{type:'Image',shortCode:'PHOTO1234'}]);
    },
  });
  t.after(() => mf.dispose());
  const request = (path,data,headers = {}) => mf.dispatchFetch('https://api.example'+path,{method:data ? 'POST':'GET',headers:{Origin:ORIGIN,'Content-Type':'application/json',Authorization:'Bearer '+ACCESS,...headers},...(data ? {body:JSON.stringify(data)} : {})});
  return {request,calls};
}
test('Apify is independent of Meta configuration; unconfigured service never claims readiness',async t => {
  const {request} = await setup(t,{unconfigured:true});
  assert.equal((await (await request('/api/apify/status')).json()).configured,false);
  assert.equal((await request('/api/apify/import',{source:{kind:'dataset',id:'dataset123'}})).status,503);
});
test('import requires the private studio code and exact site origin before any upstream request',async t => {
  const {request,calls} = await setup(t);
  assert.equal((await (await request('/api/apify/status')).json()).configured,true);
  assert.equal((await request('/api/apify/import',{source:{kind:'dataset',id:'dataset123'}},{Authorization:'Bearer wrong'})).status,401);
  assert.equal((await request('/api/apify/import',{source:{kind:'dataset',id:'dataset123'}},{Origin:'https://untrusted.example'})).status,403);
  assert.equal(calls.length,0);
});
test('dataset import projects only Reel fields, drops duplicates and photos, preserves unknown metrics',async t => {
  const {request,calls} = await setup(t);
  const response = await request('/api/apify/import',{source:{kind:'dataset',id:'dataset123'},limit:20});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),ORIGIN);
  const data = await response.json();
  assert.equal(data.rows.length,2); assert.equal(data.skipped,1); assert.equal(data.duplicates,1);
  assert.equal(data.rows[0].views,8000); assert.equal(data.rows[0].account,'@gta_example');
  assert.equal(data.rows[1].views,null); assert.equal(data.rows[1].followers,null); assert.equal(data.rows[1].videoUrl,null);
  assert.equal(JSON.stringify(data).includes(PROVIDER),false);
  assert.equal(calls[0].search.includes('token'),false);
  assert.equal(calls[0].search.includes('limit=20'),true);
  assert.equal(calls[0].method,'GET');
});
test('Actor and Run sources resolve successful datasets using GET only, without starting a paid job',async t => {
  const {request,calls} = await setup(t);
  assert.equal((await request('/api/apify/import',{source:{kind:'actor',id:'apify~instagram-hashtag-scraper'}})).status,200);
  assert.match(calls[0].path,/\/acts\/apify~instagram-hashtag-scraper\/runs\/last$/);
  assert.equal(calls[0].search,'?status=SUCCEEDED');
  assert.equal((await request('/api/apify/import',{source:{kind:'run',id:'run123'}})).status,200);
  assert.equal(calls.every(r => r.method === 'GET'),true);
});
test('running jobs, unsafe sources, token URLs and oversized limits do not fetch dataset items',async t => {
  const {request,calls} = await setup(t,{running:true});
  for (const source of ['https://untrusted.example/private','https://api.apify.com/v2/datasets/x/items?token=private','../../private']) {
    assert.equal((await request('/api/apify/import',{source:{kind:'dataset',id:source}})).status,400);
  }
  assert.equal((await request('/api/apify/import',{source:{kind:'dataset',id:'dataset123'},limit:101})).status,400);
  assert.equal(calls.length,0);
  assert.equal((await request('/api/apify/import',{source:{kind:'run',id:'run123'}})).status,409);
  assert.equal(calls.length,1);
});
test('provider redirects are not followed and errors never echo a provider secret',async t => {
  for (const setting of [{redirect:true},{denied:true},{limited:true},{oversized:true}]) {
    await t.test(JSON.stringify(setting),async t => {
      const {request,calls} = await setup(t,setting);
      const response = await request('/api/apify/import',{source:{kind:'dataset',id:'dataset123'}});
      assert.ok([413,429,502].includes(response.status));
      assert.equal((await response.text()).includes(PROVIDER),false);
      assert.equal(calls.length,1);
    });
  }
});
test('source parser accepts console/store links but rejects secrets and arbitrary hosts',() => {
  assert.deepEqual(D.source('https://console.apify.com/storage/datasets/ABC123'),{kind:'dataset',id:'ABC123'});
  assert.deepEqual(D.source('https://console.apify.com/actors/runs/Run123'),{kind:'run',id:'Run123'});
  assert.deepEqual(D.source('https://apify.com/apify/instagram-hashtag-scraper'),{kind:'actor',id:'apify~instagram-hashtag-scraper'});
  assert.throws(() => D.source('https://api.apify.com/v2/datasets/x/items?token=secret'));
  assert.throws(() => D.source('https://apify.com.untrusted.example/storage/datasets/abc'));
});
test('TSV import never fabricates account baselines and omits unsupported Russian hook scoring',() => {
  const normalized = D.normalize([row,{...row,shortCode:'GTA600003',caption:'Три детали GTA VI',ownerFollowersCount:1000},{...row,shortCode:'GTA600004',ownerFollowersCount:null}]);
  const result = D.tsv(normalized.rows);
  assert.equal(result.imported,2); assert.equal(result.skipped,1); assert.equal(result.omittedRussianHooks,1);
  assert.equal(result.text.includes('Три детали'),false);
  assert.throws(() => D.tsv([normalized.rows[2]]));
  assert.deepEqual(D.normalize(normalized.rows).rows,normalized.rows);
});
