/* Station terminal: dispatch queue + quality-plan-driven work panel for the selected unit. */
define(['knockout', 'services/ui', 'ojs/ojcollapsible'], function (ko, ui) {
  'use strict';
  const E = ui.E;

  return function StationVM(params) {
    const app = params.app; app.setVM(this);
    const [stId, serialArg] = params.args;
    const cu = MES.currentUser();
    this.picker = !stId;
    // Operators and technicians get a lean terminal: only what they need to act on
    const lean = ['Operator', 'Quality Technician'].includes(cu.role);
    this.lean = lean;

    /* ---------------- station picker ---------------- */
    if (this.picker) {
      this.userLine = lean ? 'Your qualified stations. Blue = running, red = unit on hold.' : 'Choose a station. You are signed in as ' + cu.name + ' (' + cu.role + ').';
      const visible = s0 => !lean || cu.quals.includes(s0.id);
      this.groups = ['B10', 'B20', 'B30'].filter(b => DB.stations.some(s0 => s0.building === b && visible(s0))).map(b => {
        const zones = [...new Set(DB.stations.filter(s => s.building === b && visible(s)).map(s => s.wc))];
        return {
          name: MES.building(b).name,
          zones: zones.map(z => ({
            zone: z,
            tiles: DB.stations.filter(s => s.building === b && s.wc === z && visible(s)).map(s => {
              const op = ui.opForStation(s.id), at = ui.stationUnits(s.id);
              const active = at.find(u => u.ops[op.seq].status === 'Active' && !MES.unitHeld(u.serial));
              return {
                href: '#/station/' + s.id, cls: 'mes-stn ' + (at.some(u => MES.unitHeld(u.serial)) ? 'held' : active ? 'active' : ''),
                op: s.id + ' · OP' + op.seq, name: s.name, unit: active ? '▶ ' + active.serial : at.length ? at.length + ' waiting' : 'idle',
                q: lean ? '' : (cu.quals.includes(s.id) ? '✓ You are qualified' : ''),
              };
            }),
          })),
        };
      });
      return;
    }

    /* ---------------- terminal ---------------- */
    const st = MES.station(stId);
    this.valid = !!st;
    if (!st) return;
    const op = ui.opForStation(stId), itemId = ui.itemForStation(stId);
    const units = ui.stationUnits(stId);
    const u = (serialArg && MES.unit(serialArg)) || units[0];
    const running = units.find(x => x.ops[op.seq].status === 'Active' && !MES.unitHeld(x.serial));
    const qualified = cu.quals.includes(stId);
    const routing = MES.routing(itemId);

    this.andon = {
      title: st.id + ' · ' + st.name,
      meta: lean ? 'OP' + op.seq + ' ' + op.name + ' · std ' + op.stdMin + ' min' : MES.building(st.building).name + ' · ' + st.wc + ' · OP' + op.seq + ' of ' + routing.length + ' operations · ' + itemId + ' · std ' + op.stdMin + ' min',
      light: 'light ' + (units.some(x => MES.unitHeld(x.serial)) ? 'hold' : running ? 'run' : 'idle'),
      stateCls: 'state ' + (units.some(x => MES.unitHeld(x.serial)) ? 'hold' : running ? 'run' : 'idle'),
      state: units.some(x => MES.unitHeld(x.serial)) ? 'HOLD' : running ? 'RUNNING' : 'IDLE',
      qual: qualified ? '✓ ' + cu.name + ' qualified' : '✕ ' + cu.name + ' not qualified here',
    };
    const prevOp = routing[routing.indexOf(op) - 1];
    this.queue = units.map(x => {
      const s = x.ops[op.seq].status, h = MES.unitHeld(x.serial);
      const since = s === 'Active' ? U.dur(MES.now() - x.ops[op.seq].start) : 'since ' + U.ago(prevOp && x.ops[prevOp.seq] && x.ops[prevOp.seq].end || x.launchedAt);
      return { href: '#/station/' + stId + '/' + x.serial, cls: u && x.serial === u.serial ? 'on' : '', serial: x.serial, chip: h ? ui.badge('On Hold') : s === 'Active' ? ui.badge('Active', 'In process') : ui.badge('Queued'), since };
    });
    this.showRecent = !lean;
    this.recent = DB.units.filter(x => x.itemId === itemId && x.ops[op.seq] && x.ops[op.seq].status === 'Done')
      .sort((a, b) => b.ops[op.seq].end - a.ops[op.seq].end).slice(0, 4)
      .map(x => ({ href: '#/unit/' + x.serial, serial: x.serial, text: 'Completed ' + U.ago(x.ops[op.seq].end) + ' by ' + MES.userName(x.ops[op.seq].completedBy) }));
    this.queueCount = units.length + ' units';
    this.hasUnit = !!u;
    this.emptyText = 'Nothing to work on. Units appear here when they reach OP' + op.seq + '.';
    this.actions = {};
    if (!u) return;

    /* ---------------- work panel: guided "next step" flow for unit u ---------------- */
    const plan = MES.plan(u.planId), chars = MES.planChars(plan, op.seq), o = u.ops[op.seq];
    const held = MES.unitHeld(u.serial), canWork = o.status === 'Active' && !held && qualified;
    const isLast = u.opIdx === routing.length - 1;
    const gate = isLast ? ui.openDrs(u.serial) : [];
    const serial = u.serial, seq = op.seq, ls = st.building + '-LS';

    this.serial = u.serial;
    this.eyebrow = lean ? MES.part(u.itemId).name : MES.part(u.itemId).name + ' · ' + u.jobId + ' · plan ' + u.planId;
    this.showTraveler = !lean;
    this.showOpbar = !lean;
    this.opPct = Math.round(u.opIdx / routing.length * 100);
    this.vinText = u.itemId === 'VEH-T1' ? 'VIN check digit ' + u.serial[8] + ' ' + (U.vinValid(u.serial) ? '✓ valid' : '✕ invalid') : '';
    this.travelerHref = '#/unit/' + u.serial;
    this.opPos = 'Operation ' + (routing.indexOf(op) + 1) + ' of ' + routing.length;
    this.opbar = routing.map(x => ({
      cls: 'o ' + u.ops[x.seq].status + (x.seq === op.seq && u.ops[x.seq].status !== 'Active' ? ' cur' : ''),
      label: routing.length > 12 ? String(x.seq) : x.seq + ' ' + x.name,
      title: 'OP' + x.seq + ' ' + x.name + ' — ' + u.ops[x.seq].status + (u.ops[x.seq].end ? ' ' + U.fmtDT(u.ops[x.seq].end) : ''),
    }));
    this.instr = op.instr;
    this.instrTitle = 'Work instructions' + (op.equipment ? ' · ' + op.equipment : '');

    /* ---- classify every plan item ---- */
    const ordered = [].concat(
      chars.filter(c => c.type === 'serial'), chars.filter(c => c.type === 'check' && c.phase !== 'end'),
      chars.filter(c => c.type === 'measure' || c.type === 'calc'), chars.filter(c => c.type === 'check' && c.phase === 'end'),
      chars.filter(c => c.type === 'signoff'));
    const performers = () => chars.filter(x => x.type === 'signoff' && x.meaning === 'Performed').map(x => MES.sigFor(serial, seq, x.id)).filter(Boolean).map(sg => sg.userId);
    const othersDone = () => chars.filter(x => x.type !== 'signoff' && x.required).every(x => ['done', 'accepted'].includes(MES.charState(u, seq, x).state));
    const statusOf = c => {
      const sc = MES.charState(u, seq, c);
      if (sc.state === 'done' || sc.state === 'accepted') return { k: 'done', sc };
      if (c.type === 'calc') return { k: 'auto', sc };
      if (c.type === 'signoff') {
        if (!othersDone()) return { k: 'locked', sc };
        if (MES.canSign(cu, c.role) && !(c.meaning !== 'Performed' && performers().includes(cu.id))) return { k: o.status === 'Active' && !held ? 'todo' : 'blocked', sc };
        return { k: 'waiting', sc, who: MES.eligibleSigners(c.role).filter(pp => !performers().includes(pp.id)).map(pp => pp.name) };
      }
      if (sc.state === 'fail') { const d = sc.dr; return d && d.status === 'Rework' ? { k: canWork ? 'redo' : 'blocked', sc } : { k: 'waiting', sc, dr: d }; }
      return { k: canWork ? 'todo' : 'blocked', sc };
    };
    const info = ordered.map(c => ({ c, s: statusOf(c) }));
    const actionable = info.filter(x => x.s.k === 'todo' || x.s.k === 'redo');
    const focusSt = app.st('station:focus', {});
    const fkey = serial + '|' + seq;
    let cur = actionable.find(x => x.c.id === focusSt[fkey]) || actionable[0] || null;
    const doneN = info.filter(x => x.s.k === 'done').length;
    this.doneText = doneN + ' of ' + info.length + ' done';
    this.progress = info.length ? Math.round(doneN / info.length * 100) : 0;

    /* ---- the step list (compact, click to jump) ---- */
    const ICON = { done: 'check', todo: '', redo: 'flag', waiting: 'lock', locked: 'lock', auto: 'calc', blocked: '' };
    const valueOf = (c, sc) => {
      if (!sc.r && !sc.sig) return '';
      if (c.type === 'signoff') return E(sc.sig.name);
      if (c.type === 'measure' || c.type === 'calc') return '<span class="mes-mono">' + U.num(sc.r.value, c.dec) + ' ' + E(c.unit) + '</span>';
      return '<span class="mes-mono">' + E(sc.r.value) + '</span>';
    };
    const stateLabel = x => ({ done: x.s.sc.state === 'accepted' ? 'Accepted by MRB' : '', todo: '', redo: 'Re-inspect', waiting: x.c.type === 'signoff' ? 'Waiting for ' + x.c.role : 'Waiting on Quality' + (x.s.dr ? ' (' + x.s.dr.id + ')' : ''), locked: 'After all items', auto: 'Auto-calculated', blocked: '' })[x.s.k];
    this.steps = info.map((x, i) => ({
      id: x.c.id, n: i + 1, code: x.c.code, name: x.c.name, type: ui.typeBadge(x.c.type),
      cls: 'mes-step s-' + x.s.k + (cur && cur.c.id === x.c.id ? ' current' : '') + (x.s.k === 'todo' || x.s.k === 'redo' ? ' clickable' : ''),
      icon: ICON[x.s.k] ? ui.icon(ICON[x.s.k]) : String(i + 1), value: valueOf(x.c, x.s.sc), label: stateLabel(x),
      act: x.s.k === 'todo' || x.s.k === 'redo' ? 'focus' : '',
    }));

    /* ---- the step card: exactly one thing to do ---- */
    const holds = MES.activeHolds('Unit', serial);
    const qualNames = DB.people.filter(pp => pp.quals.includes(stId)).map(pp => pp.name);
    const blockers = MES.opBlockers(u, seq);
    const card = this.card = { kind: 'none', title: '', sub: '', html: '', code: '', sev: '', hint: '', placeholder: '', unit: '', btn: '' };
    if (held) Object.assign(card, { kind: 'held', title: 'On quality hold — set this unit aside', html: holds.map(h => E(h.reason) + (h.drId ? ' · ' + ui.drLink(h.drId) : '')).join('<br>') + '<div class="mes-card-note">Quality decides what happens next. When they approve rework it shows up in your My Work.</div>' });
    else if (o.status === 'Pending' && gate.length) Object.assign(card, { kind: 'held', title: 'Waiting on open discrepancies', html: 'The final operation can start once these are closed: ' + gate.map(d => ui.drLink(d.id) + ' (' + E(d.status) + ')').join(', ') });
    else if (o.status === 'Pending') Object.assign(card, qualified
      ? { kind: 'start', title: 'Start OP' + seq + ' · ' + op.name, sub: 'Standard time ' + op.stdMin + ' min · ' + chars.length + ' plan items', btn: 'Start operation' }
      : { kind: 'info', title: 'Queued for OP' + seq, html: E(cu.name) + ' is not qualified on ' + E(stId) + '. Qualified: ' + E(qualNames.join(', ')) + '.' });
    else if (cur) {
      const c = cur.c, redo = cur.s.k === 'redo';
      Object.assign(card, { code: c.code, sev: c.sev !== 'Minor' && c.type !== 'signoff' ? ui.sev(c.sev) : '', redo, stepNo: 'Step ' + (info.indexOf(cur) + 1) + ' of ' + info.length + (redo ? ' · re-inspection after rework' : '') });
      if (c.type === 'serial') {
        const part = MES.part(c.partId);
        const avail = DB.inv.filter(i => i.partId === c.partId && i.location === ls && i.status === 'Available' && !MES.invHeld(i)).slice(0, 4);
        const last = DB.attempts.filter(a => a.serial === serial && a.charId === c.id).pop();
        Object.assign(card, { kind: 'serial', title: 'Scan the ' + c.slot, sub: part.id + ' · ' + part.name, placeholder: 'Scan or type the ' + c.slot + ' serial', btn: 'Validate & install',
          chips: avail.map(i => i.serial), noStock: !avail.length,
          html: last && !last.ok ? '<div class="mes-validation"><span class="n"><b>Last scan rejected (' + E(last.scanned) + '):</b> ' + E(last.msg) + '</span></div>' : '' });
      } else if (c.type === 'check') {
        Object.assign(card, { kind: 'check', title: c.name, sub: c.phase === 'end' ? 'Station-end checklist' : 'Inspection', btn: 'Pass' });
      } else if (c.type === 'measure') {
        Object.assign(card, { kind: 'measure', title: c.name, sub: (c.gauge ? c.gauge + ' · ' : '') + 'Target ' + U.num(c.nominal, c.dec) + ' ' + c.unit, spec: MES.specText(c), unit: c.unit, placeholder: 'Reading in ' + c.unit, btn: 'Record' });
      } else if (c.type === 'signoff') {
        const other = chars.filter(x => x.type !== 'signoff');
        const willComplete = chars.filter(x => x.type === 'signoff' && x.id !== c.id && !MES.sigFor(serial, seq, x.id)).length === 0;
        Object.assign(card, { kind: 'sign', title: c.name, sub: other.length + ' plan items recorded · sign as ' + c.role + ' (' + c.meaning + ')', btn: willComplete ? (isLast ? 'Sign & release ' + ui.itemShort[u.itemId] : 'Sign & complete OP' + seq) : 'Sign' });
      }
      focusSt[fkey] = c.id;
    } else if (!qualified && o.status === 'Active') Object.assign(card, { kind: 'info', title: 'View only', html: E(cu.name) + ' (' + E(cu.role) + ') is not qualified on ' + E(stId) + '. Qualified: ' + E(qualNames.join(', ')) + '.' });
    else if (!blockers.length && o.status === 'Active') Object.assign(card, { kind: 'complete', title: 'All steps done', sub: 'Completing backflushes lot material' + (op.test ? ', creates the ' + op.test + ' record' : '') + ' and moves the unit on.', btn: isLast ? 'Complete & release ' + ui.itemShort[u.itemId] : 'Complete OP' + seq });
    else {
      const w = info.filter(x => x.s.k === 'waiting');
      const sig = w.find(x => x.c.type === 'signoff'), dq = w.find(x => x.c.type !== 'signoff');
      Object.assign(card, { kind: 'info', title: 'Nothing more for you on this unit', html: (sig ? 'Waiting for ' + E(sig.c.role) + ' sign-off (' + E(sig.c.name) + ') — it is in the My Work of ' + E((sig.s.who || []).join(', ')) + '.' : '') + (dq ? (sig ? '<br>' : '') + 'Waiting on Quality for ' + E(dq.c.code + ' ' + dq.c.name) + (dq.s.dr ? ' (' + ui.drLink(dq.s.dr.id) + ')' : '') + '.' : '') });
    }
    ['held', 'start', 'serial', 'check', 'measure', 'sign', 'complete', 'info'].forEach(k => { card['is_' + k] = card.kind === k; });
    card.chips = card.chips || [];
    card.hasHtml = !!card.html;

    // input + live tolerance feedback for the step card
    this.stepInput = ko.observable('');
    this.stepRaw = ko.observable('');
    const curChar = cur && cur.c;
    this.stepMsgs = ko.pureComputed(() => {
      if (!curChar || curChar.type !== 'measure') return [];
      const v = parseFloat(this.stepRaw());
      if (this.stepRaw() === '' || isNaN(v)) return [];
      return MES.inSpec(curChar, v) ? [{ severity: 'confirmation', summary: 'In spec', detail: 'Within ' + MES.specText(curChar) }]
        : [{ severity: 'warning', summary: 'Out of tolerance', detail: 'Recording opens a discrepancy' + (curChar.sev !== 'Minor' ? ' and puts the unit on hold.' : '.') }];
    });
    this.stepGauge = ko.pureComputed(() => { if (!curChar || curChar.type !== 'measure') return ''; const v = parseFloat(this.stepRaw()); return isNaN(v) ? ui.gauge(curChar, curChar.nominal).replace('mes-gauge-pt', 'mes-gauge-pt ghost') : ui.gauge(curChar, v); });

    // last result, shown inline instead of a pile of toasts
    const lastSt = app.st('station:last', {});
    const last = lastSt[fkey];
    this.lastMsg = last ? last.msg : ''; this.lastCls = last ? 'mes-last ' + last.tone : 'mes-last';
    delete lastSt[fkey];
    const say = (msg, tone) => { lastSt[fkey] = { msg, tone: tone || 'ok' }; };

    // material
    const lots = (DB.boms[u.itemId] || []).filter(b => b.op === seq && MES.part(b.partId).tracking !== 'Serial');
    const lotShort = lots.filter(b => MES.lotAvailable(b.partId, ls).reduce((q, i) => q + i.qty, 0) + 1e-9 < b.qty);
    this.materialHtml = !lots.length ? '' : lotShort.length
      ? '<span class="oj-text-color-danger"><b>Short at line-side:</b> ' + lotShort.map(b => E(b.partId + ' ' + MES.part(b.partId).name)).join(', ') + ' — ask a material handler.</span>'
      : 'Lot material OK at line-side: ' + lots.map(b => E(b.partId) + ' ×' + b.qty).join(', ') + '. Backflushed on completion.';

    setTimeout(() => { const el = document.getElementById('stepInput'); if (el && el.focus) el.focus(); }, 350);

    /* ---- dialogs ---- */
    this.failNote = ko.observable(''); this.failTitle = ko.observable(''); this.failInfo = ko.observable('');
    this.dr = { sev: ko.observable('Minor'), cat: ko.observable('Workmanship'), seq: ko.observable(op.seq), charId: ko.observable('none'), title: ko.observable(''), desc: ko.observable('') };
    this.sevDP = ui.optionsDP(['Minor', 'Major', 'Critical']);
    this.catDP = ui.optionsDP(['Workmanship', 'Cosmetic', 'Dimensional', 'Torque', 'Leak', 'Electrical', 'Wrong Part', 'Missing Part', 'Damage', 'Supplier', 'Documentation']);
    this.opDP = ui.optionsDP(routing.map(x => ({ value: x.seq, label: 'OP' + x.seq + ' ' + x.name })));
    this.charDP = ui.optionsDP([{ value: 'none', label: '— none —' }].concat(chars.filter(c => c.type !== 'signoff').map(c => ({ value: c.id, label: c.code + ' ' + c.name }))));

    /* ---- actions ---- */
    const afterComplete = (r, who) => {
      MES.save();
      const nx = MES.currentOp(u);
      app.toast(r.final ? serial + ' released — routing complete.' : 'OP' + seq + ' complete · ' + serial + ' moved to OP' + nx.seq + ' (' + nx.station + ')');
      if (location.hash === '#/station/' + stId) app.refresh(); else app.go('station/' + stId);
    };
    const holdNote = () => MES.unitHeld(serial) ? ' The unit is on quality hold until Quality decides.' : ' You can carry on with the other steps.';
    this.startOp = () => { const r = MES.startOp(serial, seq, DB.currentUser); if (!r.ok) return app.commit(r); say('Started OP' + seq + '. Work through the steps below.'); app.refresh(); };
    this.completeOp = () => { const r = MES.completeOp(serial, seq, DB.currentUser); if (!r.ok) return app.commit(r); afterComplete(r); };
    this.submitStep = () => {
      if (!curChar) return;
      const el = document.getElementById('stepInput');
      const v = String((el && el.rawValue) || this.stepInput() || '').trim();
      if (!v) return app.toast(curChar.type === 'serial' ? 'Scan or type the serial first.' : 'Enter the reading first.', 'warn');
      if (curChar.type === 'serial') {
        const r = MES.validateSerial(serial, seq, curChar.id, v, DB.currentUser);
        MES.save();
        say(r.ok ? '✓ ' + curChar.slot + ' ' + v.toUpperCase() + ' validated and installed.' : '✕ ' + r.msg, r.ok ? 'ok' : 'bad');
        return app.refresh();
      }
      const r = MES.recordMeasure(serial, seq, curChar.id, v, DB.currentUser);
      if (!r.ok) return app.commit(r);
      const fails = [r.result].concat(r.calcs || []).filter(x => x.result === 'FAIL');
      const calcTxt = (r.calcs || []).length ? ' · ' + r.calcs.map(c => c.code + ' = ' + c.value + ' ' + c.unit).join(', ') : '';
      if (fails.length) { const d = MES.dr(fails[0].drId); say('✕ ' + fails.map(f => f.code + ' ' + f.value + ' ' + f.unit + ' is out of tolerance').join('; ') + (d ? ' — ' + d.id + ' opened.' : '.') + holdNote(), 'bad'); }
      else say('✓ ' + r.result.code + ' ' + r.result.value + ' ' + r.result.unit + ' recorded — in spec' + calcTxt, 'ok');
      app.refresh();
    };
    this.passStep = () => { const r = MES.recordCheck(serial, seq, curChar.id, 'PASS', '', DB.currentUser); if (!r.ok) return app.commit(r); say('✓ ' + curChar.code + ' passed'); app.refresh(); };
    this.failStep = () => {
      this.failNote(''); this.failTitle(curChar.code + ' ' + curChar.name);
      this.failInfo('A discrepancy (' + curChar.sev + ', ' + curChar.cat + ') opens automatically' + (curChar.sev !== 'Minor' ? ' and the unit goes on quality hold.' : '. You can continue with the other steps.'));
      document.getElementById('failDialog').open();
    };
    this.closeFail = () => document.getElementById('failDialog').close();
    this.submitFail = () => {
      const r = MES.recordCheck(serial, seq, curChar.id, 'FAIL', this.failNote(), DB.currentUser);
      if (!r.ok) return app.toast(r.msg, 'bad');
      document.getElementById('failDialog').close();
      say('✕ ' + curChar.code + ' failed — ' + r.result.drId + ' opened.' + holdNote(), 'bad');
      app.refresh();
    };
    this.signStep = () => {
      const c = curChar;
      const others = chars.filter(x => x.type !== 'signoff');
      const summary = ui.kv([['Record', '<span class="mes-mono">' + E(serial) + '</span>'], ['Operation', 'OP' + seq + ' ' + E(op.name) + ' @ ' + E(op.station)],
        ['Plan items', others.length + ' recorded (' + others.filter(x => MES.charState(u, seq, x).state === 'done').length + ' pass, ' + others.filter(x => MES.charState(u, seq, x).state === 'accepted').length + ' accepted by MRB)'], ['Sign-off', E(c.name)]]);
      app.openSign({ title: card.btn, summary, role: c.role, meaning: c.meaning, confirm: card.btn },
        (signer, pin) => {
          const r = MES.signOp(serial, seq, c.id, signer, pin);
          if (!r.ok) return r;
          // last signature closes the operation: no separate "Complete" click
          if (!MES.opBlockers(u, seq).length) {
            const cr = MES.completeOp(serial, seq, signer);
            if (cr.ok) { setTimeout(() => afterComplete(cr), 0); return r; }
            say('Signed. ' + cr.msg, 'bad');
          } else say('✓ Signed by ' + MES.userName(signer) + '.');
          setTimeout(() => app.refresh(), 0);
          return r;
        });
    };
    this.openLogDr = () => { this.dr.title(''); this.dr.desc(''); this.dr.sev('Minor'); this.dr.charId(curChar && curChar.type !== 'signoff' ? curChar.id : 'none'); document.getElementById('logDrDialog').open(); };
    this.closeLogDr = () => document.getElementById('logDrDialog').close();
    this.submitLogDr = () => {
      if (!String(this.dr.title() || '').trim()) return app.toast('Enter a short title for the discrepancy.', 'bad');
      const r = MES.createDR({ by: DB.currentUser, serial, itemId: u.itemId, seq: Number(this.dr.seq()), charId: this.dr.charId() && this.dr.charId() !== 'none' ? this.dr.charId() : null, source: 'Manual', severity: this.dr.sev(), category: this.dr.cat(), title: this.dr.title(), description: this.dr.desc() });
      document.getElementById('logDrDialog').close();
      if (r.ok) say('⚑ ' + r.dr.id + ' opened.' + (r.dr.holdId ? ' The unit is on quality hold.' : ''), 'warn');
      app.commit(r);
    };
    this.actions = {
      focus: el => { focusSt[fkey] = el.getAttribute('data-id'); app.refresh(); },
      'fill-serial': el => { this.stepInput(el.getAttribute('data-v')); const i = document.getElementById('stepInput'); if (i) i.focus(); },
      submit: () => this.submitStep(),
    };
  };
});
