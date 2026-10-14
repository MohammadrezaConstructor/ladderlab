/* LadderLab — application controller. */
(function (PLC) {
  'use strict';
  const { h, button, icon, clear, menu } = PLC.dom;
  const store = PLC.util.storage;

  const KEY_SANDBOX = 'ladderlab.sandbox';
  const KEY_LESSON = 'ladderlab.lesson.';
  const KEY_PROGRESS = 'ladderlab.progress';
  const KEY_UI = 'ladderlab.ui';

  class App extends PLC.util.Emitter {
    constructor() {
      super();
      this.rt = new PLC.Runtime();
      this.rt.trace = new PLC.Trace(8000);
      this.history = [];
      this.future = [];
      this.project = null;
      this.compiled = null;
      this.diagnostics = [];
      this.activePou = null;
      this.workspace = { kind: 'sandbox' };
      this.progress = store.get(KEY_PROGRESS, {}) || {};
      this.ui = Object.assign({ rail: 'lessons', dock: 'tags', side: 'watch', railW: 330, sideW: 520, dockH: 230, sceneH: 55, theme: null }, store.get(KEY_UI, {}) || {});
      this.saveSoon = PLC.util.debounce(() => this.saveNow(), 600);
      this.compileSoon = PLC.util.debounce(() => this.recompile(), 260);
      this.saveUiSoon = PLC.util.debounce(() => store.set(KEY_UI, this.ui), 400);
    }

    // =================================================================== startup
    init(root) {
      this.applyTheme(this.ui.theme);
      this.buildLayout(root);
      this.rt.on('state', () => this.onState());
      this.rt.on('fault', f => {
        PLC.dom.toast('PLC fault: ' + f.message, 'error', 5000);
        this.messages.render();
        this.updateBadges();
        if (this.activePou && this.activePou.lang === 'ST') this.stEditor.renderDiagnostics();
        this.dockTabs.select('messages');
      });
      const last = store.get(KEY_UI, {}) || {};
      if (last.workspace && last.workspace.kind === 'lesson' && PLC.lessons.get(last.workspace.id)) this.openLesson(last.workspace.id, true);
      else this.openSandbox(true);
      this.bindKeys();
      this.onState();
      this.updateScanInfo();
      this.loop();
      const linked = /^#(lesson|project)=/.test(location.hash || '');
      if (linked) setTimeout(() => this.openFromHash(), 200);
      else if (!last.welcomed) setTimeout(() => this.welcome(), 300);
      window.addEventListener('hashchange', () => this.openFromHash());
    }

    // =================================================================== layout
    buildLayout(root) {
      const app = this;
      // top bar
      const brand = h('div.brand', null, h('span.brand-mark', { 'aria-hidden': 'true' }, icon('ladder', 20)), h('span.brand-name', { text: 'LadderLab' }));
      this.wsTitle = h('div.ws-title');
      const fileBtn = button('Project', { icon: 'folder', cls: 'ghost', onClick: () => this.fileMenu(fileBtn) });
      const shareBtn = button('Share', { icon: 'share', iconOnly: true, cls: 'ghost', title: 'Share a link to this lesson or project', onClick: () => this.shareMenu(shareBtn) });
      this.undoBtn = button('Undo', { icon: 'undo', iconOnly: true, cls: 'ghost', title: 'Undo (Ctrl+Z)', onClick: () => this.undo() });
      this.redoBtn = button('Redo', { icon: 'redo', iconOnly: true, cls: 'ghost', title: 'Redo (Ctrl+Y)', onClick: () => this.redo() });
      this.runBtn = button('Run', { icon: 'run', cls: 'run-btn', title: 'Switch the PLC to RUN (F5)', onClick: () => this.toggleRun() });
      this.pauseBtn = button('Pause', { icon: 'pause', iconOnly: true, cls: 'ghost', title: 'Pause the simulation (time stands still)', onClick: () => this.togglePause() });
      this.stepBtn = button('Single scan', { icon: 'step', iconOnly: true, cls: 'ghost', title: 'Execute exactly one scan cycle (F10)', onClick: () => this.stepScan() });
      this.phaseBtn = button('Step', { icon: 'stepRung', iconOnly: true, cls: 'ghost', title: 'Scan debugger: run only the next part of the scan (read inputs, one rung, write outputs) (F11)', onClick: () => this.stepPhase() });
      this.speedSel = h('select.input.sm', { title: 'Simulation speed', 'aria-label': 'Simulation speed' });
      for (const v of [0.1, 0.25, 0.5, 1, 2, 5]) this.speedSel.appendChild(h('option', { value: v, text: v + '×' }));
      this.speedSel.value = '1';
      this.speedSel.addEventListener('change', () => { this.rt.speed = parseFloat(this.speedSel.value); });
      this.statePill = h('span.state-pill', { role: 'status' });
      this.scanInfo = h('span.scan-info');
      const themeBtn = button('Theme', { icon: 'moon', iconOnly: true, cls: 'ghost', title: 'Switch light / dark theme', onClick: () => this.cycleTheme() });
      const helpBtn = button('Help', { icon: 'help', iconOnly: true, cls: 'ghost', title: 'Quick start', onClick: () => this.welcome() });
      const top = h('header.topbar', null, brand, this.wsTitle, h('div.tb-sep'), fileBtn, shareBtn, this.undoBtn, this.redoBtn,
        h('div.tb-flex'),
        h('div.run-group', null, this.runBtn, this.pauseBtn, this.phaseBtn, this.stepBtn, this.speedSel),
        h('div.plc-status', null, this.statePill, this.scanInfo),
        h('div.tb-flex'), themeBtn, helpBtn);

      // left rail
      this.railTabs = PLC.dom.tabs([
        { id: 'lessons', label: 'Lessons', icon: 'book' },
        { id: 'project', label: 'Project', icon: 'folder' },
        { id: 'ref', label: 'Reference', icon: 'info' }
      ], id => this.showRail(id), 'rail-tabs');
      this.railBody = h('div.rail-body');
      this.lessonHost = h('div.rail-pane');
      this.projectHost = h('div.rail-pane');
      this.refHost = h('div.rail-pane');
      this.railBody.append(this.lessonHost, this.projectHost, this.refHost);
      const rail = h('aside.rail', { 'aria-label': 'Lessons, project and reference' }, this.railTabs.el, this.railBody);

      // center
      this.pouTabs = h('div.pou-tabs', { role: 'tablist', 'aria-label': 'Programs' });
      this.editorHost = h('div.editor-host');
      this.faultBar = h('div.fault-bar', { hidden: true, role: 'alert' });
      this.ldHost = h('div.editor-pane');
      this.stHost = h('div.editor-pane');
      this.scanStrip = h('div.scan-strip', { hidden: true, role: 'region', 'aria-label': 'Scan cycle debugger' });
      this.editorHost.append(this.faultBar, this.scanStrip, this.ldHost, this.stHost);
      this.dockTabs = PLC.dom.tabs([
        { id: 'tags', label: 'Tags', icon: 'list' },
        { id: 'messages', label: 'Messages', icon: 'info' },
        { id: 'trace', label: 'Timing diagram', icon: 'wave' },
        { id: 'stview', label: 'ST equivalent', icon: 'text' }
      ], id => this.showDock(id), 'dock-tabs');
      this.dockBody = h('div.dock-body');
      this.tagsHost = h('div.dock-pane'); this.msgHost = h('div.dock-pane'); this.traceHost = h('div.dock-pane'); this.stviewHost = h('div.dock-pane');
      this.dockBody.append(this.tagsHost, this.msgHost, this.traceHost, this.stviewHost);
      const dock = h('section.dock', { 'aria-label': 'Tags, messages and timing diagram' }, this.dockTabs.el, this.dockBody);
      const center = h('main.center', null, this.pouTabs, this.editorHost, h('div.split-h', { 'data-split': 'dock', role: 'separator', 'aria-orientation': 'horizontal', title: 'Drag to resize' }), dock);

      // right side
      this.simHost = h('div.sim-host');
      this.watchHost = h('div.watch-host');
      const side = h('section.side', { 'aria-label': 'Machine and watch window' }, this.simHost,
        h('div.split-h', { 'data-split': 'scene', role: 'separator', 'aria-orientation': 'horizontal', title: 'Drag to resize' }),
        h('div.side-head', null, h('span.panel-title', { text: 'Watch' }), h('span.small.muted', { text: 'live values' })), this.watchHost);

      this.shell = h('div.shell', null, top,
        h('div.workspace', null, rail,
          h('div.split-v', { 'data-split': 'rail', role: 'separator', 'aria-orientation': 'vertical', title: 'Drag to resize' }),
          center,
          h('div.split-v', { 'data-split': 'side', role: 'separator', 'aria-orientation': 'vertical', title: 'Drag to resize' }),
          side));
      root.appendChild(this.shell);
      this.applySizes();
      this.bindSplitters();

      // components
      this.ladderEditor = new PLC.LadderEditor(this, this.ldHost);
      this.stEditor = new PLC.STEditor(this, this.stHost);
      this.tags = new PLC.panels.TagsPanel(this, this.tagsHost);
      this.messages = new PLC.panels.MessagesPanel(this, this.msgHost);
      this.trace = new PLC.TracePanel(this, this.traceHost);
      this.stview = new PLC.panels.STViewPanel(this, this.stviewHost);
      this.watch = new PLC.panels.WatchPanel(this, this.watchHost);
      this.sim = new PLC.SimPanel(this, this.simHost);
      this.lessons = new PLC.LessonPanel(this, this.lessonHost);
      this.reference = new PLC.ReferencePanel(this, this.refHost);
      this.projectPanel = h('div.project-panel');
      this.projectHost.appendChild(this.projectPanel);

      this.railTabs.select(this.ui.rail || 'lessons');
      this.dockTabs.select(this.ui.dock || 'tags');
      window.addEventListener('resize', () => { this.ladderEditor.render(); });
      void app;
    }

    applySizes() {
      const st = this.shell.style;
      st.setProperty('--rail-w', this.ui.railW + 'px');
      st.setProperty('--side-w', this.ui.sideW + 'px');
      st.setProperty('--dock-h', this.ui.dockH + 'px');
      st.setProperty('--scene-h', this.ui.sceneH + '%');
    }

    bindSplitters() {
      this.shell.querySelectorAll('[data-split]').forEach(sp => {
        sp.addEventListener('pointerdown', e => {
          e.preventDefault();
          const kind = sp.getAttribute('data-split');
          const start = { x: e.clientX, y: e.clientY, railW: this.ui.railW, sideW: this.ui.sideW, dockH: this.ui.dockH, sceneH: this.ui.sceneH };
          const sideEl = this.shell.querySelector('.side');
          sp.setPointerCapture(e.pointerId);
          document.body.classList.add('resizing');
          const move = ev => {
            if (kind === 'rail') this.ui.railW = Math.max(240, Math.min(620, start.railW + ev.clientX - start.x));
            if (kind === 'side') this.ui.sideW = Math.max(300, Math.min(900, start.sideW - (ev.clientX - start.x)));
            if (kind === 'dock') this.ui.dockH = Math.max(110, Math.min(window.innerHeight - 260, start.dockH - (ev.clientY - start.y)));
            if (kind === 'scene') { const hgt = sideEl.clientHeight; this.ui.sceneH = Math.max(20, Math.min(85, start.sceneH + (ev.clientY - start.y) / hgt * 100)); }
            this.applySizes();
          };
          const up = () => {
            sp.removeEventListener('pointermove', move);
            sp.removeEventListener('pointerup', up);
            document.body.classList.remove('resizing');
            this.saveUiSoon();
            this.ladderEditor.render();
            this.sim.resize();
          };
          sp.addEventListener('pointermove', move);
          sp.addEventListener('pointerup', up);
        });
      });
    }

    showRail(id) {
      this.ui.rail = id; this.saveUiSoon();
      this.lessonHost.hidden = id !== 'lessons';
      this.projectHost.hidden = id !== 'project';
      this.refHost.hidden = id !== 'ref';
      if (!this.project) return;
      if (id === 'ref') this.reference.render();
      if (id === 'project') this.renderProjectPanel();
      if (id === 'lessons') this.lessons.render();
    }

    showDock(id) {
      this.ui.dock = id; this.saveUiSoon();
      this.tagsHost.hidden = id !== 'tags';
      this.msgHost.hidden = id !== 'messages';
      this.traceHost.hidden = id !== 'trace';
      this.stviewHost.hidden = id !== 'stview';
      if (!this.project) return;
      if (id === 'tags') this.tags.render();
      if (id === 'messages') this.messages.render();
      if (id === 'stview') this.stview.render();
      if (id === 'trace') requestAnimationFrame(() => this.trace.draw());
    }

    // =================================================================== themes
    applyTheme(t) {
      // only an explicit choice sets the attribute; otherwise keep whatever the host page decided
      if (t) document.documentElement.setAttribute('data-theme', t);
    }
    cycleTheme() {
      const dark = getComputedStyle(document.documentElement).getPropertyValue('--is-dark').trim() === '1';
      this.ui.theme = dark ? 'light' : 'dark';
      this.applyTheme(this.ui.theme);
      this.saveUiSoon();
      this.sim.refreshTheme();
      this.trace.draw();
    }

    // =================================================================== workspaces
    openSandbox(initial) {
      this.saveNow();
      let p = null;
      try { const raw = store.get(KEY_SANDBOX, null); if (raw) p = PLC.project.normalize(raw); } catch (e) { p = null; }
      if (!p) p = this.defaultSandbox();
      this.workspace = { kind: 'sandbox' };
      this.loadProject(p);
      this.rememberWorkspace();
      if (!initial) this.railTabs.select('project');
      else this.lessons.render();
    }

    defaultSandbox() {
      const p = PLC.project.create({ name: 'My first project', scene: 'trainer' });
      const scene = PLC.scenes.get('trainer');
      p.tags = PLC.util.clone(scene.tags.filter(t => /^(Switch[1-4]|Button[1-4]|Lamp[1-4])$/.test(t.name)));
      p.pous[0].rungs = PLC.ladder.rungsFromSpec([{ comment: 'Lamp 1 follows switch 1. Press Run, then flip the switch.', text: 'NO(Switch1) COIL(Lamp1)' }, '']);
      p.trace = ['Switch1', 'Lamp1'];
      return p;
    }

    openLesson(id, initial) {
      const lesson = PLC.lessons.get(id);
      if (!lesson) return;
      this.saveNow();
      let p = null;
      try { const raw = store.get(KEY_LESSON + id, null); if (raw) p = PLC.project.normalize(raw); } catch (e) { p = null; }
      if (!p) p = PLC.lessons.makeProject(lesson, 'starter');
      this.workspace = { kind: 'lesson', id };
      this.loadProject(p);
      this.rememberWorkspace();
      this.railTabs.select('lessons');
      this.lessons.render();
      const pane = this.lessonHost;
      pane.scrollTop = 0;
      if (!initial && this.isNarrow()) this.shell.querySelector('.rail').scrollIntoView();
    }

    showCourseMap() {
      this.lessons.renderMap();
    }

    rememberWorkspace() { this.ui.workspace = this.workspace; this.saveUiSoon(); }

    storageKey() { return this.workspace.kind === 'lesson' ? KEY_LESSON + this.workspace.id : KEY_SANDBOX; }

    saveNow() {
      if (!this.project) return;
      this.saveSoon.cancel();
      store.set(this.storageKey(), this.project);
    }

    async resetLesson(lesson) {
      const ok = await PLC.dom.confirm('Reset exercise', 'Throw away your program for "' + lesson.title + '" and start again from the beginning?', 'Reset', true);
      if (!ok) return;
      this.loadProject(PLC.lessons.makeProject(lesson, 'starter'));
      this.saveNow();
      this.lessons.results = null;
      this.lessons.render();
    }

    async showSolution(lesson) {
      const ok = await PLC.dom.confirm('Show solution', 'Load the reference solution into the editor? Your own program is replaced, but you can get it back with Undo.', 'Load solution');
      if (!ok) return;
      const sol = PLC.lessons.makeProject(lesson, 'solution');
      this.progress[lesson.id] = Object.assign({}, this.progress[lesson.id], { solutionShown: true });
      store.set(KEY_PROGRESS, this.progress);
      this.mutate('Load solution', () => {
        this.project.tags = sol.tags;
        this.project.pous = sol.pous;
      }, { structure: true });
      PLC.dom.toast('Solution loaded. Press Run to try it, or Undo to get your program back.', 'info', 4000);
    }

    markDone(id) {
      this.progress[id] = Object.assign({}, this.progress[id], { done: true, at: Date.now() });
      store.set(KEY_PROGRESS, this.progress);
    }
    saveQuiz(id, qi, right) {
      const p = this.progress[id] = Object.assign({ quiz: {} }, this.progress[id]);
      p.quiz = Object.assign({}, p.quiz, { [qi]: right });
      store.set(KEY_PROGRESS, this.progress);
    }

    // =================================================================== project
    loadProject(p) {
      if (this.rt.state !== 'STOP') this.rt.stop();
      this.rt.clearForces();
      this.project = p;
      this.history = []; this.future = [];
      this.activePou = p.pous[0];
      this.rt.scanTime = p.scanTime || 10;
      this.rt.mem = null; this.rt.compiled = null;
      this.rt.trace.clear();
      this.setScene(p.scene);
      this.recompile();
      this.renderAll();
    }

    renderAll() {
      this.renderPouTabs();
      this.showPou();
      this.tags.render();
      this.messages.render();
      this.stview.render();
      this.watch.build();
      this.renderWsTitle();
      if (this.ui.rail === 'project') this.renderProjectPanel();
      this.updateUndo();
      this.trace.draw();
    }

    renderWsTitle() {
      clear(this.wsTitle);
      if (this.workspace.kind === 'lesson') {
        const l = PLC.lessons.get(this.workspace.id);
        this.wsTitle.append(h('span.ws-kind', { text: 'Lesson' }), h('span.ws-name', { text: l ? l.title : '' }));
      } else {
        this.wsTitle.append(h('span.ws-kind', { text: 'Sandbox' }), h('span.ws-name', { text: this.project.name }));
      }
    }

    /** Record an undo step, apply fn, then recompile and refresh. */
    mutate(label, fn, opts) {
      opts = opts || {};
      const now = Date.now();
      const last = this.history[this.history.length - 1];
      if (!(opts.coalesce && last && last.coalesce === opts.coalesce && now - last.at < 4000)) {
        this.history.push({ label, snap: JSON.stringify({ tags: this.project.tags, pous: this.project.pous, scene: this.project.scene, name: this.project.name, trace: this.project.trace, scanTime: this.project.scanTime }), coalesce: opts.coalesce, at: now });
        if (this.history.length > 200) this.history.shift();
        this.future = [];
      } else last.at = now;
      fn();
      this.changed(opts);
    }

    changed(opts) {
      opts = opts || {};
      if (!this.project.pous.includes(this.activePou)) this.activePou = this.project.pous[0];
      this.recompile();
      this.saveSoon();
      if (opts.structure) this.renderAll();
      else {
        if (this.activePou.lang === 'LD' && opts.render !== false) this.ladderEditor.render();
        if (this.activePou.lang === 'ST') this.stEditor.sync();
        if (!this.tagsHost.hidden && !this.tagsHost.contains(document.activeElement)) this.tags.render();
        if (!this.stviewHost.hidden) this.stview.render();
        this.sim.updateNames();
      }
      this.updateUndo();
    }

    sourceChanged(pou, prevSrc) {
      const now = Date.now();
      const last = this.history[this.history.length - 1];
      const key = 'src-' + pou.id;
      if (!(last && last.coalesce === key && now - last.at < 1500)) {
        // the snapshot must hold the text from before this burst of typing
        const pous = this.project.pous.map(p => p === pou ? Object.assign({}, p, { source: prevSrc }) : p);
        this.history.push({ label: 'Edit code', snap: JSON.stringify({ tags: this.project.tags, pous, scene: this.project.scene, name: this.project.name, trace: this.project.trace, scanTime: this.project.scanTime }), coalesce: key, at: now });
        if (this.history.length > 200) this.history.shift();
        this.future = [];
      } else last.at = now;
      this.compileSoon();
      this.saveSoon();
      this.updateUndo();
    }

    flushEdits() { this.compileSoon.cancel(); this.recompile(); this.saveNow(); }

    restore(snap) {
      const s = JSON.parse(snap);
      const activeId = this.activePou && this.activePou.id;
      Object.assign(this.project, s);
      this.activePou = this.project.pous.find(p => p.id === activeId) || this.project.pous[0];
      if (s.scene !== (this.sceneDef && this.sceneDef.id)) this.setScene(s.scene);
      this.recompile();
      this.saveSoon();
      this.renderAll();
    }
    currentSnap() { return JSON.stringify({ tags: this.project.tags, pous: this.project.pous, scene: this.project.scene, name: this.project.name, trace: this.project.trace, scanTime: this.project.scanTime }); }
    undo() {
      const st = this.history.pop();
      if (!st) return;
      this.future.push({ label: st.label, snap: this.currentSnap() });
      this.restore(st.snap);
      PLC.dom.toast('Undo: ' + st.label);
    }
    redo() {
      const st = this.future.pop();
      if (!st) return;
      this.history.push({ label: st.label, snap: this.currentSnap(), at: 0 });
      this.restore(st.snap);
      PLC.dom.toast('Redo: ' + st.label);
    }
    updateUndo() {
      this.undoBtn.disabled = !this.history.length;
      this.redoBtn.disabled = !this.future.length;
      this.undoBtn.title = this.history.length ? 'Undo ' + this.history[this.history.length - 1].label + ' (Ctrl+Z)' : 'Nothing to undo';
    }

    // =================================================================== compile
    recompile() {
      this.compileSoon.cancel();
      let compiled;
      try { compiled = PLC.compiler.compileProject(this.project); }
      catch (e) {
        console.error(e);
        compiled = { ok: false, errors: 1, diagnostics: [{ severity: 'error', message: 'Internal compiler error: ' + e.message }], globals: [], programs: [], fbTypes: new Map(), functions: new Map(), lineRefs: {}, createMemory: () => ({ g: {}, p: {}, io: PLC.newImage(), es: {}, flow: {} }), compileWatchExpr: () => { throw new Error('unavailable'); } };
      }
      this.compiled = compiled;
      this.diagnostics = compiled.diagnostics;
      const running = this.rt.state === 'RUN';
      if (compiled.ok || !running) this.rt.load(compiled);
      this.staleProgram = running && !compiled.ok;
      this.updateTraceSignals();
      this.messages.render();
      this.watch.build();
      this.updateBadges();
      if (this.activePou && this.activePou.lang === 'ST') this.stEditor.renderDiagnostics(), this.stEditor.updateLive(true);
      this.updateFaultBar();
      this.emit('compiled', compiled);
    }

    updateBadges() {
      const errs = this.diagnostics.filter(d => d.severity === 'error').length;
      const warns = this.diagnostics.length - errs;
      const fault = this.rt.state === 'FAULT';
      this.dockTabs.badge('messages', fault ? '!' : errs ? String(errs) : warns ? String(warns) : '', fault || errs ? 'error' : warns ? 'warn' : '');
      for (const b of this.pouTabs.querySelectorAll('.pou-tab')) {
        const id = b.dataset.id;
        const e = this.diagnostics.some(d => d.pouId === id && d.severity === 'error');
        b.classList.toggle('has-error', e);
      }
    }

    updateTraceSignals() {
      const sigs = [];
      for (const name of this.project.trace) {
        let get = null;
        try {
          const c = this.compiled.compileWatchExpr(name);
          if (c && c.type && c.type.k === 'elem') get = (rt) => rt.mem ? c.fn({ self: null, g: rt.mem.g, io: rt.mem.io, ctx: { now: rt.time, ops: 0, maxOps: 100, depth: 0 } }) : null;
        } catch (e) { get = null; }
        if (!get) {
          // program-local variable written as Program.Variable
          const m = /^([A-Za-z_]\w*)\.([A-Za-z_]\w*)$/.exec(name);
          const prog = m && this.compiled.programs.find(p => p.name.toLowerCase() === m[1].toLowerCase() && p.locals);
          const sym = prog && prog.locals.find(l => l.name.toLowerCase() === m[2].toLowerCase() && l.type.k === 'elem');
          if (sym) get = (rt) => rt.mem && rt.mem.p[prog.name] ? rt.mem.p[prog.name][sym.key] : null;
        }
        if (get) sigs.push({ name, get });
      }
      this.rt.trace.setSignals(sigs);
    }

    toggleTrace(name) {
      const i = this.project.trace.findIndex(n => n.toLowerCase() === name.toLowerCase());
      if (i >= 0) this.project.trace.splice(i, 1); else this.project.trace.push(name);
      this.updateTraceSignals();
      this.saveSoon();
      this.trace.draw();
      if (i < 0) PLC.dom.toast(name + ' added to the timing diagram');
    }

    // =================================================================== helpers for panels
    tagInfo(name) {
      const base = String(name).split(/[.[]/)[0].toLowerCase();
      const t = this.project.tags.find(x => x.name.toLowerCase() === base);
      if (!t) {
        if (/^%/.test(name)) return { address: '', comment: 'Direct address' };
        return null;
      }
      return { name: t.name, type: t.type, address: String(name).includes('.') ? '' : t.address, comment: t.comment };
    }

    /** Pins of the function block type behind an instance tag (for ladder call boxes). */
    fbInfo(name) {
      const t = this.project.tags.find(x => x.name.toLowerCase() === String(name).toLowerCase());
      if (!t || !this.compiled) return null;
      const fbt = this.compiled.fbTypes.get(String(t.type).toLowerCase());
      if (!fbt) return null;
      const p = PLC.ladder.fbPins(fbt);
      return {
        name: p.name, powerIn: p.powerIn && p.powerIn.name, powerOut: p.powerOut && p.powerOut.name,
        ins: p.ins.filter(x => x !== p.powerIn).map(x => x.name), outs: p.outs.filter(x => x !== p.powerOut).map(x => x.name),
        outputs: p.outs.map(x => x.name)
      };
    }

    freeAddresses(type, except) {
      const T = PLC.types;
      const tt = String(type || '').toUpperCase();
      const used = new Set(this.project.tags.map(t => String(t.address || '').toUpperCase()).filter(Boolean));
      if (except) used.delete(String(except).toUpperCase());
      let list;
      if (tt === 'BOOL') list = T.allAddresses().filter(a => /X/.test(a));
      else if (T.category(tt) === 'int' || T.category(tt) === 'bits') list = T.allAddresses().filter(a => /W/.test(a));
      else list = [];
      return list.filter(a => !used.has(a));
    }

    async quickCreateTag(name, diag) {
      let type = 'BOOL';
      if (diag && diag.elemId) {
        const f = PLC.ladder.findInProgram((this.project.pous.find(p => p.id === diag.pouId) || { rungs: [] }).rungs || [], diag.elemId);
        if (f) {
          const K = PLC.ladder.KINDS[f.node.kind];
          if (K.cat === 'fb' && f.node.tag === name) type = K.fb;
          else if (K.cat === 'cmp' || K.cat === 'math' || (K.cat === 'fb' && f.node.tag !== name)) type = 'INT';
        }
      }
      const typeSel = h('select.input', { 'aria-label': 'Type' });
      for (const t of ['BOOL', 'INT', 'DINT', 'REAL', 'TIME', 'TON', 'TOF', 'TP', 'CTU', 'CTD', 'CTUD', 'R_TRIG', 'F_TRIG']) typeSel.appendChild(h('option', { value: t, text: t }));
      typeSel.value = type;
      const addrSel = h('select.input', { 'aria-label': 'Address' });
      const fill = () => { clear(addrSel); addrSel.appendChild(h('option', { value: '', text: 'no address (internal memory)' })); for (const a of this.freeAddresses(typeSel.value)) addrSel.appendChild(h('option', { value: a, text: a })); };
      fill();
      typeSel.addEventListener('change', fill);
      const body = h('div.stack', null, h('p', { html: 'Create the tag <b>' + PLC.util.escapeHtml(name) + '</b>.' }),
        h('label.field', null, h('span', { text: 'Data type' }), typeSel), h('label.field', null, h('span', { text: 'Address' }), addrSel));
      const ok = await PLC.dom.modal('Create tag', body, [{ label: 'Cancel', value: false }, { label: 'Create', value: true, primary: true }], { cancelValue: false, enterValue: true });
      if (!ok) return;
      this.mutate('Create tag', () => this.project.tags.push({ name, type: typeSel.value, address: addrSel.value, init: '', comment: '' }));
      this.tags.render();
    }

    navigate(d) {
      if (!d) return;
      if (d.tagRow !== undefined) { this.dockTabs.select('tags'); const tr = this.tagsHost.querySelectorAll('tbody tr')[d.tagRow]; if (tr) { const i = tr.querySelector('input'); if (i) i.focus(); } return; }
      const pou = this.project.pous.find(p => p.id === d.pouId) || this.project.pous.find(p => p.name === d.pou);
      if (!pou) return;
      if (pou !== this.activePou) this.selectPou(pou.id);
      if (pou.lang === 'LD') {
        if (d.elemId) { this.ladderEditor.select([d.elemId]); this.ladderEditor.scrollIntoView(d.elemId); this.ladderEditor.openPop(d.elemId); }
        else if (d.rungId || d.rung !== undefined) {
          const r = d.rungId ? pou.rungs.find(x => x.id === d.rungId) : pou.rungs[d.rung];
          if (r) { this.ladderEditor.sel = []; this.ladderEditor.selRung = r.id; this.ladderEditor.render(); }
        }
      } else if (d.line) this.stEditor.gotoLine(d.line, d.col);
    }

    // =================================================================== POUs
    renderPouTabs() {
      clear(this.pouTabs);
      this.project.pous.forEach((p, i) => {
        const kind = p.lang === 'ST' ? stKind(p.source) : 'PROGRAM';
        const b = h('button.pou-tab' + (p === this.activePou ? '.active' : ''), { type: 'button', role: 'tab', dataset: { id: p.id }, title: (kind === 'PROGRAM' ? 'Program, runs ' + ordinal(this.project.pous.filter(x => x.lang === 'LD' || stKind(x.source) === 'PROGRAM').indexOf(p) + 1) + ' in every scan' : kind === 'FUNCTION_BLOCK' ? 'Function block' : 'Function') + '. Right-click for options.' },
          h('span.lang.' + p.lang.toLowerCase(), { text: kind === 'FUNCTION_BLOCK' ? 'FB' : kind === 'FUNCTION' ? 'FN' : p.lang }), h('span', { text: p.name }));
        b.addEventListener('click', () => this.selectPou(p.id));
        b.addEventListener('contextmenu', e => { e.preventDefault(); this.pouMenu(b, p, i); });
        b.addEventListener('dblclick', () => this.renamePou(p));
        this.pouTabs.appendChild(b);
      });
      const add = button('Add program', { icon: 'plus', iconOnly: true, cls: 'ghost sm pou-add', title: 'Add a program, function block or function' });
      add.addEventListener('click', () => menu(add, [
        { label: 'Ladder program', icon: 'ladder', onClick: () => this.addPou('LD') },
        { label: 'Structured Text program', icon: 'text', onClick: () => this.addPou('ST') },
        { sep: true },
        { label: 'Function block (ST)', icon: 'cpu', onClick: () => this.addPou('ST', null, null, 'FUNCTION_BLOCK') },
        { label: 'Function (ST)', icon: 'cpu', onClick: () => this.addPou('ST', null, null, 'FUNCTION') }
      ]));
      this.pouTabs.appendChild(add);
      this.updateBadges();
    }

    pouMenu(anchor, p, i) {
      const n = this.project.pous.length;
      menu(anchor, [
        { label: 'Rename…', icon: 'edit', onClick: () => this.renamePou(p) },
        { label: 'Move left (runs earlier)', icon: 'up', disabled: i === 0, onClick: () => this.mutate('Reorder', () => { const a = this.project.pous; [a[i - 1], a[i]] = [a[i], a[i - 1]]; }, { structure: true }) },
        { label: 'Move right (runs later)', icon: 'down', disabled: i === n - 1, onClick: () => this.mutate('Reorder', () => { const a = this.project.pous; [a[i + 1], a[i]] = [a[i], a[i + 1]]; }, { structure: true }) },
        { label: 'Duplicate', icon: 'copy', onClick: () => { const c = JSON.parse(JSON.stringify(p)); c.id = PLC.util.uid('p'); c.name = this.uniquePouName(p.name + '_copy'); if (c.lang === 'LD') c.rungs = c.rungs.map(r => PLC.ladder.cloneRung(r)); this.mutate('Duplicate', () => this.project.pous.splice(i + 1, 0, c), { structure: true }); } },
        { sep: true },
        { label: 'Delete', icon: 'trash', disabled: n <= 1, onClick: async () => { if (await PLC.dom.confirm('Delete ' + p.name, 'Delete "' + p.name + '"? You can undo this.', 'Delete', true)) this.mutate('Delete program', () => this.project.pous.splice(i, 1), { structure: true }); } }
      ]);
    }

    uniquePouName(base) {
      let name = base.replace(/[^A-Za-z0-9_]/g, '_'), k = 2;
      while (this.project.pous.some(p => p.name.toLowerCase() === name.toLowerCase())) name = base + k++;
      return name;
    }

    async renamePou(p) {
      const v = await PLC.dom.prompt('Rename', 'New name', p.name);
      if (!v || v === p.name) return;
      if (!PLC.util.isIdentifier(v)) { PLC.dom.toast('Use letters, digits and underscores, starting with a letter.', 'warn'); return; }
      this.mutate('Rename', () => {
        if (p.lang === 'ST') p.source = p.source.replace(new RegExp('^(\\s*(?:FUNCTION_BLOCK|FUNCTION|PROGRAM)\\s+)' + p.name + '\\b', 'im'), '$1' + v);
        p.name = v;
      }, { structure: true });
    }

    addPou(lang, name, source, kind) {
      const base = name || (kind === 'FUNCTION_BLOCK' ? 'MyBlock' : kind === 'FUNCTION' ? 'MyFunction' : lang === 'LD' ? 'Ladder' : 'Logic');
      const nm = this.uniquePouName(base);
      let pou;
      if (lang === 'LD') pou = PLC.project.ldPou(nm);
      else {
        let src = source;
        if (src === undefined || src === null) {
          if (kind === 'FUNCTION_BLOCK') src = 'FUNCTION_BLOCK ' + nm + '\n    VAR_INPUT\n        Enable : BOOL;\n    END_VAR\n    VAR_OUTPUT\n        Done : BOOL;\n    END_VAR\n    VAR\n        Timer : TON;\n    END_VAR\n\n    Timer(IN := Enable, PT := T#1s);\n    Done := Timer.Q;\nEND_FUNCTION_BLOCK\n';
          else if (kind === 'FUNCTION') src = 'FUNCTION ' + nm + ' : INT\n    VAR_INPUT\n        X : INT;\n    END_VAR\n\n    ' + nm + ' := X * 2;\nEND_FUNCTION\n';
          else src = '(* Structured Text program. Tags from the Tags table are available here. *)\n\n';
        }
        pou = PLC.project.stPou(nm, src);
      }
      this.mutate('Add ' + (kind ? kind.toLowerCase().replace('_', ' ') : 'program'), () => this.project.pous.push(pou), { structure: true });
      this.selectPou(pou.id);
    }

    selectPou(id) {
      const p = this.project.pous.find(x => x.id === id);
      if (!p) return;
      this.activePou = p;
      this.pouTabs.querySelectorAll('.pou-tab').forEach(b => b.classList.toggle('active', b.dataset.id === id));
      this.showPou();
      if (!this.stviewHost.hidden) this.stview.render();
    }

    showPou() {
      const p = this.activePou;
      this.ldHost.hidden = p.lang !== 'LD';
      this.stHost.hidden = p.lang !== 'ST';
      if (p.lang === 'LD') this.ladderEditor.setPou(p);
      else { this.stEditor.setPou(p); this.stEditor.refresh(); }
    }

    // =================================================================== scene
    setScene(id) {
      const def = PLC.scenes.get(id) || PLC.scenes.get('trainer');
      this.sceneDef = def;
      this.project.scene = def.id;
      this.rt.phys = PLC.newImage();
      const inst = def.create();
      inst.reset(this.rt.phys);
      this.sceneInst = inst;
      this.rt.scene = inst;
      this.sim.setScene(def, inst);
    }

    resetScene() {
      this.sceneInst.reset(this.rt.phys);
      this.sim.draw();
      PLC.dom.toast('Machine reset');
    }

    async changeScene(id) {
      if (id === this.project.scene) return;
      const def = PLC.scenes.get(id);
      this.mutate('Change machine', () => { this.project.scene = id; }, { render: false });
      this.setScene(id);
      const missing = def.tags.filter(t => !this.project.tags.some(x => x.name.toLowerCase() === t.name.toLowerCase()));
      if (missing.length) {
        const ok = await PLC.dom.confirm('Add the machine\'s I/O?', 'The ' + def.name + ' uses ' + def.tags.length + ' inputs and outputs. Add the ' + missing.length + ' missing tag' + (missing.length > 1 ? 's' : '') + ' to the Tags table? Existing tags that use the same addresses lose their address.', 'Add tags');
        if (ok) this.importSceneTags();
      }
      this.tags.render();
    }

    importSceneTags() {
      let n = 0;
      this.mutate('Add machine I/O', () => { n = PLC.project.applySceneTags(this.project, this.sceneDef.tags); });
      this.tags.render();
      this.dockTabs.select('tags');
      PLC.dom.toast(n ? 'Added ' + n + ' tag' + (n > 1 ? 's' : '') : 'All I/O tags are already there');
    }

    // =================================================================== run control
    toggleRun() {
      if (this.rt.state === 'RUN') { this.rt.stop(); return; }
      this.flushEdits();
      if (!this.compiled.ok) {
        this.dockTabs.select('messages');
        PLC.dom.toast('The program has errors. Fix them first (see Messages).', 'error', 4000);
        return;
      }
      this.rt.paused = false;
      this.rt.run();
      this.rt.trace.clear();
    }
    togglePause() {
      this.rt.paused = !this.rt.paused;
      this.onState();
    }
    /** Scan debugger: execute the next phase of the scan and show where the PLC is. */
    stepPhase() {
      if (this.rt.state !== 'RUN') {
        this.flushEdits();
        if (!this.compiled.ok) { PLC.dom.toast('Fix the errors first.', 'error'); return; }
        this.rt.run();
      }
      this.rt.paused = true;
      const ph = this.rt.stepPhase();
      if (ph && ph.pouId && (!this.activePou || this.activePou.id !== ph.pouId)) this.selectPou(ph.pouId);
      this.onState();
      this.renderLive(true);
      this.watch.update(true);
      this.sim.draw();
    }

    renderScanStrip() {
      const rt = this.rt, strip = this.scanStrip;
      const show = rt.state === 'RUN' && rt.paused;
      strip.hidden = !show;
      this.ladderEditor.markExec(show ? (rt.debug ? { phases: rt.debug.phases, done: rt.debug.i } : null) : null);
      if (!show) return;
      clear(strip);
      const d = rt.debug;
      let phases, done;
      if (d) { phases = d.phases; done = d.i; }
      else {
        // between scans: preview the parts of the next scan
        phases = [{ kind: 'input' }];
        for (const prog of this.compiled.programs) {
          if (prog.runRung) for (let i = 0; i < prog.rungCount; i++) phases.push({ kind: 'rung', pou: prog.name, index: i });
          else phases.push({ kind: 'prog', pou: prog.name });
        }
        phases.push({ kind: 'output' });
        done = 0;
      }
      const flow = h('div.scan-flow');
      const chip = (i, text, title) => h('span.scan-chip' + (i < done - 1 ? '.done' : i === done - 1 ? '.cur' : ''), { title: title || text, text });
      let i = 0;
      flow.appendChild(chip(i++, 'Read inputs', 'Copy the input terminals into the input image'));
      let group = null, groupName = null;
      for (; i < phases.length - 1; i++) {
        const ph = phases[i];
        if (ph.pou !== groupName) {
          groupName = ph.pou;
          group = h('span.scan-group', null, h('span.scan-pou', { text: ph.pou }));
          flow.appendChild(group);
        }
        group.appendChild(chip(i, ph.kind === 'rung' ? String(ph.index + 1) : 'ST', ph.kind === 'rung' ? ph.pou + ', rung ' + (ph.index + 1) : ph.pou + ' (whole program)'));
      }
      flow.appendChild(chip(i, 'Write outputs', 'Copy the output image to the output terminals'));
      const last = d && done > 0 ? phases[done - 1] : null;
      let explain;
      if (!d && !rt.lastPhase) explain = 'Paused between two scans. Step (F11) runs the scan one part at a time; Single scan (F10) runs a whole scan.';
      else if (!d) explain = 'Scan finished: the output image is now on the output terminals and the machine reacts. Step (F11) starts the next scan.';
      else if (last.kind === 'input') explain = 'The input terminals were copied into the input image. A switch you flip now is only seen in the next scan.';
      else if (last.kind === 'rung') explain = 'Rung ' + (last.index + 1) + ' of ' + last.pou + ' ran. Its coils changed the output image only: the machine still sees the old outputs until "Write outputs".';
      else explain = last.pou + ' ran. Outputs reach the machine at the end of the scan.';
      strip.append(h('div.scan-head', null, icon('stepRung', 16), h('strong', { text: 'Scan debugger' }), flow,
        h('span.tb-spacer'),
        button('Step', { cls: 'xs', title: 'Run the next part of the scan (F11)', onClick: () => this.stepPhase() }),
        button('Finish scan', { cls: 'xs', title: 'Run the rest of this scan (F10)', onClick: () => this.stepScan() }),
        button('Resume', { cls: 'xs primary', onClick: () => this.togglePause() })),
        h('p.scan-explain', { text: explain }));
      // field signals versus process image
      const T = PLC.types, mem = rt.mem;
      const row = (title, list) => {
        if (!list.length) return null;
        const r = h('div.pi-row', null, h('span.pi-title', { text: title }));
        for (const it of list) {
          const diff = it.a !== it.b;
          r.appendChild(h('span.pi-item' + (diff ? '.diff' : ''), { title: it.tip + (diff ? '. The two differ right now.' : '') },
            h('span.pi-name', { text: it.name }), h('span.pi-led' + (it.a ? '.on' : ''), { text: it.al }), h('span.pi-led' + (it.b ? '.on' : ''), { text: it.bl })));
        }
        return r;
      };
      const ins = [], outs = [];
      for (const t of this.project.tags) {
        const a = T.parseAddress(t.address);
        if (!a || a.type !== 'BOOL' || !mem) continue;
        if (a.area === 'I') ins.push({ name: t.name, a: !!rt.phys.I[a.index], b: !!mem.io.I[a.index], al: 'T', bl: 'I', tip: t.name + ': T = input terminal, I = input image' });
        else outs.push({ name: t.name, a: !!mem.io.Q[a.index], b: !!rt.phys.Q[a.index], al: 'I', bl: 'T', tip: t.name + ': I = output image, T = output terminal' });
      }
      const pi = h('div.pi', null, row('Inputs', ins.slice(0, 12)), row('Outputs', outs.slice(0, 12)));
      if (pi.childNodes.length) strip.appendChild(pi);
    }


    stepScan() {
      if (this.rt.state !== 'RUN') {
        this.flushEdits();
        if (!this.compiled.ok) { PLC.dom.toast('Fix the errors first.', 'error'); return; }
        this.rt.run();
      }
      this.rt.paused = true;
      this.rt.step();
      this.onState();
      this.renderLive(true);
    }
    onState() {
      const st = this.rt.state;
      const paused = this.rt.paused && st === 'RUN';
      this.statePill.textContent = paused ? 'PAUSED' : st;
      this.statePill.className = 'state-pill ' + (paused ? 'paused' : st.toLowerCase());
      this.runBtn.classList.toggle('running', st === 'RUN');
      this.runBtn.querySelector('span:last-child').textContent = st === 'RUN' ? 'Stop' : 'Run';
      clear(this.runBtn.querySelector('.ico')).appendChild(icon(st === 'RUN' ? 'stop' : 'run', 18).firstChild);
      this.pauseBtn.classList.toggle('on', !!this.rt.paused);
      this.renderScanStrip();
      this.shell.classList.toggle('online', st === 'RUN' || st === 'FAULT');
      this.updateFaultBar();
      this.messages.render();
      this.updateBadges();
      this.ladderEditor.updateLive(true);
      if (this.activePou.lang === 'ST') { this.stEditor.renderDiagnostics(); this.stEditor.updateLive(true); }
      if (st !== 'RUN' && this.staleProgram) { this.staleProgram = false; this.recompile(); }
    }

    updateFaultBar() {
      const fb = this.faultBar;
      clear(fb);
      if (this.rt.state === 'FAULT' && this.rt.fault) {
        const f = this.rt.fault;
        fb.className = 'fault-bar fault';
        fb.append(icon('bolt', 16), h('span', { text: 'CPU fault in ' + f.pou + (f.line ? ' line ' + f.line : f.rung !== null && f.rung !== undefined ? ' rung ' + (f.rung + 1) : '') + ': ' + f.message }),
          button('Go to error', { cls: 'xs', onClick: () => this.navigate({ pou: f.pou, line: f.line, rung: f.rung }) }),
          button('Acknowledge', { cls: 'xs', onClick: () => this.rt.stop() }));
        fb.hidden = false;
      } else if (this.staleProgram) {
        fb.className = 'fault-bar stale';
        fb.append(icon('info', 16), h('span', { text: 'The edited program has errors. The PLC keeps running the last correct version.' }));
        fb.hidden = false;
      } else fb.hidden = true;
    }

    // =================================================================== loop
    loop() {
      let last = performance.now();
      let watchT = 0, traceT = 0;
      const frame = (now) => {
        const dt = now - last;
        last = now;
        const before = this.rt.scanCount;
        this.rt.advance(dt);
        const scanned = this.rt.scanCount !== before;
        this.sim.draw();
        if (scanned || this._forceLive) this.renderLive(false);
        watchT += dt; traceT += dt;
        if (watchT > 100) { watchT = 0; this.watch.update(); this.updateScanInfo(); }
        if (traceT > 60 && !this.traceHost.hidden) { traceT = 0; if (this.rt.state === 'RUN' && !this.rt.paused) this.trace.draw(); }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }

    renderLive(force) {
      if (this.activePou.lang === 'LD') this.ladderEditor.updateLive(force);
      else this.stEditor.updateLive(force);
    }

    updateScanInfo() {
      const rt = this.rt;
      const t = (rt.time / 1000).toFixed(1);
      this.scanInfo.textContent = 'scan ' + rt.scanCount + ' · cycle ' + rt.scanTime + ' ms · t ' + t + ' s';
    }

    // =================================================================== keyboard
    bindKeys() {
      document.addEventListener('keydown', e => {
        const tag = (e.target && e.target.tagName) || '';
        const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
        const mod = e.ctrlKey || e.metaKey;
        if (e.key === 'F5') { e.preventDefault(); this.toggleRun(); return; }
        if (e.key === 'F10') { e.preventDefault(); this.stepScan(); return; }
        if (e.key === 'F11') { e.preventDefault(); this.stepPhase(); return; }
        if (inField) return;
        if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
        else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); this.redo(); }
        else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); this.saveNow(); PLC.dom.toast('Saved in this browser'); }
      });
      window.addEventListener('beforeunload', () => { this.saveNow(); store.set(KEY_UI, this.ui); });
    }

    isNarrow() { return window.innerWidth < 1100; }

    // =================================================================== project panel & files
    renderProjectPanel() {
      const root = clear(this.projectPanel);
      const p = this.project;
      root.appendChild(h('h2', { text: 'Project' }));
      if (this.workspace.kind === 'lesson') {
        root.appendChild(h('p.small.muted', { text: 'You are working on a lesson exercise. Open the Sandbox to build your own projects.' }));
        root.appendChild(button('Open the Sandbox', { icon: 'cpu', onClick: () => this.openSandbox() }));
      }
      const name = h('input.input', { value: p.name, 'aria-label': 'Project name' });
      name.addEventListener('change', () => { this.mutate('Rename project', () => { p.name = name.value.trim() || 'Untitled'; }); this.renderWsTitle(); });
      root.appendChild(h('label.field', null, h('span', { text: 'Name' }), name));
      const scan = h('select.input', { 'aria-label': 'Scan cycle time' });
      for (const v of [5, 10, 20, 50, 100]) scan.appendChild(h('option', { value: v, text: v + ' ms' }));
      scan.value = String(p.scanTime);
      scan.addEventListener('change', () => { this.mutate('Scan time', () => { p.scanTime = parseInt(scan.value, 10); }); this.rt.scanTime = p.scanTime; });
      root.appendChild(h('label.field', null, h('span', { text: 'Scan cycle time' }), scan, h('span.small.muted', { text: 'Simulated time per scan. Timers count in steps of this size.' })));

      root.appendChild(h('h3', { text: 'Programs' }));
      root.appendChild(h('p.small.muted', { text: 'Programs run left to right in every scan. Function blocks and functions run only when a program calls them.' }));
      const list = h('ol.pou-list');
      for (const q of p.pous) {
        const kind = q.lang === 'ST' ? stKind(q.source) : 'PROGRAM';
        const li = h('li', null, h('button.link', { type: 'button', text: q.name, on: { click: () => this.selectPou(q.id) } }), h('span.small.muted', { text: (q.lang === 'LD' ? 'Ladder' : 'ST') + ' ' + kind.toLowerCase().replace('_', ' ') }));
        list.appendChild(li);
      }
      root.appendChild(list);

      root.appendChild(h('h3', { text: 'Files' }));
      const files = h('div.btn-col');
      files.append(
        button('New project…', { icon: 'file', onClick: () => this.newProject() }),
        button('Open project file…', { icon: 'upload', onClick: () => this.openFile() }),
        button('Save project file', { icon: 'download', onClick: () => this.saveFile() }),
        button('Copy project as text', { icon: 'copy', onClick: () => this.copyProject() }),
        button('Paste project text…', { icon: 'edit', onClick: () => this.pasteProject() }));
      root.appendChild(files);
      root.appendChild(h('p.small.muted', { text: 'Your work is saved automatically in this browser. Save a file to move it to another computer or hand it in.' }));
      if (store.get(KEY_SANDBOX + '.backup', null)) {
        root.appendChild(h('div.btn-col', null, button('Restore the Sandbox project from before the last shared link', { icon: 'reset', onClick: () => this.restoreBackup() })));
      }

      root.appendChild(h('h3', { text: 'Course progress' }));
      const all = PLC.lessons.all();
      const done = all.filter(l => this.progress[l.id] && this.progress[l.id].done);
      root.appendChild(h('p.small.muted', { text: done.length + ' of ' + all.length + ' lessons completed in this browser.' }));
      root.appendChild(h('div.btn-col', null, button('Copy progress report', { icon: 'copy', title: 'Copy a text summary of your completed lessons, for example to hand in', onClick: () => this.copyProgress() })));

      root.appendChild(h('h3', { text: 'Examples' }));
      root.appendChild(h('p.small.muted', { text: 'Open the model solution of a lesson in the Sandbox to study it.' }));
      const ex = h('div.example-list');
      for (const l of PLC.lessons.all()) {
        const b = h('button.example', { type: 'button' }, h('span', { text: l.title }), h('span.small.muted', { text: (PLC.scenes.get(l.scene) || { name: l.scene }).name + ' · ' + l.lang }));
        b.addEventListener('click', () => this.loadExample(l));
        ex.appendChild(b);
      }
      root.appendChild(ex);
    }

    copyProgress() {
      const all = PLC.lessons.all();
      const lines = ['LadderLab progress report', 'Created: ' + new Date().toLocaleString(), ''];
      let n = 0;
      for (const ch of PLC.lessons.CHAPTERS) {
        const ls = all.filter(l => l.chapter === ch.id);
        if (!ls.length) continue;
        lines.push(ch.title);
        for (const l of ls) {
          const p = this.progress[l.id];
          if (p && p.done) n++;
          const quiz = p && p.quiz ? Object.values(p.quiz).filter(Boolean).length + '/' + (l.quiz || []).length + ' quiz' : '';
          lines.push('  [' + (p && p.done ? 'x' : ' ') + '] ' + l.title + (p && p.done && p.at ? '  (passed ' + new Date(p.at).toLocaleDateString() + ')' : '') + (quiz ? '  ' + quiz : '') + (p && p.solutionShown ? '  (model solution viewed)' : ''));
        }
        lines.push('');
      }
      lines.splice(2, 0, 'Completed: ' + n + ' of ' + all.length + ' lessons');
      const text = lines.join('\n');
      PLC.dom.copyText(text).then(ok => {
        if (ok) { PLC.dom.toast('Progress report copied'); return; }
        const ta = h('textarea.input.mono', { rows: 14, readonly: true, 'aria-label': 'Progress report' });
        ta.value = text;
        PLC.dom.modal('Progress report', ta, [{ label: 'Close', value: true }], { wide: true, cancelValue: true });
      });
    }

    fileMenu(anchor) {
      const items = [
        { header: this.workspace.kind === 'lesson' ? 'Lesson exercise' : 'Sandbox project' },
        { label: 'New project…', icon: 'file', onClick: () => this.newProject() },
        { label: 'Open project file…', icon: 'upload', onClick: () => this.openFile() },
        { label: 'Save project file', icon: 'download', hint: '.json', onClick: () => this.saveFile() },
        { sep: true },
        { label: 'Copy project as text', icon: 'copy', onClick: () => this.copyProject() },
        { label: 'Paste project text…', icon: 'edit', onClick: () => this.pasteProject() },
        { sep: true },
        { label: 'Share a link…', icon: 'share', onClick: () => this.shareMenu(anchor) },
        { label: 'Export ladder as PNG', icon: 'image', disabled: !this.activePou || this.activePou.lang !== 'LD', onClick: () => this.exportLadder('png') },
        { label: 'Export ladder as SVG', icon: 'image', disabled: !this.activePou || this.activePou.lang !== 'LD', onClick: () => this.exportLadder('svg') },
        { sep: true },
        { label: 'Open the Sandbox', icon: 'cpu', disabled: this.workspace.kind === 'sandbox', onClick: () => this.openSandbox() },
        { label: 'Project settings', icon: 'gear', onClick: () => this.railTabs.select('project') }
      ];
      menu(anchor, items);
    }

    async newProject() {
      const nameIn = h('input.input', { value: 'My project', autofocus: true, 'aria-label': 'Project name' });
      const sceneSel = h('select.input', { 'aria-label': 'Machine' });
      for (const s of PLC.scenes.list()) sceneSel.appendChild(h('option', { value: s.id, text: s.name + ' — ' + s.description.split('.')[0] }));
      const langSel = h('select.input', { 'aria-label': 'Language' }, h('option', { value: 'LD', text: 'Ladder diagram' }), h('option', { value: 'ST', text: 'Structured Text' }));
      const withTags = h('input', { type: 'checkbox', checked: true, id: 'np-tags' });
      const body = h('div.stack', null,
        h('label.field', null, h('span', { text: 'Name' }), nameIn),
        h('label.field', null, h('span', { text: 'Machine' }), sceneSel),
        h('label.field', null, h('span', { text: 'Language' }), langSel),
        h('label.checkline', null, withTags, h('span', { text: 'Add the machine\'s inputs and outputs as tags' })));
      const ok = await PLC.dom.modal('New project', body, [{ label: 'Cancel', value: false }, { label: 'Create', value: true, primary: true }], { cancelValue: false, enterValue: true });
      if (!ok) return;
      if (this.workspace.kind === 'sandbox' && !(await PLC.dom.confirm('Replace the Sandbox project?', 'The current Sandbox project "' + this.project.name + '" will be replaced. Save it to a file first if you want to keep it.', 'Replace', true))) return;
      const p = PLC.project.create({ name: nameIn.value.trim() || 'My project', scene: sceneSel.value, lang: langSel.value });
      if (withTags.checked) PLC.project.applySceneTags(p, PLC.scenes.get(sceneSel.value).tags);
      if (langSel.value === 'ST') p.pous[0].source = '(* ' + p.name + ' *)\n\n';
      this.workspace = { kind: 'sandbox' };
      this.loadProject(p);
      this.saveNow();
      this.rememberWorkspace();
      this.lessons.render();
    }

    async loadExample(lesson) {
      const ok = await PLC.dom.confirm('Open example', 'Open the solution of "' + lesson.title + '" in the Sandbox? The current Sandbox project is replaced.', 'Open');
      if (!ok) return;
      const p = PLC.lessons.makeProject(lesson, 'solution');
      p.name = 'Example: ' + lesson.title;
      this.saveNow();
      this.workspace = { kind: 'sandbox' };
      this.loadProject(p);
      this.saveNow();
      this.rememberWorkspace();
      this.lessons.render();
    }

    saveFile() {
      this.saveNow();
      const name = (this.project.name || 'project').replace(/[^\w-]+/g, '_') + '.ladderlab.json';
      const text = PLC.project.serialize(this.project);
      if (!window.LADDERLAB_NO_DOWNLOAD && PLC.dom.download(name, text)) { PLC.dom.toast('Saved ' + name); return; }
      // downloads are blocked in some embedded viewers: hand the project over as text instead
      const ta = h('textarea.input.mono', { rows: 10, readonly: true, 'aria-label': 'Project text' });
      ta.value = text;
      const copy = button('Copy to clipboard', { icon: 'copy', cls: 'primary', onClick: () => PLC.dom.copyText(text).then(ok => { if (ok) PLC.dom.toast('Copied'); else { ta.focus(); ta.select(); PLC.dom.toast('Press Ctrl+C to copy the selected text', 'warn'); } }) });
      PLC.dom.modal('Save project', h('div.stack', null,
        h('p.small.muted', { text: 'Downloading files is not available here. Copy this text and save it in a file called ' + name + ', or paste it into a message. Open it again with "Paste project text".' }),
        ta, h('div', null, copy)), [{ label: 'Close', value: true }], { wide: true, cancelValue: true });
    }

    openFile() {
      const input = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
      input.addEventListener('change', () => {
        const f = input.files && input.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => this.importText(String(r.result));
        r.readAsText(f);
        input.remove();
      });
      document.body.appendChild(input);
      input.click();
    }

    importText(text) {
      try {
        const p = PLC.project.parse(text);
        this.saveNow();
        this.workspace = { kind: 'sandbox' };
        this.loadProject(p);
        this.saveNow();
        this.rememberWorkspace();
        this.lessons.render();
        PLC.dom.toast('Opened "' + p.name + '" in the Sandbox');
      } catch (e) {
        PLC.dom.alert('Cannot open the project', e.message);
      }
    }

    copyProject() {
      PLC.dom.copyText(PLC.project.serialize(this.project)).then(ok => PLC.dom.toast(ok ? 'Project copied as text. Paste it into a file or a message.' : 'Copying is blocked here. Use "Save project file" instead.', ok ? '' : 'warn', 4000));
    }

    async pasteProject() {
      const ta = h('textarea.input.mono', { rows: 10, autofocus: true, placeholder: '{ "format": "ladderlab-project", ... }', 'aria-label': 'Project text' });
      const ok = await PLC.dom.modal('Paste project text', h('div.stack', null, h('p.small.muted', { text: 'Paste the text of a LadderLab project (created with "Copy project as text").' }), ta),
        [{ label: 'Cancel', value: false }, { label: 'Open', value: true, primary: true }], { cancelValue: false, wide: true });
      if (ok && ta.value.trim()) this.importText(ta.value);
    }

    // =================================================================== share links & image export
    /** Encode the project (deflate + base64url when the browser supports it). */
    async encodeProject() {
      const json = JSON.stringify(this.project);
      const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
      try {
        if (typeof CompressionStream !== 'undefined') {
          const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
          const buf = new Uint8Array(await new Response(stream).arrayBuffer());
          return 'z' + b64(buf);
        }
      } catch (e) { /* fall through to plain encoding */ }
      return 'j' + b64(new TextEncoder().encode(json));
    }

    async decodeProject(data) {
      const raw = data.slice(1).replace(/-/g, '+').replace(/_/g, '/');
      const bin = atob(raw + '==='.slice((raw.length + 3) % 4));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      let text;
      if (data[0] === 'z') {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        text = await new Response(stream).text();
      } else text = new TextDecoder().decode(bytes);
      return PLC.project.parse(text);
    }

    baseUrl() { return location.href.split('#')[0]; }

    async shareMenu(anchor) {
      const items = [];
      if (this.workspace.kind === 'lesson') items.push({ label: 'Link to this lesson', icon: 'book', onClick: () => this.showLink('Link to this lesson', this.baseUrl() + '#lesson=' + this.workspace.id, 'Opens this lesson with an empty exercise, so every student starts fresh.') });
      items.push({ label: 'Link with this project', icon: 'share', onClick: async () => {
        const data = await this.encodeProject();
        this.showLink('Link with this project', this.baseUrl() + '#project=' + data, 'Opens a copy of this project in the Sandbox of whoever clicks it. Use it to hand out an exercise or to show your solution.' + (data.length > 30000 ? ' This project is large, so the link is very long; some messengers may cut it. Use "Save project file" instead.' : ''));
      } });
      PLC.dom.menu(anchor, items);
    }

    showLink(title, url, note) {
      const input = h('input.input.mono', { value: url, readonly: true, 'aria-label': 'Link' });
      const copy = button('Copy link', { icon: 'copy', cls: 'primary', onClick: () => PLC.dom.copyText(url).then(ok => { if (ok) PLC.dom.toast('Link copied'); else { input.focus(); input.select(); PLC.dom.toast('Press Ctrl+C to copy', 'warn'); } }) });
      const local = /^file:/.test(location.protocol) ? h('p.small.warn-text', { text: 'You are running LadderLab from a file on this computer, so the link only works here. Publish LadderLab on a website (for example GitHub Pages) to share links with others.' }) : null;
      PLC.dom.modal(title, h('div.stack', null, h('p.small.muted', { text: note }), input, local, h('div', null, copy)), [{ label: 'Close', value: true }], { wide: true, cancelValue: true });
      setTimeout(() => { input.focus(); input.select(); }, 50);
    }

    /** Open #lesson=… and #project=… links. */
    async openFromHash() {
      const hash = location.hash || '';
      const clear = () => { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ } };
      let m = /^#lesson=([\w-]+)/.exec(hash);
      if (m) { clear(); if (PLC.lessons.get(m[1])) { this.openLesson(m[1]); return true; } PLC.dom.toast('That lesson does not exist (any more).', 'warn'); return false; }
      m = /^#project=([zj][\w-]+)/.exec(hash);
      if (!m) return false;
      clear();
      let p;
      try { p = await this.decodeProject(m[1]); }
      catch (e) { PLC.dom.alert('Cannot open the shared project', 'The link is incomplete or damaged. Ask for a new link or a project file.'); return false; }
      const ok = await PLC.dom.confirm('Open shared project', 'Open "' + p.name + '" in your Sandbox? Your current Sandbox project is kept as a backup in the Project tab.', 'Open');
      if (!ok) return false;
      this.saveNow();
      const old = store.get(KEY_SANDBOX, null);
      if (old) store.set(KEY_SANDBOX + '.backup', old);
      this.workspace = { kind: 'sandbox' };
      this.loadProject(p);
      this.saveNow();
      this.rememberWorkspace();
      this.lessons.render();
      PLC.dom.toast('Opened "' + p.name + '"');
      return true;
    }

    restoreBackup() {
      const b = store.get(KEY_SANDBOX + '.backup', null);
      if (!b) return;
      try {
        const p = PLC.project.normalize(b);
        this.saveNow();
        this.workspace = { kind: 'sandbox' };
        this.loadProject(p);
        this.saveNow();
        this.rememberWorkspace();
        store.remove(KEY_SANDBOX + '.backup');
        PLC.dom.toast('Restored "' + p.name + '"');
        this.renderProjectPanel();
      } catch (e) { PLC.dom.toast('The backup could not be read', 'warn'); }
    }

    /** Export the current ladder program as an image for worksheets (PNG or SVG). */
    exportLadder(format) {
      const pou = this.activePou;
      if (!pou || pou.lang !== 'LD') { PLC.dom.toast('Open a ladder program first', 'warn'); return; }
      const r = PLC.ladderView.renderProgram(pou.rungs, { tagInfo: n => this.tagInfo(n), fbInfo: n => this.fbInfo(n), minWidth: 0 });
      const svg = r.svg;
      const holder = h('div', { style: { position: 'fixed', left: '-10000px', top: '0' } });
      holder.appendChild(svg);
      document.body.appendChild(holder);
      // inline computed styles so the image looks the same outside the app
      const props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style'];
      svg.querySelectorAll('*').forEach(el => {
        const cs = getComputedStyle(el);
        el.setAttribute('style', props.map(p => p + ':' + cs.getPropertyValue(p)).join(';'));
      });
      svg.querySelectorAll('title').forEach(t => t.remove());
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--surface-2').trim() || '#fff';
      svg.insertBefore(PLC.dom.s('rect', { x: 0, y: 0, width: r.width, height: r.height, fill: bg }), svg.firstChild);
      const text = new XMLSerializer().serializeToString(svg);
      holder.remove();
      const base = (this.project.name + '_' + pou.name).replace(/[^\w-]+/g, '_');
      if (window.LADDERLAB_NO_DOWNLOAD) { PLC.dom.toast('Downloads are not available here', 'warn'); return; }
      if (format === 'svg') { PLC.dom.download(base + '.svg', text, 'image/svg+xml'); PLC.dom.toast('Saved ' + base + '.svg'); return; }
      const img = new Image();
      img.onload = () => {
        const k = 2;
        const c = document.createElement('canvas');
        c.width = r.width * k; c.height = r.height * k;
        const ctx = c.getContext('2d');
        ctx.scale(k, k);
        ctx.drawImage(img, 0, 0);
        c.toBlob(blob => {
          const url = URL.createObjectURL(blob);
          const a = h('a', { href: url, download: base + '.png' });
          document.body.appendChild(a); a.click();
          setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
          PLC.dom.toast('Saved ' + base + '.png');
        }, 'image/png');
      };
      img.onerror = () => PLC.dom.toast('The image could not be created', 'error');
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
    }

    // =================================================================== welcome
    async welcome() {
      this.ui.welcomed = true;
      this.saveUiSoon();
      const body = h('div.welcome', null,
        h('p.lead', { text: 'LadderLab is a PLC simulator for learning ladder diagrams and Structured Text. Programs run on a simulated controller that drives animated machines.' }),
        h('ol.steps', null,
          h('li', null, h('b', { text: 'Write a program' }), ' in the editor: ladder rungs or Structured Text.'),
          h('li', null, h('b', { text: 'Press Run' }), ' (F5). The PLC scans your program every 10 ms; green lines show power flow.'),
          h('li', null, h('b', { text: 'Operate the machine' }), ' on the right: press buttons, flip switches, and watch it react.'),
          h('li', null, h('b', { text: 'Follow the lessons' }), ' on the left. Each lesson checks your program automatically.')));
      const v = await PLC.dom.modal('Welcome to LadderLab', body, [
        { label: 'Explore the Sandbox', value: 'sandbox' },
        { label: 'Start lesson 1', value: 'course', primary: true }
      ], { cancelValue: null, wide: true });
      if (v === 'course') { const first = PLC.lessons.all()[0]; if (first) this.openLesson(first.id); }
      else if (v === 'sandbox' && this.workspace.kind !== 'sandbox') this.openSandbox();
    }
  }

  function stKind(src) {
    const m = /^\s*(?:(?:\(\*[\s\S]*?\*\)|\/\/[^\n]*)\s*)*(FUNCTION_BLOCK|FUNCTION|PROGRAM)\b/i.exec(src || '');
    return m ? m[1].toUpperCase() : 'PROGRAM';
  }
  function ordinal(n) { return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'); }

  PLC.App = App;
})(window.PLC = window.PLC || {});
