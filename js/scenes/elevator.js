/* LadderLab scene: three-floor elevator. A hoist moves the cabin between floor sensors, the cabin doors open
 * and close with limit switches and a light curtain, every landing has a call button with an acknowledge lamp,
 * and the maintenance panel carries a latching emergency stop that cuts power to the hoist and the door. */
(function (PLC) {
  'use strict';
  const K = PLC.scenes;

  const tags = [
    { name: 'Call_0', type: 'BOOL', address: '%IX0.0', comment: 'Call button, ground floor (NO)' },
    { name: 'Call_1', type: 'BOOL', address: '%IX0.1', comment: 'Call button, floor 1 (NO)' },
    { name: 'Call_2', type: 'BOOL', address: '%IX0.2', comment: 'Call button, floor 2 (NO)' },
    { name: 'At_0', type: 'BOOL', address: '%IX0.3', comment: 'Floor sensor: cabin level with the ground floor' },
    { name: 'At_1', type: 'BOOL', address: '%IX0.4', comment: 'Floor sensor: cabin level with floor 1' },
    { name: 'At_2', type: 'BOOL', address: '%IX0.5', comment: 'Floor sensor: cabin level with floor 2' },
    { name: 'Door_Is_Open', type: 'BOOL', address: '%IX0.6', comment: 'Door limit switch: fully open' },
    { name: 'Door_Is_Closed', type: 'BOOL', address: '%IX0.7', comment: 'Door limit switch: fully closed' },
    { name: 'Door_Clear', type: 'BOOL', address: '%IX1.0', comment: 'Door light curtain (TRUE while the doorway is clear)' },
    { name: 'E_Stop', type: 'BOOL', address: '%IX1.1', comment: 'Emergency stop (NC: TRUE when not pressed)' },
    { name: 'Motor_Up', type: 'BOOL', address: '%QX0.0', comment: 'Hoist motor: up' },
    { name: 'Motor_Down', type: 'BOOL', address: '%QX0.1', comment: 'Hoist motor: down' },
    { name: 'Door_Open', type: 'BOOL', address: '%QX0.2', comment: 'Door motor: open' },
    { name: 'Door_Close', type: 'BOOL', address: '%QX0.3', comment: 'Door motor: close' },
    { name: 'Lamp_Call_0', type: 'BOOL', address: '%QX0.4', comment: 'Call acknowledged lamp, ground floor' },
    { name: 'Lamp_Call_1', type: 'BOOL', address: '%QX0.5', comment: 'Call acknowledged lamp, floor 1' },
    { name: 'Lamp_Call_2', type: 'BOOL', address: '%QX0.6', comment: 'Call acknowledged lamp, floor 2' },
    { name: 'Floor_Display', type: 'INT', address: '%QW0', comment: 'Floor indicator (0, 1, 2)' }
  ];
  // input indices in the process image
  const I_CALL = 0, I_AT = 3, I_OPEN = 6, I_CLOSED = 7, I_CLEAR = 8, I_ESTOP = 9;

  // ---- plant model -------------------------------------------------------------
  const TRAVEL = 3;         // s between adjacent floors (constant speed)
  const DOOR_T = 1.5;       // s for a full door stroke
  const WIN = 0.03;         // floor sensors are TRUE within ±WIN floors of the level
  const OVER = 0.15;        // overtravel (floors) before the cabin or counterweight lands on a buffer
  const PASS_D = 0.32;      // door position where the panels touch a passenger standing in the doorway
  const HOLD = 2.5;         // s a transient fault banner stays after the event

  // ---- geometry (px) ---------------------------------------------------------------
  const FP = 90, Y0 = 374, LY = [Y0, Y0 - FP, Y0 - 2 * FP];   // floor levels (cabin sill height)
  const ROOF = 104, PIT = 402, BUF_Y = Y0 + OVER * FP;
  const SH_L = 204, SH_R = 348;                                  // shaft, inside the walls
  const CAB_L = 236, CAB_W = 96, CAB_R = CAB_L + CAB_W, CX = CAB_L + CAB_W / 2, CAB_H = 70;
  const DOOR_W = 56, DOOR_H = 54, HALF = DOOR_W / 2;
  const CW_X = 218, CW_W = 16, CW_H = 36;                        // counterweight
  const SHV_Y = 86, SHV_R = 11, DRIVE_X = CX - SHV_R, DEFL_X = CW_X + SHV_R;
  const VANE = 35;                                               // sensor vane height above the sill
  const ST_X = 180;                                              // landing call stations
  const SENS_X = 352;
  const SHIRTS = ['#2f6db5', '#c0392b', '#2e8b57', '#8e44ad', '#d35400', '#16a085', '#b7950b', '#5d6d7e'];

  const cabinY = p => Y0 - p * FP;
  const cwBottom = p => BUF_Y - (2 + OVER - p) * FP;

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  PLC.scenes.register({
    id: 'elevator',
    name: 'Elevator',
    description: 'A three-floor elevator: hoist motor, floor sensors, cabin doors with limit switches and a light curtain, call buttons with lamps and an emergency stop.',
    width: 640, height: 440,
    tags,
    create() {
      const st = {};
      function reset(phys) {
        st.pos = 0; st.door = 0; st.move = 0; st.doorMove = 0; st.sheave = 0;
        st.pass = false; st.hit = false; st.crash = null; st.estop = false; st.cut = false;
        st.btn = [false, false, false]; st.note = 0;
        st.t = { moveOpen: 0, offLevel: 0, both: 0, doorBoth: 0 };
        st.prev = {};
        st.faults = { moveOpen: 0, offLevel: 0, both: 0, doorBoth: 0, crash: 0, hit: 0 };
        st.rand = rng(20241014);
        st.people = []; st.riders = []; st.exitT = 0.5; st.boardT = 0.5; st.delivered = 0;
        if (phys) {
          for (let i = 0; i <= I_ESTOP; i++) phys.I[i] = false;
          phys.I[I_AT] = true; phys.I[I_CLOSED] = true; phys.I[I_CLEAR] = true; phys.I[I_ESTOP] = true;
        }
      }
      /** Index of the floor the cabin is level with, or -1 between floors. */
      function level() {
        for (let k = 0; k < 3; k++) if (Math.abs(st.pos - k) <= WIN + 1e-9) return k;
        return -1;
      }
      /** Transient fault: count rising edges, keep the banner for HOLD s after the condition ends. */
      function event(name, on) {
        if (on) { if (!st.prev[name]) st.faults[name]++; st.t[name] = HOLD; }
        st.prev[name] = on;
      }
      /** Cosmetic: someone starts waiting at a landing when its call button is pressed. */
      function callPressed(k) {
        if (st.people.length >= 8 || st.people.some(p => p.floor === k && p.state !== 'out')) return;
        const n = st.rand() < 0.35 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          st.people.push({ floor: k, x: 66 + i * 16, state: 'wait', col: SHIRTS[Math.floor(st.rand() * SHIRTS.length)] });
        }
      }
      /** Cosmetic passengers: riders leave at another floor, then the waiting people board. */
      function passengers(s) {
        const k = level();
        if (k >= 0 && st.door >= 1 && st.move === 0) {
          const i = st.riders.findIndex(r => r.from !== k);
          if (i >= 0) {
            st.boardT = 0.5;
            st.exitT -= s;
            if (st.exitT <= 0) {
              const r = st.riders.splice(i, 1)[0];
              st.people.push({ floor: k, x: 194, state: 'out', col: r.col });
              st.delivered++;
              st.exitT = 0.7;
            }
          } else {
            st.boardT -= s;
            if (st.boardT <= 0) {
              const w = st.people.find(p => p.floor === k && p.state === 'wait');
              const aboard = st.riders.length + st.people.filter(p => p.state === 'in').length;
              if (w && aboard < 4) w.state = 'in';
              st.boardT = 0.6;
            }
          }
        } else { st.exitT = 0.5; st.boardT = 0.5; }
        for (const p of st.people.slice()) {
          if (p.state === 'in') {
            if (k === p.floor && st.door >= 0.6) p.x += 80 * s;
            if (p.x >= 194) { st.people.splice(st.people.indexOf(p), 1); st.riders.push({ col: p.col, from: p.floor }); }
          } else if (p.state === 'out') {
            p.x -= 60 * s;
            if (p.x <= 28) st.people.splice(st.people.indexOf(p), 1);
          }
        }
      }
      reset(null);
      return {
        reset,
        info() {
          return {
            pos: st.pos, door: st.door, level: level(), pass: st.pass, hit: st.hit, crash: st.crash,
            estop: st.estop, cut: st.cut, both: st.t.both > 0, doorBoth: st.t.doorBoth > 0,
            moveOpen: st.t.moveOpen > 0, offLevel: st.t.offLevel > 0, faults: Object.assign({}, st.faults),
            waiting: st.people.filter(p => p.state !== 'out').length, riders: st.riders.length, delivered: st.delivered
          };
        },
        step(dt, phys) {
          const s = dt / 1000;
          for (const k in st.t) st.t[k] = Math.max(0, st.t[k] - s);
          st.note = Math.max(0, st.note - s);
          const Q = phys.Q;
          const up = !!Q[0], down = !!Q[1], open = !!Q[2], close = !!Q[3];
          const power = !st.estop;                 // the E-stop opens the safety circuit
          event('both', up && down);
          event('doorBoth', open && close);
          st.cut = st.estop && (up || down || open || close || !!Q[4] || !!Q[5] || !!Q[6]);

          // hoist: constant speed, buffers at OVER beyond the end floors
          let v = 0;
          if (power && !st.crash && !(up && down)) v = up ? 1 : down ? -1 : 0;
          st.move = v;
          event('moveOpen', v !== 0 && st.door > 0);
          if (v) {
            let p = st.pos + v * s / TRAVEL;
            if (p >= 2 + OVER) { p = 2 + OVER; st.crash = 'top'; st.faults.crash++; }
            else if (p <= -OVER) { p = -OVER; st.crash = 'bottom'; st.faults.crash++; }
            st.pos = p;
            st.sheave += v * s * (FP / TRAVEL) / SHV_R;
          }

          // cabin door: a passenger in the doorway stops the panels
          let vd = 0, offLevel = false;
          if (power && !(open && close)) vd = open ? 1 : close ? -1 : 0;
          st.doorMove = 0;
          if (vd > 0 && st.door < 1) {
            st.door = Math.min(1, st.door + s / DOOR_T);
            st.doorMove = 1;
            offLevel = level() < 0;
          } else if (vd < 0) {
            const stop = st.pass ? PASS_D : 0;
            if (st.door > stop) { st.door = Math.max(stop, st.door - s / DOOR_T); st.doorMove = -1; }
            if (st.pass && st.door <= stop) { if (!st.hit) st.faults.hit++; st.hit = true; }
          }
          event('offLevel', offLevel);

          passengers(s);

          for (let k = 0; k < 3; k++) phys.I[I_AT + k] = Math.abs(st.pos - k) <= WIN + 1e-9;
          phys.I[I_OPEN] = st.door >= 1;
          phys.I[I_CLOSED] = st.door <= 0;
          phys.I[I_CLEAR] = !st.pass;
        },
        draw(g, phys) {
          const W = g.W, c = g.c;

          // ---- building section
          g.plate(12, 50, 440, 382, 'Elevator');
          building(g);
          machineRoom(g, st, phys);
          buffer(g, CX, st.crash === 'bottom');
          buffer(g, CW_X, st.crash === 'top');
          counterweight(g, st.pos);
          cabin(g, st);
          for (let k = 0; k < 3; k++) {
            const y = LY[k] - VANE;
            g.sensor({ x: SENS_X, y, dir: 'left', active: phys.I[I_AT + k] });
            g.label('At floor ' + k, 404, y - 8);
            g.addr('%IX0.' + (I_AT + k), 404, y + 6, { active: phys.I[I_AT + k] });
          }
          for (let k = 0; k < 3; k++) landing(g, k, st, phys, callPressed);
          for (const p of st.people) person(g, p.x, LY[p.floor], p.col, 1, p.state === 'out' ? -1 : 1);

          // scene controls and status
          let bx = 24;
          bx += 8 + g.button({
            x: bx, y: 406, text: 'Passenger in door', small: true, active: st.pass,
            onClick: () => {
              if (st.pass) st.pass = false;
              else if (st.door >= 0.5) st.pass = true;
              else st.note = 2.5;
            }
          });
          if (st.hit) bx += 8 + g.button({ x: bx, y: 406, text: 'Clear', small: true, onClick: () => { st.hit = false; } });
          if (st.crash) {
            bx += 8 + g.button({
              x: bx, y: 406, text: 'Recover cabin', small: true,
              onClick: () => { st.pos = st.crash === 'top' ? 2 : 0; st.crash = null; }
            });
          }
          if (st.note > 0) g.text('Open the door first.', bx, 418.5, { align: 'left', size: 11, color: c.ink2 });
          g.text('Cabin ' + st.pos.toFixed(2), 444, 411, { align: 'right', size: 10, font: 'mono', color: c.ink2 });
          g.text('Door ' + Math.round(st.door * 100) + ' %', 444, 425, { align: 'right', size: 10, font: 'mono', color: c.ink2 });

          // ---- floor indicator
          g.plate(464, 50, 164, 104, 'Floor indicator');
          g.display({ x: 546, y: 94, value: phys.QW[0], digits: 2, size: 30, color: '#ffb02e', label: 'Floor', addr: '%QW0' });

          // ---- cabin door devices
          g.plate(464, 162, 164, 138, 'Cabin door');
          doorGauge(g, 598, 175, st.door);
          const rows = [
            ['Motor open', '%QX0.2', phys.Q[2], 195], ['Motor close', '%QX0.3', phys.Q[3], 214],
            ['Limit open', '%IX0.6', phys.I[I_OPEN], 238], ['Limit closed', '%IX0.7', phys.I[I_CLOSED], 257],
            ['Light curtain', '%IX1.0', phys.I[I_CLEAR], 282]
          ];
          for (const [t, a, on, y] of rows) {
            g.text(t, 478, y, { align: 'left', size: 11, color: c.ink });
            g.addr(a, 596, y, { active: on });
          }
          g.line(476, 226.5, 616, 226.5, c.line, 1);
          g.line(476, 269.5, 616, 269.5, c.line, 1);

          // ---- maintenance panel
          g.plate(464, 308, 164, 124, 'Maintenance');
          g.emergencyStop({
            x: 546, y: 364, r: 20, latched: st.estop, label: 'Emergency stop', addr: '%IX1.1', signal: phys.I[I_ESTOP],
            onToggle: () => { st.estop = !st.estop; phys.I[I_ESTOP] = !st.estop; }
          });
          g.text('NC', 594, 342, { font: 'mono', size: 8.5, color: c.ink3 });
          g.text(st.estop ? 'PRESSED' : 'READY', 498, 342, { font: 'mono', size: 8.5, color: st.estop ? c.fault : c.ink3 });

          // ---- messages
          if (st.crash) g.banner('Overrun: stop the motor at the floor sensor.', 'fault', W);
          else if (st.t.moveOpen > 0) g.banner('Cabin moved with the door open! Only drive when Door_Is_Closed is TRUE.', 'fault', W);
          else if (st.t.offLevel > 0) g.banner('The door opened between floors! Open it only at a floor sensor.', 'fault', W);
          else if (st.hit) g.banner('The door hit a passenger. Reopen when Door_Clear is FALSE.', 'fault', W);
          else if (st.t.both > 0) g.banner('Motor_Up and Motor_Down are on together! Interlock them.', 'fault', W);
          else if (st.t.doorBoth > 0) g.banner('Door_Open and Door_Close are on together! Interlock them.', 'fault', W);
          else if (st.cut) g.banner('E-stop pressed: the hoist and the door have no power. Switch all outputs off.', 'info', W);
          else if (st.estop) g.text('Emergency stop pressed. Click it again to release it.', W / 2, 26, { size: 11.5, color: c.ink2 });
          else g.text('Press a call button at a landing. E_Stop is wired NC, so its input is TRUE until pressed.', W / 2, 26, { size: 11.5, color: c.ink2 });
        }
      };
    }
  });

  // ---- drawing helpers ---------------------------------------------------------
  function pal(g) {
    const d = g.c.dark;
    return {
      wallA: d ? '#2b3439' : '#f1eee7', wallB: d ? '#273034' : '#e9e5dc',
      slab: d ? '#4b585e' : '#a7b0b4', slabEdge: d ? '#617077' : '#879297',
      shaft: d ? '#151b1e' : '#c9d0d2', pit: d ? '#101518' : '#b4bcbf',
      ground: d ? '#20272a' : '#c3c9cb', rail: d ? '#3d484d' : '#9aa5aa',
      edge: d ? '#2a3338' : '#56636a', rope: d ? '#aab4b9' : '#3d474c'
    };
  }

  function building(g) {
    const P = pal(g), ctx = g.ctx;
    // storeys on the landing side
    for (let k = 0; k < 3; k++) {
      const top = k === 2 ? ROOF : LY[k + 1] + 8;
      ctx.fillStyle = k % 2 ? P.wallB : P.wallA;
      ctx.fillRect(20, top, SH_L - 6 - 20, LY[k] - top);
    }
    // shaft and pit
    ctx.fillStyle = P.shaft; ctx.fillRect(SH_L, ROOF, SH_R - SH_L, PIT - ROOF);
    ctx.fillStyle = P.pit; ctx.fillRect(SH_L, Y0, SH_R - SH_L, PIT - Y0);
    // guide rails for the cabin and the counterweight
    for (const x of [CAB_L - 3, CAB_R + 9, CW_X - CW_W / 2 - 3, CW_X + CW_W / 2 + 3]) g.line(x, ROOF, x, PIT, P.rail, 2);
    // ground under the landings
    ctx.fillStyle = P.ground; ctx.fillRect(20, Y0 + 8, SH_L - 6 - 20, PIT - Y0 - 6);
    // floor slabs, roof and walls
    for (let k = 0; k < 3; k++) {
      g.roundRect(20, LY[k], SH_L - 6 - 20, 8, 0, P.slab, null);
      g.line(20, LY[k] + 0.5, SH_L - 6, LY[k] + 0.5, P.slabEdge, 1);
    }
    g.roundRect(20, ROOF - 4, SH_R + 6 - 20, 4, 0, P.slab, null);
    g.roundRect(SH_L - 6, ROOF, 6, PIT + 2 - ROOF, 0, P.slab, null);
    g.roundRect(SH_R, ROOF, 6, PIT + 2 - ROOF, 0, P.slab, null);
    g.roundRect(SH_L - 6, PIT, SH_R + 12 - SH_L, 2, 0, P.slab, null);
    g.line(20.5, ROOF - 4, 20.5, PIT, P.slabEdge, 1);
  }

  function machineRoom(g, st, phys) {
    const P = pal(g), dark = g.c.dark;
    g.roundRect(SH_L - 6, 66, SH_R + 12 - SH_L, ROOF - 4 - 66, 3, dark ? '#1d2528' : '#d8dddf', dark ? '#3a464c' : '#9aa6ab', 1);
    // ropes: cabin and counterweight hang from the sheaves
    const top = cabinY(st.pos) - CAB_H;
    g.line(CX, top - 11, CX, SHV_Y, P.rope, 1.6);
    g.line(CW_X, cwBottom(st.pos) - CW_H, CW_X, SHV_Y, P.rope, 1.6);
    g.line(DEFL_X, SHV_Y - SHV_R, DRIVE_X, SHV_Y - SHV_R, P.rope, 1.6);
    // drive shaft and motor
    g.line(DRIVE_X, SHV_Y, 296, SHV_Y, '#7f8b90', 4);
    const fault = st.t.both > 0 || (!!st.crash && (!!phys.Q[0] || !!phys.Q[1])), run = st.move !== 0;
    g.roundRect(294, 75, 48, 22, 4, dark ? '#3b464b' : '#5c6a70', fault ? g.c.fault : run ? g.c.power : '#20282c', fault || run ? 2.5 : 1.5);
    g.text('M', 306, 86.5, { size: 11, weight: 700, font: 'ui', color: '#e6eaec' });
    if (run) arrow(g, 328, 86 + ((g.t / 500) % 1) * 3 * -st.move, -st.move, dark ? '#35d07a' : '#2fe07a');
    else g.text(fault ? '!' : 'OFF', 328, 86.5, { size: fault ? 14 : 8.5, font: fault ? 'ui' : 'mono', weight: 700, color: fault ? '#ff6a5e' : '#aab5b9' });
    sheave(g, DRIVE_X, st.sheave);
    sheave(g, DEFL_X, st.sheave);
    g.text('HOIST', 362, 68, { align: 'left', size: 9.5, weight: 700, color: g.c.ink2, letterSpacing: 0.6 });
    g.text('UP', 362, 84, { align: 'left', size: 9.5, weight: 700, color: g.c.ink2, letterSpacing: 0.6 });
    g.addr('%QX0.0', 422, 84, { active: phys.Q[0] });
    g.text('DOWN', 362, 100, { align: 'left', size: 9.5, weight: 700, color: g.c.ink2, letterSpacing: 0.6 });
    g.addr('%QX0.1', 422, 100, { active: phys.Q[1] });
  }

  function sheave(g, x, a) {
    const ctx = g.ctx;
    g.circle(x, SHV_Y, SHV_R, '#a3aeb3', '#4a555a', 1.2);
    g.circle(x, SHV_Y, SHV_R - 3, null, '#6f7b80', 1);
    ctx.save();
    ctx.translate(x, SHV_Y); ctx.rotate(a);
    for (let i = 0; i < 3; i++) { ctx.rotate(Math.PI * 2 / 3); g.line(0, 0, 0, -(SHV_R - 3), '#5a656a', 1.5); }
    ctx.restore();
    g.circle(x, SHV_Y, 2.2, '#e6eaec', '#4a555a', 1);
  }

  /** Vertical arrow, k = -1 points up, +1 points down. */
  function arrow(g, x, y, k, col) {
    const ctx = g.ctx;
    ctx.beginPath();
    ctx.moveTo(x, y + 7 * k);
    ctx.lineTo(x - 6, y + 1 * k);
    ctx.lineTo(x - 2.5, y + 1 * k);
    ctx.lineTo(x - 2.5, y - 6 * k);
    ctx.lineTo(x + 2.5, y - 6 * k);
    ctx.lineTo(x + 2.5, y + 1 * k);
    ctx.lineTo(x + 6, y + 1 * k);
    ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
  }

  /** Spring buffer in the pit; `hit` = something rests on it. */
  function buffer(g, x, hit) {
    const ctx = g.ctx, col = hit ? g.c.fault : (g.c.dark ? '#8a969b' : '#5f6b70');
    g.roundRect(x - 9, PIT - 4, 18, 4, 1, g.c.dark ? '#3b464b' : '#7f8b90', null);
    ctx.save();
    ctx.beginPath();
    const y1 = BUF_Y + 2, y2 = PIT - 4, n = 5;
    ctx.moveTo(x, y2);
    for (let i = 0; i <= n; i++) ctx.lineTo(x + (i % 2 ? -5 : 5), y2 - (y2 - y1) * (i + 0.5) / (n + 1));
    ctx.lineTo(x, y1);
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    g.roundRect(x - 7, BUF_Y, 14, 2.5, 1, col, null);
  }

  function counterweight(g, pos) {
    const b = cwBottom(pos), t = b - CW_H, x = CW_X - CW_W / 2;
    const dark = g.c.dark;
    g.roundRect(x, t, CW_W, CW_H, 2, dark ? '#4a565c' : '#5d6a70', dark ? '#2a3338' : '#3a454a', 1);
    for (let i = 1; i < 5; i++) g.line(x + 2, t + i * CW_H / 5, x + CW_W - 2, t + i * CW_H / 5, dark ? '#38434a' : '#46535a', 1);
    g.roundRect(CW_X - 3, t - 4, 6, 4, 1, dark ? '#2a3338' : '#3a454a', null);
  }

  function cabin(g, st) {
    const P = pal(g), ctx = g.ctx, dark = g.c.dark;
    const fy = cabinY(st.pos), top = fy - CAB_H;
    // door operator on the roof and the rope hitch
    g.roundRect(CX - 30, top - 7, 60, 7, 2, dark ? '#3c474c' : '#5c6a70', null);
    g.circle(CX + 22, top - 3.5, 2.2, st.doorMove ? '#2fe07a' : (dark ? '#22292d' : '#3a4549'));
    g.roundRect(CX - 3, top - 11, 6, 4, 1, P.edge, null);
    // body
    const body = ctx.createLinearGradient(CAB_L, 0, CAB_R, 0);
    body.addColorStop(0, dark ? '#5c6a70' : '#a9b4b8');
    body.addColorStop(0.5, dark ? '#71808a' : '#cdd5d8');
    body.addColorStop(1, dark ? '#4c585e' : '#959fa4');
    const bad = st.crash || st.hit;
    g.roundRect(CAB_L, top, CAB_W, CAB_H, 3, body, bad ? g.c.fault : P.edge, bad ? 2.5 : 1.2);
    g.roundRect(CX - 14, top + 4, 28, 6, 2, dark ? '#1a2023' : '#3f4a4f', null);
    // doorway: lit interior, riders, sliding panels, light curtain
    const dx = CX - HALF, dy = fy - DOOR_H, off = st.door * HALF;
    ctx.save();
    ctx.beginPath(); ctx.rect(dx, dy, DOOR_W, DOOR_H); ctx.clip();
    const inner = ctx.createLinearGradient(0, dy, 0, fy);
    inner.addColorStop(0, dark ? '#7d7052' : '#fbf1d6');
    inner.addColorStop(1, dark ? '#4d4535' : '#d9c69b');
    ctx.fillStyle = inner; ctx.fillRect(dx, dy, DOOR_W, DOOR_H);
    ctx.fillStyle = 'rgba(255,248,220,0.95)'; ctx.fillRect(dx + 12, dy, DOOR_W - 24, 2.5);
    g.line(dx, dy + 30, dx + DOOR_W, dy + 30, dark ? '#a39676' : '#b9a57a', 2);
    const n = st.riders.length;
    st.riders.forEach((r, i) => person(g, CX + (i - (n - 1) / 2) * 11, fy - 1, r.col, 0.82, 0));
    doorPanel(g, dx - off, dy, HALF, DOOR_H, dark);
    doorPanel(g, CX + off, dy, HALF, DOOR_H, dark);
    if (off > 1.5) {
      const lx = CX - off, rx = CX + off;
      for (let i = 0; i < 6; i++) {
        const by = dy + 8 + i * 7.5, end = st.pass ? Math.min(rx, CX - 9) : rx;
        if (end > lx + 1) g.line(lx, by, end, by, 'rgba(255,60,40,0.8)', 1, [2, 2]);
      }
      g.line(lx - 1, dy + 4, lx - 1, fy - 3, '#262c30', 2);
      g.line(rx + 1, dy + 4, rx + 1, fy - 3, '#262c30', 2);
    }
    ctx.restore();
    if (st.pass) person(g, CX, fy, '#e67e22', 1.05, 0);
    g.roundRect(dx - 2, dy - 2, DOOR_W + 4, DOOR_H + 2, 1.5, null, P.edge, 1.5);
    g.line(CAB_L + 2, fy - 1, CAB_R - 2, fy - 1, dark ? '#1b2124' : '#3f4a4f', 2);
    // vane that actuates the floor sensors
    g.roundRect(CAB_R, fy - VANE - 6, 6, 12, 1, dark ? '#c8ced1' : '#e3e7e9', P.edge, 1);
  }

  function doorPanel(g, x, y, w, h, dark) {
    const grad = g.ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, dark ? '#7f8c93' : '#d3dadd');
    grad.addColorStop(0.5, dark ? '#97a4aa' : '#eef2f3');
    grad.addColorStop(1, dark ? '#76838a' : '#c9d1d4');
    g.roundRect(x, y, w, h, 0, grad, dark ? '#3b464b' : '#7f8b90', 1);
    g.line(x + 4, y + 6, x + 4, y + h - 6, 'rgba(255,255,255,0.3)', 1);
  }

  /** Small figure standing on y. dir: 1 walks right, -1 left, 0 faces the viewer. */
  function person(g, x, y, col, s, dir) {
    const legs = '#2e3a46', skin = '#e2b48f';
    const step = dir ? Math.sin(x / 3.2) * 2.2 * s : 0;
    g.line(x - 2.2 * s + step, y - 10 * s, x - 2.2 * s + step, y, legs, 3 * s);
    g.line(x + 2.2 * s - step, y - 10 * s, x + 2.2 * s - step, y, legs, 3 * s);
    g.roundRect(x - 5.5 * s, y - 23 * s, 11 * s, 14 * s, 3 * s, col, null);
    g.circle(x, y - 27.5 * s, 4.3 * s, skin, 'rgba(0,0,0,0.25)', 0.8);
  }

  function landing(g, k, st, phys, callPressed) {
    const y = LY[k], c = g.c, dark = c.dark;
    // floor sign
    g.roundRect(26, y - 78, 26, 26, 4, '#2b3338', dark ? '#4b585e' : null, 1);
    g.text(String(k), 39, y - 64.5, { size: 17, weight: 700, font: 'ui', color: '#fff' });
    // call station: acknowledge lamp above the button
    g.roundRect(ST_X - 15, y - 73, 30, 56, 4, dark ? '#3a454a' : '#cfd5d8', dark ? '#58666c' : '#8e9a9f', 1);
    g.lamp({ x: ST_X, y: y - 60, r: 5, color: 'amber', on: phys.Q[4 + k] });
    g.pushButton({
      x: ST_X, y: y - 34, r: 8, color: 'white', pressed: st.btn[k], signal: phys.I[I_CALL + k],
      onPress: v => { st.btn[k] = v; phys.I[I_CALL + k] = v; if (v) callPressed(k); }
    });
    g.hits[g.hits.length - 1].label = 'Call floor ' + k;
    g.text('LAMP', 107, y - 60, { align: 'right', size: 9, weight: 700, color: c.ink3, letterSpacing: 0.5 });
    g.addr('%QX0.' + (4 + k), 134, y - 60, { active: phys.Q[4 + k] });
    g.text('CALL', 107, y - 34, { align: 'right', size: 9, weight: 700, color: c.ink3, letterSpacing: 0.5 });
    g.addr('%IX0.' + (I_CALL + k), 134, y - 34, { active: phys.I[I_CALL + k] });
  }

  /** Tiny door symbol in the panel title row: two panels, gap = opening. */
  function doorGauge(g, x, y, d) {
    const w = 26, h = 14, off = d * w / 4;
    g.roundRect(x - w / 2 - 1, y - h / 2 - 1, w + 2, h + 2, 2, g.c.dark ? '#4d4535' : '#e8dcb8', g.c.ink3, 1);
    g.ctx.save();
    g.ctx.beginPath(); g.ctx.rect(x - w / 2, y - h / 2, w, h); g.ctx.clip();
    g.roundRect(x - w / 2 - off, y - h / 2, w / 2, h, 0, g.c.steel, null);
    g.roundRect(x + off, y - h / 2, w / 2, h, 0, g.c.steel, null);
    g.ctx.restore();
  }
})(window.PLC = window.PLC || {});
