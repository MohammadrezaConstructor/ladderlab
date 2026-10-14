'use strict';
// Plant-model tests for the traffic, tank and conveyor scenes.
const test = require('node:test');
const assert = require('node:assert/strict');
const PLC = require('./load.js');

function sim(id) {
  const def = PLC.scenes.get(id);
  assert.ok(def, 'scene ' + id + ' is registered');
  const phys = PLC.newImage();
  const inst = def.create();
  inst.reset(phys);
  return { def, inst, phys, st: inst.state, t: 0 };
}
/** Step the plant for ms of simulated time; each(s) runs before every 10 ms step (to drive outputs or assert). */
function run(s, ms, each) {
  for (let i = 0; i < ms; i += 10) {
    if (each) each(s);
    s.inst.step(10, s.phys, s.t);
    s.t += 10;
  }
}
/** Step until cond(s) is true; returns the elapsed ms or -1 on timeout. */
function until(s, ms, cond, each) {
  for (let i = 0; i <= ms; i += 10) {
    if (cond(s)) return i;
    if (each) each(s);
    s.inst.step(10, s.phys, s.t);
    s.t += 10;
  }
  return -1;
}
const outs = (s, list) => { s.phys.Q.fill(false); for (const i of list) s.phys.Q[i] = true; };
const strip = tags => tags.map(t => ({ name: t.name, type: t.type, address: t.address, comment: t.comment }));
function checkDef(def, id, name, tags) {
  assert.equal(def.id, id);
  assert.equal(def.name, name);
  assert.equal(def.width, 640);
  assert.ok(def.height <= 440);
  assert.ok(typeof def.description === 'string' && def.description.length > 20);
  assert.deepEqual(strip(def.tags), tags);
  const inst = def.create();
  for (const k of ['reset', 'step', 'draw']) assert.equal(typeof inst[k], 'function');
  inst.reset(null); // must tolerate a missing process image
}

