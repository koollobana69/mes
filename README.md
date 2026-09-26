# Ridgeline MES: Oracle JET (Redwood) MES + QMS prototype

An interactive, fully working prototype of a manufacturing execution system with an integrated quality
management system, built with **Oracle JET 21** and the **Redwood** theme. It models a fictional vehicle maker,
**Ridgeline Motor Works**, building the *Trailhand T1* crew-cab pickup across four buildings.

Three production jobs run side by side: a 6-operation body shop, a 6-operation engine line, and a
**29-operation final assembly line**. The final line covers the instrument panel, cluster, center console,
infotainment, steering column and wheel, powertrain decking, suspension, glass, doors, front and rear seats,
restraints, exterior lighting and indicators, bumpers and radar, fluids, module flashing, and four test
cells. Each assembly item has a quality plan that ties its routing steps to checklists, serial validation,
measurements, calculations and e-signed sign-offs. Every defect becomes a discrepancy that runs through MRB
disposition, rework and verification.

On first load the app seeds about 12 days of plant history by running a discrete-event simulation **through
the same engine the UI uses**. Every reading, discrepancy, hold, signature, material move and genealogy link
is therefore consistent.

---

## Quick start

Requirements: **Node 18+** and internet access to the npm registry for the first install.

```bash
npm install      # installs Oracle JET 21.0.1 and copies its runtime into ./libs (postinstall)
npm start        # serves the app at http://localhost:8080  (or: node server.js 3000)
```

Open http://localhost:8080. Any static web server works once `libs/` exists, for example
`python3 -m http.server 8080`. The app needs to be served over HTTP; opening `index.html` from `file://`
won't work, because RequireJS loads JET modules and views with XHR.

Data is saved in your browser's `localStorage`. **Reset demo data** (bottom of the navigation drawer)
rebuilds the seeded history anchored to the current time.

To load JET from a different location (for example an internal CDN mirror of the same `libs/` layout), set
`window.MES_JET_BASE = 'https://…/libs/'` before `js/main.js` in `index.html`.

### Tests

```bash
npm test          # 346 headless engine checks, including a full 29-operation vehicle build
npm run test:ui   # 43 browser checks against the real JET screens (needs Playwright + Chromium)
```

`test:ui` starts its own server, then drives the UI: navigation, role-based menus and redirects, user switching, an out-of-tolerance reading
with the live tolerance message, MRB disposition through the e-signature dialog (wrong PIN rejected),
re-inspection, verify and close, sign-off, operation completion, adding a calculation to a draft quality
plan, releasing the plan, and a render check of every screen.

### Demo users and role-based views

Switch users with the selector in the header; switching user signs that person in and opens their home
screen. **Every PIN is `1234`.** The app opens as the supervisor, Linda Park, who sees everything.

Everyone else sees only what their job needs. Their home screen is **My Work**, an inbox of things they can
act on now, each with one action button:

| Role | Navigation | My Work shows |
| --- | --- | --- |
| Operator | My Work, Station Terminal (their qualified stations only) | Units in progress and ready to start at their stations (not held, material at line-side, station free), and rework to re-inspect. Blocked units are summarised, not listed. |
| Quality Technician | + Discrepancies, Test Records, Inspection Log | The above for test/inspection stations, plus *Verified* sign-offs waiting on them |
| Material Handler | My Work, Dispatch, Inventory, Movements | Line-side shortages with the stock to pick and a one-click Move |
| Quality Engineer | + Dashboard, Plans, Holds, Genealogy, Audit | DRs awaiting MRB or verification, *Approved* sign-offs, their draft plans |
| Supervisor | Everything | Work at their stations plus all of the above |

For operators the station terminal is decluttered:
- No "recently completed" list and no traveler link.
- The long operation strip becomes a progress line.
- Lot material collapses to a one-line note unless something is short.
- Plan items already done are hidden behind "Show completed items".
- Sign-offs they can't give read "Waiting for Quality Engineer" instead of showing a button.

