import { getAccessToken, getNetatmoPublicWeather } from "./netatmoServer.js";

const BAMBERG_CENTER = {
  lat: 49.8988,
  lng: 10.9028,
};

async function runNetatmoCredentialTest() {
  const shouldCheckWeather = process.argv.includes("--weather");
  const missingKeys = [
    "NETATMO_CLIENT_ID",
    "NETATMO_CLIENT_SECRET",
    "NETATMO_REFRESH_TOKEN",
  ].filter((key) => !process.env[key]);

  if (missingKeys.length > 0) {
    throw new Error(`Missing required .env keys: ${missingKeys.join(", ")}`);
  }

  console.log("Checking Netatmo token refresh...");
  const accessToken = await getAccessToken();

  if (!accessToken || accessToken.length < 20) {
    throw new Error("Netatmo token refresh returned an invalid access token.");
  }

  console.log("Token refresh succeeded.");
  console.log("Netatmo credentials are valid.");

  if (!shouldCheckWeather) {
    return;
  }

  console.log("Checking public weather lookup near Bamberg...");

  const weather = await getNetatmoPublicWeather(BAMBERG_CENTER.lat, BAMBERG_CENTER.lng);

  console.log("Weather lookup succeeded.");
  console.log(
    JSON.stringify(
      {
        source: weather.source,
        temperature: weather.temperature,
        humidity: weather.humidity,
        pressure: weather.pressure,
        windSpeed: weather.windSpeed,
        rain: weather.rain,
        stationDistanceKm: weather.stationDistanceKm,
        lastUpdated: weather.lastUpdated,
      },
      null,
      2
    )
  );
}

runNetatmoCredentialTest().catch((error) => {
  console.error(`Netatmo credential test failed: ${error.message}`);
  process.exitCode = 1;
});
