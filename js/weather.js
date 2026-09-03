// Météo : rigueur climatique, signature énergétique, correction du climat.
//
// Pourquoi un module à part : les mesures viennent du client et ne quittent
// jamais le navigateur ; la température vient d'un service public et ne sait
// rien du relevé. Le seul point de contact entre les deux est la journée.
//
// Ce qui part sur le réseau : des coordonnées et deux dates. Jamais une
// puissance, jamais un nom de site, jamais un nom de fichier. Et le livrable
// autonome embarque les températures déjà lues : il ne demande plus rien.
//
// Le calcul des degrés-jours suit la méthode Costic (celle de Météo-France),
// pas la simple différence à la moyenne : sur une journée d'entre-saison, où
// le matin chauffe et l'après-midi non, l'écart entre les deux est du simple
// au double.

import { isoDay } from "./format.js?v=7";

const CONFIG_KEY = "energie.meteo.v1";
const CACHE_KEY = "energie.meteo.cache.v1";
const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const CACHED_PLACES = 3; // au-delà, on oublie les communes les plus anciennes

export class WeatherError extends Error {}

export const DEFAULTS = {
  place: "", // libellé affiché, ex. « Lyon (Rhône) »
  lat: null,
  lon: null,
  base: 18, // température de base des degrés-jours, en °C
  mode: "auto", // auto | chauffage | froid
};

export const MODE_LABELS = {
  chauffage: "chauffage",
  froid: "climatisation",
};

/** Nom de l'indicateur selon le sens : DJU chauffage, DJR climatisation. */
export const unitLabel = (mode) => (mode === "froid" ? "DJR" : "DJU");

export function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export function save(config) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    /* navigation privée : la commune vaut pour cette visite */
  }
}

export const isConfigured = (config) =>
  Number.isFinite(config?.lat) && Number.isFinite(config?.lon);

// --------------------------------------------------------------------------
// Degrés-jours (méthode Costic)
// --------------------------------------------------------------------------
/** Degrés-jours de chauffage d'une journée, base `base`.
 *  Trois cas : la journée entière sous la base, entière au-dessus, ou à cheval
 *  — c'est ce dernier que la pondération 0,08 / 0,42 traite correctement. */
export function heatingDegreeDay(tmin, tmax, base) {
  if (tmin >= base) return 0;
  if (tmax <= base) return base - (tmin + tmax) / 2;
  return (base - tmin) * (0.08 + (0.42 * (base - tmin)) / (tmax - tmin));
}

/** Degrés-jours de refroidissement : la même formule, retournée. */
export function coolingDegreeDay(tmin, tmax, base) {
  if (tmax <= base) return 0;
  if (tmin >= base) return (tmin + tmax) / 2 - base;
  return (tmax - base) * (0.08 + (0.42 * (tmax - base)) / (tmax - tmin));
}

// --------------------------------------------------------------------------
// Croisement relevé × température
// --------------------------------------------------------------------------
/** Énergie consommée par journée, tous sites confondus, et les degrés-jours
 *  de cette journée.
 *
 *  Les journées incomplètes sont écartées : le premier et le dernier jour d'un
 *  relevé ne portent souvent que quelques heures, et leur énergie tronquée
 *  s'assiérait sous le nuage de points en faisant croire à une économie.
 *  Le repère est le nombre médian de mesures par jour, pas un calcul théorique :
 *  il vaut quel que soit le pas de temps et le nombre de compteurs.
 */
export function daily(rows, stepHours, days, base) {
  const perDay = new Map();
  for (const row of rows) {
    const key = isoDay(new Date(row.t));
    let cell = perDay.get(key);
    if (!cell) {
      cell = { day: key, kwh: 0, count: 0 };
      perDay.set(key, cell);
    }
    cell.kwh += row.kw * stepHours;
    cell.count += 1;
  }
  if (!perDay.size) return [];

  const counts = [...perDay.values()].map((c) => c.count).sort((a, b) => a - b);
  const complete = counts[Math.floor(counts.length / 2)] * 0.8;

  const out = [];
  for (const cell of perDay.values()) {
    if (cell.count < complete) continue;
    const temps = days.get(cell.day);
    if (!temps) continue;
    out.push({
      day: cell.day,
      t: new Date(`${cell.day}T00:00:00`).getTime(),
      kwh: cell.kwh,
      tmean: temps.tmean,
      hdd: heatingDegreeDay(temps.tmin, temps.tmax, base),
      cdd: coolingDegreeDay(temps.tmin, temps.tmax, base),
    });
  }
  return out.sort((a, b) => a.t - b.t);
}

const degreeDaysOf = (cell, mode) => (mode === "froid" ? cell.cdd : cell.hdd);

/** Droite des moindres carrés y = intercept + slope·x, et son R².
 *  `slope` est la thermosensibilité en kWh par degré-jour, `intercept` le
 *  talon : ce que le site consomme quand le climat ne demande rien. */
