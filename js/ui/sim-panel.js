/* LadderLab — process view: hosts the selected scene (machine) next to the editor. */
(function (PLC) {
  'use strict';
  const { h, button } = PLC.dom;

  class SimPanel {
    constructor(app, host) {
      this.app = app;
      this.root = h('div.sim-panel');
      const head = h('div.panel-head');
      this.select = h('select.input.sm.scene-select', { 'aria-label': 'Machine' });
      this.select.addEventListener('change', () => this.app.changeScene(this.select.value));
      this.desc = h('span.scene-desc');
      head.append(h('span.panel-title', { text: 'Machine' }), this.select,
        button('Reset machine', { icon: 'reset', iconOnly: true, cls: 'ghost sm', title: 'Put the machine back into its starting state', onClick: () => this.app.resetScene() }));
      this.canvas = h('canvas.scene-canvas', { tabindex: '0', role: 'img' });
      this.stage = h('div.scene-stage', null, this.canvas);
      this.root.append(head, this.desc, this.stage);
      host.appendChild(this.root);
      this.view = new PLC.scenes.SceneView(this.canvas);
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(() => this.resize()).observe(this.stage);
      }
      window.addEventListener('resize', () => this.resize());
    }

    fill() {
      const cur = this.app.project ? this.app.project.scene : 'trainer';
      this.select.textContent = '';
      for (const s of PLC.scenes.list()) this.select.appendChild(h('option', { value: s.id, text: s.name }));
      this.select.value = cur;
    }

    setScene(def, inst) {
      this.fill();
      this.view.setScene(def, inst);
      this.desc.textContent = def.description + ' Tip: Shift+click a push button to keep it pressed.';
      this.canvas.setAttribute('aria-label', def.name + ' simulation. ' + def.description);
      this.updateNames();
      this.resize();
    }

    updateNames() {
      const names = {};
      for (const t of this.app.project.tags) if (t.address) names[String(t.address).toUpperCase()] = t.name;
      this.view.names = names;
    }

    resize() {
      if (!this.view.def) return;
      const w = this.stage.clientWidth - 22, hgt = this.stage.clientHeight - 16;
      if (w <= 0) return;
      // in the stacked (narrow) layout the stage grows with the canvas, so only the width limits it
      const narrow = this.app.isNarrow();
      this.view.resize(w, narrow ? window.innerHeight * 0.75 : (hgt > 60 ? hgt : null));
      this.draw();
    }

    refreshTheme() { this.view.refreshColors(); this.draw(); }

    draw() { if (this.view.def) this.view.draw(this.app.rt.phys, this.app.rt.time); }
  }

  PLC.SimPanel = SimPanel;
})(window.PLC = window.PLC || {});