| People | Role | Can do |
| --- | --- | --- |
| Maria Delgado, Jamal Pierce | Operator, Body Shop (B10) | Run qualified stations, record inspections, sign *Performed* |
| Tran Nguyen, Olivia Hart, Ken Watanabe | Operator, Powertrain (B20) | 〃 |
| Dmitri Volkov, Aisha Rahman (Trim 1/2), Grace Kim, Omar Haddad (Chassis), Luis Ortega, Hannah Weiss (Trim 2/Final), Carlos Mendes (Final/Test) | Operator, Final Assembly (B30) | 〃 |
| Rosa Jimenez, Tom Becker | Material Handler | Receive, move, fulfil replenishment requests |
| Sam Ortiz | Quality Technician | CMM and test stations, sign *Verified* |
| Priya Shah, Daniel Okafor | Quality Engineer | Author and release quality plans, MRB disposition, verify and close DRs, holds |
| Linda Park, Marcus Reed | Supervisor | Run any station in their area |

---

## Oracle JET architecture

```
index.html                 Redwood applayout shell: header, oj-drawer-layout + oj-navigation-list,
                           oj-module content area, oj-messages, global e-signature and confirm oj-dialogs
css/app.css                app layout on top of Redwood; colors come from --oj-core-* tokens
js/main.js                 RequireJS config (paths into ./libs) and ojbootstrap
js/appController.js        routing (hash → oj-module via ModuleElementUtils), responsive drawer,
                           user context, toasts, e-signature and confirm services
js/services/ui.js          shared helpers: Redwood badges, formatting, oj-table models
js/services/work.js        role-aware "My Work" rules: what each person can act on right now
js/viewModels/*.js         one Knockout view model per screen (23 screens)
js/views/*.html            matching JET views
js/util.js, master.js,     domain layer (plain JS, no UI): formula engine and VIN check digit,
js/engine.js, seed.js      master data, the MES/QMS engine with every business rule, and the seed simulation
tools/copy-jet-libs.js     copies the JET runtime from node_modules into ./libs (postinstall)
tools/smoke-test.js        headless engine test          tools/ui-test.js   Playwright UI test
server.js                  zero-dependency static server
```

JET components used: `oj-drawer-layout`, `oj-navigation-list`, `oj-module`, `oj-table` (row templates,
row actions), `oj-chart` (grouped and horizontal bar), `oj-status-meter-gauge`, `oj-train` (the DR
workflow), `oj-tree-view` with `ArrayTreeDataProvider` (genealogy), `oj-collapsible` (the 29-operation
traveler), `oj-tab-bar`, `oj-dialog`, `oj-messages`, `oj-form-layout`, `oj-input-text` (with
`messages-custom` for live tolerance feedback), `oj-input-password`, `oj-text-area`, `oj-select-single`,
`oj-button`, `oj-avatar` and `oj-progress-bar`, plus Redwood typography and badge classes.

These are JET's core components, fully Redwood-styled. Several are in JET's "maintenance" state now that
the `oj-c-*` Core Pack components exist. If you standardize on the Core Pack, the views can be migrated
screen by screen, because all logic lives in the engine and view models.

---

## 10-minute guided demo

1. **Plant Dashboard.** KPIs, a line board with one tile per operation (the 29-operation vehicle line is
   grouped by zone: Trim 1, Chassis, Trim 2, Final, Vehicle Test), output by day, FPY and test first-pass
   gauges, a discrepancy Pareto, a needs-attention list and live activity.
