// Assemblage : état, contrôles, rendu. C'est le seul module qui touche au DOM
// et le seul qui connaisse à la fois les données et les figures.

import * as data from "./data.js";
import * as figures from "./figures.js";
import * as theme from "./theme.js";
import { fmt, humanEnergy, stampLong, stampTable, isoDay } from "./format.js";

const DEFAULT_CSV = "data/sample_energy.csv";
const TABLE_ROW_CAP = 500;

// L'énergie se lit mieux par tranche large : jamais plus fin que l'heure.
const ENERGY_FREQ = { raw: "h", h: "D", D: "D", W: "W" };

const state = { dataset: null, start: null, end: null, sites: [], freq: "h" };

const el = (id) => document.getElementById(id);
const nodes = {
  chip: el("source-chip"),
  feedback: el("feedback"),
  kpis: el("kpis"),
  start: el("date-start"),
  end: el("date-end"),
  chips: el("site-chips"),
  segmented: el("granularity"),
  file: el("file-input"),
  reset: el("reset-data"),
  tableBody: document.querySelector("#data-table tbody"),
  tableNote: el("table-note"),
};

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayFromInput = (value) => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
};

function say(message, tone = "") {
  nodes.feedback.textContent = message;
  nodes.feedback.className = `feedback ${tone}`.trim();
}

// --------------------------------------------------------------------------
// Chargement des données
// --------------------------------------------------------------------------
async function loadFromUrl(url) {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    // Cas classique : la page a été ouverte par double-clic (protocole file://),
    // où le navigateur interdit la lecture de fichiers voisins.
    throw new data.DataError(
      location.protocol === "file:"
        ? "Ouvrez la page via une adresse http (GitHub Pages, ou « python3 -m http.server » en local) : un fichier ouvert par double-clic ne peut pas lire le CSV."
        : `Téléchargement impossible : ${error.message}`,
    );
  }
  if (!response.ok) throw new data.DataError(`Fichier introuvable (${response.status}) : ${url}`);
  const text = await response.text();
  return new data.Dataset(data.parse(text), url.split("/").pop());
}

function adopt(dataset, { message = "", tone = "" } = {}) {
  state.dataset = dataset;
  state.sites = [...dataset.sites];

  const last = startOfDay(dataset.end);
  const first = startOfDay(dataset.start);
  const windowStart = new Date(Math.max(first.getTime(), last.getTime() - 29 * 86400000));
  state.start = windowStart;
  state.end = last;

  nodes.start.min = isoDay(first);
  nodes.start.max = isoDay(last);
  nodes.end.min = isoDay(first);
  nodes.end.max = isoDay(last);
  nodes.start.value = isoDay(windowStart);
  nodes.end.value = isoDay(last);

  buildSiteChips();
  say(message, tone);
  render();
}

// --------------------------------------------------------------------------
// Contrôles
// --------------------------------------------------------------------------
function buildSiteChips() {
  const colors = theme.colorMap(state.dataset.sites);
  nodes.chips.replaceChildren();
  for (const site of state.dataset.sites) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-pressed", String(state.sites.includes(site)));
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = colors.get(site);
    button.append(dot, document.createTextNode(site));
    button.addEventListener("click", () => {
      const on = button.getAttribute("aria-pressed") === "true";
      if (on && state.sites.length === 1) return; // toujours au moins un site
      button.setAttribute("aria-pressed", String(!on));
      state.sites = on ? state.sites.filter((s) => s !== site) : [...state.sites, site];
      render();
    });
    nodes.chips.append(button);
  }
}

function wireControls() {
  nodes.start.addEventListener("change", () => {
    state.start = dayFromInput(nodes.start.value);
    if (state.start > state.end) { state.end = state.start; nodes.end.value = nodes.start.value; }
    render();
  });
  nodes.end.addEventListener("change", () => {
    state.end = dayFromInput(nodes.end.value);
    if (state.end < state.start) { state.start = state.end; nodes.start.value = nodes.end.value; }
    render();
  });

  for (const button of document.querySelectorAll("[data-preset]")) {
    button.addEventListener("click", () => {
      const last = startOfDay(state.dataset.end);
      const first = startOfDay(state.dataset.start);
      const preset = button.dataset.preset;
      const start = preset === "all"
        ? first
        : new Date(Math.max(first.getTime(), last.getTime() - (Number(preset) - 1) * 86400000));
      state.start = start;
      state.end = last;
      nodes.start.value = isoDay(start);
      nodes.end.value = isoDay(last);
      render();
    });
  }

  nodes.segmented.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-freq]");
    if (!button) return;
    state.freq = button.dataset.freq;
    for (const b of nodes.segmented.children) b.classList.toggle("is-on", b === button);
    render();
  });

  nodes.file.addEventListener("change", () => {
    const file = nodes.file.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = data.parse(String(reader.result));
        adopt(new data.Dataset(rows, file.name), {
          message: `${file.name} chargé — ${fmt(rows.length)} mesures`,
          tone: "is-ok",
        });
      } catch (error) {
        say(`Import refusé — ${error.message}`, "is-error");
      }
    };
    reader.onerror = () => say("Fichier illisible.", "is-error");
    reader.readAsText(file);
    nodes.file.value = ""; // permet de recharger deux fois le même fichier
  });

  nodes.reset.addEventListener("click", async () => {
    try {
      adopt(await loadFromUrl(DEFAULT_CSV), {
        message: "Retour aux données de démonstration",
        tone: "is-ok",
      });
    } catch (error) {
      say(error.message, "is-error");
    }
  });
}

