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
  const has = (label) => render().some(x => x.label === label);
  const click = (label) => control(label).click({ x: 0, y: 0 });
  const hold = (label, v) => { const h = control(label); if (v) h.down({ x: 0, y: 0 }); else h.up(); };
  return { def, inst, phys, run, until, render, click, hold, has };
}

// process image indices
const CALL = [0, 1, 2], AT = [3, 4, 5], OPEN = 6, CLOSED = 7, CLEAR = 8, ESTOP = 9;
const UP = 0, DOWN = 1, D_OPEN = 2, D_CLOSE = 3;

// ---- elevator --------------------------------------------------------------------
test('elevator: registration and tag contract', () => {
  const { def } = setup('elevator');
  assert.equal(def.name, 'Elevator');
  assert.equal(def.width, 640);
  assert.ok(def.height <= 440, 'height <= 440');
  assert.equal(typeof def.description, 'string');
  assert.deepEqual(def.tags.map(t => [t.name, t.type, t.address, t.comment]), [
    ['Call_0', 'BOOL', '%IX0.0', 'Call button, ground floor (NO)'],
    ['Call_1', 'BOOL', '%IX0.1', 'Call button, floor 1 (NO)'],
    ['Call_2', 'BOOL', '%IX0.2', 'Call button, floor 2 (NO)'],
    ['At_0', 'BOOL', '%IX0.3', 'Floor sensor: cabin level with the ground floor'],
    ['At_1', 'BOOL', '%IX0.4', 'Floor sensor: cabin level with floor 1'],
    ['At_2', 'BOOL', '%IX0.5', 'Floor sensor: cabin level with floor 2'],
    ['Door_Is_Open', 'BOOL', '%IX0.6', 'Door limit switch: fully open'],
    ['Door_Is_Closed', 'BOOL', '%IX0.7', 'Door limit switch: fully closed'],
    ['Door_Clear', 'BOOL', '%IX1.0', 'Door light curtain (TRUE while the doorway is clear)'],
    ['E_Stop', 'BOOL', '%IX1.1', 'Emergency stop (NC: TRUE when not pressed)'],
    ['Motor_Up', 'BOOL', '%QX0.0', 'Hoist motor: up'],
    ['Motor_Down', 'BOOL', '%QX0.1', 'Hoist motor: down'],
    ['Door_Open', 'BOOL', '%QX0.2', 'Door motor: open'],
    ['Door_Close', 'BOOL', '%QX0.3', 'Door motor: close'],
    ['Lamp_Call_0', 'BOOL', '%QX0.4', 'Call acknowledged lamp, ground floor'],
    ['Lamp_Call_1', 'BOOL', '%QX0.5', 'Call acknowledged lamp, floor 1'],
    ['Lamp_Call_2', 'BOOL', '%QX0.6', 'Call acknowledged lamp, floor 2'],
    ['Floor_Display', 'INT', '%QW0', 'Floor indicator (0, 1, 2)']
  ]);
  for (const t of def.tags) {
    const a = PLC.types.parseAddress(t.address);
    assert.ok(a, 'valid address ' + t.address);
  }
  // the indices used by the tests match the addresses
  assert.equal(PLC.types.parseAddress('%IX1.0').index, CLEAR);
  assert.equal(PLC.types.parseAddress('%IX1.1').index, ESTOP);
});

test('elevator: reset puts the cabin at floor 0 with the door closed (also with phys = null)', () => {
  const { phys, inst, run } = setup('elevator');
  assert.doesNotThrow(() => inst.reset(null));
  phys.Q[UP] = true; run(1500); phys.Q[UP] = false;
  phys.I.fill(true);
  inst.reset(phys);
  assert.deepEqual(phys.I.slice(0, 10), [false, false, false, true, false, false, false, true, true, true]);
  const info = inst.info();
  assert.equal(info.pos, 0); assert.equal(info.door, 0); assert.equal(info.level, 0);
  assert.equal(info.pass, false); assert.equal(info.crash, null); assert.equal(info.estop, false);
});

