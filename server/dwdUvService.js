const DWD_URL =
  "https://opendata.dwd.de/climate_environment/health/alerts/uvi.json";

export async function getUvForecast() {
  const response = await fetch(DWD_URL);

  if (!response.ok) {
    throw new Error("Failed to fetch DWD UV data");
  }

  const data = await response.json();

  const nuremberg = data.content.find((item) => item.city === "Nürnberg");

  if (!nuremberg) {
    throw new Error("Nürnberg UV forecast not found");
  }

  return {
    uvIndex: nuremberg.forecast.today,
    uvTomorrow: nuremberg.forecast.tomorrow,
    uvDayAfter: nuremberg.forecast.dayafter_to,
    source: "DWD UV forecast using Nürnberg regional data",
  };
}