/* Assembly item: BOM and routing. */
define(['services/ui'], function (ui) {
  'use strict';
  const E = ui.E;
  return function ItemVM(params) {
    const app = params.app; app.setVM(this);
    const p = MES.part(params.args[0]);
    this.found = !!(p && DB.routings[p.id]); if (!this.found) return;
    this.rowAction = ui.rowAction(app);
    const plan = MES.activePlan(p.id);
    this.id = p.id; this.title = p.id + ' · ' + p.name; this.eyebrow = MES.building(p.building).name;
    this.sub = 'Serial mask ' + (p.pattern === 'VIN' ? '17-character VIN with ISO 3779 check digit' : p.pattern) + ' · ' + MES.routing(p.id).length + ' operations · ' + MES.routing(p.id).reduce((s, o) => s + o.stdMin, 0) + ' min standard time';
    this.planHref = plan ? '#/plan/' + plan.id : null; this.planLabel = plan ? 'Quality plan ' + plan.id : '';
    this.bom = ui.table([
      { h: 'Op', v: b => '<span class="mes-mono">' + b.op + '</span>' },
      { h: 'Component', v: b => (DB.routings[b.partId] ? ui.link('item/' + b.partId, '<span class="mes-mono">' + E(b.partId) + '</span>') : '<span class="mes-mono">' + E(b.partId) + '</span>') + '<div class="oj-typography-body-xs oj-text-color-secondary">' + E(MES.part(b.partId).name) + '</div>' },
      { h: 'Position', v: b => E(b.slot || '') }, { h: 'Qty', num: 1, v: b => b.qty + ' ' + E(MES.part(b.partId).uom) },
      { h: 'Tracking', v: b => MES.part(b.partId).tracking === 'Serial' ? '<span class="mes-type mes-type-serial">Serial</span>' : '<span class="mes-tag">Lot · backflush</span>' },
    ], DB.boms[p.id] || []);
    this.bomTitle = 'Bill of materials (' + (DB.boms[p.id] || []).length + ' lines)';
    this.routing = ui.table([
      { h: 'Op', v: o => '<span class="mes-mono">' + o.seq + '</span>' }, { h: 'Zone', v: o => E(MES.station(o.station).wc) },
      { h: 'Operation', v: o => '<b>' + E(o.name) + '</b>' + (o.test ? ' <span class="mes-tag">' + E(o.test) + '</span>' : '') + '<div class="oj-typography-body-xs oj-text-color-secondary">' + E(o.instr.join(' ')) + '</div>' },
      { h: 'Station', v: o => ui.link('station/' + o.station, E(o.station)) }, { h: 'Std', num: 1, v: o => o.stdMin + ' min' },
      { h: 'Plan items', num: 1, v: o => plan ? MES.planChars(plan, o.seq).length : 0 },
    ], MES.routing(p.id), { rowGo: o => 'station/' + o.station });
    this.routingTitle = 'Routing (' + MES.routing(p.id).length + ' operations)';
  };
});