test('elevator: 3 s between floors at constant speed, sensors only near the level', () => {
  const { phys, inst, run, until } = setup('elevator');
  phys.Q[UP] = true;
  run(150);
  assert.equal(phys.I[AT[0]], false, 'At_0 drops once the cabin has left the floor window');
  run(1350);
  assert.ok(Math.abs(inst.info().pos - 0.5) < 0.01, 'half way after 1.5 s');
  assert.equal(phys.I[AT[0]] || phys.I[AT[1]] || phys.I[AT[2]], false, 'no sensor between floors');
  const t = until(() => phys.I[AT[1]], 3000);
  assert.ok(t >= 1300 && t <= 1500, 'At_1 comes on shortly before the level, took ' + (1500 + t) + ' ms');
  phys.Q[UP] = false; run(500);
  assert.equal(phys.I[AT[1]], true, 'stopping at the first TRUE scan keeps the sensor TRUE');
  assert.equal(inst.info().level, 1);
  // floor 1 -> 2 takes 3 s, the sensor window is passed in less than 0.25 s
  phys.Q[UP] = true;
  const t2 = until(() => phys.I[AT[2]], 4000);
  assert.ok(t2 >= 2700 && t2 <= 3000, 'floor 1 -> 2 in about 3 s, took ' + t2);
  phys.Q[UP] = false;
  phys.Q[DOWN] = true;
  const t3 = until(() => phys.I[AT[1]], 7000);
  assert.ok(t3 >= 2700 && t3 <= 3100, 'down again in about 3 s, took ' + t3);
  const passed = until(() => !phys.I[AT[1]], 1000);
  assert.ok(passed > 0 && passed <= 250, 'passing a floor at speed: sensor on for a short moment only (' + passed + ' ms)');
  assert.equal(inst.info().faults.crash, 0);
});

test('elevator: door takes 1.5 s each way and drives its limit switches', () => {
  const { phys, inst, run, until } = setup('elevator');
  phys.Q[D_OPEN] = true;
  run(20);
  assert.equal(phys.I[CLOSED], false, 'Door_Is_Closed drops as soon as the door moves');
  assert.equal(phys.I[OPEN], false);
  const t = until(() => phys.I[OPEN], 3000);
  assert.ok(t >= 1400 && t <= 1500, 'open after about 1.5 s, took ' + (t + 20));
  run(500);
  assert.equal(inst.info().door, 1, 'door stays at the open end stop');
  phys.Q[D_OPEN] = false; phys.Q[D_CLOSE] = true;
  run(20);
  assert.equal(phys.I[OPEN], false);
  assert.ok(until(() => phys.I[CLOSED], 2000) >= 1400, 'closed after about 1.5 s');
  const f = inst.info().faults;
  assert.equal(f.offLevel + f.moveOpen + f.hit, 0, 'opening at a floor is no fault');
});

test('elevator: moving with the door not fully closed is a fault', () => {
  const { phys, inst, run } = setup('elevator');
  phys.Q[D_OPEN] = true; run(300); phys.Q[D_OPEN] = false;
  phys.Q[UP] = true; run(300);
  const info = inst.info();
  assert.equal(info.moveOpen, true, 'banner shown');
  assert.equal(info.faults.moveOpen, 1);
  assert.ok(info.pos > 0.05, 'the cabin really moves (that is the danger)');
  phys.Q[UP] = false; run(3000);
  assert.equal(inst.info().moveOpen, false, 'banner goes away after a while');
});

test('elevator: opening the door between floors is a fault', () => {
  const { phys, inst, run } = setup('elevator');
  phys.Q[UP] = true; run(1500); phys.Q[UP] = false;
  phys.Q[D_OPEN] = true; run(200);
  const info = inst.info();
  assert.equal(info.offLevel, true);
  assert.equal(info.faults.offLevel, 1);
  assert.equal(info.faults.moveOpen, 0);
});

test('elevator: both hoist directions or both door directions at once do nothing and are reported', () => {
  const { phys, inst, run } = setup('elevator');
  phys.Q[UP] = true; phys.Q[DOWN] = true; run(1000);
  assert.equal(inst.info().pos, 0);
  assert.equal(inst.info().both, true);
  phys.Q[UP] = false; phys.Q[DOWN] = false;
  phys.Q[D_OPEN] = true; phys.Q[D_CLOSE] = true; run(1000);
  assert.equal(inst.info().door, 0);
  assert.equal(inst.info().doorBoth, true);
});

test('elevator: overrun at the top and bottom crashes into the buffers', () => {
  const { phys, inst, run, until, click, has } = setup('elevator');
  phys.Q[UP] = true;
  assert.ok(until(() => phys.I[AT[2]], 7000) > 0);
  assert.ok(until(() => inst.info().crash, 1000) > 0, 'crash after the overtravel');
  let info = inst.info();
  assert.equal(info.crash, 'top'); assert.equal(phys.I[AT[2]], false);
  assert.ok(Math.abs(info.pos - 2.15) < 1e-9);
  phys.Q[DOWN] = true; phys.Q[UP] = false; run(1000);
  assert.ok(Math.abs(inst.info().pos - 2.15) < 1e-9, 'the cabin stays stuck until it is recovered');
  phys.Q[DOWN] = false;
  click('Recover cabin'); run(10);
  info = inst.info();
  assert.equal(info.crash, null); assert.equal(info.pos, 2); assert.equal(phys.I[AT[2]], true);
  assert.equal(has('Recover cabin'), false);
  phys.Q[DOWN] = true;
  assert.ok(until(() => inst.info().crash === 'bottom', 8000) > 0, 'runs into the pit buffer');
  phys.Q[DOWN] = false;
  click('Recover cabin'); run(10);
  assert.equal(inst.info().pos, 0); assert.equal(phys.I[AT[0]], true);
  assert.equal(inst.info().faults.crash, 2);
});

