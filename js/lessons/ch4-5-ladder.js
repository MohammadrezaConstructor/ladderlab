/* LadderLab — lessons, chapter 4 (counters and numbers) and chapter 5 (applications), ladder diagram. */
(function (PLC) {
  'use strict';
  const L = PLC.lessons;

  // ---------------------------------------------------------------- scene wiring (must match js/scenes/*.js)
  const WIRING = {
    motor: [
      ['Start', 'BOOL', '%IX0.0', 'Start push button, green (NO contact)'],
      ['Stop', 'BOOL', '%IX0.1', 'Stop push button, red (NC contact: TRUE when NOT pressed)'],
      ['Start_Rev', 'BOOL', '%IX0.2', 'Start reverse push button (NO contact)'],
      ['Overload', 'BOOL', '%IX0.3', 'Overload relay contact (NC: TRUE = OK, FALSE = tripped)'],
      ['Motor', 'BOOL', '%QX0.0', 'Contactor K1: motor forward'],
      ['Motor_Rev', 'BOOL', '%QX0.1', 'Contactor K2: motor reverse'],
      ['Lamp_Run', 'BOOL', '%QX0.2', 'Green pilot lamp: running'],
      ['Lamp_Fault', 'BOOL', '%QX0.3', 'Red pilot lamp: fault']
    ],
    tank: [
      ['Level_Low', 'BOOL', '%IX0.0', 'Low level switch (TRUE when liquid covers it, at 20 %)'],
      ['Level_High', 'BOOL', '%IX0.1', 'High level switch (TRUE when liquid covers it, at 80 %)'],
      ['Start', 'BOOL', '%IX0.2', 'Start push button (NO)'],
      ['Stop', 'BOOL', '%IX0.3', 'Stop push button (NC: TRUE when not pressed)'],
      ['Auto_Mode', 'BOOL', '%IX0.4', 'Selector switch: TRUE = automatic mode'],
      ['Level', 'INT', '%IW0', 'Level transmitter 0..1000 (= 0.0..100.0 %)'],
      ['Pump', 'BOOL', '%QX0.0', 'Inlet pump P1 (fills the tank)'],
      ['Drain_Valve', 'BOOL', '%QX0.1', 'Outlet valve V1 (drains the tank)'],
      ['Mixer', 'BOOL', '%QX0.2', 'Mixer motor M2'],
      ['Alarm', 'BOOL', '%QX0.3', 'Alarm beacon'],
      ['Display', 'INT', '%QW0', 'Panel display (shows any number)']
    ],
    conveyor: [
      ['Start', 'BOOL', '%IX0.0', 'Start push button (NO)'],
      ['Stop', 'BOOL', '%IX0.1', 'Stop push button (NC: TRUE when not pressed)'],
      ['Sensor_Entry', 'BOOL', '%IX0.2', 'Photo-eye at the start of the belt (TRUE while a box blocks the beam)'],
      ['Sensor_Tall', 'BOOL', '%IX0.3', 'Height sensor in front of the pusher (TRUE while a tall box is under it)'],
      ['Sensor_Exit', 'BOOL', '%IX0.4', 'Photo-eye at the end of the belt (TRUE while a box blocks the beam)'],
      ['Pusher_Home', 'BOOL', '%IX0.5', 'Pusher retracted (reed switch)'],
      ['Pusher_Out', 'BOOL', '%IX0.6', 'Pusher fully extended (reed switch)'],
      ['Conveyor', 'BOOL', '%QX0.0', 'Belt motor'],
      ['Pusher', 'BOOL', '%QX0.1', 'Pusher cylinder solenoid (TRUE = extend)'],
      ['Feeder', 'BOOL', '%QX0.2', 'Box feeder: each rising edge drops a new box'],
      ['Lamp_Run', 'BOOL', '%QX0.3', 'Running lamp'],
      ['Count_Display', 'INT', '%QW0', 'Counter display']
    ],
    garage: [
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
    ],
    cylinders: [
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
    ],
    parking: [
      ['Entry_Sensor', 'BOOL', '%IX0.0', 'Induction loop in front of the entry barrier (TRUE while a car is on it)'],
      ['Exit_Sensor', 'BOOL', '%IX0.1', 'Induction loop in front of the exit barrier (TRUE while a car is on it)'],
      ['Reset', 'BOOL', '%IX0.2', 'Attendant reset key (NO)'],
      ['Entry_Gate', 'BOOL', '%QX0.0', 'Entry barrier (TRUE = open)'],
      ['Exit_Gate', 'BOOL', '%QX0.1', 'Exit barrier (TRUE = open)'],
      ['Full_Lamp', 'BOOL', '%QX0.2', 'Red FULL sign'],
      ['Free_Lamp', 'BOOL', '%QX0.3', 'Green FREE sign'],
      ['Free_Spaces', 'INT', '%QW0', 'Display: number of free spaces']
    ]
  };

  /** Scene I/O tags by name, in the order given. */
  function io(scene, names) {
    return names.map(n => {
      const w = WIRING[scene].find(t => t[0] === n);
      if (!w) throw new Error('ch4-5-ladder: ' + n + ' is not wired in scene ' + scene);
      return { name: w[0], type: w[1], address: w[2], comment: w[3] };
    });
  }
  /** Internal tag (no address). */
  const mem = (name, type, comment) => ({ name, type, comment });
  /** Repeat a block of test steps n times. */
  function times(n, fn) { const out = []; for (let i = 0; i < n; i++) out.push(...fn(i)); return out; }

  // ================================================================ chapter 4: counters and numbers

  // ---------------------------------------------------------------- 4.1 CTU
  const box = (sensor) => [{ pulse: { [sensor]: true }, ms: 300 }, { wait: 300 }];

  L.register({
    id: 'ld-data-01-ctu', chapter: 'ld-data', order: 1,
    title: 'Counting with CTU',
    goal: 'Count events with the up counter CTU, use its preset value and output, and reset it.',
    lang: 'LD', scene: 'conveyor',
    tags: io('conveyor', ['Start', 'Stop', 'Sensor_Exit', 'Conveyor', 'Lamp_Run', 'Count_Display']).concat([
      mem('C1', 'CTU', 'Box counter: one batch = 5 boxes')
    ]),
    starter: { pous: [{ name: 'Main', lang: 'LD', rungs: [
      { comment: 'Belt: Start/Stop seal-in (Stop is wired NC)', text: '[ NO(Start) | NO(Conveyor) ] NO(Stop) COIL(Conveyor)' },
      { comment: 'Running lamp', text: 'NO(Conveyor) COIL(Lamp_Run)' },
      ''
    ] }] },
    solution: { pous: [{ name: 'Main', lang: 'LD', rungs: [
      { comment: 'Count the boxes leaving the belt. Start resets the counter for a new batch.', text: 'NO(Sensor_Exit) CTU(C1, R=Start, PV=5, CV=Count_Display)' },
      { comment: 'Belt: Start/Stop seal-in, stops when the batch is complete (C1.Q)', text: '[ NO(Start) | NO(Conveyor) ] NO(Stop) NC(C1.Q) COIL(Conveyor)' },
      { comment: 'Running lamp', text: 'NO(Conveyor) COIL(Lamp_Run)' }
    ] }] },
    trace: ['Start', 'Sensor_Exit', 'Conveyor', 'Count_Display'],
    theory: `
      <p>Many machines have to count: boxes on a belt, strokes of a press, bottles in a crate. A PLC counts with a
      <strong>counter function block</strong>. The most common one is the <strong>up counter CTU</strong>.</p>
      <h3>How CTU works</h3>
      <ul>
        <li><strong>CU</strong> (count up) is the input the rung powers. Every <strong>rising edge</strong> on CU (FALSE to TRUE) adds 1.</li>
        <li><strong>CV</strong> (current value) is the count so far, an INT.</li>
        <li><strong>PV</strong> (preset value) is the target. The output <strong>Q</strong> is TRUE as long as CV &gt;= PV.</li>
        <li><strong>R</strong> (reset) sets CV back to 0 while it is TRUE.</li>
      </ul>
      <div class="ld-figure" data-rungs="NO(Pulse) CTU(C1, R=Reset, PV=3, CV=Count) COIL(Done)"></div>
      <p>The counter reacts to edges, not to levels. A box that blocks a photo-eye for two seconds keeps the input TRUE for
      hundreds of scans, but it is still one box. CTU remembers the state of CU from the previous scan and only counts
      when it changes from FALSE to TRUE, so you do not need an edge contact in front of it.</p>
      <div class="td-figure" data-signals='[{"name":"CU","wave":"0110011000110000"},{"name":"Q (PV = 3)","wave":"0000000000111000"},{"name":"R","wave":"0000000000000110"}]' data-step="100 ms"></div>
      <p>Like a timer, every counter needs its own <strong>instance</strong>: a tag of type <code>CTU</code>, here <code>C1</code>.
      You can use its outputs anywhere as <code>C1.Q</code> and <code>C1.CV</code>, for example as the tag of an NC contact.
      Writing <code>CV = Count_Display</code> in the box copies the count to the display on every scan.</p>
      <h3>Why the reset matters</h3>
      <p>CV keeps its value until R is TRUE. If nobody resets the counter, Q stays TRUE for ever and the next batch is
      "complete" before it has even started. Always decide which signal starts a new count. On this belt it is the Start button:
      pressing it begins a new batch.</p>`,
    task: `
      <ol>
        <li>The belt rung (Start/Stop seal-in) and <code>Lamp_Run</code> are already there. Press Run, start the belt and drop a few boxes.</li>
        <li>Add a counter rung: an NO contact <code>Sensor_Exit</code> feeding a CTU box with instance <code>C1</code>,
          <code>PV = 5</code>, <code>R = Start</code> and <code>CV = Count_Display</code>.</li>
        <li>Stop the belt when the batch is complete: add an NC contact <code>C1.Q</code> in series in the belt rung.</li>
        <li>Check: after 5 boxes the belt stops and <code>Lamp_Run</code> goes off. Start resets the count to 0 and runs the belt again.</li>
      </ol>`,
    hints: [
      'CTU counts rising edges by itself, so a plain NO contact Sensor_Exit in front of the box is enough.',
      'The tag C1.Q can be used on a contact. An NC contact C1.Q opens as soon as 5 boxes have been counted.',
      'Counter rung: NO(Sensor_Exit) CTU(C1, R=Start, PV=5, CV=Count_Display). Belt rung: [ Start | Conveyor ], then Stop, then an NC contact C1.Q, then the coil Conveyor.'
    ],
    tests: [
      {
        name: 'Five boxes make a batch',
        init: { Stop: true },
        steps: [
          { expect: { Conveyor: false }, msg: 'The belt must not run before Start is pressed' },
          { pulse: { Start: true }, ms: 100 },
          { expect: { Conveyor: true, Lamp_Run: true }, msg: 'Start should run the belt and light Lamp_Run' },
          ...times(4, () => box('Sensor_Exit')),
          { expect: 'Count_Display = 4', msg: 'After 4 boxes Count_Display should show 4. Connect CV of the counter to Count_Display' },
          { expect: { Conveyor: true }, msg: 'After 4 boxes the batch is not complete yet: the belt must keep running' },
          ...box('Sensor_Exit'),
          { expect: { Conveyor: false, Lamp_Run: false }, msg: 'After the 5th box the batch is complete: the belt must stop' },
          { expect: 'Count_Display = 5', msg: 'Count_Display should show 5 at the end of the batch' },
          { wait: 1000 },
          { expect: { Conveyor: false }, msg: 'The belt must stay stopped until Start is pressed again' }
        ]
      },
      {
        name: 'Start begins a new batch',
        init: { Stop: true },
        steps: [
          { pulse: { Start: true }, ms: 100 },
          ...times(5, () => box('Sensor_Exit')),
          { expect: { Conveyor: false }, msg: 'After 5 boxes the belt must stop' },
          { pulse: { Start: true }, ms: 100 },
          { expect: 'Count_Display = 0', msg: 'Start must reset the counter to 0 (connect Start to the R input of the CTU)' },
          { expect: { Conveyor: true }, msg: 'After Start the belt must run again for the next batch' },
          ...times(2, () => box('Sensor_Exit')),
          { expect: 'Count_Display = 2', msg: 'The new batch must be counted from 0 again' },
          { expect: { Conveyor: true }, msg: 'With only 2 boxes in the new batch the belt must keep running' }
        ]
      },
      {
        name: 'A box standing in the beam counts once',
        init: { Stop: true },
        steps: [
          { pulse: { Start: true }, ms: 100 },
          { set: { Sensor_Exit: true }, wait: 2000 },
          { set: { Sensor_Exit: false }, wait: 200 },
          { expect: 'Count_Display = 1', msg: 'A box that blocks the beam for 2 s is still one box: count rising edges, not scans' }
        ]
      }
    ],
    quiz: [
      { q: 'A box blocks Sensor_Exit for 2 seconds (200 scans). How much does a CTU on Sensor_Exit count?', options: ['1', '200', '2'], answer: 0, explain: 'CTU only counts the rising edge, when the beam is first blocked.' },
      { q: 'PV = 5. When is the output Q of the CTU TRUE?', options: ['Only in the scan of the 5th edge', 'As long as CV >= 5, until R resets the counter', 'When CV is back at 0'], answer: 1, explain: 'Q compares CV with PV on every call, so it stays TRUE until a reset brings CV below PV.' },
      { q: 'What happens if a counter is never reset?', options: ['It restarts at 0 after reaching PV', 'CV keeps its value and Q stays TRUE', 'The PLC resets it at the next scan'], answer: 1, explain: 'A counter only goes back to 0 when its R input is TRUE.' }
    ]
  });

  // ---------------------------------------------------------------- 4.2 CTUD
  const carIn = (n) => times(n, () => [
    { set: { Entry_Sensor: true }, wait: 300 },
    { expect: { Entry_Gate: true }, msg: 'A car is on the entry loop and the park is not full: Entry_Gate must open' },
    { set: { Entry_Sensor: false }, wait: 300 }
  ]);
  const carOut = (n) => times(n, () => [
    { set: { Exit_Sensor: true }, wait: 300 },
    { expect: { Exit_Gate: true }, msg: 'A car is on the exit loop: Exit_Gate must open' },
    { set: { Exit_Sensor: false }, wait: 300 }
  ]);

  L.register({
    id: 'ld-data-02-ctud', chapter: 'ld-data', order: 2,
    title: 'Up and down: the car park counter',
    goal: 'Track a quantity that goes up and down with the CTUD counter and choose the right edge to count.',
    lang: 'LD', scene: 'parking',
    tags: io('parking', ['Entry_Sensor', 'Exit_Sensor', 'Reset', 'Entry_Gate', 'Exit_Gate', 'Full_Lamp', 'Free_Lamp', 'Free_Spaces']).concat([
      mem('C1', 'CTUD', 'Car counter, capacity 8'),
      mem('Cars', 'INT', 'Number of cars inside')
    ]),
    starter: { pous: [{ name: 'Main', lang: 'LD', rungs: [
      '',
      { comment: 'Exit barrier: open while a car is on the exit loop', text: 'NO(Exit_Sensor) COIL(Exit_Gate)' }
    ] }] },
    solution: { pous: [{ name: 'Main', lang: 'LD', rungs: [
      { comment: 'Count cars: +1 when a car has driven over the entry loop (falling edge), -1 when a car reaches the exit loop', text: 'N(Entry_Sensor) CTUD(C1, CD=Exit_Sensor, R=Reset, PV=8, CV=Cars) COIL(Full_Lamp)' },
      { comment: 'FREE sign while the park is not full', text: 'NC(Full_Lamp) COIL(Free_Lamp)' },
      { comment: 'Free spaces = capacity - cars', text: 'SUB(8, Cars, OUT=Free_Spaces)' },
      { comment: 'Entry barrier: open while a car waits and there is room', text: 'NO(Entry_Sensor) NC(Full_Lamp) COIL(Entry_Gate)' },
      { comment: 'Exit barrier: open while a car is on the exit loop', text: 'NO(Exit_Sensor) COIL(Exit_Gate)' }
    ] }] },
    trace: ['Entry_Sensor', 'Entry_Gate', 'Exit_Sensor', 'Full_Lamp', 'Free_Spaces'],
    theory: `
      <p>Some quantities go up and down: cars in a car park, parts in a buffer, people in a room. For these the
      <strong>up/down counter CTUD</strong> has two counting inputs:</p>
      <ul>
        <li><strong>CU</strong> (powered by the rung): each rising edge adds 1.</li>
        <li><strong>CD</strong> (a parameter of the box): each rising edge subtracts 1.</li>
        <li><strong>R</strong> resets CV to 0. <strong>LD</strong> loads CV with PV.</li>
        <li><strong>QU</strong> is TRUE while CV &gt;= PV. The box passes it on to the right of the rung.
          <strong>QD</strong> is TRUE while CV &lt;= 0.</li>
      </ul>
      <div class="ld-figure" data-rungs="NO(Part_In) CTUD(C2, CD=Part_Out, R=Clear, PV=20, CV=Parts) COIL(Buffer_Full)"></div>
      <h3>When does a car count?</h3>
      <p>Our car park has one induction loop in front of each barrier. A loop is TRUE while a car stands on it.
      If you count on the <em>rising</em> edge, the car counts as inside the moment it arrives, before the barrier has even opened.
      With 7 cars inside, the 8th car pushes the count to 8, the park reports FULL, and the barrier stays shut in front of
      the very car that should take the last space.</p>
      <p>The fix: count the car when it has <strong>driven over</strong> the loop, on the <strong>falling edge</strong>.
      An <code>N</code> contact (falling edge) in front of the counter gives exactly one pulse when the car leaves the loop, and CTUD counts that pulse.
      At the exit no trick is needed: the exit barrier always opens, so a car on the exit loop is leaving for sure.</p>
      <div class="td-figure" data-signals='[{"name":"Entry_Sensor","wave":"0011111000"},{"name":"Entry_Gate","wave":"0011111000"},{"name":"N(Entry_Sensor)","wave":"0000000100"}]' data-step="0.5 s"></div>
      <h3>Free spaces and the reset key</h3>
      <p>Drivers want to see free spaces, not cars. A <strong>SUB</strong> box calculates <code>OUT := IN1 - IN2</code>:
      <code>SUB(8, Cars, OUT=Free_Spaces)</code>. You will meet more arithmetic boxes in a later lesson.</p>
      <p>Counters drift in real life: a motorbike is too light for the loop, two cars drive through close together.
      That is why the attendant has a <strong>Reset</strong> key that sets the count back to 0 when the park is empty.</p>`,
    task: `
      <ol>
        <li>Add the counter rung: an N contact <code>Entry_Sensor</code> feeding a CTUD box <code>C1</code> with
          <code>CD = Exit_Sensor</code>, <code>R = Reset</code>, <code>PV = 8</code> and <code>CV = Cars</code>.
          The output of the box drives the coil <code>Full_Lamp</code>.</li>
        <li><code>Free_Lamp</code> is on whenever the park is not full.</li>
        <li><code>Free_Spaces</code> shows 8 minus <code>Cars</code> (SUB box).</li>
        <li><code>Entry_Gate</code> opens while a car is on <code>Entry_Sensor</code> and the park is not full.</li>
        <li>The exit rung is already done: <code>Exit_Gate</code> opens while a car is on <code>Exit_Sensor</code>.</li>
      </ol>`,
    hints: [
      'The rung powers CU. CD is a parameter of the CTUD box: type the tag name Exit_Sensor into it.',
      'Use the falling edge contact N in front of the counter. A plain contact counts the car on arrival, and then the 8th car finds the barrier closed.',
      'Full_Lamp can be used as an NC contact, both for Free_Lamp and for the entry barrier.',
      'Rungs: N(Entry_Sensor) CTUD(C1, CD=Exit_Sensor, R=Reset, PV=8, CV=Cars) COIL(Full_Lamp); NC(Full_Lamp) COIL(Free_Lamp); SUB(8, Cars, OUT=Free_Spaces); NO(Entry_Sensor) NC(Full_Lamp) COIL(Entry_Gate).'
    ],
    tests: [
      {
        name: 'Cars in and out',
        steps: [
          { expect: { Free_Lamp: true, Full_Lamp: false }, msg: 'The park starts empty: Free_Lamp on, Full_Lamp off' },
          { expect: 'Free_Spaces = 8', msg: 'With no cars inside, Free_Spaces must show 8 (8 - Cars with a SUB box)' },
          { expect: { Entry_Gate: false, Exit_Gate: false }, msg: 'Without cars on the loops both barriers stay closed' },
          ...carIn(2),
          { expect: 'Free_Spaces = 6', msg: 'Two cars have entered: Free_Spaces must show 6' },
          ...carOut(1),
          { expect: 'Free_Spaces = 7', msg: 'One car has left: Free_Spaces must show 7. Connect Exit_Sensor to the CD input' }
        ]
      },
      {
        name: 'Full at 8 cars',
        steps: [
          ...carIn(7),
          { expect: 'Free_Spaces = 1', msg: 'With 7 cars inside Free_Spaces must show 1' },
          { expect: { Full_Lamp: false, Free_Lamp: true }, msg: 'With 7 cars inside one space is still free' },
          { set: { Entry_Sensor: true }, wait: 300 },
          { expect: { Entry_Gate: true }, msg: 'The 8th car must be let in, one space is still free. If the barrier stays closed, you count the car when it arrives. Count it when it leaves the loop (N contact)' },
          { set: { Entry_Sensor: false }, wait: 300 },
          { expect: { Full_Lamp: true, Free_Lamp: false }, msg: 'With 8 cars inside the park is full: Full_Lamp on, Free_Lamp off' },
          { expect: 'Free_Spaces = 0', msg: 'With 8 cars inside Free_Spaces must show 0' },
          { set: { Entry_Sensor: true } },
          { never: 'Entry_Gate', for: 1000, msg: 'The park is full: the entry barrier must stay closed for the 9th car' },
          { set: { Exit_Sensor: true }, wait: 300 },
          { expect: { Exit_Gate: true }, msg: 'The exit barrier must open even when the park is full' },
          { set: { Exit_Sensor: false }, wait: 300 },
          { expect: { Full_Lamp: false }, msg: 'A car has left: the park is no longer full' },
          { waitUntil: 'Entry_Gate', timeout: 500, msg: 'A space is free again, so the barrier must open for the waiting car' },
          { set: { Entry_Sensor: false }, wait: 300 },
          { expect: { Full_Lamp: true }, msg: 'The waiting car has entered: the park is full again' }
        ]
      },
      {
        name: 'Reset key',
        steps: [
          ...carIn(3),
          { expect: 'Free_Spaces = 5', msg: 'Three cars have entered: Free_Spaces must show 5' },
          { pulse: { Reset: true }, ms: 200 },
          { expect: 'Free_Spaces = 8', msg: 'The Reset key must set the counter back to 0 cars (R input of the CTUD)' }
        ]
      },
      {
        name: 'A waiting car counts once',
        steps: [
          { set: { Entry_Sensor: true }, wait: 3000 },
          { set: { Entry_Sensor: false }, wait: 300 },
          { expect: 'Free_Spaces = 7', msg: 'A car that stands on the entry loop for a long time is still one car' },
          { set: { Exit_Sensor: true }, wait: 3000 },
          { set: { Exit_Sensor: false }, wait: 300 },
          { expect: 'Free_Spaces = 8', msg: 'A car that stands on the exit loop for a long time is still one car' }
        ]
      }
    ],
    quiz: [
      { q: 'CV = 8 and PV = 8. Which outputs of the CTUD are TRUE?', options: ['QU only', 'QD only', 'QU and QD'], answer: 0, explain: 'QU means CV >= PV; QD means CV <= 0, which is not the case.' },
      { q: 'Why is the entry counted on the falling edge of Entry_Sensor?', options: ['CTUD cannot count rising edges', 'The car then counts as inside only after it has passed the barrier', 'It counts twice as fast'], answer: 1, explain: 'Counting on arrival would report FULL before the 8th car has entered and lock it out.' },
      { q: 'What does the R input of a CTUD do?', options: ['Sets CV to 0', 'Loads CV with PV', 'Reverses the counting direction'], answer: 0, explain: 'R resets the count to 0; LD would load the preset value.' }
    ]
  });

  // ---------------------------------------------------------------- 4.3 comparators
  L.register({
    id: 'ld-data-03-compare', chapter: 'ld-data', order: 3,
    title: 'Comparing numbers: two-point level control',
    goal: 'Compare analog values with comparator boxes and build a two-point controller with hysteresis.',
    lang: 'LD', scene: 'tank',
    tags: io('tank', ['Level', 'Pump', 'Alarm']),
    starter: { pous: [{ name: 'Main', lang: 'LD', rungs: [''] }] },
    solution: { pous: [{ name: 'Main', lang: 'LD', rungs: [
      { comment: 'Level below 30 %: start filling', text: 'LT(IN1=Level, IN2=300) SET(Pump)' },
      { comment: 'Level above 70 %: stop filling', text: 'GT(IN1=Level, IN2=700) RESET(Pump)' },
      { comment: 'Overfill warning above 90 %', text: 'GT(IN1=Level, IN2=900) COIL(Alarm)' }
    ] }] },
    trace: ['Level', 'Pump', 'Alarm'],
    theory: `
      <p>Analog signals such as a level, a temperature or a pressure reach the PLC as numbers. Our level transmitter delivers
      <code>Level</code> as an INT from 0 (empty) to 1000 (full, 100.0 %). To make decisions with numbers, ladder has
      <strong>comparator boxes</strong>. A comparator works like a contact: it passes power when its comparison is true.</p>
      <ul>
        <li><code>EQ</code> =, <code>NE</code> &lt;&gt;, <code>GT</code> &gt;, <code>GE</code> &gt;=, <code>LT</code> &lt;, <code>LE</code> &lt;=</li>
        <li>IN1 is the left side, IN2 the right side: <code>GT(IN1=Level, IN2=900)</code> means Level &gt; 900.</li>
      </ul>
      <h3>One threshold is not enough</h3>
      <p>The obvious way to keep a tank filled is "pump on while Level &lt; 500". It fails in practice. Near 500 the surface
      ripples: waves, the inflow of the pump itself, a noisy sensor. The comparison flips TRUE, FALSE, TRUE several times per second,
      and the pump follows. This <strong>chattering</strong> burns the contacts of the contactor and overheats the motor,
      which is built for a few starts per hour, not per second.</p>
      <h3>Two thresholds: hysteresis</h3>
      <p>A <strong>two-point controller</strong> uses two thresholds. The pump switches on when the level falls <em>below</em>
      the lower one and off when it rises <em>above</em> the upper one. In between it keeps doing what it was doing.
      This memory is called <strong>hysteresis</strong>. In ladder you build it from comparators in front of SET and RESET coils,
      like this electric heater that keeps a temperature between 180 and 220:</p>
      <div class="ld-figure" data-rungs="LT(IN1=Temp, IN2=180) SET(Heater)||GT(IN1=Temp, IN2=220) RESET(Heater)"></div>
      <div class="td-figure" data-signals='[{"name":"Level &lt; 300","wave":"110000000000110000"},{"name":"Level &gt; 700","wave":"000000111100000000"},{"name":"Pump","wave":"111111000000111111"}]' data-step="10 s"></div>
      <p>The gap between the thresholds decides how often the pump starts: a wide gap means few, long pump runs.</p>
      <p>An alarm is different. It should simply show the current state, so it uses a normal coil:
      TRUE while the comparison is true, FALSE as soon as it is not.</p>`,
    task: `
      <ol>
        <li>Switch <code>Pump</code> on (SET) while <code>Level</code> is below 300.</li>
        <li>Switch <code>Pump</code> off (RESET) while <code>Level</code> is above 700.</li>
        <li>Turn <code>Alarm</code> on while <code>Level</code> is above 900 (overfill warning).</li>
        <li>Run it: drag the consumer slider in the scene to draw liquid off, and watch the pump start and stop.</li>
      </ol>`,
    hints: [
      'A comparator box behaves like a contact. Put an LT box with IN1 = Level and IN2 = 300 in front of a SET coil Pump.',
      'Between 300 and 700 neither rung is powered, so Pump keeps its last value. That is exactly the hysteresis you want.',
      'Solution: LT(IN1=Level, IN2=300) SET(Pump); GT(IN1=Level, IN2=700) RESET(Pump); GT(IN1=Level, IN2=900) COIL(Alarm).'
    ],
    tests: [
      {
        name: 'Pump switches at 300 and 700',
        steps: [
          { set: { Level: 250 }, wait: 100 },
          { expect: { Pump: true }, msg: 'Below 300 the pump must switch on' },
          { set: { Level: 500 }, wait: 100 },
          { expect: { Pump: true }, msg: 'The tank is filling and passes 500: the pump must stay on until the level is above 700' },
          { set: { Level: 680 }, wait: 100 },
          { expect: { Pump: true }, msg: 'At 680 the pump must still be on (it switches off above 700)' },
          { set: { Level: 720 }, wait: 100 },
          { expect: { Pump: false }, msg: 'Above 700 the pump must switch off' },
          { set: { Level: 500 }, wait: 100 },
          { expect: { Pump: false }, msg: 'The level falls through 500: the pump must stay off until the level is below 300' },
          { set: { Level: 320 }, wait: 100 },
          { expect: { Pump: false }, msg: 'At 320 the pump must still be off (it switches on below 300)' },
          { set: { Level: 280 }, wait: 100 },
          { expect: { Pump: true }, msg: 'Below 300 the pump must switch on again' }
        ]
      },
      {
        name: 'No chattering when the level ripples',
        steps: [
          { set: { Level: 200 }, wait: 100 },
          ...times(10, i => [
            { set: { Level: i % 2 ? 490 : 510 } },
            { always: 'Pump', for: 50, msg: 'The level ripples between 490 and 510 while the tank fills: the pump must stay on without chattering' }
          ]),
          { set: { Level: 750 }, wait: 100 },
          ...times(10, i => [
            { set: { Level: i % 2 ? 490 : 510 } },
            { never: 'Pump', for: 50, msg: 'The level ripples between 490 and 510 while the tank drains: the pump must stay off' }
          ])
        ]
      },
      {
        name: 'Overfill alarm',
        steps: [
          { set: { Level: 500 }, wait: 100 },
          { expect: { Alarm: false }, msg: 'At level 500 there must be no alarm' },
          { set: { Level: 880 }, wait: 100 },
          { expect: { Alarm: false }, msg: 'At 880 there is no alarm yet (it starts above 900)' },
          { set: { Level: 920 }, wait: 100 },
          { expect: { Alarm: true }, msg: 'Above 900 the Alarm beacon must be on' },
          { set: { Level: 880 }, wait: 100 },
          { expect: { Alarm: false }, msg: 'Below 900 the alarm must go off again: use a normal coil, not SET' }
        ]
      }
    ],
    quiz: [
      { q: 'Two-point control with 300/700. The level is 500 and rising, the pump is on. What happens?', options: ['The pump switches off', 'The pump stays on until the level is above 700', 'The pump switches on and off'], answer: 1, explain: 'Between the thresholds the controller keeps its last state.' },
      { q: 'Why does a single threshold make the pump chatter?', options: ['The PLC scans too slowly', 'Small ripples around the threshold flip the comparison again and again', 'Comparators only work with REAL numbers'], answer: 1, explain: 'Without hysteresis every ripple across the threshold switches the pump.' },
      { q: 'Which comparator passes power when Level is 300 or more?', options: ['GT', 'GE', 'LE'], answer: 1, explain: 'GE means greater than or equal.' }
    ]
  });

  // ---------------------------------------------------------------- 4.4 arithmetic
  L.register({
    id: 'ld-data-04-math', chapter: 'ld-data', order: 4,
    title: 'Calculating with numbers',
    goal: 'Scale and combine numbers with MOVE, ADD, SUB, MUL and DIV, and avoid the pitfalls of integer arithmetic.',
    lang: 'LD', scene: 'tank',
    tags: io('tank', ['Start', 'Level', 'Pump', 'Display']).concat([
      mem('Volume', 'INT', 'Tank content in litres (2000 L when full)'),
      mem('Free_Volume', 'INT', 'Litres that still fit into the tank')
    ]),
    starter: { pous: [{ name: 'Main', lang: 'LD', rungs: [
      { comment: 'Given: two-point level control from the last lesson (keeps the level moving)', text: 'LT(IN1=Level, IN2=300) SET(Pump)' },
      { comment: 'Given', text: 'GT(IN1=Level, IN2=700) RESET(Pump)' },
      ''
    ] }] },
    solution: { pous: [{ name: 'Main', lang: 'LD', rungs: [
      { comment: 'Two-point level control', text: 'LT(IN1=Level, IN2=300) SET(Pump)' },
      { comment: 'Two-point level control', text: 'GT(IN1=Level, IN2=700) RESET(Pump)' },
      { comment: 'Level in percent: 0..1000 becomes 0..100', text: 'DIV(Level, 10, OUT=Display)' },
      { comment: 'Content in litres: Level 1000 = 2000 L', text: 'MUL(Level, 2, OUT=Volume)' },
      { comment: 'Litres that still fit in', text: 'SUB(2000, Volume, OUT=Free_Volume)' },
      { comment: 'While Start is held, show litres instead of percent (after the DIV rung, so this one wins)', text: 'NO(Start) MOVE(Volume, OUT=Display)' }
    ] }] },
    trace: ['Level', 'Display', 'Volume', 'Start'],
    theory: `
      <p>Raw sensor values are rarely what an operator wants to see. A PLC converts them into percent, litres or degrees,
      adds up production figures and calculates set points. Ladder has <strong>arithmetic boxes</strong> for this:</p>
      <ul>
        <li><strong>MOVE</strong>: OUT := IN (copy a value)</li>
        <li><strong>ADD</strong>: OUT := IN1 + IN2, <strong>SUB</strong>: OUT := IN1 - IN2</li>
        <li><strong>MUL</strong>: OUT := IN1 * IN2, <strong>DIV</strong>: OUT := IN1 / IN2</li>
        <li><strong>MOD</strong>: OUT := the remainder of IN1 / IN2</li>
      </ul>
      <p>An arithmetic box sits at the end of a rung, like a coil. It only calculates while power reaches it. Without contacts
      in front it calculates on every scan. With a contact in front it only calculates while the contact is closed;
      otherwise OUT keeps its old value. If two rungs write the same variable, the lower rung wins, because the rungs run from top to bottom.</p>
      <div class="ld-figure" data-rungs="ADD(Shift_A, Shift_B, OUT=Total)||NO(Clear) MOVE(0, OUT=Total)"></div>
      <h3>Integer division</h3>
      <p>INT values are whole numbers. Dividing two INTs throws the remainder away: <code>7 / 2 = 3</code>, and
      <code>456 / 10 = 45</code>, not 45.6. Nothing is rounded. MOD returns the part that was thrown away: <code>456 MOD 10 = 6</code>.</p>
      <h3>INT range and overflow</h3>
      <p>An INT has 16 bits and holds -32768 to 32767. A larger result does not fit: it <strong>wraps around</strong>
      to a negative number, and the PLC does not warn you. Say you calculate a percentage as <code>Level * 100 / 1000</code>.
      At Level = 456 the product 45600 is too big for an INT and becomes -19936, so the display shows nonsense.
      Dividing first (<code>Level / 10</code>) keeps the numbers small. When values really are large, use the 32-bit type DINT.</p>
      <p>The order also decides precision: <code>Level / 10 * 2</code> loses the last digit before it multiplies,
      <code>Level * 2 / 10</code> keeps it. Multiply first when the product stays in range; divide first when it might not.</p>`,
    task: `
      <ol>
        <li>The pump rungs from the last lesson are given, so the level moves when you use the consumer slider.</li>
        <li>Show the level in percent on <code>Display</code>: <code>Display := Level / 10</code> (DIV box).</li>
        <li>The tank holds 2000 L when full (Level 1000). Calculate its content: <code>Volume := Level * 2</code> (MUL box).</li>
        <li>Calculate how much still fits in: <code>Free_Volume := 2000 - Volume</code> (SUB box).</li>
        <li>In this plant the Start button doubles as a display key: while <code>Start</code> is held, show <code>Volume</code>
          on <code>Display</code> instead of the percentage (MOVE box with a contact in front, placed below the DIV rung).</li>
      </ol>`,
    hints: [
      'Arithmetic boxes need no contact in front. DIV(Level, 10, OUT=Display) calculates on every scan.',
      'Put the MUL rung above the SUB rung, so Free_Volume always uses the Volume of the same scan.',
      'The MOVE rung must come after the DIV rung. Otherwise the DIV rung overwrites Display again in the same scan.',
      'Rungs: DIV(Level, 10, OUT=Display); MUL(Level, 2, OUT=Volume); SUB(2000, Volume, OUT=Free_Volume); NO(Start) MOVE(Volume, OUT=Display).'
    ],
    tests: [
      {
        name: 'Level in percent',
        steps: [
          { set: { Level: 456 }, wait: 100 },
          { expect: 'Display = 45', msg: 'Level 456 means 45.6 %. Display = Level / 10 = 45 (integer division drops the decimal)' },
          { set: { Level: 1000 }, wait: 100 },
          { expect: 'Display = 100', msg: 'A full tank (Level 1000) must show 100' },
          { set: { Level: 999 }, wait: 100 },
          { expect: 'Display = 99', msg: 'Level 999 is 99.9 %, integer division gives 99' },
          { set: { Level: 0 }, wait: 100 },
          { expect: 'Display = 0', msg: 'An empty tank must show 0' }
        ]
      },
      {
        name: 'Volume and free volume',
        steps: [
          { set: { Level: 456 }, wait: 100 },
          { expect: { Volume: 912 }, msg: 'Level 456 is 912 L (Volume = Level * 2)' },
          { expect: { Free_Volume: 1088 }, msg: '2000 - 912 = 1088 L still fit in (Free_Volume = 2000 - Volume)' },
          { set: { Level: 1000 }, wait: 100 },
          { expect: { Volume: 2000, Free_Volume: 0 }, msg: 'A full tank holds 2000 L and nothing more fits in' },
          { set: { Level: 0 }, wait: 100 },
          { expect: { Volume: 0, Free_Volume: 2000 }, msg: 'An empty tank holds 0 L and 2000 L fit in' }
        ]
      },
      {
        name: 'Litres on request',
        steps: [
          { set: { Level: 300 }, wait: 100 },
          { expect: 'Display = 30', msg: 'Without Start the display shows percent (30)' },
          { set: { Start: true }, wait: 100 },
          { expect: 'Display = 600', msg: 'While Start is held the display must show the volume (600 L). The MOVE rung must come after the DIV rung' },
          { set: { Start: false }, wait: 100 },
          { expect: 'Display = 30', msg: 'After releasing Start the display must show percent again' }
        ]
      }
    ],
    quiz: [
      { q: 'Level = 456. What is Level / 10 as an INT?', options: ['45', '46', '45.6'], answer: 0, explain: 'Integer division drops the remainder, it does not round.' },
      { q: 'An INT holds 30000. You add 5000. What happens?', options: ['35000 is stored', 'The value wraps around to a negative number', 'The PLC stops with an error'], answer: 1, explain: '35000 does not fit into 16 bits; it wraps around to -30536.' },
      { q: 'A MOVE box has an open contact in front of it. What happens to OUT?', options: ['OUT becomes 0', 'OUT keeps its last value', 'OUT copies IN anyway'], answer: 1, explain: 'An unpowered box does not execute, so OUT is left unchanged.' }
    ]
  });

  // ================================================================ chapter 5: applications

  // ---------------------------------------------------------------- 5.1 forward/reverse
  L.register({
    id: 'ld-apps-01-fwd-rev', chapter: 'ld-apps', order: 1,
    title: 'Forward/reverse starter with interlocks',
    goal: 'Control a reversing motor safely with contactor and push-button interlocks.',
    lang: 'LD', scene: 'motor',
    tags: io('motor', ['Start', 'Stop', 'Start_Rev', 'Overload', 'Motor', 'Motor_Rev', 'Lamp_Run', 'Lamp_Fault']),
    starter: { pous: [{ name: 'Main', lang: 'LD', rungs: [
      { comment: 'Forward (K1): Start/Stop seal-in, stops when the overload relay trips', text: '[ NO(Start) | NO(Motor) ] NO(Stop) NO(Overload) COIL(Motor)' },
      ''
    ] }] },
    solution: { pous: [{ name: 'Main', lang: 'LD', rungs: [
      { comment: 'Forward (K1): starts only if Start_Rev is not pressed; interlocked with K2', text: '[ NO(Start) NC(Start_Rev) | NO(Motor) ] NO(Stop) NO(Overload) NC(Motor_Rev) COIL(Motor)' },
      { comment: 'Reverse (K2): mirror image of the forward rung', text: '[ NO(Start_Rev) NC(Start) | NO(Motor_Rev) ] NO(Stop) NO(Overload) NC(Motor) COIL(Motor_Rev)' },
      { comment: 'Running lamp: either direction', text: '[ NO(Motor) | NO(Motor_Rev) ] COIL(Lamp_Run)' },
      { comment: 'Fault lamp: overload relay tripped (its NC input is FALSE)', text: 'NC(Overload) COIL(Lamp_Fault)' }
    ] }] },
    trace: ['Start', 'Start_Rev', 'Stop', 'Motor', 'Motor_Rev', 'Overload'],
    theory: `
      <p>Conveyors, hoists, mixers and gates often run in both directions. A three-phase motor reverses when two of its three
      phases are swapped. In the cabinet two contactors do this: <strong>K1</strong> connects the motor for forward,
      <strong>K2</strong> connects it with two phases swapped for reverse.</p>
      <p>If K1 and K2 ever close at the same time, two phases are short-circuited. Fuses blow, contacts weld together,
      and in the worst case the cabinet catches fire. The circuits that prevent this are called <strong>interlocks</strong>.</p>
      <h3>Contactor interlock</h3>
      <p>Each rung gets an NC contact of the <em>other</em> output. While B is on, its NC contact in the rung of A is open,
      so A cannot switch on, and the other way round:</p>
      <div class="ld-figure" data-rungs="NO(Cmd_A) NC(Out_B) COIL(Out_A)||NO(Cmd_B) NC(Out_A) COIL(Out_B)"></div>
      <h3>Push-button interlock</h3>
      <p>What if the operator presses both start buttons at the same moment? With only the contactor interlock, the rung that comes
      first in the program wins, and the motor starts in a direction nobody clearly chose. Put an NC contact of the <em>other</em>
      start button in series with each start button. Pressing both then starts nothing.</p>
      <h3>Reversing needs a stop</h3>
      <p>Switching from forward straight to reverse at full speed (plugging) causes a current surge of many times the rated current
      and a hard jolt to the gearbox. In this plant the operator must press Stop first. As long as the push-button interlock
      sits only in the start branch, not in the seal-in path, the other start button has no effect on a running motor.</p>
      <h3>Software is not enough</h3>
      <p>A program can have bugs, and a contactor can weld shut. Real cabinets therefore <strong>also</strong> wire an NC auxiliary
      contact of K2 in series with the coil of K1 and vice versa, and often add a mechanical interlock between the two contactors.
      The software interlock is an extra layer, never the only one.</p>
      <p>Remember: Stop and the overload relay are wired NC. Their inputs are TRUE while everything is fine, so they appear as
      NO contacts in the program.</p>`,
    task: `
      <ol>
        <li>The forward rung (seal-in with Stop and Overload) is given. Add the reverse rung: <code>Start_Rev</code> starts
          <code>Motor_Rev</code>, which seals itself in and stops with <code>Stop</code> or a tripped <code>Overload</code>.</li>
        <li>Contactor interlock: an NC contact <code>Motor_Rev</code> in the forward rung and an NC contact <code>Motor</code> in the reverse rung.</li>
        <li>Push-button interlock: an NC contact <code>Start_Rev</code> in series with <code>Start</code>, and an NC contact
          <code>Start</code> in series with <code>Start_Rev</code>. Keep them out of the seal-in branch: a running motor ignores the other start button.</li>
        <li><code>Lamp_Run</code> is on while the motor runs in either direction.</li>
        <li><code>Lamp_Fault</code> is on while the overload relay has tripped (<code>Overload</code> is FALSE).</li>
      </ol>`,
    hints: [
      'Copy the forward rung and change the tags: Start_Rev instead of Start, Motor_Rev instead of Motor.',
      'An NC contact reads the coil tag of the other rung: NC contact Motor is closed while Motor is FALSE.',
      'If Start_Rev switches a running motor straight to reverse, your NC contact Start_Rev is in series with the whole rung. Move it into the start branch, next to Start.',
      'Forward rung: [ NO(Start) NC(Start_Rev) | NO(Motor) ] NO(Stop) NO(Overload) NC(Motor_Rev) COIL(Motor). The reverse rung is its mirror image.'
    ],
    tests: [
      {
        name: 'Forward: start and stop',
        init: { Stop: true, Overload: true },
        steps: [
          { expect: { Motor: false, Motor_Rev: false }, msg: 'Nothing may run before a start button is pressed' },
          { pulse: { Start: true }, ms: 100 },
          { expect: { Motor: true, Motor_Rev: false, Lamp_Run: true }, msg: 'Start should switch on Motor (forward) and Lamp_Run' },
          { wait: 500 },
          { expect: { Motor: true }, msg: 'The motor must keep running after Start is released (seal-in)' },
          { pulse: { Stop: false }, ms: 100 },
          { expect: { Motor: false, Lamp_Run: false }, msg: 'Stop must switch the motor and Lamp_Run off' }
        ]
      },
      {
        name: 'Reverse: start and stop',
        init: { Stop: true, Overload: true },
        steps: [
          { pulse: { Start_Rev: true }, ms: 100 },
          { expect: { Motor_Rev: true, Motor: false }, msg: 'Start_Rev should switch on Motor_Rev (reverse)' },
          { expect: { Lamp_Run: true }, msg: 'Lamp_Run must also be on while the motor runs in reverse' },
          { wait: 500 },
          { expect: { Motor_Rev: true }, msg: 'Reverse must keep running after Start_Rev is released (seal-in)' },
          { pulse: { Stop: false }, ms: 100 },
          { expect: { Motor_Rev: false, Lamp_Run: false }, msg: 'Stop must also stop the reverse direction' }
        ]
      },
      {
        name: 'Interlock: never both contactors',
        init: { Stop: true, Overload: true },
        steps: [
          { pulse: { Start: true }, ms: 100 },
          { expect: { Motor: true }, msg: 'Start should run the motor forward' },
          { set: { Start_Rev: true } },
          { never: 'Motor AND Motor_Rev', for: 500, msg: 'K1 (Motor) and K2 (Motor_Rev) must never be on together, that is a short circuit. Add the NC interlock contacts' },
          { expect: { Motor: true, Motor_Rev: false }, msg: 'While the motor runs forward, Start_Rev must be ignored: reversing requires Stop first. Keep the NC contact Start_Rev out of the seal-in path' },
          { set: { Start_Rev: false }, wait: 200 },
          { pulse: { Stop: false }, ms: 100 },
          { pulse: { Start_Rev: true }, ms: 100 },
          { expect: { Motor_Rev: true }, msg: 'After Stop, Start_Rev should run the motor in reverse' },
          { set: { Start: true } },
          { never: 'Motor AND Motor_Rev', for: 500, msg: 'K1 (Motor) and K2 (Motor_Rev) must never be on together, that is a short circuit. Add the NC interlock contacts' },
          { expect: { Motor_Rev: true, Motor: false }, msg: 'While the motor runs in reverse, Start must be ignored: reversing requires Stop first' },
          { set: { Start: false }, wait: 200 }
        ]
      },
      {
        name: 'Push-button interlock',
        init: { Stop: true, Overload: true },
        steps: [
          { set: { Start: true, Start_Rev: true } },
          { never: 'Motor OR Motor_Rev', for: 500, msg: 'Both start buttons pressed together is an unclear command, so nothing may start. Put an NC contact of the other start button in each start branch' },
          { set: { Start: false, Start_Rev: false }, wait: 200 },
          { expect: { Motor: false, Motor_Rev: false }, msg: 'After releasing both buttons the motor must still be off' }
        ]
      },
      {
        name: 'Overload relay',
        init: { Stop: true, Overload: true },
        steps: [
          { pulse: { Start: true }, ms: 100 },
          { set: { Overload: false }, wait: 100 },
          { expect: { Motor: false, Lamp_Run: false }, msg: 'A tripped overload relay (Overload = FALSE) must switch the motor off' },
          { expect: { Lamp_Fault: true }, msg: 'Lamp_Fault must be on while the overload relay is tripped' },
          { set: { Start_Rev: true } },
          { never: 'Motor OR Motor_Rev', for: 300, msg: 'While the overload relay is tripped the motor must not start' },
          { set: { Start_Rev: false }, wait: 100 },
          { set: { Overload: true }, wait: 300 },
          { expect: { Lamp_Fault: false }, msg: 'Lamp_Fault must go off when the overload relay is reset' },
          { expect: { Motor: false, Motor_Rev: false }, msg: 'After the relay is reset the motor must stay off until a start button is pressed' },
          { pulse: { Start_Rev: true }, ms: 100 },
          { set: { Overload: false }, wait: 100 },
          { expect: { Motor_Rev: false }, msg: 'The overload relay must also stop the reverse direction' }
        ]
      }
    ],
    quiz: [
      { q: 'Why must K1 and K2 never be on at the same time?', options: ['The motor would run twice as fast', 'Two phases would be short-circuited', 'The PLC would fault'], answer: 1, explain: 'K2 swaps two phases, so both contactors together connect two phases directly.' },
      { q: 'The program has a software interlock. Why do cabinets still wire NC auxiliary contacts between K1 and K2?', options: ['To save PLC outputs', 'A program bug or a welded contactor must never cause a short circuit', 'PLCs cannot use NC contacts'], answer: 1, explain: 'Safety-relevant interlocks are always built in hardware too.' },
      { q: 'Stop is wired as an NC contact. Which contact do you use for it in the program?', options: ['An NO contact: the input is TRUE while Stop is not pressed', 'An NC contact', 'A rising edge contact'], answer: 0, explain: 'The NO contact passes power while the input is TRUE, that is while nobody presses Stop.' }
    ]
  });

  // ---------------------------------------------------------------- 5.2 garage door
  L.register({
    id: 'ld-apps-02-garage', chapter: 'ld-apps', order: 2,
    title: 'Garage door controller',
    goal: 'Program a garage door with limit switches, a safety light barrier, a remote control and timed lights.',
    lang: 'LD', scene: 'garage',
    tags: io('garage', ['Btn_Open', 'Btn_Close', 'Btn_Stop', 'Limit_Open', 'Limit_Closed', 'Photo_Eye', 'Remote',
      'Motor_Up', 'Motor_Down', 'Warning_Light', 'Courtesy_Light']).concat([
      mem('T_Light', 'TOF', 'Keeps the ceiling light on after the door stops')
    ]),
    starter: { pous: [{ name: 'Main', lang: 'LD', rungs: [
      { comment: 'Open: Btn_Open starts Motor_Up; stops at the upper limit or with Btn_Stop (wired NC)', text: '[ NO(Btn_Open) | NO(Motor_Up) ] NO(Btn_Stop) NC(Limit_Open) COIL(Motor_Up)' },
      ''
    ] }] },
    solution: { pous: [{ name: 'Main', lang: 'LD', rungs: [
      { comment: 'Open: button, remote, or beam interrupted while the door is not closed; interlocked with Motor_Down', text: '[ NO(Btn_Open) | NO(Remote) | NC(Photo_Eye) NC(Limit_Closed) | NO(Motor_Up) ] NO(Btn_Stop) NC(Limit_Open) NC(Motor_Down) COIL(Motor_Up)' },
      { comment: 'Close: button, or remote when fully open; only while the beam is clear; interlocked with Motor_Up', text: '[ NO(Btn_Close) | NO(Remote) NO(Limit_Open) | NO(Motor_Down) ] NO(Btn_Stop) NC(Limit_Closed) NO(Photo_Eye) NC(Motor_Up) COIL(Motor_Down)' },
      { comment: 'Warning beacon while the door moves (it flashes by itself)', text: '[ NO(Motor_Up) | NO(Motor_Down) ] COIL(Warning_Light)' },
      { comment: 'Ceiling light: on while moving, off 10 s after the door stops', text: '[ NO(Motor_Up) | NO(Motor_Down) ] TOF(T_Light, PT=T#10s) COIL(Courtesy_Light)' }
    ] }] },
    trace: ['Motor_Up', 'Motor_Down', 'Photo_Eye', 'Limit_Open', 'Limit_Closed', 'Courtesy_Light'],
    theory: `
      <p>An automatic garage door is a small but complete machine: a motor with two directions, limit switches, buttons,
      a radio remote, a safety device and lights. Everything from the previous chapters comes together here.</p>
      <h3>Limit switches</h3>
      <p>The motor must stop at the end of its travel. <code>Limit_Open</code> and <code>Limit_Closed</code> are TRUE when the door
      has reached that end. An NC contact of the limit switch in the motor rung works like an automatic stop button,
      and it also keeps the motor from starting when the door is already there.</p>
      <div class="ld-figure" data-rungs="[ NO(Btn_Open) | NO(Motor_Up) ] NO(Btn_Stop) NC(Limit_Open) COIL(Motor_Up)"></div>
      <h3>The light barrier</h3>
      <p>A closing door can crush a person, a pet or a car bonnet. A light barrier across the opening watches its path.
      It is wired <strong>fail-safe</strong>: <code>Photo_Eye</code> is TRUE while the beam is clear. A broken wire or a dirty lens
      gives FALSE, and the controller treats that like an obstacle.</p>
      <p>The rule: <strong>while the beam is interrupted the door must not close, and a closing door stops and opens again.</strong>
      Opening is the safe direction. So the light barrier appears twice: as an NO contact in the closing rung (closing only while
      the beam is clear), and as a start condition for opening (beam interrupted and the door not fully closed).</p>
      <h3>Interlock and remote</h3>
      <p>As in the reversing starter, <code>Motor_Up</code> and <code>Motor_Down</code> must never be on together, so each rung
      gets an NC contact of the other output. The remote has a single button: it opens the door, unless the door is fully open,
      in which case it closes it.</p>
      <h3>Lights</h3>
      <p>The warning beacon has a built-in flasher: it flashes as long as its output is TRUE, so it simply follows "door moving".
      The ceiling light should come on when the door moves and stay on for a while afterwards, so the driver can get out of the car
      in the light. That is the job of an <strong>off-delay timer (TOF)</strong>:</p>
      <div class="td-figure" data-signals='[{"name":"Door moving","wave":"0111100000000"},{"name":"Courtesy_Light","wave":"0111111111000"}]' data-step="2 s"></div>`,
    task: `
      <ol>
        <li>The opening rung is given: <code>Btn_Open</code> starts <code>Motor_Up</code>, which seals in and stops at
          <code>Limit_Open</code> or with <code>Btn_Stop</code>.</li>
        <li>Extend the opening rung with more start branches: <code>Remote</code>, and an interrupted beam
          (NC contact <code>Photo_Eye</code>) while the door is not fully closed (NC contact <code>Limit_Closed</code>).
          Add an NC contact <code>Motor_Down</code> as interlock.</li>
        <li>Add the closing rung: <code>Btn_Close</code>, or <code>Remote</code> while <code>Limit_Open</code> is TRUE, starts
          <code>Motor_Down</code>. It seals in and stops at <code>Limit_Closed</code>, with <code>Btn_Stop</code>, or when the beam
          is interrupted. Interlock it with an NC contact <code>Motor_Up</code>.</li>
        <li><code>Warning_Light</code> is on while the door moves.</li>
        <li><code>Courtesy_Light</code> comes on when the door moves and stays on for 10 s after it stops
          (TOF <code>T_Light</code>, <code>PT = T#10s</code>).</li>
      </ol>`,
    hints: [
      'Each start condition of the opening rung is a parallel branch: Btn_Open, Remote, NC Photo_Eye in series with NC Limit_Closed, and the seal-in Motor_Up.',
      'The closing rung needs an NO contact Photo_Eye in series. An interrupted beam (FALSE) breaks the seal-in at once, and in the next scan the opening rung takes over.',
      'For the lights, build one parallel branch Motor_Up OR Motor_Down. Feed it into a TOF box T_Light with PT = T#10s and the coil Courtesy_Light.',
      'Closing rung: [ NO(Btn_Close) | NO(Remote) NO(Limit_Open) | NO(Motor_Down) ] NO(Btn_Stop) NC(Limit_Closed) NO(Photo_Eye) NC(Motor_Up) COIL(Motor_Down).'
    ],
    tests: [
      {
        name: 'Open with the button',
        init: { Btn_Stop: true, Photo_Eye: true, Limit_Closed: true },
        steps: [
          { expect: { Motor_Up: false, Motor_Down: false }, msg: 'The door must not move by itself' },
          { pulse: { Btn_Open: true }, ms: 100 },
          { expect: { Motor_Up: true }, msg: 'Btn_Open must start Motor_Up' },
          { waitUntil: 'Warning_Light', timeout: 500, msg: 'Warning_Light must be on while the door moves' },
          { expect: { Courtesy_Light: true }, msg: 'Courtesy_Light must switch on when the door moves' },
          { set: { Limit_Closed: false }, wait: 2000 },
          { expect: { Motor_Up: true }, msg: 'The door must keep opening after the button is released' },
          { set: { Limit_Open: true }, wait: 100 },
          { expect: { Motor_Up: false }, msg: 'Limit_Open must stop the motor' },
          { never: 'Warning_Light', for: 1000, msg: 'Warning_Light must be off when the door has stopped' }
        ]
      },
      {
        name: 'Close with the button',
        init: { Btn_Stop: true, Photo_Eye: true, Limit_Open: true },
        steps: [
          { pulse: { Btn_Close: true }, ms: 100 },
          { expect: { Motor_Down: true, Motor_Up: false }, msg: 'Btn_Close must start Motor_Down' },
          { waitUntil: 'Warning_Light', timeout: 500, msg: 'Warning_Light must be on while the door moves' },
          { set: { Limit_Open: false }, wait: 2000 },
          { expect: { Motor_Down: true }, msg: 'The door must keep closing after the button is released' },
          { set: { Limit_Closed: true }, wait: 100 },
          { expect: { Motor_Down: false }, msg: 'Limit_Closed must stop the motor' },
          { pulse: { Btn_Close: true }, ms: 100 },
          { never: 'Motor_Down', for: 500, msg: 'The door is already closed: Btn_Close must not start the motor' }
        ]
      },
      {
        name: 'Stop button and interlock',
        init: { Btn_Stop: true, Photo_Eye: true, Limit_Closed: true },
        steps: [
          { pulse: { Btn_Open: true }, ms: 100 },
          { set: { Limit_Closed: false }, wait: 500 },
          { pulse: { Btn_Stop: false }, ms: 100 },
          { expect: { Motor_Up: false, Motor_Down: false }, msg: 'Btn_Stop (wired NC) must stop the door' },
          { wait: 500 },
          { expect: { Motor_Up: false }, msg: 'After Btn_Stop the door must stay stopped' },
          { pulse: { Btn_Close: true }, ms: 100 },
          { expect: { Motor_Down: true }, msg: 'From a half-open position Btn_Close must close the door' },
          { set: { Btn_Open: true } },
          { never: 'Motor_Up AND Motor_Down', for: 500, msg: 'Motor_Up and Motor_Down must never be on together. Add an NC contact of the other motor output in each rung' },
          { set: { Btn_Open: false }, wait: 100 },
          { pulse: { Btn_Stop: false }, ms: 100 },
          { set: { Btn_Open: true, Btn_Close: true } },
          { never: 'Motor_Up AND Motor_Down', for: 500, msg: 'Motor_Up and Motor_Down must never be on together, even when both buttons are pressed' },
          { set: { Btn_Open: false, Btn_Close: false }, wait: 100 }
        ]
      },
      {
        name: 'Light barrier protects the closing door',
        init: { Btn_Stop: true, Photo_Eye: true, Limit_Open: true },
        steps: [
          { pulse: { Btn_Close: true }, ms: 100 },
          { set: { Limit_Open: false }, wait: 1500 },
          { expect: { Motor_Down: true }, msg: 'Btn_Close must close the door' },
          { set: { Photo_Eye: false } },
          { expect: { Motor_Down: false }, msg: 'The beam is interrupted (Photo_Eye = FALSE): Motor_Down must switch off at once' },
          { waitUntil: 'Motor_Up', timeout: 500, msg: 'After the beam was interrupted, the door must open again' },
          { set: { Photo_Eye: true }, wait: 1000 },
          { expect: { Motor_Up: true, Motor_Down: false }, msg: 'The door must open completely, even when the beam is clear again' },
          { set: { Limit_Open: true }, wait: 100 },
          { expect: { Motor_Up: false }, msg: 'Limit_Open must stop the door' },
          { set: { Photo_Eye: false } },
          { pulse: { Btn_Close: true }, ms: 100 },
          { never: 'Motor_Down', for: 500, msg: 'While the beam is interrupted the door must not start closing' },
          { pulse: { Remote: true }, ms: 100 },
          { never: 'Motor_Down', for: 500, msg: 'While the beam is interrupted the remote must not close the door either' }
        ]
      },
      {
        name: 'Remote control',
        init: { Btn_Stop: true, Photo_Eye: true, Limit_Closed: true },
        steps: [
          { pulse: { Remote: true }, ms: 100 },
          { expect: { Motor_Up: true }, msg: 'The remote must open a closed door' },
          { set: { Limit_Closed: false }, wait: 1500 },
          { set: { Limit_Open: true }, wait: 100 },
          { expect: { Motor_Up: false }, msg: 'Limit_Open must stop the door' },
          { pulse: { Remote: true }, ms: 100 },
          { expect: { Motor_Down: true, Motor_Up: false }, msg: 'When the door is fully open (Limit_Open), the remote must close it' },
          { set: { Limit_Open: false }, wait: 1500 },
          { set: { Limit_Closed: true }, wait: 100 },
          { expect: { Motor_Down: false }, msg: 'Limit_Closed must stop the door' }
        ]
      },
      {
        name: 'Ceiling light stays on for 10 s',
        init: { Btn_Stop: true, Photo_Eye: true, Limit_Closed: true },
        steps: [
          { pulse: { Btn_Open: true }, ms: 100 },
          { set: { Limit_Closed: false }, wait: 1000 },
          { set: { Limit_Open: true }, wait: 100 },
          { expect: { Motor_Up: false }, msg: 'Limit_Open must stop the door' },
          { always: 'Courtesy_Light', for: 9000, msg: 'Courtesy_Light must stay on for 10 s after the door has stopped (TOF, PT = T#10s)' },
          { waitUntil: 'NOT Courtesy_Light', timeout: 2000, msg: 'About 10 s after the door stopped, Courtesy_Light must go off' }
        ]
      }
    ],
    quiz: [
      { q: 'Why is the light barrier wired so that Photo_Eye is TRUE while the beam is clear?', options: ['It uses less energy', 'A broken wire then looks like an obstacle, so the door stays safe', 'Light barriers cannot be wired any other way'], answer: 1, explain: 'Fail-safe wiring turns a fault into the safe reaction.' },
      { q: 'The beam is interrupted while the door closes. What should happen?', options: ['The door keeps closing slowly', 'The door stops and opens again', 'Only the warning light switches off'], answer: 1, explain: 'Opening is the safe direction, so the door reverses.' },
      { q: 'Which timer keeps the ceiling light on after the door has stopped?', options: ['TON', 'TOF', 'TP'], answer: 1, explain: 'The off-delay timer holds its output TRUE for PT after its input goes FALSE.' }
    ]
  });

  // ---------------------------------------------------------------- 5.3 pneumatic sequence
  const HOME = { Stop: true, A_Retracted: true, B_Retracted: true, Part_Present: true };

  L.register({
    id: 'ld-apps-03-sequence', chapter: 'ld-apps', order: 3,
    title: 'Pneumatic sequence A+ B+ B- A-',
    goal: 'Program a pneumatic sequence with step bits that advance on end-position sensors.',
    lang: 'LD', scene: 'cylinders',
    tags: io('cylinders', ['Start', 'Stop', 'A_Retracted', 'A_Extended', 'B_Retracted', 'B_Extended', 'Part_Present',
      'A_Extend', 'B_Extend', 'Lamp_Cycle']).concat([
      mem('Step1', 'BOOL', 'Step 1: A+ (clamp)'),
      mem('Step2', 'BOOL', 'Step 2: B+ (press)'),
      mem('Step3', 'BOOL', 'Step 3: B- (lift the press)'),
      mem('Step4', 'BOOL', 'Step 4: A- (unclamp)')
    ]),
    starter: { pous: [{ name: 'Main', lang: 'LD', rungs: [
      { comment: 'Start: only in the home position, with a part, and when no cycle is running', text: 'P(Start) NO(Stop) NO(Part_Present) NO(A_Retracted) NO(B_Retracted) NC(Lamp_Cycle) SET(Step1)' },
      '',
      { comment: 'Cycle lamp: on while any step is active', text: '[ NO(Step1) | NO(Step2) | NO(Step3) | NO(Step4) ] COIL(Lamp_Cycle)' }
    ] }] },
    solution: { pous: [{ name: 'Main', lang: 'LD', rungs: [
      { comment: 'Start: only in the home position, with a part, and when no cycle is running', text: 'P(Start) NO(Stop) NO(Part_Present) NO(A_Retracted) NO(B_Retracted) NC(Lamp_Cycle) SET(Step1)' },
      { comment: 'Step 1 -> 2: A is extended, the part is clamped', text: 'NO(Step1) NO(A_Extended) [ SET(Step2) | RESET(Step1) ]' },
      { comment: 'Step 2 -> 3: B is extended, the part is pressed', text: 'NO(Step2) NO(B_Extended) [ SET(Step3) | RESET(Step2) ]' },
      { comment: 'Step 3 -> 4: B is back', text: 'NO(Step3) NO(B_Retracted) [ SET(Step4) | RESET(Step3) ]' },
      { comment: 'Step 4 -> end: A is back, the cycle is complete', text: 'NO(Step4) NO(A_Retracted) RESET(Step4)' },
      { comment: 'Stop (wired NC) aborts the cycle: all valves off, the springs retract both cylinders', text: 'NC(Stop) [ RESET(Step1) | RESET(Step2) | RESET(Step3) | RESET(Step4) ]' },
      { comment: 'Clamp A stays out in steps 1 to 3 (monostable valve)', text: '[ NO(Step1) | NO(Step2) | NO(Step3) ] COIL(A_Extend)' },
      { comment: 'Press B is out in step 2', text: 'NO(Step2) COIL(B_Extend)' },
      { comment: 'Cycle lamp: on while any step is active', text: '[ NO(Step1) | NO(Step2) | NO(Step3) | NO(Step4) ] COIL(Lamp_Cycle)' }
    ] }] },
    trace: ['Step1', 'Step2', 'Step3', 'Step4', 'A_Extend', 'B_Extend'],
    theory: `
      <p>Pneumatic cylinders clamp, press, lift and push parts in countless machines. In our fixture cylinder <strong>A</strong>
      clamps the part and cylinder <strong>B</strong> presses it. Two reed switches on each cylinder report its end positions:
      <code>A_Retracted</code> (a0), <code>A_Extended</code> (a1), <code>B_Retracted</code> (b0) and <code>B_Extended</code> (b1).</p>
      <p>The valves are <strong>monostable</strong> (spring return): a cylinder stays extended only while its solenoid output is TRUE.
      Switch the output off and the spring pushes the valve back, so the cylinder retracts.</p>
      <h3>Sequence notation</h3>
      <p>Engineers write motion sequences in short form. <code>A+ B+ B- A-</code> means: extend A (clamp), extend B (press),
      retract B, retract A (release). Each movement may only start when the previous one has <em>really</em> finished, and the
      reed switches confirm that. A timer would only guess: if the air pressure drops, the cylinder is slower, and a timed program
      would press a part that is not clamped yet.</p>
      <h3>Step bits</h3>
      <p>A clean way to program a sequence is one memory bit per step, and exactly one step bit is TRUE at a time.
      Each transition is one rung: <em>current step AND the sensor that ends it</em> sets the next step and resets the current one.</p>
      <div class="ld-figure" data-rungs="NO(Step5) NO(Door_Closed) [ SET(Step6) | RESET(Step5) ]"></div>
      <ol>
        <li>Step 1, A+: A_Extend. Ends at A_Extended.</li>
        <li>Step 2, B+: A_Extend and B_Extend. Ends at B_Extended.</li>
        <li>Step 3, B-: A_Extend. Ends at B_Retracted.</li>
        <li>Step 4, A-: no output. Ends at A_Retracted: the cycle is complete.</li>
      </ol>
      <div class="td-figure" data-signals='[{"name":"Step1","wave":"0110000000"},{"name":"Step2","wave":"0001100000"},{"name":"Step3","wave":"0000011000"},{"name":"Step4","wave":"0000000110"},{"name":"A_Extend","wave":"0111111000"},{"name":"B_Extend","wave":"0001100000"}]' data-step="0.5 s"></div>
      <p>The outputs are written in separate rungs from the step bits, one coil per output. Because the valves are monostable,
      A_Extend must be TRUE in every step in which A should stay out, not only in the step where it starts moving.</p>
      <h3>Starting and stopping</h3>
      <p>A cycle may only start from the home position (both cylinders retracted), with a part in the fixture, and when no cycle
      is running. Stop resets all step bits: both valves switch off and the springs retract the cylinders.</p>`,
    task: `
      <ol>
        <li>The start rung and the <code>Lamp_Cycle</code> rung are given. Study the start conditions.</li>
        <li>Add the transitions: <code>Step1</code> to <code>Step2</code> at <code>A_Extended</code>, <code>Step2</code> to
          <code>Step3</code> at <code>B_Extended</code>, <code>Step3</code> to <code>Step4</code> at <code>B_Retracted</code>,
          and <code>Step4</code> ends (RESET) at <code>A_Retracted</code>.</li>
        <li><code>Stop</code> (wired NC) resets all four step bits.</li>
        <li>Outputs: <code>A_Extend</code> in steps 1, 2 and 3; <code>B_Extend</code> in step 2.</li>
      </ol>`,
    hints: [
      'A transition rung ends in two parallel coils: SET the next step and RESET the current one.',
      'Always put the current step bit in front of the sensor. A_Extended alone is TRUE in steps 1, 2 and 3, so it would jump back into step 2 again and again.',
      'Stop: an NC contact Stop followed by four parallel RESET coils, one for each step bit.',
      'Outputs: [ NO(Step1) | NO(Step2) | NO(Step3) ] COIL(A_Extend) and NO(Step2) COIL(B_Extend).'
    ],
    tests: [
      {
        name: 'Full cycle A+ B+ B- A-',
        init: HOME,
        steps: [
          { expect: { A_Extend: false, B_Extend: false, Lamp_Cycle: false }, msg: 'Nothing may move before Start' },
          { pulse: { Start: true }, ms: 100 },
          { expect: { A_Extend: true, B_Extend: false }, msg: 'Step 1 (A+): Start must extend clamp cylinder A only' },
          { expect: { Lamp_Cycle: true }, msg: 'Lamp_Cycle must be on while the cycle runs' },
          { set: { A_Retracted: false }, wait: 300 },
          { expect: { B_Extend: false }, msg: 'B must wait until A is fully extended (A_Extended), or it presses a part that is not clamped' },
          { set: { A_Extended: true }, wait: 100 },
          { expect: { A_Extend: true, B_Extend: true }, msg: 'Step 2 (B+): at A_Extended, B must extend and A must stay extended' },
          { set: { B_Retracted: false }, wait: 300 },
          { expect: { A_Extend: true, B_Extend: true }, msg: 'While B moves out both valves must stay on (monostable valves need a steady signal)' },
          { set: { B_Extended: true }, wait: 100 },
          { expect: { B_Extend: false }, msg: 'Step 3 (B-): at B_Extended, B must retract' },
          { expect: { A_Extend: true }, msg: 'Step 3 (B-): A must keep the part clamped while B retracts' },
          { set: { B_Extended: false }, wait: 300 },
          { expect: { A_Extend: true }, msg: 'A must wait until B is fully back (B_Retracted) before it releases the part' },
          { set: { B_Retracted: true }, wait: 100 },
          { expect: { A_Extend: false, B_Extend: false }, msg: 'Step 4 (A-): at B_Retracted, A must retract' },
          { set: { A_Extended: false }, wait: 300 },
          { set: { A_Retracted: true }, wait: 100 },
          { expect: { Lamp_Cycle: false }, msg: 'When A is back (A_Retracted) the cycle is complete and Lamp_Cycle must go off' },
          { always: 'NOT A_Extend AND NOT B_Extend', for: 1000, msg: 'After one cycle the machine must wait for the next Start' }
        ]
      },
      {
        name: 'Start conditions',
        init: HOME,
        steps: [
          { set: { Part_Present: false } },
          { pulse: { Start: true }, ms: 100 },
          { never: 'A_Extend OR B_Extend', for: 500, msg: 'Without a part in the fixture Start must do nothing' },
          { set: { Part_Present: true, B_Retracted: false } },
          { pulse: { Start: true }, ms: 100 },
          { never: 'A_Extend OR B_Extend', for: 500, msg: 'A cycle may only start from the home position (A_Retracted and B_Retracted)' }
        ]
      },
      {
        name: 'Stop aborts the cycle',
        init: HOME,
        steps: [
          { pulse: { Start: true }, ms: 100 },
          { set: { A_Retracted: false }, wait: 200 },
          { set: { A_Extended: true }, wait: 100 },
          { expect: { B_Extend: true }, msg: 'At A_Extended, B must extend' },
          { set: { B_Retracted: false }, wait: 200 },
          { pulse: { Stop: false }, ms: 100 },
          { expect: { A_Extend: false, B_Extend: false, Lamp_Cycle: false }, msg: 'Stop (wired NC) must reset all steps: both valves off, Lamp_Cycle off' },
          { set: { B_Retracted: true, A_Extended: false }, wait: 300 },
          { set: { A_Retracted: true } },
          { always: 'NOT A_Extend AND NOT B_Extend', for: 500, msg: 'After Stop the machine must stay at rest until Start is pressed' },
          { pulse: { Start: true }, ms: 100 },
          { expect: { A_Extend: true, B_Extend: false }, msg: 'A new Start must begin again with step 1 (A+)' }
        ]
      }
    ],
    quiz: [
      { q: 'Valve A is monostable. What happens when A_Extend switches off?', options: ['A stays where it is', 'The spring returns the valve and A retracts', 'A extends further'], answer: 1, explain: 'A monostable valve needs a steady signal to stay switched.' },
      { q: 'Why do the reed switches, not timers, advance the steps?', options: ['They confirm the movement has really finished, even if a cylinder is slow', 'Timers are not allowed in sequences', 'Reed switches are cheaper than timers'], answer: 0, explain: 'A timer only guesses; a sensor knows.' },
      { q: 'In which steps of A+ B+ B- A- must A_Extend be TRUE?', options: ['Only step 1', 'Steps 1, 2 and 3', 'All four steps'], answer: 1, explain: 'A must hold the part until B is back; it retracts in step 4.' }
    ]
  });

  // ---------------------------------------------------------------- 5.4 sorting conveyor
  const tallBox = () => [
    { set: { Sensor_Tall: true } },
    { never: 'Pusher', for: 150, msg: 'Do not extend the pusher the moment the beam is broken: the box is not in front of the pusher yet and the head would hit its edge. Wait until it has passed the sensor' },
    { wait: 280 },
    { set: { Sensor_Tall: false } },
    { waitUntil: 'Pusher', timeout: 300, msg: 'When the tall box has passed Sensor_Tall (falling edge), the pusher must extend' },
    { wait: 100 },
    { set: { Pusher_Home: false }, wait: 200 },
    { expect: { Pusher: true }, msg: 'The pusher must stay extended until it reaches Pusher_Out (latch it with SET)' },
    { set: { Pusher_Out: true }, wait: 100 },
    { expect: { Pusher: false }, msg: 'At Pusher_Out the pusher must retract (RESET)' },
    { set: { Pusher_Out: false }, wait: 300 },
    { set: { Pusher_Home: true }, wait: 300 }
  ];

  L.register({
    id: 'ld-apps-04-sorting', chapter: 'ld-apps', order: 4,
    title: 'Sorting conveyor',
    goal: 'Sort parts on a conveyor with a latched pusher, edge timing and a counter.',
    lang: 'LD', scene: 'conveyor',
    tags: io('conveyor', ['Start', 'Stop', 'Sensor_Tall', 'Pusher_Home', 'Pusher_Out', 'Conveyor', 'Pusher', 'Lamp_Run', 'Count_Display']).concat([
      mem('C1', 'CTU', 'Counter for sorted boxes')
    ]),
    starter: { pous: [{ name: 'Main', lang: 'LD', rungs: [
      { comment: 'Belt: Start/Stop seal-in (Stop is wired NC)', text: '[ NO(Start) | NO(Conveyor) ] NO(Stop) COIL(Conveyor)' },
      { comment: 'Running lamp', text: 'NO(Conveyor) COIL(Lamp_Run)' },
      ''
    ] }] },
    solution: { pous: [{ name: 'Main', lang: 'LD', rungs: [
      { comment: 'Belt: Start/Stop seal-in (Stop is wired NC)', text: '[ NO(Start) | NO(Conveyor) ] NO(Stop) COIL(Conveyor)' },
      { comment: 'Running lamp', text: 'NO(Conveyor) COIL(Lamp_Run)' },
      { comment: 'A tall box has just passed the height sensor and stands in front of the pusher: push', text: 'N(Sensor_Tall) SET(Pusher)' },
      { comment: 'Stroke complete: retract', text: 'NO(Pusher_Out) RESET(Pusher)' },
      { comment: 'Count the sorted boxes, one per completed stroke', text: 'NO(Pusher_Out) CTU(C1, PV=9999, CV=Count_Display)' }
    ] }] },
    trace: ['Sensor_Tall', 'Pusher', 'Pusher_Out', 'Count_Display'],
    theory: `
      <p>Sorting is one of the most common jobs on a conveyor: parts that are too big, the wrong colour or faulty are pushed off
      the belt into a separate bin. Our belt carries low and tall boxes. A height sensor detects tall boxes, and a pneumatic pusher
      shoves them into the TALL bin. Low boxes run on to the end of the belt.</p>
      <h3>Timing the push</h3>
      <p>The height sensor sits a little before the pusher. If you extend the pusher the moment the beam is broken, the box is
      not in front of the pusher yet, and the head hits its front edge. Wait until the box has <em>passed</em> the sensor:
      at the <strong>falling edge</strong> of <code>Sensor_Tall</code> the box stands right in front of the pusher.
      An <code>N</code> contact gives you exactly that moment. (A short on-delay timer would work too, but it depends on the belt speed.)</p>
      <h3>Holding the pusher out</h3>
      <p><code>Pusher</code> TRUE extends the cylinder, FALSE lets the spring pull it back. The falling edge lasts only one scan,
      so the pusher must be <strong>latched</strong>: SET it at the edge, and RESET it when the end position switch
      <code>Pusher_Out</code> reports that the stroke is complete. This is the same pattern as any station that must finish a
      movement it has started:</p>
      <div class="ld-figure" data-rungs="N(Part_Passed) SET(Ejector)||NO(Ejector_End) RESET(Ejector)"></div>
      <div class="td-figure" data-signals='[{"name":"Sensor_Tall","wave":"0011100000000"},{"name":"Pusher","wave":"0000011110000"},{"name":"Pusher_Out","wave":"0000000001100"}]' data-step="0.1 s"></div>
      <h3>Counting</h3>
      <p>The plant manager wants to know how many tall boxes were sorted out. Count each completed stroke with a CTU on
      <code>Pusher_Out</code>. Since the counter only reacts to rising edges, it counts once per push, however long the switch
      stays TRUE. Bind CV to <code>Count_Display</code>. The output Q is not needed here, so give PV a large value such as 9999.</p>`,
    task: `
      <ol>
        <li>The belt rung (Start/Stop seal-in) and <code>Lamp_Run</code> are given. In the scene, use the buttons to drop small and tall boxes.</li>
        <li>When a tall box has passed <code>Sensor_Tall</code> (falling edge, N contact), SET <code>Pusher</code>.</li>
        <li>When the pusher reaches <code>Pusher_Out</code>, RESET <code>Pusher</code>.</li>
        <li>Count the sorted boxes with a CTU <code>C1</code> on <code>Pusher_Out</code>, <code>PV = 9999</code>,
          <code>CV = Count_Display</code>.</li>
      </ol>`,
    hints: [
      'A coil Pusher that follows Sensor_Tall would pull the pusher back as soon as the box leaves the sensor. Use SET and RESET coils.',
      'The N contact (falling edge) passes power for one scan when Sensor_Tall changes from TRUE to FALSE.',
      'Rungs: N(Sensor_Tall) SET(Pusher); NO(Pusher_Out) RESET(Pusher); NO(Pusher_Out) CTU(C1, PV=9999, CV=Count_Display).'
    ],
    tests: [
      {
        name: 'Belt start and stop',
        init: { Stop: true, Pusher_Home: true },
        steps: [
          { pulse: { Start: true }, ms: 100 },
          { expect: { Conveyor: true, Lamp_Run: true }, msg: 'Start must run the belt and light Lamp_Run' },
          { always: 'NOT Pusher', for: 1000, msg: 'Without a tall box the pusher must stay home' },
          { pulse: { Stop: false }, ms: 100 },
          { expect: { Conveyor: false, Lamp_Run: false }, msg: 'Stop must stop the belt' }
        ]
      },
      {
        name: 'A tall box is pushed off',
        init: { Stop: true, Pusher_Home: true },
        steps: [
          { pulse: { Start: true }, ms: 100 },
          ...tallBox(),
          { expect: 'Count_Display = 1', msg: 'Count_Display must count the sorted box (CTU on Pusher_Out with CV = Count_Display)' },
          { expect: { Conveyor: true }, msg: 'The belt keeps running while boxes are sorted' }
        ]
      },
      {
        name: 'Counting several boxes',
        init: { Stop: true, Pusher_Home: true },
        steps: [
          { pulse: { Start: true }, ms: 100 },
          ...times(3, () => tallBox().concat([{ wait: 500 }])),
          { expect: 'Count_Display = 3', msg: 'After 3 tall boxes Count_Display must show 3' }
        ]
      }
    ],
    quiz: [
      { q: 'Why does the pusher wait for the falling edge of Sensor_Tall?', options: ['The sensor only reports falling edges', 'At that moment the tall box has passed the sensor and stands in front of the pusher', 'So that low boxes are pushed too'], answer: 1, explain: 'The sensor sits before the pusher; the falling edge marks the right position.' },
      { q: 'Why is Pusher latched with SET instead of a normal coil?', options: ['The edge lasts one scan, and the stroke must be finished anyway', 'SET coils switch faster', 'Coils cannot drive valves'], answer: 0, explain: 'The latch keeps the pusher out until Pusher_Out confirms the stroke.' },
      { q: 'Pusher_Out stays TRUE for 300 ms (30 scans). How much does the CTU count per stroke?', options: ['1', '30', '2'], answer: 0, explain: 'A counter only counts rising edges.' }
    ]
  });
})(window.PLC = window.PLC || {});
