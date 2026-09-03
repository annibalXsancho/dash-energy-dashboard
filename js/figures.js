// Construction des figures Plotly.
// Chaque fonction reçoit des données déjà filtrées et renvoie { data, layout }.
//
// Règles de lecture : une couleur = un site (attribution stable), un seul axe
// des ordonnées par graphique, grille discrète, écart de 2 px entre deux aplats
// voisins, survol partout, étiquettes directes seulement là où elles tiennent.

import * as theme from "./theme.js?v=7";

/** Figure de repli quand la sélection ne renvoie rien. */
export function empty(message = "Aucune donnée sur cette sélection") {
  return {
    data: [],
    layout: theme.baseLayout({
      margin: { l: 8, r: 8, t: 8, b: 8 },
      xaxis: { visible: false },
      yaxis: { visible: false },
      annotations: [
        {
          text: message,
          showarrow: false,
          font: { color: theme.INK_MUTED, size: 13 },
          xref: "paper",
          yref: "paper",
          x: 0.5,
          y: 0.5,
        },
      ],
    }),
  };
}

/** Regroupe une agrégation par site, en conservant l'ordre chronologique. */
function bySite(agg) {
  const groups = new Map();
  for (const row of agg) {
    if (!groups.has(row.site)) groups.set(row.site, []);
    groups.get(row.site).push(row);
  }
  return groups;
}

/** Courbe de puissance appelée : une ligne par site. */
export function powerTimeseries(agg, colors) {
  if (!agg.length) return empty();
  const groups = bySite(agg);
  const data = [];
  const ends = [];

  for (const [site, rows] of groups) {
    data.push({
      type: "scatter",
      mode: "lines",
      name: site,
      x: rows.map((r) => new Date(r.t)),
      y: rows.map((r) => r.kw),
      line: { color: colors.get(site) || theme.SERIES[0], width: 2 },
      hovertemplate: "%{y:,.0f} kW<extra>%{fullData.name}</extra>",
    });
    const last = rows[rows.length - 1];
    ends.push({ site, t: last.t, kw: last.kw });
  }

  // Étiquettes directes en bout de courbe : l'identité se lit sans aller-retour
  // avec la légende (qui reste présente). Au-delà de quatre séries elles se
  // marchent dessus : la légende seule prend alors le relais.
  const annotations = [];
  if (ends.length <= 4) {
    const values = agg.map((r) => r.kw);
    const top = Math.max(...values);
    const bottom = Math.min(0, Math.min(...values));
    const minGap = (top - bottom) * 0.075;
    let previous = null;
    for (const end of [...ends].sort((a, b) => b.kw - a.kw)) {
      let y = end.kw;
      if (previous !== null && previous - y < minGap) y = previous - minGap;
      previous = y;
      annotations.push({
        x: new Date(end.t),
        y,
        text: end.site,
        showarrow: false,
        xanchor: "left",
        yanchor: "middle",
        xshift: 10,
        font: { color: colors.get(end.site) || theme.SERIES[0], size: 11 },
      });
    }
  }

  const layout = theme.baseLayout({
    margin: { l: 8, r: 104, t: 30, b: 8 },
    hovermode: "x unified",
    annotations,
  });
  layout.yaxis.title = { text: "kW", font: { color: theme.INK_MUTED, size: 11 } };
  layout.yaxis.rangemode = "tozero";
  layout.xaxis.showspikes = true;
  layout.xaxis.spikecolor = theme.AXIS;
  layout.xaxis.spikethickness = 1;
  layout.xaxis.spikemode = "across";
  // Bornage explicite : sans lui, Plotly élargit l'échelle pour faire tenir les
  // étiquettes de bout de courbe, et l'axe déborde après la dernière mesure.
  layout.xaxis.range = [new Date(agg[0].t), new Date(agg[agg.length - 1].t)];
  return { data, layout };
}

