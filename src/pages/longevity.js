/* Page « Longévité » : âge biologique estimé, rythme de vieillissement, VO₂max, biomarqueurs, bilans sanguins. */
(function () {
  'use strict';
  const SD = window.SD;
  const { isNum, nf, sgn, fdM, esc, tms, mean, chart, base, tipBox, xCat, yVal, line, ring, rangeBar, spark } = SD;
  const { card, hic, setHTML, setText } = SD.ui;

  function fitnessAge(vo2, sex) {
    // âge auquel la médiane FRIEND vaut ta VO₂max (interpolation inverse, 20–80 ans)
    let best = null;
    for (let a = 20; a <= 80; a += 0.25) { const r = SD.scores.FRIEND_REF(a, sex); if (best == null || Math.abs(r - vo2) < Math.abs(SD.scores.FRIEND_REF(best, sex) - vo2)) best = a; }
    return best;
  }

  const longevity = {
    id: 'longevity', title: 'Longévité', sub: 'Âge biologique estimé à partir de tes marqueurs, et état de tes biomarqueurs face aux normes de population et à ta propre norme.',
    html() {
      return `<section class="card c12"><div class="hero"><div id="lg-ring"></div><div>
          <div class="card-h" style="margin:0"><div><h2>${hic('longevity', 'age')}Âge biologique</h2><p class="sub" id="lg-sub"></p></div></div>
          <h3 id="lg-verdict"></h3><p id="lg-pace"></p><div id="lg-factors" style="margin-top:12px"></div></div></div>
          <p class="note" id="lg-note"></p></section>
        ${card('c8', 'lg-hist', 'Âge biologique dans le temps', 'Estimation sur 90 jours glissants, chaque mois, comparée à ton âge réel', '', { icon: 'longevity', tone: 'age' })}
        ${card('c4', 'lg-vo2', 'Capacité cardiorespiratoire', null, '', { icon: 'wind', tone: 'age', table: false, body: '<div id="lg-vo2-b"></div>' })}
        ${card('c12', 'lg-bm', 'Biomarqueurs', 'Moyenne des 30 derniers jours de la période (180 j pour la VO₂max) · zones = normes de population · cadre = ta norme (90 jours précédents)', '', { icon: 'hrv', tone: 'age', table: false, body: '<div id="lg-bm-b"></div>' })}
        ${card('c12', 'lg-labs', 'Bilans sanguins', null, '', { icon: 'droplet', tone: 'age', table: false, body: '<div id="lg-labs-b"></div>' })}`;
    },
    update() {
      const { M, S, T } = SD;
      const end = S.to;
      const b = SD.scores.bioAge(end, 90);
      if (!b) {
        setHTML('lg-ring', '');
        setText('lg-verdict', 'Date de naissance inconnue');
        setText('lg-pace', 'L’âge biologique a besoin de ta date de naissance (profil MacroFactor).');
        return;
      }
      const good = b.delta <= 0;
      setHTML('lg-ring', ring({ value: Math.min(10, Math.abs(b.delta)), max: 10, color: good ? T.good : T.crit, text: nf(b.bio, 1), unit: `âge réel ${nf(b.chrono, 1)}`, label: 'Âge biologique', size: 176, stroke: 11, cls: 'xl' }));
      setText('lg-sub', `Fenêtre de 90 jours jusqu’au ${fdM(end)} · confiance ${b.confidence.toLowerCase()} (${b.factors.length} facteurs sur 5)`);
      setText('lg-verdict', `${good ? 'Plus jeune' : 'Plus âgé'} que ton âge réel de ${nf(Math.abs(b.delta), 1)} an${Math.abs(b.delta) >= 2 ? 's' : ''}`);
      const hist = SD.scores.bioAgeHistory(end, 24);
      setHTML('lg-pace', isNum(hist.pace)
        ? `Rythme de vieillissement sur 12 mois : <b>${nf(hist.pace, 2)} an par an</b> ${hist.pace < 0.9 ? '<span class="status good">plus lent que le temps</span>' : hist.pace <= 1.1 ? '<span class="status warn">au rythme du temps</span>' : '<span class="status crit">plus rapide que le temps</span>'}`
        : 'Rythme de vieillissement : il faut au moins 4 mois d’historique complet.');
      const maxY = 5;
      setHTML('lg-factors', b.factors.map((f) => {
        const w = Math.min(50, (Math.abs(f.years) / maxY) * 50);
        const col = f.years <= 0 ? T.good : T.crit;
        const bar = f.years <= 0 ? `<i style="right:50%;width:${w}%;background:${col}"></i>` : `<i style="left:50%;width:${w}%;background:${col}"></i>`;
        return `<div class="factor" title="${esc(f.source)}"><div class="fn"><b>${esc(f.label)} · ${nf(f.value, f.digits)} ${esc(f.unit)}</b><span>${esc(f.note)} · ${esc(f.refLabel)}</span></div><div class="fbar">${bar}</div><div class="yrs" style="color:${f.years <= 0 ? T.goodInk : T.critInk}">${sgn(f.years, 1)} an${Math.abs(f.years) >= 2 ? 's' : ''}</div></div>`;
      }).join(''));
      setText('lg-note', 'Modèle indicatif, pas un diagnostic. Chaque marqueur est comparé à une référence de population ; son risque relatif de mortalité publié est converti en années via la loi de Gompertz (le risque double environ tous les 8 ans). Sources : ' + [...new Set(b.factors.map((f) => f.source))].join(' · ') + '. Les facteurs se recoupent en partie (pas et VO₂max, par exemple) : l’écart total est plafonné à 12 ans.');

      // ---- historique
      const pts = hist.points;
      chart('lg-hist', pts.length >= 2 ? base({
        grid: { left: 8, right: 16, top: 44, bottom: 8, containLabel: true },
        legend: SD.ui.ecLegend(T, ['Âge biologique', 'Âge réel']),
        tooltip: Object.assign(base().tooltip, { formatter: (ps) => { const p = pts[ps[0].dataIndex]; return tipBox(SD.fdate(p.end, { month: 'long', year: 'numeric' }), [{ color: T.age, value: nf(p.bio, 1) + ' ans', name: 'âge biologique' }, { color: T.muted, value: nf(p.chrono, 1) + ' ans', name: 'âge réel' }].concat(p.factors.map((f) => ({ color: f.years <= 0 ? T.good : T.crit, value: sgn(f.years, 1) + ' an', name: f.label }))), `${p.factors.length} facteurs`); } }),
        xAxis: xCat(pts.map((p) => SD.fdate(p.end, { month: 'short', year: '2-digit' }))), yAxis: yVal({ scale: true, name: 'ans' }),
        series: [
          line('Âge biologique', pts.map((p) => +p.bio.toFixed(2)), T.age, { showSymbol: true, symbolSize: 7, lineStyle: { width: 2.5, color: T.age }, areaStyle: { color: T.age, opacity: 0.08 } }),
          line('Âge réel', pts.map((p) => +p.chrono.toFixed(2)), T.muted, { lineStyle: { width: 1.5, color: T.muted } }),
        ],
      }) : base(SD.emptyOpt('Historique insuffisant')), () => ({ cols: ['Mois', 'Âge biologique', 'Âge réel', 'Écart'], rows: pts.map((p) => [SD.fdate(p.end, { month: 'long', year: 'numeric' }), nf(p.bio, 1), nf(p.chrono, 1), sgn(p.delta, 1)]) }));

      // ---- VO2max
      const vf = b.factors.find((f) => f.key === 'vo2');
      if (vf) {
        const fa = fitnessAge(vf.value, b.sex);
        setHTML('lg-vo2-b', `<div class="statline"><span>VO₂max estimée (Apple Watch)</span><b>${nf(vf.value, 1)} mL/kg/min</b></div>
          <div class="statline"><span>Médiane de ton âge (FRIEND)</span><b>${nf(vf.ref, 1)}</b></div>
          <div style="margin:12px 0 4px">${rangeBar({ scale: [vf.ref * 0.6, vf.ref * 1.4], zones: [[vf.ref * 0.6, vf.ref * 0.75, 'crit'], [vf.ref * 0.75, vf.ref * 0.9, 'warn'], [vf.ref * 0.9, vf.ref * 1.1, 'ok'], [vf.ref * 1.1, vf.ref * 1.4, 'good']], value: vf.value, color: T.ink })}</div>
          <div class="statline"><span>Âge cardiorespiratoire</span><b style="color:${fa <= b.chrono ? T.goodInk : T.critInk}">${nf(fa, 0)} ans</b></div>
          <div class="statline"><span>Écart vs médiane</span><b>${sgn(((vf.value - vf.ref) / 3.5), 1)} MET</b></div>
          <p class="note">Chaque MET (3,5 mL/kg/min) gagné est associé à −13 % de mortalité (Kodama, JAMA 2009). L’estimation de la montre sous-évalue souvent les profils musclés : compare-la surtout à elle-même dans le temps.</p>`);
      } else setHTML('lg-vo2-b', '<div class="empty">Aucune VO₂max estimée sur la dernière année. Elle se mesure pendant les marches et courses en extérieur avec l’Apple Watch.</div>');

      // ---- biomarqueurs
      const bms = SD.scores.biomarkers(end);
      const groups = [...new Set(bms.map((r) => r.group))];
      setHTML('lg-bm-b', groups.map((g) => `<div class="bm-group"><h3>${esc(g)}</h3>${bms.filter((r) => r.group === g).map((r) => {
        const lo = r.scale ? r.scale[0] : Math.min(r.min, r.value), hi = r.scale ? r.scale[1] : Math.max(r.max, r.value);
        const trend = isNum(r.z) ? `${sgn(r.z, 1)} σ vs ta norme` : r.note || '';
        return `<div class="bm"><div class="n">${esc(r.label)}<small>${esc(r.pop)}${r.note && isNum(r.z) ? ' · ' + esc(r.note) : ''}</small></div>
          <div class="v">${isNum(r.value) ? nf(r.value, r.digits) : '—'}<small>${esc(r.unit)}</small></div>
          <div class="rb">${isNum(lo) && isNum(hi) && hi > lo ? rangeBar({ scale: [lo, hi], zones: r.zones, bandLo: isNum(r.baseline) ? r.baseline - r.baseSd : null, bandHi: isNum(r.baseline) ? r.baseline + r.baseSd : null, value: r.value, color: SD.zoneColor(r.state) }) : ''}</div>
          <div class="trend">${esc(trend)}</div>
          <div class="trend sp">${r.state ? `<span class="status ${r.state}">${{ good: 'Optimal', ok: 'Moyenne', warn: 'À surveiller' }[r.state] || 'Hors norme'}</span>` : ''}</div></div>`;
      }).join('')}</div>`).join('') || '<div class="empty">Pas de biomarqueur sur la période.</div>');

      // ---- bilans sanguins
      const labs = (M.raw.labs || []).filter((l) => l.d <= end);
      if (labs.length) {
        const names = [...new Set(labs.map((l) => l.name))].sort();
        setHTML('lg-labs-b', `<div class="tbl-wrap"><table class="t"><thead><tr><th>Marqueur</th><th class="num">Dernière valeur</th><th>Plage de référence</th><th class="num">Date</th><th>Historique</th><th>Statut</th></tr></thead><tbody>${names.map((n) => {
          const h = labs.filter((l) => l.name === n);
          const l = h[h.length - 1];
          const st = isNum(l.lo) && l.value < l.lo ? 'crit' : isNum(l.hi) && l.value > l.hi ? 'crit' : isNum(l.lo) || isNum(l.hi) ? 'good' : null;
          const sc = [isNum(l.lo) ? l.lo * 0.7 : Math.min(...h.map((q) => q.value)) * 0.8, isNum(l.hi) ? l.hi * 1.3 : Math.max(...h.map((q) => q.value)) * 1.2];
          return `<tr><td>${esc(n)}</td><td class="num"><b>${nf(l.value, 2)}</b> ${esc(l.unit)}</td><td style="min-width:180px">${rangeBar({ scale: sc, zones: [[sc[0], isNum(l.lo) ? l.lo : sc[0], 'crit'], [isNum(l.lo) ? l.lo : sc[0], isNum(l.hi) ? l.hi : sc[1], 'good'], [isNum(l.hi) ? l.hi : sc[1], sc[1], 'crit']], value: l.value, color: SD.zoneColor(st) })}<small style="color:var(--muted)">${isNum(l.lo) ? nf(l.lo, 2) : '…'} – ${isNum(l.hi) ? nf(l.hi, 2) : '…'}</small></td><td class="num">${esc(fdM(l.d))}</td><td><div class="mini-spark">${spark(h.map((q) => q.value), T.age, 22)}</div></td><td>${st ? `<span class="status ${st}">${st === 'good' ? 'Dans la norme' : 'Hors norme'}</span>` : ''}</td></tr>`;
        }).join('')}</tbody></table></div>`);
      } else {
        setHTML('lg-labs-b', `<div class="empty" style="text-align:left;display:block">Aucun bilan sanguin chargé. Pour les suivre ici, dépose dans ton dossier Drive un fichier CSV (ou une feuille Google nommée « Bilan… ») avec les colonnes<br><code>Date;Marqueur;Valeur;Unité;Min;Max</code><br>par exemple <code>12/03/2026;Ferritine;85;µg/L;30;400</code>. Il sera importé à la prochaine synchronisation.</div>`);
      }
    },
  };

  SD.PAGES.longevity = longevity;
})();
