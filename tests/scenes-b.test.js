'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PLC = require('./load.js');

// ---- helpers -----------------------------------------------------------------
/** Canvas 2D context stand-in: every method is a no-op, gradients accept colour stops. */
function stubCtx() {
  const grad = { addColorStop() {} };
  const o = { measureText: s => ({ width: String(s).length * 6 }), createRadialGradient: () => grad, createLinearGradient: () => grad };
  return new Proxy(o, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
}

function setup(id) {
  const def = PLC.scenes.get(id);
  assert.ok(def, 'scene ' + id + ' is registered');
  const inst = def.create();
  const phys = PLC.newImage();
  inst.reset(phys);
  let now = 0;
  const run = (ms) => { for (let t = 0; t < ms; t += 10) { inst.step(10, phys, now); now += 10; } };
  /** Run until fn() is true; returns the elapsed ms or -1 on timeout. */
  const until = (fn, maxMs) => { for (let t = 0; t <= maxMs; t += 10) { if (fn()) return t; inst.step(10, phys, now); now += 10; } return -1; };
  const render = (dark) => {
    const hits = [];
    const g = new PLC.scenes.Graphics(stubCtx(), Object.assign({}, PLC.scenes.DEFAULT_COLORS, { dark: !!dark }), now, hits);
    g.W = def.width; g.H = def.height; g.names = {};
    inst.draw(g, phys);
    return hits;
  };
  const control = (label) => {
    const h = render().find(x => x.label === label);
    assert.ok(h, 'scene control "' + label + '" is drawn');
    return h;
  };
  const click = (label) => control(label).click({ x: 0, y: 0 });
  const hold = (label, v) => { const h = control(label); if (v) h.down({ x: 0, y: 0 }); else h.up(); };
  return { def, inst, phys, run, until, render, click, hold };
}

function checkContract(id, name, tags) {
  const { def } = setup(id);
  assert.equal(def.name, name);
  assert.equal(def.width, 640);
  assert.ok(def.height <= 440, 'height <= 440');
  assert.equal(typeof def.description, 'string');
  assert.deepEqual(def.tags.map(t => [t.name, t.type, t.address, t.comment]), tags);
  for (const t of def.tags) assert.ok(PLC.types.parseAddress(t.address), 'valid address ' + t.address);
}

// ---- garage ---------------------------------------------------------------------
test('garage: registration and tag contract', () => {
  checkContract('garage', 'Garage Door', [
    ['Btn_Open', 'BOOL', '%IX0.0', 'Open push button (NO)'],
    ['Btn_Close', 'BOOL', '%IX0.1', 'Close push button (NO)'],
    ['Btn_Stop', 'BOOL', '%IX0.2', 'Stop push button (NC: TRUE when not pressed)'],
    ['Limit_Open', 'BOOL', '%IX0.3', 'Upper limit switch (TRUE when the door is fully open)'],
    ['Limit_Closed', 'BOOL', '%IX0.4', 'Lower limit switch (TRUE when the door is fully closed)'],
    ['Photo_Eye', 'BOOL', '%IX0.5', 'Safety light barrier (TRUE while the beam is clear)'],
    ['Remote', 'BOOL', '%IX0.6', 'Remote control button (NO)'],
    ['Motor_Up', 'BOOL', '%QX0.0', 'Door motor: open'],
    ['Motor_Down', 'BOOL', '%QX0.1', 'Door motor: close'],
    ['Warning_Light', 'BOOL', '%QX0.2', 'Flashing warning lamp'],
    ['Courtesy_Light', 'BOOL', '%QX0.3', 'Garage ceiling light']
  ]);
});

test('garage: reset sets NC button and sensors', () => {
  const { phys, inst } = setup('garage');
  phys.I.fill(false); phys.I[3] = true;
  inst.reset(phys);
  assert.deepEqual(phys.I.slice(0, 7), [false, false, true, false, true, true, false]);
});

test('garage: door travel, limit switches and end-stop warning', () => {
  const { phys, inst, run } = setup('garage');
  phys.Q[0] = true;
  run(4000);
  assert.equal(phys.I[3], false); assert.equal(phys.I[4], false);
  assert.ok(Math.abs(inst.info().pos - 0.5) < 0.01, 'half open after 4 s');
  run(5000);
  assert.equal(phys.I[3], true, 'Limit_Open after 9 s');
  assert.equal(phys.I[4], false, 'Limit_Closed released');
  assert.equal(inst.info().endWarn, false, 'no warning within 1.5 s at the stop');
  run(700);
  assert.equal(inst.info().endWarn, true, 'pushing against the upper stop for > 1.5 s is reported');
  phys.Q[0] = false;
  run(2000);
  assert.equal(inst.info().endWarn, false);
  phys.Q[1] = true;
  run(7900);
  assert.equal(phys.I[4], false, 'not closed before 8 s');
  run(200);
  assert.equal(phys.I[4], true); assert.equal(phys.I[3], false);
});

test('garage: Motor_Up and Motor_Down together do not move the door', () => {
  const { phys, inst, run } = setup('garage');
  phys.Q[0] = true; run(2000);
  const p = inst.info().pos;
  phys.Q[1] = true; run(2000);
  assert.equal(inst.info().pos, p);
  assert.equal(inst.info().both, true);
});

test('garage: car in the doorway blocks the light barrier and stops the closing door', () => {
  const { phys, inst, run, click } = setup('garage');
  click('Car in doorway');
  run(10);
  assert.equal(inst.info().car, false, 'no car while the door is closed');
  phys.Q[0] = true; run(5000); phys.Q[0] = false;
  click('Car in doorway');
  run(10);
  assert.equal(phys.I[5], false, 'Photo_Eye FALSE while the car interrupts the beam');
  phys.Q[1] = true; run(8000);
  const info = inst.info();
  assert.equal(info.hit, true, 'door hit the car');
  assert.ok(info.pos > 0.3, 'door rests on the car roof');
  assert.equal(phys.I[4], false);
  click('Clear');
  run(10);
  assert.equal(inst.info().hit, true, 'fault comes back while the door is still pushing on the car');
  phys.Q[1] = false; click('Clear'); run(10);
  assert.equal(inst.info().hit, false);
  click('Car in doorway'); run(10);
  assert.equal(phys.I[5], true, 'beam clear again');
});

test('garage: operator controls write their inputs', () => {
  const { phys, hold } = setup('garage');
  hold('Stop', true); assert.equal(phys.I[2], false);
  hold('Stop', false); assert.equal(phys.I[2], true);
  hold('Open', true); assert.equal(phys.I[0], true);
  hold('Open', false); assert.equal(phys.I[0], false);
  hold('Close', true); assert.equal(phys.I[1], true);
  hold('Close', false);
  hold('Remote', true); assert.equal(phys.I[6], true);
  hold('Remote', false); assert.equal(phys.I[6], false);
});

// ---- pneumatic press ---------------------------------------------------------------
test('cylinders: registration and tag contract', () => {
  checkContract('cylinders', 'Pneumatic Press', [
    ['Start', 'BOOL', '%IX0.0', 'Start push button (NO)'],
    ['Stop', 'BOOL', '%IX0.1', 'Stop push button (NC: TRUE when not pressed)'],
    ['A_Retracted', 'BOOL', '%IX0.2', 'Cylinder A retracted (reed switch a0)'],
    ['A_Extended', 'BOOL', '%IX0.3', 'Cylinder A extended (reed switch a1)'],
    ['B_Retracted', 'BOOL', '%IX0.4', 'Cylinder B retracted (reed switch b0)'],
    ['B_Extended', 'BOOL', '%IX0.5', 'Cylinder B extended (reed switch b1)'],
    ['Part_Present', 'BOOL', '%IX0.6', 'Sensor: a part is in the fixture'],
    ['A_Extend', 'BOOL', '%QX0.0', 'Valve solenoid Y1: extend clamp cylinder A (spring return)'],
    ['B_Extend', 'BOOL', '%QX0.1', 'Valve solenoid Y2: extend press cylinder B (spring return)'],
    ['Lamp_Cycle', 'BOOL', '%QX0.2', 'Cycle running lamp']
  ]);
});

test('cylinders: reset sets NC stop and reed switches', () => {
  const { phys, inst } = setup('cylinders');
  phys.I.fill(true);
  inst.reset(phys);
  assert.deepEqual(phys.I.slice(0, 7), [false, true, true, false, true, false, false]);
});

test('cylinders: stroke times and reed switches', () => {
  const { phys, run } = setup('cylinders');
  phys.Q[0] = true;
  run(20);
  assert.equal(phys.I[2], false, 'a0 opens as soon as A moves');
  run(700);
  assert.equal(phys.I[3], false, 'A not yet extended');
  run(100);
  assert.equal(phys.I[3], true, 'A_Extended after ~0.8 s');
  assert.equal(phys.I[2], false);
  phys.Q[0] = false; run(820);
  assert.equal(phys.I[2], true); assert.equal(phys.I[3], false);
  phys.Q[1] = true; run(900);
  assert.equal(phys.I[5], false, 'B not yet extended');
  run(120);
  assert.equal(phys.I[5], true); assert.equal(phys.I[4], false);
});

test('cylinders: full A+ B+ B- A- cycle produces one good part', () => {
  const { phys, inst, run, until, click } = setup('cylinders');
  click('Insert part');
  run(400);
  assert.equal(phys.I[6], true, 'Part_Present');
  phys.Q[0] = true; assert.ok(until(() => phys.I[3], 1000) >= 0);
  phys.Q[1] = true; assert.ok(until(() => phys.I[5], 1200) >= 0);
  assert.equal(inst.info().part, 'pressed');
  phys.Q[1] = false; assert.ok(until(() => phys.I[4], 1200) >= 0);
  phys.Q[0] = false; assert.ok(until(() => phys.I[2], 1000) >= 0);
  run(20);
  const info = inst.info();
  assert.equal(info.good, 1); assert.equal(info.scrap, 0); assert.equal(info.fault, false);
  assert.equal(phys.I[6], false, 'finished part removed');
});

test('cylinders: pressing an unclamped part makes scrap, pressing nothing warns', () => {
  const { phys, inst, run, click } = setup('cylinders');
  phys.Q[1] = true; run(1100);
  assert.equal(inst.info().noPart, true, 'pressed with no part');
  phys.Q[1] = false; run(1100);
  click('Insert part'); run(400);
  click('Insert part'); run(10);
  assert.equal(inst.info().part, 'raw', 'a second part is refused');
  phys.Q[1] = true; run(1100);
  let info = inst.info();
  assert.equal(info.scrap, 1); assert.equal(info.fault, true); assert.equal(info.good, 0);
  phys.Q[1] = false; run(1100);
  assert.equal(phys.I[6], true, 'scrap part stays until it is removed');
  click('Remove scrap'); run(20);
  info = inst.info();
  assert.equal(info.fault, false); assert.equal(phys.I[6], false);
});

test('cylinders: auto insert loads a new part about 1 s after the last one left', () => {
  const { phys, inst, run, until, click } = setup('cylinders');
  click('Auto insert');
  run(400);
  assert.equal(phys.I[6], true);
  phys.Q[0] = true; run(900); phys.Q[1] = true; run(1100);
  phys.Q[1] = false; run(1100); phys.Q[0] = false; run(900);
  assert.equal(inst.info().good, 1);
  assert.equal(phys.I[6], false);
  const t = until(() => phys.I[6], 4000);
  assert.ok(t >= 2000 && t <= 3000, 'slide-out + 1 s + drop, took ' + t + ' ms');
});

test('cylinders: operator buttons write their inputs', () => {
  const { phys, hold } = setup('cylinders');
  hold('Stop', true); assert.equal(phys.I[1], false);
  hold('Stop', false); assert.equal(phys.I[1], true);
  hold('Start', true); assert.equal(phys.I[0], true);
  hold('Start', false); assert.equal(phys.I[0], false);
});

// ---- parking ------------------------------------------------------------------------
test('parking: registration and tag contract', () => {
  checkContract('parking', 'Parking Garage', [
    ['Entry_Sensor', 'BOOL', '%IX0.0', 'Induction loop in front of the entry barrier (TRUE while a car is on it)'],
    ['Exit_Sensor', 'BOOL', '%IX0.1', 'Induction loop in front of the exit barrier (TRUE while a car is on it)'],
    ['Reset', 'BOOL', '%IX0.2', 'Attendant reset key (NO)'],
    ['Entry_Gate', 'BOOL', '%QX0.0', 'Entry barrier (TRUE = open)'],
    ['Exit_Gate', 'BOOL', '%QX0.1', 'Exit barrier (TRUE = open)'],
    ['Full_Lamp', 'BOOL', '%QX0.2', 'Red FULL sign'],
    ['Free_Lamp', 'BOOL', '%QX0.3', 'Green FREE sign'],
    ['Free_Spaces', 'INT', '%QW0', 'Display: number of free spaces']
  ]);
});

test('parking: a car enters through the entry barrier and parks', () => {
  const { phys, inst, run, until, click } = setup('parking');
  assert.deepEqual(phys.I.slice(0, 3), [false, false, false]);
  click('Car arrives');
  assert.ok(until(() => phys.I[0], 5000) >= 0, 'Entry_Sensor TRUE when the car is on the loop');
  run(3000);
  assert.equal(phys.I[0], true, 'car keeps waiting at the closed barrier');
  assert.equal(inst.info().inside, 0);
  phys.Q[0] = true;
  assert.ok(until(() => !phys.I[0], 4000) >= 0, 'car leaves the loop');
  assert.ok(until(() => inst.info().parked === 1, 10000) >= 0, 'car parks');
  phys.Q[0] = false; run(1000);
  assert.equal(inst.info().hit, false);
});

test('parking: a car leaves through the exit barrier', () => {
  const { phys, inst, run, until, click } = setup('parking');
  phys.Q[0] = true;
  click('Car arrives');
  assert.ok(until(() => inst.info().parked === 1, 15000) >= 0);
  phys.Q[0] = false; run(1000);
  click('Car leaves');
  assert.ok(until(() => phys.I[1], 15000) >= 0, 'Exit_Sensor TRUE');
  assert.equal(inst.info().parked, 0);
  run(2000);
  assert.equal(phys.I[1], true, 'waits at the closed exit barrier');
  phys.Q[1] = true;
  assert.ok(until(() => !phys.I[1], 4000) >= 0);
  assert.ok(until(() => inst.info().cars === 0, 10000) >= 0, 'car drives away');
  phys.Q[1] = false; run(1000);
  assert.equal(inst.info().hit, false);
});

test('parking: closing the barrier onto a car is a fault', () => {
  const { phys, inst, until, click } = setup('parking');
  click('Car arrives');
  assert.ok(until(() => phys.I[0], 5000) >= 0);
  phys.Q[0] = true;
  assert.ok(until(() => inst.info().bar[0] >= 1, 2000) >= 0);
  until(() => false, 500);
  phys.Q[0] = false;
  assert.ok(until(() => inst.info().hit, 2000) >= 0, 'barrier hit the car');
  click('Clear');
  assert.equal(inst.info().hit, false);
});

test('parking: the ninth car finds no space', () => {
  const { phys, inst, until, click } = setup('parking');
  phys.Q[0] = true;
  for (let i = 0; i < 6; i++) click('Car arrives');
  assert.ok(until(() => inst.info().parked === 6, 60000) >= 0);
  for (let i = 0; i < 3; i++) click('Car arrives');
  assert.ok(until(() => inst.info().overfill, 60000) >= 0, 'overfill reported');
  assert.ok(until(() => inst.info().parked === 8, 20000) >= 0);
  const info = inst.info();
  assert.equal(info.overfill, true, 'ninth car still waits');
  assert.equal(info.parked, 8); assert.equal(info.inside, 9);
});

test('parking: auto traffic is deterministic', () => {
  const runAuto = () => {
    const s = setup('parking');
    s.phys.Q[0] = true; s.phys.Q[1] = true;
    s.click('Auto traffic');
    s.run(180000);
    return JSON.stringify(s.inst.info());
  };
  const a = runAuto();
  assert.equal(a, runAuto());
  assert.ok(JSON.parse(a).inside > 0, 'cars came in');
});

test('parking: reset key is momentary', () => {
  const { phys, hold } = setup('parking');
  hold('Reset key', true); assert.equal(phys.I[2], true);
  hold('Reset key', false); assert.equal(phys.I[2], false);
});

// ---- all three: drawing smoke test ------------------------------------------------------
test('scenes draw in every state without errors (light and dark)', () => {
  for (const id of ['garage', 'cylinders', 'parking']) {
    const s = setup(id);
    for (let k = 0; k < 40; k++) {
      for (let i = 0; i < 4; i++) s.phys.Q[i] = ((k >> i) & 1) === 1;
      s.phys.QW[0] = k * 7 - 20;
      s.run(500);
      for (const h of s.render(k % 2 === 1)) if (h.click && k % 7 === 0) h.click({ x: 0, y: 0 });
    }
  }
});
