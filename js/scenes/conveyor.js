/* LadderLab scene: sorting conveyor — photo-eyes, a height sensor and a pneumatic pusher sort tall boxes off the belt. */
(function (PLC) {
  'use strict';

  const tags = [
    { name: 'Start', type: 'BOOL', address: '%IX0.0', comment: 'Start push button (NO)' },
    { name: 'Stop', type: 'BOOL', address: '%IX0.1', comment: 'Stop push button (NC: TRUE when not pressed)' },
    { name: 'Sensor_Entry', type: 'BOOL', address: '%IX0.2', comment: 'Photo-eye at the start of the belt (TRUE while a box blocks the beam)' },
    { name: 'Sensor_Tall', type: 'BOOL', address: '%IX0.3', comment: 'Height sensor in front of the pusher (TRUE while a tall box is under it)' },
    { name: 'Sensor_Exit', type: 'BOOL', address: '%IX0.4', comment: 'Photo-eye at the end of the belt (TRUE while a box blocks the beam)' },
    { name: 'Pusher_Home', type: 'BOOL', address: '%IX0.5', comment: 'Pusher retracted (reed switch)' },
    { name: 'Pusher_Out', type: 'BOOL', address: '%IX0.6', comment: 'Pusher fully extended (reed switch)' },
    { name: 'Conveyor', type: 'BOOL', address: '%QX0.0', comment: 'Belt motor' },
    { name: 'Pusher', type: 'BOOL', address: '%QX0.1', comment: 'Pusher cylinder solenoid (TRUE = extend)' },
    { name: 'Feeder', type: 'BOOL', address: '%QX0.2', comment: 'Box feeder: each rising edge drops a new box' },
    { name: 'Lamp_Run', type: 'BOOL', address: '%QX0.3', comment: 'Running lamp' },
    { name: 'Count_Display', type: 'INT', address: '%QW0', comment: 'Counter display' }
  ];

  // Oblique side view: u runs along the belt, v into the picture (depth), h up.
  const X0 = 56, Y0 = 184, KX = 0.45, KY = 0.35;
  const L = 440, D = 56;                                // belt length and depth
  const BW = 30, BD = 30, VB = 13;                      // box length, depth, depth position on the belt
  const H = { small: 22, tall: 40 };
  const SPEED = 70, GRAV = 900;
  const ENTRY_U = 66, PU = 264, HW = 22, TALL_U = PU - HW - 8, EXIT_U = L - 24;
  const BEAM_LOW = 9, BEAM_TALL = 31;
  const V_HOME = 66, HEAD_T = 6, PUSH_H = 16;           // pusher head travels from v = V_HOME to v = 0
  const CYL_LEN = 47, CAP_V = V_HOME + HEAD_T + CYL_LEN / Math.hypot(KX, KY);
  const STROKE_T = 0.4;
  const BINS = {
    tall: { u0: PU - 34, u1: PU + 34, v0: -66, v1: -10, rim: -32, floor: -72, name: 'TALL' },
    small: { u0: L + 8, u1: L + 74, v0: -2, v1: D + 2, rim: -26, floor: -74, name: 'SMALL' }
  };
  const P = (u, v, h) => [X0 + u + v * KX, Y0 - h - v * KY];
  const headV = ext => V_HOME * (1 - ext);

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  PLC.scenes.register({
    id: 'conveyor',
    name: 'Conveyor Sorting',
    description: 'Boxes ride a belt past photo-eyes and a height sensor. Time the pneumatic pusher so tall boxes land in the TALL bin and small ones run on to the SMALL bin.',
    width: 640, height: 440,
    tags,
    create() {
      const st = {};
      const onBelt = b => b.state === 'belt' || b.state === 'pushed';
      const blocks = (b, u, h) => onBelt(b) && b.u <= u && u <= b.u + BW && H[b.type] > h;
      function entryBusy() { return st.boxes.some(b => b.state !== 'fall' && b.u < 4 + BW + 12); }
      function drop(type) {
        if (entryBusy()) return false;
        st.boxes.push({ id: ++st.nextId, type: type === 'tall' ? 'tall' : 'small', u: 4, v: VB, h: 46, vz: 0, state: 'drop' });
        return true;
      }
      const randomType = () => (st.rand() < 0.45 ? 'tall' : 'small');
      function sense(phys) {
        phys.I[2] = st.boxes.some(b => blocks(b, ENTRY_U, BEAM_LOW));
        phys.I[3] = st.boxes.some(b => blocks(b, TALL_U, BEAM_TALL));
        phys.I[4] = st.boxes.some(b => blocks(b, EXIT_U, BEAM_LOW));
        phys.I[5] = st.ext <= 0.02;
        phys.I[6] = st.ext >= 0.98;
      }
      function reset(phys) {
        st.rand = rng(20240611);
        st.boxes = []; st.nextId = 0;
        st.ext = 0; st.travel = 0; st.feedPrev = false;
        st.auto = false; st.autoT = 1;
        st.jamT = 0; st.start = false; st.stop = false;
        st.bins = { tall: { ok: 0, bad: 0, items: [] }, small: { ok: 0, bad: 0, items: [] } };
        if (phys) { phys.I[0] = false; phys.I[1] = true; sense(phys); }
      }
      function startFall(b, bin, vu, vv) { b.state = 'fall'; b.bin = bin; b.vu = vu; b.vv = vv; b.vz = 0; }
      function land(b) {
        const bin = st.bins[b.bin];
        if ((b.bin === 'tall') === (b.type === 'tall')) bin.ok++; else bin.bad++;
        bin.items.push(b.type);
        if (bin.items.length > 3) bin.items.shift();
        b.state = 'gone';
      }
      reset(null);

      return {
        reset,
        state: st,
        drop,
        step(dt, phys) {
          const s = dt / 1000;
          const running = !!phys.Q[0];
          // feeder: rising edge drops a box
          if (phys.Q[2] && !st.feedPrev) drop(randomType());
          st.feedPrev = !!phys.Q[2];
          if (st.auto && running) {
            st.autoT -= s;
            if (st.autoT <= 0) st.autoT = drop(randomType()) ? 3.5 + st.rand() : 0;
          }

          // pusher
          const prevExt = st.ext;
          let ext = prevExt;
          if (phys.Q[1]) ext = Math.min(1, ext + s / STROKE_T); else ext = Math.max(0, ext - s / STROKE_T);
          if (ext > prevExt) {
            const vNow = headV(prevExt);
            for (const b of st.boxes) {
              if (b.state !== 'belt') continue;
              const back = b.v + BD;
              if (vNow < back - 0.01 || headV(ext) >= back) continue;     // head does not reach this box now
              const overlap = Math.min(b.u + BW, PU + HW) - Math.max(b.u, PU - HW);
              if (overlap <= 0) continue;
              if (overlap >= 0.6 * BW) b.state = 'pushed';
              else { ext = Math.min(ext, 1 - back / V_HOME); st.jamT = 2.5; } // hits the box edge and stalls
            }
          }
          st.ext = ext;
          const vh = headV(ext);
          for (const b of st.boxes) {
            if (b.state !== 'pushed') continue;
            if (vh > b.v + BD + 0.01) { b.state = 'belt'; continue; }       // pusher went back: box stays where it is
            b.v = vh - BD;
            if (b.v + BD / 2 < 0) startFall(b, 'tall', 0, -40);
          }
          st.jamT = Math.max(0, st.jamT - s);

          // belt transport, front box first; boxes queue behind each other and behind an extended pusher
          if (running) st.travel += SPEED * s;
          const line = st.boxes.filter(b => onBelt(b) || b.state === 'drop').sort((a, b) => b.u - a.u);
          for (let i = 0; i < line.length; i++) {
            const b = line[i];
            if (b.state === 'drop') {
              b.vz -= GRAV * s; b.h = Math.max(0, b.h + b.vz * s);
              if (b.h === 0) { b.state = 'belt'; b.vz = 0; }
              continue;
            }
            if (b.state !== 'belt' || !running) continue;
            let maxU = Infinity;
            if (i > 0) maxU = line[i - 1].u - BW - 2;
            if (b.u + BW <= PU - HW + 0.01 && b.v + BD > vh + 0.01) maxU = Math.min(maxU, PU - HW - BW - 0.5);
            b.u = Math.max(b.u, Math.min(b.u + SPEED * s, maxU));
            if (b.u + BW / 2 > L) startFall(b, 'small', SPEED * 0.8, 0);
          }

          // falling boxes
          for (const b of st.boxes) {
            if (b.state !== 'fall') continue;
            const bin = BINS[b.bin];
            b.vz -= GRAV * s;
            b.h += b.vz * s;
            b.u = Math.min(Math.max(b.u + b.vu * s, bin.u0 + 3), bin.u1 - BW - 3);
            b.v = Math.min(Math.max(b.v + b.vv * s, bin.v0 + 3), bin.v1 - BD - 3);
            if (b.h <= bin.floor + 2) land(b);
          }
          st.boxes = st.boxes.filter(b => b.state !== 'gone');
          sense(phys);
        },
        draw(g, phys) {
          const W = g.W, c = g.c;
          const running = !!phys.Q[0];
          g.plate(12, 50, 616, 268);
          g.plate(12, 326, 616, 102, 'Operator panel');

          // behind the belt: photo-eye emitters, belt motor, legs
          const eyes = [
            { u: ENTRY_U, h: BEAM_LOW, sig: phys.I[2], label: 'Entry eye', addr: '%IX0.2' },
            { u: TALL_U, h: BEAM_TALL, sig: phys.I[3], label: 'Height eye', addr: '%IX0.3' },
            { u: EXIT_U, h: BEAM_LOW, sig: phys.I[4], label: 'Exit eye', addr: '%IX0.4' }
          ];
          for (const e of eyes) eyeBack(g, e);
          const [fpx, fpy] = P(4, 52, 54), [fqx, fqy] = P(4, 52, -15);
          g.line(fpx, fpy, fqx, fqy, c.steel, 3);                          // feeder support behind the belt
          legs(g);
          beltMotor(g, running, st.travel);
          belt(g, st.travel);

          // pusher and boxes, back to front
          const items = [{ key: headV(st.ext) + HEAD_T / 2, draw: () => pusher(g, st.ext) }];
          for (const b of st.boxes) if (b.state !== 'fall') items.push({ key: b.v + BD / 2, draw: () => box3d(g, b) });
          items.sort((a, b) => b.key - a.key).forEach(it => it.draw());

          for (const e of eyes) eyeFront(g, e, st.boxes.some(b => blocks(b, e.u, e.h)));
          feeder(g, !!phys.Q[2]);

          // bins with falling boxes
          bin(g, 'tall', st);
          bin(g, 'small', st);

          // labels row
          for (const e of eyes) {
            const [tx, ty] = P(e.u, D + 8, e.h);
            g.label(e.label, tx, 78);
            g.addr(e.addr, tx, 92, { active: e.sig });
            g.line(tx, 100, tx, ty - 9, c.ink3, 1, [2, 3]);
          }
          const [fx] = P(20, 28, 0);
          g.label('Feeder', fx, 78);
          g.addr('%QX0.2', fx, 92, { active: phys.Q[2] });
          const cap = P(PU, CAP_V, PUSH_H);
          g.label('Pusher', cap[0], 78);
          g.addr('%QX0.1', cap[0], 92, { active: phys.Q[1] });
          g.line(cap[0], 100, cap[0], cap[1] - 10, c.ink3, 1, [2, 3]);
          reeds(g, phys);
          const [mx] = P(26, 0, 0);
          g.label('Belt motor', mx, 254);
          g.addr('%QX0.0', mx, 268, { active: running });

          // operator panel
          g.pushButton({ x: 60, y: 368, r: 15, color: 'green', label: 'Start', addr: '%IX0.0', nc: false, pressed: st.start, signal: phys.I[0], onPress: v => { st.start = v; phys.I[0] = v; } });
          g.pushButton({ x: 136, y: 368, r: 15, color: 'red', label: 'Stop', addr: '%IX0.1', nc: true, pressed: st.stop, signal: phys.I[1], onPress: v => { st.stop = v; phys.I[1] = !v; } });
          g.lamp({ x: 210, y: 368, r: 12, color: 'green', on: phys.Q[3], label: 'Running', addr: '%QX0.3' });
          g.display({ x: 304, y: 366, value: phys.QW[0], digits: 4, size: 22, label: 'Count', addr: '%QW0' });
          g.line(372, 340, 372, 418, c.line, 1);
          g.text('FEED BOXES BY HAND', 388, 345, { align: 'left', size: 10, weight: 700, color: c.ink3, letterSpacing: 0.6 });
          const w1 = g.button({ x: 388, y: 358, text: 'Small box', small: true, onClick: () => drop('small') });
          g.button({ x: 396 + w1, y: 358, text: 'Tall box', small: true, onClick: () => drop('tall') });
          const w3 = g.button({ x: 388, y: 392, text: st.auto ? 'Auto feed: on' : 'Auto feed: off', small: true, active: st.auto, onClick: () => { st.auto = !st.auto; st.autoT = 0.5; } });
          g.text('a box every ~4 s', 396 + w3, 398, { align: 'left', size: 9.5, color: c.ink3 });
          g.text('while the belt runs', 396 + w3, 410, { align: 'left', size: 9.5, color: c.ink3 });

          if (st.jamT > 0) g.banner('Pusher hit a box edge. Wait until the box is in front of the pusher.', 'warn', W);
          else g.text('Start the belt, then drop boxes. Push the tall ones into the TALL bin, let small ones run to the end.', W / 2, 26, { size: 11.5, color: c.ink2 });
        }
      };
    }
  });

  // ---- drawing helpers (oblique projection) --------------------------------------
  function poly(g, pts, fill, stroke, lw) {
    const ctx = g.ctx;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.lineJoin = 'round'; ctx.stroke(); }
  }
  const shade = (col, a) => PLC.scenes.shade(col, a);

  function belt(g, travel) {
    const c = g.c;
    const top = c.dark ? '#14191b' : '#454d52', rib = c.dark ? '#343c41' : '#5d676c';
    const frame = c.dark ? '#5c6a70' : '#8d999e';
    // back frame lip, belt surface with moving ribs, front frame
    poly(g, [P(-6, D, 0), P(L + 6, D, 0), P(L + 6, D + 4, 0), P(-6, D + 4, 0)], shade(frame, -0.15));
    poly(g, [P(0, 0, 0), P(L, 0, 0), P(L, D, 0), P(0, D, 0)], top);
    const ctx = g.ctx;
    ctx.save();
    poly(g, [P(0, 0, 0), P(L, 0, 0), P(L, D, 0), P(0, D, 0)]);
    ctx.clip();
    const step = 16, off = ((travel % step) + step) % step;
    for (let u = off - step; u < L + step; u += step) {
      const a = P(u, 0, 0), b = P(u, D, 0);
      g.line(a[0], a[1], b[0], b[1], rib, 2);
    }
    ctx.restore();
    // front face: belt edge and side frame
    g.roundRect(X0 - 7, Y0 - 1, L + 14, 9, 4.5, c.dark ? '#22282b' : '#30373b');
    g.roundRect(X0 - 4, Y0 + 7, L + 8, 8, 2, frame, shade(frame, -0.3), 1);
    for (const u of [0, L]) {
      g.circle(X0 + u, Y0 + 3.5, 6, '#9aa5aa', '#2a2f33', 1);
      const a = travel / 6;
      g.line(X0 + u, Y0 + 3.5, X0 + u + Math.cos(a) * 5, Y0 + 3.5 + Math.sin(a) * 5, '#2a2f33', 1.5);
    }
  }

  function legs(g) {
    const col = g.c.steel;
    for (const u of [70, 196, 340, 424]) {
      const [bx, by] = P(u, D, -15), [bx2, by2] = P(u, D, -78);
      g.line(bx, by, bx2, by2, shade(col, -0.2), 4);
      const [fx, fy] = P(u, 0, -15), [fx2, fy2] = P(u, 0, -78);
      g.line(fx, fy, fx2, fy2, col, 5);
      g.roundRect(fx2 - 6, fy2 - 1, 12, 4, 1, shade(col, -0.25));
    }
  }

  function beltMotor(g, running, travel) {
    const c = g.c;
    const [x, y] = P(26, -4, -36);
    g.line(X0, Y0 + 3.5, x, y, c.dark ? '#111' : '#2a2f33', 2.5);                  // drive belt to the tail roller
    g.roundRect(x - 20, y - 11, 40, 22, 4, c.dark ? '#46535a' : '#6f7f86', running ? c.power : (c.dark ? '#2b3439' : '#4c5a60'), running ? 2 : 1);
    for (let i = -2; i <= 2; i++) g.line(x - 14, y + i * 4, x + 12, y + i * 4, c.dark ? '#3a464c' : '#5f6e74', 1);
    g.circle(x, y, 5, '#c3ccd0', '#2a2f33', 1);
    const a = travel / 5;
    g.line(x, y, x + Math.cos(a) * 4, y + Math.sin(a) * 4, '#2a2f33', 1.5);
  }

  const BOX_COL = { small: '#d49a55', tall: '#a8743c' };
  function box3d(g, b, hOff) {
    const hb = H[b.type], h0 = (b.h || 0) + (hOff || 0), u = b.u, v = b.v;
    const col = BOX_COL[b.type], edge = shade(col, -0.45);
    poly(g, [P(u + BW, v, h0), P(u + BW, v + BD, h0), P(u + BW, v + BD, h0 + hb), P(u + BW, v, h0 + hb)], shade(col, -0.22), edge, 1);
    poly(g, [P(u, v, h0 + hb), P(u + BW, v, h0 + hb), P(u + BW, v + BD, h0 + hb), P(u, v + BD, h0 + hb)], shade(col, 0.18), edge, 1);
    poly(g, [P(u, v, h0), P(u + BW, v, h0), P(u + BW, v, h0 + hb), P(u, v, h0 + hb)], col, edge, 1);
    // tape across the lid and down the front
    const t0 = P(u + BW / 2, v, h0 + hb), t1 = P(u + BW / 2, v + BD, h0 + hb), t2 = P(u + BW / 2, v, h0 + hb - 7);
    g.line(t0[0], t0[1], t1[0], t1[1], shade(col, 0.4), 3);
    g.line(t0[0], t0[1], t2[0], t2[1], shade(col, 0.4), 3);
  }

  function pusher(g, ext) {
    const ctx = g.ctx, c = g.c;
    const vh = headV(ext);
    const cap = P(PU, CAP_V, PUSH_H);
    // bracket from the cylinder to the back frame
    const foot = P(PU, CAP_V - 8, -14);
    g.line(cap[0] - 6, cap[1] + 4, foot[0] - 6, foot[1], c.steel, 4);
    // cylinder (kit drawing, rotated onto the depth axis)
    const ang = Math.atan2(KY, -KX);
    ctx.save();
    ctx.translate(cap[0], cap[1]);
    ctx.rotate(ang);
    g.cylinder({ x: 0, y: 0, len: CYL_LEN, bore: 15, ext, dir: 'right' });
    ctx.restore();
    // pusher plate (box shaped)
    const u0 = PU - HW, u1 = PU + HW, h0 = 3, h1 = 27, v0 = vh, v1 = vh + HEAD_T;
    const col = '#aeb8bc', edge = '#4b575c';
    poly(g, [P(u1, v0, h0), P(u1, v1, h0), P(u1, v1, h1), P(u1, v0, h1)], shade(col, -0.3), edge, 1);
    poly(g, [P(u0, v0, h1), P(u1, v0, h1), P(u1, v1, h1), P(u0, v1, h1)], shade(col, 0.3), edge, 1);
    poly(g, [P(u0, v0, h0), P(u1, v0, h0), P(u1, v0, h1), P(u0, v0, h1)], col, edge, 1);
    // yellow and black safety stripes on the face
    ctx.save();
    poly(g, [P(u0, v0, h1 - 7), P(u1, v0, h1 - 7), P(u1, v0, h1 - 1), P(u0, v0, h1 - 1)], '#f2c500');
    ctx.clip();
    for (let u = u0 - 8; u < u1; u += 8) poly(g, [P(u, v0, h1 - 7), P(u + 4, v0, h1 - 7), P(u + 10, v0, h1 - 1), P(u + 6, v0, h1 - 1)], '#2a2f33');
    ctx.restore();
  }

  function reeds(g, phys) {
    const c = g.c;
    const sw = [
      { at: CAP_V - 7, on: phys.I[5], label: 'Home', addr: '%IX0.5', y: 112 },
      { at: CAP_V - CYL_LEN / Math.hypot(KX, KY) + 8, on: phys.I[6], label: 'Out', addr: '%IX0.6', y: 132 }
    ];
    for (const s of sw) {
      const [x, y] = P(PU, s.at, PUSH_H + 9);
      g.line(x + 4, y, 414, s.y, c.ink3, 1, [2, 2]);
      g.led(x, y, s.on, 'yellow', 3);
      g.text(s.label, 418, s.y, { align: 'left', size: 10.5, weight: 700, color: c.ink2 });
      g.addr(s.addr, 470, s.y, { active: s.on });
    }
  }

  function eyeBack(g, e) {
    const [x, y] = P(e.u, D + 8, e.h), [bx, by] = P(e.u, D + 8, -15);
    g.line(x, y, bx, by, g.c.steel, 3);
    housing(g, x, y, false, true);
  }
  function eyeFront(g, e, blocked) {
    const a = P(e.u, D + 8, e.h), b = P(e.u, -8, e.h), foot = P(e.u, -8, -15);
    if (!blocked) g.line(a[0], a[1], b[0], b[1], 'rgba(255,60,40,0.8)', 1.5, [4, 3]);
    g.line(b[0], b[1], foot[0], foot[1], g.c.steel, 3);
    housing(g, b[0], b[1], e.sig, false);
  }
  function housing(g, x, y, sig, tx) {
    g.roundRect(x - 6, y - 7, 12, 14, 2, g.c.dark ? '#5a676d' : '#56646a', null);
    g.circle(x, y, 3, tx ? '#ff5a4a' : (sig ? '#ffd23a' : '#4d4416'));
  }

  function feeder(g, on) {
    const c = g.c;
    const u0 = -2, u1 = 38, v0 = 6, v1 = 52, h0 = 54, h1 = 70;
    const col = c.dark ? '#5c6a70' : '#9aa6ab', edge = shade(col, -0.4);
    poly(g, [P(u1, v0, h0), P(u1, v1, h0), P(u1, v1, h1), P(u1, v0, h1)], shade(col, -0.2), edge, 1);
    poly(g, [P(u0, v0, h1), P(u1, v0, h1), P(u1, v1, h1), P(u0, v1, h1)], c.dark ? '#1b2124' : '#3b4549', edge, 1);
    poly(g, [P(u0, v0, h0), P(u1, v0, h0), P(u1, v0, h1), P(u0, v0, h1)], col, edge, 1);
    const [lx, ly] = P(u0 + 8, v0, h0 + 8);
    g.led(lx, ly, on, 'amber', 3);
  }

  function bin(g, name, st) {
    const B = BINS[name], c = g.c, data = st.bins[name];
    const col = name === 'tall' ? (c.dark ? '#3f6f9c' : '#4f86bd') : (c.dark ? '#3f7f5a' : '#4f9a6c');
    const edge = shade(col, -0.4);
    const { u0, u1, v0, v1, rim, floor } = B;
    // back and floor, contents, then right and front walls
    poly(g, [P(u0, v1, floor), P(u1, v1, floor), P(u1, v1, rim), P(u0, v1, rim)], shade(col, -0.35), edge, 1);
    poly(g, [P(u0, v0, floor), P(u1, v0, floor), P(u1, v1, floor), P(u0, v1, floor)], shade(col, -0.5), edge, 1);
    poly(g, [P(u0, v0, floor), P(u0, v1, floor), P(u0, v1, rim), P(u0, v0, rim)], shade(col, -0.25), edge, 1);
    data.items.forEach((type, i) => {
      const n = data.items.length;
      const slot = (n - 1 - i);
      box3d(g, { type, u: u0 + 4 + ((slot * 19) % (u1 - u0 - BW - 6)), v: v0 + 4 + slot * 6, h: 0 }, floor + 1);
    });
    for (const b of st.boxes) if (b.state === 'fall' && b.bin === name) box3d(g, b);
    poly(g, [P(u1, v0, floor), P(u1, v1, floor), P(u1, v1, rim), P(u1, v0, rim)], shade(col, -0.2), edge, 1);
    poly(g, [P(u0, v0, floor), P(u1, v0, floor), P(u1, v0, rim), P(u0, v0, rim)], col, edge, 1.2);
    const [cx, cy] = P((u0 + u1) / 2, v0, (rim + floor) / 2);
    g.text(B.name, cx, cy, { size: 12, weight: 700, color: '#fff', letterSpacing: 1 });
    // counters under the bin
    const [bx, by] = P((u0 + u1) / 2, v0, floor);
    g.text('OK ' + data.ok, bx - 6, by + 14, { align: 'right', size: 11, weight: 700, color: c.power });
    g.text('WRONG ' + data.bad, bx + 6, by + 14, { align: 'left', size: 11, weight: 700, color: data.bad ? c.fault : c.ink3 });
  }
})(window.PLC = window.PLC || {});
