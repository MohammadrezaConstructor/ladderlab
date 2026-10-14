// Builds single-file versions of LadderLab:
//   dist/ladderlab.html  — everything inlined; open it from disk, a USB stick or any web server
//   dist/embed.html      — the same page without the <html>/<head>/<body> skeleton, for hosts that add their own
//                          (downloads disabled there: projects are exported as copyable text instead)
// Usage: node tools/build.js
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function inline(src) {
  let out = src.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (m, href) => {
    const css = fs.readFileSync(path.join(root, href), 'utf8');
    return '<style>\n/* ' + href + ' */\n' + css + '\n</style>';
  });
  out = out.replace(/<script src="(js\/[^"]+)"><\/script>/g, (m, file) => {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) { console.warn('skipping missing ' + file); return ''; }
    const js = fs.readFileSync(full, 'utf8').replace(/<\/script/gi, '<\\/script');
    return '<script>\n// ' + file + '\n' + js + '\n</script>';
  });
  return out;
}

// the single file has no neighbours: embed the icon, drop the manifest and the service worker
const iconSvg = fs.readFileSync(path.join(root, 'icon.svg'), 'utf8');
const html2 = html
  .replace('<link rel="icon" href="icon.svg" type="image/svg+xml">', '<link rel="icon" href="data:image/svg+xml,' + encodeURIComponent(iconSvg) + '">')
  .split('\n').filter(line => !line.includes('manifest.webmanifest')).join('\n')
  .replace('<div id="app"></div>', '<div id="app"></div>\n<script>window.LADDERLAB_NO_SW = true;</script>');
const single = inline(html2);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'ladderlab.html'), single);

// embed variant: title first, then fonts, styles, body content and scripts
const title = /<title>[\s\S]*?<\/title>/.exec(single)[0];
const links = (single.match(/<link [^>]*>/g) || []).join('\n');
const styles = (single.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');
const body = /<body>([\s\S]*)<\/body>/.exec(single)[1];
const embed = title + '\n' + links + '\n' + styles + '\n<style>html, body { height: 100%; }</style>\n' +
  '<script>window.LADDERLAB_NO_DOWNLOAD = true;</script>\n' + body.trim() + '\n';
fs.writeFileSync(path.join(root, 'dist', 'embed.html'), embed);

const kb = f => Math.round(fs.statSync(path.join(root, 'dist', f)).size / 1024) + ' KB';
console.log('dist/ladderlab.html ' + kb('ladderlab.html'));
console.log('dist/embed.html     ' + kb('embed.html'));
