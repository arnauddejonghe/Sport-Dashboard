/* Salle des Machines — algorithmes.
 *
 * Tout est calculé à partir de tes propres données, avec des règles explicites :
 *  - normes personnelles (médiane et écart robuste des 30 jours précédents) ;
 *  - scores quotidiens : Récupération (0-100), Charge (0-100), Sommeil (performance vs besoin personnel),
 *    Nutrition, Activité, Note du jour ;
 *  - scores de période : 6 piliers + note globale (A+ … E) avec les leviers qui la tirent vers le haut ou le bas ;
 *  - charge aiguë / chronique (ACWR), alertes physiologiques, records personnels ;
 *  - âge biologique (modèle de risques relatifs publiés convertis en années via la loi de Gompertz) ;
 *  - biomarqueurs avec normes de population et normes personnelles ;
 *  - impact des habitudes du journal sur la récupération du lendemain ;
 *  - projection du poids tendance.
 */
(function () {
  'use strict';
  const SD = window.SD;

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const median = (a) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const sdev = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1)); };

  // Fonction de répartition de la loi normale (Abramowitz & Stegun 7.1.26)
  function phi(z) {
    const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
    return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  }

  /** Médiane et écart robuste (1,4826 × MAD), plancher à 3 % de la médiane */
  function robust(values) {
    const m = median(values);
    const mad = median(values.map((v) => Math.abs(v - m)));
    const s = Math.max(1.4826 * mad, Math.abs(m) * 0.03, 1e-6);
    return { m, s };
  }

  // Zones inspirées de Whoop
  const recZone = (v) => (!isNum(v) ? null : v >= 67 ? 'green' : v >= 34 ? 'yellow' : 'red');
  // Charge 0-100 : < 50 légère, 50-69 modérée, 70-84 élevée, ≥ 85 très élevée
  const STRAIN_ZONES = [50, 70, 85];
  const strainZone = (v) => (!isNum(v) ? null : v >= 85 ? 'max' : v >= 70 ? 'high' : v >= 50 ? 'mod' : 'light');
  const STRAIN_LABEL = { light: 'Légère', mod: 'Modérée', high: 'Élevée', max: 'Très élevée' };

  // ================================================================ enrichissement quotidien
  const BASE_KEYS = ['hrv', 'rhr', 'resp', 'spo2', 'sleepH', 'steps', 'walkHR', 'walkAsym', 'hrLo', 'strain'];

  function enrich(M) {
    const days = M.days, cfg = M.cfg.targets;

    // 1) Charge 0-100 : dépense active + surcharge mécanique de la muscu, échelle à rendement décroissant
    //    (100 = effort maximal ; chaque point coûte plus que le précédent)
    for (const x of days) {
      let load = null;
      if (isNum(x.activeKcal)) load = x.activeKcal;
      else if (x.actMin > 0) load = x.actMin * 7;
      if (load != null) {
        load += 3 * (x.strMin || 0);
        x.load = load;
        x.strain = Math.round(100 * (1 - Math.exp(-load / 1100)));
      }
    }

    // 2) Normes personnelles : 30 jours précédents, au moins 10 valeurs
    for (let i = 0; i < days.length; i++) {
      const x = days[i];
      x.base = {}; x.z = {};
      for (const k of BASE_KEYS) {
        const w = [];
        for (let j = Math.max(0, i - 30); j < i; j++) { const v = days[j][k]; if (isNum(v) && !days[j].partial) w.push(v); }
        if (w.length < 10) continue;
        const st = robust(w);
        x.base[k] = { m: st.m, s: st.s, lo: st.m - st.s, hi: st.m + st.s, n: w.length };
        if (isNum(x[k])) x.z[k] = (x[k] - st.m) / st.s;
      }
    }

    // 3) Besoin de sommeil personnel, performance, dette, régularité
    //    Base = médiane de tes nuits (90 jours précédents) suivies d'un bon état du système nerveux
    //    (HRV haute et FC repos basse vs ta norme, sans tenir compte du sommeil), bornée à [7 h ; 8 h 30]
    //    (7 h = minimum recommandé chez l'adulte, Watson et al., Sleep 2015). Repli : targets.sleepHours.
    //    + charge de la veille au-delà de 50 (jusqu'à +30 min) + rattrapage de 25 % de la dette des 3 nuits (jusqu'à +45 min).
    const good = days.map((x) => {
      if (x.partial || !isNum(x.sleepH) || x.sleepH < 3) return null;
      const zh = x.z.hrv, zr = x.z.rhr;
      if (!isNum(zh) && !isNum(zr)) return null;
      const a = isNum(zh) && isNum(zr) ? (0.6 * zh - 0.4 * zr) / Math.sqrt(0.52) : isNum(zh) ? zh : -zr;
      return a >= 0.44 ? x.sleepH : null; // ~ tiers supérieur des jours
    });
    for (let i = 0; i < days.length; i++) {
      const x = days[i];
      const prev = days[i - 1];
      const w = [];
      for (let j = Math.max(0, i - 90); j < i; j++) if (good[j] != null) w.push(good[j]);
      const baseNeed = w.length >= 10 ? clamp(median(w), 7, 8.5) : cfg.sleepHours;
      const adjStrain = prev && isNum(prev.strain) ? Math.min(0.5, Math.max(0, prev.strain - 50) * 0.01) : 0;
      let debt3 = 0;
      for (let k = 1; k <= 3; k++) {
        const y = days[i - k];
        if (y && isNum(y.sleepH) && isNum(y.sleepBase)) debt3 += Math.max(0, y.sleepBase - y.sleepH);
      }
      const adjDebt = Math.min(0.75, 0.25 * debt3);
      x.sleepBase = baseNeed;
      x.sleepBaseN = w.length;
      x.sleepAdj = { strain: adjStrain, debt: adjDebt };
      x.sleepNeed = baseNeed + adjStrain + adjDebt;
      if (isNum(x.sleepH)) x.sleepPerf = Math.min(100, (x.sleepH / x.sleepNeed) * 100);
      const w7 = [];
      let debt7 = 0;
      for (let k = 0; k < 7; k++) {
        const y = days[i - k];
        if (y && isNum(y.sleepH)) { w7.push(y.sleepH); if (isNum(y.sleepBase)) debt7 += Math.max(0, y.sleepBase - y.sleepH); }
      }
      x.sleepDebt7 = w7.length >= 4 ? debt7 : null;
      x.sleepCons = w7.length >= 4 ? Math.max(0, 100 - sdev(w7) * 60 * 0.83) : null;
    }

    // 4) Récupération 0-100 : HRV (+), FC repos (−), respiration (−), performance du sommeil
    //    Z composite = Σ w·z / √Σw², puis 100 × Φ(Z) : un tiers des jours environ dans chaque zone.
    for (const x of days) {
      if (x.partial) continue;
      const c = [];
      if (isNum(x.z.hrv)) c.push(['hrv', clamp(x.z.hrv, -3, 3), 0.45]);
      if (isNum(x.z.rhr)) c.push(['rhr', clamp(-x.z.rhr, -3, 3), 0.30]);
      if (isNum(x.z.resp)) c.push(['resp', clamp(-x.z.resp, -3, 3), 0.10]);
      if (isNum(x.sleepPerf)) c.push(['sleep', clamp((x.sleepPerf - 85) / 12, -3, 3), 0.15]);
      if (c.length < 2 || !c.some((q) => q[0] === 'hrv' || q[0] === 'rhr')) continue;
      const Z = sum(c.map((q) => q[1] * q[2])) / Math.sqrt(sum(c.map((q) => q[2] * q[2])));
      x.rec = Math.round(100 * phi(clamp(Z, -3, 3)));
      x.recC = Object.fromEntries(c.map((q) => [q[0], q[1]]));
    }

    // 5) Activité 0-100 : pas vs objectif (70 %) + minutes d'exercice vs 45 min (30 %)
    for (const x of days) {
      if (x.partial || !isNum(x.steps)) continue;
      const a = Math.min(100, (x.steps / cfg.stepsGoal) * 100);
      const b = isNum(x.exMin) ? Math.min(100, (x.exMin / 45) * 100) : null;
      x.actScore = b == null ? a : 0.7 * a + 0.3 * b;
    }

    // 6) Charge aiguë / chronique (EWMA 7 j / 28 j)
    let ac = null, ch = null, n = 0;
    for (const x of days) {
      const v = isNum(x.strain) ? x.strain : null;
      if (v != null) {
        ac = ac == null ? v : ac + (2 / 8) * (v - ac);
        ch = ch == null ? v : ch + (2 / 29) * (v - ch);
        n++;
      }
      if (n >= 28 && ch > 0) { x.acute = ac; x.chronic = ch; x.acwr = ac / ch; }
    }

    // 7) Alertes physiologiques (façon « Health Monitor »)
    for (const x of days) {
      if (x.partial) continue;
      const f = [];
      if (x.z.rhr >= 2) f.push(`FC repos ${SD.sgn(x.z.rhr, 1)} σ`);
      if (x.z.hrv <= -2) f.push(`HRV ${SD.sgn(x.z.hrv, 1)} σ`);
      if (x.z.resp >= 2) f.push(`respiration ${SD.sgn(x.z.resp, 1)} σ`);
      if (isNum(x.spo2) && x.spo2 < 93) f.push(`SpO₂ ${SD.nf(x.spo2, 0)} %`);
      if (f.length) x.alert = { flags: f, level: f.length >= 2 ? 'crit' : 'warn' };
    }

    // 8) Records personnels (e1RM au-dessus de tout l'historique précédent de l'exercice)
    const best = new Map();
    for (const e of M.raw.exercises) {
      if (!isNum(e.e1)) continue;
      const k = e.n + '|' + e.s;
      const b = best.get(k);
      if (b != null && e.e1 > b * 1.001) e.pr = true;
      if (b == null || e.e1 > b) best.set(k, e.e1);
    }
  }

  // ================================================================ scores dépendant des réglages
  function nutriScore(x) {
    if (!SD.logged(x)) return null;
    const parts = [];
    if (x.tgt && isNum(x.tgt.kcal) && x.tgt.kcal > 0) parts.push([Math.max(0, 100 - (Math.abs(x.kcal - x.tgt.kcal) / x.tgt.kcal) * 400), 0.45]);
    const pt = x.tgt && isNum(x.tgt.prot) ? x.tgt.prot : isNum(x.trendW) ? SD.M.cfg.targets.proteinPerKg[0] * x.trendW : null;
    if (isNum(x.prot) && pt) parts.push([Math.min(100, (x.prot / pt) * 100), 0.40]);
    if (isNum(x.fiber)) parts.push([Math.min(100, (x.fiber / 30) * 100), 0.15]);
    if (!parts.length) return null;
    return sum(parts.map((p) => p[0] * p[1])) / sum(parts.map((p) => p[1]));
  }
  function dayScore(x) {
    const parts = [[x.rec, 0.3], [x.sleepPerf, 0.3], [nutriScore(x), 0.2], [x.actScore, 0.2]].filter((p) => isNum(p[0]));
    if (parts.length < 2) return null;
    return sum(parts.map((p) => p[0] * p[1])) / sum(parts.map((p) => p[1]));
  }
  /** Charge conseillée (centre de la fourchette, ±7) selon la récupération : 38 en zone rouge basse, 86 à 100 % */
  function strainTarget(rec) {
    if (!isNum(rec)) return null;
    return clamp(38 + rec * 0.48, 38, 86);
  }

  // ================================================================ indice de force
  function strengthIndex(exercises) {
    const byK = new Map();
    for (const e of exercises) {
      if (!isNum(e.e1)) continue;
      const k = e.n + '|' + e.s;
      (byK.get(k) || byK.set(k, []).get(k)).push(e);
    }
    const wk = new Map();
    for (const [, arr] of byK) {
      if (arr.length < 3) continue;
      arr.sort((a, b) => a.d.localeCompare(b.d));
      const b0 = mean(arr.slice(0, 2).map((e) => e.e1));
      for (const e of arr) { const w = SD.weekOf(e.d); (wk.get(w) || wk.set(w, []).get(w)).push((e.e1 / b0) * 100); }
    }
    const series = [...wk.entries()].filter(([, v]) => v.length >= 2).sort((a, b) => a[0].localeCompare(b[0])).map(([w, v]) => ({ w, v: mean(v), n: v.length }));
    let delta = null;
    if (series.length >= 4) {
      const k = Math.min(3, Math.floor(series.length / 2));
      delta = mean(series.slice(-k).map((s) => s.v)) - mean(series.slice(0, k).map((s) => s.v));
    }
    return { series, delta };
  }

  // ================================================================ scores de période
  const PILLARS = [
    { key: 'recovery', label: 'Récupération', w: 20, color: 'rec' },
    { key: 'sleep', label: 'Sommeil', w: 20, color: 'sleep' },
    { key: 'training', label: 'Entraînement', w: 20, color: 'strain' },
    { key: 'nutrition', label: 'Nutrition', w: 15, color: 'nutri' },
    { key: 'activity', label: 'Activité', w: 15, color: 'act' },
    { key: 'body', label: 'Corps', w: 10, color: 'body' },
  ];
  const grade = (v) => (!isNum(v) ? '—' : v >= 90 ? 'A+' : v >= 80 ? 'A' : v >= 70 ? 'B' : v >= 60 ? 'C' : v >= 50 ? 'D' : 'E');
  const verdict = (v) => (!isNum(v) ? 'Pas assez de données'
    : v >= 85 ? 'Excellent : tu coches presque tout, garde le cap.'
    : v >= 75 ? 'Bon travail : quelques leviers à ajuster.'
    : v >= 65 ? 'Correct, mais des piliers te freinent.'
    : v >= 50 ? 'Moyen : corrige en priorité les points rouges.'
    : 'À redresser : la base (sommeil, régularité, nutrition) n’est pas tenue.');

  /**
   * @param days   jours de la période (déjà filtrés)
   * @param ctx    {len, strengthDays:Set, exercises, muscles, from, to}
   */
  function periodScores(days, ctx) {
    const M = SD.M, cfg = M.cfg.targets;
    const full = days.filter((x) => !x.partial);
    const out = {};
    const detail = {};

    const rec = full.map((x) => x.rec).filter(isNum);
    out.recovery = rec.length >= 3 ? mean(rec) : null;
    detail.recovery = rec.length ? `${rec.length} jours · ${Math.round((rec.filter((v) => v >= 67).length / rec.length) * 100)} % en zone verte` : 'Pas de données HRV / FC repos';

    const perf = full.map((x) => x.sleepPerf).filter(isNum);
    const slept = full.map((x) => x.sleepH).filter(isNum);
    const cons = slept.length >= 5 ? Math.max(0, 100 - sdev(slept) * 60 * 0.83) : null;
    out.sleep = perf.length >= 3 ? (cons != null ? 0.75 * mean(perf) + 0.25 * cons : mean(perf)) : null;
    detail.sleep = perf.length ? `${SD.fH(mean(slept))} en moyenne · performance ${Math.round(mean(perf))} % · régularité ${cons != null ? Math.round(cons) : '—'}` : 'Pas de nuits enregistrées';

    const weeks = Math.max(1, ctx.len / 7);
    const perW = ctx.strengthDays.size / weeks;
    const tParts = [[Math.min(100, (perW / cfg.sessionsPerWeek) * 100), 0.4]];
    if (ctx.muscles && ctx.muscles.length) {
      const tot = new Map();
      for (const m of ctx.muscles) tot.set(m.m, (tot.get(m.m) || 0) + (m.sets || 0));
      const core = ['Pectoraux', 'Dorsaux', 'Haut du dos', 'Quadriceps', 'Ischios', 'Fessiers', 'Deltoïdes lat.', 'Biceps', 'Triceps', 'Mollets', 'Deltoïdes post.'];
      const [lo, hi] = cfg.setsPerMuscleWeek;
      const s = core.filter((m) => tot.has(m)).map((m) => { const v = tot.get(m) / weeks; return v < lo ? v / lo : v > hi * 1.3 ? 0.8 : 1; });
      if (s.length >= 5) tParts.push([mean(s) * 100, 0.3]);
    }
    const si = strengthIndex(ctx.exercises || []);
    if (isNum(si.delta)) tParts.push([clamp(60 + si.delta * 4, 0, 100), 0.3]);
    out.training = ctx.len >= 7 ? sum(tParts.map((p) => p[0] * p[1])) / sum(tParts.map((p) => p[1])) : null;
    detail.training = `${SD.nf(perW, 1)} séances / sem (objectif ${cfg.sessionsPerWeek})${isNum(si.delta) ? ` · indice de force ${SD.sgn(si.delta, 1)} pts` : ''}`;

    const ns = full.map(nutriScore).filter(isNum);
    const cov = full.length ? ns.length / full.length : 0;
    out.nutrition = ns.length >= 3 ? 0.85 * mean(ns) + 0.15 * cov * 100 : null;
    detail.nutrition = ns.length ? `${ns.length} jours loggés (${Math.round(cov * 100)} %) · score moyen ${Math.round(mean(ns))}` : 'Pas de journées loggées';

    const act = full.map((x) => x.actScore).filter(isNum);
    out.activity = act.length >= 3 ? mean(act) : null;
    const st = full.map((x) => x.steps).filter(isNum);
    detail.activity = st.length ? `${SD.nf(mean(st), 0)} pas / jour · ${Math.round((st.filter((v) => v >= cfg.stepsFloor).length / st.length) * 100)} % ≥ ${SD.nf(cfg.stepsFloor, 0)}` : 'Pas de données de pas';

    const tw = days.filter((x) => isNum(x.trendW));
    let rate = null, span = 0;
    if (tw.length >= 3) {
      // rythme du poids tendance (déjà lissé) ; sur une fenêtre courte (une semaine du bulletin), on regarde 14 jours en arrière
      const b = tw[tw.length - 1];
      span = Math.max(14, SD.nDays(tw[0].d, b.d) - 1);
      let a = null;
      for (let k = 0; k <= 3 && !a; k++) {
        for (const off of k ? [span + k, span - k] : [span]) { const y = SD.M.at(SD.addD(b.d, -off)); if (y && isNum(y.trendW)) { a = y; break; } }
      }
      const wk = a ? (SD.nDays(a.d, b.d) - 1) / 7 : 0;
      if (wk >= 1) rate = (b.trendW - a.trendW) / wk;
    }
    const phase = tw.length ? tw[tw.length - 1].phase : null;
    const rt = phase && cfg.weeklyRate && cfg.weeklyRate[phase];
    if (isNum(rate) && rt) {
      const dist = rate < rt[0] ? rt[0] - rate : rate > rt[1] ? rate - rt[1] : 0;
      // sur moins de 4 semaines, le rythme est plus bruité (eau, glycogène) : tolérance élargie
      const tol = span < 28 ? 0.3 : 0.2;
      out.body = Math.max(0, 100 - (dist / tol) * 50);
      detail.body = `${SD.sgn(rate, 2)} kg/sem · cible ${phase} ${SD.sgn(rt[0], 2)} à ${SD.sgn(rt[1], 2)}`;
    } else {
      out.body = null;
      detail.body = isNum(rate) ? `${SD.sgn(rate, 2)} kg/sem (pas de cible de phase)` : 'Pas assez de pesées';
    }

    const avail = PILLARS.filter((p) => isNum(out[p.key]));
    const global = avail.length >= 3 ? sum(avail.map((p) => out[p.key] * p.w)) / sum(avail.map((p) => p.w)) : null;
    const levers = avail.map((p) => ({ key: p.key, label: p.label, score: out[p.key], impact: (out[p.key] - 80) * p.w / 100 }))
      .sort((a, b) => a.impact - b.impact);
    return { pillars: out, detail, global, grade: grade(global), verdict: verdict(global), down: levers.filter((l) => l.score < 75).slice(0, 2), up: levers.slice().reverse().filter((l) => l.score >= 75).slice(0, 2) };
  }

  // ================================================================ âge biologique
  // Références VO2max (FRIEND, Kaminsky 2015, tapis, 50e percentile) par âge central de décennie
  const FRIEND = {
    male: [[25, 48.0], [35, 42.4], [45, 37.8], [55, 32.6], [65, 28.2], [75, 24.4]],
    female: [[25, 37.6], [35, 30.2], [45, 26.7], [55, 23.4], [65, 20.0], [75, 17.3]],
  };
  function interp(table, x) {
    if (x <= table[0][0]) return table[0][1];
    for (let i = 1; i < table.length; i++) {
      if (x <= table[i][0]) {
        const [x0, y0] = table[i - 1], [x1, y1] = table[i];
        return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
      }
    }
    return table[table.length - 1][1];
  }
  // Pas (Paluch 2022, < 60 ans) : médianes de quartiles et risques relatifs
  const STEPS_HR = [[3553, 1.0], [5801, 0.60], [7842, 0.55], [10901, 0.47]];
  function stepsHR(steps) {
    const t = STEPS_HR;
    if (steps <= t[0][0]) return 1.0;
    if (steps >= t[t.length - 1][0]) return t[t.length - 1][1];
    for (let i = 1; i < t.length; i++) {
      if (steps <= t[i][0]) {
        const [x0, y0] = t[i - 1], [x1, y1] = t[i];
        return Math.exp(Math.log(y0) + ((steps - x0) / (x1 - x0)) * (Math.log(y1) - Math.log(y0)));
      }
    }
    return 1;
  }
  const MRDT = 8; // années pour doubler le risque de mortalité (loi de Gompertz)
  const hrToYears = (hr) => MRDT * Math.log2(hr);

  function ageAt(d) {
    const p = SD.M.raw.profile || {};
    const bd = p.birthDate || (p.birthYear ? `${p.birthYear}-07-01` : null);
    if (!bd) return null;
    return (SD.tms(d) - SD.tms(bd)) / (365.25 * SD.DAY);
  }

  /** Âge biologique estimé sur la fenêtre [end − win, end] */
  function bioAge(end, win = 90) {
    const M = SD.M;
    const chrono = ageAt(end);
    if (!isNum(chrono)) return null;
    const sex = /^f/i.test((M.raw.profile || {}).sex || '') ? 'female' : 'male';
    const from = SD.addD(end, -(win - 1));
    const i0 = M.idx.has(from) ? M.idx.get(from) : 0, i1 = M.idx.has(end) ? M.idx.get(end) : M.days.length - 1;
    const w = M.days.slice(i0, i1 + 1).filter((x) => !x.partial);
    const avg = (k) => { const v = w.map((x) => x[k]).filter(isNum); return v.length >= Math.min(10, win / 4) ? mean(v) : null; };
    const factors = [];

    // 1. Capacité cardiorespiratoire
    let vo2 = mean(w.map((x) => x.vo2).filter(isNum));
    let vo2Note = '';
    if (!isNum(vo2)) {
      const past = M.days.slice(Math.max(0, i1 - 365), i1 + 1).filter((x) => isNum(x.vo2));
      if (past.length) { vo2 = past[past.length - 1].vo2; vo2Note = ` (dernière mesure ${SD.fdM(past[past.length - 1].d)})`; }
    }
    const vo2Ref = interp(FRIEND[sex], chrono);
    if (isNum(vo2)) {
      const dMet = (vo2 - vo2Ref) / 3.5;
      factors.push({ key: 'vo2', label: 'VO₂max', value: vo2, unit: 'mL/kg/min', digits: 1, ref: vo2Ref, refLabel: `médiane de ton âge ${SD.nf(vo2Ref, 1)}`,
        hr: Math.pow(0.87, dMet), note: `${SD.sgn(dMet, 1)} MET vs la médiane${vo2Note}`, source: 'Kodama et al., JAMA 2009 (−13 % de mortalité par MET) · FRIEND, Kaminsky 2015' });
    }
    // 2. FC au repos
    const rhr = avg('rhr');
    if (isNum(rhr)) factors.push({ key: 'rhr', label: 'FC au repos', value: rhr, unit: 'bpm', digits: 0, ref: 70, refLabel: 'adulte moyen 70',
      hr: Math.pow(1.09, (rhr - 70) / 10), note: `${SD.sgn(rhr - 70, 0)} bpm vs 70`, source: 'Zhang et al., CMAJ 2016 (+9 % par 10 bpm)' });
    // 3. Sommeil
    const sl = avg('sleepH');
    if (isNum(sl)) {
      const hr = sl < 6 ? 1.12 : sl < 7 ? 1.06 : sl <= 9 ? 1.0 : 1.30;
      factors.push({ key: 'sleep', label: 'Durée de sommeil', value: sl, unit: 'h', digits: 1, ref: 7, refLabel: 'zone neutre 7–9 h',
        hr, note: sl < 7 ? 'sous 7 h' : sl <= 9 ? 'dans la zone 7–9 h' : 'au-delà de 9 h', source: 'Cappuccio et al., Sleep 2010 (court 1,12 ; long 1,30)' });
    }
    // 4. Pas
    const st = avg('steps');
    if (isNum(st)) factors.push({ key: 'steps', label: 'Pas quotidiens', value: st, unit: 'pas', digits: 0, ref: 6000, refLabel: 'adulte moyen ~6 000',
      hr: stepsHR(st) / stepsHR(6000), note: `${SD.nf(st, 0)} pas / jour`, source: 'Paluch et al., Lancet Public Health 2022' });
    // 5. Musculation
    const strMinWeek = sum(w.map((x) => (x.train && isNum(x.strMin) ? x.strMin : 0))) / Math.max(1, w.length / 7);
    if (w.length >= 28) {
      const m = strMinWeek;
      const hr = m <= 0 ? 1 : m < 40 ? 1 - 0.17 * (m / 40) : m <= 140 ? 0.83 : 0.9;
      factors.push({ key: 'strength', label: 'Musculation', value: m, unit: 'min / sem', digits: 0, ref: 40, refLabel: 'bénéfice max 30–60 min',
        hr, note: m > 140 ? 'au-delà de 140 min, le bénéfice s’atténue (courbe en J)' : m >= 40 ? 'dans la zone de bénéfice maximal' : 'sous 40 min / sem', source: 'Momma et al., BJSM 2022' });
    }
    for (const f of factors) f.years = clamp(hrToYears(f.hr), -5, 5);
    const delta = clamp(sum(factors.map((f) => f.years)), -12, 12);
    return {
      end, chrono, bio: chrono + delta, delta, factors, sex,
      confidence: factors.length >= 5 ? 'Élevée' : factors.length >= 3 ? 'Moyenne' : 'Faible',
    };
  }

  /** Âge biologique mois par mois + rythme de vieillissement (années biologiques par année civile) */
  function bioAgeHistory(end, months = 24) {
    const M = SD.M;
    const pts = [];
    let d = end;
    for (let i = 0; i < months; i++) {
      if (d < SD.addD(M.first, 60)) break;
      const b = bioAge(d, 90);
      if (b && b.factors.length >= 3) pts.push(b);
      d = SD.addD(SD.monthOf(d), -1);
    }
    pts.reverse();
    let pace = null;
    const last = pts.filter((p) => SD.nDays(p.end, end) <= 366);
    if (last.length >= 4) {
      const xs = last.map((p) => p.chrono), ys = last.map((p) => p.delta);
      const { b } = SD.linreg(xs, ys);
      pace = clamp(1 + b, -1, 3);
    }
    return { points: pts, pace };
  }

  // ================================================================ biomarqueurs
  const BIOMARKERS = [
    { group: 'Cardio', key: 'rhr', label: 'FC au repos', unit: 'bpm', digits: 0, dir: -1, pop: 'optimal < 60 · normal 60–100',
      status: (v) => (v < 60 ? 'good' : v <= 75 ? 'warn' : 'crit'), scale: [40, 90], zones: [[40, 60, 'good'], [60, 75, 'warn'], [75, 90, 'crit']] },
    { group: 'Cardio', key: 'hrv', label: 'HRV (indicative)', unit: 'ms', digits: 0, dir: 1, pop: 'norme personnelle' },
    { group: 'Cardio', key: 'hrLo', label: 'FC minimale du jour', unit: 'bpm', digits: 0, dir: -1, pop: 'norme personnelle' },
    { group: 'Cardio', key: 'vo2', label: 'VO₂max', unit: 'mL/kg/min', digits: 1, dir: 1, pop: 'médiane FRIEND pour ton âge', vo2: true, window: 180 },
    { group: 'Cardio', key: 'walkHR', label: 'FC à la marche', unit: 'bpm', digits: 0, dir: -1, pop: 'norme personnelle' },
    { group: 'Respiration', key: 'resp', label: 'Fréquence respiratoire', unit: '/min', digits: 1, dir: 0, pop: 'normal 12–20',
      status: (v) => (v >= 12 && v <= 20 ? 'good' : v >= 10 && v <= 22 ? 'warn' : 'crit'), scale: [8, 24], zones: [[8, 10, 'crit'], [10, 12, 'warn'], [12, 20, 'good'], [20, 22, 'warn'], [22, 24, 'crit']] },
    { group: 'Respiration', key: 'spo2', label: 'Saturation SpO₂', unit: '%', digits: 1, dir: 1, pop: 'normal ≥ 95',
      status: (v) => (v >= 95 ? 'good' : v >= 92 ? 'warn' : 'crit'), scale: [88, 100], zones: [[88, 92, 'crit'], [92, 95, 'warn'], [95, 100, 'good']] },
    { group: 'Mobilité', key: 'walkSpeed', label: 'Vitesse de marche', unit: 'km/h', digits: 2, dir: 1, pop: '≥ 3,6 km/h (1 m/s)',
      status: (v) => (v >= 4 ? 'good' : v >= 3.6 ? 'warn' : 'crit'), scale: [2.5, 6.5], zones: [[2.5, 3.6, 'crit'], [3.6, 4, 'warn'], [4, 6.5, 'good']] },
    { group: 'Mobilité', key: 'stepLen', label: 'Longueur de pas', unit: 'cm', digits: 0, dir: 1, pop: 'norme personnelle' },
    { group: 'Mobilité', key: 'dblSupport', label: 'Temps de double appui', unit: '%', digits: 1, dir: -1, pop: 'typique 20–40 %',
      status: (v) => (v >= 20 && v <= 40 ? 'good' : 'warn'), scale: [15, 45], zones: [[15, 20, 'warn'], [20, 40, 'good'], [40, 45, 'warn']] },
    { group: 'Mobilité', key: 'walkAsym', label: 'Asymétrie de marche', unit: '%', digits: 1, dir: -1, pop: 'base perso, alerte au seuil',
      statusCfg: true },
    { group: 'Mobilité', key: 'stairUp', label: 'Vitesse en montée d’escalier', unit: 'm/s', digits: 2, dir: 1, pop: 'norme personnelle' },
    { group: 'Mobilité', key: 'stairDown', label: 'Vitesse en descente d’escalier', unit: 'm/s', digits: 2, dir: 1, pop: 'norme personnelle' },
    { group: 'Composition', key: 'trendW', label: 'Poids tendance', unit: 'kg', digits: 1, dir: 0, pop: 'suivi de phase' },
    { group: 'Composition', key: 'bodyFat', label: 'Masse grasse', unit: '%', digits: 1, dir: -1, pop: 'forme < 18 % (homme)', bodyFat: true },
    { group: 'Composition', key: 'lean', label: 'Masse maigre', unit: 'kg', digits: 1, dir: 1, pop: 'norme personnelle' },
    { group: 'Composition', key: 'bmi', label: 'IMC', unit: '', digits: 1, dir: 0, pop: '18,5–25 (peu adapté aux profils musclés)',
      status: (v) => (v >= 18.5 && v < 25 ? 'good' : v < 30 ? 'warn' : 'crit'), scale: [16, 34], zones: [[16, 18.5, 'warn'], [18.5, 25, 'good'], [25, 30, 'warn'], [30, 34, 'crit']] },
  ];

  function biomarkers(end) {
    const M = SD.M, cfg = M.cfg.targets;
    const i1 = M.idx.has(end) ? M.idx.get(end) : M.days.length - 1;
    const slice = (a, b) => M.days.slice(Math.max(0, i1 - a + 1), Math.max(0, i1 - b + 1)).filter((x) => !x.partial);
    const out = [];
    const sex = /^f/i.test((M.raw.profile || {}).sex || '') ? 'female' : 'male';
    for (const def of BIOMARKERS) {
      const cw = def.window || 30;
      const cur = slice(cw, 0).map((x) => x[def.key]).filter(isNum);
      const base = slice(120, 30).map((x) => x[def.key]).filter(isNum);
      const hist = slice(365, 0).map((x) => x[def.key]).filter(isNum);
      if (!cur.length && !hist.length) continue;
      const value = cur.length ? mean(cur) : null;
      const bl = base.length >= 5 ? robust(base) : null;
      const row = Object.assign({}, def, { value, n: cur.length, baseline: bl ? bl.m : null, baseSd: bl ? bl.s : null,
        z: bl && isNum(value) ? (value - bl.m) / bl.s : null, min: hist.length ? Math.min(...hist) : null, max: hist.length ? Math.max(...hist) : null,
        spark: M.days.slice(Math.max(0, i1 - 180), i1 + 1).map((x) => x[def.key]) });
      if (def.vo2) {
        const ref = interp(FRIEND[sex], ageAt(end) || 33);
        row.pop = `médiane FRIEND pour ton âge : ${SD.nf(ref, 1)}`;
        // ±10 % autour de la médiane de ton âge = dans la moyenne ; au-dessus = optimal
        row.status = (v) => (v >= ref * 1.1 ? 'good' : v >= ref * 0.9 ? 'ok' : v >= ref * 0.75 ? 'warn' : 'crit');
        row.scale = [ref * 0.6, ref * 1.4];
        row.zones = [[ref * 0.6, ref * 0.75, 'crit'], [ref * 0.75, ref * 0.9, 'warn'], [ref * 0.9, ref * 1.1, 'ok'], [ref * 1.1, ref * 1.4, 'good']];
      }
      if (def.bodyFat) {
        const [g, w] = sex === 'female' ? [25, 32] : [18, 25];
        row.pop = sex === 'female' ? 'forme < 25 %' : 'forme < 18 % · moyenne 18–25 %';
        row.status = (v) => (v < g ? 'good' : v < w ? 'warn' : 'crit');
        row.scale = [g - 12, w + 8];
        row.zones = [[g - 12, g, 'good'], [g, w, 'warn'], [w, w + 8, 'crit']];
      }
      if (def.statusCfg) {
        const b = cfg.walkAsymBase, a = cfg.walkAsymAlert;
        row.pop = `base ${SD.nf(b, 0)} % · alerte ${SD.nf(a, 0)} %`;
        row.status = (v) => (v <= b + 1 ? 'good' : v < a ? 'warn' : 'crit');
        row.scale = [0, a + 3];
        row.zones = [[0, b + 1, 'good'], [b + 1, a, 'warn'], [a, a + 3, 'crit']];
      }
      row.state = isNum(value) && row.status ? row.status(value)
        : isNum(row.z) ? (Math.abs(row.z) < 1 ? 'good' : (row.dir === 0 ? 'warn' : Math.sign(row.z) === row.dir ? 'good' : Math.abs(row.z) < 2 ? 'warn' : 'crit')) : null;
      out.push(row);
    }
    // Tour de taille / taille (Ashwell : garder le tour de taille sous la moitié de la taille)
    const h = (M.raw.profile || {}).heightCm;
    const waist = M.raw.body.filter((b) => b.d <= end && isNum(b['Tour de taille']));
    if (h && waist.length) {
      const last = waist[waist.length - 1];
      const r = last['Tour de taille'] / h;
      out.push({ group: 'Composition', key: 'whtr', label: 'Tour de taille / taille', unit: '', digits: 3, value: r, n: 1, pop: 'objectif < 0,5',
        note: `${SD.nf(last['Tour de taille'], 1)} cm le ${SD.fdM(last.d)}`, state: r < 0.5 ? 'good' : r < 0.6 ? 'warn' : 'crit',
        scale: [0.4, 0.7], zones: [[0.4, 0.5, 'good'], [0.5, 0.6, 'warn'], [0.6, 0.7, 'crit']],
        spark: waist.map((b) => b['Tour de taille'] / h) });
    }
    return out;
  }

  // ================================================================ impact des habitudes
  const AUTO_TAGS = [
    { id: 'auto_alcool', label: 'Alcool (loggé)', test: (x) => isNum(x.alcohol) && x.alcohol > 0 },
    { id: 'auto_cafeine', label: 'Caféine ≥ 400 mg', test: (x) => isNum(x.caffeine) && x.caffeine >= 400 },
    { id: 'auto_muscu', label: 'Séance de muscu', test: (x) => x.train },
    { id: 'auto_jambes', label: 'Séance jambes', test: (x) => x.split === 'Bas du corps' },
    { id: 'auto_velo', label: 'Vélo', test: (x) => x.w.some((w) => w.type === 'Vélo') },
    { id: 'auto_charge', label: 'Charge ≥ 70', test: (x) => isNum(x.strain) && x.strain >= 70 },
    { id: 'auto_pas', label: 'Pas ≥ 10 000', test: (x) => isNum(x.steps) && x.steps >= 10000 },
    { id: 'auto_surplus', label: 'Surplus ≥ 300 kcal', test: (x) => SD.logged(x) && isNum(x.tdee) && x.kcal - x.tdee >= 300 },
    { id: 'auto_deficit', label: 'Déficit ≥ 300 kcal', test: (x) => SD.logged(x) && isNum(x.tdee) && x.tdee - x.kcal >= 300 },
    { id: 'auto_court', label: 'Nuit < 6 h 30', test: (x) => isNum(x.sleepH) && x.sleepH < 6.5 },
    { id: 'auto_repas_tard', label: 'Dernier repas après 21 h', test: (x) => isNum(x.lastMeal) && x.lastMeal >= 21 * 60 },
  ];

  /**
   * Association entre chaque habitude et la récupération du lendemain, corrigée de la récupération du jour même
   * (différence des résidus moyens, t de Welch). Une association n'est pas une preuve de cause.
   * @param days jours de la période ; @param manual Map(date -> [tagId]) ; @param labels {id: label}
   */
  function tagImpact(days, manual, labels) {
    const M = SD.M;
    const tagsOf = (x) => {
      const t = new Set((manual.get(x.d) || []).map((id) => 'm_' + id));
      for (const a of AUTO_TAGS) if (a.test(x)) t.add(a.id);
      return t;
    };
    const rows = [];
    const ids = new Set(AUTO_TAGS.map((a) => a.id));
    for (const [, arr] of manual) for (const id of arr) ids.add('m_' + id);
    const pairs = days.filter((x) => !x.partial && isNum(x.rec)).map((x) => ({ x, next: M.at(SD.addD(x.d, 1)), tags: tagsOf(x) }))
      .filter((p) => p.next && isNum(p.next.rec));
    if (pairs.length < 10) return [];
    // Ajustement sur l'état du jour : on s'entraîne plus dur les jours où l'on est déjà bien récupéré, et la récupération
    // est autocorrélée. On compare donc les résidus de récup(J+1) ~ a + b·récup(J), pas les niveaux bruts.
    const { a, b } = SD.linreg(pairs.map((p) => p.x.rec), pairs.map((p) => p.next.rec));
    for (const p of pairs) p.r = p.next.rec - (a + b * p.x.rec);
    for (const id of ids) {
      const yes = pairs.filter((p) => p.tags.has(id)).map((p) => p.r);
      const no = pairs.filter((p) => !p.tags.has(id)).map((p) => p.r);
      if (yes.length < 3 || no.length < 3) continue;
      const d = mean(yes) - mean(no);
      const v1 = sdev(yes) ** 2 / yes.length, v2 = sdev(no) ** 2 / no.length;
      const t = v1 + v2 > 0 ? d / Math.sqrt(v1 + v2) : 0;
      const auto = AUTO_TAGS.find((a) => a.id === id);
      rows.push({ id, label: auto ? auto.label : labels[id.slice(2)] || id.slice(2), manual: !auto, d, t, nYes: yes.length, nNo: no.length, sig: Math.abs(t) >= 2.5 && yes.length >= 8 }); // ~10 habitudes testées à la fois : seuil relevé contre les faux positifs
    }
    return rows.sort((a, b) => a.d - b.d);
  }

  // ================================================================ projection du poids
  function projection(endDate, target) {
    const M = SD.M;
    const i1 = M.idx.has(endDate) ? M.idx.get(endDate) : M.days.length - 1;
    const pts = M.days.slice(Math.max(0, i1 - 27), i1 + 1).filter((x) => isNum(x.trendW));
    if (pts.length < 14) return null;
    const x0 = SD.tms(pts[0].d);
    const xs = pts.map((p) => (SD.tms(p.d) - x0) / SD.DAY), ys = pts.map((p) => p.trendW);
    const { a, b } = SD.linreg(xs, ys);
    const res = ys.map((y, i) => y - (a + b * xs[i]));
    const s = Math.sqrt(sum(res.map((r) => r * r)) / Math.max(1, ys.length - 2));
    const mx = mean(xs), sxx = sum(xs.map((x) => (x - mx) ** 2));
    const seB = sxx > 0 ? s / Math.sqrt(sxx) : 0;
    const last = pts[pts.length - 1];
    const tgt = target || SD.addD(last.d, 56);
    const out = [];
    // la projection part du dernier poids tendance (pas de la droite ajustée) et suit la pente des 28 jours
    for (let d = last.d; d <= tgt; d = SD.addD(d, 1)) {
      const h = (SD.tms(d) - SD.tms(last.d)) / SD.DAY;
      const y = last.trendW + b * h;
      // incertitude : erreur sur la pente, bruit autour de la tendance, dérive possible de la pente (0,05 kg/sem par semaine d'horizon)
      const e = 1.96 * Math.sqrt((seB * h) ** 2 + s * s * Math.min(1, h / 7)) + (0.05 / 7) * h;
      out.push({ d, y, lo: y - e, hi: y + e });
    }
    return { slopeWeek: b * 7, from: last, points: out, end: out[out.length - 1] };
  }

  SD.scores = {
    phi, robust, enrich, nutriScore, dayScore, strainTarget, strengthIndex, periodScores, PILLARS, grade, verdict,
    recZone, strainZone, STRAIN_LABEL, STRAIN_ZONES, bioAge, bioAgeHistory, ageAt, biomarkers, BIOMARKERS, AUTO_TAGS, tagImpact, projection,
    FRIEND_REF: (age, sex) => interp(FRIEND[sex || 'male'], age),
  };
})();
