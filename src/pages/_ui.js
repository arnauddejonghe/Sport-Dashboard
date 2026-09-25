/* Salle des Machines — briques partagées par les pages (gabarits de cartes, graphiques communs). */
(function () {
  'use strict';
  const SD = window.SD;
  const { tms, dstr, fdS, fdM, fdL, fdate, isNum, pluck, sum, mean, nf, sgn, fHM, fH, esc, TYPE_ORDER, typeKey, typeColor, STRENGTH,
    gran, bucketKeys, bucketOf, bucketEnd, bucketLabel, bucketTitle, granUnit, chart, tipBox, axisTip, base, xTime, xCat, yVal, bar, line, series, phaseArea, emptyOpt, WD, WDL } = SD;

  const seg = (key, opts, cur) =>
    `<div class="seg" data-state="${key}" role="group">${opts.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${String(cur) === String(v)}">${esc(l)}</button>`).join('')}</div>`;

  function card(cls, id, title, sub, tools, opts) {
    opts = opts || {};
    const tbl = opts.table === false ? '' : `<button type="button" class="tbl-toggle" data-tbl="${id}" aria-pressed="false">Tableau</button>`;
    const body = opts.body != null ? opts.body : `<div class="chart ${opts.h || ''}" id="${id}"></div><div class="tbl-view" hidden></div>`;
    return `<section class="card ${cls}"><div class="card-h"><div><h2 id="${id}-t">${title}</h2>${sub != null ? `<p class="sub" id="${id}-s">${sub}</p>` : ''}</div>`
      + `<div class="card-tools" id="${id}-tools">${tools || ''}${tbl}</div></div>${body}${opts.note ? `<p class="note" id="${id}-n">${opts.note}</p>` : ''}</section>`;
  }
  const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  const setHTML = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  const segSync = () => {
    document.querySelectorAll('.card .seg[data-state]').forEach((g) => {
      const cur = String(SD.S[g.dataset.state]);
      g.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === cur)));
    });
  };
  // légende en haut à droite ; au-delà de 4 entrées elle défile (sans passer sous la boîte à outils)
  const ecLegend = (T, data) => Object.assign({ show: true, data, top: 0, right: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 6, textStyle: { color: T.ink2, fontSize: 11.5 }, inactiveColor: T.axis,
    pageIconColor: T.ink2, pageIconInactiveColor: T.axis, pageIconSize: 10, pageTextStyle: { color: T.muted, fontSize: 11 } },
  data.length > 4 ? { type: 'scroll', left: 0, right: 96 } : {});
  const drill = (k, g) => {
    if (g === 'day') { SD.openDay(k); return; }
    SD.setRange(k, bucketEnd(k, g));
    SD.refresh();
  };
  const unitWeek = (g) => (g === 'week' ? '/ sem' : g === 'month' ? '/ mois' : '/ jour');
  const avgOf = (arr, f) => mean(pluck(arr, f));
  const prevDelta = (cur, prev) => (SD.F.hasPrev && isNum(cur) && isNum(prev) ? cur - prev : null);

  function dayTip(d, foot) {
    const x = SD.M.at(d);
    const T = SD.T;
    if (!x) return '';
    const rows = [];
    if (isNum(x.rec)) rows.push({ color: SD.recColor(x.rec), value: nf(x.rec, 0) + ' %', name: 'récupération' });
    if (isNum(x.strain)) rows.push({ color: T.strain, value: nf(x.strain, 0), name: 'charge' });
    if (isNum(x.sleepH)) rows.push({ color: T.sleep, value: fH(x.sleepH), name: 'sommeil' + (isNum(x.sleepPerf) ? ` (${nf(x.sleepPerf, 0)} %)` : '') });
    for (const w of x.w) rows.push({ color: typeColor(w.type), box: true, value: w.min != null ? fHM(w.min) : '—', name: w.type + (x.split && STRENGTH.has(w.type) ? ` · ${x.split}` : '') });
    if (isNum(x.steps)) rows.push({ color: T.act, value: nf(x.steps, 0), name: 'pas' });
    return tipBox(fdL(d), rows, foot || (x.partial ? 'Journée en cours au moment de l’export' : 'Clic pour le détail du jour'));
  }

  /** Poids : pesées + tendance + phases (+ projection optionnelle) */
  function weightChart(id, opts) {
    opts = opts || {};
    const { F, S, T, M } = SD;
    const pts = F.days.filter((x) => isNum(x.weight));
    const tr = series(F.days, (x) => x.trendW, 21);
    if (!pts.length && !tr.length) { chart(id, base(emptyOpt('Aucune pesée sur la période'))); return; }
    const extra = [];
    const legend = ['Pesée', 'Poids tendance'];
    let proj = null;
    if (opts.projection && S.to === M.last) {
      const dl = M.cfg.deadline && M.cfg.deadline.date > M.last ? M.cfg.deadline.date : null;
      proj = SD.scores.projection(M.last, dl);
      if (proj) {
        extra.push({ name: '_pbas', type: 'line', stack: 'proj', data: proj.points.map((p) => [tms(p.d), +p.lo.toFixed(2)]), lineStyle: { opacity: 0 }, symbol: 'none', silent: true, tooltip: { show: false } });
        extra.push({ name: 'Incertitude', type: 'line', stack: 'proj', data: proj.points.map((p) => [tms(p.d), +(p.hi - p.lo).toFixed(2)]), lineStyle: { opacity: 0 }, symbol: 'none', areaStyle: { color: T.s[0], opacity: 0.1 }, silent: true, tooltip: { show: false } });
        extra.push(line('Projection', proj.points.map((p) => [tms(p.d), +p.y.toFixed(2)]), T.s[0], { lineStyle: { width: 2, type: [6, 4], color: T.s[0] },
          markPoint: { symbol: 'circle', symbolSize: 9, itemStyle: { color: T.s[0], borderColor: T.card, borderWidth: 2 }, label: { show: true, position: 'top', color: T.ink, fontSize: 11.5, formatter: () => `${nf(proj.end.y, 1)} kg` }, data: [{ coord: [tms(proj.end.d), proj.end.y] }] } }));
        legend.push('Projection');
      }
    }
    const xMax = proj ? tms(proj.end.d) + SD.DAY : null;
    const c = chart(id, base({
      grid: { left: 8, right: 16, top: 44, bottom: 8, containLabel: true },
      legend: Object.assign(ecLegend(T, legend), { left: 0, right: 'auto' }),
      toolbox: SD.toolbox(), dataZoom: SD.zoom(),
      tooltip: Object.assign(base().tooltip, { formatter: axisTip({ 'Pesée': (v) => nf(v, 2) + ' kg', 'Poids tendance': (v) => nf(v, 2) + ' kg', Projection: (v) => nf(v, 2) + ' kg (projection)' }) }),
      xAxis: xTime(xMax ? { max: xMax } : {}),
      yAxis: yVal({ scale: true, name: 'kg', axisLabel: { color: T.muted, formatter: (v) => nf(v, 0) } }),
      series: [
        { name: 'Pesée', type: 'scatter', data: pts.map((x) => [tms(x.d), x.weight]), symbolSize: 6, itemStyle: { color: T.s[0], opacity: 0.35 }, emphasis: { scale: 1.4 } },
        line('Poids tendance', tr, T.s[0], { markArea: phaseArea(), z: 3, lineStyle: { width: 2.5, color: T.s[0] } }),
        ...extra,
      ],
    }), () => ({ cols: ['Date', 'Pesée (kg)', 'Tendance (kg)'], rows: F.days.filter((x) => isNum(x.weight) || isNum(x.trendW)).map((x) => [fdM(x.d), nf(x.weight, 2), nf(x.trendW, 2)]) }));
    c && c.on('click', (p) => p.seriesName === 'Pesée' && SD.openDay(dstr(p.value[0])));
    return proj;
  }

  /** Répartition des activités (minutes par type), clic = filtre */
  function typesChart(id) {
    const { F, S, T } = SD;
    const all = [];
    for (const x of F.days) for (const w of x.w) all.push(w);
    const by = TYPE_ORDER.map((t) => {
      const ws = all.filter((w) => typeKey(w.type) === t);
      return { t, n: ws.length, h: sum(pluck(ws, (w) => w.min)) / 60 };
    }).filter((o) => o.n).sort((a, b) => b.h - a.h);
    if (!by.length) { chart(id, base(emptyOpt('Aucune activité enregistrée'))); return; }
    const on = (t) => !S.types || S.types.includes(t);
    const el = document.getElementById(id);
    if (el) el.style.height = Math.max(180, by.length * 40 + 30) + 'px';
    const c = chart(id, base({
      grid: { left: 16, right: 56, top: 6, bottom: 6, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => tipBox(p.name, [{ color: typeColor(p.name), box: true, value: nf(p.value, 1) + ' h', name: `${by[p.dataIndex].n} séances` }], 'Clic pour filtrer ce type') }),
      xAxis: yVal({ axisLabel: { show: false }, splitLine: { show: false } }),
      yAxis: xCat(by.map((o) => o.t), { inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 12.5 } }),
      series: [{
        type: 'bar', barMaxWidth: 16, data: by.map((o) => ({ value: o.h, itemStyle: { color: typeColor(o.t), borderRadius: [0, 4, 4, 0], opacity: on(o.t) ? 1 : 0.28 } })),
        label: { show: true, position: 'right', color: T.ink2, formatter: (p) => nf(p.value, p.value < 10 ? 1 : 0) + ' h' },
      }],
    }), () => ({ cols: ['Activité', 'Heures', 'Séances'], rows: by.map((o) => [o.t, nf(o.h, 1), o.n]) }));
    if (SD.charts.get(id)) SD.charts.get(id).resize();
    c && c.on('click', (p) => {
      const t = by[p.dataIndex].t;
      if (!S.types) S.types = [t];
      else if (S.types.includes(t)) S.types = S.types.length === 1 ? null : S.types.filter((x) => x !== t);
      else S.types = S.types.concat(t);
      SD.refresh();
    });
  }

  /** Calendrier (≤ 400 j) ou grille mois × années, avec une métrique au choix */
  const CAL = {
    score: ['Note du jour', (x) => SD.scores.dayScore(x), (v) => nf(v, 0) + '/100', 'mean', 'score'],
    rec: ['Récupération', (x) => x.rec, (v) => nf(v, 0) + ' %', 'mean', 'rec'],
    strain: ['Charge', (x) => x.strain, (v) => nf(v, 0) + '/100', 'mean', 'strain'],
    sleepH: ['Sommeil', (x) => x.sleepH, fH, 'mean', 'sleep'],
    steps: ['Pas', (x) => x.steps, (v) => nf(v, 0), 'mean', 'act'],
    train: ['Séances de muscu', (x) => (SD.F.strengthDays.has(x.d) ? 1 : null), (v) => nf(v, 0), 'sum', 'strain'],
  };
  function calendar(id) {
    const { F, S, T } = SD;
    const el = document.getElementById(id);
    if (!el) return;
    const [lab, get, fm, how, tone] = CAL[S.calMetric] || CAL.score;
    const val = (x) => (x.partial ? null : get(x));
    const scale = tone === 'rec' || tone === 'score' ? [T.crit, T.warn, T.good] : tone === 'sleep' ? ['#1e2240', '#4a51a8', T.sleep, '#c9ccff'] : tone === 'act' ? ['#0f2a28', '#1b6f66', T.act, '#9ff0e6'] : [T.seq[1], T.seq[2], T.seq[3], T.seq[4], T.seq[5]];
    if (F.len <= 400) {
      const weeks = Math.ceil((F.len + 7) / 7);
      const cs = Math.max(10, Math.min(26, Math.floor(((el.clientWidth || 900) - 50) / weeks)));
      el.style.height = cs * 7 + 62 + 'px';
      const data = F.days.map((x) => [x.d, val(x)]).filter((p) => isNum(p[1]));
      const vs = data.map((p) => p[1]).sort((p, q) => p - q);
      const lo = tone === 'rec' || tone === 'score' ? 0 : tone === 'sleep' ? Math.max(0, (vs[Math.floor(vs.length * 0.05)] || 5)) : 0;
      const hi = tone === 'rec' || tone === 'score' ? 100 : vs.length ? vs[Math.floor(vs.length * 0.95)] || vs[vs.length - 1] : 1;
      SD.ui.setText(id + '-s', `${lab} par jour · clic sur un jour pour le détail`);
      const c = chart(id, base({
        tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => SD.ui.dayTip(p.value[0]) }),
        visualMap: S.calMetric === 'train'
          ? { show: false, type: 'piecewise', pieces: [{ value: 1, color: T.strain }] }
          : { show: true, min: lo, max: Math.max(hi, lo + 1), calculable: false, orient: 'horizontal', right: 0, top: 0, itemWidth: 10, itemHeight: 110, text: [fm(Math.max(hi, lo + 1)), fm(lo)], textStyle: { color: T.muted, fontSize: 11 }, inRange: { color: scale } },
        calendar: {
          range: [S.from, S.to], top: 38, left: 30, right: 4, cellSize: [cs, cs], splitLine: { show: false },
          itemStyle: { color: SD.T.card2, borderColor: SD.T.card, borderWidth: 3, borderRadius: 4 }, yearLabel: { show: false },
          monthLabel: { nameMap: ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'], color: T.muted, fontSize: 11 },
          dayLabel: { firstDay: 1, nameMap: ['D', 'L', 'M', 'M', 'J', 'V', 'S'], color: T.muted, fontSize: 10 },
        },
        series: [{ type: 'heatmap', coordinateSystem: 'calendar', data, itemStyle: { borderRadius: 4 }, emphasis: { itemStyle: { borderColor: T.ink, borderWidth: 1 } } }],
      }), () => ({ cols: ['Date', lab], rows: data.map((p) => [fdM(p[0]), S.calMetric === 'train' ? 'Séance' : fm(p[1])]) }));
      c && c.on('click', (p) => SD.openDay(p.value[0]));
    } else {
      const years = [];
      for (let y = +S.from.slice(0, 4); y <= +S.to.slice(0, 4); y++) years.push(String(y));
      el.style.height = years.length * 32 + 76 + 'px';
      const m = new Map();
      for (const x of F.days) {
        const k = x.d.slice(0, 7);
        const o = m.get(k) || m.set(k, []).get(k);
        const v = val(x);
        if (isNum(v)) o.push(v);
      }
      const data = [];
      for (const [k, arr] of m) if (arr.length) data.push([+k.slice(5, 7) - 1, years.indexOf(k.slice(0, 4)), how === 'sum' ? sum(arr) : mean(arr)]);
      const vs = data.map((p) => p[2]);
      const lo = tone === 'rec' || tone === 'score' ? Math.min(...vs, 50) : Math.min(...vs, 0), hi = Math.max(...vs, 1);
      SD.ui.setText(id + '-s', `${lab} (${how === 'sum' ? 'total' : 'moyenne'} par mois) · clic sur un mois pour zoomer`);
      const c = chart(id, base({
        grid: { left: 6, right: 8, top: 36, bottom: 4, containLabel: true },
        tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => tipBox(fdate(`${years[p.value[1]]}-${String(p.value[0] + 1).padStart(2, '0')}-01`, { month: 'long', year: 'numeric' }), [{ color: T.strain, box: true, value: fm(p.value[2]), name: lab.toLowerCase() }], 'Clic pour zoomer sur ce mois') }),
        xAxis: xCat(['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'], { axisLine: { show: false } }),
        yAxis: xCat(years, { axisLine: { show: false } }),
        visualMap: { show: true, min: lo, max: hi, orient: 'horizontal', right: 0, top: 0, itemWidth: 10, itemHeight: 110, calculable: false, text: [fm(hi), fm(lo)], textStyle: { color: T.muted, fontSize: 11 }, inRange: { color: scale } },
        series: [{ type: 'heatmap', data, itemStyle: { borderColor: T.card, borderWidth: 3, borderRadius: 5 }, emphasis: { itemStyle: { borderColor: T.ink, borderWidth: 1 } } }],
      }), () => ({ cols: ['Mois', lab], rows: data.map((p) => [`${String(p[0] + 1).padStart(2, '0')}/${years[p[1]]}`, fm(p[2])]) }));
      c && c.on('click', (p) => {
        const k = `${years[p.value[1]]}-${String(p.value[0] + 1).padStart(2, '0')}-01`;
        SD.setRange(k, bucketEnd(k, 'month'));
        SD.refresh();
      });
    }
    if (SD.charts.get(id)) SD.charts.get(id).resize();
  }

  /** Barres de récupération colorées par zone + charge alignée (deux grilles, un seul axe temps) */
  function recStrainChart(id) {
    const { F, T } = SD;
    const days = F.full.filter((x) => isNum(x.rec) || isNum(x.strain));
    if (!days.length) { chart(id, base(emptyOpt('Pas de données de récupération ou de charge'))); return; }
    const x0 = SD.tms(SD.S.from), x1 = SD.tms(SD.S.to) + SD.DAY - 1;
    const xa = (gi, show) => Object.assign(xTime({ min: x0, max: x1 }), { gridIndex: gi, axisLabel: { show, color: T.muted, hideOverlap: true, formatter: (v) => fdate(dstr(v), F.len <= 120 ? { day: 'numeric', month: 'short' } : { month: 'short', year: '2-digit' }) } });
    const c = chart(id, base({
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: [{ left: 44, right: 16, top: 26, height: '38%' }, { left: 44, right: 16, top: '60%', bottom: 26 }],
      tooltip: Object.assign(base().tooltip, { formatter: (ps) => { const v = ps && ps[0] && ps[0].value; return v ? SD.ui.dayTip(dstr(v[0]), 'Récupération (haut) et charge (bas) alignées') : ''; } }),
      title: [
        { text: 'RÉCUPÉRATION', left: 44, top: 4, textStyle: { color: T.muted, fontSize: 11, fontFamily: SD.FONT_C, fontWeight: 700 } },
        { text: 'CHARGE (0–100)', left: 44, top: '53%', textStyle: { color: T.muted, fontSize: 11, fontFamily: SD.FONT_C, fontWeight: 700 } },
      ],
      toolbox: SD.toolbox(),
      dataZoom: [{ type: 'inside', xAxisIndex: [0, 1], filterMode: 'none', zoomOnMouseWheel: 'shift', moveOnMouseMove: false }],
      xAxis: [xa(0, false), xa(1, true)],
      yAxis: [yVal({ gridIndex: 0, min: 0, max: 100, interval: 50 }), yVal({ gridIndex: 1, min: 0, max: 100, interval: 50 })],
      series: [
        { name: 'Récupération', type: 'bar', xAxisIndex: 0, yAxisIndex: 0, barMaxWidth: 12, data: days.filter((x) => isNum(x.rec)).map((x) => ({ value: [tms(x.d), x.rec], itemStyle: { color: SD.recColor(x.rec), borderRadius: [3, 3, 0, 0] } })) },
        { name: 'Charge', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, barMaxWidth: 12, data: days.filter((x) => isNum(x.strain)).map((x) => ({ value: [tms(x.d), x.strain], itemStyle: { color: T.strain, borderRadius: [3, 3, 0, 0], opacity: 0.9 } })) },
      ],
    }), () => ({ cols: ['Date', 'Récupération (%)', 'Charge'], rows: days.map((x) => [fdM(x.d), nf(x.rec, 0), nf(x.strain, 0)]) }));
    c && c.on('click', (p) => p.value && SD.openDay(dstr(p.value[0])));
  }

  SD.ui = { seg, card, setText, setHTML, segSync, ecLegend, drill, unitWeek, avgOf, prevDelta, dayTip, weightChart, typesChart, calendar, recStrainChart };
  SD.PAGES = {};
  SD.segSync = segSync;
})();
