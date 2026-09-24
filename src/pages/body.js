/* Page « Corps & nutrition » : poids + projection, composition, mensurations, énergie, macros, micronutriments, score nutrition. */
(function () {
  'use strict';
  const SD = window.SD;
  const { isNum, nf, sgn, fdM, esc, tms, pluck, mean, chart, base, tipBox, axisTip, xCat, yVal, bar, line, kpi, WD, WDL, ts } = SD;
  const { card, seg, setHTML, setText, avgOf } = SD.ui;

  // Repères : fibres ≥ 30 g (EFSA 25 g, recommandations sportives 30+), sodium < 2 000 mg (OMS),
  // sucres < 50 g (OMS < 10 % de l'énergie), caféine ≤ 400 mg (EFSA), eau ≥ 2,5 L (EFSA hommes, boissons + aliments)
  const MICRO = [
    ['fiber', 'Fibres', 'g', 0, (v) => (v >= 30 ? 'good' : v >= 20 ? 'warn' : 'crit'), '≥ 30 g'],
    ['sodium', 'Sodium', 'mg', 0, (v) => (v < 2000 ? 'good' : v < 3000 ? 'warn' : 'crit'), '< 2 000 mg (OMS)'],
    ['sugar', 'Sucres', 'g', 0, (v) => (v < 50 ? 'good' : v < 80 ? 'warn' : 'crit'), '< 50 g (OMS)'],
    ['caffeine', 'Caféine', 'mg', 0, (v) => (v <= 400 ? 'good' : v <= 600 ? 'warn' : 'crit'), '≤ 400 mg (EFSA)'],
    ['water', 'Eau (loggée)', 'mL', 0, (v) => (v >= 2500 ? 'good' : v >= 1500 ? 'warn' : 'crit'), '≥ 2,5 L (EFSA)'],
    ['alcohol', 'Alcool', 'g', 0, (v) => (v <= 0 ? 'good' : v < 10 ? 'warn' : 'crit'), '0 idéalement'],
  ];

  const body = {
    id: 'body', title: 'Corps & nutrition', sub: 'Trajectoire du poids vers ton objectif, composition corporelle et qualité de la nutrition.',
    html() {
      const S = SD.S;
      const pk = SD.partialKcal();
      return `<div class="kpis" id="bd-k"></div>
        ${card('c12', 'bd-weight', 'Poids & projection', '', '', { h: 'xtall' })}
        ${card('c6', 'bd-fat', 'Masse grasse', '% estimé par la balance ou MacroFactor')}
        ${card('c6', 'bd-lean', 'Masse maigre', 'Estimée par la balance connectée (Apple Santé)')}
        ${card('c6', 'bd-meas', 'Mensurations', 'Mesures saisies dans MacroFactor', '<select class="fselect" id="bd-meas-sel" data-state="measure" aria-label="Mesure"></select>', { body: '<div class="chart short" id="bd-meas"></div><div class="tbl-view" hidden></div><div class="tbl-wrap tbl-scroll" id="bd-meas-tbl" style="margin-top:8px;max-height:200px"></div>' })}
        ${card('c6', 'bd-kcal', 'Énergie', '', `<label class="fsummary" for="bd-pk">Log partiel &lt; <b id="bd-pk-v">${nf(pk, 0)}</b> kcal</label><input type="range" id="bd-pk" min="0" max="2200" step="100" value="${pk}" style="width:110px;accent-color:var(--nutri)" aria-label="Seuil de journée partielle">`)}
        ${card('c6', 'bd-macro', 'Macronutriments', '', seg('macroView', [['g', 'Grammes'], ['pct', '% énergie']], S.macroView))}
        ${card('c6', 'bd-prot', 'Protéines par kilo', 'g de protéines par kg de poids tendance · bande = cible')}
        ${card('c6', 'bd-score', 'Score nutrition', 'Par jour loggé : calories vs cible (45 %), protéines vs cible (40 %), fibres vs 30 g (15 %)')}
        ${card('c6', 'bd-micro', 'Micronutriments & hydratation', 'Moyenne des jours loggés vs repères de santé publique', '', { table: false, body: '<div id="bd-micro-b"></div>' })}
        ${card('c6', 'bd-bal', 'Balance énergétique', 'Calories ingérées − dépense estimée par MacroFactor')}
        ${card('c6', 'bd-wd', 'Écart à la cible par jour', 'Moyenne (ingéré − cible MacroFactor) par jour de semaine')}`;
    },
    update() {
      const { M, F, S, T } = SD, cfg = M.cfg.targets;
      const g = SD.gran(), keys = SD.bucketKeys(g);
      const tw = F.days.filter((x) => isNum(x.trendW));
      const a = tw[0], b = tw[tw.length - 1];
      const wks = a && b ? (SD.nDays(a.d, b.d) - 1) / 7 : 0;
      const rate = wks >= 1 ? (b.trendW - a.trendW) / wks : null;
      const phase = (M.at(S.to) || {}).phase;
      const rt = phase && cfg.weeklyRate && cfg.weeklyRate[phase];
      const bf = F.days.filter((x) => isNum(x.bodyFat));
      const allBody = M.raw.body.filter((x) => x.d <= S.to && isNum(x['Tour de taille']));
      const waistL = allBody[allBody.length - 1], waistF = allBody.find((x) => x.d >= S.from);
      const lg = F.full.filter(SD.logged);
      const ns = pluck(lg, SD.scores.nutriScore);
      const wT = lg.filter((x) => x.tgt && isNum(x.tgt.kcal));
      const adh = wT.length ? (wT.filter((x) => Math.abs(x.kcal - x.tgt.kcal) <= 0.1 * x.tgt.kcal).length / wT.length) * 100 : null;
      setHTML('bd-k', [
        kpi({ label: 'Poids tendance', value: b ? b.trendW : null, unit: 'kg', digits: 1, delta: a && b && a !== b ? b.trendW - a.trendW : null, deltaFmt: (v) => `${sgn(v, 1)} kg sur la période`, deltaLabel: '', good: null, ctx: b ? `Source : ${b.trendSrc === 'MacroFactor' ? 'Trend Weight MacroFactor' : 'moyenne des pesées'}` : '', color: T.body }),
        kpi({ label: 'Rythme', value: rate, digits: 2, unit: 'kg/sem', fmt: (v) => sgn(v, 2), ctx: phase ? `Phase ${esc(phase)}${rt ? ` · cible ${sgn(rt[0], 2)} à ${sgn(rt[1], 2)}` : ''}` : '', status: rt && isNum(rate) ? ' ' + (rate < rt[0] ? '<span class="status warn">Sous la cible</span>' : rate > rt[1] ? '<span class="status warn">Au-dessus</span>' : '<span class="status good">Dans la cible</span>') : '', color: T.body }),
        kpi({ label: 'Masse grasse', value: bf.length ? bf[bf.length - 1].bodyFat : null, unit: '%', digits: 1, delta: bf.length >= 2 ? bf[bf.length - 1].bodyFat - bf[0].bodyFat : null, deltaFmt: (v) => `${sgn(v, 1)} pt sur la période`, deltaLabel: '', good: 'down', color: T.body }),
        kpi({ label: 'Tour de taille', value: waistL ? waistL['Tour de taille'] : null, unit: 'cm', digits: 1, delta: waistL && waistF && waistF !== waistL ? waistL['Tour de taille'] - waistF['Tour de taille'] : null, deltaFmt: (v) => `${sgn(v, 1)} cm sur la période`, deltaLabel: '', good: 'down', ctx: waistL ? `Mesuré le ${esc(fdM(waistL.d))}` : '', color: T.body }),
        kpi({ label: 'Score nutrition', value: ns.length ? mean(ns) : null, unit: '/100', ctx: `${lg.length} j loggés · ${isNum(adh) ? nf(adh, 0) + ' % à ±10 % de la cible' : 'pas de cible'}`, meter: ns.length ? mean(ns) : null, color: T.nutri }),
      ].join(''));

      const proj = SD.ui.weightChart('bd-weight', { projection: true });
      setText('bd-weight-s', proj ? `Tendance des 28 derniers jours : ${sgn(proj.slopeWeek, 2)} kg/sem → ${nf(proj.end.y, 1)} kg le ${fdM(proj.end.d)} (± ${nf((proj.end.hi - proj.end.lo) / 2, 1)} kg, indicatif) · Maj + molette ou outil loupe pour zoomer` : 'Pesées et poids tendance · bandes = phases');

      ts('bd-fat', { name: 'Masse grasse', get: (x) => x.bodyFat, color: T.body, unit: '%', digits: 1, type: 'line', gap: 21, onDay: SD.openDay });
      ts('bd-lean', { name: 'Masse maigre', get: (x) => x.lean, color: T.act, unit: 'kg', digits: 1, type: 'line', gap: 21, onDay: SD.openDay });

      // ---- mensurations
      const measures = [...new Set(M.raw.body.flatMap((x) => Object.keys(x).filter((k) => k !== 'd')))];
      if (!measures.includes(S.measure)) S.measure = measures.includes('Tour de taille') ? 'Tour de taille' : measures[0];
      const msel = document.getElementById('bd-meas-sel');
      msel.innerHTML = measures.map((m) => `<option${m === S.measure ? ' selected' : ''}>${esc(m)}</option>`).join('');
      const mp = F.body.filter((x) => isNum(x[S.measure]));
      chart('bd-meas', mp.length ? base({
        grid: { left: 8, right: 14, top: 16, bottom: 8, containLabel: true },
        tooltip: Object.assign(base().tooltip, { formatter: axisTip({ [S.measure]: (v) => nf(v, 1) + (/%/.test(S.measure) ? '' : ' cm') }) }),
        xAxis: SD.xTime(), yAxis: yVal({ scale: true }),
        series: [line(S.measure, mp.map((x) => [tms(x.d), x[S.measure]]), T.body, { showSymbol: true, symbolSize: 8 })],
      }) : base(SD.emptyOpt('Aucune mesure sur la période')), () => ({ cols: ['Date', S.measure], rows: mp.map((x) => [fdM(x.d), nf(x[S.measure], 1)]) }));
      const mrows = measures.map((m) => { const v = F.body.filter((x) => isNum(x[m])); return v.length ? { m, f: v[0][m], l: v[v.length - 1][m], n: v.length } : null; }).filter(Boolean);
      setHTML('bd-meas-tbl', mrows.length ? `<table class="t"><thead><tr><th>Mesure</th><th class="num">Première</th><th class="num">Dernière</th><th class="num">Écart</th></tr></thead><tbody>${mrows.map((r) => `<tr><td>${esc(r.m)}</td><td class="num">${nf(r.f, 1)}</td><td class="num">${nf(r.l, 1)}</td><td class="num">${r.n > 1 ? sgn(r.l - r.f, 1) : '—'}</td></tr>`).join('')}</tbody></table>` : '');

      // ---- énergie
      const pk = SD.partialKcal();
      setText('bd-pk-v', nf(pk, 0));
      const inK = SD.agg(lg, (x) => x.d, (x) => x.kcal, 'mean', g), tgK = SD.agg(lg, (x) => x.d, (x) => (x.tgt ? x.tgt.kcal : null), 'mean', g);
      const tdK = SD.agg(F.full, (x) => x.d, (x) => x.tdee, 'mean', g), apK = SD.agg(F.full, (x) => x.d, (x) => (isNum(x.activeKcal) && isNum(x.restKcal) ? x.activeKcal + x.restKcal : null), 'mean', g);
      setText('bd-kcal-s', `Moyenne par ${SD.granUnit(g)} : ingéré (jours loggés, ${lg.length} j), cible et dépense MacroFactor, dépense Apple (active + repos)`);
      chart('bd-kcal', lg.length ? base({
        grid: { left: 8, right: 14, top: 44, bottom: 8, containLabel: true },
        legend: Object.assign(SD.ui.ecLegend(T, ['Ingéré', 'Cible', 'Dépense MacroFactor', 'Dépense Apple']), { left: 0, right: 'auto' }),
        tooltip: Object.assign(base().tooltip, { formatter: axisTip({ 'Ingéré': (v) => nf(v, 0) + ' kcal', 'Cible': (v) => nf(v, 0) + ' kcal', 'Dépense MacroFactor': (v) => nf(v, 0) + ' kcal', 'Dépense Apple': (v) => nf(v, 0) + ' kcal' }, (x, p) => SD.bucketTitle(keys[p.dataIndex], g)) }),
        xAxis: xCat(keys.map((k) => SD.bucketLabel(k, g))), yAxis: yVal({ scale: true, name: 'kcal' }),
        series: [
          bar('Ingéré', inK.map((o) => (isNum(o.v) ? Math.round(o.v) : null)), T.nutri),
          line('Cible', tgK.map((o) => (isNum(o.v) ? Math.round(o.v) : null)), T.ink, { connectNulls: true, lineStyle: { width: 1.5, color: T.ink } }),
          line('Dépense MacroFactor', tdK.map((o) => (isNum(o.v) ? Math.round(o.v) : null)), T.s[6], { connectNulls: true }),
          line('Dépense Apple', apK.map((o) => (isNum(o.v) ? Math.round(o.v) : null)), T.act, { connectNulls: true, lineStyle: { width: 1.5, color: T.act } }),
        ],
      }) : base(SD.emptyOpt('Aucune journée loggée complète sur la période')), () => ({ cols: ['Période', 'Ingéré', 'Cible', 'Dépense MF', 'Dépense Apple', 'Jours'], rows: keys.map((k, i) => [SD.bucketTitle(k, g), nf(inK[i].v, 0), nf(tgK[i].v, 0), nf(tdK[i].v, 0), nf(apK[i].v, 0), inK[i].n]) }));

      // ---- macros
      const pr = SD.agg(lg, (x) => x.d, (x) => x.prot, 'mean', g), cb = SD.agg(lg, (x) => x.d, (x) => x.carb, 'mean', g), ft = SD.agg(lg, (x) => x.d, (x) => x.fat, 'mean', g);
      const pct = S.macroView === 'pct';
      const toPct = (i, v, k) => { const e = (pr[i].v || 0) * 4 + (cb[i].v || 0) * 4 + (ft[i].v || 0) * 9; return e && isNum(v) ? +(((v * k) / e) * 100).toFixed(1) : null; };
      const mser = [['Protéines', pr, 4, T.s[0]], ['Glucides', cb, 4, T.nutri], ['Lipides', ft, 9, T.s[2]]];
      setText('bd-macro-s', pct ? 'Part de l’énergie apportée par chaque macro' : `Grammes par jour, moyenne par ${SD.granUnit(g)}`);
      chart('bd-macro', lg.length ? base({
        grid: { left: 8, right: 14, top: 30, bottom: 8, containLabel: true },
        legend: SD.ui.ecLegend(T, mser.map((m) => m[0])),
        tooltip: Object.assign(base().tooltip, { axisPointer: { type: 'shadow' }, formatter: axisTip(Object.fromEntries(mser.map((m) => [m[0], (v) => nf(v, 0) + (pct ? ' %' : ' g')])), (x, p) => SD.bucketTitle(keys[p.dataIndex], g)) }),
        xAxis: xCat(keys.map((k) => SD.bucketLabel(k, g))), yAxis: yVal({ max: pct ? 100 : null, name: pct ? '%' : 'g' }),
        series: mser.map(([n, arr, k, col], j) => bar(n, arr.map((o, i) => (pct ? toPct(i, o.v, k) : isNum(o.v) ? Math.round(o.v) : null)), col, { stack: 'm', itemStyle: { color: col, borderColor: T.card, borderWidth: 1, borderRadius: j === 2 ? [4, 4, 0, 0] : 0 } })),
      }) : base(SD.emptyOpt('Aucune journée loggée complète sur la période')), () => ({ cols: ['Période', 'Protéines (g)', 'Glucides (g)', 'Lipides (g)'], rows: keys.map((k, i) => [SD.bucketTitle(k, g), nf(pr[i].v, 0), nf(cb[i].v, 0), nf(ft[i].v, 0)]) }));

      // ---- protéines / kg
      const [p0, p1] = cfg.proteinPerKg;
      ts('bd-prot', { name: 'Protéines', get: (x) => (SD.logged(x) && isNum(x.prot) && isNum(x.trendW) ? x.prot / x.trendW : null), color: T.s[0], unit: 'g/kg', digits: 2, type: 'line', gap: 30, onDay: SD.openDay,
        markArea: { silent: true, itemStyle: { color: 'rgba(30,215,135,0.08)' }, label: { color: T.muted, fontSize: 11, position: 'insideTopRight', formatter: `cible ${nf(p0, 1)}–${nf(p1, 1)}` }, data: [[{ yAxis: p0 }, { yAxis: p1 }]] } });

      // ---- score nutrition
      ts('bd-score', { name: 'Score nutrition', get: SD.scores.nutriScore, color: T.nutri, unit: '/100', digits: 0, type: 'bar', colorOf: (x) => SD.scoreColor(SD.scores.nutriScore(x)), yExtra: { min: 0, max: 100 }, onDay: SD.openDay,
        foot: (x) => (x.tgt ? `Ingéré ${nf(x.kcal, 0)} / cible ${nf(x.tgt.kcal, 0)} kcal · protéines ${nf(x.prot, 0)} / ${nf(x.tgt.prot, 0)} g` : '') });

      // ---- micronutriments
      setHTML('bd-micro-b', MICRO.map(([k, lab, u, dg, st, ref]) => {
        const v = mean(pluck(lg, (x) => x[k]));
        const n = pluck(lg, (x) => x[k]).length;
        const s = isNum(v) ? st(v) : null;
        return `<div class="statline"><span>${esc(lab)} <small style="color:var(--muted)">· repère ${esc(ref)}</small></span><b>${isNum(v) ? (u === 'mL' ? nf(v / 1000, 2) + ' L' : nf(v, dg) + ' ' + u) : '—'} ${s ? `<span class="status ${s}" style="margin-left:6px">${s === 'good' ? 'OK' : s === 'warn' ? 'Limite' : 'À revoir'}</span>` : ''}<small style="color:var(--muted);font-weight:400;margin-left:6px">${n ? n + ' j' : ''}</small></b></div>`;
      }).join('') + '<p class="note">Moyenne sur les jours où la donnée est loggée. L’eau ne compte que ce que tu saisis.</p>');

      // ---- balance
      const bal = SD.agg(lg.filter((x) => isNum(x.tdee)), (x) => x.d, (x) => x.kcal - x.tdee, 'mean', g);
      chart('bd-bal', bal.some((o) => isNum(o.v)) ? base({
        grid: { left: 8, right: 14, top: 44, bottom: 8, containLabel: true },
        legend: { show: true, top: 0, right: 0, data: [{ name: 'Surplus', itemStyle: { color: T.divPos } }, { name: 'Déficit', itemStyle: { color: T.divNeg } }], icon: 'roundRect', itemWidth: 12, itemHeight: 6, textStyle: { color: T.ink2 }, selectedMode: false },
        tooltip: Object.assign(base().tooltip, { axisPointer: { type: 'shadow' }, formatter: (ps) => { const p = ps.find((q) => isNum(q.value)); return p ? tipBox(SD.bucketTitle(keys[p.dataIndex], g), [{ color: p.value >= 0 ? T.divPos : T.divNeg, box: true, value: sgn(p.value, 0) + ' kcal', name: p.value >= 0 ? 'surplus moyen' : 'déficit moyen' }], `${bal[p.dataIndex].n} jours avec dépense connue`) : ''; } }),
        xAxis: xCat(keys.map((k) => SD.bucketLabel(k, g))), yAxis: yVal({ name: 'kcal' }),
        series: [
          { name: 'Surplus', type: 'bar', stack: 'b', barMaxWidth: 20, data: bal.map((o) => (isNum(o.v) && o.v >= 0 ? Math.round(o.v) : null)), itemStyle: { color: T.divPos, borderRadius: [4, 4, 0, 0] } },
          { name: 'Déficit', type: 'bar', stack: 'b', barMaxWidth: 20, data: bal.map((o) => (isNum(o.v) && o.v < 0 ? Math.round(o.v) : null)), itemStyle: { color: T.divNeg, borderRadius: [0, 0, 4, 4] } },
        ],
      }) : base(SD.emptyOpt('Dépense MacroFactor disponible depuis janv. 2026')), () => ({ cols: ['Période', 'Balance (kcal)', 'Jours'], rows: keys.map((k, i) => [SD.bucketTitle(k, g), sgn(bal[i].v, 0), bal[i].n]) }));

      // ---- écart par jour
      const dev = WD.map((_, w) => { const v = pluck(wT.filter((x) => x.wd === w), (x) => x.kcal - x.tgt.kcal); return { n: v.length, v: v.length ? mean(v) : null }; });
      chart('bd-wd', wT.length ? base({
        grid: { left: 8, right: 14, top: 30, bottom: 8, containLabel: true },
        tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => tipBox(WDL[p.dataIndex], [{ color: p.value >= 0 ? T.divPos : T.divNeg, box: true, value: sgn(p.value, 0) + ' kcal', name: 'vs cible' }], `${dev[p.dataIndex].n} jours loggés`) }),
        xAxis: xCat(WD), yAxis: yVal({ name: 'kcal' }),
        series: [{ type: 'bar', barMaxWidth: 22, data: dev.map((o) => ({ value: isNum(o.v) ? Math.round(o.v) : null, itemStyle: { color: o.v >= 0 ? T.divPos : T.divNeg, borderRadius: o.v >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4] } })), label: { show: true, position: 'top', color: T.ink2, fontSize: 11, formatter: (p) => sgn(p.value, 0) } }],
      }) : base(SD.emptyOpt('Cibles MacroFactor disponibles depuis janv. 2025')), () => ({ cols: ['Jour', 'Écart moyen (kcal)', 'Jours'], rows: dev.map((o, w) => [WDL[w], sgn(o.v, 0), o.n]) }));
    },
  };

  SD.PAGES.body = body;
})();
