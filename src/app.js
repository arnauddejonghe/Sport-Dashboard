/* Salle des Machines — application : navigation, filtres, chronologie, détail du jour, import, persistance, démarrage. */
(function () {
  'use strict';
  const SD = window.SD;
  const { S, esc, nf, sgn, fdM, fdL, fdS, fH, fHM, isNum, tms, dstr, addD, nDays, WD, PRESETS, TYPE_ORDER, typeColor, STRENGTH } = SD;

  const $ = (s, el = document) => el.querySelector(s);
  const PAGE_ORDER = ['today', 'journal', 'overview', 'physique', 'strength', 'training', 'recovery', 'body', 'longevity', 'data'];
  // navigation groupée : le quotidien, les résultats, le détail, les données
  const NAV_GROUPS = [['Quotidien', ['today', 'journal']], ['Résultats', ['overview', 'physique', 'strength']], ['Détail', ['training', 'recovery', 'body', 'longevity']], ['', ['data']]];
  SD.PAGE_ORDER = PAGE_ORDER;
  const ICONS = {
    today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    overview: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    recovery: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
    training: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    strength: '<path d="M3 9v6M6 6.5v11M18 6.5v11M21 9v6M6 12h12"/>',
    body: '<path d="M12 21c-4 0-7-3.5-7-8 0-3 2-5 4.5-5 1.2 0 2 .6 2.5 1 .5-.4 1.3-1 2.5-1C17 8 19 10 19 13c0 4.5-3 8-7 8zM12 8c0-2 1-4 3-5"/>',
    longevity: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9"/>',
    journal: '<path d="M6 3h11a2 2 0 0 1 2 2v16H8a3 3 0 0 1-3-3V4a1 1 0 0 1 1-1zM5 18a3 3 0 0 1 3-3h11M9 7h6M9 11h4"/>',
    data: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
    physique: '<circle cx="12" cy="4.5" r="2.2"/><path d="M5 9.5c2.2 1 4.5 1.5 7 1.5s4.8-.5 7-1.5M12 11v5M12 16l-3 5M12 16l3 5"/>',
  };
  const icon = (id) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] || ''}</svg>`;

  // ================================================================ navigation & en-tête
  const navLabel = (id) => SD.PAGES[id].nav || SD.PAGES[id].title;
  function renderNav() {
    const items = PAGE_ORDER.filter((id) => SD.PAGES[id]);
    const btn = (id) => `<button type="button" data-page="${id}" aria-current="${S.page === id ? 'page' : 'false'}">${icon(id)}${esc(navLabel(id))}</button>`;
    $('#nav').innerHTML = NAV_GROUPS.map(([g, ids]) => { const its = ids.filter((id) => SD.PAGES[id]); return its.length ? `${g ? `<div class="nav-g">${esc(g)}</div>` : '<div class="nav-sep"></div>'}${its.map(btn).join('')}` : ''; }).join('');
    $('#mnav').innerHTML = items.map((id) => `<button type="button" data-page="${id}" aria-current="${S.page === id ? 'page' : 'false'}">${esc(navLabel(id))}</button>`).join('');
  }
  function renderHeader() {
    const M = SD.M;
    const name = (M.cfg.athlete || (M.raw.profile && M.raw.profile.firstName) || '').trim();
    $('#brand-sub').textContent = name ? `${name} · ${M.raw.sources.length} sources` : `${M.raw.sources.length} sources`;
    const today = new Date().toISOString().slice(0, 10);
    const age = nDays(M.lastComplete, today) - 1;
    const fresh = $('#fresh');
    fresh.className = 'pill' + (age > 3 ? ' stale' : '');
    fresh.innerHTML = `<span class="dot"></span>Données au <b>${esc(fdS(M.lastComplete))}</b>${age > 3 ? ` · ${age} j de retard` : ''}`;
    const dl = $('#deadline');
    const dd = M.cfg.deadline;
    if (dd && dd.date && dd.date >= today) {
      dl.hidden = false;
      dl.innerHTML = `<b>J-${nDays(today, dd.date) - 1}</b> ${esc(dd.label || 'échéance')}`;
      dl.title = fdL(dd.date);
    } else dl.hidden = true;
    const P = SD.PAGES[S.page];
    $('#page-title').textContent = P ? P.title : '';
    $('#page-sub').textContent = P ? (typeof P.sub === 'function' ? P.sub() : P.sub || '') : '';
  }

  // ================================================================ filtres
  const AN = [['ma7', 'Moyenne 7 j'], ['ma28', 'Moyenne 28 j'], ['trend', 'Tendance'], ['band', 'Plage normale'], ['minmax', 'Min / max / moyenne']];
  function renderFilters() {
    const M = SD.M, F = SD.F;
    const P = SD.PAGES[S.page];
    $('#filters').hidden = !!(P && P.noFilters);
    if (P && P.noFilters) return;
    const types = TYPE_ORDER.filter((t) => M.raw.workouts.some((w) => SD.typeKey(w.type) === t));
    const phaseOpts = M.phases.slice().reverse().map((p) => `<option value="${p.start}|${p.end}"${S.from === p.start && S.to === (p.end > M.last ? M.last : p.end) ? ' selected' : ''}>${esc(p.name)} · ${esc(fdM(p.start))} → ${p.end >= M.last ? 'aujourd’hui' : esc(fdM(p.end))}</option>`).join('');
    const nActive = (S.wds.length < 7 ? 1 : 0) + (S.dayKind !== 'all' ? 1 : 0) + (S.types ? 1 : 0);
    $('#fbody').innerHTML = `
      <div class="frow">
        <div class="fgroup"><span class="flabel">Période</span>
          <div class="seg" role="group" aria-label="Période">${PRESETS.map(([k, l]) => `<button type="button" data-preset="${k}" aria-pressed="${S.preset === k}">${l}</button>`).join('')}</div>
          <span class="dates"><input type="date" id="f-from" value="${S.from}" min="${M.first}" max="${M.last}" aria-label="Du"><span class="fsummary">→</span><input type="date" id="f-to" value="${S.to}" min="${M.first}" max="${M.last}" aria-label="Au"></span>
        </div>
        <div class="fgroup"><span class="flabel">Phase</span><select class="fselect" id="f-phase" aria-label="Aller à une phase"><option value="">Choisir…</option>${phaseOpts}</select></div>
        <button type="button" class="btn" id="f-more" aria-expanded="${S.filtersOpen}">Filtres & analyse${nActive ? ` (${nActive})` : ''}</button>
      </div>
      <div class="fpanel" ${S.filtersOpen ? '' : 'hidden'}>
        <div class="frow">
          <div class="fgroup"><span class="flabel">Analyse</span>${AN.map(([k, l]) => `<button type="button" class="chip an" data-an="${k}" aria-pressed="${!!S.analysis[k]}">${l}</button>`).join('')}</div>
        </div>
        <div class="frow">
          <div class="fgroup"><span class="flabel">Jours</span>${WD.map((d, i) => `<button type="button" class="chip" data-wd="${i}" aria-pressed="${S.wds.includes(i)}">${d}</button>`).join('')}</div>
          <div class="fgroup"><span class="flabel">Type de jour</span><div class="seg" role="group">${[['all', 'Tous'], ['train', 'Muscu'], ['rest', 'Sans muscu']].map(([k, l]) => `<button type="button" data-daykind="${k}" aria-pressed="${S.dayKind === k}">${l}</button>`).join('')}</div></div>
          <div class="fgroup"><span class="flabel">Granularité</span><div class="seg" role="group">${[['auto', 'Auto'], ['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois']].map(([k, l]) => `<button type="button" data-gran="${k}" aria-pressed="${S.gran === k}">${l}</button>`).join('')}</div></div>
        </div>
        <div class="frow">
          <div class="fgroup"><span class="flabel">Activités</span>${types.map((t) => `<button type="button" class="chip" data-type="${esc(t)}" aria-pressed="${!S.types || S.types.includes(t)}"><span class="sw" style="background:${typeColor(t)}"></span>${esc(t)}</button>`).join('')}</div>
          <button type="button" class="link" id="f-reset">Réinitialiser</button>
        </div>
      </div>
      <div class="frow" style="margin-top:8px"><span class="fsummary"><b>${nf(F.days.length, 0)}</b> jours · ${esc(fdM(S.from))} → ${esc(fdM(S.to))}${S.wds.length < 7 ? ` · ${S.wds.map((i) => WD[i]).join(', ')}` : ''}${S.dayKind !== 'all' ? ` · ${S.dayKind === 'train' ? 'jours de muscu' : 'jours sans muscu'}` : ''}${S.types ? ` · ${esc(S.types.join(', '))}` : ''} · ${F.hasPrev ? `comparé au ${esc(fdM(F.pFrom))} → ${esc(fdM(F.pTo))}` : 'pas de période précédente comparable'} · Maj + molette sur un graphique pour zoomer</span></div>`;
  }
  function bindFilters() {
    const fb = $('#filters');
    fb.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.preset) { SD.setPreset(b.dataset.preset); refresh(); }
      else if (b.dataset.an) { S.analysis[b.dataset.an] = !S.analysis[b.dataset.an]; refresh(); }
      else if (b.dataset.wd != null) {
        const i = +b.dataset.wd;
        let w = S.wds.includes(i) ? S.wds.filter((x) => x !== i) : S.wds.concat(i).sort();
        if (!w.length) w = [0, 1, 2, 3, 4, 5, 6];
        S.wds = w; refresh();
      } else if (b.dataset.daykind) { S.dayKind = b.dataset.daykind; refresh(); }
      else if (b.dataset.type) {
        const t = b.dataset.type;
        const all = TYPE_ORDER.filter((x) => SD.M.raw.workouts.some((w) => SD.typeKey(w.type) === x));
        let cur = S.types ? S.types.slice() : all.slice();
        cur = cur.includes(t) ? cur.filter((x) => x !== t) : cur.concat(t);
        S.types = !cur.length || cur.length === all.length ? null : cur;
        refresh();
      } else if (b.dataset.gran) { S.gran = b.dataset.gran; refresh(); }
      else if (b.id === 'f-reset') {
        Object.assign(S, { wds: [0, 1, 2, 3, 4, 5, 6], dayKind: 'all', types: null, gran: 'auto', analysis: Object.assign({}, SD.DEFAULT_STATE.analysis) });
        SD.setPreset('90j'); refresh();
      } else if (b.id === 'f-more') { S.filtersOpen = !S.filtersOpen; renderFilters(); SD.saveState(); }
    });
    fb.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'f-from' || t.id === 'f-to') {
        const f = $('#f-from').value, to = $('#f-to').value;
        if (f && to) { SD.setRange(f, to); refresh(); }
      } else if (t.id === 'f-phase' && t.value) {
        const [a, b] = t.value.split('|');
        SD.setRange(a, b); refresh();
      }
    });
  }

  // ================================================================ chronologie
  let tl = null, tlSync = false, tlTimer = null;
  function renderTimeline() {
    const M = SD.M, T = SD.T;
    const el = $('#timeline');
    if (!window.echarts || !el) return;
    tl = echarts.getInstanceByDom(el) || echarts.init(el);
    const wk = new Map();
    for (const x of M.days) { const k = SD.weekOf(x.d); wk.set(k, (wk.get(k) || 0) + (isNum(x.strain) ? x.strain : 0)); }
    const data = [...wk.entries()].map(([k, v]) => [tms(k), +v.toFixed(1)]);
    const pad = el.clientWidth < 600 ? 44 : 60;
    tl.setOption({
      animation: false,
      grid: { left: 0, right: 0, top: 0, height: 1, show: false },
      xAxis: { type: 'time', show: false, min: tms(M.first), max: tms(M.last) },
      yAxis: { type: 'value', show: false },
      series: [{ type: 'line', data, showSymbol: false, lineStyle: { opacity: 0 }, silent: true }],
      dataZoom: [{
        type: 'slider', xAxisIndex: 0, filterMode: 'none', top: 4, bottom: 18, left: pad, right: pad, startValue: tms(S.from), endValue: tms(S.to),
        showDataShadow: true, brushSelect: false, realtime: false, backgroundColor: T.card, borderColor: T.line, borderRadius: 8,
        fillerColor: 'rgba(46,155,255,0.16)',
        dataBackground: { lineStyle: { color: T.axis, width: 1 }, areaStyle: { color: T.card2, opacity: 1 } },
        selectedDataBackground: { lineStyle: { color: T.strain, width: 1 }, areaStyle: { color: T.strain, opacity: 0.3 } },
        handleIcon: 'path://M-3,-12h6v24h-6z', handleSize: '90%', handleStyle: { color: T.ink, borderColor: T.ink },
        moveHandleSize: 6, moveHandleStyle: { color: T.axis, opacity: 0.7 },
        textStyle: { color: T.ink2, fontSize: 11, fontFamily: SD.FONT }, labelFormatter: (v) => fdS(dstr(v)) + ' ' + dstr(v).slice(2, 4),
      }],
    }, true);
    tl.off('datazoom');
    tl.on('datazoom', () => {
      if (tlSync) return;
      clearTimeout(tlTimer);
      tlTimer = setTimeout(() => {
        const dz = tl.getOption().dataZoom[0];
        SD.setRange(dstr(Math.round(dz.startValue / SD.DAY) * SD.DAY), dstr(Math.round(dz.endValue / SD.DAY) * SD.DAY));
        refresh({ fromTimeline: true });
      }, 120);
    });
  }
  function syncTimeline() {
    if (!tl) return;
    tlSync = true;
    tl.dispatchAction({ type: 'dataZoom', startValue: tms(S.from), endValue: tms(S.to) });
    setTimeout(() => { tlSync = false; }, 0);
  }

  // ================================================================ rendu
  function showPage(id) {
    if (!SD.PAGES[id]) id = 'today';
    S.page = id;
    $('#view').innerHTML = `<div class="page" id="page-${id}">${SD.PAGES[id].html()}</div>`;
    SD.disposeDetached();
    renderNav();
    renderHeader();
    refresh();
    window.scrollTo({ top: 0 });
    const tlWas = $('#timeline');
    if (tlWas && tl) setTimeout(() => tl.resize(), 0);
  }
  SD.showPage = showPage;
  function refresh(opts) {
    opts = opts || {};
    SD.compute();
    renderFilters();
    if (!opts.fromTimeline) syncTimeline();
    SD.segSync();
    try { SD.PAGES[S.page].update(); } catch (e) { console.error(e); }
    SD.saveState();
  }
  SD.refresh = refresh;

  function bindView() {
    const v = $('#view');
    v.addEventListener('click', (e) => {
      const segBtn = e.target.closest('.card .seg[data-state] button');
      if (segBtn) {
        const key = segBtn.parentElement.dataset.state;
        S[key] = typeof SD.DEFAULT_STATE[key] === 'number' ? +segBtn.dataset.v : segBtn.dataset.v;
        refresh();
        return;
      }
      const shift = e.target.closest('[data-dayshift]');
      if (shift) { SD.setDay(addD(S.day || SD.M.lastComplete, +shift.dataset.dayshift)); refresh(); return; }
      if (e.target.closest('#td-last')) { SD.setDay(SD.M.lastComplete); refresh(); return; }
      const tb = e.target.closest('.tbl-toggle');
      if (tb) {
        const card = tb.closest('.card');
        const ch = card.querySelector('.chart'), tv = card.querySelector('.tbl-view');
        const on = tb.getAttribute('aria-pressed') !== 'true';
        tb.setAttribute('aria-pressed', String(on));
        tb.textContent = on ? 'Graphique' : 'Tableau';
        ch.hidden = on; tv.hidden = !on;
        if (on) SD.renderTable(tb.dataset.tbl); else { const c = SD.charts.get(tb.dataset.tbl); c && c.resize(); }
        return;
      }
      const row = e.target.closest('tr[data-day]');
      if (row) openDay(row.dataset.day);
    });
    v.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('select[data-state]')) { S[t.dataset.state] = t.value; refresh(); }
      else if (t.id === 'td-pick' || t.id === 'jr-pick') { if (t.value) { SD.setDay(t.value); refresh(); } }
    });
    v.addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'bd-pk') {
        S.partialKcal = +t.value;
        $('#bd-pk-v').textContent = nf(+t.value, 0);
        clearTimeout(t._tm);
        t._tm = setTimeout(refresh, 180);
      }
    });
    const nav = (e) => { const b = e.target.closest('[data-page]'); if (b) showPage(b.dataset.page); };
    $('#nav').addEventListener('click', nav);
    $('#mnav').addEventListener('click', nav);
  }

  // ================================================================ détail d'un jour
  let lastFocus = null;
  function openDay(d) {
    const M = SD.M, x = M.at(d), T = SD.T;
    if (!x) return;
    lastFocus = document.activeElement;
    const stat = (l, v) => `<div class="dstat"><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div></div>`;
    const tg = x.tgt;
    const notes = M.raw.notes.filter((n) => n.d === d);
    const ex = x.ex.slice().sort((a, b) => a.n.localeCompare(b.n));
    const je = SD.journal.combined(d);
    const co = M.coach.get(d);
    const ds = SD.scores.dayScore(x);
    $('#drawer-body').innerHTML = `
      <p class="fsummary">${x.phase ? `Phase ${esc(x.phase)}` : ''}${x.partial ? ' · journée incomplète (jour de l’export)' : ''}</p>
      <h2 id="drawer-title">${esc(fdL(d))}</h2>
      <div style="display:flex;gap:14px;justify-content:space-between;margin-top:14px">
        ${SD.ring({ value: x.rec, max: 100, color: SD.recColor(x.rec), unit: '%', label: 'Récup', size: 92, stroke: 9, cls: 'sm' })}
        ${SD.ring({ value: x.strain, max: 100, color: T.strain, text: isNum(x.strain) ? nf(x.strain, 0) : null, label: 'Charge', size: 92, stroke: 9, cls: 'sm' })}
        ${SD.ring({ value: x.sleepPerf, max: 100, color: T.sleep, unit: '%', label: 'Sommeil', size: 92, stroke: 9, cls: 'sm' })}
        ${SD.ring({ value: ds, max: 100, color: SD.scoreColor(ds), text: isNum(ds) ? SD.scores.grade(ds) : null, label: 'Note', size: 92, stroke: 9, cls: 'sm' })}
      </div>
      ${x.alert ? `<div class="alert ${x.alert.level === 'crit' ? '' : 'warn'}" style="margin-top:14px"><b>Signal physiologique</b>${esc(x.alert.flags.join(' · '))}</div>` : ''}
      <h3>Récupération</h3><div class="dgrid">
        ${stat('Sommeil', isNum(x.sleepH) ? `${fH(x.sleepH)} / ${fH(x.sleepNeed)}` : '—')}${stat('HRV (plage)', isNum(x.hrvLo) ? `${nf(x.hrvLo, 0)}–${nf(x.hrvHi, 0)} ms` : '—')}
        ${stat('FC repos', isNum(x.rhr) ? `${nf(x.rhr, 0)} bpm${x.z && isNum(x.z.rhr) ? ` (${sgn(x.z.rhr, 1)} σ)` : ''}` : '—')}${stat('Respiration', isNum(x.resp) ? `${nf(x.resp, 1)} /min` : '—')}
      </div>
      <h3>Activité</h3><div class="dgrid">
        ${stat('Pas', nf(x.steps, 0))}${stat('Calories actives', isNum(x.activeKcal) ? nf(x.activeKcal, 0) + ' kcal' : '—')}
        ${stat('Minutes d’exercice', isNum(x.exMin) ? nf(x.exMin, 0) + ' min' : '—')}${stat('Asymétrie de marche', isNum(x.walkAsym) ? nf(x.walkAsym, 1) + ' %' : '—')}
      </div>
      ${x.w.length ? `<h3>Séances</h3><ul>${x.w.map((w) => `<li><span style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${typeColor(w.type)};margin-right:6px"></span>${esc(w.type)}${STRENGTH.has(w.type) && x.split ? ` · ${esc(x.split)}` : ''} — ${w.min != null ? esc(fHM(w.min)) : w.flag ? `durée ignorée (${esc(fHM(w.rawMin))}, chrono oublié ?)` : 'durée inconnue'}</li>`).join('')}</ul>` : ''}
      ${ex.length ? `<h3>Exercices (${ex.length})</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>Exercice</th><th class="num">Séries</th><th class="num">Reps</th><th class="num">Max</th><th class="num">e1RM</th></tr></thead><tbody>${ex.map((e) => `<tr><td style="white-space:normal">${esc(e.n)}${e.pr ? ' <b style="color:var(--good)">PR</b>' : ''}</td><td class="num">${nf(e.sets, 0)}</td><td class="num">${nf(e.reps, 0)}</td><td class="num">${nf(e.hw, 1)}</td><td class="num">${nf(e.e1, 1)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <h3>Corps & nutrition</h3><div class="dgrid">
        ${stat('Pesée', isNum(x.weight) ? nf(x.weight, 2) + ' kg' : '—')}${stat('Poids tendance', isNum(x.trendW) ? nf(x.trendW, 2) + ' kg' : '—')}
        ${stat('Calories', isNum(x.kcal) ? `${nf(x.kcal, 0)}${tg ? ' / ' + nf(tg.kcal, 0) : ''} kcal` : '—')}${stat('Protéines', isNum(x.prot) ? `${nf(x.prot, 0)}${tg ? ' / ' + nf(tg.prot, 0) : ''} g` : '—')}
      </div>
      ${je || notes.length || co ? `<h3>Journal</h3><ul>${je ? `<li>${esc([...SD.journal.SCALES.filter(([k]) => isNum(je[k])).map(([k, l]) => `${l} ${je[k]}/5`), ...(je.tags || []).map((t) => '#' + (SD.journal.labels()[t] || t))].join(' · '))}${je.texts.length ? ` — ${esc(je.texts.join(' · '))}` : ''}</li>` : ''}${notes.map((n) => `<li>${n.ex ? `<b>${esc(n.ex)}</b> · ` : ''}${esc(n.text)}</li>`).join('')}${co ? `<li><b>Coach</b>${co.scores && isNum(co.scores.global) ? ` (global ${nf(co.scores.global, 0)})` : ''} · ${esc(co.verdict)}</li>` : ''}</ul>` : ''}
      <div style="display:flex;gap:8px;margin-top:20px;flex-wrap:wrap">
        <button type="button" class="btn" data-go="${addD(d, -1)}">← Veille</button><button type="button" class="btn" data-go="${addD(d, 1)}">Lendemain →</button>
        <button type="button" class="btn primary" data-open-day="${d}">Ouvrir la journée</button>
      </div>`;
    $('#scrim').hidden = false;
    $('#drawer').hidden = false;
    $('#drawer-close').focus();
  }
  function closeDay() {
    $('#scrim').hidden = true;
    $('#drawer').hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  SD.openDay = openDay;

  // ================================================================ persistance (IndexedDB)
  const DB = 'salle-des-machines', STORE = 'kv';
  function idb(mode, fn) {
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        try {
          const tx = req.result.transaction(STORE, mode);
          const r = fn(tx.objectStore(STORE));
          tx.oncomplete = () => resolve(r && r.result);
          tx.onerror = () => reject(tx.error);
        } catch (e) { reject(e); }
      };
    });
  }
  const saveLocal = (data) => idb('readwrite', (s) => s.put(data, 'dataset')).catch(() => null);
  const loadLocal = () => idb('readonly', (s) => s.get('dataset')).catch(() => null);
  const clearLocal = () => idb('readwrite', (s) => s.delete('dataset')).catch(() => null);
  const stamp = (r) => String((r && (r.syncedAt || r.importedAt || r.generatedAt)) || '');

  /** Enregistre un jeu de données fusionné ; sans `quiet`, recharge le dashboard dessus */
  SD.persist = async (data, quiet) => {
    await saveLocal(data);
    if (quiet) { SD.M.raw.syncedAt = data.syncedAt; return; }
    reboot(data);
  };
  function reboot(raw) {
    SD.prepare(raw);
    SD.readTheme();
    if (S.preset !== 'custom') SD.setPreset(S.preset); else SD.setRange(S.from, S.to);
    renderHeader();
    renderTimeline();
    showPage(S.page);
  }

  SD.loadXLSX = function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    const urls = ['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'node_modules/xlsx/dist/xlsx.full.min.js'];
    return urls.reduce((p, u) => p.catch(() => new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = u; s.onload = () => (window.XLSX ? res(window.XLSX) : rej(new Error('XLSX'))); s.onerror = rej;
      document.head.appendChild(s);
    })), Promise.reject(new Error('start')));
  };

  // ================================================================ import manuel
  let importMsgs = [];
  function renderLog(log) {
    if (!log) return;
    log.innerHTML = '';
    for (const m of importMsgs) { const l = document.createElement('li'); l.textContent = m.txt; if (m.err) l.className = 'err'; log.appendChild(l); }
  }
  async function importFiles(files, logEl) {
    const log = logEl || $('#import-log');
    const P = window.SDParsers;
    const parts = [];
    importMsgs = [];
    const li = (txt, err) => { importMsgs.push({ txt, err }); renderLog(log); };
    let XLSX = null;
    for (const f of files) {
      try {
        let p;
        if (/\.(csv|md)$/i.test(f.name)) p = P.parseFile({ name: f.name, text: await f.text() });
        else { XLSX = XLSX || (await SD.loadXLSX()); p = P.parseFile({ name: f.name, buffer: new Uint8Array(await f.arrayBuffer()) }, XLSX); }
        parts.push(p);
        li(`✓ ${f.name}`);
      } catch (e) { li(`✗ ${f.name} — ${e.message || e}`, true); }
    }
    if (!parts.length) return;
    const add = P.mergeParsed(parts, {});
    const base = SD.M ? SD.M.raw : null;
    const merged = P.overlayDataset(base, add);
    if (base && base.config) merged.config = base.config;
    merged.importedAt = new Date().toISOString();
    li(`→ ${merged.days.length} jours au total, du ${fdM(merged.coverage.from)} au ${fdM(merged.coverage.to)}.`);
    await saveLocal(merged);
    if (!SD.M) { boot(merged); showPage('data'); } else reboot(merged);
  }
  function bindImport() {
    const drop = $('#drop'), inp = $('#file-in');
    if (!drop || drop._bound) return;
    drop._bound = true;
    inp.addEventListener('change', () => inp.files.length && importFiles([...inp.files]));
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => { const fs = [...(e.dataTransfer.files || [])]; if (fs.length) importFiles(fs); });
    renderLog($('#import-log'));
    const bn = $('#import-banner');
    if (SD.M && (SD.M.raw.importedAt || SD.M.raw.syncedAt) && window.SD_DATA && stamp(SD.M.raw) > stamp(window.SD_DATA)) {
      bn.innerHTML = `<div class="banner"><span>Données enrichies dans ce navigateur (import ou synchro Drive).</span><button type="button" class="link" id="reset-local">Revenir aux données publiées</button></div>`;
      $('#reset-local').onclick = async () => { await clearLocal(); reboot(window.SD_DATA); };
    }
  }
  SD.bindImport = bindImport;

  // ================================================================ démarrage
  function boot(raw) {
    SD.prepare(raw);
    SD.readTheme();
    if (!S.from || !S.to || S.preset !== 'custom') SD.setPreset(S.preset && S.preset !== 'custom' ? S.preset : '90j');
    else SD.setRange(S.from, S.to);
    if (!S.day || !SD.M.at(S.day)) S.day = SD.M.lastComplete;
    $('#app').hidden = false;
    $('#onboarding').hidden = true;
    renderNav();
    renderHeader();
    renderTimeline();
  }
  function onboarding() {
    $('#app').hidden = true;
    $('#onboarding').hidden = false;
    const inp = $('#ob-file');
    inp.addEventListener('change', () => inp.files.length && importFiles([...inp.files], $('#ob-log')));
    const drop = $('#ob-drop');
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => { const fs = [...(e.dataTransfer.files || [])]; if (fs.length) importFiles(fs, $('#ob-log')); });
  }

  SD.onJournal = () => {
    if (!SD.M) return;
    if (['today', 'journal'].includes(S.page)) { try { SD.compute(); SD.PAGES[S.page].update(); } catch (e) { console.error(e); } }
  };

  async function init() {
    SD.loadState();
    bindFilters();
    bindView();
    $('#import-btn').addEventListener('click', () => showPage('data'));
    $('#drawer-close').addEventListener('click', closeDay);
    $('#scrim').addEventListener('click', closeDay);
    $('#drawer').addEventListener('click', (e) => {
      const b = e.target.closest('[data-go]');
      if (b) { openDay(b.dataset.go); return; }
      const o = e.target.closest('[data-open-day]');
      if (o) { closeDay(); SD.setDay(o.dataset.openDay); showPage('today'); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#drawer').hidden) closeDay(); });
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { SD.resizeAll(); if (tl) tl.resize(); if (SD.M && S.page === 'overview') SD.PAGES.overview.update(); }, 200); });

    const embedded = window.SD_DATA || null;
    const local = await loadLocal();
    const raw = local && (!embedded || stamp(local) > stamp(embedded)) ? local : embedded;
    if (!raw || !raw.days || !raw.days.length) { onboarding(); return; }
    boot(raw);
    const hash = (location.hash || '').replace('#', '');
    showPage(SD.PAGES[hash] ? hash : S.page);
    SD.journal.init().then(() => SD.onJournal()).catch(() => null);
    SD.drive.init().catch(() => null);
    if (SD.cal) SD.cal.init().catch(() => null);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { renderTimeline(); refresh(); });
  }

  window.addEventListener('hashchange', () => { const h = location.hash.replace('#', ''); if (SD.M && SD.PAGES[h]) showPage(h); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
