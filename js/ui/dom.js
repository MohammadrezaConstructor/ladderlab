/* LadderLab — DOM helpers, icons, dialogs, menus and toasts (no browser alert/confirm/prompt). */
(function (PLC) {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';

  /** h('div.cls#id', {attrs, on:{click}}, ...children) */
  function h(sel, attrs, ...kids) {
    const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(sel) || [];
    const el = document.createElement(m[1] || 'div');
    (m[2] || '').replace(/([.#])([\w-]+)/g, (_, t, v) => { if (t === '.') el.classList.add(v); else el.id = v; });
    applyAttrs(el, attrs);
    append(el, kids);
    return el;
  }
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVGNS, tag);
    applyAttrs(el, attrs, true);
    append(el, kids);
    return el;
  }
  function applyAttrs(el, attrs, isSvg) {
    if (!attrs) return;
    for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === 'on') { for (const ev of Object.keys(v)) el.addEventListener(ev, v[ev]); }
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'class') { if (isSvg) el.setAttribute('class', v); else el.className = v; }
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (!isSvg && (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected')) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  function append(el, kids) {
    for (const k of kids.flat(Infinity)) {
      if (k === null || k === undefined || k === false) continue;
      el.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
    }
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  // ---- icons (24px grid, stroke-based) -----------------------------------------
  const ICONS = {
    run: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
    step: '<path d="M5 5v14l9-7z" fill="currentColor" stroke="none"/><rect x="16" y="5" width="3" height="14" rx="1" fill="currentColor" stroke="none"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h9"/>',
    branch: '<path d="M3 7h4M7 7h10M17 7h4M7 7v10h10V7"/>',
    rung: '<path d="M4 3v18M20 3v18M4 12h16"/>',
    comment: '<path d="M4 5h16v11H9l-5 4z"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
    folder: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    wave: '<path d="M3 17h4V7h5v10h4V7h5"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    reset: '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v4h4"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="1"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7v.5M12 17v.5"/>',
    text: '<path d="M5 6h14M12 6v13M9 19h6"/>',
    ladder: '<path d="M5 3v18M19 3v18M5 8h4M9 6v4M15 6v4M15 8h4M9 8h6M5 16h14"/>',
    play: '<path d="M8 5v14l11-7z"/>',
    stepRung: '<path d="M4 4v16M4 12h6"/><path d="M12 7l7 5-7 5z" fill="currentColor"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.9l7.6-3.8M8.2 13.1l7.6 3.8"/>',
    image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-9 8"/>',
    xref: '<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L20 20M7.5 10h5M10 7.5v5"/>'
  };
  function icon(name, size) {
    const sz = size || 18;
    const span = document.createElement('span');
    span.className = 'ico';
    span.innerHTML = '<svg viewBox="0 0 24 24" width="' + sz + '" height="' + sz + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
    return span;
  }

  function button(label, opts) {
    opts = opts || {};
    const b = h('button.btn' + (opts.cls ? '.' + opts.cls.split(' ').join('.') : ''), {
      type: 'button', title: opts.title || null, 'aria-label': opts.aria || (opts.iconOnly ? label : null),
      disabled: opts.disabled, on: opts.onClick ? { click: opts.onClick } : null, id: opts.id || null
    });
    if (opts.icon) b.appendChild(icon(opts.icon, opts.iconSize));
    if (!opts.iconOnly && label) b.appendChild(h('span', { text: label }));
    return b;
  }

  // ---- dialogs -----------------------------------------------------------------------
  let dialogLayer = null;
  function layer() {
    if (!dialogLayer) { dialogLayer = h('div.dialog-layer'); document.body.appendChild(dialogLayer); }
    return dialogLayer;
  }

  /** Generic modal. content: Node; buttons: [{label, value, primary, danger}]. Resolves with the clicked value. */
  function modal(title, content, buttons, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      const prevFocus = document.activeElement;
      const back = h('div.modal-back');
      const box = h('div.modal' + (opts.wide ? '.wide' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
      const close = (v) => {
        back.remove();
        document.removeEventListener('keydown', onKey, true);
        if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) { /* ignore */ }
        resolve(v);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(opts.cancelValue !== undefined ? opts.cancelValue : null); }
        if (e.key === 'Enter' && !(e.target && e.target.tagName === 'TEXTAREA') && opts.enterValue !== undefined) {
          e.preventDefault(); close(typeof opts.enterValue === 'function' ? opts.enterValue() : opts.enterValue);
        }
      };
      document.addEventListener('keydown', onKey, true);
      box.appendChild(h('div.modal-head', null, h('h2', { text: title }), button('Close', { icon: 'x', iconOnly: true, cls: 'ghost', onClick: () => close(opts.cancelValue !== undefined ? opts.cancelValue : null) })));
      box.appendChild(h('div.modal-body', null, content));
      if (buttons && buttons.length) {
        const foot = h('div.modal-foot');
        for (const b of buttons) {
          foot.appendChild(button(b.label, { cls: b.primary ? 'primary' : b.danger ? 'danger' : '', onClick: () => close(typeof b.value === 'function' ? b.value() : b.value) }));
        }
        box.appendChild(foot);
      }
      back.appendChild(box);
      back.addEventListener('pointerdown', e => { if (e.target === back) close(opts.cancelValue !== undefined ? opts.cancelValue : null); });
      layer().appendChild(back);
      const focusEl = box.querySelector('[autofocus]') || box.querySelector('.modal-foot .primary') || box.querySelector('button');
      if (focusEl) setTimeout(() => focusEl.focus(), 0);
    });
  }

  function confirm(title, message, okLabel, danger) {
    return modal(title, h('p', { text: message }), [
      { label: 'Cancel', value: false },
      { label: okLabel || 'OK', value: true, primary: !danger, danger: !!danger }
    ], { cancelValue: false, enterValue: true });
  }

  function alert(title, message) {
    const body = typeof message === 'string' ? h('p', { text: message }) : message;
    return modal(title, body, [{ label: 'OK', value: true, primary: true }], { cancelValue: true, enterValue: true });
  }

  function prompt(title, label, value, opts) {
    opts = opts || {};
    const input = h('input.input', { type: 'text', value: value || '', autofocus: true, spellcheck: 'false', 'aria-label': label });
    const err = h('div.field-error');
    const body = h('label.field', null, h('span', { text: label }), input, err);
    return modal(title, body, [
      { label: 'Cancel', value: null },
      { label: opts.ok || 'OK', value: () => input.value, primary: true }
    ], { cancelValue: null, enterValue: () => input.value });
  }

  // ---- toasts -------------------------------------------------------------------------
  let toastBox = null;
  function toast(message, kind, ms) {
    if (!toastBox) { toastBox = h('div.toasts', { role: 'status', 'aria-live': 'polite' }); document.body.appendChild(toastBox); }
    const t = h('div.toast' + (kind ? '.' + kind : ''), { text: message });
    toastBox.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms || 2600);
  }

  // ---- dropdown menus -----------------------------------------------------------------
  let openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; document.removeEventListener('pointerdown', outside, true); } }
  function outside(e) { if (openMenu && !openMenu.contains(e.target)) closeMenu(); }
  /** items: [{label, icon, onClick, disabled, checked, sep, hint}] */
  function menu(anchor, items, opts) {
    closeMenu();
    opts = opts || {};
    const m = h('div.menu', { role: 'menu' });
    for (const it of items) {
      if (it.sep) { m.appendChild(h('div.menu-sep')); continue; }
      if (it.header) { m.appendChild(h('div.menu-header', { text: it.header })); continue; }
      const b = h('button.menu-item' + (it.checked ? '.checked' : ''), { type: 'button', role: 'menuitem', disabled: it.disabled });
      b.appendChild(it.icon ? icon(it.icon, 16) : h('span.ico-space'));
      b.appendChild(h('span.menu-label', { text: it.label }));
      if (it.hint) b.appendChild(h('span.menu-hint', { text: it.hint }));
      b.addEventListener('click', () => { closeMenu(); if (it.onClick) it.onClick(); });
      m.appendChild(b);
    }
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    const mw = m.offsetWidth, mh = m.offsetHeight;
    let x = opts.alignRight ? r.right - mw : r.left;
    let y = r.bottom + 4;
    if (x + mw > window.innerWidth - 8) x = window.innerWidth - mw - 8;
    if (y + mh > window.innerHeight - 8) y = Math.max(8, r.top - mh - 4);
    m.style.left = Math.max(8, x) + 'px';
    m.style.top = y + 'px';
    openMenu = m;
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
    const first = m.querySelector('.menu-item:not([disabled])');
    if (first) first.focus();
    m.addEventListener('keydown', e => {
      const items = Array.from(m.querySelectorAll('.menu-item:not([disabled])'));
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(); anchor.focus(); }
    });
    return m;
  }

  /** Tabs: returns {el, select(id)}; tabs: [{id, label, icon}] */
  function tabs(list, onSelect, cls) {
    const el = h('div.tabs' + (cls ? '.' + cls : ''), { role: 'tablist' });
    const btns = {};
    for (const t of list) {
      const b = h('button.tab', { type: 'button', role: 'tab', dataset: { id: t.id }, title: t.title || null });
      if (t.icon) b.appendChild(icon(t.icon, 16));
      b.appendChild(h('span', { text: t.label }));
      if (t.badge !== undefined) { const bd = h('span.badge'); b.appendChild(bd); t.badgeEl = bd; }
      b.addEventListener('click', () => api.select(t.id));
      btns[t.id] = b;
      el.appendChild(b);
    }
    const api = {
      el, current: null, btns,
      select(id, silent) {
        api.current = id;
        for (const k of Object.keys(btns)) { btns[k].classList.toggle('active', k === id); btns[k].setAttribute('aria-selected', k === id ? 'true' : 'false'); }
        if (!silent && onSelect) onSelect(id);
      },
      badge(id, text, kind) {
        const b = btns[id];
        if (!b) return;
        let bd = b.querySelector('.badge');
        if (!bd) { bd = h('span.badge'); b.appendChild(bd); }
        bd.textContent = text || '';
        bd.className = 'badge' + (kind ? ' ' + kind : '');
        bd.hidden = !text;
      }
    };
    return api;
  }

  /** Download a text file. Returns false where downloads are blocked. */
  function download(filename, text, mime) {
    try {
      const blob = new Blob([text], { type: mime || 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
      return true;
    } catch (e) { return false; }
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    const ta = h('textarea', { style: { position: 'fixed', left: '-9999px' } });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  PLC.dom = { h, s, clear, icon, button, modal, confirm, alert, prompt, toast, menu, closeMenu, tabs, download, copyText, ICONS };
})(window.PLC = window.PLC || {});
