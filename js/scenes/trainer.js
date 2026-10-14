/* LadderLab scene: I/O trainer board — 8 toggle switches, 8 push buttons, 16 lamps, 2 potentiometers, 2 displays. */
(function (PLC) {
  'use strict';
  const T = PLC.types;

  const tags = [];
  for (let i = 0; i < 8; i++) tags.push({ name: 'Switch' + (i + 1), type: 'BOOL', address: '%IX0.' + i, comment: 'Toggle switch ' + (i + 1) });
  for (let i = 0; i < 8; i++) tags.push({ name: 'Button' + (i + 1), type: 'BOOL', address: '%IX1.' + i, comment: 'Push button ' + (i + 1) + ' (momentary, NO)' });
  for (let i = 0; i < 16; i++) tags.push({ name: 'Lamp' + (i + 1), type: 'BOOL', address: T.addressText('Q', i), comment: 'Pilot lamp ' + (i + 1) });
  tags.push({ name: 'Pot1', type: 'INT', address: '%IW0', comment: 'Potentiometer 1 (0..1000)' });
  tags.push({ name: 'Pot2', type: 'INT', address: '%IW1', comment: 'Potentiometer 2 (0..1000)' });
  tags.push({ name: 'Display1', type: 'INT', address: '%QW0', comment: 'Numeric display 1' });
  tags.push({ name: 'Display2', type: 'INT', address: '%QW1', comment: 'Numeric display 2' });

  const LAMP_COLORS = ['green', 'green', 'yellow', 'yellow', 'red', 'red', 'blue', 'white'];

  PLC.scenes.register({
    id: 'trainer',
    name: 'I/O Trainer',
    description: 'A training board with switches, push buttons, lamps, potentiometers and displays. Good for logic exercises.',
    width: 640, height: 520,
    tags,
    create() {
      const st = { buttons: new Array(8).fill(false) };
      return {
        reset(phys) { st.buttons.fill(false); void phys; },
        step() { /* operator panel only: no plant physics */ },
        draw(g, phys) {
          const name = (addr, def) => g.names[addr] || def;
          g.plate(12, 10, 616, 214, 'Digital inputs');
          g.text('toggle switches  %IX0.0 – %IX0.7', 620, 24, { align: 'right', size: 10, font: 'mono', color: g.c.ink3 });
          for (let i = 0; i < 8; i++) {
            const x = 56 + i * 75, a = '%IX0.' + i;
            g.toggle({ x, y: 66, on: phys.I[i], signal: phys.I[i], addr: a, onToggle: () => { phys.I[i] = !phys.I[i]; } });
            g.label(name(a, 'Switch' + (i + 1)), x, 98, { maxWidth: 70 });
          }
          g.text('push buttons  %IX1.0 – %IX1.7', 620, 132, { align: 'right', size: 10, font: 'mono', color: g.c.ink3 });
          for (let i = 0; i < 8; i++) {
            const x = 56 + i * 75, a = '%IX1.' + i, idx = 8 + i;
            g.pushButton({
              x, y: 166, r: 14, color: i < 4 ? 'green' : i < 6 ? 'red' : 'black', pressed: st.buttons[i], signal: phys.I[idx],
              onPress: v => { st.buttons[i] = v; phys.I[idx] = v; }
            });
            g.label(name(a, 'Button' + (i + 1)), x, 197, { maxWidth: 70 });
            g.addr(a, x, 211, { active: phys.I[idx] });
          }

          g.plate(12, 232, 616, 178, 'Digital outputs');
          for (let i = 0; i < 16; i++) {
            const row = Math.floor(i / 8), col = i % 8;
            const x = 56 + col * 75, y = 276 + row * 74;
            const a = T.addressText('Q', i);
            g.lamp({ x, y, r: 12, color: LAMP_COLORS[col], on: phys.Q[i] });
            g.label(name(a, 'Lamp' + (i + 1)), x, y + 27, { maxWidth: 70 });
            g.addr(a, x, y + 41, { active: phys.Q[i] });
          }

          g.plate(12, 418, 616, 94, 'Analog');
          for (let i = 0; i < 2; i++) {
            const x = 40 + i * 190, a = '%IW' + i;
            g.slider({ x, y: 466, w: 150, value: phys.IW[i] / T.IO.ANALOG_MAX, onChange: v => { phys.IW[i] = Math.round(v * T.IO.ANALOG_MAX); } });
            g.label(name(a, 'Pot' + (i + 1)) + '  ' + phys.IW[i], x + 75, 449, { maxWidth: 150 });
            g.addr(a, x + 75, 488);
          }
          for (let i = 0; i < 2; i++) {
            const x = 460 + i * 100, a = '%QW' + i;
            g.display({ x, y: 462, value: phys.QW[i], digits: 4, size: 20 });
            g.label(name(a, 'Display' + (i + 1)), x, 488, { maxWidth: 90 });
            g.addr(a, x, 502);
          }
        }
      };
    }
  });
})(window.PLC = window.PLC || {});
