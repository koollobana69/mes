/* Ridgeline MES — quality views: plans & plan editor, discrepancies, holds, tests, inspection log. */
'use strict';

const Q = {
  assemblies: () => DB.parts.filter(p => p.type === 'Assembly' && DB.routings[p.id]),
  countTypes(plan) {
    const c = { check: 0, serial: 0, measure: 0, calc: 0, signoff: 0 };
    Object.values(plan.steps).flat().forEach(x => { c[x.type] = (c[x.type] || 0) + 1; });
    return c;
  },
  typeSummary(plan) {
    const c = Q.countTypes(plan);
    return '<span class="row" style="gap:4px">' + ['serial', 'check', 'measure', 'calc', 'signoff'].filter(t => c[t]).map(t => '<span class="typeic ' + t + '" data-tip="' + E(c[t] + ' ' + t) + '">' + c[t] + '</span>').join('') + '</span>';
  },
  isQE() { const p = MES.currentUser(); return p.role === 'Quality Engineer'; },
  needQE() { App.toast('Quality plans and MRB decisions belong to Quality Engineers. Switch user to Priya Shah or Daniel Okafor.', 'warn'); },
};

/* ======================================================= QUALITY PLANS */
V.plans = () => {
  const cards = Q.assemblies().map(item => {
    const plans = MES.plansFor(item.id), draft = MES.draftFor(item.id), act = MES.activePlan(item.id);
    const acts = draft ? UI.link('plan/' + draft.id, ic('pen') + 'Open draft rev ' + draft.rev, 'btn sm pri') : '<button class="btn sm pri" data-act="plan-new" data-item="' + E(item.id) + '">' + ic('plus') + (plans.length ? 'New revision' : 'Create quality plan') + '</button>';
    return UI.card('<span class="mono">' + E(item.id) + '</span> · ' + E(item.name), UI.table([
      { h: 'Plan', v: p => '<b class="mono">' + E(p.id) + '</b>' },
      { h: 'Rev', v: p => '<b>' + E(p.rev) + '</b>' },
      { h: 'Status', v: p => UI.chip(p.status) },
      { h: 'Plan items', v: p => Q.typeSummary(p) },
      { h: 'Ops covered', num: 1, v: p => Object.values(p.steps).filter(s => s.length).length + ' / ' + MES.routing(p.itemId).length },
      { h: 'Units built', num: 1, v: p => DB.units.filter(u => u.planId === p.id).length },
      { h: 'Approved', v: p => p.releasedAt ? E(MES.userName(p.releasedBy)) + '<div class="small muted">' + U.fmtD(p.releasedAt) + '</div>' : '<span class="muted">—</span>' },
      { h: 'Change note', v: p => '<span class="small">' + E(p.changeNote || '') + '</span>' },
    ], plans, { rowGo: p => 'plan/' + p.id, empty: 'No quality plan yet. Create one to define inspection, serial validation, measurements and sign-offs per routing step.' }), { flush: true, acts, hint: act ? 'Production uses rev ' + act.rev : 'No released revision' });
  }).join('');
  return UI.ph('Quality', 'Quality Plans', 'One quality plan per assembly item number. Each plan ties routing operations to checklists, serial validation, measurements, calculations and sign-offs. Released revisions are locked; changes go through a new revision and QE e-signature.') +
    '<div class="banner info">' + ic('plan') + '<div class="tx"><b>How it runs on the floor:</b> a unit is locked to the plan revision released when it was launched. At each station the terminal renders that operation’s plan items; out-of-tolerance readings, failed checks and rejected scans raise discrepancies automatically.</div></div>' + cards;
};
ACT['plan-new'] = el => {
  if (!Q.isQE()) return Q.needQE();
  const item = el.dataset.item, has = MES.plansFor(item).length;
  App.modal(has ? 'New revision · ' + item : 'Create quality plan · ' + item, has ? '<p>Create a draft revision of <b>' + E(item) + '</b>. Start from a copy of the latest revision, or from a blank plan.</p><label class="f">Start from<select class="in" name="blank" id="plan-blank"><option value="">Copy of latest revision (' + E(MES.plansFor(item)[0].id) + ')</option><option value="1">Blank plan</option></select></label>' : '<p>Creates a blank draft plan with a step for every routing operation of ' + E(item) + '.</p>',
    '<button type="button" class="btn" data-act="modal-close">Cancel</button><button type="submit" class="btn pri">' + ic('plus') + 'Create draft</button>',
    { onSubmit: fd => { const r = MES.newRevision(item, DB.currentUser, !!fd.get('blank')); if (r.ok) { MES.save(); App.closeModal(); App.go('plan/' + r.plan.id); App.toast('Draft ' + r.plan.id + ' created'); return null; } return r; } });
};

