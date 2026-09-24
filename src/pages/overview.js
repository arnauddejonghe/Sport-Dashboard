/* Page « Vue d'ensemble » : note globale, piliers, radar, bulletin hebdo, récup/charge, KPI, insights, calendrier, poids. */
(function () {
  'use strict';
  const SD = window.SD;
  const { isNum, nf, sgn, fH, fdM, fdS, esc, pluck, mean, median, chart, base, tipBox, xCat, yVal, ring, kpi } = SD;
  const { card, seg, setHTML, setText, avgOf, prevDelta } = SD.ui;

  const PAGE_OF = { recovery: 'recovery', sleep: 'recovery', training: 'training', nutrition: 'body', activity: 'recovery', body: 'body' };

  function ctxFor(days, len) {
    const F = SD.F;
    const set = new Set(days.map((x) => x.d));
    return {
      len, strengthDays: new Set([...F.strengthDays].filter((d) => set.has(d))),
      exercises: F.exercises.filter((e) => set.has(e.d)), muscles: F.muscles.filter((m) => set.has(m.d)),
    };
  }

  const overview = {
    id: 'overview', title: 'Vue d’ensemble', sub: 'Note globale de la période, ce qui la tire vers le haut ou le bas, et tes grandes tendances.',
    html() {
      const S = SD.S;
      return `<section class="card c12"><div class="hero"><div id="ov-ring"></div><div><div class="card-h" style="margin:0"><div><h2>Note globale</h2><p class="sub" id="ov-period"></p></div></div>
          <h3 id="ov-verdict"></h3><p id="ov-verdict-sub"></p><div class="levers" id="ov-levers"></div></div></div>
          <div class="pillars" id="ov-pillars" style="margin-top:18px"></div></section>
        ${card('c6', 'ov-radar', 'Profil de la période', 'Les 6 piliers, période actuelle vs période précédente (0–100)', '', { h: 'tall' })}
        ${card('c6', 'ov-card', 'Bulletin', '', '', { h: 'tall' })}
        ${card('c12', 'ov-rs', 'Récupération & charge', 'Barres de récupération colorées par zone (vert ≥ 67, jaune 34–66, rouge ≤ 33), charge du jour en dessous · Maj + molette pour zoomer', '', { h: 'tall' })}
        <div class="kpis" id="ov-k"></div>
        <section class="card c12"><div class="card-h"><div><h2>À retenir</h2><p class="sub">Calculé sur la période et les filtres actifs · n = taille de l’échantillon</p></div><div class="card-tools"><button type="button" class="link" id="ov-ins-more" hidden>Voir tout</button></div></div><div class="insights" id="ov-ins"></div></section>
        ${card('c12', 'ov-cal', 'Calendrier', '', seg('calMetric', [['score', 'Note'], ['rec', 'Récup'], ['strain', 'Charge'], ['sleepH', 'Sommeil'], ['steps', 'Pas'], ['train', 'Muscu']], S.calMetric), { h: 'short' })}
        ${card('c8', 'ov-weight', 'Poids & projection', '', '', { h: 'tall' })}
        ${card('c4', 'ov-types', 'Activités', 'Temps enregistré par type · clic pour filtrer', '')}`;
    },
    update() {
      const { M, F, S, T } = SD, cfg = M.cfg.targets;
      const cur = SD.scores.periodScores(F.days, ctxFor(F.days, F.len));
      const prevCtx = { len: F.len, strengthDays: F.prevStrengthDays, exercises: F.prevExercises, muscles: F.prevMuscles };
      const prev = F.hasPrev ? SD.scores.periodScores(F.prev, prevCtx) : null;

      // ---- héros
      setHTML('ov-ring', ring({ value: cur.global, max: 100, color: SD.scoreColor(cur.global), text: cur.grade, unit: isNum(cur.global) ? `${nf(cur.global, 0)} / 100` : '', label: 'Période', size: 172, stroke: 11, cls: 'xl' }));
      setText('ov-period', `${fdM(S.from)} → ${fdM(S.to)} · ${F.days.length} jours${prev && isNum(prev.global) ? ` · période précédente ${nf(prev.global, 0)} (${prev.grade})` : ''}`);
      setText('ov-verdict', cur.verdict);
      setText('ov-verdict-sub', isNum(cur.global) && prev && isNum(prev.global) ? `${sgn(cur.global - prev.global, 0)} points par rapport à la période précédente.` : 'Pondération : récupération 20 %, sommeil 20 %, entraînement 20 %, nutrition 15 %, activité 15 %, corps 10 %.');
      setHTML('ov-levers', cur.up.map((l) => `<span class="lever up">Tire vers le haut : <b>${esc(l.label)} ${nf(l.score, 0)}</b></span>`).join('')
        + cur.down.map((l) => `<span class="lever down">Freine : <b>${esc(l.label)} ${nf(l.score, 0)}</b></span>`).join(''));
      setHTML('ov-pillars', SD.scores.PILLARS.map((p) => {
        const v = cur.pillars[p.key], pv = prev ? prev.pillars[p.key] : null;
        const dl = isNum(v) && isNum(pv) ? v - pv : null;
        return `<div class="pillar" data-goto="${PAGE_OF[p.key]}" title="${esc(cur.detail[p.key])}">${ring({ value: v, max: 100, color: SD.pillarColor(p.key), text: isNum(v) ? nf(v, 0) : null, label: p.label, size: 92, stroke: 9, cls: 'sm' })}
          <div class="dl delta ${isNum(dl) ? (dl > 1 ? 'up-good' : dl < -1 ? 'down-bad' : 'flat') : 'flat'}">${isNum(dl) ? sgn(dl, 0) + ' vs préc.' : '&nbsp;'}</div><div class="d">${esc(cur.detail[p.key])}</div></div>`;
      }).join(''));
      document.querySelectorAll('#ov-pillars [data-goto]').forEach((el) => { el.onclick = () => SD.showPage(el.dataset.goto); });

      // ---- radar
      const ind = SD.scores.PILLARS.map((p) => ({ name: p.label, max: 100 }));
      const rv = SD.scores.PILLARS.map((p) => (isNum(cur.pillars[p.key]) ? Math.round(cur.pillars[p.key]) : 0));
      const pvv = prev ? SD.scores.PILLARS.map((p) => (isNum(prev.pillars[p.key]) ? Math.round(prev.pillars[p.key]) : 0)) : null;
      chart('ov-radar', base({
        legend: SD.ui.ecLegend(T, ['Période', 'Période précédente']),
        tooltip: { trigger: 'item', confine: true, backgroundColor: 'rgba(17,22,29,0.97)', borderColor: T.line, textStyle: { color: T.ink }, formatter: (p) => tipBox(p.seriesName || p.name, SD.scores.PILLARS.map((q, i) => ({ color: SD.pillarColor(q.key), value: nf(p.value[i], 0), name: q.label }))) },
        radar: { indicator: ind, radius: '66%', center: ['50%', '56%'], splitNumber: 4, axisName: { color: T.ink2, fontSize: 12, fontFamily: SD.FONT_C, fontWeight: 700 }, splitLine: { lineStyle: { color: T.grid } }, splitArea: { areaStyle: { color: ['transparent'] } }, axisLine: { lineStyle: { color: T.grid } } },
        series: [{ type: 'radar', symbolSize: 5, data: [
          { value: rv, name: 'Période', lineStyle: { color: T.strain, width: 2 }, itemStyle: { color: T.strain }, areaStyle: { color: T.strain, opacity: 0.18 } },
          ...(pvv ? [{ value: pvv, name: 'Période précédente', lineStyle: { color: T.muted, width: 1.5 }, itemStyle: { color: T.muted }, areaStyle: { color: T.muted, opacity: 0.06 } }] : []),
        ] }],
      }), () => ({ cols: ['Pilier', 'Période', 'Précédente'], rows: SD.scores.PILLARS.map((p, i) => [p.label, nf(cur.pillars[p.key], 0), pvv ? nf(prev.pillars[p.key], 0) : '—']) }));

      // ---- bulletin hebdo / mensuel
      const g = F.len > 200 ? 'month' : 'week';
      const keys = SD.bucketKeys(g).slice(-26);
      const rows = SD.scores.PILLARS.map((p) => p.label).concat('Note globale');
      const cells = [];
      keys.forEach((k, i) => {
        const end = SD.bucketEnd(k, g);
        const ds = F.days.filter((x) => x.d >= k && x.d <= end);
        if (ds.length < 3) return;
        const r = SD.scores.periodScores(ds, ctxFor(ds, SD.nDays(k, end)));
        SD.scores.PILLARS.forEach((p, j) => { if (isNum(r.pillars[p.key])) cells.push([i, j, Math.round(r.pillars[p.key])]); });
        if (isNum(r.global)) cells.push([i, rows.length - 1, Math.round(r.global)]);
      });
      setText('ov-card-s', `Chaque case = un score 0–100 par ${g === 'week' ? 'semaine' : 'mois'} · clic pour zoomer sur la ${g === 'week' ? 'semaine' : 'période'}`);
      const cc = chart('ov-card', base({
        grid: { left: 8, right: 10, top: 8, bottom: 44, containLabel: true },
        tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => tipBox(`${rows[p.value[1]]} · ${SD.bucketTitle(keys[p.value[0]], g)}`, [{ color: SD.scoreColor(p.value[2]), box: true, value: `${p.value[2]} / 100`, name: SD.scores.grade(p.value[2]) }], 'Clic pour zoomer') }),
        xAxis: xCat(keys.map((k) => SD.bucketLabel(k, g)), { axisLine: { show: false } }),
        yAxis: xCat(rows, { inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 12 } }),
        visualMap: { min: 30, max: 95, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 10, itemHeight: 140, calculable: false, text: ['95', '30'], textStyle: { color: T.muted, fontSize: 11 }, inRange: { color: [T.crit, T.warn, T.good] } },
        series: [{ type: 'heatmap', data: cells, itemStyle: { borderColor: T.card, borderWidth: 3, borderRadius: 5 }, label: { show: keys.length <= 14, color: '#0a0d11', fontSize: 11, fontWeight: 600 } }],
      }), () => ({ cols: ['Pilier', ...keys.map((k) => SD.bucketLabel(k, g))], rows: rows.map((r, j) => [r, ...keys.map((_, i) => { const c = cells.find((q) => q[0] === i && q[1] === j); return c ? c[2] : '—'; })]) }));
      cc && cc.on('click', (p) => SD.ui.drill(keys[p.value[0]], g));

      // ---- récup & charge
      SD.ui.recStrainChart('ov-rs');

      // ---- KPI
      const wkAgg = (f) => SD.agg(F.days, (x) => x.d, f, 'mean', 'week').map((o) => o.v);
      const tw = F.days.filter((x) => isNum(x.trendW));
      const a = tw[0], b = tw[tw.length - 1];
      const wks = a && b ? (SD.nDays(a.d, b.d) - 1) / 7 : 0;
      const rate = wks >= 1 ? (b.trendW - a.trendW) / wks : null;
      const sess = F.strengthDays.size, pSess = F.prevStrengthDays.size;
      const steps = avgOf(F.full, (x) => x.steps), pSteps = avgOf(F.prevFull, (x) => x.steps);
      const sl = avgOf(F.full, (x) => x.sleepH), pSl = avgOf(F.prevFull, (x) => x.sleepH);
      const rhr = avgOf(F.full, (x) => x.rhr), pRhr = avgOf(F.prevFull, (x) => x.rhr);
      setHTML('ov-k', [
        kpi({ label: 'Poids tendance', value: b ? b.trendW : null, unit: 'kg', digits: 1, delta: a && b && a !== b ? b.trendW - a.trendW : null, deltaFmt: (v) => `${sgn(v, 1)} kg`, deltaLabel: isNum(rate) ? `${sgn(rate, 2)} kg/sem` : '', good: null, spark: wkAgg((x) => x.trendW), color: T.body }),
        kpi({ label: 'Séances de muscu', value: sess, delta: prevDelta(sess, pSess), deltaDigits: 0, good: 'up', ctx: `${nf(sess / (F.len / 7), 1)} / sem · objectif ${cfg.sessionsPerWeek}`, spark: SD.agg(F.days, (x) => x.d, (x) => (F.strengthDays.has(x.d) ? 1 : 0), 'sum', 'week').map((o) => o.v), color: T.strain }),
        kpi({ label: 'Pas par jour', value: steps, delta: prevDelta(steps, pSteps), deltaDigits: 0, good: 'up', meter: isNum(steps) ? (steps / cfg.stepsGoal) * 100 : null, spark: wkAgg((x) => x.steps), color: T.act }),
        kpi({ label: 'Sommeil', value: sl, fmt: fH, delta: isNum(prevDelta(sl, pSl)) ? (sl - pSl) * 60 : null, deltaFmt: (v) => `${sgn(v, 0)} min`, good: 'up', spark: wkAgg((x) => x.sleepH), color: T.sleep }),
        kpi({ label: 'FC au repos', value: rhr, unit: 'bpm', delta: prevDelta(rhr, pRhr), good: 'down', spark: wkAgg((x) => x.rhr), color: T.rec }),
      ].join(''));

      // ---- insights
      const list = SD.insights.render(document.getElementById('ov-ins'), 4);
      const more = document.getElementById('ov-ins-more');
      more.hidden = list.length <= 4;
      more.textContent = `Voir les ${list.length} insights`;
      more.onclick = () => { SD.insights.render(document.getElementById('ov-ins')); more.hidden = true; };

      SD.ui.calendar('ov-cal');
      const proj = SD.ui.weightChart('ov-weight', { projection: true });
      setText('ov-weight-s', proj ? `Pesées, tendance et phases. Projection sur 28 jours : ${sgn(proj.slopeWeek, 2)} kg/sem → ${nf(proj.end.y, 1)} kg le ${fdM(proj.end.d)} (± ${nf((proj.end.hi - proj.end.lo) / 2, 1)} kg)` : 'Pesées (points), poids tendance (ligne) et phases MacroFactor.');
      SD.ui.typesChart('ov-types');
    },
  };

  SD.PAGES.overview = overview;
})();
