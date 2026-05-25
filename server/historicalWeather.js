import { createDbError, queryDb } from "./db.js";

const MAX_RANGE_DAYS = 45;

const METRIC_DEFINITIONS = [
  {
    id: "temperature",
    column: "ta",
    label: "Temperature",
    unit: "\u00b0C",
    netatmoField: "temperature",
  },
  {
    id: "humidity",
    column: "humidity",
    label: "Humidity",
    unit: "%",
    netatmoField: "humidity",
  },
];

export async function getHistoricalWeatherOptions() {
  const [columnsResult, stationsResult, rangeResult] = await Promise.all([
    queryDb(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'measurements'
      `
    ),
    queryDb(
      `
        SELECT
          station,
          AVG(lat)::float AS lat,
          AVG(lon)::float AS lng,
          MIN(time) AS first_observation,
          MAX(time) AS last_observation,
          COUNT(*)::int AS records
        FROM public.measurements
        GROUP BY station
        ORDER BY station
      `
    ),
    queryDb(
      `
        SELECT
          MIN(time) AS first_observation,
          MAX(time) AS last_observation
        FROM public.measurements
      `
    ),
  ]);

  const columns = new Set(columnsResult.rows.map((row) => row.column_name));
  const metrics = METRIC_DEFINITIONS.filter((metric) =>
    columns.has(metric.column)
  ).map(({ column, ...metric }) => metric);

  return {
    metrics,
    stations: stationsResult.rows.map((station) => ({
      id: station.station,
      name: station.station,
      lat: station.lat,
      lng: station.lng,
      firstObservation: station.first_observation,
      lastObservation: station.last_observation,
      records: station.records,
    })),
    dateRange: {
      min: rangeResult.rows[0]?.first_observation || null,
      max: rangeResult.rows[0]?.last_observation || null,
    },
  };
}

export async function getHistoricalWeatherComparison(searchParams) {
  const options = await getHistoricalWeatherOptions();
  const metricId = searchParams.get("metric") || "temperature";
  const metric = getMetric(metricId, options.metrics);
  const requestedStation = normalizeStation(searchParams.get("station"));
  const selectedCoordinates = getSelectedCoordinates(searchParams);
  const stationDetails = getSelectedStation(searchParams, options.stations);
  const station = requestedStation || stationDetails?.id || null;
  const rangeDays = normalizeRangeDays(searchParams.get("rangeDays"));
  const resolution = normalizeResolution(searchParams.get("resolution"), rangeDays);
  const baseDate = normalizeDate(
    searchParams.get("date"),
    options.dateRange.max ? new Date(options.dateRange.max) : new Date()
  );

  const basePeriod = buildPeriod(baseDate, rangeDays);
  const labelsByKey = new Map();
  const series = [];

  for (const yearOffset of [0, 1, 2, 3]) {
    const periodStart = shiftDateByYears(basePeriod.start, yearOffset);
    const periodEnd = shiftDateByYears(basePeriod.endExclusive, yearOffset);
    const targetYear = periodStart.getUTCFullYear();
    const seriesStationDetails =
      requestedStation || !selectedCoordinates
        ? stationDetails
        : await getNearestStationWithData({
            stations: options.stations,
            lat: selectedCoordinates.lat,
            lng: selectedCoordinates.lng,
            column: metric.column,
            periodStart,
            periodEnd,
          });
    const seriesStation = requestedStation || seriesStationDetails?.id || station;
    const rows = await queryMetricRows({
      column: metric.column,
      periodStart,
      periodEnd,
      station: seriesStation,
      resolution,
    });

    const points = rows.map((row) => {
      const originalTime = new Date(row.time);
      const alignedAt = new Date(
        basePeriod.start.getTime() + (originalTime.getTime() - periodStart.getTime())
      );
      const alignedKey = alignedAt.toISOString();

      if (!labelsByKey.has(alignedKey)) {
        labelsByKey.set(alignedKey, {
          key: alignedKey,
          label: formatAlignedLabel(alignedAt, rangeDays),
        });
      }

      return {
        alignedAt: alignedKey,
        originalTime: originalTime.toISOString(),
        value: roundMetric(row.value),
        sampleCount: Number(row.sample_count || 0),
      };
    });

    series.push({
      yearOffset,
      year: targetYear,
      label: getSeriesLabel(yearOffset, targetYear),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      station: seriesStation || "all",
      stationDetails: seriesStationDetails,
      hasData: points.length > 0,
      points,
    });
  }

  return {
    metric: {
      id: metric.id,
      label: metric.label,
      unit: metric.unit,
      netatmoField: metric.netatmoField,
    },
    station: station || "all",
    stationDetails,
    rangeDays,
    resolution,
    baseDate: baseDate.toISOString().slice(0, 10),
    basePeriod: {
      start: basePeriod.start.toISOString(),
      end: basePeriod.endExclusive.toISOString(),
    },
    labels: Array.from(labelsByKey.values()).sort((a, b) =>
      a.key.localeCompare(b.key)
    ),
    series,
  };
}

async function queryMetricRows({
  column,
  periodStart,
  periodEnd,
  station,
  resolution,
}) {
  const bucketExpression =
    resolution === "raw" ? "time" : "date_trunc('hour', time)";

  // The metric column and bucket expression are selected only from server-side
  // allow-lists above. User-provided values stay in SQL parameters.
  const result = await queryDb(
    `
      SELECT
        ${bucketExpression} AS time,
        AVG("${column}")::float AS value,
        COUNT(*)::int AS sample_count
      FROM public.measurements
      WHERE time >= $1
        AND time < $2
        AND "${column}" IS NOT NULL
        AND ($3::text IS NULL OR station = $3)
      GROUP BY ${bucketExpression}
      ORDER BY ${bucketExpression}
    `,
    [periodStart.toISOString(), periodEnd.toISOString(), station]
  );

  return result.rows;
}

function getMetric(metricId, availableMetrics) {
  const availableIds = new Set(availableMetrics.map((metric) => metric.id));
  const metric = METRIC_DEFINITIONS.find(
    (definition) => definition.id === metricId && availableIds.has(metricId)
  );

  if (!metric) {
    throw createDbError(`Unsupported historical weather metric: ${metricId}.`, 400);
  }

  return metric;
}

function normalizeStation(station) {
  if (!station || station === "all") return null;
  return station;
}

function getSelectedCoordinates(searchParams) {
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function getSelectedStation(searchParams, stations) {
  const requestedStation = normalizeStation(searchParams.get("station"));

  if (requestedStation) {
    const station = stations.find((item) => item.id === requestedStation);
    return station ? { ...station, distanceKm: null } : null;
  }

  const coordinates = getSelectedCoordinates(searchParams);

  if (!coordinates) {
    return null;
  }

  const nearest = stations
    .filter((station) => Number.isFinite(station.lat) && Number.isFinite(station.lng))
    .map((station) => ({
      ...station,
      distanceKm: Number(
        distanceKm(coordinates.lat, coordinates.lng, station.lat, station.lng).toFixed(2)
      ),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];

  return nearest || null;
}

async function getNearestStationWithData({
  stations,
  lat,
  lng,
  column,
  periodStart,
  periodEnd,
}) {
  // For a selected place, pick the nearest station that actually has records in
  // that year's shifted period. This avoids drawing only one year when the
  // nearest physical station has gaps for older years.
  const result = await queryDb(
    `
      SELECT station, COUNT(*)::int AS records
      FROM public.measurements
      WHERE time >= $1
        AND time < $2
        AND "${column}" IS NOT NULL
      GROUP BY station
    `,
    [periodStart.toISOString(), periodEnd.toISOString()]
  );

  const recordsByStation = new Map(
    result.rows.map((row) => [row.station, Number(row.records || 0)])
  );

  const nearest = stations
    .filter((station) => recordsByStation.has(station.id))
    .filter((station) => Number.isFinite(station.lat) && Number.isFinite(station.lng))
    .map((station) => ({
      ...station,
      recordsInPeriod: recordsByStation.get(station.id),
      distanceKm: Number(distanceKm(lat, lng, station.lat, station.lng).toFixed(2)),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];

  return nearest || null;
}

function normalizeRangeDays(value) {
  const rangeDays = Number(value || 7);

  if (!Number.isInteger(rangeDays) || rangeDays < 1 || rangeDays > MAX_RANGE_DAYS) {
    throw createDbError(
      `rangeDays must be a whole number between 1 and ${MAX_RANGE_DAYS}.`,
      400
    );
  }

  return rangeDays;
}

function normalizeResolution(value, rangeDays) {
  if (value === "raw" && rangeDays <= 7) return "raw";
  return "hourly";
}

function normalizeDate(value, fallbackDate) {
  const dateValue = value || fallbackDate.toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    throw createDbError("date must use YYYY-MM-DD format.", 400);
  }

  const date = new Date(`${dateValue}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw createDbError("date must be a valid calendar date.", 400);
  }

  return date;
}

function buildPeriod(endDateInclusive, rangeDays) {
  const endExclusive = addDays(endDateInclusive, 1);

  return {
    start: addDays(endExclusive, -rangeDays),
    endExclusive,
  };
}

function shiftDateByYears(date, yearsAgo) {
  const shifted = new Date(date);
  shifted.setUTCFullYear(shifted.getUTCFullYear() - yearsAgo);
  return shifted;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getSeriesLabel(yearOffset, year) {
  if (yearOffset === 0) return `${year} current year`;
  if (yearOffset === 1) return `${year} previous year`;
  return `${year} ${yearOffset} years ago`;
}

function formatAlignedLabel(date, rangeDays) {
  const month = date.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");

  if (rangeDays > 14) {
    return `${month} ${day}`;
  }

  return `${month} ${day}, ${hour}:00`;
}

function roundMetric(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Number(number.toFixed(2));
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}
