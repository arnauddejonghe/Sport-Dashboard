/* Page « Bilan quotidien » : la dernière journée complète (ou le jour choisi), note du jour en tête,
 * récupération, sommeil et charge comparés à ta norme, biomarqueurs, nutrition, journal rapide. */
(function () {
  'use strict';
  const SD = window.SD;
  const { isNum, nf, sgn, fH, fHM, fdL, fdS, fdM, esc, addD, typeColor, STRENGTH, chart, base, tipBox, xCat, yVal, bar, line, ring, rangeBar } = SD;
  const { card, hic, setHTML, setText } = SD.ui;

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

  /** Date locale du jour (AAAA-MM-JJ) et position relative d'une date */
  const todayLocal = () => new Date().toLocaleDateString('sv-SE');
  function relDay(d) {
    const n = SD.nDays(d, todayLocal()) - 1;
    return n === 0 ? 'aujourd’hui, journée en cours' : n === 1 ? 'hier' : n === 2 ? 'avant-hier' : n > 2 ? `il y a ${n} jours` : '';
  }
  SD.relDay = relDay;

  /** Phrase de synthèse de la journée à partir des composantes de la note */
  function dayVerdict(ds, parts) {
    if (!isNum(ds)) return 'Pas assez de mesures ce jour-là pour noter la journée.';
    const lead = ds >= 85 ? 'Excellente journée' : ds >= 70 ? 'Bonne journée' : ds >= 55 ? 'Journée moyenne' : 'Journée difficile';
    const av = parts.filter((p) => isNum(p.v)).sort((a, b) => b.v - a.v);
    if (av.length < 2) return lead + '.';
    const best = av[0], worst = av[av.length - 1];
    return worst.v >= 75 ? `${lead}\u00a0: tout est au vert, ${best.l.toLowerCase()} en tête.` : `${lead}\u00a0: ${best.l.toLowerCase()} solide, ${worst.l.toLowerCase()} à travailler.`;
  }

  const P = () => SD.plan;
  // zones d'effort : rampe ordinale d'une seule teinte (légère → élevée), tokens du thème
  const ZC = (T) => ({ light: T.zone[0], mod: T.zone[1], sus: T.zone[2], high: T.zone[3] });
  const zoneLabel = (z) => (z ? SD.scores.EFF_LABEL[z] : '—');
  const dayName = (d) => SD.fdate(d, { weekday: 'long', day: 'numeric', month: 'long' });
  const DAY_FR = { upper: 'Haut du corps', lower: 'Bas du corps', pull: 'Tirage', push: 'Poussée', legs: 'Jambes', rest: 'Repos' };
  const dayFr = (day) => (day ? `${day}${DAY_FR[day.toLowerCase()] && DAY_FR[day.toLowerCase()] !== day ? ` · ${DAY_FR[day.toLowerCase()]}` : ''}` : '');

  /** Échelle horizontale des zones d'effort (tes quartiles) avec le prévu et, s'il y a lieu, le réalisé */
  function effScale(T, z, planned, done) {
    const max = Math.max(z.p75 * 1.35, planned || 0, done || 0) * 1.05;
    const pc = (v) => Math.max(0, Math.min(100, (v / max) * 100));
    const segs = [[0, z.p25, 'light'], [z.p25, z.p50, 'mod'], [z.p50, z.p75, 'sus'], [z.p75, max, 'high']];
    return `<div class="effscale">${segs.map(([a, b, k]) => `<i style="left:${pc(a)}%;width:${pc(b) - pc(a)}%;background:${ZC(T)[k]}" title="${zoneLabel(k)}"></i>`).join('')}
      ${isNum(planned) ? `<span class="mk mk-plan" style="left:${pc(planned)}%" title="Prévu"></span>` : ''}${isNum(done) ? `<span class="mk mk-done" style="left:${pc(done)}%" title="Réalisé"></span>` : ''}</div>
      <div class="effleg">${segs.map(([, , k]) => `<span>${zoneLabel(k)}</span>`).join('')}</div>`;
  }

  const today = {
    id: 'today', title: 'Bilan quotidien',
    sub() {
      const { M, S } = SD;
      const d = S.day || M.lastComplete;
      const name = (M.cfg.athlete || (M.raw.profile && M.raw.profile.firstName) || '').trim();
      const rel = relDay(d);
      return `${name ? name + ', voici' : 'Voici'} ton plan pour ${dayName(todayLocal())}, puis le bilan du ${dayName(d)}${rel ? ` (${rel})` : ''}. Chaque mesure est comparée à ta propre norme.`;
    },
    noFilters: true,
    html() {
      return `<section class="card c12 plan" id="pl"><div id="pl-b"></div></section>
        ${card('c8', 'pl-ses', 'Séance du jour', 'Programme MacroFactor · charge visée = ta force estimée récente ramenée à la fourchette et au RIR prévus, calée sur une charge que tu as déjà utilisée', '', { table: false, body: '<div id="pl-ses-b"></div>', icon: 'dumbbell', tone: 'strain' })}
        ${card('c4', 'pl-mus', 'Muscles', 'Séries des 7 derniers jours, + prévu aujourd’hui (cible 10–20 / sem)', '', { table: false, body: '<div id="pl-mus-b"></div>', icon: 'muscle', tone: 'strain' })}
        ${card('c12', 'pl-wk', 'Semaine à venir', 'Programme projeté jour par jour et agenda', '', { table: false, body: '<div id="pl-wk-b"></div>', icon: 'calendar', tone: 'accent' })}
        ${card('c12', 'pl-eff', 'Effort musculation · prévu et réalisé', 'Séries efficaces : chaque série de travail compte selon sa proximité de l’échec (RIR 0 = 1 ; RIR 2 = 0,85 ; RIR 4 = 0,5). Zones = quartiles de tes séances des 6 derniers mois', '', { h: 'short', icon: 'zap', tone: 'strain' })}
        <div class="c12 divider"><h2>Bilan du jour</h2><span>la dernière journée complète, ou le jour choisi</span></div>
        <section class="card c12 dayhero">
          <div class="daynav"><button type="button" class="btn icon-btn" data-dayshift="-1" aria-label="Jour précédent">‹</button><h2 id="td-date"></h2><button type="button" class="btn icon-btn" data-dayshift="1" aria-label="Jour suivant">›</button>
            <span class="rel" id="td-rel"></span><span class="grow"></span><input type="date" class="field" id="td-pick" aria-label="Choisir un jour"><button type="button" class="link" id="td-last">Dernière journée complète</button></div>
          <div class="dh-body">
            <div class="dh-score" id="td-score"></div>
            <div class="dh-text"><h3 id="td-verdict"></h3><div class="dh-parts" id="td-parts"></div><div class="dh-meta" id="td-meta"></div></div>
          </div>
          <div id="td-alert"></div></section>
        <div class="rings three c12" id="td-rings"></div>
        ${card('c7', 'td-bm', 'Biomarqueurs', 'Valeur du jour et ta plage normale (médiane ± écart robuste des 30 jours précédents)', '', { table: false, body: '<div id="td-bm-b"></div>', icon: 'heart', tone: 'rec' })}
        ${card('c5', 'td-str', 'Séance & activité', null, '', { table: false, body: '<div id="td-str-b"></div>', icon: 'flame', tone: 'act' })}
        ${card('c7', 'td-sleep', 'Sommeil', '', '', { h: 'short', icon: 'moon', tone: 'sleep' })}
        ${card('c5', 'td-nut', 'Nutrition & hydratation', null, '', { table: false, body: '<div id="td-nut-b"></div>', icon: 'food', tone: 'nutri' })}
        ${card('c7', 'td-jr', 'Journal', 'Une note libre suffit ; les #tags servent à mesurer l’effet de tes habitudes.', '', { table: false, body: '<div id="td-jr-b"></div>', icon: 'journal', tone: 'age' })}
        ${card('c5', 'td-14', '14 jours', 'Récupération (couleur de zone) et effort musculation (séries efficaces, zone)', '', { h: 'short', icon: 'trend', tone: 'accent' })}`;
    },

    // ================================================================ plan du jour
    renderPlan() {
      const { M, T } = SD;
      const el = document.getElementById('pl-b');
      if (!el || !P()) return;
      const t = todayLocal();
      const st = P().programState(M, t);
      const slot = st ? st.cur : null;
      const sp = slot && !slot.rest ? P().sessionPlan(M, slot, t) : null;
      const rd = P().readiness(M, t, slot);
      const z = M.effZones;
      const coach = M.coach.get(t);
      const cal = SD.cal || {};
      const evToday = cal.state === 'ok' ? cal.on(t) : null;
      const done = st && st.doneToday;
      const xt = M.at(t);

      // ---- en-tête : séance ou repos, état du matin
      let title, subl;
      if (!st) { title = 'Pas de programme'; subl = 'Aucun programme actif MacroFactor dans tes exports : fais un export rapide (il contient l’onglet « Active Program »).'; }
      else if (!slot) { title = 'Programme terminé'; subl = `${esc(st.prog.name)} : toutes les séances sont faites. Charge le prochain programme dans MacroFactor puis refais un export rapide.`; }
      else if (slot.rest) {
        const nx = st.week.find((w, i) => i > 0 && w.slot && !w.slot.rest);
        title = 'Repos';
        subl = `Programme ${esc(st.prog.name)} · semaine ${slot.cycle}/${st.prog.cycles.length}${nx ? ` · prochaine séance : <b>${esc(nx.slot.day)}</b> ${esc(SD.fdate(nx.d, { weekday: 'long' }))}` : ''}`;
      } else {
        title = `${esc(slot.day)}${done ? ' <span class="okmark">✓ faite</span>' : ''}`;
        subl = `${esc(DAY_FR[slot.day.toLowerCase()] || '')} · programme ${esc(st.prog.name)} · semaine ${slot.cycle}/${st.prog.cycles.length} · séance ${st.sessionNo}/${st.trainSlots}${sp ? ` · ${sp.sets} séries · ≈ ${fHM(sp.dur)}` : ''}`;
      }
      const srcTxt = rd.src === 'night' ? 'nuit de cette nuit' : rd.srcDate ? `dernière nuit importée (${fdM(rd.srcDate)}) : exporte Apple Santé ce matin pour une décision à jour` : 'pas de mesure de récupération';
      const goIc = (lv) => `<span class="go-ic">${SD.icon(lv === 'go' ? 'check' : lv === 'rest' ? 'moon' : lv === 'easy' ? 'stop' : 'alert')}</span>`;
      const goBox = slot && !slot.rest && !done
        ? `<div class="pl-go ${rd.level}">${goIc(rd.level)}<b>${esc(rd.title)}</b><span>${esc(rd.advice)}</span><small>${esc(rd.reasons.join(' · ') || 'pas de signal particulier')} · ${esc(srcTxt)}</small></div>`
        : slot && slot.rest ? `<div class="pl-go rest">${goIc('rest')}<b>Récupération active</b><span>Marche 30 à 45 min pour tenir tes pas, mobilité 10 min ; pas de séance lourde.</span><small>${isNum(rd.rec) ? `récupération ${rd.rec} % · ` : ''}${esc(srcTxt)}</small></div>`
          : done ? `<div class="pl-go go">${goIc('go')}<b>Séance enregistrée</b><span>${xt && xt.eff ? `${nf(xt.eff.stim, 1)} séries efficaces pour ${nf(sp && sp.stim, 1)} prévues (${Math.round((xt.eff.stim / (sp ? sp.stim : xt.eff.stim)) * 100)} %).` : 'Bravo.'}</span><small>Récupère : protéines, hydratation, coucher à l’heure.</small></div>` : '';

      // ---- zone d'effort visée
      let effHtml = '';
      if (sp && z) {
        const zp = SD.scores.effZone(sp.stim, z);
        const adj = rd.level === 'easy' ? 0.8 : rd.level === 'caution' ? 0.92 : 1;
        effHtml = `<div class="pl-eff"><div class="k">${hic('target', 'strain')}Zone d’effort visée</div><div class="v">${zoneLabel(zp)} <small>≈ ${nf(sp.stim * adj, 1)} séries efficaces${adj < 1 ? ` (${nf(sp.stim, 1)} au programme, ajusté à ton état)` : ''}</small></div>
          ${effScale(T, z, sp.stim * adj, done && xt && xt.eff ? xt.eff.stim : null)}
          <p class="note">${sp.sets} séries au RIR prévu. Une séance « ${zoneLabel(zp).toLowerCase()} » te situe ${zp === 'high' ? 'dans ton quart le plus exigeant' : zp === 'sus' ? 'au-dessus de ta séance médiane' : zp === 'mod' ? 'juste sous ta séance médiane' : 'dans ton quart le plus léger'} (médiane ${nf(z.p50, 1)}).</p></div>`;
      } else if (slot && slot.rest) {
        effHtml = `<div class="pl-eff"><div class="k">${hic('target', 'strain')}Zone d’effort visée</div><div class="v">Repos <small>aucune série de musculation</small></div>${z ? effScale(T, z, null, null) : ''}<p class="note">Le repos fait partie du programme : ${st.prog.cycles[0].filter((d) => d.rest).length} jours par semaine de programme.</p></div>`;
      }

      // ---- ta journée : agenda + créneau
      let dayHtml = `<div class="pl-day"><div class="k">${hic('calendar', 'accent')}Ta journée</div>`;
      if (cal.state === 'ok') {
        const sug = sp && !done ? P().suggestSlot(M, cal.events, t, sp.dur) : null;
        const items = (evToday || []).map((e) => ({ t: e.allDay ? 'journée' : `${P().hm(e.start)}–${P().hm(e.end)}`, s: e.allDay ? 0 : e.start.getTime(), l: e.title, k: 'ev' }));
        if (sug && sug.best) items.push({ t: `${P().hm(sug.best.start)}–${P().hm(sug.best.end)}`, s: sug.best.start.getTime(), l: `Créneau conseillé : ${slot.day} (≈ ${fHM(sp.dur)} + trajet)`, k: 'gym' });
        items.sort((a, b) => a.s - b.s);
        dayHtml += items.length ? `<ul class="tl">${items.map((i) => `<li class="${i.k}"><span>${esc(i.t)}</span><b>${esc(i.l)}</b></li>`).join('')}</ul>` : '<p class="note">Rien à l’agenda aujourd’hui.</p>';
        if (sp && !done && sug && !sug.best) dayHtml += '<p class="note warn">Pas de créneau libre assez long entre 6 h 30 et 21 h 30 : garde la version courte ou décale.</p>';
        if (sug && sug.best) dayHtml += `<p class="note">Créneau placé au plus près de ton heure habituelle (${esc(sug.pref)}), réglable dans la configuration.</p>`;
      } else if (cal.state === 'consent' || cal.state === 'denied' || cal.state === 'error') {
        dayHtml += `<p class="note">${cal.state === 'error' ? esc(cal.error) : 'Connecte ton agenda Google pour placer la séance dans ta journée et repérer les jours chargés.'}</p>${cal.state !== 'denied' ? '<button type="button" class="btn" id="pl-cal">Connecter l’agenda</button>' : ''}`;
      } else if (cal.state === 'busy') dayHtml += '<p class="note">Lecture de l’agenda…</p>';
      else dayHtml += '<p class="note">L’agenda se lit quand le dashboard est ouvert dans claude.ai.</p>';
      dayHtml += '</div>';

      // ---- cibles du jour
      const tg = P().nutritionFor(M, t);
      const slp = P().sleepTonight(M, t, !!(slot && !slot.rest));
      const kg = xt && isNum(xt.trendW) ? xt.trendW : (M.at(M.lastComplete) || {}).trendW;
      const hyd = isNum(kg) ? Math.round(kg * 35 + (sp ? (sp.dur / 60) * 500 : 0)) : null;
      const wake = (M.cfg.plan && M.cfg.plan.wake) || '06:30';
      let bed = null;
      if (slp) { const [h, m] = wake.split(':').map(Number); const mins = h * 60 + m - Math.round(slp.need * 60) - 15; const mm = ((mins % 1440) + 1440) % 1440; bed = `${String(Math.floor(mm / 60)).padStart(2, '0')} h ${String(mm % 60).padStart(2, '0')}`; }
      const stepsT = M.cfg.targets.stepsGoal;
      const goal = (ic, tone, lab, val, sub) => `<div class="goal" style="--tc:var(--${tone})"><span class="gi">${SD.icon(ic)}</span><span>${lab}${sub ? `<small>${sub}</small>` : ''}</span><b>${val}</b></div>`;
      const tgtHtml = `<div class="pl-tg"><div class="k">${hic('flag', 'rec')}Cibles du jour</div>
        ${goal('flame', 'nutri', 'Calories', tg ? `${nf(tg.kcal, 0)} kcal` : '—', tg ? `protéines ${nf(tg.prot, 0)} g · glucides ${nf(tg.carb, 0)} g · lipides ${nf(tg.fat, 0)} g` : '')}
        ${goal('droplet', 'hydro', 'Hydratation', hyd ? `≈ ${nf(hyd / 1000, 1)} L` : '—', '')}
        ${goal('steps', 'act', 'Pas', nf(stepsT, 0), xt && isNum(xt.steps) ? `${nf(xt.steps, 0)} à l’export` : '')}
        ${goal('moon', 'sleep', 'Sommeil cette nuit', slp ? fH(slp.need) : '—', slp && bed ? `couché vers ${bed}` : '')}
        ${coach && (coach.nutri || coach.steps) ? `<p class="note">Coach : ${esc([coach.nutri && 'nutrition ' + coach.nutri, coach.steps && 'pas ' + coach.steps].filter(Boolean).join(' · ').slice(0, 240))}</p>` : ''}
        <p class="note">Hydratation : 35 ml/kg (EFSA 2010) + 0,5 L par heure de séance. Coucher calculé pour un réveil à ${esc(wake)}.</p></div>`;

      el.innerHTML = `<div class="pl-head"><div><div class="eyebrow">${SD.icon('today')}Aujourd’hui · ${esc(dayName(t))}</div><h2 class="pl-title">${title}</h2><div class="pl-sub">${subl}</div></div>${goBox}</div>
        <div class="pl-grid">${effHtml}${dayHtml}${tgtHtml}</div>`;
      const cb = document.getElementById('pl-cal');
      if (cb) cb.onclick = () => SD.cal.load();

      // ---- séance du jour
      let ses = '';
      if (coach && coach.plan && coach.plan.lines.length) {
        ses += `<div class="coachbox"><div class="k">${SD.icon('chat')}Décision du coach · ${esc(fdM(coach.d))}${coach.plan.title ? ` · ${esc(coach.plan.title)}` : ''}</div><ul>${coach.plan.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`;
      }
      if (sp) {
        const restTxt = (s) => (isNum(s) ? (s >= 60 ? `${Math.floor(s / 60)}′${s % 60 ? String(s % 60).padStart(2, '0') : ''}` : `${s}″`) : '');
        ses += `<div class="extab" role="table"><div class="exr exh" role="row"><span>Exercice</span><span>Séries × reps</span><span>RIR</span><span>Charge visée</span><span>Dernière fois</span></div>
          ${sp.rows.map((r) => `<div class="exr" role="row"><span class="exn">${r.ss ? `<i class="ssb">${esc(r.ss)}</i>` : ''}${esc(r.n)}${r.note ? `<small>${esc(r.note)}</small>` : ''}</span>
            <span><b>${r.sets} × ${esc(r.range)}</b>${r.rest ? `<small>repos ${restTxt(r.rest)}</small>` : ''}</span><span class="rirv">${esc(r.rir)}</span>
            <span><b>${r.load != null ? `${r.pair ? '2 × ' : ''}${nf(r.load, r.load % 1 ? 1 : 0)} kg` : r.timed ? 'poids du corps' : '—'}</b>${isNum(r.e1) ? `<small>1RM est. ${nf(r.e1, 1)}${r.pair ? '/haltère' : ''}</small>` : ''}</span>
            <span>${r.last ? `${esc(fdM(r.last.d))}<small>${esc(r.lastTxt)}${isNum(r.last.rir) ? ` · RIR ${nf(r.last.rir, 1)}` : ''}</small>` : '<small>première fois</small>'}</span></div>`).join('')}</div>
          <p class="note">Monte la charge quand tu atteins le haut de la fourchette sur toutes les séries au RIR prévu (double progression). ${rd.level !== 'go' && !done ? esc(rd.advice) : ''}</p>`;
      } else if (slot && slot.rest) {
        const nx = st.week.find((w, i) => i > 0 && w.slot && !w.slot.rest);
        ses += `<div class="empty">Jour de repos au programme.${nx ? ` Prochaine séance : ${esc(nx.slot.day)} (${esc(SD.fdate(nx.d, { weekday: 'long', day: 'numeric', month: 'short' }))}).` : ''}</div>`;
      } else if (!ses) ses = '<div class="empty">Pas de séance prévue (pas de programme actif dans les exports).</div>';
      setHTML('pl-ses-b', ses);
      setText('pl-ses-t', sp ? `Séance du jour · ${slot.day}` : 'Séance du jour');

      // ---- muscles
      const ms = P().muscleStatus(M, t, slot);
      const [lo, hi] = M.cfg.targets.setsPerMuscleWeek;
      const mx = Math.max(hi * 1.3, ...ms.map((m) => m.week + m.plan));
      setHTML('pl-mus-b', ms.length ? ms.sort((a, b) => b.plan - a.plan || b.week - a.week).map((m) => {
        const tot = m.week + m.plan;
        const st2 = tot < lo ? 'warn' : tot > hi * 1.3 ? 'warn' : 'good';
        return `<div class="msr"><span class="mn">${esc(m.m)}${m.plan && !m.ready ? `<small class="warn">entraîné il y a ${m.hrs} h</small>` : ''}</span>
          <div class="mb"><i style="width:${(m.week / mx) * 100}%;background:var(--strain)"></i><i class="pl" style="width:${(m.plan / mx) * 100}%"></i><em style="left:${(lo / mx) * 100}%;width:${((hi - lo) / mx) * 100}%"></em></div>
          <b class="${st2}">${nf(tot, tot % 1 ? 1 : 0)}</b></div>`;
      }).join('') + '<p class="note">Barre pleine = 7 derniers jours ; hachurée = séance du jour ; bande = 10–20 séries.</p>' : '<div class="empty">Pas de séance récente.</div>');

      // ---- semaine à venir
      if (st) {
        setHTML('pl-wk-b', `<div class="wk7">${st.week.map((w, i) => {
          const ev = cal.state === 'ok' ? cal.on(w.d) : null;
          const busyMin = ev ? ev.filter((e) => !e.allDay && e.busy).reduce((a, e) => a + Math.max(0, (e.end - e.start) / 60000), 0) : 0;
          const lbl = !w.slot ? 'fin du programme' : w.slot.rest ? 'Repos' : w.slot.day;
          return `<div class="wd ${w.slot && w.slot.rest ? 'rest' : ''} ${i === 0 ? 'today' : ''}"><div class="h">${esc(SD.fdate(w.d, { weekday: 'short' }))} <small>${esc(fdS(w.d))}</small></div>
            <div class="s">${esc(lbl)}${w.done ? ' ✓' : ''}</div>${w.slot && !w.slot.rest ? `<small>${P().plannedSets(w.slot)} séries · ${zoneLabel(SD.scores.effZone(P().plannedStim(w.slot), z)).toLowerCase()}</small>` : ''}
            ${ev ? `<div class="ev">${ev.slice(0, 3).map((e) => `<span>${e.allDay ? '' : esc(P().hm(e.start)) + ' '}${esc(e.title)}</span>`).join('')}${ev.length > 3 ? `<span>+${ev.length - 3}</span>` : ''}</div>${busyMin >= 360 ? '<small class="warn">journée chargée</small>' : ''}` : ''}</div>`;
        }).join('')}</div><p class="note">Projection si tu suis le programme sans décalage : une séance manquée reste à faire le jour suivant (le programme est séquentiel).</p>`);
      } else setHTML('pl-wk-b', '<div class="empty">Pas de programme actif.</div>');

      // ---- effort prévu vs réalisé (28 jours)
      if (z) setText('pl-eff-s', `Séries efficaces : chaque série de travail compte selon sa proximité de l’échec (RIR 0 = 1 ; RIR 2 = 0,85 ; RIR 4 = 0,5). Couleur = zone ; pointillés = tes quartiles des 6 derniers mois (${nf(z.p25, 1)} · médiane ${nf(z.p50, 1)} · ${nf(z.p75, 1)}) ; trait blanc = prévu par le programme.`);
      const days = [];
      for (let i = 27; i >= 0; i--) { const y = M.at(SD.addD(M.last, -i)); if (y) days.push(y); }
      const zc = ZC(T);
      chart('pl-eff', base({
        grid: { left: 8, right: 14, top: 40, bottom: 8, containLabel: true },
        legend: SD.ui.ecLegend(T, ['Réalisé', 'Prévu']),
        tooltip: Object.assign(base().tooltip, { axisPointer: { type: 'shadow' }, formatter: (ps) => { const y = days[ps[0].dataIndex]; const e = y.eff; return tipBox(fdL(y.d) + (y.planDay ? ` · ${y.planDay}` : ''), e ? [{ color: zc[e.zone] || T.strain, box: true, value: nf(e.stim, 1), name: `séries efficaces · ${zoneLabel(e.zone).toLowerCase()}` }, { color: T.ink2, value: isNum(y.effPlan) ? nf(y.effPlan, 1) : '—', name: 'prévu' }, { color: T.muted, value: `${nf(e.sets, 1)} · ${nf(e.hard, 1)}`, name: 'séries · dont dures (RIR ≤ 3)' }, { color: T.muted, value: isNum(e.rir) ? nf(e.rir, 1) : '—', name: 'RIR moyen' }, { color: T.muted, value: nf(e.vol, 0) + ' kg', name: 'tonnage' }] : [{ color: T.muted, value: '—', name: 'pas de séance' }]); } }),
        xAxis: xCat(days.map((y) => fdS(y.d))), yAxis: yVal({ min: 0, name: 'séries eff.' }),
        series: [
          bar('Réalisé', days.map((y) => ({ value: y.eff ? y.eff.stim : null, itemStyle: { color: y.eff ? zc[y.eff.zone] : T.strain, borderRadius: [4, 4, 0, 0] } })), T.strain, z ? { markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: T.axis, type: 'dashed' }, data: [{ yAxis: z.p25, name: 'Q1' }, { yAxis: z.p50, name: 'médiane' }, { yAxis: z.p75, name: 'Q3' }] } } : {}),
          { type: 'scatter', name: 'Prévu', symbol: 'rect', symbolSize: [16, 3], itemStyle: { color: T.ink }, data: days.map((y) => (isNum(y.effPlan) ? y.effPlan : null)), z: 5 },
        ],
      }), () => ({ cols: ['Date', 'Séance', 'Séries efficaces', 'Prévu', 'Zone', 'Séries', 'Dures', 'RIR moyen', 'Tonnage'], rows: days.filter((y) => y.eff).map((y) => [fdM(y.d), y.planDay || '', nf(y.eff.stim, 1), isNum(y.effPlan) ? nf(y.effPlan, 1) : '—', zoneLabel(y.eff.zone), nf(y.eff.sets, 1), nf(y.eff.hard, 1), isNum(y.eff.rir) ? nf(y.eff.rir, 1) : '—', nf(y.eff.vol, 0) + ' kg']) }));
    },

    update() {
      const { M, S, T } = SD;
      try { this.renderPlan(); } catch (e) { const el = document.getElementById('pl-b'); if (el) el.innerHTML = `<div class="empty">Plan du jour indisponible : ${esc(e.message)}</div>`; }
      if (!S.day || !M.at(S.day)) S.day = M.lastComplete;
      const d = S.day, x = M.at(d);
      const cfg = M.cfg.targets;
      setText('td-date', SD.fdate(d, { weekday: 'long', day: 'numeric', month: 'long' }));
      const rel = relDay(d);
      setHTML('td-rel', `${rel ? esc(rel) : ''}${x.partial ? ' · journée incomplète (jour de l’export)' : ''}`);
      const pick = document.getElementById('td-pick');
      if (pick) { pick.value = d; pick.min = M.first; pick.max = M.last; }
      const sub = document.getElementById('page-sub');
      if (sub) sub.textContent = today.sub();

      // ---- note du jour (héros)
      const ds = SD.scores.dayScore(x);
      const nut = SD.scores.nutriScore(x);
      const PC = { sleep: T.sleep, train: T.strain, nutri: T.nutri, steps: T.act, hydro: T.hydro };
      const parts = SD.scores.dayParts(x).map((p) => Object.assign(p, { c: PC[p.k] }));
      setHTML('td-score', ring({ value: ds, max: 100, color: SD.scoreColor(ds), text: isNum(ds) ? SD.scores.grade(ds) : null, unit: isNum(ds) ? `${nf(ds, 0)} / 100` : '', label: 'Note du jour', size: 200, stroke: 11, cls: 'xl' }));
      setText('td-verdict', dayVerdict(ds, parts));
      setHTML('td-parts', parts.map((p) => `<div class="dpart${isNum(p.v) ? '' : ' na'}"><span>${p.l}<small>${esc(p.d)}</small></span><div class="bar2"><i style="width:${isNum(p.v) ? Math.max(2, Math.min(100, p.v)) : 0}%;background:${p.c}"></i></div><b>${isNum(p.v) ? nf(p.v, 0) : 'n. d.'}</b></div>`).join('')
        + '<p class="note" style="margin:6px 0 0">Note = moyenne à poids égaux des cibles atteintes (ce qui dépend de toi). La récupération est un état : elle guide la séance, elle n’entre pas dans la note.</p>');
      const sess = x.w.length ? x.w.map((w) => `${esc(w.type)}${STRENGTH.has(w.type) && x.split ? ' · ' + esc(x.split) : ''}${w.min != null ? ' ' + fHM(w.min) : ''}`).join(' + ') : 'aucune séance';
      const wd = SD.fdate(d, { weekday: 'long' });
      setHTML('td-meta', `<span class="pill"><span class="dot" style="background:${x.train ? T.strain : T.muted}"></span>Séance du ${esc(wd)} : <b>${sess}</b></span>${x.phase ? `<span class="pill">Phase <b>${esc(x.phase)}</b></span>` : ''}`);
      setHTML('td-alert', x.alert ? `<div class="alert ${x.alert.level === 'crit' ? '' : 'warn'}" style="margin-top:14px"><b>${x.alert.level === 'crit' ? 'Signal de stress physiologique' : 'Signal à surveiller'}</b>${esc(x.alert.flags.join(' · '))} par rapport à ta norme. Plusieurs signaux ensemble précèdent souvent une maladie ou une grosse fatigue : privilégie une journée légère.</div>` : '');

      // ---- anneaux : récupération, sommeil, charge
      const z = x.z || {};
      const zTxt = (k, dig) => (isNum(x[k]) ? `<b>${nf(x[k], dig)}</b>${isNum(z[k]) ? ` (${sgn(z[k], 1)} σ)` : ''}` : '—');
      const tgt = SD.scores.strainTarget(x.rec);
      const zone = SD.scores.strainZone(x.strain);
      const need = x.sleepNeed;
      // cartes anneau façon cartes santé : anneau à gauche, titre + statut + détails à droite
      const rcard = (rg, title, status, lines) => `<div class="rcard">${rg}<div class="rc-body"><div class="rc-t"><span>${title}</span>${status || ''}</div><div class="lines">${lines}</div></div></div>`;
      const rsz = { size: 104, stroke: 11, hideLabel: true };
      const perf = x.sleepPerf;
      setHTML('td-rings', [
        rcard(ring(Object.assign({ value: x.rec, max: 100, color: SD.recColor(x.rec), unit: '%', label: 'Récupération' }, rsz)), 'Récupération', SD.statusPill(x.rec, 67, 34, ['Zone verte', 'Zone jaune', 'Zone rouge']),
          `HRV ${zTxt('hrv', 0)} · FC repos ${zTxt('rhr', 0)}<br>Respiration ${zTxt('resp', 1)}`),
        rcard(ring(Object.assign({ value: perf, max: 100, color: T.sleep, unit: '% du besoin', label: 'Sommeil' }, rsz)), 'Sommeil', isNum(perf) ? SD.statusPill(perf, 90, 75, ['Suffisant', 'Un peu court', 'Insuffisant']) : '',
          `${isNum(x.sleepH) ? `<b>${fH(x.sleepH)}</b> dormies · besoin ${fH(need)}` : 'Pas de nuit enregistrée'}<br>${isNum(x.sleepDebt7) ? `Manque sur 7 nuits <b>${fH(x.sleepDebt7)}</b>` : ''}${isNum(x.sleepCons) ? ` · régularité <b>${nf(x.sleepCons, 0)}</b>` : ''}`),
        x.eff
          ? rcard(ring(Object.assign({ value: SD.scores.trainScore(x), max: 100, color: T.strain, text: nf(x.eff.stim, 1), unit: 'séries eff.', label: 'Effort musculation' }, rsz)), 'Effort musculation', `<span class="status ok">${esc(zoneLabel(x.eff.zone))}</span>`,
            `${isNum(x.effPlan) ? `Prévu <b>${nf(x.effPlan, 1)}</b> · réalisé <b>${Math.round((x.eff.stim / x.effPlan) * 100)} %</b><br>` : ''}${nf(x.eff.sets, 1)} séries dont <b>${nf(x.eff.hard, 1)}</b> dures · RIR moyen <b>${isNum(x.eff.rir) ? nf(x.eff.rir, 1) : '—'}</b> · ${nf(x.eff.vol, 0)} kg`)
          : rcard(ring(Object.assign({ value: isNum(x.steps) ? Math.min(100, (x.steps / cfg.stepsGoal) * 100) : null, max: 100, color: T.act, text: isNum(x.steps) ? nf(x.steps / 1000, 1) + 'k' : null, unit: 'pas', label: 'Pas' }, rsz)), 'Jour sans muscu',
            isNum(x.steps) ? SD.statusPill((x.steps / cfg.stepsGoal) * 100, 100, 80, ['Objectif atteint', 'Presque', 'Sous l’objectif']) : '',
            `${zone ? `Activité <b>${SD.scores.STRAIN_LABEL[zone].toLowerCase()}</b> · ` : ''}${nf(x.activeKcal, 0)} kcal actives<br>Pas <b>${nf(x.steps, 0)}</b> / ${nf(cfg.stepsGoal, 0)}`),
      ].join(''));

      // ---- biomarqueurs
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

      // ---- activité & charge
      const act = x.w.map((w) => `<div class="statline"><span><i style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${typeColor(w.type)};margin-right:7px"></i>${esc(w.type)}${STRENGTH.has(w.type) && x.split ? ` · ${esc(x.split)}` : ''}</span><b>${w.min != null ? fHM(w.min) : w.flag ? 'durée ignorée' : '—'}</b></div>`).join('');
      const sets = SD.sum(SD.pluck(x.ex, (e) => e.sets)), vol = SD.sum(SD.pluck(x.ex, (e) => e.vol));
      const prs = x.ex.filter((e) => e.pr);
      const acwrZone = (v) => (v > 1.5 ? ['risque', T.critInk] : v > 1.3 ? ['vigilance', T.warnInk] : v >= 0.8 ? ['optimal', T.goodInk] : ['sous-charge', T.ink2]);
      const wk0 = SD.weekOf(d);
      let weekTrain = 0;
      for (let q = wk0; q <= d; q = addD(q, 1)) { const y = M.at(q); if (y && y.train) weekTrain++; }
      const strainAvg = (n) => { const v = []; for (let i = 0; i < n; i++) { const y = M.at(addD(d, -i)); if (y && isNum(y.strain)) v.push(y.strain); } return v.length >= Math.min(5, n) ? SD.mean(v) : null; };
      const str7 = strainAvg(7), str28 = strainAvg(28);
      setHTML('td-str-b', `
        ${act || '<div class="statline"><span>Aucune séance enregistrée</span><b></b></div>'}
        ${x.eff ? `<div class="statline"><span>Effort musculation</span><b>${nf(x.eff.stim, 1)} séries efficaces · ${esc(zoneLabel(x.eff.zone).toLowerCase())}${isNum(x.effPlan) ? ` · ${Math.round((x.eff.stim / x.effPlan) * 100)} % du prévu` : ''}</b></div>
        <div class="statline"><span>Séries dures (RIR ≤ 3) · à l’échec</span><b>${nf(x.eff.hard, 1)} · ${x.eff.fail}</b></div>` : ''}
        ${x.ex.length ? `<div class="statline"><span>Exercices · séries · volume</span><b>${x.ex.length} · ${sets} · ${nf(vol, 0)} kg</b></div>` : ''}
        ${prs.length ? `<div class="statline"><span>Records personnels</span><b style="color:${T.goodInk}">${prs.map((e) => esc(e.n) + ' ' + nf(e.e1, 1) + ' kg').join(', ')}</b></div>` : ''}
        <div class="statline"><span>Pas</span><b>${nf(x.steps, 0)} / ${nf(cfg.stepsGoal, 0)}</b></div>
        <div class="bar2"><i style="width:${Math.min(100, ((x.steps || 0) / cfg.stepsGoal) * 100)}%;background:${T.act}"></i></div>
        <div class="statline"><span>Calories actives · repos</span><b>${nf(x.activeKcal, 0)} · ${nf(x.restKcal, 0)} kcal</b></div>
        <div class="statline"><span>Minutes d’exercice · étages</span><b>${nf(x.exMin, 0)} min · ${nf(x.flights, 0)}</b></div>
        <div class="statline"><span>Séances de muscu cette semaine</span><b>${weekTrain} / ${nf(cfg.sessionsPerWeek, 0)}</b></div>
        ${isNum(str7) ? `<div class="statline"><span>Charge moyenne 7 j · 28 j</span><b>${nf(str7, 0)} · ${nf(str28, 0)}</b></div>` : ''}
        ${isNum(x.acwr) ? `<div class="statline"><span>Ratio charge 7 j ÷ 28 j</span><b style="color:${acwrZone(x.acwr)[1]}">${nf(x.acwr, 2)} · ${acwrZone(x.acwr)[0]}</b></div>` : ''}`);

      // ---- sommeil 14 nuits
      const nights = [];
      for (let i = 13; i >= 0; i--) { const y = M.at(addD(d, -i)); if (y) nights.push(y); }
      chart('td-sleep', base({
        grid: { left: 8, right: 14, top: 40, bottom: 8, containLabel: true },
        legend: SD.ui.ecLegend(T, ['Sommeil', 'Besoin', 'Base perso']),
        tooltip: Object.assign(base().tooltip, { axisPointer: { type: 'shadow' }, formatter: (ps) => { const y = nights[ps[0].dataIndex]; return tipBox(fdL(y.d), [{ color: T.sleep, box: true, value: fH(y.sleepH), name: 'sommeil' }, { color: T.ink2, value: fH(y.sleepNeed), name: 'besoin du jour' }, { color: T.muted, value: fH(y.sleepBase), name: 'base personnelle' }, { color: T.sleep, value: isNum(y.sleepPerf) ? nf(y.sleepPerf, 0) + ' %' : '—', name: 'performance' }]); } }),
        xAxis: xCat(nights.map((y) => fdS(y.d))), yAxis: yVal({ min: 0, name: 'h' }),
        series: [
          bar('Sommeil', nights.map((y) => ({ value: isNum(y.sleepH) ? +y.sleepH.toFixed(2) : null, itemStyle: { color: T.sleep, opacity: y.d === d ? 1 : 0.55, borderRadius: [4, 4, 0, 0] } })), T.sleep),
          line('Besoin', nights.map((y) => (isNum(y.sleepNeed) ? +y.sleepNeed.toFixed(2) : null)), T.ink2, { connectNulls: true, lineStyle: { width: 1.5, color: T.ink2 } }),
          line('Base perso', nights.map((y) => (isNum(y.sleepBase) ? +y.sleepBase.toFixed(2) : null)), T.muted, { connectNulls: true, lineStyle: { width: 1, type: 'dashed', color: T.muted } }),
        ],
      }), () => ({ cols: ['Nuit', 'Sommeil', 'Besoin', 'Base perso', 'Performance'], rows: nights.map((y) => [fdM(y.d), fH(y.sleepH), fH(y.sleepNeed), fH(y.sleepBase), isNum(y.sleepPerf) ? nf(y.sleepPerf, 0) + ' %' : '—']) }));
      const adj = x.sleepAdj || {};
      setText('td-sleep-s', isNum(need) ? `Besoin ${fH(need)} = base personnelle ${fH(x.sleepBase)}${x.sleepBaseN >= 10 ? ` (médiane de ${x.sleepBaseN} nuits suivies d’une bonne récupération)` : ' (cible de la configuration, pas encore assez de nuits)'}${adj.strain > 0.01 ? ` + ${fHM(adj.strain * 60)} pour la charge de la veille` : ''}${adj.debt > 0.01 ? ` + ${fHM(adj.debt * 60)} de rattrapage` : ''}. 14 dernières nuits.` : '14 dernières nuits');

      // ---- nutrition
      const lg = SD.logged(x);
      const tg = x.tgt;
      const macro = (lab, v, t, col, u) => `<div class="macro"><span>${lab}</span><div class="bar2" style="margin:0"><i style="width:${t ? Math.min(100, ((v || 0) / t) * 100) : 0}%;background:${col}"></i></div><b>${nf(v, 0)}${t ? ' / ' + nf(t, 0) : ''} ${u}</b></div>`;
      setHTML('td-nut-b', isNum(x.kcal) ? `
        <div class="statline"><span>Calories</span><b>${nf(x.kcal, 0)}${tg ? ' / ' + nf(tg.kcal, 0) : ''} kcal ${isNum(nut) ? `· score ${nf(nut, 0)}` : ''}</b></div>
        ${macro('Protéines', x.prot, tg && tg.prot, T.s[0], 'g')}${macro('Glucides', x.carb, tg && tg.carb, T.s[1], 'g')}${macro('Lipides', x.fat, tg && tg.fat, T.s[2], 'g')}
        <div class="statline"><span>Protéines / kg</span><b>${isNum(x.prot) && isNum(x.trendW) ? nf(x.prot / x.trendW, 2) : '—'} g/kg</b></div>
        <div class="statline"><span>Fibres · caféine</span><b>${nf(x.fiber, 0)} g · ${nf(x.caffeine, 0)} mg</b></div>
        ${isNum(x.alcohol) && x.alcohol > 0 ? `<div class="statline"><span>Alcool</span><b style="color:${T.warnInk}">${nf(x.alcohol, 0)} g</b></div>` : ''}
        ${!lg ? `<p class="note">Journée sous le seuil de log partiel (${nf(SD.partialKcal(), 0)} kcal) : exclue des moyennes.</p>` : ''}
        ${isNum(x.tdee) ? `<div class="statline"><span>Balance vs dépense MacroFactor</span><b>${sgn(x.kcal - x.tdee, 0)} kcal</b></div>` : ''}` : '<div class="empty">Rien de loggé dans MacroFactor ce jour-là.</div>');
      const ht = SD.scores.hydroTarget(x), hTot = SD.scores.hydroTotal(x), dr = SD.scores.drinks(x);
      document.getElementById('td-nut-b').insertAdjacentHTML('beforeend', `<div class="statline" style="margin-top:6px"><span>Hydratation</span><b>${isNum(hTot) ? `${nf(hTot / 1000, 1)} / ${nf(ht / 1000, 1)} L` : `cible ${ht ? nf(ht / 1000, 1) + ' L' : '—'}`}</b></div>
        ${isNum(hTot) ? `<div class="bar2"><i style="width:${Math.min(100, (hTot / ht) * 100)}%;background:${T.hydro}"></i></div><p class="note">Dont ${nf(dr / 1000, 1)} L de boissons notées et ${nf((x.water || 0) / 1000, 1)} L d’eau des aliments.</p>`
          : `<p class="note">Boissons non notées ce jour-là${isNum(x.water) ? ` (eau des aliments : ${nf(x.water / 1000, 2)} L)` : ''}. Note-les dans Apple Santé (widget ou raccourci « Eau ») pour les suivre ici.</p>`}`);

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
        yAxis: [yVal({ gridIndex: 0, min: 0, max: 100, interval: 50 }), yVal({ gridIndex: 1, min: 0 })],
        series: [
          { type: 'bar', name: 'Récupération', xAxisIndex: 0, yAxisIndex: 0, barMaxWidth: 14, data: two.map((y) => ({ value: y.rec, itemStyle: { color: SD.recColor(y.rec), borderRadius: [3, 3, 0, 0], opacity: y.d === d ? 1 : 0.7 } })) },
          { type: 'bar', name: 'Effort muscu', xAxisIndex: 1, yAxisIndex: 1, barMaxWidth: 14, data: two.map((y) => ({ value: y.eff ? y.eff.stim : null, itemStyle: { color: y.eff ? ZC(T)[y.eff.zone] : T.strain, borderRadius: [3, 3, 0, 0], opacity: y.d === d ? 1 : 0.85 } })) },
        ],
      }), () => ({ cols: ['Date', 'Récupération', 'Séries efficaces', 'Zone'], rows: two.map((y) => [fdM(y.d), nf(y.rec, 0), y.eff ? nf(y.eff.stim, 1) : '—', y.eff ? zoneLabel(y.eff.zone) : '']) }));
      c14 && c14.on('click', (p) => { const y = two[p.dataIndex]; if (y) { SD.setDay(y.d); SD.refresh(); } });
    },
  };

  SD.PAGES.today = today;
})();
