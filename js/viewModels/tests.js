/* Test records created from test operations. */
define(['knockout', 'services/ui'], function (ko, ui) {
  'use strict';
  const E = ui.E;
  return function TestsVM(params) {
    const app = params.app; app.setVM(this);
    this.rowAction = ui.rowAction(app);
    const st = app.st('tests', { type: '' });
    const types = [...new Set(DB.tests.map(t => t.testType))];
    this.kpis = types.map(t => { const l = DB.tests.filter(x => x.testType === t); const fp = Math.round(l.filter(x => x.firstPass).length / Math.max(1, l.length) * 100); return { icon: ui.icon('test'), tone: fp >= 95 ? 'ok' : 'warn', lbl: t, val: l.length, foot: Math.round(l.filter(x => x.firstPass).length / Math.max(1, l.length) * 100) + '% first-pass' }; });
    this.kpiCols = { gridTemplateColumns: 'repeat(' + Math.min(6, Math.max(1, types.length)) + ',minmax(0,1fr))' };
    this.typeDP = ui.optionsDP([{ value: '*', label: 'All test types' }].concat(types));
    this.type = ko.observable(st.type); this.typeSel = ui.allSel(this.type);
    this.t = ko.pureComputed(() => { st.type = this.type(); return ui.table([
      { h: 'Record', v: t => '<b class="mes-mono">' + E(t.id) + '</b>' },
      { h: 'Test', v: t => E(t.testType) + '<div class="oj-typography-body-xs oj-text-color-secondary">' + E(t.program) + '</div>' },
      { h: 'Serial', v: t => '<span class="mes-mono">' + E(t.serial) + '</span>' },
      { h: 'Equipment', v: t => E(t.equipment) },
      { h: 'Completed', v: t => ui.dt(t.completedAt) },
      { h: 'Operator', v: t => E(MES.userName(t.operator)) },
      { h: 'Steps', num: 1, v: t => t.steps.length },
      { h: 'Result', v: t => ui.badge(t.result) + (t.firstPass ? '' : ' <span class="mes-tag">retest</span>') },
    ], DB.tests.filter(t => !this.type() || t.testType === this.type()).slice().reverse(), { rowGo: t => 'test/' + t.id }); });
  };
});
