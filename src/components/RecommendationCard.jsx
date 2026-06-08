import ComfortFeatureSummary from "./ComfortFeatureSummary";
import {
  formatComfortRecommendationLabel,
  getComfortRecommendation,
} from "../utils/comfortScore";

function RecommendationCard({ recommendation }) {
  if (!recommendation) return null;

  const comfortRecommendation = getComfortRecommendation(
    recommendation.comfortScore
  );

  return (
    <section className="section">
      <div className="recommendation-card">
        <div>
          <span className="small-label">Best Recommendation</span>
          <h2>{recommendation.place.name}</h2>
          <p>{recommendation.place.address}</p>

          <div className="badge-row">
            <span className="badge badge-green">
              {recommendation.place.category}
            </span>
            <span className={`badge badge-${comfortRecommendation.tone}`}>
              {formatComfortRecommendationLabel(recommendation.comfortScore)}
            </span>
          </div>
          <p className="recommendation-summary">
            {comfortRecommendation.summary}
          </p>

          <ComfortFeatureSummary item={recommendation} />

          <p>{recommendation.suitabilityReason}</p>
        </div>
      </div>
    </section>
  );
}

export default RecommendationCard;
