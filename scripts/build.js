#!/usr/bin/env node
/*
 * Génère le jeu de données du dashboard à partir des exports déposés dans data/raw/.
 *
 *   node scripts/build.js            -> data/dashboard-data.js + dist/sport-dashboard.html
 *
 * - data/dashboard-data.js     : chargé par index.html (usage local, double-clic suffit)
 * - dist/sport-dashboard.html  : fichier unique autonome (données + code inclus), à ouvrir ou partager en privé
 * - dist/artifact.html         : même page sans <html>/<head>/<body> (format attendu par les Artifacts claude.ai)
 *
 * Ces trois fichiers contiennent des données personnelles : ils sont ignorés par git.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const P = require('../src/parsers.js');

const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const OUT_DATA = path.join(ROOT, 'data', 'dashboard-data.js');
const DIST = path.join(ROOT, 'dist');

function readConfig() {
  for (const f of ['data/config.json', 'config.example.json']) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) {
      console.log(`• config : ${f}`);
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  }
  return {};
}

function main() {
  if (!fs.existsSync(RAW)) {
    console.error(`Dossier introuvable : ${path.relative(ROOT, RAW)} — dépose-y tes exports puis relance.`);
    process.exit(1);
  }
  const files = fs.readdirSync(RAW).filter((f) => /\.(csv|xlsx|md)$/i.test(f) && !f.startsWith('~$')).sort();
  if (!files.length) {
    console.error('Aucun export .csv/.xlsx/.md dans data/raw/.');
    process.exit(1);
  }
  const config = readConfig();
  P.setPrivacyTerms((config.privacy || {}).hideTerms);
  const parts = [];
  for (const f of files) {
    const full = path.join(RAW, f);
    try {
      const file = /\.(csv|md)$/i.test(f)
        ? { name: f, text: fs.readFileSync(full, 'utf8') }
        : { name: f, buffer: fs.readFileSync(full) };
      const p = P.parseFile(file, XLSX);
      parts.push(p);
      const n = p.kind === 'health' ? `${Object.keys(p.days).length} jours, ${p.workouts.length} séances`
        : p.kind === 'macrofactor' ? [Object.keys(p.days).length ? `${Object.keys(p.days).length} jours` : '', (p.sessions || []).length ? `${p.sessions.length} séances` : '', `${p.exercises.length} lignes exercice`].filter(Boolean).join(', ')
        : p.kind === 'trainai' ? `${p.sessions.length} séances, ${p.exercises.length} lignes exercice`
        : p.kind === 'coach' ? `rapport du ${p.entries[0].d}`
        : p.kind === 'labs' ? `${p.labs.length} résultats`
        : `${(p.notes || []).length} notes`;
      console.log(`✓ ${p.kind.padEnd(11)} ${f}  (${n})`);
    } catch (e) {
      console.warn(`✗ ignoré : ${f} — ${e.message}`);
    }
  }
  const data = P.mergeParsed(parts, config);
  // la page a besoin des termes privés pour filtrer les rapports coach synchronisés depuis Drive,
  // mais ils ne sont pas écrits en clair dans son code source
  const pv = data.config && data.config.privacy;
  if (pv && Array.isArray(pv.hideTerms)) data.config.privacy = { hideTermsB64: Buffer.from(JSON.stringify(pv.hideTerms), 'utf8').toString('base64') };
  const json = JSON.stringify(data);
  fs.writeFileSync(OUT_DATA, `/* Généré par scripts/build.js — données personnelles, ne pas committer */\nwindow.SD_DATA = ${json};\n`);
  console.log(`→ ${path.relative(ROOT, OUT_DATA)}  (${(json.length / 1024).toFixed(0)} Ko, ${data.days.length} jours ${data.coverage.from} → ${data.coverage.to})`);

  // Fichier unique autonome
  fs.mkdirSync(DIST, { recursive: true });
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const inline = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/<\/script/gi, '<\\/script');
  let single = html
    .replace(/<link rel="stylesheet" href="src\/styles\.css">/, () => `<style>\n${fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8')}\n</style>`)
    .replace(/<script src="data\/dashboard-data\.js"><\/script>/, () => `<script>window.SD_DATA = ${json.replace(/<\//g, '<\\/')};</script>`)
    .replace(/<script src="(src\/[\w\/.-]+\.js)"><\/script>/g, (_, rel) => `<script>\n${inline(rel)}\n</script>`)
    // le secours local (node_modules) n'existe pas hors du dépôt ; le secours cdnjs reste
    .replace(/<script>window\.echarts\|\|document\.write\('<script src="node_modules[^\n]*<\/script>\n?/, '');
  fs.writeFileSync(path.join(DIST, 'sport-dashboard.html'), single);

  // Variante Artifact : contenu du <head> (hors meta) + contenu du <body>
  const head = (single.match(/<head>([\s\S]*?)<\/head>/) || [])[1] || '';
  const body = (single.match(/<body[^>]*>([\s\S]*)<\/body>/) || [])[1] || '';
  const headClean = head.replace(/<meta[^>]*>\s*/g, '');
  fs.writeFileSync(path.join(DIST, 'artifact.html'), headClean.trim() + '\n' + body.trim() + '\n');
  console.log(`→ dist/sport-dashboard.html (${(single.length / 1024).toFixed(0)} Ko) et dist/artifact.html`);
}

main();
