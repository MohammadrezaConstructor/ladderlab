/* LadderLab — chapter "Structured Text" (st-01 .. st-06) and chapter "Projects" (project-01 .. project-03).
 * Format: see lessons.js. All starters and solutions are ST. */
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
  /** Structured Text figure for the theory (escapes < > & automatically). */
  const stFig = s => '<pre class="st-figure">' + esc(code(s).replace(/\n$/, '')) + '</pre>';
  /** Ladder figure for the theory: one string per rung. */
  const ldFig = rungs => '<div class="ld-figure" data-rungs="' + rungs.join('||') + '"></div>';
  const main = source => ({ name: 'Main', lang: 'ST', source: code(source) });

  // ---- scene I/O (names, addresses and comments as wired in the scenes) --------
  const TR = {};
  for (let i = 0; i < 8; i++) {
    TR['Switch' + (i + 1)] = { name: 'Switch' + (i + 1), type: 'BOOL', address: '%IX0.' + i, comment: 'Toggle switch ' + (i + 1) };
    TR['Button' + (i + 1)] = { name: 'Button' + (i + 1), type: 'BOOL', address: '%IX1.' + i, comment: 'Push button ' + (i + 1) + ' (momentary, NO)' };
  }
  for (let i = 0; i < 16; i++) {
    TR['Lamp' + (i + 1)] = { name: 'Lamp' + (i + 1), type: 'BOOL', address: '%QX' + Math.floor(i / 8) + '.' + (i % 8), comment: 'Pilot lamp ' + (i + 1) };
  }
  TR.Pot1 = { name: 'Pot1', type: 'INT', address: '%IW0', comment: 'Potentiometer 1 (0..1000)' };
  TR.Pot2 = { name: 'Pot2', type: 'INT', address: '%IW1', comment: 'Potentiometer 2 (0..1000)' };
  TR.Display1 = { name: 'Display1', type: 'INT', address: '%QW0', comment: 'Numeric display 1' };
  TR.Display2 = { name: 'Display2', type: 'INT', address: '%QW1', comment: 'Numeric display 2' };
  const trainer = (...names) => names.map(n => Object.assign({}, TR[n]));

  const TANK = {
    Level_Low: ['BOOL', '%IX0.0', 'Low level switch (TRUE when liquid covers it, at 20 %)'],
    Level_High: ['BOOL', '%IX0.1', 'High level switch (TRUE when liquid covers it, at 80 %)'],
    Start: ['BOOL', '%IX0.2', 'Start push button (NO)'],
    Stop: ['BOOL', '%IX0.3', 'Stop push button (NC: TRUE when not pressed)'],
    Auto_Mode: ['BOOL', '%IX0.4', 'Selector switch: TRUE = automatic mode'],
    Level: ['INT', '%IW0', 'Level transmitter 0..1000 (= 0.0..100.0 %)'],
    Pump: ['BOOL', '%QX0.0', 'Inlet pump P1 (fills the tank)'],
    Drain_Valve: ['BOOL', '%QX0.1', 'Outlet valve V1 (drains the tank)'],
    Mixer: ['BOOL', '%QX0.2', 'Mixer motor M2'],
    Alarm: ['BOOL', '%QX0.3', 'Alarm beacon'],
    Display: ['INT', '%QW0', 'Panel display (shows any number)']
  };
  const TRAFFIC = {
    Ped_Button: ['BOOL', '%IX0.0', 'Pedestrian request push button (NO)'],
    Night_Mode: ['BOOL', '%IX0.1', 'Night mode switch (TRUE = flashing yellow)'],
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
  const CONVEYOR = {
    Start: ['BOOL', '%IX0.0', 'Start push button (NO)'],
    Stop: ['BOOL', '%IX0.1', 'Stop push button (NC: TRUE when not pressed)'],
    Sensor_Entry: ['BOOL', '%IX0.2', 'Photo-eye at the start of the belt (TRUE while a box blocks the beam)'],
    Sensor_Tall: ['BOOL', '%IX0.3', 'Height sensor in front of the pusher (TRUE while a tall box is under it)'],
    Sensor_Exit: ['BOOL', '%IX0.4', 'Photo-eye at the end of the belt (TRUE while a box blocks the beam)'],
    Pusher_Home: ['BOOL', '%IX0.5', 'Pusher retracted (reed switch)'],
    Pusher_Out: ['BOOL', '%IX0.6', 'Pusher fully extended (reed switch)'],
    Conveyor: ['BOOL', '%QX0.0', 'Belt motor'],
    Pusher: ['BOOL', '%QX0.1', 'Pusher cylinder solenoid (TRUE = extend)'],
    Feeder: ['BOOL', '%QX0.2', 'Box feeder: each rising edge drops a new box'],
    Lamp_Run: ['BOOL', '%QX0.3', 'Running lamp'],
    Count_Display: ['INT', '%QW0', 'Counter display']
  };
  const GARAGE = {
    Btn_Open: ['BOOL', '%IX0.0', 'Open push button (NO)'],
    Btn_Close: ['BOOL', '%IX0.1', 'Close push button (NO)'],
    Btn_Stop: ['BOOL', '%IX0.2', 'Stop push button (NC: TRUE when not pressed)'],
    Limit_Open: ['BOOL', '%IX0.3', 'Upper limit switch (TRUE when the door is fully open)'],
    Limit_Closed: ['BOOL', '%IX0.4', 'Lower limit switch (TRUE when the door is fully closed)'],
    Photo_Eye: ['BOOL', '%IX0.5', 'Safety light barrier (TRUE while the beam is clear)'],
    Remote: ['BOOL', '%IX0.6', 'Remote control button (NO)'],
    Motor_Up: ['BOOL', '%QX0.0', 'Door motor: open'],
    Motor_Down: ['BOOL', '%QX0.1', 'Door motor: close'],
    Warning_Light: ['BOOL', '%QX0.2', 'Flashing warning lamp'],
    Courtesy_Light: ['BOOL', '%QX0.3', 'Garage ceiling light']
  };
  const PARKING = {
    Entry_Sensor: ['BOOL', '%IX0.0', 'Induction loop in front of the entry barrier (TRUE while a car is on it)'],
    Exit_Sensor: ['BOOL', '%IX0.1', 'Induction loop in front of the exit barrier (TRUE while a car is on it)'],
    Reset: ['BOOL', '%IX0.2', 'Attendant reset key (NO)'],
    Entry_Gate: ['BOOL', '%QX0.0', 'Entry barrier (TRUE = open)'],
    Exit_Gate: ['BOOL', '%QX0.1', 'Exit barrier (TRUE = open)'],
    Full_Lamp: ['BOOL', '%QX0.2', 'Red FULL sign'],
    Free_Lamp: ['BOOL', '%QX0.3', 'Green FREE sign'],
    Free_Spaces: ['INT', '%QW0', 'Display: number of free spaces']
  };
  const io = (table, names) => names.map(n => ({ name: n, type: table[n][0], address: table[n][1], comment: table[n][2] }));

  // =====================================================================================
  // Chapter: Structured Text
  // =====================================================================================

  // ---------------------------------------------------------------- st-01
  L.register({
    id: 'st-01-hello', chapter: 'st', order: 1,
    title: 'Hello Structured Text',
    goal: 'Write Boolean logic as Structured Text assignments and translate simple ladder rungs into ST.',
    lang: 'ST', scene: 'trainer',
    tags: trainer('Switch1', 'Switch2', 'Switch3', 'Switch4', 'Button1', 'Button2', 'Lamp1', 'Lamp2', 'Lamp3'),
    starter: { pous: [main(`
      (* Hello Structured Text
         Every statement is an assignment:  target := expression;
         The program runs from top to bottom in every scan, like rungs. *)

      (* TODO 1: Lamp1 on while Switch1 is on and Switch2 is off *)

      (* TODO 2: Lamp2 on while Switch3 or Switch4 is on *)

      (* TODO 3: Lamp3 as a seal-in: Button1 switches it on, Button2 switches it off *)
    `)] },
    solution: { pous: [main(`
      (* Hello Structured Text: three rungs written as three assignments *)

      (* series contacts = AND, normally closed contact = NOT *)
      Lamp1 := Switch1 AND NOT Switch2;

      (* parallel branches = OR *)
      Lamp2 := Switch3 OR Switch4;

      (* seal-in: Lamp3 on the right-hand side is its value from the previous scan.
         Button2 (stop) is a NO button, so pressed = TRUE, and stop wins. *)
      Lamp3 := (Button1 OR Lamp3) AND NOT Button2;
    `)] },
    trace: ['Switch1', 'Switch2', 'Lamp1', 'Button1', 'Button2', 'Lamp3'],
    theory: `
      <p>Ladder diagram is great for switching logic, but it gets clumsy for calculations, decisions and sequences.
      <strong>Structured Text</strong> (ST) is the text language of IEC 61131-3. It looks a bit like Pascal, and almost every modern PLC supports it.
      You already know the hard part, the logic. ST is just another way to write it down.</p>
      <h3>Assignments</h3>
      <p>The basic ST statement is the <strong>assignment</strong>: <code>target := expression;</code>.
      The PLC evaluates the expression on the right and stores the result in the variable on the left.
      Note the <code>:=</code> (a single <code>=</code> compares two values) and the <code>;</code> at the end of every statement.</p>
      <p>A rung with contacts and one coil is exactly one assignment. Contacts in series become <code>AND</code>,
      a normally closed contact becomes <code>NOT</code>, and parallel branches become <code>OR</code>:</p>
      ${ldFig(['NO(Start) NC(Fault) COIL(Ready)', '[ NO(Door1) | NO(Door2) ] COIL(Alarm)'])}
      ${stFig(`
        Ready := Start AND NOT Fault;
        Alarm := Door1 OR Door2;
      `)}
      <p><code>NOT</code> binds strongest, then <code>AND</code>, then <code>XOR</code>, then <code>OR</code>.
      When in doubt, use parentheses: <code>(A OR B) AND C</code> is a parallel branch followed by a contact in series.</p>
      <h3>Same scan cycle</h3>
      <p>An ST program runs exactly like a ladder program: in every scan the PLC executes the statements from top to bottom, then writes the outputs.
      The tags in the Tags table are global variables, so you simply use their names. Comments go between <code>(*</code> and <code>*)</code>.</p>
      <h3>Memory in one line</h3>
      <p>A seal-in rung feeds its own coil back through a contact. In ST the output simply appears on both sides of <code>:=</code>.
      On the right-hand side it still holds the value from the previous scan, because the right side is evaluated before the assignment:</p>
      ${ldFig(['[ NO(Start) | NO(Motor) ] NC(Stop) COIL(Motor)'])}
      <p>Writing this rung as one line of ST is part of your task.</p>
      <h3>Translate any ladder program</h3>
      <p>The ladder editor has an <strong>ST equivalent</strong> view that shows any ladder program as Structured Text.
      Use it to check your translations, and later to see how timers and edges look in ST.</p>`,
    task: `
      <ol>
        <li>Write one assignment for <code>Lamp1</code>: it lights while <code>Switch1</code> is on and <code>Switch2</code> is off.</li>
        <li>Write one assignment for <code>Lamp2</code>: it lights while <code>Switch3</code> or <code>Switch4</code> (or both) is on.</li>
        <li>Make <code>Lamp3</code> a seal-in, again as a single assignment: a short press on <code>Button1</code> switches it on, <code>Button2</code> switches it off.
        If both buttons are pressed, Lamp3 must be off. The trainer's push buttons are normally open, so a pressed Button2 is TRUE.</li>
        <li>Run the program, try it on the trainer, then press <strong>Check</strong>.</li>
      </ol>`,
    hints: [
      'Every statement ends with a semicolon, and an assignment uses := (colon, equals).',
      'The first line is Lamp1 := Switch1 AND NOT Switch2; and Lamp2 needs OR.',
      'For the seal-in, Lamp3 appears on both sides: Lamp3 := (Button1 OR Lamp3) AND ... ; The parentheses matter, because AND binds stronger than OR.'
    ],
    tests: [
      {
        name: 'Lamp1 = Switch1 AND NOT Switch2',
        steps: [
          { expect: { Lamp1: false }, msg: 'With all switches off, Lamp1 must be off' },
          { set: { Switch1: true }, wait: 50 },
          { expect: { Lamp1: true }, msg: 'Switch1 on and Switch2 off should light Lamp1' },
          { set: { Switch2: true }, wait: 50 },
          { expect: { Lamp1: false }, msg: 'Switch2 on must switch Lamp1 off (AND NOT)' },
          { set: { Switch1: false }, wait: 50 },
          { expect: { Lamp1: false }, msg: 'With only Switch2 on, Lamp1 must stay off' }
        ]
      },
      {
        name: 'Lamp2 = Switch3 OR Switch4',
        steps: [
          { expect: { Lamp2: false }, msg: 'With Switch3 and Switch4 off, Lamp2 must be off' },
          { set: { Switch3: true }, wait: 50 },
          { expect: { Lamp2: true }, msg: 'Switch3 alone should light Lamp2' },
          { set: { Switch3: false, Switch4: true }, wait: 50 },
          { expect: { Lamp2: true }, msg: 'Switch4 alone should light Lamp2' },
          { set: { Switch3: true }, wait: 50 },
          { expect: { Lamp2: true }, msg: 'With both switches on, Lamp2 stays on' },
          { set: { Switch3: false, Switch4: false }, wait: 50 },
          { expect: { Lamp2: false }, msg: 'With both switches off again, Lamp2 must go off' }
        ]
      },
      {
        name: 'Lamp3 seal-in with Button1 / Button2',
        steps: [
          { expect: { Lamp3: false }, msg: 'Lamp3 must be off at the start' },
          { pulse: { Button1: true }, ms: 100, wait: 200 },
          { expect: { Lamp3: true }, msg: 'After a short press on Button1, Lamp3 must stay on. It needs a seal-in: Lamp3 on the right-hand side too' },
          { wait: 500 },
          { expect: { Lamp3: true }, msg: 'Lamp3 must keep itself on' },
          { pulse: { Button2: true }, ms: 100, wait: 200 },
          { expect: { Lamp3: false }, msg: 'A press on Button2 must switch Lamp3 off' },
          { set: { Button1: true, Button2: true }, wait: 100 },
          { expect: { Lamp3: false }, msg: 'If both buttons are pressed, stop must win: Lamp3 off' },
          { set: { Button1: false, Button2: false }, wait: 100 },
          { expect: { Lamp3: false }, msg: 'Lamp3 must stay off after both buttons are released' }
        ]
      }
    ],
    quiz: [
      { q: 'Which ST line does the same as the rung NO(A) NC(B) COIL(C)?', options: ['C := A OR NOT B;', 'C := A AND NOT B;', 'C = A AND NOT B;'], answer: 1, explain: 'Contacts in series are AND, a normally closed contact is NOT, and an assignment uses :=.' },
      { q: 'What does X := A OR B AND C; compute?', options: ['(A OR B) AND C', 'A OR (B AND C)', 'It is a syntax error'], answer: 1, explain: 'AND binds stronger than OR, just like multiplication before addition.' },
      { q: 'In M := (S OR M) AND NOT R; what is the M on the right-hand side?', options: ['The value M will get in this scan', 'The value M had before this line, i.e. from the previous scan', 'Always FALSE'], answer: 1, explain: 'The right side is evaluated first, so M still holds its old value; that feedback is the memory.' }
    ]
  });

  // ---------------------------------------------------------------- st-02
  L.register({
    id: 'st-02-if', chapter: 'st', order: 2,
    title: 'Decisions with IF / ELSIF / ELSE',
    goal: 'Make decisions on analog values with IF, ELSIF and ELSE, and know when an IF keeps the old value.',
    lang: 'ST', scene: 'tank',
    tags: io(TANK, ['Level', 'Pump', 'Alarm', 'Display']),
    starter: { pous: [main(`
      (* Decisions with IF / ELSIF / ELSE: two-point level control
         Level: 0..1000 (= 0.0..100.0 %) *)

      (* TODO 1: Pump on below 300, off above 700, unchanged in between *)

      (* TODO 2: Alarm while Level is above 900 *)

      (* TODO 3: Display shows the level in percent (0..100) *)
    `)] },
    solution: { pous: [main(`
      (* Two-point control with hysteresis.
         No ELSE on purpose: between 300 and 700 Pump keeps its old value. *)
      IF Level < 300 THEN
          Pump := TRUE;           (* low: start filling *)
      ELSIF Level > 700 THEN
          Pump := FALSE;          (* high enough: stop *)
      END_IF;

      (* The alarm has no memory: a direct assignment is the right tool *)
      Alarm := Level > 900;

      (* 0..1000 to 0..100 %; integer division drops the fraction *)
      Display := Level / 10;
    `)] },
    trace: ['Level', 'Pump', 'Alarm', 'Display'],
    theory: `
      <p>Real machines often decide on <strong>numbers</strong>: a level, a temperature, a pressure.
      The level transmitter of this tank delivers <code>Level</code> as an INT from 0 (empty) to 1000 (full, 100.0 %).
      ST compares numbers with <code>=</code>, <code>&lt;&gt;</code>, <code>&lt;</code>, <code>&gt;</code>, <code>&lt;=</code> and <code>&gt;=</code>; the result is a BOOL.</p>
      <h3>IF statements</h3>
      ${stFig(`
        IF Pressure > 800 THEN
            Valve := TRUE;          (* too high: relieve *)
            Compressor := FALSE;
        ELSIF Pressure < 500 THEN
            Compressor := TRUE;     (* too low: pump up *)
        ELSE
            Valve := FALSE;
        END_IF;
      `)}
      <p>The PLC checks the conditions from top to bottom and executes only the <strong>first</strong> branch whose condition is TRUE.
      If none is TRUE, the <code>ELSE</code> branch runs. <code>ELSIF</code> and <code>ELSE</code> are optional, <code>END_IF;</code> is not.</p>
      <h3>An IF without ELSE is memory</h3>
      ${stFig(`
        (* A: direct assignment *)
        Heater := Temperature < 200;

        (* B: IF without ELSE *)
        IF Temperature < 200 THEN
            Heater := TRUE;
        END_IF;
      `)}
      <p>Program A computes the heater in every scan: TRUE below 200, FALSE above.
      Program B only ever writes TRUE. Once the heater is on, nothing switches it off again: the variable simply keeps its old value, like a SET coil.
      An IF that writes a variable in some cases but not in others creates <strong>memory</strong>.
      By accident that is a classic bug; on purpose it is a useful tool.</p>
      <h3>Two-point control</h3>
      <p>A tank filler should not switch at a single threshold. The level ripples around it, the pump would chatter on and off,
      and contactors and motors wear out quickly. Instead it uses two thresholds: switch on below the lower one, switch off above the upper one,
      and in between <strong>keep doing what you were doing</strong>. The gap is called <strong>hysteresis</strong>.
      An IF / ELSIF without ELSE gives you exactly that.</p>
      <h3>Integer arithmetic</h3>
      <p>Arithmetic uses <code>+ - * /</code> and <code>MOD</code> (remainder). With INT values, division drops the fraction: <code>7 / 2</code> is 3.
      Keep that in mind when you scale a raw value to percent.</p>`,
    task: `
      <ol>
        <li>Switch <code>Pump</code> on when <code>Level</code> is below 300 (30 %) and off when it is above 700 (70 %).
        Between 300 and 700 the pump keeps its current state. Use IF / ELSIF without ELSE.</li>
        <li>Switch <code>Alarm</code> on while <code>Level</code> is above 900, and off otherwise. Here a direct assignment is the right tool.</li>
        <li>Show the level in whole percent (0..100) on <code>Display</code>.</li>
        <li>Run the program and drag the <em>consumer</em> slider in the scene to draw liquid off. Watch the pump stop at 70 % and restart only below 30 %. Then press <strong>Check</strong>.</li>
      </ol>`,
    hints: [
      'The structure is IF Level < 300 THEN ... ELSIF Level > 700 THEN ... END_IF; Leave out the ELSE on purpose.',
      'Alarm := Level > 900; is a complete line: a comparison already is a BOOL.',
      'Level runs from 0 to 1000, so Level / 10 gives whole percent.'
    ],
    tests: [
      {
        name: 'Pump: on below 300, off above 700, hold in between',
        steps: [
          { set: { Level: 100 }, wait: 50 },
          { expect: { Pump: true }, msg: 'Level 100 (10 %) is below 300: the pump must fill the tank' },
          { set: { Level: 500 }, wait: 50 },
          { expect: { Pump: true }, msg: 'Level 500 while filling: between 300 and 700 the pump must keep running' },
          { set: { Level: 750 }, wait: 50 },
          { expect: { Pump: false }, msg: 'Level 750 is above 700: the pump must stop' },
          { set: { Level: 500 }, wait: 50 },
          { expect: { Pump: false }, msg: 'Level 500 while the tank empties: the pump must stay off until the level is below 300. An ELSE branch or a direct assignment switches it on too early' },
          { set: { Level: 310 }, wait: 50 },
          { expect: { Pump: false }, msg: 'Level 310 is still above 300: the pump stays off' },
          { set: { Level: 290 }, wait: 50 },
          { expect: { Pump: true }, msg: 'Level 290 is below 300: the pump must start again' },
          { set: { Level: 690 }, wait: 50 },
          { expect: { Pump: true }, msg: 'Level 690: the pump keeps filling up to 700' },
          { set: { Level: 710 }, wait: 50 },
          { expect: { Pump: false }, msg: 'Level 710 is above 700: the pump must stop' }
        ]
      },
      {
        name: 'Alarm above 900',
        init: { Level: 500 },
        steps: [
          { wait: 50 },
          { expect: { Alarm: false }, msg: 'Level 500: no alarm' },
          { set: { Level: 950 }, wait: 50 },
          { expect: { Alarm: true }, msg: 'Level 950 is above 900: Alarm must be on' },
          { set: { Level: 905 }, wait: 50 },
          { expect: { Alarm: true }, msg: 'Level 905 is still above 900: Alarm stays on' },
          { set: { Level: 880 }, wait: 50 },
          { expect: { Alarm: false }, msg: 'Level 880: the alarm must switch off again by itself' }
        ]
      },
      {
        name: 'Display shows the level in percent',
        steps: [
          { set: { Level: 0 }, wait: 50 },
          { expect: { Display: 0 }, msg: 'Level 0 is 0 %' },
          { set: { Level: 1000 }, wait: 50 },
          { expect: { Display: 100 }, msg: 'Level 1000 is 100 %' },
          { set: { Level: 702 }, wait: 50 },
          { expect: { Display: 70 }, msg: 'Level 702 is 70 %' },
          { set: { Level: 455 }, wait: 50 },
          { expect: { Display: { min: 45, max: 46 } }, msg: 'Level 455 is 45.5 %, so the display should show 45 (or 46 if you round)' }
        ]
      }
    ],
    quiz: [
      { q: 'IF X > 10 THEN Lamp := TRUE; END_IF; What happens to Lamp when X drops back to 5?', options: ['It turns FALSE', 'It stays TRUE', 'The PLC reports an error'], answer: 1, explain: 'Nothing writes FALSE, so Lamp keeps its old value.' },
      { q: 'Why does a level control use two thresholds?', options: ['To save program memory', 'So the pump does not switch on and off rapidly around one threshold', 'Because an IF needs two conditions'], answer: 1, explain: 'The gap (hysteresis) prevents chatter, which wears out pumps and contactors.' },
      { q: 'With INT values, what is 455 / 10?', options: ['45', '45.5', '46'], answer: 0, explain: 'Integer division drops the fraction.' }
    ]
  });

  // ---------------------------------------------------------------- st-03
  L.register({
    id: 'st-03-timers', chapter: 'st', order: 3,
    title: 'Timers and counters in ST',
    goal: 'Declare timer and counter instances in a VAR block, call them in every scan and use their outputs.',
    lang: 'ST', scene: 'trainer',
    tags: trainer('Switch1', 'Button1', 'Button2', 'Lamp1', 'Display1'),
    starter: { pous: [main(`
      (* Timers and counters in ST
         Declare your function block instances in the VAR block. *)
      VAR
          (* TODO: two TON instances for the blinker, e.g.  OffTimer : TON; *)
          (* TODO: a CTU instance for the counter *)
      END_VAR

      (* TODO 1: Lamp1 flashes 0.5 s on / 0.5 s off while Switch1 is on *)

      (* TODO 2: count Button1 presses, show them on Display1, reset with Button2 *)
    `)] },
    solution: { pous: [main(`
      (* Timers and counters in ST *)
      VAR
          OffTimer     : TON;   (* times the dark phase of the blinker *)
          OnTimer      : TON;   (* times the lit phase *)
          PressCounter : CTU;   (* counts rising edges of Button1 *)
      END_VAR

      (* 1. Blinker: OffTimer runs first; when it is done the lamp is lit and OnTimer runs.
            When OnTimer is done it resets OffTimer and the cycle starts again.
            Both timers are called in every scan; Switch1 goes into IN. *)
      OffTimer(IN := Switch1 AND NOT OnTimer.Q, PT := T#500ms);
      OnTimer(IN := OffTimer.Q, PT := T#500ms);
      Lamp1 := OffTimer.Q;

      (* 2. Counter: CTU counts edges, not scans. R resets CV to 0. *)
      PressCounter(CU := Button1, R := Button2, PV := 9999);
      Display1 := PressCounter.CV;
    `)] },
    trace: ['Switch1', 'Lamp1', 'Button1', 'Button2', 'Display1'],
    theory: `
      <p>Timers and counters in ST are the same function blocks you used in ladder: TON, TOF, TP, CTU, CTD, R_TRIG and friends.
      Only the way you write them down is different.</p>
      <h3>Instances live in a VAR block</h3>
      <p>Every timer needs its own memory: when it started, whether it is running. That memory is an <strong>instance</strong> of the function block.
      In ST you declare instances in a <code>VAR ... END_VAR</code> block at the top of the program.
      These local variables keep their values from one scan to the next, and they do not clutter the global Tags table.
      Use the same block for your own helper variables such as counters and step numbers.</p>
      ${stFig(`
        VAR
            StartDelay : TON;     (* an instance of the on-delay timer *)
        END_VAR

        StartDelay(IN := Start, PT := T#3s);
        Motor := StartDelay.Q;
      `)}
      ${ldFig(['NO(Start) TON(StartDelay, PT=T#3s) COIL(Motor)'])}
      <p>The call <code>StartDelay(IN := Start, PT := T#3s);</code> is a statement of its own. It passes the inputs, updates the timer once and stores its outputs.
      You read them with a dot: <code>StartDelay.Q</code>, <code>StartDelay.ET</code>. Time literals look like <code>T#500ms</code>, <code>T#2s</code> or <code>T#1m30s</code>.</p>
      <h3>Call every instance in every scan</h3>
      <p>A timer only notices time passing while it is called. If you put the call inside an IF whose condition is FALSE, the timer is frozen:
      it is not reset, it simply does nothing, and Q keeps its last value. So call each instance exactly once per scan, unconditionally,
      and put the condition into the <code>IN</code> input instead.</p>
      <h3>A blinker</h3>
      <p>A flashing lamp needs an on-time and an off-time. A classic solution uses two TONs that start each other:
      the first one times the dark phase; its Q lights the lamp and starts the second one, which times the lit phase.
      When the second one is done, it resets the first one (through the first one's IN), and the cycle repeats.</p>
      <div class="td-figure" data-signals='[{"name":"Switch1","wave":"0111111111111000"},{"name":"Lamp1","wave":"0001100110011000"}]' data-step="0.25 s"></div>
      <h3>Counting presses</h3>
      <p>A button stays pressed for many scans. <code>IF Button THEN N := N + 1; END_IF;</code> adds 1 in <em>every scan</em> while it is held: about a hundred per second.
      Count <strong>edges</strong> instead: with a CTU (each rising edge of <code>CU</code> adds 1 to <code>CV</code>, <code>R</code> resets it),
      or with an <code>R_TRIG</code>, whose <code>Q</code> is TRUE for exactly one scan per press.</p>`,
    task: `
      <ol>
        <li>Declare two TON instances in the VAR block and build a blinker: while <code>Switch1</code> is on, <code>Lamp1</code> flashes 0.5 s on, 0.5 s off.
        With Switch1 off, Lamp1 is off.</li>
        <li>Count the presses of <code>Button1</code> with a CTU instance (or an R_TRIG and an INT variable). Each press adds exactly 1, however long it is held.</li>
        <li>Show the count on <code>Display1</code>. <code>Button2</code> resets the count to 0.</li>
      </ol>`,
    hints: [
      'Blinker: OffTimer(IN := Switch1 AND NOT OnTimer.Q, PT := T#500ms); OnTimer(IN := OffTimer.Q, PT := T#500ms); Which of the two Q outputs is TRUE while the lamp should be lit?',
      'Keep the timer calls outside of any IF, so they run in every scan.',
      'Counter: PressCounter(CU := Button1, R := Button2, PV := 9999); then Display1 := PressCounter.CV;'
    ],
    tests: [
      {
        name: 'Lamp1 is off while Switch1 is off',
        steps: [
          { never: { Lamp1: true }, for: 2000, msg: 'With Switch1 off, Lamp1 must stay off' }
        ]
      },
      {
        name: 'Lamp1 flashes 0.5 s on / 0.5 s off',
        steps: [
          { set: { Switch1: true } },
          { waitUntil: { Lamp1: true }, timeout: 1100, msg: 'After Switch1 is switched on, Lamp1 should light within about 0.5 s' },
          { waitUntil: { Lamp1: false }, min: 400, timeout: 700, msg: 'Lamp1 should stay on for about 0.5 s' },
          { waitUntil: { Lamp1: true }, min: 400, timeout: 700, msg: 'Lamp1 should stay off for about 0.5 s, then light again' },
          { waitUntil: { Lamp1: false }, min: 400, timeout: 700, msg: 'Lamp1 should keep flashing: on for about 0.5 s' },
          { waitUntil: { Lamp1: true }, min: 400, timeout: 700, msg: 'Lamp1 should keep flashing: off for about 0.5 s' },
          { set: { Switch1: false }, wait: 100 },
          { expect: { Lamp1: false }, msg: 'Switch1 off: Lamp1 must go off' },
          { never: { Lamp1: true }, for: 1500, msg: 'With Switch1 off, Lamp1 must stay off' }
        ]
      },
      {
        name: 'Counting Button1 presses',
        steps: [
          { expect: { Display1: 0 }, msg: 'The count must start at 0' },
          { pulse: { Button1: true }, ms: 100, wait: 100 },
          { pulse: { Button1: true }, ms: 100, wait: 100 },
          { pulse: { Button1: true }, ms: 100, wait: 100 },
          { expect: { Display1: 3 }, msg: 'Three presses on Button1 should show 3. A much bigger number means you count every scan instead of every press' },
          { set: { Button1: true }, wait: 1000 },
          { set: { Button1: false }, wait: 100 },
          { expect: { Display1: 4 }, msg: 'Holding Button1 for a second is still one press: the count should be 4' },
          { pulse: { Button2: true }, ms: 100, wait: 100 },
          { expect: { Display1: 0 }, msg: 'Button2 must reset the count to 0' },
          { pulse: { Button1: true }, ms: 100, wait: 100 },
          { expect: { Display1: 1 }, msg: 'After the reset, counting starts again from 0' }
        ]
      }
    ],
    quiz: [
      { q: 'Where do you declare a timer instance that only your ST program uses?', options: ['In a VAR block of the program', 'Inside the IF statement that uses it', 'Nowhere: TON(...) can be called directly'], answer: 0, explain: 'An instance is declared once and keeps its state between scans.' },
      { q: 'A TON call sits inside an IF whose condition has become FALSE. What happens to the timer?', options: ['It resets to 0', 'It is frozen: neither updated nor reset', 'It keeps timing in the background'], answer: 1, explain: 'A function block only does something when it is called.' },
      { q: 'Button1 is held for 1 s with a 10 ms scan. How much does IF Button1 THEN N := N + 1; END_IF; add?', options: ['1', 'About 100', '10'], answer: 1, explain: 'The condition is TRUE in each of the roughly 100 scans; count edges instead.' }
    ]
  });

  // ---------------------------------------------------------------- st-04
  L.register({
    id: 'st-04-case', chapter: 'st', order: 4,
    title: 'State machines with CASE',
    goal: 'Describe a sequence as a state diagram and program it with an INT step variable, CASE and one timer.',
    lang: 'ST', scene: 'traffic',
    tags: io(TRAFFIC, ['Main_Red', 'Main_Yellow', 'Main_Green', 'Side_Red', 'Side_Yellow', 'Side_Green', 'Ped_Red', 'Ped_Green']),
    starter: { pous: [main(`
      (* State machines with CASE: traffic light junction
         1 main green 6 s, 2 main yellow 2 s, 3 all red 1 s,
         4 side green 4 s, 5 side yellow 2 s, 6 all red 1 s, then 1 again *)
      VAR
          Step      : INT := 1;   (* current step *)
          LastStep  : INT;        (* step of the previous scan *)
          StepTimer : TON;        (* time spent in the current step *)
          StepTime  : TIME;       (* duration of the current step *)
      END_VAR

      (* TODO: call StepTimer in every scan so that it restarts whenever Step changes *)

      CASE Step OF
          1:  (* main road green *)
              StepTime := T#6s;
              (* TODO: go to step 2 when the time is up *)

          (* TODO: steps 2 to 6 *)
      END_CASE;

      (* TODO: set every lamp from Step *)
      Main_Green := Step = 1;
    `)] },
    solution: { pous: [main(`
      (* Traffic light junction as a state machine *)
      VAR
          Step      : INT := 1;   (* current step, starts with main road green *)
          LastStep  : INT;        (* step of the previous scan *)
          StepTimer : TON;        (* time spent in the current step *)
          StepTime  : TIME;       (* duration of the current step *)
      END_VAR

      (* 1. One timer for all steps: it runs while the step stays the same.
            A step change makes IN FALSE for one scan, which restarts it. *)
      StepTimer(IN := (Step = LastStep), PT := StepTime);
      LastStep := Step;

      (* 2. Duration of every step and the transition to the next one *)
      CASE Step OF
          1:  StepTime := T#6s;                       (* main road green *)
              IF StepTimer.Q THEN Step := 2; END_IF;
          2:  StepTime := T#2s;                       (* main road yellow *)
              IF StepTimer.Q THEN Step := 3; END_IF;
          3:  StepTime := T#1s;                       (* all red: clear the junction *)
              IF StepTimer.Q THEN Step := 4; END_IF;
          4:  StepTime := T#4s;                       (* side road green, pedestrians walk *)
              IF StepTimer.Q THEN Step := 5; END_IF;
          5:  StepTime := T#2s;                       (* side road yellow *)
              IF StepTimer.Q THEN Step := 6; END_IF;
          6:  StepTime := T#1s;                       (* all red *)
              IF StepTimer.Q THEN Step := 1; END_IF;
      ELSE
          Step := 1;                                  (* invalid step: restart safely *)
      END_CASE;

      (* 3. Lamps: each output is written exactly once, from the step *)
      Main_Green  := Step = 1;
      Main_Yellow := Step = 2;
      Main_Red    := Step >= 3;
      Side_Green  := Step = 4;
      Side_Yellow := Step = 5;
      Side_Red    := Step <= 3 OR Step = 6;
      Ped_Green   := Step = 4;
      Ped_Red     := NOT Ped_Green;
    `)] },
    trace: ['Main_Green', 'Main_Yellow', 'Main_Red', 'Side_Green', 'Side_Yellow', 'Side_Red', 'Ped_Green'],
    theory: `
      <p>Many machines work in <strong>steps</strong>: a traffic light, a washing machine, a filling station.
      At any moment the machine is in exactly one step (state) and does something specific there.
      A <strong>transition</strong> condition (a timer, a sensor, a button) moves it on to the next step.
      Drawn as circles and arrows, that is a <strong>state diagram</strong>. Sketch it before you write a single line of code.</p>
      <h3>The step variable</h3>
      <p>Store the current step in an INT variable and use <code>CASE</code> to run only the code of the active step:</p>
      ${stFig(`
        VAR
            Step : INT := 1;
        END_VAR

        CASE Step OF
            1:  (* filling *)
                IF Level_High THEN Step := 2; END_IF;
            2:  (* mixing *)
                IF MixTimer.Q THEN Step := 3; END_IF;
            3:  (* draining *)
                IF NOT Level_Low THEN Step := 1; END_IF;
        END_CASE;
      `)}
      <p>CASE compares <code>Step</code> with each label and executes only the matching branch.
      Labels can also be lists (<code>4, 5:</code>) or ranges (<code>6..9:</code>), and an <code>ELSE</code> branch catches every other value.</p>
      <h3>Why not a pile of IFs?</h3>
      <p>You could build the same sequence from one memory bit per step, as with set and reset coils in ladder.
      But nothing stops two of those bits from being TRUE at once, and every new step means checking all the old conditions again.
      An INT can only hold one value, so the machine is always in exactly one step.
      The code reads like the state diagram, and the step number tells you at a glance where the machine is.</p>
      <h3>One timer for all steps</h3>
      <p>Timed steps can share a single TON, as long as it restarts whenever the step changes.
      A neat trick: remember the step of the previous scan and let the timer run only while it is unchanged.</p>
      ${stFig(`
        StepTimer(IN := (Step = LastStep), PT := StepTime);
        LastStep := Step;
      `)}
      <p>After a step change, <code>IN</code> is FALSE for one scan, which resets the timer. Each step sets <code>StepTime</code> to its own duration.</p>
      <h3>Outputs from the step</h3>
      <p>Set every output in exactly one place, after the CASE, as a comparison: <code>Lamp := Step = 2;</code> or <code>Valve := Step &gt;= 3;</code>.
      Then no output can be forgotten in a step, and none can stay on by accident.</p>`,
    task: `
      <ol>
        <li>Draw the state diagram: 1 main road green (6 s) &rarr; 2 main road yellow (2 s) &rarr; 3 all red (1 s) &rarr; 4 side road green (4 s) &rarr; 5 side road yellow (2 s) &rarr; 6 all red (1 s) &rarr; back to 1.</li>
        <li>Call <code>StepTimer</code> in every scan so that it restarts whenever <code>Step</code> changes.</li>
        <li>Write the CASE with one branch per step: set the step's duration and go to the next step when the timer is done.</li>
        <li>After the CASE, set all lamps from <code>Step</code>. Each road shows exactly one lamp at any time: red in every step in which it has neither green nor yellow.</li>
        <li>Pedestrians cross the main road: <code>Ped_Green</code> only in step 4 (main road red), <code>Ped_Red</code> at all other times.</li>
      </ol>`,
    hints: [
      'Main_Red is on in steps 3 to 6, Side_Red in steps 1, 2, 3 and 6.',
      'Each branch looks like this: 2: StepTime := T#2s; IF StepTimer.Q THEN Step := 3; END_IF;',
      'StepTimer(IN := (Step = LastStep), PT := StepTime); and LastStep := Step; go before the CASE, not inside it, so the timer runs in every scan.',
      'Add ELSE Step := 1; to the CASE: if Step ever gets an invalid value, the junction restarts safely.'
    ],
    tests: [
      {
        name: 'Starts with main road green',
        steps: [
          { expect: { Main_Green: true, Main_Yellow: false, Main_Red: false }, msg: 'The cycle starts with step 1: main road green' },
          { expect: { Side_Red: true, Side_Yellow: false, Side_Green: false }, msg: 'While the main road is green, the side road must be red' },
          { expect: { Ped_Red: true, Ped_Green: false }, msg: 'While the main road is green, pedestrians must see red' }
        ]
      },
      {
        name: 'Order and duration of the steps',
        steps: [
          { waitUntil: { Main_Yellow: true }, min: 5500, timeout: 7000, msg: 'Main green should last about 6 s, then main yellow' },
          { expect: { Main_Green: false, Side_Red: true }, msg: 'During main yellow: main green off, side road red' },
          { waitUntil: { Main_Red: true }, min: 1600, timeout: 2600, msg: 'Main yellow should last about 2 s, then main red' },
          { expect: { Main_Yellow: false, Side_Red: true, Side_Green: false }, msg: 'Step 3 is all red: the side road must still be red' },
          { waitUntil: { Side_Green: true }, min: 600, timeout: 1500, msg: 'After about 1 s of all red the side road gets green. Do not skip the all-red step' },
          { expect: { Main_Red: true, Side_Red: false, Ped_Green: true }, msg: 'During side green the main road is red and pedestrians may walk' },
          { waitUntil: { Side_Yellow: true }, min: 3500, timeout: 4600, msg: 'Side green should last about 4 s, then side yellow' },
          { expect: { Side_Green: false, Ped_Green: false, Main_Red: true }, msg: 'During side yellow the pedestrians must see red again' },
          { waitUntil: { Side_Red: true }, min: 1600, timeout: 2600, msg: 'Side yellow should last about 2 s, then side red' },
          { expect: { Main_Red: true, Main_Green: false }, msg: 'Step 6 is all red: the main road must still be red' },
          { waitUntil: { Main_Green: true }, min: 600, timeout: 1500, msg: 'After about 1 s of all red the main road gets green again' },
          { waitUntil: { Main_Yellow: true }, min: 5500, timeout: 7000, msg: 'The cycle must repeat: main green for about 6 s again' }
        ]
      },
      {
        name: 'Safety: never green or yellow for both roads',
        steps: [
          { never: '(Main_Green OR Main_Yellow) AND (Side_Green OR Side_Yellow)', for: 34000, msg: 'Crossing traffic must never have green or yellow at the same time' }
        ]
      },
      {
        name: 'Exactly one lamp per road',
        steps: [
          { always: 'BOOL_TO_INT(Main_Red) + BOOL_TO_INT(Main_Yellow) + BOOL_TO_INT(Main_Green) = 1', for: 17000, msg: 'The main road must show exactly one lamp (red, yellow or green) at any time' },
          { always: 'BOOL_TO_INT(Side_Red) + BOOL_TO_INT(Side_Yellow) + BOOL_TO_INT(Side_Green) = 1', for: 17000, msg: 'The side road must show exactly one lamp (red, yellow or green) at any time' }
        ]
      },
      {
        name: 'Pedestrians only walk while the main road is red',
        steps: [
          { never: 'Ped_Green AND NOT Main_Red', for: 17000, msg: 'Ped_Green is only allowed while the main road is red' },
          { always: 'Ped_Red XOR Ped_Green', for: 17000, msg: 'Pedestrians must always see exactly one lamp: Ped_Red or Ped_Green' }
        ]
      }
    ],
    quiz: [
      { q: 'Why is one INT step variable safer than one memory bit per step?', options: ['It uses less memory', 'It can only hold one value, so the machine is always in exactly one step', 'CASE runs faster than IF'], answer: 1, explain: 'Separate bits can be TRUE at the same time by mistake; one number cannot have two values.' },
      { q: 'Step is 4. The CASE has the labels 1:, 2, 3:, 4..6: and ELSE. Which branch runs?', options: ['2, 3:', '4..6:', 'ELSE'], answer: 1, explain: 'The range 4..6 includes 4.' },
      { q: 'Why is there an all-red step between main yellow and side green?', options: ['Cars that entered on yellow need time to clear the junction', 'The PLC needs one scan to switch the lamps', 'It is only required at night'], answer: 0, explain: 'The clearance time keeps late cars from meeting crossing traffic.' }
    ]
  });

  // ---------------------------------------------------------------- st-05
  L.register({
    id: 'st-05-loops', chapter: 'st', order: 5,
    title: 'Loops and arrays',
    goal: 'Store measurements in an array and process them with a FOR loop that finishes within one scan.',
    lang: 'ST', scene: 'trainer',
    tags: trainer('Pot1', 'Display1', 'Display2'),
    starter: { pous: [main(`
      (* Loops and arrays: moving average and maximum of Pot1 *)
      VAR
          Samples     : ARRAY[0..9] OF INT;   (* the last ten readings *)
          Index       : INT;                  (* where the next reading goes *)
          SampleTimer : TON;                  (* sampling clock *)
          Sum         : DINT;
          MaxValue    : INT;
          i           : INT;
      END_VAR

      (* TODO 1: every 100 ms store Pot1 in Samples[Index] and advance Index (ring buffer) *)

      (* TODO 2: average of all ten samples -> Display1 *)

      (* TODO 3: largest of the ten samples -> Display2 *)
    `)] },
    solution: { pous: [main(`
      (* Moving average and maximum over the last ten readings of Pot1 *)
      VAR
          Samples     : ARRAY[0..9] OF INT;   (* ring buffer: the last ten readings *)
          Index       : INT;                  (* position of the next reading, 0..9 *)
          SampleTimer : TON;                  (* sampling clock *)
          Sum         : DINT;
          MaxValue    : INT;
          i           : INT;
      END_VAR

      (* 1. Sampling: the timer restarts itself, so Q is TRUE for one scan about every 100 ms *)
      SampleTimer(IN := NOT SampleTimer.Q, PT := T#100ms);
      IF SampleTimer.Q THEN
          Samples[Index] := Pot1;
          Index := (Index + 1) MOD 10;        (* after 9 comes 0: overwrite the oldest value *)
      END_IF;

      (* 2. Sum and maximum of the whole buffer. The loop finishes within this scan. *)
      Sum := 0;
      MaxValue := Samples[0];
      FOR i := 0 TO 9 DO
          Sum := Sum + Samples[i];
          IF Samples[i] > MaxValue THEN
              MaxValue := Samples[i];
          END_IF;
      END_FOR;

      Display1 := DINT_TO_INT(Sum / 10);
      Display2 := MaxValue;
    `)] },
    trace: ['Pot1', 'Display1', 'Display2'],
    theory: `
      <p>A single analog reading is noisy: a level sensor sees waves, a scale sees vibration.
      A common fix is to average the last few readings. For that the PLC must keep a list of values: an <strong>array</strong>.</p>
      <h3>Arrays</h3>
      ${stFig(`
        VAR
            Temps : ARRAY[1..5] OF INT := [20, 21, 19, 22, 20];
            Total : DINT;
            i     : INT;
        END_VAR
      `)}
      <p><code>ARRAY[1..5] OF INT</code> is five INT values with the indices 1 to 5. You access one element with <code>Temps[3]</code>,
      or with a variable as index: <code>Temps[i]</code>. You choose the bounds; <code>[0..9]</code> is common.
      An index outside the bounds is a serious bug: on a real PLC it may overwrite other data, in this simulator the PLC stops with a fault.</p>
      <h3>FOR loops</h3>
      ${stFig(`
        Total := 0;
        FOR i := 1 TO 5 DO
            Total := Total + Temps[i];
        END_FOR;
      `)}
      <p>The body runs once for every value of <code>i</code> from 1 to 5 (<code>BY 2</code> would change the step).
      <code>WHILE cond DO ... END_WHILE;</code> repeats as long as a condition holds, <code>REPEAT ... UNTIL cond END_REPEAT;</code> until it holds,
      and <code>EXIT</code> leaves a loop early.</p>
      <h3>Loops run inside one scan</h3>
      <p>This is the big difference to a PC program. The whole loop runs within a single scan, and the outputs are written only at the end of that scan.
      A loop can never wait for something: <code>WHILE NOT Button1 DO END_WHILE;</code> never ends, because Button1 is read again only in the next scan.
      The PLC's <strong>watchdog</strong> notices that the scan takes too long and stops the CPU with a fault.
      Use loops to process data; use the scan cycle, timers and IFs to wait.</p>
      <h3>A ring buffer</h3>
      <p>To keep the last ten readings, write each new reading at position <code>Index</code>, then move <code>Index</code> on by one.
      When it passes the end, it starts again at 0 and overwrites the oldest value. <code>Index := (Index + 1) MOD 10;</code> does both in one line.
      The array then always holds the ten newest values, arranged in a circle.</p>`,
    task: `
      <ol>
        <li>The VAR block already declares <code>Samples : ARRAY[0..9] OF INT</code>, an index, a timer and helper variables.</li>
        <li>About every 100 ms (a TON that restarts itself), store <code>Pot1</code> in <code>Samples[Index]</code> and advance <code>Index</code> as a ring buffer.</li>
        <li>With a FOR loop over all ten elements, compute the average and show it on <code>Display1</code>.</li>
        <li>In the same loop (or a second one), find the largest of the ten samples and show it on <code>Display2</code>.</li>
        <li>Turn Pot1 quickly and watch Display1 follow smoothly, about one second behind.</li>
      </ol>`,
    hints: [
      'A self-restarting timer: SampleTimer(IN := NOT SampleTimer.Q, PT := T#100ms); Its Q is TRUE for one scan about every 100 ms. Sample inside IF SampleTimer.Q THEN ... END_IF;',
      'Set Sum := 0 before the loop, add Samples[i] inside it, and after the loop write Display1 := DINT_TO_INT(Sum / 10);',
      'For the maximum, start with MaxValue := Samples[0]; then inside the loop: IF Samples[i] > MaxValue THEN MaxValue := Samples[i]; END_IF;',
      'FOR i := 0 TO 10 reads Samples[10], which does not exist, and the PLC stops with a fault. The last index is 9.'
    ],
    tests: [
      {
        name: 'Average of a steady value',
        steps: [
          { set: { Pot1: 500 }, wait: 1500 },
          { expect: { Display1: { min: 498, max: 502 } }, msg: 'Pot1 has been 500 for 1.5 s, so the average of the last ten samples must be 500' },
          { set: { Pot1: 200 }, wait: 1500 },
          { expect: { Display1: { min: 198, max: 202 } }, msg: 'Pot1 has been 200 for 1.5 s, so the average must be 200' }
        ]
      },
      {
        name: 'Display1 is a moving average, not Pot1 itself',
        steps: [
          { set: { Pot1: 500 }, wait: 1500 },
          { set: { Pot1: 1000 }, wait: 500 },
          { expect: { Display1: { min: 550, max: 950 } }, msg: 'Half a second after Pot1 jumped from 500 to 1000, the buffer holds old and new samples: the average must lie in between. Sample only every 100 ms and average all ten elements' },
          { wait: 300 },
          { expect: { Display1: { min: 700, max: 960 } }, msg: '0.8 s after the jump, the oldest samples are still 500, so the average must still be below 1000. Average all ten elements (about 1 s of history)' },
          { wait: 700 },
          { expect: { Display1: { min: 995, max: 1000 } }, msg: 'After 1.5 s all ten samples are 1000, so the average must be 1000' }
        ]
      },
      {
        name: 'Maximum of the last ten samples',
        steps: [
          { set: { Pot1: 0 }, wait: 1500 },
          { expect: { Display2: 0 }, msg: 'All samples are 0, so the maximum is 0' },
          { set: { Pot1: 200 }, wait: 250 },
          { set: { Pot1: 400 }, wait: 250 },
          { set: { Pot1: 600 }, wait: 250 },
          { set: { Pot1: 800 }, wait: 250 },
          { set: { Pot1: 100 }, wait: 200 },
          { expect: { Display2: 800 }, msg: 'Pot1 ramped up to 800 and just dropped to 100: the largest sample in the buffer is 800' },
          { wait: 1500 },
          { expect: { Display2: 100 }, msg: 'After 1.5 s at 100 the old samples are overwritten: the maximum must drop to 100. Take the maximum of the array, not of every value ever seen' },
          { expect: { Display1: { min: 98, max: 102 } }, msg: 'The average must be 100 now' }
        ]
      }
    ],
    quiz: [
      { q: 'A : ARRAY[0..9] OF INT. Which element does not exist?', options: ['A[0]', 'A[9]', 'A[10]'], answer: 2, explain: 'The indices run from 0 to 9; that is ten elements.' },
      { q: 'What happens with WHILE NOT Button1 DO END_WHILE; in a PLC program?', options: ['The program waits until Button1 is pressed', 'The scan never finishes and the watchdog stops the PLC', 'The loop is skipped'], answer: 1, explain: 'Inputs are read only between scans, so the condition cannot change inside the loop.' },
      { q: 'Index is 9. What is (Index + 1) MOD 10?', options: ['10', '0', '1'], answer: 1, explain: 'MOD gives the remainder of the division: 10 MOD 10 = 0.' }
    ]
  });

  // ---------------------------------------------------------------- st-06
  L.register({
    id: 'st-06-functions', chapter: 'st', order: 6,
    title: 'Functions and function blocks',
    goal: 'Write your own FUNCTION and FUNCTION_BLOCK, and reuse a function block through several instances.',
    lang: 'ST', scene: 'trainer',
    tags: trainer('Button1', 'Button2', 'Button3', 'Button4', 'Lamp1', 'Lamp2', 'Pot1', 'Display1'),
    starter: {
      pous: [
        main(`
          (* Functions and function blocks
             TODO: declare two MotorControl instances in a VAR block,
                   call them for Lamp1 and Lamp2,
                   and show Pot1 in percent on Display1 using Percent(). *)
        `),
        {
          name: 'MotorControl', lang: 'ST', source: code(`
            FUNCTION_BLOCK MotorControl
            (* Start/stop logic for one motor.
               StopBtn is TRUE while the stop button is pressed. *)
            VAR_INPUT
                StartBtn : BOOL;
                StopBtn  : BOOL;
            END_VAR
            VAR_OUTPUT
                Run : BOOL;
            END_VAR

            (* TODO: seal-in for Run *)

            END_FUNCTION_BLOCK
          `)
        },
        {
          name: 'Percent', lang: 'ST', source: code(`
            FUNCTION Percent : INT
            (* Converts a raw analog value 0..1000 into 0..100 % *)
            VAR_INPUT
                Raw : INT;
            END_VAR

            (* TODO: assign the result to the function name *)
            Percent := 0;
            END_FUNCTION
          `)
        }
      ]
    },
    solution: {
      pous: [
        main(`
          (* Two motors, one function block type *)
          VAR
              Motor1 : MotorControl;   (* each instance has its own Run memory *)
              Motor2 : MotorControl;
          END_VAR

          Motor1(StartBtn := Button1, StopBtn := Button2);
          Lamp1 := Motor1.Run;

          Motor2(StartBtn := Button3, StopBtn := Button4);
          Lamp2 := Motor2.Run;

          (* A function is called inside an expression *)
          Display1 := Percent(Pot1);
        `),
        {
          name: 'MotorControl', lang: 'ST', source: code(`
            FUNCTION_BLOCK MotorControl
            (* Start/stop logic for one motor.
               StopBtn is TRUE while the stop button is pressed. *)
            VAR_INPUT
                StartBtn : BOOL;
                StopBtn  : BOOL;
            END_VAR
            VAR_OUTPUT
                Run : BOOL;
            END_VAR

            (* seal-in: Run keeps its value until the next call, stop wins *)
            Run := (StartBtn OR Run) AND NOT StopBtn;

            END_FUNCTION_BLOCK
          `)
        },
        {
          name: 'Percent', lang: 'ST', source: code(`
            FUNCTION Percent : INT
            (* Converts a raw analog value 0..1000 into 0..100 % *)
            VAR_INPUT
                Raw : INT;
            END_VAR

            Percent := Raw / 10;
            END_FUNCTION
          `)
        }
      ]
    },
    trace: ['Button1', 'Button2', 'Lamp1', 'Button3', 'Button4', 'Lamp2'],
    theory: `
      <p>A machine often contains the same thing many times: ten conveyor motors, four valves, eight identical stations.
      Copying the same rungs ten times and renaming every tag is slow and error-prone, and a bug then has to be fixed ten times.
      Instead you write the logic once as a <strong>function block</strong> (FB) and use it as often as you like, exactly like TON or CTU.</p>
      <h3>Function blocks</h3>
      ${stFig(`
        FUNCTION_BLOCK Debounce
        VAR_INPUT
            Signal : BOOL;      (* raw contact *)
            Delay  : TIME;
        END_VAR
        VAR_OUTPUT
            Out : BOOL;         (* cleaned-up signal *)
        END_VAR
        VAR
            Filter : TON;       (* internal, invisible from outside *)
        END_VAR

        Filter(IN := Signal, PT := Delay);
        Out := Filter.Q;
        END_FUNCTION_BLOCK
      `)}
      <p>An FB has <strong>inputs</strong> (VAR_INPUT), <strong>outputs</strong> (VAR_OUTPUT) and private variables (VAR).
      Each FB lives in its own POU, i.e. its own editor tab. To use it, declare <strong>instances</strong> and call each of them once per scan:</p>
      ${stFig(`
        VAR
            DoorSwitch : Debounce;
            LidSwitch  : Debounce;
        END_VAR

        DoorSwitch(Signal := Door_Raw, Delay := T#50ms);
        LidSwitch(Signal := Lid_Raw, Delay := T#50ms);
        Door_Closed := DoorSwitch.Out;
      `)}
      <p>Every instance has its own copy of all variables, including the internal timer, so the two instances never disturb each other.
      Outputs and private variables keep their values until the next call, which means an FB can contain a seal-in.</p>
      <h3>Functions</h3>
      <p>A <strong>function</strong> has inputs and one result, but <strong>no memory</strong>: the same inputs always give the same result.
      That makes it ideal for calculations such as scaling. Assign the result to the function's name, and call the function inside any expression:</p>
      ${stFig(`
        FUNCTION CelsiusToF : INT
        VAR_INPUT
            Celsius : INT;
        END_VAR
        CelsiusToF := Celsius * 9 / 5 + 32;
        END_FUNCTION

        (* in the program: *)
        Display := CelsiusToF(Temperature);
      `)}
      <h3>Function or function block?</h3>
      <p>Ask yourself: does it need to remember something from the last scan (a latch, a timer, an edge)?
      Then it must be a function block with instances. If not, a function is simpler.</p>`,
    task: `
      <ol>
        <li>Complete the function block <code>MotorControl</code> in its tab: <code>Run</code> is a seal-in that starts with <code>StartBtn</code> and stops with <code>StopBtn</code>; stop wins.
        The trainer's buttons are normally open, so the stop button is TRUE while pressed here (on a real machine it would be an NC contact).</li>
        <li>In <code>Main</code>, declare two instances <code>Motor1</code> and <code>Motor2</code> of type MotorControl.</li>
        <li>Motor1: <code>Button1</code> starts, <code>Button2</code> stops, <code>Lamp1</code> shows Run. Motor2: <code>Button3</code> starts, <code>Button4</code> stops, <code>Lamp2</code> shows Run.</li>
        <li>Complete the function <code>Percent</code>: it converts a raw value 0..1000 into 0..100. Use it in Main to show <code>Pot1</code> in percent on <code>Display1</code>.</li>
      </ol>`,
    hints: [
      'Inside the FB the seal-in is the same one-liner as in the first ST lesson, written with Run, StartBtn and StopBtn.',
      'Declare the instances in a VAR block at the top of Main: Motor1 : MotorControl; Motor2 : MotorControl;',
      'Call each instance once per scan and read its output: Motor1(StartBtn := Button1, StopBtn := Button2); Lamp1 := Motor1.Run;',
      'In the function: Percent := Raw / 10; In Main: Display1 := Percent(Pot1);'
    ],
    tests: [
      {
        name: 'Two independent motors',
        steps: [
          { expect: { Lamp1: false, Lamp2: false }, msg: 'Both motors must be off at the start' },
          { pulse: { Button1: true }, ms: 100, wait: 100 },
          { expect: { Lamp1: true }, msg: 'A short press on Button1 must start motor 1, and Lamp1 must stay on after the release' },
          { expect: { Lamp2: false }, msg: 'Button1 must not start motor 2. Use two separate instances' },
          { pulse: { Button3: true }, ms: 100, wait: 100 },
          { expect: { Lamp1: true, Lamp2: true }, msg: 'Button3 must start motor 2 while motor 1 keeps running' },
          { pulse: { Button2: true }, ms: 100, wait: 100 },
          { expect: { Lamp1: false, Lamp2: true }, msg: 'Button2 must stop motor 1 only' },
          { pulse: { Button4: true }, ms: 100, wait: 100 },
          { expect: { Lamp2: false }, msg: 'Button4 must stop motor 2' },
          { pulse: { Button3: true }, ms: 100, wait: 100 },
          { expect: { Lamp1: false, Lamp2: true }, msg: 'Starting motor 2 again must not start motor 1' }
        ]
      },
      {
        name: 'Stop wins',
        steps: [
          { set: { Button1: true, Button2: true }, wait: 100 },
          { expect: { Lamp1: false }, msg: 'Button1 and Button2 pressed together: stop must win' },
          { set: { Button1: false, Button2: false, Button3: true, Button4: true }, wait: 100 },
          { expect: { Lamp2: false }, msg: 'Button3 and Button4 pressed together: stop must win' },
          { set: { Button3: false, Button4: false }, wait: 100 },
          { expect: { Lamp1: false, Lamp2: false }, msg: 'Both motors must stay off after the buttons are released' }
        ]
      },
      {
        name: 'Pot1 in percent on Display1',
        steps: [
          { set: { Pot1: 0 }, wait: 50 },
          { expect: { Display1: 0 }, msg: 'Pot1 = 0 is 0 %' },
          { set: { Pot1: 1000 }, wait: 50 },
          { expect: { Display1: 100 }, msg: 'Pot1 = 1000 is 100 %' },
          { set: { Pot1: 500 }, wait: 50 },
          { expect: { Display1: 50 }, msg: 'Pot1 = 500 is 50 %' },
          { set: { Pot1: 457 }, wait: 50 },
          { expect: { Display1: { min: 45, max: 46 } }, msg: 'Pot1 = 457 is 45.7 %: the display should show 45 (or 46 if you round)' }
        ]
      }
    ],
    quiz: [
      { q: 'Motor1 and Motor2 are both of type MotorControl. Why do they not interfere?', options: ['Each instance has its own copy of the FB variables', 'The PLC runs them on separate CPUs', 'They do interfere: you need two different FB types'], answer: 0, explain: 'An instance is a separate set of variables; the code is shared, the memory is not.' },
      { q: 'Which one must be a FUNCTION_BLOCK rather than a FUNCTION?', options: ['Converting Celsius to Fahrenheit', 'Keeping a motor running after the start button is released', 'Returning the larger of two numbers'], answer: 1, explain: 'A seal-in must remember its state between scans, and functions have no memory.' },
      { q: 'How does a FUNCTION return its result?', options: ['By assigning a value to the function name', 'Through a VAR_OUTPUT called Result', 'Functions cannot return values'], answer: 0, explain: 'Inside the function, the function name works like a variable that holds the result.' }
    ]
  });

  // =====================================================================================
  // Chapter: Projects
  // =====================================================================================

  // ---------------------------------------------------------------- project-01
  const G_INIT = { Btn_Stop: true, Photo_Eye: true };
  const openFromClosed = [
    { pulse: { Btn_Open: true }, ms: 100 },
    { set: { Limit_Closed: false }, wait: 200 }
  ];

  L.register({
    id: 'project-01-garage', chapter: 'projects', order: 1,
    title: 'Garage door controller',
    goal: 'Combine latches, edges, timers and safety rules into a complete garage door control.',
    lang: 'ST', scene: 'garage',
    tags: io(GARAGE, ['Btn_Open', 'Btn_Close', 'Btn_Stop', 'Limit_Open', 'Limit_Closed', 'Photo_Eye', 'Remote',
      'Motor_Up', 'Motor_Down', 'Warning_Light', 'Courtesy_Light']),
    starter: { pous: [main(`
      (* Project: garage door controller
         The full specification is in the task. Plan first:
         which states does the door have, and what changes them? *)
      VAR
          (* TODO: state variables, edge detectors, timers *)
      END_VAR

      (* TODO 1: commands: Btn_Open, Btn_Close, Remote *)

      (* TODO 2: safety: light barrier, Btn_Stop (NC!), limit switches *)

      (* TODO 3: warning light and courtesy light *)

      (* TODO 4: outputs *)
      Motor_Up := FALSE;
      Motor_Down := FALSE;
    `)] },
    solution: { pous: [main(`
      (* Garage door controller *)
      VAR
          Opening    : BOOL;     (* door is moving up *)
          Closing    : BOOL;     (* door is moving down *)
          Moving     : BOOL;
          LastUp     : BOOL;     (* direction of the last movement: TRUE = up *)
          RemoteEdge : R_TRIG;   (* one pulse per press of the remote *)
          BlinkOff   : TON;      (* warning lamp: dark phase *)
          BlinkOn    : TON;      (* warning lamp: lit phase *)
          LightTimer : TOF;      (* courtesy light run-on *)
      END_VAR

      (* 1. Commands *)
      RemoteEdge(CLK := Remote);
      IF RemoteEdge.Q THEN
          IF Opening OR Closing THEN          (* moving: stop *)
              Opening := FALSE;
              Closing := FALSE;
          ELSIF Limit_Closed THEN             (* fully closed: open *)
              Opening := TRUE;
          ELSIF Limit_Open THEN               (* fully open: close *)
              Closing := TRUE;
          ELSIF LastUp THEN                   (* stopped half-way: reverse the last direction *)
              Closing := TRUE;
          ELSE
              Opening := TRUE;
          END_IF;
      END_IF;
      IF Btn_Open AND NOT Closing THEN
          Opening := TRUE;
      END_IF;
      IF Btn_Close AND NOT Opening THEN
          Closing := TRUE;
      END_IF;

      (* 2. Safety rules come last, so they override every command *)
      IF Closing AND NOT Photo_Eye THEN       (* beam interrupted: reverse and open fully *)
          Closing := FALSE;
          Opening := TRUE;
      END_IF;
      IF NOT Btn_Stop THEN                    (* NC stop button pressed (or wire broken) *)
          Opening := FALSE;
          Closing := FALSE;
      END_IF;
      IF Limit_Open THEN
          Opening := FALSE;
      END_IF;
      IF Limit_Closed THEN
          Closing := FALSE;
      END_IF;

      IF Opening THEN
          LastUp := TRUE;
      ELSIF Closing THEN
          LastUp := FALSE;
      END_IF;
      Moving := Opening OR Closing;

      (* 3. Lights: 1 Hz blinker while moving, courtesy light with 10 s run-on *)
      BlinkOff(IN := Moving AND NOT BlinkOn.Q, PT := T#500ms);
      BlinkOn(IN := BlinkOff.Q, PT := T#500ms);
      LightTimer(IN := Moving, PT := T#10s);

      (* 4. Outputs *)
      Motor_Up := Opening;
      Motor_Down := Closing;
      Warning_Light := Moving AND NOT BlinkOff.Q;
      Courtesy_Light := LightTimer.Q;
    `)] },
    trace: ['Btn_Open', 'Btn_Close', 'Remote', 'Limit_Open', 'Limit_Closed', 'Photo_Eye', 'Motor_Up', 'Motor_Down', 'Warning_Light', 'Courtesy_Light'],
    theory: `
      <p>This project is a complete product: a garage door opener like the one in millions of homes.
      There is less guidance than in the lessons. Read the specification carefully, plan, then build and test one feature at a time.
      You may solve it in ST or in ladder; the checker only looks at the outputs.</p>
      <h3>Plan the states</h3>
      <p>The door is standing still, opening or closing. Two BOOL variables such as <code>Opening</code> and <code>Closing</code> (or a step variable) describe that.
      Every rule of the specification then becomes: in which situation does Opening or Closing turn on, and when does it turn off?
      For the remote you need one more piece of memory: the direction of the last movement.</p>
      <h3>Order means priority</h3>
      <p>In ST the last assignment in a scan wins. Use that on purpose: first handle the commands (buttons, remote),
      then the safety rules (light barrier, stop button, limit switches), and finally copy the result to the outputs.
      A safety rule placed last cannot be undone by a command placed above it.</p>
      <h3>Safety first</h3>
      <ul>
        <li>The stop button is wired normally closed: if the wire breaks, the door stops. <code>Btn_Stop</code> is FALSE while pressed.</li>
        <li>The light barrier is fail-safe too: <code>Photo_Eye</code> is TRUE while the beam is clear. A blocked beam or a broken wire both mean "something is in the way".</li>
        <li><code>Motor_Up</code> and <code>Motor_Down</code> switch two contactors that reverse the motor. Both on at once would short-circuit the supply.
        Real installations add a hardware interlock, but the program must never even try.</li>
      </ul>
      <h3>Lights</h3>
      <p>The warning lamp needs a blinker like the one from the timer lesson, enabled only while the door moves.
      The courtesy light must stay on for a while after something turns off: that is exactly what a TOF does.</p>
      <h3>Test like the checker</h3>
      <p>The checker has no door model: it presses the buttons and operates the limit switches and the light barrier itself.
      Remember that a button which toggles something must be edge-detected, or holding it would toggle in every scan.</p>`,
    task: `
      <ol>
        <li><strong>Open:</strong> a press on <code>Btn_Open</code> starts <code>Motor_Up</code>. The motor keeps running after the button is released and stops at <code>Limit_Open</code>. If the door is already fully open, nothing happens.</li>
        <li><strong>Close:</strong> the same with <code>Btn_Close</code>, <code>Motor_Down</code> and <code>Limit_Closed</code>.</li>
        <li><strong>Stop:</strong> <code>Btn_Stop</code> (NC, FALSE while pressed) stops the door immediately in any position. While it is pressed, the door cannot be started.</li>
        <li><strong>Remote</strong> (one-button operation): a press while the door moves stops it. A press while it stands still moves it in the direction opposite to its last movement.
        A fully closed door always opens, a fully open door always closes. A press counts once, however long the button is held.</li>
        <li><strong>Light barrier:</strong> if the beam is interrupted (<code>Photo_Eye</code> FALSE) while the door closes, it stops and opens fully. While the beam is interrupted, the door must not start closing.</li>
        <li><code>Warning_Light</code> flashes at 1 Hz (0.5 s on, 0.5 s off) while the door moves, and is off while it stands still.</li>
        <li><code>Courtesy_Light</code> is on while the door moves and for 10 s after it has stopped.</li>
        <li><code>Motor_Up</code> and <code>Motor_Down</code> must never be TRUE at the same time.</li>
      </ol>
      <p>What happens when Btn_Open is pressed while the door is closing is up to you, as long as the motors are never on together.</p>`,
    hints: [
      'Use two latched variables, Opening and Closing. Set them from the buttons and the remote; reset them from the light barrier, Stop and the limit switches, in that order, near the end of the program.',
      'The remote needs an R_TRIG and a BOOL that remembers the last direction, e.g. IF Opening THEN LastUp := TRUE; ELSIF Closing THEN LastUp := FALSE; END_IF;',
      'Warning light: the two-TON blinker from the timer lesson, with Opening OR Closing in the first timer\'s IN. Courtesy light: a TOF with IN := Opening OR Closing and PT := T#10s.'
    ],
    tests: [
      {
        name: 'Open and close with the push buttons',
        init: Object.assign({ Limit_Closed: true }, G_INIT),
        steps: [
          { expect: { Motor_Up: false, Motor_Down: false }, msg: 'The door must stand still after power-up' },
          ...openFromClosed,
          { expect: { Motor_Up: true, Motor_Down: false }, msg: 'After a short press on Btn_Open, Motor_Up must run and keep running' },
          { wait: 1000 },
          { expect: { Motor_Up: true }, msg: 'Motor_Up must keep running until the door is fully open' },
          { set: { Limit_Open: true }, wait: 50 },
          { expect: { Motor_Up: false }, msg: 'Limit_Open reached: Motor_Up must stop' },
          { pulse: { Btn_Open: true }, ms: 100, wait: 100 },
          { expect: { Motor_Up: false }, msg: 'The door is fully open: Btn_Open must not drive the motor against the limit switch' },
          { pulse: { Btn_Close: true }, ms: 100 },
          { set: { Limit_Open: false }, wait: 200 },
          { expect: { Motor_Down: true, Motor_Up: false }, msg: 'After a short press on Btn_Close, Motor_Down must run and keep running' },
          { set: { Limit_Closed: true }, wait: 50 },
          { expect: { Motor_Down: false }, msg: 'Limit_Closed reached: Motor_Down must stop' },
          { pulse: { Btn_Close: true }, ms: 100, wait: 100 },
          { expect: { Motor_Down: false }, msg: 'The door is fully closed: Btn_Close must not drive the motor' }
        ]
      },
      {
        name: 'Stop button (NC)',
        init: Object.assign({ Limit_Closed: true }, G_INIT),
        steps: [
          ...openFromClosed,
          { expect: { Motor_Up: true }, msg: 'Btn_Open should open the door. Remember: Btn_Stop is TRUE while NOT pressed' },
          { set: { Btn_Stop: false }, wait: 100 },
          { expect: { Motor_Up: false, Motor_Down: false }, msg: 'Btn_Stop pressed (FALSE): the door must stop at once' },
          { set: { Btn_Stop: true }, wait: 500 },
          { expect: { Motor_Up: false, Motor_Down: false }, msg: 'After Stop is released, the door must stay where it is' },
          { set: { Btn_Stop: false } },
          { pulse: { Btn_Open: true }, ms: 100, wait: 200 },
          { expect: { Motor_Up: false }, msg: 'While Stop is held, Btn_Open must not start the door' },
          { set: { Btn_Stop: true } },
          { pulse: { Btn_Close: true }, ms: 100, wait: 200 },
          { expect: { Motor_Down: true }, msg: 'After Stop is released, Btn_Close must close the door' },
          { set: { Btn_Stop: false }, wait: 100 },
          { expect: { Motor_Down: false }, msg: 'Btn_Stop must also stop a closing door' }
        ]
      },
      {
        name: 'Remote: open, stop, close, stop',
        init: Object.assign({ Limit_Closed: true }, G_INIT),
        steps: [
          { set: { Remote: true }, wait: 100 },
          { set: { Limit_Closed: false }, wait: 900 },
          { expect: { Motor_Up: true, Motor_Down: false }, msg: 'A press on Remote must open a closed door. Holding the button counts as one press: use an edge' },
          { set: { Remote: false }, wait: 100 },
          { expect: { Motor_Up: true }, msg: 'Releasing Remote must not change anything' },
          { pulse: { Remote: true }, ms: 100, wait: 100 },
          { expect: { Motor_Up: false, Motor_Down: false }, msg: 'A press on Remote while the door moves must stop it' },
          { pulse: { Remote: true }, ms: 100, wait: 100 },
          { expect: { Motor_Down: true, Motor_Up: false }, msg: 'The door stopped while opening: the next press must close it (opposite direction)' },
          { pulse: { Remote: true }, ms: 100, wait: 100 },
          { expect: { Motor_Up: false, Motor_Down: false }, msg: 'A press on Remote while the door closes must stop it' },
          { pulse: { Remote: true }, ms: 100, wait: 100 },
          { expect: { Motor_Up: true, Motor_Down: false }, msg: 'The door stopped while closing: the next press must open it' },
          { set: { Limit_Open: true }, wait: 100 },
          { expect: { Motor_Up: false }, msg: 'Limit_Open reached: Motor_Up must stop' },
          { pulse: { Remote: true }, ms: 100 },
          { set: { Limit_Open: false }, wait: 100 },
          { expect: { Motor_Down: true, Motor_Up: false }, msg: 'A press on Remote must close a fully open door' },
          { set: { Limit_Closed: true }, wait: 100 },
          { expect: { Motor_Down: false }, msg: 'Limit_Closed reached: Motor_Down must stop' }
        ]
      },
      {
        name: 'Light barrier reverses a closing door',
        init: Object.assign({ Limit_Open: true }, G_INIT),
        steps: [
          { pulse: { Btn_Close: true }, ms: 100 },
          { set: { Limit_Open: false }, wait: 300 },
          { expect: { Motor_Down: true }, msg: 'Btn_Close should close the open door' },
          { set: { Photo_Eye: false }, wait: 100 },
          { expect: { Motor_Down: false, Motor_Up: true }, msg: 'Beam interrupted while closing (Photo_Eye FALSE): the door must stop and open again' },
          { set: { Photo_Eye: true }, wait: 1000 },
          { expect: { Motor_Up: true }, msg: 'After the reversal the door must open fully, even when the beam is clear again' },
          { set: { Limit_Open: true }, wait: 100 },
          { expect: { Motor_Up: false }, msg: 'Limit_Open reached: Motor_Up must stop' },
          { set: { Photo_Eye: false } },
          { pulse: { Btn_Close: true }, ms: 100, wait: 500 },
          { expect: { Motor_Down: false }, msg: 'While the beam is interrupted the door must not start closing' },
          { set: { Photo_Eye: true } },
          { pulse: { Btn_Close: true }, ms: 100, wait: 200 },
          { expect: { Motor_Down: true }, msg: 'With a clear beam, Btn_Close must close the door again' }
        ]
      },
      {
        name: 'Warning light flashes at 1 Hz while the door moves',
        init: Object.assign({ Limit_Closed: true }, G_INIT),
        steps: [
          { never: { Warning_Light: true }, for: 1000, msg: 'The warning light must be off while the door stands still' },
          ...openFromClosed,
          { waitUntil: { Warning_Light: true }, timeout: 700, msg: 'The warning light must start flashing when the door moves' },
          { waitUntil: { Warning_Light: false }, timeout: 700, msg: 'The warning light must flash (0.5 s on, 0.5 s off), not stay on' },
          { waitUntil: { Warning_Light: true }, min: 400, timeout: 700, msg: 'The warning light should be off for about 0.5 s, then on again' },
          { waitUntil: { Warning_Light: false }, min: 400, timeout: 700, msg: 'The warning light should be on for about 0.5 s' },
          { waitUntil: { Warning_Light: true }, min: 400, timeout: 700, msg: 'The warning light should keep flashing at 1 Hz' },
          { set: { Limit_Open: true }, wait: 100 },
          { never: { Warning_Light: true }, for: 1500, msg: 'The warning light must go off when the door stops' }
        ]
      },
      {
        name: 'Courtesy light: on while moving and 10 s after',
        init: Object.assign({ Limit_Closed: true }, G_INIT),
        steps: [
          { expect: { Courtesy_Light: false }, msg: 'The courtesy light must be off at the start' },
          ...openFromClosed,
          { wait: 300 },
          { expect: { Courtesy_Light: true }, msg: 'The courtesy light must be on while the door moves' },
          { set: { Limit_Open: true }, wait: 50 },
          { expect: { Motor_Up: false }, msg: 'Limit_Open reached: Motor_Up must stop' },
          { always: { Courtesy_Light: true }, for: 9500, msg: 'The courtesy light must stay on for 10 s after the door has stopped' },
          { waitUntil: { Courtesy_Light: false }, timeout: 1000, msg: 'The courtesy light should switch off about 10 s after the door stopped' }
        ]
      },
      {
        name: 'Never both motors at once',
        init: G_INIT,
        steps: [
          { set: { Btn_Open: true, Btn_Close: true } },
          { never: 'Motor_Up AND Motor_Down', for: 500, msg: 'Both buttons pressed: Motor_Up and Motor_Down must never be on together' },
          { set: { Btn_Open: false, Btn_Close: false } },
          { pulse: { Btn_Close: true }, ms: 100 },
          { never: 'Motor_Up AND Motor_Down', for: 300, msg: 'Motor_Up and Motor_Down must never be on together' },
          { pulse: { Btn_Open: true }, ms: 100 },
          { never: 'Motor_Up AND Motor_Down', for: 300, msg: 'Btn_Open while closing: Motor_Up and Motor_Down must never be on together' },
          { pulse: { Remote: true }, ms: 100 },
          { never: 'Motor_Up AND Motor_Down', for: 300, msg: 'Motor_Up and Motor_Down must never be on together' },
          { pulse: { Remote: true }, ms: 100 },
          { never: 'Motor_Up AND Motor_Down', for: 300, msg: 'Motor_Up and Motor_Down must never be on together' }
        ]
      }
    ],
    quiz: [
      { q: 'Why is the stop button wired as a normally closed contact?', options: ['NC buttons are cheaper', 'A broken wire then looks like a pressed stop button, so the machine stops safely', 'NC buttons are easier to press'], answer: 1, explain: 'Fail-safe wiring: losing the signal must lead to the safe state.' },
      { q: 'In one scan, Opening is set TRUE by a button near the top of the program and set FALSE by the limit switch near the bottom. What is written to the motor at the end of the scan?', options: ['TRUE', 'FALSE', 'It alternates from scan to scan'], answer: 1, explain: 'The last assignment in the scan wins, which is why safety rules go last.' }
    ]
  });

  // ---------------------------------------------------------------- project-02
  const carIn = [{ set: { Entry_Sensor: true }, wait: 300 }, { set: { Entry_Sensor: false }, wait: 300 }];
  const carOut = [{ set: { Exit_Sensor: true }, wait: 300 }, { set: { Exit_Sensor: false }, wait: 300 }];
  const cars = (seq, n) => { let out = []; for (let i = 0; i < n; i++) out = out.concat(seq); return out; };

  L.register({
    id: 'project-02-parking', chapter: 'projects', order: 2,
    title: 'Parking garage manager',
    goal: 'Count cars with edge detection, control two barriers and display the free spaces of a parking garage.',
    lang: 'ST', scene: 'parking',
    tags: io(PARKING, ['Entry_Sensor', 'Exit_Sensor', 'Reset', 'Entry_Gate', 'Exit_Gate', 'Full_Lamp', 'Free_Lamp', 'Free_Spaces']),
    starter: { pous: [main(`
      (* Project: parking garage manager (8 spaces) *)
      VAR CONSTANT
          Capacity : INT := 8;
      END_VAR
      VAR
          Cars : INT;     (* cars inside the garage *)
          (* TODO: edge detectors and timers *)
      END_VAR

      (* TODO 1: entry barrier *)

      (* TODO 2: exit barrier *)

      (* TODO 3: count cars in and out, Reset *)

      (* TODO 4: displays *)
      Free_Spaces := Capacity - Cars;
    `)] },
    solution: { pous: [main(`
      (* Parking garage manager *)
      VAR CONSTANT
          Capacity : INT := 8;
      END_VAR
      VAR
          Cars       : INT;      (* cars inside the garage *)
          EntryLeft  : F_TRIG;   (* a car has just left the entry loop *)
          ExitLeft   : F_TRIG;   (* a car has just left the exit loop *)
          EntryTimer : TOF;      (* keeps the entry barrier open 3 s after the car *)
          ExitTimer  : TOF;      (* keeps the exit barrier open 3 s after the car *)
      END_VAR

      (* 1. Barriers: open while a car is on the loop, close 3 s after it has left.
            The entry only opens if there is a free space. *)
      EntryTimer(IN := Entry_Sensor AND Cars < Capacity, PT := T#3s);
      Entry_Gate := EntryTimer.Q;
      ExitTimer(IN := Exit_Sensor, PT := T#3s);
      Exit_Gate := ExitTimer.Q;

      (* 2. Counting: a car is in (or out) when it leaves the loop through the open barrier *)
      EntryLeft(CLK := Entry_Sensor);
      IF EntryLeft.Q AND Entry_Gate AND Cars < Capacity THEN
          Cars := Cars + 1;
      END_IF;
      ExitLeft(CLK := Exit_Sensor);
      IF ExitLeft.Q AND Cars > 0 THEN
          Cars := Cars - 1;
      END_IF;
      IF Reset THEN
          Cars := 0;              (* attendant correction *)
      END_IF;

      (* 3. Displays *)
      Free_Spaces := Capacity - Cars;
      Full_Lamp := Cars >= Capacity;
      Free_Lamp := NOT Full_Lamp;
    `)] },
    trace: ['Entry_Sensor', 'Entry_Gate', 'Exit_Sensor', 'Exit_Gate', 'Free_Spaces', 'Full_Lamp'],
    theory: `
      <p>A parking garage with 8 spaces has an entry and an exit barrier. In front of each barrier an induction loop in the road detects a car:
      its signal is TRUE while a car stands on it. The PLC opens the barriers, keeps track of how many cars are inside,
      and shows the number of free spaces and a FULL or FREE sign at the entrance.</p>
      <h3>When is a car inside?</h3>
      <p>A car on the entry loop has not entered yet: the driver may still turn around, for instance because the garage is full.
      The car has driven in only when it leaves the loop while the barrier is open. So count on the <strong>falling edge</strong> of the loop signal (F_TRIG),
      and only if the barrier is open. A car that turns away in front of a closed barrier must not be counted.</p>
      <h3>Barrier timing</h3>
      <p>A barrier must never come down on a car. The loop lies in front of the barrier, so when the car leaves the loop it is right under the boom.
      Keep the barrier open a little longer. A TOF does exactly that: its Q follows IN immediately and stays TRUE for PT after IN has turned FALSE.</p>
      <h3>Keep the count plausible</h3>
      <p>In real life sensors miss things: two cars bumper to bumper, a motorbike that the loop does not detect.
      The count must never go below 0 or above the capacity, and the attendant needs a reset key to correct it, for example at night when the garage is empty.
      Declare the capacity as a constant:</p>
      ${stFig(`
        VAR CONSTANT
            Capacity : INT := 8;
        END_VAR
      `)}
      <p>The program cannot change a constant by mistake, and when the garage gets more spaces you change one line instead of hunting for every 8 in the code.</p>
      <h3>Plan the program</h3>
      <p>A good order is: barriers, edge detection and counting (with its limits and the reset), and finally the displays, computed from the count.
      The checker drives the loops and the reset key itself. You may solve the project in ST or in ladder.</p>`,
    task: `
      <ol>
        <li>A car on <code>Entry_Sensor</code> opens <code>Entry_Gate</code>, but only if there is a free space. The barrier stays open while the car is on the loop and closes 3 s after the car has left it.</li>
        <li>When a car leaves the entry loop while the barrier is open, it is inside: one car more. Never count above 8.</li>
        <li>A car on <code>Exit_Sensor</code> always opens <code>Exit_Gate</code> (same 3 s rule). When it leaves the exit loop: one car less, never below 0.</li>
        <li><code>Free_Spaces</code> shows 8 minus the number of cars. <code>Full_Lamp</code> is on when no space is free, <code>Free_Lamp</code> otherwise.</li>
        <li>The attendant's <code>Reset</code> key sets the number of cars to 0.</li>
      </ol>`,
    hints: [
      'Two F_TRIG instances, one per loop, give you a one-scan pulse when a car leaves the loop.',
      'Entry barrier with a TOF: EntryTimer(IN := Entry_Sensor AND Cars < Capacity, PT := T#3s); Entry_Gate := EntryTimer.Q;',
      'Counting in: IF EntryLeft.Q AND Entry_Gate AND Cars < Capacity THEN Cars := Cars + 1; END_IF; The exit is the mirror image with Cars > 0.'
    ],
    tests: [
      {
        name: 'Empty garage at the start',
        steps: [
          { expect: { Free_Spaces: 8, Free_Lamp: true, Full_Lamp: false }, msg: 'At the start all 8 spaces are free: FREE sign on, FULL sign off' },
          { expect: { Entry_Gate: false, Exit_Gate: false }, msg: 'Both barriers must be closed while no car is on a loop' }
        ]
      },
      {
        name: 'A car enters',
        steps: [
          { set: { Entry_Sensor: true }, wait: 200 },
          { expect: { Entry_Gate: true }, msg: 'A car on the entry loop must open the entry barrier' },
          { wait: 2000 },
          { expect: { Entry_Gate: true, Free_Spaces: 8 }, msg: 'While the car waits on the loop the barrier stays open, and the car is not inside yet' },
          { set: { Entry_Sensor: false }, wait: 100 },
          { expect: { Free_Spaces: 7 }, msg: 'The car has left the loop through the open barrier: Free_Spaces must be 7 (count once, not every scan)' },
          { expect: { Entry_Gate: true }, msg: 'The barrier must stay open for 3 s after the car has left the loop' },
          { waitUntil: { Entry_Gate: false }, min: 2500, timeout: 3600, msg: 'The entry barrier should close about 3 s after the car has left the loop' },
          { expect: { Free_Spaces: 7 }, msg: 'Free_Spaces must still be 7' }
        ]
      },
      {
        name: 'Cars leave',
        steps: [
          ...cars(carIn, 2),
          { expect: { Free_Spaces: 6 }, msg: 'Two cars entered: Free_Spaces must be 6' },
          { set: { Exit_Sensor: true }, wait: 200 },
          { expect: { Exit_Gate: true }, msg: 'A car on the exit loop must open the exit barrier' },
          { set: { Exit_Sensor: false }, wait: 100 },
          { expect: { Free_Spaces: 7 }, msg: 'A car has left the garage: Free_Spaces must go up to 7' },
          { expect: { Exit_Gate: true }, msg: 'The exit barrier must stay open for 3 s after the car has left the loop' },
          { waitUntil: { Exit_Gate: false }, min: 2500, timeout: 3600, msg: 'The exit barrier should close about 3 s after the car has left the loop' },
          ...cars(carOut, 2),
          { expect: { Free_Spaces: 8 }, msg: 'Two cars in, three out: the count must not go below 0, so Free_Spaces stays 8' }
        ]
      },
      {
        name: 'Full garage',
        steps: [
          ...cars(carIn, 8),
          { expect: { Free_Spaces: 0, Full_Lamp: true, Free_Lamp: false }, msg: 'Eight cars inside: Free_Spaces 0, FULL sign on, FREE sign off' },
          { wait: 3500 },
          { expect: { Entry_Gate: false }, msg: 'The entry barrier must close 3 s after the last car' },
          { set: { Entry_Sensor: true } },
          { always: { Entry_Gate: false }, for: 1000, msg: 'The garage is full: the entry barrier must stay closed for the next car' },
          { set: { Entry_Sensor: false }, wait: 300 },
          { expect: { Free_Spaces: 0 }, msg: 'A car that turned away in front of the closed barrier must not be counted' },
          ...carOut,
          { expect: { Free_Spaces: 1, Full_Lamp: false, Free_Lamp: true }, msg: 'One car has left: one space free, FREE sign on again' },
          { set: { Entry_Sensor: true }, wait: 200 },
          { expect: { Entry_Gate: true }, msg: 'There is a free space again: the entry barrier must open' }
        ]
      },
      {
        name: 'Reset key',
        steps: [
          ...cars(carIn, 3),
          { expect: { Free_Spaces: 5 }, msg: 'Three cars entered: Free_Spaces must be 5' },
          { pulse: { Reset: true }, ms: 200, wait: 100 },
          { expect: { Free_Spaces: 8, Free_Lamp: true }, msg: 'The Reset key must set the number of cars to 0: Free_Spaces 8' }
        ]
      }
    ],
    quiz: [
      { q: 'Why is a car counted when it leaves the entry loop, and not when it arrives?', options: ['Arriving cars are too fast to detect', 'A car on the loop may still turn around; only after passing the open barrier is it really inside', 'Induction loops only detect leaving cars'], answer: 1, explain: 'The falling edge with the barrier open is the moment the car has actually driven in.' },
      { q: 'Which timer keeps a barrier open for 3 s after the car has left the loop?', options: ['TON', 'TOF', 'TP'], answer: 1, explain: 'A TOF switches on at once and off only PT after its input has turned FALSE.' }
    ]
  });

  // ---------------------------------------------------------------- project-03
  const C_INIT = { Stop: true, Pusher_Home: true };
  const smallBox = [{ pulse: { Sensor_Exit: true }, ms: 200, wait: 300 }];

  L.register({
    id: 'project-03-sorting', chapter: 'projects', order: 3,
    title: 'Sorting line',
    goal: 'Run a complete sorting conveyor: start/stop, timed feeder, pneumatic pusher sequence and batch counting.',
    lang: 'ST', scene: 'conveyor',
    tags: io(CONVEYOR, ['Start', 'Stop', 'Sensor_Tall', 'Sensor_Exit', 'Pusher_Home', 'Pusher_Out',
      'Conveyor', 'Pusher', 'Feeder', 'Lamp_Run', 'Count_Display']),
    starter: { pous: [main(`
      (* Project: sorting line *)
      VAR CONSTANT
          BatchSize : INT := 10;
      END_VAR
      VAR
          Running : BOOL;     (* the line is running *)
          (* TODO: pusher memory, counter, timers, edge detectors *)
      END_VAR

      (* TODO 1: start / stop (Stop is NC: FALSE while pressed) *)

      (* TODO 2: feeder: a new box every 3 s while running *)

      (* TODO 3: pusher sequence for tall boxes *)

      (* TODO 4: count small boxes, stop after a batch *)

      Conveyor := Running;
      Lamp_Run := Running;
    `)] },
    solution: { pous: [main(`
      (* Sorting line *)
      VAR CONSTANT
          BatchSize : INT := 10;
      END_VAR
      VAR
          Running    : BOOL;     (* the line is running *)
          Pushing    : BOOL;     (* pusher stroke in progress *)
          SmallCount : INT;      (* small boxes in the current batch *)
          FeedTimer  : TON;      (* feeder clock *)
          TallPassed : F_TRIG;   (* a tall box has just passed the height sensor *)
          ExitEdge   : R_TRIG;   (* a box has just reached the exit eye *)
      END_VAR

      (* 1. Start / stop. Stop is NC (FALSE while pressed) and wins over Start. *)
      IF Start AND Stop AND NOT Running THEN
          IF SmallCount >= BatchSize THEN
              SmallCount := 0;        (* the last batch was complete: start a new one *)
          END_IF;
          Running := TRUE;
      END_IF;
      IF NOT Stop THEN
          Running := FALSE;           (* pause: the count is kept *)
      END_IF;

      (* 2. Feeder: a box right after the start, then one about every 3 s.
            Feeder is TRUE during the first 0.5 s of each period. *)
      FeedTimer(IN := Running AND NOT FeedTimer.Q, PT := T#3s);
      Feeder := Running AND FeedTimer.ET < T#500ms;

      (* 3. Pusher: when a tall box has passed the height sensor it is in front of the pusher.
            Extend until the end position switch reports "out", then retract. *)
      TallPassed(CLK := Sensor_Tall);
      IF TallPassed.Q AND Pusher_Home THEN
          Pushing := TRUE;
      END_IF;
      IF Pusher_Out THEN
          Pushing := FALSE;
      END_IF;
      Pusher := Pushing;

      (* 4. Count small boxes at the exit; a full batch stops the line *)
      ExitEdge(CLK := Sensor_Exit);
      IF ExitEdge.Q AND Running THEN
          SmallCount := SmallCount + 1;
          IF SmallCount >= BatchSize THEN
              Running := FALSE;
          END_IF;
      END_IF;

      (* 5. Outputs *)
      Count_Display := SmallCount;
      Conveyor := Running;
      Lamp_Run := Running;
    `)] },
    trace: ['Conveyor', 'Feeder', 'Sensor_Tall', 'Pusher', 'Pusher_Out', 'Sensor_Exit', 'Count_Display'],
    theory: `
      <p>A conveyor carries boxes from a feeder to the end of the belt. Some boxes are too tall for the next machine:
      a height sensor detects them, and a pneumatic pusher shoves them off the belt into a reject bin.
      Small boxes reach the end of the belt and are counted. After a batch of 10 small boxes the line stops, so the operator can take the full crate away.</p>
      <h3>A machine with several parts</h3>
      <p>Treat each part as a small program section with its own variables:</p>
      <ul>
        <li><strong>Operating mode:</strong> a <code>Running</code> latch with Start (NO) and Stop (NC, FALSE while pressed). It is also reset when the batch is complete.</li>
        <li><strong>Feeder:</strong> drops a box on every rising edge of <code>Feeder</code>. A self-restarting TON makes a clock; while the line stands still, the clock must stand still too.</li>
        <li><strong>Pusher:</strong> a small sequence of its own, see below.</li>
        <li><strong>Counter:</strong> rising edges of <code>Sensor_Exit</code>, shown on <code>Count_Display</code>.</li>
      </ul>
      <h3>Pneumatic cylinders</h3>
      <p>The pusher is a single-acting cylinder with a solenoid valve: <code>Pusher</code> TRUE extends it, FALSE lets it retract.
      Two reed switches report its end positions, <code>Pusher_Home</code> and <code>Pusher_Out</code>.
      Never rely on a fixed time for a cylinder: wait for the end position switch, because air pressure and load change the speed.</p>
      <h3>Timing the push</h3>
      <p>The height sensor sits just upstream of the pusher. While a tall box is under the sensor it has not reached the pusher yet:
      extending now would hit the front edge of the box. The moment the box has passed the sensor (falling edge of <code>Sensor_Tall</code>)
      it is right in front of the pusher. By the time the cylinder is fully out, the sensor has long been FALSE,
      so the pusher needs its own memory: start the stroke on the edge, end it at <code>Pusher_Out</code>.</p>
      <h3>Batches</h3>
      <p>Decide what Start means when a batch is complete: here it starts a new batch with the counter at 0.
      A Stop in the middle of a batch only pauses the line, and the count is kept. Write such decisions down before you program them.
      You may solve the project in ST or in ladder.</p>`,
    task: `
      <ol>
        <li><code>Start</code> starts the line, <code>Stop</code> (NC) stops it, and Stop wins over Start. <code>Lamp_Run</code> and <code>Conveyor</code> are on while the line runs.</li>
        <li>While the line runs, the feeder drops a box about every 3 s: give <code>Feeder</code> a rising edge every 3 s (the first one right after the start or after 3 s, as you like). No new boxes while the line is stopped.</li>
        <li>When a tall box has passed the height sensor (<code>Sensor_Tall</code> turns FALSE again) and the pusher is at home (<code>Pusher_Home</code>), extend <code>Pusher</code> until <code>Pusher_Out</code> reports the end position, then retract it.</li>
        <li>Count the small boxes arriving at <code>Sensor_Exit</code> (rising edges) and show the count on <code>Count_Display</code>.</li>
        <li>After 10 small boxes the line stops. Start then begins a new batch at 0. A Stop in the middle of a batch keeps the count.</li>
      </ol>`,
    hints: [
      'Feeder clock: FeedTimer(IN := Running AND NOT FeedTimer.Q, PT := T#3s); FeedTimer.Q is TRUE for one scan about every 3 s, and Feeder := FeedTimer.Q; already gives one rising edge per period.',
      'Pusher: an F_TRIG on Sensor_Tall. IF TallPassed.Q AND Pusher_Home THEN Pushing := TRUE; END_IF; IF Pusher_Out THEN Pushing := FALSE; END_IF; Pusher := Pushing;',
      'Batch end: when the counter reaches 10, reset Running. In the start logic, set the counter back to 0 if it is already 10.'
    ],
    tests: [
      {
        name: 'Start and stop',
        init: C_INIT,
        steps: [
          { expect: { Conveyor: false, Lamp_Run: false }, msg: 'The line must be stopped after power-up' },
          { pulse: { Start: true }, ms: 100, wait: 200 },
          { expect: { Conveyor: true, Lamp_Run: true }, msg: 'A short press on Start must start the belt and Lamp_Run, and they must stay on' },
          { wait: 1000 },
          { expect: { Conveyor: true, Lamp_Run: true }, msg: 'The line must keep running' },
          { set: { Stop: false }, wait: 100 },
          { expect: { Conveyor: false, Lamp_Run: false }, msg: 'Stop pressed (FALSE, it is an NC button): the line must stop' },
          { set: { Stop: true }, wait: 500 },
          { expect: { Conveyor: false }, msg: 'After Stop is released the line must not start again by itself' },
          { set: { Stop: false } },
          { pulse: { Start: true }, ms: 100, wait: 200 },
          { expect: { Conveyor: false }, msg: 'While Stop is held, Start must not start the line' }
        ]
      },
      {
        name: 'Feeder drops a box every 3 s while running',
        init: C_INIT,
        steps: [
          { never: { Feeder: true }, for: 3500, msg: 'While the line is stopped the feeder must not drop boxes' },
          { pulse: { Start: true }, ms: 100 },
          { waitUntil: { Feeder: true }, timeout: 3500, msg: 'After the start, the feeder should drop the first box within 3 s' },
          { waitUntil: { Feeder: false }, timeout: 2000, msg: 'Feeder must go FALSE again: every box needs a new rising edge' },
          { waitUntil: { Feeder: true }, min: 2000, timeout: 3600, msg: 'The next box should come about 3 s after the previous one' },
          { waitUntil: { Feeder: false }, timeout: 2000, msg: 'Feeder must go FALSE again: every box needs a new rising edge' },
          { waitUntil: { Feeder: true }, min: 2000, timeout: 3600, msg: 'The feeder should keep dropping a box about every 3 s' },
          { set: { Stop: false }, wait: 600 },
          { never: { Feeder: true }, for: 4000, msg: 'After Stop the feeder must not drop any more boxes' }
        ]
      },
      {
        name: 'Tall boxes are pushed off',
        init: C_INIT,
        steps: [
          { pulse: { Start: true }, ms: 100 },
          { never: { Pusher: true }, for: 1000, msg: 'Without a tall box the pusher must stay retracted' },
          { set: { Sensor_Tall: true } },
          { never: { Pusher: true }, for: 300, msg: 'While the tall box is still under the height sensor it has not reached the pusher yet: extending now hits its front edge. Wait until it has passed the sensor' },
          { set: { Sensor_Tall: false } },
          { waitUntil: { Pusher: true }, timeout: 800, msg: 'The tall box has passed the height sensor: the pusher must extend' },
          { set: { Pusher_Home: false }, wait: 300 },
          { expect: { Pusher: true }, msg: 'The pusher must keep extending until Pusher_Out reports the end position' },
          { set: { Pusher_Out: true }, wait: 100 },
          { expect: { Pusher: false }, msg: 'Pusher_Out reached: the pusher must retract' },
          { set: { Pusher_Out: false }, wait: 200 },
          { set: { Pusher_Home: true } },
          { never: { Pusher: true }, for: 1000, msg: 'After the stroke the pusher must stay home until the next tall box' },
          { expect: { Conveyor: true }, msg: 'The line must still be running' }
        ]
      },
      {
        name: 'Count small boxes and stop after 10',
        init: C_INIT,
        steps: [
          { pulse: { Start: true }, ms: 100, wait: 100 },
          { expect: { Count_Display: 0 }, msg: 'The count must start at 0' },
          ...cars(smallBox, 3),
          { expect: { Count_Display: 3 }, msg: 'Three boxes passed Sensor_Exit: Count_Display must be 3 (count edges, not scans)' },
          { expect: { Conveyor: true }, msg: 'The line must keep running until the batch is complete' },
          ...cars(smallBox, 7),
          { expect: { Count_Display: 10 }, msg: 'Ten boxes passed Sensor_Exit: Count_Display must be 10' },
          { expect: { Conveyor: false, Lamp_Run: false }, msg: 'After 10 small boxes the line must stop' },
          { wait: 3500 },
          { expect: { Conveyor: false }, msg: 'The line must stay stopped after a complete batch' },
          { pulse: { Start: true }, ms: 100, wait: 200 },
          { expect: { Conveyor: true, Count_Display: 0 }, msg: 'Start after a complete batch must start a new batch: line running, count back to 0' },
          ...smallBox,
          { expect: { Count_Display: 1 }, msg: 'The new batch must count from 0 again' }
        ]
      },
      {
        name: 'Stop pauses the batch',
        init: C_INIT,
        steps: [
          { pulse: { Start: true }, ms: 100, wait: 100 },
          ...cars(smallBox, 3),
          { set: { Stop: false }, wait: 200 },
          { set: { Stop: true }, wait: 100 },
          { expect: { Conveyor: false, Count_Display: 3 }, msg: 'Stop must stop the line and keep the count (3)' },
          { pulse: { Start: true }, ms: 100, wait: 200 },
          { expect: { Conveyor: true, Count_Display: 3 }, msg: 'Start in the middle of a batch must continue it: the count stays 3' },
          ...smallBox,
          { expect: { Count_Display: 4 }, msg: 'The batch continues counting: 4' }
        ]
      }
    ],
    quiz: [
      { q: 'Why would Pusher := Sensor_Tall; be wrong on this line?', options: ['Sensor signals cannot be written to outputs', 'While the box is under the sensor it has not reached the pusher yet, and when it has, the sensor is already FALSE', 'The cylinder would extend too slowly'], answer: 1, explain: 'The stroke must start when the box has passed the sensor and needs memory until the end position is reached.' },
      { q: 'How do you know that a pneumatic cylinder has fully extended?', options: ['Wait a fixed 1 s', 'Its end position switch (reed switch) reports it', 'The solenoid output turns off by itself'], answer: 1, explain: 'Air pressure and load change the speed; only the end position switch tells the truth.' }
    ]
  });
})(window.PLC = window.PLC || {});
