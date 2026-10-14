/* LadderLab — scene kit: registry, canvas host and drawing primitives for process simulations.
 *
 * A scene is registered with:
 *   PLC.scenes.register({
 *     id, name, description, width, height,
 *     tags: [{ name, type, address, comment }],         // the scene's wiring (I/O list)
 *     create() → { reset(phys), step(dt, phys, now), draw(g, phys) }
 *   });
 * step() is the plant model: it reads outputs (phys.Q / phys.QW) and writes sensor inputs (phys.I / phys.IW).
 * Operator controls (buttons, switches) write phys.I only from their event handlers, never in step(),
 * so tests and the watch window can drive those inputs too.
 * draw() is immediate mode: controls are declared every frame with a handler (g.pushButton({... onPress})).
 * Scene files must not touch the DOM when they load (they also run headless in Node tests). */
(function (PLC) {
  'use strict';

  const registry = [];
  function register(def) {
    def.width = def.width || 640;
    def.height = def.height || 400;
    def.tags = def.tags || [];
    const i = registry.findIndex(s => s.id === def.id);
    if (i >= 0) registry[i] = def; else registry.push(def);
  }
  function get(id) { return registry.find(s => s.id === id) || null; }
  function list() { return registry.slice(); }

  const FONT_UI = '"Barlow", "Segoe UI", system-ui, sans-serif';
  const FONT_LABEL = '"Barlow Semi Condensed", "Barlow", "Arial Narrow", "Segoe UI", sans-serif';
  const FONT_MONO = '"JetBrains Mono", Consolas, "Cascadia Mono", ui-monospace, monospace';

  const DEFAULT_COLORS = {
    bg: '#e9edee', surface: '#f7f9f9', ink: '#1b2428', ink2: '#4a585e', ink3: '#7b898f', line: '#c9d2d5',
    accent: '#d4580f', power: '#138a4a', fault: '#c62f25', warn: '#b97f00', info: '#2364aa',
    cabinet: '#cfd6d8', plate: '#e4e9ea', steel: '#8d999e', wire: '#3a464b', dark: false
  };

  function readColors() {
    if (typeof document === 'undefined') return Object.assign({}, DEFAULT_COLORS);
    const cs = getComputedStyle(document.documentElement);
    const v = (n, d) => (cs.getPropertyValue(n) || '').trim() || d;
    return {
      bg: v('--bg', DEFAULT_COLORS.bg), surface: v('--surface', DEFAULT_COLORS.surface), ink: v('--ink', DEFAULT_COLORS.ink),
      ink2: v('--ink-2', DEFAULT_COLORS.ink2), ink3: v('--ink-3', DEFAULT_COLORS.ink3), line: v('--line', DEFAULT_COLORS.line),
      accent: v('--accent', DEFAULT_COLORS.accent), power: v('--power', DEFAULT_COLORS.power), fault: v('--fault', DEFAULT_COLORS.fault),
      warn: v('--warn', DEFAULT_COLORS.warn), info: v('--info', DEFAULT_COLORS.info), cabinet: v('--cabinet', DEFAULT_COLORS.cabinet),
      plate: v('--plate', DEFAULT_COLORS.plate), steel: v('--steel', DEFAULT_COLORS.steel), wire: v('--wire', DEFAULT_COLORS.wire),
      dark: v('--is-dark', '0') === '1'
    };
  }

  // Signal colours used for lamps, buttons and lenses (same in both themes, they are physical objects).
  const SIGNAL = {
    green: { on: '#2fe07a', off: '#1d4d33', cap: '#1f9d55' },
    red: { on: '#ff4a3d', off: '#5a1f1c', cap: '#d0342c' },
    yellow: { on: '#ffd23a', off: '#5b4b14', cap: '#e8b600' },
    amber: { on: '#ffa31a', off: '#5b3a0c', cap: '#e08a00' },
    blue: { on: '#4aa8ff', off: '#183a5c', cap: '#2a72c4' },
    white: { on: '#fffbe8', off: '#4a4d4f', cap: '#e8eaea' },
    black: { on: '#666', off: '#222', cap: '#2a2e31' }
  };

  // ---- graphics context ----------------------------------------------------
  class Graphics {
    constructor(ctx, colors, time, hits) {
      this.ctx = ctx;
      this.c = colors;
      this.t = time || 0;
      this.hits = hits || [];
      this.SIGNAL = SIGNAL;
    }

    hit(shape, handlers) { this.hits.push(Object.assign({ shape }, handlers)); }

    // -- basics
    font(size, kind, weight) {
      const fam = kind === 'mono' ? FONT_MONO : kind === 'ui' ? FONT_UI : FONT_LABEL;
      return (weight || (kind === 'mono' ? 500 : 600)) + ' ' + size + 'px ' + fam;
    }
    text(str, x, y, o) {
      o = o || {};
      const ctx = this.ctx;
      ctx.save();
      ctx.font = this.font(o.size || 12, o.font || 'label', o.weight);
      ctx.fillStyle = o.color || this.c.ink;
      ctx.textAlign = o.align || 'center';
      ctx.textBaseline = o.baseline || 'middle';
      if (o.letterSpacing && 'letterSpacing' in ctx) ctx.letterSpacing = o.letterSpacing + 'px';
      if (o.maxWidth) ctx.fillText(String(str), x, y, o.maxWidth);
      else ctx.fillText(String(str), x, y);
      ctx.restore();
    }
    roundRect(x, y, w, h, r, fill, stroke, lw) {
      const ctx = this.ctx;
      ctx.beginPath();
      r = Math.min(r, w / 2, h / 2);
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
    }
    circle(x, y, r, fill, stroke, lw) {
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
    }
    line(x1, y1, x2, y2, color, lw, dash) {
      const ctx = this.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.strokeStyle = color || this.c.ink; ctx.lineWidth = lw || 1;
      if (dash) ctx.setLineDash(dash);
      ctx.stroke();
      ctx.restore();
    }

    /** Background plate for the whole scene or a sub-area. */
    plate(x, y, w, h, title) {
      this.roundRect(x, y, w, h, 8, this.c.plate, this.c.line, 1);
      if (title) {
        this.text(title.toUpperCase(), x + 12, y + 14, { align: 'left', size: 11, color: this.c.ink2, weight: 700, letterSpacing: 1 });
      }
    }

    /** Small address chip such as %IX0.0, the "wire number" students match with their tags. */
    addr(text, x, y, o) {
      if (!text) return;
      o = o || {};
      const ctx = this.ctx;
      ctx.save();
      ctx.font = this.font(9.5, 'mono', 600);
      const w = ctx.measureText(text).width + 8;
      ctx.restore();
      const active = o.active;
      this.roundRect(x - w / 2, y - 7, w, 14, 3, active ? this.c.power : this.c.surface, active ? null : this.c.line, 1);
      this.text(text, x, y + 0.5, { font: 'mono', size: 9.5, color: active ? '#fff' : this.c.ink2 });
    }

    label(text, x, y, o) {
      this.text(String(text).toUpperCase(), x, y, Object.assign({ size: 10.5, weight: 700, color: this.c.ink2, letterSpacing: 0.6 }, o || {}));
    }

    // -- operator devices
    /** Momentary push button. o: { x, y, r, color, label, addr, pressed, nc, onPress(bool), sub } */
    pushButton(o) {
      const r = o.r || 17;
      const s = SIGNAL[o.color || 'green'] || SIGNAL.green;
      const { x, y } = o;
      // bezel
      this.circle(x, y, r + 5, this.c.dark ? '#3a4449' : '#b9c3c6', this.c.dark ? '#596a71' : '#8e9a9f', 1.2);
      this.circle(x, y, r + 1, this.c.dark ? '#22292d' : '#6c787d');
      const pr = o.pressed ? r - 3 : r - 1;
      const grad = this.ctx.createRadialGradient(x - pr * 0.35, y - pr * 0.4, pr * 0.1, x, y, pr);
      grad.addColorStop(0, shade(s.cap, o.pressed ? -0.05 : 0.35));
      grad.addColorStop(1, shade(s.cap, o.pressed ? -0.35 : -0.1));
      this.circle(x, y, pr, grad);
      if (o.lit) this.circle(x, y, pr, null, s.on, 2);
      if (o.label) this.label(o.label, x, y + r + 16);
      if (o.addr) this.addr(o.addr, x, y + r + 30, { active: o.signal });
      if (o.nc !== undefined) {
        this.text(o.nc ? 'NC' : 'NO', x + r + 9, y - r - 2, { font: 'mono', size: 8.5, color: this.c.ink3 });
      }
      if (o.onPress) {
        this.hit({ type: 'circle', x, y, r: r + 6 }, {
          cursor: 'pointer', label: o.label,
          down: () => o.onPress(true),
          up: () => o.onPress(false)
        });
      }
    }

    /** Latching mushroom emergency stop. o: { x, y, r, latched, label, addr, onToggle() } */
    emergencyStop(o) {
      const r = o.r || 22, { x, y } = o;
      this.circle(x, y, r + 8, '#f2c500', '#a88600', 1.5);
      this.text('EMERGENCY', x, y - r - 2, { size: 6.5, color: '#3a3000', weight: 700 });
      const grad = this.ctx.createRadialGradient(x - 6, y - 8, 2, x, y, r);
      grad.addColorStop(0, o.latched ? '#b22a22' : '#ff6a5e');
      grad.addColorStop(1, o.latched ? '#6e1410' : '#c4271e');
      this.circle(x, y, o.latched ? r - 3 : r, grad, '#5a100c', 1);
      if (o.label) this.label(o.label, x, y + r + 20);
      if (o.addr) this.addr(o.addr, x, y + r + 34, { active: o.signal });
      if (o.onToggle) this.hit({ type: 'circle', x, y, r: r + 8 }, { cursor: 'pointer', label: o.label, click: o.onToggle });
    }

    /** Two-position toggle switch. o: { x, y, on, label, addr, onToggle() } */
    toggle(o) {
      const { x, y } = o;
      this.roundRect(x - 12, y - 18, 24, 36, 4, this.c.dark ? '#2a3337' : '#3b4549', null);
      this.circle(x, y, 6, '#9aa6ab');
      const ty = o.on ? y - 14 : y + 14;
      this.line(x, y, x, ty, '#d5dadc', 5);
      this.circle(x, ty, 4.5, '#eef1f2', '#7d888c', 1);
      this.text(o.on ? 'ON' : 'OFF', x + 22, y, { size: 9, font: 'mono', color: o.on ? this.c.power : this.c.ink3, align: 'left' });
      if (o.label) this.label(o.label, x, y + 32);
      if (o.addr) this.addr(o.addr, x, y + 46, { active: o.signal });
      if (o.onToggle) this.hit({ type: 'rect', x: x - 16, y: y - 22, w: 32, h: 44 }, { cursor: 'pointer', label: o.label, click: o.onToggle });
    }

    /** Rotary selector switch with two positions. o: { x, y, on, labels:['MAN','AUTO'], label, addr, onToggle() } */
    selector(o) {
      const { x, y } = o, r = 16;
      const labels = o.labels || ['0', '1'];
      this.circle(x, y, r + 4, this.c.dark ? '#3a4449' : '#b9c3c6', '#8e9a9f', 1);
      this.circle(x, y, r, '#2a2f33');
      const a = o.on ? Math.PI / 4 : -Math.PI / 4;
      const ctx = this.ctx;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      this.roundRect(-4, -r + 2, 8, 2 * r - 4, 3, '#d9dde0', null);
      this.line(0, -r + 4, 0, -r + 10, '#c0392b', 2);
      ctx.restore();
      this.text(labels[0], x - r - 10, y - r + 2, { size: 8.5, font: 'mono', color: !o.on ? this.c.ink : this.c.ink3 });
      this.text(labels[1], x + r + 10, y - r + 2, { size: 8.5, font: 'mono', color: o.on ? this.c.ink : this.c.ink3 });
      if (o.label) this.label(o.label, x, y + r + 16);
      if (o.addr) this.addr(o.addr, x, y + r + 30, { active: o.signal });
      if (o.onToggle) this.hit({ type: 'circle', x, y, r: r + 6 }, { cursor: 'pointer', label: o.label, click: o.onToggle });
    }

    /** Pilot lamp. o: { x, y, r, color, on, label, addr } */
    lamp(o) {
      const r = o.r || 13, { x, y } = o;
      const s = SIGNAL[o.color || 'green'] || SIGNAL.green;
      if (o.on) {
        const glow = this.ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.6);
        glow.addColorStop(0, hexA(s.on, 0.55));
        glow.addColorStop(1, hexA(s.on, 0));
        this.circle(x, y, r * 2.6, glow);
      }
      this.circle(x, y, r + 4, this.c.dark ? '#3a4449' : '#b9c3c6', '#8e9a9f', 1);
      const grad = this.ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
      if (o.on) { grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.35, s.on); grad.addColorStop(1, shade(s.on, -0.2)); }
      else { grad.addColorStop(0, shade(s.off, 0.35)); grad.addColorStop(1, s.off); }
      this.circle(x, y, r, grad);
      if (o.label) this.label(o.label, x, y + r + 16);
      if (o.addr) this.addr(o.addr, x, y + r + 30, { active: o.on });
    }

    led(x, y, on, color, r) {
      const s = SIGNAL[color || 'green'] || SIGNAL.green;
      r = r || 4;
      if (on) this.circle(x, y, r * 2.2, hexA(s.on, 0.25));
      this.circle(x, y, r, on ? s.on : s.off, this.c.dark ? '#000' : '#555', 0.6);
    }

    // -- field devices
    /** Electric motor seen from the fan end. o: { x, y, r, angle, running, fault, label, addr } */
    motor(o) {
      const r = o.r || 34, { x, y } = o;
      const ctx = this.ctx;
      // housing with cooling fins
      this.roundRect(x - r - 8, y - r * 0.75, 2 * r + 16, r * 1.5, 6, this.c.dark ? '#46535a' : '#6f7f86', null);
      for (let i = -3; i <= 3; i++) this.line(x - r - 8, y + i * r * 0.18, x + r + 8, y + i * r * 0.18, this.c.dark ? '#3a464c' : '#5f6e74', 1);
      this.circle(x, y, r, this.c.dark ? '#2b3439' : '#38444a', o.fault ? this.c.fault : (o.running ? this.c.power : '#20282c'), 3);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(o.angle || 0);
      for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.45, r * 0.16, r * 0.42, 0.35, 0, Math.PI * 2);
        ctx.fillStyle = '#c3ccd0';
        ctx.fill();
      }
      ctx.restore();
      this.circle(x, y, r * 0.18, '#e6eaec', '#7f8b90', 1);
      if (o.label) this.label(o.label, x, y + r + 16);
      if (o.addr) this.addr(o.addr, x, y + r + 30, { active: o.running });
    }

    /** Pump symbol (ISO style circle + triangle) with a rotating hint. o: { x, y, r, on, label, addr } */
    pump(o) {
      const r = o.r || 18, { x, y } = o;
      this.circle(x, y, r, this.c.surface, o.on ? this.c.power : this.c.ink2, 2.5);
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.55, y - r * 0.75);
      ctx.lineTo(x + r * 0.95, y);
      ctx.lineTo(x - r * 0.55, y + r * 0.75);
      ctx.closePath();
      ctx.fillStyle = o.on ? this.c.power : this.c.ink3;
      ctx.fill();
      if (o.label) this.label(o.label, x, y + r + 14);
      if (o.addr) this.addr(o.addr, x, y + r + 28, { active: o.on });
    }

    /** Valve symbol (bow tie). o: { x, y, size, open, vertical, label, addr } */
    valve(o) {
      const s = o.size || 12, { x, y } = o;
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(x, y);
      if (o.vertical) ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(-s, -s * 0.75); ctx.lineTo(s, s * 0.75); ctx.lineTo(s, -s * 0.75); ctx.lineTo(-s, s * 0.75); ctx.closePath();
      ctx.fillStyle = o.open ? this.c.power : this.c.surface;
      ctx.strokeStyle = o.open ? this.c.power : this.c.ink2;
      ctx.lineWidth = 2;
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 1.3); ctx.stroke();
      this.roundRect(-s * 0.6, -s * 1.9, s * 1.2, s * 0.7, 2, o.open ? this.c.power : this.c.ink2, null);
      ctx.restore();
      if (o.label) this.label(o.label, x, y + s + 16);
      if (o.addr) this.addr(o.addr, x, y + s + 30, { active: o.open });
    }

    /** Pipe along a polyline; animated dashes show flow. o: { width, color, flowing, speed } */
    pipe(points, o) {
      o = o || {};
      const ctx = this.ctx;
      const w = o.width || 8;
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
      ctx.strokeStyle = this.c.dark ? '#56656c' : '#8f9ca1';
      ctx.lineWidth = w + 3;
      ctx.stroke();
      ctx.strokeStyle = this.c.dark ? '#25303a' : '#dfe6e9';
      ctx.lineWidth = w;
      ctx.stroke();
      if (o.flowing) {
        ctx.strokeStyle = o.color || '#3d8fd8';
        ctx.lineWidth = w - 3;
        ctx.setLineDash([8, 7]);
        ctx.lineDashOffset = -(this.t / 1000) * 40 * (o.speed || 1);
        ctx.stroke();
      }
      ctx.restore();
    }

    /** Vertical tank. o: { x, y, w, h, level (0..1), color, label, marks:[{at, label}] } */
    tank(o) {
      const { x, y, w, h } = o;
      const lvl = Math.max(0, Math.min(1, o.level || 0));
      this.roundRect(x, y, w, h, 10, this.c.dark ? '#1b2328' : '#f4f7f8', this.c.ink2, 2);
      const lh = (h - 6) * lvl;
      if (lh > 0) {
        const ctx = this.ctx;
        ctx.save();
        this.roundRect(x + 3, y + 3, w - 6, h - 6, 8);
        ctx.clip();
        const grad = ctx.createLinearGradient(0, y + h - lh, 0, y + h);
        const col = o.color || '#3d8fd8';
        grad.addColorStop(0, hexA(col, 0.85));
        grad.addColorStop(1, hexA(shade(col, -0.25), 0.95));
        ctx.fillStyle = grad;
        // gentle wave on the surface
        const sy = y + h - 3 - lh;
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        for (let i = 0; i <= w; i += 4) ctx.lineTo(x + i, sy + Math.sin(i / 9 + this.t / 300) * (lvl > 0.02 && lvl < 0.99 ? 1.6 : 0));
        ctx.lineTo(x + w, y + h);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      for (const m of o.marks || []) {
        const my = y + h - 3 - (h - 6) * m.at;
        this.line(x - 6, my, x + 6, my, this.c.ink3, 1);
        if (m.label) this.text(m.label, x - 10, my, { align: 'right', size: 9, font: 'mono', color: this.c.ink3 });
      }
      if (o.label) this.label(o.label, x + w / 2, y + h + 14);
    }

    /** Conveyor belt. o: { x, y, w, h, offset (belt travel in px), running } */
    conveyor(o) {
      const { x, y, w } = o, h = o.h || 16;
      const ctx = this.ctx;
      this.roundRect(x, y, w, h, h / 2, this.c.dark ? '#2a2f33' : '#3d4448', null);
      ctx.save();
      this.roundRect(x + 2, y + 2, w - 4, h - 4, (h - 4) / 2);
      ctx.clip();
      const step = 14, off = ((o.offset || 0) % step + step) % step;
      ctx.strokeStyle = this.c.dark ? '#4a5257' : '#5a6368';
      ctx.lineWidth = 2;
      for (let i = x - step + off; i < x + w + step; i += step) {
        ctx.beginPath(); ctx.moveTo(i, y); ctx.lineTo(i - 6, y + h); ctx.stroke();
      }
      ctx.restore();
      for (const rx of [x + h / 2, x + w - h / 2]) {
        this.circle(rx, y + h / 2, h / 2 - 2, '#8b969b', '#2a2f33', 1);
        const a = (o.offset || 0) / (h / 2);
        this.line(rx, y + h / 2, rx + Math.cos(a) * (h / 2 - 3), y + h / 2 + Math.sin(a) * (h / 2 - 3), '#2a2f33', 1.5);
      }
      // legs
      for (let lx = x + 30; lx < x + w - 20; lx += Math.max(80, (w - 60) / 3)) {
        this.line(lx, y + h, lx, y + h + 26, this.c.steel, 4);
      }
    }

    /** Cardboard box / workpiece. o: { x, y, w, h, color, label } (x,y = bottom-left) */
    box(o) {
      const { x, y, w, h } = o;
      const col = o.color || '#c98d4b';
      this.roundRect(x, y - h, w, h, 2, col, shade(col, -0.35), 1.2);
      this.line(x + w * 0.5 - 4, y - h, x + w * 0.5 - 4, y - h + h * 0.35, shade(col, -0.25), 3);
      if (o.label) this.text(o.label, x + w / 2, y - h / 2 + 3, { size: 9, font: 'mono', color: '#3b2610' });
    }

    /** Through-beam photo-electric sensor from (x1,y1) to (x2,y2). o: { blocked, label, addr, signal } */
    photoEye(o) {
      const { x1, y1, x2, y2 } = o;
      if (!o.blocked) this.line(x1, y1, x2, y2, 'rgba(255,60,40,0.75)', 1.5, [4, 3]);
      for (const [px, py, tx] of [[x1, y1, 'TX'], [x2, y2, 'RX']]) {
        this.roundRect(px - 6, py - 8, 12, 16, 2, this.c.dark ? '#46535a' : '#56646a', null);
        this.circle(px, py, 3, tx === 'RX' ? (o.signal ? '#ffd23a' : '#4d4416') : '#ff5a4a');
      }
      if (o.label) this.label(o.label, o.labelX !== undefined ? o.labelX : x1, o.labelY !== undefined ? o.labelY : y1 - 18);
      if (o.addr) this.addr(o.addr, o.labelX !== undefined ? o.labelX : x1, (o.labelY !== undefined ? o.labelY : y1 - 18) - 14, { active: o.signal });
    }

    /** Inductive/limit sensor body with status LED. o: { x, y, active, label, addr, dir:'left'|'right'|'up'|'down' } */
    sensor(o) {
      const { x, y } = o;
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(x, y);
      const rot = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[o.dir || 'right'];
      ctx.rotate(rot);
      this.roundRect(-14, -6, 20, 12, 2, this.c.dark ? '#5a676d' : '#6a787e', null);
      this.roundRect(6, -5, 6, 10, 1, '#c9a227', null);
      ctx.restore();
      this.led(x, y, !!o.active, o.color || 'yellow', 3);
      if (o.label) this.label(o.label, x + (o.lx || 0), y + (o.ly !== undefined ? o.ly : 20));
      if (o.addr) this.addr(o.addr, x + (o.lx || 0), y + (o.ly !== undefined ? o.ly : 20) + 14, { active: o.active });
    }

    /** Pneumatic cylinder. o: { x, y, len, bore, ext (0..1), dir:'right'|'left'|'down'|'up', label } — x,y = cap end */
    cylinder(o) {
      const len = o.len || 120, bore = o.bore || 22, ext = Math.max(0, Math.min(1, o.ext || 0));
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(o.x, o.y);
      const rot = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[o.dir || 'right'];
      ctx.rotate(rot);
      const stroke = len * 0.8;
      // rod
      const rodEnd = len * 0.15 + ext * stroke + len * 0.85;
      this.roundRect(len * 0.1, -bore * 0.16, rodEnd - len * 0.1, bore * 0.32, 2, '#d7dde0', '#8c979c', 1);
      this.roundRect(rodEnd - 4, -bore * 0.45, 10, bore * 0.9, 2, '#9aa5aa', '#5f6b70', 1);
      // barrel
      const grad = ctx.createLinearGradient(0, -bore / 2, 0, bore / 2);
      grad.addColorStop(0, '#e9eef0'); grad.addColorStop(0.5, '#b9c3c7'); grad.addColorStop(1, '#8d989d');
      this.roundRect(0, -bore / 2, len, bore, 3, grad, '#6a767b', 1);
      this.roundRect(-4, -bore / 2 - 2, 8, bore + 4, 2, '#56646a', null);
      this.roundRect(len - 4, -bore / 2 - 2, 8, bore + 4, 2, '#56646a', null);
      // piston (visible through barrel as darker band)
      const px = len * 0.08 + ext * (len * 0.8);
      this.roundRect(px, -bore / 2 + 2, 8, bore - 4, 1, '#3d4a50', null);
      ctx.restore();
      if (o.label) this.label(o.label, o.lx !== undefined ? o.lx : o.x + len / 2, o.ly !== undefined ? o.ly : o.y - bore);
    }

    /** Horizontal slider for analog inputs. o: { x, y, w, value (0..1), label, addr, onChange(v) } */
    slider(o) {
      const { x, y, w } = o;
      const v = Math.max(0, Math.min(1, o.value || 0));
      this.roundRect(x, y - 3, w, 6, 3, this.c.dark ? '#2a3337' : '#c4ccd0', null);
      this.roundRect(x, y - 3, w * v, 6, 3, this.c.accent, null);
      this.circle(x + w * v, y, 8, this.c.surface, this.c.accent, 2.5);
      if (o.label) this.label(o.label, x + w / 2, y - 16);
      if (o.addr) this.addr(o.addr, x + w / 2, y + 20);
      if (o.onChange) {
        const set = (pt) => o.onChange(Math.max(0, Math.min(1, (pt.x - x) / w)));
        this.hit({ type: 'rect', x: x - 10, y: y - 12, w: w + 20, h: 24 }, { cursor: 'ew-resize', label: o.label, down: set, drag: set });
      }
    }

    /** Vertical bar meter for analog outputs. o: { x, y, w, h, value, max, label, addr, unit } */
    barMeter(o) {
      const { x, y, w, h } = o;
      const max = o.max || 1000;
      const v = Math.max(0, Math.min(1, (o.value || 0) / max));
      this.roundRect(x, y, w, h, 3, this.c.dark ? '#141a1d' : '#2b3236', null);
      this.roundRect(x + 3, y + 3 + (h - 6) * (1 - v), w - 6, (h - 6) * v, 2, this.c.accent, null);
      for (let i = 0; i <= 4; i++) this.line(x + w, y + 3 + (h - 6) * i / 4, x + w + 4, y + 3 + (h - 6) * i / 4, this.c.ink3, 1);
      this.text(String(Math.round(o.value || 0)) + (o.unit || ''), x + w / 2, y - 9, { font: 'mono', size: 10, color: this.c.ink });
      if (o.label) this.label(o.label, x + w / 2, y + h + 14);
      if (o.addr) this.addr(o.addr, x + w / 2, y + h + 28);
    }

    /** Seven-segment style numeric display. o: { x, y, value, digits, size, color, label, addr } (x,y = centre) */
    display(o) {
      const digits = o.digits || 3, size = o.size || 26;
      const txt = (o.blank ? '' : String(o.value == null ? '' : o.value)).slice(-digits).padStart(digits, ' ');
      const w = digits * size * 0.62 + 16, h = size + 14;
      this.roundRect(o.x - w / 2, o.y - h / 2, w, h, 4, '#14181a', '#3a4247', 1.5);
      this.text('8'.repeat(digits), o.x, o.y + 1, { font: 'mono', size, color: 'rgba(255,80,40,0.08)', weight: 700 });
      this.text(txt, o.x, o.y + 1, { font: 'mono', size, color: o.color || '#ff6a3a', weight: 700 });
      if (o.label) this.label(o.label, o.x, o.y + h / 2 + 12);
      if (o.addr) this.addr(o.addr, o.x, o.y + h / 2 + 26);
    }

    /** Traffic signal head. o: { x, y, size, red, yellow, green, horizontal } (x,y = top-left) */
    trafficLight(o) {
      const s = o.size || 12, pad = 4;
      const n = 3;
      const w = o.horizontal ? n * (2 * s + pad) + pad : 2 * s + 2 * pad;
      const h = o.horizontal ? 2 * s + 2 * pad : n * (2 * s + pad) + pad;
      this.roundRect(o.x, o.y, w, h, 5, '#1e2427', '#0b0e10', 1);
      const cols = [['red', o.red], ['yellow', o.yellow], ['green', o.green]];
      cols.forEach(([c, on], i) => {
        const cx = o.horizontal ? o.x + pad + s + i * (2 * s + pad) : o.x + w / 2;
        const cy = o.horizontal ? o.y + h / 2 : o.y + pad + s + i * (2 * s + pad);
        const sg = SIGNAL[c];
        if (on) this.circle(cx, cy, s * 1.9, hexA(sg.on, 0.25));
        this.circle(cx, cy, s, on ? sg.on : sg.off);
      });
      return { w, h };
    }

    /** Clickable text button drawn on the plate. o: { x, y, w, h, text, active, onClick, small } */
    button(o) {
      const h = o.h || 24;
      const ctx = this.ctx;
      ctx.save();
      ctx.font = this.font(o.small ? 10.5 : 11.5, 'label', 700);
      const w = o.w || ctx.measureText(String(o.text).toUpperCase()).width + 22;
      ctx.restore();
      this.roundRect(o.x, o.y, w, h, 5, o.active ? this.c.accent : this.c.surface, o.active ? null : this.c.line, 1);
      this.text(String(o.text).toUpperCase(), o.x + w / 2, o.y + h / 2 + 0.5, { size: o.small ? 10.5 : 11.5, weight: 700, color: o.active ? '#fff' : this.c.ink, letterSpacing: 0.4 });
      if (o.onClick) this.hit({ type: 'rect', x: o.x, y: o.y, w, h }, { cursor: 'pointer', label: o.text, click: o.onClick });
      return w;
    }

    /** Warning banner across the top of the scene. kind: 'fault' | 'warn' | 'info' */
    banner(text, kind, W) {
      const col = kind === 'fault' ? this.c.fault : kind === 'info' ? this.c.info : this.c.warn;
      const w = Math.min((W || 640) - 40, 560);
      const x = ((W || 640) - w) / 2;
      this.roundRect(x, 10, w, 30, 6, col, null);
      this.text(text, x + w / 2, 25.5, { size: 12.5, weight: 700, color: kind === 'warn' && this.c.dark ? '#1d1500' : '#fff', maxWidth: w - 16 });
    }
  }

  // ---- colour helpers ------------------------------------------------------------
  function parseHex(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(hex, amt) {
    if (!/^#/.test(hex)) return hex;
    const [r, g, b] = parseHex(hex);
    const f = (c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  }
  function hexA(hex, a) {
    if (!/^#/.test(hex)) return hex;
    const [r, g, b] = parseHex(hex);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  // ---- canvas host -------------------------------------------------------------------
  /** Hosts one scene instance in a canvas element: sizing, drawing and pointer handling. */
  class SceneView {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.def = null;
      this.inst = null;
      this.hits = [];
      this.active = null;
      this.held = new Set();
      this.scale = 1;
      this.colors = readColors();
      canvas.addEventListener('pointerdown', e => this.onDown(e));
      canvas.addEventListener('pointermove', e => this.onMove(e));
      canvas.addEventListener('pointerup', e => this.onUp(e, true));
      canvas.addEventListener('pointercancel', e => this.onUp(e, false));
      canvas.addEventListener('lostpointercapture', e => this.onUp(e, false));
      canvas.addEventListener('contextmenu', e => e.preventDefault());
    }
    refreshColors() { this.colors = readColors(); }
    setScene(def, inst) { this.def = def; this.inst = inst; this.hits = []; this.active = null; this.held = new Set(); }

    resize(maxW, maxH) {
      if (!this.def) return;
      const dpr = window.devicePixelRatio || 1;
      const s = Math.min(maxW / this.def.width, maxH ? maxH / this.def.height : Infinity);
      this.scale = Math.max(0.3, s);
      const cw = Math.round(this.def.width * this.scale), ch = Math.round(this.def.height * this.scale);
      this.canvas.style.width = cw + 'px';
      this.canvas.style.height = ch + 'px';
      this.canvas.width = Math.round(cw * dpr);
      this.canvas.height = Math.round(ch * dpr);
      this.dpr = dpr;
    }

    draw(phys, time) {
      if (!this.def || !this.inst) return;
      const ctx = this.ctx;
      const k = this.scale * (this.dpr || 1);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.fillStyle = this.colors.cabinet;
      ctx.fillRect(0, 0, this.def.width, this.def.height);
      const hits = [];
      const g = new Graphics(ctx, this.colors, time, hits);
      g.W = this.def.width; g.H = this.def.height;
      g.names = this.names || {};
      try { this.inst.draw(g, phys); } catch (e) { console.error('Scene draw failed', e); }
      this.hits = hits;
    }

    toLocal(e) {
      const r = this.canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / this.scale, y: (e.clientY - r.top) / this.scale };
    }
    hitAt(p) {
      for (let i = this.hits.length - 1; i >= 0; i--) {
        const h = this.hits[i], s = h.shape;
        if (s.type === 'circle' ? Math.hypot(p.x - s.x, p.y - s.y) <= s.r : (p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h)) return h;
      }
      return null;
    }
    onDown(e) {
      const p = this.toLocal(e);
      const h = this.hitAt(p);
      if (!h) return;
      e.preventDefault();
      // Shift+click latches a momentary button so two buttons can be held at once
      if (e.shiftKey && h.down && h.up && !h.click) {
        const key = h.shape.type + ':' + h.shape.x + ':' + h.shape.y;
        if (this.held.has(key)) { this.held.delete(key); h.up(); } else { this.held.add(key); h.down(p); }
        return;
      }
      this.active = h;
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (h.down) h.down(p);
    }
    onMove(e) {
      const p = this.toLocal(e);
      if (this.active) {
        if (this.active.drag) this.active.drag(p);
        return;
      }
      const h = this.hitAt(p);
      this.canvas.style.cursor = h ? (h.cursor || 'pointer') : 'default';
      this.canvas.title = h && h.label ? String(h.label) : '';
    }
    onUp(e, inside) {
      const h = this.active;
      if (!h) return;
      this.active = null;
      if (h.up) h.up();
      if (inside && h.click) {
        const p = this.toLocal(e);
        const again = this.hitAt(p);
        if (again && again.shape.x === h.shape.x && again.shape.y === h.shape.y) h.click(p);
      }
    }
  }

  PLC.scenes = { register, get, list, Graphics, SceneView, readColors, shade, hexA, SIGNAL, DEFAULT_COLORS };
})(window.PLC = window.PLC || {});
