/* LadderLab scene: pneumatic press. Clamp cylinder A holds the part, press cylinder B stamps it (sequence A+ B+ B- A-). */
(function (PLC) {
  'use strict';

  const tags = [
    { name: 'Start', type: 'BOOL', address: '%IX0.0', comment: 'Start push button (NO)' },
    { name: 'Stop', type: 'BOOL', address: '%IX0.1', comment: 'Stop push button (NC: TRUE when not pressed)' },
    { name: 'A_Retracted', type: 'BOOL', address: '%IX0.2', comment: 'Cylinder A retracted (reed switch a0)' },
    { name: 'A_Extended', type: 'BOOL', address: '%IX0.3', comment: 'Cylinder A extended (reed switch a1)' },
    { name: 'B_Retracted', type: 'BOOL', address: '%IX0.4', comment: 'Cylinder B retracted (reed switch b0)' },
    { name: 'B_Extended', type: 'BOOL', address: '%IX0.5', comment: 'Cylinder B extended (reed switch b1)' },
    { name: 'Part_Present', type: 'BOOL', address: '%IX0.6', comment: 'Sensor: a part is in the fixture' },
    { name: 'A_Extend', type: 'BOOL', address: '%QX0.0', comment: 'Valve solenoid Y1: extend clamp cylinder A (spring return)' },
    { name: 'B_Extend', type: 'BOOL', address: '%QX0.1', comment: 'Valve solenoid Y2: extend press cylinder B (spring return)' },
    { name: 'Lamp_Cycle', type: 'BOOL', address: '%QX0.2', comment: 'Cycle running lamp' }
  ];

  const T_A = 0.8, T_B = 1.0;            // stroke times (s)
  const AX = 204, AY = 277, AL = 100;    // cylinder A: cap end, axis, length (stroke = 0.8 * length)
  const BX = 430, BL = 72;               // cylinder B: axis, length
  const TABLE_Y = 294, PW = 60, PH = 34;
  const PX = AX + 1.8 * AL + 16;         // part left edge = clamp jaw face at full stroke
  const PUNCH = 22;                      // rod end to punch face
  const BY = TABLE_Y - PH - PUNCH - 1.8 * BL;   // cylinder B cap end: punch face meets the part at full stroke
  const OUT_T = 1.2;                     // s for a part to slide out
  const BIN = { x: 548, y: 372, w: 64, h: 32 };

  PLC.scenes.register({
    id: 'cylinders',
    name: 'Pneumatic Press',
    description: 'Clamp a part with cylinder A, stamp it with cylinder B. Monostable 5/2 valves, reed switches at both end positions.',
    width: 640, height: 440,
    tags,
    create() {
      const st = {};
      function reset(phys) {
        st.a = 0; st.b = 0; st.bWasExt = false;
        st.part = null; st.out = null; st.binN = 0;
        st.good = 0; st.scrap = 0; st.fault = false; st.noPart = 0;
        st.auto = false; st.autoT = 0; st.note = 0;
        st.start = false; st.stop = false;
        if (phys) {
          phys.I[0] = false; phys.I[1] = true;
          phys.I[2] = true; phys.I[3] = false; phys.I[4] = true; phys.I[5] = false; phys.I[6] = false;
        }
      }
      reset(null);
      // the fixture can be loaded while it is empty and both cylinders are (nearly) home
      const canInsert = () => !st.part && !st.out && st.a < 0.5 && st.b < 0.5;
      function insertPart() {
        if (!canInsert()) return false;
        st.part = { state: 'raw', drop: 0 };
        return true;
      }
      function removePart(kind) {
        st.out = { kind, t: 0 };
        st.part = null;
      }
      return {
        reset,
        insertPart,
        info() { return { a: st.a, b: st.b, good: st.good, scrap: st.scrap, part: st.part ? st.part.state : null, fault: st.fault, noPart: st.noPart > 0 }; },
        step(dt, phys) {
          const s = dt / 1000;
          st.a = Math.max(0, Math.min(1, st.a + (phys.Q[0] ? s : -s) / T_A));
          st.b = Math.max(0, Math.min(1, st.b + (phys.Q[1] ? s : -s) / T_B));
          const aExt = st.a >= 1, aRet = st.a <= 0, bExt = st.b >= 1, bRet = st.b <= 0;
          if (st.part && st.part.drop < 1) st.part.drop = Math.min(1, st.part.drop + s / 0.3);
          // press stroke reaches the bottom
          if (bExt && !st.bWasExt) {
            if (!st.part) st.noPart = 3;
            else if (st.part.state === 'raw') {
              if (aExt) st.part.state = 'pressed';
              else { st.part.state = 'scrap'; st.scrap++; st.fault = true; }
            }
          }
          st.bWasExt = bExt;
          st.noPart = Math.max(0, st.noPart - s);
          st.note = Math.max(0, st.note - s);
          // finished part slides out once both cylinders are home
          if (st.part && st.part.state === 'pressed' && aRet && bRet && !st.out) { st.good++; removePart('good'); }
          if (st.out) {
            st.out.t += s / OUT_T;
            if (st.out.t >= 1) { st.out = null; st.binN++; st.autoT = 1; }
          }
          if (st.auto && !st.part && !st.out) {
            if (st.autoT > 0) st.autoT = Math.max(0, st.autoT - s);
            else insertPart();
          }
          phys.I[2] = aRet; phys.I[3] = aExt;
          phys.I[4] = bRet; phys.I[5] = bExt;
          phys.I[6] = !!st.part && st.part.drop >= 1;
        },
        draw(g, phys) {
          const W = g.W, c = g.c;

          // ---- operator panel
          g.plate(12, 50, 138, 378, 'Operator');
          g.pushButton({ x: 50, y: 106, color: 'green', label: 'Start', addr: '%IX0.0', nc: false, pressed: st.start, signal: phys.I[0], onPress: v => { st.start = v; phys.I[0] = v; } });
          g.pushButton({ x: 112, y: 106, color: 'red', label: 'Stop', addr: '%IX0.1', nc: true, pressed: st.stop, signal: phys.I[1], onPress: v => { st.stop = v; phys.I[1] = !v; } });
          g.lamp({ x: 81, y: 198, color: 'green', on: phys.Q[2], label: 'Cycle', addr: '%QX0.2' });
          g.line(24, 262, 138, 262, c.line, 1);
          g.text('PARTS', 81, 276, { size: 10, weight: 700, color: c.ink3, letterSpacing: 1 });
          g.display({ x: 50, y: 306, value: st.good, digits: 3, size: 18, color: '#4fe08a', label: 'Good' });
          g.display({ x: 112, y: 306, value: st.scrap, digits: 3, size: 18, color: '#ff6a3a', label: 'Scrap' });
          g.button({ x: 24, y: 352, w: 114, text: 'Insert part', small: true, onClick: () => { if (!insertPart()) st.note = 2.5; } });
          g.button({ x: 24, y: 384, w: 114, text: 'Auto insert', small: true, active: st.auto, onClick: () => { st.auto = !st.auto; st.autoT = 0; } });
          if (st.note > 0) g.text(st.part || st.out ? 'Fixture is not empty' : 'Retract A and B first', 81, 419, { size: 10, color: c.ink2 });

          // ---- press
          g.plate(162, 50, 466, 378, 'Press');
          pressFrame(g);
          for (let i = 0; i < Math.min(st.binN, 3); i++) g.roundRect(BIN.x + 8 + i * 17, BIN.y + BIN.h - 12, 15, 9, 1.5, '#d4a84b', '#6d4f12', 1);
          // air hoses: valve Y1 → cylinder A, valve Y2 → cylinder B
          const aMove = phys.Q[0] ? (st.a < 1) : (st.a > 0), bMove = phys.Q[1] ? (st.b < 1) : (st.b > 0);
          g.pipe([[306, 215], [306, 240], [AX + 10, 240], [AX + 10, AY - 13]], { width: 5, flowing: aMove && phys.Q[0], speed: 0.8 });
          g.pipe([[320, 215], [320, 250], [AX + AL - 10, 250], [AX + AL - 10, AY - 13]], { width: 5, flowing: aMove && !phys.Q[0], speed: 0.8 });
          g.pipe([[362, 145], [372, 145], [372, BY + 8], [BX - 13, BY + 8]], { width: 5, flowing: bMove && phys.Q[1], speed: 0.8 });
          g.pipe([[362, 155], [386, 155], [386, BY + BL - 8], [BX - 13, BY + BL - 8]], { width: 5, flowing: bMove && !phys.Q[1], speed: 0.8 });
          valve(g, 312, 206, !!phys.Q[0], 'Y1', 'down');
          g.label('Valve Y1', 238, 200);
          g.addr('%QX0.0', 238, 214, { active: phys.Q[0] });
          valve(g, 330, 150, !!phys.Q[1], 'Y2', 'right');
          g.label('Valve Y2', 238, 144);
          g.addr('%QX0.1', 238, 158, { active: phys.Q[1] });

          // part in the fixture (drawn before the jaw and the punch)
          if (st.part) {
            const drop = st.part.drop, fall = (1 - drop * drop) * 70;
            part(g, PX, TABLE_Y - fall, st.part.state, 0, drop < 1 ? drop : 1);
          }
          if (st.out) {
            const k = outPath(st.out.t);
            part(g, k.x, k.y, st.out.kind === 'good' ? 'pressed' : 'scrap', k.r, k.alpha);
          }
          // cylinder A with clamp jaw
          const aRod = AX + AL + 0.8 * AL * st.a;
          g.roundRect(aRod + 6, AY - 16, 10, 32, 2, '#6f7d83', '#3d4a50', 1);
          g.cylinder({ x: AX, y: AY, len: AL, bore: 26, ext: st.a, dir: 'right' });
          tag(g, AX + AL / 2 - 4, AY - 26, 'A');
          // cylinder B with punch
          const bRod = BY + BL + 0.8 * BL * st.b;
          g.roundRect(BX - 16, bRod + 6, 32, 8, 2, '#6f7d83', '#3d4a50', 1);
          g.roundRect(BX - 8, bRod + 13, 16, PUNCH - 13, 1, '#8d999e', '#3d4a50', 1);
          g.cylinder({ x: BX, y: BY, len: BL, bore: 26, ext: st.b, dir: 'down' });
          tag(g, BX - 26, BY + BL / 2, 'B');

          // reed switches
          const reed = (x, y, dir, on, name, addr, cap, lx, ly) => {
            g.sensor({ x, y, dir, active: on, label: name, addr, lx, ly });
            g.text(cap, x + (lx || 0), y + (ly !== undefined ? ly : 20) + 28, { size: 9.5, color: c.ink3 });
          };
          reed(AX + 12, AY + 28, 'up', phys.I[2], 'a0', '%IX0.2', 'retracted');
          reed(AX + AL - 8, AY + 28, 'up', phys.I[3], 'a1', '%IX0.3', 'extended');
          reed(BX + 28, BY + 10, 'left', phys.I[4], 'b0', '%IX0.4', 'retracted', 52, -6);
          reed(BX + 28, BY + BL - 6, 'left', phys.I[5], 'b1', '%IX0.5', 'extended', 52, -6);
          // part sensor under the fixture
          g.sensor({ x: PX + PW / 2, y: TABLE_Y + 26, dir: 'up', active: phys.I[6], label: 'Part sensor', addr: '%IX0.6' });

          if (st.fault && st.part && st.part.state === 'scrap') {
            g.button({ x: 478, y: 226, text: 'Remove scrap', small: true, onClick: () => { removePart('scrap'); st.fault = false; } });
          }

          if (st.fault) g.banner('Part not clamped! Extend cylinder A before pressing.', 'fault', W);
          else if (st.noPart > 0) g.banner('Pressed with no part in the fixture.', 'warn', W);
          else g.text('Sequence A+ B+ B− A−: clamp, press, lift the press, unclamp. Click Insert part to load the fixture.', W / 2, 26, { size: 11.5, color: c.ink2 });
        }
      };
    }
  });

  // ---- drawing helpers ---------------------------------------------------------
  function pressFrame(g) {
    const dark = g.c.dark;
    const steel = dark ? '#55636a' : '#7d8a90', edge = dark ? '#3c484d' : '#56646a';
    const table = dark ? '#6b787e' : '#a3afb4';
    // C-frame: column, arm and base
    g.roundRect(168, 404, 364, 12, 2, steel, edge, 1);
    g.roundRect(172, 84, 16, 322, 2, steel, edge, 1);
    g.roundRect(172, 84, 298, 20, 2, steel, edge, 1);
    g.roundRect(186, AY - 20, 14, 40, 2, edge, null);
    g.roundRect(BX - 22, 102, 44, 8, 1, edge, null);
    // fixture table with fixed stop
    g.roundRect(340, TABLE_Y + 12, 10, 404 - TABLE_Y - 12, 0, edge, null);
    g.roundRect(506, TABLE_Y + 12, 10, 404 - TABLE_Y - 12, 0, edge, null);
    g.roundRect(330, TABLE_Y, 190, 12, 2, table, edge, 1);
    g.roundRect(PX + PW, TABLE_Y - 12, 10, 12, 1, steel, edge, 1);
    // chute and output bin
    const ctx = g.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(520, TABLE_Y + 2); ctx.lineTo(BIN.x + 10, BIN.y - 2);
    ctx.strokeStyle = table; ctx.lineWidth = 5; ctx.stroke();
    ctx.restore();
    g.roundRect(BIN.x, BIN.y, BIN.w, BIN.h, 3, dark ? '#2a3337' : '#c4ccd0', edge, 1.5);
    g.text('OUT', BIN.x + BIN.w / 2, BIN.y + BIN.h + 12, { size: 9.5, weight: 700, color: g.c.ink3, letterSpacing: 1 });
  }

  /** Keyframes of the slide-out: lift over the stop, slide to the end of the table, drop into the bin. */
  function outPath(t) {
    const keys = [
      [0, PX, TABLE_Y, 0, 1], [0.15, PX, TABLE_Y - 16, 0, 1], [0.55, 505, TABLE_Y - 16, 0, 1],
      [0.8, 540, BIN.y + 6, 0.55, 1], [1, BIN.x + 6, BIN.y + BIN.h - 2, 0.1, 0]
    ];
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const a = keys[i], b = keys[i + 1];
    const f = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])));
    const m = (j) => a[j] + (b[j] - a[j]) * f;
    return { x: m(1), y: m(2), r: m(3), alpha: m(4) };
  }

  /** Workpiece, x = left edge, y = bottom. state: raw | pressed | scrap */
  function part(g, x, y, state, rot, alpha) {
    const ctx = g.ctx;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha === undefined ? 1 : alpha));
    ctx.translate(x + PW / 2, y - PH / 2);
    ctx.rotate(rot || 0);
    const x0 = -PW / 2, y0 = -PH / 2;
    if (state === 'scrap') {
      ctx.beginPath();
      ctx.moveTo(x0, y0 + PH);
      ctx.lineTo(x0 - 3, y0 + 14);
      ctx.lineTo(x0 + 18, y0 + 6);
      ctx.lineTo(x0 + 30, y0 + 15);
      ctx.lineTo(x0 + 42, y0 + 4);
      ctx.lineTo(x0 + PW + 4, y0 + 12);
      ctx.lineTo(x0 + PW, y0 + PH);
      ctx.closePath();
      ctx.fillStyle = '#a8603a'; ctx.fill();
      ctx.strokeStyle = '#5a2a14'; ctx.lineWidth = 1.2; ctx.stroke();
      g.line(x0 + 30, y0 + 15, x0 + 26, y0 + 26, '#3a1a0a', 1.5);
      g.line(x0 + 26, y0 + 26, x0 + 31, y0 + 31, '#3a1a0a', 1.2);
      g.line(x0 + 42, y0 + 5, x0 + 46, y0 + 18, '#3a1a0a', 1.2);
    } else {
      const grad = ctx.createLinearGradient(0, y0, 0, y0 + PH);
      grad.addColorStop(0, '#e9c46a'); grad.addColorStop(1, '#b8892e');
      g.roundRect(x0, y0, PW, PH, 2, grad, '#6d4f12', 1.2);
      g.line(x0 + 2, y0 + 1.5, x0 + PW - 2, y0 + 1.5, 'rgba(255,255,255,0.5)', 1);
      if (state === 'pressed') {
        // stamped notch on top and an embossed mark on the face
        ctx.beginPath();
        ctx.moveTo(-9, y0); ctx.lineTo(0, y0 + 8); ctx.lineTo(9, y0);
        ctx.closePath();
        ctx.fillStyle = '#7a5512'; ctx.fill();
        g.circle(0, y0 + 20, 6, null, '#7a5512', 2);
        g.line(-3, y0 + 20, 3, y0 + 20, '#7a5512', 2);
      }
    }
    ctx.restore();
  }

  /** Monostable 5/2 solenoid valve: coil with LED, body, spring cap and two working ports. */
  function valve(g, cx, cy, on, name, ports) {
    g.roundRect(cx - 24, cy - 9, 48, 18, 2, '#b9c3c7', '#5f6b70', 1);
    g.line(cx - 8, cy - 9, cx - 8, cy + 9, '#8d989d', 1);
    g.line(cx + 8, cy - 9, cx + 8, cy + 9, '#8d989d', 1);
    // spring end
    g.roundRect(cx + 24, cy - 6, 6, 12, 1, '#8d989d', '#5f6b70', 1);
    // solenoid coil
    g.roundRect(cx - 44, cy - 11, 20, 22, 2, '#23292c', '#0d1012', 1);
    g.text(name, cx - 34, cy + 4, { size: 8.5, weight: 700, color: '#d7dde0' });
    g.led(cx - 34, cy - 5, on, 'yellow', 2.6);
    // working ports
    if (ports === 'down') {
      g.roundRect(cx - 9, cy + 8, 6, 5, 1, '#5f6b70', null);
      g.roundRect(cx + 5, cy + 8, 6, 5, 1, '#5f6b70', null);
    } else {
      g.roundRect(cx + 30, cy - 8, 5, 6, 1, '#5f6b70', null);
      g.roundRect(cx + 30, cy + 2, 5, 6, 1, '#5f6b70', null);
    }
  }

  /** Round name tag on a cylinder. */
  function tag(g, x, y, text) {
    g.circle(x, y, 8, g.c.dark ? '#e1e7e9' : '#2a3135');
    g.text(text, x, y + 0.5, { size: 10.5, weight: 700, font: 'ui', color: g.c.dark ? '#1a2327' : '#fff' });
  }
})(window.PLC = window.PLC || {});
