/* LadderLab — PLC runtime and simulator.
 *
 * Every scan cycle does what a real PLC does:
 *   1. read the physical inputs into the input process image (forces applied),
 *   2. execute the programs top to bottom,
 *   3. copy the output process image to the physical outputs (forces applied).
 * The plant model (scene) advances on the same simulated clock, so behaviour is deterministic. */
(function (PLC) {
  'use strict';

  const T = PLC.types;
  const IO = T.IO;

  function newImage() {
    return {
      I: new Array(IO.DI).fill(false), Q: new Array(IO.DO).fill(false),
      IW: new Array(IO.AI).fill(0), QW: new Array(IO.AO).fill(0)
    };
  }

  class Runtime extends PLC.util.Emitter {
    constructor() {
      super();
      this.state = 'STOP';          // STOP | RUN | FAULT
      this.paused = false;
      this.scanTime = 10;           // ms of simulated time per scan
      this.speed = 1;
      this.maxOps = 200000;
      this.time = 0;                // simulated clock in ms
      this.scanCount = 0;
      this.phys = newImage();       // field side: wired to the scene
      this.forces = {};             // address text → value
      this.compiled = null;
      this.mem = null;
      this.fault = null;
      this.scene = null;
      this.trace = null;
      this.lastExecMs = 0;
      this._acc = 0;
    }

    /** Load a newly compiled project. Values of variables that still exist are kept. */
    load(compiled) {
      this.debug = null;
      const old = this.mem;
      this.compiled = compiled;
      const io = old ? old.io : newImage();
      const mem = compiled.createMemory(io);
      mem.flow = old ? old.flow : {};
      mem.es = old ? old.es : {};
      if (old) transferValues(old, mem, this.oldGlobals || [], compiled.globals);
      this.mem = mem;
      this.oldGlobals = compiled.globals;
      this.emit('loaded', compiled);
    }

    /** Reset all variables to their initial values (cold restart). */
    coldStart() {
      if (!this.compiled) return;
      const io = newImage();
      this.mem = this.compiled.createMemory(io);
      this.mem.flow = {};
      this.mem.es = {};
      this.oldGlobals = this.compiled.globals;
    }

    run() {
      if (!this.compiled || !this.compiled.ok) {
        this.emit('message', { severity: 'error', message: 'Fix the errors in the program before switching to RUN.' });
        return false;
      }
      if (this.state !== 'RUN') {
        this.coldStart();
        this.fault = null;
        this.state = 'RUN';
        this.emit('state', this.state);
      }
      return true;
    }

    stop() {
      this.debug = null; this.lastPhase = null;
      if (this.state === 'STOP') return;
      this.state = 'STOP';
      this.phys.Q.fill(false);
      this.phys.QW.fill(0);
      this.emit('state', this.state);
    }

    setFault(err) {
      const ctx = this._ctx || {};
      this.fault = {
        message: err.message,
        pou: ctx.pou || '', line: ctx.line || 0, rung: ctx.rung,
        time: this.time
      };
      this.state = 'FAULT';
      this.phys.Q.fill(false);
      this.phys.QW.fill(0);
      this.emit('fault', this.fault);
      this.emit('state', this.state);
    }

    readInputs() {
      const io = this.mem.io, phys = this.phys, forces = this.forces;
      for (let i = 0; i < IO.DI; i++) io.I[i] = phys.I[i];
      for (let i = 0; i < IO.AI; i++) io.IW[i] = phys.IW[i];
      for (const a in forces) {
        const p = T.parseAddress(a);
        if (p && (p.area === 'I' || p.area === 'IW')) io[p.area][p.index] = forces[a];
      }
    }

    writeOutputs() {
      const io = this.mem.io, phys = this.phys, forces = this.forces;
      for (let i = 0; i < IO.DO; i++) phys.Q[i] = io.Q[i];
      for (let i = 0; i < IO.AO; i++) phys.QW[i] = io.QW[i];
      for (const a in forces) {
        const p = T.parseAddress(a);
        if (p && (p.area === 'Q' || p.area === 'QW')) phys[p.area][p.index] = forces[a];
      }
    }

    handleError(e) {
      if (e && e.isFault) this.setFault(e);
      else if (e instanceof RangeError) this.setFault(new PLC.RuntimeFault('Stack overflow: a function or function block calls itself without end'));
      else { console.error(e); this.setFault(new PLC.RuntimeFault('Internal error: ' + e.message)); }
    }

    newCtx() { return { now: this.time, ops: 0, maxOps: this.maxOps, depth: 0, pou: '', line: 0, rung: null }; }

    stepPlant() {
      if (this.scene && this.scene.step) {
        try { this.scene.step(this.scanTime, this.phys, this.time); } catch (e) { console.error('Scene error', e); }
      }
    }

    endScan() {
      this.time += this.scanTime;
      if (this.trace) this.trace.sample(this);
    }

    /** Execute exactly one scan cycle (plant + PLC). Completes a scan the debugger has started. */
    scan() {
      if (this.debug) { while (this.debug) this.stepPhase(); return; }
      this.stepPlant();
      if (this.state === 'RUN' && this.mem) {
        this.readInputs();
        const ctx = this._ctx = this.newCtx();
        const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        try {
          for (const prog of this.compiled.programs) prog.run(ctx, this.mem);
        } catch (e) { this.handleError(e); }
        this.lastExecMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
        if (this.state === 'RUN') this.writeOutputs();
        this.scanCount++;
      } else {
        // outputs are switched off while the CPU is not running
        this.phys.Q.fill(false);
        this.phys.QW.fill(0);
        if (this.mem) {
          for (let i = 0; i < IO.DI; i++) this.mem.io.I[i] = this.phys.I[i];
          for (let i = 0; i < IO.AI; i++) this.mem.io.IW[i] = this.phys.IW[i];
        }
      }
      this.endScan();
    }

    /**
     * Scan debugger: execute only the next part of the scan cycle
     * (read inputs, one ladder rung or one ST program, write outputs).
     * Returns the phase that was executed.
     */
    stepPhase() {
      if (this.state !== 'RUN' || !this.mem) { this.debug = null; this.scan(); return null; }
      if (!this.debug) {
        this.stepPlant();
        const phases = [{ kind: 'input', label: 'Read inputs' }];
        for (const prog of this.compiled.programs) {
          if (prog.runRung) for (let i = 0; i < prog.rungCount; i++) phases.push({ kind: 'rung', prog, pou: prog.name, pouId: prog.id, index: i, label: prog.name + ', rung ' + (i + 1) });
          else phases.push({ kind: 'prog', prog, pou: prog.name, pouId: prog.id, label: prog.name + ' (Structured Text)' });
        }
        phases.push({ kind: 'output', label: 'Write outputs' });
        this.debug = { phases, i: 0, ctx: this.newCtx() };
      }
      const d = this.debug;
      const ph = d.phases[d.i];
      this._ctx = d.ctx;
      try {
        if (ph.kind === 'input') this.readInputs();
        else if (ph.kind === 'rung') ph.prog.runRung(d.ctx, this.mem, ph.index);
        else if (ph.kind === 'prog') ph.prog.run(d.ctx, this.mem);
        else this.writeOutputs();
      } catch (e) { this.handleError(e); }
      d.i++;
      this.lastPhase = { phases: d.phases, done: d.i, phase: ph };
      if (this.state !== 'RUN' || d.i >= d.phases.length) {
        this.debug = null;
        if (this.state === 'RUN') this.scanCount++;
        this.endScan();
      }
      this.emit('phase', this.lastPhase);
      return ph;
    }

    /** Advance by real elapsed milliseconds (scaled by speed). Returns scans executed. */
    advance(realMs) {
      if (this.paused) return 0;
      this._acc += Math.min(realMs, 250) * this.speed;
      let n = 0;
      const maxScans = 2000;
      while (this._acc >= this.scanTime && n < maxScans) {
        this._acc -= this.scanTime;
        this.scan();
        n++;
      }
      if (n >= maxScans) this._acc = 0;
      return n;
    }

    step() { this._acc = 0; this.scan(); }

    // ---- variable access for watch / tests --------------------------------
    findGlobal(name) {
      if (!this.compiled) return null;
      const key = String(name).toLowerCase();
      return this.compiled.globals.find(g => g.name.toLowerCase() === key) || null;
    }

    read(name) {
      const sym = this.findGlobal(name);
      if (!sym || !this.mem) return undefined;
      return this.mem.g[sym.key];
    }

    /** Write a value once ("modify"). For input addresses the physical input is changed instead. */
    write(name, value) {
      const sym = this.findGlobal(name);
      if (!sym || !this.mem) return false;
      if (sym.address && (sym.address.area === 'I' || sym.address.area === 'IW')) {
        this.phys[sym.address.area][sym.address.index] = T.coerce(sym.type.name, value);
        this.mem.io[sym.address.area][sym.address.index] = T.coerce(sym.type.name, value);
        return true;
      }
      this.mem.g[sym.key] = sym.type.k === 'elem' ? T.coerce(sym.type.name, value) : value;
      return true;
    }

    setForce(addr, value) {
      const p = T.parseAddress(addr);
      if (!p) return;
      if (value === null || value === undefined) delete this.forces[p.text];
      else this.forces[p.text] = T.coerce(p.type, value);
      this.emit('forces', this.forces);
    }

    clearForces() { this.forces = {}; this.emit('forces', this.forces); }
  }

  function transferValues(oldMem, newMem, oldGlobals, newGlobals) {
    const oldByName = new Map(oldGlobals.map(g => [g.name.toLowerCase(), g]));
    for (const g of newGlobals) {
      const o = oldByName.get(g.name.toLowerCase());
      if (!o) continue;
      if (T.typeToString(o.type) !== T.typeToString(g.type)) continue;
      if (g.address || o.address) continue; // I/O lives in the shared process image
      newMem.g[g.key] = oldMem.g[o.key];
    }
    for (const prog of Object.keys(newMem.p)) {
      const op = oldMem.p[prog];
      if (!op) continue;
      const np = newMem.p[prog];
      for (const k of Object.keys(np)) {
        if (!(k in op)) continue;
        const a = op[k], b = np[k];
        const sameShape = (typeof a === typeof b) && (Array.isArray(a) === Array.isArray(b)) &&
          (!Array.isArray(a) || a.length === b.length) &&
          (typeof a !== 'object' || a === null || Array.isArray(a) || a._type === b._type);
        const desc = Object.getOwnPropertyDescriptor(np, k);
        if (sameShape && desc && !desc.get) np[k] = a;
      }
    }
  }

  // ---- signal trace (logic analyser) ------------------------------------------
  class Trace {
    constructor(capacity) {
      this.capacity = capacity || 6000;
      this.signals = [];   // { name, type }
      this.times = [];
      this.data = {};      // name → values
      this.every = 1;      // sample every N scans
      this._n = 0;
      this.enabled = true;
    }
    setSignals(list) {
      this.signals = list.slice();
      const data = {};
      for (const s of list) data[s.name] = this.data[s.name] && this.data[s.name].length === this.times.length ? this.data[s.name] : new Array(this.times.length).fill(null);
      this.data = data;
    }
    clear() { this.times = []; for (const k in this.data) this.data[k] = []; }
    sample(rt) {
      if (!this.enabled || !this.signals.length) return;
      if (++this._n % this.every) return;
      this.times.push(rt.time);
      for (const s of this.signals) {
        let v = null;
        try { v = s.get ? s.get(rt) : rt.read(s.name); } catch (e) { v = null; }
        if (typeof v === 'object' && v !== null) v = null;
        this.data[s.name].push(v === undefined ? null : v);
      }
      if (this.times.length > this.capacity) {
        const cut = this.times.length - this.capacity;
        this.times.splice(0, cut);
        for (const k in this.data) this.data[k].splice(0, cut);
      }
    }
  }

  PLC.Runtime = Runtime;
  PLC.Trace = Trace;
  PLC.newImage = newImage;
})(window.PLC = window.PLC || {});
