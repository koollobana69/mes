/* Ridgeline MES — domain engine. Every state change goes through here so the UI and the
   seed simulation share the same business rules (quality gates, holds, traceability, e-signatures). */
'use strict';

let DB = null;
const STORE_KEY = 'ridgeline-mes-v1';

const MES = {
  /* ------------------------------------------------------------------ storage */
  now() { return DB && DB.simNow ? DB.simNow : Date.now(); },
  save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); } catch (e) { /* storage unavailable: run in memory */ } },
  load() {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) { DB = JSON.parse(raw); return true; } } catch (e) { /* ignore */ }
    return false;
  },
  reset() { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ } DB = SEED.build(); MES.save(); },
  next(kind, prefix, width) {
    DB.seq[kind] = (DB.seq[kind] || 0) + 1;
    return prefix + U.pad(DB.seq[kind], width || 4);
  },
  ok(data) { return Object.assign({ ok: true }, data || {}); },
  fail(msg) { return { ok: false, msg }; },

  /* ------------------------------------------------------------------ lookups */
  part: id => DB.parts.find(p => p.id === id),
  person: id => DB.people.find(p => p.id === id),
  station: id => DB.stations.find(s => s.id === id),
  loc: id => DB.locations.find(l => l.id === id),
  building: id => DB.buildings.find(b => b.id === id),
  routing: itemId => DB.routings[itemId] || [],
  op(itemId, seq) { return MES.routing(itemId).find(o => o.seq === Number(seq)); },
  unit: serial => DB.units.find(u => u.serial === serial),
  job: id => DB.jobs.find(j => j.id === id),
  plan: id => DB.plans.find(p => p.id === id),
  dr: id => DB.drs.find(d => d.id === id),
  activePlan: itemId => DB.plans.find(p => p.itemId === itemId && p.status === 'Released'),
  plansFor: itemId => DB.plans.filter(p => p.itemId === itemId).sort((a, b) => a.rev < b.rev ? 1 : -1),
  planChars(plan, seq) { return (plan && plan.steps[seq]) || []; },
  findChar(plan, charId) {
    for (const seq in plan.steps) { const c = plan.steps[seq].find(x => x.id === charId); if (c) return c; }
    return null;
  },
  userName(id) { const p = MES.person(id); return p ? p.name : (id || '—'); },
  currentUser() { return MES.person(DB.currentUser) || DB.people[0]; },

  log(action, ref, detail, by) {
    DB.audit.push({ id: MES.next('audit', 'A', 6), at: MES.now(), by: by || DB.currentUser, action, ref, detail });
  },

  /* ------------------------------------------------------------------ e-signatures */
  ROLE_CAN: {
    'Operator': ['Operator', 'Supervisor'],
    'Quality Technician': ['Quality Technician', 'Quality Engineer'],
    'Quality Engineer': ['Quality Engineer'],
    'Supervisor': ['Supervisor'],
    'Material Handler': ['Material Handler', 'Supervisor'],
  },
  canSign(person, role) { return !!person && (MES.ROLE_CAN[role] || [role]).includes(person.role); },
  eligibleSigners(role) { return DB.people.filter(p => p.active && MES.canSign(p, role)); },
  sign(signerId, pin, meta) {
    const p = MES.person(signerId);
    if (!p) return MES.fail('Select who is signing.');
    if (String(pin) !== String(p.pin)) { MES.log('E-signature rejected', meta.ctx, 'Invalid PIN for ' + p.name, signerId); return MES.fail('PIN does not match badge ' + p.badge + '. Re-enter the PIN.'); }
    if (meta.role && !MES.canSign(p, meta.role)) return MES.fail(p.name + ' (' + p.role + ') cannot sign as ' + meta.role + '.');
    const at = MES.now();
    const sig = {
      id: MES.next('sig', 'SIG-', 5), userId: p.id, name: p.name, role: p.role, reqRole: meta.role || p.role,
      meaning: meta.meaning, ctxType: meta.ctxType, ctx: meta.ctx, label: meta.label, at,
    };
    sig.hash = U.hash([sig.id, p.id, p.badge, meta.meaning, meta.ctxType, meta.ctx, at].join('|'));
    DB.sigs.push(sig);
    MES.log('E-signed: ' + meta.meaning, meta.ctx, meta.label, p.id);
    return MES.ok({ sig });
  },

  /* ------------------------------------------------------------------ holds */
  activeHolds(type, target) {
    return DB.holds.filter(h => h.status === 'Active' && (!type || h.type === type) && (!target || h.target === target));
  },
  unitHeld(serial) { return MES.activeHolds('Unit', serial).length > 0; },
  invHeld(rec) {
    if (rec.serial && MES.activeHolds('Serial', rec.serial).length) return true;
    if (rec.lot && MES.activeHolds('Lot', rec.partId + '|' + rec.lot).length) return true;
    return false;
  },
  placeHold({ type, target, reason, drId, by, partId }) {
    const h = { id: MES.next('hold', 'QH-', 4), type, target, partId: partId || null, reason, drId: drId || null, status: 'Active', placedBy: by, at: MES.now() };
    DB.holds.push(h);
    if (type === 'Serial') { const r = DB.inv.find(i => i.serial === target); if (r && r.status === 'Available') { r.status = 'Hold'; } }
    MES.log('Quality hold placed', h.id, type + ' ' + target + ' — ' + reason, by);
    return MES.ok({ hold: h });
  },
  releaseHold(holdId, signerId, pin, note) {
    const h = DB.holds.find(x => x.id === holdId);
    if (!h || h.status !== 'Active') return MES.fail('Hold is not active.');
    if (h.drId) {
      const d = MES.dr(h.drId);
      if (d && d.status === 'Open') return MES.fail(h.drId + ' has no MRB disposition yet. Disposition the discrepancy to release this hold.');
    }
    const s = MES.sign(signerId, pin, { role: 'Quality Engineer', meaning: 'Hold released', ctxType: 'Hold', ctx: h.id, label: 'Release ' + h.type + ' ' + h.target });
    if (!s.ok) return s;
    MES._release(h, signerId, note, s.sig.id);
    return MES.ok();
  },
  _release(h, by, note, sigId) {
    h.status = 'Released'; h.releasedBy = by; h.releasedAt = MES.now(); h.note = note || ''; h.sigId = sigId || null;
    if (h.type === 'Serial') { const r = DB.inv.find(i => i.serial === h.target); if (r && r.status === 'Hold') r.status = 'Available'; }
    MES.log('Quality hold released', h.id, note || '', by);
  },

  /* ------------------------------------------------------------------ discrepancies */
  DR_OPEN: ['Open', 'Rework', 'Pending Verification'],
  createDR(o) {
    const d = {
      id: MES.next('dr', 'DR-26-', 4), status: 'Open', createdAt: MES.now(), createdBy: o.by,
      serial: o.serial || null, itemId: o.itemId || null, seq: o.seq || null, charId: o.charId || null,
      partId: o.partId || null, compSerial: o.compSerial || null, lot: o.lot || null,
      source: o.source || 'Manual', severity: o.severity || 'Minor', category: o.category || 'Workmanship',
      title: o.title, description: o.description || '', measured: o.measured ?? null, spec: o.spec || null,
      disposition: null, rootCause: '', containment: '', correctiveAction: '', holdId: null, history: [],
    };
    d.history.push({ at: d.createdAt, by: o.by, action: 'Opened', note: d.title });
    DB.drs.push(d);
    MES.log('Discrepancy opened', d.id, d.severity + ' · ' + d.title, o.by);
    if (d.severity !== 'Minor' || o.hold) {
      let hr = null;
      if (d.serial) hr = MES.placeHold({ type: 'Unit', target: d.serial, reason: d.id + ': ' + d.title, drId: d.id, by: o.by });
      else if (d.compSerial) hr = MES.placeHold({ type: 'Serial', target: d.compSerial, partId: d.partId, reason: d.id + ': ' + d.title, drId: d.id, by: o.by });
      else if (d.lot) hr = MES.placeHold({ type: 'Lot', target: d.partId + '|' + d.lot, partId: d.partId, reason: d.id + ': ' + d.title, drId: d.id, by: o.by });
      if (hr) { d.holdId = hr.hold.id; d.history.push({ at: MES.now(), by: o.by, action: 'Hold placed', note: hr.hold.id }); }
    }
    return MES.ok({ dr: d });
  },
  DISPOSITIONS: ['Rework', 'Repair', 'Use As Is', 'Scrap', 'Return to Vendor'],
  dispositionDR(id, f, signerId, pin) {
    const d = MES.dr(id);
    if (!d || d.status !== 'Open') return MES.fail('Only open discrepancies can be dispositioned.');
    if (!MES.DISPOSITIONS.includes(f.disposition)) return MES.fail('Choose a disposition.');
    if (!f.rootCause || f.rootCause.trim().length < 5) return MES.fail('Enter the root cause (at least a short sentence).');
    if (f.disposition === 'Return to Vendor' && !d.partId) return MES.fail('Return to Vendor applies only to purchased component discrepancies.');
    const s = MES.sign(signerId, pin, { role: 'Quality Engineer', meaning: 'MRB disposition: ' + f.disposition, ctxType: 'Discrepancy', ctx: d.id, label: d.title });
    if (!s.ok) return s;
    Object.assign(d, { disposition: f.disposition, rootCause: f.rootCause, containment: f.containment || '', correctiveAction: f.correctiveAction || '', dispositionBy: signerId, dispositionAt: MES.now(), dispositionSig: s.sig.id });
    d.history.push({ at: MES.now(), by: signerId, action: 'Dispositioned: ' + f.disposition, note: f.rootCause });
    const hold = d.holdId && DB.holds.find(h => h.id === d.holdId && h.status === 'Active');
    if (f.disposition === 'Rework' || f.disposition === 'Repair') {
      d.status = 'Rework';
      if (hold) { MES._release(hold, signerId, 'Released for ' + f.disposition.toLowerCase() + ' per ' + d.id, s.sig.id); d.history.push({ at: MES.now(), by: signerId, action: 'Hold released for rework', note: hold.id }); }
    } else {
      // Use As Is / Scrap / RTV close on disposition
      if (f.disposition === 'Scrap' || f.disposition === 'Return to Vendor') {
        if (d.compSerial) {
          const r = DB.inv.find(i => i.serial === d.compSerial);
          if (r) { const from = r.location; r.status = f.disposition === 'Scrap' ? 'Scrap' : 'RTV'; r.location = f.disposition === 'Scrap' ? 'SCRAP' : 'VENDOR'; MES._move({ type: f.disposition === 'Scrap' ? 'Scrap' : 'Return to Vendor', partId: r.partId, serial: r.serial, qty: 1, from, to: f.disposition === 'Scrap' ? 'SCRAP' : 'VENDOR', by: signerId, ref: d.id }); }
        } else if (d.serial && f.disposition === 'Scrap') {
          const u = MES.unit(d.serial); if (u) { u.status = 'Scrapped'; u.location = 'SCRAP'; }
        }
      }
      if (hold) MES._release(hold, signerId, 'Released on disposition ' + f.disposition + ' per ' + d.id, s.sig.id);
      d.status = 'Closed'; d.closedAt = MES.now(); d.closedBy = signerId; d.closeSig = s.sig.id;
      d.history.push({ at: MES.now(), by: signerId, action: 'Closed', note: 'Closed on MRB disposition' });
    }
    MES.log('Discrepancy dispositioned', d.id, f.disposition, signerId);
    return MES.ok({ dr: d });
  },
  reworkDoneDR(id, note, by) {
    const d = MES.dr(id);
    if (!d || d.status !== 'Rework') return MES.fail('Discrepancy is not in rework.');
    if (d.charId && d.serial) {
      const u = MES.unit(d.serial), plan = MES.plan(u.planId), ch = MES.findChar(plan, d.charId);
      const st = MES.charState(u, d.seq, ch);
      if (ch && ch.type !== 'signoff' && st.state !== 'done') return MES.fail('Re-inspect "' + ch.name + '" at ' + d.seq + ' and record a passing result before marking rework complete.');
    }
    d.status = 'Pending Verification';
    d.history.push({ at: MES.now(), by, action: 'Rework complete', note: note || '' });
    MES.log('Rework complete', d.id, note || '', by);
    return MES.ok();
  },
  verifyCloseDR(id, note, signerId, pin) {
    const d = MES.dr(id);
    if (!d || d.status !== 'Pending Verification') return MES.fail('Discrepancy is not pending verification.');
    const s = MES.sign(signerId, pin, { role: 'Quality Engineer', meaning: 'Verified effective & closed', ctxType: 'Discrepancy', ctx: d.id, label: d.title });
    if (!s.ok) return s;
    d.status = 'Closed'; d.closedAt = MES.now(); d.closedBy = signerId; d.closeSig = s.sig.id;
    d.history.push({ at: MES.now(), by: signerId, action: 'Verified & closed', note: note || '' });
    MES.log('Discrepancy closed', d.id, note || '', signerId);
    return MES.ok();
  },
  cancelDR(id, note, by) {
    const d = MES.dr(id);
    if (!d || d.status !== 'Open') return MES.fail('Only open discrepancies can be cancelled.');
    if (!note || note.trim().length < 5) return MES.fail('Give the reason for cancelling.');
    d.status = 'Cancelled'; d.closedAt = MES.now(); d.closedBy = by;
    d.history.push({ at: MES.now(), by, action: 'Cancelled', note });
    const hold = d.holdId && DB.holds.find(h => h.id === d.holdId && h.status === 'Active');
    if (hold) MES._release(hold, by, 'Released: ' + d.id + ' cancelled');
    MES.log('Discrepancy cancelled', d.id, note, by);
    return MES.ok();
  },
  addDRNote(id, note, by) {
    const d = MES.dr(id);
    if (!d || !note) return MES.fail('Enter a note.');
    d.history.push({ at: MES.now(), by, action: 'Note', note });
    return MES.ok();
  },

  /* ------------------------------------------------------------------ inspection results */
  results(serial, seq, charId) {
    return DB.results.filter(r => r.serial === serial && (seq == null || r.seq === Number(seq)) && (!charId || r.charId === charId));
  },
  latest(serial, seq, charId) {
    const rs = DB.results.filter(r => r.serial === serial && r.seq === Number(seq) && r.charId === charId && !r.superseded);
    return rs[rs.length - 1] || null;
  },
  sigFor(serial, seq, charId) {
    return DB.sigs.find(s => s.ctxType === 'Operation' && s.ctx === serial + '|' + seq + '|' + charId);
  },
  /* state of a characteristic: done | fail | accepted | pending */
  charState(unit, seq, ch) {
    if (!ch) return { state: 'pending' };
    if (ch.type === 'signoff') {
      const s = MES.sigFor(unit.serial, seq, ch.id);
      return s ? { state: 'done', sig: s } : { state: 'pending' };
    }
    const r = MES.latest(unit.serial, seq, ch.id);
    if (!r) return { state: 'pending' };
    if (r.result === 'PASS') return { state: 'done', r };
    const d = r.drId && MES.dr(r.drId);
    if (d && (d.status === 'Closed' && (d.disposition === 'Use As Is'))) return { state: 'accepted', r, dr: d };
    return { state: 'fail', r, dr: d };
  },
  specText(ch) {
    if (ch.type !== 'measure' && ch.type !== 'calc') return '';
    const d = ch.dec ?? 2;
    if (ch.lsl === ch.usl) return U.num(ch.lsl, d) + ' ' + ch.unit;
    return U.num(ch.lsl, d) + ' – ' + U.num(ch.usl, d) + ' ' + ch.unit;
  },
  inSpec(ch, v) { return v >= ch.lsl - 1e-9 && v <= ch.usl + 1e-9; },

  _guardEdit(unit, seq, by) {
    if (!unit) return MES.fail('Unit not found.');
    if (MES.unitHeld(unit.serial)) return MES.fail(unit.serial + ' is on quality hold. No work can be recorded until the hold is released.');
    const o = unit.ops[seq];
    if (!o || o.status !== 'Active') return MES.fail('Start operation ' + seq + ' before recording results.');
    return null;
  },
  _guardWho(unit, seq, by) {
    const p = MES.person(by), st = MES.op(unit.itemId, seq).station;
    if (!p || !p.quals.includes(st)) return MES.fail((p ? p.name : 'This user') + ' is not qualified on ' + st + ' and cannot record inspection data there.');
    return null;
  },
  _pushResult(unit, seq, ch, value, result, by, note) {
    MES.results(unit.serial, seq, ch.id).forEach(r => { r.superseded = true; });
    const r = { id: MES.next('res', 'IR-', 6), serial: unit.serial, itemId: unit.itemId, seq: Number(seq), charId: ch.id, code: ch.code, type: ch.type, name: ch.name, value, unit: ch.unit || '', lsl: ch.lsl, usl: ch.usl, result, by, at: MES.now(), note: note || '', drId: null };
    DB.results.push(r);
    return r;
  },
  _failToDR(unit, seq, ch, r, by, prev) {
    // re-inspection during rework: keep the original DR rather than opening another one
    if (prev && prev.drId) {
      const d = MES.dr(prev.drId);
      if (d && d.status === 'Rework') { r.drId = d.id; d.history.push({ at: MES.now(), by, action: 'Re-inspection FAIL', note: String(r.value) }); return; }
    }
    const opn = MES.op(unit.itemId, seq);
    const res = MES.createDR({
      by, serial: unit.serial, itemId: unit.itemId, seq, charId: ch.id,
      source: ch.type === 'check' ? 'Checklist' : (ch.type === 'calc' ? 'Calculation' : (opn.test ? 'Test' : 'Measurement')),
      severity: ch.sev, category: ch.cat,
      title: ch.type === 'check' ? 'Checklist failed: ' + ch.name : ch.name + ' out of tolerance',
      description: ch.type === 'check' ? 'Operator recorded FAIL at ' + opn.name + '.' : 'Recorded ' + U.num(r.value, ch.dec) + ' ' + ch.unit + ' against spec ' + MES.specText(ch) + ' at ' + opn.name + '.',
      measured: ch.type === 'check' ? null : r.value, spec: MES.specText(ch) || null,
    });
    r.drId = res.dr.id;
  },
  _reinspectPass(unit, seq, ch, prev, by) {
    if (!prev || !prev.drId) return;
    const d = MES.dr(prev.drId);
    if (d && d.status === 'Rework') {
      d.status = 'Pending Verification';
      d.history.push({ at: MES.now(), by, action: 'Re-inspection PASS — rework complete', note: ch.name });
    }
  },
  _checkReinspect(unit, seq, ch) {
    const prev = MES.latest(unit.serial, seq, ch.id);
    if (prev && prev.result === 'FAIL' && prev.drId) {
      const d = MES.dr(prev.drId);
      if (d && d.status === 'Open') return MES.fail(d.id + ' is awaiting MRB disposition. Re-inspection is allowed once Quality dispositions it for rework or repair.');
      if (d && d.status === 'Closed') return MES.fail(d.id + ' is already closed with disposition "' + d.disposition + '".');
    }
    return null;
  },
  recordCheck(serial, seq, charId, result, note, by) {
    const u = MES.unit(serial); const g = MES._guardEdit(u, seq, by) || MES._guardWho(u, seq, by); if (g) return g;
    const ch = MES.findChar(MES.plan(u.planId), charId);
    const gr = MES._checkReinspect(u, seq, ch); if (gr) return gr;
    if (result === 'FAIL' && (!note || note.trim().length < 3)) return MES.fail('Describe what failed so Quality can disposition it.');
    const prev = MES.latest(serial, seq, charId);
    const r = MES._pushResult(u, seq, ch, result, result, by, note);
    if (result === 'FAIL') { MES._failToDR(u, seq, ch, r, by, prev); if (note) { const d = MES.dr(r.drId); if (d && !d.description.includes(note)) d.description += ' Note: ' + note; } }
    else MES._reinspectPass(u, seq, ch, prev, by);
    MES.log('Checklist ' + result, serial + ' OP' + seq, ch.code + ' ' + ch.name, by);
    return MES.ok({ result: r });
  },
  recordMeasure(serial, seq, charId, value, by, note) {
    const u = MES.unit(serial); const g = MES._guardEdit(u, seq, by) || MES._guardWho(u, seq, by); if (g) return g;
    const plan = MES.plan(u.planId), ch = MES.findChar(plan, charId);
    const v = Number(value);
    if (value === '' || value === null || isNaN(v)) return MES.fail('Enter a numeric value for ' + ch.name + '.');
    const gr = MES._checkReinspect(u, seq, ch); if (gr) return gr;
    const prev = MES.latest(serial, seq, charId);
    const rounded = Number(v.toFixed(ch.dec ?? 3));
    const pass = MES.inSpec(ch, rounded);
    const r = MES._pushResult(u, seq, ch, rounded, pass ? 'PASS' : 'FAIL', by, note);
    if (!pass) MES._failToDR(u, seq, ch, r, by, prev); else MES._reinspectPass(u, seq, ch, prev, by);
    MES.log('Measurement ' + r.result, serial + ' OP' + seq, ch.code + ' = ' + rounded + ' ' + ch.unit, by);
    const calcs = MES._recalc(u, seq, plan, by);
    return MES.ok({ result: r, calcs });
  },
  _recalc(u, seq, plan, by) {
    const chars = MES.planChars(plan, seq), out = [];
    const vars = {};
    chars.forEach(c => { const r = MES.latest(u.serial, seq, c.id); if (r && (c.type === 'measure' || c.type === 'calc')) vars[c.code] = r.value; });
    chars.filter(c => c.type === 'calc').forEach(c => {
      let refs;
      try { refs = Formula.refs(c.formula); } catch (e) { return; }
      if (!refs.every(k => vars[k] !== undefined)) return;
      if (MES.unitHeld(u.serial)) return; // a failing input already put the unit on hold; calc re-runs after rework
      let val;
      try { val = Formula.evaluate(c.formula, vars); } catch (e) { return; }
      val = Number(val.toFixed(c.dec ?? 3));
      const prev = MES.latest(u.serial, seq, c.id);
      if (prev && prev.value === val) return;
      if (prev && prev.result === 'FAIL' && prev.drId) { const d = MES.dr(prev.drId); if (d && d.status === 'Open') return; }
      const pass = MES.inSpec(c, val);
      const r = MES._pushResult(u, seq, c, val, pass ? 'PASS' : 'FAIL', by, 'Auto-calculated: ' + c.formula);
      vars[c.code] = val;
      if (!pass) MES._failToDR(u, seq, c, r, by, prev); else MES._reinspectPass(u, seq, c, prev, by);
      out.push(r);
    });
    return out;
  },

  /* serial validation for a component scan against BOM, inventory, holds and location */
  validateSerial(serial, seq, charId, scanned, by) {
    const u = MES.unit(serial); const g = MES._guardEdit(u, seq, by) || MES._guardWho(u, seq, by); if (g) return g;
    const plan = MES.plan(u.planId), ch = MES.findChar(plan, charId);
    const part = MES.part(ch.partId), opn = MES.op(u.itemId, seq), st = MES.station(opn.station);
    scanned = String(scanned || '').trim().toUpperCase();
    const checks = [];
    const add = (label, ok, msg) => { checks.push({ label, ok, msg }); return ok; };
    const finish = (ok, msg) => {
      DB.attempts.push({ id: MES.next('att', 'SV-', 6), serial, seq: Number(seq), charId, code: ch.code, partId: ch.partId, slot: ch.slot, scanned, ok, msg, checks, by, at: MES.now() });
      MES.log('Serial validation ' + (ok ? 'PASS' : 'FAIL'), serial + ' OP' + seq, ch.slot + ': ' + scanned + (ok ? '' : ' — ' + msg), by);
      return ok ? MES.ok({ checks, msg }) : Object.assign(MES.fail(msg), { checks });
    };
    if (!scanned) return MES.fail('Scan or type the serial number.');
    const existing = MES.latest(serial, seq, charId);
    if (existing && existing.result === 'PASS') return MES.fail(ch.slot + ' already recorded as ' + existing.value + '. Remove it through a discrepancy before replacing.');
    const bomLine = (DB.boms[u.itemId] || []).find(b => b.partId === ch.partId && b.op === Number(seq) && (!b.slot || b.slot === ch.slot));
    if (!add('BOM position', !!bomLine, bomLine ? part.id + ' is on the ' + u.itemId + ' BOM at OP' + seq : 'Part not on BOM at this operation')) return finish(false, part.id + ' is not on the ' + u.itemId + ' BOM for OP' + seq + '.');
    const pattern = new RegExp(part.pattern);
    if (!add('Serial format', pattern.test(scanned), pattern.test(scanned) ? 'Matches ' + part.id + ' mask' : 'Does not match ' + part.id + ' mask ' + part.pattern)) {
      const other = DB.inv.find(i => i.serial === scanned);
      return finish(false, other ? 'Wrong part: ' + scanned + ' is a ' + other.partId + ' (' + MES.part(other.partId).name + '), expected ' + part.id + '.' : scanned + ' does not match the ' + part.id + ' serial format.');
    }
    const rec = DB.inv.find(i => i.serial === scanned);
    if (!add('Known serial', !!rec && rec.partId === part.id, rec ? 'Received ' + U.fmtD(rec.receivedAt) : 'Not found in inventory')) return finish(false, scanned + ' is not in inventory. Check the label, or have Receiving record it.');
    if (!add('Not installed elsewhere', rec.status !== 'Consumed', rec.status === 'Consumed' ? 'Installed in ' + rec.installedIn : 'Unconsumed')) return finish(false, scanned + ' is already installed in ' + rec.installedIn + '.');
    const held = MES.invHeld(rec) || rec.status === 'Hold';
    if (!add('No quality hold', !held && rec.status !== 'Scrap' && rec.status !== 'RTV', held ? 'On quality hold' : rec.status)) return finish(false, scanned + (held ? ' is on quality hold.' : ' has status ' + rec.status + ' and cannot be used.'));
    if (part.type === 'Assembly') {
      const su = MES.unit(scanned);
      const openDr = DB.drs.filter(d => d.serial === scanned && MES.DR_OPEN.includes(d.status));
      if (!add('Assembly released', su && su.status === 'Complete' && !openDr.length, su && su.status === 'Complete' ? (openDr.length ? openDr.length + ' open discrepancies' : 'All operations complete, released') : 'Not complete')) return finish(false, scanned + (openDr.length ? ' has open discrepancy ' + openDr[0].id + '.' : ' has not completed its routing.'));
    }
    const lsLoc = st.building + '-LS';
    if (!add('At line-side', rec.location === lsLoc, rec.location === lsLoc ? 'At ' + lsLoc : 'Located at ' + rec.location)) return finish(false, scanned + ' is at ' + rec.location + ', not at ' + lsLoc + '. Request a material move to line-side.');
    // commit: install and record genealogy
    rec.status = 'Consumed'; rec.installedIn = serial; rec.installedAt = MES.now();
    const from = rec.location; rec.location = serial;
    u.components.push({ partId: part.id, slot: ch.slot, serial: scanned, seq: Number(seq), at: MES.now(), by });
    if (part.type === 'Assembly') { const su = MES.unit(scanned); su.parent = serial; su.location = serial; }
    MES._move({ type: 'Install', partId: part.id, serial: scanned, qty: 1, from, to: serial, by, ref: serial + ' OP' + seq });
    MES._pushResult(u, seq, ch, scanned, 'PASS', by, 'Validated: ' + checks.map(c => c.label).join(', '));
    return finish(true, ch.slot + ' ' + scanned + ' validated and installed.');
  },
  removeComponent(serial, compSerial, reason, by) {
    const u = MES.unit(serial);
    const c = u && u.components.find(x => x.serial === compSerial);
    if (!c) return MES.fail('Component not found on ' + serial + '.');
    if (!reason) return MES.fail('Give a reason for removal.');
    u.components = u.components.filter(x => x !== c);
    c.removedAt = MES.now(); c.removedBy = by; c.reason = reason;
    (u.removed = u.removed || []).push(c);
    const rec = DB.inv.find(i => i.serial === compSerial);
    if (rec) { rec.status = 'Hold'; rec.location = 'B30-MRB'; rec.installedIn = null; }
    const plan = MES.plan(u.planId);
    const ch = MES.planChars(plan, c.seq).find(x => x.type === 'serial' && x.slot === c.slot);
    if (ch) MES.results(serial, c.seq, ch.id).forEach(r => { r.superseded = true; });
    MES._move({ type: 'Remove', partId: c.partId, serial: compSerial, qty: 1, from: serial, to: 'B30-MRB', by, ref: reason });
    MES.log('Component removed', serial, c.slot + ' ' + compSerial + ' — ' + reason, by);
    return MES.ok();
  },

  signOp(serial, seq, charId, signerId, pin) {
    const u = MES.unit(serial); const g = MES._guardEdit(u, seq, signerId); if (g) return g;
    const plan = MES.plan(u.planId), ch = MES.findChar(plan, charId);
    if (MES.sigFor(serial, seq, charId)) return MES.fail('Already signed.');
    const others = MES.planChars(plan, seq).filter(c => c.type !== 'signoff' && c.required);
    const pend = others.filter(c => !['done', 'accepted'].includes(MES.charState(u, seq, c).state));
    if (pend.length) return MES.fail('Complete all inspection items before signing (' + pend.length + ' outstanding: ' + pend.map(c => c.code).join(', ') + ').');
    if (ch.meaning === 'Verified' || ch.meaning === 'Approved') {
      const perf = MES.planChars(plan, seq).filter(c => c.type === 'signoff' && c.meaning === 'Performed').map(c => MES.sigFor(serial, seq, c.id)).filter(Boolean);
      if (perf.some(s => s.userId === signerId)) return MES.fail('Independent verification required: the person who performed the work cannot also verify it.');
    }
    const opn = MES.op(u.itemId, seq);
    const s = MES.sign(signerId, pin, { role: ch.role, meaning: ch.meaning, ctxType: 'Operation', ctx: serial + '|' + seq + '|' + charId, label: serial + ' · OP' + seq + ' ' + opn.name + ' · ' + ch.name });
    return s;
  },

  /* ------------------------------------------------------------------ operation flow */
  opBlockers(u, seq) {
    const plan = MES.plan(u.planId), out = [];
    MES.planChars(plan, seq).forEach(c => {
      if (!c.required) return;
      const st = MES.charState(u, seq, c);
      if (st.state === 'pending') out.push(c.code + ' ' + c.name + ' — not recorded');
      if (st.state === 'fail') out.push(c.code + ' ' + c.name + ' — FAIL' + (st.dr ? ' (' + st.dr.id + ' ' + st.dr.status + ')' : ''));
    });
    return out;
  },
  startOp(serial, seq, by) {
    const u = MES.unit(serial), p = MES.person(by);
    if (!u) return MES.fail('Unit not found.');
    if (u.status === 'Complete' || u.status === 'Scrapped') return MES.fail(serial + ' is ' + u.status.toLowerCase() + '.');
    if (MES.unitHeld(serial)) return MES.fail(serial + ' is on quality hold.');
    const cur = MES.currentOp(u);
    if (!cur || cur.seq !== Number(seq)) return MES.fail(serial + ' is not queued at OP' + seq + '.');
    if (u.ops[seq].status === 'Active') return MES.fail('Already started.');
    if (u.opIdx === MES.routing(u.itemId).length - 1) {
      const open = DB.drs.filter(d => d.serial === serial && MES.DR_OPEN.includes(d.status));
      if (open.length) return MES.fail('Final audit gate: ' + open.map(d => d.id + ' (' + d.status + ')').join(', ') + ' must be closed before the final operation can start.');
    }
    if (!p || !['Operator', 'Supervisor', 'Quality Technician'].includes(p.role)) return MES.fail((p ? p.name + ' (' + p.role + ')' : 'This user') + ' cannot start production operations. Switch to an operator.');
    if (!p.quals.includes(cur.station)) return MES.fail(p.name + ' is not qualified on station ' + cur.station + '. See Personnel for the qualification matrix.');
    const busy = DB.units.find(x => x !== u && x.status === 'In Process' && !MES.unitHeld(x.serial) && MES.currentOp(x) && MES.currentOp(x).station === cur.station && x.ops[MES.currentOp(x).seq].status === 'Active');
    if (busy) return MES.fail('Station ' + cur.station + ' is occupied by ' + busy.serial + '. Complete it first.');
    Object.assign(u.ops[seq], { status: 'Active', start: MES.now(), operator: by });
    u.status = 'In Process'; u.location = cur.station;
    MES.log('Operation started', serial + ' OP' + seq, cur.name + ' @ ' + cur.station, by);
    return MES.ok();
  },
  currentOp(u) { const r = MES.routing(u.itemId); return r[u.opIdx] || null; },
  _lotNeeds(u, seq) {
    return (DB.boms[u.itemId] || []).filter(b => b.op === Number(seq) && MES.part(b.partId).tracking !== 'Serial');
  },
  lotAvailable(partId, location) {
    return DB.inv.filter(i => i.partId === partId && i.location === location && i.status === 'Available' && i.qty > 1e-9 && !MES.invHeld(i))
      .sort((a, b) => a.receivedAt - b.receivedAt);
  },
  completeOp(serial, seq, by) {
    const u = MES.unit(serial);
    if (!u) return MES.fail('Unit not found.');
    if (MES.unitHeld(serial)) return MES.fail(serial + ' is on quality hold.');
    const o = u.ops[seq];
    if (!o || o.status !== 'Active') return MES.fail('Operation is not active.');
    const bl = MES.opBlockers(u, seq);
    if (bl.length) return MES.fail('Cannot complete OP' + seq + ': ' + bl.join('; '));
    const opn = MES.op(u.itemId, seq), st = MES.station(opn.station), ls = st.building + '-LS';
    const isLast = u.opIdx === MES.routing(u.itemId).length - 1;
    if (isLast) {
      const open = DB.drs.filter(d => d.serial === serial && MES.DR_OPEN.includes(d.status));
      if (open.length) return MES.fail('Final release blocked: ' + open.map(d => d.id + ' (' + d.status + ')').join(', ') + ' must be closed first.');
    }
    // backflush lot-controlled material FIFO from line-side
    const needs = MES._lotNeeds(u, seq);
    for (const b of needs) {
      const have = MES.lotAvailable(b.partId, ls).reduce((s, i) => s + i.qty, 0);
      if (have + 1e-9 < b.qty) return MES.fail('Material shortage: ' + b.partId + ' needs ' + b.qty + ' ' + MES.part(b.partId).uom + ' at ' + ls + ', ' + U.num(have, 1) + ' available (unheld). Ask a material handler to replenish.');
    }
    needs.forEach(b => {
      let q = b.qty;
      for (const lot of MES.lotAvailable(b.partId, ls)) {
        if (q <= 1e-9) break;
        const take = Math.min(q, lot.qty);
        lot.qty = Number((lot.qty - take).toFixed(3)); q -= take;
        u.consumed.push({ partId: b.partId, lot: lot.lot, qty: Number(take.toFixed(3)), seq: Number(seq), at: MES.now() });
        MES._move({ type: 'Backflush', partId: b.partId, lot: lot.lot, qty: Number(take.toFixed(3)), from: ls, to: serial, by, ref: serial + ' OP' + seq });
      }
    });
    o.status = 'Done'; o.end = MES.now(); o.completedBy = by;
    if (opn.test) MES._testRecord(u, opn, by);
    MES.log('Operation completed', serial + ' OP' + seq, opn.name, by);
    if (isLast) {
      u.status = 'Complete'; u.completedAt = MES.now();
      const fg = st.building + '-FG'; u.location = fg;
      if (u.itemId !== 'VEH-T1') DB.inv.push({ id: MES.next('inv', 'INV-', 5), partId: u.itemId, serial: u.serial, lot: null, qty: 1, location: fg, status: 'Available', receivedAt: MES.now(), source: 'Produced ' + u.jobId });
      MES._move({ type: 'Production Receipt', partId: u.itemId, serial: u.serial, qty: 1, from: opn.station, to: fg, by, ref: u.jobId });
      const job = MES.job(u.jobId);
      if (job && DB.units.filter(x => x.jobId === job.id && x.status === 'Complete').length >= job.qty) job.status = 'Complete';
    } else {
      u.opIdx++;
      const nx = MES.currentOp(u);
      u.status = 'Queued'; u.location = 'Queue · ' + nx.station;
    }
    return MES.ok({ final: isLast });
  },
  _testRecord(u, opn, by) {
    const plan = MES.plan(u.planId);
    const chars = MES.planChars(plan, opn.seq).filter(c => c.type !== 'signoff');
    const steps = chars.map(c => {
      const hist = MES.results(u.serial, opn.seq, c.id);
      const r = hist.filter(x => !x.superseded).pop();
      return { code: c.code, name: c.name, type: c.type, value: r ? r.value : null, unit: c.unit || '', lsl: c.lsl, usl: c.usl, dec: c.dec, result: r ? r.result : '—', attempts: hist.length };
    });
    const firstPass = steps.every(s => s.attempts <= 1 && s.result === 'PASS');
    const signer = MES.planChars(plan, opn.seq).filter(c => c.type === 'signoff').map(c => MES.sigFor(u.serial, opn.seq, c.id)).filter(Boolean).pop();
    DB.tests.push({
      id: MES.next('test', 'TR-', 5), serial: u.serial, itemId: u.itemId, testType: opn.test, seq: opn.seq, station: opn.station, equipment: opn.equipment,
      startedAt: u.ops[opn.seq].start, completedAt: MES.now(), operator: u.ops[opn.seq].operator, result: steps.every(s => s.result === 'PASS') ? 'PASS' : 'PASS (MRB)', firstPass,
      steps, sigId: signer ? signer.id : null, program: opn.station === 'B20-HT' ? 'HT-24T-B' : opn.station === 'B20-CT' ? 'CT-24T-A' : opn.station === 'B30-EOL' ? 'EOL-T1-R3' : 'WT-MONSOON-6',
    });
  },
  launchUnit(jobId, by) {
    const job = MES.job(jobId);
    if (!job) return MES.fail('Job not found.');
    const launched = DB.units.filter(u => u.jobId === jobId).length;
    if (launched >= job.qty) return MES.fail(job.id + ' is fully launched (' + job.qty + ' units).');
    const plan = MES.activePlan(job.itemId);
    if (!plan) return MES.fail('No released quality plan for ' + job.itemId + '. Release a plan before launching units.');
    const d = new Date(MES.now());
    const ymd = String(d.getFullYear()).slice(2) + U.pad(d.getMonth() + 1, 2) + U.pad(d.getDate(), 2);
    let serial;
    if (job.itemId === 'VEH-T1') serial = U.makeVin(DB.seq.vin = (DB.seq.vin || 1040) + 1);
    else if (job.itemId === 'BIW-T1') serial = 'BT1-' + ymd + '-' + U.pad(DB.seq.body = (DB.seq.body || 0) + 1, 4);
    else serial = 'E24T-' + ymd + '-' + U.pad(DB.seq.eng = (DB.seq.eng || 0) + 1, 4);
    const ops = {};
    MES.routing(job.itemId).forEach(o => { ops[o.seq] = { status: 'Pending' }; });
    const first = MES.routing(job.itemId)[0];
    const u = { serial, itemId: job.itemId, jobId, planId: plan.id, planRev: plan.rev, status: 'Queued', opIdx: 0, ops, components: [], consumed: [], parent: null, location: 'Queue · ' + first.station, launchedAt: MES.now(), launchedBy: by };
    DB.units.push(u);
    if (job.status === 'Released') job.status = 'In Process';
    MES.log('Unit launched', serial, job.id + ' · plan ' + plan.id + ' rev ' + plan.rev, by);
    return MES.ok({ unit: u });
  },

  /* ------------------------------------------------------------------ material */
  _move(m) {
    const mv = Object.assign({ id: MES.next('mv', 'MV-', 6), at: MES.now() }, m);
    DB.moves.push(mv);
    return mv;
  },
  receive({ partId, lot, qty, serials, to, by, supplierRef }) {
    const part = MES.part(partId);
    if (!part) return MES.fail('Choose a part.');
    const loc = to || 'B40-RCV';
    if (part.tracking === 'Serial') {
      if (!serials || !serials.length) return MES.fail('Enter at least one serial number.');
      const re = new RegExp(part.pattern);
      for (const s of serials) {
        if (!re.test(s)) return MES.fail(s + ' does not match the ' + part.id + ' serial format ' + part.pattern + '.');
        if (DB.inv.find(i => i.serial === s)) return MES.fail(s + ' was already received.');
      }
      serials.forEach(s => {
        DB.inv.push({ id: MES.next('inv', 'INV-', 5), partId, serial: s, lot: lot || null, qty: 1, location: loc, status: 'Available', receivedAt: MES.now(), source: supplierRef || part.supplier });
        MES._move({ type: 'Receipt', partId, serial: s, lot: lot || null, qty: 1, from: 'VENDOR', to: loc, by, ref: supplierRef || '' });
      });
    } else {
      if (!lot) return MES.fail('Enter the supplier lot number.');
      if (!(qty > 0)) return MES.fail('Enter a quantity greater than zero.');
      DB.inv.push({ id: MES.next('inv', 'INV-', 5), partId, serial: null, lot, qty: Number(qty), location: loc, status: 'Available', receivedAt: MES.now(), source: supplierRef || part.supplier });
      MES._move({ type: 'Receipt', partId, lot, qty: Number(qty), from: 'VENDOR', to: loc, by, ref: supplierRef || '' });
    }
    MES.log('Material received', partId, (serials ? serials.length + ' serials' : qty + ' ' + part.uom + ' lot ' + lot) + ' → ' + loc, by);
    return MES.ok();
  },
  transfer(invId, qty, to, by, ref) {
    const r = DB.inv.find(i => i.id === invId);
    if (!r) return MES.fail('Inventory record not found.');
    if (!MES.loc(to)) return MES.fail('Choose a destination.');
    if (r.location === to) return MES.fail('Already at ' + to + '.');
    if (r.status !== 'Available' && r.status !== 'Hold') return MES.fail('Status ' + r.status + ' cannot be moved.');
    const dest = MES.loc(to);
    if (MES.invHeld(r) && dest.type !== 'Quarantine') return MES.fail('Held material may only move to a quarantine or MRB location.');
    const p = MES.person(by);
    if (p && !['Material Handler', 'Supervisor', 'Quality Engineer'].includes(p.role)) return MES.fail(p.name + ' (' + p.role + ') cannot post material moves. Switch to a material handler.');
    if (r.serial) {
      const from = r.location; r.location = to;
      const su = MES.unit(r.serial); if (su) su.location = to;
      MES._move({ type: 'Transfer', partId: r.partId, serial: r.serial, qty: 1, from, to, by, ref: ref || '' });
    } else {
      const q = Number(qty);
      if (!(q > 0) || q > r.qty + 1e-9) return MES.fail('Quantity must be between 0 and ' + r.qty + '.');
      const existing = DB.inv.find(i => i.partId === r.partId && i.lot === r.lot && i.location === to && i.status === r.status && !i.serial);
      if (existing) existing.qty = Number((existing.qty + q).toFixed(3));
      else DB.inv.push({ id: MES.next('inv', 'INV-', 5), partId: r.partId, serial: null, lot: r.lot, qty: q, location: to, status: r.status, receivedAt: r.receivedAt, source: r.source });
      r.qty = Number((r.qty - q).toFixed(3));
      MES._move({ type: 'Transfer', partId: r.partId, lot: r.lot, qty: q, from: r.location, to, by, ref: ref || '' });
    }
    MES.log('Material moved', r.partId, (r.serial || r.lot) + ' ' + (r.serial ? '' : qty + ' ') + '→ ' + to, by);
    return MES.ok();
  },
  /* replenishment signals: remaining demand at each line-side vs. on-hand */
  replenishment() {
    const out = [];
    ['B10', 'B20', 'B30'].forEach(b => {
      const ls = b + '-LS';
      const units = DB.units.filter(u => u.status !== 'Complete' && u.status !== 'Scrapped' && MES.routing(u.itemId).some(o => MES.station(o.station).building === b));
      const demand = {};
      units.forEach(u => {
        MES.routing(u.itemId).forEach((o, idx) => {
          if (idx < u.opIdx || (idx === u.opIdx && u.ops[o.seq].status === 'Done')) return;
          (DB.boms[u.itemId] || []).filter(x => x.op === o.seq).forEach(x => {
            if (MES.part(x.partId).tracking === 'Serial') {
              const plan = MES.plan(u.planId);
              const ch = MES.planChars(plan, o.seq).find(c => c.type === 'serial' && c.slot === x.slot);
              if (ch && MES.charState(u, o.seq, ch).state === 'done') return;
            }
            demand[x.partId] = (demand[x.partId] || 0) + x.qty;
          });
        });
      });
      Object.keys(demand).forEach(pid => {
        const part = MES.part(pid);
        const onHand = DB.inv.filter(i => i.partId === pid && i.location === ls && i.status === 'Available' && !MES.invHeld(i)).reduce((s, i) => s + i.qty, 0);
        const need = Number(demand[pid].toFixed(2));
        if (onHand + 1e-9 < need) {
          const src = DB.inv.filter(i => i.partId === pid && i.location !== ls && i.status === 'Available' && !MES.invHeld(i) && MES.loc(i.location) && ['Storage', 'Receiving', 'Finished'].includes(MES.loc(i.location).type) && !(part.type === 'Assembly' && MES.unit(i.serial) && MES.unit(i.serial).status !== 'Complete'));
          out.push({ building: b, ls, partId: pid, need, onHand: Number(onHand.toFixed(2)), short: Number((need - onHand).toFixed(2)), sources: src });
        }
      });
    });
    return out;
  },

  /* ------------------------------------------------------------------ quality plans */
  nextRev(rev) { return String.fromCharCode(rev.charCodeAt(0) + 1); },
  draftFor(itemId) { return DB.plans.find(p => p.itemId === itemId && p.status === 'Draft'); },
  newRevision(itemId, by, blank) {
    if (MES.draftFor(itemId)) return MES.fail('A draft revision already exists for ' + itemId + '.');
    const p = MES.person(by);
    if (!p || !['Quality Engineer'].includes(p.role)) return MES.fail('Only Quality Engineers author quality plans. Switch user to Priya Shah or Daniel Okafor.');
    const all = MES.plansFor(itemId);
    const base = all[0];
    const rev = base ? MES.nextRev(base.rev) : 'A';
    const steps = {};
    MES.routing(itemId).forEach(o => { steps[o.seq] = (!blank && base && base.steps[o.seq]) ? JSON.parse(JSON.stringify(base.steps[o.seq])) : []; });
    const plan = { id: 'QP-' + itemId + '-' + rev, itemId, rev, status: 'Draft', title: MES.part(itemId).name + ' — Quality Plan', createdBy: by, createdAt: MES.now(), changeNote: '', steps, basedOn: base ? base.id : null };
    DB.plans.push(plan);
    MES.log('Quality plan draft created', plan.id, base ? 'Copied from ' + base.id : 'New plan', by);
    return MES.ok({ plan });
  },
  _guardDraft(plan) {
    if (!plan) return MES.fail('Plan not found.');
    if (plan.status !== 'Draft') return MES.fail(plan.id + ' is ' + plan.status + '. Create a new revision to change it.');
    return null;
  },
  nextCode(plan, seq) {
    const nums = MES.planChars(plan, seq).map(c => Number(String(c.code).slice(1)) || 0);
    return 'C' + ((nums.length ? Math.max(...nums) : 0) + 1);
  },
  normalizeChar(def) {
    const c = Object.assign({}, def);
    ['nominal', 'lsl', 'usl', 'dec'].forEach(k => { if (c[k] !== undefined && c[k] !== '') c[k] = Number(c[k]); });
    c.required = c.required !== false;
    return c;
  },
  checkChar(plan, seq, c, selfId) {
    if (!c.name || !String(c.name).trim()) return 'Enter a name.';
    if (c.type === 'measure' || c.type === 'calc') {
      if ([c.lsl, c.usl].some(v => v === '' || v === undefined || isNaN(v))) return 'Enter numeric lower and upper limits.';
      if (c.lsl > c.usl) return 'Lower limit is above the upper limit.';
      if (c.type === 'measure' && (isNaN(c.nominal) || c.nominal < c.lsl || c.nominal > c.usl)) return 'Nominal must sit between the limits.';
      if (!c.unit) return 'Enter the unit of measure.';
    }
    if (c.type === 'calc') {
      let refs;
      try { refs = Formula.refs(c.formula); } catch (e) { return 'Formula error: ' + e.message; }
      if (!refs.length) return 'Formula must reference at least one measurement (C1, C2 …).';
      const numeric = MES.planChars(plan, seq).filter(x => (x.type === 'measure' || x.type === 'calc') && x.id !== selfId).map(x => x.code);
      const missing = refs.filter(r => !numeric.includes(r));
      if (missing.length) return 'Formula references ' + missing.join(', ') + ', which ' + (missing.length > 1 ? 'are not measurements' : 'is not a measurement') + ' in OP' + seq + '.';
    }
    if (c.type === 'serial') {
      const line = (DB.boms[plan.itemId] || []).find(b => b.partId === c.partId && b.op === Number(seq) && (!b.slot || b.slot === c.slot));
      if (!line) return c.partId + (c.slot ? ' / ' + c.slot : '') + ' is not consumed at OP' + seq + ' on the ' + plan.itemId + ' BOM.';
      if (MES.part(c.partId).tracking !== 'Serial') return c.partId + ' is not serial-tracked.';
      const dup = MES.planChars(plan, seq).find(x => x.type === 'serial' && x.slot === c.slot && x.id !== selfId);
      if (dup) return 'Slot "' + c.slot + '" is already validated by ' + dup.code + '.';
    }
    if (c.type === 'signoff' && !MES.ROLE_CAN[c.role]) return 'Choose the signing role.';
    return null;
  },
  addChar(planId, seq, def, by) {
    const plan = MES.plan(planId); const g = MES._guardDraft(plan); if (g) return g;
    const c = MES.normalizeChar(def);
    if (c.type === 'serial') { const line = (DB.boms[plan.itemId] || []).find(b => b.partId === c.partId && b.op === Number(seq)); c.slot = c.slot || (line && line.slot) || MES.part(c.partId).name; c.name = c.name || 'Scan ' + c.slot + ' serial'; }
    const err = MES.checkChar(plan, seq, c, null); if (err) return MES.fail(err);
    c.code = MES.nextCode(plan, seq);
    c.id = plan.itemId + '.' + seq + '.' + c.code + '.' + U.hash(plan.id + c.code + MES.now()).slice(0, 4);
    plan.steps[seq] = plan.steps[seq] || [];
    plan.steps[seq].push(c);
    MES.log('Plan characteristic added', plan.id, 'OP' + seq + ' ' + c.code + ' ' + c.name, by);
    return MES.ok({ ch: c });
  },
  updateChar(planId, seq, charId, def, by) {
    const plan = MES.plan(planId); const g = MES._guardDraft(plan); if (g) return g;
    const list = MES.planChars(plan, seq), idx = list.findIndex(c => c.id === charId);
    if (idx < 0) return MES.fail('Characteristic not found.');
    const c = MES.normalizeChar(Object.assign({}, list[idx], def));
    const err = MES.checkChar(plan, seq, c, charId); if (err) return MES.fail(err);
    list[idx] = c;
    MES.log('Plan characteristic edited', plan.id, 'OP' + seq + ' ' + c.code, by);
    return MES.ok();
  },
  deleteChar(planId, seq, charId, by) {
    const plan = MES.plan(planId); const g = MES._guardDraft(plan); if (g) return g;
    const list = MES.planChars(plan, seq), c = list.find(x => x.id === charId);
    if (!c) return MES.fail('Characteristic not found.');
    const user = list.find(x => x.type === 'calc' && (() => { try { return Formula.refs(x.formula).includes(c.code); } catch (e) { return false; } })());
    if (user) return MES.fail(c.code + ' is used by calculation ' + user.code + ' (' + user.name + '). Edit that formula first.');
    plan.steps[seq] = list.filter(x => x !== c);
    MES.log('Plan characteristic removed', plan.id, 'OP' + seq + ' ' + c.code + ' ' + c.name, by);
    return MES.ok();
  },
  moveChar(planId, seq, charId, dir) {
    const plan = MES.plan(planId); const g = MES._guardDraft(plan); if (g) return g;
    const list = MES.planChars(plan, seq), i = list.findIndex(c => c.id === charId), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return MES.ok();
    [list[i], list[j]] = [list[j], list[i]];
    return MES.ok();
  },
  planIssues(plan) {
    const out = [];
    MES.routing(plan.itemId).forEach(o => {
      const chars = MES.planChars(plan, o.seq);
      chars.forEach(c => { const e = MES.checkChar(plan, o.seq, c, c.id); if (e) out.push({ level: 'error', seq: o.seq, msg: c.code + ': ' + e }); });
      if (chars.length && !chars.some(c => c.type === 'signoff')) out.push({ level: 'warn', seq: o.seq, msg: 'OP' + o.seq + ' has inspection items but no sign-off.' });
      (DB.boms[plan.itemId] || []).filter(b => b.op === o.seq && MES.part(b.partId).tracking === 'Serial').forEach(b => {
        if (!chars.some(c => c.type === 'serial' && c.partId === b.partId && (!b.slot || c.slot === b.slot))) out.push({ level: 'error', seq: o.seq, msg: 'Serialized component ' + b.partId + (b.slot ? ' (' + b.slot + ')' : '') + ' at OP' + o.seq + ' has no serial validation step.' });
      });
      if (o.test && !chars.some(c => c.type === 'measure')) out.push({ level: 'warn', seq: o.seq, msg: 'Test operation OP' + o.seq + ' records no measurements.' });
    });
    return out;
  },
  releasePlan(planId, changeNote, signerId, pin) {
    const plan = MES.plan(planId); const g = MES._guardDraft(plan); if (g) return g;
    const errs = MES.planIssues(plan).filter(i => i.level === 'error');
    if (errs.length) return MES.fail('Resolve ' + errs.length + ' plan error(s) before release: ' + errs[0].msg);
    if (!changeNote || changeNote.trim().length < 5) return MES.fail('Describe what changed in this revision.');
    const s = MES.sign(signerId, pin, { role: 'Quality Engineer', meaning: 'Approved for production', ctxType: 'Quality Plan', ctx: plan.id, label: plan.id + ' rev ' + plan.rev });
    if (!s.ok) return s;
    DB.plans.filter(p => p.itemId === plan.itemId && p.status === 'Released').forEach(p => { p.status = 'Superseded'; p.supersededAt = MES.now(); p.supersededBy = plan.id; });
    Object.assign(plan, { status: 'Released', releasedBy: signerId, releasedAt: MES.now(), sigId: s.sig.id, changeNote });
    MES.log('Quality plan released', plan.id, changeNote, signerId);
    return MES.ok();
  },
  discardDraft(planId, by) {
    const plan = MES.plan(planId); const g = MES._guardDraft(plan); if (g) return g;
    DB.plans = DB.plans.filter(p => p !== plan);
    MES.log('Quality plan draft discarded', planId, '', by);
    return MES.ok();
  },

  /* ------------------------------------------------------------------ analytics */
  unitState(u) {
    if (u.status === 'Scrapped') return 'Scrapped';
    if (MES.unitHeld(u.serial)) return 'On Hold';
    return u.status;
  },
  fpy(itemId) {
    const done = DB.units.filter(u => u.itemId === itemId && u.status === 'Complete');
    if (!done.length) return null;
    const clean = done.filter(u => !DB.drs.some(d => d.serial === u.serial && d.status !== 'Cancelled'));
    return { pct: clean.length / done.length * 100, clean: clean.length, total: done.length };
  },
  /* genealogy tree for a serial */
  tree(serial, depth = 0) {
    const u = MES.unit(serial);
    if (!u || depth > 4) return null;
    return {
      serial, itemId: u.itemId, unit: u,
      children: u.components.map(c => {
        const sub = MES.part(c.partId).type === 'Assembly' ? MES.tree(c.serial, depth + 1) : null;
        return sub ? Object.assign(sub, { slot: c.slot, seq: c.seq, at: c.at }) : { serial: c.serial, itemId: c.partId, slot: c.slot, seq: c.seq, at: c.at, leaf: true };
      }),
      lots: u.consumed,
    };
  },
  whereUsed(q) {
    q = String(q || '').trim().toUpperCase();
    if (!q) return [];
    const hits = [];
    DB.units.forEach(u => {
      u.components.forEach(c => { if (c.serial.toUpperCase() === q) hits.push({ serial: u.serial, how: c.slot + ' (serial)', seq: c.seq }); });
      u.consumed.forEach(c => { if (String(c.lot).toUpperCase() === q) hits.push({ serial: u.serial, how: c.partId + ' lot ' + c.lot + ' × ' + c.qty, seq: c.seq }); });
    });
    // roll up to top-level (vehicle) serials
    return hits.map(h => { let top = MES.unit(h.serial); while (top && top.parent) top = MES.unit(top.parent); return Object.assign(h, { top: top ? top.serial : h.serial }); });
  },
};
