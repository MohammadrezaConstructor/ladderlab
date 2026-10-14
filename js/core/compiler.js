/* LadderLab — project compiler.
 * Turns the tag table, Structured Text POUs and ladder programs into executable closures.
 * Type checking is IEC-flavoured but forgiving where that helps beginners (warnings instead of errors). */
(function (PLC) {
  'use strict';

  const T = PLC.types;
  const { STError } = PLC.st;

  class RuntimeFault extends Error {
    constructor(message) { super(message); this.isFault = true; }
  }

  // ---- type helpers --------------------------------------------------------
  const tcache = {};
  function elem(name) { return tcache[name] || (tcache[name] = { k: 'elem', name }); }
  const BOOL = elem('BOOL'), INT = elem('INT'), DINT = elem('DINT'), REAL = elem('REAL'),
    TIME = elem('TIME'), STRING = elem('STRING'), ANY_INT = elem('ANY_INT');

  function cat(t) {
    if (!t) return null;
    if (t.k === 'array') return 'array';
    if (t.k === 'fb') return 'fb';
    if (t.name === 'ANY_INT') return 'int';
    return T.category(t.name);
  }
  function tname(t) {
    if (!t) return '?';
    if (t.name === 'ANY_INT') return 'integer constant';
    return T.typeToString(t);
  }
  const isNumCat = c => c === 'int' || c === 'bits' || c === 'real';
  const INT_RANK = { SINT: 1, BYTE: 1, INT: 2, UINT: 2, WORD: 2, DINT: 3 };

  function commonNumeric(a, b) {
    const ca = cat(a), cb = cat(b);
    if (ca === 'real' || cb === 'real') return REAL;
    if (a.name === 'ANY_INT') return b;
    if (b.name === 'ANY_INT') return a;
    return (INT_RANK[a.name] || 2) >= (INT_RANK[b.name] || 2) ? a : b;
  }

  function levenshtein(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase();
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 3) return 99;
    const d = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return d[m][n];
  }

  function suggest(name, candidates) {
    let best = null, bestD = 99;
    for (const c of candidates) {
      const dd = levenshtein(name, c);
      if (dd < bestD) { bestD = dd; best = c; }
    }
    const limit = name.length <= 3 ? 1 : 2;
    return bestD <= limit ? best : null;
  }

  // ---- conversion functions --------------------------------------------------
  function convertValue(srcCat, dstName, v) {
    const dcat = T.category(dstName);
    if (dcat === 'string') {
      if (srcCat === 'bool') return v ? 'TRUE' : 'FALSE';
      if (srcCat === 'time') return T.formatTime(v);
      if (srcCat === 'real') return T.formatValue('REAL', v);
      return String(v);
    }
    if (srcCat === 'string') {
      if (dcat === 'bool') return /^\s*(TRUE|1)\s*$/i.test(v);
      if (dcat === 'time') { const ms = T.parseTimeLiteral(v); return ms == null ? 0 : ms; }
      const n = parseFloat(v);
      return T.coerce(dstName, isFinite(n) ? (dcat === 'real' ? n : Math.round(n)) : 0);
    }
    if (dcat === 'bool') return typeof v === 'boolean' ? v : v !== 0;
    if (typeof v === 'boolean') v = v ? 1 : 0;
    if (srcCat === 'real' && dcat !== 'real') v = Math.round(v);
    return T.coerce(dstName, v);
  }

  // ---- standard functions ----------------------------------------------------
  // check(argTypes, c) → result type (may throw); impl(args...) → value
  const STD_FUNCS = {};
  function defFn(name, params, opts) { STD_FUNCS[name] = Object.assign({ name, params }, opts); }

  const realFn = (fn) => ({
    check(ts, c) { ts.forEach((t, i) => c.requireNumeric(t, i)); return REAL; },
    impl: fn
  });
  defFn('SQRT', ['IN'], realFn(x => {
    if (x < 0) throw new RuntimeFault('SQRT of a negative number (' + x + ')');
    return Math.sqrt(x);
  }));
  defFn('LN', ['IN'], realFn(x => Math.log(x)));
  defFn('LOG', ['IN'], realFn(x => Math.log10(x)));
  defFn('EXP', ['IN'], realFn(x => Math.exp(x)));
  defFn('SIN', ['IN'], realFn(x => Math.sin(x)));
  defFn('COS', ['IN'], realFn(x => Math.cos(x)));
  defFn('TAN', ['IN'], realFn(x => Math.tan(x)));
  defFn('ASIN', ['IN'], realFn(x => Math.asin(x)));
  defFn('ACOS', ['IN'], realFn(x => Math.acos(x)));
  defFn('ATAN', ['IN'], realFn(x => Math.atan(x)));
  defFn('EXPT', ['IN1', 'IN2'], realFn((a, b) => Math.pow(a, b)));
  defFn('ABS', ['IN'], {
    check(ts, c) { c.requireNumeric(ts[0], 0, true); return ts[0]; },
    impl: x => Math.abs(x)
  });
  defFn('TRUNC', ['IN'], {
    check(ts, c) { c.requireNumeric(ts[0], 0); return DINT; },
    impl: x => Math.trunc(x)
  });
  defFn('MOVE', ['IN'], { check(ts) { return ts[0]; }, impl: x => x });
  const minmax = (fn) => ({
    variadic: 2,
    check(ts, c) { let r = ts[0]; ts.forEach((t, i) => { c.requireNumeric(t, i, true); r = c.common(r, t); }); return r; },
    impl: fn
  });
  defFn('MIN', ['IN1', 'IN2'], minmax((...a) => Math.min(...a)));
  defFn('MAX', ['IN1', 'IN2'], minmax((...a) => Math.max(...a)));
  defFn('LIMIT', ['MN', 'IN', 'MX'], {
    check(ts, c) { ts.forEach((t, i) => c.requireNumeric(t, i, true)); return c.common(c.common(ts[0], ts[1]), ts[2]); },
    impl: (mn, x, mx) => Math.min(Math.max(x, mn), mx)
  });
  defFn('SEL', ['G', 'IN0', 'IN1'], {
    check(ts, c) { c.requireBool(ts[0], 0); return c.common(ts[1], ts[2]); },
    impl: (g, a, b) => g ? b : a
  });
  defFn('MUX', ['K', 'IN0', 'IN1'], {
    variadic: 3,
    check(ts, c) {
      c.requireInt(ts[0], 0);
      let r = ts[1]; for (let i = 2; i < ts.length; i++) r = c.common(r, ts[i]);
      return r;
    },
    impl: (k, ...ins) => {
      if (k < 0 || k >= ins.length) throw new RuntimeFault('MUX selector K=' + k + ' is out of range 0..' + (ins.length - 1));
      return ins[k];
    }
  });
  const shiftFn = (fn) => ({
    check(ts, c) { c.requireInt(ts[0], 0); c.requireInt(ts[1], 1); return ts[0].name === 'ANY_INT' ? DINT : ts[0]; },
    impl: fn, needsType: true
  });
  defFn('SHL', ['IN', 'N'], shiftFn((x, n, bits) => x << n));
  defFn('SHR', ['IN', 'N'], shiftFn((x, n, bits) => bits >= 32 ? x >>> n : (x & (Math.pow(2, bits) - 1)) >>> n));
  defFn('ROL', ['IN', 'N'], shiftFn((x, n, bits) => {
    const mask = Math.pow(2, bits) - 1; x &= mask; n %= bits;
    return ((x << n) | (x >>> (bits - n))) & mask;
  }));
  defFn('ROR', ['IN', 'N'], shiftFn((x, n, bits) => {
    const mask = Math.pow(2, bits) - 1; x &= mask; n %= bits;
    return ((x >>> n) | (x << (bits - n))) & mask;
  }));
  defFn('LEN', ['IN'], { check(ts, c) { c.requireString(ts[0], 0); return INT; }, impl: s => s.length });
  defFn('CONCAT', ['IN1', 'IN2'], {
    variadic: 2, check(ts, c) { ts.forEach((t, i) => c.requireString(t, i)); return STRING; },
    impl: (...a) => a.join('')
  });
  defFn('LEFT', ['IN', 'L'], { check(ts, c) { c.requireString(ts[0], 0); c.requireInt(ts[1], 1); return STRING; }, impl: (s, l) => s.slice(0, Math.max(0, l)) });
  defFn('RIGHT', ['IN', 'L'], { check(ts, c) { c.requireString(ts[0], 0); c.requireInt(ts[1], 1); return STRING; }, impl: (s, l) => l <= 0 ? '' : s.slice(-l) });
  defFn('MID', ['IN', 'L', 'P'], { check(ts, c) { c.requireString(ts[0], 0); c.requireInt(ts[1], 1); c.requireInt(ts[2], 2); return STRING; }, impl: (s, l, p) => s.substr(Math.max(0, p - 1), Math.max(0, l)) });
  defFn('FIND', ['IN1', 'IN2'], { check(ts, c) { c.requireString(ts[0], 0); c.requireString(ts[1], 1); return INT; }, impl: (a, b) => a.indexOf(b) + 1 });

  // ---- the compiler ------------------------------------------------------------
  class Compiler {
    constructor(project, opts) {
      this.project = project;
      this.opts = opts || {};
      this.diags = [];
      this.globals = new Map();
      this.fbTypes = new Map();
      this.functions = new Map();
      this.programs = [];
      this.lineRefs = {};
      this.userFbs = [];
      this.userFns = [];
      for (const name of Object.keys(PLC.fb.defs)) {
        const d = PLC.fb.defs[name];
        this.fbTypes.set(name.toLowerCase(), { name, std: true, def: d, members: memberMap(d.members) });
      }
    }

    diag(severity, message, loc) {
      this.diags.push(Object.assign({ severity, message }, loc || {}));
    }

    // ---------------------------------------------------------------- phases
    compile() {
      const project = this.project;
      const pous = project.pous || [];
      const parsed = [];

      // 1. parse Structured Text POUs
      for (const pou of pous) {
        if (pou.lang !== 'ST') { parsed.push({ pou, ast: null }); continue; }
        try {
          const unit = PLC.st.parseUnit(pou.source || '');
          const items = unit.pous.length ? unit.pous : [unit.bare];
          parsed.push({ pou, ast: items });
        } catch (e) {
          if (!(e instanceof STError)) throw e;
          this.diag('error', e.message, { pou: pou.name, pouId: pou.id, line: e.line, col: e.col });
          parsed.push({ pou, ast: null, failed: true });
        }
      }

      // 2. register user FB types and functions
      for (const p of parsed) {
        if (!p.ast) continue;
        for (const a of p.ast) {
          if (a.kind === 'FUNCTION_BLOCK') this.registerFb(a, p.pou);
          else if (a.kind === 'FUNCTION') this.registerFn(a, p.pou);
        }
      }

      // 3. global tags
      this.buildGlobals(project.tags || []);

      // 4. lay out user FBs (members), then functions' signatures
      for (const fb of this.userFbs) this.layoutFb(fb);
      this.checkFbRecursion();
      for (const fn of this.userFns) this.layoutFn(fn);

      // 5. compile bodies
      for (const fb of this.userFbs) this.compileFbBody(fb);
      for (const fn of this.userFns) this.compileFnBody(fn);

      // 6. programs (in task order)
      for (const p of parsed) {
        const pou = p.pou;
        if (pou.lang === 'LD') {
          if (PLC.ladder) this.programs.push(PLC.ladder.compileProgram(pou, this));
          continue;
        }
        if (!p.ast) continue;
        const progAsts = p.ast.filter(a => a.kind === 'PROGRAM');
        if (progAsts.length > 1) this.diag('error', 'Only one PROGRAM per editor tab is allowed', { pou: pou.name, pouId: pou.id, line: progAsts[1].line });
        if (progAsts.length) this.programs.push(this.compileStProgram(progAsts[0], pou));
      }

      const errors = this.diags.filter(d => d.severity === 'error').length;
      return {
        ok: errors === 0,
        errors,
        diagnostics: this.diags,
        globals: Array.from(this.globals.values()),
        programs: this.programs,
        fbTypes: this.fbTypes,
        functions: this.functions,
        lineRefs: this.lineRefs,
        createMemory: (io) => this.createMemory(io),
        compileWatchExpr: (text) => this.compileStandaloneExpr(text)
      };
    }

    // ------------------------------------------------------------ registration
    checkNewName(name, loc, what) {
      if (!PLC.util.isIdentifier(name)) {
        this.diag('error', '"' + name + '" is not a valid name. Use letters, digits and single underscores, starting with a letter.', loc);
        return false;
      }
      const up = name.toUpperCase();
      if (PLC.st.KEYWORDS.has(up)) { this.diag('error', '"' + name + '" is a reserved word and cannot be used as ' + what, loc); return false; }
      if (T.isElementary(up)) { this.diag('error', '"' + name + '" is a data type name and cannot be used as ' + what, loc); return false; }
      return true;
    }

    registerFb(ast, pou) {
      const loc = { pou: pou.name, pouId: pou.id, line: ast.line };
      const key = ast.name.toLowerCase();
      if (!this.checkNewName(ast.name, loc, 'a function block name')) return;
      if (this.fbTypes.has(key) || this.functions.has(key) || STD_FUNCS[ast.name.toUpperCase()]) {
        this.diag('error', 'The name ' + ast.name + ' is already used by another function block or function', loc);
        return;
      }
      const fb = { name: ast.name, user: true, ast, pou, members: new Map(), order: [], body: null };
      this.fbTypes.set(key, fb);
      this.userFbs.push(fb);
    }

    registerFn(ast, pou) {
      const loc = { pou: pou.name, pouId: pou.id, line: ast.line };
      const key = ast.name.toLowerCase();
      if (!this.checkNewName(ast.name, loc, 'a function name')) return;
      if (this.fbTypes.has(key) || this.functions.has(key) || STD_FUNCS[ast.name.toUpperCase()]) {
        this.diag('error', 'The name ' + ast.name + ' is already used by another function block or function', loc);
        return;
      }
      const fn = { name: ast.name, user: true, ast, pou, members: new Map(), order: [], inputs: [], retType: null };
      this.functions.set(key, fn);
      this.userFns.push(fn);
    }

    // ------------------------------------------------------------ types
    resolveTypeNode(node, loc) {
      if (node.k === 'elem') return elem(node.name);
      if (node.k === 'named') {
        const fb = this.fbTypes.get(node.name.toLowerCase());
        if (fb) return { k: 'fb', name: fb.name };
        const s = suggest(node.name, Array.from(this.fbTypes.values()).map(f => f.name).concat(Object.keys(T.ELEMENTARY)));
        throw new STError('Unknown data type "' + node.name + '"' + (s ? '. Did you mean ' + s + '?' : ''), node.line, node.col);
      }
      if (node.k === 'array') {
        const scope = { pou: loc && loc.pou, locals: new Map(), kind: 'CONST' };
        const lo = this.constValue(node.lo, scope), hi = this.constValue(node.hi, scope);
        if (!Number.isInteger(lo) || !Number.isInteger(hi)) throw new STError('Array bounds must be whole numbers', node.line, node.col);
        if (hi < lo) throw new STError('Array upper bound must not be smaller than the lower bound', node.line, node.col);
        if (hi - lo > 9999) throw new STError('Arrays are limited to 10000 elements in this simulator', node.line, node.col);
        const of = this.resolveTypeNode(node.of, loc);
        if (of.k === 'array') throw new STError('Arrays of arrays are not supported', node.line, node.col);
        return { k: 'array', lo, hi, of };
      }
      throw new STError('Invalid type', node.line, node.col);
    }

    resolveTypeString(str) {
      const t = T.parseTypeString(str);
      if (!t) return null;
      if (t.k === 'fb') {
        const fb = this.fbTypes.get(t.name.toLowerCase());
        return fb ? { k: 'fb', name: fb.name } : null;
      }
      if (t.k === 'array' && t.of.k === 'fb') {
        const fb = this.fbTypes.get(t.of.name.toLowerCase());
        return fb ? { k: 'array', lo: t.lo, hi: t.hi, of: { k: 'fb', name: fb.name } } : null;
      }
      return t;
    }

    /** Create a fresh value for a type (elementary default, array, FB instance). */
    makeValue(t) {
      if (t.k === 'elem') return T.ELEMENTARY[t.name].def;
      if (t.k === 'array') {
        const a = new Array(t.hi - t.lo + 1);
        for (let i = 0; i < a.length; i++) a[i] = this.makeValue(t.of);
        return a;
      }
      if (t.k === 'fb') {
        const fb = this.fbTypes.get(t.name.toLowerCase());
        if (fb.std) return PLC.fb.create(fb.name);
        return fb.create();
      }
      return null;
    }

    // ------------------------------------------------------------ globals
    buildGlobals(tags) {
      const usedAddr = new Map();
      tags.forEach((tag, row) => {
        const loc = { tagRow: row, tag: tag.name, pou: 'Tags' };
        const name = String(tag.name || '').trim();
        if (!name) { this.diag('error', 'Tag in row ' + (row + 1) + ' has no name', loc); return; }
        if (!this.checkNewName(name, loc, 'a tag name')) return;
        const key = name.toLowerCase();
        if (this.globals.has(key)) { this.diag('error', 'Tag name "' + name + '" is used twice (names are not case-sensitive)', loc); return; }
        if (this.fbTypes.has(key) || this.functions.has(key) || STD_FUNCS[name.toUpperCase()]) {
          this.diag('error', 'Tag name "' + name + '" clashes with a function or function block of the same name', loc); return;
        }
        const type = this.resolveTypeString(tag.type);
        if (!type) {
          const s = suggest(String(tag.type || ''), Array.from(this.fbTypes.values()).map(f => f.name).concat(Object.keys(T.ELEMENTARY)));
          this.diag('error', 'Tag "' + name + '": unknown data type "' + tag.type + '"' + (s ? '. Did you mean ' + s + '?' : ''), loc);
          return;
        }
        const sym = { name, key: name, type, scope: 'global', comment: tag.comment || '', address: null, init: null, constant: false };
        if (tag.address && String(tag.address).trim()) {
          const a = T.parseAddress(tag.address);
          if (!a) { this.diag('error', 'Tag "' + name + '": invalid address "' + tag.address + '"', loc); }
          else if (type.k !== 'elem' || a.type !== (type.name === 'BOOL' ? 'BOOL' : 'INT') || (a.type === 'INT' && cat(type) !== 'int' && cat(type) !== 'bits')) {
            this.diag('error', 'Tag "' + name + '": address ' + a.text + ' needs a ' + (a.type === 'BOOL' ? 'BOOL' : 'INT') + ' tag, but the tag is ' + tname(type), loc);
          } else if (usedAddr.has(a.text)) {
            this.diag('error', 'Address ' + a.text + ' is used by both "' + usedAddr.get(a.text) + '" and "' + name + '"', loc);
          } else {
            usedAddr.set(a.text, name);
            sym.address = a;
          }
        }
        if (tag.init !== undefined && tag.init !== null && String(tag.init).trim() !== '') {
          if (type.k !== 'elem') this.diag('warning', 'Tag "' + name + '": initial values are only used for simple data types', loc);
          else {
            try {
              const e = PLC.st.parseExpression(String(tag.init));
              const v = this.constValue(e, { pou: 'Tags', locals: new Map(), kind: 'CONST' });
              const r = this.assignCheck(type, this.typeOfConst(v, e), e, loc, true);
              sym.init = r ? T.coerce(type.name, v) : null;
            } catch (e) {
              this.diag('error', 'Tag "' + name + '": initial value "' + tag.init + '" is not valid (' + e.message + ')', loc);
            }
          }
        }
        if (tag.constant) sym.constant = true;
        this.globals.set(key, sym);
      });
    }

    typeOfConst(v, e) {
      if (e && e.e === 'lit') return e.type === 'ANY_INT' ? ANY_INT : elem(e.type);
      if (typeof v === 'boolean') return BOOL;
      if (typeof v === 'string') return STRING;
      return Number.isInteger(v) ? ANY_INT : REAL;
    }

    // ------------------------------------------------------------ user FBs / functions
    layoutVarBlocks(owner, ast, allowed, loc) {
      for (const block of ast.varBlocks) {
        const sec = block.section;
        if (!allowed.includes(sec)) {
          this.diag('error', sec + ' is not allowed in a ' + ast.kind.replace('_', ' ').toLowerCase() + (sec === 'VAR_GLOBAL' ? '. Declare global variables in the Tags table.' : ''), Object.assign({}, loc, { line: block.line }));
          continue;
        }
        if (sec === 'VAR_EXTERNAL') {
          for (const v of block.vars) {
            if (!this.globals.has(v.name.toLowerCase())) this.diag('error', 'VAR_EXTERNAL ' + v.name + ': no tag with this name exists', Object.assign({}, loc, { line: v.line }));
          }
          continue;
        }
        for (const v of block.vars) {
          const vloc = Object.assign({}, loc, { line: v.line, col: v.col });
          if (!this.checkNewName(v.name, vloc, 'a variable name')) continue;
          const key = v.name.toLowerCase();
          if (owner.members.has(key)) { this.diag('error', 'Variable ' + v.name + ' is declared twice', vloc); continue; }
          let type;
          try { type = this.resolveTypeNode(v.type, vloc); } catch (e) { this.diag('error', e.message, Object.assign({}, vloc, { line: e.line || v.line })); continue; }
          const dir = sec === 'VAR_INPUT' ? 'in' : sec === 'VAR_OUTPUT' ? 'out' : sec === 'VAR_IN_OUT' ? 'inout' : 'local';
          if (dir === 'inout') { this.diag('error', 'VAR_IN_OUT is not supported in this simulator; use VAR_INPUT and VAR_OUTPUT', vloc); continue; }
          const sym = { name: v.name, key: v.name, type, scope: 'self', dir, constant: block.constant, initNode: v.init, at: v.at, line: v.line };
          if (v.at) {
            const a = T.parseAddress(v.at);
            if (ast.kind !== 'PROGRAM') this.diag('error', 'AT addresses are only allowed in a PROGRAM', vloc);
            else if (!a || type.k !== 'elem' || (a.type === 'BOOL') !== (type.name === 'BOOL')) this.diag('error', 'Address ' + v.at + ' does not fit type ' + tname(type), vloc);
            else sym.address = a;
          }
          owner.members.set(key, sym);
          owner.order.push(sym);
        }
      }
      // evaluate initial values
      for (const sym of owner.order) {
        if (!sym.initNode) continue;
        const iloc = Object.assign({}, loc, { line: sym.line });
        try {
          sym.init = this.evalInit(sym.type, sym.initNode, iloc, owner.members);
        } catch (e) {
          this.diag('error', 'Initial value of ' + sym.name + ': ' + e.message, Object.assign({}, iloc, { line: e.line || sym.line }));
        }
      }
    }

    evalInit(type, node, loc, members) {
      // earlier VAR CONSTANTs of the same POU may be used, e.g. State : INT := IDLE;
      const scope = { pou: loc.pou, locals: members || new Map(), kind: 'CONST' };
      if (node.e === 'arrinit') {
        if (type.k !== 'array') throw new STError('[...] initial values are only for arrays', node.line, node.col);
        const out = [];
        for (const it of node.items) {
          const v = this.constValue(it.value, scope);
          const times = it.repeat ? this.constValue(it.repeat, scope) : 1;
          for (let i = 0; i < times; i++) out.push(T.coerce(type.of.name, v));
        }
        const len = type.hi - type.lo + 1;
        if (out.length > len) throw new STError('Too many initial values (' + out.length + ') for an array of ' + len + ' elements', node.line, node.col);
        return out;
      }
      if (type.k !== 'elem') throw new STError('Only simple data types can have an initial value', node.line, node.col);
      const v = this.constValue(node, scope);
      this.assignCheck(type, this.typeOfConst(v, node), node, loc, true);
      return T.coerce(type.name, v);
    }

    layoutFb(fb) {
      const loc = { pou: fb.pou.name, pouId: fb.pou.id };
      this.layoutVarBlocks(fb, fb.ast, ['VAR', 'VAR_INPUT', 'VAR_OUTPUT', 'VAR_IN_OUT', 'VAR_TEMP', 'VAR_EXTERNAL'], loc);
      const self = this;
      fb.create = function () {
        const inst = { _type: fb.name };
        for (const sym of fb.order) inst[sym.key] = self.initialValue(sym);
        return inst;
      };
    }

    initialValue(sym) {
      if (sym.init !== undefined && sym.init !== null) {
        if (sym.type.k === 'array') {
          const a = this.makeValue(sym.type);
          sym.init.forEach((v, i) => { a[i] = v; });
          return a;
        }
        return sym.init;
      }
      return this.makeValue(sym.type);
    }

    checkFbRecursion() {
      const visiting = new Set(), done = new Set();
      const visit = (fb, path) => {
        if (done.has(fb)) return true;
        if (visiting.has(fb)) {
          this.diag('error', 'Function block ' + fb.name + ' contains itself (' + path.concat(fb.name).join(' → ') + ')', { pou: fb.pou.name, pouId: fb.pou.id, line: fb.ast.line });
          return false;
        }
        visiting.add(fb);
        for (const sym of fb.order) {
          const t = sym.type.k === 'array' ? sym.type.of : sym.type;
          if (t.k === 'fb') {
            const sub = this.fbTypes.get(t.name.toLowerCase());
            if (sub && sub.user && !visit(sub, path.concat(fb.name))) { fb.order = fb.order.filter(s => s !== sym); fb.members.delete(sym.key.toLowerCase()); }
          }
        }
        visiting.delete(fb);
        done.add(fb);
        return true;
      };
      for (const fb of this.userFbs) visit(fb, []);
    }

    layoutFn(fn) {
      const loc = { pou: fn.pou.name, pouId: fn.pou.id };
      try {
        fn.retType = this.resolveTypeNode(fn.ast.retType, loc);
        if (fn.retType.k !== 'elem') throw new STError('A function must return a simple data type', fn.ast.line, 1);
      } catch (e) {
        this.diag('error', e.message, Object.assign({}, loc, { line: e.line || fn.ast.line }));
        fn.retType = INT;
      }
      this.layoutVarBlocks(fn, fn.ast, ['VAR', 'VAR_INPUT', 'VAR_TEMP', 'VAR_EXTERNAL'], loc);
      fn.inputs = fn.order.filter(s => s.dir === 'in');
      const retKey = fn.name;
      if (fn.members.has(fn.name.toLowerCase())) this.diag('error', 'A variable inside function ' + fn.name + ' has the same name as the function', loc);
      fn.retSym = { name: fn.name, key: '__ret', type: fn.retType, scope: 'self', dir: 'local' };
      void retKey;
    }

    compileFbBody(fb) {
      const scope = { pou: fb.pou.name, pouId: fb.pou.id, kind: 'FUNCTION_BLOCK', locals: fb.members, owner: fb, src: fb.pou.source };
      fb.body = this.compileBlock(fb.ast.body, scope);
      const body = fb.body;
      fb.exec = function (inst, f) {
        const ctx = f.ctx;
        const savedPou = ctx.pou, savedLine = ctx.line;
        if (++ctx.depth > 32) throw new RuntimeFault('Too many nested calls (is a function block calling itself?)');
        ctx.pou = fb.pou.name;
        body({ self: inst, g: f.g, io: f.io, ctx });
        ctx.depth--;
        ctx.pou = savedPou; ctx.line = savedLine;
      };
    }

    compileFnBody(fn) {
      const locals = new Map(fn.members);
      locals.set(fn.name.toLowerCase(), fn.retSym);
      const scope = { pou: fn.pou.name, pouId: fn.pou.id, kind: 'FUNCTION', locals, owner: fn, src: fn.pou.source };
      const body = this.compileBlock(fn.ast.body, scope);
      const self = this;
      fn.invoke = function (args, f) {
        const ctx = f.ctx;
        if (++ctx.depth > 32) throw new RuntimeFault('Too many nested calls (is function ' + fn.name + ' calling itself?)');
        const frame = { __ret: T.ELEMENTARY[fn.retType.name].def };
        for (const sym of fn.order) frame[sym.key] = self.initialValue(sym);
        for (let i = 0; i < fn.inputs.length; i++) if (args[i] !== undefined) frame[fn.inputs[i].key] = args[i];
        const savedPou = ctx.pou, savedLine = ctx.line;
        ctx.pou = fn.pou.name;
        body({ self: frame, g: f.g, io: f.io, ctx });
        ctx.pou = savedPou; ctx.line = savedLine;
        ctx.depth--;
        return frame.__ret;
      };
    }

    compileStProgram(ast, pou) {
      const owner = { name: pou.name, members: new Map(), order: [] };
      const loc = { pou: pou.name, pouId: pou.id };
      this.layoutVarBlocks(owner, ast, ['VAR', 'VAR_INPUT', 'VAR_OUTPUT', 'VAR_TEMP', 'VAR_EXTERNAL'], loc);
      for (const sym of owner.order) {
        if (this.globals.has(sym.key.toLowerCase())) {
          this.diag('warning', 'Local variable ' + sym.name + ' hides the tag with the same name', Object.assign({}, loc, { line: sym.line }));
        }
      }
      const lineRefs = this.lineRefs[pou.name] = {};
      const scope = { pou: pou.name, pouId: pou.id, kind: 'PROGRAM', locals: owner.members, owner, src: pou.source || '', lineRefs };
      const body = this.compileBlock(ast.body, scope);
      const self = this;
      return {
        name: pou.name, id: pou.id, lang: 'ST', locals: owner.order,
        createInstance(io) {
          const inst = {};
          for (const sym of owner.order) {
            if (sym.address) {
              const a = sym.address, tn = sym.type.name;
              Object.defineProperty(inst, sym.key, {
                enumerable: true,
                get: () => io[a.area][a.index],
                set: v => { io[a.area][a.index] = T.coerce(tn, v); }
              });
            } else inst[sym.key] = self.initialValue(sym);
          }
          return inst;
        },
        run(ctx, mem) {
          ctx.pou = pou.name; ctx.line = 0; ctx.rung = null;
          body({ self: mem.p[pou.name], g: mem.g, io: mem.io, ctx });
        }
      };
    }

    // ------------------------------------------------------------ memory
    createMemory(io) {
      const g = {};
      for (const sym of this.globals.values()) {
        if (sym.address) {
          const a = sym.address, tn = sym.type.name;
          if (sym.init !== null && sym.init !== undefined) io[a.area][a.index] = sym.init;
          Object.defineProperty(g, sym.key, {
            enumerable: true,
            get: () => io[a.area][a.index],
            set: v => { io[a.area][a.index] = T.coerce(tn, v); }
          });
        } else {
          g[sym.key] = sym.init !== null && sym.init !== undefined ? sym.init : this.makeValue(sym.type);
        }
      }
      const p = {};
      for (const prog of this.programs) if (prog.createInstance) p[prog.name] = prog.createInstance(io);
      return { g, p, io, es: {}, flow: {} };
    }

    // ------------------------------------------------------------ name resolution
    lookup(name, scope) {
      const key = name.toLowerCase();
      if (scope.locals && scope.locals.has(key)) return scope.locals.get(key);
      if (scope.kind === 'CONST') {
        const gs = this.globals.get(key);
        if (gs && gs.constant) return gs;
        return null;
      }
      return this.globals.get(key) || null;
    }

    unknownName(name, scope, node) {
      const cands = [];
      if (scope.locals) for (const s of scope.locals.values()) cands.push(s.name);
      for (const s of this.globals.values()) cands.push(s.name);
      const s = suggest(name, cands);
      let msg = 'Unknown variable "' + name + '"';
      if (s) msg += '. Did you mean ' + s + '?';
      else if (scope.kind === 'LD') msg += '. Add it to the Tags table.';
      else msg += '. Declare it in the Tags table or in a VAR block.';
      if (this.fbTypes.has(name.toLowerCase())) msg = '"' + name + '" is a function block type, not a variable. Declare an instance, e.g. MyTimer : ' + name.toUpperCase();
      if (this.functions.has(name.toLowerCase()) || STD_FUNCS[name.toUpperCase()]) msg = name + ' is a function: call it with parentheses, e.g. ' + name.toUpperCase() + '(...)';
      throw new STError(msg, node.line, node.col, { unknownName: name });
    }

    // ------------------------------------------------------------ references
    compileRef(node, scope) {
      switch (node.e) {
        case 'id': {
          const sym = this.lookup(node.name, scope);
          if (!sym) this.unknownName(node.name, scope, node);
          const key = sym.key, t = sym.type;
          const co = t.k === 'elem' ? (v => T.coerce(t.name, v)) : null;
          const ref = { type: t, label: sym.name, sym };
          if (sym.scope === 'global') {
            ref.get = f => f.g[key];
            ref.set = (f, v) => { f.g[key] = co(v); };
          } else {
            ref.get = f => f.self[key];
            ref.set = (f, v) => { f.self[key] = co(v); };
          }
          if (sym.constant) ref.readonly = sym.name + ' is a constant';
          else if (scope.kind === 'FUNCTION_BLOCK' && sym.dir === 'in') ref.warnWrite = 'Writing to the input ' + sym.name + ' inside its own function block is unusual';
          if (!co) ref.set = null;
          return ref;
        }
        case 'addr': {
          const a = T.parseAddress(node.addr);
          const area = a.area, idx = a.index, tn = a.type;
          const ref = {
            type: elem(tn), label: a.text,
            get: f => f.io[area][idx],
            set: (f, v) => { f.io[area][idx] = T.coerce(tn, v); }
          };
          if (area === 'I' || area === 'IW') ref.warnWrite = 'Writing to input ' + a.text + ' has no lasting effect: inputs are refreshed at the start of every scan';
          return ref;
        }
        case 'member': {
          const base = this.compileRef(node.obj, scope);
          const bt = base.type;
          if (bt.k !== 'fb') {
            throw new STError(base.label + ' is ' + (bt.k === 'array' ? 'an array' : 'a ' + tname(bt)) + ' and has no member ' + node.name, node.line, node.col);
          }
          const fbt = this.fbTypes.get(bt.name.toLowerCase());
          const m = fbt.members.get(node.name.toLowerCase());
          const label = base.label + '.' + (m ? m.name : node.name);
          if (!m || (fbt.user && m.dir === 'local')) {
            const visible = Array.from(fbt.members.values()).filter(x => !fbt.user || x.dir !== 'local').map(x => x.name);
            const s = suggest(node.name, visible);
            throw new STError(bt.name + ' has no ' + (m ? 'public ' : '') + 'member "' + node.name + '"' + (s ? '. Did you mean ' + s + '?' : '. Available: ' + visible.join(', ')), node.line, node.col);
          }
          const mk = fbt.std ? m.name : m.key, mt = m.type;
          const ref = { type: mt, label, get: f => base.get(f)[mk] };
          if (mt.k === 'elem') {
            ref.set = (f, v) => { base.get(f)[mk] = T.coerce(mt.name, v); };
            if (m.dir === 'out') ref.readonly = m.name + ' is an output of ' + bt.name + ' and can only be read';
          }
          return ref;
        }
        case 'bit': {
          const base = this.compileRef(node.obj, scope);
          const c = cat(base.type);
          if (c !== 'int' && c !== 'bits') throw new STError('Bit access (.' + node.bit + ') needs an integer or WORD variable, ' + base.label + ' is ' + tname(base.type), node.line, node.col);
          const bits = T.ELEMENTARY[base.type.name].bits;
          if (node.bit >= bits) throw new STError(base.label + ' only has bits 0..' + (bits - 1), node.line, node.col);
          const b = node.bit;
          return {
            type: BOOL, label: base.label + '.' + b,
            get: f => ((base.get(f) >>> b) & 1) === 1,
            set: base.set ? (f, v) => { const x = base.get(f); base.set(f, v ? (x | (1 << b)) : (x & ~(1 << b))); } : null,
            readonly: base.readonly
          };
        }
        case 'index': {
          const base = this.compileRef(node.obj, scope);
          if (base.type.k !== 'array') throw new STError(base.label + ' is not an array', node.line, node.col);
          const ix = this.compileExpr(node.index, scope);
          const c = cat(ix.type);
          if (c !== 'int' && c !== 'bits') throw new STError('An array index must be a whole number, not ' + tname(ix.type), node.index.line, node.index.col);
          const lo = base.type.lo, hi = base.type.hi, et = base.type.of;
          const label = base.label + '[' + (scope.src ? scope.src.slice(node.index.pos, node.index.end) : '…') + ']';
          const idx = f => {
            const i = ix.fn(f);
            if (i < lo || i > hi) throw new RuntimeFault('Array index ' + i + ' is outside ' + base.label + '[' + lo + '..' + hi + ']');
            return i - lo;
          };
          const ref = { type: et, label, get: f => base.get(f)[idx(f)] };
          if (et.k === 'elem') ref.set = (f, v) => { base.get(f)[idx(f)] = T.coerce(et.name, v); };
          return ref;
        }
      }
      throw new STError('Expected a variable', node.line, node.col);
    }

    recordLineRef(node, ref, scope) {
      if (!scope.lineRefs || !scope.src || ref.type.k !== 'elem') return;
      const line = node.line;
      const label = scope.src.slice(node.pos, node.end);
      const list = scope.lineRefs[line] || (scope.lineRefs[line] = []);
      if (!list.some(r => r.label.toLowerCase() === label.toLowerCase())) list.push({ label, get: ref.get, type: ref.type.name });
    }

    // ------------------------------------------------------------ expressions
    compileExpr(node, scope) {
      switch (node.e) {
        case 'lit': {
          let v = node.v, type = node.type === 'ANY_INT' ? ANY_INT : elem(node.type);
          if (node.typed) {
            const tt = node.typed;
            v = convertValue(cat(type), tt, v);
            type = elem(tt);
          }
          const val = v;
          return { type, fn: () => val, isConst: true };
        }
        case 'id': case 'member': case 'index': case 'addr': case 'bit': {
          const ref = this.compileRef(node, scope);
          if (ref.type.k === 'fb') {
            const fbt = this.fbTypes.get(ref.type.name.toLowerCase());
            const out = fbt.std ? fbt.def.powerOut : (fbt.order.find(s => s.dir === 'out') || {}).name;
            throw new STError(ref.label + ' is a ' + ref.type.name + ' instance, not a value' + (out ? '. Use ' + ref.label + '.' + out + ' to read its output.' : '.'), node.line, node.col);
          }
          if (ref.type.k === 'array') throw new STError(ref.label + ' is an array: use an index like ' + ref.label + '[0]', node.line, node.col);
          this.recordLineRef(node, ref, scope);
          const isConst = !!(ref.sym && ref.sym.constant && ref.sym.init !== undefined && ref.sym.init !== null);
          if (isConst) { const cv = ref.sym.init; return { type: ref.type, fn: () => cv, isConst: true }; }
          if (scope.kind === 'CONST') throw new STError('Only constant values can be used here', node.line, node.col);
          return { type: ref.type, fn: ref.get };
        }
        case 'un': return this.compileUnary(node, scope);
        case 'bin': return this.compileBinary(node, scope);
        case 'call': return this.compileCall(node, scope);
        case 'arrinit': throw new STError('[...] lists are only allowed as initial values of arrays', node.line, node.col);
      }
      throw new STError('Unsupported expression', node.line, node.col);
    }

    constValue(node, scope) {
      const r = this.compileExpr(node, scope);
      if (!r.isConst) throw new STError('A constant value is required here', node.line, node.col);
      return r.fn(null);
    }

    fold(res) {
      if (res.isConst) {
        try { const v = res.fn(null); return { type: res.type, fn: () => v, isConst: true }; }
        catch (e) { if (e.isFault) throw new STError(e.message, 0, 0); throw e; }
      }
      return res;
    }

    compileUnary(node, scope) {
      const x = this.compileExpr(node.x, scope);
      const c = cat(x.type), fx = x.fn;
      if (node.op === 'NOT') {
        if (c === 'bool') return this.fold({ type: BOOL, fn: f => !fx(f), isConst: x.isConst });
        if (c === 'bits' || c === 'int') {
          const tn = x.type.name === 'ANY_INT' ? 'DINT' : x.type.name;
          return this.fold({ type: x.type, fn: f => T.coerce(tn, ~fx(f)), isConst: x.isConst });
        }
        throw new STError('NOT needs a BOOL value, not ' + tname(x.type), node.line, node.col);
      }
      if (c === 'int' || c === 'real' || c === 'time') return this.fold({ type: x.type, fn: f => -fx(f), isConst: x.isConst });
      throw new STError('Cannot negate a ' + tname(x.type), node.line, node.col);
    }

    compileBinary(node, scope) {
      const a = this.compileExpr(node.a, scope), b = this.compileExpr(node.b, scope);
      const ca = cat(a.type), cb = cat(b.type);
      const fa = a.fn, fb = b.fn;
      const isConst = a.isConst && b.isConst;
      const op = node.op;
      const err = (m) => { throw new STError(m, node.line, node.col); };
      const loc = { pou: scope.pou, pouId: scope.pouId, line: node.line, col: node.col, rungId: scope.rungId, elemId: scope.elemId };

      if (op === 'AND' || op === 'OR' || op === 'XOR') {
        if (ca === 'bool' && cb === 'bool') {
          const fn = op === 'AND' ? (f => fa(f) && fb(f)) : op === 'OR' ? (f => fa(f) || fb(f)) : (f => fa(f) !== fb(f));
          return this.fold({ type: BOOL, fn, isConst });
        }
        if ((ca === 'bits' || ca === 'int') && (cb === 'bits' || cb === 'int')) {
          const t = commonNumeric(a.type, b.type);
          const tn = t.name === 'ANY_INT' ? 'DINT' : t.name;
          const fn = op === 'AND' ? (f => T.coerce(tn, fa(f) & fb(f))) : op === 'OR' ? (f => T.coerce(tn, fa(f) | fb(f))) : (f => T.coerce(tn, fa(f) ^ fb(f)));
          return this.fold({ type: t, fn, isConst });
        }
        err('Cannot combine ' + tname(a.type) + ' and ' + tname(b.type) + ' with ' + op + (ca === 'bool' || cb === 'bool' ? ' (both sides must be BOOL)' : ''));
      }

      if (op === '=' || op === '<>' || op === '<' || op === '>' || op === '<=' || op === '>=') {
        const okNum = (isNumCat(ca) || ca === 'time') && (isNumCat(cb) || cb === 'time');
        if (okNum && (ca === 'time') !== (cb === 'time')) {
          const lit = ca === 'time' ? b : a;
          if (lit.type.name === 'ANY_INT' && lit.isConst) this.diag('warning', 'Comparing a TIME with a plain number treats it as milliseconds. Write a time literal such as T#2s instead.', loc);
          else err('Cannot compare TIME with ' + tname(ca === 'time' ? b.type : a.type) + '. Use a time literal like T#5s or a conversion such as INT_TO_TIME().');
        } else if (!okNum && !(ca === cb && (ca === 'bool' || ca === 'string'))) {
          err('Cannot compare ' + tname(a.type) + ' with ' + tname(b.type));
        }
        let fn;
        switch (op) {
          case '=': fn = f => fa(f) === fb(f); break;
          case '<>': fn = f => fa(f) !== fb(f); break;
          case '<': fn = f => fa(f) < fb(f); break;
          case '>': fn = f => fa(f) > fb(f); break;
          case '<=': fn = f => fa(f) <= fb(f); break;
          case '>=': fn = f => fa(f) >= fb(f); break;
        }
        return this.fold({ type: BOOL, fn, isConst });
      }

      // arithmetic
      if (ca === 'string' || cb === 'string') err(op === '+' ? 'Use CONCAT(a, b) to join strings' : 'Cannot do arithmetic with STRING values');
      if (ca === 'bool' || cb === 'bool') err('Cannot use ' + op + ' with BOOL values' + (op === '+' ? ' (did you mean OR?)' : op === '*' ? ' (did you mean AND?)' : ''));
      if (ca === 'fb' || cb === 'fb' || ca === 'array' || cb === 'array') err('Invalid operands for ' + op);

      if (op === '**') return this.fold({ type: REAL, fn: f => Math.pow(fa(f), fb(f)), isConst });

      let type;
      if (ca === 'time' || cb === 'time') {
        if (op === '+' || op === '-') {
          if (ca !== 'time' || cb !== 'time') err('TIME values can only be added to other TIME values (e.g. T1.ET + T#1s)');
          type = TIME;
        } else if (op === '*') {
          if (ca === 'time' && cb === 'time') err('Cannot multiply two TIME values');
          type = TIME;
        } else if (op === '/') {
          if (cb === 'time') err('Cannot divide by a TIME value');
          type = TIME;
        } else err('MOD is not defined for TIME');
        const fn = op === '+' ? (f => fa(f) + fb(f)) : op === '-' ? (f => fa(f) - fb(f)) : op === '*' ? (f => Math.round(fa(f) * fb(f))) :
          (f => { const d = fb(f); if (d === 0) throw new RuntimeFault('Division by zero'); return Math.round(fa(f) / d); });
        return this.fold({ type, fn, isConst });
      }

      type = commonNumeric(a.type, b.type);
      const isReal = cat(type) === 'real';
      let fn;
      switch (op) {
        case '+': fn = f => fa(f) + fb(f); break;
        case '-': fn = f => fa(f) - fb(f); break;
        case '*': fn = f => fa(f) * fb(f); break;
        case '/':
          fn = isReal
            ? (f => { const d = fb(f); if (d === 0) throw new RuntimeFault('Division by zero'); return fa(f) / d; })
            : (f => { const d = fb(f); if (d === 0) throw new RuntimeFault('Division by zero'); return Math.trunc(fa(f) / d); });
          break;
        case 'MOD':
          if (isReal) err('MOD needs whole numbers, not REAL');
          fn = f => { const d = fb(f); if (d === 0) throw new RuntimeFault('Division by zero (MOD 0)'); return fa(f) % d; };
          break;
        default: err('Unknown operator ' + op);
      }
      return this.fold({ type, fn, isConst });
    }

    // checker helpers passed to standard-function type checks
    checker(node, scope) {
      const self = this;
      const err = (i, msg) => { const a = node.args[i]; throw new STError(msg, a ? a.line : node.line, a ? a.col : node.col); };
      return {
        requireNumeric(t, i, allowTime) {
          const c = cat(t);
          if (!(isNumCat(c) || (allowTime && c === 'time'))) err(i, node.name.toUpperCase() + ' needs a number for argument ' + (i + 1) + ', not ' + tname(t));
        },
        requireInt(t, i) { const c = cat(t); if (c !== 'int' && c !== 'bits') err(i, node.name.toUpperCase() + ' needs a whole number for argument ' + (i + 1)); },
        requireBool(t, i) { if (cat(t) !== 'bool') err(i, node.name.toUpperCase() + ' needs a BOOL for argument ' + (i + 1)); },
        requireString(t, i) { if (cat(t) !== 'string') err(i, node.name.toUpperCase() + ' needs a STRING for argument ' + (i + 1)); },
        common(a, b) {
          const x = cat(a), y = cat(b);
          if (x === y && (x === 'bool' || x === 'string' || x === 'time')) return a;
          if (isNumCat(x) && isNumCat(y)) return commonNumeric(a, b);
          throw new STError(node.name.toUpperCase() + ': arguments ' + tname(a) + ' and ' + tname(b) + ' do not match', node.line, node.col);
        }
      };
      void self;
    }

    orderArgs(node, paramNames, variadicMin) {
      const named = node.args.some(a => a.name);
      if (!named) return node.args.map(a => a.value);
      const out = [];
      for (const a of node.args) {
        if (!a.name) throw new STError('Do not mix named and unnamed arguments in a call to ' + node.name, a.line, a.col);
        if (a.out) throw new STError('Functions have no outputs to connect with =>', a.line, a.col);
        let idx = paramNames.findIndex(p => p.toLowerCase() === a.name.toLowerCase());
        if (idx < 0 && variadicMin) {
          const m = /^IN(\d+)$/i.exec(a.name);
          if (m) idx = parseInt(m[1], 10) - 1;
        }
        if (idx < 0) throw new STError(node.name + ' has no parameter ' + a.name + ' (parameters: ' + paramNames.join(', ') + ')', a.line, a.col);
        out[idx] = a.value;
      }
      return out;
    }

    compileCall(node, scope) {
      const up = node.name.toUpperCase();
      // conversions such as INT_TO_REAL, REAL_TO_INT, BOOL_TO_INT, TIME_TO_DINT ...
      const conv = /^([A-Z]+)_TO_([A-Z]+)$/.exec(up);
      if (conv && T.isElementary(conv[2]) && (T.isElementary(conv[1]) || conv[1] === 'ANY')) {
        if (node.args.length !== 1) throw new STError(up + ' takes exactly one argument', node.line, node.col);
        const x = this.compileExpr(node.args[0].value, scope);
        const sc = cat(x.type);
        if (T.isElementary(conv[1]) && T.category(conv[1]) !== sc && !(sc === 'int' && (T.category(conv[1]) === 'int' || T.category(conv[1]) === 'bits')) && !(sc === 'bits' && T.category(conv[1]) === 'int')) {
          this.diag('warning', up + ' expects a ' + conv[1] + ' argument but gets ' + tname(x.type), { pou: scope.pou, pouId: scope.pouId, line: node.line, col: node.col, rungId: scope.rungId, elemId: scope.elemId });
        }
        const dst = conv[2], fx = x.fn;
        return this.fold({ type: elem(dst), fn: f => convertValue(sc, dst, fx(f)), isConst: x.isConst });
      }
      const std = STD_FUNCS[up];
      if (std) {
        if (scope.kind === 'CONST' && !['MIN', 'MAX', 'ABS', 'LIMIT'].includes(up)) throw new STError('Only constant values can be used here', node.line, node.col);
        const argNodes = this.orderArgs(node, std.params, std.variadic);
        const min = std.variadic || std.params.length;
        if (argNodes.length < min || (!std.variadic && argNodes.length > std.params.length) || argNodes.some(a => !a)) {
          throw new STError(up + ' needs ' + (std.variadic ? 'at least ' : '') + min + ' argument' + (min > 1 ? 's' : '') + ': ' + up + '(' + std.params.join(', ') + (std.variadic ? ', ...' : '') + ')', node.line, node.col);
        }
        const args = argNodes.map(a => this.compileExpr(a, scope));
        const type = std.check(args.map(a => a.type), this.checker(node, scope));
        const fns = args.map(a => a.fn), impl = std.impl, n = fns.length;
        const isConst = args.every(a => a.isConst);
        let fn;
        if (std.needsType) {
          const bits = T.ELEMENTARY[type.name] ? (T.ELEMENTARY[type.name].bits || 32) : 32;
          const tn = type.name;
          fn = f => T.coerce(tn, impl(fns[0](f), fns[1](f), bits));
        } else if (cat(type) === 'int' || cat(type) === 'bits') {
          const tn = type.name === 'ANY_INT' ? null : type.name;
          fn = n === 1 ? (f => { const v = impl(fns[0](f)); return tn ? T.coerce(tn, v) : v; })
            : (f => { const vals = new Array(n); for (let i = 0; i < n; i++) vals[i] = fns[i](f); const v = impl(...vals); return tn ? T.coerce(tn, v) : v; });
        } else {
          fn = n === 1 ? (f => impl(fns[0](f))) : (f => { const vals = new Array(n); for (let i = 0; i < n; i++) vals[i] = fns[i](f); return impl(...vals); });
        }
        return this.fold({ type, fn, isConst });
      }
      const user = this.functions.get(node.name.toLowerCase());
      if (user) {
        if (scope.kind === 'CONST') throw new STError('Only constant values can be used here', node.line, node.col);
        const names = user.inputs.map(s => s.name);
        const argNodes = this.orderArgs(node, names);
        if (argNodes.length > names.length) throw new STError(user.name + ' takes ' + names.length + ' argument(s): ' + user.name + '(' + names.join(', ') + ')', node.line, node.col);
        const fns = user.inputs.map((sym, i) => {
          if (!argNodes[i]) return null;
          const x = this.compileExpr(argNodes[i], scope);
          const co = this.assignCheck(sym.type, x.type, argNodes[i], { pou: scope.pou, pouId: scope.pouId, line: argNodes[i].line, rungId: scope.rungId, elemId: scope.elemId });
          return f => co(x.fn(f));
        });
        return {
          type: user.retType,
          fn: f => { const args = fns.map(fn => fn ? fn(f) : undefined); return user.invoke(args, f); }
        };
      }
      const fbt = this.fbTypes.get(node.name.toLowerCase());
      if (fbt) throw new STError(node.name + ' is a function block type. Declare an instance (e.g. MyTimer : ' + fbt.name + ') and call the instance as a statement.', node.line, node.col);
      const sym = this.lookup(node.name, scope);
      if (sym && sym.type.k === 'fb') throw new STError(node.name + ' is a function block instance: call it as its own statement, e.g. ' + node.name + '(...); then read its outputs like ' + node.name + '.Q', node.line, node.col);
      const cands = Object.keys(STD_FUNCS).concat(Array.from(this.functions.values()).map(f => f.name));
      const s = suggest(node.name, cands);
      throw new STError('Unknown function "' + node.name + '"' + (s ? '. Did you mean ' + s + '?' : ''), node.line, node.col);
    }

    /** Check that a value of type `src` may be stored in `dst`. Returns a coercion function or throws. */
    assignCheck(dst, src, node, loc, quiet) {
      const dc = cat(dst), sc = cat(src);
      const line = node ? node.line : 0, col = node ? node.col : 0;
      const fail = m => { throw new STError(m, line, col); };
      const warn = m => { if (!quiet) this.diag('warning', m, Object.assign({}, loc, { line })); };
      if (dc === 'fb' || dc === 'array') fail('Cannot assign to a whole ' + (dc === 'fb' ? 'function block instance' : 'array'));
      if (sc === 'fb' || sc === 'array') fail('Cannot use a whole ' + (sc === 'fb' ? 'function block instance' : 'array') + ' as a value');
      const tn = dst.name;
      const co = v => T.coerce(tn, v);
      switch (dc) {
        case 'bool':
          if (sc !== 'bool') fail('Type mismatch: cannot assign ' + tname(src) + ' to BOOL' + (sc === 'int' ? ' (use TRUE/FALSE or a comparison such as x > 0)' : ''));
          return co;
        case 'int': case 'bits':
          if (sc === 'int' || sc === 'bits') return co;
          if (sc === 'real') { warn('REAL value is truncated when stored in ' + tn + '. Use REAL_TO_' + tn + '() to round explicitly.'); return co; }
          if (sc === 'time') fail('Cannot assign TIME to ' + tn + '. Use TIME_TO_' + tn + '() to get milliseconds.');
          if (sc === 'bool') fail('Cannot assign BOOL to ' + tn + '. Use BOOL_TO_' + tn + '().');
          fail('Cannot assign ' + tname(src) + ' to ' + tn);
          break;
        case 'real':
          if (isNumCat(sc)) return co;
          fail('Cannot assign ' + tname(src) + ' to ' + tn);
          break;
        case 'time':
          if (sc === 'time') return co;
          if (src.name === 'ANY_INT') { warn('A plain number is read as milliseconds here. Write a time literal such as T#5s.'); return co; }
          if (sc === 'int') fail('Cannot assign ' + tname(src) + ' to TIME. Use ' + src.name + '_TO_TIME() (milliseconds) or a time literal like T#5s.');
          fail('Cannot assign ' + tname(src) + ' to TIME');
          break;
        case 'string':
          if (sc === 'string') return co;
          fail('Cannot assign ' + tname(src) + ' to STRING. Use a conversion such as INT_TO_STRING().');
      }
      return co;
    }

    // ------------------------------------------------------------ statements
    compileBlock(stmts, scope) {
      const list = [];
      for (const s of stmts) {
        try {
          const c = this.compileStmt(s, scope);
          if (c) list.push(c);
        } catch (e) {
          if (!(e instanceof STError)) throw e;
          this.diag('error', e.message, { pou: scope.pou, pouId: scope.pouId, line: e.line || s.line, col: e.col, unknownName: e.unknownName });
        }
      }
      const n = list.length;
      if (n === 0) return () => 0;
      if (n === 1) return list[0];
      return f => {
        for (let i = 0; i < n; i++) { const r = list[i](f); if (r) return r; }
        return 0;
      };
    }

    compileStmt(s, scope) {
      const line = s.line;
      const loc = { pou: scope.pou, pouId: scope.pouId, line };
      switch (s.s) {
        case 'empty': return null;
        case 'assign': {
          const ref = this.compileRef(s.target, scope);
          if (ref.readonly) throw new STError('Cannot write: ' + ref.readonly, s.target.line, s.target.col);
          if (!ref.set) throw new STError('Cannot assign to ' + ref.label + ' (' + tname(ref.type) + ') as a whole', s.target.line, s.target.col);
          if (ref.warnWrite) this.diag('warning', ref.warnWrite, loc);
          this.recordLineRef(s.target, ref, scope);
          const val = this.compileExpr(s.value, scope);
          const co = this.assignCheck(ref.type, val.type, s.value, loc);
          const set = ref.set, get = val.fn;
          void co;
          return f => { f.ctx.line = line; set(f, get(f)); return 0; };
        }
        case 'call': return this.compileCallStmt(s, scope);
        case 'if': {
          const conds = s.conds.map(c => {
            const x = this.compileExpr(c.cond, scope);
            if (cat(x.type) !== 'bool') throw new STError('IF condition must be BOOL (a comparison or logic expression), not ' + tname(x.type), c.cond.line, c.cond.col);
            return { test: x.fn, body: this.compileBlock(c.body, scope), line: c.line };
          });
          const elseBody = s.elseBody ? this.compileBlock(s.elseBody, scope) : null;
          const n = conds.length;
          return f => {
            f.ctx.line = line;
            for (let i = 0; i < n; i++) {
              const c = conds[i];
              f.ctx.line = c.line;
              if (c.test(f)) return c.body(f);
            }
            return elseBody ? elseBody(f) : 0;
          };
        }
        case 'case': {
          const x = this.compileExpr(s.expr, scope);
          const c = cat(x.type);
          if (c !== 'int' && c !== 'bits') throw new STError('CASE needs a whole-number expression (INT, DINT, ...), not ' + tname(x.type), s.expr.line, s.expr.col);
          const seen = [];
          const constScope = { pou: scope.pou, locals: scope.locals, kind: 'CONST' };
          const labelVal = (v) => typeof v === 'number' ? v : this.constValue({ e: 'id', name: v.constName, line: v.line, col: v.col }, constScope);
          const branches = s.branches.map(b => {
            const ranges = b.labels.map(l => {
              const lo = labelVal(l.lo), hi = labelVal(l.hi);
              for (const r of seen) if (lo <= r[1] && hi >= r[0]) this.diag('warning', 'CASE label ' + (lo === hi ? lo : lo + '..' + hi) + ' overlaps an earlier label and will never be reached', Object.assign({}, loc, { line: b.line }));
              seen.push([lo, hi]);
              return [lo, hi];
            });
            return { ranges, body: this.compileBlock(b.body, scope) };
          });
          const elseBody = s.elseBody ? this.compileBlock(s.elseBody, scope) : null;
          const fx = x.fn;
          return f => {
            f.ctx.line = line;
            const v = fx(f);
            for (const b of branches) {
              for (const r of b.ranges) if (v >= r[0] && v <= r[1]) return b.body(f);
            }
            return elseBody ? elseBody(f) : 0;
          };
        }
        case 'for': {
          const ref = this.compileRef(s.variable, scope);
          const c = cat(ref.type);
          if (c !== 'int') throw new STError('The FOR loop variable must be an integer (INT, DINT ...)', s.variable.line, s.variable.col);
          if (ref.readonly) throw new STError('Cannot use ' + ref.label + ' as loop variable: ' + ref.readonly, s.variable.line, s.variable.col);
          this.recordLineRef(s.variable, ref, scope);
          const from = this.compileExpr(s.from, scope), to = this.compileExpr(s.to, scope);
          const by = s.by ? this.compileExpr(s.by, scope) : null;
          for (const [x, nd] of [[from, s.from], [to, s.to], [by, s.by]]) {
            if (x && cat(x.type) !== 'int') throw new STError('FOR bounds must be whole numbers', nd.line, nd.col);
          }
          const body = this.compileBlock(s.body, scope);
          const get = ref.get, set = ref.set, ff = from.fn, tf = to.fn, bf = by ? by.fn : null;
          return f => {
            f.ctx.line = line;
            const end = tf(f), step = bf ? bf(f) : 1;
            if (step === 0) throw new RuntimeFault('FOR loop with BY 0 would never end');
            set(f, ff(f));
            const ctx = f.ctx;
            for (;;) {
              const i = get(f);
              if (step > 0 ? i > end : i < end) break;
              if (++ctx.ops > ctx.maxOps) throw new RuntimeFault('Watchdog: the FOR loop on line ' + line + ' runs too long');
              const r = body(f);
              if (r === 1) break;
              if (r === 3) return 3;
              const nx = i + step;
              set(f, nx);
              if (get(f) !== nx) throw new RuntimeFault('FOR loop variable overflowed its data type (line ' + line + ')');
            }
            return 0;
          };
        }
        case 'while': {
          const cond = this.compileExpr(s.cond, scope);
          if (cat(cond.type) !== 'bool') throw new STError('WHILE condition must be BOOL', s.cond.line, s.cond.col);
          const body = this.compileBlock(s.body, scope);
          const cf = cond.fn;
          return f => {
            const ctx = f.ctx;
            for (;;) {
              ctx.line = line;
              if (!cf(f)) break;
              if (++ctx.ops > ctx.maxOps) throw new RuntimeFault('Watchdog: the WHILE loop on line ' + line + ' never ends. A PLC must finish every scan quickly.');
              const r = body(f);
              if (r === 1) break;
              if (r === 3) return 3;
            }
            return 0;
          };
        }
        case 'repeat': {
          const cond = this.compileExpr(s.cond, scope);
          if (cat(cond.type) !== 'bool') throw new STError('UNTIL condition must be BOOL', s.cond.line, s.cond.col);
          const body = this.compileBlock(s.body, scope);
          const cf = cond.fn;
          return f => {
            const ctx = f.ctx;
            for (;;) {
              ctx.line = line;
              if (++ctx.ops > ctx.maxOps) throw new RuntimeFault('Watchdog: the REPEAT loop on line ' + line + ' never ends. A PLC must finish every scan quickly.');
              const r = body(f);
              if (r === 1) break;
              if (r === 3) return 3;
              if (cf(f)) break;
            }
            return 0;
          };
        }
        case 'exit': return () => 1;
        case 'continue': return () => 2;
        case 'return': return () => 3;
      }
      throw new STError('Unsupported statement', line, 1);
    }

    compileCallStmt(s, scope) {
      const line = s.line;
      const loc = { pou: scope.pou, pouId: scope.pouId, line };
      const callee = s.callee;
      // plain function used as a statement
      if (callee.e === 'id' && !this.lookup(callee.name, scope)) {
        const up = callee.name.toUpperCase();
        if (STD_FUNCS[up] || this.functions.has(callee.name.toLowerCase()) || /_TO_/.test(up)) {
          const x = this.compileCall({ e: 'call', name: callee.name, args: s.args, line, col: s.col }, scope);
          this.diag('warning', 'The result of ' + callee.name + '() is not used. Assign it to a variable: x := ' + callee.name + '(...);', loc);
          return f => { f.ctx.line = line; x.fn(f); return 0; };
        }
        if (this.fbTypes.has(callee.name.toLowerCase())) {
          throw new STError(callee.name + ' is a function block type. Declare an instance in the Tags table or a VAR block (e.g. Timer1 : ' + callee.name.toUpperCase() + ') and call Timer1(...)', line, s.col);
        }
      }
      const ref = this.compileRef(callee, scope);
      if (ref.type.k !== 'fb') throw new STError(ref.label + ' is a ' + tname(ref.type) + ', not a function block instance, so it cannot be called', callee.line, callee.col);
      const fbt = this.fbTypes.get(ref.type.name.toLowerCase());
      const inputs = fbt.std ? fbt.def.inputs.map(([n, t]) => ({ name: n, key: n, type: elem(t) })) : fbt.order.filter(m => m.dir === 'in').map(m => ({ name: m.name, key: m.key, type: m.type }));
      const outputs = fbt.std ? fbt.def.outputs.map(([n, t]) => ({ name: n, key: n, type: elem(t) })) : fbt.order.filter(m => m.dir === 'out').map(m => ({ name: m.name, key: m.key, type: m.type }));
      const sets = [], gets = [];
      let positional = 0;
      for (const a of s.args) {
        const aloc = Object.assign({}, loc, { line: a.line });
        if (!a.name) {
          const p = inputs[positional++];
          if (!p) throw new STError('Too many arguments for ' + fbt.name, a.line, a.col);
          const x = this.compileExpr(a.value, scope);
          const co = this.assignCheck(p.type, x.type, a.value, aloc);
          const key = p.key, fx = x.fn;
          sets.push((inst, f) => { inst[key] = co(fx(f)); });
          continue;
        }
        const ln = a.name.toLowerCase();
        if (a.out) {
          const o = outputs.find(m => m.name.toLowerCase() === ln);
          if (!o) {
            const isIn = inputs.some(m => m.name.toLowerCase() === ln);
            throw new STError(isIn ? a.name + ' is an input of ' + fbt.name + ': connect it with ":=" instead of "=>"' : fbt.name + ' has no output ' + a.name + ' (outputs: ' + outputs.map(m => m.name).join(', ') + ')', a.line, a.col);
          }
          const target = this.compileRef(a.out, scope);
          if (target.readonly || !target.set) throw new STError('Cannot write to ' + target.label, a.out.line, a.out.col);
          const co = this.assignCheck(target.type, o.type, a.out, aloc);
          void co;
          const key = o.key, tset = target.set;
          gets.push((inst, f) => tset(f, inst[key]));
          continue;
        }
        const p = inputs.find(m => m.name.toLowerCase() === ln);
        if (!p) {
          const isOut = outputs.some(m => m.name.toLowerCase() === ln);
          throw new STError(isOut ? a.name + ' is an output of ' + fbt.name + '. Read it after the call (' + ref.label + '.' + a.name + ') or connect it with "=>"' : fbt.name + ' has no input ' + a.name + ' (inputs: ' + inputs.map(m => m.name).join(', ') + ')', a.line, a.col);
        }
        const x = this.compileExpr(a.value, scope);
        const co = this.assignCheck(p.type, x.type, a.value, aloc);
        const key = p.key, fx = x.fn;
        sets.push((inst, f) => { inst[key] = co(fx(f)); });
      }
      const getInst = ref.get;
      const exec = fbt.std ? ((inst, f) => fbt.def.exec(inst, f.ctx.now)) : ((inst, f) => fbt.exec(inst, f));
      return f => {
        f.ctx.line = line;
        const inst = getInst(f);
        for (let i = 0; i < sets.length; i++) sets[i](inst, f);
        exec(inst, f);
        f.ctx.line = line;
        for (let i = 0; i < gets.length; i++) gets[i](inst, f);
        return 0;
      };
    }

    // ------------------------------------------------------------ helpers for ladder & tests
    /** Compile an operand/expression text in the global scope (ladder programs, watch expressions). */
    compileOperand(text, scope) {
      const node = PLC.st.parseExpression(String(text));
      return { node, res: this.compileExpr(node, scope) };
    }

    compileOperandRef(text, scope) {
      const node = PLC.st.parseExpression(String(text));
      if (!['id', 'member', 'index', 'addr', 'bit'].includes(node.e)) throw new STError('Expected a variable name here, not an expression', 1, 1);
      return this.compileRef(node, scope);
    }

    compileStandaloneExpr(text) {
      const scope = { pou: 'Test', locals: new Map(), kind: 'LD' };
      const node = PLC.st.parseExpression(String(text));
      return this.compileExpr(node, scope);
    }
  }

  function memberMap(members) {
    const m = new Map();
    for (const k of Object.keys(members)) m.set(k.toLowerCase(), { name: k, key: k, type: elem(members[k].type), dir: members[k].dir });
    return m;
  }

  function compileProject(project, opts) {
    return new Compiler(project, opts).compile();
  }

  PLC.RuntimeFault = RuntimeFault;
  PLC.compiler = { Compiler, compileProject, STD_FUNCS, convertValue, suggest, cat, elem, tname };
})(window.PLC = window.PLC || {});
