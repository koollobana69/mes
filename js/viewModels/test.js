/* Single test record. */
define(['services/ui'], function (ui) {
  'use strict';
  const E = ui.E;
  return function TestVM(params) {
    const app = params.app; app.setVM(this);
    const t = DB.tests.find(x => x.id === params.args[0]);
    this.found = !!t; if (!t) return;
    const sig = t.sigId && DB.sigs.find(s => s.id === t.sigId);
    this.id = t.id; this.title = t.id + ' · ' + t.serial; this.eyebrow = t.testType + ' · ' + t.program;
    this.subHtml = ui.badge(t.result) + ' ' + (t.firstPass ? 'First-pass' : 'Includes retest after MRB action');
    this.steps = ui.table([
      { h: 'Code', v: s => '<span class="mes-mono">' + E(s.code) + '</span>' },
      { h: 'Step', v: s => E(s.name) + (s.type === 'calc' ? ' <span class="mes-tag">calc</span>' : '') },
      { h: 'Value', num: 1, v: s => '<b class="mes-mono">' + (s.type === 'check' ? E(s.value) : U.num(s.value, s.dec) + ' ' + E(s.unit)) + '</b>' },
      { h: 'Limits', v: s => s.type === 'check' ? 'Pass/Fail' : '<span class="mes-mono">' + U.num(s.lsl, s.dec) + ' – ' + U.num(s.usl, s.dec) + '</span>' },
      { h: 'Position', v: s => s.type === 'check' ? '' : ui.gauge(s, s.value) },
      { h: 'Result', v: s => ui.badge(s.result) + (s.attempts > 1 ? ' <span class="mes-tag" title="Recorded ' + s.attempts + ' times">×' + s.attempts + '</span>' : '') },
    ], t.steps);
    this.recordHtml = ui.kv([
      ['Unit', ui.serial(t.serial) + ' · ' + E(MES.part(t.itemId).name)], ['Operation', 'OP' + t.seq + ' @ ' + ui.link('station/' + t.station, E(t.station))],
      ['Equipment', E(t.equipment)], ['Program', '<span class="mes-mono">' + E(t.program) + '</span>'], ['Started', U.fmtDT(t.startedAt)],
      ['Completed', U.fmtDT(t.completedAt) + ' · ' + U.dur(t.completedAt - t.startedAt)], ['Operator', E(MES.userName(t.operator))],
    ]) + (sig ? '<div style="margin-top:12px">' + ui.sigCard(sig) + '</div>' : '');
  };
});
