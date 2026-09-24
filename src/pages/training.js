/* Page « Entraînement » : charge (strain), charge aiguë/chronique, volume, durées, splits, journal des séances. */
(function () {
  'use strict';
  const SD = window.SD;
  const { isNum, nf, sgn, fHM, fdM, fdate, esc, tms, dstr, addD, pluck, sum, mean, median, chart, base, tipBox, axisTip, xCat, yVal, bar, line, kpi, TYPE_ORDER, typeKey, typeColor, STRENGTH, SPLITS, splitColor, WD, WDL, ts } = SD;
  const { card, setHTML, setText, prevDelta, drill } = SD.ui;

  const training = {
    id: 'training', title: 'Entraînement', sub: 'Ta charge quotidienne, l’équilibre charge aiguë / chronique et la régularité de tes séances.',
    html() {
      return `<div class="kpis" id="tr-k"></div>
        ${card('c12', 'tr-strain', 'Charge quotidienne (strain 0–21)', 'Calories actives + surcharge de la musculation, sur une échelle logarithmique façon Whoop · 10–13 modérée, 14–17 élevée, 18+ très élevée', '', { h: 'tall' })}
        ${card('c6', 'tr-acwr', 'Charge aiguë / chronique', 'Moyenne exponentielle 7 j ÷ 28 j · zone optimale 0,8–1,3, risque au-delà de 1,5 (Gabbett 2016)')}
        ${card('c6', 'tr-zones', 'Répartition des charges', '')}
        ${card('c12', 'tr-vol', 'Volume d’activité', '', '', { h: 'tall' })}
        ${card('c6', 'tr-dur', 'Durée des séances de musculation', 'Chaque point = une séance · ligne = médiane glissante sur 7 séances')}
        ${card('c6', 'tr-split', 'Split détecté', 'D’après les groupes musculaires (MacroFactor) ou les noms d’exercices')}
        ${card('c6', 'tr-splitwd', 'Quel split, quel jour', 'Nombre de séances par jour de semaine et par split')}
        ${card('c6', 'tr-hour', 'Heure de début', 'Séances TrainAI (févr. 2024 → avr. 2025)')}
        ${card('c12', 'tr-log', 'Journal des séances', 'Clic sur une ligne pour le détail du jour', '', { table: false, body: '<div class="tbl-wrap tbl-scroll" id="tr-log-b"></div>' })}`;
    },
    update() {
      const { M, F, S, T } = SD, cfg = M.cfg.targets;
      const sess = F.strengthDays.size, pSess = F.prevStrengthDays.size;
      const durs = pluck(F.days.filter((x) => F.strengthDays.has(x.d)), (x) => x.strMin);
      const pDurs = pluck(F.prev.filter((x) => F.prevStrengthDays.has(x.d)), (x) => x.strMin);
      let k = SD.wdOf(S.from) === 0 ? S.from : addD(SD.weekOf(S.from), 7);
      const counts = [];
      while (addD(k, 6) <= S.to) { let c = 0; for (let i = 0; i < 7; i++) if (F.strengthDays.has(addD(k, i))) c++; counts.push(c); k = addD(k, 7); }
      const hit = counts.filter((c) => c >= cfg.sessionsPerWeek).length;
      let best = 0, cur = 0;
      for (const c of counts) { cur = c >= cfg.sessionsPerWeek ? cur + 1 : 0; best = Math.max(best, cur); }
      const st = mean(pluck(F.full, (x) => x.strain)), pSt = mean(pluck(F.prevFull, (x) => x.strain));
      const last = [...F.full].reverse().find((x) => isNum(x.acwr));
      setHTML('tr-k', [
        kpi({ label: 'Séances de muscu', value: sess, delta: prevDelta(sess, pSess), deltaDigits: 0, good: 'up', ctx: `${nf(sess / (F.len / 7), 1)} par semaine`, color: T.strain }),
        kpi({ label: 'Charge moyenne', value: st, digits: 1, unit: '/ 21', delta: prevDelta(st, pSt), good: null, ctx: 'par jour', color: T.strain }),
        kpi({ label: 'Ratio aigu / chronique', value: last ? last.acwr : null, digits: 2, ctx: last ? `au ${fdM(last.d)}` : '', status: last ? ' ' + (last.acwr > 1.5 ? '<span class="status crit">Risque</span>' : last.acwr > 1.3 ? '<span class="status warn">Vigilance</span>' : last.acwr >= 0.8 ? '<span class="status good">Optimal</span>' : '<span class="status warn">Sous-charge</span>') : '', color: T.strain }),
        kpi({ label: 'Semaines à l’objectif', value: counts.length ? (hit / counts.length) * 100 : null, unit: '%', ctx: `${hit} / ${counts.length} semaines ≥ ${cfg.sessionsPerWeek} séances · série record ${best}`, meter: counts.length ? (hit / counts.length) * 100 : null, color: T.strain }),
        kpi({ label: 'Durée médiane', value: median(durs), fmt: fHM, delta: prevDelta(median(durs), median(pDurs)), deltaFmt: (v) => `${sgn(v, 0)} min`, good: null, ctx: `${durs.length} séances chronométrées`, color: T.strain }),
      ].join(''));

      // ---- charge
      const zc = (v) => (v >= 18 ? '#0b5fb8' : v >= 14 ? T.strain : v >= 10 ? '#6cb8ff' : '#a9d3ff');
      ts('tr-strain', { name: 'Charge', get: (x) => x.strain, color: T.strain, unit: '', digits: 1, type: 'bar', colorOf: (x) => zc(x.strain), baseKey: 'strain', yExtra: { min: 0, max: 21, interval: 7 }, onDay: SD.openDay,
        foot: (x) => `${isNum(x.activeKcal) ? nf(x.activeKcal, 0) + ' kcal actives' : ''}${x.train ? ` · muscu ${fHM(x.strMin)}` : ''}${isNum(x.rec) ? ` · récup ${nf(x.rec, 0)} %` : ''}` });

      // ---- ACWR
      const ac = SD.series(F.full, (x) => (isNum(x.acwr) ? +x.acwr.toFixed(2) : null), 3);
      const band = (a, b, c, n) => [{ yAxis: a, name: n, itemStyle: { color: c } }, { yAxis: b }];
      chart('tr-acwr', ac.length ? base({
        grid: { left: 8, right: 16, top: 18, bottom: 8, containLabel: true },
        tooltip: Object.assign(base().tooltip, { formatter: axisTip({ Ratio: (v) => `${nf(v, 2)} ${v > 1.5 ? '· risque' : v > 1.3 ? '· vigilance' : v >= 0.8 ? '· optimal' : '· sous-charge'}` }) }),
        toolbox: SD.toolbox(), dataZoom: SD.zoom(),
        xAxis: SD.xTime(), yAxis: yVal({ min: 0.4, max: (v) => Math.max(1.8, Math.ceil(v.max * 10) / 10) }),
        series: [line('Ratio', ac, T.strain, { lineStyle: { width: 2.5, color: T.strain }, markArea: { silent: true, label: { color: T.muted, fontSize: 10.5, position: 'insideRight' }, data: [band(0.4, 0.8, 'rgba(46,155,255,0.06)', 'sous-charge'), band(0.8, 1.3, 'rgba(30,215,135,0.08)', 'optimal'), band(1.3, 1.5, 'rgba(246,195,67,0.09)', 'vigilance'), band(1.5, 3, 'rgba(255,79,100,0.09)', 'risque')] } })],
      }) : base(SD.emptyOpt('Il faut 28 jours de charge pour calculer le ratio')), () => ({ cols: ['Date', 'Aiguë', 'Chronique', 'Ratio'], rows: F.full.filter((x) => isNum(x.acwr)).map((x) => [fdM(x.d), nf(x.acute, 1), nf(x.chronic, 1), nf(x.acwr, 2)]) }));

      // ---- zones de charge (un comptage par jour n'a pas de sens : au minimum par semaine)
      const g = SD.gran(), keys = SD.bucketKeys(g);
      const gz = g === 'day' ? 'week' : g, kz = SD.bucketKeys(gz);
      const ZN = [['Légère', (v) => v < 10, '#a9d3ff'], ['Modérée', (v) => v >= 10 && v < 14, '#6cb8ff'], ['Élevée', (v) => v >= 14 && v < 18, T.strain], ['Très élevée', (v) => v >= 18, '#0b5fb8']];
      const zz = kz.map((k2) => { const end = SD.bucketEnd(k2, gz); const v = F.full.filter((x) => x.d >= k2 && x.d <= end).map((x) => x.strain).filter(isNum); return ZN.map(([, f]) => v.filter(f).length); });
      setText('tr-zones-s', `Nombre de jours par niveau de charge et par ${SD.granUnit(gz)}`);
      chart('tr-zones', base({
        grid: { left: 8, right: 14, top: 30, bottom: 8, containLabel: true },
        legend: SD.ui.ecLegend(T, ZN.map((z) => z[0])),
        tooltip: Object.assign(base().tooltip, { axisPointer: { type: 'shadow' }, formatter: axisTip(Object.fromEntries(ZN.map((z) => [z[0], (v) => `${v} j`])), (x, p) => SD.bucketTitle(kz[p.dataIndex], gz)) }),
        xAxis: xCat(kz.map((k2) => SD.bucketLabel(k2, gz))), yAxis: yVal({ minInterval: 1 }),
        series: ZN.map(([n, , c], i) => bar(n, zz.map((a) => a[i]), c, { stack: 'z', itemStyle: { color: c, borderColor: T.card, borderWidth: 1, borderRadius: i === 3 ? [3, 3, 0, 0] : 0 } })),
      }), () => ({ cols: ['Période', ...ZN.map((z) => z[0])], rows: kz.map((k2, i) => [SD.bucketTitle(k2, gz), ...zz[i]]) }));

      // ---- volume par type
      const types = TYPE_ORDER.filter((t) => F.workouts.some((w) => typeKey(w.type) === t));
      const b = SD.bucketOf(g);
      const mat = new Map(types.map((t) => [t, new Map(keys.map((kk) => [kk, 0]))]));
      for (const w of F.workouts) { const m = mat.get(typeKey(w.type)); const kk = b(w.d); if (m && m.has(kk) && isNum(w.min)) m.set(kk, m.get(kk) + w.min / 60); }
      setText('tr-vol-s', `Heures enregistrées par ${SD.granUnit(g)} et par type · clic sur une barre pour zoomer`);
      const vc = chart('tr-vol', types.length ? base({
        grid: { left: 8, right: 14, top: 44, bottom: 8, containLabel: true },
        legend: Object.assign(SD.ui.ecLegend(T, types), { left: 0, right: 'auto' }),
        tooltip: Object.assign(base().tooltip, { axisPointer: { type: 'shadow' }, formatter: axisTip(Object.fromEntries(types.map((t) => [t, (v) => fHM(v * 60)])), (x, p) => SD.bucketTitle(keys[p.dataIndex], g)) }),
        xAxis: xCat(keys.map((kk) => SD.bucketLabel(kk, g))), yAxis: yVal({ name: 'h' }),
        series: types.map((t, i) => bar(t, keys.map((kk) => +mat.get(t).get(kk).toFixed(2)), typeColor(t), { stack: 'v', itemStyle: { color: typeColor(t), borderColor: T.card, borderWidth: 1, borderRadius: i === types.length - 1 ? [4, 4, 0, 0] : 0 } })),
      }) : base(SD.emptyOpt()), () => ({ cols: ['Période', ...types.map((t) => t + ' (h)')], rows: keys.map((kk) => [SD.bucketTitle(kk, g), ...types.map((t) => nf(mat.get(t).get(kk), 1))]) }));
      vc && vc.on('click', (p) => drill(keys[p.dataIndex], g));

      // ---- durées
      const sdays = F.days.filter((x) => F.strengthDays.has(x.d) && isNum(x.strMin));
      const med = sdays.map((x, i) => [tms(x.d), median(sdays.slice(Math.max(0, i - 6), i + 1).map((y) => y.strMin))]);
      const dc = chart('tr-dur', sdays.length ? base({
        grid: { left: 8, right: 14, top: 44, bottom: 8, containLabel: true },
        legend: SD.ui.ecLegend(T, ['Séance', 'Médiane 7 séances']),
        tooltip: Object.assign(base().tooltip, { formatter: axisTip({ 'Séance': fHM, 'Médiane 7 séances': fHM }) }),
        toolbox: SD.toolbox(), dataZoom: SD.zoom(),
        xAxis: SD.xTime(), yAxis: yVal({ name: 'min' }),
        series: [
          { name: 'Séance', type: 'scatter', data: sdays.map((x) => [tms(x.d), x.strMin]), symbolSize: 8, itemStyle: { color: T.strain, opacity: 0.6, borderColor: T.card, borderWidth: 1 } },
          line('Médiane 7 séances', med, T.ink),
        ],
      }) : base(SD.emptyOpt('Aucune séance chronométrée')), () => ({ cols: ['Date', 'Durée', 'Split'], rows: sdays.map((x) => [fdM(x.d), fHM(x.strMin), x.split || '—']) }));
      dc && dc.on('click', (p) => p.seriesName === 'Séance' && SD.openDay(dstr(p.value[0])));

      // ---- splits
      const sd2 = F.days.filter((x) => F.strengthDays.has(x.d));
      const sc = SPLITS.map((s) => ({ s, n: sd2.filter((x) => x.split === s).length })).filter((o) => o.n);
      chart('tr-split', sc.length ? base({
        grid: { left: 16, right: 44, top: 6, bottom: 6, containLabel: true },
        tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => tipBox(p.name, [{ color: splitColor(p.name), box: true, value: p.value, name: `séances (${nf((p.value / sd2.length) * 100, 0)} %)` }]) }),
        xAxis: yVal({ axisLabel: { show: false }, splitLine: { show: false } }),
        yAxis: xCat(sc.map((o) => o.s), { inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 12.5 } }),
        series: [{ type: 'bar', barMaxWidth: 16, data: sc.map((o) => ({ value: o.n, itemStyle: { color: splitColor(o.s), borderRadius: [0, 4, 4, 0] } })), label: { show: true, position: 'right', color: T.ink2 } }],
      }) : base(SD.emptyOpt('Aucune séance de musculation')), () => ({ cols: ['Split', 'Séances'], rows: sc.map((o) => [o.s, o.n]) }));
      const present = SPLITS.filter((s) => sd2.some((x) => x.split === s));
      chart('tr-splitwd', present.length ? base({
        grid: { left: 8, right: 8, top: 32, bottom: 6, containLabel: true },
        legend: Object.assign(SD.ui.ecLegend(T, present), { left: 0, right: 'auto' }),
        tooltip: Object.assign(base().tooltip, { axisPointer: { type: 'shadow' }, formatter: axisTip(Object.fromEntries(present.map((s) => [s, (v) => nf(v, 0)])), (x, p) => WDL[p.dataIndex]) }),
        xAxis: xCat(WD), yAxis: yVal({ minInterval: 1 }),
        series: present.map((s, i) => bar(s, WD.map((_, w) => sd2.filter((x) => x.wd === w && x.split === s).length), splitColor(s), { stack: 'w', itemStyle: { color: splitColor(s), borderColor: T.card, borderWidth: 1, borderRadius: i === present.length - 1 ? [4, 4, 0, 0] : 0 } })),
      }) : base(SD.emptyOpt('Aucune séance de musculation')), () => ({ cols: ['Jour', ...present], rows: WD.map((_, w) => [WDL[w], ...present.map((s) => sd2.filter((x) => x.wd === w && x.split === s).length)]) }));

      // ---- heure de début (seul TrainAI la fournit : sans séance datée sur la période, on montre tout l'historique)
      const inRange = M.raw.sessionStarts.filter((s) => F.dates.has(s.d));
      const stt = inRange.length ? inRange : M.raw.sessionStarts;
      const sd0 = stt.length ? stt.reduce((a, s) => (s.d < a ? s.d : a), stt[0].d) : null, sd1 = stt.length ? stt.reduce((a, s) => (s.d > a ? s.d : a), stt[0].d) : null;
      setText('tr-hour-s', !stt.length ? 'Heure de début des séances (fournie par TrainAI)' : inRange.length ? `${stt.length} séances TrainAI sur la période` : `Aucune heure de début sur la période : historique TrainAI complet (${fdate(sd0, { month: 'short', year: 'numeric' })} → ${fdate(sd1, { month: 'short', year: 'numeric' })}, ${stt.length} séances)`);
      const hours = [];
      for (let h = 5; h <= 23; h++) hours.push(h);
      chart('tr-hour', stt.length ? base({
        grid: { left: 8, right: 8, top: 16, bottom: 6, containLabel: true },
        tooltip: Object.assign(base().tooltip, { axisPointer: { type: 'shadow' }, formatter: axisTip({ 'Séances': (v) => nf(v, 0) }, (x) => `Début entre ${x} h et ${+x + 1} h`) }),
        xAxis: xCat(hours.map(String), { axisLabel: { color: T.muted, formatter: '{value} h' } }), yAxis: yVal({ minInterval: 1 }),
        series: [bar('Séances', hours.map((h) => stt.filter((s) => s.h === h).length), T.strain)],
      }) : base(SD.emptyOpt('Aucune heure de début disponible (seul l’export TrainAI la fournit)')), () => ({ cols: ['Heure', 'Séances'], rows: hours.map((h) => [h + ' h', stt.filter((s) => s.h === h).length]) }));

      // ---- journal
      const rows = F.days.filter((x) => x.w.length).slice().reverse().slice(0, 250);
      setHTML('tr-log-b', rows.length ? `<table class="t"><thead><tr><th>Date</th><th>Activités</th><th>Split</th><th class="num">Durée muscu</th><th class="num">Charge</th><th class="num">Récup J+1</th><th class="num">Exercices</th><th class="num">Séries</th><th class="num">Volume</th><th>Notes</th></tr></thead><tbody>${rows.map((x) => {
        const vol = sum(pluck(x.ex, (e) => e.vol)), sets = sum(pluck(x.ex, (e) => e.sets));
        const notes = M.raw.notes.filter((n) => n.d === x.d);
        const nx = M.at(addD(x.d, 1));
        return `<tr class="clickable" data-day="${x.d}"><td>${esc(fdate(x.d, { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' }))}</td><td>${esc(x.w.map((w) => w.type).join(', '))}</td><td>${esc(x.split || '')}</td><td class="num">${esc(x.train ? fHM(x.strMin) : '')}</td><td class="num">${nf(x.strain, 1)}</td><td class="num" style="color:${nx && isNum(nx.rec) ? SD.recColor(nx.rec) : 'inherit'}">${nx && isNum(nx.rec) ? nf(nx.rec, 0) + ' %' : '—'}</td><td class="num">${x.ex.length || ''}</td><td class="num">${sets || ''}</td><td class="num">${vol ? nf(vol, 0) + ' kg' : ''}</td><td>${notes.length ? `${notes.length} note${notes.length > 1 ? 's' : ''}` : ''}${x.ex.some((e) => e.pr) ? ' · <b style="color:var(--good)">PR</b>' : ''}</td></tr>`;
      }).join('')}</tbody></table>` : '<div class="empty">Aucune séance sur la période.</div>');
    },
  };

  SD.PAGES.training = training;
})();
