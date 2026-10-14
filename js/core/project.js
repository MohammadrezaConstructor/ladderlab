/* LadderLab — project format: creation, normalisation, import/export. */
(function (PLC) {
  'use strict';

  const FORMAT = 'ladderlab-project';
  const VERSION = 1;
  const uid = () => PLC.util.uid('p');

  function ldPou(name, rungs) {
    return { id: uid(), name: name || 'Main', lang: 'LD', rungs: rungs || [PLC.ladder.makeRung()] };
  }
  function stPou(name, source) {
    return { id: uid(), name: name || 'Main', lang: 'ST', source: source || '' };
  }

  function create(opts) {
    opts = opts || {};
    const p = {
      format: FORMAT, version: VERSION,
      name: opts.name || 'My project',
      scene: opts.scene || 'trainer',
      scanTime: 10,
      tags: opts.tags ? PLC.util.clone(opts.tags) : [],
      pous: [],
      trace: opts.trace || []
    };
    if (opts.lang === 'ST') p.pous.push(stPou('Main', opts.source || ''));
    else p.pous.push(ldPou('Main', opts.rungs));
    return p;
  }

  /** Make an imported/loaded object safe to use. Accepts compact lesson specs too:
   *  pous: [{ name, lang:'LD', rungs:[ 'NO(A) COIL(B)', {comment, text} ] }, { name, lang:'ST', source }] */
  function normalize(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Not a LadderLab project');
    if (raw.format && raw.format !== FORMAT) throw new Error('This file is not a LadderLab project (format "' + raw.format + '")');
    const p = {
      format: FORMAT, version: VERSION,
      name: typeof raw.name === 'string' ? raw.name : 'Imported project',
      scene: typeof raw.scene === 'string' ? raw.scene : 'trainer',
      scanTime: PLC.util.clamp(parseInt(raw.scanTime, 10) || 10, 1, 1000),
      tags: [],
      pous: [],
      trace: Array.isArray(raw.trace) ? raw.trace.filter(x => typeof x === 'string') : []
    };
    for (const t of Array.isArray(raw.tags) ? raw.tags : []) {
      if (!t || typeof t !== 'object') continue;
      p.tags.push({
        name: String(t.name || ''), type: String(t.type || 'BOOL'),
        address: t.address ? String(t.address) : '', init: t.init !== undefined && t.init !== null ? String(t.init) : '',
        comment: t.comment ? String(t.comment) : ''
      });
    }
    for (const q of Array.isArray(raw.pous) ? raw.pous : []) {
      if (!q || typeof q !== 'object') continue;
      if (q.lang === 'ST') {
        p.pous.push({ id: q.id || uid(), name: String(q.name || 'Program'), lang: 'ST', source: String(q.source || '') });
      } else {
        const rungs = [];
        for (const r of Array.isArray(q.rungs) ? q.rungs : []) {
          if (typeof r === 'string') rungs.push(PLC.ladder.rungFromText(r));
          else if (r && typeof r.text === 'string' && !r.body) rungs.push(PLC.ladder.rungFromText(r.text, r.comment || ''));
          else if (r && r.body) rungs.push(sanitizeRung(r));
        }
        if (!rungs.length) rungs.push(PLC.ladder.makeRung());
        p.pous.push({ id: q.id || uid(), name: String(q.name || 'Main'), lang: 'LD', rungs });
      }
    }
    if (!p.pous.length) p.pous.push(ldPou('Main'));
    return p;
  }

  function sanitizeRung(r) {
    const L = PLC.ladder;
    function node(n) {
      if (!n || typeof n !== 'object') return null;
      if (n.t === 'E') {
        if (!L.KINDS[n.kind]) return null;
        const params = {};
        if (n.params && typeof n.params === 'object') for (const k of Object.keys(n.params)) params[k] = String(n.params[k]);
        return { t: 'E', id: String(n.id || PLC.util.uid('l')), kind: n.kind, tag: String(n.tag || ''), params };
      }
      if (n.t === 'P') {
        const br = (n.branches || []).map(series).filter(Boolean);
        return br.length ? { t: 'P', id: String(n.id || PLC.util.uid('l')), branches: br } : null;
      }
      return null;
    }
    function series(s) {
      if (!s || s.t !== 'S') return null;
      return { t: 'S', id: String(s.id || PLC.util.uid('l')), items: (s.items || []).map(node).filter(Boolean) };
    }
    const body = series(r.body) || L.makeSeries([]);
    L.normalize(body);
    return { id: String(r.id || PLC.util.uid('l')), comment: String(r.comment || ''), body };
  }

  function serialize(project) {
    return JSON.stringify(project, null, 2);
  }

  function parse(text) {
    let raw;
    try { raw = JSON.parse(text); } catch (e) { throw new Error('The file is not valid JSON: ' + e.message); }
    return normalize(raw);
  }

  /** Merge a scene's I/O tag list into a project (adds missing tags, fixes addresses of existing ones). */
  function applySceneTags(project, sceneTags) {
    const byName = new Map(project.tags.map(t => [t.name.toLowerCase(), t]));
    let added = 0;
    for (const st of sceneTags) {
      const ex = byName.get(st.name.toLowerCase());
      if (ex) continue;
      // free the address if another tag already uses it
      for (const t of project.tags) if (t.address && st.address && t.address.toUpperCase() === st.address.toUpperCase()) t.address = '';
      project.tags.push({ name: st.name, type: st.type || 'BOOL', address: st.address || '', init: st.init || '', comment: st.comment || '' });
      added++;
    }
    return added;
  }

  PLC.project = { FORMAT, VERSION, create, normalize, serialize, parse, ldPou, stPou, applySceneTags };
})(window.PLC = window.PLC || {});
