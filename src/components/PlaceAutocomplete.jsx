import { useEffect, useRef, useState } from "react";
import {
  getBambergLocationRestriction,
  importPlacesLibrary,
  normalizePlace,
} from "../services/googlePlaces";

function buildSetupChecklist(errorText) {
  const currentOrigin =
    typeof window !== "undefined" ? `${window.location.origin}/*` : "";
  const baseChecklist = [
    "Confirm .env contains VITE_GOOGLE_PLACES_API_KEY and restart npm run dev.",
    "Enable Maps JavaScript API in the same Google Cloud project as the API key.",
    "Enable Places API and Places API (New) in the same project.",
    "Enable billing for the Google Cloud project.",
    `Set Application restrictions to Websites and add the exact current dev URL: ${currentOrigin || "http://localhost:5173/*"}.`,
    "Also add http://localhost:5173/* and http://127.0.0.1:5173/* if you switch back to the default Vite port.",
    "In API restrictions for this key, allow Maps JavaScript API, Places API, and Places API (New).",
    "Wait 5-10 minutes after key/API changes, then hard refresh the browser.",
  ];

  if (errorText?.includes("Missing VITE_GOOGLE_PLACES_API_KEY")) {
    return [
      "Create/update .env with VITE_GOOGLE_PLACES_API_KEY=your_google_api_key.",
      "Stop and restart the Vite dev server.",
      "Hard refresh the browser.",
    ];
  }

  return baseChecklist;
}

function getGooglePlacesErrorMessage(error) {
  const message = error?.message || String(error);

  if (
    message.includes("ApiTargetBlockedMapError") ||
    message.includes("REQUEST_DENIED") ||
    message.includes("not authorized")
  ) {
    return "Google Places is blocked for this API key. In Google Cloud, this key must allow Maps JavaScript API, Places API, and Places API (New).";
  }

  if (message.includes("Requests from referer")) {
    const currentOrigin =
      typeof window !== "undefined" ? `${window.location.origin}/*` : "this localhost URL";
    return `Google Places is blocked for the current dev URL. Add ${currentOrigin} to this API key's Website restrictions.`;
  }

  return message || "Google Places could not be loaded. Check API key and project setup.";
}

function getPredictionText(prediction, fieldName) {
  const value = prediction?.[fieldName];
  return value?.text || value?.toString?.() || "";
}

function getSuggestionLabel(suggestion) {
  const prediction = suggestion.placePrediction;
  return {
    main:
      getPredictionText(prediction, "mainText") ||
      getPredictionText(prediction, "text") ||
      "Unnamed place",
    secondary: getPredictionText(prediction, "secondaryText"),
  };
}

