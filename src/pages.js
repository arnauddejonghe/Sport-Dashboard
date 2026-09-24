/* Salle des Machines — pages du rapport. Chaque page : html() (squelette, une fois) + update() (à chaque filtre). */
(function () {
  'use strict';
  const SD = window.SD;
  const {
    tms, dstr, addD, nDays, WD, WDL, fdS, fdM, fdL, fdate, isNum, pluck, sum, mean, median, sd, pearson, linreg,
    nf, sgn, fHM, fH, esc, TYPE_ORDER, typeKey, typeColor, STRENGTH, SPLITS, splitColor,
    gran, bucketKeys, bucketOf, bucketEnd, bucketLabel, bucketTitle, granUnit, agg, chart, tipBox, axisTip, base,
    xTime, xCat, yVal, bar, line, series, phaseArea, emptyOpt, kpi, statusPill, METRICS, pairs, rWord, logged,
  } = SD;
  const DAY = SD.DAY;

  // ---------------------------------------------------------------- gabarits
  const seg = (key, opts, cur) =>
    `<div class="seg" data-state="${key}" role="group">${opts.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${String(cur) === String(v)}">${esc(l)}</button>`).join('')}</div>`;
  function card(cls, id, title, sub, tools, opts) {
    opts = opts || {};
    const tbl = opts.table === false ? '' : `<button type="button" class="tbl-toggle" data-tbl="${id}" aria-pressed="false">Tableau</button>`;
    const body = opts.body != null ? opts.body : `<div class="chart ${opts.h || ''}" id="${id}"></div><div class="tbl-view" hidden></div>`;
    return `<section class="card ${cls}"><div class="card-h"><div><h2 id="${id}-t">${title}</h2>${sub != null ? `<p class="sub" id="${id}-s">${sub}</p>` : ''}</div>`
      + `<div class="card-tools" id="${id}-tools">${tools || ''}${tbl}</div></div>${body}${opts.note ? `<p class="note">${opts.note}</p>` : ''}</section>`;
  }
  const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  const setHTML = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  const segSync = () => {
    document.querySelectorAll('.card .seg[data-state]').forEach((g) => {
      const cur = String(SD.S[g.dataset.state]);
      g.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === cur)));
    });
  };
  const legendHTML = (items) => `<div class="legend">${items.map((i) => `<span><i class="${i.line ? 'line' : ''}" style="background:${i.color}"></i>${esc(i.label)}</span>`).join('')}</div>`;
  const ecLegend = (T, data) => ({ show: true, data, top: 0, right: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 8, textStyle: { color: T.ink2, fontSize: 12 }, inactiveColor: T.axis });

  const drill = (k, g) => {
    if (g === 'day') { SD.openDay(k); return; }
    SD.setRange(k, bucketEnd(k, g));
    SD.refresh();
  };
  const unitWeek = (g) => (g === 'week' ? '/ sem' : g === 'month' ? '/ mois' : '/ jour');

  // valeurs de période : moyenne sur les jours complets filtrés
  const avgOf = (arr, f) => mean(pluck(arr, f));
  const prevDelta = (cur, prev) => (SD.F.hasPrev && isNum(cur) && isNum(prev) ? cur - prev : null);

  // ================================================================ VUE D'ENSEMBLE
  const overview = {
    id: 'overview', title: "Vue d'ensemble",
    html() {
      return `<div class="kpis" id="ov-k1"></div><div class="kpis-2" id="ov-k2"></div>
      <section class="card c12"><div class="card-h"><div><h2>À retenir</h2><p class="sub">Calculé sur la période et les filtres actifs · n = taille de l’échantillon</p></div><div class="card-tools"><button type="button" class="link" id="ov-ins-more" hidden>Voir tous les insights</button></div></div><div class="insights" id="ov-ins"></div></section>
      ${card('c12', 'ov-cal', 'Calendrier', '', seg('calMetric', [['actMin', 'Minutes'], ['train', 'Muscu'], ['steps', 'Pas'], ['sleepH', 'Sommeil'], ['rec', 'Récup']], SD.S.calMetric), { h: 'short' })}
      ${card('c8', 'ov-weight', 'Poids & phases', 'Pesées (points) et poids tendance (ligne). Bandes : phases MacroFactor.', '', { h: 'tall' })}
      ${card('c4', 'ov-types', 'Activités', 'Temps enregistré par type · clic pour filtrer', '', { h: 'tall' })}
      ${card('c8', 'ov-sess', 'Séances', '', '')}
      ${card('c4', 'ov-wd', 'Semaine type', 'Part des jours avec séance de muscu · clic pour isoler le jour', '')}`;
    },
    update() {
      const { M, F, S, T } = SD, cfg = M.cfg.targets;
      // ---- KPI
      const tw = F.days.filter((x) => isNum(x.trendW));
      const a = tw[0], b = tw[tw.length - 1];
      const wks = a && b ? (nDays(a.d, b.d) - 1) / 7 : 0;
      const dW = a && b && a !== b ? b.trendW - a.trendW : null;
      const rate = wks >= 1 && isNum(dW) ? dW / wks : null;
      const phase = (M.at(S.to) || {}).phase;
      const rt = phase && cfg.weeklyRate && cfg.weeklyRate[phase];
      const rStatus = rt && isNum(rate) ? (rate < rt[0] ? '<span class="status warn">Sous la cible</span>' : rate > rt[1] ? '<span class="status warn">Au-dessus de la cible</span>' : '<span class="status good">Dans la cible</span>') : '';
      const wkAgg = (f, how) => agg(F.days, (x) => x.d, f, how, 'week').map((o) => o.v);
      const sess = F.strengthDays.size, pSess = F.prevStrengthDays.size, perW = sess / (F.len / 7);
      const steps = avgOf(F.full, (x) => x.steps), pSteps = avgOf(F.prevFull, (x) => x.steps);
      const stepsN = pluck(F.full, (x) => x.steps);
      const floorPct = stepsN.length ? (stepsN.filter((v) => v >= cfg.stepsFloor).length / stepsN.length) * 100 : null;
      const sl = avgOf(F.full, (x) => x.sleepH), pSl = avgOf(F.prevFull, (x) => x.sleepH);
      const slN = pluck(F.full, (x) => x.sleepH);
      const rec = avgOf(F.full, (x) => x.rec), pRec = avgOf(F.prevFull, (x) => x.rec);
      setHTML('ov-k1', [
        kpi({
          hero: true, label: 'Poids tendance', value: b ? b.trendW : null, unit: 'kg', digits: 1, delta: dW, deltaUnit: ' kg', good: null,
          deltaFmt: (v) => `${sgn(v, 1)} kg sur la période`, deltaLabel: '',
          ctx: [isNum(rate) ? `${sgn(rate, 2)} kg/sem` : '', phase ? `Phase ${esc(phase)}${rt ? ` · cible ${sgn(rt[0], 2)} à ${sgn(rt[1], 2)}` : ''}` : '', rStatus].filter(Boolean).join(' · '),
          spark: wkAgg((x) => x.trendW, 'mean'), color: T.s[0],
        }),
        kpi({ label: 'Séances de muscu', value: sess, delta: prevDelta(sess, pSess), deltaDigits: 0, good: 'up', ctx: `${nf(perW, 1)} / sem · objectif ${cfg.sessionsPerWeek}`, spark: wkAgg((x) => (F.strengthDays.has(x.d) ? 1 : 0), 'sum'), color: T.s[0] }),
        kpi({ label: 'Pas par jour', value: steps, delta: prevDelta(steps, pSteps), deltaDigits: 0, good: 'up', ctx: isNum(floorPct) ? `${nf(floorPct, 0)} % des jours ≥ ${nf(cfg.stepsFloor, 0)}` : '', meter: isNum(steps) ? (steps / cfg.stepsGoal) * 100 : null, spark: wkAgg((x) => x.steps, 'mean'), color: T.s[5] }),
        kpi({ label: 'Sommeil', value: sl, fmt: fH, delta: isNum(prevDelta(sl, pSl)) ? (sl - pSl) * 60 : null, deltaFmt: (v) => `${sgn(v, 0)} min`, good: 'up', ctx: slN.length ? `${nf((slN.filter((v) => v >= 7).length / slN.length) * 100, 0)} % des nuits ≥ 7 h` : '', spark: wkAgg((x) => x.sleepH, 'mean'), color: T.s[6] }),
        kpi({ label: 'Score de récupération', value: rec, unit: '/100', delta: prevDelta(rec, pRec), deltaDigits: 0, good: 'up', status: ' ' + statusPill(rec, 70, 50), spark: wkAgg((x) => x.rec, 'mean'), color: T.s[2] }),
      ].join(''));

      const rhr = avgOf(F.full, (x) => x.rhr), pRhr = avgOf(F.prevFull, (x) => x.rhr);
      const hrv = avgOf(F.full, (x) => x.hrv), pHrv = avgOf(F.prevFull, (x) => x.hrv);
      const lg = F.full.filter(logged), plg = F.prevFull.filter(logged);
      const kc = avgOf(lg, (x) => x.kcal), pKc = avgOf(plg, (x) => x.kcal);
      const wT = lg.filter((x) => x.tgt && isNum(x.tgt.kcal));
      const adh = wT.length ? (wT.filter((x) => Math.abs(x.kcal - x.tgt.kcal) <= 0.1 * x.tgt.kcal).length / wT.length) * 100 : null;
      const pk = avgOf(lg, (x) => (isNum(x.prot) && isNum(x.trendW) ? x.prot / x.trendW : null));
      const ppk = avgOf(plg, (x) => (isNum(x.prot) && isNum(x.trendW) ? x.prot / x.trendW : null));
      const dur = median(pluck(F.days.filter((x) => F.strengthDays.has(x.d)), (x) => x.strMin));
      const pDur = median(pluck(F.prev.filter((x) => F.prevStrengthDays.has(x.d)), (x) => x.strMin));
      setHTML('ov-k2', [
        kpi({ label: 'FC repos', value: rhr, unit: 'bpm', delta: prevDelta(rhr, pRhr), good: 'down', spark: wkAgg((x) => x.rhr, 'mean'), color: T.s[7] }),
        kpi({ label: 'HRV (indicative)', value: hrv, unit: 'ms', delta: prevDelta(hrv, pHrv), deltaDigits: 0, good: 'up', spark: wkAgg((x) => x.hrv, 'mean'), color: T.s[2] }),
        kpi({ label: 'Calories ingérées', value: kc, unit: 'kcal', delta: prevDelta(kc, pKc), deltaDigits: 0, good: null, ctx: `${lg.length} j loggés${isNum(adh) ? ` · ${nf(adh, 0)} % à ±10 % de la cible` : ''}`, spark: wkAgg((x) => (logged(x) ? x.kcal : null), 'mean'), color: T.s[1] }),
        kpi({ label: 'Protéines', value: pk, unit: 'g/kg', digits: 2, delta: prevDelta(pk, ppk), deltaDigits: 2, good: 'up', ctx: `Cible ${nf(cfg.proteinPerKg[0], 1)}–${nf(cfg.proteinPerKg[1], 1)} g/kg`, spark: wkAgg((x) => (logged(x) && isNum(x.prot) && isNum(x.trendW) ? x.prot / x.trendW : null), 'mean'), color: T.s[0] }),
        kpi({ label: 'Durée de séance', value: dur, fmt: fHM, delta: prevDelta(dur, pDur), deltaFmt: (v) => `${sgn(v, 0)} min`, good: null, ctx: 'Médiane, musculation', spark: wkAgg((x) => (F.strengthDays.has(x.d) ? x.strMin : null), 'mean'), color: T.s[0] }),
      ].join(''));

      calendar();
      const list = SD.insights.render(document.getElementById('ov-ins'), 4);
      const more = document.getElementById('ov-ins-more');
      more.hidden = list.length <= 4;
      more.textContent = `Voir les ${list.length} insights`;
      more.onclick = () => { SD.insights.render(document.getElementById('ov-ins')); more.hidden = true; };
      weightChart('ov-weight', false);
      typesChart();
      sessionsChart();
      weekdayChart();
    },
  };

  function dayTip(d) {
    const x = SD.M.at(d);
    if (!x) return '';
    const rows = [];
    for (const w of x.w) rows.push({ color: typeColor(w.type), box: true, value: w.min != null ? fHM(w.min) : '—', name: w.type + (x.split && STRENGTH.has(w.type) ? ` · ${x.split}` : '') });
    if (isNum(x.steps)) rows.push({ color: SD.T.s[5], value: nf(x.steps, 0), name: 'pas' });
    if (isNum(x.sleepH)) rows.push({ color: SD.T.s[6], value: fH(x.sleepH), name: 'sommeil' });
    if (isNum(x.rec)) rows.push({ color: SD.T.s[2], value: nf(x.rec, 0) + '/100', name: 'récupération' });
    return tipBox(fdL(d), rows, x.partial ? 'Journée en cours au moment de l’export' : 'Clic pour le détail du jour');
  }

  function calendar() {
    const { F, S, T } = SD;
    const el = document.getElementById('ov-cal');
    const metric = S.calMetric;
    const lab = { actMin: 'Minutes d’activité enregistrées', train: 'Jours avec séance de musculation', steps: 'Pas par jour', sleepH: 'Heures de sommeil', rec: 'Score de récupération' }[metric];
    const val = (x) => (metric === 'train' ? (F.strengthDays.has(x.d) ? 1 : null) : metric === 'actMin' ? (x.actMin || null) : x.partial ? null : x[metric]);
    const fmtV = (v) => (metric === 'actMin' ? fHM(v) : metric === 'sleepH' ? fH(v) : metric === 'rec' ? nf(v, 0) + '/100' : nf(v, 0));
    if (F.len <= 400) {
      const weeks = Math.ceil((F.len + 7) / 7);
      const cs = Math.max(9, Math.min(24, Math.floor((el.clientWidth - 46) / weeks)));
      el.style.height = cs * 7 + 58 + 'px';
      const data = F.days.map((x) => [x.d, val(x)]).filter((p) => isNum(p[1]));
      const vs = data.map((p) => p[1]).sort((p, q) => p - q);
      const lo = metric === 'rec' || metric === 'sleepH' ? vs[Math.floor(vs.length * 0.05)] || 0 : 0;
      const hi = vs.length ? vs[Math.floor(vs.length * 0.95)] || vs[vs.length - 1] : 1;
      setText('ov-cal-s', `${lab} · clic sur un jour pour le détail`);
      const c = chart('ov-cal', base({
        tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => dayTip(p.value[0]) }),
        visualMap: metric === 'train'
          ? { show: false, type: 'piecewise', pieces: [{ value: 1, color: T.s[0] }] }
          : { show: true, min: lo, max: Math.max(hi, lo + 1), calculable: false, orient: 'horizontal', right: 0, top: 0, itemWidth: 10, itemHeight: 110, text: [fmtV(Math.max(hi, lo + 1)), fmtV(lo)], textStyle: { color: T.muted, fontSize: 11 }, inRange: { color: [T.seq[1], T.seq[2], T.seq[3], T.seq[4], T.seq[5]] } },
        calendar: {
          range: [S.from, S.to], top: 36, left: 30, right: 4, cellSize: [cs, cs], splitLine: { show: false },
          itemStyle: { color: T.surface2, borderColor: T.surface, borderWidth: 2 }, yearLabel: { show: false },
          monthLabel: { nameMap: ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'], color: T.muted, fontSize: 11 },
          dayLabel: { firstDay: 1, nameMap: ['D', 'L', 'M', 'M', 'J', 'V', 'S'], color: T.muted, fontSize: 10 },
        },
        series: [{ type: 'heatmap', coordinateSystem: 'calendar', data, emphasis: { itemStyle: { borderColor: T.ink, borderWidth: 1 } } }],
      }), () => ({ cols: ['Date', lab], rows: data.map((p) => [fdM(p[0]), metric === 'train' ? 'Séance' : fmtV(p[1])]) }));
      c && c.on('click', (p) => SD.openDay(p.value[0]));
    } else {
      // Vue longue : mois × années
      const years = [];
      for (let y = +S.from.slice(0, 4); y <= +S.to.slice(0, 4); y++) years.push(String(y));
      el.style.height = years.length * 30 + 70 + 'px';
      const m = new Map();
      for (const x of F.days) {
        const k = x.d.slice(0, 7);
        const o = m.get(k) || m.set(k, []).get(k);
        const v = val(x);
        if (isNum(v)) o.push(v);
      }
      const how = metric === 'actMin' || metric === 'train' ? 'sum' : 'mean';
      const data = [];
      for (const [k, arr] of m) {
        if (!arr.length) continue;
        const v = how === 'sum' ? sum(arr) : mean(arr);
        data.push([+k.slice(5, 7) - 1, years.indexOf(k.slice(0, 4)), metric === 'actMin' ? v / 60 : v]);
      }
      const vs = data.map((p) => p[2]);
      const fm = (v) => (metric === 'actMin' ? nf(v, 0) + ' h' : metric === 'train' ? nf(v, 0) + ' séances' : metric === 'sleepH' ? fH(v) : nf(v, 0));
      setText('ov-cal-s', `${lab} (${how === 'sum' ? 'total' : 'moyenne'} par mois) · clic sur un mois pour zoomer`);
      const c = chart('ov-cal', base({
        grid: { left: 6, right: 8, top: 34, bottom: 4, containLabel: true },
        tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => tipBox(fdate(`${years[p.value[1]]}-${String(p.value[0] + 1).padStart(2, '0')}-01`, { month: 'long', year: 'numeric' }), [{ color: T.s[0], box: true, value: fm(p.value[2]), name: lab.toLowerCase() }], 'Clic pour zoomer sur ce mois') }),
        xAxis: xCat(['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'], { axisLine: { show: false } }),
        yAxis: xCat(years, { axisLine: { show: false } }),
        visualMap: { show: true, min: Math.min(...vs, 0), max: Math.max(...vs, 1), orient: 'horizontal', right: 0, top: 0, itemWidth: 10, itemHeight: 110, calculable: false, text: [fm(Math.max(...vs, 1)), fm(Math.min(...vs, 0))], textStyle: { color: T.muted, fontSize: 11 }, inRange: { color: [T.seq[1], T.seq[2], T.seq[3], T.seq[4], T.seq[5]] } },
        series: [{ type: 'heatmap', data, itemStyle: { borderColor: T.surface, borderWidth: 2, borderRadius: 3 }, emphasis: { itemStyle: { borderColor: T.ink, borderWidth: 1 } } }],
      }), () => ({ cols: ['Mois', lab], rows: data.map((p) => [`${String(p[0] + 1).padStart(2, '0')}/${years[p[1]]}`, fm(p[2])]) }));
      c && c.on('click', (p) => {
        const k = `${years[p.value[1]]}-${String(p.value[0] + 1).padStart(2, '0')}-01`;
        SD.setRange(k, bucketEnd(k, 'month'));
        SD.refresh();
      });
    }
    if (SD.charts.get('ov-cal')) SD.charts.get('ov-cal').resize();
  }

  function weightChart(id, zoom) {
    const { F, T } = SD;
    const pts = F.days.filter((x) => isNum(x.weight));
    const tr = series(F.days, (x) => x.trendW, 21);
    if (!pts.length && !tr.length) { chart(id, base(emptyOpt('Aucune pesée sur la période'))); return; }
    chart(id, base({
      grid: { left: 6, right: 14, top: 30, bottom: zoom ? 34 : 6, containLabel: true },
      legend: ecLegend(T, ['Pesée', 'Poids tendance']),
      tooltip: Object.assign(base().tooltip, { formatter: axisTip({ 'Pesée': (v) => nf(v, 2) + ' kg', 'Poids tendance': (v) => nf(v, 2) + ' kg' }) }),
      xAxis: xTime(),
      yAxis: yVal({ scale: true, name: 'kg', axisLabel: { color: T.muted, formatter: (v) => nf(v, 0) } }),
      dataZoom: zoom ? [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 6, borderColor: 'transparent', backgroundColor: T.surface2, fillerColor: 'rgba(42,120,214,0.14)', handleStyle: { color: T.surface, borderColor: T.axis }, moveHandleSize: 0, textStyle: { color: T.muted }, labelFormatter: (v) => fdS(dstr(v)), dataBackground: { lineStyle: { color: T.axis }, areaStyle: { color: T.grid } }, selectedDataBackground: { lineStyle: { color: T.s[0] }, areaStyle: { color: T.seq[1] } } }] : undefined,
      series: [
        { name: 'Pesée', type: 'scatter', data: pts.map((x) => [tms(x.d), x.weight]), symbolSize: 6, itemStyle: { color: T.s[0], opacity: 0.35 }, emphasis: { scale: 1.4 } },
        line('Poids tendance', tr, T.s[0], { markArea: phaseArea(), z: 3 }),
      ],
    }), () => ({ cols: ['Date', 'Pesée (kg)', 'Tendance (kg)'], rows: F.days.filter((x) => isNum(x.weight) || isNum(x.trendW)).map((x) => [fdM(x.d), nf(x.weight, 2), nf(x.trendW, 2)]) }));
  }

  function typesChart() {
    const { F, S, T } = SD;
    const all = [];
    for (const x of F.days) for (const w of x.w) all.push(w);
    const by = TYPE_ORDER.map((t) => {
      const ws = all.filter((w) => typeKey(w.type) === t);
      return { t, n: ws.length, h: sum(pluck(ws, (w) => w.min)) / 60 };
    }).filter((o) => o.n).sort((a, b) => b.h - a.h);
    if (!by.length) { chart('ov-types', base(emptyOpt('Aucune activité enregistrée'))); return; }
    const on = (t) => !S.types || S.types.includes(t);
    const c = chart('ov-types', base({
      grid: { left: 16, right: 50, top: 6, bottom: 6, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => tipBox(p.name, [{ color: typeColor(p.name), box: true, value: nf(p.value, 1) + ' h', name: `${by[p.dataIndex].n} séances` }], 'Clic pour filtrer ce type') }),
      xAxis: yVal({ axisLabel: { show: false }, splitLine: { show: false } }),
      yAxis: xCat(by.map((o) => o.t), { inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 12.5 } }),
      series: [{
        type: 'bar', barMaxWidth: 18, data: by.map((o) => ({ value: o.h, itemStyle: { color: typeColor(o.t), borderRadius: [0, 4, 4, 0], opacity: on(o.t) ? 1 : 0.28 } })),
        label: { show: true, position: 'right', color: T.ink2, formatter: (p) => nf(p.value, p.value < 10 ? 1 : 0) + ' h' },
      }],
    }), () => ({ cols: ['Activité', 'Heures', 'Séances'], rows: by.map((o) => [o.t, nf(o.h, 1), o.n]) }));
    c && c.on('click', (p) => {
      const t = by[p.dataIndex].t;
      if (!S.types) S.types = [t];
      else if (S.types.includes(t)) S.types = S.types.length === 1 ? null : S.types.filter((x) => x !== t);
      else S.types = S.types.concat(t);
      SD.refresh();
    });
  }

  function sessionsChart() {
    const { M, F, S, T } = SD, g = gran(), keys = bucketKeys(g);
    const b = bucketOf(g);
    const str = new Map(keys.map((k) => [k, 0])), oth = new Map(keys.map((k) => [k, 0]));
    for (const d of F.strengthDays) if (str.has(b(d))) str.set(b(d), str.get(b(d)) + 1);
    for (const w of F.workouts) if (!STRENGTH.has(w.type) && oth.has(b(w.d))) oth.set(b(w.d), oth.get(b(w.d)) + 1);
    const tgt = g === 'week' ? M.cfg.targets.sessionsPerWeek : g === 'month' ? Math.round(M.cfg.targets.sessionsPerWeek * 4.35) : null;
    setText('ov-sess-t', `Séances par ${granUnit(g)}`);
    setText('ov-sess-s', `Musculation et autres activités${tgt ? ` · objectif ${tgt} séances de muscu ${unitWeek(g)}` : ''} · clic pour zoomer`);
    const c = chart('ov-sess', base({
      grid: { left: 6, right: 14, top: 30, bottom: 6, containLabel: true },
      legend: ecLegend(T, ['Musculation', 'Cardio & autres']),
      tooltip: Object.assign(base().tooltip, { axisPointer: { type: 'shadow' }, formatter: axisTip({ Musculation: (v) => nf(v, 0), 'Cardio & autres': (v) => nf(v, 0) }, (x, p) => bucketTitle(keys[p.dataIndex], g)) }),
      xAxis: xCat(keys.map((k) => bucketLabel(k, g))),
      yAxis: yVal({ minInterval: 1 }),
      series: [
        bar('Musculation', keys.map((k) => str.get(k)), T.s[0], { stack: 's', itemStyle: { color: T.s[0], borderRadius: 0, borderColor: T.surface, borderWidth: 1 }, markLine: tgt ? { silent: true, symbol: 'none', lineStyle: { color: T.ink2, type: 'solid', width: 1 }, label: { formatter: 'Objectif', color: T.ink2, position: 'insideEndTop', fontSize: 11 }, data: [{ yAxis: tgt }] } : undefined }),
        bar('Cardio & autres', keys.map((k) => oth.get(k)), T.other, { stack: 's', itemStyle: { color: T.other, borderRadius: [4, 4, 0, 0], borderColor: T.surface, borderWidth: 1 } }),
      ],
    }), () => ({ cols: ['Période', 'Musculation', 'Cardio & autres'], rows: keys.map((k) => [bucketTitle(k, g), str.get(k), oth.get(k)]) }));
    c && c.on('click', (p) => drill(keys[p.dataIndex], g));
  }

  function weekdayChart() {
    const { M, S, T } = SD;
    const i0 = M.idx.get(S.from), i1 = M.idx.get(S.to);
    const rng = M.days.slice(i0, i1 + 1);
    const rates = WD.map((_, w) => { const ds = rng.filter((x) => x.wd === w); return { n: ds.length, r: ds.length ? (ds.filter((x) => x.train).length / ds.length) * 100 : null }; });
    const on = new Set(S.wds);
    const c = chart('ov-wd', base({
      grid: { left: 6, right: 8, top: 22, bottom: 6, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => tipBox(WDL[p.dataIndex], [{ color: T.s[0], box: true, value: nf(p.value, 0) + ' %', name: `des ${WDL[p.dataIndex]}s avec muscu (${rates[p.dataIndex].n} j)` }], on.size === 1 && on.has(p.dataIndex) ? 'Clic pour revenir à tous les jours' : 'Clic pour isoler ce jour') }),
      xAxis: xCat(WD),
      yAxis: yVal({ max: 100, axisLabel: { color: T.muted, formatter: '{value} %' } }),
      series: [bar('Taux', rates.map((o, w) => ({ value: o.r, itemStyle: { color: T.s[0], borderRadius: [4, 4, 0, 0], opacity: on.has(w) ? 1 : 0.28 } })), T.s[0], {
        label: { show: true, position: 'top', color: T.ink2, fontSize: 11, formatter: (p) => nf(p.value, 0) + ' %' },
      })],
    }), () => ({ cols: ['Jour', '% avec muscu', 'Jours'], rows: rates.map((o, w) => [WDL[w], nf(o.r, 0), o.n]) }));
    c && c.on('click', (p) => {
      S.wds = on.size === 1 && on.has(p.dataIndex) ? [0, 1, 2, 3, 4, 5, 6] : [p.dataIndex];
      SD.refresh();
    });
  }

  // ================================================================ ENTRAÎNEMENT
  const training = {
    id: 'training', title: 'Entraînement',
    html() {
      return `<div class="kpis-2" id="tr-k"></div>
      ${card('c12', 'tr-vol', 'Volume d’activité', '', '', { h: 'tall' })}
      ${card('c6', 'tr-dur', 'Durée des séances de musculation', 'Chaque point = une séance · ligne = médiane glissante sur 7 séances')}
      ${card('c6', 'tr-split', 'Split détecté', 'Déduit des groupes musculaires travaillés (MacroFactor) ou des noms d’exercices')}
      ${card('c6', 'tr-splitwd', 'Quel split, quel jour', 'Nombre de séances par jour de semaine et par split')}
      ${card('c6', 'tr-hour', 'Heure de début', 'Séances enregistrées dans TrainAI (févr. 2024 → avr. 2025)')}
      ${card('c12', 'tr-log', 'Journal des séances', 'Clic sur une ligne pour le détail du jour', '', { table: false, body: '<div class="tbl-wrap tbl-scroll" id="tr-log-b"></div>' })}`;
    },
    update() {
      const { M, F, S, T } = SD, cfg = M.cfg.targets;
      const sess = F.strengthDays.size, pSess = F.prevStrengthDays.size;
      const durs = pluck(F.days.filter((x) => F.strengthDays.has(x.d)), (x) => x.strMin);
      const pDurs = pluck(F.prev.filter((x) => F.prevStrengthDays.has(x.d)), (x) => x.strMin);
      // semaines entières
      let k = SD.wdOf(S.from) === 0 ? S.from : addD(SD.weekOf(S.from), 7);
      const counts = [];
      while (addD(k, 6) <= S.to) { let c = 0; for (let i = 0; i < 7; i++) if (F.strengthDays.has(addD(k, i))) c++; counts.push(c); k = addD(k, 7); }
      const hit = counts.filter((c) => c >= cfg.sessionsPerWeek).length;
      let best = 0, cur = 0;
      for (const c of counts) { cur = c >= cfg.sessionsPerWeek ? cur + 1 : 0; best = Math.max(best, cur); }
      const cardio = sum(pluck(F.workouts.filter((w) => !STRENGTH.has(w.type)), (w) => w.min)) / (F.len / 7);
      const pCardio = sum(pluck(F.prevWorkouts.filter((w) => !STRENGTH.has(w.type)), (w) => w.min)) / (F.len / 7);
      setHTML('tr-k', [
        kpi({ label: 'Séances de muscu', value: sess, delta: prevDelta(sess, pSess), deltaDigits: 0, good: 'up', ctx: `${nf(sess / (F.len / 7), 1)} par semaine` }),
        kpi({ label: 'Durée médiane', value: median(durs), fmt: fHM, delta: prevDelta(median(durs), median(pDurs)), deltaFmt: (v) => `${sgn(v, 0)} min`, good: null, ctx: `${durs.length} séances chronométrées` }),
        kpi({ label: 'Semaines à l’objectif', value: counts.length ? (hit / counts.length) * 100 : null, unit: '%', ctx: `${hit} / ${counts.length} semaines ≥ ${cfg.sessionsPerWeek} séances`, meter: counts.length ? (hit / counts.length) * 100 : null }),
        kpi({ label: 'Meilleure série', value: counts.length ? best : null, unit: best > 1 ? 'semaines' : 'semaine', ctx: `Semaines consécutives ≥ ${cfg.sessionsPerWeek} séances` }),
        kpi({ label: 'Cardio & activités', value: cardio, fmt: fHM, delta: prevDelta(cardio, pCardio), deltaFmt: (v) => `${sgn(v, 0)} min`, good: 'up', ctx: 'Par semaine, hors musculation' }),
      ].join(''));

      // Volume par type
      const g = gran(), keys = bucketKeys(g), b = bucketOf(g);
      const types = TYPE_ORDER.filter((t) => F.workouts.some((w) => typeKey(w.type) === t));
      const mat = new Map(types.map((t) => [t, new Map(keys.map((kk) => [kk, 0]))]));
      for (const w of F.workouts) { const m = mat.get(typeKey(w.type)); const kk = b(w.d); if (m && m.has(kk) && isNum(w.min)) m.set(kk, m.get(kk) + w.min / 60); }
      setText('tr-vol-s', `Heures enregistrées par ${granUnit(g)} et par type · clic sur une barre pour zoomer`);
      const vc = chart('tr-vol', types.length ? base({
        grid: { left: 6, right: 14, top: 32, bottom: 6, containLabel: true },
        legend: ecLegend(T, types),
        tooltip: Object.assign(base().tooltip, { axisPointer: { type: 'shadow' }, formatter: axisTip(Object.fromEntries(types.map((t) => [t, (v) => fHM(v * 60)])), (x, p) => bucketTitle(keys[p.dataIndex], g)) }),
        xAxis: xCat(keys.map((kk) => bucketLabel(kk, g))),
        yAxis: yVal({ name: 'h' }),
        series: types.map((t, i) => bar(t, keys.map((kk) => +mat.get(t).get(kk).toFixed(2)), typeColor(t), { stack: 'v', itemStyle: { color: typeColor(t), borderColor: T.surface, borderWidth: 1, borderRadius: i === types.length - 1 ? [4, 4, 0, 0] : 0 } })),
      }) : base(emptyOpt()), () => ({ cols: ['Période', ...types.map((t) => t + ' (h)')], rows: keys.map((kk) => [bucketTitle(kk, g), ...types.map((t) => nf(mat.get(t).get(kk), 1))]) }));
      vc && vc.on('click', (p) => drill(keys[p.dataIndex], g));

      // Durées
      const sd = F.days.filter((x) => F.strengthDays.has(x.d) && isNum(x.strMin));
      const med = sd.map((x, i) => [tms(x.d), median(sd.slice(Math.max(0, i - 6), i + 1).map((y) => y.strMin))]);
      const dc = chart('tr-dur', sd.length ? base({
        grid: { left: 6, right: 14, top: 30, bottom: 6, containLabel: true },
        legend: ecLegend(T, ['Séance', 'Médiane 7 séances']),
        tooltip: Object.assign(base().tooltip, { formatter: axisTip({ 'Séance': fHM, 'Médiane 7 séances': fHM }) }),
        xAxis: xTime(), yAxis: yVal({ name: 'min' }),
        series: [
          { name: 'Séance', type: 'scatter', data: sd.map((x) => [tms(x.d), x.strMin]), symbolSize: 8, itemStyle: { color: T.s[0], opacity: 0.55, borderColor: T.surface, borderWidth: 1 } },
          line('Médiane 7 séances', med, T.ink2),
        ],
      }) : base(emptyOpt('Aucune séance chronométrée')), () => ({ cols: ['Date', 'Durée', 'Split'], rows: sd.map((x) => [fdM(x.d), fHM(x.strMin), x.split || '—']) }));
      dc && dc.on('click', (p) => p.seriesName === 'Séance' && SD.openDay(dstr(p.value[0])));

      // Splits
      const sdays = F.days.filter((x) => F.strengthDays.has(x.d));
      const sc = SPLITS.map((s) => ({ s, n: sdays.filter((x) => x.split === s).length })).filter((o) => o.n);
      chart('tr-split', sc.length ? base({
        grid: { left: 16, right: 44, top: 6, bottom: 6, containLabel: true },
        tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => tipBox(p.name, [{ color: splitColor(p.name), box: true, value: p.value, name: `séances (${nf((p.value / sdays.length) * 100, 0)} %)` }]) }),
        xAxis: yVal({ axisLabel: { show: false }, splitLine: { show: false } }),
        yAxis: xCat(sc.map((o) => o.s), { inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 12.5 } }),
        series: [{ type: 'bar', barMaxWidth: 18, data: sc.map((o) => ({ value: o.n, itemStyle: { color: splitColor(o.s), borderRadius: [0, 4, 4, 0] } })), label: { show: true, position: 'right', color: T.ink2 } }],
      }) : base(emptyOpt('Aucune séance de musculation')), () => ({ cols: ['Split', 'Séances'], rows: sc.map((o) => [o.s, o.n]) }));

      const present = SPLITS.filter((s) => sdays.some((x) => x.split === s));
      chart('tr-splitwd', present.length ? base({
        grid: { left: 6, right: 8, top: 32, bottom: 6, containLabel: true },
        legend: ecLegend(T, present),
        tooltip: Object.assign(base().tooltip, { axisPointer: { type: 'shadow' }, formatter: axisTip(Object.fromEntries(present.map((s) => [s, (v) => nf(v, 0)])), (x, p) => WDL[p.dataIndex]) }),
        xAxis: xCat(WD), yAxis: yVal({ minInterval: 1 }),
        series: present.map((s, i) => bar(s, WD.map((_, w) => sdays.filter((x) => x.wd === w && x.split === s).length), splitColor(s), { stack: 'w', itemStyle: { color: splitColor(s), borderColor: T.surface, borderWidth: 1, borderRadius: i === present.length - 1 ? [4, 4, 0, 0] : 0 } })),
      }) : base(emptyOpt('Aucune séance de musculation')), () => ({ cols: ['Jour', ...present], rows: WD.map((_, w) => [WDL[w], ...present.map((s) => sdays.filter((x) => x.wd === w && x.split === s).length)]) }));

      // Heure de début
      const st = M.raw.sessionStarts.filter((s) => F.dates.has(s.d));
      const hours = [];
      for (let h = 5; h <= 23; h++) hours.push(h);
      chart('tr-hour', st.length ? base({
        grid: { left: 6, right: 8, top: 16, bottom: 6, containLabel: true },
        tooltip: Object.assign(base().tooltip, { axisPointer: { type: 'shadow' }, formatter: axisTip({ 'Séances': (v) => nf(v, 0) }, (x) => `Début entre ${x} h et ${+x + 1} h`) }),
        xAxis: xCat(hours.map(String), { axisLabel: { color: T.muted, formatter: '{value} h' } }), yAxis: yVal({ minInterval: 1 }),
        series: [bar('Séances', hours.map((h) => st.filter((s) => s.h === h).length), T.s[0])],
      }) : base(emptyOpt('Pas d’heure de début sur cette période (disponible pour TrainAI uniquement)')), () => ({ cols: ['Heure', 'Séances'], rows: hours.map((h) => [h + ' h', st.filter((s) => s.h === h).length]) }));

      // Journal
      const rows = F.days.filter((x) => x.w.length).slice().reverse().slice(0, 250);
      setHTML('tr-log-b', rows.length ? `<table class="t"><thead><tr><th>Date</th><th>Activités</th><th>Split</th><th class="num">Durée muscu</th><th class="num">Exercices</th><th class="num">Séries</th><th class="num">Volume</th><th>Notes</th></tr></thead><tbody>${rows.map((x) => {
        const vol = sum(pluck(x.ex, (e) => e.vol)), sets = sum(pluck(x.ex, (e) => e.sets));
        const notes = M.raw.notes.filter((n) => n.d === x.d);
        return `<tr class="clickable" data-day="${x.d}"><td>${esc(fdate(x.d, { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' }))}</td><td>${esc(x.w.map((w) => w.type).join(', '))}</td><td>${esc(x.split || '')}</td><td class="num">${esc(x.train ? fHM(x.strMin) : '')}</td><td class="num">${x.ex.length || ''}</td><td class="num">${sets || ''}</td><td class="num">${vol ? nf(vol, 0) + ' kg' : ''}</td><td>${notes.length ? `${notes.length} note${notes.length > 1 ? 's' : ''}` : ''}</td></tr>`;
      }).join('')}</tbody></table>` : '<div class="empty">Aucune séance sur la période.</div>');
    },
  };

  // ================================================================ FORCE
  const EX_METRICS = [['e1', 'e1RM', 'kg', 1], ['hw', 'Charge max', 'kg', 1], ['vol', 'Volume', 'kg', 0], ['sets', 'Séries', '', 0], ['br', 'Reps max', '', 0]];
  const exMeta = (k) => EX_METRICS.find((m) => m[0] === k) || EX_METRICS[0];
  const srcLabel = (s) => (s === 'MF' ? 'MacroFactor' : 'TrainAI');
  let exSort = { k: 'count', dir: -1 };

  function exRows(key) {
    const [n, s] = key.split('|');
    return SD.F.exercises.filter((e) => e.n === n && e.s === s).sort((a, b) => a.d.localeCompare(b.d));
  }
  function exSummary() {
    const map = new Map();
    for (const e of SD.F.exercises) {
      const k = e.n + '|' + e.s;
      (map.get(k) || map.set(k, []).get(k)).push(e);
    }
    const out = [];
    for (const [k, arr] of map) {
      arr.sort((a, b) => a.d.localeCompare(b.d));
      const e1 = arr.filter((e) => isNum(e.e1));
      const first = e1[0], last = e1[e1.length - 1];
      const best = e1.reduce((m, e) => (!m || e.e1 > m.e1 ? e : m), null);
      out.push({
        key: k, n: arr[0].n, s: arr[0].s, count: arr.length, first: first ? first.e1 : null, last: last ? last.e1 : null,
        pct: first && last && e1.length >= 2 ? ((last.e1 - first.e1) / first.e1) * 100 : null, best: best ? best.e1 : null, bestD: best ? best.d : null,
        lastD: arr[arr.length - 1].d, spark: e1.map((e) => e.e1),
      });
    }
    return out;
  }
  function pickDefaultEx(sumy) {
    const { M, S } = SD;
    if (S.ex && sumy.some((o) => o.key === S.ex)) return S.ex;
    for (const n of M.cfg.keyExercises || []) { const o = sumy.find((x) => x.n === n); if (o) return o.key; }
    const top = sumy.slice().sort((a, b) => b.count - a.count)[0];
    return top ? top.key : S.ex;
  }

  const strength = {
    id: 'strength', title: 'Force',
    html() {
      const S = SD.S;
      return `${card('c12', 'st-mult', 'Exercices clés', 'e1RM estimé sur la période · clic pour afficher la progression', '', { table: false, body: '<div class="multiples" id="st-mult-b"></div>' })}
      ${card('c8', 'st-prog', 'Progression', '', `<select class="fselect" id="st-ex" data-state="ex" aria-label="Exercice"></select>${seg('exMetric', EX_METRICS.map((m) => [m[0], m[1]]), S.exMetric)}`, { h: 'tall' })}
      <section class="card c4"><div class="card-h"><div><h2 id="st-card-t">Fiche exercice</h2><p class="sub" id="st-card-s"></p></div></div><div id="st-card-b"></div></section>
      ${card('c7', 'st-idx', 'Indice de force', 'e1RM de chaque exercice rapporté à ses 2 premières séances de la période (base 100), moyenne hebdomadaire')}
      ${card('c5', 'st-mus', 'Séries par muscle et par semaine', 'Groupes musculaires MacroFactor (séries fractionnées incluses) · bande = fourchette cible', '', { h: 'tall' })}
      ${card('c12', 'st-heat', 'Carte de chaleur des muscles', 'Séries par semaine et par groupe musculaire')}
      ${card('c12', 'st-tbl', 'Tous les exercices', 'Clic sur une ligne pour afficher la progression · clic sur un en-tête pour trier', '', { table: false, body: '<div class="tbl-wrap tbl-scroll" id="st-tbl-b"></div>' })}`;
    },
    update() {
      const { M, F, S, T } = SD, cfg = M.cfg.targets;
      const sumy = exSummary();
      S.ex = pickDefaultEx(sumy);

      // Small multiples
      let keys = [];
      for (const n of M.cfg.keyExercises || []) { const o = sumy.find((x) => x.n === n); if (o) keys.push(o); }
      if (keys.length < 4) for (const o of sumy.slice().sort((a, b) => b.count - a.count)) { if (keys.length >= 8) break; if (!keys.includes(o) && o.count >= 3) keys.push(o); }
      keys = keys.slice(0, 8);
      setHTML('st-mult-b', keys.length ? keys.map((o) => `<button type="button" class="mult" data-ex="${esc(o.key)}" aria-pressed="${o.key === S.ex}"><span class="n" title="${esc(o.n)}">${esc(o.n)}</span><span class="v">${nf(o.last, 1)} kg</span><span class="n">${isNum(o.pct) ? `<span class="delta ${o.pct > 0.5 ? 'up-good' : o.pct < -0.5 ? 'down-bad' : 'flat'}">${sgn(o.pct, 1)} %</span> · ` : ''}${o.count} séances</span>${SD.spark(o.spark, T.s[0])}</button>`).join('') : '<div class="empty">Aucun exercice détaillé sur la période. Les données par exercice couvrent févr. 2024 → avr. 2025 (TrainAI) et janv. 2026 → aujourd’hui (MacroFactor).</div>');
      document.querySelectorAll('#st-mult-b .mult').forEach((btn) => { btn.onclick = () => { S.ex = btn.dataset.ex; SD.refresh(); }; });
      document.querySelectorAll('#st-mult-b .spark, #st-mult-b .mult > div').forEach((d) => { d.style.height = '38px'; });

      // Sélecteur
      const sel = document.getElementById('st-ex');
      const bySrc = (s) => sumy.filter((o) => o.s === s).sort((a, b) => b.count - a.count || a.n.localeCompare(b.n));
      sel.innerHTML = ['MF', 'TA'].map((s) => { const l = bySrc(s); return l.length ? `<optgroup label="${srcLabel(s)}">${l.map((o) => `<option value="${esc(o.key)}"${o.key === S.ex ? ' selected' : ''}>${esc(o.n)} (${o.count})</option>`).join('')}</optgroup>` : ''; }).join('');
      if (!sumy.length) sel.innerHTML = '<option>Aucun exercice</option>';

      // Progression
      const [mk, ml, mu, md] = exMeta(S.exMetric);
      const rows = S.ex ? exRows(S.ex) : [];
      const pts = rows.filter((e) => isNum(e[mk])).map((e) => [tms(e.d), e[mk]]);
      const exName = S.ex ? S.ex.split('|')[0] : '';
      setText('st-prog-t', exName ? `Progression · ${exName}` : 'Progression');
      let slopeTxt = '';
      const opt = pts.length ? (() => {
        const best = pts.reduce((m, p) => (p[1] > m[1] ? p : m), pts[0]);
        const series = [line(ml, pts, T.s[0], { showSymbol: true, symbolSize: 8, markPoint: { symbol: 'pin', symbolSize: 34, itemStyle: { color: T.s[0] }, label: { color: '#fff', fontSize: 10, formatter: 'PR' }, data: [{ coord: best, value: best[1] }] } })];
        if (pts.length >= 3) {
          const xs = pts.map((p) => (p[0] - pts[0][0]) / DAY), ys = pts.map((p) => p[1]);
          const { a, b } = linreg(xs, ys);
          series.push(line('Tendance linéaire', [[pts[0][0], a], [pts[pts.length - 1][0], a + b * xs[xs.length - 1]]], T.ink2, { lineStyle: { width: 1, color: T.ink2 }, itemStyle: { color: T.ink2 }, tooltip: { show: false } }));
          slopeTxt = ` · tendance ${sgn(b * 30, md || 1)}${mu ? ' ' + mu : ''} par mois`;
        }
        return base({
          grid: { left: 6, right: 16, top: 30, bottom: 6, containLabel: true },
          legend: ecLegend(T, [ml, 'Tendance linéaire']),
          tooltip: Object.assign(base().tooltip, {
            formatter: (ps) => {
              const p = ps.find((q) => q.seriesName === ml);
              if (!p) return '';
              const e = rows.find((r) => tms(r.d) === p.value[0]);
              const r = [];
              for (const [k2, l2, u2, d2] of EX_METRICS) if (e && isNum(e[k2])) r.push({ color: k2 === mk ? T.s[0] : T.axis, value: nf(e[k2], d2) + (u2 ? ' ' + u2 : ''), name: l2 });
              return tipBox(fdL(dstr(p.value[0])), r, srcLabel(e ? e.s : 'MF') === 'TrainAI' ? 'e1RM TrainAI : formule d’Epley sur la meilleure série' : 'e1RM calculé par MacroFactor');
            },
          }),
          xAxis: xTime(), yAxis: yVal({ scale: true, name: mu }),
          series,
        });
      })() : base(emptyOpt('Pas de donnée pour cet exercice sur la période'));
      setText('st-prog-s', `${ml}${mu ? ' (' + mu + ')' : ''} par séance · ${srcLabel((S.ex || '|MF').split('|')[1])}${slopeTxt}`);
      const pc = chart('st-prog', opt, () => ({ cols: ['Date', ...EX_METRICS.map((m) => m[1])], rows: rows.map((e) => [fdM(e.d), ...EX_METRICS.map((m) => nf(e[m[0]], m[3]))]) }));
      pc && pc.on('click', (p) => p.value && SD.openDay(dstr(p.value[0])));

      // Fiche
      const o = sumy.find((x) => x.key === S.ex);
      const notes = M.raw.notes.filter((nn) => nn.ex && exName && nn.ex.toLowerCase() === exName.toLowerCase());
      setText('st-card-t', exName || 'Fiche exercice');
      setText('st-card-s', o ? `${srcLabel(o.s)} · ${o.count} séances sur la période` : '');
      setHTML('st-card-b', o ? `<div class="dgrid">
        <div class="dstat"><div class="l">Meilleur e1RM</div><div class="v">${nf(o.best, 1)} kg</div><div class="l">${o.bestD ? esc(fdM(o.bestD)) : ''}</div></div>
        <div class="dstat"><div class="l">Dernier e1RM</div><div class="v">${nf(o.last, 1)} kg</div><div class="l">${esc(fdM(o.lastD))}</div></div>
        <div class="dstat"><div class="l">Évolution période</div><div class="v"><span class="delta ${isNum(o.pct) ? (o.pct > 0.5 ? 'up-good' : o.pct < -0.5 ? 'down-bad' : 'flat') : 'flat'}">${isNum(o.pct) ? sgn(o.pct, 1) + ' %' : '—'}</span></div><div class="l">1re → dernière séance</div></div>
        <div class="dstat"><div class="l">Charge max</div><div class="v">${nf(Math.max(...pluck(rows, (e) => e.hw), -Infinity) > -Infinity ? Math.max(...pluck(rows, (e) => e.hw)) : null, 1)} kg</div><div class="l">sur la période</div></div>
        <div class="dstat"><div class="l">Séries / séance</div><div class="v">${nf(mean(pluck(rows, (e) => e.sets)), 1)}</div><div class="l">moyenne</div></div>
        <div class="dstat"><div class="l">Volume / séance</div><div class="v">${nf(mean(pluck(rows, (e) => e.vol)), 0)} kg</div><div class="l">moyenne</div></div>
      </div><h3 style="margin:16px 0 6px;font:600 12.5px/1 var(--font-cond);letter-spacing:.09em;text-transform:uppercase;color:var(--muted)">Notes de séance (${notes.length})</h3>${notes.length ? `<ul style="margin:0;padding-left:18px;font-size:13px;color:var(--ink-2);max-height:190px;overflow:auto">${notes.slice().reverse().map((nn) => `<li><b>${esc(fdS(nn.d))}</b> · ${esc(nn.text)}</li>`).join('')}</ul>` : '<p class="note">Aucune note pour cet exercice.</p>'}` : '<div class="empty">Sélectionne un exercice.</div>');

      // Indice de force
      const byK = new Map();
      for (const e of F.exercises) { if (!isNum(e.e1)) continue; const k = e.n + '|' + e.s; (byK.get(k) || byK.set(k, []).get(k)).push(e); }
      const wkMap = new Map();
      for (const [, arr] of byK) {
        if (arr.length < 3) continue;
        arr.sort((a, b) => a.d.localeCompare(b.d));
        const b0 = mean(arr.slice(0, 2).map((e) => e.e1));
        for (const e of arr) { const w = SD.weekOf(e.d); (wkMap.get(w) || wkMap.set(w, []).get(w)).push((e.e1 / b0) * 100); }
      }
      const idx = [...wkMap.entries()].filter(([, v]) => v.length >= 2).sort((a, b) => a[0].localeCompare(b[0])).map(([w, v]) => [tms(w), mean(v), v.length]);
      chart('st-idx', idx.length >= 2 ? base({
        grid: { left: 6, right: 16, top: 18, bottom: 6, containLabel: true },
        tooltip: Object.assign(base().tooltip, { formatter: (ps) => { const p = ps[0]; const it = idx[p.dataIndex]; return tipBox(`Semaine du ${fdM(dstr(p.value[0]))}`, [{ color: T.s[0], value: nf(p.value[1], 1), name: 'indice' }], `${it ? it[2] : ''} mesures d’exercices cette semaine`); } }),
        xAxis: xTime(), yAxis: yVal({ scale: true }),
        series: [line('Indice', idx.map((p) => [p[0], +p[1].toFixed(1)]), T.s[0], { showSymbol: true, symbolSize: 6, areaStyle: { color: T.s[0], opacity: 0.08 }, markLine: { silent: true, symbol: 'none', lineStyle: { color: T.axis, type: 'solid' }, label: { color: T.muted, formatter: 'base 100', position: 'insideEndTop', fontSize: 11 }, data: [{ yAxis: 100 }] } })],
      }) : base(emptyOpt('Pas assez d’exercices répétés sur la période')), () => ({ cols: ['Semaine', 'Indice', 'Mesures'], rows: idx.map((p) => [fdM(dstr(p[0])), nf(p[1], 1), p[2]]) }));

      // Séries par muscle
      const wks = Math.max(1, F.len / 7);
      const tot = new Map();
      for (const m of F.muscles) tot.set(m.m, (tot.get(m.m) || 0) + (m.sets || 0));
      const mus = [...tot.entries()].map(([m, v]) => ({ m, v: v / wks })).filter((o) => o.v > 0).sort((a, b) => b.v - a.v);
      const [lo, hi] = cfg.setsPerMuscleWeek;
      const musEl = document.getElementById('st-mus');
      if (musEl) musEl.style.height = Math.max(260, mus.length * 22 + 40) + 'px';
      chart('st-mus', mus.length ? base({
        grid: { left: 16, right: 40, top: 6, bottom: 6, containLabel: true },
        tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => tipBox(p.name, [{ color: T.s[0], box: true, value: nf(p.value, 1), name: 'séries / semaine' }], `Cible ${lo}–${hi}`) }),
        xAxis: yVal({ splitLine: { show: false } }),
        yAxis: xCat(mus.map((o) => o.m), { inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 12 } }),
        series: [{
          type: 'bar', barMaxWidth: 14, data: mus.map((o) => ({ value: +o.v.toFixed(1), itemStyle: { color: T.s[0], borderRadius: [0, 4, 4, 0], opacity: o.v < lo ? 0.5 : 1 } })),
          label: { show: true, position: 'right', color: T.ink2, fontSize: 11, formatter: (p) => nf(p.value, 1) },
          markArea: { silent: true, itemStyle: { color: SD.T.phase.hold }, label: { show: true, position: 'insideTop', color: T.muted, fontSize: 10.5, formatter: `cible ${lo}–${hi}` }, data: [[{ xAxis: lo }, { xAxis: hi }]] },
        }],
      }) : base(emptyOpt('Données par muscle : MacroFactor, depuis janv. 2026')), () => ({ cols: ['Muscle', 'Séries / semaine'], rows: mus.map((o) => [o.m, nf(o.v, 1)]) }));
      if (SD.charts.get('st-mus')) SD.charts.get('st-mus').resize();

      // Heatmap muscles × semaines
      const wkeys = bucketKeys('week');
      const mlist = mus.map((o) => o.m);
      const hm = new Map();
      for (const m of F.muscles) { const k = SD.weekOf(m.d) + '|' + m.m; hm.set(k, (hm.get(k) || 0) + (m.sets || 0)); }
      const hdata = [];
      wkeys.forEach((w, i) => mlist.forEach((m, j) => { const v = hm.get(w + '|' + m); if (v) hdata.push([i, j, +v.toFixed(1)]); }));
      const heatEl = document.getElementById('st-heat');
      if (heatEl) heatEl.style.height = Math.max(200, mlist.length * 20 + 70) + 'px';
      const hvals = hdata.map((p) => p[2]);
      chart('st-heat', hdata.length ? base({
        grid: { left: 16, right: 10, top: 34, bottom: 6, containLabel: true },
        tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => tipBox(`${mlist[p.value[1]]} · semaine du ${fdM(wkeys[p.value[0]])}`, [{ color: T.s[0], box: true, value: nf(p.value[2], 1), name: 'séries' }]) }),
        xAxis: xCat(wkeys.map((w) => fdS(w)), { axisLine: { show: false } }),
        yAxis: xCat(mlist, { inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 11.5 } }),
        visualMap: { min: 0, max: Math.max(hi, ...hvals), orient: 'horizontal', right: 0, top: 0, itemWidth: 10, itemHeight: 110, calculable: false, text: [nf(Math.max(hi, ...hvals), 0), '0'], textStyle: { color: T.muted, fontSize: 11 }, inRange: { color: [T.seq[0], T.seq[2], T.seq[3], T.seq[4], T.seq[5]] } },
        series: [{ type: 'heatmap', data: hdata, itemStyle: { borderColor: T.surface, borderWidth: 2, borderRadius: 2 } }],
      }) : base(emptyOpt('Données par muscle : MacroFactor, depuis janv. 2026')), () => ({ cols: ['Muscle', ...wkeys.map((w) => fdS(w))], rows: mlist.map((m) => [m, ...wkeys.map((w) => nf(hm.get(w + '|' + m) || 0, 1))]) }));
      if (SD.charts.get('st-heat')) SD.charts.get('st-heat').resize();

      // Tableau
      const sorted = sumy.slice().sort((a, b) => {
        const va = a[exSort.k], vb = b[exSort.k];
        if (typeof va === 'string') return exSort.dir * va.localeCompare(vb);
        return exSort.dir * ((isNum(va) ? va : -Infinity) - (isNum(vb) ? vb : -Infinity));
      });
      const th = (k, l, num) => `<th class="${num ? 'num' : ''}" data-sort="${k}">${l}${exSort.k === k ? (exSort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
      setHTML('st-tbl-b', sorted.length ? `<table class="t"><thead><tr>${th('n', 'Exercice')}${th('s', 'Source')}${th('count', 'Séances', 1)}${th('first', '1er e1RM', 1)}${th('last', 'Dernier e1RM', 1)}${th('pct', 'Évolution', 1)}${th('best', 'Meilleur', 1)}${th('lastD', 'Dernière séance', 1)}<th>Tendance</th></tr></thead><tbody>${sorted.map((o) =>
        `<tr class="clickable${o.key === S.ex ? ' sel' : ''}" data-ex="${esc(o.key)}"><td>${esc(o.n)}</td><td>${srcLabel(o.s)}</td><td class="num">${o.count}</td><td class="num">${nf(o.first, 1)}</td><td class="num">${nf(o.last, 1)}</td><td class="num"><span class="delta ${isNum(o.pct) ? (o.pct > 0.5 ? 'up-good' : o.pct < -0.5 ? 'down-bad' : 'flat') : 'flat'}">${isNum(o.pct) ? sgn(o.pct, 1) + ' %' : '—'}</span></td><td class="num">${nf(o.best, 1)}</td><td class="num">${esc(fdM(o.lastD))}</td><td><div class="mini-spark">${SD.spark(o.spark, T.s[0])}</div></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Aucun exercice détaillé sur la période.</div>');
      document.querySelectorAll('#st-tbl-b th[data-sort]').forEach((h) => { h.onclick = () => { exSort = { k: h.dataset.sort, dir: exSort.k === h.dataset.sort ? -exSort.dir : -1 }; strength.update(); }; });
      document.querySelectorAll('#st-tbl-b tr[data-ex]').forEach((tr) => { tr.onclick = () => { S.ex = tr.dataset.ex; SD.refresh(); document.getElementById('st-prog').scrollIntoView({ behavior: 'smooth', block: 'center' }); }; });
    },
  };

  // ================================================================ CORPS & NUTRITION
  const body = {
    id: 'body', title: 'Corps & nutrition',
    html() {
      const S = SD.S;
      const pk = SD.partialKcal();
      return `<div class="kpis-2" id="bd-k"></div>
      ${card('c12', 'bd-weight', 'Poids', 'Pesées et poids tendance · molette ou curseur pour zoomer · bandes = phases', '', { h: 'xtall' })}
      ${card('c6', 'bd-fat', 'Masse grasse', '% estimé par la balance / MacroFactor · ligne = moyenne glissante 7 mesures')}
      ${card('c6', 'bd-lean', 'Masse maigre', 'Estimée par la balance connectée (Apple Santé)')}
      ${card('c6', 'bd-meas', 'Mensurations', 'Mesures saisies dans MacroFactor', '<select class="fselect" id="bd-meas-sel" data-state="measure" aria-label="Mesure"></select>', { body: '<div class="chart short" id="bd-meas"></div><div class="tbl-view" hidden></div><div class="tbl-wrap tbl-scroll" id="bd-meas-tbl" style="margin-top:8px;max-height:200px"></div>' })}
      ${card('c6', 'bd-kcal', 'Calories', '', `<label class="fsummary" for="bd-pk">Log partiel &lt; <b id="bd-pk-v">${nf(pk, 0)}</b> kcal</label><input type="range" id="bd-pk" min="0" max="2200" step="100" value="${pk}" style="width:110px" aria-label="Seuil de journée partielle">`)}
      ${card('c6', 'bd-macro', 'Macronutriments', '', seg('macroView', [['g', 'Grammes'], ['pct', '% énergie']], S.macroView))}
      ${card('c6', 'bd-prot', 'Protéines par kilo', 'g de protéines par kg de poids tendance · bande = cible')}
      ${card('c6', 'bd-bal', 'Balance énergétique', 'Calories ingérées − dépense estimée par MacroFactor')}
      ${card('c6', 'bd-wd', 'Écart à la cible par jour', 'Moyenne (ingéré − cible MacroFactor) par jour de semaine')}`;
    },
    update() {
      const { M, F, S, T } = SD, cfg = M.cfg.targets;
      const g = gran(), keys = bucketKeys(g);
      // KPI
      const tw = F.days.filter((x) => isNum(x.trendW));
      const a = tw[0], b = tw[tw.length - 1];
      const wks = a && b ? (nDays(a.d, b.d) - 1) / 7 : 0;
      const rate = wks >= 1 ? (b.trendW - a.trendW) / wks : null;
      const phase = (M.at(S.to) || {}).phase;
      const rt = phase && cfg.weeklyRate && cfg.weeklyRate[phase];
      const bf = F.days.filter((x) => isNum(x.bodyFat));
      const allBody = M.raw.body.filter((x) => x.d <= S.to && isNum(x['Tour de taille']));
      const waistL = allBody[allBody.length - 1], waistF = allBody.find((x) => x.d >= S.from);
      const lg = F.full.filter(logged);
      const wT = lg.filter((x) => x.tgt && isNum(x.tgt.kcal));
      const adh = wT.length ? (wT.filter((x) => Math.abs(x.kcal - x.tgt.kcal) <= 0.1 * x.tgt.kcal).length / wT.length) * 100 : null;
      setHTML('bd-k', [
        kpi({ label: 'Poids tendance', value: b ? b.trendW : null, unit: 'kg', digits: 1, delta: a && b ? b.trendW - a.trendW : null, deltaFmt: (v) => `${sgn(v, 1)} kg sur la période`, deltaLabel: '', good: null, ctx: b ? `Source : ${b.trendSrc === 'MacroFactor' ? 'Trend Weight MacroFactor' : 'moyenne exponentielle des pesées'}` : '' }),
        kpi({ label: 'Rythme', value: rate, digits: 2, unit: 'kg/sem', fmt: (v) => sgn(v, 2), ctx: phase ? `Phase ${esc(phase)}${rt ? ` · cible ${sgn(rt[0], 2)} à ${sgn(rt[1], 2)}` : ''}` : '', status: rt && isNum(rate) ? ' ' + (rate < rt[0] ? '<span class="status warn">Sous la cible</span>' : rate > rt[1] ? '<span class="status warn">Au-dessus</span>' : '<span class="status good">Dans la cible</span>') : '' }),
        kpi({ label: 'Masse grasse', value: bf.length ? bf[bf.length - 1].bodyFat : null, unit: '%', digits: 1, delta: bf.length >= 2 ? bf[bf.length - 1].bodyFat - bf[0].bodyFat : null, deltaFmt: (v) => `${sgn(v, 1)} pt sur la période`, deltaLabel: '', good: 'down' }),
        kpi({ label: 'Tour de taille', value: waistL ? waistL['Tour de taille'] : null, unit: 'cm', digits: 1, delta: waistL && waistF && waistF !== waistL ? waistL['Tour de taille'] - waistF['Tour de taille'] : null, deltaFmt: (v) => `${sgn(v, 1)} cm sur la période`, deltaLabel: '', good: 'down', ctx: waistL ? `Mesuré le ${esc(fdM(waistL.d))}` : '' }),
        kpi({ label: 'Adhérence calorique', value: adh, unit: '%', ctx: `${wT.length} jours loggés avec cible · ±10 %`, meter: adh }),
      ].join(''));

      weightChart('bd-weight', true);

      // Masse grasse & maigre
      const rollPts = (arr, get, n) => arr.map((x, i) => [tms(x.d), mean(arr.slice(Math.max(0, i - n + 1), i + 1).map(get))]);
      const lean = F.days.filter((x) => isNum(x.lean));
      [['bd-fat', bf, (x) => x.bodyFat, '%', 1, T.s[1]], ['bd-lean', lean, (x) => x.lean, 'kg', 1, T.s[2]]].forEach(([id, arr, get, u, d, col]) => {
        chart(id, arr.length ? base({
          grid: { left: 6, right: 14, top: 30, bottom: 6, containLabel: true },
          legend: ecLegend(T, ['Mesure', 'Moyenne 7 mesures']),
          tooltip: Object.assign(base().tooltip, { formatter: axisTip({ Mesure: (v) => nf(v, d) + ' ' + u, 'Moyenne 7 mesures': (v) => nf(v, d) + ' ' + u }) }),
          xAxis: xTime(), yAxis: yVal({ scale: true, name: u }),
          series: [
            { name: 'Mesure', type: 'scatter', data: arr.map((x) => [tms(x.d), get(x)]), symbolSize: 5, itemStyle: { color: col, opacity: 0.35 } },
            line('Moyenne 7 mesures', rollPts(arr, get, 7), col),
          ],
        }) : base(emptyOpt('Aucune mesure sur la période')), () => ({ cols: ['Date', `Valeur (${u})`], rows: arr.map((x) => [fdM(x.d), nf(get(x), d)]) }));
      });

      // Mensurations
      const measures = [...new Set(M.raw.body.flatMap((x) => Object.keys(x).filter((k) => k !== 'd')))];
      if (!measures.includes(S.measure)) S.measure = measures.includes('Tour de taille') ? 'Tour de taille' : measures[0];
      const msel = document.getElementById('bd-meas-sel');
      msel.innerHTML = measures.map((m) => `<option${m === S.measure ? ' selected' : ''}>${esc(m)}</option>`).join('');
      const mp = F.body.filter((x) => isNum(x[S.measure]));
      chart('bd-meas', mp.length ? base({
        grid: { left: 6, right: 14, top: 16, bottom: 6, containLabel: true },
        tooltip: Object.assign(base().tooltip, { formatter: axisTip({ [S.measure]: (v) => nf(v, 1) + (/%/.test(S.measure) ? '' : ' cm') }) }),
        xAxis: xTime(), yAxis: yVal({ scale: true }),
        series: [line(S.measure, mp.map((x) => [tms(x.d), x[S.measure]]), T.s[0], { showSymbol: true, symbolSize: 8 })],
      }) : base(emptyOpt('Aucune mesure sur la période')), () => ({ cols: ['Date', S.measure], rows: mp.map((x) => [fdM(x.d), nf(x[S.measure], 1)]) }));
      const mrows = measures.map((m) => { const v = F.body.filter((x) => isNum(x[m])); return v.length ? { m, f: v[0][m], l: v[v.length - 1][m], n: v.length } : null; }).filter(Boolean);
      setHTML('bd-meas-tbl', mrows.length ? `<table class="t"><thead><tr><th>Mesure</th><th class="num">Première</th><th class="num">Dernière</th><th class="num">Écart</th></tr></thead><tbody>${mrows.map((r) => `<tr><td>${esc(r.m)}</td><td class="num">${nf(r.f, 1)}</td><td class="num">${nf(r.l, 1)}</td><td class="num">${r.n > 1 ? sgn(r.l - r.f, 1) : '—'}</td></tr>`).join('')}</tbody></table>` : '');

      // Calories
      const pk = SD.partialKcal();
      setText('bd-pk-v', nf(pk, 0));
      const inK = agg(lg, (x) => x.d, (x) => x.kcal, 'mean', g), tgK = agg(lg, (x) => x.d, (x) => (x.tgt ? x.tgt.kcal : null), 'mean', g), tdK = agg(F.full, (x) => x.d, (x) => x.tdee, 'mean', g);
      setText('bd-kcal-s', `Moyenne par ${granUnit(g)} des jours loggés complets (${lg.length} j) · cible et dépense MacroFactor`);
      chart('bd-kcal', lg.length ? base({
        grid: { left: 6, right: 14, top: 30, bottom: 6, containLabel: true },
        legend: ecLegend(T, ['Ingéré', 'Cible', 'Dépense estimée']),
        tooltip: Object.assign(base().tooltip, { formatter: axisTip({ 'Ingéré': (v) => nf(v, 0) + ' kcal', 'Cible': (v) => nf(v, 0) + ' kcal', 'Dépense estimée': (v) => nf(v, 0) + ' kcal' }, (x, p) => bucketTitle(keys[p.dataIndex], g)) }),
        xAxis: xCat(keys.map((k) => bucketLabel(k, g))), yAxis: yVal({ scale: true, name: 'kcal' }),
        series: [
          bar('Ingéré', inK.map((o) => (isNum(o.v) ? Math.round(o.v) : null)), T.s[1]),
          line('Cible', tgK.map((o) => (isNum(o.v) ? Math.round(o.v) : null)), T.ink2, { connectNulls: true }),
          line('Dépense estimée', tdK.map((o) => (isNum(o.v) ? Math.round(o.v) : null)), T.s[6], { connectNulls: true }),
        ],
      }) : base(emptyOpt('Aucune journée loggée complète sur la période')), () => ({ cols: ['Période', 'Ingéré', 'Cible', 'Dépense', 'Jours'], rows: keys.map((k, i) => [bucketTitle(k, g), nf(inK[i].v, 0), nf(tgK[i].v, 0), nf(tdK[i].v, 0), inK[i].n]) }));

      // Macros
      const pr = agg(lg, (x) => x.d, (x) => x.prot, 'mean', g), cb = agg(lg, (x) => x.d, (x) => x.carb, 'mean', g), ft = agg(lg, (x) => x.d, (x) => x.fat, 'mean', g);
      const pct = S.macroView === 'pct';
      const toPct = (i, v, k) => { const e = (pr[i].v || 0) * 4 + (cb[i].v || 0) * 4 + (ft[i].v || 0) * 9; return e && isNum(v) ? +(((v * k) / e) * 100).toFixed(1) : null; };
      const mser = [['Protéines', pr, 4, T.s[0]], ['Glucides', cb, 4, T.s[1]], ['Lipides', ft, 9, T.s[2]]];
      setText('bd-macro-s', pct ? 'Part de l’énergie apportée par chaque macro' : `Grammes par jour, moyenne par ${granUnit(g)}`);
      chart('bd-macro', lg.length ? base({
        grid: { left: 6, right: 14, top: 30, bottom: 6, containLabel: true },
        legend: ecLegend(T, mser.map((m) => m[0])),
        tooltip: Object.assign(base().tooltip, { axisPointer: { type: 'shadow' }, formatter: axisTip(Object.fromEntries(mser.map((m) => [m[0], (v) => nf(v, 0) + (pct ? ' %' : ' g')])), (x, p) => bucketTitle(keys[p.dataIndex], g)) }),
        xAxis: xCat(keys.map((k) => bucketLabel(k, g))), yAxis: yVal({ max: pct ? 100 : null, name: pct ? '%' : 'g' }),
        series: mser.map(([n, arr, k, col], j) => bar(n, arr.map((o, i) => (pct ? toPct(i, o.v, k) : isNum(o.v) ? Math.round(o.v) : null)), col, { stack: 'm', itemStyle: { color: col, borderColor: T.surface, borderWidth: 1, borderRadius: j === 2 ? [4, 4, 0, 0] : 0 } })),
      }) : base(emptyOpt('Aucune journée loggée complète sur la période')), () => ({ cols: ['Période', 'Protéines (g)', 'Glucides (g)', 'Lipides (g)'], rows: keys.map((k, i) => [bucketTitle(k, g), nf(pr[i].v, 0), nf(cb[i].v, 0), nf(ft[i].v, 0)]) }));

      // Protéines / kg
      const pkA = agg(lg, (x) => x.d, (x) => (isNum(x.prot) && isNum(x.trendW) ? x.prot / x.trendW : null), 'mean', g);
      const [p0, p1] = cfg.proteinPerKg;
      chart('bd-prot', lg.length ? base({
        grid: { left: 6, right: 14, top: 18, bottom: 6, containLabel: true },
        tooltip: Object.assign(base().tooltip, { formatter: axisTip({ 'g/kg': (v) => nf(v, 2) + ' g/kg' }, (x, p) => bucketTitle(keys[p.dataIndex], g)) }),
        xAxis: xCat(keys.map((k) => bucketLabel(k, g))), yAxis: yVal({ scale: true, min: (v) => Math.floor((Math.min(v.min, p0) - 0.1) * 5) / 5, max: (v) => Math.ceil((Math.max(v.max, p1) + 0.1) * 5) / 5 }),
        series: [line('g/kg', pkA.map((o) => (isNum(o.v) ? +o.v.toFixed(2) : null)), T.s[0], { showSymbol: g !== 'day', connectNulls: true, markArea: { silent: true, itemStyle: { color: T.phase.gain }, label: { color: T.muted, fontSize: 11, position: 'insideTopRight', formatter: `cible ${nf(p0, 1)}–${nf(p1, 1)}` }, data: [[{ yAxis: p0 }, { yAxis: p1 }]] } })],
      }) : base(emptyOpt('Aucune journée loggée complète sur la période')), () => ({ cols: ['Période', 'g/kg'], rows: keys.map((k, i) => [bucketTitle(k, g), nf(pkA[i].v, 2)]) }));

      // Balance
      const bal = agg(lg.filter((x) => isNum(x.tdee)), (x) => x.d, (x) => x.kcal - x.tdee, 'mean', g);
      chart('bd-bal', bal.some((o) => isNum(o.v)) ? base({
        grid: { left: 6, right: 14, top: 30, bottom: 6, containLabel: true },
        legend: { show: true, top: 0, right: 0, data: [{ name: 'Surplus', itemStyle: { color: T.divPos } }, { name: 'Déficit', itemStyle: { color: T.divNeg } }], icon: 'roundRect', itemWidth: 12, itemHeight: 8, textStyle: { color: T.ink2 }, selectedMode: false },
        tooltip: Object.assign(base().tooltip, { axisPointer: { type: 'shadow' }, formatter: (ps) => { const p = ps.find((q) => isNum(q.value)); return p ? tipBox(bucketTitle(keys[p.dataIndex], g), [{ color: p.value >= 0 ? T.divPos : T.divNeg, box: true, value: sgn(p.value, 0) + ' kcal', name: p.value >= 0 ? 'surplus moyen' : 'déficit moyen' }], `${bal[p.dataIndex].n} jours avec dépense connue`) : ''; } }),
        xAxis: xCat(keys.map((k) => bucketLabel(k, g))), yAxis: yVal({ name: 'kcal' }),
        series: [
          { name: 'Surplus', type: 'bar', stack: 'b', barMaxWidth: 24, data: bal.map((o) => (isNum(o.v) && o.v >= 0 ? Math.round(o.v) : null)), itemStyle: { color: T.divPos, borderRadius: [4, 4, 0, 0] } },
          { name: 'Déficit', type: 'bar', stack: 'b', barMaxWidth: 24, data: bal.map((o) => (isNum(o.v) && o.v < 0 ? Math.round(o.v) : null)), itemStyle: { color: T.divNeg, borderRadius: [0, 0, 4, 4] } },
        ],
      }) : base(emptyOpt('Dépense MacroFactor disponible depuis janv. 2026')), () => ({ cols: ['Période', 'Balance (kcal)', 'Jours'], rows: keys.map((k, i) => [bucketTitle(k, g), sgn(bal[i].v, 0), bal[i].n]) }));

      // Écart par jour de semaine
      const dev = WD.map((_, w) => { const v = pluck(wT.filter((x) => x.wd === w), (x) => x.kcal - x.tgt.kcal); return { n: v.length, v: v.length ? mean(v) : null }; });
      chart('bd-wd', wT.length ? base({
        grid: { left: 6, right: 14, top: 22, bottom: 6, containLabel: true },
        tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => tipBox(WDL[p.dataIndex], [{ color: p.value >= 0 ? T.divPos : T.divNeg, box: true, value: sgn(p.value, 0) + ' kcal', name: 'vs cible' }], `${dev[p.dataIndex].n} jours loggés`) }),
        xAxis: xCat(WD), yAxis: yVal({ name: 'kcal' }),
        series: [{ type: 'bar', barMaxWidth: 24, data: dev.map((o) => ({ value: isNum(o.v) ? Math.round(o.v) : null, itemStyle: { color: o.v >= 0 ? T.divPos : T.divNeg, borderRadius: o.v >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4] } })), label: { show: true, position: 'top', color: T.ink2, fontSize: 11, formatter: (p) => sgn(p.value, 0) } }],
      }) : base(emptyOpt('Cibles MacroFactor disponibles depuis janv. 2025')), () => ({ cols: ['Jour', 'Écart moyen (kcal)', 'Jours'], rows: dev.map((o, w) => [WDL[w], sgn(o.v, 0), o.n]) }));
    },
  };

  // ================================================================ RÉCUPÉRATION & ACTIVITÉ
  const MATRIX_KEYS = ['sleepH', 'hrv', 'rhr', 'rec', 'steps', 'strMin', 'kcal', 'prot', 'trendD7'];
  const recovery = {
    id: 'recovery', title: 'Récupération',
    html() {
      const S = SD.S;
      const opts = Object.entries(METRICS).map(([k, m]) => [k, m.label]);
      const selX = `<select class="fselect" data-state="corrX" aria-label="Variable X">${opts.map(([k, l]) => `<option value="${k}"${k === S.corrX ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
      const selY = `<select class="fselect" data-state="corrY" aria-label="Variable Y">${opts.map(([k, l]) => `<option value="${k}"${k === S.corrY ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
      return `<div class="kpis-2" id="rc-k"></div>
      ${card('c12', 'rc-rec', 'Score de récupération', 'Moyenne de : sommeil vs cible, rang de la HRV et rang inverse de la FC repos sur les 60 jours précédents (2 composantes minimum)')}
      ${card('c6', 'rc-sleep', 'Sommeil', '')}
      ${card('c6', 'rc-hrv', 'HRV', 'Bande = plage min–max de la journée · ligne = milieu de plage, moyenne 7 j (indicatif)')}
      ${card('c6', 'rc-rhr', 'Fréquence cardiaque au repos', 'Valeur la plus basse du jour · ligne = moyenne 7 j')}
      ${card('c6', 'rc-steps', 'Pas', '')}
      ${card('c6', 'rc-xy', 'Explorateur de corrélations', '', `${selX}<span class="fsummary">→</span>${selY}${seg('corrLag', [['0', 'même jour'], ['1', 'lendemain']], S.corrLag)}`, { h: 'tall' })}
      ${card('c6', 'rc-mx', 'Matrice de corrélations', 'Coefficient r de Pearson, même jour · clic sur une case pour l’explorer', '', { h: 'tall' })}
      ${card('c6', 'rc-cmp', 'Jours de muscu vs jours sans', 'Moyennes sur la période · lendemain = nuit et mesures du jour suivant', '', { table: false, body: '<div class="tbl-wrap" id="rc-cmp-b"></div>' })}
      ${card('c6', 'rc-asym', 'Asymétrie de marche', 'Indicateur passif de gêne articulaire (genoux) · lignes = base et seuil d’alerte')}
      ${card('c6', 'rc-vo2', 'VO₂max estimée', 'Apple Watch, mesurée lors des marches et courses')}
      ${card('c6', 'rc-act', 'Calories actives', 'Dépense liée à l’activité (Apple Santé)')}`;
    },
    update() {
      const { M, F, S, T } = SD, cfg = M.cfg.targets;
      const g = gran(), keys = bucketKeys(g), daily = g === 'day';
      // KPI
      const sl = pluck(F.full, (x) => x.sleepH), psl = pluck(F.prevFull, (x) => x.sleepH);
      const rhr = avgOf(F.full, (x) => x.rhr), prhr = avgOf(F.prevFull, (x) => x.rhr);
      const hrv = avgOf(F.full, (x) => x.hrv), phrv = avgOf(F.prevFull, (x) => x.hrv);
      const rec = avgOf(F.full, (x) => x.rec), prec = avgOf(F.prevFull, (x) => x.rec);
      setHTML('rc-k', [
        kpi({ label: 'Sommeil moyen', value: mean(sl), fmt: fH, delta: isNum(prevDelta(mean(sl), mean(psl))) ? (mean(sl) - mean(psl)) * 60 : null, deltaFmt: (v) => `${sgn(v, 0)} min`, good: 'up', ctx: `${sl.length} nuits · cible ${fH(cfg.sleepHours)}` }),
        kpi({ label: 'Régularité', value: sd(sl), fmt: (v) => '± ' + fHM(v * 60), delta: isNum(prevDelta(sd(sl), sd(psl))) ? (sd(sl) - sd(psl)) * 60 : null, deltaFmt: (v) => `${sgn(v, 0)} min`, good: 'down', ctx: 'Écart-type de la durée de sommeil' }),
        kpi({ label: 'FC repos', value: rhr, unit: 'bpm', delta: prevDelta(rhr, prhr), good: 'down' }),
        kpi({ label: 'HRV (indicative)', value: hrv, unit: 'ms', delta: prevDelta(hrv, phrv), deltaDigits: 0, good: 'up' }),
        kpi({ label: 'Score de récupération', value: rec, unit: '/100', delta: prevDelta(rec, prec), deltaDigits: 0, good: 'up', status: ' ' + statusPill(rec, 70, 50) }),
      ].join(''));

      // Score
      const recD = series(F.full, (x) => x.rec, 3);
      const rec7 = F.full.map((x, i, arr) => { const w = pluck(arr.slice(Math.max(0, i - 6), i + 1), (y) => y.rec); return [tms(x.d), w.length >= 4 ? +mean(w).toFixed(1) : null]; });
      chart('rc-rec', recD.length ? base({
        grid: { left: 6, right: 14, top: 30, bottom: 6, containLabel: true },
        legend: ecLegend(T, ['Jour', 'Moyenne 7 j']),
        tooltip: Object.assign(base().tooltip, {
          formatter: (ps) => {
            const p = ps[0]; const x = M.at(dstr(p.value[0]));
            const r = ps.filter((q) => isNum(q.value[1])).map((q) => ({ color: q.color, value: nf(q.value[1], 0) + '/100', name: q.seriesName }));
            const c = x && x.recC ? `Sommeil ${isNum(x.recC.sleep) ? nf(x.recC.sleep, 0) : '—'} · HRV ${isNum(x.recC.hrv) ? nf(x.recC.hrv, 0) : '—'} · FC repos ${isNum(x.recC.rhr) ? nf(x.recC.rhr, 0) : '—'}` : '';
            return tipBox(fdL(dstr(p.value[0])), r, c);
          },
        }),
        xAxis: xTime(), yAxis: yVal({ min: 0, max: 100 }),
        series: [
          line('Jour', recD, T.s[2], { lineStyle: { width: 1, color: T.s[2], opacity: 0.45 }, markArea: { silent: true, label: { color: T.muted, fontSize: 11, position: 'insideRight' }, data: [[{ yAxis: 70, name: 'Bon', itemStyle: { color: 'rgba(12,163,12,0.06)' } }, { yAxis: 100 }], [{ yAxis: 0, name: 'Bas', itemStyle: { color: 'rgba(208,59,59,0.06)' } }, { yAxis: 50 }]] } }),
          line('Moyenne 7 j', rec7, T.s[2]),
        ],
      }) : base(emptyOpt('Score indisponible : il faut au moins 2 composantes (sommeil, HRV, FC repos)')), () => ({ cols: ['Date', 'Score', 'Sommeil', 'HRV', 'FC repos'], rows: F.full.filter((x) => isNum(x.rec)).map((x) => [fdM(x.d), nf(x.rec, 0), nf(x.recC.sleep, 0), nf(x.recC.hrv, 0), nf(x.recC.rhr, 0)]) }));

      // Sommeil
      const slA = agg(F.full, (x) => x.d, (x) => x.sleepH, 'mean', g);
      setText('rc-sleep-s', daily ? `Durée par nuit (jour du réveil) · ligne = moyenne 7 j · cible ${fH(cfg.sleepHours)}` : `Moyenne par ${granUnit(g)} · cible ${fH(cfg.sleepHours)}`);
      const tgtLine = { silent: true, symbol: 'none', lineStyle: { color: T.ink2, type: 'solid', width: 1 }, label: { color: T.ink2, fontSize: 11, position: 'insideEndTop', formatter: 'Cible' }, data: [{ yAxis: cfg.sleepHours }] };
      chart('rc-sleep', slA.some((o) => isNum(o.v)) ? base({
        grid: { left: 6, right: 14, top: daily ? 30 : 18, bottom: 6, containLabel: true },
        legend: daily ? ecLegend(T, ['Nuit', 'Moyenne 7 j']) : undefined,
        tooltip: Object.assign(base().tooltip, { axisPointer: { type: 'shadow' }, formatter: axisTip({ Nuit: fH, 'Moyenne 7 j': fH, Sommeil: fH }, (x, p) => bucketTitle(keys[p.dataIndex], g)) }),
        xAxis: xCat(keys.map((k) => bucketLabel(k, g))), yAxis: yVal({ name: 'h', min: 0 }),
        series: daily
          ? [bar('Nuit', slA.map((o) => (isNum(o.v) ? +o.v.toFixed(2) : null)), T.s[6], { markLine: tgtLine }), line('Moyenne 7 j', keys.map((k) => { const x = M.at(k); return x && isNum(x.sleep7) ? +x.sleep7.toFixed(2) : null; }), T.ink2, { connectNulls: true })]
          : [bar('Sommeil', slA.map((o) => (isNum(o.v) ? +o.v.toFixed(2) : null)), T.s[6], { markLine: tgtLine })],
      }) : base(emptyOpt('Aucune nuit enregistrée sur la période')), () => ({ cols: ['Période', 'Sommeil'], rows: keys.map((k, i) => [bucketTitle(k, g), fH(slA[i].v)]) }));

      // HRV (bande)
      const hd = F.full.filter((x) => isNum(x.hrvLo) && isNum(x.hrvHi));
      const loA = agg(hd, (x) => x.d, (x) => x.hrvLo, 'mean', 'day'), hiA = agg(hd, (x) => x.d, (x) => x.hrvHi, 'mean', 'day');
      const bandKeys = bucketKeys('day');
      chart('rc-hrv', hd.length ? base({
        grid: { left: 6, right: 14, top: 30, bottom: 6, containLabel: true },
        legend: { show: true, top: 0, right: 0, data: [{ name: 'Plage min–max', icon: 'roundRect' }, { name: 'Moyenne 7 j', icon: 'roundRect' }], itemWidth: 12, itemHeight: 8, textStyle: { color: T.ink2 }, selectedMode: false },
        tooltip: Object.assign(base().tooltip, { formatter: (ps) => { const i = ps[0].dataIndex; const x = M.at(bandKeys[i]); if (!x) return ''; return tipBox(fdL(bandKeys[i]), [{ color: T.s[2], box: true, value: isNum(x.hrvLo) ? `${nf(x.hrvLo, 0)}–${nf(x.hrvHi, 0)} ms` : '—', name: 'plage du jour' }, { color: T.s[2], value: isNum(x.hrv7) ? nf(x.hrv7, 0) + ' ms' : '—', name: 'moyenne 7 j (milieu de plage)' }]); } }),
        xAxis: xCat(bandKeys.map((k) => fdS(k)), { boundaryGap: false }), yAxis: yVal({ name: 'ms', min: 0 }),
        series: [
          { name: 'bas', type: 'line', stack: 'hrv', data: loA.map((o) => o.v), lineStyle: { opacity: 0 }, symbol: 'none', connectNulls: false, tooltip: { show: false } },
          { name: 'Plage min–max', type: 'line', stack: 'hrv', data: loA.map((o, i) => (isNum(o.v) && isNum(hiA[i].v) ? +(hiA[i].v - o.v).toFixed(1) : null)), lineStyle: { opacity: 0 }, symbol: 'none', areaStyle: { color: T.s[2], opacity: 0.16 }, itemStyle: { color: T.s[2] } },
          line('Moyenne 7 j', bandKeys.map((k) => { const x = M.at(k); return x && isNum(x.hrv7) ? +x.hrv7.toFixed(1) : null; }), T.s[2], { connectNulls: true }),
        ],
      }) : base(emptyOpt('Aucune mesure de HRV sur la période')), () => ({ cols: ['Date', 'Min (ms)', 'Max (ms)', 'Milieu (ms)'], rows: hd.map((x) => [fdM(x.d), nf(x.hrvLo, 0), nf(x.hrvHi, 0), nf(x.hrv, 0)]) }));

      // FC repos
      const rh = series(F.full, (x) => x.rhr, 3), rh7 = series(F.full, (x) => (isNum(x.rhr7) ? +x.rhr7.toFixed(1) : null), 3);
      chart('rc-rhr', rh.length ? base({
        grid: { left: 6, right: 14, top: 30, bottom: 6, containLabel: true },
        legend: ecLegend(T, ['Jour', 'Moyenne 7 j']),
        tooltip: Object.assign(base().tooltip, { formatter: axisTip({ Jour: (v) => nf(v, 0) + ' bpm', 'Moyenne 7 j': (v) => nf(v, 1) + ' bpm' }) }),
        xAxis: xTime(), yAxis: yVal({ scale: true, name: 'bpm' }),
        series: [line('Jour', rh, T.s[7], { lineStyle: { width: 1, color: T.s[7], opacity: 0.45 } }), line('Moyenne 7 j', rh7, T.s[7])],
      }) : base(emptyOpt()), () => ({ cols: ['Date', 'FC repos (bpm)'], rows: F.full.filter((x) => isNum(x.rhr)).map((x) => [fdM(x.d), nf(x.rhr, 0)]) }));

      // Pas
      const stA = agg(F.full, (x) => x.d, (x) => x.steps, 'mean', g);
      setText('rc-steps-s', `${daily ? 'Pas par jour' : `Moyenne par ${granUnit(g)}`} · lignes = plancher ${nf(cfg.stepsFloor, 0)} et objectif ${nf(cfg.stepsGoal, 0)}`);
      const ml = (v, l) => ({ yAxis: v, label: { formatter: l, color: T.ink2, fontSize: 11, position: 'insideEndTop' }, lineStyle: { color: T.ink2, type: 'solid', width: 1 } });
      chart('rc-steps', stA.some((o) => isNum(o.v)) ? base({
        grid: { left: 6, right: 14, top: 18, bottom: 6, containLabel: true },
        tooltip: Object.assign(base().tooltip, { axisPointer: { type: 'shadow' }, formatter: axisTip({ Pas: (v) => nf(v, 0) }, (x, p) => bucketTitle(keys[p.dataIndex], g)) }),
        xAxis: xCat(keys.map((k) => bucketLabel(k, g))), yAxis: yVal({ min: 0 }),
        series: [bar('Pas', stA.map((o) => (isNum(o.v) ? Math.round(o.v) : null)), T.s[5], { markLine: { silent: true, symbol: 'none', data: [ml(cfg.stepsFloor, 'Plancher'), ml(cfg.stepsGoal, 'Objectif')] } })],
      }) : base(emptyOpt()), () => ({ cols: ['Période', 'Pas'], rows: keys.map((k, i) => [bucketTitle(k, g), nf(stA[i].v, 0)]) }));

      // Explorateur
      const lag = +S.corrLag || 0;
      const { xs, ys, ds } = pairs(F.days, S.corrX, S.corrY, lag);
      const mx = METRICS[S.corrX], my = METRICS[S.corrY];
      const r = pearson(xs, ys);
      let sub = `${mx.label} (jour J) → ${my.label} (${lag ? 'J+1' : 'jour J'})`;
      const xyOpt = xs.length >= 5 ? (() => {
        const { a, b } = linreg(xs, ys);
        const x0 = Math.min(...xs), x1 = Math.max(...xs);
        sub += ` · r = ${nf(r, 2)} (${rWord(r)}) · n = ${xs.length} · pente ${sgn(b, Math.abs(b) < 1 ? 2 : 1)} ${my.unit || ''} par ${mx.unit || 'unité'}`;
        return base({
          grid: { left: 6, right: 18, top: 18, bottom: 22, containLabel: true },
          tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => p.seriesName === 'Jours' ? tipBox(fdL(ds[p.dataIndex]), [{ color: T.s[0], value: nf(p.value[0], mx.d) + ' ' + mx.unit, name: mx.label }, { color: T.s[0], value: nf(p.value[1], my.d) + ' ' + my.unit, name: my.label + (lag ? ' (lendemain)' : '') }], 'Clic pour le détail du jour') : '' }),
          xAxis: yVal({ scale: true, name: mx.label + (mx.unit ? ` (${mx.unit})` : ''), nameLocation: 'middle', nameGap: 26, splitLine: { show: false }, axisLine: { show: true, lineStyle: { color: T.axis } } }),
          yAxis: yVal({ scale: true, name: my.label + (my.unit ? ` (${my.unit})` : '') }),
          series: [
            { name: 'Jours', type: 'scatter', data: xs.map((v, i) => [v, ys[i]]), symbolSize: 8, itemStyle: { color: T.s[0], opacity: 0.5, borderColor: T.surface, borderWidth: 1 } },
            { name: 'Régression', type: 'line', data: [[x0, a + b * x0], [x1, a + b * x1]], showSymbol: false, lineStyle: { color: T.ink2, width: 2 }, tooltip: { show: false }, silent: true },
          ],
        });
      })() : base(emptyOpt('Pas assez de jours avec ces deux mesures'));
      setText('rc-xy-s', sub + ' · corrélation ≠ causalité');
      const xc = chart('rc-xy', xyOpt, () => ({ cols: ['Date', mx.label, my.label + (lag ? ' (J+1)' : '')], rows: xs.map((v, i) => [fdM(ds[i]), nf(v, mx.d), nf(ys[i], my.d)]) }));
      xc && xc.on('click', (p) => p.seriesName === 'Jours' && SD.openDay(ds[p.dataIndex]));

      // Matrice
      const cells = [];
      MATRIX_KEYS.forEach((kx, i) => MATRIX_KEYS.forEach((ky, j) => {
        if (i === j) { cells.push({ value: [i, j, '-', 0], itemStyle: { color: T.surface2 } }); return; }
        const pr = pairs(F.days, kx, ky, 0);
        const rr = pearson(pr.xs, pr.ys);
        cells.push([i, j, isNum(rr) && pr.xs.length >= 10 ? +rr.toFixed(2) : null, pr.xs.length]);
      }));
      const labs = MATRIX_KEYS.map((k) => METRICS[k].label.replace(' (indicative)', ''));
      const mc = chart('rc-mx', base({
        grid: { left: 16, right: 8, top: 8, bottom: 40, containLabel: true },
        tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => p.value[0] === p.value[1] ? '' : tipBox(`${labs[p.value[0]]} × ${labs[p.value[1]]}`, [{ color: isNum(p.value[2]) ? (p.value[2] >= 0 ? T.divPos : T.divNeg) : T.axis, box: true, value: isNum(p.value[2]) ? `r = ${nf(p.value[2], 2)}` : 'n < 10', name: isNum(p.value[2]) ? rWord(p.value[2]) : '' }], `n = ${p.value[3]} jours · clic pour explorer`) }),
        xAxis: xCat(labs, { axisLabel: { color: T.ink2, rotate: 40, fontSize: 11, interval: 0 }, axisLine: { show: false } }),
        yAxis: xCat(labs, { inverse: true, axisLabel: { color: T.ink2, fontSize: 11, interval: 0 }, axisLine: { show: false } }),
        visualMap: { show: true, min: -1, max: 1, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 10, itemHeight: 140, calculable: false, text: ['+1', '−1'], textStyle: { color: T.muted, fontSize: 11 }, inRange: { color: [T.divNeg, T.divMid, T.divPos] }, dimension: 2 },
        series: [{ type: 'heatmap', data: cells, itemStyle: { borderColor: T.surface, borderWidth: 2, borderRadius: 3 }, label: { show: true, fontSize: 10.5, color: T.ink, formatter: (p) => (p.value[0] !== p.value[1] && isNum(p.value[2]) && Math.abs(p.value[2]) >= 0.3 ? nf(p.value[2], 2) : '') } }],
      }), () => ({ cols: ['', ...labs], rows: labs.map((l, j) => [l, ...labs.map((_, i) => { const c = cells.find((q) => Array.isArray(q) && q[0] === i && q[1] === j); return c && isNum(c[2]) ? nf(c[2], 2) : '—'; })]) }));
      mc && mc.on('click', (p) => { if (p.value[0] === p.value[1]) return; S.corrX = MATRIX_KEYS[p.value[0]]; S.corrY = MATRIX_KEYS[p.value[1]]; S.corrLag = 0; document.querySelectorAll('#rc-xy-tools select').forEach((s) => { s.value = s.dataset.state === 'corrX' ? S.corrX : S.corrY; }); SD.refresh(); });

      // Comparaison muscu / repos
      const nxt = (x, k) => { const y = M.at(addD(x.d, 1)); return y && !y.partial ? y[k] : null; };
      const tr = F.full.filter((x) => x.train), rs = F.full.filter((x) => !x.train);
      const rowsC = [
        ['Sommeil de la nuit suivante', (x) => nxt(x, 'sleepH'), fH, (v) => `${sgn(v * 60, 0)} min`],
        ['HRV le lendemain', (x) => nxt(x, 'hrv'), (v) => nf(v, 0) + ' ms', (v) => sgn(v, 0) + ' ms'],
        ['FC repos le lendemain', (x) => nxt(x, 'rhr'), (v) => nf(v, 1) + ' bpm', (v) => sgn(v, 1) + ' bpm'],
        ['Score récup le lendemain', (x) => nxt(x, 'rec'), (v) => nf(v, 0), (v) => sgn(v, 0)],
        ['Pas le jour même', (x) => x.steps, (v) => nf(v, 0), (v) => sgn(v, 0)],
        ['Calories ingérées', (x) => (logged(x) ? x.kcal : null), (v) => nf(v, 0), (v) => sgn(v, 0)],
        ['Protéines', (x) => (logged(x) ? x.prot : null), (v) => nf(v, 0) + ' g', (v) => sgn(v, 0) + ' g'],
      ].map(([l, f, fm, fd]) => { const a1 = pluck(tr, f), b1 = pluck(rs, f); return { l, a: mean(a1), b: mean(b1), na: a1.length, nb: b1.length, fm, fd }; });
      setHTML('rc-cmp-b', `<table class="t"><thead><tr><th>Mesure</th><th class="num">Jours de muscu</th><th class="num">Jours sans</th><th class="num">Écart</th><th class="num">n</th></tr></thead><tbody>${rowsC.map((o) => `<tr><td>${esc(o.l)}</td><td class="num">${o.na ? esc(o.fm(o.a)) : '—'}</td><td class="num">${o.nb ? esc(o.fm(o.b)) : '—'}</td><td class="num">${o.na && o.nb ? esc(o.fd(o.a - o.b)) : '—'}</td><td class="num">${o.na} / ${o.nb}</td></tr>`).join('')}</tbody></table>`);

      // Asymétrie
      const asy = series(F.full, (x) => x.walkAsym, 5);
      const asy7 = F.full.map((x, i, arr) => { const w = pluck(arr.slice(Math.max(0, i - 6), i + 1), (y) => y.walkAsym); return [tms(x.d), w.length >= 3 ? +mean(w).toFixed(2) : null]; });
      const mla = (v, l) => ({ yAxis: v, label: { formatter: l, color: T.ink2, fontSize: 11, position: 'insideEndTop' }, lineStyle: { color: l === 'Alerte' ? T.crit : T.ink2, type: 'solid', width: 1 } });
      chart('rc-asym', asy.length ? base({
        grid: { left: 6, right: 14, top: 30, bottom: 6, containLabel: true },
        legend: ecLegend(T, ['Jour', 'Moyenne 7 j']),
        tooltip: Object.assign(base().tooltip, { formatter: axisTip({ Jour: (v) => nf(v, 1) + ' %', 'Moyenne 7 j': (v) => nf(v, 1) + ' %' }) }),
        xAxis: xTime(), yAxis: yVal({ min: 0, name: '%' }),
        series: [line('Jour', asy, T.s[3], { lineStyle: { width: 1, color: T.s[3], opacity: 0.5 }, markLine: { silent: true, symbol: 'none', data: [mla(cfg.walkAsymBase, 'Base'), mla(cfg.walkAsymAlert, 'Alerte')] } }), line('Moyenne 7 j', asy7, T.s[3], { connectNulls: false })],
      }) : base(emptyOpt()), () => ({ cols: ['Date', 'Asymétrie (%)'], rows: F.full.filter((x) => isNum(x.walkAsym)).map((x) => [fdM(x.d), nf(x.walkAsym, 1)]) }));

      // VO2max
      const vo = F.full.filter((x) => isNum(x.vo2));
      chart('rc-vo2', vo.length ? base({
        grid: { left: 6, right: 14, top: 18, bottom: 6, containLabel: true },
        tooltip: Object.assign(base().tooltip, { formatter: axisTip({ 'VO₂max': (v) => nf(v, 1) + ' mL/kg/min' }) }),
        xAxis: xTime(), yAxis: yVal({ scale: true, name: 'mL/kg/min' }),
        series: [line('VO₂max', vo.map((x) => [tms(x.d), x.vo2]), T.s[4], { showSymbol: true, symbolSize: 7 })],
      }) : base(emptyOpt('Aucune estimation de VO₂max sur la période')), () => ({ cols: ['Date', 'VO₂max'], rows: vo.map((x) => [fdM(x.d), nf(x.vo2, 1)]) }));

      // Calories actives
      const ak = agg(F.full, (x) => x.d, (x) => x.activeKcal, 'mean', g);
      chart('rc-act', ak.some((o) => isNum(o.v)) ? base({
        grid: { left: 6, right: 14, top: 18, bottom: 6, containLabel: true },
        tooltip: Object.assign(base().tooltip, { axisPointer: { type: 'shadow' }, formatter: axisTip({ 'Calories actives': (v) => nf(v, 0) + ' kcal' }, (x, p) => bucketTitle(keys[p.dataIndex], g)) }),
        xAxis: xCat(keys.map((k) => bucketLabel(k, g))), yAxis: yVal({ name: 'kcal' }),
        series: [bar('Calories actives', ak.map((o) => (isNum(o.v) ? Math.round(o.v) : null)), T.s[1])],
      }) : base(emptyOpt()), () => ({ cols: ['Période', 'kcal actives'], rows: keys.map((k, i) => [bucketTitle(k, g), nf(ak[i].v, 0)]) }));
    },
  };

  // ================================================================ DONNÉES
  let dataPage = 1, dataSort = { k: 'd', dir: -1 };
  const COLS = [
    ['d', 'Date', (x) => fdate(x.d, { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' }), 0],
    ['phase', 'Phase', (x) => x.phase || '', 0],
    ['steps', 'Pas', (x) => nf(x.steps, 0), 1], ['sleepH', 'Sommeil', (x) => fH(x.sleepH), 1],
    ['hrv', 'HRV', (x) => nf(x.hrv, 0), 1], ['rhr', 'FC repos', (x) => nf(x.rhr, 0), 1], ['rec', 'Récup', (x) => nf(x.rec, 0), 1],
    ['weight', 'Pesée', (x) => nf(x.weight, 2), 1], ['trendW', 'Tendance', (x) => nf(x.trendW, 2), 1],
    ['kcal', 'kcal', (x) => nf(x.kcal, 0), 1], ['prot', 'Prot.', (x) => nf(x.prot, 0), 1],
    ['actMin', 'Activité', (x) => (x.actMin ? fHM(x.actMin) : ''), 1], ['split', 'Séance', (x) => x.split || (x.w.length ? x.w.map((w) => w.type).join(', ') : ''), 0],
  ];
  const data = {
    id: 'data', title: 'Données',
    html() {
      return `<section class="card c7"><div class="card-h"><div><h2>Mettre à jour les données</h2><p class="sub">Dépose tes nouveaux exports : ils sont lus dans ton navigateur, rien n’est envoyé.</p></div></div>
        <label class="drop" id="drop" for="file-in"><input type="file" id="file-in" multiple accept=".csv,.xlsx"><strong>Glisse tes fichiers ici</strong> ou clique pour les choisir<br><span class="fsummary">Apple Santé (Health Export, .csv) · MacroFactor (FULL EXPORT, .xlsx) · TrainAI (.xlsx) · journal « Date,Notes » (.csv)</span></label>
        <ul class="log" id="import-log"></ul><div id="import-banner"></div>
        <p class="note">Les dates couvertes par un nouvel export remplacent les anciennes ; tout l’historique déjà chargé est conservé. L’import est mémorisé dans ce navigateur.</p></section>
      <section class="card c5"><div class="card-h"><div><h2>Sources chargées</h2><p class="sub" id="src-sub"></p></div></div><div class="tbl-wrap tbl-scroll" id="src-b"></div></section>
      ${card('c12', 'dt-cov', 'Couverture des données', 'Part des jours du mois où la mesure existe', '', { h: 'tall' })}
      ${card('c12', 'dt-tbl', 'Données journalières', 'Filtres actifs appliqués · clic sur une ligne pour le détail', '', { table: false, body: '<div class="tbl-wrap tbl-scroll" id="dt-tbl-b" style="max-height:560px"></div><button type="button" class="link" id="dt-more" hidden>Afficher plus</button>' })}
      <section class="card c12"><div class="card-h"><div><h2>Méthode</h2><p class="sub">Comment chaque indicateur est calculé</p></div></div><dl class="method">
        <dt>Période précédente</dt><dd>Les variations des tuiles comparent la période choisie à la période de même durée qui la précède, avec les mêmes filtres de jours.</dd>
        <dt>Poids tendance</dt><dd>Trend Weight de MacroFactor quand il existe (depuis déc. 2024). Avant : moyenne exponentielle à 10 % des pesées Apple Santé, interrompue après 21 jours sans pesée. Les pesées d’une autre personne (balance partagée, enfant) sont écartées : en remontant le temps depuis les données les plus récentes, une pesée qui s’écarte de plus de 4 kg (ou 6 %) de la médiane des 10 dernières pesées retenues est ignorée. La balance était partagée en 2022 : les poids de cette année restent moins fiables.</dd>
        <dt>Séances</dt><dd>Une séance de musculation = un jour avec un entraînement « Musculation » dans Apple Santé (sinon TrainAI ou un log MacroFactor). Les doublons exacts (même type, même durée) sont fusionnés. Les séances de plus de 3 h (chrono oublié) comptent comme séance mais pas dans les durées.</dd>
        <dt>Split détecté</dt><dd>Part des séries par groupe musculaire (MacroFactor) ou par mots-clés des exercices : ≥ 60 % jambes = Bas du corps, ≥ 60 % poussée = Push, ≥ 60 % tirage = Pull, peu de jambes = Haut du corps, sinon Full body.</dd>
        <dt>e1RM</dt><dd>MacroFactor : valeur calculée par l’app. TrainAI : formule d’Epley (charge × (1 + reps/30)) sur la meilleure série. L’indice de force rapporte chaque exercice à ses 2 premières séances de la période, ce qui neutralise la différence de formule.</dd>
        <dt>HRV</dt><dd>L’export Apple Santé donne la plage min–max de la journée, pas la moyenne. Le « milieu de plage » est un indicateur de tendance, biaisé vers le haut. Pour une moyenne exacte, règle Health Export sur l’agrégation « Moyenne » pour la HRV.</dd>
        <dt>FC repos</dt><dd>Valeur la plus basse du jour. Sommeil : nuit rattachée au jour du réveil ; les nuits de moins de 3 h (enregistrement incomplet) sont exclues.</dd>
        <dt>Score de récupération</dt><dd>Moyenne de 2 ou 3 composantes : sommeil / cible (plafonné à 100), rang de la HRV du jour parmi les 60 jours précédents, rang inverse de la FC repos sur 60 jours. Bon ≥ 70, bas &lt; 50.</dd>
        <dt>Nutrition</dt><dd>Une journée compte si elle est loggée dans MacroFactor au-dessus du seuil de log partiel (réglable dans Corps &amp; nutrition). Adhérence = jours à ±10 % de la cible calorique MacroFactor du jour.</dd>
        <dt>Jour de l’export</dt><dd>Le dernier jour d’un export Apple Santé est incomplet : il est affiché mais exclu des moyennes.</dd>
      </dl></section>`;
    },
    update() {
      const { M, F, S, T } = SD;
      SD.bindImport && SD.bindImport();
      // Sources
      const src = M.raw.sources.slice().sort((a, b) => String(b.to).localeCompare(String(a.to)));
      setText('src-sub', `${src.length} fichiers · ${fdM(M.first)} → ${fdM(M.last)}`);
      const kindL = { health: 'Apple Santé', macrofactor: 'MacroFactor', trainai: 'TrainAI', notes: 'Journal' };
      setHTML('src-b', `<table class="t"><thead><tr><th>Source</th><th>Période</th><th class="num">Jours</th><th>Fichier</th></tr></thead><tbody>${src.map((s) => `<tr><td>${esc(kindL[s.kind] || s.kind)}${s.imported ? ' <span class="status good">importé</span>' : ''}</td><td>${s.from ? esc(fdM(s.from) + ' → ' + fdM(s.to)) : '—'}</td><td class="num">${s.n}</td><td style="max-width:260px;overflow:hidden;text-overflow:ellipsis" title="${esc(s.fileName)}">${esc(s.fileName)}</td></tr>`).join('')}</tbody></table>`);

      // Couverture
      const metrics = [['Pas', (x) => x.steps], ['Sommeil', (x) => x.sleepH], ['HRV', (x) => x.hrv], ['FC repos', (x) => x.rhr], ['Pesée', (x) => x.weight], ['Nutrition loggée', (x) => (logged(x) ? 1 : null)], ['Séances', (x) => (x.w.length ? 1 : null)], ['Exercices détaillés', (x) => (x.ex.length ? 1 : null)], ['Muscles (MacroFactor)', (x) => (x.mus.length ? 1 : null)]];
      const mkeys = bucketKeys('month');
      const cov = [];
      metrics.forEach(([l, f], j) => mkeys.forEach((k, i) => {
        const ds = F.days.filter((x) => x.d.slice(0, 7) === k.slice(0, 7));
        if (!ds.length) return;
        const c = ds.filter((x) => isNum(f(x))).length;
        cov.push([i, j, Math.round((c / ds.length) * 100)]);
      }));
      chart('dt-cov', base({
        grid: { left: 16, right: 10, top: 34, bottom: 6, containLabel: true },
        tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => tipBox(`${metrics[p.value[1]][0]} · ${fdate(mkeys[p.value[0]], { month: 'long', year: 'numeric' })}`, [{ color: T.s[0], box: true, value: p.value[2] + ' %', name: 'des jours couverts' }]) }),
        xAxis: xCat(mkeys.map((k) => fdate(k, { month: 'short', year: '2-digit' })), { axisLine: { show: false } }),
        yAxis: xCat(metrics.map((m) => m[0]), { inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 12 } }),
        visualMap: { min: 0, max: 100, orient: 'horizontal', right: 0, top: 0, itemWidth: 10, itemHeight: 110, calculable: false, text: ['100 %', '0 %'], textStyle: { color: T.muted, fontSize: 11 }, inRange: { color: [T.seq[0], T.seq[2], T.seq[4]] } },
        series: [{ type: 'heatmap', data: cov, itemStyle: { borderColor: T.surface, borderWidth: 2, borderRadius: 2 } }],
      }), () => ({ cols: ['Mesure', ...mkeys.map((k) => fdate(k, { month: 'short', year: '2-digit' }))], rows: metrics.map((m, j) => [m[0], ...mkeys.map((_, i) => { const c = cov.find((q) => q[0] === i && q[1] === j); return c ? c[2] + ' %' : '—'; })]) }));

      // Table
      const col = COLS.find((c) => c[0] === dataSort.k) || COLS[0];
      const sorted = F.days.slice().sort((a, b) => {
        const va = a[col[0]], vb = b[col[0]];
        if (col[0] === 'd' || typeof va === 'string' || typeof vb === 'string') return dataSort.dir * String(va || '').localeCompare(String(vb || ''));
        return dataSort.dir * ((isNum(va) ? va : -Infinity) - (isNum(vb) ? vb : -Infinity));
      });
      const shown = sorted.slice(0, dataPage * 120);
      setHTML('dt-tbl-b', `<table class="t"><thead><tr>${COLS.map((c) => `<th class="${c[3] ? 'num' : ''}" data-sort="${c[0]}">${c[1]}${dataSort.k === c[0] ? (dataSort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>${shown.map((x) => `<tr class="clickable" data-day="${x.d}">${COLS.map((c) => `<td class="${c[3] ? 'num' : ''}">${esc(c[2](x))}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      const more = document.getElementById('dt-more');
      more.hidden = shown.length >= sorted.length;
      more.textContent = `Afficher plus (${shown.length} / ${sorted.length})`;
      more.onclick = () => { dataPage++; data.update(); };
      document.querySelectorAll('#dt-tbl-b th[data-sort]').forEach((h) => { h.onclick = () => { dataSort = { k: h.dataset.sort, dir: dataSort.k === h.dataset.sort ? -dataSort.dir : -1 }; dataPage = 1; data.update(); }; });
    },
  };

  SD.PAGES = { overview, training, strength, body, recovery, data };
  SD.PAGE_ORDER = ['overview', 'training', 'strength', 'body', 'recovery', 'data'];
  SD.segSync = segSync;
  SD.legendHTML = legendHTML;
})();
