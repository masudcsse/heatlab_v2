import { loadDotEnv } from "./env.js";
import {
  getHistoricalWeatherComparison,
  getHistoricalWeatherOptions,
} from "./historicalWeather.js";

const DEFAULT_PORT = 5000;
const DEFAULT_RADIUS_KM = 10;
const TOKEN_URL = "https://api.netatmo.com/oauth2/token";
const DEFAULT_PUBLIC_DATA_URL = "https://api.netatmo.com/api/getpublicdata";
const NETATMO_FETCH_TIMEOUT_MS = 12_000;

loadDotEnv();

let cachedAccessToken = process.env.NETATMO_ACCESS_TOKEN || "";
let cachedRefreshToken = process.env.NETATMO_REFRESH_TOKEN || "";
let accessTokenExpiresAt = cachedAccessToken ? Date.now() + 45 * 60 * 1000 : 0;

export async function handleNetatmoRequest(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (requestUrl.pathname === "/api/health") {
      sendJson(response, 200, { ok: true, service: "heatlab-api" });
      return;
    }

    if (requestUrl.pathname === "/api/historical-weather/options") {
      const options = await getHistoricalWeatherOptions();
      sendJson(response, 200, options);
      return;
    }

    if (requestUrl.pathname === "/api/historical-weather/compare") {
      const comparison = await getHistoricalWeatherComparison(requestUrl.searchParams);
      sendJson(response, 200, comparison);
      return;
    }

    if (requestUrl.pathname === "/api/netatmo/weather") {
      const lat = Number(requestUrl.searchParams.get("lat"));
      const lng = Number(requestUrl.searchParams.get("lng"));

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        sendJson(response, 400, { error: "lat and lng query params are required." });
        return;
      }

      const weather = await getNetatmoPublicWeather(lat, lng);
      sendJson(response, 200, weather);
      return;
    }

    if (requestUrl.pathname === "/api/netatmo/stations") {
      const lat = Number(requestUrl.searchParams.get("lat"));
      const lng = Number(requestUrl.searchParams.get("lng"));
      const radiusKm = normalizeRadiusKm(
        requestUrl.searchParams.get("radiusKm") || DEFAULT_RADIUS_KM
      );

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        sendJson(response, 400, { error: "lat and lng query params are required." });
        return;
      }

      const stations = await getNetatmoPublicStations(lat, lng, radiusKm);
      sendJson(response, 200, {
        center: { lat, lng },
        radiusKm,
        count: stations.length,
        stationIds: stations.map((station) => station.stationId),
        stations,
      });
      return;
    }

    sendJson(response, 404, { error: "Route not found." });
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      error: error.message || "Netatmo request failed.",
    });
  }
}

export function getServerPort() {
  return Number(process.env.PORT || DEFAULT_PORT);
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

export async function getNetatmoPublicWeather(lat, lng) {
  const radiusKm = normalizeRadiusKm(
    process.env.NETATMO_SEARCH_RADIUS_KM || DEFAULT_RADIUS_KM
  );
  const nearest = (await getNetatmoPublicStations(lat, lng, radiusKm))
    .filter((station) => station && Number.isFinite(station.temperature))
    .sort((a, b) => a.stationDistanceKm - b.stationDistanceKm)[0];

  if (!nearest) {
    throw createHttpError("No public Netatmo temperature station found near this place.", 404);
  }

  return nearest;
}

export async function getNetatmoPublicStations(lat, lng, radiusKm = DEFAULT_RADIUS_KM) {
  const searchRadiusKm = normalizeRadiusKm(radiusKm);
  const stations = await fetchNetatmoPublicStationPayload(lat, lng, searchRadiusKm);

  return stations
    .map((station) => normalizeStation(station, lat, lng))
    .filter(Boolean)
    .filter((station) => station.stationDistanceKm <= searchRadiusKm)
    .sort((a, b) => a.stationDistanceKm - b.stationDistanceKm);
}

async function fetchNetatmoPublicStationPayload(lat, lng, radiusKm) {
  const accessToken = await getAccessToken();
  const bounds = getBounds(lat, lng, radiusKm);
  const url = new URL(process.env.NETATMO_PUBLIC_DATA_URL || DEFAULT_PUBLIC_DATA_URL);

  url.searchParams.set("lat_ne", String(bounds.latNe));
  url.searchParams.set("lon_ne", String(bounds.lonNe));
  url.searchParams.set("lat_sw", String(bounds.latSw));
  url.searchParams.set("lon_sw", String(bounds.lonSw));
  url.searchParams.set("required_data", "temperature");
  url.searchParams.set("filter", "true");

  const response = await fetchWithTimeout(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  }).catch((error) => {
    throw createHttpError(
      `Unable to reach Netatmo public data API: ${formatFetchError(error)}`,
      502
    );
  });

  const payload = await readJsonResponse(response);

  if (!response.ok || payload.status === "error") {
    throw createHttpError(
      payload.error?.message || payload.error || "Netatmo public weather request failed.",
      response.status || 502
    );
  }

  return Array.isArray(payload.body) ? payload.body : [];
}

