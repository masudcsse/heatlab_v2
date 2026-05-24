export function calculateComfortScore(place, weather, activityPreference, placeType) {
  if (!weather) {
    return {
      score: null,
      reason: "No Netatmo weather data available for this place.",
    };
  }

  let score = 100;
  const reasons = [];

  const temp = weather.temperature;
  const humidity = weather.humidity;
  const wind = weather.windSpeed;
  const isRainy = weather.rain;
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

  if (wind > 15) {
    score -= 12;
    reasons.push("wind speed is high");
  } else if (wind <= 10) {
    reasons.push("wind speed is low");
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

  if (!isRainy && isOutdoor && temp >= 20 && temp <= 24 && wind <= 10) {
    score += 8;
    reasons.push("outdoor conditions are pleasant");
  }

  if (activityPreference === "Cycling") {
    if (wind > 12) score -= 15;
    if (isRainy) score -= 20;
  }

  if (activityPreference === "Walking") {
    if (temp >= 20 && temp <= 24 && !isRainy) score += 8;
  }

  if (activityPreference === "Photography") {
    if (!isRainy && wind <= 12) score += 8;
    if (isRainy) score -= 15;
  }

  if (activityPreference === "Food/Cafe") {
    if (isIndoor) score += 15;
  }

  if (activityPreference === "Indoor visit") {
    if (isIndoor) score += 18;
    if (isOutdoor) score -= 8;
  }

  if (activityPreference === "Family activity") {
    if (!isRainy && wind <= 12 && temp >= 18 && temp <= 26) {
      score += 10;
    } else {
      score -= 8;
    }
  }

  if (placeType === "Indoor" && isIndoor) score += 10;
  if (placeType === "Outdoor" && isOutdoor) score += 10;
  if (placeType === "Food/Cafe" && isIndoor) score += 10;

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    reason: createReason(place, score, reasons),
  };
}

export function rankPlacesByComfort(placesWithWeather) {
  return [...placesWithWeather].sort((a, b) => {
    if (a.comfortScore === null) return 1;
    if (b.comfortScore === null) return -1;
    return b.comfortScore - a.comfortScore;
  });
}

function createReason(place, score, reasons) {
  const reasonText = reasons.slice(0, 3).join(", ");

  if (score >= 85) {
    return `${place.name} is highly recommended because ${reasonText}.`;
  }

  if (score >= 65) {
    return `${place.name} is a suitable option, but ${reasonText}.`;
  }

  return `${place.name} is less suitable right now because ${reasonText}.`;
}
