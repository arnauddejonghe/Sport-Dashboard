/* Salle des Machines — journal quotidien.
 * Stockage : base de l'Artifact (capability `db`, partagée entre tes appareils et lisible par Claude) ;
 * à défaut (fichier ouvert en local), stockage du navigateur. */
(function () {
  'use strict';
  const SD = window.SD;
  const { esc, nf, isNum, fdL } = SD;

  const DEFAULT_TAGS = [
    ['soiree', 'Soirée tardive / DJ'], ['alcool', 'Alcool'], ['cafeine_tard', 'Caféine après 14 h'], ['repas_tard', 'Repas tardif'],
    ['stress', 'Stress élevé'], ['nuit_hachee', 'Nuit interrompue'], ['malade', 'Malade'], ['douleur', 'Douleur articulaire'],
    ['mobilite', 'Étirements / mobilité'], ['sieste', 'Sieste'], ['ecrans', 'Écrans au lit'], ['voyage', 'Voyage / déplacement'],
  ];
  const SCALES = [['mood', 'Humeur', 1, 5], ['energy', 'Énergie', 1, 5], ['stress', 'Stress', 1, 5], ['soreness', 'Courbatures', 1, 5]];
  const LOCAL_KEY = 'sdm-journal-v1';

  const J = {
    mode: 'none', entries: new Map(), db: null, status: '', unsub: null,
    tags() {
      const extra = (SD.M && SD.M.cfg.journalTags) || [];
      const seen = new Set();
      return DEFAULT_TAGS.concat(extra.map((t) => (Array.isArray(t) ? t : [String(t).toLowerCase().replace(/[^a-z0-9]+/g, '_'), String(t)])))
        .filter(([id]) => (seen.has(id) ? false : seen.add(id)));
    },
    painSites() { return (SD.M && SD.M.cfg.painSites) || ['Genou', 'Lombaires']; },
    labels() { return Object.fromEntries(this.tags()); },
    manualTags() { const m = new Map(); for (const [d, e] of this.entries) if (Array.isArray(e.tags) && e.tags.length) m.set(d, e.tags); return m; },

    async init() {
      // stockage local d'abord (disponible tout de suite), puis la base partagée si la page tourne dans claude.ai
      try { const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); for (const [d, e] of Object.entries(raw)) this.entries.set(d, e); this.mode = 'local'; } catch (e) { /* ignoré */ }
      const db = window.claude && window.claude.use ? await window.claude.use('db').catch(() => null) : null;
      if (!db) return;
      this.db = db;
      this.mode = 'db';
      try {
        this.unsub = db.collection('journal').onSnapshot((snap) => {
          const next = new Map();
          for (const doc of snap.docs) if (doc.exists) next.set(doc.id, doc.data());
          // entrées locales jamais synchronisées : on les garde et on les pousse une fois
          for (const [d, e] of this.entries) if (!next.has(d) && e && e._local) { next.set(d, e); this.push(d, e); }
          this.entries = next;
          SD.onJournal && SD.onJournal();
        }, (err) => { this.status = `Journal partagé indisponible (${err.code}) : enregistrement sur cet appareil.`; this.mode = 'local'; SD.onJournal && SD.onJournal(); });
      } catch (e) { this.mode = 'local'; }
    },
    async push(d, body) {
      const clean = Object.assign({}, body); delete clean._local;
      await this.db.doc('journal/' + d).set(clean);
    },
    async save(d, body) {
      body = Object.assign({ d, updatedAt: new Date().toISOString() }, body);
      if (this.mode === 'db' && this.db) {
        try { await this.push(d, body); this.entries.set(d, body); return { ok: true, where: 'partagé' }; }
        catch (e) { this.status = `Enregistrement partagé refusé (${e.code || 'erreur'})`; }
      }
      body._local = true;
      this.entries.set(d, body);
      try { const all = Object.fromEntries(this.entries); localStorage.setItem(LOCAL_KEY, JSON.stringify(all)); return { ok: true, where: 'cet appareil' }; }
      catch (e) { return { ok: false, where: '' }; }
    },

    /** Formulaire + notes existantes d'un jour */
    renderDay(el, d) {
      if (!el) return;
      const M = SD.M, x = M.at(d), e = this.entries.get(d) || {};
      const tags = new Set(e.tags || []);
      const pain = e.pain || {};
      const others = [];
      for (const n of M.raw.notes.filter((n) => n.d === d)) others.push(`<p><span class="src">${esc(n.src === 'journal' ? 'Retours' : n.src === 'séance' ? 'Séance' : 'Nutrition')}</span>${n.ex ? `<b>${esc(n.ex)}</b> · ` : ''}${esc(n.text)}</p>`);
      const co = M.coach.get(d);
      if (co) others.push(`<p><span class="src">Coach</span>${co.scores && isNum(co.scores.global) ? `<b>Préparation ${nf(co.scores.preparation, 0)} · Momentum ${nf(co.scores.momentum, 0)} · Global ${nf(co.scores.global, 0)}</b> — ` : ''}${esc(co.verdict || '')}</p>`);
      if (x && isNum(x.mood)) others.push(`<p><span class="src">Apple</span>Humeur enregistrée : ${esc(moodLabel(x.mood))}</p>`);
      el.innerHTML = `<form class="jform" data-day="${d}" onsubmit="return false">
        ${SCALES.map(([k, lab, a, b]) => `<label class="jrow"><span>${lab}</span><input type="range" min="${a}" max="${b}" step="1" name="${k}" value="${isNum(e[k]) ? e[k] : Math.round((a + b) / 2)}"><output>${isNum(e[k]) ? e[k] : '—'}</output></label>`).join('')}
        ${this.painSites().map((p) => `<label class="jrow"><span>Douleur ${esc(p.toLowerCase())}</span><input type="range" min="0" max="10" step="1" name="pain:${esc(p)}" value="${isNum(pain[p]) ? pain[p] : 0}"><output>${isNum(pain[p]) ? pain[p] : '—'}</output></label>`).join('')}
        <div class="chips">${this.tags().map(([id, lab]) => `<button type="button" class="tagchip" data-tag="${esc(id)}" aria-pressed="${tags.has(id)}">${esc(lab)}</button>`).join('')}</div>
        <textarea class="field" name="text" placeholder="Ressenti, contexte, douleurs, sommeil…">${esc(e.text || '')}</textarea>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><button type="button" class="btn primary" data-jsave>Enregistrer</button>
          <span class="fsummary" data-jstatus>${e.updatedAt ? `Enregistré le ${esc(new Date(e.updatedAt).toLocaleString('fr-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}` : this.mode === 'db' ? 'Synchronisé entre tes appareils' : 'Enregistré dans ce navigateur'}</span></div>
      </form>
      ${others.length ? `<div class="jnotes" style="margin-top:14px;display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--ink-2)">${others.join('')}</div>` : ''}
      ${this.status ? `<p class="note">${esc(this.status)}</p>` : ''}`;
      const form = el.querySelector('form');
      const touched = new Set(Object.keys(e));
      form.addEventListener('input', (ev) => {
        const t = ev.target;
        if (t.type === 'range') { t.nextElementSibling.textContent = t.value; touched.add(t.name); }
      });
      form.addEventListener('click', async (ev) => {
        const tb = ev.target.closest('[data-tag]');
        if (tb) { tb.setAttribute('aria-pressed', String(tb.getAttribute('aria-pressed') !== 'true')); return; }
        if (!ev.target.closest('[data-jsave]')) return;
        const body = { tags: [...form.querySelectorAll('[data-tag][aria-pressed="true"]')].map((b) => b.dataset.tag), text: form.text.value.trim(), pain: {} };
        for (const [k] of SCALES) if (touched.has(k)) body[k] = +form[k].value;
        for (const p of this.painSites()) { const inp = form.querySelector(`[name="pain:${CSS.escape(p)}"]`); if (inp && (touched.has(inp.name) || isNum(pain[p]))) body.pain[p] = +inp.value; }
        const st = form.querySelector('[data-jstatus]');
        st.textContent = 'Enregistrement…';
        const r = await this.save(d, body);
        st.textContent = r.ok ? `Enregistré (${r.where})` : 'Échec de l’enregistrement';
      });
    },
  };

  function moodLabel(v) {
    return v <= -2.5 ? 'très désagréable' : v <= -1.5 ? 'désagréable' : v <= -0.5 ? 'plutôt désagréable' : v < 0.5 ? 'neutre' : v < 1.5 ? 'plutôt agréable' : v < 2.5 ? 'agréable' : 'très agréable';
  }

  J.moodLabel = moodLabel;
  J.SCALES = SCALES;
  SD.journal = J;
})();
