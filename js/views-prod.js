/* Ridgeline MES — production views: dashboard, jobs, dispatch, station terminal. */
'use strict';

const P = {
  itemShort: { 'BIW-T1': 'Body', 'ENG-24T': 'Engine', 'VEH-T1': 'Vehicle' },
  stationUnits(stId) {
    return DB.units.filter(u => u.status !== 'Complete' && u.status !== 'Scrapped' && MES.currentOp(u) && MES.currentOp(u).station === stId)
      .sort((a, b) => {
        const ra = a.ops[MES.currentOp(a).seq].status === 'Active' ? 0 : 1, rb = b.ops[MES.currentOp(b).seq].status === 'Active' ? 0 : 1;
        return ra - rb || a.launchedAt - b.launchedAt;
      });
  },
  shortSerial(s) { return s.length === 17 ? '…' + s.slice(-6) : s.replace(/^(BT1|E24T)-\d{6}-/, '$1-'); },
  openDrs(serial) { return DB.drs.filter(d => d.serial === serial && MES.DR_OPEN.includes(d.status)); },
  materialReady(u) {
    const op = MES.currentOp(u); if (!op) return { ok: true, short: [] };
    const ls = MES.station(op.station).building + '-LS', short = [];
    const plan = MES.plan(u.planId);
    (DB.boms[u.itemId] || []).filter(b => b.op === op.seq).forEach(b => {
      const part = MES.part(b.partId);
      if (part.tracking === 'Serial') {
        const ch = MES.planChars(plan, op.seq).find(c => c.type === 'serial' && c.slot === b.slot);
        if (ch && MES.charState(u, op.seq, ch).state === 'done') return;
        const avail = DB.inv.filter(i => i.partId === b.partId && i.location === ls && i.status === 'Available' && !MES.invHeld(i) && (part.type !== 'Assembly' || (MES.unit(i.serial) && MES.unit(i.serial).status === 'Complete')));
        if (!avail.length) short.push(b.partId);
      } else {
        const have = MES.lotAvailable(b.partId, ls).reduce((s, i) => s + i.qty, 0);
        if (have + 1e-9 < b.qty) short.push(b.partId);
      }
    });
    return { ok: !short.length, short };
  },
};

