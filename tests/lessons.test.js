'use strict';
// Every lesson must be self-consistent: its solution passes its own tests, its starter does not,
// its tags fit the scene wiring, and its figures parse.
const test = require('node:test');
const assert = require('node:assert/strict');
const PLC = require('./load.js');

const lessons = PLC.lessons.all();

test('lessons are registered with unique ids and known chapters', () => {
  assert.ok(lessons.length > 0);
  const ids = new Set();
  for (const l of lessons) {
    assert.ok(!ids.has(l.id), 'duplicate id ' + l.id);
    ids.add(l.id);
    assert.ok(PLC.lessons.CHAPTERS.some(c => c.id === l.chapter), l.id + ': unknown chapter ' + l.chapter);
    for (const k of ['title', 'goal', 'theory', 'task']) assert.ok(l[k] && String(l[k]).trim(), l.id + ': missing ' + k);
    assert.ok(Array.isArray(l.tests) && l.tests.length, l.id + ': needs tests');
    assert.ok(Array.isArray(l.hints) && l.hints.length, l.id + ': needs hints');
  }
});

for (const l of lessons) {
  test('lesson ' + l.id, () => {
    // scene wiring
    const scene = PLC.scenes && PLC.scenes.get(l.scene);
    if (PLC.scenes && PLC.scenes.list().length >= 9) assert.ok(scene, l.id + ': unknown scene ' + l.scene);
    if (scene) {
      for (const t of l.tags) {
        if (!t.address) continue;
        const st = scene.tags.find(s => s.address === t.address);
        assert.ok(st, l.id + ': address ' + t.address + ' of ' + t.name + ' is not wired in scene ' + l.scene);
        assert.equal(st.name, t.name, l.id + ': ' + t.address + ' is called ' + st.name + ' in scene ' + l.scene + ', not ' + t.name);
      }
    }
    // figures parse
    const figs = String(l.theory).match(/data-rungs=(["'])(.*?)\1/g) || [];
    for (const f of figs) {
      const text = f.replace(/^data-rungs=["']/, '').replace(/["']$/, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      for (const r of text.split('||')) assert.doesNotThrow(() => PLC.ladder.parseRungText(r), l.id + ': figure "' + r + '"');
    }
    // solution passes
    const sol = PLC.lessons.makeProject(l, 'solution');
    const c = PLC.compiler.compileProject(sol);
    const errs = c.diagnostics.filter(d => d.severity === 'error');
    assert.equal(errs.length, 0, l.id + ': solution has errors ' + JSON.stringify(errs));
    const r = PLC.grader.runTests(sol, l.tests);
    assert.ok(r.passed, l.id + ': solution fails: ' + JSON.stringify(r.results.filter(x => !x.passed)));
    // starter does not pass (otherwise there is nothing to do)
    const st = PLC.lessons.makeProject(l, 'starter');
    const r2 = PLC.grader.runTests(st, l.tests);
    assert.ok(!r2.passed, l.id + ': the starter program already passes every test');
    // quiz sanity
    for (const q of l.quiz || []) {
      assert.ok(q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length, l.id + ': bad quiz item ' + q.q);
    }
  });
}
