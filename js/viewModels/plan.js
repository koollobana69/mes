/* Quality plan editor: per-operation plan items (checklist, serial validation, measurement, calculation,
   sign-off), plan checks, revision history and QE-signed release. Handles long routings with a navigator. */
define(['knockout', 'services/ui'], function (ko, ui) {
  'use strict';
  const E = ui.E;
  return function PlanVM(params) {
    const app = params.app; app.setVM(this);
    const plan = MES.plan(params.args[0]);
    this.found = !!plan; if (!plan) return;
    const item = MES.part(plan.itemId), draft = plan.status === 'Draft';
    const routing = MES.routing(plan.itemId);
    const base = plan.basedOn ? MES.plan(plan.basedOn) : null;
    const key = c => c.type + '|' + c.name + '|' + (c.lsl ?? '') + '|' + (c.usl ?? '') + '|' + (c.formula || '');
    const baseKeys = base ? new Set(Object.entries(base.steps).flatMap(([s, cs]) => cs.map(c => s + '|' + key(c)))) : null;
    const issues = MES.planIssues(plan);
    const sig = plan.sigId && DB.sigs.find(s => s.id === plan.sigId);
    const hasDraft = MES.draftFor(plan.itemId);
    const isQE = () => MES.currentUser().role === 'Quality Engineer';

    this.draft = draft;
    this.eyebrow = item.id + ' · ' + item.name;
    this.title = 'Quality Plan ' + plan.id;
    this.statusHtml = ui.badge(plan.status);
    this.sub = draft ? 'Draft — editable. Release requires a Quality Engineer e-signature' + (MES.activePlan(plan.itemId) ? ' and supersedes rev ' + MES.activePlan(plan.itemId).rev : '') + '.'
      : plan.status === 'Released' ? 'Released for production. New units launch against this revision.' : 'Superseded by ' + (plan.supersededBy || '') + '. Units built to it keep this as their record.';
    this.draftHref = hasDraft && !draft ? '#/plan/' + hasDraft.id : null;
    this.draftLabel = hasDraft ? 'Open draft rev ' + hasDraft.rev : '';
    this.canNewRev = !draft && !hasDraft;

    const counts = {}; Object.values(plan.steps).flat().forEach(x => { counts[x.type] = (counts[x.type] || 0) + 1; });
    this.summaryHtml = ui.kv([
      ['Item', ui.link('item/' + item.id, E(item.id))],
      ['Revision', E(plan.rev) + (base ? ' (from ' + ui.link('plan/' + base.id, E(base.id)) + ')' : '')],
      ['Routing', routing.length + ' operations · ' + Object.values(plan.steps).filter(x => x.length).length + ' with plan items'],
      ['Plan items', ['serial', 'check', 'measure', 'calc', 'signoff'].filter(t => counts[t]).map(t => '<span class="mes-type mes-type-' + t + '">' + counts[t] + ' ' + t + '</span>').join(' ')],
      ['Author', E(MES.userName(plan.createdBy)) + ' · ' + U.fmtD(plan.createdAt)],
      plan.releasedAt ? ['Approved', E(MES.userName(plan.releasedBy)) + ' · ' + U.fmtDT(plan.releasedAt)] : null,
      ['Units built', DB.units.filter(u => u.planId === plan.id).length],
    ]) + (sig ? '<div style="margin-top:12px">' + ui.sigCard(sig) + '</div>' : '');
    this.issuesHint = issues.filter(i => i.level === 'error').length + ' errors · ' + issues.filter(i => i.level === 'warn').length + ' warnings';
    this.issuesHtml = issues.length ? '<ul class="mes-issues">' + issues.map(i => '<li class="' + i.level + '">' + (i.level === 'error' ? '✕ ' : '⚠ ') + E(i.msg) + '</li>').join('') + '</ul>' : '<div class="mes-empty oj-text-color-success">✓ No issues. Every serialized component is validated and every calculation references valid inputs.</div>';
    this.revsHtml = '<ul class="mes-tl">' + MES.plansFor(plan.itemId).map(p => '<li>' + ui.link('plan/' + p.id, '<b>rev ' + E(p.rev) + '</b>') + ' ' + ui.badge(p.status) + '<div class="oj-typography-body-xs oj-text-color-secondary">' + E(p.changeNote || 'In draft') + '</div></li>').join('') + '</ul>';
    this.legendHtml = [['check', 'pass/fail; failure opens a discrepancy'], ['serial', 'BOM, mask, inventory, hold & line-side checks; builds genealogy'], ['measure', 'reading vs LSL/USL'], ['calc', 'formula over same-operation readings'], ['signoff', 'role-based e-signature; Verified/Approved must be independent']]
      .map(([t, d]) => '<span class="mes-row" style="gap:6px">' + ui.typeBadge(t) + '<span class="oj-typography-body-sm oj-text-color-secondary">' + d + '</span></span>').join('');

    /* navigator for long routings */
    const st = app.st('plan:' + plan.id, { filter: 'all' });
    const zones = [...new Set(routing.map(o => MES.station(o.station).wc))];
    this.filterDP = ui.optionsDP([{ value: 'all', label: 'All ' + routing.length + ' operations' }, { value: 'items', label: 'Operations with plan items' }, { value: 'issues', label: 'Operations with plan issues' }]
      .concat(zones.map(z => ({ value: 'zone:' + z, label: 'Zone: ' + z })))
      .concat(routing.map(o => ({ value: 'op:' + o.seq, label: 'OP' + o.seq + ' ' + o.name }))));
    this.filter = ko.observable(st.filter);
    this.filter.subscribe(v => { st.filter = v || 'all'; });

    const opsAll = routing.map(o => {
      const chars = MES.planChars(plan, o.seq), stn = MES.station(o.station);
      const bom = (DB.boms[plan.itemId] || []).filter(b => b.op === o.seq);
      return {
        seq: o.seq, draft, zone: stn.wc, name: o.name, meta: o.station + ' · ' + stn.name + ' · ' + stn.wc + (o.test ? ' · ' + o.test : ''),
        hasIssue: issues.some(i => i.seq === o.seq), count: chars.length + ' items',
        bomHtml: bom.length ? '<span class="oj-text-color-secondary">Consumes:</span> ' + bom.map(b => { const p = MES.part(b.partId); const cov = p.tracking === 'Serial' && chars.some(c => c.type === 'serial' && c.partId === b.partId && (!b.slot || c.slot === b.slot)); return '<span class="mes-tag" title="' + E(p.name + ' · ' + p.tracking + '-tracked') + '">' + E(b.partId) + (b.slot ? ' · ' + E(b.slot) : '') + ' ×' + b.qty + (p.tracking === 'Serial' ? (cov ? ' ✓' : ' ⚠') : '') + '</span>'; }).join(' ') : '',
        t: ui.table([
          { h: 'Code', v: c => '<span class="mes-mono">' + E(c.code) + '</span>' + (baseKeys && !baseKeys.has(o.seq + '|' + key(c)) ? '<div class="mes-newmark">' + (draft ? 'changed' : 'new') + '</div>' : '') },
          { h: 'Type', v: c => ui.typeBadge(c.type) },
          { h: 'Characteristic', v: c => '<b>' + E(c.name) + '</b>' },
          { h: 'Specification / details', v: c => {
            if (c.type === 'measure') return '<span class="mes-mono">' + E(MES.specText(c)) + '</span> · nom ' + U.num(c.nominal, c.dec) + (c.gauge ? ' · ' + E(c.gauge) : '');
            if (c.type === 'calc') return '<span class="mes-formula">' + E(c.formula) + '</span> → <span class="mes-mono">' + E(MES.specText(c)) + '</span>';
            if (c.type === 'serial') return '<span class="mes-mono">' + E(c.partId) + '</span> · ' + E(c.slot) + ' · mask <span class="mes-mono">' + E(MES.part(c.partId).pattern) + '</span>';
            if (c.type === 'signoff') return E(c.role) + ' · meaning “' + E(c.meaning) + '”';
            return '<span class="oj-text-color-secondary">Pass / Fail' + (c.phase === 'end' ? ' · station-end checklist' : '') + '</span>';
          } },
          { h: 'Severity', v: c => c.type === 'signoff' ? '' : ui.sev(c.sev) },
          { h: 'Category', v: c => c.type === 'signoff' ? '' : E(c.cat || '') },
        ].concat(draft ? [{ h: '', v: c => '<span class="mes-row" style="gap:2px;flex-wrap:nowrap">' + ui.btn('↑', 'char-move', { seq: o.seq, id: c.id, dir: -1 }, 'borderless') + ui.btn('↓', 'char-move', { seq: o.seq, id: c.id, dir: 1 }, 'borderless') + ui.btn('Edit', 'char-edit', { seq: o.seq, id: c.id }, 'borderless') + ui.btn('Remove', 'char-del', { seq: o.seq, id: c.id }, 'borderless') + '</span>' }] : []), chars, { empty: 'No plan items on this operation.' }),
        hasChars: chars.length > 0,
      };
    });
    this.ops = ko.pureComputed(() => {
      const f = this.filter() || 'all';
      return opsAll.filter(o => f === 'all' || (f === 'items' && o.hasChars) || (f === 'issues' && o.hasIssue) || (f.startsWith('zone:') && o.zone === f.slice(5)) || (f === 'op:' + o.seq));
    });
    this.opCount = ko.pureComputed(() => this.ops().length + ' of ' + routing.length + ' operations shown');

    /* ---------- plan item dialog ---------- */
    const d = this.cf = {
      title: ko.observable(''), editing: ko.observable(false), seq: null, id: null,
      type: ko.observable('check'), name: ko.observable(''), unit: ko.observable(''), nominal: ko.observable(''), lsl: ko.observable(''), usl: ko.observable(''), dec: ko.observable('2'),
      gauge: ko.observable(''), formula: ko.observable(''), formulaRaw: ko.observable(''), role: ko.observable('Operator'), meaning: ko.observable('Performed'),
      sev: ko.observable('Minor'), cat: ko.observable('Workmanship'), phase: ko.observable('in'), line: ko.observable(''), error: ko.observable(''),
      lineDP: ko.observable(ui.optionsDP([])), inputs: ko.observable(''),
    };
    this.typeDP = ui.optionsDP([{ value: 'check', label: 'Checklist item' }, { value: 'serial', label: 'Serial validation' }, { value: 'measure', label: 'Measurement' }, { value: 'calc', label: 'Calculation' }, { value: 'signoff', label: 'Sign-off' }]);
    this.sevDP = ui.optionsDP(['Minor', 'Major', 'Critical']);
    this.catDP = ui.optionsDP(['Workmanship', 'Dimensional', 'Torque', 'Weld', 'Sealing', 'Paint', 'Leak', 'Electrical', 'Fluids', 'Test', 'Traceability', 'Cosmetic', 'Documentation']);
    this.phaseDP = ui.optionsDP([{ value: 'in', label: 'In-process inspection' }, { value: 'end', label: 'Station-end checklist' }]);
    this.roleDP = ui.optionsDP(['Operator', 'Quality Technician', 'Quality Engineer', 'Supervisor']);
    this.meaningDP = ui.optionsDP(['Performed', 'Verified', 'Approved']);
    d.isType = t => ko.pureComputed(() => d.type() === t);
    d.isNumeric = ko.pureComputed(() => d.type() === 'measure' || d.type() === 'calc');
    d.formulaMsg = ko.pureComputed(() => {
      const f = d.formulaRaw() || d.formula();
      if (d.type() !== 'calc' || !f) return [];
      const codes = MES.planChars(plan, d.seq).filter(x => (x.type === 'measure' || x.type === 'calc') && x.id !== d.id);
      try {
        const refs = Formula.refs(f), bad = refs.filter(r => !codes.some(c => c.code === r));
        if (bad.length) return [{ severity: 'error', summary: 'Unknown input', detail: bad.join(', ') + ' is not a measurement in OP' + d.seq + '.' }];
        const vars = {}; codes.forEach(c => { vars[c.code] = c.type === 'measure' ? c.nominal : (c.lsl + c.usl) / 2; });
        return [{ severity: 'confirmation', summary: 'Valid formula', detail: 'At nominal inputs it evaluates to ' + U.num(Formula.evaluate(f, vars), 3) + '.' }];
      } catch (e) { return [{ severity: 'error', summary: 'Formula error', detail: e.message }]; }
    });
    const openChar = (seq, c) => {
      d.seq = seq; d.id = c ? c.id : null; d.editing(!!c); d.error('');
      const o = routing.find(x => x.seq === seq);
      d.title((c ? 'Edit ' + c.code : 'Add plan item') + ' · OP' + seq + ' ' + o.name);
      const x = c || { type: 'check', sev: 'Minor', cat: 'Workmanship', phase: 'in', dec: 2, role: 'Operator', meaning: 'Performed' };
      d.type(x.type); d.name(x.name || ''); d.unit(x.unit || ''); d.nominal(x.nominal ?? ''); d.lsl(x.lsl ?? ''); d.usl(x.usl ?? ''); d.dec(String(x.dec ?? 2));
      d.gauge(x.gauge || ''); d.formula(x.formula || ''); d.formulaRaw(x.formula || ''); d.role(x.role || 'Operator'); d.meaning(x.meaning || 'Performed');
      d.sev(x.sev || 'Minor'); d.cat(x.cat || 'Workmanship'); d.phase(x.phase || 'in');
      const lines = (DB.boms[plan.itemId] || []).filter(b => b.op === seq && MES.part(b.partId).tracking === 'Serial');
      d.lineDP(ui.optionsDP(lines.map(b => ({ value: b.partId + '|' + (b.slot || ''), label: b.partId + (b.slot ? ' · ' + b.slot : '') + ' — ' + MES.part(b.partId).name }))));
      d.line(x.partId ? x.partId + '|' + (x.slot || '') : (lines[0] ? lines[0].partId + '|' + (lines[0].slot || '') : ''));
      d.inputs('Inputs available in OP' + seq + ': ' + (MES.planChars(plan, seq).filter(y => (y.type === 'measure' || y.type === 'calc') && (!c || y.id !== c.id)).map(y => y.code + ' ' + y.name).join(' · ') || 'none — add measurements first') + '. Functions: min, max, avg, sum, abs, sqrt, round.');
      document.getElementById('charDialog').open();
    };
    d.close = () => document.getElementById('charDialog').close();
    d.save = () => {
      const t = d.type();
      const def = { type: t, name: String(d.name() || '').trim(), sev: d.sev(), cat: d.cat() };
      if (t === 'measure' || t === 'calc') Object.assign(def, { unit: d.unit(), lsl: d.lsl(), usl: d.usl(), dec: d.dec(), phase: 'in' });
      if (t === 'measure') Object.assign(def, { nominal: d.nominal(), gauge: d.gauge() });
      if (t === 'calc') def.formula = String(d.formulaRaw() || d.formula() || '').trim();
      if (t === 'check') def.phase = d.phase();
      if (t === 'serial') { const [partId, slot] = String(d.line() || '').split('|'); Object.assign(def, { partId, slot: slot || '', name: '' }); if (d.editing()) def.name = 'Scan ' + (slot || partId) + ' serial'; }
      if (t === 'signoff') Object.assign(def, { role: d.role(), meaning: d.meaning(), phase: 'end', sev: 'Minor', cat: 'Documentation', name: def.name || d.role() + ' sign-off' });
      ['lsl', 'usl', 'nominal', 'dec'].forEach(k => { if (def[k] !== undefined && def[k] !== '') def[k] = Number(def[k]); });
      const r = d.editing() ? MES.updateChar(plan.id, d.seq, d.id, def, DB.currentUser) : MES.addChar(plan.id, d.seq, def, DB.currentUser);
      if (!r.ok) { d.error(r.msg); return; }
      document.getElementById('charDialog').close();
      app.commit(r, d.editing() ? 'Plan item updated' : r.ch.code + ' added to OP' + d.seq);
    };

    const needQE = () => { app.toast('Quality plans are authored by Quality Engineers. Switch user to Priya Shah or Daniel Okafor.', 'warn'); return false; };
    const findChar = (seq, id) => MES.planChars(plan, seq).find(c => c.id === id);
    this.actions = {
      'char-add': el => { if (!isQE()) return needQE(); openChar(Number(el.getAttribute('data-seq')), null); },
      'char-edit': el => { if (!isQE()) return needQE(); const seq = Number(el.getAttribute('data-seq')); openChar(seq, findChar(seq, el.getAttribute('data-id'))); },
      'char-move': el => { if (!isQE()) return needQE(); app.commit(MES.moveChar(plan.id, Number(el.getAttribute('data-seq')), el.getAttribute('data-id'), Number(el.getAttribute('data-dir')))); },
      'char-del': el => {
        if (!isQE()) return needQE();
        const seq = Number(el.getAttribute('data-seq')), c = findChar(seq, el.getAttribute('data-id'));
        app.openConfirm({ title: 'Remove ' + c.code + '?', body: '<p>Remove <b>' + E(c.name) + '</b> from OP' + seq + ' of draft ' + E(plan.id) + '.</p>', okLabel: 'Remove', cancelLabel: 'Keep it' },
          () => { const r = MES.deleteChar(plan.id, seq, c.id, DB.currentUser); app.commit(r, c.code + ' removed'); });
      },
    };
    this.newRevision = () => {
      if (!isQE()) return needQE();
      const r = MES.newRevision(plan.itemId, DB.currentUser, false);
      if (!r.ok) return app.toast(r.msg, 'bad');
      MES.save(); app.toast('Draft ' + r.plan.id + ' created'); app.go('plan/' + r.plan.id);
    };
    this.discard = () => {
      if (!isQE()) return needQE();
      app.openConfirm({ title: 'Discard draft?', body: '<p>Delete draft ' + E(plan.id) + ' and all of its edits.</p>', okLabel: 'Discard', cancelLabel: 'Keep draft' },
        () => { const r = MES.discardDraft(plan.id, DB.currentUser); if (r.ok) { MES.save(); app.toast('Draft discarded'); app.go('plans'); } else app.toast(r.msg, 'bad'); });
    };
    this.release = () => {
      const errs = MES.planIssues(plan).filter(i => i.level === 'error');
      if (errs.length) return app.toast('Fix ' + errs.length + ' plan error(s) first: ' + errs[0].msg, 'bad');
      const cur = MES.activePlan(plan.itemId);
      app.openSign({
        title: 'Approve & release ' + plan.id, role: 'Quality Engineer', meaning: 'Approved for production', confirm: 'Approve & release', noteLabel: 'Change description (ECN, 8D, PPAP reference)',
        summary: '<p>Releasing makes <b>rev ' + E(plan.rev) + '</b> the plan for every new ' + E(plan.itemId) + ' unit' + (cur ? ' and supersedes rev ' + E(cur.rev) + '. Units already launched keep rev ' + E(cur.rev) + '.' : '.') + '</p>',
      }, (signer, pin, note) => { const r = MES.releasePlan(plan.id, note, signer, pin); if (r.ok) app.commit(r, plan.id + ' released for production'); return r; });
    };
  };
});
