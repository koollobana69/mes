/* Ridgeline MES — master data: plant layout, personnel, parts, BOMs, routings and baseline quality plans. */
'use strict';

const MASTER = (() => {
  const company = { name: 'Ridgeline Motor Works', plant: 'Plant 1 · Fort Wayne', product: 'Trailhand T1' };

  const buildings = [
    { id: 'B10', name: 'Building 10 — Body Shop', short: 'Body Shop' },
    { id: 'B20', name: 'Building 20 — Powertrain', short: 'Powertrain' },
    { id: 'B30', name: 'Building 30 — Final Assembly', short: 'Final Assembly' },
    { id: 'B40', name: 'Building 40 — Logistics Center', short: 'Logistics' },
  ];

  const locations = [
    { id: 'B40-RCV', name: 'Receiving Dock 3', building: 'B40', type: 'Receiving' },
    { id: 'B40-A01', name: 'High-bay Rack A01', building: 'B40', type: 'Storage' },
    { id: 'B40-A02', name: 'High-bay Rack A02', building: 'B40', type: 'Storage' },
    { id: 'B40-QRT', name: 'Quarantine Cage', building: 'B40', type: 'Quarantine' },
    { id: 'B10-LS', name: 'Body Line-side Supermarket', building: 'B10', type: 'Line-side' },
    { id: 'B10-FG', name: 'Body Buffer (painted bodies)', building: 'B10', type: 'Finished' },
    { id: 'B20-LS', name: 'Powertrain Line-side Supermarket', building: 'B20', type: 'Line-side' },
    { id: 'B20-FG', name: 'Engine Dispatch Dock', building: 'B20', type: 'Finished' },
    { id: 'B30-LS', name: 'Final Assembly Line-side / Sequencing', building: 'B30', type: 'Line-side' },
    { id: 'B30-FG', name: 'Ship Yard Lane 2', building: 'B30', type: 'Finished' },
    { id: 'B30-MRB', name: 'MRB Cage (Quality)', building: 'B30', type: 'Quarantine' },
  ];

  const stations = [
    { id: 'B10-UB1', name: 'Underbody Framing Cell', building: 'B10', wc: 'Body Framing' },
    { id: 'B10-SF1', name: 'Side Frame Weld Cell', building: 'B10', wc: 'Body Framing' },
    { id: 'B10-CL1', name: 'Closures Hang Line', building: 'B10', wc: 'Closures' },
    { id: 'B10-CMM', name: 'CMM Dimensional Room', building: 'B10', wc: 'Body Quality' },
    { id: 'B10-PNT', name: 'E-coat & Paint Booth 2', building: 'B10', wc: 'Paint' },
    { id: 'B10-BFI', name: 'Body Final Inspection', building: 'B10', wc: 'Body Quality' },
    { id: 'B20-BLK', name: 'Block Prep & Serialization', building: 'B20', wc: 'Short Block' },
    { id: 'B20-CRK', name: 'Crank & Piston Install', building: 'B20', wc: 'Short Block' },
    { id: 'B20-HD', name: 'Head & Valvetrain', building: 'B20', wc: 'Long Block' },
    { id: 'B20-DRS', name: 'Turbo & ECU Dress', building: 'B20', wc: 'Engine Dress' },
    { id: 'B20-CT', name: 'Cold Test Cell CT-1', building: 'B20', wc: 'Engine Test' },
    { id: 'B20-HT', name: 'Hot Test Cell HT-2', building: 'B20', wc: 'Engine Test' },
    { id: 'B30-TR1', name: 'Body Marriage & VIN', building: 'B30', wc: 'Trim 1' },
    { id: 'B30-DK', name: 'Powertrain Decking', building: 'B30', wc: 'Chassis' },
    { id: 'B30-CH', name: 'Chassis & Suspension', building: 'B30', wc: 'Chassis' },
    { id: 'B30-INT', name: 'Interior & Restraints', building: 'B30', wc: 'Trim 2' },
    { id: 'B30-FL', name: 'Fluids & Electrical', building: 'B30', wc: 'Final' },
    { id: 'B30-EOL', name: 'End-of-Line Test Bay', building: 'B30', wc: 'Vehicle Test' },
    { id: 'B30-WT', name: 'Water Test & Final Audit', building: 'B30', wc: 'Vehicle Test' },
  ];

  const S = id => id;
  const people = [
    { id: 'U101', name: 'Maria Delgado', role: 'Operator', badge: '40117', shift: 'A', building: 'B10', quals: ['B10-UB1', 'B10-SF1', 'B10-CL1'] },
    { id: 'U102', name: 'Jamal Pierce', role: 'Operator', badge: '40152', shift: 'A', building: 'B10', quals: ['B10-CL1', 'B10-PNT', 'B10-BFI', 'B10-SF1'] },
    { id: 'U103', name: 'Tran Nguyen', role: 'Operator', badge: '40233', shift: 'A', building: 'B20', quals: ['B20-BLK', 'B20-CRK', 'B20-HD'] },
    { id: 'U104', name: 'Olivia Hart', role: 'Operator', badge: '40261', shift: 'A', building: 'B20', quals: ['B20-HD', 'B20-DRS', 'B20-CT', 'B20-HT'] },
    { id: 'U105', name: 'Ken Watanabe', role: 'Operator', badge: '40288', shift: 'B', building: 'B20', quals: ['B20-BLK', 'B20-CRK', 'B20-DRS', 'B20-CT', 'B20-HT'] },
    { id: 'U106', name: 'Dmitri Volkov', role: 'Operator', badge: '40314', shift: 'A', building: 'B30', quals: ['B30-TR1', 'B30-DK', 'B30-CH'] },
    { id: 'U107', name: 'Aisha Rahman', role: 'Operator', badge: '40339', shift: 'A', building: 'B30', quals: ['B30-INT', 'B30-FL', 'B30-TR1'] },
    { id: 'U108', name: 'Carlos Mendes', role: 'Operator', badge: '40372', shift: 'A', building: 'B30', quals: ['B30-EOL', 'B30-WT', 'B30-FL', 'B30-CH'] },
    { id: 'U201', name: 'Rosa Jimenez', role: 'Material Handler', badge: '51004', shift: 'A', building: 'B40', quals: [] },
    { id: 'U202', name: 'Tom Becker', role: 'Material Handler', badge: '51019', shift: 'B', building: 'B40', quals: [] },
    { id: 'U301', name: 'Sam Ortiz', role: 'Quality Technician', badge: '62010', shift: 'A', building: 'B10', quals: ['B10-CMM', 'B10-BFI', 'B20-CT', 'B20-HT', 'B30-EOL', 'B30-WT'] },
    { id: 'U302', name: 'Priya Shah', role: 'Quality Engineer', badge: '62045', shift: 'A', building: 'B30', quals: [] },
    { id: 'U303', name: 'Daniel Okafor', role: 'Quality Engineer', badge: '62071', shift: 'A', building: 'B20', quals: [] },
    { id: 'U401', name: 'Linda Park', role: 'Supervisor', badge: '70003', shift: 'A', building: 'B30', quals: ['B30-TR1', 'B30-DK', 'B30-CH', 'B30-INT', 'B30-FL', 'B30-EOL', 'B30-WT'] },
    { id: 'U402', name: 'Marcus Reed', role: 'Supervisor', badge: '70011', shift: 'A', building: 'B20', quals: ['B10-UB1', 'B10-SF1', 'B10-CL1', 'B10-CMM', 'B10-PNT', 'B10-BFI', 'B20-BLK', 'B20-CRK', 'B20-HD', 'B20-DRS', 'B20-CT', 'B20-HT'] },
  ];
  people.forEach(p => { p.pin = '1234'; p.active = true; });

  /* tracking: Serial | Lot | None. pattern = regex the scanned serial must match. */
  const parts = [
    // assemblies (manufactured)
    { id: 'BIW-T1', name: 'Body-in-White, Crew Cab (painted)', uom: 'EA', type: 'Assembly', tracking: 'Serial', pattern: '^BT1-\\d{6}-\\d{4}$', building: 'B10' },
    { id: 'ENG-24T', name: 'Engine Assy 2.4L I4 Turbo', uom: 'EA', type: 'Assembly', tracking: 'Serial', pattern: '^E24T-\\d{6}-\\d{4}$', building: 'B20' },
    { id: 'VEH-T1', name: 'Trailhand T1 Pickup, Crew Cab 4x4', uom: 'EA', type: 'Assembly', tracking: 'Serial', pattern: 'VIN', building: 'B30' },
    // body
    { id: 'UB-1001', name: 'Underbody Pan Assy', uom: 'EA', type: 'Purchased', tracking: 'Lot', supplier: 'Midwest Stamping Co.' },
    { id: 'SF-2001L', name: 'Side Frame Outer, LH', uom: 'EA', type: 'Purchased', tracking: 'Lot', supplier: 'Midwest Stamping Co.' },
    { id: 'SF-2001R', name: 'Side Frame Outer, RH', uom: 'EA', type: 'Purchased', tracking: 'Lot', supplier: 'Midwest Stamping Co.' },
    { id: 'RF-3001', name: 'Roof Panel', uom: 'EA', type: 'Purchased', tracking: 'Lot', supplier: 'Midwest Stamping Co.' },
    { id: 'HD-3101', name: 'Hood Assy', uom: 'EA', type: 'Purchased', tracking: 'Lot', supplier: 'Lakeshore Closures' },
    { id: 'DR-3201', name: 'Door Assy, Front (LH/RH)', uom: 'EA', type: 'Purchased', tracking: 'Lot', supplier: 'Lakeshore Closures' },
    { id: 'TG-3301', name: 'Tailgate Assy', uom: 'EA', type: 'Purchased', tracking: 'Lot', supplier: 'Lakeshore Closures' },
    { id: 'SEA-9001', name: 'Structural Sealer, 2K Epoxy', uom: 'L', type: 'Purchased', tracking: 'Lot', supplier: 'Adhera Chemicals' },
    { id: 'PNT-9002', name: 'Topcoat, Glacier White', uom: 'L', type: 'Purchased', tracking: 'Lot', supplier: 'Adhera Chemicals' },
    // engine
    { id: 'EB-4001', name: 'Engine Block, Aluminum 2.4L', uom: 'EA', type: 'Purchased', tracking: 'Serial', pattern: '^EB\\d{8}$', supplier: 'Great Lakes Castings' },
    { id: 'CK-4101', name: 'Crankshaft, Forged', uom: 'EA', type: 'Purchased', tracking: 'Serial', pattern: '^CK-[A-Z]\\d{6}$', supplier: 'Keystone Forge' },
    { id: 'PS-4201', name: 'Piston Assy w/ Rings', uom: 'EA', type: 'Purchased', tracking: 'Lot', supplier: 'Precision Piston Inc.' },
    { id: 'CR-4202', name: 'Connecting Rod, Cracked Cap', uom: 'EA', type: 'Purchased', tracking: 'Lot', supplier: 'Keystone Forge' },
    { id: 'CH-4301', name: 'Cylinder Head, DOHC', uom: 'EA', type: 'Purchased', tracking: 'Serial', pattern: '^CH\\d{7}$', supplier: 'Great Lakes Castings' },
    { id: 'CS-4302', name: 'Camshaft (Intake/Exhaust)', uom: 'EA', type: 'Purchased', tracking: 'Lot', supplier: 'Keystone Forge' },
    { id: 'TC-4401', name: 'Turbocharger, Twin-scroll', uom: 'EA', type: 'Purchased', tracking: 'Serial', pattern: '^TT4\\d{7}$', supplier: 'Borealis Turbo' },
    { id: 'EC-4501', name: 'Engine Control Module', uom: 'EA', type: 'Purchased', tracking: 'Serial', pattern: '^ECU-[0-9A-F]{8}$', supplier: 'Vantec Electronics' },
    { id: 'GK-4601', name: 'Gasket & Seal Kit', uom: 'KIT', type: 'Purchased', tracking: 'Lot', supplier: 'SealRite' },
    { id: 'OL-9101', name: 'Engine Oil 5W-30 Full Synthetic', uom: 'L', type: 'Purchased', tracking: 'Lot', supplier: 'Petrolux' },
    // vehicle
    { id: 'TR-5001', name: 'Transmission, 8-speed Automatic', uom: 'EA', type: 'Purchased', tracking: 'Serial', pattern: '^TX8A\\d{6}$', supplier: 'Allied Drivetrain' },
    { id: 'AX-5101', name: 'Rear Axle Assy, 3.73 e-Locker', uom: 'EA', type: 'Purchased', tracking: 'Serial', pattern: '^AX\\d{7}$', supplier: 'Allied Drivetrain' },
    { id: 'WT-5201', name: 'Wheel & Tire Assy 265/70R17', uom: 'EA', type: 'Purchased', tracking: 'Lot', supplier: 'Summit Wheel & Tire' },
    { id: 'AB-6001', name: 'Airbag Module, Driver', uom: 'EA', type: 'Purchased', tracking: 'Serial', pattern: '^DAB\\d{8}$', supplier: 'Safeguard Restraints' },
    { id: 'AB-6002', name: 'Airbag Module, Passenger', uom: 'EA', type: 'Purchased', tracking: 'Serial', pattern: '^PAB\\d{8}$', supplier: 'Safeguard Restraints' },
    { id: 'SB-6101', name: 'Seat Belt Pretensioner, Front', uom: 'EA', type: 'Purchased', tracking: 'Serial', pattern: '^PT\\d{8}$', supplier: 'Safeguard Restraints' },
    { id: 'BT-7001', name: 'Battery, 12V AGM H6', uom: 'EA', type: 'Purchased', tracking: 'Serial', pattern: '^BAT\\d{7}$', supplier: 'Voltline' },
    { id: 'WH-7101', name: 'Main Wiring Harness', uom: 'EA', type: 'Purchased', tracking: 'Lot', supplier: 'Vantec Electronics' },
    { id: 'CL-9201', name: 'Coolant, OAT 50/50', uom: 'L', type: 'Purchased', tracking: 'Lot', supplier: 'Petrolux' },
    { id: 'BF-9202', name: 'Brake Fluid DOT 4', uom: 'L', type: 'Purchased', tracking: 'Lot', supplier: 'Petrolux' },
  ];

  /* BOM lines: op = routing operation where the component is consumed. slot distinguishes serialized positions. */
  const boms = {
    'BIW-T1': [
      { partId: 'UB-1001', qty: 1, op: 10 },
      { partId: 'SEA-9001', qty: 0.4, op: 20 },
      { partId: 'SF-2001L', qty: 1, op: 20 },
      { partId: 'SF-2001R', qty: 1, op: 20 },
      { partId: 'RF-3001', qty: 1, op: 30 },
      { partId: 'HD-3101', qty: 1, op: 30 },
      { partId: 'DR-3201', qty: 2, op: 30 },
      { partId: 'TG-3301', qty: 1, op: 30 },
      { partId: 'PNT-9002', qty: 3.2, op: 50 },
    ],
    'ENG-24T': [
      { partId: 'EB-4001', qty: 1, op: 10, slot: 'Block' },
      { partId: 'CK-4101', qty: 1, op: 20, slot: 'Crankshaft' },
      { partId: 'PS-4201', qty: 4, op: 20 },
      { partId: 'CR-4202', qty: 4, op: 20 },
      { partId: 'CH-4301', qty: 1, op: 30, slot: 'Cylinder Head' },
      { partId: 'CS-4302', qty: 2, op: 30 },
      { partId: 'GK-4601', qty: 1, op: 30 },
      { partId: 'TC-4401', qty: 1, op: 40, slot: 'Turbocharger' },
      { partId: 'EC-4501', qty: 1, op: 40, slot: 'ECM' },
      { partId: 'OL-9101', qty: 5.2, op: 50 },
    ],
    'VEH-T1': [
      { partId: 'BIW-T1', qty: 1, op: 10, slot: 'Body' },
      { partId: 'WH-7101', qty: 1, op: 10 },
      { partId: 'ENG-24T', qty: 1, op: 20, slot: 'Engine' },
      { partId: 'TR-5001', qty: 1, op: 20, slot: 'Transmission' },
      { partId: 'AX-5101', qty: 1, op: 30, slot: 'Rear Axle' },
      { partId: 'WT-5201', qty: 4, op: 30 },
      { partId: 'AB-6001', qty: 1, op: 40, slot: 'Driver Airbag' },
      { partId: 'AB-6002', qty: 1, op: 40, slot: 'Passenger Airbag' },
      { partId: 'SB-6101', qty: 1, op: 40, slot: 'Pretensioner LH' },
      { partId: 'SB-6101', qty: 1, op: 40, slot: 'Pretensioner RH' },
      { partId: 'BT-7001', qty: 1, op: 50, slot: 'Battery' },
      { partId: 'CL-9201', qty: 9.8, op: 50 },
      { partId: 'BF-9202', qty: 1.1, op: 50 },
    ],
  };

  const routings = {
    'BIW-T1': [
      { seq: 10, name: 'Underbody Framing', station: 'B10-UB1', stdMin: 55, instr: ['Load UB-1001 on framing fixture F-UB-02; verify locator pins seat fully.', 'Run robot program UB_T1_P14 (148 spot welds).', 'Pull one weld coupon per shift for peel test.'] },
      { seq: 20, name: 'Side Frame Weld & Seal', station: 'B10-SF1', stdMin: 70, instr: ['Hang LH/RH side frames; confirm hand markings.', 'Apply 2K sealer bead along rocker flange before clamp.', 'Measure B-pillar gap with feeler gauge FG-12 on both sides.'] },
      { seq: 30, name: 'Roof & Closures Hang', station: 'B10-CL1', stdMin: 80, instr: ['Install roof panel and laser braze seams.', 'Hang hood, front doors and tailgate using hinge jigs HJ-3x.', 'Gauge hood gap and door flush with digital gap/flush gauge GF-7.'] },
      { seq: 40, name: 'Body Dimensional (CMM)', station: 'B10-CMM', stdMin: 45, instr: ['Load body on CMM fixture; run program BIW_T1_R07.', 'Record deviation for key control points UB-101, UB-102, RF-210.'] },
      { seq: 50, name: 'E-coat & Paint', station: 'B10-PNT', stdMin: 240, instr: ['E-coat dip, cure 180 °C × 20 min.', 'Apply topcoat Glacier White; measure film build with Elcometer DFT-3.'] },
      { seq: 60, name: 'Body Final Inspection', station: 'B10-BFI', stdMin: 30, instr: ['Inspect under L-light tunnel for paint defects.', 'Verify body serial label; release body to buffer.'] },
    ],
    'ENG-24T': [
      { seq: 10, name: 'Block Prep & Serialization', station: 'B20-BLK', stdMin: 25, instr: ['Scan block DMC; laser-etch engine serial on boss.', 'Install oil galley plugs; bore gauge cylinder #1.'] },
      { seq: 20, name: 'Crank & Piston Install', station: 'B20-CRK', stdMin: 45, instr: ['Install crankshaft; torque main caps 95 Nm (DC nutrunner NR-4).', 'Install pistons with arrow to front; measure end play with dial indicator DI-2.'] },
      { seq: 30, name: 'Head & Valvetrain', station: 'B20-HD', stdMin: 50, instr: ['Install head gasket and cylinder head; torque-angle head bolts.', 'Set valve lash; align timing marks.'] },
      { seq: 40, name: 'Turbo & ECM Dress', station: 'B20-DRS', stdMin: 35, instr: ['Mount turbocharger; torque oil feed banjo.', 'Mount ECM and flash calibration 24T-3.1.4.'] },
      { seq: 50, name: 'Cold Test', station: 'B20-CT', stdMin: 12, test: 'Engine Cold Test', equipment: 'CT-1 Motoring Stand', instr: ['Dock engine on CT-1; motor at 600 rpm.', 'Record per-cylinder compression and motored oil pressure.'] },
      { seq: 60, name: 'Hot Test & Release', station: 'B20-HT', stdMin: 20, test: 'Engine Hot Test', equipment: 'HT-2 Dynamometer', instr: ['Fire engine; run 8-minute hot test profile HT-24T-B.', 'Pressure-decay leak test coolant jacket; release to dispatch dock.'] },
    ],
    'VEH-T1': [
      { seq: 10, name: 'Body Marriage & VIN', station: 'B30-TR1', stdMin: 30, instr: ['Call painted body from sequencing; scan body serial.', 'Stamp VIN on frame rail and confirm check digit; route main harness.'] },
      { seq: 20, name: 'Powertrain Decking', station: 'B30-DK', stdMin: 40, instr: ['Scan engine and transmission serials; raise powertrain on AGV decking carrier.', 'Torque engine and transmission mounts.'] },
      { seq: 30, name: 'Chassis & Suspension', station: 'B30-CH', stdMin: 45, instr: ['Install rear axle; route and clip brake lines.', 'Mount wheels; torque lug nuts 190 Nm in star pattern.'] },
      { seq: 40, name: 'Interior & Restraints', station: 'B30-INT', stdMin: 55, instr: ['Install driver and passenger airbag modules; scan each serial.', 'Install front seat belt pretensioners; seat SRS connectors with CPA.'] },
      { seq: 50, name: 'Fluids & Electrical', station: 'B30-FL', stdMin: 25, instr: ['Vacuum-fill coolant and brake fluid.', 'Install and scan battery; record open-circuit voltage.'] },
      { seq: 60, name: 'End-of-Line Test', station: 'B30-EOL', stdMin: 20, test: 'Vehicle EOL Test', equipment: 'EOL Bay 1 — Aligner + Roller Brake Tester', instr: ['Align front toe and camber on aligner.', 'Roller brake test; OBD scan for DTCs.'] },
      { seq: 70, name: 'Water Test & Final Audit', station: 'B30-WT', stdMin: 15, test: 'Vehicle Water Test', equipment: 'Monsoon Booth W-1', instr: ['Run 6-minute monsoon cycle; inspect cabin and bed/tail lamps.', 'Final audit and release to ship yard.'] },
    ],
  };

  /* ---- quality plan characteristic builders ---- */
  const chk = (name, o = {}) => ({ type: 'check', name, phase: o.phase || 'in', sev: o.sev || 'Minor', required: true, cat: o.cat || 'Workmanship' });
  const endchk = (name) => chk(name, { phase: 'end', cat: 'Workmanship' });
  const meas = (name, unit, nominal, lsl, usl, dec, o = {}) => ({ type: 'measure', name, unit, nominal, lsl, usl, dec, gauge: o.gauge || '', sev: o.sev || 'Minor', cat: o.cat || 'Dimensional', required: true, phase: 'in' });
  const calc = (name, formula, unit, lsl, usl, dec, o = {}) => ({ type: 'calc', name, formula, unit, lsl, usl, dec, sev: o.sev || 'Minor', cat: o.cat || 'Dimensional', required: true, phase: 'in' });
  const ser = (partId, slot, o = {}) => ({ type: 'serial', name: 'Scan ' + slot + ' serial', partId, slot, sev: o.sev || 'Major', cat: 'Traceability', required: true, phase: 'in' });
  const sign = (role, meaning, name) => ({ type: 'signoff', name: name || (role + ' sign-off'), role, meaning, required: true, phase: 'end', sev: 'Minor', cat: 'Documentation' });

  const planSteps = {
    'BIW-T1': {
      10: [
        chk('Underbody part number & revision match build sheet'),
        chk('Locator pins engaged and clamps closed before weld cycle'),
        meas('Weld count, underbody (robot counter)', 'welds', 148, 148, 148, 0, { cat: 'Weld', sev: 'Major' }),
        meas('Weld coupon nugget diameter', 'mm', 6.0, 5.0, 7.5, 1, { gauge: 'Caliper CAL-118', cat: 'Weld', sev: 'Major' }),
        endchk('Weld tips dressed; station 5S and FOD sweep complete'),
        sign('Operator', 'Performed'),
      ],
      20: [
        chk('LH/RH side frames correct hand (stamp mark visible)'),
        meas('B-pillar gap to underbody, LH', 'mm', 1.0, 0.5, 1.5, 2, { gauge: 'Feeler FG-12' }),
        meas('B-pillar gap to underbody, RH', 'mm', 1.0, 0.5, 1.5, 2, { gauge: 'Feeler FG-12' }),
        calc('Cross-car gap delta |LH − RH|', 'abs(C2 - C3)', 'mm', 0, 0.5, 2),
        meas('Sealer bead width, rocker flange', 'mm', 6.0, 4.0, 8.0, 1, { gauge: 'Bead gauge BG-3', cat: 'Sealing' }),
        endchk('Sealer nozzle purged & capped; spatter cleared from fixture'),
        sign('Operator', 'Performed'),
      ],
      30: [
        meas('Hood gap to fender, LH', 'mm', 4.0, 3.0, 5.0, 2, { gauge: 'Gap/Flush GF-7' }),
        meas('Hood gap to fender, RH', 'mm', 4.0, 3.0, 5.0, 2, { gauge: 'Gap/Flush GF-7' }),
        calc('Hood gap parallelism', 'abs(C1 - C2)', 'mm', 0, 0.6, 2),
        meas('Front door flush, LH', 'mm', 0.0, -0.5, 0.5, 2, { gauge: 'Gap/Flush GF-7' }),
        meas('Front door flush, RH', 'mm', 0.0, -0.5, 0.5, 2, { gauge: 'Gap/Flush GF-7' }),
        chk('Tailgate hinge bolts torque-striped'),
        endchk('Hinge jigs returned; closures dolly empty'),
        sign('Operator', 'Performed'),
      ],
      40: [
        chk('CMM program BIW_T1_R07 loaded and fixture verified'),
        meas('CMM pt UB-101 X deviation', 'mm', 0, -0.7, 0.7, 2, { gauge: 'CMM Zeiss-02', sev: 'Major' }),
        meas('CMM pt UB-102 Y deviation', 'mm', 0, -0.7, 0.7, 2, { gauge: 'CMM Zeiss-02', sev: 'Major' }),
        meas('CMM pt RF-210 Z deviation', 'mm', 0, -1.0, 1.0, 2, { gauge: 'CMM Zeiss-02', sev: 'Major' }),
        calc('Worst-case deviation', 'max(abs(C2), abs(C3), abs(C4))', 'mm', 0, 1.0, 2, { sev: 'Major' }),
        sign('Quality Technician', 'Verified', 'Dimensional verification'),
      ],
      50: [
        chk('E-coat cure chart within 175–185 °C window'),
        meas('Paint film build, hood', 'µm', 135, 110, 160, 0, { gauge: 'Elcometer DFT-3', cat: 'Paint' }),
        meas('Paint film build, roof', 'µm', 135, 110, 160, 0, { gauge: 'Elcometer DFT-3', cat: 'Paint' }),
        sign('Operator', 'Performed'),
      ],
      60: [
        chk('No weld spatter, burrs or sharp edges in door openings'),
        chk('L-light paint audit: no craters, runs, dirt > 0.5 mm', { cat: 'Paint' }),
        chk('Body serial label applied and legible'),
        sign('Quality Technician', 'Verified', 'Body release'),
      ],
    },
    'ENG-24T': {
      10: [
        ser('EB-4001', 'Block'),
        chk('Oil galley plugs installed and paint-marked', { sev: 'Major' }),
        meas('Cylinder #1 bore diameter', 'mm', 88.000, 87.990, 88.010, 3, { gauge: 'Bore gauge BG-88' }),
        sign('Operator', 'Performed'),
      ],
      20: [
        ser('CK-4101', 'Crankshaft'),
        meas('Main cap bolt final torque (avg)', 'N·m', 95, 90, 100, 1, { gauge: 'Nutrunner NR-4', cat: 'Torque', sev: 'Major' }),
        meas('Crankshaft end play', 'mm', 0.18, 0.08, 0.30, 2, { gauge: 'Dial ind. DI-2' }),
        meas('Crank rotating torque', 'N·m', 12, 5, 20, 1, { gauge: 'Torque wrench TW-9', cat: 'Torque' }),
        chk('Piston arrows toward timing end', { sev: 'Major' }),
        endchk('Nutrunner counts reconciled; no loose fasteners in tray'),
        sign('Operator', 'Performed'),
      ],
      30: [
        ser('CH-4301', 'Cylinder Head'),
        meas('Head bolt final angle', '°', 90, 85, 95, 0, { gauge: 'Nutrunner NR-6', cat: 'Torque', sev: 'Major' }),
        meas('Valve lash, intake', 'mm', 0.20, 0.17, 0.23, 2, { gauge: 'Feeler FG-4' }),
        meas('Valve lash, exhaust', 'mm', 0.28, 0.25, 0.31, 2, { gauge: 'Feeler FG-4' }),
        chk('Cam timing marks aligned; chain tensioner pin pulled', { sev: 'Major' }),
        sign('Operator', 'Performed'),
      ],
      40: [
        ser('TC-4401', 'Turbocharger'),
        ser('EC-4501', 'ECM'),
        meas('Turbo oil feed banjo torque', 'N·m', 30, 27, 33, 1, { gauge: 'Torque wrench TW-3', cat: 'Torque' }),
        chk('ECM flashed to calibration 24T-3.1.4 (checksum OK)', { cat: 'Electrical', sev: 'Major' }),
        endchk('Protective caps on turbo inlet/outlet; FOD check'),
        sign('Operator', 'Performed'),
      ],
      50: [
        meas('Compression, cylinder 1', 'kPa', 1350, 1200, 1500, 0, { cat: 'Test', sev: 'Major' }),
        meas('Compression, cylinder 2', 'kPa', 1350, 1200, 1500, 0, { cat: 'Test', sev: 'Major' }),
        meas('Compression, cylinder 3', 'kPa', 1350, 1200, 1500, 0, { cat: 'Test', sev: 'Major' }),
        meas('Compression, cylinder 4', 'kPa', 1350, 1200, 1500, 0, { cat: 'Test', sev: 'Major' }),
        calc('Compression spread (max−min)/max', '(max(C1,C2,C3,C4) - min(C1,C2,C3,C4)) / max(C1,C2,C3,C4) * 100', '%', 0, 10, 1, { cat: 'Test', sev: 'Major' }),
        meas('Motored oil pressure @ 600 rpm', 'kPa', 180, 120, 300, 0, { cat: 'Test' }),
        sign('Quality Technician', 'Verified', 'Cold test verification'),
      ],
      60: [
        meas('Hot oil pressure @ idle', 'kPa', 150, 100, 250, 0, { cat: 'Test' }),
        meas('Idle speed, stabilized', 'rpm', 750, 700, 800, 0, { cat: 'Test' }),
        meas('Coolant jacket pressure decay', 'Pa/min', 10, 0, 40, 0, { cat: 'Leak', sev: 'Major' }),
        chk('No visible oil or coolant leaks after hot run', { cat: 'Leak', sev: 'Major' }),
        sign('Quality Engineer', 'Approved', 'Engine release'),
      ],
    },
    'VEH-T1': {
      10: [
        ser('BIW-T1', 'Body'),
        chk('VIN stamp legible and matches build sheet (check digit valid)', { sev: 'Major', cat: 'Traceability' }),
        chk('Main harness routed; grommets seated'),
        sign('Operator', 'Performed'),
      ],
      20: [
        ser('ENG-24T', 'Engine'),
        ser('TR-5001', 'Transmission'),
        meas('Engine mount bolt torque, LH', 'N·m', 110, 100, 120, 1, { gauge: 'Nutrunner NR-11', cat: 'Torque', sev: 'Major' }),
        meas('Engine mount bolt torque, RH', 'N·m', 110, 100, 120, 1, { gauge: 'Nutrunner NR-11', cat: 'Torque', sev: 'Major' }),
        meas('Transmission mount torque', 'N·m', 85, 75, 95, 1, { gauge: 'Nutrunner NR-12', cat: 'Torque', sev: 'Major' }),
        endchk('AGV carrier returned; no loose hardware on floor'),
        sign('Operator', 'Performed'),
      ],
      30: [
        ser('AX-5101', 'Rear Axle'),
        meas('Wheel nut torque, LF', 'N·m', 190, 175, 205, 0, { gauge: 'Multi-spindle WN-2', cat: 'Torque', sev: 'Major' }),
        meas('Wheel nut torque, RF', 'N·m', 190, 175, 205, 0, { gauge: 'Multi-spindle WN-2', cat: 'Torque', sev: 'Major' }),
        meas('Wheel nut torque, LR', 'N·m', 190, 175, 205, 0, { gauge: 'Multi-spindle WN-2', cat: 'Torque', sev: 'Major' }),
        meas('Wheel nut torque, RR', 'N·m', 190, 175, 205, 0, { gauge: 'Multi-spindle WN-2', cat: 'Torque', sev: 'Major' }),
        calc('Wheel nut torque spread', 'max(C2,C3,C4,C5) - min(C2,C3,C4,C5)', 'N·m', 0, 20, 0, { cat: 'Torque' }),
        chk('Brake lines clipped at all 9 clip points', { sev: 'Major' }),
        sign('Operator', 'Performed'),
      ],
      40: [
        ser('AB-6001', 'Driver Airbag', { sev: 'Critical' }),
        ser('AB-6002', 'Passenger Airbag', { sev: 'Critical' }),
        ser('SB-6101', 'Pretensioner LH', { sev: 'Critical' }),
        ser('SB-6101', 'Pretensioner RH', { sev: 'Critical' }),
        meas('Driver airbag module bolt torque', 'N·m', 9.0, 7.5, 10.5, 1, { gauge: 'Torque driver TD-2', cat: 'Torque', sev: 'Critical' }),
        chk('SRS connectors seated, CPA locks engaged', { sev: 'Critical', cat: 'Electrical' }),
        endchk('Trim clips and fasteners reconciled; no stray parts in cabin'),
        sign('Operator', 'Performed'),
        sign('Quality Technician', 'Verified', 'Safety-critical restraint verification'),
      ],
      50: [
        ser('BT-7001', 'Battery'),
        meas('Coolant fill volume', 'L', 9.8, 9.5, 10.2, 2, { gauge: 'Fill rig FR-1', cat: 'Fluids' }),
        meas('Brake fluid fill volume', 'L', 1.10, 1.00, 1.25, 2, { gauge: 'Fill rig FR-2', cat: 'Fluids' }),
        meas('Battery open-circuit voltage', 'V', 12.65, 12.40, 12.90, 2, { gauge: 'DMM Fluke-87', cat: 'Electrical' }),
        sign('Operator', 'Performed'),
      ],
      60: [
        meas('Front toe, LH', '°', 0.10, 0.00, 0.20, 2, { cat: 'Test' }),
        meas('Front toe, RH', '°', 0.10, 0.00, 0.20, 2, { cat: 'Test' }),
        calc('Total front toe', 'C1 + C2', '°', 0.05, 0.35, 2, { cat: 'Test' }),
        meas('Brake force, front LH', 'kN', 3.8, 3.0, 4.6, 2, { cat: 'Test', sev: 'Major' }),
        meas('Brake force, front RH', 'kN', 3.8, 3.0, 4.6, 2, { cat: 'Test', sev: 'Major' }),
        calc('Front brake imbalance', 'abs(C4 - C5) / max(C4, C5) * 100', '%', 0, 20, 1, { cat: 'Test', sev: 'Major' }),
        chk('OBD scan: no stored or pending DTCs', { cat: 'Electrical', sev: 'Major' }),
        sign('Quality Technician', 'Verified', 'EOL test verification'),
      ],
      70: [
        meas('Monsoon cycle duration', 'min', 6, 6, 8, 0, { cat: 'Leak' }),
        chk('No water ingress — cabin floor, A-pillars, headliner', { cat: 'Leak', sev: 'Major' }),
        chk('No water ingress — tail lamps and bed junction box', { cat: 'Leak' }),
        chk('Final audit: paint, fit & finish, labels'),
        sign('Quality Engineer', 'Approved', 'Vehicle release to ship'),
      ],
    },
  };

  return { company, buildings, locations, stations, people, parts, boms, routings, planSteps, builders: { chk, endchk, meas, calc, ser, sign } };
})();
