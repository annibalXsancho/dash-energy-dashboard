// Assemblage : état, contrôles, rendu. C'est le seul module qui touche au DOM
// et le seul qui connaisse à la fois les données et les figures.

import * as data from "./data.js?v=7";
import * as figures from "./figures.js?v=7";
import * as theme from "./theme.js?v=7";
import * as tariff from "./tariff.js?v=7";
import * as weather from "./weather.js?v=7";
import { fmt, humanEnergy, stampLong, stampTable, isoDay, isoStamp } from "./format.js?v=7";

const DEFAULT_CSV = "data/sample_energy.csv";
const SHEETJS_SRC = "vendor/xlsx-0.20.3.full.min.js";
const LINK_KEY = "energie.lien.v1";
const MAPPINGS_KEY = "energie.colonnes.v1";
const TABLE_ROW_CAP = 500;

// L'énergie se lit mieux par tranche large : jamais plus fin que l'heure.
const ENERGY_FREQ = { raw: "h", h: "D", D: "D", W: "W" };

const state = {
  dataset: null,
  start: null,
  end: null,
  sites: [],
  freq: "h",
  tariff: tariff.load(), // mémorisé dans le navigateur d'un passage à l'autre
  // Météo : la configuration est mémorisée, les températures sont retéléchargées
  // (ou lues dans le livrable, et alors `embedded` interdit toute requête).
  weather: { config: weather.load(), days: new Map(), embedded: false },
};

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
  tariffFields: el("tariff-fields"),
  linkRow: el("link-row"),
  linkToggle: el("link-toggle"),
  linkInput: el("link-input"),
  linkLoad: el("link-load"),
  linkForget: el("link-forget"),
  mapper: el("mapper"),
  mapperIntro: el("mapper-intro"),
  mapperTable: el("mapper-table"),
  mapTimestamp: el("map-timestamp"),
  mapPowerList: el("map-power-list"),
  mapPowerNote: el("map-power-note"),
  mapUnit: el("map-unit"),
  mapUnitNote: el("map-unit-note"),
  mapSite: el("map-site"),
  mapName: el("map-name"),
  mapNameField: el("map-name-field"),
  exportCsv: el("export-csv"),
  weatherBlock: el("weather-block"),
  weatherPlace: el("weather-place"),
  weatherSearch: el("weather-search"),
  weatherForget: el("weather-forget"),
  weatherResults: el("weather-results"),
  weatherBase: el("weather-base"),
  weatherMode: el("weather-mode"),
  weatherStatus: el("weather-status"),
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
/** Données embarquées dans un livrable autonome (voir scripts/build_export.py).
 *  Encodées en base64 : un nom de site ne peut pas casser la page en fermant
 *  la balise <script> par accident. */
function embeddedCsv() {
  const node = document.getElementById("embedded-data");
  if (!node) return null;
  const binary = atob(node.textContent.trim());
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function embeddedConfig() {
  const node = document.getElementById("embedded-config");
  if (!node) return null;
  try {
    return JSON.parse(node.textContent);
  } catch {
    return null;
  }
}

/** Habille la page en livrable : nom du client, mention de génération, et
 *  disparition des boutons de chargement (les données sont déjà dedans). */
function applyExportConfig(config) {
  document.body.classList.add("is-export");
  if (config.tariff) state.tariff = { ...state.tariff, ...config.tariff };
  if (config.weather) {
    state.weather.config = { ...weather.DEFAULTS, ...config.weather };
    state.weather.days = weather.daysFromEmbedded(config.weather.days);
    state.weather.embedded = true;
  } else {
    nodes.weatherBlock.hidden = true; // sans températures, le panneau n'a rien à dire
  }
  if (config.client) {
    document.querySelector(".topbar .eyebrow").textContent = config.client;
    document.title = `${config.client} — Énergie & puissance`;
  }
  if (config.title) document.querySelector(".topbar h1").textContent = config.title;
  const note = document.createElement("p");
  note.className = "export-note";
  note.textContent = [
    config.generated ? `Document généré le ${config.generated}` : null,
    config.source ? `à partir de ${config.source}` : null,
  ].filter(Boolean).join(" ") + ". Les données sont contenues dans ce fichier :"
    + " il fonctionne hors ligne et n'envoie rien sur Internet.";
  document.querySelector(".page-footer").prepend(note);
}

/** Télécharge un fichier texte ; l'interprétation revient à loadText. */
async function fetchText(url) {
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
  return response.text();
}

// --------------------------------------------------------------------------
// Fichiers Excel, liens, désignation des colonnes
// --------------------------------------------------------------------------
/** Charge SheetJS à la demande : un classeur Excel est un ZIP de XML, il faut
 *  une bibliothèque pour le lire. Un mégaoctet qu'on ne fait payer qu'à ceux
 *  qui ouvrent un .xlsx — et jamais au livrable client. */
async function ensureSheetJs() {
  if (window.XLSX) return;
  await new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = SHEETJS_SRC;
    tag.onload = resolve;
    tag.onerror = () => reject(new Error(
      "lecteur Excel introuvable. Enregistrez la feuille en CSV depuis Excel, puis rechargez-la.",
    ));
    document.head.append(tag);
  });
}