V.plan = id => {
  const plan = MES.plan(id);
  if (!plan) return UI.ph('Quality plans', 'Plan not found', E(id));
  const item = MES.part(plan.itemId), draft = plan.status === 'Draft';
  const base = plan.basedOn ? MES.plan(plan.basedOn) : null;
  const baseKeys = base ? new Set(Object.entries(base.steps).flatMap(([s, cs]) => cs.map(c => s + '|' + c.type + '|' + c.name + '|' + (c.lsl ?? '') + '|' + (c.usl ?? '') + '|' + (c.formula || '')))) : null;
  const issues = MES.planIssues(plan);
  const sig = plan.sigId && DB.sigs.find(s => s.id === plan.sigId);
  const hasDraft = MES.draftFor(plan.itemId);

  const acts = draft
    ? '<button class="btn danger" data-act="plan-discard" data-plan="' + E(plan.id) + '">' + ic('trash') + 'Discard draft</button><button class="btn pri" data-act="plan-release" data-plan="' + E(plan.id) + '">' + ic('sig') + 'Approve & release</button>'
    : (hasDraft ? UI.link('plan/' + hasDraft.id, ic('pen') + 'Open draft rev ' + hasDraft.rev, 'btn pri') : '<button class="btn pri" data-act="plan-new" data-item="' + E(plan.itemId) + '">' + ic('plus') + 'New revision</button>');

  const ops = MES.routing(plan.itemId).map(o => {
    const chars = MES.planChars(plan, o.seq), st = MES.station(o.station);
    const bom = (DB.boms[plan.itemId] || []).filter(b => b.op === o.seq);
    const bomHtml = bom.length ? '<div class="row small" style="gap:6px;padding:10px 16px 0">' + '<span class="muted">Consumes:</span>' + bom.map(b => { const p = MES.part(b.partId); const cov = p.tracking === 'Serial' && chars.some(c => c.type === 'serial' && c.partId === b.partId && (!b.slot || c.slot === b.slot)); return '<span class="tag" data-tip="' + E(p.name + ' · ' + p.tracking + '-tracked' + (p.tracking === 'Serial' ? (cov ? '\nSerial validated by plan' : '\nNOT validated by plan') : '')) + '">' + E(b.partId) + (b.slot ? ' · ' + E(b.slot) : '') + ' ×' + b.qty + (p.tracking === 'Serial' ? (cov ? ' ✓' : ' ⚠') : '') + '</span>'; }).join('') + '</div>' : '';
    const rows = chars.map((c, i) => {
      const isNew = baseKeys && !baseKeys.has(o.seq + '|' + c.type + '|' + c.name + '|' + (c.lsl ?? '') + '|' + (c.usl ?? '') + '|' + (c.formula || ''));
      let det = '';
      if (c.type === 'measure') det = '<span class="mono">' + E(UI.spec(c)) + '</span> · nom ' + U.num(c.nominal, c.dec) + (c.gauge ? ' · ' + E(c.gauge) : '');
      if (c.type === 'calc') det = '<span class="formula">' + E(c.formula) + '</span> → <span class="mono">' + E(UI.spec(c)) + '</span>';
      if (c.type === 'serial') { const p = MES.part(c.partId); det = '<span class="mono">' + E(c.partId) + '</span> · ' + E(c.slot) + ' · mask <span class="mono">' + E(p.pattern) + '</span>'; }
      if (c.type === 'signoff') det = E(c.role) + ' · meaning “' + E(c.meaning) + '”';
      if (c.type === 'check') det = '<span class="muted">Pass / Fail' + (c.phase === 'end' ? ' · station-end checklist' : '') + '</span>';
      const ed = draft ? '<span class="row" style="gap:2px;flex-wrap:nowrap"><button class="btn sm ghost" title="Move up" aria-label="Move up" data-act="char-move" data-dir="-1" data-plan="' + E(plan.id) + '" data-seq="' + o.seq + '" data-char="' + E(c.id) + '"' + (i === 0 ? ' disabled' : '') + '>' + ic('up') + '</button><button class="btn sm ghost" title="Move down" aria-label="Move down" data-act="char-move" data-dir="1" data-plan="' + E(plan.id) + '" data-seq="' + o.seq + '" data-char="' + E(c.id) + '"' + (i === chars.length - 1 ? ' disabled' : '') + '>' + ic('down') + '</button><button class="btn sm ghost" title="Edit" aria-label="Edit" data-act="char-edit" data-plan="' + E(plan.id) + '" data-seq="' + o.seq + '" data-char="' + E(c.id) + '">' + ic('pen') + '</button><button class="btn sm ghost" title="Delete" aria-label="Delete" data-act="char-del" data-plan="' + E(plan.id) + '" data-seq="' + o.seq + '" data-char="' + E(c.id) + '" style="color:var(--bad)">' + ic('trash') + '</button></span>' : '';
      return '<tr><td class="mono">' + E(c.code) + (isNew ? '<div class="newmark">' + (draft ? 'changed' : 'new') + '</div>' : '') + '</td><td>' + UI.typeIc(c.type) + '</td><td><b>' + E(c.name) + '</b></td><td class="small">' + det + '</td><td>' + (c.type === 'signoff' ? '' : UI.sev(c.sev)) + '</td><td class="small">' + (c.type === 'signoff' ? '' : E(c.cat || '')) + '</td>' + (draft ? '<td>' + ed + '</td>' : '') + '</tr>';
    }).join('');
    const tbl = chars.length ? '<div class="tw"><table class="t"><thead><tr><th>Code</th><th>Type</th><th>Characteristic</th><th>Specification / details</th><th>Severity</th><th>Category</th>' + (draft ? '<th></th>' : '') + '</tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="empty">No plan items on this operation' + (draft ? '. Add a checklist item, serial validation, measurement, calculation or sign-off.' : '.') + '</div>';
    return '<section class="card"><div class="hd"><div class="optitle"><span class="seq">OP' + o.seq + '</span><h3>' + E(o.name) + '</h3><span class="muted small">' + E(o.station) + ' · ' + E(st.name) + ' · ' + E(MES.building(st.building).short) + '</span>' + (o.test ? '<span class="tag">' + E(o.test) + '</span>' : '') + '</div><div class="acts">' + (draft ? '<button class="btn sm" data-act="char-add" data-plan="' + E(plan.id) + '" data-seq="' + o.seq + '">' + ic('plus') + 'Add item</button>' : '') + '</div></div>' + bomHtml + '<div class="bd flush" style="padding-top:8px">' + tbl + '</div></section>';
  }).join('');

  const issuesHtml = issues.length ? '<ul class="issues">' + issues.map(i => '<li class="' + i.level + '">' + (i.level === 'error' ? '✕' : '⚠') + ' ' + E(i.msg) + '</li>').join('') + '</ul>' : '<div class="empty" style="color:var(--ok)">✓ No issues. Every serialized component is validated and every calculation references valid inputs.</div>';
  const revs = MES.plansFor(plan.itemId).map(p => '<li>' + UI.link('plan/' + p.id, '<b>rev ' + E(p.rev) + '</b>') + ' ' + UI.chip(p.status) + '<div class="small muted">' + E(p.changeNote || 'In draft') + '</div></li>').join('');

  return '<div class="crumbs">' + UI.link('plans', 'Quality plans') + ' / ' + E(plan.id) + '</div>' +
    UI.ph(E(item.id) + ' · ' + E(item.name), 'Quality Plan ' + E(plan.id) + ' ' + UI.chip(plan.status), draft ? 'Draft — editable. Release requires a Quality Engineer e-signature and supersedes rev ' + E((MES.activePlan(plan.itemId) || {}).rev || '—') + '.' : plan.status === 'Released' ? 'Released for production. New units launch against this revision.' : 'Superseded by ' + E(plan.supersededBy || '') + '. Units built to it keep this as their record.', acts) +
    '<div class="grid g3">' +
    UI.card('Plan summary', UI.kv([
      ['Item', UI.link('item/' + item.id, E(item.id))],
      ['Revision', E(plan.rev) + (base ? ' (from ' + UI.link('plan/' + base.id, E(base.id)) + ')' : '')],
      ['Plan items', Q.typeSummary(plan)],
      ['Author', E(MES.userName(plan.createdBy)) + ' · ' + U.fmtD(plan.createdAt)],
      plan.releasedAt ? ['Approved', E(MES.userName(plan.releasedBy)) + ' · ' + U.fmtDT(plan.releasedAt)] : null,
      ['Units built', DB.units.filter(u => u.planId === plan.id).length],
    ]) + (sig ? '<div style="margin-top:12px">' + UI.sigCard(sig) + '</div>' : '')) +
    UI.card('Plan checks', issuesHtml, { flush: true, hint: issues.filter(i => i.level === 'error').length + ' errors · ' + issues.filter(i => i.level === 'warn').length + ' warnings' }) +
    UI.card('Revision history', '<ul class="tl">' + revs + '</ul>', { flush: true }) + '</div>' +
    '<div class="row" style="gap:14px;font-size:13px;color:var(--ink-2)">' +
      '<span>' + UI.typeIc('check') + ' pass/fail; failure opens a DR</span>' +
      '<span>' + UI.typeIc('serial') + ' BOM, mask, inventory, hold & line-side checks; builds genealogy</span>' +
      '<span>' + UI.typeIc('measure') + ' reading vs LSL/USL</span>' +
      '<span>' + UI.typeIc('calc') + ' formula over same-op readings</span>' +
      '<span>' + UI.typeIc('signoff') + ' role-based e-signature; Verified/Approved must be independent</span></div>' +
    '<div class="stack">' + ops + '</div>';
};

