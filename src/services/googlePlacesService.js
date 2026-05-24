import { loadGooglePlacesScript } from "./googlePlaces";

const BAMBERG_CENTER = {
  lat: 49.8988,
  lng: 10.9028,
};

export async function searchBambergPlaces(query) {
  if (!query || query.trim().length < 2) {
    return [];
  }

  // Try client-side Maps AutocompleteService first. If it's unavailable
  // or returns REQUEST_DENIED (legacy API / billing / key issues), fall back
  // to the Places Web Service (HTTP) as a pragmatic workaround for development.
  try {
    const google = await loadGooglePlacesScript();

    if (google && google.maps && google.maps.places && google.maps.places.AutocompleteService) {
      const service = new google.maps.places.AutocompleteService();

      return await new Promise((resolve, reject) => {
        service.getPlacePredictions(
          {
            input: `${query} Bamberg Germany`,
            componentRestrictions: { country: "de" },
            location: new google.maps.LatLng(BAMBERG_CENTER.lat, BAMBERG_CENTER.lng),
            radius: 10000,
            types: ["establishment"],
          },
          (predictions, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK) {
              resolve(predictions || []);
            } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
              resolve([]);
            } else {
              // If service rejects due to legacy API or key, fall back to HTTP API
              reject(new Error(status));
            }
          }
        );
      });
    }
  } catch (e) {
    // continue to HTTP fallback
  }

  // Fallback: call the Places Autocomplete Web Service (HTTP). This will
  // expose the key in client requests — acceptable for local dev but for
  // production you should proxy requests through your server and keep the
  // key private.
  return fetchPlaceAutocomplete(import.meta.env.VITE_GOOGLE_PLACES_API_KEY, query);
}

export async function getPlaceDetails(placeId) {
  // Try client-side PlacesService first; otherwise fall back to the Place Details
  // Web Service (HTTP).
  try {
    const google = await loadGooglePlacesScript();
    if (google && google.maps && google.maps.places) {
      const dummyDiv = document.createElement("div");
      const service = new google.maps.places.PlacesService(dummyDiv);

      return await new Promise((resolve, reject) => {
        service.getDetails(
          {
            placeId,
            fields: ["place_id", "name", "formatted_address", "geometry", "types"],
          },
          (place, status) => {
            if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
              reject(new Error(status));
              return;
            }

            resolve({
              id: place.place_id,
              googlePlaceId: place.place_id,
              name: place.name,
              address: place.formatted_address,
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
              types: place.types || [],
              category: detectPlaceCategory(place.types || []),
              source: "google_places",
            });
          }
        );
      });
    }
  } catch (e) {
    // fallback to HTTP below
  }

  return fetchPlaceDetails(import.meta.env.VITE_GOOGLE_PLACES_API_KEY, placeId);
}

// --- HTTP fallback helpers ---
async function fetchPlaceAutocomplete(apiKey, query) {
  if (!apiKey) return [];

  const input = encodeURIComponent(`${query} Bamberg Germany`);
  const location = `${BAMBERG_CENTER.lat},${BAMBERG_CENTER.lng}`;
  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${input}&key=${apiKey}&components=country:de&location=${location}&radius=10000&types=establishment`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === "OK") {
      // Normalize to the same shape as the Maps JS predictions when possible
      return (data.predictions || []).map((p) => ({
        place_id: p.place_id,
        description: p.description,
        structured_formatting: p.structured_formatting || {},
      }));
    }

    return [];
  } catch (err) {
    return [];
  }
}

async function fetchPlaceDetails(apiKey, placeId) {
  if (!apiKey) throw new Error("Missing API key for place details");

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=place_id,name,formatted_address,geometry,types&key=${apiKey}`;

  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== "OK" || !data.result) {
    throw new Error(`Place details failed: ${data.status}`);
  }

  const place = data.result;
  return {
    id: place.place_id,
    googlePlaceId: place.place_id,
    name: place.name,
    address: place.formatted_address,
    lat: place.geometry.location.lat,
    lng: place.geometry.location.lng,
    types: place.types || [],
    category: detectPlaceCategory(place.types || []),
    source: "google_places",
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
        location: new google.maps.LatLng(lat, lng),
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
