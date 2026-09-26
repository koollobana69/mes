/* Material movement ledger. */
define(['knockout', 'services/ui'], function (ko, ui) {
  'use strict';
  const E = ui.E;
  return function MovesVM(params) {
    const app = params.app; app.setVM(this);
    const st = app.st('moves', { type: '', q: '' });
    this.typeDP = ui.optionsDP([{ value: '', label: 'All movement types' }].concat([...new Set(DB.moves.map(m => m.type))]));
    this.type = ko.observable(st.type); this.q = ko.observable(st.q);
    const loc = x => MES.loc(x) ? '<span title="' + E(MES.loc(x).name) + '">' + E(x) + '</span>' : MES.unit(x) ? ui.serial(x) : '<span class="oj-text-color-secondary">' + E(x) + '</span>';
    this.t = ko.pureComputed(() => {
      Object.assign(st, { type: this.type(), q: this.q() });
      let l = DB.moves.slice().reverse();
      if (st.type) l = l.filter(m => m.type === st.type);
      if (st.q) { const q = st.q.toUpperCase(); l = l.filter(m => [m.partId, m.serial, m.lot, m.from, m.to, m.ref].join(' ').toUpperCase().includes(q)); }
      const t = ui.table([
        { h: 'When', v: m => U.fmtDT(m.at) }, { h: 'Type', v: m => '<span class="mes-tag">' + E(m.type) + '</span>' }, { h: 'Part', v: m => '<span class="mes-mono">' + E(m.partId) + '</span>' },
        { h: 'Serial / lot', v: m => '<span class="mes-mono">' + E(m.serial || (m.lot ? 'lot ' + m.lot : '')) + '</span>' }, { h: 'Qty', num: 1, v: m => m.qty },
        { h: 'From', v: m => loc(m.from) }, { h: 'To', v: m => loc(m.to) }, { h: 'By', v: m => E(MES.userName(m.by)) }, { h: 'Reference', v: m => E(m.ref || '') },
      ], l.slice(0, 400));
      t.note = l.length > 400 ? 'Showing latest 400 of ' + l.length : l.length + ' movements';
      return t;
    });
  };
});
