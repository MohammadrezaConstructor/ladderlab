'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PLC = require('./load.js');

function project({ tags = [], ld = null, st = null, extra = [] }) {
  const pous = [];
  if (ld) pous.push({ name: 'Main', lang: 'LD', rungs: ld });
  if (st !== null) pous.push({ name: 'Logic', lang: 'ST', source: st });
  for (const e of extra) pous.push(e);
  return PLC.project.normalize({ name: 't', tags, pous });
}

function boot(p) {
  const c = PLC.compiler.compileProject(p);
  const errs = c.diagnostics.filter(d => d.severity === 'error');
  assert.equal(errs.length, 0, 'compile errors: ' + JSON.stringify(errs, null, 1));
  const rt = new PLC.Runtime();
  rt.load(c);
  rt.run();
  return { rt, c };
}

function diagsOf(p) { return PLC.compiler.compileProject(p).diagnostics; }

const io = (name, type, address) => ({ name, type, address });

test('time literals', () => {
  const T = PLC.types;
  assert.equal(T.parseTimeLiteral('T#1s500ms'), 1500);
  assert.equal(T.parseTimeLiteral('TIME#1m30s'), 90000);
  assert.equal(T.parseTimeLiteral('t#2.5s'), 2500);
  assert.equal(T.parseTimeLiteral('T#1h'), 3600000);
  assert.equal(T.parseTimeLiteral('T#abc'), null);
  assert.equal(T.formatTime(90500), 'T#1m30s500ms');
  assert.equal(T.formatTime(0), 'T#0ms');
  assert.equal(T.coerce('INT', 32768), -32768);
  assert.equal(T.coerce('INT', -32769), 32767);
  assert.equal(T.coerce('BYTE', 256), 0);
  assert.equal(T.coerce('UINT', -1), 65535);
  assert.equal(T.parseAddress('%IX1.7').index, 15);
  assert.equal(T.parseAddress('%IX2.0'), null);
  assert.equal(T.parseAddress('%QW3').area, 'QW');
});

test('ST basics: arithmetic, IF, CASE, loops, integer division', () => {
  const p = project({
    tags: [{ name: 'A', type: 'INT' }, { name: 'B', type: 'INT' }, { name: 'R', type: 'REAL' }, { name: 'S', type: 'INT' },
      { name: 'Flag', type: 'BOOL' }, { name: 'Mode', type: 'INT', init: '2' }, { name: 'Out', type: 'INT' }],
    st: `
      A := 7 / 2;            (* integer division *)
      R := 7.0 / 2;
      B := 17 MOD 5;
      IF A > 2 AND NOT Flag THEN Flag := TRUE; ELSIF A = 0 THEN Flag := FALSE; ELSE Flag := FALSE; END_IF;
      CASE Mode OF
        1: Out := 10;
        2, 3: Out := 20;
        4..9: Out := 30;
      ELSE Out := -1;
      END_CASE;
      S := 0;
      FOR B := 1 TO 10 BY 1 DO
        IF B = 6 THEN EXIT; END_IF;
        S := S + B;
      END_FOR;
    `
  });
  const { rt } = boot(p);
  rt.scan();
  assert.equal(rt.read('A'), 3);
  assert.equal(rt.read('R'), 3.5);
  assert.equal(rt.read('Flag'), true);
  assert.equal(rt.read('Out'), 20);
  assert.equal(rt.read('S'), 15);
});

test('ST: WHILE, REPEAT, arrays, local VAR persistence, functions, function blocks', () => {
  const p = project({
    tags: [{ name: 'Total', type: 'INT' }, { name: 'Calls', type: 'INT' }, { name: 'Y', type: 'INT' }, { name: 'Q', type: 'BOOL' }, { name: 'Go', type: 'BOOL' }],
    extra: [
      { name: 'Lib', lang: 'ST', source: `
        FUNCTION Twice : INT
          VAR_INPUT x : INT; END_VAR
          Twice := x * 2;
        END_FUNCTION

        FUNCTION_BLOCK Latch
          VAR_INPUT SetIt : BOOL; ResetIt : BOOL; END_VAR
          VAR_OUTPUT Out : BOOL; END_VAR
          VAR count : INT; END_VAR
          IF ResetIt THEN Out := FALSE; ELSIF SetIt THEN Out := TRUE; END_IF;
          count := count + 1;
        END_FUNCTION_BLOCK
      ` }
    ],
    st: `
      VAR
        arr : ARRAY[1..5] OF INT := [1, 2, 3, 4, 5];
        i : INT;
        n : INT;
        L1 : Latch;
      END_VAR
      Total := 0;
      i := 1;
      WHILE i <= 5 DO Total := Total + arr[i]; i := i + 1; END_WHILE;
      REPEAT n := n + 1; UNTIL n >= 3 END_REPEAT;
      Calls := Calls + 1;
      Y := Twice(x := 21) + Twice(1);
      L1(SetIt := Go, ResetIt := FALSE, Out => Q);
    `
  });
  const { rt } = boot(p);
  rt.scan(); rt.scan();
  assert.equal(rt.read('Total'), 15);
  assert.equal(rt.read('Calls'), 2);
  assert.equal(rt.read('Y'), 44);
  assert.equal(rt.read('Q'), false);
  rt.write('Go', true); rt.scan();
  assert.equal(rt.read('Q'), true);
  rt.write('Go', false); rt.scan();
  assert.equal(rt.read('Q'), true, 'latch holds');
  assert.equal(rt.mem.p.Logic.n >= 3, true);
});

