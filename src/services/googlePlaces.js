const GOOGLE_SCRIPT_ID = "google-maps-places-script";
const BAMBERG_CENTER = { lat: 49.8988, lng: 10.9028 };
const BAMBERG_RADIUS_METERS = 10_000;

let mapsScriptPromise = null;

export function getGooglePlacesApiKey() {
  return import.meta.env.VITE_GOOGLE_PLACES_API_KEY || "";
}

export function getBambergLocationBias(googleMaps) {
  const center = { ...BAMBERG_CENTER };
  const latDelta = BAMBERG_RADIUS_METERS / 111_320;
  const lngDelta =
    BAMBERG_RADIUS_METERS /
    (111_320 * Math.cos((BAMBERG_CENTER.lat * Math.PI) / 180));
  const bounds = {
    north: BAMBERG_CENTER.lat + latDelta,
    south: BAMBERG_CENTER.lat - latDelta,
    east: BAMBERG_CENTER.lng + lngDelta,
    west: BAMBERG_CENTER.lng - lngDelta,
  };

  return {
    center,
    bounds,
  };
}

export function loadGooglePlacesScript() {
  if (window.google?.maps?.places) {
    return Promise.resolve(window.google);
  }

  if (mapsScriptPromise) {
    return mapsScriptPromise;
  }

  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) {
    return Promise.reject(
      new Error(
        "Missing VITE_GOOGLE_PLACES_API_KEY. Add it to your .env file and restart Vite."
      )
    );
  }

  mapsScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_SCRIPT_ID);

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.google), {
        once: true,
      });
      existingScript.addEventListener(
        "error",
        () =>
          reject(
            new Error(
              "Google Maps API failed to load. Check API key, billing, Places API, and referrer rules."
            )
          ),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async&libraries=places&v=weekly`;
    script.async = true;
    script.defer = true;

    script.onload = () => resolve(window.google);
    script.onerror = () =>
      reject(
        new Error(
          "Google Maps API failed to load. Check API key, billing, Places API, and referrer rules."
        )
      );

    document.head.appendChild(script);
  });

  return mapsScriptPromise;
}

export function normalizeGooglePlace(place) {
  const geometry = place?.geometry?.location;
  if (!geometry) return null;

  return {
    id: place.place_id,
    googlePlaceId: place.place_id,
    name: place.name || "",
    address: place.formatted_address || "",
    lat: geometry.lat(),
    lng: geometry.lng(),
    types: place.types || [],
    source: "google_places",
  };
}
