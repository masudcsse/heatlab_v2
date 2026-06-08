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

function NearbyPlacesList({ places }) {
  return (
    <section className="section">
      <div className="section-heading">
        <h2>Nearby Places Within 2 KM</h2>
        <span>Discovered using Google Places API</span>
      </div>

      {places.length === 0 ? (
        <div className="state-card">
          <p>No nearby places found for the selected filters.</p>
        </div>
      ) : (
        <div className="places-grid">
          {places.map((item) => {
            const recommendation = getComfortRecommendation(item.comfortScore);

            return (
              <div className="place-card" key={item.place.googlePlaceId}>
                <h3>{item.place.name}</h3>
                <p>{item.place.address}</p>

                <div className="badge-row">
                  <span className="badge badge-blue">{item.place.category}</span>
                  <span className={`badge badge-${recommendation.tone}`}>
                    {formatComfortRecommendationLabel(item.comfortScore)}
                  </span>
                </div>

                {item.weather ? (
                  <div className="metrics-grid">
                    <div>
                      <span>Temp</span>
                      <strong>{item.weather.temperature}°C</strong>
                    </div>

                    <div>
                      <span>Humidity</span>
                      <strong>{item.weather.humidity}%</strong>
                    </div>

                    <div>
                      <span>Rain</span>
                      <strong>{item.weather.rain ? "Yes" : "No"}</strong>
                    </div>

                    <div>
                      <span>UV</span>
                      <strong>
                        {item.weather.uvIndex != null
                          ? `${item.weather.uvIndex} (${getUvLabel(
                              item.weather.uvIndex
                            )})`
                          : "N/A"}
                      </strong>
                    </div>
                  </div>
                ) : (
                  <p>No weather data available.</p>
                )}

                <ComfortFeatureSummary item={item} />

                <p className="reason-text">{item.suitabilityReason}</p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default NearbyPlacesList;
