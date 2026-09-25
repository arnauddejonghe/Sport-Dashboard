/**
 * Journal « Salle des Machines » — script à coller dans la feuille Google du journal
 * (Extensions → Apps Script), puis exécuter une fois setup().
 *
 * Ce que fait le script :
 *  - setup()  : met la feuille au format du journal (colonnes ci-dessous) en conservant les lignes existantes,
 *               crée le dossier « Journal - entrées » à côté de la feuille et programme ingest() toutes les 5 minutes ;
 *  - ingest() : intègre les fichiers CSV déposés par le dashboard dans « Journal - entrées »
 *               (une ligne « app » par jour : remplacée si elle existe déjà), puis met ces fichiers à la corbeille ;
 *  - onEdit() : quand tu modifies une ligne à la main, met à jour « Modifié » (la version la plus récente l'emporte
 *               dans le dashboard) et renseigne « manuel » si la source est vide ;
 *  - doPost() : point d'entrée web pour un raccourci Apple ou un scénario Make (Déployer → Application web).
 *
 * Le dashboard ne peut pas écrire directement dans une feuille (le connecteur Google Drive ne modifie que les
 * métadonnées) : il dépose un petit fichier, ce script fait le reste.
 */

var HEADERS = ['Date', 'Heure', 'Source', 'Note', 'Tags', 'Humeur', 'Énergie', 'Stress', 'Courbatures', 'Douleur genou', 'Douleur lombaires', 'Modifié'];
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
  var oldHead = (data[0] || []).map(norm_);
  var already = HEADERS.every(function (h) { return oldHead.indexOf(norm_(h)) >= 0; });
  if (!already) {
    // migration : on remet les colonnes existantes (Date, Notes…) sous les nouveaux en-têtes
    var alias = { notes: 'note', note: 'note', texte: 'note', commentaire: 'note', jour: 'date' };
    var rows = data.slice(1).filter(function (r) { return r.join('').trim(); }).map(function (r) {
      var o = {};
      oldHead.forEach(function (h, i) { o[alias[h] || h] = r[i]; });
      return HEADERS.map(function (h) { var k = norm_(h); return k === 'source' ? (o.source || 'manuel') : (o[k] || ''); });
    });
    sh.clear();
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    if (rows.length) sh.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  }
  sh.setFrozenRows(1);
  // Date, Heure et Modifié en texte : pas de conversion automatique de format
  var c = columns_(sh, HEADERS);
  ['date', 'heure', 'modifie'].forEach(function (k) { sh.getRange(1, c[k], sh.getMaxRows(), 1).setNumberFormat('@'); });
  // dossier de dépôt à côté de la feuille
  var file = DriveApp.getFileById(SpreadsheetApp.getActive().getId());
  var parent = file.getParents().hasNext() ? file.getParents().next() : DriveApp.getRootFolder();
  if (!parent.getFoldersByName(INBOX).hasNext()) parent.createFolder(INBOX);
  // déclencheur toutes les 5 minutes
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'ingest') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('ingest').timeBased().everyMinutes(5).create();
  ingest();
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
        upsert_(sh, o);
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
 * Raccourci Apple / Make : POST JSON { key, note, tags, humeur, energie, stress, courbatures, genou, lombaires, source, date, heure }.
 * Déploiement : Déployer → Nouveau déploiement → Application web (exécuter en tant que moi).
 * La clé se règle dans Paramètres du projet → Propriétés du script → KEY.
 */
function doPost(e) {
  var d = JSON.parse(e.postData.contents || '{}');
  var key = PropertiesService.getScriptProperties().getProperty('KEY');
  if (key && d.key !== key) return ContentService.createTextOutput('refusé');
  var now = new Date();
  upsert_(sheet_(), {
    'Date': d.date || Utilities.formatDate(now, TZ, 'yyyy-MM-dd'),
    'Heure': d.heure || Utilities.formatDate(now, TZ, 'HH:mm'),
    'Source': d.source || 'raccourci',
    'Note': d.note || '', 'Tags': d.tags || '',
    'Humeur': d.humeur || '', 'Énergie': d.energie || '', 'Stress': d.stress || '', 'Courbatures': d.courbatures || '',
    'Douleur genou': d.genou || '', 'Douleur lombaires': d.lombaires || '',
    'Modifié': now_(),
  });
  return ContentService.createTextOutput('ok');
}
