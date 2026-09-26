/* Personnel: roles, badges, activity and the station qualification matrix. */
define(['services/ui'], function (ui) {
  'use strict';
  const E = ui.E;
  return function PeopleVM(params) {
    const app = params.app; app.setVM(this);
    const today = U.dayKey(MES.now());
    this.t = ui.table([
      { h: '', v: p => '<span class="mes-avatar mes-av-' + ui.avatarColor(p.role) + '">' + E(ui.initials(p.name)) + '</span>' },
      { h: 'Name', v: p => '<b>' + E(p.name) + '</b>' + (p.id === DB.currentUser ? ' <span class="mes-tag">signed in</span>' : '') },
      { h: 'Role', v: p => E(p.role) }, { h: 'Badge', v: p => '<span class="mes-mono">' + E(p.badge) + '</span>' }, { h: 'Shift', v: p => E(p.shift) },
      { h: 'Home building', v: p => E(MES.building(p.building).short) }, { h: 'Stations', num: 1, v: p => p.quals.length },
      { h: 'Signatures', num: 1, v: p => DB.sigs.filter(s => s.userId === p.id).length },
      { h: 'Actions today', num: 1, v: p => DB.audit.filter(a => a.by === p.id && U.dayKey(a.at) === today).length },
      { h: '', v: p => p.id === DB.currentUser ? '' : ui.btn('Switch to', 'as-user', { id: p.id }, 'borderless') },
    ], DB.people);
    const ops = DB.people.filter(p => p.quals.length);
    this.matrix = ['B10', 'B20', 'B30'].map(b => {
      const sts = DB.stations.filter(s => s.building === b), who = ops.filter(p => p.quals.some(q => q.startsWith(b)));
      return { name: MES.building(b).name, html: '<div style="overflow-x:auto"><table class="mes-qm"><thead><tr><th>Person</th>' + sts.map(s => '<th class="rot" title="' + E(s.name) + '"><span>' + E(s.id) + '</span></th>').join('') + '</tr></thead><tbody>' +
        who.map(p => '<tr><td class="who">' + E(p.name) + ' <span class="oj-typography-body-xs oj-text-color-secondary">' + E(p.role) + '</span></td>' + sts.map(s => '<td>' + (p.quals.includes(s.id) ? '<span class="y" title="' + E(p.name + ' qualified on ' + s.id) + '">●</span>' : '<span class="n">·</span>') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>' };
    });
    this.actions = { 'as-user': el => app.userId(el.getAttribute('data-id')) };
  };
});
