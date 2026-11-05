// JSON-in/JSON-out adapter for testing browser algorithms against the Python source.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
require(path.join(__dirname, '..', 'web', 'data.js'));
require(path.join(__dirname, '..', 'web', 'engine.js'));
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
if (!Object.hasOwn(globalThis.IG_ENGINE, input.tool)) throw new Error('Unknown tool');
console.log(JSON.stringify(globalThis.IG_ENGINE[input.tool](...(input.args || []))));
