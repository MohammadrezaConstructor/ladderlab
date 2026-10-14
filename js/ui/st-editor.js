/* LadderLab — Structured Text editor: highlighting, inline diagnostics, online values, autocomplete, snippets. */
(function (PLC) {
  'use strict';
  const { h, button, icon } = PLC.dom;
  const esc = PLC.util.escapeHtml;

  const KW = new Set(Array.from(PLC.st.KEYWORDS));
  const TYPES = new Set(Object.keys(PLC.types.ELEMENTARY).concat(Object.keys(PLC.fb.defs)));
  const INDENT = '    ';

  /** Highlight ST source into HTML. Robust against incomplete code (never throws). */
  function highlight(src) {
    let out = '';
    let i = 0;
    const n = src.length;
    const re = /(\(\*[\s\S]*?(?:\*\)|$))|(\/\*[\s\S]*?(?:\*\/|$))|(\/\/[^\n]*)|('(?:[^'\n$]|\$.)*'?)|(\b(?:T|TIME|LTIME)#[-0-9a-zA-Z_.]*)|(%[IQM][XWBD]?\d+(?:\.\d+)?)|(\b\d+#[0-9A-Fa-f_]+\b|\b\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][-+]?\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|(:=|=>|<=|>=|<>|\*\*|[-+*/=<>&;:,.()[\]])/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      if (m.index > i) out += esc(src.slice(i, m.index));
      const t = m[0];
      if (m[1] || m[2] || m[3]) out += '<span class="t-com">' + esc(t) + '</span>';
      else if (m[4]) out += '<span class="t-str">' + esc(t) + '</span>';
      else if (m[5]) out += '<span class="t-time">' + esc(t) + '</span>';
      else if (m[6]) out += '<span class="t-addr">' + esc(t) + '</span>';
      else if (m[7]) out += '<span class="t-num">' + esc(t) + '</span>';
      else if (m[8]) {
        const up = t.toUpperCase();
        if (up === 'TRUE' || up === 'FALSE') out += '<span class="t-num">' + t + '</span>';
        else if (KW.has(up)) out += '<span class="t-kw">' + t + '</span>';
        else if (TYPES.has(up)) out += '<span class="t-type">' + t + '</span>';
        else if (PLC.compiler.STD_FUNCS[up] || /^[A-Z]+_TO_[A-Z]+$/.test(up)) out += '<span class="t-fn">' + t + '</span>';
        else out += '<span class="t-id">' + t + '</span>';
      } else out += '<span class="t-op">' + esc(t) + '</span>';
      i = m.index + t.length;
      if (t.length === 0) re.lastIndex++;
    }
    if (i < n) out += esc(src.slice(i));
    return out + '\n';
  }

  const SNIPPETS = [
    { label: 'IF', title: 'IF … THEN … END_IF', text: 'IF ${condition} THEN\n    \nEND_IF;' },
    { label: 'IF/ELSE', title: 'IF … ELSE … END_IF', text: 'IF ${condition} THEN\n    \nELSE\n    \nEND_IF;' },
    { label: 'CASE', title: 'CASE state machine', text: 'CASE ${State} OF\n    0:\n        \n    1:\n        \nELSE\n    \nEND_CASE;' },
    { label: 'FOR', title: 'FOR loop', text: 'FOR ${i} := 1 TO 10 DO\n    \nEND_FOR;' },
    { label: 'WHILE', title: 'WHILE loop', text: 'WHILE ${condition} DO\n    \nEND_WHILE;' },
    { label: 'TON', title: 'Call an on-delay timer (declare Timer1 : TON)', text: '${Timer1}(IN := , PT := T#2s);' },
    { label: 'CTU', title: 'Call an up counter (declare Counter1 : CTU)', text: '${Counter1}(CU := , R := , PV := 10);' },
    { label: 'R_TRIG', title: 'Rising edge detection (declare Edge1 : R_TRIG)', text: '${Edge1}(CLK := );\nIF Edge1.Q THEN\n    \nEND_IF;' },
    { label: 'VAR', title: 'Local variable block', text: 'VAR\n    ${name} : INT;\nEND_VAR' }
  ];

  class STEditor {
    constructor(app, host) {
      this.app = app;
      this.host = host;
      this.pou = null;
      this.lineH = 20;
      this.charW = 8;
      this.build();
    }

    build() {
      const tb = h('div.st-toolbar', { role: 'toolbar', 'aria-label': 'Structured Text snippets' });
      tb.appendChild(h('span.tb-label', { text: 'Insert' }));
      for (const sn of SNIPPETS) tb.appendChild(button(sn.label, { cls: 'sm', title: sn.title, onClick: () => this.insertSnippet(sn.text) }));
      tb.appendChild(h('span.tb-spacer'));
      tb.appendChild(h('span.tb-hint', { text: 'Ctrl+Space: complete · Ctrl+/: comment' }));
      this.gutter = h('div.st-gutter', { 'aria-hidden': 'true' });
      this.pre = h('pre.st-hl', { 'aria-hidden': 'true' });
      this.ta = h('textarea.st-input', { spellcheck: 'false', wrap: 'off', autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'Structured Text source code' });
      this.bands = h('div.st-bands', { 'aria-hidden': 'true' });
      this.monitor = h('div.st-monitor', { 'aria-hidden': 'true' });
      this.code = h('div.st-code', null, this.bands, this.pre, this.ta, this.monitor);
      this.scroll = h('div.st-scroll', null, h('div.st-grid', null, this.gutter, this.code));
      this.ac = h('div.ac', { hidden: true, role: 'listbox' });
      this.root = h('div.st-editor', null, tb, h('div.st-canvas', null, this.scroll, this.ac));
      this.host.appendChild(this.root);

      this.ta.addEventListener('input', () => this.onInput());
      this.ta.addEventListener('keydown', e => this.onKey(e));
      this.ta.addEventListener('blur', () => setTimeout(() => this.hideAc(), 150));
      this.ta.addEventListener('click', () => this.hideAc());
      this.ta.addEventListener('scroll', () => { this.ta.scrollTop = 0; this.ta.scrollLeft = 0; });
      this.measure();
      // the web font may arrive after the first layout: measure again so value chips line up
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (this.pou) this.refresh(); });
    }

    measure() {
      const probe = h('span.st-probe', { text: 'MMMMMMMMMM' });
      this.code.appendChild(probe);
      const r = probe.getBoundingClientRect();
      if (r.width) this.charW = r.width / 10;
      probe.remove();
    }

    setPou(pou) {
      const changed = this.pou !== pou;
      this.pou = pou;
      if (changed || this.ta.value !== (pou.source || '')) {
        this.ta.value = pou.source || '';
        this.refresh();
      }
      if (changed) { this.scroll.scrollTop = 0; this.hideAc(); }
    }

    /** Reload the text after an outside change (undo, lesson reset). */
    sync() { if (this.pou && this.ta.value !== (this.pou.source || '')) { this.ta.value = this.pou.source || ''; this.refresh(); } }

    onInput() {
      if (!this.pou) return;
      const prev = this.pou.source;
      this.pou.source = this.ta.value;
      this.app.sourceChanged(this.pou, prev);
      const grew = this.ta.value.length - prev.length;
      if (!this._dedenting && grew >= 1 && grew <= 12) this.autoDedent();
      this.refresh();
      this.maybeAc();
    }

    refresh() {
      this.measure();
      const src = this.ta.value;
      this.pre.innerHTML = highlight(src);
      const lines = src.split('\n');
      this.lineCount = lines.length;
      this.lineLens = lines.map(l => l.replace(/\t/g, '    ').length);
      let g = '';
      for (let i = 1; i <= lines.length; i++) g += '<div class="ln" data-line="' + i + '">' + i + '</div>';
      this.gutter.innerHTML = g;
      const w = Math.max(...this.lineLens, 20) * this.charW + 80;
      const hgt = lines.length * this.lineH + 16;
      this.ta.style.width = this.pre.style.width = w + 'px';
      this.ta.style.height = this.pre.style.height = hgt + 'px';
      this.code.style.minWidth = w + 'px';
      this.code.style.height = hgt + 'px';
      this.renderDiagnostics();
      this.updateLive(true);
    }

    renderDiagnostics() {
      this.bands.textContent = '';
      this.gutter.querySelectorAll('.ln.err, .ln.warn').forEach(e => e.classList.remove('err', 'warn'));
      this.diagByLine = new Map();
      if (!this.pou) return;
      for (const d of this.app.diagnostics || []) {
        if (d.pouId !== this.pou.id || !d.line) continue;
        const cur = this.diagByLine.get(d.line);
        if (!cur || (cur.severity !== 'error' && d.severity === 'error')) this.diagByLine.set(d.line, d);
      }
      const fault = this.app.rt.fault;
      if (fault && fault.pou === this.pou.name && fault.line) this.diagByLine.set(fault.line, { severity: 'error', message: 'Runtime fault: ' + fault.message, line: fault.line, fault: true });
      for (const [line, d] of this.diagByLine) {
        if (line > this.lineCount) continue;
        const top = (line - 1) * this.lineH + 8;
        this.bands.appendChild(h('div.band.' + (d.severity === 'error' ? 'err' : 'warn'), { style: { top: top + 'px', height: this.lineH + 'px' } }));
        const ln = this.gutter.querySelector('.ln[data-line="' + line + '"]');
        if (ln) { ln.classList.add(d.severity === 'error' ? 'err' : 'warn'); ln.title = d.message; }
      }
    }

    updateLive(force) {
      const rt = this.app.rt;
      const running = rt.state === 'RUN' || rt.state === 'FAULT';
      if (!force && !running && !this._wasRunning) return;
      this._wasRunning = running;
      const refs = running && this.app.compiled && this.pou ? (this.app.compiled.lineRefs[this.pou.name] || null) : null;
      const mem = rt.mem;
      let html = '';
      const lineH = this.lineH, cw = this.charW;
      for (let line = 1; line <= (this.lineCount || 0); line++) {
        const x = ((this.lineLens[line - 1] || 0) + 3) * cw + 8;
        const y = (line - 1) * lineH + 8;
        const d = this.diagByLine && this.diagByLine.get(line);
        if (refs && refs[line] && mem) {
          let parts = '';
          const f = { self: mem.p[this.pou.name], g: mem.g, io: mem.io, ctx: { now: rt.time, ops: 0, maxOps: 1000, depth: 0 } };
          for (const r of refs[line].slice(0, 6)) {
            let v;
            try { v = r.get(f); } catch (e) { v = undefined; }
            if (v === undefined) continue;
            const txt = PLC.types.formatValue(r.type, v);
            const cls = r.type === 'BOOL' ? (v ? ' on' : ' off') : '';
            parts += '<span class="mv' + cls + '"><span class="mn">' + esc(r.label) + '</span>' + esc(txt) + '</span>';
          }
          if (parts) html += '<div class="mline" style="top:' + y + 'px;left:' + x + 'px">' + parts + '</div>';
        } else if (d && !running) {
          html += '<div class="mline diag ' + (d.severity === 'error' ? 'err' : 'warn') + '" style="top:' + y + 'px;left:' + x + 'px">' + esc(d.message) + '</div>';
        } else if (d && d.fault) {
          html += '<div class="mline diag err" style="top:' + y + 'px;left:' + x + 'px">' + esc(d.message) + '</div>';
        }
      }
      if (html !== this._monHtml) { this._monHtml = html; this.monitor.innerHTML = html; }
    }

    gotoLine(line, col) {
      const lines = this.ta.value.split('\n');
      let pos = 0;
      for (let i = 0; i < Math.min(line - 1, lines.length); i++) pos += lines[i].length + 1;
      pos += Math.max(0, (col || 1) - 1);
      this.ta.focus();
      this.ta.setSelectionRange(pos, pos);
      const y = (line - 1) * this.lineH;
      if (y < this.scroll.scrollTop || y > this.scroll.scrollTop + this.scroll.clientHeight - 40) this.scroll.scrollTop = Math.max(0, y - this.scroll.clientHeight / 3);
    }

    // ------------------------------------------------------------------ editing helpers
    insertText(text) {
      this.ta.focus();
      // execCommand keeps the browser's own undo history working
      if (!document.execCommand || !document.execCommand('insertText', false, text)) {
        const s = this.ta.selectionStart, e = this.ta.selectionEnd;
        this.ta.setRangeText(text, s, e, 'end');
        this.onInput();
      }
    }

    lineInfo() {
      const v = this.ta.value, pos = this.ta.selectionStart;
      const start = v.lastIndexOf('\n', pos - 1) + 1;
      let end = v.indexOf('\n', pos);
      if (end < 0) end = v.length;
      const text = v.slice(start, end);
      return { start, end, text, indent: /^\s*/.exec(text)[0], col: pos - start };
    }

    insertSnippet(tpl) {
      const li = this.lineInfo();
      let text = tpl.replace(/\n/g, '\n' + li.indent);
      const ph = /\$\{([^}]*)\}/.exec(text);
      text = text.replace(/\$\{([^}]*)\}/g, '$1');
      const before = li.text.trim() ? '\n' + li.indent : '';
      const s0 = this.ta.selectionStart;
      if (before) { this.ta.setSelectionRange(li.end, li.end); }
      const insertAt = before ? li.end : s0;
      this.insertText(before + text);
      if (ph) {
        const off = (before + text).indexOf(ph[1]);
        if (off >= 0) this.ta.setSelectionRange(insertAt + off, insertAt + off + ph[1].length);
      }
    }

    onKey(e) {
      const ta = this.ta;
      if (!this.ac.hidden) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.moveAc(e.key === 'ArrowDown' ? 1 : -1); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.acceptAc(); return; }
        if (e.key === 'Escape') { e.preventDefault(); this.hideAc(); return; }
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === ' ') { e.preventDefault(); this.showAc(true); return; }
      if (mod && e.key === '/') { e.preventDefault(); this.toggleComment(); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); this.app.saveNow(); PLC.dom.toast('Saved in this browser'); return; }
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = ta.selectionStart, en = ta.selectionEnd;
        if (s === en && !e.shiftKey) { this.insertText(INDENT); return; }
        this.indentLines(e.shiftKey);
        return;
      }
      if (e.key === 'Enter' && !mod) {
        e.preventDefault();
        const li = this.lineInfo();
        const before = li.text.slice(0, li.col).trim().toUpperCase();
        let ind = li.indent;
        if (/(\bTHEN|\bDO|\bELSE|\bOF|\bREPEAT|^VAR\w*(\s+CONSTANT|\s+RETAIN)?|^PROGRAM\s+\w+|^FUNCTION_BLOCK\s+\w+|^FUNCTION\s+\w+\s*:\s*\w+|^\S.*:)$/.test(before) && !/;$/.test(before)) ind += INDENT;
        this.insertText('\n' + ind);
        return;
      }
    }

    autoDedent() {
      const li = this.lineInfo();
      const word = li.text.trim().toUpperCase().replace(/;$/, '');
      if (!/^(END_IF|END_CASE|END_FOR|END_WHILE|END_REPEAT|END_VAR|ELSE|ELSIF|UNTIL|END_PROGRAM|END_FUNCTION|END_FUNCTION_BLOCK)$/.test(word)) return;
      if (li.indent.length < INDENT.length || li.text.trim().length !== li.text.length - li.indent.length) return;
      // find the indentation of the matching opener: the previous non-empty line with less or equal indent
      const lines = this.ta.value.slice(0, li.start).split('\n');
      let target = li.indent.slice(INDENT.length);
      for (let i = lines.length - 1; i >= 0; i--) {
        const l = lines[i];
        if (!l.trim()) continue;
        const ind = /^\s*/.exec(l)[0];
        if (ind.length < li.indent.length) { target = ind; break; }
      }
      if (target === li.indent) return;
      const pos = this.ta.selectionStart;
      this.ta.setSelectionRange(li.start, li.start + li.indent.length);
      this._dedenting = true;
      this.insertText(target);
      this._dedenting = false;
      const np = pos - (li.indent.length - target.length);
      this.ta.setSelectionRange(np, np);
    }

    indentLines(out) {
      const ta = this.ta, v = ta.value;
      const s = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
      let e = ta.selectionEnd;
      if (e > s && v[e - 1] === '\n') e--;
      const endLine = v.indexOf('\n', e);
      const end = endLine < 0 ? v.length : endLine;
      const block = v.slice(s, end);
      const res = block.split('\n').map(l => out ? l.replace(new RegExp('^ {1,' + INDENT.length + '}'), '') : INDENT + l).join('\n');
      ta.setSelectionRange(s, end);
      this.insertText(res);
      ta.setSelectionRange(s, s + res.length);
    }

    toggleComment() {
      const ta = this.ta, v = ta.value;
      const s = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
      let e = ta.selectionEnd;
      const endLine = v.indexOf('\n', e > s && v[e - 1] === '\n' ? e - 1 : e);
      const end = endLine < 0 ? v.length : endLine;
      const lines = v.slice(s, end).split('\n');
      const all = lines.filter(l => l.trim()).every(l => /^\s*\/\//.test(l));
      const res = lines.map(l => all ? l.replace(/^(\s*)\/\/ ?/, '$1') : (l.trim() ? l.replace(/^(\s*)/, '$1// ') : l)).join('\n');
      ta.setSelectionRange(s, end);
      this.insertText(res);
      ta.setSelectionRange(s, s + res.length);
    }

    // ------------------------------------------------------------------ autocomplete
    wordBefore() {
      const v = this.ta.value, pos = this.ta.selectionStart;
      const m = /([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_0-9]*)?)$/.exec(v.slice(Math.max(0, pos - 60), pos));
      return m ? m[1] : '';
    }

    candidates(word) {
      const out = [];
      const add = (label, kind, detail) => out.push({ label, kind, detail });
      const dot = word.lastIndexOf('.');
      if (dot >= 0) {
        const base = word.slice(0, dot).toLowerCase();
        const type = this.typeOfName(base);
        const fb = type && PLC.fb.defs[type.toUpperCase()];
        if (fb) {
          for (const [n, t] of fb.inputs) add(n, 'input', t);
          for (const [n, t] of fb.outputs) add(n, 'output', t);
        } else if (type && this.app.compiled && this.app.compiled.fbTypes.get(type.toLowerCase())) {
          const u = this.app.compiled.fbTypes.get(type.toLowerCase());
          for (const sym of u.order || []) if (sym.dir !== 'local') add(sym.name, sym.dir === 'in' ? 'input' : 'output', PLC.types.typeToString(sym.type));
        }
        return { prefix: word.slice(dot + 1), list: out };
      }
      for (const t of this.app.project.tags) add(t.name, 'tag', t.type + (t.address ? ' ' + t.address : ''));
      for (const v of this.localVars()) add(v.name, 'var', v.type);
      for (const k of ['IF', 'THEN', 'ELSIF', 'ELSE', 'END_IF', 'CASE', 'OF', 'END_CASE', 'FOR', 'TO', 'BY', 'DO', 'END_FOR', 'WHILE', 'END_WHILE', 'REPEAT', 'UNTIL', 'END_REPEAT', 'EXIT', 'RETURN', 'AND', 'OR', 'XOR', 'NOT', 'MOD', 'TRUE', 'FALSE', 'VAR', 'END_VAR', 'CONSTANT', 'ARRAY'])
        add(k, 'keyword', '');
      for (const t of Object.keys(PLC.types.ELEMENTARY)) add(t, 'type', 'data type');
      for (const t of Object.keys(PLC.fb.defs)) add(t, 'type', PLC.fb.defs[t].title);
      for (const f of Object.keys(PLC.compiler.STD_FUNCS)) add(f, 'function', '(' + PLC.compiler.STD_FUNCS[f].params.join(', ') + ')');
      if (this.app.compiled) {
        for (const f of this.app.compiled.functions.values()) add(f.name, 'function', 'user function');
        for (const f of this.app.compiled.fbTypes.values()) if (f.user) add(f.name, 'type', 'function block');
      }
      return { prefix: word, list: out };
    }

    localVars() {
      const out = [];
      const src = this.ta.value;
      const re = /\bVAR\w*\b([\s\S]*?)\bEND_VAR\b/gi;
      let m;
      while ((m = re.exec(src))) {
        const body = m[1].replace(/\(\*[\s\S]*?\*\)|\/\/[^\n]*/g, '');
        const dre = /([A-Za-z_][\w]*(?:\s*,\s*[A-Za-z_][\w]*)*)\s*(?:AT\s+%\S+\s*)?:\s*([^;:=]+)/g;
        let d;
        while ((d = dre.exec(body))) for (const n of d[1].split(',')) out.push({ name: n.trim(), type: d[2].trim() });
      }
      return out;
    }

    typeOfName(lower) {
      const t = this.app.project.tags.find(x => x.name.toLowerCase() === lower);
      if (t) return t.type;
      const v = this.localVars().find(x => x.name.toLowerCase() === lower);
      return v ? v.type : null;
    }

    maybeAc() {
      const w = this.wordBefore();
      if (w.includes('.') || w.length >= 2) this.showAc(false);
      else this.hideAc();
    }

    showAc(explicit) {
      const word = this.wordBefore();
      const { prefix, list } = this.candidates(word);
      const p = prefix.toLowerCase();
      let items = list.filter(c => c.label.toLowerCase().startsWith(p) && c.label.toLowerCase() !== p);
      const seen = new Set();
      items = items.filter(c => { const k = c.label.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
      const rank = { var: 0, tag: 1, input: 0, output: 0, function: 3, type: 4, keyword: 2 };
      items.sort((a, b) => (rank[a.kind] - rank[b.kind]) || a.label.localeCompare(b.label));
      items = items.slice(0, 12);
      if (!items.length || (!explicit && !word.includes('.') && prefix.length < 2)) { this.hideAc(); return; }
      this.acItems = items; this.acIndex = 0; this.acPrefix = prefix;
      this.renderAc();
      // position at caret
      const v = this.ta.value, pos = this.ta.selectionStart;
      const lineStart = v.lastIndexOf('\n', pos - 1) + 1;
      const line = v.slice(0, pos).split('\n').length;
      const col = pos - lineStart - prefix.length;
      const codeRect = this.code.getBoundingClientRect(), canvasRect = this.ac.parentElement.getBoundingClientRect();
      const x = codeRect.left - canvasRect.left + 10 + col * this.charW;
      const y = codeRect.top - canvasRect.top + 8 + line * this.lineH + 2;
      this.ac.style.left = Math.max(4, Math.min(x, canvasRect.width - 280)) + 'px';
      this.ac.style.top = y + 'px';
      this.ac.hidden = false;
    }

    renderAc() {
      this.ac.textContent = '';
      this.acItems.forEach((c, i) => {
        const it = h('div.ac-item' + (i === this.acIndex ? '.on' : ''), { role: 'option' },
          h('span.ac-kind.' + c.kind, { text: c.kind[0].toUpperCase() }), h('span.ac-label', { text: c.label }), h('span.ac-detail', { text: c.detail || '' }));
        it.addEventListener('pointerdown', e => { e.preventDefault(); this.acIndex = i; this.acceptAc(); });
        this.ac.appendChild(it);
      });
    }
    moveAc(d) { this.acIndex = (this.acIndex + d + this.acItems.length) % this.acItems.length; this.renderAc(); }
    acceptAc() {
      const c = this.acItems && this.acItems[this.acIndex];
      if (!c) return this.hideAc();
      const pos = this.ta.selectionStart;
      this.ta.setSelectionRange(pos - this.acPrefix.length, pos);
      this.insertText(c.label);
      this.hideAc();
    }
    hideAc() { this.ac.hidden = true; this.acItems = null; }
  }

  PLC.STEditor = STEditor;
  PLC.stHighlight = highlight;
})(window.PLC = window.PLC || {});
