/* LadderLab — tags table, watch window, messages list and the "ST equivalent" view. */
(function (PLC) {
  'use strict';
  const { h, button, icon, clear } = PLC.dom;
  const T = PLC.types;

  const TYPE_CHOICES = ['BOOL', 'INT', 'DINT', 'UINT', 'REAL', 'TIME', 'WORD', 'BYTE', 'STRING', 'TON', 'TOF', 'TP', 'TONR', 'CTU', 'CTD', 'CTUD', 'R_TRIG', 'F_TRIG', 'SR', 'RS'];

  // ======================================================================== Tags
  class TagsPanel {
    constructor(app, host) {
      this.app = app;
      this.host = host;
      this.filter = '';
      this.root = h('div.tags-panel');
      const tb = h('div.panel-toolbar');
      tb.appendChild(button('Add tag', { icon: 'plus', cls: 'sm', onClick: () => this.add() }));
      this.importBtn = button('Add scene I/O', { icon: 'cpu', cls: 'sm', title: 'Add the inputs and outputs of the current machine to the table', onClick: () => this.app.importSceneTags() });
      tb.appendChild(this.importBtn);
      tb.appendChild(button('Sort', { icon: 'list', cls: 'sm', title: 'Sort: inputs, outputs, then memory', onClick: () => this.sort() }));
      tb.appendChild(h('span.tb-spacer'));
      const f = h('input.input.sm.filter', { type: 'search', placeholder: 'Filter tags', 'aria-label': 'Filter tags' });
      f.addEventListener('input', () => { this.filter = f.value.trim().toLowerCase(); this.render(); });
      tb.appendChild(f);
      this.root.appendChild(tb);
      this.tableWrap = h('div.table-wrap');
      this.root.appendChild(this.tableWrap);
      this.typeList = h('datalist#ll-types');
      this.root.appendChild(this.typeList);
      host.appendChild(this.root);
    }

    add() {
      const tags = this.app.project.tags;
      let n = tags.length + 1, name;
      do { name = 'Tag' + n++; } while (tags.some(t => t.name.toLowerCase() === name.toLowerCase()));
      this.app.mutate('Add tag', () => tags.push({ name, type: 'BOOL', address: '', init: '', comment: '' }));
      this.render();
      const inputs = this.tableWrap.querySelectorAll('tbody tr:last-child input');
      if (inputs[0]) { inputs[0].focus(); inputs[0].select(); }
    }

    sort() {
      const rank = t => { const a = T.parseAddress(t.address); if (!a) return 4; return { I: 0, IW: 1, Q: 2, QW: 3 }[a.area]; };
      this.app.mutate('Sort tags', () => {
        this.app.project.tags.sort((a, b) => rank(a) - rank(b) || (T.parseAddress(a.address) && T.parseAddress(b.address) ? T.parseAddress(a.address).index - T.parseAddress(b.address).index : a.name.localeCompare(b.name)));
      });
      this.render();
    }

    render() {
      const app = this.app;
      const tags = app.project.tags;
      clear(this.typeList);
      const types = TYPE_CHOICES.slice();
      if (app.compiled) for (const f of app.compiled.fbTypes.values()) if (f.user) types.push(f.name);
      for (const t of types) this.typeList.appendChild(h('option', { value: t }));
      const errs = new Map();
      for (const d of app.diagnostics || []) if (d.tagRow !== undefined) errs.set(d.tagRow, d);
      const table = h('table.grid.tags');
      table.appendChild(h('thead', null, h('tr', null,
        h('th', { text: 'Name' }), h('th', { text: 'Type' }), h('th', { text: 'Address' }), h('th', { text: 'Initial' }), h('th', { text: 'Comment' }), h('th', { text: 'Used', title: 'Cross-reference: where the tag is used' }), h('th', { 'aria-label': 'Actions' }))));
      const tbody = h('tbody');
      tags.forEach((tag, row) => {
        if (this.filter && !(tag.name + ' ' + tag.comment + ' ' + tag.address + ' ' + tag.type).toLowerCase().includes(this.filter)) return;
        const d = errs.get(row);
        const tr = h('tr' + (d ? '.' + d.severity : ''), { title: d ? d.message : '' });
        const name = h('input.input.mono.cell', { value: tag.name, spellcheck: 'false', 'aria-label': 'Tag name' });
        name.addEventListener('change', () => this.rename(tag, name.value.trim()));
        const type = h('input.input.mono.cell', { value: tag.type, list: 'll-types', spellcheck: 'false', 'aria-label': 'Data type' });
        type.addEventListener('change', () => {
          const v = type.value.trim().toUpperCase();
          app.mutate('Change type', () => {
            tag.type = PLC.types.isElementary(v) || PLC.fb.defs[v] ? v : type.value.trim();
            const a = T.parseAddress(tag.address);
            if (a && (a.type === 'BOOL') !== (tag.type === 'BOOL')) tag.address = '';
          });
          this.render();
        });
        const addr = h('select.input.mono.cell', { 'aria-label': 'Address' });
        addr.appendChild(h('option', { value: '', text: '—' }));
        const opts = app.freeAddresses(tag.type, tag.address);
        for (const a of opts) addr.appendChild(h('option', { value: a, text: a }));
        if (tag.address && !opts.includes(tag.address)) addr.appendChild(h('option', { value: tag.address, text: tag.address }));
        addr.value = tag.address || '';
        addr.disabled = !opts.length && !tag.address;
        addr.addEventListener('change', () => { app.mutate('Change address', () => { tag.address = addr.value; }); this.render(); });
        const init = h('input.input.mono.cell', { value: tag.init || '', placeholder: '', spellcheck: 'false', 'aria-label': 'Initial value' });
        init.addEventListener('change', () => app.mutate('Change initial value', () => { tag.init = init.value.trim(); }));
        const com = h('input.input.cell', { value: tag.comment || '', 'aria-label': 'Comment' });
        com.addEventListener('change', () => app.mutate('Change comment', () => { tag.comment = com.value; }));
        const del = button('Delete tag', { icon: 'trash', iconOnly: true, cls: 'ghost sm', onClick: () => this.remove(tag) });
        const refs = crossReference(app.project, tag.name);
        const used = h('button.xref' + (refs.length ? '' : '.none'), { type: 'button', title: refs.length ? 'Show where ' + tag.name + ' is used' : tag.name + ' is not used in any program', text: refs.length ? String(refs.length) : '–' });
        if (refs.length) used.addEventListener('click', () => PLC.dom.menu(used, [{ header: tag.name + ' is used in' }].concat(refs.map(r => ({
          label: r.pou + ', ' + r.text, icon: r.write ? 'edit' : 'eye', hint: r.write ? 'writes' : 'reads',
          onClick: () => app.navigate(r)
        }))), { alignRight: true }));
        tr.append(h('td', null, name), h('td', null, type), h('td', null, addr), h('td', null, init), h('td.wide', null, com), h('td.center', null, used), h('td', null, del));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      clear(this.tableWrap).appendChild(table);
      if (!tags.length) this.tableWrap.appendChild(h('div.empty-note', null,
        h('p', { text: 'No tags yet. Tags are the named variables of your program.' }),
        h('p', { text: 'Click "Add scene I/O" to get the inputs and outputs of the current machine.' })));
      this.importBtn.hidden = !this.app.sceneDef || !this.app.sceneDef.tags.length;
    }

    rename(tag, newName) {
      const old = tag.name;
      if (!newName || newName === old) { this.render(); return; }
      let count = 0;
      this.app.mutate('Rename tag', () => {
        tag.name = newName;
        count = renameReferences(this.app.project, old, newName);
      });
      if (count) PLC.dom.toast('Renamed ' + old + ' to ' + newName + ' in ' + count + ' place' + (count > 1 ? 's' : ''), 'info');
      this.render();
    }

    async remove(tag) {
      const used = countReferences(this.app.project, tag.name);
      if (used) {
        const ok = await PLC.dom.confirm('Delete tag', tag.name + ' is used ' + used + ' time' + (used > 1 ? 's' : '') + ' in your program. Delete it anyway?', 'Delete', true);
        if (!ok) return;
      }
      this.app.mutate('Delete tag', () => { const i = this.app.project.tags.indexOf(tag); if (i >= 0) this.app.project.tags.splice(i, 1); });
      this.render();
    }
  }

  function refRegex(name) { return new RegExp('(^|[^\\w.%])(' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![\\w])', 'gi'); }

  function eachOperand(project, fn) {
    for (const pou of project.pous) {
      if (pou.lang !== 'LD') continue;
      for (const r of pou.rungs) PLC.ladder.walk(r.body, el => {
        el.tag = fn(el.tag);
        for (const k of Object.keys(el.params)) el.params[k] = fn(el.params[k]);
      });
    }
  }

  function renameReferences(project, oldName, newName) {
    let count = 0;
    const re = refRegex(oldName);
    const rep = (str) => {
      if (!str) return str;
      return String(str).replace(re, (m, pre) => { count++; return pre + newName; });
    };
    eachOperand(project, rep);
    for (const pou of project.pous) {
      if (pou.lang !== 'ST') continue;
      // skip comments and strings
      pou.source = pou.source.replace(/(\(\*[\s\S]*?\*\)|\/\/[^\n]*|'(?:[^'$]|\$.)*')|([^'(/]+|[(/])/g, (m, skip, code) => skip ? skip : rep(code));
    }
    project.trace = project.trace.map(n => n.toLowerCase() === oldName.toLowerCase() ? newName : n);
    return count;
  }

  /** Every place a tag is used: [{ pouId, pou, elemId, rungId, rung, line, text }]. */
  function crossReference(project, name) {
    const out = [];
    const re = refRegex(name);
    const hit = s => { re.lastIndex = 0; return !!s && re.test(String(s)); };
    for (const pou of project.pous) {
      if (pou.lang === 'LD') {
        pou.rungs.forEach((r, ri) => PLC.ladder.walk(r.body, el => {
          const K = PLC.ladder.KINDS[el.kind];
          const where = [];
          if (hit(el.tag)) where.push(K ? K.label.toLowerCase() : el.kind);
          for (const k of Object.keys(el.params)) if (hit(el.params[k])) where.push(el.kind + ' ' + k);
          if (where.length) out.push({ pouId: pou.id, pou: pou.name, rungId: r.id, rung: ri, elemId: el.id, text: 'rung ' + (ri + 1) + ': ' + where.join(', '), write: K && (K.cat === 'coil' || (K.cat === 'math' && hit(el.params.OUT))) });
        }));
      } else {
        // blank out comments and strings but keep line breaks
        const src = String(pou.source || '').replace(/\(\*[\s\S]*?\*\)|\/\/[^\n]*|'(?:[^'$]|\$.)*'/g, m => m.replace(/[^\n]/g, ' '));
        src.split('\n').forEach((line, i) => {
          if (!hit(line)) return;
          const write = new RegExp('(^|[^\\w.])' + name + '\\s*:=', 'i').test(line);
          out.push({ pouId: pou.id, pou: pou.name, line: i + 1, text: 'line ' + (i + 1) + ': ' + line.trim().slice(0, 48), write });
        });
      }
    }
    return out;
  }

  function countReferences(project, name) {
    let count = 0;
    const re = refRegex(name);
    eachOperand(project, s => { if (s) count += (String(s).match(re) || []).length; return s; });
    for (const pou of project.pous) if (pou.lang === 'ST') count += (pou.source.replace(/\(\*[\s\S]*?\*\)|\/\/[^\n]*/g, '').match(re) || []).length;
    return count;
  }

  // ======================================================================== Watch
  class WatchPanel {
    constructor(app, host) {
      this.app = app;
      this.filter = '';
      this.show = 'all';
      this.expanded = new Set();
      this.root = h('div.watch-panel');
      const tb = h('div.panel-toolbar');
      const f = h('input.input.sm.filter', { type: 'search', placeholder: 'Filter', 'aria-label': 'Filter variables' });
      f.addEventListener('input', () => { this.filter = f.value.trim().toLowerCase(); this.build(); });
      const sel = h('select.input.sm', { 'aria-label': 'Show' },
        h('option', { value: 'all', text: 'All' }), h('option', { value: 'io', text: 'I/O only' }), h('option', { value: 'mem', text: 'Memory only' }));
      sel.addEventListener('change', () => { this.show = sel.value; this.build(); });
      this.clearBtn = button('Clear forces', { cls: 'sm warn-text', icon: 'lock', onClick: () => { this.app.rt.clearForces(); this.build(); } });
      tb.append(f, sel, h('span.tb-spacer'), this.clearBtn);
      this.root.appendChild(tb);
      this.list = h('div.watch-list', { role: 'table', 'aria-label': 'Variables' });
      this.root.appendChild(this.list);
      this.root.appendChild(h('p.watch-help', { html: 'Click a value to change it. <b>F</b> forces an input or output: the PLC then ignores the real signal. Forcing is a test tool; always remove forces afterwards.' }));
      host.appendChild(this.root);
      this.rows = [];
    }

    build() {
      const app = this.app, rt = app.rt;
      this.rows = [];
      clear(this.list);
      const compiled = app.compiled;
      if (!compiled) return;
      const forces = rt.forces;
      this.clearBtn.hidden = Object.keys(forces).length === 0;
      const globals = compiled.globals.filter(g => {
        if (this.show === 'io' && !g.address) return false;
        if (this.show === 'mem' && g.address) return false;
        return !this.filter || (g.name + ' ' + (g.address ? g.address.text : '') + ' ' + g.comment).toLowerCase().includes(this.filter);
      });
      const section = (title) => this.list.appendChild(h('div.watch-section', { text: title }));
      if (!globals.length && !compiled.globals.length) this.list.appendChild(h('div.empty-note', { text: 'No variables. Add tags in the Tags tab.' }));
      if (globals.length) section('Tags');
      for (const g of globals) this.addRow(g.name, g.type, g.address, () => rt.mem && rt.mem.g[g.key], (v) => rt.write(g.name, v), g.comment, 0, g.name);
      for (const prog of compiled.programs) {
        if (!prog.locals || !prog.locals.length) continue;
        const locs = prog.locals.filter(s => !this.filter || s.name.toLowerCase().includes(this.filter));
        if (!locs.length) continue;
        section(prog.name + ' (local variables)');
        for (const s of locs) {
          this.addRow(s.name, s.type, s.address || null, () => rt.mem && rt.mem.p[prog.name] && rt.mem.p[prog.name][s.key],
            (v) => { if (rt.mem && rt.mem.p[prog.name]) rt.mem.p[prog.name][s.key] = s.type.k === 'elem' ? T.coerce(s.type.name, v) : v; }, '', 0, s.type.k === 'elem' ? prog.name + '.' + s.name : null);
        }
      }
      this.update(true);
    }

    addRow(name, type, address, get, set, comment, depth, traceName) {
      const app = this.app;
      const typeStr = T.typeToString(type);
      const row = h('div.wrow' + (depth ? '.child' : ''), { role: 'row', title: comment || '' });
      const isFb = type.k === 'fb';
      const isArr = type.k === 'array';
      const key = name;
      const caret = (isFb || isArr) ? button(this.expanded.has(key) ? 'Collapse' : 'Expand', { icon: this.expanded.has(key) ? 'chevronDown' : 'chevron', iconOnly: true, cls: 'ghost xs', onClick: () => { if (this.expanded.has(key)) this.expanded.delete(key); else this.expanded.add(key); this.build(); } }) : h('span.caret-space');
      const traceOn = traceName && app.project.trace.some(n => n.toLowerCase() === traceName.toLowerCase());
      const tr = (traceName && type.k === 'elem') ? button('Show in timing diagram', { icon: 'wave', iconOnly: true, cls: 'ghost xs trace-btn' + (traceOn ? ' on' : ''), onClick: () => { app.toggleTrace(traceName); this.build(); } }) : h('span.caret-space');
      const nameEl = h('span.wname', null, h('span.mono', { text: name }), address ? h('span.waddr', { text: address.text }) : null);
      const typeEl = h('span.wtype', { text: typeStr });
      const val = h('span.wval');
      row.append(tr, caret, nameEl, typeEl, val);
      let force = null;
      if (address) {
        force = h('button.force', { type: 'button', title: 'Force ' + address.text, text: 'F', 'aria-label': 'Force ' + address.text });
        force.addEventListener('click', () => this.cycleForce(address, type));
        row.appendChild(force);
      } else row.appendChild(h('span.force-space'));
      this.list.appendChild(row);
      const r = { row, val, get, set, type, address, force, last: undefined };
      if (type.k === 'elem') {
        val.classList.add('editable');
        val.tabIndex = 0;
        val.setAttribute('role', 'button');
        val.addEventListener('click', () => this.edit(r));
        val.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.edit(r); } });
      }
      this.rows.push(r);
      if (isFb && this.expanded.has(key)) {
        const fbt = app.compiled.fbTypes.get(type.name.toLowerCase());
        const members = fbt.std ? fbt.def.inputs.concat(fbt.def.outputs).map(([n, t]) => ({ name: n, key: n, type: { k: 'elem', name: t } }))
          : fbt.order.map(s => ({ name: s.name, key: s.key, type: s.type }));
        for (const m of members) {
          this.addRow(name + '.' + m.name, m.type, null, () => { const o = get(); return o ? o[m.key] : undefined; },
            (v) => { const o = get(); if (o) o[m.key] = m.type.k === 'elem' ? T.coerce(m.type.name, v) : v; }, '', depth + 1, traceName ? traceName + '.' + m.name : null);
        }
      }
      if (isArr && this.expanded.has(key)) {
        for (let i = type.lo; i <= Math.min(type.hi, type.lo + 99); i++) {
          const idx = i - type.lo;
          this.addRow(name + '[' + i + ']', type.of, null, () => { const a = get(); return a ? a[idx] : undefined; },
            (v) => { const a = get(); if (a && type.of.k === 'elem') a[idx] = T.coerce(type.of.name, v); }, '', depth + 1, null);
        }
      }
    }

    async edit(r) {
      const t = r.type.name;
      const cur = r.get();
      if (t === 'BOOL') { r.set(!cur); this.update(true); return; }
      const v = await PLC.dom.prompt('Write value', 'New value (' + t + ')', T.formatValue(t, cur).replace(/^'|'$/g, ''));
      if (v === null) return;
      const p = T.parseValueForType(t, v);
      if (!p.ok) { PLC.dom.toast(p.error, 'warn'); return; }
      r.set(p.value);
      this.update(true);
    }

    async cycleForce(address, type) {
      const rt = this.app.rt;
      const cur = rt.forces[address.text];
      if (address.type === 'BOOL') {
        if (cur === undefined) rt.setForce(address.text, true);
        else if (cur === true) rt.setForce(address.text, false);
        else rt.setForce(address.text, null);
      } else {
        if (cur !== undefined) rt.setForce(address.text, null);
        else {
          const v = await PLC.dom.prompt('Force ' + address.text, 'Value to force (0..1000)', '500');
          if (v === null) return;
          const p = T.parseValueForType('INT', v);
          if (!p.ok) { PLC.dom.toast(p.error, 'warn'); return; }
          rt.setForce(address.text, p.value);
        }
      }
      void type;
      this.build();
    }

    update(force) {
      const forces = this.app.rt.forces;
      for (const r of this.rows) {
        let v;
        try { v = r.get(); } catch (e) { v = undefined; }
        const fv = r.address ? forces[r.address.text] : undefined;
        const key = (typeof v === 'object' ? '' : String(v)) + '|' + fv;
        if (!force && key === r.last) continue;
        r.last = key;
        if (r.type.k !== 'elem') { r.val.textContent = r.type.k === 'fb' ? (v && 'Q' in v ? 'Q=' + (v.Q ? 'TRUE' : 'FALSE') : '') : ''; continue; }
        const txt = T.formatValue(r.type.name, v);
        r.val.textContent = txt;
        if (r.type.name === 'BOOL') { r.val.classList.toggle('true', !!v); r.val.classList.toggle('false', !v); }
        if (r.force) {
          r.force.classList.toggle('on', fv !== undefined);
          r.force.textContent = fv === undefined ? 'F' : 'F:' + (r.address.type === 'BOOL' ? (fv ? '1' : '0') : fv);
          r.row.classList.toggle('forced', fv !== undefined);
        }
      }
    }
  }

  // ======================================================================== Messages
  class MessagesPanel {
    constructor(app, host) {
      this.app = app;
      this.root = h('div.messages-panel', { role: 'log', 'aria-live': 'polite' });
      host.appendChild(this.root);
    }
    render() {
      const app = this.app;
      clear(this.root);
      const fault = app.rt.fault;
      if (fault && app.rt.state === 'FAULT') {
        const row = h('div.msg.fault', null, icon('bolt', 16),
          h('span.msg-loc', { text: fault.pou + (fault.line ? ', line ' + fault.line : fault.rung !== null && fault.rung !== undefined ? ', rung ' + (fault.rung + 1) : '') }),
          h('span.msg-text', { text: 'PLC fault: ' + fault.message + ' The CPU stopped. Fix the cause and press Run again.' }));
        row.addEventListener('click', () => app.navigate({ pou: fault.pou, line: fault.line, rung: fault.rung }));
        this.root.appendChild(row);
      }
      const diags = (app.diagnostics || []).slice().sort((a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1));
      if (!diags.length && !(fault && app.rt.state === 'FAULT')) {
        this.root.appendChild(h('div.msg.ok', null, icon('check', 16), h('span.msg-text', { text: 'No problems. The program compiles.' })));
        return;
      }
      for (const d of diags) {
        let loc = d.pou || '';
        if (d.line) loc += ', line ' + d.line;
        else if (d.rung !== undefined && d.rung !== null) loc += ', rung ' + (d.rung + 1);
        if (d.tagRow !== undefined) loc = 'Tags, row ' + (d.tagRow + 1);
        const row = h('div.msg.' + d.severity, { tabindex: '0', role: 'button' },
          icon(d.severity === 'error' ? 'x' : 'info', 16),
          h('span.msg-loc', { text: loc }),
          h('span.msg-text', { text: d.message.replace(/^Rung \d+: /, '') }));
        if (d.unknownName && PLC.util.isIdentifier(d.unknownName)) {
          const fix = button('Create tag ' + d.unknownName, { cls: 'xs', onClick: (e) => { e.stopPropagation(); app.quickCreateTag(d.unknownName, d); } });
          row.appendChild(fix);
        }
        const go = () => app.navigate(d);
        row.addEventListener('click', go);
        row.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
        this.root.appendChild(row);
      }
    }
  }

  // ======================================================================== ST equivalent of the ladder
  class STViewPanel {
    constructor(app, host) {
      this.app = app;
      this.root = h('div.stview-panel');
      const tb = h('div.panel-toolbar');
      this.info = h('span.small.muted');
      tb.appendChild(this.info);
      tb.appendChild(h('span.tb-spacer'));
      this.copyBtn = button('Copy', { icon: 'copy', cls: 'sm', onClick: () => PLC.dom.copyText(this.text || '').then(ok => PLC.dom.toast(ok ? 'Copied' : 'Copy failed', ok ? '' : 'warn')) });
      this.newBtn = button('Open as ST program', { icon: 'plus', cls: 'sm', onClick: () => {
        const ld = this.app.activePou;
        this.app.addPou('ST', ld.name + '_ST', '(* Translated from the ladder program ' + ld.name + '. Both programs run in every scan:\n   delete or rename one of them so the outputs are not written twice. *)\n\n' + this.text);
        PLC.dom.toast('Created ' + ld.name + '_ST. The ladder program still runs too.', 'info', 4000);
      } });
      tb.append(this.copyBtn, this.newBtn);
      this.pre = h('pre.code-view');
      this.root.append(tb, this.pre);
      host.appendChild(this.root);
    }
    render() {
      const pou = this.app.activePou;
      if (!pou || pou.lang !== 'LD') {
        this.text = '';
        this.info.textContent = 'Open a ladder program to see its Structured Text equivalent.';
        this.pre.textContent = '';
        this.copyBtn.disabled = this.newBtn.disabled = true;
        return;
      }
      this.copyBtn.disabled = this.newBtn.disabled = false;
      this.info.textContent = 'The same logic as "' + pou.name + '", written in Structured Text. Updates while you edit.';
      this.text = PLC.ladder.toST(pou, name => this.app.fbInfo(name));
      this.pre.innerHTML = PLC.stHighlight(this.text);
    }
  }

  PLC.panels = { TagsPanel, WatchPanel, MessagesPanel, STViewPanel, renameReferences, countReferences, crossReference };
})(window.PLC = window.PLC || {});
