import {
  getBambergLocationRestriction,
  importPlacesLibrary,
  loadGooglePlacesScript,
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
  const google = await loadGooglePlacesScript();
  const dummyDiv = document.createElement("div");
  const service = new google.maps.places.PlacesService(dummyDiv);

  const googleTypes = getGoogleTypesFromPlaceType(placeType);
  const allResults = [];

  for (const type of googleTypes) {
    const results = await nearbySearchByType(service, google, lat, lng, radiusKm, type);
    allResults.push(...results);
  }

  const uniquePlaces = removeDuplicatePlaces(allResults);

  return uniquePlaces.map((place) => ({
    id: place.place_id,
    googlePlaceId: place.place_id,
    name: place.name,
    address: place.vicinity || "Address not available",
    lat: place.geometry.location.lat(),
    lng: place.geometry.location.lng(),
    types: place.types || [],
    category: detectPlaceCategory(place.types || []),
    source: "google_places",
  }));
}

function nearbySearchByType(service, google, lat, lng, radiusKm, type) {
  return new Promise((resolve, reject) => {
    service.nearbySearch(
      {
        location: { lat, lng },
        radius: radiusKm * 1000,
        type,
      },
      (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
          resolve(results || []);
        } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
          resolve([]);
        } else {
          reject(new Error(`Nearby search failed for ${type}: ${status}`));
        }
      }
    );
  });
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