/** Première feuille du classeur, convertie en CSV pour rejoindre le chemin normal. */
async function spreadsheetToCsv(file) {
  await ensureSheetJs();
  const book = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const name = book.SheetNames[0];
  const sheet = name && book.Sheets[name];
  if (!sheet) throw new Error("classeur vide.");
  return { csv: window.XLSX.utils.sheet_to_csv(sheet, { dateNF: "yyyy-mm-dd hh:mm:ss" }), name };
}

const signature = (header) => header.join("|").toLowerCase();

function readMappings() {
  try {
    return JSON.parse(localStorage.getItem(MAPPINGS_KEY) || "{}");
  } catch {
    return {};
  }
}

/** Mémorise la désignation par empreinte d'en-tête : le même export, le mois
 *  suivant, passe sans repasser par le formulaire. */
function rememberMapping(header, mapping) {
  try {
    const all = readMappings();
    all[signature(header)] = mapping;
    localStorage.setItem(MAPPINGS_KEY, JSON.stringify(all));
  } catch {
    /* navigation privée : tant pis, on redemandera */
  }
}

let pending = null; // table en attente de désignation

/** Point d'entrée unique : un texte CSV devient un jeu de données affiché,
 *  ou ouvre le formulaire de désignation des colonnes. */
function loadText(text, source) {
  const fallbackName = source.replace(/\.[^.]+$/, "");
  try {
    const rows = data.parse(text, fallbackName);
    adopt(new data.Dataset(rows, source), {
      message: `${source} chargé — ${fmt(rows.length)} mesures`,
      tone: "is-ok",
    });
  } catch (error) {
    if (!(error instanceof data.MappingNeeded)) {
      say(`Import refusé — ${error.message}`, "is-error");
      return;
    }
    const known = readMappings()[signature(error.table.header)];
    if (known) {
      try {
        const rows = data.toMeasures(error.table, { ...known, siteName: known.siteName || fallbackName });
        adopt(new data.Dataset(rows, source), {
          message: `${source} chargé — ${fmt(rows.length)} mesures (colonnes reconnues)`,
          tone: "is-ok",
        });
        return;
      } catch {
        /* la désignation mémorisée ne colle plus : on redemande */
      }
    }
    openMapper(error.table, error.suggestion, source);
  }
}

function checkedPowers() {
  return [...nodes.mapPowerList.querySelectorAll("input:checked")].map((box) => Number(box.value));
}

function currentMapping() {
  const powers = checkedPowers();
  return {
    timestamp: Number(nodes.mapTimestamp.value),
    power: powers.length === 1 ? powers[0] : powers,
    site: Number(nodes.mapSite.value),
    unit: nodes.mapUnit.value,
    siteName: nodes.mapName.value,
  };
}

/** Liste à cocher des colonnes de puissance : un fichier de sous-comptage en
 *  porte une par compteur, et chacune deviendra une série du tableau de bord. */
function fillPowerList(header, selected) {
  const chosen = new Set(Array.isArray(selected) ? selected : [selected]);
  nodes.mapPowerList.replaceChildren();
  header.forEach((name, index) => {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.value = String(index);
    box.checked = chosen.has(index);
    label.classList.toggle("is-on", box.checked);
    label.append(box, document.createTextNode(name || `Colonne ${index + 1}`));
    box.addEventListener("change", () => {
      label.classList.toggle("is-on", box.checked);
      updatePowerNote();
      renderPreview();
    });
    nodes.mapPowerList.append(label);
  });
  updatePowerNote();
}