// --------------------------------------------------------------------------
// Indicateurs
// --------------------------------------------------------------------------
function deltaLine(current, previous, better = "lower") {
  const box = document.createElement("div");
  if (!previous) {
    box.className = "delta is-neutral";
    box.textContent = "période précédente indisponible";
    return box;
  }
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 0.05) {
    box.className = "delta is-neutral";
    box.textContent = "stable vs période précédente";
    return box;
  }
  const rising = change > 0;
  const good = better === "higher" ? rising : !rising;
  box.className = `delta ${good ? "is-good" : "is-bad"}`;
  // La couleur ne porte jamais l'information seule : flèche + libellé.
  box.innerHTML = `<span class="delta-arrow">${rising ? "▲" : "▼"}</span>`
    + `<span class="delta-value">${fmt(Math.abs(change), 1)} %</span>`
    + '<span class="delta-label">vs période précédente</span>';
  return box;
}

function tile(label, value, unit, caption, delta) {
  const box = document.createElement("div");
  box.className = "tile";
  box.innerHTML = `<span class="eyebrow">${label}</span>`
    + `<div class="stat-line"><span class="stat-value">${value}</span>`
    + `<span class="stat-unit">${unit}</span></div>`
    + `<div class="stat-caption">${caption}</div>`;
  if (delta) box.append(delta);
  return box;
}

function renderKpis(current, previous) {
  const energy = humanEnergy(current.energy);
  const tiles = [
    tile("Énergie consommée", energy.value, energy.unit, "sur la période affichée",
      deltaLine(current.energy, previous?.energy, "lower")),
    tile("Puissance de pointe", fmt(current.peak), "kW",
      current.peakAt ? stampLong(current.peakAt) : "—",
      deltaLine(current.peak, previous?.peak, "lower")),
    tile("Puissance moyenne", fmt(current.mean), "kW", "tous sites confondus",
      deltaLine(current.mean, previous?.mean, "lower")),
    tile("Facteur de charge", fmt(current.loadFactor, 1), "%", "moyenne ÷ pointe",
      deltaLine(current.loadFactor, previous?.loadFactor, "higher")),
    tile("Coût estimé", fmt(current.cost), "€",
      `à ${fmt(data.PRICE_EUR_PER_KWH, 2)} €/kWh`,
      deltaLine(current.cost, previous?.cost, "lower")),
  ];
  nodes.kpis.replaceChildren(...tiles);
}

// --------------------------------------------------------------------------
// Tableau
// --------------------------------------------------------------------------
function renderTable(agg, freq) {
  const shown = agg.slice(0, TABLE_ROW_CAP);
  const fragment = document.createDocumentFragment();
  for (const row of shown) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${stampTable(new Date(row.t), freq)}</td><td>${row.site}</td>`
      + `<td class="num">${fmt(row.kwh)}</td><td class="num">${fmt(row.kw)}</td>`
      + `<td class="num">${fmt(row.peak)}</td>`;
    fragment.append(tr);
  }
  nodes.tableBody.replaceChildren(fragment);
  nodes.tableNote.textContent = agg.length > TABLE_ROW_CAP
    ? `${fmt(agg.length)} lignes agrégées — ${TABLE_ROW_CAP} premières affichées`
    : `${fmt(agg.length)} lignes agrégées`;
}

// --------------------------------------------------------------------------
// Rendu complet
// --------------------------------------------------------------------------
function draw(id, figure) {
  Plotly.react(el(id), figure.data, figure.layout, theme.GRAPH_CONFIG);
}

function render() {
  const ds = state.dataset;
  const colors = theme.colorMap(ds.sites); // attribution stable, tous sites confondus
  nodes.chip.textContent = `${ds.source} · ${fmt(ds.rows.length)} mesures · `
    + `pas de ${fmt(ds.stepHours * 60)} min`;

  const current = data.slicePeriod(ds.rows, state.start, state.end, state.sites);
  if (!current.length) {
    renderKpis(data.kpis([], ds.stepHours), null);
    for (const id of ["fig-power", "fig-energy", "fig-duration", "fig-profile"]) {
      draw(id, figures.empty());
    }
    renderTable([], state.freq);
    return;
  }

  const previous = data.previousPeriod(ds.rows, state.start, state.end, state.sites);
  const agg = data.aggregate(current, state.freq, ds.stepHours);
  const energyAgg = data.aggregate(current, ENERGY_FREQ[state.freq], ds.stepHours);

  renderKpis(data.kpis(current, ds.stepHours),
    previous.length ? data.kpis(previous, ds.stepHours) : null);
  draw("fig-power", figures.powerTimeseries(agg, colors));
  draw("fig-energy", figures.energyBars(energyAgg, colors));
  draw("fig-duration", figures.loadDurationCurve(data.loadDuration(current)));
  draw("fig-profile", figures.loadProfile(data.heatMatrix(current)));
  renderTable(agg, state.freq);
}

// --------------------------------------------------------------------------
// Démarrage
// --------------------------------------------------------------------------
async function boot() {
  wireControls();
  // ?data=<url> permet de pointer la page vers un autre relevé sans la modifier.
  const url = new URLSearchParams(location.search).get("data") || DEFAULT_CSV;
  try {
    adopt(await loadFromUrl(url));
  } catch (error) {
    nodes.chip.textContent = "aucune donnée";
    say(error.message, "is-error");
  }
}

boot();
