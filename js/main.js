/* Ridgeline MES — RequireJS configuration and Oracle JET bootstrap. */
'use strict';
(function () {
  // The JET runtime is served from ./libs (copied from npm by tools/copy-jet-libs.js).
  // Set window.MES_JET_BASE before this script to load it from somewhere else (e.g. a CDN mirror).
  var base = window.MES_JET_BASE || '../libs/';
  requirejs.config({
    baseUrl: 'js',
    waitSeconds: 60,
    paths: {
      ojs: base + 'oj/min',
      ojL10n: base + 'oj/ojL10n',
      ojtranslations: base + 'oj/resources',
      knockout: base + 'knockout/knockout',
      jquery: base + 'jquery/jquery.min',
      'jqueryui-amd': base + 'jquery/jqueryui-amd.min',
      text: base + 'require/text',
      hammerjs: base + 'hammer/hammer.min',
      signals: base + 'js-signals/signals.min',
      ojdnd: base + 'dnd-polyfill/dnd-polyfill.min',
      css: base + 'require-css/css.min',
      touchr: base + 'touchr/touchr',
      '@oracle/oraclejet-preact': base + 'oraclejet-preact/amd',
      preact: base + 'preact/dist/preact.umd',
      'preact/hooks': base + 'preact/hooks/dist/hooks.umd',
      'preact/compat': base + 'preact/compat/dist/compat.umd',
      'preact/jsx-runtime': base + 'preact/jsx-runtime/dist/jsxRuntime.umd',
    },
    shim: { jquery: { exports: ['jQuery', '$'] } },
  });

  require(['ojs/ojbootstrap', 'knockout', 'appController', 'ojs/ojknockout'], function (Bootstrap, ko, app) {
    Bootstrap.whenDocumentReady().then(function () {
      ko.applyBindings(app, document.getElementById('globalBody'));
      app.start();
    });
  });
})();
