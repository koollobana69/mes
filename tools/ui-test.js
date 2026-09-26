#!/usr/bin/env node
/* Browser test of the Oracle JET UI (needs Playwright + Chromium):
     npm run test:ui            (starts the local server on a free port)
   Drives the real screens: navigation, user switching, station execution with an out-of-tolerance
   reading, MRB disposition via the e-signature dialog, re-inspection, verification, sign-off,
   completion, and plan authoring + release. */
'use strict';
const path = require('path');
const { spawn } = require('child_process');

function loadPlaywright() {
  const tries = ['playwright', path.join(process.env.NPM_ROOT || '', 'playwright')];
  try { tries.push(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright')); } catch (e) { /* ignore */ }
  for (const t of tries) { try { return require(t); } catch (e) { /* next */ } }
  console.error('Playwright not found. Install it with: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

(async () => {
  const { chromium } = loadPlaywright();
  const port = 8900 + Math.floor(Math.random() * 90);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), String(port)], { stdio: 'ignore' });
  const base = 'http://localhost:' + port + '/';
  await new Promise(r => setTimeout(r, 700));
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/CERT|favicon|net::/.test(m.text())) errors.push(m.text()); });
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✕ ' + m); } };
  const step = s => console.log('• ' + s);
  const settle = (ms) => page.waitForTimeout(ms || 500);
  const toast = async () => { await settle(350); return page.evaluate(() => { const m = require('appController').messages(); return m.length ? m[m.length - 1].summary : ''; }); };
  const setSelect = (sel, v) => page.evaluate(([s, val]) => { document.querySelector(s).value = val; }, [sel, v]);
  const clickEnabled = async (sel) => {
    const i = await page.$$eval(sel, n => n.findIndex(x => !x.disabled));
    if (i < 0) return false;
    await page.locator(sel).nth(i).click();
    return true;
  };
  const go = async r => { await page.evaluate(x => { location.hash = '#/' + x; }, r); await settle(900); };
  const sign = async (pin) => { await page.waitForSelector('#sigPin input', { state: 'visible' }); await page.fill('#sigPin input', pin); await page.click('#sigSubmit'); await settle(600); };

  try {
    step('Boot and seed');
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.require && require.defined && require.defined('appController'), null, { timeout: 30000 });
    await settle(1200);
    ok(/Plant Dashboard/.test(await page.textContent('#content h1')), 'dashboard renders');
    ok(await page.$$eval('#content .mes-stn', n => n.length) >= 40, 'line board shows every operation tile');

    step('Navigation drawer');
    await page.click('oj-navigation-list li#drs');
    await settle(900);
    ok((await page.evaluate(() => location.hash)) === '#/drs', 'nav list navigates to Discrepancies');
    await go('dr/DR-26-0001');
    ok((await page.evaluate(() => location.hash)) === '#/dr/DR-26-0001', 'detail route is not overridden by nav selection');

    step('Role-based views');
    await setSelect('#usersel', 'U106'); await settle(1100);
    ok((await page.evaluate(() => location.hash)) === '#/mywork', 'operator lands on My Work');
    const opNav = await page.$$eval('oj-navigation-list li', n => n.map(x => x.id));
    ok(opNav.join(',') === 'mywork,station', 'operator sees only My Work and Station Terminal (' + opNav.join(',') + ')');
    await go('inventory');
    ok((await page.evaluate(() => location.hash)) === '#/mywork', 'operator is redirected away from Inventory');
    await setSelect('#usersel', 'U201'); await settle(1100);
    ok((await page.$$eval('oj-navigation-list li', n => n.map(x => x.id))).join(',') === 'mywork,dispatch,inventory,moves', 'material handler sees material menus only');
    await setSelect('#usersel', 'U302'); await settle(1100);
    const qeItems = await page.$$eval('.mes-work-item', n => n.length);
    ok(qeItems > 0, 'quality engineer My Work lists actionable items (' + qeItems + ')');
    await setSelect('#usersel', 'U401'); await settle(1100);
    ok((await page.evaluate(() => location.hash)) === '#/dashboard', 'supervisor lands on the dashboard');

    step('Station execution with an out-of-tolerance reading');
    const pick = await page.evaluate(() => {
      const u = DB.units.find(x => x.status === 'In Process' && !MES.unitHeld(x.serial) && MES.currentOp(x) && x.opIdx < MES.routing(x.itemId).length - 1 &&
        MES.planChars(MES.plan(x.planId), MES.currentOp(x).seq).some(c => c.type === 'measure' && MES.charState(x, MES.currentOp(x).seq, c).state === 'pending') &&
        !MES.planChars(MES.plan(x.planId), MES.currentOp(x).seq).some(c => c.type === 'serial' && MES.charState(x, MES.currentOp(x).seq, c).state !== 'done'));
      const op = MES.currentOp(u);
      return { serial: u.serial, st: op.station, who: DB.people.find(p => p.role === 'Operator' && p.quals.includes(op.station)).id };
    });
    await setSelect('#usersel', pick.who); await settle(900);
    ok((await toast()).startsWith('Signed in as'), 'user switch via oj-select-single');
    await go('station/' + pick.st + '/' + pick.serial);
    const meas = await page.$$eval('oj-input-text[data-enter="record"]', n => n.map(x => ({ id: x.getAttribute('data-id') })));
    ok(meas.length > 0, 'pending measurement inputs rendered');
    const spec = await page.evaluate(([s, id]) => { const u = MES.unit(s); const c = MES.findChar(MES.plan(u.planId), id); return { lsl: c.lsl, usl: c.usl }; }, [pick.serial, meas[0].id]);
    const bad = spec.usl + Math.max(1, (spec.usl - spec.lsl)) * 0.5;
    await page.fill('oj-input-text[data-id="' + meas[0].id + '"] input', String(bad));
    await settle(200);
    const live = await page.evaluate(id => { const el = document.querySelector('oj-input-text[data-id="' + id + '"]'); return (el.messagesCustom || []).map(m => m.summary).join(','); }, meas[0].id);
    ok(/Out of tolerance/.test(live), 'live out-of-tolerance message while typing (' + live + ')');
    await page.click('oj-button[data-act="record"][data-id="' + meas[0].id + '"]');
    const t1 = await toast();
    ok(/out of tolerance/.test(t1), 'out-of-tolerance toast: ' + t1);
    const drId = await page.evaluate(([s, id]) => MES.latest(s, MES.currentOp(MES.unit(s)).seq, id).drId, [pick.serial, meas[0].id]);
    ok(!!drId, 'discrepancy auto-created');

    step('MRB disposition through the e-signature dialog');
    await setSelect('#usersel', 'U302'); await settle(900);
    await go('dr/' + drId);
    await page.evaluate(() => { document.querySelector('oj-select-single[label-hint="Disposition"]').value = 'Rework'; });
    await page.fill('oj-text-area[label-hint="Root cause"] textarea', 'Gauge offset after tool change; re-zeroed and re-measured');
    await settle(200);
    await page.click('oj-button:has-text("Sign disposition")');
    await sign('0000');
    ok(/PIN does not match/.test(await page.textContent('#sigDialog')), 'wrong PIN rejected in dialog');
    await sign('1234');
    ok(/dispositioned/.test(await toast()), 'disposition signed');
    ok(await page.evaluate(id => MES.dr(id).status, drId) === 'Rework', 'DR in rework');

    step('Re-inspect, verify & close, sign off and complete');
    await setSelect('#usersel', pick.who); await settle(900);
    await go('station/' + pick.st + '/' + pick.serial);
    const recordAll = async () => {
      for (let k = 0; k < 10; k++) {
        const ids = await page.$$eval('oj-input-text[data-enter="record"]', n => n.map(x => x.getAttribute('data-id')));
        if (!ids.length) break;
        const sp = await page.evaluate(([s, id]) => { const u = MES.unit(s); const c = MES.findChar(MES.plan(u.planId), id); return c.nominal; }, [pick.serial, ids[0]]);
        await page.fill('oj-input-text[data-id="' + ids[0] + '"] input', String(sp));
        await page.click('oj-button[data-act="record"][data-id="' + ids[0] + '"]');
        await settle(700);
      }
    };
    await recordAll();
    ok(await page.evaluate(id => MES.dr(id).status, drId) === 'Pending Verification', 'passing re-inspection moves DR to verification');
    for (let k = 0; k < 6; k++) { if (!(await clickEnabled('oj-button[data-act="pass"]'))) break; await settle(700); }
    await setSelect('#usersel', 'U302'); await settle(900);
    await go('dr/' + drId);
    await page.click('oj-button:has-text("Verify")');
    await sign('1234');
    ok(await page.evaluate(id => MES.dr(id).status, drId) === 'Closed', 'DR verified & closed');
    await setSelect('#usersel', pick.who); await settle(900);
    await go('station/' + pick.st + '/' + pick.serial);
    for (let k = 0; k < 3; k++) {
      if (!(await clickEnabled('oj-button[data-act="sign"]'))) break;
      const signer = await page.evaluate(() => { const s = MES.eligibleSigners(require('appController').sig.role()); const perf = DB.sigs.slice(-3).map(x => x.userId); return (s.find(p => !perf.includes(p.id)) || s[0]).id; });
      await page.evaluate(v => { document.getElementById('sigSigner').value = v; }, signer);
      await sign('1234');
      const err = await page.evaluate(() => { const d = document.getElementById('sigDialog'); return d.isOpen() ? require('appController').sig.error() : ''; });
      if (err) { console.log('    sign error: ' + err); await page.evaluate(() => document.getElementById('sigDialog').close()); }
    }
    const seqBefore = await page.evaluate(s => MES.currentOp(MES.unit(s)).seq, pick.serial);
    await page.click('#completeOp');
    await settle(900);
    const seqAfter = await page.evaluate(s => { const u = MES.unit(s); return u.status === 'Complete' ? 'done' : MES.currentOp(u).seq; }, pick.serial);
    ok(seqAfter !== seqBefore, 'operation completed (OP' + seqBefore + ' → ' + seqAfter + ')' + (seqAfter === seqBefore ? ' blockers: ' + JSON.stringify(await page.evaluate(s => { const u = MES.unit(s); return MES.opBlockers(u, MES.currentOp(u).seq).concat(MES.unitHeld(s) ? ['HELD'] : [], [u.ops[MES.currentOp(u).seq].status]); }, pick.serial)) : ''));

    step('Quality plan authoring and release');
    await setSelect('#usersel', 'U302'); await settle(900);
    await go('plan/QP-VEH-T1-B');
    await page.evaluate(() => { document.querySelector('oj-select-single[label-hint="Show"]').value = 'op:220'; });
    await settle(500);
    ok(await page.$$eval('#content .mes-optitle .seq', n => n.length) === 1, 'operation navigator filters to one operation');
    await page.click('oj-button[data-act="char-add"][data-seq="220"]');
    await page.waitForSelector('#charDialog', { state: 'visible' });
    await page.evaluate(() => { document.querySelector('#charDialog oj-select-single[label-hint="Type"]').value = 'calc'; });
    await settle(300);
    await page.fill('#cfName input', 'Total fluid fill');
    await page.fill('#charDialog oj-input-text[label-hint="Formula"] input', 'C1 + C2');
    await page.fill('#charDialog oj-input-text[label-hint="Unit"] input', 'L');
    await page.fill('#charDialog oj-input-text[label-hint="Lower limit (LSL)"] input', '10.5');
    await page.fill('#charDialog oj-input-text[label-hint="Upper limit (USL)"] input', '11.45');
    await page.keyboard.press('Tab');
    await settle(300);
    await page.click('#charDialog oj-button:has-text("Add to plan")');
    ok(/added to OP220/.test(await toast()), 'calculation added to plan');
    await page.click('oj-button:has-text("Approve")');
    await page.fill('#sigDialog oj-text-area textarea', 'Adds hazard lamp current and fluid total (ECN-T1-0217)');
    await sign('1234');
    ok(await page.evaluate(() => MES.plan('QP-VEH-T1-B').status) === 'Released', 'plan rev B released with e-signature');

    step('Every screen renders');
    await setSelect('#usersel', 'U401'); await settle(1100);
    for (const r of ['dashboard', 'jobs', 'job/WO-26-0414', 'dispatch', 'station', 'plans', 'drs', 'holds', 'tests', 'inspections', 'inventory', 'moves', 'genealogy', 'genealogy/L260902-118', 'items', 'item/VEH-T1', 'people', 'audit']) {
      await go(r);
      const h = await page.textContent('#content h1').catch(() => '');
      ok(h && !/not found/i.test(h), 'screen ' + r + ' → ' + h);
    }
  } catch (e) {
    fail++; console.log('  ✕ exception: ' + e.message.split('\n').slice(0, 3).join(' '));
    if (process.env.UI_SHOT) await page.screenshot({ path: process.env.UI_SHOT });
  }
  ok(errors.length === 0, 'no page errors: ' + errors.slice(0, 3).join(' | '));
  await browser.close();
  srv.kill();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
