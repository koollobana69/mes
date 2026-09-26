/* Ridgeline MES — shared presentation helpers for JET views (Redwood badges, icons, formatting). */
define(['ojs/ojarraydataprovider'], function (ArrayDataProvider) {
  'use strict';

  const ICONS = {
    dash: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
    jobs: '<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="19" cy="18" r="2"/>',
    dispatch: '<path d="M3 7h13l5 5-5 5H3z"/><path d="M8 12h6"/>',
    station: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    plan: '<path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z"/><path d="M8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2"/><path d="M9 12l2 2 4-4M9 17h6"/>',
    alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.5"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    test: '<path d="M9 3v6L4 19a1.5 1.5 0 0 0 1.4 2h13.2A1.5 1.5 0 0 0 20 19l-5-10V3"/><path d="M8 3h8M7 15h10"/>',
    inspect: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M9 11l1.5 1.5L13 10"/>',
    box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
    truck: '<path d="M2 6h11v10H2zM13 10h5l3 3v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    tree: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
    item: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 6 4.5"/>',
    audit: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    scan: '<path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 8v8M10 8v8M13 8v8M16 8v8"/>',
    gauge: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-6"/>',
    calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2"/>',
    sig: '<path d="M3 17c3-4 5-9 7-9s-1 9 1 9 3-4 5-4 1 4 3 4h2"/><path d="M3 21h18"/>',
    flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  };
  const icon = (name, cls) => '<svg class="mes-ico ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  const E = s => U.esc(s);

  const STATUS = {
    'Complete': 'success', 'Closed': 'success', 'PASS': 'success', 'Released': 'success', 'Available': 'success', 'Done': 'success', 'Signed': 'success',
    'PASS (MRB)': 'warning', 'Accepted (MRB)': 'warning', 'Pending Verification': 'warning', 'Rework': 'warning', 'Draft': 'warning', 'RTV': 'warning', 'DR gate': 'warning', 'Short': 'warning',
    'Open': 'danger', 'FAIL': 'danger', 'On Hold': 'danger', 'Hold': 'danger', 'Active hold': 'danger', 'Scrap': 'danger', 'Scrapped': 'danger',
    'In Process': 'info', 'Active': 'info', 'In process': 'info',
  };

  const ui = {
    icon, E,
    badge(status, label) {
      const k = STATUS[status];
      return '<span class="oj-badge oj-badge-subtle' + (k ? ' oj-badge-' + k : '') + '">' + E(label || status) + '</span>';
    },
    sev(s) { return '<span class="mes-sev mes-sev-' + E(s) + '">' + E(s) + '</span>'; },
    link(path, html, cls) { return '<a class="' + (cls || 'oj-link') + '" href="#/' + E(path) + '">' + html + '</a>'; },
    serial(s) {
      if (!s) return '—';
      return MES.unit(s) ? ui.link('unit/' + s, '<span class="mes-mono">' + E(s) + '</span>') : '<span class="mes-mono">' + E(s) + '</span>';
    },
    drLink(id) { return id ? ui.link('dr/' + id, '<span class="mes-mono">' + E(id) + '</span>') : '—'; },
    person(id) { return E(MES.userName(id)); },
    unitState(u) { return ui.badge(MES.unitState(u)); },
    typeBadge(t) {
      const m = { check: ['check', 'Checklist'], serial: ['scan', 'Serial validation'], measure: ['gauge', 'Measurement'], calc: ['calc', 'Calculation'], signoff: ['sig', 'Sign-off'] };
      const x = m[t] || ['list', t];
      return '<span class="mes-type mes-type-' + t + '">' + icon(x[0]) + x[1] + '</span>';
    },
    spec(ch) { return MES.specText(ch); },
    gauge(ch, v) {
      if (v === null || v === undefined || isNaN(v) || ch.lsl === ch.usl) return '';
      const span = ch.usl - ch.lsl, lo = ch.lsl - span * 0.5, hi = ch.usl + span * 0.5;
      const pos = x => Math.max(0, Math.min(100, (x - lo) / (hi - lo) * 100));
      return '<span class="mes-gauge" title="' + E('Spec ' + MES.specText(ch) + ' · value ' + v) + '"><span class="mes-gauge-band" style="left:' + pos(ch.lsl) + '%;right:' + (100 - pos(ch.usl)) + '%"></span><span class="mes-gauge-pt' + (MES.inSpec(ch, v) ? '' : ' bad') + '" style="left:' + pos(v) + '%"></span></span>';
    },
    sigCard(sig) {
      if (!sig) return '';
      return '<div class="mes-sigcard">' + icon('sig') + '<div><div><strong>' + E(sig.name) + '</strong> · ' + E(sig.role) + ' · <em>' + E(sig.meaning) + '</em></div><div class="mes-sigcard-h">' + U.fmtDT(sig.at) + ' · ' + sig.id + ' · manifest ' + sig.hash + '</div></div></div>';
    },
    /** An oj-button usable inside HTML strings (not knockout-bound). */
    btn(label, act, attrs, chroming) {
      return '<oj-button data-oj-binding-provider="none" chroming="' + (chroming || 'outlined') + '" data-act="' + act + '"' + Object.entries(attrs || {}).map(([k, v]) => ' data-' + k + '="' + E(v) + '"').join('') + '>' + E(label) + '</oj-button>';
    },
    kv(pairs) { return '<dl class="mes-kv">' + pairs.filter(Boolean).map(p => '<dt>' + p[0] + '</dt><dd>' + p[1] + '</dd>').join('') + '</dl>'; },
    adp(arr, key) { return new ArrayDataProvider(arr, { keyAttributes: key || 'id' }); },
    optionsDP(list) { return new ArrayDataProvider(list.map(x => typeof x === 'object' ? x : { value: x, label: x }), { keyAttributes: 'value' }); },
    avatarColor(role) {
      return { 'Operator': 'blue', 'Material Handler': 'orange', 'Quality Technician': 'green', 'Quality Engineer': 'teal', 'Supervisor': 'purple' }[role] || 'neutral';
    },
    initials(name) { return name.split(' ').map(x => x[0]).join('').slice(0, 2); },
    itemShort: { 'BIW-T1': 'Body', 'ENG-24T': 'Engine', 'VEH-T1': 'Vehicle' },
    shortSerial(s) { return s.length === 17 ? '…' + s.slice(-6) : s.replace(/^(BT1|E24T)-\d{6}-/, '$1-'); },
    openDrs(serial) { return DB.drs.filter(d => d.serial === serial && MES.DR_OPEN.includes(d.status)); },
    stationUnits(stId) {
      return DB.units.filter(u => u.status !== 'Complete' && u.status !== 'Scrapped' && MES.currentOp(u) && MES.currentOp(u).station === stId)
        .sort((a, b) => {
          const ra = a.ops[MES.currentOp(a).seq].status === 'Active' ? 0 : 1, rb = b.ops[MES.currentOp(b).seq].status === 'Active' ? 0 : 1;
          return ra - rb || a.launchedAt - b.launchedAt;
        });
    },
    opForStation(stId) { return Object.values(DB.routings).flat().find(o => o.station === stId); },
    itemForStation(stId) { return Object.keys(DB.routings).find(k => DB.routings[k].some(o => o.station === stId)); },
    materialReady(u) {
      const op = MES.currentOp(u); if (!op) return { ok: true, short: [] };
      const ls = MES.station(op.station).building + '-LS', short = [], plan = MES.plan(u.planId);
      (DB.boms[u.itemId] || []).filter(b => b.op === op.seq).forEach(b => {
        const part = MES.part(b.partId);
        if (part.tracking === 'Serial') {
          const ch = MES.planChars(plan, op.seq).find(c => c.type === 'serial' && c.slot === b.slot);
          if (ch && MES.charState(u, op.seq, ch).state === 'done') return;
          const avail = DB.inv.filter(i => i.partId === b.partId && i.location === ls && i.status === 'Available' && !MES.invHeld(i) && (part.type !== 'Assembly' || (MES.unit(i.serial) && MES.unit(i.serial).status === 'Complete')));
          if (!avail.length) short.push(b.partId);
        } else if (MES.lotAvailable(b.partId, ls).reduce((s, i) => s + i.qty, 0) + 1e-9 < b.qty) short.push(b.partId);
      });
      return { ok: !short.length, short };
    },
    /** Build an oj-table model: columns [{h, v(row) -> html, num?}] + rows. opts.rowGo(row) -> route for row action. */
    table(cols, rows, opts) {
      opts = opts || {};
      return {
        columns: cols.map(c => ({ headerText: c.h, sortable: 'disabled', className: c.num ? 'oj-helper-text-align-end' : '', headerClassName: c.num ? 'oj-helper-text-align-end' : '' })),
        dp: new ArrayDataProvider(rows.map((r, i) => ({ id: i, cells: cols.map(c => String(c.v(r) ?? '')), go: opts.rowGo ? opts.rowGo(r) : null })), { keyAttributes: 'id' }),
        count: rows.length,
        empty: opts.empty || 'Nothing to show.',
      };
    },
    rowAction(app) {
      return (event) => {
        const oe = event.detail && event.detail.originalEvent;
        if (oe && oe.target && oe.target.closest && oe.target.closest('a,oj-button,button,input')) return;
        const g = event.detail.context.item.data.go;
        if (g) app.go(g);
      };
    },
    assemblies: () => DB.parts.filter(p => p.type === 'Assembly' && DB.routings[p.id]),
  };
  return ui;
});
