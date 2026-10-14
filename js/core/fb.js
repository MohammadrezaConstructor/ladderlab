/* LadderLab — IEC 61131-3 standard function blocks.
 * Each definition lists its inputs/outputs; exec(inst, now) updates the instance once.
 * `now` is the simulated PLC clock in ms, sampled at the start of the scan. */
(function (PLC) {
  'use strict';

  const INT_MAX = 32767, INT_MIN = -32768;

  const defs = {
    TON: {
      title: 'On-delay timer',
      inputs: [['IN', 'BOOL'], ['PT', 'TIME']],
      outputs: [['Q', 'BOOL'], ['ET', 'TIME']],
      powerIn: 'IN', powerOut: 'Q',
      summary: 'Q turns TRUE after IN has been TRUE continuously for the preset time PT. ET shows the elapsed time.',
      exec(s, now) {
        if (s.IN) {
          if (!s._run) { s._run = true; s._start = now; }
          const el = now - s._start;
          s.ET = Math.min(el, s.PT);
          s.Q = el >= s.PT;
        } else {
          s._run = false; s.ET = 0; s.Q = false;
        }
      }
    },
    TOF: {
      title: 'Off-delay timer',
      inputs: [['IN', 'BOOL'], ['PT', 'TIME']],
      outputs: [['Q', 'BOOL'], ['ET', 'TIME']],
      powerIn: 'IN', powerOut: 'Q',
      summary: 'Q follows IN immediately when IN turns TRUE, and stays TRUE for PT after IN turns FALSE.',
      exec(s, now) {
        if (s.IN) {
          s.Q = true; s.ET = 0; s._run = false;
        } else {
          if (s.Q && !s._run) { s._run = true; s._start = now; }
          if (s._run) {
            const el = now - s._start;
            s.ET = Math.min(el, s.PT);
            if (el >= s.PT) { s.Q = false; s._run = false; }
          }
        }
      }
    },
    TP: {
      title: 'Pulse timer',
      inputs: [['IN', 'BOOL'], ['PT', 'TIME']],
      outputs: [['Q', 'BOOL'], ['ET', 'TIME']],
      powerIn: 'IN', powerOut: 'Q',
      summary: 'A rising edge on IN starts a pulse: Q is TRUE for exactly PT, no matter how long IN stays TRUE.',
      exec(s, now) {
        if (!s._run && s.IN && !s._prev) {
          s._run = true; s._start = now; s.Q = true;
        }
        if (s._run) {
          const el = now - s._start;
          s.ET = Math.min(el, s.PT);
          if (el >= s.PT) { s.Q = false; s._run = false; }
        }
        if (!s._run && !s.IN) s.ET = 0;
        s._prev = s.IN;
      }
    },
    TONR: {
      title: 'Retentive on-delay timer',
      inputs: [['IN', 'BOOL'], ['R', 'BOOL'], ['PT', 'TIME']],
      outputs: [['Q', 'BOOL'], ['ET', 'TIME']],
      powerIn: 'IN', powerOut: 'Q',
      summary: 'Accumulates the time IN is TRUE, keeping ET when IN turns FALSE. Q is TRUE once ET reaches PT. R resets ET to 0.',
      exec(s, now) {
        if (s.R) {
          s.ET = 0; s._last = null;
        } else if (s.IN) {
          if (s._last != null) s.ET = Math.min(s.PT, s.ET + (now - s._last));
          s._last = now;
        } else {
          s._last = null;
        }
        s.Q = !s.R && s.ET >= s.PT;
      }
    },
    CTU: {
      title: 'Up counter',
      inputs: [['CU', 'BOOL'], ['R', 'BOOL'], ['PV', 'INT']],
      outputs: [['Q', 'BOOL'], ['CV', 'INT']],
      powerIn: 'CU', powerOut: 'Q',
      summary: 'Each rising edge on CU adds 1 to CV. Q is TRUE when CV >= PV. R resets CV to 0.',
      exec(s) {
        if (s.R) s.CV = 0;
        else if (s.CU && !s._prevCU && s.CV < INT_MAX) s.CV++;
        s._prevCU = s.CU;
        s.Q = s.CV >= s.PV;
      }
    },
    CTD: {
      title: 'Down counter',
      inputs: [['CD', 'BOOL'], ['LD', 'BOOL'], ['PV', 'INT']],
      outputs: [['Q', 'BOOL'], ['CV', 'INT']],
      powerIn: 'CD', powerOut: 'Q',
      summary: 'LD loads CV with PV. Each rising edge on CD subtracts 1 from CV. Q is TRUE when CV <= 0.',
      exec(s) {
        if (s.LD) s.CV = s.PV;
        else if (s.CD && !s._prevCD && s.CV > INT_MIN) s.CV--;
        s._prevCD = s.CD;
        s.Q = s.CV <= 0;
      }
    },
    CTUD: {
      title: 'Up/down counter',
      inputs: [['CU', 'BOOL'], ['CD', 'BOOL'], ['R', 'BOOL'], ['LD', 'BOOL'], ['PV', 'INT']],
      outputs: [['QU', 'BOOL'], ['QD', 'BOOL'], ['CV', 'INT']],
      powerIn: 'CU', powerOut: 'QU',
      summary: 'Counts up on CU edges and down on CD edges. QU = CV >= PV, QD = CV <= 0. R resets to 0, LD loads PV.',
      exec(s) {
        if (s.R) s.CV = 0;
        else if (s.LD) s.CV = s.PV;
        else {
          if (s.CU && !s._prevCU && s.CV < INT_MAX) s.CV++;
          if (s.CD && !s._prevCD && s.CV > INT_MIN) s.CV--;
        }
        s._prevCU = s.CU; s._prevCD = s.CD;
        s.QU = s.CV >= s.PV;
        s.QD = s.CV <= 0;
      }
    },
    R_TRIG: {
      title: 'Rising edge detector',
      inputs: [['CLK', 'BOOL']],
      outputs: [['Q', 'BOOL']],
      powerIn: 'CLK', powerOut: 'Q',
      summary: 'Q is TRUE for exactly one scan when CLK changes from FALSE to TRUE.',
      exec(s) { s.Q = s.CLK && !s._m; s._m = s.CLK; }
    },
    F_TRIG: {
      title: 'Falling edge detector',
      inputs: [['CLK', 'BOOL']],
      outputs: [['Q', 'BOOL']],
      powerIn: 'CLK', powerOut: 'Q',
      summary: 'Q is TRUE for exactly one scan when CLK changes from TRUE to FALSE.',
      exec(s) { s.Q = !s.CLK && !!s._m; s._m = s.CLK; }
    },
    SR: {
      title: 'Set-dominant bistable',
      inputs: [['S1', 'BOOL'], ['R', 'BOOL']],
      outputs: [['Q1', 'BOOL']],
      powerIn: 'S1', powerOut: 'Q1',
      summary: 'S1 sets Q1, R resets it. If both are TRUE, set wins.',
      exec(s) { s.Q1 = s.S1 || (!s.R && s.Q1); }
    },
    RS: {
      title: 'Reset-dominant bistable',
      inputs: [['S', 'BOOL'], ['R1', 'BOOL']],
      outputs: [['Q1', 'BOOL']],
      powerIn: 'S', powerOut: 'Q1',
      summary: 'S sets Q1, R1 resets it. If both are TRUE, reset wins.',
      exec(s) { s.Q1 = !s.R1 && (s.S || s.Q1); }
    }
  };

  // Fill derived info used by the compiler and UI.
  for (const name of Object.keys(defs)) {
    const d = defs[name];
    d.name = name;
    d.std = true;
    d.members = {};
    for (const [n, t] of d.inputs) d.members[n] = { name: n, type: t, dir: 'in' };
    for (const [n, t] of d.outputs) d.members[n] = { name: n, type: t, dir: 'out' };
  }

  function create(name) {
    const d = defs[name];
    if (!d) return null;
    const inst = { _type: name };
    for (const [n, t] of d.inputs) inst[n] = PLC.types.ELEMENTARY[t].def;
    for (const [n, t] of d.outputs) inst[n] = PLC.types.ELEMENTARY[t].def;
    return inst;
  }

  PLC.fb = { defs, create };
})(window.PLC = window.PLC || {});
