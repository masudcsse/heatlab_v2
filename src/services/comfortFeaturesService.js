const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const FEATURE_SEARCH_RADIUS_KM = 2.5;
const CLOSE_FEATURE_RADIUS_KM = 1.2;
const REQUEST_TIMEOUT_MS = 9000;

export async function fetchNearbyComfortFeatures(
  lat,
  lng,
  comfortNeeds,
  radiusKm = FEATURE_SEARCH_RADIUS_KM
) {
  if (!comfortNeeds?.water && !comfortNeeds?.shade) {
    return {
      features: [],
      error: null,
    };
  }

  const query = buildOverpassQuery(lat, lng, radiusKm, comfortNeeds);

  try {
    const response = await fetchWithTimeout(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: new URLSearchParams({ data: query }),
    });

    if (!response.ok) {
      throw new Error(`OpenStreetMap Overpass request failed (${response.status}).`);
    }

    const payload = await response.json();
    const features = normalizeOverpassElements(payload.elements || [], lat, lng)
      .filter((feature) => shouldKeepFeature(feature, comfortNeeds))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return {
      features,
      error: null,
    };
  } catch (error) {
    return {
      features: [],
      error:
        error.message ||
        "OpenStreetMap comfort feature lookup failed. Recommendations will continue without public amenity data.",
    };
  }
}

export function getComfortFeatureSummary(
  place,
  comfortNeeds,
  osmFeatures,
  indoorPlaces = []
) {
  if (!place || !comfortNeeds?.any) {
    return createEmptySummary(comfortNeeds);
  }

  const summary = createEmptySummary(comfortNeeds);

  if (comfortNeeds.water) {
    summary.water = findNearestFeature(place.lat, place.lng, osmFeatures, "water");
  }

  if (comfortNeeds.shade) {
    summary.shade = findNearestFeature(place.lat, place.lng, osmFeatures, "shade");
  }

  if (comfortNeeds.indoor) {
    summary.indoor = findNearestIndoorFeature(place, indoorPlaces);
  }

  return summary;
}

export function findNearestFeature(lat, lng, features, category) {
  return (features || [])
    .filter((feature) => feature.category === category)
    .map((feature) => ({
      ...feature,
      distanceKm: Number(calculateDistanceKm(lat, lng, feature.lat, feature.lng).toFixed(2)),
    }))
    .filter((feature) => feature.distanceKm <= CLOSE_FEATURE_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)[0] || null;
}

