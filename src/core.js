/* Salle des Machines — noyau : utilitaires, modèle, filtres, helpers de graphiques, insights. */
(function () {
  'use strict';

  const SD = (window.SD = window.SD || {});
  const FONT = '"Barlow", system-ui, -apple-system, "Segoe UI", sans-serif';

  // ================================================================ dates
  const DAY = 864e5;
  const tms = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  const dstr = (ms) => new Date(ms).toISOString().slice(0, 10);
  const addD = (d, n) => dstr(tms(d) + n * DAY);
  const wdOf = (d) => (new Date(tms(d)).getUTCDay() + 6) % 7; // 0 = lundi
  const weekOf = (d) => addD(d, -wdOf(d));
  const monthOf = (d) => d.slice(0, 7) + '-01';
  const nextMonth = (d) => {
    let y = +d.slice(0, 4), m = +d.slice(5, 7) + 1;
    if (m > 12) { m = 1; y++; }
    return `${y}-${String(m).padStart(2, '0')}-01`;
  };
  const nDays = (a, b) => Math.round((tms(b) - tms(a)) / DAY) + 1;
  const WD = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const WDL = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const fdate = (d, o) => new Date(tms(d)).toLocaleDateString('fr-BE', Object.assign({ timeZone: 'UTC' }, o));
  const fdS = (d) => fdate(d, { day: 'numeric', month: 'short' });
  const fdM = (d) => fdate(d, { day: 'numeric', month: 'short', year: 'numeric' });
  const fdL = (d) => fdate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // ================================================================ stats & format
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const pluck = (arr, f) => { const o = []; for (const x of arr) { const v = f(x); if (isNum(v)) o.push(v); } return o; };
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const mean = (a) => (a.length ? sum(a) / a.length : null);
  const median = (a) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const sd = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1)); };
  function pearson(x, y) {
    const n = x.length;
    if (n < 3) return null;
    const mx = mean(x), my = mean(y);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }
  function linreg(x, y) {
    const mx = mean(x), my = mean(y);
    let sxy = 0, sxx = 0;
    for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
    const b = sxx ? sxy / sxx : 0;
    return { a: my - b * mx, b };
  }
  const pctRank = (v, arr) => { let lo = 0, eq = 0; for (const x of arr) { if (x < v) lo++; else if (x === v) eq++; } return (lo + eq / 2) / arr.length; };

  const nf = (v, d = 0) => (isNum(v) ? v.toLocaleString('fr-BE', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const sgn = (v, d = 1) => (isNum(v) ? (v > 0 ? '+' : v < 0 ? '−' : '±') + nf(Math.abs(v), d) : '—');
  const fHM = (min) => {
    if (!isNum(min)) return '—';
    const m = Math.round(min);
    return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
  };
  const fH = (h) => (isNum(h) ? fHM(h * 60) : '—');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ================================================================ thème (lu depuis les tokens CSS)
  let T = {};
  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue('--' + n).trim();
    T = {
      page: g('page'), surface: g('surface'), surface2: g('surface-2'), ink: g('ink'), ink2: g('ink-2'), muted: g('muted'),
      grid: g('grid'), axis: g('axis'), border: g('border-strong'), focus: g('focus'),
      s: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map(g), other: g('s-other'),
      good: g('good'), warn: g('warn'), serious: g('serious'), crit: g('crit'),
      divNeg: g('div-neg'), divMid: g('div-mid'), divPos: g('div-pos'),
      seq: [0, 1, 2, 3, 4, 5].map((i) => g('seq-' + i)),
      phase: { cut: g('phase-cut'), gain: g('phase-gain'), hold: g('phase-hold'), custom: g('phase-custom') },
    };
    SD.T = T;
    return T;
  }

  // ================================================================ config
  const DEFAULT_CFG = {
    athlete: null,
    targets: {
      stepsGoal: 10000, stepsFloor: 8000, sleepHours: 7.5, sessionsPerWeek: 5,
      proteinPerKg: [2.0, 2.2], setsPerMuscleWeek: [10, 20], partialLogKcal: 1200,
      walkAsymBase: 2, walkAsymAlert: 9,
      weeklyRate: { 'Prise de masse': [0.1, 0.2], 'Sèche': [-0.9, -0.4], 'Maintien': [-0.1, 0.1] },
    },
    keyExercises: [],
    deadline: null,
  };
  function withDefaults(cfg) {
    const out = JSON.parse(JSON.stringify(DEFAULT_CFG));
    if (!cfg) return out;
    for (const [k, v] of Object.entries(cfg)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) Object.assign(out[k], v);
      else if (v !== undefined) out[k] = v;
    }
    return out;
  }

  // ================================================================ activités & splits
  const TYPE_ORDER = ['Musculation', 'Vélo', 'Marche', 'Course', 'Escaliers', 'Elliptique', 'Rameur', 'Autre'];
  const typeKey = (t) => (TYPE_ORDER.includes(t) ? t : 'Autre');
  const typeColor = (t) => { const i = TYPE_ORDER.indexOf(typeKey(t)); return i >= 0 && i < 7 ? T.s[i] : T.other; };
  const STRENGTH = new Set(['Musculation', 'Renfo fonctionnel']);

  const LEGS = new Set(['Quadriceps', 'Ischios', 'Fessiers', 'Mollets', 'Adducteurs', 'Abducteurs', 'Tibial']);
  const PUSH = new Set(['Pectoraux', 'Deltoïdes ant.', 'Deltoïdes lat.', 'Triceps']);
  const PULL = new Set(['Dorsaux', 'Haut du dos', 'Biceps', 'Deltoïdes post.', 'Trapèzes', 'Avant-bras']);
  const SPLITS = ['Push', 'Pull', 'Bas du corps', 'Haut du corps', 'Full body', 'Non classé'];
  const splitColor = (s) => { const i = SPLITS.indexOf(s); return i >= 0 && i < 5 ? T.s[i] : T.other; };

  /** Split déduit : groupes musculaires MacroFactor si dispo, sinon mots-clés des exercices. */
  function detectSplit(x) {
    let L = 0, Pu = 0, Pl = 0;
    if (x.mus.length) {
      for (const m of x.mus) {
        const s = m.sets || 0;
        if (LEGS.has(m.m)) L += s; else if (PUSH.has(m.m)) Pu += s; else if (PULL.has(m.m)) Pl += s;
      }
    } else if (x.ex.length) {
      for (const e of x.ex) {
        const s = e.sets || 1, n = e.n.toLowerCase();
        if (/leg|squat|lunge|calf|hip|glute|hack|deadlift|adduct|abduct|step.?up/.test(n)) L += s;
        else if (/row|pull|\blat\b|curl|bicep|face|shrug|rear|chin/.test(n)) Pl += s;
        else if (/chest|bench|press|fly|pec|tricep|dip|raise|shoulder|push/.test(n)) Pu += s;
      }
    }
    const tot = L + Pu + Pl;
    if (tot < 3) return 'Non classé';
    const l = L / tot, pu = Pu / tot, pl = Pl / tot;
    if (l >= 0.6) return 'Bas du corps';
    if (pu >= 0.6) return 'Push';
    if (pl >= 0.6) return 'Pull';
    if (l < 0.25) return 'Haut du corps';
    return 'Full body';
  }

  // ================================================================ modèle
  function prepare(raw) {
    const cfg = withDefaults(raw.config);
    const from = raw.coverage.from, to = raw.coverage.to;
    const src = new Map(raw.days.map((x) => [x.d, x]));
    const days = [];
    for (let d = from; d <= to; d = addD(d, 1)) days.push(Object.assign({ d }, src.get(d)));
    const idx = new Map(days.map((x, i) => [x.d, i]));
    const at = (d) => days[idx.get(d)];
    for (const x of days) {
      x.wd = wdOf(x.d); x.w = []; x.ex = []; x.mus = [];
      if (isNum(x.sleepMin)) x.sleepH = x.sleepMin / 60;
    }
    for (const w of raw.workouts) { const x = at(w.d); if (x) x.w.push(w); }
    for (const e of raw.exercises) { const x = at(e.d); if (x) x.ex.push(e); }
    for (const m of raw.muscles) { const x = at(m.d); if (x) x.mus.push(m); }
    for (const x of days) {
      const str = x.w.filter((w) => STRENGTH.has(w.type));
      x.train = str.length > 0;
      const sm = pluck(str, (w) => w.min);
      x.strMin = sm.length ? sum(sm) : null;
      const am = pluck(x.w, (w) => w.min);
      x.actMin = am.length ? sum(am) : 0;
      x.split = x.train ? detectSplit(x) : null;
    }

    // Poids tendance : Trend Weight MacroFactor, sinon moyenne exponentielle (10 %) des pesées
    let ema = null, lastW = null;
    for (const x of days) {
      if (isNum(x.weight)) {
        if (ema == null || (lastW && nDays(lastW, x.d) > 21)) ema = x.weight;
        else ema += 0.1 * (x.weight - ema);
        lastW = x.d;
      }
      if (isNum(x.trend)) { x.trendW = x.trend; x.trendSrc = 'MacroFactor'; ema = x.trend; }
      else if (ema != null && lastW && nDays(lastW, x.d) <= 21) { x.trendW = Math.round(ema * 100) / 100; x.trendSrc = 'calculée'; }
    }

    // Cibles nutrition (MacroFactor) : dernière mise à jour <= jour, même jour de semaine
    const upd = [];
    for (const t of [...raw.targets].sort((a, b) => a.d.localeCompare(b.d))) {
      let u = upd[upd.length - 1];
      if (!u || u.d !== t.d) upd.push((u = { d: t.d, wd: {} }));
      u.wd[t.wd] = t;
    }
    let ui = -1;
    for (const x of days) {
      while (ui + 1 < upd.length && upd[ui + 1].d <= x.d) ui++;
      if (ui >= 0) { const t = upd[ui].wd[(x.wd + 1) % 7]; if (t) x.tgt = t; }
    }

    // Phases
    const phases = (raw.phases || []).map((p) => Object.assign({}, p, { end: p.end || to }));
    for (const p of phases) {
      const s = p.start < from ? from : p.start;
      for (let d = s; d <= p.end && d <= to; d = addD(d, 1)) { const x = at(d); if (x) x.phase = p.name; }
    }

    // Moyennes glissantes 7 j (jours complets uniquement, au moins 4 valeurs)
    const roll = (key, out, win = 7, minN = 4) => {
      for (let i = 0; i < days.length; i++) {
        const a = [];
        for (let j = Math.max(0, i - win + 1); j <= i; j++) { const v = days[j][key]; if (isNum(v) && !days[j].partial) a.push(v); }
        days[i][out] = a.length >= minN ? mean(a) : null;
      }
    };
    roll('sleepH', 'sleep7'); roll('hrv', 'hrv7'); roll('rhr', 'rhr7'); roll('steps', 'steps7');

    // Score de récupération (0-100) : moyenne de 2 ou 3 composantes disponibles
    //  sommeil / cible ; rang de la HRV sur les 60 j précédents ; rang inverse de la FC repos sur 60 j.
    for (let i = 0; i < days.length; i++) {
      const x = days[i];
      if (x.partial) continue;
      const comps = {};
      if (isNum(x.sleepH)) comps.sleep = Math.min(100, (x.sleepH / cfg.targets.sleepHours) * 100);
      const win = days.slice(Math.max(0, i - 60), i);
      const hw = pluck(win, (y) => y.hrv), rw = pluck(win, (y) => y.rhr);
      if (isNum(x.hrv) && hw.length >= 14) comps.hrv = 100 * pctRank(x.hrv, hw);
      if (isNum(x.rhr) && rw.length >= 14) comps.rhr = 100 * (1 - pctRank(x.rhr, rw));
      const v = Object.values(comps);
      if (v.length >= 2) { x.rec = mean(v); x.recC = comps; }
    }

    // Variation de poids tendance sur 7 j
    for (let i = 7; i < days.length; i++) {
      const a = days[i - 7].trendW, b = days[i].trendW;
      if (isNum(a) && isNum(b)) days[i].trendD7 = b - a;
    }

    // Exercices : index par nom + source
    const exIndex = new Map();
    for (const e of raw.exercises) {
      const k = e.n + '|' + e.s;
      const o = exIndex.get(k) || { key: k, n: e.n, s: e.s, count: 0, first: e.d, last: e.d };
      o.count++; if (e.d < o.first) o.first = e.d; if (e.d > o.last) o.last = e.d;
      exIndex.set(k, o);
    }

    const partialDays = days.filter((x) => x.partial).map((x) => x.d);
    const lastComplete = [...days].reverse().find((x) => !x.partial && isNum(x.steps));
    return {
      raw, cfg, days, idx, at, phases, exIndex,
      first: from, last: to, lastComplete: lastComplete ? lastComplete.d : to, partialDays,
    };
  }

  // ================================================================ état
  const PRESETS = [['7j', '7 j', 7], ['30j', '30 j', 30], ['90j', '90 j', 90], ['6m', '6 mois', 183], ['12m', '12 mois', 365], ['ytd', 'Année', null], ['all', 'Tout', null]];
  const DEFAULT_STATE = {
    page: 'overview', preset: '6m', from: null, to: null, wds: [0, 1, 2, 3, 4, 5, 6], dayKind: 'all', types: null, gran: 'auto',
    ex: null, exMetric: 'e1', corrX: 'sleepH', corrY: 'hrv', corrLag: 0, measure: 'Tour de taille', macroView: 'g',
    partialKcal: null, calMetric: 'actMin',
  };
  const S = (SD.S = Object.assign({}, DEFAULT_STATE));
  const STORE_KEY = 'sdm-state-v1';
  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved && typeof saved === 'object') Object.assign(S, saved);
    } catch (e) { /* stockage indisponible : on garde les valeurs par défaut */ }
  }
  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* ignoré */ }
  }
  function presetRange(p) {
    const M = SD.M, to = M.last;
    if (p === 'all') return [M.first, to];
    if (p === 'ytd') return [to.slice(0, 4) + '-01-01' < M.first ? M.first : to.slice(0, 4) + '-01-01', to];
    const pr = PRESETS.find((x) => x[0] === p);
    const n = pr && pr[2] ? pr[2] : 183;
    const f = addD(to, -(n - 1));
    return [f < M.first ? M.first : f, to];
  }
  function setPreset(p) {
    S.preset = p;
    [S.from, S.to] = presetRange(p);
  }
  function setRange(from, to) {
    const M = SD.M;
    if (from > to) [from, to] = [to, from];
    S.from = from < M.first ? M.first : from > M.last ? M.last : from;
    S.to = to > M.last ? M.last : to < M.first ? M.first : to;
    S.preset = 'custom';
  }
  const partialKcal = () => (isNum(S.partialKcal) ? S.partialKcal : SD.M.cfg.targets.partialLogKcal);
  const logged = (x) => isNum(x.kcal) && x.kcal >= partialKcal() && !x.partial;

  // ================================================================ filtres
  let F = null;
  function compute() {
    const M = SD.M;
    const wds = new Set(S.wds);
    const dOk = (x) => wds.has(x.wd) && (S.dayKind === 'all' || (S.dayKind === 'train' ? x.train : !x.train));
    const types = S.types ? new Set(S.types) : null;
    const tOk = (w) => !types || types.has(typeKey(w.type));
    const len = nDays(S.from, S.to);
    const pTo = addD(S.from, -1), pFrom = addD(S.from, -len);
    const i0 = M.idx.get(S.from), i1 = M.idx.get(S.to);
    const days = M.days.slice(i0, i1 + 1).filter(dOk);
    const prev = M.days.filter((x) => x.d >= pFrom && x.d <= pTo && dOk(x));
    const wk = (arr) => { const o = []; for (const x of arr) for (const w of x.w) if (tOk(w)) o.push(w); return o; };
    const dates = new Set(days.map((x) => x.d));
    F = SD.F = {
      days, prev, len, pFrom, pTo, dates, hasPrev: pFrom >= M.first,
      full: days.filter((x) => !x.partial), prevFull: prev.filter((x) => !x.partial),
      workouts: wk(days), prevWorkouts: wk(prev),
      exercises: M.raw.exercises.filter((e) => dates.has(e.d)),
      prevExercises: M.raw.exercises.filter((e) => e.d >= pFrom && e.d <= pTo),
      muscles: M.raw.muscles.filter((m) => dates.has(m.d)),
      notes: M.raw.notes.filter((n) => n.d >= S.from && n.d <= S.to),
      body: M.raw.body.filter((b) => b.d >= S.from && b.d <= S.to),
      strengthDays: new Set(wk(days).filter((w) => STRENGTH.has(w.type)).map((w) => w.d)),
      prevStrengthDays: new Set(wk(prev).filter((w) => STRENGTH.has(w.type)).map((w) => w.d)),
    };
    return F;
  }

  function gran() {
    if (S.gran !== 'auto') return S.gran;
    return F.len <= 92 ? 'day' : F.len <= 430 ? 'week' : 'month';
  }
  const bucketOf = (g) => (g === 'day' ? (d) => d : g === 'week' ? weekOf : monthOf);
  function bucketKeys(g, from = S.from, to = S.to) {
    const b = bucketOf(g), out = [], end = b(to);
    let k = b(from);
    while (k <= end) { out.push(k); k = g === 'day' ? addD(k, 1) : g === 'week' ? addD(k, 7) : nextMonth(k); }
    return out;
  }
  const bucketEnd = (k, g) => (g === 'day' ? k : g === 'week' ? addD(k, 6) : addD(nextMonth(k), -1));
  const bucketLabel = (k, g) => (g === 'day' ? fdS(k) : g === 'week' ? fdS(k) : fdate(k, { month: 'short', year: '2-digit' }));
  const bucketTitle = (k, g) => (g === 'day' ? fdL(k) : g === 'week' ? `Semaine du ${fdM(k)}` : fdate(k, { month: 'long', year: 'numeric' }));
  const granUnit = (g) => (g === 'day' ? 'jour' : g === 'week' ? 'semaine' : 'mois');

  /** Agrège des éléments datés par période. how : mean | sum | count */
  function agg(items, dateOf, valOf, how, g) {
    const keys = bucketKeys(g), b = bucketOf(g);
    const map = new Map(keys.map((k) => [k, []]));
    for (const it of items) {
      const a = map.get(b(dateOf(it)));
      if (!a) continue;
      const v = valOf(it);
      if (isNum(v)) a.push(v);
    }
    return keys.map((k) => {
      const a = map.get(k);
      return { k, n: a.length, v: how === 'sum' ? sum(a) : how === 'count' ? a.length : a.length ? mean(a) : null };
    });
  }

  // ================================================================ graphiques
  const charts = new Map();
  const tables = new Map();
  function chart(id, opt, tableFn) {
    const el = document.getElementById(id);
    if (!el || !window.echarts) return null;
    let c = echarts.getInstanceByDom(el);
    if (!c) c = echarts.init(el, null, { renderer: 'canvas' });
    c.off('click');
    c.setOption(opt, true);
    charts.set(id, c);
    if (tableFn) tables.set(id, tableFn); else tables.delete(id);
    const card = el.closest('.card');
    const tb = card && card.querySelector('.tbl-view');
    if (tb && !tb.hidden) renderTable(id);
    return c;
  }
  function disposeDetached() {
    for (const [id, c] of charts) {
      if (!document.body.contains(c.getDom())) { c.dispose(); charts.delete(id); tables.delete(id); }
    }
  }
  function resizeAll() { for (const c of charts.values()) c.resize(); }

  function renderTable(id) {
    const el = document.getElementById(id);
    const card = el && el.closest('.card');
    const box = card && card.querySelector('.tbl-view');
    const fn = tables.get(id);
    if (!box) return;
    if (!fn) { box.innerHTML = '<p class="note">Pas de vue tableau pour ce graphique.</p>'; return; }
    const { cols, rows } = fn();
    box.innerHTML = `<div class="tbl-scroll"><table class="t"><thead><tr>${cols.map((c, i) => `<th class="${i ? 'num' : ''}">${esc(c)}</th>`).join('')}</tr></thead><tbody>${
      rows.map((r) => `<tr>${r.map((v, i) => `<td class="${i ? 'num' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')
    }</tbody></table></div>`;
  }

  function tipBox(title, rows, foot) {
    const line = (r) => `<div style="display:flex;align-items:center;gap:8px;font:12px ${FONT};color:${T.ink2};line-height:1.65">`
      + `<span style="width:12px;height:${r.box ? 10 : 3}px;border-radius:2px;background:${r.color};flex:none"></span>`
      + `<b style="color:${T.ink};font-weight:600">${esc(r.value)}</b><span>${esc(r.name)}</span></div>`;
    return `<div style="font:600 12.5px ${FONT};color:${T.ink};margin-bottom:3px">${esc(title)}</div>${rows.map(line).join('')}`
      + (foot ? `<div style="font:11.5px ${FONT};color:${T.muted};margin-top:4px;max-width:260px;white-space:normal">${esc(foot)}</div>` : '');
  }
  /** Formateur de tooltip "axis" : une ligne par série, valeur d'abord. fmts = {nomSérie: fn} */
  const axisTip = (fmts, titleFn) => (ps) => {
    if (!ps || !ps.length) return '';
    const p0 = ps[0];
    const x = Array.isArray(p0.value) ? p0.value[0] : p0.axisValue;
    const title = titleFn ? titleFn(x, p0) : typeof x === 'number' ? fdL(dstr(x)) : String(p0.axisValueLabel || x);
    const rows = [];
    for (const p of ps) {
      const v = Array.isArray(p.value) ? p.value[p.value.length - 1] : p.value;
      if (!isNum(v)) continue;
      const f = fmts[p.seriesName] || ((z) => nf(z, 1));
      rows.push({ color: typeof p.color === 'string' ? p.color : T.s[0], name: p.seriesName, value: f(v), box: p.seriesType === 'bar' });
    }
    return rows.length ? tipBox(title, rows) : '';
  };

  function base(extra) {
    return Object.assign({
      animationDuration: 300, animationDurationUpdate: 250,
      textStyle: { fontFamily: FONT, color: T.ink2, fontSize: 12 },
      grid: { left: 6, right: 14, top: 18, bottom: 6, containLabel: true },
      tooltip: {
        trigger: 'axis', confine: true, backgroundColor: T.surface, borderColor: T.border, borderWidth: 1, padding: [8, 10],
        textStyle: { color: T.ink, fontFamily: FONT, fontSize: 12 },
        extraCssText: 'box-shadow:0 8px 28px rgba(0,0,0,.16);border-radius:8px;',
        axisPointer: { type: 'line', lineStyle: { color: T.axis, width: 1 }, shadowStyle: { color: 'rgba(127,138,155,0.08)' } },
      },
    }, extra);
  }
  const tLabel = (v, span) => fdate(dstr(v), span <= 120 ? { day: 'numeric', month: 'short' } : span <= 800 ? { month: 'short', year: '2-digit' } : { year: 'numeric' });
  function xTime(extra) {
    const span = F.len;
    return Object.assign({
      type: 'time', min: tms(S.from), max: tms(S.to) + DAY - 1,
      axisLine: { lineStyle: { color: T.axis } }, axisTick: { show: false }, splitLine: { show: false },
      axisLabel: { color: T.muted, hideOverlap: true, formatter: (v) => tLabel(v, span) },
      axisPointer: { label: { show: false } },
    }, extra);
  }
  function xCat(data, extra) {
    return Object.assign({
      type: 'category', data, axisLine: { lineStyle: { color: T.axis } }, axisTick: { show: false },
      axisLabel: { color: T.muted, hideOverlap: true }, splitLine: { show: false },
    }, extra);
  }
  function yVal(extra) {
    return Object.assign({
      type: 'value', scale: false, axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: T.muted, formatter: (v) => nf(v, Number.isInteger(v) ? 0 : Number.isInteger(Math.round(v * 1e6) / 1e5) ? 1 : 2) },
      splitLine: { lineStyle: { color: T.grid } }, nameTextStyle: { color: T.muted, fontSize: 11, align: 'left' },
    }, extra);
  }
  const bar = (name, data, color, extra) => Object.assign({
    name, type: 'bar', data, barMaxWidth: 20, itemStyle: { color, borderRadius: [4, 4, 0, 0] },
    emphasis: { focus: 'none', itemStyle: { opacity: 0.85 } },
  }, extra);
  const line = (name, data, color, extra) => Object.assign({
    name, type: 'line', data, showSymbol: false, symbolSize: 8, smooth: false, connectNulls: false,
    lineStyle: { width: 2, color, cap: 'round', join: 'round' }, itemStyle: { color, borderColor: T.surface, borderWidth: 2 },
    emphasis: { focus: 'none', scale: false },
  }, extra);

  /** [ms, v] en insérant une coupure quand l'écart entre deux points dépasse `gap` jours */
  function series(days, get, gap = 10) {
    const out = [];
    let prev = null;
    for (const x of days) {
      const v = get(x);
      if (!isNum(v)) continue;
      if (prev && nDays(prev, x.d) - 1 > gap) out.push([tms(addD(prev, 1)), null]);
      out.push([tms(x.d), v]);
      prev = x.d;
    }
    return out;
  }

  const phaseColor = (n) => (/sèche/i.test(n) ? T.phase.cut : /prise/i.test(n) ? T.phase.gain : /maintien/i.test(n) ? T.phase.hold : T.phase.custom);
  function phaseArea() {
    const data = [];
    for (const p of SD.M.phases) {
      const s = p.start < S.from ? S.from : p.start;
      const e = p.end > S.to ? S.to : p.end;
      if (s > e) continue;
      data.push([{ name: p.name, xAxis: tms(s), itemStyle: { color: phaseColor(p.name) } }, { xAxis: tms(e) + DAY - 1 }]);
    }
    return { silent: true, label: { color: T.muted, fontSize: 11, fontFamily: FONT, position: 'insideTopLeft', distance: 6 }, data };
  }
  function emptyOpt(msg) {
    return {
      graphic: [{ type: 'text', left: 'center', top: 'middle', style: { text: msg || 'Aucune donnée sur cette sélection', fill: T.muted, font: `13px ${FONT}` } }],
      xAxis: { show: false }, yAxis: { show: false }, series: [],
    };
  }

  // ================================================================ tuiles KPI
  function deltaCls(delta, good, eps) {
    if (!isNum(delta) || Math.abs(delta) < (eps || 1e-9)) return 'flat';
    const dir = delta > 0 ? 'up' : 'down';
    if (!good) return 'flat';
    return `${dir}-${good === dir ? 'good' : 'bad'}`;
  }
  function spark(vals, color) {
    const pts = vals.map((v, i) => [i, v]).filter((p) => isNum(p[1]));
    if (pts.length < 2) return '';
    const W = 200, H = 40, pad = 4, n = Math.max(1, vals.length - 1);
    let mn = Infinity, mx = -Infinity;
    for (const p of pts) { mn = Math.min(mn, p[1]); mx = Math.max(mx, p[1]); }
    const sx = (i) => pad + (i / n) * (W - 2 * pad);
    const sy = (v) => (mx === mn ? H / 2 : H - pad - ((v - mn) / (mx - mn)) * (H - 2 * pad));
    const d = pts.map((p, j) => (j ? 'L' : 'M') + sx(p[0]).toFixed(1) + ' ' + sy(p[1]).toFixed(1)).join('');
    const l = pts[pts.length - 1];
    const area = `${d}L${sx(l[0]).toFixed(1)} ${H}L${sx(pts[0][0]).toFixed(1)} ${H}Z`;
    return `<div style="position:relative;height:100%"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">`
      + `<path d="${area}" fill="${color}" opacity="0.1"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/></svg>`
      + `<span style="position:absolute;left:calc(${((sx(l[0]) / W) * 100).toFixed(2)}% - 5px);top:calc(${((sy(l[1]) / H) * 100).toFixed(2)}% - 5px);width:10px;height:10px;border-radius:50%;background:${color};box-shadow:0 0 0 2px ${T.surface}"></span></div>`;
  }
  /**
   * @param o {label, value, unit, digits, delta, deltaDigits, deltaUnit, good:'up'|'down'|null, ctx, spark, color, hero, meter, status}
   */
  function kpi(o) {
    const has = isNum(o.value);
    const val = has ? `${o.fmt ? o.fmt(o.value) : nf(o.value, o.digits || 0)}${o.unit ? `<small>${esc(o.unit)}</small>` : ''}` : '<span class="na">Pas de donnée</span>';
    const d = isNum(o.delta)
      ? `<span class="delta ${deltaCls(o.delta, o.good, o.eps)}">${o.delta > 0 ? '▲' : o.delta < 0 ? '▼' : '■'} ${esc(o.deltaFmt ? o.deltaFmt(o.delta) : sgn(o.delta, o.deltaDigits == null ? 1 : o.deltaDigits) + (o.deltaUnit || ''))}</span>${o.deltaLabel === '' ? '' : `<span>${esc(o.deltaLabel || 'vs période préc.')}</span>`}`
      : '';
    return `<div class="kpi${o.hero ? ' hero' : ''}"><div class="lab">${esc(o.label)}</div><div class="val">${val}</div>`
      + `<div class="ctx">${d}${o.status || ''}</div>${o.ctx ? `<div class="ctx">${o.ctx}</div>` : ''}`
      + (o.meter != null ? `<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(o.meter)}"><i style="width:${Math.max(0, Math.min(100, o.meter))}%"></i></div>` : '')
      + (o.spark ? `<div class="spark">${spark(o.spark, o.color || T.s[0])}</div>` : '')
      + '</div>';
  }
  const statusPill = (v, good, warn, labels) => {
    if (!isNum(v)) return '';
    const [g, w, c] = labels || ['Bon', 'Moyen', 'Bas'];
    return v >= good ? `<span class="status good">${g}</span>` : v >= warn ? `<span class="status warn">${w}</span>` : `<span class="status crit">${c}</span>`;
  };

  // ================================================================ métriques (explorateur & matrice)
  const METRICS = {
    sleepH: { label: 'Sommeil', unit: 'h', d: 1, get: (x) => x.sleepH },
    hrv: { label: 'HRV (indicative)', unit: 'ms', d: 0, get: (x) => x.hrv },
    rhr: { label: 'FC repos', unit: 'bpm', d: 0, get: (x) => x.rhr },
    rec: { label: 'Score récup', unit: '/100', d: 0, get: (x) => x.rec },
    steps: { label: 'Pas', unit: '', d: 0, get: (x) => x.steps },
    activeKcal: { label: 'Calories actives', unit: 'kcal', d: 0, get: (x) => x.activeKcal },
    strMin: { label: 'Muscu (min)', unit: 'min', d: 0, get: (x) => (x.train ? x.strMin : 0) },
    actMin: { label: 'Activité (min)', unit: 'min', d: 0, get: (x) => x.actMin },
    kcal: { label: 'Calories ingérées', unit: 'kcal', d: 0, get: (x) => (logged(x) ? x.kcal : null) },
    prot: { label: 'Protéines', unit: 'g', d: 0, get: (x) => (logged(x) ? x.prot : null) },
    carb: { label: 'Glucides', unit: 'g', d: 0, get: (x) => (logged(x) ? x.carb : null) },
    walkAsym: { label: 'Asymétrie de marche', unit: '%', d: 1, get: (x) => x.walkAsym },
    trendD7: { label: 'Δ poids tendance 7 j', unit: 'kg', d: 2, get: (x) => x.trendD7 },
  };
  /** paires (x du jour j, y du jour j+lag) sur les jours filtrés */
  function pairs(days, kx, ky, lag) {
    const M = SD.M, gx = METRICS[kx].get, gy = METRICS[ky].get;
    const xs = [], ys = [], ds = [];
    for (const x of days) {
      if (x.partial) continue;
      const y = lag ? M.at(addD(x.d, lag)) : x;
      if (!y || y.partial) continue;
      const a = gx(x), b = gy(y);
      if (isNum(a) && isNum(b)) { xs.push(a); ys.push(b); ds.push(x.d); }
    }
    return { xs, ys, ds };
  }
  const rWord = (r) => {
    const a = Math.abs(r);
    return a < 0.1 ? 'aucun lien' : a < 0.3 ? 'lien faible' : a < 0.5 ? 'lien modéré' : 'lien fort';
  };

  Object.assign(SD, {
    FONT, DAY, tms, dstr, addD, wdOf, weekOf, monthOf, nextMonth, nDays, WD, WDL, fdate, fdS, fdM, fdL,
    isNum, pluck, sum, mean, median, sd, pearson, linreg, pctRank, nf, sgn, fHM, fH, esc,
    readTheme, withDefaults, TYPE_ORDER, typeKey, typeColor, STRENGTH, SPLITS, splitColor, prepare,
    PRESETS, DEFAULT_STATE, S, loadState, saveState, presetRange, setPreset, setRange, partialKcal, logged,
    compute, gran, bucketOf, bucketKeys, bucketEnd, bucketLabel, bucketTitle, granUnit, agg,
    chart, charts, tables, disposeDetached, resizeAll, renderTable, tipBox, axisTip, base, xTime, xCat, yVal, bar, line, series,
    phaseColor, phaseArea, emptyOpt, kpi, spark, statusPill, deltaCls, METRICS, pairs, rWord,
  });
})();