function updatePowerNote() {
  const count = checkedPowers().length;
  if (count === 0) {
    nodes.mapPowerNote.textContent = "Cochez au moins une colonne.";
  } else if (count === 1) {
    nodes.mapPowerNote.textContent = "Une seule courbe sera tracée.";
  } else {
    nodes.mapPowerNote.textContent = `${count} compteurs : un par courbe, et leur somme`
      + " pour les indicateurs. Ne cochez pas en même temps un compteur général et"
      + " ceux qu'il totalise — la consommation serait comptée deux fois.";
  }
  // L'unité suit la première colonne cochée.
  const first = checkedPowers()[0];
  if (first !== undefined && pending) {
    nodes.mapUnit.value = data.detectUnitFor(pending.table, first);
    const echantillon = pending.table.rows[0]?.[first];
    nodes.mapUnitNote.textContent = echantillon
      ? `déduite de « ${String(pending.table.header[first]).trim()} » et de l'ordre de grandeur `
        + `(${echantillon}) — corrigez si besoin`
      : "";
  }
}

function fillSelect(select, header, selected, noneLabel) {
  select.replaceChildren();
  if (noneLabel) {
    const none = document.createElement("option");
    none.value = "-1";
    none.textContent = noneLabel;
    select.append(none);
  }
  header.forEach((name, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = name || `Colonne ${index + 1}`;
    select.append(option);
  });
  select.value = String(selected);
}

/** Aperçu des premières lignes, colonnes retenues mises en évidence. */
function renderPreview() {
  if (!pending) return;
  const { header, rows } = pending.table;
  const mapping = currentMapping();
  const powers = Array.isArray(mapping.power) ? mapping.power : [mapping.power];
  const used = new Set([mapping.timestamp, ...powers, mapping.site].filter((v) => v >= 0));
  const head = document.createElement("tr");
  header.forEach((name, index) => {
    const th = document.createElement("th");
    th.textContent = name || `Colonne ${index + 1}`;
    if (used.has(index)) th.className = "is-used";
    head.append(th);
  });
  const body = rows.slice(0, 4).map((cells) => {
    const tr = document.createElement("tr");
    header.forEach((_, index) => {
      const td = document.createElement("td");
      td.textContent = cells[index] ?? "";
      if (used.has(index)) td.className = "is-used";
      tr.append(td);
    });
    return tr;
  });
  nodes.mapperTable.replaceChildren(head, ...body);
  // Avec plusieurs compteurs, les noms viennent des intitulés de colonnes.
  nodes.mapNameField.hidden = Number(nodes.mapSite.value) >= 0 || powers.length > 1;
}

function openMapper(table, suggestion, source) {
  pending = { table, source };
  nodes.mapperIntro.textContent = `${source} — ${fmt(table.rows.length)} lignes.`
    + " Les intitulés ne sont pas ceux attendus : indiquez quelle colonne porte quoi.";
  fillSelect(nodes.mapTimestamp, table.header, suggestion.timestamp);
  fillPowerList(table.header, suggestion.power);
  fillSelect(nodes.mapSite, table.header, suggestion.site, "aucune — un seul site");
  nodes.mapUnit.value = suggestion.unit || "kW";
  nodes.mapName.value = suggestion.siteName || source.replace(/\.[^.]+$/, "");
  renderPreview();
  nodes.mapper.hidden = false;
  say("");
  nodes.mapper.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeMapper() {
  nodes.mapper.hidden = true;
  pending = null;
}

function applyMapper() {
  if (!pending) return;
  const mapping = currentMapping();
  try {
    const rows = data.toMeasures(pending.table, mapping);
    rememberMapping(pending.table.header, mapping);
    const source = pending.source;
    closeMapper();
    adopt(new data.Dataset(rows, source), {
      message: `${source} chargé — ${fmt(rows.length)} mesures`,
      tone: "is-ok",
    });
  } catch (error) {
    say(error.message, "is-error");
  }
}

/** Désignation des colonnes transportée dans l'adresse.
 *
 *  `?data=<url>&t=0&p=6&s=-1&u=W&n=site A` ouvre directement le bon tableau de
 *  bord, sur n'importe quel navigateur, sans passer par le formulaire : c'est
 *  ce qui rend un signet partageable. Sans `p`, on retombe sur la détection
 *  automatique et le formulaire.
 */
function mappingFromParams(params) {
  if (!params.has("p")) return null;
  const num = (key, fallback) => {
    const value = Number(params.get(key));
    return Number.isFinite(value) ? value : fallback;
  };
  const powers = String(params.get("p"))
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value) && value >= 0);
  return {
    timestamp: num("t", 0),
    power: powers.length > 1 ? powers : (powers[0] ?? -1),
    site: num("s", -1),
    unit: params.get("u") || "kW",
    siteName: params.get("n") || "",
  };
}

