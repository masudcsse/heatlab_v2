import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const MARKER_CONFIG = {
  selected: {
    label: "Selected place",
    shortLabel: "P",
    className: "selected",
  },
  water: {
    label: "Drinking water",
    shortLabel: "W",
    className: "water",
  },
  shade: {
    label: "Shade / green support",
    shortLabel: "S",
    className: "shade",
  },
  indoor: {
    label: "Indoor backup",
    shortLabel: "I",
    className: "indoor",
  },
};

function ComfortSupportMap({ item }) {
  const markers = useMemo(() => buildMarkers(item), [item]);

  if (!item?.place || markers.length <= 1) {
    return null;
  }

  const center = [item.place.lat, item.place.lng];

  return (
    <div className="comfort-map-panel">
      <div className="comfort-map-header">
        <span>Comfort support map</span>
        <small>OpenStreetMap + Google Places</small>
      </div>

      <MapContainer
        center={center}
        zoom={16}
        scrollWheelZoom={false}
        className="comfort-support-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitMapToMarkers markers={markers} />

        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={[marker.lat, marker.lng]}
            icon={createMarkerIcon(marker.category)}
          >
            <Popup>
              <strong>{marker.name}</strong>
              <br />
              {MARKER_CONFIG[marker.category]?.label || marker.category}
              {marker.distanceLabel && (
                <>
                  <br />
                  Distance: {marker.distanceLabel}
                </>
              )}
              {marker.source && (
                <>
                  <br />
                  Source: {formatSource(marker.source)}
                </>
              )}
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <div className="comfort-map-legend">
        {Object.entries(MARKER_CONFIG).map(([key, config]) => (
          <span key={key}>
            <i className={`comfort-map-dot comfort-map-dot-${config.className}`} />
            {config.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function FitMapToMarkers({ markers }) {
  const map = useMap();

  useEffect(() => {
    const positions = markers.map((marker) => [marker.lat, marker.lng]);

    if (positions.length > 1) {
      map.fitBounds(L.latLngBounds(positions), {
        padding: [28, 28],
        maxZoom: 17,
      });
    }
  }, [map, markers]);

  return null;
}

function buildMarkers(item) {
  if (!hasValidCoordinates(item?.place)) return [];

  const selectedMarker = {
    id: "selected-place",
    name: item.place.name,
    category: "selected",
    lat: item.place.lat,
    lng: item.place.lng,
    distanceLabel: "Selected location",
    source: item.place.source,
  };

  const featureMarkers = [
    ...(item.comfortFeatureCandidates || []),
    item.comfortFeatures?.water,
    item.comfortFeatures?.shade,
    item.comfortFeatures?.indoor,
  ]
    .filter(Boolean)
    .filter(hasValidCoordinates)
    .map((feature) => ({
      id:
        feature.id ||
        `${feature.category}-${feature.lat.toFixed(5)}-${feature.lng.toFixed(5)}`,
      name: feature.name || "Comfort support",
      category: normalizeCategory(feature.category),
      lat: feature.lat,
      lng: feature.lng,
      distanceKm: feature.distanceKm,
      distanceLabel: formatDistance(feature.distanceKm),
      source: feature.source,
    }))
    .filter((feature) => feature.category !== "selected");

  const uniqueFeatures = dedupeMarkers(featureMarkers)
    .sort((a, b) => Number(a.distanceKm || 0) - Number(b.distanceKm || 0))
    .slice(0, 24);

  return [selectedMarker, ...uniqueFeatures];
}

function createMarkerIcon(category) {
  const config = MARKER_CONFIG[category] || MARKER_CONFIG.selected;

  return L.divIcon({
    className: "comfort-map-marker",
    html: `<span class="comfort-map-pin comfort-map-pin-${config.className}">${config.shortLabel}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
  });
}

function dedupeMarkers(markers) {
  const seen = new Set();

  return markers.filter((marker) => {
    const key = marker.id || `${marker.category}-${marker.lat}-${marker.lng}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasValidCoordinates(value) {
  return Number.isFinite(value?.lat) && Number.isFinite(value?.lng);
}

function normalizeCategory(category) {
  if (category === "water" || category === "shade" || category === "indoor") {
    return category;
  }

  return "selected";
}

function formatDistance(distanceKm) {
  const distance = Number(distanceKm);

  if (!Number.isFinite(distance)) return "";
  if (distance < 0.01) return "at this place";
  if (distance < 1) return `${Math.round(distance * 1000)} m away`;

  return `${distance.toFixed(1)} km away`;
}

function formatSource(source) {
  if (source === "openstreetmap") return "OpenStreetMap";
  if (source === "google_places") return "Google Places";

  return source || "Unknown";
}

export default ComfortSupportMap;
