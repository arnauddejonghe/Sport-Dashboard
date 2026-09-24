/* Page « Journal » : saisie du jour, fil des entrées (journal, retours, coach, notes de séance, humeur Apple), impact des habitudes. */
(function () {
  'use strict';
  const SD = window.SD;
  const { isNum, nf, sgn, fdM, esc, tms, mean, chart, base, tipBox, axisTip, xCat, yVal, line } = SD;
  const { card, setHTML, setText } = SD.ui;
  let shown = 40;

  const journal = {
    id: 'journal', title: 'Journal', sub: 'Ton ressenti au quotidien, les retours du coach et l’impact mesuré de tes habitudes sur la récupération.',
    html() {
      return `<section class="card c5"><div class="card-h"><div><h2>Entrée du jour</h2><p class="sub" id="jr-sub"></p></div>
          <div class="card-tools"><button type="button" class="btn icon-btn" data-dayshift="-1" aria-label="Jour précédent">‹</button><input type="date" class="field" id="jr-pick" aria-label="Jour"><button type="button" class="btn icon-btn" data-dayshift="1" aria-label="Jour suivant">›</button></div></div><div id="jr-form"></div></section>
        <section class="card c7"><div class="card-h"><div><h2>Fil du journal</h2><p class="sub" id="jr-list-s"></p></div></div><div class="entries" id="jr-list"></div><button type="button" class="link" id="jr-more" hidden>Afficher plus</button></section>
        ${card('c7', 'jr-imp', 'Impact des habitudes sur la récupération du lendemain', 'Écart de récupération le lendemain avec ou sans l’habitude, corrigé de ta récupération du jour même · ● = écart net (|t| ≥ 2,5, n ≥ 8) · une association, pas une preuve de cause', '', { h: 'tall' })}
        ${card('c5', 'jr-mood', 'Ressenti', 'Échelles de 1 à 5 saisies dans le journal')}
        ${card('c6', 'jr-pain', 'Douleurs', 'Échelle de 0 à 10 par zone')}
        ${card('c6', 'jr-coach', 'Scores du coach vs note du jour', 'Rapports du journal coach (Préparation, Momentum, Global) et note du jour du dashboard')}`;
    },
    update() {
      const { M, F, S, T } = SD;
      const J = SD.journal;
      if (!S.day || !M.at(S.day)) S.day = M.lastComplete;
      const pick = document.getElementById('jr-pick');
      if (pick) { pick.value = S.day; pick.min = M.first; pick.max = M.last; }
      setText('jr-sub', `${SD.fdate(S.day, { weekday: 'long', day: 'numeric', month: 'long' })} · ${J.mode === 'db' ? 'synchronisé entre tes appareils' : 'enregistré dans ce navigateur'}`);
      J.renderDay(document.getElementById('jr-form'), S.day);

      // ---- fil
      const days = F.days.slice().reverse().filter((x) => J.entries.has(x.d) || M.coach.has(x.d) || isNum(x.mood) || M.raw.notes.some((n) => n.d === x.d));
      setText('jr-list-s', `${days.length} jours avec au moins une entrée sur la période`);
      setHTML('jr-list', days.slice(0, shown).map((x) => {
        const e = J.entries.get(x.d);
        const lines = [];
        if (e) {
          const sc = J.SCALES.filter(([k]) => isNum(e[k])).map(([k, l]) => `${l} ${e[k]}/5`);
          const pn = Object.entries(e.pain || {}).filter(([, v]) => isNum(v) && v > 0).map(([k, v]) => `douleur ${k.toLowerCase()} ${v}/10`);
          const tg = (e.tags || []).map((id) => J.labels()[id] || id);
          lines.push(`<p><span class="src">Journal</span>${esc([...sc, ...pn].join(' · '))}${tg.length ? ` · <b>${esc(tg.join(', '))}</b>` : ''}${e.text ? ` — ${esc(e.text)}` : ''}</p>`);
        }
        for (const n of M.raw.notes.filter((n) => n.d === x.d)) lines.push(`<p><span class="src">${esc(n.src === 'journal' ? 'Retours' : n.src === 'séance' ? 'Séance' : 'Nutrition')}</span>${n.ex ? `<b>${esc(n.ex)}</b> · ` : ''}${esc(n.text)}</p>`);
        const co = M.coach.get(x.d);
        if (co) lines.push(`<p><span class="src">Coach</span>${co.scores && isNum(co.scores.global) ? `<b>Global ${nf(co.scores.global, 0)}</b> · ` : ''}${esc(co.verdict || '')}</p>`);
        if (isNum(x.mood)) lines.push(`<p><span class="src">Apple</span>Humeur ${esc(J.moodLabel(x.mood))}</p>`);
        return `<div class="entry" data-day="${x.d}" style="cursor:pointer"><div class="mini"><b style="color:${SD.recColor(x.rec)}">${isNum(x.rec) ? nf(x.rec, 0) : '—'}</b><span>récup</span><b style="color:${T.strain}">${isNum(x.strain) ? nf(x.strain, 1) : '—'}</b><span>charge</span></div>
          <div><h3>${esc(SD.fdate(x.d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</h3>${lines.join('')}</div></div>`;
      }).join('') || '<div class="empty">Aucune entrée sur la période. Remplis l’entrée du jour à gauche : chaque note enrichit l’analyse d’impact.</div>');
      document.querySelectorAll('#jr-list .entry').forEach((el) => { el.onclick = () => { SD.setDay(el.dataset.day); SD.refresh(); document.getElementById('jr-form').scrollIntoView({ behavior: 'smooth', block: 'start' }); }; });
      const more = document.getElementById('jr-more');
      more.hidden = days.length <= shown;
      more.onclick = () => { shown += 40; journal.update(); };

      // ---- impact
      const imp = SD.scores.tagImpact(F.days, J.manualTags(), J.labels());
      const el = document.getElementById('jr-imp');
      if (el) el.style.height = Math.max(240, imp.length * 30 + 60) + 'px';
      chart('jr-imp', imp.length ? base({
        grid: { left: 16, right: 70, top: 10, bottom: 24, containLabel: true },
        tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => { const r = imp[p.dataIndex]; return tipBox(r.label, [{ color: r.d >= 0 ? T.good : T.crit, box: true, value: sgn(r.d, 1) + ' pts', name: 'récupération le lendemain (corrigée)' }], `Avec : ${r.nYes} jours · sans : ${r.nNo} jours · t = ${nf(r.t, 2)}${r.sig ? ' · écart net' : ' · pas assez net pour conclure'}${r.manual ? ' · tag du journal' : ' · détecté automatiquement'}`); } }),
        xAxis: yVal({ axisLabel: { color: T.muted, formatter: (v) => sgn(v, 0) }, name: 'points de récupération', nameLocation: 'middle', nameGap: 24 }),
        yAxis: xCat(imp.map((r) => (r.sig ? '● ' : '') + r.label), { axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 12 } }),
        series: [{ type: 'bar', barMaxWidth: 16, data: imp.map((r) => ({ value: +r.d.toFixed(1), itemStyle: { color: r.d >= 0 ? T.good : T.crit, opacity: r.sig ? 1 : 0.5, borderRadius: r.d >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })),
          label: { show: true, position: 'right', color: T.ink2, fontSize: 11, formatter: (p) => `${sgn(p.value, 1)} (n ${imp[p.dataIndex].nYes})` } }],
      }) : base(SD.emptyOpt('Pas assez de jours avec et sans habitude pour mesurer un impact')), () => ({ cols: ['Habitude', 'Impact (pts)', 'n avec', 'n sans', 't', 'Significatif'], rows: imp.map((r) => [r.label, sgn(r.d, 1), r.nYes, r.nNo, nf(r.t, 2), r.sig ? 'oui' : 'non']) }));
      if (SD.charts.get('jr-imp')) SD.charts.get('jr-imp').resize();

      // ---- ressenti
      const ent = [...J.entries.values()].filter((e) => e.d >= S.from && e.d <= S.to).sort((a, b) => a.d.localeCompare(b.d));
      const colors = [T.sleep, T.nutri, T.crit, T.act];
      const moodSeries = J.SCALES.map(([k, l], i) => line(l, ent.filter((e) => isNum(e[k])).map((e) => [tms(e.d), e[k]]), colors[i], { showSymbol: true, symbolSize: 6 })).filter((s) => s.data.length);
      chart('jr-mood', moodSeries.length ? base({
        grid: { left: 8, right: 14, top: 30, bottom: 8, containLabel: true },
        legend: SD.ui.ecLegend(T, moodSeries.map((s) => s.name)),
        tooltip: Object.assign(base().tooltip, { formatter: axisTip(Object.fromEntries(moodSeries.map((s) => [s.name, (v) => v + ' / 5']))) }),
        xAxis: SD.xTime(), yAxis: yVal({ min: 1, max: 5, interval: 1 }),
        series: moodSeries,
      }) : base(SD.emptyOpt('Pas encore d’entrée de ressenti sur la période')), () => ({ cols: ['Date', ...J.SCALES.map((s) => s[1])], rows: ent.map((e) => [fdM(e.d), ...J.SCALES.map(([k]) => (isNum(e[k]) ? e[k] : '—'))]) }));

      const sites = J.painSites();
      const painSeries = sites.map((p, i) => line(p, ent.filter((e) => e.pain && isNum(e.pain[p])).map((e) => [tms(e.d), e.pain[p]]), [T.crit, T.warn, T.body, T.nutri][i % 4], { showSymbol: true, symbolSize: 6 })).filter((s) => s.data.length);
      chart('jr-pain', painSeries.length ? base({
        grid: { left: 8, right: 14, top: 30, bottom: 8, containLabel: true },
        legend: SD.ui.ecLegend(T, painSeries.map((s) => s.name)),
        tooltip: Object.assign(base().tooltip, { formatter: axisTip(Object.fromEntries(painSeries.map((s) => [s.name, (v) => v + ' / 10']))) }),
        xAxis: SD.xTime(), yAxis: yVal({ min: 0, max: 10, interval: 2 }),
        series: painSeries,
      }) : base(SD.emptyOpt('Pas encore de douleur notée sur la période')), () => ({ cols: ['Date', ...sites], rows: ent.map((e) => [fdM(e.d), ...sites.map((p) => (e.pain && isNum(e.pain[p]) ? e.pain[p] : '—'))]) }));

      // ---- coach vs note du jour
      const co = (M.raw.coach || []).filter((c) => c.d >= S.from && c.d <= S.to && c.scores);
      const cs = [['preparation', 'Préparation', T.rec], ['momentum', 'Momentum', T.nutri], ['global', 'Global coach', T.age]].map(([k, l, c]) => line(l, co.filter((q) => isNum(q.scores[k])).map((q) => [tms(q.d), q.scores[k]]), c, { showSymbol: true, symbolSize: 7 })).filter((s) => s.data.length);
      const mine = F.full.filter((x) => isNum(SD.scores.dayScore(x)) && (!co.length || x.d >= co[0].d)).map((x) => [tms(x.d), Math.round(SD.scores.dayScore(x))]);
      chart('jr-coach', cs.length ? base({
        grid: { left: 8, right: 14, top: 30, bottom: 8, containLabel: true },
        legend: SD.ui.ecLegend(T, [...cs.map((s) => s.name), 'Note du jour']),
        tooltip: Object.assign(base().tooltip, { formatter: axisTip({}) }),
        xAxis: SD.xTime(Object.assign({ minInterval: SD.DAY }, co.length ? { min: tms(co[0].d) - 2 * SD.DAY, max: tms(co[co.length - 1].d) + SD.DAY } : {})), yAxis: yVal({ min: 0, max: 100 }),
        series: [...cs, line('Note du jour', mine, T.ink2, { lineStyle: { width: 1.5, color: T.ink2 } })],
      }) : base(SD.emptyOpt('Aucun rapport coach sur la période (synchronise Google Drive pour les récupérer)')), () => ({ cols: ['Date', 'Préparation', 'Momentum', 'Global', 'Verdict'], rows: co.map((q) => [fdM(q.d), nf(q.scores.preparation, 0), nf(q.scores.momentum, 0), nf(q.scores.global, 0), q.verdict]) }));
    },
  };

  SD.PAGES.journal = journal;
})();
