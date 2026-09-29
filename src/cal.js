/* Salle des Machines — agendas Google (capability `mcp`, connecteur « Google Calendar », lecture seule).
 * Lit tous tes agendas (sauf jours fériés et anniversaires, et ceux que tu désactives) pour aujourd'hui et les 7 jours
 * suivants : séances déjà placées (« Sport - Push », « Salle », « Upper »…), rendez-vous qui les chevauchent, créneaux libres.
 * Les titres passent par le même filtre de confidentialité que les rapports du coach. */
(function () {
  'use strict';
  const SD = window.SD;
  const SERVER = 'Google Calendar';
  // agendas techniques jamais pris en compte (jours fériés, anniversaires, numéros de semaine)
  const SKIP = /#(holiday|contacts|weeknum|weather)@/i;
  // une séance d'entraînement dans l'agenda : mot-clé sportif, ou nom d'une journée de programme (Upper, Push…)
  const TRAIN = /\b(sport|salle|gym|muscu\w*|musculation|entra[iî]nement|training|workout|s[ée]ance)\b/i;
  const DAYWORDS = /\b(upper|lower|push|pull|legs?|full ?body|haut du corps|bas du corps|jambes)\b/i;
  const LONG_MS = 5 * 3600000;

  const tzOffset = (dt) => { const m = -dt.getTimezoneOffset(); const s = m >= 0 ? '+' : '-'; const a = Math.abs(m); return `${s}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`; };
  const isoLocal = (d) => { const dt = new Date(d + 'T00:00:00'); return `${d}T00:00:00${tzOffset(dt)}`; };

  function norm(e, cal) {
    const P = window.SDParsers;
    const allDay = !!(e.start && e.start.date && !e.start.dateTime);
    // journée entière : la date est un jour calendaire (le « Z » de certains agendas importés ne doit pas la décaler)
    const day0 = (v) => new Date(String(v).slice(0, 10) + 'T00:00:00');
    const start = allDay ? day0(e.start.date) : new Date(e.start && e.start.dateTime);
    const end = allDay ? day0(e.end && e.end.date ? e.end.date : e.start.date) : new Date(e.end && e.end.dateTime ? e.end.dateTime : start.getTime() + 3600000);
    const raw = String(e.summary || '').trim();
    const clean = P && P.cleanSensitive ? P.cleanSensitive(raw) : raw;
    const training = !allDay && (TRAIN.test(raw) || (DAYWORDS.test(raw) && raw.length <= 40));
    // longue plage (≥ 5 h : journée de travail, garde, crèche…) : affichée, mais ne compte ni comme conflit ni pour les créneaux
    const long = !allDay && !training && end - start >= LONG_MS;
    return { title: clean || (raw ? 'Événement privé' : 'Occupé'), allDay, start, end, busy: e.transparency !== 'transparent', training, long, cal: cal || '', d: start.toLocaleDateString('sv-SE') };
  }

  const C = {
    mcp: null, state: 'hidden', events: null, calendars: null, error: '', from: null, partial: [],

    async init() {
      const use = window.claude && window.claude.use;
      if (!use) return;
      const mcp = await window.claude.use('mcp').catch(() => null);
      if (!mcp) return;
      this.mcp = mcp;
      const perms = await window.claude.use('permissions').catch(() => null);
      const st = perms ? await perms.state('mcp:' + SERVER).catch(() => 'unavailable') : 'prompt';
      if (st === 'granted') { this.load(); return; }
      this.set(st === 'denied' ? 'denied' : 'consent');
    },
    set(state, error) {
      this.state = state; this.error = error || '';
      if (SD.S && SD.S.page === 'today' && SD.PAGES.today && SD.PAGES.today.renderPlan) SD.PAGES.today.renderPlan();
    },
    /** Agendas désactivés par l'utilisateur (préférence partagée) */
    off() { return new Set(((SD.prefs && SD.prefs.get('calendars', null)) || {}).off || []); },
    onPrefs() { if (this.state === 'ok' && this.calendars) this.load(); },
    async toggle(id, on) {
      const off = this.off();
      if (on) off.delete(id); else off.add(id);
      await SD.prefs.set('calendars', { off: [...off] });
      this.load();
    },
    explain(e) {
      const code = e && e.code;
      if (code === 'server_not_connected') return 'Ajoute le connecteur Google Calendar dans claude.ai → Paramètres → Connecteurs.';
      if (code === 'needs_reauth') return 'Reconnecte Google Calendar dans claude.ai → Paramètres → Connecteurs.';
      if (code === 'selection_required') return 'Plusieurs connecteurs Google Calendar : choisis celui à utiliser dans la fenêtre de claude.ai.';
      if (code === 'blocked_by_policy' || code === 'approval_required') return 'La politique de ton organisation bloque l’accès à l’agenda.';
      if (code === 'server_unavailable') return 'Google Calendar ne répond pas pour le moment. Réessaie dans quelques minutes.';
      return (e && e.message) || 'Agenda indisponible.';
    },
    async load() {
      if (!this.mcp) return;
      const from = new Date().toLocaleDateString('sv-SE');
      this.set('busy');
      const hard = (e) => ['not_granted', 'needs_reauth', 'server_not_connected', 'selection_required', 'not_in_manifest', 'blocked_by_policy', 'approval_required', 'capability_disabled'].includes(e && e.code);
      try {
        const input = { startTime: isoLocal(from), endTime: isoLocal(SD.addD(from, 8)), orderBy: 'startTime', pageSize: 250, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Brussels' };
        // agenda principal (toujours), puis les autres agendas de la liste
        const r0 = await this.mcp.callTool(SERVER, 'list_events', input, { cache: false });
        const p0 = (r0 && r0.payload) || {};
        const mainName = p0.summary || 'Principal';
        let events = (p0.events || []).filter((e) => e && e.status !== 'cancelled' && e.start).map((e) => norm(e, mainName));
        let cals = null;
        try {
          const rc = await this.mcp.callTool(SERVER, 'list_calendars', {}, { cache: false });
          cals = ((rc && rc.payload && rc.payload.calendars) || []).filter((c) => c && c.id && !SKIP.test(c.id));
        } catch (e) { if (hard(e) && e.code !== 'not_in_manifest') throw e; cals = null; }
        const off = this.off();
        this.partial = [];
        if (cals) {
          const others = cals.filter((c) => c.summary !== mainName && !off.has(c.id));
          const res = await Promise.allSettled(others.map((c) => this.mcp.callTool(SERVER, 'list_events', Object.assign({ calendarId: c.id }, input), { cache: false })));
          res.forEach((r, i) => {
            if (r.status === 'fulfilled') events = events.concat(((r.value && r.value.payload && r.value.payload.events) || []).filter((e) => e && e.status !== 'cancelled' && e.start).map((e) => norm(e, others[i].summary)));
            else this.partial.push(others[i].summary);
          });
          this.calendars = [{ id: '_main', name: mainName, on: true, main: true }].concat(cals.filter((c) => c.summary !== mainName).map((c) => ({ id: c.id, name: c.summary, on: !off.has(c.id) })));
        } else this.calendars = null;
        // un même rendez-vous peut figurer dans deux agendas (invitation acceptée, agenda importé)
        const seen = new Set();
        this.events = events.sort((a, b) => a.start - b.start).filter((e) => { const k = `${e.start.getTime()}|${e.end.getTime()}|${e.title}`; if (seen.has(k)) return false; seen.add(k); return true; });
        this.from = from;
        this.set('ok');
      } catch (e) {
        const code = e && e.code;
        this.set(code === 'not_granted' || code === 'needs_reauth' ? 'consent' : 'error', this.explain(e));
      }
    },
    /** Événements d'un jour (journées entières comprises) */
    on(d) { return (this.events || []).filter((e) => (e.allDay ? e.start.toLocaleDateString('sv-SE') <= d && e.end.toLocaleDateString('sv-SE') > d : e.d === d)); },
    /** Séances d'entraînement placées dans l'agenda ce jour-là */
    training(d) { return this.on(d).filter((e) => e.training); },
    /** Rendez-vous (occupés, minutés, hors longues plages) qui chevauchent une séance */
    conflicts(ev) { return this.on(ev.d).filter((e) => e !== ev && !e.allDay && !e.long && e.busy && !e.training && e.start < ev.end && e.end > ev.start); },
    /** Heure de début habituelle des séances placées dans l'agenda (médiane), « HH:MM » */
    usualStart() {
      const m = (this.events || []).filter((e) => e.training).map((e) => e.start.getHours() * 60 + e.start.getMinutes()).sort((a, b) => a - b);
      if (m.length < 2) return null;
      const v = m[Math.floor(m.length / 2)];
      return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
    },
  };

  SD.cal = C;
})();
