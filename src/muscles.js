/* Salle des Machines — volume par groupe musculaire, direct et indirect.
 * Séries effectives = directes + ½ × indirectes : convention de MacroFactor (muscle principal = 1, secondaire = 0,5)
 * et comptage « fractionné » de la méta-régression dose-réponse de Pelland et al. (2024). Le tonnage suit la même règle. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.SD = root.SD || {}; root.SD.muscles = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // [motif, muscles principaux, muscles secondaires] : la première règle qui correspond l'emporte
  const RULES = [
    [/neck/i, ['Cou'], []],
    [/wrist|finger flexion|forearm curl/i, ['Avant-bras'], []],
    [/calf/i, ['Mollets'], []],
    [/hip abduction|abductor/i, ['Abducteurs'], []],
    [/hip adduction|adductor/i, ['Adducteurs'], []],
    [/face pull/i, ['Deltoïdes post.'], ['Haut du dos', 'Trapèzes']],
    [/rear delt|reverse\)? fly/i, ['Deltoïdes post.'], ['Haut du dos']],
    [/upright row/i, ['Deltoïdes lat.'], ['Trapèzes', 'Biceps']],
    [/lat(eral)? raises?/i, ['Deltoïdes lat.'], ['Deltoïdes ant.']],
    [/shrug/i, ['Trapèzes'], []],
    [/straight arm|pull ?over|lat pull-in/i, ['Dorsaux'], []],
    [/pull ?-?down|pull ?-?up|chin ?-?up/i, ['Dorsaux'], ['Biceps', 'Haut du dos']],
    [/row\b/i, ['Haut du dos', 'Dorsaux'], ['Biceps', 'Deltoïdes post.']],
    [/bench dips?/i, ['Triceps'], ['Pectoraux']],
    [/dips?\b/i, ['Pectoraux', 'Triceps'], ['Deltoïdes ant.']],
    [/(bench|chest|incline|decline|floor).*press|push-?ups?/i, ['Pectoraux'], ['Triceps', 'Deltoïdes ant.']],
    [/\bfly\b|pec dec[k]?/i, ['Pectoraux'], ['Deltoïdes ant.']],
    [/shoulder press|overhead press|military|arnold/i, ['Deltoïdes ant.'], ['Triceps', 'Deltoïdes lat.']],
    [/tricep|skull crusher|pushdown|kickback|close[- ]grip bench/i, ['Triceps'], []],
    [/(leg|hamstring).*curl|nordic/i, ['Ischios'], []],
    [/leg extension/i, ['Quadriceps'], []],
    [/romanian|\brdl\b|stiff[ -]leg|good morning/i, ['Ischios'], ['Fessiers', 'Lombaires']],
    [/sumo deadlift/i, ['Fessiers', 'Quadriceps', 'Adducteurs'], ['Ischios', 'Lombaires', 'Trapèzes']],
    [/deadlift/i, ['Ischios', 'Fessiers', 'Lombaires'], ['Quadriceps', 'Trapèzes', 'Avant-bras']],
    [/hip thrust|glute bridge|glute kickback/i, ['Fessiers'], ['Ischios']],
    [/back extension|hyperextension/i, ['Lombaires'], ['Fessiers', 'Ischios']],
    [/lunge|split squat|step ?-?up/i, ['Quadriceps', 'Fessiers'], ['Adducteurs', 'Ischios']],
    [/squat|leg press|hack/i, ['Quadriceps'], ['Fessiers', 'Adducteurs']],
    [/wall sit/i, ['Quadriceps'], []],
    [/hammer.*curl|reverse curl/i, ['Biceps'], ['Avant-bras']],
    [/curl/i, ['Biceps'], []],
    [/oblique|russian twist|chop|side plank|woodchop/i, ['Obliques'], ['Abdos']],
    [/crunch|sit-?up|leg raise|knee raise|plank|\bab\b|abs\b|hollow|rollout/i, ['Abdos'], []],
  ];
  const ORDER = ['Pectoraux', 'Dorsaux', 'Haut du dos', 'Trapèzes', 'Deltoïdes ant.', 'Deltoïdes lat.', 'Deltoïdes post.', 'Biceps', 'Triceps', 'Avant-bras',
    'Quadriceps', 'Ischios', 'Fessiers', 'Adducteurs', 'Abducteurs', 'Mollets', 'Abdos', 'Obliques', 'Lombaires', 'Cou'];
  const cache = new Map();

  /** Muscles d'un exercice : {p: principaux, s: secondaires} ou null si non classé */
  function classify(name) {
    if (cache.has(name)) return cache.get(name);
    let out = null;
    for (const [re, p, s] of RULES) if (re.test(name)) { out = { p, s }; break; }
    cache.set(name, out);
    return out;
  }

  const monday = (d) => { const t = new Date(d + 'T00:00:00Z'); const wd = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - wd); return t.toISOString().slice(0, 10); };

  /**
   * Agrégat sur une période.
   * - séries directes / tonnage direct : exercices dont le muscle est le moteur principal (règles ci-dessus) ;
   * - séries effectives / tonnage total : chiffres exacts de MacroFactor les jours où il en fournit
   *   (principal = 1, secondaire = 0,5), sinon calcul par les règles ;
   * - apport indirect = ce qui reste, en équivalent séries effectives (effectives − directes).
   * @param exercises [{d, n, sets, vol}]  @param weeks durée en semaines  @param mf [{d, m, sets, vol}] (facultatif)
   */
  function aggregate(exercises, weeks, mf) {
    const unmapped = new Map();
    const day = new Map(); // "d|m" -> {direct, tonD, ruleEff, ruleTon}
    const cell = (d, m) => { const k = d + '|' + m; return day.get(k) || day.set(k, { d, m, direct: 0, tonD: 0, ruleEff: 0, ruleTon: 0 }).get(k); };
    for (const e of exercises) {
      const sets = e.sets || 0, vol = e.vol || 0;
      if (!sets) continue;
      const c = classify(e.n);
      if (!c) { unmapped.set(e.n, (unmapped.get(e.n) || 0) + sets); continue; }
      for (const m of c.p) { const o = cell(e.d, m); o.direct += sets; o.tonD += vol; o.ruleEff += sets; o.ruleTon += vol; }
      for (const m of c.s) { const o = cell(e.d, m); o.ruleEff += 0.5 * sets; o.ruleTon += 0.5 * vol; }
    }
    const mfDays = new Set((mf || []).map((q) => q.d));
    for (const q of mf || []) { const o = cell(q.d, q.m); o.mfEff = q.sets || 0; o.mfTon = q.vol || 0; }
    const tot = new Map(), weekly = new Map(), freqDays = new Map();
    for (const o of day.values()) {
      const eff = mfDays.has(o.d) ? o.mfEff || 0 : o.ruleEff;
      const ton = mfDays.has(o.d) ? o.mfTon || 0 : o.ruleTon;
      if (!eff && !o.direct) continue;
      const indirect = Math.max(0, eff - o.direct), tonI = Math.max(0, ton - o.tonD);
      const add = (a) => { a.direct += o.direct; a.indirect += indirect; a.eff += Math.max(eff, o.direct); a.tonD += o.tonD; a.tonI += tonI; };
      add(tot.get(o.m) || tot.set(o.m, { direct: 0, indirect: 0, eff: 0, tonD: 0, tonI: 0 }).get(o.m));
      const w = monday(o.d);
      const wk = weekly.get(w) || weekly.set(w, new Map()).get(w);
      add(wk.get(o.m) || wk.set(o.m, { direct: 0, indirect: 0, eff: 0, tonD: 0, tonI: 0 }).get(o.m));
      if (o.direct > 0) (freqDays.get(o.m) || freqDays.set(o.m, new Set()).get(o.m)).add(o.d);
    }
    const W = Math.max(1, weeks);
    const rows = [...tot.entries()].map(([m, a]) => ({
      m, direct: a.direct / W, indirect: a.indirect / W, eff: a.eff / W, tonD: a.tonD / W, tonI: a.tonI / W,
      freq: (freqDays.get(m) ? freqDays.get(m).size : 0) / W,
    })).sort((x, y) => (ORDER.indexOf(x.m) + 1 || 99) - (ORDER.indexOf(y.m) + 1 || 99));
    return { rows, weekly, unmapped: [...unmapped.entries()].map(([n, sets]) => ({ n, sets })).sort((a, b) => b.sets - a.sets) };
  }

  return { RULES, ORDER, classify, aggregate };
});
