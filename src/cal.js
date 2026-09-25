/* Salle des Machines — agenda Google (capability `mcp`, connecteur « Google Calendar », lecture seule).
 * Lit les événements d'aujourd'hui et des 7 jours suivants pour placer la séance et repérer les journées chargées.
 * Les titres passent par le même filtre de confidentialité que les rapports du coach. */
(function () {
  'use strict';
  const SD = window.SD;
  const SERVER = 'Google Calendar';

  const tzOffset = (dt) => { const m = -dt.getTimezoneOffset(); const s = m >= 0 ? '+' : '-'; const a = Math.abs(m); return `${s}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`; };
  const isoLocal = (d) => { const dt = new Date(d + 'T00:00:00'); return `${d}T00:00:00${tzOffset(dt)}`; };

  function norm(e) {
    const P = window.SDParsers;
    const allDay = !!(e.start && e.start.date && !e.start.dateTime);
    const start = allDay ? new Date(e.start.date + 'T00:00:00') : new Date(e.start && e.start.dateTime);
    const end = allDay ? new Date((e.end && e.end.date ? e.end.date : e.start.date) + 'T00:00:00') : new Date(e.end && e.end.dateTime ? e.end.dateTime : start.getTime() + 3600000);
    const raw = String(e.summary || '').trim();
    const clean = P && P.cleanSensitive ? P.cleanSensitive(raw) : raw;
    return { title: clean || (raw ? 'Événement privé' : 'Occupé'), allDay, start, end, busy: e.transparency !== 'transparent', d: start.toLocaleDateString('sv-SE') };
  }

  const C = {
    mcp: null, state: 'hidden', events: null, error: '', from: null,

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
    async load() {
      if (!this.mcp) return;
      const from = new Date().toLocaleDateString('sv-SE');
      this.set('busy');
      try {
        const input = { startTime: isoLocal(from), endTime: isoLocal(SD.addD(from, 8)), orderBy: 'startTime', pageSize: 250, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Brussels' };
        const r = await this.mcp.callTool(SERVER, 'list_events', input, { cache: false });
        const p = r && r.payload;
        this.events = ((p && p.events) || []).filter((e) => e && e.status !== 'cancelled' && e.start).map(norm);
        this.from = from;
        this.set('ok');
      } catch (e) {
        const code = e && e.code;
        this.set(code === 'not_granted' || code === 'needs_reauth' ? 'consent' : 'error', code === 'server_not_connected' ? 'Ajoute le connecteur Google Calendar dans claude.ai → Paramètres → Connecteurs.' : (e && e.message) || 'Agenda indisponible.');
      }
    },
    on(d) { return (this.events || []).filter((e) => (e.allDay ? e.start.toLocaleDateString('sv-SE') <= d && e.end.toLocaleDateString('sv-SE') > d : e.d === d)); },
  };

  SD.cal = C;
})();