/* ======================================================= DASHBOARD */
V.dashboard = () => {
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

  const kpis = '<div class="kpis">' +
    '<div class="kpi"><span class="lbl">Units in WIP</span><span class="val num">' + wip.length + '</span><span class="foot">' + byItem('BIW-T1') + ' bodies · ' + byItem('ENG-24T') + ' engines · ' + byItem('VEH-T1') + ' vehicles</span></div>' +
    '<div class="kpi"><span class="lbl">Vehicles released today</span><span class="val num">' + doneToday('VEH-T1') + '</span><span class="foot">' + doneToday('BIW-T1') + ' bodies · ' + doneToday('ENG-24T') + ' engines completed</span></div>' +
    '<div class="kpi"><span class="lbl">Vehicle first-pass yield</span><span class="val num">' + (fpy ? Math.round(fpy.pct) + '<small>%</small>' : '—') + '</span><span class="foot">' + (fpy ? fpy.clean + ' of ' + fpy.total + ' built with zero discrepancies' : 'No completed vehicles') + '</span></div>' +
    '<div class="kpi' + (bigDr ? ' alert' : '') + '"><span class="lbl">Open discrepancies</span><span class="val num">' + openDr.length + '</span><span class="foot">' + bigDr + ' major/critical · ' + openDr.filter(d => d.status === 'Open').length + ' awaiting MRB</span></div>' +
    '<div class="kpi' + (holds.length ? ' alert' : '') + '"><span class="lbl">Active quality holds</span><span class="val num">' + holds.length + '</span><span class="foot">' + holds.map(h => h.type).join(', ') + '</span></div>' +
    '<div class="kpi"><span class="lbl">Test first-pass (7 days)</span><span class="val num">' + fpt + '<small>%</small></span><span class="foot">' + wk.length + ' test records</span></div></div>';

  const lines = DB.jobs.map(job => {
    const us = DB.units.filter(u => u.jobId === job.id);
    const done = us.filter(u => u.status === 'Complete').length, w = us.length - done;
    const tiles = MES.routing(job.itemId).map(o => {
      const at = P.stationUnits(o.station);
      const active = at.find(u => u.ops[o.seq].status === 'Active' && !MES.unitHeld(u.serial));
      const held = at.filter(u => MES.unitHeld(u.serial));
      const queued = at.filter(u => u.ops[o.seq].status === 'Pending' && !MES.unitHeld(u.serial));
      const cls = held.length ? 'held' : active ? 'active' : '';
      const tip = o.name + ' @ ' + o.station + (active ? '\nRunning: ' + active.serial + ' (' + MES.userName(active.ops[o.seq].operator) + ')' : '\nIdle') + (queued.length ? '\nQueued: ' + queued.map(u => u.serial).join(', ') : '') + (held.length ? '\nOn hold: ' + held.map(u => u.serial).join(', ') : '');
      return '<a class="stn ' + cls + '" href="#/station/' + o.station + '" data-go="station/' + o.station + '" data-tip="' + E(tip) + '"><span class="op">OP' + o.seq + ' · ' + o.station + '</span><span class="nm">' + E(o.name) + '</span>' +
        (active ? '<span class="u">▶ ' + E(P.shortSerial(active.serial)) + '</span>' : held.length ? '<span class="u">⏸ ' + E(P.shortSerial(held[0].serial)) + ' HOLD</span>' : '<span class="u muted">idle</span>') +
        '<span class="q">' + (queued.length ? queued.length + ' queued' : '') + '</span></a>';
    }).join('');
    return '<div class="line"><div class="line-hd"><h4>' + UI.link('job/' + job.id, E(job.id)) + ' · ' + E(MES.part(job.itemId).name) + '</h4><span class="muted small">' + E(MES.building(job.building).name) + '</span><span class="muted small" style="margin-left:auto">' + done + ' done · ' + w + ' WIP · ' + job.qty + ' ordered</span></div>' +
      '<div class="progress" data-tip="' + E(done + ' complete, ' + w + ' in WIP of ' + job.qty) + '"><span class="done" style="width:' + (done / job.qty * 100) + '%"></span><span class="wip" style="width:' + (w / job.qty * 100) + '%"></span></div><div class="stations">' + tiles + '</div></div>';
  }).join('<hr style="border:0;border-top:1px solid var(--line-2);margin:6px 0">');

  // output by day
  const days = [];
  for (let i = 9; i >= 0; i--) { const d = new Date(now - i * 24 * 3600e3); days.push({ k: U.dayKey(d.getTime()), l: d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) }); }
  const cnt = (id, k) => DB.units.filter(u => u.itemId === id && u.completedAt && U.dayKey(u.completedAt) === k).length;
  const chart = UI.groupedBars(days.map(d => d.l), [
    { name: 'Bodies', color: 'var(--series-1)', values: days.map(d => cnt('BIW-T1', d.k)) },
    { name: 'Engines', color: 'var(--series-2)', values: days.map(d => cnt('ENG-24T', d.k)) },
    { name: 'Vehicles', color: 'var(--series-3)', values: days.map(d => cnt('VEH-T1', d.k)) },
  ], { label: 'Completed units per day, last 10 days' });

  const cats = {};
  DB.drs.filter(d => d.status !== 'Cancelled').forEach(d => { cats[d.category] = (cats[d.category] || 0) + 1; });
  const pareto = UI.hbars(Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, v, tip: k + ': ' + v + ' discrepancies\n' + DB.drs.filter(d => d.category === k && d.status !== 'Cancelled').map(d => d.id + ' ' + d.status).join('\n') })), { label: 'Discrepancies by category' });

  // attention
  const attn = [];
  openDr.sort((a, b) => (a.status === 'Open' ? 0 : 1) - (b.status === 'Open' ? 0 : 1)).forEach(d => attn.push('<li><span class="ic ' + (d.status === 'Open' ? 'bad' : 'warn') + '">' + ic('alert') + '</span><div class="tx"><b>' + UI.drLink(d.id) + ' · ' + E(d.title) + '</b>' + E(d.status) + ' · ' + (d.serial ? E(d.serial) : d.lot ? 'Lot ' + E(d.lot) : E(d.compSerial || '')) + ' · opened ' + U.ago(d.createdAt) + '</div>' + UI.sev(d.severity) + '</li>'));
  holds.forEach(h => attn.push('<li><span class="ic bad">' + ic('lock') + '</span><div class="tx"><b>' + E(h.id) + ' · ' + E(h.type) + ' ' + E(h.target.replace('|', ' lot ')) + '</b>' + E(h.reason) + '</div>' + UI.link('holds', 'View') + '</li>'));
  MES.replenishment().forEach(r => attn.push('<li><span class="ic info">' + ic('truck') + '</span><div class="tx"><b>Replenish ' + E(r.partId) + ' → ' + E(r.ls) + '</b>Need ' + r.need + ', on hand ' + r.onHand + (r.sources.length ? ' · stock available at ' + E([...new Set(r.sources.map(s => s.location))].join(', ')) : ' · no releasable stock') + '</div>' + UI.link('dispatch', 'Dispatch') + '</li>'));

  const dotFor = a => /FAIL|rejected|hold placed|opened/i.test(a) ? 'bad' : /released|closed|PASS|completed/i.test(a) ? 'ok' : /Disposition|Rework/i.test(a) ? 'warn' : 'info';
  const feed = DB.audit.slice(-14).reverse().map(a => '<li><span class="when">' + U.fmtDT(a.at).replace(/^\w+ \d+ /, '') + '</span><span class="dot ' + dotFor(a.action) + '"></span><div><b>' + E(a.action) + '</b> · ' + E(a.ref) + (a.detail ? ' — <span class="muted">' + E(a.detail) + '</span>' : '') + '<div class="muted small">' + E(MES.userName(a.by)) + ' · ' + U.ago(a.at) + '</div></div></li>').join('');

  return UI.ph(E(DB.company.plant) + ' · ' + E(DB.company.product) + ' program', 'Plant Dashboard', 'Live view of three production jobs across Buildings 10, 20 and 30.', UI.link('station', ic('station') + 'Open station terminal', 'btn pri')) +
    kpis +
    UI.card('Line status', lines, { hint: 'Each tile is a routing operation. Click a tile to open its station terminal.' }) +
    '<div class="grid g-main">' + UI.card('Completed units per day', chart, { hint: 'Last 10 days' }) + UI.card('Discrepancies by category', pareto, { hint: 'All discrepancies' }) + '</div>' +
    '<div class="grid g2">' + UI.card('Needs attention', attn.length ? '<ul class="attn">' + attn.join('') + '</ul>' : '<div class="empty">Nothing needs attention.</div>', { flush: true, hint: attn.length + ' items' }) +
    UI.card('Recent shop-floor activity', '<ul class="feed">' + feed + '</ul>', { flush: true, acts: UI.link('audit', 'Full audit trail', 'btn sm') }) + '</div>';
};

/* ======================================================= JOBS */
V.jobs = () => {
  const rows = DB.jobs.map(j => {
    const us = DB.units.filter(u => u.jobId === j.id);
    return { j, us, done: us.filter(u => u.status === 'Complete').length, held: us.filter(u => MES.unitHeld(u.serial)).length };
  });
  return UI.ph('Production', 'Jobs & WIP', 'Released production orders. Each launched unit carries its own serial and the quality plan revision it was built to.') +
    UI.card(null, UI.table([
      { h: 'Job', v: r => '<b class="mono">' + E(r.j.id) + '</b>' },
      { h: 'Item', v: r => UI.link('item/' + r.j.itemId, E(r.j.itemId)) + '<div class="small muted">' + E(MES.part(r.j.itemId).name) + '</div>' },
      { h: 'Building', v: r => E(MES.building(r.j.building).short) },
      { h: 'Ordered', num: 1, v: r => r.j.qty },
      { h: 'Launched', num: 1, v: r => r.us.length },
      { h: 'Complete', num: 1, v: r => r.done },
      { h: 'WIP', num: 1, v: r => r.us.length - r.done },
      { h: 'On hold', num: 1, v: r => r.held ? '<span style="color:var(--bad);font-weight:600">' + r.held + '</span>' : '0' },
      { h: 'Progress', v: r => '<div class="progress" style="width:140px;margin-top:6px"><span class="done" style="width:' + (r.done / r.j.qty * 100) + '%"></span><span class="wip" style="width:' + ((r.us.length - r.done) / r.j.qty * 100) + '%"></span></div>' },
      { h: 'Due', v: r => U.fmtD(r.j.due) },
      { h: 'Priority', v: r => r.j.priority === 'High' ? '<span class="chip serious plain">High</span>' : '<span class="chip plain">Normal</span>' },
      { h: 'Status', v: r => UI.chip(r.j.status) },
    ], rows, { rowGo: r => 'job/' + r.j.id }), { flush: true });
};