test('ST errors are friendly and carry line numbers', () => {
  let d = diagsOf(project({ tags: [{ name: 'Start', type: 'BOOL' }, { name: 'Motor', type: 'BOOL' }], st: 'Motor := Strat;\n' }));
  assert.match(d[0].message, /Did you mean Start/);
  assert.equal(d[0].line, 1);
  d = diagsOf(project({ tags: [{ name: 'Motor', type: 'BOOL' }], st: 'Motor := TRUE\nMotor := FALSE;' }));
  assert.match(d[0].message, /Missing ";"/);
  assert.equal(d[0].line, 1);
  d = diagsOf(project({ tags: [{ name: 'X', type: 'INT' }], st: 'X = 5;' }));
  assert.match(d[0].message, /":="/);
  d = diagsOf(project({ tags: [{ name: 'X', type: 'INT' }, { name: 'B', type: 'BOOL' }], st: 'B := X;' }));
  assert.match(d[0].message, /cannot assign INT to BOOL/i);
  d = diagsOf(project({ tags: [{ name: 'X', type: 'INT' }], st: 'IF X > 1 THEN\n X := 1;\n' }));
  assert.match(d[0].message, /END_IF/);
  d = diagsOf(project({ tags: [{ name: 'T1', type: 'TON' }, { name: 'B', type: 'BOOL' }], st: 'B := T1;' }));
  assert.match(d[0].message, /T1\.Q/);
  d = diagsOf(project({ tags: [{ name: 'T1', type: 'TON' }], st: 'T1.Q := TRUE;' }));
  assert.match(d[0].message, /output/);
});

test('watchdog stops endless loops with a fault', () => {
  const p = project({ tags: [{ name: 'X', type: 'INT' }], st: 'WHILE TRUE DO X := X + 1; END_WHILE;' });
  const { rt } = boot(p);
  rt.scan();
  assert.equal(rt.state, 'FAULT');
  assert.match(rt.fault.message, /Watchdog/);
  assert.equal(rt.fault.line, 1);
});

test('division by zero faults', () => {
  const p = project({ tags: [{ name: 'X', type: 'INT' }, { name: 'Z', type: 'INT' }], st: 'X := 10 / Z;' });
  const { rt } = boot(p);
  rt.scan();
  assert.equal(rt.state, 'FAULT');
  assert.match(rt.fault.message, /Division by zero/);
});

test('ladder text notation round-trips', () => {
  const L = PLC.ladder;
  const cases = [
    '[ NO(Start) | NO(Motor) ] NC(Stop) COIL(Motor)',
    'NO(A) [ NO(B) | NC(C) [ NO(D) | NO(E) ] ] COIL(Out)',
    'NO(Run) TON(T1, PT=T#5s, ET=Elapsed) COIL(Lamp)',
    'GT(IN1=Level, IN2=500) ADD(IN1=Count, IN2=1, OUT=Count)',
    'NO(A) [ COIL(B) | SET(C) ]'
  ];
  for (const c of cases) {
    const ser = L.parseRungText(c);
    assert.equal(L.seriesToText(ser), c);
  }
  const pos = L.parseRungText('GT(Level, 500)');
  assert.equal(pos.items[0].params.IN1, 'Level');
  assert.equal(pos.items[0].params.IN2, '500');
  const nested = L.parseRungText('MOVE(IN=MAX(A, B), OUT=C)');
  assert.equal(nested.items[0].params.IN, 'MAX(A, B)');
});

