/* LadderLab — interactive ladder editor. */
(function (PLC) {
  'use strict';
  const { h, s, icon, button, menu } = PLC.dom;
  const L = () => PLC.ladder;
  const KINDS = () => PLC.ladder.KINDS;
  const G = () => PLC.ladderView.G;

  const PALETTE = [
    { group: 'Contacts', items: [['NO', '1'], ['NC', '2'], ['P', ''], ['N', '']] },
    { group: 'Coils', items: [['COIL', '3'], ['NCOIL', ''], ['SET', '4'], ['RESET', '5']] },
    { group: 'Timers', menu: true, items: [['TON', '6'], ['TOF', ''], ['TP', ''], ['TONR', '']] },
    { group: 'Counters', menu: true, items: [['CTU', '7'], ['CTD', ''], ['CTUD', '']] },
    { group: 'Compare', menu: true, items: [['EQ', ''], ['NE', ''], ['GT', ''], ['GE', ''], ['LT', ''], ['LE', '']] },
    { group: 'Math', menu: true, items: [['MOVE', ''], ['ADD', ''], ['SUB', ''], ['MUL', ''], ['DIV', ''], ['MOD', '']] },
    { group: 'More', menu: true, items: [['R_TRIG', ''], ['F_TRIG', ''], ['SR', ''], ['RS', ''], ['CALL', '']] }
  ];
  const SHORTCUTS = { '1': 'NO', '2': 'NC', '3': 'COIL', '4': 'SET', '5': 'RESET', '6': 'TON', '7': 'CTU' };
  const INSTANCE_PREFIX = { TON: 'T', TOF: 'T', TP: 'T', TONR: 'T', CTU: 'C', CTD: 'C', CTUD: 'C', R_TRIG: 'Edge', F_TRIG: 'Edge', SR: 'Latch', RS: 'Latch' };
  const PARAM_DEFAULTS = { TON: { PT: 'T#2s' }, TOF: { PT: 'T#2s' }, TP: { PT: 'T#1s' }, TONR: { PT: 'T#10s' }, CTU: { PV: '5' }, CTD: { PV: '5' }, CTUD: { PV: '5' } };

  /** Small inline SVG symbol for palette buttons. */
  function paletteSymbol(kind) {
    const KD = KINDS()[kind];
    const svg = s('svg', { viewBox: '0 0 40 20', width: 34, height: 17, class: 'pal-sym', 'aria-hidden': 'true' });
    const ln = (x1, y1, x2, y2) => svg.appendChild(s('line', { x1, y1, x2, y2 }));
    if (KD.cat === 'contact') {
      ln(0, 10, 15, 10); ln(25, 10, 40, 10); ln(15, 3, 15, 17); ln(25, 3, 25, 17);
      if (kind === 'NC') ln(12, 16, 28, 4);
      if (kind === 'P' || kind === 'N') svg.appendChild(s('text', { x: 20, y: 14, 'text-anchor': 'middle' }, kind));
    } else if (KD.cat === 'coil') {
      ln(0, 10, 12, 10); ln(28, 10, 40, 10);
      svg.appendChild(s('path', { d: 'M15 3 Q10 10 15 17' }));
      svg.appendChild(s('path', { d: 'M25 3 Q30 10 25 17' }));
      const l = { NCOIL: '/', SET: 'S', RESET: 'R' }[kind];
      if (l) svg.appendChild(s('text', { x: 20, y: 14, 'text-anchor': 'middle' }, l));
    }
    return svg;
  }

  function kindLabel(kind) {
    const KD = KINDS()[kind];
    if (KD.cat === 'call') return 'FB call  Your own function block';
    if (KD.cat === 'cmp') return { EQ: '=', NE: '≠', GT: '>', GE: '≥', LT: '<', LE: '≤' }[kind] + '  ' + KD.label;
    return kind + '  ' + KD.label;
  }

  class LadderEditor {
    constructor(app, host) {
      this.app = app;
      this.host = host;
      this.pou = null;
      this.sel = [];            // selected element ids (contiguous, same series)
      this.selRung = null;      // selected rung id
      this.cursor = null;       // { seriesId, index }
      this.r = null;            // last render result
      this.valueCache = new Map();
      this.clipboard = null;
      this.build();
    }

    build() {
      const tb = h('div.ld-toolbar', { role: 'toolbar', 'aria-label': 'Ladder instructions' });
      const struct = h('div.tb-group');
      struct.appendChild(button('Rung', { icon: 'plus', title: 'Add a new rung below the selected one (N)', onClick: () => this.addRung() }));
      struct.appendChild(button('Branch', { icon: 'branch', title: 'Add a parallel branch around the selected elements (B)', onClick: () => this.branch() }));
      struct.appendChild(button('Delete', { icon: 'trash', iconOnly: true, title: 'Delete selection (Del)', onClick: () => this.deleteSelection() }));
      const more = button('Rung actions', { icon: 'menu', iconOnly: true, title: 'More rung actions: move, comment, duplicate, edit as text' });
      more.addEventListener('click', () => menu(more, [
        { header: this.selRung ? 'Rung ' + (this.rungs.findIndex(r => r.id === this.selRung) + 1) : 'Select a rung first' },
        { label: 'Edit comment…', icon: 'comment', onClick: () => this.editComment() },
        { label: 'Move up', icon: 'up', onClick: () => this.moveRung(-1) },
        { label: 'Move down', icon: 'down', onClick: () => this.moveRung(1) },
        { label: 'Duplicate', icon: 'copy', hint: 'Ctrl+D', onClick: () => this.duplicateRung() },
        { label: 'Edit as text…', icon: 'text', onClick: () => this.editRungText() },
        { label: 'Export diagram as PNG', icon: 'image', onClick: () => this.app.exportLadder('png') },
        { sep: true },
        { label: 'Delete rung', icon: 'trash', onClick: () => { this.sel = []; this.cursor = null; this.deleteSelection(); } }
      ]));
      struct.appendChild(more);
      tb.appendChild(struct);
      this.zoom = (this.app.ui && this.app.ui.zoom) || 1;
      this.zoomLabel = h('button.btn.ghost.sm.zoom-label', { type: 'button', title: 'Reset zoom to 100%', text: Math.round(this.zoom * 100) + '%' });
      this.zoomLabel.addEventListener('click', () => this.setZoom(1));
      const zoomGroup = h('div.tb-group.zoom-group', { role: 'group', 'aria-label': 'Zoom' },
        button('Zoom out', { icon: 'minus', iconOnly: true, cls: 'ghost sm', title: 'Zoom out (Ctrl + mouse wheel)', onClick: () => this.setZoom(this.zoom - 0.1) }),
        this.zoomLabel,
        button('Zoom in', { icon: 'plus', iconOnly: true, cls: 'ghost sm', title: 'Zoom in (Ctrl + mouse wheel)', onClick: () => this.setZoom(this.zoom + 0.1) }));
      for (const grp of PALETTE) {
        const g = h('div.tb-group', { role: 'group', 'aria-label': grp.group });
        if (grp.menu) {
          const b = button(grp.group, { cls: 'pal-menu', title: grp.group });
          b.appendChild(icon('chevronDown', 14));
          b.addEventListener('click', () => {
            const m = menu(b, grp.items.map(([k, key]) => ({ label: kindLabel(k), hint: key ? key : '', onClick: () => this.insertKind(k) })));
            m.querySelectorAll('.menu-item').forEach((el, i) => this.makeDraggable(el, grp.items[i][0]));
          });
          g.appendChild(b);
        } else {
          for (const [k, key] of grp.items) {
            const KD = KINDS()[k];
            const b = h('button.btn.pal', { type: 'button', title: KD.label + (key ? '  (' + key + ')' : '') + '\n' + KD.help + '\nClick to insert, or drag onto the rung.', 'aria-label': KD.label, dataset: { kind: k } });
            b.appendChild(paletteSymbol(k));
            b.addEventListener('click', () => { if (!this._dragged) this.insertKind(k); });
            this.makeDraggable(b, k);
            g.appendChild(b);
          }
        }
        tb.appendChild(g);
      }
      tb.appendChild(zoomGroup);
      this.scroll = h('div.ld-scroll', { tabindex: '0', 'aria-label': 'Ladder diagram. Use arrow keys to move the selection, Enter to edit, Delete to remove.' });
      this.empty = h('div.ld-empty', null,
        h('p', { text: 'This program has no rungs yet.' }),
        button('Add the first rung', { icon: 'plus', cls: 'primary', onClick: () => this.addRung() }));
      this.pop = h('div.ld-pop', { hidden: true, role: 'dialog', 'aria-label': 'Element properties' });
      this.root = h('div.ld-editor', null, tb, h('div.ld-canvas', null, this.scroll, this.empty, this.pop));
      this.host.appendChild(this.root);
      this.bindEvents();
    }

    // ------------------------------------------------------------------ model helpers
    get rungs() { return this.pou ? this.pou.rungs : []; }
    rungOf(id) { return this.rungs.find(r => r.id === id) || null; }
    locate(id) { return L().findInProgram(this.rungs, id); }

    setPou(pou) {
      if (this.pou !== pou) { this.sel = []; this.selRung = null; this.cursor = null; this.closePop(); }
      this.pou = pou;
      this.render();
    }

    mutate(label, fn, coalesce) {
      this.app.mutate(label, () => fn(), { coalesce, render: false });
      this.render();
    }

    // ------------------------------------------------------------------ rendering
    render() {
      if (!this.pou) return;
      const diags = this.app.diagnostics || [];
      const errors = new Map(), rungErrors = new Map();
      for (const d of diags) {
        if (d.pouId !== this.pou.id) continue;
        if (d.elemId && d.severity === 'error') errors.set(d.elemId, d.message);
        else if (d.rungId && !d.elemId) rungErrors.set(d.rungId, d.message);
      }
      const top = this.scroll.scrollTop, left = this.scroll.scrollLeft;
      const live = this.app.rt.state === 'RUN' || this.app.rt.state === 'FAULT';
      this.r = PLC.ladderView.renderProgram(this.rungs, {
        editable: true,
        selected: new Set(this.sel),
        selectedRung: this.selRung,
        cursor: this.cursor,
        errors, rungErrors,
        tagInfo: name => this.app.tagInfo(name),
        fbInfo: name => this.app.fbInfo(name),
        minWidth: Math.max(480, (this.scroll.clientWidth - 4) / this.zoom),
        live: true
      });
      this.scroll.textContent = '';
      if (this.zoom !== 1) {
        this.r.svg.setAttribute('width', Math.round(this.r.width * this.zoom));
        this.r.svg.setAttribute('height', Math.round(this.r.height * this.zoom));
      }
      this.scroll.appendChild(this.r.svg);
      this.scroll.scrollTop = top; this.scroll.scrollLeft = left;
      this.empty.hidden = this.rungs.length > 0;
      this.valueCache.clear();
      for (const w of this.r.wires) w.on = undefined;
      if (this._exec) this.markExec(this._exec);
      this.updateLive(true);
      void live;
    }

    /** Scan debugger: highlight the rung that just ran and dim the rungs still to come in this scan. */
    markExec(info) {
      this._exec = info;
      if (!this.r || !this.pou) return;
      const pending = new Set();
      let cur = -1;
      if (info) {
        info.phases.forEach((ph, i) => {
          if (ph.kind !== 'rung' || ph.pou !== this.pou.name) return;
          if (i === info.done - 1) cur = ph.index;
          else if (i >= info.done) pending.add(ph.index);
        });
      }
      this.r.rungs.forEach((rr, i) => {
        rr.el.classList.toggle('exec', i === cur);
        rr.el.classList.toggle('pending', !!info && pending.has(i));
      });
    }

    valueOf(expr) {
      let c = this.valueCache.get(expr);
      if (c === undefined) {
        c = null;
        try {
          if (this.app.compiled) {
            const res = this.app.compiled.compileWatchExpr(expr);
            if (res && !res.isConst) c = res;
          }
        } catch (e) { c = null; }
        this.valueCache.set(expr, c);
      }
      if (!c) return null;
      const mem = this.app.rt.mem;
      if (!mem) return null;
      try {
        const v = c.fn({ self: null, g: mem.g, io: mem.io, ctx: { now: this.app.rt.time, ops: 0, maxOps: 1000, depth: 0 } });
        return PLC.types.formatValue(c.type.name === 'ANY_INT' ? 'DINT' : c.type.name, v);
      } catch (e) { return null; }
    }

    updateLive(force) {
      if (!this.r) return;
      const rt = this.app.rt;
      const running = rt.state === 'RUN' || (rt.state === 'FAULT');
      if (!running && !force && !this._wasRunning) return;
      this._wasRunning = running;
      PLC.ladderView.updateLive(this.r, rt.mem && rt.mem.flow, running ? (e => this.valueOf(e)) : null, running);
      this.root.classList.toggle('online', running);
    }

    // ------------------------------------------------------------------ events
    bindEvents() {
      const sc = this.scroll;
      sc.addEventListener('pointerdown', e => this.onPointerDown(e));
      sc.addEventListener('dblclick', e => {
        const elId = this.hitElement(e.target);
        if (elId) { this.select([elId]); this.openPop(elId); return; }
        const rungId = this.hitRung(e.target);
        if (rungId && e.target.classList.contains('rung-comment')) this.editComment(rungId);
      });
      sc.addEventListener('contextmenu', e => {
        const elId = this.hitElement(e.target);
        if (!elId) return;
        e.preventDefault();
        if (!this.sel.includes(elId)) this.select([elId]);
        const anchor = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) };
        this.contextMenu(anchor, elId);
      });
      sc.addEventListener('keydown', e => this.onKey(e));
      sc.addEventListener('wheel', e => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        this.setZoom(this.zoom + (e.deltaY < 0 ? 0.1 : -0.1));
      }, { passive: false });
      sc.addEventListener('scroll', () => { if (!this.pop.hidden) this.positionPop(); });
    }

    hitElement(t) {
      const g = t.closest && t.closest('g.el');
      return g ? g.getAttribute('data-id') : null;
    }
    hitRung(t) {
      const g = t.closest && t.closest('[data-rung]');
      return g ? g.getAttribute('data-rung') : null;
    }

    onPointerDown(e) {
      if (e.button !== 0) return;
      const t = e.target;
      const ins = t.closest && t.closest('g.ins');
      if (ins) {
        e.preventDefault();
        this.cursor = { seriesId: ins.getAttribute('data-series'), index: parseInt(ins.getAttribute('data-index'), 10) };
        this.sel = [];
        const f = this.locate(this.cursor.seriesId);
        this.selRung = f ? f.rung.id : null;
        this.closePop();
        this.render();
        this.scroll.focus({ preventScroll: true });
        return;
      }
      const elId = this.hitElement(t);
      if (elId) {
        if (e.shiftKey && this.sel.length) this.extendSelection(elId);
        else if (!this.sel.includes(elId) || this.sel.length > 1) this.select([elId]);
        this.scroll.focus({ preventScroll: true });
        // possible drag to move
        const start = { x: e.clientX, y: e.clientY };
        const move = (ev) => {
          if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 6) {
            cleanup();
            this.startDrag({ moveIds: this.sel.slice() }, ev);
          }
        };
        const cleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', cleanup); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', cleanup);
        return;
      }
      const rungId = this.hitRung(t);
      this.sel = [];
      this.cursor = null;
      this.selRung = rungId;
      this.closePop();
      this.render();
      this.scroll.focus({ preventScroll: true });
    }

    select(ids) {
      this.sel = ids;
      this.cursor = null;
      if (ids.length) { const f = this.locate(ids[0]); this.selRung = f ? f.rung.id : this.selRung; }
      this.render();
    }

    extendSelection(id) {
      const a = this.locate(this.sel[0]), b = this.locate(id);
      if (!a || !b || a.parent !== b.parent || a.parent.t !== 'S') { this.select([id]); return; }
      const items = a.parent.items;
      const lo = Math.min(a.index, b.index), hi = Math.max(a.index, b.index);
      this.select(items.slice(lo, hi + 1).map(x => x.id));
    }

    onKey(e) {
      if (e.target !== this.scroll) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); this.copy(); return; }
      if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); this.copy(); this.deleteSelection(); return; }
      if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); this.paste(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); this.duplicateRung(); return; }
      if (mod) return;
      switch (e.key) {
        case 'Delete': case 'Backspace': e.preventDefault(); this.deleteSelection(); return;
        case 'Enter': case 'F2': if (this.sel.length) { e.preventDefault(); this.openPop(this.sel[0]); } return;
        case 'Escape': this.sel = []; this.cursor = null; this.closePop(); this.render(); return;
        case 'ArrowLeft': case 'ArrowRight': e.preventDefault(); this.moveSelection(e.key === 'ArrowLeft' ? -1 : 1); return;
        case 'ArrowUp': case 'ArrowDown': e.preventDefault(); this.moveRungSelection(e.key === 'ArrowUp' ? -1 : 1); return;
        case 'b': case 'B': e.preventDefault(); this.branch(); return;
        case 'n': case 'N': e.preventDefault(); this.addRung(); return;
      }
      if (SHORTCUTS[e.key]) { e.preventDefault(); this.insertKind(SHORTCUTS[e.key]); }
    }

    flatElements() {
      const out = [];
      for (const r of this.rungs) PLC.ladder.walk(r.body, el => out.push({ el, rungId: r.id }));
      return out;
    }

    moveSelection(dir) {
      const all = this.flatElements();
      if (!all.length) return;
      let i = this.sel.length ? all.findIndex(x => x.el.id === (dir > 0 ? this.sel[this.sel.length - 1] : this.sel[0])) : -1;
      i = i < 0 ? (dir > 0 ? 0 : all.length - 1) : Math.max(0, Math.min(all.length - 1, i + dir));
      this.select([all[i].el.id]);
      this.scrollIntoView(all[i].el.id);
    }

    moveRungSelection(dir) {
      if (!this.rungs.length) return;
      let i = this.rungs.findIndex(r => r.id === this.selRung);
      i = i < 0 ? 0 : Math.max(0, Math.min(this.rungs.length - 1, i + dir));
      const r = this.rungs[i];
      const first = PLC.ladder.elementsOf(r.body)[0];
      if (first) this.select([first.id]);
      else { this.sel = []; this.selRung = r.id; this.render(); }
      if (first) this.scrollIntoView(first.id);
    }

    scrollIntoView(id) {
      const r = this.r && this.r.elems.get(id);
      if (!r) return;
      const z = this.zoom, sc = this.scroll;
      const e = { x: r.x * z, y: r.y * z, w: r.w * z, h: r.h * z };
      if (e.x < sc.scrollLeft) sc.scrollLeft = e.x - 20;
      if (e.x + e.w > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = e.x + e.w - sc.clientWidth + 20;
      if (e.y < sc.scrollTop) sc.scrollTop = e.y - 20;
      if (e.y + e.h > sc.scrollTop + sc.clientHeight) sc.scrollTop = e.y + e.h - sc.clientHeight + 20;
    }

    /** Zoom the diagram (useful on a projector). */
    setZoom(z) {
      z = Math.round(Math.max(0.5, Math.min(2, z)) * 10) / 10;
      if (z === this.zoom) return;
      this.zoom = z;
      this.app.ui.zoom = z;
      this.app.saveUiSoon();
      if (this.zoomLabel) this.zoomLabel.textContent = Math.round(z * 100) + '%';
      this.render();
      if (!this.pop.hidden) this.positionPop();
    }

    // ------------------------------------------------------------------ operations
    ensureRung() {
      if (!this.rungs.length) {
        const r = PLC.ladder.makeRung();
        this.rungs.push(r);
        this.selRung = r.id;
      }
      return this.rungOf(this.selRung) || this.rungs[this.rungs.length - 1];
    }

    insertTarget(kind) {
      if (this.cursor && this.locate(this.cursor.seriesId)) return this.cursor;
      if (this.sel.length) {
        const f = this.locate(this.sel[this.sel.length - 1]);
        if (f && f.parent && f.parent.t === 'S') return { seriesId: f.parent.id, index: f.index + 1 };
      }
      const rung = this.ensureRung();
      this.selRung = rung.id;
      const items = rung.body.items;
      const KD = KINDS()[kind];
      if (KD.cat === 'coil') return { seriesId: rung.body.id, index: items.length };
      let k = items.length;
      while (k > 0 && PLC.ladderView.isTrailingOutput(items[k - 1])) k--;
      return { seriesId: rung.body.id, index: k };
    }

    nextInstanceName(kind) {
      const prefix = INSTANCE_PREFIX[kind] || 'FB';
      const used = new Set(this.app.project.tags.map(t => t.name.toLowerCase()));
      for (let n = 1; n < 1000; n++) { if (!used.has((prefix + n).toLowerCase())) return prefix + n; }
      return prefix + Date.now();
    }

    newElement(kind) {
      const KD = KINDS()[kind];
      const el = PLC.ladder.makeElement(kind, '', PARAM_DEFAULTS[kind] || {});
      if (KD.cat === 'fb') {
        el.tag = this.nextInstanceName(kind);
        this.app.project.tags.push({ name: el.tag, type: KD.fb, address: '', init: '', comment: KD.label });
        PLC.dom.toast('Created tag ' + el.tag + ' of type ' + KD.fb, 'info');
      }
      return el;
    }

    insertKind(kind, target) {
      if (!this.pou) return;
      let el;
      this.mutate('Insert ' + kind, () => {
        const t = target || this.insertTarget(kind);
        el = this.newElement(kind);
        const at = this.locate(t.seriesId);
        PLC.ladder.insertAt(at ? at.rung.body : this.ensureRung().body, t.seriesId, t.index, el);
      });
      this.cursor = null;
      this.select([el.id]);
      this.scrollIntoView(el.id);
      const KD = KINDS()[kind];
      if (KD.cat !== 'fb' || KD.paramInfo.some(p => p.required)) this.openPop(el.id, true);
    }

    addRung() {
      if (!this.pou) return;
      const r = PLC.ladder.makeRung();
      this.mutate('Add rung', () => {
        const i = this.rungs.findIndex(x => x.id === this.selRung);
        if (i < 0) this.rungs.push(r); else this.rungs.splice(i + 1, 0, r);
      });
      this.sel = []; this.selRung = r.id;
      this.cursor = { seriesId: r.body.id, index: 0 };
      this.render();
      const rr = this.r.rungs.find(x => x.id === r.id);
      if (rr) this.scroll.scrollTop = Math.max(0, rr.y * this.zoom - 40);
      this.scroll.focus({ preventScroll: true });
    }

    branch() {
      if (this.sel.length) {
        const f = this.locate(this.sel[0]);
        if (!f || !f.parent || f.parent.t !== 'S') return;
        const idxs = this.sel.map(id => this.locate(id).index);
        const lo = Math.min(...idxs), hi = Math.max(...idxs);
        // the selection fills a whole path of an existing branch: add another path to that branch
        const owner = hi - lo + 1 === f.parent.items.length ? PLC.ladder.find(f.rung.body, f.parent.id) : null;
        let newBranch;
        this.mutate('Add branch', () => {
          if (owner && owner.parent && owner.parent.t === 'P') newBranch = PLC.ladder.addBranch(f.rung.body, owner.parent.id, owner.index);
          else newBranch = PLC.ladder.wrapInParallel(f.rung.body, f.parent.id, lo, hi);
        });
        this.sel = [];
        this.cursor = { seriesId: newBranch.id, index: 0 };
        this.render();
        PLC.dom.toast('Branch added. Now insert an element into the new branch.', 'info');
        return;
      }
      PLC.dom.toast('Select the element(s) the new branch should go around, then click Branch.', 'warn');
    }

    deleteSelection() {
      if (!this.pou) return;
      if (this.sel.length) {
        const f = this.locate(this.sel[0]);
        this.mutate('Delete', () => PLC.ladder.removeNodes(f.rung.body, this.sel));
        this.sel = [];
        this.closePop();
        this.render();
        return;
      }
      if (this.cursor) {
        const f = this.locate(this.cursor.seriesId);
        if (f && f.parent && f.parent.t === 'P' && f.node.items.length === 0) {
          this.mutate('Delete branch', () => { f.parent.branches.splice(f.index, 1); PLC.ladder.normalize(f.rung.body); });
          this.cursor = null;
          this.render();
          return;
        }
      }
      if (this.selRung) {
        const i = this.rungs.findIndex(r => r.id === this.selRung);
        if (i < 0) return;
        this.mutate('Delete rung', () => this.rungs.splice(i, 1));
        const next = this.rungs[Math.min(i, this.rungs.length - 1)];
        this.selRung = next ? next.id : null;
        this.cursor = null;
        this.render();
      }
    }

    moveRung(dir) {
      const i = this.rungs.findIndex(r => r.id === this.selRung);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= this.rungs.length) return;
      this.mutate('Move rung', () => { const [r] = this.rungs.splice(i, 1); this.rungs.splice(j, 0, r); });
    }

    async editComment(rungId) {
      const r = this.rungOf(rungId || this.selRung);
      if (!r) { PLC.dom.toast('Select a rung first.', 'warn'); return; }
      const v = await PLC.dom.prompt('Rung comment', 'Describe what this rung does', r.comment || '');
      if (v === null) return;
      this.mutate('Edit comment', () => { r.comment = v.trim(); });
    }

    async editRungText() {
      const r = this.rungOf(this.selRung);
      if (!r) { PLC.dom.toast('Select a rung first.', 'warn'); return; }
      const ta = h('textarea.input.mono', { rows: 4, spellcheck: 'false', autofocus: true, 'aria-label': 'Rung text' });
      ta.value = PLC.ladder.seriesToText(r.body);
      const err = h('div.field-error');
      const help = h('p.muted.small', { html: 'Elements are written as <code>KIND(tag, PARAM=value)</code> in series. A parallel branch is <code>[ path | path ]</code>. Example: <code>[ NO(Start) | NO(Motor) ] NO(Stop) COIL(Motor)</code>' });
      const body = h('div.stack', null, help, ta, err);
      for (;;) {
        const ok = await PLC.dom.modal('Rung ' + (this.rungs.indexOf(r) + 1) + ' as text', body, [{ label: 'Cancel', value: false }, { label: 'Apply', value: true, primary: true }], { cancelValue: false, wide: true });
        if (!ok) return;
        try {
          const ser = PLC.ladder.parseRungText(ta.value);
          this.mutate('Edit rung text', () => { r.body = ser; });
          return;
        } catch (e) { err.textContent = e.message; }
      }
    }

    copy() {
      if (this.sel.length) {
        const nodes = this.sel.map(id => this.locate(id)).filter(Boolean).map(f => JSON.parse(JSON.stringify(f.node)));
        this.clipboard = { type: 'nodes', nodes };
        PLC.dom.toast('Copied ' + nodes.length + ' element' + (nodes.length > 1 ? 's' : ''));
      } else if (this.selRung) {
        this.clipboard = { type: 'rung', rung: JSON.parse(JSON.stringify(this.rungOf(this.selRung))) };
        PLC.dom.toast('Copied rung');
      }
    }

    paste() {
      const c = this.clipboard;
      if (!c || !this.pou) return;
      if (c.type === 'rung') {
        const r = PLC.ladder.cloneRung(c.rung);
        this.mutate('Paste rung', () => {
          const i = this.rungs.findIndex(x => x.id === this.selRung);
          this.rungs.splice(i < 0 ? this.rungs.length : i + 1, 0, r);
        });
        this.selRung = r.id; this.sel = []; this.render();
        return;
      }
      const nodes = c.nodes.map(n => PLC.ladder.cloneNode(n));
      this.mutate('Paste', () => {
        const t = this.insertTarget('NO');
        PLC.ladder.insertAt(this.locate(t.seriesId).rung.body, t.seriesId, t.index, nodes);
      });
      this.select(nodes.filter(n => n.t === 'E').map(n => n.id));
    }

    duplicateRung() {
      const r = this.rungOf(this.selRung);
      if (!r) return;
      const copy = PLC.ladder.cloneRung(r);
      this.mutate('Duplicate rung', () => { this.rungs.splice(this.rungs.indexOf(r) + 1, 0, copy); });
      this.selRung = copy.id; this.sel = []; this.render();
    }

    contextMenu(anchor, elId) {
      const f = this.locate(elId);
      if (!f) return;
      const el = f.node;
      const KD = KINDS()[el.kind];
      const items = [
        { label: 'Edit…', icon: 'edit', hint: 'Enter', onClick: () => this.openPop(elId) },
        { label: 'Add branch around', icon: 'branch', hint: 'B', onClick: () => this.branch() },
        { label: 'Copy', icon: 'copy', hint: 'Ctrl+C', onClick: () => this.copy() },
        { label: 'Delete', icon: 'trash', hint: 'Del', onClick: () => this.deleteSelection() }
      ];
      if (KD && KD.cat === 'contact') {
        items.splice(1, 0, { label: el.kind === 'NO' ? 'Change to NC' : 'Change to NO', onClick: () => this.mutate('Change contact', () => { el.kind = el.kind === 'NO' ? 'NC' : 'NO'; }) });
      }
      menu(anchor, items);
    }

    // ------------------------------------------------------------------ drag & drop
    makeDraggable(el, kind) {
      el.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        const start = { x: e.clientX, y: e.clientY };
        this._dragged = false;
        const move = (ev) => {
          if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 6) {
            cleanup();
            this._dragged = true;
            PLC.dom.closeMenu();
            this.startDrag({ kind }, ev);
          }
        };
        const cleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', cleanup); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', cleanup);
      });
    }

    startDrag(what, ev) {
      if (!this.pou) return;
      if (!this.rungs.length) { this.app.mutate('Add rung', () => this.rungs.push(PLC.ladder.makeRung()), { render: false }); this.render(); }
      const ghost = h('div.drag-ghost', { text: what.kind ? KINDS()[what.kind].label : 'Move ' + what.moveIds.length + ' element' + (what.moveIds.length > 1 ? 's' : '') });
      document.body.appendChild(ghost);
      this.root.classList.add('dragging');
      const moving = new Set(what.moveIds || []);
      const zoneLayer = s('g', { class: 'zones' });
      this.r.svg.appendChild(zoneLayer);
      // branch zones under elements
      const zones = [];
      for (const [id, e] of this.r.elems) {
        if (moving.has(id)) continue;
        const z = { id, x: e.x + 4, y: e.y + G().WY + 16, w: e.w - 8, h: Math.max(18, e.h - G().WY - 18) };
        zones.push(z);
      }
      const lastRung = this.r.rungs[this.r.rungs.length - 1];
      const newRungZone = { x: 0, y: lastRung ? lastRung.y + lastRung.h : 0, w: this.r.width, h: 40 };
      const zoneRect = s('rect', { class: 'zone', rx: 4 });
      const newRungRect = s('rect', { class: 'zone newrung', x: 8, y: newRungZone.y + 4, width: this.r.width - 16, height: 30, rx: 5 });
      zoneLayer.appendChild(newRungRect);
      zoneLayer.appendChild(zoneRect);
      let target = null;
      const svgPt = (cx, cy) => {
        const b = this.r.svg.getBoundingClientRect();
        return { x: (cx - b.left) / this.zoom, y: (cy - b.top) / this.zoom };
      };
      const onMove = (e) => {
        ghost.style.left = (e.clientX + 12) + 'px';
        ghost.style.top = (e.clientY + 10) + 'px';
        const p = svgPt(e.clientX, e.clientY);
        target = null;
        let best = 28;
        for (const ip of this.r.ins) {
          const d = Math.hypot(ip.x - p.x, ip.y - p.y);
          if (d < best) { best = d; target = { type: 'ins', seriesId: ip.seriesId, index: ip.index, el: ip.el }; }
        }
        if (!target) {
          for (const z of zones) if (p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h) { target = { type: 'branch', id: z.id, z }; break; }
        }
        if (!target && p.y >= newRungZone.y && p.y <= newRungZone.y + newRungZone.h) target = { type: 'newrung' };
        this.r.ins.forEach(ip => ip.el.classList.toggle('hot', !!(target && target.type === 'ins' && ip.el === target.el)));
        if (target && target.type === 'branch') {
          zoneRect.setAttribute('x', target.z.x); zoneRect.setAttribute('y', target.z.y);
          zoneRect.setAttribute('width', target.z.w); zoneRect.setAttribute('height', target.z.h);
          zoneRect.style.display = '';
        } else zoneRect.style.display = 'none';
        newRungRect.classList.toggle('hot', !!(target && target.type === 'newrung'));
        // autoscroll
        const sb = this.scroll.getBoundingClientRect();
        if (e.clientY > sb.bottom - 30) this.scroll.scrollTop += 12;
        if (e.clientY < sb.top + 30) this.scroll.scrollTop -= 12;
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('keydown', onEsc, true);
        ghost.remove();
        this.root.classList.remove('dragging');
        zoneLayer.remove();
        if (target) this.drop(what, target);
        else this.render();
        setTimeout(() => { this._dragged = false; }, 0);
      };
      const onEsc = (e) => { if (e.key === 'Escape') { target = null; onUp(); } };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('keydown', onEsc, true);
      onMove(ev);
    }

    drop(what, target) {
      const snapshot = JSON.stringify(this.pou.rungs);
      let nodes = null, ok = true, newIds = [];
      this.app.mutate(what.kind ? 'Insert ' + what.kind : 'Move', () => {
        if (what.kind) nodes = [this.newElement(what.kind)];
        else {
          const first = this.locate(what.moveIds[0]);
          if (!first) { ok = false; return; }
          // remember target position relative to a neighbour that is not moved
          let anchor = null;
          if (target.type === 'ins') {
            const ser = this.locate(target.seriesId);
            if (!ser) { ok = false; return; }
            const items = ser.node.items;
            for (let i = target.index; i < items.length; i++) if (!what.moveIds.includes(items[i].id)) { anchor = items[i].id; break; }
            target.anchor = anchor;
          }
          nodes = PLC.ladder.detach(first.rung.body, what.moveIds);
        }
        newIds = nodes.map(n => n.id);
        if (target.type === 'newrung') {
          const r = PLC.ladder.makeRung(PLC.ladder.makeSeries(nodes));
          this.rungs.push(r);
          return;
        }
        if (target.type === 'branch') {
          const f = this.locate(target.id);
          if (!f) { ok = false; return; }
          const nb = PLC.ladder.wrapInParallel(f.rung.body, f.parent.id, f.index, f.index);
          nb.items.push(...nodes);
          return;
        }
        const ser = this.locate(target.seriesId);
        if (!ser) { ok = false; return; }
        let index = target.index;
        if (!what.kind) index = target.anchor ? ser.node.items.findIndex(x => x.id === target.anchor) : ser.node.items.length;
        if (index < 0) index = ser.node.items.length;
        ser.node.items.splice(index, 0, ...nodes);
        PLC.ladder.normalize(ser.rung.body);
      }, { render: false });
      if (!ok) {
        this.pou.rungs = JSON.parse(snapshot);
        this.app.changed();
        PLC.dom.toast('Cannot drop there.', 'warn');
      }
      this.cursor = null;
      this.select(newIds.filter(id => this.locate(id)));
      if (what.kind && newIds.length) {
        const KD = KINDS()[what.kind];
        if (KD.cat !== 'fb' || KD.paramInfo.some(p => p.required)) this.openPop(newIds[0], true);
      }
    }

    // ------------------------------------------------------------------ property popover
    closePop() {
      if (this.pop.hidden) return;
      this.pop.hidden = true;
      this.pop.textContent = '';
      this.popId = null;
    }

    positionPop() {
      const e = this.r && this.r.elems.get(this.popId);
      if (!e) return;
      const canvas = this.pop.parentElement;
      const cw = canvas.clientWidth, ch = canvas.clientHeight;
      const pw = this.pop.offsetWidth, ph = this.pop.offsetHeight;
      const z = this.zoom;
      let x = e.x * z - this.scroll.scrollLeft + e.w * z / 2 - pw / 2;
      let y = (e.y + e.h) * z - this.scroll.scrollTop + 4;
      if (y + ph > ch - 6) y = Math.max(6, e.y * z - this.scroll.scrollTop - ph - 4);
      x = Math.max(6, Math.min(cw - pw - 6, x));
      this.pop.style.left = x + 'px';
      this.pop.style.top = Math.max(6, y) + 'px';
    }

    openPop(id, fresh) {
      const f = this.locate(id);
      if (!f || f.node.t !== 'E') return;
      const el = f.node;
      const KD = KINDS()[el.kind];
      this.popId = id;
      const pop = this.pop;
      pop.textContent = '';
      pop.hidden = false;
      const coalesce = 'pop-' + id + '-' + Date.now();
      const apply = (label, fn) => { this.app.mutate(label, fn, { coalesce, render: false }); this.render(); this.positionPop(); };

      const head = h('div.pop-head', null, h('strong', { text: KD.label }), button('Close', { icon: 'x', iconOnly: true, cls: 'ghost sm', onClick: () => { this.closePop(); this.scroll.focus(); } }));
      pop.appendChild(head);
      pop.appendChild(h('p.pop-help', { text: KD.help }));

      // kind switcher within the same family
      const family = Object.keys(KINDS()).filter(k => {
        const o = KINDS()[k];
        if (o.cat !== KD.cat) return false;
        if (KD.cat === 'fb') return (INSTANCE_PREFIX[k] || '') === (INSTANCE_PREFIX[el.kind] || '');
        return true;
      });
      if (family.length > 1 && KD.cat !== 'fb') {
        const seg = h('div.seg', { role: 'radiogroup', 'aria-label': 'Instruction' });
        for (const k of family) {
          const b = h('button.seg-btn' + (k === el.kind ? '.on' : ''), { type: 'button', title: KINDS()[k].label, role: 'radio', 'aria-checked': k === el.kind ? 'true' : 'false' });
          if (KINDS()[k].cat === 'contact' || KINDS()[k].cat === 'coil') b.appendChild(paletteSymbol(k));
          else b.appendChild(h('span', { text: KINDS()[k].cat === 'cmp' ? { EQ: '=', NE: '≠', GT: '>', GE: '≥', LT: '<', LE: '≤' }[k] : k }));
          b.addEventListener('click', () => { apply('Change instruction', () => { el.kind = k; }); this.openPop(id); });
          seg.appendChild(b);
        }
        pop.appendChild(seg);
      }

      const fields = [];
      if (KD.cat === 'call') {
        fields.push(this.tagField('Instance', el.tag, 'FBINST', false, v => { apply('Edit instance', () => { el.tag = v; }); this.openPop(id); }, fresh, 'function block instance'));
        const info = el.tag ? this.app.fbInfo(el.tag) : null;
        if (!info) {
          pop.appendChild(h('p.pop-help', { html: 'Choose a tag whose type is a function block. Write the block itself in a Structured Text POU (+ next to the program tabs, then <b>Function block</b>), then add a tag of that type.' }));
        } else {
          pop.appendChild(h('p.pop-help', { text: info.name + ': the rung drives ' + (info.powerIn || 'nothing (EN)') + ', the box passes on ' + (info.powerOut || 'the rung power (ENO)') + '.' }));
          for (const n of info.ins) fields.push(this.tagField(n + ' (input)', el.params[n] || '', 'ANY', false, v => apply('Edit ' + n, () => { if (v === '') delete el.params[n]; else el.params[n] = v; }), false, 'value or variable'));
          for (const n of info.outs) fields.push(this.tagField(n + ' (output)', el.params[n] || '', 'ANY', false, v => apply('Edit ' + n, () => { if (v === '') delete el.params[n]; else el.params[n] = v; }), false, 'optional variable', true));
        }
      } else if (KD.hasTag) {
        const wantType = KD.cat === 'fb' ? KD.fb : 'BOOL';
        fields.push(this.tagField(KD.cat === 'fb' ? 'Instance' : 'Tag', el.tag, wantType, KD.cat !== 'fb',
          v => apply('Edit tag', () => { el.tag = v; }), fresh));
      }
      for (const p of KD.paramInfo || []) {
        const ph = p.name === 'PT' ? 'e.g. T#5s' : p.name === 'PV' ? 'e.g. 10' : p.dir === 'out' ? (p.required ? 'variable' : 'optional variable') : (p.required ? 'value or variable' : 'optional');
        const wantType = p.type || (p.name === 'OUT' ? 'NUM' : 'NUM');
        fields.push(this.tagField(p.name, el.params[p.name] || '', wantType, false, v => apply('Edit ' + p.name, () => {
          if (v === '') delete el.params[p.name]; else el.params[p.name] = v;
        }), fresh && !KD.hasTag && fields.length === 0, ph, p.dir === 'out'));
      }
      for (const fl of fields) pop.appendChild(fl);

      const err = (this.app.diagnostics || []).find(d => d.elemId === id && d.severity === 'error');
      if (err) pop.appendChild(h('div.pop-error', { text: err.message.replace(/^Rung \d+: /, '') }));

      const foot = h('div.pop-foot', null,
        button('Delete', { icon: 'trash', cls: 'ghost danger-text sm', onClick: () => { this.sel = [id]; this.deleteSelection(); this.scroll.focus(); } }),
        button('Done', { cls: 'primary sm', onClick: () => { this.closePop(); this.scroll.focus(); } }));
      pop.appendChild(foot);
      pop.onkeydown = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); this.closePop(); this.scroll.focus(); }
      };
      this.positionPop();
      requestAnimationFrame(() => this.positionPop());
    }

    /** A tag input with suggestions and a quick "create tag" action. */
    tagField(label, value, wantType, boolOnly, onChange, autofocus, placeholder, isOutput) {
      const app = this.app;
      const wrap = h('div.pop-field');
      const id = 'f' + Math.random().toString(36).slice(2, 8);
      const input = h('input.input.mono', { id, type: 'text', value: value || '', spellcheck: 'false', autocomplete: 'off', placeholder: placeholder || 'tag name', 'aria-label': label });
      const list = h('div.suggest', { hidden: true, role: 'listbox' });
      const create = h('div.create', { hidden: true });
      wrap.appendChild(h('label', { for: id, text: label }));
      wrap.appendChild(h('div.suggest-wrap', null, input, list));
      wrap.appendChild(create);
      let active = -1, items = [];

      const candidates = () => {
        const out = [];
        for (const t of app.project.tags) {
          const tt = String(t.type).toUpperCase();
          if (wantType === 'BOOL') {
            if (tt === 'BOOL') out.push({ name: t.name, sub: (t.address || '') + ' ' + (t.comment || '') });
            const fb = PLC.fb.defs[tt];
            if (fb && boolOnly) for (const [m, mt] of fb.outputs) if (mt === 'BOOL') out.push({ name: t.name + '.' + m, sub: tt + ' output' });
          } else if (wantType === 'NUM' || wantType === 'INT' || wantType === 'TIME') {
            if (tt !== 'BOOL' && PLC.types.isElementary(tt)) out.push({ name: t.name, sub: tt + ' ' + (t.address || '') });
            const fb = PLC.fb.defs[tt];
            if (fb) for (const [m, mt] of fb.outputs) if (mt !== 'BOOL') out.push({ name: t.name + '.' + m, sub: tt + ' output' });
            if (wantType !== 'TIME' && !isOutput) { /* numbers can also be typed directly */ }
          } else if (wantType === 'ANY') {
            if (PLC.types.isElementary(tt)) out.push({ name: t.name, sub: tt + ' ' + (t.address || '') });
          } else if (wantType === 'FBINST') {
            if (app.compiled && app.compiled.fbTypes.has(tt.toLowerCase())) out.push({ name: t.name, sub: t.type });
          } else if (tt === wantType) out.push({ name: t.name, sub: tt });
        }
        if (wantType === 'BOOL' && !boolOnly) { /* BOOL params like R: allow members too */
          for (const t of app.project.tags) {
            const fb = PLC.fb.defs[String(t.type).toUpperCase()];
            if (fb) for (const [m, mt] of fb.outputs) if (mt === 'BOOL') out.push({ name: t.name + '.' + m, sub: t.type + ' output' });
          }
        }
        return out;
      };

      const refresh = () => {
        const q = input.value.trim().toLowerCase();
        items = candidates().filter(c => !q || c.name.toLowerCase().includes(q)).slice(0, 8);
        list.textContent = '';
        items.forEach((c, i) => {
          const it = h('div.suggest-item' + (i === active ? '.on' : ''), { role: 'option' }, h('span.mono', { text: c.name }), h('span.sub', { text: c.sub || '' }));
          it.addEventListener('pointerdown', e => { e.preventDefault(); input.value = c.name; commit(); list.hidden = true; });
          list.appendChild(it);
        });
        list.hidden = !items.length || document.activeElement !== input;
        // create-tag offer
        const v = input.value.trim();
        create.textContent = '';
        create.hidden = true;
        if (v && PLC.util.isIdentifier(v) && !app.tagInfo(v) && !/^(TRUE|FALSE)$/i.test(v)) {
          const typeSel = h('select.input.sm', { 'aria-label': 'Type of new tag' });
          const userFbs = app.compiled ? Array.from(app.compiled.fbTypes.values()).filter(f => f.user).map(f => f.name) : [];
          const types = wantType === 'NUM' || wantType === 'ANY' ? ['INT', 'DINT', 'REAL', 'TIME', 'BOOL'] : wantType === 'BOOL' ? ['BOOL'] : wantType === 'FBINST' ? userFbs.concat(Object.keys(PLC.fb.defs)) : [wantType];
          for (const t of types) typeSel.appendChild(h('option', { value: t, text: t }));
          if (wantType === 'TIME') typeSel.value = 'TIME';
          const addrSel = h('select.input.sm', { 'aria-label': 'Address of new tag' });
          const fillAddr = () => {
            addrSel.textContent = '';
            addrSel.appendChild(h('option', { value: '', text: 'no address (memory)' }));
            for (const a of app.freeAddresses(typeSel.value)) addrSel.appendChild(h('option', { value: a, text: a }));
          };
          fillAddr();
          typeSel.addEventListener('change', fillAddr);
          const go = button('Create tag', { cls: 'sm primary', onClick: () => {
            app.mutate('Create tag', () => app.project.tags.push({ name: v, type: typeSel.value, address: addrSel.value, init: '', comment: '' }), { render: true });
            PLC.dom.toast('Created tag ' + v, 'info');
            commit();
            create.hidden = true;
          } });
          create.appendChild(h('div.create-row', null, h('span.small', { html: '<b>' + PLC.util.escapeHtml(v) + '</b> is not a tag yet.' })));
          create.appendChild(h('div.create-row', null, typeSel, addrSel, go));
          create.hidden = false;
        }
      };
      let last = value || '';
      const commit = () => { const v = input.value.trim(); if (v !== last) { last = v; onChange(v); } refresh(); };
      input.addEventListener('input', () => { active = -1; refresh(); });
      input.addEventListener('focus', refresh);
      input.addEventListener('blur', () => { setTimeout(() => { list.hidden = true; }, 120); commit(); });
      input.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); active = (active + 1) % items.length; refresh(); }
        else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); active = (active - 1 + items.length) % items.length; refresh(); }
        else if (e.key === 'Enter') {
          e.preventDefault();
          if (active >= 0 && items[active]) input.value = items[active].name;
          commit();
          list.hidden = true;
          const fieldsIn = Array.from(this.pop.querySelectorAll('.pop-field input'));
          const i = fieldsIn.indexOf(input);
          if (i >= 0 && i < fieldsIn.length - 1) fieldsIn[i + 1].focus();
          else if (create.hidden) { this.closePop(); this.scroll.focus(); }
        }
      });
      if (autofocus) setTimeout(() => { input.focus(); input.select(); }, 30);
      setTimeout(refresh, 0);
      return wrap;
    }
  }

  PLC.LadderEditor = LadderEditor;
  PLC.ladderPaletteSymbol = paletteSymbol;
})(window.PLC = window.PLC || {});
