/* LadderLab scene: small car park (top view) with entry/exit barriers, induction loops, FULL/FREE signs and a free-space display. */
(function (PLC) {
  'use strict';
  const K = PLC.scenes;

  const tags = [
    { name: 'Entry_Sensor', type: 'BOOL', address: '%IX0.0', comment: 'Induction loop in front of the entry barrier (TRUE while a car is on it)' },
    { name: 'Exit_Sensor', type: 'BOOL', address: '%IX0.1', comment: 'Induction loop in front of the exit barrier (TRUE while a car is on it)' },
    { name: 'Reset', type: 'BOOL', address: '%IX0.2', comment: 'Attendant reset key (NO)' },
    { name: 'Entry_Gate', type: 'BOOL', address: '%QX0.0', comment: 'Entry barrier (TRUE = open)' },
    { name: 'Exit_Gate', type: 'BOOL', address: '%QX0.1', comment: 'Exit barrier (TRUE = open)' },
    { name: 'Full_Lamp', type: 'BOOL', address: '%QX0.2', comment: 'Red FULL sign' },
    { name: 'Free_Lamp', type: 'BOOL', address: '%QX0.3', comment: 'Green FREE sign' },
    { name: 'Free_Spaces', type: 'INT', address: '%QW0', comment: 'Display: number of free spaces' }
  ];

  const SPACES = 8;
  const CAR_L = 44, CAR_W = 24;
  const LANE_IN = 55, LANE_OUT = 409;          // lane centre lines (x)
  const BAR_Y = 262, AISLE_Y = 168, SPACE_Y = 105, STREET_Y = 364;
  const WAIT_IN = 293, WAIT_OUT = 233, HOLD_Y = 182;
  const SPACE_X0 = 88, SPACE_W = 36;
  const LOOP_IN = { x: 37, y: 268, w: 36, h: 48 }, LOOP_OUT = { x: 391, y: 208, w: 36, h: 48 };
  const ARM = 56, SWING = 0.8;                 // arm length (px), swing time (s)
  const BARRIERS = [
    { px: 22, py: BAR_Y, closed: 0, open: -Math.PI / 2 },          // entry: swings into the car park
    { px: 442, py: BAR_Y, closed: Math.PI, open: Math.PI / 2 }     // exit: swings towards the street
  ];
  const COLORS = ['#d0342c', '#2f6db5', '#e8b600', '#1f9d55', '#eef0f0', '#e07a2c', '#7a5bc4', '#3fa7b5'];
  const spaceX = (i) => SPACE_X0 + SPACE_W * i + SPACE_W / 2;
  const INSIDE = { passIn: 1, hold: 1, toSpace: 1, parked: 1, leave: 1, toExit: 1, waitOut: 1 };

  PLC.scenes.register({
    id: 'parking',
    name: 'Parking Garage',
    description: 'Count cars in and out with induction loops, drive the entry and exit barriers, and show FULL / FREE and the number of free spaces.',
    width: 640, height: 440,
    tags,
    create() {
      const st = {};
      function reset(phys) {
        st.rand = mulberry32(20240607);
        st.cars = []; st.nextId = 1;
        st.space = new Array(SPACES).fill(null);   // car id parked in / heading for each space
        st.bar = [0, 0];
        st.qIn = 0; st.qOut = 0;
        st.auto = false; st.tIn = 0; st.tOut = 0;
        st.hit = false; st.key = false;
        if (phys) { phys.I[0] = false; phys.I[1] = false; phys.I[2] = false; }
      }
      reset(null);

      const count = (fn) => st.cars.filter(fn).length;
      const parked = () => count(c => c.state === 'parked');
      const inside = () => count(c => INSIDE[c.state]);
      const busy = (...states) => st.cars.some(c => states.includes(c.state));

      function spawnArrival() {
        const car = { id: st.nextId++, color: COLORS[Math.floor(st.rand() * COLORS.length)], state: 'arrive', space: -1 };
        follow(car, rounded([[-40, STREET_Y], [LANE_IN, STREET_Y], [LANE_IN, WAIT_IN]], 24), 85);
        car.h = 0;
        st.cars.push(car);
      }
      function startLeaving() {
        const list = st.cars.filter(c => c.state === 'parked');
        if (!list.length) return false;
        const car = list[Math.floor(st.rand() * list.length)];
        const sx = spaceX(car.space), pts = [[sx, SPACE_Y], [sx, AISLE_Y - 22]];
        for (let i = 1; i <= 8; i++) { const a = i / 8 * Math.PI / 2; pts.push([sx - 22 + 22 * Math.cos(a), AISLE_Y - 22 + 22 * Math.sin(a)]); }
        follow(car, pts, 30, true);
        car.state = 'leave';
        return true;
      }
      function claimSpace(car) {
        const free = [];
        for (let i = 0; i < SPACES; i++) if (st.space[i] === null) free.push(i);
        if (!free.length) return false;
        const i = free[Math.floor(st.rand() * free.length)];
        st.space[i] = car.id; car.space = i;
        follow(car, rounded([[car.x, car.y], [LANE_IN, AISLE_Y], [spaceX(i), AISLE_Y], [spaceX(i), SPACE_Y]], 14), 50);
        car.state = 'toSpace';
        return true;
      }

      function carArrives() { if (st.qIn < 6) st.qIn++; }
      function carLeaves() { if (st.qOut < parked()) st.qOut++; }

      function armHits(b, a) {
        const B = BARRIERS[b], ang = B.closed + (B.open - B.closed) * a;
        for (let r = 6; r <= ARM; r += 4) {
          const x = B.px + Math.cos(ang) * r, y = B.py + Math.sin(ang) * r;
          for (const c of st.cars) if (c.state !== 'parked' && inCar(c, x, y, 3)) return true;
        }
        return false;
      }

      return {
        reset,
        carArrives, carLeaves,
        info() { return { parked: parked(), inside: inside(), cars: st.cars.length, hit: st.hit, overfill: busy('hold'), bar: st.bar.slice() }; },
        step(dt, phys) {
          const s = dt / 1000;
          // auto traffic: seeded random arrivals and departures
          if (st.auto) {
            st.tIn -= s; st.tOut -= s;
            if (st.tIn <= 0) { if (st.qIn < 3) st.qIn++; st.tIn = 4 + st.rand() * 6; }
            if (st.tOut <= 0) { carLeaves(); st.tOut = 6 + st.rand() * 9; }
          }
          if (st.qIn > 0 && !busy('arrive', 'waitIn')) { st.qIn--; spawnArrival(); }
          if (st.qOut > 0 && !busy('leave', 'toExit', 'waitOut')) { if (startLeaving()) st.qOut--; else st.qOut = 0; }

          // barriers: an arm that would swing into a car stays where it is
          for (let b = 0; b < 2; b++) {
            const target = phys.Q[b] ? 1 : 0, a = st.bar[b];
            if (a === target) continue;
            const na = a + Math.max(-s / SWING, Math.min(s / SWING, target - a));
            if (armHits(b, na)) { if (target < a) st.hit = true; }
            else st.bar[b] = na;
          }

          for (const car of st.cars.slice()) {
            const gate = car.state === 'passIn' ? 0 : car.state === 'passOut' ? 1 : -1;
            // a driver only rolls under a barrier that is fully open
            const held = gate >= 0 && car.s < 4 && st.bar[gate] < 1;
            if (car.path && !held) car.s = Math.min(car.path.len, car.s + car.speed * s);
            if (car.path) place(car, s);
            const done = car.path && car.s >= car.path.len;
            switch (car.state) {
              case 'arrive': if (done) { car.state = 'waitIn'; car.path = null; } break;
              case 'waitIn':
                if (st.bar[0] >= 1 && !busy('passIn', 'hold')) {
                  car.state = 'passIn';
                  follow(car, [[car.x, car.y], [LANE_IN, HOLD_Y]], 50);
                }
                break;
              case 'passIn': if (done) { car.path = null; if (!claimSpace(car)) car.state = 'hold'; } break;
              case 'hold': claimSpace(car); break;
              case 'toSpace': if (done) { car.state = 'parked'; car.path = null; } break;
              case 'leave':
                if (done) {
                  st.space[car.space] = null; car.space = -1;
                  car.state = 'toExit';
                  follow(car, rounded([[car.x, car.y], [LANE_OUT, AISLE_Y], [LANE_OUT, WAIT_OUT]], 20), 50);
                }
                break;
              case 'toExit': if (done) { car.state = 'waitOut'; car.path = null; } break;
              case 'waitOut':
                if (st.bar[1] >= 1) {
                  car.state = 'passOut';
                  follow(car, rounded([[car.x, car.y], [LANE_OUT, STREET_Y], [520, STREET_Y]], 24), 60);
                }
                break;
              case 'passOut': if (done) st.cars.splice(st.cars.indexOf(car), 1); break;
            }
          }
          phys.I[0] = st.cars.some(c => onLoop(c, LOOP_IN));
          phys.I[1] = st.cars.some(c => onLoop(c, LOOP_OUT));
        },
        draw(g, phys) {
          const W = g.W, c = g.c, ctx = g.ctx;

          // ---- car park (top view)
          g.plate(12, 50, 440, 378, 'Car park');
          ctx.save();
          g.roundRect(13, 51, 438, 376, 7);
          ctx.clip();
          ground(g);
          loop(g, LOOP_IN, phys.I[0]);
          loop(g, LOOP_OUT, phys.I[1]);
          for (const car of st.cars) drawCar(g, car);
          for (let b = 0; b < 2; b++) barrier(g, b, st.bar[b]);
          ctx.restore();
          // device labels on the island between the lanes
          g.label('Entry barrier', 136, 238);
          g.addr('%QX0.0', 136, 252, { active: phys.Q[0] });
          g.label('Entry loop', 136, 284);
          g.addr('%IX0.0', 136, 298, { active: phys.I[0] });
          g.label('Exit loop', 328, 222);
          g.addr('%IX0.1', 328, 236, { active: phys.I[1] });
          g.label('Exit barrier', 328, 272);
          g.addr('%QX0.1', 328, 286, { active: phys.Q[1] });
          g.line(84, 245, 94, 245, c.ink3, 1);
          g.line(84, 291, 94, 291, c.ink3, 1);
          g.line(370, 229, 380, 229, c.ink3, 1);
          g.line(370, 279, 380, 279, c.ink3, 1);
          if (st.qIn > 0) g.text('+' + st.qIn + ' waiting', 20, 342, { align: 'left', size: 10, font: 'mono', color: '#fff' });
          // scene controls
          let bx = 24;
          bx += 8 + g.button({ x: bx, y: 394, text: 'Car arrives', small: true, onClick: carArrives });
          bx += 8 + g.button({ x: bx, y: 394, text: 'Car leaves', small: true, onClick: carLeaves });
          bx += 8 + g.button({ x: bx, y: 394, text: 'Auto traffic', small: true, active: st.auto, onClick: () => { st.auto = !st.auto; st.tIn = 0.5; st.tOut = 8; } });
          if (st.hit) g.button({ x: bx, y: 394, text: 'Clear', small: true, onClick: () => { st.hit = false; } });

          // ---- entrance sign and attendant
          g.plate(464, 50, 164, 378, 'Entrance sign');
          g.lamp({ x: 505, y: 104, color: 'red', on: phys.Q[2], label: 'Full', addr: '%QX0.2' });
          g.lamp({ x: 587, y: 104, color: 'green', on: phys.Q[3], label: 'Free', addr: '%QX0.3' });
          g.display({ x: 546, y: 198, value: phys.QW[0], digits: 3, size: 26, color: '#4fe08a', label: 'Free spaces', addr: '%QW0' });
          g.line(476, 262, 616, 262, c.line, 1);
          keySwitch(g, 546, 302, st.key, v => { st.key = v; phys.I[2] = v; });
          g.label('Reset key', 546, 338);
          g.addr('%IX0.2', 546, 352, { active: phys.I[2] });
          g.text('NO', 582, 320, { font: 'mono', size: 8.5, color: c.ink3 });
          // truth label: what is really inside
          const n = inside(), over = n > SPACES;
          g.roundRect(478, 372, 136, 42, 5, c.surface, over ? c.fault : c.line, over ? 1.5 : 1);
          g.text('REALLY INSIDE', 546, 384, { size: 9, weight: 700, color: c.ink3, letterSpacing: 0.8 });
          g.text(n + ' of ' + SPACES + ' cars', 546, 401, { size: 13, weight: 700, font: 'ui', color: over ? c.fault : c.ink });

          if (st.hit) g.banner('The barrier hit a car! Keep it open while the loop detects a car.', 'fault', W);
          else if (busy('hold')) g.banner('Car park overfilled! Show FULL and keep the entry closed at 8 cars.', 'warn', W);
          else g.text('Click Car arrives / Car leaves. Open a barrier while its loop sees a car; count the cars in and out.', W / 2, 26, { size: 11.5, color: c.ink2 });
        }
      };
    }
  });

  // ---- paths and motion ---------------------------------------------------------
  /** Polyline with rounded corners (quadratic blends of radius r). */
  function rounded(pts, r) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i - 1], [px, py] = pts[i], [bx, by] = pts[i + 1];
      const l1 = Math.hypot(px - ax, py - ay), l2 = Math.hypot(bx - px, by - py);
      const k = Math.min(r, l1, l2 / 2);
      if (k < 1) { out.push(pts[i]); continue; }
      const s = [px - (px - ax) / l1 * k, py - (py - ay) / l1 * k], e = [px + (bx - px) / l2 * k, py + (by - py) / l2 * k];
      for (let j = 0; j <= 8; j++) {
        const t = j / 8, u = 1 - t;
        out.push([u * u * s[0] + 2 * u * t * px + t * t * e[0], u * u * s[1] + 2 * u * t * py + t * t * e[1]]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  function follow(car, pts, speed, reverse) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    car.path = { pts, cum, len: cum[cum.length - 1], reverse: !!reverse };
    car.s = 0; car.speed = speed;
    car.x = pts[0][0]; car.y = pts[0][1];
  }

  /** Move the car to its path position; the body turns smoothly towards the direction of travel. */
  function place(car, s) {
    const p = car.path;
    let i = 1;
    while (i < p.pts.length - 1 && p.cum[i] < car.s) i++;
    const a = p.pts[i - 1], b = p.pts[i], seg = p.cum[i] - p.cum[i - 1] || 1;
    const f = Math.max(0, Math.min(1, (car.s - p.cum[i - 1]) / seg));
    car.x = a[0] + (b[0] - a[0]) * f;
    car.y = a[1] + (b[1] - a[1]) * f;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.01) {
      let target = Math.atan2(b[1] - a[1], b[0] - a[0]) + (p.reverse ? Math.PI : 0);
      if (car.h === undefined) car.h = target;
      let d = target - car.h;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      car.h += d * Math.min(1, s * 9);
    }
  }

  function inCar(car, x, y, m) {
    if (car.x === undefined) return false;
    const dx = x - car.x, dy = y - car.y, ch = Math.cos(car.h || 0), sh = Math.sin(car.h || 0);
    const lx = dx * ch + dy * sh, ly = -dx * sh + dy * ch;
    return Math.abs(lx) <= CAR_L / 2 + m && Math.abs(ly) <= CAR_W / 2 + m;
  }

  function onLoop(car, L) {
    if (car.x === undefined) return false;
    const ch = Math.abs(Math.cos(car.h || 0)), sh = Math.abs(Math.sin(car.h || 0));
    const hw = (CAR_L * ch + CAR_W * sh) / 2, hh = (CAR_L * sh + CAR_W * ch) / 2;
    return car.x + hw > L.x && car.x - hw < L.x + L.w && car.y + hh > L.y && car.y - hh < L.y + L.h;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- drawing helpers ---------------------------------------------------------
  function ground(g) {
    const dark = g.c.dark;
    const asphalt = dark ? '#1a2124' : '#5f686c', paint = dark ? 'rgba(225,231,233,0.7)' : 'rgba(255,255,255,0.85)';
    const island = dark ? '#2c383d' : '#d2d9d5', curb = dark ? '#47555b' : '#9aa6ab';
    // lot, lanes and street
    g.roundRect(24, 72, 416, 124, 4, asphalt, null);
    g.roundRect(30, 190, 50, 140, 0, asphalt, null);
    g.roundRect(384, 190, 50, 140, 0, asphalt, null);
    g.roundRect(0, 330, 470, 64, 0, asphalt, null);
    // island between the lanes with the attendant booth
    g.roundRect(86, 202, 292, 122, 6, island, curb, 2);
    g.roundRect(208, 238, 48, 40, 3, dark ? '#3d4b51' : '#b9c3c6', curb, 1.5);
    g.roundRect(214, 244, 36, 28, 2, dark ? '#55656c' : '#e8ecee', null);
    g.roundRect(222, 247, 20, 22, 3, g.c.info, null);
    g.text('P', 232, 258.5, { size: 14, weight: 700, font: 'ui', color: '#fff' });
    // parking spaces
    for (let i = 0; i <= SPACES; i++) g.line(SPACE_X0 + i * SPACE_W, 76, SPACE_X0 + i * SPACE_W, 140, paint, 2);
    g.line(SPACE_X0, 76, SPACE_X0 + SPACES * SPACE_W, 76, paint, 2);
    for (let i = 0; i < SPACES; i++) g.text(String(i + 1), spaceX(i), 134, { size: 9, font: 'mono', color: paint });
    // direction arrows and street markings
    for (const [x, y, a] of [[LANE_IN, 214, -Math.PI / 2], [170, AISLE_Y, 0], [300, AISLE_Y, 0], [LANE_OUT, 300, Math.PI / 2]]) arrowMark(g, x, y, a, paint);
    g.line(0, 347, 470, 347, dark ? 'rgba(240,180,41,0.6)' : 'rgba(255,214,90,0.9)', 2, [14, 10]);
    g.text('STREET', 236, 371, { size: 9, weight: 700, color: paint, letterSpacing: 2 });
    g.text('IN', LANE_IN, 322, { size: 9, weight: 700, color: paint, letterSpacing: 1 });
    g.text('OUT', LANE_OUT, 322, { size: 9, weight: 700, color: paint, letterSpacing: 1 });
  }

  function arrowMark(g, x, y, a, col) {
    const ctx = g.ctx;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(9, 0); ctx.lineTo(1, -6); ctx.lineTo(1, -2); ctx.lineTo(-9, -2); ctx.lineTo(-9, 2); ctx.lineTo(1, 2); ctx.lineTo(1, 6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /** Induction loop: saw-cut rectangle in the asphalt, lit while a car is on it. */
  function loop(g, L, on) {
    if (on) g.roundRect(L.x, L.y, L.w, L.h, 3, K.hexA(g.SIGNAL.green.on, 0.28), null);
    g.roundRect(L.x, L.y, L.w, L.h, 3, null, on ? g.SIGNAL.green.on : 'rgba(20,24,26,0.9)', 2);
    g.roundRect(L.x + 5, L.y + 5, L.w - 10, L.h - 10, 2, null, on ? K.hexA(g.SIGNAL.green.on, 0.7) : 'rgba(20,24,26,0.6)', 1);
  }

  function barrier(g, b, a) {
    const B = BARRIERS[b], ctx = g.ctx;
    const ang = B.closed + (B.open - B.closed) * a;
    ctx.save();
    ctx.translate(B.px, B.py); ctx.rotate(ang);
    g.roundRect(4, -3.5, ARM + 1, 7, 3.5, '#f4f4f0', '#3a2a28', 1);
    ctx.beginPath(); ctx.rect(4, -3.5, ARM + 1, 7); ctx.clip();
    for (let x = 12; x < ARM + 6; x += 16) { ctx.fillStyle = '#d0342c'; ctx.fillRect(x, -3.5, 8, 7); }
    ctx.restore();
    g.roundRect(B.px - 7, B.py - 7, 14, 14, 3, '#e8b600', '#5b4b14', 1.2);
    g.circle(B.px, B.py, 3, '#2a2f33');
  }

  /** Top view of a car centred on (x, y), heading h. */
  function drawCar(g, car) {
    if (car.x === undefined) return;
    const ctx = g.ctx, L = CAR_L / 2, Wd = CAR_W / 2;
    ctx.save();
    ctx.translate(car.x, car.y); ctx.rotate(car.h || 0);
    g.roundRect(-L + 1, -Wd + 2, CAR_L, CAR_W, 7, 'rgba(0,0,0,0.3)', null);
    g.roundRect(-L, -Wd, CAR_L, CAR_W, 7, car.color, K.shade(car.color, -0.45), 1);
    // windows and roof
    g.roundRect(4, -Wd + 3, 8, CAR_W - 6, 2, '#25323a', null);
    g.roundRect(-15, -Wd + 4, 6, CAR_W - 8, 2, '#25323a', null);
    g.roundRect(-9, -Wd + 3, 13, CAR_W - 6, 2, K.shade(car.color, 0.15), null);
    // lights
    g.roundRect(L - 3, -Wd + 2, 3, 5, 1, '#fff6c8', null);
    g.roundRect(L - 3, Wd - 7, 3, 5, 1, '#fff6c8', null);
    const brake = car.state === 'waitIn' || car.state === 'waitOut' || car.state === 'hold';
    g.roundRect(-L, -Wd + 2, 3, 5, 1, brake ? '#ff4a3d' : '#8a1d18', null);
    g.roundRect(-L, Wd - 7, 3, 5, 1, brake ? '#ff4a3d' : '#8a1d18', null);
    if (car.state === 'hold' && Math.floor(g.t / 400) % 2 === 0) {
      for (const [x, y] of [[L - 1, -Wd + 1], [L - 1, Wd - 1], [-L + 1, -Wd + 1], [-L + 1, Wd - 1]]) g.circle(x, y, 3.2, '#ffa31a');
    }
    ctx.restore();
  }

  /** Key-operated momentary switch: the key turns while it is held. */
  function keySwitch(g, x, y, on, onPress) {
    const dark = g.c.dark;
    g.circle(x, y, 22, dark ? '#3a4449' : '#b9c3c6', dark ? '#596a71' : '#8e9a9f', 1.2);
    const grad = g.ctx.createRadialGradient(x - 5, y - 6, 2, x, y, 16);
    grad.addColorStop(0, '#f2f4f5'); grad.addColorStop(1, '#8d999e');
    g.circle(x, y, 16, grad, '#5f6b70', 1);
    const ctx = g.ctx;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(on ? Math.PI / 4 : 0);
    g.roundRect(-2, -10, 4, 20, 1.5, '#2a2f33', null);
    g.roundRect(-9, -26, 18, 16, 5, '#2a72c4', '#183a5c', 1);
    g.circle(0, -21, 2.5, dark ? '#263136' : '#e2e7e8');
    ctx.restore();
    g.text('0', x - 26, y - 18, { size: 8.5, font: 'mono', color: !on ? g.c.ink : g.c.ink3 });
    g.text('1', x + 26, y - 18, { size: 8.5, font: 'mono', color: on ? g.c.ink : g.c.ink3 });
    g.hit({ type: 'circle', x, y, r: 26 }, { cursor: 'pointer', label: 'Reset key', down: () => onPress(true), up: () => onPress(false) });
  }
})(window.PLC = window.PLC || {});
