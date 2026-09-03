// Ce que chaque figure et chaque indicateur calcule, en toutes lettres.
//
// Un tableau de bord de conseil est lu par quelqu'un qui devra en défendre les
// chiffres. Une pointe, un facteur de charge ou une thermosensibilité ne valent
// que si l'on peut dire d'où ils sortent et ce qu'ils ne disent pas — d'où le
// troisième bloc, « ce qu'il ne dit pas », présent partout : les limites font
// partie du résultat, pas de ses excuses.
//
// Le texte est écrit ici, jamais dans le HTML : il suit le calcul quand celui-ci
// bouge, et le livrable autonome l'emporte avec lui.
//
// Balisage admis dans les puces : <strong>, <em>, <code>. Rien d'autre n'y
// entre — ces chaînes sont écrites à la main, jamais construites à partir d'un
// fichier client (voir buildMethod() dans app.js).

/** `key` -> { title, lead, sections: [{ heading, items: [] }] } */
export const METHODS = {
  // ------------------------------------------------------------------ figures
  "fig-power": {
    title: "Courbe de puissance appelée",
    lead: "La puissance moyenne appelée sur chaque tranche de temps, une ligne"
      + " par site — le relevé tel qu'il s'est déroulé.",
    sections: [
      {
        heading: "Le calcul",
        items: [
          "Les mesures de la période sont regroupées par tranche de la"
            + " <strong>granularité choisie</strong> (heure, jour, semaine) et par site.",
          "La valeur tracée est la <strong>moyenne</strong> des puissances de la tranche,"
            + " jamais leur maximum : <code>Σ kW ÷ nombre de mesures</code>.",
          "En « pas natif », aucun regroupement n'a lieu : les mesures sont tracées"
            + " telles qu'elles ont été lues.",
        ],
      },
      {
        heading: "Ce qu'il ne dit pas",
        items: [
          "<strong>Au jour ou à la semaine, la pointe disparaît</strong> : la moyenne"
            + " l'écrase. La pointe se lit sur son indicateur, ou en repassant au pas natif.",
          "Les lignes ne sont pas empilées. La puissance totale est leur somme instantanée"
            + " — et si le relevé mêle un compteur général et ses sous-compteurs,"
            + " cette somme compte deux fois la même énergie.",
        ],
      },
    ],
  },

  "fig-energy": {
    title: "Énergie par période",
    lead: "La consommation cumulée sur chaque tranche, empilée par site.",
    sections: [
      {
        heading: "Le calcul",
        items: [
          "<strong>L'énergie n'est jamais lue dans le fichier</strong>, même s'il"
            + " porte une colonne de kWh : elle vaut"
            + " <code>puissance × durée du pas de mesure</code>.",
          "La durée du pas est l'<strong>écart médian</strong> entre deux mesures"
            + " successives d'un même site — la médiane ignore les trous du relevé.",
          "Les barres empilées additionnent les sites cochés ; la hauteur totale"
            + " est la consommation de la tranche.",
          "La tranche n'est jamais plus fine que l'heure : au pas natif, l'énergie"
            + " se regroupe quand même par heure.",
        ],
      },
      {
        heading: "Ce qu'il ne dit pas",
        items: [
          "Une tranche <strong>incomplète</strong> — le premier ou le dernier jour"
            + " du relevé, souvent — donne une barre basse qui n'est pas une économie.",
          "Rien ici ne distingue les heures pleines des heures creuses :"
            + " ce partage se lit sur la tuile « Énergie consommée ».",
        ],
      },
    ],
  },

  "fig-duration": {
    title: "Monotone de charge",
    lead: "Les mêmes puissances que la courbe de charge, mais triées de la plus"
      + " forte à la plus faible : la chronologie disparaît, la structure du"
      + " besoin apparaît.",
    sections: [
      {
        heading: "Le calcul",
        items: [
          "Les sites cochés sont d'abord additionnés horodatage par horodatage"
            + " (courbe totale), puis les valeurs sont <strong>triées par ordre"
            + " décroissant</strong>.",
          "L'abscisse est le rang ramené en pourcentage : le point de rang <em>i</em>"
            + " sur <em>n</em> mesures se lit « cette puissance est atteinte ou dépassée"
            + " pendant <code>i ÷ n</code> du relevé ».",
          "Le trait horizontal est la <strong>puissance souscrite</strong> saisie dans"
            + " les paramètres tarifaires : tout ce qui dépasse, à gauche du trait,"
            + " est exactement ce qui se paie en pénalités.",
          "La « puissance à viser » est la valeur dépassée <strong>1 % du temps</strong> :"
            + " la souscription qui ne laisserait plus que des dépassements exceptionnels.",
        ],
      },
      {
        heading: "Comment la lire",
        items: [
          "Un <strong>plateau</strong> : une charge régulière, un procédé qui tourne.",
          "Une <strong>chute brutale à gauche</strong> : quelques pointes rares"
            + " dimensionnent l'abonnement de toute l'année — le premier gisement d'économie.",
        ],
      },
      {
        heading: "Ce qu'il ne dit pas",
        items: [
          "Le pourcentage compte des <strong>pas de mesure</strong>, pas des heures"
            + " d'horloge : sur un relevé à trous, « 1 % du temps » vaut 1 % des mesures"
            + " présentes.",
          "Le coût des dépassements est un ordre de grandeur"
            + " (voir la tuile « Dépassements »), pas une facture.",
        ],
      },
    ],
  },

  "fig-profile": {
    title: "Profil de charge",
    lead: "Une cellule par heure et par jour : les habitudes du site se voient"
      + " d'un coup d'œil — l'équipe du matin, la veille de nuit, les week-ends,"
      + " les arrêts.",
    sections: [
      {
        heading: "Le calcul",
        items: [
          "Les sites cochés sont additionnés horodatage par horodatage, puis"
            + " <strong>moyennés par couple (jour, heure)</strong>.",
          "Une cellule vide n'est pas un zéro : c'est une heure sans aucune mesure.",
          "L'échelle de couleur <strong>part de zéro</strong> — les heures creuses se"
            + " fondent dans le fond, et le contraste jour / nuit saute aux yeux.",
        ],
      },
      {
        heading: "Ce qu'il ne dit pas",
        items: [
          "C'est une moyenne horaire : une pointe de dix minutes s'y dilue"
            + " presque entièrement.",
          "Au-delà de trois mois environ, chaque colonne fait quelques pixels :"
            + " la saison se lit encore, la journée non.",
        ],
      },
    ],
  },

  "fig-signature": {
    title: "Signature énergétique",
    lead: "La consommation en regard de la rigueur du climat. La pente de la"
      + " droite est la thermosensibilité du site, son ordonnée à l'origine"
      + " le talon — ce qu'il consomme quand le temps ne demande rien.",
    sections: [
      {
        heading: "Les degrés-jours",
        items: [
          "Méthode <strong>Costic</strong>, celle de Météo-France, à partir des"
            + " températures minimale et maximale du jour et d'une température de base"
            + " réglable (18 °C par défaut).",
          "Journée entièrement sous la base : <code>DJU = base − (Tmin + Tmax) ÷ 2</code>."
            + " Journée entièrement au-dessus : <code>DJU = 0</code>.",
          "Journée à cheval sur la base — le cas que la moyenne simple traite mal :"
            + " <code>DJU = (base − Tmin) × [0,08 + 0,42 × (base − Tmin) ÷ (Tmax − Tmin)]</code>.",
          "En climatisation, la même formule retournée donne les DJR (degrés-jours"
            + " de refroidissement). Le sens « automatique » retient celui des deux"
            + " qui explique le mieux le relevé.",
        ],
      },
      {
        heading: "La droite",
        items: [
          "Ajustement par les <strong>moindres carrés</strong> :"
            + " <code>énergie = talon + pente × degrés-jours</code>, avec son R².",
          "Le grain est la <strong>semaine complète</strong> dès qu'il y en a six :"
            + " au pas journalier, l'arrêt du week-end fait plus varier la consommation"
            + " que la température, et la pente lue serait celle du calendrier.",
          "Les <strong>journées incomplètes sont écartées</strong> (moins de 80 % du"
            + " nombre médian de mesures quotidiennes), de même que les semaines entamées.",
          "La droite s'ajuste sur <strong>tout le relevé</strong>, pas sur la seule"
            + " période affichée : sur sept jours, une pente n'aurait aucun sens."
            + " Les points hors période restent visibles, en retrait.",
        ],
      },
      {
        heading: "Ce qu'il ne dit pas",
        items: [
          "La droite est <strong>refusée</strong> si sa pente est négative ou son"
            + " R² inférieur à 0,3 : le nuage est alors informe, et l'habiller d'une"
            + " équation produirait un diagnostic imaginaire. Le nuage reste affiché,"
            + " sans droite — c'est un résultat, pas une panne.",
          "Une corrélation n'est pas une cause : un site dont la production suit"
            + " la saison exhibe une thermosensibilité sans chauffer quoi que ce soit.",
          "Les températures sont celles de la commune choisie, pas du bâtiment.",
        ],
      },
    ],
  },

  "fig-expected": {
    title: "Observé et attendu",
    lead: "Ce que le climat explique, et ce qu'il n'explique pas. Au-dessus du"
      + " trait, la journée a consommé plus que le temps ne le demandait.",
    sections: [
      {
        heading: "Le calcul",
        items: [
          "La courbe attendue applique la droite de la signature aux degrés-jours"
            + " de chaque journée : <code>attendu = talon journalier + pente ×"
            + " degrés-jours du jour</code>, jamais négatif.",
          "Les deux séries sont en kWh sur un <strong>seul axe</strong> :"
            + " l'écart se lit directement en énergie.",
        ],
      },
      {
        heading: "Ce qu'il ne dit pas",
        items: [
          "La carte n'apparaît que si la droite tient debout ; elle hérite de"
            + " toutes ses limites (voir la signature énergétique).",
          "Un écart isolé peut être une journée d'arrêt, un essai, un jour férié :"
            + " ce sont les <strong>séries d'écarts</strong> qui signalent une dérive.",
        ],
      },
    ],
  },

  // --------------------------------------------------------------- indicateurs
  "kpi-energy": {
    title: "Énergie consommée",
    lead: "La consommation de la période affichée, sur les sites cochés.",
    sections: [
      {
        heading: "Le calcul",
        items: [
          "<code>Σ (puissance × durée du pas)</code> sur toutes les mesures retenues."
            + " Aucune colonne de kWh du fichier n'est utilisée.",
          "La part en heures creuses répartit chaque mesure selon"
            + " <strong>l'heure de son horodatage</strong> et la plage saisie dans les"
            + " paramètres tarifaires (la plage qui enjambe minuit est gérée).",
        ],
      },
      {
        heading: "Ce qu'il ne dit pas",
        items: [
          "L'écart affiché compare à la <strong>période de même durée</strong> qui"
            + " précède immédiatement, sans aucune correction — ni du climat,"
            + " ni de l'activité. La tuile « Écart corrigé du climat » fait ce travail-là.",
        ],
      },
    ],
  },

  "kpi-peak": {
    title: "Puissance de pointe",
    lead: "La plus forte puissance atteinte sur la période, tous sites cochés"
      + " confondus — c'est elle qui dimensionne l'abonnement.",
    sections: [
      {
        heading: "Le calcul",
        items: [
          "Les sites sont additionnés horodatage par horodatage, puis on retient"
            + " le <strong>maximum</strong> de cette courbe totale. La légende donne"
            + " l'instant où il tombe.",
          "La granularité d'affichage n'y change rien : la pointe se lit toujours"
            + " au pas de mesure du relevé.",
        ],
      },
      {
        heading: "Ce qu'il ne dit pas",
        items: [
          "Une pointe dépend du <strong>pas du relevé</strong> : au pas 10 min, on"
            + " ne voit pas l'appel de démarrage d'une minute. La valeur est un"
            + " plancher, jamais un plafond.",
          "Le distributeur, lui, facture sur ses propres périodes d'intégration.",
        ],
      },
    ],
  },

  "kpi-mean": {
    title: "Puissance moyenne",
    lead: "La puissance appelée en moyenne sur la période, tous sites cochés"
      + " confondus.",
    sections: [
      {
        heading: "Le calcul",
        items: [
          "Moyenne de la courbe totale sur les <strong>pas présents dans le"
            + " relevé</strong> : <code>Σ kW ÷ nombre de pas</code>.",
        ],
      },
      {
        heading: "Ce qu'il ne dit pas",
        items: [
          "La moyenne porte sur le temps <strong>mesuré</strong>, pas sur le temps"
            + " calendaire : un relevé qui saute une semaine ne compte pas cette"
            + " semaine comme nulle.",
        ],
      },
    ],
  },

  "kpi-loadfactor": {
    title: "Facteur de charge",
    lead: "Le rapport entre la puissance moyenne et la pointe : à quel point le"
      + " besoin est régulier.",
    sections: [
      {
        heading: "Le calcul",
        items: [
          "<code>facteur de charge = puissance moyenne ÷ puissance de pointe × 100</code>.",
        ],
      },
      {
        heading: "Comment le lire",
        items: [
          "<strong>Élevé</strong> (au-delà de 70 %) : une charge de fond, un procédé"
            + " continu — peu à gagner sur la souscription.",
          "<strong>Bas</strong> (sous 40 %) : quelques pointes portent l'abonnement."
            + " Les effacer ou les décaler coûte moins cher que de consommer moins.",
        ],
      },
      {
        heading: "Ce qu'il ne dit pas",
        items: [
          "Un facteur de charge bas n'est pas un défaut en soi : un site à deux"
            + " équipes sur trois est bas par construction.",
        ],
      },
    ],
  },

  "kpi-overrun": {
    title: "Dépassements de puissance souscrite",
    lead: "Le temps passé au-dessus de la puissance souscrite, et ce que cela"
      + " coûte en ordre de grandeur.",
    sections: [
      {
        heading: "Le calcul",
        items: [
          "Chaque pas de la courbe totale au-dessus de la souscription compte pour"
            + " la durée du pas : <code>heures = nombre de pas dépassants × durée du pas</code>.",
          "Le coût retenu est le <strong>dépassement maximal</strong> multiplié par"
            + " la pénalité en €/kW saisie dans les paramètres.",
          "L'« optimum » est la puissance dépassée 1 % du temps, lue sur la monotone"
            + " de charge.",
        ],
      },
      {
        heading: "Ce qu'il ne dit pas",
        items: [
          "<strong>Ce n'est pas la formule du TURPE</strong>, qui facture chaque"
            + " dépassement horaire par une somme quadratique propre au contrat."
            + " De quoi dire « votre souscription est mal calée », pas de quoi"
            + " refaire une facture.",
          "Sans puissance souscrite saisie, la tuile affiche à la place la puissance"
            + " qu'il faudrait viser.",
        ],
      },
    ],
  },

  "kpi-cost": {
    title: "Coût estimé",
    lead: "Une estimation à partir des paramètres tarifaires saisis, mémorisés"
      + " dans ce navigateur.",
    sections: [
      {
        heading: "Le calcul",
        items: [
          "Énergie : <code>kWh heures pleines × prix HP + kWh heures creuses × prix HC</code>.",
          "Abonnement : le montant mensuel <strong>proratisé</strong> sur la durée"
            + " affichée (<code>× jours ÷ 30,44</code>).",
          "Dépassements : ajoutés seulement si une puissance souscrite est saisie.",
        ],
      },
      {
        heading: "Ce qu'il ne dit pas",
        items: [
          "Ni taxes, ni CTA, ni composante de soutirage détaillée du TURPE, ni"
            + " part fixe d'acheminement : trois postes lisibles valent mieux qu'une"
            + " facture reconstituée de travers.",
          "Un tarif à plus de deux plages horaires (pointe mobile, saisons) ne"
            + " se représente pas ici.",
        ],
      },
    ],
  },

  "kpi-climate": {
    title: "Rigueur climatique",
    lead: "Les degrés-jours cumulés de la période affichée, et ceux de la période"
      + " précédente. Ce n'est ni bon ni mauvais : c'est le temps qu'il a fait.",
    sections: [
      {
        heading: "Le calcul",
        items: [
          "Somme des degrés-jours (méthode Costic) des <strong>journées complètes</strong>"
            + " de la période, à la température de base choisie.",
          "Les températures viennent d'open-meteo.com pour la commune retenue :"
            + " seules cette commune et les dates du relevé y sont envoyées —"
            + " <strong>aucune mesure de puissance ne quitte le navigateur</strong>.",
        ],
      },
      {
        heading: "Ce qu'il ne dit pas",
        items: [
          "Deux périodes de durées différentes ne se comparent pas sur leur cumul :"
            + " c'est la moyenne journalière qui sert au calcul de la correction.",
        ],
      },
    ],
  },

  "kpi-adjusted": {
    title: "Écart corrigé du climat",
    lead: "L'écart de consommation entre les deux périodes une fois le temps"
      + " neutralisé — la tuile qui dit si une action d'économie a produit"
      + " quelque chose, ou si l'hiver a simplement été plus doux.",
    sections: [
      {
        heading: "Le calcul",
        items: [
          "La période précédente est <strong>restatée sous le climat de la période"
            + " affichée</strong> : <code>attendu = énergie précédente + pente ×"
            + " (degrés-jours actuels − degrés-jours précédents)</code>, en moyennes"
            + " journalières.",
          "L'écart affiché est celui de la consommation observée à cet attendu ;"
            + " l'écart brut, sans correction, est rappelé en légende.",
          "La pente est celle de la signature énergétique.",
        ],
      },
      {
        heading: "Ce qu'il ne dit pas",
        items: [
          "La correction ne neutralise <strong>que le climat</strong> : un mois de"
            + " production plus fort déplace l'écart tout autant.",
          "Elle compare la période affichée à celle qui la précède immédiatement,"
            + " et à rien d'autre.",
          "Sans droite exploitable, la tuile ne s'affiche pas du tout.",
        ],
      },
    ],
  },
};

/** Les figures agrandissables, dans l'ordre où elles sont lues à l'écran. */
export const FIGURE_KEYS = [
  "fig-power",
  "fig-energy",
  "fig-duration",
  "fig-signature",
  "fig-expected",
  "fig-profile",
];
