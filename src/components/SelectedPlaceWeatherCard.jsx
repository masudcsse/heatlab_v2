import ComfortFeatureSummary from "./ComfortFeatureSummary";

function SelectedPlaceWeatherCard({ item }) {
  if (!item) return null;

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
              <span>Wind</span>
              <strong>{item.weather.windSpeed} km/h</strong>
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
              <span>Comfort</span>
              <strong>{item.comfortScore}/100</strong>
            </div>
          </div>
        ) : (
          <p>No Netatmo weather data available.</p>
        )}

        <ComfortFeatureSummary item={item} />

        <p className="reason-text">{item.suitabilityReason}</p>
      </div>
    </section>
  );
}

export default SelectedPlaceWeatherCard;
