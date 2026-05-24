import {
  getBambergLocationRestriction,
  importPlacesLibrary,
  normalizePlace,
} from "./googlePlaces";

export async function searchBambergPlaces(query) {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const { AutocompleteSuggestion, AutocompleteSessionToken } =
    await importPlacesLibrary();

  const trimmedQuery = query.trim();
  const bambergQuery = trimmedQuery.toLowerCase().includes("bamberg")
    ? trimmedQuery
    : `${trimmedQuery} Bamberg`;

  const response = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: bambergQuery,
    includedRegionCodes: ["de"],
    locationRestriction: getBambergLocationRestriction(),
    region: "de",
    sessionToken: new AutocompleteSessionToken(),
  });

  return (response.suggestions || [])
    .filter((suggestion) => suggestion.placePrediction)
    .map((suggestion) => {
      const prediction = suggestion.placePrediction;
      const mainText =
        prediction.mainText?.text ||
        prediction.mainText?.toString?.() ||
        prediction.text?.text ||
        prediction.text?.toString?.() ||
        "";
      const secondaryText =
        prediction.secondaryText?.text ||
        prediction.secondaryText?.toString?.() ||
        "";

      return {
        place_id: prediction.placeId,
        description: prediction.text?.text || prediction.text?.toString?.() || "",
        structured_formatting: {
          main_text: mainText,
          secondary_text: secondaryText,
        },
      };
    });
}

export async function getPlaceDetails(placeId) {
  const { Place } = await importPlacesLibrary();
  const place = new Place({ id: placeId });

  await place.fetchFields({
    fields: ["id", "displayName", "formattedAddress", "location", "types"],
  });

  const normalizedPlace = normalizePlace(place);
  if (!normalizedPlace) {
    throw new Error("Place details failed: missing place geometry.");
  }

  return {
    ...normalizedPlace,
    category: detectPlaceCategory(normalizedPlace.types || []),
  };
}

export async function getNearbyPlaces(lat, lng, radiusKm, placeType) {
  const { Place, SearchNearbyRankPreference } = await importPlacesLibrary();
  const googleTypes = getGoogleTypesFromPlaceType(placeType);
  const { places } = await Place.searchNearby({
    fields: ["id", "displayName", "formattedAddress", "location", "types"],
    includedPrimaryTypes: googleTypes,
    locationRestriction: {
      center: { lat, lng },
      radius: radiusKm * 1000,
    },
    maxResultCount: 15,
    rankPreference: SearchNearbyRankPreference.POPULARITY,
    region: "de",
  });

  return (places || [])
    .map((place) => {
      const normalizedPlace = normalizePlace(place);
      if (!normalizedPlace) return null;

      return {
        ...normalizedPlace,
        category: detectPlaceCategory(normalizedPlace.types || []),
      };
    })
    .filter(Boolean);
}

function getGoogleTypesFromPlaceType(placeType) {
  const typeMap = {
    All: [
      "tourist_attraction",
      "park",
      "museum",
      "cafe",
      "restaurant",
      "library",
      "shopping_mall",
      "art_gallery",
      "bakery",
      "church",
    ],
    Outdoor: ["tourist_attraction", "park", "church"],
    Indoor: ["museum", "library", "shopping_mall", "art_gallery"],
    Historical: ["tourist_attraction", "museum", "church"],
    "Park / Garden": ["park"],
    "Food/Cafe": ["cafe", "restaurant", "bakery"],
    "Public Space": ["tourist_attraction", "park"],
    "Recreational Area": ["park", "tourist_attraction"],
  };

  return typeMap[placeType] || typeMap.All;
}

function detectPlaceCategory(types) {
  const indoorTypes = [
    "museum",
    "cafe",
    "restaurant",
    "library",
    "shopping_mall",
    "art_gallery",
    "bakery",
  ];

  const outdoorTypes = ["park", "tourist_attraction", "church"];

  if (types.some((type) => indoorTypes.includes(type))) {
    return "indoor";
  }

  if (types.some((type) => outdoorTypes.includes(type))) {
    return "outdoor";
  }

  return "mixed";
}

function removeDuplicatePlaces(places) {
  const map = new Map();

  places.forEach((place) => {
    if (place.place_id && !map.has(place.place_id)) {
      map.set(place.place_id, place);
    }
  });

  return Array.from(map.values()).slice(0, 15);
}
