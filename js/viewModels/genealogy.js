/* Genealogy search: vehicles list and where-used for a lot or component serial. */
define(['knockout', 'services/ui'], function (ko, ui) {
  'use strict';
  const E = ui.E;
  return function GenealogyVM(params) {
    const app = params.app; app.setVM(this);
    this.rowAction = ui.rowAction(app);
    const q = params.args[0] || '';
    this.q = ko.observable(q);
    this.search = () => { const v = String(this.q() || '').trim().toUpperCase(); if (v) app.go('genealogy/' + v); };
    this.searchKey = (e) => { if (e.key === 'Enter') { this.q(e.target.rawValue || this.q()); this.search(); } };
    this.hasQuery = !!q;
    if (q) {
      const hits = MES.whereUsed(q);
      const rec = DB.inv.find(i => (i.serial || '').toUpperCase() === q.toUpperCase() || (i.lot || '').toUpperCase() === q.toUpperCase());
      const drs = DB.drs.filter(d => d.compSerial === q || d.lot === q);
      this.wuTitle = 'Where-used · ' + q;
      this.wuHint = hits.length + ' installations in ' + new Set(hits.map(h => h.top)).size + ' top-level units';
      this.recHtml = rec ? ui.kv([
        ['Part', '<span class="mes-mono">' + E(rec.partId) + '</span> ' + E(MES.part(rec.partId).name)], ['Supplier', E(MES.part(rec.partId).supplier || '—')],
        ['Received', U.fmtDT(rec.receivedAt) + ' · ' + E(rec.source || '')],
        rec.serial ? ['Status', ui.badge(rec.status) + ' ' + (rec.installedIn ? 'in ' + ui.serial(rec.installedIn) : 'at ' + E(rec.location))] : null,
        drs.length ? ['Discrepancies', drs.map(d => ui.drLink(d.id) + ' ' + ui.badge(d.status)).join(' ')] : null,
        MES.invHeld(rec) ? ['Hold', ui.badge('Hold', 'On quality hold')] : null,
      ]) : '<div class="oj-text-color-secondary">No inventory record for ' + E(q) + '.</div>';
      this.wu = ui.table([
        { h: 'Installed in', v: h => ui.serial(h.serial) + ' · OP' + h.seq }, { h: 'How', v: h => E(h.how) },
        { h: 'Top-level unit', v: h => ui.serial(h.top) + ' ' + (MES.unit(h.top) ? ui.unitState(MES.unit(h.top)) : '') },
      ], hits, { rowGo: h => 'genealogy/' + h.top });
    }
    const vehicles = DB.units.filter(u => u.itemId === 'VEH-T1').slice().reverse();
    const countSer = u => { let n = 0; const walk = x => (x.children || []).forEach(c => { n++; walk(c); }); walk(MES.tree(u.serial)); return n; };
    this.vehTitle = 'Vehicles (' + vehicles.length + ')';
    this.veh = ui.table([
      { h: 'VIN', v: u => '<b class="mes-mono">' + E(u.serial) + '</b>' }, { h: 'State', v: u => ui.unitState(u) },
      { h: 'Progress', v: u => u.status === 'Complete' ? 'Released' : 'OP' + MES.currentOp(u).seq + ' of ' + MES.routing(u.itemId).length },
      { h: 'Body', v: u => { const c = u.components.find(x => x.slot === 'Body'); return c ? '<span class="mes-mono">' + E(c.serial) + '</span>' : '—'; } },
      { h: 'Engine', v: u => { const c = u.components.find(x => x.slot === 'Engine'); return c ? '<span class="mes-mono">' + E(c.serial) + '</span>' : '—'; } },
      { h: 'Serialized parts', num: 1, v: countSer }, { h: 'DRs', num: 1, v: u => DB.drs.filter(d => d.serial === u.serial).length },
      { h: 'Released', v: u => U.fmtDT(u.completedAt) },
    ], vehicles, { rowGo: u => 'genealogy/' + u.serial });
  };
});