export function fit(points) {
  const n = points.length;
  if (n < 5) return null;
  let sx = 0;
  let sy = 0;
  for (const p of points) { sx += p.x; sy += p.y; }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx <= 0) return null; // tous les jours au même degré-jour : pas de pente
  const slope = sxy / sxx;
  return {
    slope,
    intercept: my - slope * mx,
    r2: syy > 0 ? (sxy * sxy) / (sxx * syy) : 0,
    n,
  };
}

/** Le nuage de points d'un sens donné : degrés-jours en X, énergie en Y. */
export const points = (cells, mode) =>
  cells.map((cell) => ({ x: degreeDaysOf(cell, mode), y: cell.kwh, day: cell.day, t: cell.t }));

const WEEKLY_MINIMUM = 6; // semaines complètes en deçà desquelles on reste au jour

/** Additionne les journées en semaines complètes (lundi → dimanche).
 *  Les semaines entamées sont écartées : six jours pesés comme sept
 *  déplaceraient le point sous la droite. */
export function weekly(cells) {
  const weeks = new Map();
  for (const cell of cells) {
    const date = new Date(cell.t);
    const monday = new Date(
      date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7),
    );
    const key = isoDay(monday);
    let week = weeks.get(key);
    if (!week) {
      week = { day: key, t: monday.getTime(), kwh: 0, hdd: 0, cdd: 0, days: 0 };
      weeks.set(key, week);
    }
    week.kwh += cell.kwh;
    week.hdd += cell.hdd;
    week.cdd += cell.cdd;
    week.days += 1;
  }
  return [...weeks.values()].filter((week) => week.days === 7).sort((a, b) => a.t - b.t);
}

/** Le nuage sur lequel s'ajuste la droite, et le grain retenu.
 *
 *  Pourquoi la semaine dès qu'il y en a assez : au pas journalier, le rythme
 *  hebdomadaire écrase la température. Sur un relevé où l'on a MIS un talon de
 *  8 000 kWh/j, 350 kWh par DJU et des week-ends au ralenti, l'ajustement
 *  journalier ne rend qu'un R² de 0,14 et une pente de 249 — la semaine rend
 *  0,96 et 311, soit exactement la thermosensibilité moyenne du relevé
 *  week-ends compris. Chaque point hebdomadaire contient cinq jours ouvrés et
 *  deux jours creux : ce qui varie encore d'un point à l'autre, c'est le temps
 *  qu'il a fait.
 *
 *  `intercept` est le talon d'un point (donc d'une semaine, au grain
 *  hebdomadaire), `perDay` le même talon ramené à la journée. `slope`, elle,
 *  est un rapport de kWh à des degrés-jours : elle ne dépend pas du grain.
 */
export function signature(cells, mode) {
  const weeks = weekly(cells);
  const byWeek = weeks.length >= WEEKLY_MINIMUM;
  const grainCells = byWeek ? weeks : cells;
  const cloud = points(grainCells, mode);
  const model = fit(cloud);
  return {
    grain: byWeek ? "semaine" : "jour",
    grainDays: byWeek ? 7 : 1,
    points: cloud,
    model: model && { ...model, perDay: model.intercept / (byWeek ? 7 : 1) },
  };
}

/** Sens de la thermosensibilité, quand l'utilisateur laisse « automatique ».
 *  On retient celui dont la droite explique le mieux la consommation. Un relevé
 *  d'été ne raconte rien du chauffage : c'est le froid qu'il faut regarder. */
export function pickMode(cells) {
  const score = (mode) => {
    const { model } = signature(cells, mode);
    // Une pente négative n'a pas de sens physique (plus de degrés-jours,
    // moins de consommation) : le sens choisi n'est pas le bon.
    return model && model.slope > 0 ? model.r2 : -1;
  };
  return score("froid") > score("chauffage") ? "froid" : "chauffage";
}

/** Cumuls d'une période : énergie, degrés-jours, et leurs moyennes par jour.
 *  Le passage par la moyenne journalière rend deux périodes comparables même
 *  si l'une a quelques jours de relevé en moins. */
export function totals(cells, mode) {
  const n = cells.length;
  if (!n) return null;
  let energy = 0;
  let dju = 0;
  for (const cell of cells) {
    energy += cell.kwh;
    dju += degreeDaysOf(cell, mode);
  }
  return { n, energy, dju, energyPerDay: energy / n, djuPerDay: dju / n };
}

/** Une droite mérite-t-elle qu'on s'appuie dessus ?
 *
 *  Deux garde-fous. La pente doit être positive : plus de degrés-jours et moins
 *  de consommation, c'est que le sens choisi n'est pas le bon. Et R² doit
 *  dépasser 0,3 : en dessous, la droite passe au travers d'un nuage informe et
 *  la « thermosensibilité » qu'on lirait serait du bruit mis en équation.
 *  C'est le cas courant d'un procédé industriel qui ne chauffe ni ne refroidit
 *  ses locaux — le tableau de bord doit le dire, pas le maquiller. */
export const isUsable = (model) => Boolean(model) && model.slope > 0 && model.r2 >= 0.3;

