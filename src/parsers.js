/*
 * Sport Dashboard — parseurs des exports.
 *
 * Un seul module, utilisé à deux endroits :
 *   - dans le navigateur (import glisser-déposer de nouveaux exports) ;
 *   - par scripts/build.js (Node) pour générer data/dashboard-data.js.
 *
 * Sources gérées :
 *   - Apple Santé via l'app « Health Export » (CSV journalier, format belge : 2.368 = 2368 ; 16,32 = 16.32)
 *   - MacroFactor « FULL EXPORT » (.xlsx)
 *   - TrainAI « Workouts Export » (.xlsx, détail série par série)
 *   - Journal libre (CSV « Date,Notes »)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SDParsers = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- helpers

  const pad = (n) => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

  /** "17/09/2026" | "2026-09-17" | "2026-09-17 00:00:00" | Excel serial -> "2026-09-17" */
  function toISODate(v, XLSX) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') {
      if (XLSX && XLSX.SSF) {
        const p = XLSX.SSF.parse_date_code(v);
        if (p) return iso(p.y, p.m, p.d);
      }
      // Excel epoch fallback (1900 system)
      const ms = Math.round((v - 25569) * 86400000);
      const dt = new Date(ms);
      return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    }
    if (v instanceof Date) return iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return iso(+m[3], +m[2], +m[1]);
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return null;
  }

  /** Nombre au format belge : "2.368" -> 2368 ; "16,32" -> 16.32 ; "105.783,97" -> 105783.97 */
  function num(s) {
    if (s == null) return null;
    if (typeof s === 'number') return isFinite(s) ? s : null;
    s = String(s).trim();
    if (!s || s === '-') return null;
    s = s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const v = parseFloat(s);
    return isFinite(v) ? v : null;
  }

  /** "93-99" -> {lo:93, hi:99} ; "58" -> {lo:58, hi:58} ; "-" -> null */
  function range(s) {
    if (s == null) return null;
    s = String(s).trim();
    if (!s || s === '-') return null;
    const m = s.match(/^([\d.,]+)\s*-\s*([\d.,]+)$/);
    if (m) {
      const lo = num(m[1]), hi = num(m[2]);
      if (lo == null || hi == null) return null;
      return { lo: Math.min(lo, hi), hi: Math.max(lo, hi) };
    }
    const v = num(s);
    return v == null ? null : { lo: v, hi: v };
  }

  /** "7h 33m" | "52m" | "1h" | "45s" -> minutes */
  function duration(s) {
    if (s == null) return null;
    s = String(s).trim();
    if (!s || s === '-') return null;
    let min = 0, found = false;
    const h = s.match(/(\d+(?:[.,]\d+)?)\s*h/);
    const m = s.match(/(\d+(?:[.,]\d+)?)\s*m(?!s)/);
    const sec = s.match(/(\d+(?:[.,]\d+)?)\s*s/);
    if (h) { min += parseFloat(h[1].replace(',', '.')) * 60; found = true; }
    if (m) { min += parseFloat(m[1].replace(',', '.')); found = true; }
    if (sec) { min += parseFloat(sec[1].replace(',', '.')) / 60; found = true; }
    return found ? Math.round(min * 10) / 10 : null;
  }

  const r1 = (v, k = 1) => (v == null ? null : Math.round(v * 10 ** k) / 10 ** k);
  const mid = (rg) => (rg ? (rg.lo + rg.hi) / 2 : null);

  /** CSV tolérant : gère les champs partiellement quotés comme `"Active Calories" (kcal)`. */
  function parseCSV(text, sep = ',') {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const rows = [];
    let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
        } else field += c;
      } else if (c === '"') inQ = true;
      else if (c === sep) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  // ---------------------------------------------------------------- Apple Santé (Health Export CSV)

  // colonne normalisée (minuscule, sans guillemets) -> [clé, type]
  const HEALTH_COLS = {
    'steps (steps)': ['steps', 'num'],
    'active calories (kcal)': ['activeKcal', 'num'],
    'resting calories (kcal)': ['restKcal', 'num'],
    'exercise minutes': ['exMin', 'minutes'],
    'stand hours (hr)': ['standH', 'num'],
    'stand minutes (min)': ['standMin', 'num'],
    'flights climbed (floors)': ['flights', 'num'],
    'walking + running (km)': ['distKm', 'num'],
    'cycling distance (km)': ['cycleKm', 'num'],
    'sleep': ['sleepMin', 'dur'],
    'heart rate variability (ms)': ['hrv', 'range'],
    'resting heart rate (bpm)': ['rhr', 'range'],
    'heart rate (bpm)': ['hr', 'range'],
    'cardio fitness (ml/min·kg)': ['vo2', 'rangeMid'],
    'walking heart rate (bpm)': ['walkHR', 'rangeMid'],
    'respiratory rate (br/min)': ['resp', 'rangeMid'],
    'blood oxygen (%)': ['spo2', 'rangeMid'],
    'walking asymmetry (%)': ['walkAsym', 'rangeMid'],
    'walking speed (km/hr)': ['walkSpeed', 'rangeMid'],
    'step length (cm)': ['stepLen', 'rangeMid'],
    'double support time (%)': ['dblSupport', 'rangeMid'],
    'stair speed: up (m/s)': ['stairUp', 'rangeMid'],
    'stair speed: down (m/s)': ['stairDown', 'rangeMid'],
    'six-minute walk (m)': ['sixMin', 'num'],
    'weight (kg)': ['weight', 'range'],
    'body fat (%)': ['bodyFat', 'rangeMid'],
    'lean body mass (kg)': ['lean', 'rangeMid'],
    'body mass index': ['bmi', 'rangeMid'],
    'waist circumference (cm)': ['waist', 'rangeMid'],
    'calories (kcal)': ['kcal', 'num'],
    'protein (g)': ['prot', 'num'],
    'carbohydrates (g)': ['carb', 'num'],
    'total fat (g)': ['fat', 'num'],
    'fiber (g)': ['fiber', 'num'],
    'dietary sugar (g)': ['sugar', 'num'],
    'sodium (mg)': ['sodium', 'num'],
    'water (ml)': ['water', 'num'],
    'caffeine (mg)': ['caffeine', 'num'],
    'mindful minutes': ['mindful', 'minutes'],
    'state of mind': ['mood', 'mood'],
  };

  // Apple « State of Mind » : valence de −3 (très désagréable) à +3 (très agréable)
  const MOOD = {
    'very unpleasant': -3, 'unpleasant': -2, 'slightly unpleasant': -1, 'neutral': 0,
    'slightly pleasant': 1, 'pleasant': 2, 'very pleasant': 3,
  };

  const normHeader = (h) => String(h).replace(/"/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

  /**
   * @returns {{kind:'health', exportedAt:string|null, days:Object<string,Object>, workouts:Array}}
   * Une date peut occuper plusieurs lignes : la 1re porte les valeurs du jour,
   * chaque ligne porte une séance (Workout Type + DURATION).
   */
  function parseHealthCSV(text, fileName) {
    const rows = parseCSV(text);
    if (!rows.length) throw new Error('CSV vide');
    const hdr = rows[0].map(normHeader);
    const iDate = hdr.indexOf('date');
    const iType = hdr.indexOf('workout type');
    const iDur = hdr.indexOf('duration');
    if (iDate < 0) throw new Error('Colonne Date introuvable');
    const cols = [];
    hdr.forEach((h, i) => { if (HEALTH_COLS[h]) cols.push([i, ...HEALTH_COLS[h]]); });

    const days = {};
    const workouts = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const d = toISODate(row[iDate]);
      if (!d) continue;
      const day = days[d] || (days[d] = { d });
      for (const [i, key, type] of cols) {
        if (day[key] != null) continue;
        const raw = row[i];
        if (raw == null || raw === '' || raw === '-') continue;
        let v = null;
        if (type === 'num') v = num(raw);
        else if (type === 'dur') v = duration(raw);
        // « 85 » (Health Export) ou « 1h 25m » (export Apple Santé du raccourci)
        else if (type === 'minutes') v = /[hms]/i.test(raw) ? duration(raw) : num(raw);
        else if (type === 'mood') {
          const vals = String(raw).split(/[,;]/).map((x) => MOOD[x.trim().toLowerCase()]).filter((x) => x != null);
          v = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        }
        else {
          const rg = range(raw);
          if (!rg) continue;
          if (type === 'range') {
            day[key + 'Lo'] = r1(rg.lo, 2);
            day[key + 'Hi'] = r1(rg.hi, 2);
            v = mid(rg);
          } else if (type === 'rangeMid') v = mid(rg);
          else if (type === 'rangeLo') v = rg.lo;
          else if (type === 'rangeHi') v = rg.hi;
        }
        if (v != null) day[key] = r1(v, 2);
      }
      if (iType >= 0 && row[iType]) {
        workouts.push({ d, type: row[iType].trim(), min: iDur >= 0 ? duration(row[iDur]) : null });
      }
    }
    // Doublons : même jour, même type, même durée (montre + app qui écrivent la même séance)
    const seen = new Set();
    const uniq = workouts.filter((w) => {
      const k = `${w.d}|${w.type}|${w.min}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return { kind: 'health', exportedAt: exportDateFromName(fileName), fileName, days, workouts: uniq };
  }

  /** "HealthExport_...(2026-09-24 12-14-06).csv" / "Export_Apple_Sante_2026-09-24T10:22:24.922Z.csv" */
  function exportDateFromName(name) {
    if (!name) return null;
    let m = String(name).match(/\((\d{4}-\d{2}-\d{2})[ T](\d{2})-(\d{2})-(\d{2})\)/);
    if (m) return `${m[1]}T${m[2]}:${m[3]}:${m[4]}`;
    m = String(name).match(/(\d{4}-\d{2}-\d{2})T(\d{2})[:_-](\d{2})[:_-](\d{2})/);
    if (m) return `${m[1]}T${m[2]}:${m[3]}:${m[4]}`;
    m = String(name).match(/(?:^|\D)(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\D|$)/); // MacroFactor-20260924104745
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31 && +m[4] < 24) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
    m = String(name).match(/(\d{4}-\d{2}-\d{2})/);
    return m ? `${m[1]}T00:00:00` : null;
  }

  // ---------------------------------------------------------------- Journal libre (CSV Date,Notes)

  /** Tags d'une cellule ou d'un texte : « #dj #alcool », « dj, alcool » -> [{id, label}] */
  const slugTag = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  function tagsFrom(cell, fromText) {
    const out = [];
    const src = String(cell || '');
    const parts = fromText ? (src.match(/#[\p{L}\p{N}_-]+/gu) || []).map((x) => x.slice(1)) : src.split(/[,;#\n]+/);
    for (const p of parts) { const label = p.trim().replace(/_/g, ' '); const id = slugTag(label); if (id && !out.some((o) => o.id === id)) out.push({ id, label }); }
    return out;
  }

  /**
   * Journal libre (feuille Google ou CSV) : « Date,Notes » ou colonnes au choix parmi
   * Date, Heure, Note/Notes/Texte, Tags, Humeur, Énergie, Stress, Courbatures, Douleur <zone>.
   * Plusieurs lignes le même jour (raccourci Apple, formulaire) sont regroupées.
   */
  function parseNotesCSV(text, fileName) {
    const first = text.split(/\r?\n/)[0];
    const rows = parseCSV(text, (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',');
    const hdr = rows[0].map(normHeader);
    const find = (re) => hdr.findIndex((h) => re.test(h));
    const iD = find(/^(date|jour)$/), iN = find(/^(notes?|texte|commentaires?|ressenti)$/), iTg = find(/^(tags?|[ée]tiquettes?)$/);
    const SC = { mood: find(/^humeur|^mood/), energy: find(/^[ée]nergie|^energy/), stress: find(/^stress/), soreness: find(/^courbature|^soreness/) };
    const pains = hdr.map((h, i) => [h, i]).filter(([h]) => /^douleur/.test(h)).map(([h, i]) => [h.replace(/^douleurs?\s*/, '').replace(/^./, (c) => c.toUpperCase()) || 'Générale', i]);
    const notes = [];
    const byDay = {};
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const d = toISODate(row[iD]);
      if (!d) continue;
      const t = iN >= 0 ? String(row[iN] || '').trim() : '';
      if (t) notes.push({ d, src: 'journal', text: t });
      const e = byDay[d] || (byDay[d] = { d, texts: [], tags: [], pain: {} });
      if (t) e.texts.push(t);
      for (const tg of (iTg >= 0 ? tagsFrom(row[iTg]) : []).concat(tagsFrom(t, true))) if (!e.tags.some((x) => x.id === tg.id)) e.tags.push(tg);
      for (const [k, i] of Object.entries(SC)) { const v = i >= 0 ? num(row[i]) : null; if (v != null) e[k] = Math.max(1, Math.min(5, Math.round(v))); }
      for (const [site, i] of pains) { const v = num(row[i]); if (v != null) e.pain[site] = Math.max(0, Math.min(10, v)); }
    }
    const jentries = Object.values(byDay).filter((e) => e.texts.length || e.tags.length || Object.keys(e.pain).length || ['mood', 'energy', 'stress', 'soreness'].some((k) => e[k] != null))
      .map((e) => ({ d: e.d, text: e.texts.join(' · '), tags: e.tags.map((x) => x.id), tagLabels: Object.fromEntries(e.tags.map((x) => [x.id, x.label])), mood: e.mood, energy: e.energy, stress: e.stress, soreness: e.soreness, pain: e.pain, src: 'feuille' }));
    return { kind: 'notes', fileName, notes, jentries };
  }

  // ---------------------------------------------------------------- Rapports du coach (.md)

  // Le dashboard ne reprend que le verdict, les scores et les points forts / faibles du rapport. Toute phrase qui
  // contient un terme médical, ou un terme de la configuration privée (privacy.hideTerms, hors git), est retirée.
  const MEDICAL = /(m[ée]dicament|traitement|ordonnance|posologie|prescri|injection|\bdoses?\b|hormon|pharmac|m[ée]decin)/i;
  let hideRe = null;
  /** Termes supplémentaires à masquer (expressions régulières, insensibles à la casse), lus dans la config privée. */
  function setPrivacyTerms(terms) {
    const list = (Array.isArray(terms) ? terms : []).map((t) => String(t).trim()).filter(Boolean);
    try { hideRe = list.length ? new RegExp('(' + list.join('|') + ')', 'i') : null; } catch (e) { hideRe = null; }
  }
  const cleanSensitive = (t) => String(t || '')
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !MEDICAL.test(sentence) && !(hideRe && hideRe.test(sentence)))
    .join(' ')
    .trim();

  /** "2026-09-24_coach_v3.md" -> {d, rank} ; le rapport final (sans suffixe) l'emporte sur les versions. */
  function coachFileInfo(name) {
    const m = String(name || '').match(/(\d{4}-\d{2}-\d{2})_coach(?:_v(\d+))?/i);
    if (!m) return null;
    return { d: m[1], rank: m[2] ? +m[2] : 100 };
  }

  function parseCoachMD(text, fileName) {
    const info = coachFileInfo(fileName) || {};
    let d = info.d || null;
    if (!d) {
      const m = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (m) d = `${m[3]}-${m[2]}-${m[1]}`;
    }
    if (!d) throw new Error(`${fileName} : date du rapport introuvable`);
    const lines = text.split(/\r?\n/);
    const verdictLine = lines.find((l) => /^\s*VERDICT\s*:/i.test(l));
    const scoreLine = lines.find((l) => /pr[ée]paration\s+\d+/i.test(l) && /global\s+\d+/i.test(l));
    const scores = {};
    if (scoreLine) {
      const g = (re) => { const m = scoreLine.match(re); return m ? +m[1] : null; };
      scores.preparation = g(/pr[ée]paration\s+(\d+)/i);
      scores.momentum = g(/momentum\s+(\d+)/i);
      scores.global = g(/global\s+(\d+)/i);
    }
    const section = (title) => {
      const i = lines.findIndex((l) => l.trim().toUpperCase().startsWith(title));
      if (i < 0) return [];
      const out = [];
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j].trim();
        if (!l) { if (out.length) break; continue; }
        if (/^[A-ZÉÈÀÂÎÔÛÇ' ]{6,}$/.test(l)) break;
        out.push(l.replace(/^[-•]\s*/, ''));
      }
      return out.map(cleanSensitive).filter(Boolean);
    };
    const entry = {
      d, rank: info.rank || 100,
      verdict: cleanSensitive(verdictLine ? verdictLine.replace(/^\s*VERDICT\s*:\s*/i, '') : ''),
      scores,
      good: section('CE QUI FONCTIONNE BIEN').slice(0, 4),
      bad: section('CE QUI NE FONCTIONNE PAS').slice(0, 4),
    };
    return { kind: 'coach', fileName, exportedAt: exportDateFromName(fileName), entries: [entry] };
  }

  // ---------------------------------------------------------------- Bilans sanguins (CSV)

  /** CSV « Date,Marqueur,Valeur,Unité,Min,Max » (séparateur , ou ;) */
  function parseLabsCSV(text, fileName) {
    const sep = (text.split(/\r?\n/)[0].match(/;/g) || []).length > (text.split(/\r?\n/)[0].match(/,/g) || []).length ? ';' : ',';
    const rows = parseCSV(text, sep);
    const hdr = rows[0].map(normHeader);
    const col = (...names) => hdr.findIndex((h) => names.some((n) => h.startsWith(n)));
    const iD = col('date'), iN = col('marqueur', 'biomarqueur', 'marker', 'analyte', 'paramètre', 'parametre');
    const iV = col('valeur', 'value', 'résultat', 'resultat'), iU = col('unité', 'unite', 'unit');
    const iLo = col('min', 'réf min', 'ref min', 'low'), iHi = col('max', 'réf max', 'ref max', 'high');
    const labs = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const d = toISODate(row[iD]);
      const v = num(row[iV]);
      if (!d || !row[iN] || v == null) continue;
      labs.push({ d, name: String(row[iN]).trim(), value: v, unit: iU >= 0 ? String(row[iU] || '').trim() : '', lo: iLo >= 0 ? num(row[iLo]) : null, hi: iHi >= 0 ? num(row[iHi]) : null });
    }
    return { kind: 'labs', fileName, labs };
  }

  // ---------------------------------------------------------------- MacroFactor (.xlsx)

  function sheetRows(wb, XLSX, name) {
    const ws = wb.Sheets[name];
    if (!ws) return null;
    if (ws.__rows) return ws.__rows; // onglet reconstitué depuis un CSV
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
  }

  const stripUnit = (h) => String(h).replace(/\s*\((kg|sets|reps|sec|cm|g|mg|mcg|kcal)\)\s*$/i, '').trim();

  /** Feuille « large » (Date + une colonne par entité) -> [{d, name, v}] */
  function wide(rows, XLSX) {
    if (!rows || rows.length < 2) return [];
    const hdr = rows[0].map((h) => (h == null ? null : stripUnit(h)));
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const d = toISODate(rows[r][0], XLSX);
      if (!d) continue;
      for (let c = 1; c < hdr.length; c++) {
        const v = rows[r][c];
        if (hdr[c] && typeof v === 'number' && isFinite(v)) out.push({ d, name: hdr[c], v });
      }
    }
    return out;
  }

  function colIndex(hdr, re) {
    return hdr.findIndex((h) => h != null && re.test(String(h)));
  }

  const MUSCLES_FR = {
    Chest: 'Pectoraux', Quads: 'Quadriceps', 'Upper Back': 'Haut du dos', Glutes: 'Fessiers',
    Lats: 'Dorsaux', Hamstrings: 'Ischios', Biceps: 'Biceps', Triceps: 'Triceps',
    'Front Delts': 'Deltoïdes ant.', 'Side Delts': 'Deltoïdes lat.', 'Rear Delts': 'Deltoïdes post.',
    'Lower Back': 'Lombaires', Abs: 'Abdos', Calves: 'Mollets', 'Upper Traps': 'Trapèzes',
    Forearms: 'Avant-bras', Obliques: 'Obliques', Abductors: 'Abducteurs', Adductors: 'Adducteurs',
    Neck: 'Cou', Tibialis: 'Tibial', Serratus: 'Dentelé',
  };

  const BODY_FR = {
    Waist: 'Tour de taille', Chest: 'Poitrine', Bust: 'Buste', Hips: 'Hanches', Neck: 'Cou',
    Shoulders: 'Épaules', 'Left Bicep': 'Bras G', 'Right Bicep': 'Bras D', 'Left Thigh': 'Cuisse G',
    'Right Thigh': 'Cuisse D', 'Left Calf': 'Mollet G', 'Right Calf': 'Mollet D',
    'Left Forearm': 'Avant-bras G', 'Right Forearm': 'Avant-bras D', 'Left Wrist': 'Poignet G',
    'Right Wrist': 'Poignet D', 'Left Ankle': 'Cheville G', 'Right Ankle': 'Cheville D',
    'Visual Body Fat Assessment': 'Masse grasse visuelle (%)',
  };

  const GOAL_FR = { 'Weight Loss': 'Sèche', 'Weight Gain': 'Prise de masse', Maintenance: 'Maintien' };
  const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Export complet (« FULL EXPORT »), rapide (« Quick Export », 7 derniers jours) ou granulaire (onglets au choix)
  const MF_SHEETS = ['Calories & Macros', 'Scale Weight', 'Weight Trend', 'Quick Export', 'Workout Log', 'Food Log', 'Muscle Groups - Sets', 'Expenditure', 'Body Metrics'];
  function isMacroFactor(wb) {
    return MF_SHEETS.some((s) => !!wb.Sheets[s]);
  }
  // Export MacroFactor au format CSV (un onglet par fichier) : l'onglet se reconnaît à ses en-têtes
  const MF_CSV_SHEETS = [
    ['Workout Log', (h) => h.has('exercise') && h.has('set type')],
    ['Workout Log Notes', (h) => h.has('exercise name') && h.has('workout log notes')],
    ['Food Log Notes', (h) => h.has('food log notes')],
    ['Food Log', (h) => h.has('food name') && h.has('time') && h.has('date')],
    ['Quick Export', (h) => h.has('expenditure') && h.has('trend weight (kg)')],
    ['Muscle Groups - Sets', (h) => h.has('chest (sets)') || h.has('quads (sets)')],
    ['Muscle Groups - Volume', (h) => h.has('chest (kg)') || h.has('quads (kg)')],
    ['Body Metrics', (h) => h.has('waist (cm)') || h.has('left bicep (cm)')],
    ['Micronutrients', (h) => h.has('alcohol (g)') && h.size > 10],
    ['Calories & Macros', (h) => h.has('calories (kcal)') && h.has('protein (g)') && !h.has('food name')],
    ['Scale Weight', (h) => h.has('weight (kg)') && h.has('fat percent')],
    ['Weight Trend', (h) => h.has('trend weight (kg)')],
    ['Expenditure', (h) => h.has('expenditure')],
    ['Steps', (h) => h.has('steps') && h.size <= 3],
    ['Weight Goals', (h) => h.has('goal') && h.has('start date')],
    ['User Profile', (h) => h.has('birthday') && h.has('height (cm)')],
  ];
  function mfSheetFromHeader(hdr) {
    const h = new Set((hdr || []).map((x) => String(x || '').trim().toLowerCase()));
    const hit = MF_CSV_SHEETS.find(([, test]) => test(h));
    return hit ? hit[0] : null;
  }
  /** CSV MacroFactor -> classeur minimal lisible par parseMacroFactor (nombres typés, cellules vides = null) */
  function mfWorkbookFromCSV(text) {
    const rows = parseCSV(text);
    const sheet = rows.length ? mfSheetFromHeader(rows[0]) : null;
    if (!sheet) return null;
    const typed = rows.map((r, i) => (i === 0 ? r : r.map((c) => (c === '' ? null : /^-?\d+(\.\d+)?$/.test(c) ? +c : c))));
    return { SheetNames: [sheet], Sheets: { [sheet]: { __rows: typed } } };
  }
  // Haltères : MacroFactor note le poids des deux haltères dans le journal de séries et la meilleure série,
  // mais un seul haltère dans « charge max » et « 1-RM ». On ramène tout au poids d'un haltère.
  const isPairDB = (n) => /dumbbell/i.test(n) && !/(single|one)[ -]?arm|concentration|goblet/i.test(n);
  const cleanExName = (n) => String(n || '').replace(/\s*∈.*$/, '').replace(/\s*\(Copy\)\s*$/i, '').trim();

  function parseMacroFactor(wb, XLSX, fileName) {
    const days = {};
    const D = (d) => days[d] || (days[d] = { d });

    // Calories & macros
    const cm = sheetRows(wb, XLSX, 'Calories & Macros');
    if (cm) {
      const h = cm[0];
      const iK = colIndex(h, /^Calories/i), iF = colIndex(h, /^Fat/i), iC = colIndex(h, /^Carbs/i), iP = colIndex(h, /^Protein/i);
      for (let r = 1; r < cm.length; r++) {
        const d = toISODate(cm[r][0], XLSX);
        if (!d) continue;
        const k = cm[r][iK];
        if (typeof k !== 'number') continue;
        Object.assign(D(d), { kcal: r1(k, 0), fat: r1(cm[r][iF]), carb: r1(cm[r][iC]), prot: r1(cm[r][iP]) });
      }
    }
    // Micronutriments utiles
    const mi = sheetRows(wb, XLSX, 'Micronutrients');
    if (mi) {
      const h = mi[0];
      const pick = { fiber: /^Fiber/i, alcohol: /^Alcohol/i, sodium: /^Sodium/i, sugar: /^Sugars \(g\)/i, caffeine: /^Caffeine/i, water: /^Water/i };
      const idx = Object.fromEntries(Object.entries(pick).map(([k, re]) => [k, colIndex(h, re)]));
      for (let r = 1; r < mi.length; r++) {
        const d = toISODate(mi[r][0], XLSX);
        if (!d || !days[d]) continue;
        for (const [k, i] of Object.entries(idx)) {
          const v = i >= 0 ? mi[r][i] : null;
          if (typeof v === 'number') days[d][k] = r1(v, 1);
        }
      }
    }
    // Export rapide : une ligne par jour (dépense, poids, tendance, nutrition, pas, micronutriments)
    const qe = sheetRows(wb, XLSX, 'Quick Export');
    if (qe) {
      const h = qe[0];
      const col = { tdee: /^Expenditure/i, trend: /^Trend Weight/i, weight: /^Weight/i, kcal: /^Calories/i, prot: /^Protein/i, fat: /^Fat \(/i, carb: /^Carbs/i,
        mfSteps: /^Steps/i, alcohol: /^Alcohol/i, fiber: /^Fiber/i, sodium: /^Sodium/i, sugar: /^Sugars? \(/i, caffeine: /^Caffeine/i, water: /^Water/i };
      const idx = Object.fromEntries(Object.entries(col).map(([k, re]) => [k, colIndex(h, re)]));
      for (let r = 1; r < qe.length; r++) {
        const d = toISODate(qe[r][0], XLSX);
        if (!d) continue;
        const v = (k) => (idx[k] >= 0 && typeof qe[r][idx[k]] === 'number' ? qe[r][idx[k]] : null);
        const o = D(d);
        if (v('tdee') != null) o.tdee = r1(v('tdee'), 0);
        if (v('trend') != null) o.trend = r1(v('trend'), 2);
        if (v('weight') != null) o.weight = r1(v('weight'), 2);
        if (v('mfSteps') != null) o.mfSteps = v('mfSteps');
        if (v('kcal') != null) {
          Object.assign(o, { kcal: r1(v('kcal'), 0), prot: r1(v('prot')), fat: r1(v('fat')), carb: r1(v('carb')) });
          for (const k of ['alcohol', 'fiber', 'sodium', 'sugar', 'caffeine', 'water']) if (v(k) != null) o[k] = r1(v(k), 1);
        }
      }
    }
    // Journal alimentaire : heure du dernier repas (et totaux du jour si l'export n'a pas de résumé quotidien)
    const fl = sheetRows(wb, XLSX, 'Food Log');
    if (fl) {
      const h = fl[0];
      const iD = colIndex(h, /^Date$/i), iT = colIndex(h, /^Time$/i);
      const sumCols = { kcal: /^Calories/i, prot: /^Protein/i, fat: /^Fat \(/i, carb: /^Carbs/i, fiber: /^Fiber/i, alcohol: /^Alcohol/i, sodium: /^Sodium/i, sugar: /^Sugars? \(/i, caffeine: /^Caffeine/i };
      const sIdx = Object.fromEntries(Object.entries(sumCols).map(([k, re]) => [k, colIndex(h, re)]));
      const tot = {};
      for (let r = 1; r < fl.length; r++) {
        const d = toISODate(fl[r][iD], XLSX);
        if (!d) continue;
        const t = iT >= 0 ? String(fl[r][iT] || '').match(/^(\d{1,2}):(\d{2})/) : null;
        if (t) { const m = +t[1] * 60 + +t[2]; const o = D(d); if (o.lastMeal == null || m > o.lastMeal) o.lastMeal = m; }
        const a = tot[d] || (tot[d] = {});
        for (const [k, i] of Object.entries(sIdx)) if (i >= 0 && typeof fl[r][i] === 'number') a[k] = (a[k] || 0) + fl[r][i];
      }
      // le résumé de l'export rapide laisse parfois les calories vides : on complète jour par jour depuis le journal alimentaire
      for (const [d, a] of Object.entries(tot)) if (a.kcal != null && D(d).kcal == null) {
        const o = D(d);
        for (const [k, v] of Object.entries(a)) o[k] = r1(v, k === 'kcal' ? 0 : 1);
      }
    }
    // Poids balance
    const sw = sheetRows(wb, XLSX, 'Scale Weight');
    if (sw) for (let r = 1; r < sw.length; r++) {
      const d = toISODate(sw[r][0], XLSX);
      if (!d || typeof sw[r][1] !== 'number') continue;
      D(d).weight = r1(sw[r][1], 2);
      if (typeof sw[r][2] === 'number') D(d).bodyFat = r1(sw[r][2], 1);
    }
    // Poids tendance
    const wt = sheetRows(wb, XLSX, 'Weight Trend');
    if (wt) for (let r = 1; r < wt.length; r++) {
      const d = toISODate(wt[r][0], XLSX);
      if (d && typeof wt[r][1] === 'number') D(d).trend = r1(wt[r][1], 2);
    }
    // Dépense estimée
    const ex = sheetRows(wb, XLSX, 'Expenditure');
    if (ex) for (let r = 1; r < ex.length; r++) {
      const d = toISODate(ex[r][0], XLSX);
      if (d && typeof ex[r][1] === 'number') D(d).tdee = r1(ex[r][1], 0);
    }
    // Pas (secours si Apple Santé absent)
    const st = sheetRows(wb, XLSX, 'Steps');
    if (st) for (let r = 1; r < st.length; r++) {
      const d = toISODate(st[r][0], XLSX);
      if (d && typeof st[r][1] === 'number') D(d).mfSteps = st[r][1];
    }

    // Cibles nutrition : dernière mise à jour du programme <= jour, même jour de semaine
    const nps = sheetRows(wb, XLSX, 'Nutrition Program Settings');
    const targets = [];
    if (nps) {
      const h = nps[0];
      const iD = colIndex(h, /^Program Update Date/i), iW = colIndex(h, /^Program Weekday/i);
      const iK = colIndex(h, /^Calories/i), iF = colIndex(h, /^Fat/i), iP = colIndex(h, /^Protein/i), iC = colIndex(h, /^Carbs/i);
      for (let r = 1; r < nps.length; r++) {
        const d = toISODate(nps[r][iD], XLSX);
        const wd = WEEKDAYS_EN.indexOf(String(nps[r][iW]).trim());
        if (!d || wd < 0) continue;
        targets.push({ d, wd, kcal: nps[r][iK], fat: nps[r][iF], prot: nps[r][iP], carb: nps[r][iC] });
      }
    }

    // Groupes musculaires
    const muscles = {};
    const addMus = (rows, key) => {
      for (const { d, name, v } of wide(rows, XLSX)) {
        const k = d + '|' + name;
        const o = muscles[k] || (muscles[k] = { d, m: MUSCLES_FR[name] || name });
        o[key] = r1(v, 1);
      }
    };
    addMus(sheetRows(wb, XLSX, 'Muscle Groups - Sets'), 'sets');
    addMus(sheetRows(wb, XLSX, 'Muscle Groups - Volume'), 'vol');

    // Exercices (une ligne par jour et par exercice)
    const exercises = {};
    const addEx = (sheet, key, digits) => {
      for (const { d, name, v } of wide(sheetRows(wb, XLSX, sheet), XLSX)) {
        const n = cleanExName(name);
        const k = d + '|' + n;
        const o = exercises[k] || (exercises[k] = { d, n, s: 'MF' });
        o[key] = o[key] == null ? r1(v, digits) : Math.max(o[key], r1(v, digits));
      }
    };
    addEx('Exercises - 1-RM', 'e1', 1);
    addEx('Exercises - Heaviest Weight', 'hw', 1);
    addEx('Exercises - Total Volume', 'vol', 0);
    addEx('Exercises - Total Sets', 'sets', 0);
    addEx('Exercises - Total Reps', 'reps', 0);
    addEx('Exercises - Best Set Reps', 'br', 0);
    addEx('Exercises - Best Set Volume', 'bsv', 1);
    // e1RM homogène sur toutes les sources : Epley sur la meilleure série (poids d'un haltère), comme TrainAI.
    // Le « 1-RM » de MacroFactor est lissé par l'app et ne se compare pas à une série réelle.
    for (const o of Object.values(exercises)) {
      if (o.bsv > 0 && o.br > 0) { const w = o.bsv / o.br / (isPairDB(o.n) ? 2 : 1); o.e1 = r1(epley(w, o.br), 1); }
      delete o.bsv;
    }
    // Journal de séries (export rapide ou granulaire) : séries de travail uniquement, RIR ; prioritaire sur les onglets agrégés.
    // Comptage identique à MacroFactor (vérifié sur 894 exercices-jours) : l'échauffement ne compte pas ; une série dégressive
    // (« Drop Set » puis ses « Drop ») ou myo-reps (« Myo Set » puis ses « Mini-set ») compte pour une série ; une série
    // unilatérale notée côté gauche (L) puis droit (R) compte pour une série ; une série chronométrée (gainage) compte.
    const wl = sheetRows(wb, XLSX, 'Workout Log');
    const sessions = [];
    if (wl) {
      const h = wl[0];
      const iD = colIndex(h, /^Date$/i), iE = colIndex(h, /^Exercise$/i), iT = colIndex(h, /^Set Type/i), iW = colIndex(h, /^Weight/i), iR = colIndex(h, /^Reps/i), iRir = colIndex(h, /^RIR/i);
      const iDur = colIndex(h, /^Duration$/i), iWD = colIndex(h, /^Workout Duration/i), iWo = colIndex(h, /^Workout$/i);
      const logEx = {};
      const prevType = {};
      const wdur = {};
      for (let r = 1; r < wl.length; r++) {
        const d = toISODate(wl[r][iD], XLSX);
        const n = cleanExName(wl[r][iE]);
        if (!d || !n) continue;
        if (iWD >= 0 && typeof wl[r][iWD] === 'number') { const w = wdur[d] || (wdur[d] = {}); w[String(iWo >= 0 ? wl[r][iWo] : '') || '·'] = wl[r][iWD]; }
        const raw = String(wl[r][iT] || 'Standard Set');
        const side = (raw.match(/\((L|R)\)\s*$/) || [])[1] || '';
        const type = raw.replace(/\s*\((L|R)\)\s*$/, '').trim();
        const pk = d + '|' + n + '|' + side;
        const prev = prevType[pk];
        prevType[pk] = type;
        if (/warm/i.test(type)) continue;
        const cont = /mini/i.test(type) || (/^drop$/i.test(type) && /^drop( set)?$/i.test(prev || '')); // suite d'une série déjà comptée
        const w = typeof wl[r][iW] === 'number' ? wl[r][iW] : 0, reps = typeof wl[r][iR] === 'number' ? wl[r][iR] : 0;
        const timed = !reps && iDur >= 0 && typeof wl[r][iDur] === 'number' && wl[r][iDur] > 0;
        if (typeof wl[r][iR] !== 'number' && !timed) continue; // ligne vide ; une série à 0 répétition (échec) compte, comme dans MacroFactor
        const k = d + '|' + n;
        const o = logEx[k] || (logEx[k] = { d, n, sets: 0, reps: 0, vol: 0, hw: 0, br: 0, bsv: 0, bw: 0, rirs: [] });
        if (!cont) o.sets += side ? 0.5 : 1;
        if (!reps) continue;
        const wph = w / (isPairDB(n) ? 2 : 1);
        o.reps += reps; o.vol += w * reps; o.hw = Math.max(o.hw, wph);
        if (w * reps > o.bsv) { o.bsv = w * reps; o.br = reps; o.bw = wph; }
        if (!cont) {
          const rir = iRir >= 0 ? wl[r][iRir] : null;
          if (typeof rir === 'number') o.rirs.push(rir);
          else if (/failure/i.test(type)) o.rirs.push(0);
        }
      }
      for (const [k, o] of Object.entries(logEx)) {
        exercises[k] = { d: o.d, n: o.n, s: 'MF', sets: r1(o.sets, 1), reps: o.reps, vol: r1(o.vol, 0), hw: o.hw > 0 ? r1(o.hw, 1) : null, br: o.br || null,
          e1: o.bw > 0 ? r1(epley(o.bw, o.br), 1) : null,
          rir: o.rirs.length ? r1(o.rirs.reduce((a, b) => a + b, 0) / o.rirs.length, 1) : null, fail: o.rirs.filter((x) => x === 0).length };
      }
      // durée de séance (secondes par séance, plusieurs séances possibles le même jour)
      for (const [d, w] of Object.entries(wdur)) {
        const sec = Object.values(w).reduce((a, b) => a + b, 0);
        if (sec > 0) sessions.push({ d, min: Math.round(sec / 60) });
      }
    }

    // Mensurations
    const body = [];
    const bm = sheetRows(wb, XLSX, 'Body Metrics');
    if (bm) {
      const h = bm[0].map((x) => (x == null ? null : stripUnit(x)));
      for (let r = 1; r < bm.length; r++) {
        const d = toISODate(bm[r][0], XLSX);
        if (!d) continue;
        const o = { d };
        let any = false;
        for (let c = 1; c < h.length; c++) {
          if (typeof bm[r][c] === 'number' && h[c]) { o[BODY_FR[h[c]] || h[c]] = bm[r][c]; any = true; }
        }
        if (any) body.push(o);
      }
    }

    // Phases (objectifs de poids)
    const phases = [];
    const wg = sheetRows(wb, XLSX, 'Weight Goals');
    if (wg) {
      const h = wg[0];
      const iG = colIndex(h, /^Goal$/i), iS = colIndex(h, /^Start Date/i), iE = colIndex(h, /^End Date/i);
      const iGW = colIndex(h, /^Goal Weight/i), iR = colIndex(h, /^Goal Rate/i), iSt = colIndex(h, /^Status/i);
      for (let r = 1; r < wg.length; r++) {
        const start = toISODate(wg[r][iS], XLSX);
        if (!start) continue;
        const name = GOAL_FR[wg[r][iG]] || String(wg[r][iG] || 'Phase');
        const end = toISODate(wg[r][iE], XLSX);
        const prev = phases[phases.length - 1];
        if (prev && prev.name === name && prev.end === start) { prev.end = end; prev.goal = wg[r][iGW]; continue; }
        phases.push({ name, start, end, goal: wg[r][iGW], rate: wg[r][iR], status: wg[r][iSt], src: 'MacroFactor' });
      }
      // une phase de 0-3 jours juste avant une autre du même type est déjà fusionnée ci-dessus
    }

    // Notes d'entraînement / alimentation
    const notes = [];
    const wln = sheetRows(wb, XLSX, 'Workout Log Notes');
    if (wln) for (let r = 1; r < wln.length; r++) {
      const d = toISODate(wln[r][0], XLSX);
      if (d && wln[r][2]) notes.push({ d, src: 'séance', ex: wln[r][1] || '', text: String(wln[r][2]).trim() });
    }
    const fln = sheetRows(wb, XLSX, 'Food Log Notes');
    if (fln) for (let r = 1; r < fln.length; r++) {
      const d = toISODate(fln[r][0], XLSX);
      if (d && fln[r][2]) notes.push({ d, src: 'nutrition', ex: fln[r][1] || '', text: String(fln[r][2]).trim() });
    }

    // Profil (uniquement ce qui sert aux calculs : taille, année de naissance, prénom)
    let profile = null;
    const up = sheetRows(wb, XLSX, 'User Profile');
    if (up && up.length > 1) {
      const h = up[0], v = up[1];
      const get = (re) => { const i = colIndex(h, re); return i >= 0 ? v[i] : null; };
      const bd = toISODate(get(/^Birthday/i), XLSX);
      profile = {
        firstName: String(get(/^Name/i) || '').split(' ')[0] || null,
        heightCm: get(/^Height/i),
        birthYear: bd ? +bd.slice(0, 4) : null,
        birthDate: bd || null,
        sex: get(/^Sex/i),
      };
    }

    return {
      kind: 'macrofactor', fileName, exportedAt: exportDateFromName(fileName),
      days, targets, muscles: Object.values(muscles), exercises: Object.values(exercises),
      body, phases, notes, profile, sessions,
    };
  }

  // ---------------------------------------------------------------- TrainAI (.xlsx)

  function isTrainAI(wb, XLSX) {
    const first = wb.Sheets[wb.SheetNames[0]];
    if (!first) return false;
    const rows = XLSX.utils.sheet_to_json(first, { header: 1, raw: true, defval: null, range: 0 }).slice(0, 4);
    return rows.some((r) => r && r[0] === 'Workout Start');
  }

  function epley(w, reps) {
    if (!(w > 0) || !(reps > 0)) return null;
    return reps === 1 ? w : w * (1 + reps / 30);
  }

  function parseTrainAI(wb, XLSX, fileName) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: true });
    const sessions = [];
    const sets = [];
    let cur = null, inSets = false;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || [];
      const a = r[0] == null ? '' : String(r[0]);
      if (a === 'Workout Start') {
        const title = rows[i - 1] && rows[i - 1][0] ? String(rows[i - 1][0]).trim() : '';
        const start = String(r[1] || '');
        cur = { d: start.slice(0, 10), start: start.replace(' ', 'T'), title, src: 'TA' };
        sessions.push(cur);
        inSets = false;
        continue;
      }
      if (!cur) continue;
      if (a === 'Total Duration (seconds)') cur.min = r1(num(r[1]) / 60, 0);
      else if (a === 'Total Sets') cur.sets = num(r[1]);
      else if (a === 'Burned Calories') cur.kcal = num(r[1]);
      else if (a.startsWith('Total TVL')) cur.vol = num(r[1]);
      else if (a === 'Exercise') inSets = true;
      else if (inSets && a.trim() && typeof r[1] === 'number') {
        sets.push({ d: cur.d, n: a.trim(), reps: r[1], w: typeof r[2] === 'number' ? r[2] : 0 });
      } else if (inSets && !a.trim()) inSets = false;
    }
    // Agrégat jour × exercice, mêmes champs que MacroFactor
    const agg = {};
    for (const s of sets) {
      const k = s.d + '|' + s.n;
      const o = agg[k] || (agg[k] = { d: s.d, n: s.n, s: 'TA', e1: 0, hw: 0, vol: 0, sets: 0, reps: 0, br: 0 });
      o.sets += 1;
      o.reps += s.reps;
      o.vol += s.reps * s.w;
      o.hw = Math.max(o.hw, s.w);
      o.br = Math.max(o.br, s.reps);
      o.e1 = Math.max(o.e1, epley(s.w, s.reps) || 0);
    }
    const exercises = Object.values(agg).map((o) => ({ ...o, e1: o.e1 ? r1(o.e1, 1) : null, vol: r1(o.vol, 0) }));
    return { kind: 'trainai', fileName, exportedAt: exportDateFromName(fileName), sessions, exercises };
  }

  // ---------------------------------------------------------------- détection + parse d'un fichier

  /**
   * @param {{name:string, text?:string, buffer?:ArrayBuffer|Uint8Array}} file
   * @param {object} XLSX  SheetJS (requis pour .xlsx)
   */
  function parseFile(file, XLSX) {
    const name = file.name || '';
    if (/\.md$/i.test(name) || (typeof file.text === 'string' && /^\s*RAPPORT COACH/i.test(file.text))) return parseCoachMD(file.text, name);
    if (/\.csv$/i.test(name) || typeof file.text === 'string') {
      const text = file.text.replace(/^﻿/, '');
      const first = text.split(/\r?\n/)[0].toLowerCase();
      // export MacroFactor en CSV (granulaire) : avant les autres tests, son en-tête commence aussi par « Date »
      const mfwb = /set type|trend weight|food name|\(sets\)|fat percent|workout log notes|food log notes/.test(first) || /macrofactor/i.test(name) ? mfWorkbookFromCSV(text) : null;
      if (mfwb) return parseMacroFactor(mfwb, XLSX, name);
      if (/(marqueur|marker|analyte|param[eè]tre)/.test(first) && /(valeur|value|r[ée]sultat)/.test(first)) return parseLabsCSV(text, name);
      if (/^"?date"?\s*[,;]\s*"?notes?"?/.test(first)) return parseNotesCSV(text, name);
      // journal enrichi (raccourci, formulaire) : date + note / tags / humeur…, sans colonnes Apple Santé
      if (/^"?(date|jour)"?\s*[,;]/.test(first) && /(notes?|texte|tags?|humeur|[ée]nergie|courbature|ressenti)"?\s*([,;]|$)/.test(first) && !/steps|\(kcal\)|\(bpm\)/.test(first)) return parseNotesCSV(text, name);
      if (first.startsWith('date,') || first.startsWith('"date"')) return parseHealthCSV(text, name);
      throw new Error(`${name} : CSV non reconnu (attendu : Health Export, MacroFactor, journal Date,Notes ou bilan Date,Marqueur,Valeur)`);
    }
    if (!XLSX) throw new Error('Bibliothèque XLSX indisponible');
    const wb = XLSX.read(file.buffer, { type: 'array', cellDates: false });
    if (isMacroFactor(wb)) return parseMacroFactor(wb, XLSX, name);
    if (isTrainAI(wb, XLSX)) return parseTrainAI(wb, XLSX, name);
    throw new Error(`${name} : classeur non reconnu (attendu : MacroFactor ou TrainAI)`);
  }

  // ---------------------------------------------------------------- fusion

  const WORKOUT_FR = {
    'Traditional Strength Training': 'Musculation',
    'Functional Strength Training': 'Renfo fonctionnel',
    'Cycling': 'Vélo', 'Walking': 'Marche', 'Running': 'Course', 'Stair Climbing': 'Escaliers',
    'Elliptical': 'Elliptique', 'Rowing': 'Rameur', 'High Intensity Interval Training': 'HIIT',
    'Hiking': 'Randonnée', 'Yoga': 'Yoga', 'Other': 'Autre', 'Swimming': 'Natation',
    'Core Training': 'Gainage', 'Cooldown': 'Retour au calme', 'Dance': 'Danse',
  };
  const STRENGTH = new Set(['Musculation', 'Renfo fonctionnel']);
  // durée au-delà de laquelle une séance de musculation est un chrono oublié
  const MAX_STRENGTH_MIN = 180;

  /**
   * Fusionne des résultats de parseFile en un jeu de données unique.
   * Règles :
   *  - Apple Santé : pour une date présente dans plusieurs exports, l'export le plus récent gagne (jour + séances).
   *  - MacroFactor : l'export le plus récent gagne ; il prime sur Apple Santé pour poids, % gras et nutrition.
   *  - TrainAI : historique série par série (2024-2025), fusionné par jour × exercice.
   */
  function mergeParsed(parts, config) {
    config = config || {};
    const byKind = (k) => parts.filter((p) => p.kind === k).sort((a, b) => String(a.exportedAt || '').localeCompare(String(b.exportedAt || '')));

    const days = {};
    const D = (d) => days[d] || (days[d] = { d });

    // 1) Apple Santé : export le plus récent en dernier -> écrase
    const healthOwner = {};
    const workoutsByDate = {};
    for (const p of byKind('health')) {
      const exportDay = p.exportedAt ? p.exportedAt.slice(0, 10) : null;
      for (const [d, v] of Object.entries(p.days)) {
        days[d] = Object.assign({ d }, v);
        // le jour de l'export n'est pas terminé : exclu des moyennes
        if (d === exportDay) days[d].partial = true;
        healthOwner[d] = p.fileName;
        workoutsByDate[d] = [];
      }
      for (const w of p.workouts) {
        if (healthOwner[w.d] === p.fileName) workoutsByDate[w.d].push(w);
      }
    }
    const healthDates = Object.keys(healthOwner).sort();

    // 2) MacroFactor : plusieurs exports possibles (complet, partiel). Du plus ancien au plus récent,
    //    chaque export remplace les dates qu'il couvre ; les feuilles absentes d'un export partiel ne vident rien.
    const mfParts = byKind('macrofactor');
    let targets = [], muscles = [], exercises = [], body = [], phases = [], notes = [], profile = null;
    const span = (arr) => (arr.length ? [arr.reduce((m, x) => (x.d < m ? x.d : m), arr[0].d), arr.reduce((m, x) => (x.d > m ? x.d : m), arr[0].d)] : null);
    const outside = (r) => (x) => !r || x.d < r[0] || x.d > r[1];
    for (const mf of mfParts) {
      for (const [d, v] of Object.entries(mf.days)) {
        const day = D(d);
        if (v.weight != null) { day.weight = v.weight; delete day.weightLo; delete day.weightHi; day.weightSrc = 'MF'; }
        if (v.bodyFat != null) day.bodyFat = v.bodyFat;
        if (v.trend != null) day.trend = v.trend;
        if (v.tdee != null) day.tdee = v.tdee;
        if (v.kcal != null) {
          for (const k of ['kcal', 'prot', 'carb', 'fat', 'fiber', 'alcohol', 'sodium', 'sugar', 'caffeine', 'water']) if (v[k] != null) day[k] = v[k];
          day.nutriSrc = 'MF';
        }
        if (day.steps == null && v.mfSteps != null) day.steps = v.mfSteps;
        if (v.lastMeal != null) day.lastMeal = v.lastMeal;
      }
      if (mf.exercises.length) { const r = span(mf.exercises); exercises = exercises.filter(outside(r)).concat(mf.exercises); }
      if (mf.muscles.length) { const r = span(mf.muscles); muscles = muscles.filter(outside(r)).concat(mf.muscles); }
      if (mf.targets.length) targets = mf.targets;
      if (mf.body.length) body = mf.body;
      if (mf.phases.length) phases = mf.phases.slice();
      const seenN = new Set(notes.map((n) => n.d + '|' + n.text));
      for (const n of mf.notes) if (!seenN.has(n.d + '|' + n.text)) notes.push(n);
      if (mf.profile) profile = mf.profile;
    }

    // 3) TrainAI
    const sessions = [];
    for (const p of byKind('trainai')) {
      const have = new Set(exercises.map((e) => e.d + '|' + e.n + '|' + e.s));
      for (const e of p.exercises) if (!have.has(e.d + '|' + e.n + '|TA')) exercises.push(e);
      for (const s of p.sessions) sessions.push(s);
    }

    // 4) Journal libre, rapports du coach, bilans sanguins
    const jsheet = {};
    for (const p of parts.filter((x) => x.kind === 'notes')) for (const e of p.jentries || []) jsheet[e.d] = e;
    for (const p of parts.filter((x) => x.kind === 'notes')) {
      const seenN = new Set(notes.map((n) => n.d + '|' + n.text));
      for (const n of p.notes) if (!seenN.has(n.d + '|' + n.text)) notes.push(n);
    }
    const coachByDay = {};
    for (const p of parts.filter((x) => x.kind === 'coach')) {
      for (const e of p.entries) {
        const cur = coachByDay[e.d];
        const key = [e.rank, p.exportedAt || ''];
        if (!cur || key[0] > cur._k[0] || (key[0] === cur._k[0] && key[1] > cur._k[1])) coachByDay[e.d] = Object.assign({ _k: key }, e);
      }
    }
    const coach = Object.values(coachByDay).map((e) => { const o = Object.assign({}, e); delete o._k; return o; }).sort((a, b) => a.d.localeCompare(b.d));
    const labKey = (l) => l.d + '|' + l.name.toLowerCase();
    const labMap = new Map();
    for (const p of parts.filter((x) => x.kind === 'labs')) for (const l of p.labs) labMap.set(labKey(l), l);
    const labs = [...labMap.values()].sort((a, b) => a.d.localeCompare(b.d) || a.name.localeCompare(b.name));

    // 5) Séances : Apple Santé (source de vérité pour la durée), sinon TrainAI, sinon log MacroFactor
    const workouts = [];
    for (const d of Object.keys(workoutsByDate).sort()) {
      for (const w of workoutsByDate[d]) {
        const type = WORKOUT_FR[w.type] || w.type;
        const flag = STRENGTH.has(type) && w.min != null && w.min > MAX_STRENGTH_MIN;
        workouts.push({ d, type, min: flag ? null : w.min, rawMin: w.min, flag: flag || undefined, src: 'Santé' });
      }
    }
    const strengthDays = new Set(workouts.filter((w) => STRENGTH.has(w.type)).map((w) => w.d));
    const seenSess = new Set();
    for (const s of sessions) {
      if (strengthDays.has(s.d) || seenSess.has(s.d)) continue;
      seenSess.add(s.d);
      workouts.push({ d: s.d, type: 'Musculation', min: s.min, src: 'TrainAI' });
      strengthDays.add(s.d);
    }
    const mfMin = new Map();
    for (const mf of mfParts) for (const s of mf.sessions || []) mfMin.set(s.d, s.min);
    for (const d of new Set(exercises.map((e) => e.d))) {
      if (!strengthDays.has(d)) {
        workouts.push({ d, type: 'Musculation', min: mfMin.has(d) ? mfMin.get(d) : null, src: 'MacroFactor' });
        strengthDays.add(d);
      }
    }
    workouts.sort((a, b) => a.d.localeCompare(b.d));

    // 6) Nettoyage des mesures ambiguës d'Apple Santé
    //  - Poids : une plage large (> 1 kg) = deux pesées de personnes/sources différentes.
    //    On garde la borne la plus proche de la médiane des 10 pesées non ambiguës précédentes.
    //  - FC repos : la plage agrège plusieurs échantillons ; la valeur la plus basse est la plus fiable.
    //  - Sommeil < 3 h : enregistrement incomplet le plus souvent -> exclu des moyennes (valeur brute conservée).
    //  - Pesée aberrante (autre personne ou enfant pesé sur la balance, parfois synchronisé jusque dans MacroFactor) :
    //    on parcourt l'historique du plus récent au plus ancien (les données récentes sont les plus fiables)
    //    et on écarte une pesée qui s'éloigne de la médiane des 10 dernières pesées retenues de plus de
    //    max(4 kg, 6 %) + 0,5 kg par semaine d'écart (tolérance aux vraies variations après une pause).
    //    La valeur écartée reste disponible dans weightOut.
    const sortedDays = Object.keys(days).sort().map((d) => days[d]);
    const kept = []; // [jour, poids] du plus récent au plus ancien
    const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
    const dayNum = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;
    for (let i = sortedDays.length - 1; i >= 0; i--) {
      const day = sortedDays[i];
      if (day.weight == null) continue;
      const last = kept.slice(-10);
      const ref = median(last.map(([, w]) => w));
      const gapW = last.length ? (last[last.length - 1][0] - dayNum(day.d)) / 7 : 0;
      if (day.weightSrc !== 'MF' && day.weightHi != null && day.weightHi - day.weightLo > 1) {
        day.weight = ref == null ? null : Math.abs(day.weightLo - ref) <= Math.abs(day.weightHi - ref) ? day.weightLo : day.weightHi;
        day.weightAmb = true;
      }
      if (day.weight != null && ref != null && Math.abs(day.weight - ref) > Math.max(4, 0.06 * ref) + 0.5 * Math.max(0, gapW - 1)) {
        day.weightOut = day.weight;
        day.weight = null;
        if (day.weightSrc !== 'MF') { delete day.bodyFat; delete day.lean; }
      }
      if (day.weight != null) kept.push([dayNum(day.d), day.weight]);
    }
    for (const day of sortedDays) {
      if (day.rhrLo != null) day.rhr = day.rhrLo;
      if (day.sleepMin != null && day.sleepMin < 180) { day.sleepRaw = day.sleepMin; day.sleepMin = null; }
      delete day.weightLo; delete day.weightHi; delete day.rhrLo; delete day.rhrHi;
    }

    // 7) Phases personnalisées (config) en plus de celles de MacroFactor
    if (Array.isArray(config.phases)) for (const p of config.phases) phases.push(Object.assign({ src: 'config' }, p));

    // 8) Heure de début des séances (TrainAI)
    const sessionStarts = sessions.filter((s) => s.start).map((s) => ({ d: s.d, h: +s.start.slice(11, 13), min: s.min, vol: s.vol, sets: s.sets }));

    // 9) Dates couvertes
    const allDates = Object.keys(days).sort();
    const exportDates = parts.map((p) => p.exportedAt).filter(Boolean).sort();
    const lastExport = exportDates[exportDates.length - 1] || null;

    const sources = parts.map((p) => {
      let from = null, to = null, n = 0;
      const ds = p.kind === 'health' ? Object.keys(p.days) : p.kind === 'macrofactor' ? [...new Set(Object.keys(p.days).concat(p.exercises.map((e) => e.d), p.muscles.map((m) => m.d)))]
        : p.kind === 'trainai' ? p.sessions.map((s) => s.d) : p.kind === 'coach' ? p.entries.map((e) => e.d)
        : p.kind === 'labs' ? p.labs.map((l) => l.d) : (p.notes || []).map((n) => n.d);
      for (const d of ds) { if (!from || d < from) from = d; if (!to || d > to) to = d; n++; }
      return { kind: p.kind, fileName: p.fileName, exportedAt: p.exportedAt || null, from, to, n, driveId: p.driveId, modifiedTime: p.modifiedTime };
    });

    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      lastExport,
      profile,
      config: Object.assign({}, config, { phases: undefined }),
      sources,
      coverage: {
        health: healthDates.length ? [healthDates[0], healthDates[healthDates.length - 1]] : null,
        from: allDates[0] || null,
        to: allDates[allDates.length - 1] || null,
      },
      days: allDates.map((d) => days[d]),
      workouts,
      exercises: exercises.sort((a, b) => a.d.localeCompare(b.d) || a.n.localeCompare(b.n)),
      muscles: muscles.sort((a, b) => a.d.localeCompare(b.d)),
      targets,
      body: body.sort((a, b) => a.d.localeCompare(b.d)),
      phases: phases.sort((a, b) => a.start.localeCompare(b.start)),
      notes: notes.sort((a, b) => a.d.localeCompare(b.d)),
      jsheet: Object.values(jsheet).sort((a, b) => a.d.localeCompare(b.d)),
      coach,
      labs,
      sessionStarts,
    };
  }

  /**
   * Superpose un jeu de données fraîchement importé (mergeParsed) sur le jeu existant.
   * Les dates couvertes par le nouvel import sont remplacées ; le reste de l'historique est conservé.
   */
  function mergeCoach(a, b) {
    const m = new Map(a.map((e) => [e.d, e]));
    for (const e of b) { const cur = m.get(e.d); if (!cur || (e.rank || 0) >= (cur.rank || 0)) m.set(e.d, e); }
    return [...m.values()].sort((x, y) => x.d.localeCompare(y.d));
  }
  function mergeLabs(a, b) {
    const m = new Map(a.map((l) => [l.d + '|' + l.name.toLowerCase(), l]));
    for (const l of b) m.set(l.d + '|' + l.name.toLowerCase(), l);
    return [...m.values()].sort((x, y) => x.d.localeCompare(y.d) || x.name.localeCompare(y.name));
  }

  function overlayDataset(base, add) {
    if (!base) return add;
    const kinds = new Set(add.sources.map((s) => s.kind));
    const covered = (kind) => {
      const s = add.sources.filter((x) => x.kind === kind && x.from);
      if (!s.length) return null;
      return [s.reduce((m, x) => (x.from < m ? x.from : m), s[0].from), s.reduce((m, x) => (x.to > m ? x.to : m), s[0].to)];
    };
    const inR = (d, r) => r && d >= r[0] && d <= r[1];
    const hR = covered('health'), tR = covered('trainai');
    // MacroFactor : chaque catégorie n'est remplacée que sur la période qu'elle couvre dans le nouvel export
    // (un journal de séances seul ne doit ni dupliquer les exercices ni vider les séries par muscle).
    const spanOf = (arr) => (arr.length ? [arr.reduce((m, x) => (x.d < m ? x.d : m), arr[0].d), arr.reduce((m, x) => (x.d > m ? x.d : m), arr[0].d)] : null);
    const mExR = spanOf(add.exercises.filter((e) => e.s === 'MF'));
    const mMusR = spanOf(add.muscles || []);

    const byDate = new Map(base.days.map((x) => [x.d, Object.assign({}, x)]));
    const MF_KEYS = ['weight', 'weightSrc', 'bodyFat', 'trend', 'tdee', 'kcal', 'prot', 'carb', 'fat', 'fiber', 'alcohol', 'sodium', 'sugar', 'caffeine', 'water', 'lastMeal', 'nutriSrc'];
    for (const n of add.days) {
      const old = byDate.get(n.d) || { d: n.d };
      let merged;
      if (inR(n.d, hR)) {
        // nouvel export Santé pour ce jour : on repart de lui, en conservant les champs MacroFactor existants
        merged = Object.assign({}, n);
        if (!kinds.has('macrofactor')) for (const k of MF_KEYS) if (old[k] != null && (old.weightSrc === 'MF' || old.nutriSrc === 'MF')) merged[k] = old[k];
      } else merged = Object.assign({}, old, n);
      byDate.set(n.d, merged);
    }
    const keepW = (w) => !(w.src === 'Santé' && inR(w.d, hR)) && !(w.src === 'MacroFactor' && inR(w.d, mExR)) && !(w.src === 'TrainAI' && inR(w.d, tR));
    const keepEx = (e) => !(e.s === 'MF' && inR(e.d, mExR)) && !(e.s === 'TA' && inR(e.d, tR));
    let workouts = base.workouts.filter(keepW).concat(add.workouts.filter((w) => !base.workouts.some((b) => keepW(b) && b.d === w.d && b.type === w.type && b.min === w.min)));
    // une séance déduite d'un log MacroFactor n'a lieu d'être que si aucune séance muscu n'est déjà connue ce jour-là
    const strengthDays = new Set(workouts.filter((w) => w.src !== 'MacroFactor' && STRENGTH.has(w.type)).map((w) => w.d));
    const mfSeen = new Set();
    workouts = workouts.filter((w) => {
      if (w.src !== 'MacroFactor') return true;
      if (strengthDays.has(w.d) || mfSeen.has(w.d)) return false;
      mfSeen.add(w.d);
      return true;
    });
    const noteKey = (n) => n.d + '|' + n.text;
    const notes = new Map(base.notes.map((n) => [noteKey(n), n]));
    for (const n of add.notes) notes.set(noteKey(n), n);
    const days = Array.from(byDate.values()).sort((a, b) => a.d.localeCompare(b.d));
    return Object.assign({}, base, {
      generatedAt: add.generatedAt,
      lastExport: [base.lastExport, add.lastExport].filter(Boolean).sort().pop() || null,
      profile: add.profile || base.profile,
      sources: base.sources.concat(add.sources.map((s) => Object.assign({ imported: true }, s))),
      coverage: { health: base.coverage.health, from: days[0].d, to: days[days.length - 1].d },
      days,
      workouts: workouts.sort((a, b) => a.d.localeCompare(b.d)),
      exercises: base.exercises.filter(keepEx).concat(add.exercises).sort((a, b) => a.d.localeCompare(b.d) || a.n.localeCompare(b.n)),
      muscles: mMusR ? base.muscles.filter((m) => !inR(m.d, mMusR)).concat(add.muscles).sort((a, b) => a.d.localeCompare(b.d)) : base.muscles,
      // un export MacroFactor partiel (rapide, granulaire) ne contient ni cibles, ni mensurations, ni phases : on garde l'existant
      targets: add.targets && add.targets.length ? add.targets : base.targets,
      body: add.body && add.body.length ? add.body : base.body,
      phases: add.phases && add.phases.some((p) => p.src !== 'config') ? add.phases.concat(base.phases.filter((p) => p.src === 'config')) : base.phases,
      notes: Array.from(notes.values()).sort((a, b) => a.d.localeCompare(b.d)),
      coach: mergeCoach(base.coach || [], add.coach || []),
      labs: mergeLabs(base.labs || [], add.labs || []),
      jsheet: (() => { const m = new Map((base.jsheet || []).map((e) => [e.d, e])); for (const e of add.jsheet || []) m.set(e.d, e); return [...m.values()].sort((a, b) => a.d.localeCompare(b.d)); })(),
      sessionStarts: tR ? base.sessionStarts.filter((s) => !inR(s.d, tR)).concat(add.sessionStarts) : base.sessionStarts,
    });
  }

  return {
    parseCSV, parseHealthCSV, parseNotesCSV, parseCoachMD, parseLabsCSV, parseMacroFactor, parseTrainAI, parseFile, mergeParsed, overlayDataset,
    coachFileInfo, cleanSensitive, setPrivacyTerms, tagsFrom, slugTag,
    isMacroFactor, isTrainAI, exportDateFromName,
    _internal: { num, range, duration, toISODate, epley },
  };
});
