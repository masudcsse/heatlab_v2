import { useEffect, useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";

import { getHistoricalWeatherComparison } from "../services/historicalWeatherService";
import { getNetatmoWeather } from "../services/netatmoService";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

const DEFAULT_METRIC = "temperature";
const DEFAULT_RANGE_DAYS = 7;
const SERIES_COLORS = ["#ff684f", "#2563eb", "#16a34a", "#9333ea"];

function HistoricalWeatherComparison({ selectedPlace, currentWeather }) {
  const [comparison, setComparison] = useState(null);
  const [liveWeather, setLiveWeather] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [liveWeatherError, setLiveWeatherError] = useState("");

  useEffect(() => {
    if (!selectedPlace) {
      setComparison(null);
      setLiveWeather(null);
      setError("");
      setLiveWeatherError("");
      setLoading(false);
      return;
    }

    let isActive = true;

    async function loadSelectedPlaceComparison() {
      try {
        setLoading(true);
        setError("");
        setLiveWeatherError("");

        const comparisonBaseTime = new Date().toISOString();
        const comparisonRequest = getHistoricalWeatherComparison({
          metric: DEFAULT_METRIC,
          rangeDays: DEFAULT_RANGE_DAYS,
          resolution: "raw",
          baseTime: comparisonBaseTime,
          lat: selectedPlace.lat,
          lng: selectedPlace.lng,
        });

        const liveWeatherRequest = currentWeather
          ? Promise.resolve(currentWeather)
          : getNetatmoWeather(selectedPlace.lat, selectedPlace.lng);

        const [comparisonResult, liveWeatherResult] = await Promise.allSettled([
          comparisonRequest,
          liveWeatherRequest,
        ]);

        if (!isActive) return;

        if (comparisonResult.status === "fulfilled") {
          setComparison(comparisonResult.value);
        } else {
          setComparison(null);
          setError(
            comparisonResult.reason?.message ||
              "Unable to load historical weather comparison."
          );
        }

        if (liveWeatherResult.status === "fulfilled") {
          setLiveWeather(liveWeatherResult.value);
        } else {
          setLiveWeather(null);
          setLiveWeatherError(
            liveWeatherResult.reason?.message ||
              "Live Netatmo weather is unavailable for this place."
          );
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    loadSelectedPlaceComparison();

    return () => {
      isActive = false;
    };
  }, [
    currentWeather,
    selectedPlace?.googlePlaceId,
    selectedPlace?.lat,
    selectedPlace?.lng,
  ]);

  const effectiveCurrentWeather = currentWeather || liveWeather;

  const chartData = useMemo(() => {
    if (!comparison) {
      return { labels: [], datasets: [] };
    }

    const labelKeys = comparison.labels.map((label) => label.key);
    const liveMetricValue = getLiveMetricValue(
      effectiveCurrentWeather,
      comparison.metric
    );

    // The API queries each calendar year separately, then maps each timestamp
    // back onto the selected current-year period so matching dates line up.
    const datasets = comparison.series.map((series, index) => {
      const valuesByAlignedTime = new Map(
        series.points.map((point) => [point.alignedAt, point.value])
      );

      return {
        label: series.label,
        data: labelKeys.map((key) => valuesByAlignedTime.get(key) ?? null),
        borderColor: SERIES_COLORS[index],
        backgroundColor: `${SERIES_COLORS[index]}1f`,
        borderWidth: 3,
        pointRadius: labelKeys.length > 120 ? 0 : 2,
        pointHoverRadius: 5,
        spanGaps: true,
        tension: 0.32,
        fill: false,
      };
    });

    if (liveMetricValue !== null && labelKeys.length > 0) {
      datasets.push({
        label: "Live Netatmo now",
        data: labelKeys.map((_, index) =>
          index === labelKeys.length - 1 ? liveMetricValue : null
        ),
        borderColor: "#0f172a",
        backgroundColor: "#0f172a",
        borderWidth: 0,
        pointRadius: 7,
        pointHoverRadius: 9,
        showLine: false,
      });
    }

    return {
      labels: comparison.labels.map((label) => label.label),
      datasets,
    };
  }, [comparison, effectiveCurrentWeather]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            boxWidth: 8,
          },
        },
        tooltip: {
          callbacks: {
            label(context) {
              const value = context.parsed.y;
              const unit = comparison?.metric?.unit || "";
              const formatted =
                typeof value === "number" ? `${value.toFixed(1)}${unit}` : "No data";

              return `${context.dataset.label}: ${formatted}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
          },
          grid: {
            display: false,
          },
        },
        y: {
          title: {
            display: true,
            text: comparison?.metric
              ? `${comparison.metric.label} (${comparison.metric.unit})`
              : "Temperature",
          },
          grid: {
            color: "#e2e8f0",
          },
        },
      },
    }),
    [comparison]
  );

  const liveMetricValue = getLiveMetricValue(
    effectiveCurrentWeather,
    comparison?.metric
  );
  const hasChartData = comparison?.series?.some((series) => series.points.length > 0);

  return (
    <section className="section history-section">
      <div className="section-heading">
        <div>
          <span className="small-label">Historical database</span>
          <h2>3-Year Weather Comparison</h2>
        </div>
        <span>From PostgreSQL netatmo_raw_db</span>
      </div>

      <div className="history-card">
        {!selectedPlace && (
          <p className="history-note">
            Select a place in the search box above to load its 7-day temperature
            comparison automatically.
          </p>
        )}

        {selectedPlace && (
          <div className="history-selected-place">
            <div>
              <span>Selected place</span>
              <strong>{selectedPlace.name}</strong>
            </div>

            {comparison?.stationDetails && (
              <div>
              <span>Nearest historical station</span>
                <strong>
                  {comparison.stationDetails.name}
                  {Number.isFinite(comparison.stationDetails.distanceKm)
                    ? ` (${comparison.stationDetails.distanceKm} km)`
                    : ""}
                </strong>
              </div>
            )}
          </div>
        )}

        {liveMetricValue !== null && (
          <div className="live-weather-pill">
            <span>Live selected-place Netatmo reading</span>
            <strong>
              {liveMetricValue}
              {comparison?.metric?.unit || "\u00b0C"}
            </strong>
          </div>
        )}

        {liveWeatherError && !loading && (
          <p className="history-note">{liveWeatherError}</p>
        )}

        {error && <p className="history-error">{error}</p>}

        {loading && (
          <p className="history-note">Loading selected-place weather comparison...</p>
        )}

        {!loading && selectedPlace && comparison && !hasChartData && (
          <p className="history-note">
            No historical database records were found for this selected place's
            nearest station and current 7-day period.
          </p>
        )}

        {!loading && hasChartData && (
          <>
            <div className="history-chart">
              <Line data={chartData} options={chartOptions} />
            </div>

            <div className="history-meta">
              <span>
                Temperature comparison for the last 7 days up to the current
                time, aligned by day and hour.
              </span>
              <span>Missing measurements are skipped.</span>
              <span>Live current weather comes from Netatmo.</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function getLiveMetricValue(currentWeather, metric) {
  if (!currentWeather || !metric?.netatmoField) return null;

  const value = Number(currentWeather[metric.netatmoField]);

  if (!Number.isFinite(value)) return null;

  return Number(value.toFixed(1));
}

export default HistoricalWeatherComparison;
