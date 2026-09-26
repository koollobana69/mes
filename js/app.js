/* Ridgeline MES — boot: load saved state (or seed a fresh plant history) and render. */
'use strict';
(function boot() {
  if (!MES.load() || !DB || DB.version !== 1) { DB = SEED.build(); MES.save(); }
  App.setRoute(App.parse());
  App.shell();
  App.render();
})();
