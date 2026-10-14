/* LadderLab — ladder diagram model, text notation, editing operations, compiler and LD→ST translation.
 *
 * A rung body is a Series: { t:'S', id, items:[...] }.
 * Items are Elements { t:'E', id, kind, tag, params:{} } or Parallels { t:'P', id, branches:[Series...] }.
 * Power flows left to right through a series; a parallel ORs its branches. */
(function (PLC) {
  'use strict';

  const uid = () => PLC.util.uid('l');
  const STError = PLC.st.STError;

  // ---- instruction catalog -------------------------------------------------
  const KINDS = {
    NO:    { cat: 'contact', label: 'Normally open contact', short: 'NO', help: 'Passes power when its BOOL variable is TRUE.' },
    NC:    { cat: 'contact', label: 'Normally closed contact', short: 'NC', help: 'Passes power when its BOOL variable is FALSE.' },
    P:     { cat: 'contact', label: 'Rising edge contact', short: 'P', help: 'Passes power for one scan when its variable changes from FALSE to TRUE.' },
    N:     { cat: 'contact', label: 'Falling edge contact', short: 'N', help: 'Passes power for one scan when its variable changes from TRUE to FALSE.' },
    COIL:  { cat: 'coil', label: 'Coil', short: '( )', help: 'Writes the incoming power to its variable: TRUE when powered, FALSE when not.' },
    NCOIL: { cat: 'coil', label: 'Negated coil', short: '(/)', help: 'Writes the inverse of the incoming power to its variable.' },
    SET:   { cat: 'coil', label: 'Set coil (latch)', short: '(S)', help: 'Sets its variable to TRUE when powered. It stays TRUE until a Reset coil clears it.' },
    RESET: { cat: 'coil', label: 'Reset coil (unlatch)', short: '(R)', help: 'Sets its variable to FALSE when powered.' },
    EQ: { cat: 'cmp', op: '=', label: 'Equal', help: 'Passes power when IN1 = IN2.' },
    NE: { cat: 'cmp', op: '<>', label: 'Not equal', help: 'Passes power when IN1 <> IN2.' },
    GT: { cat: 'cmp', op: '>', label: 'Greater than', help: 'Passes power when IN1 > IN2.' },
    GE: { cat: 'cmp', op: '>=', label: 'Greater or equal', help: 'Passes power when IN1 >= IN2.' },
    LT: { cat: 'cmp', op: '<', label: 'Less than', help: 'Passes power when IN1 < IN2.' },
    LE: { cat: 'cmp', op: '<=', label: 'Less or equal', help: 'Passes power when IN1 <= IN2.' },
    ADD:  { cat: 'math', op: '+', label: 'Add', params: ['IN1', 'IN2', 'OUT'], help: 'When powered: OUT := IN1 + IN2.' },
    SUB:  { cat: 'math', op: '-', label: 'Subtract', params: ['IN1', 'IN2', 'OUT'], help: 'When powered: OUT := IN1 - IN2.' },
    MUL:  { cat: 'math', op: '*', label: 'Multiply', params: ['IN1', 'IN2', 'OUT'], help: 'When powered: OUT := IN1 * IN2.' },
    DIV:  { cat: 'math', op: '/', label: 'Divide', params: ['IN1', 'IN2', 'OUT'], help: 'When powered: OUT := IN1 / IN2 (whole-number division for integers).' },
    MOD:  { cat: 'math', op: 'MOD', label: 'Modulo', params: ['IN1', 'IN2', 'OUT'], help: 'When powered: OUT := remainder of IN1 / IN2.' },
    MOVE: { cat: 'math', op: ':=', label: 'Move', params: ['IN', 'OUT'], help: 'When powered: OUT := IN.' }
  };
  for (const k of ['EQ', 'NE', 'GT', 'GE', 'LT', 'LE']) KINDS[k].params = ['IN1', 'IN2'];

  // Function block boxes: the rung powers the first BOOL input; the box passes on its main BOOL output.
  const FB_BOXES = {
    TON:  { params: [['PT', 'in', true], ['ET', 'out', false]] },
    TOF:  { params: [['PT', 'in', true], ['ET', 'out', false]] },
    TP:   { params: [['PT', 'in', true], ['ET', 'out', false]] },
    TONR: { params: [['R', 'in', false], ['PT', 'in', true], ['ET', 'out', false]] },
    CTU:  { params: [['R', 'in', false], ['PV', 'in', true], ['CV', 'out', false]] },
    CTD:  { params: [['LD', 'in', false], ['PV', 'in', true], ['CV', 'out', false]] },
    CTUD: { params: [['CD', 'in', false], ['R', 'in', false], ['LD', 'in', false], ['PV', 'in', true], ['QD', 'out', false], ['CV', 'out', false]] },
    R_TRIG: { params: [] },
    F_TRIG: { params: [] },
    SR: { params: [['R', 'in', true]] },
    RS: { params: [['R1', 'in', true]] }
  };
  for (const name of Object.keys(FB_BOXES)) {
    const d = PLC.fb.defs[name];
    KINDS[name] = {
      cat: 'fb', fb: name, label: d.title, help: d.summary,
      params: FB_BOXES[name].params.map(p => p[0]),
      paramInfo: FB_BOXES[name].params.map(([n, dir, req]) => ({ name: n, dir, required: req, type: d.members[n].type })),
      powerIn: d.powerIn, powerOut: d.powerOut
    };
  }
  // Generic call box for any function block instance, including the student's own FUNCTION_BLOCKs.
  KINDS.CALL = {
    cat: 'call', label: 'Function block call', params: [], paramInfo: [],
    help: 'Calls a function block instance, for example one you wrote yourself. The rung powers its first BOOL input; its first BOOL output continues the rung.'
  };

  for (const k of Object.keys(KINDS)) {
    const K = KINDS[k];
    K.kind = k;
    if (!K.paramInfo) {
      K.paramInfo = (K.params || []).map(n => ({ name: n, dir: n === 'OUT' ? 'out' : 'in', required: true }));
    }
    K.hasTag = K.cat === 'contact' || K.cat === 'coil' || K.cat === 'fb' || K.cat === 'call';
    K.isOutput = K.cat === 'coil' || K.cat === 'fb' || K.cat === 'math' || K.cat === 'call';
  }

  // ---- constructors ----------------------------------------------------------
  function makeElement(kind, tag, params) {
    return { t: 'E', id: uid(), kind, tag: tag || '', params: Object.assign({}, params || {}) };
  }
  function makeSeries(items) { return { t: 'S', id: uid(), items: items || [] }; }
  function makeParallel(branches) { return { t: 'P', id: uid(), branches }; }
  function makeRung(body, comment) { return { id: uid(), comment: comment || '', body: body || makeSeries([]) }; }

  function reId(node) {
    node.id = uid();
    if (node.t === 'S') node.items.forEach(reId);
    else if (node.t === 'P') node.branches.forEach(reId);
    return node;
  }
  function cloneNode(node) { return reId(JSON.parse(JSON.stringify(node))); }
  function cloneRung(r) { return { id: uid(), comment: r.comment, body: cloneNode(r.body) }; }

  // ---- text notation -----------------------------------------------------------
  //   rung    := series
  //   series  := item*
  //   item    := ELEMENT | '[' series ('|' series)+ ']'
  //   ELEMENT := KIND '(' [arg {',' arg}] ')'    arg := value | NAME '=' value
  // Example:  [ NO(Start) | NO(Motor) ] NC(Stop) COIL(Motor)
  function parseRungText(text) {
    let i = 0;
    const s = String(text);
    const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    const fail = (m) => { throw new STError(m + ' (at position ' + (i + 1) + ')', 1, i + 1); };

    function readArgs() {
      // returns raw arg strings, respecting nested parentheses and quotes
      const args = [];
      let depth = 0, cur = '', q = false;
      i++; // skip (
      for (; i < s.length; i++) {
        const c = s[i];
        if (q) { cur += c; if (c === "'") q = false; continue; }
        if (c === "'") { q = true; cur += c; continue; }
        if (c === '(' || c === '[') { depth++; cur += c; continue; }
        if ((c === ')' || c === ']') && depth > 0) { depth--; cur += c; continue; }
        if (c === ')') { i++; if (cur.trim() || args.length) args.push(cur.trim()); return args; }
        if (c === ',' && depth === 0) { args.push(cur.trim()); cur = ''; continue; }
        cur += c;
      }
      fail('Missing ")"');
    }

    function parseElement() {
      const m = /^[A-Za-z_]+/.exec(s.slice(i));
      if (!m) fail('Expected an instruction such as NO(...), NC(...), COIL(...)');
      const kind = m[0].toUpperCase();
      const K = KINDS[kind];
      if (!K) fail('Unknown instruction "' + m[0] + '"');
      i += m[0].length;
      ws();
      if (s[i] !== '(') fail('Expected "(" after ' + kind);
      const args = readArgs();
      const el = makeElement(kind, '', {});
      const positional = [];
      for (const a of args) {
        const nm = /^([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)\s*([\s\S]*)$/.exec(a);
        if (nm && !/^(TRUE|FALSE)$/i.test(nm[1]) && (kind === 'CALL' || (K.params || []).some(p => p.toUpperCase() === nm[1].toUpperCase()))) {
          const pname = kind === 'CALL' ? nm[1] : K.params.find(p => p.toUpperCase() === nm[1].toUpperCase());
          el.params[pname] = nm[2].trim();
        } else positional.push(a);
      }
      let pi = 0;
      if (K.hasTag) el.tag = positional.length ? positional[pi++] : '';
      const plist = K.params || [];
      for (const p of plist) {
        if (pi >= positional.length) break;
        if (el.params[p] === undefined) el.params[p] = positional[pi++];
      }
      if (pi < positional.length) fail('Too many arguments for ' + kind);
      return el;
    }

    function parseSeries(stopChars) {
      const ser = makeSeries([]);
      for (;;) {
        ws();
        if (i >= s.length || stopChars.includes(s[i])) return ser;
        if (s[i] === '[') {
          i++;
          const branches = [parseSeries('|]')];
          while (s[i] === '|') { i++; branches.push(parseSeries('|]')); }
          if (s[i] !== ']') fail('Missing "]" to close the branch');
          i++;
          if (branches.length < 2) fail('A branch [ ... ] needs at least two paths separated by |');
          ser.items.push(makeParallel(branches));
        } else ser.items.push(parseElement());
      }
    }

    const body = parseSeries('');
    ws();
    if (i < s.length) fail('Unexpected "' + s[i] + '"');
    return body;
  }

  function elementToText(el) {
    const K = KINDS[el.kind];
    const parts = [];
    if (K.hasTag) parts.push(el.tag || '');
    for (const p of (el.kind === 'CALL' ? Object.keys(el.params) : K.params || [])) {
      const v = el.params[p];
      if (v !== undefined && v !== null && String(v).trim() !== '') parts.push(p + '=' + v);
    }
    return el.kind + '(' + parts.join(', ') + ')';
  }

  function seriesToText(ser) {
    return ser.items.map(it => it.t === 'E' ? elementToText(it) : '[ ' + it.branches.map(seriesToText).join(' | ') + ' ]').join(' ');
  }

  function rungFromText(text, comment) { return makeRung(parseRungText(text), comment); }

  /** Build an LD POU body from lesson-style definitions: strings or {comment, text}. */
  function rungsFromSpec(spec) {
    return (spec || []).map(r => typeof r === 'string' ? rungFromText(r) : rungFromText(r.text || '', r.comment || ''));
  }

  // ---- tree queries ----------------------------------------------------------
  /** Find a node by id. Returns { node, parent, index, owner } where parent is the containing Series
   *  (or Parallel for a branch Series). */
  function find(root, id) {
    if (root.id === id) return { node: root, parent: null, index: -1 };
    if (root.t === 'S') {
      for (let i = 0; i < root.items.length; i++) {
        const it = root.items[i];
        if (it.id === id) return { node: it, parent: root, index: i };
        const r = find(it, id);
        if (r) return r;
      }
    } else if (root.t === 'P') {
      for (let i = 0; i < root.branches.length; i++) {
        const b = root.branches[i];
        if (b.id === id) return { node: b, parent: root, index: i };
        const r = find(b, id);
        if (r) return r;
      }
    }
    return null;
  }

  function findInProgram(rungs, id) {
    for (let r = 0; r < rungs.length; r++) {
      const res = find(rungs[r].body, id);
      if (res) { res.rung = rungs[r]; res.rungIndex = r; return res; }
    }
    return null;
  }

  function walk(node, fn) {
    if (node.t === 'E') { fn(node); return; }
    if (node.t === 'S') node.items.forEach(n => walk(n, fn));
    else node.branches.forEach(n => walk(n, fn));
  }

  function elementsOf(node) { const out = []; walk(node, e => out.push(e)); return out; }

  // ---- normalisation & editing -------------------------------------------------
  /** Flatten series in series, unwrap single-branch parallels, drop branchless parallels. */
  function normalize(ser) {
    const out = [];
    for (const it of ser.items) {
      if (it.t === 'P') {
        it.branches.forEach(normalize);
        if (it.branches.length === 0) continue;
        if (it.branches.length === 1) { out.push(...it.branches[0].items); continue; }
        out.push(it);
      } else if (it.t === 'S') {
        normalize(it);
        out.push(...it.items);
      } else out.push(it);
    }
    ser.items = out;
    return ser;
  }

  function insertAt(root, seriesId, index, nodes) {
    const f = find(root, seriesId);
    if (!f || f.node.t !== 'S') return false;
    const items = f.node.items;
    const at = index < 0 || index > items.length ? items.length : index;
    items.splice(at, 0, ...(Array.isArray(nodes) ? nodes : [nodes]));
    normalize(root);
    return true;
  }

  /** Remove nodes by id. Branches that become empty because of the removal are removed as well. */
  function removeNodes(root, ids) {
    const set = new Set(ids);
    function prune(ser) {
      ser.items = ser.items.filter(it => !set.has(it.id));
      for (const it of ser.items) {
        if (it.t === 'P') {
          it.branches = it.branches.filter(b => {
            if (set.has(b.id)) return false;
            const before = b.items.length;
            prune(b);
            return !(before > 0 && b.items.length === 0);
          });
        }
      }
    }
    prune(root);
    normalize(root);
  }

  /** Wrap a contiguous range of items in a parallel and add an empty branch below. Returns the new branch. */
  function wrapInParallel(root, seriesId, start, end) {
    const f = find(root, seriesId);
    if (!f || f.node.t !== 'S') return null;
    const items = f.node.items;
    const taken = items.splice(start, end - start + 1);
    const empty = makeSeries([]);
    // if exactly one existing parallel was selected, add a branch to it instead of nesting
    if (taken.length === 1 && taken[0].t === 'P') {
      taken[0].branches.push(empty);
      items.splice(start, 0, taken[0]);
      return empty;
    }
    const par = makeParallel([makeSeries(taken), empty]);
    items.splice(start, 0, par);
    return empty;
  }

  function addBranch(root, parallelId, afterIndex) {
    const f = find(root, parallelId);
    if (!f || f.node.t !== 'P') return null;
    const empty = makeSeries([]);
    const at = afterIndex == null ? f.node.branches.length : afterIndex + 1;
    f.node.branches.splice(at, 0, empty);
    return empty;
  }

  /** Detach nodes (for moving) and return them in their original order. */
  function detach(root, ids) {
    const nodes = [];
    for (const id of ids) {
      const f = find(root, id);
      if (f && f.node.t !== 'S') nodes.push(f.node);
    }
    removeNodes(root, ids);
    return nodes;
  }

  // ---- compile & execute -------------------------------------------------------
  function compileProgram(pou, compiler) {
    const rungs = pou.rungs || [];
    const T = PLC.types;
    const cat = PLC.compiler.cat;
    const coilWrites = new Map();
    const fbUses = new Map();
    const compiledRungs = [];

    rungs.forEach((rung, ri) => {
      const rloc = { pou: pou.name, pouId: pou.id, rung: ri, rungId: rung.id };
      const scope = { pou: pou.name, pouId: pou.id, kind: 'LD', locals: new Map(), rungId: rung.id, src: null };
      const els = elementsOf(rung.body);
      if (els.length === 0) {
        compiledRungs.push(null);
        return;
      }
      if (!els.some(e => KINDS[e.kind] && KINDS[e.kind].isOutput)) {
        compiler.diag('warning', 'Rung ' + (ri + 1) + ' has no coil or box at the end, so it does not do anything', rloc);
      }
      let hasEmptyBranch = false;
      walk(rung.body, () => {});
      (function scan(n) {
        if (n.t === 'P') n.branches.forEach(b => { if (b.items.length === 0) hasEmptyBranch = true; scan(b); });
        else if (n.t === 'S') n.items.forEach(scan);
      })(rung.body);
      if (hasEmptyBranch) compiler.diag('warning', 'Rung ' + (ri + 1) + ' has an empty branch. It acts like a plain wire and bypasses the parallel path.', rloc);

      let ok = true;
      const compileEl = (el) => {
        const K = KINDS[el.kind];
        const eloc = Object.assign({}, rloc, { elemId: el.id });
        scope.elemId = el.id;
        const fail = (msg) => { throw new STError(msg, 0, 0); };
        try {
          if (!K) fail('Unknown instruction ' + el.kind);
          if (K.cat === 'contact' || K.cat === 'coil') {
            if (!String(el.tag || '').trim()) fail((K.cat === 'contact' ? 'Contact' : 'Coil') + ' has no variable. Double-click it to choose one.');
            const ref = compiler.compileOperandRef(el.tag, scope);
            if (cat(ref.type) !== 'bool') fail(ref.label + ' is ' + PLC.compiler.tname(ref.type) + '. Contacts and coils need a BOOL variable' + (ref.type.k === 'fb' ? ' such as ' + ref.label + '.' + (PLC.fb.defs[ref.type.name] ? PLC.fb.defs[ref.type.name].powerOut : 'Q') : '') + '.');
            const get = ref.get, id = el.id;
            if (K.cat === 'contact') {
              switch (el.kind) {
                case 'NO': return (f, p) => { const s = !!get(f); const o = p && s; f.flow[id] = (p ? 1 : 0) | (o ? 2 : 0) | (s ? 4 : 0); return o; };
                case 'NC': return (f, p) => { const s = !get(f); const o = p && s; f.flow[id] = (p ? 1 : 0) | (o ? 2 : 0) | (s ? 4 : 0); return o; };
                case 'P': return (f, p) => { const v = !!get(f); const es = f.es; const s = v && !es[id]; es[id] = v; const o = p && s; f.flow[id] = (p ? 1 : 0) | (o ? 2 : 0) | (s ? 4 : 0) | (v ? 8 : 0); return o; };
                case 'N': return (f, p) => { const v = !!get(f); const es = f.es; const s = !v && !!es[id]; es[id] = v; const o = p && s; f.flow[id] = (p ? 1 : 0) | (o ? 2 : 0) | (s ? 4 : 0) | (v ? 8 : 0); return o; };
              }
            }
            if (ref.readonly) fail('Cannot write: ' + ref.readonly);
            if (!ref.set) fail('Cannot write to ' + ref.label);
            if (ref.warnWrite) compiler.diag('warning', ref.warnWrite, eloc);
            const set = ref.set;
            if (el.kind === 'COIL' || el.kind === 'NCOIL') {
              const key = ref.label.toLowerCase();
              if (!coilWrites.has(key)) coilWrites.set(key, { label: ref.label, rungs: [] });
              coilWrites.get(key).rungs.push(ri + 1);
            }
            switch (el.kind) {
              case 'COIL': return (f, p) => { set(f, p); f.flow[id] = (p ? 1 : 0) | (p ? 2 : 0) | (p ? 4 : 0); return p; };
              case 'NCOIL': return (f, p) => { set(f, !p); f.flow[id] = (p ? 1 : 0) | (p ? 2 : 0) | (!p ? 4 : 0); return p; };
              case 'SET': return (f, p) => { if (p) set(f, true); f.flow[id] = (p ? 1 : 0) | (p ? 2 : 0) | (get(f) ? 4 : 0); return p; };
              case 'RESET': return (f, p) => { if (p) set(f, false); f.flow[id] = (p ? 1 : 0) | (p ? 2 : 0) | (get(f) ? 4 : 0); return p; };
            }
          }
          if (K.cat === 'cmp') {
            const a = compileParam(compiler, el, 'IN1', scope), b = compileParam(compiler, el, 'IN2', scope);
            const ca = cat(a.type), cb = cat(b.type);
            const numeric = c => c === 'int' || c === 'bits' || c === 'real' || c === 'time';
            if (!(numeric(ca) && numeric(cb)) && !(ca === cb && (ca === 'bool' || ca === 'string'))) {
              fail('Cannot compare ' + PLC.compiler.tname(a.type) + ' with ' + PLC.compiler.tname(b.type));
            }
            if ((ca === 'time') !== (cb === 'time') && numeric(ca) && numeric(cb)) {
              const other = ca === 'time' ? b : a;
              if (!(other.isConst && other.type.name === 'ANY_INT')) fail('Compare TIME values with a time literal such as T#5s');
              compiler.diag('warning', 'Comparing TIME with a plain number treats it as milliseconds. Use a time literal such as T#2s.', eloc);
            }
            const fa = a.fn, fb = b.fn, id = el.id;
            let cmp;
            switch (el.kind) {
              case 'EQ': cmp = (x, y) => x === y; break;
              case 'NE': cmp = (x, y) => x !== y; break;
              case 'GT': cmp = (x, y) => x > y; break;
              case 'GE': cmp = (x, y) => x >= y; break;
              case 'LT': cmp = (x, y) => x < y; break;
              case 'LE': cmp = (x, y) => x <= y; break;
            }
            return (f, p) => { const s = cmp(fa(f), fb(f)); const o = p && s; f.flow[id] = (p ? 1 : 0) | (o ? 2 : 0) | (s ? 4 : 0); return o; };
          }
          if (K.cat === 'math') {
            const out = compileParamRef(compiler, el, 'OUT', scope);
            if (out.warnWrite) compiler.diag('warning', out.warnWrite, eloc);
            const id = el.id, set = out.set;
            if (el.kind === 'MOVE') {
              const x = compileParam(compiler, el, 'IN', scope);
              compiler.assignCheck(out.type, x.type, null, eloc);
              const fx = x.fn;
              return (f, p) => { if (p) set(f, fx(f)); f.flow[id] = p ? 3 : 0; return p; };
            }
            const node = { e: 'bin', op: K.op, a: paramNode(el, 'IN1'), b: paramNode(el, 'IN2'), line: 0, col: 0 };
            const res = compiler.compileExpr(node, scope);
            compiler.assignCheck(out.type, res.type, null, eloc);
            const fx = res.fn;
            return (f, p) => { if (p) set(f, fx(f)); f.flow[id] = p ? 3 : 0; return p; };
          }
          if (K.cat === 'fb') {
            if (!String(el.tag || '').trim()) fail(el.kind + ' box needs an instance name (for example T1). Double-click it to set one.');
            const ref = compiler.compileOperandRef(el.tag, scope);
            if (ref.type.k !== 'fb' || ref.type.name !== K.fb) {
              fail(ref.label + ' is ' + PLC.compiler.tname(ref.type) + ', but this box needs a ' + K.fb + ' instance. Declare a tag of type ' + K.fb + '.');
            }
            const key = ref.label.toLowerCase();
            if (!fbUses.has(key)) fbUses.set(key, { label: ref.label, rungs: [] });
            fbUses.get(key).rungs.push(ri + 1);
            const ins = [], outs = [];
            for (const pi of K.paramInfo) {
              const raw = el.params[pi.name];
              const has = raw !== undefined && raw !== null && String(raw).trim() !== '';
              if (!has) {
                if (pi.required) fail(el.kind + ' ' + ref.label + ': parameter ' + pi.name + ' is missing' + (pi.name === 'PT' ? ' (for example T#5s)' : pi.name === 'PV' ? ' (for example 10)' : ''));
                continue;
              }
              if (pi.dir === 'in') {
                const x = compileParam(compiler, el, pi.name, scope);
                const co = compiler.assignCheck(PLC.compiler.elem(pi.type), x.type, null, eloc);
                const fx = x.fn, n = pi.name;
                ins.push((inst, f) => { inst[n] = co(fx(f)); });
              } else {
                const o = compileParamRef(compiler, el, pi.name, scope);
                compiler.assignCheck(o.type, PLC.compiler.elem(pi.type), null, eloc);
                const n = pi.name, set = o.set;
                outs.push((inst, f) => set(f, inst[n]));
              }
            }
            const def = PLC.fb.defs[K.fb], getInst = ref.get, pin = K.powerIn, pout = K.powerOut, id = el.id;
            return (f, p) => {
              const inst = getInst(f);
              inst[pin] = p;
              for (let i = 0; i < ins.length; i++) ins[i](inst, f);
              def.exec(inst, f.ctx.now);
              for (let i = 0; i < outs.length; i++) outs[i](inst, f);
              const o = !!inst[pout];
              f.flow[id] = (p ? 1 : 0) | (o ? 2 : 0) | (o ? 4 : 0);
              return o;
            };
          }
          if (K.cat === 'call') return compileCall(compiler, el, scope, ri, fbUses, eloc, fail);
          fail('Unsupported instruction ' + el.kind);
        } catch (e) {
          if (!(e instanceof STError)) throw e;
          ok = false;
          compiler.diag('error', 'Rung ' + (ri + 1) + ': ' + e.message, Object.assign(eloc, { unknownName: e.unknownName }));
          return (f, p) => { f.flow[el.id] = p ? 1 : 0; return false; };
        }
      };

      const compileSeries = (ser) => {
        const parts = ser.items.map(it => it.t === 'E' ? compileEl(it) : compileParallel(it));
        const n = parts.length, id = ser.id;
        return (f, p) => {
          const pin = p;
          for (let i = 0; i < n; i++) p = parts[i](f, p);
          f.flow[id] = (pin ? 1 : 0) | (p ? 2 : 0);
          return p;
        };
      };
      const compileParallel = (par) => {
        const branches = par.branches.map(compileSeries);
        const n = branches.length, id = par.id;
        return (f, p) => {
          let o = false;
          for (let i = 0; i < n; i++) { if (branches[i](f, p)) o = true; }
          f.flow[id] = (p ? 1 : 0) | (o ? 2 : 0);
          return o;
        };
      };
      const run = compileSeries(rung.body);
      void ok;
      compiledRungs.push(run);
    });

    for (const w of coilWrites.values()) {
      if (w.rungs.length > 1) {
        compiler.diag('warning', w.label + ' is written by coils in rungs ' + w.rungs.join(' and ') + '. Only the last rung wins, so the earlier rungs have no effect. Combine the conditions with a parallel branch (OR), or use Set/Reset coils.', { pou: pou.name, pouId: pou.id });
      }
    }
    for (const u of fbUses.values()) {
      if (u.rungs.length > 1) compiler.diag('warning', 'Instance ' + u.label + ' is used in rungs ' + u.rungs.join(' and ') + '. Each timer or counter box needs its own instance.', { pou: pou.name, pouId: pou.id });
    }

    const n = compiledRungs.length;
    return {
      name: pou.name, id: pou.id, lang: 'LD', rungCount: n,
      run(ctx, mem) {
        ctx.pou = pou.name; ctx.line = 0;
        const f = { self: null, g: mem.g, io: mem.io, ctx, es: mem.es, flow: mem.flow };
        for (let i = 0; i < n; i++) {
          const r = compiledRungs[i];
          if (!r) continue;
          ctx.rung = i;
          r(f, true);
        }
        ctx.rung = null;
      },
      /** Execute a single rung (used by the scan debugger). */
      runRung(ctx, mem, i) {
        ctx.pou = pou.name; ctx.line = 0; ctx.rung = i;
        const r = compiledRungs[i];
        if (r) r({ self: null, g: mem.g, io: mem.io, ctx, es: mem.es, flow: mem.flow }, true);
        ctx.rung = null;
      }
    };
  }

  /** Describe the pins of a function block type for call boxes (std or user FB). */
  function fbPins(fbt) {
    let ins, outs;
    if (fbt.std) {
      ins = fbt.def.inputs.map(([n, t]) => ({ name: n, key: n, type: t }));
      outs = fbt.def.outputs.map(([n, t]) => ({ name: n, key: n, type: t }));
    } else {
      ins = fbt.order.filter(m => m.dir === 'in').map(m => ({ name: m.name, key: m.key, type: m.type.k === 'elem' ? m.type.name : PLC.types.typeToString(m.type) }));
      outs = fbt.order.filter(m => m.dir === 'out').map(m => ({ name: m.name, key: m.key, type: m.type.k === 'elem' ? m.type.name : PLC.types.typeToString(m.type) }));
    }
    const pin = ins.find(p => p.type === 'BOOL') || null;
    const pout = outs.find(p => p.type === 'BOOL') || null;
    return { name: fbt.name, ins, outs, powerIn: pin, powerOut: pout };
  }

  function compileCall(compiler, el, scope, ri, fbUses, eloc, fail) {
    if (!String(el.tag || '').trim()) fail('The call box needs a function block instance. Double-click it to choose one.');
    const ref = compiler.compileOperandRef(el.tag, scope);
    if (ref.type.k !== 'fb') fail(ref.label + ' is ' + PLC.compiler.tname(ref.type) + ', not a function block instance. Declare a tag whose type is a function block.');
    const fbt = compiler.fbTypes.get(ref.type.name.toLowerCase());
    const pins = fbPins(fbt);
    const key = ref.label.toLowerCase();
    if (!fbUses.has(key)) fbUses.set(key, { label: ref.label, rungs: [] });
    fbUses.get(key).rungs.push(ri + 1);
    const ins = [], outs = [];
    for (const pname of Object.keys(el.params)) {
      const raw = el.params[pname];
      if (raw === undefined || raw === null || String(raw).trim() === '') continue;
      const pi = pins.ins.find(p => p.name.toLowerCase() === pname.toLowerCase());
      const po = pins.outs.find(p => p.name.toLowerCase() === pname.toLowerCase());
      if (pi && pi === pins.powerIn) fail(pi.name + ' is driven by the rung itself; leave it empty');
      if (pi) {
        if (!PLC.types.isElementary(pi.type)) fail('Input ' + pi.name + ' has type ' + pi.type + ', which a call box cannot pass');
        const x = compileParam(compiler, el, pname, scope);
        const co = compiler.assignCheck(PLC.compiler.elem(pi.type), x.type, null, eloc);
        const k = pi.key, fx = x.fn;
        ins.push((inst, f) => { inst[k] = co(fx(f)); });
      } else if (po) {
        const o = compileParamRef(compiler, el, pname, scope);
        if (PLC.types.isElementary(po.type)) compiler.assignCheck(o.type, PLC.compiler.elem(po.type), null, eloc);
        const k = po.key, set = o.set;
        outs.push((inst, f) => set(f, inst[k]));
      } else {
        fail(pins.name + ' has no input or output called ' + pname + ' (inputs: ' + (pins.ins.map(p => p.name).join(', ') || 'none') + '; outputs: ' + (pins.outs.map(p => p.name).join(', ') || 'none') + ')');
      }
    }
    const getInst = ref.get, id = el.id;
    const pinKey = pins.powerIn ? pins.powerIn.key : null, poutKey = pins.powerOut ? pins.powerOut.key : null;
    const exec = fbt.std ? ((inst, f) => fbt.def.exec(inst, f.ctx.now)) : ((inst, f) => fbt.exec(inst, f));
    return (f, p) => {
      const inst = getInst(f);
      // without a BOOL input the block runs only while the rung is powered (EN/ENO behaviour)
      if (pinKey || p) {
        if (pinKey) inst[pinKey] = p;
        for (let i = 0; i < ins.length; i++) ins[i](inst, f);
        exec(inst, f);
        for (let i = 0; i < outs.length; i++) outs[i](inst, f);
      }
      const o = poutKey ? !!inst[poutKey] : p;
      f.flow[id] = (p ? 1 : 0) | (o ? 2 : 0) | (o ? 4 : 0);
      return o;
    };
  }

  function paramNode(el, name) {
    const raw = el.params[name];
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      throw new STError(KINDS[el.kind].label + ': parameter ' + name + ' is missing', 0, 0);
    }
    try { return PLC.st.parseExpression(String(raw)); }
    catch (e) { throw new STError(name + ' "' + raw + '": ' + e.message, 0, 0); }
  }
  function compileParam(compiler, el, name, scope) {
    const node = paramNode(el, name);
    try { return compiler.compileExpr(node, scope); }
    catch (e) { if (e instanceof STError) throw new STError(name + ': ' + e.message, 0, 0, { unknownName: e.unknownName }); throw e; }
  }
  function compileParamRef(compiler, el, name, scope) {
    const node = paramNode(el, name);
    if (!['id', 'member', 'index', 'addr', 'bit'].includes(node.e)) throw new STError(name + ' must be a variable to write the result into', 0, 0);
    let ref;
    try { ref = compiler.compileRef(node, scope); }
    catch (e) { if (e instanceof STError) throw new STError(name + ': ' + e.message, 0, 0, { unknownName: e.unknownName }); throw e; }
    if (ref.readonly) throw new STError(name + ': cannot write, ' + ref.readonly, 0, 0);
    if (!ref.set) throw new STError(name + ': cannot write to ' + ref.label, 0, 0);
    return ref;
  }

  // ---- LD → ST translation -----------------------------------------------------
  function toST(pou, callInfo) {
    const lines = [];
    const aux = [];
    let tmpCount = 0, edgeCount = 0;
    const PREC = { OR: 1, XOR: 2, AND: 3, NOT: 4, ATOM: 5 };
    const atom = t => ({ text: t, prec: PREC.ATOM });
    const TRUE = atom('TRUE');
    const wrap = (x, p) => x.prec < p ? '(' + x.text + ')' : x.text;
    const and = (a, b) => {
      if (a.text === 'TRUE') return b;
      if (b.text === 'TRUE') return a;
      if (a.text === 'FALSE' || b.text === 'FALSE') return atom('FALSE');
      return { text: wrap(a, PREC.AND) + ' AND ' + wrap(b, PREC.AND), prec: PREC.AND };
    };
    const or = (list) => {
      if (list.some(x => x.text === 'TRUE')) return TRUE;
      const l = list.filter(x => x.text !== 'FALSE');
      if (l.length === 0) return atom('FALSE');
      if (l.length === 1) return l[0];
      return { text: l.map(x => wrap(x, PREC.OR)).join(' OR '), prec: PREC.OR };
    };
    const not = (x) => ({ text: 'NOT ' + wrap(x, PREC.NOT), prec: PREC.NOT });
    const isPure = (node) => node.t === 'E' ? !KINDS[node.kind].isOutput : (node.t === 'S' ? node.items.every(isPure) : node.branches.every(isPure));
    const p = (s) => String(s || '').trim() || '???';

    function genSeries(ser, inp, out) {
      let cur = inp;
      for (const it of ser.items) cur = it.t === 'E' ? genElement(it, cur, out) : genParallel(it, cur, out);
      return cur;
    }
    function genParallel(par, inp, out) {
      if (par.branches.every(isPure)) {
        return and(inp, or(par.branches.map(b => genSeries(b, TRUE, out))));
      }
      let base = inp;
      if (inp.prec !== PREC.ATOM) {
        const name = '_Power' + (++tmpCount);
        aux.push(name + ' : BOOL;');
        out.push(name + ' := ' + inp.text + ';');
        base = atom(name);
      }
      return or(par.branches.map(b => genSeries(b, base, out)));
    }
    function genElement(el, inp, out) {
      const K = KINDS[el.kind];
      const tag = p(el.tag);
      switch (el.kind) {
        case 'NO': return and(inp, atom(tag));
        case 'NC': return and(inp, not(atom(tag)));
        case 'P': case 'N': {
          const name = '_Edge' + (++edgeCount);
          aux.push(name + ' : ' + (el.kind === 'P' ? 'R_TRIG' : 'F_TRIG') + ';  (* ' + (el.kind === 'P' ? 'rising' : 'falling') + ' edge of ' + tag + ' *)');
          out.push(name + '(CLK := ' + tag + ');');
          return and(inp, atom(name + '.Q'));
        }
        case 'COIL': out.push(tag + ' := ' + inp.text + ';'); return inp;
        case 'NCOIL': out.push(tag + ' := ' + not(inp).text + ';'); return inp;
        case 'SET': case 'RESET': {
          const v = el.kind === 'SET' ? 'TRUE' : 'FALSE';
          if (inp.text === 'TRUE') out.push(tag + ' := ' + v + ';');
          else out.push('IF ' + inp.text + ' THEN', '    ' + tag + ' := ' + v + ';', 'END_IF;');
          return inp;
        }
      }
      if (K.cat === 'cmp') {
        return and(inp, { text: p(el.params.IN1) + ' ' + K.op + ' ' + p(el.params.IN2), prec: PREC.AND - 0.5 });
      }
      if (K.cat === 'math') {
        const stmt = el.kind === 'MOVE' ? p(el.params.OUT) + ' := ' + p(el.params.IN) + ';'
          : p(el.params.OUT) + ' := ' + p(el.params.IN1) + ' ' + K.op + ' ' + p(el.params.IN2) + ';';
        if (inp.text === 'TRUE') out.push(stmt);
        else out.push('IF ' + inp.text + ' THEN', '    ' + stmt, 'END_IF;');
        return inp;
      }
      if (K.cat === 'call') {
        // callInfo(instance) → { powerIn, powerOut, outputs } tells which pins are outputs (=>)
        const info = callInfo ? callInfo(el.tag) : null;
        const args = [];
        if (info && info.powerIn) args.push(info.powerIn + ' := ' + inp.text);
        for (const k of Object.keys(el.params)) {
          const v = el.params[k];
          if (v === undefined || String(v).trim() === '') continue;
          const isOut = !!info && info.outputs.some(o => o.toLowerCase() === k.toLowerCase());
          args.push(k + (isOut ? ' => ' : ' := ') + v);
        }
        const call = tag + '(' + args.join(', ') + ');';
        if (!(info && info.powerIn) && inp.text !== 'TRUE') { out.push('IF ' + inp.text + ' THEN', '    ' + call, 'END_IF;'); return inp; }
        out.push(call);
        return info && info.powerOut ? atom(tag + '.' + info.powerOut) : inp;
      }
      if (K.cat === 'fb') {
        const args = [K.powerIn + ' := ' + inp.text];
        for (const pi of K.paramInfo) {
          const v = el.params[pi.name];
          if (v === undefined || String(v).trim() === '') continue;
          args.push(pi.name + (pi.dir === 'in' ? ' := ' : ' => ') + v);
        }
        out.push(tag + '(' + args.join(', ') + ');');
        return atom(tag + '.' + K.powerOut);
      }
      return inp;
    }

    (pou.rungs || []).forEach((rung, i) => {
      const out = [];
      genSeries(rung.body, TRUE, out);
      lines.push('(* Rung ' + (i + 1) + (rung.comment ? ': ' + rung.comment.replace(/\*\)/g, '* )').replace(/\n/g, ' ') : '') + ' *)');
      if (out.length === 0) lines.push('(* empty rung *)');
      lines.push(...out, '');
    });
    let head = '';
    if (aux.length) head = 'VAR\n' + aux.map(a => '    ' + a).join('\n') + '\nEND_VAR\n\n';
    return head + lines.join('\n').trimEnd() + '\n';
  }

  PLC.ladder = {
    KINDS, FB_BOXES, fbPins, makeElement, makeSeries, makeParallel, makeRung, cloneNode, cloneRung, reId,
    parseRungText, rungFromText, rungsFromSpec, seriesToText, elementToText,
    find, findInProgram, walk, elementsOf, normalize, insertAt, removeNodes, wrapInParallel, addBranch, detach,
    compileProgram, toST
  };
})(window.PLC = window.PLC || {});
