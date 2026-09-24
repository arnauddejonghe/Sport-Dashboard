# Salle des Machines

Tableau de bord personnel d'entraînement et de santé, dans l'esprit de Whoop et Bevel PRO : anneaux de récupération, de charge et de sommeil, notes globales, âge biologique, biomarqueurs comparés à ta propre norme, journal, et filtres façon Power BI. Il agrège les exports **Apple Santé** (app *Health Export* ou raccourci « Export Apple Santé »), **MacroFactor**, **TrainAI**, les rapports d'un coach (.md) et des bilans sanguins (.csv), et se met à jour tout seul depuis un dossier Google Drive quand il est ouvert dans claude.ai.

## Pages

| Page | Ce qu'on y lit |
|---|---|
| Aujourd'hui | Récupération, charge (0–21), sommeil et note du jour en anneaux ; biomarqueurs du jour face à ta plage normale ; charge aiguë / chronique ; sommeil des 14 dernières nuits vs besoin ; nutrition du jour ; saisie du journal |
| Vue d'ensemble | Note globale de la période (A+ à E) et ses 6 piliers, leviers qui tirent vers le haut ou freinent, profil radar vs période précédente, bulletin hebdomadaire, calendrier, poids et projection jusqu'à l'échéance, insights |
| Récupération | Score et zones, composantes (HRV, FC repos, respiration, sommeil), HRV / FC / respiration / SpO₂ avec plage normale, sommeil vs besoin, dette et régularité, corrélations, alertes physiologiques |
| Entraînement | Charge quotidienne, ratio aigu / chronique, répartition des charges, volume par activité, durées, split détecté et par jour, heure de début, journal des séances avec la récupération du lendemain |
| Force | Exercices clés, progression (e1RM, records, moyenne, tendance), fiche exercice, indice de force, force relative au poids de corps, records par mois, séries par muscle vs fourchette cible, carte de chaleur |
| Corps & nutrition | Poids tendance et projection, masse grasse, masse maigre, mensurations, énergie (ingéré, cible, dépenses), macros, protéines par kilo, score nutrition, micronutriments vs repères de santé publique, balance |
| Longévité | Âge biologique et rythme de vieillissement, contribution de chaque facteur (avec sources), historique, capacité cardiorespiratoire, 20+ biomarqueurs regroupés, bilans sanguins |
| Journal | Humeur, énergie, stress, courbatures, douleurs, tags d'habitudes ; fil des entrées (journal, retours, coach, notes de séance) ; impact mesuré des habitudes sur la récupération |
| Données | Synchronisation Google Drive, import manuel, sources, couverture, table journalière, méthode détaillée de chaque calcul |

## Lire les graphiques

- Survol : réticule avec la date et la valeur, écart à ta norme (σ), plage normale et composantes du jour.
- **Filtres & analyse** : moyenne 7 j / 28 j, tendance (pente par semaine), plage normale (médiane ± écart robuste des 30 jours précédents), min / max / moyenne.
- Maj + molette pour zoomer, loupe pour sélectionner une zone, vue **Tableau** sur chaque graphique, clic sur un jour pour son détail.
- Période : 7 j à tout l'historique, dates libres, phases MacroFactor ou le curseur de chronologie ; filtres par jour de semaine, type de jour, activité et granularité.

## Mise à jour des données

### Automatique, depuis Google Drive (dans claude.ai)

À chaque ouverture, la page cherche le dossier configuré (`drive.folder`, sous-dossiers compris, sauf « Photos »), télécharge les fichiers nouveaux ou modifiés depuis la dernière synchro, les analyse avec les mêmes parseurs que le build et mémorise le résultat dans le navigateur. La première fois, un bouton **Connecter Google Drive** demande l'accès. Fichiers reconnus :

| Fichier | Reconnu comme |
|---|---|
| `HealthExport_….csv`, `Export_Apple_Sante_….csv` | Apple Santé (journalier) |
| `MacroFactor…xlsx` | MacroFactor (Full export) |
| `TrainAI…xlsx` | TrainAI |
| Feuille Google « Retours… » ou « Journal… » | notes libres (`Date,Notes`) |
| `AAAA-MM-JJ_coach.md` (et `_vN`) | rapport coach : verdict, scores, points forts / faibles ; la version finale du jour l'emporte |
| CSV ou feuille « Bilan… » / « Analyse… » | bilans sanguins `Date;Marqueur;Valeur;Unité;Min;Max` |

