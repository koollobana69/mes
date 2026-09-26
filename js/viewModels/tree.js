/* Genealogy tree for one unit, rendered with oj-tree-view. */
define(['knockout', 'services/ui', 'ojs/ojarraytreedataprovider', 'ojs/ojkeyset'], function (ko, ui, ArrayTreeDataProvider, KeySet) {
  'use strict';
  const E = ui.E;
  return function TreeVM(params) {
    const app = params.app; app.setVM(this);
    const serial = params.args[0], top = MES.unit(serial);
    const t = MES.tree(serial);
    const keys = [];
    const build = (n, isTop) => {
      const part = MES.part(n.itemId), asm = !n.leaf, u = asm ? MES.unit(n.serial) : null;
      const flags = asm ? (MES.unitHeld(n.serial) ? ui.badge('On Hold') : ui.openDrs(n.serial).length ? ui.badge('Open', 'Open DR') : '') : (DB.drs.some(d => d.compSerial === n.serial) ? ui.badge('Rework', 'DR') : '');
      const node = { id: n.serial, html: '<span class="mes-node">' + (n.slot ? '<span class="slot">' + E(n.slot) + '</span>' : '') + '<span class="sn">' + E(n.serial) + '</span><span class="pn">' + E(part.id) + ' · ' + E(part.name) + '</span>' + (u ? ui.unitState(u) : '') + flags + '</span>' };
      keys.push(node.id);
      if (asm) {
        const lots = {}; (n.lots || []).forEach(l => { const k = l.partId + '|' + l.lot; lots[k] = (lots[k] || 0) + l.qty; });
        const lotKids = Object.entries(lots).map(([k, q]) => {
          const [p, l] = k.split('|'), held = MES.activeHolds('Lot', k).length;
          return { id: 'lot:' + n.serial + ':' + k, lot: l, html: '<span class="mes-node"><span class="slot">Lot</span><span class="sn' + (held ? ' lot-held' : '') + '">' + E(l) + '</span><span class="pn">' + E(p) + ' · ' + E(MES.part(p).name) + ' · ' + U.num(q, q % 1 ? 1 : 0) + ' ' + E(MES.part(p).uom) + '</span>' + (held ? ui.badge('Hold', 'Lot on hold') : '') + '</span>' };
        });
        node.children = n.children.map(c => build(c)).concat(lotKids.length ? [{ id: 'lots:' + n.serial, html: '<span class="mes-node"><span class="slot">Lot-controlled material</span><span class="pn">' + lotKids.length + ' lots</span></span>', children: lotKids }] : []);
        if (isTop || n.children.length) keys.push('lots:' + n.serial);
      }
      return node;
    };
    const root = build(t, true);
    this.treeDP = new ArrayTreeDataProvider([root], { keyAttributes: 'id', childrenAttribute: 'children' });
    this.expanded = new KeySet.KeySetImpl(keys.filter(k => !k.startsWith('lots:')).concat([serial]));
    this.serial = serial;
    this.title = top.itemId === 'VEH-T1' ? 'VIN ' + serial : serial;
    this.eyebrow = 'As-built genealogy · ' + MES.part(top.itemId).name;
    this.sub = top.itemId === 'VEH-T1' ? 'VIN check digit ' + (U.vinValid(serial) ? '✓ valid' : '✕ invalid') + ' · ' + (top.status === 'Complete' ? 'released ' + U.fmtDT(top.completedAt) : 'in WIP at OP' + MES.currentOp(top).seq + ' of ' + MES.routing(top.itemId).length) : (top.parent ? 'Installed in ' + top.parent : 'Not yet installed');
    this.recordHref = '#/unit/' + serial;

    const st = app.st('tree:' + serial, { node: serial });
    this.current = ko.observable(st.node);
    this.currentChanged = (e) => { if (e.detail.value) { st.node = e.detail.value; this.current(e.detail.value); } };
    this.detailTitle = ko.pureComputed(() => 'Selected: ' + String(this.current()).replace(/^lots?:[^:]*:?/, ''));
    this.detailHtml = ko.pureComputed(() => {
      const sel = this.current();
      if (String(sel).startsWith('lot:')) {
        const [, , k] = sel.split(':'), [p, l] = k.split('|');
        const hits = MES.whereUsed(l);
        return ui.kv([['Lot', '<b class="mes-mono">' + E(l) + '</b>'], ['Part', '<span class="mes-mono">' + E(p) + '</span> ' + E(MES.part(p).name)], ['Supplier', E(MES.part(p).supplier || '—')],
          ['Hold', MES.activeHolds('Lot', k).length ? ui.badge('Hold', 'On quality hold') : 'None'], ['Used in', hits.length + ' installations, ' + new Set(hits.map(h => h.top)).size + ' top-level units']]) +
          '<div style="margin-top:12px">' + ui.link('genealogy/' + l, 'Where-used for this lot', 'oj-link') + '</div>';
      }
      if (String(sel).startsWith('lots:')) return '<div class="oj-text-color-secondary">Select a lot to see its details.</div>';
      const su = MES.unit(sel);
      if (su) {
        const drs = DB.drs.filter(d => d.serial === sel), tests = DB.tests.filter(x => x.serial === sel), sigs = DB.sigs.filter(s => s.ctxType === 'Operation' && s.ctx.startsWith(sel + '|'));
        return ui.kv([['Serial', '<b class="mes-mono">' + E(sel) + '</b>'], ['Item', E(su.itemId) + ' · ' + E(MES.part(su.itemId).name)], ['State', ui.unitState(su)],
          ['Job / plan', E(su.jobId) + ' · ' + ui.link('plan/' + su.planId, E(su.planId))], ['Built', U.fmtDT(su.launchedAt) + ' → ' + U.fmtDT(su.completedAt)],
          su.parent ? ['Installed in', ui.serial(su.parent)] : null, ['Inspection records', MES.results(sel).length + ' readings · ' + sigs.length + ' sign-offs'],
          ['Tests', tests.length ? tests.map(x => ui.link('test/' + x.id, E(x.testType)) + ' ' + ui.badge(x.result)).join('<br>') : '—'],
          ['Discrepancies', drs.length ? drs.map(d => ui.drLink(d.id) + ' ' + ui.badge(d.status)).join('<br>') : 'None']]) +
          '<div style="margin-top:12px">' + ui.link('unit/' + sel, 'Full as-built record') + '</div>';
      }
      const rec = DB.inv.find(i => i.serial === sel);
      if (!rec) return '<div class="oj-text-color-secondary">No record.</div>';
      const part = MES.part(rec.partId), host = DB.units.find(x => x.components.some(c => c.serial === sel)), c = host && host.components.find(x => x.serial === sel);
      const att = DB.attempts.filter(a => a.scanned === sel);
      return ui.kv([['Serial', '<b class="mes-mono">' + E(sel) + '</b>'], ['Part', '<span class="mes-mono">' + E(part.id) + '</span> ' + E(part.name)], ['Supplier', E(part.supplier || '—')],
        ['Received', U.fmtDT(rec.receivedAt) + ' · ' + E(rec.source || '')],
        host ? ['Installed', ui.serial(host.serial) + ' · ' + E(c.slot) + ' at OP' + c.seq + '<div class="oj-typography-body-xs oj-text-color-secondary">' + U.fmtDT(c.at) + ' by ' + E(MES.userName(c.by)) + '</div>'] : null,
        ['Scan history', att.map(a => (a.ok ? '✓ ' : '✕ ') + U.fmtDT(a.at) + ' ' + E(a.serial) + (a.ok ? '' : ' — ' + E(a.msg))).join('<br>') || '—'],
        ['Discrepancies', DB.drs.filter(d => d.compSerial === sel).map(d => ui.drLink(d.id)).join(', ') || 'None']]);
    });
  };
});