/** Écart de consommation entre deux périodes, une fois le climat neutralisé.
 *
 *  On restate la période précédente sous le climat de la période affichée :
 *      e_corrigée = e_précédente + pente × (dju_actuels − dju_précédents)
 *  Ce qui reste de l'écart n'est plus imputable à l'hiver ou à la canicule —
 *  c'est là que se lit l'effet d'une action d'économie.
 */
export function climateAdjusted(current, previous, model) {
  if (!current || !previous || !isUsable(model)) return null;
  const expected = previous.energyPerDay
    + model.slope * (current.djuPerDay - previous.djuPerDay);
  if (expected <= 0) return null;
  return {
    adjustedPerDay: expected,
    change: ((current.energyPerDay - expected) / expected) * 100,
    rawChange: ((current.energyPerDay - previous.energyPerDay) / previous.energyPerDay) * 100,
  };
}

// --------------------------------------------------------------------------
// Service de températures (open-meteo.com, sans clé ni compte)
// --------------------------------------------------------------------------
/** Recherche une commune. Renvoie au plus cinq propositions. */
export async function search(name) {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(name)}`
    + "&count=5&language=fr&format=json";
  let payload;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`réponse ${response.status}`);
    payload = await response.json();
  } catch (error) {
    throw new WeatherError(`Recherche impossible : ${error.message}`);
  }
  return (payload.results || []).map((hit) => ({
    label: [hit.name, hit.admin1, hit.country_code !== "FR" ? hit.country : null]
      .filter(Boolean)
      .join(", "),
    lat: hit.latitude,
    lon: hit.longitude,
  }));
}

const placeKey = (config) => `${config.lat.toFixed(3)},${config.lon.toFixed(3)}`;

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeCache(cache) {
  // On ne garde que les dernières communes consultées : trois relevés d'un an
  // au pas journalier tiennent largement, une collection ne tiendrait pas.
  const keys = Object.keys(cache);
  if (keys.length > CACHED_PLACES) {
    for (const key of keys.slice(0, keys.length - CACHED_PLACES)) delete cache[key];
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* mémoire pleine ou refusée : on retéléchargera au prochain passage */
  }
}

const addDays = (date, n) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

function eachDay(start, end) {
  const out = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) out.push(isoDay(d));
  return out;
}

/** Températures min/max/moyennes d'une plage de jours, en heure locale du site.
 *  Le cache est interrogé d'abord : seuls les jours manquants sont demandés,
 *  et en une seule requête. Une journée dont le service ne sait rien est
 *  mémorisée comme telle — sinon on la redemanderait à chaque ouverture. */
async function fetchRange(config, from, to) {
  const url = `${ARCHIVE_URL}?latitude=${config.lat}&longitude=${config.lon}`
    + `&start_date=${from}&end_date=${to}`
    + "&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean"
    + "&timezone=auto";
  let payload;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`réponse ${response.status}`);
    payload = await response.json();
  } catch (error) {
    throw new WeatherError(
      `Températures indisponibles : ${error.message}.`
      + " Le tableau de bord reste utilisable sans elles.",
    );
  }
  const table = payload.daily;
  if (!table || !table.time) throw new WeatherError("Réponse météo inattendue.");
  const out = {};
  table.time.forEach((day, i) => {
    const tmin = table.temperature_2m_min[i];
    const tmax = table.temperature_2m_max[i];
    out[day] = Number.isFinite(tmin) && Number.isFinite(tmax)
      ? [tmin, tmax, table.temperature_2m_mean[i]]
      : null; // journée connue comme absente : on ne la redemandera pas
  });
  return out;
}

/** Températures couvrant [start, end], cache compris.
 *  -> Map(« 2026-06-01 » -> { tmin, tmax, tmean }) */
export async function daysFor(config, start, end) {
  const key = placeKey(config);
  const cache = readCache();
  const stored = cache[key] || {};

  // Les archives s'arrêtent la veille : demander aujourd'hui ne rapporterait
  // qu'un trou, redemandé à chaque ouverture de la page.
  const limit = addDays(new Date(), -1);
  const last = end > limit ? limit : end;

  const missing = start <= last
    ? eachDay(start, last).filter((day) => !(day in stored))
    : [];
  if (missing.length) {
    const fetched = await fetchRange(config, missing[0], missing[missing.length - 1]);
    Object.assign(stored, fetched);
    delete cache[key]; // réinsertion en queue : la commune redevient récente
    cache[key] = stored;
    writeCache(cache);
  }

  const out = new Map();
  for (const [day, value] of Object.entries(stored)) {
    if (value) out.set(day, { tmin: value[0], tmax: value[1], tmean: value[2] });
  }
  return out;
}

/** Températures embarquées dans un livrable autonome : mêmes données, mais
 *  lues dans le fichier au lieu du réseau (voir scripts/build_export.py). */
export function daysFromEmbedded(table) {
  const out = new Map();
  for (const [day, value] of Object.entries(table || {})) {
    if (Array.isArray(value)) out.set(day, { tmin: value[0], tmax: value[1], tmean: value[2] });
  }
  return out;
}
