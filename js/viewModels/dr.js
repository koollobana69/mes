/* Discrepancy record: details, readings, where-used, MRB disposition, rework, verification, history. */
define(['knockout', 'services/ui'], function (ko, ui) {
  'use strict';
  const E = ui.E;
  return function DrVM(params) {
    const app = params.app; app.setVM(this);
    const d = MES.dr(params.args[0]);
    this.found = !!d; if (!d) return;
    const u = d.serial && MES.unit(d.serial);
    const plan = u && MES.plan(u.planId), ch = plan && d.charId && MES.findChar(plan, d.charId);
    const op = u && d.seq && MES.op(u.itemId, d.seq);
    const hold = d.holdId && DB.holds.find(h => h.id === d.holdId);
    const quick = ['Use As Is', 'Scrap', 'Return to Vendor'].includes(d.disposition);
    this.id = d.id; this.title = d.title;
    this.eyebrow = d.id + ' · ' + d.source;
    this.chipsHtml = ui.badge(d.status) + ' ' + ui.sev(d.severity);
    const flow = quick ? ['Open', 'MRB disposition', 'Closed'] : ['Open', 'MRB disposition', 'Rework / repair', 'Verification', 'Closed'];
    const stage = d.status === 'Open' ? 0 : d.status === 'Rework' ? 2 : d.status === 'Pending Verification' ? 3 : flow.length - 1;
    this.steps = flow.map((l, i) => ({ id: 's' + i, label: l, visited: i < stage || d.status === 'Closed', messageType: d.status === 'Cancelled' ? 'warning' : (i < stage || (i === stage && d.status === 'Closed')) ? 'confirmation' : undefined }));
    this.selectedStep = 's' + stage;
    this.detailsHtml = ui.kv([
      ['Severity', ui.sev(d.severity)], ['Category · source', E(d.category) + ' · ' + E(d.source)],
      u ? ['Unit', ui.serial(u.serial) + ' · ' + E(MES.part(u.itemId).name) + ' · ' + ui.unitState(u)] : null,
      op ? ['Operation', 'OP' + op.seq + ' ' + E(op.name) + ' @ ' + ui.link('station/' + op.station + '/' + u.serial, E(op.station))] : null,
      ch ? ['Plan item', E(ch.code) + ' ' + E(ch.name) + ' · ' + ui.link('plan/' + plan.id, E(plan.id))] : null,
      d.spec ? ['Specification', '<span class="mes-mono">' + E(d.spec) + '</span>'] : null,
      d.measured !== null && d.measured !== undefined ? ['Measured', '<b class="mes-mono oj-text-color-danger">' + E(d.measured) + ' ' + E(ch ? ch.unit : '') + '</b> ' + (ch ? ui.gauge(ch, d.measured) : '')] : null,
      d.partId ? ['Part', '<span class="mes-mono">' + E(d.partId) + '</span> ' + E(MES.part(d.partId).name) + ' · ' + E(MES.part(d.partId).supplier || '')] : null,
      d.compSerial ? ['Component serial', '<span class="mes-mono">' + E(d.compSerial) + '</span> · ' + E((DB.inv.find(i => i.serial === d.compSerial) || {}).status || '')] : null,
      d.lot ? ['Lot', ui.link('genealogy/' + d.lot, '<span class="mes-mono">' + E(d.lot) + '</span>')] : null,
      ['Description', E(d.description) || '—'],
      ['Opened', U.fmtDT(d.createdAt) + ' by ' + E(MES.userName(d.createdBy))],
      hold ? ['Quality hold', E(hold.id) + ' ' + ui.badge(hold.status === 'Active' ? 'Hold' : 'Released', hold.status)] : null,
      d.disposition ? ['Disposition', '<b>' + E(d.disposition) + '</b> by ' + E(MES.userName(d.dispositionBy)) + ' · ' + U.fmtDT(d.dispositionAt)] : null,
      d.rootCause ? ['Root cause', E(d.rootCause)] : null, d.containment ? ['Containment', E(d.containment)] : null, d.correctiveAction ? ['Corrective action', E(d.correctiveAction)] : null,
      d.closedAt ? [d.status === 'Cancelled' ? 'Cancelled' : 'Closed', U.fmtDT(d.closedAt) + ' by ' + E(MES.userName(d.closedBy)) + ' · cycle time ' + U.dur(d.closedAt - d.createdAt)] : null,
    ]);
    this.hasReadings = !!(u && ch && ch.type !== 'signoff');
    if (this.hasReadings) {
      this.readingsTitle = 'Readings for ' + ch.code + ' ' + ch.name;
      this.readings = ui.table([
        { h: 'When', v: r => ui.dt(r.at) },
        { h: 'Value', v: r => '<span class="mes-mono">' + E(r.type === 'measure' || r.type === 'calc' ? U.num(r.value, ch.dec) + ' ' + ch.unit : r.value) + '</span>' },
        { h: 'Result', v: r => ui.badge(r.result) }, { h: 'By', v: r => E(MES.userName(r.by)) }, { h: 'Note', v: r => E(r.note) },
      ], MES.results(u.serial, d.seq, ch.id));
    }
    this.hasWhereUsed = !!d.lot;
    if (d.lot) {
      const hits = MES.whereUsed(d.lot);
      this.wuTitle = 'Where-used · lot ' + d.lot;
      this.wuHint = hits.length + ' installations in ' + new Set(hits.map(h => h.top)).size + ' top-level units · remaining stock ' + (DB.inv.filter(i => i.lot === d.lot && i.qty > 0).map(i => i.qty + ' at ' + i.location).join(', ') || 'none');
      this.wu = ui.table([
        { h: 'Installed in', v: h => ui.serial(h.serial) + ' · OP' + h.seq }, { h: 'What', v: h => E(h.how) },
        { h: 'Top-level unit', v: h => ui.serial(h.top) + ' ' + (MES.unit(h.top) ? ui.unitState(MES.unit(h.top)) : '') },
        { h: '', v: h => ui.link('genealogy/' + h.top, 'Genealogy') },
      ], hits);
    }
    this.historyHtml = '<ul class="mes-tl">' + d.history.slice().reverse().map(h => '<li><div class="w">' + U.fmtDT(h.at) + ' · ' + E(MES.userName(h.by)) + '</div><b>' + E(h.action) + '</b>' + (h.note ? '<div class="oj-typography-body-sm">' + E(h.note) + '</div>' : '') + '</li>').join('') + '</ul>';
    const sigs = DB.sigs.filter(s => s.ctxType === 'Discrepancy' && s.ctx === d.id);
    this.sigsHtml = sigs.map(ui.sigCard).join('');
    this.hasSigs = sigs.length > 0;

    this.isOpen = d.status === 'Open'; this.isRework = d.status === 'Rework'; this.isPV = d.status === 'Pending Verification';
    this.notQE = MES.currentUser().role !== 'Quality Engineer';
    this.dispDP = ui.optionsDP(MES.DISPOSITIONS.filter(x => x !== 'Return to Vendor' || d.partId));
    this.f = { disposition: ko.observable(null), rootCause: ko.observable(''), containment: ko.observable(''), correctiveAction: ko.observable(''), rework: ko.observable(''), note: ko.observable('') };
    this.reworkHint = ch && op ? 'Re-inspect ' + ch.code + ' ' + ch.name + ' at ' + op.station + '. A passing reading moves this DR to verification automatically.' : 'Perform the ' + String(d.disposition || '').toLowerCase() + ', then record completion.';
    this.reworkHref = op ? '#/station/' + op.station + '/' + u.serial : null;

    this.signDisposition = () => {
      const f = { disposition: this.f.disposition(), rootCause: this.f.rootCause(), containment: this.f.containment(), correctiveAction: this.f.correctiveAction() };
      if (!f.disposition) return app.toast('Choose a disposition.', 'bad');
      if (!f.rootCause || f.rootCause.trim().length < 5) return app.toast('Enter the root cause before signing.', 'bad');
      app.openSign({ title: 'Sign MRB disposition · ' + d.id, role: 'Quality Engineer', meaning: 'MRB disposition: ' + f.disposition, confirm: 'Sign disposition', summary: '<p>Disposition <b>' + E(f.disposition) + '</b> for ' + E(d.id) + ': ' + E(d.title) + '</p>' },
        (signer, pin) => { const r = MES.dispositionDR(d.id, f, signer, pin); if (r.ok) app.commit(r, d.id + ' dispositioned: ' + f.disposition); return r; });
    };
    this.cancelDr = () => {
      const note = String(this.f.note() || '').trim();
      if (note.length < 5) return app.toast('Enter the reason in the note field, then cancel.', 'bad');
      app.openConfirm({ title: 'Cancel ' + d.id + '?', body: '<p>Reason: ' + E(note) + '</p>', okLabel: 'Cancel discrepancy', cancelLabel: 'Back' }, () => app.commit(MES.cancelDR(d.id, note, DB.currentUser), d.id + ' cancelled'));
    };
    this.reworkDone = () => app.commit(MES.reworkDoneDR(d.id, this.f.rework(), DB.currentUser), 'Rework recorded; awaiting verification');
    this.verify = () => app.openSign({ title: 'Verify & close ' + d.id, role: 'Quality Engineer', meaning: 'Verified effective & closed', confirm: 'Verify & close', noteLabel: 'Verification note (evidence reviewed)' },
      (signer, pin, note) => { const r = MES.verifyCloseDR(d.id, note, signer, pin); if (r.ok) app.commit(r, d.id + ' closed'); return r; });
    this.addNote = () => app.commit(MES.addDRNote(d.id, String(this.f.note() || '').trim(), DB.currentUser), 'Note added');
  };
});
