export async function getHistoricalWeatherOptions() {
  return fetchHistoricalWeather("/api/historical-weather/options");
}

export async function getHistoricalWeatherComparison({
  metric,
  station,
  date,
  rangeDays,
  resolution = "hourly",
  lat,
  lng,
}) {
  const params = new URLSearchParams();

  params.set("metric", metric);
  params.set("rangeDays", String(rangeDays));
  params.set("resolution", resolution);

  if (date) {
    params.set("date", date);
  }

  if (station && station !== "all") {
    params.set("station", station);
  }

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    params.set("lat", String(lat));
    params.set("lng", String(lng));
  }

  return fetchHistoricalWeather(`/api/historical-weather/compare?${params}`);
}

async function fetchHistoricalWeather(path) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

  if (!apiBaseUrl) {
    throw new Error(
      "Historical weather backend is not configured. Set VITE_API_BASE_URL=http://localhost:5000 and start npm run api."
    );
  }

  try {
    const response = await fetch(new URL(path, apiBaseUrl));
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 404 && payload.error === "Route not found.") {
        throw new Error(
          "Historical weather route was not found. Restart the backend with npm run api so it loads the latest historical comparison endpoints."
        );
      }

      throw new Error(payload.error || "Historical weather request failed.");
    }

    return payload;
  } catch (error) {
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      throw new Error(
        `Historical weather backend is not reachable at ${apiBaseUrl}. Start it with "npm run api" and keep it running while using the app.`
      );
    }

    throw error;
  }
}
