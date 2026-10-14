/* LadderLab — automatic checker for lesson exercises.
 * A test is a list of steps run against a fresh, headless PLC:
 *   { set: { Start: true } }                     change inputs (or variables)
 *   { wait: 500 }                                run for 500 ms
 *   { pulse: { Start: true }, ms: 100 }           set, wait, set back
 *   { expect: { Motor: true } | 'Count = 3' }    check now
 *   { waitUntil: {...} | 'expr', timeout, min }  run until the condition holds (optionally not before `min` ms)
 *   { always: {...} | 'expr', for: 2000 }        condition must hold on every scan for the period
 *   { never: {...} | 'expr', for: 2000 }         condition must never hold during the period
 * Every step may carry `msg`, a sentence shown to the student when the step fails. */
(function (PLC) {
  'use strict';

  const T = PLC.types;

  function fmt(v) {
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
    if (v === undefined) return '(missing)';
    return String(v);
  }

  class TestFailure extends Error {}

  function runTests(project, tests, opts) {
    opts = opts || {};
    const compiled = PLC.compiler.compileProject(project);
    if (!compiled.ok) {
      const first = compiled.diagnostics.find(d => d.severity === 'error');
      return {
        passed: false, compileError: true,
        results: [{ name: 'Program compiles', passed: false, message: 'The program has errors: ' + (first ? first.message : 'unknown error') }]
      };
    }
    const results = tests.map(t => runOne(compiled, project, t, opts));
    return { passed: results.every(r => r.passed), results };
  }

  function runOne(compiled, project, test, opts) {
    const rt = new PLC.Runtime();
    rt.scanTime = opts.scanTime || project.scanTime || 10;
    rt.load(compiled);
    const res = { name: test.name || 'Test', passed: true, message: '' };

    const tagType = (name) => {
      const sym = rt.findGlobal(name);
      if (!sym) throw new TestFailure('The tag "' + name + '" is missing. Add it to the Tags table (the checker needs it).');
      return sym;
    };

    const applySet = (obj) => {
      for (const name of Object.keys(obj)) {
        const sym = tagType(name);
        let v = obj[name];
        if (typeof v === 'string' && sym.type.name === 'TIME') v = T.parseTimeLiteral(v);
        if (sym.address && (sym.address.area === 'I' || sym.address.area === 'IW')) {
          rt.phys[sym.address.area][sym.address.index] = T.coerce(sym.type.name, v);
        } else {
          rt.write(name, v);
        }
      }
    };

    const exprCache = {};
    const evalCond = (cond) => {
      if (typeof cond === 'string') {
        let c = exprCache[cond];
        if (!c) {
          try { c = exprCache[cond] = compiled.compileWatchExpr(cond); }
          catch (e) { throw new TestFailure('The checker cannot evaluate "' + cond + '": ' + e.message + '. Make sure all required tags exist.'); }
        }
        const v = c.fn({ self: null, g: rt.mem.g, io: rt.mem.io, ctx: { now: rt.time, ops: 0, maxOps: 1000, depth: 0 } });
        return { ok: !!v, detail: cond + ' is FALSE' };
      }
      const fails = [];
      for (const name of Object.keys(cond)) {
        const sym = tagType(name);
        const actual = rt.read(name);
        let want = cond[name];
        let ok;
        if (want && typeof want === 'object') {
          ok = (want.min === undefined || actual >= want.min) && (want.max === undefined || actual <= want.max);
          if (!ok) fails.push(name + ' should be ' + (want.min !== undefined && want.max !== undefined ? 'between ' + want.min + ' and ' + want.max : want.min !== undefined ? 'at least ' + want.min : 'at most ' + want.max) + ', but it is ' + fmt(actual));
          continue;
        }
        if (typeof want === 'string' && sym.type.name === 'TIME') want = T.parseTimeLiteral(want);
        if (typeof want === 'number' && typeof actual === 'number' && !Number.isInteger(want)) ok = Math.abs(actual - want) < 1e-3;
        else ok = actual === T.coerce(sym.type.name, want);
        if (!ok) fails.push(name + ' should be ' + fmt(want) + ', but it is ' + fmt(actual));
      }
      return { ok: fails.length === 0, detail: fails.join('; ') };
    };

    const describe = (cond) => typeof cond === 'string' ? cond : Object.keys(cond).map(k => k + ' = ' + fmt(cond[k])).join(' and ');
    const at = () => ' (at t = ' + (rt.time / 1000).toFixed(2) + ' s)';
    const scans = (ms) => Math.max(1, Math.round(ms / rt.scanTime));
    const tick = () => {
      rt.scan();
      if (rt.state === 'FAULT') throw new TestFailure('The PLC stopped with a fault: ' + rt.fault.message + (rt.fault.line ? ' (line ' + rt.fault.line + ')' : ''));
    };

    try {
      if (test.init) applySet(test.init);
      if (!rt.run()) throw new TestFailure('The program could not be started.');
      tick();
      for (const step of test.steps || []) {
        const msg = step.msg ? step.msg + ' — ' : '';
        if (step.set) applySet(step.set);
        if (step.pulse) {
          applySet(step.pulse);
          const n = scans(step.ms || 100);
          for (let i = 0; i < n; i++) tick();
          const off = {};
          for (const k of Object.keys(step.pulse)) {
            const v = step.pulse[k];
            off[k] = typeof v === 'boolean' ? !v : 0;
          }
          applySet(off);
          tick();
        }
        if (step.wait) { const n = scans(step.wait); for (let i = 0; i < n; i++) tick(); }
        if (step.set && !step.wait) tick();
        if (step.expect) {
          const r = evalCond(step.expect);
          if (!r.ok) throw new TestFailure(msg + r.detail + at());
        }
        if (step.waitUntil) {
          const timeout = step.timeout || 5000;
          const n = scans(timeout);
          const start = rt.time;
          let ok = evalCond(step.waitUntil).ok;
          for (let i = 0; i < n && !ok; i++) { tick(); ok = evalCond(step.waitUntil).ok; }
          const took = rt.time - start;
          if (!ok) throw new TestFailure(msg + 'Waited ' + (timeout / 1000) + ' s for ' + describe(step.waitUntil) + ', but it did not happen' + at());
          if (step.min !== undefined && took < step.min) throw new TestFailure(msg + describe(step.waitUntil) + ' happened after ' + (took / 1000).toFixed(2) + ' s, but not before ' + (step.min / 1000).toFixed(2) + ' s was expected');
        }
        if (step.always) {
          const n = scans(step.for || 1000);
          for (let i = 0; i < n; i++) {
            const r = evalCond(step.always);
            if (!r.ok) throw new TestFailure(msg + r.detail + at());
            tick();
          }
        }
        if (step.never) {
          const n = scans(step.for || 1000);
          for (let i = 0; i < n; i++) {
            const r = evalCond(step.never);
            if (r.ok) throw new TestFailure(msg + describe(step.never) + ' must never happen, but it did' + at());
            tick();
          }
        }
      }
      res.message = test.pass || 'Passed';
    } catch (e) {
      if (!(e instanceof TestFailure)) {
        res.passed = false;
        res.message = 'Checker error: ' + e.message;
        if (typeof console !== 'undefined') console.error(e);
      } else {
        res.passed = false;
        res.message = e.message;
      }
    }
    return res;
  }

  PLC.grader = { runTests };
})(window.PLC = window.PLC || {});
