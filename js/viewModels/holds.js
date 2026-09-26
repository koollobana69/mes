/* Quality holds: active and released holds on units, serials and lots. */
define(['knockout', 'services/ui'], function (ko, ui) {
  'use strict';
  const E = ui.E;
  return function HoldsVM(params) {
    const app = params.app; app.setVM(this);
    const act = DB.holds.filter(h => h.status === 'Active'), rel = DB.holds.filter(h => h.status !== 'Active').reverse();
    const tgt = h => h.type === 'Unit' ? ui.serial(h.target) : h.type === 'Lot' ? '<span class="mes-mono">' + E(h.partId) + '</span> lot ' + ui.link('genealogy/' + h.target.split('|')[1], '<span class="mes-mono">' + E(h.target.split('|')[1]) + '</span>') : '<span class="mes-mono">' + E((h.partId || '') + ' ' + h.target) + '</span>';
    const cols = [
      { h: 'Hold', v: h => '<b class="mes-mono">' + E(h.id) + '</b>' }, { h: 'Type', v: h => '<span class="mes-tag">' + E(h.type) + '</span>' }, { h: 'Target', v: tgt },
      { h: 'Reason', v: h => E(h.reason) }, { h: 'Discrepancy', v: h => ui.drLink(h.drId) + (h.drId && MES.dr(h.drId) ? ' ' + ui.badge(MES.dr(h.drId).status) : '') },
      { h: 'Placed', v: h => ui.dt(h.at) + '<div class="oj-typography-body-xs oj-text-color-secondary">' + E(MES.userName(h.placedBy)) + '</div>' },
    ];
    this.activeTitle = 'Active holds (' + act.length + ')';
    this.active = ui.table(cols.concat([{ h: '', v: h => ui.btn('Release', 'release', { id: h.id }) }]), act, { empty: 'No active holds.' });
    this.released = ui.table(cols.concat([{ h: 'Released', v: h => ui.dt(h.releasedAt) + '<div class="oj-typography-body-xs oj-text-color-secondary">' + E(MES.userName(h.releasedBy)) + ' · ' + E(h.note || '') + '</div>' }, { h: 'Held for', v: h => U.dur(h.releasedAt - h.at) }]), rel);
    const n = this.nh = { type: ko.observable('Unit'), target: ko.observable(''), reason: ko.observable(''), error: ko.observable('') };
    this.typeDP = ui.optionsDP(['Unit', 'Serial', 'Lot']);
    this.openNew = () => {
      const p = MES.currentUser();
      if (!['Quality Engineer', 'Quality Technician', 'Supervisor'].includes(p.role)) return app.toast('Holds are placed by Quality or a Supervisor. Switch user.', 'warn');
      n.target(''); n.reason(''); n.error(''); document.getElementById('holdDialog').open();
    };
    this.closeNew = () => document.getElementById('holdDialog').close();
    this.place = () => {
      const type = n.type(), t = String(n.target() || '').trim().toUpperCase(), reason = String(n.reason() || '').trim();
      n.error('');
      if (!reason) return n.error('Enter a reason.');
      let target = t, partId = null;
      if (type === 'Unit' && !MES.unit(t)) return n.error('No unit ' + t + '.');
      if (type === 'Serial') { const r = DB.inv.find(i => (i.serial || '').toUpperCase() === t); if (!r) return n.error('No component serial ' + t + '.'); partId = r.partId; target = r.serial; }
      if (type === 'Lot') { const r = DB.inv.find(i => (i.lot || '').toUpperCase() === t); if (!r) return n.error('No lot ' + t + '.'); partId = r.partId; target = r.partId + '|' + r.lot; }
      if (MES.activeHolds(type, target).length) return n.error(t + ' is already on hold.');
      const r = MES.placeHold({ type, target, partId, reason, by: DB.currentUser });
      document.getElementById('holdDialog').close();
      app.commit(r, r.hold.id + ' placed', 'warn');
    };
    this.actions = {
      release: el => {
        const h = DB.holds.find(x => x.id === el.getAttribute('data-id'));
        if (h.drId && MES.dr(h.drId) && MES.dr(h.drId).status === 'Open') return app.toast(h.drId + ' needs an MRB disposition first. Dispositioning it releases the hold.', 'warn');
        app.openSign({ title: 'Release ' + h.id, role: 'Quality Engineer', meaning: 'Hold released', confirm: 'Release hold', noteLabel: 'Release justification', summary: '<p>' + E(h.type) + ' <b class="mes-mono">' + E(h.target) + '</b> — ' + E(h.reason) + '</p>' },
          (signer, pin, note) => { const r = MES.releaseHold(h.id, signer, pin, note); if (r.ok) app.commit(r, h.id + ' released'); return r; });
      },
    };
  };
});