/** Énergie consommée par période, empilée par site. */
export function energyBars(agg, colors) {
  if (!agg.length) return empty();
  const data = [...bySite(agg)].map(([site, rows]) => ({
    type: "bar",
    name: site,
    x: rows.map((r) => new Date(r.t)),
    y: rows.map((r) => r.kwh),
    marker: {
      color: colors.get(site) || theme.SERIES[0],
      // Un liseré de la couleur du fond crée l'écart de 2 px entre segments
      // empilés : séparer sans dessiner de bordure.
      line: { color: theme.SURFACE, width: 1 },
    },
    hovertemplate: "%{y:,.0f} kWh<extra>%{fullData.name}</extra>",
  }));
  const layout = theme.baseLayout({ barmode: "stack", hovermode: "x unified" });
  layout.yaxis.title = { text: "kWh", font: { color: theme.INK_MUTED, size: 11 } };
  layout.yaxis.rangemode = "tozero";
  return { data, layout };
}

/** Monotone de charge : puissance atteinte ou dépassée, en % du temps.
 *  `threshold` trace la puissance souscrite : ce qui dépasse à gauche du trait
 *  est exactement ce qui se paie en pénalités. */
export function loadDurationCurve(curve, threshold = 0) {
  if (!curve.length) return empty();
  const data = [
    {
      type: "scatter",
      mode: "lines",
      name: "Puissance totale",
      x: curve.map((p) => p.share),
      y: curve.map((p) => p.kw),
      line: { color: theme.SERIES[0], width: 2 },
      fill: "tozeroy",
      fillcolor: "rgba(57,135,229,0.16)",
      hovertemplate: "%{y:,.0f} kW dépassés<br>%{x:.0f} % du temps<extra></extra>",
    },
  ];
  const layout = theme.baseLayout({
    hovermode: "x unified",
    showlegend: false, // série unique : le titre de la carte suffit
  });
  if (threshold > 0) {
    const above = curve.filter((p) => p.kw > threshold).length / curve.length * 100;
    layout.shapes = [
      {
        type: "line",
        xref: "paper",
        x0: 0,
        x1: 1,
        yref: "y",
        y0: threshold,
        y1: threshold,
        line: { color: theme.INK_2, width: 1 },
      },
    ];
    layout.annotations = [
      {
        xref: "paper",
        x: 1,
        y: threshold,
        yanchor: "bottom",
        xanchor: "right",
        text: above >= 0.05
          ? `puissance souscrite — dépassée ${above.toFixed(1).replace(".", ",")} % du temps`
          : "puissance souscrite — jamais dépassée",
        showarrow: false,
        font: { color: theme.INK_2, size: 11 },
      },
    ];
  }
  layout.xaxis.title = { text: "% du temps", font: { color: theme.INK_MUTED, size: 11 } };
  layout.xaxis.ticksuffix = " %";
  layout.xaxis.range = [0, 100];
  layout.yaxis.title = { text: "kW", font: { color: theme.INK_MUTED, size: 11 } };
  layout.yaxis.rangemode = "tozero";
  return { data, layout };
}

/** Profil de charge : puissance moyenne par heure (Y) et par jour (X). */
export function loadProfile(matrix) {
  if (!matrix.days.length) return empty();
  const data = [
    {
      type: "heatmap",
      x: matrix.days.map((d) => new Date(d)),
      y: matrix.hours.map((h) => `${String(h).padStart(2, "0")} h`),
      z: matrix.z,
      colorscale: theme.SEQUENTIAL,
      // L'échelle part de zéro : les heures creuses se fondent dans le fond et
      // le contraste jour/nuit saute aux yeux.
      zmin: 0,
      // L'écart entre cellules sépare joliment 30 colonnes ; sur 500 jours,
      // chaque colonne fait moins de 2 px et l'écart efface le dessin. On le
      // retire dès que les cellules deviennent trop fines.
      xgap: matrix.days.length > 90 ? 0 : 2,
      ygap: 2,
      hovertemplate: "%{x|%d/%m} · %{y}<br>%{z:,.0f} kW<extra></extra>",
      colorbar: {
        title: { text: "kW", font: { color: theme.INK_MUTED, size: 11 } },
        thickness: 10,
        outlinewidth: 0,
        tickfont: { color: theme.INK_MUTED, size: 10 },
        len: 0.9,
      },
    },
  ];
  const layout = theme.baseLayout({ hovermode: "closest" });
  layout.yaxis.autorange = "reversed";
  layout.yaxis.showgrid = false;
  layout.xaxis.showgrid = false;
  return { data, layout };
}

