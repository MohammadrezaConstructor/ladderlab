// Loads the browser-independent LadderLab scripts into Node for testing.
// Script order is taken from index.html so there is a single source of truth.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
globalThis.window = globalThis;

function scriptList() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const re = /<script\s+src="([^"]+)"/g;
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

const HEADLESS = /^js\/(core|lessons|scenes)\//;
for (const src of scriptList()) {
  if (!HEADLESS.test(src)) continue;
  const file = path.join(root, src);
  if (!fs.existsSync(file)) { console.warn('[load] missing ' + src); continue; }
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}
module.exports = globalThis.PLC;
