/**
 * Journal « Salle des Machines » — script à coller dans la feuille Google du journal
 * (Extensions → Apps Script), puis exécuter une fois setup().
 *
 * Ce que fait le script :
 *  - setup()  : met la feuille au format du journal (colonnes ci-dessous) en conservant les lignes existantes,
 *               fusionne les anciennes colonnes « Douleur <zone> » dans « Douleurs », crée le dossier
 *               « Journal - entrées » à côté de la feuille et programme ingest() chaque minute ;
 *  - ingest() : intègre les fichiers CSV déposés par le dashboard dans « Journal - entrées »
 *               (une ligne « app » par jour : remplacée si elle existe déjà), puis met ces fichiers à la corbeille ;
 *  - onEdit() : quand tu modifies une ligne à la main, met à jour « Modifié » (la version la plus récente l'emporte
 *               dans le dashboard) et renseigne « manuel » si la source est vide ;
 *  - doPost() : point d'entrée web pour un raccourci Apple ou un scénario Make (Déployer → Application web).
 *
 * Le dashboard ne peut pas écrire directement dans une feuille (le connecteur Google Drive ne modifie que les
 * métadonnées) : il dépose un petit fichier, ce script fait le reste.
 *
 * Douleurs : une seule colonne, au format libre « zone intensité » séparés par des virgules, par exemple
 * « Épaule droite 3, Cheville gauche 2 ». Une nouvelle zone s'écrit simplement : aucune colonne à ajouter.
 */

var HEADERS = ['Date', 'Heure', 'Source', 'Note', 'Tags', 'Humeur', 'Énergie', 'Stress', 'Courbatures', 'Douleurs', 'Modifié'];
var INBOX = 'Journal - entrées';
var TZ = 'Europe/Brussels';

