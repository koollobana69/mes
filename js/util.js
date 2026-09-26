/* Ridgeline MES — shared utilities: formatting, PRNG, hashing, formula engine, VIN check digit. */
'use strict';

const U = {
  esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  pad(n, w) { return String(n).padStart(w, '0'); },

  fmtDT(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  },
  fmtD(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },
  fmtT(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  },
  ago(ts) {
    if (!ts) return '—';
    const m = Math.round((MES.now() - ts) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60);
    if (h < 36) return h + ' h ago';
    return Math.round(h / 24) + ' d ago';
  },
  dur(ms) {
    if (ms == null || ms < 0) return '—';
    const m = Math.round(ms / 60000);
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + ' h ' + (m % 60) + ' m';
  },
  num(v, dec) {
    if (v === null || v === undefined || v === '' || isNaN(v)) return '—';
    return Number(v).toFixed(dec == null ? 2 : dec);
  },
  dayKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1, 2) + '-' + U.pad(d.getDate(), 2);
  },

  /* deterministic PRNG (mulberry32) for the seed simulation */
  rng(seed) {
    let a = seed >>> 0;
    const f = () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
    f.pick = arr => arr[Math.floor(f() * arr.length)];
    f.norm = () => { let s = 0; for (let i = 0; i < 6; i++) s += f(); return (s - 3) / 1.2; };
    return f;
  },

  /* FNV-1a 64-ish hash rendered as hex, used for e-signature manifest digests */
  hash(str) {
    let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ (c + i), 2246822519) >>> 0;
    }
    return (U.pad(h1.toString(16), 8) + U.pad(h2.toString(16), 8)).toUpperCase();
  },

  /* ---------- VIN (ISO 3779 / 49 CFR 565) check digit ---------- */
  vinCheckDigit(vin) {
    const map = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
    const w = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 17; i++) {
      const ch = vin[i];
      const v = /\d/.test(ch) ? Number(ch) : map[ch];
      if (v === undefined) return null;
      sum += v * w[i];
    }
    const r = sum % 11;
    return r === 10 ? 'X' : String(r);
  },
  vinValid(vin) {
    return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) && U.vinCheckDigit(vin) === vin[8];
  },
  makeVin(seq) {
    // WMI 5RM (fictional), VDS "T1C4G2", check, year R=2027 MY, plant D, serial
    let vin = '5RMT1C4G2' + 'R' + 'D' + U.pad(seq, 6);
    vin = vin.slice(0, 8) + '0' + vin.slice(9);
    const cd = U.vinCheckDigit(vin);
    return vin.slice(0, 8) + cd + vin.slice(9);
  },
};

/* ---------- Formula engine for calculated characteristics ----------
   Grammar: expr := term (('+'|'-') term)* ; term := unary (('*'|'/') unary)* ;
            unary := '-' unary | primary ; primary := number | ref | fn '(' args ')' | '(' expr ')'
   Refs are characteristic codes in the same operation (C1, C2 ...). */
const Formula = {
  FUNCS: {
    min: (...a) => Math.min(...a),
    max: (...a) => Math.max(...a),
    avg: (...a) => a.reduce((s, x) => s + x, 0) / a.length,
    sum: (...a) => a.reduce((s, x) => s + x, 0),
    abs: x => Math.abs(x),
    sqrt: x => Math.sqrt(x),
    round: (x, d) => { const p = Math.pow(10, d || 0); return Math.round(x * p) / p; },
  },
  tokenize(src) {
    const toks = [];
    const re = /\s*(\d+\.?\d*|\.\d+|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/,])/y;
    let m, pos = 0;
    src = String(src || '');
    while (pos < src.length) {
      re.lastIndex = pos;
      m = re.exec(src);
      if (!m) {
        if (/^\s*$/.test(src.slice(pos))) break;
        throw new Error('Unexpected "' + src.slice(pos).trim()[0] + '" at position ' + (pos + 1));
      }
      toks.push(m[1]);
      pos = re.lastIndex;
    }
    return toks;
  },
  parse(src) {
    const t = Formula.tokenize(src);
    let i = 0;
    const peek = () => t[i];
    const eat = x => { if (t[i] !== x) throw new Error('Expected "' + x + '"' + (t[i] ? ' but found "' + t[i] + '"' : ' at end')); i++; };
    const expr = () => {
      let n = term();
      while (peek() === '+' || peek() === '-') { const op = t[i++]; n = { op, a: n, b: term() }; }
      return n;
    };
    const term = () => {
      let n = unary();
      while (peek() === '*' || peek() === '/') { const op = t[i++]; n = { op, a: n, b: unary() }; }
      return n;
    };
    const unary = () => {
      if (peek() === '-') { i++; return { op: 'neg', a: unary() }; }
      return primary();
    };
    const primary = () => {
      const tok = t[i++];
      if (tok === undefined) throw new Error('Formula ends unexpectedly');
      if (tok === '(') { const n = expr(); eat(')'); return n; }
      if (/^[\d.]/.test(tok)) return { num: Number(tok) };
      if (/^[A-Za-z_]/.test(tok)) {
        if (peek() === '(') {
          const fn = tok.toLowerCase();
          if (!Formula.FUNCS[fn]) throw new Error('Unknown function ' + tok + '()');
          i++;
          const args = [];
          if (peek() !== ')') { args.push(expr()); while (peek() === ',') { i++; args.push(expr()); } }
          eat(')');
          return { fn, args };
        }
        return { ref: tok.toUpperCase() };
      }
      throw new Error('Unexpected "' + tok + '"');
    };
    const tree = expr();
    if (i < t.length) throw new Error('Unexpected "' + t[i] + '"');
    return tree;
  },
  refs(src) {
    const out = new Set();
    const walk = n => {
      if (!n) return;
      if (n.ref) out.add(n.ref);
      if (n.a) walk(n.a);
      if (n.b) walk(n.b);
      if (n.args) n.args.forEach(walk);
    };
    walk(Formula.parse(src));
    return [...out];
  },
  evaluate(src, vars) {
    const ev = n => {
      if (n.num !== undefined) return n.num;
      if (n.ref) {
        if (vars[n.ref] === undefined || vars[n.ref] === null || isNaN(vars[n.ref])) throw new Error('Missing value for ' + n.ref);
        return Number(vars[n.ref]);
      }
      if (n.fn) return Formula.FUNCS[n.fn](...n.args.map(ev));
      if (n.op === 'neg') return -ev(n.a);
      const a = ev(n.a), b = ev(n.b);
      switch (n.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': if (b === 0) throw new Error('Division by zero'); return a / b;
      }
      throw new Error('Bad node');
    };
    return ev(Formula.parse(src));
  },
};