Q.charForm = (plan, seq, c) => {
  c = c || { type: 'check', sev: 'Minor', cat: 'Workmanship', phase: 'in', required: true };
  const t = c.type;
  const numeric = MES.planChars(plan, seq).filter(x => (x.type === 'measure' || x.type === 'calc') && x.id !== c.id);
  const serLines = (DB.boms[plan.itemId] || []).filter(b => b.op === Number(seq) && MES.part(b.partId).tracking === 'Serial');
  let f = '<div class="fgrid">';
  f += '<label class="f">Type<select class="in" name="type" id="cf-type" data-change="char-type"' + (c.id ? ' disabled' : '') + '>' + UI.options([{ v: 'check', l: 'Checklist item' }, { v: 'serial', l: 'Serial validation' }, { v: 'measure', l: 'Measurement' }, { v: 'calc', l: 'Calculation' }, { v: 'signoff', l: 'Sign-off' }], t) + '</select></label>';
  if (t === 'serial') {
    f += '<label class="f">BOM component at OP' + seq + '<select class="in" name="line" id="cf-line">' + (serLines.length ? UI.options(serLines.map(b => ({ v: b.partId + '|' + (b.slot || ''), l: b.partId + (b.slot ? ' · ' + b.slot : '') + ' — ' + MES.part(b.partId).name })), c.partId ? c.partId + '|' + (c.slot || '') : '') : '<option value="">No serialized parts consumed at this operation</option>') + '</select></label>';
  } else {
    f += '<label class="f wide">' + (t === 'check' ? 'Checklist question' : t === 'signoff' ? 'Sign-off label' : 'Characteristic name') + '<input class="in" name="name" id="cf-name" value="' + E(c.name || '') + '" required data-autofocus></label>';
  }
  if (t === 'measure' || t === 'calc') {
    f += '<label class="f">Unit<input class="in" name="unit" id="cf-unit" value="' + E(c.unit || '') + '" placeholder="mm, N·m, kPa"></label>';
    if (t === 'measure') f += '<label class="f">Nominal<input class="in" name="nominal" id="cf-nom" inputmode="decimal" value="' + E(c.nominal ?? '') + '"></label>';
    f += '<label class="f">Lower limit (LSL)<input class="in" name="lsl" id="cf-lsl" inputmode="decimal" value="' + E(c.lsl ?? '') + '"></label><label class="f">Upper limit (USL)<input class="in" name="usl" id="cf-usl" inputmode="decimal" value="' + E(c.usl ?? '') + '"></label>';
    f += '<label class="f">Decimals<input class="in" name="dec" id="cf-dec" type="number" min="0" max="4" value="' + E(c.dec ?? 2) + '"></label>';
    if (t === 'measure') f += '<label class="f">Gauge / equipment<input class="in" name="gauge" id="cf-gauge" value="' + E(c.gauge || '') + '"></label>';
  }
  if (t === 'calc') {
    f += '<label class="f wide">Formula<input class="in mono" name="formula" id="cf-formula" value="' + E(c.formula || '') + '" placeholder="e.g. max(C1,C2) - min(C1,C2)" data-input="formula"></label>';
    f += '<div class="wide small"><div class="muted">Available inputs in OP' + seq + ': ' + (numeric.length ? numeric.map(x => '<span class="formula" data-tip="' + E(x.name) + '">' + E(x.code) + '</span>').join(' ') : '<i>none — add measurements first</i>') + ' · functions: min, max, avg, sum, abs, sqrt, round</div><div id="formula-check" class="small" style="margin-top:4px"></div></div>';
  }
  if (t === 'signoff') {
    f += '<label class="f">Signing role<select class="in" name="role" id="cf-role">' + UI.options(['Operator', 'Quality Technician', 'Quality Engineer', 'Supervisor'], c.role || 'Operator') + '</select></label>';
    f += '<label class="f">Signature meaning<select class="in" name="meaning" id="cf-meaning">' + UI.options(['Performed', 'Verified', 'Approved'], c.meaning || 'Performed') + '</select></label>';
  }
  if (t !== 'signoff') {
    f += '<label class="f">Severity if nonconforming<select class="in" name="sev" id="cf-sev">' + UI.options(['Minor', 'Major', 'Critical'], c.sev || 'Minor') + '</select></label>';
    f += '<label class="f">Defect category<select class="in" name="cat" id="cf-cat">' + UI.options(['Workmanship', 'Dimensional', 'Torque', 'Weld', 'Sealing', 'Paint', 'Leak', 'Electrical', 'Fluids', 'Test', 'Traceability', 'Cosmetic'], c.cat || 'Workmanship') + '</select></label>';
  }
  if (t === 'check') f += '<label class="f">When<select class="in" name="phase" id="cf-phase">' + UI.options([{ v: 'in', l: 'In-process inspection' }, { v: 'end', l: 'Station-end checklist' }], c.phase || 'in') + '</select></label>';
  f += '</div>';
  if (t !== 'signoff') f += '<p class="small muted" style="margin:0">Major and Critical nonconformances put the unit on quality hold automatically.</p>';
  return f;
};
Q.readCharForm = (fd, type) => {
  const def = { type };
  ['name', 'unit', 'nominal', 'lsl', 'usl', 'dec', 'gauge', 'formula', 'role', 'meaning', 'sev', 'cat', 'phase'].forEach(k => { if (fd.has(k)) def[k] = String(fd.get(k)).trim(); });
  if (type === 'serial') { const [partId, slot] = String(fd.get('line') || '').split('|'); def.partId = partId; def.slot = slot || ''; def.name = ''; }
  if (type === 'signoff') { def.required = true; def.phase = 'end'; def.sev = 'Minor'; def.cat = 'Documentation'; if (!def.name) def.name = def.role + ' sign-off'; }
  if (type === 'calc' || type === 'measure') def.phase = 'in';
  return def;
};
Q.openCharModal = (planId, seq, charId, type) => {
  const plan = MES.plan(planId), c = charId ? MES.planChars(plan, seq).find(x => x.id === charId) : null;
  const cur = c || (type ? { type, sev: 'Minor', cat: type === 'measure' || type === 'calc' ? 'Dimensional' : type === 'serial' ? 'Traceability' : 'Workmanship', phase: 'in', dec: 2, role: 'Operator', meaning: 'Performed' } : null);
  App.ui.charCtx = { planId, seq, charId };
  const op = MES.op(plan.itemId, seq);
  App.modal((c ? 'Edit ' + c.code : 'Add plan item') + ' · OP' + seq + ' ' + op.name, '<div id="char-fields">' + Q.charForm(plan, seq, cur) + '</div>',
    '<button type="button" class="btn" data-act="modal-close">Cancel</button><button type="submit" class="btn pri">' + ic('check') + (c ? 'Save changes' : 'Add to plan') + '</button>',
    { wide: true, onSubmit: fd => {
      const ctx = App.ui.charCtx, t = c ? c.type : (document.getElementById('cf-type') || {}).value;
      const def = Q.readCharForm(fd, t);
      const r = c ? MES.updateChar(ctx.planId, ctx.seq, ctx.charId, def, DB.currentUser) : MES.addChar(ctx.planId, ctx.seq, def, DB.currentUser);
      if (r.ok) App.commit(r, c ? c.code + ' updated' : r.ch.code + ' added to OP' + ctx.seq);
      return r;
    } });
};
CHANGE['char-type'] = el => {
  const ctx = App.ui.charCtx, plan = MES.plan(ctx.planId);
  document.getElementById('char-fields').innerHTML = Q.charForm(plan, ctx.seq, { type: el.value, sev: 'Minor', cat: el.value === 'measure' || el.value === 'calc' ? 'Dimensional' : el.value === 'serial' ? 'Traceability' : 'Workmanship', phase: 'in', dec: 2 });
  const n = document.getElementById('cf-name'); if (n) n.focus();
};
INPUT.formula = el => {
  const out = document.getElementById('formula-check'); if (!out) return;
  const ctx = App.ui.charCtx, plan = MES.plan(ctx.planId);
  const codes = MES.planChars(plan, ctx.seq).filter(x => (x.type === 'measure' || x.type === 'calc') && x.id !== ctx.charId);
  try {
    const refs = Formula.refs(el.value);
    const bad = refs.filter(r => !codes.some(c => c.code === r));
    if (bad.length) { out.innerHTML = '<span style="color:var(--bad)">✕ Unknown input ' + E(bad.join(', ')) + '</span>'; return; }
    const vars = {}; codes.forEach(c => { vars[c.code] = c.type === 'measure' ? c.nominal : (c.lsl + c.usl) / 2; });
    const v = Formula.evaluate(el.value, vars);
    out.innerHTML = '<span style="color:var(--ok)">✓ Valid. At nominal inputs this evaluates to <b class="mono">' + E(U.num(v, 3)) + '</b></span>';
  } catch (e) { out.innerHTML = el.value ? '<span style="color:var(--bad)">✕ ' + E(e.message) + '</span>' : ''; }
};
ACT['char-add'] = el => { if (!Q.isQE()) return Q.needQE(); Q.openCharModal(el.dataset.plan, Number(el.dataset.seq), null, 'check'); };
ACT['char-edit'] = el => { if (!Q.isQE()) return Q.needQE(); Q.openCharModal(el.dataset.plan, Number(el.dataset.seq), el.dataset.char); };
ACT['char-del'] = el => {
  if (!Q.isQE()) return Q.needQE();
  const plan = MES.plan(el.dataset.plan), c = MES.planChars(plan, Number(el.dataset.seq)).find(x => x.id === el.dataset.char);
  App.modal('Remove ' + c.code + '?', '<p>Remove <b>' + E(c.name) + '</b> from OP' + E(el.dataset.seq) + ' of draft ' + E(plan.id) + '.</p>',
    '<button type="button" class="btn" data-act="modal-close">Keep it</button><button type="submit" class="btn danger solid">' + ic('trash') + 'Remove</button>',
    { onSubmit: () => { const r = MES.deleteChar(plan.id, Number(el.dataset.seq), c.id, DB.currentUser); if (r.ok) App.commit(r, c.code + ' removed'); return r; } });
};
ACT['char-move'] = el => { if (!Q.isQE()) return Q.needQE(); App.commit(MES.moveChar(el.dataset.plan, Number(el.dataset.seq), el.dataset.char, Number(el.dataset.dir))); };
ACT['plan-discard'] = el => {
  if (!Q.isQE()) return Q.needQE();
  App.modal('Discard draft?', '<p>Delete draft ' + E(el.dataset.plan) + ' and all of its edits.</p>', '<button type="button" class="btn" data-act="modal-close">Keep draft</button><button type="submit" class="btn danger solid">Discard</button>',
    { onSubmit: () => { const p = MES.plan(el.dataset.plan); const r = MES.discardDraft(el.dataset.plan, DB.currentUser); if (r.ok) { MES.save(); App.closeModal(); App.go('plans'); App.toast('Draft discarded'); return null; } return r; } });
};
ACT['plan-release'] = el => {
  const plan = MES.plan(el.dataset.plan);
  const errs = MES.planIssues(plan).filter(i => i.level === 'error');
  if (errs.length) return App.toast('Fix ' + errs.length + ' plan error(s) first: ' + errs[0].msg, 'bad');
  const cur = MES.activePlan(plan.itemId);
  App.signDialog({
    title: 'Approve & release ' + plan.id, role: 'Quality Engineer', meaning: 'Approved for production', confirm: 'Approve & release',
    summary: '<p>Releasing makes <b>rev ' + E(plan.rev) + '</b> the plan for every new ' + E(plan.itemId) + ' unit' + (cur ? ' and supersedes rev ' + E(cur.rev) + '. Units already launched keep rev ' + E(cur.rev) + '.' : '.') + '</p>',
    extra: '<label class="f">Change description<textarea class="in" name="note" id="rel-note" placeholder="What changed and why (ECN, 8D, PPAP reference)"></textarea></label>',
  }, (signer, pin, fd) => { const r = MES.releasePlan(plan.id, fd.get('note'), signer, pin); if (r.ok) App.commit(r, plan.id + ' released for production'); return r; });
};

