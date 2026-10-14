// Browser smoke test for LadderLab: loads index.html in headless Chrome, runs a scenario,
// reports console errors / exceptions and saves screenshots.
// Usage: node tools/browser-check.js [outDir] [scenario.js]
//   scenario.js exports async function (page) { ... } using page.eval(expr), page.shot(name), page.wait(ms), page.size(w,h)
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].find(p => fs.existsSync(p));

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const STRICT = process.argv.includes('--strict');   // exit with code 1 when the page logs errors (for CI)
const outDir = path.resolve(args[0] || path.join(os.tmpdir(), 'ladderlab-check'));
const scenarioFile = args[1] ? path.resolve(args[1]) : null;
fs.mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  if (!CHROME) throw new Error('Chrome/Edge not found');
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'll-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + port, '--user-data-dir=' + profile, '--window-size=1600,950'].concat(process.env.CI ? ['--no-sandbox'] : [], ['about:blank']), { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch('http://127.0.0.1:' + port + '/json')).json(); if (targets.length) break; } catch (e) { /* not up yet */ }
    await sleep(150);
  }
  const target = targets.find(t => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push('EXCEPTION ' + (d.exception && d.exception.description || d.text) + ' @' + (d.url || '') + ':' + d.lineNumber);
    }
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
      errors.push(m.params.type.toUpperCase() + ' ' + m.params.args.map(a => a.value || a.description || '').join(' '));
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/fonts\.g/.test(m.params.entry.url || '')) {
      errors.push('LOG ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    }
  });
  const send = (method, params) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  const page = {
    errors,
    async size(w, h) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 }); },
    async goto(url) { await send('Page.navigate', { url }); await sleep(1200); },
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: '(async () => { ' + expr + ' })()', awaitPromise: true, returnByValue: true });
      if (r.result && r.result.exceptionDetails) { const msg = 'EVAL ERROR: ' + (r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : r.result.exceptionDetails.text); errors.push(msg); return undefined; }
      return r.result && r.result.result ? r.result.result.value : undefined;
    },
    wait: sleep,
    async rect(sel) { return await page.eval('const e = document.querySelector(' + JSON.stringify(sel) + '); if (!e) return null; e.scrollIntoView({ block: "nearest", inline: "nearest" }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };'); },
    async mouse(type, x, y, buttons) {
      await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: buttons === undefined ? (type === 'mouseReleased' ? 0 : 1) : buttons, clickCount: 1 });
    },
    async click(target, opts) {
      const p = typeof target === 'string' ? await page.rect(target) : target;
      if (!p) { errors.push('CLICK target not found: ' + target); return false; }
      await page.mouse('mouseMoved', p.x, p.y, 0);
      await page.mouse('mousePressed', p.x, p.y);
      await page.mouse('mouseReleased', p.x, p.y);
      if (opts && opts.double) {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 2 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 2 });
      }
      await sleep(80);
      return true;
    },
    async drag(from, to) {
      const a = typeof from === 'string' ? await page.rect(from) : from;
      const b = typeof to === 'string' ? await page.rect(to) : to;
      await page.mouse('mouseMoved', a.x, a.y, 0);
      await page.mouse('mousePressed', a.x, a.y);
      for (let i = 1; i <= 12; i++) { await page.mouse('mouseMoved', a.x + (b.x - a.x) * i / 12, a.y + (b.y - a.y) * i / 12, 1); await sleep(16); }
      await page.mouse('mouseReleased', b.x, b.y);
      await sleep(120);
    },
    async type(text) { await send('Input.insertText', { text }); await sleep(60); },
    async key(key, mods) {
      const codes = { Enter: 13, Escape: 27, Tab: 9, Delete: 46, Backspace: 8, ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40, F5: 116 };
      const vk = codes[key] || key.toUpperCase().charCodeAt(0);
      const m = mods || 0;
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, windowsVirtualKeyCode: vk, modifiers: m, text: key.length === 1 ? key : (key === 'Enter' ? String.fromCharCode(13) : undefined) });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: vk, modifiers: m });
      await sleep(60);
    },
    async shot(name) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      const f = path.join(outDir, name + '.png');
      fs.writeFileSync(f, Buffer.from(r.result.data, 'base64'));
      return f;
    }
  };
  await page.size(1600, 950);
  // LL_PAGE=dist/ladderlab.html tests the single-file build instead of index.html
  const pageFile = process.env.LL_PAGE ? path.resolve(process.env.LL_PAGE) : path.join(__dirname, '..', 'index.html');
  const url = 'file:///' + pageFile.replace(/\\/g, '/');
  // fresh state: clear storage for the file origin
  await page.goto(url);
  await page.eval('localStorage.clear(); localStorage.setItem("ladderlab.ui", JSON.stringify({ welcomed: true }));');
  await page.goto(url);
  try {
    if (scenarioFile) await require(scenarioFile)(page);
    else await page.shot('start');
  } catch (e) { errors.push('SCENARIO ' + e.stack); }
  ws.close();
  proc.kill();
  console.log(errors.length ? errors.join('\n') : 'No console errors.');
  console.log('Screenshots in ' + outDir);
  if (STRICT && errors.length) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exit(1); });
