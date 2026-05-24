import { useEffect, useRef, useState } from "react";
import {
  getBambergLocationBias,
  loadGooglePlacesScript,
} from "../services/googlePlaces";
import {
  searchBambergPlaces,
  getPlaceDetails,
} from "../services/googlePlacesService";

function buildSetupChecklist(errorText) {
  const checklist = [
    "Confirm .env contains VITE_GOOGLE_PLACES_API_KEY and restart npm run dev.",
    "Enable Maps JavaScript API in Google Cloud (same project as the API key).",
    "Enable Places API and Places API (New) in the same project.",
    "Enable billing for the Google Cloud project.",
    "Add HTTP referrer restrictions for http://localhost:5173/* and http://127.0.0.1:5173/*.",
    "In API restrictions for this key, allow Maps JavaScript API and Places APIs.",
    "Wait 5-10 minutes after key/API changes, then hard refresh browser.",
  ];

  if (!errorText) return checklist;

  if (
    errorText.includes("ApiTargetBlockedMapError") ||
    errorText.includes("autocomplete widget is unavailable")
  ) {
    return checklist;
  }

  if (errorText.includes("Missing VITE_GOOGLE_PLACES_API_KEY")) {
    return [
      "Create/update .env with VITE_GOOGLE_PLACES_API_KEY=your_google_api_key.",
      "Stop and restart the Vite dev server.",
      "Hard refresh the browser.",
    ];
  }

  return checklist;
}

function PlaceAutocomplete({ selectedPlace, onPlaceSelected }) {
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const autocompleteElementRef = useRef(null);
  const legacyAutocompleteRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [setupChecklist, setSetupChecklist] = useState([]);
  const [useLegacyInput, setUseLegacyInput] = useState(true);
  const [useFallbackAutocomplete, setUseFallbackAutocomplete] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let onSelect = null;

    async function initAutocomplete() {
      try {
        setLoading(true);
        setError("");

        const google = await loadGooglePlacesScript();
        if (!isMounted || !containerRef.current) return;

        const { bounds } = getBambergLocationBias(google.maps);
        const PlaceAutocompleteElement = google.maps?.places?.PlaceAutocompleteElement;

        if (PlaceAutocompleteElement) {
          setUseLegacyInput(false);
          const autocompleteElement = new PlaceAutocompleteElement();
          autocompleteElement.placeholder = "Search places in Bamberg";
          autocompleteElement.className = "gmp-place-autocomplete";
          autocompleteElement.locationRestriction = bounds;
          autocompleteElement.locationBias = {
            center: { lat: 49.8988, lng: 10.9028 },
            radius: 10_000,
          };
          autocompleteElement.includedRegionCodes = ["de"];
          autocompleteElement.includedPrimaryTypes = ["establishment"];
          autocompleteElement.setAttribute("aria-label", "Search places in Bamberg");

          containerRef.current.innerHTML = "";
          containerRef.current.appendChild(autocompleteElement);
          autocompleteElementRef.current = autocompleteElement;

          onSelect = async ({ placePrediction }) => {
            if (!placePrediction) {
              setError("Please select a valid place suggestion from the dropdown.");
              onPlaceSelected(null);
              return;
            }

            const place = placePrediction.toPlace();
            await place.fetchFields({
              fields: ["id", "displayName", "formattedAddress", "location", "types"],
            });

            if (!place?.location) {
              setError("Please select a valid place suggestion from the dropdown.");
              onPlaceSelected(null);
              return;
            }

            const normalized = {
              id: place.id,
              googlePlaceId: place.id,
              name: place.displayName || "",
              address: place.formattedAddress || "",
              lat: place.location.lat(),
              lng: place.location.lng(),
              types: place.types || [],
              source: "google_places",
            };

            setError("");
            onPlaceSelected(normalized);
          };

          autocompleteElement.addEventListener("gmp-select", onSelect);
        } else if (inputRef.current && google.maps?.places?.Autocomplete) {
          setUseLegacyInput(true);
          const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
            fields: ["place_id", "name", "formatted_address", "geometry", "types"],
            componentRestrictions: { country: "de" },
            bounds,
            strictBounds: false,
            types: ["establishment"],
          });

          legacyAutocompleteRef.current = autocomplete;
          autocomplete.addListener("place_changed", () => {
            const place = autocomplete.getPlace();
            const geometry = place?.geometry?.location;
            if (!geometry) {
              setError("Please select a valid place suggestion from the dropdown.");
              onPlaceSelected(null);
              return;
            }

            setError("");
            onPlaceSelected({
              id: place.place_id,
              googlePlaceId: place.place_id,
              name: place.name || "",
              address: place.formatted_address || "",
              lat: geometry.lat(),
              lng: geometry.lng(),
              types: place.types || [],
              source: "google_places",
            });
          });
        } else {
          setUseFallbackAutocomplete(true);
          setUseLegacyInput(true);
          setError("");
          return;
        }
      } catch (err) {
        const message =
          err?.message ||
          "Google Places could not be loaded. Check API key and project setup.";
        setError(
          message
        );
        setSetupChecklist(buildSetupChecklist(message));
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initAutocomplete();

    return () => {
      isMounted = false;
      if (autocompleteElementRef.current && onSelect) {
        autocompleteElementRef.current.removeEventListener("gmp-select", onSelect);
      }
    };
  }, [onPlaceSelected]);

  useEffect(() => {
    if (!useFallbackAutocomplete) return;
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        const results = await searchBambergPlaces(query);
        setSuggestions(results);
      } catch (err) {
        setError(err.message || "Search failed.");
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query, useFallbackAutocomplete]);

  async function handleFallbackSelection(prediction) {
    if (!prediction?.place_id) return;

    try {
      setIsSearching(true);
      const place = await getPlaceDetails(prediction.place_id);
      setError("");
      setSuggestions([]);
      setQuery(place.name);
      onPlaceSelected(place);
    } catch (err) {
      setError(err.message || "Failed to load place details.");
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="place-search place-autocomplete">
      <label htmlFor="place-autocomplete-fallback">Search Location in Bamberg</label>
      <div ref={containerRef} />
      {useLegacyInput && (
        <input
          id="place-autocomplete-fallback"
          ref={inputRef}
          type="text"
          placeholder="Search places in Bamberg"
          className="place-autocomplete-fallback-input"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}

      {useFallbackAutocomplete && suggestions.length > 0 && (
        <div className="fallback-suggestions">
          {isSearching && <small>Searching...</small>}
          {suggestions.map((prediction) => (
            <button
              key={prediction.place_id}
              type="button"
              className="suggestion-item"
              onClick={() => handleFallbackSelection(prediction)}
            >
              <strong>{prediction.structured_formatting?.main_text || prediction.description}</strong>
              <span>{prediction.description}</span>
            </button>
          ))}
        </div>
      )}

      {loading && <small>Loading Google Places...</small>}
      {error && <small className="error-text">{error}</small>}
      {error && setupChecklist.length > 0 && (
        <div className="setup-checklist">
          <strong>Google Places Setup Checklist</strong>
          <ol>
            {setupChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      )}

      {selectedPlace && (
        <div className="selected-place-box">
          <strong>Selected:</strong> {selectedPlace.name}
          <br />
          <span>{selectedPlace.address}</span>
        </div>
      )}
    </div>
  );
}

export default PlaceAutocomplete;
