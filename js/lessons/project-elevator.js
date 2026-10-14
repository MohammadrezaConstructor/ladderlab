/* LadderLab — capstone project: three-floor elevator (project-04). Format: see lessons.js. */
(function (PLC) {
  'use strict';
  const L = PLC.lessons;

  // ---- helpers (same conventions as ch6-7-st.js) ----------------------------------
  /** Remove the common indentation of a template literal so ST sources read well in the editor. */
  function code(s) {
    const lines = String(s).replace(/^\s*\n/, '').replace(/\s+$/, '').split('\n');
    const ind = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
    return lines.map(l => l.slice(ind)).join('\n') + '\n';
  }
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const stFig = s => '<pre class="st-figure">' + esc(code(s).replace(/\n$/, '')) + '</pre>';
  const main = source => ({ name: 'Main', lang: 'ST', source: code(source) });

  // ---- scene I/O (as wired in scenes/elevator.js) -----------------------------------
  const ELEVATOR = {
    Call_0: ['BOOL', '%IX0.0', 'Call button, ground floor (NO)'],
    Call_1: ['BOOL', '%IX0.1', 'Call button, floor 1 (NO)'],
    Call_2: ['BOOL', '%IX0.2', 'Call button, floor 2 (NO)'],
    At_0: ['BOOL', '%IX0.3', 'Floor sensor: cabin level with the ground floor'],
    At_1: ['BOOL', '%IX0.4', 'Floor sensor: cabin level with floor 1'],
    At_2: ['BOOL', '%IX0.5', 'Floor sensor: cabin level with floor 2'],
    Door_Is_Open: ['BOOL', '%IX0.6', 'Door limit switch: fully open'],
    Door_Is_Closed: ['BOOL', '%IX0.7', 'Door limit switch: fully closed'],
    Door_Clear: ['BOOL', '%IX1.0', 'Door light curtain (TRUE while the doorway is clear)'],
    E_Stop: ['BOOL', '%IX1.1', 'Emergency stop (NC: TRUE when not pressed)'],
    Motor_Up: ['BOOL', '%QX0.0', 'Hoist motor: up'],
    Motor_Down: ['BOOL', '%QX0.1', 'Hoist motor: down'],
    Door_Open: ['BOOL', '%QX0.2', 'Door motor: open'],
    Door_Close: ['BOOL', '%QX0.3', 'Door motor: close'],
    Lamp_Call_0: ['BOOL', '%QX0.4', 'Call acknowledged lamp, ground floor'],
    Lamp_Call_1: ['BOOL', '%QX0.5', 'Call acknowledged lamp, floor 1'],
    Lamp_Call_2: ['BOOL', '%QX0.6', 'Call acknowledged lamp, floor 2'],
    Floor_Display: ['INT', '%QW0', 'Floor indicator (0, 1, 2)']
  };
  const tags = Object.keys(ELEVATOR).map(n => ({ name: n, type: ELEVATOR[n][0], address: ELEVATOR[n][1], comment: ELEVATOR[n][2] }));

  // ---- test building blocks: the checker plays the elevator itself ---------------------
  const E_INIT = { E_Stop: true, Door_Is_Closed: true, At_0: true, Door_Clear: true };
  const ALL_OFF = 'NOT (Motor_Up OR Motor_Down OR Door_Open OR Door_Close OR Lamp_Call_0 OR Lamp_Call_1 OR Lamp_Call_2)';
  /** The door opens: limit switches follow the door motor. */
  const doorOpens = [
    { waitUntil: { Door_Open: true }, timeout: 500, msg: 'The cabin stands at the called floor: Door_Open must switch on' },
    { set: { Door_Is_Closed: false }, wait: 300 },
    { expect: { Door_Open: true, Motor_Up: false, Motor_Down: false }, msg: 'Keep Door_Open on until Door_Is_Open reports the door fully open (and never drive meanwhile)' },
    { set: { Door_Is_Open: true }, wait: 50 },
    { expect: { Door_Open: false }, msg: 'Door_Is_Open is TRUE: switch the door motor off' }
  ];
  /** The door stays open about 3 s, then closes. */
  const doorCloses = [
    { always: { Door_Close: false, Motor_Up: false, Motor_Down: false }, for: 2500, msg: 'The door must stay open for about 3 s' },
    { waitUntil: { Door_Close: true }, timeout: 1500, msg: 'About 3 s after the door is fully open, Door_Close must switch on' },
    { set: { Door_Is_Open: false }, wait: 300 },
    { expect: { Door_Close: true, Door_Open: false }, msg: 'Keep Door_Close on until Door_Is_Closed reports the door closed' },
    { set: { Door_Is_Closed: true }, wait: 50 },
    { expect: { Door_Close: false }, msg: 'Door_Is_Closed is TRUE: switch the door motor off' }
  ];

  L.register({
    id: 'project-04-elevator', chapter: 'projects', order: 4,
    title: 'Elevator controller',
    goal: 'Design a complete state machine with interlocks: a three-floor elevator that registers calls, travels, stops at the floor and runs its door safely.',
    lang: 'ST', scene: 'elevator',
    tags,
    starter: { pous: [main(`
      (* Capstone project: three-floor elevator
         Draw the state diagram first: which states does the elevator have,
         and which signal moves it from one state to the next? *)
      VAR CONSTANT
          IDLE         : INT := 0;   (* door closed, waiting for a call *)
          MOVING_UP    : INT := 1;
          MOVING_DOWN  : INT := 2;
          DOOR_OPENING : INT := 3;
          DOOR_WAIT    : INT := 4;   (* door open: wait 3 s *)
          DOOR_CLOSING : INT := 5;
          STOPPED      : INT := 6;   (* emergency stop *)
      END_VAR
      VAR
          State : INT := 0;          (* IDLE *)
          Floor : INT;               (* current floor, from the floor sensors *)
          (* TODO: a BOOL per registered call, a TON for the door, ... *)
      END_VAR

      (* TODO 1: Floor from At_0, At_1, At_2 *)

      (* TODO 2: register calls (Call_x) and keep them until they are served *)

      (* TODO 3: emergency stop. E_Stop is NC: FALSE while pressed *)

      CASE State OF
          IDLE:
              (* TODO: open the door for a call at this floor, or choose a direction *)
              State := IDLE;

          (* TODO: the other states and their transitions *)
      END_CASE;

      (* TODO 4: outputs. Interlock: the hoist may only run while Door_Is_Closed is TRUE *)
      Motor_Up := FALSE;
      Motor_Down := FALSE;
      Door_Open := FALSE;
      Door_Close := FALSE;
      Floor_Display := Floor;
    `)] },
    solution: { pous: [main(`
      (* Three-floor elevator controller *)
      VAR CONSTANT
          IDLE         : INT := 0;   (* door closed, waiting for a call *)
          MOVING_UP    : INT := 1;
          MOVING_DOWN  : INT := 2;
          DOOR_OPENING : INT := 3;
          DOOR_WAIT    : INT := 4;   (* door open: passengers get in and out *)
          DOOR_CLOSING : INT := 5;
          STOPPED      : INT := 6;   (* emergency stop, also the start state *)
      END_VAR
      VAR
          State      : INT := 6;        (* STOPPED: start like after an emergency stop *)
          Floor      : INT;             (* last floor sensor seen = current floor *)
          AtFloor    : BOOL;            (* cabin level with a floor *)
          GoingUp    : BOOL;            (* direction of the last trip *)
          Req_0      : BOOL;            (* registered calls *)
          Req_1      : BOOL;
          Req_2      : BOOL;
          ReqHere    : BOOL;            (* a call at the current floor *)
          ReqAbove   : BOOL;            (* a call above the current floor *)
          ReqBelow   : BOOL;            (* a call below the current floor *)
          DwellTimer : TON;             (* how long the door stays open *)
      END_VAR

      (* 1. Where is the cabin? *)
      AtFloor := At_0 OR At_1 OR At_2;
      IF At_0 THEN Floor := 0; END_IF;
      IF At_1 THEN Floor := 1; END_IF;
      IF At_2 THEN Floor := 2; END_IF;

      (* 2. Calls are registered until they are served. The E-stop (NC) cancels them all. *)
      IF E_Stop THEN
          IF Call_0 THEN Req_0 := TRUE; END_IF;
          IF Call_1 THEN Req_1 := TRUE; END_IF;
          IF Call_2 THEN Req_2 := TRUE; END_IF;
      ELSE
          State := STOPPED;
          Req_0 := FALSE;
          Req_1 := FALSE;
          Req_2 := FALSE;
      END_IF;

      (* 3. The calls seen from the current floor *)
      ReqHere  := (Floor = 0 AND Req_0) OR (Floor = 1 AND Req_1) OR (Floor = 2 AND Req_2);
      ReqAbove := (Floor < 1 AND Req_1) OR (Floor < 2 AND Req_2);
      ReqBelow := (Floor > 0 AND Req_0) OR (Floor > 1 AND Req_1);

      (* 4. The dwell time runs while the door is open and the doorway is clear *)
      DwellTimer(IN := State = DOOR_WAIT AND Door_Clear, PT := T#3s);

      (* 5. State machine *)
      CASE State OF
          IDLE:
              IF ReqHere AND AtFloor THEN
                  State := DOOR_OPENING;
              ELSIF ReqAbove AND (GoingUp OR NOT ReqBelow) THEN   (* keep the direction while there are calls ahead *)
                  State := MOVING_UP;
              ELSIF ReqBelow THEN
                  State := MOVING_DOWN;
              END_IF;

          MOVING_UP:
              GoingUp := TRUE;
              IF AtFloor AND (ReqHere OR NOT ReqAbove) THEN       (* called here, or nothing further up *)
                  State := DOOR_OPENING;
              END_IF;

          MOVING_DOWN:
              GoingUp := FALSE;
              IF AtFloor AND (ReqHere OR NOT ReqBelow) THEN
                  State := DOOR_OPENING;
              END_IF;

          DOOR_OPENING:
              IF Door_Is_Open THEN
                  State := DOOR_WAIT;
              END_IF;

          DOOR_WAIT:
              IF DwellTimer.Q THEN
                  State := DOOR_CLOSING;
              END_IF;

          DOOR_CLOSING:
              IF NOT Door_Clear OR ReqHere THEN                   (* someone in the doorway, or a new call here *)
                  State := DOOR_OPENING;
              ELSIF Door_Is_Closed THEN
                  State := IDLE;
              END_IF;

          STOPPED:
              IF E_Stop THEN                                      (* released: resume safely *)
                  IF NOT AtFloor THEN                             (* between floors: go on to the next floor *)
                      IF GoingUp THEN
                          State := MOVING_UP;
                      ELSE
                          State := MOVING_DOWN;
                      END_IF;
                  ELSIF Door_Is_Closed THEN
                      State := IDLE;
                  ELSE
                      State := DOOR_OPENING;                      (* door half open: open it fully *)
                  END_IF;
              END_IF;
      ELSE
          State := STOPPED;                                       (* invalid state: stop safely *)
      END_CASE;

      (* 6. A call at the floor where the door opens is served *)
      IF State = DOOR_OPENING OR State = DOOR_WAIT THEN
          IF Floor = 0 THEN Req_0 := FALSE; END_IF;
          IF Floor = 1 THEN Req_1 := FALSE; END_IF;
          IF Floor = 2 THEN Req_2 := FALSE; END_IF;
      END_IF;

      (* 7. Outputs. The interlocks hold whatever the state machine does. *)
      Motor_Up      := State = MOVING_UP AND Door_Is_Closed;      (* never drive with an open door *)
      Motor_Down    := State = MOVING_DOWN AND Door_Is_Closed;
      Door_Open     := State = DOOR_OPENING AND AtFloor;          (* only open at a floor *)
      Door_Close    := State = DOOR_CLOSING AND Door_Clear;
      Lamp_Call_0   := Req_0;
      Lamp_Call_1   := Req_1;
      Lamp_Call_2   := Req_2;
      Floor_Display := Floor;
    `)] },
    trace: ['Call_2', 'At_0', 'At_1', 'At_2', 'Motor_Up', 'Motor_Down', 'Door_Open', 'Door_Close', 'Door_Is_Closed', 'Door_Clear', 'Floor_Display'],
    theory: `
      <p>This is the capstone project: an elevator for a building with three floors. It combines everything from the course:
      edge-free call memory, timers, a <code>CASE</code> state machine and, above all, <strong>safety</strong>.
      The elevator scene behaves like the real machine: it reports a fault when your program drives with the door open,
      opens the door between floors, closes it onto a passenger or runs past the last floor into the buffers.</p>
      <h3>States and transitions</h3>
      <p>At any moment the elevator does exactly one thing: it waits, travels up, travels down, opens the door, holds it open, or closes it.
      Those are its <strong>states</strong>. A <strong>transition</strong> is the event that ends a state:
      a floor sensor turns TRUE, a limit switch reports the door position, a timer runs out, a call arrives.
      Draw the diagram on paper before you code it: one circle per state, one arrow per transition, the condition written on the arrow.
      If you cannot draw an arrow, the program will not know what to do either.</p>
      ${stFig(`
        CASE State OF
            IDLE:
                IF ReqAbove THEN State := MOVING_UP; END_IF;
                (* ... *)
            MOVING_UP:
                IF AtFloor AND ReqHere THEN State := DOOR_OPENING; END_IF;
            DOOR_OPENING:
                IF Door_Is_Open THEN State := DOOR_WAIT; END_IF;
            (* DOOR_WAIT, DOOR_CLOSING, MOVING_DOWN, STOPPED ... *)
        END_CASE;
      `)}
      <p>Named constants such as <code>MOVING_UP</code> (in a <code>VAR CONSTANT</code> block) make the CASE read like the diagram.
      ST names are not case-sensitive, so a state called <code>DOOR_OPEN</code> would clash with the output <code>Door_Open</code>: pick distinct names.</p>
      <h3>Interlocks: never move with an open door</h3>
      <p>The most important rule of every lift: the cabin must never move unless the door is closed, and the door must never open unless the cabin is level with a floor.
      Do not trust the state machine alone to guarantee that. A forgotten transition or a door switch that drops during the trip would be deadly.
      Write the rule a second time, directly on the outputs, so it holds whatever state the program is in:
      <code>Motor_Up := State = MOVING_UP AND Door_Is_Closed;</code>.
      The same goes for the door: open it only while a floor sensor is TRUE. The emergency stop comes first of all: while <code>E_Stop</code> is FALSE (it is wired NC), every output is off.
      In a real elevator a hard-wired safety circuit does this too, but the program must never even try.</p>
      <h3>Handling requests</h3>
      <p>A call button is only pressed for a moment, so each call needs its own memory bit that is set by the button and cleared when the door opens at that floor.
      The lamp simply shows that bit. To choose a direction, compare the calls with the current floor: is there a call here, above or below?
      Keep travelling in the same direction while there are calls ahead, and only then turn around.
      That is how real elevators avoid leaving someone waiting forever.</p>
      <h3>Test like the checker</h3>
      <p>The checker has no elevator. It presses the call buttons and operates the floor sensors, the door limit switches and the light curtain itself.
      Then run your program on the scene and try to break it: call two floors at once, step into the doorway while the door closes, press the emergency stop between floors.</p>`,
    task: `
      <ol>
        <li><strong>Calls:</strong> a press on <code>Call_0</code>, <code>Call_1</code> or <code>Call_2</code> registers a call and lights its lamp (<code>Lamp_Call_x</code>).
        The lamp stays on until the call is served, that is, until the door opens at that floor.</li>
        <li><strong>Travel:</strong> with the door closed and a call at another floor, drive towards it with <code>Motor_Up</code> or <code>Motor_Down</code>.
        Pass floors nobody called without stopping. Stop as soon as the floor sensor (<code>At_x</code>) of the called floor turns TRUE.
        While there are calls in both directions, keep the current direction first.</li>
        <li><strong>Door:</strong> at the called floor, run <code>Door_Open</code> until <code>Door_Is_Open</code>, wait 3 s, then run <code>Door_Close</code> until <code>Door_Is_Closed</code>.
        A call at the floor where the cabin is standing opens the door there.</li>
        <li><strong>Light curtain:</strong> if <code>Door_Clear</code> turns FALSE while the door closes, stop closing and open the door again at once.
        While <code>Door_Clear</code> is FALSE the door stays open.</li>
        <li><strong>Interlocks:</strong> the hoist may only run while <code>Door_Is_Closed</code> is TRUE. If it drops during a trip, stop at once.
        <code>Door_Open</code> only while the cabin is at a floor sensor. Never both hoist directions or both door directions at once.</li>
        <li><strong>Display:</strong> <code>Floor_Display</code> shows the current floor (0, 1 or 2).</li>
        <li><strong>Emergency stop:</strong> while <code>E_Stop</code> is FALSE (NC, pressed), every BOOL output is off and calls are cancelled.
        After the release the elevator must work again, without ever opening the door between floors.</li>
      </ol>
      <p>How the elevator continues after an emergency stop between floors is up to you, as long as it is safe:
      for example, drive on to the next floor and open the door there, or wait for the next call.</p>`,
    hints: [
      'Start with the outputs and the interlocks, then build the CASE one state at a time. Test every state on the scene before you add the next one.',
      'Calls: IF Call_1 THEN Req_1 := TRUE; END_IF; and Lamp_Call_1 := Req_1;. Clear Req_x in the door states when Floor = x.',
      'Directions: ReqAbove := (Floor < 1 AND Req_1) OR (Floor < 2 AND Req_2); while moving up, stop when a floor sensor is TRUE and there is a call here or none above.',
      'Door timer: DwellTimer(IN := State = DOOR_WAIT AND Door_Clear, PT := T#3s); called before the CASE. In DOOR_CLOSING: IF NOT Door_Clear THEN State := DOOR_OPENING; END_IF;'
    ],
    tests: [
      {
        name: 'A call to floor 2: travel, stop at the sensor, open, wait, close',
        init: E_INIT,
        steps: [
          { expect: { Motor_Up: false, Motor_Down: false, Door_Open: false, Door_Close: false }, msg: 'After power-up the elevator must stand still with the door closed' },
          { expect: { Floor_Display: 0 }, msg: 'The cabin is at the ground floor (At_0 is TRUE): Floor_Display must show 0' },
          { pulse: { Call_2: true }, ms: 100 },
          { expect: { Lamp_Call_2: true }, msg: 'A press on Call_2 must light Lamp_Call_2, and it must stay on after the button is released' },
          { waitUntil: { Motor_Up: true }, timeout: 500, msg: 'Floor 2 is called and the door is closed: Motor_Up must start' },
          { expect: { Motor_Down: false, Door_Open: false, Door_Close: false } },
          { set: { At_0: false }, wait: 1000 },
          { expect: { Motor_Up: true, Lamp_Call_2: true }, msg: 'Keep driving up; the call stays registered' },
          { set: { At_1: true }, wait: 150 },
          { expect: { Motor_Up: true, Floor_Display: 1 }, msg: 'Nobody called floor 1: pass it without stopping. Floor_Display must show 1 while the cabin is there' },
          { set: { At_1: false }, wait: 1500 },
          { expect: { Motor_Up: true, Door_Open: false } },
          { set: { At_2: true }, wait: 30 },
          { expect: { Motor_Up: false, Floor_Display: 2 }, msg: 'At_2 is TRUE: stop Motor_Up at once, exactly at the floor sensor, and show 2' },
          ...doorOpens,
          { expect: { Lamp_Call_2: false }, msg: 'The call is served: Lamp_Call_2 must go out when the door opens' },
          ...doorCloses,
          { never: 'Motor_Up OR Motor_Down OR Door_Open', for: 1000, msg: 'With no more calls the elevator must wait with the door closed' }
        ]
      },
      {
        name: 'Serve the next call, up and down',
        init: E_INIT,
        steps: [
          { pulse: { Call_1: true }, ms: 100 },
          { waitUntil: { Motor_Up: true }, timeout: 500, msg: 'A call to floor 1 must start Motor_Up' },
          { set: { At_0: false }, wait: 1500 },
          { set: { At_1: true }, wait: 30 },
          { expect: { Motor_Up: false, Floor_Display: 1 }, msg: 'At_1 is TRUE: stop at floor 1 and show 1' },
          ...doorOpens,
          { pulse: { Call_0: true }, ms: 100, wait: 100 },
          { expect: { Lamp_Call_0: true, Lamp_Call_1: false }, msg: 'Calls must also be registered while the door is open' },
          ...doorCloses,
          { waitUntil: { Motor_Down: true }, timeout: 500, msg: 'The door is closed and floor 0 is called: Motor_Down must start' },
          { expect: { Motor_Up: false } },
          { set: { At_1: false }, wait: 1500 },
          { expect: { Motor_Down: true, Floor_Display: 1 }, msg: 'Keep driving down; the display keeps the last floor until the next sensor' },
          { set: { At_0: true }, wait: 30 },
          { expect: { Motor_Down: false, Floor_Display: 0 }, msg: 'At_0 is TRUE: stop Motor_Down and show 0' },
          ...doorOpens,
          { expect: { Lamp_Call_0: false }, msg: 'The call at the ground floor is served: Lamp_Call_0 must go out' }
        ]
      },
      {
        name: 'Never drive while Door_Is_Closed is FALSE',
        init: E_INIT,
        steps: [
          { pulse: { Call_0: true }, ms: 100 },
          ...doorOpens,
          { pulse: { Call_2: true }, ms: 100 },
          { never: 'Motor_Up OR Motor_Down', for: 2000, msg: 'The door is open (Door_Is_Closed is FALSE): the cabin must not move, even with a call waiting' },
          { waitUntil: { Door_Close: true }, timeout: 2000, msg: 'The door must close after the wait' },
          { set: { Door_Is_Open: false } },
          { never: 'Motor_Up OR Motor_Down', for: 1000, msg: 'The door is still closing (Door_Is_Closed is FALSE): do not start the hoist yet' },
          { set: { Door_Is_Closed: true } },
          { waitUntil: { Motor_Up: true }, timeout: 500, msg: 'Door closed and floor 2 called: Motor_Up must start' },
          { set: { At_0: false }, wait: 1000 },
          { set: { Door_Is_Closed: false }, never: 'Motor_Up OR Motor_Down', for: 1000, msg: 'Door_Is_Closed dropped during the trip: the hoist must stop at once. Put Door_Is_Closed into the Motor_Up and Motor_Down assignments as an interlock' }
        ]
      },
      {
        name: 'The light curtain reopens a closing door',
        init: E_INIT,
        steps: [
          { pulse: { Call_0: true }, ms: 100 },
          ...doorOpens,
          { waitUntil: { Door_Close: true }, timeout: 4000, msg: 'About 3 s after the door is fully open it must close' },
          { set: { Door_Is_Open: false }, wait: 300 },
          { set: { Door_Clear: false }, wait: 30 },
          { expect: { Door_Close: false, Door_Open: true }, msg: 'Door_Clear turned FALSE while the door closes: stop closing and open it again at once' },
          { set: { Door_Is_Open: true }, wait: 50 },
          { expect: { Door_Open: false }, msg: 'Door_Is_Open is TRUE: switch the door motor off' },
          { never: { Door_Close: true }, for: 4000, msg: 'While Door_Clear is FALSE (someone in the doorway) the door must stay open' },
          { set: { Door_Clear: true } },
          { waitUntil: { Door_Close: true }, timeout: 4000, msg: 'The doorway is clear again: the door must close after the wait' },
          { set: { Door_Is_Open: false }, wait: 300 },
          { set: { Door_Is_Closed: true }, wait: 50 },
          { expect: { Door_Close: false, Door_Open: false, Motor_Up: false, Motor_Down: false }, msg: 'Door_Is_Closed is TRUE: switch the door motor off and wait' }
        ]
      },
      {
        name: 'Emergency stop',
        init: E_INIT,
        steps: [
          { pulse: { Call_2: true }, ms: 100 },
          { waitUntil: { Motor_Up: true }, timeout: 500, msg: 'A call to floor 2 must start Motor_Up' },
          { set: { At_0: false }, wait: 1000 },
          { set: { E_Stop: false } },
          { always: ALL_OFF, for: 1500, msg: 'E_Stop pressed (FALSE, it is an NC contact): every output, lamps included, must switch off at once and stay off' },
          { pulse: { Call_1: true }, ms: 100 },
          { always: ALL_OFF, for: 500, msg: 'While E_Stop is pressed, a call must not switch anything on' },
          { set: { E_Stop: true } },
          { never: 'Door_Open OR (Motor_Up AND Motor_Down)', for: 1000, msg: 'E_Stop released between floors: the door must not open there' },
          { pulse: { Call_2: true }, ms: 100 },
          { waitUntil: { Motor_Up: true }, timeout: 1000, msg: 'After the release the elevator must work again: a call to floor 2 must drive the cabin up' },
          { set: { At_1: true }, wait: 150 },
          { set: { At_1: false }, wait: 1500 },
          { set: { At_2: true }, wait: 30 },
          { expect: { Motor_Up: false, Floor_Display: 2 }, msg: 'At_2 is TRUE: stop at floor 2 and show 2' },
          { waitUntil: { Door_Open: true }, timeout: 500, msg: 'At floor 2 the door must open' }
        ]
      }
    ],
    quiz: [
      { q: 'Why is Door_Is_Closed written into the Motor_Up assignment even though the state machine only enters MOVING_UP with a closed door?', options: ['It makes the program faster', 'The interlock then holds in every state, even if a transition is wrong or the door switch drops during the trip', 'Outputs must always contain at least two variables'], answer: 1, explain: 'Safety rules belong on the outputs, independent of the sequence logic, so one mistake cannot make the cabin move with an open door.' },
      { q: 'A call button is pressed for 0.2 s while the cabin is two floors away. How does the program remember it?', options: ['It reads Call_x again when the cabin arrives', 'A memory bit is set by the button and reset when the door opens at that floor', 'A TON keeps Call_x TRUE'], answer: 1, explain: 'Like a seal-in: set by the press, reset when the call is served. The lamp shows the bit.' },
      { q: 'The cabin travels up from floor 0 with calls at floor 1 and floor 2. What should it do at floor 1?', options: ['Drive past it and serve floor 2 first', 'Stop, open the door, then continue up to floor 2', 'Turn around, because floor 1 is closer to floor 0'], answer: 1, explain: 'A call on the way is served when the cabin passes that floor in its direction of travel.' }
    ]
  });
})(window.PLC = window.PLC || {});