function sheet_() { return SpreadsheetApp.getActive().getSheets()[0]; }
function norm_(h) { return String(h || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function now_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss"); }

/** Colonnes actuelles de la feuille (ajoute celles qui manquent à la fin) → {nomNormalisé: index 1-based} */
function columns_(sh, wanted) {
  var last = Math.max(sh.getLastColumn(), 1);
  var head = sh.getRange(1, 1, 1, last).getDisplayValues()[0];
  var map = {};
  head.forEach(function (h, i) { if (h) map[norm_(h)] = i + 1; });
  (wanted || []).forEach(function (h) {
    if (!map[norm_(h)]) { last = Math.max(sh.getLastColumn(), 0) + 1; sh.getRange(1, last).setValue(h); map[norm_(h)] = last; }
  });
  return map;
}

function setup() {
  var sh = sheet_();
  var data = sh.getDataRange().getDisplayValues();
  var rawHead = data[0] || [];
  var oldHead = rawHead.map(norm_);
  var already = HEADERS.every(function (h) { return oldHead.indexOf(norm_(h)) >= 0; });
  if (!already) {
    // migration : on remet les colonnes existantes (Date, Notes…) sous les nouveaux en-têtes ;
    // les colonnes à toi que le journal ne connaît pas (ex. « Douleurs ») sont gardées à la fin, avec leurs valeurs
    var alias = { notes: 'note', note: 'note', texte: 'note', commentaire: 'note', jour: 'date' };
    var known = HEADERS.map(norm_);
    var extra = [];
    rawHead.forEach(function (h) { var k = norm_(h); if (k && known.indexOf(alias[k] || k) < 0 && extra.indexOf(h) < 0) extra.push(String(h).trim()); });
    var head = HEADERS.concat(extra);
    var rows = data.slice(1).filter(function (r) { return r.join('').trim(); }).map(function (r) {
      var o = {};
      oldHead.forEach(function (h, i) { if (h) o[alias[h] || h] = r[i]; });
      return head.map(function (h) { var k = norm_(h); return k === 'source' ? (o.source || 'manuel') : (o[k] || ''); });
    });
    sh.clear();
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    if (rows.length) sh.getRange(2, 1, rows.length, head.length).setValues(rows);
  }
  sh.setFrozenRows(1);
  // anciennes colonnes « Douleur genou », « Douleur lombaires »… -> colonne unique « Douleurs », placée avant « Modifié »
  migratePains_(sh);
  var cc = columns_(sh, ['Douleurs']);
  if (cc['modifie'] && cc['douleurs'] > cc['modifie']) sh.moveColumns(sh.getRange(1, cc['douleurs']), cc['modifie']);
  // Date, Heure et Modifié en texte : pas de conversion automatique de format
  var c = columns_(sh, HEADERS);
  ['date', 'heure', 'modifie'].forEach(function (k) { sh.getRange(1, c[k], sh.getMaxRows(), 1).setNumberFormat('@'); });
  // dossier de dépôt à côté de la feuille
  var file = DriveApp.getFileById(SpreadsheetApp.getActive().getId());
  var parent = file.getParents().hasNext() ? file.getParents().next() : DriveApp.getRootFolder();
  if (!parent.getFoldersByName(INBOX).hasNext()) parent.createFolder(INBOX);
  // déclencheur chaque minute (les entrées du dashboard apparaissent dans la feuille dans la minute)
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'ingest') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('ingest').timeBased().everyMinutes(1).create();
  ingest();
}

/** « Douleur genou » -> « Genou » */
function zoneLabel_(h) {
  var t = String(h || '').replace(/^\s*douleurs?\s*/i, '').trim().toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Générale';
}

/** Fusionne les colonnes « Douleur <zone> » dans « Douleurs » (« Genou 5, Lombaires 3 »), puis les supprime */
function migratePains_(sh) {
  var last = sh.getLastColumn();
  if (last < 1) return;
  var head = sh.getRange(1, 1, 1, last).getDisplayValues()[0];
  var old = [];
  head.forEach(function (h, i) { if (/^douleurs?\s+\S/.test(norm_(h))) old.push({ i: i + 1, zone: zoneLabel_(h) }); });
  if (!old.length) return;
  var c = columns_(sh, ['Douleurs']);
  var n = sh.getLastRow() - 1;
  if (n > 0) {
    var target = sh.getRange(2, c['douleurs'], n, 1);
    var cur = target.getDisplayValues();
    var cols = old.map(function (o) { return sh.getRange(2, o.i, n, 1).getDisplayValues(); });
    target.setValues(cur.map(function (row, r) {
      var parts = String(row[0] || '').trim() ? [String(row[0]).trim()] : [];
      old.forEach(function (o, j) { var v = String(cols[j][r][0] || '').trim(); if (v !== '' && v !== '-') parts.push(o.zone + ' ' + v); });
      return [parts.join(', ')];
    }));
  }
  old.sort(function (a, b) { return b.i - a.i; }).forEach(function (o) { sh.deleteColumn(o.i); });
}

/** Entrée reçue avec des colonnes « Douleur <zone> » (ancienne version du dashboard) -> « Douleurs » */
function pains_(o) {
  var legacy = Object.keys(o).filter(function (k) { return /^douleurs?\s+\S/.test(norm_(k)); });
  if (!legacy.length) return o;
  var parts = String(o['Douleurs'] || '').trim() ? [String(o['Douleurs']).trim()] : [];
  legacy.forEach(function (k) { var v = String(o[k] == null ? '' : o[k]).trim(); if (v !== '' && v !== '-') parts.push(zoneLabel_(k) + ' ' + v); delete o[k]; });
  o['Douleurs'] = parts.join(', ');
  return o;
}

/** Ajoute ou remplace une ligne. clé « app » : une seule ligne app par date */
function upsert_(sh, obj) {
  var keys = Object.keys(obj);
  var c = columns_(sh, keys);
  var width = sh.getLastColumn();
  var src = String(obj['Source'] || '').toLowerCase();
  var target = 0;
  if (src === 'app' && sh.getLastRow() > 1) {
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, width).getDisplayValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][c['date'] - 1]).trim() === String(obj['Date']).trim() && String(vals[i][c['source'] - 1]).trim().toLowerCase() === 'app') { target = i + 2; break; }
    }
  }
  if (!target) target = sh.getLastRow() + 1;
  var row = target <= sh.getLastRow() ? sh.getRange(target, 1, 1, width).getValues()[0] : new Array(width).fill('');
  keys.forEach(function (k) { row[c[norm_(k)] - 1] = obj[k]; });
  sh.getRange(target, 1, 1, width).setValues([row]);
}