/** Transforme une adresse de feuille Google en adresse de CSV. */
function sheetCsvUrl(raw) {
  const url = raw.trim();
  if (!/docs\.google\.com\/spreadsheets/.test(url)) return url;
  try {
    const parsed = new URL(url);
    if (parsed.pathname.includes("/d/e/")) {
      // Feuille « publiée sur le web » : la seule forme lisible par une page.
      parsed.pathname = parsed.pathname.replace(/\/(pubhtml|pub)$/, "/pub");
      parsed.searchParams.set("output", "csv");
      parsed.searchParams.set("single", "true");
      return parsed.toString();
    }
    const id = parsed.pathname.match(/\/d\/([^/]+)/);
    if (id) {
      const gid = (url.match(/[#&?]gid=(\d+)/) || [])[1] || "0";
      return `https://docs.google.com/spreadsheets/d/${id[1]}/export?format=csv&gid=${gid}`;
    }
  } catch {
    /* adresse non analysable : on la passe telle quelle */
  }
  return url;
}

async function loadFromLink(raw, { remember = true } = {}) {
  const url = sheetCsvUrl(raw);
  say("Chargement du lien…");
  let text;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`réponse ${response.status}`);
    text = await response.text();
  } catch (error) {
    say(
      /docs\.google\.com/.test(raw)
        ? "Google refuse la lecture directe de cette feuille. Dans Google Sheets :"
          + " Fichier → Partager → Publier sur le web → CSV, puis collez le lien obtenu."
        : `Lecture impossible : ${error.message}`,
      "is-error",
    );
    return;
  }
  if (remember) {
    try {
      localStorage.setItem(LINK_KEY, raw);
    } catch {
      /* sans mémoire, le lien vaut pour cette visite */
    }
    nodes.linkForget.hidden = false;
  }
  const name = /docs\.google\.com/.test(raw)
    ? "Google Sheets"
    : decodeURIComponent(url.split("/").pop().split("?")[0]) || "lien";
  loadText(text, name);
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
  // Les températures arrivent après coup : la page est déjà lisible, elle
  // gagne ses cartes climatiques quand la réponse revient.
  loadWeather();
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

/** Construit les champs du panneau tarifaire à partir de tariff.FIELDS. */
function buildTariffFields() {
  let timer = null;
  for (const field of tariff.FIELDS) {
    const box = document.createElement("div");
    box.className = "tariff-field";
    const id = `tariff-${field.key}`;
    box.innerHTML = `<label for="${id}">${field.label}</label>`
      + `<span class="tariff-input"><input type="number" id="${id}" min="0"`
      + ` step="${field.step}"${field.max ? ` max="${field.max}"` : ""}>`
      + `<span class="unit">${field.unit}</span></span>`;
    const input = box.querySelector("input");
    input.value = state.tariff[field.key];
    input.addEventListener("input", () => {
      const value = Number(input.value);
      state.tariff[field.key] = Number.isFinite(value) ? value : tariff.DEFAULTS[field.key];
      tariff.save(state.tariff);
      // On attend une pause de frappe : sinon chaque chiffre relance tout le calcul.
      clearTimeout(timer);
      timer = setTimeout(render, 250);
    });
    nodes.tariffFields.append(box);
  }
}

/** Panneau météo : commune, température de base, sens de la thermosensibilité.
 *  Rien n'est téléchargé tant qu'aucune commune n'est choisie — la première
 *  ouverture de la page ne parle à personne. */
function wireWeather() {
  const config = state.weather.config;
  nodes.weatherPlace.value = config.place;
  nodes.weatherBase.value = config.base;
  nodes.weatherMode.value = config.mode;
  nodes.weatherForget.hidden = !weather.isConfigured(config);
  if (state.weather.embedded) {
    weatherSay(`${config.place} — ${fmt(state.weather.days.size)} journées de température`
      + " contenues dans ce fichier. Le calcul se refait ici, hors ligne.");
  } else if (!weather.isConfigured(config)) {
    weatherSay("Indiquez la commune du site pour croiser le relevé avec la température.");
  }

  nodes.weatherSearch.addEventListener("click", searchPlace);
  nodes.weatherPlace.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); searchPlace(); }
  });

  // La base et le sens ne dépendent que du calcul : aucune requête, on
  // recalcule sur place.
  nodes.weatherBase.addEventListener("change", () => {
    const value = Number(nodes.weatherBase.value);
    config.base = Number.isFinite(value) ? value : weather.DEFAULTS.base;
    nodes.weatherBase.value = config.base;
    weather.save(config);
    if (state.dataset) render();
  });
  nodes.weatherMode.addEventListener("change", () => {
    config.mode = nodes.weatherMode.value;
    weather.save(config);
    if (state.dataset) render();
  });

  nodes.weatherForget.addEventListener("click", () => {
    Object.assign(config, { place: "", lat: null, lon: null });
    weather.save(config);
    state.weather.days = new Map();
    nodes.weatherPlace.value = "";
    nodes.weatherResults.hidden = true;
    nodes.weatherForget.hidden = true;
    weatherSay("Commune retirée — le tableau de bord ignore de nouveau la météo.");
    if (state.dataset) render();
  });
}

