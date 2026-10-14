/* LadderLab — lesson registry.
 *
 * A lesson:
 * {
 *   id: 'ld-01-first-rung', chapter: 'ld-basics', order: 1,
 *   title, goal,                       // goal = one sentence: what the student can do afterwards
 *   lang: 'LD' | 'ST', scene: 'trainer',
 *   tags: [{ name, type, address, comment, init }],
 *   starter:  { pous: [{ name:'Main', lang:'LD', rungs:[ 'NO(A) COIL(B)', { comment, text } ] } | { name, lang:'ST', source }] },
 *   solution: { pous: [...] },         // reference solution, must pass all tests
 *   theory: 'HTML',                    // may contain figures:
 *                                      //   <div class="ld-figure" data-rungs='NO(A) COIL(B)||NC(C) COIL(D)'></div>  (rungs separated by ||)
 *                                      //   <pre class="st-figure">IF A THEN B := TRUE; END_IF;</pre>
 *                                      //   <div class="td-figure" data-signals='[{"name":"IN","wave":"0011110000"},{"name":"Q","wave":"0000110000"}]' data-step="1 s"></div>
 *   task: 'HTML',                      // the assignment, usually an ordered list
 *   hints: ['...'],
 *   tests: [ grader tests, see core/grader.js ],
 *   quiz: [{ q, options:[...], answer: index, explain }]
 * }
 */