/* ======================================================= DISCREPANCIES */
V.drs = () => {
  const f = App.ui.drf || (App.ui.drf = { status: 'active', sev: '', src: '', q: '' });
  let list = DB.drs.slice().reverse();
  if (f.status === 'active') list = list.filter(d => MES.DR_OPEN.includes(d.status));
  else if (f.status === 'closed') list = list.filter(d => d.status === 'Closed' || d.status === 'Cancelled');
  if (f.sev) list = list.filter(d => d.severity === f.sev);
  if (f.src) list = list.filter(d => d.source === f.src);
  if (f.q) { const q = f.q.toUpperCase(); list = list.filter(d => [d.id, d.title, d.serial, d.compSerial, d.lot, d.partId].join(' ').toUpperCase().includes(q)); }
  const cnt = s => DB.drs.filter(d => d.status === s).length;
  const sources = [...new Set(DB.drs.map(d => d.source))];
  return UI.ph('Quality', 'Discrepancies', 'Nonconformances from inspection, test, serial validation, receiving and supplier notices. Each one runs through MRB disposition, rework and verification with e-signatures.',
    '<button class="btn pri" data-act="dr-new">' + ic('flag') + 'New discrepancy</button>') +
    '<div class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">' +
    '<div class="kpi' + (cnt('Open') ? ' alert' : '') + '"><span class="lbl">Awaiting MRB</span><span class="val num">' + cnt('Open') + '</span><span class="foot">Open, no disposition</span></div>' +
    '<div class="kpi"><span class="lbl">In rework / repair</span><span class="val num">' + cnt('Rework') + '</span><span class="foot">Dispositioned, work pending</span></div>' +
    '<div class="kpi"><span class="lbl">Pending verification</span><span class="val num">' + cnt('Pending Verification') + '</span><span class="foot">Awaiting QE close-out</span></div>' +
    '<div class="kpi"><span class="lbl">Closed</span><span class="val num">' + cnt('Closed') + '</span><span class="foot">' + cnt('Cancelled') + ' cancelled</span></div></div>' +
    UI.card(null, '<div class="filters" style="margin-bottom:12px"><div class="seg">' + [['active', 'Open items'], ['all', 'All'], ['closed', 'Closed']].map(([k, l]) => '<button type="button" class="' + (f.status === k ? 'on' : '') + '" data-act="drf" data-k="status" data-v="' + k + '">' + l + '</button>').join('') + '</div>' +
      '<label class="f">Severity<select class="in" data-change="drf" data-k="sev" id="drf-sev">' + UI.options(['Minor', 'Major', 'Critical'], f.sev, { blank: 'All' }) + '</select></label>' +
      '<label class="f">Source<select class="in" data-change="drf" data-k="src" id="drf-src">' + UI.options(sources, f.src, { blank: 'All' }) + '</select></label>' +
      '<label class="f" style="flex:1">Search<input class="in" id="drf-q" data-change="drf" data-k="q" value="' + E(f.q) + '" placeholder="DR, serial, lot, text"></label></div>' +
      UI.table([
        { h: 'ID', v: d => '<b class="mono">' + E(d.id) + '</b>' },
        { h: 'Status', v: d => UI.chip(d.status) },
        { h: 'Sev', v: d => UI.sev(d.severity) },
        { h: 'Discrepancy', v: d => '<b>' + E(d.title) + '</b><div class="small muted">' + E(d.source) + ' · ' + E(d.category) + '</div>' },
        { h: 'Unit / material', v: d => d.serial ? '<span class="mono">' + E(d.serial) + '</span>' + (d.seq ? '<div class="small muted">OP' + d.seq + '</div>' : '') : '<span class="mono">' + E(d.partId || '') + '</span><div class="small muted mono">' + E(d.compSerial || (d.lot ? 'lot ' + d.lot : '')) + '</div>' },
        { h: 'Disposition', v: d => d.disposition ? E(d.disposition) : '<span class="muted">—</span>' },
        { h: 'Opened', v: d => U.fmtDT(d.createdAt) + '<div class="small muted">' + E(MES.userName(d.createdBy)) + '</div>' },
        { h: 'Age', v: d => d.closedAt ? '<span class="muted">' + U.dur(d.closedAt - d.createdAt) + '</span>' : U.ago(d.createdAt).replace(' ago', '') },
      ], list, { rowGo: d => 'dr/' + d.id, empty: 'No discrepancies match these filters.' }), { flush: false });
};
ACT.drf = el => { App.ui.drf[el.dataset.k] = el.dataset.v; App.render(); };
CHANGE.drf = el => { App.ui.drf[el.dataset.k] = el.value; App.render(); };
ACT['dr-new'] = () => {
  App.modal('New discrepancy', '<div class="fgrid">' +
    '<label class="f">Applies to<select class="in" name="target" id="nd-target">' + UI.options([{ v: 'unit', l: 'Production unit (VIN / serial)' }, { v: 'comp', l: 'Purchased component serial' }, { v: 'lot', l: 'Material lot' }], 'unit') + '</select></label>' +
    '<label class="f">Serial / VIN / lot<input class="in mono" name="ref" id="nd-ref" required placeholder="e.g. BT1-… or TT4… or L260902-118"></label>' +
    '<label class="f">Severity<select class="in" name="severity" id="nd-sev">' + UI.options(['Minor', 'Major', 'Critical'], 'Minor') + '</select></label>' +
    '<label class="f">Category<select class="in" name="category" id="nd-cat">' + UI.options(['Workmanship', 'Cosmetic', 'Dimensional', 'Torque', 'Leak', 'Electrical', 'Wrong Part', 'Damage', 'Supplier', 'Documentation'], 'Workmanship') + '</select></label>' +
    '<label class="f">Source<select class="in" name="source" id="nd-src">' + UI.options(['Manual', 'Audit', 'Receiving Inspection', 'Supplier Notification', 'Customer / Field'], 'Manual') + '</select></label>' +
    '<label class="f wide">Title<input class="in" name="title" id="nd-title" required></label>' +
    '<label class="f wide">Description<textarea class="in" name="description" id="nd-desc"></textarea></label></div><p class="small muted">Major/Critical: the unit, serial or lot is placed on quality hold.</p>',
    '<button type="button" class="btn" data-act="modal-close">Cancel</button><button type="submit" class="btn danger solid">' + ic('flag') + 'Open discrepancy</button>',
    { onSubmit: fd => {
      const t = fd.get('target'), ref = String(fd.get('ref') || '').trim().toUpperCase();
      if (!String(fd.get('title') || '').trim()) return MES.fail('Enter a title.');
      const o = { by: DB.currentUser, source: fd.get('source'), severity: fd.get('severity'), category: fd.get('category'), title: fd.get('title'), description: fd.get('description') };
      if (t === 'unit') { const u = MES.unit(ref); if (!u) return MES.fail('No unit with serial/VIN ' + ref + '.'); Object.assign(o, { serial: u.serial, itemId: u.itemId, seq: u.status === 'Complete' ? null : MES.currentOp(u).seq }); }
      if (t === 'comp') { const r = DB.inv.find(i => (i.serial || '').toUpperCase() === ref); if (!r) return MES.fail('No component serial ' + ref + ' in inventory.'); Object.assign(o, { compSerial: r.serial, partId: r.partId }); }
      if (t === 'lot') { const r = DB.inv.find(i => (i.lot || '').toUpperCase() === ref); if (!r) return MES.fail('No lot ' + ref + ' in inventory.'); Object.assign(o, { lot: r.lot, partId: r.partId }); }
      const r = MES.createDR(o);
      if (r.ok) { MES.save(); App.closeModal(); App.go('dr/' + r.dr.id); App.toast(r.dr.id + ' opened', 'warn'); return null; }
      return r;
    } });
};