Le journal est enregistré dans la base partagée de la page (synchronisé entre tes appareils), ou dans le navigateur hors de claude.ai.

### Manuelle, dans le navigateur

Page **Données** → glisse les exports. Ils sont lus localement, rien n'est envoyé.

### En local, avec le script de build

```bash
npm install
# dépose les exports dans data/raw/ (.csv, .xlsx, rapports coach .md)
cp config.example.json data/config.json   # puis adapte tes objectifs
npm run build
```

Le build produit `data/dashboard-data.js` (chargé par `index.html`), `dist/sport-dashboard.html` (fichier unique autonome) et `dist/artifact.html` (format Artifact claude.ai).

## Algorithmes

| Indicateur | Calcul | Source |
|---|---|---|
| Norme personnelle | médiane ± 1,4826 × écart absolu médian des 30 jours précédents (10 valeurs min.) | statistique robuste |
| Récupération 0–100 | HRV 45 %, FC repos 30 %, sommeil 15 %, respiration 10 %, en écarts à ta norme, convertis par la loi normale | inspiré de Whoop |
| Charge 0–21 | 21 × (1 − e^(−(calories actives + 3 × min de muscu) / 1 100)) | échelle logarithmique façon Whoop |
| Besoin de sommeil | 7 h 30 + charge de la veille + rattrapage de dette (plafond 1 h 30) | |
| Ratio aigu / chronique | moyennes exponentielles 7 j / 28 j, zone optimale 0,8–1,3 | Gabbett, BJSM 2016 |
| Note globale | 6 piliers pondérés (récupération 20, sommeil 20, entraînement 20, nutrition 15, activité 15, corps 10) | |
| Âge biologique | risques relatifs de mortalité publiés, convertis en années par la loi de Gompertz (plafonds ±5 ans par facteur, ±12 au total) | Kodama JAMA 2009 et FRIEND (VO₂max), Zhang CMAJ 2016 (FC repos), Cappuccio Sleep 2010 (sommeil), Paluch Lancet Public Health 2022 (pas), Momma BJSM 2022 (musculation) |
| Impact des habitudes | récupération du lendemain, corrigée de celle du jour même (résidus de régression), test t de Welch, seuil \|t\| ≥ 2,5 | association, pas causalité |
| Projection du poids | pente de régression des 28 derniers jours appliquée au dernier poids tendance, intervalle à 95 % | |

L'âge biologique est un indicateur, pas un diagnostic. Le détail de chaque calcul est affiché dans la page **Données**.

## Configuration (`data/config.json`)

Objectifs (pas, sommeil, séances, protéines par kilo, séries par muscle, rythme de poids par phase), exercices clés, échéance en compte à rebours, phases personnalisées, dossier Drive (`drive.folder`), zones de douleur suivies (`painSites`), tags de journal supplémentaires (`journalTags`), termes à masquer dans les rapports coach (`privacy.hideTerms`, expressions régulières). Voir `config.example.json`.

## Confidentialité

Le dépôt est public : **aucune donnée personnelle n'est versionnée**. `data/raw/`, `data/config.json`, `data/dashboard-data.js` et `dist/` sont ignorés par git. Des rapports du coach, seuls le verdict, les scores et les points forts / faibles sont repris ; toute phrase contenant un terme médical ou un terme de `privacy.hideTerms` est retirée avant l'affichage.

## Structure

```
index.html              coque de la page (navigation, filtres, chronologie)
src/parsers.js          lecture des exports (partagé navigateur / Node)
src/core.js             modèle, filtres, helpers de graphiques (séries, bandes, tendances)
src/scores.js           normes personnelles, scores, notes, âge biologique, biomarqueurs, impacts, projection
src/insights.js         insights automatiques
src/journal.js          journal (base partagée ou navigateur)
src/drive.js            synchronisation Google Drive
src/pages/*.js          les neuf pages
src/app.js              navigation, filtres, chronologie, détail du jour, import, persistance
src/styles.css          thème sombre
scripts/build.js        build des données et du fichier unique
```

Graphiques : [Apache ECharts](https://echarts.apache.org/) 5.5. Lecture des .xlsx : [SheetJS](https://sheetjs.com/).
