export const BAMBERG_CENTER = { lat: 49.8988, lng: 10.9028 };
export const BAMBERG_RADIUS_METERS = 10_000;

let placesLibraryPromise = null;

export function getGooglePlacesApiKey() {
  return import.meta.env.VITE_GOOGLE_PLACES_API_KEY || "";
}

export function getBambergLocationBias() {
  return {
    center: { ...BAMBERG_CENTER },
    radius: BAMBERG_RADIUS_METERS,
  };
}

export function getBambergLocationRestriction() {
  const latDelta = BAMBERG_RADIUS_METERS / 111_320;
  const lngDelta =
    BAMBERG_RADIUS_METERS /
    (111_320 * Math.cos((BAMBERG_CENTER.lat * Math.PI) / 180));

  return {
    north: BAMBERG_CENTER.lat + latDelta,
    south: BAMBERG_CENTER.lat - latDelta,
    east: BAMBERG_CENTER.lng + lngDelta,
    west: BAMBERG_CENTER.lng - lngDelta,
  };
}

function installGoogleMapsImportLibrary() {
  if (window.google?.maps?.importLibrary) {
    return;
  }

  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) {
    throw new Error(
      "Missing VITE_GOOGLE_PLACES_API_KEY. Add it to your .env file and restart Vite."
    );
  }

  const googleObject = (window.google = window.google || {});
  const mapsObject = (googleObject.maps = googleObject.maps || {});
  const requestedLibraries = new Set();
  let scriptPromise;

  mapsObject.importLibrary = (libraryName, ...args) => {
    requestedLibraries.add(libraryName);

    scriptPromise =
      scriptPromise ||
      new Promise((resolve, reject) => {
        const script = document.createElement("script");
        const params = new URLSearchParams({
          key: apiKey,
          v: "weekly",
          loading: "async",
          callback: "google.maps.__ib__",
        });

        params.set("libraries", Array.from(requestedLibraries).join(","));

        mapsObject.__ib__ = resolve;
        script.onerror = () =>
          reject(
            new Error(
              "Google Maps JavaScript API failed to load. Check API key restrictions, enabled APIs, billing, and localhost referrers."
            )
          );

        script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
        document.head.appendChild(script);
      });

    return scriptPromise.then(() => mapsObject.importLibrary(libraryName, ...args));
  };
}

export async function importPlacesLibrary() {
  if (placesLibraryPromise) {
    return placesLibraryPromise;
  }

  installGoogleMapsImportLibrary();
  placesLibraryPromise = window.google.maps.importLibrary("places");

  return placesLibraryPromise;
}

export async function loadGooglePlacesScript() {
  await importPlacesLibrary();
  return window.google;
}

export function normalizePlace(place) {
  const location = place?.location || place?.geometry?.location;
  if (!location) return null;

  const lat = typeof location.lat === "function" ? location.lat() : location.lat;
  const lng = typeof location.lng === "function" ? location.lng() : location.lng;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    id: place.id || place.place_id,
    googlePlaceId: place.id || place.place_id,
    name: place.displayName || place.name || "",
    address: place.formattedAddress || place.formatted_address || "",
    lat,
    lng,
    types: place.types || [],
    source: "google_places",
  };
}