V.dr = id => {
  const d = MES.dr(id);
  if (!d) return UI.ph('Discrepancies', 'Not found', E(id));
  const u = d.serial && MES.unit(d.serial);
  const plan = u && MES.plan(u.planId), ch = plan && d.charId && MES.findChar(plan, d.charId);
  const op = u && d.seq && MES.op(u.itemId, d.seq);
  const hold = d.holdId && DB.holds.find(h => h.id === d.holdId);
  const sigs = DB.sigs.filter(s => s.ctxType === 'Discrepancy' && s.ctx === d.id);
  const quick = ['Use As Is', 'Scrap', 'Return to Vendor'].includes(d.disposition);
  const flow = quick ? ['Open', 'MRB disposition', 'Closed'] : ['Open', 'MRB disposition', 'Rework / repair', 'Verification', 'Closed'];
  const stage = d.status === 'Open' ? 0 : d.status === 'Rework' ? 2 : d.status === 'Pending Verification' ? 3 : flow.length - 1;
  const steps = '<div class="steps">' + flow.map((s, i) => '<div class="s ' + (d.status === 'Cancelled' ? '' : i < stage || (i === stage && d.status === 'Closed') ? 'done' : i === stage ? 'cur' : '') + '">' + (i + 1) + '. ' + s + '</div>').join('') + '</div>';

  const details = UI.kv([
    ['Severity', UI.sev(d.severity)],
    ['Category · source', E(d.category) + ' · ' + E(d.source)],
    u ? ['Unit', UI.serial(u.serial) + ' · ' + E(MES.part(u.itemId).name) + ' · ' + UI.unitStateChip(u)] : null,
    op ? ['Operation', 'OP' + op.seq + ' ' + E(op.name) + ' @ ' + UI.link('station/' + op.station + '/' + u.serial, E(op.station))] : null,
    ch ? ['Plan item', E(ch.code) + ' ' + E(ch.name) + ' · ' + UI.link('plan/' + plan.id, E(plan.id))] : null,
    d.spec ? ['Specification', '<span class="mono">' + E(d.spec) + '</span>'] : null,
    d.measured !== null && d.measured !== undefined ? ['Measured', '<b class="mono" style="color:var(--bad)">' + E(d.measured) + ' ' + E(ch ? ch.unit : '') + '</b>' + (ch ? UI.gauge(ch, d.measured) : '')] : null,
    d.partId ? ['Part', '<span class="mono">' + E(d.partId) + '</span> ' + E(MES.part(d.partId).name) + ' · ' + E(MES.part(d.partId).supplier || '')] : null,
    d.compSerial ? ['Component serial', '<span class="mono">' + E(d.compSerial) + '</span> · ' + E((DB.inv.find(i => i.serial === d.compSerial) || {}).status || '')] : null,
    d.lot ? ['Lot', '<span class="mono">' + E(d.lot) + '</span>'] : null,
    ['Description', E(d.description) || '<span class="muted">—</span>'],
    ['Opened', U.fmtDT(d.createdAt) + ' by ' + E(MES.userName(d.createdBy))],
    hold ? ['Quality hold', E(hold.id) + ' ' + UI.chip(hold.status === 'Active' ? 'Hold' : 'Released', hold.status)] : null,
    d.disposition ? ['Disposition', '<b>' + E(d.disposition) + '</b> by ' + E(MES.userName(d.dispositionBy)) + ' · ' + U.fmtDT(d.dispositionAt)] : null,
    d.rootCause ? ['Root cause', E(d.rootCause)] : null,
    d.containment ? ['Containment', E(d.containment)] : null,
    d.correctiveAction ? ['Corrective action', E(d.correctiveAction)] : null,
    d.closedAt ? [d.status === 'Cancelled' ? 'Cancelled' : 'Closed', U.fmtDT(d.closedAt) + ' by ' + E(MES.userName(d.closedBy)) + ' · cycle time ' + U.dur(d.closedAt - d.createdAt)] : null,
  ]);

  let readings = '';
  if (u && ch && ch.type !== 'signoff') {
    const hist = MES.results(u.serial, d.seq, ch.id);
    readings = UI.card('Readings for ' + E(ch.code), UI.table([
      { h: 'When', v: r => U.fmtDT(r.at) },
      { h: 'Value', v: r => '<span class="mono">' + E(r.type === 'measure' || r.type === 'calc' ? U.num(r.value, ch.dec) + ' ' + ch.unit : r.value) + '</span>' },
      { h: 'Result', v: r => UI.chip(r.result) },
      { h: 'By', v: r => E(MES.userName(r.by)) },
      { h: 'Note', v: r => '<span class="small">' + E(r.note) + '</span>' },
    ], hist), { flush: true });
  }
  let wu = '';
  if (d.lot) {
    const hits = MES.whereUsed(d.lot);
    const tops = [...new Set(hits.map(h => h.top))];
    wu = UI.card('Where-used · lot ' + E(d.lot), '<div class="small muted" style="padding:10px 16px 0">' + hits.length + ' installations in ' + tops.length + ' top-level units. Remaining stock: ' + DB.inv.filter(i => i.lot === d.lot && i.qty > 0).map(i => i.qty + ' at ' + i.location).join(', ') + '</div>' + UI.table([
      { h: 'Installed in', v: h => UI.serial(h.serial) + ' · OP' + h.seq },
      { h: 'What', v: h => E(h.how) },
      { h: 'Top-level unit', v: h => UI.serial(h.top) + (MES.unit(h.top) ? ' ' + UI.unitStateChip(MES.unit(h.top)) : '') },
      { h: '', v: h => UI.link('genealogy/' + h.top, 'Genealogy', 'btn sm') },
    ], hits, { empty: 'No installations. Containment is limited to stock.' }), { flush: true });
  }

  const cu = MES.currentUser(), qe = cu.role === 'Quality Engineer';
  let action = '';
  if (d.status === 'Open') {
    action = UI.card('MRB disposition', (qe ? '' : '<div class="banner warn" style="margin-bottom:12px">' + ic('lock') + '<div class="tx">Only a Quality Engineer can disposition. The signature dialog lists eligible signers.</div></div>') +
      '<form data-form="dr-disp" class="stack" style="gap:10px"><input type="hidden" name="id" value="' + E(d.id) + '">' +
      '<label class="f">Disposition<select class="in" name="disposition" id="dd-disp" required>' + UI.options(MES.DISPOSITIONS.filter(x => x !== 'Return to Vendor' || d.partId), '', { blank: 'Choose…' }) + '</select></label>' +
      '<label class="f">Root cause<textarea class="in" name="rootCause" id="dd-root" placeholder="Why did this happen?"></textarea></label>' +
      '<label class="f">Containment<textarea class="in" name="containment" id="dd-cont" placeholder="What else could be affected; what was checked"></textarea></label>' +
      '<label class="f">Corrective action<textarea class="in" name="correctiveAction" id="dd-ca" placeholder="Permanent fix to prevent recurrence"></textarea></label>' +
      '<div class="small muted">Rework / Repair: releases the hold so the station can re-inspect, then requires verification. Use As Is, Scrap and Return to Vendor close on signature.</div>' +
      '<div class="row"><button class="btn pri">' + ic('sig') + 'Sign disposition</button><button type="button" class="btn danger" data-act="dr-cancel" data-id="' + E(d.id) + '">Cancel DR</button></div></form>');
  } else if (d.status === 'Rework') {
    action = UI.card('Rework / repair in progress', '<p style="margin-top:0">' + (ch ? 'Re-inspect <b>' + E(ch.code) + ' ' + E(ch.name) + '</b> at ' + UI.link('station/' + op.station + '/' + u.serial, E(op.station)) + '. A passing reading moves this DR to verification automatically.' : 'Perform the ' + E(d.disposition.toLowerCase()) + ', then record completion.') + '</p>' +
      '<form data-form="dr-rework" class="stack" style="gap:10px"><input type="hidden" name="id" value="' + E(d.id) + '"><label class="f">Rework record<textarea class="in" name="note" id="dr-rw-note" placeholder="What was done, parts replaced"></textarea></label><div><button class="btn pri">' + ic('check') + 'Record rework complete</button></div></form>');
  } else if (d.status === 'Pending Verification') {
    action = UI.card('Verification', '<p style="margin-top:0">Rework is complete. A Quality Engineer verifies the result and closes the discrepancy.</p><button class="btn pri" data-act="dr-verify" data-id="' + E(d.id) + '">' + ic('sig') + 'Verify & close</button>');
  }
  const notes = '<form data-form="dr-note" class="row" style="padding:10px 16px;gap:8px;border-top:1px solid var(--line-2)"><input type="hidden" name="id" value="' + E(d.id) + '"><input class="in" style="flex:1;min-width:180px" name="note" id="dr-note" placeholder="Add a note to the record"><button class="btn sm">Add note</button></form>';
  const hist = '<ul class="tl">' + d.history.slice().reverse().map(h => '<li><div class="w">' + U.fmtDT(h.at) + ' · ' + E(MES.userName(h.by)) + '</div><b>' + E(h.action) + '</b>' + (h.note ? '<div class="small">' + E(h.note) + '</div>' : '') + '</li>').join('') + '</ul>';

  return '<div class="crumbs">' + UI.link('drs', 'Discrepancies') + ' / ' + E(d.id) + '</div>' +
    UI.ph(E(d.id) + ' · ' + E(d.source), E(d.title), UI.chip(d.status) + ' ' + UI.sev(d.severity)) + steps +
    '<div class="grid g-main"><div class="stack">' + UI.card('Details', details) + readings + wu + '</div><div class="stack">' + action +
    UI.card('History', hist + notes, { flush: true }) + (sigs.length ? UI.card('E-signatures', '<div class="stack" style="gap:8px">' + sigs.map(UI.sigCard).join('') + '</div>') : '') + '</div></div>';
};
FORMS['dr-disp'] = fd => {
  const id = fd.get('id'), f = { disposition: fd.get('disposition'), rootCause: fd.get('rootCause'), containment: fd.get('containment'), correctiveAction: fd.get('correctiveAction') };
  if (!f.disposition) return App.toast('Choose a disposition.', 'bad');
  if (!f.rootCause || f.rootCause.trim().length < 5) return App.toast('Enter the root cause before signing.', 'bad');
  App.signDialog({ title: 'Sign MRB disposition · ' + id, role: 'Quality Engineer', meaning: 'MRB disposition: ' + f.disposition, confirm: 'Sign disposition', summary: '<p>Disposition <b>' + E(f.disposition) + '</b> for ' + E(id) + '.</p>' },
    (signer, pin) => { const r = MES.dispositionDR(id, f, signer, pin); if (r.ok) App.commit(r, id + ' dispositioned: ' + f.disposition); return r; });
};
FORMS['dr-rework'] = fd => { const r = MES.reworkDoneDR(fd.get('id'), fd.get('note'), DB.currentUser); App.commit(r, 'Rework recorded; awaiting verification'); };
FORMS['dr-note'] = fd => { const r = MES.addDRNote(fd.get('id'), String(fd.get('note') || '').trim(), DB.currentUser); App.commit(r, 'Note added'); };
ACT['dr-verify'] = el => App.signDialog({ title: 'Verify & close ' + el.dataset.id, role: 'Quality Engineer', meaning: 'Verified effective & closed', confirm: 'Verify & close', extra: '<label class="f">Verification note<textarea class="in" name="note" id="dv-note" placeholder="Evidence reviewed"></textarea></label>' },
  (signer, pin, fd) => { const r = MES.verifyCloseDR(el.dataset.id, fd.get('note'), signer, pin); if (r.ok) App.commit(r, el.dataset.id + ' closed'); return r; });
