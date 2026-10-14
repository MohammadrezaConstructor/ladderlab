/* LadderLab — timing diagram (logic analyser) panel. */
(function (PLC) {
  'use strict';
  const { h, button, clear } = PLC.dom;

  class TracePanel {
    constructor(app, host) {
      this.app = app;
      this.windowMs = 10000;
      this.frozenEnd = null;
      this.hoverX = null;
      this.root = h('div.trace-panel');
      const tb = h('div.panel-toolbar');
      this.pauseBtn = button('Freeze', { icon: 'pause', cls: 'sm', title: 'Freeze the view to inspect it (recording continues)', onClick: () => this.toggleFreeze() });
      tb.appendChild(this.pauseBtn);
      tb.appendChild(button('Clear', { icon: 'trash', cls: 'sm', onClick: () => { app.rt.trace.clear(); this.draw(); } }));
      const win = h('select.input.sm', { 'aria-label': 'Time window' });
      for (const [v, l] of [[2000, '2 s'], [5000, '5 s'], [10000, '10 s'], [30000, '30 s'], [60000, '60 s']]) win.appendChild(h('option', { value: v, text: l }));
      win.value = String(this.windowMs);
      win.addEventListener('change', () => { this.windowMs = parseInt(win.value, 10); this.draw(); });
      tb.appendChild(win);
      this.addBtn = button('Add signal', { icon: 'plus', cls: 'sm', onClick: () => this.addMenu() });
      tb.appendChild(this.addBtn);
      tb.appendChild(h('span.tb-spacer'));
      tb.appendChild(h('span.tb-hint', { text: 'Click in the chart to set a time cursor; hover to measure Δt' }));
      this.canvas = h('canvas.trace-canvas', { role: 'img', 'aria-label': 'Timing diagram of the selected signals' });
      this.empty = h('div.empty-note', null, h('p', { text: 'No signals selected. Add signals to see how they change over time, like on a logic analyser.' }));
      this.wrap = h('div.trace-wrap', null, this.canvas, this.empty);
      this.root.append(tb, this.wrap);
      host.appendChild(this.root);
      this.canvas.addEventListener('pointermove', e => { const r = this.canvas.getBoundingClientRect(); this.hoverX = e.clientX - r.left; if (this.frozenEnd !== null || this.app.rt.state !== 'RUN') this.draw(); });
      this.canvas.addEventListener('pointerleave', () => { this.hoverX = null; this.draw(); });
      this.canvas.addEventListener('click', e => {
        const r = this.canvas.getBoundingClientRect();
        const x = e.clientX - r.left;
        if (x < 120) {
          const lane = this.laneAt(e.clientY - r.top);
          if (lane) this.app.toggleTrace(lane.name);
          return;
        }
        // click sets a reference cursor; hovering then shows the time difference
        const t = this.timeAt(x);
        if (t === null) return;
        this.markT = this.markT !== null && this.markT !== undefined && Math.abs(this.xOfLast(this.markT) - x) < 6 ? null : t;
        this.draw();
      });
    }

    timeAt(x) {
      const v = this._view;
      if (!v || x < v.LX || x > v.RX) return null;
      return v.tStart + (x - v.LX) / (v.RX - v.LX) * this.windowMs;
    }
    xOfLast(t) { const v = this._view; return v ? v.LX + (t - v.tStart) / this.windowMs * (v.RX - v.LX) : -1e9; }

    toggleFreeze() {
      const rt = this.app.rt;
      this.frozenEnd = this.frozenEnd === null ? (rt.trace.times.length ? rt.trace.times[rt.trace.times.length - 1] : rt.time) : null;
      this.pauseBtn.querySelector('span:last-child').textContent = this.frozenEnd === null ? 'Freeze' : 'Follow';
      this.draw();
    }

    addMenu() {
      const app = this.app;
      const items = [];
      const have = new Set(app.project.trace.map(n => n.toLowerCase()));
      for (const t of app.project.tags) {
        const tt = String(t.type).toUpperCase();
        if (PLC.types.isElementary(tt) && !have.has(t.name.toLowerCase())) items.push({ label: t.name, hint: tt, onClick: () => app.toggleTrace(t.name) });
        const fb = PLC.fb.defs[tt];
        if (fb) for (const [m] of fb.inputs.concat(fb.outputs)) {
          const n = t.name + '.' + m;
          if (!have.has(n.toLowerCase())) items.push({ label: n, hint: tt, onClick: () => app.toggleTrace(n) });
        }
      }
      if (!items.length) items.push({ label: 'All tags are already shown', disabled: true });
      PLC.dom.menu(this.addBtn, items.slice(0, 60));
    }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(200, this.wrap.clientWidth), hgt = Math.max(80, this.wrap.clientHeight);
      if (this.cw !== w || this.ch !== hgt || this.dpr !== dpr) {
        this.cw = w; this.ch = hgt; this.dpr = dpr;
        this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(hgt * dpr);
        this.canvas.style.width = w + 'px'; this.canvas.style.height = hgt + 'px';
      }
    }

    lanes() {
      const tr = this.app.rt.trace;
      let y = 8;
      const out = [];
      const kinds = tr.signals.map(s => {
        const vals = tr.data[s.name] || [];
        for (let i = vals.length - 1; i >= 0 && i > vals.length - 50; i--) if (typeof vals[i] === 'number') return true;
        return false;
      });
      // shrink lanes so that every signal fits above the time axis
      const avail = Math.max(40, (this.ch || 200) - 30);
      const want = kinds.reduce((a, num) => a + (num ? 58 : 30) + 6, 0);
      const k = want > avail ? Math.max(0.45, avail / want) : 1;
      tr.signals.forEach((s, i) => {
        const vals = tr.data[s.name] || [];
        const numeric = kinds[i];
        const hgt = Math.round((numeric ? 58 : 30) * k);
        out.push({ name: s.name, y, h: hgt, numeric, vals });
        y += hgt + Math.round(6 * k);
      });
      this.totalH = y;
      return out;
    }
    laneAt(y) { return (this._lanes || []).find(l => y >= l.y && y <= l.y + l.h); }

    draw() {
      if (!this.root.offsetParent) return;
      this.resize();
      const app = this.app, tr = app.rt.trace;
      this.empty.hidden = tr.signals.length > 0;
      const ctx = this.canvas.getContext('2d');
      const dpr = this.dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = this.cw, H = this.ch;
      const cs = getComputedStyle(document.documentElement);
      const col = n => cs.getPropertyValue(n).trim();
      const C = { bg: col('--surface-2'), ink: col('--ink'), ink2: col('--ink-2'), ink3: col('--ink-3'), line: col('--line'), power: col('--power'), powerSoft: col('--power-soft'), accent: col('--accent'), info: col('--info') };
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, H);
      if (!tr.signals.length) return;
      const lanes = this._lanes = this.lanes();
      const LX = 120, RX = W - 10;
      const times = tr.times;
      const tLast = this.frozenEnd !== null ? this.frozenEnd : (times.length ? times[times.length - 1] : app.rt.time);
      const tStart = Math.max(times.length ? times[0] : 0, tLast - this.windowMs);
      const tEnd = tStart + this.windowMs;
      const xOf = t => LX + (t - tStart) / this.windowMs * (RX - LX);
      this._view = { LX, RX, tStart };
      // grid
      ctx.font = '10px ' + (cs.getPropertyValue('--font-mono') || 'monospace');
      const step = this.windowMs <= 2000 ? 200 : this.windowMs <= 5000 ? 500 : this.windowMs <= 10000 ? 1000 : this.windowMs <= 30000 ? 5000 : 10000;
      ctx.strokeStyle = C.line; ctx.lineWidth = 1;
      ctx.fillStyle = C.ink3; ctx.textAlign = 'center';
      for (let t = Math.ceil(tStart / step) * step; t <= tEnd; t += step) {
        const x = Math.round(xOf(t)) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H - 16); ctx.stroke();
        ctx.fillText((t / 1000).toFixed(step < 1000 ? 1 : 0) + ' s', x, H - 5);
      }
      // find visible index range
      let i0 = 0;
      while (i0 < times.length && times[i0] < tStart) i0++;
      i0 = Math.max(0, i0 - 1);
      let hoverIdx = -1;
      if (this.hoverX !== null && this.hoverX > LX && times.length) {
        const th = tStart + (this.hoverX - LX) / (RX - LX) * this.windowMs;
        let lo = 0, hi = times.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid] < th) lo = mid + 1; else hi = mid; }
        hoverIdx = lo;
      }
      for (const lane of lanes) {
        const { y, h: lh, vals } = lane;
        ctx.fillStyle = C.ink;
        ctx.textAlign = 'left';
        ctx.font = '600 11.5px ' + (cs.getPropertyValue('--font-mono') || 'monospace');
        ctx.fillText(lane.name.length > 15 ? lane.name.slice(0, 14) + '…' : lane.name, 8, y + Math.min(14, lh * 0.5 + 4));
        const cur = vals.length ? vals[vals.length - 1] : null;
        ctx.font = '10.5px ' + (cs.getPropertyValue('--font-mono') || 'monospace');
        ctx.fillStyle = C.ink3;
        const show = hoverIdx >= 0 ? vals[hoverIdx] : cur;
        if (lh >= 24) ctx.fillText(fmt(show), 8, y + Math.min(27, lh - 2));
        ctx.strokeStyle = C.line;
        ctx.beginPath(); ctx.moveTo(LX, y + lh + 3 - 0.5); ctx.lineTo(RX, y + lh + 3 - 0.5); ctx.stroke();
        if (!times.length) continue;
        if (!lane.numeric) {
          const yHi = y + 4, yLo = y + lh - 4;
          ctx.beginPath();
          let started = false, prevY = null;
          ctx.fillStyle = C.powerSoft;
          for (let i = i0; i < times.length; i++) {
            const v = vals[i];
            const x = Math.max(LX, xOf(times[i]));
            const x2 = i + 1 < times.length ? xOf(times[i + 1]) : xOf(tLast);
            if (v) ctx.fillRect(x, yHi, Math.max(0.5, Math.min(RX, x2) - x), yLo - yHi);
            const yy = v ? yHi : yLo;
            if (!started) { ctx.moveTo(x, yy); started = true; }
            else if (yy !== prevY) ctx.lineTo(x, yy);
            prevY = yy;
            ctx.lineTo(Math.min(RX, x2), yy);
          }
          ctx.strokeStyle = C.power; ctx.lineWidth = 1.6;
          ctx.stroke();
        } else {
          let mn = Infinity, mx = -Infinity;
          for (let i = i0; i < times.length; i++) { const v = vals[i]; if (typeof v === 'number') { mn = Math.min(mn, v); mx = Math.max(mx, v); } }
          if (!isFinite(mn)) continue;
          if (mn === mx) { mn -= 1; mx += 1; }
          const yOf = v => y + lh - 4 - (v - mn) / (mx - mn) * (lh - 10);
          ctx.fillStyle = C.ink3; ctx.textAlign = 'right';
          ctx.fillText(fmt(mx), LX - 6, y + 10);
          ctx.fillText(fmt(mn), LX - 6, y + lh - 2);
          ctx.beginPath();
          let started = false;
          for (let i = i0; i < times.length; i++) {
            const v = vals[i];
            if (typeof v !== 'number') continue;
            const x = Math.max(LX, xOf(times[i])), yy = yOf(v);
            if (!started) { ctx.moveTo(x, yy); started = true; } else ctx.lineTo(x, yy);
          }
          ctx.strokeStyle = C.info; ctx.lineWidth = 1.6;
          ctx.stroke();
        }
      }
      const hasMark = this.markT !== null && this.markT !== undefined && this.markT >= tStart && this.markT <= tEnd;
      if (hasMark) {
        const mx = Math.round(xOf(this.markT)) + 0.5;
        ctx.save();
        ctx.strokeStyle = C.info; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx, H - 16); ctx.stroke();
        ctx.restore();
        ctx.fillStyle = C.info; ctx.textAlign = 'left';
        ctx.fillText('A ' + (this.markT / 1000).toFixed(2) + ' s', Math.min(mx + 4, W - 90), H - 20);
      }
      if (hoverIdx >= 0 && times[hoverIdx] !== undefined) {
        const x = Math.round(xOf(times[hoverIdx])) + 0.5;
        ctx.strokeStyle = C.accent; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H - 16); ctx.stroke();
        ctx.fillStyle = C.accent; ctx.textAlign = 'left';
        let label = 't = ' + (times[hoverIdx] / 1000).toFixed(2) + ' s';
        if (hasMark) label += '   Δt = ' + ((times[hoverIdx] - this.markT) / 1000).toFixed(2) + ' s';
        ctx.fillText(label, Math.min(x + 4, W - 170), 10);
      }
    }
  }

  function fmt(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
    return String(v);
  }

  PLC.TracePanel = TracePanel;
  void clear;
})(window.PLC = window.PLC || {});
