'use strict';
// Every script referenced by index.html (including the UI files the other tests do not load) must parse.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);

test('index.html references only existing scripts', () => {
  for (const s of scripts) assert.ok(fs.existsSync(path.join(root, s)), 'missing ' + s);
});

for (const s of scripts) {
  test('parses: ' + s, () => {
    const file = path.join(root, s);
    if (!fs.existsSync(file)) return;
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }));
  });
}
