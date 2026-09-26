/* Ridgeline MES — materials, traceability and admin views. */
'use strict';

/* ======================================================= INVENTORY */
V.inventory = () => {
  const f = App.ui.invf || (App.ui.invf = { loc: '', part: '', status: 'live', q: '' });
  let l = DB.inv.filter(i => i.qty > 1e-9 || i.serial);
  if (f.status === 'live') l = l.filter(i => ['Available', 'Hold'].includes(i.status));
  else if (f.status) l = l.filter(i => i.status === f.status);
  if (f.loc) l = l.filter(i => i.location === f.loc);
  if (f.part) l = l.filter(i => i.partId === f.part);
  if (f.q) { const q = f.q.toUpperCase(); l = l.filter(i => [i.partId, i.serial, i.lot, i.location, i.installedIn].join(' ').toUpperCase().includes(q)); }
  l.sort((a, b) => a.location.localeCompare(b.location) || a.partId.localeCompare(b.partId));
  const locSummary = DB.locations.map(loc => {
    const recs = DB.inv.filter(i => i.location === loc.id && i.qty > 1e-9 && ['Available', 'Hold'].includes(i.status));
    const held = recs.filter(i => MES.invHeld(i) || i.status === 'Hold').length;
    return { loc, n: recs.length, held };
  });
  const st = i => { const held = MES.invHeld(i) || i.status === 'Hold'; return held ? UI.chip('Hold') : UI.chip(i.status); };
  return UI.ph('Materials', 'Inventory', 'Lot and serial stock by location across the four buildings. Consumed serials stay here with the unit they were installed in.',
    '<button class="btn pri" data-act="receive">' + ic('box') + 'Receive material</button>') +
    '<div class="stn-grid">' + locSummary.map(s => '<a class="stn' + (s.held ? ' held' : '') + '" href="#" data-act="invloc" data-v="' + E(s.loc.id) + '" style="min-height:0"><span class="op">' + E(s.loc.id) + ' · ' + E(s.loc.type) + '</span><span class="nm">' + E(s.loc.name) + '</span><span class="q">' + s.n + ' records' + (s.held ? ' · ' + s.held + ' held' : '') + '</span></a>').join('') + '</div>' +
    UI.card(null, '<div class="filters" style="margin-bottom:12px">' +
      '<label class="f">Location<select class="in" id="invf-loc" data-change="invf" data-k="loc">' + UI.options(DB.locations.map(x => ({ v: x.id, l: x.id + ' · ' + x.name })), f.loc, { blank: 'All locations' }) + '</select></label>' +
      '<label class="f">Part<select class="in" id="invf-part" data-change="invf" data-k="part">' + UI.options(DB.parts.map(p => ({ v: p.id, l: p.id + ' · ' + p.name })), f.part, { blank: 'All parts' }) + '</select></label>' +
      '<label class="f">Status<select class="in" id="invf-status" data-change="invf" data-k="status">' + UI.options([{ v: 'live', l: 'On hand (available + held)' }, 'Available', 'Hold', 'Consumed', 'Scrap', 'RTV'], f.status, { blank: 'Everything' }) + '</select></label>' +
      '<label class="f" style="flex:1">Search<input class="in" id="invf-q" data-change="invf" data-k="q" value="' + E(f.q) + '" placeholder="Serial, lot, unit"></label></div>' +
      UI.table([
        { h: 'Part', v: i => '<span class="mono">' + E(i.partId) + '</span><div class="small muted">' + E(MES.part(i.partId).name) + '</div>' },
        { h: 'Serial / lot', v: i => i.serial ? '<span class="mono">' + E(i.serial) + '</span>' : '<span class="mono">lot ' + E(i.lot) + '</span>' },
        { h: 'Qty', num: 1, v: i => U.num(i.qty, i.serial ? 0 : (i.qty % 1 ? 1 : 0)) + ' ' + E(MES.part(i.partId).uom) },
        { h: 'Location', v: i => MES.loc(i.location) ? '<b>' + E(i.location) + '</b><div class="small muted">' + E(MES.loc(i.location).name) + '</div>' : (MES.unit(i.location) ? 'in ' + UI.serial(i.location) : E(i.location)) },
        { h: 'Status', v: st },
        { h: 'Received', v: i => U.fmtD(i.receivedAt) + '<div class="small muted">' + E(i.source || '') + '</div>' },
        { h: '', v: i => ['Available', 'Hold'].includes(i.status) && MES.loc(i.location) ? '<button class="btn sm" data-act="inv-move" data-id="' + E(i.id) + '">' + ic('truck') + 'Move</button>' : (i.serial && i.status === 'Consumed' ? UI.link('genealogy/' + i.serial, 'Trace', 'btn sm') : '') },
      ], l.slice(0, 500), { empty: 'No stock matches.' }) + (l.length > 500 ? '<div class="empty">Showing 500 of ' + l.length + '.</div>' : ''));
};
ACT.invloc = el => { App.ui.invf.loc = el.dataset.v; App.render(); };
CHANGE.invf = el => { App.ui.invf[el.dataset.k] = el.value; App.render(); };
ACT['inv-move'] = el => {
  const r = DB.inv.find(i => i.id === el.dataset.id), part = MES.part(r.partId);
  const held = MES.invHeld(r) || r.status === 'Hold';
  const dests = DB.locations.filter(l => l.id !== r.location && (!held || l.type === 'Quarantine'));
  App.modal('Move ' + (r.serial || 'lot ' + r.lot), '<p><b class="mono">' + E(r.partId) + '</b> ' + E(part.name) + ' · at ' + E(r.location) + (held ? ' · <span style="color:var(--bad)">on hold — quarantine moves only</span>' : '') + '</p><div class="fgrid">' +
    (r.serial ? '' : '<label class="f">Quantity (' + E(part.uom) + ')<input class="in num" name="qty" id="mv-qty" inputmode="decimal" value="' + E(r.qty) + '"></label>') +
    '<label class="f">To location<select class="in" name="to" id="mv-to">' + UI.options(dests.map(l => ({ v: l.id, l: l.id + ' · ' + l.name })), '') + '</select></label><label class="f wide">Reference<input class="in" name="ref" id="mv-ref" placeholder="Kanban card, request #"></label></div>',
    '<button type="button" class="btn" data-act="modal-close">Cancel</button><button type="submit" class="btn pri">' + ic('truck') + 'Post move</button>',
    { onSubmit: fd => { const res = MES.transfer(r.id, r.serial ? 1 : Number(fd.get('qty')), fd.get('to'), DB.currentUser, fd.get('ref')); if (res.ok) App.commit(res, 'Moved to ' + fd.get('to')); return res; } });
};
ACT.receive = () => {
  const p = MES.currentUser();
  if (!['Material Handler', 'Supervisor', 'Quality Engineer'].includes(p.role)) return App.toast('Receiving is posted by material handlers. Switch user to Rosa Jimenez or Tom Becker.', 'warn');
  App.ui.rcvPart = App.ui.rcvPart || 'TC-4401';
  App.modal('Receive material', '<div id="rcv-fields">' + ACT.rcvFields(App.ui.rcvPart) + '</div>', '<button type="button" class="btn" data-act="modal-close">Cancel</button><button type="submit" class="btn pri">' + ic('box') + 'Post receipt</button>',
    { wide: true, onSubmit: fd => {
      const part = MES.part(fd.get('partId'));
      const serials = part.tracking === 'Serial' ? String(fd.get('serials') || '').split(/[\s,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean) : null;
      const r = MES.receive({ partId: part.id, lot: String(fd.get('lot') || '').trim() || null, qty: Number(fd.get('qty')), serials, to: fd.get('to'), by: DB.currentUser, supplierRef: fd.get('ref') });
      if (r.ok) App.commit(r, 'Received ' + (serials ? serials.length + ' × ' : fd.get('qty') + ' ' + part.uom + ' ') + part.id);
      return r;
    } });
};
ACT.rcvFields = pid => {
  const part = MES.part(pid);
  const bought = DB.parts.filter(p => p.type === 'Purchased');
  let s = '<div class="fgrid"><label class="f">Part<select class="in" name="partId" id="rcv-part" data-change="rcv-part">' + UI.options(bought.map(p => ({ v: p.id, l: p.id + ' · ' + p.name })), pid) + '</select></label>' +
    '<label class="f">Receive to<select class="in" name="to" id="rcv-to">' + UI.options(DB.locations.filter(l => l.building === 'B40').map(l => ({ v: l.id, l: l.id + ' · ' + l.name })), 'B40-RCV') + '</select></label>' +
    '<label class="f">ASN / packing slip<input class="in" name="ref" id="rcv-ref" placeholder="ASN 4471"></label>';
  if (part.tracking === 'Serial') {
    const example = (DB.inv.filter(i => i.partId === pid).pop() || {}).serial || '';
    s += '<label class="f wide">Serial numbers (one per line)<textarea class="in mono" name="serials" id="rcv-serials" placeholder="' + E(example) + '"></textarea><span class="small muted">Mask <span class="mono">' + E(part.pattern) + '</span> · each serial is checked for format and duplicates.</span></label>';
  } else {
    s += '<label class="f">Supplier lot<input class="in mono" name="lot" id="rcv-lot" placeholder="e.g. L261001-130"></label><label class="f">Quantity (' + E(part.uom) + ')<input class="in num" name="qty" id="rcv-qty" inputmode="decimal"></label>';
  }
  return s + '</div><p class="small muted">Supplier: ' + E(part.supplier || '—') + ' · tracking: ' + E(part.tracking) + '</p>';
};
CHANGE['rcv-part'] = el => { App.ui.rcvPart = el.value; document.getElementById('rcv-fields').innerHTML = ACT.rcvFields(el.value); };

V.moves = () => {
  const f = App.ui.mvf || (App.ui.mvf = { type: '', q: '' });
  let l = DB.moves.slice().reverse();
  if (f.type) l = l.filter(m => m.type === f.type);
  if (f.q) { const q = f.q.toUpperCase(); l = l.filter(m => [m.partId, m.serial, m.lot, m.from, m.to, m.ref].join(' ').toUpperCase().includes(q)); }
  const types = [...new Set(DB.moves.map(m => m.type))];
  const loc = x => MES.loc(x) ? '<span data-tip="' + E(MES.loc(x).name) + '">' + E(x) + '</span>' : MES.unit(x) ? UI.serial(x) : '<span class="muted">' + E(x) + '</span>';
  return UI.ph('Materials', 'Material Movements', 'Ledger of receipts, transfers, installs, backflush consumption, production receipts, scrap and returns.') +
    UI.card(null, '<div class="filters" style="margin-bottom:12px"><div class="seg"><button type="button" class="' + (!f.type ? 'on' : '') + '" data-act="mvf" data-v="">All</button>' + types.map(t => '<button type="button" class="' + (f.type === t ? 'on' : '') + '" data-act="mvf" data-v="' + E(t) + '">' + E(t) + '</button>').join('') + '</div>' +
      '<label class="f" style="flex:1">Search<input class="in" id="mvf-q" data-change="mvf" value="' + E(f.q) + '" placeholder="Part, serial, lot, location"></label></div>' +
      UI.table([
        { h: 'When', v: m => '<span class="nowrap">' + U.fmtDT(m.at) + '</span>' },
        { h: 'Type', v: m => '<span class="tag">' + E(m.type) + '</span>' },
        { h: 'Part', v: m => '<span class="mono">' + E(m.partId) + '</span>' },
        { h: 'Serial / lot', v: m => '<span class="mono">' + E(m.serial || (m.lot ? 'lot ' + m.lot : '')) + '</span>' },
        { h: 'Qty', num: 1, v: m => m.qty },
        { h: 'From', v: m => loc(m.from) },
        { h: 'To', v: m => loc(m.to) },
        { h: 'By', v: m => E(MES.userName(m.by)) },
        { h: 'Reference', v: m => '<span class="small">' + E(m.ref || '') + '</span>' },
      ], l.slice(0, 400)) + (l.length > 400 ? '<div class="empty">Showing latest 400 of ' + l.length + '.</div>' : ''));
};
ACT.mvf = el => { App.ui.mvf.type = el.dataset.v; App.render(); };
CHANGE.mvf = el => { App.ui.mvf.q = el.value; App.render(); };

/* ======================================================= GENEALOGY */
V.genealogy = q => {
  if (q && MES.unit(q)) return V.tree(q);
  const vehicles = DB.units.filter(u => u.itemId === 'VEH-T1').slice().reverse();
  const search = '<form data-form="gsearch" class="row" style="gap:8px"><input class="in mono" style="flex:1;min-width:220px" name="q" id="gen-q" value="' + E(q || '') + '" placeholder="VIN, engine/body serial, component serial or lot number"><button class="btn pri">' + ic('search') + 'Trace</button></form>';
  let wu = '';
  if (q) {
    const hits = MES.whereUsed(q);
    const rec = DB.inv.find(i => (i.serial || '').toUpperCase() === q.toUpperCase() || (i.lot || '').toUpperCase() === q.toUpperCase());
    const drs = DB.drs.filter(d => d.compSerial === q || d.lot === q);
    wu = UI.card('Where-used · <span class="mono">' + E(q) + '</span>', (rec ? '<div style="padding:12px 16px 0">' + UI.kv([['Part', '<span class="mono">' + E(rec.partId) + '</span> ' + E(MES.part(rec.partId).name)], ['Supplier', E(MES.part(rec.partId).supplier || '—')], ['Received', U.fmtDT(rec.receivedAt) + ' · ' + E(rec.source || '')], rec.serial ? ['Status', UI.chip(rec.status) + ' ' + (rec.installedIn ? 'in ' + UI.serial(rec.installedIn) : 'at ' + E(rec.location))] : null, drs.length ? ['Discrepancies', drs.map(d => UI.drLink(d.id) + ' ' + UI.chip(d.status)).join(' ')] : null, MES.invHeld(rec) ? ['Hold', UI.chip('Hold', 'On quality hold')] : null]) + '</div>' : '') +
      UI.table([
        { h: 'Installed in', v: h => UI.serial(h.serial) + ' · OP' + h.seq },
        { h: 'How', v: h => E(h.how) },
        { h: 'Top-level unit', v: h => UI.serial(h.top) + ' ' + (MES.unit(h.top) ? UI.unitStateChip(MES.unit(h.top)) : '') },
        { h: '', v: h => UI.link('genealogy/' + h.top, 'Open tree', 'btn sm') },
      ], hits, { empty: 'Not installed in any unit.' }), { flush: true });
  }
  return UI.ph('Traceability', 'As-Built Genealogy', 'Trace down from a VIN to every serialized component and material lot, or up from a component or lot to every vehicle that contains it.') +
    UI.card(null, search) + wu +
    UI.card('Vehicles (' + vehicles.length + ')', UI.table([
      { h: 'VIN', v: u => '<b class="mono">' + E(u.serial) + '</b>' },
      { h: 'State', v: u => UI.unitStateChip(u) },
      { h: 'Body', v: u => { const c = u.components.find(x => x.slot === 'Body'); return c ? '<span class="mono small">' + E(c.serial) + '</span>' : '<span class="muted">—</span>'; } },
      { h: 'Engine', v: u => { const c = u.components.find(x => x.slot === 'Engine'); return c ? '<span class="mono small">' + E(c.serial) + '</span>' : '<span class="muted">—</span>'; } },
      { h: 'Serialized parts', num: 1, v: u => { const t = MES.tree(u.serial); let n = 0; const walk = x => { (x.children || []).forEach(c => { n++; walk(c); }); }; walk(t); return n; } },
      { h: 'DRs', num: 1, v: u => DB.drs.filter(d => d.serial === u.serial).length },
      { h: 'Released', v: u => U.fmtDT(u.completedAt) },
    ], vehicles, { rowGo: u => 'genealogy/' + u.serial }), { flush: true });
};
FORMS.gsearch = fd => { const q = String(fd.get('q') || '').trim().toUpperCase(); if (q) App.go('genealogy/' + q); };

V.tree = serial => {
  const t = MES.tree(serial), top = MES.unit(serial);
  const sel = App.ui.gsel && App.ui.gsel.root === serial ? App.ui.gsel.node : serial;
  const node = (n, isTop) => {
    const part = MES.part(n.itemId), asm = !n.leaf;
    const u = asm ? MES.unit(n.serial) : null;
    const flags = asm ? (MES.unitHeld(n.serial) ? UI.chip('On Hold') : DB.drs.some(d => d.serial === n.serial && MES.DR_OPEN.includes(d.status)) ? '<span class="chip warn">Open DR</span>' : '') : (DB.drs.some(d => d.compSerial === n.serial) ? '<span class="chip warn">DR</span>' : '');
    let h = '<li><div class="node' + (asm ? ' asm' : '') + (isTop ? ' top' : '') + (sel === n.serial ? ' sel' : '') + '" data-act="gnode" data-root="' + E(serial) + '" data-node="' + E(n.serial) + '" tabindex="0">' + (n.slot ? '<span class="slot">' + E(n.slot) + '</span>' : '') + '<span class="sn">' + E(n.serial) + '</span><span class="pn">' + E(part.id) + ' · ' + E(part.name) + '</span>' + (u ? UI.unitStateChip(u) : '') + flags + '</div>';
    if (asm) {
      const lots = {}; (n.lots || []).forEach(l => { const k = l.partId + '|' + l.lot; lots[k] = (lots[k] || 0) + l.qty; });
      const lotHtml = Object.keys(lots).length ? '<div class="lots">' + Object.entries(lots).map(([k, q]) => { const [p, l] = k.split('|'); const held = MES.activeHolds('Lot', k).length; return '<a href="#/genealogy/' + E(l) + '" data-go="genealogy/' + E(l) + '" class="tag" style="' + (held ? 'background:var(--bad-soft);color:var(--bad)' : '') + '" data-tip="' + E(MES.part(p).name + ' · ' + U.num(q, q % 1 ? 1 : 0) + ' ' + MES.part(p).uom + (held ? '\nLOT ON QUALITY HOLD' : '')) + '">' + E(p) + ' · ' + E(l) + '</a>'; }).join('') + '</div>' : '';
      h += '<ul>' + (lotHtml ? '<li style="padding-left:0">' + lotHtml + '</li>' : '') + n.children.map(c => node(c)).join('') + '</ul>';
    }
    return h + '</li>';
  };
  // details for selected node
  let det;
  const su = MES.unit(sel);
  if (su) {
    const drs = DB.drs.filter(d => d.serial === sel), tests = DB.tests.filter(x => x.serial === sel), sigs = DB.sigs.filter(s => s.ctxType === 'Operation' && s.ctx.startsWith(sel + '|'));
    det = UI.kv([
      ['Serial', '<b class="mono">' + E(sel) + '</b>'],
      ['Item', E(su.itemId) + ' · ' + E(MES.part(su.itemId).name)],
      ['State', UI.unitStateChip(su)],
      ['Job / plan', E(su.jobId) + ' · ' + UI.link('plan/' + su.planId, E(su.planId))],
      ['Built', U.fmtDT(su.launchedAt) + ' → ' + U.fmtDT(su.completedAt)],
      su.parent ? ['Installed in', UI.serial(su.parent)] : null,
      ['Inspection records', MES.results(sel).length + ' readings · ' + sigs.length + ' sign-offs'],
      ['Tests', tests.length ? tests.map(x => UI.link('test/' + x.id, E(x.testType)) + ' ' + UI.chip(x.result)).join('<br>') : '—'],
      ['Discrepancies', drs.length ? drs.map(d => UI.drLink(d.id) + ' ' + UI.chip(d.status)).join('<br>') : 'None'],
    ]) + '<div style="margin-top:12px">' + UI.link('unit/' + sel, ic('list') + 'Full as-built record', 'btn pri') + '</div>';
  } else {
    const rec = DB.inv.find(i => i.serial === sel), part = rec && MES.part(rec.partId);
    const host = DB.units.find(u => u.components.some(c => c.serial === sel));
    const c = host && host.components.find(x => x.serial === sel);
    const att = DB.attempts.filter(a => a.scanned === sel);
    det = rec ? UI.kv([
      ['Serial', '<b class="mono">' + E(sel) + '</b>'],
      ['Part', '<span class="mono">' + E(part.id) + '</span> ' + E(part.name)],
      ['Supplier', E(part.supplier || '—')],
      ['Received', U.fmtDT(rec.receivedAt) + ' · ' + E(rec.source || '')],
      host ? ['Installed', UI.serial(host.serial) + ' · ' + E(c.slot) + ' at OP' + c.seq + '<div class="small muted">' + U.fmtDT(c.at) + ' by ' + E(MES.userName(c.by)) + '</div>'] : null,
      ['Scan history', att.map(a => (a.ok ? '✓ ' : '✕ ') + U.fmtDT(a.at) + ' ' + E(a.serial) + (a.ok ? '' : ' — ' + E(a.msg))).join('<br>') || '—'],
      ['Discrepancies', DB.drs.filter(d => d.compSerial === sel).map(d => UI.drLink(d.id)).join(', ') || 'None'],
    ]) : '<div class="empty">No record.</div>';
  }
  return '<div class="crumbs">' + UI.link('genealogy', 'Genealogy') + ' / ' + E(serial) + '</div>' +
    UI.ph('As-built genealogy · ' + E(MES.part(top.itemId).name), '<span class="mono" style="font-size:.85em">' + E(serial) + '</span>', top.itemId === 'VEH-T1' ? 'VIN check digit ' + (U.vinValid(serial) ? '✓ valid' : '✕ invalid') + ' · ' + (top.parent ? '' : 'top-level unit') : (top.parent ? 'Installed in ' + UI.serial(top.parent) : 'Not yet installed'), UI.link('unit/' + serial, ic('list') + 'As-built record', 'btn')) +
    '<div class="grid g-main">' + UI.card('Component tree', '<ul class="tree">' + node(t, true) + '</ul>', { hint: 'Click any node for details. Lot chips open where-used.' }) +
    UI.card('Selected: <span class="mono">' + E(sel) + '</span>', det) + '</div>';
};
ACT.gnode = el => { App.ui.gsel = { root: el.dataset.root, node: el.dataset.node }; App.ui.noFocus = true; App.render(); };

/* ======================================================= UNIT AS-BUILT RECORD (traveler) */
V.unit = serial => {
  const u = MES.unit(serial);
  if (!u) return UI.ph('Traceability', 'Unit not found', E(serial));
  const plan = MES.plan(u.planId);
  const drs = DB.drs.filter(d => d.serial === serial);
  const holds = DB.holds.filter(h => h.type === 'Unit' && h.target === serial);
  const cur = MES.currentOp(u);
  const opCards = MES.routing(u.itemId).map(o => {
    const s = u.ops[o.seq], chars = MES.planChars(plan, o.seq);
    const test = DB.tests.find(t => t.serial === serial && t.seq === o.seq);
    const rows = chars.map(c => {
      const st = MES.charState(u, o.seq, c), hist = MES.results(serial, o.seq, c.id);
      let val = '—', res = '';
      if (c.type === 'signoff') { val = st.sig ? E(st.sig.name) + ' <span class="small muted">' + U.fmtDT(st.sig.at) + ' · ' + st.sig.id + '</span>' : '<span class="muted">not signed</span>'; res = st.sig ? UI.chip('Done', 'Signed') : ''; }
      else if (st.r) { val = '<span class="mono">' + E(c.type === 'measure' || c.type === 'calc' ? U.num(st.r.value, c.dec) + ' ' + c.unit : st.r.value) + '</span>' + (hist.length > 1 ? ' <span class="tag" data-tip="' + E(hist.map(r => U.fmtDT(r.at) + '  ' + r.value + '  ' + r.result).join('\n')) + '">' + hist.length + ' readings</span>' : ''); res = UI.chip(st.state === 'accepted' ? 'PASS (MRB)' : st.r.result, st.state === 'accepted' ? 'Accepted (MRB)' : st.r.result) + (st.r.drId ? ' ' + UI.drLink(st.r.drId) : ''); }
      return '<tr><td class="mono small">' + E(c.code) + '</td><td>' + UI.typeIc(c.type) + '</td><td>' + E(c.name) + '</td><td class="small mono">' + E(UI.spec(c) || (c.type === 'serial' ? c.partId : '')) + '</td><td>' + val + '</td><td>' + res + '</td></tr>';
    }).join('');
    const lots = u.consumed.filter(x => x.seq === o.seq);
    return '<section class="card"><div class="hd"><div class="optitle"><span class="seq">OP' + o.seq + '</span><h3>' + E(o.name) + '</h3><span class="muted small">' + E(o.station) + '</span>' + UI.chip(s.status === 'Done' ? 'Done' : s.status === 'Active' ? 'Active' : 'Pending', s.status) + '</div><div class="acts small muted">' +
      (s.start ? E(MES.userName(s.operator)) + ' · ' + U.fmtDT(s.start) + (s.end ? ' → ' + U.fmtT(s.end) + ' (' + U.dur(s.end - s.start) + ')' : '') : '') + (test ? ' · ' + UI.link('test/' + test.id, E(test.id)) : '') +
      (cur && cur.seq === o.seq && u.status !== 'Complete' ? ' ' + UI.link('station/' + o.station + '/' + serial, 'Open at station', 'btn sm pri') : '') + '</div></div>' +
      (rows ? '<div class="bd flush"><div class="tw"><table class="t"><thead><tr><th>Code</th><th>Type</th><th>Characteristic</th><th>Spec</th><th>Recorded</th><th>Result</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="bd flush">') +
      (lots.length ? '<div class="small" style="padding:8px 16px;border-top:1px solid var(--line-2)"><span class="muted">Backflushed:</span> ' + lots.map(l => '<span class="mono">' + E(l.partId) + '</span> lot ' + UI.link('genealogy/' + l.lot, '<span class="mono">' + E(l.lot) + '</span>') + ' × ' + l.qty).join(' · ') + '</div>' : '') + '</div></section>';
  }).join('');
  const comps = u.components.map(c => '<li><span class="mono">' + E(c.serial) + '</span> · ' + E(c.slot) + ' <span class="muted small">OP' + c.seq + ' · ' + U.fmtDT(c.at) + '</span></li>').join('');
  return '<div class="crumbs">' + UI.link('genealogy', 'Genealogy') + ' / ' + E(serial) + '</div>' +
    UI.ph('As-built record · ' + E(MES.part(u.itemId).name), '<span class="mono" style="font-size:.85em">' + E(serial) + '</span> ' + UI.unitStateChip(u), 'Job ' + UI.link('job/' + u.jobId, E(u.jobId)) + ' · built to ' + UI.link('plan/' + u.planId, E(u.planId)) + ' · ' + (u.status === 'Complete' ? 'released ' + U.fmtDT(u.completedAt) : 'at OP' + cur.seq + ' ' + E(cur.name)),
      UI.link('genealogy/' + serial, ic('tree') + 'Genealogy tree', 'btn') + (u.status !== 'Complete' ? UI.link('station/' + cur.station + '/' + serial, ic('station') + 'Open at station', 'btn pri') : '')) +
    '<div class="opbar">' + MES.routing(u.itemId).map(x => '<div class="o ' + u.ops[x.seq].status + '">' + x.seq + ' ' + E(x.name) + '</div>').join('') + '</div>' +
    '<div class="grid g-main"><div class="stack">' + opCards + '</div><div class="stack">' +
    UI.card('Unit', UI.kv([
      ['Item', UI.link('item/' + u.itemId, E(u.itemId))],
      ['Launched', U.fmtDT(u.launchedAt) + ' by ' + E(MES.userName(u.launchedBy))],
      ['Completed', U.fmtDT(u.completedAt)],
      ['Location', u.parent ? 'Installed in ' + UI.serial(u.parent) : E(u.location)],
      u.itemId === 'VEH-T1' ? ['VIN check digit', E(serial[8]) + ' ' + (U.vinValid(serial) ? '✓ valid' : '✕')] : null,
    ])) +
    UI.card('Installed components (' + u.components.length + ')', comps ? '<ul class="tl">' + comps + '</ul>' : '<div class="empty">None yet.</div>', { flush: true, acts: UI.link('genealogy/' + serial, 'Tree', 'btn sm') }) +
    UI.card('Discrepancies (' + drs.length + ')', drs.length ? '<ul class="attn">' + drs.map(d => '<li><div class="tx"><b>' + UI.drLink(d.id) + ' · ' + E(d.title) + '</b>' + (d.disposition ? E(d.disposition) + ' · ' : '') + 'OP' + (d.seq || '—') + '</div>' + UI.chip(d.status) + '</li>').join('') + '</ul>' : '<div class="empty">No discrepancies. First-pass build.</div>', { flush: true }) +
    (holds.length ? UI.card('Hold history', '<ul class="tl">' + holds.map(h => '<li><div class="w">' + U.fmtDT(h.at) + (h.releasedAt ? ' → ' + U.fmtDT(h.releasedAt) : '') + '</div><b>' + E(h.id) + '</b> ' + UI.chip(h.status === 'Active' ? 'Hold' : 'Released', h.status) + '<div class="small">' + E(h.reason) + '</div></li>').join('') + '</ul>', { flush: true }) : '') +
    '</div></div>';
};

/* ======================================================= ITEMS */
V.items = () => UI.ph('Administration', 'Items, BOMs & Routings', 'Item master for the Trailhand T1 program: three manufactured assemblies and their purchased components.') +
  UI.card('Manufactured assemblies', UI.table([
    { h: 'Item', v: p => '<b class="mono">' + E(p.id) + '</b>' },
    { h: 'Description', v: p => E(p.name) },
    { h: 'Building', v: p => E(MES.building(p.building).name) },
    { h: 'BOM lines', num: 1, v: p => (DB.boms[p.id] || []).length },
    { h: 'Operations', num: 1, v: p => MES.routing(p.id).length },
    { h: 'Quality plan', v: p => { const a = MES.activePlan(p.id); return a ? UI.link('plan/' + a.id, E(a.id)) : '<span style="color:var(--bad)">none</span>'; } },
  ], Q.assemblies(), { rowGo: p => 'item/' + p.id }), { flush: true }) +
  UI.card('Purchased components', UI.table([
    { h: 'Part', v: p => '<span class="mono">' + E(p.id) + '</span>' },
    { h: 'Description', v: p => E(p.name) },
    { h: 'UoM', v: p => E(p.uom) },
    { h: 'Tracking', v: p => p.tracking === 'Serial' ? '<span class="typeic serial">' + ic('scan') + 'Serial</span>' : '<span class="tag">Lot</span>' },
    { h: 'Serial mask', v: p => p.pattern ? '<span class="mono small">' + E(p.pattern) + '</span>' : '' },
    { h: 'Supplier', v: p => E(p.supplier) },
    { h: 'Used on', v: p => Object.entries(DB.boms).filter(([, b]) => b.some(l => l.partId === p.id)).map(([k, b]) => E(k) + ' OP' + b.find(l => l.partId === p.id).op).join(', ') },
    { h: 'On hand', num: 1, v: p => U.num(DB.inv.filter(i => i.partId === p.id && i.status === 'Available').reduce((s, i) => s + i.qty, 0), p.uom === 'EA' || p.uom === 'KIT' ? 0 : 1) },
  ], DB.parts.filter(p => p.type === 'Purchased')), { flush: true });

V.item = id => {
  const p = MES.part(id);
  if (!p || !DB.routings[id]) return UI.ph('Items', 'Not found', E(id));
  const bom = DB.boms[id] || [];
  const plan = MES.activePlan(id);
  return '<div class="crumbs">' + UI.link('items', 'Items') + ' / ' + E(id) + '</div>' +
    UI.ph(E(MES.building(p.building).name), '<span class="mono">' + E(p.id) + '</span> · ' + E(p.name), 'Serial mask <span class="mono">' + E(p.pattern === 'VIN' ? '17-char VIN with ISO 3779 check digit' : p.pattern) + '</span>', plan ? UI.link('plan/' + plan.id, ic('plan') + 'Quality plan rev ' + plan.rev, 'btn pri') : '') +
    '<div class="grid g2">' + UI.card('Bill of materials', UI.table([
      { h: 'Op', v: b => '<span class="mono">' + b.op + '</span>' },
      { h: 'Component', v: b => (DB.routings[b.partId] ? UI.link('item/' + b.partId, '<span class="mono">' + E(b.partId) + '</span>') : '<span class="mono">' + E(b.partId) + '</span>') + '<div class="small muted">' + E(MES.part(b.partId).name) + '</div>' },
      { h: 'Position', v: b => E(b.slot || '') },
      { h: 'Qty', num: 1, v: b => b.qty + ' ' + E(MES.part(b.partId).uom) },
      { h: 'Tracking', v: b => MES.part(b.partId).tracking === 'Serial' ? '<span class="typeic serial">' + ic('scan') + 'Serial</span>' : '<span class="tag">Lot · backflush</span>' },
    ], bom), { flush: true }) +
    UI.card('Routing', UI.table([
      { h: 'Op', v: o => '<span class="mono">' + o.seq + '</span>' },
      { h: 'Operation', v: o => '<b>' + E(o.name) + '</b>' + (o.test ? ' <span class="tag">' + E(o.test) + '</span>' : '') + '<div class="small muted">' + E(o.instr.join(' ')) + '</div>' },
      { h: 'Station', v: o => UI.link('station/' + o.station, E(o.station)) + '<div class="small muted">' + E(MES.station(o.station).wc) + '</div>' },
      { h: 'Std', num: 1, v: o => o.stdMin + ' min' },
      { h: 'Plan items', num: 1, v: o => plan ? MES.planChars(plan, o.seq).length : 0 },
    ], MES.routing(id)), { flush: true }) + '</div>';
};

/* ======================================================= PEOPLE */
V.people = () => {
  const ops = DB.people.filter(p => p.quals.length);
  const today = U.dayKey(MES.now());
  const matrix = '<div class="tw"><table class="t qm"><thead><tr><th>Person</th>' + DB.stations.map(s => '<th class="rot" data-tip="' + E(s.name) + '">' + E(s.id) + '</th>').join('') + '</tr></thead><tbody>' +
    ops.map(p => '<tr><td class="nowrap">' + E(p.name) + ' <span class="small muted">' + E(p.role) + '</span></td>' + DB.stations.map(s => '<td>' + (p.quals.includes(s.id) ? '<span class="y" data-tip="' + E(p.name + ' qualified on ' + s.id) + '">●</span>' : '<span class="muted">·</span>') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  return UI.ph('Administration', 'Personnel', 'Operators, material handlers, quality staff and supervisors. Station qualifications gate who can start an operation; roles gate who can sign.') +
    UI.card(null, UI.table([
      { h: '', v: p => UI.avatar(p) },
      { h: 'Name', v: p => '<b>' + E(p.name) + '</b>' + (p.id === DB.currentUser ? ' <span class="tag">signed in</span>' : '') },
      { h: 'Role', v: p => E(p.role) },
      { h: 'Badge', v: p => '<span class="mono">' + E(p.badge) + '</span>' },
      { h: 'Shift', v: p => E(p.shift) },
      { h: 'Home building', v: p => E(MES.building(p.building).short) },
      { h: 'Stations', num: 1, v: p => p.quals.length },
      { h: 'Signatures', num: 1, v: p => DB.sigs.filter(s => s.userId === p.id).length },
      { h: 'Actions today', num: 1, v: p => DB.audit.filter(a => a.by === p.id && U.dayKey(a.at) === today).length },
      { h: '', v: p => p.id === DB.currentUser ? '' : '<button class="btn sm" data-act="as-user" data-id="' + E(p.id) + '">Switch to</button>' },
    ], DB.people), { flush: true }) +
    UI.card('Station qualification matrix', matrix, { flush: true });
};
ACT['as-user'] = el => { DB.currentUser = el.dataset.id; MES.save(); App.toast('Signed in as ' + MES.userName(el.dataset.id)); App.render(); };

/* ======================================================= AUDIT */
V.audit = () => {
  const f = App.ui.auf || (App.ui.auf = { tab: 'sigs', user: '', q: '' });
  let body;
  if (f.tab === 'sigs') {
    let l = DB.sigs.slice().reverse();
    if (f.user) l = l.filter(s => s.userId === f.user);
    if (f.q) { const q = f.q.toUpperCase(); l = l.filter(s => (s.label + s.meaning + s.ctx + s.id).toUpperCase().includes(q)); }
    body = UI.table([
      { h: 'Signature', v: s => '<b class="mono">' + E(s.id) + '</b>' },
      { h: 'When', v: s => '<span class="nowrap">' + U.fmtDT(s.at) + '</span>' },
      { h: 'Signer', v: s => E(s.name) + '<div class="small muted">' + E(s.role) + '</div>' },
      { h: 'Meaning', v: s => '<i>' + E(s.meaning) + '</i>' },
      { h: 'Record', v: s => '<span class="tag">' + E(s.ctxType) + '</span> ' + (s.ctxType === 'Discrepancy' ? UI.drLink(s.ctx) : s.ctxType === 'Quality Plan' ? UI.link('plan/' + s.ctx, E(s.ctx)) : s.ctxType === 'Operation' ? UI.link('unit/' + s.ctx.split('|')[0], E(s.label)) : E(s.label)) },
      { h: 'Manifest hash', v: s => '<span class="mono small">' + E(s.hash) + '</span>' },
    ], l.slice(0, 500));
  } else {
    let l = DB.audit.slice().reverse();
    if (f.user) l = l.filter(a => a.by === f.user);
    if (f.q) { const q = f.q.toUpperCase(); l = l.filter(a => (a.action + a.ref + a.detail).toUpperCase().includes(q)); }
    body = UI.table([
      { h: 'When', v: a => '<span class="nowrap">' + U.fmtDT(a.at) + '</span>' },
      { h: 'User', v: a => E(MES.userName(a.by)) },
      { h: 'Action', v: a => '<b>' + E(a.action) + '</b>' },
      { h: 'Record', v: a => '<span class="mono small">' + E(a.ref) + '</span>' },
      { h: 'Detail', v: a => '<span class="small">' + E(a.detail) + '</span>' },
    ], l.slice(0, 500)) + (l.length > 500 ? '<div class="empty">Showing latest 500 of ' + l.length + '.</div>' : '');
  }
  return UI.ph('Administration', 'E-Signatures & Audit Trail', 'Every signature records signer, role, meaning, timestamp and a manifest hash bound to the record. The activity log is append-only.') +
    UI.card(null, '<div class="tabs" style="margin-bottom:12px"><button type="button" class="' + (f.tab === 'sigs' ? 'on' : '') + '" data-act="auf" data-k="tab" data-v="sigs">E-signatures (' + DB.sigs.length + ')</button><button type="button" class="' + (f.tab === 'log' ? 'on' : '') + '" data-act="auf" data-k="tab" data-v="log">Activity log (' + DB.audit.length + ')</button></div>' +
      '<div class="filters" style="margin-bottom:12px"><label class="f">User<select class="in" id="auf-user" data-change="auf" data-k="user">' + UI.options(DB.people.map(p => ({ v: p.id, l: p.name })), f.user, { blank: 'Everyone' }) + '</select></label><label class="f" style="flex:1">Search<input class="in" id="auf-q" data-change="auf" data-k="q" value="' + E(f.q) + '"></label></div>' + body);
};
ACT.auf = el => { App.ui.auf[el.dataset.k] = el.dataset.v; App.render(); };
CHANGE.auf = el => { App.ui.auf[el.dataset.k] = el.value; App.render(); };