test('ladder seal-in circuit through the I/O process image', () => {
  const p = project({
    tags: [io('Start', 'BOOL', '%IX0.0'), io('Stop', 'BOOL', '%IX0.1'), io('Motor', 'BOOL', '%QX0.0')],
    ld: ['[ NO(Start) | NO(Motor) ] NO(Stop) COIL(Motor)']
  });
  const { rt } = boot(p);
  rt.phys.I[1] = true; // NC stop button wired: TRUE when not pressed
  rt.scan();
  assert.equal(rt.phys.Q[0], false);
  rt.phys.I[0] = true; rt.scan();
  assert.equal(rt.phys.Q[0], true);
  rt.phys.I[0] = false; rt.scan();
  assert.equal(rt.phys.Q[0], true, 'seal-in holds');
  rt.phys.I[1] = false; rt.scan();
  assert.equal(rt.phys.Q[0], false, 'stop breaks the circuit');
});

test('ladder TON timing and power flow record', () => {
  const p = project({
    tags: [io('Go', 'BOOL', '%IX0.0'), io('Lamp', 'BOOL', '%QX0.0'), { name: 'T1', type: 'TON' }],
    ld: ['NO(Go) TON(T1, PT=T#1s) COIL(Lamp)']
  });
  const { rt } = boot(p);
  rt.phys.I[0] = true;
  let n = 0;
  while (!rt.phys.Q[0] && n < 500) { rt.scan(); n++; }
  // TON starts on the first scan that sees Go; Q after 1000 ms → 101 scans
  assert.equal(n, 101);
  const contact = p.pous[0].rungs[0].body.items[0];
  assert.equal(rt.mem.flow[contact.id] & 2, 2);
});

test('ladder errors point at the element', () => {
  const p = project({ tags: [{ name: 'Lamp', type: 'BOOL' }], ld: ['NO(Swich) COIL(Lamp)', 'COIL(Lamp)'] });
  const d = PLC.compiler.compileProject(p).diagnostics;
  const err = d.find(x => x.severity === 'error');
  assert.ok(err.elemId);
  assert.match(err.message, /Unknown variable "Swich"/);
  assert.ok(d.some(x => x.severity === 'warning' && /written by coils in rungs 1 and 2/.test(x.message)));
});

test('edge contacts fire for exactly one scan', () => {
  const p = project({ tags: [{ name: 'B', type: 'BOOL' }, { name: 'C', type: 'INT' }], ld: ['P(B) ADD(C, 1, OUT=C)'] });
  const { rt } = boot(p);
  rt.write('B', true);
  for (let i = 0; i < 5; i++) rt.scan();
  assert.equal(rt.read('C'), 1);
  rt.write('B', false); rt.scan();
  rt.write('B', true); rt.scan(); rt.scan();
  assert.equal(rt.read('C'), 2);
});

test('counters, comparators and math boxes', () => {
  const p = project({
    tags: [{ name: 'Pulse', type: 'BOOL' }, { name: 'Rst', type: 'BOOL' }, { name: 'C1', type: 'CTU' }, { name: 'Done', type: 'BOOL' },
      { name: 'Cnt', type: 'INT' }, { name: 'Big', type: 'BOOL' }, { name: 'Dbl', type: 'INT' }],
    ld: ['NO(Pulse) CTU(C1, R=Rst, PV=3, CV=Cnt) COIL(Done)', 'GE(Cnt, 2) COIL(Big)', 'MUL(Cnt, 2, OUT=Dbl)']
  });
  const { rt } = boot(p);
  for (let k = 0; k < 3; k++) { rt.write('Pulse', true); rt.scan(); rt.write('Pulse', false); rt.scan(); }
  assert.equal(rt.read('Cnt'), 3);
  assert.equal(rt.read('Done'), true);
  assert.equal(rt.read('Big'), true);
  assert.equal(rt.read('Dbl'), 6);
  rt.write('Rst', true); rt.scan();
  assert.equal(rt.read('Cnt'), 0);
  assert.equal(rt.read('Done'), false);
});

test('standard timers TOF, TP, TONR behave per IEC', () => {
  const fb = PLC.fb;
  const tof = fb.create('TOF'); tof.PT = 100;
  tof.IN = true; fb.defs.TOF.exec(tof, 0); assert.equal(tof.Q, true);
  tof.IN = false; fb.defs.TOF.exec(tof, 10); assert.equal(tof.Q, true);
  fb.defs.TOF.exec(tof, 109); assert.equal(tof.Q, true);
  fb.defs.TOF.exec(tof, 110); assert.equal(tof.Q, false);
  const tp = fb.create('TP'); tp.PT = 50;
  tp.IN = true; fb.defs.TP.exec(tp, 0); assert.equal(tp.Q, true);
  tp.IN = false; fb.defs.TP.exec(tp, 20); assert.equal(tp.Q, true);
  fb.defs.TP.exec(tp, 50); assert.equal(tp.Q, false);
  const r = fb.create('TONR'); r.PT = 100;
  r.IN = true; fb.defs.TONR.exec(r, 0); fb.defs.TONR.exec(r, 60);
  r.IN = false; fb.defs.TONR.exec(r, 70);
  assert.equal(r.ET, 60);
  r.IN = true; fb.defs.TONR.exec(r, 200); fb.defs.TONR.exec(r, 240);
  assert.equal(r.ET, 100); assert.equal(r.Q, true);
  r.R = true; fb.defs.TONR.exec(r, 250); assert.equal(r.ET, 0); assert.equal(r.Q, false);
});

