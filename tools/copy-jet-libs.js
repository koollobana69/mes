#!/usr/bin/env node
/* Copies the Oracle JET runtime (installed by npm) into ./libs so the app can be served as static files.
   Runs automatically after `npm install` (postinstall). */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const nm = p => path.join(root, 'node_modules', p);
const jet = p => nm('@oracle/oraclejet/dist/' + p);
// resolve a versioned folder such as jqueryui-amd-1.14.2.min without hard-coding the version
const pick = (dir, re) => { const d = jet(dir); const f = fs.existsSync(d) && fs.readdirSync(d).find(x => re.test(x)); return f ? path.join(d, f) : d + '/<missing>'; };
const copies = [
  [jet('js/libs/oj/min'), 'libs/oj/min'],
  [jet('js/libs/oj/resources'), 'libs/oj/resources'],
  [jet('js/libs/oj/ojL10n.js'), 'libs/oj/ojL10n.js'],
  [pick('js/libs/jquery', /^jqueryui-amd-[\d.]+\.min$/), 'libs/jquery/jqueryui-amd.min'],
  [jet('js/libs/require-css/css.min.js'), 'libs/require-css/css.min.js'],
  [jet('js/libs/touchr/touchr.js'), 'libs/touchr/touchr.js'],
  [pick('js/libs/dnd-polyfill', /^dnd-polyfill-[\d.]+\.min\.js$/), 'libs/dnd-polyfill/dnd-polyfill.min.js'],
  [jet('css/redwood'), 'libs/oj/css/redwood'],
  [jet('css/common'), 'libs/oj/css/common'],
  [nm('jquery/dist/jquery.min.js'), 'libs/jquery/jquery.min.js'],
  [nm('knockout/build/output/knockout-latest.js'), 'libs/knockout/knockout.js'],
  [nm('requirejs/require.js'), 'libs/require/require.js'],
  [nm('requirejs-text/text.js'), 'libs/require/text.js'],
  [nm('hammerjs/hammer.min.js'), 'libs/hammer/hammer.min.js'],
  [nm('signals/dist/signals.min.js'), 'libs/js-signals/signals.min.js'],
  [nm('@oracle/oraclejet-preact/amd'), 'libs/oraclejet-preact/amd'],
  [nm('preact/dist/preact.umd.js'), 'libs/preact/dist/preact.umd.js'],
  [nm('preact/hooks/dist/hooks.umd.js'), 'libs/preact/hooks/dist/hooks.umd.js'],
  [nm('preact/compat/dist/compat.umd.js'), 'libs/preact/compat/dist/compat.umd.js'],
  [nm('preact/jsx-runtime/dist/jsxRuntime.umd.js'), 'libs/preact/jsx-runtime/dist/jsxRuntime.umd.js'],
];
let n = 0;
for (const [src, dst] of copies) {
  if (!fs.existsSync(src)) { console.warn('missing ' + path.relative(root, src)); continue; }
  const out = path.join(root, dst);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.cpSync(src, out, { recursive: true, filter: f => !f.endsWith('.map') });
  n++;
}
console.log('Oracle JET runtime copied to libs/ (' + n + ' entries)');
