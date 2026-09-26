/* E-signature register and append-only activity log. */
define(['knockout', 'services/ui'], function (ko, ui) {
  'use strict';
  const E = ui.E;
  return function AuditVM(params) {
    const app = params.app; app.setVM(this);
    const st = app.st('audit', { tab: 'sigs', user: '', q: '' });
    this.tab = ko.observable(st.tab);
    this.tabsDP = ui.adp([{ id: 'sigs', label: 'E-signatures (' + DB.sigs.length + ')' }, { id: 'log', label: 'Activity log (' + DB.audit.length + ')' }]);
    this.userDP = ui.optionsDP([{ value: '*', label: 'Everyone' }].concat(DB.people.map(p => ({ value: p.id, label: p.name }))));
    this.user = ko.observable(st.user); this.userSel = ui.allSel(this.user); this.q = ko.observable(st.q);
    this.t = ko.pureComputed(() => {
      Object.assign(st, { tab: this.tab(), user: this.user(), q: this.q() });
      const q = String(st.q || '').toUpperCase();
      if (st.tab === 'sigs') {
        let l = DB.sigs.slice().reverse();
        if (st.user) l = l.filter(s => s.userId === st.user);
        if (q) l = l.filter(s => (s.label + s.meaning + s.ctx + s.id).toUpperCase().includes(q));
        const t = ui.table([
          { h: 'Signature', v: s => '<b class="mes-mono">' + E(s.id) + '</b>' }, { h: 'When', v: s => ui.dt(s.at) },
          { h: 'Signer', v: s => E(s.name) + '<div class="oj-typography-body-xs oj-text-color-secondary">' + E(s.role) + '</div>' }, { h: 'Meaning', v: s => '<em>' + E(s.meaning) + '</em>' },
          { h: 'Record', v: s => '<span class="mes-tag">' + E(s.ctxType) + '</span> ' + (s.ctxType === 'Discrepancy' ? ui.drLink(s.ctx) : s.ctxType === 'Quality Plan' ? ui.link('plan/' + s.ctx, E(s.ctx)) : s.ctxType === 'Operation' ? ui.link('unit/' + s.ctx.split('|')[0], E(s.label)) : E(s.label)) },
          { h: 'Manifest hash', v: s => '<span class="mes-mono">' + E(s.hash) + '</span>' },
        ], l.slice(0, 500));
        t.note = l.length + ' signatures';
        return t;
      }
      let l = DB.audit.slice().reverse();
      if (st.user) l = l.filter(a => a.by === st.user);
      if (q) l = l.filter(a => (a.action + a.ref + a.detail).toUpperCase().includes(q));
      const t = ui.table([
        { h: 'When', v: a => ui.dt(a.at) }, { h: 'User', v: a => E(MES.userName(a.by)) }, { h: 'Action', v: a => '<b>' + E(a.action) + '</b>' },
        { h: 'Record', v: a => '<span class="mes-mono">' + E(a.ref) + '</span>' }, { h: 'Detail', v: a => E(a.detail) },
      ], l.slice(0, 500));
      t.note = l.length > 500 ? 'Showing latest 500 of ' + l.length : l.length + ' entries';
      return t;
    });
  };
});