export async function getAccessToken() {
  if (cachedAccessToken && Date.now() < accessTokenExpiresAt - 60_000) {
    return cachedAccessToken;
  }

  const clientId = process.env.NETATMO_CLIENT_ID;
  const clientSecret = process.env.NETATMO_CLIENT_SECRET;

  if (!clientId || !clientSecret || !cachedRefreshToken) {
    throw createHttpError(
      "Missing Netatmo credentials. Set NETATMO_CLIENT_ID, NETATMO_CLIENT_SECRET, and NETATMO_REFRESH_TOKEN in .env.",
      500
    );
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: cachedRefreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetchWithTimeout(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  }).catch((error) => {
    throw createHttpError(
      `Unable to reach Netatmo token API: ${formatFetchError(error)}`,
      502
    );
  });

  const payload = await readJsonResponse(response);

  if (!response.ok || !payload.access_token) {
    throw createHttpError(
      payload.error_description || payload.error || "Netatmo token refresh failed.",
      response.status || 502
    );
  }

  cachedAccessToken = payload.access_token;
  cachedRefreshToken = payload.refresh_token || cachedRefreshToken;
  accessTokenExpiresAt = Date.now() + Number(payload.expires_in || payload.expire_in || 3600) * 1000;

  return cachedAccessToken;
}

async function readJsonResponse(response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || response.statusText };
  }
}

function normalizeStation(station, targetLat, targetLng) {
  const location = station?.place?.location;
  if (!Array.isArray(location) || location.length < 2) return null;

  const stationLng = Number(location[0]);
  const stationLat = Number(location[1]);
  const measurements = extractMeasurements(station.measures || {});

  if (!Number.isFinite(stationLat) || !Number.isFinite(stationLng)) return null;

  return {
    temperature: measurements.temperature,
    humidity: measurements.humidity,
    windSpeed: measurements.windSpeed ?? 0,
    pressure: measurements.pressure,
    rain: Boolean((measurements.rain60min ?? 0) > 0 || (measurements.rain24h ?? 0) > 0),
    stationId: station._id || "netatmo-public-station",
    stationName: station._id ? `Netatmo station ${station._id}` : "Netatmo public station",
    stationDistanceKm: Number(distanceKm(targetLat, targetLng, stationLat, stationLng).toFixed(2)),
    stationLat,
    stationLng,
    lastUpdated: measurements.lastUpdated
      ? new Date(measurements.lastUpdated * 1000).toISOString()
      : new Date().toISOString(),
    source: "netatmo_public",
  };
}

function extractMeasurements(measures) {
  const output = {
    temperature: undefined,
    humidity: undefined,
    pressure: undefined,
    windSpeed: undefined,
    rain60min: undefined,
    rain24h: undefined,
    lastUpdated: 0,
  };

  Object.values(measures).forEach((measure) => {
    if (!measure || typeof measure !== "object") return;

    if (Number.isFinite(measure.rain_60min)) output.rain60min = measure.rain_60min;
    if (Number.isFinite(measure.rain_24h)) output.rain24h = measure.rain_24h;
    if (Number.isFinite(measure.wind_strength)) output.windSpeed = measure.wind_strength;

    const types = Array.isArray(measure.type) ? measure.type : [];
    const latest = getLatestMeasurement(measure.res);
    if (!latest) return;

    output.lastUpdated = Math.max(output.lastUpdated, latest.timestamp);

    types.forEach((type, index) => {
      const key = normalizeMeasureType(type);
      const value = Number(latest.values[index]);
      if (!Number.isFinite(value)) return;

      if (key === "temperature") output.temperature = value;
      if (key === "humidity") output.humidity = value;
      if (key === "pressure") output.pressure = Math.round(value);
      if (key === "wind" || key === "windstrength") output.windSpeed = value;
      if (key === "rain") output.rain60min = value;
    });
  });

  return output;
}

function getLatestMeasurement(res) {
  if (!res || typeof res !== "object") return null;

  return Object.entries(res)
    .map(([timestamp, values]) => ({
      timestamp: Number(timestamp),
      values: Array.isArray(values) ? values : [],
    }))
    .filter((entry) => Number.isFinite(entry.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp)[0];
}

function normalizeMeasureType(type) {
  return String(type).toLowerCase().replace(/[_\s-]/g, "");
}

function getBounds(lat, lng, radiusKm) {
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));

  return {
    latNe: clamp(lat + latDelta, -85, 85),
    lonNe: clamp(lng + lngDelta, -180, 180),
    latSw: clamp(lat - latDelta, -85, 85),
    lonSw: clamp(lng - lngDelta, -180, 180),
  };
}

function normalizeRadiusKm(value) {
  const radiusKm = Number(value);

  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 50) {
    throw createHttpError("radiusKm must be a number greater than 0 and at most 50.", 400);
  }

  return radiusKm;
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NETATMO_FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function formatFetchError(error) {
  const cause = error?.cause;
  const parts = [
    error?.message,
    cause?.code,
    cause?.hostname,
    cause?.address,
    cause?.port,
  ].filter(Boolean);

  return parts.join(" | ") || "network request failed";
}
