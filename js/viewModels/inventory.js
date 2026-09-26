/* Inventory by location with receiving and move dialogs. */
define(['knockout', 'services/ui'], function (ko, ui) {
  'use strict';
  const E = ui.E;
  return function InventoryVM(params) {
    const app = params.app; app.setVM(this);
    const st = app.st('inv', { loc: '', part: '', status: 'live', q: '' });
    this.locTiles = DB.locations.map(loc => {
      const recs = DB.inv.filter(i => i.location === loc.id && i.qty > 1e-9 && ['Available', 'Hold'].includes(i.status));
      const held = recs.filter(i => MES.invHeld(i) || i.status === 'Hold').length;
      return { id: loc.id, cls: 'mes-stn' + (held ? ' held' : ''), op: loc.id + ' · ' + loc.type, name: loc.name, q: recs.length + ' records' + (held ? ' · ' + held + ' held' : '') };
    });
    this.locDP = ui.optionsDP([{ value: '', label: 'All locations' }].concat(DB.locations.map(x => ({ value: x.id, label: x.id + ' · ' + x.name }))));
    this.partDP = ui.optionsDP([{ value: '', label: 'All parts' }].concat(DB.parts.map(p => ({ value: p.id, label: p.id + ' · ' + p.name }))));
    this.statusDP = ui.optionsDP([{ value: 'live', label: 'On hand (available + held)' }, { value: 'all', label: 'Everything' }, 'Available', 'Hold', 'Consumed', 'Scrap', 'RTV']);
    this.loc = ko.observable(st.loc); this.part = ko.observable(st.part); this.status = ko.observable(st.status); this.q = ko.observable(st.q);
    this.t = ko.pureComputed(() => {
      Object.assign(st, { loc: this.loc(), part: this.part(), status: this.status(), q: this.q() });
      let l = DB.inv.filter(i => i.qty > 1e-9 || i.serial);
      if (st.status === 'live') l = l.filter(i => ['Available', 'Hold'].includes(i.status)); else if (st.status && st.status !== 'all') l = l.filter(i => i.status === st.status);
      if (st.loc) l = l.filter(i => i.location === st.loc);
      if (st.part) l = l.filter(i => i.partId === st.part);
      if (st.q) { const q = st.q.toUpperCase(); l = l.filter(i => [i.partId, i.serial, i.lot, i.location, i.installedIn].join(' ').toUpperCase().includes(q)); }
      l.sort((a, b) => a.location.localeCompare(b.location) || a.partId.localeCompare(b.partId));
      const t = ui.table([
        { h: 'Part', v: i => '<span class="mes-mono">' + E(i.partId) + '</span><div class="oj-typography-body-xs oj-text-color-secondary">' + E(MES.part(i.partId).name) + '</div>' },
        { h: 'Serial / lot', v: i => i.serial ? '<span class="mes-mono">' + E(i.serial) + '</span>' : '<span class="mes-mono">lot ' + E(i.lot) + '</span>' },
        { h: 'Qty', num: 1, v: i => U.num(i.qty, i.serial ? 0 : (i.qty % 1 ? 1 : 0)) + ' ' + E(MES.part(i.partId).uom) },
        { h: 'Location', v: i => MES.loc(i.location) ? '<b>' + E(i.location) + '</b><div class="oj-typography-body-xs oj-text-color-secondary">' + E(MES.loc(i.location).name) + '</div>' : (MES.unit(i.location) ? 'in ' + ui.serial(i.location) : E(i.location)) },
        { h: 'Status', v: i => (MES.invHeld(i) || i.status === 'Hold') ? ui.badge('Hold') : ui.badge(i.status) },
        { h: 'Received', v: i => U.fmtD(i.receivedAt) + '<div class="oj-typography-body-xs oj-text-color-secondary">' + E(i.source || '') + '</div>' },
        { h: '', v: i => ['Available', 'Hold'].includes(i.status) && MES.loc(i.location) ? ui.btn('Move', 'move', { id: i.id }) : (i.serial && i.status === 'Consumed' ? ui.link('genealogy/' + i.serial, 'Trace') : '') },
      ], l.slice(0, 400));
      t.note = l.length > 400 ? 'Showing 400 of ' + l.length + '. Filter to narrow.' : l.length + ' records';
      return t;
    });
    this.actions = {
      invloc: el => this.loc(el.getAttribute('data-id')),
      move: el => {
        const r = DB.inv.find(i => i.id === el.getAttribute('data-id')), part = MES.part(r.partId);
        const held = MES.invHeld(r) || r.status === 'Hold';
        m.rec = r; m.title('Move ' + (r.serial || 'lot ' + r.lot)); m.info(part.id + ' ' + part.name + ' · at ' + r.location + (held ? ' · on hold: quarantine moves only' : ''));
        m.isSerial(!!r.serial); m.qty(String(r.qty)); m.ref(''); m.error('');
        m.destDP(ui.optionsDP(DB.locations.filter(l => l.id !== r.location && (!held || l.type === 'Quarantine')).map(l => ({ value: l.id, label: l.id + ' · ' + l.name }))));
        m.to(null);
        document.getElementById('moveDialog').open();
      },
    };
    const m = this.mv = { rec: null, title: ko.observable(''), info: ko.observable(''), isSerial: ko.observable(false), qty: ko.observable(''), to: ko.observable(null), ref: ko.observable(''), error: ko.observable(''), destDP: ko.observable(ui.optionsDP([])) };
    m.close = () => document.getElementById('moveDialog').close();
    m.post = () => {
      if (!m.to()) return m.error('Choose a destination.');
      const r = MES.transfer(m.rec.id, m.isSerial() ? 1 : Number(m.qty()), m.to(), DB.currentUser, m.ref());
      if (!r.ok) return m.error(r.msg);
      document.getElementById('moveDialog').close(); app.commit(r, 'Moved to ' + m.to());
    };
    /* receiving */
    const bought = DB.parts.filter(p => p.type === 'Purchased');
    const rc = this.rc = { part: ko.observable('TC-4401'), to: ko.observable('B40-RCV'), ref: ko.observable(''), serials: ko.observable(''), lot: ko.observable(''), qty: ko.observable(''), error: ko.observable('') };
    this.boughtDP = ui.optionsDP(bought.map(p => ({ value: p.id, label: p.id + ' · ' + p.name })));
    this.rcvLocDP = ui.optionsDP(DB.locations.filter(l => l.building === 'B40').map(l => ({ value: l.id, label: l.id + ' · ' + l.name })));
    rc.isSerial = ko.pureComputed(() => { const p = MES.part(rc.part()); return p && p.tracking === 'Serial'; });
    rc.hint = ko.pureComputed(() => { const p = MES.part(rc.part()); if (!p) return ''; return 'Supplier: ' + (p.supplier || '—') + ' · tracking: ' + p.tracking + (p.pattern ? ' · serial mask ' + p.pattern : ''); });
    this.openReceive = () => {
      const p = MES.currentUser();
      if (!['Material Handler', 'Supervisor', 'Quality Engineer'].includes(p.role)) return app.toast('Receiving is posted by material handlers. Switch user to Rosa Jimenez or Tom Becker.', 'warn');
      rc.error(''); rc.serials(''); rc.lot(''); rc.qty(''); document.getElementById('rcvDialog').open();
    };
    rc.close = () => document.getElementById('rcvDialog').close();
    rc.post = () => {
      const part = MES.part(rc.part());
      const serials = part.tracking === 'Serial' ? String(rc.serials() || '').split(/[\s,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean) : null;
      const r = MES.receive({ partId: part.id, lot: String(rc.lot() || '').trim() || null, qty: Number(rc.qty()), serials, to: rc.to(), by: DB.currentUser, supplierRef: rc.ref() });
      if (!r.ok) return rc.error(r.msg);
      document.getElementById('rcvDialog').close();
      app.commit(r, 'Received ' + (serials ? serials.length + ' × ' : rc.qty() + ' ' + part.uom + ' ') + part.id);
    };
  };
});
