/* Item master: manufactured assemblies and purchased components. */
define(['services/ui'], function (ui) {
  'use strict';
  const E = ui.E;
  return function ItemsVM(params) {
    const app = params.app; app.setVM(this);
    this.rowAction = ui.rowAction(app);
    this.asm = ui.table([
      { h: 'Item', v: p => '<b class="mes-mono">' + E(p.id) + '</b>' }, { h: 'Description', v: p => E(p.name) }, { h: 'Building', v: p => E(MES.building(p.building).name) },
      { h: 'BOM lines', num: 1, v: p => (DB.boms[p.id] || []).length }, { h: 'Operations', num: 1, v: p => MES.routing(p.id).length },
      { h: 'Serialized parts', num: 1, v: p => (DB.boms[p.id] || []).filter(b => MES.part(b.partId).tracking === 'Serial').length },
      { h: 'Quality plan', v: p => { const a = MES.activePlan(p.id); return a ? ui.link('plan/' + a.id, E(a.id)) : '<span class="oj-text-color-danger">none</span>'; } },
    ], ui.assemblies(), { rowGo: p => 'item/' + p.id });
    const bought = DB.parts.filter(p => p.type === 'Purchased');
    this.buyTitle = 'Purchased components (' + bought.length + ')';
    this.buy = ui.table([
      { h: 'Part', v: p => '<span class="mes-mono">' + E(p.id) + '</span>' }, { h: 'Description', v: p => E(p.name) }, { h: 'UoM', v: p => E(p.uom) },
      { h: 'Tracking', v: p => p.tracking === 'Serial' ? ui.typeBadge('serial').replace('Serial validation', 'Serial') : '<span class="mes-tag">Lot</span>' },
      { h: 'Serial mask', v: p => p.pattern ? '<span class="mes-mono">' + E(p.pattern) + '</span>' : '' }, { h: 'Supplier', v: p => E(p.supplier) },
      { h: 'Used on', v: p => Object.entries(DB.boms).filter(([, b]) => b.some(l => l.partId === p.id)).map(([k, b]) => E(k) + ' OP' + b.find(l => l.partId === p.id).op).join(', ') },
      { h: 'On hand', num: 1, v: p => U.num(DB.inv.filter(i => i.partId === p.id && i.status === 'Available').reduce((s, i) => s + i.qty, 0), p.uom === 'EA' || p.uom === 'KIT' ? 0 : 1) },
    ], bought);
  };
});