V.job = id => {
  const j = MES.job(id);
  if (!j) return UI.ph('Jobs', 'Job not found', E(id));
  const us = DB.units.filter(u => u.jobId === j.id).sort((a, b) => b.launchedAt - a.launchedAt);
  const plan = MES.activePlan(j.itemId);
  const ops = MES.routing(j.itemId).map(o => {
    const at = us.filter(u => u.status !== 'Complete' && MES.currentOp(u) && MES.currentOp(u).seq === o.seq);
    const done = us.filter(u => u.ops[o.seq] && u.ops[o.seq].status === 'Done').length;
    return { o, at, done };
  });
  return '<div class="crumbs">' + UI.link('jobs', 'Jobs') + ' / ' + E(j.id) + '</div>' +
    UI.ph(E(MES.building(j.building).name), E(j.id) + ' · ' + E(MES.part(j.itemId).name), E(j.note) + ' · due ' + U.fmtD(j.due) + ' · released by ' + E(MES.userName(j.releasedBy)),
      '<button class="btn pri" data-act="launch" data-job="' + E(j.id) + '">' + ic('play') + 'Launch next unit</button>') +
    '<div class="grid g2">' +
    UI.card('Routing & WIP by operation', UI.table([
      { h: 'Op', v: r => '<span class="mono">' + r.o.seq + '</span>' },
      { h: 'Operation', v: r => E(r.o.name) + (r.o.test ? ' <span class="tag">' + E(r.o.test) + '</span>' : '') },
      { h: 'Station', v: r => UI.link('station/' + r.o.station, E(r.o.station)) },
      { h: 'Std', num: 1, v: r => r.o.stdMin + ' min' },
      { h: 'At op', num: 1, v: r => r.at.length },
      { h: 'Passed', num: 1, v: r => r.done },
    ], ops), { flush: true }) +
    UI.card('Job details', UI.kv([
      ['Item', UI.link('item/' + j.itemId, E(j.itemId)) + ' · ' + E(MES.part(j.itemId).name)],
      ['Quality plan for new units', plan ? UI.link('plan/' + plan.id, E(plan.id)) + ' rev ' + plan.rev + ' ' + UI.chip(plan.status) : '<span style="color:var(--bad)">No released plan</span>'],
      ['Ordered / launched', j.qty + ' / ' + us.length],
      ['Priority', E(j.priority)],
      ['Status', UI.chip(j.status)],
      ['Released', U.fmtDT(j.releasedAt) + ' by ' + E(MES.userName(j.releasedBy))],
    ])) + '</div>' +
    UI.card('Units (' + us.length + ')', UI.table([
      { h: 'Serial', v: u => UI.serial(u.serial) },
      { h: 'State', v: u => UI.unitStateChip(u) },
      { h: 'Current op', v: u => u.status === 'Complete' ? '<span class="muted">Released</span>' : (() => { const o = MES.currentOp(u); return 'OP' + o.seq + ' ' + E(o.name) + ' <span class="muted small">' + E(u.ops[o.seq].status) + '</span>'; })() },
      { h: 'Location', v: u => E(u.parent ? 'Installed in ' + u.parent : u.location) },
      { h: 'Plan', v: u => UI.link('plan/' + u.planId, 'rev ' + E(u.planRev)) },
      { h: 'DRs', num: 1, v: u => { const n = DB.drs.filter(d => d.serial === u.serial).length, o = P.openDrs(u.serial).length; return n ? n + (o ? ' <span style="color:var(--bad)">(' + o + ' open)</span>' : '') : '0'; } },
      { h: 'Launched', v: u => U.fmtDT(u.launchedAt) },
      { h: 'Completed', v: u => U.fmtDT(u.completedAt) },
    ], us, { rowGo: u => 'unit/' + u.serial }), { flush: true });
};
ACT.launch = el => {
  const r = MES.launchUnit(el.dataset.job, DB.currentUser);
  App.commit(r, r.ok ? 'Launched ' + r.unit.serial + ' to ' + MES.routing(r.unit.itemId)[0].station : '');
};