test('ladder → ST translation behaves exactly like the ladder', () => {
  const tags = [
    { name: 'A', type: 'BOOL' }, { name: 'B', type: 'BOOL' }, { name: 'C', type: 'BOOL' }, { name: 'D', type: 'BOOL' },
    { name: 'X', type: 'BOOL' }, { name: 'Y', type: 'BOOL' }, { name: 'Z', type: 'BOOL' }, { name: 'W', type: 'BOOL' },
    { name: 'T1', type: 'TON' }, { name: 'C1', type: 'CTU' }, { name: 'N', type: 'INT' }, { name: 'K', type: 'INT' }
  ];
  const rungs = [
    '[ NO(A) | NO(X) ] NC(B) COIL(X)',
    'NO(A) [ NO(B) [ NC(C) | NO(D) ] | NC(D) ] COIL(Y)',
    'P(C) CTU(C1, R=D, PV=3, CV=N) COIL(Z)',
    'NO(B) TON(T1, PT=T#50ms) [ COIL(W) | ADD(K, 1, OUT=K) ]',
    'NO(A) [ SET(Z) | NC(B) RESET(Y) ] NCOIL(D)',
    'GT(N, 1) [ NO(C) | NO(A) ] MOVE(N, OUT=K)'
  ];
  const ldProj = project({ tags, ld: rungs });
  const stSrc = PLC.ladder.toST(ldProj.pous[0]);
  const stProj = project({ tags, st: stSrc });
  const a = boot(ldProj).rt, b = boot(stProj).rt;
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 400; i++) {
    for (const n of ['A', 'B', 'C']) { const v = rnd() < 0.3; a.write(n, v); b.write(n, v); }
    a.scan(); b.scan();
    for (const n of ['X', 'Y', 'Z', 'W', 'N', 'K', 'D']) assert.equal(a.read(n), b.read(n), 'scan ' + i + ' signal ' + n + '\n' + stSrc);
  }
});

test('grader runs scripted tests', () => {
  const p = project({
    tags: [io('Start', 'BOOL', '%IX0.0'), io('Stop', 'BOOL', '%IX0.1'), io('Motor', 'BOOL', '%QX0.0')],
    ld: ['[ NO(Start) | NO(Motor) ] NO(Stop) COIL(Motor)']
  });
  const tests = [{
    name: 'seal-in', init: { Stop: true },
    steps: [
      { expect: { Motor: false } },
      { pulse: { Start: true }, ms: 100 },
      { expect: { Motor: true }, msg: 'Motor must keep running after Start is released' },
      { pulse: { Stop: false }, ms: 100 },
      { expect: 'NOT Motor' }
    ]
  }];
  const r = PLC.grader.runTests(p, tests);
  assert.equal(r.passed, true, JSON.stringify(r));
  const bad = project({ tags: p.tags, ld: ['NO(Start) NO(Stop) COIL(Motor)'] });
  const r2 = PLC.grader.runTests(bad, tests);
  assert.equal(r2.passed, false);
  assert.match(r2.results[0].message, /keep running/);
});

test('recompiling keeps variable values (online change)', () => {
  const p = project({ tags: [{ name: 'N', type: 'INT' }], st: 'N := N + 1;' });
  const { rt } = boot(p);
  rt.scan(); rt.scan(); rt.scan();
  p.tags.push({ name: 'M', type: 'INT' });
  p.pous[0].source = 'N := N + 1; M := N;';
  rt.load(PLC.compiler.compileProject(p));
  rt.scan();
  assert.equal(rt.read('N'), 4);
  assert.equal(rt.read('M'), 4);
});

