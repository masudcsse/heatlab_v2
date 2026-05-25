import ComfortFeatureSummary from "./ComfortFeatureSummary";

function RecommendationCard({ recommendation }) {
  if (!recommendation) return null;

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
            <span className="badge badge-blue">
              Score: {recommendation.comfortScore}/100
            </span>
          </div>

          <ComfortFeatureSummary item={recommendation} />

          <p>{recommendation.suitabilityReason}</p>
        </div>
      </div>
    </section>
  );
}

export default RecommendationCard;