test('elevator: passenger in the doorway, light curtain and door hit', () => {
  const { phys, inst, run, click } = setup('elevator');
  click('Passenger in door'); run(10);
  assert.equal(inst.info().pass, false, 'nobody can stand in a closed doorway');
  phys.Q[D_OPEN] = true; run(1600); phys.Q[D_OPEN] = false;
  click('Passenger in door'); run(10);
  assert.equal(phys.I[CLEAR], false, 'Door_Clear FALSE while someone is in the doorway');
  phys.Q[D_CLOSE] = true; run(1600);
  let info = inst.info();
  assert.equal(info.hit, true, 'the door hit the passenger');
  assert.ok(Math.abs(info.door - 0.32) < 1e-9, 'the panels stop at the passenger');
  assert.equal(phys.I[CLOSED], false);
  click('Clear'); run(10);
  assert.equal(inst.info().hit, true, 'fault comes back while the door still pushes');
  phys.Q[D_CLOSE] = false; click('Clear'); run(10);
  assert.equal(inst.info().hit, false);
  click('Passenger in door'); run(10);
  assert.equal(phys.I[CLEAR], true, 'doorway clear again');
  assert.equal(inst.info().faults.hit, 2, 'the hit that came back after Clear counts again');
});

test('elevator: the emergency stop latches and cuts power to hoist and door', () => {
  const { phys, inst, run, click } = setup('elevator');
  click('Emergency stop');
  assert.equal(phys.I[ESTOP], false, 'NC contact opens while pressed');
  phys.Q[UP] = true; phys.Q[D_OPEN] = true; run(1000);
  let info = inst.info();
  assert.equal(info.pos, 0); assert.equal(info.door, 0);
  assert.equal(info.cut, true, 'info banner: outputs on while the E-stop is pressed');
  phys.Q[UP] = false; phys.Q[D_OPEN] = false; phys.Q[4] = true; run(10);
  assert.equal(inst.info().cut, true, 'a lamp counts too');
  phys.Q[4] = false; run(10);
  assert.equal(inst.info().cut, false);
  click('Emergency stop');
  assert.equal(phys.I[ESTOP], true, 'released');
  phys.Q[UP] = true; run(300);
  assert.ok(inst.info().pos > 0.05, 'moves again after the release');
});

test('elevator: call buttons are momentary and bring waiting passengers', () => {
  const { phys, inst, run, hold } = setup('elevator');
  for (const k of [0, 1, 2]) {
    hold('Call floor ' + k, true); assert.equal(phys.I[CALL[k]], true);
    hold('Call floor ' + k, false); assert.equal(phys.I[CALL[k]], false);
  }
  run(10);
  assert.equal(phys.I[CALL[2]], false, 'step() does not touch the buttons');
  const w = inst.info().waiting;
  assert.ok(w >= 3 && w <= 6, 'someone waits at every floor (' + w + ')');
  // serve floor 0: the people there board
  phys.Q[D_OPEN] = true; run(5000);
  const info = inst.info();
  assert.ok(info.riders >= 1, 'passengers boarded');
  assert.equal(info.waiting, w - info.riders);
});

test('elevator: a full trip carries the passengers and is deterministic', () => {
  const trip = () => {
    const s = setup('elevator');
    s.hold('Call floor 0', true); s.hold('Call floor 0', false);
    s.hold('Call floor 2', true); s.hold('Call floor 2', false);
    s.phys.Q[D_OPEN] = true; s.run(5000); s.phys.Q[D_OPEN] = false;
    s.phys.Q[D_CLOSE] = true; s.run(1600); s.phys.Q[D_CLOSE] = false;
    s.phys.Q[UP] = true; s.until(() => s.phys.I[AT[2]], 7000); s.phys.Q[UP] = false;
    s.phys.Q[D_OPEN] = true; s.run(8000);
    return s.inst.info();
  };
  const a = trip();
  assert.deepEqual(a, trip());
  assert.ok(a.delivered >= 1, 'riders from floor 0 got out at floor 2');
  assert.equal(a.level, 2);
  assert.deepEqual(a.faults, { moveOpen: 0, offLevel: 0, both: 0, doorBoth: 0, crash: 0, hit: 0 });
});

test('elevator: draws in every state without errors (light and dark)', () => {
  const s = setup('elevator');
  s.click('Passenger in door');
  for (let k = 0; k < 48; k++) {
    for (let i = 0; i < 7; i++) s.phys.Q[i] = ((k * 5 + i * 3) >> i & 1) === 1;
    s.phys.QW[0] = k % 5 - 1;
    s.run(400);
    for (const h of s.render(k % 2 === 1)) {
      if (h.click && k % 6 === 0) h.click({ x: 0, y: 0 });
      if (h.down && k % 9 === 0) { h.down({ x: 0, y: 0 }); h.up(); }
    }
  }
});
