/* Page « Force » : exercices clés, progression (tendance, moyenne, records), indice de force, force relative, volume musculaire. */
(function () {
  'use strict';
  const SD = window.SD;
  const { isNum, nf, sgn, fdM, fdS, fdL, esc, tms, dstr, pluck, sum, mean, linreg, chart, base, tipBox, xCat, yVal, line, spark, bucketKeys } = SD;
  const { card, seg, setHTML, setText } = SD.ui;

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
    for (const e of SD.F.exercises) { const k = e.n + '|' + e.s; (map.get(k) || map.set(k, []).get(k)).push(e); }
    const out = [];
    for (const [k, arr] of map) {
      arr.sort((a, b) => a.d.localeCompare(b.d));
      const e1 = arr.filter((e) => isNum(e.e1));
      const first = e1[0], last = e1[e1.length - 1];
      const best = e1.reduce((m, e) => (!m || e.e1 > m.e1 ? e : m), null);
      out.push({ key: k, n: arr[0].n, s: arr[0].s, count: arr.length, first: first ? first.e1 : null, last: last ? last.e1 : null,
        pct: first && last && e1.length >= 2 ? ((last.e1 - first.e1) / first.e1) * 100 : null, best: best ? best.e1 : null, bestD: best ? best.d : null,
        lastD: arr[arr.length - 1].d, spark: e1.map((e) => e.e1), prs: arr.filter((e) => e.pr).length });
    }
    return out;
  }
  function keyList(sumy) {
    const M = SD.M;
    let keys = [];
    for (const n of M.cfg.keyExercises || []) { const o = sumy.find((x) => x.n === n); if (o) keys.push(o); }
    if (keys.length < 4) for (const o of sumy.slice().sort((a, b) => b.count - a.count)) { if (keys.length >= 8) break; if (!keys.includes(o) && o.count >= 3) keys.push(o); }
    return keys.slice(0, 8);
  }

  const strength = {
    id: 'strength', title: 'Force', sub: 'Progression de tes exercices, records, force relative et volume par groupe musculaire.',
    html() {
      const S = SD.S;
      return `${card('c12', 'st-mult', 'Exercices clés', 'e1RM estimé sur la période · clic pour afficher la progression', '', { table: false, body: '<div class="multiples" id="st-mult-b"></div>' })}
        ${card('c8', 'st-prog', 'Progression', '', `<select class="fselect" id="st-ex" data-state="ex" aria-label="Exercice"></select>${seg('exMetric', EX_METRICS.map((m) => [m[0], m[1]]), S.exMetric)}`, { h: 'tall' })}
        <section class="card c4"><div class="card-h"><div><h2 id="st-card-t">Fiche exercice</h2><p class="sub" id="st-card-s"></p></div></div><div id="st-card-b"></div></section>
        ${card('c6', 'st-idx', 'Indice de force', 'e1RM de chaque exercice rapporté à ses 2 premières séances de la période (base 100), moyenne hebdomadaire')}
        ${card('c6', 'st-rel', 'Force relative', 'e1RM ÷ poids tendance du jour, exercices clés')}
        ${card('c6', 'st-pr', 'Records personnels', 'Nombre de records (e1RM au-dessus de tout l’historique de l’exercice) par mois')}
        ${card('c6', 'st-mus', 'Séries par muscle et par semaine', 'Groupes MacroFactor (séries fractionnées incluses) · bande = fourchette cible', '', { h: 'tall' })}
        ${card('c12', 'st-heat', 'Carte de chaleur des muscles', 'Séries par semaine et par groupe musculaire')}
        ${card('c12', 'st-tbl', 'Tous les exercices', 'Clic sur une ligne pour afficher la progression · clic sur un en-tête pour trier', '', { table: false, body: '<div class="tbl-wrap tbl-scroll" id="st-tbl-b"></div>' })}`;
    },
    update() {
      const { M, F, S, T } = SD, cfg = M.cfg.targets;
      const A = S.analysis;
      const sumy = exSummary();
      if (!S.ex || !sumy.some((o) => o.key === S.ex)) { const k0 = keyList(sumy)[0] || sumy.slice().sort((a, b) => b.count - a.count)[0]; S.ex = k0 ? k0.key : S.ex; }

      // ---- petits multiples
      const keys = keyList(sumy);
      setHTML('st-mult-b', keys.length ? keys.map((o) => `<button type="button" class="mult" data-ex="${esc(o.key)}" aria-pressed="${o.key === S.ex}"><span class="n" title="${esc(o.n)}">${esc(o.n)}</span><span class="v">${nf(o.last, 1)} kg</span><span class="n">${isNum(o.pct) ? `<span class="delta ${o.pct > 0.5 ? 'up-good' : o.pct < -0.5 ? 'down-bad' : 'flat'}">${sgn(o.pct, 1)} %</span> · ` : ''}${o.count} séances${o.prs ? ` · ${o.prs} PR` : ''}</span>${spark(o.spark, T.strain, 36)}</button>`).join('') : '<div class="empty">Aucun exercice détaillé sur la période. Les données par exercice couvrent févr. 2024 → avr. 2025 (TrainAI) et janv. 2026 → aujourd’hui (MacroFactor).</div>');
      document.querySelectorAll('#st-mult-b .mult').forEach((btn) => { btn.onclick = () => { S.ex = btn.dataset.ex; SD.refresh(); }; });

      // ---- sélecteur
      const sel = document.getElementById('st-ex');
      const bySrc = (s) => sumy.filter((o) => o.s === s).sort((a, b) => b.count - a.count || a.n.localeCompare(b.n));
      sel.innerHTML = ['MF', 'TA'].map((s) => { const l = bySrc(s); return l.length ? `<optgroup label="${srcLabel(s)}">${l.map((o) => `<option value="${esc(o.key)}"${o.key === S.ex ? ' selected' : ''}>${esc(o.n)} (${o.count})</option>`).join('')}</optgroup>` : ''; }).join('') || '<option>Aucun exercice</option>';

      // ---- progression
      const [mk, ml, mu, md] = exMeta(S.exMetric);
      const rows = S.ex ? exRows(S.ex) : [];
      const pts = rows.filter((e) => isNum(e[mk]));
      const exName = S.ex ? S.ex.split('|')[0] : '';
      setText('st-prog-t', exName ? `Progression · ${exName}` : 'Progression');
      let slopeTxt = '';
      const series = [];
      const legend = [ml];
      if (pts.length) {
        series.push(line(ml, pts.map((e) => [tms(e.d), e[mk]]), T.strain, { showSymbol: true, symbolSize: 8, lineStyle: { width: 2, color: T.strain },
          markPoint: mk === 'e1' ? { symbol: 'pin', symbolSize: 32, itemStyle: { color: T.good }, label: { color: '#0a0d11', fontSize: 9.5, fontWeight: 700, formatter: 'PR' }, data: pts.filter((e) => e.pr).map((e) => ({ coord: [tms(e.d), e[mk]], value: e[mk] })) } : undefined }));
        if (A.ma7 && pts.length >= 3) {
          series.push(line('Moyenne 3 séances', pts.map((e, i) => [tms(e.d), mean(pts.slice(Math.max(0, i - 2), i + 1).map((q) => q[mk]))]), T.ink2, { lineStyle: { width: 1.5, color: T.ink2 } }));
          legend.push('Moyenne 3 séances');
        }
        if (pts.length >= 3) {
          const x0 = tms(pts[0].d);
          const xs = pts.map((e) => (tms(e.d) - x0) / SD.DAY), ys = pts.map((e) => e[mk]);
          const { a, b } = linreg(xs, ys);
          series.push(line('Tendance', [[x0, a], [tms(pts[pts.length - 1].d), a + b * xs[xs.length - 1]]], T.ink, { lineStyle: { width: 1.5, type: [6, 4], color: T.ink }, tooltip: { show: false } }));
          legend.push('Tendance');
          slopeTxt = ` · tendance ${sgn(b * 30, md || 1)}${mu ? ' ' + mu : ''} / mois`;
        }
        if (A.minmax) series[0].markLine = { silent: true, symbol: 'none', lineStyle: { color: T.muted, type: 'solid' }, label: { color: T.muted, fontSize: 11, formatter: (p) => `moy. ${nf(p.value, md)}` }, data: [{ type: 'average' }] };
      }
      setText('st-prog-s', `${ml}${mu ? ' (' + mu + ')' : ''} par séance · ${srcLabel((S.ex || '|MF').split('|')[1])}${slopeTxt}`);
      const pc = chart('st-prog', pts.length ? base({
        grid: { left: 8, right: 16, top: 34, bottom: 8, containLabel: true },
        legend: Object.assign(SD.ui.ecLegend(T, legend), { left: 0, right: 'auto' }),
        toolbox: SD.toolbox(), dataZoom: SD.zoom(),
        tooltip: Object.assign(base().tooltip, {
          formatter: (ps) => {
            const p = ps.find((q) => q.seriesName === ml);
            if (!p) return '';
            const e = rows.find((r) => tms(r.d) === p.value[0]);
            const r = [];
            for (const [k2, l2, u2, d2] of EX_METRICS) if (e && isNum(e[k2])) r.push({ color: k2 === mk ? T.strain : T.axis, value: nf(e[k2], d2) + (u2 ? ' ' + u2 : ''), name: l2 });
            const tw = M.at(e.d);
            if (e && isNum(e.e1) && tw && isNum(tw.trendW)) r.push({ color: T.body, value: nf(e.e1 / tw.trendW, 2) + ' × PDC', name: 'force relative' });
            return tipBox(fdL(e.d) + (e.pr ? ' · record' : ''), r, e && e.s === 'TA' ? 'e1RM TrainAI : formule d’Epley sur la meilleure série' : 'e1RM calculé par MacroFactor');
          },
        }),
        xAxis: SD.xTime(), yAxis: yVal({ scale: true, name: mu }),
        series,
      }) : base(SD.emptyOpt('Pas de donnée pour cet exercice sur la période')), () => ({ cols: ['Date', ...EX_METRICS.map((m) => m[1]), 'Record'], rows: rows.map((e) => [fdM(e.d), ...EX_METRICS.map((m) => nf(e[m[0]], m[3])), e.pr ? 'oui' : '']) }));
      pc && pc.on('click', (p) => p.value && SD.openDay(dstr(p.value[0])));

      // ---- fiche
      const o = sumy.find((x) => x.key === S.ex);
      const notes = M.raw.notes.filter((nn) => nn.ex && exName && nn.ex.toLowerCase() === exName.toLowerCase());
      const allPr = M.raw.exercises.filter((e) => e.pr && e.n + '|' + e.s === S.ex).slice(-6).reverse();
      setText('st-card-t', exName || 'Fiche exercice');
      setText('st-card-s', o ? `${srcLabel(o.s)} · ${o.count} séances sur la période` : '');
      const hw = pluck(rows, (e) => e.hw);
      setHTML('st-card-b', o ? `<div class="dgrid">
          <div class="dstat"><div class="l">Meilleur e1RM</div><div class="v">${nf(o.best, 1)} kg</div><div class="l">${o.bestD ? esc(fdM(o.bestD)) : ''}</div></div>
          <div class="dstat"><div class="l">Dernier e1RM</div><div class="v">${nf(o.last, 1)} kg</div><div class="l">${esc(fdM(o.lastD))}</div></div>
          <div class="dstat"><div class="l">Évolution période</div><div class="v"><span class="delta ${isNum(o.pct) ? (o.pct > 0.5 ? 'up-good' : o.pct < -0.5 ? 'down-bad' : 'flat') : 'flat'}">${isNum(o.pct) ? sgn(o.pct, 1) + ' %' : '—'}</span></div><div class="l">1re → dernière séance</div></div>
          <div class="dstat"><div class="l">Charge max</div><div class="v">${hw.length ? nf(Math.max(...hw), 1) + ' kg' : '—'}</div><div class="l">sur la période</div></div>
          <div class="dstat"><div class="l">Séries / séance</div><div class="v">${nf(mean(pluck(rows, (e) => e.sets)), 1)}</div><div class="l">moyenne</div></div>
          <div class="dstat"><div class="l">Volume / séance</div><div class="v">${nf(mean(pluck(rows, (e) => e.vol)), 0)} kg</div><div class="l">moyenne</div></div>
        </div>
        <h3 style="margin:16px 0 6px;font:700 12.5px/1 var(--font-c);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">Derniers records (${allPr.length})</h3>
        ${allPr.length ? `<div>${allPr.map((e) => `<div class="statline"><span>${esc(fdM(e.d))}</span><b style="color:var(--good)">${nf(e.e1, 1)} kg</b></div>`).join('')}</div>` : '<p class="note">Pas encore de record enregistré.</p>'}
        <h3 style="margin:16px 0 6px;font:700 12.5px/1 var(--font-c);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">Notes de séance (${notes.length})</h3>
        ${notes.length ? `<ul style="margin:0;padding-left:18px;font-size:13px;color:var(--ink-2);max-height:180px;overflow:auto">${notes.slice().reverse().map((nn) => `<li><b>${esc(fdS(nn.d))}</b> · ${esc(nn.text)}</li>`).join('')}</ul>` : '<p class="note">Aucune note pour cet exercice.</p>'}` : '<div class="empty">Sélectionne un exercice.</div>');

      // ---- indice de force
      const si = SD.scores.strengthIndex(F.exercises);
      chart('st-idx', si.series.length >= 2 ? base({
        grid: { left: 8, right: 16, top: 18, bottom: 8, containLabel: true },
        toolbox: SD.toolbox(), dataZoom: SD.zoom(),
        tooltip: Object.assign(base().tooltip, { formatter: (ps) => { const p = ps[0]; const it = si.series[p.dataIndex]; return tipBox(`Semaine du ${fdM(dstr(p.value[0]))}`, [{ color: T.strain, value: nf(p.value[1], 1), name: 'indice' }], `${it ? it.n : ''} mesures d’exercices cette semaine`); } }),
        xAxis: SD.xTime(), yAxis: yVal({ scale: true }),
        series: [line('Indice', si.series.map((p) => [tms(p.w), +p.v.toFixed(1)]), T.strain, { showSymbol: true, symbolSize: 6, areaStyle: { color: T.strain, opacity: 0.1 }, markLine: { silent: true, symbol: 'none', lineStyle: { color: T.axis, type: 'solid' }, label: { color: T.muted, formatter: 'base 100', position: 'insideEndTop', fontSize: 11 }, data: [{ yAxis: 100 }] } })],
      }) : base(SD.emptyOpt('Pas assez d’exercices répétés sur la période')), () => ({ cols: ['Semaine', 'Indice', 'Mesures'], rows: si.series.map((p) => [fdM(p.w), nf(p.v, 1), p.n]) }));

      // ---- force relative
      const relKeys = keys.slice(0, 4);
      const relSeries = relKeys.map((ko, i) => {
        const [n, s] = ko.key.split('|');
        const data = F.exercises.filter((e) => e.n === n && e.s === s && isNum(e.e1)).map((e) => { const tw = M.at(e.d); return tw && isNum(tw.trendW) ? [tms(e.d), +(e.e1 / tw.trendW).toFixed(3)] : null; }).filter(Boolean);
        return line(n, data, T.s[i], { showSymbol: true, symbolSize: 5 });
      }).filter((s2) => s2.data.length);
      chart('st-rel', relSeries.length ? base({
        grid: { left: 8, right: 16, top: 50, bottom: 8, containLabel: true },
        legend: Object.assign(SD.ui.ecLegend(T, relSeries.map((s2) => s2.name)), { left: 0, right: 96, type: 'scroll' }),
        tooltip: Object.assign(base().tooltip, { formatter: SD.axisTip(Object.fromEntries(relSeries.map((s2) => [s2.name, (v) => nf(v, 2) + ' × poids de corps']))) }),
        toolbox: SD.toolbox(), dataZoom: SD.zoom(),
        xAxis: SD.xTime(), yAxis: yVal({ scale: true, name: '× PDC' }),
        series: relSeries,
      }) : base(SD.emptyOpt('Pas d’e1RM et de poids sur les mêmes jours')), () => ({ cols: ['Exercice', 'Dernière valeur (× PDC)'], rows: relSeries.map((s2) => [s2.name, nf(s2.data[s2.data.length - 1][1], 2)]) }));

      // ---- records par mois
      const mk2 = bucketKeys('month');
      const prCount = mk2.map((m) => F.exercises.filter((e) => e.pr && e.d.slice(0, 7) === m.slice(0, 7)).length);
      chart('st-pr', prCount.some((v) => v) ? base({
        grid: { left: 8, right: 14, top: 16, bottom: 8, containLabel: true },
        tooltip: Object.assign(base().tooltip, { axisPointer: { type: 'shadow' }, formatter: (ps) => { const m = mk2[ps[0].dataIndex]; const list = F.exercises.filter((e) => e.pr && e.d.slice(0, 7) === m.slice(0, 7)); return tipBox(SD.fdate(m, { month: 'long', year: 'numeric' }), list.slice(0, 8).map((e) => ({ color: T.good, value: nf(e.e1, 1) + ' kg', name: e.n })), list.length > 8 ? `+ ${list.length - 8} autres` : null); } }),
        xAxis: xCat(mk2.map((m) => SD.fdate(m, { month: 'short', year: '2-digit' }))), yAxis: yVal({ minInterval: 1 }),
        series: [SD.bar('Records', prCount, T.good)],
      }) : base(SD.emptyOpt('Aucun record sur la période')), () => ({ cols: ['Mois', 'Records'], rows: mk2.map((m, i) => [SD.fdate(m, { month: 'long', year: 'numeric' }), prCount[i]]) }));

      // ---- séries par muscle
      const wks = Math.max(1, F.len / 7);
      const tot = new Map();
      for (const m of F.muscles) tot.set(m.m, (tot.get(m.m) || 0) + (m.sets || 0));
      const mus = [...tot.entries()].map(([m, v]) => ({ m, v: v / wks })).filter((q) => q.v > 0).sort((a, b) => b.v - a.v);
      const [lo, hi] = cfg.setsPerMuscleWeek;
      const musEl = document.getElementById('st-mus');
      if (musEl) musEl.style.height = Math.max(260, mus.length * 22 + 40) + 'px';
      chart('st-mus', mus.length ? base({
        grid: { left: 16, right: 40, top: 6, bottom: 6, containLabel: true },
        tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => tipBox(p.name, [{ color: T.strain, box: true, value: nf(p.value, 1), name: 'séries / semaine' }], `Cible ${lo}–${hi}`) }),
        xAxis: yVal({ splitLine: { show: false } }),
        yAxis: xCat(mus.map((q) => q.m), { inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 12 } }),
        series: [{ type: 'bar', barMaxWidth: 13, data: mus.map((q) => ({ value: +q.v.toFixed(1), itemStyle: { color: q.v < lo ? T.warn : q.v > hi ? T.body : T.strain, borderRadius: [0, 4, 4, 0] } })),
          label: { show: true, position: 'right', color: T.ink2, fontSize: 11, formatter: (p) => nf(p.value, 1) },
          markArea: { silent: true, itemStyle: { color: 'rgba(30,215,135,0.07)' }, label: { show: true, position: 'insideTop', color: T.muted, fontSize: 10.5, formatter: `cible ${lo}–${hi}` }, data: [[{ xAxis: lo }, { xAxis: hi }]] } }],
      }) : base(SD.emptyOpt('Données par muscle : MacroFactor, depuis janv. 2026')), () => ({ cols: ['Muscle', 'Séries / semaine'], rows: mus.map((q) => [q.m, nf(q.v, 1)]) }));
      if (SD.charts.get('st-mus')) SD.charts.get('st-mus').resize();

      // ---- carte de chaleur
      const wkeys = bucketKeys('week');
      const mlist = mus.map((q) => q.m);
      const hm = new Map();
      for (const m of F.muscles) { const k2 = SD.weekOf(m.d) + '|' + m.m; hm.set(k2, (hm.get(k2) || 0) + (m.sets || 0)); }
      const hdata = [];
      wkeys.forEach((w, i) => mlist.forEach((m, j) => { const v = hm.get(w + '|' + m); if (v) hdata.push([i, j, +v.toFixed(1)]); }));
      const heatEl = document.getElementById('st-heat');
      if (heatEl) heatEl.style.height = Math.max(200, mlist.length * 20 + 70) + 'px';
      const hv = hdata.map((p) => p[2]);
      chart('st-heat', hdata.length ? base({
        grid: { left: 16, right: 10, top: 36, bottom: 6, containLabel: true },
        tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => tipBox(`${mlist[p.value[1]]} · semaine du ${fdM(wkeys[p.value[0]])}`, [{ color: T.strain, box: true, value: nf(p.value[2], 1), name: 'séries' }]) }),
        xAxis: xCat(wkeys.map((w) => fdS(w)), { axisLine: { show: false } }),
        yAxis: xCat(mlist, { inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 11.5 } }),
        visualMap: { min: 0, max: Math.max(hi, ...hv), orient: 'horizontal', right: 0, top: 0, itemWidth: 10, itemHeight: 110, calculable: false, text: [nf(Math.max(hi, ...hv), 0), '0'], textStyle: { color: T.muted, fontSize: 11 }, inRange: { color: [T.seq[0], T.seq[2], T.seq[3], T.seq[4], T.seq[5]] } },
        series: [{ type: 'heatmap', data: hdata, itemStyle: { borderColor: T.card, borderWidth: 2, borderRadius: 3 } }],
      }) : base(SD.emptyOpt('Données par muscle : MacroFactor, depuis janv. 2026')), () => ({ cols: ['Muscle', ...wkeys.map((w) => fdS(w))], rows: mlist.map((m) => [m, ...wkeys.map((w) => nf(hm.get(w + '|' + m) || 0, 1))]) }));
      if (SD.charts.get('st-heat')) SD.charts.get('st-heat').resize();

      // ---- tableau
      const sorted = sumy.slice().sort((a, b) => {
        const va = a[exSort.k], vb = b[exSort.k];
        if (typeof va === 'string') return exSort.dir * va.localeCompare(vb);
        return exSort.dir * ((isNum(va) ? va : -Infinity) - (isNum(vb) ? vb : -Infinity));
      });
      const th = (k, l, num) => `<th class="${num ? 'num' : ''}" data-sort="${k}">${l}${exSort.k === k ? (exSort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
      setHTML('st-tbl-b', sorted.length ? `<table class="t"><thead><tr>${th('n', 'Exercice')}${th('s', 'Source')}${th('count', 'Séances', 1)}${th('first', '1er e1RM', 1)}${th('last', 'Dernier e1RM', 1)}${th('pct', 'Évolution', 1)}${th('best', 'Meilleur', 1)}${th('prs', 'PR', 1)}${th('lastD', 'Dernière séance', 1)}<th>Tendance</th></tr></thead><tbody>${sorted.map((q) =>
        `<tr class="clickable${q.key === S.ex ? ' sel' : ''}" data-ex="${esc(q.key)}"><td>${esc(q.n)}</td><td>${srcLabel(q.s)}</td><td class="num">${q.count}</td><td class="num">${nf(q.first, 1)}</td><td class="num">${nf(q.last, 1)}</td><td class="num"><span class="delta ${isNum(q.pct) ? (q.pct > 0.5 ? 'up-good' : q.pct < -0.5 ? 'down-bad' : 'flat') : 'flat'}">${isNum(q.pct) ? sgn(q.pct, 1) + ' %' : '—'}</span></td><td class="num">${nf(q.best, 1)}</td><td class="num">${q.prs || ''}</td><td class="num">${esc(fdM(q.lastD))}</td><td><div class="mini-spark">${spark(q.spark, T.strain, 22)}</div></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Aucun exercice détaillé sur la période.</div>');
      document.querySelectorAll('#st-tbl-b th[data-sort]').forEach((h) => { h.onclick = () => { exSort = { k: h.dataset.sort, dir: exSort.k === h.dataset.sort ? -exSort.dir : -1 }; strength.update(); }; });
      document.querySelectorAll('#st-tbl-b tr[data-ex]').forEach((tr) => { tr.onclick = () => { S.ex = tr.dataset.ex; SD.refresh(); document.getElementById('st-prog').scrollIntoView({ behavior: 'smooth', block: 'center' }); }; });
    },
  };

  SD.PAGES.strength = strength;
})();