ACT['dr-cancel'] = el => App.modal('Cancel ' + el.dataset.id + '?', '<label class="f">Reason<textarea class="in" name="note" id="dc-note" placeholder="e.g. Raised in error — duplicate of DR-…"></textarea></label>',
  '<button type="button" class="btn" data-act="modal-close">Back</button><button type="submit" class="btn danger solid">Cancel discrepancy</button>',
  { onSubmit: fd => { const r = MES.cancelDR(el.dataset.id, fd.get('note'), DB.currentUser); if (r.ok) App.commit(r, el.dataset.id + ' cancelled'); return r; } });

/* ======================================================= HOLDS */
V.holds = () => {
  const act = DB.holds.filter(h => h.status === 'Active'), rel = DB.holds.filter(h => h.status !== 'Active').reverse();
  const tgt = h => h.type === 'Unit' ? UI.serial(h.target) : h.type === 'Lot' ? '<span class="mono">' + E(h.partId) + '</span> lot <span class="mono">' + E(h.target.split('|')[1]) + '</span>' : '<span class="mono">' + E(h.partId || '') + ' ' + E(h.target) + '</span>';
  const cols = [
    { h: 'Hold', v: h => '<b class="mono">' + E(h.id) + '</b>' },
    { h: 'Type', v: h => '<span class="tag">' + E(h.type) + '</span>' },
    { h: 'Target', v: h => tgt(h) },
    { h: 'Reason', v: h => E(h.reason) },
    { h: 'Discrepancy', v: h => UI.drLink(h.drId) + (h.drId && MES.dr(h.drId) ? ' ' + UI.chip(MES.dr(h.drId).status) : '') },
    { h: 'Placed', v: h => U.fmtDT(h.at) + '<div class="small muted">' + E(MES.userName(h.placedBy)) + '</div>' },
  ];
  return UI.ph('Quality', 'Quality Holds', 'Held units cannot be worked, held serials cannot be installed, and held lots are skipped by backflush and blocked from line-side moves.', '<button class="btn pri" data-act="hold-new">' + ic('lock') + 'Place hold</button>') +
    UI.card('Active holds (' + act.length + ')', UI.table(cols.concat([{ h: '', v: h => '<button class="btn sm" data-act="hold-release" data-id="' + E(h.id) + '">' + ic('sig') + 'Release</button>' }]), act, { empty: 'No active holds.' }), { flush: true }) +
    UI.card('Released holds', UI.table(cols.concat([{ h: 'Released', v: h => U.fmtDT(h.releasedAt) + '<div class="small muted">' + E(MES.userName(h.releasedBy)) + ' · ' + E(h.note || '') + '</div>' }, { h: 'On hold for', v: h => U.dur(h.releasedAt - h.at) }]), rel), { flush: true });
};
ACT['hold-release'] = el => {
  const h = DB.holds.find(x => x.id === el.dataset.id);
  if (h.drId && MES.dr(h.drId) && MES.dr(h.drId).status === 'Open') return App.toast(h.drId + ' needs an MRB disposition first. Dispositioning it releases the hold.', 'warn');
  App.signDialog({ title: 'Release ' + h.id, role: 'Quality Engineer', meaning: 'Hold released', confirm: 'Release hold', summary: '<p>' + E(h.type) + ' <b class="mono">' + E(h.target) + '</b> — ' + E(h.reason) + '</p>', extra: '<label class="f">Release justification<textarea class="in" name="note" id="hr-note"></textarea></label>' },
    (signer, pin, fd) => { const r = MES.releaseHold(h.id, signer, pin, fd.get('note')); if (r.ok) App.commit(r, h.id + ' released'); return r; });
};
ACT['hold-new'] = () => {
  const p = MES.currentUser();
  if (!['Quality Engineer', 'Quality Technician', 'Supervisor'].includes(p.role)) return App.toast('Holds are placed by Quality or a Supervisor. Switch user.', 'warn');
  App.modal('Place quality hold', '<div class="fgrid"><label class="f">Hold type<select class="in" name="type" id="hn-type">' + UI.options(['Unit', 'Serial', 'Lot'], 'Unit') + '</select></label><label class="f">Serial / VIN / lot<input class="in mono" name="target" id="hn-target" required></label><label class="f wide">Reason<textarea class="in" name="reason" id="hn-reason" required></textarea></label></div>',
    '<button type="button" class="btn" data-act="modal-close">Cancel</button><button type="submit" class="btn danger solid">' + ic('lock') + 'Place hold</button>',
    { onSubmit: fd => {
      const type = fd.get('type'), t = String(fd.get('target') || '').trim().toUpperCase(), reason = String(fd.get('reason') || '').trim();
      if (!reason) return MES.fail('Enter a reason.');
      let target = t, partId = null;
      if (type === 'Unit' && !MES.unit(t)) return MES.fail('No unit ' + t + '.');
      if (type === 'Serial') { const r = DB.inv.find(i => (i.serial || '').toUpperCase() === t); if (!r) return MES.fail('No component serial ' + t + '.'); partId = r.partId; target = r.serial; }
      if (type === 'Lot') { const r = DB.inv.find(i => (i.lot || '').toUpperCase() === t); if (!r) return MES.fail('No lot ' + t + '.'); partId = r.partId; target = r.partId + '|' + r.lot; }
      if (MES.activeHolds(type, target).length) return MES.fail(t + ' is already on hold.');
      const r = MES.placeHold({ type, target, partId, reason, by: DB.currentUser });
      if (r.ok) App.commit(r, r.hold.id + ' placed', { kind: 'warn' });
      return r;
    } });
};