(function (PLC) {
  'use strict';

  const CHAPTERS = [
    { id: 'ld-basics', title: 'Ladder basics', blurb: 'Contacts, coils and the scan cycle.' },
    { id: 'ld-memory', title: 'Latching and edges', blurb: 'Make the PLC remember: seal-in circuits, set/reset, edge detection.' },
    { id: 'ld-timers', title: 'Timers', blurb: 'On-delay, off-delay, pulses and timed sequences.' },
    { id: 'ld-data', title: 'Counters and numbers', blurb: 'Count events, compare values and calculate.' },
    { id: 'ld-apps', title: 'Applications', blurb: 'Real machines: interlocks, doors, pneumatic sequences.' },
    { id: 'st', title: 'Structured Text', blurb: 'The text language of IEC 61131-3: from assignments to function blocks.' },
    { id: 'debug', title: 'Troubleshooting', blurb: 'Find and fix the bug: programs that compile but do the wrong thing.' },
    { id: 'projects', title: 'Projects', blurb: 'Bigger tasks that combine everything.' }
  ];

  const list = [];
  function register(lesson) {
    const i = list.findIndex(l => l.id === lesson.id);
    if (i >= 0) list[i] = lesson; else list.push(lesson);
  }
  function all() {
    const order = id => { const i = CHAPTERS.findIndex(c => c.id === id); return i < 0 ? 99 : i; };
    return list.slice().sort((a, b) => order(a.chapter) - order(b.chapter) || (a.order || 0) - (b.order || 0));
  }
  function get(id) { return list.find(l => l.id === id) || null; }

  /** Build a project for a lesson from its starter (or solution) definition. */
  function makeProject(lesson, which) {
    const src = (which === 'solution' ? lesson.solution : lesson.starter) || { pous: [{ name: 'Main', lang: lesson.lang || 'LD', rungs: [''] }] };
    const pous = (src.pous || []).map(p => p.lang === 'ST'
      ? { name: p.name || 'Main', lang: 'ST', source: p.source || '' }
      : { name: p.name || 'Main', lang: 'LD', rungs: (p.rungs && p.rungs.length ? p.rungs : ['']) });
    return PLC.project.normalize({
      name: lesson.title, scene: lesson.scene || 'trainer', tags: lesson.tags || [], pous,
      trace: lesson.trace || []
    });
  }

  PLC.lessons = { CHAPTERS, register, all, get, makeProject };

  // ---------------------------------------------------------------- chapter 1 opener
  register({
    id: 'ld-01-first-rung', chapter: 'ld-basics', order: 1,
    title: 'Your first rung',
    goal: 'Explain what a PLC does in every scan cycle and switch a lamp with a switch.',
    lang: 'LD', scene: 'trainer',
    tags: [
      { name: 'Switch1', type: 'BOOL', address: '%IX0.0', comment: 'Toggle switch 1' },
      { name: 'Lamp1', type: 'BOOL', address: '%QX0.0', comment: 'Pilot lamp 1' }
    ],
    starter: { pous: [{ name: 'Main', lang: 'LD', rungs: [''] }] },
    solution: { pous: [{ name: 'Main', lang: 'LD', rungs: [{ comment: 'Lamp1 follows Switch1', text: 'NO(Switch1) COIL(Lamp1)' }] }] },
    trace: ['Switch1', 'Lamp1'],
    theory: `
      <p>A <strong>PLC</strong> (programmable logic controller) is a small, rugged computer that controls machines.
      Push buttons, switches and sensors are wired to its <strong>inputs</strong>. Lamps, motors and valves are wired to its <strong>outputs</strong>.
      Your program decides which outputs switch on, based on the inputs.</p>
      <h3>The scan cycle</h3>
      <p>A PLC runs your program in an endless loop called the <strong>scan cycle</strong>. One scan takes a few milliseconds:</p>
      <ol>
        <li><strong>Read inputs.</strong> The PLC copies the state of every input terminal into memory (the input image).</li>
        <li><strong>Execute the program</strong> from the first rung to the last.</li>
        <li><strong>Write outputs.</strong> The results are copied to the output terminals.</li>
      </ol>
      <p>Because this repeats hundreds of times per second, the machine seems to react instantly.</p>
      <h3>Ladder diagram</h3>
      <p>Ladder diagram (LD) looks like an electrical circuit drawing. Power flows from the <strong>left rail</strong> to the right, through <em>contacts</em> to a <em>coil</em>.
      Each horizontal line is a <strong>rung</strong>.</p>
      <div class="ld-figure" data-rungs="NO(Switch1) COIL(Lamp1)"></div>
      <ul>
        <li><code>-| |-</code> <strong>Normally open contact</strong>: lets power through while its variable is TRUE.</li>
        <li><code>-( )-</code> <strong>Coil</strong>: sets its variable to TRUE while power reaches it, and FALSE otherwise.</li>
      </ul>
      <p>Each contact and coil names a <strong>tag</strong>. A tag is a variable. Tags with an address such as <code>%IX0.0</code> (input byte 0, bit 0)
      or <code>%QX0.0</code> (output byte 0, bit 0) are connected to a terminal of the PLC.</p>`,
    task: `
      <ol>
        <li>Click the empty rung, then add a <strong>normally open contact</strong> from the toolbar and set its tag to <code>Switch1</code>.</li>
        <li>Add a <strong>coil</strong> after it and set its tag to <code>Lamp1</code>.</li>
        <li>Press <strong>Run</strong> and flip Switch 1 on the trainer. Watch the green power flow in the rung.</li>
        <li>Press <strong>Check</strong> to let the checker test your program.</li>
        <li>Optional: press <strong>Pause</strong>, then <strong>Step</strong> (F11) a few times. The scan debugger shows each part of the scan cycle and when Lamp1 really changes.</li>
      </ol>`,
    hints: [
      'Select the rung by clicking it, then click the -| |- button in the toolbar.',
      'Double-click an element to choose its tag.',
      'The finished rung reads: Switch1 contact, then Lamp1 coil.'
    ],
    tests: [{
      name: 'Lamp1 follows Switch1',
      steps: [
        { expect: { Lamp1: false }, msg: 'With Switch1 off, Lamp1 must be off' },
        { set: { Switch1: true }, wait: 50 },
        { expect: { Lamp1: true }, msg: 'Switch1 on should light Lamp1' },
        { set: { Switch1: false }, wait: 50 },
        { expect: { Lamp1: false }, msg: 'Switch1 off should switch Lamp1 off again' }
      ]
    }],
    quiz: [
      { q: 'What does the PLC do at the very start of every scan cycle?', options: ['It writes the outputs', 'It reads all inputs into the input image', 'It runs the last rung first'], answer: 1, explain: 'Inputs are read first, then the program runs, then outputs are written.' },
      { q: 'What does the address %QX0.0 refer to?', options: ['Input byte 0, bit 0', 'Output byte 0, bit 0', 'A memory variable'], answer: 1, explain: 'Q means output, X means a single bit, 0.0 is byte 0, bit 0.' }
    ]
  });
})(window.PLC = window.PLC || {});