// ---- traffic ------------------------------------------------------------------
const TRAFFIC_TAGS = [
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
const MR = 0, MY = 1, MG = 2, SR = 3, SY = 4, SG = 5, PR = 6, PG = 7;

// cars of crossing roads must never be inside the junction box together
function noCrash(s) {
  const roads = new Set(s.st.cars.filter(c => {
    const vertical = c.lane === 'S' || c.lane === 'N';
    const along = c.lane === 'E' || c.lane === 'S' ? 1 : -1;
    // front position along the lane axis; the junction box spans ±32 (main) / ±28 (side) around the centre
    const len = 26, half = vertical ? 32 : 28, centre = vertical ? 240 : 270;
    const front = vertical ? (c.lane === 'S' ? 34 + c.s : 458 - c.s) : (c.lane === 'E' ? -18 + c.s : 466 - c.s);
    const rear = front - along * len;
    const lo = Math.min(front, rear), hi = Math.max(front, rear);
    return hi > centre - half && lo < centre + half;
  }).map(c => (c.lane === 'S' || c.lane === 'N' ? 'side' : 'main')));
  assert.ok(roads.size < 2, 'cars from both roads in the junction at t=' + s.t);
}

test('traffic: registration and tag contract', () => {
  checkDef(PLC.scenes.get('traffic'), 'traffic', 'Traffic Light', TRAFFIC_TAGS);
});

test('traffic: reset clears operator and loop inputs', () => {
  const s = sim('traffic');
  s.phys.I[0] = s.phys.I[1] = s.phys.I[2] = true;
  s.inst.reset(s.phys);
  assert.deepEqual(s.phys.I.slice(0, 3), [false, false, false]);
});

test('traffic: side-road car waits on the loop at red and leaves at green', () => {
  const s = sim('traffic');
  const t = until(s, 40000, x => x.phys.I[2], x => outs(x, [MR, SR, PR]));
  assert.ok(t >= 0, 'Side_Car never became TRUE');
  run(s, 5000, x => outs(x, [MR, SR, PR]));
  assert.equal(s.phys.I[2], true, 'car keeps waiting on the loop while red');
  assert.equal(s.st.count.side, 0, 'no side car passes a red light');
  assert.equal(s.st.count.main, 0, 'no main car passes a red light');
  const passed = s.st.count.side;
  assert.ok(until(s, 6000, x => !x.phys.I[2], x => outs(x, [MR, SG, PR])) >= 0, 'car left the loop on green');
  run(s, 3000, x => outs(x, [MR, SG, PR]));
  assert.ok(s.st.count.side > passed, 'side car drove through the junction');
});

test('traffic: main green lets main traffic pass and holds the side road', () => {
  const s = sim('traffic');
  run(s, 40000, x => { outs(x, [MG, SR, PR]); noCrash(x); });
  assert.ok(s.st.count.main >= 5, 'main cars passed: ' + s.st.count.main);
  assert.equal(s.st.count.side, 0);
  assert.equal(s.st.count.ped, 0, 'pedestrians wait at red');
  assert.ok(s.st.peds.some(p => p.state === 'wait'), 'someone is waiting to cross');
});

test('traffic: pedestrians cross only on the walk light and cars yield to them', () => {
  const s = sim('traffic');
  run(s, 30000, x => outs(x, [MR, SG, PG]));
  assert.ok(s.st.count.ped >= 1, 'pedestrians crossed: ' + s.st.count.ped);
  assert.equal(s.st.pedConflictT, 0, 'no warning while the main road is red');
  // walk light with main green: drivers wait for people on the crossing, and the scene flags it
  const s2 = sim('traffic');
  run(s2, 20000, x => outs(x, [MG, SR, PG]));
  assert.ok(s2.st.pedConflictT > 0, 'walk light during main green is flagged');
});

test('traffic: conflicting greens are flagged, but cars still never share the junction', () => {
  const s = sim('traffic');
  run(s, 40000, x => { outs(x, [MG, SG, PR]); noCrash(x); });
  assert.ok(s.st.conflictT > 0);
  assert.ok(s.st.count.main > 0 && s.st.count.side > 0);
  const ok = sim('traffic');
  run(ok, 2000, x => outs(x, [MY, SY, PR]));   // night-style double yellow is not a conflict
  assert.equal(ok.st.conflictT, 0);
});

test('traffic: dark or flashing junction — main road has priority, side road yields', () => {
  for (const flash of [false, true]) {
    const s = sim('traffic');
    run(s, 60000, x => {
      const on = flash && Math.floor(x.t / 500) % 2 === 0;
      outs(x, on ? [MY, SY] : []);
      noCrash(x);
    });
    assert.ok(s.st.count.main >= 8, 'main cars passed: ' + s.st.count.main);
    assert.ok(s.st.count.side >= 2, 'side cars passed: ' + s.st.count.side);
    assert.equal(s.st.conflictT, 0);
  }
});

test('traffic: deterministic', () => {
  const a = sim('traffic'), b = sim('traffic');
  const drive = x => outs(x, Math.floor(x.t / 8000) % 2 ? [MR, SG, PG] : [MG, SR, PR]);
  run(a, 30000, drive); run(b, 30000, drive);
  assert.equal(JSON.stringify(a.st.cars), JSON.stringify(b.st.cars));
  assert.equal(JSON.stringify(a.st.peds), JSON.stringify(b.st.peds));
  a.inst.reset(a.phys);
  a.t = 0;
  run(a, 30000, drive);
  assert.equal(JSON.stringify(a.st.cars), JSON.stringify(b.st.cars), 'reset restores the initial state');
});

// ---- tank ---------------------------------------------------------------------
const TANK_TAGS = [
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

test('tank: registration and tag contract', () => {
  checkDef(PLC.scenes.get('tank'), 'tank', 'Tank Level Control', TANK_TAGS);
});

test('tank: reset sets the NC stop button and the sensors', () => {
  const s = sim('tank');
  assert.equal(s.phys.I[3], true, 'Stop (NC) is TRUE when not pressed');
  assert.equal(s.phys.I[0], false);
  assert.equal(s.phys.I[1], false);
  assert.equal(s.phys.IW[0], 100, 'starts at 10 %');
});

test('tank: pump fills to the high switch, drain valve empties', () => {
  const s = sim('tank');
  let last = s.phys.IW[0];
  const tLow = until(s, 16000, x => x.phys.I[0], x => outs(x, [0]));
  assert.ok(tLow > 0, 'low switch covered');
  const tHigh = until(s, 16000, x => x.phys.I[1], x => {
    outs(x, [0]);
    assert.ok(x.phys.IW[0] >= last, 'level rises'); last = x.phys.IW[0];
  });
  assert.ok(tHigh > 0 && tLow + tHigh <= 16000, 'high switch within 16 s');
  assert.ok(s.phys.IW[0] >= 800 && s.phys.IW[0] <= 810);
  run(s, 5000, x => outs(x, [1]));
  assert.ok(Math.abs(s.phys.IW[0] - 600) <= 10, 'drain at 4 %/s: ' + s.phys.IW[0]);
  assert.equal(s.phys.I[1], false);
  run(s, 20000, x => outs(x, [1]));
  assert.equal(s.phys.IW[0], 0, 'empties completely, never negative');
  assert.equal(s.phys.I[0], false);
});

test('tank: consumer disturbance drains up to 3 %/s', () => {
  const s = sim('tank');
  run(s, 10000, x => outs(x, [0]));          // to 60 %
  s.st.consumer = 1;
  run(s, 10000, x => outs(x, []));
  assert.ok(Math.abs(s.phys.IW[0] - 300) <= 10, 'level ' + s.phys.IW[0]);
});

test('tank: overflow and dry-running mixer are detected', () => {
  const s = sim('tank');
  run(s, 1000, x => outs(x, [2]));
  assert.equal(s.st.dry, true, 'mixer below the low switch runs dry');
  run(s, 25000, x => outs(x, [0]));
  assert.equal(s.phys.IW[0], 1000);
  assert.ok(s.st.overflowT > 0 && s.st.spill > 0, 'overflow flagged');
  run(s, 3000, x => outs(x, [2]));
  assert.equal(s.st.overflowT, 0, 'overflow clears once the pump stops');
  assert.equal(s.st.dry, false);
  s.inst.reset(s.phys);
  assert.equal(s.st.spill, 0);
  assert.equal(s.phys.IW[0], 100);
});

// ---- conveyor -----------------------------------------------------------------
const CONVEYOR_TAGS = [
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
const BELT = 0, PUSH = 1, FEED = 2;

test('conveyor: registration and tag contract', () => {
  checkDef(PLC.scenes.get('conveyor'), 'conveyor', 'Conveyor Sorting', CONVEYOR_TAGS);
});

test('conveyor: reset sets NC stop, pusher home and clear sensors', () => {
  const s = sim('conveyor');
  assert.deepEqual(s.phys.I.slice(0, 7), [false, true, false, false, false, true, false]);
});

test('conveyor: feeder drops one box per rising edge, only on a free entry', () => {
  const s = sim('conveyor');
  run(s, 500, x => outs(x, [FEED]));
  assert.equal(s.st.boxes.length, 1, 'holding the feeder output drops a single box');
  run(s, 20, x => outs(x, []));
  run(s, 20, x => outs(x, [FEED]));
  assert.equal(s.st.boxes.length, 1, 'entry occupied: second edge ignored');
  run(s, 2000, x => outs(x, [BELT]));
  run(s, 20, x => outs(x, [BELT, FEED]));
  assert.equal(s.st.boxes.length, 2);
});

test('conveyor: a small box passes entry, then exit, and lands in the SMALL bin', () => {
  const s = sim('conveyor');
  s.inst.drop('small');
  let tall = false;
  const tEntry = until(s, 3000, x => x.phys.I[2], x => outs(x, [BELT]));
  assert.ok(tEntry > 0, 'entry eye');
  assert.equal(s.phys.I[4], false);
  const tExit = until(s, 8000, x => x.phys.I[4], x => { outs(x, [BELT]); tall = tall || x.phys.I[3]; });
  assert.ok(tExit > 0, 'exit eye after entry');
  assert.equal(s.phys.I[2], false);
  run(s, 2000, x => { outs(x, [BELT]); tall = tall || x.phys.I[3]; });
  assert.equal(tall, false, 'a small box does not break the height beam');
  assert.equal(s.st.bins.small.ok, 1);
  assert.equal(s.st.boxes.length, 0);
});

test('conveyor: belt off keeps boxes still', () => {
  const s = sim('conveyor');
  s.inst.drop('small');
  run(s, 1000, x => outs(x, [BELT]));
  const u = s.st.boxes[0].u;
  run(s, 2000, x => outs(x, []));
  assert.equal(s.st.boxes[0].u, u);
});

test('conveyor: pusher sorts a tall box into the TALL bin', () => {
  const s = sim('conveyor');
  s.inst.drop('tall');
  assert.ok(until(s, 6000, x => x.phys.I[3], x => outs(x, [BELT])) > 0, 'height eye sees the tall box');
  assert.ok(until(s, 2000, x => !x.phys.I[3], x => outs(x, [BELT])) > 0, 'box passes the height eye');
  const tOut = until(s, 1000, x => x.phys.I[6], x => outs(x, [BELT, PUSH]));
  assert.ok(tOut >= 350 && tOut <= 450, 'Pusher_Out after about 0.4 s: ' + tOut);
  assert.equal(s.phys.I[5], false, 'not home while out');
  run(s, 600, x => outs(x, [BELT, PUSH]));
  assert.equal(s.st.bins.tall.ok, 1, 'box in TALL bin');
  assert.equal(s.st.jamT, 0, 'no edge hit');
  assert.ok(until(s, 1000, x => x.phys.I[5], x => outs(x, [BELT])) > 0, 'retracts home');
});

test('conveyor: a small box pushed off is counted as wrong; a tall box at the end too', () => {
  const s = sim('conveyor');
  s.inst.drop('small');
  // wait until the box is centred in front of the pusher (u ≈ 249), then push with the belt stopped
  until(s, 6000, x => x.st.boxes[0].u >= 249, x => outs(x, [BELT]));
  run(s, 1200, x => outs(x, [PUSH]));
  assert.equal(s.st.bins.tall.bad, 1);
  const t = sim('conveyor');
  t.inst.drop('tall');
  run(t, 10000, x => outs(x, [BELT]));
  assert.equal(t.st.bins.small.bad, 1);
});

test('conveyor: pusher hitting a box edge stalls and is flagged', () => {
  const s = sim('conveyor');
  s.inst.drop('tall');
  until(s, 6000, x => x.st.boxes[0].u >= 222, x => outs(x, [BELT]));   // box only partly in front of the pusher
  run(s, 1000, x => outs(x, [PUSH]));
  assert.ok(s.st.jamT > 0, 'edge hit flagged');
  assert.equal(s.phys.I[6], false, 'pusher cannot reach its end position');
  assert.equal(s.phys.I[5], false);
  run(s, 1000, x => outs(x, []));
  assert.equal(s.phys.I[5], true, 'retracts again');
  assert.equal(s.st.boxes.length, 1, 'box stays on the belt');
});

test('conveyor: boxes queue without overlapping behind an extended pusher', () => {
  const s = sim('conveyor');
  run(s, 30000, x => {
    outs(x, x.t < 300 ? [] : [BELT, PUSH]);        // pusher out across the belt the whole time
    if (x.t % 1200 === 0) x.inst.drop(x.t % 2400 ? 'tall' : 'small');
    const line = x.st.boxes.filter(b => b.state === 'belt' || b.state === 'pushed').sort((a, b) => a.u - b.u);
    for (let i = 1; i < line.length; i++) assert.ok(line[i].u - line[i - 1].u >= 30, 'boxes overlap at t=' + x.t);
  });
  const line = s.st.boxes.filter(b => b.state === 'belt');
  assert.ok(line.length >= 4, 'a queue formed: ' + line.length);
  assert.ok(line.every(b => b.u + 30 <= 242), 'all boxes wait in front of the pusher');
  assert.equal(s.st.bins.small.ok + s.st.bins.small.bad + s.st.bins.tall.ok + s.st.bins.tall.bad, 0);
});

test('conveyor: auto feed and feeder use a seeded generator (deterministic)', () => {
  const a = sim('conveyor'), b = sim('conveyor');
  for (const x of [a, b]) { x.st.auto = true; run(x, 30000, y => outs(y, [BELT])); }
  assert.ok(a.st.bins.small.ok + a.st.bins.small.bad >= 5, 'auto feed keeps boxes coming');
  assert.deepEqual(a.st.bins, b.st.bins);
});

// ---- end to end: a student program drives the plant through the PLC runtime ---------------
function boot(id, source, extra) {
  const def = PLC.scenes.get(id);
  const tags = def.tags.map(t => ({ name: t.name, type: t.type, address: t.address })).concat(extra || []);
  const p = PLC.project.normalize({ name: id, tags, pous: [{ name: 'Logic', lang: 'ST', source }] });
  const c = PLC.compiler.compileProject(p);
  assert.deepEqual(c.diagnostics.filter(d => d.severity === 'error'), []);
  const rt = new PLC.Runtime();
  rt.load(c);
  const inst = def.create();
  rt.scene = inst;
  inst.reset(rt.phys);
  assert.ok(rt.run());
  return { rt, inst };
}

test('end to end: two-point level control keeps the tank between the switches', () => {
  const { rt } = boot('tank', 'IF NOT Level_Low THEN Pump := TRUE; ELSIF Level_High THEN Pump := FALSE; END_IF;\nDrain_Valve := TRUE;\nDisplay := Level / 10;');
  let min = 1000, max = 0;
  for (let i = 0; i < 6000; i++) {
    rt.scan();
    if (i > 2000) { min = Math.min(min, rt.phys.IW[0]); max = Math.max(max, rt.phys.IW[0]); }
  }
  assert.ok(min >= 190 && max <= 810, 'level stays between the switches: ' + min + '..' + max);
  assert.equal(rt.phys.QW[0], Math.trunc(rt.phys.IW[0] / 10), 'display shows the level in %');
});

test('end to end: sorting program puts every box in the right bin', () => {
  const { rt, inst } = boot('conveyor', [
    'Conveyor := Stop; Lamp_Run := Conveyor;',
    'IF Sensor_Tall THEN Armed := TRUE; END_IF;',
    'IF Armed AND NOT Sensor_Tall THEN Pusher := TRUE; Armed := FALSE; END_IF;',
    'IF Pusher_Out THEN Pusher := FALSE; END_IF;'
  ].join('\n'), [{ name: 'Armed', type: 'BOOL' }]);
  inst.state.auto = true;
  for (let i = 0; i < 6000; i++) rt.scan();
  const b = inst.state.bins;
  assert.ok(b.tall.ok >= 3 && b.small.ok >= 3, JSON.stringify(b));
  assert.equal(b.tall.bad + b.small.bad, 0, JSON.stringify(b));
});
