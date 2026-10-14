/* LadderLab scene: three-phase motor with forward/reverse contactors and a thermal overload relay. */
(function (PLC) {
  'use strict';

  const tags = [
    { name: 'Start', type: 'BOOL', address: '%IX0.0', comment: 'Start push button, green (NO contact)' },
    { name: 'Stop', type: 'BOOL', address: '%IX0.1', comment: 'Stop push button, red (NC contact: TRUE when NOT pressed)' },
    { name: 'Start_Rev', type: 'BOOL', address: '%IX0.2', comment: 'Start reverse push button (NO contact)' },
    { name: 'Overload', type: 'BOOL', address: '%IX0.3', comment: 'Overload relay contact (NC: TRUE = OK, FALSE = tripped)' },
    { name: 'Motor', type: 'BOOL', address: '%QX0.0', comment: 'Contactor K1: motor forward' },
    { name: 'Motor_Rev', type: 'BOOL', address: '%QX0.1', comment: 'Contactor K2: motor reverse' },
    { name: 'Lamp_Run', type: 'BOOL', address: '%QX0.2', comment: 'Green pilot lamp: running' },
    { name: 'Lamp_Fault', type: 'BOOL', address: '%QX0.3', comment: 'Red pilot lamp: fault' }
  ];

  PLC.scenes.register({
    id: 'motor',
    name: 'Motor Starter',
    description: 'Start, stop and reverse a three-phase motor. The stop button and overload relay are wired as NC contacts, as in real control cabinets.',
    width: 640, height: 400,
    tags,
    create() {
      const st = {};
      function reset(phys) {
        st.start = false; st.stop = false; st.rev = false;
        st.olTripped = false; st.fuseBlown = false; st.burnt = false;
        st.speed = 0; st.angle = 0; st.overheat = 0; st.revWarn = 0;
        if (phys) { phys.I[1] = true; phys.I[3] = true; }
      }
      reset(null);
      return {
        reset,
        step(dt, phys) {
          const s = dt / 1000;
          const k1 = phys.Q[0], k2 = phys.Q[1];
          if (k1 && k2 && !st.fuseBlown) st.fuseBlown = true;
          const powered = !st.fuseBlown && !st.burnt;
          const target = powered ? (k1 && !k2 ? 1 : k2 && !k1 ? -1 : 0) : 0;
          if (powered && target !== 0 && Math.sign(target) === -Math.sign(st.speed) && Math.abs(st.speed) > 0.5) st.revWarn = 2.5;
          st.revWarn = Math.max(0, st.revWarn - s);
          st.speed += (target - st.speed) * Math.min(1, s / 0.45);
          if (Math.abs(st.speed) < 0.002 && target === 0) st.speed = 0;
          st.angle += st.speed * s * Math.PI * 2 * 2.2;
          // overload contact tripped but the program keeps the motor on → it overheats
          if (st.olTripped && powered && target !== 0) st.overheat += s; else st.overheat = Math.max(0, st.overheat - s * 0.5);
          if (st.overheat > 3) st.burnt = true;
          phys.I[3] = !st.olTripped;
        },
        draw(g, phys) {
          const W = g.W;
          // operator station
          g.plate(12, 50, 190, 338, 'Operator station');
          g.pushButton({ x: 60, y: 110, color: 'green', label: 'Start', addr: '%IX0.0', nc: false, pressed: st.start, signal: phys.I[0], onPress: v => { st.start = v; phys.I[0] = v; } });
          g.pushButton({ x: 154, y: 110, color: 'red', label: 'Stop', addr: '%IX0.1', nc: true, pressed: st.stop, signal: phys.I[1], onPress: v => { st.stop = v; phys.I[1] = !v; } });
          g.pushButton({ x: 60, y: 214, color: 'blue', label: 'Start rev', addr: '%IX0.2', nc: false, pressed: st.rev, signal: phys.I[2], onPress: v => { st.rev = v; phys.I[2] = v; } });
          g.lamp({ x: 60, y: 312, color: 'green', on: phys.Q[2], label: 'Run', addr: '%QX0.2' });
          g.lamp({ x: 154, y: 312, color: 'red', on: phys.Q[3], label: 'Fault', addr: '%QX0.3' });
          g.text('NC = TRUE while', 154, 196, { size: 9.5, color: g.c.ink3 });
          g.text('not pressed', 154, 208, { size: 9.5, color: g.c.ink3 });

          // power circuit
          g.plate(214, 50, 200, 338, 'Control cabinet');
          contactor(g, 260, 104, 'K1', 'Forward', '%QX0.0', phys.Q[0]);
          contactor(g, 360, 104, 'K2', 'Reverse', '%QX0.1', phys.Q[1]);
          // fuse
          g.roundRect(290, 196, 40, 22, 3, st.fuseBlown ? g.c.fault : g.c.surface, g.c.ink2, 1.2);
          g.text(st.fuseBlown ? 'BLOWN' : 'F1', 310, 207.5, { size: 9.5, font: 'mono', color: st.fuseBlown ? '#fff' : g.c.ink2 });
          if (st.fuseBlown) g.button({ x: 268, y: 224, text: 'Replace fuse', small: true, onClick: () => { st.fuseBlown = false; } });
          // overload relay
          g.roundRect(240, 262, 150, 54, 5, g.c.surface, g.c.ink2, 1.2);
          g.text('Overload relay F2', 315, 276, { size: 10.5, weight: 700, color: g.c.ink });
          g.led(256, 298, st.olTripped, 'red', 4);
          g.text(st.olTripped ? 'TRIPPED' : 'OK', 268, 298, { size: 10, font: 'mono', align: 'left', color: st.olTripped ? g.c.fault : g.c.power });
          g.button({ x: 322, y: 288, h: 20, w: 56, text: st.olTripped ? 'Reset' : 'Trip', small: true, onClick: () => { st.olTripped = !st.olTripped; } });
          g.addr('%IX0.3', 315, 332, { active: phys.I[3] });
          g.text('NC contact', 315, 350, { size: 9.5, color: g.c.ink3 });

          // motor
          g.plate(426, 50, 202, 338, 'Motor M1');
          const run = Math.abs(st.speed) > 0.02;
          g.motor({ x: 527, y: 190, r: 52, angle: st.angle, running: run && !st.burnt, fault: st.burnt });
          const rpm = Math.round(st.speed * 1450);
          g.display({ x: 527, y: 300, value: Math.abs(rpm), digits: 4, size: 20, label: 'Speed (rpm)' });
          if (run) g.text(st.speed > 0 ? '↻ forward' : '↺ reverse', 527, 112, { size: 12, weight: 700, color: g.c.ink });
          if (st.burnt) g.button({ x: 487, y: 344, text: 'Repair motor', small: true, onClick: () => { st.burnt = false; st.overheat = 0; } });

          if (st.fuseBlown) g.banner('Short circuit! K1 and K2 were on together. Add an interlock.', 'fault', W);
          else if (st.burnt) g.banner('Motor burnt out: it kept running after the overload relay tripped.', 'fault', W);
          else if (st.olTripped && run) g.banner('Overload tripped: the program must switch the motor off.', 'warn', W);
          else if (st.revWarn > 0) g.banner('Reversed at full speed. Stop the motor before reversing.', 'warn', W);
          else g.text('Click and hold the buttons. Stop is wired NC, so its input is TRUE until pressed.', W / 2, 26, { size: 11.5, color: g.c.ink2 });
        }
      };
    }
  });

  function contactor(g, x, y, name, sub, addr, on) {
    g.roundRect(x - 34, y - 26, 68, 86, 5, g.c.dark ? '#2b3439' : '#e8ecee', g.c.ink2, 1.2);
    g.text(name, x, y - 12, { size: 13, weight: 700, font: 'ui' });
    g.text(sub, x, y + 3, { size: 9.5, color: g.c.ink2 });
    // armature moves when the coil is energised
    const ay = on ? y + 22 : y + 30;
    g.roundRect(x - 22, ay, 44, 10, 2, on ? g.c.power : g.c.steel, null);
    for (let i = -1; i <= 1; i++) g.line(x + i * 14, y + 44, x + i * 14, ay + 10, g.c.ink3, 1.5);
    g.addr(addr, x, y + 72, { active: on });
  }
})(window.PLC = window.PLC || {});
