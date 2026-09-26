/* Jobs & WIP: released production orders. */
define(['services/ui'], function (ui) {
  'use strict';
  return function JobsVM(params) {
    const app = params.app; app.setVM(this);
    this.rowAction = ui.rowAction(app);
    const rows = DB.jobs.map(j => { const us = DB.units.filter(u => u.jobId === j.id); return { j, us, done: us.filter(u => u.status === 'Complete').length, held: us.filter(u => MES.unitHeld(u.serial)).length }; });
    this.t = ui.table([
      { h: 'Job', v: r => '<a class="oj-link mes-mono" href="#/job/' + r.j.id + '"><b>' + r.j.id + '</b></a>' },
      { h: 'Item', v: r => ui.link('item/' + r.j.itemId, ui.E(r.j.itemId)) + '<div class="oj-typography-body-xs oj-text-color-secondary">' + ui.E(MES.part(r.j.itemId).name) + '</div>' },
      { h: 'Building', v: r => ui.E(MES.building(r.j.building).short) },
      { h: 'Ordered', num: 1, v: r => r.j.qty },
      { h: 'Launched', num: 1, v: r => r.us.length },
      { h: 'Complete', num: 1, v: r => r.done },
      { h: 'WIP', num: 1, v: r => r.us.length - r.done },
      { h: 'On hold', num: 1, v: r => r.held ? '<b class="oj-text-color-danger">' + r.held + '</b>' : '0' },
      { h: 'Progress', v: r => '<div class="mes-progress" style="width:140px;margin-top:6px"><span class="done" style="width:' + (r.done / r.j.qty * 100) + '%"></span><span class="wip" style="width:' + ((r.us.length - r.done) / r.j.qty * 100) + '%"></span></div>' },
      { h: 'Due', v: r => U.fmtD(r.j.due) },
      { h: 'Priority', v: r => r.j.priority === 'High' ? '<span class="oj-badge oj-badge-danger oj-badge-subtle">High</span>' : '<span class="oj-badge oj-badge-subtle">Normal</span>' },
      { h: 'Status', v: r => ui.badge(r.j.status) },
    ], rows, { rowGo: r => 'job/' + r.j.id });
  };
});
