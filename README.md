# Salle des Machines

Tableau de bord personnel d'entraînement et de santé, dans l'esprit de Whoop et Bevel PRO : anneaux de récupération, de charge et de sommeil, notes globales, âge biologique, biomarqueurs comparés à ta propre norme, journal, et filtres façon Power BI. Il agrège les exports **Apple Santé** (app *Health Export* ou raccourci « Export Apple Santé »), **MacroFactor**, **TrainAI**, les rapports d'un coach (.md) et des bilans sanguins (.csv), et se met à jour tout seul depuis un dossier Google Drive quand il est ouvert dans claude.ai.

## Pages

| Page | Ce qu'on y lit |
|---|---|
| Bilan quotidien | **Plan du jour** : séance du programme MacroFactor (exercices, séries × reps, RIR, charge visée, dernière fois), feu vert / prudence / allège selon ta nuit, zone d’effort visée, créneau dans l’agenda Google, cibles (calories, protéines, hydratation, pas, coucher), muscles, semaine à venir, effort prévu vs réalisé ; puis le **bilan** de la dernière journée complète : note du jour neutre, récupération, sommeil, effort musculation, biomarqueurs, nutrition et hydratation, journal |
| Journal | Note libre, #tags (créables et masquables), ressenti facultatif ; fil des entrées (journal, feuille Drive, coach, notes de séance) ; impact des habitudes sur la récupération du lendemain |
| Vue d'ensemble | Note globale de la période (A+ à E) et ses 6 piliers, leviers, profil radar, bulletin hebdomadaire, calendrier, insights |
| Physique | Poids, masse grasse et masse maigre sur un seul graphique (courbes au choix, tendances et projections), les 19 mensurations avec écarts et symétrie, ratios (taille/hauteur, épaules/taille), photos avant / après aux dates choisies, ce qui fait bouger poids, masse grasse et force |
| Force | Exercices clés (modifiables), progression (e1RM, records, tendance), RIR, indice de force, force relative, volume par muscle direct / indirect en comptage fractionné ou plein face au prévu du programme, fréquence, tonnage, carte de chaleur |
| Entraînement | Charge 0–100, ratio aigu / chronique, répartition des charges, volume par activité, durées, split, heure de début, journal des séances |
| Récupération | Score et zones, composantes, HRV / FC / respiration / SpO₂ avec plage normale, sommeil vs besoin, dette et régularité, explorateur de corrélations commenté, alertes |
| Nutrition | Calories vs cible et dépense, macros, protéines par kilo, score, régularité du suivi, balance, micronutriments, hydratation |
| Longévité | Âge biologique et rythme de vieillissement, facteurs sourcés, 20+ biomarqueurs, bilans sanguins |
| Données | Synchronisation Google Drive, import manuel, sources, couverture, méthode détaillée de chaque calcul |

## Apparence

