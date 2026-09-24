/* Page « Physique » : poids et projection, composition, mensurations complètes, photos avant / après,
 * et ce qui fait bouger le poids, la masse grasse et la force (analyse par semaine). */
(function () {
  'use strict';
  const SD = window.SD;
  const { isNum, nf, sgn, fdM, fdS, esc, tms, addD, pluck, mean, median, chart, base, tipBox, axisTip, xCat, yVal, line, kpi, spark, ts } = SD;
  const { card, seg, setHTML, setText } = SD.ui;

  // ================================================================ mensurations
  const PAIRS = [['Bras G', 'Bras D'], ['Avant-bras G', 'Avant-bras D'], ['Cuisse G', 'Cuisse D'], ['Mollet G', 'Mollet D'], ['Poignet G', 'Poignet D'], ['Cheville G', 'Cheville D']];
  const M_ORDER = ['Cou', 'Épaules', 'Poitrine', 'Buste', 'Tour de taille', 'Hanches', 'Bras G', 'Bras D', 'Avant-bras G', 'Avant-bras D', 'Poignet G', 'Poignet D', 'Cuisse G', 'Cuisse D', 'Mollet G', 'Mollet D', 'Cheville G', 'Cheville D', 'Masse grasse visuelle (%)'];
  const unitOf = (m) => (/%/.test(m) ? '%' : 'cm');
  /** Valeur d'une mesure la plus proche d'une date (± tol jours) */
  function nearestBody(key, d, tol) {
    let best = null, bd = Infinity;
    for (const x of SD.M.raw.body) {
      if (!isNum(x[key])) continue;
      const dd = Math.abs(SD.nDays(x.d, d) - 1);
      if (dd < bd) { bd = dd; best = x; }
    }
    return best && bd <= tol ? best : null;
  }
  function nearestDay(d, key, tol) {
    for (let k = 0; k <= tol; k++) for (const s of k ? [-k, k] : [0]) { const y = SD.M.at(addD(d, s)); if (y && isNum(y[key])) return y; }
    return null;
  }

  // ================================================================ leviers (analyse par semaine)
  const DRIVERS = [
    ['kcal', 'Calories', 'kcal/j', 0], ['bal', 'Balance vs dépense', 'kcal/j', 0], ['protkg', 'Protéines', 'g/kg', 2], ['steps', 'Pas', 'pas/j', 0],
    ['sleep', 'Sommeil', 'h/nuit', 2], ['sessions', 'Séances de muscu', '/sem', 0], ['sets', 'Séries de travail', '/sem', 0], ['rec', 'Récupération', '%', 0],
    ['strain', 'Charge', '/100', 0], ['alc', 'Alcool', 'g/sem', 0],
  ];
  const OUTCOMES = {
    trend: { label: 'Poids tendance', unit: 'kg/sem', d: 2, what: 'variation du poids tendance la semaine suivante', good: null },
    fat: { label: 'Masse grasse', unit: 'pt/sem', d: 2, what: 'variation de la masse grasse (balance) la semaine suivante', good: -1 },
    strength: { label: 'Force', unit: '%', d: 1, what: 'e1RM de la semaine vs ta moyenne des 6 semaines précédentes, exercice par exercice', good: 1 },
  };
  function weeklyTable(from, to) {
    const M = SD.M;
    const w0 = SD.weekOf(from), rows = [];
    for (let w = w0; w <= to; w = addD(w, 7)) {
      const ds = [];
      for (let i = 0; i < 7; i++) { const y = M.at(addD(w, i)); if (y && !y.partial) ds.push(y); }
      if (ds.length < 4) continue;
      const lg = ds.filter(SD.logged);
      const avg = (arr, f) => { const v = pluck(arr, f); return v.length >= 3 ? mean(v) : null; };
      const ex = ds.flatMap((y) => y.ex);
      const r = {
        w, kcal: lg.length >= 3 ? mean(pluck(lg, (y) => y.kcal)) : null,
        bal: lg.length >= 3 ? avg(lg, (y) => (isNum(y.tdee) ? y.kcal - y.tdee : null)) : null,
        protkg: lg.length >= 3 ? avg(lg, (y) => (isNum(y.prot) && isNum(y.trendW) ? y.prot / y.trendW : null)) : null,
        steps: avg(ds, (y) => y.steps), sleep: avg(ds, (y) => y.sleepH), rec: avg(ds, (y) => y.rec), strain: avg(ds, (y) => y.strain),
        sessions: ds.filter((y) => y.train).length, sets: ex.length ? SD.sum(pluck(ex, (e) => e.sets)) : null,
        alc: lg.length >= 3 ? SD.sum(lg.map((y) => y.alcohol || 0)) : null,
      };
      // résultats
      const tEnd = nearestDay(addD(w, 6), 'trendW', 2), tNext = nearestDay(addD(w, 13), 'trendW', 2);
      r.trend = tEnd && tNext && tNext.d > tEnd.d ? ((tNext.trendW - tEnd.trendW) / (SD.nDays(tEnd.d, tNext.d) - 1)) * 7 : null;
      const bfA = pluck(ds, (y) => y.bodyFat), bfB = [];
      for (let i = 7; i < 14; i++) { const y = M.at(addD(w, i)); if (y && isNum(y.bodyFat)) bfB.push(y.bodyFat); }
      r.fat = bfA.length >= 2 && bfB.length >= 2 ? mean(bfB) - mean(bfA) : null;
      const rel = [];
      for (const e of ex) {
        if (!isNum(e.e1)) continue;
        const hist = M.raw.exercises.filter((q) => q.n === e.n && q.s === e.s && isNum(q.e1) && q.d < w && q.d >= addD(w, -42)).map((q) => q.e1);
        if (hist.length >= 2) rel.push((e.e1 / mean(hist) - 1) * 100);
      }
      r.strength = rel.length >= 2 ? mean(rel) : null;
      rows.push(r);
    }
    return rows;
  }
  function drivers(rows, outKey) {
    const out = [];
    for (const [k, label, unit, dig] of DRIVERS) {
      const pts = rows.filter((r) => isNum(r[k]) && isNum(r[outKey])).map((r) => [r[k], r[outKey]]);
      const n = pts.length;
      if (n < 8) continue;
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const mx = mean(xs), my = mean(ys);
      let sxy = 0, sxx = 0, syy = 0;
      for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
      if (!sxx || !syy) continue;
      const r = sxy / Math.sqrt(sxx * syy);
      const t = r * Math.sqrt((n - 2) / Math.max(1e-9, 1 - r * r));
      const sorted = pts.slice().sort((a, b) => a[0] - b[0]);
      const k3 = Math.max(3, Math.floor(n / 3));
      const lo = sorted.slice(0, k3), hi = sorted.slice(-k3);
      out.push({ k, label, unit, dig, n, r, t, sig: Math.abs(t) >= 2.5, lo: { max: lo[lo.length - 1][0], y: mean(lo.map((p) => p[1])), n: lo.length }, hi: { min: hi[0][0], y: mean(hi.map((p) => p[1])), n: hi.length } });
    }
    return out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  }

  // ================================================================ photos
  let local = [];
  const ph = { a: null, b: null, loadingList: false };

  const physique = {
    id: 'physique', title: 'Physique',
    sub: 'Ce qui compte pour l’objectif visuel : poids, composition, mensurations, photos, et ce qui les fait bouger.',
    html() {
      const S = SD.S;
      return `<div class="kpis" id="ph-k"></div>
        ${card('c12', 'ph-weight', 'Poids & projection', '', '', { h: 'xtall' })}
        <section class="card c12" id="ph-photos"><div class="card-h"><div><h2>Photos avant / après</h2><p class="sub" id="ph-photos-s"></p></div>
          <div class="card-tools">${seg('photoPose', [['all', 'Toutes'], ['Face', 'Face'], ['Profil', 'Profil'], ['Dos', 'Dos']], S.photoPose)}${seg('photoMode', [['side', 'Côte à côte'], ['slider', 'Curseur']], S.photoMode)}
            <label class="btn" for="ph-file">Depuis l’appareil</label><input type="file" id="ph-file" accept="image/*" multiple hidden></div></div>
          <div id="ph-photos-b"></div></section>
        ${card('c6', 'ph-fat', 'Masse grasse', '% estimé par la balance connectée (tendance, pas une mesure exacte)')}
        ${card('c6', 'ph-lean', 'Masse maigre', 'Estimée par la balance connectée (Apple Santé)')}
        <section class="card c12"><div class="card-h"><div><h2>Mensurations</h2><p class="sub" id="ph-meas-s"></p></div></div><div id="ph-ratios" class="ratios"></div><div id="ph-meas-b" class="mgrid"></div></section>
        ${card('c12', 'ph-mchart', 'Évolution d’une mesure', 'Tout l’historique MacroFactor · clic sur une tuile ci-dessus pour changer de mesure', '<select class="fselect" id="ph-meas-sel" data-state="measure" aria-label="Mesure"></select>', { h: 'short' })}
        <section class="card c12"><div class="card-h"><div><h2>Ce qui fait bouger ton physique</h2><p class="sub" id="ph-lev-s"></p></div><div class="card-tools">${seg('lever', [['trend', 'Poids'], ['fat', 'Masse grasse'], ['strength', 'Force']], S.lever)}</div></div>
          <div class="lev"><div class="chart tall" id="ph-lev"></div><div id="ph-lev-b" class="lev-list"></div></div></section>`;
    },
    update() {
      const { M, F, S, T } = SD, cfg = M.cfg.targets;
      // ---- indicateurs
      const tw = F.days.filter((x) => isNum(x.trendW));
      const a = tw[0], b = tw[tw.length - 1];
      const wks = a && b ? (SD.nDays(a.d, b.d) - 1) / 7 : 0;
      const rate = wks >= 1 ? (b.trendW - a.trendW) / wks : null;
      const phase = (M.at(S.to) || {}).phase;
      const rt = phase && cfg.weeklyRate && cfg.weeklyRate[phase];
      const bf = F.days.filter((x) => isNum(x.bodyFat));
      const waistL = nearestBody('Tour de taille', S.to, 3650), shL = nearestBody('Épaules', S.to, 3650);
      const waistF = M.raw.body.find((x) => x.d >= S.from && isNum(x['Tour de taille']));
      const hCm = M.raw.profile && M.raw.profile.heightCm;
      const adonis = waistL && shL && shL.d === waistL.d ? shL['Épaules'] / waistL['Tour de taille'] : null;
      setHTML('ph-k', [
        kpi({ label: 'Poids tendance', value: b ? b.trendW : null, unit: 'kg', digits: 1, delta: a && b && a !== b ? b.trendW - a.trendW : null, deltaFmt: (v) => `${sgn(v, 1)} kg sur la période`, deltaLabel: '', good: null, ctx: b ? `Source : ${b.trendSrc === 'MacroFactor' ? 'Trend Weight MacroFactor' : 'moyenne des pesées'}` : '', color: T.body }),
        kpi({ label: 'Rythme', value: rate, digits: 2, unit: 'kg/sem', fmt: (v) => sgn(v, 2), ctx: phase ? `Phase ${esc(phase)}${rt ? ` · cible ${sgn(rt[0], 2)} à ${sgn(rt[1], 2)}` : ''}` : '', status: rt && isNum(rate) ? ' ' + (rate < rt[0] ? '<span class="status warn">Sous la cible</span>' : rate > rt[1] ? '<span class="status warn">Au-dessus</span>' : '<span class="status good">Dans la cible</span>') : '', color: T.body }),
        kpi({ label: 'Masse grasse', value: bf.length ? bf[bf.length - 1].bodyFat : null, unit: '%', digits: 1, delta: bf.length >= 2 ? bf[bf.length - 1].bodyFat - bf[0].bodyFat : null, deltaFmt: (v) => `${sgn(v, 1)} pt sur la période`, deltaLabel: '', good: 'down', color: T.body }),
        kpi({ label: 'Tour de taille', value: waistL ? waistL['Tour de taille'] : null, unit: 'cm', digits: 1, delta: waistL && waistF && waistF !== waistL ? waistL['Tour de taille'] - waistF['Tour de taille'] : null, deltaFmt: (v) => `${sgn(v, 1)} cm sur la période`, deltaLabel: '', good: 'down', ctx: waistL ? `Mesuré le ${esc(fdM(waistL.d))}${hCm ? ` · taille/hauteur ${nf(waistL['Tour de taille'] / hCm, 2)}` : ''}` : '', color: T.body }),
        kpi({ label: 'Épaules / taille', value: adonis, digits: 2, ctx: adonis ? `Idéal esthétique ≈ 1,6 (« indice d’Adonis ») · ${esc(fdM(waistL.d))}` : 'Mesure les épaules et la taille le même jour', meter: adonis ? Math.min(100, (adonis / 1.618) * 100) : null, color: T.body }),
      ].join(''));

      // ---- poids
      const proj = SD.ui.weightChart('ph-weight', { projection: true });
      setText('ph-weight-s', proj ? `Tendance des 28 derniers jours : ${sgn(proj.slopeWeek, 2)} kg/sem → ${nf(proj.end.y, 1)} kg le ${fdM(proj.end.d)} (± ${nf((proj.end.hi - proj.end.lo) / 2, 1)} kg, indicatif) · Maj + molette pour zoomer` : 'Pesées et poids tendance · bandes = phases');
      ts('ph-fat', { name: 'Masse grasse', get: (x) => x.bodyFat, color: T.body, unit: '%', digits: 1, type: 'line', gap: 21, onDay: SD.openDay });
      ts('ph-lean', { name: 'Masse maigre', get: (x) => x.lean, color: T.act, unit: 'kg', digits: 1, type: 'line', gap: 21, onDay: SD.openDay });

      // ---- mensurations complètes (tout l'historique)
      const all = M.raw.body.slice().sort((p, q) => p.d.localeCompare(q.d));
      const keys = [...new Set(all.flatMap((x) => Object.keys(x).filter((k) => k !== 'd')))].sort((p, q) => (M_ORDER.indexOf(p) + 1 || 99) - (M_ORDER.indexOf(q) + 1 || 99));
      const dates = [...new Set(all.map((x) => x.d))];
      setText('ph-meas-s', all.length ? `${keys.length} mesures, ${dates.length} relevés du ${fdM(dates[0])} au ${fdM(dates[dates.length - 1])} (MacroFactor) · écart depuis le 1er relevé et depuis le précédent` : 'Aucune mensuration : saisis-les dans MacroFactor (Body Metrics), elles arrivent avec l’export complet.');
      const series = (k) => all.filter((x) => isNum(x[k])).map((x) => [x.d, x[k]]);
      if (!keys.includes(S.measure)) S.measure = keys.includes('Tour de taille') ? 'Tour de taille' : keys[0];
      const pairOf = (k) => { const p = PAIRS.find((q) => q.includes(k)); return p ? p.find((q) => q !== k) : null; };
      setHTML('ph-meas-b', keys.map((k) => {
        const s = series(k);
        const last = s[s.length - 1], first = s[0], prev = s[s.length - 2];
        const u = unitOf(k);
        const good = k === 'Tour de taille' || /%/.test(k) || k === 'Hanches' ? -1 : 1;
        const dl = (v) => (isNum(v) && Math.abs(v) >= 0.05 ? `<span class="delta ${v * good > 0 ? 'up-good' : 'down-bad'}">${sgn(v, 1)}</span>` : '<span class="delta flat">=</span>');
        const other = pairOf(k), o = other ? series(other).find((q) => q[0] === last[0]) : null;
        return `<button type="button" class="mtile" data-measure="${esc(k)}" aria-pressed="${k === S.measure}"><span class="n">${esc(k.replace(' (%)', ''))}</span>
          <span class="v">${nf(last[1], 1)}<small>${u}</small></span>
          <span class="d">${first && s.length > 1 ? `${dl(last[1] - first[1])} depuis ${esc(fdate2(first[0]))}` : 'un seul relevé'}${prev ? ` · ${dl(last[1] - prev[1])} vs préc.` : ''}</span>
          <span class="d">${esc(fdM(last[0]))}${o && /G$/.test(k) ? ` · écart G/D ${sgn(last[1] - o[1], 1)} cm` : ''}</span>
          ${spark(s.map((q) => q[1]), T.body, 26)}</button>`;
      }).join('') || '<div class="empty">Aucune mensuration enregistrée.</div>');
      document.querySelectorAll('#ph-meas-b .mtile').forEach((el) => { el.onclick = () => { S.measure = el.dataset.measure; SD.refresh(); }; });
      // ratios
      const last = (k) => { const s = series(k); return s.length ? s[s.length - 1] : null; };
      const wL = last('Tour de taille'), eL = last('Épaules'), cL = last('Poitrine');
      const ratio = (lab, v, target, note) => `<div class="ratio"><span>${lab}</span><b>${isNum(v) ? nf(v, 2) : '—'}</b><small>${note}</small></div>`;
      setHTML('ph-ratios', all.length ? [
        ratio('Taille / hauteur', wL && hCm ? wL[1] / hCm : null, 0.5, 'repère santé : &lt; 0,50 (Ashwell 2012)'),
        ratio('Épaules / taille', wL && eL ? eL[1] / wL[1] : null, 1.618, 'repère esthétique : ≈ 1,6'),
        ratio('Poitrine / taille', wL && cL ? cL[1] / wL[1] : null, null, 'plus c’est haut, plus le « V » est marqué'),
      ].join('') : '');
      const msel = document.getElementById('ph-meas-sel');
      if (msel) msel.innerHTML = keys.map((k) => `<option${k === S.measure ? ' selected' : ''}>${esc(k)}</option>`).join('');
      const mp = series(S.measure || '');
      chart('ph-mchart', mp.length ? base({
        grid: { left: 8, right: 14, top: 16, bottom: 8, containLabel: true },
        tooltip: Object.assign(base().tooltip, { formatter: axisTip({ [S.measure]: (v) => nf(v, 1) + ' ' + unitOf(S.measure) }) }),
        xAxis: { type: 'time', axisLine: { lineStyle: { color: T.axis } }, axisTick: { show: false }, axisLabel: { color: T.muted, hideOverlap: true, formatter: (v) => fdS(SD.dstr(v)) + ' ' + SD.dstr(v).slice(2, 4) }, splitLine: { show: false } },
        yAxis: yVal({ scale: true, name: unitOf(S.measure) }),
        series: [line(S.measure, mp.map((q) => [tms(q[0]), q[1]]), T.body, { showSymbol: true, symbolSize: 8 })],
      }) : base(SD.emptyOpt('Aucune mesure')), () => ({ cols: ['Date', S.measure], rows: mp.map((q) => [fdM(q[0]), nf(q[1], 1)]) }));

      // ---- leviers
      const from = S.from < addD(S.to, -26 * 7) ? S.from : addD(S.to, -26 * 7);
      const rows = weeklyTable(from, S.to);
      const O = OUTCOMES[S.lever] || OUTCOMES.trend;
      const drv = drivers(rows, S.lever);
      const nW = rows.filter((r) => isNum(r[S.lever])).length;
      setText('ph-lev-s', `${nW} semaines analysées (${fdM(from)} → ${fdM(S.to)}, au moins 26 semaines) · résultat : ${O.what} · barres = corrélation de Pearson, pleine si le lien est net (|t| ≥ 2,5)`);
      const levEl = document.getElementById('ph-lev');
      if (levEl) levEl.style.height = Math.max(260, drv.length * 30 + 40) + 'px';
      chart('ph-lev', drv.length ? base({
        grid: { left: 16, right: 40, top: 10, bottom: 24, containLabel: true },
        tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => { const q = drv[p.dataIndex]; return tipBox(q.label, [{ color: q.r >= 0 ? T.s[0] : T.s[1], box: true, value: nf(q.r, 2), name: 'corrélation' }], `${q.n} semaines · t = ${nf(q.t, 1)}${q.sig ? ' · lien net' : ' · pas assez net'}`); } }),
        xAxis: yVal({ min: -1, max: 1, interval: 0.5, axisLabel: { color: T.muted, formatter: (v) => nf(v, 1) } }),
        yAxis: xCat(drv.map((q) => q.label), { inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 12 } }),
        series: [{ type: 'bar', barMaxWidth: 14, data: drv.map((q) => ({ value: +q.r.toFixed(2), itemStyle: { color: q.r >= 0 ? T.s[0] : T.s[1], opacity: q.sig ? 1 : 0.35, borderRadius: q.r >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })),
          label: { show: true, position: 'right', color: T.ink2, fontSize: 11, formatter: (p) => nf(p.value, 2) } }],
      }) : base(SD.emptyOpt('Pas assez de semaines avec ce résultat (8 minimum)')), () => ({ cols: ['Facteur', 'Corrélation', 'Semaines', 't', 'Tiers bas', 'Tiers haut'], rows: drv.map((q) => [q.label, nf(q.r, 2), q.n, nf(q.t, 1), `≤ ${nf(q.lo.max, q.dig)} ${q.unit} : ${sgn(q.lo.y, O.d)} ${O.unit}`, `≥ ${nf(q.hi.min, q.dig)} ${q.unit} : ${sgn(q.hi.y, O.d)} ${O.unit}`]) }));
      const top = drv.filter((q) => q.sig).slice(0, 4);
      setHTML('ph-lev-b', (top.length ? top : drv.slice(0, 3)).map((q) => `<div class="finding${q.sig ? '' : ' weak'}"><b>${esc(q.label)}</b>
          <p>Semaines à ≥ ${nf(q.hi.min, q.dig)} ${esc(q.unit)} : <b>${sgn(q.hi.y, O.d)} ${O.unit}</b> · semaines à ≤ ${nf(q.lo.max, q.dig)} ${esc(q.unit)} : <b>${sgn(q.lo.y, O.d)} ${O.unit}</b> <small>(${q.hi.n} / ${q.lo.n} semaines)</small></p>
          <small>${q.sig ? 'Lien net' : 'Lien faible, à confirmer'} · r = ${nf(q.r, 2)}</small></div>`).join('')
        + '<p class="note">Une corrélation montre ce qui va ensemble, pas ce qui cause quoi. Les semaines incomplètes (moins de 4 jours) sont ignorées ; la nutrition ne compte que les jours loggés.</p>');

      // ---- photos
      renderPhotos();
    },
  };

  function fdate2(d) { return SD.fdate(d, { month: 'short', year: 'numeric' }); }

  function photoCtx(d) {
    const y = nearestDay(d, 'trendW', 3), f = nearestDay(d, 'bodyFat', 5), w = nearestBody('Tour de taille', d, 21);
    return { w: y ? y.trendW : null, bf: f ? f.bodyFat : null, waist: w ? w['Tour de taille'] : null };
  }
  function list() {
    const S = SD.S;
    const drive = (SD.drive && SD.drive.photos) || [];
    return drive.concat(local).filter((p) => S.photoPose === 'all' || p.pose === S.photoPose).sort((a, b) => a.d.localeCompare(b.d) || a.title.localeCompare(b.title));
  }
  async function renderPhotos() {
    const S = SD.S, T = SD.T;
    const box = document.getElementById('ph-photos-b');
    if (!box) return;
    const dv = SD.drive;
    if (dv && dv.mcp && !dv.photos && !ph.loadingList && dv.photoState !== 'error') {
      ph.loadingList = true;
      setText('ph-photos-s', 'Lecture du dossier Photos du Drive…');
      dv.listPhotos().then(() => { ph.loadingList = false; if (SD.S.page === 'physique') renderPhotos(); });
    }
    const L = list();
    const driveTxt = !dv || !dv.mcp ? 'Photos du Drive disponibles quand le dashboard est ouvert dans claude.ai.' : dv.photoState === 'nosub' ? 'Crée un sous-dossier « Photos » dans ton dossier de suivi.' : dv.photoState === 'error' ? `Drive : ${dv.photoError || 'erreur'}` : dv.photos ? `${dv.photos.length} photos dans le dossier Photos du Drive.` : '';
    setText('ph-photos-s', `${driveTxt} Nomme-les « AAAA-MM-JJ_face.jpg » (ou _profil, _dos) pour le tri par date et par pose. Rien n’est copié : les photos sont lues à la demande et ne quittent pas ton Drive.`);
    if (!L.length) {
      box.innerHTML = `<div class="empty">Aucune photo${S.photoPose !== 'all' ? ` « ${esc(S.photoPose)} »` : ''}. Ajoute des photos dans le sous-dossier « Photos » du Drive, ou compare deux photos de ton appareil avec « Depuis l’appareil » (elles restent dans ton navigateur).</div>`;
      return;
    }
    // par défaut : la plus ancienne et la plus récente de la même pose
    if (!ph.a || !L.includes(ph.a)) ph.a = L[0];
    if (!ph.b || !L.includes(ph.b)) { const same = L.filter((p) => p.pose === ph.a.pose && p !== ph.a); ph.b = same.length ? same[same.length - 1] : L[L.length - 1]; }
    const chips = (side, cur) => L.map((p, i) => `<button type="button" class="pchip" data-side="${side}" data-i="${i}" aria-pressed="${p === cur}">${esc(fdS(p.d))} ${esc(p.d.slice(2, 4))}${p.pose !== 'Autre' ? ` · ${esc(p.pose)}` : ''}${p.local ? ' · appareil' : ''}</button>`).join('');
    const ca = photoCtx(ph.a.d), cb = photoCtx(ph.b.d);
    const days = SD.nDays(ph.a.d, ph.b.d) - 1;
    const diff = (x, y, u, dg, good) => (isNum(x) && isNum(y) ? `<span class="delta ${(y - x) * good > 0 ? 'up-good' : (y - x) * good < 0 ? 'down-bad' : 'flat'}">${sgn(y - x, dg)} ${u}</span>` : '—');
    const cap = (p, c) => `<figcaption><b>${esc(SD.fdate(p.d, { day: 'numeric', month: 'long', year: 'numeric' }))}</b><span>${isNum(c.w) ? nf(c.w, 1) + ' kg' : '—'} · ${isNum(c.bf) ? nf(c.bf, 1) + ' % MG' : '— MG'} · ${isNum(c.waist) ? 'taille ' + nf(c.waist, 1) + ' cm' : 'taille —'}</span></figcaption>`;
    box.innerHTML = `<div class="pgrid"><div><div class="plab">Avant</div><div class="pstrip">${chips('a', ph.a)}</div></div><div><div class="plab">Après</div><div class="pstrip">${chips('b', ph.b)}</div></div></div>
      <div class="pdiff">Écart : <b>${days} jours</b> · poids ${diff(ca.w, cb.w, 'kg', 1, 0)} · masse grasse ${diff(ca.bf, cb.bf, 'pt', 1, -1)} · taille ${diff(ca.waist, cb.waist, 'cm', 1, -1)}</div>
      ${S.photoMode === 'slider' ? `<div class="pslider"><img id="ph-img-a" alt="Avant"><div class="ptop" id="ph-top"><img id="ph-img-b" alt="Après"></div><input type="range" id="ph-cut" min="0" max="100" value="50" aria-label="Curseur avant / après"></div><div class="pgrid">${`<figure class="pfig">${cap(ph.a, ca)}</figure><figure class="pfig">${cap(ph.b, cb)}</figure>`}</div>`
        : `<div class="pgrid"><figure class="pfig"><div class="pimg"><img id="ph-img-a" alt="Photo avant"></div>${cap(ph.a, ca)}</figure><figure class="pfig"><div class="pimg"><img id="ph-img-b" alt="Photo après"></div>${cap(ph.b, cb)}</figure></div>`}`;
    box.querySelectorAll('.pchip').forEach((el) => { el.onclick = () => { ph[el.dataset.side] = L[+el.dataset.i]; renderPhotos(); }; });
    const cut = document.getElementById('ph-cut');
    if (cut) { const top = document.getElementById('ph-top'); const upd = () => { top.style.clipPath = `inset(0 0 0 ${cut.value}%)`; }; cut.oninput = upd; upd(); }
    for (const [id, p] of [['ph-img-a', ph.a], ['ph-img-b', ph.b]]) {
      const img = document.getElementById(id);
      if (!img) continue;
      if (p.url) { img.src = p.url; continue; }
      img.alt = 'Chargement…';
      SD.drive.photoURL(p).then((u) => { img.src = u; img.alt = p.title; }).catch((e) => { img.alt = 'Photo illisible : ' + ((e && e.message) || 'erreur'); });
    }
  }

  // ajout de photos depuis l'appareil (restent en mémoire, jamais envoyées)
  document.addEventListener('change', async (e) => {
    if (e.target.id !== 'ph-file') return;
    for (const f of e.target.files) {
      let blob = f;
      if (/hei[cf]/i.test(f.type + f.name)) { try { blob = await SD.drive.heicToJpeg(f); } catch (err) { /* affichage impossible */ } }
      const meta = SD.drive.photoMeta(f.name, new Date(f.lastModified).toISOString());
      local.push(Object.assign({ id: 'local-' + local.length, title: f.name, local: true, url: URL.createObjectURL(blob) }, meta));
    }
    e.target.value = '';
    renderPhotos();
  });

  SD.PAGES.physique = physique;
})();
