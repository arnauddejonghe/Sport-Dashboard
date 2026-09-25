/* Page « Nutrition » : apport vs cible et dépense, macros, protéines par kilo, score, micronutriments, balance. */
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
    ['water', 'Eau des aliments', 'mL', 0, () => null, 'comptée dans l’hydratation'],
    ['alcohol', 'Alcool', 'g', 0, (v) => (v <= 0 ? 'good' : v < 10 ? 'warn' : 'crit'), '0 idéalement'],
  ];

  const body = {
    id: 'body', title: 'Nutrition', sub: 'Ce que tu manges face à ta cible et à ta dépense, la qualité des apports et ta régularité de suivi.',
    html() {
      const S = SD.S;
      const pk = SD.partialKcal();
      return `<div class="kpis" id="bd-k"></div>
        ${card('c6', 'bd-kcal', 'Énergie', '', `<label class="fsummary" for="bd-pk">Log partiel &lt; <b id="bd-pk-v">${nf(pk, 0)}</b> kcal</label><input type="range" id="bd-pk" min="0" max="2200" step="100" value="${pk}" style="width:110px;accent-color:var(--nutri)" aria-label="Seuil de journée partielle">`)}
        ${card('c6', 'bd-macro', 'Macronutriments', '', seg('macroView', [['g', 'Grammes'], ['pct', '% énergie']], S.macroView))}
        ${card('c6', 'bd-prot', 'Protéines par kilo', 'g de protéines par kg de poids tendance · bande = cible')}
        ${card('c6', 'bd-score', 'Score nutrition', 'Par jour loggé : calories vs cible (45 %), protéines vs cible (40 %), fibres vs 30 g (15 %)')}
        ${card('c6', 'bd-bal', 'Balance énergétique', 'Calories ingérées − dépense estimée par MacroFactor')}
        ${card('c6', 'bd-wd', 'Écart à la cible par jour', 'Moyenne (ingéré − cible MacroFactor) par jour de semaine')}
        ${card('c12', 'bd-micro', 'Micronutriments', 'Moyenne des jours loggés vs repères de santé publique', '', { table: false, body: '<div id="bd-micro-b" class="micro-grid"></div>' })}
        ${card('c12', 'bd-hyd', 'Hydratation', '', '', { h: 'short' })}`;
    },
    update() {
      const { M, F, S, T } = SD, cfg = M.cfg.targets;
      const g = SD.gran(), keys = SD.bucketKeys(g);
      const lg = F.full.filter(SD.logged);
      const ns = pluck(lg, SD.scores.nutriScore);
      const wT = lg.filter((x) => x.tgt && isNum(x.tgt.kcal));
      const adh = wT.length ? (wT.filter((x) => Math.abs(x.kcal - x.tgt.kcal) <= 0.1 * x.tgt.kcal).length / wT.length) * 100 : null;
      const kc = lg.length ? mean(pluck(lg, (x) => x.kcal)) : null, tk = wT.length ? mean(wT.map((x) => x.tgt.kcal)) : null;
      const pkg = pluck(lg, (x) => (isNum(x.prot) && isNum(x.trendW) ? x.prot / x.trendW : null));
      const [pLo] = cfg.proteinPerKg;
      const balD = pluck(lg, (x) => (isNum(x.tdee) ? x.kcal - x.tdee : null));
      setHTML('bd-k', [
        kpi({ label: 'Calories', value: kc, unit: 'kcal/j', ctx: tk ? `cible moyenne ${nf(tk, 0)} kcal · ${sgn(kc - tk, 0)} kcal` : 'jours loggés', color: T.nutri }),
        kpi({ label: 'Protéines', value: pkg.length ? mean(pkg) : null, digits: 2, unit: 'g/kg', ctx: pkg.length ? `${nf((pkg.filter((v) => v >= pLo).length / pkg.length) * 100, 0)} % des jours ≥ ${nf(pLo, 1)} g/kg` : '', color: T.s[0] }),
        kpi({ label: 'Balance', value: balD.length ? mean(balD) : null, unit: 'kcal/j', fmt: (v) => sgn(v, 0), ctx: 'vs dépense estimée par MacroFactor', color: T.nutri }),
        kpi({ label: 'Régularité du suivi', value: F.full.length ? (lg.length / F.full.length) * 100 : null, unit: '%', ctx: `${lg.length} jours loggés sur ${F.full.length}${isNum(adh) ? ` · ${nf(adh, 0)} % à ±10 % de la cible` : ''}`, meter: F.full.length ? (lg.length / F.full.length) * 100 : null, color: T.nutri }),
        kpi({ label: 'Score nutrition', value: ns.length ? mean(ns) : null, unit: '/100', ctx: 'calories, protéines et fibres vs cibles', meter: ns.length ? mean(ns) : null, color: T.nutri }),
      ].join(''));

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
      }).join('') + '<p class="note">Moyenne sur les jours où la donnée est loggée.</p>');

      // ---- hydratation : boissons notées (Apple Santé) + eau des aliments (MacroFactor) vs cible du jour
      const hd = F.days.filter((x) => !x.partial);
      const logged = hd.filter((x) => isNum(SD.scores.hydroTotal(x)));
      setText('bd-hyd-s', `Cible du jour : 35 ml/kg de poids tendance + 0,5 L par heure de musculation (EFSA 2010 : ~2,5 L/j d’eau totale chez l’homme, aliments compris). ${logged.length} jour${logged.length > 1 ? 's' : ''} sur ${hd.length} avec des boissons notées${logged.length < hd.length / 2 ? ' : note tes boissons dans Apple Santé (widget ou raccourci « Eau ») pour un suivi fiable ; l’eau des aliments seule est affichée en clair' : ''}.`);
      chart('bd-hyd', base({
        grid: { left: 8, right: 14, top: 40, bottom: 8, containLabel: true },
        legend: SD.ui.ecLegend(T, ['Boissons', 'Eau des aliments', 'Cible']),
        tooltip: Object.assign(base().tooltip, { axisPointer: { type: 'shadow' }, formatter: (ps) => { const x = hd[ps[0].dataIndex]; const dr = SD.scores.drinks(x); return tipBox(SD.fdL(x.d), [{ color: T.s[0], box: true, value: dr != null ? nf(dr / 1000, 2) + ' L' : 'non notées', name: 'boissons' }, { color: 'rgba(57,135,229,0.35)', box: true, value: isNum(x.water) ? nf(x.water / 1000, 2) + ' L' : '—', name: 'eau des aliments' }, { color: T.ink2, value: nf(SD.scores.hydroTarget(x) / 1000, 1) + ' L', name: 'cible' }]); } }),
        xAxis: xCat(hd.map((x) => SD.fdS(x.d))), yAxis: yVal({ min: 0, name: 'L' }),
        series: [
          bar('Eau des aliments', hd.map((x) => (isNum(x.water) ? +(x.water / 1000).toFixed(2) : null)), 'rgba(57,135,229,0.35)', { stack: 'h' }),
          bar('Boissons', hd.map((x) => { const dr = SD.scores.drinks(x); return dr != null ? +(dr / 1000).toFixed(2) : null; }), T.s[0], { stack: 'h' }),
          line('Cible', hd.map((x) => { const t = SD.scores.hydroTarget(x); return t ? +(t / 1000).toFixed(2) : null; }), T.ink2, { connectNulls: true, lineStyle: { width: 1.5, type: 'dashed', color: T.ink2 } }),
        ],
      }), () => ({ cols: ['Date', 'Boissons (L)', 'Eau des aliments (L)', 'Cible (L)'], rows: hd.map((x) => { const dr = SD.scores.drinks(x); const t = SD.scores.hydroTarget(x); return [fdM(x.d), dr != null ? nf(dr / 1000, 2) : '—', isNum(x.water) ? nf(x.water / 1000, 2) : '—', t ? nf(t / 1000, 1) : '—']; }) }));

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
