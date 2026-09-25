/* Page « Récupération » : score, zones, facteurs, HRV / FC / respiration / SpO₂ avec plage normale, sommeil, corrélations, alertes. */
(function () {
  'use strict';
  const SD = window.SD;
  const { isNum, nf, sgn, fH, fHM, fdM, fdL, esc, tms, dstr, addD, pluck, mean, sd, pearson, linreg, chart, base, tipBox, axisTip, xCat, yVal, bar, line, kpi, statusPill, METRICS, pairs, rWord, ts } = SD;
  const { card, seg, setHTML, setText, avgOf, prevDelta } = SD.ui;

  const MATRIX_KEYS = ['rec', 'strain', 'sleepH', 'hrv', 'rhr', 'resp', 'steps', 'strMin', 'kcal', 'prot', 'caffeine', 'trendD7'];

  const recovery = {
    id: 'recovery', title: 'Récupération', sub: 'Ton système nerveux, ton sommeil et tes signaux physiologiques, comparés à ta propre norme.',
    html() {
      const S = SD.S;
      const opts = Object.entries(METRICS).map(([k, m]) => [k, m.label]);
      const sel = (key) => `<select class="fselect" data-state="${key}" aria-label="Variable">${opts.map(([k, l]) => `<option value="${k}"${k === S[key] ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
      return `<div class="kpis" id="rc-k"></div>
        ${card('c12', 'rc-rec', 'Score de récupération', 'HRV 45 %, FC repos 30 %, sommeil 15 %, respiration 10 %, chacun comparé à ta norme des 30 jours précédents · Maj + molette pour zoomer', '', { h: 'tall' })}
        ${card('c6', 'rc-zones', 'Répartition des zones', '')}
        ${card('c6', 'rc-drv', 'Ce qui pèse sur ta récupération', 'Écart moyen de chaque composante à ta norme, dans le sens favorable (σ)')}
        ${card('c6', 'rc-hrv', 'HRV', 'Milieu de la plage min–max du jour (indicatif) · bande = plage normale')}
        ${card('c6', 'rc-rhr', 'FC au repos', 'Valeur la plus basse du jour · bande = plage normale')}
        ${card('c6', 'rc-resp', 'Fréquence respiratoire', 'Respirations / min · bande = plage normale')}
        ${card('c6', 'rc-spo2', 'Saturation en oxygène', 'SpO₂ moyenne du jour')}
        ${card('c6', 'rc-sleep', 'Sommeil vs besoin', 'Durée par nuit (jour du réveil) et besoin estimé')}
        ${card('c6', 'rc-debt', 'Dette & régularité', 'Dette de sommeil sur 7 nuits (h) et régularité (0–100)')}
        ${card('c6', 'rc-xy', 'Explorateur de corrélations', '', `${sel('corrX')}<span class="fsummary">→</span>${sel('corrY')}${seg('corrLag', [['0', 'même jour'], ['1', 'lendemain']], S.corrLag)}`, { h: 'tall' })}
        ${card('c6', 'rc-mx', 'Matrice de corrélations', 'r de Pearson, même jour · clic sur une case pour l’explorer', '', { h: 'tall' })}
        ${card('c6', 'rc-cmp', 'Jours de muscu vs jours sans', 'Lendemain = nuit et mesures du jour suivant', '', { table: false, body: '<div class="tbl-wrap" id="rc-cmp-b"></div>' })}
        ${card('c6', 'rc-al', 'Alertes physiologiques', 'Jours où FC repos, HRV ou respiration sortent de ta norme de plus de 2 σ', '', { table: false, body: '<div class="alerts" id="rc-al-b"></div>' })}`;
    },
    update() {
      const { M, F, S, T } = SD, cfg = M.cfg.targets;
      const g = SD.gran(), keys = SD.bucketKeys(g);
      // ---- KPI
      const rec = avgOf(F.full, (x) => x.rec), pRec = avgOf(F.prevFull, (x) => x.rec);
      const recs = pluck(F.full, (x) => x.rec);
      const perf = avgOf(F.full, (x) => x.sleepPerf), pPerf = avgOf(F.prevFull, (x) => x.sleepPerf);
      const sl = avgOf(F.full, (x) => x.sleepH);
      const hrv = avgOf(F.full, (x) => x.hrv), pHrv = avgOf(F.prevFull, (x) => x.hrv);
      const rhr = avgOf(F.full, (x) => x.rhr), pRhr = avgOf(F.prevFull, (x) => x.rhr);
      const resp = avgOf(F.full, (x) => x.resp), pResp = avgOf(F.prevFull, (x) => x.resp);
      const wk = (f) => SD.agg(F.days, (x) => x.d, f, 'mean', 'week').map((o) => o.v);
      setHTML('rc-k', [
        kpi({ label: 'Récupération', value: rec, unit: '%', delta: prevDelta(rec, pRec), deltaDigits: 0, good: 'up', status: ' ' + statusPill(rec, 67, 34, ['Verte', 'Jaune', 'Rouge']), ctx: recs.length ? `${nf((recs.filter((v) => v >= 67).length / recs.length) * 100, 0)} % des jours en vert` : '', spark: wk((x) => x.rec), color: T.rec }),
        kpi({ label: 'Performance sommeil', value: perf, unit: '%', delta: prevDelta(perf, pPerf), deltaDigits: 0, good: 'up', ctx: `${fH(sl)} en moyenne`, spark: wk((x) => x.sleepPerf), color: T.sleep }),
        kpi({ label: 'HRV (indicative)', value: hrv, unit: 'ms', delta: prevDelta(hrv, pHrv), deltaDigits: 0, good: 'up', spark: wk((x) => x.hrv), color: T.rec }),
        kpi({ label: 'FC au repos', value: rhr, unit: 'bpm', delta: prevDelta(rhr, pRhr), good: 'down', spark: wk((x) => x.rhr), color: T.crit }),
        kpi({ label: 'Respiration', value: resp, unit: '/min', digits: 1, delta: prevDelta(resp, pResp), deltaDigits: 1, good: 'down', spark: wk((x) => x.resp), color: T.act }),
      ].join(''));

      // ---- score
      ts('rc-rec', { name: 'Récupération', get: (x) => x.rec, color: T.rec, unit: '%', type: 'bar', colorOf: (x) => SD.recColor(x.rec), yExtra: { min: 0, max: 100 },
        foot: (x) => (x.recC ? `Composantes (σ, sens favorable) : HRV ${isNum(x.recC.hrv) ? sgn(x.recC.hrv, 1) : '—'} · FC repos ${isNum(x.recC.rhr) ? sgn(x.recC.rhr, 1) : '—'} · respiration ${isNum(x.recC.resp) ? sgn(x.recC.resp, 1) : '—'} · sommeil ${isNum(x.recC.sleep) ? sgn(x.recC.sleep, 1) : '—'}` : ''),
        onDay: SD.openDay, markLines: [{ yAxis: 67, lineStyle: { color: T.good, opacity: 0.5, type: 'solid' }, label: { formatter: '67', color: T.muted, fontSize: 10 } }, { yAxis: 34, lineStyle: { color: T.crit, opacity: 0.5, type: 'solid' }, label: { formatter: '34', color: T.muted, fontSize: 10 } }] });

      // ---- zones (une part par jour n'a pas de sens : au minimum par semaine)
      const gz = g === 'day' ? 'week' : g, kz = SD.bucketKeys(gz);
      const z = kz.map((k) => {
        const end = SD.bucketEnd(k, gz);
        const v = F.full.filter((x) => x.d >= k && x.d <= end).map((x) => x.rec).filter(isNum);
        return { k, n: v.length, g: v.filter((a) => a >= 67).length, y: v.filter((a) => a >= 34 && a < 67).length, r: v.filter((a) => a < 34).length };
      });
      const pct = (o, f) => (o.n ? Math.round((o[f] / o.n) * 100) : null);
      setText('rc-zones-s', `Part des jours en zone verte, jaune et rouge par ${SD.granUnit(gz)}`);
      chart('rc-zones', base({
        grid: { left: 8, right: 14, top: 30, bottom: 8, containLabel: true },
        legend: SD.ui.ecLegend(T, ['Verte', 'Jaune', 'Rouge']),
        tooltip: Object.assign(base().tooltip, { axisPointer: { type: 'shadow' }, formatter: (ps) => { const o = z[ps[0].dataIndex]; return tipBox(SD.bucketTitle(o.k, gz), [{ color: T.good, box: true, value: `${o.g} j`, name: 'verte' }, { color: T.warn, box: true, value: `${o.y} j`, name: 'jaune' }, { color: T.crit, box: true, value: `${o.r} j`, name: 'rouge' }]); } }),
        xAxis: xCat(kz.map((k) => SD.bucketLabel(k, gz))), yAxis: yVal({ max: 100, axisLabel: { color: T.muted, formatter: '{value} %' } }),
        series: [['Verte', 'g', T.good], ['Jaune', 'y', T.warn], ['Rouge', 'r', T.crit]].map(([n, f, c], i) => bar(n, z.map((o) => pct(o, f)), c, { stack: 'z', itemStyle: { color: c, borderColor: T.card, borderWidth: 1, borderRadius: i === 2 ? [3, 3, 0, 0] : 0 } })),
      }), () => ({ cols: ['Période', 'Verte', 'Jaune', 'Rouge'], rows: z.map((o) => [SD.bucketTitle(o.k, gz), o.g, o.y, o.r]) }));

      // ---- facteurs
      const comp = [['hrv', 'HRV'], ['rhr', 'FC repos'], ['resp', 'Respiration'], ['sleep', 'Sommeil']].map(([k, l]) => ({ l, v: mean(pluck(F.full, (x) => (x.recC ? x.recC[k] : null))), n: pluck(F.full, (x) => (x.recC ? x.recC[k] : null)).length }));
      chart('rc-drv', base({
        grid: { left: 16, right: 40, top: 10, bottom: 8, containLabel: true },
        tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => tipBox(p.name, [{ color: p.value >= 0 ? T.good : T.crit, box: true, value: sgn(p.value, 2) + ' σ', name: p.value >= 0 ? 'meilleur que ta norme' : 'moins bon que ta norme' }], `${comp[p.dataIndex].n} jours`) }),
        xAxis: yVal({ min: -1.5, max: 1.5, axisLabel: { color: T.muted, formatter: (v) => sgn(v, 1) } }),
        yAxis: xCat(comp.map((c) => c.l), { inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 12.5 } }),
        series: [{ type: 'bar', barMaxWidth: 18, data: comp.map((c) => ({ value: isNum(c.v) ? +c.v.toFixed(2) : null, itemStyle: { color: c.v >= 0 ? T.good : T.crit, borderRadius: c.v >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })), label: { show: true, position: 'right', color: T.ink2, formatter: (p) => sgn(p.value, 2) } }],
      }), () => ({ cols: ['Composante', 'Écart moyen (σ)', 'Jours'], rows: comp.map((c) => [c.l, sgn(c.v, 2), c.n]) }));

      // ---- biomarqueurs
      ts('rc-hrv', { name: 'HRV', get: (x) => x.hrv, color: T.rec, unit: 'ms', digits: 0, baseKey: 'hrv', onDay: SD.openDay });
      ts('rc-rhr', { name: 'FC repos', get: (x) => x.rhr, color: T.crit, unit: 'bpm', digits: 0, baseKey: 'rhr', onDay: SD.openDay });
      ts('rc-resp', { name: 'Respiration', get: (x) => x.resp, color: T.act, unit: '/min', digits: 1, baseKey: 'resp', onDay: SD.openDay });
      ts('rc-spo2', { name: 'SpO₂', get: (x) => x.spo2, color: T.s[0], unit: '%', digits: 1, baseKey: 'spo2', onDay: SD.openDay, markLines: [{ yAxis: 95, lineStyle: { color: T.muted, type: 'solid' }, label: { formatter: '95 %', color: T.muted, fontSize: 10 } }] });
      ts('rc-sleep', { name: 'Sommeil', get: (x) => x.sleepH, color: T.sleep, unit: 'h', digits: 1, type: 'bar', baseKey: 'sleepH', fmt: fH, onDay: SD.openDay, yExtra: { min: 0 },
        extra: [line('Besoin', SD.series(F.full, (x) => x.sleepNeed, 3), T.ink2, { lineStyle: { width: 1.5, color: T.ink2 } })], fmtFor: { Besoin: fH, 'Moyenne 7 j': fH, 'Moyenne 28 j': fH },
        foot: (x) => (isNum(x.sleepPerf) ? `Performance ${nf(x.sleepPerf, 0)} % du besoin` : '') });
      const debt = SD.series(F.full, (x) => x.sleepDebt7, 3), cons = SD.series(F.full, (x) => x.sleepCons, 3);
      chart('rc-debt', debt.length ? base({
        axisPointer: { link: [{ xAxisIndex: 'all' }] },
        grid: [{ left: 44, right: 14, top: 26, height: '36%' }, { left: 44, right: 14, top: '62%', bottom: 24 }],
        title: [{ text: 'DETTE 7 NUITS (H)', left: 44, top: 4, textStyle: { color: T.muted, fontSize: 11, fontFamily: SD.FONT_C } }, { text: 'RÉGULARITÉ (0–100)', left: 44, top: '52%', textStyle: { color: T.muted, fontSize: 11, fontFamily: SD.FONT_C } }],
        tooltip: Object.assign(base().tooltip, { formatter: axisTip({ Dette: fH, 'Régularité': (v) => nf(v, 0) + ' / 100' }) }),
        xAxis: [Object.assign(SD.xTime(), { gridIndex: 0, axisLabel: { show: false } }), Object.assign(SD.xTime(), { gridIndex: 1 })],
        yAxis: [yVal({ gridIndex: 0, min: 0 }), yVal({ gridIndex: 1, min: 0, max: 100 })],
        series: [line('Dette', debt, T.sleep, { xAxisIndex: 0, yAxisIndex: 0, areaStyle: { color: T.sleep, opacity: 0.12 } }), line('Régularité', cons, T.act, { xAxisIndex: 1, yAxisIndex: 1 })],
      }) : base(SD.emptyOpt()), () => ({ cols: ['Date', 'Dette 7 nuits', 'Régularité'], rows: F.full.filter((x) => isNum(x.sleepDebt7)).map((x) => [fdM(x.d), fH(x.sleepDebt7), nf(x.sleepCons, 0)]) }));

      // ---- explorateur
      const lag = +S.corrLag || 0;
      const { xs, ys, ds } = pairs(F.days, S.corrX, S.corrY, lag);
      const mx = METRICS[S.corrX], my = METRICS[S.corrY];
      const r = pearson(xs, ys);
      let sub = `${mx.label} (jour J) → ${my.label} (${lag ? 'J+1' : 'jour J'})`;
      const xyOpt = xs.length >= 5 ? (() => {
        const { a, b } = linreg(xs, ys);
        const x0 = Math.min(...xs), x1 = Math.max(...xs);
        // lecture en clair : effet d'un pas « parlant » de X (1 unité, 100 ou 1 000 selon l'échelle) et part de variation expliquée
        const span = x1 - x0, stepX = span > 5000 ? 1000 : span > 500 ? 100 : span > 50 ? 10 : 1;
        sub = `À retenir : chaque +${nf(stepX, 0)} ${mx.unit || ''} de ${mx.label.toLowerCase()} va avec ${sgn(b * stepX, Math.abs(b * stepX) < 1 ? 2 : 1)} ${my.unit || ''} de ${my.label.toLowerCase()} ${lag ? 'le lendemain' : 'le même jour'} · lien ${rWord(r)} (r = ${nf(r, 2)}, ${xs.length} jours), qui explique ${nf(r * r * 100, 0)} % des variations. Un lien n’est pas une cause.`;
        return base({
          grid: { left: 8, right: 18, top: 18, bottom: 24, containLabel: true },
          tooltip: Object.assign(base().tooltip, { trigger: 'item', axisPointer: { type: 'cross' }, formatter: (p) => (p.seriesName === 'Jours' ? tipBox(fdL(ds[p.dataIndex]), [{ color: T.strain, value: nf(p.value[0], mx.d) + ' ' + mx.unit, name: mx.label }, { color: T.strain, value: nf(p.value[1], my.d) + ' ' + my.unit, name: my.label + (lag ? ' (lendemain)' : '') }], 'Clic pour le détail du jour') : '') }),
          xAxis: yVal({ scale: true, name: mx.label + (mx.unit ? ` (${mx.unit})` : ''), nameLocation: 'middle', nameGap: 26, splitLine: { show: false }, axisLine: { show: true, lineStyle: { color: T.axis } } }),
          yAxis: yVal({ scale: true, name: my.label + (my.unit ? ` (${my.unit})` : '') }),
          series: [
            { name: 'Jours', type: 'scatter', data: xs.map((v, i) => [v, ys[i]]), symbolSize: 8, itemStyle: { color: T.strain, opacity: 0.55, borderColor: T.card, borderWidth: 1 } },
            { name: 'Régression', type: 'line', data: [[x0, a + b * x0], [x1, a + b * x1]], showSymbol: false, lineStyle: { color: T.ink, width: 2 }, tooltip: { show: false }, silent: true },
          ],
        });
      })() : base(SD.emptyOpt('Pas assez de jours avec ces deux mesures'));
      setText('rc-xy-s', sub + ' · corrélation ≠ causalité');
      const xc = chart('rc-xy', xyOpt, () => ({ cols: ['Date', mx.label, my.label + (lag ? ' (J+1)' : '')], rows: xs.map((v, i) => [fdM(ds[i]), nf(v, mx.d), nf(ys[i], my.d)]) }));
      xc && xc.on('click', (p) => p.seriesName === 'Jours' && SD.openDay(ds[p.dataIndex]));

      // ---- matrice
      const cells = [];
      MATRIX_KEYS.forEach((kx, i) => MATRIX_KEYS.forEach((ky, j) => {
        if (i === j) return;
        const pr = pairs(F.days, kx, ky, 0);
        const rr = pearson(pr.xs, pr.ys);
        cells.push([i, j, isNum(rr) && pr.xs.length >= 10 ? +rr.toFixed(2) : '-', pr.xs.length]);
      }));
      const labs = MATRIX_KEYS.map((k) => METRICS[k].label.replace(' (indicative)', ''));
      const mc = chart('rc-mx', base({
        grid: { left: 16, right: 8, top: 8, bottom: 44, containLabel: true },
        tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => tipBox(`${labs[p.value[0]]} × ${labs[p.value[1]]}`, [{ color: isNum(p.value[2]) ? (p.value[2] >= 0 ? T.divPos : T.divNeg) : T.axis, box: true, value: isNum(p.value[2]) ? `r = ${nf(p.value[2], 2)}` : 'n < 10', name: isNum(p.value[2]) ? rWord(p.value[2]) : '' }], `n = ${p.value[3]} jours · clic pour explorer`) }),
        xAxis: xCat(labs, { axisLabel: { color: T.ink2, rotate: 40, fontSize: 11, interval: 0 }, axisLine: { show: false } }),
        yAxis: xCat(labs, { inverse: true, axisLabel: { color: T.ink2, fontSize: 11, interval: 0 }, axisLine: { show: false } }),
        visualMap: { show: true, min: -1, max: 1, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 10, itemHeight: 140, calculable: false, text: ['+1', '−1'], textStyle: { color: T.muted, fontSize: 11 }, inRange: { color: [T.divNeg, T.divMid, T.divPos] }, dimension: 2 },
        series: [{ type: 'heatmap', data: cells, itemStyle: { borderColor: T.card, borderWidth: 2, borderRadius: 3 }, label: { show: true, fontSize: 10.5, color: T.ink, formatter: (p) => (isNum(p.value[2]) && Math.abs(p.value[2]) >= 0.3 ? nf(p.value[2], 2) : '') } }],
      }), () => ({ cols: ['', ...labs], rows: labs.map((l, j) => [l, ...labs.map((_, i) => { const c = cells.find((q) => q[0] === i && q[1] === j); return c && isNum(c[2]) ? nf(c[2], 2) : '—'; })]) }));
      mc && mc.on('click', (p) => { S.corrX = MATRIX_KEYS[p.value[0]]; S.corrY = MATRIX_KEYS[p.value[1]]; S.corrLag = 0; document.querySelectorAll('#rc-xy-tools select').forEach((s) => { s.value = S[s.dataset.state]; }); SD.refresh(); });

      // ---- muscu vs repos
      const nxt = (x, k) => { const y = M.at(addD(x.d, 1)); return y && !y.partial ? y[k] : null; };
      const tr = F.full.filter((x) => x.train), rs = F.full.filter((x) => !x.train);
      const rowsC = [
        ['Récupération le lendemain', (x) => nxt(x, 'rec'), (v) => nf(v, 0) + ' %', (v) => sgn(v, 0) + ' pts'],
        ['Sommeil de la nuit suivante', (x) => nxt(x, 'sleepH'), fH, (v) => `${sgn(v * 60, 0)} min`],
        ['HRV le lendemain', (x) => nxt(x, 'hrv'), (v) => nf(v, 0) + ' ms', (v) => sgn(v, 0) + ' ms'],
        ['FC repos le lendemain', (x) => nxt(x, 'rhr'), (v) => nf(v, 1) + ' bpm', (v) => sgn(v, 1) + ' bpm'],
        ['Charge du jour', (x) => x.strain, (v) => nf(v, 1), (v) => sgn(v, 1)],
        ['Pas le jour même', (x) => x.steps, (v) => nf(v, 0), (v) => sgn(v, 0)],
        ['Calories ingérées', (x) => (SD.logged(x) ? x.kcal : null), (v) => nf(v, 0), (v) => sgn(v, 0)],
      ].map(([l, f, fm, fd]) => { const a1 = pluck(tr, f), b1 = pluck(rs, f); return { l, a: mean(a1), b: mean(b1), na: a1.length, nb: b1.length, fm, fd }; });
      setHTML('rc-cmp-b', `<table class="t"><thead><tr><th>Mesure</th><th class="num">Muscu</th><th class="num">Sans</th><th class="num">Écart</th><th class="num">n</th></tr></thead><tbody>${rowsC.map((o) => `<tr><td>${esc(o.l)}</td><td class="num">${o.na ? esc(o.fm(o.a)) : '—'}</td><td class="num">${o.nb ? esc(o.fm(o.b)) : '—'}</td><td class="num">${o.na && o.nb ? esc(o.fd(o.a - o.b)) : '—'}</td><td class="num">${o.na} / ${o.nb}</td></tr>`).join('')}</tbody></table>`);

      // ---- alertes
      const al = F.full.filter((x) => x.alert).slice().reverse();
      setHTML('rc-al-b', al.length ? al.slice(0, 12).map((x) => `<div class="alert ${x.alert.level === 'crit' ? '' : 'warn'}" data-day="${x.d}" style="cursor:pointer"><b>${esc(SD.fdate(x.d, { weekday: 'long', day: 'numeric', month: 'long' }))} · ${x.alert.level === 'crit' ? 'plusieurs signaux' : 'un signal'}</b>${esc(x.alert.flags.join(' · '))}${isNum(x.rec) ? ` · récupération ${nf(x.rec, 0)} %` : ''}</div>`).join('') + (al.length > 12 ? `<p class="note">${al.length - 12} autres jours dans la période.</p>` : '') : '<div class="empty">Aucun signal physiologique anormal sur la période.</div>');
      document.querySelectorAll('#rc-al-b [data-day]').forEach((el) => { el.onclick = () => SD.openDay(el.dataset.day); });
    },
  };

  SD.PAGES.recovery = recovery;
})();
