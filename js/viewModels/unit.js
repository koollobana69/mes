/* As-built record (electronic traveler): every operation with readings, signatures, tests and lots. */
define(['knockout', 'services/ui', 'ojs/ojcollapsible'], function (ko, ui) {
  'use strict';
  const E = ui.E;
  return function UnitVM(params) {
    const app = params.app; app.setVM(this);
    const serial = params.args[0], u = MES.unit(serial);
    this.found = !!u; if (!u) return;
    const plan = MES.plan(u.planId), cur = MES.currentOp(u), routing = MES.routing(u.itemId);
    this.serial = serial;
    this.eyebrow = 'As-built record · ' + MES.part(u.itemId).name;
    this.stateHtml = ui.unitState(u);
    this.subHtml = 'Job ' + ui.link('job/' + u.jobId, E(u.jobId)) + ' · built to ' + ui.link('plan/' + u.planId, E(u.planId)) + ' · ' + (u.status === 'Complete' ? 'released ' + U.fmtDT(u.completedAt) : 'at OP' + cur.seq + ' ' + E(cur.name) + ' (' + (u.opIdx + 1) + ' of ' + routing.length + ')');
    this.treeHref = '#/genealogy/' + serial;
    this.stationHref = u.status !== 'Complete' && cur ? '#/station/' + cur.station + '/' + serial : null;
    this.opbar = routing.map(x => ({ cls: 'o ' + u.ops[x.seq].status, label: routing.length > 12 ? String(x.seq) : x.seq + ' ' + x.name, title: 'OP' + x.seq + ' ' + x.name + ' — ' + u.ops[x.seq].status }));
    this.ops = routing.map(o => {
      const s = u.ops[o.seq], chars = MES.planChars(plan, o.seq);
      const test = DB.tests.find(t => t.serial === serial && t.seq === o.seq);
      const lots = u.consumed.filter(x => x.seq === o.seq);
      const fails = DB.drs.filter(d => d.serial === serial && d.seq === o.seq).length;
      return {
        title: 'OP' + o.seq + ' · ' + o.name,
        meta: o.station + ' · ' + MES.station(o.station).wc + (s.start ? ' · ' + MES.userName(s.operator) + ' · ' + U.fmtDT(s.start) + (s.end ? ' → ' + U.fmtT(s.end) + ' (' + U.dur(s.end - s.start) + ')' : '') : ''),
        chip: ui.badge(s.status === 'Done' ? 'Done' : s.status === 'Active' ? 'Active' : 'Queued', s.status) + (fails ? ' ' + ui.badge('Open', fails + ' DR') : '') + (test ? ' ' + ui.link('test/' + test.id, E(test.id)) : ''),
        expanded: (cur && cur.seq === o.seq && u.status !== 'Complete') || fails > 0,
        t: ui.table([
          { h: 'Code', v: c => '<span class="mes-mono">' + E(c.code) + '</span>' }, { h: 'Type', v: c => ui.typeBadge(c.type) }, { h: 'Characteristic', v: c => E(c.name) },
          { h: 'Spec', v: c => '<span class="mes-mono">' + E(MES.specText(c) || (c.type === 'serial' ? c.partId : '')) + '</span>' },
          { h: 'Recorded', v: c => {
            const st = MES.charState(u, o.seq, c), hist = MES.results(serial, o.seq, c.id);
            if (c.type === 'signoff') return st.sig ? E(st.sig.name) + ' <span class="oj-typography-body-xs oj-text-color-secondary">' + U.fmtDT(st.sig.at) + ' · ' + st.sig.id + '</span>' : '<span class="oj-text-color-secondary">not signed</span>';
            if (!st.r) return '—';
            return '<span class="mes-mono">' + E(c.type === 'measure' || c.type === 'calc' ? U.num(st.r.value, c.dec) + ' ' + c.unit : st.r.value) + '</span>' + (hist.length > 1 ? ' <span class="mes-tag" title="' + E(hist.map(r => U.fmtDT(r.at) + '  ' + r.value + '  ' + r.result).join('\n')) + '">' + hist.length + ' readings</span>' : '');
          } },
          { h: 'Result', v: c => { const st = MES.charState(u, o.seq, c); if (c.type === 'signoff') return st.sig ? ui.badge('Signed') : ''; if (!st.r) return ''; return ui.badge(st.state === 'accepted' ? 'Accepted (MRB)' : st.r.result) + (st.r.drId ? ' ' + ui.drLink(st.r.drId) : ''); } },
        ], chars),
        hasChars: chars.length > 0,
        lotsHtml: lots.length ? '<span class="oj-text-color-secondary">Backflushed:</span> ' + lots.map(l => '<span class="mes-mono">' + E(l.partId) + '</span> lot ' + ui.link('genealogy/' + l.lot, '<span class="mes-mono">' + E(l.lot) + '</span>') + ' × ' + l.qty).join(' · ') : '',
      };
    });
    this.opsHint = routing.length + ' operations · ' + routing.filter(o => u.ops[o.seq].status === 'Done').length + ' done';
    this.expandAll = ko.observable(false);
    this.toggleAll = () => { const v = !this.expandAll(); this.expandAll(v); document.querySelectorAll('oj-collapsible.mes-op').forEach(c => { c.expanded = v; }); };
    const drs = DB.drs.filter(d => d.serial === serial);
    this.infoHtml = ui.kv([['Item', ui.link('item/' + u.itemId, E(u.itemId))], ['Launched', U.fmtDT(u.launchedAt) + ' by ' + E(MES.userName(u.launchedBy))], ['Completed', U.fmtDT(u.completedAt)],
      ['Location', u.parent ? 'Installed in ' + ui.serial(u.parent) : E(u.location)], u.itemId === 'VEH-T1' ? ['VIN check digit', E(serial[8]) + ' ' + (U.vinValid(serial) ? '✓ valid' : '✕')] : null]);
    this.compsTitle = 'Installed components (' + u.components.length + ')';
    this.compsHtml = u.components.length ? '<ul class="mes-tl">' + u.components.map(c => '<li><span class="mes-mono">' + E(c.serial) + '</span> · ' + E(c.slot) + ' <span class="oj-typography-body-xs oj-text-color-secondary">OP' + c.seq + ' · ' + U.fmtDT(c.at) + '</span></li>').join('') + '</ul>' : '<div class="mes-empty">None yet.</div>';
    this.drsTitle = 'Discrepancies (' + drs.length + ')';
    this.drsHtml = drs.length ? '<ul class="mes-attn">' + drs.map(d => '<li><div class="tx"><b>' + ui.drLink(d.id) + ' · ' + E(d.title) + '</b>' + (d.disposition ? E(d.disposition) + ' · ' : '') + 'OP' + (d.seq || '—') + '</div>' + ui.badge(d.status) + '</li>').join('') + '</ul>' : '<div class="mes-empty">No discrepancies. First-pass build.</div>';
  };
});
