/* Dispatch list: running/queued units per station with material and quality readiness; move requests. */
define(['services/ui'], function (ui) {
  'use strict';
  const E = ui.E;
  return function DispatchVM(params) {
    const app = params.app; app.setVM(this);
    this.rowAction = ui.rowAction(app);
    this.buildings = ['B10', 'B20', 'B30'].map(b => {
      const rows = DB.stations.filter(s => s.building === b).map(s => { const op = ui.opForStation(s.id), at = ui.stationUnits(s.id); return { s, op, at, active: at.find(u => u.ops[op.seq].status === 'Active') }; });
      return {
        name: MES.building(b).name, rowAction: this.rowAction,
        hint: rows.length + ' stations · ' + rows.filter(r => r.active).length + ' running · ' + rows.reduce((n, r) => n + r.at.filter(u => u !== r.active).length, 0) + ' queued',
        t: ui.table([
          { h: 'Station', v: r => ui.link('station/' + r.s.id, '<b>' + E(r.s.id) + '</b>') + '<div class="oj-typography-body-xs oj-text-color-secondary">OP' + r.op.seq + ' ' + E(r.op.name) + '</div>' },
          { h: 'Zone', v: r => E(r.s.wc) },
          { h: 'Running', v: r => r.active ? ui.serial(r.active.serial) + (MES.unitHeld(r.active.serial) ? ' ' + ui.badge('On Hold') : '') + '<div class="oj-typography-body-xs oj-text-color-secondary">' + E(MES.userName(r.active.ops[r.op.seq].operator)) + ' · ' + U.dur(MES.now() - r.active.ops[r.op.seq].start) + ' of ' + r.op.stdMin + ' min std</div>' : '<span class="oj-text-color-secondary">Idle</span>' },
          { h: 'Queue (FIFO)', v: r => { const q = r.at.filter(u => u !== r.active); if (!q.length) return '—'; return q.map(u => { const m = ui.materialReady(u), held = MES.unitHeld(u.serial), gate = ui.openDrs(u.serial).length && u.opIdx === MES.routing(u.itemId).length - 1; return '<div class="mes-row" style="gap:6px;margin-bottom:3px">' + ui.serial(u.serial) + (held ? ui.badge('On Hold') : gate ? ui.badge('DR gate') : m.ok ? ui.badge('Available', 'Material ready') : '<span title="' + E('Not at line-side: ' + m.short.join(', ')) + '">' + ui.badge('Short', 'Short ' + m.short.join(', ')) + '</span>') + '</div>'; }).join(''); } },
        ], rows, { rowGo: r => 'station/' + r.s.id }),
      };
    });
    const rq = MES.replenishment();
    this.moveHint = rq.length ? rq.length + ' open requests' : 'All line-side supermarkets cover remaining WIP demand';
    this.moves = ui.table([
      { h: 'Deliver to', v: r => '<b>' + E(r.ls) + '</b>' },
      { h: 'Part', v: r => '<span class="mes-mono">' + E(r.partId) + '</span><div class="oj-typography-body-xs oj-text-color-secondary">' + E(MES.part(r.partId).name) + '</div>' },
      { h: 'Remaining demand', num: 1, v: r => r.need },
      { h: 'On hand', num: 1, v: r => r.onHand },
      { h: 'Source', v: r => r.sources.length ? E([...new Set(r.sources.map(s => s.location))].join(', ')) : '<span class="oj-text-color-danger">No releasable stock</span>' },
      { h: '', v: r => r.sources.length ? ui.btn('Move', 'fulfill', { part: r.partId, ls: r.ls }, 'callToAction') : '' },
    ], rq);
    this.hasMoves = rq.length > 0;
    this.actions = {
      fulfill: el => app.fulfill(el.getAttribute('data-part'), el.getAttribute('data-ls')),
    };
  };
});
