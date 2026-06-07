export function calculateComfortScore(
  place,
  weather,
  activityPreference,
  placeType,
  options = {}
) {
  if (!weather) {
    return {
      score: null,
      reason: "No Netatmo weather data available for this place.",
    };
  }

  let score = 100;
  const reasons = [];

  const temp = Number(weather.temperature);
  const humidity = Number(weather.humidity);
  const isRainy = Boolean(weather.rain);
  const isIndoor = place.category === "indoor";
  const isOutdoor = place.category === "outdoor";

  if (temp < 20) {
    score -= (20 - temp) * 3;
    reasons.push("temperature is colder than ideal");
  } else if (temp > 24) {
    score -= (temp - 24) * 3;
    reasons.push("temperature is warmer than ideal");
  } else {
    reasons.push("temperature is comfortable");
  }

  if (humidity < 40) {
    score -= (40 - humidity) * 0.5;
  } else if (humidity > 60) {
    score -= (humidity - 60) * 0.5;
    reasons.push("humidity is slightly high");
  } else {
    reasons.push("humidity is comfortable");
  }

  if (isRainy) {
    if (isOutdoor) {
      score -= 25;
      reasons.push("rain is not suitable for outdoor places");
    }

    if (isIndoor) {
      score += 12;
      reasons.push("indoor place is better during rain");
    }
  }

  if (!isRainy && isOutdoor && temp >= 20 && temp <= 24) {
    score += 8;
    reasons.push("outdoor conditions are pleasant");
  }

  if (activityPreference === "Cycling") {
    if (isRainy) score -= 20;
  }

  if (activityPreference === "Walking") {
    if (temp >= 20 && temp <= 24 && !isRainy) score += 8;
  }

  if (activityPreference === "Photography") {
    if (!isRainy) score += 8;
    if (isRainy) score -= 15;
  }

  if (activityPreference === "Food/Cafe") {
    if (isIndoor) score += 15;
  }

  if (activityPreference === "Indoor visit" || activityPreference === "Indoor Activity") {
    if (isIndoor) score += 18;
    if (isOutdoor) score -= 8;
  }

  if (activityPreference === "Family activity") {
    if (!isRainy && temp >= 18 && temp <= 26) {
      score += 10;
    } else {
      score -= 8;
    }
  }

  if (placeType === "Indoor" && isIndoor) score += 10;
  if (placeType === "Outdoor" && isOutdoor) score += 10;
  if (placeType === "Food/Cafe" && isIndoor) score += 10;

  const enhancement = enhanceComfortScore(place, weather, {
    comfortNeeds: options.comfortNeeds || inferComfortNeeds(activityPreference, weather),
    featureSummary: options.featureSummary,
    distanceFromSelectedKm: options.distanceFromSelectedKm,
  });

  score += enhancement.scoreDelta;
  reasons.push(...enhancement.reasons);

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    reason: createReason(place, score, reasons),
  };
}

export function inferComfortNeeds(activityPreference, weather) {
  const normalized = String(activityPreference || "").trim().toLowerCase();
  const isWeatherStressful = isUncomfortableWeather(weather);

  if (!normalized) {
    return createComfortNeeds("none");
  }

  if (normalized === "all") {
    return createComfortNeeds("all", {
      water: true,
      shade: true,
      indoor: true,
      weatherStress: isWeatherStressful,
    });
  }

  if (normalized === "nearby drinking water") {
    return createComfortNeeds("water", {
      water: true,
      weatherStress: isWeatherStressful,
    });
  }

  if (normalized === "shaded area") {
    return createComfortNeeds("shade", {
      shade: true,
      weatherStress: isWeatherStressful,
    });
  }

  if (normalized === "indoor activity" || normalized === "indoor visit") {
    return createComfortNeeds("indoor", {
      indoor: true,
      weatherStress: isWeatherStressful,
    });
  }

  return createComfortNeeds("none");
}

