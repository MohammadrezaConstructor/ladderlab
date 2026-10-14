/* LadderLab scene: road junction with traffic lights, a side-road induction loop and a pedestrian crossing (top-down view). */
(function (PLC) {
  'use strict';

  const tags = [
    { name: 'Ped_Button', type: 'BOOL', address: '%IX0.0', comment: 'Pedestrian request push button (NO)' },
    { name: 'Night_Mode', type: 'BOOL', address: '%IX0.1', comment: 'Night mode switch (TRUE = flashing yellow)' },
    { name: 'Side_Car', type: 'BOOL', address: '%IX0.2', comment: 'Induction loop: car waiting on the side road' },
    { name: 'Main_Red', type: 'BOOL', address: '%QX0.0', comment: 'Main road: red' },
    { name: 'Main_Yellow', type: 'BOOL', address: '%QX0.1', comment: 'Main road: yellow' },
    { name: 'Main_Green', type: 'BOOL', address: '%QX0.2', comment: 'Main road: green' },
    { name: 'Side_Red', type: 'BOOL', address: '%QX0.3', comment: 'Side road: red' },
    { name: 'Side_Yellow', type: 'BOOL', address: '%QX0.4', comment: 'Side road: yellow' },
    { name: 'Side_Green', type: 'BOOL', address: '%QX0.5', comment: 'Side road: green' },
    { name: 'Ped_Red', type: 'BOOL', address: '%QX0.6', comment: 'Pedestrians: red (don\'t walk)' },
    { name: 'Ped_Green', type: 'BOOL', address: '%QX0.7', comment: 'Pedestrians: green (walk)' }
  ];

  // map geometry
  const MX = 22, MY = 74, MW = 404, MH = 344;
  const CX = 270, CY = 240, RH = 32, SH = 28;            // junction centre, half widths of main and side road
  const CW0 = 180, CW1 = 206;                            // crosswalk on the west arm
  const XL = MX - 40, XR = MX + MW + 40, YT = MY - 40, YB = MY + MH + 40;
  const CAR_L = 26, CAR_W = 14, GAP = 6;
  const VMAX = { main: 70, side: 58 }, ACC = 60, DEC = 140, DEC_HARD = 320;
  const PED_V = 24;
  const SPAWN = { E: [3.5, 7], W: [4, 8], S: [7, 13], N: [8, 14] };
  const CAR_COLORS = ['#d64541', '#2f80c8', '#f2c14e', '#e9ecee', '#3c4a52', '#4f9d69', '#8e5bb5', '#e67e22'];
  const PED_COLORS = ['#e74c3c', '#3498db', '#9b59b6', '#16a085', '#f39c12', '#5d6d7e'];

  // lanes: the front of a car at distance s is (x0 + dx*s, y0 + dy*s)
  function lane(id, road, x0, y0, dx, dy) {
    const at = p => (p - (dx ? x0 : y0)) * (dx || dy);
    return { id, road, x0, y0, dx, dy, at, len: dx ? XR - XL : YB - YT };
  }
  const E = lane('E', 'main', XL, CY + 16, 1, 0);
  E.stop = E.at(CW0 - 8); E.box = [E.at(CX - SH), E.at(CX + SH)]; E.cw = [E.at(CW0), E.at(CW1)]; E.mid = E.at(CX);
  const Wl = lane('W', 'main', XR, CY - 16, -1, 0);
  Wl.stop = Wl.at(CX + SH + 8); Wl.box = [Wl.at(CX + SH), Wl.at(CX - SH)]; Wl.cw = [Wl.at(CW1), Wl.at(CW0)]; Wl.mid = Wl.at(CX);
  const S = lane('S', 'side', CX - 14, YT, 0, 1);
  S.stop = S.at(CY - RH - 8); S.box = [S.at(CY - RH), S.at(CY + RH)]; S.mid = S.at(CY); S.loop = [S.stop - 30, S.stop];
  const N = lane('N', 'side', CX + 14, YB, 0, -1);
  N.stop = N.at(CY + RH + 8); N.box = [N.at(CY + RH), N.at(CY - RH)]; N.mid = N.at(CY); N.loop = [N.stop - 30, N.stop];
  const LANE = { E, W: Wl, S, N }, LANE_IDS = ['E', 'W', 'S', 'N'];
  const inBox = (c, ln) => c.s > ln.box[0] - 0.5 && c.s - CAR_L < ln.box[1];

  // pedestrians: queue along the sidewalk, cross at CROSS_X, leave westwards on the other side
  const CROSS_X = { N: 190, S: 198 };
  const WALK_Y = { N: CY - RH - 7, S: CY + RH + 7 };     // approach lane
  const FAR_Y = { N: CY + RH + 3, S: CY - RH - 3 };      // where the crossing ends

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
    id: 'traffic',
    name: 'Traffic Light',
    description: 'A main road crosses a side road. Control the car signals and the pedestrian crossing; an induction loop reports cars waiting on the side road.',
    width: 640, height: 440,
    tags,
    create() {
      const st = {};
      function reset(phys) {
        st.rand = rng(1337);
        st.cars = []; st.peds = []; st.nextId = 0; st.time = 0;
        st.spawnT = { E: 0.2, W: 1.4, S: 2.2, N: 4.5 };
        st.pedT = 1.5;
        st.count = { main: 0, side: 0, ped: 0 };
        st.yEdges = { main: [], side: [] }; st.prevY = { main: false, side: false };
        st.conflictT = 0; st.pedConflictT = 0; st.btn = false;
        if (phys) { phys.I[0] = false; phys.I[1] = false; phys.I[2] = false; }
      }
      reset(null);

      // how drivers read their signal head: stop, go, or yield (dark or flashing yellow)
      function mode(road, r, y, g) {
        if (!!y !== st.prevY[road]) { st.yEdges[road].push(st.time); st.prevY[road] = !!y; }
        const edges = st.yEdges[road] = st.yEdges[road].filter(t => st.time - t <= 3000);
        if (r) return 'stop';
        if (y) return edges.length >= 3 ? 'yield' : 'stop';
        if (g) return 'go';
        return 'yield';
      }

      function spawn(s) {
        for (const id of LANE_IDS) {
          st.spawnT[id] -= s;
          if (st.spawnT[id] > 0) continue;
          if (st.cars.some(c => c.lane === id && c.s - CAR_L < GAP + 2)) { st.spawnT[id] = 0.4; continue; }
          const road = LANE[id].road;
          st.cars.push({ id: ++st.nextId, lane: id, s: 0, v: VMAX[road] * 0.9, go: false, brake: false, col: CAR_COLORS[Math.floor(st.rand() * CAR_COLORS.length)] });
          const [a, b] = SPAWN[id];
          st.spawnT[id] = a + (b - a) * st.rand();
        }
        st.pedT -= s;
        if (st.pedT <= 0) {
          const side = st.rand() < 0.5 ? 'N' : 'S';
          const queued = st.peds.filter(p => p.side === side && p.state !== 'cross' && p.state !== 'leave').length;
          if (queued < 4) st.peds.push({ id: ++st.nextId, side, x: MX - 8, y: WALK_Y[side], state: 'walk', col: PED_COLORS[Math.floor(st.rand() * PED_COLORS.length)] });
          st.pedT = 7 + 7 * st.rand();
        }
      }

      function moveCars(s, sig) {
        const occ = { main: 0, side: 0 };
        for (const c of st.cars) if (inBox(c, LANE[c.lane])) occ[LANE[c.lane].road]++;
        const pedsCrossing = st.peds.some(p => p.state === 'cross');
        // a side-road driver at a dark junction waits until no main-road car is coming
        const mainComing = st.cars.some(c => {
          const ln = LANE[c.lane];
          return ln.road === 'main' && (inBox(c, ln) || (c.v > 5 && c.s < ln.box[0] && c.s > ln.box[0] - 90));
        });
        for (const id of LANE_IDS) {
          const ln = LANE[id], m = sig[ln.road], cross = ln.road === 'main' ? 'side' : 'main', vmax = VMAX[ln.road];
          const list = st.cars.filter(c => c.lane === id).sort((a, b) => b.s - a.s);
          list.forEach((c, i) => {
            let limit = i ? list[i - 1].s - CAR_L - GAP : Infinity;
            if (!c.go && c.s <= ln.stop + 0.01) {
              if (m === 'stop') {
                if (ln.stop - c.s >= c.v * c.v / (2 * DEC_HARD) - 0.5) limit = Math.min(limit, ln.stop);
                else c.go = true;                                     // too close to stop: drive on
              } else if (m === 'yield' && ln.road === 'side') {
                if (c.s >= ln.stop - 1.5 && c.v < 3 && !mainComing && !occ.main) c.go = true;
                else limit = Math.min(limit, ln.stop);
              }
            }
            if (ln.cw && pedsCrossing && c.s <= ln.cw[0] + 0.5) limit = Math.min(limit, ln.cw[0] - 1);
            if (c.s < ln.box[0] - 0.5 && occ[cross] > 0) limit = Math.min(limit, ln.box[0] - 1); // never enter an occupied junction
            const vT = Math.min(vmax, Math.sqrt(2 * DEC * Math.max(0, limit - c.s)));
            const v0 = c.v;
            c.v = Math.min(c.v + ACC * s, vT);
            c.brake = c.v < v0 - 0.01 || c.v < 1;
            const was = inBox(c, ln), s0 = c.s;
            c.s = Math.max(c.s, Math.min(c.s + c.v * s, limit));
            if (!was && inBox(c, ln)) occ[ln.road]++;
            else if (was && !inBox(c, ln)) occ[ln.road]--;
            if (s0 < ln.mid && c.s >= ln.mid) st.count[ln.road]++;
          });
        }
        st.cars = st.cars.filter(c => c.s - CAR_L < LANE[c.lane].len);
      }

      function movePeds(s, walk) {
        const carOnCw = st.cars.some(c => { const ln = LANE[c.lane]; return ln.cw && c.s > ln.cw[0] && c.s - CAR_L < ln.cw[1]; });
        for (const side of ['N', 'S']) {
          const queue = st.peds.filter(p => p.side === side && (p.state === 'walk' || p.state === 'wait')).sort((a, b) => b.x - a.x);
          queue.forEach((p, k) => {
            const tx = CROSS_X[side] - 9 * k;
            if (p.x < tx) p.x = Math.min(tx, p.x + PED_V * s);
            p.state = p.x >= tx - 0.01 ? 'wait' : 'walk';
            if (k === 0 && p.state === 'wait' && walk && !carOnCw) p.state = 'cross';
          });
        }
        for (const p of st.peds) {
          if (p.state === 'cross') {
            const ty = FAR_Y[p.side], d = ty - p.y;
            p.y += Math.sign(d) * Math.min(Math.abs(d), PED_V * s);
            if (Math.abs(ty - p.y) < 0.01) { p.state = 'leave'; st.count.ped++; }
          } else if (p.state === 'leave') p.x -= PED_V * 1.1 * s;
        }
        st.peds = st.peds.filter(p => p.x > MX - 12);
      }

      return {
        reset,
        state: st,
        step(dt, phys) {
          const s = dt / 1000, Q = phys.Q;
          st.time += dt;
          const sig = { main: mode('main', Q[0], Q[1], Q[2]), side: mode('side', Q[3], Q[4], Q[5]) };
          // safety checks, held for a moment so a short overlap is still visible
          const conflict = (Q[2] && (Q[4] || Q[5])) || (Q[5] && (Q[1] || Q[2]));
          st.conflictT = conflict ? 1.5 : Math.max(0, st.conflictT - s);
          const pedConflict = Q[7] && (!Q[0] || Q[1] || Q[2]);
          st.pedConflictT = pedConflict ? 1.5 : Math.max(0, st.pedConflictT - s);
          spawn(s);
          moveCars(s, sig);
          movePeds(s, !!Q[7]);
          phys.I[2] = st.cars.some(c => { const ln = LANE[c.lane]; return ln.loop && c.s > ln.loop[0] && c.s - CAR_L < ln.loop[1]; });
        },
        draw(g, phys) {
          const W = g.W, c = g.c, Q = phys.Q;
          g.plate(12, 50, 424, 378, 'Junction');
          drawMap(g, st, phys);

          // signal heads with their outputs
          g.plate(448, 50, 180, 210, 'Signals');
          g.label('Main road', 498, 78);
          bigHead(g, 460, 88, [['red', Q[0], '%QX0.0'], ['yellow', Q[1], '%QX0.1'], ['green', Q[2], '%QX0.2']]);
          g.label('Side road', 582, 78);
          bigHead(g, 544, 88, [['red', Q[3], '%QX0.3'], ['yellow', Q[4], '%QX0.4'], ['green', Q[5], '%QX0.5']]);
          g.label('Pedestrians', 498, 184);
          bigHead(g, 460, 194, [['red', Q[6], '%QX0.6', 'stand'], ['green', Q[7], '%QX0.7', 'walk']]);
          // counter legend
          g.label('Passed', 584, 184);
          const rows = [['Main', st.count.main], ['Side', st.count.side], ['Walkers', st.count.ped]];
          rows.forEach(([k, v], i) => {
            const y = 204 + i * 17;
            g.text(k, 552, y, { align: 'left', size: 11, color: c.ink2 });
            g.text(String(v), 616, y, { align: 'right', size: 11, font: 'mono', color: c.ink });
          });

          // operator controls
          g.plate(448, 268, 180, 160, 'Operator');
          g.roundRect(467, 301, 54, 52, 7, '#f2c500', '#a88600', 1.2);
          g.pushButton({ x: 494, y: 327, r: 15, color: 'black', label: 'Ped request', addr: '%IX0.0', pressed: st.btn, signal: phys.I[0], onPress: v => { st.btn = v; phys.I[0] = v; } });
          g.toggle({ x: 580, y: 327, on: phys.I[1], label: 'Night mode', addr: '%IX0.1', signal: phys.I[1], onToggle: () => { phys.I[1] = !phys.I[1]; } });
          g.text('The request button is NO:', 538, 400, { size: 9.5, color: c.ink3 });
          g.text('TRUE only while held', 538, 412, { size: 9.5, color: c.ink3 });

          if (st.conflictT > 0) g.banner('Conflicting greens! Cross traffic could crash.', 'fault', W);
          else if (st.pedConflictT > 0) g.banner('Walk light while the main road is not red! Switch Main_Red on first.', 'fault', W);
          else g.text('Hold the yellow button to request a walk signal. Loops in the side road detect waiting cars.', W / 2, 26, { size: 11.5, color: c.ink2 });
        }
      };
    }
  });

  // ---- drawing ---------------------------------------------------------------
  function drawMap(g, st, phys) {
    const ctx = g.ctx, c = g.c, Q = phys.Q;
    const col = c.dark
      ? { ground: '#1d2823', walk: '#3d484d', road: '#30383d', mark: '#c4cbcd', loop: '#8a9499' }
      : { ground: '#c3d2bb', walk: '#e3e6e2', road: '#5b656b', mark: '#f7f7f3', loop: '#c9d0d3' };
    ctx.save();
    g.roundRect(MX, MY, MW, MH, 6);
    ctx.clip();
    ctx.fillStyle = col.ground; ctx.fillRect(MX, MY, MW, MH);
    // sidewalks, then the roads on top
    ctx.fillStyle = col.walk;
    ctx.fillRect(MX, CY - RH - 10, MW, 2 * RH + 20);
    ctx.fillRect(CX - SH - 10, MY, 2 * SH + 20, MH);
    ctx.fillStyle = col.road;
    ctx.fillRect(MX, CY - RH, MW, 2 * RH);
    ctx.fillRect(CX - SH, MY, 2 * SH, MH);
    // centre lines
    const dash = [10, 9];
    g.line(MX, CY, CW0 - 12, CY, col.mark, 2, dash);
    g.line(CX + SH + 12, CY, MX + MW, CY, col.mark, 2, dash);
    g.line(CX, MY, CX, CY - RH - 12, col.mark, 2, dash);
    g.line(CX, CY + RH + 12, CX, MY + MH, col.mark, 2, dash);
    // stop lines
    g.line(CW0 - 6, CY + 1, CW0 - 6, CY + RH - 1, col.mark, 3);
    g.line(CX + SH + 6, CY - RH + 1, CX + SH + 6, CY - 1, col.mark, 3);
    g.line(CX - SH + 1, CY - RH - 6, CX - 1, CY - RH - 6, col.mark, 3);
    g.line(CX + 1, CY + RH + 6, CX + SH - 1, CY + RH + 6, col.mark, 3);
    // zebra crossing
    ctx.fillStyle = col.mark;
    for (let y = CY - RH + 3; y < CY + RH - 3; y += 8) ctx.fillRect(CW0, y, CW1 - CW0, 4);
    // induction loops in both side-road lanes
    const on = !!phys.I[2];
    for (const [x, y] of [[CX - SH + 4, CY - RH - 38], [CX + 4, CY + RH + 8]]) {
      if (on) g.roundRect(x, y, 20, 30, 3, 'rgba(255,210,58,0.35)');
      ctx.save();
      ctx.setLineDash([3, 2]);
      g.roundRect(x, y, 20, 30, 3, null, on ? '#ffd23a' : col.loop, 1.5);
      ctx.restore();
    }
    for (const car of st.cars) drawCar(g, car);
    for (const p of st.peds) drawPed(g, p);
    ctx.restore();

    // small signal heads at each approach
    g.trafficLight({ x: 130, y: 286, size: 4.5, horizontal: true, red: Q[0], yellow: Q[1], green: Q[2] });
    g.trafficLight({ x: 312, y: 177, size: 4.5, horizontal: true, red: Q[0], yellow: Q[1], green: Q[2] });
    g.trafficLight({ x: 213, y: 151, size: 4.5, red: Q[3], yellow: Q[4], green: Q[5] });
    g.trafficLight({ x: 312, y: 286, size: 4.5, red: Q[3], yellow: Q[4], green: Q[5] });
    smallPedHead(g, 179, 286, Q[6], Q[7]);
    smallPedHead(g, 179, 177, Q[6], Q[7]);

    // names and the loop input
    g.text('MAIN ROAD', 30, 188, { align: 'left', size: 10, weight: 700, color: c.dark ? '#8fa197' : '#5c6e5f', letterSpacing: 1 });
    g.text('SIDE ROAD', CX - SH - 16, 88, { align: 'right', size: 10, weight: 700, color: c.dark ? '#8fa197' : '#5c6e5f', letterSpacing: 1 });
    g.line(350, 112, CX - 4, CY - RH - 26, c.dark ? '#c4cbcd' : '#3a464b', 1, [3, 3]);
    g.roundRect(328, 90, 92, 40, 5, c.surface, c.line, 1);
    g.label('Car loops', 374, 101);
    g.addr('%IX0.2', 374, 117, { active: on });
  }

  function drawCar(g, car) {
    const ln = LANE[car.lane], ctx = g.ctx;
    const x = ln.x0 + ln.dx * car.s, y = ln.y0 + ln.dy * car.s;
    ctx.save();
    ctx.translate(x - ln.dx * CAR_L / 2, y - ln.dy * CAR_L / 2);
    ctx.rotate(Math.atan2(ln.dy, ln.dx));
    const hl = CAR_L / 2, hw = CAR_W / 2;
    g.roundRect(-hl + 1.5, -hw + 1.5, CAR_L, CAR_W, 4, 'rgba(0,0,0,0.22)');
    g.roundRect(-hl, -hw, CAR_L, CAR_W, 4, car.col, 'rgba(0,0,0,0.5)', 1);
    g.roundRect(-4, -hw + 2, 10, CAR_W - 4, 2, PLC.scenes.shade(car.col, 0.22));
    g.roundRect(6, -hw + 2, 4, CAR_W - 4, 1.5, '#1d2a33');
    g.roundRect(-9, -hw + 2.5, 3, CAR_W - 5, 1, '#1d2a33');
    if (car.brake) {
      g.roundRect(-hl - 0.5, -hw + 1, 2, 3.5, 0.5, '#ff3b30');
      g.roundRect(-hl - 0.5, hw - 4.5, 2, 3.5, 0.5, '#ff3b30');
    }
    ctx.restore();
  }

  function drawPed(g, p) {
    const ctx = g.ctx;
    const ang = p.state === 'cross' ? (p.side === 'N' ? Math.PI / 2 : -Math.PI / 2) : p.state === 'leave' ? Math.PI : 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.ellipse(0, 0, 3, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = p.col; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.restore();
    g.circle(p.x, p.y, 2.6, '#3a2a1e', 'rgba(255,255,255,0.35)', 0.6);
  }

  function smallPedHead(g, x, y, red, green) {
    const S = g.SIGNAL;
    g.roundRect(x, y, 30, 17, 4, '#1e2427', '#0b0e10', 1);
    if (red) g.circle(x + 8.5, y + 8.5, 8, PLC.scenes.hexA(S.red.on, 0.25));
    if (green) g.circle(x + 21.5, y + 8.5, 8, PLC.scenes.hexA(S.green.on, 0.25));
    pedFigure(g, x + 8.5, y + 8.5, 4.5, red ? S.red.on : S.red.off, false);
    pedFigure(g, x + 21.5, y + 8.5, 4.5, green ? S.green.on : S.green.off, true);
  }

  /** Signal head for the panel: one lens per output with its address chip. lenses: [color, on, addr, figure] */
  function bigHead(g, x, y, lenses) {
    const S = g.SIGNAL;
    g.roundRect(x, y, 28, lenses.length * 24 + 4, 5, '#1e2427', '#0b0e10', 1);
    lenses.forEach(([color, on, addr, fig], i) => {
      const cx = x + 14, cy = y + 14 + i * 24, sg = S[color];
      if (on) g.circle(cx, cy, 15, PLC.scenes.hexA(sg.on, 0.3));
      if (fig) {
        g.circle(cx, cy, 10, '#0f1315');
        pedFigure(g, cx, cy, 9, on ? sg.on : sg.off, fig === 'walk');
      } else {
        const grad = g.ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, 10);
        grad.addColorStop(0, on ? '#ffffff' : PLC.scenes.shade(sg.off, 0.3));
        grad.addColorStop(on ? 0.3 : 1, on ? sg.on : sg.off);
        if (on) grad.addColorStop(1, PLC.scenes.shade(sg.on, -0.15));
        g.circle(cx, cy, 10, grad);
      }
      g.addr(addr, x + 54, cy, { active: on });
    });
  }

  // little standing or walking figure for pedestrian lenses (r ≈ half height)
  function pedFigure(g, x, y, r, color, walking) {
    const ctx = g.ctx, k = r / 9;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineCap = 'round'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.arc(0, -6.2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    if (walking) {
      ctx.moveTo(0.5, -3.5); ctx.lineTo(-0.5, 2.5);
      ctx.moveTo(-0.5, 2.5); ctx.lineTo(-3.5, 7.5);
      ctx.moveTo(-0.5, 2.5); ctx.lineTo(3, 7.5);
      ctx.moveTo(0.3, -2.5); ctx.lineTo(-3, 1);
      ctx.moveTo(0.3, -2.5); ctx.lineTo(3.5, 0.5);
    } else {
      ctx.moveTo(0, -3.5); ctx.lineTo(0, 2.5);
      ctx.moveTo(-1.3, 2.5); ctx.lineTo(-1.3, 7.5);
      ctx.moveTo(1.3, 2.5); ctx.lineTo(1.3, 7.5);
      ctx.moveTo(-1.5, -3); ctx.lineTo(-3.2, 2);
      ctx.moveTo(1.5, -3); ctx.lineTo(3.2, 2);
    }
    ctx.stroke();
    ctx.restore();
  }
})(window.PLC = window.PLC || {});