/** Signature énergétique : un point par journée, degrés-jours en abscisse et
 *  énergie en ordonnée. La droite est la thermosensibilité du site — sa pente
 *  se lit en kWh par degré-jour, son ordonnée à l'origine est le talon.
 *
 *  Les journées hors période affichée restent visibles, en retrait : elles
 *  donnent au nuage sa forme, et le trait s'appuie sur elles. */
export function energySignature(inside, outside, model, unit, grain = "jour") {
  if (!inside.length && !outside.length) {
    return empty("Aucune période complète à croiser avec la météo");
  }
  const since = grain === "semaine" ? "semaine du %{customdata}" : "%{customdata}";
  const hover = `%{x:,.1f} ${unit}<br>%{y:,.0f} kWh<br>${since}<extra></extra>`;
  const cloud = (rows, name, color, size) => ({
    type: "scatter",
    mode: "markers",
    name,
    x: rows.map((p) => p.x),
    y: rows.map((p) => p.y),
    customdata: rows.map((p) => p.day),
    marker: { color, size, line: { width: 0 } },
    hovertemplate: hover,
  });

  const data = [];
  if (outside.length) {
    data.push(cloud(outside, "Hors période", theme.AXIS, 6));
  }
  data.push(cloud(inside, "Période affichée", theme.SERIES[0], 8));

  if (model) {
    const all = [...outside, ...inside].map((p) => p.x);
    const x0 = Math.min(...all);
    const x1 = Math.max(...all);
    data.push({
      type: "scatter",
      mode: "lines",
      name: "Thermosensibilité",
      x: [x0, x1],
      y: [model.intercept + model.slope * x0, model.intercept + model.slope * x1],
      line: { color: theme.SERIES[1], width: 2, dash: "dot" },
      hoverinfo: "skip",
    });
  }

  const layout = theme.baseLayout({ hovermode: "closest" });
  const per = ` / ${grain}`;
  layout.xaxis.title = { text: unit + per, font: { color: theme.INK_MUTED, size: 11 } };
  layout.xaxis.rangemode = "tozero";
  layout.yaxis.title = { text: "kWh" + per, font: { color: theme.INK_MUTED, size: 11 } };
  layout.yaxis.rangemode = "tozero";
  return { data, layout };
}

/** Consommation observée et consommation attendue au vu du climat.
 *  Les deux courbes sont en kWh : un seul axe, et l'écart se lit directement —
 *  au-dessus du trait, la journée a consommé plus que le temps ne l'expliquait. */
export function climateExpectation(cells, model, mode) {
  if (!cells.length || !model) return empty("Pas de modèle climatique exploitable");
  const x = cells.map((c) => new Date(c.t));
  const expected = cells.map((c) =>
    Math.max(0, model.intercept + model.slope * (mode === "froid" ? c.cdd : c.hdd)));
  const data = [
    {
      type: "bar",
      name: "Observée",
      x,
      y: cells.map((c) => c.kwh),
      marker: { color: theme.SERIES[0], line: { color: theme.SURFACE, width: 1 } },
      hovertemplate: "%{y:,.0f} kWh observés<extra></extra>",
    },
    {
      type: "scatter",
      mode: "lines",
      name: "Attendue par le climat",
      x,
      y: expected,
      line: { color: theme.SERIES[1], width: 2 },
      hovertemplate: "%{y:,.0f} kWh attendus<extra></extra>",
    },
  ];
  const layout = theme.baseLayout({ hovermode: "x unified" });
  layout.yaxis.title = { text: "kWh / jour", font: { color: theme.INK_MUTED, size: 11 } };
  layout.yaxis.rangemode = "tozero";
  return { data, layout };
}
