// Lecture, validation et agrégation des mesures — le calcul du tableau de bord.
// Tout se passe dans le navigateur : aucun fichier n'est envoyé nulle part.
//
// Format attendu (CSV) : timestamp, site, power_kw. L'ordre des colonnes est
// libre, le séparateur est deviné, l'écriture française des nombres acceptée.
// L'énergie n'est jamais lue : elle vaut puissance × durée du pas de temps.

export const GRANULARITIES = {
  raw: "Pas natif",
  h: "Heure",
  D: "Jour",
  W: "Semaine",
};

export class DataError extends Error {}

// --------------------------------------------------------------------------
// Lecture du CSV
// --------------------------------------------------------------------------
function splitLine(line, sep) {
  const out = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { out.push(field); field = ""; }
    else field += c;
  }
  out.push(field);
  return out.map((f) => f.trim());
}

/** Devine le séparateur sur la ligne d'en-tête : virgule, point-virgule ou tabulation. */
function sniff(headerLine) {
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = 0;
  for (const sep of candidates) {
    const n = splitLine(headerLine, sep).length;
    if (n > bestCount) { bestCount = n; best = sep; }
  }
  if (bestCount < 2) throw new DataError("Séparateur introuvable : le fichier n'a qu'une colonne.");
  return best;
}

// Espaces ordinaires, insécables et fines insécables : tous séparateurs de
// milliers possibles dans un export francophone.
const NUMBER_CLEAN = /[\s\u00a0\u202f]/g;

/** Accepte « 1 234,5 » (export Excel francophone) comme « 1234.5 ». */
function toNumber(text) {
  if (text === "" || text === undefined) return NaN;
  return Number(String(text).replace(NUMBER_CLEAN, "").replace(",", "."));
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;
const FR = /^(\d{2})\/(\d{2})\/(\d{4})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;

/** Renvoie un horodatage en millisecondes, lu en heure LOCALE.
 *  (Passer par `new Date(texte)` lirait « 2026-06-01 » en UTC et décalerait
 *  toute la journée selon le fuseau du lecteur.) */
function toTime(text) {
  const s = String(text).trim();
  let m = ISO.exec(s);
  if (m) {
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
  }
  m = FR.exec(s);
  if (m) {
    return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
  }
  const fallback = Date.parse(s);
  return Number.isNaN(fallback) ? NaN : fallback;
}

const REQUIRED = ["timestamp", "site", "power_kw"];

/** Texte CSV -> tableau de mesures { t, site, kw }, trié dans le temps. */
export function parse(text) {
  const clean = text.replace(/^\uFEFF/, "").trim();
  if (!clean) throw new DataError("Fichier vide.");
  const lines = clean.split(/\r?\n/);
  const sep = sniff(lines[0]);
  const header = splitLine(lines[0], sep).map((h) => h.toLowerCase().replace(/^"|"$/g, ""));

  const index = {};
  for (const name of REQUIRED) index[name] = header.indexOf(name);
  const missing = REQUIRED.filter((name) => index[name] === -1);
  if (missing.length === REQUIRED.length) {
    throw new DataError(
      "Aucune des colonnes attendues n'a été trouvée. La première ligne du fichier "
      + "doit nommer les colonnes : timestamp, site, power_kw.",
    );
  }
  if (missing.length) {
    throw new DataError(
      `Colonne manquante : ${missing.join(", ")}. Attendu : timestamp, site, power_kw.`,
    );
  }

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    if (!lines[i]) continue;
    const cells = splitLine(lines[i], sep);
    const t = toTime(cells[index.timestamp]);
    const kw = toNumber(cells[index.power_kw]);
    const site = (cells[index.site] || "").replace(/^"|"$/g, "");
    if (Number.isNaN(t) || Number.isNaN(kw) || !site) continue; // ligne inexploitable
    rows.push({ t, site, kw });
  }
  if (!rows.length) throw new DataError("Aucune ligne exploitable après nettoyage.");
  rows.sort((a, b) => a.t - b.t);
  return rows;
}

// --------------------------------------------------------------------------
// Le jeu de données courant
// --------------------------------------------------------------------------
export class Dataset {
  constructor(rows, source) {
    this.rows = rows;
    this.source = source;
    this.sites = [...new Set(rows.map((r) => r.site))].sort((a, b) => a.localeCompare(b, "fr"));
    this.start = new Date(rows[0].t);
    this.end = new Date(rows[rows.length - 1].t);
    this.stepHours = medianStep(rows);
  }
}

/** Durée d'un pas de mesure, en heures : écart médian entre deux points d'un
 *  même site (la médiane ignore les trous du relevé). */
