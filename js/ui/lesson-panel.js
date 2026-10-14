/* LadderLab — course map and lesson view (theory, task, hints, checker, quiz). */
(function (PLC) {
  'use strict';
  const { h, s, button, icon, clear } = PLC.dom;

  /** Turn figure placeholders inside rendered lesson/reference HTML into real diagrams. */
  function renderFigures(root, tags) {
    const tagInfo = tags ? (name => {
      const base = String(name).split('.')[0].toLowerCase();
      const t = tags.find(x => x.name.toLowerCase() === base);
      return t ? { address: String(name).includes('.') ? '' : t.address, comment: t.comment } : null;
    }) : null;
    root.querySelectorAll('.ld-figure').forEach(el => {
      const text = el.getAttribute('data-rungs') || '';
      try {
        const fig = PLC.ladderView.figure(text.split('||'), tagInfo);
        el.textContent = '';
        el.appendChild(fig);
      } catch (e) { el.textContent = 'Figure error: ' + e.message; }
    });
    root.querySelectorAll('pre.st-figure').forEach(el => {
      el.innerHTML = PLC.stHighlight(el.textContent.replace(/^\n+|\s+$/g, ''));
    });
    root.querySelectorAll('.td-figure').forEach(el => {
      try {
        const sigs = JSON.parse(el.getAttribute('data-signals') || '[]');
        el.textContent = '';
        el.appendChild(timingFigure(sigs, el.getAttribute('data-step') || ''));
      } catch (e) { el.textContent = 'Figure error: ' + e.message; }
    });
  }

  function timingFigure(sigs, stepLabel) {
    const n = Math.max(...sigs.map(x => x.wave.length), 1);
    const LX = 70, SW = Math.max(14, Math.min(34, Math.floor(420 / n))), LH = 30;
    const W = LX + n * SW + 10, H = sigs.length * (LH + 8) + 24;
    const svg = s('svg', { class: 'timing', viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img', 'aria-label': 'Timing diagram' });
    svg.style.maxWidth = W + 'px';
    for (let i = 0; i <= n; i++) svg.appendChild(s('line', { class: 'tgrid', x1: LX + i * SW, y1: 4, x2: LX + i * SW, y2: H - 18 }));
    sigs.forEach((sig, k) => {
      const y = 6 + k * (LH + 8);
      svg.appendChild(s('text', { class: 'tname', x: 4, y: y + LH / 2 + 4 }, sig.name));
      let d = '', fill = '';
      for (let i = 0; i < sig.wave.length; i++) {
        const hi = sig.wave[i] === '1';
        const yy = hi ? y + 4 : y + LH - 4;
        const x = LX + i * SW;
        d += (i === 0 ? 'M' : 'L') + x + ' ' + yy + ' L' + (x + SW) + ' ' + yy + ' ';
        if (hi) fill += 'M' + x + ' ' + (y + 4) + 'h' + SW + 'v' + (LH - 8) + 'h' + (-SW) + 'z';
      }
      if (fill) svg.appendChild(s('path', { class: 'thigh', d: fill }));
      svg.appendChild(s('path', { class: 'twave', d }));
    });
    if (stepLabel) svg.appendChild(s('text', { class: 'tstep', x: W - 6, y: H - 4, 'text-anchor': 'end' }, 'one step = ' + stepLabel));
    return svg;
  }

  class LessonPanel {
    constructor(app, host) {
      this.app = app;
      this.root = h('div.lesson-panel');
      host.appendChild(this.root);
      this.hintsShown = 0;
      this.results = null;
    }

    render() {
      const ws = this.app.workspace;
      if (ws.kind === 'lesson') this.renderLesson(PLC.lessons.get(ws.id));
      else this.renderMap();
    }

    renderMap() {
      const app = this.app;
      const root = clear(this.root);
      const lessons = PLC.lessons.all();
      const done = lessons.filter(l => app.progress[l.id] && app.progress[l.id].done).length;
      const next = lessons.find(l => !(app.progress[l.id] && app.progress[l.id].done));
      const head = h('div.map-head', null,
        h('h2', { text: 'Course' }),
        h('p.muted', { text: done + ' of ' + lessons.length + ' lessons completed' }),
        h('div.progress', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(lessons.length), 'aria-valuenow': String(done) },
          h('div.progress-bar', { style: { width: (lessons.length ? done / lessons.length * 100 : 0) + '%' } })));
      if (next) head.appendChild(button(done ? 'Continue: ' + next.title : 'Start the course', { icon: 'play', cls: 'primary', onClick: () => app.openLesson(next.id) }));
      root.appendChild(head);
      if (app.workspace.kind !== 'sandbox' || true) {
        const sb = h('button.sandbox-link' + (app.workspace.kind === 'sandbox' ? '.on' : ''), { type: 'button' }, icon('cpu', 18),
          h('span', null, h('strong', { text: 'Sandbox' }), h('span.small.muted', { text: 'Free practice with any machine. Your work is saved in this browser.' })));
        sb.addEventListener('click', () => app.openSandbox());
        root.appendChild(sb);
      }
      for (const ch of PLC.lessons.CHAPTERS) {
        const ls = lessons.filter(l => l.chapter === ch.id);
        if (!ls.length) continue;
        const sec = h('section.chapter');
        const cdone = ls.filter(l => app.progress[l.id] && app.progress[l.id].done).length;
        sec.appendChild(h('div.chapter-head', null, h('h3', { text: ch.title }), h('span.small.muted', { text: cdone + '/' + ls.length })));
        sec.appendChild(h('p.small.muted', { text: ch.blurb }));
        const ol = h('ol.lesson-list');
        for (const l of ls) {
          const isDone = app.progress[l.id] && app.progress[l.id].done;
          const li = h('li');
          const b = h('button.lesson-link' + (isDone ? '.done' : ''), { type: 'button' },
            h('span.lesson-state', null, isDone ? icon('check', 14) : null),
            h('span.lesson-title', { text: l.title }),
            h('span.lesson-lang', { text: l.lang }));
          b.title = l.goal;
          b.addEventListener('click', () => app.openLesson(l.id));
          li.appendChild(b);
          ol.appendChild(li);
        }
        sec.appendChild(ol);
        root.appendChild(sec);
      }
    }

    renderLesson(lesson) {
      const app = this.app;
      const root = clear(this.root);
      if (!lesson) { this.renderMap(); return; }
      if (this._lessonId !== lesson.id) { this._lessonId = lesson.id; this.hintsShown = 0; this.results = null; this.quizState = {}; }
      const all = PLC.lessons.all();
      const idx = all.findIndex(l => l.id === lesson.id);
      const ch = PLC.lessons.CHAPTERS.find(c => c.id === lesson.chapter);
      const nav = h('div.lesson-nav', null,
        button('All lessons', { icon: 'list', cls: 'ghost sm', onClick: () => { app.showCourseMap(); } }),
        h('span.tb-spacer'),
        button('Previous lesson', { icon: 'up', iconOnly: true, cls: 'ghost sm', disabled: idx <= 0, onClick: () => app.openLesson(all[idx - 1].id) }),
        h('span.small.muted', { text: (idx + 1) + ' / ' + all.length }),
        button('Next lesson', { icon: 'down', iconOnly: true, cls: 'ghost sm', disabled: idx >= all.length - 1, onClick: () => app.openLesson(all[idx + 1].id) }));
      root.appendChild(nav);
      const done = app.progress[lesson.id] && app.progress[lesson.id].done;
      root.appendChild(h('div.lesson-eyebrow', { text: (ch ? ch.title : '') + ' · ' + (lesson.lang === 'ST' ? 'Structured Text' : 'Ladder diagram') }));
      root.appendChild(h('h2.lesson-title', null, lesson.title, done ? h('span.done-pill', null, icon('check', 13), 'Done') : null));
      root.appendChild(h('p.lesson-goal', { text: lesson.goal }));

      const theory = h('div.prose.theory', { html: lesson.theory });
      renderFigures(theory, lesson.tags);
      root.appendChild(this.section('Theory', theory, 'theory'));

      const task = h('div.task-box');
      task.appendChild(h('div.prose', { html: lesson.task }));
      const tagNote = h('div.tag-chips');
      for (const t of lesson.tags.filter(t => t.address)) tagNote.appendChild(h('span.chip', { title: t.comment || '' }, h('b', { text: t.name }), ' ' + t.address));
      if (tagNote.childNodes.length) task.append(h('div.small.muted.wiring-label', { text: 'Wiring used in this exercise:' }), tagNote);
      root.appendChild(this.section('Your task', task, 'task'));

      // hints
      const hints = h('div.hints');
      lesson.hints.slice(0, this.hintsShown).forEach((t, i) => hints.appendChild(h('div.hint', null, h('span.hint-n', { text: 'Hint ' + (i + 1) }), h('span', { html: t }))));
      if (this.hintsShown < lesson.hints.length) {
        hints.appendChild(button(this.hintsShown ? 'Show another hint' : 'Show a hint', { icon: 'help', cls: 'sm', onClick: () => { this.hintsShown++; this.renderLesson(lesson); } }));
      }
      root.appendChild(hints);

      // check
      const check = h('div.check-box');
      const checkBtn = button('Check my program', { icon: 'check', cls: 'primary', onClick: () => this.check(lesson) });
      check.appendChild(h('div.check-row', null, checkBtn,
        button('Reset exercise', { icon: 'reset', cls: 'ghost sm', title: 'Start this exercise again from the beginning', onClick: () => app.resetLesson(lesson) }),
        button('Show solution', { icon: 'eye', cls: 'ghost sm', onClick: () => app.showSolution(lesson) })));
      if (this.results) {
        const r = this.results;
        const box = h('div.results' + (r.passed ? '.pass' : '.fail'), { role: 'status' });
        box.appendChild(h('div.results-head', null, icon(r.passed ? 'check' : 'x', 18),
          h('strong', { text: r.passed ? 'All checks passed. Well done!' : 'Not yet. ' + r.results.filter(x => !x.passed).length + ' of ' + r.results.length + ' checks failed.' })));
        for (const t of r.results) {
          box.appendChild(h('div.result-row' + (t.passed ? '.ok' : '.bad'), null, icon(t.passed ? 'check' : 'x', 14), h('span', null, h('b', { text: t.name }), t.passed ? '' : h('span.result-msg', { text: t.message }))));
        }
        if (r.passed && idx < all.length - 1) box.appendChild(button('Next lesson: ' + all[idx + 1].title, { icon: 'chevron', cls: 'primary sm', onClick: () => app.openLesson(all[idx + 1].id) }));
        check.appendChild(box);
      }
      root.appendChild(this.section('Check', check, 'check'));

      if (lesson.quiz && lesson.quiz.length) root.appendChild(this.section('Quick quiz', this.quiz(lesson), 'quiz'));
    }

    section(title, body, cls) {
      return h('section.lsec.lsec-' + cls, null, h('h3.lsec-title', { text: title }), body);
    }

    quiz(lesson) {
      const wrap = h('div.quiz');
      lesson.quiz.forEach((q, qi) => {
        const st = this.quizState[qi];
        const box = h('fieldset.quiz-q');
        box.appendChild(h('legend', { text: (qi + 1) + '. ' + q.q }));
        q.options.forEach((opt, oi) => {
          const chosen = st !== undefined && st === oi;
          const cls = st === undefined ? '' : oi === q.answer ? '.right' : chosen ? '.wrong' : '';
          const b = h('button.quiz-opt' + cls, { type: 'button', disabled: st !== undefined && st === q.answer }, opt);
          b.addEventListener('click', () => { this.quizState[qi] = oi; this.renderLesson(lesson); this.app.saveQuiz(lesson.id, qi, oi === q.answer); });
          box.appendChild(b);
        });
        if (st !== undefined) box.appendChild(h('p.quiz-explain' + (st === q.answer ? '.right' : '.wrong'), { text: (st === q.answer ? 'Correct. ' : 'Not quite. ') + (q.explain || '') }));
        wrap.appendChild(box);
      });
      return wrap;
    }

    check(lesson) {
      const app = this.app;
      app.flushEdits();
      const r = PLC.grader.runTests(app.project, lesson.tests, { scanTime: 10 });
      this.results = r;
      if (r.passed) app.markDone(lesson.id);
      this.renderLesson(lesson);
      const box = this.root.querySelector('.results');
      if (box) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      PLC.dom.toast(r.passed ? 'All checks passed' : 'Some checks failed. See the details in the lesson panel.', r.passed ? 'ok' : 'warn');
    }
  }

  PLC.LessonPanel = LessonPanel;
  PLC.renderFigures = renderFigures;
  PLC.timingFigure = timingFigure;
})(window.PLC = window.PLC || {});