function ingest() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    var sh = sheet_();
    var file = DriveApp.getFileById(SpreadsheetApp.getActive().getId());
    var parent = file.getParents().hasNext() ? file.getParents().next() : DriveApp.getRootFolder();
    var it = parent.getFoldersByName(INBOX);
    if (!it.hasNext()) return;
    var files = it.next().getFiles();
    var todo = [];
    while (files.hasNext()) { var f = files.next(); if (/\.csv$/i.test(f.getName())) todo.push(f); }
    todo.sort(function (a, b) { return a.getName() < b.getName() ? -1 : 1; });
    todo.forEach(function (f) {
      var rows = Utilities.parseCsv(f.getBlob().getDataAsString('UTF-8'));
      var head = rows[0] || [];
      rows.slice(1).forEach(function (r) {
        if (!r.join('').trim()) return;
        var o = {};
        head.forEach(function (h, i) { o[h] = r[i]; });
        if (!o['Modifié']) o['Modifié'] = now_();
        upsert_(sh, pains_(o));
      });
      f.setTrashed(true);
    });
  } finally { lock.releaseLock(); }
}

function onEdit(e) {
  var sh = e.range.getSheet();
  if (sh.getIndex() !== 1 || e.range.getRow() < 2) return;
  var c = columns_(sh, []);
  if (!c['modifie'] || e.range.getColumn() === c['modifie']) return;
  for (var r = e.range.getRow(); r < e.range.getRow() + e.range.getNumRows(); r++) {
    sh.getRange(r, c['modifie']).setValue(now_());
    if (c['source'] && !String(sh.getRange(r, c['source']).getValue()).trim()) sh.getRange(r, c['source']).setValue('manuel');
  }
}

/**
 * Raccourci Apple / Make : POST JSON { key, note, tags, humeur, energie, stress, courbatures, douleurs, source, date, heure },
 * douleurs = « Épaule droite 3, Cheville gauche 2 » ou { "Épaule droite": 3 } (genou et lombaires restent acceptés).
 * Déploiement : Déployer → Nouveau déploiement → Application web (exécuter en tant que moi).
 * La clé se règle dans Paramètres du projet → Propriétés du script → KEY.
 */
function doPost(e) {
  var d = JSON.parse(e.postData.contents || '{}');
  var key = PropertiesService.getScriptProperties().getProperty('KEY');
  if (key && d.key !== key) return ContentService.createTextOutput('refusé');
  var now = new Date();
  var douleurs = d.douleurs || '';
  if (douleurs && typeof douleurs === 'object') douleurs = Object.keys(douleurs).map(function (k) { return k + ' ' + douleurs[k]; }).join(', ');
  if (d.genou) douleurs = (douleurs ? douleurs + ', ' : '') + 'Genou ' + d.genou;
  if (d.lombaires) douleurs = (douleurs ? douleurs + ', ' : '') + 'Lombaires ' + d.lombaires;
  upsert_(sheet_(), {
    'Date': d.date || Utilities.formatDate(now, TZ, 'yyyy-MM-dd'),
    'Heure': d.heure || Utilities.formatDate(now, TZ, 'HH:mm'),
    'Source': d.source || 'raccourci',
    'Note': d.note || '', 'Tags': d.tags || '',
    'Humeur': d.humeur || '', 'Énergie': d.energie || '', 'Stress': d.stress || '', 'Courbatures': d.courbatures || '',
    'Douleurs': douleurs,
    'Modifié': now_(),
  });
  return ContentService.createTextOutput('ok');
}
