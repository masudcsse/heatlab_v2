export async function getNetatmoWeather(lat, lng) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

  // For a real project, create a backend endpoint:
  // GET http://localhost:5000/api/netatmo/weather?lat=...&lng=...
  // Do NOT store Netatmo client secret or access token in React.
  if (apiBaseUrl) {
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/netatmo/weather?lat=${lat}&lng=${lng}`
      );

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn("Backend/Netatmo unavailable. Using mock weather.", error);
    }
  }

  return getMockNetatmoWeather(lat, lng);
}

function getMockNetatmoWeather(lat, lng) {
  const seed = Math.abs(Math.sin(lat * 10 + lng * 10));
  const rain = seed > 0.72;

  return {
    temperature: Math.round(18 + seed * 10),
    humidity: Math.round(40 + seed * 30),
    windSpeed: Math.round(4 + seed * 18),
    pressure: Math.round(1000 + seed * 25),
    rain,
    stationId: "mock-netatmo-station",
    stationName: "Mock Netatmo Station Bamberg",
    stationDistanceKm: Number((0.3 + seed * 1.5).toFixed(2)),
    lastUpdated: new Date().toISOString(),
    source: "netatmo_mock",
  };
}