export function enhanceComfortScore(place, weather, options = {}) {
  const comfortNeeds = options.comfortNeeds || createComfortNeeds("none");
  const featureSummary = options.featureSummary || {};
  const distanceFromSelectedKm = Number(options.distanceFromSelectedKm);
  const scoreChanges = [];
  const reasons = [];
  const temp = Number(weather?.temperature);
  const isHot = Number.isFinite(temp) && temp >= 26;
  const isStressful = isUncomfortableWeather(weather);

  if (Number.isFinite(distanceFromSelectedKm) && distanceFromSelectedKm > 0) {
    const distancePenalty = Math.min(distanceFromSelectedKm * 4, 12);
    scoreChanges.push(-distancePenalty);
    reasons.push(`${place.name} is ${distanceFromSelectedKm.toFixed(1)} km from the selected place`);
  }

  if (comfortNeeds.water) {
    applyFeatureBonus({
      feature: featureSummary.water,
      missingPenalty: -12,
      closeBonus: isHot ? 24 : 18,
      mediumBonus: isHot ? 17 : 12,
      farBonus: 6,
      closeText: "public drinking water is very close",
      mediumText: "public drinking water is nearby",
      farText: "public drinking water is available but farther away",
      missingText: "no public drinking water source was found nearby",
      scoreChanges,
      reasons,
    });
  }

  if (comfortNeeds.shade) {
    applyFeatureBonus({
      feature: featureSummary.shade,
      missingPenalty: -8,
      closeBonus: isHot ? 21 : 15,
      mediumBonus: isHot ? 15 : 10,
      farBonus: 5,
      closeText: "shade or green space is very close",
      mediumText: "shade or green space is nearby",
      farText: "shade or green space is available but farther away",
      missingText: "no shaded or green support was found nearby",
      scoreChanges,
      reasons,
    });
  }

  if (comfortNeeds.indoor) {
    const indoorFeature = featureSummary.indoor;

    if (place.category === "indoor") {
      scoreChanges.push(isStressful ? 20 : 12);
      reasons.push("the place itself is indoor or sheltered");
    } else if (indoorFeature) {
      const indoorDistance = Number(indoorFeature.distanceKm);
      if (indoorDistance <= 0.5) {
        scoreChanges.push(isStressful ? 16 : 10);
        reasons.push("an indoor backup is nearby");
      } else {
        scoreChanges.push(4);
        reasons.push("an indoor backup is available but farther away");
      }
    } else if (isStressful) {
      scoreChanges.push(-10);
      reasons.push("no indoor backup was found nearby");
    }
  }

  return {
    scoreDelta: scoreChanges.reduce((total, value) => total + value, 0),
    reasons,
  };
}

export function rankPlacesByComfort(placesWithWeather) {
  return [...placesWithWeather].sort((a, b) => {
    if (a.comfortScore === null) return 1;
    if (b.comfortScore === null) return -1;
    return b.comfortScore - a.comfortScore;
  });
}

export function satisfiesRequiredComfortPreference(item) {
  const comfortNeeds = item?.comfortNeeds;
  const features = item?.comfortFeatures;

  if (!comfortNeeds?.any) return true;

  if (comfortNeeds.mode === "water") {
    return Boolean(features?.water);
  }

  if (comfortNeeds.mode === "shade") {
    return Boolean(features?.shade);
  }

  if (comfortNeeds.mode === "indoor") {
    return item?.place?.category === "indoor" || Boolean(features?.indoor);
  }

  // All Activities should not require every support item, but it should avoid
  // recommending places with no support features at all.
  if (comfortNeeds.mode === "all") {
    return Boolean(features?.water || features?.shade || features?.indoor);
  }

  return true;
}

function createComfortNeeds(mode, overrides = {}) {
  const water = Boolean(overrides.water);
  const shade = Boolean(overrides.shade);
  const indoor = Boolean(overrides.indoor);

  return {
    mode,
    water,
    shade,
    indoor,
    any: water || shade || indoor,
    weatherStress: Boolean(overrides.weatherStress),
  };
}

function applyFeatureBonus({
  feature,
  missingPenalty,
  closeBonus,
  mediumBonus,
  farBonus,
  closeText,
  mediumText,
  farText,
  missingText,
  scoreChanges,
  reasons,
}) {
  if (!feature) {
    scoreChanges.push(missingPenalty);
    reasons.push(missingText);
    return;
  }

  const distanceKm = Number(feature.distanceKm);

  if (distanceKm <= 0.3) {
    scoreChanges.push(closeBonus);
    reasons.push(closeText);
  } else if (distanceKm <= 0.5) {
    scoreChanges.push(mediumBonus);
    reasons.push(mediumText);
  } else {
    scoreChanges.push(farBonus);
    reasons.push(farText);
  }
}

function isUncomfortableWeather(weather) {
  if (!weather) return false;

  const temp = Number(weather.temperature);
  const humidity = Number(weather.humidity);

  return (
    Boolean(weather.rain) ||
    (Number.isFinite(temp) && temp >= 26) ||
    (Number.isFinite(humidity) && humidity >= 70)
  );
}

function createReason(place, score, reasons) {
  const reasonText = reasons.filter(Boolean).slice(0, 5).join(", ");

  if (score >= 85) {
    return `${place.name} is highly recommended because ${reasonText}.`;
  }

  if (score >= 65) {
    return `${place.name} is a suitable option, but ${reasonText}.`;
  }

  return `${place.name} is less suitable right now because ${reasonText}.`;
}
