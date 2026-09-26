/* My Work: a focused, role-aware inbox of the things the signed-in person can act on now. */
define(['services/ui', 'services/work'], function (ui, work) {
  'use strict';
  return function MyWorkVM(params) {
    const app = params.app; app.setVM(this);
    const p = MES.currentUser();
    const h = new Date().getHours();
    this.greeting = (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + ', ' + p.name.split(' ')[0];
    const scope = { 'Operator': p.quals.length + ' qualified stations', 'Quality Technician': 'test & inspection stations, verification sign-offs', 'Quality Engineer': 'discrepancies, sign-offs and quality plans', 'Material Handler': 'line-side replenishment', 'Supervisor': 'all stations in your area' }[p.role] || '';
    this.sub = p.role + ' · ' + scope;
    const groups = work.groups(p);
    const urgent = groups.filter(g => g.id !== 'blocked' && g.id !== 'drafts').reduce((n, g) => n + g.items.length, 0);
    this.summary = urgent ? urgent + (urgent === 1 ? ' thing needs you' : ' things need you') : 'You are all caught up';
    this.caughtUp = urgent === 0;
    this.emptyText = { 'Operator': 'New work appears here as units reach your stations or Quality sends a unit back for rework.', 'Quality Technician': 'Units at your test stations and verification sign-offs appear here.', 'Quality Engineer': 'Discrepancies awaiting MRB or verification and sign-offs that need an engineer appear here.', 'Material Handler': 'Line-side shortages against remaining work appear here, with the stock to pick.', 'Supervisor': 'Work at your stations and records that need a supervisor appear here.' }[p.role] || '';
    this.groups = groups.map(g => ({
      title: g.title, hint: g.hint, count: g.items.length, muted: g.id === 'blocked' || g.id === 'drafts',
      items: g.items.map((i, n) => ({
        cls: 'mes-work-item tone-' + i.tone, icon: ui.icon(i.icon), title: i.title, sub: i.sub, meta: i.meta,
        hasAction: !!i.action, label: i.action ? i.action.label : '',
        chroming: i.action && n === 0 && g.id !== 'blocked' ? 'callToAction' : 'outlined',
        act: i.action ? (i.action.act || 'open') : '', href: i.action && i.action.href ? i.action.href : '',
        part: i.action && i.action.data ? i.action.data.part || '' : '', ls: i.action && i.action.data ? i.action.data.ls || '' : '',
        serial: i.action && i.action.data ? i.action.data.serial || '' : '', seq: i.action && i.action.data ? i.action.data.seq || '' : '',
      })),
    }));
    this.stations = p.role === 'Operator' || p.role === 'Quality Technician' ? p.quals.map(id => ({ id, href: '#/station/' + id, label: id + ' · ' + MES.station(id).name })) : [];
    this.actions = {
      open: el => app.go(el.getAttribute('data-href')),
      // Start really starts the operation, then opens the guided station view on the first step
      start: el => {
        const r = MES.startOp(el.getAttribute('data-serial'), Number(el.getAttribute('data-seq')), DB.currentUser);
        if (!r.ok) { app.toast(r.msg, 'bad'); return app.go(el.getAttribute('data-href')); }
        MES.save(); app.go(el.getAttribute('data-href'));
      },
      fulfill: el => app.fulfill(el.getAttribute('data-part'), el.getAttribute('data-ls')),
    };
  };
});
