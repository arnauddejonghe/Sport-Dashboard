/* Salle des Machines — application : en-tête, filtres, chronologie, détail du jour, import. */
(function () {
  'use strict';
  const SD = window.SD;
  const { S, esc, nf, fdM, fdL, fdS, fH, fHM, isNum, tms, dstr, addD, nDays, WD, WDL, PRESETS, TYPE_ORDER, typeColor, STRENGTH } = SD;

  const $ = (s, el = document) => el.querySelector(s);
  const view = () => $('#view');

  // ================================================================ en-tête & onglets
  function renderHeader() {
    const M = SD.M;
    const name = (M.cfg.athlete || (M.raw.profile && M.raw.profile.firstName) || '').trim();
    $('#brand-sub').textContent = `${name ? name + ' · ' : ''}${fdM(M.first)} → ${fdM(M.last)} · ${M.raw.sources.length} exports`;
    const today = new Date().toISOString().slice(0, 10);
    const age = nDays(M.lastComplete, today) - 1;
    const fresh = $('#fresh');
    fresh.classList.toggle('stale', age > 3);
    fresh.innerHTML = `<span class="dot"></span>Données au <strong>${esc(fdS(M.lastComplete))}</strong>${age > 3 ? ` · ${age} j de retard` : ''}`;
    const dl = $('#deadline');
    const dd = M.cfg.deadline;
    if (dd && dd.date && dd.date >= today) {
      dl.hidden = false;
      dl.innerHTML = `<strong>J-${nDays(today, dd.date) - 1}</strong> <span class="pill-label">${esc(dd.label || 'échéance')}</span>`;
      dl.title = fdL(dd.date);
    } else dl.hidden = true;
  }

  function renderTabs() {
    $('#tabs').innerHTML = SD.PAGE_ORDER.map((id) => `<button type="button" class="tab" role="tab" data-page="${id}" aria-selected="${S.page === id}">${esc(SD.PAGES[id].title)}</button>`).join('');
  }

  // ================================================================ barre de filtres
  function renderFilters() {
    const M = SD.M, F = SD.F;
    const types = TYPE_ORDER.filter((t) => M.raw.workouts.some((w) => SD.typeKey(w.type) === t));
    const phaseOpts = M.phases.slice().reverse().map((p, i) => {
      const v = `${p.start}|${p.end}`;
      return `<option value="${v}"${S.from === p.start && S.to === (p.end > M.last ? M.last : p.end) ? ' selected' : ''}>${esc(p.name)} · ${esc(fdM(p.start))} → ${p.end >= M.last ? 'aujourd’hui' : esc(fdM(p.end))}</option>`;
    }).join('');
    const nActive = (S.wds.length < 7 ? 1 : 0) + (S.dayKind !== 'all' ? 1 : 0) + (S.types ? 1 : 0);
    $('#fbody').innerHTML = `
      <div class="frow">
        <div class="fgroup"><span class="flabel">Période</span>
          <div class="seg" role="group" aria-label="Période">${PRESETS.map(([k, l]) => `<button type="button" data-preset="${k}" aria-pressed="${S.preset === k}">${l}</button>`).join('')}</div>
          <span class="dates"><input type="date" id="f-from" value="${S.from}" min="${M.first}" max="${M.last}" aria-label="Du"><span class="fsummary">→</span><input type="date" id="f-to" value="${S.to}" min="${M.first}" max="${M.last}" aria-label="Au"></span>
        </div>
        <div class="fgroup"><span class="flabel">Phase</span>
          <select class="fselect" id="f-phase" aria-label="Aller à une phase"><option value="">Choisir une phase…</option>${phaseOpts}</select>
        </div>
        <button type="button" class="btn ftoggle" id="f-more" aria-expanded="false">Plus de filtres${nActive ? ` (${nActive})` : ''}</button>
      </div>
      <div class="fpanel"><div class="frow">
        <div class="fgroup"><span class="flabel">Jours</span>${WD.map((d, i) => `<button type="button" class="chip" data-wd="${i}" aria-pressed="${S.wds.includes(i)}">${d}</button>`).join('')}</div>
        <div class="fgroup"><span class="flabel">Type de jour</span><div class="seg" role="group">${[['all', 'Tous'], ['train', 'Muscu'], ['rest', 'Sans muscu']].map(([k, l]) => `<button type="button" data-daykind="${k}" aria-pressed="${S.dayKind === k}">${l}</button>`).join('')}</div></div>
        <div class="fgroup"><span class="flabel">Activités</span>${types.map((t) => `<button type="button" class="chip" data-type="${esc(t)}" aria-pressed="${!S.types || S.types.includes(t)}"><span class="sw" style="background:${typeColor(t)}"></span>${esc(t)}</button>`).join('')}</div>
        <div class="fgroup"><span class="flabel">Granularité</span><div class="seg" role="group">${[['auto', 'Auto'], ['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois']].map(([k, l]) => `<button type="button" data-gran="${k}" aria-pressed="${S.gran === k}">${l}</button>`).join('')}</div></div>
        <button type="button" class="link" id="f-reset">Réinitialiser</button>
      </div></div>
      <div class="frow"><span class="fsummary" id="f-sum"><b>${nf(F.days.length, 0)}</b> jours · ${esc(fdM(S.from))} → ${esc(fdM(S.to))} (${nDays(S.from, S.to)} j)${S.wds.length < 7 ? ` · ${S.wds.map((i) => WD[i]).join(', ')}` : ''}${S.dayKind !== 'all' ? ` · ${S.dayKind === 'train' ? 'jours de muscu' : 'jours sans muscu'}` : ''}${S.types ? ` · ${S.types.join(', ')}` : ''} · ${F.hasPrev ? `comparé au ${esc(fdM(F.pFrom))} → ${esc(fdM(F.pTo))}` : 'pas de période précédente comparable'}</span></div>`;
    const open = $('#filters').classList.contains('open');
    $('#f-more').setAttribute('aria-expanded', String(open));
  }

  function bindFilters() {
    const fb = $('#filters');
    fb.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.preset) { SD.setPreset(b.dataset.preset); refresh(); }
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
        Object.assign(S, { wds: [0, 1, 2, 3, 4, 5, 6], dayKind: 'all', types: null, gran: 'auto' });
        SD.setPreset('6m'); refresh();
      } else if (b.id === 'f-more') { fb.classList.toggle('open'); b.setAttribute('aria-expanded', String(fb.classList.contains('open'))); }
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

  // ================================================================ chronologie (curseur global)
  let tl = null, tlSync = false, tlTimer = null;
  function renderTimeline() {
    const M = SD.M, T = SD.T;
    const el = $('#timeline');
    if (!window.echarts) return;
    tl = echarts.getInstanceByDom(el) || echarts.init(el);
    const wk = new Map();
    for (const x of M.days) { const k = SD.weekOf(x.d); wk.set(k, (wk.get(k) || 0) + (x.train ? 1 : 0)); }
    const data = [...wk.entries()].map(([k, v]) => [tms(k), v]);
    tl.setOption({
      animation: false,
      grid: { left: 0, right: 0, top: 0, height: 1, show: false },
      xAxis: { type: 'time', show: false, min: tms(M.first), max: tms(M.last) },
      yAxis: { type: 'value', show: false },
      series: [{ type: 'line', data, showSymbol: false, lineStyle: { opacity: 0 }, silent: true }],
      dataZoom: [{
        type: 'slider', xAxisIndex: 0, filterMode: 'none', top: 4, bottom: 18, left: el.clientWidth < 600 ? 44 : 58, right: el.clientWidth < 600 ? 44 : 58, startValue: tms(S.from), endValue: tms(S.to),
        showDataShadow: true, brushSelect: false, realtime: false,
        backgroundColor: T.surface2, borderColor: T.border, borderRadius: 6,
        fillerColor: 'rgba(42,120,214,0.16)',
        dataBackground: { lineStyle: { color: T.axis, width: 1 }, areaStyle: { color: T.grid, opacity: 1 } },
        selectedDataBackground: { lineStyle: { color: T.s[0], width: 1 }, areaStyle: { color: T.s[0], opacity: 0.25 } },
        handleIcon: 'path://M-3,-12h6v24h-6z', handleSize: '90%', handleStyle: { color: T.surface, borderColor: T.ink2, borderWidth: 1 },
        moveHandleSize: 6, moveHandleStyle: { color: T.axis, opacity: 0.6 },
        textStyle: { color: T.ink2, fontSize: 11, fontFamily: SD.FONT }, labelFormatter: (v) => fdS(dstr(v)) + ' ' + dstr(v).slice(2, 4),
      }],
    }, true);
    tl.off('datazoom');
    tl.on('datazoom', () => {
      if (tlSync) return;
      clearTimeout(tlTimer);
      tlTimer = setTimeout(() => {
        const dz = tl.getOption().dataZoom[0];
        const a = dstr(Math.round(dz.startValue / SD.DAY) * SD.DAY), b = dstr(Math.round(dz.endValue / SD.DAY) * SD.DAY);
        SD.setRange(a, b);
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
    if (!SD.PAGES[id]) id = 'overview';
    S.page = id;
    view().innerHTML = `<div class="page" id="page-${id}">${SD.PAGES[id].html()}</div>`;
    SD.disposeDetached();
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.page === id)));
    refresh();
  }
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
    const v = view();
    v.addEventListener('click', (e) => {
      const segBtn = e.target.closest('.card .seg[data-state] button');
      if (segBtn) {
        const key = segBtn.parentElement.dataset.state;
        S[key] = typeof SD.DEFAULT_STATE[key] === 'number' ? +segBtn.dataset.v : segBtn.dataset.v;
        refresh();
        return;
      }
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
  }

  // ================================================================ détail d'un jour
  let lastFocus = null;
  function openDay(d) {
    const M = SD.M, x = M.at(d);
    if (!x) return;
    lastFocus = document.activeElement;
    const stat = (l, v) => `<div class="dstat"><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div></div>`;
    const tg = x.tgt;
    const notes = M.raw.notes.filter((n) => n.d === d);
    const ex = x.ex.slice().sort((a, b) => a.n.localeCompare(b.n));
    $('#drawer-body').innerHTML = `
      <p class="fsummary">${x.phase ? `Phase ${esc(x.phase)}` : ''}${x.partial ? ' · journée incomplète (jour de l’export)' : ''}</p>
      <h2 id="drawer-title">${esc(fdL(d))}</h2>
      <h3>Récupération</h3><div class="dgrid">
        ${stat('Sommeil', fH(x.sleepH))}${stat('Score récup', isNum(x.rec) ? nf(x.rec, 0) + '/100' : '—')}
        ${stat('HRV (plage)', isNum(x.hrvLo) ? `${nf(x.hrvLo, 0)}–${nf(x.hrvHi, 0)} ms` : '—')}${stat('FC repos', isNum(x.rhr) ? nf(x.rhr, 0) + ' bpm' : '—')}
      </div>
      <h3>Activité</h3><div class="dgrid">
        ${stat('Pas', nf(x.steps, 0))}${stat('Calories actives', isNum(x.activeKcal) ? nf(x.activeKcal, 0) + ' kcal' : '—')}
        ${stat('Minutes d’exercice', isNum(x.exMin) ? nf(x.exMin, 0) + ' min' : '—')}${stat('Asymétrie de marche', isNum(x.walkAsym) ? nf(x.walkAsym, 1) + ' %' : '—')}
      </div>
      ${x.w.length ? `<h3>Séances</h3><ul>${x.w.map((w) => `<li><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${typeColor(w.type)};margin-right:6px"></span>${esc(w.type)}${STRENGTH.has(w.type) && x.split ? ` · ${esc(x.split)}` : ''} — ${w.min != null ? esc(fHM(w.min)) : w.flag ? `durée ignorée (${esc(fHM(w.rawMin))}, chrono oublié ?)` : 'durée inconnue'}</li>`).join('')}</ul>` : ''}
      ${ex.length ? `<h3>Exercices (${ex.length})</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>Exercice</th><th class="num">Séries</th><th class="num">Reps</th><th class="num">Max</th><th class="num">e1RM</th></tr></thead><tbody>${ex.map((e) => `<tr><td style="white-space:normal">${esc(e.n)}</td><td class="num">${nf(e.sets, 0)}</td><td class="num">${nf(e.reps, 0)}</td><td class="num">${nf(e.hw, 1)}</td><td class="num">${nf(e.e1, 1)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <h3>Corps & nutrition</h3><div class="dgrid">
        ${stat('Pesée', isNum(x.weight) ? nf(x.weight, 2) + ' kg' : '—')}${stat('Poids tendance', isNum(x.trendW) ? nf(x.trendW, 2) + ' kg' : '—')}
        ${stat('Calories', isNum(x.kcal) ? `${nf(x.kcal, 0)}${tg ? ' / ' + nf(tg.kcal, 0) : ''} kcal` : '—')}${stat('Protéines', isNum(x.prot) ? `${nf(x.prot, 0)}${tg ? ' / ' + nf(tg.prot, 0) : ''} g` : '—')}
        ${stat('Glucides', isNum(x.carb) ? nf(x.carb, 0) + ' g' : '—')}${stat('Lipides', isNum(x.fat) ? nf(x.fat, 0) + ' g' : '—')}
      </div>
      ${notes.length ? `<h3>Notes</h3><ul>${notes.map((n) => `<li>${n.ex ? `<b>${esc(n.ex)}</b> · ` : ''}${esc(n.text)}</li>`).join('')}</ul>` : ''}
      <div style="display:flex;gap:8px;margin-top:20px;flex-wrap:wrap">
        <button type="button" class="btn" data-go="${addD(d, -1)}">← Veille</button><button type="button" class="btn" data-go="${addD(d, 1)}">Lendemain →</button>
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

  // ================================================================ import (navigateur)
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

  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    const urls = ['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'node_modules/xlsx/dist/xlsx.full.min.js'];
    return urls.reduce((p, u) => p.catch(() => new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = u; s.onload = () => (window.XLSX ? res(window.XLSX) : rej(new Error('XLSX'))); s.onerror = rej;
      document.head.appendChild(s);
    })), Promise.reject(new Error('start')));
  }

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
        if (/\.csv$/i.test(f.name)) p = P.parseFile({ name: f.name, text: await f.text() });
        else {
          XLSX = XLSX || (await loadXLSX());
          p = P.parseFile({ name: f.name, buffer: new Uint8Array(await f.arrayBuffer()) }, XLSX);
        }
        parts.push(p);
        const n = p.kind === 'health' ? `${Object.keys(p.days).length} jours` : p.kind === 'macrofactor' ? `${Object.keys(p.days).length} jours, ${p.exercises.length} lignes d’exercices` : p.kind === 'trainai' ? `${p.sessions.length} séances` : `${p.notes.length} notes`;
        li(`✓ ${f.name} — ${n}`);
      } catch (e) {
        li(`✗ ${f.name} — ${e.message || e}`, true);
      }
    }
    if (!parts.length) return;
    const add = P.mergeParsed(parts, {});
    const base = SD.M ? SD.M.raw : null;
    const merged = P.overlayDataset(base, add);
    if (base && base.config) merged.config = base.config;
    merged.importedAt = new Date().toISOString();
    await saveLocal(merged);
    li(`→ ${merged.days.length} jours au total, du ${fdM(merged.coverage.from)} au ${fdM(merged.coverage.to)}.`);
    boot(merged, { imported: true });
    showPage('data');
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
    if (SD.M && SD.M.raw.importedAt && window.SD_DATA) {
      bn.innerHTML = `<div class="banner"><span>Données importées dans ce navigateur le ${esc(fdM(SD.M.raw.importedAt.slice(0, 10)))}.</span><button type="button" class="link" id="reset-local">Revenir aux données d’origine</button></div>`;
      $('#reset-local').onclick = async () => { await clearLocal(); boot(window.SD_DATA); showPage('data'); };
    }
  }
  SD.bindImport = bindImport;

  // ================================================================ thème
  function applyTheme() {
    SD.readTheme();
    renderTimeline();
    if (SD.F) SD.PAGES[S.page].update();
  }
  function bindTheme() {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    (mq.addEventListener ? mq.addEventListener('change', applyTheme) : mq.addListener(applyTheme));
    new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    $('#theme-btn').addEventListener('click', () => {
      const root = document.documentElement;
      const dark = root.dataset.theme ? root.dataset.theme === 'dark' : mq.matches;
      root.dataset.theme = dark ? 'light' : 'dark';
      try { localStorage.setItem('sdm-theme', root.dataset.theme); } catch (e) { /* ignoré */ }
    });
  }

  // ================================================================ démarrage
  function boot(raw) {
    SD.M = SD.prepare(raw);
    SD.readTheme();
    if (!S.from || !S.to || S.preset !== 'custom') SD.setPreset(S.preset && S.preset !== 'custom' ? S.preset : '6m');
    else SD.setRange(S.from, S.to);
    $('#app').hidden = false;
    $('#onboarding').hidden = true;
    renderHeader();
    renderTabs();
    renderTimeline();
  }

  function onboarding() {
    $('#app').hidden = true;
    $('#onboarding').hidden = false;
    const inp = $('#ob-file');
    const go = (fs) => importFiles(fs, $('#ob-log'));
    inp.addEventListener('change', () => inp.files.length && go([...inp.files]));
    const drop = $('#ob-drop');
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => { const fs = [...(e.dataTransfer.files || [])]; if (fs.length) go(fs); });
  }

  async function init() {
    try { const th = localStorage.getItem('sdm-theme'); if (th) document.documentElement.dataset.theme = th; } catch (e) { /* ignoré */ }
    SD.loadState();
    bindTheme();
    bindFilters();
    bindView();
    $('#tabs').addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (t) showPage(t.dataset.page); });
    $('#import-btn').addEventListener('click', () => showPage('data'));
    $('#drawer-close').addEventListener('click', closeDay);
    $('#scrim').addEventListener('click', closeDay);
    $('#drawer').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) openDay(b.dataset.go); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#drawer').hidden) closeDay(); });
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { SD.resizeAll(); tl && tl.resize(); if (S.page === 'overview') SD.PAGES.overview.update(); }, 180); });

    const embedded = window.SD_DATA || null;
    const local = await loadLocal();
    const useLocal = local && (!embedded || String(local.importedAt || '') > String(embedded.generatedAt || ''));
    const raw = useLocal ? local : embedded;
    if (!raw || !raw.days || !raw.days.length) { onboarding(); return; }
    boot(raw);
    const hash = (location.hash || '').replace('#', '');
    showPage(SD.PAGES[hash] ? hash : S.page);
    // les libellés des graphiques sont mesurés avec la police : on redessine une fois Barlow chargée
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { renderTimeline(); refresh(); });
  }

  window.addEventListener('hashchange', () => { const h = location.hash.replace('#', ''); if (SD.M && SD.PAGES[h]) showPage(h); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
