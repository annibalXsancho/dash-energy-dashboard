// Jetons graphiques et gabarit commun des figures.
// Mêmes valeurs que src/theme.py (version Dash) et que css/style.css.

export const PAGE = "#0d0d0d";
export const SURFACE = "#1a1a19";
export const SURFACE_2 = "#242422";
export const INK = "#ffffff";
export const INK_2 = "#c3c2b7";
export const INK_MUTED = "#898781";
export const GRID = "#2c2c2a";
export const AXIS = "#383835";
export const HAIRLINE = "rgba(255,255,255,0.10)";

// Palette catégorielle testée pour le daltonisme. L'ORDRE fait partie du test :
// on attribue les teintes dans cet ordre, on n'en génère jamais une neuvième.
export const SERIES = [
  "#3987e5", // 1 bleu
  "#d95926", // 2 orange
  "#199e70", // 3 aqua
  "#c98500", // 4 jaune
  "#d55181", // 5 magenta
  "#008300", // 6 vert
  "#9085e9", // 7 violet
  "#e66767", // 8 rouge
];

// Rampe d'une seule teinte pour la magnitude. Sur fond sombre elle va du sombre
// (« presque rien », qui se fond dans la surface) vers le clair.
export const SEQUENTIAL = [
  [0.0, "#0d366b"],
  [0.2, "#184f95"],
  [0.4, "#256abf"],
  [0.6, "#3987e5"],
  [0.8, "#86b6ef"],
  [1.0, "#cde2fb"],
];

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

const axis = () => ({
  gridcolor: GRID,
  gridwidth: 1,
  griddash: "solid",
  linecolor: AXIS,
  zeroline: false,
  showline: false,
  ticks: "outside",
  ticklen: 4,
  tickcolor: AXIS,
  tickfont: { color: INK_MUTED, size: 11 },
  title: { font: { color: INK_MUTED, size: 11 } },
  automargin: true,
});

/** Mise en page commune à toutes les figures. */
export function baseLayout(extra = {}) {
  return Object.assign(
    {
      colorway: SERIES,
      paper_bgcolor: SURFACE,
      plot_bgcolor: SURFACE,
      font: { family: FONT, color: INK_2, size: 12 },
      margin: { l: 8, r: 12, t: 30, b: 8 },
      xaxis: axis(),
      yaxis: axis(),
      legend: {
        orientation: "h",
        yanchor: "bottom",
        y: 1.02,
        xanchor: "right",
        x: 1,
        font: { color: INK_2, size: 11 },
        bgcolor: "rgba(0,0,0,0)",
      },
      hoverlabel: {
        bgcolor: SURFACE_2,
        bordercolor: HAIRLINE,
        font: { family: FONT, color: INK, size: 12 },
      },
      bargap: 0.25,
      dragmode: "pan",
    },
    extra,
  );
}

export const GRAPH_CONFIG = {
  displaylogo: false,
  responsive: true,
  locale: "fr", // dates en français, virgule décimale, espace fine des milliers
  scrollZoom: false,
  displayModeBar: "hover",
  modeBarButtonsToRemove: [
    "select2d",
    "lasso2d",
    "autoScale2d",
    "toggleSpikelines",
    "hoverCompareCartesian",
    "hoverClosestCartesian",
  ],
  toImageButtonOptions: { format: "png", scale: 2 },
};

/** La même figure, en grand. On y gagne ce qu'une vignette ne permettait pas :
 *  la molette zoome, la barre d'outils reste affichée, et le rectangle de zoom
 *  redevient disponible — c'est la vue où l'on va chercher un détail. */
export const ZOOM_CONFIG = {
  ...GRAPH_CONFIG,
  scrollZoom: true,
  displayModeBar: true,
  modeBarButtonsToRemove: ["select2d", "lasso2d", "toggleSpikelines"],
};

/** Une couleur fixe par site, attribuée sur la liste COMPLÈTE des sites.
 *  Filtrer ne doit jamais repeindre les séries restantes. */
export function colorMap(allSites) {
  const map = new Map();
  [...allSites].sort((a, b) => a.localeCompare(b, "fr")).forEach((site, i) => {
    map.set(site, SERIES[i % SERIES.length]);
  });
  return map;
}
