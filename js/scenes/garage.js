/* LadderLab scene: sectional garage door with limit switches, a safety light barrier, a wall panel and a hand-held remote. */
(function (PLC) {
  'use strict';
  const K = PLC.scenes;

  const tags = [
    { name: 'Btn_Open', type: 'BOOL', address: '%IX0.0', comment: 'Open push button (NO)' },
    { name: 'Btn_Close', type: 'BOOL', address: '%IX0.1', comment: 'Close push button (NO)' },
    { name: 'Btn_Stop', type: 'BOOL', address: '%IX0.2', comment: 'Stop push button (NC: TRUE when not pressed)' },
    { name: 'Limit_Open', type: 'BOOL', address: '%IX0.3', comment: 'Upper limit switch (TRUE when the door is fully open)' },
    { name: 'Limit_Closed', type: 'BOOL', address: '%IX0.4', comment: 'Lower limit switch (TRUE when the door is fully closed)' },
    { name: 'Photo_Eye', type: 'BOOL', address: '%IX0.5', comment: 'Safety light barrier (TRUE while the beam is clear)' },
    { name: 'Remote', type: 'BOOL', address: '%IX0.6', comment: 'Remote control button (NO)' },
    { name: 'Motor_Up', type: 'BOOL', address: '%QX0.0', comment: 'Door motor: open' },
    { name: 'Motor_Down', type: 'BOOL', address: '%QX0.1', comment: 'Door motor: close' },
    { name: 'Warning_Light', type: 'BOOL', address: '%QX0.2', comment: 'Flashing warning lamp' },
    { name: 'Courtesy_Light', type: 'BOOL', address: '%QX0.3', comment: 'Garage ceiling light' }
  ];

  const TRAVEL = 8;                      // s for a full stroke
  const STALL = 1.5;                     // s against an end stop before the warning
  // door opening in the wall (px)
  const OX = 112, OW = 240, OT = 150, OB = 360, OH = OB - OT, CX = OX + OW / 2;
  const STRIP = 14;                      // bottom section still visible when fully open
  const RUN = OH - STRIP;                // travel of the bottom edge
  const CAR_H = 80;
  const CAR_POS = CAR_H / RUN;           // door position where the bottom edge touches the car roof
  const BEAM_Y = 326;

  PLC.scenes.register({
    id: 'garage',
    name: 'Garage Door',
    description: 'An automatic sectional door: up/down motor, limit switches, a safety light barrier, a wall panel and a hand-held remote.',
    width: 640, height: 420,
    tags,
    create() {
      const st = {};
      function reset(phys) {
        st.pos = 0; st.move = 0; st.gear = 0;
        st.stall = 0; st.endWarn = 0; st.both = false; st.bothT = 0;
        st.car = false; st.hit = false; st.note = 0;
        st.open = false; st.close = false; st.stop = false; st.remote = false;
        if (phys) {
          phys.I[0] = false; phys.I[1] = false; phys.I[2] = true;
          phys.I[3] = false; phys.I[4] = true; phys.I[5] = true; phys.I[6] = false;
        }
      }
      reset(null);
      return {
        reset,
        step(dt, phys) {
          const s = dt / 1000;
          const up = !!phys.Q[0], down = !!phys.Q[1];
          st.both = up && down;
          st.bothT = st.both ? 2 : Math.max(0, st.bothT - s);
          const v = st.both ? 0 : up ? 1 : down ? -1 : 0;
          st.move = 0;
          let pushing = false;
          if (v > 0) {
            if (st.pos >= 1) pushing = true;
            else { st.pos = Math.min(1, st.pos + s / TRAVEL); st.move = 1; }
          } else if (v < 0) {
            const floor = st.car ? CAR_POS : 0;
            if (st.pos <= floor) { if (st.car) st.hit = true; else pushing = true; }
            else {
              st.pos = Math.max(floor, st.pos - s / TRAVEL); st.move = -1;
              if (st.car && st.pos <= floor) st.hit = true;
            }
          }
          st.stall = pushing ? st.stall + s : 0;
          st.endWarn = st.stall > STALL ? 1.5 : Math.max(0, st.endWarn - s);
          st.gear += st.move * s * 7;
          st.note = Math.max(0, st.note - s);
          phys.I[3] = st.pos >= 1;
          phys.I[4] = st.pos <= 0;
          phys.I[5] = !st.car;
        },
        info() { return { pos: st.pos, car: st.car, hit: st.hit, both: st.both, endWarn: st.endWarn > 0 }; },
        draw(g, phys) {
          const W = g.W, c = g.c;
          const lit = !!phys.Q[3];

          // ---- garage front
          g.plate(12, 50, 440, 358, 'Garage');
          facade(g);
          interior(g, lit, st.pos);
          door(g, st.pos);
          if (st.car) carRear(g, CX, OB);
          frame(g);
          // light barrier: TX left jamb, RX right jamb
          const carL = CX - 75;
          if (st.car) {
            g.line(OX - 2, BEAM_Y, carL, BEAM_Y, 'rgba(255,60,40,0.85)', 1.5, [4, 3]);
            g.circle(carL, BEAM_Y, 2.5, '#ff4a3d');
          }
          g.photoEye({ x1: OX - 5, y1: BEAM_Y, x2: OX + OW + 5, y2: BEAM_Y, blocked: st.car, signal: phys.I[5] });
          g.label('Light barrier', 404, BEAM_Y - 8);
          g.addr('%IX0.5', 404, BEAM_Y + 6, { active: phys.I[5] });
          // limit switches on the left jamb
          limitSwitch(g, OX - 5, OT + STRIP + 2, phys.I[3]);
          g.label('Limit open', 58, OT + STRIP - 6);
          g.addr('%IX0.3', 58, OT + STRIP + 8, { active: phys.I[3] });
          limitSwitch(g, OX - 5, OB - 8, phys.I[4]);
          g.label('Limit closed', 58, OB - 22);
          g.addr('%IX0.4', 58, OB - 8, { active: phys.I[4] });
          // motor unit and warning beacon above the door
          motorUnit(g, st, phys);
          beacon(g, 400, 96, !!phys.Q[2]);
          g.label('Warning lamp', 400, 124);
          g.addr('%QX0.2', 400, 138, { active: phys.Q[2] });
          // window into the garage shows the ceiling light
          garageWindow(g, 374, 168, 52, 44, lit);
          g.label('Ceiling light', 400, 226);
          g.addr('%QX0.3', 400, 240, { active: lit });
          // scene controls
          g.button({
            x: 24, y: 378, text: 'Car in doorway', active: st.car, small: true,
            onClick: () => {
              if (st.car) st.car = false;
              else if (st.pos >= CAR_POS) st.car = true;
              else st.note = 2.5;
            }
          });
          let bx = 150;
          if (st.hit) bx += 8 + g.button({ x: bx, y: 378, text: 'Clear', small: true, onClick: () => { st.hit = false; } });
          if (st.note > 0) g.text('Open the door first.', bx, 390.5, { align: 'left', size: 11, color: c.ink2 });
          g.text('Door ' + Math.round(st.pos * 100) + ' % open', 440, 390.5, { align: 'right', size: 11, font: 'mono', color: c.ink2 });

          // ---- wall panel
          g.plate(464, 50, 164, 212, 'Wall panel');
          g.pushButton({ x: 505, y: 108, color: 'green', label: 'Open', addr: '%IX0.0', nc: false, pressed: st.open, signal: phys.I[0], onPress: v => { st.open = v; phys.I[0] = v; } });
          glyph(g, 505, 108, 'up', st.open);
          g.pushButton({ x: 587, y: 108, color: 'blue', label: 'Close', addr: '%IX0.1', nc: false, pressed: st.close, signal: phys.I[1], onPress: v => { st.close = v; phys.I[1] = v; } });
          glyph(g, 587, 108, 'down', st.close);
          g.pushButton({ x: 546, y: 200, color: 'red', label: 'Stop', addr: '%IX0.2', nc: true, pressed: st.stop, signal: phys.I[2], onPress: v => { st.stop = v; phys.I[2] = !v; } });
          glyph(g, 546, 200, 'stop', st.stop);

          // ---- hand-held remote
          g.plate(464, 272, 164, 136, 'Hand-held remote');
          remoteFob(g, 506, 344, st.remote);
          g.pushButton({ x: 506, y: 334, r: 12, color: 'black', pressed: st.remote, signal: phys.I[6], onPress: v => { st.remote = v; phys.I[6] = v; } });
          g.hits[g.hits.length - 1].label = 'Remote';
          glyph(g, 506, 334, 'updown', st.remote);
          g.label('Remote', 580, 330);
          g.addr('%IX0.6', 580, 344, { active: phys.I[6] });
          g.text('NO', 580, 360, { font: 'mono', size: 8.5, color: c.ink3 });

          if (st.bothT > 0) g.banner('Motor_Up and Motor_Down are on together! Interlock them.', 'fault', W);
          else if (st.hit) g.banner('The door hit the car! Reverse when the light barrier is interrupted.', 'fault', W);
          else if (st.endWarn > 0) g.banner('The motor is pushing against the end stop. Stop it at the limit switch.', 'warn', W);
          else g.text('Use the wall panel or the remote. Stop is wired NC, so its input is TRUE until pressed.', W / 2, 26, { size: 11.5, color: c.ink2 });
        }
      };
    }
  });

  // ---- drawing helpers ---------------------------------------------------------
  function facade(g) {
    const ctx = g.ctx, dark = g.c.dark;
    ctx.save();
    g.roundRect(20, 72, 424, 288, 4);
    ctx.clip();
    ctx.fillStyle = dark ? '#30393d' : '#d9d3c7';
    ctx.fillRect(20, 72, 424, 288);
    // brick courses
    const mortar = dark ? '#283034' : '#cbc3b4';
    for (let y = 72, row = 0; y < 360; y += 12, row++) {
      g.line(20, y, 444, y, mortar, 1);
      for (let x = 20 + (row % 2 ? 0 : 18); x < 444; x += 36) g.line(x, y, x, y + 12, mortar, 1);
    }
    ctx.restore();
    // pavement in front of the garage
    g.roundRect(20, OB, 424, 12, 2, dark ? '#20282b' : '#b7bfc2', null);
    g.line(20, OB, 444, OB, dark ? '#4d5a60' : '#8d999e', 1.5);
  }

  function interior(g, lit, pos) {
    if (pos <= 0) return;
    const ctx = g.ctx, dark = g.c.dark;
    const P = lit
      ? (dark ? ['#6f6550', '#5f5644', '#575040', '#4b463b'] : ['#f1e7cc', '#e2d6b6', '#d8cba8', '#bdb4a0'])
      : (dark ? ['#1b2124', '#171c1f', '#14181a', '#111517'] : ['#4b5459', '#41494d', '#3a4145', '#33393c']);
    const bx1 = OX + 44, bx2 = OX + OW - 44, by1 = OT + 26, by2 = OB - 46;
    ctx.save();
    ctx.beginPath(); ctx.rect(OX, OT, OW, OH); ctx.clip();
    const poly = (pts, col) => {
      ctx.beginPath();
      pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
      ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    };
    poly([[OX, OT], [OX + OW, OT], [bx2, by1], [bx1, by1]], P[2]);
    poly([[OX, OT], [bx1, by1], [bx1, by2], [OX, OB]], P[1]);
    poly([[OX + OW, OT], [bx2, by1], [bx2, by2], [OX + OW, OB]], P[1]);
    poly([[OX, OB], [bx1, by2], [bx2, by2], [OX + OW, OB]], P[3]);
    ctx.fillStyle = P[0]; ctx.fillRect(bx1, by1, bx2 - bx1, by2 - by1);
    // shelf with boxes on the back wall
    const sh = lit ? (dark ? '#8a7d60' : '#a7956c') : (dark ? '#262d31' : '#555e63');
    g.line(bx1 + 8, by2 - 30, bx1 + 62, by2 - 30, sh, 3);
    g.roundRect(bx1 + 12, by2 - 46, 18, 16, 1, sh, null);
    g.roundRect(bx1 + 34, by2 - 40, 22, 10, 1, sh, null);
    // ceiling light
    const lx = CX, ly = OT + 20;
    if (lit) {
      const glow = ctx.createRadialGradient(lx, ly, 4, lx, ly + 30, 120);
      glow.addColorStop(0, 'rgba(255,244,200,0.75)');
      glow.addColorStop(1, 'rgba(255,244,200,0)');
      ctx.fillStyle = glow; ctx.fillRect(OX, OT, OW, OH);
    }
    g.roundRect(lx - 28, ly - 3, 56, 7, 3, lit ? '#fffbe8' : (dark ? '#3a4246' : '#6f7a7f'), dark ? '#11161a' : '#2a3135', 1);
    ctx.restore();
  }

  function door(g, pos) {
    const ctx = g.ctx, dark = g.c.dark;
    const bottom = OB - pos * RUN;
    const face = dark ? '#7a868c' : '#eef1f2', panel = dark ? '#6d797f' : '#dde3e5';
    const groove = dark ? '#4c575c' : '#a9b4b8', hi = dark ? '#8d999f' : '#ffffff';
    const SEC = OH / 5;
    ctx.save();
    ctx.beginPath(); ctx.rect(OX, OT, OW, bottom - OT); ctx.clip();
    for (let k = 0; k < 5; k++) {
      const y1 = bottom - (k + 1) * SEC;
      if (y1 + SEC < OT) break;
      ctx.fillStyle = face; ctx.fillRect(OX, y1, OW, SEC);
      // four recessed cassettes per section
      const m = 10, gap = 8, w = (OW - 2 * m - 3 * gap) / 4;
      for (let i = 0; i < 4; i++) {
        const x = OX + m + i * (w + gap);
        g.roundRect(x, y1 + 7, w, SEC - 14, 2, panel, groove, 1);
        g.line(x + 1, y1 + SEC - 7.5, x + w - 1, y1 + SEC - 7.5, hi, 1);
      }
      g.line(OX, y1 + 0.5, OX + OW, y1 + 0.5, groove, 2);
    }
    // bottom seal and handle
    ctx.fillStyle = '#23292c'; ctx.fillRect(OX, bottom - 4, OW, 4);
    g.roundRect(CX - 18, bottom - SEC / 2 - 3, 36, 6, 3, dark ? '#3b4448' : '#7d898e', null);
    ctx.restore();
    // shadow under the door edge
    if (bottom < OB - 1) g.line(OX, bottom + 1, OX + OW, bottom + 1, 'rgba(0,0,0,0.25)', 2);
  }

  function frame(g) {
    const col = g.c.dark ? '#4b575d' : '#9aa6ab', edge = g.c.dark ? '#5f6d73' : '#7f8b90';
    g.roundRect(OX - 10, OT - 10, OW + 20, 10, 1, col, null);
    g.roundRect(OX - 10, OT, 10, OH, 0, col, null);
    g.roundRect(OX + OW, OT, 10, OH, 0, col, null);
    g.line(OX, OT, OX + OW, OT, edge, 1);
    g.line(OX, OT, OX, OB, edge, 1);
    g.line(OX + OW, OT, OX + OW, OB, edge, 1);
  }

  /** Roller-lever limit switch on the jamb; the lever points into the door track. */
  function limitSwitch(g, x, y, active) {
    const a = active ? -0.55 : 0.35;
    const ex = x + 10 + Math.cos(a) * 13, ey = y + Math.sin(a) * 13;
    g.line(x + 6, y, ex, ey, '#4a555a', 2.5);
    g.circle(ex, ey, 3.2, '#c9cfd2', '#4a555a', 1.2);
    g.roundRect(x - 9, y - 9, 16, 18, 2, g.c.dark ? '#d0a72b' : '#e2b62d', '#6b5410', 1);
    g.led(x - 1, y - 2, !!active, 'green', 3);
  }

  function motorUnit(g, st, phys) {
    const x = CX, y = 106, fault = st.bothT > 0;
    const run = st.move !== 0;
    g.label('Door motor', x, 80);
    g.roundRect(x - 46, y - 17, 92, 34, 5, g.c.dark ? '#3b464b' : '#5c6a70', fault ? g.c.fault : run ? g.c.power : '#20282c', fault || run ? 2.5 : 1.5);
    // gear wheel
    const ctx = g.ctx;
    ctx.save();
    ctx.translate(x - 26, y); ctx.rotate(st.gear);
    for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); g.roundRect(-2, -11, 4, 5, 1, '#c3ccd0', null); }
    ctx.restore();
    g.circle(x - 26, y, 8, '#c3ccd0', '#7f8b90', 1);
    g.text('M', x - 26, y + 0.5, { size: 10, weight: 700, font: 'ui', color: '#2a3135' });
    // direction arrow
    if (run) {
      const col = g.c.dark ? '#35d07a' : '#2fe07a';
      const k = st.move > 0 ? -1 : 1, ax = x + 16;
      const ph = ((g.t / 600) % 1) * 4 * k;
      arrow(g, ax, y + ph, k, col);
    } else {
      g.text(fault ? '!' : 'OFF', x + 16, y + 0.5, { size: fault ? 16 : 10, font: fault ? 'ui' : 'mono', weight: 700, color: fault ? '#ff6a5e' : '#aab5b9' });
    }
    g.text('UP', x - 80, y - 9, { size: 9.5, weight: 700, color: g.c.ink2, letterSpacing: 0.6 });
    g.addr('%QX0.0', x - 80, y + 6, { active: phys.Q[0] });
    g.text('DOWN', x + 80, y - 9, { size: 9.5, weight: 700, color: g.c.ink2, letterSpacing: 0.6 });
    g.addr('%QX0.1', x + 80, y + 6, { active: phys.Q[1] });
  }

  /** Vertical arrow, k = -1 points up, +1 points down. */
  function arrow(g, x, y, k, col) {
    const ctx = g.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y + 10 * k);
    ctx.lineTo(x - 8, y + 1 * k);
    ctx.lineTo(x - 3, y + 1 * k);
    ctx.lineTo(x - 3, y - 9 * k);
    ctx.lineTo(x + 3, y - 9 * k);
    ctx.lineTo(x + 3, y + 1 * k);
    ctx.lineTo(x + 8, y + 1 * k);
    ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    ctx.restore();
  }

  /** Rotating amber beacon on a wall bracket. */
  function beacon(g, x, y, on) {
    const ctx = g.ctx, s = g.SIGNAL.amber;
    const ph = g.t / 1000 * Math.PI * 2 * 1.4;
    const b = on ? Math.pow((1 + Math.cos(ph)) / 2, 2) : 0;
    if (on) {
      const glow = ctx.createRadialGradient(x, y - 4, 4, x, y - 4, 40);
      glow.addColorStop(0, K.hexA(s.on, 0.25 + 0.55 * b));
      glow.addColorStop(1, K.hexA(s.on, 0));
      g.circle(x, y - 4, 40, glow);
    }
    g.roundRect(x - 15, y + 6, 30, 7, 2, '#2a3135', null);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - 11, y + 6);
    ctx.lineTo(x - 11, y - 6);
    ctx.arc(x, y - 6, 11, Math.PI, 0);
    ctx.lineTo(x + 11, y + 6);
    ctx.closePath();
    const grad = ctx.createLinearGradient(x - 11, 0, x + 11, 0);
    if (on) {
      const hx = 0.5 + 0.45 * Math.sin(ph);
      grad.addColorStop(0, s.cap);
      grad.addColorStop(Math.max(0, hx - 0.25), s.cap);
      grad.addColorStop(hx, b > 0.2 ? '#fff4c2' : s.on);
      grad.addColorStop(Math.min(1, hx + 0.25), s.cap);
      grad.addColorStop(1, s.cap);
    } else {
      grad.addColorStop(0, K.shade(s.off, 0.25)); grad.addColorStop(0.5, K.shade(s.off, 0.45)); grad.addColorStop(1, s.off);
    }
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = '#3a2a08'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }

  function garageWindow(g, x, y, w, h, lit) {
    const ctx = g.ctx, dark = g.c.dark;
    g.roundRect(x - 4, y - 4, w + 8, h + 8, 2, dark ? '#4b575d' : '#9aa6ab', null);
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    if (lit) { grad.addColorStop(0, '#fff3c4'); grad.addColorStop(1, '#f2cf6b'); }
    else { grad.addColorStop(0, dark ? '#24323a' : '#5b6f7a'); grad.addColorStop(1, dark ? '#141c21' : '#3c4c55'); }
    ctx.fillStyle = grad; ctx.fillRect(x, y, w, h);
    if (lit) {
      const glow = ctx.createRadialGradient(x + w / 2, y + h / 2, 10, x + w / 2, y + h / 2, 46);
      glow.addColorStop(0, 'rgba(255,226,140,0.35)'); glow.addColorStop(1, 'rgba(255,226,140,0)');
      ctx.fillStyle = glow; ctx.fillRect(x - 30, y - 30, w + 60, h + 60);
    }
    g.line(x + w / 2, y, x + w / 2, y + h, dark ? '#4b575d' : '#9aa6ab', 3);
    g.line(x, y + h / 2, x + w, y + h / 2, dark ? '#4b575d' : '#9aa6ab', 3);
    g.line(x + 4, y + h / 2 - 4, x + w / 2 - 6, y + 4, 'rgba(255,255,255,0.35)', 1.5);
  }

  /** Rear view of a parked hatchback, standing on groundY. */
  function carRear(g, cx, gy) {
    const ctx = g.ctx;
    const body = '#2f6db5', bodyD = '#1f4f88';
    g.roundRect(cx - 64, gy - 16, 24, 16, 3, '#16191b', null);
    g.roundRect(cx + 40, gy - 16, 24, 16, 3, '#16191b', null);
    // cabin
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - 64, gy - 46);
    ctx.lineTo(cx - 50, gy - CAR_H + 4);
    ctx.quadraticCurveTo(cx - 48, gy - CAR_H, cx - 42, gy - CAR_H);
    ctx.lineTo(cx + 42, gy - CAR_H);
    ctx.quadraticCurveTo(cx + 48, gy - CAR_H, cx + 50, gy - CAR_H + 4);
    ctx.lineTo(cx + 64, gy - 46);
    ctx.closePath();
    ctx.fillStyle = bodyD; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 56, gy - 49);
    ctx.lineTo(cx - 45, gy - CAR_H + 6);
    ctx.lineTo(cx + 45, gy - CAR_H + 6);
    ctx.lineTo(cx + 56, gy - 49);
    ctx.closePath();
    const glass = ctx.createLinearGradient(0, gy - CAR_H, 0, gy - 48);
    glass.addColorStop(0, '#5b6f7a'); glass.addColorStop(1, '#22313a');
    ctx.fillStyle = glass; ctx.fill();
    ctx.restore();
    // body
    g.roundRect(cx - 75, gy - 50, 150, 40, 8, body, bodyD, 1);
    g.roundRect(cx - 70, gy - 44, 22, 10, 2, '#d0342c', '#7a1a14', 1);
    g.roundRect(cx + 48, gy - 44, 22, 10, 2, '#d0342c', '#7a1a14', 1);
    g.roundRect(cx - 22, gy - 34, 44, 13, 2, '#f4f4ee', '#2a2a2a', 1);
    g.text('PLC 01', cx, gy - 27, { font: 'mono', size: 8.5, color: '#222', weight: 700 });
    g.roundRect(cx - 76, gy - 16, 152, 7, 3, '#2a2f33', null);
  }

  function remoteFob(g, x, y, pressed) {
    const ctx = g.ctx;
    const grad = ctx.createLinearGradient(x - 24, 0, x + 24, 0);
    grad.addColorStop(0, '#3b4246'); grad.addColorStop(0.5, '#2a3034'); grad.addColorStop(1, '#1d2225');
    g.roundRect(x - 24, y - 52, 48, 96, 20, grad, '#0d1012', 1.2);
    g.led(x, y - 38, pressed, 'red', 2.5);
    g.circle(x, y + 30, 5, g.c.plate, '#0d1012', 1);
  }

  /** Symbol printed on a button cap. */
  function glyph(g, x, y, kind, pressed) {
    const ctx = g.ctx, col = 'rgba(255,255,255,0.9)';
    const s = pressed ? 0.85 : 1;
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = col;
    const tri = (k, dy) => { ctx.beginPath(); ctx.moveTo(0, dy - 5 * k); ctx.lineTo(6, dy + 4 * k); ctx.lineTo(-6, dy + 4 * k); ctx.closePath(); ctx.fill(); };
    if (kind === 'up') tri(1, 0);
    else if (kind === 'down') tri(-1, 0);
    else if (kind === 'updown') { ctx.scale(0.7, 0.7); tri(1, -6); tri(-1, 6); }
    else ctx.fillRect(-5, -5, 10, 10);
    ctx.restore();
  }
})(window.PLC = window.PLC || {});