2. **Station Terminal.** Pick an active station and switch to a qualified operator. The terminal renders
   that operation's quality plan:
   - *Serialized components*: scan (or click a line-side serial) and **Validate**. Each scan is checked
     against the BOM position, serial mask, inventory, prior installation, holds, subassembly release and
     line-side location.
   - *In-process inspection* and *Station-end checklist*: Pass/Fail. A failure asks what was found.
   - *Measurements & calculations*: the input shows **In spec** or **Out of tolerance** as you type.
     Calculations (torque spread, brake imbalance, total toe, compression spread and so on) compute
     automatically.
   - *Sign-off*: e-signature with PIN. *Verified* and *Approved* must come from someone other than the performer.
   - **Complete** backflushes lot material, creates test records at test operations, and moves the unit on.
3. **Record an out-of-tolerance value.** A discrepancy opens automatically. Major or Critical severity places
   a **quality hold** that blocks all work on the unit.
4. **Discrepancy → MRB.** As **Priya Shah**, pick a disposition and sign. *Rework* or *Repair* releases the
   hold; a passing re-inspection moves the DR to verification, then **Verify & close**. *Use As Is*,
   *Scrap* and *Return to Vendor* close on signature.
5. **Quality Plans → QP-VEH-T1-B (Draft).** Use the **Show** navigator to jump to a zone or a single
   operation of the 29. Add, edit, reorder or remove plan items. The formula field validates live.
   **Approve & release** takes a change note and a QE signature and supersedes rev A. Units in WIP keep
   their original revision.
6. **As-Built Genealogy.** Open any VIN to get an `oj-tree-view` running from the vehicle to the body and
   engine, down to every serialized part (block, crank, head, turbo, ECM, cluster, head unit, steering
   column, seats, airbags, pretensioners, radar, battery) and every material lot. The piston lot
   `L260902-118` is on hold after a supplier alert; open it for **where-used**.
7. **As-built record (traveler).** Every operation as an `oj-collapsible`, with readings, signatures,
   tests and backflushed lots.
8. **Materials, holds, tests, inspection log and audit trail**: receive and move stock, place and release
   holds, browse test records, and see every reading, scan and signature.

---

## What's modelled

| Job | Item | Routing |
| --- | --- | --- |
| WO-26-0412 | `BIW-T1` Body-in-White | 6 ops: framing, side frame, closures, CMM, paint, body final |
| WO-26-0413 | `ENG-24T` 2.4L I4 turbo | 6 ops: block, crank/pistons, head, turbo/ECM dress, cold test, hot test |
| WO-26-0414 | `VEH-T1` Trailhand T1 pickup | **29 ops** in 5 zones, 29 stations, 37 BOM lines, 15 serialized positions, 4 test cells |

**Business rules** (all in `js/engine.js`):
- Only station-qualified people can start operations or record data. Only QEs author plans and disposition or close DRs.
- A station runs one unit at a time; held units are pulled off the station.
- Serial validation checks BOM, mask, known serial, not already installed, not held, subassembly released, and at line-side.
- A failed check, out-of-tolerance measurement or failed calculation auto-creates a DR. Major or Critical severity places a hold.
- Re-inspection is only allowed after MRB disposition. Sign-offs require all other items to be complete.
- The final operation cannot start while the unit has open discrepancies.
- Lot and serial holds block installation, backflush, and moves to non-quarantine locations.
- VINs carry a valid ISO 3779 check digit.

**Seeded scenarios**: a CMM deviation accepted *Use As Is*; door-flush and valve-lash rework; an oil seep
at hot test that was repaired; an **engine on hold** for low compression; an RR wheel-nut under-torque
that was reworked; a driver airbag scanned into the passenger slot and rejected; a tail-lamp water leak that
was repaired; an **open cosmetic DR blocking final audit**; a cracked pretensioner returned to vendor; and a
**supplier-suspect piston lot on hold**, with where-used tracing.

## Prototype limits

This is a demo. Authentication is a user picker with a shared PIN, data lives in one browser's
`localStorage`, and signature hashes are illustrative (not cryptographic). There is no ERP, PLM or equipment
integration. The engine is isolated from the UI, so it can be moved behind a REST API without changing the
views.
