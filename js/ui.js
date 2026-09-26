/* Ridgeline MES — UI framework: router, event delegation, modals, e-signature dialog, shared components, charts. */
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
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
  truck: '<path d="M2 6h11v10H2zM13 10h5l3 3v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  tree: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
  item: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 6 4.5"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  scan: '<path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 8v8M10 8v8M13 8v8M16 8v8"/>',
  gauge: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-6"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2"/>',
  sig: '<path d="M3 17c3-4 5-9 7-9s-1 9 1 9 3-4 5-4 1 4 3 4h2"/><path d="M3 21h18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
  reset: '<path d="M4 4v6h6"/><path d="M20 12a8 8 0 0 1-14.9 4M4.1 10A8 8 0 0 1 20 12"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  audit: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  inspect: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M9 11l1.5 1.5L13 10"/>',
};
const ic = (name, cls) => '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';

const E = U.esc;

const UI = {
  chipCls(s) {
    const m = {
      'Complete': 'ok', 'Closed': 'ok', 'PASS': 'ok', 'Released': 'ok', 'Available': 'ok', 'Done': 'ok', 'PASS (MRB)': 'warn',
      'Pending Verification': 'warn', 'Rework': 'warn', 'Draft': 'warn', 'Queued': '', 'Pending': '', 'Hold': 'bad', 'Active': 'info',
      'Open': 'bad', 'FAIL': 'bad', 'On Hold': 'bad', 'Scrap': 'bad', 'Scrapped': 'bad', 'In Process': 'info', 'Superseded': '', 'Cancelled': '', 'Consumed': '', 'RTV': 'serious',
    };
    return m[s] !== undefined ? m[s] : '';
  },
  chip(s, label) { return '<span class="chip ' + UI.chipCls(s) + '">' + E(label || s) + '</span>'; },
  sev(s) { return '<span class="sev ' + E(s) + '">' + E(s) + '</span>'; },
  link(path, text, cls) { return '<a href="#/' + E(path) + '" data-go="' + E(path) + '"' + (cls ? ' class="' + cls + '"' : '') + '>' + text + '</a>'; },
  serial(s) { if (!s) return '—'; const u = MES.unit(s); return u ? UI.link('unit/' + s, '<span class="mono">' + E(s) + '</span>') : '<span class="mono">' + E(s) + '</span>'; },
  drLink(id) { return id ? UI.link('dr/' + id, '<span class="mono">' + E(id) + '</span>') : '—'; },
  person(id) {
    const p = MES.person(id);
    return p ? '<span title="' + E(p.role + ' · badge ' + p.badge) + '">' + E(p.name) + '</span>' : E(id || '—');
  },
  avatar(p, size) {
    const hues = { 'Operator': '#2a6fc4', 'Material Handler': '#8a5a00', 'Quality Technician': '#1b7a44', 'Quality Engineer': '#0b6784', 'Supervisor': '#6b4bb0' };
    const ini = p.name.split(' ').map(x => x[0]).join('').slice(0, 2);
    return '<span class="avatar" style="background:' + (hues[p.role] || '#555') + (size ? ';width:' + size + 'px;height:' + size + 'px' : '') + '">' + E(ini) + '</span>';
  },
  typeIc(t) {
    const m = { check: ['check', 'Checklist'], serial: ['scan', 'Serial validation'], measure: ['gauge', 'Measurement'], calc: ['calc', 'Calculation'], signoff: ['sig', 'Sign-off'] };
    const x = m[t] || ['list', t];
    return '<span class="typeic ' + t + '">' + ic(x[0]) + x[1] + '</span>';
  },
  ph(eyebrow, title, sub, acts) {
    return '<div class="ph"><div><div class="eyebrow">' + eyebrow + '</div><h1>' + title + '</h1>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>' + (acts ? '<div class="acts">' + acts + '</div>' : '') + '</div>';
  },
  card(title, body, o = {}) {
    return '<section class="card' + (o.cls ? ' ' + o.cls : '') + '"' + (o.id ? ' id="' + o.id + '"' : '') + '>' + (title ? '<div class="hd"><h3>' + title + '</h3>' + (o.hint ? '<span class="hint">' + o.hint + '</span>' : '') + (o.acts ? '<div class="acts">' + o.acts + '</div>' : '') + '</div>' : '') + '<div class="bd' + (o.flush ? ' flush' : '') + '">' + body + '</div></section>';
  },
  table(cols, rows, o = {}) {
    if (!rows.length) return '<div class="empty">' + (o.empty || 'Nothing to show.') + '</div>';
    return '<div class="tw"' + (o.max ? ' style="max-height:' + o.max + 'px;overflow-y:auto"' : '') + '><table class="t"><thead><tr>' + cols.map(c => '<th' + (c.num ? ' class="num"' : '') + '>' + c.h + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map(r => '<tr' + (o.rowGo ? ' class="click" data-go="' + E(o.rowGo(r)) + '"' : '') + '>' + cols.map(c => '<td' + (c.num ? ' class="num"' : '') + '>' + c.v(r) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  },
  kv(pairs) { return '<dl class="kv">' + pairs.filter(Boolean).map(([k, v]) => '<dt>' + k + '</dt><dd>' + v + '</dd>').join('') + '</dl>'; },
  sigCard(sig) {
    if (!sig) return '';
    return '<div class="sigcard">' + ic('sig') + '<div><div><b>' + E(sig.name) + '</b> · ' + E(sig.role) + ' · <i>' + E(sig.meaning) + '</i></div><div class="h">' + U.fmtDT(sig.at) + ' · ' + sig.id + ' · manifest ' + sig.hash + '</div></div></div>';
  },
  spec(ch) { return MES.specText(ch); },
  gauge(ch, v) {
    if (v === null || v === undefined || isNaN(v) || ch.lsl === ch.usl) return '';
    const span = ch.usl - ch.lsl, lo = ch.lsl - span * 0.5, hi = ch.usl + span * 0.5;
    const pos = x => Math.max(0, Math.min(100, (x - lo) / (hi - lo) * 100));
    return '<div class="gauge" data-tip="' + E('Spec ' + MES.specText(ch) + '\nValue ' + v) + '"><div class="band" style="left:' + pos(ch.lsl) + '%;right:' + (100 - pos(ch.usl)) + '%"></div><div class="pt' + (MES.inSpec(ch, v) ? '' : ' bad') + '" style="left:' + pos(v) + '%"></div></div>';
  },
  options(list, sel, o = {}) {
    return (o.blank ? '<option value="">' + E(o.blank) + '</option>' : '') + list.map(x => { const v = typeof x === 'object' ? x.v : x, l = typeof x === 'object' ? x.l : x; return '<option value="' + E(v) + '"' + (String(v) === String(sel) ? ' selected' : '') + '>' + E(l) + '</option>'; }).join('');
  },
  unitStateChip(u) { return UI.chip(MES.unitState(u)); },

  /* ---------- charts (inline SVG) ---------- */
  groupedBars(cats, series, o = {}) {
    const W = 640, Hh = o.h || 220, ml = 34, mr = 8, mt = 12, mb = 28;
    const iw = W - ml - mr, ih = Hh - mt - mb;
    const max = Math.max(1, ...series.flatMap(s => s.values));
    const step = max <= 4 ? 1 : max <= 8 ? 2 : Math.ceil(max / 4);
    const top = Math.ceil(max / step) * step;
    const y = v => mt + ih - v / top * ih;
    const gw = iw / cats.length, bw = Math.min(16, (gw - 8) / series.length - 2);
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="' + E(o.label || 'chart') + '">';
    for (let v = 0; v <= top; v += step) s += '<line class="grid-l" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (ml - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '</text>';
    cats.forEach((c, i) => {
      const gx = ml + i * gw + (gw - (bw + 2) * series.length) / 2;
      series.forEach((se, k) => {
        const v = se.values[i];
        const x = gx + k * (bw + 2), h = Math.max(0, ih - (y(v) - mt));
        const tip = c + '\n' + se.name + ': ' + v;
        if (v > 0) s += '<path d="M' + x + ',' + (mt + ih) + 'V' + (y(v) + 3) + 'q0,-3 3,-3h' + (bw - 6) + 'q3,0 3,3V' + (mt + ih) + 'z" fill="' + se.color + '"/>';
        s += '<rect x="' + (x - 1) + '" y="' + mt + '" width="' + (bw + 2) + '" height="' + ih + '" fill="transparent" data-tip="' + E(tip) + '"/>';
        void h;
      });
      s += '<text x="' + (ml + i * gw + gw / 2) + '" y="' + (Hh - 8) + '" text-anchor="middle">' + E(c) + '</text>';
    });
    s += '<line class="axis" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + (mt + ih) + '" y2="' + (mt + ih) + '"/></svg>';
    const legend = '<div class="legend">' + series.map(se => '<span><i style="background:' + se.color + '"></i>' + E(se.name) + '</span>').join('') + '</div>';
    return legend + s;
  },
  hbars(rows, o = {}) {
    if (!rows.length) return '<div class="empty">No data yet.</div>';
    const W = 420, rh = 26, ml = 112, mr = 34, Hh = rows.length * rh + 6;
    const max = Math.max(1, ...rows.map(r => r.v));
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="' + E(o.label || 'bar chart') + '">';
    rows.forEach((r, i) => {
      const y0 = 3 + i * rh, w = (W - ml - mr) * r.v / max;
      s += '<text x="' + (ml - 8) + '" y="' + (y0 + 16) + '" text-anchor="end">' + E(r.k) + '</text>';
      s += '<path d="M' + ml + ',' + (y0 + 5) + 'h' + Math.max(0, w - 4) + 'q4,0 4,4v6q0,4 -4,4h-' + Math.max(0, w - 4) + 'z" fill="' + (o.color || 'var(--series-1)') + '"/>';
      s += '<text class="val-l" x="' + (ml + w + 6) + '" y="' + (y0 + 16) + '">' + r.v + '</text>';
      s += '<rect x="0" y="' + y0 + '" width="' + W + '" height="' + rh + '" fill="transparent" data-tip="' + E(r.tip || (r.k + ': ' + r.v)) + '"/>';
    });
    return s + '</svg>';
  },
};

/* ---------------- application shell ---------------- */
const App = {
  route: 'dashboard', args: [], ui: {},
  nav: [
    ['Overview', [['dashboard', 'dash', 'Plant Dashboard']]],
    ['Production', [['jobs', 'jobs', 'Jobs & WIP'], ['dispatch', 'dispatch', 'Dispatch List'], ['station', 'station', 'Station Terminal']]],
    ['Quality', [['plans', 'plan', 'Quality Plans'], ['drs', 'alert', 'Discrepancies', () => DB.drs.filter(d => d.status === 'Open').length], ['holds', 'lock', 'Quality Holds', () => MES.activeHolds().length], ['tests', 'test', 'Test Records'], ['inspections', 'inspect', 'Inspection Log']]],
    ['Materials', [['inventory', 'box', 'Inventory'], ['moves', 'truck', 'Material Movements']]],
    ['Traceability', [['genealogy', 'tree', 'As-Built Genealogy']]],
    ['Administration', [['items', 'item', 'Items, BOMs & Routings'], ['people', 'users', 'Personnel'], ['audit', 'audit', 'E-Signatures & Audit']]],
  ],
  parse() {
    let h = '';
    try { h = decodeURIComponent((location.hash || '').replace(/^#\/?/, '')); } catch (e) { h = ''; }
    return h || 'dashboard';
  },
  go(path, replace) {
    App.setRoute(path);
    try {
      if (replace) history.replaceState(null, '', '#/' + path);
      else if (App.parse() !== path) history.pushState(null, '', '#/' + path);
    } catch (e) { /* sandboxed: in-memory routing only */ }
    App.render();
    window.scrollTo(0, 0);
  },
  setRoute(path) {
    const parts = String(path || 'dashboard').split('/');
    App.route = parts[0] || 'dashboard'; App.args = parts.slice(1);
  },
  shell() {
    const cu = MES.currentUser();
    const navHtml = App.nav.map(([g, items]) => '<div class="grp">' + g + '</div>' + items.map(([r, i, l, badge]) => {
      const n = badge ? badge() : 0;
      return '<a href="#/' + r + '" data-go="' + r + '" data-nav="' + r + '">' + ic(i) + '<span>' + l + '</span>' + (n ? '<span class="badge">' + n + '</span>' : '') + '</a>';
    }).join('')).join('');
    const users = DB.people.map(p => ({ v: p.id, l: p.name + ' — ' + p.role }));
    document.getElementById('app').innerHTML =
      '<div class="shell" id="shell"><aside class="side"><div class="brand"><div class="mark"><div class="logo">RMW</div><div><div class="t1">Ridgeline MES</div><div class="t2">' + E(DB.company.plant) + '</div></div></div></div><nav class="nav" id="nav">' + navHtml + '</nav>' +
      '<div class="foot">Trailhand T1 program · demo data<br><button class="btn sm ghost" style="color:inherit;padding-left:0" data-act="reset">' + ic('reset') + 'Reset demo data</button></div></aside>' +
      '<div class="main"><header class="top"><button class="btn sm menu-btn" data-act="menu" aria-label="Menu">' + ic('menu') + '</button>' +
      '<form data-form="search" role="search">' + ic('search') + '<input type="search" id="gsearch" name="q" placeholder="Find VIN, serial, lot, DR or job…" autocomplete="off"></form><div class="spacer"></div>' +
      '<span class="clock" id="clock"></span><div class="userbox">' + UI.avatar(cu) + '<label class="sr" style="position:absolute;left:-9999px" for="usersel">Signed-in user</label><select id="usersel" data-change="user">' + UI.options(users, cu.id) + '</select></div></header>' +
      '<main class="page" id="page"></main></div></div><div class="toasts" id="toasts"></div><div id="tip" hidden></div><div id="modal"></div>';
    App.tick();
  },
  tick() {
    const el = document.getElementById('clock');
    if (el) { const d = new Date(); el.textContent = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + U.fmtT(d.getTime()) + ' · Shift ' + (d.getHours() >= 6 && d.getHours() < 14 ? 'A' : d.getHours() >= 14 && d.getHours() < 22 ? 'B' : 'C'); }
  },
  render() {
    if (!document.getElementById('page')) App.shell();
    const nav = document.getElementById('nav');
    // refresh badges and active item
    const cu = MES.currentUser();
    const ub = document.querySelector('.userbox .avatar'); if (ub) ub.outerHTML = UI.avatar(cu);
    const sel = document.getElementById('usersel'); if (sel) sel.value = cu.id;
    App.nav.forEach(([, items]) => items.forEach(([r, , , badge]) => {
      const a = nav.querySelector('[data-nav="' + r + '"]'); if (!a) return;
      a.classList.toggle('on', r === App.route || (App.route === 'dr' && r === 'drs') || (App.route === 'plan' && r === 'plans') || (App.route === 'job' && r === 'jobs') || (App.route === 'test' && r === 'tests') || (App.route === 'unit' && r === 'genealogy') || (App.route === 'item' && r === 'items'));
      if (badge) { const n = badge(); let b = a.querySelector('.badge'); if (n) { if (!b) { b = document.createElement('span'); b.className = 'badge'; a.appendChild(b); } b.textContent = n; } else if (b) b.remove(); }
    }));
    document.getElementById('shell').classList.remove('nav-open');
    const view = V[App.route] || V.dashboard;
    let html;
    try { html = view(...App.args); } catch (e) { console.error(e); html = UI.ph('Error', 'This view failed to load', E(e.message)); }
    document.getElementById('page').innerHTML = html;
    const af = document.querySelector('[data-autofocus]'); if (af && !App.ui.noFocus) af.focus({ preventScroll: true });
    App.ui.noFocus = false;
    document.title = (App.titleFor() || 'Ridgeline MES');
  },
  titleFor() {
    const t = { dashboard: 'Plant Dashboard', jobs: 'Jobs & WIP', job: 'Job ' + (App.args[0] || ''), dispatch: 'Dispatch', station: 'Station ' + (App.args[0] || ''), plans: 'Quality Plans', plan: App.args[0], drs: 'Discrepancies', dr: App.args[0], holds: 'Quality Holds', tests: 'Test Records', test: App.args[0], inspections: 'Inspection Log', inventory: 'Inventory', moves: 'Material Movements', genealogy: 'Genealogy', unit: App.args[0], items: 'Items', item: App.args[0], people: 'Personnel', audit: 'Audit' };
    return (t[App.route] ? t[App.route] + ' · ' : '') + 'Ridgeline MES';
  },
  commit(res, okMsg, o = {}) {
    if (!res || !res.ok) { App.toast((res && res.msg) || 'Action failed.', 'bad'); return false; }
    MES.save();
    if (okMsg) App.toast(okMsg, o.kind || 'ok');
    if (!o.noRender) App.render();
    return true;
  },
  toast(msg, kind) {
    const box = document.getElementById('toasts'); if (!box) return;
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || 'ok'); t.textContent = msg; t.setAttribute('role', 'status');
    box.appendChild(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.remove(), kind === 'bad' ? 6500 : 3500);
  },

  /* ---------------- modals ---------------- */
  modal(title, body, foot, o = {}) {
    document.getElementById('modal').innerHTML = '<div class="overlay" data-act="modal-bg"><div class="modal' + (o.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + E(title) + '"><div class="mh"><h3>' + title + '</h3><button class="btn sm ghost x" data-act="modal-close" aria-label="Close">' + ic('x') + '</button></div><form data-form="modal" id="modal-form"><div class="mb">' + body + '<div class="err" id="modal-err" hidden></div></div><div class="mf">' + foot + '</div></form></div></div>';
    App.ui.modalSubmit = o.onSubmit || null;
    const f = document.querySelector('#modal [data-autofocus], #modal input:not([type=hidden]), #modal select, #modal textarea');
    if (f) setTimeout(() => f.focus(), 20);
  },
  closeModal() { document.getElementById('modal').innerHTML = ''; App.ui.modalSubmit = null; },
  modalError(msg) { const e = document.getElementById('modal-err'); if (e) { e.textContent = msg; e.hidden = false; } },
  sigBlock(role, meaning, def) {
    const signers = MES.eligibleSigners(role);
    const cu = MES.currentUser();
    const sel = def || (signers.find(p => p.id === cu.id) ? cu.id : (signers[0] && signers[0].id));
    return '<div class="sig-box"><div class="row" style="gap:8px">' + ic('sig') + '<b>Electronic signature</b><span class="tag">' + E(role) + '</span><span class="tag">Meaning: ' + E(meaning) + '</span></div>' +
      '<div class="fgrid"><label class="f">Signer<select class="in" name="signer" id="sig-signer">' + UI.options(signers.map(p => ({ v: p.id, l: p.name + ' (' + p.role + ', badge ' + p.badge + ')' })), sel) + '</select></label>' +
      '<label class="f">PIN<input class="in" type="password" name="pin" id="sig-pin" inputmode="numeric" autocomplete="off" placeholder="4-digit PIN" data-autofocus></label></div>' +
      '<div class="stmt">By signing, I confirm the record above is accurate and that I am the person identified. This signature is linked to the record and cannot be edited or removed. <span class="muted">(Demo PIN for everyone: 1234)</span></div></div>';
  },
  /* generic signature dialog */
  signDialog({ title, summary, role, meaning, extra, confirm, danger }, onSign) {
    App.modal(title, (summary || '') + (extra || '') + App.sigBlock(role, meaning),
      '<button type="button" class="btn" data-act="modal-close">Cancel</button><button type="submit" class="btn ' + (danger ? 'danger solid' : 'pri') + '">' + ic('sig') + E(confirm || 'Sign') + '</button>',
      { onSubmit: fd => onSign(fd.get('signer'), fd.get('pin'), fd) });
  },
};

/* ---------------- global events ---------------- */
document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  if (go && !e.target.closest('[data-act]') && !(e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    App.go(go.getAttribute('data-go'));
    return;
  }
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const name = a.getAttribute('data-act');
  if (name === 'modal-bg' && e.target !== a) return;
  if (ACT[name]) { e.preventDefault(); ACT[name](a, e); }
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const name = f.getAttribute('data-form');
  const fd = new FormData(f);
  if (name === 'modal') {
    if (App.ui.modalSubmit) {
      const r = App.ui.modalSubmit(fd, f);
      if (r && r.ok === false) App.modalError(r.msg);
      else if (r !== undefined && r !== null && r !== false) App.closeModal();
    }
    return;
  }
  if (FORMS[name]) FORMS[name](fd, f, e.submitter);
});
document.addEventListener('change', e => {
  const c = e.target.closest('[data-change]');
  if (c && CHANGE[c.getAttribute('data-change')]) CHANGE[c.getAttribute('data-change')](c, e);
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.hasAttribute('data-lsl')) {
    const v = parseFloat(el.value), lsl = Number(el.dataset.lsl), usl = Number(el.dataset.usl);
    el.classList.remove('live-ok', 'live-bad');
    if (el.value !== '' && !isNaN(v)) el.classList.add(v >= lsl - 1e-9 && v <= usl + 1e-9 ? 'live-ok' : 'live-bad');
  }
  const c = el.closest('[data-input]');
  if (c && INPUT[c.getAttribute('data-input')]) INPUT[c.getAttribute('data-input')](c, e);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.querySelector('#modal .overlay')) App.closeModal(); });
window.addEventListener('popstate', () => { App.setRoute(App.parse()); App.render(); });
window.addEventListener('hashchange', () => { const p = App.parse(); if (p !== [App.route, ...App.args].join('/')) { App.setRoute(p); App.render(); } });
document.addEventListener('mousemove', e => {
  const tip = document.getElementById('tip'); if (!tip) return;
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (!t) { tip.hidden = true; return; }
  tip.textContent = t.getAttribute('data-tip'); tip.hidden = false;
  const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8), y = Math.min(e.clientY + 14, window.innerHeight - tip.offsetHeight - 8);
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
});

const V = {};      // views
const ACT = {};    // click actions
const FORMS = {};  // form submit handlers
const CHANGE = {}; // change handlers
const INPUT = {};  // input handlers

ACT['modal-close'] = () => App.closeModal();
ACT['modal-bg'] = () => App.closeModal();
ACT.menu = () => document.getElementById('shell').classList.toggle('nav-open');
ACT.reset = () => App.modal('Reset demo data?', '<p>This discards every change made in this browser and rebuilds the seeded plant history (about 12 days of production on three jobs), anchored to the current time.</p>',
  '<button type="button" class="btn" data-act="modal-close">Keep my data</button><button type="submit" class="btn danger solid">' + ic('reset') + 'Reset data</button>',
  { onSubmit: () => { MES.reset(); App.closeModal(); App.shell(); App.render(); App.toast('Demo data rebuilt.'); return null; } });
CHANGE.user = el => { DB.currentUser = el.value; MES.save(); const p = MES.currentUser(); App.toast('Signed in as ' + p.name + ' (' + p.role + ')'); App.render(); };
FORMS.search = fd => {
  const q = String(fd.get('q') || '').trim().toUpperCase();
  if (!q) return;
  if (MES.unit(q)) return App.go('unit/' + q);
  if (MES.dr(q)) return App.go('dr/' + q);
  if (MES.job(q)) return App.go('job/' + q);
  if (MES.plan(q)) return App.go('plan/' + q);
  if (DB.tests.find(t => t.id === q)) return App.go('test/' + q);
  const inv = DB.inv.find(i => (i.serial || '').toUpperCase() === q || (i.lot || '').toUpperCase() === q);
  if (inv || MES.whereUsed(q).length) return App.go('genealogy/' + q);
  const part = DB.parts.find(p => p.id.toUpperCase() === q);
  if (part) return App.go(DB.routings[part.id] ? 'item/' + part.id : 'inventory');
  const partial = DB.units.find(u => u.serial.includes(q));
  if (partial) return App.go('unit/' + partial.serial);
  App.toast('No VIN, serial, lot, discrepancy or job matches "' + q + '".', 'warn');
};
setInterval(() => App.tick(), 30000);
