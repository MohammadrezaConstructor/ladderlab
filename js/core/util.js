/* LadderLab — shared helpers.
 * Every file attaches to the global PLC namespace so the app runs from file:// without a build step. */
(function (PLC) {
  'use strict';

  let counter = 0;

  const util = {
    uid(prefix) {
      counter = (counter + 1) % 1679616;
      return (prefix || 'n') + Math.random().toString(36).slice(2, 8) + counter.toString(36);
    },

    clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },

    clone(obj) { return obj === undefined ? undefined : JSON.parse(JSON.stringify(obj)); },

    escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    debounce(fn, ms) {
      let t = null;
      const d = function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
      d.flush = function (...args) { clearTimeout(t); fn.apply(this, args); };
      d.cancel = () => clearTimeout(t);
      return d;
    },

    /** IEC identifiers: letter or underscore, then letters, digits, single underscores. */
    isIdentifier(name) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !/__/.test(name); },

    storage: {
      get(key, fallback) {
        try {
          const raw = window.localStorage.getItem(key);
          return raw == null ? fallback : JSON.parse(raw);
        } catch (e) { return fallback; }
      },
      set(key, value) {
        try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
      },
      remove(key) { try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ } }
    }
  };

  class Emitter {
    constructor() { this._handlers = {}; }
    on(evt, fn) {
      (this._handlers[evt] = this._handlers[evt] || []).push(fn);
      return () => this.off(evt, fn);
    }
    off(evt, fn) {
      const list = this._handlers[evt];
      if (list) this._handlers[evt] = list.filter(f => f !== fn);
    }
    emit(evt, ...args) {
      const list = this._handlers[evt];
      if (!list) return;
      for (const fn of list.slice()) {
        try { fn(...args); } catch (e) { console.error('Handler for "' + evt + '" failed:', e); }
      }
    }
  }

  util.Emitter = Emitter;
  PLC.util = util;
})(window.PLC = window.PLC || {});
