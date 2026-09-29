/* Salle des Machines — préférences partagées entre tes appareils.
 * Base de l'Artifact (capability `db`, document settings/prefs) quand le dashboard tourne dans claude.ai ;
 * sinon ce navigateur. Contenu : objectif en cours saisi à la main, exercices clés épinglés, agendas pris en compte. */
(function () {
  'use strict';
  const SD = window.SD;
  const LOCAL_KEY = 'sdm-prefs-v1';
  const DOC = 'settings/prefs';

  const P = {
    data: {}, db: null, mode: 'local',
    get(k, def) { return Object.prototype.hasOwnProperty.call(this.data, k) && this.data[k] != null ? this.data[k] : def; },
    async set(k, v) {
      this.data = Object.assign({}, this.data, { [k]: v });
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(this.data)); } catch (e) { /* stockage indisponible */ }
      if (this.db) {
        try { await this.db.doc(DOC).set(this.data); return { ok: true, where: 'synchronisé' }; }
        catch (e) { this.mode = 'local'; return { ok: true, where: 'sur cet appareil' }; }
      }
      return { ok: true, where: 'sur cet appareil' };
    },
    async init() {
      try { this.data = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') || {}; } catch (e) { this.data = {}; }
      const db = window.claude && window.claude.use ? await window.claude.use('db').catch(() => null) : null;
      if (!db) return;
      this.db = db;
      this.mode = 'db';
      try {
        db.doc(DOC).onSnapshot((snap) => {
          const before = JSON.stringify(this.data);
          if (snap.exists) this.data = Object.assign({}, snap.data());
          else if (Object.keys(this.data).length) db.doc(DOC).set(this.data).catch(() => null); // préférences locales d'avant : on les partage
          try { localStorage.setItem(LOCAL_KEY, JSON.stringify(this.data)); } catch (e) { /* ignoré */ }
          if (JSON.stringify(this.data) !== before && SD.onPrefs) SD.onPrefs();
        }, () => { this.mode = 'local'; });
      } catch (e) { this.mode = 'local'; }
    },
  };

  SD.prefs = P;
})();
