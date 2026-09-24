/* Salle des Machines — synchronisation Google Drive depuis la page (capability `mcp`, connecteur « Google Drive »).
 *
 * À l'ouverture (si l'accès a déjà été accordé) ou sur un clic : repère le dossier de suivi, liste les fichiers,
 * télécharge ceux qui sont nouveaux ou modifiés depuis la dernière synchro, les analyse avec les mêmes parseurs
 * que le build, fusionne avec l'historique et mémorise le résultat dans ce navigateur.
 */
(function () {
  'use strict';
  const SD = window.SD;
  const SERVER = 'Google Drive';
  const MAX_FILES = 30;

  const MIME = {
    folder: 'application/vnd.google-apps.folder',
    sheet: 'application/vnd.google-apps.spreadsheet',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };

  const D = {
    mcp: null, state: 'hidden', message: '', detail: '', lastSync: null, running: false,

    render() {
      const el = document.getElementById('sync');
      const top = document.getElementById('sync-top');
      const cls = { ok: 'ok', busy: 'busy', warn: 'warn', err: 'err' }[this.tone] || '';
      const html = this.state === 'hidden' ? '' : `<div class="t"><span class="dot"></span>Google Drive</div><p>${SD.esc(this.message)}</p>${this.detail ? `<p style="color:var(--muted)">${SD.esc(this.detail)}</p>` : ''}
        ${this.state === 'consent' || this.state === 'idle' || this.state === 'error' || this.state === 'done' ? `<button type="button" class="btn" data-sync>${this.state === 'consent' ? 'Connecter Google Drive' : 'Synchroniser'}</button>` : ''}`;
      if (el) { el.className = 'sync ' + cls; el.innerHTML = html; el.hidden = this.state === 'hidden'; }
      if (top) { top.hidden = this.state === 'hidden'; top.className = 'pill' + (this.tone === 'warn' || this.tone === 'err' ? ' stale' : ''); top.innerHTML = `<span class="dot" style="${this.tone === 'busy' ? 'background:var(--strain)' : ''}"></span>Drive · <b>${SD.esc(this.short || '')}</b>`; }
      const dp = document.getElementById('sync-page');
      if (dp) dp.innerHTML = html ? `<div class="sync ${cls}" style="border:0;padding:0;background:none">${html}</div>` : '<p class="note">La synchronisation Google Drive fonctionne quand le dashboard est ouvert dans claude.ai.</p>';
    },
    set(state, tone, message, short, detail) {
      Object.assign(this, { state, tone, message, short, detail: detail || '' });
      this.render();
    },

    async init() {
      const use = window.claude && window.claude.use;
      if (!use) { this.set('hidden'); return; }
      const mcp = await window.claude.use('mcp').catch(() => null);
      if (!mcp) { this.set('hidden'); return; }
      this.mcp = mcp;
      const perms = await window.claude.use('permissions').catch(() => null);
      const st = perms ? await perms.state('mcp:' + SERVER).catch(() => 'unavailable') : 'prompt';
      const last = SD.M && (SD.M.raw.syncedAt || null);
      this.lastSync = last;
      if (st === 'granted') { this.sync(false); return; }
      if (st === 'denied') { this.set('error', 'warn', 'Accès à Google Drive refusé pour cette page pendant cette visite.', 'refusé'); return; }
      this.set('consent', 'warn', 'Connecte Google Drive pour que le dashboard récupère tout seul tes nouveaux exports à chaque ouverture.', 'à connecter');
    },

    async call(tool, input) {
      const r = await this.mcp.callTool(SERVER, tool, input, { cache: false });
      return r && r.payload;
    },

    explain(e) {
      const code = e && e.code;
      const msgs = {
        needs_reauth: ['Reconnecte Google Drive dans claude.ai → Paramètres → Connecteurs.', 'à reconnecter'],
        server_not_connected: ['Ajoute le connecteur Google Drive dans claude.ai → Paramètres → Connecteurs.', 'non connecté'],
        selection_required: ['Plusieurs connecteurs Google Drive : choisis celui à utiliser dans la fenêtre de claude.ai.', 'à choisir'],
        not_in_manifest: ['Accès à Google Drive non autorisé pour cette page.', 'non autorisé'],
        blocked_by_policy: ['La politique de ton organisation bloque cet accès Google Drive.', 'bloqué'],
        approval_required: ['Ton organisation exige une approbation pour cet accès Drive.', 'approbation requise'],
        server_unavailable: ['Google Drive ne répond pas pour le moment. Réessaie dans quelques minutes.', 'indisponible'],
        not_granted: ['La synchronisation n’est pas disponible dans cette vue.', 'indisponible'],
        capability_disabled: ['La synchronisation n’est pas disponible dans cette vue.', 'indisponible'],
        tool_error: [`Google Drive a renvoyé une erreur : ${(e && e.message) || ''}`, 'erreur'],
      };
      return msgs[code] || [`Synchronisation interrompue${code ? ` (${code})` : ''}.`, 'erreur'];
    },

    async list(query) {
      const out = [];
      let token = null;
      for (let page = 0; page < 5; page++) {
        const input = { query, pageSize: 100, excludeContentSnippets: true };
        if (token) input.pageToken = token;
        const p = await this.call('search_files', input);
        const got = (p && p.files) || [];
        for (const f of got) out.push(f);
        token = p && (p.nextPageToken || p.next_page_token);
        if (!token || !got.length) break; // une page vide signifie la fin, même avec un jeton
      }
      return out;
    },

    classify(f) {
      const t = f.title || '';
      if (f.mimeType === MIME.folder) return null;
      if (/^(HealthExport|Export_Apple_Sante)/i.test(t) && /csv/i.test(f.mimeType + t)) return 'health';
      if (/macrofactor/i.test(t) && (f.mimeType === MIME.xlsx || /\.xlsx$/i.test(t))) return 'macrofactor';
      if (/trainai/i.test(t) && (f.mimeType === MIME.xlsx || /\.xlsx$/i.test(t))) return 'trainai';
      if (f.mimeType === MIME.sheet && /(retours|journal)/i.test(t)) return 'notes';
      if (/_coach/i.test(t) && /(markdown|text)/i.test(f.mimeType || '') || /_coach.*\.md$/i.test(t)) return 'coach';
      if (/(bilan|biomarq|analyse|labo|sang)/i.test(t) && (/csv/i.test(f.mimeType + t) || f.mimeType === MIME.sheet)) return 'labs';
      return null;
    },

    async sync(interactive) {
      if (this.running || !this.mcp) return;
      this.running = true;
      const P = window.SDParsers;
      try {
        this.set('busy', 'busy', 'Recherche du dossier de suivi…', 'recherche…');
        const folderName = (SD.M.cfg.drive && SD.M.cfg.drive.folder) || 'Suivi sportif';
        const folders = await this.list(`title = '${folderName.replace(/'/g, "\\'")}' and mimeType = '${MIME.folder}'`);
        if (!folders.length) { this.set('error', 'warn', `Dossier « ${folderName} » introuvable dans ton Drive.`, 'dossier introuvable', 'Le nom du dossier se règle dans data/config.json (drive.folder).'); return; }
        const root = folders[0];
        let files = await this.list(`parentId = '${root.id}'`);
        for (const sub of files.filter((f) => f.mimeType === MIME.folder && !/photo/i.test(f.title))) {
          files = files.concat(await this.list(`parentId = '${sub.id}'`));
        }
        // sélection : fichiers reconnus, nouveaux ou modifiés depuis la dernière synchro / le build
        const raw = SD.M.raw;
        const since = raw.syncedAt || raw.generatedAt || '1970';
        const norm = (n) => String(n || '').replace(/\.(csv|xlsx|md)$/i, '').trim().toLowerCase();
        const known = new Map(raw.sources.map((s) => [norm(s.fileName), s]));
        const candidates = [];
        const coachBest = new Map();
        for (const f of files) {
          const kind = this.classify(f);
          if (!kind) continue;
          const k = known.get(norm(f.title));
          const changed = !k || (f.modifiedTime && f.modifiedTime > since && (!k.modifiedTime || f.modifiedTime > k.modifiedTime));
          if (!changed) continue;
          if (kind === 'coach') {
            const info = P.coachFileInfo(f.title);
            if (!info) continue;
            const cur = coachBest.get(info.d);
            if (!cur || info.rank > cur.info.rank || (info.rank === cur.info.rank && f.modifiedTime > cur.f.modifiedTime)) coachBest.set(info.d, { f, info });
            continue;
          }
          candidates.push({ f, kind });
        }
        for (const { f, info } of coachBest.values()) {
          const have = SD.M.coach.get(info.d);
          if (!have || (have.rank || 0) < info.rank || f.modifiedTime > since) candidates.push({ f, kind: 'coach' });
        }
        candidates.sort((a, b) => String(a.f.modifiedTime).localeCompare(String(b.f.modifiedTime)));
        const todo = candidates.slice(-MAX_FILES);
        if (!todo.length) {
          const now = new Date().toISOString();
          this.lastSync = now;
          await SD.persist(Object.assign({}, raw, { syncedAt: now }), true);
          this.set('done', 'ok', `À jour : aucun nouveau fichier dans « ${folderName} ».`, 'à jour', `Vérifié ${new Date().toLocaleString('fr-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`);
          return;
        }
        // téléchargement + analyse
        const parts = [];
        const errors = [];
        let XLSX = null;
        for (let i = 0; i < todo.length; i++) {
          const { f, kind } = todo[i];
          this.set('busy', 'busy', `Import ${i + 1}/${todo.length} : ${f.title}`, `${i + 1}/${todo.length}`);
          try {
            const input = { fileId: f.id };
            if (f.mimeType === MIME.sheet) input.exportMimeType = 'text/csv';
            const p = await this.call('download_file_content', input);
            const b64 = p && (p.content || p.data);
            if (!b64) throw new Error('contenu vide');
            const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            let name = f.title;
            if (f.mimeType === MIME.sheet && !/\.csv$/i.test(name)) name += '.csv';
            if (kind === 'coach' && !/\.md$/i.test(name)) name += '.md';
            let part;
            if (kind === 'macrofactor' || kind === 'trainai') {
              XLSX = XLSX || (await SD.loadXLSX());
              part = P.parseFile({ name, buffer: bytes }, XLSX);
            } else {
              part = P.parseFile({ name, text: new TextDecoder('utf-8').decode(bytes) });
            }
            part.driveId = f.id;
            part.modifiedTime = f.modifiedTime;
            if (!part.exportedAt) part.exportedAt = (f.modifiedTime || '').slice(0, 19);
            if (part.fileName !== f.title) part.fileName = f.title;
            parts.push(part);
          } catch (e) {
            errors.push(`${f.title} : ${e && e.code ? this.explain(e)[0] : (e && e.message) || e}`);
            if (e && ['needs_reauth', 'server_not_connected', 'not_in_manifest', 'blocked_by_policy', 'selection_required', 'approval_required'].includes(e.code)) throw e;
          }
        }
        if (!parts.length) { this.set('error', 'err', 'Aucun fichier n’a pu être importé.', 'échec', errors.slice(0, 3).join(' · ')); return; }
        const add = P.mergeParsed(parts, {});
        const merged = P.overlayDataset(raw, add);
        merged.config = raw.config;
        merged.syncedAt = new Date().toISOString();
        this.lastSync = merged.syncedAt;
        await SD.persist(merged);
        this.set('done', errors.length ? 'warn' : 'ok', `${parts.length} fichier${parts.length > 1 ? 's' : ''} importé${parts.length > 1 ? 's' : ''} depuis « ${folderName} ».`, errors.length ? `${parts.length} importés, ${errors.length} erreurs` : `${parts.length} nouveaux`, errors.length ? errors.slice(0, 3).join(' · ') : `Données jusqu’au ${SD.fdM(merged.coverage.to)}`);
      } catch (e) {
        const [msg, short] = this.explain(e);
        this.set('error', 'err', msg, short);
      } finally {
        this.running = false;
      }
    },
  };

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-sync]')) D.sync(true);
  });

  SD.drive = D;
})();