/* ======================================================= TESTS */
V.tests = () => {
  const f = App.ui.tf || (App.ui.tf = '');
  const types = [...new Set(DB.tests.map(t => t.testType))];
  const list = DB.tests.filter(t => !f || t.testType === f).slice().reverse();
  const stat = types.map(t => { const l = DB.tests.filter(x => x.testType === t); return '<div class="kpi"><span class="lbl">' + E(t) + '</span><span class="val num">' + l.length + '</span><span class="foot">' + Math.round(l.filter(x => x.firstPass).length / Math.max(1, l.length) * 100) + '% first-pass</span></div>'; }).join('');
  return UI.ph('Quality', 'Test Records', 'Created automatically when a test operation completes, from the readings captured against the quality plan.') +
    '<div class="kpis" style="grid-template-columns:repeat(' + Math.max(1, types.length) + ',minmax(0,1fr))">' + stat + '</div>' +
    UI.card(null, '<div class="seg" style="margin-bottom:12px"><button type="button" class="' + (!f ? 'on' : '') + '" data-act="tf" data-v="">All</button>' + types.map(t => '<button type="button" class="' + (f === t ? 'on' : '') + '" data-act="tf" data-v="' + E(t) + '">' + E(t) + '</button>').join('') + '</div>' +
      UI.table([
        { h: 'Record', v: t => '<b class="mono">' + E(t.id) + '</b>' },
        { h: 'Test', v: t => E(t.testType) + '<div class="small muted">' + E(t.program) + '</div>' },
        { h: 'Serial', v: t => '<span class="mono">' + E(t.serial) + '</span>' },
        { h: 'Equipment', v: t => '<span class="small">' + E(t.equipment) + '</span>' },
        { h: 'Completed', v: t => U.fmtDT(t.completedAt) },
        { h: 'Operator', v: t => E(MES.userName(t.operator)) },
        { h: 'Steps', num: 1, v: t => t.steps.length },
        { h: 'Result', v: t => UI.chip(t.result) + (t.firstPass ? '' : ' <span class="tag">retest</span>') },
      ], list, { rowGo: t => 'test/' + t.id }));
};
ACT.tf = el => { App.ui.tf = el.dataset.v; App.render(); };
V.test = id => {
  const t = DB.tests.find(x => x.id === id);
  if (!t) return UI.ph('Tests', 'Not found', E(id));
  const sig = t.sigId && DB.sigs.find(s => s.id === t.sigId);
  return '<div class="crumbs">' + UI.link('tests', 'Test records') + ' / ' + E(t.id) + '</div>' +
    UI.ph(E(t.testType) + ' · ' + E(t.program), E(t.id) + ' · ' + E(t.serial), UI.chip(t.result) + (t.firstPass ? ' First-pass' : ' Includes retest after MRB action')) +
    '<div class="grid g-main">' + UI.card('Test steps', UI.table([
      { h: 'Code', v: s => '<span class="mono">' + E(s.code) + '</span>' },
      { h: 'Step', v: s => E(s.name) + (s.type === 'calc' ? ' <span class="tag">calc</span>' : '') },
      { h: 'Value', num: 1, v: s => '<b class="mono">' + (s.type === 'check' ? E(s.value) : U.num(s.value, s.dec) + ' ' + E(s.unit)) + '</b>' },
      { h: 'Limits', v: s => s.type === 'check' ? '<span class="muted">Pass/Fail</span>' : '<span class="mono small">' + U.num(s.lsl, s.dec) + ' – ' + U.num(s.usl, s.dec) + '</span>' },
      { h: 'Position', v: s => s.type === 'check' ? '' : UI.gauge(s, s.value) },
      { h: 'Result', v: s => UI.chip(s.result) + (s.attempts > 1 ? ' <span class="tag" data-tip="Recorded ' + s.attempts + ' times">×' + s.attempts + '</span>' : '') },
    ], t.steps), { flush: true }) +
    '<div class="stack">' + UI.card('Record', UI.kv([
      ['Unit', UI.serial(t.serial) + ' · ' + E(MES.part(t.itemId).name)],
      ['Operation', 'OP' + t.seq + ' @ ' + UI.link('station/' + t.station, E(t.station))],
      ['Equipment', E(t.equipment)],
      ['Program', '<span class="mono">' + E(t.program) + '</span>'],
      ['Started', U.fmtDT(t.startedAt)],
      ['Completed', U.fmtDT(t.completedAt) + ' · ' + U.dur(t.completedAt - t.startedAt)],
      ['Operator', E(MES.userName(t.operator))],
    ]) + (sig ? '<div style="margin-top:12px">' + UI.sigCard(sig) + '</div>' : '')) + '</div></div>';
};

