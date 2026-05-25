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
import HistoricalWeatherComparison from "./components/HistoricalWeatherComparison";

import { detectPlaceCategory, getNearbyPlaces } from "./services/googlePlacesService";
import { getNetatmoWeather } from "./services/netatmoService";
import {
  calculateDistanceKm,
  fetchNearbyComfortFeatures,
  getComfortFeatureSummary,
} from "./services/comfortFeaturesService";
import {
  calculateComfortScore,
  inferComfortNeeds,
  rankPlacesByComfort,
  satisfiesRequiredComfortPreference,
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
      const selectedPlaceForScoring = {
        ...selectedPlace,
        category:
          selectedPlace.category || detectPlaceCategory(selectedPlace.types || []),
        distanceFromSelectedKm: 0,
      };

      // 1. Fetch weather for the selected place.
      const selectedWeather = await getNetatmoWeather(
        selectedPlaceForScoring.lat,
        selectedPlaceForScoring.lng
      );
      const comfortNeeds = inferComfortNeeds(activityPreference, selectedWeather);

      // 2. Discover nearby places within 2 KM using Google Places API.
      let nearbyPlaces = [];

      try {
        nearbyPlaces = await getNearbyPlaces(
          selectedPlace.lat,
          selectedPlace.lng,
          2,
          placeType
        );
        nearbyPlaces = nearbyPlaces.map((place) => ({
          ...place,
          distanceFromSelectedKm: Number(
            calculateDistanceKm(
              selectedPlace.lat,
              selectedPlace.lng,
              place.lat,
              place.lng
            ).toFixed(2)
          ),
        }));
      } catch (err) {
        const selectedScoreResult = calculateComfortScore(
          selectedPlaceForScoring,
          selectedWeather,
          activityPreference,
          placeType,
          { comfortNeeds, distanceFromSelectedKm: 0 }
        );
        const selectedItem = {
          place: {
            ...selectedPlaceForScoring,
            distanceFromSelectedKm: 0,
          },
          weather: selectedWeather,
          comfortNeeds,
          comfortFeatures: null,
          comfortFeatureLookupError: null,
          comfortScore: selectedScoreResult.score,
          suitabilityReason: selectedScoreResult.reason,
          errors: [],
        };

        setSelectedPlaceWeather(selectedItem);
        setRecommendation(selectedItem);
        setError(
          `Selected place weather loaded from Netatmo, but nearby Google Places comparison failed: ${
            err.message || "Unknown nearby places error."
          }`
        );
        return;
      }

      // 3. Fetch public comfort features once, then match the nearest feature
      // to each candidate place. This keeps Overpass traffic small.
      const featureLookup = await fetchNearbyComfortFeatures(
        selectedPlace.lat,
        selectedPlace.lng,
        comfortNeeds
      );
      const allCandidatePlaces = [
        {
          ...selectedPlaceForScoring,
        },
        ...nearbyPlaces,
      ];
      const indoorCandidates = allCandidatePlaces.filter(
        (place) => place.category === "indoor"
      );
      const selectedComfortFeatures = getComfortFeatureSummary(
        selectedPlaceForScoring,
        comfortNeeds,
        featureLookup.features,
        indoorCandidates
      );
      const selectedMapFeatures = buildComfortMapFeatures(
        selectedPlaceForScoring,
        featureLookup.features,
        indoorCandidates,
        comfortNeeds
      );
      const selectedScoreResult = calculateComfortScore(
        selectedPlaceForScoring,
        selectedWeather,
        activityPreference,
        placeType,
        {
          comfortNeeds,
          featureSummary: selectedComfortFeatures,
          distanceFromSelectedKm: 0,
        }
      );

      const selectedItem = {
        place: {
          ...selectedPlaceForScoring,
        },
        weather: selectedWeather,
        comfortNeeds,
        comfortFeatures: selectedComfortFeatures,
        comfortFeatureCandidates: selectedMapFeatures,
        comfortFeatureLookupError: featureLookup.error,
        comfortScore: selectedScoreResult.score,
        suitabilityReason: selectedScoreResult.reason,
        errors: [],
      };

      setSelectedPlaceWeather(selectedItem);

      // 4. Fetch weather for each nearby place and calculate enhanced comfort scores.
      const nearbyWithWeather = await Promise.all(
        nearbyPlaces.map(async (place) => {
          try {
            const weather = await getNetatmoWeather(place.lat, place.lng);
            const featureSummary = getComfortFeatureSummary(
              place,
              comfortNeeds,
              featureLookup.features,
              indoorCandidates
            );

            const scoreResult = calculateComfortScore(
              place,
              weather,
              activityPreference,
              placeType,
              {
                comfortNeeds,
                featureSummary,
                distanceFromSelectedKm: place.distanceFromSelectedKm,
              }
            );

            return {
              place,
              weather,
              comfortNeeds,
              comfortFeatures: featureSummary,
              comfortFeatureLookupError: featureLookup.error,
              comfortScore: scoreResult.score,
              suitabilityReason: scoreResult.reason,
              errors: [],
            };
          } catch (err) {
            return {
              place,
              weather: null,
              comfortNeeds,
              comfortFeatures: getComfortFeatureSummary(
                place,
                comfortNeeds,
                featureLookup.features,
                indoorCandidates
              ),
              comfortFeatureLookupError: featureLookup.error,
              comfortScore: null,
              suitabilityReason: "No Netatmo weather data available for this place.",
              errors: [err.message],
            };
          }
        })
      );

      const recommendableNearby = nearbyWithWeather.filter(
        satisfiesRequiredComfortPreference
      );
      const recommendableSelected = satisfiesRequiredComfortPreference(selectedItem)
        ? [selectedItem]
        : [];
      const allPlaces = [...recommendableSelected, ...recommendableNearby];
      const rankedPlaces = rankPlacesByComfort(allPlaces);

      setNearbyPlacesWithWeather(recommendableNearby);
      setRecommendation(rankedPlaces[0] || null);
      if (rankedPlaces.length === 0 && comfortNeeds.any) {
        setError(
          getNoPreferenceMatchMessage(activityPreference)
        );
      }
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

        <HistoricalWeatherComparison
          selectedPlace={selectedPlace}
          currentWeather={selectedPlaceWeather?.weather || null}
        />

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

function getNoPreferenceMatchMessage(activityPreference) {
  if (activityPreference === "Shaded Area") {
    return "No nearby recommendation matched the Shaded Area preference. The selected place weather is shown, but places without shade or green support were excluded from recommendations.";
  }

  if (activityPreference === "Nearby Drinking Water") {
    return "No nearby recommendation matched the Nearby Drinking Water preference. The selected place weather is shown, but places without public drinking water were excluded from recommendations.";
  }

  if (activityPreference === "Indoor Activity") {
    return "No nearby recommendation matched the Indoor Activity preference. The selected place weather is shown, but places without indoor backup were excluded from recommendations.";
  }

  return "No nearby recommendation matched the selected activity preference.";
}

function buildComfortMapFeatures(
  selectedPlace,
  osmFeatures = [],
  indoorCandidates = [],
  comfortNeeds = {}
) {
  const features = [...(osmFeatures || [])];

  if (comfortNeeds.indoor) {
    const indoorFeatures = (indoorCandidates || [])
      .filter((candidate) => candidate.googlePlaceId !== selectedPlace.googlePlaceId)
      .filter((candidate) => Number.isFinite(candidate.lat) && Number.isFinite(candidate.lng))
      .map((candidate) => ({
        id: candidate.googlePlaceId,
        name: candidate.name,
        type: "indoor_place",
        category: "indoor",
        lat: candidate.lat,
        lng: candidate.lng,
        distanceKm: Number(
          calculateDistanceKm(
            selectedPlace.lat,
            selectedPlace.lng,
            candidate.lat,
            candidate.lng
          ).toFixed(2)
        ),
        source: candidate.source || "google_places",
      }));

    features.push(...indoorFeatures);
  }

  return features;
}

export default App;
