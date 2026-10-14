/* LadderLab — chapter "Troubleshooting" (debug-01 .. debug-06).
 * Every starter is a buggy program that compiles but behaves wrongly; the solution is the minimal fix.
 * Format: see lessons.js. Tag names, addresses and comments match the scene wiring. */
(function (PLC) {
  'use strict';
  const L = PLC.lessons;

  // ---- helpers ---------------------------------------------------------------
  /** Remove the common indentation of a template literal so ST sources read well in the editor. */
  function code(s) {
    const lines = String(s).replace(/^\s*\n/, '').replace(/\s+$/, '').split('\n');
    const ind = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
    return lines.map(l => l.slice(ind)).join('\n') + '\n';
  }
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  /** Structured Text figure (escapes < > & automatically). */
  const stFig = s => '<pre class="st-figure">' + esc(code(s).replace(/\n$/, '')) + '</pre>';
  /** Ladder figure: one string per rung. */
  const ldFig = rungs => '<div class="ld-figure" data-rungs="' + rungs.join('||') + '"></div>';
  /** Timing figure: [{ name, wave }] with waves made of 0 and 1. */
  const tdFig = (signals, step) => '<div class="td-figure" data-signals=\'' + JSON.stringify(signals) + '\' data-step="' + step + '"></div>';
  const ld = rungs => ({ pous: [{ name: 'Main', lang: 'LD', rungs }] });
  const st = source => ({ pous: [{ name: 'Main', lang: 'ST', source: code(source) }] });
  const mem = (name, type, comment) => ({ name, type, comment });

  // ---- scene I/O (names, addresses and comments as wired in the scenes) --------
  const TRAINER = {};
  for (let i = 0; i < 8; i++) {
    TRAINER['Switch' + (i + 1)] = ['BOOL', '%IX0.' + i, 'Toggle switch ' + (i + 1)];
    TRAINER['Button' + (i + 1)] = ['BOOL', '%IX1.' + i, 'Push button ' + (i + 1) + ' (momentary, NO)'];
  }
  for (let i = 0; i < 16; i++) TRAINER['Lamp' + (i + 1)] = ['BOOL', '%QX' + Math.floor(i / 8) + '.' + (i % 8), 'Pilot lamp ' + (i + 1)];
  const MOTOR = {
    Start: ['BOOL', '%IX0.0', 'Start push button, green (NO contact)'],
    Stop: ['BOOL', '%IX0.1', 'Stop push button, red (NC contact: TRUE when NOT pressed)'],
    Overload: ['BOOL', '%IX0.3', 'Overload relay contact (NC: TRUE = OK, FALSE = tripped)'],
    Motor: ['BOOL', '%QX0.0', 'Contactor K1: motor forward'],
    Lamp_Run: ['BOOL', '%QX0.2', 'Green pilot lamp: running'],
    Lamp_Fault: ['BOOL', '%QX0.3', 'Red pilot lamp: fault']
  };
  const TANK = {
    Level: ['INT', '%IW0', 'Level transmitter 0..1000 (= 0.0..100.0 %)'],
    Pump: ['BOOL', '%QX0.0', 'Inlet pump P1 (fills the tank)'],
    Alarm: ['BOOL', '%QX0.3', 'Alarm beacon'],
    Display: ['INT', '%QW0', 'Panel display (shows any number)']
  };
  const TRAFFIC = {
    Side_Car: ['BOOL', '%IX0.2', 'Induction loop: car waiting on the side road'],
    Main_Red: ['BOOL', '%QX0.0', 'Main road: red'],
    Main_Yellow: ['BOOL', '%QX0.1', 'Main road: yellow'],
    Main_Green: ['BOOL', '%QX0.2', 'Main road: green'],
    Side_Red: ['BOOL', '%QX0.3', 'Side road: red'],
    Side_Yellow: ['BOOL', '%QX0.4', 'Side road: yellow'],
    Side_Green: ['BOOL', '%QX0.5', 'Side road: green'],
    Ped_Red: ['BOOL', '%QX0.6', 'Pedestrians: red (don\'t walk)'],
    Ped_Green: ['BOOL', '%QX0.7', 'Pedestrians: green (walk)']
  };
  const io = (table, names) => names.map(n => ({ name: n, type: table[n][0], address: table[n][1], comment: table[n][2] }));

  // NC-wired inputs are TRUE in normal operation, so the headless checker must start with them TRUE.
  const MOTOR_INIT = { Stop: true, Overload: true };

  // =====================================================================================
  // Chapter: Troubleshooting
  // =====================================================================================

  // ---------------------------------------------------------------- debug-01
  L.register({
    id: 'debug-01-motor-wont-start', chapter: 'debug', order: 1,
    title: 'The motor won\'t start',
    goal: 'Find a wrong contact by comparing the live input values in the Watch window with what the program expects.',
    lang: 'LD', scene: 'motor',
    tags: io(MOTOR, ['Start', 'Stop', 'Overload', 'Motor', 'Lamp_Run', 'Lamp_Fault']),
    starter: ld([
      { comment: 'Motor start/stop with seal-in. Stop is an NC button.', text: '[ NO(Start) | NO(Motor) ] NC(Stop) NO(Overload) COIL(Motor)' },
      { comment: 'Green lamp: motor running', text: 'NO(Motor) COIL(Lamp_Run)' },
      { comment: 'Red lamp: overload relay tripped', text: 'NC(Overload) COIL(Lamp_Fault)' }
    ]),
    solution: ld([
      { comment: 'Motor start/stop with seal-in. Stop is wired NC, so its input is TRUE while nobody presses it: use a NO contact.', text: '[ NO(Start) | NO(Motor) ] NO(Stop) NO(Overload) COIL(Motor)' },
      { comment: 'Green lamp: motor running', text: 'NO(Motor) COIL(Lamp_Run)' },
      { comment: 'Red lamp: overload relay tripped', text: 'NC(Overload) COIL(Lamp_Fault)' }
    ]),
    trace: ['Start', 'Stop', 'Overload', 'Motor'],
    theory: `
      <p>Welcome to troubleshooting. In this chapter every program compiles without errors, and every program does the wrong thing.
      The compiler only checks that a program is <em>valid</em>. It cannot know what the machine is supposed to do.
      Finding these bugs is the daily work of a PLC technician, and it always starts the same way:
      compare what the program <strong>expects</strong> with what the PLC really <strong>sees</strong>.</p>
      <h3>Follow the power, then ask the Watch window</h3>
      <p>In Run, the ladder editor draws every element that passes power in green. Start at the left rail and follow the power.
      The first contact that stays grey is where the rung breaks. Now look up that tag in the <strong>Watch window</strong> on the right:
      it shows the live value of every tag. Then ask: "Is this the value I expected in this situation?"</p>
      <h3>Wiring and contact symbol are two different things</h3>
      <p>A push button or sensor can be wired in two ways:</p>
      <ul>
        <li><strong>NO</strong> (normally open): the input is FALSE at rest and TRUE while the button is pressed. Start buttons are wired like this.</li>
        <li><strong>NC</strong> (normally closed): the input is TRUE at rest and FALSE while pressed. Stop buttons and overload relays are wired like this, so that a broken wire stops the machine.</li>
      </ul>
      <p>The contact in your program knows nothing about the wiring. It only looks at the value of its tag:
      a NO contact <code>-| |-</code> passes power while the tag is TRUE, an NC contact <code>-|/|-</code> while the tag is FALSE.</p>
      ${ldFig(['NO(Guard_Closed) NC(Jam) COIL(Feeder)'])}
      <p>Here the guard switch is wired NC (TRUE while the guard is closed), so it gets a NO contact.
      The jam sensor is wired NO (TRUE when a part is stuck), so it gets an NC contact: "run while there is no jam".
      In normal operation both contacts pass power.</p>
      <p>So for every contact ask: in normal running, is this tag TRUE or FALSE, and does my contact pass power then?
      The comment of each tag in the Tags tab tells you how the device is wired.</p>`,
    task: `
      <ol>
        <li>Press <strong>Run</strong> and press Start on the motor panel. The motor does not start. Always reproduce a problem before you change anything.</li>
        <li>Follow the power through rung 1 from the left. Which contact stays grey?</li>
        <li>Find that tag in the Watch window. What value does it have while nobody touches the button? Read its comment in the Tags tab.</li>
        <li>Fix the contact so that it matches the wiring. Change only what is wrong.</li>
        <li>Test: Start starts the motor, Stop stops it, a tripped overload relay stops it. Then press <strong>Check</strong>.</li>
      </ol>`,
    hints: [
      'All contacts after the branch must pass power. Watch rung 1 while you press Start: which one blocks?',
      'In the Watch window, Stop is TRUE while nobody presses it. Its comment says: NC contact, TRUE when NOT pressed.',
      'An NC contact on a TRUE tag blocks the power. With this program the motor could only run while you hold Stop down.',
      'Replace the NC contact for Stop with a NO contact. Compare with Overload: it is wired the same way and already uses a NO contact.'
    ],
    tests: [
      {
        name: 'Start and stop',
        init: MOTOR_INIT,
        steps: [
          { expect: { Motor: false }, msg: 'After switching to RUN, the motor must be off' },
          { pulse: { Start: true }, ms: 150 },
          { expect: { Motor: true, Lamp_Run: true }, msg: 'A short press on Start must start the motor and light Lamp_Run' },
          { wait: 500 },
          { expect: { Motor: true }, msg: 'The motor must keep running after Start is released' },
          { pulse: { Stop: false }, ms: 150 },
          { expect: { Motor: false, Lamp_Run: false }, msg: 'Pressing Stop (its input goes FALSE) must stop the motor' },
          { wait: 300 },
          { expect: { Motor: false }, msg: 'The motor must stay off after Stop is released' },
          { pulse: { Start: true }, ms: 150 },
          { expect: { Motor: true }, msg: 'Start must work again after a stop' }
        ]
      },
      {
        name: 'Stop has priority',
        init: MOTOR_INIT,
        steps: [
          { set: { Stop: false }, wait: 50 },
          { pulse: { Start: true }, ms: 150 },
          { expect: { Motor: false }, msg: 'While Stop is pressed (or its wire is broken), Start must not start the motor' },
          { set: { Stop: true }, wait: 300 },
          { expect: { Motor: false }, msg: 'Releasing Stop must not start the motor by itself' }
        ]
      },
      {
        name: 'Overload relay',
        init: MOTOR_INIT,
        steps: [
          { expect: { Lamp_Fault: false }, msg: 'With the overload relay OK, Lamp_Fault must be off' },
          { pulse: { Start: true }, ms: 150 },
          { expect: { Motor: true }, msg: 'A short press on Start must start the motor' },
          { set: { Overload: false }, wait: 50 },
          { expect: { Motor: false, Lamp_Fault: true }, msg: 'When the overload relay trips (Overload FALSE), the motor must stop and Lamp_Fault must light' },
          { set: { Overload: true }, wait: 300 },
          { expect: { Motor: false, Lamp_Fault: false }, msg: 'After the overload relay is reset, the motor must stay off and Lamp_Fault must go out' }
        ]
      }
    ],
    quiz: [
      { q: 'Stop is wired NC. What does the Watch window show for Stop while nobody touches the button?', options: ['FALSE', 'TRUE', 'It changes in every scan'], answer: 1, explain: 'An NC button lets current flow to the input until it is pressed, so the input is TRUE at rest.' },
      { q: 'When does an NC contact in the program pass power?', options: ['When its tag is FALSE', 'When the button is wired NC', 'When the button is pressed'], answer: 0, explain: 'A contact only looks at the value of its tag. It knows nothing about the wiring.' },
      { q: 'The motor runs only while you hold Stop down. What is the most likely cause?', options: ['Stop is programmed with an NC contact although the button is wired NC', 'The motor contactor is broken', 'The seal-in contact is missing'], answer: 0, explain: 'Holding Stop makes the input FALSE, and only then does the NC contact pass power.' }
    ]
  });

  // ---------------------------------------------------------------- debug-02
  L.register({
    id: 'debug-02-double-coil', chapter: 'debug', order: 2,
    title: 'Two switches, one lamp',
    goal: 'Use compiler warnings and a cross-reference of writers to find and remove a double coil.',
    lang: 'LD', scene: 'trainer',
    tags: io(TRAINER, ['Switch1', 'Switch2', 'Switch3', 'Lamp1', 'Lamp2']),
    starter: ld([
      { comment: 'Front door open: warning lamp', text: 'NO(Switch1) COIL(Lamp1)' },
      { comment: 'Back door open: warning lamp', text: 'NO(Switch2) COIL(Lamp1)' },
      { comment: 'Garage door open', text: 'NO(Switch3) COIL(Lamp2)' }
    ]),
    solution: ld([
      { comment: 'Front door OR back door open: warning lamp. One rung, one coil.', text: '[ NO(Switch1) | NO(Switch2) ] COIL(Lamp1)' },
      { comment: 'Garage door open', text: 'NO(Switch3) COIL(Lamp2)' }
    ]),
    trace: ['Switch1', 'Switch2', 'Lamp1'],
    theory: `
      <p>Some bugs are reported before the program even runs. The compiler sorts its messages into <strong>errors</strong> and <strong>warnings</strong>.
      An error stops you from pressing Run. A warning does not: the program is valid, but the compiler has seen something that is almost always a mistake.
      Beginners ignore warnings. Professionals read them first.</p>
      <h3>The Messages tab</h3>
      <p>The <strong>Messages</strong> tab below the editor lists every error and warning, and its badge shows how many there are.
      Click a message to jump to the place it talks about.</p>
      <h3>The double coil</h3>
      <p>A classic warning: the same tag is written by ordinary coils in two rungs.</p>
      ${ldFig(['NO(Kitchen_Hot) COIL(Fan)', 'NO(Bath_Wet) COIL(Fan)'])}
      <p>It reads like "either room switches the fan on", but it does not work that way. The rungs run from top to bottom,
      and an ordinary coil writes TRUE <em>or FALSE</em> in every scan. Rung 1 writes TRUE, then rung 2 overwrites it with FALSE.
      The outputs reach the terminals only at the end of the scan, so the last rung always wins.</p>
      <p>Online this is confusing: rung 1 shows its coil green, yet the Watch window shows the tag FALSE.
      You can watch it happen with the scan debugger: press <strong>Pause</strong>, then <strong>Step</strong> (F11) to run one rung at a time.
      The output image of the lamp turns on after rung 1 and off again after rung 2, before "Write outputs" ever sends it to the lamp.</p>
      <h3>Cross-reference: who writes this tag?</h3>
      <p>Engineering tools offer a <strong>cross-reference</strong>: a list of every place where a tag is read or written.
      When an output behaves strangely, list its writers (coils, Set and Reset coils, boxes with OUT).
      An output should have one writer, or one clear pair of Set and Reset coils.
      In LadderLab, the <strong>Used</strong> column of the Tags tab is the cross-reference: click the number next to a tag
      to list every rung and line that uses it, marked "writes" or "reads", and click an entry to jump there.
      The double-coil warning in the Messages tab names the rungs as well.</p>
      <p>The fix is to collect all conditions for one output in one place. "This or that" is a parallel branch.</p>`,
    task: `
      <p>Lamp1 is a door warning lamp: it must light when the front door (<code>Switch1</code>) <strong>or</strong> the back door (<code>Switch2</code>) is open.
      Lamp2 shows the garage door (<code>Switch3</code>).</p>
      <ol>
        <li>Run the program and flip each switch on its own. Write down exactly what works and what does not.</li>
        <li>Open the Messages tab and read the warning. Which rungs does it name?</li>
        <li>Switch only Switch1 on. Rung 1 shows power at its coil, yet Lamp1 is FALSE in the Watch window. Use Pause and Step (F11) to see why.</li>
        <li>Rewrite the program so that Lamp1 is written in one rung only and lights when either door is open. Lamp2 must keep working.</li>
        <li>Check that the warning has gone, then press <strong>Check</strong>.</li>
      </ol>`,
    hints: [
      'With Switch1 on and Switch2 off, rung 1 writes TRUE and rung 2 writes FALSE in the same scan. Which value reaches the lamp?',
      'The Messages tab says: Lamp1 is written by coils in rungs 1 and 2. You need exactly one coil Lamp1.',
      '"Front door OR back door" is a parallel branch: put both contacts in parallel in one rung and delete the other Lamp1 rung.',
      'The fixed rung is [ NO(Switch1) | NO(Switch2) ] COIL(Lamp1). Keep the Lamp2 rung as it is.'
    ],
    tests: [
      {
        name: 'Either door lights the warning lamp',
        steps: [
          { expect: { Lamp1: false }, msg: 'With both doors closed, Lamp1 must be off' },
          { set: { Switch1: true }, wait: 50 },
          { expect: { Lamp1: true }, msg: 'Front door open (Switch1 on) must light Lamp1' },
          { set: { Switch1: false }, wait: 50 },
          { expect: { Lamp1: false }, msg: 'With both doors closed again, Lamp1 must go off' },
          { set: { Switch2: true }, wait: 50 },
          { expect: { Lamp1: true }, msg: 'Back door open (Switch2 on) must light Lamp1' },
          { set: { Switch1: true }, wait: 50 },
          { expect: { Lamp1: true }, msg: 'With both doors open, Lamp1 must stay on' },
          { set: { Switch2: false }, wait: 50 },
          { expect: { Lamp1: true }, msg: 'With only the front door still open, Lamp1 must stay on' },
          { set: { Switch1: false }, wait: 50 },
          { expect: { Lamp1: false }, msg: 'With both doors closed, Lamp1 must be off' }
        ]
      },
      {
        name: 'The garage lamp still works',
        steps: [
          { set: { Switch3: true }, wait: 50 },
          { expect: { Lamp2: true, Lamp1: false }, msg: 'Switch3 (garage door) must light Lamp2 only, not the door warning Lamp1' },
          { set: { Switch3: false }, wait: 50 },
          { expect: { Lamp2: false }, msg: 'Switch3 off must switch Lamp2 off' },
          { set: { Switch1: true }, wait: 50 },
          { expect: { Lamp2: false }, msg: 'The front door must not light the garage lamp Lamp2' }
        ]
      }
    ],
    quiz: [
      { q: 'Rung 1 writes Lamp1 TRUE, rung 2 writes Lamp1 FALSE in the same scan. What does the lamp do?', options: ['It lights', 'It stays off: the last rung wins', 'It flickers'], answer: 1, explain: 'Only the value at the end of the scan is copied to the output terminal.' },
      { q: 'Online, the coil in rung 1 looks powered, but the Watch window shows its tag FALSE. What do you look for first?', options: ['A broken output terminal', 'Another rung that writes the same tag', 'A wrong address in the Tags tab'], answer: 1, explain: 'A second writer further down overwrites the value. The double-coil warning names the rungs.' },
      { q: 'How do you combine "Switch1 or Switch2" for one coil in ladder?', options: ['Two contacts in series', 'Two contacts in parallel branches', 'Two coils with the same tag'], answer: 1, explain: 'Parallel branches are OR: power flows if any branch conducts.' }
    ]
  });

  // ---------------------------------------------------------------- debug-03
  L.register({
    id: 'debug-03-timer-never-ends', chapter: 'debug', order: 3,
    title: 'The timer never finishes',
    goal: 'Record timer signals in the Timing diagram and find out why a TON driven by a push button never reaches its preset time.',
    lang: 'LD', scene: 'trainer',
    tags: io(TRAINER, ['Button1', 'Lamp1']).concat([mem('T1', 'TON', 'Switch-off delay of the staircase light')]),
    starter: ld([
      { comment: 'Staircase light: a press on Button1 switches the light on', text: 'NO(Button1) SET(Lamp1)' },
      { comment: 'Switch the light off again after 5 s', text: 'NO(Button1) TON(T1, PT=T#5s) RESET(Lamp1)' }
    ]),
    solution: ld([
      { comment: 'Staircase light: a press on Button1 switches the light on', text: 'NO(Button1) SET(Lamp1)' },
      { comment: 'Switch the light off 5 s after it came on. The timer runs while the light is on, not while the button is pressed.', text: 'NO(Lamp1) TON(T1, PT=T#5s) RESET(Lamp1)' }
    ]),
    trace: ['Button1', 'Lamp1'],
    theory: `
      <p>Timer bugs are hard to catch in the Watch window. Values change too fast, or only for a moment while you look elsewhere.
      For anything that depends on time, use a <strong>logic analyser</strong>: a recorder that draws signals over time.
      In LadderLab it is the <strong>Timing diagram</strong> tab below the editor.</p>
      <h3>Recording signals</h3>
      <ul>
        <li>In the Watch window, click the <strong>wave icon</strong> in front of a tag. The tag is added to the Timing diagram.</li>
        <li>A timer instance such as <code>T1</code> has its own members. Expand it with the small arrow to see <code>T1.IN</code>, <code>T1.PT</code>, <code>T1.Q</code> and <code>T1.ET</code>. Each has its own wave icon.</li>
        <li>Make the problem happen, then open the Timing diagram tab. <strong>Freeze</strong> holds the picture so you can study it.</li>
      </ul>
      <h3>What to look for in a TON</h3>
      <p>Put <strong>IN</strong> and <strong>ET</strong> next to each other. A TON only finishes if IN stays TRUE for the whole preset time PT
      without interruption. ET climbs while IN is TRUE and falls back to 0 the moment IN turns FALSE.</p>
      ${tdFig([{ name: 'IN', wave: '0110011000111111100' }, { name: 'Q', wave: '0000000000000011100' }], '1 s')}
      <p>In this recording PT is 3 s. The first two pulses on IN are too short: ET starts each time, falls back to 0, and Q never comes.
      Only the last pulse lasts long enough. If your recording shows only short pulses on IN, the timer is not broken.
      The question is: why is IN so short, and which signal should drive it instead?</p>
      <h3>Momentary signals</h3>
      <p>A push button is TRUE only while a finger is on it, usually a few hundred milliseconds.
      A timer that must run for seconds after a press needs an IN signal that <strong>stays</strong> TRUE after the button is released,
      for example a bit that remembers the press. Another way is a timer type that is made for short start pulses.
      Before you change anything, write down in one sentence what the timer should measure: "the time since ..."</p>`,
    task: `
      <p>A staircase light: a short press on <code>Button1</code> switches <code>Lamp1</code> on, and it must go off by itself after 5 s
      (a few minutes in a real building).</p>
      <ol>
        <li>Run and press Button1 briefly. Lamp1 lights, but it never goes off. Now hold Button1 for more than 5 s: it does go off. Remember that clue.</li>
        <li>In the Watch window, expand <code>T1</code> and click the wave icon of <code>T1.IN</code> and <code>T1.ET</code>. Button1 and Lamp1 are already in the Timing diagram.</li>
        <li>Press Button1 briefly once more and open the Timing diagram tab. How long is T1.IN TRUE? What does T1.ET do?</li>
        <li>Fix the program: the light goes off 5 s after a short press, and it can be switched on again afterwards.</li>
        <li>Press <strong>Check</strong>.</li>
      </ol>`,
    hints: [
      'In the Timing diagram, T1.IN is TRUE exactly as long as your finger is on the button. ET starts counting and drops back to 0 when you let go.',
      'The timer should measure "the time since the light came on". It must run while the light is on, not while the button is pressed.',
      'Lamp1 is latched by the Set coil, so it stays TRUE after the press. Use it to drive the timer.',
      'Change the contact in front of the timer from Button1 to Lamp1: NO(Lamp1) TON(T1, PT=T#5s) RESET(Lamp1).'
    ],
    tests: [
      {
        name: 'A short press lights the stairs for 5 s',
        steps: [
          { expect: { Lamp1: false }, msg: 'After switching to RUN, Lamp1 must be off' },
          { pulse: { Button1: true }, ms: 200 },
          { expect: { Lamp1: true }, msg: 'A short press on Button1 must switch Lamp1 on' },
          { waitUntil: { Lamp1: false }, min: 4500, timeout: 5600, msg: 'Lamp1 must go off by itself about 5 s after a short press' },
          { never: { Lamp1: true }, for: 1000, msg: 'After switching off, Lamp1 must stay off until Button1 is pressed again' }
        ]
      },
      {
        name: 'The light can be switched on again',
        steps: [
          { pulse: { Button1: true }, ms: 200 },
          { waitUntil: { Lamp1: false }, timeout: 6000, msg: 'Lamp1 must go off by itself about 5 s after a short press' },
          { wait: 500 },
          { pulse: { Button1: true }, ms: 200 },
          { expect: { Lamp1: true }, msg: 'After the light has gone off, a new press on Button1 must light it again' },
          { always: { Lamp1: true }, for: 4000, msg: 'After the second press, Lamp1 must again stay on for the full 5 s' },
          { waitUntil: { Lamp1: false }, timeout: 1600, msg: 'Lamp1 must go off again about 5 s after the second press' }
        ]
      }
    ],
    quiz: [
      { q: 'A TON with PT = T#5s is driven by a push button that is pressed for 0.3 s. What happens?', options: ['Q turns on after 5 s', 'ET counts to 0.3 s and falls back to 0; Q never turns on', 'Q turns on at once'], answer: 1, explain: 'A TON resets as soon as IN turns FALSE. It needs IN TRUE for the whole preset time.' },
      { q: 'Which tool shows best how IN and ET of a timer change over time?', options: ['The Tags tab', 'The Timing diagram', 'The Messages tab'], answer: 1, explain: 'The Timing diagram records the signals, so even short pulses stay visible.' },
      { q: 'The light only goes off if you hold the button for more than 5 s. What does that tell you?', options: ['The timer is driven by the button signal itself', 'PT is too long', 'The lamp is broken'], answer: 0, explain: 'The timer only finishes while the button is held, so the button drives its IN.' }
    ]
  });

  // ---------------------------------------------------------------- debug-04
  L.register({
    id: 'debug-04-display-zero', chapter: 'debug', order: 4,
    title: 'The display always shows 0',
    goal: 'Use the online values in the ST editor to locate a calculation bug and fix it with the rules of integer division.',
    lang: 'ST', scene: 'tank',
    tags: io(TANK, ['Level', 'Pump', 'Alarm', 'Display']),
    starter: st(`
      (* Tank: level control and panel display
         Level comes from the transmitter: 0..1000 = 0.0..100.0 % *)

      (* Two-point control: fill below 30 %, stop above 70 % *)
      IF Level < 300 THEN
          Pump := TRUE;
      ELSIF Level > 700 THEN
          Pump := FALSE;
      END_IF;

      (* High level alarm above 90 % *)
      Alarm := Level > 900;

      (* Panel display: level in whole percent, 0..100 *)
      Display := Level / 1000 * 100;
    `),
    solution: st(`
      (* Tank: level control and panel display
         Level comes from the transmitter: 0..1000 = 0.0..100.0 % *)

      (* Two-point control: fill below 30 %, stop above 70 % *)
      IF Level < 300 THEN
          Pump := TRUE;
      ELSIF Level > 700 THEN
          Pump := FALSE;
      END_IF;

      (* High level alarm above 90 % *)
      Alarm := Level > 900;

      (* Panel display: level in whole percent, 0..100.
         100 / 1000 = 1 / 10, so divide once and keep the digits. *)
      Display := Level / 10;
    `),
    trace: ['Level', 'Pump', 'Display'],
    theory: `
      <p>Arithmetic bugs are sneaky: no fault, no warning, just a wrong number on a display.
      To find them you need to see the numbers <em>inside</em> the program, line by line.</p>
      <h3>Online values in the ST editor</h3>
      <p>While the PLC runs, the Structured Text editor shows the live value of the variables of each line, right next to the code.
      Read a line like a calculation on paper: the values on the right side go in, the variable on the left comes out.
      If the inputs are right and the result is wrong, the bug is in that line.</p>
      <h3>Make the steps visible</h3>
      <p>A long expression hides its intermediate results. Split it with a helper variable (declared in a <code>VAR</code> block),
      and the online values show every step:</p>
      ${stFig(`
        Ratio := Good_Parts / Total_Parts;   (* online: 45, 60 and Ratio = 0 *)
        Yield := Ratio * 100;
      `)}
      <p>Use values you can check by hand. In the Watch window, click the <strong>F</strong> button of an input to force it
      to a value such as 555, and compare the result with your own calculation. Remove the force afterwards.</p>
      <h3>Integer division</h3>
      <p>INT and DINT hold whole numbers only. Dividing two whole numbers cuts off everything after the decimal point. It does not round:</p>
      <ul>
        <li><code>7 / 2</code> is <code>3</code></li>
        <li><code>999 / 1000</code> is <code>0</code></li>
        <li><code>1000 / 1000</code> is <code>1</code></li>
      </ul>
      <p><code>*</code> and <code>/</code> are evaluated from left to right. So <code>A / B * C</code> divides first,
      throws the fraction away, and only then multiplies. Rules of thumb:</p>
      <ul>
        <li>Multiply first, divide last: <code>A * C / B</code>.</li>
        <li>Check that the intermediate result still fits the data type. An INT ends at 32 767, so on a real PLC
        500 * 100 = 50 000 would overflow. Use DINT, or simplify the fraction before you calculate.</li>
        <li>Or calculate in REAL and convert at the very end, for example with <code>REAL_TO_INT</code>.</li>
      </ul>`,
    task: `
      <ol>
        <li>Run. The pump fills the tank and stops at about 70 %, but the panel display shows 0 the whole time.</li>
        <li>Look at the online values of the last line: Level has a sensible value, Display is 0. The bug is in this line.</li>
        <li>Calculate the line by hand for Level = 555, step by step, the way the PLC does it. You can force Level to 555 in the Watch window to compare.</li>
        <li>Fix the calculation so that Display shows the level in whole percent, from 0 to 100. Do not change the other lines.</li>
        <li>Remove any forces, then press <strong>Check</strong>.</li>
      </ol>`,
    hints: [
      'Online you see, for example, Level = 555 and Display = 0 on the same line. Calculate like the PLC, from left to right: first 555 / 1000.',
      'Integer division cuts off the fraction: 555 / 1000 = 0, and 0 * 100 is still 0. Only a full tank (1000 / 1000 = 1) would show 100.',
      'Multiply before you divide, or simplify the fraction: 100 / 1000 is the same as 1 / 10.',
      'Display := Level / 10; gives 55 for Level = 555, and the numbers stay far below the INT limit.'
    ],
    tests: [
      {
        name: 'Display shows the level in percent',
        steps: [
          { set: { Level: 0 }, wait: 50 },
          { expect: { Display: 0 }, msg: 'An empty tank (Level 0) must show 0' },
          { set: { Level: 250 }, wait: 50 },
          { expect: { Display: 25 }, msg: 'Level 250 is 25.0 %: Display must show 25' },
          { set: { Level: 500 }, wait: 50 },
          { expect: { Display: 50 }, msg: 'Level 500 is 50.0 %: Display must show 50' },
          { set: { Level: 730 }, wait: 50 },
          { expect: { Display: 73 }, msg: 'Level 730 is 73.0 %: Display must show 73' },
          { set: { Level: 555 }, wait: 50 },
          { expect: { Display: { min: 55, max: 56 } }, msg: 'Level 555 is 55.5 %: Display must show 55 (or 56 if you round)' },
          { set: { Level: 1000 }, wait: 50 },
          { expect: { Display: 100 }, msg: 'A full tank (Level 1000) must show 100' }
        ]
      },
      {
        name: 'Pump and alarm still work',
        steps: [
          { set: { Level: 200 }, wait: 50 },
          { expect: { Pump: true, Alarm: false }, msg: 'Below 30 % the pump must fill the tank' },
          { set: { Level: 500 }, wait: 50 },
          { expect: { Pump: true }, msg: 'Between 30 % and 70 % the pump must keep its state (still filling)' },
          { set: { Level: 750 }, wait: 50 },
          { expect: { Pump: false }, msg: 'Above 70 % the pump must stop' },
          { set: { Level: 500 }, wait: 50 },
          { expect: { Pump: false }, msg: 'Between 30 % and 70 % the pump must keep its state (still off)' },
          { set: { Level: 950 }, wait: 50 },
          { expect: { Alarm: true }, msg: 'Above 90 % the alarm must be on' },
          { set: { Level: 850 }, wait: 50 },
          { expect: { Alarm: false }, msg: 'Below 90 % the alarm must be off' }
        ]
      }
    ],
    quiz: [
      { q: 'What is 1999 / 1000 when both numbers are INT?', options: ['1.999', '2', '1'], answer: 2, explain: 'Integer division cuts off the fraction. It does not round.' },
      { q: 'Level is 400 (INT). Which line gives 40?', options: ['Level / 1000 * 100', 'Level * 100 / 1000', 'Level * (100 / 1000)'], answer: 1, explain: 'Multiplying first keeps the digits. In the other two lines a division by 1000 gives 0 before anything else happens.' },
      { q: 'Where does LadderLab show the values of the variables while an ST program runs?', options: ['Next to each line in the ST editor', 'Only in the Messages tab', 'Nowhere'], answer: 0, explain: 'The online values appear at the end of each line, and the Watch window shows all tags.' }
    ]
  });

  // ---------------------------------------------------------------- debug-05
  L.register({
    id: 'debug-05-plc-fault', chapter: 'debug', order: 5,
    title: 'The PLC goes into FAULT',
    goal: 'Read a CPU fault message, explain why a loop can never wait for an input, and replace the loop with scan-based logic.',
    lang: 'ST', scene: 'trainer',
    tags: io(TRAINER, ['Button1', 'Button2', 'Switch1', 'Lamp1']),
    starter: st(`
      (* Bottle filling (trainer version)
         Button1 = start filling      Button2 = stop filling
         Switch1 = level sensor, TRUE when the bottle is full
         Lamp1   = filling valve *)

      IF Button1 THEN
          Lamp1 := TRUE;                          (* open the valve *)
          WHILE NOT Switch1 AND NOT Button2 DO    (* wait until full or stopped *)
              Lamp1 := TRUE;
          END_WHILE;
          Lamp1 := FALSE;                         (* close the valve *)
      END_IF;
    `),
    solution: st(`
      (* Bottle filling (trainer version)
         Button1 = start filling      Button2 = stop filling
         Switch1 = level sensor, TRUE when the bottle is full
         Lamp1   = filling valve *)

      (* No loop: check the conditions once per scan. Lamp1 keeps its value
         between scans, so it remembers that the valve is open. *)
      IF Button1 THEN
          Lamp1 := TRUE;                          (* open the valve *)
      END_IF;
      IF Switch1 OR Button2 THEN                  (* full or stopped *)
          Lamp1 := FALSE;                         (* close the valve *)
      END_IF;
    `),
    trace: ['Button1', 'Switch1', 'Button2', 'Lamp1'],
    theory: `
      <p>Sometimes the PLC stops by itself. The state changes to <strong>FAULT</strong>, every output switches off and the machine stands still.
      A real CPU does the same when the program does something it cannot survive. The good news: a fault always comes with a message,
      and usually with the place where it happened.</p>
      <h3>Read the fault message</h3>
      <p>LadderLab shows a red bar above the editor with the program, the line and the message.
      The same text appears at the top of the <strong>Messages</strong> tab, and the ST editor marks the line in red.
      <strong>Go to error</strong> jumps to the line. Read the whole message before you change anything.
      Then press <strong>Acknowledge</strong>, fix the cause and press Run again.</p>
      <h3>The watchdog</h3>
      <p>Every PLC has a <strong>watchdog</strong>: a timer that checks that each scan finishes in time, typically within a few hundred milliseconds.
      If a scan takes too long, the CPU stops. This protects the machine: a CPU stuck in a loop no longer reads its inputs or updates its outputs,
      so nothing could be switched off anymore.</p>
      <h3>Why a loop cannot wait for an input</h3>
      <p>Remember the scan cycle: read inputs, run the program, write outputs. The input image is read once, <em>before</em> the program starts.
      While the program runs, no input changes, however long it runs. You can see this with the scan debugger:
      <strong>Pause</strong>, then <strong>Step</strong> (F11) shows "Read inputs" as its own part of the scan, before your program.
      So this loop never ends:</p>
      ${stFig(`
        WHILE NOT Door_Closed DO    (* wait for the door *)
            Buzzer := TRUE;
        END_WHILE;
      `)}
      <p>If <code>Door_Closed</code> is FALSE when the loop starts, it stays FALSE for the rest of this scan.
      The outputs are not written either, so the buzzer would not even sound.</p>
      <h3>Let the scan cycle do the waiting</h3>
      <p>In a PLC you never wait <em>inside</em> a scan. Check the condition once per scan with an IF, and remember the state
      in a variable or a latched output. The scan cycle repeats your IF hundreds of times per second: that is the waiting.
      Loops are only for work that finishes at once, such as adding up the elements of an array.</p>`,
    task: `
      <ol>
        <li>Run, then press Button1. The PLC switches to FAULT and Lamp1 never lights.</li>
        <li>Read the fault message in the red bar and in the Messages tab. Which line does it name? Click <strong>Go to error</strong>.</li>
        <li>Think: while this loop runs, when could Switch1 or Button2 change their value?</li>
        <li>Press <strong>Acknowledge</strong> and rewrite the program without a loop: Button1 opens the valve (Lamp1), and it closes when the bottle is full (Switch1) or Button2 is pressed.</li>
        <li>Run, test with Button1, Switch1 and Button2, then press <strong>Check</strong>.</li>
      </ol>`,
    hints: [
      'The fault message names the WHILE loop. Inputs are read only between two scans, so inside the loop Switch1 and Button2 can never change.',
      'Let the scan cycle do the waiting: check the conditions once per scan with IF. Lamp1 keeps its value between scans, so it can remember that the valve is open.',
      'Two IF statements are enough: one opens the valve when Button1 is pressed, one closes it when Switch1 or Button2 is TRUE.',
      'Delete the WHILE loop and the last assignment. Then: IF Button1 THEN Lamp1 := TRUE; END_IF; IF Switch1 OR Button2 THEN Lamp1 := FALSE; END_IF;'
    ],
    tests: [
      {
        name: 'Filling starts and stops when the bottle is full',
        steps: [
          { expect: { Lamp1: false }, msg: 'After switching to RUN, the valve (Lamp1) must be closed' },
          { pulse: { Button1: true }, ms: 150 },
          { expect: { Lamp1: true }, msg: 'Pressing Button1 must open the valve (Lamp1 on)' },
          { always: { Lamp1: true }, for: 1000, msg: 'The valve must stay open after Button1 is released, until the bottle is full' },
          { set: { Switch1: true }, wait: 50 },
          { expect: { Lamp1: false }, msg: 'When the bottle is full (Switch1 on), the valve must close' },
          { set: { Switch1: false }, wait: 50 },
          { never: { Lamp1: true }, for: 500, msg: 'After closing, the valve must stay closed until Button1 is pressed again' },
          { pulse: { Button1: true }, ms: 150 },
          { expect: { Lamp1: true }, msg: 'Button1 must start the next bottle' }
        ]
      },
      {
        name: 'Button2 stops filling',
        steps: [
          { pulse: { Button1: true }, ms: 150 },
          { expect: { Lamp1: true }, msg: 'Pressing Button1 must open the valve (Lamp1 on)' },
          { wait: 500 },
          { pulse: { Button2: true }, ms: 150 },
          { expect: { Lamp1: false }, msg: 'Button2 must close the valve' },
          { never: { Lamp1: true }, for: 500, msg: 'After Button2, the valve must stay closed' }
        ]
      },
      {
        name: 'A full bottle is not filled',
        steps: [
          { set: { Switch1: true }, wait: 50 },
          { set: { Button1: true } },
          { never: { Lamp1: true }, for: 300, msg: 'When the bottle is already full (Switch1 on), Button1 must not open the valve' },
          { set: { Button1: false }, wait: 50 },
          { expect: { Lamp1: false }, msg: 'The valve must stay closed' }
        ]
      }
    ],
    quiz: [
      { q: 'Why does WHILE NOT Switch1 DO ... END_WHILE; never end when Switch1 is FALSE?', options: ['Switch1 is read only between scans, so it cannot change inside the loop', 'WHILE loops are not allowed in a PLC', 'Switch1 is an output'], answer: 0, explain: 'The input image is read once at the start of the scan. Nothing inside the loop can change it.' },
      { q: 'What does the watchdog do?', options: ['It stops the CPU when a scan takes too long', 'It restarts the program every second', 'It checks the wiring of the inputs'], answer: 0, explain: 'A stuck CPU cannot control the machine, so the watchdog stops it and switches the outputs off.' },
      { q: 'Where do you find the line on which the fault happened?', options: ['In the red fault bar and in the Messages tab', 'Only in the Tags tab', 'The PLC does not report it'], answer: 0, explain: 'The fault bar and the Messages tab name the program and the line. Go to error jumps there.' }
    ]
  });

  // ---------------------------------------------------------------- debug-06
  const JUNCTION_HEAD = `
      (* Junction with a detector on the side road
         0  power-up: all red 1 s
         1  main road green, at least 5 s, until a car waits on the side road
         2  main road yellow 2 s
         3  all red 1 s
         4  side road green 4 s, pedestrians cross the main road
         5  side road yellow 2 s
         6  all red 1 s, then back to 1 *)
      VAR
          Step      : INT := 0;    (* current step *)
          LastStep  : INT := -1;   (* step of the previous scan *)
          StepTimer : TON;         (* time spent in the current step *)
          StepTime  : TIME;        (* duration of the current step *)
      END_VAR

      (* One timer for all steps: it restarts whenever Step changes *)
      StepTimer(IN := (Step = LastStep), PT := StepTime);
      LastStep := Step;

      (* Each step switches its own lamps on and the lamps of the previous step off *)
      CASE Step OF
          0:  (* power-up: everything red *)
              StepTime := T#1s;
              Main_Red := TRUE;
              Side_Red := TRUE;
              Ped_Red  := TRUE;
              IF StepTimer.Q THEN Step := 1; END_IF;

          1:  (* main road green *)
              StepTime := T#5s;
              Main_Red   := FALSE;
              Main_Green := TRUE;
              IF StepTimer.Q AND Side_Car THEN
  `;
  const JUNCTION_TAIL = `
              END_IF;

          2:  (* main road yellow *)
              StepTime := T#2s;
              Main_Green  := FALSE;
              Main_Yellow := TRUE;
              IF StepTimer.Q THEN Step := 3; END_IF;

          3:  (* all red: clear the junction *)
              StepTime := T#1s;
              Main_Yellow := FALSE;
              Main_Red    := TRUE;
              IF StepTimer.Q THEN Step := 4; END_IF;

          4:  (* side road green, pedestrians walk *)
              StepTime := T#4s;
              Side_Red   := FALSE;
              Side_Green := TRUE;
              Ped_Red    := FALSE;
              Ped_Green  := TRUE;
              IF StepTimer.Q THEN Step := 5; END_IF;

          5:  (* side road yellow *)
              StepTime := T#2s;
              Side_Green  := FALSE;
              Side_Yellow := TRUE;
              Ped_Green   := FALSE;
              Ped_Red     := TRUE;
              IF StepTimer.Q THEN Step := 6; END_IF;

          6:  (* all red *)
              StepTime := T#1s;
              Side_Yellow := FALSE;
              Side_Red    := TRUE;
              IF StepTimer.Q THEN Step := 1; END_IF;
      END_CASE;
  `;
  /** The program with the given transition line inside step 1. */
  const junction = transition => JUNCTION_HEAD.replace(/\s+$/, '') + '\n                  ' + transition + '\n' + JUNCTION_TAIL.replace(/^\s*\n/, '');
  const CONFLICT = '(Main_Green OR Main_Yellow) AND (Side_Green OR Side_Yellow)';

  L.register({
    id: 'debug-06-two-greens', chapter: 'debug', order: 6,
    title: 'Two greens at once',
    goal: 'Pause the PLC, step through a state machine one scan at a time, find a wrong transition and explain why safety checks matter.',
    lang: 'ST', scene: 'traffic',
    tags: io(TRAFFIC, ['Side_Car', 'Main_Red', 'Main_Yellow', 'Main_Green', 'Side_Red', 'Side_Yellow', 'Side_Green', 'Ped_Red', 'Ped_Green']),
    starter: st(junction('Step := 4;           (* a car is waiting: change over *)')),
    solution: st(junction('Step := 2;           (* a car is waiting: change over via yellow and all red *)')),
    trace: ['Side_Car', 'Main_Green', 'Main_Yellow', 'Main_Red', 'Side_Green', 'Side_Red', 'Main.Step'],
    theory: `
      <p>Some bugs happen at one particular moment in a sequence, or last a single scan. At full speed you cannot see them:
      a scan takes 10 ms, and many values change in between two looks. The solution is to slow time down.</p>
      <h3>Pause and Single scan</h3>
      <ul>
        <li><strong>Pause</strong> freezes the simulation. The PLC and the machine stand still, the state shows PAUSED, and all values stay on screen.</li>
        <li><strong>Single scan</strong> (<strong>F10</strong>) runs exactly one scan cycle and pauses again.</li>
        <li><strong>Step</strong> (<strong>F11</strong>) goes even finer: one part of the scan at a time. For a ladder program that is one rung; an ST program runs as one part.</li>
      </ul>
      <p>Pause just before the interesting moment, then press F10 again and again. After each scan, look at the Watch window.
      In a state machine the most important variable is the <strong>step variable</strong>. Local variables appear in the Watch window
      under "Main (local variables)". Write down the sequence of steps you see and compare it with the state diagram.
      A skipped step or a jump to the wrong number shows up at once.</p>
      <h3>Lamps that remember</h3>
      <p>In this program each step switches lamps on, and a later step switches them off again. A lamp keeps its value until the next assignment.
      That works as long as the sequence runs exactly as drawn. A jump that skips a step also skips the assignments in that step.</p>
      ${stFig(`
        2:  (* belt stops, gate opens *)
            Belt := FALSE;
            Gate := TRUE;
            IF Gate_Open THEN Step := 3; END_IF;
      `)}
      <p>If a transition jumps over step 2, nobody switches the belt off.</p>
      <h3>Safety checks</h3>
      <p>For dangerous combinations, do not rely on the sequence alone. Add an independent check at the end of the program.
      It catches the forbidden state whatever caused it, including bugs nobody has found yet:</p>
      ${stFig(`
        (* Safety: these two must never be on together *)
        IF Belt AND Gate_Moving THEN
            Fault := TRUE;     (* stop everything, call a technician *)
        END_IF;
      `)}
      <p>Real traffic controllers have such a check built into separate hardware: a conflict monitor switches the junction
      to flashing yellow as soon as it sees conflicting greens.</p>`,
    task: `
      <ol>
        <li>Run and watch the junction. As soon as a car waits on the side road, the side road gets green while the main road is still green.</li>
        <li>Find <code>Step</code> in the Watch window under "Main (local variables)". Press <strong>Pause</strong> while the main road is green and a car is waiting.</li>
        <li>Press <strong>Single scan</strong> (F10) again and again and write down every value of Step. Compare the sequence with the comment at the top of the program.</li>
        <li>Fix the wrong transition. The rest of the program is correct.</li>
        <li>Run again, watch a full cycle, then press <strong>Check</strong>. Optional: add a safety check for conflicting greens at the end of the program.</li>
      </ol>`,
    hints: [
      'Single-scan through the moment the side road gets green. Step should go 1, 2, 3, 4. Which numbers do you really see?',
      'Step jumps from 1 straight to 4. Steps 2 and 3 are skipped, and so are their assignments: nobody switches Main_Green off.',
      'Look at the transition in step 1. Where should the main road go after its green phase?',
      'In step 1, change Step := 4; to Step := 2;. Steps 2 and 3 then switch the main road to yellow and red before the side road gets green.'
    ],
    tests: [
      {
        name: 'Power-up and main road green',
        steps: [
          { expect: { Main_Red: true, Side_Red: true, Main_Green: false, Side_Green: false }, msg: 'After switching to RUN, the junction must start with all red' },
          { waitUntil: { Main_Green: true }, min: 800, timeout: 1500, msg: 'After about 1 s of all red, the main road must get green' },
          { always: 'Main_Green AND NOT Main_Red AND Side_Red AND NOT Side_Green', for: 8000, msg: 'Without a car on the side road, the main road must stay green and the side road red' }
        ]
      },
      {
        name: 'A waiting car gets green in the right order',
        steps: [
          { waitUntil: { Main_Green: true }, timeout: 1500, msg: 'After about 1 s of all red, the main road must get green' },
          { set: { Side_Car: true } },
          { waitUntil: { Main_Yellow: true }, min: 4500, timeout: 6000, msg: 'With a car waiting, the main road must stay green for 5 s and then change to yellow (step 2)' },
          { expect: { Main_Green: false, Side_Red: true }, msg: 'During main yellow, the main green must be off and the side road red' },
          { waitUntil: { Main_Red: true }, min: 1600, timeout: 2600, msg: 'After about 2 s of yellow, the main road must turn red' },
          { expect: { Main_Yellow: false, Side_Red: true, Side_Green: false }, msg: 'Step 3 is all red: the side road must still wait' },
          { waitUntil: { Side_Green: true }, min: 600, timeout: 1500, msg: 'After about 1 s of all red, the side road must get green. Do not skip the all-red step' },
          { expect: { Main_Red: true, Main_Green: false, Ped_Green: true }, msg: 'While the side road is green, the main road must be red and pedestrians may walk' },
          { set: { Side_Car: false } },
          { waitUntil: { Side_Yellow: true }, min: 3500, timeout: 4600, msg: 'Side green must last about 4 s, then side yellow' },
          { waitUntil: { Side_Red: true }, min: 1600, timeout: 2600, msg: 'Side yellow must last about 2 s, then side red' },
          { waitUntil: { Main_Green: true }, min: 600, timeout: 1500, msg: 'After about 1 s of all red, the main road must get green again' }
        ]
      },
      {
        name: 'Safety: never green or yellow for both roads',
        steps: [
          { set: { Side_Car: true } },
          { never: CONFLICT, for: 30000, msg: 'Crossing traffic must never have green or yellow at the same time' }
        ]
      },
      {
        name: 'Exactly one lamp per road',
        steps: [
          { set: { Side_Car: true } },
          { always: 'BOOL_TO_INT(Main_Red) + BOOL_TO_INT(Main_Yellow) + BOOL_TO_INT(Main_Green) = 1', for: 20000, msg: 'The main road must show exactly one lamp (red, yellow or green) at any time' },
          { always: 'BOOL_TO_INT(Side_Red) + BOOL_TO_INT(Side_Yellow) + BOOL_TO_INT(Side_Green) = 1', for: 20000, msg: 'The side road must show exactly one lamp (red, yellow or green) at any time' },
          { never: 'Ped_Green AND NOT Main_Red', for: 20000, msg: 'Pedestrians may only walk while the main road is red' }
        ]
      }
    ],
    quiz: [
      { q: 'What does Single scan (F10) do?', options: ['It runs exactly one scan cycle and pauses again', 'It restarts the PLC', 'It runs the program until the next error'], answer: 0, explain: 'After each single scan you can read every value in peace.' },
      { q: 'Step 1 sets Main_Green := TRUE, and only step 2 sets it FALSE again. What happens if a transition jumps from step 1 to step 4?', options: ['Main_Green stays TRUE', 'Main_Green turns off automatically', 'The compiler reports an error'], answer: 0, explain: 'The assignments of the skipped steps never run, so the lamp keeps its old value.' },
      { q: 'Why add a safety check even when the sequence looks correct?', options: ['It catches a forbidden state whatever caused it, including future bugs', 'It makes the program run faster', 'The compiler requires it'], answer: 0, explain: 'A safety check is an independent second line of defence.' }
    ]
  });
})(window.PLC = window.PLC || {});
