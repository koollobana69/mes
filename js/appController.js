/* Ridgeline MES — application controller: routing, navigation drawer, user context, messages,
   and the shared e-signature / confirm dialog services used by every view. */
define([
  'knockout', 'ojs/ojmodule-element-utils', 'ojs/ojarraydataprovider', 'ojs/ojresponsiveutils', 'ojs/ojresponsiveknockoututils', 'services/ui',
  'ojs/ojknockout', 'ojs/ojmodule-element', 'ojs/ojbutton', 'ojs/ojinputtext', 'ojs/ojinputnumber', 'ojs/ojselectsingle', 'ojs/ojformlayout',
  'ojs/ojtable', 'ojs/ojchart', 'ojs/ojgauge', 'ojs/ojtrain', 'ojs/ojdialog', 'ojs/ojmessages', 'ojs/ojnavigationlist', 'ojs/ojdrawerlayout',
  'ojs/ojavatar', 'ojs/ojtreeview', 'ojs/ojprogress-bar', 'ojs/ojlabel', 'services/work',
], function (ko, ModuleElementUtils, ArrayDataProvider, ResponsiveUtils, ResponsiveKnockoutUtils, ui) {
  'use strict';

  const VIEWS = ['mywork', 'dashboard', 'jobs', 'job', 'dispatch', 'station', 'plans', 'plan', 'drs', 'dr', 'holds', 'tests', 'test', 'inspections', 'inventory', 'moves', 'genealogy', 'tree', 'unit', 'items', 'item', 'people', 'audit'];
  /* What each role sees in the navigation. Detail pages (a DR, a unit, a plan…) stay reachable by link. */
  const ROLE_NAV = {
    'Operator': ['mywork', 'station'],
    'Quality Technician': ['mywork', 'station', 'drs', 'tests', 'inspections'],
    'Material Handler': ['mywork', 'dispatch', 'inventory', 'moves'],
    'Quality Engineer': ['mywork', 'dashboard', 'plans', 'drs', 'holds', 'tests', 'inspections', 'genealogy', 'audit'],
    'Supervisor': null, // everything
  };
  const DETAIL = ['dr', 'plan', 'job', 'test', 'unit', 'tree', 'item'];
  const NAV_FOR = { dr: 'drs', plan: 'plans', job: 'jobs', test: 'tests', unit: 'genealogy', tree: 'genealogy', item: 'items' };

  class AppController {
    constructor() {
      // ---- data store
      if (!MES.load() || !DB || DB.version !== 1) { DB = SEED.build(); MES.save(); }
      this.ui = ui;
      this.rev = ko.observable(0);
      this.plant = DB.company.plant;
      this.state = {};                // per-view UI state that survives refreshes (filters, selections)
      this.vm = null;                 // current view model (for delegated actions)

      // ---- layout / responsive drawer
      const lgQuery = ResponsiveUtils.getFrameworkQuery(ResponsiveUtils.FRAMEWORK_QUERY_KEY.LG_UP);
      this.lgUp = ResponsiveKnockoutUtils.createMediaQueryObservable(lgQuery);
      this.drawerOpen = ko.observable(this.lgUp());
      this.drawerDisplay = ko.pureComputed(() => this.lgUp() ? 'reflow' : 'overlay');
      this.lgUp.subscribe(v => this.drawerOpen(v));
      this.toggleDrawer = () => this.drawerOpen(!this.drawerOpen());

      // ---- user context
      this.peopleDP = ui.optionsDP(DB.people.map(p => ({ value: p.id, label: p.name + ' — ' + p.role })));
      this.userId = ko.observable(DB.currentUser);
      this.user = ko.pureComputed(() => { this.rev(); return MES.person(this.userId()) || DB.people[0]; });
      this.userName = ko.pureComputed(() => this.user().name + ', ' + this.user().role);
      this.userInitials = ko.pureComputed(() => ui.initials(this.user().name));
      this.userColor = ko.pureComputed(() => ui.avatarColor(this.user().role));
      this.userId.subscribe(v => {
        if (!v || v === DB.currentUser) return;
        DB.currentUser = v; MES.save();
        const p = MES.person(v); this.toast('Signed in as ' + p.name + ' (' + p.role + ')', 'info');
        // switching user is signing in: land on that person's home screen
        this.rev(this.rev() + 1); this.go(this.landing());
      });

      this.clock = ko.observable('');
      const tick = () => { const d = new Date(); const h = d.getHours(); this.clock(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + U.fmtT(d.getTime()) + ' · Shift ' + (h >= 6 && h < 14 ? 'A' : h >= 14 && h < 22 ? 'B' : 'C')); };
      tick(); setInterval(tick, 30000);

      // ---- navigation
      const openDr = ko.pureComputed(() => { this.rev(); return DB.drs.filter(d => d.status === 'Open').length; });
      const holds = ko.pureComputed(() => { this.rev(); return MES.activeHolds().length; });
      const it = (id, icon, label, badge) => ({ id, label, icon: ui.icon(icon), badge: badge || null });
      const allGroups = [
        { label: 'My work', items: [it('mywork', 'check', 'My Work', ko.pureComputed(() => { this.rev(); return this.myWorkCount(); }))] },
        { label: 'Overview', items: [it('dashboard', 'dash', 'Plant Dashboard')] },
        { label: 'Production', items: [it('jobs', 'jobs', 'Jobs & WIP'), it('dispatch', 'dispatch', 'Dispatch List'), it('station', 'station', 'Station Terminal')] },
        { label: 'Quality', items: [it('plans', 'plan', 'Quality Plans'), it('drs', 'alert', 'Discrepancies', openDr), it('holds', 'lock', 'Quality Holds', holds), it('tests', 'test', 'Test Records'), it('inspections', 'inspect', 'Inspection Log')] },
        { label: 'Materials', items: [it('inventory', 'box', 'Inventory'), it('moves', 'truck', 'Material Movements')] },
        { label: 'Traceability', items: [it('genealogy', 'tree', 'As-Built Genealogy')] },
        { label: 'Administration', items: [it('items', 'item', 'Items & Routings'), it('people', 'users', 'Personnel'), it('audit', 'audit', 'E-Signatures & Audit')] },
      ];
      this.navGroups = ko.pureComputed(() => {
        const allowed = this.allowed();
        return allGroups.map(g => ({ label: g.label, items: g.items.filter(i => !allowed || allowed.includes(i.id)) })).filter(g => g.items.length);
      });
      this.route = ko.observable({ name: 'dashboard', args: [] });
      this.navSelection = ko.pureComputed(() => NAV_FOR[this.route().name] || this.route().name);
      this.navChanged = (event) => {
        if (event.detail.updatedFrom !== 'internal' || !event.detail.value || event.detail.value === this.navSelection()) return;
        this.go(event.detail.value);
        if (!this.lgUp()) this.drawerOpen(false);
      };
      this.moduleConfig = ko.observable({ view: [], viewModel: null });

      // ---- messages (toasts)
      this.messages = ko.observableArray([]);
      this.messagesDP = new ArrayDataProvider(this.messages, { keyAttributes: 'id' });
      this.messagePosition = { my: { vertical: 'top', horizontal: 'end' }, at: { vertical: 'top', horizontal: 'end' }, of: 'window', offset: { x: -16, y: 64 } };

      // ---- search
      this.searchText = ko.observable('');
      this.searchPlaceholder = ko.pureComputed(() => ['Operator', 'Quality Technician'].includes(this.user().role) ? 'Scan a unit serial or VIN to open it at your station' : 'Find VIN, serial, lot, DR or job');
      this.searchKey = (event) => {
        if (event.key !== 'Enter') return;
        const el = document.getElementById('gsearch');
        this.search((el && el.rawValue) || this.searchText());
        this.searchText('');   // ready for the next scan
      };

      this.sigIcon = ui.icon('sig');
      this._initSignature();
      this._initConfirm();
      this.askReset = () => this.openConfirm({
        title: 'Reset demo data?', okLabel: 'Reset data', cancelLabel: 'Keep my data',
        body: '<p>This discards every change made in this browser and rebuilds the seeded plant history (about 12 days of production on three jobs), anchored to the current time.</p>',
      }, () => { MES.reset(); this.userId(DB.currentUser); this.toast('Demo data rebuilt.'); this.refresh(); });
    }

    /* ---------------------------------------------------------------- role-based views */
    allowed() { this.rev(); const p = MES.person(this.userId()) || DB.people[0]; const a = ROLE_NAV[p.role]; return a === undefined ? null : a; }
    canSee(name) { const a = this.allowed(); return !a || a.includes(name); }
    landing() { const p = MES.currentUser(); return p.role === 'Supervisor' ? 'dashboard' : 'mywork'; }
    /** Number of things waiting on the signed-in user (drives the My Work badge). */
    myWorkCount() { try { return require('services/work').items(MES.currentUser()).filter(i => i.urgent).length; } catch (e) { return 0; } }

    /** Post the moves that satisfy one replenishment request (shared by Dispatch and My Work). */
    fulfill(partId, ls) {
      const r0 = MES.replenishment().find(r => r.partId === partId && r.ls === ls);
      if (!r0) return this.toast('Request already satisfied.', 'warn');
      const p = MES.currentUser();
      if (!['Material Handler', 'Supervisor', 'Quality Engineer'].includes(p.role)) return this.toast(p.name + ' (' + p.role + ') cannot post material moves. Switch to Rosa Jimenez or Tom Becker.', 'bad');
      let short = r0.short, n = 0;
      for (const src of r0.sources) {
        if (short <= 1e-9) break;
        const q = src.serial ? 1 : Number(Math.min(src.qty, Math.max(short, short * 1.5)).toFixed(2));
        const r = MES.transfer(src.id, q, r0.ls, DB.currentUser, 'Replenishment request');
        if (!r.ok) return this.commit(r);
        short -= q; n++;
      }
      this.commit({ ok: true }, 'Posted ' + n + ' move(s) of ' + r0.partId + ' to ' + r0.ls);
    }

    /* ---------------------------------------------------------------- routing */
    parse() {
      let h = '';
      try { h = decodeURIComponent((location.hash || '').replace(/^#\/?/, '')); } catch (e) { h = ''; }
      const parts = (h || this.landing()).split('/');
      return { name: parts[0] || this.landing(), args: parts.slice(1) };
    }
    start() {
      window.addEventListener('hashchange', () => this._load(this.parse()));
      const act = (ev) => {
        const t = ev.target.closest && ev.target.closest('[data-act]');
        if (!t) return;
        if (ev.type === 'click' && t.tagName && t.tagName.toLowerCase().startsWith('oj-')) return; // JET buttons fire ojAction
        const fn = this.vm && this.vm.actions && this.vm.actions[t.getAttribute('data-act')];
        if (fn) { ev.preventDefault(); fn(t, ev); }
      };
      document.addEventListener('ojAction', act);
      document.addEventListener('click', act);
      // Enter inside an element marked data-enter="<action>" triggers that view action
      document.addEventListener('keyup', (ev) => {
        if (ev.key !== 'Enter') return;
        const t = ev.target.closest && ev.target.closest('[data-enter]');
        const fn = t && this.vm && this.vm.actions && this.vm.actions[t.getAttribute('data-enter')];
        if (fn) setTimeout(() => fn(t, ev), 0);
      });
      this._load(this.parse());
    }
    go(path) {
      const target = '#/' + path;
      if (location.hash === target) { this._load(this.parse()); return; }
      try { location.hash = target; } catch (e) { this._load({ name: path.split('/')[0], args: path.split('/').slice(1) }); }
    }
    _load(r) {
      if (r.name === 'genealogy' && r.args[0] && MES.unit(r.args[0])) r = { name: 'tree', args: r.args };
      if (!VIEWS.includes(r.name)) r = { name: this.landing(), args: [] };
      if (!DETAIL.includes(r.name) && !r.args.length && !this.canSee(r.name)) {
        r = { name: this.landing(), args: [] };
        try { history.replaceState(null, '', '#/' + r.name); } catch (e) { /* sandboxed */ }
      }
      if (r.name === 'station' && r.args.length && !this.canSee('station') && !this.canSee('dispatch')) r = { name: this.landing(), args: [] };
      const sameRoute = this.route().name === r.name && this.route().args.join('/') === r.args.join('/');
      this.route(r);
      this.moduleConfig(ModuleElementUtils.createConfig({ name: r.name, params: { app: this, args: r.args } }));
      if (!sameRoute) window.scrollTo(0, 0);
      document.title = (r.args[0] ? r.args[0] + ' · ' : '') + 'Ridgeline MES';
    }
    /** Persist, bump the revision and rebuild the current view so it re-reads the engine state. */
    refresh() { MES.save(); this.rev(this.rev() + 1); this._load(this.route()); }
    setVM(vm) { this.vm = vm; }
    st(key, defaults) { if (!this.state[key]) this.state[key] = Object.assign({}, defaults); return this.state[key]; }

    /* ---------------------------------------------------------------- feedback */
    toast(summary, severity, detail) {
      const sevMap = { ok: 'confirmation', bad: 'error', warn: 'warning', info: 'info' };
      const s = sevMap[severity] || severity || 'confirmation';
      this.messages.push({ id: 'm' + Date.now() + Math.random(), severity: s, summary, detail: detail || '', autoTimeout: s === 'error' ? 7000 : s === 'confirmation' ? 2500 : 4000 });
      while (this.messages().length > 2) this.messages.shift();
    }
    /** Apply an engine result: toast on failure; on success persist, toast and refresh. */
    commit(res, okMsg, severity) {
      if (!res || !res.ok) { this.toast((res && res.msg) || 'Action failed.', 'bad'); return false; }
      if (okMsg) this.toast(okMsg, severity || 'ok');
      this.refresh();
      return true;
    }
    search(q) {
      q = String(q || '').trim().toUpperCase();
      if (!q) return;
      const su = MES.unit(q);
      if (su) {
        // a scanned unit opens at your station when you can work on it; otherwise its record
        const op = MES.currentOp(su);
        if (op && su.status !== 'Complete' && MES.currentUser().quals.includes(op.station)) return this.go('station/' + op.station + '/' + su.serial);
        return this.go('unit/' + q);
      }
      if (MES.dr(q)) return this.go('dr/' + q);
      if (MES.job(q)) return this.go('job/' + q);
      if (MES.plan(q)) return this.go('plan/' + q);
      if (DB.tests.find(t => t.id === q)) return this.go('test/' + q);
      const inv = DB.inv.find(i => (i.serial || '').toUpperCase() === q || (i.lot || '').toUpperCase() === q);
      if (inv || MES.whereUsed(q).length) return this.go('genealogy/' + (inv ? (inv.serial || inv.lot) : q));
      const part = DB.parts.find(p => p.id.toUpperCase() === q);
      if (part) return this.go(DB.routings[part.id] ? 'item/' + part.id : 'inventory');
      const partial = DB.units.find(u => u.serial.includes(q));
      if (partial) return this.go('unit/' + partial.serial);
      this.toast('No VIN, serial, lot, discrepancy or job matches "' + q + '".', 'warn');
    }

    /* ---------------------------------------------------------------- e-signature service */
    _initSignature() {
      const s = this.sig = {
        title: ko.observable(''), summary: ko.observable(''), role: ko.observable(''), meaning: ko.observable(''),
        confirm: ko.observable('Sign'), danger: ko.observable(false), noteLabel: ko.observable(''), note: ko.observable(''),
        signersDP: ko.observable(ui.optionsDP([])), signer: ko.observable(null), pin: ko.observable(''), error: ko.observable(''), cb: null,
      };
      s.submit = () => {
        s.error('');
        const pinEl = document.getElementById('sigPin');
        const pin = (pinEl && pinEl.rawValue) || s.pin();
        const r = s.cb ? s.cb(s.signer(), pin, s.note()) : { ok: true };
        if (r && r.ok === false) { s.error(r.msg); s.pin(''); return; }
        document.getElementById('sigDialog').close();
      };
      s.cancel = () => document.getElementById('sigDialog').close();
      s.onClose = () => { s.pin(''); s.error(''); };
      s.pinKey = (event) => { if (event.key === 'Enter') { s.pin(event.target.rawValue || ''); s.submit(); } };
    }
    /**
     * Open the signature dialog. cb(signerId, pin, note) must return an engine result;
     * on {ok:false} the error is shown and the dialog stays open.
     */
    openSign(o, cb) {
      const s = this.sig, signers = MES.eligibleSigners(o.role), cu = MES.currentUser();
      s.title(o.title); s.summary(o.summary || ''); s.role(o.role); s.meaning(o.meaning); s.confirm(o.confirm || 'Sign');
      s.danger(!!o.danger); s.noteLabel(o.noteLabel || ''); s.note('');
      s.signersDP(ui.optionsDP(signers.map(p => ({ value: p.id, label: p.name + ' (' + p.role + ', badge ' + p.badge + ')' }))));
      s.signer(signers.find(p => p.id === cu.id) ? cu.id : (signers[0] && signers[0].id));
      s.pin(''); s.error(''); s.cb = cb;
      document.getElementById('sigDialog').open();
      setTimeout(() => { const p = document.getElementById('sigPin'); if (p && p.focus) p.focus(); }, 150);
    }

    /* ---------------------------------------------------------------- confirm service */
    _initConfirm() {
      const c = this.confirm = { title: ko.observable(''), body: ko.observable(''), okLabel: ko.observable('OK'), cancelLabel: ko.observable('Cancel'), fn: null };
      c.ok = () => { document.getElementById('confirmDialog').close(); if (c.fn) c.fn(); };
      c.cancel = () => document.getElementById('confirmDialog').close();
    }
    openConfirm(o, fn) {
      const c = this.confirm;
      c.title(o.title); c.body(o.body || ''); c.okLabel(o.okLabel || 'OK'); c.cancelLabel(o.cancelLabel || 'Cancel'); c.fn = fn;
      document.getElementById('confirmDialog').open();
    }
  }

  return new AppController();
});