/* ======================================================= INSPECTION LOG */
V.inspections = () => {
  const f = App.ui.inf || (App.ui.inf = { tab: 'results', item: '', res: '', q: '' });
  let body;
  if (f.tab === 'results') {
    let l = DB.results.slice().reverse();
    if (f.item) l = l.filter(r => r.itemId === f.item);
    if (f.res) l = l.filter(r => r.result === f.res);
    if (f.q) { const q = f.q.toUpperCase(); l = l.filter(r => (r.serial + ' ' + r.name + ' ' + r.value).toUpperCase().includes(q)); }
    body = UI.table([
      { h: 'When', v: r => '<span class="nowrap">' + U.fmtDT(r.at) + '</span>' },
      { h: 'Unit', v: r => UI.serial(r.serial) },
      { h: 'Op', v: r => 'OP' + r.seq },
      { h: 'Item', v: r => '<span class="mono small">' + E(r.code) + '</span> ' + E(r.name) },
      { h: 'Type', v: r => UI.typeIc(r.type) },
      { h: 'Value', num: 1, v: r => '<span class="mono">' + E(r.type === 'measure' || r.type === 'calc' ? r.value + ' ' + r.unit : r.value) + '</span>' },
      { h: 'Result', v: r => UI.chip(r.result) + (r.superseded ? ' <span class="tag" data-tip="Replaced by a later reading">superseded</span>' : '') + (r.drId ? ' ' + UI.drLink(r.drId) : '') },
      { h: 'By', v: r => E(MES.userName(r.by)) },
    ], l.slice(0, 400), { empty: 'No readings match.' }) + (l.length > 400 ? '<div class="empty">Showing latest 400 of ' + l.length + '. Filter to narrow.</div>' : '');
  } else {
    let l = DB.attempts.slice().reverse();
    if (f.res) l = l.filter(a => (a.ok ? 'PASS' : 'FAIL') === f.res);
    if (f.q) { const q = f.q.toUpperCase(); l = l.filter(a => (a.serial + ' ' + a.scanned + ' ' + a.slot).toUpperCase().includes(q)); }
    body = UI.table([
      { h: 'When', v: a => '<span class="nowrap">' + U.fmtDT(a.at) + '</span>' },
      { h: 'Unit', v: a => UI.serial(a.serial) },
      { h: 'Slot', v: a => E(a.slot) + ' <span class="small muted">' + E(a.partId) + '</span>' },
      { h: 'Scanned', v: a => '<span class="mono">' + E(a.scanned) + '</span>' },
      { h: 'Result', v: a => UI.chip(a.ok ? 'PASS' : 'FAIL') },
      { h: 'Checks', v: a => '<span class="small">' + a.checks.map(k => '<span style="color:' + (k.ok ? 'var(--ok)' : 'var(--bad)') + '" data-tip="' + E(k.msg) + '">' + (k.ok ? '✓' : '✕') + ' ' + E(k.label) + '</span>').join(' · ') + '</span>' },
      { h: 'By', v: a => E(MES.userName(a.by)) },
    ], l, { empty: 'No scans match.' });
  }
  return UI.ph('Quality', 'Inspection Log', 'Every reading, checklist answer and serial scan, including superseded readings kept for audit.') +
    UI.card(null, '<div class="tabs" style="margin-bottom:12px"><button type="button" class="' + (f.tab === 'results' ? 'on' : '') + '" data-act="inf" data-k="tab" data-v="results">Inspection results (' + DB.results.length + ')</button><button type="button" class="' + (f.tab === 'scans' ? 'on' : '') + '" data-act="inf" data-k="tab" data-v="scans">Serial validations (' + DB.attempts.length + ')</button></div>' +
      '<div class="filters" style="margin-bottom:12px">' + (f.tab === 'results' ? '<label class="f">Item<select class="in" id="inf-item" data-change="inf" data-k="item">' + UI.options(Q.assemblies().map(p => ({ v: p.id, l: p.id })), f.item, { blank: 'All' }) + '</select></label>' : '') +
      '<label class="f">Result<select class="in" id="inf-res" data-change="inf" data-k="res">' + UI.options(['PASS', 'FAIL'], f.res, { blank: 'All' }) + '</select></label><label class="f" style="flex:1">Search<input class="in" id="inf-q" data-change="inf" data-k="q" value="' + E(f.q) + '" placeholder="Serial, characteristic, value"></label></div>' + body);
};
ACT.inf = el => { App.ui.inf[el.dataset.k] = el.dataset.v; App.render(); };
CHANGE.inf = el => { App.ui.inf[el.dataset.k] = el.value; App.render(); };