test('scan debugger steps phase by phase and outputs reach the field only at the end', () => {
  const p = project({
    tags: [io('Start', 'BOOL', '%IX0.0'), io('Lamp', 'BOOL', '%QX0.0'), { name: 'M', type: 'BOOL' }],
    ld: ['NO(Start) COIL(M)', 'NO(M) COIL(Lamp)'],
    st: 'M := M;'
  });
  const { rt } = boot(p);
  rt.phys.I[0] = true;
  const kinds = [];
  for (let i = 0; i < 5; i++) {
    const ph = rt.stepPhase();
    kinds.push(ph.kind + (ph.index !== undefined ? ph.index : ''));
    if (ph.kind === 'rung' && ph.index === 1) {
      assert.equal(rt.mem.io.Q[0], true, 'coil wrote the output image');
      assert.equal(rt.phys.Q[0], false, 'field output unchanged until the output phase');
    }
  }
  assert.deepEqual(kinds, ['input', 'rung0', 'rung1', 'prog', 'output']);
  assert.equal(rt.phys.Q[0], true);
  assert.equal(rt.scanCount, 1);
  // a normal scan finishes a half-done debug scan first
  rt.stepPhase(); rt.stepPhase();
  rt.scan();
  assert.equal(rt.debug, null);
  assert.equal(rt.scanCount, 2);
});

test('ladder call box runs a user-defined function block and translates to equivalent ST', () => {
  const fbSrc = 'FUNCTION_BLOCK Starter\n  VAR_INPUT Go : BOOL; Halt : BOOL; END_VAR\n  VAR_OUTPUT Run : BOOL; Count : INT; END_VAR\n  VAR Edge : R_TRIG; END_VAR\n  Run := (Go OR Run) AND NOT Halt;\n  Edge(CLK := Go);\n  IF Edge.Q THEN Count := Count + 1; END_IF;\nEND_FUNCTION_BLOCK\n';
  const tags = [{ name: 'A', type: 'BOOL' }, { name: 'B', type: 'BOOL' }, { name: 'Lamp', type: 'BOOL' }, { name: 'N', type: 'INT' }, { name: 'S1', type: 'Starter' }];
  const ldProj = project({ tags, ld: ['NO(A) CALL(S1, Halt=B, Count=N) COIL(Lamp)'], extra: [{ name: 'Lib', lang: 'ST', source: fbSrc }] });
  const c = PLC.compiler.compileProject(ldProj);
  const fbt = c.fbTypes.get('starter');
  const pins = PLC.ladder.fbPins(fbt);
  const info = () => ({ powerIn: pins.powerIn.name, powerOut: pins.powerOut.name, outputs: pins.outs.map(o => o.name) });
  const st = PLC.ladder.toST(ldProj.pous[0], info);
  assert.match(st, /S1\(Go := A, Halt := B, Count => N\);/);
  const stProj = project({ tags, st, extra: [{ name: 'Lib', lang: 'ST', source: fbSrc }] });
  const a = boot(ldProj).rt, b = boot(stProj).rt;
  const seq = [[1, 0], [0, 0], [0, 0], [0, 1], [0, 0], [1, 0], [1, 0], [0, 0]];
  for (const [x, y] of seq) {
    for (const rt of [a, b]) { rt.write('A', !!x); rt.write('B', !!y); rt.scan(); }
    assert.equal(a.read('Lamp'), b.read('Lamp'));
    assert.equal(a.read('N'), b.read('N'));
  }
  assert.equal(a.read('Lamp'), true);
  assert.equal(a.read('N'), 2);
  // unknown pin names are reported
  const bad = project({ tags, ld: ['NO(A) CALL(S1, Stopp=B) COIL(Lamp)'], extra: [{ name: 'Lib', lang: 'ST', source: fbSrc }] });
  assert.match(PLC.compiler.compileProject(bad).diagnostics.find(d => d.severity === 'error').message, /no input or output called Stopp/);
});

test('initial values may use constants declared earlier in the same POU', () => {
  const p = project({
    tags: [{ name: 'Out', type: 'INT' }],
    st: 'VAR CONSTANT\n  IDLE : INT := 3;\n  BUSY : INT := IDLE + 1;\nEND_VAR\nVAR\n  State : INT := BUSY;\n  Arr : ARRAY[0..2] OF INT := [IDLE, BUSY, 0];\nEND_VAR\nOut := State * 10 + Arr[0];\n'
  });
  const { rt } = boot(p);
  rt.scan();
  assert.equal(rt.read('Out'), 43);
  // a non-constant variable is still rejected as an initial value
  const bad = project({ tags: [], st: 'VAR\n  A : INT := 1;\n  B : INT := A;\nEND_VAR\nB := B;\n' });
  assert.ok(PLC.compiler.compileProject(bad).diagnostics.some(d => d.severity === 'error' && /constant/i.test(d.message)));
});
