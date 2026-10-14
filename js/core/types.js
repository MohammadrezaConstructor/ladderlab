/* LadderLab — IEC 61131-3 elementary data types, literals, I/O addresses. */
(function (PLC) {
  'use strict';

  const ELEMENTARY = {
    BOOL:  { cat: 'bool',   def: false, desc: 'Boolean: TRUE or FALSE (one bit)' },
    BYTE:  { cat: 'bits',   def: 0, bits: 8,  min: 0, max: 255, desc: '8-bit bit string (0..255)' },
    WORD:  { cat: 'bits',   def: 0, bits: 16, min: 0, max: 65535, desc: '16-bit bit string (0..65535)' },
    SINT:  { cat: 'int',    def: 0, bits: 8,  min: -128, max: 127, desc: 'Short integer (-128..127)' },
    INT:   { cat: 'int',    def: 0, bits: 16, min: -32768, max: 32767, desc: 'Integer (-32768..32767)' },
    UINT:  { cat: 'int',    def: 0, bits: 16, min: 0, max: 65535, unsigned: true, desc: 'Unsigned integer (0..65535)' },
    DINT:  { cat: 'int',    def: 0, bits: 32, min: -2147483648, max: 2147483647, desc: 'Double integer (32-bit)' },
    REAL:  { cat: 'real',   def: 0, desc: 'Floating point number' },
    LREAL: { cat: 'real',   def: 0, desc: 'Long floating point number' },
    TIME:  { cat: 'time',   def: 0, desc: 'Duration, e.g. T#2s500ms (stored in ms)' },
    STRING:{ cat: 'string', def: '', desc: 'Character string, e.g. \'Hello\'' }
  };

  function wrapInt(v, info) {
    v = Math.trunc(Number(v));
    if (!isFinite(v)) v = 0;
    if (info.bits === 32 && !info.unsigned) return v | 0;
    const span = Math.pow(2, info.bits);
    v = ((v - info.min) % span + span) % span + info.min;
    return v;
  }

  function coerce(typeName, v) {
    const info = ELEMENTARY[typeName];
    if (!info) return v;
    switch (info.cat) {
      case 'bool': return typeof v === 'number' ? v !== 0 : !!v;
      case 'bits':
      case 'int': return wrapInt(typeof v === 'boolean' ? (v ? 1 : 0) : v, info);
      case 'real': return typeof v === 'boolean' ? (v ? 1 : 0) : Number(v);
      case 'time': { const n = Math.trunc(Number(v)); return isFinite(n) ? n : 0; }
      case 'string': return v == null ? '' : String(v);
    }
    return v;
  }

  // ---- TIME literals -------------------------------------------------------
  const TIME_UNITS = { d: 86400000, h: 3600000, m: 60000, s: 1000, ms: 1 };

  /** Parse the part after T# / TIME#, e.g. "1m30s", "2.5s", "-100ms". Returns ms or null. */
  function parseDuration(body) {
    let s = String(body).replace(/_/g, '').toLowerCase().trim();
    if (!s) return null;
    let sign = 1;
    if (s[0] === '-') { sign = -1; s = s.slice(1); }
    const re = /(\d+(?:\.\d+)?)(ms|d|h|m|s)/g;
    let total = 0, pos = 0, m, seen = false;
    while ((m = re.exec(s)) !== null) {
      if (m.index !== pos) return null;
      total += parseFloat(m[1]) * TIME_UNITS[m[2]];
      pos = re.lastIndex;
      seen = true;
    }
    if (!seen || pos !== s.length) return null;
    return Math.round(total) * sign;
  }

  function parseTimeLiteral(text) {
    const m = /^\s*(?:T|TIME)#(.+?)\s*$/i.exec(String(text));
    return m ? parseDuration(m[1]) : null;
  }

  function formatTime(ms) {
    ms = Math.trunc(ms || 0);
    if (ms === 0) return 'T#0ms';
    let out = ms < 0 ? 'T#-' : 'T#';
    let r = Math.abs(ms);
    const parts = [['d', 86400000], ['h', 3600000], ['m', 60000], ['s', 1000], ['ms', 1]];
    for (const [u, f] of parts) {
      if (r >= f) { out += Math.floor(r / f) + u; r %= f; }
    }
    return out;
  }

  // ---- Type descriptors ----------------------------------------------------
  // { k:'elem', name } | { k:'array', lo, hi, of } | { k:'fb', name } | { k:'string', len }

  function parseTypeString(str) {
    const s = String(str || '').trim();
    const arr = /^ARRAY\s*\[\s*(-?\d+)\s*\.\.\s*(-?\d+)\s*\]\s*OF\s+(.+)$/i.exec(s);
    if (arr) {
      const lo = parseInt(arr[1], 10), hi = parseInt(arr[2], 10);
      const of = parseTypeString(arr[3]);
      if (!of || hi < lo || hi - lo > 9999) return null;
      if (of.k === 'array') return null;
      return { k: 'array', lo, hi, of };
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) return null;
    const up = s.toUpperCase();
    if (ELEMENTARY[up]) return { k: 'elem', name: up };
    return { k: 'fb', name: up };
  }

  function typeToString(t) {
    if (!t) return '?';
    if (t.k === 'array') return 'ARRAY[' + t.lo + '..' + t.hi + '] OF ' + typeToString(t.of);
    return t.name;
  }

  function isElementary(name) { return !!ELEMENTARY[String(name).toUpperCase()]; }
  function category(name) { const i = ELEMENTARY[name]; return i ? i.cat : null; }

  // ---- Values --------------------------------------------------------------
  function formatValue(typeName, v) {
    if (v === undefined || v === null) return '—';
    const cat = category(typeName);
    switch (cat) {
      case 'bool': return v ? 'TRUE' : 'FALSE';
      case 'time': return formatTime(v);
      case 'real': {
        if (!isFinite(v)) return String(v);
        const r = Math.round(v * 10000) / 10000;
        return Number.isInteger(r) ? r.toFixed(1) : String(r);
      }
      case 'string': return "'" + v + "'";
      case 'bits': return String(v);
      default: return String(v);
    }
  }

  /** Parse what a user typed into a watch field for a given elementary type. Returns {ok, value, error}. */
  function parseValueForType(typeName, text) {
    const s = String(text).trim();
    const cat = category(typeName);
    if (cat === 'bool') {
      const u = s.toUpperCase();
      if (u === 'TRUE' || u === '1' || u === 'ON') return { ok: true, value: true };
      if (u === 'FALSE' || u === '0' || u === 'OFF') return { ok: true, value: false };
      return { ok: false, error: 'Enter TRUE or FALSE' };
    }
    if (cat === 'time') {
      let ms = parseTimeLiteral(s);
      if (ms === null) ms = parseDuration(s);
      if (ms === null && /^-?\d+$/.test(s)) ms = parseInt(s, 10);
      return ms === null ? { ok: false, error: 'Enter a duration like T#2s or 500ms' } : { ok: true, value: ms };
    }
    if (cat === 'string') return { ok: true, value: s.replace(/^'(.*)'$/, '$1') };
    if (cat === 'int' || cat === 'bits') {
      let n;
      const based = /^(2|8|16)#([0-9A-Fa-f_]+)$/.exec(s);
      if (based) n = parseInt(based[2].replace(/_/g, ''), parseInt(based[1], 10));
      else if (/^[+-]?\d+$/.test(s.replace(/_/g, ''))) n = parseInt(s.replace(/_/g, ''), 10);
      else return { ok: false, error: 'Enter a whole number' };
      const info = ELEMENTARY[typeName];
      if (n < info.min || n > info.max) return { ok: false, error: typeName + ' range is ' + info.min + '..' + info.max };
      return { ok: true, value: n };
    }
    if (cat === 'real') {
      const n = Number(s);
      return s !== '' && isFinite(n) ? { ok: true, value: n } : { ok: false, error: 'Enter a number' };
    }
    return { ok: false, error: 'Cannot edit this type' };
  }

  // ---- I/O addressing ------------------------------------------------------
  // The simulated PLC has 16 digital inputs (%IX0.0..%IX1.7), 16 digital outputs (%QX0.0..%QX1.7),
  // 4 analog inputs (%IW0..%IW3) and 4 analog outputs (%QW0..%QW3). Analog range is 0..1000.
  const IO = { DI: 16, DO: 16, AI: 4, AO: 4, ANALOG_MAX: 1000 };

  function parseAddress(addr) {
    const s = String(addr || '').trim().toUpperCase();
    let m = /^%([IQ])X?(\d+)\.([0-7])$/.exec(s);
    if (m) {
      const index = parseInt(m[2], 10) * 8 + parseInt(m[3], 10);
      const area = m[1] === 'I' ? 'I' : 'Q';
      if (index >= (area === 'I' ? IO.DI : IO.DO)) return null;
      return { area, index, type: 'BOOL', text: '%' + m[1] + 'X' + m[2] + '.' + m[3] };
    }
    m = /^%([IQ])W(\d+)$/.exec(s);
    if (m) {
      const index = parseInt(m[2], 10);
      const area = m[1] === 'I' ? 'IW' : 'QW';
      if (index >= (area === 'IW' ? IO.AI : IO.AO)) return null;
      return { area, index, type: 'INT', text: '%' + m[1] + 'W' + index };
    }
    return null;
  }

  function addressText(area, index) {
    if (area === 'I' || area === 'Q') return '%' + area + 'X' + Math.floor(index / 8) + '.' + (index % 8);
    return '%' + (area === 'IW' ? 'I' : 'Q') + 'W' + index;
  }

  function allAddresses() {
    const out = [];
    for (let i = 0; i < IO.DI; i++) out.push(addressText('I', i));
    for (let i = 0; i < IO.DO; i++) out.push(addressText('Q', i));
    for (let i = 0; i < IO.AI; i++) out.push(addressText('IW', i));
    for (let i = 0; i < IO.AO; i++) out.push(addressText('QW', i));
    return out;
  }

  PLC.types = {
    ELEMENTARY, IO, coerce, parseDuration, parseTimeLiteral, formatTime,
    parseTypeString, typeToString, isElementary, category, formatValue, parseValueForType,
    parseAddress, addressText, allAddresses
  };
})(window.PLC = window.PLC || {});
