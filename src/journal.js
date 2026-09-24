/* Salle des Machines — journal quotidien.
 * Une note libre par jour, des tags (#hashtags dans le texte ou puces), un ressenti facultatif.
 * Stockage : base de l'Artifact (capability `db`, partagée entre tes appareils) ; à défaut, navigateur.
 * S'y ajoute la feuille « Journal » du Drive (raccourci Apple, formulaire), lue en lecture seule. */
(function () {
  'use strict';
  const SD = window.SD;
  const { esc, isNum } = SD;

  const DEFAULT_TAGS = [
    ['soiree', 'Soirée tardive / DJ'], ['alcool', 'Alcool'], ['cafeine_tard', 'Caféine après 14 h'], ['repas_tard', 'Repas tardif'],
    ['stress', 'Stress élevé'], ['nuit_hachee', 'Nuit interrompue'], ['malade', 'Malade'], ['douleur', 'Douleur'],
    ['mobilite', 'Mobilité'], ['sieste', 'Sieste'], ['ecrans', 'Écrans au lit'], ['voyage', 'Voyage'],
  ];
  const SCALES = [['mood', 'Humeur'], ['energy', 'Énergie'], ['stress', 'Stress'], ['soreness', 'Courbatures']];
  const LOCAL_KEY = 'sdm-journal-v1', META_KEY = 'sdm-journal-meta-v1';
  const slug = (t) => (window.SDParsers && SDParsers.slugTag ? SDParsers.slugTag(t) : String(t).toLowerCase().replace(/[^a-z0-9]+/g, '_'));
  const hashtags = (t) => (window.SDParsers && SDParsers.tagsFrom ? SDParsers.tagsFrom(t, true) : []);

  const J = {
    mode: 'none', entries: new Map(), drafts: new Map(), meta: { custom: [], hidden: [] }, db: null, status: '', editTags: false,

    /** Entrées de la feuille « Journal » importée du Drive */
    sheet() { return new Map(((SD.M && SD.M.raw.jsheet) || []).map((e) => [e.d, e])); },
    /** Tous les tags connus (défaut, config, créés, vus dans les notes) : [id, libellé] */
    allTags() {
      const out = new Map(DEFAULT_TAGS);
      for (const t of (SD.M && SD.M.cfg.journalTags) || []) { const [id, l] = Array.isArray(t) ? t : [slug(t), String(t)]; if (!out.has(id)) out.set(id, l); }
      for (const [id, l] of this.meta.custom || []) if (!out.has(id)) out.set(id, l);
      for (const e of this.sheet().values()) for (const id of e.tags || []) if (!out.has(id)) out.set(id, (e.tagLabels || {})[id] || id);
      for (const e of this.entries.values()) for (const id of e.tags || []) if (!out.has(id)) out.set(id, (e.tagLabels || {})[id] || id);
      return [...out.entries()];
    },
    tags() { const hid = new Set(this.meta.hidden || []); return this.allTags().filter(([id]) => !hid.has(id)); },
    labels() { return Object.fromEntries(this.allTags()); },
    painSites() { return (SD.M && SD.M.cfg.painSites) || ['Genou', 'Lombaires']; },

    /** Vue combinée d'un jour : saisie de la page + feuille du Drive */
    combined(d) {
      const a = this.entries.get(d), b = this.sheet().get(d);
      if (!a && !b) return null;
      const o = { d, texts: [], tags: [], pain: {}, src: [] };
      for (const e of [b, a]) {
        if (!e) continue;
        o.src.push(e === a ? 'journal' : 'feuille');
        if (e.text) o.texts.push(e.text);
        for (const t of e.tags || []) if (!o.tags.includes(t)) o.tags.push(t);
        for (const [k] of SCALES) if (isNum(e[k])) o[k] = e[k];
        Object.assign(o.pain, e.pain || {});
      }
      return o;
    },
    days() { return new Set([...this.entries.keys(), ...this.sheet().keys()]); },
    manualTags() { const m = new Map(); for (const d of this.days()) { const c = this.combined(d); if (c && c.tags.length) m.set(d, c.tags); } return m; },

    async init() {
      // stockage local d'abord (disponible tout de suite), puis la base partagée si la page tourne dans claude.ai
      try { const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); for (const [d, e] of Object.entries(raw)) this.entries.set(d, e); this.mode = 'local'; } catch (e) { /* ignoré */ }
      try { const m = JSON.parse(localStorage.getItem(META_KEY) || 'null'); if (m) this.meta = m; } catch (e) { /* ignoré */ }
      const db = window.claude && window.claude.use ? await window.claude.use('db').catch(() => null) : null;
      if (!db) return;
      this.db = db;
      this.mode = 'db';
      try {
        db.collection('journal').onSnapshot((snap) => {
          const next = new Map();
          for (const doc of snap.docs) if (doc.exists) next.set(doc.id, doc.data());
          // entrées locales jamais synchronisées : on les garde et on les pousse une fois
          for (const [d, e] of this.entries) if (!next.has(d) && e && e._local) { next.set(d, e); this.push(d, e); }
          this.entries = next;
          SD.onJournal && SD.onJournal();
        }, (err) => { this.status = `Journal partagé indisponible (${err.code}) : enregistrement sur cet appareil.`; this.mode = 'local'; SD.onJournal && SD.onJournal(); });
        db.doc('settings/journal').onSnapshot((snap) => {
          if (snap.exists) { const m = snap.data(); this.meta = { custom: (m.custom || []).slice(), hidden: (m.hidden || []).slice() }; SD.onJournal && SD.onJournal(); }
        }, () => null);
      } catch (e) { this.mode = 'local'; }
    },
    async push(d, body) {
      const clean = Object.assign({}, body); delete clean._local;
      await this.db.doc('journal/' + d).set(clean);
    },
    async saveMeta() {
      try { localStorage.setItem(META_KEY, JSON.stringify(this.meta)); } catch (e) { /* ignoré */ }
      if (this.mode === 'db' && this.db) { try { await this.db.doc('settings/journal').set({ custom: this.meta.custom, hidden: this.meta.hidden }); } catch (e) { /* ignoré */ } }
    },
    addTag(label) {
      label = String(label || '').trim().replace(/^#/, '');
      const id = slug(label);
      if (!id) return null;
      if (!this.allTags().some(([k]) => k === id)) this.meta.custom = (this.meta.custom || []).concat([[id, label]]);
      this.meta.hidden = (this.meta.hidden || []).filter((h) => h !== id);
      this.saveMeta();
      return id;
    },
    hideTag(id) { if (!(this.meta.hidden || []).includes(id)) this.meta.hidden = (this.meta.hidden || []).concat(id); this.saveMeta(); },
    showTag(id) { this.meta.hidden = (this.meta.hidden || []).filter((h) => h !== id); this.saveMeta(); },

    async save(d, body) {
      // les #hashtags du texte deviennent des tags
      const labels = {};
      for (const t of hashtags(body.text || '')) { const id = this.addTag(t.label) || t.id; if (!body.tags.includes(id)) body.tags.push(id); labels[id] = t.label; }
      body = Object.assign({ d, updatedAt: new Date().toISOString() }, body, Object.keys(labels).length ? { tagLabels: labels } : {});
      if (this.mode === 'db' && this.db) {
        try { await this.push(d, body); this.entries.set(d, body); return { ok: true, where: 'synchronisé' }; }
        catch (e) { this.status = `Enregistrement partagé refusé (${e.code || 'erreur'})`; }
      }
      body._local = true;
      this.entries.set(d, body);
      try { const all = Object.fromEntries(this.entries); localStorage.setItem(LOCAL_KEY, JSON.stringify(all)); return { ok: true, where: 'sur cet appareil' }; }
      catch (e) { return { ok: false, where: '' }; }
    },

    /** Formulaire du jour : note libre, tags, ressenti facultatif ; puis les autres sources du jour */
    renderDay(el, d) {
      if (!el) return;
      const M = SD.M, x = M.at(d), e = this.drafts.get(d) || this.entries.get(d) || {}, sh = this.sheet().get(d);
      const tags = new Set(e.tags || []);
      const pain = e.pain || {};
      const others = [];
      if (sh) others.push(`<p><span class="src">Feuille</span>${sh.tags && sh.tags.length ? `<b>${esc(sh.tags.map((t) => this.labels()[t] || t).join(', '))}</b>${sh.text ? ' · ' : ''}` : ''}${esc(sh.text || '')}</p>`);
      for (const n of M.raw.notes.filter((n) => n.d === d && !(sh && n.src === 'journal' && sh.text.includes(n.text)))) others.push(`<p><span class="src">${esc(n.src === 'journal' ? 'Retours' : n.src === 'séance' ? 'Séance' : 'Nutrition')}</span>${n.ex ? `<b>${esc(n.ex)}</b> · ` : ''}${esc(n.text)}</p>`);
      const co = M.coach.get(d);
      if (co) others.push(`<p><span class="src">Coach</span>${co.scores && isNum(co.scores.global) ? `<b>Global ${Math.round(co.scores.global)}</b> · ` : ''}${esc(co.verdict || '')}</p>`);
      if (x && isNum(x.mood)) others.push(`<p><span class="src">Apple</span>Humeur enregistrée : ${esc(moodLabel(x.mood))}</p>`);
      const hasFeel = SCALES.some(([k]) => isNum(e[k])) || Object.values(pain).some((v) => isNum(v) && v > 0);
      const visible = this.tags();
      const hidden = this.allTags().filter(([id]) => (this.meta.hidden || []).includes(id));
      el.innerHTML = `<form class="jform" data-day="${d}" onsubmit="return false">
        <textarea class="field jtext" name="text" rows="3" placeholder="Comment ça s’est passé ? Sommeil, énergie, séance, douleurs… Tape des #tags directement : #dj #alcool">${esc(e.text || '')}</textarea>
        <div class="chips jtags">${visible.map(([id, lab]) => `<button type="button" class="tagchip" data-tag="${esc(id)}" aria-pressed="${tags.has(id)}">${esc(lab)}${this.editTags ? `<i data-hide="${esc(id)}" title="Masquer ce tag">×</i>` : ''}</button>`).join('')}
          <input type="text" class="tag-add" maxlength="30" placeholder="+ nouveau tag" aria-label="Nouveau tag">
          <button type="button" class="link" data-tagedit>${this.editTags ? 'Terminé' : 'Gérer les tags'}</button></div>
        ${this.editTags && hidden.length ? `<p class="note">Masqués : ${hidden.map(([id, lab]) => `<button type="button" class="link" data-unhide="${esc(id)}">${esc(lab)}</button>`).join(' · ')}</p>` : ''}
        <details class="jmore"${hasFeel ? ' open' : ''}><summary>Ressenti (facultatif)</summary>
          ${SCALES.map(([k, lab]) => `<div class="jrow2"><span>${lab}</span><div class="seg sm" data-scale="${k}">${[1, 2, 3, 4, 5].map((v) => `<button type="button" data-v="${v}" aria-pressed="${e[k] === v}">${v}</button>`).join('')}</div></div>`).join('')}
          ${this.painSites().map((p) => `<div class="jrow2"><span>Douleur ${esc(p.toLowerCase())}</span><select class="fselect" name="pain:${esc(p)}"><option value="">—</option>${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => `<option value="${v}"${pain[p] === v ? ' selected' : ''}>${v} / 10</option>`).join('')}</select></div>`).join('')}
        </details>
        <div class="jactions"><button type="button" class="btn primary" data-jsave>Enregistrer</button>
          <span class="fsummary" data-jstatus>${e.updatedAt ? `Enregistré le ${esc(new Date(e.updatedAt).toLocaleString('fr-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}` : this.mode === 'db' ? 'Synchronisé entre tes appareils' : 'Enregistré dans ce navigateur'} · Ctrl + Entrée pour enregistrer</span></div>
      </form>
      ${others.length ? `<div class="jnotes">${others.join('')}</div>` : ''}
      ${this.status ? `<p class="note">${esc(this.status)}</p>` : ''}`;

      const form = el.querySelector('form');
      const rerender = () => this.renderDay(el, d);
      const collect = () => {
        const body = { tags: [...form.querySelectorAll('[data-tag][aria-pressed="true"]')].map((b) => b.dataset.tag), text: form.text.value.trim(), pain: {} };
        for (const [k] of SCALES) { const on = form.querySelector(`[data-scale="${k}"] [aria-pressed="true"]`); if (on) body[k] = +on.dataset.v; }
        for (const p of this.painSites()) { const s = form.querySelector(`[name="pain:${CSS.escape(p)}"]`); if (s && s.value !== '') body.pain[p] = +s.value; }
        return body;
      };
      const doSave = async () => {
        const st = form.querySelector('[data-jstatus]');
        st.textContent = 'Enregistrement…';
        const r = await this.save(d, collect());
        this.drafts.delete(d);
        st.textContent = r.ok ? `Enregistré ${r.where} ✓` : 'Échec de l’enregistrement';
        SD.onJournal && SD.onJournal();
      };
      form.addEventListener('click', (ev) => {
        const hide = ev.target.closest('[data-hide]');
        if (hide) { ev.stopPropagation(); this.hideTag(hide.dataset.hide); rerender(); return; }
        const un = ev.target.closest('[data-unhide]');
        if (un) { this.showTag(un.dataset.unhide); rerender(); return; }
        if (ev.target.closest('[data-tagedit]')) { this.editTags = !this.editTags; rerender(); return; }
        const tb = ev.target.closest('[data-tag]');
        if (tb) { tb.setAttribute('aria-pressed', String(tb.getAttribute('aria-pressed') !== 'true')); return; }
        const sc = ev.target.closest('[data-scale] button');
        if (sc) { const on = sc.getAttribute('aria-pressed') === 'true'; sc.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false')); sc.setAttribute('aria-pressed', String(!on)); return; }
        if (ev.target.closest('[data-jsave]')) doSave();
      });
      const add = form.querySelector('.tag-add');
      add.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' || !add.value.trim()) return;
        ev.preventDefault();
        const id = this.addTag(add.value);
        const pressed = new Set([...form.querySelectorAll('[data-tag][aria-pressed="true"]')].map((b) => b.dataset.tag).concat(id ? [id] : []));
        const draft = collect(); draft.tags = [...pressed];
        this.drafts.set(d, Object.assign({}, this.entries.get(d) || {}, draft));
        rerender();
      });
      form.text.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); doSave(); } });
    },
  };

  function moodLabel(v) {
    return v <= -2.5 ? 'très désagréable' : v <= -1.5 ? 'désagréable' : v <= -0.5 ? 'plutôt désagréable' : v < 0.5 ? 'neutre' : v < 1.5 ? 'plutôt agréable' : v < 2.5 ? 'agréable' : 'très agréable';
  }

  J.moodLabel = moodLabel;
  J.SCALES = SCALES;
  SD.journal = J;
})();
