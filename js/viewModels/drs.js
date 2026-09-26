/* Discrepancy list with status/severity/source filters and manual DR creation. */
define(['knockout', 'services/ui'], function (ko, ui) {
  'use strict';
  const E = ui.E;
  return function DrsVM(params) {
    const app = params.app; app.setVM(this);
    this.rowAction = ui.rowAction(app);
    const f = app.st('drs', { status: 'active', sev: '', src: '', q: '' });
    const cnt = s => DB.drs.filter(d => d.status === s).length;
    this.kpis = [
      { icon: ui.icon('alert'), tone: 'bad', lbl: 'Awaiting MRB', val: cnt('Open'), foot: 'Open, no disposition', alert: cnt('Open') > 0 },
      { icon: ui.icon('flag'), tone: 'warn', lbl: 'In rework / repair', val: cnt('Rework'), foot: 'Dispositioned, work pending' },
      { icon: ui.icon('sig'), tone: 'info', lbl: 'Pending verification', val: cnt('Pending Verification'), foot: 'Awaiting QE close-out' },
      { icon: ui.icon('check'), tone: 'ok', lbl: 'Closed', val: cnt('Closed'), foot: cnt('Cancelled') + ' cancelled' },
    ];
    this.statusDP = ui.optionsDP([{ value: 'active', label: 'Open items' }, { value: 'all', label: 'All' }, { value: 'closed', label: 'Closed / cancelled' }]);
    this.sevDP = ui.optionsDP([{ value: '*', label: 'All severities' }, 'Minor', 'Major', 'Critical']);
    this.srcDP = ui.optionsDP([{ value: '*', label: 'All sources' }].concat([...new Set(DB.drs.map(d => d.source))]));
    this.status = ko.observable(f.status); this.sev = ko.observable(f.sev); this.sevSel = ui.allSel(this.sev); this.src = ko.observable(f.src); this.srcSel = ui.allSel(this.src); this.q = ko.observable(f.q);
    const filtered = () => {
      let l = DB.drs.slice().reverse();
      const s = this.status();
      if (s === 'active') l = l.filter(d => MES.DR_OPEN.includes(d.status)); else if (s === 'closed') l = l.filter(d => d.status === 'Closed' || d.status === 'Cancelled');
      if (this.sev()) l = l.filter(d => d.severity === this.sev());
      if (this.src()) l = l.filter(d => d.source === this.src());
      if (this.q()) { const q = this.q().toUpperCase(); l = l.filter(d => [d.id, d.title, d.serial, d.compSerial, d.lot, d.partId].join(' ').toUpperCase().includes(q)); }
      Object.assign(f, { status: this.status(), sev: this.sev(), src: this.src(), q: this.q() });
      return l;
    };
    this.t = ko.pureComputed(() => ui.table([
      { h: 'ID', v: d => '<b class="mes-mono">' + E(d.id) + '</b>' },
      { h: 'Status', v: d => ui.badge(d.status) },
      { h: 'Sev', v: d => ui.sev(d.severity) },
      { h: 'Discrepancy', v: d => '<b>' + E(d.title) + '</b><div class="oj-typography-body-xs oj-text-color-secondary">' + E(d.source) + ' · ' + E(d.category) + '</div>' },
      { h: 'Unit / material', v: d => d.serial ? '<span class="mes-mono">' + E(d.serial) + '</span>' + (d.seq ? '<div class="oj-typography-body-xs oj-text-color-secondary">OP' + d.seq + ' ' + E((MES.op(d.itemId, d.seq) || {}).name || '') + '</div>' : '') : '<span class="mes-mono">' + E(d.partId || '') + '</span><div class="oj-typography-body-xs oj-text-color-secondary mes-mono">' + E(d.compSerial || (d.lot ? 'lot ' + d.lot : '')) + '</div>' },
      { h: 'Disposition', v: d => d.disposition ? E(d.disposition) : '—' },
      { h: 'Opened', v: d => ui.dt(d.createdAt) + '<div class="oj-typography-body-xs oj-text-color-secondary">' + E(MES.userName(d.createdBy)) + '</div>' },
      { h: 'Age', v: d => ui.nw(d.closedAt ? U.dur(d.closedAt - d.createdAt) : U.ago(d.createdAt).replace(' ago', '')) },
    ], filtered(), { rowGo: d => 'dr/' + d.id }));
    this.countText = ko.pureComputed(() => this.t().count + ' discrepancies');

    /* new DR dialog */
    const n = this.nd = { target: ko.observable('unit'), ref: ko.observable(''), sev: ko.observable('Minor'), cat: ko.observable('Workmanship'), src: ko.observable('Manual'), title: ko.observable(''), desc: ko.observable(''), error: ko.observable('') };
    this.targetDP = ui.optionsDP([{ value: 'unit', label: 'Production unit (VIN / serial)' }, { value: 'comp', label: 'Purchased component serial' }, { value: 'lot', label: 'Material lot' }]);
    this.sev3DP = ui.optionsDP(['Minor', 'Major', 'Critical']);
    this.catDP = ui.optionsDP(['Workmanship', 'Cosmetic', 'Dimensional', 'Torque', 'Leak', 'Electrical', 'Wrong Part', 'Damage', 'Supplier', 'Documentation']);
    this.nsrcDP = ui.optionsDP(['Manual', 'Audit', 'Receiving Inspection', 'Supplier Notification', 'Customer / Field']);
    this.openNew = () => { n.ref(''); n.title(''); n.desc(''); n.error(''); document.getElementById('newDrDialog').open(); };
    this.closeNew = () => document.getElementById('newDrDialog').close();
    this.createNew = () => {
      const ref = String(n.ref() || '').trim().toUpperCase(); n.error('');
      if (!String(n.title() || '').trim()) return n.error('Enter a title.');
      const o = { by: DB.currentUser, source: n.src(), severity: n.sev(), category: n.cat(), title: n.title(), description: n.desc() };
      if (n.target() === 'unit') { const u = MES.unit(ref); if (!u) return n.error('No unit with serial/VIN ' + ref + '.'); Object.assign(o, { serial: u.serial, itemId: u.itemId, seq: u.status === 'Complete' ? null : MES.currentOp(u).seq }); }
      if (n.target() === 'comp') { const r = DB.inv.find(i => (i.serial || '').toUpperCase() === ref); if (!r) return n.error('No component serial ' + ref + ' in inventory.'); Object.assign(o, { compSerial: r.serial, partId: r.partId }); }
      if (n.target() === 'lot') { const r = DB.inv.find(i => (i.lot || '').toUpperCase() === ref); if (!r) return n.error('No lot ' + ref + ' in inventory.'); Object.assign(o, { lot: r.lot, partId: r.partId }); }
      const r = MES.createDR(o);
      document.getElementById('newDrDialog').close();
      MES.save(); app.toast(r.dr.id + ' opened', 'warn'); app.go('dr/' + r.dr.id);
    };
  };
});
