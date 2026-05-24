import { useState } from "react";

import PlaceAutocomplete from "./components/PlaceAutocomplete";
import ActivityPreferenceSelect from "./components/ActivityPreferenceSelect";
import PlaceTypeSelect from "./components/PlaceTypeSelect";
import LoadingState from "./components/LoadingState";
import ErrorState from "./components/ErrorState";
import SelectedPlaceWeatherCard from "./components/SelectedPlaceWeatherCard";
import NearbyPlacesList from "./components/NearbyPlacesList";
import WeatherComparison from "./components/WeatherComparison";
import RecommendationCard from "./components/RecommendationCard";

import { getNearbyPlaces } from "./services/googlePlacesService";
import { getNetatmoWeather } from "./services/netatmoService";
import {
  calculateComfortScore,
  rankPlacesByComfort,
} from "./utils/comfortScore";

function App() {
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [activityPreference, setActivityPreference] = useState("All");
  const [placeType, setPlaceType] = useState("All");

  const [selectedPlaceWeather, setSelectedPlaceWeather] = useState(null);
  const [nearbyPlacesWithWeather, setNearbyPlacesWithWeather] = useState([]);
  const [recommendation, setRecommendation] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleFindBestPlace() {
    if (!selectedPlace) {
      setError("Please search and select a specific place in Bamberg first.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setRecommendation(null);
      setSelectedPlaceWeather(null);
      setNearbyPlacesWithWeather([]);

      // 1. Fetch weather for the selected place.
      const selectedWeather = await getNetatmoWeather(
        selectedPlace.lat,
        selectedPlace.lng
      );

      const selectedScoreResult = calculateComfortScore(
        selectedPlace,
        selectedWeather,
        activityPreference,
        placeType
      );

      const selectedItem = {
        place: selectedPlace,
        weather: selectedWeather,
        comfortScore: selectedScoreResult.score,
        suitabilityReason: selectedScoreResult.reason,
        errors: [],
      };

      setSelectedPlaceWeather(selectedItem);

      // 2. Discover nearby places within 2 KM using Google Places API.
      let nearbyPlaces = [];

      try {
        nearbyPlaces = await getNearbyPlaces(
          selectedPlace.lat,
          selectedPlace.lng,
          2,
          placeType
        );
      } catch (err) {
        setRecommendation(selectedItem);
        setError(
          `Selected place weather loaded from Netatmo, but nearby Google Places comparison failed: ${
            err.message || "Unknown nearby places error."
          }`
        );
        return;
      }

      // 3. Fetch weather for each nearby place and calculate comfort scores.
      const nearbyWithWeather = await Promise.all(
        nearbyPlaces.map(async (place) => {
          try {
            const weather = await getNetatmoWeather(place.lat, place.lng);

            const scoreResult = calculateComfortScore(
              place,
              weather,
              activityPreference,
              placeType
            );

            return {
              place,
              weather,
              comfortScore: scoreResult.score,
              suitabilityReason: scoreResult.reason,
              errors: [],
            };
          } catch (err) {
            return {
              place,
              weather: null,
              comfortScore: null,
              suitabilityReason: "No Netatmo weather data available for this place.",
              errors: [err.message],
            };
          }
        })
      );

      const allPlaces = [selectedItem, ...nearbyWithWeather];
      const rankedPlaces = rankPlacesByComfort(allPlaces);

      setNearbyPlacesWithWeather(nearbyWithWeather);
      setRecommendation(rankedPlaces[0] || null);
    } catch (err) {
      setError(err.message || "Failed to fetch places or weather data.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <section className="hero">
        <nav className="navbar">
          <div className="logo">🔥 HeatLab</div>
          <div className="nav-badge">Bamberg Weather Guide</div>
        </nav>

        <div className="hero-content">
          <div className="hero-text">
            <h1>Find the most comfortable place to visit in Bamberg.</h1>
            <p>
              Search a real place in Bamberg, compare nearby weather conditions,
              and get a simple comfort-based recommendation.
            </p>
          </div>

          <div className="search-card">
            <PlaceAutocomplete
              selectedPlace={selectedPlace}
              onPlaceSelected={setSelectedPlace}
            />

            <ActivityPreferenceSelect
              value={activityPreference}
              onChange={setActivityPreference}
            />

            <PlaceTypeSelect value={placeType} onChange={setPlaceType} />

            <button
              className="primary-button"
              onClick={handleFindBestPlace}
              disabled={!selectedPlace || loading}
            >
              Find Best Place
            </button>
          </div>
        </div>
      </section>

      <main className="main-container">
        {loading && <LoadingState />}

        {error && <ErrorState message={error} />}

        {!loading && selectedPlaceWeather && (
          <SelectedPlaceWeatherCard item={selectedPlaceWeather} />
        )}

        {!loading && recommendation && (
          <RecommendationCard recommendation={recommendation} />
        )}

        {!loading && nearbyPlacesWithWeather.length > 0 && (
          <>
            <NearbyPlacesList places={nearbyPlacesWithWeather} />
            <WeatherComparison
              places={[selectedPlaceWeather, ...nearbyPlacesWithWeather]}
            />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
