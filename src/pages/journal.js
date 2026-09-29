/* Page « Journal » : saisie du jour, fil des entrées (journal, retours, coach, notes de séance, humeur Apple), impact des habitudes. */
(function () {
  'use strict';
  const SD = window.SD;
  const { isNum, nf, sgn, fdM, esc, tms, mean, chart, base, tipBox, axisTip, xCat, yVal, line } = SD;
  const { card, hic, setHTML, setText } = SD.ui;
  let shown = 40;

  // ================================================================ résumé de la période
  // thèmes repérés dans les notes (journal, feuille, notes de séance) : repères de lecture, pas une analyse
  const THEMES = [
    ['fatigue', 'Fatigue, charges lourdes', /fatigu|crev|[ée]puis|lourd|vid[ée]|sans [ée]nergie|[ée]nergivore/i],
    ['dos', 'Dos, lombaires', /lombaire|bas du dos|\bdos\b|reins/i],
    ['genou', 'Genoux', /genou/i],
    ['art', 'Coude, épaule, poignet', /coude|[ée]paule|poignet/i],
    ['sommeil', 'Sommeil', /dorm|sommeil|\bnuit|r[ée]veil/i],
    ['forme', 'Bonnes sensations', /bien dormi|en forme|facile|record|\bpr\b|progress|bonne s[ée]ance|\btop\b|super/i],
    ['stress', 'Stress', /stress|anxi|tendu|pression|charg[ée]e? au boulot/i],
    ['nutri', 'Faim, digestion', /faim|ballonn|digest|mang[ée] trop|fringale/i],
  ];
  const clip = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; };

  /** Contenu du journal sur la période : ressenti, douleurs, tags, notes (journal, feuille, séances) */
  function periodData() {
    const { M, S } = SD, J = SD.journal;
    const days = [];
    for (let d = S.from; d <= S.to; d = SD.addD(d, 1)) days.push(d);
    const ent = days.map((d) => ({ d, c: J.combined(d) })).filter((o) => o.c);
    const texts = [];
    for (const o of ent) for (const t of o.c.texts || []) texts.push({ d: o.d, src: 'journal', text: t });
    for (const n of M.raw.notes) if (n.d >= S.from && n.d <= S.to && n.src !== 'journal') texts.push({ d: n.d, src: n.src, ex: n.ex, text: n.text });
    texts.sort((a, b) => a.d.localeCompare(b.d));
    return { days, ent, texts };
  }

  function renderSummary() {
    const { S, T } = SD, J = SD.journal;
    const { days, ent, texts } = periodData();
    const mid = days[Math.floor(days.length / 2)];
    const scale = (k) => {
      const v = ent.filter((o) => isNum(o.c[k]));
      if (!v.length) return null;
      const a = v.filter((o) => o.d < mid).map((o) => o.c[k]), b = v.filter((o) => o.d >= mid).map((o) => o.c[k]);
      return { avg: mean(v.map((o) => o.c[k])), n: v.length, trend: a.length && b.length ? mean(b) - mean(a) : null };
    };
    const good = { mood: 1, energy: 1, stress: -1, soreness: -1 };
    const tile = (lab, val, sub, cls) => `<div class="jst${cls ? ' ' + cls : ''}"><span>${lab}</span><b>${val}</b><small>${sub || '&nbsp;'}</small></div>`;
    const tiles = [
      tile('Jours notés', `${ent.length}<small> / ${days.length}</small>`, ent.length ? `dernier : ${esc(fdM(ent[ent.length - 1].d))}` : 'aucune entrée'),
      tile('Notes de séance', String(texts.filter((t) => t.src === 'séance').length), 'MacroFactor'),
      ...J.SCALES.map(([k, l]) => {
        const r = scale(k);
        const arrow = r && isNum(r.trend) && Math.abs(r.trend) >= 0.3 ? (r.trend > 0 ? '↗' : '↘') : '';
        const tone = arrow ? (Math.sign(r.trend) === good[k] ? 'up-good' : 'down-bad') : '';
        return tile(l, r ? `${nf(r.avg, 1)}<small> / 5</small>` : '—', r ? `${r.n} jour${r.n > 1 ? 's' : ''}${arrow ? ` · <span class="delta ${tone}">${arrow} ${sgn(r.trend, 1)}</span>` : ''}` : 'non saisi');
      }),
    ];
    // douleurs par zone
    const sites = new Map();
    for (const o of ent) for (const [k, v] of Object.entries(o.c.pain || {})) if (isNum(v)) { const q = sites.get(k) || { n: 0, max: 0, hi: 0, last: null }; if (v > 0) { q.n++; q.last = o.d; } if (v >= 4) q.hi++; q.max = Math.max(q.max, v); sites.set(k, q); }
    const pains = [...sites.entries()].filter(([, q]) => q.n).map(([k, q]) => `<b>${esc(k)}</b> ${q.n} jour${q.n > 1 ? 's' : ''} · max ${nf(q.max, 0)}/10${q.hi ? ` · ${q.hi} jour${q.hi > 1 ? 's' : ''} ≥ 4` : ''} · dernier ${esc(fdM(q.last))}`);
    // tags
    const tc = new Map();
    for (const o of ent) for (const t of o.c.tags || []) tc.set(t, (tc.get(t) || 0) + 1);
    const labels = J.labels();
    const tags = [...tc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t, n]) => `<span class="tagchip static">${esc(labels[t] || t)} <b>${n}</b></span>`);
    // thèmes des notes
    const th = THEMES.map(([k, l, re]) => { const hit = texts.filter((t) => re.test(t.text)); return { k, l, n: hit.length, last: hit[hit.length - 1] }; }).filter((q) => q.n).sort((a, b) => b.n - a.n);
    const quote = (t) => `<p><span class="src">${esc(fdM(t.d))}${t.src === 'séance' ? ' · séance' : ''}</span>${t.ex ? `<b>${esc(t.ex)}</b> · ` : ''}${esc(clip(t.text, 170))}</p>`;
    setText('jr-sum-s', `${fdM(S.from)} → ${fdM(S.to)} · ressenti, douleurs, habitudes et notes (journal, feuille Google, notes de séance MacroFactor)`);
    setHTML('jr-sum-b', `<div class="jstats">${tiles.join('')}</div>
      <div class="jsum-rows">
        <div><span class="k">Douleurs</span><span>${pains.length ? pains.join('<br>') : 'aucune douleur notée'}</span></div>
        <div><span class="k">Habitudes</span><span class="chips">${tags.length ? tags.join('') : 'aucun tag'}</span></div>
        <div><span class="k">Dans tes notes</span><span class="chips">${th.length ? th.map((q) => `<span class="tagchip static">${esc(q.l)} <b>${q.n}</b></span>`).join('') : texts.length ? 'rien de récurrent' : 'aucune note'}</span></div>
      </div>
      ${th.length ? `<div class="jnotes">${th.slice(0, 3).map((q) => quote(q.last)).join('')}</div>` : ''}`);
    renderAI(texts, ent);
  }

  // ---- résumé rédigé par Claude (capability `sample`, à la demande, gardé dans la base de l'Artifact)
  let ai = { key: null, text: '', at: null, busy: false, err: '' };
  const hashOf = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  function promptOf(texts, ent) {
    const { M, S } = SD, J = SD.journal;
    const labels = J.labels();
    const lines = [];
    for (let d = S.from; d <= S.to; d = SD.addD(d, 1)) {
      const x = M.at(d), o = ent.find((e) => e.d === d), c = o && o.c;
      const bits = [];
      if (x && isNum(x.rec)) bits.push(`récupération ${Math.round(x.rec)} %`);
      if (x && isNum(x.sleepH)) bits.push(`sommeil ${SD.fH(x.sleepH)}`);
      if (x && x.train) bits.push(`séance musculation${x.planDay ? ' ' + x.planDay : ''}${x.eff ? ` (${nf(x.eff.stim, 1)} séries efficaces)` : ''}`);
      if (c) {
        const sc = J.SCALES.filter(([k]) => isNum(c[k])).map(([k, l]) => `${l.toLowerCase()} ${c[k]}/5`);
        if (sc.length) bits.push(sc.join(', '));
        const pn = Object.entries(c.pain || {}).filter(([, v]) => isNum(v) && v > 0).map(([k, v]) => `douleur ${k.toLowerCase()} ${v}/10`);
        if (pn.length) bits.push(pn.join(', '));
        if ((c.tags || []).length) bits.push('tags : ' + c.tags.map((t) => labels[t] || t).join(', '));
      }
      const tx = texts.filter((t) => t.d === d).map((t) => (t.src === 'séance' ? `[séance${t.ex ? ' · ' + t.ex : ''}] ` : t.src === 'nutrition' ? '[nutrition] ' : '') + clip(t.text, 400));
      if (!bits.length && !tx.length) continue;
      lines.push(`${d} (${SD.fdate(d, { weekday: 'long' })}) — ${bits.join(' ; ')}${tx.length ? '\n  notes : ' + tx.join(' | ') : ''}`);
    }
    return lines;
  }
  async function renderAI(texts, ent) {
    const btn = document.getElementById('jr-ai'), out = document.getElementById('jr-ai-b');
    if (!btn || !out) return;
    const sample = window.claude && window.claude.use ? await window.claude.use('sample').catch(() => null) : null;
    const lines = promptOf(texts, ent);
    const { S } = SD;
    const key = `${S.from}_${S.to}_${hashOf(lines.join('\n'))}`;
    btn.hidden = !sample || !lines.length;
    if (!sample) { out.innerHTML = ''; return; }
    if (ai.key !== key && !ai.busy) {
      ai = { key, text: '', at: null, busy: false, err: '' };
      const db = await window.claude.use('db').catch(() => null);
      if (db) { try { const snap = await db.doc(`summaries/journal_${S.from}_${S.to}`).get(); if (snap.exists && snap.data().key === key) { ai.text = snap.data().text || ''; ai.at = snap.data().at || null; } } catch (e) { /* pas de résumé enregistré */ } }
    }
    const draw = () => {
      btn.innerHTML = `${SD.icon('sparkle')}${ai.busy ? 'Rédaction…' : ai.text ? 'Régénérer le résumé' : 'Résumer avec Claude'}`;
      btn.disabled = ai.busy;
      const items = String(ai.text || '').split(/\n+/).map((l) => l.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean)
        .map((l) => (window.SDParsers && SDParsers.cleanSensitive ? SDParsers.cleanSensitive(l) : l)).filter(Boolean);
      out.innerHTML = ai.busy && !ai.text ? '<div class="aibox"><p class="note">Claude lit ton journal de la période… (quelques secondes à une minute)</p></div>'
        : items.length ? `<div class="aibox"><div class="k">${SD.icon('sparkle')}Résumé de Claude${ai.at ? ` · ${esc(new Date(ai.at).toLocaleString('fr-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}` : ''}</div><ul>${items.map((l) => `<li>${esc(l).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</li>`).join('')}</ul><p class="note">Rédigé à partir de tes notes et mesures de la période ; relis-le comme un résumé, pas comme un avis médical.</p></div>`
          : ai.err ? `<p class="note warn">${esc(ai.err)}</p>` : '';
    };
    draw();
    btn.onclick = async () => {
      if (ai.busy) return;
      ai.busy = true; ai.err = ''; ai.text = ''; draw();
      const who = (SD.M.cfg.athlete || (SD.M.raw.profile && SD.M.raw.profile.firstName) || '').trim();
      const prompt = `Tu aides ${who || 'un sportif'} à relire son journal d'entraînement (musculation, suivi santé). Voici ses données jour par jour du ${SD.fdate(S.from, { day: 'numeric', month: 'long' })} au ${SD.fdate(S.to, { day: 'numeric', month: 'long', year: 'numeric' })} : mesures, ressenti (échelles de 1 à 5), douleurs (0 à 10), habitudes et notes libres.\n\n${lines.join('\n')}\n\nRésume la période en français, en 5 à 7 puces d'une ligne, dans cet ordre : tendances (énergie, ressenti des charges, sommeil) ; signaux à surveiller (douleurs, fatigue) avec leurs dates entre parenthèses ; ce qui va bien ; une action concrète pour les prochains jours. Appuie-toi uniquement sur ces données, sans inventer. Aucun conseil médical, aucune mention de médicament, de traitement ou de produit. Pas de titre, pas d'introduction : uniquement les puces, chacune commençant par « - ».`;
      try {
        const r = await sample(prompt, { onText: ({ text }) => { ai.text = text; draw(); }, cache: false });
        ai.text = r.text; ai.at = new Date().toISOString();
        const db = await window.claude.use('db').catch(() => null);
        if (db) db.doc(`summaries/journal_${S.from}_${S.to}`).set({ key, text: ai.text, at: ai.at }).catch(() => null);
      } catch (e) {
        ai.text = (e && e.text) || '';
        const msg = { not_granted: 'Résumé non autorisé pour cette page.', rate_limited: 'Trop de demandes : réessaie dans une minute.', prompt_too_large: 'Période trop longue pour un résumé : choisis 90 jours au plus.', refused: 'Claude n’a pas pu rédiger ce résumé.', cancelled: '' };
        ai.err = e && e.code in msg ? msg[e.code] : 'Résumé indisponible pour le moment.';
      } finally { ai.busy = false; draw(); }
    };
  }

  // ================================================================ feuille Google du journal
  let sheetCode = null;
  async function sheetScript() {
    if (sheetCode) return sheetCode;
    if (window.SD_SHEET_SCRIPT) return (sheetCode = window.SD_SHEET_SCRIPT);
    try { const r = await fetch('scripts/journal-sheet.gs'); if (r.ok) sheetCode = await r.text(); } catch (e) { /* hors du dépôt */ }
    return sheetCode;
  }
  function renderSheet() {
    const el = document.getElementById('jr-sheet');
    if (!el) return;
    const D = SD.drive, J = SD.journal;
    if (!D || D.state === 'hidden') { el.innerHTML = `<div class="sheetbar"><span class="pill"><span class="dot" style="background:var(--muted)"></span>Feuille Google</span><span class="note">La synchronisation avec la feuille du journal fonctionne quand le dashboard est ouvert dans claude.ai.</span></div>`; return; }
    const pend = J.pending();
    const t = (iso) => new Date(iso).toLocaleString('fr-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const read = D.sheet ? `<b>${esc(D.sheet.title)}</b>${D.sheetSyncedAt ? ` · relue le ${esc(t(D.sheetSyncedAt))}` : ''}` : D.inboxChecked ? 'aucune feuille « Journal » ou « Retours… » dans ton dossier de suivi' : 'recherche…';
    const write = !D.inboxChecked ? '' : D.inboxId ? (pend.length ? `${pend.length} entrée${pend.length > 1 ? 's' : ''} du dashboard en route vers la feuille (intégrée par son script dans la minute)` : 'copie automatique active : la feuille a toutes tes entrées') : `copie vers la feuille à activer${pend.length ? ` · ${pend.length} entrée${pend.length > 1 ? 's' : ''} du dashboard pas encore dans la feuille` : ''}`;
    // feuille lue avec des colonnes « Douleur <zone> » : le script installé est l'ancienne version
    const src = D.sheet ? (SD.M.raw.sources || []).filter((q) => q.kind === 'notes' && String(q.fileName || '').replace(/\.csv$/i, '') === D.sheet.title).pop() : null;
    const legacy = !!(D.inboxId && src && src.legacyPains);
    const steps = (D.inboxChecked && !D.inboxId) || legacy;
    el.innerHTML = `<div class="sheetbar"><span class="pill"><span class="dot" style="background:${steps ? 'var(--warn)' : D.sheet ? 'var(--good)' : 'var(--muted)'}"></span>Feuille Google</span>
      <span class="sb-txt">Lecture : ${read}${write ? `<br>Écriture : ${esc(write)}` : ''}</span>
      <button type="button" class="btn sm" id="jr-sync">${SD.icon('sync')}Synchroniser</button></div>
      ${D.sheet ? `<details class="sheetsetup"${steps ? ' open' : ''}><summary>${legacy ? 'Mettre à jour le script de la feuille : une seule colonne « Douleurs », intégration chaque minute (2 minutes)' : steps ? 'Activer la copie du dashboard vers la feuille (une fois, 2 minutes)' : 'Script de la feuille'}</summary>
        <ol><li>Ouvre la feuille ${D.sheet.url ? `<a href="${esc(D.sheet.url)}" target="_blank" rel="noopener">${esc(D.sheet.title)}</a>` : `« ${esc(D.sheet.title)} »`}, puis <b>Extensions → Apps Script</b>.</li>
          <li>Remplace tout le contenu de <b>Code.gs</b> par le script ci-dessous, puis <b>Enregistrer</b>.</li>
          <li>Choisis la fonction <b>setup</b> en haut, clique <b>Exécuter</b> et accepte les autorisations.</li></ol>
        <p class="note">Le script garde tes lignes et tes colonnes, crée le dossier « Journal - entrées » à côté de la feuille et y intègre les entrées du dashboard chaque minute. Les douleurs tiennent dans une seule colonne « Douleurs » (« Épaule droite 3, Cheville gauche 2 ») : une nouvelle zone s’écrit simplement, sans colonne à ajouter ; les anciennes colonnes « Douleur genou », « Douleur lombaires » y sont fusionnées, valeurs comprises. Une ligne ajoutée ou modifiée à la main dans la feuille apparaît ici à la synchro suivante.</p>
        <div class="codebox"><button type="button" class="btn sm" id="jr-copy">${SD.icon('copy')}Copier le script</button><textarea class="field" id="jr-code" readonly rows="6" aria-label="Script Apps Script de la feuille">Chargement…</textarea></div></details>` : ''}`;
    const sb = document.getElementById('jr-sync');
    if (sb) sb.onclick = () => D.sync(true);
    const ta = document.getElementById('jr-code');
    if (ta) sheetScript().then((c) => { ta.value = c || 'Script indisponible ici : il se trouve dans scripts/journal-sheet.gs du dépôt.'; });
    const cp = document.getElementById('jr-copy');
    if (cp) cp.onclick = async () => {
      const c = await sheetScript();
      let ok = false;
      try { await navigator.clipboard.writeText(c); ok = true; } catch (e) { ok = false; }
      if (!ok && ta) { ta.focus(); ta.select(); try { ok = document.execCommand('copy'); } catch (e) { ok = false; } }
      cp.innerHTML = `${SD.icon(ok ? 'check' : 'copy')}${ok ? 'Copié' : 'Sélectionné : Ctrl + C'}`;
    };
  }

  const journal = {
    id: 'journal', title: 'Journal', sub: 'Une note par jour, des #tags, ton ressenti si tu veux : le dashboard mesure ensuite l’effet de tes habitudes sur ta récupération.',
    html() {
      return `<section class="card c12" id="jr-sum-card"><div class="card-h"><div><h2>${hic('list', 'age')}Résumé de la période</h2><p class="sub" id="jr-sum-s"></p></div><div class="card-tools"><button type="button" class="btn" id="jr-ai" hidden></button></div></div><div id="jr-sum-b"></div><div id="jr-ai-b"></div></section>
        <div class="c12" id="jr-sheet"></div>
        <section class="card c5"><div class="card-h"><div><h2>${hic('journal', 'age')}Entrée du jour</h2><p class="sub" id="jr-sub"></p></div>
          <div class="card-tools"><button type="button" class="btn icon-btn" data-dayshift="-1" aria-label="Jour précédent">‹</button><input type="date" class="field" id="jr-pick" aria-label="Jour"><button type="button" class="btn icon-btn" data-dayshift="1" aria-label="Jour suivant">›</button></div></div><div id="jr-form"></div></section>
        <section class="card c7"><div class="card-h"><div><h2>${hic('list', 'age')}Fil du journal</h2><p class="sub" id="jr-list-s"></p></div></div><div class="entries" id="jr-list"></div><button type="button" class="link" id="jr-more" hidden>Afficher plus</button></section>
        ${card('c7', 'jr-imp', 'Impact des habitudes sur la récupération du lendemain', 'Écart de récupération le lendemain avec ou sans l’habitude, corrigé de ta récupération du jour même · ● = écart net (|t| ≥ 2,5, n ≥ 8) · une association, pas une preuve de cause', '', { icon: 'trend', tone: 'age', h: 'tall' })}
        ${card('c5', 'jr-mood', 'Ressenti', 'Échelles de 1 à 5 saisies dans le journal', '', { icon: 'sun', tone: 'age' })}
        ${card('c6', 'jr-pain', 'Douleurs', 'Échelle de 0 à 10 par zone', '', { icon: 'alert', tone: 'body' })}
        ${card('c6', 'jr-coach', 'Scores du coach vs note du jour', 'Rapports du journal coach (Préparation, Momentum, Global) et note du jour du dashboard', '', { icon: 'chat', tone: 'age' })}`;
    },
    update() {
      const { M, F, S, T } = SD;
      const J = SD.journal;
      if (!S.day || !M.at(S.day)) S.day = M.lastComplete;
      const pick = document.getElementById('jr-pick');
      if (pick) { pick.value = S.day; pick.min = M.first; pick.max = M.last; }
      setText('jr-sub', `${SD.fdate(S.day, { weekday: 'long', day: 'numeric', month: 'long' })} · ${J.mode === 'db' ? 'synchronisé entre tes appareils' : 'enregistré dans ce navigateur'}`);
      J.renderDay(document.getElementById('jr-form'), S.day);
      try { renderSummary(); } catch (e) { console.error(e); }
      try { renderSheet(); } catch (e) { console.error(e); }

      // ---- fil
      const jd = J.days();
      const days = F.days.slice().reverse().filter((x) => jd.has(x.d) || M.coach.has(x.d) || isNum(x.mood) || M.raw.notes.some((n) => n.d === x.d));
      setText('jr-list-s', `${days.length} jours avec au moins une entrée sur la période`);
      setHTML('jr-list', days.slice(0, shown).map((x) => {
        const e = J.combined(x.d);
        const lines = [];
        if (e) {
          const sc = J.SCALES.filter(([k]) => isNum(e[k])).map(([k, l]) => `${l} ${e[k]}/5`);
          const pn = Object.entries(e.pain || {}).filter(([, v]) => isNum(v) && v > 0).map(([k, v]) => `douleur ${k.toLowerCase()} ${v}/10`);
          const tg = (e.tags || []).map((id) => J.labels()[id] || id);
          const head = [...sc, ...pn].join(' · ');
          lines.push(`<p><span class="src">${e.src.includes('journal') ? 'Journal' : 'Feuille'}</span>${tg.length ? `<b>${esc(tg.map((t) => '#' + t).join(' '))}</b>${head || e.texts.length ? ' · ' : ''}` : ''}${esc(head)}${e.texts.length ? `${head ? ' — ' : ''}${esc(e.texts.join(' · '))}` : ''}</p>`);
        }
        const sheetTxt = (J.sheet().get(x.d) || {}).text || '';
        for (const n of M.raw.notes.filter((n) => n.d === x.d && !(n.src === 'journal' && sheetTxt.includes(n.text)))) lines.push(`<p><span class="src">${esc(n.src === 'journal' ? 'Retours' : n.src === 'séance' ? 'Séance' : 'Nutrition')}</span>${n.ex ? `<b>${esc(n.ex)}</b> · ` : ''}${esc(n.text)}</p>`);
        const co = M.coach.get(x.d);
        if (co) lines.push(`<p><span class="src">Coach</span>${co.scores && isNum(co.scores.global) ? `<b>Global ${nf(co.scores.global, 0)}</b> · ` : ''}${esc(co.verdict || '')}</p>`);
        if (isNum(x.mood)) lines.push(`<p><span class="src">Apple</span>Humeur ${esc(J.moodLabel(x.mood))}</p>`);
        return `<div class="entry" data-day="${x.d}" style="cursor:pointer"><div class="mini"><b>${isNum(x.rec) ? nf(x.rec, 0) : '—'}</b><span><i class="dotc" style="background:${SD.recColor(x.rec)}"></i>récup</span><b>${isNum(x.strain) ? nf(x.strain, 0) : '—'}</b><span><i class="dotc" style="background:${T.strain}"></i>charge</span></div>
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
      const ent = [...J.days()].filter((d) => d >= S.from && d <= S.to).sort().map((d) => J.combined(d));
      const colors = [T.s[0], T.s[1], T.s[2], T.s[3]];
      const moodSeries = J.SCALES.map(([k, l], i) => line(l, ent.filter((e) => isNum(e[k])).map((e) => [tms(e.d), e[k]]), colors[i], { showSymbol: true, symbolSize: 6 })).filter((s) => s.data.length);
      chart('jr-mood', moodSeries.length ? base({
        grid: { left: 8, right: 14, top: 30, bottom: 8, containLabel: true },
        legend: SD.ui.ecLegend(T, moodSeries.map((s) => s.name)),
        tooltip: Object.assign(base().tooltip, { formatter: axisTip(Object.fromEntries(moodSeries.map((s) => [s.name, (v) => v + ' / 5']))) }),
        xAxis: SD.xTime(), yAxis: yVal({ min: 1, max: 5, interval: 1 }),
        series: moodSeries,
      }) : base(SD.emptyOpt('Pas encore d’entrée de ressenti sur la période')), () => ({ cols: ['Date', ...J.SCALES.map((s) => s[1])], rows: ent.map((e) => [fdM(e.d), ...J.SCALES.map(([k]) => (isNum(e[k]) ? e[k] : '—'))]) }));

      // zones notées sur la période ; couleur fixe par zone (ordre de première apparition), 8 zones au plus
      const order = J.zoneOrder();
      const seen = new Set();
      for (const e of ent) for (const [k, v] of Object.entries((e && e.pain) || {})) if (isNum(v)) seen.add(k);
      const sites = order.filter((z) => seen.has(z)).slice(0, 8);
      const painSeries = sites.map((p) => line(p, ent.filter((e) => e.pain && isNum(e.pain[p])).map((e) => [tms(e.d), e.pain[p]]), T.s[order.indexOf(p) % 8], { showSymbol: true, symbolSize: 6 })).filter((s) => s.data.length);
      chart('jr-pain', painSeries.length ? base({
        grid: { left: 8, right: 14, top: 30, bottom: 8, containLabel: true },
        legend: SD.ui.ecLegend(T, painSeries.map((s) => s.name)),
        tooltip: Object.assign(base().tooltip, { formatter: axisTip(Object.fromEntries(painSeries.map((s) => [s.name, (v) => v + ' / 10']))) }),
        xAxis: SD.xTime(), yAxis: yVal({ min: 0, max: 10, interval: 2 }),
        series: painSeries,
      }) : base(SD.emptyOpt('Pas encore de douleur notée sur la période')), () => ({ cols: ['Date', ...sites], rows: ent.map((e) => [fdM(e.d), ...sites.map((p) => (e.pain && isNum(e.pain[p]) ? e.pain[p] : '—'))]) }));

      // ---- coach vs note du jour
      const co = (M.raw.coach || []).filter((c) => c.d >= S.from && c.d <= S.to && c.scores);
      const cs = [['preparation', 'Préparation', T.s[0]], ['momentum', 'Momentum', T.s[1]], ['global', 'Global coach', T.s[2]]].map(([k, l, c]) => line(l, co.filter((q) => isNum(q.scores[k])).map((q) => [tms(q.d), q.scores[k]]), c, { showSymbol: true, symbolSize: 7 })).filter((s) => s.data.length);
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

  journal.renderSheet = renderSheet;
  SD.PAGES.journal = journal;
})();
