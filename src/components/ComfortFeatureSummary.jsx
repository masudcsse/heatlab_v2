import { createComfortFeatureMessages } from "../services/comfortFeaturesService";
import ComfortSupportMap from "./ComfortSupportMap";

function ComfortFeatureSummary({ item, showMap = false }) {
  const messages = item?.comfortFeatureLookupError
    ? []
    : createComfortFeatureMessages(item?.comfortFeatures);
  const hasMapData =
    showMap &&
    item?.place &&
    (item?.comfortFeatureCandidates?.length > 0 ||
      item?.comfortFeatures?.water ||
      item?.comfortFeatures?.shade ||
      item?.comfortFeatures?.indoor);

  if (messages.length === 0 && !item?.comfortFeatureLookupError && !hasMapData) {
    return null;
  }

  return (
    <div className="comfort-feature-box">
      <strong>Nearby comfort support</strong>

      {messages.length > 0 && (
        <ul>
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      {item?.comfortFeatureLookupError && (
        <p>{item.comfortFeatureLookupError}</p>
      )}

      {hasMapData && <ComfortSupportMap item={item} />}
    </div>
  );
}

export default ComfortFeatureSummary;