export function calculateDistanceKm(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function createComfortFeatureMessages(summary) {
  if (!summary?.considered?.any) return [];

  const messages = [];

  if (summary.considered.water) {
    messages.push(
      summary.water
        ? `Drinking water: ${summary.water.name} (${formatDistance(summary.water.distanceKm)})`
        : "No public drinking water source found nearby."
    );
  }

  if (summary.considered.shade) {
    messages.push(
      summary.shade
        ? `Shade/green area: ${summary.shade.name} (${formatDistance(summary.shade.distanceKm)})`
        : "No shaded or green support found nearby."
    );
  }

  if (summary.considered.indoor) {
    messages.push(
      summary.indoor
        ? `Indoor backup: ${summary.indoor.name} (${formatDistance(summary.indoor.distanceKm)})`
        : "No indoor backup found nearby."
    );
  }

  return messages;
}

export function formatDistance(distanceKm) {
  const distance = Number(distanceKm);

  if (!Number.isFinite(distance)) return "distance unavailable";
  if (distance < 1) return `${Math.round(distance * 1000)} m away`;

  return `${distance.toFixed(1)} km away`;
}

function buildOverpassQuery(lat, lng, radiusKm, comfortNeeds) {
  const radiusMeters = Math.round(radiusKm * 1000);
  const parts = [];

  if (comfortNeeds.water) {
    parts.push(
      `node(around:${radiusMeters},${lat},${lng})["amenity"="drinking_water"];`,
      `way(around:${radiusMeters},${lat},${lng})["amenity"="drinking_water"];`,
      `relation(around:${radiusMeters},${lat},${lng})["amenity"="drinking_water"];`,
      `node(around:${radiusMeters},${lat},${lng})["drinking_water"="yes"];`,
      `way(around:${radiusMeters},${lat},${lng})["drinking_water"="yes"];`,
      `node(around:${radiusMeters},${lat},${lng})["amenity"="fountain"];`,
      `way(around:${radiusMeters},${lat},${lng})["amenity"="fountain"];`
    );
  }

  if (comfortNeeds.shade) {
    parts.push(
      `node(around:${radiusMeters},${lat},${lng})["leisure"="park"];`,
      `way(around:${radiusMeters},${lat},${lng})["leisure"="park"];`,
      `relation(around:${radiusMeters},${lat},${lng})["leisure"="park"];`,
      `node(around:${radiusMeters},${lat},${lng})["leisure"="garden"];`,
      `way(around:${radiusMeters},${lat},${lng})["leisure"="garden"];`,
      `node(around:${radiusMeters},${lat},${lng})["natural"="tree"];`,
      `node(around:${radiusMeters},${lat},${lng})["amenity"="shelter"];`,
      `way(around:${radiusMeters},${lat},${lng})["amenity"="shelter"];`,
      `node(around:${radiusMeters},${lat},${lng})["tourism"="picnic_site"];`,
      `way(around:${radiusMeters},${lat},${lng})["tourism"="picnic_site"];`
    );
  }

  return `
    [out:json][timeout:25];
    (
      ${parts.join("\n")}
    );
    out center tags 80;
  `;
}

function normalizeOverpassElements(elements, originLat, originLng) {
  return elements
    .map((element) => {
      const lat = Number(element.lat ?? element.center?.lat);
      const lng = Number(element.lon ?? element.center?.lon);
      const tags = element.tags || {};

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      const category = detectFeatureCategory(tags);
      if (!category) return null;

      return {
        id: `${element.type}-${element.id}`,
        name: getFeatureName(tags, category),
        type: getFeatureType(tags),
        category,
        lat,
        lng,
        distanceKm: Number(calculateDistanceKm(originLat, originLng, lat, lng).toFixed(2)),
        source: "openstreetmap",
      };
    })
    .filter(Boolean);
}

function detectFeatureCategory(tags) {
  if (
    tags.amenity === "drinking_water" ||
    tags.drinking_water === "yes" ||
    tags.amenity === "fountain"
  ) {
    return "water";
  }

  if (
    tags.leisure === "park" ||
    tags.leisure === "garden" ||
    tags.natural === "tree" ||
    tags.amenity === "shelter" ||
    tags.tourism === "picnic_site"
  ) {
    return "shade";
  }

  return null;
}

function shouldKeepFeature(feature, comfortNeeds) {
  if (feature.category === "water") return Boolean(comfortNeeds.water);
  if (feature.category === "shade") return Boolean(comfortNeeds.shade);
  return false;
}

function getFeatureName(tags, category) {
  if (tags.name) return tags.name;
  if (tags.amenity === "drinking_water") return "Public drinking water";
  if (tags.drinking_water === "yes") return "Public water source";
  if (tags.amenity === "fountain") return "Public fountain";
  if (tags.leisure === "park") return "Nearby park";
  if (tags.leisure === "garden") return "Nearby garden";
  if (tags.natural === "tree") return "Tree-covered shade";
  if (tags.amenity === "shelter") return "Shelter";
  if (tags.tourism === "picnic_site") return "Picnic site";

  return category === "water" ? "Water source" : "Shade support";
}

function getFeatureType(tags) {
  return (
    tags.amenity ||
    tags.leisure ||
    tags.natural ||
    tags.tourism ||
    tags.drinking_water ||
    "comfort_feature"
  );
}

function findNearestIndoorFeature(place, indoorPlaces) {
  if (place.category === "indoor") {
    return {
      id: place.googlePlaceId,
      name: place.name,
      type: "indoor_place",
      category: "indoor",
      lat: place.lat,
      lng: place.lng,
      distanceKm: 0,
      source: place.source || "google_places",
    };
  }

  return (indoorPlaces || [])
    .filter((candidate) => candidate.googlePlaceId !== place.googlePlaceId)
    .filter((candidate) => candidate.category === "indoor")
    .map((candidate) => ({
      id: candidate.googlePlaceId,
      name: candidate.name,
      type: "indoor_place",
      category: "indoor",
      lat: candidate.lat,
      lng: candidate.lng,
      distanceKm: Number(
        calculateDistanceKm(place.lat, place.lng, candidate.lat, candidate.lng).toFixed(2)
      ),
      source: candidate.source || "google_places",
    }))
    .filter((feature) => feature.distanceKm <= CLOSE_FEATURE_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)[0] || null;
}

function createEmptySummary(comfortNeeds = {}) {
  return {
    considered: {
      water: Boolean(comfortNeeds.water),
      shade: Boolean(comfortNeeds.shade),
      indoor: Boolean(comfortNeeds.indoor),
      any: Boolean(comfortNeeds.any),
    },
    water: null,
    shade: null,
    indoor: null,
  };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}
