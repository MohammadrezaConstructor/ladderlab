/* LadderLab — Structured Text (IEC 61131-3) lexer and parser.
 * Produces an AST consumed by compiler.js. Error messages are written for students. */
(function (PLC) {
  'use strict';

  class STError extends Error {
    constructor(message, line, col, extra) {
      super(message);
      this.line = line || 0;
      this.col = col || 0;
      if (extra) Object.assign(this, extra);
    }
  }

  const KEYWORDS = new Set([
    'PROGRAM', 'END_PROGRAM', 'FUNCTION', 'END_FUNCTION', 'FUNCTION_BLOCK', 'END_FUNCTION_BLOCK',
    'VAR', 'VAR_INPUT', 'VAR_OUTPUT', 'VAR_IN_OUT', 'VAR_GLOBAL', 'VAR_TEMP', 'VAR_EXTERNAL', 'END_VAR',
    'CONSTANT', 'RETAIN', 'AT', 'IF', 'THEN', 'ELSIF', 'ELSE', 'END_IF', 'CASE', 'OF', 'END_CASE',
    'FOR', 'TO', 'BY', 'DO', 'END_FOR', 'WHILE', 'END_WHILE', 'REPEAT', 'UNTIL', 'END_REPEAT',
    'EXIT', 'CONTINUE', 'RETURN', 'AND', 'OR', 'XOR', 'NOT', 'MOD', 'TRUE', 'FALSE', 'ARRAY'
  ]);

  const OPS3 = [];
  const OPS2 = [':=', '=>', '<=', '>=', '<>', '**', '..'];
  const OPS1 = '+-*/()[],;:.=<>&';

  // ---- Lexer ---------------------------------------------------------------
  function tokenize(src) {
    const toks = [];
    let i = 0, line = 1, lineStart = 0;
    const n = src.length;
    const at = () => ({ line, col: i - lineStart + 1, pos: i });

    while (i < n) {
      const c = src[i];
      if (c === '\n') { i++; line++; lineStart = i; continue; }
      if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }

      // comments
      if (c === '(' && src[i + 1] === '*') {
        const start = at();
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === ')')) {
          if (src[i] === '\n') { line++; lineStart = i + 1; }
          i++;
        }
        if (i >= n) throw new STError('Comment starting here is never closed with *)', start.line, start.col);
        i += 2; continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        const start = at();
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
          if (src[i] === '\n') { line++; lineStart = i + 1; }
          i++;
        }
        if (i >= n) throw new STError('Comment starting here is never closed with */', start.line, start.col);
        i += 2; continue;
      }
      if (c === '/' && src[i + 1] === '/') {
        while (i < n && src[i] !== '\n') i++;
        continue;
      }

      const start = at();

      // identifiers, keywords, typed/time literals
      if (/[A-Za-z_]/.test(c)) {
        let j = i + 1;
        while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
        const word = src.slice(i, j);
        const up = word.toUpperCase();
        if (src[j] === '#') {
          if (up === 'T' || up === 'TIME' || up === 'LTIME') {
            let k = j + 1;
            while (k < n && /[0-9A-Za-z_.\-]/.test(src[k])) k++;
            const body = src.slice(j + 1, k);
            const ms = PLC.types.parseDuration(body);
            if (ms === null) throw new STError('Invalid time literal "' + src.slice(i, k) + '". Examples: T#500ms, T#2s, T#1m30s', start.line, start.col);
            toks.push({ t: 'time', v: ms, text: src.slice(i, k), ...start, end: k });
            i = k; continue;
          }
          if (PLC.types.isElementary(up)) {
            // typed literal such as INT#5 or BOOL#TRUE: lex the value and tag it
            i = j + 1;
            toks.push({ t: 'typed', v: up, text: src.slice(start.pos, i), ...start, end: i });
            continue;
          }
        }
        if (KEYWORDS.has(up)) toks.push({ t: 'kw', v: up, text: word, ...start, end: j });
        else toks.push({ t: 'id', v: word, text: word, ...start, end: j });
        i = j; continue;
      }

      // numbers
      if (/[0-9]/.test(c)) {
        let j = i;
        while (j < n && /[0-9_]/.test(src[j])) j++;
        if (src[j] === '#') {
          const base = parseInt(src.slice(i, j).replace(/_/g, ''), 10);
          if (base !== 2 && base !== 8 && base !== 16) throw new STError('Only bases 2#, 8# and 16# are allowed', start.line, start.col);
          let k = j + 1;
          while (k < n && /[0-9A-Fa-f_]/.test(src[k])) k++;
          const digits = src.slice(j + 1, k).replace(/_/g, '');
          const v = parseInt(digits, base);
          if (!digits || isNaN(v)) throw new STError('Invalid number "' + src.slice(i, k) + '"', start.line, start.col);
          toks.push({ t: 'int', v, text: src.slice(i, k), ...start, end: k });
          i = k; continue;
        }
        let isReal = false;
        if (src[j] === '.' && /[0-9]/.test(src[j + 1] || '')) {
          isReal = true; j++;
          while (j < n && /[0-9_]/.test(src[j])) j++;
        }
        if ((src[j] === 'e' || src[j] === 'E') && /[-+0-9]/.test(src[j + 1] || '')) {
          let k = j + 1;
          if (src[k] === '+' || src[k] === '-') k++;
          if (/[0-9]/.test(src[k] || '')) {
            isReal = true; j = k;
            while (j < n && /[0-9]/.test(src[j])) j++;
          }
        }
        const text = src.slice(i, j);
        const v = Number(text.replace(/_/g, ''));
        toks.push({ t: isReal ? 'real' : 'int', v, text, ...start, end: j });
        i = j; continue;
      }

      // strings
      if (c === "'") {
        let j = i + 1, out = '';
        while (j < n && src[j] !== "'") {
          if (src[j] === '\n') throw new STError('String is not closed before the end of the line', start.line, start.col);
          if (src[j] === '$' && j + 1 < n) {
            const e = src[j + 1].toUpperCase();
            out += e === 'N' || e === 'L' ? '\n' : e === 'T' ? '\t' : e === 'R' ? '\r' : src[j + 1];
            j += 2; continue;
          }
          out += src[j++];
        }
        if (j >= n) throw new STError('String is not closed', start.line, start.col);
        toks.push({ t: 'str', v: out, text: src.slice(i, j + 1), ...start, end: j + 1 });
        i = j + 1; continue;
      }

      // direct addresses
      if (c === '%') {
        const m = /^%[IQM][XWBD]?\d+(\.\d+)?/i.exec(src.slice(i, i + 16));
        if (!m) throw new STError('Invalid address. Examples: %IX0.0, %QX1.7, %IW0, %QW1', start.line, start.col);
        const parsed = PLC.types.parseAddress(m[0]);
        if (!parsed) throw new STError('Address ' + m[0] + ' does not exist on this PLC (inputs %IX0.0–%IX1.7, outputs %QX0.0–%QX1.7, analog %IW0–%IW3, %QW0–%QW3)', start.line, start.col);
        toks.push({ t: 'addr', v: parsed.text, text: m[0], ...start, end: i + m[0].length });
        i += m[0].length; continue;
      }

      const two = src.substr(i, 2);
      if (OPS2.includes(two)) { toks.push({ t: 'op', v: two, text: two, ...start, end: i + 2 }); i += 2; continue; }
      if (OPS1.includes(c)) { toks.push({ t: 'op', v: c, text: c, ...start, end: i + 1 }); i++; continue; }
      if (c === '"') throw new STError('Strings use single quotes in Structured Text: \'text\'', start.line, start.col);
      if (c === '!' || c === '|' || c === '~') throw new STError('Use NOT, OR and AND for logic in Structured Text (found "' + c + '")', start.line, start.col);
      throw new STError('Unexpected character "' + c + '"', start.line, start.col);
    }
    toks.push({ t: 'eof', v: '', text: 'end of text', line, col: i - lineStart + 1, pos: i, end: i });
    void OPS3;
    return toks;
  }

  // ---- Parser --------------------------------------------------------------
  const STMT_END = new Set(['END_IF', 'ELSIF', 'ELSE', 'END_CASE', 'END_FOR', 'END_WHILE', 'UNTIL', 'END_REPEAT',
    'END_PROGRAM', 'END_FUNCTION', 'END_FUNCTION_BLOCK']);
  const VAR_SECTIONS = new Set(['VAR', 'VAR_INPUT', 'VAR_OUTPUT', 'VAR_IN_OUT', 'VAR_GLOBAL', 'VAR_TEMP', 'VAR_EXTERNAL']);

  class Parser {
    constructor(src) {
      this.src = src;
      this.toks = tokenize(src);
      this.i = 0;
    }
    get tok() { return this.toks[this.i]; }
    peek(k) { return this.toks[Math.min(this.i + (k || 1), this.toks.length - 1)]; }
    prev() { return this.toks[Math.max(0, this.i - 1)]; }
    next() { const t = this.toks[this.i]; if (this.i < this.toks.length - 1) this.i++; return t; }
    isKw(v) { const t = this.tok; return t.t === 'kw' && t.v === v; }
    isOp(v) { const t = this.tok; return t.t === 'op' && t.v === v; }
    describe(t) {
      if (t.t === 'eof') return 'the end of the program';
      return '"' + t.text + '"';
    }
    fail(msg, t) { t = t || this.tok; throw new STError(msg, t.line, t.col); }
    acceptKw(v) { if (this.isKw(v)) { return this.next(); } return null; }
    acceptOp(v) { if (this.isOp(v)) { return this.next(); } return null; }
    expectKw(v, ctx) {
      if (this.isKw(v)) return this.next();
      this.fail('Expected ' + v + (ctx ? ' ' + ctx : '') + ' but found ' + this.describe(this.tok));
    }
    expectOp(v, ctx) {
      if (this.isOp(v)) return this.next();
      if (v === ';') {
        const p = this.prev();
        throw new STError('Missing ";" at the end of this statement', p.line, p.col + (p.text || '').length);
      }
      this.fail('Expected "' + v + '"' + (ctx ? ' ' + ctx : '') + ' but found ' + this.describe(this.tok));
    }
    expectId(ctx) {
      const t = this.tok;
      if (t.t === 'id') return this.next();
      if (t.t === 'kw') this.fail('"' + t.text + '" is a reserved word and cannot be used as ' + (ctx || 'a name'));
      this.fail('Expected ' + (ctx || 'a name') + ' but found ' + this.describe(t));
    }

    // compilation unit: zero or more POUs, or a bare program body (optional VAR blocks + statements)
    parseUnit() {
      const pous = [];
      const startsPou = () => this.isKw('PROGRAM') || this.isKw('FUNCTION') || this.isKw('FUNCTION_BLOCK');
      if (startsPou()) {
        while (startsPou()) pous.push(this.parsePou());
        if (this.tok.t !== 'eof') this.fail('Unexpected ' + this.describe(this.tok) + ' after the end of the POU');
        return { pous, bare: null };
      }
      const varBlocks = this.parseVarBlocks();
      const body = this.parseStatements();
      if (this.tok.t !== 'eof') {
        const t = this.tok;
        if (t.t === 'kw' && STMT_END.has(t.v)) this.fail(t.v + ' without a matching opening statement');
        this.fail('Unexpected ' + this.describe(t));
      }
      return { pous: [], bare: { kind: 'PROGRAM', name: null, varBlocks, body, line: 1 } };
    }

    parsePou() {
      const kwTok = this.next();
      const kind = kwTok.v;
      const name = this.expectId('the ' + kind.toLowerCase().replace('_', ' ') + ' name').v;
      let retType = null;
      if (kind === 'FUNCTION') {
        this.expectOp(':', 'and the return type after the function name (e.g. FUNCTION Add3 : INT)');
        retType = this.parseType();
      }
      const varBlocks = this.parseVarBlocks();
      const body = this.parseStatements();
      this.expectKw('END_' + kind, 'to close ' + kind + ' ' + name);
      return { kind, name, retType, varBlocks, body, line: kwTok.line };
    }

    parseVarBlocks() {
      const blocks = [];
      while (this.tok.t === 'kw' && VAR_SECTIONS.has(this.tok.v)) {
        const secTok = this.next();
        const block = { section: secTok.v, constant: false, retain: false, vars: [], line: secTok.line };
        while (this.isKw('CONSTANT') || this.isKw('RETAIN')) {
          if (this.next().v === 'CONSTANT') block.constant = true; else block.retain = true;
        }
        while (!this.isKw('END_VAR')) {
          if (this.tok.t === 'eof') this.fail('Missing END_VAR for the ' + secTok.v + ' block started on line ' + secTok.line);
          block.vars.push(...this.parseVarDecl());
        }
        this.next();
        blocks.push(block);
      }
      return blocks;
    }

    parseVarDecl() {
      const names = [this.expectId('a variable name')];
      while (this.acceptOp(',')) names.push(this.expectId('a variable name'));
      let at = null;
      if (this.acceptKw('AT')) {
        const t = this.tok;
        if (t.t !== 'addr') this.fail('Expected an address like %IX0.0 after AT');
        at = this.next().v;
      }
      if (this.isOp(':=')) this.fail('Missing type: write "' + names[0].v + ' : BOOL;" (name, colon, type)');
      this.expectOp(':', 'and a type after the variable name (e.g. Counter : INT;)');
      const type = this.parseType();
      let init = null;
      if (this.acceptOp(':=')) init = this.parseInitializer();
      this.expectOp(';');
      return names.map(nt => ({ name: nt.v, at, type, init, line: nt.line, col: nt.col }));
    }

    parseInitializer() {
      if (this.isOp('[')) {
        const t = this.next();
        const items = [];
        do {
          const e = this.parseExpr();
          // n(value) repetition
          if (this.isOp('(')) {
            this.next();
            const v = this.parseExpr();
            this.expectOp(')');
            items.push({ repeat: e, value: v });
          } else items.push({ value: e });
        } while (this.acceptOp(','));
        this.expectOp(']');
        return { e: 'arrinit', items, line: t.line, col: t.col };
      }
      return this.parseExpr();
    }

    parseType() {
      const t = this.tok;
      if (this.acceptKw('ARRAY')) {
        this.expectOp('[', 'after ARRAY');
        const lo = this.parseExpr();
        this.expectOp('..', 'between the array bounds (e.g. ARRAY[0..9] OF INT)');
        const hi = this.parseExpr();
        this.expectOp(']');
        this.expectKw('OF', 'after the array bounds');
        const of = this.parseType();
        return { k: 'array', lo, hi, of, line: t.line, col: t.col };
      }
      const id = this.expectId('a data type');
      const up = id.v.toUpperCase();
      if (up === 'STRING' && this.acceptOp('[')) {
        this.parseExpr();
        this.expectOp(']');
      }
      if (PLC.types.isElementary(up)) return { k: 'elem', name: up, line: id.line, col: id.col };
      return { k: 'named', name: id.v, line: id.line, col: id.col };
    }

    parseStatements() {
      const list = [];
      for (;;) {
        const t = this.tok;
        if (t.t === 'eof') break;
        if (t.t === 'kw' && (STMT_END.has(t.v))) break;
        if (t.t === 'kw' && VAR_SECTIONS.has(t.v)) this.fail('Variable declarations (' + t.v + ') must come before the first statement');
        if (t.t === 'kw' && (t.v === 'PROGRAM' || t.v === 'FUNCTION' || t.v === 'FUNCTION_BLOCK')) break;
        if ((t.t === 'int' || t.t === 'id') && this.peek().t === 'op' && (this.peek().v === ':' || this.peek().v === ',' || this.peek().v === '..')) break; // CASE label
        if (t.t === 'op' && t.v === '-' && this.peek().t === 'int' && this.peek(2).t === 'op' && [':', ',', '..'].includes(this.peek(2).v)) break;
        list.push(this.parseStatement());
      }
      return list;
    }

    parseStatement() {
      const t = this.tok;
      if (t.t === 'op' && t.v === ';') { this.next(); return { s: 'empty', line: t.line }; }
      if (t.t === 'kw') {
        switch (t.v) {
          case 'IF': return this.parseIf();
          case 'CASE': return this.parseCase();
          case 'FOR': return this.parseFor();
          case 'WHILE': return this.parseWhile();
          case 'REPEAT': return this.parseRepeat();
          case 'EXIT': this.next(); this.expectOp(';'); return { s: 'exit', line: t.line };
          case 'CONTINUE': this.next(); this.expectOp(';'); return { s: 'continue', line: t.line };
          case 'RETURN': this.next(); this.expectOp(';'); return { s: 'return', line: t.line };
          case 'THEN': this.fail('THEN without IF');
          case 'END_VAR': this.fail('END_VAR without a matching VAR');
          default: this.fail('A statement cannot start with "' + t.text + '"');
        }
      }
      if (t.t !== 'id' && t.t !== 'addr') {
        this.fail('A statement must start with a variable name or keyword, found ' + this.describe(t));
      }
      const target = this.parsePostfix(this.parsePrimaryRef());
      if (this.isOp('(')) {
        const args = this.parseArgs();
        this.expectOp(';');
        return { s: 'call', callee: target, args, line: t.line, col: t.col };
      }
      if (this.isOp(':=')) {
        this.next();
        const value = this.parseExpr();
        this.expectOp(';');
        return { s: 'assign', target, value, line: t.line, col: t.col };
      }
      if (this.isOp('=')) this.fail('Use ":=" to assign a value. A single "=" compares two values.');
      if (this.tok.t === 'id' || this.tok.t === 'kw' || this.tok.t === 'eof' || this.tok.line !== t.line) {
        const p = this.prev();
        throw new STError('Incomplete statement: expected ":=" (assignment) or "(" (call) after ' + this.src.slice(t.pos, p.end), p.line, p.col + p.text.length);
      }
      this.fail('Expected ":=" after ' + this.src.slice(t.pos, this.prev().end) + ' but found ' + this.describe(this.tok));
    }

    parseIf() {
      const t = this.next();
      const conds = [];
      const cond = this.parseExpr();
      if (this.isOp(':=')) this.fail('Use "=" to compare in a condition (":=" assigns)');
      this.expectKw('THEN', 'after the IF condition');
      conds.push({ cond, body: this.parseStatements(), line: t.line });
      let elseBody = null;
      for (;;) {
        if (this.isKw('ELSIF')) {
          const et = this.next();
          const c = this.parseExpr();
          this.expectKw('THEN', 'after the ELSIF condition');
          conds.push({ cond: c, body: this.parseStatements(), line: et.line });
        } else if (this.isKw('ELSE')) {
          this.next();
          elseBody = this.parseStatements();
          break;
        } else break;
      }
      if (!this.isKw('END_IF')) this.fail('Missing END_IF for the IF on line ' + t.line + ' (found ' + this.describe(this.tok) + ')');
      this.next();
      this.expectOp(';');
      return { s: 'if', conds, elseBody, line: t.line };
    }

    parseCaseLabelValue() {
      let neg = false;
      if (this.isOp('-')) { this.next(); neg = true; }
      const t = this.tok;
      if (t.t === 'int') { this.next(); return neg ? -t.v : t.v; }
      if (t.t === 'id') { this.next(); return { constName: t.v, line: t.line, col: t.col }; }
      this.fail('CASE labels must be whole numbers (e.g. 1:, 2..5:, 7, 8:), found ' + this.describe(t));
    }

    parseCase() {
      const t = this.next();
      const expr = this.parseExpr();
      this.expectKw('OF', 'after the CASE expression');
      const branches = [];
      let elseBody = null;
      for (;;) {
        if (this.isKw('ELSE')) { this.next(); elseBody = this.parseStatements(); break; }
        if (this.isKw('END_CASE') || this.tok.t === 'eof') break;
        const labels = [];
        const lt = this.tok;
        do {
          const lo = this.parseCaseLabelValue();
          if (this.acceptOp('..')) labels.push({ lo, hi: this.parseCaseLabelValue() });
          else labels.push({ lo, hi: lo });
        } while (this.acceptOp(','));
        this.expectOp(':', 'after the CASE label');
        branches.push({ labels, body: this.parseStatements(), line: lt.line });
      }
      if (!this.isKw('END_CASE')) this.fail('Missing END_CASE for the CASE on line ' + t.line);
      this.next();
      this.expectOp(';');
      return { s: 'case', expr, branches, elseBody, line: t.line };
    }

    parseFor() {
      const t = this.next();
      const vt = this.expectId('the loop variable');
      const variable = { e: 'id', name: vt.v, line: vt.line, col: vt.col, pos: vt.pos, end: vt.end };
      this.expectOp(':=', 'after the FOR loop variable (FOR i := 1 TO 10 DO)');
      const from = this.parseExpr();
      this.expectKw('TO', 'in the FOR statement (FOR i := 1 TO 10 DO)');
      const to = this.parseExpr();
      let by = null;
      if (this.acceptKw('BY')) by = this.parseExpr();
      this.expectKw('DO', 'after the FOR range');
      const body = this.parseStatements();
      if (!this.isKw('END_FOR')) this.fail('Missing END_FOR for the FOR on line ' + t.line);
      this.next();
      this.expectOp(';');
      return { s: 'for', variable, from, to, by, body, line: t.line };
    }

    parseWhile() {
      const t = this.next();
      const cond = this.parseExpr();
      this.expectKw('DO', 'after the WHILE condition');
      const body = this.parseStatements();
      if (!this.isKw('END_WHILE')) this.fail('Missing END_WHILE for the WHILE on line ' + t.line);
      this.next();
      this.expectOp(';');
      return { s: 'while', cond, body, line: t.line };
    }

    parseRepeat() {
      const t = this.next();
      const body = this.parseStatements();
      this.expectKw('UNTIL', 'to finish the REPEAT loop started on line ' + t.line);
      const cond = this.parseExpr();
      this.expectKw('END_REPEAT', 'after the UNTIL condition');
      this.expectOp(';');
      return { s: 'repeat', body, cond, line: t.line };
    }

    parseArgs() {
      const open = this.expectOp('(');
      const args = [];
      if (this.acceptOp(')')) return args;
      do {
        const t = this.tok;
        if (t.t === 'id' && this.peek().t === 'op' && (this.peek().v === ':=' || this.peek().v === '=>')) {
          this.next();
          const op = this.next().v;
          if (op === ':=') args.push({ name: t.v, value: this.parseExpr(), line: t.line, col: t.col });
          else {
            const target = this.parsePostfix(this.parsePrimaryRef());
            args.push({ name: t.v, out: target, line: t.line, col: t.col });
          }
        } else {
          args.push({ name: null, value: this.parseExpr(), line: t.line, col: t.col });
        }
      } while (this.acceptOp(','));
      if (!this.isOp(')')) this.fail('Expected "," or ")" in the argument list opened on line ' + open.line + ', found ' + this.describe(this.tok));
      this.next();
      return args;
    }

    // ---- expressions ----
    parseExpr() { return this.parseOr(); }

    bin(op, a, b, t) { return { e: 'bin', op, a, b, line: t.line, col: t.col, pos: a.pos, end: b.end }; }

    parseOr() {
      let a = this.parseXor();
      while (this.isKw('OR')) { const t = this.next(); a = this.bin('OR', a, this.parseXor(), t); }
      return a;
    }
    parseXor() {
      let a = this.parseAnd();
      while (this.isKw('XOR')) { const t = this.next(); a = this.bin('XOR', a, this.parseAnd(), t); }
      return a;
    }
    parseAnd() {
      let a = this.parseEquality();
      while (this.isKw('AND') || this.isOp('&')) { const t = this.next(); a = this.bin('AND', a, this.parseEquality(), t); }
      return a;
    }
    parseEquality() {
      let a = this.parseCompare();
      while (this.isOp('=') || this.isOp('<>')) {
        const t = this.next();
        if (t.v === '=' && this.isOp('=')) this.fail('Use a single "=" to compare in Structured Text');
        a = this.bin(t.v, a, this.parseCompare(), t);
      }
      return a;
    }
    parseCompare() {
      let a = this.parseAdd();
      while (this.isOp('<') || this.isOp('>') || this.isOp('<=') || this.isOp('>=')) {
        const t = this.next(); a = this.bin(t.v, a, this.parseAdd(), t);
      }
      return a;
    }
    parseAdd() {
      let a = this.parseMul();
      while (this.isOp('+') || this.isOp('-')) { const t = this.next(); a = this.bin(t.v, a, this.parseMul(), t); }
      return a;
    }
    parseMul() {
      let a = this.parseUnary();
      while (this.isOp('*') || this.isOp('/') || this.isKw('MOD')) {
        const t = this.next(); a = this.bin(t.v === 'MOD' ? 'MOD' : t.v, a, this.parseUnary(), t);
      }
      return a;
    }
    parseUnary() {
      const t = this.tok;
      if (this.isOp('-')) {
        this.next();
        const x = this.parseUnary();
        if (x.e === 'lit' && (x.type === 'ANY_INT' || x.type === 'REAL' || x.type === 'TIME')) {
          return { ...x, v: -x.v, pos: t.pos, col: t.col };
        }
        return { e: 'un', op: 'NEG', x, line: t.line, col: t.col, pos: t.pos, end: x.end };
      }
      if (this.isOp('+')) { this.next(); return this.parseUnary(); }
      if (this.isKw('NOT')) {
        this.next();
        const x = this.parseUnary();
        return { e: 'un', op: 'NOT', x, line: t.line, col: t.col, pos: t.pos, end: x.end };
      }
      return this.parsePower();
    }
    parsePower() {
      const a = this.parsePostfix(this.parsePrimary());
      if (this.isOp('**')) { const t = this.next(); return this.bin('**', a, this.parseUnary(), t); }
      return a;
    }

    parsePrimaryRef() {
      const t = this.next();
      if (t.t === 'addr') return { e: 'addr', addr: t.v, line: t.line, col: t.col, pos: t.pos, end: t.end };
      return { e: 'id', name: t.v, line: t.line, col: t.col, pos: t.pos, end: t.end };
    }

    parsePostfix(node) {
      for (;;) {
        if (this.isOp('.')) {
          this.next();
          const m = this.tok;
          if (m.t === 'int') {
            // bit access like Status.3
            this.next();
            node = { e: 'bit', obj: node, bit: m.v, line: m.line, col: m.col, pos: node.pos, end: m.end };
            continue;
          }
          const mt = this.expectId('a member name after "."');
          node = { e: 'member', obj: node, name: mt.v, line: mt.line, col: mt.col, pos: node.pos, end: mt.end };
        } else if (this.isOp('[') && (node.e === 'id' || node.e === 'member' || node.e === 'index')) {
          const t = this.next();
          const index = this.parseExpr();
          if (this.isOp(',')) this.fail('Only one-dimensional arrays are supported');
          const close = this.expectOp(']', 'to close the array index');
          node = { e: 'index', obj: node, index, line: t.line, col: t.col, pos: node.pos, end: close.end };
        } else break;
      }
      return node;
    }

    parsePrimary() {
      const t = this.tok;
      switch (t.t) {
        case 'int': this.next(); return { e: 'lit', type: 'ANY_INT', v: t.v, line: t.line, col: t.col, pos: t.pos, end: t.end };
        case 'real': this.next(); return { e: 'lit', type: 'REAL', v: t.v, line: t.line, col: t.col, pos: t.pos, end: t.end };
        case 'time': this.next(); return { e: 'lit', type: 'TIME', v: t.v, line: t.line, col: t.col, pos: t.pos, end: t.end };
        case 'str': this.next(); return { e: 'lit', type: 'STRING', v: t.v, line: t.line, col: t.col, pos: t.pos, end: t.end };
        case 'typed': {
          this.next();
          const typeName = t.v;
          const x = this.parseUnary();
          if (x.e !== 'lit') this.fail('A typed literal like ' + typeName + '#5 needs a constant value');
          return { ...x, typed: typeName, pos: t.pos, col: t.col };
        }
        case 'addr': return this.parsePrimaryRef();
        case 'kw':
          if (t.v === 'TRUE' || t.v === 'FALSE') {
            this.next();
            return { e: 'lit', type: 'BOOL', v: t.v === 'TRUE', line: t.line, col: t.col, pos: t.pos, end: t.end };
          }
          if (t.v === 'MOD' || t.v === 'AND' || t.v === 'OR' || t.v === 'XOR') this.fail('Missing value before ' + t.v);
          this.fail('Expected a value but found the keyword ' + t.v);
          break;
        case 'id': {
          this.next();
          if (this.isOp('(')) {
            const args = this.parseArgs();
            return { e: 'call', name: t.v, args, line: t.line, col: t.col, pos: t.pos, end: this.prev().end };
          }
          return { e: 'id', name: t.v, line: t.line, col: t.col, pos: t.pos, end: t.end };
        }
        case 'op':
          if (t.v === '(') {
            this.next();
            const x = this.parseExpr();
            const close = this.tok;
            if (!this.isOp(')')) this.fail('Missing ")" — the "(" on line ' + t.line + ' is never closed');
            this.next();
            return { ...x, paren: true, pos: t.pos, end: close.end };
          }
          if (t.v === ';') this.fail('Missing value before ";"');
          if (t.v === ':=') this.fail('Unexpected ":=" — did you mean "=" to compare?');
          this.fail('Expected a value but found "' + t.v + '"');
          break;
        case 'eof': this.fail('The program ends in the middle of an expression');
      }
      this.fail('Unexpected ' + this.describe(t));
    }
  }

  function parseUnit(src) { return new Parser(src).parseUnit(); }

  /** Parse one expression (used for ladder operands and test conditions). */
  function parseExpression(src) {
    const p = new Parser(src);
    const e = p.parseExpr();
    if (p.tok.t !== 'eof') p.fail('Unexpected ' + p.describe(p.tok) + ' after the expression');
    return e;
  }

  PLC.st = { STError, tokenize, Parser, parseUnit, parseExpression, KEYWORDS };
})(window.PLC = window.PLC || {});
