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

    step('Guided station: out-of-tolerance reading');
    const pick = await page.evaluate(() => {
      const u = DB.units.find(x => x.status === 'In Process' && !MES.unitHeld(x.serial) && MES.currentOp(x) && x.opIdx < MES.routing(x.itemId).length - 1 &&
        MES.planChars(MES.plan(x.planId), MES.currentOp(x).seq).some(c => c.type === 'measure' && MES.charState(x, MES.currentOp(x).seq, c).state === 'pending') &&
        !MES.planChars(MES.plan(x.planId), MES.currentOp(x).seq).some(c => c.type === 'serial' && MES.charState(x, MES.currentOp(x).seq, c).state !== 'done'));
      const op = MES.currentOp(u);
      const m = MES.planChars(MES.plan(u.planId), op.seq).find(c => c.type === 'measure' && MES.charState(u, op.seq, c).state === 'pending');
      return { serial: u.serial, st: op.station, seq: op.seq, mid: m.id, lsl: m.lsl, usl: m.usl, who: DB.people.find(p => p.role === 'Operator' && p.quals.includes(op.station)).id };
    });
    await setSelect('#usersel', pick.who); await settle(900);
    ok((await toast()).startsWith('Signed in as'), 'user switch via oj-select-single');
    await page.evaluate(() => { const el = document.getElementById('gsearch'); el.value = ''; });
    await page.fill('#gsearch input', pick.serial); await page.press('#gsearch input', 'Enter'); await settle(1100);
    ok((await page.evaluate(() => location.hash)) === '#/station/' + pick.st + '/' + pick.serial, 'scanning a serial opens it at the operator\'s station');
    ok(await page.$('.mes-stepcard') !== null, 'one step card shows the next thing to do');
    await page.click('li.mes-step[data-id="' + pick.mid + '"]'); await settle(1000);
    ok(await page.evaluate(id => document.querySelector('li.mes-step.current') && document.querySelector('li.mes-step.current').getAttribute('data-id') === id, pick.mid), 'clicking a step makes it the current step');
    const bad = pick.usl + Math.max(1, (pick.usl - pick.lsl)) * 0.5;
    await page.fill('#stepInput input', String(bad)); await settle(250);
    const live = await page.evaluate(() => (document.getElementById('stepInput').messagesCustom || []).map(m => m.summary).join(','));
    ok(/Out of tolerance/.test(live), 'live out-of-tolerance message while typing (' + live + ')');
    await page.press('#stepInput input', 'Enter'); await settle(1100);
    const lastMsg = await page.textContent('.mes-last').catch(() => '');
    ok(/out of tolerance/.test(lastMsg), 'inline result explains the failure: ' + lastMsg.trim().slice(0, 90));
    const drId = await page.evaluate(p0 => MES.latest(p0.serial, p0.seq, p0.mid).drId, pick);
    ok(!!drId, 'discrepancy auto-created');

    step('MRB disposition with decision cards');
    await setSelect('#usersel', 'U302'); await settle(900);
    ok((await page.$$eval('.mes-work-item', n => n.map(x => x.textContent).join(' '))).includes(drId), 'the new DR is in the engineer\'s My Work');
    await go('dr/' + drId);
    await page.click('button.mes-disp[data-v="Rework"]'); await settle(200);
    ok(/Sign: Rework/.test(await page.textContent('#signDisp')), 'button names the chosen disposition');
    await page.fill('oj-text-area[label-hint="Root cause (required)"] textarea', 'Gauge offset after tool change; re-zeroed and re-measured');
    await page.keyboard.press('Tab'); await settle(200);
    await page.click('#signDisp');
    await sign('0000');
    ok(/PIN does not match/.test(await page.textContent('#sigDialog')), 'wrong PIN rejected in dialog');
    await sign('1234');
    ok(await page.evaluate(id => MES.dr(id).status, drId) === 'Rework', 'DR in rework');

    step('Operator re-inspects from My Work and finishes the operation');
    await setSelect('#usersel', pick.who); await settle(900);
    ok((await page.$$eval('.mes-work-item', n => n.map(x => x.textContent).join(' '))).includes(drId), 'rework shows in the operator\'s My Work');
    await go('station/' + pick.st + '/' + pick.serial);
    await page.click('li.mes-step[data-id="' + pick.mid + '"]'); await settle(900);
    const nominal = await page.evaluate(p0 => { const u = MES.unit(p0.serial); return MES.findChar(MES.plan(u.planId), p0.mid).nominal; }, pick);
    await page.fill('#stepInput input', String(nominal)); await page.press('#stepInput input', 'Enter'); await settle(1100);
    ok(await page.evaluate(id => MES.dr(id).status, drId) === 'Pending Verification', 'passing re-inspection moves DR to verification');
    await setSelect('#usersel', 'U302'); await settle(900);
    await go('dr/' + drId);
    await page.click('oj-button:has-text("Verify")');
    await sign('1234');
    ok(await page.evaluate(id => MES.dr(id).status, drId) === 'Closed', 'DR verified & closed');
    await setSelect('#usersel', pick.who); await settle(900);
    await go('station/' + pick.st + '/' + pick.serial);
    let completed = false;
    for (let k = 0; k < 20 && !completed; k++) {
      if (await page.$('#stepPass')) { await page.click('#stepPass'); await settle(900); continue; }
      if (await page.$('.mes-stepcard.k-measure')) {
        const cid = await page.getAttribute('li.mes-step.current', 'data-id');
        const nom = await page.evaluate(([s0, id]) => { const u = MES.unit(s0); return MES.findChar(MES.plan(u.planId), id).nominal; }, [pick.serial, cid]);
        await page.fill('#stepInput input', String(nom)); await page.press('#stepInput input', 'Enter'); await settle(1000); continue;
      }
      if (await page.$('#stepSign')) {
        await page.click('#stepSign');
        const signer = await page.evaluate(() => { const s1 = MES.eligibleSigners(require('appController').sig.role()); const perf = DB.sigs.slice(-3).map(x => x.userId); return (s1.find(p => !perf.includes(p.id)) || s1[0]).id; });
        await page.evaluate(v => { document.getElementById('sigSigner').value = v; }, signer);
        await sign('1234'); await settle(900); continue;
      }
      if (await page.$('#completeOp')) { await page.click('#completeOp'); await settle(900); continue; }
      completed = true;
    }
    const seqAfter = await page.evaluate(s0 => { const u = MES.unit(s0); return u.status === 'Complete' ? 999 : MES.currentOp(u).seq; }, pick.serial);
    ok(seqAfter > pick.seq, 'step card drove the operation to completion (OP' + pick.seq + ' → ' + (seqAfter === 999 ? 'released' : 'OP' + seqAfter) + ')');

    step('Start from My Work starts the job');
    const nextPick = await page.evaluate(() => { const w = require('services/work'); const o = DB.people.filter(x => x.role === 'Operator').find(x => w.items(x).some(i => i.group === 'start')); return o && o.id; });
    if (nextPick) {
      await setSelect('#usersel', nextPick); await settle(1000);
      await go('mywork');
      const target = await page.getAttribute('.mes-work-item oj-button[data-act="start"]', 'data-serial');
      await page.click('.mes-work-item oj-button[data-act="start"]'); await settle(1200);
      ok(await page.evaluate(s0 => { const u = MES.unit(s0); return u.ops[MES.currentOp(u).seq].status === 'Active'; }, target), 'My Work Start button started the operation');
      ok(await page.$('.mes-stepcard') !== null && !(await page.$('#stepStart')), 'lands on the first step, not on another Start button');
    }

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