function PlaceAutocomplete({ selectedPlace, onPlaceSelected }) {
  const inputRef = useRef(null);
  const placesLibraryRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const requestIdRef = useRef(0);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isReady, setIsReady] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const [setupChecklist, setSetupChecklist] = useState([]);

  useEffect(() => {
    let isMounted = true;

    async function loadPlaces() {
      try {
        const placesLibrary = await importPlacesLibrary();
        if (!isMounted) return;

        placesLibraryRef.current = placesLibrary;
        sessionTokenRef.current = new placesLibrary.AutocompleteSessionToken();
        setIsReady(true);
        setError("");
        setSetupChecklist([]);
      } catch (err) {
        if (!isMounted) return;

        const message = getGooglePlacesErrorMessage(err);
        setError(message);
        setSetupChecklist(buildSetupChecklist(message));
        setIsReady(false);
      }
    }

    loadPlaces();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (!isReady || trimmedQuery.length < 2) {
      setSuggestions([]);
      setActiveIndex(-1);
      return;
    }

    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;

    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        setError("");
        setSetupChecklist([]);

        const { AutocompleteSuggestion, AutocompleteSessionToken } =
          placesLibraryRef.current;

        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new AutocompleteSessionToken();
        }

        const bambergQuery = trimmedQuery.toLowerCase().includes("bamberg")
          ? trimmedQuery
          : `${trimmedQuery} Bamberg`;

        const response = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: bambergQuery,
          includedRegionCodes: ["de"],
          locationRestriction: getBambergLocationRestriction(),
          region: "de",
          sessionToken: sessionTokenRef.current,
        });

        if (requestIdRef.current !== currentRequestId) return;

        const placeSuggestions = (response.suggestions || []).filter(
          (suggestion) => suggestion.placePrediction
        );

        setSuggestions(placeSuggestions);
        setActiveIndex(placeSuggestions.length > 0 ? 0 : -1);
      } catch (err) {
        if (requestIdRef.current !== currentRequestId) return;

        const message = getGooglePlacesErrorMessage(err);
        setError(message);
        setSetupChecklist(buildSetupChecklist(message));
        setSuggestions([]);
        setActiveIndex(-1);
      } finally {
        if (requestIdRef.current === currentRequestId) {
          setIsSearching(false);
        }
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [isReady, query]);

  function handleInputChange(event) {
    const nextQuery = event.target.value;
    setQuery(nextQuery);

    if (selectedPlace) {
      onPlaceSelected(null);
    }
  }

  async function handleSuggestionSelect(suggestion) {
    const prediction = suggestion?.placePrediction;
    if (!prediction) return;

    try {
      setIsSearching(true);
      setError("");
      setSetupChecklist([]);

      const place = prediction.toPlace();
      await place.fetchFields({
        fields: ["id", "displayName", "formattedAddress", "location", "types"],
      });

      const normalizedPlace = normalizePlace(place);

      if (
        !Number.isFinite(normalizedPlace?.lat) ||
        !Number.isFinite(normalizedPlace?.lng)
      ) {
        throw new Error("Please select a valid place suggestion with coordinates.");
      }

      const { AutocompleteSessionToken } = placesLibraryRef.current;
      sessionTokenRef.current = new AutocompleteSessionToken();

      setQuery(normalizedPlace.name || normalizedPlace.address);
      setSuggestions([]);
      setActiveIndex(-1);
      onPlaceSelected(normalizedPlace);
    } catch (err) {
      const message = getGooglePlacesErrorMessage(err);
      setError(message);
      setSetupChecklist(buildSetupChecklist(message));
      onPlaceSelected(null);
    } finally {
      setIsSearching(false);
    }
  }

  function handleKeyDown(event) {
    if (suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        index <= 0 ? suggestions.length - 1 : index - 1
      );
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      handleSuggestionSelect(suggestions[activeIndex]);
    }

    if (event.key === "Escape") {
      setSuggestions([]);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="place-search place-autocomplete">
      <label htmlFor="place-autocomplete-input">Search Location in Bamberg</label>

      <input
        id="place-autocomplete-input"
        ref={inputRef}
        type="text"
        placeholder="Search places in Bamberg"
        autoComplete="off"
        value={query}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        disabled={!isReady && !error}
        aria-expanded={suggestions.length > 0}
        aria-controls="place-autocomplete-suggestions"
      />

      {!isReady && !error && <small>Loading Google Places...</small>}
      {isSearching && isReady && <small>Searching places...</small>}

      {suggestions.length > 0 && (
        <div
          id="place-autocomplete-suggestions"
          className="autocomplete-suggestions"
          role="listbox"
        >
          {suggestions.map((suggestion, index) => {
            const label = getSuggestionLabel(suggestion);
            const key =
              suggestion.placePrediction?.placeId ||
              `${label.main}-${label.secondary}-${index}`;

            return (
              <button
                key={key}
                type="button"
                className={`suggestion-item${
                  index === activeIndex ? " suggestion-item-active" : ""
                }`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => handleSuggestionSelect(suggestion)}
              >
                <strong>{label.main}</strong>
                {label.secondary && <span>{label.secondary}</span>}
              </button>
            );
          })}
        </div>
      )}

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
