import ComfortFeatureSummary from "./ComfortFeatureSummary";
import {
  formatComfortRecommendationLabel,
  getComfortRecommendation,
} from "../utils/comfortScore";

function getUvLabel(uv) {
  if (uv == null) return "Unavailable";
  if (uv <= 2) return "Low";
  if (uv <= 5) return "Moderate";
  if (uv <= 7) return "High";
  if (uv <= 10) return "Very High";
  return "Extreme";
}

function SelectedPlaceWeatherCard({ item }) {
  if (!item) return null;

  const recommendation = getComfortRecommendation(item.comfortScore);

  return (
    <section className="section">
      <div className="section-heading">
        <h2>Selected Place Weather</h2>
        <span>{item.weather?.source || "No weather source"}</span>
      </div>

      <div className="result-card">
        <h3>{item.place.name}</h3>
        <p>{item.place.address}</p>

        {item.weather ? (
          <div className="metrics-grid">
            <div>
              <span>Temperature</span>
              <strong>{item.weather.temperature}°C</strong>
            </div>

            <div>
              <span>Humidity</span>
              <strong>{item.weather.humidity}%</strong>
            </div>

            <div>
              <span>Pressure</span>
              <strong>{item.weather.pressure} hPa</strong>
            </div>

            <div>
              <span>Rain</span>
              <strong>{item.weather.rain ? "Yes" : "No"}</strong>
            </div>

            <div>
              <span>UV Index</span>
              <strong>
                {item.weather.uvIndex != null
                  ? `${item.weather.uvIndex} (${getUvLabel(item.weather.uvIndex)})`
                  : "Unavailable"}
              </strong>
            </div>

            <div className={`recommendation-metric recommendation-${recommendation.tone}`}>
              <span>Recommendation</span>
              <strong>{formatComfortRecommendationLabel(item.comfortScore)}</strong>
              <small>{recommendation.summary}</small>
            </div>
          </div>
        ) : (
          <p>No Netatmo weather data available.</p>
        )}

        <ComfortFeatureSummary item={item} showMap />

        <p className="reason-text">{item.suitabilityReason}</p>
      </div>
    </section>
  );
}

export default SelectedPlaceWeatherCard;