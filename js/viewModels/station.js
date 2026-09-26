/* Station terminal: dispatch queue + quality-plan-driven work panel for the selected unit. */
define(['knockout', 'services/ui'], function (ko, ui) {
  'use strict';
  const E = ui.E;

  return function StationVM(params) {
    const app = params.app; app.setVM(this);
    const [stId, serialArg] = params.args;
    const cu = MES.currentUser();
    this.picker = !stId;

    /* ---------------- station picker ---------------- */
    if (this.picker) {
      this.userLine = 'Choose a station. You are signed in as ' + cu.name + ' (' + cu.role + ').';
      this.groups = ['B10', 'B20', 'B30'].map(b => {
        const zones = [...new Set(DB.stations.filter(s => s.building === b).map(s => s.wc))];
        return {
          name: MES.building(b).name,
          zones: zones.map(z => ({
            zone: z,
            tiles: DB.stations.filter(s => s.building === b && s.wc === z).map(s => {
              const op = ui.opForStation(s.id), at = ui.stationUnits(s.id);
              const active = at.find(u => u.ops[op.seq].status === 'Active' && !MES.unitHeld(u.serial));
              return {
                href: '#/station/' + s.id, cls: 'mes-stn ' + (at.some(u => MES.unitHeld(u.serial)) ? 'held' : active ? 'active' : ''),
                op: s.id + ' · OP' + op.seq, name: s.name, unit: active ? '▶ ' + active.serial : at.length ? at.length + ' waiting' : 'idle',
                q: cu.quals.includes(s.id) ? '✓ You are qualified' : '',
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
      meta: MES.building(st.building).name + ' · ' + st.wc + ' · OP' + op.seq + ' of ' + routing.length + ' operations · ' + itemId + ' · std ' + op.stdMin + ' min',
      light: 'light ' + (units.some(x => MES.unitHeld(x.serial)) ? 'hold' : running ? 'run' : 'idle'),
      qual: qualified ? '✓ ' + cu.name + ' qualified' : '✕ ' + cu.name + ' not qualified here',
    };
    const prevOp = routing[routing.indexOf(op) - 1];
    this.queue = units.map(x => {
      const s = x.ops[op.seq].status, h = MES.unitHeld(x.serial);
      const since = s === 'Active' ? U.dur(MES.now() - x.ops[op.seq].start) : 'since ' + U.ago(prevOp && x.ops[prevOp.seq] && x.ops[prevOp.seq].end || x.launchedAt);
      return { href: '#/station/' + stId + '/' + x.serial, cls: u && x.serial === u.serial ? 'on' : '', serial: x.serial, chip: h ? ui.badge('On Hold') : s === 'Active' ? ui.badge('Active', 'In process') : ui.badge('Queued'), since };
    });
    this.recent = DB.units.filter(x => x.itemId === itemId && x.ops[op.seq] && x.ops[op.seq].status === 'Done')
      .sort((a, b) => b.ops[op.seq].end - a.ops[op.seq].end).slice(0, 4)
      .map(x => ({ href: '#/unit/' + x.serial, serial: x.serial, text: 'Completed ' + U.ago(x.ops[op.seq].end) + ' by ' + MES.userName(x.ops[op.seq].completedBy) }));
    this.queueCount = units.length + ' units';
    this.hasUnit = !!u;
    this.emptyText = 'Nothing to work on. Units appear here when they reach OP' + op.seq + '.';
    this.actions = {};
    if (!u) return;

    /* ---------------- work panel for unit u ---------------- */
    const plan = MES.plan(u.planId), chars = MES.planChars(plan, op.seq), o = u.ops[op.seq];
    const held = MES.unitHeld(u.serial), active = o.status === 'Active' && !held && qualified;
    const isLast = u.opIdx === routing.length - 1;
    const gate = isLast ? ui.openDrs(u.serial) : [];
    const states = chars.map(c => MES.charState(u, op.seq, c));
    const doneN = states.filter(s => s.state === 'done' || s.state === 'accepted').length;

    this.serial = u.serial;
    this.eyebrow = MES.part(u.itemId).name + ' · ' + u.jobId + ' · plan ' + u.planId;
    this.vinText = u.itemId === 'VEH-T1' ? 'VIN check digit ' + u.serial[8] + ' ' + (U.vinValid(u.serial) ? '✓ valid' : '✕ invalid') : '';
    this.showStart = o.status === 'Pending' && !held;
    this.startLabel = 'Start OP' + op.seq;
    this.travelerHref = '#/unit/' + u.serial;
    this.opPos = 'Operation ' + (routing.indexOf(op) + 1) + ' of ' + routing.length;
    this.opbar = routing.map(x => ({
      cls: 'o ' + u.ops[x.seq].status + (x.seq === op.seq && u.ops[x.seq].status !== 'Active' ? ' cur' : ''),
      label: routing.length > 12 ? String(x.seq) : x.seq + ' ' + x.name,
      title: 'OP' + x.seq + ' ' + x.name + ' — ' + u.ops[x.seq].status + (u.ops[x.seq].end ? ' ' + U.fmtDT(u.ops[x.seq].end) : ''),
    }));

    const holds = MES.activeHolds('Unit', u.serial);
    const qualNames = DB.people.filter(p => p.quals.includes(stId)).map(p => p.name);
    if (held) { this.bannerCls = 'mes-banner bad'; this.bannerHtml = ui.icon('lock') + '<div class="tx"><b>Quality hold — work is blocked.</b> ' + holds.map(h => E(h.id) + ': ' + E(h.reason) + (h.drId ? ' (' + ui.drLink(h.drId) + ')' : '')).join('; ') + '. A Quality Engineer must disposition the discrepancy before work continues.</div>'; }
    else if (gate.length && o.status === 'Pending') { this.bannerCls = 'mes-banner warn'; this.bannerHtml = ui.icon('alert') + '<div class="tx"><b>Final release gate.</b> Open discrepancies must be closed before the final operation starts: ' + gate.map(d => ui.drLink(d.id) + ' (' + E(d.status) + ')').join(', ') + '.</div>'; }
    else if (o.status === 'Pending') { this.bannerCls = 'mes-banner info'; this.bannerHtml = ui.icon('play') + '<div class="tx"><b>Queued.</b> Start the operation to record inspection data.' + (qualified ? '' : ' ' + E(cu.name) + ' is not qualified on ' + E(stId) + '; qualified: ' + E(qualNames.join(', ')) + '.') + '</div>'; }
    else if (!qualified) { this.bannerCls = 'mes-banner warn'; this.bannerHtml = ui.icon('lock') + '<div class="tx"><b>View only.</b> ' + E(cu.name) + ' (' + E(cu.role) + ') is not qualified on ' + E(stId) + '. Switch user to record data: ' + E(qualNames.join(', ')) + '.</div>'; }
    else { this.bannerCls = 'mes-banner ok'; this.bannerHtml = ui.icon('station') + '<div class="tx"><b>In process</b> since ' + U.fmtT(o.start) + ' (' + U.dur(MES.now() - o.start) + ') · operator ' + E(MES.userName(o.operator)) + ' · ' + doneN + ' of ' + chars.length + ' plan items complete</div>'; }
    this.progress = chars.length ? Math.round(doneN / chars.length * 100) : 0;
    this.showProgress = o.status === 'Active' && !held;
    this.instrTitle = 'Work instructions · OP' + op.seq + ' ' + op.name + (op.equipment ? ' · ' + op.equipment : '');
    this.instr = op.instr;

    /* rows */
    const ls = st.building + '-LS';
    const rowMap = {};
    const drNote = s => s.r && s.r.drId ? ' · ' + ui.drLink(s.r.drId) + ' ' + (MES.dr(s.r.drId) ? ui.badge(MES.dr(s.r.drId).status) : '') : '';
    const mkRow = c => {
      const s = MES.charState(u, op.seq, c);
      const row = { id: c.id, code: c.code, name: c.name, cls: 'mes-ci ' + s.state, stIcon: s.state === 'done' || s.state === 'accepted' ? ui.icon('check') : s.state === 'fail' ? ui.icon('x') : '',
        sevHtml: c.sev !== 'Minor' && c.type !== 'signoff' ? ui.sev(c.sev) : '', kind: 'none', resultHtml: '', metaHtml: '', input: ko.observable(''), raw: ko.observable(''), disabled: !active, placeholder: '' };
      if (c.type === 'serial') {
        const part = MES.part(c.partId);
        row.metaHtml = '<span class="mes-mono">' + E(part.id) + '</span><span>' + E(part.name) + '</span>' + (part.pattern !== 'VIN' ? '<span>mask <span class="mes-mono">' + E(part.pattern) + '</span></span>' : '');
        if (s.state === 'done') { row.resultHtml = '<span class="mes-res pass">' + E(s.r.value) + '</span> ' + ui.link('genealogy/' + s.r.value, 'Trace'); }
        else {
          row.kind = 'serial'; row.placeholder = 'Scan ' + part.id + ' serial';
          if (active) {
            const avail = DB.inv.filter(i => i.partId === c.partId && i.location === ls && i.status === 'Available' && !MES.invHeld(i)).slice(0, 3);
            row.metaHtml += '<span>line-side: ' + (avail.length ? avail.map(i => '<a href="#" class="oj-link mes-mono" data-act="fill-serial" data-v="' + E(i.serial) + '" data-id="' + E(c.id) + '" title="Simulate scanning this label">' + E(i.serial) + '</a>').join(', ') : '<span class="oj-text-color-danger">none — request a move</span>') + '</span>';
          }
          const last = DB.attempts.filter(a => a.serial === u.serial && a.charId === c.id).pop();
          if (last && !last.ok) row.metaHtml += '<div class="mes-validation"><span class="n"><b>Last scan rejected (' + E(last.scanned) + '):</b> ' + E(last.msg) + '</span>' + last.checks.map(k => '<span class="' + (k.ok ? 'y' : 'n') + '">' + (k.ok ? '✓' : '✕') + ' ' + E(k.label) + ' — ' + E(k.msg) + '</span>').join('') + '</div>';
        }
      } else if (c.type === 'check') {
        row.metaHtml = '<span>' + E(c.cat) + '</span>' + (s.r ? '<span>' + E(MES.userName(s.r.by)) + ' ' + U.fmtT(s.r.at) + '</span>' : '') + (s.r && s.r.note ? '<span>“' + E(s.r.note) + '”</span>' : '') + drNote(s);
        if (s.r) row.resultHtml = '<span class="mes-res ' + (s.r.result === 'PASS' ? 'pass' : 'fail') + '">' + E(s.r.result) + '</span>';
        if (s.state !== 'done' && s.state !== 'accepted') row.kind = 'check';
      } else if (c.type === 'measure' || c.type === 'calc') {
        const hist = MES.results(u.serial, op.seq, c.id);
        row.metaHtml = '<span>Spec <b class="mes-mono">' + E(MES.specText(c)) + '</b></span>' + (c.type === 'measure' ? '<span>nominal ' + U.num(c.nominal, c.dec) + '</span>' + (c.gauge ? '<span>' + E(c.gauge) + '</span>' : '') : '<span class="mes-formula">' + E(c.formula) + '</span>') +
          (s.r ? '<span>' + E(MES.userName(s.r.by)) + ' ' + U.fmtT(s.r.at) + '</span>' : '') + (hist.length > 1 ? '<span title="' + E(hist.map(r => U.fmtT(r.at) + '  ' + r.value + '  ' + r.result).join('\n')) + '">' + hist.length + ' readings</span>' : '') + drNote(s);
        if (s.r) row.resultHtml = '<span class="mes-res ' + (s.r.result === 'PASS' ? 'pass' : 'fail') + '">' + U.num(s.r.value, c.dec) + ' ' + E(c.unit) + '</span>' + ui.gauge(c, s.r.value);
        if (c.type === 'measure' && s.state !== 'done' && s.state !== 'accepted') {
          row.kind = 'measure'; row.placeholder = c.unit;
          row.msgs = ko.pureComputed(() => {
            const v = parseFloat(row.raw());
            if (row.raw() === '' || isNaN(v)) return [];
            return MES.inSpec(c, v) ? [{ severity: 'confirmation', summary: 'In spec', detail: 'Within ' + MES.specText(c) }]
              : [{ severity: 'warning', summary: 'Out of tolerance', detail: 'Spec ' + MES.specText(c) + '. Recording opens a discrepancy.' }];
          });
        }
        if (c.type === 'calc' && !s.r) row.resultHtml = '<span class="oj-typography-body-xs oj-text-color-secondary">Calculates when inputs are recorded</span>';
      } else if (c.type === 'signoff') {
        row.metaHtml = '<span>Role: ' + E(c.role) + '</span><span>Meaning: ' + E(c.meaning) + '</span>' + (c.meaning !== 'Performed' ? '<span>Independent of performer</span>' : '');
        if (s.state === 'done') row.resultHtml = ui.sigCard(s.sig);
        else { row.kind = 'sign'; row.signLabel = 'Sign as ' + c.role; row.disabled = !(o.status === 'Active' && !held); }
      }
      rowMap[c.id] = row;
      return row;
    };
    const section = (title, list) => list.length ? { title, count: list.filter(c => ['done', 'accepted'].includes(MES.charState(u, op.seq, c).state)).length + ' / ' + list.length, rows: list.map(mkRow) } : null;
    this.sections = [
      section('Serialized components · validate & install', chars.filter(c => c.type === 'serial')),
      section('In-process inspection', chars.filter(c => c.type === 'check' && c.phase !== 'end')),
      section('Measurements & calculations', chars.filter(c => c.type === 'measure' || c.type === 'calc')),
      section('Station-end checklist', chars.filter(c => c.type === 'check' && c.phase === 'end')),
      section('Sign-off', chars.filter(c => c.type === 'signoff')),
    ].filter(Boolean);

    const lots = (DB.boms[u.itemId] || []).filter(b => b.op === op.seq && MES.part(b.partId).tracking !== 'Serial');
    this.lotsTable = ui.table([
      { h: 'Part', v: b => '<span class="mes-mono">' + E(b.partId) + '</span> ' + E(MES.part(b.partId).name) },
      { h: 'Qty / unit', num: 1, v: b => b.qty + ' ' + E(MES.part(b.partId).uom) },
      { h: 'Line-side (' + ls + ')', v: b => { const l = MES.lotAvailable(b.partId, ls); const q = l.reduce((s2, i) => s2 + i.qty, 0); return (q >= b.qty ? ui.badge('Available', U.num(q, 1) + ' ' + MES.part(b.partId).uom) : ui.badge('Short', U.num(q, 1) + ' ' + MES.part(b.partId).uom)) + ' <span class="oj-typography-body-xs oj-text-color-secondary">' + E(l.map(i => i.lot).join(', ')) + '</span>'; } },
    ], lots);
    this.hasLots = lots.length > 0;

    const blockers = active ? MES.opBlockers(u, op.seq) : [];
    this.showComplete = active;
    this.completeReady = !blockers.length;
    this.completeText = blockers.length ? blockers.length + ' item(s) outstanding: ' + blockers.slice(0, 4).join(' · ') + (blockers.length > 4 ? ' …' : '')
      : 'All quality-plan items are satisfied. Completing backflushes lot material' + (op.test ? ', creates the ' + op.test + ' record' : '') + ' and moves the unit to the next operation.';
    this.completeLabel = isLast ? 'Complete & release ' + ui.itemShort[u.itemId] : 'Complete OP' + op.seq;

    /* dialogs */
    this.failNote = ko.observable(''); this.failTitle = ko.observable(''); this.failInfo = ko.observable('');
    this.dr = { sev: ko.observable('Minor'), cat: ko.observable('Workmanship'), seq: ko.observable(op.seq), charId: ko.observable(''), title: ko.observable(''), desc: ko.observable('') };
    this.sevDP = ui.optionsDP(['Minor', 'Major', 'Critical']);
    this.catDP = ui.optionsDP(['Workmanship', 'Cosmetic', 'Dimensional', 'Torque', 'Leak', 'Electrical', 'Wrong Part', 'Missing Part', 'Damage', 'Supplier', 'Documentation']);
    this.opDP = ui.optionsDP(routing.map(x => ({ value: x.seq, label: 'OP' + x.seq + ' ' + x.name })));
    this.charDP = ui.optionsDP([{ value: '', label: '— none —' }].concat(chars.filter(c => c.type !== 'signoff').map(c => ({ value: c.id, label: c.code + ' ' + c.name }))));
    let failCtx = null;

    const serial = u.serial, seq = op.seq;
    this.startOp = () => { const r = MES.startOp(serial, seq, DB.currentUser); app.commit(r, r.ok ? 'OP' + seq + ' started on ' + serial : ''); };
    this.completeOp = () => {
      const r = MES.completeOp(serial, seq, DB.currentUser);
      if (!r.ok) return app.commit(r);
      MES.save();
      app.toast(r.final ? serial + ' released — routing complete.' : 'OP' + seq + ' complete. ' + serial + ' moved to OP' + MES.currentOp(u).seq + '.');
      if (location.hash === '#/station/' + stId) app.refresh(); else app.go('station/' + stId);
    };
    this.openLogDr = () => { this.dr.title(''); this.dr.desc(''); this.dr.sev('Minor'); this.dr.charId(''); document.getElementById('logDrDialog').open(); };
    this.closeLogDr = () => document.getElementById('logDrDialog').close();
    this.submitLogDr = () => {
      if (!String(this.dr.title() || '').trim()) return app.toast('Enter a short title for the discrepancy.', 'bad');
      const r = MES.createDR({ by: DB.currentUser, serial, itemId: u.itemId, seq: Number(this.dr.seq()), charId: this.dr.charId() || null, source: 'Manual', severity: this.dr.sev(), category: this.dr.cat(), title: this.dr.title(), description: this.dr.desc() });
      document.getElementById('logDrDialog').close();
      app.commit(r, r.ok ? r.dr.id + ' opened' + (r.dr.holdId ? ' · unit on hold' : '') : '', 'warn');
    };
    this.closeFail = () => document.getElementById('failDialog').close();
    this.submitFail = () => {
      const r = MES.recordCheck(serial, seq, failCtx.id, 'FAIL', this.failNote(), DB.currentUser);
      if (!r.ok) return app.toast(r.msg, 'bad');
      document.getElementById('failDialog').close();
      app.commit(r, failCtx.code + ' failed — ' + r.result.drId + ' opened', 'bad');
    };

    this.actions = {
      'validate': el => {
        const row = rowMap[el.getAttribute('data-id')];
        const inp = document.getElementById('in-' + row.id);
        const v = (inp && (inp.rawValue || inp.value)) || row.input();
        const r = MES.validateSerial(serial, seq, row.id, v, DB.currentUser);
        if (!r.ok) { MES.save(); app.toast(r.msg, 'bad'); app.refresh(); return; }
        app.commit(r, r.msg);
      },
      'fill-serial': el => { const row = rowMap[el.getAttribute('data-id')]; row.input(el.getAttribute('data-v')); },
      'record': el => {
        const row = rowMap[el.getAttribute('data-id')];
        const inp = document.getElementById('in-' + row.id);
        const v = (inp && inp.rawValue) || row.input();
        const r = MES.recordMeasure(serial, seq, row.id, v, DB.currentUser);
        if (!r.ok) return app.commit(r);
        const fails = [r.result].concat(r.calcs || []).filter(x => x.result === 'FAIL');
        if (fails.length) {
          const d = MES.dr(fails[0].drId);
          app.commit(r, fails.map(f => f.code + ' ' + f.value + ' out of tolerance').join('; ') + (d ? ' — ' + d.id + ' opened' + (MES.unitHeld(serial) ? ', unit placed on hold' : '') : ''), 'bad');
        } else app.commit(r, r.result.code + ' = ' + r.result.value + ' ' + r.result.unit + ' in spec' + (r.calcs && r.calcs.length ? ' · ' + r.calcs.map(c => c.code + ' = ' + c.value).join(', ') : ''));
      },
      'pass': el => { const r = MES.recordCheck(serial, seq, el.getAttribute('data-id'), 'PASS', '', DB.currentUser); app.commit(r, r.ok ? r.result.code + ' passed' : ''); },
      'fail': el => {
        const c = chars.find(x => x.id === el.getAttribute('data-id'));
        failCtx = c; this.failNote(''); this.failTitle(c.code + ' ' + c.name);
        this.failInfo('A discrepancy (' + c.sev + ', ' + c.cat + ') opens automatically' + (c.sev !== 'Minor' ? ' and the unit is placed on quality hold.' : '.'));
        document.getElementById('failDialog').open();
      },
      'sign': el => {
        const c = chars.find(x => x.id === el.getAttribute('data-id'));
        const others = chars.filter(x => x.type !== 'signoff');
        const summary = ui.kv([['Record', '<span class="mes-mono">' + E(serial) + '</span>'], ['Operation', 'OP' + seq + ' ' + E(op.name) + ' @ ' + E(op.station)],
          ['Plan items', others.length + ' recorded (' + others.filter(x => MES.charState(u, seq, x).state === 'done').length + ' pass, ' + others.filter(x => MES.charState(u, seq, x).state === 'accepted').length + ' accepted by MRB)'], ['Sign-off', E(c.name)]]);
        app.openSign({ title: 'Sign OP' + seq, summary, role: c.role, meaning: c.meaning, confirm: 'Sign as ' + c.meaning },
          (signer, pin) => { const r = MES.signOp(serial, seq, c.id, signer, pin); if (r.ok) app.commit(r, 'Signed: ' + c.name + ' by ' + MES.userName(signer)); return r; });
      },
    };
  };
});
