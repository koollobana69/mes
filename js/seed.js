/* Ridgeline MES — seed data. Master data comes from MASTER; transactional history is produced by a
   discrete-event simulation that drives units through the real engine (MES.*), so every result,
   discrepancy, hold, signature, movement and genealogy link obeys the same rules as live use. */
'use strict';

const SEED = (() => {
  const H = 3600e3, MIN = 60e3;

  function planFrom(itemId, rev, status, stepsDef, meta) {
    const steps = {};
    MASTER.routings[itemId].forEach(o => {
      steps[o.seq] = (stepsDef[o.seq] || []).map((c, i) => Object.assign({}, c, { code: 'C' + (i + 1), id: itemId + '.' + o.seq + '.C' + (i + 1) + '.' + rev }));
    });
    return Object.assign({ id: 'QP-' + itemId + '-' + rev, itemId, rev, status, title: MASTER.parts.find(p => p.id === itemId).name + ' — Quality Plan', steps }, meta);
  }

  function serialGen(partId, i) {
    const n = 100 + i;
    switch (partId) {
      case 'EB-4001': return 'EB2609' + U.pad(3100 + n, 4);
      case 'CK-4101': return 'CK-K' + U.pad(724000 + n * 7, 6);
      case 'CH-4301': return 'CH' + U.pad(5180000 + n * 3, 7);
      case 'TC-4401': return 'TT4' + U.pad(2609000 + n * 11, 7);
      case 'EC-4501': return 'ECU-' + (0x7A3F1000 + n * 37).toString(16).toUpperCase();
      case 'TR-5001': return 'TX8A' + U.pad(260800 + n * 5, 6);
      case 'AX-5101': return 'AX' + U.pad(4460000 + n * 9, 7);
      case 'AB-6001': return 'DAB' + U.pad(26090400 + n, 8);
      case 'AB-6002': return 'PAB' + U.pad(26090800 + n, 8);
      case 'SB-6101': return 'PT' + U.pad(60912000 + n * 2, 8);
      case 'BT-7001': return 'BAT' + U.pad(9120000 + n * 13, 7);
    }
    return partId + '-' + n;
  }

  /* failure / rework scenarios keyed by item#unitIndex@op.code */
  const SCEN = {
    'BIW-T1#4@40.C2': { value: 0.92, after: { delay: 2.5 * H, disp: 'Use As Is', by: 'U302', root: 'Framing fixture locator L3 worn 0.2 mm. Deviation reviewed with Body Engineering: no fit/function impact (ECR-2291 deviation D-114).', containment: 'Bodies #5–#6 CMM checked: within tolerance.', ca: 'Replace locator L3; add locator wear gauge to weekly TPM.' } },
    'BIW-T1#7@30.C4': { value: 0.62, after: { delay: 1.2 * H, disp: 'Rework', by: 'U302', root: 'LH door hinge shim missing after hinge jig changeover.', ca: 'Shim presence added to jig changeover checklist.', rework: 0.18, verify: 3 * H } },
    'BIW-T1#10@20.C5': { value: 3.4, after: { delay: 1.0 * H, disp: 'Rework', by: 'U302', root: 'Sealer nozzle partially blocked after lunch break purge skipped.', containment: 'Purged nozzle; bead verified on next body.', ca: 'Automate purge at robot restart.', rework: 5.9, verify: null } },
    'ENG-24T#3@60.C4': { fail: 'Oil seep at turbo oil feed banjo after 8-min hot run', after: { delay: 1.5 * H, disp: 'Repair', by: 'U303', root: 'Banjo copper sealing washer omitted at OP40 dress.', containment: 'Engines #4–#6 inspected at dress: washers present.', ca: 'Washer presence added to OP40 checklist; kitted poka-yoke tray.', rework: 'PASS', verify: 2 * H } },
    'ENG-24T#5@30.C4': { value: 0.33, after: { delay: 0.8 * H, disp: 'Rework', by: 'U303', root: 'Exhaust lash shim selection error (0.05 mm step).', ca: 'Shim selection moved to automated lash calculator.', rework: 0.28, verify: 1.5 * H } },
    'ENG-24T#9@50.C3': { value: 1080, after: null },
    'VEH-T1#2@30.C5': { value: 168, after: { delay: 1.2 * H, disp: 'Rework', by: 'U302', root: 'Multi-spindle WN-2 spindle 4 clutch slipping; under-torque on RR position.', containment: 'Previous vehicle RR nuts audited with calibrated wrench: OK.', ca: 'Spindle 4 clutch replaced; transducer calibration interval cut to 30 days.', rework: 191, verify: 2 * H } },
    'VEH-T1#5@70.C3': { fail: 'Water drip at LH tail lamp gasket after monsoon cycle', after: { delay: 1.0 * H, disp: 'Repair', by: 'U302', root: 'Tail lamp gasket pinched at install (fastener started before lamp seated).', ca: 'Work instruction updated: seat lamp before driving fasteners.', rework: 'PASS', verify: 1.2 * H } },
  };

  function build() {
    const NOW = Date.now();
    const d0 = new Date(NOW - 11 * 24 * H); d0.setHours(6, 0, 0, 0);
    const START = d0.getTime();
    const rnd = U.rng(20260926);
    const clone = x => JSON.parse(JSON.stringify(x));

    DB = {
      version: 1, seededAt: NOW, simNow: START - 20 * H, currentUser: 'U106', seq: {},
      company: clone(MASTER.company), buildings: clone(MASTER.buildings), locations: clone(MASTER.locations), stations: clone(MASTER.stations),
      people: clone(MASTER.people), parts: clone(MASTER.parts), boms: clone(MASTER.boms), routings: clone(MASTER.routings),
      plans: [], jobs: [], units: [], results: [], attempts: [], sigs: [], drs: [], holds: [], inv: [], moves: [], tests: [], audit: [],
    };
    MASTER.stations.forEach(s => { const r = Object.values(MASTER.routings).flat().find(o => o.station === s.id); if (r) s.op = r.seq; });

    /* ---------------- quality plans (with revision history) ---------------- */
    const S = MASTER.planSteps, B = MASTER.builders;
    const biwA = clone(S['BIW-T1']);
    biwA[20] = biwA[20].filter(c => c.type !== 'calc');                // rev A had no cross-car delta calc
    biwA[40] = biwA[40].filter(c => c.type !== 'calc');
    DB.plans.push(planFrom('BIW-T1', 'A', 'Superseded', biwA, { createdBy: 'U302', createdAt: START - 60 * 24 * H, releasedBy: 'U302', releasedAt: START - 58 * 24 * H, changeNote: 'Initial release for Trailhand T1 pilot build.', supersededAt: START - 20 * 24 * H, supersededBy: 'QP-BIW-T1-B' }));
    DB.plans.push(planFrom('BIW-T1', 'B', 'Released', S['BIW-T1'], { createdBy: 'U302', createdAt: START - 22 * 24 * H, releasedBy: 'U302', releasedAt: START - 20 * 24 * H, changeNote: 'Added cross-car gap delta (OP20) and CMM worst-case calc (OP40) per pilot lessons learned, 8D-0137.', basedOn: 'QP-BIW-T1-A' }));
    DB.plans.push(planFrom('ENG-24T', 'A', 'Released', S['ENG-24T'], { createdBy: 'U303', createdAt: START - 40 * 24 * H, releasedBy: 'U303', releasedAt: START - 38 * 24 * H, changeNote: 'Initial release. Cold/hot test limits per ENG-SPEC-24T-017.' }));
    DB.plans.push(planFrom('VEH-T1', 'A', 'Released', S['VEH-T1'], { createdBy: 'U302', createdAt: START - 35 * 24 * H, releasedBy: 'U302', releasedAt: START - 33 * 24 * H, changeNote: 'Initial release for SOP. Restraint serials and EOL limits per VEH-SPEC-T1-004.' }));
    const vehB = clone(S['VEH-T1']);
    vehB[60].splice(6, 0, B.meas('Headlamp aim, low beam vertical', '%', -1.0, -1.5, -0.5, 2, { cat: 'Test' }));
    DB.plans.push(planFrom('VEH-T1', 'B', 'Draft', vehB, { createdBy: 'U302', createdAt: NOW - 20 * H, changeNote: '', basedOn: 'QP-VEH-T1-A' }));
    // plan signatures (approval manifests)
    DB.plans.filter(p => p.releasedBy).forEach(p => {
      const at = p.releasedAt, person = DB.people.find(x => x.id === p.releasedBy);
      const sig = { id: MES.next('sig', 'SIG-', 5), userId: person.id, name: person.name, role: person.role, reqRole: 'Quality Engineer', meaning: 'Approved for production', ctxType: 'Quality Plan', ctx: p.id, label: p.id + ' rev ' + p.rev, at };
      sig.hash = U.hash([sig.id, person.id, person.badge, sig.meaning, sig.ctxType, sig.ctx, at].join('|'));
      DB.sigs.push(sig); p.sigId = sig.id;
    });

    /* ---------------- jobs ---------------- */
    DB.jobs.push(
      { id: 'WO-26-0412', itemId: 'BIW-T1', qty: 16, due: START + 13 * 24 * H, priority: 'Normal', status: 'Released', building: 'B10', releasedAt: START - 12 * H, releasedBy: 'U402', note: 'Body-in-white for September crew-cab schedule' },
      { id: 'WO-26-0413', itemId: 'ENG-24T', qty: 16, due: START + 13 * 24 * H, priority: 'Normal', status: 'Released', building: 'B20', releasedAt: START - 12 * H, releasedBy: 'U402', note: '2.4T engines for T1 crew cab' },
      { id: 'WO-26-0414', itemId: 'VEH-T1', qty: 14, due: START + 14 * 24 * H, priority: 'High', status: 'Released', building: 'B30', releasedAt: START - 12 * H, releasedBy: 'U401', note: 'Dealer stock order — Glacier White, 4x4 crew cab' },
    );

    /* ---------------- receipts into the logistics center ---------------- */
    const rcvAt = START - 18 * H;
    DB.simNow = rcvAt;
    const lotPlan = {
      'UB-1001': [['L260829-044', 16]], 'SF-2001L': [['L260829-051', 16]], 'SF-2001R': [['L260829-052', 16]], 'RF-3001': [['L260830-013', 16]],
      'HD-3101': [['LC2609-0071', 16]], 'DR-3201': [['LC2609-0088', 32]], 'TG-3301': [['LC2609-0093', 16]],
      'SEA-9001': [['AD-5521', 20]], 'PNT-9002': [['AD-GW-7710', 60]],
      'PS-4201': [['L260902-118', 32], ['L260908-121', 48]], 'CR-4202': [['KF-26-3310', 64]], 'CS-4302': [['KF-26-3402', 32]], 'GK-4601': [['SR-90417', 16]], 'OL-9101': [['PX-2609-A', 120]],
      'WT-5201': [['SW-37-2609', 56]], 'WH-7101': [['VT-H-5530', 14]], 'CL-9201': [['PX-C-8812', 160]], 'BF-9202': [['PX-B-3307', 24]],
    };
    Object.entries(lotPlan).forEach(([pid, lots]) => lots.forEach(([lot, qty]) => MES.receive({ partId: pid, lot, qty, to: 'B40-A01', by: 'U201', supplierRef: 'ASN ' + (4400 + lot.length * 7 + qty) })));
    const serialCounts = { 'EB-4001': 18, 'CK-4101': 18, 'CH-4301': 18, 'TC-4401': 17, 'EC-4501': 17, 'TR-5001': 14, 'AX-5101': 14, 'AB-6001': 14, 'AB-6002': 14, 'SB-6101': 30, 'BT-7001': 14 };
    Object.entries(serialCounts).forEach(([pid, n]) => {
      const serials = []; for (let i = 0; i < n; i++) serials.push(serialGen(pid, i));
      MES.receive({ partId: pid, serials, lot: null, to: 'B40-A02', by: 'U201', supplierRef: 'ASN ' + (5100 + n) });
    });
    // put lots into line-side starting stock; piston lot 118 only partially (12 pcs) — rest stays in warehouse
    DB.simNow = rcvAt + 3 * H;
    const stage = (pid, qty, to) => { const r = DB.inv.find(i => i.partId === pid && i.location !== to && i.qty > 0 && !i.serial); if (r) MES.transfer(r.id, Math.min(qty, r.qty), to, 'U201', 'Line-side kanban'); };
    [['UB-1001', 8], ['SF-2001L', 8], ['SF-2001R', 8], ['RF-3001', 8], ['HD-3101', 8], ['DR-3201', 16], ['TG-3301', 8], ['SEA-9001', 6], ['PNT-9002', 30]].forEach(([p, q]) => stage(p, q, 'B10-LS'));
    stage('PS-4201', 12, 'B20-LS');
    [['CR-4202', 32], ['CS-4302', 16], ['GK-4601', 8], ['OL-9101', 60]].forEach(([p, q]) => stage(p, q, 'B20-LS'));
    [['WT-5201', 24], ['WH-7101', 6], ['CL-9201', 60], ['BF-9202', 8]].forEach(([p, q]) => stage(p, q, 'B30-LS'));
    const stageSerials = (pid, n, to) => DB.inv.filter(i => i.partId === pid && i.location === 'B40-A02').slice(0, n).forEach(r => MES.transfer(r.id, 1, to, 'U201', 'Line-side kanban'));
    ['EB-4001', 'CK-4101', 'CH-4301', 'TC-4401', 'EC-4501'].forEach(p => stageSerials(p, 6, 'B20-LS'));
    ['TR-5001', 'AX-5101', 'AB-6001', 'AB-6002', 'BT-7001'].forEach(p => stageSerials(p, 5, 'B30-LS'));
    stageSerials('SB-6101', 10, 'B30-LS');

    /* ---------------- simulation ---------------- */
    const procs = [];
    const spawn = (gen, t) => procs.push({ gen, t });
    const shiftAdj = t => {
      const d = new Date(t), h = d.getHours();
      if (h >= 22) { d.setDate(d.getDate() + 1); d.setHours(6, 0, 0, 0); return d.getTime(); }
      if (h < 6) { d.setHours(6, 0, 0, 0); return d.getTime(); }
      return t;
    };
    const jitter = (lo, hi) => (lo + rnd() * (hi - lo)) * MIN;

    const opPeople = {};
    const operatorFor = (station, idx) => {
      const q = DB.people.filter(p => p.role === 'Operator' && p.quals.includes(station));
      const pool = q.length ? q : DB.people.filter(p => p.quals.includes(station) && p.role !== 'Supervisor');
      return pool[idx % pool.length].id;
    };
    const measureValue = c => {
      if (c.lsl === c.usl) return c.nominal;
      const span = c.usl - c.lsl;
      let v = c.nominal + rnd.norm() * span / 9;
      v = Math.min(c.usl - span * 0.04, Math.max(c.lsl + span * 0.04, v));
      return Number(v.toFixed(c.dec ?? 2));
    };
    const pickSerial = (partId, ls) => {
      const c = DB.inv.filter(i => i.partId === partId && i.location === ls && i.status === 'Available' && !MES.invHeld(i));
      if (MASTER.parts.find(p => p.id === partId).type === 'Assembly') return c.filter(i => { const u = MES.unit(i.serial); return u && u.status === 'Complete' && !DB.drs.some(d => d.serial === u.serial && MES.DR_OPEN.includes(d.status)); }).sort((a, b) => a.receivedAt - b.receivedAt)[0];
      return c[0];
    };

    function* unitProc(job, idx) {
      const r = MES.launchUnit(job.id, job.itemId === 'VEH-T1' ? 'U401' : 'U402');
      const u = r.unit;
      const plan = MES.plan(u.planId);
      for (const opn of MES.routing(u.itemId)) {
        const st = MES.station(opn.station), ls = st.building + '-LS';
        const opr = operatorFor(opn.station, idx);
        yield DB.simNow + jitter(8, 40);
        // wait for station free / start
        let tries = 0;
        while (!MES.startOp(u.serial, opn.seq, opr).ok) { if (++tries > 400) return; yield DB.simNow + 15 * MIN; }
        const chars = MES.planChars(plan, opn.seq);
        const workMin = opn.stdMin * (0.85 + rnd() * 0.35);
        const step = workMin / Math.max(1, chars.length) * MIN;
        for (const c of chars) {
          yield DB.simNow + step;
          if (c.type === 'signoff') continue;
          const key = u.itemId + '#' + idx + '@' + opn.seq + '.' + c.code;
          const sc = SCEN[key];
          if (c.type === 'serial') {
            if (u.itemId === 'VEH-T1' && idx === 3 && c.slot === 'Passenger Airbag') {
              // kitting error: driver airbag presented at passenger position
              const wrong = pickSerial('AB-6001', ls);
              MES.validateSerial(u.serial, opn.seq, c.id, wrong.serial, opr);
              yield DB.simNow + 6 * MIN;
              const dr = MES.createDR({ by: opr, serial: u.serial, itemId: u.itemId, seq: opn.seq, source: 'Serial Validation', severity: 'Minor', category: 'Wrong Part', partId: 'AB-6002', title: 'Driver airbag module presented at passenger position', description: 'Serial validation rejected ' + wrong.serial + ' (AB-6001) for Passenger Airbag slot. Part not installed.' }).dr;
              yield DB.simNow + 40 * MIN;
              MES.dispositionDR(dr.id, { disposition: 'Rework', rootCause: 'Kitting error: DAB and PAB bins adjacent and similar labels in sequencing rack R-12.', containment: 'Sequencing rack R-12 purged and re-verified.', correctiveAction: 'Separate bins with color-coded labels; add scan-to-kit at sequencing.' }, 'U302', '1234');
              yield DB.simNow + 10 * MIN;
              let p2; while (!(p2 = pickSerial('AB-6002', ls))) yield DB.simNow + 20 * MIN;
              MES.validateSerial(u.serial, opn.seq, c.id, p2.serial, opr);
              MES.reworkDoneDR(dr.id, 'Correct passenger module ' + p2.serial + ' installed and validated.', opr);
              yield DB.simNow + 50 * MIN;
              MES.verifyCloseDR(dr.id, 'Verified correct PAB installed; kitting containment effective.', 'U302', '1234');
              continue;
            }
            let rec; let w = 0;
            while (!(rec = pickSerial(c.partId, ls))) { if (++w > 300) return; yield DB.simNow + 20 * MIN; }
            const vr = MES.validateSerial(u.serial, opn.seq, c.id, rec.serial, opr);
            if (!vr.ok) return;
            continue;
          }
          let res;
          if (c.type === 'check') res = MES.recordCheck(u.serial, opn.seq, c.id, sc && sc.fail ? 'FAIL' : 'PASS', sc && sc.fail ? sc.fail : '', opr);
          else if (c.type === 'measure') res = MES.recordMeasure(u.serial, opn.seq, c.id, sc && sc.value !== undefined ? sc.value : measureValue(c), opr);
          else continue; // calc is automatic
          if (sc) {
            const drId = MES.latest(u.serial, opn.seq, c.id).drId;
            if (!sc.after || !drId) { if (!sc.after) return; continue; }
            const a = sc.after;
            yield DB.simNow + a.delay;
            MES.dispositionDR(drId, { disposition: a.disp, rootCause: a.root, containment: a.containment || '', correctiveAction: a.ca || '' }, a.by, '1234');
            if (a.rework !== undefined) {
              yield DB.simNow + jitter(20, 45);
              if (a.rework === 'PASS') MES.recordCheck(u.serial, opn.seq, c.id, 'PASS', 'Re-inspected after repair', opr);
              else MES.recordMeasure(u.serial, opn.seq, c.id, a.rework, opr, 'Re-inspection after rework');
              if (a.verify) spawn((function* () { yield DB.simNow + a.verify; MES.verifyCloseDR(drId, 'Re-inspection reviewed; corrective action in place.', a.by, '1234'); })(), DB.simNow);
            }
          }
        }
        // sign-offs at end of station
        for (const c of chars.filter(x => x.type === 'signoff')) {
          yield DB.simNow + jitter(2, 6);
          let signer = opr;
          if (c.role === 'Quality Technician') signer = 'U301';
          if (c.role === 'Quality Engineer') signer = u.itemId === 'ENG-24T' ? 'U303' : 'U302';
          if (c.meaning === 'Performed' && !MES.canSign(MES.person(signer), c.role)) signer = 'U402';
          let t = 0;
          while (!MES.signOp(u.serial, opn.seq, c.id, signer, '1234').ok) { if (++t > 60) return; yield DB.simNow + 30 * MIN; }
        }
        yield DB.simNow + jitter(2, 5);
        let t2 = 0;
        while (!MES.completeOp(u.serial, opn.seq, opr).ok) { if (++t2 > 200) return; yield DB.simNow + 30 * MIN; }
        // vehicle #7: cosmetic damage found at trim, logged without holding the unit
        if (u.itemId === 'VEH-T1' && idx === 7 && opn.seq === 40) {
          MES.createDR({ by: 'U107', serial: u.serial, itemId: u.itemId, seq: 40, source: 'Manual', severity: 'Minor', category: 'Cosmetic', title: 'Scuff on LH B-pillar trim, approx. 30 mm', description: 'Found during interior trim walk-around. Trim panel not cracked; appearance item.' });
        }
      }
    }

    /* launch plan: evenly paced regular launches, then a tail of recent launches so WIP exists "now" */
    function* launcher(job, main, tail, first) {
      const lastMain = NOW - 34 * H, every = (lastMain - first) / Math.max(1, main - 1);
      yield first;
      for (let i = 1; i <= main + tail; i++) {
        spawn(unitProc(job, i), DB.simNow);
        if (i < main) yield first + i * every * (0.95 + rnd() * 0.1);
        else yield NOW - (main + tail - i) * 2.6 * H - 1.5 * H;
      }
    }

    // material handler: replenish line-side and deliver finished subassemblies to final assembly
    function* handler() {
      yield START + 1 * H;
      while (true) {
        const who = new Date(DB.simNow).getHours() < 14 ? 'U201' : 'U202';
        if (DB.simNow < NOW - 3 * H) {
          MES.replenishment().forEach(rq => {
            let short = rq.short;
            for (const src of rq.sources) {
              if (short <= 1e-9) break;
              if (src.serial) { MES.transfer(src.id, 1, rq.ls, who, 'Replenishment'); short -= 1; }
              else { const pk = Math.min(src.qty, Math.max(short, Math.min(src.qty, short * 2))); MES.transfer(src.id, Number(pk.toFixed(2)), rq.ls, who, 'Replenishment'); short -= pk; }
            }
          });
        }
        yield DB.simNow + 70 * MIN;
      }
    }

    // supplier quality events
    function* supplierEvents() {
      yield START + 1.5 * 24 * H;
      // pretensioner damaged at receiving inspection → RTV
      const pt = DB.inv.find(i => i.partId === 'SB-6101' && i.location === 'B40-A02' && i.status === 'Available');
      const d1 = MES.createDR({ by: 'U201', partId: 'SB-6101', compSerial: pt.serial, source: 'Receiving Inspection', severity: 'Major', category: 'Supplier', title: 'Pretensioner housing cracked (shipping damage)', description: 'Cracked connector housing found on ' + pt.serial + ' during receiving. Dunnage partition collapsed.' }).dr;
      yield DB.simNow + 3 * H;
      MES.dispositionDR(d1.id, { disposition: 'Return to Vendor', rootCause: 'Supplier dunnage partition failure in transit (SCAR-0419 issued to Safeguard Restraints).', containment: 'Remaining pretensioners from ASN inspected: no damage.', correctiveAction: 'Supplier to switch to reinforced dunnage; 100% receiving check for 3 shipments.' }, 'U302', '1234');
      yield START + 6.2 * 24 * H;
      // supplier notification on piston lot → lot hold with where-used containment
      const d2 = MES.createDR({ by: 'U303', partId: 'PS-4201', lot: 'L260902-118', source: 'Supplier Notification', severity: 'Major', category: 'Supplier', title: 'Supplier alert: ring end-gap may exceed max in lot L260902-118', description: 'Precision Piston Inc. notice PPI-QN-2291: ring grinder offset on 2 Sep. Lot L260902-118 suspect. Remaining stock quarantined; installed pistons traced via genealogy (see where-used).' }).dr;
      yield DB.simNow + 1 * H;
      DB.inv.filter(i => i.partId === 'PS-4201' && i.lot === 'L260902-118' && i.qty > 0).forEach(r => MES.transfer(r.id, r.qty, 'B40-QRT', 'U303', d2.id));
      MES.addDRNote(d2.id, 'Where-used run: engines built with this lot identified from genealogy. Awaiting supplier 8D and sample measurements before deciding on field action.', 'U303');
    }

    const E = DB.jobs;
    spawn(launcher(E[0], 11, 3, START), START);
    spawn(launcher(E[1], 12, 3, START + 2 * H), START + 2 * H);
    spawn(launcher(E[2], 7, 3, START + 30 * H), START + 30 * H);
    spawn(handler(), START + H);
    spawn(supplierEvents(), START);

    let guard = 0;
    while (procs.length && guard++ < 200000) {
      let k = 0;
      for (let i = 1; i < procs.length; i++) if (procs[i].t < procs[k].t) k = i;
      const p = procs[k];
      const t = shiftAdj(p.t);
      if (t > NOW) { procs.splice(k, 1); continue; }
      DB.simNow = Math.max(DB.simNow, t);
      const r = p.gen.next();
      if (r.done) procs.splice(k, 1);
      else p.t = Math.max(Number(r.value) || DB.simNow, DB.simNow);
    }
    DB.simNow = null;
    DB.currentUser = 'U106';
    return DB;
  }

  return { build };
})();