function weatherSay(message, tone = "") {
  nodes.weatherStatus.textContent = message;
  nodes.weatherStatus.className = `tariff-note ${tone}`.trim();
}

async function searchPlace() {
  const query = nodes.weatherPlace.value.trim();
  if (!query) return;
  nodes.weatherResults.hidden = true;
  weatherSay(`Recherche de « ${query} »…`);
  let hits;
  try {
    hits = await weather.search(query);
  } catch (error) {
    weatherSay(error.message, "is-error");
    return;
  }
  if (!hits.length) {
    weatherSay(`Aucune commune trouvée pour « ${query} ».`, "is-error");
    return;
  }
  weatherSay(hits.length === 1
    ? "Une commune trouvée — cliquez-la pour la retenir."
    : `${hits.length} communes trouvées — cliquez la bonne.`);
  nodes.weatherResults.replaceChildren();
  for (const hit of hits) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = hit.label;
    button.addEventListener("click", () => {
      Object.assign(state.weather.config, { place: hit.label, lat: hit.lat, lon: hit.lon });
      weather.save(state.weather.config);
      nodes.weatherPlace.value = hit.label;
      nodes.weatherResults.hidden = true;
      nodes.weatherForget.hidden = false;
      loadWeather();
    });
    nodes.weatherResults.append(button);
  }
  nodes.weatherResults.hidden = false;
}

/** Va chercher les températures couvrant le relevé courant, puis redessine.
 *  Un échec ne bloque jamais rien : le tableau de bord perd ses deux cartes
 *  climatiques et garde tout le reste. */
async function loadWeather() {
  const store = state.weather;
  // Livrable autonome : les températures sont déjà dans le fichier, et il ne
  // doit émettre aucune requête.
  if (store.embedded || !state.dataset) return;
  if (!weather.isConfigured(store.config)) {
    store.days = new Map();
    return;
  }
  weatherSay(`Températures de ${store.config.place} : chargement…`);
  try {
    store.days = await weather.daysFor(
      store.config,
      startOfDay(state.dataset.start),
      startOfDay(state.dataset.end),
    );
    weatherSay(`${store.config.place} — ${fmt(store.days.size)} journées de température en mémoire.`);
  } catch (error) {
    store.days = new Map();
    weatherSay(error.message, "is-error");
  }
  render();
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

  nodes.file.addEventListener("change", async () => {
    const file = nodes.file.files[0];
    nodes.file.value = ""; // permet de recharger deux fois le même fichier
    if (!file) return;
    try {
      if (/\.xlsx?$/i.test(file.name)) {
        const { csv, name } = await spreadsheetToCsv(file);
        loadText(csv, `${file.name} (feuille « ${name} »)`);
      } else {
        loadText(await file.text(), file.name);
      }
    } catch (error) {
      say(`Import refusé — ${error.message}`, "is-error");
    }
  });

  nodes.linkToggle.addEventListener("click", () => {
    nodes.linkRow.hidden = !nodes.linkRow.hidden;
    if (!nodes.linkRow.hidden) nodes.linkInput.focus();
  });
  nodes.linkLoad.addEventListener("click", () => {
    const raw = nodes.linkInput.value.trim();
    if (raw) loadFromLink(raw);
  });
  nodes.linkInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") nodes.linkLoad.click();
  });
  nodes.linkForget.addEventListener("click", () => {
    try {
      localStorage.removeItem(LINK_KEY);
    } catch { /* rien à oublier */ }
    nodes.linkInput.value = "";
    nodes.linkForget.hidden = true;
    say("Lien oublié — la page repartira des données de démonstration.", "is-ok");
  });

  for (const select of [nodes.mapTimestamp, nodes.mapSite]) {
    select.addEventListener("change", renderPreview);
  }
  el("map-apply").addEventListener("click", applyMapper);
  el("map-cancel").addEventListener("click", () => {
    closeMapper();
    say("Import annulé.");
  });

  nodes.exportCsv.addEventListener("click", downloadNormalised);

  nodes.reset.addEventListener("click", async () => {
    try {
      localStorage.removeItem(LINK_KEY);
    } catch { /* pas de mémoire, rien à effacer */ }
    nodes.linkForget.hidden = true;
    closeMapper();
    try {
      loadText(await fetchText(DEFAULT_CSV), "sample_energy.csv");
      say("Retour aux données de démonstration", "is-ok");
    } catch (error) {
      say(error.message, "is-error");
    }
  });
}

