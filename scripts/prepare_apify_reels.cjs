// Normalize a dataset locally; scores describe captions, never unviewed video hooks.
'use strict';
const fs = require('node:fs');
require('../web/data.js');
require('../web/engine.js');
require('../web/apify-data.js');
const input = JSON.parse(fs.readFileSync(0,'utf8'));
const result = globalThis.IG_APIFY_DATA.normalize(input.items,200);
const candidates = result.rows.map(row => ({...row,
  captionScore:row.captionFirstLine && !/[\u0400-\u04ff]/.test(row.captionFirstLine) ? globalThis.IG_ENGINE.hook(row.captionFirstLine).score : null,
  videoHookReviewed:false,
})).sort((a,b) => (b.captionScore ?? -1)-(a.captionScore ?? -1) || (b.views ?? -1)-(a.views ?? -1));
process.stdout.write(JSON.stringify({...result,rows:candidates},null,2));
