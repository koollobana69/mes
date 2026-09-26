/* Quality plans: one plan per assembly item number, with revision history. */
define(['knockout', 'services/ui'], function (ko, ui) {
  'use strict';
  const E = ui.E;
  return function PlansVM(params) {
    const app = params.app; app.setVM(this);
    this.rowAction = ui.rowAction(app);
    const typeSummary = p => { const c = {}; Object.values(p.steps).flat().forEach(x => { c[x.type] = (c[x.type] || 0) + 1; }); return ['serial', 'check', 'measure', 'calc', 'signoff'].filter(t => c[t]).map(t => '<span class="mes-type mes-type-' + t + '" title="' + c[t] + ' ' + t + '">' + c[t] + '</span>').join(' '); };
    this.items = ui.assemblies().map(item => {
      const plans = MES.plansFor(item.id), draft = MES.draftFor(item.id), act = MES.activePlan(item.id);
      return {
        id: item.id, title: item.id + ' · ' + item.name, rowAction: this.rowAction,
        hint: MES.routing(item.id).length + ' operations · ' + (act ? 'production uses rev ' + act.rev : 'no released revision'),
        draftHref: draft ? '#/plan/' + draft.id : null, draftLabel: draft ? 'Open draft rev ' + draft.rev : '', newLabel: plans.length ? 'New revision' : 'Create quality plan',
        t: ui.table([
          { h: 'Plan', v: p => '<b class="mes-mono">' + E(p.id) + '</b>' },
          { h: 'Rev', v: p => '<b>' + E(p.rev) + '</b>' },
          { h: 'Status', v: p => ui.badge(p.status) },
          { h: 'Plan items', v: p => typeSummary(p) },
          { h: 'Ops covered', num: 1, v: p => Object.values(p.steps).filter(x => x.length).length + ' / ' + MES.routing(p.itemId).length },
          { h: 'Units built', num: 1, v: p => DB.units.filter(u => u.planId === p.id).length },
          { h: 'Approved', v: p => p.releasedAt ? E(MES.userName(p.releasedBy)) + '<div class="oj-typography-body-xs oj-text-color-secondary">' + U.fmtD(p.releasedAt) + '</div>' : '—' },
          { h: 'Change note', v: p => '<span class="oj-typography-body-sm">' + E(p.changeNote || '') + '</span>' },
        ], plans, { rowGo: p => 'plan/' + p.id }),
      };
    });
    this.newItem = ko.observable(null);
    this.newHasPlans = ko.observable(false);
    this.newMode = ko.observable('copy');
    this.modeDP = ui.optionsDP([{ value: 'copy', label: 'Copy of the latest revision' }, { value: 'blank', label: 'Blank plan' }]);
    this.closeNew = () => document.getElementById('newPlanDialog').close();
    this.createDraft = () => {
      const r = MES.newRevision(this.newItem(), DB.currentUser, this.newMode() === 'blank');
      if (!r.ok) return app.toast(r.msg, 'bad');
      document.getElementById('newPlanDialog').close();
      MES.save(); app.toast('Draft ' + r.plan.id + ' created'); app.go('plan/' + r.plan.id);
    };
    this.actions = {
      'plan-new': el => {
        if (MES.currentUser().role !== 'Quality Engineer') return app.toast('Quality plans are authored by Quality Engineers. Switch user to Priya Shah or Daniel Okafor.', 'warn');
        const id = el.getAttribute('data-item');
        this.newItem(id); this.newHasPlans(MES.plansFor(id).length > 0); this.newMode('copy');
        document.getElementById('newPlanDialog').open();
      },
    };
  };
});