- **Thème clair ou sombre** : automatique (suit le réglage du système), ou forcé avec le sélecteur ☀ / 🖥 / ☾ en bas de la barre latérale (dans « Plus » sur téléphone). Le choix est mémorisé dans le navigateur ; les graphiques se redessinent aux couleurs du thème.
- **Cartes façon cartes santé** (Apple Santé, Whoop, Oura) : icône teintée et libellé, grande valeur, état (pastille avec pictogramme : ✓ bon, ! à surveiller, × alerte), écart à la période précédente, tendance ou jauge.
- **Lisibilité** : police Inter, titres en casse normale, textes secondaires contrastés (AA). Les sous-titres méthodologiques longs sont repliés sur deux lignes : « Détails » les déplie.
- **Téléphone** : barre d'onglets en bas (Aujourd'hui, Journal, Résultats, Physique, Plus), semaine à venir en carrousel, détail du jour en panneau glissant.
- **Couleurs** : chaque pilier garde sa couleur (récupération, sommeil, entraînement, activité, nutrition, corps) ; palettes vérifiées pour les daltoniens (écarts de couleur entre voisins) et le contraste, en clair comme en sombre. Les couleurs de statut (vert, ambre, rouge) sont réservées aux états.

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
| `MacroFactor…xlsx` ou `MacroFactor…csv` | MacroFactor : export complet (historique), rapide (7 derniers jours, journal de séries avec RIR) ou granulaire (.xlsx ou .csv, un onglet par fichier, reconnu à ses en-têtes) |
| `TrainAI…xlsx` | TrainAI |
| Feuille Google ou CSV « Retours… » / « Journal… » | journal : `Date,Notes`, ou colonnes au choix `Date, Heure, Note, Tags, Humeur, Énergie, Stress, Courbatures, Douleur <zone>` (plusieurs lignes par jour regroupées, #tags repérés dans le texte) |
| Sous-dossier « Photos » | photos avant / après (`AAAA-MM-JJ_face.jpg`, `_profil`, `_dos`), lues à la demande, jamais copiées |
| `AAAA-MM-JJ_coach.md` (et `_vN`) | rapport coach : verdict, scores, points forts / faibles ; la version finale du jour l'emporte |
| CSV ou feuille « Bilan… » / « Analyse… » | bilans sanguins `Date;Marqueur;Valeur;Unité;Min;Max` |

Le journal est enregistré dans la base partagée de la page (synchronisé entre tes appareils) et **copié dans ta feuille Google du journal**, qui reste la référence éditable à la main. Le connecteur Google Drive ne peut pas modifier le contenu d'une feuille : la page dépose un petit CSV dans le sous-dossier « Journal - entrées », et le script [`scripts/journal-sheet.gs`](scripts/journal-sheet.gs), collé une fois dans la feuille (Extensions → Apps Script, puis exécuter `setup()`), met la feuille au format du journal, intègre ces fichiers toutes les 5 minutes (une ligne « app » par jour), horodate tes modifications manuelles (la version la plus récente l'emporte dans le dashboard) et reçoit les envois d'un raccourci Apple ou de Make (`doPost`, déployé en application web).

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
| Effort musculation | séries de travail pondérées par le RIR (0 → 1 ; 2 → 0,85 ; 4 → 0,5), zones = quartiles de tes séances des 6 derniers mois, prévu (programme) vs réalisé | Robinson et al., Sports Med 2024 (proximité de l'échec) |
| Plan du jour | programme MacroFactor suivi en séquence ; charge visée = e1RM récent ramené à la fourchette et au RIR prévus, calée sur une charge déjà utilisée ; feu selon la nuit (zones 67 / 34), le sommeil, les alertes et les douleurs du journal | |
| Note du jour | moyenne à poids égaux des % de cibles : sommeil, entraînement (réalisé ÷ prévu), nutrition (calories ±5 %, protéines), pas, hydratation ; la récupération (état) est hors note | |
| Hydratation | 35 ml/kg + 0,5 L par heure de musculation ; boissons = eau Apple Santé au-delà de l'eau des aliments synchronisée par MacroFactor | EFSA 2010 |
| Charge 0–100 | 100 × (1 − e^(−(calories actives + 3 × min de muscu) / 1 100)) : < 50 légère, 50–69 modérée, 70–84 élevée, ≥ 85 très élevée | échelle à rendement décroissant, inspirée de Whoop |
| Besoin de sommeil | base personnelle (médiane des nuits suivies d'un bon état HRV / FC repos, bornée 7 h – 8 h 30) + charge de la veille (max. 30 min) + rattrapage de 25 % du manque des 3 nuits (max. 45 min) | Watson et al., Sleep 2015 (≥ 7 h chez l'adulte) |
| Volume par muscle | séries effectives = directes + ½ indirectes ; chiffres MacroFactor quand ils existent | Pelland et al. 2024 (comptage fractionné) |
| e1RM | Epley sur la meilleure série de travail, poids d'un haltère | |
| Séries (journal MacroFactor) | échauffements exclus ; dégressive ou myo-reps = 1 série, paire gauche / droite = 1 série, série à 0 rép. comptée | identique aux totaux MacroFactor (894 exercices-jours vérifiés) |
| Leviers du physique | corrélations par semaine (≥ 26 semaines) entre habitudes et variation du poids, de la masse grasse, de la force | association, pas causalité |
| Ratio aigu / chronique | moyennes exponentielles 7 j / 28 j, zone optimale 0,8–1,3 | Gabbett, BJSM 2016 |
| Note globale | 5 piliers à poids égaux (sommeil, entraînement, nutrition, activité, corps) ; récupération affichée hors note | |
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
src/journal.js          journal (base partagée ou navigateur, copie vers la feuille Drive)
src/plan.js             plan du jour : programme, charges visées, état du matin, muscles, semaine, créneaux
src/cal.js              agenda Google (lecture seule)
src/muscles.js          exercices → muscles, volume direct / indirect
src/drive.js            synchronisation Google Drive, photos à la demande
src/pages/*.js          les dix pages
src/app.js              navigation, filtres, chronologie, détail du jour, import, persistance
src/styles.css          thème clair et sombre (tokens de couleur), cartes, navigation
scripts/build.js        build des données et du fichier unique
scripts/journal-sheet.gs  script Apps Script de la feuille du journal
```

Graphiques : [Apache ECharts](https://echarts.apache.org/) 5.5. Lecture des .xlsx : [SheetJS](https://sheetjs.com/). Police : [Inter](https://rsms.me/inter/) (Google Fonts).
