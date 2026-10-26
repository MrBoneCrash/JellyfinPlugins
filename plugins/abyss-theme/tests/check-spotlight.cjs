const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(process.argv[2], 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 1);
for (const script of scripts) new vm.Script(script[1]);
assert.ok(!html.includes('localStorage') && !html.includes('sessionStorage'));
console.log('Adapted Spotlight script syntax and storage isolation verified.');
