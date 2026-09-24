# Salle des Machines

Tableau de bord personnel d'entraînement, façon Power BI : filtres croisés, curseur de période, drill-down, insights automatiques. Il agrège les exports **Apple Santé** (via l'app *Health Export*), **MacroFactor** et **TrainAI**, et se met à jour à chaque nouvel export.

## Pages

| Page | Ce qu'on y lit |
|---|---|
| Vue d'ensemble | Tuiles clés (poids tendance, séances, pas, sommeil, récupération, FC repos, HRV, calories, protéines, durée de séance) avec l'écart à la période précédente, insights, calendrier d'activité, poids et phases, répartition des activités, semaine type |
| Entraînement | Volume par type d'activité, durée des séances, split détecté (Push / Pull / Bas du corps / Haut du corps), split par jour de semaine, heure de début, journal des séances |
| Force | Exercices clés, progression par exercice (e1RM, charge max, volume, séries, reps), indice de force, séries par muscle et par semaine vs fourchette cible, carte de chaleur, tableau de tous les exercices |
| Corps & nutrition | Poids, masse grasse, masse maigre, mensurations, calories vs cible vs dépense, macros, protéines par kilo, balance énergétique, écart à la cible par jour |
| Récupération | Score de récupération, sommeil, HRV, FC repos, pas, explorateur et matrice de corrélations, jours de muscu vs jours sans, asymétrie de marche, VO₂max, calories actives |
| Données | Import des nouveaux exports, sources, couverture des données, table journalière, méthode de calcul |

## Filtres

- **Période** : 7 j, 30 j, 90 j, 6 mois, 12 mois, année, tout, dates libres, ou le **curseur de chronologie** sous la barre de filtres.
- **Phase** : saute directement à une phase MacroFactor (sèche, maintien, prise de masse) ou à une phase perso.
- **Jours de la semaine**, **type de jour** (muscu / sans muscu), **activités**, **granularité** (jour / semaine / mois).
- **Filtres croisés** : un clic sur un jour de la semaine, un type d'activité, une barre ou un mois zoome ou filtre tout le rapport. Un clic sur un jour ouvre son détail complet.
- Chaque graphique a une vue **Tableau**.

## Mettre à jour les données

### Option 1 : dans le navigateur (le plus simple)

Page **Données** → glisse les nouveaux exports. Ils sont lus localement, rien n'est envoyé. Les dates couvertes par le nouvel export remplacent les anciennes, le reste de l'historique est conservé, et l'import est mémorisé dans le navigateur.

### Option 2 : en local avec le script de build

```bash
npm install
# dépose les exports dans data/raw/ (Health Export .csv, MacroFactor FULL EXPORT .xlsx, TrainAI .xlsx)
cp config.example.json data/config.json   # puis adapte tes objectifs
npm run build
```

Le build produit :

- `data/dashboard-data.js`, chargé par `index.html` (ouvre simplement `index.html`, ou `npm run serve`) ;
- `dist/sport-dashboard.html`, un fichier unique autonome (code + données) ;
- `dist/artifact.html`, la même page au format Artifact claude.ai.

Plusieurs exports Apple Santé peuvent se chevaucher : pour une date donnée, l'export le plus récent gagne.

## Exports attendus

| Source | Export |
|---|---|
| Apple Santé | App *Health Export* → CSV, agrégation journalière (un fichier par an si besoin). Pour une HRV moyenne exacte, règle l'agrégation de la HRV sur « Moyenne ». |
| MacroFactor | Réglages → Export des données → **Full export** (.xlsx) |
| TrainAI | Export des séances (.xlsx) |
| Journal libre | CSV `Date,Notes` |

## Configuration (`data/config.json`)

Objectifs de pas, sommeil, séances par semaine, protéines par kilo, fourchette de séries par muscle, rythme de poids par phase, exercices clés, échéance affichée en compte à rebours, phases personnalisées. Voir `config.example.json`.

## Confidentialité

Le dépôt est public : **aucune donnée personnelle n'est versionnée**. `data/raw/`, `data/config.json`, `data/dashboard-data.js` et `dist/` sont ignorés par git. Sans données, la page propose l'import.

## Structure

```
index.html            page et gabarit
src/parsers.js        lecture des exports (partagé navigateur / Node)
src/core.js           modèle, filtres, calculs, helpers de graphiques
src/insights.js       insights automatiques
src/pages.js          les six pages du rapport
src/app.js            en-tête, filtres, chronologie, détail du jour, import
src/styles.css        thème clair / sombre
scripts/build.js      build des données et du fichier unique
```

Graphiques : [Apache ECharts](https://echarts.apache.org/) 5.5. Lecture des .xlsx : [SheetJS](https://sheetjs.com/).