/* ======================================================= DISPATCH */
V.dispatch = () => {
  const bld = ['B10', 'B20', 'B30'].map(b => {
    const sts = DB.stations.filter(s => s.building === b);
    const rows = sts.map(s => {
      const op = Object.values(DB.routings).flat().find(o => o.station === s.id);
      const at = P.stationUnits(s.id);
      const active = at.find(u => u.ops[op.seq].status === 'Active');
      return { s, op, at, active };
    });
    return UI.card(E(MES.building(b).name), UI.table([
      { h: 'Station', v: r => UI.link('station/' + r.s.id, '<b>' + E(r.s.id) + '</b>') + '<div class="small muted">OP' + r.op.seq + ' ' + E(r.op.name) + '</div>' },
      { h: 'Running', v: r => r.active ? UI.serial(r.active.serial) + (MES.unitHeld(r.active.serial) ? ' ' + UI.chip('On Hold') : '') + '<div class="small muted">' + E(MES.userName(r.active.ops[r.op.seq].operator)) + ' · ' + U.dur(MES.now() - r.active.ops[r.op.seq].start) + ' of ' + r.op.stdMin + ' min std</div>' : '<span class="muted">Idle</span>' },
      {
        h: 'Queue (FIFO)', v: r => {
          const q = r.at.filter(u => u !== r.active);
          if (!q.length) return '<span class="muted">—</span>';
          return q.map(u => {
            const m = P.materialReady(u), held = MES.unitHeld(u.serial), gate = P.openDrs(u.serial).length && u.opIdx === MES.routing(u.itemId).length - 1;
            return '<div class="row" style="gap:6px;margin-bottom:3px">' + UI.serial(u.serial) + (held ? UI.chip('On Hold') : gate ? '<span class="chip warn">DR gate</span>' : m.ok ? '<span class="chip ok">Material ready</span>' : '<span class="chip warn" data-tip="' + E('Not at line-side: ' + m.short.join(', ')) + '">Short ' + E(m.short.join(', ')) + '</span>') + '</div>';
          }).join('');
        },
      },
    ], rows), { flush: true });
  }).join('');
  const rq = MES.replenishment();
  const moves = UI.table([
    { h: 'Deliver to', v: r => '<b>' + E(r.ls) + '</b>' },
    { h: 'Part', v: r => '<span class="mono">' + E(r.partId) + '</span><div class="small muted">' + E(MES.part(r.partId).name) + '</div>' },
    { h: 'Remaining demand', num: 1, v: r => r.need },
    { h: 'On hand', num: 1, v: r => r.onHand },
    { h: 'Source', v: r => r.sources.length ? E([...new Set(r.sources.map(s => s.location))].join(', ')) : '<span style="color:var(--bad)">No releasable stock</span>' },
    { h: '', v: r => r.sources.length ? '<button class="btn sm pri" data-act="fulfill" data-part="' + E(r.partId) + '" data-ls="' + E(r.ls) + '">' + ic('truck') + 'Move</button>' : '' },
  ], rq, { empty: 'All line-side supermarkets cover remaining WIP demand.' });
  return UI.ph('Production', 'Dispatch List', 'What each station is running, what is queued behind it, and whether material and quality gates allow the next unit to start.') +
    UI.card('Material move requests', moves, { flush: true, hint: 'Computed from remaining routing demand vs. unheld line-side stock' }) + '<div class="stack">' + bld + '</div>';
};
ACT.fulfill = el => {
  const rq = MES.replenishment().find(r => r.partId === el.dataset.part && r.ls === el.dataset.ls);
  if (!rq) return App.toast('Request already satisfied.', 'warn');
  const p = MES.person(DB.currentUser);
  if (!['Material Handler', 'Supervisor', 'Quality Engineer'].includes(p.role)) return App.toast(p.name + ' (' + p.role + ') cannot post material moves. Switch to Rosa Jimenez or Tom Becker.', 'bad');
  let short = rq.short, n = 0;
  for (const src of rq.sources) {
    if (short <= 1e-9) break;
    const q = src.serial ? 1 : Number(Math.min(src.qty, Math.max(short, short * 1.5)).toFixed(2));
    const r = MES.transfer(src.id, q, rq.ls, DB.currentUser, 'Replenishment request');
    if (!r.ok) return App.commit(r);
    short -= q; n++;
  }
  App.commit({ ok: true }, 'Posted ' + n + ' move(s) of ' + rq.partId + ' to ' + rq.ls);
};

/* ======================================================= STATION TERMINAL */
V.station = (stId, serial) => {
  const cu = MES.currentUser();
  if (!stId) {
    const groups = ['B10', 'B20', 'B30'].map(b => '<div class="stack" style="gap:8px"><h3 style="font-size:17px">' + E(MES.building(b).name) + '</h3><div class="stn-grid">' +
      DB.stations.filter(s => s.building === b).map(s => {
        const op = Object.values(DB.routings).flat().find(o => o.station === s.id);
        const at = P.stationUnits(s.id), q = cu.quals.includes(s.id);
        const active = at.find(u => u.ops[op.seq].status === 'Active' && !MES.unitHeld(u.serial));
        return '<a class="stn ' + (at.some(u => MES.unitHeld(u.serial)) ? 'held' : active ? 'active' : '') + '" href="#/station/' + s.id + '" data-go="station/' + s.id + '"><span class="op">' + E(s.id) + ' · OP' + op.seq + '</span><span class="nm">' + E(s.name) + '</span><span class="u">' + (active ? '▶ ' + E(active.serial) : at.length ? at.length + ' waiting' : 'idle') + '</span><span class="q">' + (q ? '✓ You are qualified' : '') + '</span></a>';
      }).join('') + '</div></div>').join('');
    return UI.ph('Production', 'Station Terminal', 'Choose a station. You are signed in as ' + E(cu.name) + ' (' + E(cu.role) + ').') + groups;
  }
  const st = MES.station(stId);
  if (!st) return UI.ph('Station', 'Station not found', E(stId));
  const op = Object.values(DB.routings).flat().find(o => o.station === stId);
  const itemId = Object.keys(DB.routings).find(k => DB.routings[k].includes(op));
  const units = P.stationUnits(stId);
  const u = (serial && MES.unit(serial)) || units[0];
  const running = units.find(x => x.ops[op.seq].status === 'Active' && !MES.unitHeld(x.serial));
  const held = units.some(x => MES.unitHeld(x.serial));
  const qualified = cu.quals.includes(stId);
  const recent = DB.units.filter(x => x.itemId === itemId && x.ops[op.seq] && x.ops[op.seq].status === 'Done').sort((a, b) => b.ops[op.seq].end - a.ops[op.seq].end).slice(0, 4);

  const andon = '<div class="andon"><span class="light ' + (held ? 'hold' : running ? 'run' : 'idle') + '"></span><div><div class="stn-id">' + E(st.id) + ' · ' + E(st.name) + '</div><div class="meta">' + E(MES.building(st.building).name) + ' · ' + E(st.wc) + ' · OP' + op.seq + ' ' + E(op.name) + ' · ' + E(itemId) + ' · std ' + op.stdMin + ' min</div></div>' +
    '<div class="right"><span class="qual">' + (qualified ? '✓ ' + E(cu.name) + ' qualified' : '✕ ' + E(cu.name) + ' not qualified here') + '</span>' + UI.link('station', 'All stations', 'btn sm') + '</div></div>';

  const queue = '<ul class="queue">' + (units.length ? units.map(x => {
    const s = x.ops[op.seq].status, h = MES.unitHeld(x.serial);
    return '<li><a href="#/station/' + stId + '/' + x.serial + '" data-go="station/' + stId + '/' + x.serial + '" class="' + (u && x.serial === u.serial ? 'on' : '') + '"><span class="s">' + E(x.serial) + '</span><span class="row" style="gap:6px">' + (h ? UI.chip('On Hold') : UI.chip(s === 'Active' ? 'Active' : 'Queued', s === 'Active' ? 'In process' : 'Queued')) + '<span class="small muted">' + (s === 'Active' ? U.dur(MES.now() - x.ops[op.seq].start) : 'since ' + U.ago(x.ops[op.seq - 10] ? x.ops[op.seq - 10].end : x.launchedAt)) + '</span></span></a></li>';
  }).join('') : '<li class="empty">No units queued at this station.</li>') + '</ul>';
  const recentHtml = recent.length ? '<ul class="queue">' + recent.map(x => '<li><a href="#/unit/' + x.serial + '" data-go="unit/' + x.serial + '"><span class="s">' + E(x.serial) + '</span><span class="small muted">Completed ' + U.ago(x.ops[op.seq].end) + ' by ' + E(MES.userName(x.ops[op.seq].completedBy)) + '</span></a></li>').join('') + '</ul>' : '<div class="empty">None yet.</div>';

  const left = '<div class="stack">' + UI.card('Dispatch queue', queue, { flush: true, hint: units.length + ' units' }) + UI.card('Recently completed here', recentHtml, { flush: true }) + '</div>';
  const right = u ? P.workPanel(u, op, stId) : UI.card(null, '<div class="empty">Nothing to work on. Units appear here when they reach OP' + op.seq + '.</div>');
  return andon + '<div class="grid g-station">' + left + right + '</div>';
};

