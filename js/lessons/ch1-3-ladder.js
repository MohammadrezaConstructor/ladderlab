/* LadderLab — lessons for chapters 1 to 3: ladder basics, latching and edges, timers.
 * Format: see lessons.js. Tag names, addresses and comments match the scene wiring. */
(function (PLC) {
  'use strict';
  const L = PLC.lessons;

  // ---- scene wiring (copied from the scene files) ---------------------------------
  const TRAINER = {};
  for (let i = 1; i <= 8; i++) {
    TRAINER['Switch' + i] = { type: 'BOOL', address: '%IX0.' + (i - 1), comment: 'Toggle switch ' + i };
    TRAINER['Button' + i] = { type: 'BOOL', address: '%IX1.' + (i - 1), comment: 'Push button ' + i + ' (momentary, NO)' };
  }
  for (let i = 1; i <= 16; i++) {
    TRAINER['Lamp' + i] = { type: 'BOOL', address: '%QX' + Math.floor((i - 1) / 8) + '.' + ((i - 1) % 8), comment: 'Pilot lamp ' + i };
  }
  const MOTOR = {
    Start: { type: 'BOOL', address: '%IX0.0', comment: 'Start push button, green (NO contact)' },
    Stop: { type: 'BOOL', address: '%IX0.1', comment: 'Stop push button, red (NC contact: TRUE when NOT pressed)' },
    Overload: { type: 'BOOL', address: '%IX0.3', comment: 'Overload relay contact (NC: TRUE = OK, FALSE = tripped)' },
    Motor: { type: 'BOOL', address: '%QX0.0', comment: 'Contactor K1: motor forward' },
    Lamp_Run: { type: 'BOOL', address: '%QX0.2', comment: 'Green pilot lamp: running' },
    Lamp_Fault: { type: 'BOOL', address: '%QX0.3', comment: 'Red pilot lamp: fault' }
  };
  const TRAFFIC = {
    Main_Red: { type: 'BOOL', address: '%QX0.0', comment: 'Main road: red' },
    Main_Yellow: { type: 'BOOL', address: '%QX0.1', comment: 'Main road: yellow' },
    Main_Green: { type: 'BOOL', address: '%QX0.2', comment: 'Main road: green' }
  };
  /** I/O tags of a scene by name. */
  function io(scene, names) { return names.map(n => Object.assign({ name: n }, scene[n])); }
  /** An internal tag (no address): memory bit, timer or counter instance. */
  function mem(name, type, comment) { return { name, type, comment }; }
  function ld(rungs) { return { pous: [{ name: 'Main', lang: 'LD', rungs }] }; }
  const EMPTY = ld(['']);

  // =================================================================================
  // Chapter: ld-basics
  // =================================================================================

  L.register({
    id: 'ld-02-nc-contacts', chapter: 'ld-basics', order: 2,
    title: 'Normally closed contacts',
    goal: 'Use a normally closed contact to react to a FALSE signal, and tell the NC symbol apart from an NC-wired device.',
    lang: 'LD', scene: 'trainer',
    tags: io(TRAINER, ['Switch1', 'Lamp1', 'Lamp5']),
    starter: EMPTY,
    solution: ld([
      { comment: 'Green ready lamp: on while there is no fault', text: 'NC(Switch1) COIL(Lamp1)' },
      { comment: 'Red fault lamp: on while there is a fault', text: 'NO(Switch1) COIL(Lamp5)' }
    ]),
    trace: ['Switch1', 'Lamp1', 'Lamp5'],
    theory: `
      <p>The normally open contact from the last lesson passes power while its tag is TRUE. Its partner is the
      <strong>normally closed contact</strong> <code>-|/|-</code>. It passes power while its tag is <strong>FALSE</strong>
      and blocks power while the tag is TRUE. It works like the word NOT.</p>
      <div class="ld-figure" data-rungs="NC(Door_Open) COIL(Ready)"></div>
      <p>This rung reads: "Ready is on while Door_Open is NOT true".</p>
      <h3>The symbol is not the device</h3>
      <p>Push buttons and sensors also come as "normally open" or "normally closed" devices. That describes their
      <strong>wiring</strong>. An NC push button lets current flow to the PLC input until you press it, so the PLC sees
      TRUE while nobody touches the button and FALSE while it is pressed.</p>
      <p>The contact symbol in your program is something different. It does not know how the device is wired. It only asks a question about the tag:</p>
      <ul>
        <li><code>-| |-</code> asks "is the tag TRUE?"</li>
        <li><code>-|/|-</code> asks "is the tag FALSE?"</li>
      </ul>
      <p>So always think in signals. First work out whether the input is TRUE or FALSE in the situation you care about,
      then choose the contact. You will need this soon: the stop button of a motor is wired NC for safety reasons.</p>
      <h3>Status lamps</h3>
      <p>Machines often show their state with two lamps driven by the same signal: a green "ready" lamp that is on while
      there is no fault, and a red "fault" lamp that is on while there is one. That is one tag in two contacts: NC for the
      green lamp, NO for the red one. You may use a tag in as many contacts as you like.</p>`,
    task: `
      <p>Switch1 stands for a fault signal from the machine (ON = fault).</p>
      <ol>
        <li>Rung 1: a <strong>normally closed contact</strong> <code>Switch1</code>, then the coil <code>Lamp1</code> (green "ready" lamp).</li>
        <li>Add a second rung.</li>
        <li>Rung 2: a <strong>normally open contact</strong> <code>Switch1</code>, then the coil <code>Lamp5</code> (red "fault" lamp).</li>
        <li>Run the program and flip Switch1. Exactly one of the two lamps must be on at any time.</li>
        <li>Press <strong>Check</strong>.</li>
      </ol>`,
    hints: [
      'The normally closed contact is the -|/|- button in the toolbar.',
      'Lamp1 must be on while Switch1 is OFF. Which contact passes power when its tag is FALSE?',
      'Rung 1: NC contact Switch1, coil Lamp1. Rung 2: NO contact Switch1, coil Lamp5.'
    ],
    tests: [
      {
        name: 'Green Lamp1 is on while there is no fault',
        steps: [
          { expect: { Lamp1: true }, msg: 'With Switch1 off (no fault), the green Lamp1 must be on' },
          { set: { Switch1: true }, wait: 50 },
          { expect: { Lamp1: false }, msg: 'With Switch1 on (fault), Lamp1 must go off' },
          { set: { Switch1: false }, wait: 50 },
          { expect: { Lamp1: true }, msg: 'When Switch1 is off again, Lamp1 must come back on' }
        ]
      },
      {
        name: 'Red Lamp5 is on while there is a fault',
        steps: [
          { expect: { Lamp5: false }, msg: 'With Switch1 off, the red Lamp5 must be off' },
          { set: { Switch1: true }, wait: 50 },
          { expect: { Lamp5: true }, msg: 'With Switch1 on, Lamp5 must light' },
          { set: { Switch1: false }, wait: 50 },
          { expect: { Lamp5: false }, msg: 'When Switch1 is off again, Lamp5 must go off' }
        ]
      }
    ],
    quiz: [
      { q: 'A normally closed contact -|/|- with the tag Sensor passes power when...', options: ['Sensor is TRUE', 'Sensor is FALSE', 'Sensor is an NC-wired device'], answer: 1, explain: 'The NC symbol passes power while its tag is FALSE, no matter how the device is wired.' },
      { q: 'A push button is wired NC. What does its PLC input show while nobody presses it?', options: ['FALSE', 'TRUE', 'It depends on the contact symbol in the program'], answer: 1, explain: 'An NC device lets current flow until it is pressed, so the input is TRUE while it is not pressed.' },
      { q: 'May the same tag appear in several contacts of a program?', options: ['Yes, as often as needed', 'No, only once', 'Only in NO contacts'], answer: 0, explain: 'Contacts only read a tag, so you can use it as often as you like.' }
    ]
  });

  L.register({
    id: 'ld-03-and-series', chapter: 'ld-basics', order: 3,
    title: 'AND logic: contacts in series',
    goal: 'Combine conditions with AND by placing contacts in series, and build a two-hand control.',
    lang: 'LD', scene: 'trainer',
    tags: io(TRAINER, ['Button1', 'Button2', 'Lamp1', 'Lamp2']),
    starter: EMPTY,
    solution: ld([
      { comment: 'Two-hand control: the press only moves while both buttons are held', text: 'NO(Button1) NO(Button2) COIL(Lamp1)' },
      { comment: 'Ready lamp: neither button is pressed', text: 'NC(Button1) NC(Button2) COIL(Lamp2)' }
    ]),
    trace: ['Button1', 'Button2', 'Lamp1', 'Lamp2'],
    theory: `
      <p>When you place contacts one after another on a rung, power must pass <strong>through all of them</strong> to reach the coil.
      Contacts in series form an <strong>AND</strong>: the coil is on only if the first condition AND the second condition are true.</p>
      <div class="ld-figure" data-rungs="NO(Guard_Closed) NO(Pressure_OK) COIL(Ready)"></div>
      <h3>Truth table</h3>
      <p>A truth table lists every combination of the inputs together with the result. Two inputs give four combinations:</p>
      <table class="truth">
        <tr><th>A</th><th>B</th><th>A AND B</th></tr>
        <tr><td>FALSE</td><td>FALSE</td><td>FALSE</td></tr>
        <tr><td>TRUE</td><td>FALSE</td><td>FALSE</td></tr>
        <tr><td>FALSE</td><td>TRUE</td><td>FALSE</td></tr>
        <tr><td>TRUE</td><td>TRUE</td><td>TRUE</td></tr>
      </table>
      <p>Only one row gives TRUE: the one where both inputs are TRUE.</p>
      <h3>Two-hand control</h3>
      <p>Presses, punches and guillotine shears can crush a hand. A common protection is the <strong>two-hand control</strong>:
      the machine only moves while the operator holds two buttons that are mounted so far apart that both hands are needed.
      If either hand lets go, the movement stops at once. In ladder this is simply two NO contacts in series.</p>
      <p>Real two-hand controls also demand that both buttons are pressed within 0.5 s of each other, and they use certified
      safety relays. You will be able to add the time check once you know timers.</p>
      <h3>AND with NC contacts</h3>
      <p>Series works with any kind of contact. Two NC contacts in series mean "A is FALSE AND B is FALSE", in other words:
      neither A nor B. A two-hand control uses this to check that both hands have let go before the next stroke may begin.</p>`,
    task: `
      <p>Lamp1 stands for the valve that moves the press down. Lamp2 is a green "ready" lamp.</p>
      <ol>
        <li>Rung 1: <code>Lamp1</code> may only be on while <code>Button1</code> AND <code>Button2</code> are both held. Use two NO contacts in series.</li>
        <li>Rung 2: <code>Lamp2</code> is on while <strong>neither</strong> button is pressed. Use two NC contacts in series.</li>
        <li>Run the program. Hold Button1 with <strong>Shift+click</strong> (it stays pressed), then press Button2 with a normal click. Shift+click Button1 again to release it. Then press <strong>Check</strong>.</li>
      </ol>`,
    hints: [
      'Contacts placed one after another on the same rung form an AND.',
      'Rung 1 needs NO contacts, because Lamp1 needs both buttons to be TRUE.',
      'Rung 1: NO Button1, NO Button2, coil Lamp1. Rung 2: NC Button1, NC Button2, coil Lamp2.'
    ],
    tests: [
      {
        name: 'Lamp1 needs both buttons',
        steps: [
          { expect: { Lamp1: false }, msg: 'With no button pressed, Lamp1 must be off' },
          { set: { Button1: true }, wait: 50 },
          { expect: { Lamp1: false }, msg: 'Button1 alone must not switch Lamp1 on: one hand would still be free' },
          { set: { Button1: false, Button2: true }, wait: 50 },
          { expect: { Lamp1: false }, msg: 'Button2 alone must not switch Lamp1 on: one hand would still be free' },
          { set: { Button1: true }, wait: 50 },
          { expect: { Lamp1: true }, msg: 'With both buttons held, Lamp1 must be on' },
          { set: { Button2: false }, wait: 50 },
          { expect: { Lamp1: false }, msg: 'Releasing one button must switch Lamp1 off at once' }
        ]
      },
      {
        name: 'Ready lamp Lamp2',
        steps: [
          { expect: { Lamp2: true }, msg: 'With no button pressed, the ready lamp Lamp2 must be on' },
          { set: { Button1: true }, wait: 50 },
          { expect: { Lamp2: false }, msg: 'While Button1 is pressed, Lamp2 must be off' },
          { set: { Button1: false, Button2: true }, wait: 50 },
          { expect: { Lamp2: false }, msg: 'While Button2 is pressed, Lamp2 must be off' },
          { set: { Button1: true }, wait: 50 },
          { expect: { Lamp2: false }, msg: 'While both buttons are pressed, Lamp2 must be off' },
          { set: { Button1: false, Button2: false }, wait: 50 },
          { expect: { Lamp2: true }, msg: 'When both buttons are released, Lamp2 must come back on' }
        ]
      }
    ],
    quiz: [
      { q: 'Two NO contacts A and B in series drive a coil. When is the coil on?', options: ['When A or B is TRUE', 'Only when A and B are both TRUE', 'When A and B are both FALSE'], answer: 1, explain: 'Power has to pass through both contacts, so both tags must be TRUE.' },
      { q: 'Why does a two-hand control put the buttons in series and not side by side?', options: ['Side by side, one button would be enough and the other hand could be in the danger zone', 'Series is faster', 'Side by side needs more tags'], answer: 0, explain: 'Only the series connection forces the operator to use both hands.' },
      { q: 'Two NC contacts A and B in series: when does power reach the coil?', options: ['When A and B are both FALSE', 'When A or B is FALSE', 'When A and B are both TRUE'], answer: 0, explain: 'Each NC contact needs its tag to be FALSE, and in series both must pass power.' }
    ]
  });

  L.register({
    id: 'ld-04-or-parallel', chapter: 'ld-basics', order: 4,
    title: 'OR logic: parallel branches',
    goal: 'Combine conditions with OR by building parallel branches in the ladder editor.',
    lang: 'LD', scene: 'trainer',
    tags: io(TRAINER, ['Switch1', 'Switch2', 'Button1', 'Button2', 'Button3', 'Lamp1', 'Lamp3']),
    starter: EMPTY,
    solution: ld([
      { comment: 'Work light: switched on from either end of the machine', text: '[ NO(Switch1) | NO(Switch2) ] COIL(Lamp1)' },
      { comment: 'Call lamp: any of the three stations', text: '[ NO(Button1) | NO(Button2) | NO(Button3) ] COIL(Lamp3)' }
    ]),
    trace: ['Switch1', 'Switch2', 'Lamp1', 'Button1', 'Button2', 'Button3', 'Lamp3'],
    theory: `
      <p>Contacts in series mean AND. Contacts drawn in <strong>parallel branches</strong>, one below the other, mean <strong>OR</strong>:
      power can reach the coil through the upper path or through the lower path, so one TRUE condition is enough.</p>
      <div class="ld-figure" data-rungs="[ NO(Bell_Front) | NO(Bell_Back) ] COIL(Bell)"></div>
      <table class="truth">
        <tr><th>A</th><th>B</th><th>A OR B</th></tr>
        <tr><td>FALSE</td><td>FALSE</td><td>FALSE</td></tr>
        <tr><td>TRUE</td><td>FALSE</td><td>TRUE</td></tr>
        <tr><td>FALSE</td><td>TRUE</td><td>TRUE</td></tr>
        <tr><td>TRUE</td><td>TRUE</td><td>TRUE</td></tr>
      </table>
      <p>A branch may have more than two paths. The coil is on as soon as at least one path passes power.</p>
      <h3>Typical uses</h3>
      <ul>
        <li>One output controlled from several places: a work light, a horn, a call lamp.</li>
        <li>Several faults that each light the same fault lamp.</li>
        <li>The holding contact of a seal-in circuit, which you will meet in the next chapter.</li>
      </ul>
      <h3>Building a branch in the editor</h3>
      <ol>
        <li>Place the first contact on the rung as usual.</li>
        <li>Select that contact and click <strong>Branch</strong> in the toolbar. A new, empty path appears below it, joined to the rung on both sides.</li>
        <li>Select the empty path and add the second contact to it.</li>
        <li>For a third path, select everything in one of the paths (for example its only contact) and click <strong>Branch</strong> again. A new path appears below it.</li>
      </ol>
      <p>An empty path is a plain wire. It lets power through all the time, so the coil would always be on. The editor warns you about it: fill the path or delete it.</p>
      <p>Do not try to build an OR from two rungs that both end in the same coil. That does not work, and the next lesson shows why.</p>`,
    task: `
      <ol>
        <li>Rung 1: the work light <code>Lamp1</code> of a long machine can be switched on from either end: <code>Switch1</code> OR <code>Switch2</code>.</li>
        <li>Rung 2: the yellow call lamp <code>Lamp3</code> lights while any of the three push buttons <code>Button1</code>, <code>Button2</code>, <code>Button3</code> is pressed.</li>
        <li>Run and try it, then press <strong>Check</strong>.</li>
        <li>Notice: once Switch1 is on, Switch2 can no longer switch the light off. The next lesson fixes that.</li>
      </ol>`,
    hints: [
      'Select the Switch1 contact, then click Branch. Put the Switch2 contact into the new empty path.',
      'Use one rung and one coil per lamp. Two rungs that both write Lamp1 do not make an OR.',
      'Rung 2 needs three paths: build a branch with two buttons, then select the contact in one path and click Branch again.',
      'Rung 1: [ NO(Switch1) | NO(Switch2) ] followed by the coil Lamp1.'
    ],
    tests: [
      {
        name: 'Work light Lamp1 from two places',
        steps: [
          { expect: { Lamp1: false }, msg: 'With both switches off, Lamp1 must be off' },
          { set: { Switch1: true }, wait: 50 },
          { expect: { Lamp1: true }, msg: 'Switch1 alone must switch Lamp1 on' },
          { set: { Switch1: false, Switch2: true }, wait: 50 },
          { expect: { Lamp1: true }, msg: 'Switch2 alone must switch Lamp1 on' },
          { set: { Switch1: true }, wait: 50 },
          { expect: { Lamp1: true }, msg: 'With both switches on, Lamp1 must be on' },
          { set: { Switch1: false, Switch2: false }, wait: 50 },
          { expect: { Lamp1: false }, msg: 'With both switches off again, Lamp1 must go off' }
        ]
      },
      {
        name: 'Call lamp Lamp3 from three buttons',
        steps: [
          { expect: { Lamp3: false }, msg: 'With no button pressed, Lamp3 must be off' },
          { set: { Button1: true }, wait: 50 },
          { expect: { Lamp3: true }, msg: 'Button1 must light Lamp3' },
          { set: { Button1: false, Button2: true }, wait: 50 },
          { expect: { Lamp3: true }, msg: 'Button2 must light Lamp3' },
          { set: { Button2: false, Button3: true }, wait: 50 },
          { expect: { Lamp3: true }, msg: 'Button3 must light Lamp3' },
          { set: { Button3: false }, wait: 50 },
          { expect: { Lamp3: false }, msg: 'With all buttons released, Lamp3 must go off' }
        ]
      }
    ],
    quiz: [
      { q: 'NO contacts A and B are in parallel branches before a coil. When is the coil on?', options: ['Only if both are TRUE', 'If at least one of them is TRUE', 'If exactly one of them is TRUE'], answer: 1, explain: 'Power reaches the coil through any path that is closed.' },
      { q: 'What does an empty path inside a branch do?', options: ['Nothing, it is ignored', 'It acts like a wire, so power always gets through', 'It acts like an open contact'], answer: 1, explain: 'An empty path has nothing that could block the power, so it bypasses the other paths.' }
    ]
  });

  L.register({
    id: 'ld-05-combining-logic', chapter: 'ld-basics', order: 5,
    title: 'Combining logic',
    goal: 'Turn a truth table into a rung of series and parallel contacts, and avoid writing one output from two coils.',
    lang: 'LD', scene: 'trainer',
    tags: io(TRAINER, ['Switch1', 'Switch2', 'Lamp1']),
    starter: EMPTY,
    solution: ld([
      { comment: 'Staircase light: Lamp1 is on when the two switches are in different positions (XOR)', text: '[ NO(Switch1) NC(Switch2) | NC(Switch1) NO(Switch2) ] COIL(Lamp1)' }
    ]),
    trace: ['Switch1', 'Switch2', 'Lamp1'],
    theory: `
      <p>Real conditions mix AND and OR. In ladder you simply nest series and parallel paths. Read a rung like a sentence:
      contacts one after another are joined with AND, paths below each other are joined with OR.</p>
      <div class="ld-figure" data-rungs="NO(Guard_Closed) [ NO(Auto) | NO(Jog) ] COIL(Run_Allowed)||[ NO(Low_Oil) NO(Pump_On) | NO(Overtemp) ] COIL(Alarm)"></div>
      <p>The first rung reads <code>Guard_Closed AND (Auto OR Jog)</code>, the second <code>(Low_Oil AND Pump_On) OR Overtemp</code>.</p>
      <h3>From truth table to rung</h3>
      <p>In a staircase the light can be switched at the bottom and at the top. Flipping <em>either</em> switch changes the light,
      wherever the other switch is. The truth table:</p>
      <table class="truth">
        <tr><th>Switch1</th><th>Switch2</th><th>Lamp1</th></tr>
        <tr><td>FALSE</td><td>FALSE</td><td>FALSE</td></tr>
        <tr><td>TRUE</td><td>FALSE</td><td>TRUE</td></tr>
        <tr><td>FALSE</td><td>TRUE</td><td>TRUE</td></tr>
        <tr><td>TRUE</td><td>TRUE</td><td>FALSE</td></tr>
      </table>
      <p>The lamp is on when the switches are <strong>different</strong>. This function is called <strong>exclusive OR (XOR)</strong>.
      A recipe that works for any truth table: pick the rows where the output is TRUE, describe each row with contacts in series
      (NO for TRUE, NC for FALSE), and put those rows into the paths of one branch.</p>
      <h3>Pitfall: only the last coil wins</h3>
      <p>It is tempting to write one rung per row, each ending in the same coil:</p>
      <div class="ld-figure" data-rungs="NO(Switch_A) COIL(Light)||NO(Switch_B) COIL(Light)"></div>
      <p>This does not do what it seems. A coil writes TRUE <em>or FALSE</em> on every scan. Rung 1 may switch Light on, but rung 2
      runs right after it and overwrites the value. Only the <strong>last coil wins</strong>, so rung 1 has no effect at all.
      LadderLab warns you when a tag is written by more than one coil. The fix: put all conditions for one output into one rung, joined with a branch.</p>`,
    task: `
      <p>Build the staircase light: <code>Switch1</code> is at the bottom of the stairs, <code>Switch2</code> at the top, <code>Lamp1</code> is the light.</p>
      <ol>
        <li>Flipping either switch must change the state of <code>Lamp1</code>.</li>
        <li>With both switches off, the light is off.</li>
        <li>Use exactly one rung with one <code>Lamp1</code> coil.</li>
        <li>Try all four switch positions, then press <strong>Check</strong>.</li>
      </ol>`,
    hints: [
      'Look at the truth table and find the two rows in which Lamp1 is on.',
      'The row "Switch1 on, Switch2 off" is NO(Switch1) in series with NC(Switch2).',
      'Put the two rows into the two paths of one branch, followed by a single Lamp1 coil: [ NO(Switch1) NC(Switch2) | NC(Switch1) NO(Switch2) ].'
    ],
    tests: [
      {
        name: 'Either switch toggles the light',
        steps: [
          { expect: { Lamp1: false }, msg: 'With both switches off, Lamp1 must be off' },
          { set: { Switch1: true }, wait: 50 },
          { expect: { Lamp1: true }, msg: 'Flipping Switch1 (bottom) must switch the light on' },
          { set: { Switch2: true }, wait: 50 },
          { expect: { Lamp1: false }, msg: 'Flipping Switch2 (top) must now switch the light off. With both switches on, Lamp1 is off' },
          { set: { Switch1: false }, wait: 50 },
          { expect: { Lamp1: true }, msg: 'Flipping Switch1 again must switch the light on (Switch1 off, Switch2 on)' },
          { set: { Switch2: false }, wait: 50 },
          { expect: { Lamp1: false }, msg: 'Flipping Switch2 again must switch the light off' }
        ]
      },
      {
        name: 'Switch2 alone',
        steps: [
          { set: { Switch2: true }, wait: 50 },
          { expect: { Lamp1: true }, msg: 'Starting with both switches off, Switch2 alone must switch the light on' },
          { set: { Switch2: false }, wait: 50 },
          { expect: { Lamp1: false }, msg: 'Switch2 off again must switch the light off' }
        ]
      }
    ],
    quiz: [
      { q: 'The coil Lamp is used in rung 1 and in rung 4. Which rung decides the value of Lamp?', options: ['Rung 1', 'Rung 4', 'Whichever rung has power'], answer: 1, explain: 'Rungs run from top to bottom, and the last coil overwrites the earlier ones.' },
      { q: 'Which expression does the rung [ NO(A) NO(B) | NO(C) ] COIL(Y) describe?', options: ['A AND (B OR C)', '(A AND B) OR C', 'A OR B OR C'], answer: 1, explain: 'A and B are in series in the upper path, C is the lower path.' },
      { q: 'In a staircase circuit with two switches, the lamp is on when...', options: ['both switches are on', 'the switches are in different positions', 'at least one switch is on'], answer: 1, explain: 'That is the exclusive OR: flipping either switch changes the result.' }
    ]
  });

  // =================================================================================
  // Chapter: ld-memory
  // =================================================================================

  const MOTOR_INIT = { Stop: true, Overload: true };

  L.register({
    id: 'ld-06-seal-in', chapter: 'ld-memory', order: 1,
    title: 'The seal-in circuit',
    goal: 'Build a start/stop circuit that keeps a motor running after Start is released, and explain why stop buttons are wired NC.',
    lang: 'LD', scene: 'motor',
    tags: io(MOTOR, ['Start', 'Stop', 'Overload', 'Motor']),
    starter: EMPTY,
    solution: ld([
      { comment: 'Start/stop with seal-in. Stop and Overload are wired NC, so they are TRUE in normal operation.', text: '[ NO(Start) | NO(Motor) ] NO(Stop) NO(Overload) COIL(Motor)' }
    ]),
    trace: ['Start', 'Stop', 'Overload', 'Motor'],
    theory: `
      <p>So far every output has followed its inputs: release the button and the lamp goes out. A motor, however, must keep running
      after the operator lets go of Start. The PLC has to <strong>remember</strong> that Start was pressed.</p>
      <h3>The seal-in circuit</h3>
      <p>The classic solution comes from relay control: put a contact of the output itself <strong>in parallel</strong> with the Start button.
      Once the coil is on, this <strong>holding contact</strong> keeps power flowing even after Start is released. The output "seals itself in".</p>
      <div class="ld-figure" data-rungs="[ NO(Pump_On) | NO(Pump) ] NO(Pump_Off) COIL(Pump)"></div>
      <p>To switch off, something in series must break the circuit: the stop button. It sits <strong>after</strong> the branch, so it breaks
      the Start path and the holding path. When both buttons are pressed, Stop wins. This is called <strong>stop priority</strong>.</p>
      <h3>Why stop buttons are wired NC</h3>
      <p>The red stop button in a cabinet is a <strong>normally closed</strong> device: current flows to the input until someone presses it.
      Its input is TRUE in normal operation and FALSE when pressed. The reason is safety. Think about a broken wire or a loose terminal:</p>
      <ul>
        <li>NC wiring: the input drops to FALSE, exactly as if Stop were pressed. The machine stops and the fault is noticed at once.</li>
        <li>NO wiring: the input is FALSE whether Stop is pressed or not. Nobody notices, until the day Stop is needed and does nothing.</li>
      </ul>
      <p>This is called <strong>wire-break safe</strong> wiring. The overload relay of a motor is wired the same way: TRUE means OK.</p>
      <p>In the program you therefore use a <strong>normally open</strong> contact for Stop: "allow running while the Stop signal is TRUE".
      An NC contact on an NC-wired stop button is a classic beginner mistake: the motor could only run while Stop is pressed.</p>
      <p>Note: an emergency stop must work even if the PLC fails, so it is hard-wired through safety relays. The Stop button here is a normal operational stop.</p>`,
    task: `
      <ol>
        <li>Rung 1: a branch with a NO contact <code>Start</code> in the upper path and a NO contact <code>Motor</code> (the holding contact) in the lower path.</li>
        <li>After the branch: a contact for <code>Stop</code>. Remember that Stop is TRUE while it is <em>not</em> pressed.</li>
        <li>Then a contact for <code>Overload</code>. The overload relay is wired like Stop: TRUE = OK.</li>
        <li>At the end: the coil <code>Motor</code>.</li>
        <li>Run: press and release Start, then press Stop. Also try Trip on the overload relay while the motor runs. Then press <strong>Check</strong>.</li>
      </ol>`,
    hints: [
      'Start only gives a short pulse. Something must keep the coil powered after Start is released: a contact of Motor itself, in parallel with Start.',
      'Stop is TRUE while it is NOT pressed. Use a NO contact for it, placed after the branch.',
      'Overload is wired like Stop: a NO contact in series.',
      'The finished rung: [ NO(Start) | NO(Motor) ] NO(Stop) NO(Overload) COIL(Motor).'
    ],
    tests: [
      {
        name: 'Start and stop',
        init: MOTOR_INIT,
        steps: [
          { expect: { Motor: false }, msg: 'After switching to RUN, the motor must be off' },
          { wait: 300 },
          { expect: { Motor: false }, msg: 'The motor must not start by itself. Did you use an NC contact for Stop? Stop is TRUE while it is not pressed' },
          { pulse: { Start: true }, ms: 150 },
          { expect: { Motor: true }, msg: 'Pressing Start must switch the motor on' },
          { wait: 500 },
          { expect: { Motor: true }, msg: 'The motor must keep running after Start is released (holding contact Motor in parallel with Start)' },
          { pulse: { Stop: false }, ms: 150 },
          { expect: { Motor: false }, msg: 'Pressing Stop must switch the motor off' },
          { wait: 500 },
          { expect: { Motor: false }, msg: 'The motor must stay off after Stop is released' },
          { pulse: { Start: true }, ms: 150 },
          { expect: { Motor: true }, msg: 'The motor must start again with Start after a stop' }
        ]
      },
      {
        name: 'Stop has priority',
        init: MOTOR_INIT,
        steps: [
          { set: { Stop: false }, wait: 50 },
          { pulse: { Start: true }, ms: 150 },
          { expect: { Motor: false }, msg: 'While Stop is held (or its wire is broken), Start must not switch the motor on' },
          { set: { Stop: true }, wait: 50 },
          { pulse: { Start: true }, ms: 150 },
          { expect: { Motor: true }, msg: 'Pressing Start must switch the motor on' },
          { set: { Start: true }, wait: 50 },
          { set: { Stop: false }, wait: 100 },
          { expect: { Motor: false }, msg: 'When Start and Stop are pressed together, Stop must win' },
          { set: { Start: false }, wait: 50 },
          { set: { Stop: true }, wait: 300 },
          { expect: { Motor: false }, msg: 'After Stop is released, the motor must stay off until Start is pressed again' }
        ]
      },
      {
        name: 'Overload relay stops the motor',
        init: MOTOR_INIT,
        steps: [
          { pulse: { Start: true }, ms: 150 },
          { expect: { Motor: true }, msg: 'Pressing Start must switch the motor on' },
          { set: { Overload: false }, wait: 50 },
          { expect: { Motor: false }, msg: 'When the overload relay trips (Overload FALSE), the motor must stop' },
          { set: { Overload: true }, wait: 300 },
          { expect: { Motor: false }, msg: 'After the overload relay is reset, the motor must not restart by itself' }
        ]
      }
    ],
    quiz: [
      { q: 'The Stop button is wired NC. Which contact do you use for it in the motor rung?', options: ['A normally closed contact, because the button is NC', 'A normally open contact, because the input is TRUE while Stop is not pressed', 'Either one works'], answer: 1, explain: 'The NO contact passes power while the Stop signal is TRUE, which is the normal state of an NC-wired button.' },
      { q: 'Why are stop buttons wired NC?', options: ['NC buttons are cheaper', 'A broken wire then stops the machine instead of hiding the fault', 'The PLC can only read NC inputs'], answer: 1, explain: 'With NC wiring a broken wire looks like a pressed Stop button, so the machine stops safely.' },
      { q: 'What keeps the motor on after Start is released?', options: ['The holding contact Motor in parallel with Start', 'The Stop contact', 'The PLC keeps all outputs on automatically'], answer: 0, explain: 'Once Motor is TRUE, its own contact powers the coil through the lower path of the branch.' }
    ]
  });

  L.register({
    id: 'ld-07-set-reset', chapter: 'ld-memory', order: 2,
    title: 'Set and reset coils',
    goal: 'Latch and unlatch a bit with Set and Reset coils and choose the priority by the order of the rungs.',
    lang: 'LD', scene: 'trainer',
    tags: io(TRAINER, ['Switch1', 'Button7', 'Lamp5']),
    starter: EMPTY,
    solution: ld([
      { comment: 'Acknowledge the alarm', text: 'NO(Button7) RESET(Lamp5)' },
      { comment: 'Latch the alarm. This rung comes last, so the alarm wins while the pressure is still too high.', text: 'NO(Switch1) SET(Lamp5)' }
    ]),
    trace: ['Switch1', 'Button7', 'Lamp5'],
    theory: `
      <p>The seal-in circuit stores one bit in a single rung. Ladder also has two special coils that store a bit directly:</p>
      <ul>
        <li><code>-(S)-</code> <strong>Set coil</strong>: when power reaches it, it writes TRUE. When no power reaches it, it does <em>nothing</em>, so the tag keeps its value.</li>
        <li><code>-(R)-</code> <strong>Reset coil</strong>: when power reaches it, it writes FALSE. Otherwise it does nothing.</li>
      </ul>
      <p>An ordinary coil writes TRUE or FALSE on every scan. A tag that has been set stays TRUE until a reset coil clears it,
      even long after the set condition has gone. That is why Set and Reset are also called <strong>latch</strong> and <strong>unlatch</strong>.</p>
      <div class="ld-figure" data-rungs="NO(Fault) SET(Alarm)||NO(Ack) RESET(Alarm)"></div>
      <h3>Who wins? The last rung</h3>
      <p>What if the set and the reset conditions are TRUE at the same time? The PLC executes the rungs from top to bottom.
      In the figure, rung 1 sets Alarm and then rung 2 resets it. The outputs are only written at the end of the scan,
      so the lamp gets the value from the <strong>last</strong> rung: here reset wins.</p>
      <p>You choose the priority with the order of the rungs. Choose it with safety in mind:</p>
      <ul>
        <li>For a motor, Stop must win: put the reset rung last.</li>
        <li>For an alarm, acknowledging must not clear an alarm whose cause is still there: put the set rung last.</li>
      </ul>
      <h3>Seal-in or set/reset?</h3>
      <p>Both store a bit. The seal-in keeps everything in one rung and has built-in stop priority, which is why it is popular for motors.
      Set and reset coils are handy when there are several set or reset conditions, or when they sit in different parts of the program.
      Keep the set and reset coils of one tag close together, so that the next person can follow the logic.</p>`,
    task: `
      <p>A pressure switch on a compressed-air tank is simulated by <code>Switch1</code> (ON = pressure too high).
      The red <code>Lamp5</code> is the alarm lamp, the black <code>Button7</code> is the acknowledge button.</p>
      <ol>
        <li>When Switch1 turns on, Lamp5 switches on and <strong>stays on</strong>, even after Switch1 has turned off again. The operator must notice short alarms too.</li>
        <li>Pressing Button7 acknowledges the alarm and switches Lamp5 off.</li>
        <li>As long as Switch1 is still on, acknowledging must not clear the alarm. Choose the order of your rungs accordingly.</li>
        <li>Use a Set coil and a Reset coil, then press <strong>Check</strong>.</li>
      </ol>`,
    hints: [
      'You need two rungs: Switch1 drives a Set coil Lamp5, Button7 drives a Reset coil Lamp5.',
      'The last rung wins. Which one must win while the pressure is still too high?',
      'Put the Reset rung first and the Set rung below it.'
    ],
    tests: [
      {
        name: 'The alarm latches',
        steps: [
          { expect: { Lamp5: false }, msg: 'Without an alarm, Lamp5 must be off' },
          { set: { Switch1: true }, wait: 50 },
          { expect: { Lamp5: true }, msg: 'When Switch1 turns on, Lamp5 must light' },
          { set: { Switch1: false }, wait: 50 },
          { always: { Lamp5: true }, for: 1000, msg: 'Lamp5 must stay on after Switch1 has turned off again (latched alarm)' },
          { pulse: { Button7: true }, ms: 150 },
          { expect: { Lamp5: false }, msg: 'Pressing Button7 must acknowledge the alarm and switch Lamp5 off' },
          { wait: 500 },
          { expect: { Lamp5: false }, msg: 'Lamp5 must stay off until the next alarm' }
        ]
      },
      {
        name: 'No acknowledge while the pressure is too high',
        steps: [
          { set: { Switch1: true }, wait: 50 },
          { expect: { Lamp5: true }, msg: 'When Switch1 turns on, Lamp5 must light' },
          { set: { Button7: true } },
          { always: { Lamp5: true }, for: 500, msg: 'While Switch1 is still on, pressing Button7 must not switch Lamp5 off. Which rung must come last?' },
          { set: { Button7: false }, wait: 50 },
          { set: { Switch1: false }, wait: 200 },
          { expect: { Lamp5: true }, msg: 'Lamp5 must stay on until it is acknowledged after the pressure is back to normal' },
          { pulse: { Button7: true }, ms: 150 },
          { expect: { Lamp5: false }, msg: 'Now that Switch1 is off, Button7 must switch Lamp5 off' }
        ]
      }
    ],
    quiz: [
      { q: 'Rung 1 sets Lamp, rung 2 resets Lamp. Both conditions are TRUE. What is Lamp at the end of the scan?', options: ['TRUE', 'FALSE', 'It flickers'], answer: 1, explain: 'The rungs run from top to bottom, and the reset in rung 2 is the last write.' },
      { q: 'What does a Set coil do while no power reaches it?', options: ['It writes FALSE', 'Nothing: the tag keeps its value', 'It inverts the tag'], answer: 1, explain: 'That is the difference to an ordinary coil, which writes FALSE when it has no power.' }
    ]
  });

  L.register({
    id: 'ld-08-edge-detection', chapter: 'ld-memory', order: 3,
    title: 'Edge detection',
    goal: 'Use a rising edge contact to react exactly once per button press, and build an impulse relay.',
    lang: 'LD', scene: 'trainer',
    tags: io(TRAINER, ['Button1', 'Lamp1']).concat([mem('Edge1', 'BOOL', 'One-scan pulse: Button1 has just been pressed')]),
    starter: ld([
      { comment: 'Toggle Lamp1 with Button1 (flickers!)', text: '[ NO(Button1) NC(Lamp1) | NC(Button1) NO(Lamp1) ] COIL(Lamp1)' }
    ]),
    solution: ld([
      { comment: 'Edge1 is TRUE for exactly one scan when Button1 is pressed', text: 'P(Button1) COIL(Edge1)' },
      { comment: 'Impulse relay: on each pulse Lamp1 takes the opposite value, otherwise it keeps its value', text: '[ NO(Edge1) NC(Lamp1) | NC(Edge1) NO(Lamp1) ] COIL(Lamp1)' }
    ]),
    trace: ['Button1', 'Edge1', 'Lamp1'],
    theory: `
      <p>Some tasks need a reaction to the <strong>moment</strong> a signal changes, not to its level.
      Example: one push button switches a light on, the next press switches it off again. With an ordinary contact this goes wrong because of the scan cycle.</p>
      <h3>Why a plain contact flickers</h3>
      <p>A press with your finger lasts about 0.2 s. With a scan time of 10 ms the PLC runs your program about 20 times during that press,
      and on every one of those scans the button contact is TRUE. A rung that says "while the button is pressed, invert the lamp"
      therefore inverts the lamp 20 times. The lamp flickers, and where it ends up when you let go is pure luck.</p>
      <h3>Edge contacts</h3>
      <ul>
        <li><code>-|P|-</code> <strong>Rising edge contact</strong>: passes power for exactly <strong>one scan</strong> when its tag changes from FALSE to TRUE.</li>
        <li><code>-|N|-</code> <strong>Falling edge contact</strong>: passes power for one scan when its tag changes from TRUE to FALSE.</li>
      </ul>
      <p>Each edge contact remembers the value of its tag from the previous scan and compares it with the current value.</p>
      <div class="ld-figure" data-rungs="P(Part_Sensor) COIL(Part_Pulse)"></div>
      <div class="td-figure" data-signals='[{"name":"Part_Sensor","wave":"0011110000111100"},{"name":"Part_Pulse","wave":"0010000000100000"}]' data-step="1 scan"></div>
      <p>However long the sensor stays TRUE, the pulse lasts one scan. A rung that reacts to the pulse reacts exactly once per event.
      Edges are used for counting parts, for toggling, and for any action that must happen once, such as storing a value.</p>
      <h3>Impulse relay</h3>
      <p>A light that is switched on and off by the same button is driven by an <strong>impulse relay</strong>, also called a toggle or flip-flop.
      Electricians use them in long corridors with many buttons. In the PLC you build it from two things you already know:
      a one-scan pulse, and the XOR from the staircase light. On a pulse the lamp takes its opposite value, otherwise it keeps its value.</p>
      <p>Careful with Set and Reset here: if one rung sets the lamp on the pulse, the next rung sees the lamp already on in the same scan and may reset it straight away.</p>`,
    task: `
      <p>The starter program tries to toggle <code>Lamp1</code> with <code>Button1</code>, using the XOR pattern from the staircase light.</p>
      <ol>
        <li>Run the starter, press and hold Button1. Watch Lamp1 flicker and see where it ends up when you let go.</li>
        <li>Add a rung that makes the internal tag <code>Edge1</code> TRUE for exactly one scan when Button1 is pressed (rising edge).</li>
        <li>Change the toggle rung so that it uses <code>Edge1</code> instead of <code>Button1</code>.</li>
        <li>Run again: every press must switch Lamp1 exactly once, on and off in turn, no matter how long you hold the button. Then press <strong>Check</strong>.</li>
      </ol>`,
    hints: [
      'The toggle rung itself is fine. The problem is that Button1 stays TRUE for many scans.',
      'A rising edge contact P(Button1) passes power for one scan per press. Write it to the coil Edge1 in a new rung.',
      'In the toggle rung, replace both Button1 contacts with Edge1: [ NO(Edge1) NC(Lamp1) | NC(Edge1) NO(Lamp1) ] COIL(Lamp1).'
    ],
    tests: [
      {
        name: 'First press switches Lamp1 on, without flicker',
        steps: [
          { expect: { Lamp1: false }, msg: 'At the start, Lamp1 must be off' },
          { set: { Button1: true }, wait: 50 },
          { expect: { Lamp1: true }, msg: 'Pressing Button1 must switch Lamp1 on' },
          { always: { Lamp1: true }, for: 1000, msg: 'Lamp1 must stay on steadily while Button1 is held (no flickering)' },
          { set: { Button1: false } },
          { always: { Lamp1: true }, for: 500, msg: 'Lamp1 must stay on after Button1 is released' }
        ]
      },
      {
        name: 'Second press switches Lamp1 off',
        steps: [
          { pulse: { Button1: true }, ms: 200 },
          { wait: 300 },
          { expect: { Lamp1: true }, msg: 'The first press must switch Lamp1 on' },
          { set: { Button1: true }, wait: 50 },
          { expect: { Lamp1: false }, msg: 'The second press must switch Lamp1 off' },
          { always: { Lamp1: false }, for: 1000, msg: 'Lamp1 must stay off while Button1 is held (no flickering)' },
          { set: { Button1: false } },
          { always: { Lamp1: false }, for: 500, msg: 'Lamp1 must stay off after Button1 is released' }
        ]
      },
      {
        name: 'Every press toggles exactly once',
        steps: [
          { pulse: { Button1: true }, ms: 100 },
          { wait: 100 },
          { expect: { Lamp1: true }, msg: 'Press 1 must switch Lamp1 on' },
          { pulse: { Button1: true }, ms: 400 },
          { wait: 100 },
          { expect: { Lamp1: false }, msg: 'Press 2 (a long one) must switch Lamp1 off' },
          { pulse: { Button1: true }, ms: 10 },
          { wait: 100 },
          { expect: { Lamp1: true }, msg: 'Press 3 (very short, one scan) must switch Lamp1 on' },
          { pulse: { Button1: true }, ms: 60 },
          { wait: 100 },
          { expect: { Lamp1: false }, msg: 'Press 4 must switch Lamp1 off' }
        ]
      }
    ],
    quiz: [
      { q: 'A button is held for 0.5 s and the scan time is 10 ms. For how many scans does a P contact on it pass power?', options: ['1', '50', '0'], answer: 0, explain: 'A rising edge contact passes power only on the scan in which the tag changes from FALSE to TRUE.' },
      { q: 'Which contact reacts when a button is released?', options: ['P (rising edge)', 'N (falling edge)', 'NC'], answer: 1, explain: 'Releasing the button changes the tag from TRUE to FALSE: a falling edge.' },
      { q: 'Why does a toggle with a plain NO contact on the button flicker?', options: ['The button bounces', 'The rung runs on every scan while the button is held and inverts the lamp each time', 'The lamp is broken'], answer: 1, explain: 'The program runs many times during one press, so it must react to the edge, not to the level.' }
    ]
  });

  L.register({
    id: 'ld-09-overload-fault', chapter: 'ld-memory', order: 4,
    title: 'Overload protection and fault lamp',
    goal: 'Stop a motor on an overload trip, latch a fault lamp, block restarting and acknowledge the fault safely.',
    lang: 'LD', scene: 'motor',
    tags: io(MOTOR, ['Start', 'Stop', 'Overload', 'Motor', 'Lamp_Run', 'Lamp_Fault']),
    starter: ld([
      { comment: 'Motor start/stop with seal-in (from "The seal-in circuit")', text: '[ NO(Start) | NO(Motor) ] NO(Stop) NO(Overload) COIL(Motor)' }
    ]),
    solution: ld([
      { comment: 'Acknowledge the fault with Stop (pressed = FALSE)', text: 'NC(Stop) RESET(Lamp_Fault)' },
      { comment: 'Latch the fault when the overload relay trips. This rung comes last, so a fault that is still present wins.', text: 'NC(Overload) SET(Lamp_Fault)' },
      { comment: 'Motor with seal-in; no start while the fault is latched', text: '[ NO(Start) | NO(Motor) ] NO(Stop) NO(Overload) NC(Lamp_Fault) COIL(Motor)' },
      { comment: 'Run lamp', text: 'NO(Motor) COIL(Lamp_Run)' }
    ]),
    trace: ['Start', 'Stop', 'Overload', 'Motor', 'Lamp_Fault'],
    theory: `
      <p>A motor that is jammed or overloaded draws too much current and heats up. The <strong>thermal overload relay</strong> (F2 in the cabinet)
      measures the current with bimetal strips. If the current is too high for too long, the relay <strong>trips</strong> and opens its auxiliary contact.
      Like the stop button, that contact is wired NC: the Overload input is TRUE while all is well, and FALSE when the relay has tripped or the wire is broken.</p>
      <h3>What the program must do</h3>
      <ul>
        <li><strong>Stop the motor at once</strong> when the relay trips.</li>
        <li><strong>Show the fault</strong> with the red lamp. A bimetal relay cools down after a while and can then be reset.
        If the fault lamp simply followed the input, it would go out before anyone had looked. So the fault is <strong>latched</strong> and stays on until an operator acknowledges it.</li>
        <li><strong>Block restarting</strong> until the fault is acknowledged. Someone has to look at the machine first: a jammed conveyor will trip the relay again, or worse.</li>
        <li><strong>Acknowledge only a cleared fault.</strong> While the relay is still tripped, acknowledging must not clear the fault lamp.</li>
      </ul>
      <p>Many machines use the Stop button to acknowledge. Pressing Stop is a safe action: it can never start anything.</p>
      <h3>Latching a fault from an NC-wired signal</h3>
      <p>An NC contact on an NC-wired signal reads "when the device reports a problem". Combined with a Set coil it latches the fault:</p>
      <div class="ld-figure" data-rungs="NC(Oil_Level_OK) SET(Pump_Fault)"></div>
      <p>Remember the rule from the Set/Reset lesson: the last rung wins. Use it to decide what happens when the fault is still present while the operator acknowledges.</p>
      <h3>Outputs as conditions</h3>
      <p>Output tags can be used in contacts like any other tag. A contact on <code>Lamp_Fault</code> in the motor rung is a simple way to block starting while the fault is latched,
      and a contact on <code>Motor</code> can drive the run lamp.</p>`,
    task: `
      <p>The starter program contains the seal-in circuit from the lesson before. Extend it:</p>
      <ol>
        <li>When <code>Overload</code> turns FALSE (relay tripped), <code>Motor</code> must switch off immediately. The starter already does this: keep it.</li>
        <li>Latch the red lamp <code>Lamp_Fault</code> when the overload relay trips. It must stay on after the relay has been reset.</li>
        <li>While <code>Lamp_Fault</code> is on, <code>Start</code> must not start the motor.</li>
        <li>Pressing <code>Stop</code> acknowledges the fault and switches <code>Lamp_Fault</code> off, but only if the overload relay is OK again (<code>Overload</code> TRUE).</li>
        <li>The green lamp <code>Lamp_Run</code> is on while the motor runs.</li>
        <li>Test it in the scene: start the motor, click Trip on the overload relay, click Reset, try Start, press Stop, start again. Then press <strong>Check</strong>.</li>
      </ol>`,
    hints: [
      'NC(Overload) passes power when the relay has tripped. Use it with a Set coil on Lamp_Fault.',
      'Pressing Stop makes the Stop input FALSE, so the acknowledge rung is NC(Stop) with a Reset coil on Lamp_Fault.',
      'Put the Set rung below the Reset rung: a fault that is still present then wins over the acknowledge.',
      'In the motor rung, add NC(Lamp_Fault) in series. Lamp_Run gets its own rung: NO(Motor) COIL(Lamp_Run).'
    ],
    tests: [
      {
        name: 'Start, stop and run lamp',
        init: MOTOR_INIT,
        steps: [
          { expect: { Motor: false, Lamp_Run: false, Lamp_Fault: false }, msg: 'After switching to RUN, the motor and both lamps must be off' },
          { pulse: { Start: true }, ms: 150 },
          { expect: { Motor: true, Lamp_Run: true }, msg: 'Start must switch the motor on and light Lamp_Run' },
          { wait: 300 },
          { expect: { Motor: true, Lamp_Run: true, Lamp_Fault: false }, msg: 'The motor must keep running after Start is released' },
          { pulse: { Stop: false }, ms: 150 },
          { expect: { Motor: false, Lamp_Run: false }, msg: 'Stop must switch the motor and Lamp_Run off' }
        ]
      },
      {
        name: 'Overload trip stops the motor and latches the fault lamp',
        init: MOTOR_INIT,
        steps: [
          { pulse: { Start: true }, ms: 150 },
          { expect: { Motor: true }, msg: 'Start must switch the motor on' },
          { set: { Overload: false }, wait: 50 },
          { expect: { Motor: false, Lamp_Run: false, Lamp_Fault: true }, msg: 'When the overload relay trips, the motor must stop, Lamp_Run must go off and Lamp_Fault must light' },
          { set: { Overload: true }, wait: 500 },
          { expect: { Lamp_Fault: true, Motor: false }, msg: 'Lamp_Fault must stay on after the overload relay has been reset, until the operator acknowledges with Stop' }
        ]
      },
      {
        name: 'No restart before the fault is acknowledged',
        init: MOTOR_INIT,
        steps: [
          { pulse: { Start: true }, ms: 150 },
          { set: { Overload: false }, wait: 100 },
          { set: { Overload: true }, wait: 200 },
          { pulse: { Start: true }, ms: 150 },
          { expect: { Motor: false }, msg: 'The motor must not start while Lamp_Fault is on' },
          { pulse: { Stop: false }, ms: 150 },
          { expect: { Lamp_Fault: false }, msg: 'Pressing Stop must acknowledge the fault and switch Lamp_Fault off (the overload relay is OK again)' },
          { pulse: { Start: true }, ms: 150 },
          { expect: { Motor: true, Lamp_Run: true }, msg: 'After acknowledging, Start must work again' }
        ]
      },
      {
        name: 'Acknowledge only when the overload relay is OK',
        init: MOTOR_INIT,
        steps: [
          { pulse: { Start: true }, ms: 150 },
          { set: { Overload: false }, wait: 100 },
          { set: { Stop: false } },
          { always: { Lamp_Fault: true }, for: 300, msg: 'While the overload relay is still tripped, pressing Stop must not clear Lamp_Fault' },
          { set: { Stop: true }, wait: 100 },
          { expect: { Lamp_Fault: true }, msg: 'Lamp_Fault must stay on while the overload relay is tripped' },
          { pulse: { Start: true }, ms: 150 },
          { expect: { Motor: false }, msg: 'The motor must not start while the overload relay is tripped' },
          { set: { Overload: true }, wait: 100 },
          { pulse: { Stop: false }, ms: 150 },
          { expect: { Lamp_Fault: false }, msg: 'Once the relay is OK again, Stop must clear Lamp_Fault' }
        ]
      }
    ],
    quiz: [
      { q: 'Overload is TRUE while the overload relay is OK. Which contact passes power when the relay has tripped?', options: ['NO(Overload)', 'NC(Overload)', 'P(Overload)'], answer: 1, explain: 'A tripped relay makes the input FALSE, and an NC contact passes power on FALSE.' },
      { q: 'Why is the fault lamp latched instead of following the Overload input?', options: ['The relay may be reset before anyone has seen the fault', 'Lamps always need a Set coil', 'To save an output'], answer: 0, explain: 'The latch makes sure that someone notices and acknowledges the fault.' },
      { q: 'Why is Stop a good button to acknowledge a fault?', options: ['Pressing Stop can never start the machine', 'It is the only button left', 'Stop is wired NO'], answer: 0, explain: 'Acknowledging should be a safe action, and Stop only ever stops.' }
    ]
  });

  // =================================================================================
  // Chapter: ld-timers
  // =================================================================================

  L.register({
    id: 'ld-10-ton', chapter: 'ld-timers', order: 1,
    title: 'On-delay timer TON',
    goal: 'Delay a signal with a TON timer and explain its inputs IN and PT and its outputs Q and ET.',
    lang: 'LD', scene: 'trainer',
    tags: io(TRAINER, ['Switch1', 'Lamp5']).concat([mem('T1', 'TON', 'On-delay for the high-level alarm')]),
    starter: EMPTY,
    solution: ld([
      { comment: 'High-level alarm: only when the float switch has been on for 3 s without interruption', text: 'NO(Switch1) TON(T1, PT=T#3s) COIL(Lamp5)' }
    ]),
    trace: ['Switch1', 'Lamp5'],
    theory: `
      <p>Timers let the PLC react to how long something lasts. IEC 61131-3 defines them as <strong>function blocks</strong>: boxes with inputs and
      outputs that keep their own memory. Every timer box needs its own <strong>instance</strong>, a tag of type <code>TON</code> such as <code>T1</code>.</p>
      <div class="ld-figure" data-rungs="NO(Go) TON(T1, PT=T#5s) COIL(Lamp)"></div>
      <h3>On-delay: TON</h3>
      <ul>
        <li><strong>IN</strong>: the rung powers this input. While IN is TRUE, the timer runs.</li>
        <li><strong>PT</strong> (preset time): how long IN must stay TRUE, written as a time literal such as <code>T#3s</code>, <code>T#500ms</code> or <code>T#1m30s</code>.</li>
        <li><strong>Q</strong>: the output that powers the rest of the rung. It turns TRUE once IN has been TRUE for PT <strong>without interruption</strong>.</li>
        <li><strong>ET</strong> (elapsed time): how long the timer has been running, from 0 up to PT. You can watch it as <code>T1.ET</code>.</li>
      </ul>
      <p>As soon as IN turns FALSE, the timer resets: Q goes FALSE and ET goes back to 0. The next time IN turns TRUE, it starts from zero again.</p>
      <div class="td-figure" data-signals='[{"name":"IN","wave":"0110001111110"},{"name":"Q","wave":"0000000001110"}]' data-step="1 s"></div>
      <p>In this diagram PT is 3 s. The first pulse on IN lasts only 2 s, so Q stays off. The second pulse is long enough:
      Q turns on 3 s after IN and goes off together with IN.</p>
      <h3>Where on-delays are used</h3>
      <ul>
        <li>Filtering a sensor that bounces or splashes: only a signal that stays on counts.</li>
        <li>Star-delta starting of large motors: switch from star to delta after a few seconds.</li>
        <li>Waiting until a cylinder or a valve has really moved before the next step.</li>
      </ul>`,
    task: `
      <p>A float switch in a tank (<code>Switch1</code>) reports a high level. When the liquid sloshes, the switch flips on and off for a moment.
      The red alarm lamp <code>Lamp5</code> must only light when the switch has been on for <strong>3 s without interruption</strong>.</p>
      <ol>
        <li>Add a NO contact <code>Switch1</code>.</li>
        <li>After it, add a TON box with the instance <code>T1</code> and PT = <code>T#3s</code>.</li>
        <li>After the timer, add the coil <code>Lamp5</code>.</li>
        <li>Run. Switch Switch1 on and off quickly, then leave it on and count to three. Lamp5 must go off as soon as Switch1 is off.</li>
        <li>Press <strong>Check</strong>.</li>
      </ol>`,
    hints: [
      'The timer box sits between the contact and the coil, just like a contact.',
      'Write the preset time as a time literal: T#3s.',
      'The rung: NO(Switch1), TON(T1, PT=T#3s), coil Lamp5.'
    ],
    tests: [
      {
        name: 'Short signals are ignored',
        steps: [
          { set: { Switch1: true } },
          { never: { Lamp5: true }, for: 2000, msg: 'Lamp5 must not light when Switch1 has been on for only 2 s' },
          { set: { Switch1: false }, wait: 100 },
          { set: { Switch1: true } },
          { never: { Lamp5: true }, for: 2000, msg: 'The delay must start from zero each time Switch1 turns on (2 s plus 2 s is not 3 s without interruption)' },
          { set: { Switch1: false }, wait: 100 },
          { expect: { Lamp5: false }, msg: 'With Switch1 off, Lamp5 must be off' }
        ]
      },
      {
        name: 'Alarm after 3 s',
        steps: [
          { set: { Switch1: true } },
          { waitUntil: { Lamp5: true }, min: 2800, timeout: 3300, msg: 'Lamp5 must light 3 s after Switch1 turns on' },
          { wait: 1000 },
          { expect: { Lamp5: true }, msg: 'Lamp5 must stay on while Switch1 stays on' },
          { set: { Switch1: false } },
          { expect: { Lamp5: false }, msg: 'Lamp5 must go off as soon as Switch1 turns off' }
        ]
      }
    ],
    quiz: [
      { q: 'A TON with PT = T#5s has IN TRUE for 4 s, then FALSE for 1 s, then TRUE again. When does Q turn on?', options: ['At once, when IN turns TRUE again', '1 s after IN turns TRUE again', '5 s after IN turns TRUE again'], answer: 2, explain: 'A TON starts from zero each time IN turns TRUE. It does not add up the 4 s from before.' },
      { q: 'What does ET of a TON show?', options: ['The preset time', 'The time since IN turned TRUE, up to PT', 'The time since the PLC was started'], answer: 1, explain: 'ET counts while IN is TRUE and stops at PT.' },
      { q: 'How do you write one and a half seconds as a time literal?', options: ['T#1s500ms', '1.5s', 'TIME 1,5'], answer: 0, explain: 'Time literals start with T# and combine units such as m, s and ms.' }
    ]
  });

  L.register({
    id: 'ld-11-tof', chapter: 'ld-timers', order: 2,
    title: 'Off-delay timer TOF',
    goal: 'Keep an output on for a while after its condition has gone, using a TOF timer.',
    lang: 'LD', scene: 'trainer',
    tags: io(TRAINER, ['Button1', 'Lamp1']).concat([mem('T1', 'TOF', 'Off-delay for the staircase light')]),
    starter: EMPTY,
    solution: ld([
      { comment: 'Staircase light: on at once, off 5 s after the button is released', text: 'NO(Button1) TOF(T1, PT=T#5s) COIL(Lamp1)' }
    ]),
    trace: ['Button1', 'Lamp1'],
    theory: `
      <p>The off-delay timer <strong>TOF</strong> works the other way round from the TON: its output Q turns on <strong>at once</strong> with IN,
      and stays on for the preset time PT <strong>after</strong> IN has turned FALSE.</p>
      <div class="td-figure" data-signals='[{"name":"IN","wave":"0111000000000"},{"name":"Q","wave":"0111111110000"}]' data-step="1 s"></div>
      <p>Here PT is 5 s: Q goes FALSE 5 s after the falling edge of IN.</p>
      <ul>
        <li>While IN is TRUE, Q is TRUE and ET stays at 0.</li>
        <li>When IN turns FALSE, ET counts from 0 up to PT. Then Q turns FALSE.</li>
        <li>If IN turns TRUE again before PT has run out, the delay is cancelled. The full delay starts again at the next falling edge.</li>
      </ul>
      <div class="ld-figure" data-rungs="NO(Motor) TOF(T2, PT=T#2m) COIL(Fan)"></div>
      <p>This rung keeps a cooling fan running for 2 minutes after the motor stops. <code>T#2m</code> is the time literal for 2 minutes.</p>
      <h3>Where off-delays are used</h3>
      <ul>
        <li>Staircase and corridor lights that switch themselves off.</li>
        <li>Fans that keep cooling a motor, a lamp or a power supply after it has been switched off.</li>
        <li>Bridging short dropouts of a signal, for example a light barrier that sees the small gap between two boxes on a conveyor.</li>
      </ul>`,
    task: `
      <p>Build a staircase light. <code>Button1</code> stands for the push buttons on all floors (they are wired in parallel to one input), <code>Lamp1</code> is the light.</p>
      <ol>
        <li>Pressing Button1 switches Lamp1 on at once.</li>
        <li>Lamp1 stays on while Button1 is held, and for 5 s after it is released.</li>
        <li>Pressing Button1 again while the light is on starts the 5 s from the beginning.</li>
        <li>Use the TOF instance <code>T1</code> with PT = <code>T#5s</code>, then press <strong>Check</strong>.</li>
      </ol>`,
    hints: [
      'Which timer switches its output on at once and off later? It is not the TON.',
      'The rung looks like the TON rung from the last lesson, only with a TOF box.',
      'The rung: NO(Button1), TOF(T1, PT=T#5s), coil Lamp1.'
    ],
    tests: [
      {
        name: 'Light on at once, off 5 s after release',
        steps: [
          { expect: { Lamp1: false }, msg: 'At the start, Lamp1 must be off' },
          { set: { Button1: true } },
          { expect: { Lamp1: true }, msg: 'Pressing Button1 must switch the light on at once' },
          { wait: 3000 },
          { expect: { Lamp1: true }, msg: 'The light must stay on while Button1 is held' },
          { set: { Button1: false } },
          { always: { Lamp1: true }, for: 4800, msg: 'The light must stay on for 5 s after Button1 is released' },
          { waitUntil: { Lamp1: false }, timeout: 500, msg: 'The light must go off 5 s after Button1 is released' },
          { never: { Lamp1: true }, for: 1000, msg: 'The light must stay off until the next press' }
        ]
      },
      {
        name: 'Pressing again restarts the 5 s',
        steps: [
          { pulse: { Button1: true }, ms: 200 },
          { wait: 3000 },
          { expect: { Lamp1: true }, msg: 'The light must still be on 3 s after the press' },
          { pulse: { Button1: true }, ms: 200 },
          { always: { Lamp1: true }, for: 4500, msg: 'Pressing Button1 again while the light is on must start the 5 s again' },
          { waitUntil: { Lamp1: false }, timeout: 1000, msg: 'The light must go off 5 s after the last press' }
        ]
      }
    ],
    quiz: [
      { q: 'IN of a TOF with PT = T#5s is TRUE for 10 s and then turns FALSE. How long is Q TRUE in total?', options: ['5 s', '10 s', '15 s'], answer: 2, explain: 'Q is TRUE for the 10 s of IN plus the 5 s delay after IN turns FALSE.' },
      { q: 'Which timer fits a fan that must run on for 2 minutes after the machine stops?', options: ['TON', 'TOF', 'TP'], answer: 1, explain: 'The off-delay keeps the output on for PT after its input turns FALSE.' }
    ]
  });

  L.register({
    id: 'ld-12-tp-blinker', chapter: 'ld-timers', order: 3,
    title: 'Pulse timer TP and a blinker',
    goal: 'Produce a pulse of fixed length with TP, and build a blinker from two on-delay timers.',
    lang: 'LD', scene: 'trainer',
    tags: io(TRAINER, ['Button1', 'Switch1', 'Lamp1', 'Lamp5']).concat([
      mem('T1', 'TP', 'Door opener pulse (2 s)'),
      mem('T2', 'TON', 'Blinker: dark phase (0.5 s)'),
      mem('T3', 'TON', 'Blinker: lit phase (0.5 s)')
    ]),
    starter: EMPTY,
    solution: ld([
      { comment: 'Door opener: a fixed 2 s pulse on each press', text: 'NO(Button1) TP(T1, PT=T#2s) COIL(Lamp1)' },
      { comment: 'Blinker: T2 times the dark phase. When it is done, Lamp5 lights.', text: 'NO(Switch1) NC(T3.Q) TON(T2, PT=T#500ms) COIL(Lamp5)' },
      { comment: 'T3 times the lit phase. When it is done, it breaks the rung above for one scan and the cycle starts again.', text: 'NO(T2.Q) TON(T3, PT=T#500ms)' }
    ]),
    trace: ['Button1', 'Lamp1', 'Switch1', 'Lamp5'],
    theory: `
      <p>The <strong>pulse timer TP</strong> produces a pulse of fixed length. A rising edge on IN starts the pulse: Q is TRUE for exactly PT,
      no matter whether IN is held, released or pressed again in the meantime.</p>
      <div class="td-figure" data-signals='[{"name":"IN","wave":"0111110001000"},{"name":"Q","wave":"0110000001100"}]' data-step="1 s"></div>
      <p>Here PT is 2 s. The first, long press gives a 2 s pulse, and so does the second, very short press.
      A new pulse can only start after the current one has ended, with a new rising edge on IN.</p>
      <div class="ld-figure" data-rungs="NO(Part_Rejected) TP(T1, PT=T#300ms) COIL(Air_Blast)"></div>
      <p>This rung blows a rejected part off a conveyor with an air blast of exactly 0.3 s, however long the sensor sees the part.</p>
      <h3>A blinker from two timers</h3>
      <p>A flashing lamp gets more attention than a steady one, so warning and fault lamps often flash. Many PLCs offer ready-made clock bits,
      but you can build your own blinker from two TON timers that switch each other:</p>
      <ul>
        <li>Timer A runs while the blinker is enabled and timer B is <em>not</em> done. While A runs, the lamp is dark. When A is done, the lamp lights.</li>
        <li>Timer B runs while A is done. When B is done, it breaks the rung of A for one scan. A resets, which resets B, and everything starts again.</li>
      </ul>
      <p>You reach the outputs of a timer instance with a dot, for example <code>T3.Q</code> or <code>T3.ET</code>, and you can use <code>T3.Q</code>
      in an NO or NC contact like any other BOOL tag. A rung may also end with a timer box instead of a coil.</p>`,
    task: `
      <ol>
        <li><strong>Door opener.</strong> <code>Lamp1</code> stands for an electric door opener. A press on <code>Button1</code> releases the door for exactly 2 s.
        Holding the button longer, or pressing it again during the pulse, must not make the pulse longer. Use the TP instance <code>T1</code>.</li>
        <li><strong>Blinker.</strong> While <code>Switch1</code> is on, the warning lamp <code>Lamp5</code> flashes: 0.5 s on, 0.5 s off. Use the TON instances <code>T2</code> and <code>T3</code> with PT = <code>T#500ms</code>.</li>
        <li>While Switch1 is off, Lamp5 is off.</li>
        <li>Press <strong>Check</strong>.</li>
      </ol>`,
    hints: [
      'Door opener: one rung with NO(Button1), a TP box T1 with PT = T#2s, and the coil Lamp1.',
      'Blinker: T2 runs while Switch1 is on and T3 is not done: NO(Switch1) NC(T3.Q) TON(T2, PT=T#500ms). Its output drives Lamp5.',
      'T3 runs while T2 is done: a rung NO(T2.Q) TON(T3, PT=T#500ms). It needs no coil.'
    ],
    tests: [
      {
        name: 'Door opener: fixed 2 s pulse',
        steps: [
          { expect: { Lamp1: false }, msg: 'At the start, Lamp1 must be off' },
          { pulse: { Button1: true }, ms: 100 },
          { expect: { Lamp1: true }, msg: 'A short press on Button1 must switch Lamp1 on' },
          { always: { Lamp1: true }, for: 1700, msg: 'Lamp1 must stay on for 2 s, even after Button1 is released' },
          { waitUntil: { Lamp1: false }, timeout: 400, msg: 'Lamp1 must switch off 2 s after the press' }
        ]
      },
      {
        name: 'Holding the button does not lengthen the pulse',
        steps: [
          { set: { Button1: true } },
          { expect: { Lamp1: true }, msg: 'Pressing Button1 must switch Lamp1 on' },
          { waitUntil: { Lamp1: false }, min: 1800, timeout: 2300, msg: 'Lamp1 must switch off after 2 s even while Button1 is still held' },
          { never: { Lamp1: true }, for: 1000, msg: 'Lamp1 must stay off while Button1 is still held after the pulse' },
          { set: { Button1: false }, wait: 200 },
          { expect: { Lamp1: false }, msg: 'Releasing Button1 must not start a new pulse' }
        ]
      },
      {
        name: 'A second press during the pulse does not extend it',
        steps: [
          { pulse: { Button1: true }, ms: 100 },
          { wait: 1000 },
          { pulse: { Button1: true }, ms: 100 },
          { waitUntil: { Lamp1: false }, timeout: 1100, msg: 'Pressing Button1 again during the pulse must not make it longer: the pulse ends 2 s after the first press' }
        ]
      },
      {
        name: 'Blinker on Lamp5',
        steps: [
          { never: { Lamp5: true }, for: 1000, msg: 'Lamp5 must be off while Switch1 is off' },
          { set: { Switch1: true } },
          { waitUntil: { Lamp5: true }, timeout: 800, msg: 'Lamp5 must start flashing when Switch1 is on' },
          { waitUntil: { Lamp5: false }, min: 400, timeout: 700, msg: 'Lamp5 must stay on for about 0.5 s, then go off' },
          { waitUntil: { Lamp5: true }, min: 400, timeout: 700, msg: 'Lamp5 must stay off for about 0.5 s, then come on again' },
          { waitUntil: { Lamp5: false }, min: 400, timeout: 700, msg: 'Lamp5 must keep flashing: about 0.5 s on' },
          { waitUntil: { Lamp5: true }, min: 400, timeout: 700, msg: 'Lamp5 must keep flashing: about 0.5 s off' },
          { waitUntil: { Lamp5: false }, min: 400, timeout: 700, msg: 'Lamp5 must keep flashing: about 0.5 s on' },
          { set: { Switch1: false }, wait: 50 },
          { never: { Lamp5: true }, for: 1500, msg: 'Lamp5 must stop flashing and stay off when Switch1 is turned off' }
        ]
      }
    ],
    quiz: [
      { q: 'A TP has PT = T#2s. IN is held for 5 s. How long is Q TRUE?', options: ['2 s', '5 s', '7 s'], answer: 0, explain: 'The pulse length is fixed by PT and does not depend on how long IN stays TRUE.' },
      { q: 'In the two-timer blinker, what makes the cycle start again?', options: ['The second timer breaks the rung of the first timer through an NC contact', 'The PLC restarts timers automatically', 'A Set coil'], answer: 0, explain: 'For one scan the first timer loses its input, resets, and the second timer resets with it.' }
    ]
  });

  L.register({
    id: 'ld-13-timed-sequence', chapter: 'ld-timers', order: 4,
    title: 'Timed sequence: traffic light',
    goal: 'Run outputs through a fixed cycle of timed steps with a chain of timers.',
    lang: 'LD', scene: 'traffic',
    tags: io(TRAFFIC, ['Main_Red', 'Main_Yellow', 'Main_Green']).concat([
      mem('T1', 'TON', 'Green time (5 s)'),
      mem('T2', 'TON', 'Yellow time (2 s)'),
      mem('T3', 'TON', 'Red time (5 s)')
    ]),
    starter: EMPTY,
    solution: ld([
      { comment: 'Step 1 timer: green time. T3 resets the whole chain at the end of the cycle.', text: 'NC(T3.Q) TON(T1, PT=T#5s)' },
      { comment: 'Step 2 timer: yellow time, starts when green is over', text: 'NO(T1.Q) TON(T2, PT=T#2s)' },
      { comment: 'Step 3 timer: red time, starts when yellow is over', text: 'NO(T2.Q) TON(T3, PT=T#5s)' },
      { comment: 'Green while T1 is still running', text: 'NC(T1.Q) COIL(Main_Green)' },
      { comment: 'Yellow while T2 is running', text: 'NO(T1.Q) NC(T2.Q) COIL(Main_Yellow)' },
      { comment: 'Red while T3 is running', text: 'NO(T2.Q) COIL(Main_Red)' }
    ]),
    trace: ['Main_Green', 'Main_Yellow', 'Main_Red'],
    theory: `
      <p>Many machines work in <strong>steps</strong> that follow each other in a fixed order: fill, heat, stir, empty.
      When every step simply lasts a certain time, you can build the sequence from a <strong>chain of timers</strong>.</p>
      <h3>Timer chain</h3>
      <p>Each timer starts when the one before it is done: the Q output of timer 1 is the condition for timer 2, and so on.
      The last timer breaks the rung of the first one through an NC contact. That resets the whole chain for one scan, and the cycle begins again.</p>
      <div class="ld-figure" data-rungs="NC(T2.Q) TON(T1, PT=T#4s)||NO(T1.Q) TON(T2, PT=T#1s)"></div>
      <p>This chain has two steps: 4 s, then 1 s, then it repeats. To find out which step is active, look at which timers are done.
      Step 1 runs while T1 is not done yet. Step 2 runs while T1 is done but T2 is not. Each output is decoded from the timer outputs with NO and NC contacts in its own rung.</p>
      <h3>Step bits</h3>
      <p>Larger sequences use one memory bit per step (Step1, Step2, ...). A step bit is set when its step begins and reset when the next step begins,
      using the Set and Reset coils you already know. The outputs are then simple: green is on while Step1 is set.
      Step bits make it easy to add conditions such as "wait for a sensor" or "wait for a pedestrian request", which a pure timer chain cannot do.
      For a cycle that depends only on time, the timer chain is shorter.</p>
      <h3>Timing in a real PLC</h3>
      <p>A timer is only checked once per scan, so every time can end up to one scan late, and the restart of a chain costs a scan or two.
      With a 10 ms scan that does not matter for a traffic light, and the checker accepts small deviations.</p>
      <p>In many countries red is followed by a short red and yellow phase before green. Once your light works, you could add it as an extra step.</p>`,
    task: `
      <p>Control the traffic light of the main road. The side road and the pedestrian lights are not used in this lesson.</p>
      <ol>
        <li>When the PLC starts, the main road shows green (<code>Main_Green</code>).</li>
        <li>After 5 s of green: yellow (<code>Main_Yellow</code>) for 2 s.</li>
        <li>Then red (<code>Main_Red</code>) for 5 s.</li>
        <li>Then green again, and so on, as long as the PLC is in RUN.</li>
        <li>Exactly one of the three lights is on at any time.</li>
        <li>Use the timers <code>T1</code> (green time), <code>T2</code> (yellow time) and <code>T3</code> (red time), then press <strong>Check</strong>.</li>
      </ol>`,
    hints: [
      'Start with the timer rungs. T1 runs while T3 is not done, T2 runs while T1 is done, T3 runs while T2 is done.',
      'Then decode the lights: green while T1 is not done; yellow while T1 is done AND T2 is not done; red while T2 is done.',
      'Timer rungs: NC(T3.Q) TON(T1, PT=T#5s); NO(T1.Q) TON(T2, PT=T#2s); NO(T2.Q) TON(T3, PT=T#5s).'
    ],
    tests: [
      {
        name: 'Green, yellow, red, green',
        steps: [
          { waitUntil: { Main_Green: true }, timeout: 200, msg: 'The cycle must start with green' },
          { expect: { Main_Yellow: false, Main_Red: false }, msg: 'While green is on, yellow and red must be off' },
          { waitUntil: { Main_Yellow: true }, min: 4800, timeout: 5300, msg: 'Green must last 5 s, then yellow must come on' },
          { expect: { Main_Green: false, Main_Red: false }, msg: 'When yellow comes on, green must go off' },
          { waitUntil: { Main_Red: true }, min: 1800, timeout: 2300, msg: 'Yellow must last 2 s, then red must come on' },
          { expect: { Main_Green: false, Main_Yellow: false }, msg: 'When red comes on, yellow must go off' },
          { waitUntil: { Main_Green: true }, min: 4800, timeout: 5300, msg: 'Red must last 5 s, then green must come on again' },
          { expect: { Main_Yellow: false, Main_Red: false }, msg: 'When green comes back, red must go off' },
          { waitUntil: { Main_Yellow: true }, min: 4800, timeout: 5300, msg: 'In the second cycle, green must again last 5 s' },
          { waitUntil: { Main_Red: true }, min: 1800, timeout: 2300, msg: 'In the second cycle, yellow must again last 2 s' }
        ]
      },
      {
        name: 'Never two lights at once',
        steps: [
          { never: '(Main_Red AND Main_Yellow) OR (Main_Red AND Main_Green) OR (Main_Yellow AND Main_Green)', for: 26000, msg: 'Two lights of the main road must never be on at the same time' }
        ]
      }
    ],
    quiz: [
      { q: 'In a timer chain, how does the cycle start again?', options: ['The last timer breaks the rung of the first timer through an NC contact', 'The PLC restarts the program', 'It does not: a chain runs only once'], answer: 0, explain: 'Resetting the first timer resets every timer that depends on it.' },
      { q: 'Why may a TON with PT = T#2s finish after 2.01 s?', options: ['Timers are only checked once per scan', 'The timer is broken', 'Time literals are rounded to whole seconds'], answer: 0, explain: 'The timer can only notice that PT has passed on the next scan.' },
      { q: 'What is an advantage of step bits over a pure timer chain?', options: ['Steps can also wait for sensors or requests', 'They need no tags', 'They are always shorter'], answer: 0, explain: 'A step bit can be set by any condition, not only by a timer.' }
    ]
  });

  L.register({
    id: 'ld-14-tonr', chapter: 'ld-timers', order: 5,
    title: 'Retentive timer TONR',
    goal: 'Add up the running time of a machine over several runs with a TONR timer and reset it after service.',
    lang: 'LD', scene: 'trainer',
    tags: io(TRAINER, ['Switch1', 'Button8', 'Lamp3']).concat([mem('T1', 'TONR', 'Operating time until the next service')]),
    starter: EMPTY,
    solution: ld([
      { comment: 'Operating-hours counter: add up the motor running time, reset after service', text: 'NO(Switch1) TONR(T1, R=Button8, PT=T#10s) COIL(Lamp3)' }
    ]),
    trace: ['Switch1', 'Button8', 'Lamp3'],
    theory: `
      <p>A TON forgets its elapsed time whenever IN turns FALSE. Sometimes you need the opposite: add up the time over many separate periods.
      That is the job of the <strong>retentive on-delay timer TONR</strong>.</p>
      <ul>
        <li>While IN is TRUE, ET counts up. When IN turns FALSE, ET <strong>keeps</strong> its value instead of going back to 0.</li>
        <li>Q turns TRUE when ET reaches PT, and stays TRUE even when IN turns FALSE.</li>
        <li>Only the reset input <strong>R</strong> sets ET back to 0, and Q back to FALSE.</li>
      </ul>
      <div class="td-figure" data-signals='[{"name":"IN","wave":"0110011000110000"},{"name":"R","wave":"0000000000000100"},{"name":"Q","wave":"0000000111111000"}]' data-step="1 s"></div>
      <p>In the diagram PT is 4 s. IN is on for 2 s, off for a while, then on for 2 s more: together that makes 4 s, and Q turns on.
      Q stays on, whatever IN does, until R resets the timer.</p>
      <div class="ld-figure" data-rungs="NO(Pump_Running) TONR(T5, R=Service_Done, PT=T#500h) COIL(Service_Due)"></div>
      <h3>Operating-hours counters</h3>
      <p>Machines need service after a number of operating hours: change the oil after 500 h, replace a filter after 2000 h.
      The PLC adds up the time the motor really runs, and when the total reaches the limit it lights a "service due" lamp.
      After the service, a technician resets the counter, often with a key switch so that nobody resets it by accident.</p>
      <p>The running signal usually comes from an auxiliary contact of the motor contactor, so that the PLC counts the time the motor really runs.</p>
      <p>One more point: in a real PLC the timer instance must also be declared <strong>RETAIN</strong>, so that its value survives a power failure.
      Otherwise the counter would start from zero every time the machine is switched on in the morning.</p>`,
    task: `
      <p>On the trainer, <code>Switch1</code> stands for the "motor running" signal from the contactor. <code>Lamp3</code> (yellow) is the "service due" lamp,
      <code>Button8</code> the service reset button. To keep the exercise short, the service interval is only 10 s.</p>
      <ol>
        <li>Add up the time Switch1 is on, using the TONR instance <code>T1</code> with PT = <code>T#10s</code>.</li>
        <li>Lamp3 lights when the motor has run for 10 s in total, over as many runs as it takes. It stays on when the motor stops.</li>
        <li>Button8 resets the total time and switches Lamp3 off.</li>
        <li>Switch Switch1 on and off a few times and watch <code>T1.ET</code>. Then press <strong>Check</strong>.</li>
      </ol>`,
    hints: [
      'A TONR box has an extra input R for the reset. Enter the tag Button8 there.',
      'The rung looks like a TON rung: contact, timer box, coil.',
      'The rung: NO(Switch1), TONR(T1, R=Button8, PT=T#10s), coil Lamp3.'
    ],
    tests: [
      {
        name: 'Running time adds up',
        steps: [
          { set: { Switch1: true }, wait: 4000 },
          { set: { Switch1: false }, wait: 2000 },
          { set: { Switch1: true }, wait: 4000 },
          { set: { Switch1: false }, wait: 1000 },
          { expect: { Lamp3: false }, msg: 'After 8 s of running in total, the service lamp Lamp3 must still be off' },
          { set: { Switch1: true } },
          { waitUntil: { Lamp3: true }, min: 1700, timeout: 2400, msg: 'Lamp3 must light when the total running time reaches 10 s (here: after 2 more seconds). Does your timer keep its time when Switch1 turns off?' },
          { set: { Switch1: false }, wait: 1000 },
          { expect: { Lamp3: true }, msg: 'Lamp3 must stay on after the motor stops' }
        ]
      },
      {
        name: 'Reset after service',
        steps: [
          { set: { Switch1: true }, wait: 10500 },
          { set: { Switch1: false }, wait: 200 },
          { expect: { Lamp3: true }, msg: 'After 10 s of running, Lamp3 must be on' },
          { pulse: { Button8: true }, ms: 200 },
          { expect: { Lamp3: false }, msg: 'Pressing Button8 must switch Lamp3 off' },
          { set: { Switch1: true } },
          { waitUntil: { Lamp3: true }, min: 9700, timeout: 10400, msg: 'After the reset, the counter must start from zero: Lamp3 must light again after 10 s of running' }
        ]
      }
    ],
    quiz: [
      { q: 'A TONR with PT = T#10s has IN TRUE for 6 s, then FALSE for 1 minute, then TRUE for 4 s. What happens?', options: ['Q turns on, because 6 s + 4 s = 10 s', 'Nothing, because IN was interrupted', 'Q turns on after the minute'], answer: 0, explain: 'A TONR keeps its elapsed time while IN is FALSE and continues from there.' },
      { q: 'How is the elapsed time of a TONR set back to 0?', options: ['IN turns FALSE', 'The reset input R turns TRUE', 'PT is reached'], answer: 1, explain: 'Only R clears a retentive timer.' }
    ]
  });
})(window.PLC = window.PLC || {});
