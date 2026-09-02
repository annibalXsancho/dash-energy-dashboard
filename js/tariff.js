// Modèle tarifaire : ce qui transforme des kWh en euros, et une courbe de
// charge en diagnostic facturable.
//
// Trois postes, volontairement lisibles plutôt qu'exhaustifs :
//   1. l'énergie, séparée en heures pleines / heures creuses ;
//   2. l'abonnement, proportionnel à la durée affichée ;
//   3. les dépassements de puissance souscrite.
//
// Le poste « dépassements » est un ORDRE DE GRANDEUR : la formule réelle du
// TURPE facture chaque dépassement horaire selon une somme quadratique propre
// au contrat. Ici on facture le dépassement maximal constaté — assez pour
// dire « votre puissance souscrite est mal calée », pas pour refaire la
// facture. Le libellé à l'écran le dit.

const STORAGE_KEY = "energie.tarif.v1";

export const DEFAULTS = {
  subscribedKw: 0, // 0 = non renseignée : ni dépassement ni optimum affichés
  priceHp: 0.19, // €/kWh en heures pleines
  priceHc: 0.13, // €/kWh en heures creuses
  hcStart: 22, // début des heures creuses (heure locale)
  hcEnd: 6, // fin des heures creuses
  subscriptionMonthly: 0, // abonnement €/mois
  overrunPerKw: 12, // pénalité €/kW de dépassement maximal
};

export const FIELDS = [
  { key: "subscribedKw", label: "Puissance souscrite", unit: "kW", step: 10 },
  { key: "priceHp", label: "Prix heures pleines", unit: "€/kWh", step: 0.005 },
  { key: "priceHc", label: "Prix heures creuses", unit: "€/kWh", step: 0.005 },
  { key: "hcStart", label: "Début heures creuses", unit: "h", step: 1, max: 23 },
  { key: "hcEnd", label: "Fin heures creuses", unit: "h", step: 1, max: 23 },
  { key: "subscriptionMonthly", label: "Abonnement", unit: "€/mois", step: 10 },
  { key: "overrunPerKw", label: "Pénalité dépassement", unit: "€/kW", step: 1 },
];

export function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export function save(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* navigation privée : on continue sans mémoriser */
  }
}

/** Heures creuses, en gérant la plage qui enjambe minuit (22 h -> 6 h). */
export function isOffPeak(hour, config) {
  const { hcStart, hcEnd } = config;
  if (hcStart === hcEnd) return false;
  return hcStart < hcEnd ? hour >= hcStart && hour < hcEnd : hour >= hcStart || hour < hcEnd;
}

/** Décomposition du coût sur la période affichée. */
export function costs(rows, stepHours, config, spanDays) {
  let energyHp = 0;
  let energyHc = 0;
  for (const row of rows) {
    const kwh = row.kw * stepHours;
    if (isOffPeak(new Date(row.t).getHours(), config)) energyHc += kwh;
    else energyHp += kwh;
  }
  const energyCost = energyHp * config.priceHp + energyHc * config.priceHc;
  // L'abonnement est mensuel : on le proratise sur la durée affichée.
  const subscription = (config.subscriptionMonthly * spanDays) / 30.44;
  return { energyHp, energyHc, energyCost, subscription };
}

/** Dépassements de puissance souscrite, lus sur la courbe totale. */
export function overruns(curve, stepHours, config) {
  if (!config.subscribedKw) return null;
  let hours = 0;
  let maxOver = 0;
  for (const point of curve) {
    const over = point.kw - config.subscribedKw;
    if (over > 0) {
      hours += stepHours;
      if (over > maxOver) maxOver = over;
    }
  }
  return { hours, maxOver, cost: maxOver * config.overrunPerKw };
}

/** Puissance dépassée seulement `share` % du temps — la souscription qu'on
 *  viserait pour ne plus payer de pénalités qu'exceptionnellement. */
export function optimalPower(loadDurationCurve, share = 1) {
  if (!loadDurationCurve.length) return null;
  const index = Math.min(
    loadDurationCurve.length - 1,
    Math.floor((share / 100) * loadDurationCurve.length),
  );
  return loadDurationCurve[index].kw;
}
