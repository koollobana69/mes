# Ridgeline MES: vehicle plant MES + QMS prototype

An interactive, fully working prototype of a manufacturing execution system with an integrated quality
management system, built for a fictional vehicle maker, **Ridgeline Motor Works**, building the
*Trailhand T1* crew-cab pickup across four buildings.

It runs entirely in the browser (vanilla JS, no build step, no dependencies). On first load it seeds about
12 days of realistic plant history by running a discrete-event simulation **through the same engine the UI
uses**, so every reading, discrepancy, hold, signature, material move and genealogy link is consistent.

![scope](https://img.shields.io/badge/runtime-browser%20only-0b6784) ![deps](https://img.shields.io/badge/dependencies-none-1b7a44)

---

## Quick start

Pick any one of these:

| Option | Command | Then open |
| --- | --- | --- |
| Node (recommended) | `npm start` *(or `node server.js 8080`)* | http://localhost:8080 |
| Python | `python3 -m http.server 8080` | http://localhost:8080 |
| No server | double-click `index.html` | works from `file://` |
| Single file | `npm run build`, or use the committed `dist/ridgeline-mes.html` | open the file in any browser |

Requirements: a modern browser (Chrome, Edge, Firefox, Safari). Node ≥ 16 only if you want the bundled server,
build or tests. Fonts load from Google Fonts when online and fall back to system fonts offline.

Data is saved in your browser's `localStorage`. **Reset demo data** (bottom of the sidebar) rebuilds the
seeded history anchored to the current time.

### Demo users

Switch users from the selector in the top bar. **Every PIN is `1234`.**

| Person | Role | Can do |
| --- | --- | --- |
| Maria Delgado, Jamal Pierce | Operator, Body Shop (B10) | Run stations they are qualified on, record inspections, sign *Performed* |
| Tran Nguyen, Olivia Hart, Ken Watanabe | Operator, Powertrain (B20) | 〃 |
| Dmitri Volkov, Aisha Rahman, Carlos Mendes | Operator, Final Assembly (B30) | 〃 |
| Rosa Jimenez, Tom Becker | Material Handler | Receive material, post moves, fulfil replenishment |
| Sam Ortiz | Quality Technician | CMM/test stations, sign *Verified* |
| Priya Shah, Daniel Okafor | Quality Engineer | Author/release quality plans, MRB disposition, verify & close DRs, holds |
| Linda Park, Marcus Reed | Supervisor | Run any station in their area, sign *Performed* |

---

## 10-minute guided demo

1. **Plant Dashboard.** KPIs (WIP, releases, FPY, open DRs, holds, test first-pass), a live line board
   with one tile per routing operation per job, output by day, a discrepancy Pareto and a needs-attention list.
2. **Station Terminal.** Open a blue *active* tile and switch to the operator shown on it (only qualified
   people can record). The terminal renders that operation's quality plan:
   - *Serialized components*: scan (or click a line-side serial to simulate a scan) and **Validate**. Each scan is
     checked against the BOM position, serial mask, inventory, prior installation, quality holds, subassembly
     release status and line-side location. Try a wrong serial to see the rejection breakdown.
   - *In-process inspection* and *Station-end checklist*: Pass/Fail. A failure asks what was found.
   - *Measurements & calculations*: the input turns green or red live against the limits. Calculations
     (e.g. compression spread %, total toe, brake imbalance) compute automatically.
   - *Sign-off*: role-based e-signature with PIN. *Verified* and *Approved* must come from someone other than the performer.
   - **Complete** backflushes lot material FIFO from line-side, creates the test record for test operations,
     and moves the unit on. The final operation releases the unit to finished goods.
3. **Enter an out-of-tolerance value.** A discrepancy opens automatically. *Major/Critical* severity places
   the unit on **quality hold**, which blocks all work on it.
4. **Discrepancies → the new DR.** Switch to **Priya Shah**, choose a disposition, and sign:
   - *Rework / Repair* releases the hold. Re-measure at the station; a passing reading moves the DR to
     *Pending Verification*. Then **Verify & close** (signature).
   - *Use As Is*, *Scrap* and *Return to Vendor* close on signature. *Use As Is* marks the reading "accepted by MRB".
5. **Quality Plans → QP-VEH-T1-B (Draft).** As a Quality Engineer: add a checklist item, serial validation,
   measurement, calculation (live formula check) or sign-off to any routing operation; reorder, edit, delete.
   *Plan checks* flag serialized BOM parts with no validation and calculations with bad references.
   **Approve & release** (signature + change note) supersedes rev A. New units launch on rev B; units in
   WIP keep the revision they started with.
6. **As-Built Genealogy.** Open any VIN: vehicle → body and engine → block, crank, head, turbo, ECM, and
   every material lot. The piston lot `L260902-118` shows in red: it is on hold after a supplier alert.
   Click it for **where-used**, which lists the engines and vehicles containing it.
7. **Materials.** Receive serials or lots (mask and duplicate checks), move stock between buildings
   (held material can only go to quarantine), and fulfil replenishment requests on the **Dispatch List**.
8. **E-Signatures & Audit.** Every signature with signer, role, meaning, timestamp and manifest hash, plus
   the append-only activity log.

---

## What's modelled

**Plant.** Building 10 Body Shop · Building 20 Powertrain · Building 30 Final Assembly · Building 40
Logistics Center. 19 stations, 11 stock locations (receiving, racks, quarantine, line-side supermarkets,
finished buffers, MRB cage).

**Three production jobs**

| Job | Item | Routing |
| --- | --- | --- |
| WO-26-0412 | `BIW-T1` Body-in-White, crew cab (painted) | Underbody framing → Side frame weld & seal → Roof & closures → CMM → E-coat & paint → Body final inspection |
| WO-26-0413 | `ENG-24T` 2.4L I4 turbo engine | Block prep & serialization → Crank & pistons → Head & valvetrain → Turbo & ECM dress → **Cold test** → **Hot test & release** |
| WO-26-0414 | `VEH-T1` Trailhand T1 pickup | Body marriage & VIN → Powertrain decking → Chassis → Interior & restraints → Fluids & electrical → **EOL test** → **Water test & final audit** |

**BOMs.** 30 parts. Serialized critical components (engine block, crankshaft, cylinder head, turbo, ECM,
transmission, rear axle, driver/passenger airbags, LH/RH pretensioners, battery, plus the body and engine
subassemblies) each have a serial mask. Everything else is lot-controlled and backflushed at the consuming operation.

**Quality plan per assembly item.** Each routing operation carries plan items of five types:
checklist · serial validation · measurement (nominal/LSL/USL, gauge) · calculation (formula over same-op
readings: `min max avg sum abs sqrt round`) · sign-off (role + meaning). Plans have revisions
(Draft → Released → Superseded) with QE e-signature approval.

**Business rules enforced by the engine** (`js/engine.js`)

- Only station-qualified people can start operations or record data. Only QEs can author plans, disposition or close DRs.
- A station runs one unit at a time; held units are pulled off the station.
- Serial validation checks BOM, mask, known serial, not already installed, not held, subassembly released, and at line-side.
- Failed check, out-of-tolerance measurement or calculation → discrepancy auto-created with the plan item's
  severity and category. Major/Critical → unit hold.
- Re-inspection is only allowed after MRB disposition. A passing re-inspection advances the DR to verification.
- Sign-offs require all other items on the operation to be complete. *Verified*/*Approved* must be independent of the performer.
- Operations complete only when every required item passes or is MRB-accepted, and lot material is available (unheld) at line-side.
- The final operation cannot start while the unit has open discrepancies.
- Holds on lots and serials block installation, backflush and moves to non-quarantine locations.
- VINs carry a valid ISO 3779 check digit, which is verified in the UI.

**Seeded scenarios** (discrepancy IDs may shift slightly because history is simulated up to "now")

| Scenario | Where | Outcome |
| --- | --- | --- |
| CMM deviation UB-101 X = 0.92 mm | Body #4, OP40 | Major → hold → **Use As Is** (engineering deviation) |
| Door flush out of spec | Body #7, OP30 | Rework → re-measured → verified |
| Sealer bead too narrow | Body #10, OP20 | Rework done, **pending verification** (blocks body release) |
| Oil seep at turbo banjo on hot test | Engine #3, OP60 | Major → Repair → verified |
| Exhaust valve lash | Engine #5, OP30 | Rework → verified |
| Cylinder 3 compression 1080 kPa | Engine #9, OP50 | Major, **open, on hold**, awaiting MRB |
| RR wheel-nut under-torque | Vehicle #2, OP30 | Major → rework → verified |
| Driver airbag scanned into passenger slot | Vehicle #3, OP40 | Scan rejected → DR → kitting fix → verified |
| Tail-lamp water leak | Vehicle #5, OP70 | Repair → verified |
| Cosmetic scuff | Vehicle #7, OP40 | **Open**; blocks the final-audit gate |
| Cracked pretensioner at receiving | Supplier | Return to Vendor |
| Supplier alert on piston lot L260902-118 | Supplier | **Lot hold open**; where-used traces affected engines/vehicles |

---

## Project layout

```
index.html            app shell (loads css + js in order)
css/app.css           design tokens (light + dark), components, responsive rules
js/util.js            formatting, PRNG, hashing, VIN check digit, formula parser/evaluator
js/master.js          plant layout, personnel, parts, BOMs, routings, baseline quality plans
js/engine.js          MES/QMS domain engine (all state changes and rules)
js/seed.js            discrete-event simulation that generates plant history via the engine
js/ui.js              router, event delegation, modals, e-signature dialog, charts, shared components
js/views-prod.js      dashboard, jobs, dispatch, station terminal
js/views-quality.js   quality plans + editor, discrepancies, holds, test records, inspection log
js/views-trace.js     inventory, movements, genealogy, as-built record, items, personnel, audit
js/app.js             boot
server.js             zero-dependency static server
tools/build-single.js bundles everything into dist/ridgeline-mes.html
tools/smoke-test.js   headless test: seeds, renders every view, drives the core workflows
```

## Tests

```
npm test
```

This runs 266 checks headlessly in Node. It seeds the plant, renders every view and record page, builds an
engine end to end, runs an out-of-tolerance → DR → hold → MRB → rework → verify loop, authors and releases
a plan revision, and exercises receiving and moves, the final-release gate and persistence.

## Prototype limits

This is a demo. Authentication is a user picker with a shared PIN, data lives in one browser's
`localStorage`, and e-signature hashes are illustrative (not cryptographic). There is no integration
with ERP/PLM or real equipment. The engine is written so these could be swapped for a backend API without
touching the views.
