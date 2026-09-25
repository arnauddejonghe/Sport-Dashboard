/* Page « Données » : synchronisation Drive, import manuel, sources, couverture, table journalière, méthode. */
(function () {
  'use strict';
  const SD = window.SD;
  const { isNum, nf, fH, fHM, fdM, fdate, esc, chart, base, tipBox, xCat } = SD;
  const { card, setHTML, setText } = SD.ui;
  let page = 1, sort = { k: 'd', dir: -1 };

  const COLS = [
    ['d', 'Date', (x) => fdate(x.d, { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' }), 0],
    ['rec', 'Récup', (x) => nf(x.rec, 0), 1], ['strain', 'Charge', (x) => nf(x.strain, 0), 1], ['sleepH', 'Sommeil', (x) => fH(x.sleepH), 1],
    ['hrv', 'HRV', (x) => nf(x.hrv, 0), 1], ['rhr', 'FC repos', (x) => nf(x.rhr, 0), 1], ['resp', 'Resp.', (x) => nf(x.resp, 1), 1],
    ['steps', 'Pas', (x) => nf(x.steps, 0), 1], ['weight', 'Pesée', (x) => nf(x.weight, 2), 1], ['trendW', 'Tendance', (x) => nf(x.trendW, 2), 1],
    ['kcal', 'kcal', (x) => nf(x.kcal, 0), 1], ['prot', 'Prot.', (x) => nf(x.prot, 0), 1],
    ['split', 'Séance', (x) => x.split || (x.w.length ? x.w.map((w) => w.type).join(', ') : ''), 0], ['phase', 'Phase', (x) => x.phase || '', 0],
  ];

  const data = {
    id: 'data', title: 'Données', sub: 'D’où viennent les chiffres, comment ils sont calculés, et comment les mettre à jour.',
    html() {
      return `<section class="card c6"><div class="card-h"><div><h2>Synchronisation Google Drive</h2><p class="sub">À chaque ouverture, le dashboard cherche tes nouveaux exports dans ton dossier de suivi.</p></div></div><div id="sync-page"></div>
          <p class="note">Fichiers reconnus : Health Export ou raccourci Apple Santé (.csv) ; MacroFactor (.xlsx ou .csv) : export complet, rapide (7 derniers jours, avec le journal de séries et le RIR) ou granulaire (journal de séries complet recommandé) ; TrainAI (.xlsx) ; feuille ou CSV « Journal… » / « Retours… » (colonnes Date, Heure, Source, Note, Tags, Humeur, Énergie, Stress, Courbatures, Douleur &lt;zone&gt;, Modifié ; plusieurs lignes par jour possibles ; le script <code>scripts/journal-sheet.gs</code> y intègre les saisies du dashboard) ; rapports « AAAA-MM-JJ_coach.md » ; bilans « Bilan… » (Date;Marqueur;Valeur;Unité;Min;Max) ; photos dans le sous-dossier « Photos » (AAAA-MM-JJ_face.jpg, _profil, _dos), lues à la demande.</p></section>
        <section class="card c6"><div class="card-h"><div><h2>Import manuel</h2><p class="sub">Glisse des exports : ils sont lus dans ton navigateur, rien n’est envoyé.</p></div></div>
          <label class="drop" id="drop" for="file-in"><input type="file" id="file-in" multiple accept=".csv,.xlsx,.md"><strong>Glisse tes fichiers ici</strong> ou clique pour les choisir</label>
          <ul class="log" id="import-log"></ul><div id="import-banner"></div></section>
        <section class="card c12"><div class="card-h"><div><h2>Sources chargées</h2><p class="sub" id="src-sub"></p></div></div><div class="tbl-wrap tbl-scroll" id="src-b" style="max-height:300px"></div></section>
        ${card('c12', 'dt-cov', 'Couverture des données', 'Part des jours du mois où la mesure existe', '', { h: 'tall' })}
        ${card('c12', 'dt-tbl', 'Données journalières', 'Filtres actifs appliqués · clic sur une ligne pour le détail', '', { table: false, body: '<div class="tbl-wrap tbl-scroll" id="dt-tbl-b" style="max-height:560px"></div><button type="button" class="link" id="dt-more" hidden>Afficher plus</button>' })}
        <section class="card c12"><div class="card-h"><div><h2>Méthode</h2><p class="sub">Comment chaque indicateur est calculé</p></div></div><dl class="method">
          <dt>Normes personnelles</dt><dd>Pour chaque mesure, médiane et écart robuste (1,4826 × écart absolu médian) des 30 jours précédents, avec au moins 10 valeurs. La « plage normale » affichée sur les graphiques est médiane ± 1 écart ; « σ » exprime l’écart du jour dans cette unité.</dd>
          <dt>Récupération (0–100)</dt><dd>HRV (45 %), FC au repos inversée (30 %), performance du sommeil (15 %) et fréquence respiratoire inversée (10 %), chacune en écart à ta norme. Le composite suit une loi normale et est converti par Φ : vert ≥ 67, jaune 34–66, rouge ≤ 33, comme chez Whoop.</dd>
          <dt>Charge (0–100)</dt><dd>100 × (1 − e^(−charge / 1 100)), où charge = calories actives + 3 × minutes de musculation. Échelle à rendement décroissant : chaque point coûte plus d’effort que le précédent, 100 = effort maximal. Repères : &lt; 50 légère, 50–69 modérée, 70–84 élevée, ≥ 85 très élevée. Charge conseillée = 38 + 0,48 × récupération (± 7).</dd>
          <dt>Sommeil</dt><dd>Besoin = <b>base personnelle</b> + charge de la veille + rattrapage. La base est la médiane de tes nuits des 90 jours précédents qui ont été suivies d’un bon état du système nerveux (HRV haute et FC de repos basse par rapport à ta norme), bornée entre 7 h (minimum recommandé chez l’adulte, Watson et al., Sleep 2015) et 8 h 30 ; sans assez de données, la cible de la configuration. Charge de la veille : +0,6 min par point au-delà de 50 (max. 30 min). Rattrapage : 25 % du manque des 3 nuits précédentes par rapport à la base (max. 45 min). La dette sur 7 nuits se calcule par rapport à la base, pas au besoin ajusté. Performance = sommeil ÷ besoin. Régularité = 100 − écart-type de la durée (min) × 0,83 sur 7 nuits.</dd>
          <dt>Effort musculation</dt><dd>Séries efficaces d’une séance = somme des séries de travail pondérées par leur proximité de l’échec (RIR 0 → 1 ; 1 → 0,95 ; 2 → 0,85 ; 3 → 0,7 ; 4 → 0,5 ; 5 et plus → 0,3 ; RIR inconnu → 0,8), d’après les méta-régressions dose-réponse (Robinson et al., Sports Medicine 2024 : l’hypertrophie augmente à mesure que les séries se rapprochent de l’échec). Séries dures = RIR ≤ 3. Zones = quartiles de tes propres séances des 6 derniers mois (légère, modérée, soutenue, élevée). L’effort prévu d’une séance du programme se calcule de la même façon à partir des séries et RIR prévus. Ce repère remplace la charge cardiaque pour la musculation : la fréquence cardiaque suit mal l’effort d’une série lourde.</dd>
          <dt>Plan du jour</dt><dd>Séance : programme actif MacroFactor (onglet « Active Program » de l’export rapide), suivi en séquence — chaque séance « Programme (Jour) » réalisée coche le prochain jour du même nom, chaque jour sans séance consomme un repos prévu, jamais une séance (elle reste à faire). Charge visée : force estimée (Epley) la plus haute des 2 dernières séances de moins de 60 jours, ramenée au milieu-bas de la fourchette au RIR prévu, puis calée sur une charge que tu as déjà utilisée (±6 %). Feu : récupération de la nuit (zones ≥ 67 / 34–66 / &lt; 33), nuit &lt; 5 h ou &lt; besoin − 1 h 15, manque de sommeil ≥ 5 h sur 7 nuits, alerte physiologique, douleur ≥ 4/10 notée au journal sur une zone sollicitée. Créneau : premier créneau libre de l’agenda (6 h 30–21 h 30) assez long pour la séance + 20 min de trajet, le plus proche de ton heure habituelle. Coucher : réveil (configuration) − besoin de sommeil − 15 min.</dd>
          <dt>Hydratation</dt><dd>Cible = 35 ml/kg de poids tendance + 0,5 L par heure de musculation (repère d’eau totale ; EFSA 2010 : ~2,5 L/j chez l’homme adulte, aliments compris). Apple Santé contient l’eau des aliments synchronisée par MacroFactor : seules les quantités au-delà (boissons notées) comptent comme boissons.</dd>
          <dt>Note du jour</dt><dd>Moyenne à <b>poids égaux</b> de ce qui dépend de toi, chaque composante = % de ta propre cible (plafonné à 100) : sommeil (nuit ÷ besoin personnel), entraînement (séries efficaces réalisées ÷ prévues par le programme, sinon ÷ ta séance médiane ; jours de séance seulement), nutrition (calories à ±5 % de la cible MacroFactor = 100 puis −5 pts par % d’écart, et protéines ÷ cible), pas (÷ objectif), hydratation (quand des boissons sont notées). La récupération est un état : elle guide la séance, elle n’entre pas dans la note.</dd>
          <dt>Note globale</dt><dd>Moyenne à poids égaux de 5 piliers : sommeil (performance moyenne), entraînement (moyenne de l’assiduité, séances ÷ objectif, et de l’effort réalisé ÷ prévu), nutrition (score moyen des jours loggés, réduit si moins de 80 % des jours sont loggés), activité (pas ÷ objectif), corps (rythme du poids tendance vs cible de phase). La récupération est affichée à part, hors note. Lettres : A+ ≥ 90, A ≥ 80, B ≥ 70, C ≥ 60, D ≥ 50, E en dessous.</dd>
          <dt>Charge aiguë / chronique</dt><dd>Moyennes exponentielles de la charge sur 7 et 28 jours. Zone optimale 0,8–1,3, vigilance 1,3–1,5, risque au-delà (Gabbett, BJSM 2016).</dd>
          <dt>Âge biologique</dt><dd>Âge réel + somme des effets de 5 facteurs sur 90 jours. Chaque risque relatif publié est converti en années par la loi de Gompertz (8 ans pour doubler le risque) : VO₂max vs médiane FRIEND de ton âge, −13 % par MET (Kodama, JAMA 2009) ; FC au repos, +9 % par 10 bpm au-delà de 70 (Zhang, CMAJ 2016) ; sommeil, court 1,12 et long 1,30 (Cappuccio, Sleep 2010) ; pas, quartiles de Paluch (Lancet Public Health 2022) vs 6 000 pas ; musculation, 0,83 à 30–60 min/sem, atténué au-delà de 140 min (Momma, BJSM 2022). Chaque facteur est plafonné à ±5 ans, le total à ±12 ans. Indicatif, pas un diagnostic.</dd>
          <dt>Alertes</dt><dd>FC au repos ≥ +2 σ, HRV ≤ −2 σ, respiration ≥ +2 σ ou SpO₂ &lt; 93 %. Deux signaux ou plus le même jour = alerte forte.</dd>
          <dt>Impact des habitudes</dt><dd>Récupération du lendemain avec et sans l’habitude (tags du journal et habitudes détectées dans les données), corrigée de la récupération du jour même : on compare les résidus de la régression récup(J+1) = a + b × récup(J), car on s’entraîne plus dur les jours où l’on est déjà bien récupéré. Test t de Welch ; « écart net » si |t| ≥ 2,5 et au moins 8 jours avec l’habitude (seuil relevé car une dizaine d’habitudes sont testées en même temps). Une association n’est pas une preuve de cause.</dd>
          <dt>Projection du poids</dt><dd>Pente de la régression linéaire du poids tendance sur les 28 derniers jours, appliquée à partir du dernier poids tendance jusqu’à l’échéance. L’incertitude (95 %) combine l’erreur sur la pente, le bruit autour de la tendance et une dérive possible de 0,05 kg/sem par semaine d’horizon.</dd>
          <dt>Poids et pesées</dt><dd>Trend Weight MacroFactor quand il existe, sinon moyenne exponentielle à 10 % des pesées. Les pesées d’une autre personne ou d’un enfant sur la balance sont écartées (écart > 4 kg ou 6 % avec la médiane des pesées retenues). La balance était partagée en 2022 : les poids de cette année restent moins fiables.</dd>
          <dt>HRV, FC, sommeil</dt><dd>L’export Apple Santé donne la HRV en plage min–max du jour : le milieu de plage sert d’indicateur de tendance (biaisé vers le haut). FC au repos = valeur la plus basse du jour. Nuit rattachée au jour du réveil ; nuits de moins de 3 h exclues.</dd>
          <dt>Séances et e1RM</dt><dd>Une séance de musculation = un entraînement « Musculation » Apple Santé (sinon TrainAI ou un log MacroFactor) ; doublons fusionnés ; séances de plus de 3 h exclues des durées. e1RM = formule d’Epley sur la meilleure série (poids × (1 + reps / 30)), pour MacroFactor comme pour TrainAI, avec le poids d’un seul haltère pour les exercices à deux haltères (le « 1-RM » affiché par MacroFactor est lissé par l’app et ne se compare pas à une série réelle). Séries de travail uniquement (échauffements exclus), comptées comme MacroFactor : une série dégressive ou myo-reps compte pour une série, une paire gauche / droite aussi, une série à 0 répétition compte. RIR moyen et séries à l’échec (RIR 0 ou « Failure Set ») quand l’export contient le journal de séries ; durée de séance MacroFactor quand Apple Santé n’a pas enregistré la séance. Record = e1RM au-dessus de tout l’historique de l’exercice.</dd>
          <dt>Volume par muscle</dt><dd>Séries effectives = séries directes + ½ série pour chaque série où le muscle assiste (même convention que MacroFactor et que le comptage fractionné de la méta-régression de Pelland et al., 2024). Les jours où MacroFactor fournit ses chiffres par muscle, ce sont eux qui font foi ; sinon (historique TrainAI) une table exercice → muscles principaux et secondaires. Séries directes = exercices dont le muscle est le moteur principal ; apport indirect = effectives − directes. Tonnage = charge × répétitions, même règle. Cible par défaut : 10 à 20 séries effectives par semaine et par muscle, idéalement réparties sur 2 séances ou plus.</dd>
          <dt>Leviers du physique</dt><dd>Analyse par semaine (lundi → dimanche, au moins 4 jours complets) sur au moins 26 semaines. Résultats : variation du poids tendance la semaine suivante (le poids tendance réagit avec retard), variation de la masse grasse de la balance la semaine suivante, et force = e1RM de la semaine par rapport à la moyenne des 6 semaines précédentes, exercice par exercice. Pour chaque facteur : corrélation de Pearson, t = r × √((n − 2) / (1 − r²)), lien « net » si |t| ≥ 2,5 ; comparaison du tiers de semaines le plus haut et du tiers le plus bas. Il faut au moins 8 semaines avec le résultat.</dd>
          <dt>Rapports du coach</dt><dd>Seuls le verdict, les scores et les points forts / faibles sont repris. Toute phrase qui contient un terme médical, ou un terme listé dans ta configuration privée (<code>privacy.hideTerms</code>), est retirée avant l’affichage.</dd>
        </dl></section>`;
    },
    update() {
      const { M, F, S, T } = SD;
      SD.drive && SD.drive.render();
      SD.bindImport && SD.bindImport();
      const src = M.raw.sources.slice().sort((a, b) => String(b.to).localeCompare(String(a.to)));
      setText('src-sub', `${src.length} fichiers · ${fdM(M.first)} → ${fdM(M.last)}${M.raw.syncedAt ? ` · dernière synchro Drive ${new Date(M.raw.syncedAt).toLocaleString('fr-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}`);
      const kindL = { health: 'Apple Santé', macrofactor: 'MacroFactor', trainai: 'TrainAI', notes: 'Journal', coach: 'Coach', labs: 'Bilan sanguin' };
      setHTML('src-b', `<table class="t"><thead><tr><th>Source</th><th>Période</th><th class="num">Jours</th><th>Fichier</th></tr></thead><tbody>${src.map((s) => `<tr><td>${esc(kindL[s.kind] || s.kind)}${s.driveId ? ' <span class="status good">Drive</span>' : s.imported ? ' <span class="status good">importé</span>' : ''}</td><td>${s.from ? esc(fdM(s.from) + ' → ' + fdM(s.to)) : '—'}</td><td class="num">${s.n}</td><td style="max-width:420px;overflow:hidden;text-overflow:ellipsis" title="${esc(s.fileName)}">${esc(s.fileName)}</td></tr>`).join('')}</tbody></table>`);

      // couverture
      const metrics = [['Pas', (x) => x.steps], ['Sommeil', (x) => x.sleepH], ['HRV', (x) => x.hrv], ['FC repos', (x) => x.rhr], ['Respiration', (x) => x.resp], ['SpO₂', (x) => x.spo2], ['Pesée', (x) => x.weight], ['Nutrition loggée', (x) => (SD.logged(x) ? 1 : null)], ['Séances', (x) => (x.w.length ? 1 : null)], ['Exercices détaillés', (x) => (x.ex.length ? 1 : null)], ['Muscles', (x) => (x.mus.length ? 1 : null)], ['Journal', (x) => (SD.journal.days().has(x.d) || M.coach.has(x.d) ? 1 : null)]];
      const mkeys = SD.bucketKeys('month');
      const cov = [];
      metrics.forEach(([, f], j) => mkeys.forEach((k, i) => {
        const ds = F.days.filter((x) => x.d.slice(0, 7) === k.slice(0, 7));
        if (!ds.length) return;
        cov.push([i, j, Math.round((ds.filter((x) => isNum(f(x))).length / ds.length) * 100)]);
      }));
      chart('dt-cov', base({
        grid: { left: 16, right: 10, top: 36, bottom: 6, containLabel: true },
        tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: (p) => tipBox(`${metrics[p.value[1]][0]} · ${fdate(mkeys[p.value[0]], { month: 'long', year: 'numeric' })}`, [{ color: T.strain, box: true, value: p.value[2] + ' %', name: 'des jours couverts' }]) }),
        xAxis: xCat(mkeys.map((k) => fdate(k, { month: 'short', year: '2-digit' })), { axisLine: { show: false } }),
        yAxis: xCat(metrics.map((m) => m[0]), { inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 12 } }),
        visualMap: { min: 0, max: 100, orient: 'horizontal', right: 0, top: 0, itemWidth: 10, itemHeight: 110, calculable: false, text: ['100 %', '0 %'], textStyle: { color: T.muted, fontSize: 11 }, inRange: { color: [T.seq[0], T.seq[2], T.seq[4]] } },
        series: [{ type: 'heatmap', data: cov, itemStyle: { borderColor: T.card, borderWidth: 2, borderRadius: 3 } }],
      }), () => ({ cols: ['Mesure', ...mkeys.map((k) => fdate(k, { month: 'short', year: '2-digit' }))], rows: metrics.map((m, j) => [m[0], ...mkeys.map((_, i) => { const c = cov.find((q) => q[0] === i && q[1] === j); return c ? c[2] + ' %' : '—'; })]) }));

      // table
      const col = COLS.find((c) => c[0] === sort.k) || COLS[0];
      const sorted = F.days.slice().sort((a, b) => {
        const va = a[col[0]], vb = b[col[0]];
        if (col[0] === 'd' || typeof va === 'string' || typeof vb === 'string') return sort.dir * String(va || '').localeCompare(String(vb || ''));
        return sort.dir * ((isNum(va) ? va : -Infinity) - (isNum(vb) ? vb : -Infinity));
      });
      const shown = sorted.slice(0, page * 120);
      setHTML('dt-tbl-b', `<table class="t"><thead><tr>${COLS.map((c) => `<th class="${c[3] ? 'num' : ''}" data-sort="${c[0]}">${c[1]}${sort.k === c[0] ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>${shown.map((x) => `<tr class="clickable" data-day="${x.d}">${COLS.map((c) => `<td class="${c[3] ? 'num' : ''}">${esc(c[2](x))}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      const more = document.getElementById('dt-more');
      more.hidden = shown.length >= sorted.length;
      more.textContent = `Afficher plus (${shown.length} / ${sorted.length})`;
      more.onclick = () => { page++; data.update(); };
      document.querySelectorAll('#dt-tbl-b th[data-sort]').forEach((h) => { h.onclick = () => { sort = { k: h.dataset.sort, dir: sort.k === h.dataset.sort ? -sort.dir : -1 }; page = 1; data.update(); }; });
    },
  };

  SD.PAGES.data = data;
})();
