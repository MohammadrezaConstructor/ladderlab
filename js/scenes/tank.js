/* LadderLab scene: mixing tank with inlet pump, drain valve, mixer, two level switches and a level transmitter. */
(function (PLC) {
  'use strict';
  const MAX = PLC.types.IO.ANALOG_MAX;

  const tags = [
    { name: 'Level_Low', type: 'BOOL', address: '%IX0.0', comment: 'Low level switch (TRUE when liquid covers it, at 20 %)' },
    { name: 'Level_High', type: 'BOOL', address: '%IX0.1', comment: 'High level switch (TRUE when liquid covers it, at 80 %)' },
    { name: 'Start', type: 'BOOL', address: '%IX0.2', comment: 'Start push button (NO)' },
    { name: 'Stop', type: 'BOOL', address: '%IX0.3', comment: 'Stop push button (NC: TRUE when not pressed)' },
    { name: 'Auto_Mode', type: 'BOOL', address: '%IX0.4', comment: 'Selector switch: TRUE = automatic mode' },
    { name: 'Level', type: 'INT', address: '%IW0', comment: 'Level transmitter 0..1000 (= 0.0..100.0 %)' },
    { name: 'Pump', type: 'BOOL', address: '%QX0.0', comment: 'Inlet pump P1 (fills the tank)' },
    { name: 'Drain_Valve', type: 'BOOL', address: '%QX0.1', comment: 'Outlet valve V1 (drains the tank)' },
    { name: 'Mixer', type: 'BOOL', address: '%QX0.2', comment: 'Mixer motor M2' },
    { name: 'Alarm', type: 'BOOL', address: '%QX0.3', comment: 'Alarm beacon' },
    { name: 'Display', type: 'INT', address: '%QW0', comment: 'Panel display (shows any number)' }
  ];

  const FILL = 0.05, DRAIN = 0.04, CONSUME = 0.03;   // share of the tank per second
  const LOW = 0.2, HIGH = 0.8;
  const TX = 170, TY = 116, TW = 130, TH = 212;       // vessel
  const MIDX = TX + TW / 2, PIPE_Y = 368, INLET_X = 190;
  const LIQ = '#3d8fd8';
  const levelY = f => TY + TH - 4 - (TH - 8) * f;

  PLC.scenes.register({
    id: 'tank',
    name: 'Tank Level Control',
    description: 'Fill a mixing tank with a pump and drain it through a valve. Two level switches and a level transmitter report the level.',
    width: 640, height: 440,
    tags,
    create() {
      const st = {};
      function sense(phys) {
        phys.I[0] = st.level >= LOW;
        phys.I[1] = st.level >= HIGH;
        phys.IW[0] = Math.round(st.level * MAX);
      }
      function reset(phys) {
        st.level = 0.10; st.consumer = 0; st.spill = 0; st.overflowT = 0;
        st.mixSpeed = 0; st.mixAngle = 0; st.dry = false;
        st.start = false; st.stop = false;
        st.flowIn = false; st.flowOut = false; st.flowCons = false;
        if (phys) { phys.I[2] = false; phys.I[3] = true; phys.I[4] = false; sense(phys); }
      }
      reset(null);
      return {
        reset,
        state: st,
        step(dt, phys) {
          const s = dt / 1000;
          const pump = !!phys.Q[0], valve = !!phys.Q[1], mixer = !!phys.Q[2];
          const wet = st.level > 0;
          let lvl = st.level + (pump ? FILL * s : 0);
          if (wet) lvl -= ((valve ? DRAIN : 0) + st.consumer * CONSUME) * s;
          st.flowIn = pump;
          st.flowOut = valve && wet;
          st.flowCons = st.consumer > 0.005 && wet;
          if (lvl > 1) { st.spill = Math.min(1, st.spill + (lvl - 1) * 3); st.overflowT = 2; } // spills over the rim
          else st.overflowT = Math.max(0, st.overflowT - s);
          st.level = Math.max(0, Math.min(1, lvl));
          st.mixSpeed += ((mixer ? 1 : 0) - st.mixSpeed) * Math.min(1, s / 0.5);
          st.mixAngle += st.mixSpeed * s * Math.PI * 2 * 1.3;
          st.dry = mixer && st.level < LOW;
          sense(phys);
        },
        draw(g, phys) {
          const W = g.W, c = g.c;
          const pumpOn = !!phys.Q[0], valveOpen = !!phys.Q[1], mixOn = !!phys.Q[2], alarm = !!phys.Q[3];
          const overflow = st.overflowT > 0;
          g.plate(12, 50, 430, 378, 'Process');
          g.plate(454, 50, 174, 378, 'Operator panel');

          // spilled liquid on the floor
          if (st.spill > 0) {
            const rx = 50 + 110 * st.spill;
            g.ctx.save();
            g.ctx.beginPath();
            g.ctx.ellipse(MIDX, TY + TH + 10, rx, 5 + 4 * st.spill, 0, 0, Math.PI * 2);
            g.ctx.fillStyle = PLC.scenes.hexA(LIQ, 0.45);
            g.ctx.fill();
            g.ctx.restore();
          }

          // outlet: tank → junction, then drain (right, through V1) and consumer (left)
          g.pipe([[MIDX, TY + TH - 2], [MIDX, PIPE_Y]], { flowing: st.flowOut || st.flowCons });
          g.pipe([[MIDX, PIPE_Y], [434, PIPE_Y]], { flowing: st.flowOut });
          g.pipe([[MIDX, PIPE_Y], [40, PIPE_Y]], { flowing: st.flowCons });
          arrow(g, 436, PIPE_Y, 1);
          arrow(g, 38, PIPE_Y, -1);
          g.text('to drain', 434, PIPE_Y - 16, { align: 'right', size: 10, color: c.ink3 });
          g.text('to consumer', 40, PIPE_Y - 16, { align: 'left', size: 10, color: c.ink3 });
          g.valve({ x: 372, y: PIPE_Y, size: 11, open: valveOpen, label: 'Drain valve V1', addr: '%QX0.1' });

          vessel(g, st, overflow);

          // supply line, pump P1 and inlet into the open top
          g.pipe([[24, 92], [INLET_X, 92], [INLET_X, TY + 16]], { flowing: pumpOn });
          g.text('supply', 26, 77, { align: 'left', size: 10, color: c.ink3 });
          g.pump({ x: 82, y: 92, r: 15, on: pumpOn, label: 'Pump P1', addr: '%QX0.0' });

          // level switches on the left wall
          levelSwitch(g, levelY(HIGH), phys.I[1], 'High switch', '%IX0.1');
          levelSwitch(g, levelY(LOW), phys.I[0], 'Low switch', '%IX0.0');

          // mixer motor on its bridge
          mixerMotor(g, mixOn, st);
          g.label('Mixer M2', 304, 80);
          g.addr('%QX0.2', 304, 94, { active: mixOn });

          // level transmitter (hydrostatic) near the bottom
          transmitter(g, phys.IW[0]);

          beacon(g, 398, 92, alarm);
          g.label('Alarm', 398, 124);
          g.addr('%QX0.3', 398, 138, { active: alarm });

          // consumer demand: operator disturbance, not wired to the PLC
          g.slider({ x: 40, y: 410, w: 130, value: st.consumer, onChange: v => { st.consumer = Math.round(v * 100) / 100; } });
          g.label('Consumer draw  ' + Math.round(st.consumer * 100) + ' %', 105, 392);
          if (st.spill > 0 && !overflow) g.button({ x: 30, y: 318, text: 'Mop up', small: true, onClick: () => { st.spill = 0; } });

          // operator panel
          g.display({ x: 541, y: 100, value: phys.QW[0], digits: 6, size: 20, label: 'Display', addr: '%QW0' });
          g.pushButton({ x: 500, y: 208, color: 'green', label: 'Start', addr: '%IX0.2', nc: false, pressed: st.start, signal: phys.I[2], onPress: v => { st.start = v; phys.I[2] = v; } });
          g.pushButton({ x: 582, y: 208, color: 'red', label: 'Stop', addr: '%IX0.3', nc: true, pressed: st.stop, signal: phys.I[3], onPress: v => { st.stop = v; phys.I[3] = !v; } });
          g.selector({ x: 541, y: 316, on: phys.I[4], labels: ['MAN', 'AUTO'], label: 'Mode', addr: '%IX0.4', signal: phys.I[4], onToggle: () => { phys.I[4] = !phys.I[4]; } });
          g.text('Stop is NC: its input', 541, 392, { size: 9.5, color: c.ink3 });
          g.text('is TRUE until pressed', 541, 404, { size: 9.5, color: c.ink3 });

          if (overflow) g.banner('Overflow! Switch the pump off at the high level.', 'fault', W);
          else if (st.dry) g.banner('Mixer running dry. Only run it while Level_Low is TRUE.', 'warn', W);
          else g.text('Fill to the high level switch, then stop. Drag the consumer slider to draw liquid off.', W / 2, 26, { size: 11.5, color: c.ink2 });
        }
      };
    }
  });

  // open-top vessel with liquid, agitator and level marks
  function vessel(g, st, overflow) {
    const ctx = g.ctx, c = g.c, t = g.t;
    const outline = () => {
      ctx.beginPath();
      ctx.moveTo(TX, TY);
      ctx.lineTo(TX, TY + TH - 14);
      ctx.arcTo(TX, TY + TH, TX + 14, TY + TH, 14);
      ctx.lineTo(TX + TW - 14, TY + TH);
      ctx.arcTo(TX + TW, TY + TH, TX + TW, TY + TH - 14, 14);
      ctx.lineTo(TX + TW, TY);
    };
    ctx.save();
    outline(); ctx.closePath();
    ctx.fillStyle = c.dark ? '#151c20' : '#f4f7f8';
    ctx.fill();
    ctx.clip();
    const sy = levelY(st.level);
    if (st.level > 0.002) {
      const grad = ctx.createLinearGradient(0, sy, 0, TY + TH);
      grad.addColorStop(0, PLC.scenes.hexA(LIQ, 0.8));
      grad.addColorStop(1, PLC.scenes.hexA('#1f5f9e', 0.95));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(TX, TY + TH + 2);
      const amp = st.mixSpeed > 0.1 ? 2.4 * st.mixSpeed : 1.2;
      for (let x = TX; x <= TX + TW; x += 4) ctx.lineTo(x, sy + Math.sin(x / 9 + t / 280) * (st.level < 0.995 ? amp : 0));
      ctx.lineTo(TX + TW, TY + TH + 2);
      ctx.closePath();
      ctx.fill();
    }
    // level marks for the two switches
    for (const [f, txt] of [[HIGH, '80 %'], [LOW, '20 %']]) {
      const y = levelY(f), under = st.level >= f;
      g.line(TX + 4, y, TX + TW - 4, y, under ? 'rgba(255,255,255,0.55)' : c.ink3, 1, [5, 4]);
      g.text(txt, TX + TW - 6, y - 7, { align: 'right', size: 9.5, font: 'mono', color: under ? 'rgba(255,255,255,0.9)' : c.ink3 });
    }
    // agitator shaft and impeller (side view: blade width follows the rotation)
    const shaftBot = TY + TH - 40;
    g.line(MIDX, TY - 4, MIDX, shaftBot + 4, '#7d898e', 4);
    for (let i = 0; i < 2; i++) {
      const a = st.mixAngle + i * Math.PI, w = Math.cos(a) * 26;
      const col = Math.sin(a) > 0 ? '#aab5ba' : '#6f7c82';
      g.roundRect(Math.min(MIDX, MIDX + w), shaftBot - 4, Math.max(1.5, Math.abs(w)), 8, 2, col, '#4b575c', 0.8);
    }
    g.circle(MIDX, shaftBot, 5, '#8a969b', '#4b575c', 1);
    // whatever is below the surface looks submerged
    if (st.level > 0.002) {
      ctx.fillStyle = PLC.scenes.hexA(LIQ, 0.35);
      ctx.fillRect(TX, sy + 1, TW, TY + TH - sy);
    }
    // inlet stream
    if (st.flowIn) {
      const y0 = TY + 18, y1 = Math.max(y0, sy);
      ctx.fillStyle = PLC.scenes.hexA(LIQ, 0.85);
      ctx.fillRect(INLET_X - 2.5, y0, 5, y1 - y0);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]); ctx.lineDashOffset = -t / 12;
      ctx.beginPath(); ctx.moveTo(INLET_X, y0); ctx.lineTo(INLET_X, y1); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
    // walls
    ctx.save();
    outline();
    ctx.strokeStyle = c.ink2; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
    g.roundRect(TX - 5, TY - 3, 10, 5, 2, c.ink2);
    g.roundRect(TX + TW - 5, TY - 3, 10, 5, 2, c.ink2);
    g.label('Tank T1', MIDX - 34, TY + TH + 14);
    // liquid running over the rim
    if (overflow) {
      for (const [x, d] of [[TX, -1], [TX + TW, 1]]) {
        ctx.save();
        ctx.strokeStyle = PLC.scenes.hexA(LIQ, 0.8); ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - d * 2, TY - 2); ctx.quadraticCurveTo(x + d * 6, TY - 4, x + d * 5, TY + 10); ctx.lineTo(x + d * 5, TY + TH + 8); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 7]); ctx.lineDashOffset = -t / 10;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function levelSwitch(g, y, on, label, addr) {
    g.sensor({ x: TX - 12, y, active: on, dir: 'right' });
    g.label(label, 96, y - 7);
    g.addr(addr, 96, y + 7, { active: on });
  }

  function mixerMotor(g, on, st) {
    const c = g.c, x = MIDX;
    g.roundRect(TX - 8, TY - 9, TW + 16, 6, 2, c.dark ? '#5c6a70' : '#8d999e', c.dark ? '#3c484d' : '#6c787d', 1); // bridge
    g.roundRect(x - 7, TY - 15, 14, 7, 1.5, '#56646a');                                                       // coupling
    const body = c.dark ? '#46535a' : '#6f7f86';
    g.roundRect(x - 15, 76, 30, 26, 4, body, on ? c.power : (c.dark ? '#2b3439' : '#4c5a60'), on ? 2 : 1);
    for (let i = -2; i <= 2; i++) g.line(x + i * 5.5, 79, x + i * 5.5, 99, c.dark ? '#3a464c' : '#5f6e74', 1.2);
    g.roundRect(x - 11, 70, 22, 7, 2, c.dark ? '#5c6a70' : '#8a989e');
    // rotating mark on the fan cover shows the motor turning
    const a = st.mixAngle;
    g.line(x - Math.cos(a) * 9, 73.5, x + Math.cos(a) * 9, 73.5, '#e6eaec', 2);
  }

  function transmitter(g, value) {
    const c = g.c, x = 356, y = 290;
    g.pipe([[TX + TW + 1, y + 4], [x - 34, y + 4]], { width: 5 });
    g.roundRect(x - 34, y - 18, 68, 36, 7, c.dark ? '#3a4449' : '#d6dcde', c.ink2, 1.2);
    g.roundRect(x - 27, y - 12, 54, 24, 3, '#1b2a22');
    g.text((value / 10).toFixed(1) + '%', x, y + 1, { font: 'mono', size: 13, weight: 700, color: '#7dffa8' });
    g.label('Level LT1', x, y + 32);
    g.addr('%IW0', x - 14, y + 46);
    g.text('= ' + value, x + 12, y + 46.5, { align: 'left', font: 'mono', size: 10, color: c.ink2 });
  }

  function beacon(g, x, y, on) {
    const ctx = g.ctx, s = g.SIGNAL.amber;
    if (on) {
      const a = g.t / 160;
      ctx.save();
      ctx.translate(x, y - 4);
      for (const d of [0, Math.PI]) {
        const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, 34);
        grad.addColorStop(0, PLC.scenes.hexA(s.on, 0.55));
        grad.addColorStop(1, PLC.scenes.hexA(s.on, 0));
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 34, a + d - 0.35, a + d + 0.35); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - 11, y + 6); ctx.lineTo(x - 11, y - 6); ctx.arc(x, y - 6, 11, Math.PI, 0); ctx.lineTo(x + 11, y + 6); ctx.closePath();
    const grad = ctx.createLinearGradient(x - 11, 0, x + 11, 0);
    grad.addColorStop(0, on ? '#ffd27a' : s.off); grad.addColorStop(0.5, on ? s.on : PLC.scenes.shade(s.off, 0.25)); grad.addColorStop(1, on ? '#d77a00' : s.off);
    ctx.fillStyle = grad; ctx.fill();
    ctx.restore();
    g.roundRect(x - 15, y + 5, 30, 8, 2, g.c.dark ? '#5c6a70' : '#56646a');
  }

  function arrow(g, x, y, dir) {
    const ctx = g.ctx;
    ctx.beginPath();
    ctx.moveTo(x + dir * 7, y); ctx.lineTo(x - dir * 2, y - 7); ctx.lineTo(x - dir * 2, y + 7); ctx.closePath();
    ctx.fillStyle = g.c.ink2; ctx.fill();
  }
})(window.PLC = window.PLC || {});
