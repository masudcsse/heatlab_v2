import { createComfortFeatureMessages } from "../services/comfortFeaturesService";

function ComfortFeatureSummary({ item }) {
  const messages = item?.comfortFeatureLookupError
    ? []
    : createComfortFeatureMessages(item?.comfortFeatures);

  if (messages.length === 0 && !item?.comfortFeatureLookupError) {
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
    </div>
  );
}

export default ComfortFeatureSummary;
