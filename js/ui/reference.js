/* LadderLab — built-in reference: PLC concepts, ladder instructions, function blocks, Structured Text. */
(function (PLC) {
  'use strict';
  const { h, clear } = PLC.dom;
  const esc = PLC.util.escapeHtml;

  function instr(kind, example, extra) {
    const K = PLC.ladder.KINDS[kind];
    return '<div class="ref-item" data-search="' + esc((kind + ' ' + K.label + ' ' + K.help + ' ' + (extra || '')).toLowerCase()) + '">' +
      '<h4><code>' + kind + '</code> ' + esc(K.label) + '</h4>' +
      '<div class="ld-figure" data-rungs="' + esc(example) + '"></div>' +
      '<p>' + esc(K.help) + (extra ? ' ' + extra : '') + '</p></div>';
  }

  function sections() {
    const fb = PLC.fb.defs;
    const fbItem = (name, example, waves, note) => '<div class="ref-item" data-search="' + esc((name + ' ' + fb[name].title + ' ' + fb[name].summary).toLowerCase()) + '">' +
      '<h4><code>' + name + '</code> ' + esc(fb[name].title) + '</h4>' +
      '<p>' + esc(fb[name].summary) + (note ? ' ' + note : '') + '</p>' +
      '<p class="small muted">Inputs: ' + fb[name].inputs.map(([n, t]) => '<code>' + n + '</code> ' + t).join(', ') + ' · Outputs: ' + fb[name].outputs.map(([n, t]) => '<code>' + n + '</code> ' + t).join(', ') + '</p>' +
      (waves ? '<div class="td-figure" data-signals=\'' + JSON.stringify(waves) + '\' data-step="PT / 3"></div>' : '') +
      '<div class="ld-figure" data-rungs="' + esc(example) + '"></div>' +
      '<pre class="st-figure">' + esc(stCall(name)) + '</pre></div>';
    return [
      {
        id: 'concepts', title: 'PLC basics', html: `
<div class="ref-item" data-search="scan cycle input image output image process image">
<h4>The scan cycle</h4>
<p>A PLC repeats three steps forever: <strong>read inputs</strong> into the input image, <strong>execute</strong> the program from top to bottom, <strong>write outputs</strong> from the output image. One pass is a <em>scan</em>. LadderLab runs a scan every 10 ms of simulated time by default (Project tab → scan time).</p>
<p>Because inputs are read only once per scan, a change in the middle of a scan is seen in the next one. Because outputs are written at the end, only the <em>last</em> value written to an output during the scan reaches the machine.</p>
</div>
<div class="ref-item" data-search="address addressing %ix %qx %iw %qw input output analog">
<h4>Addresses</h4>
<p><code>%IX0.3</code> = Input, single bit (X), byte 0, bit 3. <code>%QX1.0</code> = output byte 1, bit 0. <code>%IW0</code> / <code>%QW0</code> = analog input / output word (INT, range 0..1000 in this simulator).</p>
<p>This PLC has 16 digital inputs (%IX0.0–%IX1.7), 16 digital outputs (%QX0.0–%QX1.7), 4 analog inputs and 4 analog outputs. Tags without an address are internal memory.</p>
</div>
<div class="ref-item" data-search="normally open normally closed nc no wiring stop button wire break fail safe">
<h4>NO and NC: device versus program</h4>
<p>A <strong>physical</strong> NC button (like a stop button) delivers TRUE while it is <em>not</em> pressed. Wire break then looks like "stop pressed", which is safe. In the program you therefore usually check a stop button with a <em>normally open</em> contact: the rung conducts only while the stop circuit is intact.</p>
<p>The ladder symbols describe a condition on the variable: <code>-| |-</code> conducts when it is TRUE, <code>-|/|-</code> conducts when it is FALSE.</p>
</div>
<div class="ref-item" data-search="data types bool int dint real time string word byte">
<h4>Data types</h4>
<table class="ref-table"><tr><th>Type</th><th>Values</th></tr>
<tr><td><code>BOOL</code></td><td>TRUE / FALSE</td></tr>
<tr><td><code>INT</code></td><td>-32768 … 32767 (wraps around on overflow)</td></tr>
<tr><td><code>DINT</code></td><td>32-bit integer</td></tr>
<tr><td><code>UINT</code>, <code>WORD</code>, <code>BYTE</code></td><td>unsigned 0…65535, bit strings</td></tr>
<tr><td><code>REAL</code></td><td>floating point, e.g. 3.14</td></tr>
<tr><td><code>TIME</code></td><td>durations: <code>T#500ms</code>, <code>T#2s</code>, <code>T#1m30s</code></td></tr>
<tr><td><code>STRING</code></td><td><code>'text'</code></td></tr>
<tr><td><code>ARRAY[0..9] OF INT</code></td><td>ten INT values, index 0 to 9</td></tr></table>
</div>
<div class="ref-item" data-search="scan debugger step rung process image input image output image pause f11">
<h4>The scan debugger</h4>
<p>Press <strong>Pause</strong>, then <strong>Step</strong> (F11) to run the scan cycle one part at a time: <em>read inputs</em>, each ladder rung (or each Structured Text program), <em>write outputs</em>. The strip above the editor shows where the PLC is and compares every input and output terminal (T) with its process image (I). Try flipping a switch right after "Read inputs": the program does not see it until the next scan. Watch a coil: the output image changes at once, the machine only at "Write outputs".</p>
</div>
<div class="ref-item" data-search="force forcing modify write watch">
<h4>Writing and forcing</h4>
<p>In the Watch window you can <strong>write</strong> a value once (the program may overwrite it in the next scan) or <strong>force</strong> an input or output. A forced input is fixed no matter what the machine does; a forced output drives the machine no matter what the program does. Forcing is a commissioning tool and can be dangerous on real machines: always remove forces when you are done.</p>
</div>
<div class="ref-item" data-search="fault watchdog division by zero stop run">
<h4>Faults</h4>
<p>If the program divides by zero, uses an array index out of range, or a loop never ends (watchdog), the CPU goes to <strong>FAULT</strong>: all outputs switch off. Fix the cause and press Run again.</p>
</div>`
      },
      {
        id: 'contacts', title: 'Contacts and coils', html:
          instr('NO', 'NO(Start) COIL(Lamp)') + instr('NC', 'NC(Door_Open) COIL(Ready)') +
          instr('P', 'P(Button) ADD(Count, 1, OUT=Count)', 'Use it to do something once per press, such as counting or toggling.') +
          instr('N', 'N(Button) COIL(Released)') +
          instr('COIL', 'NO(A) COIL(Out)', 'If the same variable is written by two coils, only the last rung counts.') +
          instr('NCOIL', 'NO(A) NCOIL(Out)') +
          instr('SET', 'NO(Start) SET(Motor)', 'Pair it with a Reset coil. The rung that comes later wins when both are active.') +
          instr('RESET', 'NC(Stop) RESET(Motor)') +
          '<div class="ref-item" data-search="series and parallel or branch logic"><h4>Series = AND, parallel = OR</h4><div class="ld-figure" data-rungs="NO(A) NO(B) COIL(Both)||[ NO(A) | NO(B) ] COIL(Either)"></div><p>Contacts in series must all conduct. Parallel branches conduct if any branch conducts.</p></div>'
      },
      {
        id: 'fbs', title: 'Timers, counters, edges', html:
          fbItem('TON', 'NO(Go) TON(T1, PT=T#3s) COIL(Lamp)', [{ name: 'IN', wave: '0111111110011100' }, { name: 'Q', wave: '0000111110000000' }]) +
          fbItem('TOF', 'NO(Button) TOF(T1, PT=T#5s) COIL(Light)', [{ name: 'IN', wave: '0111000000011000' }, { name: 'Q', wave: '0111111000011111' }]) +
          fbItem('TP', 'P(Button) TP(T1, PT=T#2s) COIL(Horn)', [{ name: 'IN', wave: '0110000011111111' }, { name: 'Q', wave: '0111000011100000' }]) +
          fbItem('TONR', 'NO(Motor) TONR(Hours, R=Reset, PT=T#10s) COIL(Service)', null, 'Siemens calls it TONR, Rockwell RTO.') +
          fbItem('CTU', 'NO(Sensor) CTU(C1, R=Reset, PV=5, CV=Count) COIL(Full)', null, 'Counts rising edges only: holding the input TRUE counts once.') +
          fbItem('CTD', 'NO(Take) CTD(C1, LD=Refill, PV=10, CV=Left) COIL(Empty)') +
          fbItem('CTUD', 'NO(In) CTUD(C1, CD=Out, R=Reset, PV=8, CV=Cars) COIL(Full)') +
          fbItem('R_TRIG', 'NO(Button) R_TRIG(Edge1) ADD(Count, 1, OUT=Count)') +
          fbItem('F_TRIG', 'NO(Button) F_TRIG(Edge2) COIL(Pulse)') +
          fbItem('SR', 'NO(Start) SR(Latch1, R=Stop) COIL(Motor)') +
          fbItem('RS', 'NO(Start) RS(Latch2, R1=Stop) COIL(Motor)', null, 'Use the reset-dominant RS for anything safety related: Stop must win.')
      },
      {
        id: 'boxes', title: 'Compare and math', html:
          instr('EQ', 'EQ(Count, 5) COIL(Done)') + instr('NE', 'NE(State, 0) COIL(Busy)') + instr('GT', 'GT(Level, 800) RESET(Pump)') +
          instr('GE', 'GE(Count, 10) COIL(Full)') + instr('LT', 'LT(Level, 200) SET(Pump)') + instr('LE', 'LE(Temp, 40) COIL(Cool)') +
          instr('MOVE', 'NO(Load) MOVE(100, OUT=Setpoint)') + instr('ADD', 'P(Pulse) ADD(Count, 1, OUT=Count)') +
          instr('CALL', 'NO(Go) CALL(Starter1, Halt=Stop) COIL(Running)', 'Write the function block in a Structured Text POU (+ next to the program tabs), add a tag of that type, then pick it as the instance. The box shows the inputs and outputs of the block.') +
          instr('SUB', 'NO(Go) SUB(8, Cars, OUT=Free)') + instr('MUL', 'NO(Go) MUL(Level, 2, OUT=Litres)') +
          instr('DIV', 'NO(Go) DIV(Level, 10, OUT=Percent)', 'With whole numbers the result is truncated: 7 / 2 = 3.') +
          instr('MOD', 'NO(Go) MOD(Count, 2, OUT=Odd)')
      },
      {
        id: 'st', title: 'Structured Text', html: `
<div class="ref-item" data-search="assignment expression statement semicolon">
<h4>Assignments and expressions</h4>
<pre class="st-figure">Lamp := Switch1 AND NOT Switch2;     // BOOL logic
Count := Count + 1;                  // arithmetic
Percent := Level / 10;               // INT / INT truncates
Ratio := INT_TO_REAL(Level) / 10.0;  // REAL division</pre>
<p>Every statement ends with <code>;</code>. Assignment is <code>:=</code>, comparison is <code>=</code>. Comments: <code>(* … *)</code> or <code>// …</code>.</p>
</div>
<div class="ref-item" data-search="operators precedence and or xor not mod">
<h4>Operators (highest priority first)</h4>
<table class="ref-table"><tr><td><code>( )</code></td><td>parentheses, function calls</td></tr>
<tr><td><code>**</code></td><td>power</td></tr><tr><td><code>-</code> <code>NOT</code></td><td>negation, logical NOT</td></tr>
<tr><td><code>*</code> <code>/</code> <code>MOD</code></td><td>multiply, divide, remainder</td></tr><tr><td><code>+</code> <code>-</code></td><td>add, subtract</td></tr>
<tr><td><code>&lt; &gt; &lt;= &gt;=</code></td><td>compare</td></tr><tr><td><code>=</code> <code>&lt;&gt;</code></td><td>equal, not equal</td></tr>
<tr><td><code>AND</code> <code>&amp;</code></td><td>logical AND</td></tr><tr><td><code>XOR</code></td><td>exclusive OR</td></tr><tr><td><code>OR</code></td><td>logical OR</td></tr></table>
</div>
<div class="ref-item" data-search="if then elsif else end_if">
<h4>IF</h4>
<pre class="st-figure">IF Level &lt; 300 THEN
    Pump := TRUE;
ELSIF Level &gt; 700 THEN
    Pump := FALSE;
END_IF;   // between 300 and 700 Pump keeps its value</pre>
</div>
<div class="ref-item" data-search="case of state machine end_case">
<h4>CASE (state machines)</h4>
<pre class="st-figure">CASE Step OF
    0: IF Start THEN Step := 10; END_IF;
    10: Motor := TRUE;
        IF Done THEN Step := 20; END_IF;
    20, 30: Motor := FALSE;
    40..49: Alarm := TRUE;
ELSE
    Step := 0;
END_CASE;</pre>
</div>
<div class="ref-item" data-search="for while repeat loop exit continue watchdog">
<h4>Loops</h4>
<pre class="st-figure">FOR i := 0 TO 9 DO
    Sum := Sum + Values[i];
END_FOR;

WHILE i &lt; 10 AND Values[i] &lt;&gt; 0 DO
    i := i + 1;
END_WHILE;

REPEAT
    n := n - 1;
UNTIL n &lt;= 0 END_REPEAT;</pre>
<p>A loop runs completely inside one scan. Never wait for an input in a loop: the input image does not change during the scan, so the loop never ends and the watchdog stops the PLC. Use <code>EXIT</code> to leave a loop early.</p>
</div>
<div class="ref-item" data-search="var declaration local variable constant array initial">
<h4>Declarations</h4>
<pre class="st-figure">VAR
    Step : INT := 0;
    Delay : TON;
    Values : ARRAY[0..9] OF INT := [10(0)];
END_VAR
VAR CONSTANT
    MAX_CARS : INT := 8;
END_VAR</pre>
<p>Global variables are the tags in the Tags table. Variables in a <code>VAR</code> block are local to the program and keep their values between scans.</p>
</div>
<div class="ref-item" data-search="function block call timer counter instance">
<h4>Calling function blocks</h4>
<pre class="st-figure">Delay(IN := Start, PT := T#5s);   // call every scan
Lamp := Delay.Q;                  // read outputs afterwards
Counter(CU := Sensor, R := Reset, PV := 10, CV =&gt; Count);</pre>
</div>
<div class="ref-item" data-search="function function_block user defined var_input var_output">
<h4>Your own functions and function blocks</h4>
<pre class="st-figure">FUNCTION Percent : INT
    VAR_INPUT Raw : INT; END_VAR
    Percent := Raw / 10;
END_FUNCTION

FUNCTION_BLOCK Blinker
    VAR_INPUT Enable : BOOL; Period : TIME; END_VAR
    VAR_OUTPUT Out : BOOL; END_VAR
    VAR T : TON; END_VAR
    T(IN := Enable AND NOT T.Q, PT := Period / 2);
    IF T.Q THEN Out := NOT Out; END_IF;
    IF NOT Enable THEN Out := FALSE; END_IF;
END_FUNCTION_BLOCK</pre>
<p>Create them with the + button next to the program tabs. A function has no memory; a function block keeps its variables in each instance.</p>
</div>
<div class="ref-item" data-search="standard functions abs sqrt min max limit sel mux conversion">
<h4>Standard functions</h4>
<p><code>ABS</code>, <code>SQRT</code>, <code>LN</code>, <code>LOG</code>, <code>EXP</code>, <code>SIN</code>, <code>COS</code>, <code>TAN</code>, <code>EXPT</code>, <code>MIN</code>, <code>MAX</code>, <code>LIMIT(MN, IN, MX)</code>, <code>SEL(G, IN0, IN1)</code>, <code>MUX(K, …)</code>, <code>TRUNC</code>, <code>SHL</code>, <code>SHR</code>, <code>ROL</code>, <code>ROR</code>, <code>LEN</code>, <code>CONCAT</code>, <code>LEFT</code>, <code>RIGHT</code>, <code>MID</code>, <code>FIND</code>, and conversions such as <code>INT_TO_REAL</code>, <code>REAL_TO_INT</code> (rounds), <code>TIME_TO_DINT</code> (milliseconds), <code>BOOL_TO_INT</code>, <code>INT_TO_STRING</code>.</p>
</div>`
      },
      {
        id: 'keys', title: 'Keyboard', html: `
<div class="ref-item" data-search="keyboard shortcuts keys">
<h4>Ladder editor</h4>
<table class="ref-table">
<tr><td><kbd>1</kbd>–<kbd>7</kbd></td><td>insert NO, NC, coil, set, reset, TON, CTU</td></tr>
<tr><td><kbd>B</kbd></td><td>parallel branch around the selection</td></tr>
<tr><td><kbd>N</kbd></td><td>new rung</td></tr>
<tr><td><kbd>Enter</kbd></td><td>edit the selected element</td></tr>
<tr><td><kbd>Del</kbd></td><td>delete selection (or rung)</td></tr>
<tr><td><kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd></td><td>move selection</td></tr>
<tr><td><kbd>Shift</kbd>+click</td><td>select a range in one row</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>X</kbd> / <kbd>V</kbd> / <kbd>D</kbd></td><td>copy, cut, paste, duplicate rung</td></tr></table>
<h4>Everywhere</h4>
<table class="ref-table">
<tr><td><kbd>F5</kbd></td><td>Run / Stop</td></tr>
<tr><td><kbd>F10</kbd></td><td>one scan (while paused)</td></tr>
<tr><td><kbd>F11</kbd></td><td>scan debugger: next part of the scan</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Y</kbd></td><td>undo / redo</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>Space</kbd></td><td>autocomplete (Structured Text)</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>/</kbd></td><td>comment lines (Structured Text)</td></tr></table>
</div>`
      }
    ];
  }

  function stCall(name) {
    const d = PLC.fb.defs[name];
    const args = d.inputs.map(([n, t]) => n + ' := ' + (t === 'TIME' ? 'T#2s' : t === 'BOOL' ? (n === d.powerIn ? 'Input' : 'FALSE') : '10')).join(', ');
    return 'Inst(' + args + ');\nOut := Inst.' + d.powerOut + ';';
  }

  class ReferencePanel {
    constructor(app, host) {
      this.app = app;
      this.root = h('div.ref-panel');
      const search = h('input.input.sm.filter', { type: 'search', placeholder: 'Search the reference', 'aria-label': 'Search the reference' });
      search.addEventListener('input', () => this.filter(search.value.trim().toLowerCase()));
      this.body = h('div.ref-body');
      this.root.append(h('div.ref-search', null, search), this.body);
      host.appendChild(this.root);
      this.built = false;
    }
    render() {
      if (this.built) return;
      this.built = true;
      clear(this.body);
      for (const sec of sections()) {
        const det = h('details.ref-sec', { open: sec.id === 'concepts' }, h('summary', { text: sec.title }));
        const content = h('div.prose', { html: sec.html });
        det.appendChild(content);
        this.body.appendChild(det);
        // render figures lazily on first open (keeps startup fast)
        const draw = () => { if (!content.dataset.done) { content.dataset.done = '1'; PLC.renderFigures(content); } };
        if (det.open) draw();
        det.addEventListener('toggle', () => { if (det.open) draw(); });
      }
    }
    filter(q) {
      this.body.querySelectorAll('.ref-sec').forEach(sec => {
        let any = false;
        sec.querySelectorAll('.ref-item').forEach(it => {
          const hit = !q || (it.dataset.search || it.textContent.toLowerCase()).includes(q) || it.textContent.toLowerCase().includes(q);
          it.hidden = !hit;
          if (hit) any = true;
        });
        sec.hidden = !any;
        if (q && any && !sec.open) sec.open = true;
      });
    }
  }

  PLC.ReferencePanel = ReferencePanel;
})(window.PLC = window.PLC || {});
