/* Inspection log: every reading, checklist answer and serial scan (tabbed). */
define(['knockout', 'services/ui'], function (ko, ui) {
  'use strict';
  const E = ui.E;
  return function InspectionsVM(params) {
    const app = params.app; app.setVM(this);
    const st = app.st('insp', { tab: 'results', item: '', res: '', q: '' });
    this.tab = ko.observable(st.tab);
    this.tabsDP = ui.adp([{ id: 'results', label: 'Inspection results (' + DB.results.length + ')' }, { id: 'scans', label: 'Serial validations (' + DB.attempts.length + ')' }]);
    this.itemDP = ui.optionsDP([{ value: '', label: 'All items' }].concat(ui.assemblies().map(p => ({ value: p.id, label: p.id }))));
    this.resDP = ui.optionsDP([{ value: '', label: 'All results' }, 'PASS', 'FAIL']);
    this.item = ko.observable(st.item); this.res = ko.observable(st.res); this.q = ko.observable(st.q);
    this.isResults = ko.pureComputed(() => this.tab() === 'results');
    this.t = ko.pureComputed(() => {
      Object.assign(st, { tab: this.tab(), item: this.item(), res: this.res(), q: this.q() });
      const q = String(this.q() || '').toUpperCase();
      if (this.tab() === 'results') {
        let l = DB.results.slice().reverse();
        if (this.item()) l = l.filter(r => r.itemId === this.item());
        if (this.res()) l = l.filter(r => r.result === this.res());
        if (q) l = l.filter(r => (r.serial + ' ' + r.name + ' ' + r.value).toUpperCase().includes(q));
        const t = ui.table([
          { h: 'When', v: r => U.fmtDT(r.at) }, { h: 'Unit', v: r => ui.serial(r.serial) }, { h: 'Op', v: r => 'OP' + r.seq },
          { h: 'Item', v: r => '<span class="mes-mono">' + E(r.code) + '</span> ' + E(r.name) }, { h: 'Type', v: r => ui.typeBadge(r.type) },
          { h: 'Value', num: 1, v: r => '<span class="mes-mono">' + E(r.type === 'measure' || r.type === 'calc' ? r.value + ' ' + r.unit : r.value) + '</span>' },
          { h: 'Result', v: r => ui.badge(r.result) + (r.superseded ? ' <span class="mes-tag" title="Replaced by a later reading">superseded</span>' : '') + (r.drId ? ' ' + ui.drLink(r.drId) : '') },
          { h: 'By', v: r => E(MES.userName(r.by)) },
        ], l.slice(0, 500));
        t.note = l.length > 500 ? 'Showing latest 500 of ' + l.length + '. Filter to narrow.' : l.length + ' readings';
        return t;
      }
      let l = DB.attempts.slice().reverse();
      if (this.res()) l = l.filter(a => (a.ok ? 'PASS' : 'FAIL') === this.res());
      if (q) l = l.filter(a => (a.serial + ' ' + a.scanned + ' ' + a.slot).toUpperCase().includes(q));
      const t = ui.table([
        { h: 'When', v: a => U.fmtDT(a.at) }, { h: 'Unit', v: a => ui.serial(a.serial) }, { h: 'Slot', v: a => E(a.slot) + ' <span class="oj-typography-body-xs oj-text-color-secondary">' + E(a.partId) + '</span>' },
        { h: 'Scanned', v: a => '<span class="mes-mono">' + E(a.scanned) + '</span>' }, { h: 'Result', v: a => ui.badge(a.ok ? 'PASS' : 'FAIL') },
        { h: 'Checks', v: a => a.checks.map(k => '<span class="' + (k.ok ? 'oj-text-color-success' : 'oj-text-color-danger') + '" title="' + E(k.msg) + '">' + (k.ok ? '✓' : '✕') + ' ' + E(k.label) + '</span>').join(' · ') },
        { h: 'By', v: a => E(MES.userName(a.by)) },
      ], l);
      t.note = l.length + ' scans';
      return t;
    });
  };
});