P.workPanel = (u, op, stId) => {
  const plan = MES.plan(u.planId), chars = MES.planChars(plan, op.seq), o = u.ops[op.seq];
  const cu = MES.currentUser(), qual = cu.quals.includes(stId);
  const held = MES.unitHeld(u.serial), active = o.status === 'Active' && !held && qual;
  const qualNames = DB.people.filter(p => p.quals.includes(stId)).map(p => p.name);
  const holds = MES.activeHolds('Unit', u.serial);
  const states = chars.map(c => MES.charState(u, op.seq, c));
  const doneN = states.filter(s => s.state === 'done' || s.state === 'accepted').length;
  const isLast = u.opIdx === MES.routing(u.itemId).length - 1;
  const gate = isLast ? P.openDrs(u.serial) : [];
  const hdr = '<div class="unit-hd"><div><div class="eyebrow" style="font:600 12px var(--font);letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)">' + E(MES.part(u.itemId).name) + ' · ' + UI.link('job/' + u.jobId, E(u.jobId)) + ' · plan ' + UI.link('plan/' + u.planId, E(u.planId)) + '</div><div class="serial">' + E(u.serial) + '</div>' +
    (u.itemId === 'VEH-T1' ? '<div class="small muted">VIN check digit ' + E(u.serial[8]) + ' ' + (U.vinValid(u.serial) ? '✓ valid' : '✕ invalid') + '</div>' : '') + '</div>' +
    '<div class="acts">' + (o.status === 'Pending' && !held ? '<button class="btn lg pri" data-act="start-op" data-serial="' + E(u.serial) + '" data-seq="' + op.seq + '">' + ic('play') + 'Start OP' + op.seq + '</button>' : '') +
    '<button class="btn" data-act="log-dr" data-serial="' + E(u.serial) + '" data-seq="' + op.seq + '">' + ic('flag') + 'Log discrepancy</button>' + UI.link('unit/' + u.serial, ic('list') + 'Traveler', 'btn') + '</div></div>';
  const opbar = '<div class="opbar">' + MES.routing(u.itemId).map(x => '<div class="o ' + u.ops[x.seq].status + (x.seq === op.seq && u.ops[x.seq].status !== 'Active' ? ' cur' : '') + '" data-tip="' + E('OP' + x.seq + ' ' + x.name + '\n' + u.ops[x.seq].status + (u.ops[x.seq].end ? ' ' + U.fmtDT(u.ops[x.seq].end) : '')) + '">' + x.seq + ' ' + E(x.name) + '</div>').join('') + '</div>';

  let banner = '';
  if (held) banner = '<div class="banner bad">' + ic('lock') + '<div class="tx"><b>Quality hold — work is blocked.</b> ' + holds.map(h => E(h.id) + ': ' + E(h.reason) + (h.drId ? ' (' + UI.drLink(h.drId) + ')' : '')).join('; ') + '. A Quality Engineer must disposition the discrepancy before work continues.</div></div>';
  else if (gate.length && o.status === 'Pending') banner = '<div class="banner warn">' + ic('alert') + '<div class="tx"><b>Final audit gate.</b> Open discrepancies must be closed before the final operation starts: ' + gate.map(d => UI.drLink(d.id) + ' (' + E(d.status) + ')').join(', ') + '.</div></div>';
  else if (o.status === 'Pending') banner = '<div class="banner info">' + ic('play') + '<div class="tx"><b>Queued.</b> Start the operation to record inspection data. ' + (cu.quals.includes(stId) ? '' : E(cu.name) + ' is not qualified on ' + E(stId) + '; switch user to a qualified operator.') + '</div></div>';
  else if (!qual) banner = '<div class="banner warn">' + ic('lock') + '<div class="tx"><b>View only.</b> ' + E(cu.name) + ' (' + E(cu.role) + ') is not qualified on ' + E(stId) + '. Switch user to record data: ' + E(qualNames.join(', ')) + '. Sign-offs can still be applied by eligible signers once all items are recorded.</div></div>';
  else banner = '<div class="banner ok">' + ic('station') + '<div class="tx"><b>In process</b> since ' + U.fmtT(o.start) + ' (' + U.dur(MES.now() - o.start) + ') · operator ' + E(MES.userName(o.operator)) + ' · ' + doneN + ' of ' + chars.length + ' plan items complete</div><div class="progress" style="width:160px"><span class="done" style="width:' + (chars.length ? doneN / chars.length * 100 : 0) + '%"></span></div></div>';

  const row = (c, st, ctl, extra) => {
    const cls = st.state;
    return '<div class="ci ' + cls + '"><div class="code"><span class="st">' + (cls === 'done' || cls === 'accepted' ? ic('check') : cls === 'fail' ? ic('x') : '') + '</span>' + E(c.code) + '</div><div><div class="nm">' + E(c.name) + (c.sev !== 'Minor' && c.type !== 'signoff' ? ' ' + UI.sev(c.sev) : '') + '</div><div class="meta">' + extra + '</div></div><div class="ctl">' + ctl + '</div></div>';
  };
  const drNote = st => st.r && st.r.drId ? ' · ' + UI.drLink(st.r.drId) + ' ' + (MES.dr(st.r.drId) ? UI.chip(MES.dr(st.r.drId).status) : '') : '';
  const hist = (c) => { const h = MES.results(u.serial, op.seq, c.id); return h.length > 1 ? '<span data-tip="' + E(h.map(r => U.fmtT(r.at) + '  ' + r.value + '  ' + r.result + '  ' + MES.userName(r.by)).join('\n')) + '">' + h.length + ' readings</span>' : ''; };
  const hid = c => '<input type="hidden" name="serial" value="' + E(u.serial) + '"><input type="hidden" name="seq" value="' + op.seq + '"><input type="hidden" name="charId" value="' + E(c.id) + '">';
  let focusSet = false;
  const af = () => { if (focusSet || !active) return ''; focusSet = true; return ' data-autofocus'; };

  const sec = (title, list, render) => list.length ? '<div class="sec-title">' + title + '<span class="cnt">' + list.filter(c => ['done', 'accepted'].includes(MES.charState(u, op.seq, c).state)).length + ' / ' + list.length + '</span></div>' + list.map(render).join('') : '';

  const serials = chars.filter(c => c.type === 'serial');
  const renderSerial = c => {
    const st = MES.charState(u, op.seq, c), part = MES.part(c.partId);
    const last = DB.attempts.filter(a => a.serial === u.serial && a.charId === c.id).pop();
    let ctl;
    if (st.state === 'done') ctl = '<span class="res pass">' + E(st.r.value) + '</span>' + UI.link('genealogy/' + st.r.value, 'Trace', 'btn sm');
    else ctl = '<form data-form="serial" class="row" style="gap:6px;justify-content:flex-end">' + hid(c) + '<input class="in wide" name="value" placeholder="Scan ' + E(part.id) + ' serial" autocomplete="off"' + (active ? '' : ' disabled') + af() + '><button class="btn pri sm"' + (active ? '' : ' disabled') + '>' + ic('scan') + 'Validate</button></form>';
    let extra = '<span class="mono">' + E(part.id) + '</span><span>' + E(part.name) + '</span>' + (part.pattern && part.pattern !== 'VIN' ? '<span>mask <span class="mono">' + E(part.pattern) + '</span></span>' : '');
    if (st.state !== 'done' && active) {
      const avail = DB.inv.filter(i => i.partId === c.partId && i.location === MES.station(op.station).building + '-LS' && i.status === 'Available' && !MES.invHeld(i)).slice(0, 3);
      extra += '<span>line-side: ' + (avail.length ? avail.map(i => '<a href="#" data-act="fill-serial" data-v="' + E(i.serial) + '" data-char="' + E(c.id) + '" class="mono" title="Simulate scanning this label">' + E(i.serial) + '</a>').join(', ') : '<span style="color:var(--bad)">none — request a move</span>') + '</span>';
    }
    if (last && !last.ok && st.state !== 'done') extra += '<div class="validation" style="width:100%"><span class="n"><b>Last scan rejected (' + E(last.scanned) + '):</b> ' + E(last.msg) + '</span>' + last.checks.map(k => '<span class="' + (k.ok ? 'y' : 'n') + '">' + (k.ok ? '✓' : '✕') + ' ' + E(k.label) + ' — ' + E(k.msg) + '</span>').join('') + '</div>';
    return row(c, st, ctl, extra);
  };
  const checkRow = c => {
    const st = MES.charState(u, op.seq, c);
    let ctl = '';
    if (st.r) ctl += '<span class="res ' + (st.r.result === 'PASS' ? 'pass' : 'fail') + '">' + E(st.r.result) + '</span>';
    if (st.state !== 'done' && st.state !== 'accepted') ctl += '<button class="btn sm good" data-act="chk" data-r="PASS" data-serial="' + E(u.serial) + '" data-seq="' + op.seq + '" data-char="' + E(c.id) + '"' + (active ? '' : ' disabled') + '>' + ic('check') + 'Pass</button><button class="btn sm danger" data-act="chk" data-r="FAIL" data-serial="' + E(u.serial) + '" data-seq="' + op.seq + '" data-char="' + E(c.id) + '"' + (active ? '' : ' disabled') + '>' + ic('x') + 'Fail</button>';
    return row(c, st, ctl, '<span>' + E(c.cat) + '</span>' + (st.r ? '<span>' + E(MES.userName(st.r.by)) + ' ' + U.fmtT(st.r.at) + '</span>' : '') + (st.r && st.r.note ? '<span>“' + E(st.r.note) + '”</span>' : '') + drNote(st));
  };
  const measRow = c => {
    const st = MES.charState(u, op.seq, c);
    const val = st.r ? st.r.value : null;
    const specS = '<span>Spec <b class="mono">' + E(UI.spec(c)) + '</b></span>' + (c.type === 'measure' ? '<span>nominal ' + U.num(c.nominal, c.dec) + '</span>' + (c.gauge ? '<span>' + E(c.gauge) + '</span>' : '') : '<span class="formula">' + E(c.formula) + '</span>');
    let ctl = '';
    if (val !== null) ctl += '<span class="res ' + (st.r.result === 'PASS' ? 'pass' : 'fail') + '">' + U.num(val, c.dec) + ' ' + E(c.unit) + '</span>';
    if (c.type === 'measure' && st.state !== 'done' && st.state !== 'accepted') ctl += '<form data-form="meas" class="row" style="gap:6px">' + hid(c) + '<input class="in num" name="value" inputmode="decimal" step="any" placeholder="' + E(c.unit) + '" data-lsl="' + c.lsl + '" data-usl="' + c.usl + '" autocomplete="off"' + (active ? '' : ' disabled') + af() + '><button class="btn sm pri"' + (active ? '' : ' disabled') + '>Record</button></form>';
    if (c.type === 'calc' && val === null) ctl += '<span class="muted small">Auto-calculates when inputs are recorded</span>';
    return row(c, st, ctl + (val !== null ? UI.gauge(c, val) : ''), specS + (st.r ? '<span>' + E(MES.userName(st.r.by)) + ' ' + U.fmtT(st.r.at) + '</span>' : '') + hist(c) + drNote(st));
  };
  const signRow = c => {
    const st = MES.charState(u, op.seq, c);
    const ctl = st.state === 'done' ? UI.sigCard(st.sig) : '<button class="btn sm pri" data-act="sign-op" data-serial="' + E(u.serial) + '" data-seq="' + op.seq + '" data-char="' + E(c.id) + '"' + (o.status === 'Active' && !held ? '' : ' disabled') + '>' + ic('sig') + 'Sign as ' + E(c.role) + '</button>';
    return row(c, st, ctl, '<span>Role: ' + E(c.role) + '</span><span>Meaning: ' + E(c.meaning) + '</span>' + (c.meaning !== 'Performed' ? '<span>Independent of performer</span>' : ''));
  };

  const lots = (DB.boms[u.itemId] || []).filter(b => b.op === op.seq && MES.part(b.partId).tracking !== 'Serial');
  const ls = MES.station(op.station).building + '-LS';
  const lotHtml = lots.length ? '<div class="sec-title">Lot-controlled material · backflushed on completion</div><div class="tw" style="padding:0 16px 8px">' + UI.table([
    { h: 'Part', v: b => '<span class="mono">' + E(b.partId) + '</span> ' + E(MES.part(b.partId).name) },
    { h: 'Qty / unit', num: 1, v: b => b.qty + ' ' + E(MES.part(b.partId).uom) },
    { h: 'Line-side (' + ls + ')', v: b => { const l = MES.lotAvailable(b.partId, ls); const q = l.reduce((s, i) => s + i.qty, 0); return (q >= b.qty ? '<span class="chip ok">' : '<span class="chip bad">') + U.num(q, 1) + ' ' + E(MES.part(b.partId).uom) + '</span> <span class="small muted">' + E(l.map(i => i.lot).join(', ')) + '</span>'; } },
  ], lots) + '</div>' : '';

  const blockers = active ? MES.opBlockers(u, op.seq) : [];
  const foot = active ? '<div class="sec-title">Complete operation</div><div style="padding:0 16px 16px" class="stack">' + (blockers.length ? '<div class="small muted">' + blockers.length + ' item(s) outstanding: ' + E(blockers.slice(0, 4).join(' · ')) + (blockers.length > 4 ? ' …' : '') + '</div>' : '<div class="small" style="color:var(--ok)">All quality-plan items are satisfied. Completing will backflush lot material' + (op.test ? ', create the ' + E(op.test) + ' record' : '') + ' and move the unit to the next operation.</div>') +
    '<div><button class="btn lg ' + (blockers.length ? '' : 'good') + '" data-act="complete-op" data-serial="' + E(u.serial) + '" data-seq="' + op.seq + '"' + (blockers.length ? ' disabled' : '') + '>' + ic('check') + (isLast ? 'Complete & release ' + E(P.itemShort[u.itemId]) : 'Complete OP' + op.seq) + '</button></div></div>' : '';

  const body = '<div class="bd stack" style="padding-bottom:6px">' + hdr + opbar + banner + '<div><div class="sec-title" style="padding-left:0">Work instructions · OP' + op.seq + ' ' + E(op.name) + (op.equipment ? ' · ' + E(op.equipment) : '') + '</div><ol class="instr">' + op.instr.map(i => '<li>' + E(i) + '</li>').join('') + '</ol></div></div>' +
    sec('Serialized components · validate & install', serials, renderSerial) + lotHtml +
    sec('In-process inspection', chars.filter(c => c.type === 'check' && c.phase !== 'end'), checkRow) +
    sec('Measurements & calculations', chars.filter(c => c.type === 'measure' || c.type === 'calc'), measRow) +
    sec('Station-end checklist', chars.filter(c => c.type === 'check' && c.phase === 'end'), checkRow) +
    sec('Sign-off', chars.filter(c => c.type === 'signoff'), signRow) + foot;
  return '<section class="card">' + body + '</section>';
};

