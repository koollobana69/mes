/* Ridgeline MES — "My Work": what the signed-in person can act on right now, derived from their role,
   station qualifications and the live engine state. Everything else stays out of their way. */
define(['services/ui'], function (ui) {
  'use strict';
  const E = ui.E;
  const STATION_ROLES = ['Operator', 'Supervisor', 'Quality Technician'];

  function stationWork(p, out) {
    const quals = new Set(p.quals);
    let blocked = [];
    DB.units.forEach(u => {
      if (u.status === 'Complete' || u.status === 'Scrapped') return;
      const op = MES.currentOp(u);
      if (!op || !quals.has(op.station)) return;
      const o = u.ops[op.seq], held = MES.unitHeld(u.serial);
      const plan = MES.plan(u.planId), chars = MES.planChars(plan, op.seq);
      const done = chars.filter(c => ['done', 'accepted'].includes(MES.charState(u, op.seq, c).state)).length;
      const where = 'OP' + op.seq + ' ' + op.name + ' · ' + op.station;
      const href = 'station/' + op.station + '/' + u.serial;
      if (held) { blocked.push(u.serial + ' on quality hold at ' + op.station); return; }
      if (o.status === 'Active') {
        const mine = o.operator === p.id;
        out.push({ group: 'continue', urgent: true, tone: 'info', icon: 'play', order: mine ? 0 : 1,
          title: '<span class="mes-mono">' + E(u.serial) + '</span>', sub: where,
          meta: (mine ? 'You started this' : 'Started by ' + MES.userName(o.operator)) + ' · ' + U.dur(MES.now() - o.start) + ' · ' + done + ' of ' + chars.length + ' items done',
          action: { label: 'Continue', href } });
        return;
      }
      // queued: only offer it if it can actually start
      const isLast = u.opIdx === MES.routing(u.itemId).length - 1;
      if (isLast && ui.openDrs(u.serial).length) { blocked.push(u.serial + ' waiting on open discrepancy before ' + op.station); return; }
      const mat = ui.materialReady(u);
      if (!mat.ok) { blocked.push(u.serial + ' short ' + mat.short.join(', ') + ' at ' + op.station); return; }
      const busy = DB.units.some(x => x !== u && x.status === 'In Process' && !MES.unitHeld(x.serial) && MES.currentOp(x) && MES.currentOp(x).station === op.station && x.ops[MES.currentOp(x).seq].status === 'Active');
      if (busy) return; // station occupied; it will surface once the running unit completes
      out.push({ group: 'start', urgent: true, tone: 'ok', icon: 'station', order: u.launchedAt,
        title: '<span class="mes-mono">' + E(u.serial) + '</span>', sub: where, meta: 'Material at line-side · std ' + op.stdMin + ' min',
        action: { label: 'Start', act: 'start', href, data: { serial: u.serial, seq: op.seq } } });
    });
    DB.drs.filter(d => d.status === 'Rework' && d.serial).forEach(d => {
      const u = MES.unit(d.serial), op = u && MES.currentOp(u);
      if (!op || !quals.has(op.station)) return;
      out.push({ group: 'rework', urgent: true, tone: 'warn', icon: 'flag', order: d.createdAt,
        title: E(d.id) + ' · ' + E(d.title), sub: '<span class="mes-mono">' + E(d.serial) + '</span> · ' + op.station,
        meta: 'Disposition: ' + d.disposition + ' — re-inspect and record a passing result',
        action: { label: 'Re-inspect', href: 'station/' + op.station + '/' + d.serial } });
    });
    if (blocked.length) out.push({ group: 'blocked', urgent: false, tone: 'neutral', icon: 'lock', order: 0, title: blocked.length + ' unit(s) at your stations cannot proceed', sub: blocked.slice(0, 4).join(' · ') + (blocked.length > 4 ? ' …' : ''), meta: 'Quality or material will release them.', action: null });
  }

  function signatureWork(p, out) {
    DB.units.forEach(u => {
      const op = MES.currentOp(u);
      if (!op || u.status !== 'In Process' || MES.unitHeld(u.serial) || u.ops[op.seq].status !== 'Active') return;
      const plan = MES.plan(u.planId), chars = MES.planChars(plan, op.seq);
      if (chars.some(c => c.type !== 'signoff' && c.required && !['done', 'accepted'].includes(MES.charState(u, op.seq, c).state))) return;
      chars.filter(c => c.type === 'signoff' && c.meaning !== 'Performed' && !MES.sigFor(u.serial, op.seq, c.id) && MES.canSign(p, c.role)).forEach(c => {
        const performers = chars.filter(x => x.type === 'signoff' && x.meaning === 'Performed').map(x => MES.sigFor(u.serial, op.seq, x.id)).filter(Boolean).map(s => s.userId);
        if (performers.includes(p.id)) return;
        out.push({ group: 'sign', urgent: true, tone: 'info', icon: 'sig', order: u.ops[op.seq].start,
          title: E(c.name), sub: '<span class="mes-mono">' + E(u.serial) + '</span> · OP' + op.seq + ' ' + E(op.name) + ' · ' + op.station,
          meta: 'All plan items recorded · sign as ' + c.role + ' (' + c.meaning + ')', action: { label: 'Review & sign', href: 'station/' + op.station + '/' + u.serial } });
      });
    });
  }

  function qualityWork(p, out) {
    DB.drs.filter(d => d.status === 'Open').forEach(d => out.push({ group: 'mrb', urgent: true, tone: 'bad', icon: 'alert', order: d.createdAt,
      title: E(d.id) + ' · ' + E(d.title), sub: (d.serial ? '<span class="mes-mono">' + E(d.serial) + '</span>' : E((d.partId || '') + ' ' + (d.lot ? 'lot ' + d.lot : d.compSerial || ''))) + ' · ' + d.severity + (d.holdId ? ' · on hold' : ''),
      meta: 'Opened ' + U.ago(d.createdAt) + ' by ' + MES.userName(d.createdBy), action: { label: 'Disposition', href: 'dr/' + d.id } }));
    DB.drs.filter(d => d.status === 'Pending Verification').forEach(d => out.push({ group: 'verify', urgent: true, tone: 'warn', icon: 'check', order: d.createdAt,
      title: E(d.id) + ' · ' + E(d.title), sub: '<span class="mes-mono">' + E(d.serial || d.compSerial || '') + '</span> · ' + E(d.disposition || ''),
      meta: 'Rework recorded — verify and close', action: { label: 'Verify', href: 'dr/' + d.id } }));
    DB.plans.filter(pl => pl.status === 'Draft' && pl.createdBy === p.id).forEach(pl => out.push({ group: 'drafts', urgent: false, tone: 'neutral', icon: 'plan', order: pl.createdAt,
      title: E(pl.id) + ' (draft)', sub: MES.part(pl.itemId).name, meta: 'Started ' + U.ago(pl.createdAt), action: { label: 'Open draft', href: 'plan/' + pl.id } }));
  }

  function materialWork(p, out) {
    MES.replenishment().forEach(r => {
      if (!r.sources.length) { out.push({ group: 'blocked', urgent: false, tone: 'neutral', icon: 'lock', order: 0, title: 'No releasable stock for ' + r.partId, sub: 'Needed at ' + r.ls + ' (' + r.short + ' short)', meta: 'Stock is consumed or on hold.', action: null }); return; }
      out.push({ group: 'moves', urgent: true, tone: 'info', icon: 'truck', order: 0,
        title: E(r.partId) + ' → ' + E(r.ls), sub: E(MES.part(r.partId).name) + ' · need ' + r.need + ', on hand ' + r.onHand,
        meta: 'Pick from ' + [...new Set(r.sources.map(s => s.location))].join(', '), action: { label: 'Move', act: 'fulfill', data: { part: r.partId, ls: r.ls } } });
    });
  }

  const GROUPS = [
    ['continue', 'In progress at your stations', 'Pick up where the station left off.'],
    ['sign', 'Waiting for your signature', 'Every plan item is recorded; the operation needs your sign-off.'],
    ['rework', 'Rework to re-inspect', 'Quality dispositioned these for rework at your stations.'],
    ['start', 'Ready to start', 'Queued at your stations, material at line-side, no holds. Oldest first.'],
    ['mrb', 'Awaiting MRB disposition', 'Open discrepancies that need a decision.'],
    ['verify', 'Pending verification', 'Rework is done; verify and close.'],
    ['moves', 'Material to deliver', 'Line-side supermarkets short of remaining WIP demand.'],
    ['drafts', 'Your draft quality plans', ''],
    ['blocked', 'Blocked — no action needed from you', ''],
  ];

  function items(p) {
    const out = [];
    if (STATION_ROLES.includes(p.role)) stationWork(p, out);
    if (['Quality Technician', 'Quality Engineer', 'Supervisor'].includes(p.role)) signatureWork(p, out);
    if (['Quality Engineer', 'Supervisor'].includes(p.role)) qualityWork(p, out);
    if (['Material Handler', 'Supervisor'].includes(p.role)) materialWork(p, out);
    return out;
  }
  function groups(p) {
    const all = items(p);
    return GROUPS.map(([id, title, hint]) => ({ id, title, hint, items: all.filter(i => i.group === id).sort((a, b) => a.order - b.order) })).filter(g => g.items.length);
  }
  return { items, groups };
});
