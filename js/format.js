// Mise en forme française des nombres et des dates.

const cache = new Map();
const numberFormat = (decimals) => {
  if (!cache.has(decimals)) {
    cache.set(
      decimals,
      new Intl.NumberFormat("fr-FR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }),
    );
  }
  return cache.get(decimals);
};

/** 1234.5 -> « 1 234,5 » */
export function fmt(value, decimals = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return numberFormat(decimals).format(value);
}

/** Choisit l'unité lisible : kWh, MWh ou GWh. */
export function humanEnergy(kwh) {
  const abs = Math.abs(kwh);
  if (abs >= 1e6) return { value: fmt(kwh / 1e6, 2), unit: "GWh" };
  if (abs >= 1e3) return { value: fmt(kwh / 1e3, 1), unit: "MWh" };
  return { value: fmt(kwh, 0), unit: "kWh" };
}

const two = (n) => String(n).padStart(2, "0");

/** « 18/08 à 09h15 » */
export function stampLong(date) {
  return `le ${two(date.getDate())}/${two(date.getMonth() + 1)} à ${two(date.getHours())}h${two(date.getMinutes())}`;
}

/** Étiquette de ligne du tableau, adaptée à la granularité affichée. */
export function stampTable(date, freq) {
  const d = `${two(date.getDate())}/${two(date.getMonth() + 1)}`;
  if (freq === "raw") return `${d} ${two(date.getHours())}:${two(date.getMinutes())}`;
  if (freq === "h") return `${d} ${two(date.getHours())}h`;
  return `${d}/${date.getFullYear()}`;
}

/** Horodatage complet en heure locale : « 2026-08-31T14:30:00 ».
 *  Sert à réécrire un relevé au format canonique du tableau de bord. */
export function isoStamp(date) {
  return `${isoDay(date)}T${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

/** Date au format d'un champ <input type="date"> (aaaa-mm-jj, heure locale). */
export function isoDay(date) {
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}
