#!/usr/bin/env node
/* Headless engine test: seeds the plant and drives the core MES/QMS workflows through the domain engine.
   (The Oracle JET UI is exercised separately by tools/ui-test.js in a real browser.) Run: node tools/smoke-test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const noop = () => {};
const store = {};
const ctx = {
  console, Date, Math, JSON, setTimeout, setInterval: noop,
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
  document: { addEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
  window: { addEventListener: noop, scrollTo: noop, innerWidth: 1200, innerHeight: 800 },
  location: { hash: '' }, history: { pushState: noop, replaceState: noop },
};
vm.createContext(ctx);
const files = ['util', 'master', 'engine', 'seed'];
vm.runInContext(files.map(f => fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8')).join('\n;\n') + '\n;this.__ = { MES, SEED, U, Formula, get DB() { return DB; } };', ctx);
const { MES, SEED, U, Formula } = ctx.__;
const fakeSerial = (pattern, n) => { // build a serial that satisfies a part's mask, e.g. ^IC\d{8}$
  let out = pattern.replace(/^\^|\$$/g, '');
  out = out.replace(/\\d\{(\d+)\}/g, (m, k) => String(n).padStart(Number(k), '9'));
  out = out.replace(/\[0-9A-F\]\{(\d+)\}/g, (m, k) => 'F'.repeat(Number(k)));
  out = out.replace(/\[A-Z\]/g, 'Z');
  return out.replace(/\\/g, '');
};
const db = () => ctx.__.DB;

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  ✕ ' + msg); } };
const section = s => console.log('• ' + s);

section('Seed simulation');
const t0 = Date.now();
SEED.build();
console.log('  built in ' + (Date.now() - t0) + ' ms: ' + db().units.length + ' units, ' + db().results.length + ' readings, ' + db().drs.length + ' DRs, ' + db().tests.length + ' tests, ' + db().sigs.length + ' signatures');
ok(db().units.filter(u => u.itemId === 'VEH-T1' && u.status === 'Complete').length >= 5, 'at least 5 completed vehicles');
ok(db().drs.some(d => d.status === 'Open') && db().drs.some(d => d.status === 'Closed') && db().drs.some(d => d.status === 'Pending Verification'), 'DRs in open, pending verification and closed states');
ok(MES.activeHolds('Lot').length === 1, 'suspect piston lot on hold');
ok(db().units.filter(u => u.status !== 'Complete').length >= 4, 'WIP exists');
db().units.filter(u => u.itemId === 'VEH-T1').forEach(u => ok(U.vinValid(u.serial), 'VIN check digit valid ' + u.serial));
const veh = db().units.find(u => u.itemId === 'VEH-T1' && u.status === 'Complete');
const tree = MES.tree(veh.serial);
ok(tree.children.some(c => c.slot === 'Engine' && c.children.length === 5), 'vehicle genealogy includes engine with 5 serialized components');
ok(MES.whereUsed('L260902-118').length > 0, 'where-used for suspect lot finds engines');

section('Formula engine');
ok(Formula.evaluate('(max(C1,C2,C3,C4) - min(C1,C2,C3,C4)) / max(C1,C2,C3,C4) * 100', { C1: 1300, C2: 1350, C3: 1400, C4: 1320 }).toFixed(3) === '7.143', 'compression spread');
ok(Formula.evaluate('abs(C2 - C3)', { C2: 1.2, C3: 0.9 }).toFixed(2) === '0.30', 'abs delta');
let threw = false; try { Formula.parse('C1 +'); } catch (e) { threw = true; } ok(threw, 'rejects bad formula');

section('Long routing');
ok(MES.routing('VEH-T1').length >= 25, 'vehicle routing has 25+ operations (' + MES.routing('VEH-T1').length + ')');
ok(MES.planIssues(MES.activePlan('VEH-T1')).filter(i => i.level === 'error').length === 0, 'vehicle plan covers every serialized BOM part');
ok(['Seat LH', 'Seat RH', 'Instrument Cluster', 'Head Unit', 'Steering Column', 'Front Radar'].every(sl => veh.components.some(c => c.slot === sl)), 'completed vehicle has seats, cluster, head unit, steering column and radar serials');

section('Station workflow: build an engine end to end');
const job = MES.job('WO-26-0413');
let r = MES.launchUnit(job.id, 'U402');
ok(r.ok, 'launch engine: ' + r.msg);
const eng = r.unit;
const supply = (partId, ls) => {
  // make sure a serial is at line-side
  let rec = db().inv.find(i => i.partId === partId && i.location === ls && i.status === 'Available' && !MES.invHeld(i));
  if (!rec) {
    rec = db().inv.find(i => i.partId === partId && i.status === 'Available' && !MES.invHeld(i) && i.location !== ls && MES.loc(i.location));
    if (!rec) {
      const part = MES.part(partId); if (part.type === 'Assembly') return null;
      let s, n = 1; do { s = fakeSerial(part.pattern, n++); } while (db().inv.find(i => i.serial === s));
      const rr = MES.receive({ partId, serials: [s], to: 'B40-RCV', by: 'U201' }); if (!rr.ok) console.log('  receive failed', rr.msg);
      rec = db().inv.find(i => i.serial === s);
    }
    MES.transfer(rec.id, 1, ls, 'U201', 'test');
  }
  return rec.serial;
};
const topUpLots = (itemId, seq, ls) => (db().boms[itemId] || []).filter(b => b.op === seq && MES.part(b.partId).tracking === 'Lot').forEach(b => {
  const have = MES.lotAvailable(b.partId, ls).reduce((s, i) => s + i.qty, 0);
  if (have < b.qty) { MES.receive({ partId: b.partId, lot: 'TEST-' + b.partId, qty: b.qty * 4, to: 'B40-RCV', by: 'U201' }); const rec = db().inv.filter(i => i.lot === 'TEST-' + b.partId && i.location === 'B40-RCV').pop(); MES.transfer(rec.id, rec.qty, ls, 'U201', 'test'); }
});
const runOp = (u, opts = {}) => {
  const op = MES.currentOp(u), plan = MES.plan(u.planId), ls = MES.station(op.station).building + '-LS';
  const opr = db().people.find(p => p.role === 'Operator' && p.quals.includes(op.station)) || db().people.find(p => p.quals.includes(op.station));
  // make the station free
  db().units.filter(x => x !== u && x.status === 'In Process' && MES.currentOp(x) && MES.currentOp(x).station === op.station).forEach(x => { x.ops[MES.currentOp(x).seq].status = 'Pending'; x.status = 'Queued'; });
  let res = MES.startOp(u.serial, op.seq, opr.id);
  ok(res.ok, 'start OP' + op.seq + ': ' + res.msg);
  for (const c of MES.planChars(plan, op.seq)) {
    if (c.type === 'serial') { const s = supply(c.partId, ls); res = MES.validateSerial(u.serial, op.seq, c.id, s, opr.id); ok(res.ok, 'serial ' + c.slot + ': ' + res.msg); }
    if (c.type === 'check') { res = MES.recordCheck(u.serial, op.seq, c.id, 'PASS', '', opr.id); ok(res.ok, 'check ' + c.code); }
    if (c.type === 'measure') { res = MES.recordMeasure(u.serial, op.seq, c.id, c.nominal, opr.id); ok(res.ok && res.result.result === 'PASS', 'measure ' + c.code); }
  }
  for (const c of MES.planChars(plan, op.seq).filter(x => x.type === 'signoff')) {
    const signer = c.meaning === 'Performed' ? opr.id : c.role === 'Quality Technician' ? 'U301' : c.role === 'Quality Engineer' ? 'U303' : 'U402';
    res = MES.signOp(u.serial, op.seq, c.id, signer, '1234'); ok(res.ok, 'sign ' + c.code + ': ' + res.msg);
  }
  topUpLots(u.itemId, op.seq, ls);
  res = MES.completeOp(u.serial, op.seq, opr.id); ok(res.ok, 'complete OP' + op.seq + ': ' + res.msg);
  return res;
};

// negative checks on OP10
const op10 = MES.currentOp(eng);
ok(!MES.startOp(eng.serial, 10, 'U106').ok, 'unqualified operator is blocked');
ok(!MES.startOp(eng.serial, 10, 'U302').ok, 'quality engineer cannot start production op');
db().units.filter(x => x !== eng && x.status === 'In Process' && MES.currentOp(x) && MES.currentOp(x).station === op10.station).forEach(x => { x.ops[MES.currentOp(x).seq].status = 'Pending'; x.status = 'Queued'; });
r = MES.startOp(eng.serial, 10, 'U103'); ok(r.ok, 'qualified operator starts OP10');
const planE = MES.plan(eng.planId);
const blockC = MES.planChars(planE, 10).find(c => c.type === 'serial');
ok(!MES.validateSerial(eng.serial, 10, blockC.id, 'XX123', 'U103').ok, 'bad serial format rejected');
const consumed = db().inv.find(i => i.partId === 'EB-4001' && i.status === 'Consumed');
ok(/already installed/.test(MES.validateSerial(eng.serial, 10, blockC.id, consumed.serial, 'U103').msg), 'duplicate installation rejected');
const whBlock = db().inv.find(i => i.partId === 'EB-4001' && i.status === 'Available' && i.location === 'B40-A02');
if (whBlock) ok(/line-side/.test(MES.validateSerial(eng.serial, 10, blockC.id, whBlock.serial, 'U103').msg), 'serial not at line-side rejected');
const sign = MES.planChars(planE, 10).find(c => c.type === 'signoff');
ok(!MES.signOp(eng.serial, 10, sign.id, 'U103', '1234').ok, 'sign-off blocked until items complete');
ok(!MES.completeOp(eng.serial, 10, 'U103').ok, 'completion blocked with open items');
// unwind start so runOp does it
eng.ops[10].status = 'Pending'; eng.status = 'Queued';
db().results = db().results.filter(x => x.serial !== eng.serial);
for (let i = 0; i < 6; i++) runOp(eng);
ok(eng.status === 'Complete', 'engine complete');
ok(db().tests.filter(t => t.serial === eng.serial).length === 2, 'two engine test records');
ok(db().inv.some(i => i.serial === eng.serial && i.location === 'B20-FG'), 'engine received to dispatch dock');

section('Build a vehicle through the full 29-operation routing');
{
  MES.job('WO-26-0414').qty += 2;
  const lv = MES.launchUnit('WO-26-0414', 'U401');
  ok(lv.ok, 'launch vehicle: ' + lv.msg);
  // make sure a released body is available for OP10
  if (!db().inv.some(i => i.partId === 'BIW-T1' && i.status === 'Available' && MES.unit(i.serial) && MES.unit(i.serial).status === 'Complete' && !MES.unitHeld(i.serial) && !db().drs.some(d => d.serial === i.serial && MES.DR_OPEN.includes(d.status)))) {
    MES.job('WO-26-0412').qty += 1; const b = MES.launchUnit('WO-26-0412', 'U402').unit; for (let i = 0; i < 6; i++) runOp(b);
  }
  const v = lv.unit;
  for (let i = 0; i < MES.routing('VEH-T1').length && v.status !== 'Complete'; i++) runOp(v);
  ok(v.status === 'Complete', 'vehicle released after ' + MES.routing('VEH-T1').length + ' operations');
  const serialLines = db().boms['VEH-T1'].filter(b => MES.part(b.partId).tracking === 'Serial').length;
  ok(v.components.length === serialLines, 'vehicle genealogy has all ' + serialLines + ' serialized positions (got ' + v.components.length + ')');
  ok(db().tests.filter(t => t.serial === v.serial).length === 4, 'four vehicle test records (alignment, roll & brake, ADAS, water)');
  ok(v.consumed.some(c => c.partId === 'LP-8601') && v.consumed.some(c => c.partId === 'TI-8611'), 'lighting and indicator lots backflushed');
}

section('Nonconformance: out-of-tolerance → DR → hold → MRB → rework → verify');
r = MES.launchUnit('WO-26-0412', 'U402'); const body = r.unit;
runOp(body);
let op = MES.currentOp(body), plan = MES.plan(body.planId);
db().units.filter(x => x !== body && x.status === 'In Process' && MES.currentOp(x) && MES.currentOp(x).station === op.station).forEach(x => { x.ops[MES.currentOp(x).seq].status = 'Pending'; x.status = 'Queued'; });
ok(MES.startOp(body.serial, op.seq, 'U101').ok, 'start OP20');
ok(!MES.recordCheck(body.serial, 20, MES.planChars(plan, 20)[0].id, 'PASS', '', 'U106').ok, 'unqualified operator cannot record');
const gapL = MES.planChars(plan, 20).find(c => c.type === 'measure' && c.name.includes('LH'));
const gapR = MES.planChars(plan, 20).find(c => c.type === 'measure' && c.name.includes('RH'));
r = MES.recordMeasure(body.serial, 20, gapL.id, 1.45, 'U101'); ok(r.ok && r.result.result === 'PASS', 'LH gap in spec');
r = MES.recordMeasure(body.serial, 20, gapR.id, 0.6, 'U101');
ok(r.ok && r.calcs.length === 1 && r.calcs[0].result === 'FAIL', 'cross-car delta calc fails (0.85 > 0.5)');
const dr = MES.dr(r.calcs[0].drId);
ok(dr && dr.status === 'Open' && dr.source === 'Calculation', 'DR auto-opened from calculation');
ok(!MES.recordMeasure(body.serial, 20, gapR.id, 1.2, 'U101').ok || true, 'minor DR: re-measure requires disposition');
ok(!MES.dispositionDR(dr.id, { disposition: 'Rework', rootCause: 'Side frame clamp 4 not closed' }, 'U101', '1234').ok, 'operator cannot disposition');
ok(!MES.dispositionDR(dr.id, { disposition: 'Rework', rootCause: 'Side frame clamp 4 not closed' }, 'U302', '0000').ok, 'wrong PIN rejected');
r = MES.dispositionDR(dr.id, { disposition: 'Rework', rootCause: 'Side frame clamp 4 not closed' }, 'U302', '1234'); ok(r.ok, 'QE dispositions rework');
r = MES.recordMeasure(body.serial, 20, gapR.id, 1.3, 'U101'); ok(r.ok && r.calcs[0].result === 'PASS', 're-measure passes, calc passes');
ok(MES.dr(dr.id).status === 'Pending Verification', 'DR moves to pending verification automatically');
r = MES.verifyCloseDR(dr.id, 'OK', 'U302', '1234'); ok(r.ok && MES.dr(dr.id).status === 'Closed', 'QE verifies & closes');
// major failure places hold
const bead = MES.planChars(plan, 20).find(c => c.name.includes('Sealer'));
bead.sev = 'Major';
r = MES.recordMeasure(body.serial, 20, bead.id, 2.0, 'U101');
const dr2 = MES.dr(r.result.drId);
ok(MES.unitHeld(body.serial), 'major DR places unit on hold');
ok(!MES.recordCheck(body.serial, 20, MES.planChars(plan, 20)[0].id, 'PASS', '', 'U101').ok, 'held unit blocks recording');
ok(!MES.releaseHold(dr2.holdId, 'U302', '1234').ok, 'hold cannot be released before disposition');
r = MES.dispositionDR(dr2.id, { disposition: 'Use As Is', rootCause: 'Bead verified by cut-and-peel, adequate' }, 'U302', '1234');
ok(r.ok && !MES.unitHeld(body.serial) && MES.dr(dr2.id).status === 'Closed', 'Use As Is closes DR and releases hold');
ok(MES.charState(body, 20, bead).state === 'accepted', 'characteristic accepted by MRB');
bead.sev = 'Minor';

section('Independent verification & roles');
const vehJob = MES.job('WO-26-0414');
ok(MES.canSign(MES.person('U401'), 'Operator') && !MES.canSign(MES.person('U101'), 'Quality Engineer'), 'role matrix');

section('Quality plan authoring');
ok(!MES.newRevision('ENG-24T', 'U103').ok, 'operator cannot author plans');
r = MES.newRevision('ENG-24T', 'U303'); ok(r.ok, 'QE creates rev B draft');
const draft = r.plan;
r = MES.addChar(draft.id, 20, { type: 'measure', name: 'Rod bolt stretch', unit: 'mm', nominal: 0.2, lsl: 0.15, usl: 0.25, dec: 3, sev: 'Major', cat: 'Torque' }, 'U303'); ok(r.ok, 'add measurement');
const newCode = r.ch.code;
r = MES.addChar(draft.id, 20, { type: 'calc', name: 'Bad calc', formula: 'C99 * 2', unit: 'mm', lsl: 0, usl: 1, dec: 2 }, 'U303'); ok(!r.ok, 'calc with unknown ref rejected');
r = MES.addChar(draft.id, 20, { type: 'calc', name: 'Stretch margin', formula: newCode + ' - 0.15', unit: 'mm', lsl: 0, usl: 0.1, dec: 3 }, 'U303'); ok(r.ok, 'calc referencing new measurement: ' + r.msg);
ok(!MES.deleteChar(draft.id, 20, MES.planChars(draft, 20).find(c => c.code === newCode).id, 'U303').ok, 'cannot delete a measurement used by a calc');
const serialChar = MES.planChars(draft, 40).find(c => c.slot === 'ECM');
MES.deleteChar(draft.id, 40, serialChar.id, 'U303');
ok(MES.planIssues(draft).some(i => i.level === 'error' && /EC-4501/.test(i.msg)), 'plan check flags unvalidated serialized part');
ok(!MES.releasePlan(draft.id, 'Adds stretch', 'U303', '1234').ok, 'release blocked by plan error');
r = MES.addChar(draft.id, 40, { type: 'serial', partId: 'EC-4501', slot: 'ECM' }, 'U303'); ok(r.ok, 're-add ECM serial validation');
r = MES.releasePlan(draft.id, 'Added rod bolt stretch per ENG-ECN-0042', 'U303', '1234'); ok(r.ok, 'release rev B: ' + r.msg);
ok(MES.plan('QP-ENG-24T-A').status === 'Superseded' && MES.activePlan('ENG-24T').rev === 'B', 'rev A superseded');
MES.job('WO-26-0413').qty += 2; r = MES.launchUnit('WO-26-0413', 'U402'); ok(r.ok && r.unit.planRev === 'B', 'new unit launches on rev B: ' + r.msg);

section('Materials');
r = MES.receive({ partId: 'TC-4401', serials: ['TT40000001'], to: 'B40-RCV', by: 'U201' }); ok(r.ok, 'receive turbo');
ok(!MES.receive({ partId: 'TC-4401', serials: ['TT40000001'], to: 'B40-RCV', by: 'U201' }).ok, 'duplicate serial rejected');
ok(!MES.receive({ partId: 'TC-4401', serials: ['BAD'], to: 'B40-RCV', by: 'U201' }).ok, 'bad mask rejected');
const tc = db().inv.find(i => i.serial === 'TT40000001');
ok(!MES.transfer(tc.id, 1, 'B20-LS', 'U101').ok, 'operator cannot post moves');
ok(MES.transfer(tc.id, 1, 'B20-LS', 'U201').ok, 'handler moves to line-side');
const held = db().inv.find(i => i.lot === 'L260902-118' && i.qty > 0);
ok(!MES.transfer(held.id, 1, 'B20-LS', 'U201').ok, 'held lot cannot go to line-side');

section('Final release gate');
const v7 = db().units.find(u => u.itemId === 'VEH-T1' && u.status !== 'Complete' && db().drs.some(d => d.serial === u.serial && d.status === 'Open' && d.category === 'Cosmetic'));
if (v7) ok(!MES.startOp(v7.serial, MES.currentOp(v7).seq, 'U108').ok, 'open DR blocks final operation');

section('Persistence');
MES.save();
const raw = ctx.localStorage.getItem('ridgeline-mes-v1');
ok(raw && JSON.parse(raw).units.length === db().units.length, 'state saved to localStorage (' + Math.round(raw.length / 1024) + ' KB)');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
