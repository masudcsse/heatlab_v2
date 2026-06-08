import { createComfortFeatureMessages } from "../services/comfortFeaturesService";
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

function WeatherComparison({ places }) {
  return (
    <section className="section">
      <div className="section-heading">
        <h2>Weather Comparison</h2>
        <span>Selected place and nearby places</span>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Place</th>
              <th>Category</th>
              <th>Temp</th>
              <th>Humidity</th>
              <th>Pressure</th>
              <th>Rain</th>
              <th>UV</th>
              <th>Station Distance</th>
              <th>Comfort Support</th>
              <th>Recommendation</th>
            </tr>
          </thead>

          <tbody>
            {places.map((item) => (
              <tr key={item.place.googlePlaceId}>
                <td>{item.place.name}</td>
                <td>{item.place.category}</td>
                <td>{item.weather ? `${item.weather.temperature}°C` : "N/A"}</td>
                <td>{item.weather ? `${item.weather.humidity}%` : "N/A"}</td>
                <td>{item.weather ? `${item.weather.pressure} hPa` : "N/A"}</td>
                <td>{item.weather ? (item.weather.rain ? "Yes" : "No") : "N/A"}</td>
                <td>{formatUv(item)}</td>
                <td>
                  {item.weather ? `${item.weather.stationDistanceKm} km` : "N/A"}
                </td>
                <td>{formatSupportSummary(item)}</td>
                <td>{formatRecommendation(item)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatUv(item) {
  const uv = item.weather?.uvIndex;

  if (uv == null) return "N/A";

  return `${uv} (${getUvLabel(uv)})`;
}

function formatRecommendation(item) {
  const recommendation = getComfortRecommendation(item.comfortScore);

  return (
    <span className={`badge badge-${recommendation.tone}`}>
      {formatComfortRecommendationLabel(item.comfortScore)}
    </span>
  );
}

function formatSupportSummary(item) {
  if (item.comfortFeatureLookupError) {
    return "Feature lookup unavailable";
  }

  const messages = createComfortFeatureMessages(item.comfortFeatures);

  if (messages.length === 0) return "N/A";

  return messages.join(" | ");
}

export default WeatherComparison;