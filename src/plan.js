/* Salle des Machines — plan du jour.
 *
 * À partir de ce que le dashboard sait déjà :
 *  - le programme actif MacroFactor (cycles de jours, séries, fourchettes, RIR, consignes) et les séances réalisées,
 *    pour savoir quelle séance vient aujourd'hui (le programme est séquentiel : une séance manquée reste à faire) ;
 *  - l'historique série par série, pour proposer une charge par exercice (force estimée → charge pour la fourchette) ;
 *  - l'état du matin (récupération de la nuit, sommeil vs besoin, douleurs notées) pour moduler la séance ;
 *  - l'agenda (si connecté) pour le créneau et la semaine ; le rapport du coach du jour s'il existe.
 */
(function () {
  'use strict';
  const SD = window.SD;
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const median = (a) => { const s = a.filter(isNum).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

  const todayLocal = () => new Date().toLocaleDateString('sv-SE');

  // ---------------------------------------------------------------- programme
  function slotsOf(prog) {
    const out = [];
    prog.cycles.forEach((c, ci) => c.forEach((d, di) => out.push({ i: out.length, cycle: ci + 1, pos: di, day: d.day, rest: d.rest, ex: d.ex })));
    return out;
  }
  const rw = (r) => SD.scores.rirWeight(r);
  /** Séries efficaces prévues pour une séance du programme (mêmes poids RIR que le réalisé) */
  function plannedStim(slot) {
    if (!slot || slot.rest) return null;
    let s = 0;
    for (const e of slot.ex) for (const q of e.sets) s += rw(q.rir);
    return Math.round(s * 10) / 10;
  }
  const plannedSets = (slot) => (slot && !slot.rest ? slot.ex.reduce((a, e) => a + e.sets.length, 0) : 0);

  /**
   * État séquentiel du programme au jour `today` :
   *  - chaque séance MacroFactor « Programme (Jour) » est rattachée au prochain jour du même nom dans la séquence ;
   *  - chaque jour calendaire sans séance consomme un jour de repos prévu, jamais une séance (elle reste à faire).
   */
  function programState(M, today) {
    const prog = M.raw.program;
    if (!prog || !prog.cycles || !prog.cycles.length) return null;
    const S = slotsOf(prog);
    const sess = (M.raw.mfSessions || [])
      .map((s) => ({ d: s.d, w: (s.w || []).find((w) => w.prog === prog.name && w.day) }))
      .filter((s) => s.w && s.d <= today)
      .sort((a, b) => a.d.localeCompare(b.d));
    const done = new Map();
    let p = 0, lastD = null;
    for (const s of sess) {
      let j = p;
      while (j < S.length && j < p + 8 && (S[j].rest || S[j].day.toLowerCase() !== s.w.day.toLowerCase())) j++;
      if (j < S.length && !S[j].rest && S[j].day.toLowerCase() === s.w.day.toLowerCase()) { done.set(s.d, { slot: S[j], min: s.w.min }); p = j + 1; lastD = s.d; }
    }
    const doneToday = done.get(today) || null;
    // jours écoulés depuis la dernière séance (hors aujourd'hui) : consomment les repos prévus
    if (lastD && !doneToday) {
      for (let d = SD.addD(lastD, 1); d < today; d = SD.addD(d, 1)) { if (p < S.length && S[p].rest) p++; }
    }
    const cur = doneToday ? doneToday.slot : p < S.length ? S[p] : null;
    const trainSlots = S.filter((s) => !s.rest).length;
    // semaine projetée : un jour = un emplacement du programme, à partir d'aujourd'hui
    const week = [];
    let q = doneToday ? doneToday.slot.i + 1 : p;
    for (let k = 0; k < 7; k++) {
      const d = SD.addD(today, k);
      if (k === 0) { week.push({ d, slot: cur, done: !!doneToday }); if (!doneToday) q = p + 1; continue; }
      week.push({ d, slot: q < S.length ? S[q] : null });
      q++;
    }
    return { prog, S, done, cur, doneToday, sessionNo: done.size + (doneToday ? 0 : 1), trainSlots, week, lastD, end: !cur };
  }

  /** Rattache à chaque jour passé du programme l'effort prévu (pour comparer prévu / réalisé) */
  function attach(M) {
    const st = programState(M, M.last);
    M.programState = st;
    if (!st) return;
    for (const [d, v] of st.done) {
      const x = M.at(d);
      if (x) { x.effPlan = plannedStim(v.slot); x.planDay = v.slot.day; x.planCycle = v.slot.cycle; }
    }
  }

  // ---------------------------------------------------------------- charges visées
  const epleyLoad = (e1, reps, rir) => e1 / (1 + ((reps || 0) + (rir || 0)) / 30);
  function history(M, name, before) {
    return M.raw.exercises.filter((e) => e.n === name && e.d < before && (isNum(e.e1) || (e.ss && e.ss.length))).sort((a, b) => b.d.localeCompare(a.d));
  }
  /** Charge « visée » : force estimée récente → charge pour le milieu de la fourchette au RIR prévu, calée sur une charge que tu as déjà utilisée */
  function targetFor(M, ex, today) {
    const P = window.SDParsers;
    const pair = P && P.isPairDB ? P.isPairDB(ex.n) : /dumbbell/i.test(ex.n);
    const h = history(M, ex.n, today);
    const last = h[0] || null;
    const recent = h.filter((e) => SD.nDays(e.d, today) <= 60 && isNum(e.e1)).slice(0, 2);
    const e1 = recent.length ? Math.max(...recent.map((e) => e.e1)) : last && isNum(last.e1) ? last.e1 : null;
    const s0 = ex.sets[0] || {};
    let load = null;
    if (e1 && isNum(s0.lo) && !ex.timed) {
      const reps = s0.lo + Math.round(((s0.hi || s0.lo) - s0.lo) / 3);
      const raw = epleyLoad(e1, reps, isNum(s0.rir) ? s0.rir : 2);
      // charges déjà utilisées sur cet exercice (reflètent les pas de charge de ta salle)
      const used = new Set();
      for (const e of h.slice(0, 20)) for (const q of e.ss || []) if (q[0] > 0) used.add(pair ? q[0] / 2 : q[0]);
      const opts = [...used].sort((a, b) => a - b);
      const near = opts.length ? opts.reduce((b, v) => (Math.abs(v - raw) < Math.abs(b - raw) ? v : b), opts[0]) : null;
      load = near != null && Math.abs(near - raw) / raw <= 0.06 ? near : Math.round(raw * 2) / 2;
    }
    return { pair, last, e1, load };
  }

  const fmtW = (w, pair) => (pair ? `2 × ${SD.nf(w / 2, w % 2 ? 1 : 0)}` : SD.nf(w, w % 1 ? 1 : 0));
  /** « 2 × 42 kg × 8, 8, 7 » à partir des séries enregistrées */
  function fmtSets(e, pair) {
    if (!e || !e.ss || !e.ss.length) return e && isNum(e.hw) ? `${SD.nf(e.hw, 1)} kg · ${e.sets} séries` : '';
    const groups = [];
    for (const q of e.ss) {
      if (!q[0] && q[3]) { groups.push({ t: `${q[3]} s` }); continue; }
      const g = groups[groups.length - 1];
      if (g && g.w === q[0]) g.r.push(q[1]); else groups.push({ w: q[0], r: [q[1]] });
    }
    return groups.map((g) => (g.t ? g.t : `${fmtW(g.w, pair)} kg × ${g.r.join(', ')}`)).join(' · ');
  }

  function sessionPlan(M, slot, today) {
    if (!slot || slot.rest) return null;
    const rows = slot.ex.map((ex) => {
      const t = targetFor(M, ex, today);
      const rirs = ex.sets.map((q) => (isNum(q.rir) ? q.rir : '?'));
      const lo = Math.min(...ex.sets.map((q) => q.lo).filter(isNum)), hi = Math.max(...ex.sets.map((q) => q.hi).filter(isNum));
      return {
        n: ex.n, ss: ex.ss, note: ex.note, timed: ex.timed, sets: ex.sets.length,
        range: isFinite(lo) ? (lo === hi ? `${lo}` : `${lo}–${hi}`) + (ex.timed ? ' s' : '') : '—',
        rir: rirs.join('-'), rest: ex.sets[0] && isNum(ex.sets[0].rest) ? ex.sets[0].rest : null,
        load: t.load, pair: t.pair, e1: t.e1, last: t.last, lastTxt: fmtSets(t.last, t.pair),
      };
    });
    const mins = (M.raw.mfSessions || []).flatMap((s) => (s.w || []).filter((w) => w.day === slot.day && isNum(w.min)).map((w) => w.min));
    const dur = mins.length >= 2 ? median(mins.slice(-6)) : Math.round(plannedSets(slot) * 2.6);
    return { day: slot.day, cycle: slot.cycle, rows, sets: plannedSets(slot), stim: plannedStim(slot), dur };
  }

  // ---------------------------------------------------------------- état du matin
  /**
   * Décision : récupération (zones Whoop : ≥ 67 vert, 34–66 jaune, < 34 rouge), nuit vs besoin, manque de sommeil sur 7 nuits,
   * alerte physiologique, douleurs notées (≥ 4/10 sur une zone sollicitée par la séance).
   */
  function readiness(M, today, slot) {
    const xt = M.at(today);
    const xl = M.at(M.lastComplete);
    let x = null, rec = null, src = null;
    if (xt && isNum(xt.recAM)) { x = xt; rec = xt.recAM; src = 'night'; }
    else if (xt && isNum(xt.rec)) { x = xt; rec = xt.rec; src = 'night'; }
    else if (xl && isNum(xl.rec)) { x = xl; rec = xl.rec; src = 'last'; }
    const sleepX = xt && isNum(xt.sleepH) ? xt : xl;
    const reasons = [];
    let lvl = 0; // 0 feu vert, 1 prudence, 2 allège
    const zone = SD.scores.recZone ? SD.scores.recZone(rec) : null;
    if (isNum(rec)) {
      if (rec < 34) { lvl = Math.max(lvl, 2); reasons.push(`récupération basse (${rec} %)`); }
      else if (rec < 67) { lvl = Math.max(lvl, 1); reasons.push(`récupération moyenne (${rec} %)`); }
      else reasons.push(`récupération haute (${rec} %)`);
    }
    if (sleepX && isNum(sleepX.sleepH)) {
      const need = sleepX.sleepNeed;
      if (sleepX.sleepH < 5) { lvl = Math.max(lvl, 2); reasons.push(`nuit courte (${SD.fH(sleepX.sleepH)})`); }
      else if (isNum(need) && sleepX.sleepH < need - 1.25) { lvl = Math.max(lvl, 1); reasons.push(`nuit sous ton besoin (${SD.fH(sleepX.sleepH)} / ${SD.fH(need)})`); }
      if (isNum(sleepX.sleepDebt7) && sleepX.sleepDebt7 >= 5) { lvl = Math.max(lvl, 1); reasons.push(`manque de sommeil ${SD.fH(sleepX.sleepDebt7)} sur 7 nuits`); }
    }
    if (x && x.alert && x.alert.level === 'crit') { lvl = Math.max(lvl, 2); reasons.push('plusieurs signaux physiologiques hors norme'); }
    // douleurs du journal (aujourd'hui ou hier)
    const pains = {};
    for (const d of [today, SD.addD(today, -1)]) {
      const c = SD.journal && SD.journal.combined ? SD.journal.combined(d) : null;
      if (c) for (const [k, v] of Object.entries(c.pain || {})) if (isNum(v) && !(k in pains)) pains[k] = v;
    }
    const legs = slot && !slot.rest && /leg|lower|jambe|bas/i.test(slot.day);
    const painHits = Object.entries(pains).filter(([k, v]) => v >= 4 && (/lomb|dos/i.test(k) || (/genou|knee|hanche/i.test(k) && legs)));
    if (painHits.length) { lvl = Math.max(lvl, 1); reasons.push(painHits.map(([k, v]) => `${k.toLowerCase()} ${v}/10`).join(', ')); }
    const LV = [
      ['go', 'Feu vert', 'Séance complète : vise le haut des fourchettes au RIR prévu.'],
      ['caution', 'Séance maintenue, avec marge', 'Garde 1 RIR de plus que prévu sur les polyarticulaires, pas d’échec.'],
      ['easy', 'Allège', 'Retire 1 série par polyarticulaire, RIR +1, aucune série à l’échec ; ou décale si ton agenda le permet.'],
    ];
    const L = LV[lvl];
    return { level: L[0], title: L[1], advice: L[2], reasons, rec, zone, src, srcDate: x ? x.d : null, sleep: sleepX, pains, painHits };
  }

  // ---------------------------------------------------------------- muscles
  function muscleStatus(M, today, slot) {
    const R = SD.muscles;
    if (!R) return [];
    const week = {}, last = {};
    for (let k = 1; k <= 10; k++) {
      const d = SD.addD(today, -k), x = M.at(d);
      if (!x) continue;
      for (const e of x.ex) {
        const c = R.classify(e.n);
        if (!c) continue;
        for (const m of c.p) { if (k <= 7) week[m] = (week[m] || 0) + (e.sets || 0); if (!last[m]) last[m] = d; }
        if (k <= 7) for (const m of c.s) week[m] = (week[m] || 0) + 0.5 * (e.sets || 0);
      }
    }
    const plan = {};
    if (slot && !slot.rest) for (const ex of slot.ex) {
      const c = R.classify(ex.n);
      if (!c) continue;
      for (const m of c.p) plan[m] = (plan[m] || 0) + ex.sets.length;
      for (const m of c.s) plan[m] = (plan[m] || 0) + 0.5 * ex.sets.length;
    }
    const [lo, hi] = M.cfg.targets.setsPerMuscleWeek;
    return R.ORDER.filter((m) => week[m] || plan[m]).map((m) => {
      const hrs = last[m] ? (SD.nDays(last[m], today) - 1) * 24 : null;
      return { m, week: Math.round((week[m] || 0) * 10) / 10, plan: Math.round((plan[m] || 0) * 10) / 10, last: last[m] || null, hrs, ready: hrs == null || hrs >= 48, lo, hi };
    });
  }

  // ---------------------------------------------------------------- nutrition, hydratation, sommeil
  function nutritionFor(M, d) {
    const wd = SD.wdOf(d);
    let best = null;
    for (const t of M.raw.targets || []) if (t.d <= d && (!best || t.d >= best.d) && t.wd === (wd + 1) % 7) best = t;
    return best;
  }
  function sleepTonight(M, today, trainDay) {
    const xt = M.at(today) && isNum(M.at(today).sleepBase) ? M.at(today) : M.at(M.lastComplete);
    if (!xt || !isNum(xt.sleepBase)) return null;
    const base = xt.sleepBase;
    let debt3 = 0;
    for (let k = 0; k < 3; k++) { const y = M.at(SD.addD(today, -k)); if (y && isNum(y.sleepH)) debt3 += Math.max(0, base - y.sleepH); }
    const strs = [];
    for (let k = 1; k <= 28; k++) { const y = M.at(SD.addD(today, -k)); if (y && y.train && isNum(y.strain)) strs.push(y.strain); }
    const s = trainDay ? median(strs) : null;
    const adjLoad = isNum(s) ? Math.min(0.5, Math.max(0, s - 50) * 0.01) : 0;
    const adjDebt = Math.min(0.75, 0.25 * debt3);
    return { need: base + adjLoad + adjDebt, base, adjLoad, adjDebt };
  }

  // ---------------------------------------------------------------- agenda
  const hm = (dt) => dt.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
  const atTime = (d, t) => { const [h, m] = String(t).split(':').map(Number); const x = new Date(d + 'T00:00:00'); x.setHours(h, m || 0, 0, 0); return x; };
  /** Créneaux libres d'au moins `need` minutes entre dayStart et dayEnd (événements minutés, marqués occupés) */
  function freeSlots(events, d, need, cfg) {
    const s0 = atTime(d, cfg.dayStart), e0 = atTime(d, cfg.dayEnd);
    let from = s0;
    if (d === todayLocal()) { const now = new Date(); now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0); if (now > from) from = now; }
    const busy = (events || []).filter((e) => !e.allDay && e.busy && e.end > s0 && e.start < e0).map((e) => [e.start, e.end]).sort((a, b) => a[0] - b[0]);
    const out = [];
    let t = from;
    for (const [a, b] of busy) { if (a - t >= need * 60000) out.push([new Date(t), new Date(a)]); if (b > t) t = b; }
    if (e0 - t >= need * 60000) out.push([new Date(t), e0]);
    return out;
  }
  /** Heure de début habituelle : médiane de tes séances (TrainAI), sinon configuration */
  function usualStart(M) {
    const h = (M.raw.sessionStarts || []).slice(-60).map((s) => s.h).filter(isNum);
    return M.cfg.plan && M.cfg.plan.preferredStart ? M.cfg.plan.preferredStart : h.length >= 10 ? `${String(median(h)).padStart(2, '0')}:00` : '18:00';
  }
  function suggestSlot(M, events, d, dur) {
    const cfg = Object.assign({ dayStart: '06:30', dayEnd: '21:30', travelMin: 20 }, M.cfg.plan || {});
    const need = (dur || 60) + cfg.travelMin;
    const free = freeSlots(events, d, need, cfg);
    if (!free.length) return { free, best: null };
    const pref = atTime(d, usualStart(M));
    const score = ([a, b]) => { const t = pref < a ? a : pref > new Date(b - need * 60000) ? new Date(b - need * 60000) : pref; return Math.abs(t - pref); };
    const best = free.slice().sort((x, y) => score(x) - score(y))[0];
    const start = pref < best[0] ? best[0] : pref > new Date(best[1] - need * 60000) ? new Date(best[1] - need * 60000) : pref;
    return { free, best: { start, end: new Date(start.getTime() + (dur || 60) * 60000) }, pref: usualStart(M) };
  }

  SD.plan = { programState, attach, plannedStim, plannedSets, sessionPlan, readiness, muscleStatus, nutritionFor, sleepTonight, freeSlots, suggestSlot, usualStart, fmtSets, fmtW, hm, todayLocal };
})();
