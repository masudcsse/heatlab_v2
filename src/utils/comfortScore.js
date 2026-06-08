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

  const comfortNeeds =
    options.comfortNeeds || inferComfortNeeds(activityPreference, weather);
  const featureSummary = options.featureSummary || {};

  // Weighted 100-point model:
  // temperature 35, humidity 20, rain 20, preference 15, activity/place type 10.
  const factors = [
    calculateTemperatureFactor(weather.temperature),
    calculateHumidityFactor(weather.humidity),
    calculateRainFactor(weather.rain, place),
    calculatePreferenceFactor(activityPreference, place, weather, {
      comfortNeeds,
      featureSummary,
    }),
    calculateActivityTypeFactor(place, placeType),
  ];

  const score = clampScore(
    factors.reduce((total, factor) => total + factor.score, 0)
  );
  const reasons = factors.flatMap((factor) => factor.reasons).filter(Boolean);

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
  const factor = calculatePreferenceFactor(
    options.activityPreference || "All",
    place,
    weather,
    {
      comfortNeeds: options.comfortNeeds || createComfortNeeds("none"),
      featureSummary: options.featureSummary || {},
    }
  );

  return {
    scoreDelta: factor.score,
    reasons: factor.reasons,
  };
}

export function rankPlacesByComfort(placesWithWeather) {
  return [...placesWithWeather].sort((a, b) => {
    if (a.comfortScore === null) return 1;
    if (b.comfortScore === null) return -1;
    return b.comfortScore - a.comfortScore;
  });
}

export function getComfortRecommendation(score) {
  const value = Number(score);

  if (!Number.isFinite(value)) {
    return {
      label: "Weather unavailable",
      tone: "neutral",
      summary: "No recommendation can be calculated until weather data is available.",
      reasonLead: "cannot be recommended yet",
    };
  }

  if (value >= 85) {
    return {
      label: "Highly recommended",
      tone: "excellent",
      summary: "A very comfortable match for the selected activity and current weather.",
      reasonLead: "is highly recommended",
    };
  }

  if (value >= 70) {
    return {
      label: "Comfortable choice",
      tone: "good",
      summary: "A good option with only minor comfort limitations.",
      reasonLead: "is a comfortable choice",
    };
  }

  if (value >= 55) {
    return {
      label: "Moderate Comfort",
      tone: "caution",
      summary: "Some conditions may reduce comfort, so check the details before going.",
      reasonLead: "can be used with caution",
    };
  }

  if (value >= 40) {
    return {
      label: "Low comfort",
      tone: "poor",
      summary: "Several conditions make this place less comfortable right now.",
      reasonLead: "has low comfort right now",
    };
  }

  return {
    label: "Not recommended",
    tone: "bad",
    summary: "Current weather or preference conditions do not fit this place well.",
    reasonLead: "is not recommended right now",
  };
}