ACT['start-op'] = el => { const r = MES.startOp(el.dataset.serial, Number(el.dataset.seq), DB.currentUser); App.commit(r, r.ok ? 'OP' + el.dataset.seq + ' started on ' + el.dataset.serial : ''); };
ACT['complete-op'] = el => {
  const u = MES.unit(el.dataset.serial), stId = MES.currentOp(u).station;
  const r = MES.completeOp(el.dataset.serial, Number(el.dataset.seq), DB.currentUser);
  if (!r.ok) return App.commit(r);
  MES.save();
  App.toast(r.final ? el.dataset.serial + ' released — routing complete.' : 'OP' + el.dataset.seq + ' complete. ' + el.dataset.serial + ' moved to OP' + MES.currentOp(u).seq + '.');
  App.go('station/' + stId, true);
};
ACT['fill-serial'] = el => {
  const f = [...document.querySelectorAll('form[data-form="serial"]')].find(x => x.querySelector('[name=charId]').value === el.dataset.char);
  if (f) { f.querySelector('[name=value]').value = el.dataset.v; f.querySelector('[name=value]').focus(); }
};
FORMS.serial = fd => {
  const r = MES.validateSerial(fd.get('serial'), Number(fd.get('seq')), fd.get('charId'), fd.get('value'), DB.currentUser);
  if (!r.ok) { MES.save(); App.render(); App.toast(r.msg, 'bad'); return; }
  App.commit(r, r.msg);
};
FORMS.meas = fd => {
  const r = MES.recordMeasure(fd.get('serial'), Number(fd.get('seq')), fd.get('charId'), fd.get('value'), DB.currentUser);
  if (!r.ok) return App.commit(r);
  const fails = [r.result, ...(r.calcs || [])].filter(x => x.result === 'FAIL');
  if (fails.length) {
    const d = MES.dr(fails[0].drId);
    App.commit(r, fails.map(f => f.code + ' ' + f.value + ' out of tolerance').join('; ') + (d ? ' — ' + d.id + ' opened' + (MES.unitHeld(fd.get('serial')) ? ', unit placed on hold' : '') : ''), { kind: 'bad' });
  } else App.commit(r, r.result.code + ' = ' + r.result.value + ' ' + r.result.unit + ' in spec' + (r.calcs && r.calcs.length ? ' · ' + r.calcs.map(c => c.code + ' = ' + c.value).join(', ') : ''));
};
ACT.chk = el => {
  const { serial, seq, char } = el.dataset;
  if (el.dataset.r === 'PASS') { const r = MES.recordCheck(serial, Number(seq), char, 'PASS', '', DB.currentUser); return App.commit(r, r.ok ? r.result.code + ' passed' : ''); }
  const u = MES.unit(serial), ch = MES.findChar(MES.plan(u.planId), char);
  App.modal('Record checklist failure', '<p><b>' + E(ch.code) + ' ' + E(ch.name) + '</b></p><p class="muted small">A discrepancy (' + E(ch.sev) + ', ' + E(ch.cat) + ') will be opened automatically' + (ch.sev !== 'Minor' ? ' and the unit placed on quality hold' : '') + '.</p><label class="f">What did you find?<textarea class="in" name="note" id="fail-note" required data-autofocus></textarea></label>',
    '<button type="button" class="btn" data-act="modal-close">Cancel</button><button type="submit" class="btn danger solid">' + ic('flag') + 'Record FAIL</button>',
    { onSubmit: fd => { const r = MES.recordCheck(serial, Number(seq), char, 'FAIL', fd.get('note'), DB.currentUser); if (r.ok) App.commit(r, ch.code + ' failed — ' + r.result.drId + ' opened', { kind: 'bad' }); return r; } });
};
ACT['sign-op'] = el => {
  const { serial, seq, char } = el.dataset;
  const u = MES.unit(serial), ch = MES.findChar(MES.plan(u.planId), char), op = MES.op(u.itemId, seq);
  const chars = MES.planChars(MES.plan(u.planId), Number(seq)).filter(c => c.type !== 'signoff');
  const summary = '<div class="kv" style="font-size:13.5px"><dt>Record</dt><dd class="mono">' + E(serial) + '</dd><dt>Operation</dt><dd>OP' + seq + ' ' + E(op.name) + ' @ ' + E(op.station) + '</dd><dt>Plan items</dt><dd>' + chars.length + ' recorded (' + chars.filter(c => MES.charState(u, Number(seq), c).state === 'done').length + ' pass, ' + chars.filter(c => MES.charState(u, Number(seq), c).state === 'accepted').length + ' accepted by MRB)</dd><dt>Sign-off</dt><dd>' + E(ch.name) + '</dd></div>';
  App.signDialog({ title: 'Sign OP' + seq, summary, role: ch.role, meaning: ch.meaning, confirm: 'Sign as ' + ch.meaning },
    (signer, pin) => { const r = MES.signOp(serial, Number(seq), char, signer, pin); if (r.ok) App.commit(r, 'Signed: ' + ch.name + ' by ' + MES.userName(signer)); return r; });
};
ACT['log-dr'] = el => {
  const u = MES.unit(el.dataset.serial), seq = Number(el.dataset.seq);
  const chars = MES.planChars(MES.plan(u.planId), seq).filter(c => c.type !== 'signoff');
  App.modal('Log discrepancy · ' + u.serial, '<div class="fgrid">' +
    '<label class="f">Severity<select class="in" name="severity" id="dr-sev">' + UI.options(['Minor', 'Major', 'Critical'], 'Minor') + '</select></label>' +
    '<label class="f">Category<select class="in" name="category" id="dr-cat">' + UI.options(['Workmanship', 'Cosmetic', 'Dimensional', 'Torque', 'Leak', 'Electrical', 'Wrong Part', 'Missing Part', 'Damage', 'Supplier', 'Documentation'], 'Workmanship') + '</select></label>' +
    '<label class="f">Operation<select class="in" name="seq" id="dr-seq">' + UI.options(MES.routing(u.itemId).map(o => ({ v: o.seq, l: 'OP' + o.seq + ' ' + o.name })), seq) + '</select></label>' +
    '<label class="f">Plan item (optional)<select class="in" name="charId" id="dr-char">' + UI.options(chars.map(c => ({ v: c.id, l: c.code + ' ' + c.name })), '', { blank: '— none —' }) + '</select></label>' +
    '<label class="f wide">Title<input class="in" name="title" id="dr-title" required placeholder="e.g. Scratch on RH door outer panel" data-autofocus></label>' +
    '<label class="f wide">Description<textarea class="in" name="description" id="dr-desc" placeholder="Where, how big, how found"></textarea></label></div>' +
    '<p class="small muted">Major and Critical discrepancies place the unit on quality hold immediately.</p>',
    '<button type="button" class="btn" data-act="modal-close">Cancel</button><button type="submit" class="btn danger solid">' + ic('flag') + 'Open discrepancy</button>',
    { onSubmit: fd => {
      if (!String(fd.get('title') || '').trim()) return MES.fail('Enter a short title.');
      const r = MES.createDR({ by: DB.currentUser, serial: u.serial, itemId: u.itemId, seq: Number(fd.get('seq')), charId: fd.get('charId') || null, source: 'Manual', severity: fd.get('severity'), category: fd.get('category'), title: fd.get('title'), description: fd.get('description') });
      if (r.ok) App.commit(r, r.dr.id + ' opened' + (r.dr.holdId ? ' · unit on hold' : ''), { kind: 'warn' });
      return r;
    } });
};
