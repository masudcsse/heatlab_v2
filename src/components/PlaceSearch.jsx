import { useEffect, useState } from "react";
import {
  searchBambergPlaces,
  getPlaceDetails,
} from "../services/googlePlacesService";

function PlaceSearch({ selectedPlace, onPlaceSelected }) {
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) {
        setPredictions([]);
        return;
      }

      try {
        setIsSearching(true);
        setError("");
        const results = await searchBambergPlaces(query);
        setPredictions(results);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  async function handleSelectPlace(prediction) {
    try {
      setIsSearching(true);
      setError("");

      const details = await getPlaceDetails(prediction.place_id);
      onPlaceSelected(details);
      setQuery(details.name);
      setPredictions([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="place-search">
      <label>Search Location in Bamberg</label>

      <input
        type="text"
        placeholder="Search cafes, parks, museums, landmarks..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {isSearching && <small>Searching places...</small>}
      {error && <small className="error-text">{error}</small>}

      {predictions.length > 0 && (
        <div className="prediction-list">
          {predictions.map((prediction) => (
            <button
              key={prediction.place_id}
              type="button"
              onClick={() => handleSelectPlace(prediction)}
            >
              <strong>{prediction.structured_formatting.main_text}</strong>
              <span>{prediction.description}</span>
            </button>
          ))}
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

export default PlaceSearch;