export function formatComfortRecommendationLabel(score) {
  const recommendation = getComfortRecommendation(score);
  const scoreLabel = formatComfortScore(score);

  return scoreLabel
    ? `${recommendation.label} - ${scoreLabel}`
    : recommendation.label;
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

function calculateTemperatureFactor(value) {
  const temp = Number(value);

  if (!Number.isFinite(temp)) {
    return {
      score: 18,
      reasons: ["temperature data is unavailable"],
    };
  }

  if (temp >= 20 && temp <= 24) {
    return {
      score: 35,
      reasons: [`temperature is ideal at ${formatNumber(temp)} C`],
    };
  }

  if (temp >= 18 && temp < 20) {
    return {
      score: 30,
      reasons: [`temperature is slightly cool at ${formatNumber(temp)} C`],
    };
  }

  if (temp > 24 && temp <= 26) {
    return {
      score: 30,
      reasons: [`temperature is slightly warm at ${formatNumber(temp)} C`],
    };
  }

  if (temp >= 15 && temp < 18) {
    return {
      score: 22,
      reasons: [`temperature is cool at ${formatNumber(temp)} C`],
    };
  }

  if (temp > 26 && temp <= 30) {
    return {
      score: 22,
      reasons: [`temperature is warm at ${formatNumber(temp)} C`],
    };
  }

  return {
    score: 10,
    reasons: [`temperature is uncomfortable at ${formatNumber(temp)} C`],
  };
}

function calculateHumidityFactor(value) {
  const humidity = Number(value);

  if (!Number.isFinite(humidity)) {
    return {
      score: 10,
      reasons: ["humidity data is unavailable"],
    };
  }

  if (humidity >= 40 && humidity <= 60) {
    return {
      score: 20,
      reasons: [`humidity is comfortable at ${formatNumber(humidity)}%`],
    };
  }

  if (humidity >= 30 && humidity < 40) {
    return {
      score: 15,
      reasons: [`humidity is slightly dry at ${formatNumber(humidity)}%`],
    };
  }

  if (humidity > 60 && humidity <= 70) {
    return {
      score: 15,
      reasons: [`humidity is slightly high at ${formatNumber(humidity)}%`],
    };
  }

  if (humidity >= 20 && humidity < 30) {
    return {
      score: 10,
      reasons: [`humidity is dry at ${formatNumber(humidity)}%`],
    };
  }

  if (humidity > 70 && humidity <= 80) {
    return {
      score: 10,
      reasons: [`humidity is high at ${formatNumber(humidity)}%`],
    };
  }

  return {
    score: 5,
    reasons: [`humidity is uncomfortable at ${formatNumber(humidity)}%`],
  };
}

function calculateRainFactor(rain, place) {
  const isRainy = Boolean(rain);
  const isIndoor = place?.category === "indoor";
  const isOutdoor = place?.category === "outdoor";

  if (!isRainy) {
    return {
      score: 20,
      reasons: ["there is no rain"],
    };
  }

  if (isIndoor) {
    return {
      score: 14,
      reasons: ["rain is less problematic because the place is indoor"],
    };
  }

  if (isOutdoor) {
    return {
      score: 3,
      reasons: ["rain strongly reduces comfort for outdoor places"],
    };
  }

  return {
    score: 8,
    reasons: ["rain reduces outdoor comfort"],
  };
}

function calculatePreferenceFactor(
  activityPreference,
  place,
  weather,
  { comfortNeeds, featureSummary }
) {
  const normalized = String(activityPreference || "All").trim().toLowerCase();
  const isRainy = Boolean(weather?.rain);
  const temp = Number(weather?.temperature);
  const supportCount = [
    featureSummary?.water,
    featureSummary?.shade,
    featureSummary?.indoor,
  ].filter(Boolean).length;

  if (normalized === "all") {
    if (supportCount >= 2) {
      return {
        score: 15,
        reasons: ["multiple comfort-support options are nearby"],
      };
    }

    if (supportCount === 1) {
      return {
        score: 12,
        reasons: ["one comfort-support option is nearby"],
      };
    }

    return {
      score: 8,
      reasons: ["general activity preference has limited nearby support"],
    };
  }

  if (normalized === "nearby drinking water") {
    return featureSummary?.water
      ? {
          score: 15,
          reasons: ["selected preference is supported by nearby drinking water"],
        }
      : {
          score: 0,
          reasons: ["selected preference needs drinking water, but none was found nearby"],
        };
  }

  if (normalized === "shaded area") {
    return featureSummary?.shade
      ? {
          score: 15,
          reasons: ["selected preference is supported by nearby shade or green space"],
        }
      : {
          score: 0,
          reasons: ["selected preference needs shade, but no shade support was found nearby"],
        };
  }

  if (normalized === "indoor activity" || normalized === "indoor visit") {
    if (place?.category === "indoor") {
      return {
        score: 15,
        reasons: ["selected preference matches an indoor place"],
      };
    }

    if (featureSummary?.indoor) {
      return {
        score: 12,
        reasons: ["selected preference has an indoor backup nearby"],
      };
    }

    return {
      score: 0,
      reasons: ["selected preference needs indoor support, but none was found nearby"],
    };
  }

  if (normalized === "walking" || normalized === "sightseeing") {
    return !isRainy && Number.isFinite(temp) && temp >= 18 && temp <= 26
      ? {
          score: 15,
          reasons: ["selected activity is suitable for walking or sightseeing"],
        }
      : {
          score: 6,
          reasons: ["selected activity is less comfortable in the current weather"],
        };
  }

  if (normalized === "cycling") {
    return !isRainy && Number.isFinite(temp) && temp >= 16 && temp <= 26
      ? {
          score: 15,
          reasons: ["selected activity is suitable for cycling"],
        }
      : {
          score: 5,
          reasons: ["selected activity is less suitable for cycling right now"],
        };
  }

  if (normalized === "photography" || normalized === "relaxing") {
    return !isRainy
      ? {
          score: 15,
          reasons: ["selected activity benefits from dry weather"],
        }
      : {
          score: 5,
          reasons: ["selected activity is less comfortable during rain"],
        };
  }

  if (normalized === "family activity") {
    return !isRainy && Number.isFinite(temp) && temp >= 18 && temp <= 26
      ? {
          score: 15,
          reasons: ["selected family activity fits the current weather"],
        }
      : {
          score: 6,
          reasons: ["selected family activity is less comfortable right now"],
        };
  }

  if (normalized === "food/cafe") {
    return place?.category === "indoor"
      ? {
          score: 15,
          reasons: ["selected preference matches an indoor food or cafe option"],
        }
      : {
          score: 9,
          reasons: ["selected preference has a partial match"],
        };
  }

  if (comfortNeeds?.weatherStress && supportCount > 0) {
    return {
      score: 12,
      reasons: ["selected preference has useful support in stressful weather"],
    };
  }

  return {
    score: 10,
    reasons: ["selected preference is generally acceptable"],
  };
}

function calculateActivityTypeFactor(place, placeType) {
  const normalized = String(placeType || "All").trim().toLowerCase();
  const category = String(place?.category || "mixed").toLowerCase();
  const types = Array.isArray(place?.types) ? place.types : [];

  if (!normalized || normalized === "all") {
    return {
      score: 8,
      reasons: ["no strict place type filter was selected"],
    };
  }

  if (normalized === "outdoor") {
    return category === "outdoor"
      ? {
          score: 10,
          reasons: ["selected activity type matches an outdoor place"],
        }
      : {
          score: 4,
          reasons: ["selected activity type prefers outdoor places"],
        };
  }

  if (normalized === "indoor") {
    return category === "indoor"
      ? {
          score: 10,
          reasons: ["selected activity type matches an indoor place"],
        }
      : {
          score: 4,
          reasons: ["selected activity type prefers indoor places"],
        };
  }

  if (normalized === "food/cafe") {
    return hasAnyType(types, ["cafe", "restaurant", "bakery", "bar"])
      ? {
          score: 10,
          reasons: ["selected activity type matches a food or cafe place"],
        }
      : {
          score: 5,
          reasons: ["selected activity type has a limited match"],
        };
  }

  if (normalized === "historical") {
    return hasAnyType(types, ["museum", "church", "tourist_attraction"])
      ? {
          score: 10,
          reasons: ["selected activity type matches a historical or cultural place"],
        }
      : {
          score: 5,
          reasons: ["selected activity type has a limited historical match"],
        };
  }

  if (
    normalized === "park / garden" ||
    normalized === "public space" ||
    normalized === "recreational area"
  ) {
    return category === "outdoor" || hasAnyType(types, ["park", "garden"])
      ? {
          score: 10,
          reasons: ["selected activity type matches an outdoor public place"],
        }
      : {
          score: 5,
          reasons: ["selected activity type has a limited outdoor match"],
        };
  }

  return {
    score: 6,
    reasons: ["selected activity type is partially matched"],
  };
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
  const reasonText =
    reasons.filter(Boolean).slice(0, 6).join(", ") ||
    "available weather and preference data are acceptable";
  const recommendation = getComfortRecommendation(score);

  return `${place.name} ${recommendation.reasonLead} because ${reasonText}.`;
}

function hasAnyType(types, expectedTypes) {
  return types.some((type) => expectedTypes.includes(type));
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function formatComfortScore(score) {
  const value = Number(score);

  if (!Number.isFinite(value)) return null;

  return `${Math.round(value)}/100`;
}

function formatNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return "unknown";

  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}
