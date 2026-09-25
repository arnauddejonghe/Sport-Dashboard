/* Salle des Machines — noyau : utilitaires, modèle, filtres, moteur de graphiques. */
(function () {
  'use strict';

  const SD = (window.SD = window.SD || {});
  const FONT = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const FONT_C = FONT;

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
  const fdW = (d) => fdate(d, { weekday: 'short', day: 'numeric', month: 'short' });

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

  // ================================================================ thème (tokens CSS)
  let T = {};
  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue('--' + n).trim();
    T = {
      dark: /dark/.test(cs.colorScheme || ''),
      bg: g('bg'), card: g('card'), card2: g('card-2'), card3: g('card-3'), ink: g('ink'), ink2: g('ink-2'), muted: g('muted'),
      grid: g('grid'), axis: g('axis'), line: g('line-2'), hover: g('hover'), tipBg: g('tip-bg'), shadowLg: g('shadow-lg'),
      s: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map(g), other: g('s-other'),
      good: g('good'), warn: g('warn'), crit: g('crit'), goodInk: g('good-ink'), warnInk: g('warn-ink'), critInk: g('crit-ink'), onStatus: g('on-status'),
      accent: g('accent'), accentInk: g('accent-ink'), accentWash: g('accent-wash'),
      rec: g('rec'), strain: g('strain'), sleep: g('sleep'), nutri: g('nutri'), act: g('act'), body: g('body'), age: g('age'), hydro: g('hydro'),
      divNeg: g('div-neg'), divMid: g('div-mid'), divPos: g('div-pos'),
      seq: [0, 1, 2, 3, 4, 5].map((i) => g('seq-' + i)),
      seqSleep: [0, 1, 2, 3].map((i) => g('seqs-' + i)), seqAct: [0, 1, 2, 3].map((i) => g('seqa-' + i)),
      heat: [g('heat-bad'), g('heat-mid'), g('heat-good')], onHeat: g('on-heat'),
      zone: [1, 2, 3, 4].map((i) => g('z' + i)),
      wash: { good: g('wash-good'), warn: g('wash-warn'), crit: g('wash-crit'), accent: g('wash-accent') },
      ind: g('ind'), foodWater: g('food-water'),
      phase: { cut: g('phase-cut'), gain: g('phase-gain'), hold: g('phase-hold'), custom: g('phase-custom') },
    };
    SD.T = T;
    return T;
  }

  // ================================================================ icônes (traits 24 × 24)
  const ICON = {
    today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    overview: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    recovery: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
    training: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    strength: '<path d="M3 9v6M6 6.5v11M18 6.5v11M21 9v6M6 12h12"/>',
    body: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1-3 4-3 7v3h3"/>',
    longevity: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9"/>',
    journal: '<path d="M6 3h11a2 2 0 0 1 2 2v16H8a3 3 0 0 1-3-3V4a1 1 0 0 1 1-1zM5 18a3 3 0 0 1 3-3h11M9 7h6M9 11h4"/>',
    data: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
    physique: '<circle cx="12" cy="4.5" r="2.2"/><path d="M5 9.5c2.2 1 4.5 1.5 7 1.5s4.8-.5 7-1.5M12 11v5M12 16l-3 5M12 16l3 5"/>',
    heart: '<path d="M12 20.5S3.5 15.6 3.5 9.3A4.8 4.8 0 0 1 12 6.4a4.8 4.8 0 0 1 8.5 2.9c0 6.3-8.5 11.2-8.5 11.2z"/>',
    hrv: '<path d="M2.5 12h4l2-5 4 10 2-5h7"/>',
    moon: '<path d="M20 14.6A8 8 0 1 1 9.4 4a6.4 6.4 0 0 0 10.6 10.6z"/>',
    steps: '<path d="M8.5 3c1.7 0 2.8 1.9 2.8 4.4 0 2-.8 3.6-1.3 4.6H6.8C6.3 11 5.6 9.4 5.6 7.4 5.6 4.9 6.8 3 8.5 3zM6.9 15h3.2M15.5 8c1.7 0 2.9 1.9 2.9 4.4 0 2-.7 3.6-1.2 4.6H14c-.5-1-1.3-2.6-1.3-4.6 0-2.5 1.2-4.4 2.8-4.4zM14 20h3.2"/>',
    flame: '<path d="M12 21.5a6.5 6.5 0 0 0 6.5-6.5c0-4.2-3-6.6-4.3-10-1 2.2-2 3.3-3.6 3.9-.4-1.2-.3-2.5.1-3.9C7.9 7.3 5.5 10.4 5.5 15a6.5 6.5 0 0 0 6.5 6.5z"/>',
    dumbbell: '<path d="M3 9v6M6 6.5v11M18 6.5v11M21 9v6M6 12h12"/>',
    scale: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M8 10a5.7 5.7 0 0 1 8 0M12 10l1.6-2"/>',
    droplet: '<path d="M12 3s6.5 6.6 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 9.6 12 3 12 3z"/>',
    food: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1-3 4-3 7v3h3"/>',
    wind: '<path d="M3 8.5h11a3 3 0 1 0-3-3M3 12.5h15a3 3 0 1 1-3 3M3 16.5h6"/>',
    gauge: '<path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="M12 14l4-5"/><circle cx="12" cy="14.5" r="1.2"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.2"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    ruler: '<path d="M4.5 15.5 15.5 4.5l4 4-11 11z"/><path d="M8 12l2 2M11 9l2 2M14 6l1.5 1.5"/>',
    percent: '<path d="M18.5 5.5l-13 13"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>',
    vshape: '<path d="M4 5h16l-8 14z"/><path d="M8.5 9h7"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    flag: '<path d="M5 21V4M5 4.5h11.5l-2.2 4 2.2 4H5"/>',
    battery: '<rect x="2.5" y="7" width="16.5" height="10" rx="2.8"/><path d="M21.5 10.5v3M6.5 10.3v3.4M9.8 10.3v3.4"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20.5h7M10 17h4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 17h.01"/>',
    stop: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12h7"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2.5"/><path d="M8 20h8M12 16v4"/>',
    more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    chat: '<path d="M20.5 12a8.5 8.5 0 0 1-12.5 7.5L3.5 20.5l1.1-4.2A8.5 8.5 0 1 1 20.5 12z"/>',
    list: '<path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12"/><circle cx="4" cy="6.5" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="17.5" r="1"/>',
    table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M3.5 14.5h17M10 9.5v10"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
    bed: '<path d="M3 18V7M3 13.5h18V18M21 13.5V11a3 3 0 0 0-3-3h-7v5.5"/><circle cx="7" cy="10.5" r="1.8"/>',
    muscle: '<path d="M6 15c-1.8-1.5-2-4.4-.2-6.6C7.4 6.4 9 6 10 4.5c.8 1.4.6 3.1-.7 4.3 1.4 1.1 2.4 1.5 3.7 1.5 2.5 0 4.9 1.3 5.6 4 .8 3.1-1.7 5.7-5.2 5.7-3.2 0-5.4-1.4-7.4-5z"/>',
  };
  const icon = (name, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ''}</svg>`;
  const zoneColor = (z) => ({ green: T.good, yellow: T.warn, red: T.crit, good: T.good, ok: T.ink2, warn: T.warn, crit: T.crit }[z] || T.muted);
  const recColor = (v) => (!isNum(v) ? T.muted : v >= 67 ? T.good : v >= 34 ? T.warn : T.crit);
  // même zone, variante lisible en texte (contraste AA sur la carte)
  const recInk = (v) => (!isNum(v) ? T.muted : v >= 67 ? T.goodInk : v >= 34 ? T.warnInk : T.critInk);
  const scoreColor = (v) => (!isNum(v) ? T.muted : v >= 75 ? T.good : v >= 55 ? T.warn : T.crit);
  const pillarColor = (k) => ({ recovery: T.rec, sleep: T.sleep, training: T.strain, nutrition: T.nutri, activity: T.act, body: T.body }[k] || T.s[0]);

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
    drive: { folder: 'Suivi sportif' },
    plan: { dayStart: '06:30', dayEnd: '21:30', travelMin: 20, preferredStart: null, wake: '06:30' },
    journalTags: [],
    privacy: { hideTerms: [] },
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
    // les rapports coach importés depuis la page (synchro Drive, import manuel) passent par le même filtre que le build
    if (window.SDParsers && window.SDParsers.setPrivacyTerms) {
      const pv = cfg.privacy || {};
      let terms = pv.hideTerms || [];
      if (pv.hideTermsB64) { try { terms = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(pv.hideTermsB64), (c) => c.charCodeAt(0)))); } catch (e) { terms = []; } }
      window.SDParsers.setPrivacyTerms(terms);
    }
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

    // Masse grasse et masse maigre (balance à impédance, bruitées) : même lissage exponentiel à 10 %
    for (const [src, out] of [['bodyFat', 'bfT'], ['lean', 'leanT']]) {
      let e = null, lastD = null;
      for (const x of days) {
        if (isNum(x[src])) { e = e == null || (lastD && nDays(lastD, x.d) > 21) ? x[src] : e + 0.1 * (x[src] - e); lastD = x.d; }
        if (e != null && lastD && nDays(lastD, x.d) <= 21) x[out] = Math.round(e * 100) / 100;
      }
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

    // Moyennes glissantes 7 j (jours complets, au moins 4 valeurs)
    const roll = (key, out, win = 7, minN = 4) => {
      for (let i = 0; i < days.length; i++) {
        const a = [];
        for (let j = Math.max(0, i - win + 1); j <= i; j++) { const v = days[j][key]; if (isNum(v) && !days[j].partial) a.push(v); }
        days[i][out] = a.length >= minN ? mean(a) : null;
      }
    };
    roll('sleepH', 'sleep7'); roll('hrv', 'hrv7'); roll('rhr', 'rhr7'); roll('steps', 'steps7');

    // Variation de poids tendance sur 7 j
    for (let i = 7; i < days.length; i++) {
      const a = days[i - 7].trendW, b = days[i].trendW;
      if (isNum(a) && isNum(b)) days[i].trendD7 = b - a;
    }

    const exIndex = new Map();
    for (const e of raw.exercises) {
      const k = e.n + '|' + e.s;
      const o = exIndex.get(k) || { key: k, n: e.n, s: e.s, count: 0, first: e.d, last: e.d };
      o.count++; if (e.d < o.first) o.first = e.d; if (e.d > o.last) o.last = e.d;
      exIndex.set(k, o);
    }

    const coach = new Map((raw.coach || []).map((c) => [c.d, c]));
    const partialDays = days.filter((x) => x.partial).map((x) => x.d);
    const lastComplete = [...days].reverse().find((x) => !x.partial && isNum(x.steps));
    const M = {
      raw, cfg, days, idx, at, phases, exIndex, coach,
      first: from, last: to, lastComplete: lastComplete ? lastComplete.d : to, partialDays,
    };
    SD.M = M;
    if (SD.scores) SD.scores.enrich(M);
    if (SD.plan) SD.plan.attach(M);
    return M;
  }

  // ================================================================ état
  const PRESETS = [['7j', '7 j', 7], ['30j', '30 j', 30], ['90j', '90 j', 90], ['6m', '6 mois', 183], ['12m', '12 mois', 365], ['ytd', 'Année', null], ['all', 'Tout', null]];
  const DEFAULT_STATE = {
    page: 'today', preset: '90j', from: null, to: null, day: null, wds: [0, 1, 2, 3, 4, 5, 6], dayKind: 'all', types: null, gran: 'auto',
    ex: null, exMetric: 'e1', corrX: 'sleepH', corrY: 'rec', corrLag: 0, measure: 'Tour de taille', macroView: 'g',
    musSel: null, musCount: 'frac', lever: 'trend', photoPose: 'all', photoMode: 'side', compShow: ['w', 'bf', 'lean'], keyEx: null,
    partialKcal: null, calMetric: 'score', analysis: { ma7: true, ma28: false, trend: false, band: true, minmax: false }, filtersOpen: false,
  };
  const S = (SD.S = JSON.parse(JSON.stringify(DEFAULT_STATE)));
  const STORE_KEY = 'sdm-state-v2';
  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        Object.assign(S, saved);
        S.analysis = Object.assign({}, DEFAULT_STATE.analysis, saved.analysis || {});
      }
    } catch (e) { /* stockage indisponible : valeurs par défaut */ }
  }
  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* ignoré */ }
  }
  function presetRange(p) {
    const M = SD.M, to = M.last;
    if (p === 'all') return [M.first, to];
    if (p === 'ytd') return [to.slice(0, 4) + '-01-01' < M.first ? M.first : to.slice(0, 4) + '-01-01', to];
    const pr = PRESETS.find((x) => x[0] === p);
    const n = pr && pr[2] ? pr[2] : 90;
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
  function setDay(d) {
    const M = SD.M;
    S.day = d < M.first ? M.first : d > M.last ? M.last : d;
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
    const pdates = new Set(prev.map((x) => x.d));
    F = SD.F = {
      days, prev, len, pFrom, pTo, dates, hasPrev: pFrom >= M.first,
      full: days.filter((x) => !x.partial), prevFull: prev.filter((x) => !x.partial),
      workouts: wk(days), prevWorkouts: wk(prev),
      exercises: M.raw.exercises.filter((e) => dates.has(e.d)),
      prevExercises: M.raw.exercises.filter((e) => pdates.has(e.d)),
      muscles: M.raw.muscles.filter((m) => dates.has(m.d)),
      prevMuscles: M.raw.muscles.filter((m) => pdates.has(m.d)),
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

  // ================================================================ moteur de graphiques
  const charts = new Map();
  const tables = new Map();
  let ro = null;
  function observe(el) {
    if (!('ResizeObserver' in window)) return;
    if (!ro) ro = new ResizeObserver((entries) => { for (const e of entries) { const c = window.echarts && echarts.getInstanceByDom(e.target); if (c) c.resize(); } });
    ro.observe(el);
  }
  function chart(id, opt, tableFn) {
    const el = document.getElementById(id);
    if (!el) return null;
    if (!window.echarts) {
      el.innerHTML = '<div class="empty">Graphique indisponible : la bibliothèque de graphiques n’a pas pu être chargée (connexion ?). Recharge la page.</div>';
      return null;
    }
    let c = echarts.getInstanceByDom(el);
    if (!c) { c = echarts.init(el, null, { renderer: 'canvas' }); observe(el); }
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
      if (!document.body.contains(c.getDom())) { if (ro) ro.unobserve(c.getDom()); c.dispose(); charts.delete(id); tables.delete(id); }
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

  const cap1 = (s) => { s = String(s == null ? '' : s); return s.charAt(0).toUpperCase() + s.slice(1); };
  function tipBox(title, rows, foot) {
    const line = (r) => `<div style="display:flex;align-items:center;gap:8px;font:12.5px ${FONT};color:${T.ink2};line-height:1.75">`
      + `<span style="width:${r.box ? 10 : 12}px;height:${r.box ? 10 : 3}px;border-radius:${r.box ? 3 : 2}px;background:${r.color};flex:none"></span>`
      + `<b style="color:${T.ink};font-weight:650;font-variant-numeric:tabular-nums">${esc(r.value)}</b><span>${esc(r.name)}</span>`
      + (r.extra ? `<span style="color:${T.muted};margin-left:auto;padding-left:12px">${esc(r.extra)}</span>` : '') + '</div>';
    return `<div style="font:650 13px ${FONT};color:${T.ink};margin-bottom:5px">${esc(cap1(title))}</div>${rows.map(line).join('')}`
      + (foot ? `<div style="font:11.5px/1.45 ${FONT};color:${T.muted};margin-top:6px;max-width:280px;white-space:normal">${esc(foot)}</div>` : '');
  }
  const axisTip = (fmts, titleFn) => (ps) => {
    if (!ps || !ps.length) return '';
    const p0 = ps[0];
    const x = Array.isArray(p0.value) ? p0.value[0] : p0.axisValue;
    const title = titleFn ? titleFn(x, p0) : typeof x === 'number' ? fdL(dstr(x)) : String(p0.axisValueLabel || x);
    const rows = [];
    for (const p of ps) {
      if (p.seriesName && p.seriesName.startsWith('_')) continue;
      const v = Array.isArray(p.value) ? p.value[p.value.length - 1] : p.value;
      if (!isNum(v)) continue;
      const f = fmts[p.seriesName] || ((z) => nf(z, 1));
      rows.push({ color: typeof p.color === 'string' ? p.color : T.s[0], name: p.seriesName, value: f(v), box: p.seriesType === 'bar' });
    }
    return rows.length ? tipBox(title, rows) : '';
  };

  function base(extra) {
    return Object.assign({
      backgroundColor: 'transparent',
      animationDuration: 350, animationDurationUpdate: 250,
      textStyle: { fontFamily: FONT, color: T.ink2, fontSize: 12 },
      grid: { left: 8, right: 16, top: 20, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'axis', confine: true, backgroundColor: T.tipBg, borderColor: T.line, borderWidth: 1, padding: [10, 12],
        textStyle: { color: T.ink, fontFamily: FONT, fontSize: 12 },
        extraCssText: `box-shadow:${T.dark ? '0 14px 36px rgba(0,0,0,.5)' : '0 10px 30px rgba(16,24,40,.14)'};border-radius:12px;backdrop-filter:blur(8px);`,
        axisPointer: {
          type: 'cross', snap: true,
          lineStyle: { color: T.axis, width: 1 }, crossStyle: { color: T.axis, width: 1 },
          shadowStyle: { color: T.hover },
          label: { backgroundColor: T.card2, color: T.ink, borderColor: T.line, borderWidth: 1, fontFamily: FONT, fontSize: 11, padding: [4, 7], borderRadius: 6 },
        },
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
      axisPointer: { label: { formatter: (p) => fdW(dstr(p.value)) } },
    }, extra);
  }
  function xCat(data, extra) {
    return Object.assign({
      type: 'category', data, axisLine: { lineStyle: { color: T.axis } }, axisTick: { show: false },
      axisLabel: { color: T.muted, hideOverlap: true }, splitLine: { show: false },
      axisPointer: { label: { show: false } },
    }, extra);
  }
  const axisNum = (v) => nf(v, Number.isInteger(v) ? 0 : Number.isInteger(Math.round(v * 1e6) / 1e5) ? 1 : 2);
  function yVal(extra) {
    return Object.assign({
      type: 'value', scale: false, axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: T.muted, formatter: axisNum },
      splitLine: { lineStyle: { color: T.grid } }, nameGap: 10, nameTextStyle: { color: T.muted, fontSize: 11, align: 'left' },
      axisPointer: { label: { formatter: (p) => axisNum(Math.round(p.value * 100) / 100) } },
    }, extra);
  }
  const bar = (name, data, color, extra) => Object.assign({
    name, type: 'bar', data, barMaxWidth: 20, itemStyle: { color, borderRadius: [4, 4, 0, 0] },
    emphasis: { focus: 'none', itemStyle: { opacity: 0.85 } },
  }, extra);
  const line = (name, data, color, extra) => Object.assign({
    name, type: 'line', data, showSymbol: false, symbolSize: 8, smooth: false, connectNulls: false,
    lineStyle: { width: 2, color, cap: 'round', join: 'round' }, itemStyle: { color, borderColor: T.card, borderWidth: 2 },
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
  const zoom = () => [{ type: 'inside', filterMode: 'none', zoomOnMouseWheel: 'shift', moveOnMouseMove: false }];
  const toolbox = () => ({
    right: 0, top: 0, itemSize: 13, itemGap: 8, iconStyle: { borderColor: T.muted }, emphasis: { iconStyle: { borderColor: T.ink } },
    feature: { dataZoom: { yAxisIndex: 'none', title: { zoom: 'Zoom : sélectionne une zone', back: 'Annuler le zoom' } }, restore: { title: 'Réinitialiser' } },
  });

  /**
   * Série temporelle standard avec les outils d'analyse (moyenne 7 j / 28 j, tendance, plage normale, min/max).
   * cfg = { name, get, color, unit, digits, type:'line'|'bar'|'scatter', baseKey, colorOf(x), gap, extra:[séries], yExtra, legend }
   */
  function ts(id, cfg) {
    const A = S.analysis;
    const days = F.days.filter((x) => !x.partial || cfg.includePartial);
    const vals = days.filter((x) => isNum(cfg.get(x)));
    if (!vals.length) return chart(id, base(emptyOpt(cfg.empty)));
    const u = cfg.unit ? ' ' + cfg.unit : '';
    const fmt = cfg.fmt || ((v) => nf(v, cfg.digits || 0) + u);
    const type = cfg.type || 'line';
    const main = type === 'bar'
      ? bar(cfg.name, vals.map((x) => ({ value: [tms(x.d), cfg.get(x)], itemStyle: cfg.colorOf ? { color: cfg.colorOf(x), borderRadius: [3, 3, 0, 0] } : undefined })), cfg.color, { barMaxWidth: 16, large: vals.length > 600 })
      : type === 'scatter'
        ? { name: cfg.name, type: 'scatter', data: vals.map((x) => [tms(x.d), cfg.get(x)]), symbolSize: 6, itemStyle: { color: cfg.color, opacity: 0.55 } }
        : line(cfg.name, series(days, cfg.get, cfg.gap || 10), cfg.color, { lineStyle: { width: A.ma7 ? 1.25 : 2, color: cfg.color, opacity: A.ma7 ? 0.55 : 1 }, symbol: 'circle' });
    const out = [main];
    const legend = [cfg.name];
    // moyenne glissante
    const roll = (win, minN) => days.map((x, i) => {
      const a = [];
      for (let j = Math.max(0, i - win + 1); j <= i; j++) { const v = cfg.get(days[j]); if (isNum(v)) a.push(v); }
      return [tms(x.d), a.length >= minN ? +mean(a).toFixed(3) : null];
    });
    if (A.ma7) { out.push(line('Moyenne 7 j', roll(7, 4), cfg.color, { lineStyle: { width: 2.5, color: cfg.color } })); legend.push('Moyenne 7 j'); }
    if (A.ma28) { out.push(line('Moyenne 28 j', roll(28, 10), T.ink2, { lineStyle: { width: 1.5, color: T.ink2 } })); legend.push('Moyenne 28 j'); }
    // plage normale personnelle (médiane ± écart robuste des 30 jours précédents)
    if (A.band && cfg.baseKey) {
      const bd = days.filter((x) => x.base && x.base[cfg.baseKey]);
      if (bd.length) {
        out.push({ name: '_bas', type: 'line', stack: 'band-' + id, data: bd.map((x) => [tms(x.d), x.base[cfg.baseKey].lo]), lineStyle: { opacity: 0 }, symbol: 'none', silent: true, tooltip: { show: false } });
        out.push({ name: 'Plage normale', type: 'line', stack: 'band-' + id, data: bd.map((x) => [tms(x.d), x.base[cfg.baseKey].hi - x.base[cfg.baseKey].lo]), lineStyle: { opacity: 0 }, symbol: 'none', areaStyle: { color: cfg.color, opacity: 0.12 }, itemStyle: { color: cfg.color }, silent: true });
        legend.push('Plage normale');
      }
    }
    // tendance linéaire sur la période affichée
    let slope = null;
    if (A.trend && vals.length >= 5) {
      const x0 = tms(vals[0].d);
      const xs = vals.map((x) => (tms(x.d) - x0) / DAY), ys = vals.map(cfg.get);
      const { a, b } = linreg(xs, ys);
      slope = b * 7;
      out.push(line('Tendance', [[x0, a], [tms(vals[vals.length - 1].d), a + b * xs[xs.length - 1]]], T.ink, { lineStyle: { width: 1.5, type: [6, 4], color: T.ink, opacity: 0.8 }, symbol: 'none', tooltip: { show: false } }));
      legend.push('Tendance');
    }
    if (A.minmax && main.type !== 'scatter') {
      main.markPoint = {
        symbol: 'pin', symbolSize: 38, label: { color: T.onStatus, fontSize: 10, fontWeight: 600, formatter: (p) => nf(p.value, cfg.digits || 0) },
        data: [{ type: 'max', name: 'Max', itemStyle: { color: T.good } }, { type: 'min', name: 'Min', itemStyle: { color: T.crit } }],
      };
      main.markLine = { silent: true, symbol: 'none', lineStyle: { color: T.muted, type: 'solid', width: 1 }, label: { color: T.muted, fontSize: 11, position: 'insideEndTop', formatter: (p) => `moy. ${nf(p.value, cfg.digits || 0)}` }, data: [{ type: 'average' }] };
    }
    if (cfg.markArea) main.markArea = cfg.markArea;
    if (cfg.markLines) main.markLine = Object.assign({ silent: true, symbol: 'none', data: [] }, main.markLine || {}, { data: ((main.markLine && main.markLine.data) || []).concat(cfg.markLines) });
    for (const s of cfg.extra || []) { out.push(s); if (s.name && !s.name.startsWith('_')) legend.push(s.name); }

    const byMs = new Map(days.map((x) => [tms(x.d), x]));
    const opt = base({
      // l'unité de l'axe (nom) se place sous la légende : grille à 44 px du haut
      grid: { left: 8, right: 16, top: 44, bottom: 8, containLabel: true },
      legend: { show: true, data: legend, top: 0, left: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 4, textStyle: { color: T.ink2, fontSize: 11.5 }, inactiveColor: T.axis, selectedMode: true },
      toolbox: toolbox(),
      dataZoom: zoom(),
      tooltip: Object.assign(base().tooltip, {
        formatter: (ps) => {
          if (!ps || !ps.length) return '';
          const ms = Array.isArray(ps[0].value) ? ps[0].value[0] : null;
          const x = byMs.get(ms);
          if (!x) return axisTip({})(ps);
          const rows = [];
          const v = cfg.get(x);
          if (isNum(v)) {
            const b = cfg.baseKey && x.base && x.base[cfg.baseKey];
            const z = cfg.baseKey && x.z ? x.z[cfg.baseKey] : null;
            rows.push({ color: cfg.colorOf ? cfg.colorOf(x) : cfg.color, value: fmt(v), name: cfg.name, box: type === 'bar',
              extra: isNum(z) ? `${sgn(z, 1)} σ vs norme` : '' });
            if (b) rows.push({ color: cfg.color, value: `${nf(b.lo, cfg.digits || 0)}–${nf(b.hi, cfg.digits || 0)}${u}`, name: 'plage normale (30 j)', extra: `${sgn(((v - b.m) / b.m) * 100, 0)} %` });
          }
          for (const p of ps) {
            if (p.seriesName === cfg.name || p.seriesName.startsWith('_') || p.seriesName === 'Plage normale' || p.seriesName === 'Tendance') continue;
            const pv = Array.isArray(p.value) ? p.value[1] : p.value;
            if (isNum(pv)) rows.push({ color: typeof p.color === 'string' ? p.color : T.ink2, value: (cfg.fmtFor && cfg.fmtFor[p.seriesName] ? cfg.fmtFor[p.seriesName] : fmt)(pv), name: p.seriesName });
          }
          const foot = [cfg.foot ? cfg.foot(x) : '', isNum(slope) ? `Tendance de la période : ${sgn(slope, (cfg.digits || 0) + 1)}${u} / sem` : ''].filter(Boolean).join(' · ');
          return tipBox(fdL(x.d), rows, foot || null);
        },
      }),
      xAxis: xTime(),
      yAxis: yVal(Object.assign({ scale: cfg.type !== 'bar', name: cfg.unit || '' }, cfg.yExtra || {})),
      series: out,
    });
    const c = chart(id, opt, cfg.table || (() => ({
      cols: ['Date', cfg.name + (cfg.unit ? ` (${cfg.unit})` : ''), ...(cfg.baseKey ? ['Norme (médiane 30 j)', 'Écart (σ)'] : [])],
      rows: vals.map((x) => [fdM(x.d), nf(cfg.get(x), cfg.digits || 0), ...(cfg.baseKey ? [x.base && x.base[cfg.baseKey] ? nf(x.base[cfg.baseKey].m, cfg.digits || 0) : '—', x.z && isNum(x.z[cfg.baseKey]) ? sgn(x.z[cfg.baseKey], 1) : '—'] : [])]),
    })));
    if (c && cfg.onDay) c.on('click', (p) => { const v = Array.isArray(p.value) ? p.value[0] : null; if (isNum(v)) cfg.onDay(dstr(v)); });
    return c;
  }

  // ================================================================ composants visuels
  /** Anneau façon Whoop / Bevel : piste teintée, arc en dégradé, valeur au centre. value/max, couleur, contenu central. */
  let ringN = 0;
  function ring(o) {
    const size = o.size || 132, sw = o.stroke || 10, r = (120 - sw) / 2, c = 2 * Math.PI * r;
    const has = isNum(o.value);
    const frac = has ? Math.max(0, Math.min(1, o.value / (o.max || 100))) : 0;
    const gid = 'rg' + ++ringN;
    const aria = o.label ? `${o.label} : ${has ? (o.text != null ? o.text : nf(o.value, 0)) : 'non mesuré'}${o.unit ? ' ' + o.unit : ''}` : '';
    return `<div class="ring${o.cls ? ' ' + o.cls : ''}" style="--rc:${o.color};width:${size}px" ${o.title ? `title="${esc(o.title)}"` : ''}${aria ? ` role="img" aria-label="${esc(aria)}"` : ''}>
      <svg viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">
        <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${o.color}" stop-opacity="0.7"/><stop offset="1" stop-color="${o.color}"/></linearGradient></defs>
        <circle cx="60" cy="60" r="${r}" fill="none" stroke="${o.color}" stroke-opacity="0.15" stroke-width="${sw}"/>
        ${frac > 0 ? `<circle class="arc" cx="60" cy="60" r="${r}" fill="none" stroke="url(#${gid})" stroke-width="${sw}" stroke-linecap="round"
          stroke-dasharray="${Math.max(0.1, frac * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)"/>` : ''}
      </svg>
      <div class="ring-c" aria-hidden="true"><b>${has ? esc(o.text != null ? o.text : nf(o.value, 0)) : '—'}</b>${o.unit ? `<span>${esc(o.unit)}</span>` : ''}</div>
      ${o.label && !o.hideLabel ? `<div class="ring-l" aria-hidden="true">${esc(o.label)}</div>` : ''}
    </div>`;
  }
  /** Barre de plage : zones de référence + marqueur de la valeur + repère de la norme perso */
  function rangeBar(o) {
    const [a, b] = o.scale;
    const pos = (v) => Math.max(0, Math.min(100, ((v - a) / (b - a)) * 100));
    const zones = (o.zones || []).map(([z0, z1, st]) => `<i style="left:${pos(z0)}%;width:${pos(z1) - pos(z0)}%;background:${zoneColor(st)}"></i>`).join('');
    const band = isNum(o.bandLo) && isNum(o.bandHi) ? `<em style="left:${pos(o.bandLo)}%;width:${Math.max(1, pos(o.bandHi) - pos(o.bandLo))}%"></em>` : '';
    const mk = isNum(o.value) ? `<b style="left:${pos(o.value)}%;background:${o.color || T.ink}"></b>` : '';
    return `<div class="rbar" role="img" aria-label="${esc(o.aria || '')}">${zones}${band}${mk}</div>`;
  }

  // ================================================================ tuiles KPI
  function deltaCls(delta, good, eps) {
    if (!isNum(delta) || Math.abs(delta) < (eps || 1e-9)) return 'flat';
    const dir = delta > 0 ? 'up' : 'down';
    if (!good) return 'flat';
    return `${dir}-${good === dir ? 'good' : 'bad'}`;
  }
  let sparkN = 0;
  function spark(vals, color, h) {
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
    const gid = 'sg' + ++sparkN;
    return `<div class="spk" style="height:${h || 34}px"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">`
      + `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.24"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>`
      + `<path d="${area}" fill="url(#${gid})"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/></svg>`
      + `<span style="left:calc(${((sx(l[0]) / W) * 100).toFixed(2)}% - 4px);top:calc(${((sy(l[1]) / H) * 100).toFixed(2)}% - 4px);background:${color}"></span></div>`;
  }
  /** Carte métrique façon carte santé : icône teintée + libellé, grande valeur, écart coloré, contexte, jauge ou tendance */
  function kpi(o) {
    const has = isNum(o.value);
    const val = has ? `${o.fmt ? o.fmt(o.value) : nf(o.value, o.digits || 0)}${o.unit ? `<small>${esc(o.unit)}</small>` : ''}` : '<span class="na">—</span>';
    const arrow = (v) => (v > 0 ? '↑' : v < 0 ? '↓' : '=');
    const d = isNum(o.delta)
      ? `<span class="delta ${deltaCls(o.delta, o.good, o.eps)}">${arrow(o.delta)} ${esc(o.deltaFmt ? o.deltaFmt(o.delta) : sgn(o.delta, o.deltaDigits == null ? 1 : o.deltaDigits) + (o.deltaUnit || ''))}</span>${o.deltaLabel === '' ? '' : `<span>${esc(o.deltaLabel || 'vs période préc.')}</span>`}`
      : '';
    const color = o.color || T.s[0];
    const st = o.status ? o.status.trim() : '';
    return `<div class="kpi" style="--kc:${color}"><div class="kpi-h">${o.icon ? `<span class="kpi-ic">${icon(o.icon)}</span>` : ''}<span class="lab">${esc(o.label)}</span></div>`
      + `<div class="val">${val}</div>`
      + (d || st ? `<div class="ctx">${st}${d}</div>` : '') + (o.ctx ? `<div class="ctx sub">${o.ctx}</div>` : '')
      + (o.meter != null ? `<div class="meter"><i style="width:${Math.max(0, Math.min(100, o.meter))}%"></i></div>` : '')
      + (o.spark ? spark(o.spark, color) : '')
      + '</div>';
  }
  const statusPill = (v, good, warn, labels) => {
    if (!isNum(v)) return '';
    const [g, w, c] = labels || ['Bon', 'Moyen', 'Bas'];
    return v >= good ? `<span class="status good">${g}</span>` : v >= warn ? `<span class="status warn">${w}</span>` : `<span class="status crit">${c}</span>`;
  };

  // ================================================================ métriques (explorateur & matrice)
  const METRICS = {
    rec: { label: 'Récupération', unit: '%', d: 0, get: (x) => x.rec },
    strain: { label: 'Charge', unit: '/100', d: 0, get: (x) => x.strain },
    sleepH: { label: 'Sommeil', unit: 'h', d: 1, get: (x) => x.sleepH },
    sleepPerf: { label: 'Performance sommeil', unit: '%', d: 0, get: (x) => x.sleepPerf },
    hrv: { label: 'HRV (indicative)', unit: 'ms', d: 0, get: (x) => x.hrv },
    rhr: { label: 'FC repos', unit: 'bpm', d: 0, get: (x) => x.rhr },
    resp: { label: 'Fréq. respiratoire', unit: '/min', d: 1, get: (x) => x.resp },
    steps: { label: 'Pas', unit: '', d: 0, get: (x) => x.steps },
    activeKcal: { label: 'Calories actives', unit: 'kcal', d: 0, get: (x) => x.activeKcal },
    strMin: { label: 'Muscu (min)', unit: 'min', d: 0, get: (x) => (x.train ? x.strMin : 0) },
    kcal: { label: 'Calories ingérées', unit: 'kcal', d: 0, get: (x) => (logged(x) ? x.kcal : null) },
    prot: { label: 'Protéines', unit: 'g', d: 0, get: (x) => (logged(x) ? x.prot : null) },
    carb: { label: 'Glucides', unit: 'g', d: 0, get: (x) => (logged(x) ? x.carb : null) },
    caffeine: { label: 'Caféine', unit: 'mg', d: 0, get: (x) => x.caffeine },
    mood: { label: 'Humeur (Apple)', unit: '', d: 1, get: (x) => x.mood },
    walkAsym: { label: 'Asymétrie de marche', unit: '%', d: 1, get: (x) => x.walkAsym },
    trendD7: { label: 'Δ poids tendance 7 j', unit: 'kg', d: 2, get: (x) => x.trendD7 },
  };
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
    FONT, FONT_C, DAY, tms, dstr, addD, wdOf, weekOf, monthOf, nextMonth, nDays, WD, WDL, fdate, fdS, fdM, fdL, fdW,
    isNum, pluck, sum, mean, median, sd, pearson, linreg, pctRank, nf, sgn, fHM, fH, esc,
    readTheme, ICON, icon, cap1, zoneColor, recColor, recInk, scoreColor, pillarColor, withDefaults, TYPE_ORDER, typeKey, typeColor, STRENGTH, SPLITS, splitColor, prepare,
    PRESETS, DEFAULT_STATE, S, loadState, saveState, presetRange, setPreset, setRange, setDay, partialKcal, logged,
    compute, gran, bucketOf, bucketKeys, bucketEnd, bucketLabel, bucketTitle, granUnit, agg,
    chart, charts, tables, disposeDetached, resizeAll, renderTable, tipBox, axisTip, base, xTime, xCat, yVal, bar, line, series,
    phaseColor, phaseArea, emptyOpt, zoom, toolbox, ts, ring, rangeBar, kpi, spark, statusPill, deltaCls, METRICS, pairs, rWord,
  });
})();