function medianStep(rows) {
  const bySite = new Map();
  for (const r of rows) {
    if (!bySite.has(r.site)) bySite.set(r.site, []);
    bySite.get(r.site).push(r.t);
  }
  const deltas = [];
  for (const times of bySite.values()) {
    for (let i = 1; i < times.length && deltas.length < 5000; i += 1) {
      const d = times[i] - times[i - 1];
      if (d > 0) deltas.push(d);
    }
  }
  if (!deltas.length) return 1;
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)] / 3600000 || 1;
}

// --------------------------------------------------------------------------
// Filtrage et agrégation
// --------------------------------------------------------------------------
/** Restreint aux sites cochés et à la période (bornes de jour incluses). */
export function slicePeriod(rows, start, end, sites) {
  const from = start ? start.getTime() : -Infinity;
  const to = end ? end.getTime() + 86400000 : Infinity; // fin de journée incluse
  const keep = sites && sites.length ? new Set(sites) : null;
  return rows.filter((r) => r.t >= from && r.t < to && (!keep || keep.has(r.site)));
}

/** Début de la tranche à laquelle appartient un instant. */
function bucketStart(ms, freq) {
  const d = new Date(ms);
  if (freq === "h") return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime();
  if (freq === "D") return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (freq === "W") {
    const day = (d.getDay() + 6) % 7; // lundi = 0
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day).getTime();
  }
  return ms;
}

/** Regroupe par tranche de temps et par site.
 *  -> [{ t, site, kw (moyenne), peak (max), kwh (somme) }] */
export function aggregate(rows, freq, stepHours) {
  const groups = new Map();
  for (const r of rows) {
    const t = bucketStart(r.t, freq);
    const key = `${t} ${r.site}`;
    let g = groups.get(key);
    if (!g) { g = { t, site: r.site, sum: 0, peak: -Infinity, n: 0 }; groups.set(key, g); }
    g.sum += r.kw;
    g.n += 1;
    if (r.kw > g.peak) g.peak = r.kw;
  }
  return [...groups.values()]
    .map((g) => ({ t: g.t, site: g.site, kw: g.sum / g.n, peak: g.peak, kwh: g.sum * stepHours }))
    .sort((a, b) => a.t - b.t || a.site.localeCompare(b.site, "fr"));
}

/** Puissance totale tous sites confondus, pas de temps par pas de temps. */
export function totalCurve(rows) {
  const byTime = new Map();
  for (const r of rows) byTime.set(r.t, (byTime.get(r.t) || 0) + r.kw);
  return [...byTime.entries()].map(([t, kw]) => ({ t, kw })).sort((a, b) => a.t - b.t);
}

/** Monotone de charge : puissances triées, et le % du temps où elles sont
 *  atteintes ou dépassées. */
export function loadDuration(rows) {
  const values = totalCurve(rows).map((p) => p.kw).sort((a, b) => b - a);
  return values.map((kw, i) => ({ share: ((i + 1) / values.length) * 100, kw }));
}

/** Profil de charge : matrice heures (lignes) × jours (colonnes). */
export function heatMatrix(rows) {
  const cells = new Map();
  const days = new Set();
  for (const p of totalCurve(rows)) {
    const d = new Date(p.t);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    days.add(day);
    const key = `${day} ${d.getHours()}`;
    const cell = cells.get(key) || { sum: 0, n: 0 };
    cell.sum += p.kw;
    cell.n += 1;
    cells.set(key, cell);
  }
  const dayList = [...days].sort((a, b) => a - b);
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const z = hours.map((h) =>
    dayList.map((day) => {
      const cell = cells.get(`${day} ${h}`);
      return cell ? cell.sum / cell.n : null;
    }),
  );
  return { days: dayList, hours, z };
}

// --------------------------------------------------------------------------
// Indicateurs
// --------------------------------------------------------------------------
export function kpis(rows, stepHours) {
  if (!rows.length) {
    return { energy: 0, peak: 0, peakAt: null, mean: 0, loadFactor: 0 };
  }
  const curve = totalCurve(rows);
  let peak = -Infinity;
  let peakAt = null;
  let sum = 0;
  for (const p of curve) {
    sum += p.kw;
    if (p.kw > peak) { peak = p.kw; peakAt = new Date(p.t); }
  }
  const mean = sum / curve.length;
  const energy = rows.reduce((acc, r) => acc + r.kw, 0) * stepHours;
  return {
    energy,
    peak,
    peakAt,
    mean,
    loadFactor: peak ? (mean / peak) * 100 : 0,
  }; // le coût ne se calcule pas ici : il dépend du tarif (voir tariff.js)
}

/** Même durée, juste avant la période affichée — sert aux écarts des indicateurs. */
export function previousPeriod(rows, start, end, sites) {
  if (!start || !end) return [];
  const span = end.getTime() + 86400000 - start.getTime();
  const prevStart = new Date(start.getTime() - span);
  const prevEnd = new Date(start.getTime() - 86400000);
  return slicePeriod(rows, prevStart, prevEnd, sites);
}
