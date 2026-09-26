/* Plant dashboard: KPIs, line board, output and discrepancy charts, attention list, activity feed. */
define(['knockout', 'services/ui'], function (ko, ui) {
  'use strict';
  return function DashboardVM(params) {
    const app = params.app; app.setVM(this);
    const now = MES.now(), today = U.dayKey(now);
    const wip = DB.units.filter(u => u.status !== 'Complete' && u.status !== 'Scrapped');
    const byItem = id => wip.filter(u => u.itemId === id).length;
    const doneToday = id => DB.units.filter(u => u.itemId === id && u.completedAt && U.dayKey(u.completedAt) === today).length;
    const fpy = MES.fpy('VEH-T1');
    const openDr = DB.drs.filter(d => MES.DR_OPEN.includes(d.status));
    const holds = MES.activeHolds();
    const wk = DB.tests.filter(t => t.completedAt > now - 7 * 24 * 3600e3);
    const fpt = wk.length ? Math.round(wk.filter(t => t.firstPass).length / wk.length * 100) : 0;
    const bigDr = openDr.filter(d => d.severity !== 'Minor').length;

    this.plant = DB.company.plant + ' · ' + DB.company.product + ' program';
    this.kpis = [
      { lbl: 'Units in WIP', val: String(wip.length), foot: byItem('BIW-T1') + ' bodies · ' + byItem('ENG-24T') + ' engines · ' + byItem('VEH-T1') + ' vehicles' },
      { lbl: 'Vehicles released today', val: String(doneToday('VEH-T1')), foot: doneToday('BIW-T1') + ' bodies · ' + doneToday('ENG-24T') + ' engines completed' },
      { lbl: 'Vehicle first-pass yield', val: fpy ? Math.round(fpy.pct) + '%' : '—', foot: fpy ? fpy.clean + ' of ' + fpy.total + ' built with zero discrepancies' : 'No completed vehicles' },
      { lbl: 'Open discrepancies', val: String(openDr.length), foot: bigDr + ' major/critical · ' + openDr.filter(d => d.status === 'Open').length + ' awaiting MRB', alert: bigDr > 0 },
      { lbl: 'Active quality holds', val: String(holds.length), foot: holds.map(h => h.type).join(', ') || 'None', alert: holds.length > 0 },
      { lbl: 'Test first-pass (7 days)', val: fpt + '%', foot: wk.length + ' test records' },
    ];

    this.lines = DB.jobs.map(job => {
      const us = DB.units.filter(u => u.jobId === job.id);
      const done = us.filter(u => u.status === 'Complete').length, w = us.length - done;
      return {
        id: job.id, title: MES.part(job.itemId).name, building: MES.building(job.building).name,
        summary: done + ' done · ' + w + ' WIP · ' + job.qty + ' ordered',
        doneW: (done / job.qty * 100) + '%', wipW: (w / job.qty * 100) + '%',
        zones: [],
        tiles: MES.routing(job.itemId).map(o => {
          const at = ui.stationUnits(o.station);
          const active = at.find(u => u.ops[o.seq].status === 'Active' && !MES.unitHeld(u.serial));
          const held = at.filter(u => MES.unitHeld(u.serial));
          const queued = at.filter(u => u.ops[o.seq].status === 'Pending' && !MES.unitHeld(u.serial));
          return {
            href: '#/station/' + o.station, cls: 'mes-stn ' + (held.length ? 'held' : active ? 'active' : ''),
            op: 'OP' + o.seq + ' · ' + o.station, name: o.name,
            unit: active ? '▶ ' + ui.shortSerial(active.serial) : held.length ? '⏸ ' + ui.shortSerial(held[0].serial) + ' HOLD' : 'idle',
            queue: queued.length ? queued.length + ' queued' : '',
            zone: MES.station(o.station).wc,
            tip: o.name + ' @ ' + o.station + (active ? ' · running ' + active.serial + ' (' + MES.userName(active.ops[o.seq].operator) + ')' : ' · idle') + (queued.length ? ' · queued: ' + queued.map(u => u.serial).join(', ') : ''),
          };
        }),
      };
    });

    // group long routings by zone so 25+ operations stay readable
    this.lines.forEach(l => {
      const zs = [...new Set(l.tiles.map(t => t.zone))];
      if (l.tiles.length <= 12) { l.zones = [{ zone: '', tiles: l.tiles }]; return; }
      l.zones = zs.map(z => ({ zone: zs.length > 1 ? z + ' · ' + l.tiles.filter(t => t.zone === z).length + ' ops' : '', tiles: l.tiles.filter(t => t.zone === z) }));
    });

    // completed units per day, grouped bar chart
    const days = [];
    for (let i = 9; i >= 0; i--) { const d = new Date(now - i * 24 * 3600e3); days.push({ k: U.dayKey(d.getTime()), l: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }); }
    const series = [['BIW-T1', 'Bodies', 'var(--mes-series-1)', '#2a78d6'], ['ENG-24T', 'Engines', '', '#eb6834'], ['VEH-T1', 'Vehicles', '', '#1baf7a']];
    const items = [];
    series.forEach(([id, name, , color]) => days.forEach(d => items.push({ id: id + d.k, series: name, group: d.l, value: DB.units.filter(u => u.itemId === id && u.completedAt && U.dayKey(u.completedAt) === d.k).length, color })));
    this.outputDP = ui.adp(items, 'id');

    const cats = {};
    DB.drs.filter(d => d.status !== 'Cancelled').forEach(d => { cats[d.category] = (cats[d.category] || 0) + 1; });
    this.paretoDP = ui.adp(Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ id: k, group: k, value: v })), 'id');
    this.fpyValue = fpy ? Math.round(fpy.pct) : 0;
    this.fptValue = fpt;

    const attn = [];
    openDr.sort((a, b) => (a.status === 'Open' ? 0 : 1) - (b.status === 'Open' ? 0 : 1)).forEach(d => attn.push('<li><span class="ic ' + (d.status === 'Open' ? 'bad' : 'warn') + '">' + ui.icon('alert') + '</span><div class="tx"><b>' + ui.drLink(d.id) + ' · ' + ui.E(d.title) + '</b>' + ui.E(d.status) + ' · ' + ui.E(d.serial || (d.lot ? 'Lot ' + d.lot : d.compSerial || '')) + ' · opened ' + U.ago(d.createdAt) + '</div>' + ui.sev(d.severity) + '</li>'));
    holds.forEach(h => attn.push('<li><span class="ic bad">' + ui.icon('lock') + '</span><div class="tx"><b>' + ui.E(h.id) + ' · ' + ui.E(h.type) + ' ' + ui.E(h.target.replace('|', ' lot ')) + '</b>' + ui.E(h.reason) + '</div>' + ui.link('holds', 'View') + '</li>'));
    MES.replenishment().forEach(r => attn.push('<li><span class="ic info">' + ui.icon('truck') + '</span><div class="tx"><b>Replenish ' + ui.E(r.partId) + ' → ' + ui.E(r.ls) + '</b>Need ' + r.need + ', on hand ' + r.onHand + '</div>' + ui.link('dispatch', 'Dispatch') + '</li>'));
    this.attnCount = attn.length + ' items';
    this.attnHtml = attn.length ? '<ul class="mes-attn">' + attn.join('') + '</ul>' : '<div class="mes-empty">Nothing needs attention.</div>';

    const dotFor = a => /FAIL|rejected|hold placed|opened/i.test(a) ? 'bad' : /released|closed|PASS|completed/i.test(a) ? 'ok' : /Disposition|Rework/i.test(a) ? 'warn' : 'info';
    this.feedHtml = '<ul class="mes-feed">' + DB.audit.slice(-10).reverse().map(a => '<li><span class="when">' + U.fmtT(a.at) + '</span><span class="dot ' + dotFor(a.action) + '"></span><div><b>' + ui.E(a.action) + '</b> · ' + ui.E(a.ref) + (a.detail ? ' — <span class="oj-text-color-secondary">' + ui.E(a.detail) + '</span>' : '') + '<div class="oj-typography-body-xs oj-text-color-secondary">' + ui.E(MES.userName(a.by)) + ' · ' + U.ago(a.at) + '</div></div></li>').join('') + '</ul>';
    this.openStation = () => app.go('station');
  };
});
