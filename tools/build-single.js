#!/usr/bin/env node
/* Bundles index.html + CSS + JS into a single self-contained file: dist/ridgeline-mes.html */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="css\/app\.css">/, () => '<style>\n' + fs.readFileSync(path.join(root, 'css/app.css'), 'utf8') + '\n</style>');
html = html.replace(/<script src="(js\/[\w-]+\.js)"><\/script>/g, (m, f) => '<script>\n' + fs.readFileSync(path.join(root, f), 'utf8').replace(/<\/script/gi, '<\\/script') + '\n</script>');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'ridgeline-mes.html');
fs.writeFileSync(out, html);
console.log('Wrote ' + path.relative(root, out) + ' (' + Math.round(html.length / 1024) + ' KB)');
