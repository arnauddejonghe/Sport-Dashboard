/* Page « Aujourd'hui » : lecture d'une journée façon Whoop (anneaux, biomarqueurs vs ta norme, charge, sommeil, nutrition, journal). */
(function () {
  'use strict';
  const SD = window.SD;
  const { isNum, nf, sgn, fH, fHM, fdL, fdS, fdM, esc, tms, dstr, addD, typeColor, STRENGTH, chart, base, tipBox, xCat, yVal, bar, line, ring, rangeBar } = SD;
  const { card, setHTML, setText } = SD.ui;

  const BM_TODAY = [
    ['hrv', 'HRV (indicative)', 'ms', 0, 1],
    ['rhr', 'FC au repos', 'bpm', 0, -1],
    ['resp', 'Fréquence respiratoire', '/min', 1, -1],
    ['spo2', 'SpO₂', '%', 1, 1],
    ['hrLo', 'FC minimale', 'bpm', 0, -1],
    ['walkHR', 'FC à la marche', 'bpm', 0, -1],
    ['walkAsym', 'Asymétrie de marche', '%', 1, -1],
  ];

  /** [état, libellé] : normal si |z| < 1, favorable si l'écart va dans le bon sens, sinon écart (< 2 σ) ou alerte */
  function zState(z, dir) {
    if (!isNum(z)) return null;
    if (Math.abs(z) < 1) return ['good', 'Normal'];
    if (dir !== 0 && Math.sign(z) === dir) return ['good', Math.abs(z) >= 2 ? 'Très favorable' : 'Favorable'];
    return Math.abs(z) < 2 ? ['warn', 'Écart'] : ['crit', 'Alerte'];
  }

  const today = {
    id: 'today', title: 'Aujourd’hui', sub: 'Ta journée lue comme un rapport Whoop : récupération, charge, sommeil et nutrition, comparés à ta propre norme.',
    noFilters: true,
    html() {
      return `<section class="card c12"><div class="dayhead">
          <div class="daynav"><button type="button" class="btn icon-btn" data-dayshift="-1" aria-label="Jour précédent">‹</button><h2 id="td-date"></h2><button type="button" class="btn icon-btn" data-dayshift="1" aria-label="Jour suivant">›</button>
          <input type="date" class="field" id="td-pick" aria-label="Choisir un jour"><button type="button" class="link" id="td-last">Dernier jour complet</button></div>
          <div class="chips" id="td-chips"></div></div><div id="td-alert"></div></section>
        <div class="rings c12" id="td-rings"></div>
        ${card('c7', 'td-bm', 'Biomarqueurs du jour', 'Valeur du jour vs ta plage normale (médiane ± écart des 30 jours précédents)', '', { table: false, body: '<div id="td-bm-b"></div>' })}
        ${card('c5', 'td-str', 'Charge & activité', null, '', { table: false, body: '<div id="td-str-b"></div>' })}
        ${card('c7', 'td-sleep', 'Sommeil', '14 dernières nuits · barres = durée, ligne = besoin estimé', '', { h: 'short' })}
        ${card('c5', 'td-nut', 'Nutrition', null, '', { table: false, body: '<div id="td-nut-b"></div>' })}
        ${card('c7', 'td-jr', 'Journal du jour', 'Ce que tu notes ici sert à mesurer l’impact de tes habitudes sur ta récupération.', '', { table: false, body: '<div id="td-jr-b"></div>' })}
        ${card('c5', 'td-14', '14 jours', 'Récupération (couleur de zone) et charge', '', { h: 'short' })}`;
    },
    update() {
      const { M, S, T } = SD;
      if (!S.day || !M.at(S.day)) S.day = M.lastComplete;
      const d = S.day, x = M.at(d);
      setText('td-date', SD.fdate(d, { weekday: 'long', day: 'numeric', month: 'long' }));
      const pick = document.getElementById('td-pick');
      if (pick) { pick.value = d; pick.min = M.first; pick.max = M.last; }
      const ds = SD.scores.dayScore(x);
      setHTML('td-chips', [
        x.phase ? `<span class="pill">Phase <b>${esc(x.phase)}</b></span>` : '',
        isNum(ds) ? `<span class="pill">Note du jour <b>${nf(ds, 0)}/100</b></span>` : '',
        x.train ? `<span class="pill"><span class="dot" style="background:${T.strain}"></span>${esc(x.split || 'Musculation')}</span>` : '<span class="pill">Jour sans muscu</span>',
        x.partial ? '<span class="pill stale"><span class="dot"></span>Journée incomplète (export)</span>' : '',
      ].join(''));
      setHTML('td-alert', x.alert ? `<div class="alert ${x.alert.level === 'crit' ? '' : 'warn'}" style="margin-top:12px"><b>${x.alert.level === 'crit' ? 'Signal de stress physiologique' : 'Signal à surveiller'}</b>${esc(x.alert.flags.join(' · '))} par rapport à ta norme. Plusieurs signaux ensemble précèdent souvent une maladie ou une fatigue importante : privilégie une journée légère.</div>` : '');

      // ---- anneaux
      const z = x.z || {};
      const zTxt = (k, dig) => (isNum(x[k]) ? `<b>${nf(x[k], dig)}</b>${isNum(z[k]) ? ` (${sgn(z[k], 1)} σ)` : ''}` : '—');
      const tgt = SD.scores.strainTarget(x.rec);
      const zone = SD.scores.strainZone(x.strain);
      const need = x.sleepNeed;
      const nut = SD.scores.nutriScore(x);
      setHTML('td-rings', [
        `<div class="rcard">${ring({ value: x.rec, max: 100, color: SD.recColor(x.rec), unit: '%', label: 'Récupération' })}
          <div class="lines">HRV ${zTxt('hrv', 0)} · FC repos ${zTxt('rhr', 0)}<br>Respiration ${zTxt('resp', 1)}</div></div>`,
        `<div class="rcard">${ring({ value: x.strain, max: 21, color: T.strain, text: isNum(x.strain) ? nf(x.strain, 1) : null, unit: '/ 21', label: 'Charge' })}
          <div class="lines">${zone ? `Charge <b>${SD.scores.STRAIN_LABEL[zone].toLowerCase()}</b>` : 'Pas de charge mesurée'}<br>${isNum(tgt) ? `Cible selon ta récup : <b>${nf(tgt - 1.5, 1)}–${nf(tgt + 1.5, 1)}</b>` : ''}</div></div>`,
        `<div class="rcard">${ring({ value: x.sleepPerf, max: 100, color: T.sleep, unit: '%', label: 'Sommeil' })}
          <div class="lines">${isNum(x.sleepH) ? `<b>${fH(x.sleepH)}</b> / besoin ${fH(need)}` : 'Pas de nuit enregistrée'}<br>${isNum(x.sleepDebt7) ? `Dette 7 j <b>${fH(x.sleepDebt7)}</b>` : ''}${isNum(x.sleepCons) ? ` · régularité <b>${nf(x.sleepCons, 0)}</b>` : ''}</div></div>`,
        `<div class="rcard">${ring({ value: ds, max: 100, color: SD.scoreColor(ds), text: isNum(ds) ? SD.scores.grade(ds) : null, unit: isNum(ds) ? `${nf(ds, 0)} / 100` : '', label: 'Note du jour' })}
          <div class="lines">Nutrition <b>${isNum(nut) ? nf(nut, 0) : '—'}</b> · Activité <b>${isNum(x.actScore) ? nf(x.actScore, 0) : '—'}</b><br>Récup 30 % · Sommeil 30 % · Nutrition 20 % · Activité 20 %</div></div>`,
      ].join(''));

      // ---- biomarqueurs du jour
      const rows = [];
      for (const [k, lab, unit, dig, dir] of BM_TODAY) {
        const v = x[k], b = x.base && x.base[k];
        if (!isNum(v) && !b) continue;
        const zs = zState(z[k], dir), st = zs && zs[0];
        const lo = b ? Math.min(b.m - 3 * b.s, isNum(v) ? v : Infinity) : v * 0.8, hi = b ? Math.max(b.m + 3 * b.s, isNum(v) ? v : -Infinity) : v * 1.2;
        rows.push(`<div class="bm"><div class="n">${esc(lab)}<small>${b ? `norme ${nf(b.lo, dig)}–${nf(b.hi, dig)} ${esc(unit)}` : 'norme en construction (10 jours min.)'}</small></div>
          <div class="v">${isNum(v) ? nf(v, dig) : '—'}<small>${esc(unit)}</small></div>
          <div class="rb">${b ? rangeBar({ scale: [lo, hi], bandLo: b.lo, bandHi: b.hi, value: v, color: SD.zoneColor(st) }) : ''}</div>
          <div class="trend">${isNum(z[k]) ? `${sgn(z[k], 1)} σ` : ''}</div>
          <div class="trend">${zs ? `<span class="status ${st}">${zs[1]}</span>` : ''}</div></div>`);
      }
      setHTML('td-bm-b', rows.length ? rows.join('') : '<div class="empty">Pas de biomarqueur mesuré ce jour-là.</div>');

      // ---- charge & activité
      const cfg = M.cfg.targets;
      const act = x.w.map((w) => `<div class="statline"><span><i style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${typeColor(w.type)};margin-right:7px"></i>${esc(w.type)}${STRENGTH.has(w.type) && x.split ? ` · ${esc(x.split)}` : ''}</span><b>${w.min != null ? fHM(w.min) : w.flag ? 'durée ignorée' : '—'}</b></div>`).join('');
      const sets = SD.sum(SD.pluck(x.ex, (e) => e.sets)), vol = SD.sum(SD.pluck(x.ex, (e) => e.vol));
      const prs = x.ex.filter((e) => e.pr);
      const acwrZone = (v) => (v > 1.5 ? ['risque', T.crit] : v > 1.3 ? ['vigilance', T.warn] : v >= 0.8 ? ['optimal', T.good] : ['sous-charge', T.ink2]);
      const wk0 = SD.weekOf(d);
      let weekTrain = 0;
      for (let q = wk0; q <= d; q = addD(q, 1)) { const y = M.at(q); if (y && y.train) weekTrain++; }
      const strainAvg = (n) => { const v = []; for (let i = 0; i < n; i++) { const y = M.at(addD(d, -i)); if (y && isNum(y.strain)) v.push(y.strain); } return v.length >= Math.min(5, n) ? SD.mean(v) : null; };
      const str7 = strainAvg(7), str28 = strainAvg(28);
      setHTML('td-str-b', `
        ${act || '<div class="statline"><span>Aucune séance enregistrée</span><b></b></div>'}
        ${x.ex.length ? `<div class="statline"><span>Exercices · séries · volume</span><b>${x.ex.length} · ${sets} · ${nf(vol, 0)} kg</b></div>` : ''}
        ${prs.length ? `<div class="statline"><span>Records personnels</span><b style="color:${T.good}">${prs.map((e) => esc(e.n) + ' ' + nf(e.e1, 1) + ' kg').join(', ')}</b></div>` : ''}
        <div class="statline"><span>Pas</span><b>${nf(x.steps, 0)} / ${nf(cfg.stepsGoal, 0)}</b></div>
        <div class="bar2"><i style="width:${Math.min(100, ((x.steps || 0) / cfg.stepsGoal) * 100)}%;background:${T.act}"></i></div>
        <div class="statline"><span>Calories actives · repos</span><b>${nf(x.activeKcal, 0)} · ${nf(x.restKcal, 0)} kcal</b></div>
        <div class="statline"><span>Minutes d’exercice · étages</span><b>${nf(x.exMin, 0)} min · ${nf(x.flights, 0)}</b></div>
        ${isNum(x.acwr) ? `<div class="statline"><span>Charge aiguë / chronique (7 j ÷ 28 j)</span><b style="color:${acwrZone(x.acwr)[1]}">${nf(x.acwr, 2)} · ${acwrZone(x.acwr)[0]}</b></div>` : ''}
        <div class="statline"><span>Séances de muscu cette semaine</span><b>${weekTrain} / ${nf(cfg.sessionsPerWeek, 0)}</b></div>
        ${isNum(str7) ? `<div class="statline"><span>Charge moyenne 7 j · 28 j</span><b>${nf(str7, 1)} · ${nf(str28, 1)}</b></div>` : ''}`);

      // ---- sommeil 14 nuits
      const nights = [];
      for (let i = 13; i >= 0; i--) { const y = M.at(addD(d, -i)); if (y) nights.push(y); }
      chart('td-sleep', base({
        grid: { left: 8, right: 14, top: 40, bottom: 8, containLabel: true },
        legend: SD.ui.ecLegend(T, ['Sommeil', 'Besoin']),
        tooltip: Object.assign(base().tooltip, { axisPointer: { type: 'shadow' }, formatter: (ps) => { const y = nights[ps[0].dataIndex]; return tipBox(fdL(y.d), [{ color: T.sleep, box: true, value: fH(y.sleepH), name: 'sommeil' }, { color: T.ink2, value: fH(y.sleepNeed), name: 'besoin' }, { color: T.sleep, value: isNum(y.sleepPerf) ? nf(y.sleepPerf, 0) + ' %' : '—', name: 'performance' }]); } }),
        xAxis: xCat(nights.map((y) => fdS(y.d))), yAxis: yVal({ min: 0, name: 'h' }),
        series: [
          bar('Sommeil', nights.map((y) => ({ value: isNum(y.sleepH) ? +y.sleepH.toFixed(2) : null, itemStyle: { color: T.sleep, opacity: y.d === d ? 1 : 0.55, borderRadius: [4, 4, 0, 0] } })), T.sleep),
          line('Besoin', nights.map((y) => (isNum(y.sleepNeed) ? +y.sleepNeed.toFixed(2) : null)), T.ink2, { connectNulls: true, lineStyle: { width: 1.5, color: T.ink2 } }),
        ],
      }), () => ({ cols: ['Nuit', 'Sommeil', 'Besoin', 'Performance'], rows: nights.map((y) => [fdM(y.d), fH(y.sleepH), fH(y.sleepNeed), isNum(y.sleepPerf) ? nf(y.sleepPerf, 0) + ' %' : '—']) }));
      const prev = M.at(addD(d, -1));
      setText('td-sleep-s', `Besoin du jour ${fH(need)} = base ${fH(cfg.sleepHours)}${prev && isNum(prev.strain) && prev.strain > 10 ? ` + charge de la veille ${fHM(Math.max(0, prev.strain - 10) * 0.06 * 60)}` : ''} + rattrapage de dette`);

      // ---- nutrition
      const lg = SD.logged(x);
      const tg = x.tgt;
      const macro = (lab, v, t, col, u) => `<div class="macro"><span>${lab}</span><div class="bar2" style="margin:0"><i style="width:${t ? Math.min(100, ((v || 0) / t) * 100) : 0}%;background:${col}"></i></div><b>${nf(v, 0)}${t ? ' / ' + nf(t, 0) : ''} ${u}</b></div>`;
      setHTML('td-nut-b', isNum(x.kcal) ? `
        <div class="statline"><span>Calories</span><b>${nf(x.kcal, 0)}${tg ? ' / ' + nf(tg.kcal, 0) : ''} kcal ${isNum(nut) ? `· score ${nf(nut, 0)}` : ''}</b></div>
        ${macro('Protéines', x.prot, tg && tg.prot, T.s[0], 'g')}${macro('Glucides', x.carb, tg && tg.carb, T.nutri, 'g')}${macro('Lipides', x.fat, tg && tg.fat, T.s[2], 'g')}
        <div class="statline"><span>Protéines / kg</span><b>${isNum(x.prot) && isNum(x.trendW) ? nf(x.prot / x.trendW, 2) : '—'} g/kg</b></div>
        <div class="statline"><span>Fibres · eau · caféine</span><b>${nf(x.fiber, 0)} g · ${isNum(x.water) ? nf(x.water / 1000, 1) + ' L' : '—'} · ${nf(x.caffeine, 0)} mg</b></div>
        ${isNum(x.alcohol) && x.alcohol > 0 ? `<div class="statline"><span>Alcool</span><b style="color:${T.warn}">${nf(x.alcohol, 0)} g</b></div>` : ''}
        ${!lg ? `<p class="note">Journée sous le seuil de log partiel (${nf(SD.partialKcal(), 0)} kcal) : exclue des moyennes.</p>` : ''}
        ${isNum(x.tdee) ? `<div class="statline"><span>Balance vs dépense MacroFactor</span><b>${sgn(x.kcal - x.tdee, 0)} kcal</b></div>` : ''}` : '<div class="empty">Rien de loggé dans MacroFactor ce jour-là.</div>');

      // ---- journal
      SD.journal.renderDay(document.getElementById('td-jr-b'), d);

      // ---- 14 jours
      const two = [];
      for (let i = 13; i >= 0; i--) { const y = M.at(addD(d, -i)); if (y) two.push(y); }
      const c14 = chart('td-14', base({
        axisPointer: { link: [{ xAxisIndex: 'all' }] },
        grid: [{ left: 36, right: 10, top: 8, height: '44%' }, { left: 36, right: 10, top: '62%', bottom: 22 }],
        tooltip: Object.assign(base().tooltip, { axisPointer: { type: 'shadow' }, formatter: (ps) => SD.ui.dayTip(two[ps[0].dataIndex].d) }),
        xAxis: [xCat(two.map((y) => fdS(y.d)), { gridIndex: 0, axisLabel: { show: false } }), xCat(two.map((y) => SD.WD[y.wd].slice(0, 1)), { gridIndex: 1 })],
        yAxis: [yVal({ gridIndex: 0, min: 0, max: 100, interval: 50 }), yVal({ gridIndex: 1, min: 0, max: 21, interval: 7 })],
        series: [
          { type: 'bar', name: 'Récupération', xAxisIndex: 0, yAxisIndex: 0, barMaxWidth: 14, data: two.map((y) => ({ value: y.rec, itemStyle: { color: SD.recColor(y.rec), borderRadius: [3, 3, 0, 0], opacity: y.d === d ? 1 : 0.7 } })) },
          { type: 'bar', name: 'Charge', xAxisIndex: 1, yAxisIndex: 1, barMaxWidth: 14, data: two.map((y) => ({ value: y.strain, itemStyle: { color: T.strain, borderRadius: [3, 3, 0, 0], opacity: y.d === d ? 1 : 0.6 } })) },
        ],
      }), () => ({ cols: ['Date', 'Récupération', 'Charge'], rows: two.map((y) => [fdM(y.d), nf(y.rec, 0), nf(y.strain, 1)]) }));
      c14 && c14.on('click', (p) => { const y = two[p.dataIndex]; if (y) { SD.setDay(y.d); SD.refresh(); } });
    },
  };

  SD.PAGES.today = today;
})();