/** Enregistre les données courantes aux colonnes attendues.
 *  C'est la sortie de secours du chemin « Excel bricolé -> outil » : une fois
 *  les colonnes désignées, on repart avec un fichier propre, réutilisable par
 *  scripts/build_export.py comme par n'importe quel tableur. */
function downloadNormalised() {
  const ds = state.dataset;
  if (!ds) return;
  const lines = ["timestamp,site,power_kw"];
  for (const row of ds.rows) {
    const site = `"${row.site.replace(/"/g, '""')}"`;
    lines.push(`${isoStamp(new Date(row.t))},${site},${row.kw}`);
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = ds.source.replace(/\.[^.]+$/, "").replace(/[^\w\-]+/g, "-") + "-normalise.csv";
  link.click();
  URL.revokeObjectURL(link.href);
  say(`${fmt(ds.rows.length)} mesures enregistrées au format attendu.`, "is-ok");
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

/** Regroupe tout ce qu'une période raconte : indicateurs, coût, dépassements. */
function summarise(rows, spanDays) {
  const step = state.dataset.stepHours;
  const base = data.kpis(rows, step);
  const cost = tariff.costs(rows, step, state.tariff, spanDays);
  const over = tariff.overruns(data.totalCurve(rows), step, state.tariff);
  return {
    ...base,
    cost,
    over,
    total: cost.energyCost + cost.subscription + (over ? over.cost : 0),
  };
}

function neutralDelta(text) {
  const box = document.createElement("div");
  box.className = "delta is-neutral";
  box.textContent = text;
  return box;
}

/** Tuile « dépassements » — ou, tant que la puissance souscrite est inconnue,
 *  la puissance qu'il faudrait viser. */
function overrunTile(current, previous, optimal) {
  if (!current.over) {
    return tile(
      "Puissance à viser",
      optimal ? fmt(optimal) : "—",
      "kW",
      "dépassée 1 % du temps — renseignez votre puissance souscrite",
      null,
    );
  }
  const caption = `jusqu'à +${fmt(current.over.maxOver)} kW · optimum ≈ ${fmt(optimal)} kW`;
  const delta = previous?.over
    ? (previous.over.hours === 0
        ? neutralDelta("aucun dépassement sur la période précédente")
        : deltaLine(current.over.hours, previous.over.hours, "lower"))
    : null;
  return tile("Dépassements", fmt(current.over.hours, 1), "h", caption, delta);
}

function costTile(current, previous) {
  const parts = [`énergie ${fmt(current.cost.energyCost)} €`];
  if (current.cost.subscription > 0) parts.push(`abonnement ${fmt(current.cost.subscription)} €`);
  if (current.over && current.over.cost > 0) {
    parts.push(`dépassements ${fmt(current.over.cost)} €`);
  }
  return tile("Coût estimé", fmt(current.total), "€", parts.join(" · "),
    deltaLine(current.total, previous?.total, "lower"));
}

/** Rigueur climatique de la période, et celle de la période précédente.
 *  L'écart n'est ni bon ni mauvais — c'est le temps qu'il a fait : la tuile le
 *  dit en toutes lettres plutôt qu'en vert ou en rouge. */
function climateTile(climate) {
  const unit = weather.unitLabel(climate.mode);
  const caption = `base ${fmt(state.weather.config.base, 1)} °C · `
    + `${weather.MODE_LABELS[climate.mode]} · ${state.weather.config.place || "commune choisie"}`;
  const previous = climate.previous
    ? neutralDelta(`${fmt(climate.previous.dju)} ${unit} sur la période précédente`)
    : neutralDelta("période précédente indisponible");
  return tile("Rigueur climatique", fmt(climate.current.dju), unit, caption, previous);
}

/** L'écart de consommation une fois le climat neutralisé — la tuile qui dit si
 *  une action d'économie a produit quelque chose, ou si l'hiver a simplement
 *  été plus doux. */
function adjustedTile(climate) {
  const adjusted = climate.adjusted;
  if (!adjusted) return null;
  const signed = (value) => `${value > 0 ? "+" : "\u2212"}${fmt(Math.abs(value), 1)}`;
  const box = tile(
    "Écart corrigé du climat",
    signed(adjusted.change),
    "%",
    `à climat identique · écart brut ${signed(adjusted.rawChange)} %`,
    neutralDelta(
      `${fmt(climate.current.energyPerDay)} kWh/j observés, `
      + `${fmt(adjusted.adjustedPerDay)} attendus au climat de la période`,
    ),
  );
  return box;
}

function renderKpis(current, previous, optimal, climate) {
  const energy = humanEnergy(current.energy);
  const split = current.cost.energyHp + current.cost.energyHc;
  const hcShare = split ? (current.cost.energyHc / split) * 100 : 0;
  const energyCaption = state.tariff.hcStart === state.tariff.hcEnd
    ? "sur la période affichée"
    : `dont ${fmt(hcShare)} % en heures creuses`;

  nodes.kpis.replaceChildren(
    tile("Énergie consommée", energy.value, energy.unit, energyCaption,
      deltaLine(current.energy, previous?.energy, "lower")),
    tile("Puissance de pointe", fmt(current.peak), "kW",
      current.peakAt ? stampLong(current.peakAt) : "—",
      deltaLine(current.peak, previous?.peak, "lower")),
    tile("Puissance moyenne", fmt(current.mean), "kW", "tous sites confondus",
      deltaLine(current.mean, previous?.mean, "lower")),
    tile("Facteur de charge", fmt(current.loadFactor, 1), "%", "moyenne ÷ pointe",
      deltaLine(current.loadFactor, previous?.loadFactor, "higher")),
    overrunTile(current, previous, optimal),
    costTile(current, previous),
  );
  if (climate) {
    nodes.kpis.append(climateTile(climate));
    const adjusted = adjustedTile(climate);
    if (adjusted) nodes.kpis.append(adjusted);
  }
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
// Climat
// --------------------------------------------------------------------------
/** Croise le relevé et les températures : nuage de points, droite de
 *  thermosensibilité, cumuls des deux périodes et écart corrigé.
 *
 *  La droite est ajustée sur TOUT le relevé (sites cochés compris), pas sur la
 *  seule période affichée : sur sept jours, une pente n'a aucun sens, et c'est
 *  pourtant cette fenêtre qu'on regarde le plus souvent.
 */
function climateOf(current, previous) {
  const store = state.weather;
  if (!store.days.size) return null;
  const step = state.dataset.stepHours;
  const base = store.config.base;

  const scope = data.slicePeriod(state.dataset.rows, null, null, state.sites);
  const allCells = weather.daily(scope, step, store.days, base);
  if (allCells.length < 5) return null;

  const mode = store.config.mode === "auto" ? weather.pickMode(allCells) : store.config.mode;
  const sign = weather.signature(allCells, mode);
  const currentCells = weather.daily(current, step, store.days, base);
  const currentTotals = weather.totals(currentCells, mode);
  const previousTotals = weather.totals(weather.daily(previous, step, store.days, base), mode);

  // Le nuage porte tout le relevé ; la période affichée y est mise en avant.
  const from = state.start.getTime();
  const to = state.end.getTime() + 86400000;
  const shown = (point) => point.t >= from && point.t < to;

  return {
    mode,
    model: sign.model,
    grain: sign.grain,
    currentCells,
    inside: sign.points.filter(shown),
    outside: sign.points.filter((point) => !shown(point)),
    current: currentTotals,
    previous: previousTotals,
    adjusted: weather.climateAdjusted(currentTotals, previousTotals, sign.model),
  };
}

/** Les cartes climatiques.
 *
 *  Le nuage de points s'affiche dès qu'il y a des journées à croiser : quand un
 *  site ne réagit pas au temps qu'il fait, c'est un résultat de diagnostic et
 *  il se voit là. La carte « observé / attendu », elle, n'apparaît que si la
 *  droite tient debout — sinon elle tracerait une attente inventée. */
function renderClimate(climate) {
  const enough = Boolean(climate)
    && climate.inside.length + climate.outside.length >= 5;
  const model = enough && weather.isUsable(climate.model) ? climate.model : null;
  el("card-signature").hidden = !enough;
  el("card-expected").hidden = !model;
  if (!enough) return;

  const unit = weather.unitLabel(climate.mode);
  const points = climate.inside.length + climate.outside.length;
  el("hint-signature").textContent = model
    ? `${fmt(model.slope)} kWh par ${unit} au-delà d'un talon de `
      + `${fmt(model.perDay)} kWh/j · R² = ${fmt(model.r2, 2)} `
      + `sur ${fmt(model.n)} ${climate.grain === "semaine" ? "semaines" : "journées"}`
    : `Consommation insensible à la température sur ce relevé (${fmt(points)} points) :`
      + " le nuage ne dessine aucune droite exploitable, et rien n'est corrigé du climat.";
  draw("fig-signature", figures.energySignature(
    climate.inside, climate.outside, model, unit, climate.grain,
  ));

  if (!model) return;
  el("hint-expected").textContent = `Attendu = ${fmt(model.perDay)} kWh + ${fmt(model.slope)} kWh`
    + ` × ${unit} du jour. Au-dessus du trait, la journée a consommé plus que le temps`
    + " ne l'explique.";
  draw("fig-expected", figures.climateExpectation(
    climate.currentCells, { slope: model.slope, intercept: model.perDay }, climate.mode,
  ));
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

  const spanDays = (state.end - state.start) / 86400000 + 1;
  const current = data.slicePeriod(ds.rows, state.start, state.end, state.sites);
  if (!current.length) {
    renderKpis(summarise([], spanDays), null, null, null);
    for (const id of ["fig-power", "fig-energy", "fig-duration", "fig-profile"]) {
      draw(id, figures.empty());
    }
    renderClimate(null);
    renderTable([], state.freq);
    return;
  }

  const previous = data.previousPeriod(ds.rows, state.start, state.end, state.sites);
  const agg = data.aggregate(current, state.freq, ds.stepHours);
  const energyAgg = data.aggregate(current, ENERGY_FREQ[state.freq], ds.stepHours);
  const duration = data.loadDuration(current);

  const climate = climateOf(current, previous);
  renderKpis(
    summarise(current, spanDays),
    previous.length ? summarise(previous, spanDays) : null,
    tariff.optimalPower(duration, 1),
    climate,
  );
  draw("fig-power", figures.powerTimeseries(agg, colors));
  draw("fig-energy", figures.energyBars(energyAgg, colors));
  draw("fig-duration", figures.loadDurationCurve(duration, state.tariff.subscribedKw));
  draw("fig-profile", figures.loadProfile(data.heatMatrix(current)));
  renderClimate(climate);
  renderTable(agg, state.freq);
}

// --------------------------------------------------------------------------
// Démarrage
// --------------------------------------------------------------------------
async function boot() {
  const config = embeddedConfig();
  if (config) applyExportConfig(config); // avant les champs : le tarif est déjà à jour
  buildTariffFields();
  wireWeather();
  wireControls();

  const csv = embeddedCsv();
  if (csv) {
    adopt(new data.Dataset(data.parse(csv), config?.source || "données embarquées"));
    return;
  }

  // ?data=<url> permet de pointer la page vers un autre relevé sans la modifier.
  const param = new URLSearchParams(location.search).get("data");
  let saved = null;
  try {
    saved = localStorage.getItem(LINK_KEY);
  } catch { /* pas de mémoire disponible */ }

  if (!param && saved) {
    nodes.linkInput.value = saved;
    nodes.linkForget.hidden = false;
    await loadFromLink(saved, { remember: false });
    return;
  }

  const url = param || DEFAULT_CSV;
  const name = param && /docs\.google\.com/.test(param)
    ? "Google Sheets"
    : url.split("/").pop().split("?")[0] || "données";
  try {
    const text = await fetchText(sheetCsvUrl(url));
    const forced = param && mappingFromParams(new URLSearchParams(location.search));
    if (forced) {
      const table = data.readTable(text);
      const rows = data.toMeasures(table, forced);
      adopt(new data.Dataset(rows, forced.siteName || name), {
        message: `${fmt(rows.length)} mesures chargées depuis l'adresse`,
        tone: "is-ok",
      });
      return;
    }
    loadText(text, name);
  } catch (error) {
    nodes.chip.textContent = "aucune donnée";
    say(error.message, "is-error");
  }
}

boot();
