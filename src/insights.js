/* Salle des Machines — insights automatiques calculés sur la période filtrée.
 * Chaque insight indique sa taille d'échantillon ; rien n'est affiché sous les seuils minimaux. */
(function () {
  'use strict';
  const SD = window.SD;

  function confidence(n, strong = 30, mid = 12) {
    return n >= strong ? 'Fiable' : n >= mid ? 'Indicatif' : 'À confirmer';
  }

  /** Semaines entières (lundi → dimanche) contenues dans la période */
  function fullWeeks() {
    const { S, addD, weekOf, wdOf } = SD;
    let k = wdOf(S.from) === 0 ? S.from : addD(weekOf(S.from), 7);
    const out = [];
    while (addD(k, 6) <= S.to) { out.push(k); k = addD(k, 7); }
    return out;
  }

  function strengthRate() {
    const { M, S } = SD;
    const i0 = M.idx.get(S.from), i1 = M.idx.get(S.to);
    return M.days.slice(i0, i1 + 1);
  }

  function build() {
    const { M, F, S, isNum, pluck, mean, median, nf, sgn, addD, nDays, WDL, logged, fH } = SD;
    const cfg = M.cfg.targets;
    const out = [];
    const add = (o) => out.push(Object.assign({ conf: confidence(o.n) }, o));
    const range = strengthRate();
    const full = range.filter((x) => !x.partial);

    // 1. Régularité
    const weeks = fullWeeks();
    if (weeks.length >= 2) {
      const trainSet = new Set(range.filter((x) => x.train).map((x) => x.d));
      const counts = weeks.map((k) => { let c = 0; for (let i = 0; i < 7; i++) if (trainSet.has(addD(k, i))) c++; return c; });
      const hit = counts.filter((c) => c >= cfg.sessionsPerWeek).length;
      let best = 0, cur = 0;
      for (const c of counts) { cur = c >= cfg.sessionsPerWeek ? cur + 1 : 0; best = Math.max(best, cur); }
      let now = 0;
      for (let i = counts.length - 1; i >= 0 && counts[i] >= cfg.sessionsPerWeek; i--) now++;
      const avg = mean(counts);
      add({
        tag: 'Entraînement', prio: 95, n: weeks.length,
        title: `${nf(avg, 1)} séances de muscu par semaine`,
        text: `${hit} semaine${hit > 1 ? 's' : ''} sur ${weeks.length} atteignent l'objectif de ${cfg.sessionsPerWeek}. Meilleure série : ${best} semaine${best > 1 ? 's' : ''} d'affilée${now ? `, série en cours : ${now}` : ''}.`,
      });
    }

    // 2. Poids tendance vs cible de phase
    const tw = range.filter((x) => isNum(x.trendW));
    if (tw.length >= 14) {
      const a = tw[0], b = tw[tw.length - 1];
      const wks = (nDays(a.d, b.d) - 1) / 7;
      const rate = (b.trendW - a.trendW) / wks;
      const phase = b.phase;
      const rt = phase && cfg.weeklyRate && cfg.weeklyRate[phase];
      let verdict = '';
      if (rt) verdict = rate < rt[0] ? ' Sous la cible de la phase.' : rate > rt[1] ? ' Au-dessus de la cible de la phase.' : ' Dans la cible de la phase.';
      add({
        tag: 'Corps', prio: 90, n: tw.length,
        title: `Poids tendance ${sgn(b.trendW - a.trendW, 1)} kg (${sgn(rate, 2)} kg/sem)`,
        text: `De ${nf(a.trendW, 1)} à ${nf(b.trendW, 1)} kg sur ${nf(wks, 0)} semaines.${phase ? ` Phase en cours : ${phase}${rt ? ` (cible ${sgn(rt[0], 2)} à ${sgn(rt[1], 2)} kg/sem)` : ''}.` : ''}${verdict}`,
      });
    }

    // 3. Force : meilleure progression / plus forte baisse (e1RM, ≥ 3 séances)
    const byEx = new Map();
    for (const e of F.exercises) {
      if (!isNum(e.e1)) continue;
      const k = e.n + '|' + e.s;
      (byEx.get(k) || byEx.set(k, []).get(k)).push(e);
    }
    const prog = [];
    for (const [k, arr] of byEx) {
      if (arr.length < 3) continue;
      arr.sort((x, y) => x.d.localeCompare(y.d));
      const h = Math.min(2, Math.floor(arr.length / 2));
      const a = mean(arr.slice(0, h).map((e) => e.e1)), b = mean(arr.slice(-h).map((e) => e.e1));
      prog.push({ n: arr[0].n, k, pct: ((b - a) / a) * 100, a, b, cnt: arr.length });
    }
    if (prog.length >= 2) {
      prog.sort((x, y) => y.pct - x.pct);
      const up = prog[0], down = prog[prog.length - 1];
      const nUp = prog.filter((p) => p.pct > 1).length, nDown = prog.filter((p) => p.pct < -1).length;
      add({
        tag: 'Force', prio: 88, n: prog.length, ex: up.k,
        title: `${nUp} exercice${nUp > 1 ? 's' : ''} en progression, ${nDown} en baisse`,
        text: `Meilleure progression : ${up.n} (${sgn(up.pct, 1)} % d'e1RM, ${up.cnt} séances). ${down.pct < -1 ? `Plus forte baisse : ${down.n} (${sgn(down.pct, 1)} %).` : 'Aucune baisse notable.'}`,
      });
    }

    // 4. Sommeil -> HRV et FC repos du même jour (la nuit est rattachée au jour du réveil)
    const long = full.filter((x) => isNum(x.sleepH) && x.sleepH >= 7);
    const short = full.filter((x) => isNum(x.sleepH) && x.sleepH < 6.5);
    const hL = pluck(long, (x) => x.hrv), hS = pluck(short, (x) => x.hrv);
    const rL = pluck(long, (x) => x.rhr), rS = pluck(short, (x) => x.rhr);
    if (hL.length >= 5 && hS.length >= 5) {
      const dH = mean(hL) - mean(hS), dR = rL.length >= 5 && rS.length >= 5 ? mean(rL) - mean(rS) : null;
      add({
        tag: 'Récupération', prio: 80, n: Math.min(hL.length, hS.length),
        title: Math.abs(dH) < 3 && (dR == null || Math.abs(dR) < 1) ? 'Durée de sommeil : pas d’effet net sur HRV et FC repos' : `Nuits ≥ 7 h : HRV ${sgn(dH, 0)} ms${dR != null ? `, FC repos ${sgn(dR, 1)} bpm` : ''}`,
        text: `Nuits ≥ 7 h : HRV ${sgn(dH, 0)} ms${dR != null ? `, FC repos ${sgn(dR, 1)} bpm` : ''} par rapport aux nuits < 6 h 30 (${hL.length} longues, ${hS.length} courtes). HRV indicative : milieu de la plage min–max du jour.`,
      });
    }

    // 5. Jour de semaine où la récupération est la plus basse
    const recWd = [0, 1, 2, 3, 4, 5, 6].map((w) => ({ w, v: pluck(full.filter((x) => x.wd === w), (x) => x.rec) }));
    const recOk = recWd.filter((o) => o.v.length >= 4).map((o) => ({ w: o.w, m: mean(o.v), n: o.v.length }));
    if (recOk.length >= 5) {
      recOk.sort((a, b) => a.m - b.m);
      const lo = recOk[0], hi = recOk[recOk.length - 1];
      if (hi.m - lo.m >= 5) add({
        tag: 'Récupération', prio: 74, n: lo.n,
        title: `Récupération la plus basse le ${WDL[lo.w]}`,
        text: `Score moyen ${nf(lo.m, 0)}/100 le ${WDL[lo.w]} contre ${nf(hi.m, 0)}/100 le ${WDL[hi.w]}. À croiser avec tes soirées tardives et le volume de la veille.`,
      });
    }

    // 6. Nutrition : adhérence et protéines
    const lg = full.filter((x) => logged(x));
    if (lg.length >= 7) {
      const withT = lg.filter((x) => x.tgt && isNum(x.tgt.kcal));
      const inBand = withT.filter((x) => Math.abs(x.kcal - x.tgt.kcal) <= 0.1 * x.tgt.kcal).length;
      const pk = pluck(lg, (x) => (isNum(x.prot) && isNum(x.trendW) ? x.prot / x.trendW : null));
      const loggedPct = (lg.length / full.length) * 100;
      add({
        tag: 'Nutrition', prio: 78, n: lg.length,
        title: withT.length ? `${nf((inBand / withT.length) * 100, 0)} % des jours à ±10 % de la cible` : `${nf(mean(pluck(lg, (x) => x.kcal)), 0)} kcal/j en moyenne`,
        text: `${lg.length} jours loggés complets (${nf(loggedPct, 0)} % de la période). Protéines : ${nf(mean(pk), 2)} g/kg de poids tendance (cible ${nf(cfg.proteinPerKg[0], 1)}–${nf(cfg.proteinPerKg[1], 1)}).`,
      });
      // Week-end vs semaine
      const we = pluck(lg.filter((x) => x.wd >= 4), (x) => x.kcal), wk = pluck(lg.filter((x) => x.wd < 4), (x) => x.kcal);
      if (we.length >= 4 && wk.length >= 4 && Math.abs(mean(we) - mean(wk)) >= 150) add({
        tag: 'Nutrition', prio: 60, n: Math.min(we.length, wk.length),
        title: `Vendredi–dimanche : ${sgn(mean(we) - mean(wk), 0)} kcal/j`,
        text: `Moyenne de ${nf(mean(we), 0)} kcal du vendredi au dimanche contre ${nf(mean(wk), 0)} kcal du lundi au jeudi (jours loggés).`,
      });
    }

    // 7. Pas : plancher et effet des jours d'entraînement
    const st = full.filter((x) => isNum(x.steps));
    if (st.length >= 7) {
      const pct = (st.filter((x) => x.steps >= cfg.stepsFloor).length / st.length) * 100;
      const tr = pluck(st.filter((x) => x.train), (x) => x.steps), rs = pluck(st.filter((x) => !x.train), (x) => x.steps);
      add({
        tag: 'Activité', prio: 70, n: st.length,
        title: `${nf(mean(pluck(st, (x) => x.steps)), 0)} pas/jour, ${nf(pct, 0)} % des jours ≥ ${nf(cfg.stepsFloor, 0)}`,
        text: tr.length >= 4 && rs.length >= 4
          ? `Jours de muscu : ${nf(mean(tr), 0)} pas ; jours sans muscu : ${nf(mean(rs), 0)} pas. Objectif ${nf(cfg.stepsGoal, 0)}.`
          : `Objectif ${nf(cfg.stepsGoal, 0)} pas.`,
      });
    }

    // 8. Muscles : volume hebdo hors fourchette
    if (F.muscles.length) {
      const wks = Math.max(1, F.len / 7);
      const tot = new Map();
      for (const m of F.muscles) tot.set(m.m, (tot.get(m.m) || 0) + (m.sets || 0));
      const [lo, hi] = cfg.setsPerMuscleWeek;
      const core = ['Pectoraux', 'Dorsaux', 'Haut du dos', 'Quadriceps', 'Ischios', 'Fessiers', 'Deltoïdes lat.', 'Biceps', 'Triceps', 'Mollets', 'Deltoïdes post.'];
      const per = core.filter((m) => tot.has(m)).map((m) => ({ m, v: tot.get(m) / wks }));
      const under = per.filter((p) => p.v < lo).sort((a, b) => a.v - b.v);
      const over = per.filter((p) => p.v > hi).sort((a, b) => b.v - a.v);
      if (per.length >= 5) add({
        tag: 'Volume', prio: 66, n: Math.round(F.len / 7),
        title: under.length ? `${under.length} groupe${under.length > 1 ? 's' : ''} sous ${lo} séries/sem` : `Tous les groupes clés ≥ ${lo} séries/sem`,
        text: `${under.length ? 'Sous la fourchette : ' + under.slice(0, 4).map((p) => `${p.m} ${nf(p.v, 1)}`).join(', ') + '. ' : ''}${over.length ? 'Au-dessus de ' + hi + ' : ' + over.slice(0, 3).map((p) => `${p.m} ${nf(p.v, 1)}`).join(', ') + '.' : ''}`.trim() || 'Volume réparti dans la fourchette cible.',
        conf: confidence(Math.round(F.len / 7), 8, 3),
      });
    }

    // 9. Entraînement -> sommeil de la nuit suivante
    const nxt = (x) => M.at(addD(x.d, 1));
    const sT = pluck(full.filter((x) => x.train), (x) => { const y = nxt(x); return y && !y.partial ? y.sleepH : null; });
    const sR = pluck(full.filter((x) => !x.train), (x) => { const y = nxt(x); return y && !y.partial ? y.sleepH : null; });
    if (sT.length >= 6 && sR.length >= 6) {
      const d = (mean(sT) - mean(sR)) * 60;
      add({
        tag: 'Récupération', prio: 56, n: Math.min(sT.length, sR.length),
        title: `Nuit après la muscu : ${sgn(d, 0)} min de sommeil`,
        text: `${fH(mean(sT))} après une séance contre ${fH(mean(sR))} après un jour sans muscu.`,
      });
    }

    // 10. Jour préféré pour s'entraîner
    const wdRate = [0, 1, 2, 3, 4, 5, 6].map((w) => {
      const ds = range.filter((x) => x.wd === w);
      return { w, n: ds.length, r: ds.length ? (ds.filter((x) => x.train).length / ds.length) * 100 : null };
    }).filter((o) => o.n >= 3);
    if (wdRate.length >= 5) {
      wdRate.sort((a, b) => b.r - a.r);
      const top = wdRate[0], low = wdRate[wdRate.length - 1];
      add({
        tag: 'Habitudes', prio: 50, n: top.n,
        title: `Ton jour le plus régulier : le ${WDL[top.w]}`,
        text: `Séance de muscu ${nf(top.r, 0)} % des ${WDL[top.w]}s, contre ${nf(low.r, 0)} % des ${WDL[low.w]}s.`,
      });
    }

    // 11. Durée des séances : première vs seconde moitié
    const dur = F.days.filter((x) => x.train && isNum(x.strMin));
    if (dur.length >= 8) {
      const h = Math.floor(dur.length / 2);
      const a = median(dur.slice(0, h).map((x) => x.strMin)), b = median(dur.slice(h).map((x) => x.strMin));
      add({
        tag: 'Entraînement', prio: 44, n: dur.length,
        title: `Séance type : ${nf(median(dur.map((x) => x.strMin)), 0)} min`,
        text: `Médiane ${nf(a, 0)} min sur la première moitié de la période, ${nf(b, 0)} min sur la seconde (${sgn(b - a, 0)} min).`,
      });
    }

    return out.sort((a, b) => b.prio - a.prio);
  }

  function render(el, limit) {
    const { esc } = SD;
    const list = build();
    if (!list.length) {
      el.innerHTML = '<div class="empty">Période trop courte ou données insuffisantes pour dégager des tendances fiables.</div>';
      return list;
    }
    el.innerHTML = list.slice(0, limit || list.length).map((i) =>
      `<article class="insight"><div class="tag"><span>${esc(i.tag)}</span><span class="conf">${esc(i.conf)} · n = ${esc(i.n)}</span></div><h3>${esc(i.title)}</h3><p>${esc(i.text)}</p></article>`
    ).join('');
    return list;
  }

  SD.insights = { build, render };
})();
