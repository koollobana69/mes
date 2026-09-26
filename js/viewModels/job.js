/* Job detail: routing with WIP per operation (grouped by zone) and the job's units. */
define(['services/ui'], function (ui) {
  'use strict';
  const E = ui.E;
  return function JobVM(params) {
    const app = params.app; app.setVM(this);
    const j = MES.job(params.args[0]);
    this.found = !!j; if (!j) return;
    this.rowAction = ui.rowAction(app);
    const us = DB.units.filter(u => u.jobId === j.id).sort((a, b) => b.launchedAt - a.launchedAt);
    const plan = MES.activePlan(j.itemId);
    this.eyebrow = MES.building(j.building).name;
    this.title = j.id + ' · ' + MES.part(j.itemId).name;
    this.sub = j.note + ' · due ' + U.fmtD(j.due) + ' · released by ' + MES.userName(j.releasedBy);
    this.routingHint = MES.routing(j.itemId).length + ' operations';
    this.routing = ui.table([
      { h: 'Op', v: o => '<span class="mes-mono">' + o.seq + '</span>' },
      { h: 'Zone', v: o => E(MES.station(o.station).wc) },
      { h: 'Operation', v: o => E(o.name) + (o.test ? ' <span class="mes-tag">' + E(o.test) + '</span>' : '') },
      { h: 'Station', v: o => ui.link('station/' + o.station, E(o.station)) },
      { h: 'Std', num: 1, v: o => o.stdMin + ' min' },
      { h: 'At op', num: 1, v: o => us.filter(u => u.status !== 'Complete' && MES.currentOp(u) && MES.currentOp(u).seq === o.seq).length },
      { h: 'Passed', num: 1, v: o => us.filter(u => u.ops[o.seq] && u.ops[o.seq].status === 'Done').length },
      { h: 'Plan items', num: 1, v: o => plan ? MES.planChars(plan, o.seq).length : 0 },
    ], MES.routing(j.itemId), { rowGo: o => 'station/' + o.station });
    this.detailsHtml = ui.kv([
      ['Item', ui.link('item/' + j.itemId, E(j.itemId)) + ' · ' + E(MES.part(j.itemId).name)],
      ['Quality plan for new units', plan ? ui.link('plan/' + plan.id, E(plan.id)) + ' rev ' + plan.rev + ' ' + ui.badge(plan.status) : '<span class="oj-text-color-danger">No released plan</span>'],
      ['Ordered / launched', j.qty + ' / ' + us.length],
      ['Total standard time', MES.routing(j.itemId).reduce((s, o) => s + o.stdMin, 0) + ' min per unit'],
      ['Priority', E(j.priority)], ['Status', ui.badge(j.status)],
      ['Released', U.fmtDT(j.releasedAt) + ' by ' + E(MES.userName(j.releasedBy))],
    ]);
    this.unitsTitle = 'Units (' + us.length + ')';
    this.units = ui.table([
      { h: 'Serial', v: u => ui.serial(u.serial) },
      { h: 'State', v: u => ui.unitState(u) },
      { h: 'Current op', v: u => u.status === 'Complete' ? '<span class="oj-text-color-secondary">Released</span>' : (() => { const o = MES.currentOp(u); return 'OP' + o.seq + ' ' + E(o.name) + ' <span class="oj-typography-body-xs oj-text-color-secondary">' + E(u.ops[o.seq].status) + '</span>'; })() },
      { h: 'Location', v: u => E(u.parent ? 'Installed in ' + u.parent : u.location) },
      { h: 'Plan', v: u => ui.link('plan/' + u.planId, 'rev ' + E(u.planRev)) },
      { h: 'DRs', num: 1, v: u => { const n = DB.drs.filter(d => d.serial === u.serial).length, o = ui.openDrs(u.serial).length; return n ? n + (o ? ' <span class="oj-text-color-danger">(' + o + ' open)</span>' : '') : '0'; } },
      { h: 'Launched', v: u => U.fmtDT(u.launchedAt) },
      { h: 'Completed', v: u => U.fmtDT(u.completedAt) },
    ], us, { rowGo: u => 'unit/' + u.serial });
    this.launch = () => { const r = MES.launchUnit(j.id, DB.currentUser); app.commit(r, r.ok ? 'Launched ' + r.unit.serial + ' to ' + MES.routing(r.unit.itemId)[0].station : ''); };
  };
});
