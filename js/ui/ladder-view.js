/* LadderLab — ladder diagram renderer (SVG). Used by the editor and for static figures in lessons.
 * renderProgram(rungs, opts) builds the SVG and returns lookup tables the editor uses for hit testing
 * and live monitoring (wire segments → flow bits, elements → state classes, live value texts). */
(function (PLC) {
  'use strict';
  const { s } = PLC.dom;
  const K = () => PLC.ladder.KINDS;

  const G = {
    CW: 88,        // contact / coil cell width
    RH: 78,        // row height
    WY: 40,        // wire y inside a row
    PP: 12,        // parallel connector padding
    GUTTER: 40,    // left gutter (rung numbers)
    EMPTY_W: 56,   // empty branch width
    ROW: 20,       // pin row pitch inside boxes
    ML: 62,        // space for input values left of a box
    MR: 62,        // space for output values right of a box
    COMMENT_H: 24
  };

  // contacts and coils grow with their tag name so neighbouring labels never overlap
  const TAG_CHAR_W = 7.7, TAG_MAX = 20;
  function tagWidth(tag) { return Math.min(TAG_MAX, String(tag || '???').length) * TAG_CHAR_W + 16; }

  /** Pins of a call box: from the function block declaration when known, else from the parameters. */
  function callPins(el, opts) {
    const info = opts && opts.fbInfo && el.tag ? opts.fbInfo(el.tag) : null;
    if (info) return { title: info.name, pin: info.powerIn || 'EN', pout: info.powerOut || 'ENO', ins: info.ins, outs: info.outs };
    return { title: 'FB', pin: 'EN', pout: 'ENO', ins: Object.keys(el.params), outs: [] };
  }

  function boxGeom(el, opts) {
    const KD = K()[el.kind];
    if (!KD) return { w: G.CW, h: G.RH };
    if (KD.cat === 'call') {
      const p = callPins(el, opts);
      const rows = 1 + Math.max(p.ins.length, p.outs.length);
      const bottom = G.WY + (rows - 1) * G.ROW + 12;
      const bw = Math.max(84, Math.min(150, p.title.length * 8 + 24));
      return { w: G.ML + bw + (p.outs.length ? G.MR : 16), h: Math.max(G.RH, bottom + 14), rows, bw, pins: p };
    }
    if (KD.cat === 'contact' || KD.cat === 'coil') return { w: Math.max(G.CW, Math.ceil(tagWidth(el.tag))), h: G.RH };
    if (KD.cat === 'cmp') return { w: 112, h: G.RH };
    if (KD.cat === 'math') {
      const rows = el.kind === 'MOVE' ? 2 : 3;
      const bottom = G.WY + (rows - 1) * G.ROW + 12;
      return { w: G.ML + 70 + G.MR, h: bottom + 14, rows, bw: 70 };
    }
    if (KD.cat === 'fb') {
      const nin = KD.paramInfo.filter(p => p.dir === 'in').length;
      const nout = KD.paramInfo.filter(p => p.dir === 'out').length;
      const rows = 1 + Math.max(nin, nout);
      const bottom = G.WY + (rows - 1) * G.ROW + 12;
      return { w: G.ML + 84 + (nout ? G.MR : 16), h: Math.max(G.RH, bottom + 14), rows, bw: 84, nin, nout };
    }
    return { w: G.CW, h: G.RH };
  }

  function isTrailingOutput(item) {
    if (item.t === 'E') return K()[item.kind] && K()[item.kind].cat === 'coil';
    if (item.t === 'P') return item.branches.every(b => b.items.length > 0 && b.items.every(isTrailingOutput));
    return false;
  }

  function truncate(str, max) {
    str = String(str == null ? '' : str);
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  }

  /**
   * opts: { editable, selected:Set, cursor:{seriesId,index}, errors:Map(id→msg), tagInfo(name)→{address,comment},
   *         minWidth, selectedRung, rungErrors:Map(rungId→msg), numbering:true, figure:false }
   */
  function renderProgram(rungs, opts) {
    opts = opts || {};
    const sizes = new Map();
    const size = (node) => {
      let m = sizes.get(node.id);
      if (m) return m;
      if (node.t === 'E') m = boxGeom(node, opts);
      else if (node.t === 'S') {
        if (!node.items.length) m = { w: G.EMPTY_W, h: G.RH };
        else { let w = 0, h = 0; for (const it of node.items) { const mm = size(it); w += mm.w; h = Math.max(h, mm.h); } m = { w, h }; }
      } else {
        let w = 0, h = 0; for (const b of node.branches) { const mm = size(b); w = Math.max(w, mm.w); h += mm.h; } m = { w: w + 2 * G.PP, h };
      }
      sizes.set(node.id, m);
      return m;
    };

    const gutter = opts.figure ? 12 : G.GUTTER;
    // natural widths → common right rail
    let maxW = 0;
    const plans = rungs.map(r => {
      const items = r.body.items;
      let k = items.length;
      while (k > 0 && isTrailingOutput(items[k - 1])) k--;
      const lead = items.slice(0, k), trail = items.slice(k);
      let lw = 0, tw = 0, h = G.RH;
      for (const it of lead) { const m = size(it); lw += m.w; h = Math.max(h, m.h); }
      for (const it of trail) { const m = size(it); tw += m.w; h = Math.max(h, m.h); }
      if (!items.length) lw = G.EMPTY_W * 2;
      const natural = lw + tw + (trail.length ? 28 : 12);
      maxW = Math.max(maxW, natural);
      return { r, lead, trail, k, lw, tw, h };
    });
    const bodyW = Math.max(maxW, (opts.minWidth || 0) - gutter - 16);
    const railL = gutter, railR = gutter + bodyW;
    const width = railR + (opts.figure ? 12 : 16);

    const svg = s('svg', { class: 'ladder' + (opts.figure ? ' figure' : '') + (opts.editable ? ' editable' : ''), xmlns: 'http://www.w3.org/2000/svg' });
    const out = { svg, wires: [], elems: new Map(), ins: [], zones: [], rungs: [], live: [], width, height: 0, railL, railR };

    let y = opts.figure ? 6 : 8;
    plans.forEach((plan, ri) => {
      const r = plan.r;
      const g = s('g', { class: 'rung' + (opts.selectedRung === r.id ? ' sel' : '') + (opts.rungErrors && opts.rungErrors.has(r.id) ? ' warn' : ''), 'data-rung': r.id });
      const top = y;
      const hasComment = !!(r.comment && r.comment.trim());
      const ch = hasComment ? G.COMMENT_H : (opts.editable ? 8 : 0);
      const ry = top + ch;
      const rh = plan.h;
      const total = ch + rh + 6;
      // background (click target for the rung)
      g.appendChild(s('rect', { class: 'rung-bg', x: 0, y: top, width, height: total, 'data-rung': r.id }));
      if (hasComment) {
        g.appendChild(s('text', { class: 'rung-comment', x: railL + 8, y: top + 16 }, truncate(r.comment.replace(/\s+/g, ' '), Math.floor(bodyW / 7))));
      }
      if (!opts.figure && opts.numbering !== false) {
        g.appendChild(s('text', { class: 'rung-num', x: gutter / 2, y: ry + G.WY + 4, 'text-anchor': 'middle' }, String(ri + 1)));
      }
      // rails
      g.appendChild(s('line', { class: 'rail', x1: railL, y1: ry + 2, x2: railL, y2: ry + rh - 4 }));
      g.appendChild(s('line', { class: 'rail right', x1: railR, y1: ry + 2, x2: railR, y2: ry + rh - 4 }));
      const ctx = { g, rungId: r.id, opts, out, size };

      // leading part
      let x = railL;
      const body = r.body;
      if (!body.items.length) {
        wire(ctx, x, ry + G.WY, railR, ry + G.WY, body.id, 1, true);
        insertion(ctx, body.id, 0, railL + 28, ry + G.WY);
      } else {
        insertion(ctx, body.id, 0, x + 4, ry + G.WY);
        plan.lead.forEach((it, i) => {
          drawItem(ctx, it, x, ry);
          x += size(it).w;
          insertion(ctx, body.id, i + 1, x, ry + G.WY);
        });
        if (plan.trail.length) {
          const tx = railR - plan.tw;
          const lastLead = plan.lead.length ? plan.lead[plan.lead.length - 1] : null;
          if (lastLead) wire(ctx, x, ry + G.WY, tx, ry + G.WY, lastLead.id, 2);
          else wire(ctx, x, ry + G.WY, tx, ry + G.WY, body.id, 1);
          let x2 = tx;
          plan.trail.forEach((it, i) => {
            drawItem(ctx, it, x2, ry);
            x2 += size(it).w;
            insertion(ctx, body.id, plan.k + i + 1, x2 - (i === plan.trail.length - 1 ? 6 : 0), ry + G.WY);
          });
        }
      }
      svg.appendChild(g);
      out.rungs.push({ id: r.id, y: top, h: total, el: g, wireY: ry + G.WY });
      y += total + (opts.figure ? 2 : 6);
    });
    out.height = y + (opts.figure ? 2 : 10);
    svg.setAttribute('width', width);
    svg.setAttribute('height', out.height);
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + out.height);
    return out;
  }

  function wire(ctx, x1, y1, x2, y2, id, bit, dashed) {
    if (Math.abs(x2 - x1) < 0.5 && Math.abs(y2 - y1) < 0.5) return;
    const el = s('line', { class: 'w' + (dashed ? ' dashed' : ''), x1, y1, x2, y2 });
    ctx.g.appendChild(el);
    ctx.out.wires.push({ el, id, bit });
  }

  function insertion(ctx, seriesId, index, x, y) {
    if (!ctx.opts.editable) return;
    const cur = ctx.opts.cursor && ctx.opts.cursor.seriesId === seriesId && ctx.opts.cursor.index === index;
    const el = s('g', { class: 'ins' + (cur ? ' cur' : ''), 'data-series': seriesId, 'data-index': index, transform: 'translate(' + x + ',' + y + ')' },
      s('circle', { r: 9, class: 'ins-hit' }),
      s('circle', { r: 4.5, class: 'ins-dot' }));
    ctx.g.appendChild(el);
    ctx.out.ins.push({ seriesId, index, x, y, rungId: ctx.rungId, el });
  }

  function drawItem(ctx, it, x, y) {
    if (it.t === 'E') drawElement(ctx, it, x, y);
    else if (it.t === 'P') drawParallel(ctx, it, x, y, ctx.size(it).w);
  }

  function drawSeries(ctx, ser, x, y, w) {
    if (!ser.items.length) {
      wire(ctx, x, y + G.WY, x + w, y + G.WY, ser.id, 1, true);
      insertion(ctx, ser.id, 0, x + Math.min(w / 2, 28), y + G.WY);
      return;
    }
    let cx = x;
    insertion(ctx, ser.id, 0, cx + 4, y + G.WY);
    ser.items.forEach((it, i) => {
      drawItem(ctx, it, cx, y);
      cx += ctx.size(it).w;
      insertion(ctx, ser.id, i + 1, cx, y + G.WY);
    });
    if (cx < x + w - 0.5) wire(ctx, cx, y + G.WY, x + w, y + G.WY, ser.id, 2);
  }

  function drawParallel(ctx, par, x, y, w) {
    const xl = x + G.PP / 2, xr = x + w - G.PP / 2;
    let by = y;
    const ys = [];
    par.branches.forEach((b, i) => {
      const m = ctx.size(b);
      const wy = by + G.WY;
      if (i === 0) wire(ctx, x, wy, xl, wy, par.id, 1);
      wire(ctx, xl, wy, x + G.PP, wy, par.id, 1);
      drawSeries(ctx, b, x + G.PP, by, w - 2 * G.PP);
      wire(ctx, x + w - G.PP, wy, xr, wy, b.id, 2);
      if (i === 0) wire(ctx, xr, wy, x + w, wy, par.id, 2);
      ys.push(wy);
      by += m.h;
    });
    wire(ctx, xl, ys[0], xl, ys[ys.length - 1], par.id, 1);
    wire(ctx, xr, ys[0], xr, ys[ys.length - 1], par.id, 2);
  }

  function elementTitle(el, KD, info) {
    let t = KD.label;
    if (KD.hasTag) t += ': ' + (el.tag || '(no tag)');
    if (info && info.address) t += ' (' + info.address + ')';
    if (info && info.comment) t += '\n' + info.comment;
    return t;
  }

  function drawElement(ctx, el, x, y) {
    const KD = K()[el.kind];
    const m = ctx.size(el);
    const opts = ctx.opts;
    const sel = opts.selected && opts.selected.has(el.id);
    const err = opts.errors && opts.errors.get(el.id);
    const cls = 'el k-' + el.kind.toLowerCase() + ' c-' + (KD ? KD.cat : 'x') + (sel ? ' sel' : '') + (err ? ' err' : '');
    const g = s('g', { class: cls, 'data-id': el.id, 'data-rung': ctx.rungId });
    const info = opts.tagInfo && KD && KD.hasTag && el.tag ? opts.tagInfo(el.tag) : null;
    g.appendChild(s('title', null, err ? err : elementTitle(el, KD || { label: el.kind }, info)));
    g.appendChild(s('rect', { class: 'el-hit', x: x + 1, y: y + 2, width: m.w - 2, height: m.h - 4, rx: 4 }));
    const wy = y + G.WY;
    const id = el.id;
    const rec = { g, x, y, w: m.w, h: m.h, kind: el.kind, rungId: ctx.rungId };
    ctx.out.elems.set(id, rec);

    if (!KD) { wire(ctx, x, wy, x + m.w, wy, id, 1); ctx.g.appendChild(g); return; }

    if (KD.cat === 'contact' || KD.cat === 'coil') {
      const cx = x + m.w / 2;
      const half = KD.cat === 'contact' ? 8 : 11;
      wire(ctx, x, wy, cx - half, wy, id, 1);
      wire(ctx, cx + half, wy, x + m.w, wy, id, 2);
      const tag = el.tag ? truncate(el.tag, TAG_MAX) : '???';
      g.appendChild(s('text', { class: 'tag' + (el.tag ? '' : ' missing'), x: cx, y: y + 15, 'text-anchor': 'middle' }, tag));
      if (info && info.address && opts.showAddresses !== false) {
        g.appendChild(s('text', { class: 'addr', x: cx, y: y + G.WY + 30, 'text-anchor': 'middle' }, info.address));
      }
      const sym = s('g', { class: 'sym' });
      if (KD.cat === 'contact') {
        sym.appendChild(s('rect', { class: 'fill', x: cx - half, y: wy - 12, width: half * 2, height: 24 }));
        sym.appendChild(s('line', { class: 'bar', x1: cx - half, y1: wy - 13, x2: cx - half, y2: wy + 13 }));
        sym.appendChild(s('line', { class: 'bar', x1: cx + half, y1: wy - 13, x2: cx + half, y2: wy + 13 }));
        if (el.kind === 'NC') sym.appendChild(s('line', { class: 'bar thin', x1: cx - half - 3, y1: wy + 11, x2: cx + half + 3, y2: wy - 11 }));
        if (el.kind === 'P' || el.kind === 'N') sym.appendChild(s('text', { class: 'sym-letter', x: cx, y: wy + 4.5, 'text-anchor': 'middle' }, el.kind));
      } else {
        sym.appendChild(s('circle', { class: 'fill', cx, cy: wy, r: half - 1 }));
        sym.appendChild(s('path', { class: 'bar', d: 'M' + (cx - half + 5) + ' ' + (wy - 13) + ' Q' + (cx - half - 3) + ' ' + wy + ' ' + (cx - half + 5) + ' ' + (wy + 13) }));
        sym.appendChild(s('path', { class: 'bar', d: 'M' + (cx + half - 5) + ' ' + (wy - 13) + ' Q' + (cx + half + 3) + ' ' + wy + ' ' + (cx + half - 5) + ' ' + (wy + 13) }));
        const letter = { NCOIL: '/', SET: 'S', RESET: 'R' }[el.kind];
        if (letter) sym.appendChild(s('text', { class: 'sym-letter', x: cx, y: wy + 4.5, 'text-anchor': 'middle' }, letter));
      }
      g.appendChild(sym);
      ctx.g.appendChild(g);
      return;
    }

    if (KD.cat === 'cmp') {
      const bx = x + 14, bw = m.w - 28;
      wire(ctx, x, wy, bx, wy, id, 1);
      wire(ctx, bx + bw, wy, x + m.w, wy, id, 2);
      g.appendChild(s('rect', { class: 'box', x: bx, y: wy - 13, width: bw, height: 26, rx: 3 }));
      g.appendChild(s('text', { class: 'box-title', x: bx + bw / 2, y: wy + 4.5, 'text-anchor': 'middle' }, KD.op === '<>' ? '≠' : KD.op === '>=' ? '≥' : KD.op === '<=' ? '≤' : KD.op));
      const in1 = el.params.IN1 || '???', in2 = el.params.IN2 || '???';
      g.appendChild(s('text', { class: 'tag' + (el.params.IN1 ? '' : ' missing'), x: bx + bw / 2, y: y + 13, 'text-anchor': 'middle' }, truncate(in1, 14)));
      g.appendChild(s('text', { class: 'tag' + (el.params.IN2 ? '' : ' missing'), x: bx + bw / 2, y: wy + 30, 'text-anchor': 'middle' }, truncate(in2, 14)));
      if (opts.live) {
        liveText(ctx, g, bx + bw + 4, y + 13, el.params.IN1, 'start');
        liveText(ctx, g, bx + bw + 4, wy + 30, el.params.IN2, 'start');
      }
      ctx.g.appendChild(g);
      return;
    }

    // boxes: math and function blocks
    const bx = x + G.ML, bw = m.bw, by = wy - 22, bh = (m.rows - 1) * G.ROW + 34;
    wire(ctx, x, wy, bx, wy, id, 1);
    wire(ctx, bx + bw, wy, x + m.w, wy, id, 2);
    g.appendChild(s('rect', { class: 'box', x: bx, y: by, width: bw, height: bh, rx: 3 }));
    g.appendChild(s('text', { class: 'box-title', x: bx + bw / 2, y: by + 13, 'text-anchor': 'middle' }, KD.cat === 'call' ? truncate(m.pins.title, 18) : el.kind));
    const pin = (row, side, name) => {
      const py = wy + row * G.ROW;
      if (row > 0) {
        const x1 = side === 'l' ? bx - 6 : bx + bw, x2 = side === 'l' ? bx : bx + bw + 6;
        g.appendChild(s('line', { class: 'pin', x1, y1: py, x2, y2: py }));
      }
      g.appendChild(s('text', { class: 'pin-name', x: side === 'l' ? bx + 5 : bx + bw - 5, y: py + 4, 'text-anchor': side === 'l' ? 'start' : 'end' }, name));
    };
    if (KD.cat === 'call') {
      const p = m.pins;
      g.appendChild(s('text', { class: 'tag' + (el.tag ? '' : ' missing'), x: bx + bw / 2, y: by - 6, 'text-anchor': 'middle' }, el.tag ? truncate(el.tag, 16) : '???'));
      pin(0, 'l', p.pin); pin(0, 'r', p.pout);
      p.ins.forEach((n, i) => {
        pin(i + 1, 'l', n);
        const v = el.params[n];
        g.appendChild(s('text', { class: 'val' + (v ? '' : ' opt'), x: bx - 9, y: wy + (i + 1) * G.ROW + 4, 'text-anchor': 'end' }, truncate(v || '–', 9)));
        if (opts.live && v) liveText(ctx, g, bx - 9, wy + (i + 1) * G.ROW + 15, v, 'end');
      });
      p.outs.forEach((n, i) => {
        pin(i + 1, 'r', n);
        const v = el.params[n];
        g.appendChild(s('text', { class: 'val' + (v ? '' : ' opt'), x: bx + bw + 9, y: wy + (i + 1) * G.ROW + 4, 'text-anchor': 'start' }, truncate(v || '–', 9)));
        if (opts.live && el.tag) liveText(ctx, g, bx + bw + 9, wy + (i + 1) * G.ROW + 15, el.tag + '.' + n, 'start');
      });
    } else if (KD.cat === 'math') {
      pin(0, 'l', 'EN'); pin(0, 'r', 'ENO');
      const ins = el.kind === 'MOVE' ? ['IN'] : ['IN1', 'IN2'];
      ins.forEach((p, i) => {
        pin(i + 1, 'l', p);
        const v = el.params[p];
        g.appendChild(s('text', { class: 'val' + (v ? '' : ' missing'), x: bx - 9, y: wy + (i + 1) * G.ROW + 4, 'text-anchor': 'end' }, truncate(v || '???', 9)));
        if (opts.live) liveText(ctx, g, bx - 9, wy + (i + 1) * G.ROW + 15, v, 'end');
      });
      pin(1, 'r', 'OUT');
      const ov = el.params.OUT;
      g.appendChild(s('text', { class: 'val' + (ov ? '' : ' missing'), x: bx + bw + 9, y: wy + G.ROW + 4, 'text-anchor': 'start' }, truncate(ov || '???', 9)));
      if (opts.live) liveText(ctx, g, bx + bw + 9, wy + G.ROW + 15, ov, 'start');
    } else {
      const inst = el.tag ? truncate(el.tag, 14) : '???';
      g.appendChild(s('text', { class: 'tag' + (el.tag ? '' : ' missing'), x: bx + bw / 2, y: by - 6, 'text-anchor': 'middle' }, inst));
      pin(0, 'l', KD.powerIn);
      pin(0, 'r', KD.powerOut);
      const ins = KD.paramInfo.filter(p => p.dir === 'in'), outs = KD.paramInfo.filter(p => p.dir === 'out');
      ins.forEach((p, i) => {
        pin(i + 1, 'l', p.name);
        const v = el.params[p.name];
        g.appendChild(s('text', { class: 'val' + (v ? '' : (p.required ? ' missing' : ' opt')), x: bx - 9, y: wy + (i + 1) * G.ROW + 4, 'text-anchor': 'end' }, truncate(v || (p.required ? '???' : '–'), 9)));
      });
      outs.forEach((p, i) => {
        pin(i + 1, 'r', p.name);
        const v = el.params[p.name];
        g.appendChild(s('text', { class: 'val' + (v ? '' : ' opt'), x: bx + bw + 9, y: wy + (i + 1) * G.ROW + 4, 'text-anchor': 'start' }, truncate(v || '–', 9)));
      });
      if (opts.live && el.tag) {
        // live instance values (ET / CV) inside the box under the title
        const member = KD.fb.startsWith('CT') ? 'CV' : (KD.fb === 'TON' || KD.fb === 'TOF' || KD.fb === 'TP' || KD.fb === 'TONR') ? 'ET' : null;
        if (member) liveText(ctx, g, bx + bw / 2, by + bh + 13, el.tag + '.' + member, 'middle', 'live-fb');
      }
    }
    ctx.g.appendChild(g);
  }

  function liveText(ctx, g, x, y, expr, anchor, cls) {
    if (!expr) return;
    const t = s('text', { class: 'live ' + (cls || ''), x, y, 'text-anchor': anchor || 'start' });
    g.appendChild(t);
    ctx.out.live.push({ el: t, expr: String(expr) });
  }

  /** Apply runtime power-flow bits and live values to a rendered program. */
  function updateLive(r, flow, valueOf, running) {
    for (const w of r.wires) {
      const on = running && flow && ((flow[w.id] | 0) & w.bit) !== 0;
      if (w.on !== on) { w.on = on; w.el.classList.toggle('on', on); }
    }
    for (const [id, e] of r.elems) {
      const f = running && flow ? flow[id] | 0 : 0;
      const st = (f & 4) !== 0;
      if (e.st !== st) { e.st = st; e.g.classList.toggle('active', st); }
      const pw = (f & 1) !== 0;
      if (e.pw !== pw) { e.pw = pw; e.g.classList.toggle('powered', pw); }
    }
    for (const l of r.live) {
      const v = running && valueOf ? valueOf(l.expr) : null;
      const txt = v == null ? '' : v;
      if (l.txt !== txt) { l.txt = txt; l.el.textContent = txt; }
    }
  }

  /** Render a static figure (lesson theory) from rung text lines. */
  function figure(rungTexts, tagInfo) {
    const rungs = rungTexts.map(t => PLC.ladder.rungFromText(t.trim()));
    const r = renderProgram(rungs, { figure: true, tagInfo, showAddresses: !!tagInfo });
    r.svg.setAttribute('width', '100%');
    r.svg.removeAttribute('height');
    r.svg.style.maxWidth = r.width + 'px';
    return r.svg;
  }

  PLC.ladderView = { G, renderProgram, updateLive, figure, isTrailingOutput };
})(window.PLC = window.PLC || {});
